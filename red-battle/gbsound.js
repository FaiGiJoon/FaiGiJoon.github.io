// Game Boy sound for Battle Red: a port of pret/pokecrystal audio/engine.asm (per-frame
// music/SFX/cry sequencer) driving a sample-level model of the GB APU. All song, SFX and cry
// data is read as (bank, addr) from the ROM blocks in audio.json (tools/audio.py).
// Usable in Node (GBSound) and in the browser through createGameAudio().

const CPU_HZ = 4194304;
const FRAME_CYCLES = 70224; // one _UpdateSound call per video frame, 59.7275 Hz
const SEQ_CYCLES = 8192; // 512 Hz APU frame sequencer
const MAX_VOLUME = 0x77;
const LR_TRACKS = [0x11, 0x22, 0x44, 0x88]; // MonoTracks / StereoTracks
const PAN = { left: 0xf0, right: 0x0f };
const GAIN = 0.15; // 4 full-scale channels -> peak 0.6
const MAX_PARSE = 4096;

// CHANNEL_NOTE_FLAGS bits (constants/audio_constants.asm)
const NOTE_DUTY_OVERRIDE = 1 << 0;
const NOTE_FREQ_OVERRIDE = 1 << 1;
const NOTE_PITCH_SWEEP = 1 << 3;
const NOTE_NOISE_SAMPLING = 1 << 4;
const NOTE_REST = 1 << 5;
const NOTE_VIBRATO_OVERRIDE = 1 << 6;

// APU registers
const NR10 = 0xff10; const NR11 = 0xff11; const NR12 = 0xff12; const NR13 = 0xff13; const NR14 = 0xff14;
const NR21 = 0xff16; const NR22 = 0xff17; const NR23 = 0xff18; const NR24 = 0xff19;
const NR30 = 0xff1a; const NR31 = 0xff1b; const NR32 = 0xff1c; const NR33 = 0xff1d; const NR34 = 0xff1e;
const NR41 = 0xff20; const NR42 = 0xff21; const NR43 = 0xff22; const NR44 = 0xff23;
const NR50 = 0xff24; const NR51 = 0xff25;
const AUD_RAM = [0xff10, 0xff15, 0xff1a, 0xff1f];

// ---------- APU ----------
const DUTY = [
  [-1, -1, -1, -1, -1, -1, -1, 1], [1, -1, -1, -1, -1, -1, -1, 1],
  [1, -1, -1, -1, -1, 1, 1, 1], [-1, 1, 1, 1, 1, 1, 1, -1]];
const cumulative = (v) => {
  const c = new Float64Array(v.length + 1);
  for (let i = 0; i < v.length; i++) c[i + 1] = c[i] + v[i];
  return c;
};
const DUTY_CUM = DUTY.map(cumulative);

// Integral of a periodic step waveform (n steps, cumulative table cum) from 0 to x steps.
// Averaging over each output sample band-limits the square/wave outputs (box filter).
function integral(cum, n, x) {
  const k = Math.floor(x / n);
  const r = x - k * n;
  let i = r | 0;
  if (i >= n) i = n - 1;
  return k * cum[n] + cum[i] + (r - i) * (cum[i + 1] - cum[i]);
}

const newVoice = (maxLength) => ({
  on: false, dac: false, length: 0, maxLength, lengthEnable: false, nrx2: 0,
  vol: 0, envUp: false, envPeriod: 0, envTimer: 0, freq: 0, duty: 0, phase: 0,
});

