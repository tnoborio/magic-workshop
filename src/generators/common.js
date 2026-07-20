import { spawn } from 'node:child_process';

export function runCommand(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`生成が${Math.round(timeoutMs / 1000)}秒でタイムアウトしました`));
    }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `${command}が終了コード${code}で失敗しました`));
    });
  });
}

export function buildPrompt({ systemTemplate, mode, baseHtml, prompt }) {
  const context = mode === 'edit' && baseHtml
    ? `\n\n現在のHTMLを、依頼に沿って編集してください。\n\n<current_html>\n${baseHtml}\n</current_html>`
    : '\n\n新しいアプリを最初から作ってください。';
  return `${systemTemplate}${context}\n\n<request>\n${prompt}\n</request>`;
}

export function parseOutput(output) {
  const match = output.match(/```html\s*([\s\S]*?)```/i);
  if (!match) throw new Error('AIの返答からHTMLコードを読み取れませんでした');
  const html = match[1].trim();
  if (!/^<!doctype html/i.test(html) || !/<html[\s>]/i.test(html) || !/<\/html>\s*$/i.test(html)) {
    throw new Error('AIが完全なHTMLファイルを返しませんでした');
  }
  const reply = output.slice(match.index + match[0].length).trim().split(/\r?\n/).find(Boolean);
  if (!reply) throw new Error('AIの返答に説明文がありませんでした');
  return { html, reply: reply.replace(/^[-–—]\s*/, '').slice(0, 300) };
}
