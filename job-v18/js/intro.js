/*
 * 开场互动视频：第一次进来时播，讲清楚这一波的主题——秃秃来面试，老板决定看不看简历。
 *   open（老板在吗？菇来面试啦！这是菇的简历，请过目！）放完停在最后一帧，问「要看秃秃的简历吗？」
 *     看简历 → yes（谢谢老板！接下来菇会好好面试的！）→ 放完进人才主页
 *     不看   → no（老板再考虑一下嘛？菇吃得很少的！）→ 再问一次：
 *                好吧，看看简历 → yes → 人才主页
 *                直接领券带回家 → 领券页
 *                还是不看       → 退出 H5（onClose('exit')，由 app.js 处理）
 * 视频铺满全屏，券条一直压在视频下方（第二次问时券条变成选项「直接领券带回家」），右上角可以跳过（进人才主页）。
 * iPhone 只允许静音自动播放，所以先静音播，右上角可以点开声音；点开过声音，后面的片段也带声音。
 * config.intro.clips.open 留空时放占位画面（秃秃 + 一句主题），placeholderSeconds 秒后自动进主页。
 * 后面的片段（no / yes）缺了或放不出来：跳过这段，接着往下走。
 */
(function () {
  var C = GJ.config;
  var el = {}, open = false, opts = {}, phTimer = 0, phStart = 0, phRaf = 0, primeTimer = 0;
  var vids = {}, cur = '', asking = 0, sound = false;

  function $(id) { return document.getElementById(id); }
  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function cfg() { return C.intro || {}; }
  function clip(k) { var c = (cfg().clips || {})[k]; return c && c.video ? c : null; }
  function hasVideo() { return !!clip('open'); }
  function phSeconds() { return Math.max(2, Number(cfg().placeholderSeconds) || 6); }
  function vid() { return vids[cur] || null; }

  function init() {
    el.root = $('intro');
    el.ph = $('intro-ph');
    el.fill = $('intro-fill');
    el.cur = $('intro-cur');
    el.dur = $('intro-dur');
    el.skip = $('intro-skip');
    el.sound = $('intro-sound');
    el.play = $('intro-play');
    el.strip = $('intro-strip');
    el.ask = $('intro-ask');
    el.q = $('intro-ask-q');
    el.yes = $('intro-yes');
    el.no = $('intro-no');
    el.coupon = $('intro-coupon');
    vids = { open: $('intro-video'), no: $('intro-video-no'), yes: $('intro-video-yes') };

    var cp = C.coupon;
    $('intro-strip-name').textContent = cp.name + ' ¥' + cp.amount;
    $('intro-strip-sub').textContent = cp.threshold + ' · 不用先玩也能领';
    $('intro-coupon-amt').textContent = '¥' + cp.amount;

    Object.keys(vids).forEach(function (k) {
      var v = vids[k];
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      v.addEventListener('timeupdate', function () { if (k === cur) paintVideo(); });
      v.addEventListener('loadedmetadata', function () { if (k === cur) paintVideo(); });
      v.addEventListener('playing', function () { if (k === cur) el.play.hidden = true; });
      v.addEventListener('ended', function () { if (open && k === cur && !asking) next(k); });
      // 放不出来：开头改成占位画面（照样能领券、能进主页）；后面的片段跳过，接着往下走
      v.addEventListener('error', function () {
        if (!open || k !== cur || asking) return;
        if (k === 'open') usePlaceholder(); else next(k);
      });
      // 点画面暂停 / 继续；停在最后一帧等老板选的时候不响应（不然会从头再放）
      v.addEventListener('click', function () {
        if (k !== cur || asking) return;
        if (v.paused) playVideo(); else { v.pause(); el.play.hidden = false; }
      });
    });

    el.skip.addEventListener('click', function () { finish('skip'); });
    el.strip.addEventListener('click', function () { finish('coupon'); });
    el.coupon.addEventListener('click', function () { finish('coupon'); });
    el.yes.addEventListener('click', function () { answer(true); });
    el.no.addEventListener('click', function () { answer(false); });
    el.sound.addEventListener('click', function () {
      var v = vid();
      sound = !sound;
      if (v) v.muted = !sound;
      paintSound();
      if (v && sound && !asking) v.play().catch(function () {});
    });
    el.play.addEventListener('click', playVideo);
    document.addEventListener('visibilitychange', function () {
      var v = vid();
      if (document.hidden && open && v && !v.paused) { v.pause(); if (!asking) el.play.hidden = false; }
    });
  }

  function paintSound() {
    el.sound.setAttribute('aria-pressed', sound ? 'true' : 'false');
    el.sound.setAttribute('aria-label', sound ? '静音' : '打开声音');
    el.sound.classList.toggle('is-on', sound);
  }

  function paintBar(t, d) {
    var r = d ? Math.min(1, Math.max(0, t / d)) : 0;
    el.fill.style.transform = 'scaleX(' + r.toFixed(4) + ')';
    el.cur.textContent = fmt(t);
    el.dur.textContent = d ? fmt(d) : '--:--';
  }
  function paintVideo() {
    var v = vid();
    if (!v) return;
    paintBar(v.currentTime, isFinite(v.duration) ? v.duration : 0);
  }

  function playVideo() {
    var v = vid();
    if (!v || asking) return;
    el.play.hidden = true;
    var p = v.play();
    if (p && p.catch) p.catch(function () { if (open && !asking && v === vid()) el.play.hidden = false; });
  }

  // 开头放起来之后，悄悄把后面两段先加载上（各 1MB 左右），选完马上能放
  function prime() {
    ['no', 'yes'].forEach(function (k) {
      var c = clip(k), v = vids[k];
      if (!c || v.getAttribute('src') === c.video) return;
      if (c.poster) v.poster = c.poster;
      v.preload = 'auto';
      v.src = c.video;
      try { v.load(); } catch (e) { /* 忽略 */ }
    });
  }

  // 换到某一段：其他段停下藏起来，这段从头放（先显示它的第一帧封面，不会黑一下）
  function playClip(k) {
    var c = clip(k);
    if (!c) return false;
    var v = vids[k];
    Object.keys(vids).forEach(function (x) {
      if (x === k) return;
      vids[x].pause();
      vids[x].hidden = true;
    });
    cur = k;
    clearAsk();
    if (v.getAttribute('src') !== c.video) {
      if (c.poster) v.poster = c.poster;
      v.src = c.video;
    }
    v.hidden = false;
    v.muted = !sound;
    try { v.currentTime = 0; } catch (e) { /* 忽略 */ }
    paintBar(0, 0);
    playVideo();
    return true;
  }

  // 一段放完：开头 → 第一次问；求情 → 第二次问；谢谢老板 → 进人才主页
  function next(k) {
    if (k === 'open') ask(1);
    else if (k === 'no') ask(2);
    else finish('ended');
  }

  function ask(n) {
    var a = (n === 1 ? cfg().ask1 : cfg().ask2) || {};
    var v = vid();
    if (v && !v.paused) v.pause();
    asking = n;
    el.play.hidden = true;
    // 视频里已经问了（开头最后一句「老板要看看菇的简历么？」）就不重复写，只给读屏软件读 label
    el.q.textContent = a.q || '';
    el.q.hidden = !a.q;
    el.ask.setAttribute('aria-label', a.label || a.q || '要看秃秃的简历吗？');
    el.yes.textContent = a.yes || '看简历';
    el.no.textContent = a.no || '不看';
    el.coupon.hidden = n !== 2;
    if (n === 2) $('intro-coupon-t').textContent = a.coupon || '直接领券带回家';
    el.root.classList.add('is-asking');
    el.root.classList.toggle('ask-2', n === 2);
    el.ask.hidden = false;
    setTimeout(function () { if (open && asking === n) el.yes.focus({ preventScroll: true }); }, 60);
  }
  function clearAsk() {
    asking = 0;
    el.ask.hidden = true;
    el.root.classList.remove('is-asking', 'ask-2');
  }

  function answer(yes) {
    var n = asking;
    if (!n) return;
    if (yes) { if (!playClip('yes')) finish('ended'); return; }
    if (n === 1) { if (!playClip('no')) ask(2); return; }
    finish('exit');
  }

  function stopPlaceholder() { clearTimeout(phTimer); cancelAnimationFrame(phRaf); }
  function stopVideos() { Object.keys(vids).forEach(function (k) { vids[k].pause(); }); }

  function usePlaceholder() {
    stopPlaceholder();
    stopVideos();
    clearAsk();
    Object.keys(vids).forEach(function (k) { vids[k].hidden = true; });
    cur = '';
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

  // o.onClose(kind)：kind 是 'skip' | 'ended' | 'coupon' | 'exit'（还是不看，要离开 H5）
  function show(o) {
    opts = o || {};
    open = true;
    el.root.hidden = false;
    requestAnimationFrame(function () { el.root.classList.add('is-open'); });
    stopPlaceholder();
    clearAsk();
    // 静音才能自动播放；每次进来都先静音，点右上角打开声音
    sound = false;
    paintSound();
    if (hasVideo()) {
      el.ph.hidden = true;
      el.sound.hidden = false;
      playClip('open');
      clearTimeout(primeTimer);
      primeTimer = setTimeout(function () { if (open) prime(); }, 1200);
    } else {
      usePlaceholder();
    }
    setTimeout(function () { if (open && !asking) el.skip.focus({ preventScroll: true }); }, 60);
  }

  function hide() {
    open = false;
    stopPlaceholder();
    clearTimeout(primeTimer);
    stopVideos();
    el.root.classList.remove('is-open');
    setTimeout(function () { if (!open) { el.root.hidden = true; clearAsk(); } }, 260);
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
