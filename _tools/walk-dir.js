// 이웃한 두 360 사진을 견주어 '어느 쪽으로 걸어갔는지'를 계산합니다.
//
//   node walk-dir.js <A.raw> <B.raw> <가로> <세로> <stride>
//   → A 에서 B 로 가는 방향(도)과 믿을 만한 정도를 찍어 줍니다.
//
// 원리
//   카메라가 한 걸음 옮기면, 걸어간 쪽에 있는 것은 제자리에 있고
//   옆에 있는 것일수록 크게 밀립니다. 밀린 양을 방위각마다 재면
//   sin 모양이 되고, 그 곡선이 0을 지나며 내려가는 자리가 걸어간 방향입니다.
//   (멀고 가까움은 크기만 바꾸고 0 지나는 자리는 바꾸지 않습니다.)

const fs = require('fs');

const [A, B, W, H, S] = [
  process.argv[2], process.argv[3],
  +process.argv[4], +process.argv[5], +process.argv[6],
];

/** 가로 띠 하나를 밝기로 바꿔 둡니다 (v0~v1 은 위에서부터의 비율) */
function band(buf, v0, v1) {
  const y0 = Math.round(H * v0), y1 = Math.round(H * v1);
  const rows = y1 - y0;
  const out = new Float32Array(W * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y + y0) * S + x * 3;
      out[y * W + x] = buf[o] * 0.114 + buf[o + 1] * 0.587 + buf[o + 2] * 0.299;
    }
  }
  return { px: out, rows };
}

const bufA = fs.readFileSync(A);
const bufB = fs.readFileSync(B);

// 수평선 둘레 — 좌우로 밀린 양을 재는 데 씁니다
const a = band(bufA, 0.42, 0.60);
const b = band(bufB, 0.42, 0.60);
const ROWS = a.rows;

// 발밑 바닥 — 앞뒤를 가리는 데 씁니다 (아래로 10~35도쯤)
const fa = band(bufA, 0.556, 0.694);
const fb = band(bufB, 0.556, 0.694);
const FROWS = fa.rows;

const wrap = (x) => ((x % W) + W) % W;

/** a 의 한 토막이 b 에서 얼마나 옆으로 밀렸는지 */
function shiftAt(cx, half, maxShift) {
  let best = 0, bestErr = Infinity, second = Infinity;
  for (let s = -maxShift; s <= maxShift; s++) {
    let err = 0, n = 0;
    for (let y = 2; y < ROWS - 2; y += 2) {
      const ra = y * W, rb = y * W;
      for (let d = -half; d <= half; d += 1) {
        err += Math.abs(a.px[ra + wrap(cx + d)] - b.px[rb + wrap(cx + d + s)]);
        n++;
      }
    }
    err /= n;
    if (err < bestErr) { second = bestErr; bestErr = err; best = s; }
    else if (err < second) { second = err; }
  }
  // 두 번째로 좋은 자리와 얼마나 벌어졌는지로 믿음을 잽니다
  const conf = second === Infinity ? 0 : Math.max(0, (second - bestErr) / (bestErr + 1));
  return { s: best, conf };
}

const N = 72;                                   // 5도씩
const half = Math.round(W / 40);                // 토막 너비 9도쯤
const maxShift = Math.round(W * 0.11);          // 최대 40도까지 찾습니다

const ang = [], shift = [], conf = [];
for (let i = 0; i < N; i++) {
  const phi = (i + 0.5) / N * 2 * Math.PI - Math.PI;     // -180~180
  const cx = Math.round(((phi / (2 * Math.PI)) + 0.5) * W);
  const r = shiftAt(cx, half, maxShift);
  ang.push(phi);
  shift.push(r.s / W * 2 * Math.PI);             // 라디안으로
  conf.push(r.conf);
}

// 밀린 양은 두 가지가 겹쳐 있습니다.
//   1) 삼각대를 다시 돌려 놓고 찍은 각도 차이 — 모든 쪽이 똑같이 R 만큼 밀림
//   2) 걸어간 것 — 걸어간 쪽(θ)은 제자리, 옆은 크게:  +k·sin(φ − θ)
//
//   밀린 양 = R + k·sin φ·cos θ − k·cos φ·sin θ
//           = R + A·sin φ + B·cos φ
//
// R 을 같이 풀지 않으면 그 몫이 A·B 로 새어 들어가 방향이 뒤집히기도 합니다.
// 실제로 그래서 몇 군데가 정반대로 나왔습니다. 셋을 한꺼번에 풉니다.

