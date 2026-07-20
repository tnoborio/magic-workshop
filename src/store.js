import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { TEAM_COLORS, TEAM_COUNT, isTeamId } from "./constants.js";

const EMOJIS = ["🚀", "🐉", "🌈", "🪄"];

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function atomicWrite(file, contents) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, contents);
  await rename(temp, file);
}

export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
  }
  teamDir(id) {
    if (!isTeamId(id)) throw new Error("Invalid team id");
    return path.join(this.dataDir, id);
  }
  async init() {
    await mkdir(this.dataDir, { recursive: true });
    for (let index = 0; index < TEAM_COUNT; index++) {
      const id = `team${index + 1}`;
      const dir = this.teamDir(id);
      await mkdir(dir, { recursive: true });
      const metaPath = path.join(dir, "meta.json");
      const existing = await readJson(metaPath, null);
      if (!existing)
        await atomicWrite(
          metaPath,
          JSON.stringify(
            {
              id,
              name: `チーム${index + 1}`,
              emoji: EMOJIS[index],
              color: TEAM_COLORS[index],
              version: 0,
            },
            null,
            2,
          ),
        );
      const historyPath = path.join(dir, "history.json");
      const history = await readJson(historyPath, null);
      if (!history) await atomicWrite(historyPath, "[]");
      const publicationsPath = path.join(dir, "publications.json");
      const publications = await readJson(publicationsPath, null);
      if (!publications) await atomicWrite(publicationsPath, "[]");
    }
  }
  async getTeam(id) {
    const dir = this.teamDir(id);
    const [meta, history, publications] = await Promise.all([
      readJson(path.join(dir, "meta.json"), null),
      readJson(path.join(dir, "history.json"), []),
      readJson(path.join(dir, "publications.json"), []),
    ]);
    if (!meta) throw new Error("Team not initialized");
    return { ...meta, history, publications };
  }
  async getState() {
    return {
      teams: await Promise.all(
        Array.from({ length: TEAM_COUNT }, (_, i) =>
          this.getTeam(`team${i + 1}`),
        ),
      ),
    };
  }
  async updateMeta(id, updates) {
    const team = await this.getTeam(id);
    const meta = {
      id: team.id,
      name: team.name,
      emoji: team.emoji,
      color: team.color,
      version: team.version,
      ...updates,
    };
    await atomicWrite(
      path.join(this.teamDir(id), "meta.json"),
      JSON.stringify(meta, null, 2),
    );
    return meta;
  }
  async addHistory(id, entry) {
    const team = await this.getTeam(id);
    team.history.push(entry);
    await atomicWrite(
      path.join(this.teamDir(id), "history.json"),
      JSON.stringify(team.history, null, 2),
    );
    return entry;
  }
  async updateHistory(id, requestId, updates) {
    const team = await this.getTeam(id);
    const entry = team.history.find((item) => item.id === requestId);
    if (!entry) throw new Error("History entry not found");
    Object.assign(entry, updates);
    await atomicWrite(
      path.join(this.teamDir(id), "history.json"),
      JSON.stringify(team.history, null, 2),
    );
    return entry;
  }
  async addPublication(id, publication) {
    const team = await this.getTeam(id);
    team.publications.push(publication);
    await atomicWrite(
      path.join(this.teamDir(id), "publications.json"),
      JSON.stringify(team.publications, null, 2),
    );
    return publication;
  }
  async readCurrent(id) {
    try {
      return await readFile(
        path.join(this.teamDir(id), "current.html"),
        "utf8",
      );
    } catch (error) {
      if (error.code === "ENOENT") return "";
      throw error;
    }
  }
  async publish(id, version, html) {
    const dir = this.teamDir(id);
    await atomicWrite(path.join(dir, `v${version}.html`), html);
    await atomicWrite(path.join(dir, "current.html"), html);
    return this.updateMeta(id, { version });
  }
}
