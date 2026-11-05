/* 둘러보기 목록(tour/tour.json)에 영어·중국어·일본어를 넣습니다.
 *
 *   node _tools/tour-langs.js            (무엇이 바뀌는지만 보여 줍니다)
 *   node _tools/tour-langs.js --쓰기      (실제로 고칩니다)
 *
 * 전시실 9칸 이름은 이미 영·중·일 홈페이지에 쓰이던 **확정 문구**를 그대로 옮겼습니다.
 * 지점 24개 이름은 그 말투를 따라 **제가 옮긴 초안**입니다 — 감수 뒤 바꿔 주세요.
 * 고칠 때는 아래 표만 손보고 다시 돌리면 됩니다.
 */

var fs = require('fs');
var path = require('path');

var FILE = path.join(__dirname, '..', 'tour', 'tour.json');
var WRITE = process.argv.indexOf('--쓰기') >= 0 || process.argv.indexOf('--write') >= 0;

/* 전시실 — 영·중·일 홈페이지에 쓰던 확정 문구입니다 */
var ROOMS = {
  '01': { ko: '안내데스크', en: 'Information Desk', zh: '服务台', ja: '総合案内' },
  '02': { ko: '서문 · 연표의 길', en: 'Preface · A Timeline of the Movement', zh: '序·年表之路', ja: '序文・年表の道' },
  '03': { ko: '1부 · 2,744개의 기록', en: 'Part 1 · 2,744 Records', zh: '第一部分·2,744件记录', ja: '第1部・2,744件の記録' },
  '04': { ko: '2부 · 증언의 목소리', en: 'Part 2 · Voices of Testimony', zh: '第二部分·证言之声', ja: '第2部・証言の声' },
  '05': { ko: '기억의 경로', en: 'Paths of Memory', zh: '记忆的路径', ja: '記憶の経路' },
  '06': { ko: '삶이 보여준 증언', en: 'Testimonies Through Lives', zh: '生命呈现的证言', ja: '人生が示した証言' },
  '07': { ko: '전환 통로', en: 'Transition Passage', zh: '转换通道', ja: '転換通路' },
  '08': { ko: '3부 · 숫자가 남긴 말', en: 'Part 3 · The Messages Left by Numbers', zh: '第三部分·数字留下的讯息', ja: '第3部・数字が残した言葉' },
  '09': { ko: '서고의 숲', en: 'The Forest of Archives', zh: '书库之林', ja: '書庫の森' }
};

/* 지점 — 초안입니다.
   02 의 인용은 각 나라 홈페이지에 실린 송신도 님 말씀 그대로를 씁니다. */
