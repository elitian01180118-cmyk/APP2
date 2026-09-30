'use strict';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MODEL = 'claude-sonnet-5-5';
const $ = id => document.getElementById(id);

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let plan = store.get('plan', {});                 // { mon: { "9": "CA", ... }, ... }
let range = store.get('range', { from: 9, to: 23 });

const pad = n => String(n).padStart(2, '0');
const todayIdx = () => (new Date().getDay() + 6) % 7;
const isMeal = s => /^meal$/i.test(s || '');
const label = s => s;
const cell = (d, h) => (plan[KEYS[d]] || {})[h] || '';

/* ---------- NOW view ---------- */
function blockEnd(d, h) {           // end hour of consecutive identical entries
  const t = cell(d, h);
  let e = h + 1;
  while (e <= 23 && cell(d, e) === t) e++;
  return e;
}

function renderNow() {
  const now = new Date(), d = todayIdx(), h = now.getHours();
  $('date').textContent = `${DAYS[d]}, ${now.toLocaleString('en-US', { month: 'short' })} ${now.getDate()}`;
  $('clock').textContent = `${pad(h)}:${pad(now.getMinutes())}`;

  const cur = cell(d, h);
  const hasPlan = Object.keys(plan).length > 0;
  $('now-title').textContent = !hasPlan ? 'No plan yet' : cur ? label(cur) : '';
  if (cur) {
    const e = blockEnd(d, h);
    $('now-sub').textContent = `${pad(h)}:00 – ${pad(e)}:00`;
  } else {
    $('now-sub').textContent = hasPlan ? '' : 'Go to Import to upload this week\'s plan';
  }
  $('bar').style.width = `${((now.getMinutes() * 60 + now.getSeconds()) / 3600) * 100}%`;

  // next: following distinct entries today (up to 3)
  const next = [];
  for (let i = h + 1; i <= 23 && next.length < 3; i++) {
    const t = cell(d, i);
    if (t && t !== cur) { next.push([i, t]); i = blockEnd(d, i) - 1; }
  }
  $('next-list').innerHTML = next.length
    ? next.map(([i, t]) => `<li><span>${esc(label(t))}</span><span>${pad(i)}:00</span></li>`).join('')
    : '<li><span style="color:var(--mute)">Nothing else today</span><span></span></li>';

  $('today').innerHTML = hoursList().map(i => {
    const t = cell(d, i);
    if (!t) return '';
    const c = i === h ? 'cur' : i < h ? 'past' : '';
    return `<li class="${c}"><b>${pad(i)}:00</b><span>${esc(label(t))}</span></li>`;
  }).join('');
}

/* ---------- WEEK view ---------- */
const hoursList = () => Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from + i);

function renderGrid() {
  const now = new Date(), td = todayIdx(), ch = now.getHours();
  let html = '<tr><th style="width:24px"></th>' + DAYS.map((n, i) => `<th class="${i === td ? 'today' : ''}">${n}</th>`).join('') + '</tr>';
  for (const h of hoursList()) {
    html += `<tr><td class="h">${h}</td>`;
    for (let d = 0; d < 7; d++) {
      const t = cell(d, h);
      const cls = [isMeal(t) ? 'meal' : '', d === td && h === ch ? 'cur' : ''].join(' ');
      html += `<td class="${cls}" data-d="${d}" data-h="${h}">${esc(label(t))}</td>`;
    }
    html += '</tr>';
  }
  $('grid').innerHTML = html;
}

$('grid').addEventListener('click', e => {
  const c = e.target.closest('td[data-d]');
  if (!c) return;
  const d = +c.dataset.d, h = +c.dataset.h;
  $('dlg-title').textContent = `${DAYS[d]} ${pad(h)}:00`;
  $('dlg-input').value = cell(d, h);
  $('dlg').returnValue = '';
  $('dlg').showModal();
  $('dlg').onclose = () => {
    if ($('dlg').returnValue !== 'ok') return;
    const v = $('dlg-input').value.trim();
    const day = (plan[KEYS[d]] = plan[KEYS[d]] || {});
    if (v) day[h] = v; else delete day[h];
    store.set('plan', plan);
    renderAll();
  };
});

/* ---------- IMPORT view ---------- */
const setStatus = s => ($('status').textContent = s);

function fillRange() {
  const opts = Array.from({ length: 24 }, (_, i) => `<option value="${i}">${pad(i)}:00</option>`).join('');
  $('from').innerHTML = opts; $('to').innerHTML = opts;
  $('from').value = range.from; $('to').value = range.to;
  const upd = () => {
    range = { from: Math.min(+$('from').value, +$('to').value), to: Math.max(+$('from').value, +$('to').value) };
    store.set('range', range); renderAll();
  };
  $('from').onchange = $('to').onchange = upd;
}

