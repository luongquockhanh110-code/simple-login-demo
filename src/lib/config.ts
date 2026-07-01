// @ts-nocheck
/**
 * 全局配置。所有阈值/密钥都在这里改,不要散落在各个文件里。
 * 从 Python 后端 (config.py, analytics/timeline.py, core/known_addresses.py) 完整迁移。
 *
 * 用法:  CONFIG.SCORE_URGENT  /  CONFIG.MAJOR_EVENTS  /  CONFIG.WHALE_TIERS.BTC  等
 */
const CONFIG = Object.freeze({

  // ============================================================
  // 标的范围 (Scan Toggles)
  // ============================================================
  ENABLE_STOCK_SCAN: false,
  ENABLE_CRYPTO_SCAN: true,
  ENABLE_ONCHAIN_SCAN: true,
  ENABLE_OPEN_INTEREST: true,
  ENABLE_LIQUIDATION: true,
  ENABLE_MACRO_SCAN: true,
  ENABLE_WEB_SEARCH: true,

  CRYPTO_TOP_N: 50,
  STOCK_UNIVERSE: "sp500",
  SCAN_STOCK_MAX: 100,

  // ============================================================
  // 链上数据 (Onchain Thresholds)
  // ============================================================
  WHALE_THRESHOLD_BTC: 100,
  WHALE_THRESHOLD_ETH: 1000,

  ONCHAIN_GAS_THRESHOLD: 80,
  ONCHAIN_GAS_SEVERE: 150,
  ONCHAIN_BTC_FEE_THRESHOLD: 200,
  ONCHAIN_BTC_FEE_SEVERE: 500,
  ONCHAIN_STABLECOIN_MIN: 10_000_000,

  // 分级巨鲸阈值: 名称→(阈值, severity),从高到低匹配
  WHALE_TIERS: {
    BTC: [
      { tier: "mega",   threshold: 1000, severity: 1.0 },
      { tier: "super",  threshold: 500,  severity: 0.7 },
      { tier: "normal", threshold: 100,  severity: 0.4 },
    ],
    ETH: [
      { tier: "mega",   threshold: 10000, severity: 1.0 },
      { tier: "super",  threshold: 5000,  severity: 0.7 },
      { tier: "normal", threshold: 1000,  severity: 0.4 },
    ],
  },

  // ============================================================
  // 衍生品/合约 (Derivative Thresholds)
  // ============================================================
  OI_CHANGE_PCT: 5.0,
  LIQUIDATION_THRESHOLD_USD: 10_000_000,
  LIQUIDATION_WINDOW_HOURS: 4,
  FUTURES_SYMBOLS_TOP_N: 20,

  // ============================================================
  // Stage 1 扫描阈值
  // ============================================================
  STOCK_PRICE_CHANGE_PCT: 3.0,
  CRYPTO_PRICE_CHANGE_PCT_24H: 6.0,
  VOLUME_SPIKE_RATIO: 2.0,
  CRYPTO_MIN_VOLUME_USD: 1_000_000,

  // ============================================================
  // 宏观经济触发阈值 (Macro Thresholds)
  // ============================================================
  MACRO_FED_RATE_CHANGE_PCT: 0.25,
  MACRO_CPI_MOM_CHANGE_PCT: 0.2,
  MACRO_VIX_SPIKE: 5.0,

  // ============================================================
  // Stage 2 去重/防骚扰
  // ============================================================
  DEDUPE_WINDOW_MINUTES: 60,

  // ============================================================
  // 事件窗口积累评分 (Score Parameters)
  // ============================================================
  SCORE_URGENT: 0.8,
  SCORE_BRIEF: 0.4,
  AI_FALLBACK: true,
  AI_MIN_CONFIDENCE: 50,

  // 事件窗口时间衰减
  SCORE_HALF_LIFE: 14400,
  SCORE_HALF_LIFE_FAST: 1800,
  SCORE_HALF_LIFE_MEDIUM: 14400,
  SCORE_HALF_LIFE_SLOW: 172800,

  SCORE_WINDOW_WEIGHTS: {
    fast: 0.3,
    medium: 0.5,
    slow: 0.2,
  },

  // 维度源权重: 降低叙事/社交噪音,提升链上/宏观硬指标
  SCORE_DIMENSION_WEIGHTS: {
    onchain: 1.2,
    price: 1.0,
    macro: 1.0,
    derivatives: 1.0,
    sentiment: 0.25,
    unknown: 0.5,
  },

  // ============================================================
  // AI 联网搜索(仅紧急信号触发)
  // ============================================================
  SEARCH_PROVIDER: "serper",
  SEARCH_MAX_RESULTS: 5,

  // ============================================================
  // 推送策略 (Push Config)
  // ============================================================
  SERVERCHAN_DAILY_LIMIT: 5,
  BRIEFING_ENABLED: true,
  BRIEFING_TIME_HOUR: 9,
  URGENT_PUSH_ENABLED: true,
  BREAKING_PUSH_ENABLED: true,
  BREAKING_MAX_PER_ROUND: 5,

  // ============================================================
  // 运行节奏 (Scan Intervals, 分钟)
  // ============================================================
  SCAN_INTERVAL_MINUTES: 10,
  SCAN_INTERVAL_CRYPTO: 10,
  SCAN_INTERVAL_STOCK: 60,
  SCAN_INTERVAL_MACRO: 60,
  SCAN_INTERVAL_NEWS: 20,
  SCAN_INTERVAL_ONCHAIN: 20,
  SCAN_INTERVAL_DERIVATIVES: 20,
  SCAN_INTERVAL_LINKAGE: 60,
  SCAN_INTERVAL_CALENDAR: 10,

  // ============================================================
  // 信号准确率追踪 (Performance Config)
  // ============================================================
  PERFORMANCE_ENABLED: true,
  PERFORMANCE_CHECK_HOURS: 24,
  PERFORMANCE_CORRECT_THRESHOLD: 0.5,
  PERFORMANCE_CHECK_INTERVAL: 3600,

  // ============================================================
  // 自定义关注列表 / 自定义监控币种
  // ============================================================
  WATCHLIST_CRYPTO_PRICE_CHANGE_PCT: 3.0,
  WATCHLIST_STOCK_PRICE_CHANGE_PCT: 1.5,
  CUSTOM_CRYPTO_SYMBOLS: ["BTC", "ETH", "SOL", "SUI", "DOGE", "TAO", "ORDI"],

  // ============================================================
  // 信号疲劳管理 (Fatigue Config)
  // ============================================================
  FATIGUE_ENABLED: true,
  FATIGUE_HALF_LIFE: 14400,
  FATIGUE_THRESHOLD: 5,
  FATIGUE_FLOOR: 0.3,

  // ============================================================
  // 跨标的优先级排队 (Alert Caps)
  // ============================================================
  ALERT_CAP_TOTAL: 6,
  ALERT_CAP_CRYPTO: 3,
  ALERT_CAP_STOCK: 2,
  ALERT_CAP_MACRO: 1,

  // ============================================================
  // 波动率 Regime 追踪 (Volatility Thresholds)
  // ============================================================
  VOLATILITY_ENABLED: true,
  VOLATILITY_VIX_LOW: 15,
  VOLATILITY_VIX_HIGH: 25,
  VOLATILITY_BTC_LOW: 2.0,
  VOLATILITY_BTC_HIGH: 5.0,
  VOLATILITY_CACHE_TTL: 300,

  // ============================================================
  // 扫描预算自适应 (Budget Adaptive Config)
  // ============================================================
  BUDGET_ENABLED: true,
  BUDGET_INTERVAL_MULTIPLIERS: { low: 1.5, medium: 1.0, high: 0.6 },
  BUDGET_CAP_MULTIPLIERS: { low: 0.7, medium: 1.0, high: 1.5 },

  // ============================================================
  // 冷启动加速 (Cold Start Config)
  // ============================================================
  COLD_START_ENABLED: true,
  COLD_START_WINDOW: 180,
  COLD_START_BURST_COUNT: 3,
  COLD_START_INTERVAL_OVERRIDE: 2,
  COLD_START_SEQUENTIAL: true,

  // ============================================================
  // AI 提供商选择 (defaults, actual keys from env)
  // ============================================================
  AI_PROVIDER: "deepseek",
  AI_MODEL: "deepseek-chat",

  // ============================================================
  // 新闻关键词 (News Keywords)
  // ============================================================
  NEWS_KEYWORDS_BY_CATEGORY: {
    "加密货币": [
      "SEC", "破产", "收购", "并购", "ETF批准", "ETF approved",
      "退市", "hack", "exploit", "黑客", "监管", "regulation",
      "lawsuit", "诉讼", "delisting", "下架", "rug pull", "depeg",
      "脱锚", "bankruptcy", "liquidation", "清算", "halving", "减半",
      "网络升级", "hard fork", "airdrop", "空投", "token", "代币",
      "wallet", "钱包", "mining", "挖矿", "staking", "质押",
    ],
    "政治": [
      "election", "sanction", "tariff", "trade war", "NATO",
      "United Nations", "congress", "parliament", "summit",
      "diplomacy", "制裁", "大选", "关税", "外交", "峰会",
      "议案", "立法", "总统", "议会", "法案", "negotiation",
    ],
    "军事": [
      "conflict", "war", "military", "missile", "defense",
      "navy", "army", "ceasefire", "invasion", "strike",
      "冲突", "战争", "军事", "导弹", "国防", "入侵", "打击",
      "演习", "部队", "武器", "weapon", "troop", "drone",
    ],
    "金融": [
      "interest rate", "inflation", "GDP", "unemployment",
      "non-farm", "central bank", "monetary policy", "recession",
      "bond", "yield", "利率", "通胀", "GDP", "非农", "央行",
      "衰退", "降息", "加息", "cpi", "ppi", "PMI",
      "就业", "制造业", "服务业", "消费者信心",
    ],
  },

  // 合并所有关键词(用于扫描匹配,保持向下兼容)
  get NEWS_KEYWORDS() {
    return Object.values(this.NEWS_KEYWORDS_BY_CATEGORY).flat();
  },

  // 突发新闻关键词(命中直接推送)
  BREAKING_KEYWORDS: [
    // ---- 地缘冲突 ----
    "war", "invasion", "ceasefire", "sanction",
    "attack", "strike", "missile",
    "战争", "入侵", "制裁", "袭击", "导弹",
    // ---- 金融风险 ----
    "rate hike", "rate cut", "interest rate decision",
    "加息", "降息",
    "collapse", "default", "bank run", "bailout",
    "崩盘", "违约", "挤兑", "救助", "暴跌",
    "crash", "emergency",
    // ---- 监管行动 ----
    "ban", "crackdown",
    "禁止", "打击",
    // ---- 重大灾害 ----
    "explosion", "earthquake",
    "爆炸", "地震",
  ],

  // ============================================================
  // 重大事件清单 (2020 ~ 2026) — from analytics/timeline.py
  // ============================================================
  MAJOR_EVENTS: [
    // 2020
    { date: "2020-01-03", name: "美军击杀苏莱曼尼", type: "geopolitical" },
    { date: "2020-01-09", name: "中国报告首例新冠死亡", type: "geopolitical" },
    { date: "2020-01-30", name: "WHO宣布PHEIC", type: "geopolitical" },
    { date: "2020-03-03", name: "Fed紧急降息50bp", type: "macro" },
    { date: "2020-03-11", name: "WHO宣布新冠大流行", type: "geopolitical" },
    { date: "2020-03-15", name: "Fed紧急降息至0+QE", type: "macro" },
    { date: "2020-04-20", name: "WTI原油期货负值", type: "macro" },
    { date: "2020-05-12", name: "BTC第三次减半", type: "crypto" },
    { date: "2020-07-21", name: "欧盟复苏基金协议", type: "macro" },
    { date: "2020-08-27", name: "鲍威尔宣布平均通胀目标", type: "macro" },
    { date: "2020-10-05", name: "特朗普确诊新冠", type: "geopolitical" },
    { date: "2020-11-03", name: "美国大选", type: "geopolitical" },
    { date: "2020-11-09", name: "辉瑞疫苗宣布", type: "macro" },
    { date: "2020-12-16", name: "FOMC维持利率+指引", type: "macro" },
    // 2021
    { date: "2021-01-06", name: "国会山骚乱", type: "geopolitical" },
    { date: "2021-02-08", name: "特斯拉买入$15亿BTC", type: "crypto" },
    { date: "2021-03-11", name: "拜登签署$1.9万亿刺激", type: "macro" },
    { date: "2021-04-14", name: "Coinbase纳斯达克上市", type: "crypto" },
    { date: "2021-05-12", name: "CPI大超预期(4.2%)", type: "macro" },
    { date: "2021-05-19", name: "中国全面封杀加密货币", type: "crypto" },
    { date: "2021-06-16", name: "FOMC暗示2023年加息", type: "macro" },
    { date: "2021-09-22", name: "FOMC暗示Taper", type: "macro" },
    { date: "2021-10-19", name: "BTC期货ETF上市", type: "crypto" },
    { date: "2021-11-10", name: "BTC历史新高$69K", type: "crypto" },
    { date: "2021-11-30", name: "鲍威尔放弃通胀暂时论", type: "macro" },
    { date: "2021-12-15", name: "FOMC加速Taper", type: "macro" },
    // 2022
    { date: "2022-01-05", name: "FOMC纪要转鹰", type: "macro" },
    { date: "2022-02-24", name: "俄乌战争爆发", type: "geopolitical" },
    { date: "2022-03-16", name: "Fed首次加息25bp", type: "macro" },
    { date: "2022-05-04", name: "Fed加息50bp", type: "macro" },
    { date: "2022-05-12", name: "LUNA归零", type: "crypto" },
    { date: "2022-06-10", name: "CPI 8.6%创40年新高", type: "macro" },
    { date: "2022-06-15", name: "Fed加息75bp", type: "macro" },
    { date: "2022-07-13", name: "CPI 9.1%峰值", type: "macro" },
    { date: "2022-07-27", name: "Fed加息75bp", type: "macro" },
    { date: "2022-08-15", name: "ETH合并完成", type: "crypto" },
    { date: "2022-09-21", name: "Fed加息75bp", type: "macro" },
    { date: "2022-11-02", name: "Fed加息75bp", type: "macro" },
    { date: "2022-11-11", name: "FTX申请破产", type: "crypto" },
    { date: "2022-11-22", name: "BTC跌至$15.5K底部", type: "crypto" },
    { date: "2022-12-14", name: "Fed加息50bp", type: "macro" },
    // 2023
    { date: "2023-03-10", name: "硅谷银行SVB倒闭", type: "macro" },
    { date: "2023-03-22", name: "Fed加息25bp", type: "macro" },
    { date: "2023-05-03", name: "Fed最后一次加息25bp", type: "macro" },
    { date: "2023-06-15", name: "贝莱德申请BTC现货ETF", type: "crypto" },
    { date: "2023-07-13", name: "XRP胜诉SEC", type: "crypto" },
    { date: "2023-08-17", name: "BTC跌至$25K", type: "crypto" },
    { date: "2023-10-16", name: "BTC突破$30K(ETF预期)", type: "crypto" },
    { date: "2023-12-13", name: "Fed鸽派指引", type: "macro" },
    // 2024
    { date: "2024-01-10", name: "BTC现货ETF获批", type: "crypto" },
    { date: "2024-01-28", name: "美军基地遇袭致3死", type: "geopolitical" },
    { date: "2024-02-07", name: "美军空袭伊拉克叙利亚", type: "geopolitical" },
    { date: "2024-03-13", name: "BTC突破$73K历史新高", type: "crypto" },
    { date: "2024-04-13", name: "伊朗首次直接攻击以色列", type: "geopolitical" },
    { date: "2024-04-20", name: "BTC第四次减半", type: "crypto" },
    { date: "2024-05-23", name: "ETH现货ETF获批", type: "crypto" },
    { date: "2024-08-05", name: "日元carry trade平仓暴跌", type: "macro" },
    { date: "2024-09-18", name: "Fed降息50bp", type: "macro" },
    { date: "2024-10-01", name: "伊朗导弹袭击以色列", type: "geopolitical" },
    { date: "2024-10-31", name: "BTC突破$72K", type: "crypto" },
    { date: "2024-11-05", name: "美国大选", type: "geopolitical" },
    { date: "2024-11-06", name: "BTC突破$75K(Trump胜选)", type: "crypto" },
    { date: "2024-11-29", name: "BTC突破$100K", type: "crypto" },
    { date: "2024-12-18", name: "FOMC降息25bp+鹰派指引", type: "macro" },
    { date: "2024-12-31", name: "BTC收于$94K", type: "crypto" },
    // 2025
    { date: "2025-01-20", name: "Trump就职", type: "geopolitical" },
    { date: "2025-01-27", name: "DeepSeek冲击全球AI板块", type: "macro" },
    { date: "2025-01-29", name: "FOMC利率决议", type: "macro" },
    { date: "2025-03-19", name: "FOMC利率决议", type: "macro" },
    { date: "2025-04-02", name: "美国对等关税公布", type: "macro" },
    { date: "2025-04-09", name: "美国对华关税升至104%", type: "macro" },
    { date: "2025-04-12", name: "美伊核谈判启动(阿曼)", type: "geopolitical" },
    { date: "2025-04-26", name: "美伊第二轮核谈判(罗马)", type: "geopolitical" },
    { date: "2025-05-07", name: "FOMC利率决议", type: "macro" },
    { date: "2025-05-17", name: "美伊第三轮核谈判(日内瓦)", type: "geopolitical" },
    { date: "2025-06-18", name: "FOMC利率决议", type: "macro" },
    { date: "2025-06-30", name: "伊朗浓缩铀丰度突破60%", type: "geopolitical" },
    { date: "2025-07-14", name: "美伊核谈判取得框架进展", type: "geopolitical" },
    { date: "2025-07-30", name: "FOMC利率决议", type: "macro" },
    { date: "2025-09-12", name: "IAEA通过伊朗核问题决议", type: "geopolitical" },
    { date: "2025-09-17", name: "FOMC利率决议(含点阵图)", type: "macro" },
    { date: "2025-10-18", name: "美伊核协议草案达成", type: "geopolitical" },
    { date: "2025-11-04", name: "FOMC利率决议", type: "macro" },
    { date: "2025-12-01", name: "伊朗签署临时核协议", type: "geopolitical" },
    { date: "2025-12-17", name: "FOMC利率决议(含点阵图)", type: "macro" },
    // 2026
    { date: "2026-01-07", name: "美伊核协议生效实施", type: "geopolitical" },
    { date: "2026-01-28", name: "FOMC利率决议", type: "macro" },
    { date: "2026-02-10", name: "美国部分解除对伊制裁", type: "geopolitical" },
    { date: "2026-03-03", name: "伊朗重返国际石油市场", type: "macro" },
    { date: "2026-03-18", name: "FOMC利率决议(含点阵图)", type: "macro" },
    { date: "2026-04-07", name: "美国中期选举初选", type: "geopolitical" },
    { date: "2026-04-25", name: "IAEA确认伊朗履行核协议", type: "geopolitical" },
    { date: "2026-05-06", name: "FOMC利率决议", type: "macro" },
    { date: "2026-05-20", name: "美伊正式签署全面核协议", type: "geopolitical" },
    { date: "2026-06-10", name: "美国5月CPI", type: "macro" },
    { date: "2026-06-17", name: "FOMC利率决议", type: "macro" },
    // 未来事件
    { date: "2026-07-01", name: "美国Q2 GDP初值", type: "macro" },
    { date: "2026-07-16", name: "美国6月CPI", type: "macro" },
    { date: "2026-07-29", name: "FOMC利率决议", type: "macro" },
    { date: "2026-09-16", name: "FOMC利率决议(含点阵图)", type: "macro" },
    { date: "2026-10-15", name: "美国中期选举", type: "geopolitical" },
    { date: "2026-11-05", name: "FOMC利率决议", type: "macro" },
    { date: "2026-12-16", name: "FOMC利率决议(含点阵图)", type: "macro" },
  ],

  // ============================================================
  // Fed 利率关键变动 (上限, %) — from analytics/timeline.py
  // ============================================================
  FED_RATES: [
    { date: "2020-01-01", rate: 1.75 },
    { date: "2020-03-03", rate: 1.25 },
    { date: "2020-03-15", rate: 0.25 },
    { date: "2022-03-16", rate: 0.50 },
    { date: "2022-05-04", rate: 1.00 },
    { date: "2022-06-15", rate: 1.75 },
    { date: "2022-07-27", rate: 2.50 },
    { date: "2022-09-21", rate: 3.25 },
    { date: "2022-11-02", rate: 4.00 },
    { date: "2022-12-14", rate: 4.50 },
    { date: "2023-02-01", rate: 4.75 },
    { date: "2023-03-22", rate: 5.00 },
    { date: "2023-05-03", rate: 5.25 },
    { date: "2023-07-26", rate: 5.50 },
    { date: "2024-09-18", rate: 5.25 },
    { date: "2024-11-07", rate: 5.00 },
    { date: "2024-12-18", rate: 4.50 },
    { date: "2025-01-29", rate: 4.50 },
    { date: "2025-03-19", rate: 4.50 },
    { date: "2025-05-07", rate: 4.50 },
    { date: "2025-06-18", rate: 4.50 },
    { date: "2026-01-28", rate: 4.50 },
    { date: "2026-03-18", rate: 4.50 },
    { date: "2026-05-06", rate: 4.50 },
    { date: "2026-06-17", rate: 4.50 },
  ],

  // ============================================================
  // 已知区块链地址标签库 (Known Addresses)
  // — from core/known_addresses.py
  // 运行时从 data/known_addresses.json 加载,此处保留结构占位
  // 前端可通过 /api/known-addresses 获取完整数据
  // ============================================================
  KNOWN_ADDRESSES: {
    // 地址标签在 data/known_addresses.json 中维护
    // 格式: { "BTC": { "地址": "标签" }, "ETH": { "地址": "标签" } }
    _bookPath: "data/known_addresses.json",
    label(chain, address) {
      const chainBook = this[chain.toUpperCase()] || {};
      const addrLower = address.toLowerCase();
      for (const [key, lbl] of Object.entries(chainBook)) {
        if (key.toLowerCase() === addrLower) return lbl;
      }
      return null;
    },
  },

});

export { CONFIG };
export default CONFIG;
