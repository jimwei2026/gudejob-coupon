/*
 * 版本线 2 · 老板版（v10）：用户是老板，7 只秃秃来应聘「首席情绪价值官」。
 * 第一次进来先看开场主题视频 → 人才列表 → 在线简历 → 和秃秃沟通（面试邀请）→ 面试：刮开工牌
 * → 发 Offer → 秃秃接受、送见面礼 → 入职确认（领券）→ 跳转抖音 / 天猫。
 * 领券不设门槛：一级页面底部固定券条，二级页面右上角都有「领券」，开场视频和作品集视频下方也有券条。
 * 底部三个标签：人才 / 消息 / 我的。所有二级页面都进浏览器历史，手机返回键和侧滑返回都能用。
 */
(function () {
  var C = GJ.config, S = GJ.store;
  var CHAR = {};
  C.characters.forEach(function (c) { CHAR[c.id] = c; });
  var CHANNEL = { douyin: '抖音', tmall: '天猫' };
  var CARD_RATIO = 2000 / 1432;
  var $ = function (id) { return document.getElementById(id); };
  function chAt(i) { return CHAR[S.idAt(i)]; }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

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
    logLines.push((performance.now() / 1000).toFixed(2) + ' ' + msg);
    if (logLines.length > 16) logLines.shift();
    logBox.textContent = logLines.join('\n');
  }
  GJ.log = log;
  if (DEBUG) {
    window.addEventListener('error', function (e) { log('ERROR ' + e.message); });
    window.addEventListener('unhandledrejection', function (e) { log('REJECT ' + (e.reason && e.reason.message || e.reason)); });
  }

  var ui = {
    tab: 'jobs', sort: 'rec', filter: 'all',
    pos: -1, chatPos: -1, offerPos: -1,
    sc: null, scPos: -1, scRevealed: false, scHandled: false,
    stopSparkles: null, jumped: false, leaveOpen: false, invite: null,
  };

  // ---------- 图层：最上面那层之外都设成 inert，读屏和键盘不会跑到下面去 ----------
  // 顺序就是叠放顺序：领券页能盖在面试、视频上面；开场视频在最上面
  var LAYERS = ['root', 'pg-resume', 'pg-chat', 'pg-offer', 'scratch-ov', 'player', 'pg-coupon', 'jump', 'intro'];
  var openSheetEl = null;
  // 判断一层是不是「打开着」。关闭动画还在播的那一层不算——
  // 之前播放器淡出的 0.26 秒里还算打开，结果把下面的聊天页一直锁成不可点（看完视频按返回后点不动）
  function layerOpen(id) {
    var el = $(id);
    if (id === 'root') return true;
    if (id === 'player') return GJ.player.isOpen();
    if (id === 'intro') return GJ.intro.isOpen();
    if (el.hidden) return false;
    if (id === 'jump') return true;
    return el.classList.contains('is-in');
  }
  function setInert(el, v) {
    el.inert = v;
    if (v) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden');
  }
  function syncInert() {
    var top = 0;
    LAYERS.forEach(function (id, k) { if (layerOpen(id)) top = k; });
    LAYERS.forEach(function (id, k) { setInert($(id), !!openSheetEl || k < top); });
  }

  // ---------- 导航（配合浏览器的返回键 / 侧滑返回） ----------
  var nav = (function () {
    var stack = [], after = null, armed = false;
    function run() { if (after) { var f = after; after = null; f(); } }
    function push(type, close) {
      stack.push({ type: type, close: close, silent: false });
      try { history.pushState({ gjd: stack.length }, ''); } catch (e) { /* 忽略 */ }
      syncInert();
    }
    function back(fn) { after = fn || null; if (!stack.length) { run(); return; } history.back(); }
    function backTo(n, fn) {
      var k = stack.length - n;
      after = fn || null;
      if (k <= 0) { run(); return; }
      history.go(-k);
    }
    // 播放器这类自己已经关掉的图层：只把历史退一步，不再重复关
    function dismissed(type, fn) {
      var t = stack[stack.length - 1];
      if (t && t.type === type) { t.silent = true; back(fn); } else if (fn) fn();
    }
    function top() { var t = stack[stack.length - 1]; return t ? t.type : null; }
    function has(type) { return stack.some(function (e) { return e.type === type; }); }
    // 第一次点屏幕时在历史里垫一步：在最外层再按返回，先看要不要提醒领券
    function arm() {
      if (armed || stack.length) return;
      armed = true;
      try { history.replaceState({ gjd: -1 }, ''); history.pushState({ gjd: 0 }, ''); } catch (e) { /* 忽略 */ }
    }
    window.addEventListener('popstate', function (e) {
      var d = e.state && typeof e.state.gjd === 'number' ? e.state.gjd : -2;
      log('popstate d=' + d + ' depth=' + stack.length);
      if (!$('jump').hidden) hideJump();
      var target = Math.max(0, d);
      while (stack.length > target) {
        var t = stack.pop();
        if (!t.silent && t.close) t.close();
      }
      syncInert();
      // 关闭动画放完后再核对一次，保证最上面那层一定能点
      setTimeout(syncInert, 350);
      if (d === -1) { after = null; onExit(); return; }
      run();
    });
    return { push: push, back: back, backTo: backTo, dismissed: dismissed, top: top, has: has, arm: arm,
      depth: function () { return stack.length; } };
  })();

  // ---------- 通用 ----------
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
    S.setMuted(m);
    var b = $('btn-mute');
    b.setAttribute('aria-pressed', m ? 'true' : 'false');
    b.setAttribute('aria-label', m ? '打开声音' : '静音');
    $('sw-sound').setAttribute('aria-checked', m ? 'false' : 'true');
  }

  function openPage(id) {
    var el = $(id);
    el.hidden = false;
    el.classList.remove('is-in');
    void el.offsetWidth;
    el.classList.add('is-in');
    var b = el.querySelector('[data-back]');
    if (b) setTimeout(function () { if (el.classList.contains('is-in')) b.focus({ preventScroll: true }); }, 330);
  }
  function closePage(id) {
    var el = $(id);
    el.classList.remove('is-in');
    setTimeout(function () { if (!el.classList.contains('is-in')) el.hidden = true; }, 320);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clock(ms) { var d = new Date(ms || Date.now()); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtDist(m) { return m < 1 ? Math.round(m * 100) + 'cm' : m + 'm'; }

  // 隐藏款面试（刮开工牌）之前保密：名字、头像、简历都用 config 里的 mask
  function masked(i) { return !!chAt(i).hidden && S.status(i) < 2; }
  function R(i) {
    var ch = chAt(i), r = ch.resume;
    if (!masked(i)) return r;
    var m = {}, k;
    for (k in r) m[k] = r[k];
    for (k in ch.mask) m[k] = ch.mask[k];
    return m;
  }
  function nameOf(i) { return masked(i) ? chAt(i).mask.name : chAt(i).name; }
  function tagsOf(i) { var r = R(i); return r.tags || chAt(i).job.tags; }
  function avaHtml(i, cls) {
    var ch = chAt(i);
    if (masked(i)) return '<span class="t-ava is-mask' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><img alt="" src="assets/tutu/front.png"><b>?</b></span>';
    return '<span class="t-ava' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><img alt="" src="assets/figures/' + ch.id + '.png"></span>';
  }
  function infoLine(i) {
    var ch = chAt(i);
    if (masked(i)) return ch.mask.info;
    return '4cm · 应届 · ' + ch.job.scene + ' · ' + (S.status(i) >= 3 ? '已到岗' : '离开盲盒-随时到岗');
  }
  // 状态标签：每种状态都写着字，不只靠颜色区分
  function stChip(i) {
    var st = S.status(i), r = R(i);
    if (st >= 3) return '<span class="tag-dark">已入职</span>';
    if (st === 2) return '<span class="st-done">已面试</span>';
    if (st === 1) return '<span class="st-wait">待面试</span>';
    if (chAt(i).hidden) return '<span class="act-night">' + esc(r.active) + '</span>';
    if (r.active === '刚刚活跃') return '<span class="active"><i></i>刚刚活跃</span>';
    return '<span class="act-soft">' + esc(r.active) + '</span>';
  }
  function stText(i) {
    var st = S.status(i);
    return st >= 3 ? '已入职' : st === 2 ? '已面试' : st === 1 ? '待面试' : R(i).active;
  }
  function latestHired() {
    var best = -1;
    for (var i = 0; i < S.size; i++) {
      if (S.status(i) >= 3 && (best < 0 || S.startedAt(i) > S.startedAt(best))) best = i;
    }
    return best;
  }

  // ---------- 人才列表 ----------
  function order() {
    var idx = [];
    for (var i = 0; i < S.size; i++) idx.push(i);
    if (ui.sort === 'near') idx.sort(function (a, b) { return chAt(a).job.dist - chAt(b).job.dist; });
    else if (ui.sort === 'new') idx.reverse();
    else idx.sort(function (a, b) { return (S.status(a) >= 3) - (S.status(b) >= 3) || a - b; });
    return idx.filter(function (i) {
      if (ui.filter === 'wait') return S.status(i) < 2;
      if (ui.filter === 'hired') return S.status(i) >= 3;
      if (ui.filter === 'fav') return S.isFav(i);
      return true;
    });
  }

  // 卡片右下角的按钮：跟着进度变
  function cardAction(i) {
    var st = S.status(i);
    if (st >= 3) return ['看入职确认', true];
    if (st === 2) return ['发 Offer', false];
    if (st === 1) return ['去面试', false];
    return ['打招呼', false];
  }

  function talentCard(i) {
    var ch = chAt(i), st = S.status(i), r = R(i), hired = st >= 3;
    // 整张卡片由一层透明按钮负责「看简历」；右下角的按钮单独响应（打招呼 / 去面试 / 发 Offer / 看入职确认）
    var b = document.createElement('div');
    b.className = 'job t-card' + (hired ? ' is-hired' : '') + (masked(i) ? ' is-mask' : '');
    var want = hired ? '入职礼物：' + ch.job.gift + '（限定收集品）' : '期望：' + r.role + ' · ' + C.job.place;
    var act = cardAction(i);
    var label = nameOf(i) + '，' + stText(i) + '，' + want + '，看简历';
    b.innerHTML =
      '<button type="button" class="job-hit" aria-label="' + esc(label) + '"></button>' +
      '<span class="t-top">' + avaHtml(i) +
        '<span class="t-main"><span class="t-r1"><span class="t-name">' + esc(nameOf(i)) + '</span>' + stChip(i) + '</span>' +
        '<span class="t-line">' + esc(infoLine(i)) + '</span>' +
        '<span class="t-want"><span class="fill">' + esc(want) + '</span><span class="muted">' + fmtDist(ch.job.dist) + '</span></span></span></span>' +
      (hired ? '' : '<span class="t-adv">优势：' + esc(r.short) + '</span>') +
      '<span class="t-foot"><span class="tags">' + tagsOf(i).slice(0, 3).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</span>' +
        '<button type="button" class="t-act' + (act[1] ? ' soft' : '') + '"' + (st === 1 ? ' data-nosfx' : '') + '><span>' + act[0] + '</span></button></span>';
    b.querySelector('.job-hit').addEventListener('click', function () { openResume(i); });
    // 已入职：看入职确认；其余进聊天（聊天里按进度给出「开始面试」「发 Offer」）
    b.querySelector('.t-act').addEventListener('click', function () {
      if (S.status(i) >= 3) goOffer(i); else openChat(i);
    });
    return b;
  }

  function renderJobs() {
    var hired = S.hired();
    $('f-all').textContent = S.size;
    $('f-wait').textContent = S.toInterview();
    $('f-hired').textContent = hired;
    var favs = S.favCount();
    $('f-fav').textContent = favs;
    $('f-fav-btn').hidden = !favs && ui.filter !== 'fav';
    document.querySelectorAll('.filter').forEach(function (f) {
      f.setAttribute('aria-pressed', f.getAttribute('data-filter') === ui.filter ? 'true' : 'false');
    });
    document.querySelectorAll('.sort-tab').forEach(function (t) {
      t.setAttribute('aria-selected', t.getAttribute('data-sort') === ui.sort ? 'true' : 'false');
    });
    var list = $('jobs-list');
    list.innerHTML = '';
    if (ui.invite) list.appendChild(inviteBanner());
    if (S.allHired() && ui.filter !== 'wait') {
      var ban = document.createElement('div');
      ban.className = 'full-banner';
      ban.innerHTML = '<img alt="" src="assets/tutu/wave.png"><div><b>7 只秃秃都入职啦</b><span>洗牌后 7 只秃秃会重新来应聘</span></div>';
      var go = document.createElement('button');
      go.type = 'button'; go.className = 'btn small'; go.textContent = '洗牌，再招一轮';
      go.addEventListener('click', askReshuffle);
      ban.appendChild(go);
      list.appendChild(ban);
    }
    var idx = order();
    idx.forEach(function (i) { list.appendChild(talentCard(i)); });
    if (!idx.length) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = ui.filter === 'hired' ? '还没有秃秃入职，挑一只聊聊吧'
        : ui.filter === 'fav' ? '还没有感兴趣的秃秃，在简历底部点「感兴趣」' : '7 只秃秃都面试过啦';
      list.appendChild(p);
    }
  }

  // ---------- 在线简历 ----------
  function openResume(i) {
    GJ.audio.unlock();
    ui.pos = i;
    fillResume();
    $('pg-resume').querySelector('.scroll').scrollTop = 0;
    openPage('pg-resume');
    nav.push('resume', function () { closePage('pg-resume'); ui.pos = -1; });
  }

  function fillResume() {
    var i = ui.pos;
    if (i < 0) return;
    var ch = chAt(i), st = S.status(i), r = R(i), mk = masked(i);
    $('r-ava').outerHTML = avaHtml(i, 'big').replace('<span class="t-ava', '<span id="r-ava" class="t-ava');
    $('r-name').textContent = nameOf(i);
    $('r-active').innerHTML = stChip(i);
    $('r-info').textContent = mk ? '4cm · 经历保密 · 夜班-随时到岗' : '4cm · 应届 · ' + (st >= 3 ? '已到岗' : '离开盲盒-随时到岗');
    $('r-home').textContent = '现居：' + (mk ? ch.mask.home : ch.job.scene);
    $('r-role').textContent = r.role;
    $('r-start').textContent = mk ? ch.mask.start : '随时到岗';
    $('r-adv').textContent = r.adv;
    $('r-tags').innerHTML = tagsOf(i).map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    $('r-exp-t').textContent = r.exp[0];
    $('r-exp-d').textContent = r.exp[1];
    $('r-can').innerHTML = r.can.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    $('r-ask').textContent = r.ask;
    // 作品集：隐藏款面试前看不了（视频一看就知道是谁）
    var pf = $('r-pf');
    pf.disabled = mk;
    pf.classList.toggle('is-locked', mk);
    $('r-pf-img').src = 'assets/poster/' + (mk ? 'dream' : ch.id) + '.jpg';
    $('r-pf-sub').textContent = mk ? '视频 · 面试后解锁' : '视频 · 30 秒 · 点开就能看';
    pf.setAttribute('aria-label', mk ? '作品集：面试后解锁' : '播放' + ch.name + '的作品集');
    $('r-pf-ico').innerHTML = mk
      ? '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
    var fav = S.isFav(i);
    $('r-fav').setAttribute('aria-pressed', fav ? 'true' : 'false');
    $('r-fav').querySelector('span').textContent = fav ? '已感兴趣' : '感兴趣';
    $('r-chat').textContent = st === 0 ? '立即沟通' : st === 1 ? '去面试' : st === 2 ? '继续沟通' : '看入职确认';
    if (st === 1) $('r-chat').setAttribute('data-nosfx', ''); else $('r-chat').removeAttribute('data-nosfx');
  }

  function toggleFav() {
    var on = S.toggleFav(ui.pos);
    fillResume();
    renderJobs();
    renderMine();
    GJ.audio.play('pop', { gain: 0.4 });
    toast(on ? '已加入「感兴趣」，人才列表里能找到' : '已取消感兴趣');
  }

  // ---------- 和秃秃沟通 ----------
  function fillChatHead(i) {
    $('c-name').textContent = nameOf(i);
    $('c-sub').textContent = stText(i) + ' · 期望：' + R(i).role;
  }

  function openChat(i) {
    GJ.audio.unlock();
    var ch = chAt(i);
    ui.chatPos = i;
    var first = S.status(i) === 0;
    if (first) S.advance(i, 1);
    fillChatHead(i);
    openPage('pg-chat');
    nav.push('chat', closeChat);
    if (first) {
      refreshAll();
      $('chat-log').innerHTML = '';
      setReplies(i, true);
      GJ.chat.play(i, ch, GJ.chat.segStart(i, ch), function () { setReplies(i); });
    } else {
      GJ.chat.render(i, ch);
      setReplies(i);
    }
    // 先把这张卡面下载好，面试刮工牌的时候不用等
    GJ.loadImage('assets/cards/' + ch.id + '.jpg', 1).catch(function () {});
  }

  function closeChat() {
    GJ.chat.stop();
    ui.chatPos = -1;
    closePage('pg-chat');
  }

  function setReplies(i, waiting) {
    var box = $('replies');
    box.innerHTML = '';
    $('cf-label').textContent = waiting ? '秃秃正在输入…（点聊天区可跳过）' : '选一句回复秃秃';
    if (waiting) return;
    var st = S.status(i), list;
    // 第 4 项为 true：这个按钮自己有声音（打开面试会「唰」一声），不再播点击声
    if (st <= 1) list = [['开始面试', true, function () { openScratch(i); }, true], ['先看看别的', false, backToJobs]];
    else if (st === 2) list = [[C.chat.sendOffer, true, function () { sendOffer(i); }], ['看 TA 的作品集', false, function () { openPV(i); }]];
    else list = [['看入职确认', true, function () { goOffer(i); }], ['继续招人', false, backToJobs]];
    list.forEach(function (r) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'reply' + (r[1] ? ' primary' : '');
      b.textContent = r[0];
      if (r[3]) b.setAttribute('data-nosfx', '');
      b.addEventListener('click', r[2]);
      box.appendChild(b);
    });
    GJ.chat.toBottom(true);
  }

  function backToJobs() { nav.backTo(0, function () { switchTab('jobs'); $('jobs-list').scrollTop = 0; }); }

  // 聊天顶部「看 TA 的简历」：从简历进来的就退回简历；从列表直接打招呼进来的，退回列表再打开简历
  function chatToResume() {
    var i = ui.chatPos;
    if (i < 0) return;
    if (nav.has('resume') && ui.pos === i) nav.back();
    else nav.backTo(0, function () { openResume(i); });
  }

  // 老板发 Offer：秃秃接受，把见面礼（券）发过来。不自动跳页，用户点卡片或「看入职确认」才进
  function sendOffer(i) {
    var ch = chAt(i);
    if (S.status(i) >= 3) { goOffer(i); return; }
    S.advance(i, 3);
    refreshAll();
    if (ui.chatPos === i && nav.top() === 'chat') {
      setReplies(i, true);
      GJ.chat.play(i, ch, GJ.chat.segOffer(), function () { setReplies(i); duDu(); });
    }
  }

  // ---------- 面试：刮开工牌 ----------
  function sizeScratch() {
    var r = $('sc-area').getBoundingClientRect();
    if (!r.width) return;
    var w = Math.min(r.width - 48, 360, (r.height - 8) / CARD_RATIO);
    $('scratch-card').style.setProperty('--sc-w', Math.max(160, Math.floor(w)) + 'px');
  }

  function stopLuck() {
    if (ui.stopSparkles) { ui.stopSparkles(); ui.stopSparkles = null; }
  }

  function openScratch(i) {
    if (S.status(i) >= 2 || nav.top() === 'scratch') return;
    GJ.audio.unlock();
    var ch = chAt(i), ov = $('scratch-ov'), card = $('scratch-card');
    ui.scPos = i; ui.scRevealed = false; ui.scHandled = false;
    stopLuck();
    ov.classList.remove('is-luck', 'is-flash', 'is-done');
    card.classList.remove('is-revealed', 'is-ready', 'is-holo');
    $('sc-title').textContent = '面试中 · ' + nameOf(i);
    $('sc-h2').textContent = ch.hidden ? '刮开工牌，看看隐藏款到底是谁' : '刮开 TA 的工牌，就是盲盒里那张身份卡';
    $('sc-head').hidden = false;
    $('sc-foot').hidden = false;
    $('sc-done').hidden = true;
    $('sc-meter').style.transform = 'scaleX(0)';
    $('sc-pct').textContent = '已刮 0%';
    $('sc-hint').textContent = '工牌加载中……';
    $('scratch-front').removeAttribute('src');
    $('scratch-front').alt = nameOf(i) + '的工牌';
    ov.hidden = false;
    void ov.offsetWidth;
    ov.classList.add('is-in');
    nav.push('scratch', closeScratch);
    GJ.audio.play('slide', { gain: 0.7 });
    // 卡片直接到位，不要过渡，否则刮层会按过渡中的尺寸画
    card.classList.add('no-anim');
    sizeScratch();
    void card.offsetWidth;
    card.classList.remove('no-anim');

    var hint = card.querySelector('.finger-hint');
    hint.classList.remove('is-on');
    var hintTimer = setTimeout(function () { hint.classList.add('is-on'); }, 900);
    var said = false;
    if (ui.sc) ui.sc.destroy();
    var sc = ui.sc = new GJ.Scratch(card, {
      cover: 'assets/cards/back.jpg',
      front: 'assets/cards/' + ch.id + '.jpg',
      frontEl: $('scratch-front'),
      threshold: C.revealAt,
      // 工牌好了才开始下载视频，不和卡面抢网速
      onReady: function () {
        if (!said) $('sc-hint').textContent = '刮到 70% 自动翻开，刮的时候秃秃会「嘟」';
        GJ.player.prepare(ch);
      },
      onFirstTouch: function () {
        clearTimeout(hintTimer);
        hint.classList.remove('is-on');
        GJ.player.unlockFromGesture();
      },
      onProgress: function (p) {
        $('sc-meter').style.transform = 'scaleX(' + Math.min(1, p).toFixed(3) + ')';
        $('sc-pct').textContent = '已刮 ' + Math.min(100, Math.round(p * 100)) + '%';
        if (!said && p > 0.14) { said = true; $('sc-hint').textContent = '嘟？好像看到一顶帽子……'; }
      },
      onReveal: function () { clearTimeout(hintTimer); hint.classList.remove('is-on'); scratchReveal(); },
    });
    sc.ready.catch(function (err) {
      log('scratch failed ' + (err && err.message));
      if (ui.sc !== sc) return;
      toast('网络有点慢，工牌已直接翻开');
      $('scratch-front').src = 'assets/cards/' + ch.id + '.jpg';
      sc.reveal(false);
    });
    syncInert();
    setTimeout(function () { $('sc-close').focus({ preventScroll: true }); }, 60);
  }

  function scratchReveal() {
    var i = ui.scPos, ch = chAt(i), ov = $('scratch-ov'), card = $('scratch-card');
    log('reveal ' + ch.id);
    ui.scRevealed = true;
    S.advance(i, 2);
    refreshAll();
    card.classList.add('is-revealed');
    if (ch.hidden) luckReveal();
    else { GJ.audio.play('sparkle', { gain: 0.8 }); GJ.audio.buzz(30, 0); }
    $('sc-title').textContent = '面试中 · ' + ch.name;
    $('sc-name').textContent = ch.hidden ? '隐藏款揭晓：「' + ch.name + '」！' : '工牌验过了：「' + ch.name + '」';
    $('sc-fortune').textContent = ch.fortune;
    $('sc-head').hidden = true;
    $('sc-foot').hidden = true;
    $('sc-done').hidden = false;
    ov.classList.add('is-done');
    requestAnimationFrame(sizeScratch);
    setTimeout(function () { $('sc-take').focus({ preventScroll: true }); }, 400);
  }

  // 隐藏款：一道闪光、满屏星星炸开、卡面炫彩流光、周围一直飘闪粉
  function luckReveal() {
    var ov = $('scratch-ov'), card = $('scratch-card');
    ov.classList.add('is-luck', 'is-flash');
    card.classList.add('is-holo');
    GJ.audio.thump({ freq: 70, gain: 0.8, dur: 0.25 });
    GJ.audio.play('shimmer', { gain: 0.9 });
    GJ.audio.play('sparkle', { gain: 1 });
    GJ.audio.buzz([40, 60, 40, 60, 120], 0);
    setTimeout(function () {
      var sr = ov.getBoundingClientRect(), cr = card.getBoundingClientRect();
      GJ.fx.starBurst(ov, { x: cr.left - sr.left + cr.width / 2, y: cr.top - sr.top + cr.height * 0.45, count: 110 });
    }, 140);
    setTimeout(function () { ov.classList.remove('is-flash'); }, 900);
    ui.stopSparkles = GJ.fx.sparkles($('sc-area'));
  }

  // 关掉面试层（从历史记录里退出时调用）。刮开了的话，回到聊天后秃秃接着说
  function closeScratch() {
    var ov = $('scratch-ov'), i = ui.scPos;
    ov.classList.remove('is-in');
    setTimeout(function () { if (!ov.classList.contains('is-in')) ov.hidden = true; }, 260);
    stopLuck();
    if (ui.sc && !ui.scRevealed) ui.sc.destroy();
    ui.sc = null;
    if (ui.scRevealed && !ui.scHandled) {
      ui.scHandled = true;
      setTimeout(function () { afterReveal(i); }, 280);
    }
  }

  function afterReveal(i) {
    var ch = chAt(i);
    if (ui.chatPos !== i || nav.top() !== 'chat') return;
    fillChatHead(i);
    // 重画开头那段（面试邀请卡变成「面试已完成」，隐藏款的头像换成真身），再一条条放面试后的消息
    GJ.chat.render(i, ch, 1);
    setReplies(i, true);
    GJ.chat.play(i, ch, GJ.chat.segReveal(i, ch), function () { setReplies(i); });
  }

  // ---------- 作品集（PV） ----------
  function stripText() { return C.coupon.name + ' ¥' + C.coupon.amount + ' · ' + C.coupon.threshold; }

  function openPV(i) {
    var ch = chAt(i);
    if (masked(i)) return;
    GJ.audio.unlock();
    // 点券条：关掉播放器、进领券页；看完或返回：回到原来的页面
    var done = function (then) { return function () { nav.dismissed('player', then); }; };
    nav.push('player', function () { GJ.player.close(); });
    GJ.player.open(ch, {
      strip: stripText(),
      onBack: done(null),
      onSkip: done(openCoupon),
      onEnded: done(null),
    });
    syncInert();
  }

  // ---------- 入职确认（领券） ----------
  // 秃秃接受 Offer：用户提供的秃秃原声（source/拿到offer.mp3），原声偏响，音量压低一点
  function duDu() {
    GJ.audio.play('offer', { gain: 0.75 });
  }

  function goOffer(i) {
    if (S.status(i) < 3) S.advance(i, 3);
    if (nav.top() === 'offer' && ui.offerPos === i) return;
    ui.offerPos = i;
    fillOffer(i);
    $('pg-offer').querySelector('.scroll').scrollTop = 0;
    openPage('pg-offer');
    nav.push('offer', function () { closePage('pg-offer'); });
    duDu();
    refreshAll();
  }

  function fillTicket(prefix) {
    var cp = C.coupon;
    $(prefix + '-amount').textContent = cp.amount;
    $(prefix + '-threshold').textContent = cp.threshold;
    $(prefix + '-name').textContent = cp.name;
    $(prefix + '-store').textContent = cp.store;
    $(prefix + '-validity').textContent = cp.validity;
    var price = $(prefix + '-price');
    if (typeof C.price === 'number' && C.price > 0) {
      price.textContent = '单盒 ¥' + C.price + '，用券后 ¥' + Math.max(0, C.price - cp.amount);
      price.hidden = false;
    } else price.hidden = true;
  }

  function fillOffer(i) {
    var ch = chAt(i);
    $('letter').classList.toggle('is-special', !!ch.hidden);
    $('o-fig').src = 'assets/figures/' + ch.id + '.png';
    $('o-fig').alt = ch.name + '实物照';
    $('o-role').textContent = ch.name;
    $('o-job').textContent = C.job.title;
    $('o-perk').textContent = C.job.perk;
    $('o-gift').textContent = ch.job.gift;
    $('o-seal-2').textContent = ch.hidden ? '特别入职' : '已入职';
    $('o-seal').setAttribute('aria-label', ch.hidden ? '菇的JOB! 特别入职 印章' : '菇的JOB! 已入职 印章');
    fillTicket('o');
  }

  // ---------- 领券页：任何页面一点就到，不用先玩 ----------
  function openCoupon() {
    if (nav.top() === 'coupon') return;
    GJ.audio.unlock();
    fillTicket('cp');
    $('pg-coupon').querySelector('.scroll').scrollTop = 0;
    openPage('pg-coupon');
    nav.push('coupon', function () { closePage('pg-coupon'); });
  }

  // ---------- 开场主题视频 ----------
  function showIntro(first) {
    if (!first) nav.push('intro', function () { GJ.intro.close(); });
    GJ.intro.show({
      onClose: function (kind) {
        S.markIntroSeen();
        var then = kind === 'coupon' ? openCoupon : null;
        if (first) { syncInert(); setTimeout(syncInert, 300); if (then) then(); }
        else nav.dismissed('intro', then);
      },
    });
    syncInert();
  }

  // ---------- 晒晒我招到的秃秃（拉新） ----------
  var shareData = { url: null, file: null };
  function nativeBridge() {
    // App 如果提供了原生分享（微信好友 / 朋友圈），在这里接：window.SowiiBridge.share({ title, text, url, image })
    return window.SowiiBridge && typeof window.SowiiBridge.share === 'function' ? window.SowiiBridge : null;
  }

  function openShare() {
    var i = ui.offerPos, ch = chAt(i);
    if (i < 0) return;
    openSheet('share');
    var wrap = $('poster-wrap'), img = $('poster-img');
    var old = wrap.querySelector('canvas');
    if (old) old.remove();
    img.hidden = true; img.removeAttribute('src');
    $('poster-loading').hidden = false;
    $('poster-loading').querySelector('span').textContent = '海报生成中';
    $('poster-tip').textContent = '长按图片可以保存，或直接发给朋友';
    $('s-save').disabled = true;
    $('s-more').hidden = !(navigator.share || nativeBridge());
    shareData = { url: null, file: null, ch: ch };
    GJ.share.poster(ch).then(function (res) {
      if (shareData.ch !== ch) return;
      $('poster-loading').hidden = true;
      if (res.dataURL) {
        img.src = res.dataURL;
        img.alt = ch.name + '的入职海报';
        img.hidden = false;
        shareData.url = res.dataURL;
        $('s-save').disabled = false;
      } else {
        // 本地文件打开时浏览器不让导出图片：直接显示画好的海报
        res.canvas.className = 'poster-img';
        res.canvas.setAttribute('role', 'img');
        res.canvas.setAttribute('aria-label', ch.name + '的入职海报');
        wrap.appendChild(res.canvas);
        $('poster-tip').textContent = '海报已生成；这个环境不能导出图片，可以先复制链接';
      }
    }, function () {
      $('poster-loading').querySelector('span').textContent = '海报没生成出来，可以先复制链接';
    });
  }

  function savePoster() {
    if (!shareData.url) return;
    var name = '菇的JOB-入职海报-' + shareData.ch.name + '.jpg';
    var file = null;
    try { file = GJ.share.dataURLtoFile(shareData.url, name); } catch (e) { file = null; }
    // 手机上优先走系统分享面板，里面有「存储图像」，能直接存到相册
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: C.share.title }).catch(function () {});
      return;
    }
    var a = document.createElement('a');
    a.href = shareData.url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    toast('海报已开始下载；没反应的话，长按图片保存');
  }

  function copyShare() {
    var ch = shareData.ch || chAt(ui.offerPos);
    copyText(GJ.share.text(ch) + ' ' + GJ.share.link(ch), '链接和文案已复制，去发给朋友吧');
  }

  function moreShare() {
    var ch = shareData.ch || chAt(ui.offerPos);
    var payload = { title: C.share.title, text: GJ.share.text(ch), url: GJ.share.link(ch) };
    var bridge = nativeBridge();
    if (bridge) { payload.image = shareData.url; bridge.share(payload); return; }
    if (navigator.share) navigator.share(payload).catch(function () {});
  }

  // 朋友通过分享链接打开：?from=offer&r=角色 id
  function readInvite() {
    var m = /[?&]r=([a-z]+)/.exec(location.search);
    if (m && CHAR[m[1]] && /[?&]from=offer/.test(location.search)) ui.invite = m[1];
  }

  function inviteBanner() {
    var ch = CHAR[ui.invite];
    var ban = document.createElement('div');
    ban.className = 'invite-banner';
    ban.setAttribute('role', 'note');
    ban.innerHTML = '<img alt="" src="assets/figures/' + ch.id + '.png">' +
      '<div><b>朋友刚招到「' + esc(ch.name) + '」当' + esc(C.job.title) + '</b><span>你也来招一只秃秃，见面礼同款 ¥' + C.coupon.amount + '</span></div>';
    var x = document.createElement('button');
    x.type = 'button'; x.className = 'icon-btn ghost'; x.setAttribute('aria-label', '关闭提示');
    x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    x.addEventListener('click', function () { ui.invite = null; renderJobs(); });
    ban.appendChild(x);
    return ban;
  }

  // ---------- 跳转 ----------
  var jumpTimers = [];
  function clearJump() { jumpTimers.forEach(clearTimeout); jumpTimers = []; }
  function hideJump() { clearJump(); $('jump').hidden = true; syncInert(); }

  function jump(channel) {
    var url = C.links[channel];
    if (!url) { toast('链接还没配置'); return; }
    // 跳转页上的秃秃：在入职确认页点的就是这只；在领券页点的，用最近入职的那只，还没招到就用秃秃
    var pos = nav.top() === 'offer' ? ui.offerPos : latestHired();
    var ch = pos >= 0 ? chAt(pos) : null;
    ui.jumped = true;
    clearJump();
    $('jump-fig').src = ch ? 'assets/figures/' + ch.id + '.png' : 'assets/tutu/wave.png';
    $('jump-sub').textContent = (ch ? ch.name : '秃秃') + '在' + CHANNEL[channel] + '门口等你';
    $('jump-app').textContent = CHANNEL[channel];
    $('jump-url').textContent = url;
    $('jump-fallback').hidden = true;
    var j = $('jump');
    j.hidden = false;
    j.setAttribute('data-channel', channel);
    j.querySelector('.jump-bar').hidden = false;
    var bar = j.querySelector('.jump-bar i');
    bar.style.animation = 'none'; void bar.offsetWidth; bar.style.animation = '';
    syncInert();
    // 领券确认：和刮工牌同一段秃秃原声（source/刮刮乐.mp3），原速不变调
    GJ.audio.play('du', { gain: 0.9 });
    GJ.audio.buzz(20, 0);
    jumpTimers.push(setTimeout(function () { window.location.href = url; }, 1000));
    // 3 秒后页面还在，说明没有唤起 App，给兜底
    jumpTimers.push(setTimeout(function () {
      if (document.hidden) return;
      j.querySelector('.jump-bar').hidden = true;
      $('jump-fallback').hidden = false;
    }, 3200));
  }

  function copyText(text, okText) {
    okText = okText || '链接已复制';
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? okText : '请长按链接手动复制');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okText); }, fallback);
    } else fallback();
  }

  // ---------- 消息 ----------
  function renderMsgs() {
    var list = $('msgs-list'), rows = [];
    for (var i = 0; i < S.size; i++) if (S.status(i) >= 1) rows.push(i);
    rows.sort(function (a, b) { return S.startedAt(b) - S.startedAt(a); });
    list.innerHTML = '';
    if (!rows.length) {
      var empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<img alt="" src="assets/tutu/wave.png"><p>还没有和秃秃聊过</p>';
      var go = document.createElement('button');
      go.type = 'button'; go.className = 'btn small'; go.textContent = '去看看人才';
      go.addEventListener('click', function () { switchTab('jobs'); });
      empty.appendChild(go);
      list.appendChild(empty);
      return;
    }
    rows.forEach(function (i) {
      var st = S.status(i);
      var preview = st === 1 ? '[面试邀请] TA 已接受，等你开始面试' : st === 2 ? '[作品集] 我的工作日常' : '[Offer] 已接受，见面礼给你了';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'msg-row';
      b.innerHTML = avaHtml(i, 'mid') +
        '<span class="msg-main"><span class="msg-top"><b>' + esc(nameOf(i)) + '</b><span class="muted">期望：' + esc(R(i).role) + '</span>' +
        '<span class="fill"></span><span class="muted">' + clock(S.startedAt(i)) + '</span></span>' +
        '<span class="msg-prev"><span>' + esc(preview) + '</span>' + (st === 1 ? '<span class="st-wait">待面试</span>' : '') + '</span></span>';
      b.addEventListener('click', function () { openChat(i); });
      list.appendChild(b);
    });
  }

  function updateBadge() {
    var n = S.waiting(), badge = $('msgs-badge');
    badge.hidden = !n;
    badge.textContent = n;
    $('tab-btn-msgs').setAttribute('aria-label', n ? '消息，' + n + ' 个面试等你开始' : '消息');
  }

  // ---------- 我的（老板档案） ----------
  function renderMine() {
    var hired = S.hired();
    $('m-sub').textContent = C.job.place + ' · 正在招：' + C.job.title;
    $('m-hired').textContent = hired + '/' + S.size;
    $('m-wait').textContent = S.toInterview();
    $('m-fav').textContent = S.favCount();
    var grid = $('offer-grid');
    grid.innerHTML = '';
    C.characters.forEach(function (c) {
      var pos = S.posOf(c.id), got = S.status(pos) >= 3, el;
      if (got) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'og-item is-got' + (c.hidden ? ' is-holo' : '');
        el.setAttribute('aria-label', '查看' + c.name + '的入职确认');
        el.innerHTML = '<span class="og-fig"><img alt="" src="assets/figures/' + c.id + '.png"></span><span class="og-name">' + esc(c.name) + '</span>';
        el.addEventListener('click', function () { goOffer(pos); });
      } else if (masked(pos)) {
        el = document.createElement('div');
        el.className = 'og-item is-locked is-hidden';
        el.innerHTML = '<span class="og-fig"><b aria-hidden="true">?</b></span><span class="og-name">隐藏款</span>';
      } else {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'og-item is-locked';
        el.setAttribute('aria-label', c.name + '，还没入职，看简历');
        el.innerHTML = '<span class="og-fig"><img alt="" src="assets/figures/' + c.id + '.png"></span><span class="og-name">' + esc(c.name) + '</span>';
        el.addEventListener('click', function () { openResume(pos); });
      }
      grid.appendChild(el);
    });
    var all = S.allHired();
    $('btn-reshuffle').disabled = !all;
    $('reshuffle-tip').textContent = all ? '7 只都入职啦，可以洗牌了' : '7 只都入职后可以重新洗牌';
  }

  // 洗牌会清空「我招到的秃秃」和聊天记录，先确认一次
  function askReshuffle() { if (S.allHired()) openSheet('reshuffle'); }

  function reshuffle() {
    if (!S.allHired()) return;
    S.reshuffle();
    ui.filter = 'all'; ui.sort = 'rec';
    GJ.audio.play('slide', { gain: 0.9 });
    switchTab('jobs');
    refreshAll();
    $('jobs-list').scrollTop = 0;
    toast('洗好啦，7 只秃秃重新来应聘了');
    setTimeout(preloadCards, 600);
  }

  // ---------- 标签与刷新 ----------
  function switchTab(name) {
    ui.tab = name;
    ['jobs', 'msgs', 'mine'].forEach(function (t) { $('tab-' + t).hidden = t !== name; });
    document.querySelectorAll('.tab').forEach(function (b) {
      if (b.getAttribute('data-tab') === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
  }

  function refreshAll() {
    renderJobs();
    renderMsgs();
    renderMine();
    updateBadge();
    if (nav.has('resume') && ui.pos >= 0) fillResume();
    if (ui.chatPos >= 0) fillChatHead(ui.chatPos);
  }

  // ---------- 弹层 ----------
  function ruleItems() {
    var cp = C.coupon;
    return [
      cp.name + '：立减 ¥' + cp.amount + '，' + cp.threshold + '，' + cp.validity + '。',
      '适用店铺：' + cp.store + '（抖音、天猫）。',
      '领券不用先玩；不管招到哪只秃秃，见面礼都是同一张券，多招不叠加。',
      '7 只秃秃每一轮各来应聘一次；面试刮工牌只是页面小游戏，和实体盲盒的款式概率无关，实体盲盒概率以销售页公示为准。',
      '页面有音效和视频声音，可以点右上角或在「我的」里关掉。',
    ];
  }
  function renderRules() {
    ['rules', 'cp-rules'].forEach(function (id) {
      var list = $(id);
      list.innerHTML = '';
      ruleItems().forEach(function (t) { var li = document.createElement('li'); li.textContent = t; list.appendChild(li); });
    });
  }

  function showSheet(name) {
    var el = $('sheet-' + name), scrim = $('scrim');
    hideSheets(true);
    scrim.hidden = false; el.hidden = false;
    openSheetEl = el;
    syncInert();
    requestAnimationFrame(function () { scrim.classList.add('is-on'); el.classList.add('is-on'); });
    var focusable = el.querySelector('button');
    if (focusable) setTimeout(function () { focusable.focus({ preventScroll: true }); }, 60);
  }
  function hideSheets(instant) {
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
    ui.leaveOpen = false;
    syncInert();
  }
  function openSheet(name) {
    showSheet(name);
    nav.push('sheet', function () { hideSheets(false); });
  }
  function closeSheet() {
    if (ui.leaveOpen) { hideSheets(false); return; }
    if (nav.top() === 'sheet') nav.back(); else hideSheets(false);
  }

  // 在最外层按返回、要离开页面时：还没点过领券，提醒一次（领券不用先玩，所以不管玩没玩都提醒）
  function onExit() {
    if (ui.leaveOpen) { hideSheets(true); history.back(); return; }
    if (C.leaveReminder && !S.leaveShown() && !ui.jumped) {
      S.markLeaveShown();
      try { history.pushState({ gjd: 0 }, ''); } catch (e) { /* 忽略 */ }
      var pos = latestHired();
      $('l-title').textContent = C.coupon.name + '还没领';
      $('leave-fig').src = pos >= 0 ? 'assets/figures/' + chAt(pos).id + '.png' : 'assets/tutu/wave.png';
      $('leave-stay').onclick = function () { hideSheets(false); openCoupon(); };
      showSheet('leave');
      ui.leaveOpen = true;
      return;
    }
    history.back();
  }

  // ---------- 绑定 ----------
  function bind() {
    // 第一次点屏幕：解锁声音、在历史里垫一步
    ['pointerdown', 'keydown', 'click'].forEach(function (type) {
      document.addEventListener(type, function () { nav.arm(); GJ.audio.unlock(); }, true);
    });
    // 点按钮、人才卡、消息时轻轻「啵」一声。自己有专属声音的（领券、面试）标了 data-nosfx，不重复播
    document.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('button, .job, .msg-row');
      if (!el || el.disabled || el.closest('[data-nosfx]') || el.closest('#player') || el.closest('#intro')) return;
      GJ.audio.play('tap', { gain: 0.5, rate: 0.95 + Math.random() * 0.1 });
    }, true);

    $('btn-home').addEventListener('click', function () {
      if (ui.tab !== 'jobs') switchTab('jobs');
      var l = $('jobs-list');
      try { l.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { l.scrollTop = 0; }
    });
    $('btn-mute').addEventListener('click', function () { setMuted(!GJ.audio.isMuted()); });
    $('sw-sound').addEventListener('click', function () { setMuted(!GJ.audio.isMuted()); });

    document.querySelectorAll('.sort-tab').forEach(function (t) {
      t.addEventListener('click', function () { ui.sort = t.getAttribute('data-sort'); renderJobs(); $('jobs-list').scrollTop = 0; });
    });
    document.querySelectorAll('.filter').forEach(function (f) {
      f.addEventListener('click', function () { ui.filter = f.getAttribute('data-filter'); renderJobs(); $('jobs-list').scrollTop = 0; });
    });
    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
    });

    document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', function () { nav.back(); }); });
    // 所有「领券」入口：一级页面的券条、二级页面右上角、面试页右上角
    document.querySelectorAll('[data-coupon]').forEach(function (b) { b.addEventListener('click', openCoupon); });
    $('r-fav').addEventListener('click', toggleFav);
    $('r-chat').addEventListener('click', function () {
      var i = ui.pos;
      if (S.status(i) >= 3) goOffer(i); else openChat(i);
    });
    $('r-pf').addEventListener('click', function () { if (ui.pos >= 0) openPV(ui.pos); });
    $('c-resume').addEventListener('click', chatToResume);

    $('sc-close').addEventListener('click', function () { nav.back(); });
    $('sc-take').addEventListener('click', function () { nav.back(); });
    $('sc-flip').addEventListener('click', function () {
      GJ.player.unlockFromGesture();
      // 卡片还没加载完时，等加载好再翻开，不会翻出空白
      var sc = ui.sc;
      if (sc) sc.ready.then(function () { sc.reveal(true); }, function () {});
    });

    $('o-share').addEventListener('click', openShare);
    $('o-share2').addEventListener('click', openShare);
    $('s-save').addEventListener('click', savePoster);
    $('s-copy').addEventListener('click', copyShare);
    $('s-more').addEventListener('click', moreShare);
    $('o-pv').addEventListener('click', function () { openPV(ui.offerPos); });
    $('o-more').addEventListener('click', backToJobs);
    $('cp-play').addEventListener('click', backToJobs);
    document.querySelectorAll('[data-channel]').forEach(function (b) {
      if (b.closest('.jump')) return;
      b.addEventListener('click', function () { jump(b.getAttribute('data-channel')); });
    });
    $('jump-copy').addEventListener('click', function () { copyText($('jump-url').textContent); });
    $('jump-retry').addEventListener('click', function () {
      var ch = $('jump').getAttribute('data-channel');
      if (ch) jump(ch);
    });
    $('jump-close').addEventListener('click', hideJump);

    $('btn-intro').addEventListener('click', function () { showIntro(false); });
    $('btn-reshuffle').addEventListener('click', askReshuffle);
    $('rs-go').addEventListener('click', function () { nav.back(reshuffle); });
    // 「我的」里的三个数字：点进人才列表对应的筛选
    document.querySelectorAll('.stat').forEach(function (b) {
      b.addEventListener('click', function () {
        ui.filter = b.getAttribute('data-goto');
        switchTab('jobs');
        renderJobs();
        $('jobs-list').scrollTop = 0;
      });
    });
    document.querySelectorAll('[data-open]').forEach(function (b) {
      b.addEventListener('click', function () { openSheet(b.getAttribute('data-open')); });
    });
    document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closeSheet); });
    $('scrim').addEventListener('click', closeSheet);
    $('leave-go').addEventListener('click', function () { hideSheets(true); history.back(); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (openSheetEl) closeSheet();
      else if (!$('jump').hidden) hideJump();
      else if (nav.depth()) nav.back();
    });

    // 从抖音 / 天猫返回时，页面可能从缓存恢复，收起跳转层
    window.addEventListener('pageshow', function (e) { if (e.persisted) hideJump(); });

    // 防止整页被拖动、双指缩放、双击放大；可滚动的区域照常滚
    document.addEventListener('touchmove', function (e) {
      if (!e.target.closest || !e.target.closest('.scroll, .sheet')) e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
    document.addEventListener('dblclick', function (e) { e.preventDefault(); }, { passive: false });

    var rz = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rz);
      rz = setTimeout(function () { if (!$('scratch-ov').hidden) sizeScratch(); }, 60);
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

  // 首屏稳定后，在后台一张一张地把还没面试的卡面先下载好（7 张约 1MB）。
  // 省流量模式或 2G 网络下只预载卡背，不预载卡面：进聊天时会再单独预载那一张，刮的时候也会等它加载完
  function preloadCards() {
    var c = navigator.connection || {};
    var slow = !!c.saveData || /(^|-)2g$/.test(c.effectiveType || '');
    var queue = ['assets/cards/back.jpg'];
    if (!slow) for (var i = 0; i < S.size; i++) if (S.status(i) < 2) queue.push('assets/cards/' + S.idAt(i) + '.jpg');
    (function next() {
      var src = queue.shift();
      if (!src) return;
      GJ.loadImage(src, 1).then(next, next);
    })();
  }

  // 券条、岗位名这些固定文案从 config 读，改配置就行
  function fillStatic() {
    var cp = C.coupon;
    $('post-title').textContent = C.job.title;
    $('post-perk').textContent = C.job.perk + ' · ' + C.job.place;
    $('c-job').textContent = C.job.title;
    $('c-perk').textContent = ' · ' + C.job.perk;
    $('cb-name').textContent = cp.name + ' ¥' + cp.amount;
    $('cb-sub').textContent = ' · ' + cp.threshold;
    $('coupon-bar').setAttribute('aria-label', '领券：' + cp.name + ' ' + cp.amount + ' 元，' + cp.threshold);
    $('cp-h').textContent = cp.name;
    $('pv-strip-text').textContent = stripText();
  }

  function init() {
    GJ.player.init();
    GJ.intro.init();
    GJ.chat.init({
      onCard: openScratch,
      onVideo: function (i) { openPV(i); },
      onOffer: goOffer,
    });
    setMuted(S.muted());
    readInvite();
    fillStatic();
    renderRules();
    makeBurst();
    bind();
    switchTab('jobs');
    refreshAll();
    // 第一次进来先看开场主题视频（看过就直接进人才主页）
    if (C.intro && C.intro.enabled !== false && !S.introSeen()) showIntro(true);
    syncInert();
    setTimeout(preloadCards, 1200);
  }

  GJ.app = { setMuted: setMuted };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
