/*
 * 本地记录：这一副牌（7 个位置各对应哪只秃秃、哪几张已刮开）、图鉴、静音设置。
 * 全部存在 localStorage；读不到（无痕模式、被清理）就从头开始，页面照常可用。
 */
(function () {
  var KEY = 'gudejob3-coupon-v2';

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      var data = raw ? JSON.parse(raw) : null;
      if (data && typeof data === 'object') return data;
    } catch (e) { /* 忽略 */ }
    return {};
  }

  var state = load();
  state.deck = Array.isArray(state.deck) ? state.deck : [];
  state.opened = Array.isArray(state.opened) ? state.opened : [];
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

  // 洗牌：7 只秃秃随机放进 7 个位置。每只（包括隐藏款）在任何位置的机会都一样。
  // 图鉴跟着这一副牌走（由已刮开的位置算出来），洗牌后图鉴也从 0 开始
  function reshuffle() {
    state.deck = shuffle(ids());
    state.opened = [];
    delete state.got;
    save();
  }

  // 记录损坏或角色表变了，就重新洗一副
  (function validate() {
    var valid = ids().slice().sort().join(',');
    if (state.deck.slice().sort().join(',') !== valid) reshuffle();
    state.opened = state.opened.filter(function (i, k, a) {
      return typeof i === 'number' && i >= 0 && i < state.deck.length && a.indexOf(i) === k;
    });
  })();

  function open(i) {
    if (state.opened.indexOf(i) < 0) state.opened.push(i);
    save();
    return state.deck[i];
  }

  GJ.store = {
    deck: function () { return state.deck.slice(); },
    idAt: function (i) { return state.deck[i]; },
    isOpened: function (i) { return state.opened.indexOf(i) >= 0; },
    openedCount: function () { return state.opened.length; },
    left: function () { return state.deck.length - state.opened.length; },
    open: open,
    reshuffle: reshuffle,
    got: function () { return state.opened.map(function (i) { return state.deck[i]; }); },
    leaveShown: function () { return state.leaveShown; },
    markLeaveShown: function () { state.leaveShown = true; save(); },
    muted: function () { return state.muted; },
    setMuted: function (m) { state.muted = !!m; save(); },
  };
})();
