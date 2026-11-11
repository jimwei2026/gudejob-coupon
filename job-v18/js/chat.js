/*
 * 老板（用户）和来应聘的秃秃聊天。
 * 对话内容完全由这只秃秃的进度决定（store 里的 0–3），所以重新进来时可以一次画出完整记录；
 * 进度往前走时，新消息带「正在输入」一条条出来。点一下聊天区可以跳过等待。
 * 聊天里没有输入框，只有快捷回复：秃秃看不懂自由输入，放一个打了字没反应的输入框等于假按钮。
 * 面试邀请、录用通知书、见面礼（券）都以卡片出现在聊天里。
 */
(function () {
  var C = GJ.config;
  var log = null, handlers = {};
  var token = 0, busy = false, skip = false;

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clock(ms) { var d = new Date(ms || Date.now()); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fill(s, ch) { return s.replace(/\{name\}/g, ch.name).replace(/\{scene\}/g, ch.job.scene); }
  // 隐藏款面试（刮开简历）之前保密
  function masked(pos, ch) { return !!ch.hidden && GJ.store.status(pos) < 2; }
  function shownName(pos, ch) { return masked(pos, ch) ? ch.mask.name : ch.name; }

  var ME_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';
  var PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
  var CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  var CHEV_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>';

  // ---------- 对话片段 ----------
  // 开头：老板打招呼 → 秃秃自我介绍、请求面试 → 老板发面试邀请 → 秃秃接受
  function segStart(pos, ch) {
    // 隐藏款的自我介绍本身就是保密版（config 里 resume.hi），揭晓后回看记录也不会穿帮
    return [
      { t: 'time', text: clock(GJ.store.startedAt(pos)) },
      { t: 'sys', text: '你正在和' + shownName(pos, ch) + '沟通「' + C.job.title + '」' },
      { t: 'me', text: C.chat.greet },
      { t: 'hr', text: ch.resume.hi },
      { t: 'hr', text: ch.hidden ? C.chat.askHidden : C.chat.ask },
      { t: 'invite' },
      { t: 'hr', text: C.chat.accepted },
    ];
  }
  // 面试（刮开简历）之后：亮简历 → 作品集视频
  function segReveal(pos, ch) {
    return [
      { t: 'sys', text: '面试结束 · 简历看过了' },
      { t: 'card', text: fill(ch.hidden ? C.chat.revealHidden : C.chat.reveal, ch) },
      { t: 'hr', text: C.chat.portfolio },
      { t: 'video' },
    ];
  }
  // 老板发 Offer → 秃秃接受，送上见面礼（券）
  function segOffer() {
    return [{ t: 'offer' }, { t: 'hr', text: C.chat.accept }, { t: 'coupon' }];
  }
  function transcript(pos, ch, upto) {
    var st = upto == null ? GJ.store.status(pos) : upto, m = segStart(pos, ch);
    if (st >= 2) m = m.concat(segReveal(pos, ch));
    if (st >= 3) m = m.concat(segOffer());
    return m;
  }

  // ---------- 单条消息 ----------
  function tutuRow(content, pos, ch) {
    var row = node('div', 'm-row hr');
    var face = node('span', 't-ava' + (masked(pos, ch) ? ' is-mask' : ''));
    face.setAttribute('aria-hidden', 'true');
    var img = node('img'); img.alt = '';
    img.src = masked(pos, ch) ? 'assets/tutu/front.png' : 'assets/figures/' + ch.id + '.png';
    face.appendChild(img);
    if (masked(pos, ch)) face.appendChild(node('b', null, '?'));
    var col = node('div', 'm-col');
    col.appendChild(content);
    row.appendChild(face); row.appendChild(col);
    return row;
  }
  function meRow(content) {
    var row = node('div', 'm-row me');
    row.appendChild(content);
    var a = node('span', 'me-ava'); a.innerHTML = ME_SVG; row.appendChild(a);
    return row;
  }
  function doneLine(text) {
    var s = node('span', 'mc-done');
    s.innerHTML = CHECK_SVG;
    s.appendChild(document.createTextNode(text));
    return s;
  }

  // 面试邀请卡：老板发出，秃秃已接受。简历刮开之前卡片上有「开始面试」
  function inviteCard(pos, ch) {
    var c = node('div', 'm-invite');
    var head = node('span', 'mc-head');
    head.appendChild(node('b', null, '面试邀请'));
    head.appendChild(node('span', null, '你发出的'));
    var body = node('span', 'mi-body');
    [['职位', C.job.title], ['时间', '现在'], ['地点', '你的手机里'], ['面试官', '你']].forEach(function (kv) {
      body.appendChild(node('span', 'mi-k', kv[0]));
      body.appendChild(node('span', null, kv[1]));
    });
    var foot = node('span', 'mc-foot');
    var done = GJ.store.status(pos) >= 2;
    foot.appendChild(doneLine(done ? '面试已完成' : 'TA 已接受'));
    if (!done) {
      var go = node('button', 'mc-go', '开始面试');
      go.type = 'button';
      go.setAttribute('data-nosfx', '');   // 打开面试（刮简历）自己有声音
      go.addEventListener('click', function () { handlers.onCard(pos); });
      foot.appendChild(go);
    }
    c.appendChild(head); c.appendChild(body); c.appendChild(foot);
    return c;
  }

  function revealContent(item, pos, ch) {
    var wrap = node('div', 'm-reveal');
    var b = node('button', 'm-card is-open' + (ch.hidden ? ' is-holo' : ''));
    b.type = 'button';
    b.setAttribute('aria-label', '播放' + ch.name + '的作品集');
    var img = node('img'); img.alt = ''; img.draggable = false;
    img.src = 'assets/cards/' + ch.id + '.jpg';
    b.appendChild(img);
    b.appendChild(node('span', 'holo'));
    var play = node('span', 'm-card-play'); play.innerHTML = PLAY_SVG; b.appendChild(play);
    b.addEventListener('click', function () { handlers.onVideo(pos); });
    wrap.appendChild(b);
    wrap.appendChild(node('p', 'bubble', item.text));
    return wrap;
  }

  function offerCard(pos, ch) {
    var o = node('button', 'm-offer' + (ch.hidden ? ' is-special' : ''));
    o.type = 'button';
    var head = node('span', 'mo-head');
    head.appendChild(node('b', null, '录用通知书'));
    head.appendChild(node('span', null, '你发出的'));
    var body = node('span', 'mo-body');
    body.appendChild(node('b', null, '发给：' + ch.name));
    body.appendChild(node('span', 'mo-perk', '岗位：' + C.job.title + ' · ' + C.job.perk));
    var foot = node('span', 'mo-foot');
    foot.appendChild(doneLine('TA 已接受'));
    var chev = node('span', 'chev'); chev.innerHTML = CHEV_SVG; foot.appendChild(chev);
    o.appendChild(head); o.appendChild(body); o.appendChild(foot);
    o.setAttribute('aria-label', '录用通知书，' + ch.name + '已接受，查看入职确认');
    o.addEventListener('click', function () { handlers.onOffer(pos); });
    return o;
  }

  function couponCard(pos) {
    var cp = C.coupon;
    var b = node('button', 'm-coupon');
    b.type = 'button';
    b.appendChild(node('span', 'mcp-tag', '券'));
    var t = node('span', 'mcp-txt');
    t.appendChild(node('b', null, cp.name + ' ¥' + cp.amount));
    t.appendChild(node('span', null, cp.threshold));
    b.appendChild(t);
    b.appendChild(node('span', 'mcp-go', '去领券'));
    b.setAttribute('aria-label', '见面礼：' + cp.name + ' ' + cp.amount + ' 元，' + cp.threshold + '，去领券');
    b.addEventListener('click', function () { handlers.onOffer(pos); });
    return b;
  }

  function build(item, pos, ch) {
    switch (item.t) {
      case 'time': return node('div', 'm-time', item.text);
      case 'sys': return node('div', 'm-sys', item.text);
      case 'me': return meRow(node('p', 'bubble', item.text));
      case 'hr': return tutuRow(node('p', 'bubble', item.text), pos, ch);
      case 'typing': {
        var t = node('p', 'bubble typing');
        t.setAttribute('aria-label', '秃秃正在输入');
        t.innerHTML = '<i></i><i></i><i></i>';
        return tutuRow(t, pos, ch);
      }
      case 'invite': return meRow(inviteCard(pos, ch));
      case 'card': return tutuRow(revealContent(item, pos, ch), pos, ch);
      case 'video': {
        var v = node('button', 'm-video');
        v.type = 'button';
        v.setAttribute('aria-label', '播放视频：' + ch.name + '的作品集');
        var pic = node('span', 'mv-pic');
        var img = node('img'); img.alt = ''; img.src = 'assets/poster/' + ch.id + '.jpg';
        pic.appendChild(img);
        var p = node('span', 'mv-play'); p.innerHTML = PLAY_SVG; pic.appendChild(p);
        v.appendChild(pic);
        v.appendChild(node('span', 'm-cap', '作品集 · 我的工作日常 · 视频'));
        v.addEventListener('click', function () { handlers.onVideo(pos); });
        return tutuRow(v, pos, ch);
      }
      case 'offer': return meRow(offerCard(pos, ch));
      case 'coupon': return tutuRow(couponCard(pos), pos, ch);
    }
    return node('div');
  }

  // ---------- 滚动 ----------
  // 图片加载完撑高内容时，只要还在底部附近（或者消息正在一条条出来）就贴底
  function nearBottom() { return busy || log.scrollHeight - log.scrollTop - log.clientHeight < 260; }
  function toBottom(smooth) {
    if (smooth && log.scrollTo) {
      try { log.scrollTo({ top: log.scrollHeight, behavior: 'smooth' }); return; } catch (e) { /* 老浏览器 */ }
    }
    log.scrollTop = log.scrollHeight;
  }
  function watchImages(n) {
    n.querySelectorAll && n.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) img.addEventListener('load', function () { if (nearBottom()) toBottom(false); });
    });
  }
  function append(n) {
    log.appendChild(n);
    watchImages(n);
    toBottom(true);
  }

  // ---------- 对外 ----------
  function init(h) {
    handlers = h;
    log = document.getElementById('chat-log');
    // 点一下聊天区：跳过「正在输入」的等待
    log.addEventListener('pointerdown', function () { if (busy) skip = true; });
  }

  // 一次画出完整记录（不带动画）。upto：只画到哪个进度为止（面试刚结束、要接着播新消息时用）
  function render(pos, ch, upto) {
    stop();
    log.innerHTML = '';
    transcript(pos, ch, upto).forEach(function (item) { log.appendChild(build(item, pos, ch)); });
    watchImages(log);
    toBottom(false);
  }

  // 新消息一条条出来；done 在全部出来后调用（中途离开聊天则不调用）
  function play(pos, ch, items, done) {
    var my = ++token;
    busy = true; skip = false;
    var i = 0;
    (function next() {
      if (my !== token) return;
      if (i >= items.length) { busy = false; skip = false; if (done) done(); return; }
      var item = items[i++];
      if (item.t === 'time' || item.t === 'sys') { append(build(item, pos, ch)); next(); return; }
      // 老板这边的消息（文字、面试邀请卡、录用通知书）：稍等一下直接出现
      if (item.t === 'me' || item.t === 'invite' || item.t === 'offer') {
        setTimeout(function () {
          if (my !== token) return;
          append(build(item, pos, ch));
          GJ.audio.play('pop', { gain: 0.35, rate: 1.15 });
          next();
        }, skip ? 0 : 200);
        return;
      }
      var len = item.text ? item.text.length : 12;
      var wait = Math.max(450, Math.min(1000, 320 + len * 24));
      if (skip) { append(build(item, pos, ch)); next(); return; }
      var typing = build({ t: 'typing' }, pos, ch);
      append(typing);
      var started = performance.now();
      (function waitTyping() {
        if (my !== token) return;
        if (skip || performance.now() - started >= wait) {
          if (typing.parentNode) typing.parentNode.removeChild(typing);
          append(build(item, pos, ch));
          GJ.audio.play('pop', { gain: 0.4 });
          next();
          return;
        }
        setTimeout(waitTyping, 40);
      })();
    })();
  }

  function stop() { token++; busy = false; skip = false; }

  GJ.chat = {
    init: init, render: render, play: play, stop: stop,
    isBusy: function () { return busy; },
    segStart: segStart, segReveal: segReveal, segOffer: segOffer,
    toBottom: toBottom,
  };
})();
