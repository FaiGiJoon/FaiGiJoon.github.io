import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  Battle, makeRng, calcStats, defaultMoves, hiddenPower, makeMon, randomTeam, redTeam, typeEffect, RED_LEVELS, BATTLE_LEVEL, pct,
} from '../engine.js';

const data = JSON.parse(readFileSync(new URL('../data.json', import.meta.url)));
const DISASM = process.env.POKECRYSTAL || `${process.env.HOME}/src/pokecrystal`;
const byName = (n) => Object.values(data.moves).find((m) => m.name === n);
const dexOf = (n) => Object.values(data.species).find((s) => s.name === n).dex;

// ---------- 1. ROM data matches the disassembly ----------
test('ROM identity is Crystal UE v1.0', () => {
  assert.equal(data.source.sha1, 'f4cd194bdee0d04ca4eac29e09b8e4e9d818c133');
});

test('Red party, DVs and AI flags match data/trainers/*.asm', { skip: !existsSync(DISASM) }, () => {
  const parties = readFileSync(`${DISASM}/data/trainers/parties.asm`, 'utf8');
  const block = parties.split('RedGroup:')[1].split('db -1')[0];
  const rows = [...block.matchAll(/db (\d+), (\w+),\s+([\w, ]+)/g)].map((m) => ({
    level: +m[1], species: m[2], moves: m[3].split(',').map((x) => x.trim()),
  }));
  const team = redTeam(data);
  assert.equal(team.length, 6);
  rows.forEach((r, k) => {
    assert.equal(data.red.party[k].level, r.level); // extracted from the ROM unchanged
    assert.equal(team[k].level, BATTLE_LEVEL); // but battles are fought at level 60
    assert.equal(team[k].name, r.species);
    const names = team[k].moves.map((mv) => data.moves[mv.id].name.replace(/[ -]/g, '_'));
    assert.deepEqual(names, r.moves.map((x) => x.replace('PSYCHIC_M', 'PSYCHIC')));
  });
  assert.deepEqual(data.red.dvs, { atk: 15, def: 13, spe: 13, spc: 14 });
  assert.equal(data.red.aiFlags, 0b1111010011); // BASIC|SETUP|SMART|AGGRESSIVE|CAUTIOUS|STATUS|RISKY
  assert.deepEqual(data.red.items, [14, 14]); // FULL_RESTORE x2
  assert.deepEqual(RED_LEVELS, data.red.party.map((p) => p.level));
});

test('all 251 moves match data/moves/moves.asm', { skip: !existsSync(DISASM) }, () => {
  const src = readFileSync(`${DISASM}/data/moves/moves.asm`, 'utf8');
  const rows = [...src.matchAll(/^\s*move (\w+),\s*(EFFECT_\w+),\s*(\d+),\s*(\w+),\s*(\d+),\s*(\d+),\s*(\d+)/gm)];
  assert.equal(rows.length, 251);
  rows.forEach((r, k) => {
    const m = data.moves[k + 1];
    assert.equal(m.effect, r[2], r[1]);
    assert.equal(m.power, +r[3], r[1]);
    assert.equal(m.type, r[4].replace('PSYCHIC_TYPE', 'PSYCHIC').replace('CURSE_TYPE', 'CURSE'), r[1]);
    assert.equal(m.accuracy, pct(+r[5]), r[1]);
    assert.equal(m.pp, +r[6], r[1]);
    assert.equal(m.chance, pct(+r[7]), r[1]);
  });
});

test('base stats match data/pokemon/base_stats/*.asm', { skip: !existsSync(DISASM) }, () => {
  let checked = 0;
  for (const s of Object.values(data.species)) {
    const file = `${DISASM}/data/pokemon/base_stats/${s.name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace('♀', '_f')}.asm`;
    if (!existsSync(file)) continue;
    const m = /db\s+(\d+),\s+(\d+),\s+(\d+),\s+(\d+),\s+(\d+),\s+(\d+)/.exec(readFileSync(file, 'utf8'));
    assert.deepEqual([s.base.hp, s.base.atk, s.base.def, s.base.spe, s.base.spa, s.base.spd], m.slice(1, 7).map(Number), s.name);
    checked++;
  }
  assert.ok(checked > 240, `only checked ${checked}`);
});

