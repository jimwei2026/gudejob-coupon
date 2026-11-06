/*
 * 《菇的JOB3.0领券指南》版本线 2：招聘 App 版 · 配置
 * 拿到确认版信息后只改这个文件，其他代码不用动。
 * 标了「占位」的都要替换。岗位文案（job）和秃秃 HR 的台词（chat）可以由策划直接改。
 */
window.GJ = window.GJ || {};

GJ.config = {
  // 领券链接（占位：先用渠道首页）
  links: {
    douyin: 'https://www.douyin.com/',
    tmall: 'https://www.tmall.com/',
  },

  // 券面信息（占位）
  coupon: {
    name: '接 TA 回家券',
    amount: 5,                          // 立减金额，单位元
    threshold: '满 69 可用',
    validity: '有效期至 2026年11月30日',
    store: 'Sowii 潮玩旗舰店',
  },

  // 单盒原价。必须是真实售价；设为 null 就不显示「券后价」那一行
  price: 99,

  // 拿到 Offer 但没点领券就要退出页面时，提醒一次。App 不支持拦截返回时自动失效
  leaveReminder: true,

  // 刮开多少自动翻开（0–1）
  revealAt: 0.7,

  // 把 Offer 发给朋友（拉新）。朋友打开链接直接进这个页面，顶部会提示「你的朋友刚被录用为 XX 的主人」。
  // url 留空就用当前页面地址；正式上线后填正式地址（海报上的二维码就是它）。{name} 会换成角色名
  share: {
    url: '',
    title: '菇的JOB! 招主人',
    text: '我被录用为「{name}」的主人！你也来挑一只秃秃应聘吧',
  },

  // 秃秃 HR 的固定台词。{name} 会换成角色名
  chat: {
    greet: '你好，我对这个岗位很感兴趣，可以聊聊吗？',
    hello: '人，你好！这个岗位还没有被认领～',
    hiddenPre: '人……这个岗位，有点特殊',
    sendCard: '先给你看看 TA 的工牌，刮开就知道是谁啦',
    reveal: '人，是「{name}」！',
    revealHidden: '人，你刮到了隐藏岗位「{name}」！',
    videoIntro: '这是 TA 的工作日常，看看？',
    want: '我想接 TA 回家',
    offer: '好嘞！Offer 发你了，入职福利记得领',
  },

  // 7 只秃秃。fortune 是揭晓后的「今日运势」；job 是职位详情页的招聘文案。
  // 揭晓前岗位标题统一叫「秃秃的主人」，职责和要求在暗示 TA 是谁，猜中了刮开会更开心。
  characters: [
    { id: 'inventor', name: '潮玩发明家', en: 'Toy Tinkerer', fortune: '适合把旧东西改成新玩具',
      job: {
        salary: '瓶盖若干', place: '书桌抽屉', dist: 0.5,
        tags: ['动手能力强', '爱拆东西', '不怕乱'],
        duties: ['喝完的瓶盖，留给 TA', 'TA 的新发明，你要第一个玩', '抽屉里的纽扣，借 TA 用用'],
        reqs: ['不怕家里有点乱', '会说「哇，好厉害」', '手比 4cm 大'],
      } },
    { id: 'hiker', name: '徒步山友', en: 'Hiking Buddy', fortune: '适合绕远路，路边有惊喜',
      job: {
        salary: '每天一万步', place: '楼下绿化带', dist: 120,
        tags: ['爱出门', '不怕绕路', '户外'],
        duties: ['出门的时候带上 TA', '路过绿化带，停下来让 TA 看看', '下雨天也别一直宅着'],
        reqs: ['走路不赶时间', '口袋要够深', '无经验可投'],
      } },
    { id: 'foodie', name: '邪修老吃家', en: 'Food Hacker', fortune: '适合偷吃一点点，就一点点',
      job: {
        salary: '包吃，管够', place: '零食柜', dist: 3,
        tags: ['爱吃', '会分享', '夜宵自由'],
        duties: ['吃东西时，分 TA 一点点', '发现 TA 偷吃，假装没看见', '冰激凌第一口留给 TA'],
        reqs: ['零食柜不上锁', '不和 TA 抢最后一口', '吃货优先'],
      } },
    { id: 'surfer', name: '海城浪人', en: 'Puddle Surfer', fortune: '适合踩水坑，越大越好',
      job: {
        salary: '日结：一个水坑', place: '门口水坑', dist: 8,
        tags: ['喜欢下雨', '水上项目', '阳光开朗'],
        duties: ['下雨天陪 TA 去门口看浪', '帮 TA 找一个刚刚好的水坑', '回家记得给 TA 擦干'],
        reqs: ['不怕鞋子湿', '喜欢下雨天', '会游泳优先（不会也行）'],
      } },
    { id: 'farmer', name: '农场主理人', en: 'Green Thumb', fortune: '适合给小盆栽浇浇水',
      job: {
        salary: '收成分你一半', place: '阳台花盆', dist: 5,
        tags: ['种花种菜', '早起', '有耐心'],
        duties: ['每天给阳台的小种子浇水', '小番茄熟了，和 TA 一起摘', '陪 TA 等种子发芽'],
        reqs: ['家里有阳台或窗台', '等得起，不催', '手比 4cm 大'],
      } },
    { id: 'weather', name: '局部天气顾问', en: 'Vibe Maker', fortune: '适合开一盏暖暖的灯',
      job: {
        salary: '晴雨全包', place: '窗边', dist: 2,
        tags: ['会看天', '会安慰人', '暖灯'],
        duties: ['出门前，听 TA 报一下你头顶的天气', '你心情阴天时，TA 负责放晴', '晚上一起开一盏暖暖的灯'],
        reqs: ['愿意说说今天的心情', '家里有一盏暖灯', '无经验可投'],
      } },
    { id: 'dream', name: '梦境修复师', en: 'Nighty Night', hidden: true, fortune: '适合早点睡，好梦已经备好了',
      job: {
        salary: '好梦管够', place: '枕头边', dist: 0.3,
        tags: ['夜班', '安静', '早睡'],
        duties: ['睡前跟 TA 说一声晚安', '做坏的梦，交给 TA 修', '别问 TA 晚上去了哪里'],
        reqs: ['作息规律，早点睡', '能保守秘密', '其余面谈'],
      } },
  ],
};
