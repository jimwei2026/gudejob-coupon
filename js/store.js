/*
 * 本地记录：抽卡顺序（洗牌袋）、已解锁的角色、静音设置。
 * 全部存在 localStorage；读不到（无痕模式、被清理）就从头开始，页面照常可用。
 */
(function () {
  var KEY = 'gudejob3-coupon-v1';

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var data = raw ? JSON.parse(raw) : null;
      if (data && typeof data === 'object') return data;
    } catch (e) { /* 忽略 */ }
    return {};
  }

  var state = load();
  state.bag = Array.isArray(state.bag) ? state.bag : [];
  state.got = Array.isArray(state.got) ? state.got : [];
  state.leaveShown = !!state.leaveShown;
  state.muted = !!state.muted;

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 忽略 */ }
  }

  function ids() { return GJ.config.characters.map(function (c) { return c.id; }); }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // 洗牌袋：7 只在一轮里各出现一次，抽完再洗一轮。
  // 隐藏款和其他角色机会均等，第一抽出现的概率约 1/7。
  function next() {
    var valid = ids();
    state.bag = state.bag.filter(function (id) { return valid.indexOf(id) >= 0; });
    if (!state.bag.length) {
      var fresh = shuffle(valid.slice());
      // 新一轮的第一只不和上一只重复，避免「连刮两次同一只」
      if (state.last && fresh[0] === state.last && fresh.length > 1) {
        var k = 1 + Math.floor(Math.random() * (fresh.length - 1));
        var t = fresh[0]; fresh[0] = fresh[k]; fresh[k] = t;
      }
      state.bag = fresh;
    }
    var id = state.bag.shift();
    state.last = id;
    save();
    return id;
  }

  function collect(id) {
    if (state.got.indexOf(id) < 0) { state.got.push(id); save(); }
  }

  GJ.store = {
    next: next,
    collect: collect,
    got: function () { return state.got.slice(); },
    has: function (id) { return state.got.indexOf(id) >= 0; },
    leaveShown: function () { return state.leaveShown; },
    markLeaveShown: function () { state.leaveShown = true; save(); },
    muted: function () { return state.muted; },
    setMuted: function (m) { state.muted = !!m; save(); },
  };
})();
