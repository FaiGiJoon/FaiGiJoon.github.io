// Checks the JS port of the animation-object engine (animobj.js) against the original routines,
// run from the user's ROM in a small SM83 interpreter. Every frame of every move's animation, for
// both sides, the JS object state is copied into the emulated WRAM, BattleAnim_UpdateOAM_All runs
// in both, and the 10 object structs, the shadow OAM and wOBP0 must match byte for byte.
// Skipped when the ROM or the disassembly's symbol file is not on this machine (it is never published).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { SM83 } from '../tools/sm83.mjs';
import { BattleAnimPlayer } from '../anims.js';

const ROM = process.env.CRYSTAL_ROM || '/Users/casper/Downloads/Pokemon - Crystal Version (USA, Europe).gbc';
const SYM = process.env.CRYSTAL_SYM || '/Users/casper/src/pokecrystal/pokecrystal.sym';
const have = existsSync(ROM) && existsSync(SYM);

test('animation objects match the ROM routines frame by frame', { skip: !have && 'ROM not available' }, () => {
  const rom = readFileSync(ROM);
  assert.equal(createHash('sha1').update(rom).digest('hex'), 'f4cd194bdee0d04ca4eac29e09b8e4e9d818c133');
  const sym = {};
  for (const line of readFileSync(SYM, 'utf8').split('\n')) {
    const m = /^([0-9a-f]{2}):([0-9a-f]{4}) (\S+)/.exec(line);
    if (m) sym[m[3]] = [parseInt(m[1], 16), parseInt(m[2], 16)];
  }
  const audio = JSON.parse(readFileSync(new URL('../audio.json', import.meta.url)));
  const objData = JSON.parse(readFileSync(new URL('../animobj.json', import.meta.url)));
  const cpu = new SM83(rom);
  const A = (name) => sym[name][1];
  const [bank, updateAll] = sym.BattleAnim_UpdateOAM_All;
  cpu.wb(0xffe6, 1); // hCGB
  cpu.wb(0xffe7, 0); // hSGB

  const keys = [...Array.from({ length: 251 }, (_, i) => String(i + 1)),
    'sendOutMon', 'returnMon', 'enemyDamage', 'playerDamage', 'confused', 'slp', 'psn', 'brn', 'frz', 'par',
    'inLove', 'inSandstorm', 'inWhirlpool', 'hitConfusion', 'enemyStatDown', 'playerStatDown', 'wobble', 'shake'];
  let frames = 0; let objectFrames = 0;
  for (const key of keys) {
    for (const attackerIsPlayer of [true, false]) {
      const moveId = /^\d+$/.test(key) ? +key : 0;
      const p = new BattleAnimPlayer(audio, key, { attackerIsPlayer, objData, moveId });
      const o = p.objects;
      while (!p.done) {
        // run the script step, then sync the JS state into the emulated WRAM before the object update
        const s = p.s;
        const ev = [];
        if (s.delay) s.delay--; else p.runScript(ev);
        p.bgEffects(ev);
        cpu.wb(0xff70, 5);
        const objs = A('wActiveAnimObjects');
        for (let i = 0; i < o.mem.length; i++) cpu.wb(objs + i, o.mem[i]);
        for (let i = 0; i < 10; i++) cpu.wb(A('wBattleAnimTileDict') + i, o.tileDict[i]);
        cpu.wb(A('wLastAnimObjectIndex'), o.lastIndex);
        cpu.wb(0xffe4, o.turn); // hBattleTurn
        cpu.wb(A('wFXAnimID'), o.fxAnimId);
        cpu.wb(A('wFXAnimID') + 1, 0);
        cpu.wb(A('wOBP0'), o.obp0);
        cpu.wb(0xff70, 1); cpu.wb(A('wCurItem'), 0); cpu.wb(0xff70, 5);
        cpu.sp = 0xdff0;
        const where = `${key} ${attackerIsPlayer ? 'player' : 'enemy'} frame ${p.frame}`;
        try { cpu.call(bank, updateAll); } catch (err) {
          assert.fail(`${where}: ROM routine failed (${err.message}); objects ${[...o.mem].join(',')}`);
        }
        o.updateAll();
        p.frame++;
        frames++;
        cpu.wb(0xff70, 5);
        for (let i = 0; i < o.mem.length; i++) {
          const want = cpu.rb(objs + i);
          if (want !== o.mem[i]) {
            const slot = Math.floor(i / 24);
            assert.fail(`${where}: object ${slot} byte ${i % 24} (func ${cpu.rb(objs + slot * 24 + 4)}) is ${o.mem[i]}, ROM gives ${want}`);
          }
        }
        for (let i = 0; i < 160; i++) {
          if (cpu.rb(A('wShadowOAM') + i) !== o.oam[i]) assert.fail(`${where}: OAM byte ${i} is ${o.oam[i]}, ROM gives ${cpu.rb(A('wShadowOAM') + i)}`);
        }
        assert.equal(o.obp0, cpu.rb(A('wOBP0')), `${where}: wOBP0`);
        if (o.mem.some((b, i) => i % 24 === 0 && b)) objectFrames++;
      }
    }
  }
  assert.ok(frames > 50000 && objectFrames > 20000, `${frames} frames, ${objectFrames} with objects`);
});
