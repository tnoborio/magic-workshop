import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isPublicationId, PublicationStore } from "../src/publications.js";

test("publishes an immutable HTML snapshot with metadata", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "magic-publications-"));
  const store = new PublicationStore(dir, {
    now: () => new Date("2026-07-19T15:30:00.000Z"),
    randomBytes: () => Buffer.from("aabbccdd", "hex"),
  });
  const html = "<!doctype html><html><body>完成版</body></html>";
  const publication = await store.publish({
    team: { id: "team3", name: "虹", emoji: "🌈", version: 4 },
    html,
  });
  assert.equal(publication.id, "20260720-team3-v4-aabbccdd");
  assert.equal(isPublicationId(publication.id), true);
  assert.equal(
    await readFile(path.join(dir, publication.id, "index.html"), "utf8"),
    html,
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(path.join(dir, publication.id, "meta.json"), "utf8"),
    ),
    publication,
  );
  assert.equal(await store.readHtml(publication.id), html);
});

test("rejects missing or malformed source HTML", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "magic-publications-"));
  const store = new PublicationStore(dir);
  await assert.rejects(
    () => store.publish({ team: { id: "team1", version: 0 }, html: "" }),
    /公開できる作品/,
  );
  await assert.rejects(
    () =>
      store.publish({
        team: { id: "team1", version: 1 },
        html: "<div>fragment</div>",
      }),
    /壊れている/,
  );
});