class APU {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.sq = [newVoice(64), newVoice(64)];
    this.wave = Object.assign(newVoice(256), { level: 0, ram: new Uint8Array(16), cum: null });
    this.noise = Object.assign(newVoice(64), { poly: 0, lfsr: 0x7fff, clk: 0 });
    this.sweep = { period: 0, neg: false, shift: 0, timer: 0, shadow: 0, enabled: false };
    this.nr50 = 0;
    this.nr51 = 0;
    this.seq = 0;
    this.mask = 0xf;
    this.hpL = { x: 0, y: 0 };
    this.hpR = { x: 0, y: 0 };
    this.hpA = Math.exp(-2 * Math.PI * 20 / sampleRate);
    this.out = new Float64Array(4);
  }

  write(reg, v) {
    v &= 0xff;
    if (reg >= 0xff30 && reg <= 0xff3f) { this.wave.ram[reg - 0xff30] = v; this.wave.cum = null; return; }
    switch (reg) {
      case NR10: Object.assign(this.sweep, { period: (v >> 4) & 7, neg: !!(v & 8), shift: v & 7 }); break;
      case NR11: case NR21: { const c = this.sq[reg === NR11 ? 0 : 1]; c.duty = v >> 6; c.length = 64 - (v & 63); break; }
      case NR12: case NR22: case NR42: this.setEnvelope(reg === NR12 ? this.sq[0] : reg === NR22 ? this.sq[1] : this.noise, v); break;
      case NR13: case NR23: case NR33: {
        const c = reg === NR13 ? this.sq[0] : reg === NR23 ? this.sq[1] : this.wave;
        c.freq = (c.freq & 0x700) | v;
        break;
      }
      case NR14: case NR24: case NR34: case NR44: {
        const c = reg === NR14 ? this.sq[0] : reg === NR24 ? this.sq[1] : reg === NR34 ? this.wave : this.noise;
        if (reg !== NR44) c.freq = (c.freq & 0xff) | ((v & 7) << 8);
        c.lengthEnable = !!(v & 0x40);
        if (v & 0x80) this.trigger(c);
        break;
      }
      case NR30: this.wave.dac = !!(v & 0x80); if (!this.wave.dac) this.wave.on = false; break;
      case NR31: this.wave.length = 256 - v; break;
      case NR32: this.wave.level = (v >> 5) & 3; this.wave.cum = null; break;
      case NR41: this.noise.length = 64 - (v & 63); break;
      case NR43: this.noise.poly = v; break;
      case NR50: this.nr50 = v; break;
      case NR51: this.nr51 = v; break;
      default: break; // NR52 status bits are read-only; unused ports
    }
  }

  setEnvelope(c, v) {
    c.nrx2 = v;
    c.dac = (v & 0xf8) !== 0;
    if (!c.dac) c.on = false;
  }

  trigger(c) {
    c.on = c.dac;
    if (c.length === 0) c.length = c.maxLength;
    if (c === this.wave) { c.phase = 0; return; }
    c.vol = c.nrx2 >> 4;
    c.envUp = !!(c.nrx2 & 8);
    c.envPeriod = c.nrx2 & 7;
    c.envTimer = c.envPeriod;
    if (c === this.noise) { c.lfsr = 0x7fff; c.clk = 0; }
    if (c === this.sq[0]) {
      const s = this.sweep;
      s.shadow = c.freq;
      s.timer = s.period || 8;
      s.enabled = s.period > 0 || s.shift > 0;
      if (s.shift) this.sweepCalc();
    }
  }

  sweepCalc() {
    const s = this.sweep;
    const d = s.shadow >> s.shift;
    const f = s.neg ? s.shadow - d : s.shadow + d;
    if (f > 2047) this.sq[0].on = false;
    return f;
  }

  // 512 Hz frame sequencer: length 256 Hz, sweep 128 Hz, envelope 64 Hz
  step() {
    this.seq = (this.seq + 1) & 7;
    if (!(this.seq & 1)) {
      for (const c of [this.sq[0], this.sq[1], this.wave, this.noise]) {
        if (c.lengthEnable && c.length > 0 && --c.length === 0) c.on = false;
      }
    }
    if (this.seq === 2 || this.seq === 6) {
      const s = this.sweep;
      if (s.enabled && --s.timer <= 0) {
        s.timer = s.period || 8;
        if (s.period) {
          const f = this.sweepCalc();
          if (f <= 2047 && s.shift) {
            s.shadow = f;
            this.sq[0].freq = f;
            this.sweepCalc();
          }
        }
      }
    }
    if (this.seq === 7) {
      for (const c of [this.sq[0], this.sq[1], this.noise]) {
        if (!c.envPeriod) continue;
        if (--c.envTimer <= 0) {
          c.envTimer = c.envPeriod;
          if (c.envUp && c.vol < 15) c.vol++;
          else if (!c.envUp && c.vol > 0) c.vol--;
        }
      }
    }
  }

  pulse(c) {
    if (!c.on || c.vol === 0) return 0;
    const dp = 1048576 / (2048 - c.freq) / this.sampleRate; // 8 steps per 131072/(2048-x) Hz cycle
    const cum = DUTY_CUM[c.duty];
    const avg = (integral(cum, 8, c.phase + dp) - integral(cum, 8, c.phase)) / dp;
    c.phase = (c.phase + dp) % 8;
    return avg * c.vol / 15;
  }

  waveOut() {
    const c = this.wave;
    if (!c.on || c.level === 0) return 0;
    if (!c.cum) {
      const shift = c.level - 1;
      const mid = (15 >> shift) / 2;
      const v = new Float64Array(32);
      for (let i = 0; i < 32; i++) v[i] = (((c.ram[i >> 1] >> (i & 1 ? 0 : 4)) & 15) >> shift) - mid;
      c.cum = cumulative(v.map((x) => x / 7.5));
    }
    const dp = 2097152 / (2048 - c.freq) / this.sampleRate; // 32 samples per 65536/(2048-x) Hz cycle
    const avg = (integral(c.cum, 32, c.phase + dp) - integral(c.cum, 32, c.phase)) / dp;
    c.phase = (c.phase + dp) % 32;
    return avg;
  }

  noiseOut() {
    const c = this.noise;
    if (!c.on || (c.vol === 0 && !(c.envUp && c.envPeriod))) return 0;
    const s = c.poly >> 4;
    const r = c.poly & 7;
    const bit = () => ((c.lfsr & 1) ? -1 : 1);
    if (s >= 14) return c.vol ? bit() * c.vol / 15 : 0;
    const rate = (r ? 524288 / r : 1048576) / (2 << s);
    let left = rate / this.sampleRate;
    const total = left;
    let acc = 0;
    while (c.clk + left >= 1) {
      const seg = 1 - c.clk;
      acc += seg * bit();
      left -= seg;
      c.clk = 0;
      const x = (c.lfsr ^ (c.lfsr >> 1)) & 1;
      c.lfsr = (c.lfsr >> 1) | (x << 14);
      if (c.poly & 8) c.lfsr = (c.lfsr & ~0x40) | (x << 6);
    }
    acc += left * bit();
    c.clk += left;
    return c.vol ? acc / total * c.vol / 15 : 0;
  }

  // Produces one stereo sample into this.l / this.r
  mix() {
    const o = this.out;
    o[0] = this.mask & 1 ? this.pulse(this.sq[0]) : 0;
    o[1] = this.mask & 2 ? this.pulse(this.sq[1]) : 0;
    o[2] = this.mask & 4 ? this.waveOut() : 0;
    o[3] = this.mask & 8 ? this.noiseOut() : 0;
    let l = 0; let r = 0;
    for (let i = 0; i < 4; i++) {
      if (this.nr51 & (0x10 << i)) l += o[i];
      if (this.nr51 & (1 << i)) r += o[i];
    }
    l *= GAIN * (((this.nr50 >> 4) & 7) + 1) / 8;
    r *= GAIN * ((this.nr50 & 7) + 1) / 8;
    this.l = this.highpass(this.hpL, l);
    this.r = this.highpass(this.hpR, r);
  }

  highpass(h, x) {
    let y = x - h.x + this.hpA * h.y;
    if (Math.abs(y) < 1e-12) y = 0;
    h.x = x;
    h.y = y;
    return y > 1 ? 1 : y < -1 ? -1 : y;
  }
}

