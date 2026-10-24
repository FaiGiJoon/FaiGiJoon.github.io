// Minimal SM83 (Game Boy CPU) interpreter used only as a local test oracle: it runs routines
// from the user's own ROM so the JS ports can be compared against the real code. Never shipped
// to the browser. Memory: ROM with MBC3-style bank switching, CGB-banked WRAM, HRAM, raw I/O.

export class SM83 {
  constructor(rom) {
    this.rom = rom;
    this.bank = 1;
    this.wram = new Uint8Array(0x8000); // 8 banks of 4 KiB
    this.svbk = 1;
    this.hram = new Uint8Array(0x100); // $ff00-$ffff (I/O + HRAM)
    this.vram = new Uint8Array(0x4000);
    this.a = 0; this.f = 0; this.b = 0; this.c = 0; this.d = 0; this.e = 0; this.h = 0; this.l = 0;
    this.sp = 0xdffe; this.pc = 0;
  }

  wramIndex(addr) {
    if (addr < 0xd000) return addr - 0xc000;
    return (this.svbk || 1) * 0x1000 + addr - 0xd000;
  }

  rb(addr) {
    addr &= 0xffff;
    if (addr < 0x4000) return this.rom[addr];
    if (addr < 0x8000) return this.rom[this.bank * 0x4000 + addr - 0x4000];
    if (addr < 0xa000) return this.vram[addr - 0x8000];
    if (addr < 0xc000) return 0xff;
    if (addr < 0xe000) return this.wram[this.wramIndex(addr)];
    if (addr < 0xfe00) return this.wram[this.wramIndex(addr - 0x2000)];
    if (addr >= 0xff00) return addr === 0xff70 ? this.svbk : this.hram[addr - 0xff00];
    return 0xff;
  }

  wb(addr, v) {
    addr &= 0xffff; v &= 0xff;
    if (addr < 0x8000) { if (addr >= 0x2000 && addr < 0x4000) this.bank = v || 1; return; }
    if (addr < 0xa000) { this.vram[addr - 0x8000] = v; return; }
    if (addr < 0xc000) return;
    if (addr < 0xe000) { this.wram[this.wramIndex(addr)] = v; return; }
    if (addr >= 0xff00) { if (addr === 0xff70) this.svbk = v & 7; else this.hram[addr - 0xff00] = v; }
  }

  rw(addr) { return this.rb(addr) | (this.rb(addr + 1) << 8); }
  ww(addr, v) { this.wb(addr, v & 0xff); this.wb(addr + 1, v >> 8); }

  get bc() { return (this.b << 8) | this.c; } set bc(v) { this.b = (v >> 8) & 0xff; this.c = v & 0xff; }
  get de() { return (this.d << 8) | this.e; } set de(v) { this.d = (v >> 8) & 0xff; this.e = v & 0xff; }
  get hl() { return (this.h << 8) | this.l; } set hl(v) { this.h = (v >> 8) & 0xff; this.l = v & 0xff; }
  get af() { return (this.a << 8) | this.f; } set af(v) { this.a = (v >> 8) & 0xff; this.f = v & 0xf0; }

  get fz() { return (this.f >> 7) & 1; } get fn() { return (this.f >> 6) & 1; }
  get fh() { return (this.f >> 5) & 1; } get fc() { return (this.f >> 4) & 1; }
  setF(z, n, h, c) { this.f = (z ? 0x80 : 0) | (n ? 0x40 : 0) | (h ? 0x20 : 0) | (c ? 0x10 : 0); }

  imm8() { const v = this.rb(this.pc); this.pc = (this.pc + 1) & 0xffff; return v; }
  imm16() { const v = this.rw(this.pc); this.pc = (this.pc + 2) & 0xffff; return v; }
  push(v) { this.sp = (this.sp - 2) & 0xffff; this.ww(this.sp, v); }
  pop() { const v = this.rw(this.sp); this.sp = (this.sp + 2) & 0xffff; return v; }

  // r8 index: 0 b, 1 c, 2 d, 3 e, 4 h, 5 l, 6 (hl), 7 a
  getR(i) {
    switch (i) {
      case 0: return this.b; case 1: return this.c; case 2: return this.d; case 3: return this.e;
      case 4: return this.h; case 5: return this.l; case 6: return this.rb(this.hl); default: return this.a;
    }
  }

  setR(i, v) {
    v &= 0xff;
    switch (i) {
      case 0: this.b = v; break; case 1: this.c = v; break; case 2: this.d = v; break; case 3: this.e = v; break;
      case 4: this.h = v; break; case 5: this.l = v; break; case 6: this.wb(this.hl, v); break; default: this.a = v;
    }
  }

  getRR(i) { return [this.bc, this.de, this.hl, this.sp][i]; }
  setRR(i, v) { v &= 0xffff; if (i === 0) this.bc = v; else if (i === 1) this.de = v; else if (i === 2) this.hl = v; else this.sp = v; }
  cond(i) { return [!this.fz, this.fz, !this.fc, this.fc][i]; }

