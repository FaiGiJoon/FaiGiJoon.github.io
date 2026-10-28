import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { World, COLL, DIRS } from '../engine.js';
import content from '../content.js';
import { LEADER_KEYS, GYM_KEYS } from '../../red-battle/engine.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../data/${f}`, import.meta.url)));
const city = load('goldenrod.json');
const fanClub = load('fan-club.json');
const trainers = JSON.parse(readFileSync(new URL('../../red-battle/trainers.json', import.meta.url)));
const audio = JSON.parse(readFileSync(new URL('../../red-battle/audio.json', import.meta.url)));

// Tiles the player can reach from `start`, walking around NPCs.
function reachable(w, start) {
  const seen = new Set([`${start.x},${start.y}`]);
  const queue = [start];
  while (queue.length) {
    const c = queue.shift();
    for (const [dx, dy] of Object.values(DIRS)) {
      const n = { x: c.x + dx, y: c.y + dy };
      const k = `${n.x},${n.y}`;
      if (!seen.has(k) && w.isWalkable(n.x, n.y) && w.collisionAt(n.x, n.y) !== COLL.DOOR) { seen.add(k); queue.push(n); }
    }
  }
  return seen;
}

function canTalkTo(w, seen, t) {
  return Object.entries(DIRS).some(([dir, [dx, dy]]) => {
    const from = { x: t.x - dx, y: t.y - dy };
    return seen.has(`${from.x},${from.y}`) && w.facing(from, dir);
  });
}

test('the Fan Club is the real POKéMON FAN CLUB room with the HOUSE palette', () => {
  assert.equal(fanClub.source.sha1, 'f4cd194bdee0d04ca4eac29e09b8e4e9d818c133');
  assert.deepEqual([fanClub.map.width, fanClub.map.height], [5, 4]);
  // LoadSpecialMapPalette: house maps use one palette set at every time of day
  assert.deepEqual(fanClub.palettes.bg.morn, fanClub.palettes.bg.nite);
});

test('the old PP Speech House door opens the Fan Club', () => {
  const b = new World(city, content).buildingAt(33, 9);
  assert.equal(b.kind, 'map');
  assert.equal(b.map, 'fanClub');
  const w = new World(city, content);
  assert.ok(w.isWalkable(content.fanClub.exit.x, content.fanClub.exit.y), 'the player comes out on open floor');
});

test('every Johto GYM LEADER sits in the Fan Club and can be talked to', () => {
  const w = new World(fanClub, content.fanClub);
  const keys = w.npcs.filter((n) => n.trainer).map((n) => n.trainer);
  assert.deepEqual([...keys].sort(), [...LEADER_KEYS].sort());
  const start = content.fanClub.start;
  assert.equal(w.collisionAt(start.x, start.y), COLL.WARP_DOWN);
  assert.equal(w.tryStep(start, 'down').kind, 'exit');
  const seen = reachable(w, start);
  for (const n of w.npcs) {
    assert.equal(w.collisionAt(n.x, n.y), COLL.FLOOR, `${n.sprite} at ${n.x},${n.y}`);
    assert.ok(fanClub.sprites[n.sprite], `sprite ${n.sprite} extracted`);
    if (n.trainer) assert.ok(trainers[n.trainer], n.trainer);
    assert.ok(canTalkTo(w, seen, n), `${n.trainer || n.sprite} can't be reached`);
  }
  for (const k of Object.keys(content.fanClub.signs)) {
    const [x, y] = k.split(',').map(Number);
    assert.ok(canTalkTo(w, seen, { x, y }), `sign ${k}`);
  }
});

test('the Gym still holds exactly the Elite Four, LANCE and RED', () => {
  const keys = content.gym.npcs.filter((n) => n.trainer).map((n) => n.trainer);
  assert.deepEqual([...keys].sort(), [...GYM_KEYS].sort());
});

test('each room plays its own Crystal music', () => {
  for (const room of ['gym', 'fanClub']) assert.ok(audio.songs[content[room].music], room);
  assert.ok(audio.songs.goldenrodCity);
});

test('the story characters walk Goldenrod and can all be talked to', () => {
  const w = new World(city, content, { random: () => 0.5 });
  const seen = reachable(w, content.start);
  const names = w.npcs.map((n) => n.sprite);
  for (const s of ['ELM', 'OAK', 'RIVAL', 'KRIS', 'BILL', 'MOM', 'KURT']) assert.ok(names.includes(s), s);
  for (const n of w.npcs) {
    assert.ok(city.sprites[n.sprite], `sprite ${n.sprite} extracted`);
    assert.ok(canTalkTo(w, seen, n), `${n.sprite} at ${n.x},${n.y} can't be reached`);
  }
  // and no one blocks a door
  for (const warp of city.warps) {
    const below = { x: warp.x, y: warp.y + 1 };
    assert.ok(!w.npcAt(below.x, below.y), `someone stands in front of the door at ${warp.x},${warp.y}`);
  }
});
