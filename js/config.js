/*
 * 《菇的JOB3.0领券指南》配置
 * 拿到确认版信息后只改这个文件，其他代码不用动。
 * 标了「占位」的都要替换。
 */
window.GJ = window.GJ || {};

GJ.config = {
  // 领券链接（占位：先用渠道首页）
  links: {
    douyin: 'https://www.douyin.com/',
    taobao: 'https://www.taobao.com/',
  },

  // 券面信息（占位）
  coupon: {
    name: '接 TA 回家券',
    amount: 20,                         // 立减金额，单位元
    threshold: '满 69 可用',
    validity: '有效期至 2026年11月30日',
    store: 'Sowii 潮玩旗舰店',
  },

  // 单盒原价（占位）。必须是真实售价；设为 null 就不显示「券后价」那一行
  price: 69,

  // 用户在券页面没点渠道就按返回时，提醒一次。App 不支持拦截返回时自动失效
  leaveReminder: true,

  // 7 只秃秃。顺序就是选卡转轮上的顺序；台词和运势是初稿
  characters: [
    { id: 'inventor', name: '潮玩发明家', en: 'Toy Tinkerer',
      line: '用瓶盖做了个新玩具，第一个给你玩。', fortune: '适合把旧东西改成新玩具' },
    { id: 'hiker', name: '徒步山友', en: 'Hiking Buddy',
      line: '你路过的绿化带，是我的无人区。', fortune: '适合绕远路，路边有惊喜' },
    { id: 'foodie', name: '邪修老吃家', en: 'Food Hacker',
      line: '偷吃了一点点，就一点点。', fortune: '适合偷吃一点点，就一点点' },
    { id: 'surfer', name: '海城浪人', en: 'Puddle Surfer',
      line: '今天的浪，刚好是一个水洼那么大。', fortune: '适合踩水坑，越大越好' },
    { id: 'farmer', name: '农场主理人', en: 'Green Thumb',
      line: '我的农场今天收了一颗小番茄。', fortune: '适合给小盆栽浇浇水' },
    { id: 'weather', name: '局部天气顾问', en: 'Vibe Maker',
      line: '你头顶这一小块，今天有雨。', fortune: '适合开一盏暖暖的灯' },
    { id: 'dream', name: '梦境修复师', en: 'Nighty Night', hidden: true,
      line: '嘘，你昨晚的梦，我帮你补好了。', fortune: '适合早点睡，好梦已经备好了' },
  ],

  // 刮开多少自动翻开（0–1）
  revealAt: 0.7,
};
