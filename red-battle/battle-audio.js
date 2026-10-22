// Which Crystal sounds a battle log line triggers (engine/battle/core.asm order).
// Pure: returns [{at: seconds, sfx?: name, cry?: dex, opts?}] for app.js to schedule.

// dexOf(side, entry) -> species of that side's active mon at that log line
export function soundEvents(log, k, dexOf) {
  const entry = log[k];
  const prev = log[k - 1];
  const text = entry.text;
  const ev = [];
  if (/^Go! /.test(text) || /^RED sent out /.test(text)) {
    const side = text.startsWith('Go!') ? 0 : 1;
    ev.push({ at: 0, sfx: 'ballPoof', opts: { force: true } });
    ev.push({ at: 0.45, cry: dexOf(side, entry), opts: { tracks: side ? 'right' : 'left' } });
  } else if (/^Enemy .* fainted!$/.test(text)) {
    // FaintEnemyPokemon: SFX_KINESIS, the slide-down, then SFX_FAINT
    ev.push({ at: 0, sfx: 'SFX_KINESIS', opts: { force: true } });
    ev.push({ at: 0.35, sfx: 'faint', opts: { force: true } });
  } else if (/ fainted!$/.test(text)) {
    // FaintYourPokemon: the player's mon cries as it faints
    ev.push({ at: 0, cry: dexOf(0, entry), opts: { tracks: 'left' } });
  } else if (/^RED used FULL RESTORE/.test(text)) {
    ev.push({ at: 0, sfx: 'fullHeal', opts: { force: true } });
  } else if (/, come back!$/.test(text) || /^RED withdrew /.test(text)) {
    ev.push({ at: 0, sfx: 'switchPokemon', opts: { force: true } });
  }
  if (prev?.snap && entry.snap) {
    for (const i of [0, 1]) {
      if (prev.snap[i].idx === entry.snap[i].idx && entry.snap[i].hp < prev.snap[i].hp) {
        ev.push({ at: 0, sfx: hitSfx(log, k), opts: { force: true } });
        break;
      }
    }
  }
  return ev;
}

// The effectiveness text follows the damage line
export function hitSfx(log, k) {
  for (let j = k; j < Math.min(log.length, k + 3); j++) {
    const t = log[j].text;
    if (/super-effective/i.test(t)) return 'superEffective';
    if (/not very effective/i.test(t)) return 'notVeryEffective';
  }
  return 'damage';
}