  alu(op, v) {
    const a = this.a;
    switch (op) {
      case 0: { const r = a + v; this.setF(!(r & 0xff), 0, (a & 15) + (v & 15) > 15, r > 0xff); this.a = r & 0xff; break; }
      case 1: { const c = this.fc; const r = a + v + c; this.setF(!(r & 0xff), 0, (a & 15) + (v & 15) + c > 15, r > 0xff); this.a = r & 0xff; break; }
      case 2: { const r = a - v; this.setF(!(r & 0xff), 1, (a & 15) < (v & 15), r < 0); this.a = r & 0xff; break; }
      case 3: { const c = this.fc; const r = a - v - c; this.setF(!(r & 0xff), 1, (a & 15) < (v & 15) + c, r < 0); this.a = r & 0xff; break; }
      case 4: this.a = a & v; this.setF(!this.a, 0, 1, 0); break;
      case 5: this.a = a ^ v; this.setF(!this.a, 0, 0, 0); break;
      case 6: this.a = a | v; this.setF(!this.a, 0, 0, 0); break;
      default: { const r = a - v; this.setF(!(r & 0xff), 1, (a & 15) < (v & 15), r < 0); }
    }
  }

  cb() {
    const op = this.imm8();
    const r = op & 7; const y = (op >> 3) & 7; let v = this.getR(r);
    switch (op >> 6) {
      case 0: {
        let c;
        switch (y) {
          case 0: c = v >> 7; v = ((v << 1) | c) & 0xff; break; // rlc
          case 1: c = v & 1; v = (v >> 1) | (c << 7); break; // rrc
          case 2: c = v >> 7; v = ((v << 1) | this.fc) & 0xff; break; // rl
          case 3: c = v & 1; v = (v >> 1) | (this.fc << 7); break; // rr
          case 4: c = v >> 7; v = (v << 1) & 0xff; break; // sla
          case 5: c = v & 1; v = (v >> 1) | (v & 0x80); break; // sra
          case 6: c = 0; v = ((v << 4) | (v >> 4)) & 0xff; break; // swap
          default: c = v & 1; v >>= 1; // srl
        }
        this.setF(!v, 0, 0, c);
        this.setR(r, v);
        break;
      }
      case 1: this.f = (this.f & 0x10) | 0x20 | ((v >> y) & 1 ? 0 : 0x80); break; // bit
      case 2: this.setR(r, v & ~(1 << y)); break; // res
      default: this.setR(r, v | (1 << y)); // set
    }
  }

