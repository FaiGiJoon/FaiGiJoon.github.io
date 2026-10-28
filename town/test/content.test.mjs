import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import content from '../content.js';
import { Font, HAND_GLYPHS } from '../font.js';

const data = JSON.parse(readFileSync(new URL('../data/goldenrod.json', import.meta.url)));
const font = new Font(data.font);

const NOT_SHOWN = new Set(['href', 'sprite', 'facing', 'kind']);

function* strings(node, key = '') {
  if (typeof node === 'string') {
    if (!NOT_SHOWN.has(key)) yield node;
  } else if (Array.isArray(node)) {
    for (const v of node) yield* strings(v, key);
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) yield* strings(v, k);
  }
}

test('every piece of town text can be drawn with the Crystal font', () => {
  for (const s of strings(content)) {
    for (const ch of s) assert.ok(font.has(ch), `"${ch}" in: ${s}`);
  }
});

test('the font maps letters and digits to the ROM glyphs', () => {
  assert.equal(data.font.charmap.A, 0x00);
  assert.equal(data.font.charmap.a, 0x20);
  assert.equal(data.font.charmap['0'], 0x76);
  assert.equal(data.font.glyphs.length, 128);
  assert.equal(font.glyph(' ').replace(/0/g, ''), '');
});

test('hand-drawn glyphs exist only for characters the ROM font lacks', () => {
  for (const ch of Object.keys(HAND_GLYPHS)) {
    assert.equal(data.font.charmap[ch], undefined, ch);
    assert.equal(HAND_GLYPHS[ch].length, 64);
  }
});

test('every local link points at a file in the site', () => {
  const root = new URL('../../', import.meta.url);
  for (const b of Object.values(content.buildings)) {
    for (const href of [b.href, ...(b.links || []).map((l) => l.href)]) {
      if (!href || /^(https?:|mailto:)/.test(href)) continue;
      const path = href.endsWith('/') ? `${href}index.html` : href;
      assert.ok(existsSync(new URL(path, root)), href);
    }
  }
});
