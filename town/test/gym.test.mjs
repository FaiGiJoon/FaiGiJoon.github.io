import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { World, COLL, DIRS, speech } from '../engine.js';
import content from '../content.js';
import { Font } from '../font.js';

const gymData = JSON.parse(readFileSync(new URL('../data/goldenrod-gym.json', import.meta.url)));
const cityData = JSON.parse(readFileSync(new URL('../data/goldenrod.json', import.meta.url)));
const trainers = JSON.parse(readFileSync(new URL('../../red-battle/trainers.json', import.meta.url)));
const gym = () => new World(gymData, content.gym, { random: () => 0.5 });

test('goldenrod-gym.json is the real Goldenrod Gym from the ROM', () => {
  assert.equal(gymData.source.sha1, 'f4cd194bdee0d04ca4eac29e09b8e4e9d818c133');
  assert.equal(gymData.map.width, 10);
  assert.equal(gymData.map.height, 9);
  assert.deepEqual(gymData.warps.map((w) => [w.x, w.y]), [[2, 17], [3, 17]]);
});

test('the city gym door leads into the gym map', () => {
  const door = new World(cityData, content).buildingAt(24, 7);
  assert.equal(door.kind, 'map');
  assert.equal(door.map, 'gym');
});

test('the gym holds the Elite Four, LANCE and RED, each with a trainer to battle', () => {
  const w = gym();
  const keys = w.npcs.filter((n) => n.trainer).map((n) => n.trainer).sort();
  assert.deepEqual(keys, ['bruno', 'karen', 'koga', 'lance', 'red', 'will']);
  for (const n of w.npcs) {
    assert.equal(w.collisionAt(n.x, n.y), COLL.FLOOR, `${n.sprite} at ${n.x},${n.y}`);
    assert.ok(gymData.sprites[n.sprite], `sprite ${n.sprite} extracted`);
    if (n.trainer) assert.ok(trainers[n.trainer], n.trainer);
    else assert.ok(n.text, n.sprite);
  }
});

test('the player arrives on the entrance mat and can walk out from it', () => {
  const w = gym();
  const { x, y } = content.gym.start;
  assert.equal(w.collisionAt(x, y), COLL.WARP_DOWN);
  assert.equal(w.tryStep({ x, y }, 'down').kind, 'exit');
  assert.equal(w.tryStep({ x, y }, 'up').kind, 'move');
});

test('every trainer and statue can be reached and faced from the entrance', () => {
  const w = gym();
  const start = content.gym.start;
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length) {
    const c = queue.shift();
    for (const [dx, dy] of Object.values(DIRS)) {
      const n = { x: c.x + dx, y: c.y + dy };
      const k = `${n.x},${n.y}`;
      if (!seen.has(k) && w.isWalkable(n.x, n.y)) { seen.add(k); queue.push(n); }
    }
  }
  const targets = [...w.npcs, ...Object.keys(content.gym.signs).map((k) => { const [x, y] = k.split(',').map(Number); return { x, y, sprite: `sign ${k}` }; })];
  for (const t of targets) {
    const ok = Object.entries(DIRS).some(([dir, [dx, dy]]) => {
      const from = { x: t.x - dx, y: t.y - dy };
      return seen.has(`${from.x},${from.y}`) && w.facing(from, dir);
    });
    assert.ok(ok, `${t.trainer || t.sprite} can't be reached`);
  }
});

test('trainer speech comes from the ROM and fits the Crystal font', () => {
  const font = new Font(cityData.font);
  for (const [key, t] of Object.entries(trainers)) {
    const lines = speech(t.text.before);
    assert.ok(lines.length, key);
    for (const l of lines) for (const ch of l) assert.ok(font.has(ch), `${key}: "${ch}" in ${l}`);
  }
  assert.ok(speech(trainers.lance.text.before)[0].startsWith("LANCE: I've been waiting"));
  assert.ok(!speech(trainers.will.text.before).join(' ').includes('{PLAYER}'));
});
