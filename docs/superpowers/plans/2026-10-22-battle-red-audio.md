# Battle Red: music, sound effects, site styling — plan

## Spec (agreed with the user in chat, 2026-10-22)

- The user loves the game and wants it kept as-is, with three additions.
- **Music.** Pressing **BATTLE RED** starts the official music of the Red battle in Pokémon Crystal. The game code (`engine/battle/start_battle.asm`, PlayBattleMusic) shows Red uses `MUSIC_CHAMPION_BATTLE` (`Music_ChampionBattle`, 3 channels). It loops for the whole battle. It must come from the user's ROM. Do not download an MP3, and do not publish the `.gbc` file itself. Only extracted audio data is published, the same way stats and sprites are.
- When the battle ends the battle music stops. If the player wins, play the victory jingle the game plays after beating Red: `MUSIC_GYM_VICTORY` (`Music_GymLeaderVictory`). Red counts as a gym leader in `PlayVictoryMusic`/`IsGymLeader`.
- There is a small mute toggle, so visitors to the user's portfolio are not blasted. Browsers only allow audio after a user gesture; the BATTLE RED click is that gesture. The setup page stays silent.
- **Battle sound effects** come from the same ROM via the same engine: hit sounds by effectiveness, Pokémon cries, ball poof on send-out, faint, menu/text blips and the Full Restore sound.
- **Battle animations (added by the user mid-run, 2026-10-22):** "add battle animations from Pokémon Crystal with the sound". Every move plays its real Crystal animation script (`data/moves/animations.asm`, `BattleAnimations`), with the exact sounds and timing the script specifies. Scope agreed with the user:
  - sounds and timing are exact
  - visuals run the script's background/screen effects: flashes, shakes, blinks, lunges, fades, hide/show
  - the per-object particle sprites (flames, bolts…) are a follow-up and are not in this plan
- The user also authorised pushing the finished work to the open PR branch when everything is done.
- **Styling.** The "beginning of the battle site" (the setup/team screen and the page around the battle) must look like the user's portfolio, `index.html` in this repo. That means a dark navy `#020617` background, glass panels and the indigo/violet/cyan gradient. The Game Boy battle screen itself (`.gb` and everything inside it) stays exactly as it is.

## Global constraints

- Work only in `red-battle/` (plus `_config.yml`/`.gitignore` where a task says so) on branch `game/battle-red` of `~/src/FaiGiJoon.github.io`. Never push.
- ROM: `/Users/casper/Downloads/Pokemon - Crystal Version (USA, Europe).gbc`, sha1 `f4cd194bdee0d04ca4eac29e09b8e4e9d818c133`. Disassembly + symbol map: `~/src/pokecrystal` (`pokecrystal.sym`; `bank:addr` → ROM offset `bank*0x4000 + addr - 0x4000` for bank > 0). Never commit the ROM or any file containing it whole.
- No build step, no npm dependencies. The web code is plain ES modules served statically. Python tools use only the standard library. Tests use `node --test red-battle/test/`, and the existing 15 tests must keep passing.
- Site Content-Security-Policy style: keep scripts as same-origin files, with no inline `<script>` and no new CDNs. Google Fonts is allowed.
- Match the surrounding code style: 2-space JS, single quotes, small comments only where the "why" is non-obvious.

## Tasks

### Task 1: Restyle the setup screen and page chrome to match the portfolio

Files: `red-battle/index.html`, `red-battle/style.css`, `_config.yml`, `.gitignore`.

- Restyle everything outside `.gb` to the portfolio look from `/index.html`:
  - body background `#020617`, text `gray-100`-ish (`#f3f4f6`), with a soft radial indigo glow like `.hero-glow`
  - `.panel` becomes a glass card: `rgba(30,41,59,0.5)`, `backdrop-filter: blur(10px)`, `1px solid rgba(99,102,241,0.1)`, rounded 16px
  - headings use Inter with the gradient text `linear-gradient(135deg,#6366f1,#8b5cf6,#06b6d4)`
  - small labels use JetBrains Mono uppercase in `#6366f1`
  - buttons: the primary is the gradient pill like the site's Contact button (`from-primary to-secondary`); the others are glass
  - load Inter + JetBrains Mono from Google Fonts next to Press Start 2P
- Keep Press Start 2P for the in-game battle screen (`.gb`). Team-list text and Red's panel switch to Inter/JetBrains Mono. Type badges and sprites stay.
- Red's panel keeps a red accent that fits the palette.
- The top bar gets the site's look: "← Back to site" in a glass pill linking `../`, and the title "Battle Red" with the gradient.
- `.gb`, `.field`, `.box`, `.hpbar`, `.textbox`, `.menu`, `.moves`, `.party` must render pixel-identical to before. Do not change those rules.
- Mobile: no horizontal scroll at 360px width; 16px side gutters.
- Add `docs` and `.superpowers` to `_config.yml` `exclude:`. Add `.superpowers/` to `.gitignore` (create the file if missing).
- Verify: the existing tests pass; `grep` shows the `.gb`-scoped rules unchanged against the base commit.