  step() {
    const op = this.imm8();
    if (op >= 0x40 && op < 0x80) {
      if (op === 0x76) throw new Error('halt');
      this.setR((op >> 3) & 7, this.getR(op & 7));
      return;
    }
    if (op >= 0x80 && op < 0xc0) { this.alu((op >> 3) & 7, this.getR(op & 7)); return; }
    switch (op) {
      case 0x00: return;
      case 0x01: case 0x11: case 0x21: case 0x31: this.setRR(op >> 4, this.imm16()); return;
      case 0x02: this.wb(this.bc, this.a); return;
      case 0x12: this.wb(this.de, this.a); return;
      case 0x22: this.wb(this.hl, this.a); this.hl = this.hl + 1; return;
      case 0x32: this.wb(this.hl, this.a); this.hl = this.hl - 1; return;
      case 0x0a: this.a = this.rb(this.bc); return;
      case 0x1a: this.a = this.rb(this.de); return;
      case 0x2a: this.a = this.rb(this.hl); this.hl = this.hl + 1; return;
      case 0x3a: this.a = this.rb(this.hl); this.hl = this.hl - 1; return;
      case 0x03: case 0x13: case 0x23: case 0x33: this.setRR(op >> 4, this.getRR(op >> 4) + 1); return;
      case 0x0b: case 0x1b: case 0x2b: case 0x3b: this.setRR(op >> 4, this.getRR(op >> 4) - 1); return;
      case 0x09: case 0x19: case 0x29: case 0x39: {
        const hl = this.hl; const v = this.getRR(op >> 4); const r = hl + v;
        this.f = (this.f & 0x80) | ((hl & 0xfff) + (v & 0xfff) > 0xfff ? 0x20 : 0) | (r > 0xffff ? 0x10 : 0);
        this.hl = r & 0xffff;
        return;
      }
      case 0x08: this.ww(this.imm16(), this.sp); return;
      case 0x07: { const c = this.a >> 7; this.a = ((this.a << 1) | c) & 0xff; this.setF(0, 0, 0, c); return; }
      case 0x0f: { const c = this.a & 1; this.a = (this.a >> 1) | (c << 7); this.setF(0, 0, 0, c); return; }
      case 0x17: { const c = this.a >> 7; this.a = ((this.a << 1) | this.fc) & 0xff; this.setF(0, 0, 0, c); return; }
      case 0x1f: { const c = this.a & 1; this.a = (this.a >> 1) | (this.fc << 7); this.setF(0, 0, 0, c); return; }
      case 0x27: { // daa
        let a = this.a; let c = this.fc;
        if (!this.fn) {
          if (c || a > 0x99) { a += 0x60; c = 1; }
          if (this.fh || (a & 15) > 9) a += 6;
        } else {
          if (c) a -= 0x60;
          if (this.fh) a -= 6;
        }
        a &= 0xff;
        this.f = (a ? 0 : 0x80) | (this.f & 0x40) | (c ? 0x10 : 0);
        this.a = a;
        return;
      }
      case 0x2f: this.a ^= 0xff; this.f |= 0x60; return;
      case 0x37: this.f = (this.f & 0x80) | 0x10; return;
      case 0x3f: this.f = (this.f & 0x80) | (this.fc ? 0 : 0x10); return;
      case 0x18: { const d = (this.imm8() << 24) >> 24; this.pc = (this.pc + d) & 0xffff; return; }
      case 0x20: case 0x28: case 0x30: case 0x38: {
        const d = (this.imm8() << 24) >> 24;
        if (this.cond((op >> 3) & 3)) this.pc = (this.pc + d) & 0xffff;
        return;
      }
      case 0xc3: this.pc = this.imm16(); return;
      case 0xc2: case 0xca: case 0xd2: case 0xda: { const t = this.imm16(); if (this.cond((op >> 3) & 3)) this.pc = t; return; }
      case 0xe9: this.pc = this.hl; return;
      case 0xcd: { const t = this.imm16(); this.push(this.pc); this.pc = t; return; }
      case 0xc4: case 0xcc: case 0xd4: case 0xdc: {
        const t = this.imm16();
        if (this.cond((op >> 3) & 3)) { this.push(this.pc); this.pc = t; }
        return;
      }
      case 0xc9: case 0xd9: this.pc = this.pop(); return;
      case 0xc0: case 0xc8: case 0xd0: case 0xd8: if (this.cond((op >> 3) & 3)) this.pc = this.pop(); return;
      case 0xc7: case 0xcf: case 0xd7: case 0xdf: case 0xe7: case 0xef: case 0xf7: case 0xff:
        this.push(this.pc); this.pc = op & 0x38; return;
      case 0xc1: this.bc = this.pop(); return;
      case 0xd1: this.de = this.pop(); return;
      case 0xe1: this.hl = this.pop(); return;
      case 0xf1: this.af = this.pop(); return;
      case 0xc5: this.push(this.bc); return;
      case 0xd5: this.push(this.de); return;
      case 0xe5: this.push(this.hl); return;
      case 0xf5: this.push(this.af); return;
      case 0xc6: case 0xce: case 0xd6: case 0xde: case 0xe6: case 0xee: case 0xf6: case 0xfe:
        this.alu((op >> 3) & 7, this.imm8()); return;
      case 0xe0: this.wb(0xff00 + this.imm8(), this.a); return;
      case 0xf0: this.a = this.rb(0xff00 + this.imm8()); return;
      case 0xe2: this.wb(0xff00 + this.c, this.a); return;
      case 0xf2: this.a = this.rb(0xff00 + this.c); return;
      case 0xea: this.wb(this.imm16(), this.a); return;
      case 0xfa: this.a = this.rb(this.imm16()); return;
      case 0xe8: case 0xf8: {
        const d = (this.imm8() << 24) >> 24; const sp = this.sp; const r = (sp + d) & 0xffff;
        this.setF(0, 0, (sp & 15) + (d & 15) > 15, (sp & 0xff) + (d & 0xff) > 0xff);
        if (op === 0xe8) this.sp = r; else this.hl = r;
        return;
      }
      case 0xf9: this.sp = this.hl; return;
      case 0xf3: case 0xfb: return;
      case 0xcb: this.cb(); return;
      default: break;
    }
    const lo = op & 7;
    if (lo === 4 || lo === 5) { // inc/dec r8
      const r = (op >> 3) & 7; const v = this.getR(r);
      const n = lo === 4 ? (v + 1) & 0xff : (v - 1) & 0xff;
      this.f = (this.f & 0x10) | (n ? 0 : 0x80) | (lo === 5 ? 0x40 : 0)
        | ((lo === 4 ? (v & 15) === 15 : (v & 15) === 0) ? 0x20 : 0);
      this.setR(r, n);
      return;
    }
    if (lo === 6) { this.setR((op >> 3) & 7, this.imm8()); return; } // ld r, n
    throw new Error(`unknown opcode ${op.toString(16)} at ${(this.pc - 1).toString(16)}`);
  }

  // Calls addr (in ROM bank `bank`) and runs until it returns.
  call(bank, addr, maxSteps = 1e6) {
    this.bank = bank;
    const sp0 = this.sp;
    this.push(0xfffe); // sentinel return address
    this.pc = addr;
    for (let n = 0; n < maxSteps; n++) {
      if (this.pc === 0xfffe && this.sp === sp0) return;
      this.step();
    }
    throw new Error('routine did not return');
  }
}
