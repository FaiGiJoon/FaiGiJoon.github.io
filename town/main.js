// Goldenrod City: the portfolio as a walkable town.
import { World, DIRS, COLL, wrapText, paginate, speech } from './engine.js';
import { Renderer, Page, SCREEN_H, timeOfDay } from './render.js';
import content from './content.js';

const STEP_FRAMES = 16; // NPCs' walking speed: one 16 px step per 16 frames
const WALK_FRAMES = 12; // the player walks a bit quicker than that
const RUN_FRAMES = 6; // and runs with Space held, or when walking to a click
const TURN_FRAMES = 4; // a tap turns the player without stepping
const NPC_PAUSE = [60, 180]; // frames between a wanderer's steps
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
const KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
  z: 'A', Z: 'A', Enter: 'A', ' ': 'A', x: 'B', X: 'B', Escape: 'B', Backspace: 'B',
};
const MUTE_KEY = 'goldenrod-muted';

const canvas = document.getElementById('screen');
const status = document.getElementById('status');

function storage(fn, fallback = null) {
  try { return fn(); } catch { return fallback; }
}

// ---------- input ----------
const held = new Set();
const pressed = new Set();
let lastDir = null;
let spaceHeld = false;
function press(btn) {
  if (!held.has(btn)) pressed.add(btn);
  held.add(btn);
  if (DIRS[btn]) lastDir = btn;
  startAudio();
}
function release(btn) {
  held.delete(btn);
  if (lastDir === btn) lastDir = [...held].reverse().find((b) => DIRS[b]) || null;
}
addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') { toggleMute(); return; }
  if (e.key === ' ') spaceHeld = true;
  const btn = KEYS[e.key];
  if (!btn) return;
  e.preventDefault();
  press(btn);
});
addEventListener('keyup', (e) => {
  if (e.key === ' ') spaceHeld = false;
  const btn = KEYS[e.key];
  if (btn) release(btn);
});
addEventListener('blur', () => { held.clear(); lastDir = null; spaceHeld = false; });
for (const el of document.querySelectorAll('[data-btn]')) {
  const btn = el.dataset.btn;
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); press(btn); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => release(btn));
}
// Tapping the screen works as A while text is up; while walking, click (or hold
// and drag) to walk there, or click someone to go and talk to them.
let dragging = false;
canvas.addEventListener('pointerdown', (e) => {
  if (ui.mode !== 'walk') { press('A'); return; }
  startAudio();
  canvas.setPointerCapture?.(e.pointerId);
  dragging = true;
  aim(e);
});
canvas.addEventListener('pointermove', (e) => { if (dragging && ui.mode === 'walk') aim(e); });
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { dragging = false; release('A'); });

function aim(e) {
  const r = canvas.getBoundingClientRect();
  const px = cam.x + ((e.clientX - r.left) * view.w) / r.width;
  const py = cam.y + ((e.clientY - r.top) * SCREEN_H) / r.height;
  // NPCs are drawn 4 px above their step, so hit-test their sprite first.
  const npc = world.npcs.find((n) => px >= n.x * 16 && px < n.x * 16 + 16 && py >= n.y * 16 - 4 && py < n.y * 16 + 12);
  walkTo = npc ? { npc } : { x: Math.floor(px / 16), y: Math.floor(py / 16) };
}

// ---------- audio (Crystal's sound engine from Battle Red) ----------
let audio = null;
let muted = storage(() => localStorage.getItem(MUTE_KEY) === '1', false);
const muteBtn = document.getElementById('mute');
function showMute() {
  muteBtn.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
  muteBtn.setAttribute('aria-pressed', String(!muted));
}
showMute();
async function startAudio() {
  if (audio) return;
  try {
    const { createGameAudio } = await import('../red-battle/gbsound.js');
    audio = createGameAudio({ audioUrl: new URL('../red-battle/audio.json', import.meta.url) });
    audio.setMuted(muted);
    audio.music(mapMusic());
  } catch (err) {
    console.warn('No sound:', err);
  }
}
function sfx(name) { audio?.sfx(name); }
function toggleMute() {
  muted = !muted;
  storage(() => localStorage.setItem(MUTE_KEY, muted ? '1' : '0'));
  audio?.setMuted(muted);
  showMute();
}
muteBtn.addEventListener('click', (e) => { e.currentTarget.blur(); startAudio(); toggleMute(); });

