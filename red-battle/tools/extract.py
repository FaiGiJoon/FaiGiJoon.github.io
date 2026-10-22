"""Extract Gen II battle data straight from a Pokemon Crystal (UE) v1.0 ROM.

Table addresses come from the pret/pokecrystal symbol map for the exact same
build (sha1 f4cd194bdee0d04ca4eac29e09b8e4e9d818c133); every value is read
from the ROM bytes, not copied from the disassembly sources.
"""
import hashlib, json, re, sys

EXPECTED_SHA1 = "f4cd194bdee0d04ca4eac29e09b8e4e9d818c133"
CHARS = {0x7F: " ", 0x9A: "(", 0x9B: ")", 0x9C: ":", 0xE0: "'", 0xE1: "PK", 0xE2: "MN",
         0xE3: "-", 0xE6: "?", 0xE7: "!", 0xE8: ".", 0xEA: "é", 0xEF: "♂", 0xF3: "/",
         0xF4: ",", 0xF5: "♀"}
CHARS.update({0x80 + i: chr(65 + i) for i in range(26)})
CHARS.update({0xA0 + i: chr(97 + i) for i in range(26)})
CHARS.update({0xF6 + i: str(i) for i in range(10)})
TYPE_IDS = {0: "NORMAL", 1: "FIGHTING", 2: "FLYING", 3: "POISON", 4: "GROUND", 5: "ROCK",
            6: "BIRD", 7: "BUG", 8: "GHOST", 9: "STEEL", 19: "CURSE", 20: "FIRE", 21: "WATER",
            22: "GRASS", 23: "ELECTRIC", 24: "PSYCHIC", 25: "ICE", 26: "DRAGON", 27: "DARK"}
GROWTH = ["MEDIUM_FAST", "SLIGHTLY_FAST", "SLIGHTLY_SLOW", "MEDIUM_SLOW", "FAST", "SLOW"]


def main(rom_path, disasm, out_path):
    rom = open(rom_path, "rb").read()
    sha1 = hashlib.sha1(rom).hexdigest()
    if sha1 != EXPECTED_SHA1:
        sys.exit(f"ROM sha1 {sha1} is not Crystal UE v1.0 ({EXPECTED_SHA1})")

    syms = {}
    for line in open(f"{disasm}/pokecrystal.sym"):
        m = re.match(r"([0-9a-f]{2}):([0-9a-f]{4}) (\S+)", line)
        if m:
            bank, addr = int(m[1], 16), int(m[2], 16)
            syms[m[3]] = addr if bank == 0 else bank * 0x4000 + (addr - 0x4000)

    def text(off, maxlen=None):
        out, i = "", 0
        while (maxlen is None or i < maxlen) and rom[off + i] != 0x50:
            out += CHARS.get(rom[off + i], "?")
            i += 1
        return out, off + i + 1

    effects = re.findall(r"const (EFFECT_\w+)",
                         open(f"{disasm}/constants/move_effect_constants.asm").read())

    # Move names: 251 terminated strings
    move_names, off = [], syms["MoveNames"]
    for _ in range(251):
        name, off = text(off)
        move_names.append(name)

    moves = {}
    for i in range(251):
        b = rom[syms["Moves"] + i * 7: syms["Moves"] + i * 7 + 7]
        mid = i + 1
        moves[mid] = {
            "id": mid, "name": move_names[i], "effect": effects[b[1]], "power": b[2],
            "type": TYPE_IDS[b[3]], "accuracy": b[4], "pp": b[5], "chance": b[6],
        }

    species = {}
    for i in range(251):
        b = rom[syms["BaseData"] + i * 32: syms["BaseData"] + i * 32 + 32]
        dex = b[0]
        name, _ = text(syms["PokemonNames"] + i * 10, 10)
        ptr = int.from_bytes(rom[syms["EvosAttacksPointers"] + i * 2:][:2], "little")
        off = 0x10 * 0x4000 + (ptr - 0x4000)
        evolves = False
        while rom[off] != 0:
            evolves = True
            off += 4 if rom[off] == 5 else 3  # EVOLVE_STAT has an extra byte
        off += 1
        learnset = []
        while rom[off] != 0:
            learnset.append([rom[off], rom[off + 1]])
            off += 2
        t1, t2 = TYPE_IDS[b[7]], TYPE_IDS[b[8]]
        species[dex] = {
            "dex": dex, "name": name,
            "base": {"hp": b[1], "atk": b[2], "def": b[3], "spe": b[4], "spa": b[5], "spd": b[6]},
            "types": [t1] if t1 == t2 else [t1, t2],
            "catchRate": b[9], "baseExp": b[10], "gender": b[13], "growth": GROWTH[b[22]],
            "evolves": evolves, "learnset": learnset,
        }

    matchups, off, foresight_split = [], syms["TypeMatchups"], None
    while rom[off] != 0xFF:
        if rom[off] == 0xFE:  # entries after this are ignored by Foresight
            foresight_split = len(matchups)
            off += 1
            continue
        matchups.append([TYPE_IDS[rom[off]], TYPE_IDS[rom[off + 1]], rom[off + 2]])
        off += 3

    # Trainer class RED = $3f (1-based); attributes are 7 bytes, DVs 2 bytes per class
    red_cls = 0x3F
    attr = rom[syms["TrainerClassAttributes"] + (red_cls - 1) * 7:][:7]
    dvb = rom[syms["TrainerClassDVs"] + (red_cls - 1) * 2:][:2]
    name, off = text(syms["RedGroup"])
    party_type = rom[off]; off += 1
    assert party_type == 1, "expected TRAINERTYPE_MOVES"
    party = []
    while rom[off] != 0xFF:
        lvl, sp = rom[off], rom[off + 1]
        party.append({"level": lvl, "species": sp, "moves": [m for m in rom[off + 2:off + 6] if m]})
        off += 6
    red = {
        "name": name, "class": red_cls, "party": party,
        "items": [attr[0], attr[1]], "baseReward": attr[2],
        "aiFlags": int.from_bytes(attr[3:5], "little"),
        "contextFlags": int.from_bytes(attr[5:7], "little"),
        "dvs": {"atk": dvb[0] >> 4, "def": dvb[0] & 15, "spe": dvb[1] >> 4, "spc": dvb[1] & 15},
        "romOffsets": {k: hex(syms[k]) for k in
                       ["RedGroup", "TrainerClassAttributes", "TrainerClassDVs"]},
    }

    out = {"source": {"rom": "Pokemon - Crystal Version (USA, Europe).gbc", "sha1": sha1,
                      "offsets": {k: hex(syms[k]) for k in
                                  ["BaseData", "Moves", "MoveNames", "PokemonNames",
                                   "EvosAttacksPointers", "TypeMatchups"]}},
           "species": species, "moves": moves,
           "typeMatchups": matchups, "foresightSplit": foresight_split, "red": red, "effects": effects}
    json.dump(out, open(out_path, "w"), indent=1, ensure_ascii=False)
    print(f"species={len(species)} moves={len(moves)} matchups={len(matchups)}")
    print(json.dumps(red, indent=1))


if __name__ == "__main__":
    main(*sys.argv[1:4])
