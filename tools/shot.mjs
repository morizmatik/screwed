// Снимок страницы (по умолчанию 1280×800) в Chrome без окна – через протокол отладки, чтобы задать язык
// и при надобности нажать кнопку перед снимком (например, «Загрузить демо-проект» у Mixtake).
//   node tools/shot.mjs <адрес> <файл.png> [--lang=en] [--click=<css-селектор>] [--eval=<код JS>] [--wait=<мс>] [--size=1200x630]
// --eval выполняется в странице после загрузки (например, подменить подпись чужой обложки на другой язык).
// Нужен Google Chrome (CHROME – другой путь) и Node 22+ (встроенный WebSocket).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [url, out, ...rest] = process.argv.slice(2);
if (!url || !out) { console.error('node tools/shot.mjs <адрес> <файл.png> [--lang=en] [--click=sel] [--wait=мс]'); process.exit(2); }
const opt = Object.fromEntries(rest.map(a => a.replace(/^--/, '').split(/=(.*)/s).slice(0, 2)));
const lang = opt.lang || 'en';
const wait = Number(opt.wait || 2500);
const [W, H] = (opt.size || '1280x800').split('x').map(Number);

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'shot-'));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`, `--lang=${lang}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const done = code => { try { chrome.kill(); } catch (e) {} setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch (e) {} process.exit(code); }, 300); };
setTimeout(() => { console.error('FAIL (время вышло)', out); done(1); }, 60000);

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch (e) {}
}
if (!target) { console.error('FAIL (Chrome не ответил)', out); done(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method) events.push(m.method);
});
const send = (method, params = {}) => new Promise(r => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setLocaleOverride', { locale: lang });
await send('Network.enable');
await send('Network.setUserAgentOverride', { userAgent: (await send('Browser.getVersion')).result.userAgent.replace('HeadlessChrome', 'Chrome'), acceptLanguage: lang });
// navigator.language и languages – тоже нужный язык (приложения выбирают по ним язык интерфейса)
await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(navigator,'language',{get:()=>${JSON.stringify(lang)}});Object.defineProperty(navigator,'languages',{get:()=>[${JSON.stringify(lang)}]});` });
await send('Page.navigate', { url });
for (let i = 0; i < 150 && !events.includes('Page.loadEventFired'); i++) await sleep(100);
await sleep(800);
if (opt.click) {
  const r = await send('Runtime.evaluate', { expression: `(() => { const b = document.querySelector(${JSON.stringify(opt.click)}); if (b) b.click(); return !!b; })()`, returnByValue: true });
  if (!r.result?.result?.value) console.error('нет кнопки', opt.click);
}
if (opt.eval) {
  const r = await send('Runtime.evaluate', { expression: opt.eval, awaitPromise: true });
  if (r.result?.exceptionDetails) console.error('ошибка в --eval', r.result.exceptionDetails.exception?.description || '');
}
await sleep(wait);
const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
done(0);