### Task 2: Extract audio data from the ROM — `red-battle/tools/audio.py` → `red-battle/audio.json`

- Read `audio/engine.asm`, `audio/notes.asm`, `macros/scripts/audio.asm` and `constants/audio_constants.asm` in the disassembly. Learn the Crystal audio byte format: song headers (channel_count/channel bytes), the note/rest/octave/note_type/drum commands, and every command `$d0–$ff` with its parameter length, including sound_loop/sound_call/sound_jump/sound_ret.
- Write `tools/audio.py ROM DISASM OUT`. It verifies the sha1, then traces from these entry points, following jumps, calls and loops:
  - `Music_ChampionBattle`
  - `Music_GymLeaderVictory`
  - every drumkit referenced by them (via `Drumkits`)
  - SFX `SFX_READ_TEXT_2`, `SFX_BALL_POOF`, `SFX_FAINT`, `SFX_DAMAGE`, `SFX_SUPER_EFFECTIVE`, `SFX_NOT_VERY_EFFECTIVE`, `SFX_FULL_HEAL`, `SFX_SWITCH_POKEMON`
  - all base cries used by `PokemonCries` (every one of the 251 species' cry headers: base cry id, pitch, length)
  - every battle animation script reachable from `BattleAnimations`: moves 1–251, plus the special animations after them (`ANIM_*` constants in `constants/battle_anim_constants.asm`, such as ANIM_SEND_OUT_MON, ANIM_ENEMY_DAMAGE, ANIM_PLAYER_DAMAGE, ANIM_MISS, ANIM_CONFUSED, ANIM_SLP, ANIM_PSN, ANIM_BRN, ANIM_FRZ, ANIM_PAR, ANIM_SAP, ANIM_HIT_CONFUSION, ANIM_*_STAT_DOWN), following anim_call/anim_jump/anim_loop and every other branch command; learn each anim command's parameter length from `macros/scripts/battle_anims.asm` and `engine/battle_anims/anim_commands.asm`
  - every SFX referenced by an `anim_sound` in those scripts, traced like the SFX above
- Output JSON:
  - `source.sha1`
  - `frequencyTable` (the words in `FrequencyTable`)
  - `waveSamples` (each a list of 32 4-bit samples)
  - `drumkits` (pointer table, resolved to bank/addr)
  - `songs: {championBattle: {bank, addr}, gymVictory: {...}}`
  - `sfx: {readText2: {bank, addr}, ...}`, using the names above in camelCase
  - `cries: {"<dex>": {base, pitch, length}}` and `cryHeaders: {"<base id>": {bank, addr}}`
  - `anims: {"<move id>": {bank, addr}, "<special name>": {bank, addr}}` (special names in camelCase, e.g. `sendOutMon`, `enemyDamage`)
  - `animCommands`: map of command byte → `{name, length}`, so the JS player can step through the scripts
  - `sfxIds`: SFX constant name → `{bank, addr}` for every SFX referenced
  - `bgEffects`: the list of `BATTLE_BG_EFFECT_*` names in id order
  - `blocks: [{bank, addr, hex}]`: only the byte ranges actually reached by the trace, merged when contiguous. The JS engine reads memory as `(bank, addr)` from these blocks exactly like the real engine reads ROM.
- Tests (`red-battle/test/audio-data.test.mjs`):
  - audio.json's champion battle header decodes to 3 channels (1, 2, 3)
  - channel 1's first commands decode to `tempo 98`, `volume 7,7`, `duty_cycle 3` (as in `audio/music/championbattle.asm`)
  - every block lies within its bank
  - all 251 species have a cry entry
  - Thunderbolt's animation script decodes to its first commands `anim_2gfx`, `anim_obj`, `anim_wait 16`, `anim_bgeffect FLASH_INVERTED`, `anim_sound 0, 1, SFX_THUNDERSHOCK`
  - the total size of `blocks` is under 400 KB

### Task 3: Game Boy sound engine in JS — `red-battle/gbsound.js` (+ `red-battle/gbsound-worklet.js`)

- Port the Crystal audio engine's behaviour from `audio/engine.asm` to JS, driven by `audio.json` memory blocks:
  - per-frame update at 59.7275 Hz
  - tempo and note length (the fractional note-length accumulator)
  - octave/transpose, `FrequencyTable` pitch, pitch_offset, vibrato, pitch_slide, duty_cycle and duty-cycle patterns, volume envelopes (volume + fade), stereo panning
  - the wave channel with `WaveSamples` and its volume
  - noise via drumkits and noise_note
  - loops/calls/jumps, and the music channels 1–4 plus SFX channels 5–8, with SFX overriding the music channel they share
  - cries played via the SFX channels with their pitch and length modifiers applied as the game does (`PlayCry`/`_PlayCry`)
- Model the APU outputs at sample level:
  - pulse: 4 duty cycles, frequency `131072/(2048-x)`
  - wave: 32×4-bit samples at `65536/(2048-x)`
  - noise: LFSR 15/7-bit from the NR43-style parameter
  - envelope steps at 64 Hz
- Structure:
  - a pure core `class GBSound { constructor(audioData, sampleRate); playMusic(name); playSfx(name); playCry(dex); stopMusic(); render(left: Float32Array, right: Float32Array) }`, usable in Node without Web Audio
  - `gbsound-worklet.js`: an `AudioWorkletProcessor` that imports the core and receives commands through `port.postMessage`
  - a small main-thread wrapper `createGameAudio()` (in `gbsound.js`) that lazily creates the AudioContext on first call and loads the worklet + `audio.json`. It exposes `music(name)`, `stopMusic()`, `sfx(name)`, `cry(dex)`, `setMuted(bool)` and `ready`. A `ScriptProcessorNode` fallback is fine if AudioWorklet is unavailable.
- Tests (`red-battle/test/gbsound.test.mjs`, Node only):
  - rendering 5 s of championBattle is non-silent on both the pulse and wave channels
  - the music loops: rendering 300 s does not throw, and channels stay active
  - a note's measured period matches the frequency table, e.g. via zero crossings on an isolated channel
  - every SFX and a sample of cries render, terminate, and leave the music playing afterwards
  - mute produces zeros

### Task 4: Wire audio into the battle — `red-battle/app.js`

Use `createGameAudio()` from Task 3. Do not change `engine.js` battle logic. Derive events from the log entries / snapshots the page already plays.

- On BATTLE RED click: init audio (the user gesture), start `championBattle`.
- On battle end: stop the music. On a player win, play `gymVictory` once.
- Sound effects:
  - a menu/move/party selection plays `readText2`
  - a Pokémon sent out plays `ballPoof`, then its cry
  - a hit plays `damage`, `superEffective` or `notVeryEffective`, matching the following log text or the effectiveness
  - a faint plays its cry and then `faint`
  - Red's Full Restore plays `fullHeal`
  - a voluntary switch plays `switchPokemon`
- A mute button in the under-row (`♪ ON` / `♪ OFF`), persisted in `localStorage` inside try/catch. Starting a new team stops the music and returns to the silent setup screen.
- Audio failures (unsupported browser, a fetch error) never break the game. Log to the console and keep playing silently.
- Tests: keep the existing tests green. Add a unit test for the pure helper that maps a log entry (and its previous snapshot) to sound events, if you extract one.

### Task 5: Battle animations with sound — `red-battle/anims.js` + `red-battle/app.js` + `red-battle/style.css`

- Write a pure, Node-testable script player `planAnimation(audioData, animKey, { attackerIsPlayer })`. It steps through the script bytes from `audio.json` and returns a timeline: `[{frame, kind: 'sfx'|'cry'|'bg'|'wait'|..., ...}]`.
  - frames are 59.7275 Hz
  - `anim_wait n` advances n frames
  - follow anim_call/ret/jump/loop
  - treat the conditional commands (`anim_if_*`, `anim_jumpuntil`, `anim_checkpokeball`) conservatively, taking the default/first-iteration path, and document each choice in a comment
  - ignore the object/gfx/palette commands, but keep them as `{kind:'obj'}` entries for later use
  - cap the timeline at 6 s
- `anim_sound duration, tracks, sfx` plays that SFX through `gbsound` (Task 3) at that frame. `anim_cry pitch` plays the attacker's cry.
- Map bg effects to CSS effects on the `.gb` screen, mirrored by side the way the game mirrors them when the enemy attacks:
  - FLASH_INVERTED/RAPID_FLASH/CYCLE_BGPALS_INVERTED: invert flash
  - FLASH_WHITE/WHITE_HUES: white flash
  - BLACK_HUES/FADE_*_TO_BLACK: darken
  - SHAKE_SCREEN_X/Y and WOBBLE_SCREEN: screen shake
  - HIDE_MON/SHOW_MON/REMOVE_MON: hide/show the attacker
  - TACKLE/BODY_SLAM/VITAL_THROW/ROLLOUT/FLAIL: the attacker lunges toward the target
  - BLINK/FLASH_MON_REPEATING: target blink
  - VIBRATE_MON/WOBBLE_MON/WAVE_DEFORM_MON/PSYCHIC: wobble
  - ENTER_MON/RETURN_MON: slide in/out
  - anything else: no-op
  Keep this mapping as one table in `anims.js`.
- In `app.js`:
  - when a log line says a Pokémon "used X", play X's animation and wait for it to finish before the next text, unless text speed is INSTANT (then cap at 0.4 s)
  - play `enemyDamage`/`playerDamage` on hits, and the status animations at the matching log lines
  - play `sendOutMon` when a Pokémon comes out
  - Task 4's generic hit/send-out sounds must not double up with sounds the animation already plays
- Tests: Thunderbolt's timeline contains SFX_THUNDERSHOCK at frame 16 and two FLASH_INVERTED bg effects; every move 1–251 produces a finite timeline without throwing; a move with anim_call/anim_loop resolves to a bounded timeline.
