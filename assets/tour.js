/* 온라인 전시관 — 360 둘러보기
 *
 * 바깥 라이브러리 없이 WebGL 로 직접 그립니다.
 * 사진은 정육면체 여섯 면(큐브맵)으로 올립니다. 펼친 사진 한 장을 그대로 쓰는 것보다
 * 같은 또렷함을 적은 기억칸으로 얻고, 크게 당겨 봐도 덜 뭉갭니다.
 *
 * 장면·전시실 목록은 tour/tour.json 에 있습니다.
 */

(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var root = $('#tour');
  if (!root) return;

  /* 쪽마다 말이 다릅니다 — <body data-lang="ko|en|zh|ja"> 를 보고 고릅니다.
     사진 폴더까지의 길도 쪽이 어디 있느냐에 따라 달라서(/en/ 같은 하위 폴더),
     <div id="tour" data-base="../tour/"> 로 받습니다. 없으면 'tour/' 입니다. */
  var LANG = (document.body.dataset.lang || 'ko');
  var BASE = root.dataset.base || 'tour/';

  // 목록의 이름은 {ko,en,zh,ja} 꾸러미입니다. 옛 파일처럼 글자 하나면 그대로 씁니다.
  function L(v) {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    return v[LANG] || v.ko || '';
  }

  var WORDS = {
    ko: { look: '자세히 보기', play: '자동 플레이', stop: '자동 플레이 멈춤',
          cap: '자막 보기', capOff: '자막 숨기기', capPrev: '이전 자막', capNext: '다음 자막' },
    en: { look: 'Take a closer look', play: 'Auto play', stop: 'Stop auto play',
          cap: 'Show subtitles', capOff: 'Hide subtitles', capPrev: 'Previous subtitle', capNext: 'Next subtitle' },
    zh: { look: '放大查看', play: '自动播放', stop: '停止自动播放',
          cap: '显示字幕', capOff: '隐藏字幕', capPrev: '上一条字幕', capNext: '下一条字幕' },
    ja: { look: '拡大して見る', play: '自動再生', stop: '自動再生を停止',
          cap: '字幕を表示', capOff: '字幕を隠す', capPrev: '前の字幕', capNext: '次の字幕' }
  };
  var TXT = WORDS[LANG] || WORDS.ko;   /* 아래 177줄의 W(그림 너비)와 겹치지 않게 TXT 로 둡니다 */

  /* 전시실 이름은 그 쪽에 **이미 번역돼 있는 단추 글씨**를 먼저 씁니다.
     없을 때만 목록(tour.json)에 적힌 말을 씁니다. */
  function roomName(rm) {
    var el = null;
    $$('#view-hall .room').forEach(function (b) {
      if ((($('.no', b) || {}).textContent || '').trim() === rm.no) el = $('.rt', b);
    });
    var t = el && el.textContent.trim();
    return t || L(rm.name);
  }

  var canvas = $('.t-stage canvas', root);
  var elList = $('.t-list', root);
  var elCapT = $('.t-cap b', root);
  var elCapS = $('.t-cap span', root);
  var elSpots = $('.t-spots', root);
  var elWait = $('.t-wait', root);
  var elHint = $('.t-hint', root);
  var elSub = $('.t-sub', root);
  var elSubTx = $('.t-sub .tx', root);
  var elSubNo = $('.t-sub .no', root);
  var btnSubPrev = $('.t-sub .sp', root);
  var btnSubNext = $('.t-sub .sn', root);
  var btnCap = $('.t-btn.cc', root);
  var btnPrev = $('.t-step.prev', root);
  var btnNext = $('.t-step.next', root);
  var btnPlay = $('.t-btn.play', root);

  var FACES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
  var D2R = Math.PI / 180;

  /* ── 상태 ─────────────────────────────── */

  var CFG = null;
  var SC = [];          // 장면들
  var at = 0;
  var ready = false;
  var open = false;

  var yaw = 0, pitch = 0, fov = 78;
  var fovMin = 18, fovMax = 100;
  var toYaw = 0, toPitch = 0, toFov = 78;   // 부드럽게 따라갈 목표
  var mix = 1;                               // 장면 바뀔 때 겹쳐 보여 주는 정도
  var playing = false;

  /* ── WebGL ────────────────────────────── */

  var gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false })
        || canvas.getContext('experimental-webgl');

  if (!gl) { root.dataset.nogl = '1'; }

  var prog, loc = {}, texA, texB;

  var VERT = 'attribute vec2 p; varying vec2 v; void main(){ v = p; gl_Position = vec4(p, 0.0, 1.0); }';

  // 화면의 각 점에서 '어느 쪽을 보고 있는지'를 계산해 그 방향의 하늘을 찍어 옵니다.
  var FRAG =
    '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n' +
    '#else\nprecision mediump float;\n#endif\n' +
    'uniform samplerCube skyA; uniform samplerCube skyB;' +
    'uniform float mixv; uniform float dim;' +
    'uniform vec2 half_; uniform mat3 rot;' +
    'varying vec2 v;' +
    'void main(){' +
    '  vec3 d = rot * normalize(vec3(v.x * half_.x, v.y * half_.y, -1.0));' +
    '  vec3 c = textureCube(skyA, d).rgb;' +
    '  if (mixv < 0.999) c = mix(textureCube(skyB, d).rgb, c, mixv);' +
    '  gl_FragColor = vec4(c * dim, 1.0);' +
    '}';

  function shader(t, s) {
    var o = gl.createShader(t);
    gl.shaderSource(o, s);
    gl.compileShader(o);
    return o;
  }

  function newCube() {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, t);
    var one = new Uint8Array([20, 16, 28]);
    for (var i = 0; i < 6; i++) {
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, one);
    }
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  function initGL() {
    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var p = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(p);
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);

    ['skyA', 'skyB', 'mixv', 'dim', 'half_', 'rot'].forEach(function (n) {
      loc[n] = gl.getUniformLocation(prog, n);
    });

    texA = newCube();
    texB = newCube();
    gl.uniform1i(loc.skyA, 0);
    gl.uniform1i(loc.skyB, 1);
    gl.uniform1f(loc.dim, 1);
  }

  function upload(tex, imgs) {
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
    for (var i = 0; i < 6; i++) {
      gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, imgs[i]);
    }
    var n = imgs[0].naturalWidth;
    if (n > 0 && (n & (n - 1)) === 0) {
      gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
  }

  /* ── 그리기 ───────────────────────────── */

  var W = 0, H = 0, raf = 0, last = 0;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  /** 보는 방향을 돌리는 3x3 (열 우선) */
  function rotation() {
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    // Ry(yaw) * Rx(pitch)
    return new Float32Array([
      cy, 0, -sy,
      sy * sp, cp, cy * sp,
      sy * cp, -sp, cy * cp,
    ]);
  }

  /** 방향 하나를 화면 좌표로 옮깁니다. 화면 뒤쪽이면 null.
      위 rotation() 의 반대로 되돌리는 계산입니다. */
  function project(ty, tp) {
    var dx = Math.sin(ty) * Math.cos(tp), dy = Math.sin(tp), dz = -Math.cos(ty) * Math.cos(tp);
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var vx = cy * dx - sy * dz;
    var vy = sy * sp * dx + cp * dy + cy * sp * dz;
    var vz = sy * cp * dx - sp * dy + cy * cp * dz;
    if (vz > -0.08) return null;
    var t = Math.tan(fov * D2R / 2);
    var aspect = (W || 1) / (H || 1);
    return {
      x: (vx / -vz / (t * aspect) * 0.5 + 0.5) * W,
      y: (0.5 - vy / -vz / t * 0.5) * H,
    };
  }

  function frame(now) {
    raf = 0;
    if (!open) return;
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;

    if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();

    if (playing) toYaw += 7 * D2R * dt;          // 자동 플레이: 천천히 둘러봅니다

    var k = 1 - Math.pow(0.0015, dt);
    yaw += (toYaw - yaw) * k;
    pitch += (toPitch - pitch) * k;
    fov += (toFov - fov) * k;
    if (mix < 1) mix = Math.min(1, mix + dt * 1.8);

    var t = Math.tan(fov * D2R / 2);
    gl.uniform2f(loc.half_, t * ((W || 1) / (H || 1)), t);
    gl.uniformMatrix3fv(loc.rot, false, rotation());
    gl.uniform1f(loc.mixv, mix);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_CUBE_MAP, texA);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_CUBE_MAP, texB);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    placeSpots();

    var moving = playing || mix < 1
      || Math.abs(toYaw - yaw) > 1e-4 || Math.abs(toPitch - pitch) > 1e-4 || Math.abs(toFov - fov) > 0.01;
    if (moving) draw();
  }

  function draw() { if (!raf) raf = requestAnimationFrame(frame); }

  /* ── 장면 불러오기 ────────────────────── */

  var cache = {};

  function faces(id, small) {
    var key = id + (small ? ':s' : '');
    if (cache[key]) return cache[key];
    var list = FACES.map(function (f) {
      var im = new Image();
      im.decoding = 'async';
      im.src = BASE + id + '/' + f + (small ? '-s' : '') + '.jpg';
      return im;
    });
    cache[key] = list;
    return list;
  }

  function whenReady(list, fn) {
    var left = 0, done = false;
    list.forEach(function (im) {
      if (im.complete && im.naturalWidth) return;
      left++;
      var hit = function () {
        if (--left <= 0 && !done) { done = true; fn(true); }
      };
      im.addEventListener('load', hit, { once: true });
      im.addEventListener('error', function () { if (!done) { done = true; fn(false); } }, { once: true });
    });
    if (left === 0) fn(true);
  }

  function sweep() {
    var keep = {};
    [-1, 0, 1, 2].forEach(function (d) {
      var s = SC[at + d];
      if (s) { keep[s.id] = 1; keep[s.id + ':s'] = 1; }
    });
    Object.keys(cache).forEach(function (k) { if (!keep[k]) delete cache[k]; });
  }

  var token = 0;

  // 어느 길로 오든 그 지점에 정해 둔 각도에서 시작합니다.
  // (왼쪽 목록에서 제목을 눌렀을 때와 같은 자리)
  function go(i) {
    if (!SC.length) return;
    at = Math.max(0, Math.min(SC.length - 1, i));
    var sc = SC[at];
    var my = ++token;

    toYaw = (sc.yaw || 0) * D2R;
    toPitch = 0;
    toFov = CFG.fov || 78;
    yaw = toYaw; pitch = 0; fov = toFov;

    paint();
    editPaint();

    // 먼저 흐릿한 미리보기를 깔고, 또렷한 사진이 다 오면 바꿔 끼웁니다
    var small = faces(sc.id, true);
    var big = faces(sc.id, false);

    var swap = function (imgs) {
      if (my !== token) return;
      var tmp = texA; texA = texB; texB = tmp;   // 쓰던 것을 뒤로 보내고
      upload(texA, imgs);
      mix = 0;
      draw();
    };

    elWait.hidden = false;
    whenReady(small, function (ok) { if (ok && my === token) swap(small); });
    whenReady(big, function (ok) {
      if (my !== token) return;
      elWait.hidden = true;
      if (ok) swap(big);
      [1, -1, 2].forEach(function (d) { if (SC[at + d]) faces(SC[at + d].id, true); });
      if (SC[at + 1]) faces(SC[at + 1].id, false);
      sweep();
    });

    if (window.tnpCount) {
      window.tnpCount('tour');
      window.tnpCount('room:' + sc.roomNo);
    }
  }

  /* ── 자막 ─────────────────────────────── */

  /* 장면마다 번역 자막을 보여 줍니다 (tour/captions.json).
     한 장면에 자막이 여러 개면 ‹ › 로 넘깁니다 — 글이 길어 한 화면에 다 안 들어갑니다.
     문구는 감수를 거친 공식 번역본이라 줄이거나 고치지 않고 그대로 보여 줍니다.
     국문 쪽은 아직 자막 원고가 없어 아예 안 불러옵니다. */

  var CAP = null;     // { "01": { en:[…], zh:[…], ja:[…] }, … }
  var capAt = 0;      // 지금 보여 주는 자막 순번
  var capOn = true;   // 보기/숨기기 — 손님이 고른 값을 기억합니다

  function capList() {
    var sc = SC[at];
    if (!CAP || !sc) return [];
    var r = CAP[sc.id];
    return (r && r[LANG]) || [];
  }

  function paintSub() {
    if (!elSub) return;
    var list = capList();
    // 자막이 없는 장면(11번)이나 손님이 숨긴 경우에는 자리를 아예 비웁니다
    if (!list.length || !capOn) { elSub.hidden = true; return; }
    if (capAt >= list.length) capAt = 0;

    elSub.hidden = false;
    elSubTx.textContent = list[capAt];   // 줄바꿈은 CSS(white-space)가 살립니다
    elSubTx.scrollTop = 0;

    var many = list.length > 1;
    elSubNo.hidden = !many;
    btnSubPrev.hidden = !many;
    btnSubNext.hidden = !many;
    if (many) {
      elSubNo.textContent = (capAt + 1) + ' / ' + list.length;
      btnSubPrev.disabled = (capAt === 0);
      btnSubNext.disabled = (capAt === list.length - 1);
    }
  }

  function capStep(d) {
    var n = capList().length;
    var to = capAt + d;
    if (to < 0 || to >= n) return;
    capAt = to;
    paintSub();
  }

  if (btnSubPrev) btnSubPrev.addEventListener('click', function () { capStep(-1); });
  if (btnSubNext) btnSubNext.addEventListener('click', function () { capStep(1); });

  if (btnCap) {
    btnCap.addEventListener('click', function () {
      capOn = !capOn;
      btnCap.setAttribute('aria-pressed', String(capOn));
      btnCap.setAttribute('aria-label', capOn ? TXT.capOff : TXT.cap);
      btnCap.title = capOn ? TXT.capOff : TXT.cap;
      try { localStorage.setItem('tnp:cap', capOn ? 'on' : 'off'); } catch (e) { /* 저장소를 못 써도 그대로 */ }
      paintSub();
    });
  }

  if (LANG !== 'ko' && elSub) {
    try { capOn = localStorage.getItem('tnp:cap') !== 'off'; } catch (e) { /* 저장소를 못 쓰면 켜 둡니다 */ }
    fetch(BASE + 'captions.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        CAP = d;
        if (btnCap) {
          btnCap.hidden = false;
          btnCap.setAttribute('aria-pressed', String(capOn));
          btnCap.setAttribute('aria-label', capOn ? TXT.capOff : TXT.cap);
          btnCap.title = capOn ? TXT.capOff : TXT.cap;
        }
        if (btnSubPrev) btnSubPrev.setAttribute('aria-label', TXT.capPrev);
        if (btnSubNext) btnSubNext.setAttribute('aria-label', TXT.capNext);
        paintSub();
      })
      .catch(function () { /* 자막을 못 불러와도 둘러보기는 그대로 돌아갑니다 */ });
  }

  function paint() {
    var sc = SC[at];
    if (!sc) return;
    elCapT.textContent = sc.title;
    elCapS.textContent = sc.room + ' · ' + (at + 1) + ' / ' + SC.length;
    capAt = 0;        // 장면이 바뀌면 자막도 첫 쪽부터
    paintSub();
    btnPrev.disabled = (at === 0);
    btnNext.disabled = (at === SC.length - 1);
    $$('button', elList).forEach(function (b) {
      var on = b.dataset.i === String(at);
      b.setAttribute('aria-current', String(on));
      if (on && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
    });
    buildSpots();
  }

  /* ── 장면 안의 표시 ───────────────────── */

  var spots = [];

  var SVG_UP = '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  var SVG_EYE = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5"/></svg>';

  function buildSpots() {
    var sc = SC[at];
    elSpots.innerHTML = '';
    spots = [];
    if (!sc) return;

    var add = function (cls, y, p, label, svg, onClick) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 't-spot ' + cls;
      el.innerHTML = '<span class="ico">' + svg + '</span><span class="lb"></span>';
      $('.lb', el).textContent = label;
      el.addEventListener('click', onClick);
      elSpots.appendChild(el);
      spots.push({ el: el, y: y * D2R, p: p * D2R });
    };

    // 화살표는 '다음 지점으로 걸어가는 길' 위에 놓입니다.
    // 방향은 make-tour.js 의 fwd·back (이웃 사진끼리 견주어 계산한 값).
    var fwd = (sc.fwd === undefined) ? (sc.yaw || 0) : sc.fwd;
    var back = (sc.back === undefined) ? fwd + 180 : sc.back;
    if (SC[at + 1]) add('go', fwd, -32, SC[at + 1].title, SVG_UP, function () { go(at + 1); });
    if (SC[at - 1]) add('go', back, -32, SC[at - 1].title, SVG_UP, function () { go(at - 1); });

    (sc.spots || []).forEach(function (s) {
      add('look', s.yaw, s.pitch || 0, s.label || TXT.look, SVG_EYE, function () { look(s); });
    });
  }

  function placeSpots() {
    var stack = { l: 0, r: 0 };     // 같은 쪽 가장자리에 여럿이면 아래로 쌓습니다
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i];
      var pt = project(s.y, s.p);
      var el = s.el;
      var inView = pt && pt.x > 10 && pt.x < W - 10 && pt.y > -40 && pt.y < H + 40;

      if (inView) {
        el.style.display = '';
        el.classList.remove('edge');
        el.style.left = pt.x + 'px';
        el.style.top = pt.y + 'px';
        continue;
      }

      // 화면 밖이면 — 이동 화살표만 가장자리에 붙여 어느 쪽인지 알려 줍니다
      if (!el.classList.contains('go')) { el.style.display = 'none'; continue; }
      var d = Math.atan2(Math.sin(s.y - yaw), Math.cos(s.y - yaw));
      var side = d > 0 ? 'r' : 'l';
      el.style.display = '';
      el.classList.add('edge');
      el.style.left = (d > 0 ? W - 16 : 16) + 'px';
      el.style.top = (H * 0.74 + stack[side] * 48) + 'px';
      el.dataset.side = side;
      stack[side]++;
    }
  }

  /* ── 들여다보기 (작품·글자 확대) ───────── */

  var look0 = $('.t-look', root);
  var lookImg = $('.t-look-img img', root);
  var lookBox = $('.t-look-img', root);
  var lz = { s: 1, x: 0, y: 0 };

  function lookDraw() {
    lookImg.style.transform = 'translate(-50%,-50%) translate(' + lz.x + 'px,' + lz.y + 'px) scale(' + lz.s + ')';
  }

  function look(s) {
    $('.t-look-top b', root).textContent = s.label || TXT.look;
    $('.t-look-top p', root).textContent = s.text || '';
    lookImg.src = s.img ? (BASE + s.img) : '';
    lz = { s: 1, x: 0, y: 0 };
    lookDraw();
    look0.hidden = false;
    stopPlay();
  }

  $('.t-look .close', root).addEventListener('click', function () { look0.hidden = true; });

  lookBox.addEventListener('wheel', function (e) {
    e.preventDefault();
    lz.s = Math.max(1, Math.min(6, lz.s * (e.deltaY < 0 ? 1.15 : 0.87)));
    if (lz.s === 1) { lz.x = 0; lz.y = 0; }
    lookDraw();
  }, { passive: false });

  var ldrag = null;
  lookBox.addEventListener('pointerdown', function (e) {
    lookBox.setPointerCapture(e.pointerId);
    ldrag = { x: e.clientX, y: e.clientY };
    lookBox.classList.add('dragging');
  });
  lookBox.addEventListener('pointermove', function (e) {
    if (!ldrag) return;
    lz.x += e.clientX - ldrag.x;
    lz.y += e.clientY - ldrag.y;
    ldrag = { x: e.clientX, y: e.clientY };
    lookDraw();
  });
  ['pointerup', 'pointercancel'].forEach(function (t) {
    lookBox.addEventListener(t, function () { ldrag = null; lookBox.classList.remove('dragging'); });
  });

  /* ── 화살표 방향 고치기 ───────────────────
     주소 뒤에 ?edit=1 을 붙이면 켜집니다. 보고 있는 쪽을 '가는 길'로 찍어 두고
     저장하면, 관리자 서버에 남아 모든 사람에게 그대로 보입니다.
     사진만 봐서는 어느 쪽으로 걸어갔는지 기계가 못 가릴 때가 있어 만들어 둡니다. */

  var DIRS = {};        // { '13': { f: -112, b: 107 }, … }
  var editing = /[?&]edit=1/.test(location.search);
  var dirty = false;

  function applyDirs(items) {
    if (!items || !items['tour.dirs']) return;
    try { DIRS = JSON.parse(items['tour.dirs']) || {}; } catch (e) { return; }
    SC.forEach(function (s) {
      var d = DIRS[s.id];
      if (!d) return;
      if (typeof d.f === 'number') s.fwd = d.f;
      if (typeof d.b === 'number') s.back = d.b;
    });
    if (open) buildSpots();
  }

  function here() {
    return Math.round(((yaw * 180 / Math.PI) % 360 + 540) % 360 - 180);
  }

  function setDir(which) {
    var id = SC[at].id;
    DIRS[id] = DIRS[id] || {};
    DIRS[id][which] = here();
    if (which === 'f') SC[at].fwd = here(); else SC[at].back = here();
    dirty = true;
    buildSpots();
    editPaint();
  }

  var editBox = null;

  function editPaint() {
    if (!editBox) return;
    var sc = SC[at];
    $('.e-now', editBox).textContent = here() + '°';
    $('.e-val', editBox).textContent =
      '다음 ' + (sc.fwd === undefined ? '—' : Math.round(sc.fwd) + '°')
      + '  ·  뒤로 ' + (sc.back === undefined ? '—' : Math.round(sc.back) + '°');
    $('.e-save', editBox).disabled = !dirty;
  }

  function startEdit() {
    editBox = document.createElement('div');
    editBox.className = 't-edit';
    editBox.innerHTML =
      '<p class="e-hd">화살표 방향 고치기</p>'
      + '<p class="e-now"></p>'
      + '<p class="e-val"></p>'
      + '<div class="e-row">'
      + '<button type="button" class="e-f">여기가 다음 길</button>'
      + '<button type="button" class="e-b">여기가 뒤로 길</button>'
      + '</div>'
      + '<button type="button" class="e-save" disabled>서버에 저장</button>'
      + '<p class="e-msg"></p>';
    $('.t-stage', root).appendChild(editBox);
    $('.e-f', editBox).addEventListener('click', function () { setDir('f'); });
    $('.e-b', editBox).addEventListener('click', function () { setDir('b'); });
    $('.e-save', editBox).addEventListener('click', saveDirs);
    editPaint();
  }

  function saveDirs() {
    var code = sessionStorage.getItem('tnp:admin') || prompt('관리자 코드');
    if (!code) return;
    var msg = $('.e-msg', editBox);
    msg.textContent = '저장하는 중…';
    var api = /^(localhost|127\.0\.0\.1)$/.test(location.hostname)
      ? 'http://127.0.0.1:8787' : 'https://qr-mission-api.jhmonounity.workers.dev';
    fetch(api + '/api/admin/content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': code },
      body: JSON.stringify({ site: 'testimony', items: { 'tour.dirs': JSON.stringify(DIRS) } }),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || '저장하지 못했습니다');
        try { sessionStorage.setItem('tnp:admin', code); } catch (e) { /* 안 되면 매번 */ }
        dirty = false;
        editPaint();
        msg.textContent = '저장했습니다.';
      })
      .catch(function (e) { msg.textContent = e.message; });
  }

  /* ── 손짓 ─────────────────────────────── */

  var drag = null;

  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, moved: 0 };
    root.classList.add('dragging');
    stopPlay();
    hideHint();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var k = fov * D2R / (H || 1);
    toYaw -= (e.clientX - drag.x) * k;
    // 위아래는 끄는 방향 그대로 — 아래로 끌면 아래를 봅니다
    toPitch = Math.max(-1.35, Math.min(1.35, toPitch - (e.clientY - drag.y) * k));
    yaw = toYaw; pitch = toPitch;          // 끄는 동안은 손끝을 그대로 따라갑니다
    drag.moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
    drag.x = e.clientX; drag.y = e.clientY;
    draw();
    editPaint();
  });

  ['pointerup', 'pointercancel'].forEach(function (t) {
    canvas.addEventListener(t, function () { drag = null; root.classList.remove('dragging'); });
  });

  // 두 번 누르면 그 자리를 당겨 봅니다 — 글자·작품 확대
  canvas.addEventListener('dblclick', function (e) {
    var r = canvas.getBoundingClientRect();
    aimAt(e.clientX - r.left, e.clientY - r.top);
    zoom(fov > 34 ? fov * 0.45 : fovMax * 0.85);
  });

  /** 화면의 한 점이 한가운데로 오도록 돌립니다 */
  function aimAt(sx, sy) {
    var t = Math.tan(fov * D2R / 2);
    var aspect = (W || 1) / (H || 1);
    var vx = (sx / W * 2 - 1) * t * aspect;
    var vy = (1 - sy / H * 2) * t;
    var vz = -1;
    var L = Math.hypot(vx, vy, vz);
    vx /= L; vy /= L; vz /= L;

    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var wx = cy * vx + sy * sp * vy + sy * cp * vz;
    var wy = cp * vy - sp * vz;
    var wz = -sy * vx + cy * sp * vy + cy * cp * vz;

    // 한 바퀴 빙 돌지 않도록 가까운 쪽으로만 틉니다
    var want = Math.atan2(wx, -wz);
    var d = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
    toYaw = yaw + d;
    toPitch = Math.max(-1.35, Math.min(1.35, Math.asin(wy)));
    draw();
  }

  var pinch = 0;
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                         e.touches[0].clientY - e.touches[1].clientY);
      drag = null;
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && pinch) {
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                         e.touches[0].clientY - e.touches[1].clientY);
      zoom(fov * pinch / d);
      pinch = d;
      e.preventDefault();
    }
  }, { passive: false });

  canvas.addEventListener('touchend', function () { pinch = 0; });

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    stopPlay();
    zoom(fov + e.deltaY * 0.06);
  }, { passive: false });

  function zoom(v) {
    toFov = Math.max(fovMin, Math.min(fovMax, v));
    draw();
  }

  /* ── 자동 플레이 ──────────────────────── */

  var playTimer = 0;

  function tick() {
    if (!playing) return;
    go(at >= SC.length - 1 ? 0 : at + 1);
    playTimer = setTimeout(tick, (CFG.dwell || 9) * 1000);
  }

  function startPlay() {
    if (playing) return;
    playing = true;
    btnPlay.classList.add('on');
    btnPlay.setAttribute('aria-label', TXT.stop);
    btnPlay.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14"/></svg>';
    toYaw = yaw;
    playTimer = setTimeout(tick, (CFG.dwell || 9) * 1000);
    draw();
  }

  function stopPlay() {
    if (!playing) return;
    playing = false;
    clearTimeout(playTimer);
    btnPlay.classList.remove('on');
    btnPlay.setAttribute('aria-label', TXT.play);
    btnPlay.innerHTML = '<svg viewBox="0 0 24 24"><path d="M7 4l12 8-12 8z" fill="currentColor" stroke="none"/></svg>';
    toYaw = yaw;
  }

  btnPlay.addEventListener('click', function () { playing ? stopPlay() : startPlay(); });

  /* ── 단추들 ───────────────────────────── */

  btnPrev.addEventListener('click', function () { stopPlay(); go(at - 1); });
  btnNext.addEventListener('click', function () { stopPlay(); go(at + 1); });

  $('.t-btn.home', root).addEventListener('click', function () { stopPlay(); go(0); });
  $('.t-btn.zin', root).addEventListener('click', function () { stopPlay(); zoom(fov * 0.7); });
  $('.t-btn.zout', root).addEventListener('click', function () { stopPlay(); zoom(fov * 1.4); });

  var btnFull = $('.t-btn.full', root);
  btnFull.addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (root.requestFullscreen) root.requestFullscreen();
  });

  $('.t-side-toggle', root).addEventListener('click', function () { root.classList.toggle('menu'); });

  $('.t-btn.close', root).addEventListener('click', function () { close(); });

  /* ── 자판 ─────────────────────────────── */

  var KEY = {
    w: 'f', s: 'b', a: 'l', d: 'r', ㅈ: 'f', ㄴ: 'b', ㅁ: 'l', ㅇ: 'r',
    arrowleft: 'l', arrowright: 'r', arrowup: 'u', arrowdown: 'd',
  };

  document.addEventListener('keydown', function (e) {
    if (!open || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (!look0.hidden) look0.hidden = true;
      else close();
    } else if (e.key === ' ') {
      playing ? stopPlay() : startPlay();
    } else if (e.key === '+' || e.key === '=') { zoom(fov * 0.75); }
    else if (e.key === '-') { zoom(fov * 1.33); }
    else {
      var k = KEY[e.key.toLowerCase()];
      if (!k) return;
      stopPlay();
      hideHint();
      if (k === 'f') go(at + 1);
      else if (k === 'b') go(at - 1);
      else if (k === 'l') { toYaw -= 0.22; draw(); }
      else if (k === 'r') { toYaw += 0.22; draw(); }
      else if (k === 'u') { toPitch = Math.min(1.35, toPitch + 0.16); draw(); }
      else if (k === 'd') { toPitch = Math.max(-1.35, toPitch - 0.16); draw(); }
    }
    e.preventDefault();
  });

  /* ── 안내 쪽지 ────────────────────────── */

  var hintT = 0;
  function showHint() {
    elHint.hidden = false;
    elHint.style.opacity = '1';
    hintT = setTimeout(hideHint, 4000);
  }
  function hideHint() {
    clearTimeout(hintT);
    if (elHint.hidden) return;
    elHint.style.opacity = '0';
    setTimeout(function () { elHint.hidden = true; }, 500);
  }

  /* ── 열고 닫기 ────────────────────────── */

  function shut() {
    if (!open) return;
    open = false;
    stopPlay();
    root.hidden = true;
    root.classList.remove('menu');
    look0.hidden = true;
    document.body.style.overflow = '';
  }

  function close() {
    if (location.hash === '#tour') history.back();
    else shut();
  }

  function start(roomNo) {
    if (!ready) return;
    open = true;
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    resize();
    var i = 0;
    if (roomNo) {
      for (var k = 0; k < SC.length; k++) { if (SC[k].roomNo === roomNo) { i = k; break; } }
    }
    last = performance.now();
    go(i);
    showHint();
    if (editing && !editBox) startEdit();
    if (location.hash !== '#tour') history.pushState(null, '', location.pathname + location.search + '#tour');
  }

  window.addEventListener('hashchange', function () {
    if (location.hash === '#tour') { if (!open) start(null); }
    else shut();
  });

  window.addEventListener('resize', function () { if (open) { resize(); draw(); } });

  /* ── 목록 불러오기 ────────────────────── */

  fetch(BASE + 'tour.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.open === false || !gl) return;
      CFG = data;
      fovMin = data.fovMin || 18;
      fovMax = data.fovMax || 100;
      fov = toFov = data.fov || 78;

      data.rooms.forEach(function (rm) {
        rm.scenes.forEach(function (s) {
          SC.push({
            id: s.id, title: L(s.title), yaw: s.yaw || 0, fwd: s.fwd, back: s.back,
            spots: s.spots || [], room: roomName(rm), roomNo: rm.no,
          });
        });
      });
      if (!SC.length) return;

      // 왼쪽 목록
      var i = 0;
      data.rooms.forEach(function (rm) {
        var h = document.createElement('p');
        h.className = 't-room';
        h.textContent = rm.no + '  ' + roomName(rm);
        elList.appendChild(h);
        rm.scenes.forEach(function (s) {
          var b = document.createElement('button');
          b.type = 'button';
          b.dataset.i = String(i++);
          b.textContent = L(s.title);
          b.addEventListener('click', function () {
            stopPlay();
            root.classList.remove('menu');
            go(+b.dataset.i);
          });
          elList.appendChild(b);
        });
      });

      initGL();
      ready = true;

      var enter = $('#view-hall .enter');
      if (enter) {
        enter.removeAttribute('data-soon');
        enter.addEventListener('click', function () { start(null); });
      }
      $$('#view-hall .room').forEach(function (el) {
        var no = ($('.no', el) || {}).textContent;
        if (!data.rooms.some(function (r) { return r.no === no; })) return;
        el.removeAttribute('data-soon');
        el.addEventListener('click', function () { start(no); });
      });

      applyDirs(window.tnpCms);
      document.addEventListener('tnp:cms', function (e) { applyDirs(e.detail); });

      // 관리자가 전시실 이름을 고치면 여기도 따라갑니다
      document.addEventListener('tnp:cms', function () {
        SC.forEach(function (s) {
          var el = $('#view-hall [data-cms="room.' + s.roomNo + '"]');
          if (el && el.textContent.trim()) s.room = el.textContent.trim();
        });
        $$('.t-room', elList).forEach(function (h) {
          var no = h.textContent.trim().slice(0, 2);
          var el = $('#view-hall [data-cms="room.' + no + '"]');
          if (el && el.textContent.trim()) h.textContent = no + '  ' + el.textContent.trim();
        });
        if (open) paint();
      });

      if (location.hash === '#tour') {
        history.replaceState(null, '', location.pathname + location.search + '#3d');
        start(null);
      }
    })
    .catch(function (e) {
      // 목록이 없으면 전처럼 '준비 중' 알림이 뜹니다.
      // 다만 까닭은 남겨 둡니다 — 조용히 삼키면 고칠 때 한참 헤맵니다.
      if (window.console) console.warn('[tour] 목록을 못 폈습니다:', e);
    });
})();
