// Crystal battle-animation script player (engine/battle_anims/anim_commands.asm).
// planAnimation() steps a script from audio.json frame by frame and returns a timeline;
// app.js turns it into sounds (gbsound) and CSS effects. Object/particle sprites are not drawn.

import { AnimObjects } from './animobj.js';

export const FRAME_HZ = 59.7275;
const MAX_FRAMES = Math.round(6 * FRAME_HZ);
const PAN = [0xf0, 0x0f, 0xf0, 0x0f]; // BattleAnimCmd_Sound.GetPanning
const CRY_DATA = [[0, 0xc0], [0, 0x40], [0, 0], [0, 0]]; // BattleAnimCmd_Cry.CryData: +pitch, +length

// BG effects shown as CSS. screen: on the whole .gb screen; otherwise on one mon's sprite.
export const BG_CSS = {
  FLASH_INVERTED: { css: 'fx-invert', screen: true, ms: 250 },
  RAPID_FLASH: { css: 'fx-invert-rapid', screen: true, ms: 600 },
  CYCLE_BGPALS_INVERTED: { css: 'fx-invert-rapid', screen: true, ms: 600 },
  FLASH_WHITE: { css: 'fx-white', screen: true, ms: 300 },
  WHITE_HUES: { css: 'fx-white', screen: true, ms: 500 },
  BLACK_HUES: { css: 'fx-dark', screen: true, ms: 700 },
  FADE_MON_TO_BLACK: { css: 'fx-dark', ms: 700 },
  FADE_MON_TO_BLACK_REPEATING: { css: 'fx-dark', ms: 900 },
  FADE_MONS_TO_BLACK_REPEATING: { css: 'fx-dark', screen: true, ms: 900 },
  SHAKE_SCREEN_X: { css: 'fx-shake-x', screen: true, ms: 600 },
  SHAKE_SCREEN_Y: { css: 'fx-shake-y', screen: true, ms: 600 },
  WOBBLE_SCREEN: { css: 'fx-shake-x', screen: true, ms: 600 },
  HIDE_MON: { css: 'fx-hide', ms: 0 },
  REMOVE_MON: { css: 'fx-hide', ms: 0 },
  SHOW_MON: { css: 'fx-show', ms: 0 },
  TACKLE: { css: 'fx-lunge', ms: 400 },
  BODY_SLAM: { css: 'fx-lunge', ms: 400 },
  VITAL_THROW: { css: 'fx-lunge', ms: 400 },
  ROLLOUT: { css: 'fx-lunge', ms: 400 },
  FLAIL: { css: 'fx-lunge', ms: 400 },
  FLASH_MON_REPEATING: { css: 'fx-blink', ms: 700 },
  VIBRATE_MON: { css: 'fx-wobble', ms: 600 },
  WOBBLE_MON: { css: 'fx-wobble', ms: 600 },
  WAVE_DEFORM_MON: { css: 'fx-wobble', ms: 600 },
  PSYCHIC: { css: 'fx-wobble', ms: 800 },
  ENTER_MON: { css: 'fx-enter', ms: 400 },
  RETURN_MON: { css: 'fx-return', ms: 400 },
};

const readers = new WeakMap();
function reader(audioData) {
  if (!readers.has(audioData)) {
    const mem = new Map();
    for (const b of audioData.blocks) {
      if (b.bank !== 0x32) continue;
      for (let i = 0; i < b.hex.length / 2; i++) mem.set(b.addr + i, parseInt(b.hex.substr(i * 2, 2), 16));
    }
    const sfxById = new Map(Object.entries(audioData.sfxIds).map(([name, s]) => [s.id, name]));
    readers.set(audioData, { rd: (a) => mem.get(a) ?? 0xff, sfxById });
  }
  return readers.get(audioData);
}

// Steps one animation script frame by frame like RunBattleAnimScript: each frame runs the
// script command(s) (RunBattleAnimCommand), then every animation object (BattleAnim_UpdateOAM_All).
// objData (animobj.json) is optional; without it the object commands are only reported.
export class BattleAnimPlayer {
  constructor(audioData, animKey, { attackerIsPlayer = true, param = 0, objData = null, moveId = 0 } = {}) {
    const entry = audioData.anims[animKey];
    this.audio = audioData;
    this.r = reader(audioData);
    this.turn = attackerIsPlayer ? 0 : 1;
    this.s = { pc: entry ? entry.addr : 0, parent: 0, inSub: false, inLoop: false, loops: 0, delay: 0, v: 0, param, stop: !entry };
    this.frame = 0;
    this.objects = objData ? new AnimObjects(objData) : null;
    if (this.objects) {
      this.objects.turn = this.turn;
      this.objects.fxAnimId = moveId;
    }
  }

  get done() { return this.s.stop || this.frame >= MAX_FRAMES; }

  // Runs one frame; returns that frame's events (sfx/cry/bg/obj)
  step() {
    const out = [];
    if (this.done) return out;
    const s = this.s;
    if (s.delay) s.delay--; // RunBattleAnimCommand.CheckTimer
    else this.runScript(out);
    this.bgEffects(out);
    if (this.objects) this.objects.updateAll();
    this.frame++;
    return out;
  }

  // _ExecuteBGEffects, for the part that touches objects: on their first frame the
  // BATTLEROBJ_1ROW/2ROW effects add an object showing part of the mon (BattleBGEffect_BattlerObj_*)
  bgEffects(out) {
    const objs = this.objects;
    if (!objs) return;
    for (const e of out) {
      if (e.kind !== 'bg' || !/^BATTLEROBJ_(1|2)ROW$/.test(e.effect)) continue;
      const rows = e.effect[11];
      const name = e.mon === 'player' ? `PLAYERHEAD_${rows}ROW` : `ENEMYFEET_${rows}ROW`;
      objs.queue(objs.objIds[name], e.mon === 'player' ? 6 * 8 : 16 * 8 + 4, 8 * 8, 0);
    }
  }

