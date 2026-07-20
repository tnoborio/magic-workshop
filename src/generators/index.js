import { generate as claude } from './claude.js';
import { generate as codex } from './codex.js';

const backends = { claude, codex };

export function createGenerator(name, timeoutMs) {
  const backend = backends[name];
  if (!backend) throw new Error(`未対応の生成バックエンドです: ${name}`);
  return input => backend(input, timeoutMs);
}
