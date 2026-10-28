import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { Battle, randomTeam, trainerTeam, makeRng, BATTLE_LEVEL, TRAINER_KEYS } from '../engine.js';

const data = JSON.parse(readFileSync(new URL('../data.json', import.meta.url)));
const DISASM = process.env.POKECRYSTAL || `${process.env.HOME}/src/pokecrystal`;
const GROUPS = { red: 'RedGroup', will: 'WillGroup', koga: 'KogaGroup', bruno: 'BrunoGroup', karen: 'KarenGroup', lance: 'ChampionGroup' };

test('the Gym holds RED, the Elite Four and Champion LANCE', () => {
  assert.deepEqual(TRAINER_KEYS, ['will', 'koga', 'bruno', 'karen', 'lance', 'red']);
  for (const k of TRAINER_KEYS) assert.ok(data.trainers[k], k);
  assert.equal(data.trainers.lance.className, 'CHAMPION');
  assert.equal(data.trainers.will.className, 'ELITE FOUR');
  assert.equal(data.trainers.red.className, 'PKMN TRAINER');
  assert.deepEqual(data.red, data.trainers.red);
});

test('every party matches data/trainers/parties.asm', { skip: !existsSync(DISASM) }, () => {
  const parties = readFileSync(`${DISASM}/data/trainers/parties.asm`, 'utf8');
  for (const [key, group] of Object.entries(GROUPS)) {
    const block = parties.split(`${group}:`)[1].split('db -1')[0];
    const rows = [...block.matchAll(/db (\d+), (\w+),\s+([\w, ]+)/g)];
    const team = trainerTeam(data, data.trainers[key]);
    assert.equal(team.length, rows.length, key);
    rows.forEach((m, i) => {
      assert.equal(data.trainers[key].party[i].level, +m[1], `${key} ${i}`); // ROM level kept in the data
      assert.equal(team[i].level, BATTLE_LEVEL); // fought at Lv60
      assert.equal(team[i].name, m[2]);
      const names = team[i].moves.map((mv) => data.moves[mv.id].name.replace(/[ -]/g, '_'));
      assert.deepEqual(names, m[3].split(',').map((x) => x.trim().replace('PSYCHIC_M', 'PSYCHIC')), `${key} ${m[2]}`);
    });
  }
});

test('battle lines are read from the map scripts', () => {
  assert.equal(data.trainers.will.text.win[0], "I… I can't… believe it…");
  assert.equal(data.trainers.lance.text.before[0], "LANCE: I've been waiting for you.");
  assert.ok(data.trainers.koga.text.before.some((l) => l.includes('sinister')), 'hyphenated words rejoined');
  for (const k of TRAINER_KEYS) assert.ok(data.trainers[k].text.before.length, k);
});

test('music follows PlayBattleMusic: champion theme for LANCE and RED, gym theme for the Elite Four', () => {
  const audio = JSON.parse(readFileSync(new URL('../audio.json', import.meta.url)));
  for (const k of TRAINER_KEYS) {
    const want = k === 'lance' || k === 'red' ? 'championBattle' : 'johtoGymBattle';
    assert.equal(data.trainers[k].music, want, k);
    assert.ok(audio.songs[want], want);
  }
});

test('a battle names its trainer with the class, as the game does', () => {
  const b = new Battle(data, randomTeam(data, makeRng(1)), { seed: 2, trainer: 'lance' });
  assert.equal(b.log[0].text, 'CHAMPION LANCE wants to battle!');
  assert.equal(b.log[1].text, 'LANCE sent out GYARADOS!');
  assert.equal(b.sides[1].name, 'LANCE');
  assert.equal(b.sides[1].party.length, 6);
});

test('no trainer option still means RED', () => {
  const b = new Battle(data, randomTeam(data, makeRng(1)), { seed: 2 });
  assert.equal(b.log[0].text, 'PKMN TRAINER RED wants to battle!');
  assert.equal(b.log[1].text, 'RED sent out PIKACHU!');
});

test('an Elite Four member heals with MAX POTION when low, once', () => {
  const b = new Battle(data, randomTeam(data, makeRng(1)), { seed: 3, trainer: 'will' });
  // AI_TryItem only acts while the highest-level party member is out: all are Lv60 here.
  const m = b.mon(1);
  m.hp = 1;
  const action = b.aiTryItem();
  assert.deepEqual(action, { type: 'item', item: 15 });
  b.useItem(1, 15);
  assert.equal(m.hp, m.maxHp);
  assert.ok(b.log.at(-1).text.startsWith('WILL used MAX POTION on'));
  m.hp = 1;
  assert.equal(b.aiTryItem(), null, 'the only MAX POTION is gone');
});

test('MAX POTION does not cure status; FULL HEAL does', () => {
  const b = new Battle(data, randomTeam(data, makeRng(1)), { seed: 3, trainer: 'karen' });
  const m = b.mon(1);
  m.hp = 1; m.status = 'PAR';
  b.useItem(1, 15);
  assert.equal(m.hp, m.maxHp);
  assert.equal(m.status, 'PAR');
  m.status = 'SLP'; m.sleep = 3;
  b.useItem(1, 38);
  assert.equal(m.status, null);
});

test('a frozen or asleep mon at full HP gets a FULL HEAL', () => {
  const b = new Battle(data, randomTeam(data, makeRng(1)), { seed: 3, trainer: 'karen' });
  const m = b.mon(1);
  m.status = 'FRZ';
  assert.deepEqual(b.aiTryItem(), { type: 'item', item: 38 });
});

test('winning shows the trainer\'s own defeat line', () => {
  const b = new Battle(data, randomTeam(data, makeRng(1)), { seed: 4, trainer: 'will' });
  b.sides[1].party.forEach((m) => { m.hp = 0; });
  b.checkFaints();
  const texts = b.log.map((l) => l.text);
  assert.ok(texts.includes('You defeated ELITE FOUR WILL!'), texts.slice(-3).join(' | '));
  assert.ok(texts.includes("WILL: I… I can't… believe it…"));
});
