// Draws the animation objects (the shadow OAM from animobj.js) on a 160x96 canvas over the
// battle field, the way the CGB shows 8x8 sprites: 2bpp tiles, colour 0 transparent, OBJ palettes.

const rgb = (c) => [(c & 31) * 255 / 31, ((c >> 5) & 31) * 255 / 31, ((c >> 10) & 31) * 255 / 31].map(Math.round);
const WHITE = 0x7fff; const BLACK = 0;

export function createAnimCanvas(field) {
  const canvas = document.createElement('canvas');
  canvas.width = 160; canvas.height = 96;
  canvas.className = 'anim-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  field.appendChild(canvas);
  return canvas;
}

// OBJ palettes 0-7: enemy mon, player mon, then PAL_BATTLE_OB_GRAY..BROWN (BattleObjectPals)
export function objPalettes(objData, enemyDex, playerDex) {
  const mon = (dex) => {
    const [light, dark] = objData.monPals[dex] || [0x5294, 0x294a];
    return [WHITE, light, dark, BLACK];
  };
  return [mon(enemyDex), mon(playerDex), ...objData.obPals].map((p) => p.map(rgb));
}

// layers: [{objects, pals}], one per running animation
export function drawObjects(canvas, layers) {
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(160, 96);
  for (const { objects, pals } of layers) drawLayer(img.data, objects, pals);
  ctx.putImageData(img, 0, 0);
}

function drawLayer(px, objects, pals) {
  const { oam, vram, obp0 } = objects;
  // lower OAM entries win where sprites overlap, so draw from the end
  for (let p = 156; p >= 0; p -= 4) {
    const sy = oam[p] - 16; const sx = oam[p + 1] - 8; const tile = oam[p + 2]; const attr = oam[p + 3];
    if (oam[p] === 0 || oam[p] >= 160 || oam[p + 1] === 0 || oam[p + 1] >= 168) continue;
    const pal = pals[attr & 7];
    for (let r = 0; r < 8; r++) {
      const y = sy + r;
      if (y < 0 || y >= 96) continue;
      const row = attr & 0x40 ? 7 - r : r;
      const lo = vram[(tile & 0x7f) * 16 + row * 2]; const hi = vram[(tile & 0x7f) * 16 + row * 2 + 1];
      for (let c = 0; c < 8; c++) {
        const x = sx + c;
        if (x < 0 || x >= 160) continue;
        const bit = attr & 0x20 ? c : 7 - c;
        const ci = ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1);
        if (!ci) continue;
        const [R, G, B] = pal[(obp0 >> (ci * 2)) & 3];
        const k = (y * 160 + x) * 4;
        px[k] = R; px[k + 1] = G; px[k + 2] = B; px[k + 3] = 255;
      }
    }
  }
}

export function clearCanvas(canvas) {
  canvas.getContext('2d').clearRect(0, 0, 160, 96);
}

// A mon pic (palette PNG: transparent, light, dark, black) as 2bpp tiles in VRAM order
// (column-major), padded into a 7x7 box like PadFrontpic when `front`.
export function picTiles(image, front) {
  const w = image.naturalWidth; const h = image.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const lum = (k) => data[k] * 3 + data[k + 1] * 6 + data[k + 2];
  const mids = [...new Set(Array.from({ length: w * h }, (_, i) => i * 4)
    .filter((k) => data[k + 3] && lum(k) > 0 && lum(k) < 2550).map(lum))].sort((a, b) => b - a);
  const shade = (k) => {
    if (!data[k + 3] || lum(k) >= 2550) return 0;
    if (lum(k) === 0) return 3;
    return mids.indexOf(lum(k)) === 0 ? 1 : 2;
  };
  const cols = front ? 7 : w / 8; const rows = front ? 7 : h / 8;
  const offX = front ? (w / 8 < 7 ? 1 : 0) : 0; const offY = front ? 7 - h / 8 : 0;
  const tiles = [];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const t = new Uint8Array(16);
      const tx = col - offX; const ty = row - offY;
      if (tx >= 0 && ty >= 0 && tx < w / 8 && ty < h / 8) {
        for (let r = 0; r < 8; r++) {
          for (let b = 0; b < 8; b++) {
            const s = shade(((ty * 8 + r) * w + tx * 8 + b) * 4);
            t[r * 2] |= (s & 1) << (7 - b);
            t[r * 2 + 1] |= (s >> 1) << (7 - b);
          }
        }
      }
      tiles.push(t);
    }
  }
  return tiles;
}
