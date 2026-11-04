/*
 * 选卡转轮：无限循环、跟手拖动、甩动惯性、每格一次「咔」、停下吸附回弹。
 * 物理量单位：位置 = 卡片格数，速度 = 格/秒，时间 = 秒。
 */
(function () {
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var FRICTION = 2.8;      // 惯性衰减系数，越大停得越快
  var COAST_END = 2.4;     // 速度低于这个值转入吸附
  var SPRING_K = 260;      // 吸附弹簧刚度
  var SPRING_C = 20;       // 吸附阻尼（约 8% 回弹）
  var MAX_V = 42;
  var FLING_BOOST = 1.3;   // 松手时把手指速度放大一点，甩起来更有劲
  var DETENT = 34;         // 齿格：惯性转动时每经过一格速度顿一下
  var STICK = 0.6;         // 齿格：拖动时卡片在正中附近「粘」一下再跳过去
  var FLAP_K = 900, FLAP_C = 26;

  function wrap(x, n) { return ((((x + n / 2) % n) + n) % n) - n / 2; }
  function mod(x, n) { return ((x % n) + n) % n; }
  function notch(x) { return x - STICK * Math.sin(2 * Math.PI * x) / (2 * Math.PI); }

  function Wheel(root, opts) {
    this.root = root;
    this.n = opts.count;
    this.cards = opts.cards;          // 每张卡的外层元素
    this.flapper = opts.flapper;
    this.onSettle = opts.onSettle || function () {};
    this.onMove = opts.onMove || function () {};
    this.onPick = opts.onPick || function () {};
    this.pos = 0; this.vel = 0; this.target = 0;
    this.mode = 'idle';
    this.lastIdx = 0;
    this.flapA = 0; this.flapV = 0;
    this.bump = 0;
    this.drop = 0; this.dropT = 0;
    this.settled = true;
    this.enabled = true;
    this._raf = 0; this._t = 0;
    this._drag = null;
    this.measure();
    this._bind();
    this.render();
  }

  Wheel.prototype.measure = function () {
    var w = this.cards[0].offsetWidth || 200;
    this.cardW = w;
    this.spacing = w * 0.64;
  };

  Wheel.prototype.index = function () { return mod(Math.round(this.pos), this.n); };

  Wheel.prototype._kick = function () {
    if (this._raf) return;
    var self = this;
    this._t = performance.now();
    this._raf = requestAnimationFrame(function loop(now) {
      var dt = Math.min(0.034, Math.max(0.001, (now - self._t) / 1000));
      self._t = now;
      var busy = self._step(dt);
      self.render();
      if (busy) self._raf = requestAnimationFrame(loop);
      else self._raf = 0;
    });
  };

  Wheel.prototype._step = function (dt) {
    var busy = false;
    if (this.mode === 'coast') {
      var frac = this.pos - Math.round(this.pos);
      this.vel += -DETENT * Math.sin(2 * Math.PI * frac) * dt;
      this.pos += this.vel * dt;
      this.vel *= Math.exp(-FRICTION * dt);
      if (Math.abs(this.vel) < COAST_END) this._springTo(Math.round(this.pos + this.vel * 0.12));
      busy = true;
    } else if (this.mode === 'spring') {
      // 拆成小步积分，低帧率下也不会抖
      var steps = Math.ceil(dt / 0.004), h = dt / steps;
      for (var i = 0; i < steps; i++) {
        var a = SPRING_K * (this.target - this.pos) - SPRING_C * this.vel;
        this.vel += a * h; this.pos += this.vel * h;
      }
      if (Math.abs(this.target - this.pos) < 0.002 && Math.abs(this.vel) < 0.03) {
        this.pos = this.target; this.vel = 0; this.mode = 'idle';
        this._settle();
      } else busy = true;
    } else if (this.mode === 'drag') {
      busy = true;
    }

    // 经过一格：拨片被拨一下、咔一声、中间那张顶一下
    var idx = Math.round(this.pos);
    if (idx !== this.lastIdx) {
      var dir = idx > this.lastIdx ? 1 : -1;
      this.lastIdx = idx;
      var speed = Math.abs(this.vel);
      GJ.audio.play('tick', { rate: 0.9 + Math.min(speed / 22, 0.6), gain: 1 });
      GJ.audio.thump({ freq: 150 + Math.min(speed, 20) * 4, gain: 0.32, dur: 0.05 });
      GJ.audio.buzz(10, 30);
      this.flapV += -dir * (820 + Math.min(speed, 24) * 40);
      this.bump = 1;
      this.onMove(this.index());
    }

    // 拨片的弹簧
    var fa = -FLAP_K * this.flapA - FLAP_C * this.flapV;
    this.flapV += fa * dt; this.flapA += this.flapV * dt;
    if (this.flapA > 34) { this.flapA = 34; this.flapV *= -0.35; }
    if (this.flapA < -34) { this.flapA = -34; this.flapV *= -0.35; }
    if (Math.abs(this.flapA) > 0.05 || Math.abs(this.flapV) > 0.5) busy = true;
    else { this.flapA = 0; this.flapV = 0; }

    this.bump *= Math.exp(-12 * dt);
    if (this.bump > 0.01) busy = true; else this.bump = 0;

    // 停稳那一下：整排卡往下一沉再弹回
    this.drop *= Math.exp(-9 * dt);
    this.dropT += dt;
    if (this.drop > 0.01) busy = true; else this.drop = 0;
    return busy;
  };

  Wheel.prototype._springTo = function (t) {
    this.target = t;
    this.mode = 'spring';
    if (reduceMotion) { this.pos = t; this.vel = 0; }
    this._unsettle();
    this._kick();
  };

  Wheel.prototype._unsettle = function () {
    if (this.settled) {
      this.settled = false;
      this.root.classList.remove('is-settled');
      this.onMove(this.index());
    }
  };

  Wheel.prototype._settle = function () {
    this.settled = true;
    this.root.classList.add('is-settled');
    GJ.audio.play('snap', { gain: 1 });
    GJ.audio.thump({ freq: 110, gain: 0.6, dur: 0.1 });
    GJ.audio.buzz(26, 0);
    if (!reduceMotion) { this.drop = 1; this.dropT = 0; }
    this.onSettle(this.index());
  };

  Wheel.prototype.render = function () {
    var n = this.n, S = this.spacing;
    var sink = this.drop ? this.drop * 7 * Math.cos(this.dropT * 32) : 0;
    for (var i = 0; i < n; i++) {
      var d = wrap(i - this.pos, n), ad = Math.abs(d), sg = d < 0 ? -1 : 1;
      var x = ad < 1 ? d * S : sg * (S + (ad - 1) * S * 0.6);
      var ry = -sg * (Math.min(ad, 1) * 40 + Math.max(0, ad - 1) * 10);
      var z = -ad * 80;
      var near = ad < 0.5 ? 1 - ad * 2 : 0;
      var sc = 1 - Math.min(ad, 3) * 0.07 + this.bump * 0.06 * near;
      var y = sink + this.bump * 6 * near;
      var op = ad > 2.3 ? Math.max(0, (3.0 - ad) / 0.7) : 1;
      var el = this.cards[i];
      el.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,' + z.toFixed(1) + 'px) rotateY(' + ry.toFixed(2) + 'deg) scale(' + sc.toFixed(4) + ')';
      el.style.opacity = op.toFixed(3);
      el.style.zIndex = String(Math.round(100 - ad * 10));
      el.style.setProperty('--shade', Math.min(ad, 2.5) * 0.14);
      el.classList.toggle('is-center', ad < 0.5);
      el.setAttribute('aria-hidden', ad < 0.5 ? 'false' : 'true');
    }
    if (this.flapper) this.flapper.style.transform = 'rotate(' + this.flapA.toFixed(2) + 'deg)';
  };

  // 进场：从左边甩进来，转几格后停下，一看就知道能拨
  Wheel.prototype.intro = function () {
    if (reduceMotion) return;
    this.pos = -3.4; this.lastIdx = Math.round(this.pos); this.vel = 11;
    this.mode = 'coast'; this._unsettle(); this._kick();
  };

  Wheel.prototype.step = function (dir) {
    if (!this.enabled) return;
    GJ.audio.unlock();
    var base = this.mode === 'spring' ? this.target : Math.round(this.pos);
    this._springTo(base + dir);
  };

  Wheel.prototype._bind = function () {
    var self = this, root = this.root;

    root.addEventListener('pointerdown', function (e) {
      if (!self.enabled || self._drag) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      GJ.audio.unlock();
      try { root.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      self._drag = { id: e.pointerId, x0: e.clientX, p0: self.pos, t0: performance.now(), moved: 0,
        samples: [{ t: performance.now(), x: e.clientX }], target: e.target };
      self.mode = 'drag'; self.vel = 0;
      self._kick();
    });

    root.addEventListener('pointermove', function (e) {
      var d = self._drag;
      if (!d || e.pointerId !== d.id) return;
      var dx = e.clientX - d.x0;
      d.moved = Math.max(d.moved, Math.abs(dx));
      if (d.moved > 4) self._unsettle();
      // 拖动时加齿格：卡片在正中附近走得慢，过了一半再快速跳到下一格
      var raw = d.p0 - dx / self.spacing;
      self.pos = reduceMotion ? raw : notch(raw) + (d.p0 - notch(d.p0));
      var now = performance.now();
      d.samples.push({ t: now, x: e.clientX });
      while (d.samples.length > 2 && now - d.samples[0].t > 90) d.samples.shift();
    });

    function end(e) {
      var d = self._drag;
      if (!d || e.pointerId !== d.id) return;
      self._drag = null;
      var now = performance.now();
      if (d.moved < 6 && now - d.t0 < 400 && e.type === 'pointerup') {
        self.mode = 'idle';
        self._tap(d.target);
        return;
      }
      var s0 = d.samples[0], s1 = d.samples[d.samples.length - 1];
      var dt = Math.max(0.016, (s1.t - s0.t) / 1000);
      // 停住超过 90ms 再松手，视为没有甩
      var v = now - s1.t > 90 ? 0 : -((s1.x - s0.x) / self.spacing) / dt * FLING_BOOST;
      v = Math.max(-MAX_V, Math.min(MAX_V, v));
      if (reduceMotion || Math.abs(v) < COAST_END) self._springTo(Math.round(self.pos + v * 0.12));
      else { self.vel = v; self.mode = 'coast'; self._kick(); }
    }
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);

    // PC：滚轮和触控板
    var wheelAcc = 0, wheelTimer = 0;
    root.addEventListener('wheel', function (e) {
      if (!self.enabled) return;
      e.preventDefault();
      GJ.audio.unlock();
      var delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (e.deltaMode === 1) delta *= 30;
      wheelAcc += delta;
      self._unsettle();
      self.mode = 'drag';
      self.pos += delta / self.spacing * 0.9;
      self._kick();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(function () { wheelAcc = 0; self._springTo(Math.round(self.pos)); }, 120);
    }, { passive: false });

    root.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); self.step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); self.step(1); }
      else if ((e.key === 'Enter' || e.key === ' ') && self.settled) { e.preventDefault(); self.onPick(self.index()); }
    });

    window.addEventListener('resize', function () { self.measure(); self.render(); });
  };

  // 轻点：点中间那张就是选它，点两边的卡就转过去
  Wheel.prototype._tap = function (target) {
    var card = target && target.closest ? target.closest('[data-i]') : null;
    if (!card) { if (this.mode === 'idle' && !this.settled) this._springTo(Math.round(this.pos)); return; }
    var i = Number(card.getAttribute('data-i'));
    var d = wrap(i - this.pos, this.n);
    if (Math.abs(d) < 0.5 && this.settled) { this.onPick(this.index()); return; }
    this._springTo(Math.round(this.pos + d));
  };

  GJ.Wheel = Wheel;
})();
