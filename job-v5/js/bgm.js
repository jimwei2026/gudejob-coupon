/*
 * 背景音乐：Mixkit「Owies Ukulele」（来源见 source/mixkit/ATTRIBUTION.md），很轻的铺底。
 * 音量已经做进文件里（-27 LUFS），因为 iPhone 的 Safari 不允许网页调 <audio> 的音量。
 * 第一次点屏幕后才开始加载和播放（浏览器只允许用户点过之后出声，也不拖慢首屏）；
 * 静音、关掉背景音乐、看 PV、切到后台时暂停，条件恢复后接着放。
 */
(function () {
  var SRC = 'assets/bgm/bgm.mp3';
  var el = null, enabled = true, muted = false, ducked = false, started = false;

  function ensure() {
    if (el) return el;
    el = new Audio();
    el.src = SRC;
    el.loop = true;
    el.preload = 'auto';
    el.volume = 0.8;          // 电脑上再轻一点；iPhone 会忽略这个值
    el.setAttribute('playsinline', '');
    return el;
  }

  function wanted() { return started && enabled && !muted && !ducked && !document.hidden; }

  function sync() {
    if (!el) return;
    if (wanted()) {
      var p = el.play();
      if (p && p.catch) p.catch(function () {});
    } else el.pause();
  }

  GJ.bgm = {
    // 在用户点按的回调里调用。没被浏览器允许的话，下次点按再试
    start: function () {
      if (started) return;
      if (!enabled || muted) { started = true; return; }
      ensure();
      started = true;
      var p = el.play();
      if (p && p.catch) p.catch(function () { started = false; });
    },
    setEnabled: function (on) { enabled = !!on; if (enabled && started) ensure(); sync(); },
    setMuted: function (m) { muted = !!m; if (!muted && started && enabled) ensure(); sync(); },
    // 看 PV 时让位给视频的声音
    duck: function (on) { ducked = !!on; sync(); },
    isPlaying: function () { return !!el && !el.paused; },
  };

  document.addEventListener('visibilitychange', sync);
  window.addEventListener('pagehide', function () { if (el) el.pause(); });
})();
