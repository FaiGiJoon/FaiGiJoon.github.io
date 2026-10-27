// Battle-animation objects: a port of pokecrystal engine/battle_anims/core.asm, helpers.asm and
// functions.asm (the per-object movement callbacks). Objects live in a 10 x 17-byte array laid
// out exactly like wActiveAnimObjects, so the port can be checked byte for byte against the
// original routines (tools/sm83.mjs + test/animobj-oracle.test.mjs). Data comes from animobj.json.

export const IDX = 0; export const FLAGS = 1; export const FIXY = 2; export const FS = 3; export const FN = 4;
export const PAL = 5; export const TILE = 6; export const X = 7; export const Y = 8; export const XO = 9;
export const YO = 10; export const PARAM = 11; export const DUR = 12; export const FRAME = 13; export const JT = 14;
export const V1 = 15; export const V2 = 16;
export const STRUCT_LEN = 0x18; // 17 fields + 7 unused bytes
export const NUM_OBJS = 10;
export const BASE_TILE = 7 * 7;

const OAM_PRIO = 0x80; const OAM_YFLIP = 0x40; const OAM_XFLIP = 0x20; const OAM_PAL1 = 0x10;
const FIX_COORDS = 1;
const KINESIS = 134; const SOFTBOILED = 135; const MILK_DRINK = 208;
const GUST_OFFSETS = [8, 6, 5, 4, 5, 6, 8, 12, 16];
const AMNESIA_OFFSETS = [0xec, 0xf8, 0x00];
const SKY_ATTACK_PALS = [0xff, 0xaa, 0x55, 0xaa];
const PAL_BATTLE_OB_GRAY = 2;

const sra = (a) => (a >> 1) | (a & 0x80);
const neg = (a) => (-a) & 0xff;

export class AnimObjects {
  constructor(data) {
    this.data = data;
    this.fs = Object.fromEntries(data.framesetNames.map((n, i) => [n, i]));
    this.objIds = Object.fromEntries(data.objNames.map((n, i) => [n, i]));
    this.mem = new Uint8Array(NUM_OBJS * STRUCT_LEN);
    this.tileDict = new Uint8Array(10); // wBattleAnimTileDict: 5 x (gfx id, tile offset)
    this.lastIndex = 0; // wLastAnimObjectIndex
    this.turn = 0; // hBattleTurn
    this.fxAnimId = 0; // wFXAnimID (move id)
    this.obp0 = 0xe4; // wOBP0
    this.oam = new Uint8Array(160); // wShadowOAM
    this.vram = new Uint8Array(0x80 * 16); // vTiles0, object tiles
    this.funcs = buildFunctions(this);
  }

  slot(i) { return this.mem.subarray(i * STRUCT_LEN, (i + 1) * STRUCT_LEN); }

  // ---- core.asm ----
  queue(id, x, y, param) { // QueueBattleAnimation
    for (let i = 0; i < NUM_OBJS; i++) {
      const o = this.slot(i);
      if (o[IDX]) continue;
      this.lastIndex = (this.lastIndex + 1) & 0xff;
      const def = this.data.objects[id] || [0, 0, 0, 0, 0, 0];
      o[IDX] = this.lastIndex;
      o[FLAGS] = def[0]; o[FIXY] = def[1]; o[FS] = def[2]; o[FN] = def[3]; o[PAL] = def[4];
      o[TILE] = this.tileOffset(def[5]);
      o[X] = x; o[Y] = y; o[XO] = 0; o[YO] = 0; o[PARAM] = param;
      o[DUR] = 0; o[FRAME] = 0xff; o[JT] = 0; o[V1] = 0; o[V2] = 0;
      return true;
    }
    return false;
  }

  tileOffset(gfx) { // GetBattleAnimTileOffset
    for (let k = 0; k < 5; k++) if (this.tileDict[k * 2] === gfx) return this.tileDict[k * 2 + 1];
    return 0;
  }

  // anim_1gfx..anim_5gfx: load object graphics after the mon pic tiles
  loadGfx(ids) {
    this.tileDict.fill(0);
    let tile = 0;
    ids.forEach((id, k) => {
      if (tile >= 0x80 - BASE_TILE) return;
      this.tileDict[k * 2] = id;
      this.tileDict[k * 2 + 1] = tile;
      const g = this.data.gfx[id];
      if (g?.hex) {
        for (let i = 0; i < g.hex.length / 2; i++) {
          const a = (BASE_TILE + tile) * 16 + i;
          if (a < this.vram.length) this.vram[a] = parseInt(g.hex.substr(i * 2, 2), 16);
        }
      }
      tile = (tile + (g ? g.tiles : 0)) & 0xff;
    });
  }

  // anim_battlergfx_2row/1row: copies rows of the mon pics into object tiles. this.pics, when set,
  // holds the pics as 2bpp tiles in VRAM order: {enemy: 49 tiles (7x7), player: 36 tiles (6x6)}.
  battlerGfx(twoRow) {
    if (this.pics) {
      const put = (dst, tile) => { if (tile) this.vram.set(tile, dst * 16); };
      let dst = twoRow ? 0x80 - 12 - 14 : 0x80 - 6 - 7;
      for (let col = 0; col < 7; col++) {
        if (twoRow) put(dst++, this.pics.enemy?.[col * 7 + 5]);
        put(dst++, this.pics.enemy?.[col * 7 + 6]);
      }
      for (let col = 0; col < 6; col++) {
        put(dst++, this.pics.player?.[col * 6]);
        if (twoRow) put(dst++, this.pics.player?.[col * 6 + 1]);
      }
    }
    let k = 0;
    while (k < 4 && this.tileDict[k * 2]) k++;
    this.tileDict[k * 2] = 0x28; // BATTLE_ANIM_GFX_PLAYERHEAD
    this.tileDict[k * 2 + 1] = (twoRow ? 0x80 - 12 - 14 : 0x80 - 6 - 7) - BASE_TILE;
    if (k * 2 + 2 < this.tileDict.length) {
      this.tileDict[k * 2 + 2] = 0x29; // BATTLE_ANIM_GFX_ENEMYFEET
      this.tileDict[k * 2 + 3] = (twoRow ? 0x80 - 12 : 0x80 - 6) - BASE_TILE;
    }
  }

