'use strict';

/* ── DOM ── */
const inputEl  = document.getElementById('input');
const outputEl = document.getElementById('output');
const errorPill = document.getElementById('error-pill');
const errorMsg  = document.getElementById('error-msg');
const sDot      = document.getElementById('s-dot');
const sText     = document.getElementById('s-text');
const sSize     = document.getElementById('s-size');
const lnIn      = document.getElementById('ln-in');
const lnOut     = document.getElementById('ln-out');
const indentSel = document.getElementById('indent-size');

/* ════════════════════════════════════════
   THEME
   - Default: follows OS (prefers-color-scheme via CSS)
   - Override: set data-theme on <html> + save to storage
════════════════════════════════════════ */
function getOSTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('btn-dark').classList.toggle('active', theme === 'dark');
  document.getElementById('btn-light').classList.toggle('active', theme === 'light');
}

function setTheme(theme) {
  applyTheme(theme);
  try { browser.storage.local.set({ theme }); } catch (_) {}
}

// Init: load saved preference, fall back to OS
(function initTheme() {
  const fallback = getOSTheme();
  try {
    browser.storage.local.get('theme').then(result => {
      applyTheme(result && result.theme ? result.theme : fallback);
    }).catch(() => applyTheme(fallback));
  } catch (_) {
    applyTheme(fallback);
  }
  // React to OS changes when no preference is saved
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    try {
      browser.storage.local.get('theme').then(result => {
        if (!result || !result.theme) applyTheme(getOSTheme());
      }).catch(() => {});
    } catch (_) {}
  });
}());

// Wire theme toggle buttons (no inline onclick — CSP safe)
document.getElementById('btn-dark').addEventListener('click', () => setTheme('dark'));
document.getElementById('btn-light').addEventListener('click', () => setTheme('light'));

/* ════════════════════════════════════════
   LINE NUMBERS
════════════════════════════════════════ */
function updateLN(ta, el) {
  const count = (ta.value.match(/\n/g) || []).length + 1;
  let s = '';
  for (let i = 1; i <= count; i++) s += i + '\n';
  el.textContent = s;
}

inputEl.addEventListener('scroll',  () => { lnIn.scrollTop  = inputEl.scrollTop; });
outputEl.addEventListener('scroll', () => { lnOut.scrollTop = outputEl.scrollTop; });

/* ════════════════════════════════════════
   HELPERS
════════════════════════════════════════ */
function getIndent() {
  const v = indentSel.value;
  return v === 'tab' ? '\t' : parseInt(v, 10);
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorPill.classList.add('visible');
  sDot.className = 's-dot err';
  sText.textContent = 'Parse error';
  sSize.textContent = '';
  outputEl.classList.add('is-error');
  outputEl.classList.remove('is-empty');
}

function clearError() {
  errorPill.classList.remove('visible');
  outputEl.classList.remove('is-error');
}

function setReady(msg) {
  clearError();
  sDot.className = 's-dot';
  sText.textContent = msg || 'Ready — paste JSON and press Ctrl+Enter';
  sSize.textContent = '';
}

function setOk(msg, bytes) {
  clearError();
  sDot.className = 's-dot ok';
  sText.textContent = msg;
  sSize.textContent = bytes != null ? fmtBytes(bytes) : '';
}

function writeOutput(text) {
  outputEl.value = text;
  outputEl.classList.remove('is-empty', 'is-error');
  updateLN(outputEl, lnOut);
  outputEl.classList.remove('flash');
  void outputEl.offsetWidth; // reflow to restart animation
  outputEl.classList.add('flash');
}

/* ════════════════════════════════════════
   PARSE / CORE
════════════════════════════════════════ */
function safeParse(raw) {
  const s = raw.trim();
  if (!s) throw new Error('Input is empty');
  try {
    return JSON.parse(s);
  } catch (e) {
    const m = e.message.match(/position (\d+)/);
    if (m) {
      const pos  = parseInt(m[1], 10);
      const line = (s.slice(0, pos).match(/\n/g) || []).length + 1;
      const col  = pos - s.lastIndexOf('\n', pos - 1);
      throw new Error('Line ' + line + ', col ' + col + ' — ' + e.message.split(' at ')[0]);
    }
    throw new Error(e.message);
  }
}

function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeysDeep(v[k])]));
  }
  return v;
}

function stats(obj) {
  let keys = 0, maxDepth = 0;
  (function walk(v, d) {
    maxDepth = Math.max(maxDepth, d);
    if (Array.isArray(v)) v.forEach(i => walk(i, d + 1));
    else if (v !== null && typeof v === 'object') {
      Object.values(v).forEach(val => { keys++; walk(val, d + 1); });
    }
  }(obj, 0));
  return { keys, maxDepth };
}

/* ════════════════════════════════════════
   ACTIONS
════════════════════════════════════════ */
function doFormat() {
  try {
    const parsed = safeParse(inputEl.value);
    const out    = JSON.stringify(parsed, null, getIndent());
    writeOutput(out);
    const { keys, maxDepth } = stats(parsed);
    const lines = out.split('\n').length;
    setOk(lines + ' lines · ' + keys + ' keys · depth ' + maxDepth, new Blob([out]).size);
  } catch (e) { showError(e.message); }
}

