/* 영어·중국어·일본어 쪽을 만듭니다.
 *
 *   node _tools/make-lang-pages.js            (무엇이 바뀌는지만 보여 줍니다)
 *   node _tools/make-lang-pages.js --쓰기      (en/ zh/ ja/ 를 씁니다)
 *
 * 바탕은 qr-mission 저장소에 있던 번역된 쪽입니다. 거기에
 *   · 둘러보기 꾸밈·조각(tour.css, tour.js)과 다녀간 수 세기(site.js)를 더하고
 *   · 둘러보기 화면(#tour)을 그 나라 말로 붙이고
 *   · 말 바꾸는 단추의 주소를 이 저장소 안으로 돌립니다.
 *
 * 전시실 9칸 이름은 원래 쪽에 있던 확정 문구를 그대로 둡니다 —
 * tour.js 가 그 단추 글씨를 읽어 왼쪽 목록에도 씁니다.
 */

var fs = require('fs');
var path = require('path');

var FROM = 'C:/Users/Kasiu/Documents/qr-mission';
var HERE = path.join(__dirname, '..');
var WRITE = process.argv.indexOf('--쓰기') >= 0 || process.argv.indexOf('--write') >= 0;

/* 둘러보기 화면의 글귀. 한국어 쪽(index.html)의 같은 자리와 짝입니다. */
var WORDS = {
  en: {
    ttl: 'Testimony : The Next Page', sub: 'Online Exhibition',
    close: 'Close the tour', list: 'Rooms and viewpoints',
    prev: 'Previous viewpoint', next: 'Next viewpoint',
    zin: 'Zoom in', zout: 'Zoom out',
    home: 'Back to the start', play: 'Auto play', full: 'Full screen',
    menu: 'Room list', wait: 'Loading the photo…',
    hint: 'Drag to look around · Double-tap to zoom',
    x: 'Close', lookHint: 'Scroll or pinch to zoom, drag to move'
  },
  zh: {
    ttl: '证言：下一页', sub: '在线展馆',
    close: '关闭浏览', list: '展厅与地点',
    prev: '上一个地点', next: '下一个地点',
    zin: '放大', zout: '缩小',
    home: '回到起点', play: '自动播放', full: '全屏',
    menu: '展厅列表', wait: '正在加载照片…',
    hint: '拖动即可环视 · 双击可放大',
    x: '关闭', lookHint: '滚轮或双指放大，拖动移动'
  },
  ja: {
    ttl: '証言：次のページ', sub: 'オンライン展示館',
    close: 'ツアーを閉じる', list: '展示室と地点',
    prev: '前の地点', next: '次の地点',
    zin: '拡大', zout: '縮小',
    home: '最初へ', play: '自動再生', full: '全画面',
    menu: '展示室一覧', wait: '写真を読み込んでいます…',
    hint: 'ドラッグで見回す · ダブルタップで拡大',
    x: '閉じる', lookHint: 'ホイールか2本指で拡大、ドラッグで移動'
  }
};

