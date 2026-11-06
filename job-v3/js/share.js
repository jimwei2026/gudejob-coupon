/*
 * 「把 Offer 发给朋友」：生成录用通知书海报（canvas 720×1280）和分享链接。
 * 海报上的二维码指向本页，带 ?from=offer&r=角色 id；朋友打开后，职位列表顶部会提示「你的朋友刚被录用为 XX 的主人」。
 * 链接里只有角色 id，不带任何个人信息。二维码用 js/vendor/qrcode.js（qrcode-generator，MIT）。
 */
(function () {
  var C = GJ.config;
  var W = 720, H = 1280;
  var FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "HarmonyOS Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
  var INK = '#1E1B18', INK2 = '#6E655C', INK3 = '#736C63', SALARY = '#B4501E', ORANGE = '#D8612E';

  function font(weight, px) { return weight + ' ' + px + 'px ' + FONT; }

  function link(ch) {
    var base = C.share && C.share.url ? C.share.url : location.href.split('#')[0].split('?')[0];
    return base + (base.indexOf('?') < 0 ? '?' : '&') + 'from=offer&r=' + encodeURIComponent(ch.id);
  }
  function text(ch) { return ((C.share && C.share.text) || '').replace(/\{name\}/g, ch.name); }

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // 一行字放不下时缩小字号
  function fitText(c, s, weight, px, maxW) {
    c.font = font(weight, px);
    while (px > 20 && c.measureText(s).width > maxW) { px -= 2; c.font = font(weight, px); }
  }

  function drawQR(c, url, x, y, size) {
    c.save();
    c.fillStyle = '#FFFFFF';
    rr(c, x, y, size, size, 16);
    c.fill();
    var qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    var n = qr.getModuleCount(), pad = 14;
    var cell = Math.floor((size - pad * 2) / n);
    var off = Math.round((size - cell * n) / 2);
    c.fillStyle = INK;
    for (var r = 0; r < n; r++) {
      for (var k = 0; k < n; k++) {
        if (qr.isDark(r, k)) c.fillRect(x + off + k * cell, y + off + r * cell, cell, cell);
      }
    }
    c.restore();
  }

  function drawSeal(c, cx, cy, special) {
    var color = special ? '#8A5E00' : '#D1001F';
    c.save();
    c.translate(cx, cy);
    c.rotate(-14 * Math.PI / 180);
    c.globalAlpha = 0.9;
    c.strokeStyle = color;
    c.lineWidth = 4;
    c.beginPath(); c.arc(0, 0, 58, 0, Math.PI * 2); c.stroke();
    c.fillStyle = color;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font(800, 20); c.fillText('菇的JOB!', 0, -12);
    c.font = font(800, 20); c.fillText(special ? '特别录用' : '人事部', 0, 16);
    c.restore();
  }

  function draw(ch, card, tutu) {
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');
    var special = !!ch.hidden;

    // 底色
    c.fillStyle = '#F7F2EA';
    c.fillRect(0, 0, W, H);

    // 顶部字标
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.font = font(900, 44);
    c.fillStyle = INK; c.fillText('菇的', 44, 92);
    var w1 = c.measureText('菇的').width;
    c.fillStyle = ORANGE; c.fillText('JOB!', 44 + w1, 92);
    var w2 = c.measureText('JOB!').width;
    c.font = font(400, 22);
    var chipX = 44 + w1 + w2 + 14, chipW = c.measureText('招主人').width + 20;
    c.strokeStyle = '#E6DDCF'; c.lineWidth = 2;
    rr(c, chipX, 62, chipW, 36, 10); c.stroke();
    c.fillStyle = INK2; c.fillText('招主人', chipX + 10, 88);
    if (tutu) c.drawImage(tutu, W - 44 - 72, 36, 72, 72);

    // 录用通知书卡片
    c.save();
    c.shadowColor = 'rgba(30, 27, 24, 0.10)'; c.shadowBlur = 30; c.shadowOffsetY = 10;
    c.fillStyle = '#FFFFFF';
    rr(c, 40, 132, W - 80, 900, 32); c.fill();
    c.restore();
    if (special) {
      c.strokeStyle = '#C9B8F2'; c.lineWidth = 4;
      rr(c, 40, 132, W - 80, 900, 32); c.stroke();
    }

    c.textAlign = 'center';
    c.fillStyle = INK2; c.font = font(600, 24);
    c.fillText(special ? '录用通知书 · 特别录用' : '录用通知书', W / 2, 190);

    // 角色卡面
    var cw = 300, ch2 = Math.round(cw * 2000 / 1432), cx = (W - cw) / 2, cy = 216;
    c.save();
    c.fillStyle = special ? '#C9B8F2' : '#F6CF4E';
    rr(c, cx - 6, cy - 6, cw + 12, ch2 + 12, 24); c.fill();
    rr(c, cx, cy, cw, ch2, 18); c.clip();
    if (card) c.drawImage(card, cx, cy, cw, ch2);
    c.restore();
    drawSeal(c, cx + cw + 30, cy + ch2 - 30, special);

    var ty = cy + ch2 + 62;
    c.fillStyle = '#3A3530'; c.font = font(400, 30);
    c.fillText('我被录用为', W / 2, ty);
    var role = '「' + ch.name + '」的主人';
    fitText(c, role, 800, 50, W - 140);
    c.fillStyle = INK; c.fillText(role, W / 2, ty + 64);
    var fortune = '今日运势：' + ch.fortune;
    fitText(c, fortune, 600, 26, W - 140);
    c.fillStyle = SALARY; c.fillText(fortune, W / 2, ty + 116);

    // 虚线 + 入职福利
    var ly = ty + 156;
    c.save();
    c.strokeStyle = '#E6DDCF'; c.lineWidth = 2; c.setLineDash([10, 8]);
    c.beginPath(); c.moveTo(80, ly); c.lineTo(W - 80, ly); c.stroke();
    c.restore();
    c.textAlign = 'left';
    c.fillStyle = INK2; c.font = font(400, 24);
    c.fillText('入职福利', 80, ly + 52);
    c.fillStyle = INK; c.font = font(800, 30);
    c.fillText(C.coupon.name, 80, ly + 96);
    c.textAlign = 'right';
    c.fillStyle = SALARY; c.font = font(800, 64);
    c.fillText('¥' + C.coupon.amount, W - 80, ly + 96);
    c.textAlign = 'left';

    // 底部：二维码 + 邀请
    var qy = 1060;
    drawQR(c, link(ch), 40, qy, 180);
    c.fillStyle = INK; c.font = font(800, 40);
    c.fillText('你也来应聘？', 252, qy + 62);
    c.fillStyle = INK2; c.font = font(400, 24);
    c.fillText('扫码挑一只秃秃，拿同款入职福利', 252, qy + 110);
    c.fillStyle = INK3; c.font = font(400, 22);
    c.fillText('长按识别二维码', 252, qy + 150);
    return cv;
  }

  // 二维码库第一次分享时才加载，首屏少下载 56KB
  var qrReady = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve();
    if (qrReady) return qrReady;
    qrReady = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'js/vendor/qrcode.js';
      s.onload = function () { resolve(); };
      s.onerror = function () { qrReady = null; reject(new Error('二维码组件加载失败')); };
      document.head.appendChild(s);
    });
    return qrReady;
  }

  // 返回 Promise<{ canvas, dataURL }>；本地文件打开时 canvas 会被浏览器判为「跨域」，dataURL 为 null
  function poster(ch) {
    var load = function (src) { return GJ.loadImage(src, 1).catch(function () { return null; }); };
    return Promise.all([load('assets/cards/' + ch.id + '.jpg'), load('assets/tutu/front.png'), loadQR()]).then(function (imgs) {
      var cv = draw(ch, imgs[0], imgs[1]);
      var url = null;
      try { url = cv.toDataURL('image/jpeg', 0.9); } catch (e) { url = null; }
      return { canvas: cv, dataURL: url };
    });
  }

  function dataURLtoFile(dataURL, name) {
    var parts = dataURL.split(','), bin = atob(parts[1]), n = bin.length, arr = new Uint8Array(n);
    for (var i = 0; i < n; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], name, { type: 'image/jpeg' });
  }

  GJ.share = { poster: poster, link: link, text: text, dataURLtoFile: dataURLtoFile };
})();
