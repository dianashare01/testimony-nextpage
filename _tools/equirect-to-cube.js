// 펼친 360 사진(정방형 파노라마)을 정육면체 여섯 면으로 자릅니다.
//
//   node equirect-to-cube.js <in.raw> <나올폴더> <한면크기> <가로> <세로> <stride>
//
// 왜 여섯 면인가:
//   8192x4096 한 장을 그대로 그림판(텍스처)에 올리면 휴대폰이 버티지 못합니다.
//   여섯 면으로 나누면 같은 또렷함을 절반 남짓한 기억칸으로 얻고,
//   위아래가 늘어나 낭비되던 자리도 없어집니다. 크게 당겨 봐도 덜 뭉갭니다.
//
// 면 차례와 방향은 WebGL 큐브맵 규칙 그대로입니다 (px, nx, py, ny, pz, nz).

const fs = require('fs');
const path = require('path');

const [RAW, OUT, SIZE, W, H, STRIDE] = [
  process.argv[2], process.argv[3],
  +process.argv[4], +process.argv[5], +process.argv[6], +process.argv[7],
];

const src = fs.readFileSync(RAW);

/** 원본에서 한 점을 꺼냅니다. 네 칸을 섞어 매끄럽게. */
function sample(lon, lat, out) {
  let x = (lon / (Math.PI * 2) + 0.5) * W - 0.5;
  let y = (0.5 - lat / Math.PI) * H - 0.5;

  let x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;

  // 좌우는 빙 둘러 이어지고, 위아래는 끝에서 멈춥니다
  const xw = (v) => ((v % W) + W) % W;
  const yc = (v) => (v < 0 ? 0 : v > H - 1 ? H - 1 : v);

  const x1 = xw(x0 + 1), y1 = yc(y0 + 1);
  x0 = xw(x0); y0 = yc(y0);

  const o00 = y0 * STRIDE + x0 * 3, o10 = y0 * STRIDE + x1 * 3;
  const o01 = y1 * STRIDE + x0 * 3, o11 = y1 * STRIDE + x1 * 3;

  for (let c = 0; c < 3; c++) {
    const a = src[o00 + c] + (src[o10 + c] - src[o00 + c]) * fx;
    const b = src[o01 + c] + (src[o11 + c] - src[o01 + c]) * fx;
    out[c] = a + (b - a) * fy;
  }
}

/** 면 번호와 면 안의 자리(a, b : -1~1)로 바라보는 방향을 냅니다. */
function dir(face, a, b) {
  switch (face) {
    case 0: return [1, -b, -a];   // px  오른쪽
    case 1: return [-1, -b, a];   // nx  왼쪽
    case 2: return [a, 1, b];     // py  위
    case 3: return [a, -1, -b];   // ny  아래
    case 4: return [a, -b, 1];    // pz  뒤
    default: return [-a, -b, -1]; // nz  앞
  }
}

function writeBmp(file, px, size) {
  const rowRaw = size * 3;
  const pad = (4 - (rowRaw % 4)) % 4;
  const row = rowRaw + pad;
  const head = Buffer.alloc(54);
  head.write('BM', 0);
  head.writeUInt32LE(54 + row * size, 2);
  head.writeUInt32LE(54, 10);
  head.writeUInt32LE(40, 14);
  head.writeInt32LE(size, 18);
  head.writeInt32LE(-size, 22);        // 위에서 아래로
  head.writeUInt16LE(1, 26);
  head.writeUInt16LE(24, 28);
  head.writeUInt32LE(row * size, 34);

  const fd = fs.openSync(file, 'w');
  fs.writeSync(fd, head);
  const line = Buffer.alloc(row);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 3;
      // px 는 이미 파랑·초록·빨강 차례입니다 (PowerShell 이 떠 준 24bppRgb 가 BGR).
      // BMP 도 같은 차례라 그대로 옮깁니다. 여기서 뒤집으면 빨강과 파랑이 바뀝니다.
      line[x * 3] = px[o];
      line[x * 3 + 1] = px[o + 1];
      line[x * 3 + 2] = px[o + 2];
    }
    fs.writeSync(fd, line);
  }
  fs.closeSync(fd);
}

const NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
fs.mkdirSync(OUT, { recursive: true });

const rgb = new Float64Array(3);
for (let f = 0; f < 6; f++) {
  const px = Buffer.alloc(SIZE * SIZE * 3);
  for (let ty = 0; ty < SIZE; ty++) {
    const b = ((ty + 0.5) / SIZE) * 2 - 1;
    for (let tx = 0; tx < SIZE; tx++) {
      const a = ((tx + 0.5) / SIZE) * 2 - 1;
      const [dx, dy, dz] = dir(f, a, b);
      const len = Math.hypot(dx, dy, dz);
      const lon = Math.atan2(dx / len, -dz / len);
      const lat = Math.asin(dy / len);
      sample(lon, lat, rgb);
      const o = (ty * SIZE + tx) * 3;
      px[o] = rgb[0] + 0.5;
      px[o + 1] = rgb[1] + 0.5;
      px[o + 2] = rgb[2] + 0.5;
    }
  }
  writeBmp(path.join(OUT, NAMES[f] + '.bmp'), px, SIZE);
}

process.stdout.write('ok\n');
