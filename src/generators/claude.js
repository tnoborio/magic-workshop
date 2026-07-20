import { buildPrompt, parseOutput, runCommand } from './common.js';

export async function generate(input, timeoutMs) {
  const output = await runCommand('claude', ['-p', buildPrompt(input), '--output-format', 'text'], timeoutMs);
  return parseOutput(output);
}
