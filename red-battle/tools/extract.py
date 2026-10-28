"""Extract Gen II battle data straight from a Pokemon Crystal (UE) v1.0 ROM.

Table addresses come from the pret/pokecrystal symbol map for the exact same
build (sha1 f4cd194bdee0d04ca4eac29e09b8e4e9d818c133); every value is read
from the ROM bytes, not copied from the disassembly sources.
"""
import hashlib, json, os, re, sys

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

    # Dialogue: the text/line/para/cont/done script the map scripts use (macros/scripts/text.asm).
    SPEECH = {0x4a: "POKéMON", 0x54: "POKé", 0x56: "……", 0x75: "…", 0x7f: " ", 0xe0: "'",
              0xd0: "'d", 0xd1: "'l", 0xd2: "'m", 0xd3: "'r", 0xd4: "'s", 0xd5: "'t", 0xd6: "'v",
              0x14: "{PLAYER}", 0x52: "{PLAYER}", 0x5d: "TRAINER", 0xe9: "&", 0xf0: "¥", 0x9d: ";"}

    def dialogue(off):
        """TX_START text up to done/prompt -> paragraphs (line/cont join with a space)."""
        assert rom[off] == 0x00, hex(rom[off])  # TX_START
        off += 1
        paras, cur = [], ""
        while rom[off] not in (0x57, 0x58, 0x50):  # done, prompt, @
            c = rom[off]
            if c in (0x4f, 0x55):  # line, cont
                # A word hyphenated across two lines ("intro-" / "duce") joins back up.
                if re.search(r"[a-z]-$", cur) and not cur.endswith("--"):
                    cur = cur[:-1]
                else:
                    cur += " "
            elif c == 0x51:  # para
                paras.append(cur.strip()); cur = ""
            else:
                ch = SPEECH.get(c, CHARS.get(c))
                assert ch is not None, f"byte {c:#x} at {off:#x}"
                cur += ch
            off += 1
        paras.append(cur.strip())
        return [" ".join(p.split()) for p in paras if p]

    def class_name(cls):
        off = syms["TrainerClassNames"]
        for _ in range(cls - 1):
            while rom[off] != 0x50:
                off += 1
            off += 1
        out = ""
        while rom[off] != 0x50:
            out += {0x4a: "PKMN", 0x7f: " "}.get(rom[off]) or CHARS[rom[off]]
            off += 1
        return out

    def trainer(cls, group, texts, music):
        attr = rom[syms["TrainerClassAttributes"] + (cls - 1) * 7:][:7]
        dvb = rom[syms["TrainerClassDVs"] + (cls - 1) * 2:][:2]
        name, off = text(syms[group])
        party_type = rom[off]; off += 1
        assert party_type == 1, "expected TRAINERTYPE_MOVES"
        party = []
        while rom[off] != 0xFF:
            lvl, sp = rom[off], rom[off + 1]
            party.append({"level": lvl, "species": sp, "moves": [m for m in rom[off + 2:off + 6] if m]})
            off += 6
        return {
            "name": name, "className": class_name(cls), "class": cls, "party": party,
            "items": [attr[0], attr[1]], "baseReward": attr[2],
            "aiFlags": int.from_bytes(attr[3:5], "little"),
            "contextFlags": int.from_bytes(attr[5:7], "little"),
            "dvs": {"atk": dvb[0] >> 4, "def": dvb[0] & 15, "spe": dvb[1] >> 4, "spc": dvb[1] & 15},
            "text": {k: dialogue(syms[label]) for k, label in texts.items()},
            "music": music,
            "romOffsets": {k: hex(syms[k]) for k in [group, "TrainerClassAttributes", "TrainerClassDVs"]},
        }

    # Trainer classes are 1-based (constants/trainer_constants.asm); attributes are 7 bytes and
    # DVs 2 bytes per class. Music follows PlayBattleMusic: CHAMPION and RED get the champion
    # theme, the Elite Four (IsGymLeader) the Johto gym leader theme.
    trainers = {
        "red": trainer(0x3F, "RedGroup", {"before": "RedSeenText", "win": "RedWinLossText"}, "championBattle"),
        "will": trainer(0x0B, "WillGroup", {"before": "WillScript_WillBeforeText",
                        "win": "WillScript_WillBeatenText", "after": "WillScript_WillDefeatText"}, "johtoGymBattle"),
        "koga": trainer(0x0F, "KogaGroup", {"before": "KogaScript_KogaBeforeText",
                        "win": "KogaScript_KogaBeatenText", "after": "KogaScript_KogaDefeatText"}, "johtoGymBattle"),
        "bruno": trainer(0x0D, "BrunoGroup", {"before": "BrunoScript_BrunoBeforeText",
                         "win": "BrunoScript_BrunoBeatenText", "after": "BrunoScript_BrunoDefeatText"}, "johtoGymBattle"),
        "karen": trainer(0x0E, "KarenGroup", {"before": "KarenScript_KarenBeforeText",
                         "win": "KarenScript_KarenBeatenText", "after": "KarenScript_KarenDefeatText"}, "johtoGymBattle"),
        "lance": trainer(0x10, "ChampionGroup", {"before": "LanceBattleIntroText",
                         "win": "LanceBattleWinText", "after": "LanceBattleAfterText"}, "championBattle"),
    }
    # The eight Johto Gym Leaders (classes 1-8), for the town's POKéMON FAN CLUB.
    leaders = {
        "falkner": (0x01, "FalknerGroup", "FalknerIntroText", "FalknerWinLossText"),
        "bugsy": (0x03, "BugsyGroup", "BugsyText_INeverLose", "BugsyText_ResearchIncomplete"),
        "whitney": (0x02, "WhitneyGroup", "WhitneyBeforeText", "WhitneyShouldntBeSoSeriousText"),
        "morty": (0x04, "MortyGroup", "MortyIntroText", "MortyWinLossText"),
        "chuck": (0x07, "ChuckGroup", "ChuckIntroText1", "ChuckLossText"),
        "jasmine": (0x06, "JasmineGroup", "Jasmine_SteelTypeIntro", "Jasmine_BetterTrainer"),
        "pryce": (0x05, "PryceGroup", "PryceText_Intro", "PryceText_Impressed"),
        "clair": (0x08, "ClairGroup", "ClairIntroText", "ClairWinText"),
    }
    for key, (cls, group, before, win) in leaders.items():
        trainers[key] = trainer(cls, group, {"before": before, "win": win}, "johtoGymBattle")
    red = trainers["red"]

    out = {"source": {"rom": "Pokemon - Crystal Version (USA, Europe).gbc", "sha1": sha1,
                      "offsets": {k: hex(syms[k]) for k in
                                  ["BaseData", "Moves", "MoveNames", "PokemonNames",
                                   "EvosAttacksPointers", "TypeMatchups"]}},
           "species": species, "moves": moves,
           "typeMatchups": matchups, "foresightSplit": foresight_split, "red": red,
           "trainers": trainers, "effects": effects}
    json.dump(out, open(out_path, "w"), indent=1, ensure_ascii=False)
    # A small copy of who they are and what they say, for the Goldenrod town's Gym NPCs.
    lite = {k: {"name": t["name"], "className": t["className"], "text": t["text"]} for k, t in trainers.items()}
    json.dump(lite, open(os.path.join(os.path.dirname(out_path), "trainers.json"), "w"), ensure_ascii=False)
    print(f"species={len(species)} moves={len(moves)} matchups={len(matchups)}")
    for k, t in trainers.items():
        print(k, t["className"], t["name"], [p["species"] for p in t["party"]], t["text"].get("before"))


if __name__ == "__main__":
    main(*sys.argv[1:4])