// ---------- state ----------
let data;
let world;
let view;
let trainers = {}; // red-battle/trainers.json: the Gym trainers' names and ROM dialogue
const maps = {}; // city / gym: { data, content, world }
let mapName = 'city';
const mapMusic = () => maps[mapName]?.content.music || 'goldenrodCity';
const player = { x: 0, y: 0, facing: 'down', sprite: 'CHRIS', palette: 0, step: 0, stepFrames: WALK_FRAMES, from: null, phase: 0, parity: 0, turn: 0 };
let ui = { mode: 'walk' };
let walkTo = null; // click-to-walk target: { x, y } or { npc }
let cam = { x: 0, y: 0 };
let bumpCooldown = 0;
let nameSign = 150;
// ?time=morn|day|nite previews another time of day; otherwise the visitor's clock decides.
const forcedTime = ['morn', 'day', 'nite'].find((t) => t === new URLSearchParams(location.search).get('time'));

function fit() {
  // Game Boy height (144 px), as wide as the window allows: 20 to 40 tiles, scaled by whole pixels.
  const coarse = matchMedia('(pointer: coarse)').matches;
  const stage = document.querySelector('.stage');
  const availW = stage.clientWidth - 32;
  const availH = stage.clientHeight - (coarse ? 210 : 40);
  const aspect = availW / Math.max(1, availH);
  view.resize(Math.max(20, Math.min(40, Math.floor((SCREEN_H * aspect) / 16) * 2)));
  const scale = Math.max(1, Math.floor(Math.min(availW / view.w, availH / SCREEN_H)));
  canvas.style.width = `${view.w * scale}px`;
  canvas.style.height = `${SCREEN_H * scale}px`;
  layout();
}

// ---------- text ----------
function say(text, then) {
  ui = { mode: 'dialog', raw: Array.isArray(text) ? text : [text], page: 0, shown: 0, then };
  layout();
}

// Wrap the open text box or page to the current screen width.
function layout() {
  // Pages keep their last column free for the ▼ arrow.
  const wrap = (paras, w) => paras.flatMap((t) => [...wrapText(t, w), '']);
  if (ui.mode === 'dialog') {
    ui.pages = paginate(wrap(ui.raw, view.cols - 2));
    ui.page = Math.min(ui.page, ui.pages.length - 1);
  } else if (ui.mode === 'page') {
    ui.lines = wrap(ui.raw, view.cols - 3);
    ui.title = ui.building.title.slice(0, view.cols - 2);
    ui.scroll = Math.min(ui.scroll, Math.max(0, ui.lines.length - Page.bodyRows(ui.links.length)));
  }
}
function ask(text, items, onPick) {
  say(text, () => { ui = { mode: 'menu', items, cursor: 0, onPick, text }; });
}
function closeUi() {
  for (const n of world.npcs) n.busy = false;
  ui = { mode: 'walk' };
}

function openHref(href) {
  const external = /^https?:/.test(href) || href.endsWith('.pdf');
  if (external) window.open(href, '_blank', 'noopener');
  else location.href = href;
}

// Move to another map (city <-> gym), keeping each map's NPCs where they were.
function enterMap(name, pos) {
  mapName = name;
  ({ data, world } = maps[name]);
  view.setData(data);
  Object.assign(player, { x: pos.x, y: pos.y, facing: pos.facing, from: null, step: 0 });
  walkTo = null;
  nameSign = name === 'city' ? 0 : 120;
  audio?.music(mapMusic());
}

function openBuilding(b, door) {
  if (!b) { closeUi(); return; }
  if (b.kind === 'map') {
    enterMap(b.map, content[b.map].start);
    ui = { mode: 'fade', t: 1, dir: -1, then: closeUi };
    return;
  }
  ui = { mode: 'page', raw: b.body, scroll: 0, links: b.links || [], cursor: 0, door, building: b };
  layout();
  if (b.kind === 'projects') loadProjects(ui);
}

