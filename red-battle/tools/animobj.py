"""Extract Crystal battle-animation object data from the ROM.

Usage: python3 -I animobj.py ROM DISASM OUT

Reads, from the ROM bytes (sha1 f4cd194b...), the tables engine/battle_anims uses to draw
animation objects: BattleAnimObjects, the framesets (BattleAnimFrameData), the OAM sets
(BattleAnimOAMData), the object graphics (AnimObjGFX, LZ-decompressed to 2bpp tiles), the
sine table, the battle object palettes and the species palettes. The disassembly is only
used for the symbol map and the table lengths.
"""
import hashlib, json, re, sys

EXPECTED_SHA1 = "f4cd194bdee0d04ca4eac29e09b8e4e9d818c133"


def const_names(path, prefix):
    return re.findall(rf"^\s*const ({prefix}\w*)", open(path).read(), re.M)


def count_consts(path, prefix):
    return len(const_names(path, prefix))


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


def main(rom_path, disasm, out_path):
    rom = open(rom_path, "rb").read()
    if hashlib.sha1(rom).hexdigest() != EXPECTED_SHA1:
        sys.exit("ROM is not Crystal UE v1.0")
    syms = {}
    for line in open(f"{disasm}/pokecrystal.sym"):
        m = re.match(r"([0-9a-f]{2}):([0-9a-f]{4}) (\S+)", line)
        if m:
            syms[m[3]] = (int(m[1], 16), int(m[2], 16))
    consts = f"{disasm}/constants/battle_anim_constants.asm"

    def off(bank, addr):
        return addr if bank == 0 else bank * 0x4000 + addr - 0x4000

    def rd(bank, addr):
        return rom[off(bank, addr)]

    def rdw(bank, addr):
        return rd(bank, addr) | rd(bank, addr + 1) << 8

    ob, oa = syms["BattleAnimObjects"]
    objects = [[rd(ob, oa + 6 * i + k) for k in range(6)]
               for i in range(count_consts(consts, "BATTLE_ANIM_OBJ_"))]

    fb, fa = syms["BattleAnimFrameData"]
    framesets = []
    for i in range(count_consts(consts, "BATTLE_ANIM_FRAMESET_")):
        p = rdw(fb, fa + 2 * i)
        frames = []
        while True:  # GetBattleAnimFrame: 2-byte entries; oamdelete/oamrestart/oamend are 1 byte and end it
            cmd = rd(fb, p)
            if cmd in (0xfe, 0xff):
                frames.append([cmd])
                break
            if cmd == 0xfc:  # oamdelete is 1 byte, but the engine still reads the next one as a duration
                frames.append([cmd, rd(fb, p + 1)])
                break
            frames.append([cmd, rd(fb, p + 1)])
            p += 2
        framesets.append(frames)

    sb, sa = syms["BattleAnimOAMData"]
    oamsets = []
    for i in range(count_consts(consts, "BATTLE_ANIM_OAMSET_")):
        e = sa + 4 * i
        vtile, n, ptr = rd(sb, e), rd(sb, e + 1), rdw(sb, e + 2)
        oamsets.append([vtile, [[rd(sb, ptr + 4 * k + j) for j in range(4)] for k in range(n)]])

    gb, ga = syms["AnimObjGFX"]
    gfx = []
    for i in range((syms["Music_PostCredits"][1] - ga) // 4):
        e = ga + 4 * i
        n, bank, addr = rd(gb, e), rd(gb, e + 1), rdw(gb, e + 2)
        if addr == 0:
            gfx.append({"tiles": n, "hex": ""})
            continue
        data = lz_decompress(rom, off(bank, addr))
        gfx.append({"tiles": n, "hex": data[:16 * n].hex()})

    wb, wa = syms["BattleAnimSineWave"]
    sine = [rdw(wb, wa + 2 * i) for i in range(32)]

    pb, pa = syms["BattleObjectPals"]
    ob_pals = [[rdw(pb, pa + 8 * k + 2 * c) for c in range(4)] for k in range(6)]

    mb, ma = syms["PokemonPalettes"]
    mon_pals = {str(d): [rdw(mb, ma + 8 * d), rdw(mb, ma + 8 * d + 2)] for d in range(1, 252)}

    cb, ca = syms["BattleAnimCmd_Cry.CryData"]
    out = {
        "source": {"sha1": EXPECTED_SHA1},
        "objects": objects,  # [flags, fixY, frameset, function, palette, gfx]
        "framesets": framesets,  # [[oamset | command, duration | flips << 1], ...]
        "oamsets": oamsets,  # [vtile offset, [[y, x, tile, attr], ...]]
        "gfx": gfx,  # 2bpp tiles per BATTLE_ANIM_GFX_* id
        "sine": sine,  # BattleAnimSineWave
        "obPals": ob_pals,  # PAL_BATTLE_OB_GRAY..BROWN, RGB555
        "monPals": mon_pals,  # species: [light, dark] RGB555 (white/black implied)
        "framesetNames": [n[len("BATTLE_ANIM_FRAMESET_"):] for n in const_names(consts, "BATTLE_ANIM_FRAMESET_")],
        "objNames": [n[len("BATTLE_ANIM_OBJ_"):] for n in const_names(consts, "BATTLE_ANIM_OBJ_")],
        "funcNames": [n[len("BATTLE_ANIM_FUNC_"):] for n in const_names(consts, "BATTLE_ANIM_FUNC_")],
        "cryData": [[rdw(cb, ca + 4 * i), rdw(cb, ca + 4 * i + 2)] for i in range(4)],
    }
    with open(out_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
        f.write("\n")


if __name__ == "__main__":
    main(*sys.argv[1:4])
