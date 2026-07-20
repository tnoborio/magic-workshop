import { buildPrompt, parseOutput, runCommand } from './common.js';

export async function generate(input, timeoutMs) {
  const output = await runCommand('codex', ['exec', '--skip-git-repo-check', '--color', 'never', buildPrompt(input)], timeoutMs);
  return parseOutput(output);
}
