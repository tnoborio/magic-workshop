import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/server.js";
import { PublicationStore } from "../src/publications.js";
import { Store } from "../src/store.js";

test("publishes the current team version and serves the fixed snapshot", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "magic-server-data-"));
  const publishDir = await mkdtemp(
    path.join(os.tmpdir(), "magic-server-published-"),
  );
  const store = new Store(dataDir);
  await store.init();
  const html = "<!doctype html><html><body>この時点</body></html>";
  await store.publish("team1", 1, html);
  const publications = new PublicationStore(publishDir, {
    now: () => new Date("2026-07-19T15:30:00.000Z"),
    randomBytes: () => Buffer.from("11223344", "hex"),
  });
  const app = await createApp({
    config: {
      generator: "claude",
      port: 0,
      consoleToken: "",
      publicUrl: "",
      publishDir,
      publishBaseUrl: "https://works.sasara.io",
    },
    store,
    publications,
    generator: async () => ({ html, reply: "ok" }),
  });
  const server = await new Promise((resolve) => {
    const value = app.listen(0, "127.0.0.1", () => resolve(value));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${base}/api/teams/team1/publish`, {
    method: "POST",
  });
  assert.equal(response.status, 201);
  const publication = await response.json();
  assert.equal(
    publication.url,
    "https://works.sasara.io/20260720-team1-v1-11223344/",
  );
  assert.equal((await store.getTeam("team1")).publications.length, 1);

  const snapshot = await fetch(`${base}/published/${publication.id}/`);
  assert.equal(snapshot.status, 200);
  assert.equal(await snapshot.text(), html);
  assert.equal(
    snapshot.headers.get("x-robots-tag"),
    "noindex, nofollow, noarchive",
  );
});

test("selects the generation backend for each request", async (t) => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "magic-server-data-"));
  const publishDir = await mkdtemp(
    path.join(os.tmpdir(), "magic-server-published-"),
  );
  const store = new Store(dataDir);
  const used = [];
  const result = (name) => async () => {
    used.push(name);
    return {
      html: `<!doctype html><html><body>${name}</body></html>`,
      reply: `${name}で作成`,
    };
  };
  const app = await createApp({
    config: {
      generator: "claude",
      port: 0,
      consoleToken: "",
      publicUrl: "",
      publishDir,
      publishBaseUrl: "",
    },
    store,
    generators: { claude: result("claude"), codex: result("codex") },
  });
  const server = await new Promise((resolve) => {
    const value = app.listen(0, "127.0.0.1", () => resolve(value));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const state = await (await fetch(`${base}/api/state`)).json();
  assert.deepEqual(state.generators, {
    default: "claude",
    available: ["claude", "codex"],
  });

  const response = await fetch(`${base}/api/teams/team1/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "Codexで作って",
      mode: "new",
      generator: "codex",
    }),
  });
  assert.equal(response.status, 202);
  const { requestId } = await response.json();
  let entry;
  for (let attempt = 0; attempt < 20; attempt++) {
    entry = (await store.getTeam("team1")).history.find(
      (item) => item.id === requestId,
    );
    if (entry?.status !== "generating") break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(entry.status, "completed");
  assert.equal(entry.generator, "codex");
  assert.deepEqual(used, ["codex"]);

  for (const generator of ["unknown", "toString"]) {
    const invalid = await fetch(`${base}/api/teams/team2/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "作って", generator }),
    });
    assert.equal(invalid.status, 400);
  }
});
