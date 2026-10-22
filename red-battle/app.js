import { Battle, makeRng, randomTeam, redTeam } from './engine.js';
import { createGameAudio } from './gbsound.js';
import { soundEvents } from './battle-audio.js';
import { planAnimation, FRAME_HZ } from './anims.js';

const $ = (id) => document.getElementById(id);
const STATUS_LABEL = { PAR: 'PAR', SLP: 'SLP', PSN: 'PSN', TOX: 'PSN', BRN: 'BRN', FRZ: 'FRZ' };
const WEATHER_LABEL = { RAIN: '☂ RAIN', SUN: '☀ SUN', SANDSTORM: '≋ SANDSTORM' };
const SPEEDS = [['NORMAL', 22], ['FAST', 8], ['INSTANT', 0]];

let data; let team; let battle; let shown = 0; let speedIdx = 0; let typing = null; let busy = false;
const spriteCache = new Map();

// ---------- audio (Crystal's sound engine, see gbsound.js) ----------
let audio = null;
let animData = null; // audio.json: animation scripts (loaded on the silent setup screen, played in battle)
let muted = false;
try { muted = localStorage.getItem('red-battle-muted') === '1'; } catch { /* storage unavailable */ }

// Audio must never break the game: failures are logged and the battle carries on silently.
function snd(fn) {
  if (!audio) return;
  try { fn(audio); } catch (err) { console.warn('audio:', err); }
}

function startAudio() {
  try {
    if (!audio) {
      audio = createGameAudio();
      audio.ready.catch((err) => { console.warn('audio unavailable:', err); audio = null; });
    }
    audio.setMuted(muted);
  } catch (err) {
    console.warn('audio unavailable:', err);
    audio = null;
  }
}

function setMuted(m) {
  muted = m;
  try { localStorage.setItem('red-battle-muted', m ? '1' : '0'); } catch { /* ignore */ }
  snd((a) => a.setMuted(m));
}

const dexOf = (side, entry) => {
  const s = entry.snap?.[side];
  return battle.sides[side].party[s ? s.idx : battle.sides[side].active].dex;
};

function playSounds(k) {
  for (const e of soundEvents(battle.log, k, dexOf, { animated: !!animData })) {
    setTimeout(() => snd((a) => (e.cry ? a.cry(e.cry, e.opts) : a.sfx(e.sfx, e.opts))), e.at * 1000);
  }
}

async function main() {
  data = await (await fetch('data.json')).json();
  fetch('audio.json').then((r) => r.json()).then((d) => { animData = d; })
    .catch((err) => console.warn('battle animations unavailable:', err));
  rerollTeam();
  renderRed();
  $('reroll').onclick = rerollTeam;
  $('event').onchange = rerollTeam;
  $('start').onclick = startBattle;
  $('newgame').onclick = () => { snd((a) => a.stopMusic()); $('battle').classList.add('hidden'); $('setup').classList.remove('hidden'); rerollTeam(); };
  $('speed').onclick = () => { speedIdx = (speedIdx + 1) % SPEEDS.length; $('speed').textContent = `TEXT: ${SPEEDS[speedIdx][0]}`; };
  const syncMute = () => { $('mute').textContent = `SOUND: ${muted ? 'OFF' : 'ON'}`; };
  syncMute();
  $('mute').onclick = () => { setMuted(!muted); syncMute(); };
  $('showai').onchange = () => $('ai').classList.toggle('hidden', !$('showai').checked);
  $('textbox').onclick = advance;
  document.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ' || ev.key === 'z') && !$('battle').classList.contains('hidden') && busy) {
      ev.preventDefault(); advance();
    }
  });
  document.querySelectorAll('#menu button').forEach((b) => { b.onclick = () => menu(b.dataset.act); });
}

// ---------- setup ----------
function typeBadges(types) {
  return `<span class="types">${types.map((t) => `<span class="type t-${t}">${t}</span>`).join('')}</span>`;
}

function teamRow(m) {
  const moves = m.moves.map((mv) => data.moves[mv.id].name).join(' · ');
  return `<li><span class="mini" data-dex="${m.dex}"></span><div><div class="t-name">${m.name} <small>L${m.level}</small>${typeBadges(m.types)}</div><div class="t-moves">${moves}</div></div></li>`;
}

function rerollTeam() {
  team = randomTeam(data, makeRng(Date.now() ^ (Math.random() * 1e9)), { includeEvent: $('event').checked });
  $('team').innerHTML = team.map(teamRow).join('');
  hydrateMinis($('team'));
}

