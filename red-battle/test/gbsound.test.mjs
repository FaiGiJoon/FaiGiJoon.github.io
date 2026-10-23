import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GBSound } from '../gbsound.js';

const audio = JSON.parse(readFileSync(new URL('../audio.json', import.meta.url)));
const SR = 8000;

function render(sound, seconds, sr = SR) {
  const left = new Float32Array(Math.round(sr * seconds));
  const right = new Float32Array(left.length);
  sound.render(left, right);
  return { left, right };
}

const rms = (buf) => Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
const peak = (buf) => buf.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

test('championBattle is audible on both pulse channels and the wave channel', () => {
  for (const mask of [1, 2, 4]) {
    const s = new GBSound(audio, SR, { channelMask: mask });
    s.playMusic('championBattle');
    const { left, right } = render(s, 5);
    assert.ok(rms(left) > 0.01 && rms(right) > 0.01, `channel mask ${mask} is silent`);
    assert.equal(s.badReads, 0);
  }
});

test('championBattle loops for 300 s with channels still active and a sane level', () => {
  const s = new GBSound(audio, SR);
  s.playMusic('championBattle');
  let max = 0;
  let last = null;
  for (let t = 0; t < 300; t += 10) {
    last = render(s, 10);
    max = Math.max(max, peak(last.left), peak(last.right));
  }
  assert.deepEqual(s.channels.slice(0, 3).map((c) => c.on), [true, true, true]);
  assert.ok(rms(last.left) > 0.02, 'music has gone quiet');
  assert.ok(max < 0.8 && Number.isFinite(max), `peak ${max}`);
  assert.equal(s.badReads, 0);
});

// A one-note song in a scratch bank: tempo $100, volume 7,7, note_type 12 (no fade), then
// `note A_, 16` looping forever, on hardware channel `chan` (0 = pulse 1, 2 = wave).
function testSong(chan, octaveCmd, extra) {
  const script = [0xda, 0x01, 0x00, 0xe5, 0x77, ...extra, 0xd8, 0x0c, chan === 2 ? 0x10 : 0xa0,
    octaveCmd, 0xaf, 0xfc, 0x00, 0x00];
  const noteAddr = 0x4003 + script.length - 4;
  script[script.length - 2] = noteAddr & 0xff;
  script[script.length - 1] = noteAddr >> 8;
  const bytes = [chan, 0x03, 0x40, ...script];
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return {
    ...audio,
    songs: { test: { bank: 0x7f, addr: 0x4000, id: 0 } },
    blocks: [...audio.blocks, { bank: 0x7f, addr: 0x4000, hex }],
  };
}

function measuredHz(buf, sr) {
  let crossings = 0;
  for (let i = 1; i < buf.length; i++) if (buf[i - 1] < 0 && buf[i] >= 0) crossings++;
  return crossings * sr / buf.length;
}

// GetFrequency, independently: FrequencyTable word >> (7 - octave), arithmetic, 11 bits
const freqReg = (pitch, octave) => ((audio.frequencyTable[pitch] << 16) >> 16 >> (7 - octave)) & 0x7ff;

test('a held pulse note has the period of its FrequencyTable entry', () => {
  const sr = 48000;
  const s = new GBSound(testSong(0, 0xd4, [0xdb, 0x02]), sr, { channelMask: 1 }); // octave 4, duty 50%
  s.playMusic('test');
  render(s, 0.2, sr);
  const hz = measuredHz(render(s, 1, sr).left, sr);
  const want = 131072 / (2048 - freqReg(10, 4));
  assert.ok(Math.abs(hz - want) / want < 0.005, `pulse ${hz} Hz, want ${want}`);
});

test('a held wave note has the period of its FrequencyTable entry', () => {
  const sr = 48000;
  const s = new GBSound(testSong(2, 0xd3, []), sr, { channelMask: 4 }); // octave 3, wave 0
  s.playMusic('test');
  render(s, 0.2, sr);
  const hz = measuredHz(render(s, 1, sr).left, sr);
  const want = 65536 / (2048 - freqReg(10, 3));
  assert.ok(Math.abs(hz - want) / want < 0.005, `wave ${hz} Hz, want ${want}`);
});

function playUntilDone(s, start, limit = 30) {
  start();
  let t = 0;
  while (s.isSfxPlaying()) {
    render(s, 0.25);
    t += 0.25;
    assert.ok(t < limit, 'did not terminate');
  }
  return t;
}

test('every SFX renders, terminates and leaves the music playing', () => {
  const s = new GBSound(audio, SR);
  s.playMusic('championBattle');
  render(s, 0.5);
  const names = [...Object.keys(audio.sfx), ...Object.keys(audio.sfxIds)];
  for (const name of names) {
    const audible = [];
    playUntilDone(s, () => {
      assert.equal(s.playSfx(name), true);
      const buf = render(s, 0.1);
      audible.push(peak(buf.left) + peak(buf.right));
    });
    assert.deepEqual(s.channels.slice(0, 3).map((c) => c.on), [true, true, true], name);
    assert.ok(audible[0] > 0, `${name} is silent`);
  }
  assert.ok(rms(render(s, 3).left) > 0.02, 'music did not come back');
  assert.equal(s.badReads, 0);
});

test('panned (anim_sound) SFX play on one side', () => {
  const s = new GBSound(audio, SR, { channelMask: 1 }); // SFX_THUNDERSHOCK uses channel 5
  s.playSfx('SFX_THUNDERSHOCK', { pan: 'left' });
  const { left, right } = render(s, 0.3);
  assert.ok(rms(left) > 0.01);
  assert.equal(peak(right), 0);
});

test('cries render, terminate, restore the volume and leave the music playing', () => {
  const s = new GBSound(audio, SR);
  s.playMusic('championBattle');
  render(s, 0.5);
  for (const dex of [1, 6, 25, 3, 9, 65, 131, 143, 150, 196, 197, 248, 249, 250, 251]) {
    const volume = s.volume;
    let loud = 0;
    playUntilDone(s, () => {
      s.playCry(dex);
      assert.equal(s.sfxPriority, 1);
      loud = rms(render(s, 0.2).left);
    }, 10);
    assert.ok(loud > 0.01, `cry ${dex} is silent`);
    assert.equal(s.volume, volume, `cry ${dex} volume`);
    assert.equal(s.sfxPriority, 0);
    assert.deepEqual(s.channels.slice(0, 3).map((c) => c.on), [true, true, true]);
  }
  assert.ok(rms(render(s, 3).left) > 0.02, 'music did not come back');
  assert.equal(s.badReads, 0);
});

test('the cry pitch is applied as a 16-bit pitch offset', () => {
  const s = new GBSound(audio, SR);
  s.playCry(6); // pitch is negative in the data
  assert.equal(s.channels[4].pitchOffset, audio.cries[6].pitch & 0xffff);
  assert.equal(s.channels[4].tempo, audio.cries[6].length);
});

test('mute produces zeros', () => {
  const s = new GBSound(audio, SR);
  s.playMusic('championBattle');
  s.setMuted(true);
  const { left, right } = render(s, 2);
  assert.equal(peak(left) + peak(right), 0);
  s.setMuted(false);
  assert.ok(rms(render(s, 2).left) > 0.01);
});
