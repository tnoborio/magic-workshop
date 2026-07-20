import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../src/store.js";

test("initializes four teams and publishes version atomically", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "magic-store-"));
  const store = new Store(dir);
  await store.init();
  const state = await store.getState();
  assert.equal(state.teams.length, 4);
  assert.equal(state.teams[0].version, 0);
  const html = "<!doctype html><html><body>hello</body></html>";
  await store.publish("team1", 1, html);
  assert.equal(await store.readCurrent("team1"), html);
  assert.equal(
    await readFile(path.join(dir, "team1", "v1.html"), "utf8"),
    html,
  );
  assert.equal((await store.getTeam("team1")).version, 1);
});

test("creates and updates history entries", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "magic-store-"));
  const store = new Store(dir);
  await store.init();
  await store.addHistory("team2", { id: "abc", status: "generating" });
  await store.updateHistory("team2", "abc", { status: "completed", v: 1 });
  assert.deepEqual((await store.getTeam("team2")).history[0], {
    id: "abc",
    status: "completed",
    v: 1,
  });
});

test("records immutable publication metadata per team", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "magic-store-"));
  const store = new Store(dir);
  await store.init();
  const publication = {
    id: "20260720-team1-v1-aabbccdd",
    url: "https://works.sasara.io/20260720-team1-v1-aabbccdd/",
  };
  await store.addPublication("team1", publication);
  assert.deepEqual((await store.getTeam("team1")).publications, [publication]);
  assert.deepEqual(
    JSON.parse(
      await readFile(path.join(dir, "team1", "publications.json"), "utf8"),
    ),
    [publication],
  );
});
