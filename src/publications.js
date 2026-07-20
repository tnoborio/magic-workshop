import crypto from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const PUBLICATION_ID = /^\d{8}-team[1-4]-v\d+-[a-f0-9]{8}$/;

function tokyoDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}${value("month")}${value("day")}`;
}

export function isPublicationId(value) {
  return PUBLICATION_ID.test(String(value || ""));
}

export class PublicationStore {
  constructor(directory, options = {}) {
    this.directory = directory;
    this.now = options.now || (() => new Date());
    this.randomBytes = options.randomBytes || crypto.randomBytes;
  }

  async init() {
    await mkdir(this.directory, { recursive: true });
  }

  async publish({ team, html }) {
    if (!team?.id || !team?.version)
      throw new Error("公開できる作品がありません");
    if (!/^\s*<!doctype html>/i.test(html) || !/<html[\s>]/i.test(html)) {
      throw new Error("作品HTMLが壊れているため保存できません");
    }

    await this.init();
    const createdAt = this.now();
    let id;
    let temporaryDirectory;
    let finalDirectory;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = this.randomBytes(4).toString("hex");
      id = `${tokyoDateKey(createdAt)}-${team.id}-v${team.version}-${suffix}`;
      temporaryDirectory = path.join(this.directory, `.tmp-${id}`);
      finalDirectory = path.join(this.directory, id);
      try {
        await mkdir(temporaryDirectory);
        break;
      } catch (error) {
        if (error.code !== "EEXIST" || attempt === 4) throw error;
      }
    }

    const publication = {
      id,
      teamId: team.id,
      teamName: team.name,
      emoji: team.emoji,
      sourceVersion: team.version,
      createdAt: createdAt.toISOString(),
    };

    try {
      await Promise.all([
        writeFile(path.join(temporaryDirectory, "index.html"), html),
        writeFile(
          path.join(temporaryDirectory, "meta.json"),
          JSON.stringify(publication, null, 2),
        ),
      ]);
      await rename(temporaryDirectory, finalDirectory);
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      throw error;
    }

    return publication;
  }

  async readHtml(id) {
    if (!isPublicationId(id))
      throw Object.assign(new Error("Invalid publication id"), {
        code: "ENOENT",
      });
    return readFile(path.join(this.directory, id, "index.html"), "utf8");
  }
}
