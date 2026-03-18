'use strict';

/* ── DOM ── */
const inputEl      = document.getElementById('input');
const outputEl     = document.getElementById('output');
const errBadge     = document.getElementById('err-badge');
const errBadgeText = document.getElementById('err-badge-text');
const errModalEl   = document.getElementById('modal-error');
const errModalMsg  = document.getElementById('err-modal-msg');
const sDot         = document.getElementById('s-dot');
const sText        = document.getElementById('s-text');
const sSize        = document.getElementById('s-size');
const lnIn         = document.getElementById('ln-in');
const lnOut        = document.getElementById('ln-out');
const indentSel    = document.getElementById('indent-size');
const tagFormatted = document.getElementById('tag-formatted');

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
  errModalMsg.textContent = msg;
  errBadgeText.textContent = msg.split(' — ')[0]; // show location, e.g. "Line 3, col 5"
  errBadge.classList.add('visible');
  sDot.className = 's-dot err';
  sText.textContent = 'Parse error';
  sSize.textContent = '';
  outputEl.classList.add('is-error');
  outputEl.classList.remove('is-empty');
}

function clearError() {
  errBadge.classList.remove('visible');
  errModalEl.classList.remove('open');
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
  tagFormatted.style.display = '';
}

/* ════════════════════════════════════════
   PRE-PROCESSING
════════════════════════════════════════ */

// Replace non-standard whitespace characters with regular spaces
function normalizeSpaces(s) {
  return s.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ');
}

function looksLikePython(s) {
  let inStr = false, inSingleQuote = false, esc = false, hasTuple = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\' && (inStr || inSingleQuote)) { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (ch === "'") { inSingleQuote = !inSingleQuote; continue; }
    if (inStr || inSingleQuote) continue;

    if (ch === '(') hasTuple = true;
    if (s.startsWith('True',  i) && !/\w/.test(s[i + 4] || '')) return true;
    if (s.startsWith('False', i) && !/\w/.test(s[i + 5] || '')) return true;
    if (s.startsWith('None',  i) && !/\w/.test(s[i + 4] || '')) return true;
  }
  if (hasTuple) return true;
  return false;
}

// Convert Python dict/list literals to JSON
function pythonToJson(s) {
  // Pass 1: convert single-quoted strings and tuples () -> []
  let pass1 = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'") {
      pass1 += '"';
      i++;
      while (i < s.length) {
        const c = s[i];
        if (c === '\\') {
          const next = s[i + 1] || '';
          if (next === "'")      { pass1 += "'";   i += 2; }  // \' -> '
          else if (next === '"') { pass1 += '\\"';  i += 2; }  // \" -> \"
          else                   { pass1 += c + next; i += 2; }
        } else if (c === '"') { pass1 += '\\"'; i++;            // escape bare "
        } else if (c === "'") { pass1 += '"';   i++; break;    // end of string
        } else                { pass1 += c;     i++; }
      }
    } else if (ch === '"') {
      // Double-quoted string — pass through verbatim
      pass1 += ch; i++;
      while (i < s.length) {
        const c = s[i];
        pass1 += c;
        if (c === '\\' && i + 1 < s.length) { pass1 += s[i + 1]; i += 2; }
        else { i++; if (c === '"') break; }
      }
    } else if (ch === '(') { pass1 += '['; i++;
    } else if (ch === ')') { pass1 += ']'; i++;
    } else { pass1 += ch; i++; }
  }

  // Pass 2: replace Python keywords outside strings
  let result = '';
  i = 0;
  while (i < pass1.length) {
    const ch = pass1[i];
    if (ch === '"') {
      result += ch; i++;
      while (i < pass1.length) {
        const c = pass1[i];
        result += c;
        if (c === '\\' && i + 1 < pass1.length) { result += pass1[i + 1]; i += 2; }
        else { i++; if (c === '"') break; }
      }
    } else if (pass1.startsWith('True',  i) && !/\w/.test(pass1[i + 4] || '')) { result += 'true';  i += 4;
    } else if (pass1.startsWith('False', i) && !/\w/.test(pass1[i + 5] || '')) { result += 'false'; i += 5;
    } else if (pass1.startsWith('None',  i) && !/\w/.test(pass1[i + 4] || '')) { result += 'null';  i += 4;
    } else { result += ch; i++; }
  }

  // Pass 3: remove trailing commas before } or ]
  return result.replace(/,(\s*[}\]])/g, '$1');
}

