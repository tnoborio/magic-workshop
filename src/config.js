import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadConfig(rootDir) {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(
      await readFile(path.join(rootDir, "config.json"), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return {
    generator: process.env.GENERATOR || fileConfig.generator || "claude",
    port: Number(process.env.PORT || fileConfig.port || 3000),
    consoleToken: process.env.CONSOLE_TOKEN ?? fileConfig.consoleToken ?? "",
    publicUrl: (process.env.PUBLIC_URL || fileConfig.publicUrl || "").replace(
      /\/$/,
      "",
    ),
    publishDir: path.resolve(
      process.env.PUBLISH_DIR ||
        fileConfig.publishDir ||
        path.join(rootDir, "published"),
    ),
    publishBaseUrl: (
      process.env.PUBLISH_BASE_URL ||
      fileConfig.publishBaseUrl ||
      ""
    ).replace(/\/$/, ""),
  };
}
