"""Extract Goldenrod City (map, tileset, palettes, NPC sprites, font) from the ROM.

Usage: python3 -I town.py ROM DISASM OUT_DIR

Writes goldenrod.json (the city) and goldenrod-gym.json (the Gym interior).

Every value is read from the Pokemon Crystal (UE) v1.0 ROM bytes (sha1 f4cd194b...). The
pret/pokecrystal disassembly is only used for its symbol map and constant names, the same
way red-battle/tools/*.py work. The ROM itself is never published.

What the game does, and what this mirrors:
- LoadTilesetGFX (home/map.asm): the tileset is LZ-decompressed; tiles $00-$5f go to VRAM
  bank 0 and the next $60 to bank 1. LoadMapGroupRoof then overwrites bank-0 tiles $0a-$12
  with the map group's roof.
- _LoadOverworldAttrmapPals (engine/tilesets/map_palettes.asm): a tile's palette is a nibble
  of the tileset palette map at (tile id >> 1); bit 3 of that nibble selects VRAM bank 1.
- LoadMapPals (engine/gfx/color.asm): BG palettes come from TilesetBGPalette through the
  OUTDOOR row for the time of day, then palette 6 colours 1-2 are replaced from RoofPals.
"""
import hashlib, json, re, sys

EXPECTED_SHA1 = "f4cd194bdee0d04ca4eac29e09b8e4e9d818c133"
TIMES = ["morn", "day", "nite"]  # MORN_F, DAY_F, NITE_F
TOWN_ENV, INDOOR_ENV = 1, 3  # TOWN / INDOOR in EnvironmentColorsPointers
GOLDENROD_GROUP = 11
ROOF_TILE, ROOF_LENGTH = 0x0a, 9
WALKING_SPRITE = 1
# Sprites each map needs besides the ones placed in its MapEvents.
CITY_SPRITES = ["SPRITE_CHRIS", "SPRITE_RED", "SPRITE_GYM_GUIDE"]
# The Gym holds the Elite Four, Champion LANCE and RED.
GYM_SPRITES = ["SPRITE_CHRIS", "SPRITE_RED", "SPRITE_WILL", "SPRITE_KOGA", "SPRITE_BRUNO",
               "SPRITE_KAREN", "SPRITE_LANCE", "SPRITE_GYM_GUIDE"]


def lz_decompress(rom, start):
    """home/decompress.asm (Crystal LZ). Returns the decompressed bytes."""
    out = bytearray()
    p = start
    while True:
        cmd = rom[p]; p += 1
        if cmd == 0xff:
            return bytes(out)
        kind = cmd >> 5
        if kind == 7:  # LZ_LONG
            kind = (cmd >> 2) & 7
            n = ((cmd & 3) << 8 | rom[p]) + 1; p += 1
        else:
            n = (cmd & 31) + 1
        if kind == 0:  # literal
            out += rom[p:p + n]; p += n
        elif kind == 1:  # iterate
            out += bytes([rom[p]]) * n; p += 1
        elif kind == 2:  # alternate
            a, b = rom[p], rom[p + 1]; p += 2
            out += bytes((a, b)[i & 1] for i in range(n))
        elif kind == 3:  # zero
            out += bytes(n)
        else:  # 4 repeat, 5 flip (bit-reversed), 6 reverse
            b = rom[p]; p += 1
            if b & 0x80:
                src = len(out) - (b & 0x7f) - 1
            else:
                src = b << 8 | rom[p]; p += 1
            for i in range(n):
                if kind == 4:
                    out.append(out[src + i])
                elif kind == 5:
                    out.append(int(f"{out[src + i]:08b}"[::-1], 2))
                else:
                    out.append(out[src - i])


def tile_2bpp(data):
    """16 bytes -> 64 colour indices as a hex string (row-major, bit 7 = leftmost)."""
    px = []
    for y in range(8):
        lo, hi = data[2 * y], data[2 * y + 1]
        px += [((hi >> b) & 1) << 1 | ((lo >> b) & 1) for b in range(7, -1, -1)]
    return "".join(f"{c:x}" for c in px)


def tile_1bpp(data):
    return "".join("3" if (data[y] >> b) & 1 else "0" for y in range(8) for b in range(7, -1, -1))


def colour(word):
    r, g, b = word & 31, (word >> 5) & 31, (word >> 10) & 31
    return [(v << 3) | (v >> 2) for v in (r, g, b)]


def consts(path, prefix):
    """`const PREFIX*` names in order, numbered from the file's const_def."""
    names = {}
    n = 0
    for line in open(path):
        m = re.match(r"\s*const_def(?:\s+(\S+))?", line)
        if m:
            n = int(m[1].replace("$", "0x"), 0) if m[1] else 0
            continue
        m = re.match(rf"\s*const ({prefix}\w*)", line)
        if m:
            names[m[1]] = n
            n += 1
        elif re.match(r"\s*const \w", line):
            n += 1
    return names


