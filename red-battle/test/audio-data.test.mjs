import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const audio = JSON.parse(readFileSync(new URL('../audio.json', import.meta.url)));
const data = JSON.parse(readFileSync(new URL('../data.json', import.meta.url)));

// Read ROM bytes as (bank, addr) from the traced blocks, like the JS engines will.
const mem = new Map();
for (const b of audio.blocks) {
  for (let i = 0; i < b.hex.length / 2; i++) mem.set(`${b.bank}:${b.addr + i}`, parseInt(b.hex.substr(i * 2, 2), 16));
}
const rd = (bank, addr) => {
  const v = mem.get(`${bank}:${addr}`);
  assert.notEqual(v, undefined, `byte ${bank.toString(16)}:${addr.toString(16)} not in blocks`);
  return v;
};
const rdw = (bank, addr) => rd(bank, addr) | (rd(bank, addr + 1) << 8);

function header(bank, addr) {
  const count = (rd(bank, addr) >> 6) + 1;
  return Array.from({ length: count }, (_, i) => ({
    channel: (rd(bank, addr + 3 * i) & 7) + 1, addr: rdw(bank, addr + 3 * i + 1),
  }));
}

test('audio.json comes from Crystal UE v1.0', () => {
  assert.equal(audio.source.sha1, 'f4cd194bdee0d04ca4eac29e09b8e4e9d818c133');
});

test('champion battle header has channels 1, 2, 3', () => {
  const { bank, addr } = audio.songs.championBattle;
  assert.deepEqual(header(bank, addr).map((c) => c.channel), [1, 2, 3]);
});

test('champion battle channel 1 starts with tempo 98, volume 7,7, duty_cycle 3', () => {
  const { bank, addr } = audio.songs.championBattle;
  let pc = header(bank, addr)[0].addr;
  assert.equal(rd(bank, pc), 0xda); // tempo (big-endian word)
  assert.equal((rd(bank, pc + 1) << 8) | rd(bank, pc + 2), 98);
  pc += 3;
  assert.equal(rd(bank, pc), 0xe5); // volume left, right
  assert.equal(rd(bank, pc + 1), 0x77);
  pc += 2;
  assert.equal(rd(bank, pc), 0xdb); // duty_cycle
  assert.equal(rd(bank, pc + 1), 3);
});

test('every block lies within its bank', () => {
  for (const b of audio.blocks) {
    const end = b.addr + b.hex.length / 2;
    if (b.bank === 0) assert.ok(end <= 0x4000);
    else assert.ok(b.addr >= 0x4000 && end <= 0x8000, `${b.bank}:${b.addr}`);
  }
});

test('all 251 species have a cry whose header is traced', () => {
  for (let dex = 1; dex <= 251; dex++) {
    const c = audio.cries[dex];
    assert.ok(c, `cry ${dex}`);
    const h = audio.cryHeaders[c.base];
    assert.ok(h, `cry header ${c.base}`);
    assert.ok(header(h.bank, h.addr).every((ch) => ch.channel >= 5));
  }
  assert.equal(Object.keys(audio.cries).length, 251);
});

test('named sfx are present', () => {
  for (const k of ['readText2', 'ballPoof', 'faint', 'damage', 'superEffective', 'notVeryEffective', 'fullHeal', 'switchPokemon']) {
    const s = audio.sfx[k];
    assert.ok(s && header(s.bank, s.addr).length >= 1, k);
  }
});

test('Thunderbolt animation script starts as in data/moves/animations.asm', () => {
  const id = Object.values(data.moves).find((m) => m.name === 'THUNDERBOLT').id;
  const { bank, addr } = audio.anims[id];
  let pc = addr;
  const ops = [];
  for (let n = 0; n < 5; n++) {
    const b = rd(bank, pc);
    if (b < 0xd0) { ops.push(['anim_wait', b]); pc++; continue; }
    const cmd = audio.animCommands[b];
    const params = Array.from({ length: cmd.length - 1 }, (_, i) => rd(bank, pc + 1 + i));
    ops.push([cmd.name, ...params]);
    pc += cmd.length;
  }
  assert.deepEqual(ops.map((o) => o[0]), ['anim_2gfx', 'anim_obj', 'anim_wait', 'anim_bgeffect', 'anim_sound']);
  assert.equal(ops[2][1], 16);
  assert.equal(audio.bgEffects[ops[3][1]], 'BATTLE_BG_EFFECT_FLASH_INVERTED');
  assert.equal(ops[4][1], (0 << 2) | 1);
  assert.equal(ops[4][2], audio.sfxIds.SFX_THUNDERSHOCK.id);
});

test('special animations are present', () => {
  for (const k of ['sendOutMon', 'enemyDamage', 'playerDamage', 'miss', 'confused', 'slp', 'psn', 'brn', 'frz', 'par', 'sap', 'hitConfusion', 'enemyStatDown', 'playerStatDown']) {
    assert.ok(audio.anims[k], k);
    rd(audio.anims[k].bank, audio.anims[k].addr);
  }
});

test('total size of blocks is under 400 KB', () => {
  const total = audio.blocks.reduce((s, b) => s + b.hex.length / 2, 0);
  assert.ok(total < 400 * 1024, `${total} bytes`);
});
