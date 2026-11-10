/*
 * 隐藏款特效：
 *  - starBurst：从卡片中心炸开一大把星星，带重力往下落
 *  - sparkles：卡片周围持续飘起细碎的闪光，直到离开这个页面
 */
(function () {
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var COLORS = ['#FFE08A', '#FFFFFF', '#C9B8F2', '#F7A8C8', '#9FD8F0', '#FFD15C'];

  function drawStar(c, r) {
    c.beginPath();
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4, rr = i % 2 ? r * 0.38 : r;
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
  }

  function starBurst(host, opts) {
    if (reduceMotion) return;
    opts = opts || {};
    var rect = host.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cv = document.createElement('canvas');
    cv.className = 'fx-canvas';
    cv.width = Math.round(rect.width * dpr); cv.height = Math.round(rect.height * dpr);
    host.appendChild(cv);
    var c = cv.getContext('2d');
    c.scale(dpr, dpr);
    var cx = opts.x != null ? opts.x : rect.width / 2;
    var cy = opts.y != null ? opts.y : rect.height * 0.45;
    var parts = [];
    var n = opts.count || 90;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 260 + Math.random() * 720;
      parts.push({
        x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 260,
        r: 4 + Math.random() * 9, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12,
        life: 1.4 + Math.random() * 1.1, age: 0, color: COLORS[i % COLORS.length],
      });
    }
    var last = performance.now();
    requestAnimationFrame(function frame(now) {
      var dt = Math.min(0.034, (now - last) / 1000); last = now;
      c.clearRect(0, 0, rect.width, rect.height);
      var alive = 0;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.age += dt;
        if (p.age >= p.life) continue;
        alive++;
        p.vy += 900 * dt; p.vx *= Math.exp(-1.6 * dt); p.vy *= Math.exp(-0.6 * dt);
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        var k = 1 - p.age / p.life;
        c.save();
        c.globalAlpha = Math.min(1, k * 1.6);
        c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillStyle = p.color;
        drawStar(c, p.r * (0.6 + 0.4 * k));
        c.restore();
      }
      if (alive) requestAnimationFrame(frame);
      else if (cv.parentNode) cv.parentNode.removeChild(cv);
    });
  }

  function sparkles(host) {
    if (reduceMotion) return function () {};
    var timer = setInterval(function () {
      var s = document.createElement('i');
      s.className = 'fx-spark';
      s.style.left = (5 + Math.random() * 90) + '%';
      s.style.top = (10 + Math.random() * 80) + '%';
      s.style.setProperty('--s', (0.6 + Math.random() * 0.9).toFixed(2));
      s.style.setProperty('--c', COLORS[Math.floor(Math.random() * COLORS.length)]);
      host.appendChild(s);
      setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 1700);
    }, 180);
    return function stop() {
      clearInterval(timer);
      host.querySelectorAll('.fx-spark').forEach(function (s) { s.remove(); });
    };
  }

  GJ.fx = { starBurst: starBurst, sparkles: sparkles };
})();