$('key').value = store.get('key', '');
const cleanKey = v => v.replace(/[^\x21-\x7e]/g, '');   // drop spaces, newlines and any invisible / non-ASCII characters
function showKeyInfo() {
  const k = cleanKey($('key').value);
  const raw = $('key').value;
  const dropped = raw.length - k.length;
  const odd = [...raw].map((c, i) => [c, i]).filter(([c]) => !/[\x21-\x7e]/.test(c))
    .slice(0, 8).map(([c, i]) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}@${i + 1}`).join(' ');
  const ok = /^sk-ant-api\d\d-/.test(k) && dropped === 0;
  $('keyinfo').textContent = !k ? 'No key entered'
    : `${k.slice(0, 13)}…${k.slice(-4)} · ${k.length} chars` + (ok ? '' : dropped ? ` · ⚠ ${dropped} unusual characters removed (${odd})` : ' · ⚠ should start with sk-ant-api03-');
}
$('key').addEventListener('input', () => { store.set('key', cleanKey($('key').value)); showKeyInfo(); });
$('showkey').addEventListener('change', e => { $('key').type = e.target.checked ? 'text' : 'password'; });
$('testkey').addEventListener('click', async () => {
  setStatus('Testing key…');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cleanKey($('key').value),
        'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: MODEL, max_tokens: 16, thinking: { type: 'between_tools' },
        messages: [{ role: 'user', content: 'hi' }] }),
    });
    if (r.ok) return setStatus('Key works.');
    let msg = ''; try { msg = (await r.json()).error.message; } catch {}
    setStatus(`Rejected (${r.status}): ${msg}`);
  } catch (e) { setStatus(`Network error: ${e.message}`); }
});

$('clear').addEventListener('click', () => {
  if (!confirm('Clear this week\'s plan?')) return;
  plan = {}; store.set('plan', plan); renderAll(); setStatus('Cleared');
});

function toJpeg(file, max = 1800) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', 0.9);
      res(url);
    };
    img.onerror = () => rej(new Error('Could not read the image'));
    img.src = URL.createObjectURL(file);
  });
}

const PROMPT = `這是一張每週行程表的截圖：欄為 Mon–Sun，列左側的數字是小時（例如 9. 代表 9:00–10:00）。
請把表格內容轉成 JSON，只輸出 JSON，不要任何說明：
{"mon":{"9":"文字","10":"文字"},"tue":{...},"wed":{...},"thu":{...},"fri":{...},"sat":{...},"sun":{...}}
規則：
- 小時用左側列標籤的整數當 key。
- 只包含有文字的格子，空白格省略。
- 文字照原樣抄寫（例如 "meal"、"CA chap2"、"IT L."），不要翻譯或修改。
- 格子內若有多行，用 " / " 連接。
- 忽略手寫斜線等非文字記號。
- 若某欄整天都沒有內容，仍輸出該欄為 {}。`;

const PRICE_IN = 2 / 1e6, PRICE_OUT = 10 / 1e6;   // USD per token (Sonnet 5.5)
const COST_CAP = 0.30, STEP_TOKENS = 4096;
let lastCost = 0;

async function analyze(dataUrl) {
  const key = cleanKey($('key').value);
  if (!key) throw new Error('Please enter your Claude API key');
  const first = { role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: dataUrl.split(',')[1] } },
    { type: 'text', text: PROMPT },
  ] };
  let text = '', cost = 0, cap = COST_CAP, messages = [first];
  for (;;) {
    let r;
    try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: STEP_TOKENS, thinking: { type: 'between_tools' }, messages }),
    });
    } catch (e) { throw new Error(`Network error: ${e.message}`); }
    if (!r.ok) {
      let msg = '';
      try { msg = (await r.json()).error.message; } catch {}
      throw new Error(r.status === 401 ? 'API key rejected (401). Check the key and that billing is set up.'
        : `Analysis failed (${r.status}) ${msg}`);
    }
    const j = await r.json();
    if (!j || !Array.isArray(j.content) || !j.usage) throw new Error('Unexpected response: ' + JSON.stringify(j).slice(0, 200));
    cost += j.usage.input_tokens * PRICE_IN + j.usage.output_tokens * PRICE_OUT;
    text += j.content.filter(b => b.type === 'text').map(b => b.text).join('');
    setStatus(`Analyzing… $${cost.toFixed(3)}`);
    if (j.stop_reason === 'refusal') throw new Error('The model declined this image');
    if (j.stop_reason !== 'max_tokens') break;
    if (cost >= cap) {                       // budget reached: pause and ask
      if (!confirm(`This import has cost $${cost.toFixed(2)} (limit $${cap.toFixed(2)}).\nContinue for up to $${COST_CAP.toFixed(2)} more?`))
        throw new Error(`Stopped at $${cost.toFixed(2)}`);
      cap += COST_CAP;
    }
    messages = [first, { role: 'assistant', content: text },
      { role: 'user', content: 'Continue exactly where you left off. Output only the remaining text.' }];
  }
  lastCost = cost;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Could not parse the response');
  return JSON.parse(m[0]);
}

$('file').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    setStatus('Reading image…');
    const url = await toJpeg(f);
    $('preview').src = url; $('preview').style.display = 'block';
    setStatus('Analyzing, a few seconds…');
    const raw = await analyze(url);
    const next = {}; let hours = [];
    KEYS.forEach(k => {
      next[k] = {};
      for (const [h, t] of Object.entries(raw[k] || {})) {
        const n = parseInt(h, 10);
        if (n >= 0 && n <= 23 && String(t).trim()) { next[k][n] = String(t).trim(); hours.push(n); }
      }
    });
    if (!hours.length) throw new Error('No entries found in the image');
    plan = next; store.set('plan', plan);
    range = { from: Math.min(range.from, ...hours), to: Math.max(range.to, ...hours) };
    store.set('range', range); fillRange();
    renderAll();
    setStatus(`Done: ${hours.length} entries ($${lastCost.toFixed(3)}). Check them in Week.`);
  } catch (err) {
    setStatus(err.name === 'Error' ? err.message : `${err.name}: ${err.message}`);
  } finally {
    e.target.value = '';
  }
});

/* ---------- shell ---------- */
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function renderAll() { renderNow(); renderGrid(); }

document.querySelectorAll('nav button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + b.dataset.v));
  window.scrollTo(0, 0);
}));

$('note').value = store.get('note', '');
$('note').addEventListener('input', () => store.set('note', $('note').value));

showKeyInfo();
fillRange();
renderAll();
setInterval(renderAll, 1000 * 20);
document.addEventListener('visibilitychange', () => !document.hidden && renderAll());

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