  runScript(out) {
    const { rd, sfxById } = this.r;
    const s = this.s; const frame = this.frame; const turn = this.turn; const objs = this.objects;
    const audioData = this.audio;
    const byte = () => rd(s.pc++);
    const word = () => { const lo = byte(); return lo | (byte() << 8); };
    for (let n = 0; n < 512; n++) {
      const op = byte();
      if (op === 0xff) { // anim_ret
        if (!s.inSub) { s.stop = true; return; }
        s.inSub = false;
        s.pc = s.parent;
        continue;
      }
      if (op < 0xd0) { s.delay = op; return; } // anim_wait: delay op, so op + 1 frames
      const cmd = audioData.animCommands[op];
      const start = s.pc;
      switch (op) {
        case 0xd0: { // anim_obj id, x, y, param
          const id = byte(); const x = byte(); const y = byte(); const p = byte();
          if (objs) objs.queue(id, x, y, p);
          out.push({ frame, kind: 'obj', op: 'anim_obj', id });
          break;
        }
        case 0xd1: case 0xd2: case 0xd3: case 0xd4: case 0xd5: { // anim_Ngfx
          const ids = [];
          for (let k = 0; k < (op & 0xf); k++) ids.push(byte());
          if (objs) objs.loadGfx(ids);
          break;
        }
        case 0xd6: { const id = byte(); if (objs) objs.incObj(id); break; } // anim_incobj
        case 0xd7: { const id = byte(); const v = byte(); if (objs) objs.setObj(id, v); break; } // anim_setobj
        case 0xd9: case 0xda: if (objs) objs.battlerGfx(op === 0xd9); break; // anim_battlergfx_2row/1row
        case 0xdf: if (objs) objs.obp0 = 0xe0; break; // anim_resetobp0
        case 0xe5: if (objs) objs.clearObjs(); break; // anim_clearobjs
        case 0xf2: { const v = byte(); if (objs) objs.obp0 = v; break; } // anim_obp0
        case 0xe0: { // anim_sound duration, tracks, id
          const t = byte() & 3;
          const name = sfxById.get(byte());
          if (name) out.push({ frame, kind: 'sfx', name, pan: PAN[turn ? t ^ 1 : t] });
          break;
        }
        case 0xe1: { // anim_cry: the attacker's cry
          const [pitch, length] = CRY_DATA[byte() & 3];
          out.push({ frame, kind: 'cry', pitch, length, tracks: turn ? 0x0f : 0xf0 });
          break;
        }
        case 0xf0: { // anim_bgeffect effect, jumptable, battle turn, unknown
          const effect = (audioData.bgEffects[byte()] || '').replace('BATTLE_BG_EFFECT_', '');
          byte();
          const p3 = byte();
          byte();
          // BGEffect_CheckBattleTurn: nz -> the player's side
          const mon = ((turn & 1) ^ p3) ? 'player' : 'enemy';
          out.push({ frame, kind: 'bg', effect, mon, ...(BG_CSS[effect] || {}) });
          break;
        }
        case 0xfe: { const to = word(); s.parent = s.pc; s.pc = to; s.inSub = true; break; } // anim_call (one level)
        case 0xfc: s.pc = word(); break; // anim_jump
        case 0xfd: { // anim_loop count, address (0 = forever, capped by MAX_FRAMES)
          let count = byte();
          if (!s.inLoop) {
            if (count === 0) { s.pc = word(); break; }
            s.inLoop = true;
            s.loops = --count;
          }
          if (s.loops === 0) { s.inLoop = false; s.pc += 2; break; }
          s.loops--;
          s.pc = word();
          break;
        }
        case 0xef: // anim_jumpuntil: loops while wBattleAnimParam counts down
          if (s.param) { s.param--; s.pc = word(); } else s.pc += 2;
          break;
        case 0xee: { const m = byte(); if (s.param & m) s.pc = word(); else s.pc += 2; break; } // anim_if_param_and
        case 0xf8: { const v = byte(); if (s.param === v) s.pc = word(); else s.pc += 2; break; } // anim_if_param_equal
        case 0xf9: s.v = byte(); break; // anim_setvar
        case 0xfa: s.v = (s.v + 1) & 0xff; break; // anim_incvar
        case 0xfb: { const v = byte(); if (s.v === v) s.pc = word(); else s.pc += 2; break; } // anim_if_var_equal
        default:
          // palettes, pic/transform and other commands: skipped. anim_checkpokeball would set the
          // param from the ball result; it is left unchanged (no catching here).
          s.pc = start + (cmd ? cmd.length - 1 : 0);
          out.push({ frame, kind: 'obj', op: cmd ? cmd.name : op });
      }
    }
    s.stop = true; // runaway script
  }
}

// animKey: a move id ('85') or a special ('enemyDamage', 'sendOutMon', ...).
// param is wBattleAnimParam (0 unless the move sets it, e.g. multi-hit counts).
// Frames are counted from the script's first command; the last entry is {kind: 'end'}.
export function planAnimation(audioData, animKey, opts = {}) {
  const p = new BattleAnimPlayer(audioData, animKey, opts);
  const out = [];
  while (!p.done) out.push(...p.step());
  out.push({ frame: p.frame, kind: 'end' });
  return out;
}