async function loadProjects(page) {
  const KEY = 'goldenrod-repos';
  let repos = storage(() => JSON.parse(sessionStorage.getItem(KEY)));
  if (!repos) {
    try {
      const r = await fetch('https://api.github.com/users/FaiGiJoon/repos?sort=pushed&per_page=8');
      if (!r.ok) throw new Error(r.status);
      repos = (await r.json()).filter((x) => !x.fork).slice(0, 5)
        .map((x) => ({ name: x.name, description: x.description || '', url: x.html_url }));
      storage(() => sessionStorage.setItem(KEY, JSON.stringify(repos)));
    } catch {
      return; // keep the GitHub link
    }
  }
  if (ui !== page) return;
  // Repo names like "winbox-automator" read as words; anything the font lacks becomes a space.
  const clean = (s) => [...s].map((ch) => (view.font.has(ch) && ch !== '-' ? ch : ' ')).join('').replace(/ +/g, ' ').trim();
  page.raw = [...page.building.body, ...repos.flatMap((r) => [clean(r.name).toUpperCase(), clean(r.description)].filter(Boolean))];
  layout();
  page.links = [...repos.slice(0, 3).map((r) => ({ label: clean(r.name).toUpperCase(), href: r.url })), ...page.building.links];
}

function exitBuilding(door) {
  sfx('exitBuilding');
  ui = { mode: 'fade', t: 1, dir: -1, then: closeUi };
  if (door) {
    player.x = door.x;
    player.y = door.y + 1;
    player.facing = 'down';
  }
}

// ---------- update ----------
function updateWalk() {
  for (const n of world.npcs) {
    if (n.anim > 0) n.anim--;
    else if (!n.busy && (n.radiusX || n.radiusY)) {
      n.wait = (n.wait ?? rand(NPC_PAUSE)) - 1;
      if (n.wait <= 0) {
        n.wait = rand(NPC_PAUSE);
        // The tile the player is leaving is still taken until the step ends.
        world.stepNpc(n, { x: player.x, y: player.y, toX: player.from?.x, toY: player.from?.y });
        if (n.moved) { n.moved = false; n.anim = STEP_FRAMES; n.phase ^= 2; }
      }
    }
  }

  if (player.step > 0) {
    player.step--;
    if (player.step === 0) {
      player.from = null;
      const b = world.buildingAt(player.x, player.y);
      if (world.collisionAt(player.x, player.y) === COLL.DOOR) {
        walkTo = null;
        sfx('enterDoor');
        const door = { x: player.x, y: player.y };
        ui = { mode: 'fade', t: 0, dir: 1, then: () => openBuilding(b, door) };
        return;
      }
    }
    if (player.step > 0) return;
  }

  if (pressed.has('A') && interact()) return;

  const dir = lastDir;
  if (dir) walkTo = null; // the keys take over from a click
  else if (walkTo) { followClick(); return; }
  if (!dir) { player.turn = 0; return; }
  if (player.facing !== dir) {
    player.facing = dir;
    player.turn = TURN_FRAMES;
    return;
  }
  if (player.turn > 0) { player.turn--; return; }
  walk(dir, spaceHeld ? RUN_FRAMES : WALK_FRAMES);
}

// Talk to whoever or whatever the player is facing.
function interact() {
  const t = world.facing(player, player.facing);
  if (t?.type === 'npc') {
    t.npc.facing = OPPOSITE[player.facing];
    t.npc.busy = true;
    if (t.npc.trainer) challenge(t.npc.trainer);
    else say(t.npc.text);
    return true;
  }
  if (t?.type === 'sign') { say(t.sign.text); return true; }
  return false;
}

// One running step along the shortest path to the clicked spot. Clicking an NPC
// or a sign walks up to it and talks; clicking an exit mat walks out.
function followClick() {
  const tx = walkTo.npc ? walkTo.npc.x : walkTo.x;
  const ty = walkTo.npc ? walkTo.npc.y : walkTo.y;
  const talk = walkTo.npc || world.signAt(tx, ty);
  const goals = talk ? Object.values(DIRS).map(([dx, dy]) => ({ x: tx + dx, y: ty + dy })) : [{ x: tx, y: ty }];
  const next = world.firstStep(player, goals);
  if (next?.dir) {
    player.facing = next.dir;
    walk(next.dir, RUN_FRAMES);
    return;
  }
  walkTo = null;
  if (!next) return;
  if (talk) {
    player.facing = Object.keys(DIRS).find((d) => DIRS[d][0] === tx - player.x && DIRS[d][1] === ty - player.y);
    interact();
  } else if (world.collisionAt(player.x, player.y) === COLL.WARP_DOWN) {
    player.facing = 'down';
    walk('down', RUN_FRAMES);
  }
}

