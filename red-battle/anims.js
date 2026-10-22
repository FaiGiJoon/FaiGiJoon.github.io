// Crystal battle-animation script player (engine/battle_anims/anim_commands.asm).
// planAnimation() steps a script from audio.json frame by frame and returns a timeline;
// app.js turns it into sounds (gbsound) and CSS effects. Object/particle sprites are not drawn.

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

// animKey: a move id ('85') or a special ('enemyDamage', 'sendOutMon', ...).
// param is wBattleAnimParam (0 unless the move sets it, e.g. multi-hit counts).
// Frames are counted from the script's first command; the last entry is {kind: 'end'}.
export function planAnimation(audioData, animKey, { attackerIsPlayer = true, param = 0 } = {}) {
  const entry = audioData.anims[animKey];
  if (!entry) return [{ frame: 0, kind: 'end' }];
  const { rd, sfxById } = reader(audioData);
  const turn = attackerIsPlayer ? 0 : 1;
  const out = [];
  const s = { pc: entry.addr, parent: 0, inSub: false, inLoop: false, loops: 0, delay: 0, v: 0, param, stop: false };
  const byte = () => rd(s.pc++);
  const word = () => { const lo = byte(); return lo | (byte() << 8); };
  let frame = 0;
  const runScript = () => {
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
          // gfx/object/palette commands: skipped, kept for a later sprite port. anim_checkpokeball
          // would set the param from the ball result; it is left unchanged (no catching here).
          s.pc = start + (cmd ? cmd.length - 1 : 0);
          out.push({ frame, kind: 'obj', op: cmd ? cmd.name : op });
      }
    }
    s.stop = true; // runaway script
  };
  for (; frame < MAX_FRAMES && !s.stop; frame++) {
    if (s.delay) s.delay--; // RunBattleAnimCommand.CheckTimer
    else runScript();
  }
  out.push({ frame, kind: 'end' });
  return out;
}
