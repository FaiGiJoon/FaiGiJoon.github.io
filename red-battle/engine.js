// Gen II (Pokemon Crystal) battle engine.
// Rules are ported from pret/pokecrystal (engine/battle/*.asm); all numeric data
// (base stats, moves, learnsets, type chart, Red's party/DVs/AI flags) is read
// from the ROM by tools/extract.py into data.json.

export const TYPE_ORDER = ['NORMAL', 'FIGHTING', 'FLYING', 'POISON', 'GROUND', 'ROCK', 'BIRD', 'BUG',
  'GHOST', 'STEEL', 'CURSE', 'FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'PSYCHIC', 'ICE', 'DRAGON', 'DARK'];
const SPECIAL_TYPES = new Set(['FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'PSYCHIC', 'ICE', 'DRAGON', 'DARK']);
const HIDDEN_POWER_TYPES = ['FIGHTING', 'FLYING', 'POISON', 'GROUND', 'ROCK', 'BUG', 'GHOST', 'STEEL',
  'FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'PSYCHIC', 'ICE', 'DRAGON', 'DARK'];
// data/battle/stat_multipliers.asm and accuracy_multipliers.asm, index = stage + 6
const STAT_MULT = [[25, 100], [28, 100], [33, 100], [40, 100], [50, 100], [66, 100], [1, 1],
  [15, 10], [2, 1], [25, 10], [3, 1], [35, 10], [4, 1]];
const ACC_MULT = [[33, 100], [36, 100], [43, 100], [50, 100], [60, 100], [75, 100], [1, 1],
  [133, 100], [166, 100], [2, 1], [233, 100], [133, 50], [3, 1]];
const CRIT_CHANCE = [17, 32, 64, 85, 128, 128, 128]; // "1 out_of n" -> n/256
const CRIT_MOVES = new Set(['KARATE CHOP', 'RAZOR WIND', 'RAZOR LEAF', 'CRABHAMMER', 'SLASH', 'AEROBLAST', 'CROSS CHOP']);
// Johto + Kanto badge type boosts (player only, x1.125)
const BADGE_TYPES = new Set(['FLYING', 'BUG', 'NORMAL', 'GHOST', 'STEEL', 'FIGHTING', 'ICE', 'DRAGON',
  'ROCK', 'WATER', 'ELECTRIC', 'GRASS', 'POISON', 'PSYCHIC', 'FIRE', 'GROUND']);
export const RED_LEVELS = [81, 73, 75, 77, 77, 77];
export const pct = (x) => Math.floor(x * 255 / 100);

// AI flag bits (constants/ai_constants.asm)
const AI = { BASIC: 1, SETUP: 2, TYPES: 4, OFFENSIVE: 8, SMART: 16, OPPORTUNIST: 32,
  AGGRESSIVE: 64, CAUTIOUS: 128, STATUS: 256, RISKY: 512 };
const STATUS_ONLY = new Set(['EFFECT_SLEEP', 'EFFECT_TOXIC', 'EFFECT_POISON', 'EFFECT_PARALYZE']);
const RECKLESS = new Set(['EFFECT_SELFDESTRUCT', 'EFFECT_RAMPAGE', 'EFFECT_MULTI_HIT', 'EFFECT_DOUBLE_HIT']);
const RISKY = new Set(['EFFECT_SELFDESTRUCT', 'EFFECT_OHKO']);
const CONSTANT_DAMAGE = new Set(['EFFECT_SUPER_FANG', 'EFFECT_STATIC_DAMAGE', 'EFFECT_LEVEL_DAMAGE', 'EFFECT_PSYWAVE']);
const RESIDUAL_MOVES = new Set(['MIST', 'LEECH SEED', 'POISONPOWDER', 'STUN SPORE', 'THUNDER WAVE', 'FOCUS ENERGY',
  'BIDE', 'POISON GAS', 'TRANSFORM', 'CONVERSION', 'SUBSTITUTE', 'SPIKES']);
const RAIN_MOVES = new Set(['WATER GUN', 'HYDRO PUMP', 'SURF', 'BUBBLEBEAM', 'THUNDER', 'WATERFALL', 'CLAMP',
  'BUBBLE', 'CRABHAMMER', 'OCTAZOOKA', 'WHIRLPOOL']);
const SUN_MOVES = new Set(['FIRE PUNCH', 'EMBER', 'FLAMETHROWER', 'FIRE SPIN', 'FIRE BLAST', 'SACRED FIRE',
  'MORNING SUN', 'SYNTHESIS']);
const STAT_EFFECTS = {
  ATTACK: 'atk', DEFENSE: 'def', SPEED: 'spe', SP_ATK: 'spa', SP_DEF: 'spd', ACCURACY: 'acc', EVASION: 'eva',
};
const STAT_LABEL = { atk: 'ATTACK', def: 'DEFENSE', spe: 'SPEED', spa: 'SPCL.ATK', spd: 'SPCL.DEF', acc: 'accuracy', eva: 'evasiveness' };

// ---------- RNG ----------
export function makeRng(seed = Date.now()) {
  let s = seed >>> 0 || 1;
  const next = () => { // mulberry32
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const byte = () => Math.floor(next() * 256);
  byte.int = (n) => Math.floor(next() * n);
  return byte;
}

// ---------- data helpers ----------
export function typeEffect(data, moveType, defTypes, identified = false) {
  let mult = 10; // tenths
  data.typeMatchups.forEach(([a, d, e], i) => {
    if (identified && i >= data.foresightSplit) return;
    if (a === moveType && defTypes.includes(d)) mult = mult * e / 10;
  });
  return mult;
}

export function calcStats(base, level, dvs) {
  const hpDv = ((dvs.atk & 1) << 3) | ((dvs.def & 1) << 2) | ((dvs.spe & 1) << 1) | (dvs.spc & 1);
  const f = (b, dv) => Math.floor(((b + dv) * 2) * level / 100); // zero stat exp
  return {
    hp: f(base.hp, hpDv) + level + 10,
    atk: f(base.atk, dvs.atk) + 5, def: f(base.def, dvs.def) + 5, spe: f(base.spe, dvs.spe) + 5,
    spa: f(base.spa, dvs.spc) + 5, spd: f(base.spd, dvs.spc) + 5,
  };
}

// engine/pokemon/move_mon.asm FillMoves: the last four distinct level-up moves at or below level
export function defaultMoves(species, level) {
  const moves = [];
  for (const [lv, m] of species.learnset) {
    if (lv > level) break;
    if (moves.includes(m)) continue;
    if (moves.length === 4) moves.shift();
    moves.push(m);
  }
  return moves;
}

export function hiddenPower(dvs) {
  const type = HIDDEN_POWER_TYPES[((dvs.atk & 3) << 2) | (dvs.def & 3)];
  const msb = ((dvs.atk >> 3) << 3) | ((dvs.def >> 3) << 2) | ((dvs.spe >> 3) << 1) | (dvs.spc >> 3);
  return { type, power: Math.floor((5 * msb + (dvs.spc & 3)) / 2) + 31 };
}

export function makeMon(data, dex, level, dvs, moveIds, extra = {}) {
  const sp = data.species[dex];
  const stats = calcStats(sp.base, level, dvs);
  const genderVal = (dvs.atk << 4) | dvs.spe;
  const gender = sp.gender === 255 ? null : (genderVal < sp.gender ? 'F' : 'M');
  return {
    dex, name: sp.name, level, dvs, types: [...sp.types], stats, maxHp: stats.hp, hp: stats.hp,
    status: null, sleep: 0, toxic: false, gender, happiness: extra.happiness ?? 255,
    moves: moveIds.map((id) => ({ id, pp: data.moves[id].pp, maxPp: data.moves[id].pp })),
  };
}

// Obtainable in Gold/Silver/Crystal without events: everything but Mew (151) and Celebi (251).
export function speciesPool(data, { includeEvent = false } = {}) {
  return Object.values(data.species).map((s) => s.dex).filter((d) => includeEvent || (d !== 151 && d !== 251));
}

export function randomTeam(data, rng, opts = {}) {
  const pool = speciesPool(data, opts);
  const team = [];
  const used = new Set();
  for (const level of RED_LEVELS) {
    let dex;
    do { dex = pool[rng.int(pool.length)]; } while (used.has(dex) && used.size < pool.length);
    used.add(dex);
    const dvs = { atk: rng.int(16), def: rng.int(16), spe: rng.int(16), spc: rng.int(16) };
    team.push(makeMon(data, dex, level, dvs, defaultMoves(data.species[dex], level)));
  }
  return team;
}

export function redTeam(data) {
  const r = data.red;
  return r.party.map((p) => makeMon(data, p.species, p.level, r.dvs, p.moves, { happiness: 70 }));
}

// ---------- battle state ----------
function freshVolatile() {
  return {
    stages: { atk: 0, def: 0, spe: 0, spa: 0, spd: 0, acc: 0, eva: 0 },
    confused: 0, toxicCount: 0, leechSeed: false, substitute: 0, focusEnergy: false, mist: false,
    flinch: false, recharge: false, charging: null, semiInvuln: null, rampage: 0, rampageMove: null,
    rollout: 0, rolloutMove: null, furyCutter: 0, rage: false, disable: null, encore: null,
    lockOn: 0, identified: false, curse: false, nightmare: false, perish: 0, attract: false,
    defenseCurl: false, transformed: false, destinyBond: false, protect: false, protectCount: 0,
    endure: false, bide: null, wrap: 0, wrapMove: null, meanLook: false, lastMove: null,
    usedMoves: [], turnsTaken: 0, lastDamage: 0, lastDamageCategory: null, lastCounterMove: null,
    mimic: null, futureSight: null, didMove: false,
  };
}

export class Battle {
  constructor(data, playerTeam, opts = {}) {
    this.data = data;
    this.rng = opts.rng || makeRng(opts.seed);
    this.badges = opts.badges ?? true;
    this.log = [];
    this.turn = 0;
    this.weather = null; this.weatherTurns = 0;
    this.over = false; this.winner = null;
    this.red = data.red;
    this.sides = [
      { name: 'You', party: playerTeam, active: 0, screens: {}, futureSight: null, isAI: false },
      { name: 'RED', party: redTeam(data), active: 0, screens: {}, futureSight: null, isAI: true,
        items: [...data.red.items].filter(Boolean).length ? [...data.red.items] : [] },
    ];
    this.sides.forEach((s) => { s.vol = freshVolatile(); });
    this.pendingSwitch = null; // side index that must choose a replacement
    this.emit(`RED wants to battle!`);
    this.emit(`RED sent out ${this.mon(1).name}!`);
    this.emit(`Go! ${this.mon(0).name}!`);
  }

  emit(text, kind = 'text', fx = null) {
    // snapshot of both active mons so the UI can animate HP alongside each message
    const snap = this.sides?.[1]?.vol ? [0, 1].map((i) => {
      const m = this.mon(i);
      return { idx: this.sides[i].active, hp: m.hp, maxHp: m.maxHp, status: m.status };
    }) : null;
    this.log.push({ turn: this.turn, kind, text, snap, weather: this.weather, ...(fx ? { fx } : {}) });
  }
  mon(i) { return this.sides[i].party[this.sides[i].active]; }
  foe(i) { return 1 - i; }
  alive(i) { return this.sides[i].party.filter((m) => m.hp > 0); }
  moveData(id) { return this.data.moves[id]; }

  // ----- stats -----
  stat(i, key) {
    const m = this.mon(i); const v = this.sides[i].vol;
    let s = m.stats[key];
    if (i === 0 && this.badges && ['atk', 'def', 'spe', 'spa', 'spd'].includes(key)) s += s >> 3;
    const [n, d] = STAT_MULT[v.stages[key] + 6];
    s = Math.max(1, Math.min(999, Math.floor(s * n / d)));
    if (key === 'spe' && m.status === 'PAR') s = Math.max(1, s >> 2);
    if (key === 'atk' && m.status === 'BRN') s = Math.max(1, s >> 1);
    return s;
  }

  rawStat(i, key) {
    const m = this.mon(i);
    let s = m.stats[key];
    if (i === 0 && this.badges) s += s >> 3;
    return s;
  }

  // ----- damage (BattleCommand_DamageStats + DamageCalc + Stab) -----
  isSpecial(type) { return SPECIAL_TYPES.has(type); }

  baseDamage(att, move, { crit = false, power = move.power, type = move.type } = {}) {
    const def = this.foe(att);
    const special = this.isSpecial(type);
    const [aKey, dKey] = special ? ['spa', 'spd'] : ['atk', 'def'];
    const screen = special ? this.sides[def].screens.lightScreen : this.sides[def].screens.reflect;
    let A = this.stat(att, aKey); let D = this.stat(def, dKey);
    if (screen) D *= 2;
    if (crit && this.sides[att].vol.stages[aKey] <= this.sides[def].vol.stages[dKey]) {
      A = this.rawStat(att, aKey); D = this.rawStat(def, dKey);
    }
    // Light Ball / Thick Club / Metal Powder not modelled: nobody holds items here.
    if (move.effect === 'EFFECT_SELFDESTRUCT') D = Math.max(1, D >> 1);
    while (A > 255 || D > 255) { A = Math.max(1, A >> 2); D = Math.max(1, D >> 2); }
    D = Math.max(1, D);
    let level = this.mon(att).level;
    let dmg = Math.floor(Math.floor(Math.floor((Math.floor(level * 2 / 5) + 2) * power * A / D)) / 50);
    if (crit) dmg *= 2;
    dmg = Math.min(dmg, 997) + 2;
    return dmg;
  }

  // Returns {damage, eff} applying weather, badge, STAB and type chart in Crystal's order.
  modify(att, move, dmg, type = move.type) {
    const def = this.foe(att);
    if (move.name !== 'STRUGGLE') {
      if (this.weather === 'RAIN') {
        if (type === 'WATER') dmg = Math.floor(dmg * 15 / 10);
        if (type === 'FIRE') dmg = Math.floor(dmg * 5 / 10);
        if (move.effect === 'EFFECT_SOLARBEAM') dmg = Math.floor(dmg * 5 / 10);
      } else if (this.weather === 'SUN') {
        if (type === 'FIRE') dmg = Math.floor(dmg * 15 / 10);
        if (type === 'WATER') dmg = Math.floor(dmg * 5 / 10);
      }
      if (att === 0 && this.badges && BADGE_TYPES.has(type)) dmg += dmg >> 3;
      if (this.mon(att).types.includes(type)) dmg += dmg >> 1;
    }
    let eff = 10;
    if (type !== 'CURSE' && move.name !== 'STRUGGLE') {
      const identified = this.sides[def].vol.identified;
      this.data.typeMatchups.forEach(([a, d, e], idx) => {
        if (identified && idx >= this.data.foresightSplit) return;
        if (a !== type || !this.mon(def).types.includes(d)) return;
        eff = eff * e / 10;
        if (e === 0) { dmg = 0; return; }
        const nd = Math.floor(dmg * e / 10);
        dmg = dmg === 0 ? 0 : Math.max(1, nd);
      });
    }
    return { damage: dmg, eff };
  }

  variation(dmg) {
    if (dmg < 2) return dmg;
    let r;
    do { r = this.rng(); } while (r < pct(85) + 1);
    return Math.floor(dmg * r / 255);
  }

  // AIDamageCalc: DamageCalc + Stab, no crit, no random spread.
  aiDamage(att, move) {
    if (CONSTANT_DAMAGE.has(move.effect)) return this.constantDamage(att, move);
    if (!move.power) return 0;
    const { power, type } = this.movePowerType(att, move);
    return this.modify(att, move, this.baseDamage(att, move, { power, type }), type).damage;
  }

  constantDamage(att, move) {
    const def = this.foe(att);
    switch (move.effect) {
      case 'EFFECT_SUPER_FANG': return Math.max(1, this.mon(def).hp >> 1);
      case 'EFFECT_STATIC_DAMAGE': return move.power; // Dragon Rage 40, SonicBoom 20
      case 'EFFECT_LEVEL_DAMAGE': return this.mon(att).level;
      case 'EFFECT_PSYWAVE': {
        const max = Math.floor(this.mon(att).level * 3 / 2);
        let r; do { r = this.rng(); } while (r === 0 || r >= max);
        return r;
      }
      default: return 0;
    }
  }

  movePowerType(att, move) {
    const m = this.mon(att); const v = this.sides[att].vol; const def = this.foe(att);
    let power = move.power; let type = move.type;
    switch (move.effect) {
      case 'EFFECT_HIDDEN_POWER': ({ power, type } = hiddenPower(m.dvs)); break;
      case 'EFFECT_RETURN': power = Math.max(1, Math.floor(m.happiness * 10 / 25)); break;
      case 'EFFECT_FRUSTRATION': power = Math.max(1, Math.floor((255 - m.happiness) * 10 / 25)); break;
      case 'EFFECT_REVERSAL': {
        const r = Math.floor(48 * m.hp / m.maxHp);
        power = r <= 1 ? 200 : r <= 4 ? 150 : r <= 9 ? 100 : r <= 16 ? 80 : r <= 32 ? 40 : 20;
        break;
      }
      case 'EFFECT_ROLLOUT': power = move.power << Math.min(4, v.rollout) << (v.defenseCurl ? 1 : 0); break;
      case 'EFFECT_FURY_CUTTER': power = Math.min(160, move.power << Math.min(4, v.furyCutter)); break;
      case 'EFFECT_PURSUIT': if (this.sides[def].switchingOut) power *= 2; break;
      case 'EFFECT_GUST': case 'EFFECT_TWISTER':
        if (this.sides[def].vol.semiInvuln === 'FLY') power *= 2; break;
      case 'EFFECT_EARTHQUAKE': if (this.sides[def].vol.semiInvuln === 'DIG') power *= 2; break;
      case 'EFFECT_STOMP': if (this.sides[def].vol.minimized) power *= 2; break;
      default: break;
    }
    return { power, type };
  }

  // ===================== turn processing =====================
  // action: {type:'move', slot} | {type:'switch', to}
  playTurn(playerAction) {
    if (this.over) return;
    this.turn++;
    const actions = [this.normalizePlayer(playerAction), this.chooseRedAction()];

    // switches and items happen before moves; the player's goes first
    for (const i of [0, 1]) {
      const a = actions[i];
      if (a.type === 'switch') this.doSwitch(i, a.to, true);
      if (a.type === 'item') this.useFullRestore(i);
    }
    // order the moves
    const movers = [0, 1].filter((i) => actions[i].type === 'move');
    if (movers.length === 2) {
      const pr = (i) => this.priority(actions[i].moveId);
      let first;
      if (pr(0) !== pr(1)) first = pr(0) > pr(1) ? 0 : 1;
      else {
        const s0 = this.stat(0, 'spe'); const s1 = this.stat(1, 'spe');
        first = s0 !== s1 ? (s0 > s1 ? 0 : 1) : (this.rng() < 128 ? 0 : 1);
      }
      movers.sort((a) => (a === first ? -1 : 1));
    }
    const actors = [this.mon(0), this.mon(1)];
    for (const i of [0, 1]) { this.sides[i].vol.didMove = false; this.sides[i].vol.lastDamage = 0; }
    this.firstMover = movers.length === 2 ? movers[0] : -1;
    this.lastMoverThisTurn = movers.length === 2 ? movers[1] : -1;
    let fainted = false;
    for (const i of movers) {
      if (this.over || this.pendingSwitch !== null) break;
      if (this.mon(i) !== actors[i] || this.mon(i).hp <= 0) continue;
      this.executeMove(i, actions[i]);
      this.sides[i].vol.didMove = true;
      if (this.checkFaints()) { fainted = true; break; }
    }
    if (!this.over && !fainted && this.pendingSwitch === null) this.residual();
    for (const i of [0, 1]) {
      const v = this.sides[i].vol;
      v.flinch = false; v.protect = false; v.endure = false;
      if (this.mon(i).hp > 0) v.turnsTaken++;
    }
    this.checkFaints();
  }

  normalizePlayer(a) {
    if (a.type === 'switch') return a;
    const v = this.sides[0].vol;
    const locked = this.lockedMove(0);
    if (locked) return { type: 'move', moveId: locked, slot: -1 };
    const m = this.mon(0);
    if (!m.moves.some((mv) => mv.pp > 0 && !(v.disable && v.disable.move === mv.id))) {
      return { type: 'move', moveId: 165, slot: -1 }; // STRUGGLE
    }
    const slot = v.encore ? m.moves.findIndex((mv) => mv.id === v.encore.move) : a.slot;
    return { type: 'move', moveId: m.moves[slot].id, slot };
  }

  lockedMove(i) {
    const v = this.sides[i].vol;
    if (v.recharge) return -1;
    if (v.charging) return v.charging;
    if (v.rampage > 0) return v.rampageMove;
    if (v.rollout > 0 && v.rolloutMove) return v.rolloutMove;
    if (v.bide) return 117;
    return null;
  }

  selfTargeting(id) { return id > 0 && !this.moveData(id).power; }

  priority(id) {
    if (id <= 0) return 1;
    const e = this.moveData(id).effect;
    if (e === 'EFFECT_PROTECT' || e === 'EFFECT_ENDURE') return 3;
    if (e === 'EFFECT_PRIORITY_HIT') return 2;
    if (e === 'EFFECT_FORCE_SWITCH' || e === 'EFFECT_COUNTER' || e === 'EFFECT_MIRROR_COAT') return 0;
    return 1;
  }

  canSwitch(i) {
    const v = this.sides[i].vol;
    return !(v.meanLook || v.wrap > 0);
  }

  doSwitch(i, to, voluntary) {
    const side = this.sides[i];
    const old = this.mon(i);
    const v = side.vol;
    if (voluntary) this.emit(i === 0 ? `${old.name}, come back!` : `RED withdrew ${old.name}!`);
    const keep = v.batonPass ? { stages: v.stages, substitute: v.substitute, leechSeed: v.leechSeed,
      confused: v.confused, focusEnergy: v.focusEnergy, curse: v.curse, perish: v.perish, lockOn: v.lockOn,
      meanLook: v.meanLook } : null;
    if (old.status === 'TOX' || old.toxic) old.toxic = false;
    side.active = to;
    side.vol = freshVolatile();
    if (keep) Object.assign(side.vol, keep);
    const foeVol = this.sides[this.foe(i)].vol;
    foeVol.meanLook = false; foeVol.wrap = 0; foeVol.attract = false;
    this.emit(i === 0 ? `Go! ${this.mon(i).name}!` : `RED sent out ${this.mon(i).name}!`);
    if (side.screens.spikes && !this.mon(i).types.includes('FLYING')) {
      this.damage(i, Math.max(1, this.mon(i).maxHp >> 3), `${this.mon(i).name} is hurt by SPIKES!`);
    }
  }

  // ----- faint handling -----
  checkFaints() {
    for (const i of [0, 1]) {
      const m = this.mon(i);
      if (m.hp <= 0 && !m.faintLogged) {
        m.faintLogged = true; m.status = null;
        this.emit(i === 0 ? `${m.name} fainted!` : `Enemy ${m.name} fainted!`);
        if (this.sides[this.foe(i)].vol.destinyBondPending) { /* handled at move time */ }
      }
    }
    const playerOut = this.alive(0).length === 0; const redOut = this.alive(1).length === 0;
    if (playerOut || redOut) {
      this.over = true;
      this.winner = redOut && !playerOut ? 0 : playerOut && !redOut ? 1 : 1;
      this.emit(this.winner === 0 ? 'You defeated RED!' : 'RED: …', 'end');
      return true;
    }
    let any = false;
    if (this.mon(1).hp <= 0) { this.doSwitch(1, this.redReplacement(), false); any = true; }
    if (this.mon(0).hp <= 0) { this.pendingSwitch = 0; any = true; }
    return any;
  }

  playerReplace(to) {
    if (this.pendingSwitch !== 0) return;
    this.pendingBatonPass = false;
    this.pendingSwitch = null;
    this.doSwitch(0, to, false);
  }

  // FindMonInOTPartyToSwitchIntoBattle (core.asm): prefer a mon with a super-effective
  // move that the player's types are not super-effective against.
  redReplacement() {
    const side = this.sides[1];
    const cand = side.party.map((m, idx) => ({ m, idx })).filter(({ m, idx }) => m.hp > 0 && idx !== side.active);
    const pTypes = this.mon(0).types;
    const score = ({ m }) => {
      const enemyGood = m.moves.some((mv) => { const d = this.moveData(mv.id); return d.power && typeEffect(this.data, d.type, pTypes) > 10; });
      const playerGood = pTypes.some((t) => typeEffect(this.data, t, m.types) > 10);
      return { enemyGood, playerGood };
    };
    const best = cand.find((c) => { const s = score(c); return s.enemyGood && !s.playerGood; })
      || cand.find((c) => !score(c).playerGood);
    if (best) return best.idx;
    return cand[this.rng.int(cand.length)].idx;
  }

  // ===================== Red's AI =====================
  chooseRedAction() {
    const v = this.sides[1].vol;
    const locked = this.lockedMove(1);
    if (locked) return { type: 'move', moveId: locked, slot: -1 };
    const sw = this.aiSwitchOrItem();
    if (sw) return sw;
    const m = this.mon(1);
    if (!m.moves.some((mv) => mv.pp > 0 && !(v.disable && v.disable.move === mv.id))) {
      return { type: 'move', moveId: 165, slot: -1 };
    }
    if (v.encore) {
      const slot = m.moves.findIndex((mv) => mv.id === v.encore.move);
      return { type: 'move', moveId: v.encore.move, slot };
    }
    const slot = this.aiChooseMove();
    this.lastAiScores = this.lastAiScoresTmp;
    return { type: 'move', moveId: m.moves[slot].id, slot };
  }

  // engine/battle/ai/items.asm + switch.asm with Red's CONTEXT_USE | SWITCH_SOMETIMES
  aiSwitchOrItem() {
    const pv = this.sides[0].vol; const ev = this.sides[1].vol;
    if (pv.meanLook || ev.wrap > 0) return this.aiTryItem();
    const param = this.checkAbleToSwitch();
    if (param) {
      const kind = param & 0xf0; const r = this.rng();
      let go = false;
      if (kind === 0x10) go = r < pct(20) - 1;
      else if (kind === 0x20) go = r < pct(50) + 1;
      else go = !(r < pct(20) - 1);
      if (go) return { type: 'switch', to: param & 0x0f };
    }
    return this.aiTryItem();
  }

  aiTryItem() {
    const side = this.sides[1];
    const items = side.items;
    if (!items.some((x) => x === 14)) return null; // FULL_RESTORE
    // only while the highest-level party member is out
    const maxLevel = Math.max(...side.party.map((m) => m.level));
    const m = this.mon(1);
    if (m.level < maxLevel) return null;
    const halfUp = m.hp * 2 > m.maxHp; const quarterUp = m.hp * 4 > m.maxHp;
    let use = false;
    if (!halfUp) {
      if (!quarterUp) use = true;
      else use = this.rng() < pct(20) - 1;
    }
    if (!use && halfUp && m.status) {
      // .Status with CONTEXT_USE
      const v = side.vol;
      if (m.status === 'TOX' && v.toxicCount >= 4 && this.rng() < pct(50) + 1) use = true;
      else if (m.status === 'FRZ' || m.status === 'SLP') use = true;
    } else if (!use && !halfUp) use = false;
    if (!use) return null;
    return { type: 'item', item: 14 };
  }

  useFullRestore(i) {
    const side = this.sides[i];
    const k = side.items.indexOf(14);
    side.items[k] = 0;
    const m = this.mon(i);
    m.hp = m.maxHp; m.status = null; m.sleep = 0; side.vol.confused = 0; side.vol.toxicCount = 0;
    this.emit(`RED used FULL RESTORE on ${m.name}!`);
    const v = side.vol; v.furyCutter = 0; v.protectCount = 0; v.rage = false; v.bide = null;
  }

  playerMoveMatchupScore(enemyMon) {
    // CheckPlayerMoveTypeMatchups
    let score = 10;
    const pv = this.sides[0].vol; const pm = this.mon(0);
    if (pv.usedMoves.length) {
      let e = 0; let se = false;
      for (const id of pv.usedMoves) {
        const mv = this.moveData(id);
        if (!mv.power) continue;
        const eff = typeEffect(this.data, mv.type, enemyMon.types);
        if (eff > 10) { se = true; break; }
        if (eff === 0) continue;
        if (eff >= 10) e = 2; else if (e < 1) e = 1;
      }
      if (se) score--;
      else if (e !== 2) { score++; if (e === 0) score++; }
    } else {
      for (const t of new Set(pm.types)) if (typeEffect(this.data, t, enemyMon.types) > 10) score--;
    }
    let c = 0;
    for (const mv of enemyMon.moves) {
      const d = this.moveData(mv.id);
      if (!d.power) continue;
      const eff = typeEffect(this.data, d.type, pm.types);
      if (eff === 0) continue;
      c += 1;
      if (eff < 10) continue;
      c += 5;
      if (eff === 10) continue;
      c = 100;
    }
    if (c === 0) score -= 2; else if (c < 5) score -= 1; else if (c >= 100) score += 1;
    return score;
  }

  checkAbleToSwitch() {
    const side = this.sides[1];
    const others = side.party.map((m, idx) => ({ m, idx })).filter(({ m, idx }) => m.hp > 0 && idx !== side.active);
    if (!others.length) return 0;
    const ev = side.vol; const pm = this.mon(0);
    if (ev.perish === 1) {
      return 0x30 | others[0].idx;
    }
    const score = this.playerMoveMatchupScore(this.mon(1));
    if (score >= 11) return 0;
    const seMove = (m) => {
      let e = 0;
      for (const mv of m.moves) {
        const d = this.moveData(mv.id); if (!d.power) continue;
        const eff = typeEffect(this.data, d.type, pm.types);
        if (eff > 10) return 2;
        if (eff >= 10) e = 1;
      }
      return e;
    };
    const last = this.sides[0].vol.lastCounterMove;
    if (last && this.moveData(last).power) {
      const lm = this.moveData(last);
      const immune = others.filter(({ m }) => typeEffect(this.data, lm.type, m.types) === 0);
      if (immune.length) {
        const withSe = immune.find(({ m }) => seMove(m) === 2);
        const withAny = withSe || immune.find(({ m }) => seMove(m) === 1);
        if (!withAny) return 0;
        if (withSe) return (score >= 10 ? 0x10 : 0x20) | withSe.idx;
        if (score >= 10) return 0;
        return 0x10 | withAny.idx;
      }
    }
    if (score >= 10) return 0;
    const lastType = last && this.moveData(last).power ? [this.moveData(last).type] : pm.types;
    const pick = others.find(({ m }) => m.hp * 4 >= m.maxHp
      && lastType.every((t) => typeEffect(this.data, t, m.types) <= 10) && seMove(m) === 2);
    return pick ? (0x10 | pick.idx) : 0;
  }

  // engine/battle/ai/move.asm AIChooseMove + scoring layers from Red's AI flags
  aiChooseMove() {
    const m = this.mon(1); const v = this.sides[1].vol;
    const scores = m.moves.map((mv) => (mv.pp === 0 || (v.disable && v.disable.move === mv.id) ? 80 : 20));
    const flags = this.red.aiFlags;
    if (flags & AI.BASIC) this.aiBasic(scores);
    if (flags & AI.SETUP) this.aiSetup(scores);
    if (flags & AI.SMART) this.aiSmart(scores);
    if (flags & AI.AGGRESSIVE) this.aiAggressive(scores);
    if (flags & AI.CAUTIOUS) this.aiCautious(scores);
    if (flags & AI.STATUS) this.aiStatus(scores);
    if (flags & AI.RISKY) this.aiRisky(scores);
    this.lastAiScoresTmp = m.moves.map((mv, k) => ({ move: this.moveData(mv.id).name, score: scores[k] }));
    const min = Math.min(...scores);
    const best = scores.map((s, k) => (s === min ? k : -1)).filter((k) => k >= 0);
    let slot;
    do { slot = this.rng() & 3; } while (!best.includes(slot));
    return slot;
  }

  eachRedMove(fn) {
    const m = this.mon(1);
    m.moves.forEach((mv, k) => fn(this.moveData(mv.id), k));
  }

  aiBasic(scores) {
    const pm = this.mon(0);
    this.eachRedMove((mv, k) => {
      if (this.aiRedundant(mv)) { scores[k] += 10; return; }
      if (STATUS_ONLY.has(mv.effect) && (pm.status || this.sides[0].screens.safeguard)) scores[k] += 10;
    });
  }

  aiRedundant(mv) {
    const es = this.sides[1]; const ps = this.sides[0]; const em = this.mon(1);
    switch (mv.effect) {
      case 'EFFECT_DREAM_EATER': return this.mon(0).status !== 'SLP';
      case 'EFFECT_HEAL': case 'EFFECT_MORNING_SUN': case 'EFFECT_SYNTHESIS': case 'EFFECT_MOONLIGHT':
        return em.hp === em.maxHp;
      case 'EFFECT_LIGHT_SCREEN': return !!es.screens.lightScreen;
      case 'EFFECT_REFLECT': return !!es.screens.reflect;
      case 'EFFECT_MIST': return es.vol.mist;
      case 'EFFECT_FOCUS_ENERGY': return es.vol.focusEnergy;
      case 'EFFECT_CONFUSE': return ps.vol.confused > 0 || !!ps.screens.safeguard;
      case 'EFFECT_SUBSTITUTE': return es.vol.substitute > 0;
      case 'EFFECT_LEECH_SEED': return ps.vol.leechSeed;
      case 'EFFECT_DISABLE': return !!ps.vol.disable;
      case 'EFFECT_ENCORE': return !!ps.vol.encore;
      case 'EFFECT_SNORE': case 'EFFECT_SLEEP_TALK': return em.status !== 'SLP';
      case 'EFFECT_MEAN_LOOK': return ps.vol.meanLook;
      case 'EFFECT_NIGHTMARE': return this.mon(0).status !== 'SLP' || ps.vol.nightmare;
      case 'EFFECT_SPIKES': return !!ps.screens.spikes;
      case 'EFFECT_FORESIGHT': return ps.vol.identified;
      case 'EFFECT_PERISH_SONG': return ps.vol.perish > 0;
      case 'EFFECT_SANDSTORM': return this.weather === 'SANDSTORM';
      case 'EFFECT_RAIN_DANCE': return this.weather === 'RAIN';
      case 'EFFECT_SUNNY_DAY': return this.weather === 'SUN';
      case 'EFFECT_SAFEGUARD': return !!es.screens.safeguard;
      case 'EFFECT_SWAGGER': return ps.vol.confused > 0;
      case 'EFFECT_TELEPORT': return true;
      default: return false;
    }
  }

  aiSetup(scores) {
    const effects = this.data.effects;
    const idx = (e) => effects.indexOf(e);
    this.eachRedMove((mv, k) => {
      const e = idx(mv.effect);
      const up = (e >= idx('EFFECT_ATTACK_UP') && e <= idx('EFFECT_EVASION_UP'))
        || (e >= idx('EFFECT_ATTACK_UP_2') && e <= idx('EFFECT_EVASION_UP_2'));
      const down = (e >= idx('EFFECT_ATTACK_DOWN') && e <= idx('EFFECT_EVASION_DOWN'))
        || (e >= idx('EFFECT_ATTACK_DOWN_2') && e <= idx('EFFECT_EVASION_DOWN_2'));
      if (!up && !down) return;
      const firstTurn = up ? this.sides[1].vol.turnsTaken === 0 : this.sides[0].vol.turnsTaken === 0;
      if (firstTurn) { if (this.rng() >= 128) scores[k] -= 2; } // AI_50_50
      else if (this.rng() >= pct(12)) scores[k] += 2;
    });
  }

  aiSmart(scores) {
    const em = this.mon(1); const pm = this.mon(0); const ev = this.sides[1].vol; const pv = this.sides[0].vol;
    const enemyHalf = em.hp * 2 > em.maxHp; const enemyQuarter = em.hp * 4 > em.maxHp;
    const playerHalf = pm.hp * 2 > pm.maxHp;
    const encourage8020 = () => this.rng() >= pct(20) - 1; // AI_80_20 returns carry ~20% of the time
    const knows = (set) => em.moves.some((mv) => set.has(this.moveData(mv.id).name));
    this.eachRedMove((mv, k) => {
      switch (mv.effect) {
        case 'EFFECT_LEECH_HIT': {
          const eff = typeEffect(this.data, mv.type, pm.types);
          if (eff < 10) { if (this.rng() >= pct(39) + 1) scores[k]++; } else if (eff > 10 && em.hp !== em.maxHp && encourage8020()) scores[k]--;
          break;
        }
        case 'EFFECT_ALWAYS_HIT':
          if ((ev.stages.acc <= -3 || pv.stages.eva >= 3) && encourage8020()) scores[k] -= 2;
          break;
        case 'EFFECT_HEAL': case 'EFFECT_MORNING_SUN': case 'EFFECT_SYNTHESIS': case 'EFFECT_MOONLIGHT':
          if (!enemyQuarter) { if (this.rng() >= pct(10)) scores[k] -= 2; } else if (enemyHalf) scores[k]++;
          break;
        case 'EFFECT_LIGHT_SCREEN': case 'EFFECT_REFLECT':
          if (em.hp !== em.maxHp && this.rng() >= pct(8)) scores[k]++;
          break;
        case 'EFFECT_TRAP_TARGET': {
          let encourage = false;
          if (pv.wrap > 0) encourage = false;
          else if (pm.status === 'TOX' || pv.attract || pv.rollout || pv.identified || pv.nightmare || pv.turnsTaken === 0) encourage = true;
          if (encourage) { if (enemyQuarter && this.rng() >= 128) scores[k] -= 2; } else if (this.rng() >= 128) scores[k]++;
          break;
        }
        case 'EFFECT_SP_DEF_UP_2':
          if (!enemyHalf || ev.stages.spd >= 4) scores[k]++;
          else if (ev.stages.spd < 2 && pm.types.some((t) => SPECIAL_TYPES.has(t)) && encourage8020()) scores[k] -= 2;
          break;
        case 'EFFECT_SNORE': case 'EFFECT_SLEEP_TALK':
          if (em.status === 'SLP' && em.sleep === 1) scores[k] += 3; else scores[k] -= 3;
          break;
        case 'EFFECT_PRIORITY_HIT':
          if (this.stat(1, 'spe') > this.stat(0, 'spe')) break;
          if (pv.semiInvuln) { scores[k] += 10; break; }
          if (this.aiDamage(1, mv) > pm.hp) scores[k] -= 3;
          break;
        case 'EFFECT_RAIN_DANCE': case 'EFFECT_SUNNY_DAY': {
          const [good, bad, list] = mv.effect === 'EFFECT_RAIN_DANCE' ? ['FIRE', 'WATER', RAIN_MOVES] : ['WATER', 'FIRE', SUN_MOVES];
          const t1 = pm.types[0]; const t2 = pm.types[1] ?? pm.types[0];
          const verdict = t1 === bad ? 'bad' : t1 === good ? 'good' : t2 === bad ? 'bad' : t2 === good ? 'good' : null;
          if (verdict === 'bad') { scores[k] += 3; break; }
          if (verdict === 'good') {
            if (playerHalf && (pv.turnsTaken === 0 || ev.turnsTaken === 0)) scores[k] -= 2;
            break;
          }
          if (!knows(list) || !playerHalf) { scores[k] += 3; break; }
          if (this.rng() >= 128) scores[k]--;
          break;
        }
        case 'EFFECT_SOLARBEAM':
          if (this.weather === 'SUN') { if (encourage8020()) scores[k] -= 2; } else if (this.weather === 'RAIN' && this.rng() >= pct(10)) scores[k] += 2;
          break;
        case 'EFFECT_THUNDER':
          if (this.weather === 'SUN' && this.rng() >= pct(10)) scores[k]++;
          break;
        default: break;
      }
    });
  }

  aiAggressive(scores) {
    let bestK = -1; let best = -1;
    this.eachRedMove((mv, k) => {
      if (!mv.power) return;
      const d = this.aiDamage(1, mv);
      if (d >= best) { best = d; bestK = k; }
    });
    if (bestK < 0) return;
    this.eachRedMove((mv, k) => {
      if (k === bestK || mv.power < 2 || RECKLESS.has(mv.effect)) return;
      scores[k]++;
    });
  }

  aiCautious(scores) {
    if (this.sides[1].vol.turnsTaken === 0) return;
    this.eachRedMove((mv, k) => { if (RESIDUAL_MOVES.has(mv.name) && this.rng() < pct(90) + 1) scores[k]++; });
  }

  aiStatus(scores) {
    const pm = this.mon(0);
    this.eachRedMove((mv, k) => {
      let check = false;
      if (mv.effect === 'EFFECT_TOXIC' || mv.effect === 'EFFECT_POISON') {
        if (pm.types.includes('POISON')) { scores[k] += 10; return; }
        check = true;
      } else if (mv.effect === 'EFFECT_SLEEP' || mv.effect === 'EFFECT_PARALYZE' || mv.power) check = true;
      if (check && typeEffect(this.data, mv.type, pm.types, this.sides[0].vol.identified) === 0) scores[k] += 10;
    });
  }

  aiRisky(scores) {
    const pm = this.mon(0); const em = this.mon(1);
    this.eachRedMove((mv, k) => {
      if (!mv.power) return;
      if (RISKY.has(mv.effect)) {
        if (em.hp === em.maxHp) return;
        if (this.rng() < pct(79) - 1) return;
      }
      if (this.aiDamage(1, mv) > pm.hp) scores[k] -= 5;
    });
  }

  // ===================== move execution =====================
  executeMove(i, action) {
    const side = this.sides[i]; const v = side.vol; const m = this.mon(i);
    const tag = i === 0 ? '' : 'Enemy ';
    if (action.moveId === -1 || v.recharge) {
      v.recharge = false;
      this.emit(`${tag}${m.name} must recharge!`);
      return;
    }
    // status checks (CheckPlayerTurn / CheckEnemyTurn)
    if (m.status === 'SLP') {
      m.sleep--;
      if (m.sleep <= 0) {
        m.status = null; v.nightmare = false;
        this.emit(`${tag}${m.name} woke up!`);
        this.cancelLocks(v);
        return;
      }
      const id = action.moveId;
      if (id !== 173 && id !== 214) { // SNORE, SLEEP TALK
        this.emit(`${tag}${m.name} is fast asleep!`);
        this.cancelLocks(v);
        return;
      }
    }
    if (m.status === 'FRZ' && !['SACRED FIRE', 'FLAME WHEEL'].includes(this.moveData(action.moveId)?.name)) {
      this.emit(`${tag}${m.name} is frozen solid!`);
      this.cancelLocks(v);
      return;
    }
    if (v.flinch) { v.flinch = false; this.emit(`${tag}${m.name} flinched!`); this.cancelLocks(v); return; }
    if (v.disable) {
      v.disable.turns--;
      if (v.disable.turns <= 0) { this.emit(`${tag}${m.name}'s ${this.moveData(v.disable.move).name} is no longer disabled!`); v.disable = null; }
    }
    if (v.confused > 0) {
      v.confused--;
      if (v.confused === 0) this.emit(`${tag}${m.name}'s confused no more!`);
      else {
        this.emit(`${tag}${m.name} is confused!`);
        if (this.rng() >= 128) {
          const dmg = this.confusionDamage(i);
          this.damage(i, dmg, 'It hurt itself in its confusion!');
          this.cancelLocks(v);
          return;
        }
      }
    }
    if (v.attract) {
      this.emit(`${tag}${m.name} is in love with the foe!`);
      if (this.rng() >= 128) { this.emit(`${tag}${m.name} is immobilized by love!`); this.cancelLocks(v); return; }
    }
    if (v.disable && v.disable.move === action.moveId) {
      this.emit(`${tag}${m.name}'s ${this.moveData(action.moveId).name} is disabled!`);
      return;
    }
    if (m.status === 'PAR' && this.rng() < pct(25)) {
      this.emit(`${tag}${m.name} is fully paralyzed!`);
      this.cancelLocks(v);
      return;
    }
    this.useMove(i, action.moveId, action.slot);
  }

  cancelLocks(v) {
    v.charging = null; v.semiInvuln = null; v.rampage = 0; v.rollout = 0; v.rolloutMove = null; v.bide = null;
    v.furyCutter = 0;
  }

  confusionDamage(i) {
    // 40 power typeless physical hit on itself, no crit, no STAB/type
    const lv = this.mon(i).level;
    let A = this.stat(i, 'atk'); let D = this.stat(i, 'def');
    if (this.sides[i].screens.reflect) D *= 2;
    while (A > 255 || D > 255) { A = Math.max(1, A >> 2); D = Math.max(1, D >> 2); }
    const dmg = Math.floor(Math.floor((Math.floor(lv * 2 / 5) + 2) * 40 * A / D) / 50);
    return Math.min(dmg, 997) + 2;
  }

  damage(i, amount, text) {
    const m = this.mon(i);
    const dealt = Math.min(m.hp, Math.max(0, amount));
    m.hp -= dealt;
    if (text) this.emit(text);
    return dealt;
  }

  heal(i, amount) {
    const m = this.mon(i);
    const h = Math.min(m.maxHp - m.hp, Math.max(0, amount));
    m.hp += h;
    return h;
  }

  deductPP(i, slot, id) {
    if (slot < 0) return;
    const mv = this.mon(i).moves[slot];
    if (mv && mv.id === id && mv.pp > 0) mv.pp--;
  }

  useMove(i, id, slot) {
    const att = this.mon(i); const def = this.foe(i); const target = this.mon(def);
    const v = this.sides[i].vol; const tv = this.sides[def].vol;
    const tag = i === 0 ? '' : 'Enemy ';
    const ttag = def === 0 ? '' : 'Enemy ';
    let move = { ...this.moveData(id) };

    // two-turn moves: first turn
    const chargeTurn = ['EFFECT_RAZOR_WIND', 'EFFECT_SKY_ATTACK', 'EFFECT_SKULL_BASH', 'EFFECT_SOLARBEAM', 'EFFECT_FLY'].includes(move.effect)
      && v.charging !== id;
    const isLockedContinuation = v.charging === id || (v.rampage > 0 && v.rampageMove === id) || (v.rollout > 0 && v.rolloutMove === id) || (v.bide && id === 117);
    if (!isLockedContinuation) this.deductPP(i, slot, id);

    if (id === 165) this.emit(`${tag}${att.name} has no moves left!`);
    this.emit(`${tag}${att.name} used ${move.name}!`, i === 0 ? 'player-move' : 'red-move', { side: i, type: move.type, power: move.power || 0 });
    v.lastMove = id;
    if (i === 0 && !v.usedMoves.includes(id)) v.usedMoves.push(id);
    if (move.power) v.lastCounterMove = id;
    if (id !== 210) v.furyCutter = move.effect === 'EFFECT_FURY_CUTTER' ? v.furyCutter : 0;
    if (move.effect !== 'EFFECT_PROTECT' && move.effect !== 'EFFECT_ENDURE') v.protectCount = 0;
    if (move.effect !== 'EFFECT_RAGE') v.rage = false;

    if (chargeTurn) {
      if (move.effect === 'EFFECT_SOLARBEAM' && this.weather === 'SUN') { /* fires immediately */ } else {
        v.charging = id;
        const msg = {
          EFFECT_SOLARBEAM: 'took in sunlight!', EFFECT_RAZOR_WIND: 'made a whirlwind!',
          EFFECT_SKY_ATTACK: 'is glowing!', EFFECT_SKULL_BASH: 'lowered its head!', EFFECT_FLY: id === 91 ? 'dug a hole!' : 'flew up high!',
        }[move.effect];
        this.emit(`${tag}${att.name} ${msg}`);
        if (move.effect === 'EFFECT_SKULL_BASH') this.changeStage(i, i, 'def', 1, true);
        if (move.effect === 'EFFECT_FLY') v.semiInvuln = id === 91 ? 'DIG' : 'FLY';
        return;
      }
    }
    if (v.charging === id) { v.charging = null; v.semiInvuln = null; }

    // Moves that call other moves
    if (move.effect === 'EFFECT_METRONOME') {
      const banned = new Set([118, 165, 102, 166, 68, 182, 197, 203, 214, 119, 144, 168, 194]);
      let pick; do { pick = 1 + this.rng.int(251); } while (banned.has(pick));
      this.emit(`Waggled a finger and it became ${this.moveData(pick).name}!`);
      return this.useMoveBody(i, pick);
    }
    if (move.effect === 'EFFECT_MIRROR_MOVE') {
      const last = tv.lastMove;
      if (!last || last <= 0 || this.moveData(last).effect === 'EFFECT_MIRROR_MOVE') { this.emit('But it failed!'); return; }
      return this.useMoveBody(i, last);
    }
    if (move.effect === 'EFFECT_SLEEP_TALK') {
      if (att.status !== 'SLP') { this.emit('But it failed!'); return; }
      const opts = att.moves.filter((mv) => !['EFFECT_SLEEP_TALK', 'EFFECT_RAZOR_WIND', 'EFFECT_SKY_ATTACK', 'EFFECT_SKULL_BASH', 'EFFECT_SOLARBEAM', 'EFFECT_FLY', 'EFFECT_BIDE'].includes(this.moveData(mv.id).effect));
      if (!opts.length) { this.emit('But it failed!'); return; }
      const pick = opts[this.rng.int(opts.length)].id;
      return this.useMoveBody(i, pick);
    }
    return this.useMoveBody(i, id, ttag);
  }

  hitCheck(i, move) {
    const def = this.foe(i); const v = this.sides[i].vol; const tv = this.sides[def].vol;
    if (move.effect === 'EFFECT_DREAM_EATER' && this.mon(def).status !== 'SLP') return false;
    if (tv.protect) { this.emit(`${def === 0 ? '' : 'Enemy '}${this.mon(def).name} is protecting itself!`); return 'protected'; }
    if ((move.effect === 'EFFECT_LEECH_HIT' || move.effect === 'EFFECT_DREAM_EATER') && tv.substitute > 0) return false;
    if (v.lockOn > 0) { v.lockOn = 0; if (!(tv.semiInvuln === 'FLY' && ['EARTHQUAKE', 'FISSURE', 'MAGNITUDE'].includes(move.name))) return true; }
    if (tv.semiInvuln === 'FLY' && !['GUST', 'WHIRLWIND', 'THUNDER', 'TWISTER'].includes(move.name)) return false;
    if (tv.semiInvuln === 'DIG' && !['EARTHQUAKE', 'FISSURE', 'MAGNITUDE'].includes(move.name)) return false;
    if (move.effect === 'EFFECT_THUNDER' && this.weather === 'RAIN') return true;
    if (move.effect === 'EFFECT_ALWAYS_HIT') return true;
    if (move.effect === 'EFFECT_OHKO' && this.mon(def).level > this.mon(i).level) return false;
    let acc = move.accuracy;
    if (move.effect === 'EFFECT_THUNDER' && this.weather === 'SUN') acc = pct(50);
    const [an, ad] = ACC_MULT[v.stages.acc + 6];
    acc = Math.max(1, Math.min(255, Math.floor(acc * an / ad)));
    const [en, ed] = ACC_MULT[-tv.stages.eva + 6];
    acc = Math.max(1, Math.min(255, Math.floor(acc * en / ed)));
    if (acc === 255) return true;
    return this.rng() < acc;
  }

  isCrit(i, move) {
    if (!move.power) return false;
    let c = 0;
    if (this.sides[i].vol.focusEnergy) c++;
    if (CRIT_MOVES.has(move.name)) c += 2;
    return this.rng() < CRIT_CHANCE[c];
  }

  useMoveBody(i, id) {
    const att = this.mon(i); const def = this.foe(i); const target = this.mon(def);
    const v = this.sides[i].vol; const tv = this.sides[def].vol;
    const tag = i === 0 ? '' : 'Enemy ';
    const ttag = def === 0 ? '' : 'Enemy ';
    const move = { ...this.moveData(id) };
    const e = move.effect;

    // ---------- non-damaging effects ----------
    if (!move.power && !CONSTANT_DAMAGE.has(e) && !['EFFECT_OHKO', 'EFFECT_COUNTER', 'EFFECT_MIRROR_COAT', 'EFFECT_BIDE',
      'EFFECT_PRESENT', 'EFFECT_PSYWAVE', 'EFFECT_BEAT_UP'].includes(e)) {
      return this.statusMove(i, move);
    }

    // ---------- damaging ----------
    const hit = this.hitCheck(i, move);
    if (hit !== true) {
      if (hit !== 'protected') this.emit(`${tag}${att.name}'s attack missed!`);
      if (e === 'EFFECT_JUMP_KICK') {
        const d = Math.floor(this.aiDamage(i, move) / 8);
        this.damage(i, d, `${tag}${att.name} kept going and crashed!`);
      }
      if (e === 'EFFECT_SELFDESTRUCT') att.hp = 0;
      this.cancelLocks(v);
      return;
    }

    if (e === 'EFFECT_BIDE') return this.bide(i);
    if (e === 'EFFECT_COUNTER' || e === 'EFFECT_MIRROR_COAT') {
      const wantPhys = e === 'EFFECT_COUNTER';
      const last = tv.lastMove > 0 ? this.moveData(tv.lastMove) : null;
      if (!last || !v.lastDamage || !last.power || this.isSpecial(last.type) === wantPhys || i === this.firstMover) {
        this.emit('But it failed!'); return;
      }
      return this.applyDamage(i, move, Math.min(v.lastDamage * 2, 0xffff), false, 10);
    }

    let dmg; let crit = false; let eff = 10; let hits = 1;
    if (e === 'EFFECT_OHKO') {
      if (typeEffect(this.data, move.type, target.types) === 0) { this.emit(`It doesn't affect ${ttag}${target.name}!`); return; }
      this.applyDamage(i, move, 0xffff, false, 10);
      if (target.hp === 0) this.emit("It's a one-hit KO!");
      return;
    }
    if (CONSTANT_DAMAGE.has(e) || e === 'EFFECT_LEVEL_DAMAGE') {
      if (typeEffect(this.data, move.type, target.types, tv.identified) === 0) { this.emit(`It doesn't affect ${ttag}${target.name}!`); return; }
      dmg = this.constantDamage(i, move);
      return this.applyDamage(i, move, dmg, false, 10);
    }
    if (e === 'EFFECT_PRESENT') {
      const r = this.rng();
      if (r < pct(40)) move.power = 40; else if (r < pct(70) + 1) move.power = 80; else if (r < pct(80)) move.power = 120;
      else { this.heal(def, 80); this.emit(`${ttag}${target.name} regained health!`); return; }
    }
    if (e === 'EFFECT_MAGNITUDE') {
      const r = this.rng(); const tbl = [[pct(5), 4, 10], [pct(15) + 1, 5, 30], [pct(35), 6, 50], [pct(65) + 1, 7, 70], [pct(85) + 1, 8, 90], [pct(95) + 1, 9, 110], [256, 10, 150]];
      const [, mag, pw] = tbl.find(([cut]) => r < cut);
      this.emit(`Magnitude ${mag}!`); move.power = pw;
    }
    if (e === 'EFFECT_MULTI_HIT' || e === 'EFFECT_POISON_MULTI_HIT' || e === 'EFFECT_DOUBLE_HIT' || e === 'EFFECT_TRIPLE_KICK' || e === 'EFFECT_BEAT_UP') {
      if (e === 'EFFECT_MULTI_HIT') { const r = this.rng() & 3; hits = r < 2 ? 2 + (this.rng() & 1 ? 1 : 0) : 2 + (this.rng() & 3); hits = Math.min(5, Math.max(2, hits)); }
      else if (e === 'EFFECT_TRIPLE_KICK') hits = 1 + (this.rng() % 3);
      else if (e === 'EFFECT_BEAT_UP') hits = this.alive(i).filter((m) => !m.status).length || 1;
      else hits = 2;
    }

    const { power, type } = this.movePowerType(i, { ...move });
    move.power = e === 'EFFECT_PRESENT' || e === 'EFFECT_MAGNITUDE' ? move.power : power;
    move.type = type;
    if (e === 'EFFECT_FALSE_SWIPE') move.falseSwipe = true;

    let total = 0;
    for (let h = 0; h < hits; h++) {
      if (target.hp <= 0) break;
      crit = this.isCrit(i, move);
      let p = move.power;
      if (e === 'EFFECT_TRIPLE_KICK') p = move.power * (h + 1);
      dmg = this.baseDamage(i, move, { crit, power: p, type: move.type });
      ({ damage: dmg, eff } = this.modify(i, move, dmg, move.type));
      if (eff === 0) {
        this.emit(`It doesn't affect ${ttag}${target.name}!`);
        if (e === 'EFFECT_SELFDESTRUCT') att.hp = 0;
        this.cancelLocks(v); return;
      }
      dmg = this.variation(dmg);
      if (crit) this.emit('A critical hit!');
      total += this.applyDamage(i, move, dmg, crit, eff, h === hits - 1);
    }
    if (hits > 1) this.emit(`Hit ${hits} times!`);
    if (eff > 10) this.emit("It's super-effective!"); else if (eff < 10) this.emit("It's not very effective…");
    this.afterHit(i, move, total);
  }

  applyDamage(i, move, dmg, crit, eff, last = true) {
    const def = this.foe(i); const target = this.mon(def); const tv = this.sides[def].vol;
    const ttag = def === 0 ? '' : 'Enemy ';
    if (tv.substitute > 0 && move.effect !== 'EFFECT_LEECH_HIT') {
      const d = Math.min(tv.substitute, dmg);
      tv.substitute -= d;
      this.emit('The SUBSTITUTE took damage for it!');
      if (tv.substitute <= 0) { tv.substitute = 0; this.emit(`${ttag}${target.name}'s SUBSTITUTE faded!`); }
      return d;
    }
    let cap = target.hp;
    if ((tv.endure || move.falseSwipe) && dmg >= target.hp) cap = target.hp - 1;
    const dealt = Math.min(cap, dmg);
    target.hp -= dealt;
    if (tv.endure && target.hp === 1 && dmg > dealt) this.emit(`${ttag}${target.name} ENDURED the hit!`);
    tv.lastDamage = dealt;
    if (tv.bide) tv.bide.dmg += dealt;
    if (tv.rage && target.hp > 0) { this.changeStage(def, def, 'atk', 1, true); this.emit(`${ttag}${target.name}'s RAGE is building!`); }
    if (target.hp <= 0 && tv.destinyBond) {
      this.mon(i).hp = 0; this.emit(`${ttag}${target.name} took its foe with it!`);
    }
    return dealt;
  }

  afterHit(i, move, total) {
    const att = this.mon(i); const def = this.foe(i); const target = this.mon(def);
    const v = this.sides[i].vol; const tv = this.sides[def].vol;
    const tag = i === 0 ? '' : 'Enemy ';
    const ttag = def === 0 ? '' : 'Enemy ';
    const e = move.effect;
    const chance = () => this.rng() < move.chance;
    const behindSub = tv.substitute > 0;
    switch (e) {
      case 'EFFECT_RECOIL_HIT': if (total) this.damage(i, Math.max(1, total >> 2), `${tag}${att.name}'s hit with recoil!`); break;
      case 'EFFECT_LEECH_HIT': case 'EFFECT_DREAM_EATER': {
        const h = this.heal(i, Math.max(1, total >> 1));
        if (h) this.emit(`Sucked health from ${ttag}${target.name}!`);
        break;
      }
      case 'EFFECT_SELFDESTRUCT': att.hp = 0; break;
      case 'EFFECT_HYPER_BEAM': v.recharge = true; break;
      case 'EFFECT_RAMPAGE':
        if (v.rampage === 0) { v.rampage = 2 + (this.rng() & 1); v.rampageMove = move.id; }
        v.rampage--;
        if (v.rampage === 0) { v.rampageMove = null; this.inflictConfusion(i, i, true); }
        break;
      case 'EFFECT_ROLLOUT':
        if (v.rollout === 0) { v.rolloutMove = move.id; }
        v.rollout++;
        if (v.rollout >= 5) { v.rollout = 0; v.rolloutMove = null; }
        break;
      case 'EFFECT_FURY_CUTTER': v.furyCutter = Math.min(5, v.furyCutter + 1); break;
      case 'EFFECT_RAGE': v.rage = true; break;
      case 'EFFECT_TRAP_TARGET':
        if (target.hp > 0 && !behindSub && tv.wrap === 0) {
          // Crystal: 2-5 turns (wrap count = 3..6 minus the current turn)
          v.trapping = true; this.sides[def].vol.wrap = 2 + (this.rng() & 3); this.sides[def].vol.wrapMove = move.name;
          this.emit(`${ttag}${target.name} was trapped!`);
        }
        break;
      case 'EFFECT_PAY_DAY': this.emit('Coins scattered everywhere!'); break;
      case 'EFFECT_THIEF': break;
      case 'EFFECT_RAPID_SPIN':
        v.leechSeed = false; v.wrap = 0; this.sides[i].screens.spikes = false; break;
      case 'EFFECT_FLAME_WHEEL': case 'EFFECT_SACRED_FIRE':
        if (att.status === 'FRZ') { att.status = null; this.emit(`${tag}${att.name} was defrosted!`); }
        if (chance()) this.inflictStatus(i, def, 'BRN', true);
        break;
      case 'EFFECT_DEFROST_OPPONENT': break;
      case 'EFFECT_FLINCH_HIT': case 'EFFECT_STOMP': case 'EFFECT_TWISTER':
        if (chance() && !behindSub && !tv.didMove) tv.flinch = true;
        break;
      case 'EFFECT_SKY_ATTACK': if (chance() && !behindSub && !tv.didMove) tv.flinch = true; break;
      case 'EFFECT_PARALYZE_HIT': case 'EFFECT_THUNDER': if (chance()) this.inflictStatus(i, def, 'PAR', true); break;
      case 'EFFECT_BURN_HIT':
        if (target.status === 'FRZ' && !behindSub) { target.status = null; this.emit(`${ttag}${target.name} was defrosted!`); break; }
        if (chance()) this.inflictStatus(i, def, 'BRN', true);
        break;
      case 'EFFECT_FREEZE_HIT': if (chance()) this.inflictStatus(i, def, 'FRZ', true); break;
      case 'EFFECT_POISON_HIT': case 'EFFECT_POISON_MULTI_HIT': if (chance()) this.inflictStatus(i, def, 'PSN', true); break;
      case 'EFFECT_TRI_ATTACK':
        if (chance()) this.inflictStatus(i, def, ['BRN', 'FRZ', 'PAR'][this.rng.int(3)], true);
        break;
      case 'EFFECT_CONFUSE_HIT': if (chance()) this.inflictConfusion(i, def, true); break;
      case 'EFFECT_ALL_UP_HIT':
        if (chance()) ['atk', 'def', 'spe', 'spa', 'spd'].forEach((s) => this.changeStage(i, i, s, 1, true));
        break;
      default: {
        const m = /^EFFECT_(\w+?)_(UP|DOWN)_HIT$/.exec(e);
        if (m && chance()) {
          const stat = STAT_EFFECTS[m[1]];
          if (m[2] === 'UP') this.changeStage(i, i, stat, 1, true);
          else if (target.hp > 0 && !behindSub) this.changeStage(i, def, stat, -1, true, e === 'EFFECT_ACCURACY_DOWN_HIT');
        }
      }
    }
  }

  inflictStatus(i, def, status, secondary = false) {
    const target = this.mon(def); const tv = this.sides[def].vol;
    const ttag = def === 0 ? '' : 'Enemy ';
    if (target.hp <= 0) return false;
    const fail = (why) => { if (!secondary) this.emit(why || 'But it failed!'); return false; };
    if (target.status) return fail(target.status === status ? `${ttag}${target.name} is already ${this.statusWord(status)}!` : null);
    if (this.sides[def].screens.safeguard) return fail(`${ttag}${target.name} is protected by SAFEGUARD!`);
    if (tv.substitute > 0 && (status !== 'SLP' || secondary)) return fail();
    if (status === 'BRN' && target.types.includes('FIRE')) return fail();
    if (status === 'FRZ' && target.types.includes('ICE')) return fail();
    if ((status === 'PSN' || status === 'TOX') && (target.types.includes('POISON') || target.types.includes('STEEL'))) return fail("It doesn't affect " + ttag + target.name + '!');
    if (status === 'FRZ' && this.weather === 'SUN') return fail();
    target.status = status;
    if (status === 'SLP') {
      let r; do { r = this.rng() & 7; } while (r === 0 || r === 7);
      target.sleep = r + 1;
      this.cancelLocks(tv);
    }
    if (status === 'TOX') tv.toxicCount = 0;
    this.emit(`${ttag}${target.name} ${{ PAR: 'is paralyzed! Maybe it can\'t attack!', BRN: 'was burned!', FRZ: 'was frozen solid!', PSN: 'was poisoned!', TOX: 'is badly poisoned!', SLP: 'fell asleep!' }[status]}`);
    return true;
  }

  statusWord(s) { return { PAR: 'paralyzed', BRN: 'burned', FRZ: 'frozen', PSN: 'poisoned', TOX: 'poisoned', SLP: 'asleep' }[s]; }

  inflictConfusion(i, def, secondary) {
    const tv = this.sides[def].vol; const target = this.mon(def);
    const ttag = def === 0 ? '' : 'Enemy ';
    if (tv.confused > 0) { if (!secondary) this.emit(`${ttag}${target.name} is already confused!`); return; }
    if (def !== i && (this.sides[def].screens.safeguard || tv.substitute > 0)) { if (!secondary) this.emit('But it failed!'); return; }
    tv.confused = 2 + (this.rng() & 3);
    this.emit(`${ttag}${target.name} became confused!`);
  }

  changeStage(i, who, stat, delta, secondary = false, ignoreAiFail = false) {
    const v = this.sides[who].vol; const m = this.mon(who);
    const wtag = who === 0 ? '' : 'Enemy ';
    if (who !== i && delta < 0) {
      if (v.mist) { if (!secondary) this.emit(`${wtag}${m.name}'s protected by MIST.`); return false; }
      if (v.substitute > 0 && !secondary) { this.emit('But it failed!'); return false; }
      // StatDown: computer opponents fail 25% of the time unless locked on
      if (i === 1 && !ignoreAiFail && !this.sides[1].vol.lockOnUsed && this.rng() < pct(25) + 1) {
        if (!secondary) this.emit('But it failed!');
        return false;
      }
    }
    const cur = v.stages[stat];
    const next = Math.max(-6, Math.min(6, cur + delta));
    if (next === cur || (delta > 0 && this.mon(who).stats[stat] >= 999)) {
      if (!secondary) this.emit('Nothing happened!');
      return false;
    }
    v.stages[stat] = next;
    const word = Math.abs(delta) >= 2 ? (delta > 0 ? 'went way up!' : 'sharply fell!') : (delta > 0 ? 'went up!' : 'fell!');
    this.emit(`${wtag}${m.name}'s ${STAT_LABEL[stat]} ${word}`);
    return true;
  }

  statusMove(i, move) {
    const att = this.mon(i); const def = this.foe(i); const target = this.mon(def);
    const v = this.sides[i].vol; const tv = this.sides[def].vol; const side = this.sides[i];
    const tag = i === 0 ? '' : 'Enemy ';
    const ttag = def === 0 ? '' : 'Enemy ';
    const e = move.effect;
    const fail = () => this.emit('But it failed!');
    const aiFail = () => i === 1 && !this.sides[0].vol.lockedOnBy1 && this.rng() < pct(25) + 1;
    const needsHit = () => {
      const h = this.hitCheck(i, move);
      if (h === true) return true;
      if (h !== 'protected') this.emit(`${tag}${att.name}'s attack missed!`);
      return false;
    };
    const m = /^EFFECT_(\w+?)_(UP|DOWN)(_2)?$/.exec(e);
    if (m && STAT_EFFECTS[m[1]]) {
      const stat = STAT_EFFECTS[m[1]]; const amt = m[3] ? 2 : 1;
      if (m[2] === 'UP') {
        this.changeStage(i, i, stat, amt);
        if (move.name === 'MINIMIZE') v.minimized = true;
      } else {
        if (!needsHit()) return;
        this.changeStage(i, def, stat, -amt);
      }
      return;
    }
    switch (e) {
      case 'EFFECT_SLEEP':
        if (target.status === 'SLP') { this.emit(`${ttag}${target.name} is already asleep!`); return; }
        if (!needsHit()) return;
        if (aiFail()) { fail(); return; }
        this.inflictStatus(i, def, 'SLP'); return;
      case 'EFFECT_POISON': case 'EFFECT_TOXIC':
        if (typeEffect(this.data, move.type, target.types) === 0 && false) return;
        if (!needsHit()) return;
        if (aiFail()) { fail(); return; }
        this.inflictStatus(i, def, e === 'EFFECT_TOXIC' ? 'TOX' : 'PSN'); return;
      case 'EFFECT_PARALYZE':
        if (typeEffect(this.data, move.type, target.types) === 0) { this.emit(`It doesn't affect ${ttag}${target.name}!`); return; }
        if (!needsHit()) return;
        if (aiFail()) { fail(); return; }
        this.inflictStatus(i, def, 'PAR'); return;
      case 'EFFECT_CONFUSE': if (!needsHit()) return; this.inflictConfusion(i, def); return;
      case 'EFFECT_SWAGGER':
        if (!needsHit()) return;
        this.changeStage(i, def, 'atk', 2, true); this.inflictConfusion(i, def); return;
      case 'EFFECT_ATTRACT':
        if (!needsHit()) return;
        if (!att.gender || !target.gender || att.gender === target.gender || tv.attract) { fail(); return; }
        tv.attract = true; this.emit(`${ttag}${target.name} fell in love!`); return;
      case 'EFFECT_HEAL': {
        if (att.hp === att.maxHp) { this.emit(`${tag}${att.name}'s HP is full!`); return; }
        if (move.name === 'REST') {
          att.status = 'SLP'; att.sleep = 3; v.toxicCount = 0;
          this.emit(`${tag}${att.name} started sleeping!`);
          this.heal(i, att.maxHp);
          this.emit(`${tag}${att.name} regained health!`);
        } else { this.heal(i, att.maxHp >> 1); this.emit(`${tag}${att.name} regained health!`); }
        return;
      }
      case 'EFFECT_MORNING_SUN': case 'EFFECT_SYNTHESIS': case 'EFFECT_MOONLIGHT': {
        if (att.hp === att.maxHp) { this.emit(`${tag}${att.name}'s HP is full!`); return; }
        // Crystal: 1/4 normally (time-of-day bonus ignored), x2 in sun, /2 in rain/sand
        let amt = att.maxHp >> 2;
        if (this.weather === 'SUN') amt *= 2; else if (this.weather) amt >>= 1;
        this.heal(i, Math.max(1, amt)); this.emit(`${tag}${att.name} regained health!`); return;
      }
      case 'EFFECT_REFLECT': case 'EFFECT_LIGHT_SCREEN': case 'EFFECT_SAFEGUARD': {
        const key = { EFFECT_REFLECT: 'reflect', EFFECT_LIGHT_SCREEN: 'lightScreen', EFFECT_SAFEGUARD: 'safeguard' }[e];
        if (side.screens[key]) { fail(); return; }
        side.screens[key] = 5;
        this.emit({ reflect: `${tag}${att.name}'s DEFENSE rose!`, lightScreen: `${tag}${att.name}'s SPCL.DEF rose!`, safeguard: `${tag}${att.name}'s covered by a veil!` }[key]);
        return;
      }
      case 'EFFECT_RAIN_DANCE': this.weather = 'RAIN'; this.weatherTurns = 5; this.emit('A downpour started!'); return;
      case 'EFFECT_SUNNY_DAY': this.weather = 'SUN'; this.weatherTurns = 5; this.emit('The sunlight got bright!'); return;
      case 'EFFECT_SANDSTORM':
        if (this.weather === 'SANDSTORM') { fail(); return; }
        this.weather = 'SANDSTORM'; this.weatherTurns = 5; this.emit('A sandstorm brewed!'); return;
      case 'EFFECT_RESET_STATS':
        for (const s of [0, 1]) Object.keys(this.sides[s].vol.stages).forEach((k) => { this.sides[s].vol.stages[k] = 0; });
        this.emit('All stat changes were eliminated!'); return;
      case 'EFFECT_MIST': if (v.mist) { fail(); return; } v.mist = true; this.emit(`${tag}${att.name}'s shrouded in MIST!`); return;
      case 'EFFECT_FOCUS_ENERGY': if (v.focusEnergy) { fail(); return; } v.focusEnergy = true; this.emit(`${tag}${att.name} is getting pumped!`); return;
      case 'EFFECT_DEFENSE_CURL': v.defenseCurl = true; this.changeStage(i, i, 'def', 1); return;
      case 'EFFECT_BELLY_DRUM':
        if (att.hp <= att.maxHp >> 1) { fail(); return; }
        this.damage(i, att.maxHp >> 1); v.stages.atk = 6;
        this.emit(`${tag}${att.name} cut its HP and maximized ATTACK!`); return;
      case 'EFFECT_SUBSTITUTE': {
        const cost = att.maxHp >> 2;
        if (v.substitute > 0) { this.emit(`${tag}${att.name} has a SUBSTITUTE!`); return; }
        if (att.hp <= cost) { this.emit('Too weak to make a SUBSTITUTE!'); return; }
        this.damage(i, cost); v.substitute = cost + 1; v.wrap = 0;
        this.emit('It made a SUBSTITUTE!'); return;
      }
      case 'EFFECT_LEECH_SEED':
        if (!needsHit()) return;
        if (target.types.includes('GRASS') || tv.leechSeed) { this.emit(`${ttag}${target.name} evaded the attack!`); return; }
        tv.leechSeed = true; this.emit(`${ttag}${target.name} was seeded!`); return;
      case 'EFFECT_DISABLE': {
        if (!needsHit()) return;
        const last = tv.lastMove;
        if (!last || last <= 0 || tv.disable || !target.moves.some((mv) => mv.id === last && mv.pp > 0)) { fail(); return; }
        tv.disable = { move: last, turns: 2 + (this.rng() & 7) };
        this.emit(`${ttag}${target.name}'s ${this.moveData(last).name} was disabled!`); return;
      }
      case 'EFFECT_ENCORE': {
        const last = tv.lastMove;
        const bad = ['MIMIC', 'ENCORE', 'MIRROR MOVE', 'STRUGGLE', 'TRANSFORM', 'SKETCH', 'SLEEP TALK'];
        if (!last || last <= 0 || tv.encore || bad.includes(this.moveData(last).name) || !target.moves.some((mv) => mv.id === last && mv.pp > 0)) { fail(); return; }
        tv.encore = { move: last, turns: 3 + (this.rng() & 3) };
        this.emit(`${ttag}${target.name} got an ENCORE!`); return;
      }
      case 'EFFECT_PAIN_SPLIT': {
        if (!needsHit()) return;
        const avg = Math.floor((att.hp + target.hp) / 2);
        att.hp = Math.min(att.maxHp, avg); target.hp = Math.min(target.maxHp, avg);
        this.emit('The battlers shared pain!'); return;
      }
      case 'EFFECT_PROTECT': case 'EFFECT_ENDURE': {
        const ok = this.rng() < Math.floor(255 / (1 << Math.min(v.protectCount * 1, 8))) || v.protectCount === 0;
        if (!ok || i === this.lastMoverThisTurn) { v.protectCount = 0; fail(); return; }
        v.protectCount++;
        if (e === 'EFFECT_PROTECT') { v.protect = true; this.emit(`${tag}${att.name} protected itself!`); } else { v.endure = true; this.emit(`${tag}${att.name} braced itself!`); }
        return;
      }
      case 'EFFECT_LOCK_ON': if (!needsHit()) return; v.lockOn = 2; this.emit(`${tag}${att.name} took aim!`); return;
      case 'EFFECT_FORESIGHT':
        if (!needsHit()) return;
        tv.identified = true; tv.stages.eva = Math.min(tv.stages.eva, 0);
        this.emit(`${tag}${att.name} identified ${ttag}${target.name}!`); return;
      case 'EFFECT_MEAN_LOOK':
        if (!needsHit()) return;
        if (tv.meanLook) { fail(); return; }
        tv.meanLook = true; this.emit(`${ttag}${target.name} can't escape now!`); return;
      case 'EFFECT_NIGHTMARE':
        if (target.status !== 'SLP' || tv.nightmare || tv.substitute) { fail(); return; }
        tv.nightmare = true; this.emit(`${ttag}${target.name} began to have a NIGHTMARE!`); return;
      case 'EFFECT_CURSE':
        if (att.types.includes('GHOST')) {
          if (tv.curse) { fail(); return; }
          this.damage(i, att.maxHp >> 1); tv.curse = true;
          this.emit(`${tag}${att.name} cut its own HP and laid a CURSE on ${ttag}${target.name}!`); return;
        }
        this.changeStage(i, i, 'spe', -1, true); this.changeStage(i, i, 'atk', 1); this.changeStage(i, i, 'def', 1); return;
      case 'EFFECT_PERISH_SONG':
        if (tv.perish && v.perish) { fail(); return; }
        if (!v.perish) v.perish = 4; if (!tv.perish) tv.perish = 4;
        this.emit('Both POKéMON will faint in 3 turns!'); return;
      case 'EFFECT_SPIKES':
        if (this.sides[def].screens.spikes) { fail(); return; }
        this.sides[def].screens.spikes = true; this.emit(`SPIKES scattered all around ${ttag}${target.name}!`); return;
      case 'EFFECT_DESTINY_BOND': v.destinyBond = true; this.emit(`${tag}${att.name} is trying to take its foe with it!`); return;
      case 'EFFECT_HEAL_BELL':
        side.party.forEach((p) => { if (p.hp > 0) { p.status = null; p.sleep = 0; } });
        this.emit('A bell chimed!'); return;
      case 'EFFECT_PSYCH_UP':
        Object.assign(v.stages, { ...tv.stages }); this.emit(`${tag}${att.name} copied ${ttag}${target.name}'s stat changes!`); return;
      case 'EFFECT_BATON_PASS': {
        const opts = side.party.map((p, k) => ({ p, k })).filter(({ p, k }) => p.hp > 0 && k !== side.active);
        if (!opts.length) { fail(); return; }
        v.batonPass = true;
        if (i === 1) this.doSwitch(1, this.redReplacement(), true);
        else { this.pendingBatonPass = true; this.pendingSwitch = 0; }
        return;
      }
      case 'EFFECT_FORCE_SWITCH': {
        const opts = this.sides[def].party.map((p, k) => ({ p, k })).filter(({ p, k }) => p.hp > 0 && k !== this.sides[def].active);
        if (!opts.length || i === this.firstMover) { fail(); return; }
        if (!needsHit()) return;
        const pick = opts[this.rng.int(opts.length)].k;
        this.emit(`${ttag}${target.name} was dragged out!`);
        this.doSwitch(def, pick, false);
        return;
      }
      case 'EFFECT_CONVERSION': {
        const types = att.moves.map((mv) => this.moveData(mv.id).type).filter((t) => t !== 'CURSE' && !att.types.includes(t));
        if (!types.length) { fail(); return; }
        const t = types[this.rng.int(types.length)]; att.types = [t];
        this.emit(`${tag}${att.name} transformed into the ${t}-type!`); return;
      }
      case 'EFFECT_CONVERSION2': {
        const last = tv.lastMove > 0 ? this.moveData(tv.lastMove).type : null;
        if (!last) { fail(); return; }
        const res = TYPE_ORDER.filter((t) => t !== 'BIRD' && t !== 'CURSE' && typeEffect(this.data, last, [t]) < 10);
        const t = res[this.rng.int(res.length)]; att.types = [t];
        this.emit(`${tag}${att.name} transformed into the ${t}-type!`); return;
      }
      case 'EFFECT_TRANSFORM': {
        if (v.transformed || tv.semiInvuln) { fail(); return; }
        att.types = [...target.types];
        att.stats = { ...target.stats, hp: att.stats.hp };
        att.moves = target.moves.map((mv) => ({ id: mv.id, pp: 5, maxPp: 5 }));
        v.stages = { ...tv.stages }; v.transformed = true;
        this.emit(`${tag}${att.name} transformed into ${target.name}!`); return;
      }
      case 'EFFECT_MIMIC': {
        const last = tv.lastMove;
        if (!last || last <= 0 || att.moves.some((mv) => mv.id === last)) { fail(); return; }
        const slot = att.moves.findIndex((mv) => mv.id === 102);
        if (slot >= 0) att.moves[slot] = { id: last, pp: 5, maxPp: 5 };
        this.emit(`${tag}${att.name} learned ${this.moveData(last).name}!`); return;
      }
      case 'EFFECT_SKETCH': {
        const last = tv.lastMove;
        if (!last || last <= 0 || last === 166 || last === 165) { fail(); return; }
        const slot = att.moves.findIndex((mv) => mv.id === 166);
        if (slot >= 0) att.moves[slot] = { id: last, pp: this.moveData(last).pp, maxPp: this.moveData(last).pp };
        this.emit(`${tag}${att.name} SKETCHED ${this.moveData(last).name}!`); return;
      }
      case 'EFFECT_SPITE': {
        const last = tv.lastMove;
        const mv = target.moves.find((x) => x.id === last);
        if (!mv || mv.pp === 0) { fail(); return; }
        const n = Math.min(mv.pp, 2 + (this.rng() & 3)); mv.pp -= n;
        this.emit(`Reduced ${ttag}${target.name}'s ${this.moveData(last).name} by ${n}!`); return;
      }
      case 'EFFECT_FUTURE_SIGHT': {
        const fs = this.sides[def];
        if (fs.futureSight) { fail(); return; }
        const fsMove = { ...move, power: 80, type: 'PSYCHIC', effect: 'EFFECT_NORMAL_HIT' };
        fs.futureSight = { turns: 3, dmg: this.variation(this.modify(i, fsMove, this.baseDamage(i, fsMove)).damage), from: att.name };
        this.emit(`${tag}${att.name} foresaw an attack!`); return;
      }
      case 'EFFECT_TELEPORT': case 'EFFECT_SPLASH': this.emit('But nothing happened!'); return;
      default:
        this.emit(`(${move.name}'s effect isn't simulated yet.)`, 'warn'); return;
    }
  }

  bide(i) {
    const v = this.sides[i].vol; const att = this.mon(i);
    const tag = i === 0 ? '' : 'Enemy ';
    if (!v.bide) { v.bide = { turns: 2 + (this.rng() & 1), dmg: 0 }; this.emit(`${tag}${att.name} is storing energy!`); return; }
    v.bide.turns--;
    if (v.bide.turns > 0) { this.emit(`${tag}${att.name} is storing energy!`); return; }
    const dmg = v.bide.dmg * 2; v.bide = null;
    this.emit(`${tag}${att.name} unleashed energy!`);
    if (!dmg) { this.emit('But it failed!'); return; }
    this.applyDamage(i, { effect: 'EFFECT_BIDE' }, dmg, false, 10);
  }

  // ----- end of turn (HandleBetweenTurnEffects, core.asm) -----
  residual() {
    const order = this.stat(0, 'spe') >= this.stat(1, 'spe') ? [0, 1] : [1, 0];
    // Future Sight
    for (const i of order) {
      const fs = this.sides[i].futureSight;
      if (fs && --fs.turns === 0) {
        this.sides[i].futureSight = null;
        if (this.mon(i).hp > 0) this.damage(i, fs.dmg, `${this.mon(i).name} took the FUTURE SIGHT attack!`);
      }
    }
    if (this.checkFaints()) return;
    // Weather
    if (this.weather) {
      if (--this.weatherTurns <= 0) {
        this.emit({ RAIN: 'The rain stopped.', SUN: 'The sunlight faded.', SANDSTORM: 'The sandstorm subsided.' }[this.weather]);
        this.weather = null;
      } else {
        this.emit({ RAIN: 'Rain continues to fall.', SUN: 'The sunlight is strong.', SANDSTORM: 'The sandstorm rages.' }[this.weather]);
        if (this.weather === 'SANDSTORM') {
          for (const i of order) {
            const m = this.mon(i);
            if (m.hp > 0 && !m.types.some((t) => ['ROCK', 'GROUND', 'STEEL'].includes(t)) && !this.sides[i].vol.semiInvuln) {
              this.damage(i, Math.max(1, m.maxHp >> 3), `${m.name} is buffeted by the sandstorm!`);
            }
          }
        }
      }
    }
    if (this.checkFaints()) return;
    // Wrap
    for (const i of order) {
      const v = this.sides[i].vol; const m = this.mon(i);
      if (v.wrap > 0 && m.hp > 0) {
        v.wrap--;
        if (v.wrap === 0) this.emit(`${m.name} was released from ${v.wrapMove}!`);
        else this.damage(i, Math.max(1, m.maxHp >> 4), `${m.name} is hurt by ${v.wrapMove}!`);
      }
    }
    // Perish Song
    for (const i of order) {
      const v = this.sides[i].vol; const m = this.mon(i);
      if (v.perish > 0 && m.hp > 0) {
        v.perish--;
        this.emit(`${m.name}'s PERISH count is ${v.perish}!`);
        if (v.perish === 0) m.hp = 0;
      }
    }
    if (this.checkFaints()) return;
    // status / leech seed / nightmare / curse
    for (const i of order) {
      const m = this.mon(i); const v = this.sides[i].vol;
      if (m.hp <= 0) continue;
      if (m.status === 'PSN' || m.status === 'TOX' || m.status === 'BRN') {
        let d = Math.max(1, m.maxHp >> 3);
        if (m.status === 'TOX') { v.toxicCount++; d = Math.max(1, Math.floor(m.maxHp / 16) * v.toxicCount); }
        this.damage(i, d, `${m.name} is hurt by ${m.status === 'BRN' ? 'its burn' : 'poison'}!`);
      }
      if (v.leechSeed && m.hp > 0 && this.mon(this.foe(i)).hp > 0) {
        const d = this.damage(i, Math.max(1, m.maxHp >> 3), `LEECH SEED saps ${m.name}!`);
        this.heal(this.foe(i), d);
      }
      if (v.nightmare && m.status === 'SLP' && m.hp > 0) this.damage(i, Math.max(1, m.maxHp >> 2), `${m.name} is locked in a NIGHTMARE!`);
      if (v.curse && m.hp > 0) this.damage(i, Math.max(1, m.maxHp >> 2), `${m.name} is afflicted by the CURSE!`);
    }
    if (this.checkFaints()) return;
    // Defrost: 10% per turn (HandleDefrost)
    for (const i of order) {
      const m = this.mon(i);
      if (m.status === 'FRZ' && !this.sides[i].vol.didMoveFrozenThisTurn && this.rng() < pct(10)) {
        m.status = null; this.emit(`${m.name} thawed out!`);
      }
    }
    // Screens / safeguard
    for (const i of order) {
      const sc = this.sides[i].screens;
      for (const [k, name] of [['safeguard', 'SAFEGUARD'], ['lightScreen', 'LIGHT SCREEN'], ['reflect', 'REFLECT']]) {
        if (sc[k] && --sc[k] === 0) { sc[k] = 0; this.emit(`${i === 0 ? 'Your' : "RED's"} ${name} wore off!`); }
      }
    }
    // Encore countdown
    for (const i of order) {
      const v = this.sides[i].vol;
      if (v.encore && (--v.encore.turns <= 0 || !this.mon(i).moves.find((mv) => mv.id === v.encore.move)?.pp)) {
        v.encore = null; this.emit(`${this.mon(i).name}'s ENCORE ended!`);
      }
    }
  }
}