function walk(dir, frames) {
  const r = world.tryStep(player, dir);
  if (r.kind === 'exit') {
    sfx('exitBuilding');
    ui = { mode: 'fade', t: 0, dir: 1, then: () => {
      enterMap('city', maps[mapName].content.exit);
      ui = { mode: 'fade', t: 1, dir: -1, then: closeUi };
    } };
    return;
  }
  if (r.kind === 'blocked') {
    if (bumpCooldown <= 0) { sfx('bump'); bumpCooldown = STEP_FRAMES * 2; }
    return;
  }
  player.from = { x: player.x, y: player.y };
  player.x = r.x;
  player.y = r.y;
  player.step = player.stepFrames = frames;
  player.parity ^= 1;
}

// A Gym trainer: their ROM intro, then YES/NO to battle them in Battle RED.
function challenge(key) {
  const t = trainers[key];
  if (!t) { say('...'); return; }
  const title = `${t.className} ${t.name}`;
  say(speech(t.text.before), () => ask([`Battle ${title}?`], ['YES', 'NO'], (i) => {
    if (i === 0) location.href = `${maps[mapName].content.battleHref}${key}`;
  }));
}

function rand([lo, hi]) { return lo + Math.floor(Math.random() * (hi - lo)); }

function updateUi() {
  if (ui.mode === 'dialog') {
    const page = ui.pages[ui.page] || [];
    const total = page.reduce((s, l) => s + l.length, 0);
    if (ui.shown < total) {
      ui.shown += held.has('A') || held.has('B') ? 4 : 1;
      return;
    }
    if (pressed.has('A') || pressed.has('B')) {
      sfx('readText2');
      if (ui.page + 1 < ui.pages.length) { ui.page++; ui.shown = 0; return; }
      const then = ui.then;
      closeUi();
      then?.();
    }
  } else if (ui.mode === 'menu') {
    if (pressed.has('up')) ui.cursor = (ui.cursor + ui.items.length - 1) % ui.items.length;
    if (pressed.has('down')) ui.cursor = (ui.cursor + 1) % ui.items.length;
    if (pressed.has('A')) { sfx('readText2'); const { onPick, cursor } = ui; closeUi(); onPick(cursor); }
    else if (pressed.has('B')) { const { onPick, items } = ui; closeUi(); onPick(items.length - 1); }
  } else if (ui.mode === 'page') {
    const rows = Page.bodyRows(ui.links.length);
    const maxScroll = Math.max(0, ui.lines.length - rows);
    if (pressed.has('down') || (pressed.has('A') && ui.scroll < maxScroll && !ui.links.length)) {
      if (ui.scroll < maxScroll) ui.scroll = Math.min(maxScroll, ui.scroll + (pressed.has('A') ? rows - 1 : 1));
      else if (ui.links.length) ui.cursor = (ui.cursor + 1) % ui.links.length;
    } else if (pressed.has('up')) {
      if (ui.links.length && ui.scroll >= maxScroll && ui.cursor > 0) ui.cursor--;
      else ui.scroll = Math.max(0, ui.scroll - 1);
    } else if (pressed.has('A')) {
      sfx('readText2');
      if (ui.links.length) openHref(ui.links[ui.cursor].href);
      else exitBuilding(ui.door);
    } else if (pressed.has('B')) {
      exitBuilding(ui.door);
    }
  } else if (ui.mode === 'fade') {
    ui.t += ui.dir / 12;
    if (ui.t >= 1 || ui.t <= 0) { const then = ui.then; ui.t = Math.max(0, Math.min(1, ui.t)); then(); }
  }
}

// ---------- draw ----------
function actorPos(a, frames, total = STEP_FRAMES) {
  if (!a.from || !frames) return { px: a.x * 16, py: a.y * 16 };
  const k = frames / total;
  return { px: (a.x - (a.x - a.from.x) * k) * 16, py: (a.y - (a.y - a.from.y) * k) * 16 };
}

