import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planAnimation, BG_CSS } from '../anims.js';

const audio = JSON.parse(readFileSync(new URL('../audio.json', import.meta.url)));
const data = JSON.parse(readFileSync(new URL('../data.json', import.meta.url)));
const moveId = (name) => Object.keys(data.moves).find((k) => data.moves[k].name === name);

test('Thunderbolt: SFX_THUNDERSHOCK after anim_wait 16 and two inverted flashes', () => {
  const plan = planAnimation(audio, moveId('THUNDERBOLT'));
  // anim_wait n holds the script for n + 1 frames (RunBattleAnimCommand.CheckTimer)
  const sfx = plan.filter((e) => e.kind === 'sfx');
  assert.deepEqual(sfx.map((e) => [e.frame, e.name]), [[17, 'SFX_THUNDERSHOCK']]);
  assert.equal(sfx[0].pan, 0x0f); // anim_sound 0, 1 from the player's side
  assert.equal(planAnimation(audio, moveId('THUNDERBOLT'), { attackerIsPlayer: false }).find((e) => e.kind === 'sfx').pan, 0xf0);
  const flashes = plan.filter((e) => e.kind === 'bg' && e.effect === 'FLASH_INVERTED');
  assert.deepEqual(flashes.map((e) => e.frame), [17, 82]);
  assert.equal(flashes[0].css, BG_CSS.FLASH_INVERTED.css);
  assert.equal(plan.at(-1).kind, 'end');
});

test('every move 1-251 gives a finite timeline whose sounds exist', () => {
  for (let id = 1; id <= 251; id++) {
    const plan = planAnimation(audio, String(id));
    const end = plan.at(-1);
    assert.equal(end.kind, 'end');
    assert.ok(end.frame > 0 && end.frame <= 359, `move ${id}: ${end.frame}`);
    for (const e of plan) if (e.kind === 'sfx') assert.ok(audio.sfxIds[e.name], `${id} ${e.name}`);
  }
});

test('anim_loop and anim_call resolve to a bounded timeline', () => {
  // EnemyDamage: hide/show the target, anim_loop 3
  const plan = planAnimation(audio, 'enemyDamage');
  const bg = plan.filter((e) => e.kind === 'bg').map((e) => `${e.effect}:${e.mon}`);
  assert.deepEqual(bg, Array(3).fill(['HIDE_MON:enemy', 'SHOW_MON:enemy']).flat());
  assert.ok(plan.at(-1).frame < 60);
  // EnemyStatDown starts with anim_call BattleAnim_UserObj_1Row and still ends
  const down = planAnimation(audio, 'enemyStatDown');
  assert.ok(down.some((e) => e.kind === 'bg' && e.effect === 'VIBRATE_MON'));
  assert.ok(down.at(-1).frame < 359);
});

test('send-out plays the ball poof and slides the mon in', () => {
  const plan = planAnimation(audio, 'sendOutMon', { attackerIsPlayer: false });
  assert.deepEqual(plan.filter((e) => e.kind !== 'obj' && e.kind !== 'end').map((e) => e.name || `${e.effect}:${e.mon}`),
    ['SFX_BALL_POOF', 'ENTER_MON:enemy']);
});
