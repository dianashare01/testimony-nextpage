// tour/tour.json 을 다시 만듭니다.
//   node _tools/make-tour.js
//
// 아래 표만 고치면 됩니다. tour/<번호>/ 안에 여섯 면 사진이 들어 있어야 합니다.
//
//   id    사진 폴더 이름
//   yaw   들어갔을 때 처음 보는 방향 (도). 0 이 사진 한가운데, +가 오른쪽
//   fwd   다음 지점으로 걸어가는 방향 (도). 바닥 화살표가 이 자리에 섭니다
//   back  앞 지점으로 되돌아가는 방향 (도). 안 적으면 fwd 반대쪽
//
//   fwd·back 은 `_tools/walk-dir.ps1` 로 이웃 사진끼리 견주어 계산한 값입니다.
//   화살표가 벽을 가리키거든 그 숫자만 고치고 이 파일을 다시 돌리세요.
//   spots 작품·글자 들여다보기 자리 [{ yaw, pitch, label, text, img }]
//
// 보는 각도나 화살표 자리가 어색하면 yaw·fwd 숫자만 고치고 이 파일을 다시 돌리세요.

const fs = require('fs');
const path = require('path');

const TOUR = path.join(__dirname, '..', 'tour');

const ROOMS = [
  { no: '01', name: '안내데스크', scenes: [
    { id: '01', title: '입구 · 안내데스크', yaw: 0, fwd: -121 },
  ] },
  { no: '02', name: '서문 · 연표의 길', scenes: [
    { id: '02', title: '서문 — 나의 마음은 지지 않았다', yaw: 0, fwd: 45, back: -13 },
    { id: '03', title: '연표의 길 · 1975 — 1999', yaw: 0, fwd: -162, back: 57 },
    { id: '04', title: '연표의 길 · 2000년대', yaw: 0, fwd: 50, back: -176 },
    { id: '05', title: '연표의 길 · 2010 — 2020년대', yaw: 0, fwd: 15, back: -92 },
  ] },
  { no: '03', name: '1부 · 2,744개의 기록', scenes: [
    { id: '06', title: '2,744개의 기록', yaw: 45, fwd: -30, back: 33 },
  ] },
  { no: '04', name: '2부 · 증언의 목소리', scenes: [
    { id: '07', title: '증언의 목소리 · 들머리', yaw: 0, fwd: -95, back: 6 },
    { id: '08', title: '증언의 목소리 ②', yaw: 0, fwd: -95, back: 100 },
    { id: '09', title: '증언의 목소리 ③', yaw: 0, fwd: -95, back: 100 },
    { id: '10', title: '증언의 목소리 ④', yaw: 0, fwd: -95, back: 100 },
    { id: '11', title: '증언의 목소리 ⑤', yaw: 30, fwd: 73, back: 112 },
  ] },
  { no: '05', name: '기억의 경로', scenes: [
    { id: '12', title: '기억의 경로', yaw: -15, fwd: 166, back: -28 },
  ] },
  { no: '06', name: '삶이 보여준 증언', scenes: [
    { id: '13', title: '삶이 보여준 증언 · 들머리', yaw: 0, fwd: -100, back: 103 },
    { id: '14', title: '삶이 보여준 증언 ②', yaw: -10, fwd: -100, back: 105 },
    { id: '15', title: '삶이 보여준 증언 ③', yaw: -10, fwd: -100, back: 92 },
    { id: '16', title: '삶이 보여준 증언 ④', yaw: -15, fwd: 27, back: 118 },
  ] },
  { no: '07', name: '전환 통로', scenes: [
    { id: '17', title: '전환 통로 · 들머리', yaw: 0, fwd: -9, back: 110 },
    { id: '18', title: '전환 통로 ②', yaw: 15, fwd: 23, back: 41 },
    { id: '20', title: '전환 통로 ③', yaw: 30, fwd: -17, back: -16 },
    { id: '21', title: '전환 통로 ④', yaw: 20, fwd: -95, back: -179 },
  ] },
  { no: '08', name: '3부 · 숫자가 남긴 말', scenes: [
    { id: '22', title: '숫자가 남긴 말', yaw: 25, fwd: 89, back: 125 },
    { id: '23', title: '숫자가 남긴 말 ②', yaw: -10, fwd: 34, back: -76 },
  ] },
  { no: '09', name: '서고의 숲', scenes: [
    { id: '24', title: '서고의 숲 · 자료 열람', yaw: -20, fwd: 105, back: 112 },
    { id: '25', title: '서고의 숲 ②', yaw: -10, back: -55 },
  ] },
];


// 사진이 실제로 있는 지점만 남깁니다
const missing = [];
const rooms = ROOMS.map((r) => ({
  no: r.no,
  name: r.name,
  scenes: r.scenes.filter((s) => {
    const ok = fs.existsSync(path.join(TOUR, s.id, 'nz.jpg'));
    if (!ok) missing.push(s.id);
    return ok;
  }),
})).filter((r) => r.scenes.length);

const out = {
  open: true,
  base: 'tour/',
  fov: 78,        // 처음 보는 넓이(도)
  fovMin: 18,     // 가장 크게 당겼을 때
  fovMax: 100,
  dwell: 9,       // 자동 플레이로 한 지점에 머무는 시간(초)
  rooms,
};

fs.writeFileSync(path.join(TOUR, 'tour.json'), JSON.stringify(out, null, 2) + '\n');

let n = 0;
rooms.forEach((r) => { n += r.scenes.length; console.log(r.no, r.name, r.scenes.length + '지점'); });
console.log('—— 모두 ' + n + '지점');
if (missing.length) console.log('사진이 없어 뺀 것:', missing.join(', '));
