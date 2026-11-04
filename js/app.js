/*
 * 页面流程：选卡 → 刮卡 → 揭晓并播放 PV → 领券 → 跳转抖音 / 淘宝。
 * 旁支：图鉴、再刮一张、领券规则、离开提醒（只出现一次）。
 */
(function () {
  var C = GJ.config;
  var CHAR = {};
  C.characters.forEach(function (c) { CHAR[c.id] = c; });
  var CHANNEL = { douyin: '抖音', taobao: '淘宝' };
  var CARD_RATIO = 2000 / 1432;

  var $ = function (id) { return document.getElementById(id); };
  var state = {
    screen: null, current: null, revealed: false, haveCoupon: false,
    jumped: false, guard: false, wheel: null, scratch: null, autoPV: 0,
  };

  // ---------- 通用 ----------
  function show(name) {
    state.screen = name;
    document.querySelectorAll('.screen').forEach(function (s) {
      var on = s.getAttribute('data-screen') === name;
      s.hidden = !on;
      s.classList.remove('enter');
      if (on) { void s.offsetWidth; s.classList.add('enter'); }
    });
    if (state.wheel) state.wheel.enabled = name === 'pick';
  }

  var toastTimer = 0;
  function toast(text) {
    var t = $('toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1800);
  }

  function setMuted(m) {
    GJ.audio.setMuted(m);
    GJ.player.setMuted(m);
    GJ.store.setMuted(m);
    var b = $('btn-mute');
    b.setAttribute('aria-pressed', m ? 'true' : 'false');
    b.setAttribute('aria-label', m ? '打开声音' : '静音');
  }

  function updateCount() {
    var n = GJ.store.got().length;
    $('gallery-count').textContent = n + '/' + C.characters.length;
  }

  // ---------- 弹层 ----------
  var openSheetEl = null;
  function openSheet(name) {
    closeSheets(true);
    if (name === 'gallery') renderGallery();
    var el = $('sheet-' + name);
    var scrim = $('scrim');
    scrim.hidden = false; el.hidden = false;
    openSheetEl = el;
    requestAnimationFrame(function () { scrim.classList.add('is-on'); el.classList.add('is-on'); });
    var focusable = el.querySelector('button');
    if (focusable) setTimeout(function () { focusable.focus({ preventScroll: true }); }, 60);
  }
  function closeSheets(instant) {
    var scrim = $('scrim');
    document.querySelectorAll('.sheet').forEach(function (s) {
      s.classList.remove('is-on');
      if (instant) s.hidden = true;
      else setTimeout(function () { if (!s.classList.contains('is-on')) s.hidden = true; }, 360);
    });
    scrim.classList.remove('is-on');
    if (instant) scrim.hidden = true;
    else setTimeout(function () { if (!scrim.classList.contains('is-on')) scrim.hidden = true; }, 260);
    openSheetEl = null;
  }

  function renderGallery() {
    var got = GJ.store.got(), wrap = $('gallery');
    wrap.innerHTML = '';
    C.characters.forEach(function (c) {
      var has = got.indexOf(c.id) >= 0;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-item' + (has ? ' is-got' : (c.hidden ? ' is-hidden' : ' is-locked'));
      b.disabled = !has;
      var label = has ? c.name : (c.hidden ? '隐藏款 ？' : c.name);
      b.setAttribute('aria-label', has ? '播放' + c.name + '的 PV' : label + '，未解锁');
      b.innerHTML = '<img alt="" src="assets/figures/' + c.id + '.png"><span></span>';
      b.querySelector('span').textContent = label;
      if (has) b.addEventListener('click', function () { closeSheets(true); playFromGallery(c); });
      wrap.appendChild(b);
    });
    var n = got.length, total = C.characters.length;
    $('g-count').textContent = n + '/' + total;
    $('g-sub').textContent = n >= total ? '嘟嘟！7 只秃秃都认识你了' : '点亮的秃秃可以再看一次 TA 的 PV';
    $('g-again').hidden = !state.revealed;
  }

  function renderRules() {
    var cp = C.coupon, list = $('rules');
    var items = [
      cp.name + '：立减 ¥' + cp.amount + '，' + cp.threshold + '，' + cp.validity + '。',
      '适用店铺：' + cp.store + '（抖音、淘宝）。',
      '7 只秃秃机会均等，每一轮都会遇到一次；不管刮到谁，领到的都是同一张券，多刮不叠加。',
      '刮卡结果只是页面小游戏，和实体盲盒的款式概率无关；实体盲盒概率以销售页公示为准。',
      '页面有音效和视频声音，可以点右上角静音。',
    ];
    list.innerHTML = '';
    items.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; list.appendChild(li); });
  }

  // ---------- S1 选卡 ----------
  function buildWheel() {
    var track = $('wheel-track'), cards = [];
    C.characters.forEach(function (c, i) {
      var el = document.createElement('div');
      el.className = 'wcard';
      el.setAttribute('data-i', i);
      el.setAttribute('role', 'option');
      el.setAttribute('aria-label', '第 ' + (i + 1) + ' 张激活卡');
      el.innerHTML = '<div class="wcard-in"><img alt="" draggable="false" src="assets/cards/back.jpg"><span class="wcard-no">No.0' + (i + 1) + '</span></div>';
      track.appendChild(el);
      cards.push(el);
    });
    sizeWheel();
    state.wheel = new GJ.Wheel($('wheel'), {
      count: cards.length, cards: cards, flapper: $('flapper'),
      onMove: function (i) { $('btn-pick').disabled = true; setNo(i); },
      onSettle: function (i) { $('btn-pick').disabled = false; setNo(i); },
      onPick: pick,
    });
    if (state.wheel.settled) $('btn-pick').disabled = false;
    $('wheel').addEventListener('pointerdown', function () { $('wheel-hint').classList.add('is-off'); }, { once: true });
    $('wheel-prev').addEventListener('click', function () { state.wheel.step(-1); });
    $('wheel-next').addEventListener('click', function () { state.wheel.step(1); });
    $('btn-pick').addEventListener('click', function () { if (state.wheel.settled) pick(); });
  }

  function setNo(i) { $('wheel-no').textContent = 'No.0' + (i + 1); }

  function sizeWheel() {
    var r = $('wheel').getBoundingClientRect();
    if (!r.width) return;
    var w = Math.min(r.width * 0.56, 250, (r.height - 40) / CARD_RATIO);
    $('wheel').style.setProperty('--wcard-w', Math.max(120, Math.floor(w)) + 'px');
    if (state.wheel) { state.wheel.measure(); state.wheel.render(); }
  }

  function enterPick() {
    clearTimeout(state.autoPV);
    if (state.scratch) { state.scratch.destroy(); state.scratch = null; }
    state.revealed = false;
    state.current = CHAR[GJ.store.next()];
    // 结果已经定好，提前加载卡面和 PV，刮完就能播
    new Image().src = 'assets/cards/' + state.current.id + '.jpg';
    GJ.player.prepare(state.current);
    show('pick');
    sizeWheel();
    $('btn-pick').disabled = true;
    state.wheel.intro();
    if (state.wheel.settled) $('btn-pick').disabled = false;
  }

  function pick() {
    if (state.screen !== 'pick') return;
    GJ.audio.unlock();
    GJ.audio.play('slide', { gain: 0.8 });
    enterScratch();
  }

  // ---------- S2 刮卡 / S3 揭晓 ----------
  function sizeScratch() {
    var r = $('scratch-area').getBoundingClientRect();
    if (!r.width) return;
    var w = Math.min(r.width, 400, r.height / CARD_RATIO);
    $('scratch-card').style.setProperty('--sc-w', Math.floor(w) + 'px');
  }

  function enterScratch() {
    var ch = state.current, card = $('scratch-card'), screen = $('s-scratch');
    screen.classList.remove('is-luck');
    card.classList.remove('is-revealed', 'is-ready');
    $('scratch-title').textContent = '用手指刮开激活卡';
    $('scratch-sub').textContent = '刮开 70% 就会自动翻开';
    $('scratch-meter').style.transform = 'scaleX(0)';
    $('scratch-foot').hidden = false;
    $('reveal-foot').hidden = true;
    $('scratch-front').src = 'assets/cards/' + ch.id + '.jpg';
    $('scratch-front').alt = ch.name + '的身份卡';
    // 上一轮揭晓时卡片缩小过，这里直接回到大尺寸，不要过渡，否则刮层会按过渡中的尺寸画
    card.classList.add('no-anim');
    show('scratch');
    sizeScratch();
    void card.offsetWidth;
    card.classList.remove('no-anim');

    var hint = card.querySelector('.finger-hint');
    hint.classList.remove('is-on');
    var hintTimer = setTimeout(function () { hint.classList.add('is-on'); }, 900);
    var said = false;

    state.scratch = new GJ.Scratch(card, {
      cover: 'assets/cards/back.jpg',
      threshold: C.revealAt,
      onFirstTouch: function () {
        clearTimeout(hintTimer);
        hint.classList.remove('is-on');
        GJ.player.unlockFromGesture();
      },
      onProgress: function (p) {
        $('scratch-meter').style.transform = 'scaleX(' + Math.min(1, p / C.revealAt).toFixed(3) + ')';
        if (!said && p > 0.14) { said = true; $('scratch-sub').textContent = '嘟？好像看到一顶帽子……'; }
      },
      onReveal: function () { clearTimeout(hintTimer); hint.classList.remove('is-on'); reveal(); },
    });
    state.scratch.ready.catch(function () {
      toast('卡片没加载出来，已直接翻开');
      state.scratch.reveal(false);
    });
  }

  function reveal() {
    var ch = state.current, card = $('scratch-card');
    state.revealed = true;
    state.revealTime = performance.now();
    GJ.store.collect(ch.id);
    updateCount();
    card.classList.add('is-revealed');
    GJ.audio.play('sparkle', { gain: ch.hidden ? 1 : 0.8 });
    GJ.audio.buzz(30, 0);
    if (ch.hidden) {
      $('s-scratch').classList.add('is-luck');
      $('scratch-title').textContent = '你刮到了隐藏款！';
      $('scratch-sub').textContent = '梦境修复师很少出门哦';
    } else {
      $('scratch-title').textContent = '是' + ch.name + '！';
      $('scratch-sub').textContent = 'TA 认你做主人了';
    }
    $('bubble-name').textContent = '嘟嘟！我是' + ch.name;
    $('bubble-line').textContent = ch.line;
    $('scratch-foot').hidden = true;
    $('reveal-foot').hidden = false;
    requestAnimationFrame(sizeScratch);
    clearTimeout(state.autoPV);
    state.autoPV = setTimeout(function () {
      if (state.screen === 'scratch' && state.revealed && !openSheetEl) openPV(ch, 'reveal');
    }, 1700);
  }

  // ---------- PV ----------
  function stripText() { return C.coupon.name + ' ¥' + C.coupon.amount + ' 已备好'; }

  function openPV(ch, mode) {
    clearTimeout(state.autoPV);
    GJ.player.open(ch, {
      strip: stripText(),
      onBack: function () { /* 留在当前页面 */ },
      onSkip: goCoupon,
      onEnded: goCoupon,
    });
  }

  function playFromGallery(ch) {
    GJ.player.open(ch, {
      strip: state.haveCoupon || state.revealed ? stripText() : null,
      onBack: function () { openSheet('gallery'); },
      onSkip: function () { if (state.haveCoupon || state.revealed) goCoupon(); else openSheet('gallery'); },
      onEnded: function () { openSheet('gallery'); },
    });
  }

  // ---------- S4 领券 ----------
  function fillCoupon() {
    var ch = state.current, cp = C.coupon;
    $('result-card').src = 'assets/cards/' + ch.id + '.jpg';
    $('result-card').alt = ch.name + '的身份卡';
    $('result-name').textContent = ch.name + '认你做主人了';
    $('result-hidden').hidden = !ch.hidden;
    $('result-count').textContent = '图鉴 ' + GJ.store.got().length + '/' + C.characters.length;
    $('result-fortune').textContent = ch.fortune;
    $('c-amount').textContent = cp.amount;
    $('c-name').textContent = cp.name;
    $('c-threshold').textContent = cp.threshold;
    $('c-validity').textContent = cp.validity;
    $('c-store').textContent = '适用：' + cp.store;
    var price = $('c-price');
    if (typeof C.price === 'number' && C.price > 0) {
      var after = Math.max(0, C.price - cp.amount);
      price.innerHTML = '单盒 <s>¥' + C.price + '</s>　券后 <b>¥' + after + '</b>';
      price.hidden = false;
    } else price.hidden = true;
  }

  function goCoupon() {
    clearTimeout(state.autoPV);
    if (!state.revealed) return;
    state.haveCoupon = true;
    fillCoupon();
    if (state.screen !== 'coupon') {
      show('coupon');
      $('s-coupon').querySelector('.coupon-scroll').scrollTop = 0;
      GJ.audio.play('pop', { gain: 0.7 });
    }
    // 离开提醒：在历史记录里垫一步，用户按返回时先提醒一次
    if (C.leaveReminder && !state.guard && !GJ.store.leaveShown()) {
      try { history.pushState({ gj: 'guard' }, ''); state.guard = true; } catch (e) { /* 忽略 */ }
    }
  }

  window.addEventListener('popstate', function () {
    if (!state.guard) return;
    state.guard = false;
    if (state.screen === 'coupon' && !state.jumped && !GJ.store.leaveShown() && !GJ.player.isOpen()) {
      GJ.store.markLeaveShown();
      $('l-title').textContent = state.current.name + '还在门口等你哦';
      $('leave-fig').src = 'assets/figures/' + state.current.id + '.png';
      openSheet('leave');
    } else {
      history.back();
    }
  });

  // ---------- 跳转 ----------
  var jumpTimers = [];
  function clearJump() { jumpTimers.forEach(clearTimeout); jumpTimers = []; }

  function jump(channel) {
    var url = C.links[channel], ch = state.current;
    if (!url) { toast('链接还没配置'); return; }
    state.jumped = true;
    clearJump();
    $('jump-fig').src = 'assets/figures/' + ch.id + '.png';
    $('jump-sub').textContent = ch.name + '在' + CHANNEL[channel] + '门口等你';
    $('jump-app').textContent = CHANNEL[channel];
    $('jump-url').textContent = url;
    $('jump-fallback').hidden = true;
    var j = $('jump');
    j.hidden = false;
    j.querySelector('.jump-bar').hidden = false;
    var bar = j.querySelector('.jump-bar i');
    bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
    GJ.audio.play('success', { gain: 0.8 });
    GJ.audio.buzz(20, 0);
    jumpTimers.push(setTimeout(function () { window.location.href = url; }, 1000));
    // 3 秒后页面还在，说明没有唤起 App，给兜底
    jumpTimers.push(setTimeout(function () {
      if (document.hidden) return;
      j.querySelector('.jump-bar').hidden = true;
      $('jump-fallback').hidden = false;
    }, 3200));
    j.setAttribute('data-channel', channel);
  }

  function copyText(text) {
    function fallback() {
      var r = document.createRange();
      r.selectNodeContents($('jump-url'));
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      toast(ok ? '链接已复制' : '请长按链接手动复制');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('链接已复制'); }, fallback);
    } else fallback();
  }

  // ---------- 绑定 ----------
  function bind() {
    $('btn-mute').addEventListener('click', function () {
      GJ.audio.unlock();
      setMuted(!GJ.audio.isMuted());
    });
    $('btn-gallery').addEventListener('click', function () { GJ.audio.unlock(); openSheet('gallery'); });
    document.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () { openSheet(b.getAttribute('data-open')); });
    });
    document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { closeSheets(); }); });
    $('scrim').addEventListener('click', function () { closeSheets(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openSheetEl) closeSheets(); });

    $('btn-flip').addEventListener('click', function () {
      GJ.audio.unlock();
      GJ.player.unlockFromGesture();
      if (state.scratch) state.scratch.reveal(true);
    });
    $('scratch-card').addEventListener('click', function () {
      // 刮卡最后那一下抬手也会触发 click，揭晓后 0.8 秒内的点击不算
      if (state.revealed && state.screen === 'scratch' && performance.now() - state.revealTime > 800) openPV(state.current, 'reveal');
    });
    $('btn-to-coupon').addEventListener('click', goCoupon);
    $('btn-replay').addEventListener('click', function () { openPV(state.current, 'reveal'); });
    $('btn-pv-again').addEventListener('click', function () { openPV(state.current, 'coupon'); });
    $('btn-again').addEventListener('click', function () { closeSheets(true); enterPick(); });
    $('g-again').addEventListener('click', function () { closeSheets(true); enterPick(); });
    document.querySelectorAll('[data-channel]').forEach(function (b) {
      if (b.closest('.jump')) return;
      b.addEventListener('click', function () { jump(b.getAttribute('data-channel')); });
    });
    $('jump-copy').addEventListener('click', function () { copyText($('jump-url').textContent); });
    $('jump-retry').addEventListener('click', function () {
      var ch = $('jump').getAttribute('data-channel');
      if (ch) jump(ch);
    });
    $('jump-close').addEventListener('click', function () { clearJump(); $('jump').hidden = true; });
    $('leave-stay').addEventListener('click', function () { closeSheets(); });
    $('leave-go').addEventListener('click', function () { closeSheets(true); history.back(); });

    // 从抖音 / 淘宝返回时，页面可能从缓存恢复，收起跳转层
    window.addEventListener('pageshow', function (e) { if (e.persisted) { clearJump(); $('jump').hidden = true; } });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) GJ.audio.setScratch(0);
    });

    // 防止页面被拖动、双指缩放、双击放大
    document.addEventListener('touchmove', function (e) {
      if (!e.target.closest || !e.target.closest('.coupon-scroll, .sheet')) e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });

    var rz = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rz);
      rz = setTimeout(function () { sizeWheel(); if (state.screen === 'scratch') sizeScratch(); }, 60);
    });
  }

  function makeBurst() {
    var b = document.querySelector('.burst');
    var colors = ['#F6CF4E', '#D1001F', '#84654A', '#F6CF4E', '#FFFFFF'];
    for (var i = 0; i < 14; i++) {
      var a = (i / 14) * Math.PI * 2, d = 120 + (i % 3) * 36;
      var dot = document.createElement('i');
      dot.style.setProperty('--bx', Math.cos(a) * d + 'px');
      dot.style.setProperty('--by', Math.sin(a) * d + 'px');
      dot.style.background = colors[i % colors.length];
      dot.style.animationDelay = (i % 4) * 0.03 + 's';
      b.appendChild(dot);
    }
  }

  function init() {
    GJ.player.init();
    setMuted(GJ.store.muted());
    updateCount();
    renderRules();
    makeBurst();
    bind();
    show('pick');
    buildWheel();
    enterPick();
  }

  GJ.app = { setMuted: setMuted };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
