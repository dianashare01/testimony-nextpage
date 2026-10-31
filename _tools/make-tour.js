// tour/ 안의 사진들을 읽어 tour/tour.json 을 다시 만듭니다.
//   node _tools/make-tour.js
const fs = require('fs');
const path = require('path');

const TOUR = path.join(__dirname, '..', 'tour');

const NAMES = {
  '01_annae':    '안내데스크',
  '02_yeonpyo':  '서문 · 연표의 길',
  '03_girok':    '1부 · 2,744개의 기록',
  '04_moksori':  '2부 · 증언의 목소리',
  '05_gyeongro': '기억의 경로',
  '06_salm':     '삶이 보여준 증언',
  '07_tongro':   '전환 통로',
  '08_sutja':    '3부 · 숫자가 남긴 말',
  '09_seogo':    '서고의 숲'
};

const rooms = fs.readdirSync(TOUR, { withFileTypes: true })
  .filter(d => d.isDirectory() && NAMES[d.name])
  .map(d => d.name)
  .sort()
  .map(dir => ({
    no: dir.slice(0, 2),
    dir,
    name: NAMES[dir],
    scenes: fs.readdirSync(path.join(TOUR, dir))
      .filter(f => f.endsWith('.jpg'))
      .sort()
      .map(f => ({ f }))
  }))
  .filter(r => r.scenes.length);

// yaw 180 — 찍는 사람이 사진 한가운데에 있어서 처음에는 반대쪽을 보게 합니다.
// down — 아래로 볼 수 있는 한계(도). nadir — 바닥 쪽을 덮기 시작/끝 (0~1).
// 삼각대로 다시 찍어 사람이 없어지면 block·down·nadir 을 지우면 360도가 다 열립니다.
// mask — 찍는 사람을 덮는 모자이크 자리. [머리, 몸] 두 덩이.
//        한 덩이는 [가운데 u, 가운데 v, 반지름 u, 반지름 v]
// grid — 모자이크 칸 수 (360도 기준). 작을수록 굵게 덮입니다
// open — false 면 둘러보기를 켜지 않고 「오픈 준비 중입니다」 알림만 뜹니다.
//        사진을 다시 찍어 공개할 때 true 로 바꾸세요.
const out = {
  open: false,
  base: 'tour/', yaw: 180, down: 34, nadir: [0.82, 0.93],
  mask: [[0.513, 0.44, 0.085, 0.15], [0.520, 0.82, 0.205, 0.28]], grid: 130,
  rooms
};
fs.writeFileSync(path.join(TOUR, 'tour.json'), JSON.stringify(out, null, 2) + '\n');

let n = 0;
rooms.forEach(r => { n += r.scenes.length; console.log(r.no, r.name, r.scenes.length + '지점'); });
console.log('—— 모두 ' + n + '지점');