// ---------- 2. formulas ----------
test('stat formula: Red Pikachu L81, DVs 15/13/13/14 (HP DV 14), zero stat exp', () => {
  const s = calcStats(data.species[25].base, 81, data.red.dvs);
  // HP: floor((35+14)*2*81/100)+81+10 = 79+91
  assert.equal(s.hp, 170);
  assert.equal(s.atk, Math.floor((55 + 15) * 2 * 81 / 100) + 5); // 118
  assert.equal(s.spe, Math.floor((90 + 13) * 2 * 81 / 100) + 5); // 171
});

test('type chart: Electric->Ground immune, Water->Fire/Ground x2 stacking', () => {
  assert.equal(typeEffect(data, 'ELECTRIC', ['GROUND']), 0);
  assert.equal(typeEffect(data, 'WATER', ['GROUND', 'ROCK']), 40);
  assert.equal(typeEffect(data, 'NORMAL', ['GHOST']), 0);
  assert.equal(typeEffect(data, 'NORMAL', ['GHOST'], true), 10); // Foresight
});

test('damage formula matches a hand calculation (no crit, no spread)', () => {
  // Red's Pikachu Thunderbolt vs a L81 Gyarados with all-0 DVs, no badges
  const gyarados = makeMon(data, dexOf('GYARADOS'), 81, { atk: 0, def: 0, spe: 0, spc: 0 }, [byName('SPLASH').id]);
  const b = new Battle(data, [gyarados], { seed: 1, badges: false });
  const tb = byName('THUNDERBOLT');
  const A = b.stat(1, 'spa'); const D = b.stat(0, 'spd');
  const L = b.mon(1).level;
  const base = Math.floor(Math.floor((Math.floor(L * 2 / 5) + 2) * 95 * A / D) / 50) + 2;
  assert.equal(b.baseDamage(1, tb), base);
  const stab = base + (base >> 1);
  assert.equal(b.modify(1, tb, base).damage, Math.floor(stab * 40 / 10)); // 4x: Water/Flying
});

test('default movesets are the last four distinct level-up moves', () => {
  const s = data.species[dexOf('PIKACHU')];
  const mv = defaultMoves(s, 81).map((id) => data.moves[id].name);
  assert.equal(mv.length, 4);
  assert.ok(mv.includes('THUNDER'));
});

test('hidden power from DVs (all 15 -> Dark 70)', () => {
  assert.deepEqual(hiddenPower({ atk: 15, def: 15, spe: 15, spc: 15 }), { type: 'DARK', power: 70 });
});

test('random team: all level 60, no Mew/Celebi, all moves legal level-up moves', () => {
  for (let seed = 1; seed < 200; seed++) {
    const team = randomTeam(data, makeRng(seed));
    assert.deepEqual(team.map((m) => m.level), Array(6).fill(BATTLE_LEVEL));
    for (const m of team) {
      assert.ok(m.dex !== 151 && m.dex !== 251);
      const legal = new Set(data.species[m.dex].learnset.filter(([lv]) => lv <= m.level).map(([, id]) => id));
      m.moves.forEach((mv) => assert.ok(legal.has(mv.id), `${m.name} ${mv.id}`));
    }
  }
});

// ---------- 3. Red's AI ----------
function battleVs(name, moves, level = 81, opts = {}) {
  const mon = makeMon(data, dexOf(name), level, { atk: 8, def: 8, spe: 8, spc: 8 }, moves.map((n) => byName(n).id));
  return new Battle(data, [mon], { seed: opts.seed ?? 7, badges: false });
}