// ---------- engine (audio/engine.asm) ----------
const newChannel = () => ({
  musicId: 0, bank: 0,
  on: false, subroutine: false, looping: false, sfx: false, noise: false, cry: false, // FLAGS1
  vibrato: false, pitchSlide: false, dutyLoop: false, pitchOffsetOn: false, // FLAGS2
  vibratoDir: false, pitchSlideDir: false, // FLAGS3
  address: 0, lastAddress: 0, noteFlags: 0, condition: 0, dutyCycle: 0, volumeEnvelope: 0,
  frequency: 0, pitch: 0, octave: 0, transposition: 0, noteDuration: 0, noteDurationModifier: 0,
  loopCount: 0, tempo: 0x100, tracks: 0, dutyCyclePattern: 0, vibratoDelayCount: 0, vibratoDelay: 0,
  vibratoExtent: 0, vibratoRate: 0, pitchSlideTarget: 0, pitchSlideAmount: 0, pitchSlideAmountFraction: 0,
  field25: 0, pitchOffset: 0, noteLength: 1,
});

export class GBSound {
  constructor(audioData, sampleRate = 48000, opts = {}) {
    this.data = audioData;
    this.sampleRate = sampleRate;
    this.stereo = opts.stereo !== false; // wOptions STEREO
    this.apu = new APU(sampleRate);
    this.channelMask = opts.channelMask ?? 0xf;
    this.muted = false;
    this.badReads = 0;
    this.banks = new Map();
    for (const b of audioData.blocks) {
      if (!this.banks.has(b.bank)) this.banks.set(b.bank, { bytes: new Uint8Array(0x4000), valid: new Uint8Array(0x4000) });
      const m = this.banks.get(b.bank);
      for (let i = 0; i < b.hex.length / 2; i++) {
        const a = b.addr + i - 0x4000;
        m.bytes[a] = parseInt(b.hex.substr(i * 2, 2), 16);
        m.valid[a] = 1;
      }
    }
    this.drumBank = audioData.drumkits[0]?.bank ?? 0;
    this.cyclesPerSample = CPU_HZ / sampleRate;
    this.frameTimer = 0;
    this.seqTimer = 0;
    this.initSound();
  }

  get channelMask() { return this.apu.mask; }
  set channelMask(m) { this.apu.mask = m & 0xf; }

  read(bank, addr) {
    const m = this.banks.get(bank);
    const a = addr - 0x4000;
    if (!m || a < 0 || a >= 0x4000 || !m.valid[a]) { this.badReads++; return 0xff; }
    return m.bytes[a];
  }

  // _InitSound
  initSound() {
    for (const base of AUD_RAM) this.clearChannel(base);
    this.channels = Array.from({ length: 8 }, newChannel);
    this.curChannel = 0;
    this.volume = MAX_VOLUME;
    this.lastVolume = 0;
    this.sfxPriority = 0;
    this.soundOutput = 0;
    this.pitchSweep = 0;
    this.musicId = 0;
    this.musicBank = 0;
    this.curNoteDuration = 0;
    this.noiseSampleAddress = 0;
    this.noiseSampleDelay = 0;
    this.musicNoiseSampleSet = 0;
    this.sfxNoiseSampleSet = 0;
    this.jumpConditions = [0, 0, 0, 0];
    this.curSfx = 0;
    this.cryTracks = 0;
    this.stereoPanningMask = 0;
    this.curDuty = 0;
    this.curEnv = 0;
    this.curFreq = 0;
    this.apu.write(NR50, 0);
    this.apu.write(NR51, 0);
  }

  clearChannel(base) {
    this.apu.write(base, 0);
    this.apu.write(base + 1, 0);
    this.apu.write(base + 2, 0x08);
    this.apu.write(base + 3, 0);
    this.apu.write(base + 4, 0x80);
  }

  // ---- public API ----
  playMusic(name) {
    const song = this.data.songs[name];
    if (!song) throw new Error(`unknown song ${name}`);
    this.stopMusic();
    this.musicPlayed = name;
    this.playMusicHeader(song.id, song.bank, song.addr);
  }

  // Like PlayMusic(MUSIC_NONE), but only for the music channels: SFX and cries keep playing.
  stopMusic() {
    for (let i = 0; i < 4; i++) {
      const ch = this.channels[i];
      ch.on = false;
      if (!this.channels[i + 4].on) this.clearChannel(AUD_RAM[i]);
    }
    if (this.lastVolume) this.lastVolume = MAX_VOLUME; else this.volume = MAX_VOLUME;
  }

