import express from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import QRCode from "qrcode";
import { loadConfig } from "./config.js";
import { GENERATION_TIMEOUT_MS, isTeamId } from "./constants.js";
import { createGenerator } from "./generators/index.js";
import { Store } from "./store.js";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export async function createApp(options = {}) {
  const config = options.config || (await loadConfig(rootDir));
  const store = options.store || new Store(path.join(rootDir, "data"));
  await store.init();
  const generator =
    options.generator ||
    createGenerator(config.generator, GENERATION_TIMEOUT_MS);
  const template = await readFile(
    path.join(rootDir, "prompt-template.md"),
    "utf8",
  );
  const app = express();
  const busy = new Set();
  const consoleClients = new Set();
  const teamClients = new Map();

  app.set("trust proxy", true);
  app.use(express.json({ limit: "64kb" }));
  app.use(
    "/assets",
    (request, response, next) => {
      if (!/\.(?:css|js)$/i.test(request.path)) return response.sendStatus(404);
      next();
    },
    express.static(path.join(rootDir, "public")),
  );

  const sendEvent = (response, event, data) =>
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const broadcastConsole = (event, data) => {
    for (const client of consoleClients) sendEvent(client, event, data);
  };
  const broadcastTeam = (id, event, data) => {
    for (const client of teamClients.get(id) || [])
      sendEvent(client, event, data);
  };
  const publicBase = (request) =>
    config.publicUrl || `${request.protocol}://${request.get("host")}`;
  const authorized = (request) =>
    !config.consoleToken ||
    request.query.token === config.consoleToken ||
    request.get("x-console-token") === config.consoleToken;
  const protect = (request, response, next) =>
    authorized(request)
      ? next()
      : response.status(401).send("コンソール用トークンが必要です");

  app.get("/", (_request, response) => response.redirect("/console"));
  app.get("/console", protect, (_request, response) =>
    response.sendFile(path.join(rootDir, "public", "console.html")),
  );
  app.use("/api", protect);

  app.get("/api/state", async (_request, response, next) => {
    try {
      response.json({ ...(await store.getState()), busy: [...busy] });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/events", (request, response) => {
    response.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    response.flushHeaders();
    consoleClients.add(response);
    sendEvent(response, "connected", {});
    request.on("close", () => consoleClients.delete(response));
  });
  app.get("/api/teams/:id/qr", async (request, response, next) => {
    try {
      if (!isTeamId(request.params.id)) return response.sendStatus(404);
      const svg = await QRCode.toString(
        `${publicBase(request)}/t/${request.params.id}/`,
        {
          type: "svg",
          margin: 1,
          width: 220,
          color: { dark: "#14113a", light: "#ffffff" },
        },
      );
      response.type("image/svg+xml").send(svg);
    } catch (error) {
      next(error);
    }
  });
  app.patch("/api/teams/:id", async (request, response, next) => {
    try {
      if (!isTeamId(request.params.id)) return response.sendStatus(404);
      const name = String(request.body.name || "")
        .trim()
        .slice(0, 24);
      const emoji = String(request.body.emoji || "")
        .trim()
        .slice(0, 8);
      if (!name || !emoji)
        return response
          .status(400)
          .json({ error: "チーム名と絵文字を入力してください" });
      const meta = await store.updateMeta(request.params.id, { name, emoji });
      broadcastConsole("team", meta);
      response.json(meta);
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/teams/:id/generate", async (request, response, next) => {
    const id = request.params.id;
    try {
      if (!isTeamId(id)) return response.sendStatus(404);
      const prompt = String(request.body.prompt || "").trim();
      const mode = request.body.mode === "new" ? "new" : "edit";
      if (!prompt || prompt.length > 4000)
        return response
          .status(400)
          .json({ error: "1〜4000文字の注文を入力してください" });
      if (busy.has(id))
        return response.status(409).json({ error: "このチームは考え中です" });
      busy.add(id);
      const requestId = crypto.randomUUID();
      const entry = {
        id: requestId,
        v: null,
        prompt,
        reply: "",
        timestamp: new Date().toISOString(),
        status: "generating",
        mode,
      };
      await store.addHistory(id, entry);
      broadcastConsole("history", { teamId: id, entry });
      response.status(202).json({ requestId });

      void (async () => {
        try {
          const team = await store.getTeam(id);
          const baseHtml = mode === "edit" ? await store.readCurrent(id) : "";
          const result = await generator({
            systemTemplate: template,
            mode,
            baseHtml,
            prompt,
          });
          const version = team.version + 1;
          await store.publish(id, version, result.html);
          const completed = await store.updateHistory(id, requestId, {
            v: version,
            reply: result.reply,
            status: "completed",
          });
          broadcastConsole("history", { teamId: id, entry: completed });
          broadcastConsole("version", { teamId: id, version });
          broadcastTeam(id, "version", { version });
        } catch (error) {
          const message =
            error.code === "ENOENT"
              ? `生成CLI「${config.generator}」が見つかりません`
              : error.message;
          const failed = await store.updateHistory(id, requestId, {
            reply: message,
            status: "failed",
          });
          broadcastConsole("history", { teamId: id, entry: failed });
        } finally {
          busy.delete(id);
          broadcastConsole("busy", { teamId: id, busy: false });
        }
      })();
    } catch (error) {
      busy.delete(id);
      next(error);
    }
  });

  app.get("/t/:id/", async (request, response) => {
    if (!isTeamId(request.params.id)) return response.sendStatus(404);
    response.sendFile(path.join(rootDir, "public", "student.html"));
  });
  app.get("/t/:id/app", async (request, response, next) => {
    try {
      if (!isTeamId(request.params.id)) return response.sendStatus(404);
      const html = await store.readCurrent(request.params.id);
      if (!html) return response.status(404).send("まだアプリはありません");
      response
        .set({
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'self' 'unsafe-inline' data: blob:; connect-src 'none'; frame-ancestors 'self'",
        })
        .type("html")
        .send(html);
    } catch (error) {
      next(error);
    }
  });
  app.get("/t/:id/state", async (request, response, next) => {
    try {
      if (!isTeamId(request.params.id)) return response.sendStatus(404);
      const team = await store.getTeam(request.params.id);
      response.json({
        version: team.version,
        name: team.name,
        emoji: team.emoji,
      });
    } catch (error) {
      next(error);
    }
  });
  app.get("/t/:id/events", (request, response) => {
    const id = request.params.id;
    if (!isTeamId(id)) return response.sendStatus(404);
    response.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    response.flushHeaders();
    if (!teamClients.has(id)) teamClients.set(id, new Set());
    teamClients.get(id).add(response);
    sendEvent(response, "connected", {});
    request.on("close", () => teamClients.get(id)?.delete(response));
  });

  app.use((error, _request, response, _next) => {
    console.error(error);
    if (!response.headersSent)
      response.status(500).json({ error: "サーバーでエラーが起きました" });
  });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = await loadConfig(rootDir);
  const app = await createApp({ config });
  app.listen(config.port, () =>
    console.log(`Magic Workshop: http://localhost:${config.port}/console`),
  );
}