/* data-base 로 사진 폴더까지의 길을 알려 줍니다 — 이 쪽들은 한 칸 아래에 있습니다 */
function tourBlock(w) {
  return [
    '<div class="tour" id="tour" data-base="../tour/" hidden>',
    '',
    '  <aside class="t-side">',
    '    <div class="t-side-top">',
    '      <p class="ttl">' + w.ttl + '<span class="sub">' + w.sub + '</span></p>',
    '      <button type="button" class="t-btn close" aria-label="' + w.close + '">✕</button>',
    '    </div>',
    '    <nav class="t-list" aria-label="' + w.list + '"></nav>',
    '  </aside>',
    '',
    '  <div class="t-stage">',
    '    <canvas></canvas>',
    '',
    '    <div class="t-spots"></div>',
    '',
    '    <p class="t-cap"><b></b><span></span></p>',
    '',
    '    <button type="button" class="t-step prev" aria-label="' + w.prev + '">‹</button>',
    '    <button type="button" class="t-step next" aria-label="' + w.next + '">›</button>',
    '',
    '    <div class="t-zoom">',
    '      <button type="button" class="t-btn zin" aria-label="' + w.zin + '"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M16 16l5 5"/></svg></button>',
    '      <button type="button" class="t-btn zout" aria-label="' + w.zout + '"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M8 11h6M16 16l5 5"/></svg></button>',
    '    </div>',
    '',
    '    <div class="t-tools">',
    '      <button type="button" class="t-btn home" aria-label="' + w.home + '"><svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg></button>',
    '      <button type="button" class="t-btn play" aria-label="' + w.play + '"><svg viewBox="0 0 24 24"><path d="M7 4l12 8-12 8z" fill="currentColor" stroke="none"/></svg></button>',
    '      <button type="button" class="t-btn full" aria-label="' + w.full + '"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button>',
    '    </div>',
    '',
    '    <button type="button" class="t-btn t-side-toggle" aria-label="' + w.menu + '"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>',
    '',
    '    <p class="t-wait" hidden>' + w.wait + '</p>',
    '    <p class="t-hint">' + w.hint + '</p>',
    '',
    '    <div class="t-look" hidden>',
    '      <div class="t-look-top">',
    '        <div><b></b><p></p></div>',
    '        <button type="button" class="t-btn close" aria-label="' + w.x + '">✕</button>',
    '      </div>',
    '      <div class="t-look-img"><img alt=""></div>',
    '      <p class="t-look-hint">' + w.lookHint + '</p>',
    '    </div>',
    '  </div>',
    '',
    '</div>',
    ''
  ].join('\n');
}

var NAV = {
  en: [['../', 'KOR'], ['./', 'ENG'], ['../zh/', 'CHN'], ['../ja/', 'JPN']],
  zh: [['../', 'KOR'], ['../en/', 'ENG'], ['./', 'CHN'], ['../ja/', 'JPN']],
  ja: [['../', 'KOR'], ['../en/', 'ENG'], ['../zh/', 'CHN'], ['./', 'JPN']]
};
var SELF = { en: 'ENG', zh: 'CHN', ja: 'JPN' };

Object.keys(WORDS).forEach(function (lang) {
  var src = path.join(FROM, lang, 'index.html');
  if (!fs.existsSync(src)) { console.error('바탕 쪽이 없습니다: ' + src); process.exit(1); }
  var s = fs.readFileSync(src, 'utf8');
  var hits = 0;

  function sub(a, b) {
    if (s.indexOf(a) < 0) { console.error('[' + lang + '] 못 찾음: ' + a.slice(0, 90)); process.exit(1); }
    if (s.split(a).length > 2) { console.error('[' + lang + '] 여러 군데: ' + a.slice(0, 90)); process.exit(1); }
    s = s.replace(a, b); hits++;
  }

  // 1. 둘러보기 꾸밈
  sub('<link rel="stylesheet" href="../assets/guide.css">',
      '<link rel="stylesheet" href="../assets/guide.css">\n<link rel="stylesheet" href="../assets/tour.css">');

  // 2. 말 바꾸는 단추 — 모두 이 저장소 안을 가리키게
  var nav = NAV[lang].map(function (a) {
    var cur = a[1] === SELF[lang] ? ' aria-current="page"' : '';
    return '      <a href="' + a[0] + '"' + cur + '>' + a[1] + '</a>';
  }).join('\n');
  var from = s.indexOf('<nav class="langs"');
  var to = s.indexOf('</nav>', from);
  if (from < 0 || to < 0) { console.error('[' + lang + '] 말 단추를 못 찾았습니다'); process.exit(1); }
  var head = s.slice(from, s.indexOf('>', from) + 1);
  s = s.slice(0, from) + head + '\n' + nav + '\n    ' + s.slice(to);
  hits++;

  // 3. 둘러보기 화면과 조각들
  sub('<script src="../assets/guide.js"></script>',
      tourBlock(WORDS[lang])
      + '\n<script src="../assets/site.js"></script>\n'
      + '\n<script src="../assets/guide.js"></script>\n'
      + '<script src="../assets/tour.js"></script>');

  var out = path.join(HERE, lang, 'index.html');
  console.log('[' + lang + '] ' + hits + '곳 고쳐 ' + path.relative(HERE, out) + ' 로');
  if (WRITE) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, s, 'utf8');
  }
});

if (!WRITE) console.log('\n(아직 쓰지 않았습니다. 실제로 만들려면 뒤에 --쓰기 를 붙이세요)');
