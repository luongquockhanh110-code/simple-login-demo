// @ts-nocheck
import { SourceHealth } from './store';

/**
 * data.js — Unified data fetching layer (replaces Python HTTP clients).
 *
 * Mirrors all API calls from:
 *   connector.py, analytics/timeline.py, analytics/volatility.py,
 *   analytics/correlation.py, scanners/scanner.py, scanners/onchain.py,
 *   scanners/derivatives.py, scanners/macro.py, scanners/sentiment.py,
 *   scanners/narrative.py
 *
 * Uses the EXACT same API URLs, with browser-compatible CORS proxying
 * for endpoints that block cross-origin requests (Yahoo Finance, FRED, RSS).
 */

/* ================================================================
 * 1. Cached Fetch Wrapper (replaces connector.py Connector class)
 * ================================================================ */

const _cache = new Map();

/**
 * Fetch JSON with in-memory TTL cache, retry on failure, and source health tracking.
 * @param {string}  url            Request URL
 * @param {object}  [options={}]   fetch() options
 * @param {number}  [ttl=60]       Cache TTL in seconds
 * @param {string}  [sourceName]   Source name for health tracking
 * @returns {Promise<any|null>}    Parsed JSON or null on failure
 */
async function cachedFetch(url, options = {}, ttl = 60, sourceName = null) {
  const key = url + JSON.stringify(options);
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.ts < ttl * 1000) return cached.data;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(url, {
        ...options,
        headers: {
          'Accept': 'application/json, text/plain, */*',
          ...(options.headers || {}),
        },
      });
      if (resp.status === 429) {
        // Rate limited — don't retry, don't mark failure
        console.warn(`[cachedFetch] 429 rate limited: ${url}`);
        return null;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      _cache.set(key, { data, ts: Date.now() });
      if (sourceName && typeof SourceHealth !== 'undefined') {
        SourceHealth.recordSuccess(sourceName);
      }
      return data;
    } catch (e) {
      if (attempt === 0) {
        await _sleep(1000);
        continue;
      }
      console.warn(`[cachedFetch] Failed ${url}:`, e.message);
      if (sourceName && typeof SourceHealth !== 'undefined') {
        SourceHealth.recordFailure(sourceName);
      }
      return null;
    }
  }
  return null;
}

/**
 * Fetch raw text (for XML/RSS/HTML), no caching.
 * @param {string}  url
 * @param {string}  [sourceName]
 * @returns {Promise<string|null>}
 */
