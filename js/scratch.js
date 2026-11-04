/*
 * 刮刮卡。刮层是卡背图，画在 canvas 上，手指划过的地方擦掉。
 * 防 bug 要点：
 *  - 刮的时候页面不滚动、不缩放、不弹长按菜单（CSS touch-action:none + 事件拦截）
 *  - 两次采样之间连线补齐，快速划也不会断成点
 *  - 手指划出卡片再回来照样生效（pointer capture）
 *  - 「刮了多少」用 20×28 的网格估算，不读整张像素，低端机不卡
 *  - 尺寸变化时按记录的笔画重画，已刮的部分不会丢
 *  - 达到阈值后在手指抬起时翻开，这一下算用户操作，视频可以带声播放
 *  - 刮的声音是秃秃的「嘟」，划过一段距离嘟一声，节奏跟着手速，音高跟着进度
 */
(function () {
  var COLS = 20, ROWS = 28;
  // 「嘟」的音阶（五声音阶），刮得越多音越高，快翻开时像在往上爬
  var NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7];

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('图片加载失败：' + src)); };
      img.src = src;
    });
  }

  function Scratch(box, opts) {
    this.box = box;
    this.opts = opts;
    this.threshold = opts.threshold || 0.55;
    this.segs = [];                    // 归一化坐标的笔画
    this.grid = new Uint8Array(COLS * ROWS);
    this.marked = 0;
    this.pointers = {};
    this.done = false;
    this.due = false;
    this.touched = false;
    this.lastMove = 0;
    this.speed = 0;
    this.travel = 0; this.lastDu = 0; this.duCount = 0;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'scratch-layer';
    this.canvas.setAttribute('aria-hidden', 'true');
    box.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    var self = this;
    this.ready = loadImage(opts.cover).then(function (img) {
      self.cover = img;
      self.layout();
      self._bind();
      self.box.classList.add('is-ready');
    });
  }

  Scratch.prototype.layout = function () {
    var r = this.box.getBoundingClientRect();
    if (!r.width) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.radius = r.width * 0.085;
    this._paintCover();
    for (var i = 0; i < this.segs.length; i++) this._erase(this.segs[i], false);
  };

  Scratch.prototype._paintCover = function () {
    var c = this.ctx, img = this.cover;
    c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, this.w, this.h);
    // 按 cover 方式铺满
    var s = Math.max(this.w / img.width, this.h / img.height);
    var dw = img.width * s, dh = img.height * s;
    c.drawImage(img, (this.w - dw) / 2, (this.h - dh) / 2, dw, dh);
  };

  Scratch.prototype._erase = function (seg, count) {
    var c = this.ctx;
    var x0 = seg[0] * this.w, y0 = seg[1] * this.h, x1 = seg[2] * this.w, y1 = seg[3] * this.h;
    c.globalCompositeOperation = 'destination-out';
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = this.radius * 2;
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1 + 0.01, y1); c.stroke();
    if (count) this._mark(seg);
  };

  // 把笔画覆盖到的网格格子记为已刮
  Scratch.prototype._mark = function (seg) {
    var rx = this.radius / this.w * 0.95, ry = this.radius / this.h * 0.95;
    var minC = Math.max(0, Math.floor((Math.min(seg[0], seg[2]) - rx) * COLS));
    var maxC = Math.min(COLS - 1, Math.floor((Math.max(seg[0], seg[2]) + rx) * COLS));
    var minR = Math.max(0, Math.floor((Math.min(seg[1], seg[3]) - ry) * ROWS));
    var maxR = Math.min(ROWS - 1, Math.floor((Math.max(seg[1], seg[3]) + ry) * ROWS));
    var ax = seg[0] * this.w, ay = seg[1] * this.h, bx = seg[2] * this.w, by = seg[3] * this.h;
    var dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, r2 = Math.pow(this.radius * 0.95, 2);
    for (var row = minR; row <= maxR; row++) {
      for (var col = minC; col <= maxC; col++) {
        var k = row * COLS + col;
        if (this.grid[k]) continue;
        var px = (col + 0.5) / COLS * this.w, py = (row + 0.5) / ROWS * this.h;
        var t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
        var qx = ax + t * dx - px, qy = ay + t * dy - py;
        if (qx * qx + qy * qy <= r2) { this.grid[k] = 1; this.marked++; }
      }
    }
  };

  Scratch.prototype.progress = function () { return this.marked / (COLS * ROWS); };

  Scratch.prototype._local = function (e) {
    var r = this.canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };

  Scratch.prototype._bind = function () {
    var self = this, cv = this.canvas;

    cv.addEventListener('pointerdown', function (e) {
      if (self.done) return;
      e.preventDefault();
      GJ.audio.unlock();
      if (!self.touched) { self.touched = true; if (self.opts.onFirstTouch) self.opts.onFirstTouch(); }
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      var p = self._local(e);
      self.pointers[e.pointerId] = { x: p.x, y: p.y, t: performance.now() };
      self._add([p.x, p.y, p.x, p.y]);
      self._du(true);
    });

    cv.addEventListener('pointermove', function (e) {
      var last = self.pointers[e.pointerId];
      if (!last || self.done) return;
      e.preventDefault();
      // 一些浏览器会合并移动事件，取出全部采样点，划得再快也连成线
      var list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      if (!list || !list.length) list = [e];
      for (var i = 0; i < list.length; i++) {
        var p = self._local(list[i]);
        self._add([last.x, last.y, p.x, p.y]);
        var now = performance.now();
        var dist = Math.hypot((p.x - last.x) * self.w, (p.y - last.y) * self.h);
        var dt = Math.max(1, now - last.t);
        self.speed = self.speed * 0.6 + (dist / dt) * 0.4;
        self.travel += dist;
        last.x = p.x; last.y = p.y; last.t = now;
      }
      self.lastMove = performance.now();
      // 手指每划过一段距离「嘟」一声：划得越快，嘟得越密
      if (self.travel > self.w * 0.15) { self.travel = 0; self._du(false); }
    });

    function up(e) {
      if (!self.pointers[e.pointerId]) return;
      delete self.pointers[e.pointerId];
      // 手指抬起这一下算用户操作，在这里翻开
      if (self.due && !self.done && e.type === 'pointerup') self.reveal(true);
    }
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('lostpointercapture', up);
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // 卡片尺寸一变（转屏、窗口缩放、地址栏收起）就按笔画重画
    this._onResize = function () {
      if (self.done) return;
      var r = self.box.getBoundingClientRect();
      if (Math.abs(r.width - self.w) > 0.5 || Math.abs(r.height - self.h) > 0.5) self.layout();
    };
    window.addEventListener('resize', this._onResize);
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(this._onResize);
      this._ro.observe(this.box);
    }
  };

  Scratch.prototype._unbindResize = function () {
    window.removeEventListener('resize', this._onResize);
    if (this._ro) { this._ro.disconnect(); this._ro = null; }
  };

  Scratch.prototype._add = function (seg) {
    this.segs.push(seg);
    this._erase(seg, true);
    var p = this.progress();
    if (this.opts.onProgress) this.opts.onProgress(p);
    if (!this.due && p >= this.threshold) {
      this.due = true;
      var self = this;
      // 一直按着不抬手的话，过一会儿也自动翻开
      this._dueTimer = setTimeout(function () { if (!self.done) self.reveal(false); }, 700);
    }
  };

  Scratch.prototype._du = function (first) {
    var now = performance.now();
    if (now - this.lastDu < 70) return;          // 最快每秒十几声，不会糊成一片
    this.lastDu = now;
    var p = Math.min(1, this.progress() / this.threshold);
    var base = Math.floor(p * (NOTES.length - 2));
    var note = NOTES[Math.min(NOTES.length - 1, base + (this.duCount++ % 2))];
    var fast = Math.min(1, this.speed / 1.6);
    GJ.audio.du({ freq: note, gain: first ? 0.3 : 0.22 + fast * 0.1, dur: 0.15 - fast * 0.05 });
    GJ.audio.buzz(6, 60);
  };

  Scratch.prototype.reveal = function (byGesture) {
    if (this.done) return;
    this.done = true;
    clearTimeout(this._dueTimer);
    this.box.classList.add('is-ready');
    this.canvas.classList.add('is-gone');
    this._unbindResize();
    var cv = this.canvas;
    setTimeout(function () { if (cv.parentNode) cv.parentNode.removeChild(cv); }, 600);
    if (this.opts.onReveal) this.opts.onReveal(!!byGesture);
  };

  Scratch.prototype.destroy = function () {
    this.done = true;
    clearTimeout(this._dueTimer);
    this._unbindResize();
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
  };

  GJ.Scratch = Scratch;
})();
