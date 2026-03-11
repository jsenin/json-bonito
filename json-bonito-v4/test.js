'use strict';

/* ── Inline the functions under test (no module system in the extension) ── */

function normalizeSpaces(s) {
  return s.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ');
}

function pythonToJson(s) {
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
          if (next === "'")      { pass1 += "'";    i += 2; }
          else if (next === '"') { pass1 += '\\"';  i += 2; }
          else                   { pass1 += c + next; i += 2; }
        } else if (c === '"') { pass1 += '\\"'; i++;
        } else if (c === "'") { pass1 += '"';   i++; break;
        } else                { pass1 += c;     i++; }
      }
    } else if (ch === '"') {
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

  return result.replace(/,(\s*[}\]])/g, '$1');
}

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
  if (inStr) result += '"';
  result += stack.reverse().join('');
  return result;
}

/* ── Test runner ── */
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓', name);
    passed++;
  } catch (e) {
    console.log('  ✗', name);
    console.log('    ', e.message);
    failed++;
  }
}

function eq(a, b) {
  const as = JSON.stringify(a), bs = JSON.stringify(b);
  if (as !== bs) throw new Error('Expected ' + bs + '\n     Got ' + as);
}

/* ════════════════════════════════════════
   normalizeSpaces
════════════════════════════════════════ */
console.log('\nnormalizeSpaces');

test('leaves regular spaces unchanged', () => {
  eq(normalizeSpaces('{ "a": 1 }'), '{ "a": 1 }');
});

test('replaces non-breaking space', () => {
  eq(normalizeSpaces('{"a":\u00A01}'), '{"a": 1}');
});

test('replaces zero-width space', () => {
  eq(normalizeSpaces('{\u200B"a":1}'), '{ "a":1}');
});

test('replaces BOM', () => {
  eq(normalizeSpaces('\uFEFF{"a":1}'), ' {"a":1}');
});

/* ════════════════════════════════════════
   pythonToJson
════════════════════════════════════════ */
console.log('\npythonToJson');

test('single-quoted strings', () => {
  eq(JSON.parse(pythonToJson("{'key': 'value'}")), { key: 'value' });
});

test('True / False / None', () => {
  eq(JSON.parse(pythonToJson("{'a': True, 'b': False, 'c': None}")),
     { a: true, b: false, c: null });
});

test('keywords inside string values are not replaced', () => {
  eq(JSON.parse(pythonToJson("{'x': 'True is True'}")), { x: 'True is True' });
});

test('trailing comma in object', () => {
  eq(JSON.parse(pythonToJson("{'a': 1,}")), { a: 1 });
});

test('trailing comma in list', () => {
  eq(JSON.parse(pythonToJson("{'a': [1, 2,]}")), { a: [1, 2] });
});

test('tuple converted to array', () => {
  eq(JSON.parse(pythonToJson("{'t': (1, 2, 3)}")), { t: [1, 2, 3] });
});

test('escaped single quote inside single-quoted string', () => {
  eq(JSON.parse(pythonToJson("{'msg': 'it\\'s fine'}")), { msg: "it's fine" });
});

test('double quotes inside single-quoted string are escaped', () => {
  eq(JSON.parse(pythonToJson(`{'q': 'say "hi"'}`)), { q: 'say "hi"' });
});

test('nested dicts', () => {
  eq(JSON.parse(pythonToJson("{'a': {'b': 1}}")), { a: { b: 1 } });
});

test('mixed already-valid double-quoted keys', () => {
  eq(JSON.parse(pythonToJson('{"a": True}')), { a: true });
});

/* ════════════════════════════════════════
   attemptFix
════════════════════════════════════════ */
console.log('\nattemptFix');

test('already complete JSON is unchanged', () => {
  const s = '{"a":1}';
  eq(JSON.parse(attemptFix(s)), { a: 1 });
});

test('adds missing closing brace', () => {
  eq(JSON.parse(attemptFix('{"a":1')), { a: 1 });
});

test('adds missing closing bracket', () => {
  eq(JSON.parse(attemptFix('[1,2,3')), [1, 2, 3]);
});

test('adds multiple missing closers in correct order', () => {
  eq(JSON.parse(attemptFix('{"a":[1,2')), { a: [1, 2] });
});

test('closes open string', () => {
  eq(JSON.parse(attemptFix('{"a":"hello')), { a: 'hello' });
});

test('does not close already-closed structures', () => {
  eq(JSON.parse(attemptFix('{"a":1,"b":2}')), { a: 1, b: 2 });
});

test('brackets inside strings are not tracked', () => {
  eq(JSON.parse(attemptFix('{"a":"{not a brace"')), { a: '{not a brace' });
});

/* ════════════════════════════════════════
   Summary
════════════════════════════════════════ */
console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
if (failed > 0) process.exit(1);
