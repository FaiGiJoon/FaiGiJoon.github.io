import { Battle, makeRng, randomTeam, trainerTeam, TRAINER_KEYS } from './engine.js';
import { createGameAudio } from './gbsound.js';
import { soundEvents, hurtSides, hitSfx, moveMissed, HIT_LEAD } from './battle-audio.js';
import { BattleAnimPlayer, FRAME_HZ } from './anims.js';
import { createAnimCanvas, objPalettes, drawObjects, clearCanvas, picTiles } from './animdraw.js';

const $ = (id) => document.getElementById(id);
const STATUS_LABEL = { PAR: 'PAR', SLP: 'SLP', PSN: 'PSN', TOX: 'PSN', BRN: 'BRN', FRZ: 'FRZ' };
const WEATHER_LABEL = { RAIN: '☂ RAIN', SUN: '☀ SUN', SANDSTORM: '≋ SANDSTORM' };
const SPEEDS = [['NORMAL', 22], ['FAST', 8], ['INSTANT', 0]];

let data; let foe; let team; let battle; let shown = 0; let speedIdx = 0; let typing = null; let busy = false;
const spriteCache = new Map();
// Which Gym trainer to fight: ?vs=will|koga|bruno|karen|lance|red (default RED).
const VS = TRAINER_KEYS.find((k) => k === new URLSearchParams(location.search).get('vs')) || 'red';
const ITEM_NAMES = { 14: 'FULL RESTORE', 15: 'MAX POTION', 38: 'FULL HEAL' };

// ---------- audio (Crystal's sound engine, see gbsound.js) ----------
let audio = null;
let gen = 0; // battle generation: timers and play loops from an abandoned battle check it and stop
const timers = new Set();
let animData = null; // audio.json: animation scripts (loaded on the silent setup screen, played in battle)
let objData = null; // animobj.json: animation object graphics, framesets and palettes
let animCanvas = null;
const liveAnims = new Set(); // {objects, pals} of the animations running now
const picCache = new Map();
let muted = false;
try { muted = localStorage.getItem('red-battle-muted') === '1'; } catch { /* storage unavailable */ }

// Audio must never break the game: failures are logged and the battle carries on silently.
function snd(fn) {
  if (!audio) return;
  try { fn(audio); } catch (err) { console.warn('audio:', err); }
}

// setTimeout that is dropped when the battle is abandoned
function later(ms, fn) {
  const g = gen;
  const t = setTimeout(() => { timers.delete(t); if (g === gen) fn(); }, ms);
  timers.add(t);
  return t;
}

// iOS routes Web Audio through the ringer channel, so the silent switch mutes the whole game.
// Declaring media playback (iOS 17+) or playing a looping silent <audio> track (older iOS)
// moves it to the media channel, like a video. Call from the user gesture.
let mediaKeepAlive = null;
function claimMediaPlayback() {
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* unsupported */ }
  if (!mediaKeepAlive) {
    const n = 800; // 0.1 s of 8 kHz 8-bit mono silence
    const wav = new DataView(new ArrayBuffer(44 + n));
    [...'RIFF'].forEach((c, i) => wav.setUint8(i, c.charCodeAt(0)));
    wav.setUint32(4, 36 + n, true);
    [...'WAVEfmt '].forEach((c, i) => wav.setUint8(8 + i, c.charCodeAt(0)));
    [16, 0x10001, 8000, 8000, 0x80001].forEach((v, i) => wav.setUint32(16 + i * 4, v, true));
    [...'data'].forEach((c, i) => wav.setUint8(36 + i, c.charCodeAt(0)));
    wav.setUint32(40, n, true);
    for (let i = 0; i < n; i++) wav.setUint8(44 + i, 128);
    mediaKeepAlive = new Audio(URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })));
    mediaKeepAlive.loop = true;
    mediaKeepAlive.setAttribute('playsinline', '');
  }
  mediaKeepAlive.play()?.catch(() => {});
}

function startAudio() {
  claimMediaPlayback();
  try {
    if (!audio) {
      audio = createGameAudio(animData ? { audioData: animData } : undefined);
      audio.ready.catch((err) => { console.warn('audio unavailable:', err); audio = null; });
    } else if (audio.ctx.state === 'suspended') audio.ctx.resume();
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
    later(e.at * 1000, () => snd((a) => (e.cry ? a.cry(e.cry, e.opts) : a.sfx(e.sfx, e.opts))));
  }
}

