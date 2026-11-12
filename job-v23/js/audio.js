/*
 * 音效与振动。
 * 浏览器要求用户先碰一下屏幕才能出声，所以第一次按下时调用 unlock()。
 * 刮卡时播放秃秃的原声「嘟」，节奏跟着手指速度走（见 scratch.js）。
 */
(function () {
  var Ctx = window.AudioContext || window.webkitAudioContext;
  var ctx = null;
  var buffers = {};
  var master = null;
  var muted = false;
  var lastVibrate = 0;

  function decodeAll() {
    Object.keys(GJ.sfxData || {}).forEach(function (name) {
      var bin = atob(GJ.sfxData[name]);
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      // Safari 老版本只支持回调写法
      try {
        var p = ctx.decodeAudioData(bytes.buffer, function (b) { buffers[name] = b; }, function () {});
        if (p && p.then) p.then(function (b) { buffers[name] = b; }, function () {});
      } catch (e) { /* 解码失败就没有这个音效，不影响流程 */ }
    });
  }

  function unlock() {
    if (!Ctx) return;
    if (!ctx) {
      try { ctx = new Ctx(); } catch (e) { return; }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
      decodeAll();
    }
    // v23：iOS 切到后台再回来，状态可能是 interrupted 而不是 suspended，只要没在跑就恢复
    if (ctx.state !== 'running') ctx.resume().catch(function () {});
  }

  function play(name, opts) {
    if (!ctx || muted || !buffers[name]) return;
    opts = opts || {};
    try {
      var src = ctx.createBufferSource();
      src.buffer = buffers[name];
      src.playbackRate.value = opts.rate || 1;
      var g = ctx.createGain();
      g.gain.value = opts.gain == null ? 1 : opts.gain;
      src.connect(g); g.connect(master);
      src.start();
    } catch (e) { /* 忽略 */ }
  }

  // 低频「咚」：叠在咔声下面，让每一格更有分量
  function thump(opts) {
    if (!ctx || muted) return;
    opts = opts || {};
    try {
      var t = ctx.currentTime, dur = opts.dur || 0.06, f = opts.freq || 140;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.8, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, f * 0.6), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(opts.gain || 0.3, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* 忽略 */ }
  }

  // 安卓可以振动，iOS 网页不支持，调用了也不会报错
  function buzz(ms, minGap) {
    // 用户还没碰过屏幕时不振动（浏览器会拦截并报错）
    if (muted || !ctx || !navigator.vibrate) return;
    var now = performance.now();
    if (now - lastVibrate < (minGap || 30)) return;
    lastVibrate = now;
    try { navigator.vibrate(ms); } catch (e) { /* 忽略 */ }
  }

  function setMuted(m) {
    muted = !!m;
    if (master) master.gain.value = muted ? 0 : 1;
  }

  GJ.audio = {
    unlock: unlock,
    play: play,
    thump: thump,
    buzz: buzz,
    setMuted: setMuted,
    isMuted: function () { return muted; },
    has: function (name) { return !!buffers[name]; },   // 音效是否已解码可用（测试用）
  };
})();
