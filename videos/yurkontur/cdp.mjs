// Минимальный клиент Chrome DevTools Protocol без зависимостей (Node 22: глобальный WebSocket).
// Браузер — chrome-headless-shell Remotion (env.manifest.json → remotion_browser, или REMOTION_BROWSER_EXECUTABLE).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function browserPath(root) {
  if (process.env.REMOTION_BROWSER_EXECUTABLE) return process.env.REMOTION_BROWSER_EXECUTABLE;
  const p = join(root, 'node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell');
  if (!existsSync(p)) throw new Error(`Нет chrome-headless-shell: ${p} (npx remotion browser ensure или REMOTION_BROWSER_EXECUTABLE)`);
  return p;
}

export async function launch(root, { width = 1280, height = 720, scale = 1.5 } = {}) {
  const port = 9300 + Math.floor((process.pid % 500));
  const proc = spawn(browserPath(root), [`--remote-debugging-port=${port}`, '--headless', '--no-first-run', '--hide-scrollbars', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  let list = null;
  for (let i = 0; i < 100 && !list; i++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch {}
  }
  const page = list?.find((x) => x.type === 'page');
  if (!page) throw new Error('CDP: страница браузера не найдена');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('CDP evaluate: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
    return r.result.value;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const goto = async (url, waitMs = 1500) => { await send('Page.navigate', { url }); await sleep(waitMs); };
  const shot = async (clip) => Buffer.from((await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) })).data, 'base64');
  const close = () => { try { ws.close(); } catch {} proc.kill(); };
  return { send, evaluate, goto, shot, sleep, close };
}