function draw() {
  view.setTime(forcedTime || timeOfDay(new Date().getHours()));
  if (ui.mode === 'page') {
    view.page({ ...ui, arrowDown: ui.scroll < ui.lines.length - Page.bodyRows(ui.links.length) });
    renderStatus();
    return;
  }
  const p = actorPos(player, player.step, player.stepFrames);
  const half = player.step > player.stepFrames / 2;
  const phase = player.step ? (half ? 1 + 2 * player.parity : 0) : 0;
  const actors = [
    { ...p, facing: player.facing, phase, sprite: player.sprite, palette: player.palette },
    ...world.npcs.map((n) => {
      const from = n.anim ? { x: n.fromX, y: n.fromY } : null;
      const q = actorPos({ x: n.x, y: n.y, from }, n.anim);
      const ph = n.anim > STEP_FRAMES / 2 ? 1 + (n.phase & 2) : 0;
      return { ...q, facing: n.facing, phase: ph, sprite: n.sprite, palette: n.palette };
    }),
  ];
  // Camera: the player sits at screen (W/2 - 16, 64) like the GB's 10x9 view.
  cam = { x: p.px - (view.w / 2 - 16), y: p.py - 64 };
  view.drawWorld(cam.x, cam.y, actors);
  if (nameSign > 0 && ui.mode === 'walk') view.mapName(maps[mapName].content.title);
  if (ui.mode === 'dialog') {
    const page = ui.pages[ui.page] || [];
    const total = page.reduce((s, l) => s + l.length, 0);
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    view.dialog(page, { shown: ui.shown, arrow: ui.shown >= total && blink && ui.page + 1 < ui.pages.length });
  } else if (ui.mode === 'menu') {
    view.dialog(wrapText(ui.text.at(-1), view.cols - 2).slice(-2));
    view.menu(ui.items, ui.cursor);
  } else if (ui.mode === 'fade') {
    view.fade(ui.t);
  }
  renderStatus();
}

let lastStatus = '';
function renderStatus() {
  // A plain-text copy of what is on screen for screen readers.
  let s = '';
  if (ui.mode === 'dialog') s = (ui.pages[ui.page] || []).join(' ');
  else if (ui.mode === 'page') s = `${ui.title}. ${ui.lines.join(' ')}`;
  else if (ui.mode === 'menu') s = ui.items.join(', ');
  if (s !== lastStatus) { status.textContent = s; lastStatus = s; }
}

// ---------- loop ----------
let acc = 0;
let last = performance.now();
function frame(now) {
  acc += Math.min(100, now - last);
  last = now;
  while (acc >= 1000 / 60) {
    acc -= 1000 / 60;
    if (bumpCooldown > 0) bumpCooldown--;
    if (nameSign > 0) nameSign--;
    if (ui.mode === 'walk') updateWalk();
    else updateUi();
    pressed.clear();
  }
  draw();
  requestAnimationFrame(frame);
}

async function boot() {
  const load = async (path) => (await fetch(new URL(path, import.meta.url))).json();
  const [city, gym, fanClub] = await Promise.all([
    load('./data/goldenrod.json'), load('./data/goldenrod-gym.json'), load('./data/fan-club.json')]);
  trainers = await load('../red-battle/trainers.json').catch(() => ({}));
  maps.city = { data: city, content, world: new World(city, content) };
  maps.gym = { data: gym, content: content.gym, world: new World(gym, content.gym) };
  maps.fanClub = { data: fanClub, content: content.fanClub, world: new World(fanClub, content.fanClub) };
  ({ data, world } = maps.city);
  view = new Renderer(canvas, data);
  fit();
  addEventListener('resize', fit);
  // ?at=gym|fanClub: back from a battle, the player is standing in that room again.
  const at = new URLSearchParams(location.search).get('at');
  if (at === 'gym' || at === 'fanClub') {
    enterMap(at, content[at].start);
  } else {
    Object.assign(player, { x: content.start.x, y: content.start.y, facing: content.start.facing });
    say(content.intro);
  }
  document.body.classList.add('ready');
  // ?debug exposes the live state for automated checks.
  if (new URLSearchParams(location.search).has('debug')) {
    window.__town = { player, get world() { return world; }, get ui() { return ui; }, get view() { return view; }, get map() { return mapName; } };
  }
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
  document.body.classList.add('failed');
});