async function main() {
  data = await (await fetch('data.json')).json();
  foe = data.trainers?.[VS] || data.red;
  fetch('audio.json').then((r) => r.json()).then((d) => { animData = d; })
    .catch((err) => console.warn('battle animations unavailable:', err));
  fetch('animobj.json').then((r) => r.json()).then((d) => { objData = d; })
    .catch((err) => console.warn('battle animation sprites unavailable:', err));
  animCanvas = createAnimCanvas(document.querySelector('.field'));
  rerollTeam();
  renderFoe();
  $('reroll').onclick = rerollTeam;
  $('event').onchange = rerollTeam;
  $('start').onclick = startBattle;
  $('newgame').onclick = newTeam;
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

function newTeam() {
  gen++;
  timers.forEach(clearTimeout); timers.clear();
  fxTimers.forEach(clearTimeout); fxTimers.clear();
  waiter = null; typing?.finish();
  clearEffects(true);
  liveAnims.clear();
  if (animCanvas) clearCanvas(animCanvas);
  snd((a) => { a.stopMusic(); a.ctx.suspend().catch(() => {}); });
  mediaKeepAlive?.pause();
  $('battle').classList.add('hidden'); $('setup').classList.remove('hidden');
  rerollTeam();
}

// ---------- setup ----------
function typeBadges(types) {
  return `<span class="types">${types.map((t) => `<span class="type t-${t}">${t}</span>`).join('')}</span>`;
}

function teamRow(m) {
  const moves = m.moves.map((mv) => data.moves[mv.id].name).join(' · ');
  return `<li><span class="mini" data-dex="${m.dex}"></span><div><div class="t-name">${m.name} <small>Lv${m.level}</small>${typeBadges(m.types)}</div><div class="t-moves">${moves}</div></div></li>`;
}

function rerollTeam() {
  team = randomTeam(data, makeRng(Date.now() ^ (Math.random() * 1e9)), { includeEvent: $('event').checked });
  $('team').innerHTML = team.map(teamRow).join('');
  hydrateMinis($('team'));
}

function renderFoe() {
  const title = `${foe.className} ${foe.name}`;
  document.title = `${title} — Goldenrod Gym`;
  $('foetitle').textContent = title;
  $('foeh1').textContent = `Battle ${foe.name[0]}${foe.name.slice(1).toLowerCase()}`;
  $('foepic').src = `sprites/${VS}.png`;
  $('foepic').alt = title;
  $('foeinline').textContent = foe.name;
  $('start').textContent = `BATTLE ${foe.name} ▶`;
  $('foeai').textContent = `SHOW ${foe.name}'S AI`;
  $('foesub').textContent = `Goldenrod Gym · Pokémon Crystal · ${title} · data read from the ROM`;
  $('redteam').innerHTML = trainerTeam(data, foe).map(teamRow).join('');
  hydrateMinis($('redteam'));
  const d = foe.dvs;
  const counts = {};
  for (const it of foe.items.filter(Boolean)) counts[it] = (counts[it] || 0) + 1;
  const items = Object.entries(counts).map(([it, n]) => `${n}× ${ITEM_NAMES[it] || `item ${it}`}`).join(', ');
  const group = Object.keys(foe.romOffsets).find((k) => k.endsWith('Group'));
  $('redinfo').textContent = `DVs ${d.atk}/${d.def}/${d.spe}/${d.spc} (Atk/Def/Spe/Spc) on every Pokémon · ${items || 'no items'} · ROM offset ${foe.romOffsets[group]}`;
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
  gen++;
  const clone = structuredClone(team);
  battle = new Battle(data, clone, { trainer: VS, badges: $('badges').checked, seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
  shown = 0;
  startAudio(); // the BATTLE click is the user gesture browsers need
  snd((a) => a.music(foe.music || 'championBattle'));
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
    el.style.backgroundImage = `url(${src})`; el.innerHTML = ''; el.classList.remove('placeholder', ...KEEP_FX);
    el.classList.toggle('back', back);
  } else {
    el.style.backgroundImage = ''; el.innerHTML = `<span>${mon.name}</span>`; el.classList.add('placeholder');
    el.classList.remove(...KEEP_FX);
    el.classList.remove('back');
  }
}

function setHp(el, hp, max) {
  const r = max ? hp / max : 0;
  el.style.width = `${Math.max(0, r * 100)}%`;
  el.style.backgroundColor = r > 0.5 ? 'var(--hp-hi)' : r > 0.2 ? 'var(--hp-mid)' : 'var(--hp-lo)';
}

// snap: [{idx,hp,maxHp,status}, ...] from the log line, or the live state when null.
// keepAlive: leave the fainted mon on screen (its damage animation is still to play).
function renderMons(entry, keepAlive = false) {
  for (const i of [0, 1]) {
    const side = battle.sides[i];
    const s = entry?.snap?.[i];
    const mon = side.party[s ? s.idx : side.active];
    const p = i === 0 ? 'p' : 'e';
    const hp = s ? s.hp : mon.hp; const max = s ? s.maxHp : mon.maxHp; const status = s ? s.status : mon.status;
    const spriteEl = $(`${p}-sprite`);
    if (spriteEl.dataset.dex !== String(mon.dex)) renderSprite(spriteEl, mon, i === 0);
    else spriteEl.classList.remove(...KEEP_FX);
    $(`${p}-name`).textContent = mon.name;
    $(`${p}-lv`).textContent = `Lv${mon.level}`;
    $(`${p}-status`).textContent = status ? STATUS_LABEL[status] : '';
    setHp($(`${p}-hp`), hp, max);
    if (i === 0) $('p-hpnum').textContent = `${hp}/ ${max}`;
    $(`${p}-balls`).innerHTML = side.party.map((m) => `<span class="ball ${m.hp > 0 ? '' : 'out'}"></span>`).join('');
    if (hp <= 0 && !keepAlive) spriteEl.classList.add('faint');
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
// Runs a Crystal animation script in real time (59.7275 frames/s): its sounds, its BG effects as
// CSS and its objects (animobj.js) drawn on the canvas over the field. INSTANT text speed caps it
// at 0.4 s, sounds only.
async function playAnim(key, attackerIsPlayer, dex) {
  if (!animData) return;
  const fast = !animOn();
  const moveId = /^\d+$/.test(key) ? +key : 0;
  const p = new BattleAnimPlayer(animData, key, { attackerIsPlayer, objData: fast ? null : objData, moveId });
  const g = gen;
  let layer = null;
  if (p.objects) {
    const enemy = $('e-sprite').dataset.dex; const player = $('p-sprite').dataset.dex;
    p.objects.pics = { enemy: await pic(enemy, false), player: await pic(player, true) };
    layer = { objects: p.objects, pals: objPalettes(objData, enemy, player) };
    liveAnims.add(layer);
  }
  const maxFrames = fast ? Math.round(0.4 * FRAME_HZ) : Infinity;
  await new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (g !== gen) { resolve(); return; }
      const due = Math.min(maxFrames, Math.floor((performance.now() - t0) * FRAME_HZ / 1000) + 1);
      while (p.frame < due && !p.done) for (const e of p.step()) animEvent(e, dex, fast);
      if (layer) drawObjects(animCanvas, [...liveAnims]);
      if (p.done || p.frame >= maxFrames) { resolve(); return; }
      if (document.hidden) setTimeout(tick, 50); else requestAnimationFrame(tick);
    };
    tick();
  });
  if (layer) {
    liveAnims.delete(layer);
    if (liveAnims.size) drawObjects(animCanvas, [...liveAnims]); else clearCanvas(animCanvas);
  }
  if (g !== gen) return;
  clearEffects();
}

function animEvent(e, dex, fast) {
  if (e.kind === 'sfx') snd((a) => a.sfx(e.name, { pan: e.pan }));
  else if (e.kind === 'cry') snd((a) => a.cry(dex, { pitch: e.pitch, length: e.length, tracks: e.tracks }));
  else if (e.kind === 'bg' && e.css && !fast) bgEffect(e);
}

// A mon pic as 2bpp tiles, for the animations that copy part of a mon (anim_battlergfx_*)
async function pic(dex, back) {
  const key = `${back ? 'b' : 'f'}${dex}`;
  if (!picCache.has(key)) {
    picCache.set(key, (async () => {
      const src = await sprite(+dex, back);
      if (!src) return null;
      const im = new Image();
      im.src = src;
      await im.decode();
      return picTiles(im, !back);
    })().catch(() => null));
  }
  return picCache.get(key);
}

const FX_CLASSES = ['fx-invert', 'fx-invert-rapid', 'fx-white', 'fx-dark', 'fx-shake-x', 'fx-shake-y',
  'fx-lunge', 'fx-blink', 'fx-wobble', 'fx-enter'];
// A withdrawn (RETURN_MON) or hidden (HIDE_MON) mon stays off screen until SHOW_MON or the next renderMons
const KEEP_FX = ['fx-hide', 'fx-return'];
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

function clearEffects(all = false) {
  for (const el of [document.querySelector('.field'), $('p-sprite'), $('e-sprite')]) {
    el.classList.remove(...FX_CLASSES, ...(all ? KEEP_FX : []));
  }
}

// Log lines that run one of Crystal's special animations: [pattern, anim key]
const STATUS_ANIMS = [
  [/ is fast asleep!$/, 'slp'], [/ is frozen solid!$/, 'frz'], [/ is confused!$/, 'confused'],
  [/ is in love with the foe!$/, 'inLove'], [/ is fully paralyzed!$/, 'par'], [/ is hurt by poison!$/, 'psn'],
  [/ is hurt by its burn!$/, 'brn'], [/ is buffeted by the sandstorm!$/, 'inSandstorm'],
  [/ is hurt by WHIRLPOOL!$/, 'inWhirlpool'], [/ hurt itself in its confusion!$/, 'hitConfusion'],
];

// The animations a non-move log line plays alongside its text: [{key, attackerIsPlayer}]
function lineAnims(k, hurt) {
  const t = battle.log[k].text;
  const out = [];
  if (/^Go! | sent out /.test(t)) {
    const side = t.startsWith('Go!') ? 0 : 1;
    out.push({ key: 'sendOutMon', attackerIsPlayer: side === 0 });
  } else if (/, come back!$| withdrew /.test(t)) {
    out.push({ key: 'returnMon', attackerIsPlayer: t.endsWith('come back!') });
  }
  const status = statusAnim(t);
  if (status) {
    // the afflicted mon is the anim's user; the confusion self-hit line has no name tag
    const side = status === 'hitConfusion' ? (hurt[0] ?? 0) : t.startsWith('Enemy ') ? 1 : 0;
    out.push({ key: status, attackerIsPlayer: side === 0 });
  }
  return out;
}

const statusAnim = (t) => STATUS_ANIMS.find(([re]) => re.test(t))?.[1];

// Fallback when audio.json (the animation scripts) failed to load: a projectile or aura in the type colour
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

// How hard the screen shakes for the hit whose HP drop is on log[idx] (see hitSfx)
function impactKind(idx) {
  if (/^A critical hit!$/.test(battle.log[idx].text)) return 'crit';
  return { superEffective: 'super', notVeryEffective: 'weak' }[hitSfx(battle.log, idx)] || 'normal';
}

function screenFlash(kind) {
  const field = document.querySelector('.field');
  field.classList.remove('shake', 'shake-hard'); void field.offsetWidth;
  field.classList.add(kind === 'super' || kind === 'crit' ? 'shake-hard' : 'shake');
}

async function play() {
  const g = gen;
  busy = true;
  hidePanels();
  while (shown < battle.log.length) {
    const k = shown++;
    const entry = battle.log[k];
    const hurt = hurtSides(battle.log, k);
    // a hit with no text of its own lands on this line: show it (damage anim + hit sound) before the line
    const hitFirst = hurt.length > 0 && !statusAnim(entry.text);
    renderMons(entry, hitFirst);
    playSounds(k);
    if (hitFirst) {
      if (animData) {
        await Promise.all([wait(HIT_LEAD * 1000),
          ...hurt.map((i) => playAnim(i === 1 ? 'enemyDamage' : 'playerDamage', i === 1))]);
      } else {
        if (animOn()) screenFlash(impactKind(k));
        for (const i of hurt) {
          const el = $(i === 0 ? 'p-sprite' : 'e-sprite');
          el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
        }
        await wait(HIT_LEAD * 1000);
      }
      if (g !== gen) return;
      renderMons(entry);
    }
    const missed = moveMissed(battle.log, k);
    if (entry.fx && animData) {
      await typeText(entry.text);
      if (g !== gen) return;
      if (!missed) await playAnim(String(entry.fx.id), entry.fx.side === 0, dexOf(entry.fx.side, entry));
    } else if (entry.fx) {
      if (!missed) await playMoveFx(entry.fx);
      if (g !== gen) return;
      await typeText(entry.text);
    } else if (animData) {
      await Promise.all([typeText(entry.text), ...lineAnims(k, hurt).map((a) => playAnim(a.key, a.attackerIsPlayer))]);
    } else {
      await typeText(entry.text);
    }
    if (g !== gen) return;
    if (SPEEDS[speedIdx][1] === 0 && shown < battle.log.length) continue;
    await waitClick();
    if (g !== gen) return;
  }
  renderMons(null);
  renderAi();
  busy = false;
  nextPrompt();
}

function renderAi() {
  const s = battle.lastAiScores;
  $('ai').textContent = s
    ? `${foe.name}'s last move scores (lower = preferred, ties picked at random):\n${s.map((x) => `  ${x.move.padEnd(14)} ${x.score}`).join('\n')}`
    : `${foe.name}'s AI scores appear after the first move.`;
}

function nextPrompt() {
  if (battle.over) {
    if (!battle.musicDone) {
      battle.musicDone = true;
      snd((a) => (battle.winner === 0 ? a.music('gymVictory') : a.stopMusic()));
    }
    $('text').textContent = battle.winner === 0 ? `You beat ${foe.name}! Press NEW TEAM to go again.` : 'You are out of usable POKéMON! Press NEW TEAM to try again.';
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
    return `<button data-k="${k}" ${can ? '' : 'disabled'}><span class="pline"><span>${m.name} Lv${m.level}${m.status ? ` ${STATUS_LABEL[m.status]}` : ''}</span><span>${m.hp}/${m.maxHp}</span></span></button>`;
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