  // name: a key of audio.json sfx (e.g. 'damage') or an SFX constant (e.g. 'SFX_THUNDERSHOCK').
  // opts.pan ('left' | 'right' | NR51 mask) plays it like anim_sound (PlayStereoSFX, no priority
  // check); without pan it goes through PlaySFX, which drops it while a higher-priority
  // (lower id) SFX is playing, unless opts.force. Returns whether it started.
  playSfx(name, opts = {}) {
    const sfx = this.data.sfx[name] || this.data.sfxIds[name];
    if (!sfx) throw new Error(`unknown sfx ${name}`);
    if (opts.pan != null) {
      const mask = typeof opts.pan === 'number' ? opts.pan : PAN[opts.pan];
      if (this.stereo) this.playStereoSfxHeader(sfx, mask);
      else this.playSfxHeader(sfx);
      return true;
    }
    if (!opts.force && this.isSfxPlaying() && this.curSfx < sfx.id) return false;
    this.curSfx = sfx.id;
    this.playSfxHeader(sfx);
    return true;
  }

  // PlayCry: dex 1-251. opts.pitch / opts.length are added to the species values (as the
  // anim_cry command does); opts.tracks ('left' | 'right' | mask) pans it like an in-battle cry.
  playCry(dex, opts = {}) {
    const cry = this.data.cries[dex];
    if (!cry) throw new Error(`unknown cry ${dex}`);
    const header = this.data.cryHeaders[cry.base];
    const pitch = (cry.pitch + (opts.pitch || 0)) & 0xffff;
    const length = (cry.length + (opts.length || 0)) & 0xffff;
    if (opts.tracks != null) {
      this.cryTracks = typeof opts.tracks === 'number' ? opts.tracks : PAN[opts.tracks];
      this.stereoPanningMask = 1;
    } else {
      this.stereoPanningMask = 0;
    }
    this.playCryHeader(cry.base, header, pitch, length);
  }

  setMuted(m) { this.muted = !!m; }

  isSfxPlaying() {
    const c = this.channels;
    return c[4].on || c[5].on || c[6].on || c[7].on;
  }

  // Message dispatcher shared by the worklet and the ScriptProcessor fallback.
  command(msg) {
    switch (msg.type) {
      case 'music': this.playMusic(msg.name); break;
      case 'stopMusic': this.stopMusic(); break;
      case 'sfx': this.playSfx(msg.name, msg.opts); break;
      case 'cry': this.playCry(msg.dex, msg.opts); break;
      case 'mute': this.setMuted(msg.value); break;
      default: break;
    }
  }

  render(left, right) {
    const apu = this.apu;
    const cps = this.cyclesPerSample;
    for (let i = 0; i < left.length; i++) {
      while (this.frameTimer <= 0) { this.updateSound(); this.frameTimer += FRAME_CYCLES; }
      while (this.seqTimer <= 0) { apu.step(); this.seqTimer += SEQ_CYCLES; }
      apu.mix();
      this.frameTimer -= cps;
      this.seqTimer -= cps;
      left[i] = this.muted ? 0 : apu.l;
      right[i] = this.muted ? 0 : apu.r;
    }
  }

  // ---- entry points (audio/engine.asm) ----
  // _PlayMusic
  playMusicHeader(id, bank, addr) {
    this.musicId = id;
    this.musicBank = bank;
    const count = (this.read(bank, addr) >> 6) + 1;
    for (let i = 0; i < count; i++) {
      addr = this.loadChannel(addr);
      this.startChannel();
    }
    this.jumpConditions = [0, 0, 0, 0];
    this.noiseSampleAddress = 0;
    this.noiseSampleDelay = 0;
    this.musicNoiseSampleSet = 0;
  }

  // _PlayCry
  playCryHeader(id, header, pitch, length) {
    this.musicId = id;
    this.musicBank = header.bank;
    let addr = header.addr;
    const count = (this.read(header.bank, addr) >> 6) + 1;
    for (let i = 0; i < count; i++) {
      addr = this.loadChannel(addr);
      const ch = this.channels[this.curChannel];
      ch.cry = true;
      ch.pitchOffsetOn = true;
      ch.pitchOffset = pitch;
      if ((this.curChannel & 3) < 3) ch.tempo = length; // no tempo for channel 4
      this.startChannel();
      if (this.stereoPanningMask && this.stereo) ch.tracks &= this.cryTracks;
    }
    if (!this.lastVolume) {
      this.lastVolume = this.volume;
      this.volume = MAX_VOLUME;
    }
    this.sfxPriority = 1;
  }

  // _PlaySFX
  playSfxHeader(sfx) {
    const c = this.channels;
    if (c[4].on) {
      c[4].on = false;
      this.writeAll([[NR11, 0], [NR12, 8], [NR13, 0], [NR14, 0x80]]);
      this.pitchSweep = 0;
      this.apu.write(NR10, 0);
    }
    if (c[5].on) { c[5].on = false; this.writeAll([[NR21, 0], [NR22, 8], [NR23, 0], [NR24, 0x80]]); }
    if (c[6].on) { c[6].on = false; this.writeAll([[NR30, 0], [NR31, 0], [NR32, 8], [NR33, 0], [NR34, 0x80]]); }
    if (c[7].on) {
      c[7].on = false;
      this.writeAll([[NR41, 0], [NR42, 8], [NR43, 0], [NR44, 0x80]]);
      this.noiseSampleAddress = 0;
    }
    this.musicId = sfx.id;
    this.musicBank = sfx.bank;
    let addr = sfx.addr;
    const count = (this.read(sfx.bank, addr) >> 6) + 1;
    for (let i = 0; i < count; i++) {
      addr = this.loadChannel(addr);
      this.channels[this.curChannel].sfx = true;
      this.startChannel();
    }
    this.sfxPriority = 0;
  }

  // PlayStereoSFX (stereo on)
  playStereoSfxHeader(sfx, mask) {
    this.musicId = sfx.id;
    this.musicBank = sfx.bank;
    let addr = sfx.addr;
    const count = (this.read(sfx.bank, addr) >> 6) + 1;
    for (let i = 0; i < count; i++) {
      addr = this.loadChannel(addr);
      const ch = this.channels[this.curChannel];
      ch.sfx = true;
      ch.tracks = LR_TRACKS[this.curChannel & 3] & mask;
      ch.on = true;
    }
  }

