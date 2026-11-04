/*
 * 音效与振动。
 * 浏览器要求用户先碰一下屏幕才能出声，所以第一次按下时调用 unlock()。
 * 刮卡时是秃秃的「嘟」，节奏跟着手指速度走（合成音，见 du）。
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
    if (ctx.state === 'suspended') ctx.resume().catch(function () {});
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

  // 秃秃的「嘟」：合成的短促音，像一颗泡泡，刮卡时一下一下地冒出来
  function du(opts) {
    if (!ctx || muted) return;
    opts = opts || {};
    try {
      var t = ctx.currentTime, f = opts.freq || 660, dur = opts.dur || 0.14, peak = opts.gain || 0.32;
      var o = ctx.createOscillator(), o2 = ctx.createOscillator();
      var lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
      var lp = ctx.createBiquadFilter(), g = ctx.createGain(), g2 = ctx.createGain();
      o.type = 'triangle'; o2.type = 'sine';
      // 「d」的起音：音高从高处滑下来；结尾微微下坠
      o.frequency.setValueAtTime(f * 1.3, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.028);
      o.frequency.setValueAtTime(f, t + dur * 0.65);
      o.frequency.exponentialRampToValueAtTime(f * 0.9, t + dur);
      o2.frequency.setValueAtTime(f * 2, t);
      // 一点颤音，更像嘴里发出来的
      lfo.frequency.value = 16; lfoGain.gain.value = f * 0.018;
      lfo.connect(lfoGain); lfoGain.connect(o.frequency);
      // 「u」的口型：低通 + 共振
      lp.type = 'lowpass'; lp.frequency.value = f * 2.6; lp.Q.value = 5;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
      g.gain.setTargetAtTime(peak * 0.55, t + 0.035, 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g2.gain.value = 0.12;
      o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(master);
      o.start(t); o2.start(t); lfo.start(t);
      o.stop(t + dur + 0.02); o2.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
    } catch (e) { /* 忽略 */ }
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
    du: du,
    setMuted: setMuted,
    isMuted: function () { return muted; },
  };
})();