  find(index) {
    for (let i = 0; i < NUM_OBJS; i++) if (this.slot(i)[IDX] === index) return this.slot(i);
    return null;
  }

  incObj(index) { const o = this.find(index); if (o) o[JT]++; } // anim_incobj
  setObj(index, v) { const o = this.find(index); if (o) o[JT] = v; } // anim_setobj
  clearObjs() { this.mem.fill(0, 0, 0xa0); } // anim_clearobjs (only $a0 bytes, as in the game)

  // BattleAnim_UpdateOAM_All
  updateAll() {
    let p = 0;
    for (let i = 0; i < NUM_OBJS; i++) {
      const o = this.slot(i);
      if (!o[IDX]) continue;
      this.doFrame(o);
      p = this.oamUpdate(o, p);
      if (p < 0) return;
    }
    this.oam.fill(0, p);
  }

  doFrame(o) { // DoBattleAnimFrame
    const f = this.funcs[o[FN]];
    if (f) f(o);
  }

  // GetBattleAnimFrame: returns the oamset id or command; sets this.frameFlags
  getFrame(o) {
    const sets = this.data.framesets[o[FS]] || [[0xff]];
    for (let guard = 0; guard < 1024; guard++) {
      if (o[DUR]) {
        o[DUR]--;
        const e = sets[o[FRAME]] || [0xff, 0];
        this.frameFlags = ((e[1] ?? 0) & 0xc0) >> 1;
        return e[0];
      }
      o[FRAME]++;
      const e = sets[o[FRAME]] || [0xff];
      if (e[0] === 0xfe) { o[DUR] = 0; o[FRAME] = 0xff; continue; }
      if (e[0] === 0xff) { o[DUR] = 0; o[FRAME] -= 2; continue; }
      o[DUR] = (e[1] ?? 0) & 0x3f;
      this.frameFlags = ((e[1] ?? 0) & 0xc0) >> 1;
      return e[0];
    }
    return 0xfd;
  }

  // BattleAnimOAMUpdate (with InitBattleAnimBuffer); returns the new OAM pointer, -1 when full
  oamUpdate(o, p) {
    let flags = o[FLAGS] & OAM_PRIO;
    const pal = o[PAL];
    let tileId = o[TILE]; let x = o[X]; let y = o[Y]; let xo = o[XO]; const yo = o[YO];
    if (this.turn) {
      flags = o[FLAGS];
      if (o[FLAGS] & FIX_COORDS) {
        x = (0xb4 - o[X]) & 0xff;
        if (o[FIXY] === 0xff) y = (5 * 8 + o[Y]) & 0xff;
        else {
          y = (o[FIXY] - o[Y]) & 0xff;
          if (this.fxAnimId === KINESIS || this.fxAnimId === SOFTBOILED || this.fxAnimId === MILK_DRINK) y = (y - 8) & 0xff;
        }
        xo = neg(o[XO]);
      }
    }
    this.frameFlags = 0;
    const set = this.getFrame(o);
    if (set === 0xfd) return p;
    if (set === 0xfc) { o[IDX] = 0; return p; }
    flags = (this.frameFlags ^ flags) & (OAM_PRIO | OAM_YFLIP | OAM_XFLIP);
    const [vtile, entries] = this.data.oamsets[set] || [0, []];
    tileId = (tileId + vtile) & 0xff;
    for (const [dy, dx, t, attr] of entries) {
      const oy = flags & OAM_YFLIP ? neg((dy + 8) & 0xff) : dy;
      const ox = flags & OAM_XFLIP ? neg((dx + 8) & 0xff) : dx;
      this.oam[p] = (y + yo + oy) & 0xff;
      this.oam[p + 1] = (x + xo + ox) & 0xff;
      this.oam[p + 2] = (tileId + BASE_TILE + t) & 0xff;
      this.oam[p + 3] = ((attr ^ flags) & (OAM_PRIO | OAM_YFLIP | OAM_XFLIP)) | (attr & OAM_PAL1) | (pal & 0x0f);
      p += 4;
      if (p >= 0xa0) return -1;
    }
    return p;
  }

  // ---- functions.asm helpers ----
  sine(a, d) { // BattleAnim_Sine: a = d * sin(a * pi/32)
    a &= 0x3f;
    const h = ((d * this.data.sine[a & 0x1f]) >> 8) & 0xff;
    return a >= 0x20 ? neg(h) : h;
  }

  cosine(a, d) { return this.sine((a + 0x10) & 0xff, d); }

  reinit(o, fs) { o[FS] = fs; o[DUR] = 0; o[FRAME] = 0xff; } // ReinitBattleAnimFrameset
}

