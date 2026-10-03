// Long-lived Playwright driver for running a smoke test step by step.
//
// Usage (copy this file to the session scratchpad first, never into the repo):
//   SMOKE_EVIDENCE=<evidence dir> SMOKE_PLAYWRIGHT_FROM=<repo>/package.json node driver.mjs
// Then POST a JavaScript function body to it; the body runs with these in scope and its return value comes back as JSON:
//   page, context, shot(name, {fullPage, page}), consoleSince(seq, regex), sleep(ms), state, setPage(p), seqNow()
//   bash:       curl -s --max-time 600 -X POST --data-binary @- http://localhost:7799/ <<'JS' ... JS
//   PowerShell: curl.exe -s --max-time 600 -X POST --data-binary "@step.js" http://localhost:7799/
//
// Env: SMOKE_EVIDENCE (required), SMOKE_PLAYWRIGHT_FROM (a package.json that can resolve @playwright/test, default ./package.json),
// SMOKE_PROFILE_DIR (default <this dir>/pw-profile), SMOKE_DRIVER_PORT (default 7799), HEADED=1 to watch it.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// A step that leaves a promise rejecting (a waitForEvent that times out) must not kill the browser mid-run.
process.on('unhandledRejection', (e) => console.error('unhandled', String(e).slice(0, 300)));

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const evidence = process.env.SMOKE_EVIDENCE;
if (!evidence) throw new Error('Set SMOKE_EVIDENCE to the evidence folder for this run.');
fs.mkdirSync(evidence, { recursive: true });

const { chromium } = createRequire(path.resolve(process.env.SMOKE_PLAYWRIGHT_FROM ?? 'package.json'))('@playwright/test');
const context = await chromium.launchPersistentContext(process.env.SMOKE_PROFILE_DIR ?? path.join(here, 'pw-profile'), {
  headless: process.env.HEADED !== '1',
  viewport: { width: 1440, height: 900 },
  acceptDownloads: true,
});
let page = context.pages()[0] ?? (await context.newPage());

const consoleBuf = [];
let seq = 0;
const consoleFile = path.join(evidence, 'browser-console.log');
function record(type, text) {
  const line = { seq: ++seq, t: new Date().toISOString(), type, text };
  consoleBuf.push(line);
  fs.appendFileSync(consoleFile, `${line.seq} ${line.t} [${type}] ${text}\n`);
}
function attach(p) {
  p.on('console', (m) => record(m.type(), m.text()));
  p.on('pageerror', (e) => record('pageerror', String(e)));
}
context.pages().forEach(attach);
context.on('page', attach);

const shot = async (name, opts = {}) => {
  const file = path.join(evidence, `${name}.png`);
  await (opts.page ?? page).screenshot({ path: file, fullPage: opts.fullPage ?? false });
  return file;
};
const consoleSince = (s, re) => consoleBuf.filter((l) => l.seq > s && (!re || re.test(l.text)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = {};
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;

http
  .createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    res.writeHead(200, { 'content-type': 'application/json' });
    try {
      const fn = new AsyncFn('page', 'context', 'shot', 'consoleSince', 'sleep', 'state', 'setPage', 'seqNow', body);
      const out = await fn(page, context, shot, consoleSince, sleep, state, (p) => (page = p), () => seq);
      res.end(JSON.stringify({ ok: true, out }, null, 1));
    } catch (e) {
      let file = null;
      try { file = await shot(`error-${Date.now()}`); } catch { /* the page itself may be gone */ }
      res.end(JSON.stringify({ ok: false, error: String(e?.stack ?? e).slice(0, 3000), url: page.url(), screenshot: file }, null, 1));
    }
  })
  .listen(Number(process.env.SMOKE_DRIVER_PORT ?? 7799), () => console.log('driver ready'));
