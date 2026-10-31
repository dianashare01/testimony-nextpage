/* 온라인 전시관 — 360 사진 둘러보기
   바깥 라이브러리 없이 WebGL 로 직접 그립니다.
   전시실·지점 목록은 tour/tour.json 에 있습니다. */

(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var root = $('#pano');
  if (!root) return;

  var canvas = $('canvas', root);
  var elRoom = $('.pano-where .rm', root);
  var elCount = $('.pano-where .ct', root);
  var elWait = $('.pano-wait', root);
  var elHint = $('.pano-hint', root);
  var elMenu = $('.pano-menu', root);
  var elList = $('.pano-menu ol', root);
  var btnPrev = $('.pano-step.prev', root);
  var btnNext = $('.pano-step.next', root);
  var btnBack = $('.pano-back', root);
  var btnMenu = $('.pano-icon.menu', root);

  /* ── 상태 ─────────────────────────────── */

  var FLAT = [];       // 모든 지점을 한 줄로 편 것
  var ready = false;
  var at = 0;
  var yaw = 0, pitch = 0, fov = 75, fovBase = 75;
  var open = false;
  var cache = {};

  /* 찍는 사람이 사진 한가운데(lon 0)에 서 있습니다.
     그 사람이 차지한 구간을 화면 가장자리에도 걸리지 않게 막습니다.
     막는 폭은 보는 각도에 따라 달라지므로 그때그때 계산합니다.
     삼각대로 다시 찍어 사람이 없어지면 tour.json 의 block 을 지우세요. */

  var bFrom = 0, bTo = 0, blocked = false;  // 막힌 구간(라디안)
  var downMax = 1.45;                        // 아래로 볼 수 있는 한계
  var nadir = [1, 1];                        // 아래쪽을 덮기 시작/끝 (0~1)
  // 모자이크 자리. 머리와 몸, 두 덩이로 덮어야 사람 모양에 맞게 들어갑니다.
  // 한 덩이는 [가운데 u, 가운데 v, 반지름 u, 반지름 v].
  var mask = [[0, 0, 0, 0], [0, 0, 0, 0]];
  var grid = 0;                              // 모자이크 칸 수. 0 이면 안 덮음

  var TAU = Math.PI * 2;

  function norm(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
  function wrap(a) { return ((a % TAU) + TAU) % TAU; }

  // 지금 화면에 들어오는 좌우 폭의 절반
  function halfWide() {
    return Math.atan(((W || 1) / (H || 1)) * Math.tan(fov * Math.PI / 360));
  }

  function clampYaw(a) {
    if (!blocked) return norm(a);
    var m = halfWide();
    var lo = bTo + m;              // 볼 수 있는 구간의 시작
    var hi = bFrom + TAU - m;      // 볼 수 있는 구간의 끝
    if (hi <= lo) return norm((bTo + bFrom + TAU) / 2);
    var t = lo + wrap(a - lo);
    if (t <= hi) return norm(t);
    // 막힌 쪽으로 넘어왔으면 가까운 가장자리에 세웁니다
    return norm((t - hi < lo + TAU - t) ? hi : lo);
  }

  function clampPitch(a) { return Math.max(-downMax, Math.min(1.35, a)); }

  /* ── WebGL ────────────────────────────── */

  var gl = canvas.getContext('webgl', { antialias: true, alpha: false }) ||
           canvas.getContext('experimental-webgl');

  var prog, tex, idxCount, loc = {};

  var VERT =
    'attribute vec3 p; attribute vec2 t; uniform mat4 mvp; varying vec2 uv;' +
    'void main(){ uv = t; gl_Position = mvp * vec4(p, 1.0); }';

  /* 찍는 사람이 선 자리는 모자이크로 덮고, 아래쪽(팔·손과 두 렌즈가
     만나는 자리)은 어둡게 덮습니다. 덮는 자리는 tour.json 에 있습니다. */
  var FRAG =
    '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n' +
    '#else\nprecision mediump float;\n#endif\n' +
    'uniform sampler2D img; uniform float dim; uniform vec2 nadir;' +
    'uniform vec4 head; uniform vec4 body; uniform float grid; varying vec2 uv;' +
    'float blob(vec4 b){ return 1.0 - smoothstep(0.88, 1.0, length((uv - b.xy) / b.zw)); }' +
    'void main(){' +
    '  vec3 c = texture2D(img, uv).rgb;' +
    '  if (grid > 0.0) {' +
    '    float m = max(blob(head), blob(body));' +
    '    if (m > 0.0) {' +
    '      vec2 g = vec2(grid, grid * 0.5);' +
    '      vec2 q = (floor(uv * g) + 0.5) / g;' +
    '      c = mix(c, texture2D(img, q, 4.0).rgb, m);' +
    '    }' +
    '  }' +
    '  float f = smoothstep(nadir.x, nadir.y, uv.y);' +
    '  c = mix(c, vec3(0.072, 0.055, 0.105), f);' +
    '  gl_FragColor = vec4(c * dim, 1.0);' +
    '}';

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  function buildSphere() {
    var ROWS = 64, COLS = 128;
    var data = [], idx = [];
    for (var r = 0; r <= ROWS; r++) {
      var v = r / ROWS, lat = (0.5 - v) * Math.PI;
      for (var c = 0; c <= COLS; c++) {
        var u = c / COLS, lon = (u - 0.5) * Math.PI * 2;
        data.push(Math.sin(lon) * Math.cos(lat), Math.sin(lat), -Math.cos(lon) * Math.cos(lat), u, v);
      }
    }
    for (var rr = 0; rr < ROWS; rr++) {
      for (var cc = 0; cc < COLS; cc++) {
        var a = rr * (COLS + 1) + cc, b = a + COLS + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    idxCount = idx.length;

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  }

  function initGL() {
    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    loc.p = gl.getAttribLocation(prog, 'p');
    loc.t = gl.getAttribLocation(prog, 't');
    loc.mvp = gl.getUniformLocation(prog, 'mvp');
    loc.img = gl.getUniformLocation(prog, 'img');
    loc.dim = gl.getUniformLocation(prog, 'dim');
    loc.nadir = gl.getUniformLocation(prog, 'nadir');
    loc.head = gl.getUniformLocation(prog, 'head');
    loc.body = gl.getUniformLocation(prog, 'body');
    loc.grid = gl.getUniformLocation(prog, 'grid');

    buildSphere();

    gl.enableVertexAttribArray(loc.p);
    gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(loc.t);
    gl.vertexAttribPointer(loc.t, 2, gl.FLOAT, false, 20, 12);

    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE,
                  new Uint8Array([20, 16, 28]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(loc.img, 0);
    gl.uniform1f(loc.dim, 1);
    gl.uniform2f(loc.nadir, nadir[0], nadir[1]);
    gl.uniform4fv(loc.head, mask[0]);
    gl.uniform4fv(loc.body, mask[1]);
    gl.uniform1f(loc.grid, grid);
    gl.clearColor(0.05, 0.035, 0.08, 1);
  }

  function upload(im) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
    var pot = function (n) { return n > 0 && (n & (n - 1)) === 0; };
    if (pot(im.naturalWidth) && pot(im.naturalHeight)) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
  }

  /* ── 그리기 ───────────────────────────── */

  var W = 0, H = 0, dim = 1, dimTo = 1, raf = 0;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function mvp() {
    var aspect = (W || 1) / (H || 1);
    var f = 1 / Math.tan(fov * Math.PI / 360);
    var near = 0.1, far = 10;
    // 열 우선. 세로를 기준으로 시야각을 잡습니다.
    var P = [f / aspect, 0, 0, 0,
             0, f, 0, 0,
             0, 0, (far + near) / (near - far), -1,
             0, 0, 2 * far * near / (near - far), 0];

    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var V = [cy, sp * sy, cp * sy, 0,
             0, cp, -sp, 0,
             -sy, sp * cy, cp * cy, 0,
             0, 0, 0, 1];

    var M = new Float32Array(16);
    for (var c = 0; c < 4; c++) {
      for (var r = 0; r < 4; r++) {
        var s = 0;
        for (var k = 0; k < 4; k++) s += P[k * 4 + r] * V[c * 4 + k];
        M[c * 4 + r] = s;
      }
    }
    return M;
  }

  function frame() {
    raf = 0;
    if (!open) return;
    if (canvas.clientWidth !== W || canvas.clientHeight !== H) resize();
    dim += (dimTo - dim) * 0.18;
    if (Math.abs(dim - dimTo) < 0.004) dim = dimTo;
    fov += (fovBase - fov) * 0.16;
    if (Math.abs(fov - fovBase) < 0.15) fov = fovBase;
    held();
    yaw = clampYaw(yaw);   // 화면 크기나 배율이 바뀌어도 막힌 쪽이 열리지 않게
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(loc.dim, dim);
    gl.uniformMatrix4fv(loc.mvp, false, mvp());
    gl.drawElements(gl.TRIANGLES, idxCount, gl.UNSIGNED_SHORT, 0);
    if (dim !== dimTo || fov !== fovBase || walking()) draw();
  }

  function draw() { if (!raf) raf = requestAnimationFrame(frame); }

  /* ── 지점 옮기기 ──────────────────────── */

  function img(src) {
    if (cache[src]) return cache[src];
    var im = new Image();
    im.decoding = 'async';
    cache[src] = im;
    im.src = src;
    return im;
  }

  // 받아 둔 사진이 쌓이면 휴대폰 기억칸이 모자라므로,
  // 지금 지점 둘레만 남기고 놓아 줍니다.
  function sweep() {
    var keep = {};
    for (var d = -3; d <= 3; d++) {
      if (FLAT[at + d]) keep[FLAT[at + d].img] = true;
    }
    Object.keys(cache).forEach(function (src) {
      if (keep[src]) return;
      delete cache[src];
    });
  }

  function go(i, keep) {
    if (!FLAT.length) return;
    var was = at;
    at = Math.max(0, Math.min(FLAT.length - 1, i));
    if (at === was && keep) return;
    var sc = FLAT[at];
    if (keep) {
      // 걸어가듯 옮길 때는 보던 방향을 그대로 둡니다
      yaw = clampYaw(yaw);
      pitch = clampPitch(pitch * 0.6);
      fov = fovBase * (at > was ? 0.84 : 1.16);   // 앞/뒤로 한 걸음
    } else {
      yaw = clampYaw((sc.yaw || 0) * Math.PI / 180);
      pitch = 0;
      fov = fovBase;
    }
    paint();

    var im = img(sc.img);

    var show = function () {
      if (FLAT[at] !== sc) return;        // 그새 다른 지점으로 옮겼으면 버립니다
      upload(im);
      dimTo = 1;
      elWait.hidden = true;
      draw();
      [1, -1, 2].forEach(function (d) {
        if (FLAT[at + d]) img(FLAT[at + d].img);
      });
      sweep();
    };

    if (im.complete && im.naturalWidth) {
      show();
    } else {
      dimTo = 0.2;
      draw();
      elWait.textContent = '사진을 불러오는 중…';
      elWait.hidden = false;
      im.addEventListener('load', show, { once: true });
      im.addEventListener('error', function () {
        if (FLAT[at] !== sc) return;
        elWait.textContent = '사진을 불러오지 못했습니다';
      }, { once: true });
    }
  }

  function paint() {
    var sc = FLAT[at];
    if (!sc) return;
    if (window.tnpCount) window.tnpCount('room:' + sc.roomNo);
    elRoom.textContent = sc.roomName;
    elCount.textContent = sc.roomNo + ' · ' + (sc.inRoom + 1) + ' / ' + sc.roomTotal;
    btnPrev.disabled = (at === 0);
    btnNext.disabled = (at === FLAT.length - 1);
    $$('button', elList).forEach(function (b) {
      b.setAttribute('aria-current', String(b.dataset.room === sc.roomNo));
    });
  }

  /* ── 손짓 ─────────────────────────────── */

  var drag = null;

  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY };
    root.classList.add('dragging');
    hideHint();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var k = fov * Math.PI / 180 / (H || 1);
    yaw = clampYaw(yaw - (e.clientX - drag.x) * k, yaw);
    pitch = clampPitch(pitch + (e.clientY - drag.y) * k);
    drag.x = e.clientX;
    drag.y = e.clientY;
    draw();
  });

  ['pointerup', 'pointercancel'].forEach(function (t) {
    canvas.addEventListener(t, function () { drag = null; root.classList.remove('dragging'); });
  });

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
    zoom(fov + e.deltaY * 0.05);
  }, { passive: false });

  function zoom(v) { fovBase = fov = Math.max(35, Math.min(100, v)); draw(); }

  /* ── W A S D 로 걷기 ──────────────────────
     사진은 찍은 자리에서만 볼 수 있으므로, 실제로는 '다음 지점'으로
     옮겨 가는 것입니다. 누르고 있으면 한 걸음씩 계속 나아갑니다. */

  var keys = {};
  var stepAt = 0;

  var KEY = {
    w: 'fwd', s: 'back', a: 'left', d: 'right',
    arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
    ㅈ: 'fwd', ㄴ: 'back', ㅁ: 'left', ㅇ: 'right'
  };

  function walking() {
    return open && (keys.fwd || keys.back || keys.left || keys.right || keys.up || keys.down);
  }

  function held() {
    if (!walking()) return;
    var turn = keys.shift ? 0.055 : 0.03;
    if (keys.left) yaw = clampYaw(yaw - turn, yaw);
    if (keys.right) yaw = clampYaw(yaw + turn, yaw);
    if (keys.up) pitch = clampPitch(pitch + turn * 0.7);
    if (keys.down) pitch = clampPitch(pitch - turn * 0.7);

    if (keys.fwd || keys.back) {
      var now = Date.now();
      var gap = keys.shift ? 170 : 330;
      if (now - stepAt > gap) {
        stepAt = now;
        go(at + (keys.fwd ? 1 : -1), true);
      }
    }
  }

  document.addEventListener('keydown', function (e) {
    if (!open) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    keys.shift = e.shiftKey;

    if (e.key === 'Escape') { if (!elMenu.hidden) elMenu.hidden = true; else close(); }
    else if (e.key === '[' || e.key === ',') go(at - 1);
    else if (e.key === ']' || e.key === '.') go(at + 1);
    else {
      var k = KEY[e.key.toLowerCase()];
      if (!k) return;
      hideHint();
      if (!keys[k]) { keys[k] = true; stepAt = 0; draw(); }
    }
    e.preventDefault();
  });

  document.addEventListener('keyup', function (e) {
    var k = KEY[e.key.toLowerCase()];
    if (k) keys[k] = false;
    keys.shift = e.shiftKey;
  });

  window.addEventListener('blur', function () { keys = {}; });

  /* ── 처음 안내 ────────────────────────── */

  var hintTimer = 0;

  function showHint() {
    elHint.hidden = false;
    elHint.style.opacity = '1';
    hintTimer = setTimeout(hideHint, 3500);
  }

  function hideHint() {
    clearTimeout(hintTimer);
    if (elHint.hidden) return;
    elHint.style.opacity = '0';
    setTimeout(function () { elHint.hidden = true; }, 500);
  }

  /* ── 열고 닫기 ────────────────────────── */

  function shut() {
    if (!open) return;
    open = false;
    root.hidden = true;
    elMenu.hidden = true;
    document.body.style.overflow = '';
  }

  // 나가기는 뒤로 가기로 처리합니다. 휴대폰에서 뒤로 가기를 눌러도
  // 전시관 화면으로 돌아오고, 주소를 그대로 보내면 그 둘러보기가 열립니다.
  function close() {
    if (location.hash === '#tour') history.back();
    else shut();
  }

  window.addEventListener('hashchange', function () {
    if (location.hash === '#tour') { if (!open) start(null); }
    else shut();
  });

  function start(roomNo) {
    if (!ready) return;
    open = true;
    root.hidden = false;
    document.body.style.overflow = 'hidden';
    elMenu.hidden = true;
    resize();
    var i = 0;
    if (roomNo) {
      for (var k = 0; k < FLAT.length; k++) {
        if (FLAT[k].roomNo === roomNo) { i = k; break; }
      }
    }
    go(i);
    showHint();
    if (window.tnpCount) window.tnpCount('tour');
    if (location.hash !== '#tour') history.pushState(null, '', location.pathname + '#tour');
  }

  function jump(roomNo) {
    if (!open) { start(roomNo); return; }
    elMenu.hidden = true;
    for (var k = 0; k < FLAT.length; k++) {
      if (FLAT[k].roomNo === roomNo) { go(k); return; }
    }
  }

  btnBack.addEventListener('click', close);
  btnPrev.addEventListener('click', function () { go(at - 1, true); });
  btnNext.addEventListener('click', function () { go(at + 1, true); });
  btnMenu.addEventListener('click', function () { elMenu.hidden = !elMenu.hidden; });
  elMenu.addEventListener('click', function (e) { if (e.target === elMenu) elMenu.hidden = true; });

  /* ── 목록 불러오기 ────────────────────── */

  fetch('tour/tour.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      // tour.json 의 open 이 false 면 둘러보기를 아예 켜지 않습니다.
      // 단추에 data-soon 이 그대로 남아, 누르면 「오픈 준비 중입니다」가 뜹니다.
      // 다시 열려면 tour.json 의 "open": false 를 true 로 바꾸면 됩니다.
      if (data.open === false) return;

      if (data.block) {
        bFrom = data.block[0] * Math.PI / 180;
        bTo = data.block[1] * Math.PI / 180;
        blocked = true;
      }
      if (data.down) downMax = data.down * Math.PI / 180;
      if (data.nadir) nadir = data.nadir;
      if (data.mask) { mask = data.mask; grid = data.grid || 150; }

      data.rooms.forEach(function (rm) {
        rm.scenes.forEach(function (sc, i) {
          FLAT.push({
            img: data.base + rm.dir + '/' + sc.f,
            yaw: (sc.y === undefined) ? (data.yaw || 0) : sc.y,
            roomNo: rm.no,
            roomName: rm.name,
            inRoom: i,
            roomTotal: rm.scenes.length
          });
        });
      });
      if (!FLAT.length) return;

      data.rooms.forEach(function (rm) {
        var li = document.createElement('li');
        var b = document.createElement('button');
        b.type = 'button';
        b.dataset.room = rm.no;
        b.innerHTML = '<span class="no"></span><span class="rt"></span><span class="ct"></span>';
        $('.no', b).textContent = rm.no;
        $('.rt', b).textContent = rm.name;
        $('.ct', b).textContent = rm.scenes.length + '지점';
        b.addEventListener('click', function () { jump(rm.no); });
        li.appendChild(b);
        elList.appendChild(li);
      });

      initGL();
      ready = true;

      // 전시관 화면의 단추를 둘러보기에 이어 붙입니다.
      // 사진이 있는 전시실만 '준비 중' 알림을 떼어 냅니다.
      var enter = $('#view-hall .enter');
      if (enter) {
        enter.removeAttribute('data-soon');
        enter.addEventListener('click', function () { start(null); });
      }
      $$('#view-hall .room').forEach(function (el) {
        var no = ($('.no', el) || {}).textContent;
        if (!data.rooms.some(function (r) { return r.no === no; })) return;
        el.removeAttribute('data-soon');
        el.addEventListener('click', function () { jump(no); });
      });

      // 주소에 #tour 를 달고 들어온 경우. 뒤로 가기가 전시관 화면으로
      // 가도록 한 칸을 깔아 둡니다.
      if (location.hash === '#tour') {
        history.replaceState(null, '', location.pathname + '#3d');
        start(null);
      }

      // 관리자가 전시실 이름을 고치면 둘러보기 쪽도 같이 바뀝니다
      document.addEventListener('tnp:cms', function () {
        FLAT.forEach(function (sc) {
          var el = document.querySelector('#view-hall [data-cms="room.' + sc.roomNo + '"]');
          if (el && el.textContent.trim()) sc.roomName = el.textContent.trim();
        });
        $$('button', elList).forEach(function (b) {
          var el = document.querySelector('#view-hall [data-cms="room.' + b.dataset.room + '"]');
          if (el && el.textContent.trim()) $('.rt', b).textContent = el.textContent.trim();
        });
        if (open) paint();
      });
    })
    .catch(function () { /* 목록이 없으면 전처럼 '준비 중' 알림이 뜹니다 */ });

  window.addEventListener('resize', function () { if (open) { resize(); draw(); } });
})();
