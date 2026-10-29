/* 어안 렌즈 두 장(.insp 를 BMP 로 푼 것)을 360 사진 한 장으로 폅니다.
   쓰기: node stitch.js <안쪽.bmp> <나올.bmp> <가로> [시야각] [좌우돌림] */
const fs = require('fs');

/* 날것(raw) 도 받습니다: 위에서 아래로, BGR, 줄 간격은 따로 알려 줍니다 */
function openRaw(p, w, h, stride) {
  return { b: fs.readFileSync(p), off: 0, w, h, bpp: 3, flip: false, stride };
}

function openBmp(p) {
  const b = fs.readFileSync(p);
  const off = b.readUInt32LE(10);
  const w = b.readInt32LE(18);
  let h = b.readInt32LE(22);
  const bpp = b.readUInt16LE(28) / 8;
  const flip = h > 0; h = Math.abs(h);
  const stride = Math.ceil(w * bpp / 4) * 4;
  return { b, off, w, h, bpp, flip, stride };
}

/* 네 칸을 섞어 부드럽게 뽑습니다 (둘레 밖은 까맣게) */
function sample(im, x, y, out, o) {
  if (x < 0 || y < 0 || x >= im.w - 1 || y >= im.h - 1) {
    out[o] = out[o + 1] = out[o + 2] = 0; return;
  }
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
  const r0 = im.flip ? (im.h - 1 - y0) : y0;
  const r1 = im.flip ? (im.h - 2 - y0) : (y0 + 1);
  const a = im.off + r0 * im.stride + x0 * im.bpp;
  const c = im.off + r1 * im.stride + x0 * im.bpp;
  const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy, w11 = fx * fy;
  for (let k = 0; k < 3; k++) {
    const j = 2 - k;
    out[o + k] =
      im.b[a + j] * w00 + im.b[a + im.bpp + j] * w10 +
      im.b[c + j] * w01 + im.b[c + im.bpp + j] * w11;
  }
}

function writeBmp(p, w, h, data) {
  const stride = Math.ceil(w * 3 / 4) * 4;
  const head = Buffer.alloc(54);
  head.write('BM', 0);
  head.writeUInt32LE(54 + stride * h, 2);
  head.writeUInt32LE(54, 10);
  head.writeUInt32LE(40, 14);
  head.writeInt32LE(w, 18);
  head.writeInt32LE(-h, 22);
  head.writeUInt16LE(1, 26);
  head.writeUInt16LE(24, 28);
  head.writeUInt32LE(stride * h, 34);

  const fd = fs.openSync(p, 'w');
  fs.writeSync(fd, head);
  const row = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 3;
      row[x * 3] = data[s + 2]; row[x * 3 + 1] = data[s + 1]; row[x * 3 + 2] = data[s];
    }
    fs.writeSync(fd, row);
  }
  fs.closeSync(fd);
}

const [, , inPath, outPath, outWs, fovs, yaws, rawW, rawH, rawStride] = process.argv;
const W = +outWs, H = W / 2;
const FOV = fovs ? +fovs : 193;          // 렌즈가 보는 각도
const YAW = (yaws ? +yaws : 0) * Math.PI / 180;

const im = rawW ? openRaw(inPath, +rawW, +rawH, +rawStride) : openBmp(inPath);
const half = im.w / 2;                    // 한 렌즈가 차지하는 칸
const R = Math.min(half, im.h) / 2;       // 동그라미 반지름
const cxL = half / 2, cyL = im.h / 2;
const cxR = half + half / 2, cyR = im.h / 2;
const halfFov = (FOV / 2) * Math.PI / 180;

// 두 렌즈가 겹쳐 보는 띠에서는 서서히 섞습니다
const edge = Math.PI / 2;
const band = halfFov - edge;

const out = Buffer.alloc(W * H * 3);
const a = Buffer.alloc(3), c = Buffer.alloc(3);

for (let v = 0; v < H; v++) {
  const lat = Math.PI / 2 - (v + 0.5) / H * Math.PI;
  const cl = Math.cos(lat), sl = Math.sin(lat);
  for (let u = 0; u < W; u++) {
    const lon = (u + 0.5) / W * 2 * Math.PI - Math.PI + YAW;
    const x = cl * Math.sin(lon), y = sl, z = cl * Math.cos(lon);
    const n = Math.hypot(x, y) || 1e-9;
    const o = (v * W + u) * 3;

    const th = Math.acos(Math.max(-1, Math.min(1, z)));      // 앞 렌즈에서 잰 각
    const wFront = band <= 0 ? (th <= edge ? 1 : 0)
      : Math.max(0, Math.min(1, (halfFov - th) / (2 * band)));

    if (wFront > 0) {
      const r = th / halfFov * R;
      sample(im, cxL + r * x / n, cyL - r * y / n, a, 0);
    }
    if (wFront < 1) {
      const r2 = (Math.PI - th) / halfFov * R;
      sample(im, cxR - r2 * x / n, cyR - r2 * y / n, c, 0);
    }

    if (wFront >= 1) { out[o] = a[0]; out[o + 1] = a[1]; out[o + 2] = a[2]; }
    else if (wFront <= 0) { out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; }
    else {
      const wb = 1 - wFront;
      out[o] = a[0] * wFront + c[0] * wb;
      out[o + 1] = a[1] * wFront + c[1] * wb;
      out[o + 2] = a[2] * wFront + c[2] * wb;
    }
  }
}

writeBmp(outPath, W, H, out);
console.log('폈습니다: ' + W + 'x' + H + '  (시야각 ' + FOV + '°, 좌우돌림 ' + (yaws || 0) + '°)');