function doMinify() {
  try {
    const parsed = safeParse(inputEl.value);
    const out    = JSON.stringify(parsed);
    writeOutput(out);
    setOk('Minified · ' + out.length + ' chars', new Blob([out]).size);
  } catch (e) { showError(e.message); }
}

function doSort() {
  try {
    const parsed = safeParse(inputEl.value);
    const out    = JSON.stringify(sortKeysDeep(parsed), null, getIndent());
    writeOutput(out);
    setOk('Keys sorted · ' + out.split('\n').length + ' lines', new Blob([out]).size);
  } catch (e) { showError(e.message); }
}

function doUnescape() {
  const raw = inputEl.value.trim();
  if (!raw) { showError('Input is empty'); return; }
  try {
    // If it's a JSON-encoded string, unwrap it
    let inner = raw;
    if (raw.startsWith('"') && raw.endsWith('"')) {
      try { inner = JSON.parse(raw); } catch (_) {}
    }
    let out;
    try { out = JSON.stringify(JSON.parse(inner), null, getIndent()); }
    catch (_) { out = inner; }
    writeOutput(out);
    setOk('Unescaped', new Blob([out]).size);
  } catch (e) { showError(e.message); }
}

function doClear() {
  inputEl.value = '';
  outputEl.value = '';
  outputEl.classList.add('is-empty');
  outputEl.classList.remove('is-error', 'flash');
  clearError();
  updateLN(inputEl, lnIn);
  updateLN(outputEl, lnOut);
  setReady();
  inputEl.focus();
}

async function doCopy() {
  if (!outputEl.value || outputEl.classList.contains('is-empty')) return;
  try {
    await navigator.clipboard.writeText(outputEl.value);
    const btn = document.getElementById('btn-copy');
    const orig = btn.textContent;
    btn.textContent = '✓ Copied';
    btn.style.color = 'var(--green)';
    setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 1800);
  } catch (_) {
    outputEl.select();
    document.execCommand('copy');
  }
}

async function doPaste() {
  try {
    const text = await navigator.clipboard.readText();
    inputEl.value = text;
    updateLN(inputEl, lnIn);
    setReady('Pasted — press Ctrl+Enter to format');
    inputEl.focus();
  } catch (_) { inputEl.focus(); }
}

function doDownload() {
  if (!outputEl.value || outputEl.classList.contains('is-empty')) return;
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([outputEl.value], { type: 'application/json' })),
    download: 'output.json'
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ════════════════════════════════════════
   LIVE VALIDATION
════════════════════════════════════════ */
let liveTimer = null;
inputEl.addEventListener('input', () => {
  updateLN(inputEl, lnIn);
  clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    const raw = inputEl.value.trim();
    if (!raw) { clearError(); setReady(); return; }
    try {
      safeParse(raw);
      clearError();
      sDot.className = 's-dot ok';
      sText.textContent = 'Valid JSON — Ctrl+Enter to format';
      sSize.textContent = '';
    } catch (e) {
      if (raw.length > 4) showError(e.message);
    }
  }, 350);
});

/* ════════════════════════════════════════
   KEYBOARD
════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 'Enter')                       { e.preventDefault(); doFormat(); }
  if (mod && e.shiftKey && e.key.toUpperCase() === 'M') { e.preventDefault(); doMinify(); }
  if (mod && e.shiftKey && e.key.toUpperCase() === 'K') { e.preventDefault(); doSort(); }
});

// Tab key inserts spaces instead of tabbing away
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = inputEl.selectionStart;
    inputEl.value = inputEl.value.slice(0, s) + '  ' + inputEl.value.slice(inputEl.selectionEnd);
    inputEl.selectionStart = inputEl.selectionEnd = s + 2;
  }
});

/* ════════════════════════════════════════
   BUTTON WIRING
════════════════════════════════════════ */
document.getElementById('btn-format').addEventListener('click', doFormat);
document.getElementById('btn-minify').addEventListener('click', doMinify);
document.getElementById('btn-sort').addEventListener('click', doSort);
document.getElementById('btn-unescape').addEventListener('click', doUnescape);
document.getElementById('btn-clear').addEventListener('click', doClear);
document.getElementById('btn-copy').addEventListener('click', doCopy);
document.getElementById('btn-paste').addEventListener('click', doPaste);
document.getElementById('btn-download').addEventListener('click', doDownload);

/* Credits modal */
const creditsModal = document.getElementById('modal-credits');
document.getElementById('btn-credits').addEventListener('click', () => {
  creditsModal.classList.add('open');
});
document.getElementById('btn-modal-close').addEventListener('click', () => {
  creditsModal.classList.remove('open');
});
creditsModal.addEventListener('click', e => {
  if (e.target === creditsModal) creditsModal.classList.remove('open');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') creditsModal.classList.remove('open');
});

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
updateLN(inputEl, lnIn);
updateLN(outputEl, lnOut);
inputEl.focus();
