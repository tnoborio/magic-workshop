import test from "node:test";
import assert from "node:assert/strict";
import { buildPrompt, parseOutput } from "../src/generators/common.js";

test("parses fenced complete HTML and reply", () => {
  const result = parseOutput(
    "```html\n<!doctype html><html><body>魔法</body></html>\n```\nゲームを作ったよ！",
  );
  assert.match(result.html, /魔法/);
  assert.equal(result.reply, "ゲームを作ったよ！");
});

test("rejects malformed generator output", () => {
  assert.throws(() => parseOutput("<html></html>"), /読み取れません/);
  assert.throws(
    () => parseOutput("```html\n<div>fragment</div>\n```\n説明"),
    /完全なHTML/,
  );
});

test("edit prompt includes previous HTML while new prompt does not", () => {
  const base = "<!doctype html><html></html>";
  assert.match(
    buildPrompt({
      systemTemplate: "rules",
      mode: "edit",
      baseHtml: base,
      prompt: "青く",
    }),
    /current_html/,
  );
  assert.doesNotMatch(
    buildPrompt({
      systemTemplate: "rules",
      mode: "new",
      baseHtml: base,
      prompt: "青く",
    }),
    /current_html/,
  );
});
