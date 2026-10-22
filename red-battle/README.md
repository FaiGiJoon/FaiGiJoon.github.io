# Battle Red (Mt. Silver)

A browser rematch against PKMN Trainer RED from Pokémon Crystal. RED uses his real Crystal team, DVs, two Full Restores and AI. You get six random Pokémon obtainable in Gold/Silver/Crystal (no Mew/Celebi by default) at RED's levels (81, 73, 75, 77, 77, 77). Each knows the four level-up moves the game itself would give it.

## Where the data comes from

All numbers are read from a Pokémon Crystal (UE) v1.0 ROM (sha1 `f4cd194bdee0d04ca4eac29e09b8e4e9d818c133`). Table addresses come from the [pret/pokecrystal](https://github.com/pret/pokecrystal) symbol map for that exact build:

```sh
git clone https://github.com/pret/pokecrystal ~/src/pokecrystal
git -C ~/src/pokecrystal fetch --depth 1 origin symbols
git -C ~/src/pokecrystal show FETCH_HEAD:pokecrystal.sym > ~/src/pokecrystal/pokecrystal.sym
python3 red-battle/tools/extract.py crystal.gbc ~/src/pokecrystal red-battle/data.json
python3 red-battle/tools/sprites.py crystal.gbc ~/src/pokecrystal red-battle/sprites
node --test red-battle/test/
```

| File | What it holds |
| --- | --- |
| `data.json` | 251 base stats and learnsets, 251 moves, the type chart, RED's party, DVs, items and AI flags |
| `sprites/` | Front, back and trainer pics decompressed from the ROM (Gen II LZ, 2bpp, column-major tiles) |
| `engine.js` | Gen II battle rules and RED's AI, ported from `engine/battle/*.asm` |
| `app.js` | The battle screen |

## Faithful to the game

- **Damage:** the damage formula, the 997+2 damage cap, and stat truncation above 255. Also crit stages (17/256 …), weather, STAB, sequential type multipliers and the 217–255 random spread.
- **Status:** sleep lasts 1–6 turns and Rest 2 turns. Freeze has a 10% thaw chance per turn, and fire moves that can burn will thaw the target. Paralysis is a 25% full-paralysis chance with Speed quartered.
- **Badges:** all 16 badges boost the player's types and stats (togglable).
- **RED's AI:** RED runs the game's AI layers: BASIC, SETUP, SMART, AGGRESSIVE, CAUTIOUS, STATUS and RISKY. His status and stat-lowering moves have the 25% "computer" fail chance.
- **Full Restores:** RED uses them only while his highest-level Pokémon (Pikachu) is out. He uses one at ≤25% HP, has about a 20% chance at 25–50% HP, and also uses one if Pikachu is asleep or frozen.
- **Switching:** RED uses the `SWITCH_SOMETIMES` logic.
- **Stat experience:** trainer Pokémon have zero stat experience (true in the game), and so do yours.

## Simplified or approximate

- RED's choice of replacement after a faint follows the intent of `FindMonInOTPartyToSwitchIntoBattle`, not every register-level quirk.
- The badge stat-boost glitch is not reproduced: boosts apply once.
- Time of day is ignored for Morning Sun and Moonlight.
- There are no held items.
- Some rare move effects are simplified; see the `default:` branch in `engine.js`.