function renderRed() {
  $('redteam').innerHTML = redTeam(data).map(teamRow).join('');
  hydrateMinis($('redteam'));
  const d = data.red.dvs;
  $('redinfo').textContent = `DVs ${d.atk}/${d.def}/${d.spe}/${d.spc} (Atk/Def/Spe/Spc) on every Pokémon · 2× FULL RESTORE · ROM offset ${data.red.romOffsets.RedGroup}`;
}

async function sprite(dex, back = false) {
  const key = `${back ? 'b' : 'f'}${dex}`;
  if (!spriteCache.has(key)) {
    spriteCache.set(key, new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img.src);
      img.onerror = () => resolve(null);
      img.src = `sprites/${back ? 'back/' : ''}${dex}.png`;
    }));
  }
  return spriteCache.get(key);
}

function hydrateMinis(root) {
  root.querySelectorAll('.mini').forEach(async (el) => {
    const src = await sprite(+el.dataset.dex);
    if (src) el.style.background = `url(${src}) center / contain no-repeat`;
  });
}

// ---------- battle ----------
function startBattle() {
  const clone = structuredClone(team);
  battle = new Battle(data, clone, { badges: $('badges').checked, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
  shown = 0;
  startAudio(); // the BATTLE RED click is the user gesture browsers need
  snd((a) => a.music('championBattle'));
  $('setup').classList.add('hidden');
  $('battle').classList.remove('hidden');
  hidePanels();
  renderMons(null);
  play();
}

function hidePanels() { ['menu', 'moves', 'party'].forEach((id) => $(id).classList.add('hidden')); }

async function renderSprite(el, mon, back) {
  el.classList.remove('faint');
  el.dataset.dex = mon.dex;
  const src = await sprite(mon.dex, back);
  if (el.dataset.dex !== String(mon.dex)) return;
  if (src) {
    // front pics are 5x5-7x7 tiles drawn bottom-centred in a 7x7 box; back pics are 6x6 stretched to fill
    const w = await new Promise((r) => { const im = new Image(); im.onload = () => r(im.naturalWidth); im.src = src; });
    el.style.backgroundSize = back ? 'contain' : `${(w / 56) * 100}%`;
    el.style.backgroundImage = `url(${src})`; el.innerHTML = ''; el.classList.remove('placeholder');
    el.classList.toggle('back', back);
  } else {
    el.style.backgroundImage = ''; el.innerHTML = `<span>${mon.name}</span>`; el.classList.add('placeholder');
    el.classList.remove('back');
  }
}

function setHp(el, hp, max) {
  const r = max ? hp / max : 0;
  el.style.width = `${Math.max(0, r * 100)}%`;
  el.style.backgroundColor = r > 0.5 ? 'var(--hp-hi)' : r > 0.2 ? 'var(--hp-mid)' : 'var(--hp-lo)';
}

// snap: [{idx,hp,maxHp,status}, ...] from the log line, or the live state when null
function renderMons(entry) {
  for (const i of [0, 1]) {
    const side = battle.sides[i];
    const s = entry?.snap?.[i];
    const mon = side.party[s ? s.idx : side.active];
    const p = i === 0 ? 'p' : 'e';
    const hp = s ? s.hp : mon.hp; const max = s ? s.maxHp : mon.maxHp; const status = s ? s.status : mon.status;
    const spriteEl = $(`${p}-sprite`);
    if (spriteEl.dataset.dex !== String(mon.dex)) renderSprite(spriteEl, mon, i === 0);
    $(`${p}-name`).textContent = mon.name;
    $(`${p}-lv`).textContent = `:L${mon.level}`;
    $(`${p}-status`).textContent = status ? STATUS_LABEL[status] : '';
    setHp($(`${p}-hp`), hp, max);
    if (i === 0) $('p-hpnum').textContent = `${hp}/ ${max}`;
    $(`${p}-balls`).innerHTML = side.party.map((m) => `<span class="ball ${m.hp > 0 ? '' : 'out'}"></span>`).join('');
    if (hp <= 0) spriteEl.classList.add('faint');
  }
  const w = entry ? entry.weather : battle.weather;
  $('weather').textContent = w ? WEATHER_LABEL[w] : '';
}

function typeText(text) {
  return new Promise((resolve) => {
    const delay = SPEEDS[speedIdx][1];
    const el = $('text');
    if (!delay) { el.textContent = text; resolve(); return; }
    let k = 0;
    el.textContent = '';
    typing = { finish: () => { clearInterval(t); el.textContent = text; typing = null; resolve(); } };
    const t = setInterval(() => {
      el.textContent = text.slice(0, ++k);
      if (k >= text.length) typing.finish();
    }, delay);
  });
}

let waiter = null;
function waitClick() {
  $('more').classList.remove('hidden');
  return new Promise((resolve) => { waiter = resolve; });
}

function advance() {
  if (typing) { typing.finish(); return; }
  if (waiter) { const w = waiter; waiter = null; $('more').classList.add('hidden'); w(); }
}


// ---------- attack visuals + sound ----------
const TYPE_COLOR = {
  NORMAL: '#e8e4d0', FIRE: '#ff7a1a', WATER: '#3a8cff', ELECTRIC: '#ffe629', GRASS: '#4fcf4a', ICE: '#9be8ff',
  FIGHTING: '#d6452f', POISON: '#b050d8', GROUND: '#d8b25a', FLYING: '#a8b8ff', PSYCHIC: '#ff5fa8', BUG: '#a8c820',
  ROCK: '#b8a050', GHOST: '#7a58b8', DRAGON: '#6a40ff', DARK: '#4a3a3a', STEEL: '#c0c8d8', CURSE: '#7a58b8',
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const animOn = () => SPEEDS[speedIdx][1] !== 0;

function center(el, field) {
  const a = el.getBoundingClientRect(); const f = field.getBoundingClientRect();
  return { x: a.left - f.left + a.width / 2, y: a.top - f.top + a.height / 2 };
}

// Crystal's animation script for a move/special: its sounds at their frames plus the BG
// effects as CSS (anims.js). INSTANT text speed caps it at 0.4 s, sounds only.
async function playAnim(key, attackerIsPlayer, dex) {
  if (!animData) return;
  const plan = planAnimation(animData, key, { attackerIsPlayer });
  const fast = !animOn();
  const endMs = Math.min(plan[plan.length - 1].frame / FRAME_HZ * 1000, fast ? 400 : Infinity);
  const timers = [];
  for (const e of plan) {
    const ms = e.frame / FRAME_HZ * 1000;
    if (ms > endMs) break;
    if (e.kind === 'sfx') timers.push(setTimeout(() => snd((a) => a.sfx(e.name, { pan: e.pan })), ms));
    else if (e.kind === 'cry') timers.push(setTimeout(() => snd((a) => a.cry(dex, { pitch: e.pitch, length: e.length, tracks: e.tracks })), ms));
    else if (e.kind === 'bg' && e.css && !fast) timers.push(setTimeout(() => bgEffect(e), ms));
  }
  await wait(endMs);
  timers.forEach(clearTimeout);
  clearEffects();
}

const FX_CLASSES = ['fx-invert', 'fx-invert-rapid', 'fx-white', 'fx-dark', 'fx-shake-x', 'fx-shake-y', 'fx-hide',
  'fx-lunge', 'fx-blink', 'fx-wobble', 'fx-enter', 'fx-return'];
const fxTimers = new Map();

function bgEffect(e) {
  const el = e.screen ? document.querySelector('.field') : $(e.mon === 'player' ? 'p-sprite' : 'e-sprite');
  if (e.css === 'fx-show') { el.classList.remove('fx-hide'); return; }
  el.classList.remove(e.css); void el.offsetWidth; el.classList.add(e.css);
  if (!e.ms) return;
  const key = el.id + e.css;
  clearTimeout(fxTimers.get(key));
  fxTimers.set(key, setTimeout(() => el.classList.remove(e.css), e.ms));
}

function clearEffects() {
  for (const el of [document.querySelector('.field'), $('p-sprite'), $('e-sprite')]) el.classList.remove(...FX_CLASSES);
}

// Log lines that run one of Crystal's special animations: [pattern, anim key]
const STATUS_ANIMS = [
  [/ is fast asleep!$/, 'slp'], [/ is frozen solid!$/, 'frz'], [/ is confused!$/, 'confused'],
  [/ is in love with the foe!$/, 'inLove'], [/ is fully paralyzed!$/, 'par'], [/ is hurt by poison!$/, 'psn'],
  [/ is hurt by its burn!$/, 'brn'], [/ is buffeted by the sandstorm!$/, 'inSandstorm'],
  [/ is hurt by WHIRLPOOL!$/, 'inWhirlpool'], [/ hurt itself in its confusion!$/, 'hitConfusion'],
];

// The animations a log line plays, before its sounds: [{key, attackerIsPlayer, dex}]
function lineAnims(k) {
  const entry = battle.log[k]; const prev = battle.log[k - 1]; const t = entry.text;
  const out = [];
  if (/^Go! |^RED sent out /.test(t)) {
    const side = t.startsWith('Go!') ? 0 : 1;
    out.push({ key: 'sendOutMon', attackerIsPlayer: side === 0 });
  } else if (/, come back!$|^RED withdrew /.test(t)) {
    out.push({ key: 'returnMon', attackerIsPlayer: !t.startsWith('RED') });
  }
  const hurt = [0, 1].filter((i) => prev?.snap && entry.snap && prev.snap[i].idx === entry.snap[i].idx
    && entry.snap[i].hp < prev.snap[i].hp);
  const status = STATUS_ANIMS.find(([re]) => re.test(t));
  if (status) {
    // the afflicted mon is the anim's user; the confusion self-hit line has no name tag
    const side = status[1] === 'hitConfusion' ? (hurt[0] ?? 0) : t.startsWith('Enemy ') ? 1 : 0;
    out.push({ key: status[1], attackerIsPlayer: side === 0 });
  } else {
    for (const i of hurt) out.push({ key: i === 1 ? 'enemyDamage' : 'playerDamage', attackerIsPlayer: i === 1 });
  }
  return out;
}

// Stand-in for the move's particle sprites (not ported): a projectile or aura in the type colour
async function playMoveFx(fx) {
  if (!animOn()) return;
  const field = document.querySelector('.field');
  const from = $(fx.side === 0 ? 'p-sprite' : 'e-sprite');
  const to = $(fx.side === 0 ? 'e-sprite' : 'p-sprite');
  const color = TYPE_COLOR[fx.type] || TYPE_COLOR.NORMAL;
  const dir = fx.side === 0 ? 'lunge-p' : 'lunge-e';
  if (fx.power > 0) {
    from.classList.remove('lunge-p', 'lunge-e'); void from.offsetWidth; from.classList.add(dir);
    const a = center(from, field); const b = center(to, field);
    const orb = document.createElement('div');
    orb.className = `orb orb-${fx.type.toLowerCase()}`;
    orb.style.cssText = `--c:${color};left:${a.x}px;top:${a.y}px;`;
    field.appendChild(orb);
    void orb.offsetWidth;
    orb.style.left = `${b.x}px`; orb.style.top = `${b.y}px`;
    await wait(380);
    orb.classList.add('burst');
    await wait(160);
    orb.remove();
    from.classList.remove(dir);
  } else {
    const a = center(from, field);
    const ring = document.createElement('div');
    ring.className = 'aura';
    ring.style.cssText = `--c:${color};left:${a.x}px;top:${a.y}px;`;
    field.appendChild(ring);
    await wait(500);
    ring.remove();
  }
}

// Decide the impact sound for a damage entry by peeking at the messages right after it.
function impactKind(idx) {
  for (let k = idx; k < Math.min(battle.log.length, idx + 3); k++) {
    const t = battle.log[k].text;
    if (/critical hit/i.test(t)) return 'crit';
    if (/super-effective/i.test(t)) return 'super';
    if (/not very effective/i.test(t)) return 'weak';
  }
  return 'normal';
}

function screenFlash(kind) {
  const field = document.querySelector('.field');
  field.classList.remove('shake', 'shake-hard'); void field.offsetWidth;
  field.classList.add(kind === 'super' || kind === 'crit' ? 'shake-hard' : 'shake');
}

async function play() {
  busy = true;
  hidePanels();
  while (shown < battle.log.length) {
    const entry = battle.log[shown++];
    const prev = battle.log[shown - 2];
    const k = shown - 1;
    if (entry.fx && !animData) await playMoveFx(entry.fx);
    renderMons(entry);
    if (prev?.snap && entry.snap && !animData) {
      for (const i of [0, 1]) {
        if (prev.snap[i].idx === entry.snap[i].idx && entry.snap[i].hp < prev.snap[i].hp) {
          const kind = impactKind(shown - 1);
          if (animOn()) screenFlash(kind);
          const el = $(i === 0 ? 'p-sprite' : 'e-sprite');
          el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
        }
      }
    }
    if (animData) {
      if (entry.fx) {
        await typeText(entry.text);
        await Promise.all([playMoveFx(entry.fx), playAnim(String(entry.fx.id), entry.fx.side === 0, dexOf(entry.fx.side, entry))]);
      }
      playSounds(k);
      if (!entry.fx) await Promise.all([typeText(entry.text), ...lineAnims(k).map((a) => playAnim(a.key, a.attackerIsPlayer))]);
    } else {
      playSounds(k);
      await typeText(entry.text);
    }
    if (SPEEDS[speedIdx][1] === 0 && shown < battle.log.length) continue;
    await waitClick();
  }
  renderMons(null);
  renderAi();
  busy = false;
  nextPrompt();
}

function renderAi() {
  const s = battle.lastAiScores;
  $('ai').textContent = s
    ? `RED's last move scores (lower = preferred, ties picked at random):\n${s.map((x) => `  ${x.move.padEnd(14)} ${x.score}`).join('\n')}`
    : "RED's AI scores appear after his first move.";
}

function nextPrompt() {
  if (battle.over) {
    if (!battle.musicDone) {
      battle.musicDone = true;
      snd((a) => (battle.winner === 0 ? a.music('gymVictory') : a.stopMusic()));
    }
    $('text').textContent = battle.winner === 0 ? 'You beat RED! Press NEW TEAM to go again.' : 'You are out of usable POKéMON! Press NEW TEAM to try again.';
    $('more').classList.add('hidden');
    return;
  }
  if (battle.pendingSwitch === 0) { showParty(true); return; }
  const locked = battle.lockedMove(0);
  if (locked) { battle.playTurn({ type: 'move', slot: -1 }); play(); return; }
  $('text').textContent = `What will ${battle.mon(0).name} do?`;
  $('more').classList.add('hidden');
  $('menu').classList.remove('hidden');
  $('menu').querySelector('button').focus();
}

async function say(text) {
  hidePanels();
  busy = true;
  await typeText(text);
  await waitClick();
  busy = false;
  nextPrompt();
}

function menu(act) {
  snd((a) => a.sfx('readText2', { force: true }));
  if (act === 'fight') return showMoves();
  if (act === 'pkmn') return showParty(false);
  if (act === 'pack') return say('There are no items in your PACK!');
  if (act === 'run') return say("No! There's no running from a trainer battle!");
}

function showMoves() {
  hidePanels();
  const mon = battle.mon(0); const v = battle.sides[0].vol;
  const box = $('moves');
  const noPP = mon.moves.every((mv) => mv.pp === 0 || (v.disable && v.disable.move === mv.id));
  box.innerHTML = mon.moves.map((mv, k) => {
    const d = data.moves[mv.id];
    const disabled = mv.pp === 0 || (v.disable && v.disable.move === mv.id) || (v.encore && v.encore.move !== mv.id);
    return `<button data-slot="${k}" ${disabled && !noPP ? 'disabled' : ''}>${d.name}<span class="meta">${d.type} · ${d.power || '—'} PWR · PP ${mv.pp}/${mv.maxPp}</span></button>`;
  }).join('') + '<button class="back-btn" data-slot="back">CANCEL</button>';
  box.classList.remove('hidden');
  box.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      snd((a) => a.sfx('readText2', { force: true }));
      if (b.dataset.slot === 'back') { nextPrompt(); return; }
      hidePanels();
      battle.playTurn({ type: 'move', slot: +b.dataset.slot });
      play();
    };
  });
  box.querySelector('button:not([disabled])')?.focus();
}

function showParty(forced) {
  hidePanels();
  const side = battle.sides[0];
  const trapped = !forced && !battle.canSwitch(0);
  $('text').textContent = forced ? 'Bring out which POKéMON?' : trapped ? "You can't switch out right now!" : 'Choose a POKéMON.';
  const box = $('party');
  box.innerHTML = side.party.map((m, k) => {
    const can = m.hp > 0 && k !== side.active && !trapped;
    return `<button data-k="${k}" ${can ? '' : 'disabled'}><span class="pline"><span>${m.name} :L${m.level}${m.status ? ` ${STATUS_LABEL[m.status]}` : ''}</span><span>${m.hp}/${m.maxHp}</span></span></button>`;
  }).join('') + (forced ? '' : '<button class="back-btn" data-k="back">CANCEL</button>');
  box.classList.remove('hidden');
  box.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      snd((a) => a.sfx('readText2', { force: true }));
      if (b.dataset.k === 'back') { nextPrompt(); return; }
      hidePanels();
      if (forced) battle.playerReplace(+b.dataset.k);
      else battle.playTurn({ type: 'switch', to: +b.dataset.k });
      play();
    };
  });
  box.querySelector('button:not([disabled])')?.focus();
}

main();
