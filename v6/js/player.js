/*
 * PV 播放器：全程只用一个 <video>，方便在用户操作时「解锁」带声播放。
 * 可以返回、倍速（1x / 1.5x / 2x）、跳过直接领券；播完自动去领券。
 */
(function () {
  var SPEEDS = [1, 1.5, 2];
  var el = {}, v = null;
  var current = null, handlers = {}, speedIdx = 0, isOpen = false, unlocked = false;

  function $(id) { return document.getElementById(id); }

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
    el.strip = $('pv-strip');
    el.stripText = $('pv-strip-text');

    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';

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
    v.addEventListener('timeupdate', function () {
      if (v.duration) el.bar.style.transform = 'scaleX(' + (v.currentTime / v.duration).toFixed(4) + ')';
    });
    v.addEventListener('ended', function () { if (isOpen) finish('onEnded'); });
    v.addEventListener('error', function () {
      if (!isOpen) return;
      el.loader.hidden = true;
      el.error.hidden = false;
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
    if (current && current.id === ch.id && v.getAttribute('src')) return;
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
    el.title.textContent = ch.name + ' · 角色 PV';
    el.error.hidden = true;
    el.unmute.hidden = true;
    el.bigPlay.hidden = true;
    el.loader.hidden = v.readyState >= 3;
    el.bar.style.transform = 'scaleX(0)';
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
    v.pause();
    el.root.classList.remove('is-open');
    setTimeout(function () { if (!isOpen) el.root.hidden = true; }, 260);
    var fn = handlers[kind] || handlers.onSkip;
    if (fn) fn();
  }

  function setMuted(m) { if (v) v.muted = m; if (!m && el.unmute) el.unmute.hidden = true; }

  GJ.player = {
    init: init, prepare: prepare, unlockFromGesture: unlockFromGesture,
    open: open, setMuted: setMuted, isOpen: function () { return isOpen; },
  };
})();
