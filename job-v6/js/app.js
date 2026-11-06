/*
 * 版本线 2：招聘 App 版的页面流程。
 * 职位列表 → 职位详情 → 和秃秃 HR 沟通 → 刮工牌 → 揭晓（运势、工作日常视频）→ 录用通知书（领券）→ 跳转抖音 / 天猫。
 * 底部三个标签：职位 / 消息 / 我的。所有二级页面都进浏览器历史，手机返回键和侧滑返回都能用。
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
  var LAYERS = ['root', 'pg-detail', 'pg-chat', 'pg-offer', 'scratch-ov', 'player', 'jump'];
  var openSheetEl = null;
  // 判断一层是不是「打开着」。关闭动画还在播的那一层不算——
  // 之前播放器淡出的 0.26 秒里还算打开，结果把下面的聊天页一直锁成不可点（看完视频按返回后点不动）
  function layerOpen(id) {
    var el = $(id);
    if (id === 'root') return true;
    if (id === 'player') return GJ.player.isOpen();
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
    GJ.bgm.setMuted(m);
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
  function jobTitle(i) { return S.status(i) >= 2 ? chAt(i).name + '的主人' : '秃秃的主人'; }
  function latestHired() {
    var best = -1;
    for (var i = 0; i < S.size; i++) {
      if (S.status(i) >= 2 && (best < 0 || S.startedAt(i) > S.startedAt(best))) best = i;
    }
    return best;
  }

  // ---------- 职位列表 ----------
  function order() {
    var idx = [];
    for (var i = 0; i < S.size; i++) idx.push(i);
    if (ui.sort === 'near') idx.sort(function (a, b) { return chAt(a).job.dist - chAt(b).job.dist; });
    else if (ui.sort === 'new') idx.reverse();
    else idx.sort(function (a, b) { return (S.status(a) >= 2) - (S.status(b) >= 2) || a - b; });
    return idx.filter(function (i) {
      if (ui.filter === 'wait') return S.status(i) < 2;
      if (ui.filter === 'hired') return S.status(i) >= 2;
      if (ui.filter === 'fav') return S.isFav(i);
      return true;
    });
  }
  // 公司头像：还没录用时是 Sowii 标志；刮开录用后换成这个岗位对应的角色卡
  function coLogo(i) { return S.status(i) >= 2 ? 'assets/cards/' + S.idAt(i) + '.jpg' : 'assets/brand/sowii.jpg'; }

  function hotPos() { for (var i = 0; i < S.size; i++) if (!S.status(i)) return i; return -1; }

  function jobCard(i, hot) {
    var ch = chAt(i), st = S.status(i), hired = st >= 2, job = ch.job;
    // 整张卡片由一层透明按钮负责「进详情」。首页只做信息展示：公司那一行不单独响应，点到也是进详情
    var b = document.createElement('div');
    b.className = 'job' + (hired ? ' is-hired' : '');
    var right = hired ? '<span class="tag-dark">已录用</span>' : '<span class="salary">' + esc(job.salary) + '</span>';
    var state = st === 0 ? '<span class="active"><i></i>刚刚活跃</span>'
      : st === 1 ? '<span class="st-wait">工牌待刮开</span>' : '<span class="muted">已沟通</span>';
    // 每个岗位自己的工作地点和距离（「附近」就是按这个距离排的）；隐藏款刮开后才显示真实场景
    var loc = esc(hired ? job.scene : job.place) + ' · ' + fmtDist(job.dist);
    var label = jobTitle(i) + '，' + (hired ? '已录用' : job.salary) + '，' + (hired ? job.scene : job.place);
    b.innerHTML =
      '<button type="button" class="job-hit" aria-label="' + esc(label) + '"></button>' +
      '<span class="job-r1"><span class="job-title">' + esc(jobTitle(i)) + '</span>' +
        (hot ? '<span class="tag-hot">急招</span>' : '') + '<span class="fill"></span>' + right + '</span>' +
      '<span class="job-r2"><img alt="" src="' + coLogo(i) + '">菇的JOB! 4cm 科技 · 潮玩</span>' +
      '<span class="tags">' + job.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</span>' +
      '<span class="job-r4"><span class="ava sm"><img alt="" src="assets/tutu/front.png"></span>' +
        '<span class="hr-n">秃秃 · HR</span>' + state + '<span class="fill"></span><span class="muted">' + loc + '</span></span>';
    b.querySelector('.job-hit').addEventListener('click', function () { openDetail(i); });
    return b;
  }

  // 秃秃 HR 档案（品牌手册「小蘑菇秃秃」改写），点职位详情的 HR 名片、聊天头部或聊天里的头像时弹出
  function openHr() {
    openSheet('hr');
    $('sheet-hr').scrollTop = 0;
  }

  // 公司介绍卡片（Sowii 品牌手册「我们是谁」），只在职位详情里点公司卡时从底部弹出，不跳页面
  function openCompany() {
    openSheet('company');
    var body = $('sheet-company');
    body.scrollTop = 0;
  }

  function renderJobs() {
    var hired = S.hired();
    $('f-all').textContent = S.size;
    $('f-wait').textContent = S.size - hired;
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
      ban.innerHTML = '<img alt="" src="assets/tutu/wave.png"><div><b>7 个岗位都招满啦</b><span>洗牌后会重新发布 7 个岗位</span></div>';
      var go = document.createElement('button');
      go.type = 'button'; go.className = 'btn small'; go.textContent = '洗牌，再招一轮';
      go.addEventListener('click', askReshuffle);
      ban.appendChild(go);
      list.appendChild(ban);
    }
    var idx = order(), hot = hotPos();
    idx.forEach(function (i) { list.appendChild(jobCard(i, i === hot)); });
    if (!idx.length) {
      var p = document.createElement('p');
      p.className = 'empty';
      p.textContent = ui.filter === 'hired' ? '还没有录用的岗位，挑一个聊聊吧'
        : ui.filter === 'fav' ? '还没有收藏的岗位，在职位详情右上角点星星收藏' : '岗位都录用啦';
      list.appendChild(p);
    }
  }

  // ---------- 职位详情 ----------
  function openDetail(i) {
    GJ.audio.unlock();
    ui.pos = i;
    fillDetail();
    $('pg-detail').querySelector('.scroll').scrollTop = 0;
    openPage('pg-detail');
    nav.push('detail', function () { closePage('pg-detail'); });
  }

  function fillDetail() {
    var i = ui.pos, ch = chAt(i), st = S.status(i), job = ch.job;
    $('d-title').textContent = jobTitle(i);
    $('d-salary').textContent = job.salary;
    $('d-quote').textContent = st === 0 ? '人，这个还没有被认领，要聊聊么？'
      : st === 1 ? '人，工牌已经发你了，刮开就知道是谁' : '人，TA 已经是你的啦，回去看看 TA？';
    $('d-tags').innerHTML = job.tags.map(function (t) { return '<span class="tag">' + esc(t) + '</span>'; }).join('');
    $('d-duties').innerHTML = job.duties.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    $('d-reqs').innerHTML = job.reqs.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    $('d-intro').textContent = job.intro || '';
    $('d-scene').textContent = st >= 2 ? job.scene : job.place;
    $('d-co-img').src = coLogo(i);
    var fav = S.isFav(i);
    ['d-fav', 'd-fav2'].forEach(function (id) { $(id).setAttribute('aria-pressed', fav ? 'true' : 'false'); });
    $('d-fav').setAttribute('aria-label', fav ? '取消收藏' : '收藏这个岗位');
    $('d-fav2').querySelector('span').textContent = fav ? '已收藏' : '收藏';
    $('d-chat').textContent = st === 0 ? '立即沟通' : st === 1 ? '继续沟通' : '回到聊天';
  }

  function toggleFav() {
    var on = S.toggleFav(ui.pos);
    fillDetail();
    renderMine();
    GJ.audio.play('pop', { gain: 0.4 });
    toast(on ? '已收藏，职位列表的「收藏」里能找到' : '已取消收藏');
  }

  function share() {
    var url = location.href.split('#')[0];
    if (navigator.share) {
      navigator.share({ title: '菇的JOB! 招主人', text: '有只秃秃在招主人，来看看是谁', url: url }).catch(function () {});
      return;
    }
    copyText(url, '链接已复制，发给朋友吧');
  }

  // ---------- 和秃秃 HR 沟通 ----------
  function fillChatHead(i) {
    var st = S.status(i);
    $('c-job-title').textContent = jobTitle(i);
    $('c-job-salary').textContent = chAt(i).job.salary;
    $('c-job-salary').hidden = st >= 2;
    $('c-job-tag').hidden = st < 2;
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
    // 先把这张卡面下载好，刮的时候不用等
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
    // 第 4 项为 true：这个按钮自己有声音（打开刮工牌会「唰」一声），不再播点击声
    if (st <= 1) list = [['刮开工牌', true, function () { openScratch(i); }, true], ['换个岗位看看', false, backToJobs]];
    else if (st === 2) list = [['看 TA 的工作日常', true, function () { openPV(i, false); }], [C.chat.want, false, function () { requestOffer(i, false); }]];
    else list = [['查看 Offer', true, function () { goOffer(i); }], ['换个岗位看看', false, backToJobs]];
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

  // 让秃秃 HR 发 Offer。open=true 只用于用户明确点了「看 Offer」（PV 里的券条）：发完直接进录用通知书；
  // 其他情况（点「我想接 TA 回家」、PV 自然播完）只把 Offer 卡片发到聊天里，要用户自己点卡片才进
  function requestOffer(i, open) {
    var ch = chAt(i);
    if (S.status(i) >= 3) { if (open) goOffer(i); return; }
    S.advance(i, 3);
    refreshAll();
    if (ui.chatPos === i && nav.top() === 'chat') {
      setReplies(i, true);
      GJ.chat.play(i, ch, GJ.chat.segOffer(), function () {
        setReplies(i);
        if (open) setTimeout(function () { if (ui.chatPos === i && nav.top() === 'chat') goOffer(i); }, 450);
      });
    } else if (open) goOffer(i);
  }

  // ---------- 刮工牌 ----------
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
    $('sc-foot').hidden = false;
    $('sc-done').hidden = true;
    $('sc-meter').style.transform = 'scaleX(0)';
    $('sc-pct').textContent = '已刮 0%';
    $('sc-hint').textContent = '工牌加载中……';
    $('scratch-front').removeAttribute('src');
    $('scratch-front').alt = ch.name + '的工牌';
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
    $('sc-name').textContent = ch.hidden ? '隐藏岗位：' + ch.name + '！' : '是「' + ch.name + '」！';
    $('sc-fortune').textContent = ch.fortune;
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

  // 关掉刮工牌层（从历史记录里退出时调用）。刮开了的话，回到聊天后 HR 接着说
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
    GJ.chat.refreshCard(i, ch);
    setReplies(i, true);
    GJ.chat.play(i, ch, GJ.chat.segReveal(i, ch), function () { setReplies(i); });
  }

  // ---------- 工作日常（PV） ----------
  function stripText() { return '入职福利：' + C.coupon.name + ' ¥' + C.coupon.amount; }

  function openPV(i, fromOffer) {
    var ch = chAt(i);
    GJ.audio.unlock();
    // 点券条「看 Offer」：发完直接进录用通知书；PV 自然播完：回到聊天，只把 Offer 卡片发过来
    var toOffer = fromOffer ? null : function () { requestOffer(i, true); };
    var sendOffer = fromOffer ? null : function () { requestOffer(i, false); };
    // 看 PV 时背景音乐让位给视频，关掉播放器再接着放
    var done = function (then) { return function () { GJ.bgm.duck(false); nav.dismissed('player', then); }; };
    GJ.bgm.duck(true);
    nav.push('player', function () { GJ.player.close(); GJ.bgm.duck(false); });
    GJ.player.open(ch, {
      strip: fromOffer ? null : stripText(),
      onBack: done(null),
      onSkip: done(toOffer),
      onEnded: done(sendOffer),
    });
    syncInert();
  }

  // ---------- 录用通知书（领券） ----------
  // 拿到 Offer：用户提供的秃秃原声（source/拿到offer.mp3），原声偏响，音量压低一点
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

  function fillOffer(i) {
    var ch = chAt(i), cp = C.coupon;
    $('letter').classList.toggle('is-special', !!ch.hidden);
    $('o-fig').src = 'assets/figures/' + ch.id + '.png';
    $('o-fig').alt = ch.name + '实物照';
    $('o-role').textContent = '「' + ch.name + '」的主人';
    $('o-salary').textContent = ch.job.salary;
    $('o-gift').textContent = ch.job.gift;
    $('o-seal-2').textContent = ch.hidden ? '特别录用' : '人事部';
    $('o-seal').setAttribute('aria-label', ch.hidden ? '菇的JOB! 特别录用 印章' : '菇的JOB! 人事部 印章');
    $('o-amount').textContent = cp.amount;
    $('o-threshold').textContent = cp.threshold;
    $('o-name').textContent = cp.name;
    $('o-store').textContent = cp.store;
    $('o-validity').textContent = cp.validity;
    var price = $('o-price');
    if (typeof C.price === 'number' && C.price > 0) {
      price.textContent = '单盒 ¥' + C.price + '，用券后 ¥' + Math.max(0, C.price - cp.amount);
      price.hidden = false;
    } else price.hidden = true;
  }

  // ---------- 把 Offer 发给朋友（拉新） ----------
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
        img.alt = ch.name + '的录用通知书海报';
        img.hidden = false;
        shareData.url = res.dataURL;
        $('s-save').disabled = false;
      } else {
        // 本地文件打开时浏览器不让导出图片：直接显示画好的海报
        res.canvas.className = 'poster-img';
        res.canvas.setAttribute('role', 'img');
        res.canvas.setAttribute('aria-label', ch.name + '的录用通知书海报');
        wrap.appendChild(res.canvas);
        $('poster-tip').textContent = '海报已生成；这个环境不能导出图片，可以先复制链接';
      }
    }, function () {
      $('poster-loading').querySelector('span').textContent = '海报没生成出来，可以先复制链接';
    });
  }

  function savePoster() {
    if (!shareData.url) return;
    var name = '菇的JOB-录用通知书-' + shareData.ch.name + '.jpg';
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
      '<div><b>朋友刚被录用为「' + esc(ch.name) + '」的主人</b><span>你也挑一个岗位聊聊，入职福利同款 ¥' + C.coupon.amount + '</span></div>';
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
    var url = C.links[channel], ch = chAt(ui.offerPos);
    if (!url) { toast('链接还没配置'); return; }
    ui.jumped = true;
    clearJump();
    $('jump-fig').src = 'assets/figures/' + ch.id + '.png';
    $('jump-sub').textContent = ch.name + '在' + CHANNEL[channel] + '门口等你';
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
      empty.innerHTML = '<img alt="" src="assets/tutu/wave.png"><p>还没有聊过的岗位</p>';
      var go = document.createElement('button');
      go.type = 'button'; go.className = 'btn small'; go.textContent = '去看看岗位';
      go.addEventListener('click', function () { switchTab('jobs'); });
      empty.appendChild(go);
      list.appendChild(empty);
      return;
    }
    rows.forEach(function (i) {
      var st = S.status(i);
      var preview = st === 1 ? '[工牌] 刮开就知道是谁啦' : st === 2 ? '[视频] TA 的工作日常' : '[Offer] 录用通知书';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'msg-row';
      b.innerHTML = '<span class="ava mid"><img alt="" src="assets/tutu/front.png"></span>' +
        '<span class="msg-main"><span class="msg-top"><b>秃秃</b><span class="muted">' + esc(jobTitle(i)) + '</span>' +
        '<span class="fill"></span><span class="muted">' + clock(S.startedAt(i)) + '</span></span>' +
        '<span class="msg-prev"><span>' + esc(preview) + '</span>' + (st === 1 ? '<span class="st-wait">待刮开</span>' : '') + '</span></span>';
      b.addEventListener('click', function () { openChat(i); });
      list.appendChild(b);
    });
  }

  function updateBadge() {
    var n = S.waiting(), badge = $('msgs-badge');
    badge.hidden = !n;
    badge.textContent = n;
    $('tab-btn-msgs').setAttribute('aria-label', n ? '消息，' + n + ' 张工牌待刮开' : '消息');
  }

  // ---------- 我的 ----------
  function renderMine() {
    var hired = S.hired();
    $('m-hired').textContent = hired;
    $('m-wait').textContent = S.size - hired;
    $('m-fav').textContent = S.favCount();
    $('m-count').textContent = hired + ' / ' + S.size;
    var grid = $('offer-grid');
    grid.innerHTML = '';
    C.characters.forEach(function (c) {
      var pos = S.posOf(c.id), got = S.status(pos) >= 2, el;
      if (got) {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'og-item is-got' + (c.hidden ? ' is-holo' : '');
        el.setAttribute('aria-label', '查看' + c.name + '的录用通知书');
        el.innerHTML = '<span class="og-card"><img alt="" src="assets/cards/' + c.id + '.jpg"><span class="holo"></span></span><span class="og-name">' + esc(c.name) + '</span>';
        el.addEventListener('click', function () { goOffer(pos); });
      } else {
        el = document.createElement('div');
        el.className = 'og-item is-locked' + (c.hidden ? ' is-hidden' : '');
        el.innerHTML = '<span class="og-card"><img alt="" src="assets/cards/back.jpg"><b aria-hidden="true">?</b></span><span class="og-name">' + (c.hidden ? '隐藏岗位' : '待录用') + '</span>';
      }
      grid.appendChild(el);
    });
    var all = S.allHired();
    $('btn-reshuffle').disabled = !all;
    $('reshuffle-tip').textContent = all ? '7 个岗位都录用啦，可以洗牌了' : '7 个岗位都录用后可用';
  }

  // 洗牌会清空「我的 Offer」和聊天记录，先确认一次
  function askReshuffle() { if (S.allHired()) openSheet('reshuffle'); }

  function reshuffle() {
    if (!S.allHired()) return;
    S.reshuffle();
    ui.filter = 'all'; ui.sort = 'rec';
    GJ.audio.play('slide', { gain: 0.9 });
    switchTab('jobs');
    refreshAll();
    $('jobs-list').scrollTop = 0;
    toast('洗好啦，7 个新岗位已发布');
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
    if (nav.has('detail') && ui.pos >= 0) fillDetail();
    if (ui.chatPos >= 0) fillChatHead(ui.chatPos);
  }

  // ---------- 弹层 ----------
  function renderRules() {
    var cp = C.coupon, list = $('rules');
    var items = [
      cp.name + '：立减 ¥' + cp.amount + '，' + cp.threshold + '，' + cp.validity + '。',
      '适用店铺：' + cp.store + '（抖音、天猫）。',
      '7 个岗位每一轮各出现一次，背后是 7 只不同的秃秃；不管录用谁，入职福利都是同一张券，多拿不叠加。',
      '刮工牌只是页面小游戏，和实体盲盒的款式概率无关；实体盲盒概率以销售页公示为准。',
      '页面有音效和视频声音，可以点右上角或在「我的」里关掉。',
    ];
    list.innerHTML = '';
    items.forEach(function (t) { var li = document.createElement('li'); li.textContent = t; list.appendChild(li); });
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

  // 在最外层按返回、要离开页面时：拿到了 Offer 却没去领券，提醒一次
  function onExit() {
    if (ui.leaveOpen) { hideSheets(true); history.back(); return; }
    var pos = latestHired();
    if (C.leaveReminder && !S.leaveShown() && !ui.jumped && pos >= 0) {
      S.markLeaveShown();
      try { history.pushState({ gjd: 0 }, ''); } catch (e) { /* 忽略 */ }
      var ch = chAt(pos);
      $('l-title').textContent = ch.name + '的 Offer 还没领';
      $('leave-fig').src = 'assets/figures/' + ch.id + '.png';
      $('leave-stay').onclick = function () { hideSheets(false); goOffer(pos); };
      showSheet('leave');
      ui.leaveOpen = true;
      return;
    }
    history.back();
  }

  // ---------- 绑定 ----------
  function bind() {
    // 第一次点屏幕：解锁声音、开始背景音乐、在历史里垫一步
    ['pointerdown', 'keydown', 'click'].forEach(function (type) {
      document.addEventListener(type, function () { nav.arm(); GJ.audio.unlock(); GJ.bgm.start(); }, true);
    });
    // 点按钮、岗位卡、消息时轻轻「啵」一声。自己有专属声音的（领券、刮工牌）标了 data-nosfx，不重复播
    document.addEventListener('click', function (e) {
      var el = e.target.closest && e.target.closest('button, .job, .msg-row');
      if (!el || el.disabled || el.closest('[data-nosfx]') || el.closest('#player')) return;
      GJ.audio.play('tap', { gain: 0.5, rate: 0.95 + Math.random() * 0.1 });
    }, true);
    $('sw-bgm').addEventListener('click', function () {
      var on = !S.bgmOn();
      S.setBgm(on);
      GJ.bgm.setEnabled(on);
      $('sw-bgm').setAttribute('aria-checked', on ? 'true' : 'false');
    });

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
    $('d-fav').addEventListener('click', toggleFav);
    $('d-fav2').addEventListener('click', toggleFav);
    $('d-share').addEventListener('click', share);
    $('d-co').addEventListener('click', openCompany);
    $('d-hr').addEventListener('click', openHr);
    $('c-who').addEventListener('click', openHr);
    $('d-chat').addEventListener('click', function () { openChat(ui.pos); });

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
    $('o-pv').addEventListener('click', function () { openPV(ui.offerPos, true); });
    $('o-more').addEventListener('click', backToJobs);
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

    $('btn-reshuffle').addEventListener('click', askReshuffle);
    $('rs-go').addEventListener('click', function () { nav.back(reshuffle); });
    // 「我的」里的三个数字：点进职位列表对应的筛选
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

  // 首屏稳定后，在后台一张一张地把还没刮的卡面先下载好
  function preloadCards() {
    var queue = ['assets/cards/back.jpg'];
    for (var i = 0; i < S.size; i++) if (S.status(i) < 2) queue.push('assets/cards/' + S.idAt(i) + '.jpg');
    (function next() {
      var src = queue.shift();
      if (!src) return;
      GJ.loadImage(src, 1).then(next, next);
    })();
  }

  function init() {
    GJ.player.init();
    GJ.chat.init({
      onCard: openScratch,
      onVideo: function (i) { openPV(i, false); },
      onOffer: goOffer,
      onHr: openHr,
    });
    setMuted(S.muted());
    GJ.bgm.setEnabled(S.bgmOn());
    $('sw-bgm').setAttribute('aria-checked', S.bgmOn() ? 'true' : 'false');
    readInvite();
    renderRules();
    makeBurst();
    bind();
    switchTab('jobs');
    refreshAll();
    syncInert();
    setTimeout(preloadCards, 1200);
  }

  GJ.app = { setMuted: setMuted };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
