/*
 * 转轮上方的秃秃指针：
 *  - 往左拨就面朝左跑，往右拨就面朝右跑，跑得越快身子越往前倾
 *  - 每经过一张卡踩一步（和「咔」声同步），跑快了脚下起灰
 *  - 停下来：转回正面，累得一屁股坐下，冒一滴汗，「呼～」
 *  - 选中卡片：挥手跳一下，「嘟！」
 */
(function () {
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var GRAVITY = 2600;

  function Runner(root, ruler, world) {
    this.root = root;          // .tutu
    this.body = root.querySelector('.tutu-body');
    this.say = root.querySelector('.tutu-say');
    this.ruler = ruler;
    this.world = world;        // 背景层，做一点视差
    this.x = 0; this.tx = 0;
    this.hop = 0; this.hopV = 0;
    this.tilt = 0;
    this.phase = 0;
    this.facing = 0;
    this.speed = 0;
    this.squash = 0;
    this.running = false;
    this._raf = 0; this._t = 0;
    this._sitTimer = 0; this._sayTimer = 0;
    this.lastDust = 0;
  }

  Runner.prototype._loop = function () {
    if (this._raf || reduceMotion) return;
    var self = this;
    this._t = performance.now();
    this._raf = requestAnimationFrame(function tick(now) {
      var dt = Math.min(0.034, (now - self._t) / 1000);
      self._t = now;
      var busy = self._physics(dt);
      self._paint();
      self._raf = busy ? requestAnimationFrame(tick) : 0;
    });
  };

  Runner.prototype._physics = function (dt) {
    // 起跳和落地
    if (this.hop < 0 || this.hopV < 0) {
      this.hopV += GRAVITY * dt;
      this.hop += this.hopV * dt;
      if (this.hop >= 0) { this.squash = Math.min(1, this.hopV / 700); this.hop = 0; this.hopV = 0; }
    }
    this.squash *= Math.exp(-14 * dt);
    // 慢慢拖的时候也要有小碎步
    if (this.running) this.phase += Math.min(this.speed, 12) * dt * 5.5;
    this.x += (this.tx - this.x) * Math.min(1, dt * 10);
    var targetTilt = this.running ? this.facing * Math.min(this.speed, 18) * 0.9 : 0;
    this.tilt += (targetTilt - this.tilt) * Math.min(1, dt * 12);
    return this.running || this.hop < 0 || this.squash > 0.01 || Math.abs(this.tx - this.x) > 0.3 || Math.abs(this.tilt) > 0.2;
  };

  Runner.prototype._paint = function () {
    var bob = this.running ? -Math.abs(Math.sin(this.phase)) * 5 : 0;
    var y = this.hop + bob;
    var sq = this.squash * 0.18;
    this.root.style.transform = 'translate3d(' + this.x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0) rotate(' + this.tilt.toFixed(1) + 'deg)';
    this.body.style.setProperty('--sx', (1 + sq).toFixed(3));
    this.body.style.setProperty('--sy', (1 - sq).toFixed(3));
  };

  // 每帧由转轮调用：pos = 位置（格），vis = 速度（格/秒），cm = 一格的像素宽
  Runner.prototype.update = function (pos, vis, cm) {
    if (this.ruler) {
      var w = this.ruler.clientWidth;
      var off = (w / 2 - pos * cm).toFixed(1) + 'px';
      this.ruler.style.backgroundPositionX = off + ',' + off;
    }
    // 背景跟着轻轻左右晃（转一圈回到原位），有景深感
    if (this.world) this.world.style.transform = 'translate3d(' + (-Math.sin(pos / 7 * Math.PI * 2) * 22).toFixed(1) + 'px,0,0)';

    this.speed = Math.abs(vis);
    var moving = this.speed > 0.5;
    if (moving) {
      // 位置变大 = 卡片往左走 = 用户往左拨 → 秃秃往左跑
      var face = vis > 0 ? -1 : 1;
      if (!this.running || face !== this.facing) this._setFacing(face);
      this.running = true;
      clearTimeout(this._sitTimer);
      this.root.classList.remove('is-sit', 'is-wave');
      this.tx = face * Math.min(this.speed * 3.2, 44);
      var now = performance.now();
      if (this.speed > 7 && now - this.lastDust > 90) { this.lastDust = now; this._dust(face); }
      this._loop();
    }
  };

  Runner.prototype._setFacing = function (face) {
    this.facing = face;
    this.root.classList.toggle('is-left', face < 0);
    this.root.classList.toggle('is-right', face > 0);
  };

  // 经过一格：踩一步
  Runner.prototype.step = function (speed) {
    if (reduceMotion) return;
    var kick = 150 + Math.min(speed, 16) * 14;
    if (this.hop >= -2) this.hopV = -kick; else this.hopV = Math.min(this.hopV, -kick * 0.6);
    if (this.hop >= 0) this.hop = -0.01;
    this._loop();
  };

  // 停下：转回正面，坐下喘口气
  Runner.prototype.settle = function () {
    var self = this;
    this.running = false;
    this.speed = 0;
    this.tx = 0;
    this._setFacing(0);
    this.root.classList.remove('is-left', 'is-right');
    this._loop();
    clearTimeout(this._sitTimer);
    this._sitTimer = setTimeout(function () {
      self.root.classList.add('is-sit');
      self.talk('呼～');
    }, 160);
  };

  Runner.prototype.cheer = function () {
    clearTimeout(this._sitTimer);
    this.running = false; this.tx = 0;
    this.root.classList.remove('is-sit', 'is-left', 'is-right');
    this.root.classList.add('is-wave');
    this.hopV = -620; this.hop = -0.01;
    this.talk('嘟！');
    this._loop();
  };

  Runner.prototype.talk = function (text) {
    var s = this.say;
    clearTimeout(this._sayTimer);
    s.textContent = text;
    s.classList.remove('is-on'); void s.offsetWidth; s.classList.add('is-on');
    this._sayTimer = setTimeout(function () { s.classList.remove('is-on'); }, 1300);
  };

  Runner.prototype._dust = function (face) {
    var d = document.createElement('i');
    d.className = 'dust';
    d.style.setProperty('--dx', (face * -18) + 'px');
    d.style.setProperty('--x', this.x.toFixed(1) + 'px');
    this.root.parentNode.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 520);
  };

  GJ.Runner = Runner;
})();