test('AI: Pikachu never picks electric moves against a Ground type', () => {
  for (let seed = 1; seed < 300; seed++) {
    const b = battleVs('GOLEM', ['SPLASH'], 81, { seed });
    const slot = b.aiChooseMove();
    const name = data.moves[b.mon(1).moves[slot].id].name;
    assert.ok(!['THUNDERBOLT', 'THUNDER'].includes(name), `seed ${seed} picked ${name}`);
  }
});

test('AI: Snorlax never Snores while awake', () => {
  for (let seed = 1; seed < 300; seed++) {
    const b = battleVs('MACHAMP', ['SPLASH'], 81, { seed });
    b.sides[1].active = 2; // Snorlax
    const name = data.moves[b.mon(1).moves[b.aiChooseMove()].id].name;
    assert.notEqual(name, 'SNORE');
  }
});

test('AI: Full Restore only with the highest-level mon and low HP', () => {
  const b = battleVs('MACHAMP', ['SPLASH']);
  b.mon(1).hp = 10; // Pikachu below 1/4
  assert.deepEqual(b.aiTryItem(), { type: 'item', item: 14 });
  b.sides[1].active = 1; b.mon(1).hp = 1; // Espeon: tied for highest level at 60, so it may heal too
  assert.deepEqual(b.aiTryItem(), { type: 'item', item: 14 });
  b.sides[1].party[0].level = 81; // with Pikachu above the rest (as in Crystal) Espeon may not
  assert.equal(b.aiTryItem(), null);
  b.sides[1].active = 0; b.mon(1).hp = b.mon(1).maxHp;
  assert.equal(b.aiTryItem(), null);
});

test('AI: Red has exactly two Full Restores', () => {
  const b = battleVs('MACHAMP', ['SPLASH']);
  b.useFullRestore(1); b.useFullRestore(1);
  b.mon(1).hp = 1;
  assert.equal(b.aiTryItem(), null);
});

// ---------- 4. engine invariants under fuzzing ----------
test('fuzz: 3000 random battles finish without errors or broken state', () => {
  const warnings = new Map();
  let playerWins = 0;
  for (let seed = 1; seed <= 3000; seed++) {
    const rng = makeRng(seed * 7919);
    const b = new Battle(data, randomTeam(data, rng), { seed });
    let guard = 0;
    while (!b.over && guard++ < 500) {
      if (b.pendingSwitch === 0) {
        const opts = b.sides[0].party.map((m, k) => k).filter((k) => b.sides[0].party[k].hp > 0 && k !== b.sides[0].active);
        b.playerReplace(opts[rng.int(opts.length)]);
        continue;
      }
      const me = b.mon(0);
      const usable = me.moves.map((m, k) => k).filter((k) => me.moves[k].pp > 0);
      const canSw = b.canSwitch(0) && b.alive(0).length > 1;
      if (canSw && rng() < 20) {
        const opts = b.sides[0].party.map((m, k) => k).filter((k) => b.sides[0].party[k].hp > 0 && k !== b.sides[0].active);
        b.playTurn({ type: 'switch', to: opts[rng.int(opts.length)] });
      } else {
        b.playTurn({ type: 'move', slot: usable.length ? usable[rng.int(usable.length)] : 0 });
      }
      for (const s of b.sides) {
        for (const m of s.party) {
          assert.ok(m.hp >= 0 && m.hp <= m.maxHp, `seed ${seed}: ${m.name} hp ${m.hp}/${m.maxHp}`);
          m.moves.forEach((mv) => assert.ok(mv.pp >= 0, `seed ${seed}: negative PP`));
        }
        for (const v of Object.values(s.vol.stages)) assert.ok(v >= -6 && v <= 6);
      }
    }
    assert.ok(b.over, `seed ${seed} did not finish in 500 turns`);
    if (b.winner === 0) playerWins++;
    b.log.filter((l) => l.kind === 'warn').forEach((l) => warnings.set(l.text, (warnings.get(l.text) || 0) + 1));
  }
  console.log(`player win rate with random moves: ${(playerWins / 30).toFixed(1)}%`);
  if (warnings.size) console.log('unsimulated effects seen:', Object.fromEntries(warnings));
});
