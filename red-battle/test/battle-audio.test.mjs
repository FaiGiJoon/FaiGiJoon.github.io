import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { soundEvents, hurtSides, hitSfx, moveMissed, HIT_LEAD } from '../battle-audio.js';
import { Battle, makeRng, randomTeam } from '../engine.js';
import { GBSound } from '../gbsound.js';

const audio = JSON.parse(readFileSync(new URL('../audio.json', import.meta.url)));
const data = JSON.parse(readFileSync(new URL('../data.json', import.meta.url)));
const snap = (hp0, hp1, idx0 = 0, idx1 = 0) => [{ idx: idx0, hp: hp0 }, { idx: idx1, hp: hp1 }];
const dexOf = (side, entry) => (side === 0 ? 25 : 143) + (entry.snap?.[side].idx ?? 0);
const names = (ev) => ev.map((e) => e.sfx || `cry${e.cry}`);

test('send-out plays the ball poof, then the cry on that side', () => {
  const log = [{ text: 'RED sent out SNORLAX!', snap: null }, { text: 'Go! PIKACHU!', snap: snap(10, 10, 2, 0) }];
  assert.deepEqual(names(soundEvents(log, 0, dexOf)), ['ballPoof', 'cry143']);
  const ev = soundEvents(log, 1, dexOf);
  assert.deepEqual(names(ev), ['ballPoof', 'cry27']);
  assert.equal(ev[1].opts.tracks, 'left');
  assert.ok(ev[1].at > ev[0].at);
  // the sendOutMon animation plays the poof itself
  assert.deepEqual(names(soundEvents(log, 1, dexOf, { animated: true })), ['cry27']);
});

test('hits play the effectiveness sound carried by the hit\'s own message', () => {
  const log = [
    { text: 'PIKACHU used THUNDERBOLT!', snap: snap(10, 50), fx: { side: 0 } },
    { text: "It's super-effective!", snap: snap(10, 20) },
    { text: 'SNORLAX used BODY SLAM!', snap: snap(10, 20), fx: { side: 1 } },
    { text: 'A critical hit!', snap: snap(4, 20) },
    { text: "It's not very effective…", snap: snap(4, 20) },
    { text: 'SNORLAX used BODY SLAM!', snap: snap(4, 20), fx: { side: 1 } },
    { text: 'PIKACHU used THUNDERBOLT!', snap: snap(1, 20), fx: { side: 0 } },
    { text: "It's super-effective!", snap: snap(1, 5) },
  ];
  assert.deepEqual(names(soundEvents(log, 1, dexOf)), ['superEffective']);
  assert.deepEqual(names(soundEvents(log, 3, dexOf)), ['notVeryEffective']);
  // a neutral hit lands on the next move's line; that move's effectiveness is not this hit's
  assert.deepEqual(names(soundEvents(log, 6, dexOf)), ['damage']);
  assert.deepEqual(soundEvents(log, 4, dexOf), []);
});

test('faints, Full Restore and switches map to the game sounds', () => {
  const log = [
    { text: 'Enemy SNORLAX fainted!', snap: null },
    { text: 'PIKACHU fainted!', snap: null },
    { text: 'RED used FULL RESTORE on SNORLAX!', snap: null },
    { text: 'PIKACHU, come back!', snap: null },
    { text: 'RED withdrew SNORLAX!', snap: null },
  ];
  assert.deepEqual(log.map((_, k) => names(soundEvents(log, k, dexOf))),
    [['SFX_KINESIS', 'faint'], ['cry25'], ['fullHeal'], ['switchPokemon'], ['switchPokemon']]);
});

test('every sound the battle can ask for exists in audio.json', () => {
  const s = new GBSound(audio, 8000);
  for (const name of ['ballPoof', 'SFX_KINESIS', 'faint', 'fullHeal', 'switchPokemon', 'damage', 'superEffective',
    'notVeryEffective', 'readText2']) assert.equal(s.playSfx(name, { force: true }), true, name);
  for (const song of ['championBattle', 'gymVictory']) s.playMusic(song);
});

// Drive seeded battles with random choices and return every log
function realLogs(count) {
  const logs = [];
  for (let seed = 1; seed <= count; seed++) {
    const rng = makeRng(seed * 7919);
    const b = new Battle(data, randomTeam(data, rng), { seed });
    for (let guard = 0; !b.over && guard < 500; guard++) {
      if (b.pendingSwitch === 0) {
        const opts = b.sides[0].party.map((m, k) => k).filter((k) => b.sides[0].party[k].hp > 0 && k !== b.sides[0].active);
        b.playerReplace(opts[rng.int(opts.length)]);
        continue;
      }
      const usable = b.mon(0).moves.map((m, k) => k).filter((k) => b.mon(0).moves[k].pp > 0);
      b.playTurn({ type: 'move', slot: usable.length ? usable[rng.int(usable.length)] : 0 });
    }
    logs.push(b.log);
  }
  return logs;
}

test('real Battle logs: a textless hit sounds before the line it lands on', () => {
  const dexAt = (log) => (side, entry) => entry.snap[side].idx;
  const seen = { move: 0, enemyFaint: 0, playerFaint: 0, missed: 0 };
  for (const log of realLogs(40)) {
    for (let k = 1; k < log.length; k++) {
      const e = log[k];
      if (moveMissed(log, k)) seen.missed++;
      if (!hurtSides(log, k).length) continue;
      const ev = soundEvents(log, k, dexAt(log), { animated: true });
      assert.equal(ev[0].at, 0);
      assert.ok(['damage', 'superEffective', 'notVeryEffective'].includes(ev[0].sfx), e.text);
      for (const x of ev.slice(1)) assert.ok(x.at >= HIT_LEAD, `${e.text}: ${JSON.stringify(x)}`);
      if (e.fx) {
        // neutral hit followed by "X used Y!": its sound is plain damage, whatever Y's effectiveness
        seen.move++;
        assert.equal(hitSfx(log, k), 'damage');
        assert.equal(ev.length, 1);
      } else if (/^Enemy .* fainted!$/.test(e.text)) {
        seen.enemyFaint++;
        assert.deepEqual(names(ev), [ev[0].sfx, 'SFX_KINESIS', 'faint']);
        assert.ok(ev[2].at > ev[1].at);
      } else if (/ fainted!$/.test(e.text)) {
        seen.playerFaint++;
        assert.deepEqual(names(ev).slice(1), [`cry${e.snap[0].idx}`]);
      }
    }
  }
  for (const [what, n] of Object.entries(seen)) assert.ok(n > 0, `no ${what} case in the sample`);
});
