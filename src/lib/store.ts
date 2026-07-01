// @ts-nocheck
/**
 * store.js — Client-side state management for the Financial Alert System.
 *
 * Migrated from Python backend modules:
 *   - core/state_store.py    → Store (localStorage key-value)
 *   - analytics/history.py   → HistoryDB (IndexedDB for signal history + feedback)
 *   - core/source_health.py  → SourceHealth (circuit-breaker pattern)
 *   - analytics/stats_collector.py → StatsCollector (daily signal stats)
 *   - push status tracking   → PushTracker (daily push quotas)
 */

/* ===================================================================
 * 1. Store — Simple key-value store (localStorage)
 *    Mirrors: core/state_store.py → StateStore
 *    Keys are prefixed with "fs_" to avoid collisions.
 * =================================================================== */

const Store = {
  /**
   * Retrieve a stored value by key.
   * @param {string} key
   * @param {*} [defaultVal=null] - Returned when key is missing or parse fails.
   * @returns {*}
   */
  get(key, defaultVal = null) {
    try {
      const raw = localStorage.getItem('fs_' + key);
      if (raw === null) return defaultVal;
      return JSON.parse(raw);
    } catch {
      return defaultVal;
    }
  },

  /**
   * Persist a value under the given key (JSON-serialized).
   * Also stores an `updated_at` timestamp mirroring StateStore.set().
   * @param {string} key
   * @param {*} val
   */
  set(key, val) {
    try {
      localStorage.setItem('fs_' + key, JSON.stringify(val));
      localStorage.setItem('fs_' + key + '__mtime', String(Date.now() / 1000));
    } catch (e) {
      console.warn(`[Store] set(${key}) failed:`, e);
    }
  },

  /**
   * Remove a stored key (and its metadata).
   * @param {string} key
   */
  remove(key) {
    localStorage.removeItem('fs_' + key);
    localStorage.removeItem('fs_' + key + '__mtime');
  },

  /**
   * Return all stored keys (without the "fs_" prefix), sorted.
   * Mirrors StateStore.keys().
   * @returns {string[]}
   */
  keys() {
    const result = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('fs_') && !k.endsWith('__mtime')) {
        result.push(k.slice(3));
      }
    }
    return result.sort();
  },

  /**
   * Get the last-modified timestamp (epoch seconds) for a key.
   * Mirrors StateStore.get_mtime().
   * @param {string} key
   * @returns {number|null}
   */
  getMtime(key) {
    const raw = localStorage.getItem('fs_' + key + '__mtime');
    return raw !== null ? parseFloat(raw) : null;
  },

  /* -- Deduplication helpers (mirrors mark_alerted / filter_recently_alerted) -- */

  /**
   * Mark symbols as recently alerted with current timestamp.
   * Mirrors: state_store.mark_alerted()
   * @param {string[]} symbols
   */
  markAlerted(symbols) {
    if (!symbols || symbols.length === 0) return;
    const now = Date.now() / 1000;
    const alerted = this.get('recently_alerted', {});
    for (const sym of symbols) {
      alerted[sym] = now;
    }
    this.set('recently_alerted', alerted);
  },

  /**
   * Filter out symbols that were alerted within the dedupe window.
   * Mirrors: state_store.filter_recently_alerted()
   * @param {string[]} symbols
   * @param {number} [dedupeWindowMinutes=120] - Window in minutes.
   * @returns {string[]} Symbols that are NOT recently alerted.
   */
  filterRecentlyAlerted(symbols, dedupeWindowMinutes = 120) {
    if (!symbols || symbols.length === 0) return [];
    const alerted = this.get('recently_alerted', {});
    const windowSec = dedupeWindowMinutes * 60;
    const now = Date.now() / 1000;
    return symbols.filter((sym) => {
      const last = alerted[sym];
      return last == null || now - last > windowSec;
    });
  },
};


/* ===================================================================
 * 2. HistoryDB — IndexedDB wrapper for signal history
 *    Mirrors: analytics/history.py (SQLite tables: signals,
 *             signal_outcomes, signal_feedback)
 *
 *    Object stores:
 *      "signals"  — AI-evaluated signals
 *      "outcomes" — prediction verification results
 *      "feedback" — user usefulness feedback
 * =================================================================== */

class HistoryDB {
  constructor() {
    /** @type {IDBDatabase|null} */
    this.db = null;
    this._dbName = 'financial_signals';
    this._dbVersion = 1;
  }

