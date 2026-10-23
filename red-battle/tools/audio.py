"""Extract Crystal audio + battle-animation script data from the ROM.

Usage: python3 -I audio.py ROM DISASM OUT

Every byte is read from the ROM (sha1 f4cd194b...); the disassembly is used only
for the symbol map and constant names. Starting from the music, SFX, cries and
battle-animation entry points, the audio and animation byte streams are traced
the same way audio/engine.asm and engine/battle_anims/anim_commands.asm read
them (following jumps, calls, loops and conditional branches), and only the
reached byte ranges are written to `blocks`, addressed as (bank, addr).
"""
import hashlib, json, re, sys

EXPECTED_SHA1 = "f4cd194bdee0d04ca4eac29e09b8e4e9d818c133"

SFX_WANTED = {
    "readText2": "SFX_READ_TEXT_2", "ballPoof": "SFX_BALL_POOF", "faint": "SFX_FAINT",
    "damage": "SFX_DAMAGE", "superEffective": "SFX_SUPER_EFFECTIVE",
    "notVeryEffective": "SFX_NOT_VERY_EFFECTIVE", "fullHeal": "SFX_FULL_HEAL",
    "switchPokemon": "SFX_SWITCH_POKEMON",
}
SONGS = {"championBattle": "Music_ChampionBattle", "gymVictory": "Music_GymLeaderVictory"}

# Audio command parameter byte counts ($d0-$ff), see audio/engine.asm MusicCommands.
# $d8 (note_type) and $e3/$f0 (toggle_noise) depend on channel/state; handled in trace.
AUDIO_PARAMS = {0xd8: 2, 0xd9: 1, 0xda: 2, 0xdb: 1, 0xdc: 1, 0xdd: 1, 0xde: 1, 0xdf: 0,
                0xe0: 2, 0xe1: 2, 0xe2: 1, 0xe4: 1, 0xe5: 1, 0xe6: 2, 0xe7: 1, 0xe8: 1,
                0xe9: 1, 0xea: 2, 0xeb: 2, 0xec: 0, 0xed: 0, 0xee: 2, 0xef: 1, 0xfa: 1,
                0xfb: 3, 0xfc: 2, 0xfd: 3, 0xfe: 2, 0xff: 0}
for _c in range(0xd0, 0xd8):
    AUDIO_PARAMS[_c] = 0
for _c in range(0xf1, 0xfa):
    AUDIO_PARAMS[_c] = 0

ANIM_RET, ANIM_FIRST_CMD = 0xff, 0xd0


def camel(const):
    parts = const.lower().split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


def consts(path, prefix):
    """Names of `const PREFIX*` lines in order (files use a plain const_def 0)."""
    return re.findall(rf"^\s*const ({prefix}\w*)", open(path).read(), re.M)


