/*
 * 页面流程：选卡 → 刮卡 → 揭晓并播放 PV → 领券 → 跳转抖音 / 天猫。
 * 旁支：图鉴、再刮一张、领券规则、离开提醒（只出现一次）。
 */
(function () {
  var C = GJ.config;
  var CHAR = {};
  C.characters.forEach(function (c) { CHAR[c.id] = c; });
  var CHANNEL = { douyin: '抖音', tmall: '天猫' };
  var CARD_RATIO = 2000 / 1432;

  var $ = function (id) { return document.getElementById(id); };

  // 调试：链接带 ?debug=1 时，左下角显示最近的事件，方便在真机 / 模拟器上排查
  var DEBUG = /[?&]debug=1/.test(location.search);
  var logBox = null, logLines = [];
  function log(msg) {
    if (!DEBUG) return;
    if (!logBox) {
      logBox = document.createElement('pre');
      logBox.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:9999;max-width:70vw;margin:0;padding:4px 6px;font:10px/1.35 ui-monospace,Menlo,monospace;background:rgba(0,0,0,.72);color:#9f9;pointer-events:none;white-space:pre-wrap';
      document.body.appendChild(logBox);
    }
    var t = (performance.now() / 1000).toFixed(2);
    logLines.push(t + ' ' + msg);
    if (logLines.length > 16) logLines.shift();
    logBox.textContent = logLines.join('\n');
  }
  GJ.log = log;
  if (DEBUG) {
    ['pointerdown', 'pointerup', 'pointercancel', 'click'].forEach(function (type) {
      document.addEventListener(type, function (e) {
        var t = e.target, name = t.id || (t.className && String(t.className).split(' ')[0]) || t.tagName;
        log(type + ' ' + (e.pointerType || '') + ' ' + name + ' @' + Math.round(e.clientX) + ',' + Math.round(e.clientY));
      }, true);
    });
    window.addEventListener('error', function (e) { log('ERROR ' + e.message); });
    window.addEventListener('unhandledrejection', function (e) { log('REJECT ' + (e.reason && e.reason.message || e.reason)); });
  }
  var state = {
    screen: null, current: null, revealed: false, haveCoupon: false,
    jumped: false, guard: false, wheel: null, scratch: null, 
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
      if (has) b.addEventListener('click', function () { closeSheets(true); playOther(c, function () { openSheet('gallery'); }); });
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
      '适用店铺：' + cp.store + '（抖音、天猫）。',
      '7 只秃秃机会均等，每一轮都会遇到一次；不管刮到谁，领到的都是同一张券，多刮不叠加。',
      '刮卡结果只是页面小游戏，和实体盲盒的款式概率无关；实体盲盒概率以销售页公示为准。',
      '页面有音效和视频声音，可以点右上角静音。',
    ];
    list.innerHTML = '';
    items.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; list.appendChild(li); });
  }

  // ---------- S1 选卡 ----------
  // 7 张卡是一副牌：每个位置背后是固定的一只秃秃，刮过的翻成正面，一轮刮完再洗牌
  function buildWheel() {
    var track = $('wheel-track'), cards = [];
    C.characters.forEach(function (c, i) {
      var el = document.createElement('div');
      el.className = 'wcard';
      el.setAttribute('data-i', i);
      el.setAttribute('role', 'option');
      el.innerHTML = '<div class="wcard-in"><img class="wb" alt="" draggable="false" src="assets/cards/back.jpg">' +
        '<img class="wf" alt="" draggable="false"><span class="wcard-no">No.0' + (i + 1) + '</span>' +
        '<span class="wcard-stamp">已刮开</span></div>';
      track.appendChild(el);
      cards.push(el);
    });
    state.cards = cards;
    sizeWheel();
    state.runner = new GJ.Runner($('tutu'), null, null);
    state.wheel = new GJ.Wheel($('wheel'), {
      count: cards.length, cards: cards,
      onMove: function () { $('btn-pick').disabled = true; },
      onSettle: function (i) { updatePickButton(i); state.runner.settle(); },
      onTick: function (dir, speed) { state.runner.step(speed); },
      onFrame: function (pos, vis) { state.runner.update(pos, vis, state.wheel.spacing); },
      onPick: pick,
    });
    $('wheel-prev').addEventListener('click', function () { state.wheel.step(-1); });
    $('wheel-next').addEventListener('click', function () { state.wheel.step(1); });
    $('btn-pick').addEventListener('click', function () { if (state.wheel.settled) pick(state.wheel.index()); });
  }

  function renderDeck() {
    state.cards.forEach(function (el, i) {
      var open = GJ.store.isOpened(i), ch = CHAR[GJ.store.idAt(i)];
      el.classList.toggle('is-open', open);
      el.classList.toggle('is-holo', open && !!ch.hidden);
      var f = el.querySelector('.wf');
      if (open) f.src = 'assets/cards/' + ch.id + '.jpg'; else f.removeAttribute('src');
      el.setAttribute('aria-label', open ? '第 ' + (i + 1) + ' 张，已刮开：' + ch.name : '第 ' + (i + 1) + ' 张激活卡，还没刮');
    });
    var left = GJ.store.left();
    $('hr-tag').textContent = left ? '还剩 ' + left + ' 张' : '已招满';
  }

  // 秃秃 HR 的话和按钮，跟着停下的那张卡变
  function updatePickButton(i) {
    var b = $('btn-pick'), msg = $('hr-msg');
    b.disabled = false;
    if (!GJ.store.left()) {
      b.textContent = '洗牌，再招一轮';
      msg.textContent = '人，7 个岗位都招满啦！洗牌再招一轮？';
    } else if (GJ.store.isOpened(i)) {
      b.textContent = '看 TA 的角色 PV';
      msg.textContent = '人，这个已经上岗啦，看看 TA 在干嘛？';
    } else {
      b.textContent = '立即沟通';
      msg.textContent = '人，这个还没有被认领，要聊聊么？';
    }
  }

  function sizeWheel() {
    var r = $('wheel').getBoundingClientRect();
    if (!r.width) return;
    // 上方留给尺子和秃秃
    var w = Math.min(r.width * 0.54, 240, (r.height - 92) / CARD_RATIO);
    $('wheel').style.setProperty('--wcard-w', Math.max(110, Math.floor(w)) + 'px');
    if (state.wheel) {
      state.wheel.measure(); state.wheel.render();
      state.runner.update(state.wheel.pos, 0, state.wheel.spacing);
    }
  }

  // 进场时转到一张还没刮过的卡上
  function introTarget() {
    var pool = [];
    for (var i = 0; i < C.characters.length; i++) if (!GJ.store.isOpened(i)) pool.push(i);
    if (!pool.length) return state.wheel.index();
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function stopLuck() {
    if (state.stopSparkles) { state.stopSparkles(); state.stopSparkles = null; }
  }

  function enterPick() {
    if (state.scratch) { state.scratch.destroy(); state.scratch = null; }
    stopLuck();
    state.revealed = false;
    show('pick');
    sizeWheel();
    renderDeck();
    $('btn-pick').disabled = true;
    state.wheel.intro(introTarget());
  }

  function pick(i) {
    log('pick ' + i + ' screen=' + state.screen);
    if (state.screen !== 'pick') return;
    GJ.audio.unlock();
    if (!GJ.store.left()) { reshuffleRound(); return; }
    var ch = CHAR[GJ.store.idAt(i)];
    if (GJ.store.isOpened(i)) { playOther(ch, function () {}); return; }
    state.pos = i;
    state.current = ch;
    state.wheel.enabled = false;
    state.runner.cheer();
    GJ.audio.play('slide', { gain: 0.8 });
    setTimeout(enterScratch, 420);
  }

  function reshuffleRound() {
    var w = $('wheel');
    w.classList.add('is-shuffling');
    GJ.audio.play('slide', { gain: 0.9 });
    state.runner.talk('洗牌咯！');
    GJ.store.reshuffle();
    updateCount();
    // 卡片转到侧面（看不见牌面）时换成背面
    setTimeout(renderDeck, 250);
    setTimeout(function () {
      w.classList.remove('is-shuffling');
      $('btn-pick').disabled = true;
      state.wheel.intro(introTarget());
    }, 520);
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
    stopLuck();
    screen.classList.remove('is-luck', 'is-flash');
    card.classList.remove('is-revealed', 'is-ready', 'is-holo');
    card.removeAttribute('role'); card.removeAttribute('tabindex'); card.removeAttribute('aria-label');
    $('scratch-title').textContent = '用手指刮开激活卡';
    $('scratch-sub').classList.remove('is-fortune');
    $('scratch-sub').textContent = '刮开 70% 就会自动翻开';
    $('scratch-meter').style.transform = 'scaleX(0)';
    $('scratch-foot').hidden = false;
    $('reveal-foot').hidden = true;
    $('scratch-front').removeAttribute('src');
    $('scratch-front').alt = ch.name + '的身份卡';
    $('scratch-sub').textContent = '卡片加载中……';
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
      front: 'assets/cards/' + ch.id + '.jpg',
      frontEl: $('scratch-front'),
      threshold: C.revealAt,
      // 卡片好了才开始下载 PV，不和卡面抢网速
      onReady: function () {
        if (!said) $('scratch-sub').textContent = '刮开 70% 就会自动翻开';
        GJ.player.prepare(ch);
      },
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
    state.scratch.ready.catch(function (err) {
      log('scratch failed ' + (err && err.message));
      toast('网络有点慢，卡片已直接翻开');
      $('scratch-front').src = 'assets/cards/' + ch.id + '.jpg';
      state.scratch.reveal(false);
    });
  }

  function reveal() {
    log('reveal ' + (state.current && state.current.id));
    var ch = state.current, card = $('scratch-card'), screen = $('s-scratch');
    state.revealed = true;
    state.revealTime = performance.now();
    GJ.store.open(state.pos);
    updateCount();
    renderDeck();
    card.classList.add('is-revealed');
    if (ch.hidden) luckReveal();
    else {
      GJ.audio.play('sparkle', { gain: 0.8 });
      GJ.audio.buzz(30, 0);
      $('scratch-title').textContent = '是' + ch.name + '！';
    }
    showFortune(ch);
    $('scratch-foot').hidden = true;
    $('reveal-foot').hidden = false;
    // 停在这里看卡片和运势；点卡片才播 PV
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', '播放' + ch.name + '的角色 PV');
    requestAnimationFrame(sizeScratch);
  }

  // 揭晓后标题下面那一行换成今日运势
  function showFortune(ch) {
    var sub = $('scratch-sub');
    sub.textContent = '';
    var tag = document.createElement('span');
    tag.textContent = '今日运势';
    var text = document.createElement('b');
    text.textContent = ch.fortune;
    sub.appendChild(tag); sub.appendChild(text);
    sub.classList.add('is-fortune');
  }

  // 隐藏款：一道闪光、满屏星星炸开、卡面炫彩流光、周围一直飘闪粉
  function luckReveal() {
    var screen = $('s-scratch'), card = $('scratch-card');
    screen.classList.add('is-luck', 'is-flash');
    card.classList.add('is-holo');
    $('scratch-title').textContent = '你刮到了隐藏款！';
    GJ.audio.thump({ freq: 70, gain: 0.8, dur: 0.25 });
    GJ.audio.play('shimmer', { gain: 0.9 });
    GJ.audio.play('sparkle', { gain: 1 });
    GJ.audio.buzz([40, 60, 40, 60, 120], 0);
    setTimeout(function () {
      var sr = screen.getBoundingClientRect(), cr = card.getBoundingClientRect();
      GJ.fx.starBurst(screen, { x: cr.left - sr.left + cr.width / 2, y: cr.top - sr.top + cr.height * 0.45, count: 110 });
    }, 140);
    setTimeout(function () { screen.classList.remove('is-flash'); }, 900);
    state.stopSparkles = GJ.fx.sparkles($('scratch-area'));
  }

  // ---------- PV ----------
  function stripText() { return C.coupon.name + ' ¥' + C.coupon.amount + ' 已备好'; }

  function openPV(ch) {
    log('openPV ' + ch.id);
    GJ.player.open(ch, {
      strip: stripText(),
      onBack: function () { /* 回到卡片 */ },
      onSkip: goCoupon,
      onEnded: goCoupon,
    });
  }

  // 看已经刮开过的角色（转轮上翻开的卡、图鉴）。点券条就以 TA 为主角去领券
  function playOther(ch, back) {
    var canCoupon = GJ.store.got().length > 0;
    GJ.player.open(ch, {
      strip: canCoupon ? stripText() : null,
      onBack: back,
      onSkip: function () {
        if (!canCoupon) { back(); return; }
        state.current = ch; state.revealed = true;
        goCoupon();
      },
      onEnded: back,
    });
  }

  // ---------- S4 领券 ----------
  function fillCoupon() {
    var ch = state.current, cp = C.coupon;
    $('result-card').src = 'assets/cards/' + ch.id + '.jpg';
    $('result-card').alt = ch.name + '的身份卡';
    $('result-name').textContent = ch.name + '认你做主人了';
    $('result-hidden').hidden = !ch.hidden;
    $('result-card-wrap').classList.toggle('is-holo', !!ch.hidden);
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
    if (!state.revealed) return;
    stopLuck();
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
    log('popstate guard=' + state.guard);
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
      // 卡片还没加载完时，等加载好再翻开，不会翻出空白
      var sc = state.scratch;
      if (sc) sc.ready.then(function () { sc.reveal(true); }, function () {});
    });
    $('scratch-card').addEventListener('click', function () {
      // 刮卡最后那一下抬手也会触发 click，揭晓后 0.8 秒内的点击不算
      if (state.revealed && state.screen === 'scratch' && performance.now() - state.revealTime > 800) openPV(state.current);
    });
    $('btn-to-coupon').addEventListener('click', goCoupon);
    $('scratch-card').addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && state.revealed && state.screen === 'scratch') { e.preventDefault(); openPV(state.current); }
    });
    $('btn-pv-again').addEventListener('click', function () { openPV(state.current); });
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

    // 从抖音 / 天猫返回时，页面可能从缓存恢复，收起跳转层
    window.addEventListener('pageshow', function (e) { if (e.persisted) { clearJump(); $('jump').hidden = true; } });

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

  // 首屏稳定后，在后台一张一张地把 7 张卡面先下载好，选卡时就不用等
  function preloadCards() {
    var queue = GJ.store.deck().filter(function (id, i) { return !GJ.store.isOpened(i); });
    (function next() {
      var id = queue.shift();
      if (!id) return;
      GJ.loadImage('assets/cards/' + id + '.jpg', 1).then(next, next);
    })();
  }

  function init() {
    GJ.player.init();
    setMuted(GJ.store.muted());
    updateCount();
    renderRules();
    makeBurst();
    bind();
    buildWheel();
    enterPick();
    setTimeout(preloadCards, 1200);
  }

  GJ.app = { setMuted: setMuted };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