  /**
   * Open (or create) the IndexedDB database with required object stores.
   * Mirrors: history.init_db() + init_outcome_table() + init_feedback_table()
   * @returns {Promise<IDBDatabase>}
   */
  async open() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._dbName, this._dbVersion);

      req.onupgradeneeded = (event) => {
        const db = event.target.result;

        // signals store — mirrors: signals table
        if (!db.objectStoreNames.contains('signals')) {
          const store = db.createObjectStore('signals', {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('by_symbol', 'symbol', { unique: false });
          store.createIndex('by_asset_type', 'asset_type', { unique: false });
          store.createIndex('by_created_at', 'created_at', { unique: false });
        }

        // outcomes store — mirrors: signal_outcomes table
        if (!db.objectStoreNames.contains('outcomes')) {
          const oStore = db.createObjectStore('outcomes', {
            keyPath: 'signal_id',
          });
          oStore.createIndex('by_checked_at', 'checked_at', { unique: false });
        }

        // feedback store — mirrors: signal_feedback table
        if (!db.objectStoreNames.contains('feedback')) {
          db.createObjectStore('feedback', { keyPath: 'signal_id' });
        }
      };

      req.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      req.onerror = (event) => {
        console.warn('[HistoryDB] open failed:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /* -- helpers ----------------------------------------------------------- */

  /** Ensure db is open before any operation. */
  async _ensureOpen() {
    if (!this.db) await this.open();
  }

  /**
   * Wrap an IDBRequest in a Promise.
   * @param {IDBRequest} request
   * @returns {Promise<*>}
   */
  _promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /* -- signals ----------------------------------------------------------- */

  /**
   * Store an AI-evaluated signal.
   * Mirrors: history.log_signal(item, result)
   *
   * @param {Object} signal
   * @param {string} signal.symbol          - e.g. "BTC"
   * @param {string} signal.asset_type      - "stock" | "crypto" | "macro"
   * @param {string[]} [signal.trigger_reasons]
   * @param {string} [signal.ai_direction]  - e.g. "看多" / "看空"
   * @param {number} [signal.ai_confidence] - 0–100
   * @param {string} [signal.ai_summary]
   * @param {Object} [signal.raw_data]      - original raw payload
   * @returns {Promise<number>} The auto-generated signal id.
   */
  async addSignal(signal) {
    await this._ensureOpen();
    const record = {
      symbol: signal.symbol || '',
      asset_type: signal.asset_type || '',
      trigger_reasons: signal.trigger_reasons || [],
      ai_direction: signal.ai_direction || '',
      ai_confidence: signal.ai_confidence || 0,
      ai_summary: signal.ai_summary || '',
      raw_data: signal.raw_data || {},
      created_at: new Date().toISOString(),
    };
    const tx = this.db.transaction('signals', 'readwrite');
    const store = tx.objectStore('signals');
    return this._promisify(store.add(record));
  }

  /**
   * Query recent signals, newest first.
   * Mirrors: history.query(hours)
   *
   * @param {number} [limit=30] - Maximum rows to return.
   * @returns {Promise<{total: number, by_asset_type: Object, rows: Object[]}>}
   */
  async getHistory(limit = 30) {
    await this._ensureOpen();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('signals', 'readonly');
      const store = tx.objectStore('signals');
      const index = store.index('by_created_at');
      const rows = [];
      const byType = {};

      const req = index.openCursor(null, 'prev'); // newest first
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && rows.length < limit) {
          const val = cursor.value;
          rows.push(val);
          const at = val.asset_type;
          byType[at] = (byType[at] || 0) + 1;
          cursor.continue();
        } else {
          resolve(rows);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Query signals within the last N hours (mirroring history.query(hours)).
   * @param {number} [hours=24]
   * @returns {Promise<{total: number, by_asset_type: Object, rows: Object[]}>}
   */
  async queryByHours(hours = 24) {
    await this._ensureOpen();
    const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('signals', 'readonly');
      const store = tx.objectStore('signals');
      const index = store.index('by_created_at');
      const range = IDBKeyRange.lowerBound(cutoff);
      const rows = [];
      const byType = {};

      const req = index.openCursor(range, 'prev');
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const val = cursor.value;
          rows.push(val);
          const at = val.asset_type;
          byType[at] = (byType[at] || 0) + 1;
          cursor.continue();
        } else {
          resolve({ total: rows.length, by_asset_type: byType, rows });
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  /* -- outcomes (signal accuracy tracking) -------------------------------- */

  /**
   * Log a signal outcome (prediction verification result).
   * Mirrors: history.log_outcome()
   *
   * @param {Object} outcome
   * @param {number} outcome.signal_id
   * @param {number} outcome.check_hours
   * @param {number} outcome.entry_price
   * @param {number} outcome.check_price
   * @param {number} outcome.change_pct
   * @param {string} outcome.direction
   * @param {boolean|null} outcome.prediction_correct
   * @returns {Promise<number>}
   */
  async logOutcome(outcome) {
    await this._ensureOpen();
    const record = {
      signal_id: outcome.signal_id,
      check_hours: outcome.check_hours || 48,
      entry_price: outcome.entry_price ?? 0,
      check_price: outcome.check_price ?? 0,
      change_pct: outcome.change_pct ?? 0,
      direction: outcome.direction || '',
      prediction_correct:
        outcome.prediction_correct === true
          ? 1
          : outcome.prediction_correct === false
            ? 0
            : null,
      checked_at: new Date().toISOString(),
    };
    const tx = this.db.transaction('outcomes', 'readwrite');
    const store = tx.objectStore('outcomes');
    return this._promisify(store.put(record)); // put = INSERT OR REPLACE
  }

  /**
   * Get outcome stats aggregated by asset type, confidence, direction, symbol.
   * Mirrors: history.get_outcome_stats()
   *
   * @returns {Promise<Object>} Same shape as Python get_outcome_stats() return.
   */
  async getOutcomeStats() {
    await this._ensureOpen();
    const [allSignals, allOutcomes] = await Promise.all([
      this._getAllRecords('signals'),
      this._getAllRecords('outcomes'),
    ]);

    const outcomeMap = new Map();
    for (const o of allOutcomes) {
      outcomeMap.set(o.signal_id, o);
    }

    // Merge outcomes with their signals
    const outcomes = [];
    for (const o of allOutcomes) {
      const sig = allSignals.find((s) => s.id === o.signal_id);
      if (sig) {
        outcomes.push({ ...o, ...sig, prediction_correct: o.prediction_correct });
      }
    }
    // Sort newest first
    outcomes.sort((a, b) => (b.checked_at || '').localeCompare(a.checked_at || ''));

    const totalSignals = allSignals.length;
    const pending = allSignals.filter(
      (s) => s.ai_direction && s.ai_direction !== '' && !outcomeMap.has(s.id)
    ).length;

    const checked = outcomes.length;
    const correct = outcomes.filter((o) => o.prediction_correct === 1).length;
    const wrong = outcomes.filter((o) => o.prediction_correct === 0).length;

    // By asset type
    const byType = {};
    for (const o of outcomes) {
      if (o.prediction_correct == null) continue;
      const at = o.asset_type;
      if (!byType[at]) byType[at] = { total: 0, correct: 0 };
      byType[at].total++;
      if (o.prediction_correct === 1) byType[at].correct++;
    }
    for (const k of Object.keys(byType)) {
      byType[k].accuracy =
        byType[k].total > 0
          ? Math.round((byType[k].correct / byType[k].total) * 1000) / 1000
          : 0;
    }

    // By confidence bands
    const byConf = {
      '高(70-100)': { total: 0, correct: 0 },
      '中(50-70)': { total: 0, correct: 0 },
      '低(0-50)': { total: 0, correct: 0 }
    };
    for (const o of outcomes) {
      if (o.prediction_correct == null) continue;
      const c = o.ai_confidence || 0;
      const bucket = c >= 70 ? '高(70-100)' : c >= 50 ? '中(50-70)' : '低(0-50)';
      byConf[bucket].total++;
      if (o.prediction_correct === 1) byConf[bucket].correct++;
    }
    for (const k of Object.keys(byConf)) {
      byConf[k].accuracy =
        byConf[k].total > 0
          ? Math.round((byConf[k].correct / byConf[k].total) * 1000) / 1000
          : 0;
    }

    // Confusion matrix
    const cm = {
      bullish_correct: 0,
      bullish_wrong: 0,
      bearish_correct: 0,
      bearish_wrong: 0,
    };
    for (const o of outcomes) {
      if (o.prediction_correct == null) continue;
      if ((o.direction || '').includes('看多')) {
        if (o.prediction_correct === 1) cm.bullish_correct++;
        else cm.bullish_wrong++;
      } else if ((o.direction || '').includes('看空')) {
        if (o.prediction_correct === 1) cm.bearish_correct++;
        else cm.bearish_wrong++;
      }
    }

    // By symbol (top 20)
    const bySym = {};
    for (const o of outcomes) {
      if (o.prediction_correct == null) continue;
      const sym = o.symbol;
      if (!bySym[sym]) bySym[sym] = { total: 0, correct: 0 };
      bySym[sym].total++;
      if (o.prediction_correct === 1) bySym[sym].correct++;
    }
    const bySymbol = Object.entries(bySym)
      .map(([symbol, v]) => ({
        symbol,
        ...v,
        accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 1000) / 1000 : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    // Recent 20
    const recent = outcomes.slice(0, 20).map((o) => ({
      id: o.signal_id,
      symbol: o.symbol,
      direction: o.direction,
      confidence: o.ai_confidence,
      change_pct: o.change_pct,
      correct:
        o.prediction_correct === 1
          ? true
          : o.prediction_correct === 0
            ? false
            : null,
      summary: o.ai_summary,
    }));

    return {
      overall: {
        total: totalSignals,
        checked,
        correct,
        wrong,
        pending,
        accuracy: checked > 0 ? Math.round((correct / checked) * 1000) / 1000 : 0,
      },
      by_asset_type: byType,
      by_confidence: byConf,
      confusion_matrix: cm,
      by_symbol: bySymbol,
      recent,
    };
  }

  /* -- feedback ----------------------------------------------------------- */

  /**
   * Submit user feedback for a signal (useful / not useful).
   * Mirrors: history.submit_feedback(signal_id, useful)
   *
   * @param {number} signalId
   * @param {boolean} useful
   * @returns {Promise<boolean>} true on success
   */
  async submitFeedback(signalId, useful) {
    try {
      await this._ensureOpen();
      const record = {
        signal_id: signalId,
        useful: useful ? 1 : 0,
        created_at: new Date().toISOString(),
      };
      const tx = this.db.transaction('feedback', 'readwrite');
      const store = tx.objectStore('feedback');
      await this._promisify(store.put(record)); // put = INSERT OR REPLACE
      return true;
    } catch (e) {
      console.warn('[HistoryDB] submitFeedback failed:', e);
      return false;
    }
  }
  /**
   * Get aggregated feedback statistics.
   * Mirrors: history.get_feedback_stats()
   *
   * @returns {Promise<{total: number, useful: number, not_useful: number, usefulness: number}>}
   */
  async getFeedbackStats() {
    try {
      await this._ensureOpen();
      const allFeedback = await this._getAllRecords('feedback');
      const total = allFeedback.length;
      const useful = allFeedback.filter((f) => f.useful === 1).length;
      return {
        total,
        useful,
        not_useful: total - useful,
        usefulness: total > 0 ? Math.round((useful / total) * 1000) / 1000 : 0,
      };
    } catch (e) {
      console.warn('[HistoryDB] getFeedbackStats failed:', e);
      return { total: 0, useful: 0, not_useful: 0, usefulness: 0 };
    }
  }

  /**
   * Get calibration data — accuracy grouped by confidence bands.
   * Mirrors: performance.get_calibration()
   *
   * @returns {Promise<{bands: Object[], recommended_threshold: number, total_calibrated: number}>}
   */
  async getCalibration() {
    try {
      await this._ensureOpen();
      const [allSignals, allOutcomes] = await Promise.all([
        this._getAllRecords('signals'),
        this._getAllRecords('outcomes'),
      ]);

      const signalMap = new Map();
      for (const s of allSignals) signalMap.set(s.id, s);

      const bands = [
        [0, 30, '0-30%'],
        [30, 50, '30-50%'],
        [50, 60, '50-60%'],
        [60, 70, '60-70%'],
        [70, 80, '70-80%'],
        [80, 90, '80-90%'],
        [90, 101, '90-100%'],
      ];

      const results = bands.map(([lo, hi, label]) => {
        let total = 0;
        let correct = 0;
        let wrong = 0;
        let changeSum = 0;
        let changeCount = 0;

        for (const o of allOutcomes) {
          if (o.prediction_correct == null) continue;
          const sig = signalMap.get(o.signal_id);
          if (!sig) continue;
          const c = sig.ai_confidence || 0;
          if (c >= lo && c < hi) {
            total++;
            if (o.prediction_correct === 1) correct++;
            if (o.prediction_correct === 0) wrong++;
            if (o.change_pct != null) {
              changeSum += o.change_pct;
              changeCount++;
            }
          }
        }

        return {
          label,
          total,
          correct,
          wrong,
          accuracy: total > 0 ? Math.round((correct / total) * 1000) / 1000 : null,
          avg_change_pct:
            changeCount > 0
              ? Math.round((changeSum / changeCount) * 100) / 100
              : null,
        };
      });

      // Recommended threshold: lowest confidence band with accuracy >= 0.6 and >= 3 samples
      let recommended = 50;
      for (const b of results) {
        if (b.accuracy !== null && b.accuracy >= 0.6 && b.total >= 3) {
          recommended = parseInt(b.label.split('-')[0], 10);
          break;
        }
      }

      const totalCalibrated = results.reduce((sum, b) => sum + b.total, 0);
      return { bands: results, recommended_threshold: recommended, total_calibrated: totalCalibrated };
    } catch (e) {
      console.warn('[HistoryDB] getCalibration failed:', e);
      return { bands: [], recommended_threshold: 50, total_calibrated: 0 };
    }
  }

  /* -- internal helpers --------------------------------------------------- */

  /**
   * Read all records from an object store.
   * @param {string} storeName
   * @returns {Promise<Object[]>}
   */
  async _getAllRecords(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
}


/* ===================================================================
 * 3. SourceHealth — Data source circuit-breaker tracking
 *    Mirrors: core/source_health.py
 *
 *    State is persisted in Store under "source_health".
 *    Constants match the Python module:
 *      _MAX_FAILURES   = 3   (circuit opens after 3 consecutive failures)
 *      _RETRY_INTERVAL = 21600 (6 hours before retry)
 * =================================================================== */

const SourceHealth = {
  /** @private */ _MAX_FAILURES: 3,
  /** @private */ _RETRY_INTERVAL: 21600, // seconds

  /**
   * Load the full health map from Store.
   * @returns {Object}
   */
  _load() {
    return Store.get('source_health', {});
  },

  /**
   * Persist the health map.
   * @param {Object} data
   */
  _save(data) {
    Store.set('source_health', data);
  },

  /**
   * Record a successful API call — resets the failure counter.
   * Mirrors: source_health.mark_success()
   * @param {string} name - Data source identifier (e.g. "coingecko").
   */
  recordSuccess(name) {
    const data = this._load();
    if (!data[name]) data[name] = {};
    data[name].consecutive_failures = 0;
    data[name].last_success = Date.now() / 1000;
    this._save(data);
  },

  /**
   * Record a failed API call — increments the failure counter.
   * Mirrors: source_health.mark_failure()
   * @param {string} name
   */
  recordFailure(name) {
    const data = this._load();
    if (!data[name]) data[name] = {};
    data[name].consecutive_failures = (data[name].consecutive_failures || 0) + 1;
    data[name].last_failure = Date.now() / 1000;
    data[name].last_retry = Date.now() / 1000;
    this._save(data);
  },

  /**
   * Return health status for all tracked sources.
   * Mirrors: source_health.get_stats()
   * @returns {{total: number, healthy: number, degraded: number, sources: Object}}
   */
  getAll() {
    const data = this._load();
    const now = Date.now() / 1000;
    let healthy = 0;
    let degraded = 0;
    for (const name of Object.keys(data)) {
      const info = data[name];
      const fails = info.consecutive_failures || 0;
      const lastRetry = info.last_retry || 0;
      if (fails >= this._MAX_FAILURES && now - lastRetry < this._RETRY_INTERVAL) {
        degraded++;
      } else {
        healthy++;
      }
    }
    return { total: Object.keys(data).length, healthy, degraded, sources: data };
  },

  /**
   * Check if a source is active (not circuit-broken).
   * Mirrors: source_health.is_source_active()
   * @param {string} name
   * @returns {boolean}
   */
  isActive(name) {
    const data = this._load();
    const info = data[name];
    if (!info) return true; // unknown source = active
    const fails = info.consecutive_failures || 0;
    const lastRetry = info.last_retry || 0;
    const now = Date.now() / 1000;
    if (fails >= this._MAX_FAILURES && now - lastRetry < this._RETRY_INTERVAL) {
      return false;
    }
    return true;
  },

  /**
   * Reset last_retry on all degraded sources so they are retried on next scan.
   * Mirrors: source_health.probe_degraded()
   * @returns {number} Number of sources reset.
   */
  probeDegraded() {
    const data = this._load();
    const now = Date.now() / 1000;
    let reset = 0;
    for (const name of Object.keys(data)) {
      const info = data[name];
      const fails = info.consecutive_failures || 0;
      const lastRetry = info.last_retry || 0;
      if (fails >= this._MAX_FAILURES && now - lastRetry < this._RETRY_INTERVAL) {
        info.last_retry = 0;
        reset++;
      }
    }
    if (reset > 0) this._save(data);
    return reset;
  },
};


/* ===================================================================
 * 4. StatsCollector — Daily signal statistics
 *    Mirrors: analytics/stats_collector.py
 *
 *    Stores an array of daily entries in Store under "daily_stats",
 *    keeping the most recent 30 days.
 * =================================================================== */

const StatsCollector = {
  /**
   * Record signal data for today. Only records once per day.
   * Mirrors: stats_collector.try_log_daily_stats()
   *
   * @param {Object[]} signals - Array of signal objects with { asset_type }.
   */
  record(signals) {
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const stats = Store.get('daily_stats', { days: [] });

    // Check if today is already recorded
    if (stats.days.some((d) => d.date === today)) return;

    const total = signals ? signals.length : 0;
    const byType = {};
    if (signals) {
      for (const s of signals) {
        const at = s.asset_type || 'unknown';
        byType[at] = (byType[at] || 0) + 1;
      }
    }

    const entry = {
      date: today,
      total,
      by_asset_type: byType,
      ts: Date.now() / 1000,
    };

    stats.days.push(entry);
    // Keep only the last 30 days
    stats.days = stats.days.slice(-30);
    Store.set('daily_stats', stats);
  },

  /**
   * Return the full daily stats object.
   * Mirrors: stats_collector._load_stats()
   * @returns {{days: Array<{date: string, total: number, by_asset_type: Object, ts: number}>}}
   */
  getStats() {
    return Store.get('daily_stats', { days: [] });
  },
};


/* ===================================================================
 * 5. PushTracker — Push notification status tracking
 *    Tracks daily push counts and pending notifications.
 *    Uses Store with date-keyed entries.
 * =================================================================== */

const PushTracker = {
  /** @private */
  _todayKey() {
    return 'push_' + new Date().toISOString().slice(0, 10);
  },

  /**
   * Increment today's push count by 1.
   */
  recordPush() {
    const key = this._todayKey();
    const current = Store.get(key, { count: 0, pending: 0 });
    current.count++;
    Store.set(key, current);
  },

  /**
   * Get today's push count.
   * @returns {number}
   */
  getDailyUsed() {
    const key = this._todayKey();
    const data = Store.get(key, { count: 0 });
    return data.count || 0;
  },

  /**
   * Get pending push count (queued but not yet sent).
   * @returns {number}
   */
  getPending() {
    const key = this._todayKey();
    const data = Store.get(key, { pending: 0 });
    return data.pending || 0;
  },

  /**
   * Set the pending push count.
   * @param {number} count
   */
  setPending(count) {
    const key = this._todayKey();
    const current = Store.get(key, { count: 0, pending: 0 });
    current.pending = count;
    Store.set(key, current);
  },

  /**
   * Get full push status for today.
   * @param {number} [dailyLimit=50] - Maximum pushes allowed per day.
   * @returns {{daily_used: number, daily_limit: number, pending: number, remaining: number}}
   */
  getStatus(dailyLimit = 50) {
    const used = this.getDailyUsed();
    const pending = this.getPending();
    return {
      daily_used: used,
      daily_limit: dailyLimit,
      pending,
      remaining: Math.max(0, dailyLimit - used),
    };
  },
};


/* ===================================================================
 * Exports — available as ES module or global
 * =================================================================== */

export async function initDatabaseSeeds() {
  // To match the original project exactly, we start with a clean slate without forcing static mock data.
  // We actively remove the old static seed keys so the client resets to a clean slate.
  localStorage.removeItem('fs_event_window');
  localStorage.removeItem('fs_daily_stats');
  localStorage.removeItem('fs_source_health');

  // Also clear the IndexedDB stores to remove seeded history signals
  const db = new HistoryDB();
  try {
    const idb = await db.open();
    const clearTx = idb.transaction(['signals', 'outcomes', 'feedback'], 'readwrite');
    clearTx.objectStore('signals').clear();
    clearTx.objectStore('outcomes').clear();
    clearTx.objectStore('feedback').clear();
    await new Promise((resolve) => {
      clearTx.oncomplete = () => resolve(null);
      clearTx.onerror = () => resolve(null);
    });
  } catch (e) {
    console.warn('[Store Reset] Failed to clear IndexedDB stores:', e);
  } finally {
    if (db.db) {
      try { db.db.close(); db.db = null; } catch {}
    }
  }

  return Promise.resolve();
}

export { Store, HistoryDB, SourceHealth, StatsCollector, PushTracker };

