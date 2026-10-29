// 가로 띠 하나를 읽어 또렷한 정도를 잽니다.
//   node blur.js band.raw <가로> <세로> <stride>
// 관람객이 실제로 보는 뒤쪽 반구만 재고, 찍는 사람과 이음매는 건너뜁니다.
//
// 평균만 보면 '흰 벽뿐인 방'이 '흔들린 사진'과 똑같이 낮게 나옵니다.
// 흔들린 사진은 어디를 봐도 또렷한 데가 없으므로, 작은 칸으로 나눠
// 그중 가장 또렷한 쪽(상위 10%)을 봅니다. 글자나 액자 모서리처럼
// 또렷한 데가 한 군데라도 있으면 제대로 찍힌 사진입니다.
const fs = require('fs');

const [file, W, H, S] = [process.argv[2], +process.argv[3], +process.argv[4], +process.argv[5]];
const buf = fs.readFileSync(file);
const T = 64;   // 칸 한 변

const gray = new Float32Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const o = y * S + x * 3;
    gray[y * W + x] = buf[o] * 0.114 + buf[o + 1] * 0.587 + buf[o + 2] * 0.299;
  }
}

const tiles = [];
for (let ty = 1; ty + T < H; ty += T) {
  for (let tx = T; tx + T < W; tx += T) {
    const u = (tx + T / 2) / W;
    if (u <= 0.778 && u >= 0.222) continue;
    let n = 0, s = 0, s2 = 0;
    for (let y = ty; y < ty + T; y++) {
      for (let x = tx; x < tx + T; x++) {
        const o = y * W + x;
        const l = 4 * gray[o] - gray[o - 1] - gray[o + 1] - gray[o - W] - gray[o + W];
        s += l; s2 += l * l; n++;
      }
    }
    tiles.push({ v: s2 / n - (s / n) ** 2, x: tx, y: ty });
  }
}
tiles.sort((a, b) => a.v - b.v);
const p = q => tiles[Math.min(tiles.length - 1, Math.floor(tiles.length * q))];
const best = p(0.99);
process.stdout.write(p(0.90).v.toFixed(1) + ' ' + best.v.toFixed(1) + ' ' +
                     best.x + ' ' + best.y + '\n');
