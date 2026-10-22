import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { soundEvents } from '../battle-audio.js';
import { GBSound } from '../gbsound.js';

const audio = JSON.parse(readFileSync(new URL('../audio.json', import.meta.url)));
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

test('hits play the effectiveness sound from the following text', () => {
  const log = [
    { text: 'PIKACHU used THUNDERBOLT!', snap: snap(10, 50) },
    { text: '', snap: snap(10, 20) },
    { text: "It's super-effective!", snap: snap(10, 20) },
    { text: 'SNORLAX used BODY SLAM!', snap: snap(10, 20) },
    { text: '', snap: snap(4, 20) },
    { text: "It's not very effective…", snap: snap(4, 20) },
    { text: 'SNORLAX used BODY SLAM!', snap: snap(4, 20) },
    { text: '', snap: snap(1, 20) },
  ];
  assert.deepEqual(names(soundEvents(log, 1, dexOf)), ['superEffective']);
  assert.deepEqual(names(soundEvents(log, 4, dexOf)), ['notVeryEffective']);
  assert.deepEqual(names(soundEvents(log, 7, dexOf)), ['damage']);
  assert.deepEqual(soundEvents(log, 2, dexOf), []);
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
