"""Decompress Pokemon and trainer pics from a Crystal UE v1.0 ROM into PNGs.

Pics are Gen II "lz3" compressed 2bpp tiles in column-major order
(home/decompress.asm, engine/gfx/load_pics.asm); palettes come from
PokemonPalettes / TrainerPalettes. Locations use the pret symbol map.
"""
import hashlib, os, re, struct, sys, zlib

EXPECTED_SHA1 = "f4cd194bdee0d04ca4eac29e09b8e4e9d818c133"


def lz_decompress(rom, off):
    out = bytearray()
    while True:
        b = rom[off]; off += 1
        if b == 0xFF:
            return bytes(out)
        if b & 0xE0 == 0xE0:
            cmd = (b >> 2) & 7
            n = (((b & 3) << 8) | rom[off]) + 1; off += 1
        else:
            cmd = b >> 5
            n = (b & 0x1F) + 1
        if cmd == 0:
            out += rom[off:off + n]; off += n
        elif cmd == 1:
            out += bytes([rom[off]]) * n; off += 1
        elif cmd == 2:
            a, c = rom[off], rom[off + 1]; off += 2
            out += bytes((a, c)[k & 1] for k in range(n))
        elif cmd == 3:
            out += bytes(n)
        else:
            o = rom[off]; off += 1
            if o & 0x80:
                src = len(out) - (o & 0x7F) - 1
            else:
                src = (o << 8) | rom[off]; off += 1
            for k in range(n):
                if cmd == 4:
                    out.append(out[src + k])
                elif cmd == 5:
                    out.append(int(f"{out[src + k]:08b}"[::-1], 2))
                else:
                    out.append(out[src - k])


def rgb555(lo, hi):
    v = lo | (hi << 8)
    return tuple(((v >> s) & 31) * 255 // 31 for s in (0, 5, 10))


def write_png(path, w, h, pixels, palette):
    # palette index 0 (white) becomes transparent
    raw = b"".join(b"\x00" + bytes(pixels[y * w:(y + 1) * w]) for y in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 3, 0, 0, 0))
    png += chunk(b"PLTE", b"".join(bytes(c) for c in palette))
    png += chunk(b"tRNS", b"\x00")
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    open(path, "wb").write(png)


def tiles_to_pixels(data, wt, ht):
    """Column-major 2bpp tiles -> list of palette indices."""
    w, h = wt * 8, ht * 8
    px = [0] * (w * h)
    for t in range(wt * ht):
        tx, ty = t // ht, t % ht
        tile = data[t * 16:(t + 1) * 16]
        if len(tile) < 16:
            break
        for row in range(8):
            lo, hi = tile[row * 2], tile[row * 2 + 1]
            for col in range(8):
                bit = 7 - col
                px[(ty * 8 + row) * w + tx * 8 + col] = ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1)
    return px


def main(rom_path, disasm, out_dir):
    rom = open(rom_path, "rb").read()
    if hashlib.sha1(rom).hexdigest() != EXPECTED_SHA1:
        sys.exit("not Crystal UE v1.0")
    syms = {}
    for line in open(f"{disasm}/pokecrystal.sym"):
        m = re.match(r"([0-9a-f]{2}):([0-9a-f]{4}) (\S+)", line)
        if m:
            bank, addr = int(m[1], 16), int(m[2], 16)
            syms[m[3]] = addr if bank == 0 else bank * 0x4000 + (addr - 0x4000)
    labels = re.findall(r"dba_pics\s*(\w*)(?:,\s*(\w+))?", open(f"{disasm}/data/pokemon/pic_pointers.asm").read())
    base = syms["BaseData"]
    os.makedirs(f"{out_dir}/back", exist_ok=True)
    count = 0
    for i in range(251):
        dex = i + 1
        front, back = labels[i]
        if dex == 201:
            front, back = "UnownAFrontpic", "UnownABackpic"
        size = rom[base + i * 32 + 17]
        wt, ht = size >> 4, size & 15
        p = syms["PokemonPalettes"] + dex * 8
        pal = [(255, 255, 255), rgb555(rom[p], rom[p + 1]), rgb555(rom[p + 2], rom[p + 3]), (0, 0, 0)]
        fdata = lz_decompress(rom, syms[front])
        write_png(f"{out_dir}/{dex}.png", wt * 8, ht * 8, tiles_to_pixels(fdata, wt, ht), pal)
        bdata = lz_decompress(rom, syms[back])
        write_png(f"{out_dir}/back/{dex}.png", 48, 48, tiles_to_pixels(bdata, 6, 6), pal)
        count += 1
    # The Gym's trainers: pic labels in TrainerPicPointers order (data/trainers/pic_pointers.asm),
    # palette index = trainer class (index 0 is the player). All are 7x7 tiles.
    tp = syms["TrainerPalettes"]
    pics = re.findall(r"dba_pic (\w+)", open(f"{disasm}/data/trainers/pic_pointers.asm").read())
    for key, cls in {"red": 0x3F, "will": 0x0B, "bruno": 0x0D, "karen": 0x0E, "koga": 0x0F, "lance": 0x10}.items():
        pal = [(255, 255, 255), rgb555(rom[tp + cls * 4], rom[tp + cls * 4 + 1]),
               rgb555(rom[tp + cls * 4 + 2], rom[tp + cls * 4 + 3]), (0, 0, 0)]
        pic = syms[pics[cls - 1]]
        write_png(f"{out_dir}/{key}.png", 56, 56, tiles_to_pixels(lz_decompress(rom, pic), 7, 7), pal)
    chris_pal = [(255, 255, 255), rgb555(rom[tp], rom[tp + 1]), rgb555(rom[tp + 2], rom[tp + 3]), (0, 0, 0)]
    write_png(f"{out_dir}/back/player.png", 48, 48, tiles_to_pixels(lz_decompress(rom, syms["ChrisBackpic"]), 6, 6), chris_pal)
    print(f"wrote {count} front+back pics, 6 trainer pics, back/player.png to {out_dir}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
