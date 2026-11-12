/*
 * PV 播放器：全程只用一个 <video>，方便在用户操作时「解锁」带声播放。
 * 可以返回、倍速（1x / 1.5x / 2x）、拖进度条、跳过直接领券；播完自动去领券。
 */
(function () {
  var SPEEDS = [1, 1.5, 2];
  var SEEK_STEP = 5;          // 方向键一次快进 / 后退几秒
  var END_GAP = 0.25;         // 拖到最末尾时停在结尾前一点点，松手后自然播完，不会在手指还按着时就关掉播放器
  var el = {}, v = null;
  var current = null, handlers = {}, speedIdx = 0, isOpen = false, unlocked = false;
  var dragging = false, resumeAfterDrag = false, seekRaf = 0, pendingT = -1;

  function $(id) { return document.getElementById(id); }

  // ---------- 进度条 ----------
  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function dur() { return isFinite(v.duration) && v.duration > 0 ? v.duration : 0; }
  function clampT(t) { var d = dur(); return Math.max(0, Math.min(t, d - END_GAP)); }

  // 只更新进度条的样子，不动视频
  function paint(t) {
    var d = dur();
    var r = d ? Math.min(1, Math.max(0, t / d)) : 0;
    el.bar.style.transform = 'scaleX(' + r.toFixed(4) + ')';
    el.knob.style.left = (r * 100).toFixed(2) + '%';
    el.cur.textContent = fmt(t);
    el.track.setAttribute('aria-valuenow', String(Math.round(t)));
    el.track.setAttribute('aria-valuetext', fmt(t) + '，共 ' + fmt(d));
  }
  function paintDur() {
    var d = dur();
    el.dur.textContent = d ? fmt(d) : '--:--';
    el.track.setAttribute('aria-valuemax', String(Math.round(d)));
  }
  function paintBuf() {
    var d = dur(), b = v.buffered;
    if (!d || !b || !b.length) { el.buf.style.transform = 'scaleX(0)'; return; }
    el.buf.style.transform = 'scaleX(' + Math.min(1, b.end(b.length - 1) / d).toFixed(4) + ')';
  }
  function ratioAt(clientX) {
    var box = el.track.getBoundingClientRect();
    return box.width ? Math.min(1, Math.max(0, (clientX - box.left) / box.width)) : 0;
  }
  // 拖动时每帧最多跳一次；Safari 有 fastSeek（跳到最近的关键帧，拖起来更跟手），松手时再精确跳
  function seekSoon(t) {
    pendingT = clampT(t);
    if (seekRaf) return;
    seekRaf = requestAnimationFrame(function () {
      seekRaf = 0;
      if (pendingT < 0) return;
      try { if (v.fastSeek) v.fastSeek(pendingT); else v.currentTime = pendingT; } catch (e) { /* 忽略 */ }
      pendingT = -1;
    });
  }
  function seekNow(t) {
    if (seekRaf) { cancelAnimationFrame(seekRaf); seekRaf = 0; }
    pendingT = -1;
    t = clampT(t);
    try { v.currentTime = t; } catch (e) { /* 忽略 */ }
    paint(t);
  }
  function stopDrag() {
    dragging = false;
    el.root.classList.remove('is-seeking');
  }

  function bindSeek() {
    el.track.addEventListener('pointerdown', function (e) {
      if (!dur() || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      dragging = true;
      el.root.classList.add('is-seeking');
      try { el.track.setPointerCapture(e.pointerId); } catch (x) { /* 忽略 */ }
      // 拖的时候先暂停，免得声音一段段地响；松手后原来在放就接着放
      resumeAfterDrag = !v.paused;
      if (resumeAfterDrag) v.pause();
      var t = ratioAt(e.clientX) * dur();
      paint(t);
      seekSoon(t);
    });
    el.track.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var t = ratioAt(e.clientX) * dur();
      paint(t);
      seekSoon(t);
    });
    el.track.addEventListener('pointerup', function (e) {
      if (!dragging) return;
      stopDrag();
      seekNow(ratioAt(e.clientX) * dur());
      if (resumeAfterDrag && isOpen) v.play().catch(function () { el.bigPlay.hidden = false; });
    });
    el.track.addEventListener('pointercancel', function () {
      if (!dragging) return;
      stopDrag();
      paint(v.currentTime);
      if (resumeAfterDrag && isOpen) v.play().catch(function () { el.bigPlay.hidden = false; });
    });
    el.track.addEventListener('keydown', function (e) {
      var d = dur(), t = v.currentTime;
      if (!d) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') t += SEEK_STEP;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') t -= SEEK_STEP;
      else if (e.key === 'Home') t = 0;
      else if (e.key === 'End') t = d;
      else return;
      e.preventDefault();
      seekNow(t);
    });
  }

  function init() {
    el.root = $('player');
    v = el.video = $('pv-video');
    el.title = $('pv-title');
    el.speed = $('pv-speed');
    el.back = $('pv-back');
    el.loader = $('pv-loader');
    el.error = $('pv-error');
    el.errorSkip = $('pv-error-skip');
    el.unmute = $('pv-unmute');
    el.bigPlay = $('pv-play');
    el.bar = $('pv-bar-fill');
    el.buf = $('pv-buf');
    el.knob = $('pv-knob');
    el.track = $('pv-track');
    el.cur = $('pv-cur');
    el.dur = $('pv-dur');
    el.strip = $('pv-strip');
    el.stripText = $('pv-strip-text');

    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    bindSeek();

    el.speed.addEventListener('click', function () {
      speedIdx = (speedIdx + 1) % SPEEDS.length;
      applySpeed();
    });
    el.back.addEventListener('click', function () { finish('onBack'); });
    el.strip.addEventListener('click', function () { finish('onSkip'); });
    el.errorSkip.addEventListener('click', function () { finish('onSkip'); });
    el.unmute.addEventListener('click', function () {
      GJ.app.setMuted(false);
      v.muted = false;
      el.unmute.hidden = true;
      v.play().catch(function () {});
    });
    el.bigPlay.addEventListener('click', function () { playNow(); });
    v.addEventListener('click', function () {
      if (v.paused) playNow(); else { v.pause(); el.bigPlay.hidden = false; }
    });
    v.addEventListener('waiting', function () { if (isOpen) el.loader.hidden = false; });
    v.addEventListener('playing', function () { el.loader.hidden = true; el.bigPlay.hidden = true; });
    v.addEventListener('canplay', function () { el.loader.hidden = true; });
    v.addEventListener('timeupdate', function () { if (!dragging) paint(v.currentTime); });
    v.addEventListener('seeked', function () { if (!dragging) paint(v.currentTime); });
    v.addEventListener('loadedmetadata', paintDur);
    v.addEventListener('durationchange', paintDur);
    v.addEventListener('progress', paintBuf);
    v.addEventListener('ended', function () { if (isOpen) finish('onEnded'); });
    v.addEventListener('error', function () {
      if (!isOpen) return;
      el.loader.hidden = true;
      el.error.hidden = false;
      el.root.classList.add('is-error');
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && isOpen && !v.paused) { v.pause(); el.bigPlay.hidden = false; }
    });
  }

  function applySpeed() {
    var s = SPEEDS[speedIdx];
    v.playbackRate = s;
    el.speed.textContent = s + 'x';
    el.speed.setAttribute('aria-label', '播放速度 ' + s + ' 倍，点击切换');
  }

  // 选中角色后就开始加载
  function prepare(ch) {
    // v23：预载时出过错的，打开时重新加载
    if (current && current.id === ch.id && v.getAttribute('src') && !v.error) return;
    current = ch;
    unlocked = false;
    v.setAttribute('src', 'assets/pv/' + ch.id + '.mp4');
    v.setAttribute('poster', 'assets/poster/' + ch.id + '.jpg');
    try { v.load(); } catch (e) { /* 忽略 */ }
  }

  // 在用户操作的回调里调用：静音播一下再暂停。
  // iOS 上，用户操作里播放过的视频，之后才允许程序自动带声播放；静音是为了不漏出声音。
  function unlockFromGesture() {
    if (unlocked || !v.getAttribute('src')) return;
    unlocked = true;
    v.muted = true;
    var p = v.play();
    var stop = function () { if (!isOpen) { v.pause(); try { v.currentTime = 0; } catch (e) { /* 忽略 */ } } };
    if (p && p.then) p.then(stop, function () { unlocked = false; });
    else stop();
  }

  function playNow() {
    el.bigPlay.hidden = true;
    v.muted = GJ.audio.isMuted();
    var p = v.play();
    if (!p || !p.catch) return;
    p.catch(function () {
      // 带声播放被拦住：改成静音播放，给一个「点开声音」
      v.muted = true;
      v.play().then(function () {
        if (!GJ.audio.isMuted()) el.unmute.hidden = false;
      }, function () { el.bigPlay.hidden = false; el.loader.hidden = true; });
    });
  }

  // opts: { onBack, onSkip, onEnded, strip: '…'|null }
  function open(ch, opts) {
    handlers = opts || {};
    prepare(ch);
    isOpen = true;
    el.title.textContent = ch.name;
    el.error.hidden = true;
    el.unmute.hidden = true;
    el.bigPlay.hidden = true;
    el.loader.hidden = v.readyState >= 3;
    stopDrag();
    el.root.classList.remove('is-error');
    paintDur();
    paint(0);
    paintBuf();
    if (handlers.strip) { el.strip.hidden = false; el.stripText.textContent = handlers.strip; }
    else el.strip.hidden = true;
    speedIdx = 0; applySpeed();
    el.root.hidden = false;
    requestAnimationFrame(function () { el.root.classList.add('is-open'); });
    try { v.currentTime = 0; } catch (e) { /* 忽略 */ }
    v.volume = 1;
    playNow();
    setTimeout(function () { el.back.focus({ preventScroll: true }); }, 50);
  }

  function finish(kind) {
    if (!isOpen) return;
    isOpen = false;
    stopDrag();
    v.pause();
    el.root.classList.remove('is-open');
    setTimeout(function () { if (!isOpen) el.root.hidden = true; }, 260);
    var fn = handlers[kind] || handlers.onSkip;
    if (fn) fn();
  }

  // 直接关掉播放器，不触发任何回调（回主页时用）
  function close() {
    if (!isOpen) return;
    isOpen = false;
    stopDrag();
    v.pause();
    el.root.classList.remove('is-open');
    setTimeout(function () { if (!isOpen) el.root.hidden = true; }, 260);
  }

  function setMuted(m) { if (v) v.muted = m; if (!m && el.unmute) el.unmute.hidden = true; }

  GJ.player = {
    init: init, prepare: prepare, unlockFromGesture: unlockFromGesture,
    open: open, close: close, setMuted: setMuted, isOpen: function () { return isOpen; },
  };
})();
