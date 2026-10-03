// Builds the shareable evidence page for a smoke-test run from its report and evidence folder.
// Usage: node build-evidence-page.mjs <report.md> <evidence dir> <shots dir (from shrink-shots)> <out.html>
// The report must follow template-run-report.md: a "## Step results" table and the named sections below.
// Evidence files are matched to a step by their stepNN- prefix; anything else is listed under "Other evidence".
// Publish the page with its shots as supporting files at img/<name>.jpg (the Artifact tool's `files` with `root`).
import fs from 'node:fs';
import path from 'node:path';

const [reportPath, evidence, shotsDir, outHtml] = process.argv.slice(2);
if (!outHtml) throw new Error('Usage: node build-evidence-page.mjs <report.md> <evidence dir> <shots dir> <out.html>');

const md = fs.readFileSync(reportPath, 'utf8');
const lines = md.split(/\r?\n/);
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

const heading = (lines.find((l) => l.startsWith('# ')) ?? '# Smoke run').slice(2);
const subject = heading.replace(/^Smoke test run:\s*/i, '');
const version = (subject.match(/v\d+(\.\d+)+/) ?? [subject.split(/\s+/).slice(0, 3).join(' ')])[0];

const rows = lines.filter((l) => /^\| \d+ \|/.test(l)).map((l) => {
  const c = l.split(' | ').map((x) => x.replace(/^\| |\s\|$/g, ''));
  return { n: Number(c[0]), title: c[1], result: c[2].replace(/\*\*/g, ''), notes: c.slice(3).join(' | ') };
});
if (!rows.length) throw new Error('No step rows found: the report needs the "## Step results" table from template-run-report.md.');