def main(rom_path, disasm, out_path):
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
            assert addr < 0x4000, (bank, addr)
            return addr
        assert 0x4000 <= addr < 0x8000, f"{bank:02x}:{addr:04x} outside bank window"
        return bank * 0x4000 + addr - 0x4000

    reached = set()  # (bank, addr)

    def rd(bank, addr):
        reached.add((bank, addr))
        return rom[off(bank, addr)]

    def rdw(bank, addr):
        return rd(bank, addr) | rd(bank, addr + 1) << 8

    def bankof(name):
        return syms[name][0]

    AUDIO = bankof("Drumkits")  # engine bank: drumkits/samples are read from here

    # ---------- static tables ----------
    fb, fa = syms["FrequencyTable"]
    wb, wa = syms["WaveSamples"]
    db_, da = syms["Drumkits"]
    freq = [rdw(fb, fa + 2 * i) for i in range((wa - fa) // 2)]
    waves = []
    for i in range((da - wa) // 16):
        smp = []
        for j in range(16):
            b = rd(wb, wa + 16 * i + j)
            smp += [b >> 4, b & 15]
        waves.append(smp)

    # Drumkit pointer table: entries until the first kit begins.
    kit_ptrs = []
    while True:
        a = da + 2 * len(kit_ptrs)
        if kit_ptrs and a >= kit_ptrs[0]:
            break
        kit_ptrs.append(rdw(db_, a))
    # Each kit is 13 drum pointers (drum ids 0..12, GetNoiseSample indexes by pitch).
    # All kits are traced; they are tiny and this keeps the engine's lookups total.
    for k in kit_ptrs:
        for d in range(13):
            p = rdw(AUDIO, k + 2 * d)
            while rd(AUDIO, p) != 0xff:  # ReadNoiseSample: 3-byte entries, $ff ends
                rd(AUDIO, p + 1); rd(AUDIO, p + 2)
                p += 3
    drum_kits_used = set()

    # ---------- audio stream tracer ----------
    seen_states = set()

    def trace_channel(bank, addr, chan, sfx):
        """Follow one channel's byte stream; chan is 0..7, sfx = SOUND_SFX/SOUND_CRY set."""
        work = [(addr, sfx, False, None)]
        while work:
            pc, sfx_f, noise_f, ret = work.pop()
            noise_chan = (chan & 3) == 3
            while True:
                st = (bank, chan, pc, sfx_f, noise_f, ret)
                if st in seen_states:
                    break
                seen_states.add(st)
                b = rd(bank, pc)
                pc += 1
                if b < 0xd0:  # note
                    if sfx_f:  # ParseSFXOrCry: envelope, freq lo, (freq hi unless noise ch)
                        n = 2 if noise_chan else 3
                        for i in range(n):
                            rd(bank, pc + i)
                        pc += n
                    continue
                if b == 0xff:  # sound_ret
                    if ret is None:
                        break
                    pc, ret = ret, None
                    continue
                if b == 0xd8:
                    n = 1 if noise_chan else 2
                elif b in (0xe3, 0xf0):  # toggle_noise: param only when turning on
                    if noise_f:
                        noise_f = False
                        continue
                    noise_f = True
                    drum_kits_used.add(rd(bank, pc))
                    pc += 1
                    continue
                elif b == 0xdf:  # toggle_sfx
                    sfx_f = not sfx_f
                    continue
                else:
                    n = AUDIO_PARAMS[b]
                params = [rd(bank, pc + i) for i in range(n)]
                pc += n
                if b == 0xfc:  # sound_jump
                    pc = params[0] | params[1] << 8
                elif b == 0xfe:  # sound_call (single level: CHANNEL_LAST_MUSIC_ADDRESS)
                    ret, pc = pc, params[0] | params[1] << 8
                elif b == 0xfd:  # sound_loop count 0 = infinite
                    tgt = params[1] | params[2] << 8
                    if params[0] == 0:
                        pc = tgt
                    else:
                        work.append((tgt, sfx_f, noise_f, ret))
                elif b == 0xfb:  # sound_jump_if
                    work.append((params[1] | params[2] << 8, sfx_f, noise_f, ret))
                elif b == 0xee:  # unused conditional jump
                    work.append((params[0] | params[1] << 8, sfx_f, noise_f, ret))
                elif b == 0xea:  # restart_channel: pointer to a channel header (same bank)
                    h = params[0] | params[1] << 8
                    c = rd(bank, h) & 7
                    trace_channel(bank, rdw(bank, h + 1), c, sfx_f)

    def trace_header(bank, addr, sfx):
        first = rd(bank, addr)
        count = (first >> 6) + 1
        chans = []
        for i in range(count):
            c = rd(bank, addr + 3 * i) & 7
            chans.append(c + 1)
            trace_channel(bank, rdw(bank, addr + 3 * i + 1), c, sfx)
        return chans

    def table_entry(table, idx):
        tb, ta = syms[table]
        a = ta + 3 * idx
        return rd(tb, a), rdw(tb, a + 1)  # dba: bank byte, then address

    # ---------- songs ----------
    music_names = consts(f"{disasm}/constants/music_constants.asm", "MUSIC_")
    songs = {}
    for key, label in SONGS.items():
        bank, addr = syms[label]
        trace_header(bank, addr, False)
        songs[key] = {"bank": bank, "addr": addr}
    # Resolve the Music table entries too, so the engine can look songs up by id.
    for i, name in enumerate(music_names):
        if name in ("MUSIC_CHAMPION_BATTLE", "MUSIC_GYM_VICTORY"):
            b, a = table_entry("Music", i)
            key = "championBattle" if name == "MUSIC_CHAMPION_BATTLE" else "gymVictory"
            assert (b, a) == (songs[key]["bank"], songs[key]["addr"]), name
            songs[key]["id"] = i

    # ---------- SFX ----------
    sfx_names = consts(f"{disasm}/constants/sfx_constants.asm", "SFX_")
    sfx_ids = {}

    def add_sfx(idx):
        name = sfx_names[idx]
        if name not in sfx_ids:
            b, a = table_entry("SFX", idx)
            trace_header(b, a, True)
            sfx_ids[name] = {"id": idx, "bank": b, "addr": a}
        return sfx_ids[name]

    sfx = {k: dict(add_sfx(sfx_names.index(c))) for k, c in SFX_WANTED.items()}

    # ---------- cries ----------
    pb, pa = syms["PokemonCries"]
    cries, cry_headers = {}, {}
    for dex in range(1, 252):
        a = pa + 6 * (dex - 1)
        base, pitch, length = rdw(pb, a), rdw(pb, a + 2), rdw(pb, a + 4)
        pitch = pitch - 0x10000 if pitch >= 0x8000 else pitch
        cries[str(dex)] = {"base": base, "pitch": pitch, "length": length}
        if str(base) not in cry_headers:
            b, a2 = table_entry("Cries", base)
            trace_header(b, a2, True)  # PlayCry sets SOUND_CRY on every channel
            cry_headers[str(base)] = {"bank": b, "addr": a2}

    # ---------- battle animations ----------
    anim_cmd_names = consts(f"{disasm}/macros/scripts/battle_anims.asm", "anim_")
    anim_cmd_names = [n[: -len("_command")] for n in anim_cmd_names]
    assert len(anim_cmd_names) == 0x30, len(anim_cmd_names)
    macro_src = open(f"{disasm}/macros/scripts/battle_anims.asm").read()
    anim_commands = {}
    for i, name in enumerate(anim_cmd_names):
        body = re.search(rf"MACRO {name}\n(.*?)ENDM", macro_src, re.S)[1]
        # Count emitted bytes of the (non-legacy) form: first `if` branch only.
        body = re.sub(r"\telse\n.*?endc\n", "", body, flags=re.S)
        n = len(re.findall(r"^\s*db\b", body, re.M)) + 2 * len(re.findall(r"^\s*dw\b", body, re.M))
        anim_commands[0xd0 + i] = {"name": name, "length": n}
    for c, n in {0xd0: 5, 0xd2: 3, 0xe0: 3, 0xf0: 5, 0xfd: 4, 0xee: 4, 0xff: 1}.items():
        assert anim_commands[c]["length"] == n, (c, anim_commands[c])

    ab, aa = syms["BattleAnimations"]
    special_names = consts(f"{disasm}/constants/move_constants.asm", "ANIM_")
    first_special = 0x100  # ANIM_SWEET_SCENT_2 is $ff, ANIM_THROW_POKE_BALL $100
    assert special_names[0] == "ANIM_SWEET_SCENT_2"
    anims = {}
    anim_seen = set()

    def trace_anim(addr):
        work = [(addr, None)]
        while work:
            pc, parent = work.pop()
            while (pc, parent) not in anim_seen:
                anim_seen.add((pc, parent))
                b = rd(ab, pc)
                if b < ANIM_FIRST_CMD:  # anim_wait
                    pc += 1
                    continue
                n = anim_commands[b]["length"]
                p = [rd(ab, pc + i) for i in range(1, n)]
                pc += n
                if b == ANIM_RET:
                    if parent is None:
                        break
                    pc, parent = parent, None
                elif b == 0xe0:  # anim_sound duration/tracks, sfx id
                    add_sfx(p[1])
                elif b == 0xfc:  # anim_jump
                    pc = p[0] | p[1] << 8
                elif b == 0xfe:  # anim_call (single level: wBattleAnimParent)
                    parent, pc = pc, p[0] | p[1] << 8
                elif b == 0xfd:  # anim_loop count 0 = perpetual
                    tgt = p[1] | p[2] << 8
                    if p[0] == 0:
                        pc = tgt
                    else:
                        work.append((tgt, parent))
                elif b == 0xef:  # anim_jumpuntil
                    work.append((p[0] | p[1] << 8, parent))
                elif b in (0xee, 0xf8, 0xfb):  # if_param_and / if_param_equal / if_var_equal
                    work.append((p[1] | p[2] << 8, parent))

    def anim_entry(idx):
        a = rdw(ab, aa + 2 * idx)
        trace_anim(a)
        return {"bank": ab, "addr": a}

    for move in range(1, 252):
        anims[str(move)] = anim_entry(move)
    for k, name in enumerate(special_names[1:]):
        anims[camel(name[len("ANIM_"):])] = anim_entry(first_special + k)

    bg_effects = consts(f"{disasm}/constants/battle_anim_constants.asm", "BATTLE_BG_EFFECT_")

    # ---------- blocks ----------
    blocks, cur = [], None
    for bank, addr in sorted(reached):
        if cur and cur[0] == bank and cur[1] + cur[2] == addr:
            cur[2] += 1
        else:
            cur = [bank, addr, 1]
            blocks.append(cur)
    blocks = [{"bank": b, "addr": a, "hex": rom[off(b, a): off(b, a) + n].hex()}
              for b, a, n in blocks]

    out = {
        "source": {"sha1": sha1},
        "frequencyTable": freq,
        "waveSamples": waves,
        "drumkits": [{"bank": AUDIO, "addr": k} for k in kit_ptrs],
        "drumkitsUsed": sorted(drum_kits_used),
        "songs": songs,
        "sfx": sfx,
        "cries": cries,
        "cryHeaders": cry_headers,
        "anims": anims,
        "animCommands": {str(c): v for c, v in anim_commands.items()},
        "sfxIds": sfx_ids,
        "bgEffects": bg_effects,
        "blocks": blocks,
    }
    with open(out_path, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    total = sum(len(b["hex"]) // 2 for b in blocks)
    print(f"{len(blocks)} blocks, {total} bytes; {len(sfx_ids)} sfx, "
          f"{len(cry_headers)} cry headers, {len(anims)} anims, kits used {sorted(drum_kits_used)}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
