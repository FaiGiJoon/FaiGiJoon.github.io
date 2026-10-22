// AudioWorklet host for the GBSound core. Commands arrive via port.postMessage
// ({type: 'music' | 'stopMusic' | 'sfx' | 'cry' | 'mute', ...}, see GBSound.command).
import { GBSound } from './gbsound.js';

class GBSoundProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.core = new GBSound(options.processorOptions.audioData, sampleRate);
    this.port.onmessage = (ev) => {
      try { this.core.command(ev.data); } catch (err) { console.warn(err); }
    };
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out.length) return true;
    if (out.length >= 2) {
      this.core.render(out[0], out[1]);
    } else {
      if (!this.scratch || this.scratch.length !== out[0].length) this.scratch = new Float32Array(out[0].length);
      this.core.render(out[0], this.scratch);
    }
    return true;
  }
}

registerProcessor('gbsound', GBSoundProcessor);
