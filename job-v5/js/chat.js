/*
 * 和秃秃 HR 的聊天。
 * 对话内容完全由岗位进度决定（store 里的 0–3），所以重新进来时可以一次画出完整记录；
 * 进度往前走时，新消息带「正在输入」一条条出来。点一下聊天区可以跳过等待。
 * 聊天里没有输入框，只有快捷回复：秃秃 HR 看不懂自由输入，放一个打了字没反应的输入框等于假按钮。
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

  var ME_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';
  var PLAY_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
  var HAND_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1a1.5 1.5 0 0 1 3 0v2m0-1a1.5 1.5 0 0 1 3 0v4.5a5.5 5.5 0 0 1-5.5 5.5h-.8a5 5 0 0 1-3.8-1.8L5 15.5a1.6 1.6 0 0 1 2.4-2.1L9 15"/></svg>';
  var CHEV_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>';

  // ---------- 对话片段 ----------
  function segStart(pos, ch) {
    var m = [
      { t: 'time', text: clock(GJ.store.startedAt(pos)) },
      { t: 'sys', text: '你正在和秃秃 HR 沟通「秃秃的主人」' },
      { t: 'me', text: C.chat.greet },
      { t: 'hr', text: C.chat.hello },
    ];
    if (ch.hidden) m.push({ t: 'hr', text: C.chat.hiddenPre });
    m.push({ t: 'hr', text: C.chat.sendCard }, { t: 'card' });
    return m;
  }
  function segReveal(pos, ch) {
    return [
      { t: 'hr', text: fill(ch.hidden ? C.chat.revealHidden : C.chat.reveal, ch) },
      { t: 'fortune' },
      { t: 'hr', text: C.chat.videoIntro },
      { t: 'video' },
    ];
  }
  function segOffer() {
    return [{ t: 'me', text: C.chat.want }, { t: 'hr', text: C.chat.offer }, { t: 'offer' }];
  }
  function transcript(pos, ch) {
    var st = GJ.store.status(pos), m = segStart(pos, ch);
    if (st >= 2) m = m.concat(segReveal(pos, ch));
    if (st >= 3) m = m.concat(segOffer());
    return m;
  }

  // ---------- 单条消息 ----------
  function hrRow(content) {
    var row = node('div', 'm-row hr');
    var ava = node('span', 'ava');
    var img = node('img'); img.src = 'assets/tutu/front.png'; img.alt = '';
    ava.appendChild(img);
    var col = node('div', 'm-col');
    col.appendChild(content);
    row.appendChild(ava); row.appendChild(col);
    return row;
  }

  function cardContent(pos, ch) {
    var wrap = node('div', 'm-card-wrap');
    var open = GJ.store.status(pos) >= 2;
    var b = node('button', 'm-card' + (open ? ' is-open' : '') + (open && ch.hidden ? ' is-holo' : ''));
    b.type = 'button';
    var img = node('img'); img.alt = ''; img.draggable = false;
    img.src = open ? 'assets/cards/' + ch.id + '.jpg' : 'assets/cards/back.jpg';
    b.appendChild(img);
    if (open) {
      b.appendChild(node('span', 'holo'));
      var play = node('span', 'm-card-play'); play.innerHTML = PLAY_SVG; b.appendChild(play);
      b.setAttribute('aria-label', '播放' + ch.name + '的工作日常');
    } else {
      var pill = node('span', 'm-card-pill'); pill.innerHTML = HAND_SVG; pill.appendChild(node('span', null, '点开刮工牌'));
      b.appendChild(pill);
      b.setAttribute('aria-label', '打开工牌，刮开看看是谁');
      b.setAttribute('data-nosfx', '');   // 打开刮工牌自己有声音
    }
    b.addEventListener('click', function () {
      if (GJ.store.status(pos) >= 2) handlers.onVideo(pos); else handlers.onCard(pos);
    });
    wrap.appendChild(b);
    wrap.appendChild(node('span', 'm-cap', open ? ch.name + '的工牌' : '菇的JOB! 工牌 · 待刮开'));
    return wrap;
  }

  function build(item, pos, ch) {
    switch (item.t) {
      case 'time': return node('div', 'm-time', item.text);
      case 'sys': return node('div', 'm-sys', item.text);
      case 'me': {
        var row = node('div', 'm-row me');
        row.appendChild(node('p', 'bubble', item.text));
        var a = node('span', 'me-ava'); a.innerHTML = ME_SVG; row.appendChild(a);
        return row;
      }
      case 'hr': return hrRow(node('p', 'bubble', item.text));
      case 'typing': {
        var t = node('p', 'bubble typing');
        t.setAttribute('aria-label', '秃秃正在输入');
        t.innerHTML = '<i></i><i></i><i></i>';
        return hrRow(t);
      }
      case 'card': return hrRow(cardContent(pos, ch));
      case 'fortune': {
        var f = node('div', 'm-fortune');
        f.appendChild(node('span', 'mf-tag', '今日运势'));
        f.appendChild(node('b', null, ch.fortune));
        f.appendChild(node('span', 'mf-sub', ch.name + ' · ' + ch.en));
        return hrRow(f);
      }
      case 'video': {
        var v = node('button', 'm-video');
        v.type = 'button';
        v.setAttribute('aria-label', '播放视频：' + ch.name + '的工作日常');
        var pic = node('span', 'mv-pic');
        var img = node('img'); img.alt = ''; img.src = 'assets/poster/' + ch.id + '.jpg';
        pic.appendChild(img);
        var p = node('span', 'mv-play'); p.innerHTML = PLAY_SVG; pic.appendChild(p);
        v.appendChild(pic);
        v.appendChild(node('span', 'm-cap', 'TA 的工作日常 · 视频'));
        v.addEventListener('click', function () { handlers.onVideo(pos); });
        return hrRow(v);
      }
      case 'offer': {
        var o = node('button', 'm-offer' + (ch.hidden ? ' is-special' : ''));
        o.type = 'button';
        var head = node('span', 'mo-head');
        head.appendChild(node('b', null, ch.hidden ? '录用通知书 · 特别录用' : '录用通知书'));
        head.appendChild(node('span', null, '菇的JOB! 人事部'));
        var body = node('span', 'mo-body');
        body.appendChild(node('b', null, ch.name + '的主人'));
        var perk = node('span', 'mo-perk');
        perk.appendChild(document.createTextNode('入职福利：'));
        perk.appendChild(node('em', null, '¥' + C.coupon.amount));
        perk.appendChild(document.createTextNode(' ' + C.coupon.name));
        body.appendChild(perk);
        body.appendChild(node('span', 'mo-perk', '入职礼物：' + ch.job.gift));
        var foot = node('span', 'mo-foot');
        foot.appendChild(node('span', null, '查看 Offer'));
        var chev = node('span', 'chev'); chev.innerHTML = CHEV_SVG; foot.appendChild(chev);
        o.appendChild(head); o.appendChild(body); o.appendChild(foot);
        o.addEventListener('click', function () { handlers.onOffer(pos); });
        return hrRow(o);
      }
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
  function append(n) {
    log.appendChild(n);
    // 图片加载完会把内容撑高，再贴一次底
    n.querySelectorAll && n.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) img.addEventListener('load', function () { if (nearBottom()) toBottom(false); });
    });
    toBottom(true);
  }

  // ---------- 对外 ----------
  function init(h) {
    handlers = h;
    log = document.getElementById('chat-log');
    // 点一下聊天区：跳过「正在输入」的等待
    log.addEventListener('pointerdown', function () { if (busy) skip = true; });
  }

  // 一次画出完整记录（不带动画）
  function render(pos, ch) {
    stop();
    log.innerHTML = '';
    transcript(pos, ch).forEach(function (item) { log.appendChild(build(item, pos, ch)); });
    log.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) img.addEventListener('load', function () { if (nearBottom()) toBottom(false); });
    });
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
      if (item.t === 'me') {
        setTimeout(function () {
          if (my !== token) return;
          append(build(item, pos, ch));
          GJ.audio.play('pop', { gain: 0.35, rate: 1.15 });
          next();
        }, skip ? 0 : 160);
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

  // 工牌刮开后，把聊天里那张工牌换成正面
  function refreshCard(pos, ch) {
    var old = log.querySelector('.m-card-wrap');
    if (!old) return;
    var row = old.closest('.m-row');
    var fresh = build({ t: 'card' }, pos, ch);
    row.parentNode.replaceChild(fresh, row);
  }

  GJ.chat = {
    init: init, render: render, play: play, stop: stop, refreshCard: refreshCard,
    isBusy: function () { return busy; },
    segStart: segStart, segReveal: segReveal, segOffer: segOffer,
    toBottom: toBottom,
  };
})();