async function fetchText(url, sourceName = null) {
  try {
    const resp = await fetch(url, {
      headers: { 'Accept': 'text/xml, application/rss+xml, text/html, */*' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    if (sourceName && typeof SourceHealth !== 'undefined') {
      SourceHealth.recordSuccess(sourceName);
    }
    return await resp.text();
  } catch (e) {
    console.warn(`[fetchText] Failed ${url}:`, e.message);
    if (sourceName && typeof SourceHealth !== 'undefined') {
      SourceHealth.recordFailure(sourceName);
    }
    return null;
  }
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


/* ================================================================
 * 2. CORS Proxy Helper
 * ================================================================ */

const CORS_PROXY = 'https://corsproxy.io/?';

function proxyUrl(url) {
  return CORS_PROXY + encodeURIComponent(url);
}


/* ================================================================
 * 3. Major Events & Fed Rate Data (from timeline.py)
 * ================================================================ */

const _MAJOR_EVENTS = [
  // 2020
  ["2020-01-03","美军击杀苏莱曼尼","geopolitical"],
  ["2020-01-09","中国报告首例新冠死亡","geopolitical"],
  ["2020-01-30","WHO宣布PHEIC","geopolitical"],
  ["2020-03-03","Fed紧急降息50bp","macro"],
  ["2020-03-11","WHO宣布新冠大流行","geopolitical"],
  ["2020-03-15","Fed紧急降息至0+QE","macro"],
  ["2020-04-20","WTI原油期货负值","macro"],
  ["2020-05-12","BTC第三次减半","crypto"],
  ["2020-07-21","欧盟复苏基金协议","macro"],
  ["2020-08-27","鲍威尔宣布平均通胀目标","macro"],
  ["2020-10-05","特朗普确诊新冠","geopolitical"],
  ["2020-11-03","美国大选","geopolitical"],
  ["2020-11-09","辉瑞疫苗宣布","macro"],
  ["2020-12-16","FOMC维持利率+指引","macro"],
  // 2021
  ["2021-01-06","国会山骚乱","geopolitical"],
  ["2021-02-08","特斯拉买入$15亿BTC","crypto"],
  ["2021-03-11","拜登签署$1.9万亿刺激","macro"],
  ["2021-04-14","Coinbase纳斯达克上市","crypto"],
  ["2021-05-12","CPI大超预期(4.2%)","macro"],
  ["2021-05-19","中国全面封杀加密货币","crypto"],
  ["2021-06-16","FOMC暗示2023年加息","macro"],
  ["2021-09-22","FOMC暗示Taper","macro"],
  ["2021-10-19","BTC期货ETF上市","crypto"],
  ["2021-11-10","BTC历史新高$69K","crypto"],
  ["2021-11-30","鲍威尔放弃通胀暂时论","macro"],
  ["2021-12-15","FOMC加速Taper","macro"],
  // 2022
  ["2022-01-05","FOMC纪要转鹰","macro"],
  ["2022-02-24","俄乌战争爆发","geopolitical"],
  ["2022-03-16","Fed首次加息25bp","macro"],
  ["2022-05-04","Fed加息50bp","macro"],
  ["2022-05-12","LUNA归零","crypto"],
  ["2022-06-10","CPI 8.6%创40年新高","macro"],
  ["2022-06-15","Fed加息75bp","macro"],
  ["2022-07-13","CPI 9.1%峰值","macro"],
  ["2022-07-27","Fed加息75bp","macro"],
  ["2022-08-15","ETH合并完成","crypto"],
  ["2022-09-21","Fed加息75bp","macro"],
  ["2022-11-02","Fed加息75bp","macro"],
  ["2022-11-11","FTX申请破产","crypto"],
  ["2022-11-22","BTC跌至$15.5K底部","crypto"],
  ["2022-12-14","Fed加息50bp","macro"],
  // 2023
  ["2023-03-10","硅谷银行SVB倒闭","macro"],
  ["2023-03-22","Fed加息25bp","macro"],
  ["2023-05-03","Fed最后一次加息25bp","macro"],
  ["2023-06-15","贝莱德申请BTC现货ETF","crypto"],
  ["2023-07-13","XRP胜诉SEC","crypto"],
  ["2023-08-17","BTC跌至$25K","crypto"],
  ["2023-10-16","BTC突破$30K(ETF预期)","crypto"],
  ["2023-12-13","Fed鸽派指引","macro"],
  // 2024
  ["2024-01-10","BTC现货ETF获批","crypto"],
  ["2024-01-28","美军基地遇袭致3死","geopolitical"],
  ["2024-02-07","美军空袭伊拉克叙利亚","geopolitical"],
  ["2024-03-13","BTC突破$73K历史新高","crypto"],
  ["2024-04-13","伊朗首次直接攻击以色列","geopolitical"],
  ["2024-04-20","BTC第四次减半","crypto"],
  ["2024-05-23","ETH现货ETF获批","crypto"],
  ["2024-08-05","日元carry trade平仓暴跌","macro"],
  ["2024-09-18","Fed降息50bp","macro"],
  ["2024-10-01","伊朗导弹袭击以色列","geopolitical"],
  ["2024-10-31","BTC突破$72K","crypto"],
  ["2024-11-05","美国大选","geopolitical"],
  ["2024-11-06","BTC突破$75K(Trump胜选)","crypto"],
  ["2024-11-29","BTC突破$100K","crypto"],
  ["2024-12-18","FOMC降息25bp+鹰派指引","macro"],
  ["2024-12-31","BTC收于$94K","crypto"],
  // 2025
  ["2025-01-20","Trump就职","geopolitical"],
  ["2025-01-27","DeepSeek冲击全球AI板块","macro"],
  ["2025-01-29","FOMC利率决议","macro"],
  ["2025-03-19","FOMC利率决议","macro"],
  ["2025-04-02","美国对等关税公布","macro"],
  ["2025-04-09","美国对华关税升至104%","macro"],
  ["2025-04-12","美伊核谈判启动(阿曼)","geopolitical"],
  ["2025-04-26","美伊第二轮核谈判(罗马)","geopolitical"],
  ["2025-05-07","FOMC利率决议","macro"],
  ["2025-05-17","美伊第三轮核谈判(日内瓦)","geopolitical"],
  ["2025-06-18","FOMC利率决议","macro"],
  ["2025-06-30","伊朗浓缩铀丰度突破60%","geopolitical"],
  ["2025-07-14","美伊核谈判取得框架进展","geopolitical"],
  ["2025-07-30","FOMC利率决议","macro"],
  ["2025-09-12","IAEA通过伊朗核问题决议","geopolitical"],
  ["2025-09-17","FOMC利率决议(含点阵图)","macro"],
  ["2025-10-18","美伊核协议草案达成","geopolitical"],
  ["2025-11-04","FOMC利率决议","macro"],
  ["2025-12-01","伊朗签署临时核协议","geopolitical"],
  ["2025-12-17","FOMC利率决议(含点阵图)","macro"],
  // 2026
  ["2026-01-07","美伊核协议生效实施","geopolitical"],
  ["2026-01-28","FOMC利率决议","macro"],
  ["2026-02-10","美国部分解除对伊制裁","geopolitical"],
  ["2026-03-03","伊朗重返国际石油市场","macro"],
  ["2026-03-18","FOMC利率决议(含点阵图)","macro"],
  ["2026-04-07","美国中期选举初选","geopolitical"],
  ["2026-04-25","IAEA确认伊朗履行核协议","geopolitical"],
  ["2026-05-06","FOMC利率决议","macro"],
  ["2026-05-20","美伊正式签署全面核协议","geopolitical"],
  ["2026-06-10","美国5月CPI","macro"],
  ["2026-06-17","FOMC利率决议","macro"],
  // Future events
  ["2026-07-01","美国Q2 GDP初值","macro"],
  ["2026-07-16","美国6月CPI","macro"],
  ["2026-07-29","FOMC利率决议","macro"],
  ["2026-09-16","FOMC利率决议(含点阵图)","macro"],
  ["2026-10-15","美国中期选举","geopolitical"],
  ["2026-11-05","FOMC利率决议","macro"],
  ["2026-12-16","FOMC利率决议(含点阵图)","macro"],
];

// Fed rate key changes (upper bound, %)
const _FED_RATES = [
  ["2020-01-01", 1.75],
  ["2020-03-03", 1.25],
  ["2020-03-15", 0.25],
  ["2022-03-16", 0.50],
  ["2022-05-04", 1.00],
  ["2022-06-15", 1.75],
  ["2022-07-27", 2.50],
  ["2022-09-21", 3.25],
  ["2022-11-02", 4.00],
  ["2022-12-14", 4.50],
  ["2023-02-01", 4.75],
  ["2023-03-22", 5.00],
  ["2023-05-03", 5.25],
  ["2023-07-26", 5.50],
  ["2024-09-18", 5.25],
  ["2024-11-07", 5.00],
  ["2024-12-18", 4.50],
  ["2025-01-29", 4.50],
  ["2025-03-19", 4.50],
  ["2025-05-07", 4.50],
  ["2025-06-18", 4.50],
  ["2026-01-28", 4.50],
  ["2026-03-18", 4.50],
  ["2026-05-06", 4.50],
  ["2026-06-17", 4.50],
];

// BTC mock price anchors (fallback when all sources fail)
const _MOCK_BTC_ANCHORS = {
  "2020-01-01": 7200, "2020-03-13": 3800, "2020-05-12": 8800,
  "2020-07-01": 9200, "2020-10-01": 10800, "2020-12-31": 29000,
  "2021-01-08": 42000, "2021-02-16": 50000, "2021-04-14": 64000,
  "2021-05-19": 30000, "2021-06-20": 33000, "2021-07-21": 30000,
  "2021-10-20": 66000, "2021-11-10": 69000, "2022-01-05": 43000,
  "2022-02-24": 35000, "2022-05-12": 26000, "2022-06-17": 17600,
  "2022-11-09": 16000, "2022-11-22": 15500, "2023-01-10": 17500,
  "2023-03-14": 26000, "2023-06-15": 31000, "2023-10-16": 27000,
  "2023-12-20": 44000, "2024-01-10": 49000, "2024-03-13": 73000,
  "2024-04-20": 66000, "2024-08-05": 50000, "2024-09-18": 63000,
  "2024-11-06": 76000, "2024-11-29": 100000, "2024-12-31": 94000,
  "2025-01-20": 105000, "2025-03-19": 87000, "2025-06-01": 95000,
};


/* ================================================================
 * 4. DataAPI — All data fetching functions
 * ================================================================ */

const DataAPI = {

  /* --------------------------------------------------------------
   * BTC History — CoinGecko → Binance → mock data
   * Source: analytics/timeline.py  get_btc_history() / _fetch_btc_impl()
   * -------------------------------------------------------------- */
  async fetchBTCHistory() {
    const CUTOFF = 1577836800; // 2020-01-01 UTC

    // 1. Try CoinGecko market_chart (same URL as Python _cg_api)
    try {
      const cg = await cachedFetch(
        'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=max',
        {}, 3600, 'coingecko'
      );
      if (cg && cg.prices && cg.prices.length > 0) {
        const result = cg.prices
          .map(p => ({ date: Math.floor(p[0] / 1000), price: Math.round(p[1] * 100) / 100 }))
          .filter(r => r.date >= CUTOFF);
        if (result.length > 0) return result;
      }
    } catch (e) {
      console.warn('[fetchBTCHistory] CoinGecko failed:', e.message);
    }

    // 2. Fallback: Binance klines (same URL as Python _binance_btc)
    try {
      const result = [];
      let startTime = 1577836800000; // 2020-01-01 UTC ms
      const limit = 1000;
      while (true) {
        const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&startTime=${startTime}&limit=${limit}`;
        const data = await cachedFetch(url, {}, 3600, 'binance');
        if (!data || !Array.isArray(data) || data.length === 0) break;
        for (const k of data) {
          result.push({
            date: Math.floor(k[0] / 1000),
            price: Math.round(parseFloat(k[4]) * 100) / 100,
          });
        }
        if (data.length < limit) break;
        startTime = data[data.length - 1][6] + 1; // next kline
        await _sleep(300);
      }
      const filtered = result.filter(r => r.date >= CUTOFF);
      if (filtered.length > 0) return filtered;
    } catch (e) {
      console.warn('[fetchBTCHistory] Binance failed:', e.message);
    }

    // 3. Mock data (same as Python _mock_btc)
    return this._generateMockBTC();
  },

  /**
   * Generate mock BTC history via linear interpolation between key anchors.
   * Mirrors timeline.py _mock_btc().
   */
  _generateMockBTC() {
    const anchors = Object.entries(_MOCK_BTC_ANCHORS).sort((a, b) => a[0].localeCompare(b[0]));
    const keys = anchors.map(a => a[0]);
    const vals = anchors.map(a => a[1]);
    const mock = [];
    const start = new Date('2020-01-01T00:00:00Z');
    const end = new Date();
    const current = new Date(start);

    while (current <= end) {
      const ds = current.toISOString().slice(0, 10);
      let price;
      // bisect_left equivalent
      let idx = keys.findIndex(k => k >= ds);
      if (idx === -1) {
        price = vals[vals.length - 1];
      } else if (idx === 0) {
        price = keys[0] === ds ? vals[0] : vals[0];
      } else if (keys[idx] === ds) {
        price = vals[idx];
      } else {
        // Linear interpolation
        const x0 = new Date(keys[idx - 1] + 'T00:00:00Z');
        const x1 = new Date(keys[idx] + 'T00:00:00Z');
        const daysDiff = Math.max((x1 - x0) / 86400000, 1);
        const ratio = (current - x0) / 86400000 / daysDiff;
        price = Math.round((vals[idx - 1] + (vals[idx] - vals[idx - 1]) * ratio) * 100) / 100;
      }
      const ts = Math.floor(current.getTime() / 1000);
      mock.push({ date: ts, price });
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return mock;
  },


  /* --------------------------------------------------------------
   * Yahoo Finance — via CORS proxy
   * Source: analytics/timeline.py  _yh_api(symbol)
   * URL: https://query1.finance.yahoo.com/v8/finance/chart/{symbol}
   * -------------------------------------------------------------- */
  async fetchYahoo(symbol, range5d = false) {
    const baseUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
    const params = range5d
      ? `?interval=1d&range=5d`
      : `?period1=1577836800&period2=${Math.floor(Date.now() / 1000)}&interval=1d`;
    const url = proxyUrl(baseUrl + params);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await fetch(url);
        if (resp.status === 429) {
          const wait = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          console.warn(`[fetchYahoo] ${symbol} rate limited, retry in ${(wait / 1000).toFixed(1)}s`);
          await _sleep(wait);
          continue;
        }
        if (!resp.ok) {
          // Fallback: try range=max (same as Python fallback logic)
          if (!range5d) {
            const fallbackUrl = proxyUrl(baseUrl + '?range=max&interval=1d');
            const resp2 = await fetch(fallbackUrl);
            if (!resp2.ok) return null;
            const data2 = await resp2.json();
            return this._parseYahooChart(data2);
          }
          return null;
        }
        const data = await resp.json();
        if (typeof SourceHealth !== 'undefined') SourceHealth.recordSuccess('yahoo');
        return this._parseYahooChart(data);
      } catch (e) {
        console.warn(`[fetchYahoo] ${symbol} attempt ${attempt + 1}/3 failed:`, e.message);
        if (attempt < 2) {
          await _sleep(Math.pow(2, attempt) * 1000 + Math.random() * 1000);
        }
      }
    }
    if (typeof SourceHealth !== 'undefined') SourceHealth.recordFailure('yahoo');
    return null;
  },

  /** Parse Yahoo Finance v8 chart JSON → [{date, close}] */
  _parseYahooChart(data) {
    try {
      const result = ((data.chart || {}).result || [null])[0];
      if (!result) return null;
      const timestamps = result.timestamp || [];
      const quotes = ((result.indicators || {}).quote || [{}])[0];
      const closes = quotes.close || [];
      const out = [];
      for (let i = 0; i < timestamps.length; i++) {
        const close = closes[i];
        if (close != null && close > 0) {
          out.push({ date: timestamps[i], close: Math.round(close * 100) / 100 });
        }
      }
      return out;
    } catch (e) {
      return null;
    }
  },


  /* --------------------------------------------------------------
   * Asset History functions — Yahoo Finance wrappers
   * Source: analytics/timeline.py  get_dxy_history(), etc.
   * Cache TTL: 3600s (1 hour, matching Python _CACHE_TTL)
   * -------------------------------------------------------------- */
  async fetchDXYHistory() {
    // DX-Y.NYB — DXY US Dollar Index
    const data = await this.fetchYahoo('DX-Y.NYB');
    if (!data) return [];
    const CUTOFF = 1577836800;
    return data.filter(d => d.date >= CUTOFF).map(d => ({ date: d.date, price: d.close }));
  },

  async fetchTreasuryHistory() {
    // ^TNX — 10Y US Treasury Yield
    const data = await this.fetchYahoo('^TNX');
    if (!data) return [];
    const CUTOFF = 1577836800;
    return data.filter(d => d.date >= CUTOFF).map(d => ({ date: d.date, yield: d.close }));
  },

  async fetchGoldHistory() {
    // GC=F — Gold Futures
    const data = await this.fetchYahoo('GC=F');
    if (!data) return [];
    const CUTOFF = 1577836800;
    return data.filter(d => d.date >= CUTOFF).map(d => ({ date: d.date, price: d.close }));
  },

  async fetchOilHistory() {
    // CL=F — WTI Crude Oil Futures
    const data = await this.fetchYahoo('CL=F');
    if (!data) return [];
    const CUTOFF = 1577836800;
    return data.filter(d => d.date >= CUTOFF).map(d => ({ date: d.date, price: d.close }));
  },

  async fetchNasdaqHistory() {
    // ^IXIC — Nasdaq Composite
    const data = await this.fetchYahoo('^IXIC');
    if (!data) return [];
    const CUTOFF = 1577836800;
    return data.filter(d => d.date >= CUTOFF).map(d => ({ date: d.date, price: d.close }));
  },


  /* --------------------------------------------------------------
   * VIX — Yahoo ^VIX via CORS proxy
   * Source: analytics/volatility.py  _get_vix()
   * URL: https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX
   * -------------------------------------------------------------- */
  async fetchVIX() {
    try {
      const url = proxyUrl(
        'https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d'
      );
      const data = await cachedFetch(url, {}, 15, 'yahoo');
      if (!data) return null;
      const quotes = ((data.chart || {}).result || [{}])[0];
      const closes = ((quotes.indicators || {}).quote || [{}])[0].close || [];
      const valid = closes.filter(c => c != null);
      return valid.length > 0 ? valid[valid.length - 1] : null;
    } catch (e) {
      console.warn('[fetchVIX] Failed:', e.message);
      return null;
    }
  },


  /* --------------------------------------------------------------
   * BTC 24h Change — Binance 24hr ticker
   * Source: analytics/volatility.py  _get_btc_change_24h()
   * URL: https://api.binance.com/api/v3/ticker/24hr
   * -------------------------------------------------------------- */
  async fetchBTC24hChange() {
    try {
      const data = await cachedFetch(
        'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT',
        {}, 30, 'binance'
      );
      if (!data) return null;
      return parseFloat(data.priceChangePercent || '0');
    } catch (e) {
      console.warn('[fetchBTC24hChange] Failed:', e.message);
      return null;
    }
  },


  /* --------------------------------------------------------------
   * Binance Klines — for any symbol
   * Source: analytics/correlation.py  _binance_klines(symbol, days)
   * URL: https://api.binance.com/api/v3/klines
   * -------------------------------------------------------------- */
  async fetchBinanceKlines(symbol, days = 90) {
    const pair = symbol.toUpperCase() + 'USDT';
    const startMs = Math.floor((Date.now() / 1000 - days * 86400) * 1000);
    const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1d&startTime=${startMs}&limit=500`;
    try {
      const data = await cachedFetch(url, {}, 1800, 'binance');
      if (!data || !Array.isArray(data)) return null;
      return data.map(k => ({
        date: Math.floor(k[0] / 1000),
        price: Math.round(parseFloat(k[4]) * 100) / 100,
      }));
    } catch (e) {
      console.warn(`[fetchBinanceKlines] ${pair} failed:`, e.message);
      return null;
    }
  },


  /* --------------------------------------------------------------
   * Binance Multiple 24h Tickers
   * Source: scanners/scanner.py  scan_crypto() uses CoinGecko data
   *         but we also need Binance tickers for derivatives
   * URL: https://api.binance.com/api/v3/ticker/24hr
   * -------------------------------------------------------------- */
  async fetchBinanceTickers(symbols = null) {
    try {
      let url = 'https://api.binance.com/api/v3/ticker/24hr';
      if (symbols && symbols.length > 0) {
        // Fetch individual symbols to avoid pulling all tickers
        const results = [];
        for (const sym of symbols) {
          const pair = sym.toUpperCase() + 'USDT';
          const data = await cachedFetch(
            `${url}?symbol=${pair}`, {}, 30, 'binance'
          );
          if (data) results.push(data);
        }
        return results;
      }
      // Fetch all tickers
      const data = await cachedFetch(url, {}, 30, 'binance');
      return data || [];
    } catch (e) {
      console.warn('[fetchBinanceTickers] Failed:', e.message);
      return [];
    }
  },


  /* --------------------------------------------------------------
   * On-chain BTC — blockchain.info unconfirmed transactions
   * Source: scanners/onchain.py  scan_btc_whale_transfers()
   * URL: https://blockchain.info/unconfirmed-transactions?format=json
   * -------------------------------------------------------------- */
  async fetchOnchainBTC() {
    try {
      const data = await cachedFetch(
        'https://blockchain.info/unconfirmed-transactions?format=json',
        {}, 30, 'blockchain_info'
      );
      if (!data) return null;
      return data.txs || [];
    } catch (e) {
      console.warn('[fetchOnchainBTC] Failed:', e.message);
      return null;
    }
  },


  /* --------------------------------------------------------------
   * On-chain ETH — Etherscan API
   * Source: scanners/onchain.py  scan_eth_whale_transfers()
   * URL: https://api.etherscan.io/v2/api
   * -------------------------------------------------------------- */
  async fetchOnchainETH(apiKey) {
    if (!apiKey) return null;
    const base = 'https://api.etherscan.io/v2/api';
    try {
      // Step 1: get latest block number
      const blockData = await cachedFetch(
        `${base}?chainid=1&module=proxy&action=eth_blockNumber&apikey=${apiKey}`,
        {}, 30, 'etherscan'
      );
      if (!blockData || !blockData.result) return null;
      const latestBlockHex = blockData.result;

      // Step 2: get block transactions
      const blockDetail = await cachedFetch(
        `${base}?chainid=1&module=proxy&action=eth_getBlockByNumber&tag=${latestBlockHex}&boolean=true&apikey=${apiKey}`,
        {}, 30, 'etherscan'
      );
      if (!blockDetail || !blockDetail.result) return null;
      return blockDetail.result.transactions || [];
    } catch (e) {
      console.warn('[fetchOnchainETH] Failed:', e.message);
      return null;
    }
  },


  /* --------------------------------------------------------------
   * Fear & Greed Index — alternative.me
   * Source: scanners/macro.py  scan_fear_greed()
   * URL: https://api.alternative.me/fng/
   * -------------------------------------------------------------- */
  async fetchFearGreed() {
    try {
      const data = await cachedFetch(
        'https://api.alternative.me/fng/?limit=1',
        {}, 300, 'alternative_me'
      );
      if (!data || !data.data || !data.data[0]) return null;
      const item = data.data[0];
      return {
        value: parseInt(item.value, 10),
        classification: item.value_classification || '',
        timestamp: item.timestamp,
      };
    } catch (e) {
      console.warn('[fetchFearGreed] Failed:', e.message);
      return null;
    }
  },


  /* --------------------------------------------------------------
   * FRED Series — Federal Reserve Economic Data
   * Source: scanners/macro.py  scan_fred()
   * URL: https://api.stlouisfed.org/fred/series/observations
   * -------------------------------------------------------------- */
  async fetchFREDSeries(seriesId, apiKey) {
    if (!apiKey) return null;
    const rawUrl = `https://api.stlouisfed.org/fred/series/observations`
      + `?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=2`;
    const url = proxyUrl(rawUrl);
    try {
      const data = await cachedFetch(url, {}, 3600, 'fred');
      if (!data) return null;
      const obs = data.observations || [];
      if (obs.length < 2) return null;
      return {
        latest: parseFloat(obs[0].value),
        previous: parseFloat(obs[1].value),
        latestDate: obs[0].date,
        previousDate: obs[1].date,
      };
    } catch (e) {
      console.warn(`[fetchFREDSeries] ${seriesId} failed:`, e.message);
      return null;
    }
  },


  /* --------------------------------------------------------------
   * CoinGecko Global — market breadth
   * Source: scanners/macro.py  scan_market_breadth()
   * URL: https://api.coingecko.com/api/v3/global
   * -------------------------------------------------------------- */
  async fetchCoinGeckoGlobal() {
    try {
      const data = await cachedFetch(
        'https://api.coingecko.com/api/v3/global',
        {}, 60, 'coingecko'
      );
      if (!data || !data.data) return null;
      const d = data.data;
      return {
        totalMarketCap: (d.total_market_cap || {}).usd || 0,
        btcDominance: (d.market_cap_percentage || {}).btc || 0,
        ethDominance: (d.market_cap_percentage || {}).eth || 0,
        totalVolume24h: (d.total_volume || {}).usd || 0,
      };
    } catch (e) {
      console.warn('[fetchCoinGeckoGlobal] Failed:', e.message);
      return null;
    }
  },


  /* --------------------------------------------------------------
   * Binance Funding Rates
   * Source: scanners/derivatives.py  scan_funding_rates()
   * URL: https://fapi.binance.com/fapi/v1/fundingRate
   * -------------------------------------------------------------- */
  async fetchFundingRate(symbol) {
    try {
      const data = await cachedFetch(
        `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1`,
        {}, 30, 'binance'
      );
      if (!data || !Array.isArray(data) || data.length === 0) return null;
      return {
        symbol,
        fundingRate: parseFloat(data[0].fundingRate) * 100, // percent
        fundingTime: data[0].fundingTime,
      };
    } catch (e) {
      console.warn(`[fetchFundingRate] ${symbol} failed:`, e.message);
      return null;
    }
  },


  /* --------------------------------------------------------------
   * Binance Open Interest
   * Source: scanners/derivatives.py  scan_open_interest()
   * URL: https://fapi.binance.com/fapi/v1/openInterest
   * -------------------------------------------------------------- */
  async fetchOpenInterest(symbol) {
    try {
      const data = await cachedFetch(
        `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,
        {}, 30, 'binance'
      );
      if (!data) return null;
      return {
        symbol,
        openInterest: parseFloat(data.openInterest || '0'),
      };
    } catch (e) {
      console.warn(`[fetchOpenInterest] ${symbol} failed:`, e.message);
      return null;
    }
  },


  /* --------------------------------------------------------------
   * DeFi TVL — DefiLlama
   * Source: scanners/derivatives.py  scan_defi_tvl()
   * URL: https://api.llama.fi/charts
   * -------------------------------------------------------------- */
  async fetchDefiTVL() {
    try {
      const data = await cachedFetch(
        'https://api.llama.fi/charts',
        {}, 300, 'defillama'
      );
      if (!data || !Array.isArray(data) || data.length < 2) return null;
      return {
        latest: data[data.length - 1].totalLiquidityUSD,
        previous: data[data.length - 2].totalLiquidityUSD,
      };
    } catch (e) {
      console.warn('[fetchDefiTVL] Failed:', e.message);
      return null;
    }
  },


  /* --------------------------------------------------------------
   * RSS Feed — via CORS proxy, parse XML
   * Source: scanners/scanner.py  scan_news_feeds()
   * -------------------------------------------------------------- */
  async fetchRSS(feedUrl) {
    try {
      const url = proxyUrl(feedUrl);
      const text = await fetchText(url, 'rss');
      if (!text) return null;

      // Parse XML in browser
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/xml');
      const parseError = doc.querySelector('parsererror');
      if (parseError) {
        console.warn('[fetchRSS] XML parse error:', parseError.textContent.slice(0, 100));
        return null;
      }

      // Support both RSS 2.0 (<item>) and Atom (<entry>)
      const items = doc.querySelectorAll('item, entry');
      const entries = [];
      items.forEach((item, idx) => {
        if (idx >= 30) return; // Limit to 30 per source (matches Python)
        const title = (item.querySelector('title') || {}).textContent || '';
        const summary = (item.querySelector('description, summary, content') || {}).textContent || '';
        const link = item.querySelector('link');
        const href = link ? (link.getAttribute('href') || link.textContent || '') : '';
        const pubDate = (item.querySelector('pubDate, published, updated') || {}).textContent || '';
        entries.push({ title, summary, link: href, pubDate, source: feedUrl });
      });
      return entries;
    } catch (e) {
      console.warn(`[fetchRSS] Failed ${feedUrl}:`, e.message);
      if (typeof SourceHealth !== 'undefined') SourceHealth.recordFailure('rss');
      return null;
    }
  },


  /* --------------------------------------------------------------
   * DeepSeek Chat API
   * Source: AI evaluator uses DeepSeek for analysis
   * -------------------------------------------------------------- */
  async callDeepSeek(apiKey, prompt, model = 'deepseek-chat') {
    if (!apiKey) return null;
    try {
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });
      if (!resp.ok) {
        console.warn(`[callDeepSeek] HTTP ${resp.status}`);
        return null;
      }
      const data = await resp.json();
      return (data.choices || [{}])[0]?.message?.content || null;
    } catch (e) {
      console.warn('[callDeepSeek] Failed:', e.message);
      return null;
    }
  },


  /* --------------------------------------------------------------
   * ServerChan Push Notification
   * Source: notification layer
   * -------------------------------------------------------------- */
  async pushServerChan(key, title, body) {
    if (!key) return false;
    try {
      const resp = await fetch(`https://sctapi.ftqq.com/${key}.send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `title=${encodeURIComponent(title)}&desp=${encodeURIComponent(body)}`,
      });
      return resp.ok;
    } catch (e) {
      console.warn('[pushServerChan] Failed:', e.message);
      return false;
    }
  },


  /* --------------------------------------------------------------
   * Fed Rate History — daily step series from changes
   * Source: analytics/timeline.py  get_fed_rate_history()
   * -------------------------------------------------------------- */
  getFedRateHistory() {
    const datesOnly = _FED_RATES.map(r => r[0]);
    const ratesOnly = _FED_RATES.map(r => r[1]);
    const result = [];
    const current = new Date('2020-01-01T00:00:00Z');
    const end = new Date();

    while (current <= end) {
      const ds = current.toISOString().slice(0, 10);
      // bisect_right equivalent
      let idx = 0;
      for (let i = 0; i < datesOnly.length; i++) {
        if (datesOnly[i] <= ds) idx = i + 1;
        else break;
      }
      const rate = idx > 0 ? ratesOnly[idx - 1] : ratesOnly[0];
      const ts = Math.floor(current.getTime() / 1000);
      result.push({ date: ts, rate });
      current.setUTCDate(current.getUTCDate() + 1);
    }
    return result;
  },


  /* --------------------------------------------------------------
   * Timeline Data — aggregates all history
   * Source: analytics/timeline.py  get_timeline_data()
   * -------------------------------------------------------------- */
  async getTimelineData() {
    // Fetch all data concurrently
    const [btc, dxy, treasury, gold, oil, nasdaq] = await Promise.all([
      this.fetchBTCHistory(),
      this.fetchDXYHistory(),
      this.fetchTreasuryHistory(),
      this.fetchGoldHistory(),
      this.fetchOilHistory(),
      this.fetchNasdaqHistory(),
    ]);

    const fedRate = this.getFedRateHistory();

    const actualStart = (btc && btc.length > 0) ? btc[0].date : 1577836800;
    const now = Math.floor(Date.now() / 1000);
    const btcEnd = (btc && btc.length > 0) ? btc[btc.length - 1].date : now;

    // Compute max event timestamp
    let maxEventTs = 0;
    for (const [dateStr] of _MAJOR_EVENTS) {
      const ts = Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000);
      if (ts > maxEventTs) maxEventTs = ts;
    }
    const actualEnd = Math.max(btcEnd, maxEventTs);

    // Build events
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTs = Math.floor(today.getTime() / 1000);

    const events = [];
    for (const [dateStr, name, etype] of _MAJOR_EVENTS) {
      const ts = Math.floor(new Date(dateStr + 'T00:00:00Z').getTime() / 1000);
      if (ts >= actualStart && ts <= actualEnd) {
        events.push({
          date: dateStr,
          name,
          type: etype,
          ts,
          is_future: ts > todayTs,
        });
      }
    }

    return {
      btc: btc || [],
      dxy: dxy || [],
      treasury: treasury || [],
      gold: gold || [],
      oil: oil || [],
      nasdaq: nasdaq || [],
      fed_rate: fedRate,
      events,
      range: { from: actualStart, to: actualEnd },
    };
  },


  /* --------------------------------------------------------------
   * Futures Symbols — list from derivatives.py
   * -------------------------------------------------------------- */
  FUTURES_SYMBOLS: [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
    'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'DOTUSDT',
    'MATICUSDT', 'UNIUSDT', 'SHIBUSDT', 'LTCUSDT', 'ATOMUSDT',
    'ETCUSDT', 'XLMUSDT', 'APTUSDT', 'FILUSDT', 'ARBUSDT',
  ],

  /** Bulk fetch funding rates for top N futures symbols. */
  async fetchAllFundingRates(topN = 10) {
    const symbols = this.FUTURES_SYMBOLS.slice(0, topN);
    const results = [];
    for (const sym of symbols) {
      const data = await this.fetchFundingRate(sym);
      if (data) results.push(data);
    }
    return results;
  },

  /** Bulk fetch open interest for given futures symbols. */
  async fetchAllOpenInterest(topN = 20) {
    const symbols = this.FUTURES_SYMBOLS.slice(0, topN);
    const results = [];
    for (const sym of symbols) {
      const data = await this.fetchOpenInterest(sym);
      if (data) results.push(data);
    }
    return results;
  },


  /* --------------------------------------------------------------
   * FRED Series Map — from macro.py
   * -------------------------------------------------------------- */
  FRED_SERIES: {
    DFF: '联邦基金利率',
    DGS10: '10年期美债收益率',
    UNRATE: '失业率',
    CPIAUCSL: 'CPI(同比)',
  },

  /** Fetch all FRED series. */
  async fetchAllFRED(apiKey) {
    if (!apiKey) return {};
    const results = {};
    for (const [seriesId, label] of Object.entries(this.FRED_SERIES)) {
      const data = await this.fetchFREDSeries(seriesId, apiKey);
      if (data) {
        results[seriesId] = { ...data, label };
      }
    }
    return results;
  },


  /* --------------------------------------------------------------
   * Utility: Clear cache
   * -------------------------------------------------------------- */
  clearCache() {
    _cache.clear();
    console.info('[DataAPI] Cache cleared');
  },

  /** Return cache stats for debugging. */
  getCacheStats() {
    let expired = 0;
    let active = 0;
    const now = Date.now();
    for (const [, v] of _cache) {
      // We can't know the TTL here, but we can report count
      if (now - v.ts > 3600 * 1000) expired++;
      else active++;
    }
    return { total: _cache.size, active, expired };
  },
};

export { DataAPI, _MAJOR_EVENTS, _FED_RATES };