function buildFunctions(s) {
  const FSI = s.fs;
  const deinit = (o) => { o[IDX] = 0; };
  const inc = (o) => { o[JT]++; };
  const sin = (a, d) => s.sine(a, d);
  const cos = (a, d) => s.cosine(a, d);
  const pair = (o, hi, lo, de) => { // (o[hi]:o[lo]) += de, 16-bit
    const v = (((o[hi] << 8) | o[lo]) + de) & 0xffff;
    o[hi] = v >> 8; o[lo] = v & 0xff;
  };

  // BattleAnim_StepToTarget
  const stepToTarget = (o, a) => {
    a &= 0xf;
    let e = a;
    o[X] += a;
    e >>= 1;
    do { o[Y]--; e = (e - 1) & 0xff; } while (e);
  };
  // BattleAnim_StepCircle
  const stepCircle = (o, a, d) => {
    o[YO] = sra(sra(sin(a, d)));
    o[XO] = cos(a, d);
  };
  // BattleAnim_StepThrownToTarget; k is the struct field the caller left in hl (decremented first)
  const stepThrown = (o, k, a) => {
    o[k]--;
    o[YO] = sin(a, 0x20);
    o[FIXY] += 2;
    const p = o[PARAM];
    pair(o, X, V1, ((p & 0xf) << 4) | ((p & 0xf0) >> 4) << 8);
    if (o[V2] & 1) return;
    o[Y]--;
  };
  // BattleAnim_ScatterHorizontal
  const scatter = (o) => {
    const a = o[PARAM];
    if (!(a & 0x80)) return a >= 0x20 ? 0x100 : a >= 0x18 ? 0x180 : 0x200;
    const b = a & 0x3f;
    return b >= 0x20 ? 0x10000 - 0x100 : b >= 0x18 ? 0x10000 - 0x180 : 0x10000 - 0x200;
  };

  const throwFromUserToTarget = (o) => { // returns carry (still flying)
    if (o[X] >= 0x88) return false;
    o[X] += 2;
    o[Y]--;
    const a = o[V1]; o[V1]--;
    o[YO] = sin(a, o[PARAM]);
    return true;
  };

  const moveInCircle = (o) => {
    if (o[JT] === 0) {
      inc(o);
      o[V1] = o[PARAM] & 0x80 ? 0x20 : 0;
      o[PARAM] &= 0x7f;
    } else if (o[JT] !== 1) return;
    const a = o[V1]; const d = o[PARAM];
    o[YO] = sin(a, d);
    o[XO] = cos(a, d);
    o[V1]++;
  };

  const getBallAnimPal = (o) => { o[PAL] = PAL_BATTLE_OB_GRAY; }; // wCurItem is never a ball here

  const F = [];
  F.push((o) => { if (o[JT] === 1) deinit(o); }); // Null
  F.push((o) => { // MoveFromUserToTarget
    if (o[JT] === 1) { deinit(o); return; }
    if (o[JT] !== 0) return;
    if (o[X] >= 0x84) return;
    stepToTarget(o, o[PARAM]);
  });
  F.push((o) => { // MoveFromUserToTargetAndDisappear
    if (o[X] >= 0x84) { deinit(o); return; }
    stepToTarget(o, o[PARAM]);
  });
  F.push(moveInCircle); // MoveInCircle
  F.push((o) => { // MoveWaveToTarget
    if (o[X] >= 0x88) { deinit(o); return; }
    o[X] += 2;
    o[Y]--;
    const a = o[V1]; o[V1] += 4;
    o[YO] = sin(a, 0x10);
    o[XO] = sra(sra(sra(sra(cos(a, 0x10)))));
  });
  F.push((o) => { throwFromUserToTarget(o); }); // ThrowFromUserToTarget
  F.push((o) => { if (!throwFromUserToTarget(o)) deinit(o); }); // ThrowFromUserToTargetAndDisappear
  F.push((o) => { // Drop
    if (o[JT] === 0) { inc(o); o[V1] = 0x30; o[V2] = 0x48; } else if (o[JT] !== 1) return;
    o[YO] = sin(o[V1], o[V2]);
    o[V1]++;
    if (o[V1] & 0x3f) return;
    o[V1] = 0x20;
    const a = o[V2] - o[PARAM];
    if (a <= 0) { deinit(o); return; }
    o[V2] = a;
  });
  F.push((o) => { // MoveFromUserToTargetSpinAround
    const setCoords = () => {
      o[X] += o[PARAM] & 0xf;
      let e = (o[PARAM] & 0xf) >> 1;
      do { o[Y]--; e = (e - 1) & 0xff; } while (e);
    };
    switch (o[JT]) {
      case 0:
        if (o[X] < 0x80) { setCoords(); return; }
        inc(o);
        // fallthrough
      case 1:
        inc(o);
        o[V1] = 0;
        // fallthrough
      case 2: {
        if (o[V1] < 0x40) {
          o[YO] = sra((cos(o[V1], 0x18) - 0x18) & 0xff);
          o[XO] = sin(o[V1], 0x18);
          o[V1] += o[PARAM] & 0xf;
          return;
        }
        const hi = o[PARAM] & 0xf0;
        if (hi) { o[PARAM] = ((hi - 0x10) | (o[PARAM] & 0xf)); o[JT]--; return; }
        inc(o);
      }
      // fallthrough
      case 3:
        if (o[X] >= 0xb0) { deinit(o); return; }
        setCoords();
        return;
      default:
    }
  });
  F.push((o) => { // Shake
    switch (o[JT]) {
      case 0:
        inc(o);
        o[V1] = 0;
        o[XO] = o[PARAM] & 0xf;
        // fallthrough
      case 1:
        if (o[V1]) { o[V1]--; return; }
        o[V1] = (o[PARAM] >> 4) & 0xf;
        o[XO] = neg(o[XO]);
        return;
      case 2: deinit(o); return;
      default:
    }
  });
  F.push((o) => { // FireBlast
    const eight = () => {
      const a = o[V1];
      o[YO] = sin(a, 0x10);
      o[XO] = cos(a, 0x10);
      o[V1]++;
    };
    const seven = () => {
      if (o[X] >= 0x88) { inc(o); s.reinit(o, FSI.EMBER); eight(); return; }
      o[X] += 2;
      o[Y]--;
    };
    switch (o[JT]) {
      case 0:
        o[JT] = o[PARAM];
        if (o[PARAM] === 7) { seven(); return; }
        s.reinit(o, FSI.BURNED);
        return;
      case 1: o[YO]--; return;
      case 4: o[YO]++; o[XO]--; return;
      case 2: o[XO]--; return;
      case 5: o[YO]++; o[XO]++; return;
      case 3: o[XO]++; return;
      case 6: return;
      case 7: seven(); return;
      case 8: eight(); return;
      case 9: deinit(o); return;
      default:
    }
  });
  F.push((o) => { // RazorLeaf
    const sineCosine = () => {
      const d = o[PARAM] & 0x3f;
      const a = o[V1]; o[V1]--;
      o[YO] = sin(a, d);
      pair(o, X, V2, scatter(o));
    };
    switch (o[JT]) {
      case 0: inc(o); o[V1] = 0x40;
      // fallthrough
      case 1:
        if (o[V1] >= 0x30) { sineCosine(); return; }
        inc(o);
        o[V1] = 0; o[V2] = 0;
        s.reinit(o, FSI.RAZOR_LEAF_2);
        if (o[PARAM] & 0x40) o[FRAME] = 5;
        return;
      case 2:
        if (o[YO] === 0x20) { deinit(o); return; }
        o[XO] = sin(o[V1], 0x10);
        if (o[PARAM] & 0x40) o[V1]--; else o[V1]++;
        pair(o, YO, V2, 0x80);
        return;
      case 3:
        s.reinit(o, FSI.RAZOR_LEAF_1);
        o[FLAGS] &= ~OAM_XFLIP;
        // fallthrough
      case 4: case 5: case 6: case 7: inc(o); return;
      case 8:
        if (o[X] >= 0xc0) return;
        stepToTarget(o, 8);
        return;
      default:
    }
  });
  F.push((o) => { // Bubble
    switch (o[JT]) {
      case 0: inc(o); o[V1] = 0xc;
      // fallthrough
      case 1:
        if (o[V1]) { o[V1]--; stepToTarget(o, o[PARAM]); return; }
        inc(o);
        o[V1] = 0;
        s.reinit(o, FSI.PULSING_BUBBLE);
        // fallthrough
      case 2:
        if (o[X] < 0x98) pair(o, X, V1, 0x60);
        if (o[Y] < 0x20) return;
        pair(o, Y, V2, 0xff00 | (o[PARAM] & 0xf0));
        return;
      default:
    }
  });
  F.push((o) => { // Surf (the LY-override scanline wave is not drawn)
    switch (o[JT]) {
      case 0: inc(o); return;
      case 1: {
        if (o[Y] < o[PARAM]) { inc(o); return; }
        o[Y]--;
        const a = sin(o[V1], 0x10);
        o[YO] = a;
        if (((a + o[Y]) & 0xff) < 0x10) return; // sub $10; ret c (writes hLYOverrideStart otherwise)
        o[XO] = (o[XO] + 1) & 7;
        o[V1] += 2;
        return;
      }
      case 2: return;
      case 3:
        if (o[Y] < 0x70) { o[Y] += 2; return; }
        // fallthrough
      case 4: deinit(o); return;
      default:
    }
  });
  F.push((o) => { // Sing
    if (o[JT] === 0) { inc(o); s.reinit(o, (FSI.MUSIC_NOTE_1 + o[PARAM]) & 0xff); } else if (o[JT] !== 1) return;
    if (o[X] >= 0xb8) { deinit(o); return; }
    stepToTarget(o, 2);
    const a = o[V1]; o[V1]--;
    o[YO] = sin(a, 8);
  });
  F.push((o) => { // WaterGun
    switch (o[JT]) {
      case 0: inc(o);
      // fallthrough
      case 1: {
        if (o[Y] >= 0x30) {
          stepToTarget(o, 2);
          const a = o[V1]; o[V1]--;
          o[YO] = sin(a, 8);
          return;
        }
        inc(o);
        s.reinit(o, FSI.WATER_GUN_2);
        o[YO] = 0;
        o[Y] = 0x30;
        o[FLAGS] &= FIX_COORDS;
      }
      // fallthrough
      case 2:
        if (o[YO] < 0x18) { o[YO]++; return; }
        inc(o);
        s.reinit(o, FSI.WATER_GUN_3);
        return;
      default:
    }
  });
  F.push((o) => { // Ember
    switch (o[JT]) {
      case 0: o[JT] = (o[PARAM] >> 4) & 0xf; return;
      case 1:
        if (o[X] >= 0x88) return;
        stepToTarget(o, o[PARAM]);
        return;
      case 2: deinit(o); return;
      case 3: inc(o); s.reinit(o, FSI.FLAMETHROWER); return;
      default:
    }
  });
  F.push((o) => { // Powder
    if (o[YO] >= 0x38) { deinit(o); return; }
    pair(o, YO, V1, 0x80);
    o[XO] ^= 0x10;
  });
  F.push((o) => { // PokeBall
    const swing = () => {
      o[YO] = sin(o[V1], o[V2]);
      o[V1]--;
      const a = o[V1];
      if (!(a & 0x1f)) { deinit(o); return; }
      if (a & 0xf) return;
      inc(o);
    };
    switch (o[JT]) {
      case 0: getBallAnimPal(o); inc(o); return;
      case 1:
        if (throwFromUserToTarget(o)) return;
        o[Y] += o[YO];
        s.reinit(o, FSI.POKE_BALL_3);
        inc(o);
        return;
      case 3:
        inc(o);
        s.reinit(o, FSI.POKE_BALL_1);
        o[V1] = 0; o[V2] = 0x10;
        // fallthrough
      case 4: {
        o[YO] = sin(o[V1], o[V2]);
        o[V1]--;
        if (o[V1] & 0x1f) return;
        o[V1] = 0;
        o[V2] -= 4;
        if (o[V2]) return;
        s.reinit(o, FSI.POKE_BALL_4);
        inc(o);
        return;
      }
      case 6: s.reinit(o, FSI.POKE_BALL_5); o[JT]--; return;
      case 2: case 5: case 9: return;
      case 7:
        getBallAnimPal(o);
        s.reinit(o, FSI.POKE_BALL_2);
        inc(o);
        o[V2] = 0x20;
        swing();
        return;
      case 8: case 10: swing(); return;
      case 11: deinit(o); return;
      default:
    }
  });
  F.push((o) => { // PokeBallBlocked
    switch (o[JT]) {
      case 0: getBallAnimPal(o); inc(o); return;
      case 1:
        if (o[X] < 0x70) { throwFromUserToTarget(o); return; }
        inc(o);
        // fallthrough
      case 2:
        if (o[Y] >= 0x80) { deinit(o); return; }
        o[Y] += 4;
        o[X] -= 2;
        return;
      default:
    }
  });
  F.push((o) => { // Recover
    if (o[JT] === 0) {
      inc(o);
      o[V2] = o[PARAM] & 0xf0;
      o[V1] = (o[PARAM] & 0xf) << 3;
      o[PARAM] = 1;
    } else if (o[JT] !== 1) return;
    if (!o[V2]) { deinit(o); return; }
    const a = o[V1]; o[V1]++;
    const d = o[V2];
    o[YO] = sin(a, d);
    o[XO] = cos(a, d);
    o[PARAM] ^= 1;
    if (!o[PARAM]) return;
    o[V2]--;
  });
  F.push((o) => { // ThunderWave
    if (o[JT] === 1) { inc(o); s.reinit(o, FSI.THUNDER_WAVE_EXTRA); } else if (o[JT] === 3) deinit(o);
  });
  F.push((o) => { // Clamp_Encore
    switch (o[JT]) {
      case 0:
        inc(o);
        o[V2] = o[FS];
        o[V1] = o[PARAM] & 0x80 ? 0x30 : 0x10;
        o[PARAM] &= 0x7f;
        // fallthrough
      case 1: {
        const a = sin(o[V1], o[PARAM]);
        o[XO] = a;
        s.reinit(o, a & 0x80 ? o[V2] : (o[V2] + 1) & 0xff);
        o[V1]++;
        if (o[V1] & 0x1f) return;
      }
      // fallthrough
      case 2: case 3: case 4: case 5: inc(o); return;
      case 6: o[JT] = 1; return;
      default:
    }
  });
  F.push((o) => { // Bite
    switch (o[JT]) {
      case 0:
        inc(o);
        o[V1] = o[PARAM] & 0x80 ? 0x30 : 0x10;
        o[PARAM] &= 0x7f;
        // fallthrough
      case 1: {
        const a = sin(o[V1], o[PARAM]);
        o[YO] = a;
        s.reinit(o, a & 0x80 ? FSI.BITE_1 : FSI.BITE_2);
        o[V1] += 2;
        if (o[V1] & 0x1f) return;
      }
      // fallthrough
      case 2: case 3: case 4: case 5: inc(o); return;
      case 6: o[JT] = 1; return;
      default:
    }
  });
  F.push((o) => { // SolarBeam
    if (o[JT] === 0) { inc(o); o[V1] = 0x28; o[V2] = 0; } else if (o[JT] !== 1) return;
    const a = o[PARAM]; const d = o[V1];
    o[YO] = sin(a, d);
    o[XO] = cos(a, d);
    if (!o[V1]) { deinit(o); return; }
    pair(o, V1, V2, 0x10000 - 0x80);
  });
  F.push((o) => { // Gust
    const wobble = () => {
      const d = GUST_OFFSETS[o[V2]] ?? 0;
      const a = o[V1];
      o[YO] = (sra(sra(sra(sra(sin(a, d))))) + o[PARAM]) & 0xff;
      o[XO] = cos(a, d);
      o[V1] -= 8;
      const p = o[PARAM];
      if (p === 0 || p >= 0xc2) {
        o[PARAM] = p - 1;
        if ((p - 1) & 7) return;
        o[V2]++;
        return;
      }
      o[V2] = 0; o[PARAM] = 0; o[XO] = 0; o[YO] = 0;
    };
    const move = () => {
      wobble();
      o[X]++;
      if (o[X] & 1) return;
      o[Y]--;
    };
    switch (o[JT]) {
      case 0: inc(o); o[PARAM] = 0;
      // fallthrough
      case 1: case 3: wobble(); return;
      case 2: if (o[X] < 0x88) move(); else inc(o); return;
      case 4: if (o[X] < 0xb8) move(); else deinit(o); return;
      default:
    }
  });
  F.push((o) => { // RazorWind
    moveInCircle(o);
    o[V1] += 0xf;
  });
  F.push((o) => { // Kick
    switch (o[JT]) {
      case 1:
        if (o[Y] < 0x30) { o[Y] += 4; return; }
        o[JT] = 0;
        return;
      case 2:
        if (o[X] >= 0x98) return;
        o[X] += 2;
        o[FLAGS] |= FIX_COORDS;
        o[FIXY] = 0x90; o[FRAME] = 0; o[DUR] = 2;
        o[Y]--;
        return;
      case 3:
        inc(o);
        o[V1] = 0x2c; o[FRAME] = 0; o[DUR] = 0x80;
        // fallthrough
      case 4: {
        if (o[X] >= 0x98) return;
        o[X] += 2;
        const a = o[V1]; o[V1]++;
        o[YO] = sin(a, 8);
        return;
      }
      default:
    }
  });
  F.push((o) => { // Absorb
    if (o[X] < 0x30) { deinit(o); return; }
    let e = o[PARAM] & 0xf;
    o[X] -= e;
    e >>= 1;
    do { o[Y]++; e = (e - 1) & 0xff; } while (e);
  });
  F.push((o) => { // Egg
    const wave = () => {
      o[YO] = sin(o[V1], o[V2]);
      o[V1]++;
      if (o[V1] & 0x3f) return;
      o[V1] = 0x20;
      o[V2] -= 8;
      if (o[V2]) return;
      o[V1] = 0; o[V2] = 0;
      inc(o);
    };
    const step = () => {
      o[X]++;
      pair(o, Y, V1, 0x10000 - 0x80);
    };
    switch (o[JT]) {
      case 0: o[V1] = 0x28; o[V2] = 0x10; o[JT] = o[PARAM]; return;
      case 1: if (o[X] < 0x40) o[X]++; wave(); return;
      case 6: if (o[X] < 0x4b) o[X]++; wave(); return;
      case 2: {
        const a = o[X];
        if (a >= 0x88) { inc(o); o[JT]++; return; }
        if (a & 0xf) { step(); return; }
        o[V2] = 0x10;
        inc(o);
        return;
      }
      case 3:
        if (o[V2]) { o[V2]--; return; }
        o[JT]--;
        step();
        return;
      case 5: deinit(o); return;
      case 7: s.reinit(o, FSI.EGG_WOBBLE); inc(o); return;
      case 8: { const a = o[V1]; o[V1] += 2; o[XO] = sin(a, 2); return; }
      case 9: s.reinit(o, FSI.EGG_CRACKED_BOTTOM); o[YO] = 4; inc(o); return;
      case 11: s.reinit(o, FSI.EGG_CRACKED_TOP); inc(o); o[V1] = 0x40; return;
      case 12:
        o[YO] = sin(o[V1], 0x20);
        if (o[V1] >= 0x30) { o[V1]--; return; }
        inc(o);
        return;
      default:
    }
  });
  F.push((o) => { // MoveUp
    const a = o[YO];
    if (a !== 0 && a < 0xd8) { deinit(o); return; }
    o[YO] -= o[PARAM];
  });
  F.push((o) => { // Wrap
    if (o[JT] === 1) { s.reinit(o, (o[FS] + 1) & 0xff); inc(o); o[V1] = 8; }
  });
  F.push((o) => { // LeechSeed
    switch (o[JT]) {
      case 0: inc(o); o[V2] = 0x40; return;
      case 1:
        if (o[V2] >= 0x20) { stepThrown(o, V2, o[V2]); return; }
        o[V2] = 0x40;
        s.reinit(o, FSI.LEECH_SEED_2);
        inc(o);
        return;
      case 2:
        if (o[V2]) { o[V2]--; return; }
        inc(o);
        s.reinit(o, FSI.LEECH_SEED_3);
        return;
      default:
    }
  });
  F.push((o) => { // Sound
    if (o[JT] === 0) {
      if (s.turn) o[PARAM] = ((o[PARAM] ^ 0xff) + 3) & 0xff;
      inc(o);
      o[V1] = 8;
      s.reinit(o, (FSI.SOUND_1 + o[PARAM]) & 0xff);
      return;
    }
    if (o[JT] !== 1) return;
    if (!o[V1]) { deinit(o); return; }
    o[V1]--;
    const a = o[V2]; o[V2] += 2;
    const d = sin(a, 0x10);
    o[XO] = d;
    if (o[PARAM] === 0) { o[YO] = neg(d); return; }
    if (o[PARAM] - 1 === 0) return;
    o[YO] = d;
  });
  F.push((o) => { // ConfuseRay
    if (o[JT] === 0) {
      inc(o);
      o[V2] = o[PARAM] & 0x3f;
      o[PARAM] = (o[PARAM] & 0x80) >> 7;
      s.reinit(o, (FSI.CONFUSE_RAY_1 + o[PARAM]) & 0xff);
      return;
    }
    if (o[JT] !== 1) return;
    const d = ((o[PARAM] << 4) | (o[PARAM] >> 4)) & 0xff;
    const a = o[V2]; o[V2]++;
    o[YO] = sin(a, d);
    o[XO] = cos(a, d);
    if (o[X] >= 0x80) return;
    const v = o[V2];
    if (!(v & 3)) o[Y]--;
    if ((v & 3) & 1) return;
    o[X]++;
  });
  F.push((o) => { // Dizzy
    if (o[JT] === 0) {
      inc(o);
      o[V1] = o[FS];
      s.reinit(o, ((o[PARAM] & 0x80) >> 7) + o[V1]);
      o[PARAM] &= 0x7f;
    } else if (o[JT] !== 1) return;
    const a = o[PARAM];
    o[YO] = sra(sra(sin(a, 0x10)));
    o[XO] = cos(a, 0x10);
    const b = o[PARAM]; o[PARAM]++;
    if (!(b & 0x3f)) { s.reinit(o, o[V1]); return; }
    if (b & 0x1f) return;
    s.reinit(o, (o[V1] + 1) & 0xff);
  });
  F.push((o) => { // Amnesia
    switch (o[JT]) {
      case 0:
        inc(o);
        s.reinit(o, (FSI.AMNESIA_1 + o[PARAM]) & 0xff);
        o[YO] = AMNESIA_OFFSETS[o[PARAM]] ?? 0;
        return;
      case 2: deinit(o); return;
      default:
    }
  });
  F.push((o) => { // FloatUp
    const a = o[V1]; o[V1] += 2;
    o[XO] = sin(a, 4);
    pair(o, YO, V2, 0xffa0);
  });
  F.push((o) => { // Dig
    const a = o[V1]; o[V1] -= 2;
    o[YO] = sin(a, 0x10);
    o[X]++;
  });
  F.push((o) => { // String
    if (o[JT] !== 0) return;
    inc(o);
    const a = o[PARAM];
    if (!a) o[FLAGS] |= OAM_YFLIP;
    s.reinit(o, (FSI.STRING_SHOT_1 + a) & 0xff);
  });
  F.push((o) => { // Paralyzed
    if (o[JT] === 0) {
      inc(o);
      o[V1] = 0;
      const e = o[PARAM];
      o[PARAM] = (e & 0x70) >> 4;
      if (!(e & 0x80)) { o[XO] = e & 0xf; return; }
      o[XO] = neg(e & 0xf);
      s.reinit(o, FSI.PARALYZED_FLIPPED);
      return;
    }
    if (o[JT] !== 1) return;
    if (o[V1]) { o[V1]--; return; }
    o[V1] = o[PARAM];
    o[XO] = neg(o[XO]);
  });
  const spiral = (o, mask, limit) => {
    const a = o[V1];
    o[YO] = (sra(sra(sra(sin(a, 0x18)))) + o[V2]) & 0xff;
    o[XO] = cos(a, 0x18);
    o[V1]++;
    if (o[V1] & mask) return;
    if (o[V2] >= limit) { deinit(o); return; }
    o[V2]++;
  };
  const spiralDescent = (o) => spiral(o, 7, 0x28);
  F.push(spiralDescent); // SpiralDescent
  F.push((o) => { // PoisonGas
    if (o[JT] === 1) { spiralDescent(o); return; }
    if (o[JT] !== 0) return;
    if (o[X] >= 0x84) { inc(o); return; }
    o[X]++;
    const a = o[V1]; o[V1]++;
    o[XO] = cos(a, 0x18);
    if (o[X] & 1) return;
    o[Y]--;
  });
  F.push((o) => { // Horn
    switch (o[JT]) {
      case 0: o[JT] = o[PARAM]; o[V1] = o[Y]; return;
      case 1: if (o[X] >= 0x58) return; stepToTarget(o, 2); return;
      case 2: if (o[V2] >= 0x20) { deinit(o); return; }
      // fallthrough
      case 3: {
        const a = sin(o[V2], 8);
        o[XO] = a;
        o[Y] = (neg(sra(a)) + o[V1]) & 0xff;
        o[V2] += 8;
        return;
      }
      default:
    }
  });
  F.push((o) => { // Needle
    switch (o[JT]) {
      case 0: o[JT] = (o[PARAM] & 0xf0) >> 4; return;
      case 2: {
        const a = sin(o[V1], 0x10);
        if (a & 0x80) o[YO] = a;
        o[V1] -= 4;
      }
      // fallthrough
      case 1:
        if (o[X] >= 0x84) { deinit(o); return; }
        stepToTarget(o, o[PARAM]);
        return;
      default:
    }
  });
  F.push((o) => spiral(o, 3, 0x28)); // PetalDance
  F.push((o) => { // ThiefPayday
    if (o[JT] === 0) { inc(o); o[V1] = 0x28; o[V2] = o[Y] - 0x28; } else if (o[JT] !== 1) return;
    o[YO] = sin(o[V1], o[V2]);
    if (!(o[V1] & o[PARAM])) o[X]--;
    o[V1]++;
    if (o[V1] & 0x3f) return;
    o[V1] = 0x20;
    o[V2] >>= 1;
  });
  F.push((o) => { // AbsorbCircle
    const a = o[PARAM]; const d = o[V1];
    o[YO] = sin(a, d);
    o[XO] = cos(a, d);
    o[PARAM]++;
    if (!(o[PARAM] & 1)) o[X]--;
    if (!(o[PARAM] & 3)) o[Y]++;
    if (o[X] >= 0x5a) { o[V1]++; return; }
    if (!o[V1]) { deinit(o); return; }
    o[V1]--;
  });
  F.push((o) => { // Bonemerang
    if (o[JT] === 0) { inc(o); o[V2] = o[Y]; } else if (o[JT] !== 1) return;
    o[Y] = (sin(o[PARAM], 0x30) + o[V2]) & 0xff;
    o[XO] = cos((o[PARAM] + 8) & 0xff, 0x30);
    o[PARAM]++;
  });
  F.push((o) => { // Shiny
    if (o[JT] !== 0) return;
    inc(o);
    o[YO] = sin(o[PARAM], 0x10);
    o[XO] = cos(o[PARAM], 0x10);
    o[V2] = 0xf;
  });
  F.push((o) => { // SkyAttack
    const cycle = () => {
      const a = o[V2] & 7;
      o[V2]++;
      s.obp0 = SKY_ATTACK_PALS[a >> 1] & o[V1];
    };
    switch (o[JT]) {
      case 0: inc(o); o[V1] = s.turn ? 0xcc : 0xf0; return;
      case 1: cycle(); return;
      case 2: cycle(); if (o[X] >= 0x84) return; stepToTarget(o, 4); return;
      case 3: cycle(); if (o[X] >= 0xd0) { deinit(o); return; } stepToTarget(o, 4); return;
      default:
    }
  });
  F.push((o) => { // GrowthSwordsDance
    o[YO] = (sra(sra(sra(sin(o[PARAM], 0x18)))) + o[V2]) & 0xff;
    const a = o[PARAM]; o[PARAM]++;
    o[XO] = cos(a, 0x18);
    o[V2] -= 2;
  });
  const smokeFlame = (o, mask, stopAt, step) => {
    const a = o[PARAM];
    o[YO] = (sra(sra(sra(sin(a, 0x18)))) + o[V2]) & 0xff;
    o[XO] = cos(a, 0x18);
    o[PARAM] += 2;
    if (o[PARAM] & mask) return;
    if (o[V2] === stopAt) { deinit(o); return; }
    o[V2] -= step;
  };
  F.push((o) => smokeFlame(o, 7, 0xe8, 1)); // SmokeFlameWheel
  F.push((o) => { // PresentSmokescreen
    switch (o[JT]) {
      case 0: inc(o); o[V1] = 0x34; o[V2] = 0x10;
      // fallthrough
      case 1: {
        if (o[X] >= 0x6c) return;
        stepToTarget(o, 2);
        let a = sin(o[V1], o[V2]);
        if (!(a & 0x80)) a = neg(a);
        o[YO] = a;
        o[V1] -= 4;
        if ((o[V1] & 0x1f) !== 0x20) return;
        o[V2] >>= 1;
        return;
      }
      case 2: deinit(o); return;
      default:
    }
  });
  F.push((o) => { // StrengthSeismicToss
    switch (o[JT]) {
      case 0:
        if (o[YO] === 0xe0) { inc(o); o[V1] = 2; return; }
        pair(o, YO, V1, 0x10000 - 0x80);
        return;
      case 1:
        if (o[V2]) { o[V2]--; return; }
        o[V2] = 4;
        o[V1] = neg(o[V1]);
        o[YO] += o[V1];
        return;
      case 2:
        if (o[X] >= 0x84) { deinit(o); return; }
        stepToTarget(o, 4);
        return;
      default:
    }
  });
  F.push((o) => { // SpeedLine
    if (o[JT] === 0) { inc(o); s.reinit(o, (FSI.SPEED_LINE_1 + (o[PARAM] & 0x7f)) & 0xff); } else if (o[JT] !== 1) return;
    if (o[PARAM] & 0x80) o[XO]--; else o[XO]++;
  });
  F.push((o) => { // Sludge
    switch (o[JT]) {
      case 0: inc(o); o[V1] = 0xc; return;
      case 1:
        if (o[V1]) { o[V1]--; return; }
        inc(o);
        s.reinit(o, FSI.SLUDGE_BUBBLE_BURST);
        // fallthrough
      case 2: o[YO]--; return;
      default:
    }
  });
  F.push((o) => { // MetronomeHand
    const a = o[V1]; o[V1] += 2;
    o[YO] = sin(a, 2);
    o[XO] = cos(a, 8);
  });
  F.push((o) => { // MetronomeSparkleSketch
    if (o[YO] >= 0x20) { deinit(o); return; }
    o[XO] = cos(o[PARAM], 8);
    o[PARAM] += 2;
    if (o[PARAM] & 7) return;
    o[YO]++;
  });
  F.push((o) => { // Agility
    if (o[JT] === 0) o[X] += o[PARAM]; else if (o[JT] === 1) deinit(o);
  });
  F.push((o) => smokeFlame(o, 3, 0xd0, 2)); // SacredFire
  F.push((o) => { // SafeguardProtect
    const a = o[PARAM];
    o[YO] = sin(a, 0x18);
    o[XO] = sra(cos(a, 0x18));
    o[PARAM]++;
  });
  F.push((o) => { // LockOnMindReader
    switch (o[JT]) {
      case 0:
        inc(o);
        o[V1] = 0x28;
        s.reinit(o, ((o[PARAM] & 0xf) + o[FS]) & 0xff);
        o[PARAM] = (o[PARAM] & 0xf0) | 8;
        // fallthrough
      case 1: {
        const v = o[V1];
        if (v) {
          o[V1]--;
          const d = (v + 8) & 0xff; const a = o[PARAM];
          o[YO] = sin(a, d);
          o[XO] = cos(a, d);
          return;
        }
        o[V1] = 0x10;
        inc(o);
      }
      // fallthrough
      case 2: {
        const v = o[V1]; o[V1]--;
        if (v) return;
        deinit(o);
        return;
      }
      default:
    }
  });
  F.push((o) => { // Spikes
    switch (o[JT]) {
      case 0: inc(o); o[V2] = 0x40; return;
      case 1:
        if (o[V2] >= 0x20) { stepThrown(o, V2, o[V2]); return; }
        inc(o);
        return;
      default:
    }
  });
  F.push((o) => { // HealBellNotes
    if (o[JT] === 0) { inc(o); s.reinit(o, (FSI.MUSIC_NOTE_1 + o[PARAM]) & 0xff); } else if (o[JT] !== 1) return;
    if (o[YO] >= 0x38) { deinit(o); return; }
    o[YO]++;
    const a = o[V1]; o[V1]++;
    o[XO] = cos(a, 0x18);
    if (o[Y] & 1) return;
    o[X]--;
  });
  F.push((o) => { // BatonPass
    const d = o[PARAM];
    if (!d) return;
    const a0 = o[V1]; o[V1]++;
    let a = sin(a0, d);
    if (!(a & 0x80)) a = neg(a);
    o[YO] = a;
    if (o[V1] & 0x1f) return;
    o[PARAM] >>= 1;
  });
  F.push((o) => { // Conversion
    const a = o[PARAM]; o[PARAM]++;
    const d = o[V1];
    o[YO] = sin(a, d);
    o[XO] = cos(a, d);
    const v = o[V2]; o[V2]++;
    if (v < 0x40) { o[V1]++; return; }
    const r = o[V1]; o[V1]--;
    if (r) return;
    deinit(o);
  });
  F.push((o) => { // EncoreBellyDrum
    const d = o[V1];
    if (d >= 0x10) { deinit(o); return; }
    o[V1] += 2;
    const a = o[PARAM];
    o[YO] = sin(a, d);
    o[XO] = cos(a, d);
  });
  F.push((o) => { // SwaggerMorningSun
    const e = o[PARAM];
    const d = o[V1];
    o[V1] = (((e & 0xc0) >> 6) + o[V1]) & 0xff;
    const a = e & 0x3f;
    o[YO] = sin(a, d);
    o[XO] = cos(a, d);
  });
  F.push((o) => { // HiddenPower
    switch (o[JT]) {
      case 0: { const a = o[PARAM]; o[PARAM]++; stepCircle(o, a, 0x18); return; }
      case 1: inc(o); o[V1] = 0x18;
      // fallthrough
      case 2: {
        const d = o[V1];
        if (d >= 0x80) { deinit(o); return; }
        o[V1] = d + 8;
        stepCircle(o, o[PARAM], d);
        return;
      }
      default:
    }
  });
  F.push((o) => { // Curse
    if (o[JT] !== 1) return;
    if (o[X] < 0x30) { deinit(o); return; }
    o[X] -= 2;
    o[Y] += 2;
  });
  F.push((o) => { // PerishSong
    const a = o[PARAM]; o[PARAM] += 2;
    const y = (sra(sra(sin(a, 0x50))) + o[V1]) & 0xff;
    o[V1]++;
    o[YO] = y;
    o[XO] = cos(a, 0x50);
  });
  F.push((o) => { // RapidSpin
    if (o[YO] === 0xd0) { deinit(o); return; }
    o[YO] -= 4;
  });
  F.push((o) => { // BetaPursuit
    switch (o[JT]) {
      case 0:
        if (o[PARAM]) { inc(o); inc(o); break; }
        inc(o);
        o[YO] = 0xec;
        // fallthrough
      case 1:
        if (o[YO] === 4) { deinit(o); return; }
        o[YO] += 4;
        return;
      case 3: deinit(o); return;
      case 2: break;
      default: return;
    }
    if (o[YO] === 0xd8) return;
    o[YO] -= 4;
  });
  F.push((o) => { // RainSandstorm
    const fall = () => { const a = (o[YO] + 4) & 0xff; o[YO] = a >= 0x70 ? 0 : a; };
    switch (o[JT]) {
      case 0: o[JT] = o[PARAM]; inc(o); return;
      case 1: fall(); o[XO] += 2; return;
      case 2: fall(); o[XO] += 8; return;
      case 3: fall(); o[XO] += 4; return;
      default:
    }
  });
  F.push((o) => { // AnimObjB0
    const p = o[PARAM];
    const hi = p & 0xf0;
    pair(o, X, V1, (((hi >> 4) | hi) << 8) | ((p & 0xf) << 4));
  });
  F.push((o) => { const a = o[PARAM]; o[PARAM]++; stepCircle(o, a, 0x18); }); // PsychUp
  F.push((o) => { // AncientPower
    if (o[V1] >= 0x20) { deinit(o); return; }
    o[V1]++;
    o[YO] = neg(sin(o[V1] - 1, o[PARAM]));
  });
  F.push((o) => smokeRockSmash(o)); // RockSmash
  F.push((o) => { // Cotton
    const a = o[V2]; o[V2]++;
    stepCircle(o, ((a >> 1) + o[PARAM]) & 0xff, 0x18);
  });

  function smokeRockSmash(o) {
    if (o[JT] === 0) {
      o[FS] = (((o[PARAM] & 0x40) >> 6) + FSI.BIG_ROCK) & 0xff;
      inc(o);
      o[V1] = 0x40;
    } else if (o[JT] !== 1) return;
    if (o[V1] < 0x30) { deinit(o); return; }
    const d = o[PARAM] & 0x3f;
    const a = o[V1]; o[V1]--;
    o[YO] = sin(a, d);
    pair(o, X, V2, scatter(o));
  }

  return F;
}