var SCENES = {
  '01': { ko: '입구 · 안내데스크', en: 'Entrance · Information Desk', zh: '入口·服务台', ja: '入口・総合案内' },
  '02': { ko: '서문 — 나의 마음은 지지 않았다', en: 'Preface — My Heart Is Not Broken Yet', zh: '序 — 我的心没有输', ja: '序文 — 私の心は負けていない' },
  '03': { ko: '연표의 길 · 1975 — 1999', en: 'A Timeline of the Movement · 1975–1999', zh: '年表之路·1975—1999', ja: '年表の道・1975—1999' },
  '04': { ko: '연표의 길 · 2000년대', en: 'A Timeline of the Movement · 2000s', zh: '年表之路·2000年代', ja: '年表の道・2000年代' },
  '05': { ko: '연표의 길 · 2010 — 2020년대', en: 'A Timeline of the Movement · 2010s–2020s', zh: '年表之路·2010—2020年代', ja: '年表の道・2010—2020年代' },
  '06': { ko: '2,744개의 기록', en: '2,744 Records', zh: '2,744件记录', ja: '2,744件の記録' },
  '07': { ko: '증언의 목소리 · 들머리', en: 'Voices of Testimony · Entrance', zh: '证言之声·入口', ja: '証言の声・入口' },
  '08': { ko: '증언의 목소리 ②', en: 'Voices of Testimony ②', zh: '证言之声 ②', ja: '証言の声 ②' },
  '09': { ko: '증언의 목소리 ③', en: 'Voices of Testimony ③', zh: '证言之声 ③', ja: '証言の声 ③' },
  '10': { ko: '증언의 목소리 ④', en: 'Voices of Testimony ④', zh: '证言之声 ④', ja: '証言の声 ④' },
  '11': { ko: '증언의 목소리 ⑤', en: 'Voices of Testimony ⑤', zh: '证言之声 ⑤', ja: '証言の声 ⑤' },
  '12': { ko: '기억의 경로', en: 'Paths of Memory', zh: '记忆的路径', ja: '記憶の経路' },
  '13': { ko: '삶이 보여준 증언 · 들머리', en: 'Testimonies Through Lives · Entrance', zh: '生命呈现的证言·入口', ja: '人生が示した証言・入口' },
  '14': { ko: '삶이 보여준 증언 ②', en: 'Testimonies Through Lives ②', zh: '生命呈现的证言 ②', ja: '人生が示した証言 ②' },
  '15': { ko: '삶이 보여준 증언 ③', en: 'Testimonies Through Lives ③', zh: '生命呈现的证言 ③', ja: '人生が示した証言 ③' },
  '16': { ko: '삶이 보여준 증언 ④', en: 'Testimonies Through Lives ④', zh: '生命呈现的证言 ④', ja: '人生が示した証言 ④' },
  '17': { ko: '전환 통로 · 들머리', en: 'Transition Passage · Entrance', zh: '转换通道·入口', ja: '転換通路・入口' },
  '18': { ko: '전환 통로 ②', en: 'Transition Passage ②', zh: '转换通道 ②', ja: '転換通路 ②' },
  '20': { ko: '전환 통로 ③', en: 'Transition Passage ③', zh: '转换通道 ③', ja: '転換通路 ③' },
  '21': { ko: '전환 통로 ④', en: 'Transition Passage ④', zh: '转换通道 ④', ja: '転換通路 ④' },
  '22': { ko: '숫자가 남긴 말', en: 'The Messages Left by Numbers', zh: '数字留下的讯息', ja: '数字が残した言葉' },
  '23': { ko: '숫자가 남긴 말 ②', en: 'The Messages Left by Numbers ②', zh: '数字留下的讯息 ②', ja: '数字が残した言葉 ②' },
  '24': { ko: '서고의 숲 · 자료 열람', en: 'The Forest of Archives · Reading the Records', zh: '书库之林·资料阅览', ja: '書庫の森・資料閲覧' },
  '25': { ko: '서고의 숲 ②', en: 'The Forest of Archives ②', zh: '书库之林 ②', ja: '書庫の森 ②' }
};

var cfg = JSON.parse(fs.readFileSync(FILE, 'utf8').replace(/^﻿/, ''));

/* 이미 꾸러미면 그대로, 글자면 ko 로 치고 나머지를 더합니다 */
function pack(cur, add, what, key) {
  var ko = (cur && typeof cur === 'object') ? (cur.ko || '') : (cur || '');
  if (!add) { console.error(what + ' ' + key + ' 의 번역이 표에 없습니다'); process.exit(1); }
  if (ko && add.ko && ko !== add.ko) {
    console.error(what + ' ' + key + ' 의 한국어가 표와 다릅니다:\n  파일 「' + ko + '」\n  표   「' + add.ko + '」');
    process.exit(1);
  }
  return { ko: add.ko, en: add.en, zh: add.zh, ja: add.ja };
}

var n = 0;
cfg.rooms.forEach(function (rm) {
  rm.name = pack(rm.name, ROOMS[rm.no], '전시실', rm.no);
  console.log('[' + rm.no + '] ' + rm.name.ko + '  /  ' + rm.name.en + '  /  ' + rm.name.zh + '  /  ' + rm.name.ja);
  rm.scenes.forEach(function (s) {
    s.title = pack(s.title, SCENES[s.id], '지점', s.id);
    console.log('      ' + s.id + '  ' + s.title.en + '  /  ' + s.title.zh + '  /  ' + s.title.ja);
    n++;
  });
});

/* 사진 폴더까지의 길은 이제 쪽마다 다릅니다 (#tour 의 data-base).
   여기 적힌 base 는 더 보지 않으므로 지웁니다. */
if ('base' in cfg) {
  delete cfg.base;
  cfg._base = '사진 폴더 경로는 각 쪽의 <div id="tour" data-base="…"> 에 적습니다.';
}

console.log('\n전시실 ' + cfg.rooms.length + '칸 · 지점 ' + n + '곳');
if (!WRITE) {
  console.log('(아직 고치지 않았습니다. 실제로 바꾸려면 뒤에 --쓰기 를 붙이세요)');
  process.exit(0);
}
fs.writeFileSync(FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
console.log('tour/tour.json 을 고쳤습니다');