// Add missing closing brackets/braces/quotes to make JSON complete
function attemptFix(s) {
  const stack = [];
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc)                          { esc = false; continue; }
    if (ch === '\\' && inStr)         { esc = true;  continue; }
    if (ch === '"')                   { inStr = !inStr; continue; }
    if (inStr)                        { continue; }
    if      (ch === '{')              { stack.push('}'); }
    else if (ch === '[')              { stack.push(']'); }
    else if ((ch === '}' || ch === ']') && stack.length && stack[stack.length - 1] === ch) { stack.pop(); }
  }
  let result = s;
  if (inStr) result += '"';           // close open string
  result += stack.reverse().join(''); // close open structures
  return result;
}

/* ════════════════════════════════════════
   PARSE / CORE
════════════════════════════════════════ */
function safeParse(raw) {
  const s = raw.trim();
  if (!s) throw new Error('Input is empty');

  const ns = normalizeSpaces(s);

  if (looksLikePython(ns)) {
    try { return JSON.parse(pythonToJson(ns)); } catch (_) {}
    try { return JSON.parse(ns); } catch (_) {}
  } else {
    try { return JSON.parse(ns); } catch (_) {}
    try { return JSON.parse(pythonToJson(ns)); } catch (_) {}
  }

  const m = raw.match(/"([^"]*)"/);
  const firstErr = new Error('Parse error');
  const matchPos = raw.indexOf(':');
  if (matchPos !== -1) {
    const line = (raw.slice(0, matchPos).match(/\n/g) || []).length + 1;
    const col  = matchPos - raw.lastIndexOf('\n', matchPos - 1);
    throw new Error('Line ' + line + ', col ' + col + ' — Invalid JSON');
  }
  throw firstErr;
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

function doFix() {
  const raw = inputEl.value;
  if (!raw.trim()) { showError('Input is empty'); return; }

  // Already valid? Just format it
  try {
    const parsed = safeParse(raw);
    const out = JSON.stringify(parsed, null, getIndent());
    writeOutput(out);
    setOk('Already valid — formatted', new Blob([out]).size);
    return;
  } catch (_) {}

  // Apply fixes progressively
  let candidate = normalizeSpaces(raw.trim());
  try { candidate = pythonToJson(candidate); } catch (_) {}
  candidate = candidate.replace(/,(\s*[}\]])/g, '$1');
  candidate = attemptFix(candidate);

  try {
    const parsed = JSON.parse(candidate);
    const out    = JSON.stringify(parsed, null, getIndent());
    writeOutput(out);
    const { keys, maxDepth } = stats(parsed);
    setOk('Fixed · ' + out.split('\n').length + ' lines · ' + keys + ' keys · depth ' + maxDepth, new Blob([out]).size);
  } catch (e) {
    showError('Could not fix: ' + e.message.split(' at ')[0]);
  }
}

function doClearInput() {
  inputEl.value = '';
  clearError();
  updateLN(inputEl, lnIn);
  setReady();
  inputEl.focus();
}

function doClearOutput() {
  outputEl.value = '';
  outputEl.classList.add('is-empty');
  outputEl.classList.remove('is-error', 'flash');
  tagFormatted.style.display = 'none';
  updateLN(outputEl, lnOut);
  setReady();
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
   INPUT
════════════════════════════════════════ */
inputEl.addEventListener('input', () => {
  updateLN(inputEl, lnIn);
  clearError();
});

/* ════════════════════════════════════════
   KEYBOARD
════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === 'Enter')                       { e.preventDefault(); doFormat(); }
  if (mod && e.shiftKey && e.key.toUpperCase() === 'M') { e.preventDefault(); doMinify(); }
  if (mod && e.shiftKey && e.key.toUpperCase() === 'K') { e.preventDefault(); doSort(); }
  if (mod && e.shiftKey && e.key.toUpperCase() === 'F') { e.preventDefault(); doFix(); }
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
document.getElementById('btn-fix').addEventListener('click', doFix);

/* Error detail modal */
errBadge.addEventListener('click', () => errModalEl.classList.add('open'));
document.getElementById('btn-err-modal-close').addEventListener('click',  () => errModalEl.classList.remove('open'));
document.getElementById('btn-err-modal-close2').addEventListener('click', () => errModalEl.classList.remove('open'));
document.getElementById('btn-fix-hint').addEventListener('click', () => { errModalEl.classList.remove('open'); doFix(); });
errModalEl.addEventListener('click', e => { if (e.target === errModalEl) errModalEl.classList.remove('open'); });
document.getElementById('btn-clear-input').addEventListener('click', doClearInput);
document.getElementById('btn-clear-output').addEventListener('click', doClearOutput);
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
  if (e.key === 'Escape') { creditsModal.classList.remove('open'); errModalEl.classList.remove('open'); }
});

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
updateLN(inputEl, lnIn);
updateLN(outputEl, lnOut);
inputEl.focus();

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
document.getElementById('fmt-shortcut').textContent = isMac ? '⌘↵' : 'Ctrl+↵';