  writeAll(pairs) { for (const [r, v] of pairs) this.apu.write(r, v); }

  loadChannel(addr) {
    const bank = this.musicBank;
    this.curChannel = this.read(bank, addr) & 7;
    const ch = this.channels[this.curChannel];
    Object.assign(ch, newChannel()); // res SOUND_CHANNEL_ON + ChannelInit
    ch.address = this.read(bank, addr + 1) | (this.read(bank, addr + 2) << 8);
    ch.musicId = this.musicId;
    ch.bank = bank;
    return addr + 3;
  }

  startChannel() {
    const ch = this.channels[this.curChannel];
    ch.tracks = LR_TRACKS[this.curChannel & 3];
    ch.on = true;
  }

  // ---- _UpdateSound ----
  updateSound() {
    this.soundOutput = 0;
    const chans = this.channels;
    for (let i = 0; i < 8; i++) {
      this.curChannel = i;
      const ch = chans[i];
      if (!ch.on) continue;
      if (ch.noteDuration >= 2) {
        ch.noteDuration--;
      } else {
        ch.vibratoDelayCount = ch.vibratoDelay;
        ch.pitchSlide = false;
        this.parseMusic(ch);
      }
      this.applyPitchSlide(ch);
      this.curDuty = ch.dutyCycle;
      this.curEnv = ch.volumeEnvelope;
      this.curFreq = ch.frequency;
      this.handleTrackVibrato(ch);
      this.handleNoise(ch);
      if (this.sfxPriority && i < 4 && this.isSfxPlaying()) ch.noteFlags |= NOTE_REST;
      if (i >= 4 || !chans[i + 4].on) {
        this.updateChannel(ch, i);
        this.soundOutput |= ch.tracks;
      }
      ch.noteFlags = 0;
    }
    this.apu.write(NR50, this.volume);
    this.apu.write(NR51, this.soundOutput);
  }

  // UpdateChannels: write the hardware registers for this frame
  updateChannel(ch, i) {
    const f = ch.noteFlags;
    const apu = this.apu;
    const lo = this.curFreq & 0xff;
    const hi = (this.curFreq >> 8) & 0xff;
    const duty = 0x3f | this.curDuty; // (rAUDxLEN & $3f) | duty, length bits read back as 1s
    switch (i & 3) {
      case 0:
        if (f & NOTE_PITCH_SWEEP) apu.write(NR10, this.pitchSweep);
        if (f & NOTE_REST) { this.clearChannel(AUD_RAM[0]); return; }
        if (f & NOTE_NOISE_SAMPLING) {
          this.writeAll([[NR11, duty], [NR12, this.curEnv], [NR13, lo], [NR14, hi | 0x80]]);
          return;
        }
        if (f & NOTE_FREQ_OVERRIDE) {
          apu.write(NR13, lo);
          apu.write(NR14, hi);
        } else if (f & NOTE_VIBRATO_OVERRIDE) {
          apu.write(NR11, duty);
          apu.write(NR13, lo);
          return;
        }
        if (f & NOTE_DUTY_OVERRIDE) apu.write(NR11, duty);
        return;
      case 1:
        if (f & NOTE_REST) { this.clearChannel(AUD_RAM[1]); return; }
        if (f & NOTE_NOISE_SAMPLING) {
          this.writeAll([[NR21, duty], [NR22, this.curEnv], [NR23, lo], [NR24, hi | 0x80]]);
        } else if (f & NOTE_VIBRATO_OVERRIDE) {
          apu.write(NR21, duty);
          apu.write(NR23, lo);
        } else if (f & NOTE_DUTY_OVERRIDE) {
          apu.write(NR21, duty);
        }
        return;
      case 2:
        if (f & NOTE_REST) { this.clearChannel(AUD_RAM[2]); return; }
        if (f & NOTE_NOISE_SAMPLING) {
          apu.write(NR31, 0x3f);
          apu.write(NR30, 0);
          const wave = this.data.waveSamples[this.curEnv & 0xf] || new Array(32).fill(0);
          for (let k = 0; k < 16; k++) apu.write(0xff30 + k, (wave[k * 2] << 4) | wave[k * 2 + 1]);
          apu.write(NR32, (this.curEnv & 0xf0) << 1);
          apu.write(NR30, 0x80);
          apu.write(NR33, lo);
          apu.write(NR34, hi | 0x80);
        } else if (f & NOTE_VIBRATO_OVERRIDE) {
          apu.write(NR33, lo);
        }
        return;
      default:
        if (f & NOTE_REST) { this.clearChannel(AUD_RAM[3]); return; }
        if (f & NOTE_NOISE_SAMPLING) {
          this.writeAll([[NR41, 0x3f], [NR42, this.curEnv], [NR43, lo], [NR44, 0x80]]);
        }
    }
  }

  getMusicByte(ch) {
    const v = this.read(ch.bank, ch.address);
    ch.address = (ch.address + 1) & 0xffff;
    this.curMusicByte = v;
    return v;
  }

  getMusicWord(ch) {
    const lo = this.getMusicByte(ch);
    return lo | (this.getMusicByte(ch) << 8);
  }

