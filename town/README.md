# Goldenrod City

The portfolio homepage is a walkable Goldenrod City from Pokémon Crystal. Each building opens a
part of the portfolio, the signs and NPCs talk about Casper, and the Gym leads to Battle RED.

| Door | Opens |
| --- | --- |
| Gym | Battle RED (`red-battle/`) |
| Pokémon Center | About |
| Magnet Train Station | Career / experience |
| Dept. Store | Skills & tools |
| Game Corner | Projects, live from the GitHub API |
| Radio Tower | Contact |
| Name Rater | CV (PDF) |
| Bill's family's house | How it started |
| Happiness Rater | Long-term goal |
| Bike Shop | Outside of work |
| PP Speech House | Teaching |
| Flower Shop | Blog |
| Route 35 gate, Underground | Classic site / source |

Controls: arrows or WASD to walk, Z / Enter / Space for A, X / Esc for B, M toggles sound.
On touch screens a D-pad and A/B buttons appear. `?time=morn|day|nite` previews another time of
day (otherwise the visitor's clock picks the palette, like the game).

## Files

- `data/goldenrod.json`: map, tileset, palettes, NPC sprites and font, read from the ROM.
- `content.js`: what every door, sign and NPC says. Edit this to change the portfolio text.
- `engine.js`: collision, doors, NPC wandering, text wrapping (no DOM; tested in Node).
- `render.js`, `font.js`: canvas drawing at Game Boy resolution with GBC LCD colours.
- `main.js`: input, game loop, pages and sound (Crystal's sound engine from `red-battle/`).

## Rebuilding the data

The ROM is not in the repo. With a Pokémon Crystal (UE) v1.0 ROM (sha1 `f4cd194b…`) and a
checkout of [pret/pokecrystal](https://github.com/pret/pokecrystal) (for its symbol map):

```sh
python3 -I town/tools/town.py "Pokemon - Crystal Version (USA, Europe).gbc" ../pokecrystal town/data/goldenrod.json
python3 -I red-battle/tools/audio.py "Pokemon - Crystal Version (USA, Europe).gbc" ../pokecrystal red-battle/audio.json
```

## Tests

```sh
node --test town/test/ red-battle/test/
```
