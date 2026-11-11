/*
 * 开场互动视频：第一次进来时播，讲清楚这一波的主题——秃秃来面试，老板决定看不看简历。
 *   open（老板在吗？菇来面试啦！这是菇的简历，请过目！）放完停在最后一帧，问「要看秃秃的简历吗？」
 *     看简历 → yes（谢谢老板！接下来菇会好好面试的！）→ 放完进人才主页
 *     不看   → no（老板再考虑一下嘛？菇吃得很少的！）→ 再问一次：
 *                好吧，看看简历 → yes → 人才主页
 *                直接领券带回家 → 领券页
 *                还是不看       → 退出 H5（onClose('exit')，由 app.js 处理）
 * 视频铺满全屏，券条一直压在视频下方（第二次问时券条变成选项「直接领券带回家」），右上角可以跳过（进人才主页）。
 * v20 声音默认打开（「我的」里关了声音就静音进来）。浏览器不让带声音自动播放时（iPhone Safari、App 没做设置）
 *   改成静音接着播，右上角按钮带字「开声音」；点画面、点按钮、或者做选择都会把声音打开，后面的片段带声音。
 * v20 选项放在画面中间（秃秃脸的正下方，config.intro.askAt），券条只写一行「券 直接领券带回家 ¥5」。
 * config.intro.clips.open 留空时放占位画面（秃秃 + 一句主题），placeholderSeconds 秒后自动进主页。
 * 后面的片段（no / yes）缺了或放不出来：跳过这段，接着往下走。
 */
(function () {
  var C = GJ.config;
  var el = {}, open = false, opts = {}, phTimer = 0, phStart = 0, phRaf = 0, primeTimer = 0;
  var vids = {}, cur = '', asking = 0, sound = true, autoMuted = false, bottomEl = null;

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

    bottomEl = el.root.querySelector('.intro-bottom');
    var cp = C.coupon;
    var st = cfg().stripText || (cfg().ask2 || {}).coupon || '直接领券带回家';
    $('intro-strip-t').textContent = st;
    $('intro-strip-amt').textContent = '¥' + cp.amount;
    $('intro-coupon-amt').textContent = '¥' + cp.amount;
    // 券条、券按钮上只写一行，门槛给读屏软件读
    el.strip.setAttribute('aria-label', st + '，¥' + cp.amount + '，' + cp.threshold);

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
      // 点画面暂停 / 继续；停在最后一帧等老板选的时候不响应（不然会从头再放）。
      // 被浏览器静音了的时候，点画面是打开声音（短视频的习惯），不暂停
      v.addEventListener('click', function () {
        if (k !== cur || asking) return;
        if (autoMuted) { soundOn(); v.muted = false; if (v.paused) playVideo(); return; }
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
      autoMuted = false;
      if (v) v.muted = !sound;
      paintSound();
      if (v && sound && !asking) v.play().catch(function () {});
    });
    el.play.addEventListener('click', playVideo);
    window.addEventListener('resize', function () { if (open && asking) placeAsk(); });
    document.addEventListener('visibilitychange', function () {
      var v = vid();
      if (document.hidden && open && v && !v.paused) { v.pause(); if (!asking) el.play.hidden = false; }
    });
  }

  function paintSound() {
    el.sound.setAttribute('aria-pressed', sound ? 'true' : 'false');
    el.sound.setAttribute('aria-label', sound ? '静音' : '打开声音');
    el.sound.classList.toggle('is-on', sound);
    el.sound.classList.toggle('is-hint', autoMuted);
  }
  // 用户点过画面 / 做过选择（有了点击，浏览器就允许带声音播放）：把被浏览器关掉的声音打开
  function soundOn() {
    if (!autoMuted) return;
    autoMuted = false;
    sound = true;
    paintSound();
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
    v.muted = !sound;
    var p = v.play();
    if (p && p.catch) p.catch(function (err) {
      if (!open || asking || v !== vid()) return;
      // 浏览器不让带声音自动播放：改成静音接着播，右上角提示「开声音」
      if (!v.muted && err && err.name === 'NotAllowedError') {
        sound = false;
        autoMuted = true;
        paintSound();
        v.muted = true;
        var p2 = v.play();
        if (p2 && p2.catch) p2.catch(function () { if (open && !asking && v === vid()) el.play.hidden = false; });
        return;
      }
      el.play.hidden = false;
    });
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
    placeAsk();
    setTimeout(function () { if (open && asking === n) el.yes.focus({ preventScroll: true }); }, 60);
  }
  // 选项放在视频画面 askAt 的高度（画面中间、秃秃脸的正下方，不挡脸）。视频按 cover 铺满、靠上对齐，
  // 画面实际高度 = max(屏幕高, 屏幕宽 × 视频高宽比)；屏幕矮放不下时往上挪，不压底部券条
  function placeAsk() {
    var box = el.root.getBoundingClientRect();
    if (!box.height) return;
    var v = vid();
    var ratio = v && v.videoWidth ? v.videoHeight / v.videoWidth : 16 / 9;
    var at = Number(cfg().askAt);
    if (!(at > 0 && at < 1)) at = 0.53;
    var top = Math.max(box.height, box.width * ratio) * at;
    var sb = el.strip.getBoundingClientRect();
    var floor = sb.height ? sb.top - box.top - 16
      : box.height - (bottomEl ? parseFloat(getComputedStyle(bottomEl).paddingBottom) || 16 : 16);
    top = Math.max(64, Math.min(top, floor - el.ask.offsetHeight));
    el.root.style.setProperty('--ask-top', Math.round(top) + 'px');
  }
  function clearAsk() {
    asking = 0;
    el.ask.hidden = true;
    el.root.classList.remove('is-asking', 'ask-2');
  }

  function answer(yes) {
    var n = asking;
    if (!n) return;
    soundOn();   // 做选择算一次点击：被浏览器关掉的声音这时打开，接下来的片段带声音
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
    // v20 默认带声音（「我的」里关了声音就静音进来）；浏览器不让时 playVideo 会自动改成静音播
    sound = !(GJ.store && GJ.store.muted && GJ.store.muted());
    autoMuted = false;
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