def main(rom_path, disasm, out_dir):
    rom = open(rom_path, "rb").read()
    sha1 = hashlib.sha1(rom).hexdigest()
    if sha1 != EXPECTED_SHA1:
        sys.exit(f"ROM sha1 {sha1} is not Crystal UE v1.0 ({EXPECTED_SHA1})")
    syms = {}
    for line in open(f"{disasm}/pokecrystal.sym"):
        m = re.match(r"([0-9a-f]{2}):([0-9a-f]{4}) (\S+)", line)
        if m:
            syms[m[3]] = (int(m[1], 16), int(m[2], 16))

    def off(bank, addr):
        if bank == 0:
            return addr
        assert 0x4000 <= addr < 0x8000, f"{bank:02x}:{addr:04x}"
        return bank * 0x4000 + addr - 0x4000

    def at(name, delta=0):
        b, a = syms[name]
        return off(b, a + delta)

    def word(p):
        return rom[p] | rom[p + 1] << 8

    def build(map_name, tileset, env_id, roof_group, extra_sprites):
        # ---------- map header ----------
        p = at(f"{map_name}_MapAttributes")
        border, height, width = rom[p], rom[p + 1], rom[p + 2]
        blocks_bank, blocks_addr = rom[p + 3], word(p + 4)
        events_bank, events_addr = rom[p + 6], word(p + 9)
        assert (blocks_bank, blocks_addr) == syms[f"{map_name}_Blocks"]
        assert (events_bank, events_addr) == syms[f"{map_name}_MapEvents"]
        bp = off(blocks_bank, blocks_addr)
        blocks = list(rom[bp: bp + width * height])

        # ---------- tileset ----------
        raw = lz_decompress(rom, at(f"Tileset{tileset}GFX"))
        gfx = bytearray(raw[: 0xc0 * 16].ljust(0xc0 * 16, b"\0"))
        if roof_group is not None:  # LoadMapGroupRoof: Johto town tilesets only
            roof_index = rom[at("MapGroupRoofs") + roof_group]
            assert roof_index == 4, roof_index  # ROOF_GOLDENROD
            rp = at("Roofs") + roof_index * ROOF_LENGTH * 16
            gfx[ROOF_TILE * 16: (ROOF_TILE + ROOF_LENGTH) * 16] = rom[rp: rp + ROOF_LENGTH * 16]
        palmap = at(f"Tileset{tileset}PalMap")
        meta = at(f"Tileset{tileset}Meta")
        coll = at(f"Tileset{tileset}Coll")

        def resolve(tile_id):
            """Tile id as stored in a metatile -> (index into gfx, BG palette)."""
            nib = rom[palmap + (tile_id >> 1)]
            nib = nib >> 4 if tile_id & 1 else nib & 15
            bank1 = bool(nib & 8)
            t = tile_id & 0x7f
            assert t < 0x60, hex(tile_id)
            return (0x60 + t if bank1 else t), nib & 7

        used_blocks = sorted(set(blocks) | {border})
        metatiles, collision, used_tiles = {}, {}, set()
        for blk in used_blocks:
            ids = rom[meta + blk * 16: meta + blk * 16 + 16]
            cells = [resolve(t) for t in ids]
            used_tiles |= {g for g, _ in cells}
            metatiles[blk] = cells
            collision[blk] = list(rom[coll + blk * 4: coll + blk * 4 + 4])
        tile_list = sorted(used_tiles)
        tile_index = {g: i for i, g in enumerate(tile_list)}
        tiles = [tile_2bpp(gfx[g * 16: g * 16 + 16]) for g in tile_list]

        # ---------- palettes ----------
        env = word(at("EnvironmentColorsPointers") + 2 * env_id)
        env_bank = syms["EnvironmentColorsPointers"][0]
        bgpal = at("TilesetBGPalette")
        objpals = at("MapObjectPals")
        bg, obj = {}, {}
        for t, name in enumerate(TIMES):
            row = off(env_bank, env + 8 * t)
            pals = []
            for i in range(8):
                q = bgpal + rom[row + i] * 8
                pals.append([colour(word(q + 2 * c)) for c in range(4)])
            if roof_group is not None:  # LoadMapPals: TOWN and ROUTE maps get the roof colours
                r = at("RoofPals") + roof_group * 8 + (4 if name == "nite" else 0)
                pals[6][1], pals[6][2] = colour(word(r)), colour(word(r + 2))
            bg[name] = pals
            obj[name] = [[colour(word(objpals + t * 64 + i * 8 + 2 * c)) for c in range(4)]
                         for i in range(8)]

        # ---------- events ----------
        sprite_ids = consts(f"{disasm}/constants/sprite_constants.asm", "SPRITE_")
        sprite_names = {v: k for k, v in sprite_ids.items()}
        e = off(events_bank, events_addr) + 2  # past the two filler bytes
        warps = []
        n, e = rom[e], e + 1
        for _ in range(n):
            warps.append({"x": rom[e + 1], "y": rom[e], "dest": rom[e + 2],
                          "group": rom[e + 3], "map": rom[e + 4]})
            e += 5
        n, e = rom[e], e + 1
        e += n * 8  # coord events (none in Goldenrod)
        signs = []
        n, e = rom[e], e + 1
        for _ in range(n):
            signs.append({"x": rom[e + 1], "y": rom[e], "kind": rom[e + 2]})
            e += 5
        objects = []
        sp = at("OverworldSprites")
        n, e = rom[e], e + 1
        for _ in range(n):
            sprite, y, x, move, radius = rom[e], rom[e + 1] - 4, rom[e + 2] - 4, rom[e + 3], rom[e + 4]
            pal = rom[e + 7] >> 4
            objects.append({"x": x, "y": y, "sprite": sprite_names[sprite], "movement": move,
                            "radiusX": radius & 15, "radiusY": radius >> 4,
                            "palette": pal - 8 if pal >= 8 else None})
            e += 13

        move_names = consts(f"{disasm}/constants/map_object_constants.asm", "SPRITEMOVEDATA_")
        move_by_id = {v: k[len("SPRITEMOVEDATA_"):] for k, v in move_names.items()}
        for o in objects:
            o["movement"] = move_by_id.get(o["movement"], o["movement"])

        # ---------- sprites ----------
        wanted = sorted({o["sprite"] for o in objects} | set(extra_sprites))
        sprites = {}
        for name in wanted:
            q = sp + (sprite_ids[name] - 1) * 6
            addr, size, bank, kind, pal = word(q), rom[q + 2], rom[q + 3], rom[q + 4], rom[q + 5]
            n = size // 16 * (2 if kind == WALKING_SPRITE else 1)
            g = off(bank, addr)
            sprites[name[len("SPRITE_"):]] = {
                "walking": kind == WALKING_SPRITE, "palette": pal,
                "tiles": [tile_2bpp(rom[g + 16 * i: g + 16 * i + 16]) for i in range(n)]}
        for o in objects:
            o["sprite"] = o["sprite"][len("SPRITE_"):]

        # ---------- font + textbox frame ----------
        font = at("Font")
        glyphs = [tile_1bpp(rom[font + 8 * i: font + 8 * i + 8]) for i in range(128)]
        frame = at("Frames")
        frame_tiles = [tile_1bpp(rom[frame + 8 * i: frame + 8 * i + 8]) for i in range(6)]
        # Only the section of charmap.asm that names gfx/font/font.png (the Font glyphs).
        src = open(f"{disasm}/constants/charmap.asm").read()
        src = src[src.index("(from gfx/font/font.png)"): src.index("; Japanese control characters")]
        charmap = {}
        for m in re.finditer(r'charmap "(.)",\s*\$([0-9a-f]{2})', src):
            if int(m[2], 16) >= 0x80:
                charmap[m[1]] = int(m[2], 16) - 0x80

        out = {
            "source": {"sha1": sha1},
            "map": {"width": width, "height": height, "border": border, "blocks": blocks},
            "tiles": tiles,
            "metatiles": {str(b): [[tile_index[g], pal] for g, pal in cells]
                          for b, cells in metatiles.items()},
            "collision": {str(b): c for b, c in collision.items()},
            "palettes": {"bg": bg, "obj": obj},
            "warps": warps, "signs": signs, "objects": objects,
            "sprites": sprites,
            "font": {"glyphs": glyphs, "frame": frame_tiles, "charmap": charmap},
        }
        print(f"{map_name}: {width}x{height} blocks, {len(tiles)} tiles, {len(metatiles)} metatiles, "
              f"{len(warps)} warps, {len(signs)} signs, {len(objects)} objects, {len(sprites)} sprites")
        return out

    maps = {
        "goldenrod.json": build("GoldenrodCity", "JohtoModern", TOWN_ENV, GOLDENROD_GROUP, CITY_SPRITES),
        "goldenrod-gym.json": build("GoldenrodGym", "EliteFourRoom", INDOOR_ENV, None, GYM_SPRITES),
    }
    for name, out in maps.items():
        with open(f"{out_dir}/{name}", "w") as f:
            json.dump(out, f, separators=(",", ":"))


if __name__ == "__main__":
    main(*sys.argv[1:4])
