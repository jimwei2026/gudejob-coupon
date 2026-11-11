/*
 * 本地存档（localStorage）。不需要登录，也不上传任何数据。
 * 7 只秃秃是一副牌：列表上每个位置背后固定是一只秃秃，7 只都入职后可以洗牌再招一轮。
 * 每只秃秃的进度：0 没聊过 → 1 已约面试、简历还没刮 → 2 面试过（简历已刮开）→ 3 已入职（Offer 已接受）
 * （v9 之前的存档里 2 = 已录用、3 = Offer 已发，数字含义正好对得上，不用迁移）
 */
(function () {
  var KEY = 'gudejob3-job-v1';
  var N = GJ.config.characters.length;
  var ids = GJ.config.characters.map(function (c) { return c.id; });
  var data = load();
  // 开场视频的版本号（config.intro.rev）。存档里记的是看过的版本号；v18 之前记的是 true，算第 1 版。
  // 换了新开场把 rev 加 1：看过旧开场的人会自动再播一次新的（只播一次），游戏进度不受影响。
  var INTRO_REV = Math.max(1, Number((GJ.config.intro || {}).rev) || 1);
  function introRev(v) { return v === true ? 1 : (typeof v === 'number' ? v : 0); }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function fresh(keep) {
    return {
      deck: shuffle(ids),
      st: fill(0), t0: fill(0), fav: fill(false),
      leave: keep ? keep.leave : false,
      muted: keep ? keep.muted : false,
      intro: keep ? (keep.intro || false) : false,   // 洗牌保留「看过第几版开场」，不会因此重播
    };
  }
  function fill(v) { var a = []; for (var i = 0; i < N; i++) a.push(v); return a; }

  function valid(d) {
    if (!d || !Array.isArray(d.deck) || d.deck.length !== N) return false;
    if (ids.some(function (id) { return d.deck.indexOf(id) < 0; })) return false;
    return ['st', 't0', 'fav'].every(function (k) { return Array.isArray(d[k]) && d[k].length === N; });
  }

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (valid(d)) return d;
    } catch (e) { /* 存档损坏或不能用：重新开始 */ }
    return fresh(null);
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 无痕模式等情况存不了，不影响玩 */ }
  }

  function count(fn) { var n = 0; for (var i = 0; i < N; i++) if (fn(i)) n++; return n; }

  GJ.store = {
    size: N,
    deck: function () { return data.deck.slice(); },
    idAt: function (i) { return data.deck[i]; },
    posOf: function (id) { return data.deck.indexOf(id); },
    status: function (i) { return data.st[i] || 0; },
    // 进度只往前走
    advance: function (i, s) {
      if ((data.st[i] || 0) >= s) return false;
      if (!data.t0[i]) data.t0[i] = Date.now();
      data.st[i] = s; save();
      return true;
    },
    startedAt: function (i) { return data.t0[i] || 0; },
    isFav: function (i) { return !!data.fav[i]; },
    toggleFav: function (i) { data.fav[i] = !data.fav[i]; save(); return data.fav[i]; },
    // 已入职（Offer 已接受）
    hired: function () { return count(function (i) { return data.st[i] >= 3; }); },
    // 还没面试（没聊过 + 已约面试）
    toInterview: function () { return count(function (i) { return (data.st[i] || 0) < 2; }); },
    // 已约面试、简历还没刮：消息标签上的红点
    waiting: function () { return count(function (i) { return data.st[i] === 1; }); },
    untouched: function () { return count(function (i) { return !data.st[i]; }); },
    favCount: function () { return count(function (i) { return !!data.fav[i]; }); },
    allHired: function () { return count(function (i) { return data.st[i] >= 3; }) === N; },
    reshuffle: function () { data = fresh(data); save(); },
    leaveShown: function () { return !!data.leave; },
    markLeaveShown: function () { data.leave = true; save(); },
    muted: function () { return !!data.muted; },
    setMuted: function (m) { data.muted = !!m; save(); },
    // 当前这版开场主题视频是否已经看过（看完、跳过、点券条、选「还是不看」都算）
    introSeen: function () { return introRev(data.intro) >= INTRO_REV; },
    markIntroSeen: function () { if (introRev(data.intro) < INTRO_REV) { data.intro = INTRO_REV; save(); } },
  };
})();