const kind = (r) => {
  if (/^FAIL/.test(r)) return 'fail';
  if (/^NOT RUN/.test(r) || (/INFO/.test(r) && !/PASS/.test(r))) return 'na';
  if (/LOCAL/.test(r)) return 'local';
  if (/\(/.test(r)) return 'dev';
  return 'pass';
};

const files = fs.readdirSync(evidence).filter((f) => !f.startsWith('error-'));
const used = new Set();
const pad = (n) => String(n).padStart(2, '0');
const textFile = (f) => {
  let body = fs.readFileSync(path.join(evidence, f), 'utf8');
  if (body.length > 6000) body = `${body.slice(0, 6000)}\n... (trimmed; full file in the evidence folder)`;
  return `<div class="log"><div class="logname">${esc(f)}</div><pre>${esc(body.trim())}</pre></div>`;
};
const shotsFor = (list) => list.filter((f) => f.endsWith('.png')).map((f) => {
  const jpg = f.replace(/\.png$/, '.jpg');
  return `<figure><button class="shot" type="button" data-src="img/${jpg}" aria-label="Open ${esc(jpg)} full size"><img src="img/${jpg}" alt="${esc(jpg)}" loading="lazy"></button><figcaption>${esc(f.replace(/\.png$/, ''))}</figcaption></figure>`;
}).join('');
const textsFor = (list) => list.filter((f) => /\.(txt|json|csv|log|sql)$/.test(f) && f !== 'browser-console.log').map(textFile).join('');

const counts = { pass: 0, dev: 0, fail: 0, local: 0, na: 0 };
const steps = rows.map((r) => {
  const k = kind(r.result);
  counts[k]++;
  const mine = files.filter((f) => f.startsWith(`step${pad(r.n)}-`)).sort();
  mine.forEach((f) => used.add(f));
  const shots = shotsFor(mine);
  const texts = textsFor(mine);
  const none = shots || texts ? '' : '<p class="muted">No files for this step; the result rests on the notes above.</p>';
  return `<details class="step k-${k}" data-k="${k}"${k === 'fail' ? ' open' : ''}>
<summary><span class="num">${r.n}</span><span class="st">${inline(r.title)}</span><span class="pill p-${k}">${esc(r.result)}</span></summary>
<div class="body"><p>${inline(r.notes)}</p>${shots ? `<div class="shots">${shots}</div>` : ''}${texts}${none}</div></details>`;
}).join('\n');
const other = files.filter((f) => !used.has(f) && f !== 'browser-console.log').sort();

function section(title) {
  const s = lines.findIndex((l) => l === `## ${title}`);
  if (s < 0) return '';
  const e = lines.findIndex((l, i) => i > s && /^## /.test(l));
  const out = [];
  let list = false;
  for (const l of lines.slice(s + 1, e < 0 ? lines.length : e)) {
    if (/^- /.test(l)) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(l.slice(2))}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    if (/^### /.test(l)) {
      const t = l.slice(4);
      const pr = ((t.match(/^(Critical|High|Medium|Low|Environment)/) ?? [])[1] ?? '').toLowerCase();
      out.push(`<h3 class="f-${pr}">${inline(t)}</h3>`);
    } else if (l.trim() && !/^<!--|^-->|^\|/.test(l.trim())) out.push(`<p>${inline(l)}</p>`);
  }
  if (list) out.push('</ul>');
  return `<section class="card"><h2>${esc(title)}</h2>${out.join('\n')}</section>`;
}
const lead = lines.slice(lines.indexOf(`# ${heading}`) + 1, lines.findIndex((l) => l.startsWith('## '))).filter((l) => l.trim()).map((l) => `<p>${inline(l)}</p>`).join('');
const filter = (f, label, dot) => `<button type="button" data-f="${f}" aria-pressed="${f === 'all'}">${dot ? `<span class="dot d-${f}"></span>` : ''}${label} <b>${f === 'all' ? rows.length : counts[f]}</b></button>`;

const html = `<title>Smoke Run ${esc(version)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: one reading column; a verdict filter, the step ledger, then findings. */
:root{--bg:#f5f6f4;--panel:#fff;--ink:#1d2a2c;--muted:#5d6b6c;--line:#d7dcd8;--accent:#b0741c;--pass:#2f7d4f;--pass-bg:#e3f2e8;--fail:#b3261e;--fail-bg:#fbe5e3;--dev:#8a5a00;--dev-bg:#fbf0d9;--na:#56636a;--na-bg:#e8ecee;--code-bg:#eef0ec;--f-body:"Archivo","Segoe UI",system-ui,sans-serif;--f-mono:"IBM Plex Mono",ui-monospace,Consolas,monospace}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#121819;--panel:#192122;--ink:#e3e8e6;--muted:#9aa7a6;--line:#2d393a;--accent:#e0a54a;--pass:#7fd19d;--pass-bg:#173326;--fail:#ff8a80;--fail-bg:#3a1c1a;--dev:#f0c46a;--dev-bg:#362b12;--na:#b2bcc0;--na-bg:#263033;--code-bg:#222c2d;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#121819;--panel:#192122;--ink:#e3e8e6;--muted:#9aa7a6;--line:#2d393a;--accent:#e0a54a;--pass:#7fd19d;--pass-bg:#173326;--fail:#ff8a80;--fail-bg:#3a1c1a;--dev:#f0c46a;--dev-bg:#362b12;--na:#b2bcc0;--na-bg:#263033;--code-bg:#222c2d;color-scheme:dark}
body{background:var(--bg);color:var(--ink);font:15px/1.55 var(--f-body)}
.wrap{max-width:1040px;margin:0 auto;padding-inline:16px;padding-block:28px 64px;display:grid;gap:28px}
h1{font:800 clamp(26px,4vw,38px)/1.1 var(--f-body);margin:0;text-wrap:balance}
h2{font:800 20px/1.2 var(--f-body);margin:0 0 12px}
h3{font:600 16px/1.35 var(--f-body);margin:22px 0 6px;padding-left:10px;border-left:3px solid var(--line);text-wrap:balance}
h3.f-critical,h3.f-high{border-color:var(--fail)} h3.f-medium{border-color:var(--dev)} h3.f-low{border-color:var(--na)}
p{margin:0 0 10px;max-width:72ch} .muted{color:var(--muted)}
code{font:13px/1.4 var(--f-mono);background:var(--code-bg);padding:1px 4px;border-radius:3px;overflow-wrap:anywhere}
.eyebrow{font:500 12px var(--f-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
header{display:grid;gap:10px}
.tally{display:flex;flex-wrap:wrap;gap:8px}
.tally button{font:600 13px var(--f-body);border:1px solid var(--line);background:var(--panel);color:var(--ink);border-radius:999px;padding:6px 12px;cursor:pointer;display:flex;gap:6px;align-items:center}
.tally button[aria-pressed="true"]{border-color:var(--ink)} .tally b{font-variant-numeric:tabular-nums}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block}
.d-pass{background:var(--pass)} .d-dev{background:var(--dev)} .d-fail{background:var(--fail)} .d-na{background:var(--na)} .d-local{background:var(--accent)}
.ledger{display:grid;gap:6px}
details.step{background:var(--panel);border:1px solid var(--line);border-radius:6px} details.step.k-fail{border-color:var(--fail)}
summary{list-style:none;cursor:pointer;display:grid;grid-template-columns:2.2em minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 12px}
summary::-webkit-details-marker{display:none}
summary:focus-visible,.tally button:focus-visible,.shot:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.num{font:500 13px var(--f-mono);color:var(--muted);font-variant-numeric:tabular-nums} .st{font-weight:600;min-width:0}
.pill{font:500 11.5px/1.3 var(--f-mono);padding:3px 8px;border-radius:4px;max-width:24ch;text-align:right}
.p-pass{background:var(--pass-bg);color:var(--pass)} .p-fail{background:var(--fail-bg);color:var(--fail)} .p-dev{background:var(--dev-bg);color:var(--dev)} .p-na{background:var(--na-bg);color:var(--na)} .p-local{background:var(--dev-bg);color:var(--accent)}
.body{padding:12px 14px 14px;display:grid;gap:12px;border-top:1px solid var(--line)} .body p{max-width:none}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
figure{margin:0;display:grid;gap:4px;min-width:0}
.shot{padding:0;border:1px solid var(--line);background:var(--bg);border-radius:4px;cursor:zoom-in;display:block}
.shot img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top;border-radius:3px}
figcaption{font:12px var(--f-mono);color:var(--muted);overflow-wrap:anywhere}
.log{border:1px solid var(--line);border-radius:4px;overflow:hidden;min-width:0}
.logname{font:500 12px var(--f-mono);padding:5px 10px;background:var(--code-bg);color:var(--muted)}
.log pre{margin:0;padding:10px;font:12px/1.45 var(--f-mono);overflow:auto;max-height:340px;white-space:pre}
section.card{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:18px 18px 8px}
ul{margin:0 0 12px;padding-left:20px;max-width:80ch} li{margin:3px 0}
dialog{border:none;padding:0;background:transparent;max-width:96vw;max-height:94vh} dialog::backdrop{background:rgba(10,14,15,.82)}
dialog img{max-width:96vw;max-height:88vh;display:block;border-radius:4px} dialog p{color:#e9eeec;font:12px var(--f-mono);margin:6px 0 0}
@media (max-width:560px){summary{grid-template-columns:2em minmax(0,1fr)} .pill{grid-column:2;justify-self:start;text-align:left}}
</style>
<div class="wrap">
<header>
  <span class="eyebrow">Smoke test run</span>
  <h1>${inline(subject)}</h1>
  ${lead}
  <p class="muted">Failing steps are open. Click a step for its screenshots and query output, and a screenshot to see it full size.</p>
  <div class="tally" role="group" aria-label="Filter steps by result">${filter('all', 'All')}${filter('pass', 'Pass', true)}${filter('dev', 'Pass with deviation', true)}${filter('fail', 'Fail', true)}${filter('local', 'Local only', true)}${filter('na', 'Info or not run', true)}</div>
</header>
${section('What was actually run')}
<section><h2>Steps</h2><div class="ledger">${steps}</div></section>
${section('Findings, highest priority first')}
${section('Smoke test document corrections')}
${section('What is genuinely good')}
${section('State left behind')}
${other.length ? `<section class="card"><h2>Other evidence</h2><div class="shots">${shotsFor(other)}</div>${textsFor(other)}</section>` : ''}
</div>
<dialog id="lb"><img alt=""><p></p></dialog>
<script>
(() => {
  const lb = document.getElementById('lb');
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.shot');
    if (b) { const i = lb.querySelector('img'); i.src = b.dataset.src; i.alt = b.getAttribute('aria-label'); lb.querySelector('p').textContent = b.dataset.src.slice(4); lb.showModal(); return; }
    if (e.target.closest('dialog')) { lb.close(); return; }
    const f = e.target.closest('.tally button');
    if (!f) return;
    document.querySelectorAll('.tally button').forEach((x) => x.setAttribute('aria-pressed', String(x === f)));
    document.querySelectorAll('details.step').forEach((d) => { d.hidden = f.dataset.f !== 'all' && d.dataset.k !== f.dataset.f; });
  });
})();
</script>
`;
fs.writeFileSync(outHtml, html);
fs.writeFileSync(path.join(path.dirname(outHtml), 'files.json'), JSON.stringify(fs.readdirSync(shotsDir).map((f) => ({ path: `img/${f}` }))));
console.log(JSON.stringify({ steps: rows.length, ...counts, other: other.length, out: outHtml }));
