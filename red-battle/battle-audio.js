// Which Crystal sounds a battle log line triggers (engine/battle/core.asm order).
// Pure: returns [{at: seconds, sfx?: name, cry?: dex, opts?}] for app.js to schedule.

// The engine snapshots HP when a line is emitted, so a hit with no text of its own shows up
// as an HP drop on whichever line comes next. The hit (sound + damage anim) goes first and
// the line's own sounds follow HIT_LEAD seconds later, as PlayHitSound precedes them in-game.
export const HIT_LEAD = 0.5;

// Sides whose active mon lost HP between log[k - 1] and log[k]
export function hurtSides(log, k) {
  const a = log[k - 1]?.snap; const b = log[k]?.snap;
  if (!a || !b) return [];
  return [0, 1].filter((i) => a[i].idx === b[i].idx && b[i].hp < a[i].hp);
}

// dexOf(side, entry) -> species of that side's active mon at that log line.
// animated: the sendOutMon/returnMon animations play the ball poof themselves.
export function soundEvents(log, k, dexOf, { animated = false } = {}) {
  const entry = log[k];
  const text = entry.text;
  const ev = [];
  if (/^Go! /.test(text) || / sent out /.test(text)) {
    const side = text.startsWith('Go!') ? 0 : 1;
    if (!animated) ev.push({ at: 0, sfx: 'ballPoof', opts: { force: true } });
    ev.push({ at: animated ? 0.65 : 0.45, cry: dexOf(side, entry), opts: { tracks: side ? 'right' : 'left' } });
  } else if (/^Enemy .* fainted!$/.test(text)) {
    // FaintEnemyPokemon: SFX_KINESIS, the slide-down, then SFX_FAINT
    ev.push({ at: 0, sfx: 'SFX_KINESIS', opts: { force: true } });
    ev.push({ at: 0.35, sfx: 'faint', opts: { force: true } });
  } else if (/ fainted!$/.test(text)) {
    // FaintYourPokemon: the player's mon cries as it faints
    ev.push({ at: 0, cry: dexOf(0, entry), opts: { tracks: 'left' } });
  } else if (/ used (FULL RESTORE|MAX POTION|HYPER POTION|FULL HEAL) on /.test(text)) {
    ev.push({ at: 0, sfx: 'fullHeal', opts: { force: true } });
  } else if (!animated && (/, come back!$/.test(text) || / withdrew /.test(text))) {
    ev.push({ at: 0, sfx: 'switchPokemon', opts: { force: true } });
  }
  if (!hurtSides(log, k).length) return ev;
  return [{ at: 0, sfx: hitSfx(log, k), opts: { force: true } }, ...ev.map((e) => ({ ...e, at: e.at + HIT_LEAD }))];
}

const HIT_TEXT = /^A critical hit!$|^Hit \d+ times!$|effective/i;

// The drop sits on the hit's first message (crit, hit count or effectiveness) when it has one;
// on any other line the hit was neutral.
export function hitSfx(log, k) {
  for (let j = k; j < Math.min(log.length, k + 3) && HIT_TEXT.test(log[j].text); j++) {
    const t = log[j].text;
    if (/super-effective/i.test(t)) return 'superEffective';
    if (/not very effective/i.test(t)) return 'notVeryEffective';
  }
  return 'damage';
}

// Lines right after "X used Y!" that mean the move never connected: Crystal skips the
// move animation when wAttackMissed is set (miss, Protect, immunity, failure).
const NO_ANIM = /'s attack missed!$| is protecting itself!$|^It doesn't affect |^But it failed!$/;
export function moveMissed(log, k) {
  return !!log[k]?.fx && NO_ANIM.test(log[k + 1]?.text ?? '');
}
