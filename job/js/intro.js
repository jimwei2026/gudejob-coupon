/*
 * 开场主题视频：第一次进来时播一遍，讲清楚这一波 H5 的主题。
 * 视频下方一直有券条（点了进领券页），右上角可以跳过，播完进人才主页。
 * iPhone 只允许静音自动播放，所以先静音播，右上角可以点开声音。
 * config.intro.video 留空时先放占位画面（秃秃 + 一句主题），placeholderSeconds 秒后自动进主页。
 */
(function () {
  var C = GJ.config;
  var el = {}, open = false, opts = {}, phTimer = 0, phStart = 0, phRaf = 0;

  function $(id) { return document.getElementById(id); }
  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function cfg() { return C.intro || {}; }
  function hasVideo() { return !!cfg().video; }
  function phSeconds() { return Math.max(2, Number(cfg().placeholderSeconds) || 6); }

  function init() {
    el.root = $('intro');
    el.video = $('intro-video');
    el.ph = $('intro-ph');
    el.fill = $('intro-fill');
    el.cur = $('intro-cur');
    el.dur = $('intro-dur');
    el.skip = $('intro-skip');
    el.sound = $('intro-sound');
    el.play = $('intro-play');
    el.strip = $('intro-strip');

    var cp = C.coupon;
    $('intro-strip-name').textContent = cp.name + ' ¥' + cp.amount;
    $('intro-strip-sub').textContent = cp.threshold;

    el.video.setAttribute('playsinline', '');
    el.video.setAttribute('webkit-playsinline', '');
    el.skip.addEventListener('click', function () { finish('skip'); });
    el.strip.addEventListener('click', function () { finish('coupon'); });
    el.sound.addEventListener('click', function () {
      el.video.muted = !el.video.muted;
      paintSound();
      if (!el.video.muted) el.video.play().catch(function () {});
    });
    el.play.addEventListener('click', playVideo);
    el.video.addEventListener('click', function () {
      if (el.video.paused) playVideo(); else { el.video.pause(); el.play.hidden = false; }
    });
    el.video.addEventListener('timeupdate', paintVideo);
    el.video.addEventListener('loadedmetadata', paintVideo);
    el.video.addEventListener('playing', function () { el.play.hidden = true; });
    el.video.addEventListener('ended', function () { finish('ended'); });
    // 视频没加载出来：改成占位画面，照样能领券、能进主页
    el.video.addEventListener('error', function () { if (open && hasVideo()) usePlaceholder(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && open && !el.video.hidden && !el.video.paused) { el.video.pause(); el.play.hidden = false; }
    });
  }

  function paintSound() {
    var on = !el.video.muted;
    el.sound.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.sound.setAttribute('aria-label', on ? '静音' : '打开声音');
    el.sound.classList.toggle('is-on', on);
  }

  function paintBar(t, d) {
    var r = d ? Math.min(1, Math.max(0, t / d)) : 0;
    el.fill.style.transform = 'scaleX(' + r.toFixed(4) + ')';
    el.cur.textContent = fmt(t);
    el.dur.textContent = d ? fmt(d) : '--:--';
  }
  function paintVideo() {
    var d = isFinite(el.video.duration) ? el.video.duration : 0;
    paintBar(el.video.currentTime, d);
  }

  function playVideo() {
    el.play.hidden = true;
    var p = el.video.play();
    if (p && p.catch) p.catch(function () { el.play.hidden = false; });
  }

  function stopPlaceholder() { clearTimeout(phTimer); cancelAnimationFrame(phRaf); }
  function usePlaceholder() {
    stopPlaceholder();
    el.video.pause();
    el.video.hidden = true;
    el.sound.hidden = true;
    el.play.hidden = true;
    el.ph.hidden = false;
    var total = phSeconds() * 1000;
    phStart = performance.now();
    (function tick() {
      if (!open) return;
      var t = performance.now() - phStart;
      paintBar(Math.min(t, total) / 1000, total / 1000);
      if (t < total) phRaf = requestAnimationFrame(tick);
    })();
    phTimer = setTimeout(function () { finish('ended'); }, total);
  }

  // o.onClose(kind)：kind 是 'skip' | 'ended' | 'coupon'
  function show(o) {
    opts = o || {};
    open = true;
    el.root.hidden = false;
    requestAnimationFrame(function () { el.root.classList.add('is-open'); });
    if (hasVideo()) {
      el.ph.hidden = true;
      el.video.hidden = false;
      el.sound.hidden = false;
      if (el.video.getAttribute('src') !== cfg().video) {
        el.video.src = cfg().video;
        if (cfg().poster) el.video.poster = cfg().poster;
      }
      // 静音才能自动播放；用户关过声音的话，点开声音前也保持静音
      el.video.muted = true;
      paintSound();
      try { el.video.currentTime = 0; } catch (e) { /* 忽略 */ }
      paintBar(0, 0);
      playVideo();
    } else {
      usePlaceholder();
    }
    setTimeout(function () { if (open) el.skip.focus({ preventScroll: true }); }, 60);
  }

  function hide() {
    open = false;
    stopPlaceholder();
    el.video.pause();
    el.root.classList.remove('is-open');
    setTimeout(function () { if (!open) el.root.hidden = true; }, 260);
  }

  function finish(kind) {
    if (!open) return;
    hide();
    if (opts.onClose) opts.onClose(kind);
  }

  GJ.intro = {
    init: init,
    show: show,
    // 直接关掉，不触发回调（从浏览器返回时用）
    close: function () { if (open) hide(); },
    isOpen: function () { return open; },
  };
})();