  parseMusic(ch) {
    for (let n = 0; n < MAX_PARSE; n++) {
      const b = this.getMusicByte(ch);
      if (b === 0xff && !ch.subroutine) { this.endChannel(ch); return; }
      if (b >= 0xd0) { this.musicCommand(ch, b); continue; }
      if (ch.sfx || ch.cry) { this.parseSfxOrCry(ch, b); return; }
      if (ch.noise) { this.getNoiseSample(ch, b); return; }
      this.setNoteDuration(ch, b & 0xf);
      const pitch = b >> 4;
      if (!pitch) { ch.noteFlags |= NOTE_REST; return; }
      ch.pitch = pitch;
      ch.frequency = this.getFrequency(ch, ch.octave, pitch);
      ch.noteFlags |= NOTE_NOISE_SAMPLING;
      this.loadNote(ch);
      return;
    }
    this.endChannel(ch); // runaway script (no note found): stop rather than hang
  }

  // ParseMusic.sound_ret
  endChannel(ch) {
    const i = this.curChannel;
    if (i >= 4 || !this.channels[i + 4].on) {
      if (ch.cry && i === 4) this.restoreVolume();
      if (i === 4) this.apu.write(NR10, 0);
    }
    ch.on = false;
    ch.noteFlags |= NOTE_REST;
    ch.musicId = 0;
    ch.bank = 0;
  }

  restoreVolume() {
    this.channels[5].pitchOffset = 0;
    this.channels[7].pitchOffset = 0;
    this.volume = this.lastVolume;
    this.lastVolume = 0;
    this.sfxPriority = 0;
  }

  parseSfxOrCry(ch, b) {
    ch.noteFlags |= NOTE_NOISE_SAMPLING;
    this.setNoteDuration(ch, b);
    ch.volumeEnvelope = this.getMusicByte(ch);
    ch.frequency = (ch.frequency & 0xff00) | this.getMusicByte(ch);
    if ((this.curChannel & 3) === 3) return;
    ch.frequency = (ch.frequency & 0xff) | (this.getMusicByte(ch) << 8);
  }

  getNoiseSample(ch, b) {
    if ((this.curChannel & 3) !== 3) return;
    this.setNoteDuration(ch, b & 0xf);
    let set;
    if (this.curChannel & 4) set = this.sfxNoiseSampleSet;
    else if (this.channels[7].on) return;
    else set = this.musicNoiseSampleSet;
    const kit = this.data.drumkits[set];
    const pitch = b >> 4;
    if (!pitch || !kit) return;
    const p = kit.addr + pitch * 2;
    this.noiseSampleAddress = this.read(kit.bank, p) | (this.read(kit.bank, p + 1) << 8);
    this.noiseSampleDelay = 0;
  }

  handleNoise(ch) {
    if (!ch.noise) return;
    if (!(this.curChannel & 4) && this.channels[7].on && this.channels[7].noise) return;
    if (this.noiseSampleDelay) { this.noiseSampleDelay--; return; }
    // ReadNoiseSample
    let a = this.noiseSampleAddress;
    if (!a) return;
    const b = this.read(this.drumBank, a++);
    if (b === 0xff) return;
    this.noiseSampleDelay = (b & 0xf) + 1;
    this.curEnv = this.read(this.drumBank, a++);
    this.curFreq = this.read(this.drumBank, a++);
    this.noiseSampleAddress = a;
    ch.noteFlags |= NOTE_NOISE_SAMPLING;
  }

  // SetNoteDuration: duration = (NoteLength * (n + 1)) * Tempo, carrying the low byte between notes
  setNoteDuration(ch, n) {
    const units = (n + 1) & 0xff;
    const a = (ch.noteLength * units) & 0xff;
    const hl = (ch.tempo * a + ch.noteDurationModifier) & 0xffff;
    ch.noteDurationModifier = hl & 0xff;
    ch.noteDuration = hl >> 8;
  }

  getFrequency(ch, octave, pitch) {
    let a = ((ch.transposition >> 4) + octave) & 0xff;
    const idx = (ch.transposition & 0xf) + pitch;
    let v = this.data.frequencyTable[idx] ?? 0;
    v = (v << 16) >> 16; // sra d / rr e works on the signed word
    while (a < 7) { v >>= 1; a++; }
    return v & 0x7ff;
  }

  setGlobalTempo(tempo) {
    const base = this.curChannel < 4 ? 0 : 4;
    for (let i = base; i < base + 4; i++) {
      this.channels[i].tempo = tempo & 0xffff;
      this.channels[i].noteDurationModifier = 0;
    }
  }

  loadNote(ch) {
    if (!ch.pitchSlide) return;
    let a = ch.noteDuration - this.curNoteDuration;
    if (a < 0) a = 1;
    this.curNoteDuration = a || 1; // 0 would make the division below loop forever on hardware
    const fl = ch.frequency & 0xff; const fh = ch.frequency >> 8;
    const tl = ch.pitchSlideTarget & 0xff; const th = ch.pitchSlideTarget >> 8;
    const borrow = fl < tl ? 1 : 0;
    let e; let d;
    if (((fh - borrow) & 0xff) < th) {
      ch.pitchSlideDir = true;
      e = (tl - fl) & 0xff;
      d = (th - ((fh - (tl < fl ? 1 : 0)) & 0xff)) & 0xff;
    } else {
      ch.pitchSlideDir = false;
      e = (fl - tl) & 0xff;
      d = (((fh - borrow) & 0xff) - th) & 0xff;
    }
    const cur = this.curNoteDuration;
    let b = 0;
    for (;;) {
      b = (b + 1) & 0xff;
      const carry = e < cur;
      e = (e - cur) & 0xff;
      if (carry) {
        if (d === 0) break;
        d--;
      }
    }
    ch.pitchSlideAmount = b;
    ch.pitchSlideAmountFraction = (e + cur) & 0xff;
    ch.field25 = 0;
  }