const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
const rhs = [0, 0, 0];
for (let i = 0; i < N; i++) {
  const w = conf[i];
  const g = [1, Math.sin(ang[i]), Math.cos(ang[i])];
  for (let r = 0; r < 3; r++) {
    rhs[r] += w * shift[i] * g[r];
    for (let c = 0; c < 3; c++) M[r][c] += w * g[r] * g[c];
  }
}

/** 작은 3원 1차 연립방정식 */
function solve3(m, v) {
  const a = m.map((row, i) => row.concat([v[i]]));
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r;
    if (Math.abs(a[p][c]) < 1e-12) return null;
    const t = a[c]; a[c] = a[p]; a[p] = t;
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k2 = c; k2 < 4; k2++) a[r][k2] -= f * a[c][k2];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

const sol = solve3(M, rhs);
const R = sol ? sol[0] : 0;
const Asin = sol ? sol[1] : 0;
const Bcos = sol ? sol[2] : 0;

// Asin = k cos θ,  Bcos = −k sin θ   (k > 0 이라야 걸어간 쪽입니다)
const theta = Math.atan2(-Bcos, Asin);
const k = Math.hypot(Asin, Bcos);

// 맞춘 곡선이 실제와 얼마나 비슷한지 (1 에 가까울수록 믿을 만)
let ss = 0, tot = 0, mean = 0, wsum = 0;
for (let i = 0; i < N; i++) { mean += conf[i] * shift[i]; wsum += conf[i]; }
mean = wsum > 0 ? mean / wsum : 0;
for (let i = 0; i < N; i++) {
  const fit = R + k * Math.sin(ang[i] - theta);
  ss += conf[i] * (shift[i] - fit) ** 2;
  tot += conf[i] * (shift[i] - mean) ** 2;
}
const good = tot > 0 ? Math.max(0, 1 - ss / tot) : 0;

/* ── 앞뒤 가리기 ──────────────────────────────────────
   좌우로 밀린 양만 보면 걸어간 쪽과 그 반대쪽이 똑같이 들어맞습니다.
   그래서 발밑 바닥을 따로 봅니다. 다가가는 쪽 바닥은 화면에서 내려오고,
   멀어지는 쪽 바닥은 올라갑니다. 그 쏠림으로 두 답 중 하나를 고릅니다. */

function fallAt(cx, half, s) {
  let best = 0, bestErr = Infinity, second = Infinity;
  for (let dv = -34; dv <= 34; dv++) {
    let err = 0, n = 0;
    for (let y = 4; y < FROWS - 4; y += 2) {
      const yy = y + dv;
      if (yy < 0 || yy >= FROWS) { err += 1e4; n += 1; continue; }
      for (let d = -half; d <= half; d += 2) {
        err += Math.abs(fa.px[y * W + wrap(cx + d)] - fb.px[yy * W + wrap(cx + d + s)]);
        n++;
      }
    }
    err /= n;
    if (err < bestErr) { second = bestErr; bestErr = err; best = dv; }
    else if (err < second) { second = err; }
  }
  const c = second === Infinity ? 0 : Math.max(0, (second - bestErr) / (bestErr + 1));
  return { dv: best, conf: c };
}

let lean = 0;
for (let i = 0; i < N; i++) {
  if (conf[i] <= 0) continue;
  const cx = Math.round(((ang[i] / (2 * Math.PI)) + 0.5) * W);
  const s = Math.round(shift[i] / (2 * Math.PI) * W);
  const f = fallAt(cx, half, s);
  lean += f.conf * f.dv * Math.cos(ang[i] - theta);
}

// 걸어간 쪽 바닥이 내려와야(lean > 0) 맞습니다. 아니면 정반대입니다.
let dir = theta;
if (lean < 0) dir = theta + Math.PI;
const deg = Math.round(((dir * 180 / Math.PI) % 360 + 540) % 360 - 180);

process.stdout.write(
  deg + ' ' + good.toFixed(2) + ' ' + (k * 180 / Math.PI).toFixed(1)
  + ' ' + (lean >= 0 ? '정' : '반') + '\n'
);