  applyPitchSlide(ch) {
    if (!ch.pitchSlide) return;
    let de = ch.frequency;
    const th = ch.pitchSlideTarget >> 8; const tl = ch.pitchSlideTarget & 0xff;
    let done;
    if (ch.pitchSlideDir) {
      de = (de + ch.pitchSlideAmount) & 0xffff;
      const sum = ch.pitchSlideAmountFraction + ch.field25;
      ch.field25 = sum & 0xff;
      de = (de + (sum >> 8)) & 0xffff;
      const d = de >> 8; const e = de & 0xff;
      done = th < d || (th === d && tl < e);
    } else {
      de = (de - ch.pitchSlideAmount) & 0xffff;
      const dbl = ch.pitchSlideAmountFraction * 2;
      ch.pitchSlideAmountFraction = dbl & 0xff;
      de = (de - (dbl >> 8)) & 0xffff;
      const d = de >> 8; const e = de & 0xff;
      done = d < th || (d === th && e < tl);
    }
    if (done) {
      ch.pitchSlide = false;
      ch.pitchSlideDir = false;
      return;
    }
    ch.frequency = de;
    ch.noteFlags |= NOTE_FREQ_OVERRIDE | NOTE_DUTY_OVERRIDE;
  }

  handleTrackVibrato(ch) {
    if (ch.dutyLoop) {
      const p = ch.dutyCyclePattern;
      ch.dutyCyclePattern = ((p << 2) | (p >> 6)) & 0xff;
      this.curDuty = ch.dutyCyclePattern & 0xc0;
      ch.noteFlags |= NOTE_DUTY_OVERRIDE;
    }
    if (ch.pitchOffsetOn) this.curFreq = (this.curFreq + ch.pitchOffset) & 0xffff;
    if (!ch.vibrato) return;
    if (ch.vibratoDelayCount) { ch.vibratoDelayCount--; return; }
    const extent = ch.vibratoExtent;
    if (!extent) return;
    if (ch.vibratoRate & 0xf) { ch.vibratoRate--; return; }
    const hiRate = ch.vibratoRate >> 4;
    ch.vibratoRate = (hiRate << 4) | hiRate;
    const e = this.curFreq & 0xff;
    let a;
    if (ch.vibratoDir) {
      ch.vibratoDir = false;
      a = e - (extent & 0xf);
      if (a < 0) a = 0;
    } else {
      ch.vibratoDir = true;
      a = e + (extent >> 4);
      if (a > 0xff) a = 0xff;
    }
    this.curFreq = (this.curFreq & 0xff00) | a;
    ch.noteFlags |= NOTE_VIBRATO_OVERRIDE;
  }

  // MusicCommands ($d0-$ff)
  musicCommand(ch, cmd) {
    if (cmd < 0xd8) { ch.octave = cmd & 7; return; }
    switch (cmd) {
      case 0xd8: // note_type
        ch.noteLength = this.getMusicByte(ch);
        if ((this.curChannel & 3) !== 3) ch.volumeEnvelope = this.getMusicByte(ch);
        break;
      case 0xd9: ch.transposition = this.getMusicByte(ch); break;
      case 0xda: { const hi = this.getMusicByte(ch); this.setGlobalTempo((hi << 8) | this.getMusicByte(ch)); break; }
      case 0xdb: ch.dutyCycle = (this.getMusicByte(ch) & 3) << 6; break;
      case 0xdc: ch.volumeEnvelope = this.getMusicByte(ch); break;
      case 0xdd: this.pitchSweep = this.getMusicByte(ch); ch.noteFlags |= NOTE_PITCH_SWEEP; break;
      case 0xde: { // duty_cycle_pattern
        ch.dutyLoop = true;
        const b = this.getMusicByte(ch);
        ch.dutyCyclePattern = ((b >> 2) | (b << 6)) & 0xff;
        ch.dutyCycle = ch.dutyCyclePattern & 0xc0;
        break;
      }
      case 0xdf: ch.sfx = !ch.sfx; break;
      case 0xe0: { // pitch_slide
        this.curNoteDuration = this.getMusicByte(ch);
        const b = this.getMusicByte(ch);
        ch.pitchSlideTarget = this.getFrequency(ch, b >> 4, b & 0xf);
        ch.pitchSlide = true;
        break;
      }
      case 0xe1: { // vibrato
        ch.vibrato = true;
        ch.vibratoDir = false;
        ch.vibratoDelay = ch.vibratoDelayCount = this.getMusicByte(ch);
        const b = this.getMusicByte(ch);
        const hi = b >> 4;
        ch.vibratoExtent = (((hi >> 1) + (hi & 1)) << 4) | (hi >> 1);
        ch.vibratoRate = ((b & 0xf) << 4) | (b & 0xf);
        break;
      }
      case 0xe2: case 0xe7: case 0xe8: this.getMusicByte(ch); break; // unused
      case 0xe3: // toggle_noise
        if (ch.noise) ch.noise = false;
        else { ch.noise = true; this.musicNoiseSampleSet = this.getMusicByte(ch); }
        break;
      case 0xe4: this.forceStereoPanning(ch); break;
      case 0xe5: this.volume = this.getMusicByte(ch); break;
      case 0xe6: { // pitch_offset (big-endian)
        ch.pitchOffsetOn = true;
        const hi = this.getMusicByte(ch);
        ch.pitchOffset = (hi << 8) | this.getMusicByte(ch);
        break;
      }
      case 0xe9: { // tempo_relative
        const b = this.getMusicByte(ch);
        this.setGlobalTempo(ch.tempo + (b >= 0x80 ? b - 0x100 : b));
        break;
      }
      case 0xea: { // restart_channel
        const ptr = this.getMusicWord(ch);
        const saved = this.curChannel;
        this.musicId = ch.musicId;
        this.musicBank = ch.bank;
        this.loadChannel(ptr);
        this.startChannel();
        this.curChannel = saved;
        break;
      }
      case 0xeb: this.getMusicWord(ch); break; // new_song: unused, no Music table here
      case 0xec: this.sfxPriority = 1; break;
      case 0xed: this.sfxPriority = 0; break;
      case 0xee: { // unused conditional jump on wChannelNJumpCondition
        const k = this.curChannel & 3;
        if (this.jumpConditions[k]) { this.jumpConditions[k] = 0; ch.address = this.getMusicWord(ch); } else ch.address += 2;
        break;
      }
      case 0xef: // stereo_panning
        if (this.stereo) this.forceStereoPanning(ch); else this.getMusicByte(ch);
        break;
      case 0xf0: // sfx_toggle_noise
        if (ch.noise) ch.noise = false;
        else { ch.noise = true; this.sfxNoiseSampleSet = this.getMusicByte(ch); }
        break;
      case 0xfa: ch.condition = this.getMusicByte(ch); break;
      case 0xfb: // sound_jump_if
        if (this.getMusicByte(ch) === ch.condition) ch.address = this.getMusicWord(ch);
        else ch.address += 2;
        break;
      case 0xfc: ch.address = this.getMusicWord(ch); break;
      case 0xfd: { // sound_loop
        const count = this.getMusicByte(ch);
        if (!ch.looping) {
          if (count === 0) { ch.address = this.getMusicWord(ch); break; }
          ch.looping = true;
          ch.loopCount = count - 1;
        }
        if (ch.loopCount === 0) { ch.looping = false; ch.address += 2; break; }
        ch.loopCount--;
        ch.address = this.getMusicWord(ch);
        break;
      }
      case 0xfe: { // sound_call
        const ptr = this.getMusicWord(ch);
        ch.lastAddress = ch.address;
        ch.address = ptr;
        ch.subroutine = true;
        break;
      }
      case 0xff: // sound_ret (only reached inside a subroutine)
        ch.subroutine = false;
        ch.address = ch.lastAddress;
        break;
      default: break; // $f1-$f9: nothing
    }
  }

  forceStereoPanning(ch) {
    ch.tracks = LR_TRACKS[this.curChannel & 3] & this.getMusicByte(ch);
  }
}

// ---------- browser wrapper ----------
let instance = null;

// Creates the AudioContext on first call (call it from a user gesture), loads audio.json (unless
// audioData is passed) and the AudioWorklet (ScriptProcessorNode fallback). Later calls return the
// same object. Before `ready` only the latest music and mute state are kept; SFX and cries are
// timed to the screen, so late ones are dropped.
export function createGameAudio({ audioUrl = new URL('./audio.json', import.meta.url), audioData = null } = {}) {
  if (instance) {
    if (instance.ctx.state === 'suspended') instance.ctx.resume();
    return instance;
  }
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  const ctx = new Ctx();
  let post = null;
  const pending = { music: null, mute: null };
  const send = (msg) => {
    if (ctx.state === 'suspended') ctx.resume();
    if (post) post(msg);
    else if (msg.type === 'mute') pending.mute = msg;
    else if (msg.type === 'music' || msg.type === 'stopMusic') pending.music = msg;
  };
  let gaveUp = false;
  const worklet = async (data) => {
    await ctx.audioWorklet.addModule(new URL('./gbsound-worklet.js', import.meta.url));
    if (gaveUp) return; // too late: the ScriptProcessor fallback already owns the output
    const node = new AudioWorkletNode(ctx, 'gbsound', {
      numberOfInputs: 0, outputChannelCount: [2], processorOptions: { audioData: data },
    });
    node.connect(ctx.destination);
    instance.node = node;
    post = (msg) => node.port.postMessage(msg);
  };
  const scriptProcessor = (data) => {
    const core = new GBSound(data, ctx.sampleRate);
    const node = ctx.createScriptProcessor(2048, 0, 2);
    node.onaudioprocess = (ev) => core.render(ev.outputBuffer.getChannelData(0), ev.outputBuffer.getChannelData(1));
    node.connect(ctx.destination);
    instance.node = node;
    post = (msg) => { try { core.command(msg); } catch (err) { console.warn(err); } };
  };
  instance = {
    ctx,
    node: null,
    ready: null,
    music: (name) => send({ type: 'music', name }),
    stopMusic: () => send({ type: 'stopMusic' }),
    sfx: (name, opts) => send({ type: 'sfx', name, opts }),
    cry: (dex, opts) => send({ type: 'cry', dex, opts }),
    setMuted: (value) => send({ type: 'mute', value: !!value }),
  };
  instance.ready = (async () => {
    const data = audioData || await (await fetch(audioUrl)).json();
    let ok = false;
    if (ctx.audioWorklet && globalThis.AudioWorkletNode) {
      // A worklet that never finishes loading would leave the game silent forever; give it 3 s.
      const stall = new Promise((_, reject) => setTimeout(() => reject(new Error('addModule timed out')), 3000));
      try { await Promise.race([worklet(data), stall]); ok = true; } catch (err) {
        gaveUp = true;
        console.warn('AudioWorklet failed, using ScriptProcessor:', err);
      }
    }
    if (!ok) scriptProcessor(data);
    for (const msg of [pending.mute, pending.music]) if (msg) post(msg);
  })();
  return instance;
}
