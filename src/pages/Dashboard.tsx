// @ts-nocheck
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { CONFIG } from '../lib/config';
import { Store, HistoryDB, SourceHealth, StatsCollector, PushTracker } from '../lib/store';
import { DataAPI, _MAJOR_EVENTS, _FED_RATES } from '../lib/data';
import { Engine, EventWindow, Volatility, Correlation, Performance } from '../lib/engine';

const nativeFetch = window.fetch;

// Local fetch mocker to intercept API calls and direct to local JS engines
const localFetch = async (url, options) => {
  const urlObj = new URL(url, window.location.origin);
  const path = urlObj.pathname;
  const params = urlObj.searchParams;

  // Fallback to native fetch for non-mocked external paths (e.g. Yahoo Finance)
  if (!path.startsWith('/api/')) {
    return nativeFetch(url, options);
  }

  let data = null;

  try {
    if (path === '/api/overview') {
      const ew = new EventWindow();
      data = {
        active_count: ew.getUrgent().length + ew.getBrief().length,
        watch_count: CONFIG.CUSTOM_CRYPTO_SYMBOLS.length,
        alert_count: PushTracker.getDailyUsed()
      };
    } else if (path === '/api/scores') {
      const symbol = params.get('symbol');
      const ew = new EventWindow();
      if (symbol) {
        const score = ew.getScore(symbol);
        const rawEvents = ew.getRawEvents(symbol, 20);
        const attribution = ew.getAttribution(symbol);
        data = {
          symbol,
          score: score?.score || 0,
          events: score?.events || 0,
          dimensions: score?.dimensions || [],
          span_hours: score?.span_hours || 0,
          score_fast: score?.score_fast || 0,
          score_medium: score?.score_medium || 0,
          score_slow: score?.score_slow || 0,
          attribution,
          detail_events: rawEvents.map(e => ({
            time_ago: e.time_ago,
            type: e.type,
            severity: e.severity,
            dimension: e.dimension,
            raw: e.raw
          }))
        };
      } else {
        data = [];
        const all = ew.getAllScores();
        for (const [sym, s] of Object.entries(all)) {
          const events_raw = ew.getRawEvents(sym, 3);
          data.push({
            symbol: sym,
            score: s.score,
            events: s.events,
            span_hours: s.span_hours,
            recent_events: events_raw.map(e => ({
              type: e.type.slice(0, 30),
              dim: e.dimension,
              ago: e.time_ago,
              raw: {
                sender_label: e.raw?.sender_label || '',
                receiver_label: e.raw?.receiver_label || ''
              }
            })),
            attribution: {
              dims: Object.keys(s.attribution?.dimensions || {}),
              pcts: Object.fromEntries(
                Object.entries(s.attribution?.dimensions || {}).map(([k, v]) => [k, v.pct])
              ),
              factors: s.attribution?.factors || {}
            }
          });
        }
        data.sort((a, b) => b.score - a.score);
      }
    } else if (path === '/api/health') {
      data = SourceHealth.getAll();
    } else if (path === '/api/volatility') {
      data = Volatility.getCurrent();
      if (data instanceof Promise) data = await data;
    } else if (path === '/api/history') {
      const limit = parseInt(params.get('limit') || '30');
      const db = new HistoryDB();
      await db.open();
      const rows = await db.getHistory(limit);
      data = rows.map(r => ({
        id: r.id,
        symbol: r.symbol,
        asset_type: r.asset_type,
        ai_direction: r.ai_direction,
        ai_confidence: r.ai_confidence,
        ai_summary: r.ai_summary,
        trigger_reasons: r.trigger_reasons,
        created_at: r.created_at,
        feedback: r.feedback
      }));
    } else if (path === '/api/feedback/stats') {
      const db = new HistoryDB();
      await db.open();
      data = await db.getFeedbackStats();
    } else if (path === '/api/feedback') {
      const body = options?.body ? JSON.parse(options.body) : {};
      const db = new HistoryDB();
      await db.open();
      const ok = await db.submitFeedback(body.signal_id, body.useful);
      data = { ok };
    } else if (path === '/api/stats') {
      data = StatsCollector.getStats();
    } else if (path === '/api/push') {
      data = PushTracker.getStatus();
    } else if (path === '/api/rss-health') {
      data = {};
    } else if (path === '/api/warmup') {
      data = { status: 'ready' };
    } else if (path === '/api/budget') {
      data = { remaining: 100, limit: 100 };
    } else if (path === '/api/coverage') {
      data = { total: CONFIG.CUSTOM_CRYPTO_SYMBOLS.length };
    } else if (path === '/api/performance') {
      data = Performance.getStats();
    } else if (path === '/api/sentiment') {
      data = { sentiment: 'bullish' };
    } else if (path === '/api/correlation') {
      data = await Correlation.computeMatrix();
    } else if (path === '/api/timeline') {
      data = await DataAPI.getTimelineData();
    }
  } catch (e) {
    console.error('[localFetch] Error handling route:', path, e);
  }

  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data)
  };
};

const HTML_CONTENT = '\n<div class="dashboard">\n<!-- Header -->\n<div class="header">\n<div>\n<h1>⬡ 新闻及宏观线性测试 <span class="sub">· 0627</span></h1>\n<div class="stats-bar" id="statsBar"></div>\n</div>\n<div class="header-right">\n<div class="clock" id="clock">--:--:--</div>\n<div class="health-bar" id="healthBar"></div>\n<div class="health-bar"><span class="vol-badge" id="volBadge" style="display:none;">--</span></div>\n</div>\n</div>\n<!-- Nav -->\n<div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;">\n<a href="/" style="padding:8px 20px;border-radius:8px;font-size:13px;letter-spacing:1px;text-decoration:none;background:rgba(0,248,255,0.1);border:1px solid rgba(0,248,255,0.25);color:var(--cyan);">仪表盘</a>\n<a href="/propagation" style="padding:8px 20px;border-radius:8px;font-size:13px;letter-spacing:1px;text-decoration:none;background:rgba(255,0,170,0.1);border:1px solid rgba(255,0,170,0.25);color:var(--magenta);">推导链</a>\n<a href="/architecture" style="padding:8px 20px;border-radius:8px;font-size:13px;letter-spacing:1px;text-decoration:none;background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.25);color:var(--green);">架构</a>\n<a href="#" onclick="openSettingsModal();return false;" style="padding:8px 20px;border-radius:8px;font-size:13px;letter-spacing:1px;text-decoration:none;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);color:var(--text-dim);margin-left:auto;">⚙ 设置</a>\n</div>\n<!-- ===== 当前关注 ===== -->\n<div class="section" id="alertSection" style="display:none;">\n<div class="section-title">⚠ 当前关注</div>\n<div id="alertContainer"></div>\n</div>\n<!-- ===== 图表区 ===== -->\n<div class="section chart-section">\n<div class="section-title">宏观时间线 (2020-2026)</div>\n<div class="card">\n<div class="timeline-toolbar">\n<span style="color:var(--text-dim);font-size:11px;letter-spacing:1px;margin-right:4px;">事件:</span>\n<button class="filter-btn active" data-type="all">全部</button>\n<button class="filter-btn" data-type="macro">宏观</button>\n<button class="filter-btn" data-type="crypto">加密</button>\n<button class="filter-btn" data-type="geopolitical">地缘</button>\n<span class="timeline-sep"></span>\n<span style="color:var(--text-dim);font-size:11px;letter-spacing:1px;margin-right:4px;">范围:</span>\n<button class="filter-btn range-btn active" data-range="all">全部</button>\n<button class="filter-btn range-btn" data-range="3y">3年</button>\n<button class="filter-btn range-btn" data-range="1y">1年</button>\n<span class="timeline-sep"></span>\n<span style="color:var(--text-dim);font-size:11px;letter-spacing:1px;margin-right:4px;">视图:</span>\n<button class="filter-btn mode-btn active" data-mode="classic">K线</button>\n<button class="filter-btn mode-btn" data-mode="pixel">像素图</button>\n<button class="filter-btn mode-btn" data-mode="calendar">日历</button>\n<select class="mode-select" onchange="if(this.value)switchMode(this.value);this.selectedIndex=0;" style="background:rgba(0,248,255,0.06);color:#e8edf5;border:1px solid rgba(0,248,255,0.15);border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;outline:none;">\n<option value="">更多视图 ▾</option>\n<option value="subway">🚇 地铁线路图</option>\n<option value="parallel">📊 平行坐标</option>\n<option value="polar">🎯 年轮环图</option>\n<option value="waterfall">🌊 瀑布图</option>\n<option value="range">📐 月度振幅</option>\n<option value="bump">🏆 排名变化</option>\n<option value="impact">💥 事件冲击</option>\n<option value="percentile">📈 区间分位</option>\n</select>\n<span class="timeline-sep"></span>\n<span style="color:var(--text-dim);font-size:11px;letter-spacing:1px;margin-right:4px;">坐标:</span>\n<button class="filter-btn scale-btn active" data-scale="lin">线性</button>\n<button class="filter-btn scale-btn" data-scale="log">对数</button>\n<span class="timeline-sep"></span>\n<button class="filter-btn" id="normToggle">归一化对比</button>\n</div>\n<div id="timelineChart" style="width:100%;height:400px;"></div>\n<div style="display:flex;gap:24px;flex-wrap:wrap;padding:14px 0 4px;font-size:13px;">\n<span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#f7931a;margin-right:6px;"></span> BTC 价格</span>\n<span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#00e5ff;margin-right:6px;"></span> 美元指数 DXY</span>\n<span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#00e676;margin-right:6px;"></span> 10Y 美债收益率</span>\n<span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:#b388ff;margin-right:6px;"></span> Fed 利率</span>\n<span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ffd700;margin-right:6px;"> </span> 黄金</span>\n<span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ff5252;margin-right:6px;"> </span> 原油</span>\n<span><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#4fc3f7;margin-right:6px;"></span> 纳斯达克</span>\n<span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:rgba(255,51,85,0.5);margin-right:6px;"></span> 重大事件</span>\n<span><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:rgba(0,255,136,0.5);margin-right:6px;"></span> 未来展望</span>\n</div>\n<div class="analysis-card" id="analysisCard" style="display:none;">\n<div class="analysis-header">\n<div class="analysis-header-left">\n<span class="analysis-badge" id="analysisBadge">--</span>\n<span class="analysis-title" id="analysisTitle">--</span>\n<span class="analysis-date" id="analysisDate">--</span>\n</div>\n<button class="analysis-close" onclick="closeAnalysis()">✕</button>\n</div>\n<div id="analysisChart" style="width:100%;height:180px;"></div>\n<div id="analysisBody"></div>\n<div class="analysis-event-hint">点击其他事件标记切换分析</div>\n</div>\n</div>\n</div>\n<!-- ===== 关键指标 ===== -->\n<div class="stat-grid">\n<div class="stat-card stat-cyan">\n<div class="value" id="statEvents">--</div>\n<div class="label">活跃事件</div>\n</div>\n<div class="stat-card stat-magenta">\n<div class="value" id="statUrgent">--</div>\n<div class="label">⚠ 需关注</div>\n</div>\n<div class="stat-card stat-green">\n<div class="value" id="statBrief">--</div>\n<div class="label">📋 简报级</div>\n</div>\n<div class="stat-card" id="healthCard">\n<div class="value" id="statSource">--%</div>\n<div class="label">📡 数据源健康</div>\n</div>\n</div>\n<!-- ===== 三栏详情 ===== -->\n<div class="tri-grid">\n<div class="card">\n<div class="card-title">📊 评分全景</div>\n<div id="scoresContainer"><div class="loading"><div class="spinner"></div>加载中...</div></div>\n</div>\n<div class="card">\n<div class="card-title">🔔 最近 AI 信号 <span id="fbStats" style="font-size:11px;font-weight:normal;color:var(--text-dim);margin-left:8px;"></span></div>\n<div id="signalContainer"><div class="loading"><div class="spinner"></div>加载中...</div></div>\n</div>\n<div class="card">\n<div class="card-title">📡 系统状态</div>\n<div id="sysStatus"><div class="loading"><div class="spinner"></div>加载中...</div></div>\n<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">\n<div style="font-size:11px;color:var(--text-dim);margin-bottom:8px;letter-spacing:1px;">信号来源覆盖率</div>\n<div id="coverageBar"></div>\n</div>\n</div>\n</div>\n<!-- ===== 每日统计 ===== -->\n<div id="statsContainer" style="display:none;"></div>\n<!-- ===== 信号准确率 ===== -->\n<div id="perfContainer" style="margin-top:8px;display:none;">\n<div class="card-title" style="margin:12px 12px 6px;">信号准确率追踪 <span class="perf-updated-at" style="font-size:11px;color:var(--text-dim);"></span></div>\n<div class="perf-summary" style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;padding:6px 12px;">\n<div class="stat-card"><div class="value" id="perfTotal">--</div><div class="label">总信号</div></div>\n<div class="stat-card stat-cyan"><div class="value" id="perfChecked">--</div><div class="label">已验证</div></div>\n<div class="stat-card" id="perfAccCard"><div class="value" id="perfAcc">--</div><div class="label">准确率</div></div>\n<div class="stat-card"><div class="value" id="perfPending">--</div><div class="label">待验证</div></div>\n<div class="stat-card"><div class="value" id="perfCorrect">--</div><div class="label">正确</div></div>\n<div class="stat-card"><div class="value" id="perfWrong">--</div><div class="label">错误</div></div>\n</div>\n<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:6px 12px;">\n<!-- 混淆矩阵 -->\n<div class="perf-card">\n<div class="perf-card-title">混淆矩阵</div>\n<div id="perfCM" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px;">\n<div style="text-align:center;padding:8px;border-radius:6px;background:rgba(0,255,136,0.08);">\n<div id="cmBullCorrect" style="font-size:20px;font-weight:700;color:#00e676;">0</div>\n<div style="color:var(--text-dim);margin-top:2px;">看多正确 ✓</div>\n</div>\n<div style="text-align:center;padding:8px;border-radius:6px;background:rgba(255,51,85,0.08);">\n<div id="cmBullWrong" style="font-size:20px;font-weight:700;color:#ff3355;">0</div>\n<div style="color:var(--text-dim);margin-top:2px;">看多错误 ✗</div>\n</div>\n<div style="text-align:center;padding:8px;border-radius:6px;background:rgba(255,51,85,0.08);">\n<div id="cmBearWrong" style="font-size:20px;font-weight:700;color:#ff3355;">0</div>\n<div style="color:var(--text-dim);margin-top:2px;">看空错误 ✗</div>\n</div>\n<div style="text-align:center;padding:8px;border-radius:6px;background:rgba(0,255,136,0.08);">\n<div id="cmBearCorrect" style="font-size:20px;font-weight:700;color:#00e676;">0</div>\n<div style="color:var(--text-dim);margin-top:2px;">看空正确 ✓</div>\n</div>\n</div>\n</div>\n<!-- 按资产类型 + 置信度 -->\n<div class="perf-card">\n<div class="perf-card-title">按资产类型</div>\n<div id="perfByType" style="font-size:12px;"></div>\n<div class="perf-card-title" style="margin-top:8px;">按置信度分层</div>\n<div id="perfByConf" style="font-size:12px;"></div>\n</div>\n</div>\n<!-- 置信度校准 -->\n<div style="padding:0 12px 8px;">\n<div class="perf-card">\n<div class="perf-card-title">置信度校准 <span id="calibInfo" style="font-size:10px;color:var(--text-dim);font-weight:normal;"></span></div>\n<div id="calibChart" style="height:140px;width:100%;"></div>\n<div id="calibRec" style="font-size:11px;color:var(--text-dim);margin-top:4px;"></div>\n</div>\n</div>\n<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:6px 12px 12px;">\n<!-- 标的排名 -->\n<div class="perf-card">\n<div class="perf-card-title">标的排名(按信号数)</div>\n<div id="perfBySymbol" style="font-size:11px;max-height:200px;overflow-y:auto;"></div>\n</div>\n<!-- 近期验证结果 -->\n<div class="perf-card">\n<div class="perf-card-title">近期验证</div>\n<div id="perfRecent" style="font-size:11px;max-height:200px;overflow-y:auto;"></div>\n</div>\n</div>\n</div>\n<!-- ===== 叙事情绪 ===== -->\n<div id="sentimentContainer" style="margin-top:8px;display:none;">\n<div class="card-title" style="margin:12px 12px 6px;">📰 叙事情绪 <span id="sentimentUpdatedAt" style="font-size:11px;color:var(--text-dim);"></span></div>\n<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:6px 12px;">\n<div class="perf-card">\n<div class="perf-card-title">情绪分布</div>\n<div id="sentDist" style="font-size:13px;text-align:center;padding:8px 0;">\n<div style="display:flex;gap:12px;justify-content:center;">\n<span><span id="sPos" style="color:var(--green);font-weight:700;">0</span> 正面</span>\n<span><span id="sNeu" style="color:var(--text-dim);font-weight:700;">0</span> 中性</span>\n<span><span id="sNeg" style="color:var(--red);font-weight:700;">0</span> 负面</span>\n</div>\n</div>\n</div>\n<div class="perf-card">\n<div class="perf-card-title">趋势方向</div>\n<div id="sentTrend" style="font-size:13px;text-align:center;padding:8px 0;">\n<div style="display:flex;gap:12px;justify-content:center;">\n<span><span id="sImp" style="color:var(--green);font-weight:700;">0</span> 改善 ↑</span>\n<span><span id="sDet" style="color:var(--red);font-weight:700;">0</span> 恶化 ↓</span>\n</div>\n</div>\n</div>\n<div class="perf-card">\n<div class="perf-card-title">覆盖标的</div>\n<div id="sentTotal" style="font-size:24px;font-weight:700;text-align:center;padding:4px 0;color:var(--cyan);">0</div>\n</div>\n</div>\n<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:6px 12px 12px;">\n<div class="perf-card">\n<div class="perf-card-title">最正面</div>\n<div id="sentTopPos" style="font-size:11px;max-height:150px;overflow-y:auto;"></div>\n</div>\n<div class="perf-card">\n<div class="perf-card-title">最负面</div>\n<div id="sentTopNeg" style="font-size:11px;max-height:150px;overflow-y:auto;"></div>\n</div>\n</div>\n</div>\n<!-- ===== 相关性矩阵 ===== -->\n<div id="corrContainer" style="margin-top:8px;display:none;">\n<div class="card-title" style="margin:12px 12px 6px;">\n<span style="font-size:13px;">🔗 资产相关性</span>\n<span id="corrUpdatedAt" style="font-size:10px;color:var(--text-dim);margin-left:8px;"></span>\n<span id="corrWindow" style="font-size:10px;color:var(--cyan);margin-left:4px;"></span>\n</div>\n<div style="padding:0 12px 12px;display:flex;flex-direction:column;gap:10px;">\n<!-- 币种相关性热力图 -->\n<div class="perf-card" id="corrCryptoSection" style="padding:10px;">\n<div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;">币种间相关性 <span id="corrTopPos" style="color:var(--green);font-weight:600;">--</span> <span id="corrTopNeg" style="color:var(--red);font-weight:600;">--</span></div>\n<div id="corrCryptoHeatmap" style="width:100%;height:240px;"></div>\n</div>\n<!-- 跨资产相关性表格 -->\n<div class="perf-card" id="corrCrossSection" style="padding:10px;display:none;">\n<div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;">币种 × 宏观</div>\n<div id="corrCrossTable" style="width:100%;overflow-x:auto;"></div>\n</div>\n</div>\n</div>\n<div class="scroll-hint">﹀ 继续向下 ﹀</div>\n<div class="footer">\n<span class="last-update" id="lastUpdate">最后更新: --</span>\n    · 每30秒自动刷新\n    · <a href="/architecture" style="color:var(--text-dim);">架构</a>\n</div>\n</div>\n<!-- ===== 详情弹窗 ===== -->\n<div class="modal-overlay" id="detailModal" onclick="closeDetail(event)" style="display:none;">\n<div class="modal-card" onclick="event.stopPropagation()">\n<div class="modal-header">\n<div class="modal-title"><span id="detailSym">--</span> <span class="badge" id="detailBadge">--</span></div>\n<button class="modal-close" onclick="closeDetail()">✕</button>\n</div>\n<div class="modal-body">\n<div class="detail-grid">\n<div class="detail-item"><span class="dl">评分</span><span class="dv" id="detailScore">--</span></div>\n<div class="detail-item"><span class="dl">事件数</span><span class="dv" id="detailEvents">--</span></div>\n<div class="detail-item"><span class="dl">维度</span><span class="dv" id="detailDims">--</span></div>\n<div class="detail-item"><span class="dl">时间跨度</span><span class="dv" id="detailSpan">--</span></div>\n</div>\n<div style="margin-top:12px;">\n<div id="detailChart" style="width:100%;height:100px;"></div>\n</div>\n<div style="margin-top:12px;">\n<div class="card-title" style="margin-bottom:6px;">⬡ 事件明细</div>\n<div id="detailEventsList" style="max-height:300px;overflow-y:auto;">\n<div class="loading">加载中...</div>\n</div>\n</div>\n</div>\n</div>\n</div>\n<!-- ===== 设置弹窗 ===== -->\n<div class="modal-overlay" id="settingsModal" onclick="closeSettingsModal(event)" style="display:none;">\n<div class="modal-card" onclick="event.stopPropagation()" style="max-width:500px;">\n<div class="modal-header">\n<div class="modal-title">⚙ 系统配置与密钥管理</div>\n<button class="modal-close" onclick="closeSettingsModal()">✕</button>\n</div>\n<div class="modal-body" style="display:flex; flex-direction:column; gap:14px;">\n<div>\n<label style="display:block; font-size:12px; color:var(--text-dim); margin-bottom:4px;">DeepSeek API Key (用于信号研判评估)</label>\n<input id="inputDeepSeekKey" placeholder="sk-..." style="width:100%; background:rgba(0,0,0,0.3); border:1px solid var(--border); color:#fff; padding:8px 12px; border-radius:6px; font-family:monospace; outline:none;" type="password"/>\n</div>\n<div>\n<label style="display:block; font-size:12px; color:var(--text-dim); margin-bottom:4px;">ServerChan Push Key (微信推送密钥)</label>\n<input id="inputServerChanKey" placeholder="SCT..." style="width:100%; background:rgba(0,0,0,0.3); border:1px solid var(--border); color:#fff; padding:8px 12px; border-radius:6px; font-family:monospace; outline:none;" type="password"/>\n</div>\n<div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">\n<button onclick="closeSettingsModal()" style="padding:6px 14px; background:transparent; border:1px solid var(--border); color:var(--text-dim); border-radius:4px; cursor:pointer;">取消</button>\n<button onclick="saveSettings()" style="padding:6px 18px; background:var(--cyan); border:none; color:#000; font-weight:600; border-radius:4px; cursor:pointer;">保存设置</button>\n</div>\n</div>\n</div>\n</div>\n\n\n\n';

export default function Dashboard() {
  const containerRef = useRef(null);

  useEffect(() => {
    // Set globals that the original inline script expects
    window.CONFIG = CONFIG;
    window.Store = Store;
    window.DataAPI = DataAPI;
    window.Engine = Engine;
    window.EventWindow = EventWindow;
    window.echarts = echarts;
    window.Volatility = Volatility;
    window.Correlation = Correlation;
    window.Performance = Performance;

    // Intercept fetches
    const origFetch = window.fetch;
    window.fetch = localFetch;

    // Inject styles
    const style = document.createElement('style');
    style.id = 'dashboard-styles';
    style.innerHTML = "\n/* ===== Dashboard-specific overrides ===== */\n:root{--bg:#080c18;--surface:rgba(16,24,48,0.75);--border:rgba(0,248,255,0.15);}\nbody{padding:20px;}\nbody::before{\n  background:\n    radial-gradient(ellipse at 20% 50%, rgba(0,248,255,0.06) 0%, transparent 50%),\n    radial-gradient(ellipse at 80% 50%, rgba(255,0,170,0.06) 0%, transparent 50%),\n    radial-gradient(ellipse at 50% 100%, rgba(0,255,136,0.04) 0%, transparent 40%);\n}\n\n/* ===== Layout ===== */\n.stats-bar{margin-top:6px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;}\n.stats-bar .s-total{font-size:13px;color:var(--text-dim);}\n.stats-bar .s-total strong{color:var(--cyan);font-size:16px;}\n.stats-bar .s-chips{display:flex;gap:6px;flex-wrap:wrap;}\n.stats-bar .s-chip{padding:2px 10px;border-radius:12px;font-size:11px;background:rgba(0,248,255,0.06);border:1px solid rgba(0,248,255,0.12);}\n.stats-bar .s-chip .num{color:var(--cyan);font-weight:600;margin-right:3px;}\n.stats-bar .s-bar{display:flex;align-items:end;gap:2px;height:24px;}\n.stats-bar .s-bar-item{width:10px;border-radius:2px 2px 0 0;background:var(--cyan);opacity:0.4;transition:opacity 0.2s;}\n.stats-bar .s-bar-item:hover{opacity:0.8;}\n.header .clock{font-size:18px;color:var(--cyan);letter-spacing:2px;}\n.header-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px;}\n.health-bar{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;}\n.health-bar .h-item{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-dim);}\n.health-bar .h-dot{width:6px;height:6px;border-radius:50%;display:inline-block;}\n.health-bar .h-dot.healthy{background:var(--green);box-shadow:0 0 6px rgba(0,255,136,0.5);}\n.health-bar .h-dot.degraded{background:var(--yellow);box-shadow:0 0 6px rgba(255,187,0,0.5);}\n.health-bar .h-dot.unknown{background:var(--text-dim);}\n.health-bar .h-name{max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n.vol-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;letter-spacing:1px;border:1px solid;cursor:default;}\n.vol-badge.low{border-color:rgba(0,255,136,0.3);color:var(--green);background:rgba(0,255,136,0.06);}\n.vol-badge.medium{border-color:rgba(255,187,0,0.3);color:var(--yellow);background:rgba(255,187,0,0.06);}\n.vol-badge.high{border-color:rgba(255,51,85,0.3);color:var(--red);background:rgba(255,51,85,0.06);}\n\n/* ===== Stat Grid ===== */\n.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;}\n.stat-card{text-align:center;padding:24px 16px;}\n.stat-card .value{\n  font-size:40px;font-weight:700;letter-spacing:1px;\n  margin-bottom:4px;transition:color 0.5s;\n}\n.stat-card .label{font-size:12px;text-transform:uppercase;letter-spacing:2px;color:var(--text-dim);}\n.stat-cyan .value{color:var(--cyan);}\n.stat-magenta .value{color:var(--magenta);}\n.stat-green .value{color:var(--green);}\n.stat-red .value{color:var(--red);}\n\n/* ===== Alert Cards ===== */\n.alert-row{display:flex;flex-direction:column;gap:8px;margin-bottom:24px;}\n.alert-item{\n  display:flex;align-items:center;gap:14px;\n  padding:14px 18px;border-radius:10px;\n  background:rgba(255,51,85,0.08);border:1px solid rgba(255,51,85,0.25);\n  transition:all 0.2s;\n}\n.alert-item:hover{background:rgba(255,51,85,0.12);border-color:rgba(255,51,85,0.4);}\n.alert-item.brief-level{background:rgba(255,187,0,0.06);border-color:rgba(255,187,0,0.2);}\n.alert-item.brief-level:hover{background:rgba(255,187,0,0.1);border-color:rgba(255,187,0,0.35);}\n.alert-sym{font-size:18px;font-weight:700;color:#fff;min-width:70px;}\n.alert-score{font-size:14px;font-weight:600;min-width:60px;text-align:center;}\n.alert-score.urgent{color:var(--red);}\n.alert-score.brief{color:var(--yellow);}\n.alert-details{flex:1;font-size:13px;color:var(--text-dim);line-height:1.5;}\n.alert-details strong{color:var(--text);}\n.alert-details .dim-tag{\n  display:inline-block;padding:1px 8px;border-radius:3px;font-size:11px;margin:0 2px;\n  background:rgba(0,248,255,0.1);color:var(--cyan);\n}\n.alert-details .dim-tag.price{background:rgba(255,51,85,0.15);color:var(--red);}\n.alert-details .dim-tag.onchain{background:rgba(0,255,136,0.12);color:var(--green);}\n.alert-details .dim-tag.macro{background:rgba(255,187,0,0.12);color:var(--yellow);}\n.alert-details .dim-tag.sentiment{background:rgba(255,0,170,0.12);color:var(--magenta);}\n.alert-events{font-size:12px;color:var(--text-dim);min-width:90px;text-align:right;}\n.alert-none{padding:20px;text-align:center;color:var(--text-dim);font-size:14px;border:1px dashed var(--border);border-radius:10px;}\n\n/* ===== Enhanced Alert Hierarchy ===== */\n.alert-item.urgent-level{\n  background:linear-gradient(135deg,rgba(255,51,85,0.12),rgba(255,51,85,0.04));\n  border-color:rgba(255,51,85,0.35);\n  box-shadow:0 0 20px rgba(255,51,85,0.06),inset 0 0 40px rgba(255,51,85,0.02);\n}\n.alert-item.urgent-level:hover{\n  background:linear-gradient(135deg,rgba(255,51,85,0.18),rgba(255,51,85,0.06));\n  border-color:rgba(255,51,85,0.5);\n  box-shadow:0 0 30px rgba(255,51,85,0.12);\n}\n.alert-item.brief-level{\n  background:linear-gradient(135deg,rgba(255,187,0,0.08),rgba(255,187,0,0.02));\n  border-color:rgba(255,187,0,0.25);\n}\n.alert-item.brief-level:hover{\n  background:linear-gradient(135deg,rgba(255,187,0,0.12),rgba(255,187,0,0.04));\n  border-color:rgba(255,187,0,0.4);\n}\n.alert-score-badge{\n  display:inline-flex;align-items:center;gap:6px;\n  padding:4px 14px;border-radius:20px;font-size:13px;font-weight:700;\n  letter-spacing:0.5px;min-width:70px;justify-content:center;\n}\n.alert-score-badge.urgent{\n  background:rgba(255,51,85,0.2);color:var(--red);\n  border:1px solid rgba(255,51,85,0.3);\n  box-shadow:0 0 12px rgba(255,51,85,0.15);\n}\n.alert-score-badge.brief{\n  background:rgba(255,187,0,0.15);color:var(--yellow);\n  border:1px solid rgba(255,187,0,0.25);\n}\n.alert-trend-up{color:var(--red);font-size:11px;}\n.alert-trend-down{color:var(--green);font-size:11px;}\n.alert-trend-flat{color:var(--text-dim);font-size:11px;}\n.alert-dim-tag{\n  display:inline-flex;align-items:center;gap:3px;\n  padding:2px 8px;border-radius:4px;font-size:10px;font-weight:500;\n}\n.alert-dim-tag.price{background:rgba(255,51,85,0.12);color:var(--red);}\n.alert-dim-tag.onchain{background:rgba(0,255,136,0.1);color:var(--green);}\n.alert-dim-tag.macro{background:rgba(255,187,0,0.1);color:var(--yellow);}\n.alert-dim-tag.sentiment{background:rgba(255,0,170,0.1);color:var(--magenta);}\n.alert-dim-tag.derivatives{background:rgba(0,248,255,0.1);color:var(--cyan);}\n\n/* ===== Micro Progress Bars ===== */\n.micro-bar{\n  display:flex;gap:3px;align-items:center;flex:1;max-width:120px;\n}\n.micro-bar-track{\n  flex:1;height:6px;border-radius:3px;\n  background:rgba(255,255,255,0.06);overflow:hidden;\n}\n.micro-bar-fill{\n  height:100%;border-radius:3px;transition:width 0.8s ease;\n}\n.micro-bar-fill.green{background:var(--green);box-shadow:0 0 6px rgba(0,255,136,0.3);}\n.micro-bar-fill.yellow{background:var(--yellow);box-shadow:0 0 6px rgba(255,187,0,0.3);}\n.micro-bar-fill.red{background:var(--red);box-shadow:0 0 6px rgba(255,51,85,0.3);}\n.micro-bar-label{font-size:10px;color:var(--text-dim);white-space:nowrap;min-width:28px;text-align:right;}\n\n/* ===== Score Row Hover Tooltip ===== */\n.score-row-wrap{position:relative;}\n.score-preview-popup{\n  display:none;position:absolute;right:0;top:100%;z-index:50;\n  background:rgba(10,14,26,0.96);border:1px solid rgba(0,248,255,0.2);\n  border-radius:8px;padding:10px 14px;min-width:200px;\n  box-shadow:0 8px 32px rgba(0,0,0,0.6);font-size:12px;\n  backdrop-filter:blur(8px);\n}\n.score-row-wrap:hover .score-preview-popup{display:block;}\n.pev-row{display:flex;justify-content:space-between;padding:3px 0;gap:16px;}\n.pev-type{color:var(--text);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n.pev-sev{font-weight:600;min-width:32px;text-align:right;}\n.pev-time{color:var(--text-dim);font-size:10px;min-width:44px;text-align:right;}\n\n/* ===== Coverage Interactive ===== */\n.coverage-dim{\n  cursor:pointer;transition:all 0.2s;\n  font-size:10px;color:var(--text-dim);background:rgba(255,255,255,0.04);\n  padding:2px 8px;border-radius:8px;display:inline-flex;align-items:center;gap:4px;\n}\n.coverage-dim:hover{\n  background:rgba(0,248,255,0.1);color:var(--text);\n}\n.coverage-dim.active{\n  background:rgba(0,248,255,0.15);color:var(--cyan);box-shadow:0 0 8px rgba(0,248,255,0.1);\n}\n.coverage-expand{\n  margin-top:4px;padding:6px 8px;border-radius:6px;\n  background:rgba(255,255,255,0.02);font-size:11px;\n  display:none;animation:fadeIn 0.2s;\n}\n.coverage-expand.show{display:block;}\n\n/* ===== System Status Micro Bars ===== */\n.sys-row-bar{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;}\n.sys-row-bar:last-child{border-bottom:none;}\n.sys-bar-label{color:var(--text-dim);min-width:80px;font-size:12px;}\n.sys-bar-value{color:var(--text);font-weight:500;min-width:40px;text-align:right;font-size:12px;}\n\n/* ===== 系统状态 ===== */\n.sys-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;}\n.sys-row:last-child{border-bottom:none;}\n.sys-label{color:var(--text-dim);}\n.sys-value{color:var(--text);font-weight:500;}\n.sys-ok{color:var(--green);}\n.sys-warn{color:var(--yellow);}\n.sys-bad{color:var(--red);}\n.sys-source-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px;}\n.sys-source-item{padding:3px 8px;border-radius:4px;font-size:11px;display:flex;justify-content:space-between;}\n\n/* ===== 详情弹窗 ===== */\n.modal-overlay{position:fixed;inset:0;z-index:100;background:rgba(4,8,20,0.85);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;}\n.modal-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);width:90%;max-width:560px;max-height:80vh;overflow:hidden;box-shadow:0 0 60px rgba(0,248,255,0.15);}\n.modal-header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid var(--border);}\n.modal-title{font-size:18px;font-weight:600;display:flex;align-items:center;gap:10px;}\n.modal-close{background:none;border:1px solid var(--border);color:var(--text-dim);font-size:16px;border-radius:6px;width:30px;height:30px;cursor:pointer;font-family:var(--font);}\n.modal-close:hover{color:var(--text);border-color:var(--cyan);}\n.modal-body{padding:20px;overflow-y:auto;max-height:calc(80vh - 60px);}\n.detail-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:8px;}\n.detail-item{text-align:center;padding:10px;border-radius:8px;background:rgba(255,255,255,0.03);}\n.detail-item .dl{display:block;font-size:11px;color:var(--text-dim);margin-bottom:4px;}\n.detail-item .dv{font-size:18px;font-weight:600;color:var(--text);}\n.detail-event-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.03);font-size:13px;}\n.detail-event-row:last-child{border-bottom:none;}\n.detail-e-time{color:var(--text-dim);font-size:12px;min-width:60px;}\n.detail-e-type{flex:1;color:var(--text);}\n.detail-e-sev{min-width:40px;text-align:right;font-weight:600;}\n.detail-e-dim{min-width:40px;text-align:center;font-size:11px;padding:1px 6px;border-radius:3px;background:rgba(0,248,255,0.1);color:var(--cyan);}\n\n/* ===== Main Grid ===== */\n.main-grid{display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-bottom:16px;}\n@media(max-width:768px){.main-grid{grid-template-columns:1fr;}}\n.tri-grid{display:grid;grid-template-columns:1.2fr 1fr 0.8fr;gap:16px;margin-bottom:16px;}\n@media(max-width:768px){.tri-grid{grid-template-columns:1fr;}}\n.tri-grid > .card{min-width:0;}\n\n/* ===== Table ===== */\n#scoresContainer{max-height:220px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--border) transparent;}\n#scoresContainer::-webkit-scrollbar{width:4px;}\n#scoresContainer::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}\n.score-table{width:100%;border-collapse:collapse;font-size:14px;}\n.score-table th{\n  text-align:left;padding:10px 12px;font-size:11px;text-transform:uppercase;\n  letter-spacing:2px;color:var(--text-dim);border-bottom:1px solid var(--border);\n  font-weight:600;\n}\n.score-table td{padding:12px;border-bottom:1px solid rgba(255,255,255,0.04);}\n.score-table tr:last-child td{border-bottom:none;}\n.score-table .sym{font-weight:600;color:#fff;font-size:15px;}\n.score-table .num{font-weight:600;text-align:right;}\n.score-table .dims{font-size:12px;color:var(--text-dim);}\n.badge{\n  display:inline-block;padding:3px 10px;border-radius:4px;\n  font-size:11px;font-weight:600;letter-spacing:0.5px;\n}\n.badge-urgent{background:rgba(255,51,85,0.2);color:var(--red);border:1px solid rgba(255,51,85,0.3);}\n.badge-brief{background:rgba(255,187,0,0.15);color:var(--yellow);border:1px solid rgba(255,187,0,0.3);}\n.badge-normal{background:rgba(0,248,255,0.1);color:var(--cyan);border:1px solid rgba(0,248,255,0.2);}\n.score-bar{\n  display:inline-block;height:4px;border-radius:2px;margin-left:8px;vertical-align:middle;\n  transition:width 0.5s;\n}\n.w-break{font-size:10px;margin-top:3px;display:flex;gap:6px;}\n.w-f{color:var(--cyan);}\n.w-m{color:var(--yellow);}\n.w-s{color:var(--text-dim);}\n\n/* ===== Source Health ===== */\n.health-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}\n.health-item{\n  display:flex;justify-content:space-between;align-items:center;\n  padding:10px 14px;border-radius:8px;\n  background:rgba(255,255,255,0.02);font-size:13px;\n}\n.health-item .name{color:var(--text);}\n.health-item .dot{\n  width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px;\n  vertical-align:middle;\n}\n.dot-healthy{background:var(--green);box-shadow:0 0 8px rgba(0,255,136,0.5);}\n.dot-degraded{background:var(--yellow);box-shadow:0 0 8px rgba(255,187,0,0.5);}\n.dot-unknown{background:var(--text-dim);}\n.pulse{animation:pulse 2s infinite;}\n\n/* ===== Recent Signals ===== */\n.signal-feed{max-height:220px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--border) transparent;}\n.signal-group{font-size:11px;letter-spacing:2px;color:var(--text-dim);padding:8px 0 4px;font-weight:600;}\n.signal-feed::-webkit-scrollbar{width:4px;}\n.signal-feed::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}\n.signal-item{\n  display:flex;align-items:center;gap:12px;\n  padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.03);\n  font-size:13px;animation:fadeIn 0.3s;\n}\n.signal-item:last-child{border-bottom:none;}\n.signal-time{color:var(--text-dim);font-size:12px;white-space:nowrap;min-width:60px;}\n.signal-sym{font-weight:600;color:#fff;min-width:70px;}\n.signal-dir{\n  padding:3px 10px;border-radius:4px;font-size:11px;font-weight:600;\n  min-width:52px;text-align:center;\n}\n.dir-bull{background:rgba(0,255,136,0.15);color:var(--green);border:1px solid rgba(0,255,136,0.3);}\n.dir-bear{background:rgba(255,51,85,0.15);color:var(--red);border:1px solid rgba(255,51,85,0.3);}\n.dir-neutral{background:rgba(0,248,255,0.1);color:var(--cyan);border:1px solid rgba(0,248,255,0.2);}\n.signal-conf{font-size:12px;color:var(--text-dim);min-width:44px;text-align:right;}\n.signal-summary{color:var(--text-dim);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n/* ===== Feedback Buttons ===== */\n.signal-fb{display:flex;gap:2px;align-items:center;min-width:44px;justify-content:flex-end;}\n.fb-btn{cursor:pointer;font-size:13px;padding:2px 4px;border-radius:4px;transition:all 0.15s;opacity:0.3;filter:grayscale(1);user-select:none;}\n.fb-btn:hover{opacity:0.9;filter:grayscale(0);background:rgba(255,255,255,0.06);}\n.fb-btn.fb-active{opacity:1;filter:grayscale(0);}\n.fb-btn.fb-up.fb-active{background:rgba(0,255,136,0.15);}\n.fb-btn.fb-down.fb-active{background:rgba(255,51,85,0.15);}\n.fb-btn.fb-up.fb-active::after{content:' ✔';font-size:10px;color:var(--green);}\n.fb-btn.fb-down.fb-active::after{content:' ✔';font-size:10px;color:var(--red);}\n.fb-toast{position:fixed;bottom:20px;right:20px;padding:10px 18px;border-radius:8px;background:rgba(0,248,255,0.12);border:1px solid var(--cyan);color:var(--cyan);font-size:13px;z-index:200;animation:fbIn 0.3s;pointer-events:none;}\n@keyframes fbIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}\n\n/* ===== Daily Stats ===== */\n.stats-section{margin-top:16px;}\n.stats-section .stat-grid-inner{display:flex;gap:16px;flex-wrap:wrap;}\n.stat-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}\n.stat-chip{\n  padding:8px 16px;border-radius:20px;font-size:13px;\n  background:rgba(0,248,255,0.08);border:1px solid rgba(0,248,255,0.15);\n}\n.stat-chip .num{color:var(--cyan);font-weight:600;margin-right:4px;}\n\n/* ===== Refresh hint ===== */\n.footer{text-align:center;padding:20px 0;font-size:12px;color:var(--text-dim);letter-spacing:1px;}\n.footer .last-update{color:var(--text-dim);}\n\n/* ===== Timeline Controls ===== */\n.timeline-toolbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:12px;}\n.filter-btn{\n  padding:4px 14px;border-radius:12px;border:1px solid var(--border);\n  background:rgba(255,255,255,0.03);color:var(--text-dim);\n  font-family:var(--font);font-size:11px;cursor:pointer;\n  transition:all 0.2s;letter-spacing:0.5px;\n}\n.filter-btn:hover{color:var(--text);border-color:var(--cyan);}\n.filter-btn.active{background:rgba(0,248,255,0.12);color:var(--cyan);border-color:rgba(0,248,255,0.4);}\n.filter-btn.range-btn.active{background:rgba(255,0,170,0.12);color:var(--magenta);border-color:rgba(255,0,170,0.4);}\n.timeline-sep{width:1px;height:20px;background:var(--border);margin:0 4px;}\n\n/* ===== Event Analysis Card ===== */\n.analysis-card{\n  margin-top:12px;padding:16px;border-radius:10px;\n  background:rgba(255,255,255,0.03);border:1px solid rgba(0,248,255,0.1);\n  animation:fadeIn 0.3s;\n}\n.analysis-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}\n.analysis-header-left{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}\n.analysis-badge{\n  display:inline-block;padding:2px 10px;border-radius:4px;\n  font-size:10px;font-weight:600;letter-spacing:1px;\n}\n.analysis-title{font-size:15px;font-weight:600;color:var(--text);}\n.analysis-date{font-size:12px;color:var(--text-dim);}\n.analysis-close{\n  background:none;border:1px solid var(--border);color:var(--text-dim);\n  font-size:14px;cursor:pointer;border-radius:6px;width:28px;height:28px;\n  display:flex;align-items:center;justify-content:center;transition:all 0.2s;\n  font-family:var(--font);\n}\n.analysis-close:hover{color:var(--text);border-color:var(--cyan);}\n.analysis-grid{display:grid;grid-template-columns:auto repeat(3,1fr);gap:0;font-size:13px;}\n.analysis-grid > div{padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.03);text-align:center;}\n.analysis-grid .glabel{text-align:left;color:var(--text-dim);font-size:11px;letter-spacing:1px;font-weight:500;}\n.analysis-grid .gheader{padding:6px 10px;text-align:center;color:var(--text-dim);font-size:10px;letter-spacing:1px;\n  border-bottom:1px solid var(--border);font-weight:500;}\n.analysis-grid .grow{text-align:center;padding:6px 10px;}\n.analysis-grid .grow-label{text-align:left;font-weight:500;padding:6px 10px;}\n.positive{color:var(--green);}\n.negative{color:var(--red);}\n.neutral{color:var(--text-dim);}\n.analysis-event-hint{font-size:11px;color:var(--text-dim);text-align:center;padding:4px 0 0;opacity:0.6;}\n\n/* ===== Outlook Card ===== */\n.outlook-card{padding:8px 4px;display:flex;flex-direction:column;gap:10px;}\n.outlook-row{display:flex;justify-content:space-between;align-items:center;padding:6px 12px;border-radius:6px;background:rgba(255,255,255,0.02);font-size:13px;}\n.outlook-label{color:var(--text-dim);font-size:11px;letter-spacing:1px;}\n.outlook-desc{padding:12px;border-radius:8px;background:rgba(0,255,136,0.05);border:1px solid rgba(0,255,136,0.1);font-size:13px;color:var(--text);line-height:1.6;}\n.stat-bar{display:flex;gap:10px;margin-bottom:16px;}\n.stat-bar .item{\n  flex:1;display:flex;align-items:center;gap:10px;\n  padding:10px 16px;border-radius:10px;\n  background:var(--surface);border:1px solid var(--border);\n  cursor:default;transition:border-color 0.3s;\n}\n.stat-bar .item:hover{border-color:rgba(0,248,255,0.35);}\n.stat-bar .num{font-size:20px;font-weight:700;letter-spacing:1px;min-width:32px;}\n.stat-bar .lbl{font-size:12px;color:var(--text-dim);letter-spacing:1px;}\n.stat-bar .bar-dot{width:4px;height:22px;border-radius:2px;flex-shrink:0;}\n.bottom-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;}\n@media(max-width:900px){.bottom-grid{grid-template-columns:1fr;}}\n.chart-section{margin-bottom:16px;}\n\n/* ===== Scroll indicator ===== */\n.perf-card{background:var(--card-bg);border-radius:8px;padding:10px;border:1px solid var(--border);}\n.perf-card-title{font-size:12px;font-weight:600;color:var(--text-dim);margin-bottom:6px;letter-spacing:1px;}\n.scroll-hint{\n  text-align:center;padding:4px 0 8px;font-size:11px;\n  color:var(--text-dim);letter-spacing:2px;opacity:0.5;\n  animation:scrollPulse 3s ease-in-out infinite;\n}\n@keyframes scrollPulse{\n  0%,100%{opacity:0.3;transform:translateY(0)}\n  50%{opacity:0.7;transform:translateY(4px)}\n}\n";
    document.head.appendChild(style);

    // Run original scripts
    try {
      const runScripts = () => {
        
// --- Script Segment ---

function openSettingsModal() {
  document.getElementById("inputDeepSeekKey").value = Store.get("key_deepseek") || "";
  document.getElementById("inputServerChanKey").value = Store.get("key_serverchan") || "";
  document.getElementById("settingsModal").style.display = "flex";
}
function closeSettingsModal(e) {
  if (!e || e.target.id === "settingsModal" || e.target.className === "modal-close") {
    document.getElementById("settingsModal").style.display = "none";
  }
}
function saveSettings() {
  Store.set("key_deepseek", document.getElementById("inputDeepSeekKey").value.trim());
  Store.set("key_serverchan", document.getElementById("inputServerChanKey").value.trim());
  document.getElementById("settingsModal").style.display = "none";
  alert("设置保存成功！");
}
// ===== Global API Interceptor (Replaces Python backend) =====
(function() {
  const originalFetch = window.fetch;
  window.fetch = async function(url, options) {
    if (typeof url === "string" && url.startsWith("/api/")) {
      console.log(`[API Interceptor] Intercepting: ${url}`);
      try {
        const u = new URL(url, window.location.href);
        const path = u.pathname;
        let data = null;

        if (path === "/api/overview") {
          const scores = Engine.eventWindow.getAllScores();
          const scoresArr = Object.entries(scores).map(([k, v]) => ({ symbol: k, ...v }));
          const health = SourceHealth.getAll();
          const urgent_count = scoresArr.filter(s => s.score >= CONFIG.SCORE_URGENT).length;
          const brief_count = scoresArr.filter(s => s.score >= CONFIG.SCORE_BRIEF && s.score < CONFIG.SCORE_URGENT).length;
          const healthy_count = Object.values(health).filter(h => h.status === "healthy").length;
          data = {
            active_events: scoresArr.length,
            urgent_count: urgent_count,
            brief_count: brief_count,
            healthy_sources: healthy_count,
            total_sources: Object.keys(health).length,
            timestamp: Date.now() / 1000
          };
        } else if (path === "/api/scores") {
          const symbol = u.searchParams.get("symbol");
          if (symbol) {
            const score = Engine.eventWindow.getScore(symbol);
            if (!score) {
              data = { error: "symbol not found" };
            } else {
              const rawEvents = Engine.eventWindow.getRawEvents(symbol, 20);
              const attribution = Engine.eventWindow.getAttribution(symbol);
              data = {
                symbol: symbol,
                score: score.score,
                events: score.events,
                dimensions: score.dimensions,
                span_hours: score.span_hours,
                score_fast: score.score_fast,
                score_medium: score.score_medium,
                score_slow: score.score_slow,
                attribution: attribution,
                detail_events: rawEvents
              };
            }
          } else {
            const raw = Store.get("event_window", {});
            const scores = [];
            const dimWeights = Engine.getEffectiveWeights();
            for (const sym of Object.keys(raw)) {
              const s = Engine.eventWindow.getScore(sym);
              if (s) {
                const eventsRaw = Engine.eventWindow.getRawEvents(sym, 3);
                s.recent_events = eventsRaw.map(e => ({
                  type: e.type,
                  dim: e.dimension,
                  ago: e.time_ago,
                  raw: {
                    sender_label: (e.raw || {}).sender_label || "",
                    receiver_label: (e.raw || {}).receiver_label || ""
                  }
                }));
                const attr = Engine.eventWindow.getAttribution(sym);
                const dims = attr ? attr.dimensions : {};
                s.attribution = {
                  dims: Object.keys(dims),
                  pcts: Object.fromEntries(Object.entries(dims).map(([k, v]) => [k, v.pct])),
                  factors: attr ? attr.factors : {}
                };
                scores.push({ symbol: sym, ...s });
              }
            }
            scores.sort((a, b) => b.score - a.score);
            data = scores;
          }
        } else if (path === "/api/history") {
          const limit = parseInt(u.searchParams.get("limit") || 30);
          const db = new HistoryDB();
          await db.open();
          data = await db.getHistory(limit);
        } else if (path === "/api/health") {
          data = SourceHealth.getAll();
        } else if (path === "/api/volatility") {
          data = await Volatility.getCurrent();
        } else if (path === "/api/feedback/stats") {
          const db = new HistoryDB();
          await db.open();
          data = await db.getFeedbackStats();
        } else if (path === "/api/feedback") {
          const body = options && options.body ? JSON.parse(options.body) : {};
          const db = new HistoryDB();
          await db.open();
          const ok = await db.submitFeedback(parseInt(body.signal_id), body.useful);
          data = { ok: ok };
        } else if (path === "/api/stats") {
          data = StatsCollector.getStats();
        } else if (path === "/api/push") {
          data = PushTracker.getStatus();
        } else if (path === "/api/performance") {
          data = Performance.getStats();
        } else if (path === "/api/rss-health") {
          const all = SourceHealth.getAll();
          const rss = {};
          for (const [name, info] of Object.entries(all)) {
            if (name.startsWith("rss_")) rss[name] = info;
          }
          data = rss;
        } else if (path === "/api/warmup") {
          data = { status: "ready", progress: 100, elapsed: 0 };
        } else if (path === "/api/budget") {
          data = { interval: CONFIG.SCAN_INTERVAL_CRYPTO, multiplier: 1.0 };
        } else if (path === "/api/coverage") {
          const raw = Store.get("event_window", {});
          const dims = {};
          let total = 0;
          let count = 0;
          for (const sym of Object.keys(raw)) {
            const s = Engine.eventWindow.getScore(sym);
            if (s) {
              count++;
              for (const d of s.dimensions || []) {
                dims[d] = (dims[d] || 0) + 1;
                total += 1;
              }
            }
          }
          data = { by_dimension: dims, total: total, active_symbols: count };
        } else if (path === "/api/sentiment") {
          // 简易情绪
          const tickers = await DataAPI.fetchBinanceTickers();
          const pos = [];
          const neg = [];
          for (const t of tickers) {
            const symbol = t.symbol.replace("USDT", "");
            if (!CONFIG.CUSTOM_CRYPTO_SYMBOLS.includes(symbol)) continue;
            const chg = parseFloat(t.priceChangePercent || 0);
            if (chg > 0) {
              pos.push({ symbol: symbol, score: chg / 10.0 });
            } else {
              neg.push({ symbol: symbol, score: chg / 10.0 });
            }
          }
          data = {
            status: "active",
            top_positive: pos.sort((a, b) => b.score - a.score).slice(0, 3),
            top_negative: neg.sort((a, b) => a.score - b.score).slice(0, 3)
          };
        } else if (path === "/api/correlation") {
          const matrixData = await Correlation.computeMatrix();
          if (!matrixData) {
            data = { crypto_crypto: {}, crypto_macro: {}, macro_macro: {} };
          } else {
            const matrix = matrixData.matrix;
            const crypto = ["BTC", "ETH", "SOL", "SUI"];
            const macro = ["DXY", "US10Y", "Gold", "Oil", "Nasdaq"];

            const crypto_crypto = {};
            const crypto_macro = {};
            const macro_macro = {};

            for (const c1 of crypto) {
              crypto_crypto[c1] = {};
              for (const c2 of crypto) {
                crypto_crypto[c1][c2] = matrix[c1] ? matrix[c1][c2] : null;
              }
              crypto_macro[c1] = {};
              for (const m of macro) {
                crypto_macro[c1][m] = matrix[c1] ? matrix[c1][m] : null;
              }
            }

            for (const m1 of macro) {
              macro_macro[m1] = {};
              for (const m2 of macro) {
                macro_macro[m1][m2] = matrix[m1] ? matrix[m1][m2] : null;
              }
            }

            data = {
              crypto_crypto: crypto_crypto,
              crypto_macro: crypto_macro,
              macro_macro: macro_macro,
              updated_at: matrixData.updated_at
            };
          }
        } else if (path === "/api/timeline") {
          data = await DataAPI.getTimelineData();
        } else if (path === "/api/timeline/analysis") {
          const eventName = u.searchParams.get("event");
          data = await getEventAnalysisLocal(eventName);
        }

        if (data !== null) {
          return {
            ok: true,
            status: 200,
            json: async () => data,
            text: async () => JSON.stringify(data)
          };
        }
      } catch (e) {
        console.error(`[API Interceptor] Error intercepting ${url}:`, e);
      }
    }
    return originalFetch(url, options);
  };
})();

async function getEventAnalysisLocal(event) {
  const data = await DataAPI.getTimelineData();
  const ev = data.events.find(e => e.name.includes(event));
  if (!ev) return { error: `event '${event}' not found` };

  const evDate = new Date(ev.date);

  const buildMap = (series, field) => {
    const m = {};
    for (const item of series) {
      const dStr = new Date(item.date * 1000).toISOString().split('T')[0];
      m[dStr] = item[field];
    }
    return m;
  };

  const btcMap = buildMap(data.btc, "price");
  const dxyMap = buildMap(data.dxy, "price");
  const tnxMap = buildMap(data.treasury, "yield");
  const goldMap = buildMap(data.gold || [], "price");
  const oilMap = buildMap(data.oil || [], "price");
  const nasdaqMap = buildMap(data.nasdaq || [], "price");

  const closest = (m, date, maxBack = 7) => {
    for (let off = 0; off < maxBack; off++) {
      const d = new Date(date);
      d.setDate(d.getDate() - off);
      const k = d.toISOString().split('T')[0];
      if (m[k] !== undefined) return m[k];
    }
    return null;
  };

  const windows = [7, 30, 90];
  const result = { event: ev.name, date: ev.date, type: ev.type, windows: [] };

  for (const w of windows) {
    const preDate = new Date(evDate); preDate.setDate(preDate.getDate() - w);
    const postDate = new Date(evDate); postDate.setDate(postDate.getDate() + w);

    const btcPre = closest(btcMap, preDate);
    const btcAt = closest(btcMap, evDate);
    const btcPost = closest(btcMap, postDate);
    const dxyPre = closest(dxyMap, preDate);
    const dxyAt = closest(dxyMap, evDate);
    const dxyPost = closest(dxyMap, postDate);
    const tnxPre = closest(tnxMap, preDate);
    const tnxAt = closest(tnxMap, evDate);
    const tnxPost = closest(tnxMap, postDate);
    const goldPre = closest(goldMap, preDate);
    const goldAt = closest(goldMap, evDate);
    const goldPost = closest(goldMap, postDate);
    const oilPre = closest(oilMap, preDate);
    const oilAt = closest(oilMap, evDate);
    const oilPost = closest(oilMap, postDate);
    const nasdaqPre = closest(nasdaqMap, preDate);
    const nasdaqAt = closest(nasdaqMap, evDate);
    const nasdaqPost = closest(nasdaqMap, postDate);

    const row = { window: `${w}天` };
    if (btcPre !== null && btcAt !== null && btcPost !== null) {
      row.btc = {
        pre_pct: Math.round(((btcAt - btcPre) / btcPre * 100) * 10) / 10,
        post_pct: Math.round(((btcPost - btcAt) / btcAt * 100) * 10) / 10
      };
    }
    if (dxyPre !== null && dxyAt !== null && dxyPost !== null) {
      row.dxy = {
        pre_pct: Math.round(((dxyAt - dxyPre) / dxyPre * 100) * 10) / 10,
        post_pct: Math.round(((dxyPost - dxyAt) / dxyAt * 100) * 10) / 10
      };
    }
    if (tnxPre !== null && tnxAt !== null && tnxPost !== null) {
      row.treasury = {
        pre_bp: Math.round((tnxAt - tnxPre) * 100),
        post_bp: Math.round((tnxPost - tnxAt) * 100)
      };
    }
    if (goldPre !== null && goldAt !== null && goldPost !== null) {
      row.gold = {
        pre_pct: Math.round(((goldAt - goldPre) / goldPre * 100) * 10) / 10,
        post_pct: Math.round(((goldPost - goldAt) / goldAt * 100) * 10) / 10
      };
    }
    if (oilPre !== null && oilAt !== null && oilPost !== null) {
      row.oil = {
        pre_pct: Math.round(((oilAt - oilPre) / oilPre * 100) * 10) / 10,
        post_pct: Math.round(((oilPost - oilAt) / oilAt * 100) * 10) / 10
      };
    }
    if (nasdaqPre !== null && nasdaqAt !== null && nasdaqPost !== null) {
      row.nasdaq = {
        pre_pct: Math.round(((nasdaqAt - nasdaqPre) / nasdaqPre * 100) * 10) / 10,
        post_pct: Math.round(((nasdaqPost - nasdaqAt) / nasdaqAt * 100) * 10) / 10
      };
    }
    result.windows.push(row);
  }

  const buildSeries = (valMap, evDateStr, assetType, windowSize = 90) => {
    const evD = new Date(evDateStr);
    const evVal = closest(valMap, evD);
    if (evVal === null) return [];
    const series = [];
    for (let offset = -windowSize; offset <= windowSize; offset++) {
      const d = new Date(evD);
      d.setDate(d.getDate() + offset);
      const val = closest(valMap, d);
      if (val !== null) {
        let change = 0;
        if (assetType === "treasury") {
          change = Math.round((val - evVal) * 100 * 10) / 10;
        } else {
          change = Math.round(((val - evVal) / evVal * 100) * 10) / 10;
        }
        series.push({ offset: offset, change: change });
      }
    }
    return series;
  };

  result.series = {
    btc: buildSeries(btcMap, ev.date, "btc"),
    dxy: buildSeries(dxyMap, ev.date, "dxy"),
    treasury: buildSeries(tnxMap, ev.date, "treasury"),
    gold: buildSeries(goldMap, ev.date, "gold"),
    oil: buildSeries(oilMap, ev.date, "oil"),
    nasdaq: buildSeries(nasdaqMap, ev.date, "nasdaq")
  };

  return result;
}

// 自动初始化评分扫描引擎
(async function() {
  console.log("[Engine] Initializing frontend scanning engine...");
  // 延迟启动，避免与页面加载冲突
  setTimeout(async () => {
    try {
      await Engine.init();
    } catch (e) {
      console.error("[Engine] Initialization failed:", e);
    }
  }, 2000);
})();

// ===== Clock =====
function updateClock(){
  const d=new Date();
  document.getElementById('clock').textContent=d.toTimeString().slice(0,8);
}
setInterval(updateClock,1000);updateClock();

// ===== Overview =====
async function loadOverview(){
  try{
    const r=await fetch('/api/overview');
    const d=await r.json();
    document.getElementById('statEvents').textContent=d.active_events;
    document.getElementById('statUrgent').textContent=d.urgent_count;
    document.getElementById('statBrief').textContent=d.brief_count;
    const pct=d.total_sources?Math.round(d.healthy_sources/d.total_sources*100):0;
    const el=document.getElementById('statSource');
    el.textContent=pct+'%';
    el.style.color=d.total_sources&&d.healthy_sources===d.total_sources?'var(--green)':
      d.healthy_sources>0?'var(--yellow)':'var(--red)';
  }catch(e){console.warn('overview err',e);}
}

// ===== Alerts =====
async function loadAlerts(){
  const section=document.getElementById('alertSection');
  const container=document.getElementById('alertContainer');
  try{
    const [scoreR, histR]=await Promise.all([
      fetch('/api/scores'), fetch('/api/history?limit=50')
    ]);
    const data=await scoreR.json();
    const history=await histR.json();
    // 建立 symbol → 最新 AI 分析 索引
    const aiMap={};
    for(const h of history){
      const sym=(h.symbol||'').toUpperCase();
      if(!aiMap[sym]||h.created_at>aiMap[sym].created_at) aiMap[sym]=h;
    }
    const urgent=data.filter(s=>s.score>=0.8);
    const brief=data.filter(s=>s.score>=0.4&&s.score<0.8);
    if(!urgent.length&&!brief.length){section.style.display='none';return;}
    section.style.display='block';
    let html='<div class="alert-row">';
    function renderEvts(s){
      if(!s.recent_events||!s.recent_events.length) return s.events+'次异动';
      return s.recent_events.map(e=>{
        let lbl='';
        const r=e.raw||{};
        const sLbl=r.sender_label||'';
        const rLbl=r.receiver_label||'';
        if(sLbl) lbl+='<span style="background:rgba(0,248,255,0.12);color:var(--cyan);padding:0 5px;border-radius:3px;font-size:9px;margin-left:3px;">'+sLbl+'</span>';
        if(rLbl) lbl+='<span style="background:rgba(0,255,136,0.12);color:var(--green);padding:0 5px;border-radius:3px;font-size:9px;margin-left:3px;">'+rLbl+'</span>';
        return e.type+lbl;
      }).join(' → ');
    }
    // 趋势函数
    function trendHtml(s){
      if(s.score_fast==null||s.score_medium==null) return '';
      const ratio=s.score_fast/s.score_medium;
      if(ratio>1.15) return '<span class="alert-trend-up">▲ 加剧</span>';
      if(ratio<0.6) return '<span class="alert-trend-down">▼ 缓和</span>';
      return '<span class="alert-trend-flat">◆ 平稳</span>';
    }
    function alertScoreBadge(score, cls){
      return `<span class="alert-score-badge ${cls}">${score.toFixed(2)}</span>`;
    }
    for(const s of urgent.slice(0,3)){
      const dims=s.dimensions.map(d=>`<span class="alert-dim-tag ${d}">${DIM_NAMES[d]||d}</span>`).join('');
      const evts=renderEvts(s);
      const ai=aiMap[s.symbol];
      let aiHtml='';
      if(ai&&ai.ai_direction){
        const dirIcon=ai.ai_direction==='bullish'?'📈':ai.ai_direction==='bearish'?'📉':'➡️';
        const dirColor=ai.ai_direction==='bullish'?'var(--green)':ai.ai_direction==='bearish'?'var(--red)':'var(--text-dim)';
        const conf=Math.round((ai.ai_confidence||0.5)*100);
        aiHtml=`<div style="margin-top:4px;font-size:12px;">
          <span style="color:${dirColor};font-weight:600">${dirIcon} AI: ${conf}%</span>
          <span style="color:var(--text-dim)"> ${ai.ai_summary||''}</span>
        </div>`;
      }
      html+=`<div class="alert-item urgent-level">
        <div class="alert-sym">
          ${s.symbol}
          <a href="https://www.tradingview.com/symbols/${s.symbol}USD/?exchange=BINANCE" target="_blank" style="font-size:10px;color:var(--text-dim);text-decoration:none;" title="TradingView 图表">↗</a>
        </div>
        ${alertScoreBadge(s.score,'urgent')}
        <div class="alert-details">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${dims} ${trendHtml(s)}</div>
          <div style="margin-top:3px;">${evts}</div>
          ${aiHtml}
        </div>
        <div class="alert-events">${spanText(s.span_hours)}</div>
      </div>`;
    }
    for(const s of brief.slice(0,2)){
      const dims=s.dimensions.map(d=>`<span class="alert-dim-tag ${d}">${DIM_NAMES[d]||d}</span>`).join('');
      const evts=renderEvts(s);
      html+=`<div class="alert-item brief-level">
        <div class="alert-sym">
          ${s.symbol}
          <a href="https://www.tradingview.com/symbols/${s.symbol}USD/?exchange=BINANCE" target="_blank" style="font-size:10px;color:var(--text-dim);text-decoration:none;" title="TradingView 图表">↗</a>
        </div>
        ${alertScoreBadge(s.score,'brief')}
        <div class="alert-details">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${dims}</div>
          <div style="margin-top:3px;">${evts}</div>
        </div>
        <div class="alert-events">${spanText(s.span_hours)}</div>
      </div>`;
    }
    html+='</div>';
    container.innerHTML=html;
  }catch(e){section.style.display='none';}
}

// ===== 维度中文名 =====
const DIM_NAMES={price:'价格', derivatives:'衍生品', macro:'宏观', onchain:'链上', sentiment:'情绪', unknown:'其他'};
function dimStr(dims){
  if(!dims||!dims.length)return '--';
  return dims.map(d=>DIM_NAMES[d]||d).join('+');
}

// ===== 时间范围可读化 =====
function spanText(hours){
  if(hours<0.5)return '<span style="color:var(--cyan)">近30分钟</span>';
  if(hours<2)return '<span style="color:var(--green)">1~2小时前</span>';
  if(hours<6)return '<span style="color:var(--yellow)">2~6小时前</span>';
  if(hours<24)return '<span style="color:var(--magenta)">6~24小时前</span>';
  return '<span style="color:var(--red)">超过24小时</span>';
}

// ===== Scores =====
async function loadScores(){
  const c=document.getElementById('scoresContainer');
  try{
    const r=await fetch('/api/scores');
    const data=await r.json();
    if(!data.length){c.innerHTML='<div class="loading">暂无活跃事件</div>';return;}
    let html=`<table class="score-table">
      <tr><th>标的</th><th>评分</th><th>事件</th><th>信号维度</th><th>时间分布</th></tr>`;
    for(const s of data){
      const badge=s.score>=0.8?'badge-urgent':s.score>=0.4?'badge-brief':'badge-normal';
      const pct=Math.min(s.score/5*100,100);
      const color=s.score>=0.8?'var(--red)':s.score>=0.4?'var(--yellow)':'var(--cyan)';

      // 三窗口分解
      const breakdown = s.score_fast!=null
        ? `<div class="w-break">
            <span class="w-f">快</span>
            <span style="color:var(--text-dim);font-size:10px">30分</span>
            <span class="w-f">${s.score_fast.toFixed(2)}</span>
            <span style="color:var(--text-dim);margin:0 4px">|</span>
            <span class="w-m">中</span>
            <span style="color:var(--text-dim);font-size:10px">4时</span>
            <span class="w-m">${s.score_medium.toFixed(2)}</span>
            <span style="color:var(--text-dim);margin:0 4px">|</span>
            <span class="w-s">慢</span>
            <span style="color:var(--text-dim);font-size:10px">48时</span>
            <span class="w-s">${s.score_slow.toFixed(2)}</span>
          </div>`
        : '';

      // Hover tooltip: 事件预览
      let previewHtml='';
      if(s.recent_events&&s.recent_events.length){
        previewHtml='<div class="score-preview-popup"><div style="font-size:10px;color:var(--text-dim);letter-spacing:1px;margin-bottom:4px;">⬡ 最近事件</div>';
        for(const e of s.recent_events.slice(0,4)){
          const agoStr=e.ago||'';
          previewHtml+=`<div class="pev-row"><span class="pev-type">${e.type||'--'}</span><span class="pev-time">${agoStr}</span></div>`;
        }
        if(s.recent_events.length>4) previewHtml+='<div style="font-size:10px;color:var(--text-dim);text-align:center;margin-top:2px;">+'+ (s.recent_events.length-4) +' 更多...</div>';
        previewHtml+='</div>';
      }

      html+=`<tr class="score-row-wrap" style="cursor:pointer;" onclick="showDetail('${s.symbol}')">
        <td class="sym">${s.symbol}</td>
        <td class="num">
          <span class="badge ${badge}">${s.score.toFixed(2)}</span>
          <span class="score-bar" style="width:${pct}%;background:${color}"></span>
          ${breakdown}
          ${previewHtml}
        </td>
        <td>${s.events}</td>
        <td class="dims">${dimStr(s.dimensions)}</td>
        <td class="dims">${spanText(s.span_hours)}</td>
      </tr>`;
    }
    html+=`</table>`;
    c.innerHTML=html;
  }catch(e){c.innerHTML='<div class="loading">评分加载失败</div>';}
}

// ===== Health =====
async function loadHealth(){
  const c=document.getElementById('healthBar');
  try{
    const r=await fetch('/api/health');
    const data=await r.json();
    const names=Object.keys(data);
    if(!names.length){c.innerHTML='';return;}
    let html='';
    for(const name of names.sort()){
      const h=data[name];
      const cls=h.status==='healthy'?'healthy':h.status==='degraded'?'degraded':'unknown';
      const pulse=h.status==='healthy'?' pulse':'';
      const label=h.status==='healthy'?'正常':h.status==='degraded'?`✕${h.failures}`:'--';
      html+=`<span class="h-item"><span class="h-dot ${cls}${pulse}"></span><span class="h-name">${name}</span><span style="font-size:10px;color:var(--text-dim);">${label}</span></span>`;
    }
    c.innerHTML=html;
  }catch(e){c.innerHTML='';}
}

// ===== Volatility Regime =====
async function loadVolatility(){
  const c=document.getElementById('volBadge');
  try{
    const r=await fetch('/api/volatility');
    const data=await r.json();
    const regime=data.regime||'unknown';
    const labels={low:'低波动',medium:'中波动',high:'高波动'};
    const vix=data.vix!=null?` VIX ${data.vix.toFixed(1)}`:'';
    c.textContent=`⚡ ${labels[regime]||regime}${vix}`;
    c.className='vol-badge '+regime;
    c.style.display='';
  }catch(e){c.style.display='none';}
}

// ===== Signals =====
async function loadSignals(){
  const c=document.getElementById('signalContainer');
  try{
    const r=await fetch('/api/history');
    const data=await r.json();
    if(!data.length){c.innerHTML='<div class="loading">暂无信号</div>';return;}
    const customCoins=['BTC','ETH','SOL','SUI','DOGE','TAO','ORDI'];
    const custom=[], other=[];
    for(const s of data){
      const sym=(s.symbol||'').toUpperCase();
      if(customCoins.some(c=>sym.startsWith(c))) custom.push(s);
      else other.push(s);
    }
    function renderItems(arr){
      let h='';
      for(const s of arr){
        const dir=s.ai_direction||'';
        const dirCls=dir.includes('看多')||dir.includes('利好')?'dir-bull':
          dir.includes('看空')||dir.includes('利空')?'dir-bear':'dir-neutral';
        const reasons=s.trigger_reasons||'';
        let summary=s.ai_summary||'';
        try{const p=JSON.parse(reasons);if(Array.isArray(p))summary=p.join('; ').slice(0,80);}catch(e){}

        const fb=s.feedback;
        const fbClass=fb===1?'fb-active fb-up':fb===0?'fb-active fb-down':'';
        const fbUpActive=fb===1?'fb-active':'';
        const fbDownActive=fb===0?'fb-active':'';

        h+=`<div class="signal-item">
          <span class="signal-time">${s.created_at?String(s.created_at).slice(11,16):'--'}</span>
          <span class="signal-sym">${s.symbol}</span>
          <span class="signal-dir ${dirCls}">${dir||'--'}</span>
          <span class="signal-conf">${s.ai_confidence||0}%</span>
          <span class="signal-summary" title="${summary.replace(/"/g,'&quot;')}">${summary.slice(0,60)}</span>
          <span class="signal-fb" data-id="${s.id}">
            <span class="fb-btn fb-up ${fbUpActive}" data-useful="1" title="有用">👍</span>
            <span class="fb-btn fb-down ${fbDownActive}" data-useful="0" title="无用">👎</span>
          </span>
        </div>`;
      }
      return h;
    }
    let html='<div class="signal-feed">';
    if(custom.length) html+=`<div class="signal-group">⬡ 自定义币种 (${custom.length})</div>`+renderItems(custom);
    if(other.length) html+=`<div class="signal-group">⬡ 其他 (${other.length})</div>`+renderItems(other);
    html+='</div>';
    c.innerHTML=html;
    // Load feedback stats
    try{
      const fr=await fetch('/api/feedback/stats');
      const fd=await fr.json();
      const fbEl=document.getElementById('fbStats');
      if(fd.total>0){
        fbEl.textContent='👍'+fd.useful+'/'+fd.total+' ('+(fd.usefulness*100).toFixed(0)+'% 有用率)';
      }else{
        fbEl.textContent='点击 👍/👎 标记信号质量';
      }
    }catch(e){}
  }catch(e){c.innerHTML='<div class="loading">信号加载失败</div>';}
}

// ===== Feedback =====
document.addEventListener('click', function(e){
  const btn=e.target.closest('.fb-btn');
  if(!btn) return;
  const signalItem=btn.closest('.signal-item');
  const fbSpan=btn.closest('.signal-fb');
  const signalId=parseInt(fbSpan.dataset.id);
  const useful=btn.dataset.useful==='1';
  // Disable both buttons then mark active
  fbSpan.querySelectorAll('.fb-btn').forEach(function(b){b.classList.remove('fb-active');});
  btn.classList.add('fb-active');
  // Submit
  fetch('/api/feedback', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({signal_id:signalId, useful:useful})
  }).then(function(r){return r.json();}).then(function(data){
    if(data.ok){
      var toast=document.createElement('div');
      toast.className='fb-toast';
      toast.textContent=useful?'✅ 已标记为有用':'❌ 已标记为无用';
      document.body.appendChild(toast);
      setTimeout(function(){toast.remove();},1800);
    }
  }).catch(function(){});
});

// ===== Stats =====
async function loadStats(){
  const c=document.getElementById('statsBar');
  try{
    const [statsR,pushR]=await Promise.all([
      fetch('/api/stats'),
      fetch('/api/push')
    ]);
    const data=await statsR.json();
    const pushStatus=await pushR.json();
    const days=data.days||[];
    if(!days.length){c.innerHTML='';return;}
    const last=days[days.length-1];
    const chips=Object.entries(last.by_asset_type||{});

    let html=`
      <span class="s-total">最近24h: <strong>${last.total||0}</strong></span>`;

    // 推送通道状态
    const pushBar=pushStatus.daily_used||0;
    const pushLimit=pushStatus.daily_limit||5;
    const pushPct=Math.round(pushBar/pushLimit*100);
    const pushColor=pushPct>=100?'var(--red)':pushPct>=60?'var(--yellow)':'var(--green)';
    const pushIcon=pushStatus.pending>0?'📦':'📤';
    html+=`<span class="s-total" style="margin-left:4px;">
      ${pushIcon} 推送 <strong style="color:${pushColor}">${pushBar}/${pushLimit}</strong>
      ${pushStatus.pending>0?`<span style="color:var(--yellow);font-size:11px;">排队${pushStatus.pending}</span>`:''}
    </span>`;

    if(chips.length){
      html+='<span class="s-chips">';
      for(const [k,v] of chips.sort()){
        const colors={stock:'var(--cyan)',crypto:'var(--magenta)',macro:'var(--green)',
          derivatives:'var(--yellow)',sentiment:'#8888ff',calendar:'var(--red)'};
        html+=`<span class="s-chip" style="border-color:${colors[k]||'var(--border)'}">
          <span class="num">${v}</span> ${k}
        </span>`;
      }
      html+='</span>';
    }

    if(days.length>1){
      const recent7=days.slice(-7);
      const max=Math.max(...recent7.map(d=>d.total||0),1);
      html+='<span class="s-bar">';
      for(const d of recent7){
        const h=Math.max(3,(d.total||0)/max*22);
        html+=`<span class="s-bar-item" style="height:${h}px;" title="${d.date}: ${d.total||0}"></span>`;
      }
      html+='</span>';
    }

    c.innerHTML=html;
  }catch(e){c.innerHTML='';}
}

// ===== 系统状态 =====
async function loadSysStatus(){
  const c=document.getElementById('sysStatus');
  try{
    const [healthR,overviewR]=await Promise.all([
      fetch('/api/health'), fetch('/api/overview')
    ]);
    const health=await healthR.json();
    const overview=await overviewR.json();

    const names=Object.keys(health);
    const total=names.length;
    const healthy=names.filter(n=>health[n].status==='healthy').length;
    const degraded=names.filter(n=>health[n].status==='degraded').length;
    const pct=total?Math.round(healthy/total*100):0;

    const now=Math.floor(Date.now()/1000);
    const ts=overview.timestamp||now;
    const ago=now-ts<120?'刚刚':now-ts<3600?Math.floor((now-ts)/60)+'分前':Math.floor((now-ts)/3600)+'时前';

    // 推送通道状态
    let pushHtml='';
    try{
      const pushR=await fetch('/api/push');
      const pushStatus=await pushR.json();
      const pushBar=pushStatus.daily_used||0;
      const pushLimit=pushStatus.daily_limit||5;
      const pushPct=Math.min(pushBar/pushLimit*100,100);
      const pushColor=pushPct>=100?'red':pushPct>=60?'yellow':'green';
      pushHtml=`<div class="sys-row-bar">
        <span class="sys-bar-label">📤 推送配额</span>
        <div class="micro-bar">
          <div class="micro-bar-track"><div class="micro-bar-fill ${pushColor}" style="width:${pushPct}%"></div></div>
          <span class="micro-bar-label">${pushBar}/${pushLimit}</span>
        </div>
      </div>`;
    }catch(e){}

    const dsBarColor=pct>=90?'green':pct>=60?'yellow':'red';
    let html=`
      <div class="sys-row-bar"><span class="sys-bar-label">🕐 上次刷新</span><span class="sys-value">${ago}</span></div>
      <div class="sys-row-bar">
        <span class="sys-bar-label">📊 数据源</span>
        <div class="micro-bar">
          <div class="micro-bar-track"><div class="micro-bar-fill ${dsBarColor}" style="width:${pct}%"></div></div>
          <span class="micro-bar-label">${pct}%</span>
        </div>
        <span style="font-size:11px;color:${pct>=90?'var(--green)':pct>=60?'var(--yellow)':'var(--red)'}">${healthy}/${total}</span>
      </div>`;

    // 降级源指示
    if(degraded>0){
      const badNames=names.filter(n=>health[n].status==='degraded').join(', ');
      html+=`<div class="sys-row-bar"><span class="sys-bar-label">⚠ 降级源</span><span class="sys-value sys-warn" style="font-size:11px;">${badNames}</span></div>`;
    }

    // RSS 微条
    let rssPct=0;
    try{
      const rssR=await fetch('/api/rss-health');
      const rssHealth=await rssR.json();
      const rssNames=Object.keys(rssHealth);
      const rssHealthy=rssNames.filter(n=>rssHealth[n].status==='healthy').length;
      rssPct=rssNames.length?Math.round(rssHealthy/rssNames.length*100):0;
      const rssColor=rssPct>=90?'green':rssPct>=60?'yellow':'red';
      html+=`<div class="sys-row-bar">
        <span class="sys-bar-label">📡 RSS</span>
        <div class="micro-bar">
          <div class="micro-bar-track"><div class="micro-bar-fill ${rssColor}" style="width:${rssPct}%"></div></div>
          <span class="micro-bar-label">${rssPct}%</span>
        </div>
        <span style="font-size:11px;color:${rssPct>=90?'var(--green)':rssPct>=60?'var(--yellow)':'var(--red)'}">${rssHealthy}/${rssNames}</span>
      </div>`;
    }catch(e){}

    html+=pushHtml;
    html+=`<div class="sys-row-bar"><span class="sys-bar-label">🚨 活跃事件</span><span class="sys-value">${overview.active_events||0}</span></div>`;
    html+=`<div class="sys-row-bar"><span class="sys-bar-label">🔴 需关注</span><span class="sys-value sys-warn">${overview.urgent_count||0}</span></div>`;
    html+=`<div class="sys-row-bar"><span class="sys-bar-label">📋 简报级</span><span class="sys-value">${overview.brief_count||0}</span></div>`;

    // 冷启动状态
    try{
      const warmR=await fetch('/api/warmup');
      const warmData=await warmR.json();
      if(warmData.warmup){
        const remain=warmData.remaining||0;
        const barPct=Math.min(100,Math.round(remain/180*100));
        const barColor=barPct>60?'var(--cyan)':barPct>30?'var(--yellow)':'var(--green)';
        html+=`<div class="sys-row-bar">
          <span class="sys-bar-label">🔥 冷启动</span>
          <div class="micro-bar" style="max-width:80px;">
            <div class="micro-bar-track"><div class="micro-bar-fill green" style="width:${barPct}%;background:${barColor};"></div></div>
            <span class="micro-bar-label" style="min-width:36px;">${remain}s</span>
          </div>
          <span style="font-size:11px;color:var(--cyan);">加速中 ×${warmData.burst||1}</span>
        </div>`;
      }
    }catch(e){}

    // 预算自适应状态
    try{
      const budgetR=await fetch('/api/budget');
      const budgetData=await budgetR.json();
      if(budgetData.enabled){
        const regimeMap={low:'🟢 低波动',medium:'🟡 中波动',high:'🔴 高波动'};
        const label=regimeMap[budgetData.regime]||'⚪ 未知';
        html+=`<div class="sys-row-bar" style="margin-top:4px;">
          <span class="sys-bar-label">📊 扫描预算</span>
          <span style="font-size:12px;">${label}</span>
          <span style="font-size:11px;color:var(--text-dim);margin-left:auto;">间隔×${budgetData.interval_multiplier} 限额×${budgetData.cap_multiplier}</span>
        </div>`;
      }
    }catch(e){}

    // 列出各数据源
    html+='<div style="margin-top:8px;font-size:11px;color:var(--text-dim);">数据源明细:</div><div class="sys-source-grid">';
    for(const name of names.sort()){
      const h=health[name];
      const status=h.status==='healthy'?'✅':h.status==='degraded'?'⚠️':'❌';
      html+=`<div class="sys-source-item"><span>${status} ${name}</span></div>`;
    }
    html+='</div>';
    // RSS 源健康
    try{
      const rssR=await fetch('/api/rss-health');
      const rssHealth=await rssR.json();
      const rssNames=Object.keys(rssHealth);
      const rssHealthy=rssNames.filter(n=>rssHealth[n].status==='healthy').length;
      const rssPct=rssNames.length?Math.round(rssHealthy/rssNames.length*100):0;
      html+='<div style="margin-top:8px;font-size:11px;color:var(--text-dim);">RSS ('+rssHealthy+'/'+rssNames.length+' OK '+rssPct+'%)</div><div class="sys-source-grid">';
      for(const name of rssNames.sort()){
        const h=rssHealth[name];
        html+='<div class="sys-source-item"><span>'+h.status+' '+name+'</span><span style="color:var(--text-dim);font-size:10px;">x'+h.failures+'</span></div>';
      }
      html+='</div>';
    }catch(e){}


    c.innerHTML=html;
  }catch(e){c.innerHTML='<div class="loading">加载失败</div>';}
}


// ===== 详情弹窗 =====
let detailChartInstance = null;
async function showDetail(symbol){
  const modal=document.getElementById('detailModal');
  modal.style.display='flex';
  document.getElementById('detailSym').textContent=symbol;

  try{
    console.log('fetching detail for', symbol);
    const r=await fetch('/api/scores?symbol='+encodeURIComponent(symbol));
    if(!r.ok){document.getElementById('detailEventsList').innerHTML='<div class="loading">HTTP '+r.status+'</div>';return;}
    const d=await r.json();
    console.log('detail response:', d);
    if(d.error){document.getElementById('detailEventsList').innerHTML='<div class="loading">'+d.error+'</div>';return;}

    document.getElementById('detailScore').textContent=d.score.toFixed(2);
    document.getElementById('detailEvents').textContent=d.events;
    document.getElementById('detailDims').textContent=d.dimensions.join('+')||'--';
    document.getElementById('detailSpan').textContent=d.span_hours.toFixed(1)+'h';

    const badge=d.score>=0.8?'badge-urgent':d.score>=0.4?'badge-brief':'badge-normal';
    document.getElementById('detailBadge').className='badge '+badge;
    document.getElementById('detailBadge').textContent=d.score.toFixed(2);

    // 三窗口柱状图
    if(detailChartInstance) detailChartInstance.dispose();
    const chartDom=document.getElementById('detailChart');
    if(d.score_fast!=null){
      detailChartInstance=echarts.init(chartDom);
      detailChartInstance.setOption({
        grid:{left:30,right:5,top:10,bottom:15},
        xAxis:{type:'category',data:['快(30分)','中(4时)','慢(48时)'],axisLabel:{color:'#8899bb',fontSize:10}},
        yAxis:{type:'value',min:0,axisLabel:{color:'#8899bb',fontSize:9}},
        series:[{
          type:'bar',data:[
            {value:d.score_fast,itemStyle:{color:'#00f8ff'}},
            {value:d.score_medium,itemStyle:{color:'#ffbb00'}},
            {value:d.score_slow,itemStyle:{color:'#8899bb'}},
          ],
          barWidth:20,
        }],
        tooltip:{trigger:'item',formatter:'{b}: {c}'},
      });
    }

    // 事件明细
    let evHtml='';
    if(d.detail_events&&d.detail_events.length){
      const DIM_LABELS={price:'价格',derivatives:'衍生',macro:'宏观',onchain:'链上',sentiment:'情绪',unknown:'其他'};
      for(const e of d.detail_events){
        const dimLabel=DIM_LABELS[e.dimension]||e.dimension;
        const sevColor=e.severity>=0.7?'var(--red)':e.severity>=0.4?'var(--yellow)':'var(--text-dim)';
        let rawHtml='';
        if(e.raw){
          const tx=e.raw.tx_hash||'';
          const sender=e.raw.sender||'';
          const receiver=e.raw.receiver||'';
          const sLabel=e.raw.sender_label||'';
          const rLabel=e.raw.receiver_label||'';
          if(tx){
            const isEth=tx.length>50;
            const explorer=isEth?'https://etherscan.io/tx/':'https://blockchair.com/bitcoin/transaction/';
            rawHtml='<br><span style="font-size:11px;color:var(--text-dim);opacity:0.6;">'
              +'TX: <a href="'+explorer+tx
              +'" target="_blank" style="color:var(--cyan);">'+tx.slice(0,16)+'...</a></span>';
          }
          if(sender){
            const labelTag=sLabel?' <span style="background:rgba(0,248,255,0.15);color:var(--cyan);padding:1px 6px;border-radius:4px;font-size:10px;">'+sLabel+'</span>':'';
            rawHtml+='<br><span style="font-size:11px;color:var(--text-dim);opacity:0.6;">'
              +'从: '+sender.slice(0,10)+'...'+sender.slice(-4)+labelTag+'</span>';
          }
          if(receiver){
            const labelTag=rLabel?' <span style="background:rgba(0,255,136,0.15);color:var(--green);padding:1px 6px;border-radius:4px;font-size:10px;">'+rLabel+'</span>':'';
            rawHtml+='<br><span style="font-size:11px;color:var(--text-dim);opacity:0.6;">'
              +'到: '+receiver.slice(0,10)+'...'+receiver.slice(-4)+labelTag+'</span>';
          }
        }
        evHtml+='<div class="detail-event-row">'
          +'<span class="detail-e-time">'+e.time_ago+'</span>'
          +'<span class="detail-e-type">'+e.type+rawHtml+'</span>'
          +'<span class="detail-e-sev" style="color:'+sevColor+'">'+e.severity.toFixed(2)+'</span>'
          +'<span class="detail-e-dim">'+dimLabel+'</span>'
          +'</div>';
      }
    }else{
      evHtml='<div style="padding:20px;text-align:center;color:var(--text-dim);font-size:13px;">暂无事件明细</div>';
    }
    document.getElementById('detailEventsList').innerHTML=evHtml;
  }catch(e){document.getElementById('detailEventsList').innerHTML='<div class="loading">加载失败</div>';}
}

function closeDetail(e){
  if(e&&e.target!==e.currentTarget)return;
  document.getElementById('detailModal').style.display='none';
  if(detailChartInstance){detailChartInstance.dispose();detailChartInstance=null;}
}

// ===== 信号覆盖率 =====
async function loadCoverage(){
  const el=document.getElementById('coverageBar');
  if(!el) return;
  try{
    const r=await fetch('/api/coverage');
    const d=await r.json();
    const dims=d.by_dimension||{};
    const total=Object.values(dims).reduce((a,b)=>a+b,0);
    if(!total){el.innerHTML='<span style="font-size:11px;color:var(--text-dim);">暂无信号</span>';return;}
    const colors={onchain:'var(--cyan)',price:'var(--green)',macro:'var(--yellow)',sentiment:'#8888ff',derivatives:'var(--magenta)'};
    const dimNames={onchain:'链上',price:'价格',macro:'宏观',sentiment:'情绪',derivatives:'衍生品'};
    let html='<div style="display:flex;gap:4px;height:16px;border-radius:4px;overflow:hidden;margin-bottom:6px;">';
    for(const [dim,count] of Object.entries(dims)){
      const pct=Math.round(count/total*100);
      html+=`<div style="flex:${count};background:${colors[dim]||'var(--text-dim)'};opacity:0.7;cursor:pointer;" title="${dimNames[dim]||dim}: ${count}个(${pct}%)" onclick="toggleCoverageDim('${dim}')"></div>`;
    }
    html+='</div><div style="display:flex;flex-wrap:wrap;gap:4px;">';
    for(const [dim,count] of Object.entries(dims)){
      const pct=Math.round(count/total*100);
      html+=`<span class="coverage-dim" onclick="toggleCoverageDim('${dim}')"><span style="color:${colors[dim]||'var(--text-dim)'};font-weight:600;">${pct}%</span> ${dimNames[dim]||dim} (${count})</span>`;
    }
    html+=`</div><div style="font-size:10px;color:var(--text-dim);margin-top:4px;">${d.active_symbols||0} 个活跃标的 · 点击维度查看明细</div>`;
    html+='<div id="coverageDetail" style="margin-top:4px;"></div>';
    el.innerHTML=html;
    window._coverageData = d;
  }catch(e){el.innerHTML='<span style="font-size:11px;color:var(--text-dim);">加载失败</span>';}
}

// 覆盖率维度点击展开
window.toggleCoverageDim = function(dim){
  const detailEl=document.getElementById('coverageDetail');
  if(!detailEl||!window._coverageData) return;
  // 如果已经展开了该维度则收起
  if(detailEl.dataset.activeDim===dim){
    detailEl.innerHTML='';
    detailEl.dataset.activeDim='';
    return;
  }
  const d=window._coverageData;
  const dims=d.by_dimension||{};
  // 找该维度下的标的: 从 scores 获取
  fetch('/api/scores').then(r=>r.json()).then(scores=>{
    const matched=scores.filter(s=>s.dimensions&&s.dimensions.includes(dim));
    if(!matched.length){detailEl.innerHTML='<div class="coverage-expand show" style="color:var(--text-dim);">无匹配标的</div>';return;}
    const colors={onchain:'var(--cyan)',price:'var(--green)',macro:'var(--yellow)',sentiment:'#8888ff',derivatives:'var(--magenta)'};
    let h='<div class="coverage-expand show"><div style="display:flex;flex-wrap:wrap;gap:6px;">';
    for(const s of matched.slice(0,15)){
      const sc=s.score>=0.8?'var(--red)':s.score>=0.4?'var(--yellow)':'var(--text-dim)';
      h+=`<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid ${colors[dim]||'var(--border)'};cursor:pointer;" onclick="showDetail('${s.symbol}')" title="评分: ${s.score}">
        <b style="color:#fff;font-size:12px;">${s.symbol}</b>
        <span style="color:${sc};font-size:10px;font-weight:600;">${s.score.toFixed(2)}</span>
      </span>`;
    }
    if(matched.length>15) h+=`<span style="font-size:11px;color:var(--text-dim);">+${matched.length-15} 更多...</span>`;
    h+='</div></div>';
    detailEl.innerHTML=h;
    detailEl.dataset.activeDim=dim;
  }).catch(()=>{});
};

// ===== Performance =====
async function loadPerformance(){
  try{
    const r=await fetch('/api/performance');
    const d=await r.json();
    const o=d.overall||{};
    document.getElementById('perfTotal').textContent=o.total||0;
    document.getElementById('perfChecked').textContent=o.checked||0;
    document.getElementById('perfPending').textContent=o.pending||0;
    document.getElementById('perfCorrect').textContent=o.correct||0;
    document.getElementById('perfWrong').textContent=o.wrong||0;
    const acc=o.accuracy||0;
    const accPct=(acc*100).toFixed(0);
    document.getElementById('perfAcc').textContent=accPct+'%';
    document.getElementById('perfAccCard').className='stat-card '+(acc>=0.7?'stat-cyan':acc>=0.5?'':'stat-magenta');
    document.querySelector('.perf-updated-at').textContent='(检查窗口 '+d.check_hours+'h, 阈值 '+(d.threshold||0)+'%)';

    // Confusion matrix
    const cm=d.confusion_matrix||{};
    document.getElementById('cmBullCorrect').textContent=cm.bullish_correct||0;
    document.getElementById('cmBullWrong').textContent=cm.bullish_wrong||0;
    document.getElementById('cmBearCorrect').textContent=cm.bearish_correct||0;
    document.getElementById('cmBearWrong').textContent=cm.bearish_wrong||0;

    // By asset type
    let bht='';
    for(const[k,v]of Object.entries(d.by_asset_type||{})){
      const a=v.accuracy||0;
      bht+='<div style="display:flex;justify-content:space-between;padding:2px 0;">';
      bht+='<span>'+k+'</span>';
      bht+='<span>'+v.correct+'/'+v.total+' <b>'+(a*100).toFixed(0)+'%</b></span></div>';
    }
    document.getElementById('perfByType').innerHTML=bht||'<span style="color:var(--text-dim)">暂无数据</span>';

    // By confidence
    let bhc='';
    for(const[k,v]of Object.entries(d.by_confidence||{})){
      const a=v.accuracy||0;
      bhc+='<div style="display:flex;justify-content:space-between;padding:2px 0;">';
      bhc+='<span>'+k+'</span>';
      bhc+='<span>'+v.correct+'/'+v.total+' <b>'+(a*100).toFixed(0)+'%</b></span></div>';
    }
    document.getElementById('perfByConf').innerHTML=bhc||'<span style="color:var(--text-dim)">暂无数据</span>';

    // By symbol
    let bhs='';
    for(const s of(d.by_symbol||[])){
      bhs+='<div style="display:flex;justify-content:space-between;padding:1px 4px;border-radius:3px;">';
      bhs+='<span><b>'+s.symbol+'</b></span>';
      bhs+='<span>'+s.correct+'/'+s.total+' <b>'+(s.accuracy*100).toFixed(0)+'%</b></span></div>';
    }
    document.getElementById('perfBySymbol').innerHTML=bhs||'<span style="color:var(--text-dim)">暂无数据</span>';

    // Recent results
    let bhr='';
    for(const r of(d.recent||[])){
      const mk=r.correct===true?'✅':r.correct===false?'❌':'➖';
      const dc=r.direction||'--';
      const chg=r.change_pct!==null&&r.change_pct!==undefined?(r.change_pct>=0?'+':'')+Number(r.change_pct).toFixed(1)+'%':'--';
      bhr+='<div style="display:flex;justify-content:space-between;padding:1px 4px;border-radius:3px;gap:4px;">';
      bhr+='<span>'+mk+' '+r.symbol+' <span style="color:var(--text-dim)">'+dc+'</span></span>';
      bhr+='<span>'+chg+' <b>'+r.confidence+'%</b></span></div>';
    }
    document.getElementById('perfRecent').innerHTML=bhr||'<span style="color:var(--text-dim)">暂无数据</span>';

    document.getElementById('perfContainer').style.display='block';

    // Calibration chart
    const calib=d.calibration||{};
    const bands=calib.bands||[];
    const calibEl=document.getElementById('calibChart');
    const calibRecEl=document.getElementById('calibRec');
    if(bands.length>0&&calibEl){
      calibEl.innerHTML='';
      const labels=[], accs=[], totals=[];
      bands.forEach(function(b){
        labels.push(b.label);
        accs.push(b.accuracy!==null?b.accuracy*100:null);
        totals.push(b.total);
      });
      const calibChart=echarts.init(calibEl);
      calibChart.setOption({
        tooltip:{trigger:'axis',formatter:function(ps){
          const p=Array.isArray(ps)?ps[0]:ps;
          const b=bands[p.dataIndex];
          return '<b>'+b.label+'</b><br/>总:'+b.total+' 正确:'+b.correct+' 错误:'+b.wrong+
            (b.accuracy!==null?'<br/>准确率:<b>'+(b.accuracy*100).toFixed(0)+'%</b>':'')+
            (b.avg_change_pct!==null?'<br/>平均涨跌:'+b.avg_change_pct+'%':'');
        }},
        grid:{left:55,right:20,top:15,bottom:25},
        xAxis:{type:'category',data:labels,axisLabel:{color:'#8899bb',fontSize:10,rotate:20}},
        yAxis:{type:'value',min:0,max:100,axisLabel:{color:'#8899bb',fontSize:9,formatter:'{value}%'},splitLine:{lineStyle:{color:'rgba(255,255,255,0.04)'}}},
        series:[{
          type:'bar',data:accs,
          itemStyle:{color:function(p){
            const v=p.value;
            if(v===null)return 'rgba(255,255,255,0.1)';
            return v>=70?'#00e676':v>=50?'#ffbb00':'#ff3355';
          },borderRadius:[4,4,0,0]},
          label:{show:true,position:'top',fontSize:10,color:'#e8edf5',
            formatter:function(p){return p.value!==null?p.value.toFixed(0)+'%':'N/A';}},
          barMaxWidth:40,
        }]
      });
      document.getElementById('calibInfo').textContent='(共'+calib.total_calibrated+'条已校准)';
      if(calib.recommended_threshold){
        calibRecEl.textContent='建议最低置信度阈值: >='+calib.recommended_threshold+'% (准确率>60%)';
      }
    }else if(calibEl){
      calibEl.innerHTML='<div style="color:var(--text-dim);padding:20px;text-align:center;">暂无校准数据(需更多已验证信号)</div>';
    }
  }catch(e){console.log('perf load error',e);}
}


// ===== Sentiment =====
async function loadSentiment(){
  const c=document.getElementById('sentimentContainer');
  try{
    const r=await fetch('/api/sentiment');
    const d=await r.json();
    if(d.status!=='active'){c.style.display='none';return;}
    document.getElementById('sPos').textContent=d.distribution.positive;
    document.getElementById('sNeu').textContent=d.distribution.neutral;
    document.getElementById('sNeg').textContent=d.distribution.negative;
    document.getElementById('sImp').textContent=d.trends.improving;
    document.getElementById('sDet').textContent=d.trends.deteriorating;
    document.getElementById('sentTotal').textContent=d.total_symbols;
    let hp='';
    for(const s of(d.top_positive||[])){
      hp+='<div style="display:flex;justify-content:space-between;padding:2px 6px;border-radius:3px;">';
      hp+='<span><b>'+s.symbol+'</b></span>';
      const p=(s.score*100).toFixed(0);
      hp+='<span style="color:var(--green);font-weight:600;">+'+p+'%</span></div>';
    }
    document.getElementById('sentTopPos').innerHTML=hp||'<span style="color:var(--text-dim)">暂无</span>';
    let hn='';
    for(const s of(d.top_negative||[])){
      hn+='<div style="display:flex;justify-content:space-between;padding:2px 6px;border-radius:3px;">';
      hn+='<span><b>'+s.symbol+'</b></span>';
      const p=(s.score*100).toFixed(0);
      hn+='<span style="color:var(--red);font-weight:600;">'+p+'%</span></div>';
    }
    document.getElementById('sentTopNeg').innerHTML=hn||'<span style="color:var(--text-dim)">暂无</span>';
    const ts=new Date((d.updated_at||0)*1000);
    document.getElementById('sentimentUpdatedAt').textContent=ts.toTimeString().slice(0,8);
    c.style.display='block';
  }catch(e){c.style.display='none';}
}

async function loadCorrelation(){
  const c=document.getElementById('corrContainer');
  try{
    const r=await fetch('/api/correlation');
    const d=await r.json();
    if(!d.crypto_list||d.crypto_list.length<2){c.style.display='none';return;}
    document.getElementById('corrWindow').textContent='('+d.window_days+'天)';
    document.getElementById('corrUpdatedAt').textContent=new Date((d.updated_at||0)*1000).toTimeString().slice(0,8);
    if(d.top_positive&&d.top_positive.length>0){
      const tp=d.top_positive[0];
      document.getElementById('corrTopPos').textContent='↗ '+tp.pair+' (r='+tp.r+')';
    }
    if(d.top_negative&&d.top_negative.length>0){
      const tn=d.top_negative[0];
      document.getElementById('corrTopNeg').textContent='↘ '+tn.pair+' (r='+tn.r+')';
    }
    // Crypto-Crypto heatmap
    const cN=d.crypto_list, cM=d.crypto_crypto;
    const hd=[];
    for(let i=0;i<cN.length;i++){
      for(let j=0;j<cN.length;j++){
        if(i===j){hd.push([j,i,1.0]);continue;}
        const v=cM[cN[i]]?.[cN[j]];
        if(v!=null) hd.push([j,i,Math.round(v*100)/100]);
      }
    }
    const maxV=Math.max(0.01, Math.max.apply(null, hd.map(function(d){return Math.abs(d[2])})));
    const chart=echarts.init(document.getElementById('corrCryptoHeatmap'));
    chart.setOption({
      backgroundColor:'transparent',
      tooltip:{position:'top',
        formatter:function(p){
          if(!p.data) return'';
          const a=cN[p.data[1]],b=cN[p.data[0]],v=p.data[2];
          const c2=v>=0?'#00ff88':'#ff3355';
          const st=Math.abs(v)>0.7?'强':Math.abs(v)>0.4?'中':'弱';
          return'<div style="font-size:12px"><b>'+a+' × '+b+'</b><br/>r = <b style="color:'+c2+';">'+v+'</b> <span style="color:#8899bb">('+st+')</span></div>';
        },
        backgroundColor:'rgba(10,14,26,0.92)',borderColor:'rgba(0,248,255,0.25)',
        textStyle:{color:'#e8edf5',fontSize:12},extraCssText:'border-radius:6px;padding:8px 12px;'
      },
      grid:{left:50,right:10,top:5,bottom:30},
      xAxis:{type:'category',data:cN,
        axisLabel:{color:'#aabbdd',fontSize:11,fontWeight:'600'},
        axisLine:{show:false},splitLine:{show:false}},
      yAxis:{type:'category',data:cN,
        axisLabel:{color:'#aabbdd',fontSize:11,fontWeight:'600'},
        axisLine:{show:false},splitLine:{show:false}},
      visualMap:{min:-maxV,max:maxV,calculable:false,
        orient:'horizontal',left:'center',bottom:0,width:180,
        inRange:{color:['#ff2244','#661133','#0d1117','#0f382a','#00dd88']},
        textStyle:{color:'#8899bb',fontSize:9}},
      series:[{
        type:'heatmap',data:hd,
        label:{show:true,fontSize:11,color:'#e8edf5',fontWeight:'bold',
          formatter:function(p){return p.data[2].toFixed(2)}},
        itemStyle:{borderColor:'rgba(10,14,26,0.6)',borderWidth:2},
        emphasis:{itemStyle:{shadowBlur:8,shadowColor:'rgba(0,0,0,0.4)',borderColor:'#fff',borderWidth:2}}
      }]
    });
    // Crypto-Macro table
    const mM=d.macro_list||[];
    const MACRO_LABELS={DXY:'美元指数',US10Y:'美债收益率',Gold:'黄金',Oil:'原油',Nasdaq:'纳指',BTC:'比特币'};
    if(d.crypto_macro&&mM.length>0){
      const cm=d.crypto_macro;
      let html='<table style="width:100%;border-collapse:collapse;font-size:11px;font-family:var(--font);">';
      html+='<thead><tr><th style="text-align:left;padding:4px 8px;color:var(--text-dim);border-bottom:1px solid var(--border);font-weight:400;text-transform:uppercase;letter-spacing:0.5px;">asset</th>';
      for(let mi=0;mi<mM.length;mi++){
        const label=MACRO_LABELS[mM[mi]]||'';
          html+='<th style="text-align:center;padding:4px 8px;color:var(--text-dim);border-bottom:1px solid var(--border);font-weight:600;">'+mM[mi]+'<br><span style="font-size:9px;font-weight:400;color:var(--text-dim);opacity:0.6;">'+label+'</span></th>';
      }
      html+='</tr></thead><tbody>';
      for(let ci=0;ci<cN.length;ci++){
        const row=cm[cN[ci]]||{};
        html+='<tr><td style="padding:5px 8px;color:#aabbdd;font-weight:600;border-bottom:1px solid rgba(0,248,255,0.05);">'+cN[ci]+'</td>';
        for(let mi=0;mi<mM.length;mi++){
          const v=row[mM[mi]];
          if(v==null){
            html+='<td style="text-align:center;padding:5px 8px;color:var(--text-dim);border-bottom:1px solid rgba(0,248,255,0.05);">--</td>';
          }else{
            const iv=Math.min(Math.abs(v)/0.5,1);
            const bg=v>=0?'rgba(0,255,136,'+(iv*0.15)+')':'rgba(255,50,80,'+(iv*0.15)+')';
            const fg=v>=0?'#00dd88':'#ff5577';
            html+='<td style="text-align:center;padding:5px 8px;font-weight:600;border-bottom:1px solid rgba(0,248,255,0.05);background:'+bg+';color:'+fg+';">'+v.toFixed(2)+'</td>';
          }
        }
        html+='</tr>';
      }
      html+='</tbody></table>';
      document.getElementById('corrCrossTable').innerHTML=html;
      document.getElementById('corrCrossSection').style.display='block';
    }
    c.style.display='block';
  }catch(e){console.log('corr err',e);c.style.display='none';}
}


// ===== Refresh =====
async function refresh(){
  await Promise.all([loadOverview(),loadAlerts(),loadScores(),loadHealth(),loadVolatility(),loadSignals(),loadStats(),loadSysStatus(),loadCoverage(),loadPerformance(),loadSentiment(),loadCorrelation()]);
  document.getElementById('lastUpdate').textContent='最后更新: '+new Date().toTimeString().slice(0,8);
}
refresh();
setInterval(refresh,30000);

// --- Script Segment ---

(async function(){
  const resp = await fetch('/api/timeline');
  const data = await resp.json();
  if(!data.btc || data.btc.length < 10) return;

  const btcDates = data.btc.map(p => {
    const d = new Date(p.date * 1000);
    return d.toISOString().slice(0,10);
  });
  const btcPrices = data.btc.map(p => p.price);

  const dxyMap = {};
  data.dxy.forEach(p => {
    const d = new Date(p.date * 1000);
    dxyMap[d.toISOString().slice(0,10)] = p.price;
  });
  const treasuryMap = {};
  data.treasury.forEach(p => {
    const d = new Date(p.date * 1000);
    treasuryMap[d.toISOString().slice(0,10)] = p['yield'];
  });

  const dxyAligned = btcDates.map(d => dxyMap[d] ?? null);
  const treasuryAligned = btcDates.map(d => treasuryMap[d] ?? null);

  const fedRateMap = {};
  (data.fed_rate || []).forEach(p => {
    const d = new Date(p.date * 1000);
    fedRateMap[d.toISOString().slice(0,10)] = p.rate;
  });
  const fedRateAligned = btcDates.map(d => fedRateMap[d] ?? null);

  // 黄金 & 原油 (按 BTC 日期对齐,并归一化到 2020=100)
  const goldMap = {};
  (data.gold || []).forEach(p => {
    const d = new Date(p.date * 1000);
    goldMap[d.toISOString().slice(0,10)] = p.price;
  });
  const oilMap = {};
  (data.oil || []).forEach(p => {
    const d = new Date(p.date * 1000);
    oilMap[d.toISOString().slice(0,10)] = p.price;
  });
  const goldAligned = btcDates.map(d => goldMap[d] ?? null);
  const oilAligned = btcDates.map(d => oilMap[d] ?? null);
  const nasdaqMap = {};
  (data.nasdaq || []).forEach(p => {
    const d = new Date(p.date * 1000);
    nasdaqMap[d.toISOString().slice(0,10)] = p.price;
  });
  const nasdaqAligned = btcDates.map(d => nasdaqMap[d] ?? null);
  // 使用实际价格 (不再索引化)
  const goldActual = goldAligned;
  const oilActual = oilAligned;

  chartInstance = echarts.init(document.getElementById('timelineChart'));

  // 关键价位水平参考线 (淡色,退为背景)
  const keyLevels = [
    { yAxis: 15500, label: { formatter: '$15.5K', color: 'rgba(255,51,85,0.35)', fontSize: 9 }, lineStyle: { color: 'rgba(255,51,85,0.12)', width: 1, type: 'dashed' } },
    { yAxis: 69000, label: { formatter: '$69K', color: 'rgba(255,136,0,0.35)', fontSize: 9 }, lineStyle: { color: 'rgba(255,136,0,0.15)', width: 1, type: 'dashed' } },
    { yAxis: 100000, label: { formatter: '$100K', color: 'rgba(0,255,136,0.35)', fontSize: 9 }, lineStyle: { color: 'rgba(0,255,136,0.15)', width: 1, type: 'dashed' } },
  ];

  const majorEventNames = [
    '新冠大流行','BTC第三次减半','BTC历史新高$69K','俄乌战争爆发',
    'Fed首次加息25bp','LUNA归零','FTX申请破产','BTC跌至$15.5K底部',
    '硅谷银行SVB倒闭','BTC现货ETF获批','BTC突破$73K历史新高',
    'BTC第四次减半','Fed降息50bp','BTC突破$100K','美国大选',
    'Trump就职','DeepSeek冲击全球AI板块','美国对等关税公布',
    '美国对华关税升至104%','美国中期选举初选',
  ];

  // 对历史事件和未来事件分开处理
  const pastEvents = data.events
    .filter(e => majorEventNames.includes(e.name) && !e.is_future)
    .map(e => ({
    xAxis: e.date,
    _type: e.type,
    _name: e.name,
    label: {
      formatter: e.name,
      color: '#ff3355', fontSize: 10,
      position: 'insideEndTop', rotate: 90,
    },
    lineStyle: { color: 'rgba(255,51,85,0.15)', width: 1, type: 'dashed' },
  }));
  const futureEvents = data.events
    .filter(e => e.is_future)
    .map(e => ({
    xAxis: e.date,
    _type: e.type,
    _name: e.name,
    _isFuture: true,
    label: {
      formatter: e.name,
      color: '#00ff88', fontSize: 10,
      position: 'insideEndTop', rotate: 90,
    },
    lineStyle: { color: 'rgba(0,255,136,0.25)', width: 1.5, type: 'dashed' },
  }));
  const allEventMarkers = [...pastEvents, ...futureEvents];
  // BTC 主系列 + 事件标记
  const makeBtcSeries = (events) => ({
    name: 'BTC 价格', type: 'line', data: btcPrices, smooth: true, symbol: 'none',
    sampling: 'lttb', focus: 'series',
    blur: { lineStyle: { opacity: 0.08 } },
    emphasis: { lineStyle: { width: 4, shadowBlur: 12, shadowColor: 'rgba(247,147,26,0.6)' } },
    lineStyle: { width: 2, color: '#f7931a' },
    areaStyle: { color: new echarts.graphic.LinearGradient(0,0,0,1, [
      { offset:0, color:'rgba(247,147,26,0.3)' }, { offset:1, color:'rgba(247,147,26,0)' },
    ]) },
    markLine: {
      silent: false, symbol: 'none',
      data: [...events, ...keyLevels],
    },
  });

  // 更新事件标记 (按类型筛选,未来事件始终显示)
  function updateEventFilter(type) {
    const filtered = type === 'all'
      ? pastEvents
      : pastEvents.filter(e => e._type === type);
    chartInstance.setOption({
      series: [{ id: 'btc', markLine: { data: [...filtered, ...futureEvents, ...keyLevels] } }],
    });
  }

  // 更新时间范围
  function updateRange(range) {
    if (range === 'all') {
      chartInstance.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
    } else {
      const total = btcDates.length;
      const years = parseInt(range);
      const end = total;
      const start = Math.max(0, total - years * 365);
      chartInstance.dispatchAction({ type: 'dataZoom', start: start / total * 100, end: 100 });
    }
  }

  chartInstance.setOption({
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      backgroundColor: 'rgba(10,14,26,0.9)',
      borderColor: 'rgba(0,248,255,0.3)',
      textStyle: { color: '#e8edf5', fontSize: 12 },
      formatter: function(params) {
        let s = '<div style="font-weight:600;margin-bottom:4px;">' + params[0].axisValue + '</div>';
        params.forEach(p => {
          if(p.value != null) {
            s += '<div>' + p.marker + ' ' + p.seriesName + ': <b>' + (typeof p.value === 'number' ? p.value.toLocaleString() : p.value) + '</b></div>';
          }
        });
        const dateStr = params[0].axisValue;
        const dayEvents = data.events.filter(e => e.date === dateStr);
        dayEvents.forEach(e => { s += '<div style="color:#ff3355;margin-top:2px;">&#9654; ' + e.name + '</div>'; });
        return s;
      }
    },
    legend: {
      data: ['BTC 价格', '美元指数 DXY', '10Y 美债收益率', 'Fed 利率', '黄金', '原油', '纳斯达克'],
      selected: {
        'BTC 价格': true,
        '美元指数 DXY': false,
        '10Y 美债收益率': true,
        'Fed 利率': false,
        '黄金': false,
        '原油': false,
        '纳斯达克': true,
      },
      textStyle: { color: '#e8edf5', fontSize: 12 }, top: 0,
    },
    grid: { left: 110, right: 280, top: 36, bottom: 40 },
    xAxis: {
      type: 'category', data: btcDates,
      axisLabel: { color: '#8899bb', fontSize: 11, formatter: v => v.split('-').slice(0,2).join('-') },
      axisLine: { lineStyle: { color: 'rgba(0,248,255,0.15)' } },
      splitLine: { show: false },
    },
    yAxis: [
      { type: 'value', name: 'BTC (USD)', position: 'left',
        nameTextStyle: { color: '#f7931a', fontSize: 11 },
        axisLabel: { color: '#f7931a', fontSize: 11, formatter: v => v >= 1000 ? (v/1000).toFixed(0) + 'K' : v },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } } },
      { type: 'value', name: 'Fed 利率', position: 'left', offset: 55,
        nameTextStyle: { color: '#b388ff', fontSize: 11 },
        axisLabel: { color: '#b388ff', fontSize: 11, formatter: v => v.toFixed(1) + '%' },
        splitLine: { show: false } },
      { type: 'value', name: 'DXY', position: 'right', offset: 0,
        nameTextStyle: { color: '#00e5ff', fontSize: 11 },
        axisLabel: { color: '#00e5ff', fontSize: 11 }, splitLine: { show: false } },
      { type: 'value', name: '10Y %', position: 'right', offset: 50,
        nameTextStyle: { color: '#00e676', fontSize: 11 },
        axisLabel: { color: '#00e676', fontSize: 11, formatter: v => v.toFixed(1) + '%' },
        splitLine: { show: false } },
      { type: 'value', name: '黄金', position: 'right', offset: 105,
        nameTextStyle: { color: '#ffd700', fontSize: 11 },
        axisLabel: { color: '#ffd700', fontSize: 10, formatter: v => '$' + v.toFixed(0) },
        splitLine: { show: false } },
      { type: 'value', name: '原油', position: 'right', offset: 160,
        nameTextStyle: { color: '#ff5252', fontSize: 11 },
        axisLabel: { color: '#ff5252', fontSize: 10, formatter: v => '$' + v.toFixed(0) },
        splitLine: { show: false } },
      { type: 'value', name: '纳指', position: 'right', offset: 215,
        nameTextStyle: { color: '#4fc3f7', fontSize: 11 },
        axisLabel: { color: '#4fc3f7', fontSize: 10, formatter: v => v >= 10000 ? (v/1000).toFixed(0) + 'K' : v.toFixed(0) },
        splitLine: { show: false } },
    ],
    dataZoom: [
      { type: 'inside', start: 0, end: 100 },
      { type: 'slider', start: 0, end: 100, height: 24, bottom: 0,
        borderColor: 'rgba(0,248,255,0.2)', backgroundColor: 'rgba(16,24,48,0.5)',
        dataBackground: { lineStyle: { color: 'rgba(0,248,255,0.3)' } },
        selectedDataBackground: { lineStyle: { color: '#00e5ff' } },
        handleStyle: { color: 'rgba(0,248,255,0.5)' }, textStyle: { color: '#e8edf5' } },
    ],
    series: [
      { id: 'btc', ...makeBtcSeries(allEventMarkers) },
      { name: '美元指数 DXY', type: 'line', yAxisIndex: 2, data: dxyAligned,
        connectNulls: true, smooth: true, symbol: 'none', sampling: 'lttb',
        focus: 'series', blur: { lineStyle: { opacity: 0.08 } },
        emphasis: { lineStyle: { width: 3.5, shadowBlur: 10, shadowColor: 'rgba(0,248,255,0.5)' } },
        lineStyle: { width: 1.5, color: '#00e5ff' } },
      { name: '10Y 美债收益率', type: 'line', yAxisIndex: 3, data: treasuryAligned,
        connectNulls: true, smooth: true, symbol: 'none', sampling: 'lttb',
        focus: 'series', blur: { lineStyle: { opacity: 0.08 } },
        emphasis: { lineStyle: { width: 3.5, shadowBlur: 10, shadowColor: 'rgba(0,230,118,0.5)' } },
        lineStyle: { width: 1.5, color: '#00e676' } },
      { name: 'Fed 利率', type: 'line', yAxisIndex: 1, data: fedRateAligned,
        step: 'end', symbol: 'none', sampling: 'lttb',
        focus: 'series', blur: { lineStyle: { opacity: 0.08 } },
        emphasis: { lineStyle: { width: 3.5, shadowBlur: 10, shadowColor: 'rgba(179,136,255,0.5)' } },
        lineStyle: { width: 1.5, color: '#b388ff' } },
      { name: '黄金', type: 'line', yAxisIndex: 4, data: goldActual,
        connectNulls: true, smooth: true, symbol: 'none', sampling: 'lttb',
        focus: 'series', blur: { lineStyle: { opacity: 0.08 } },
        emphasis: { lineStyle: { width: 3.5, shadowBlur: 10, shadowColor: 'rgba(255,215,0,0.5)' } },
        lineStyle: { width: 1.5, color: '#ffd700' } },
      { name: '原油', type: 'line', yAxisIndex: 5, data: oilActual,
        connectNulls: true, smooth: true, symbol: 'none', sampling: 'lttb',
        focus: 'series', blur: { lineStyle: { opacity: 0.08 } },
        emphasis: { lineStyle: { width: 3.5, shadowBlur: 10, shadowColor: 'rgba(255,82,82,0.5)' } },
        lineStyle: { width: 1.5, color: '#ff5252' } },
      { name: '纳斯达克', type: 'line', yAxisIndex: 6, data: nasdaqAligned,
        connectNulls: true, smooth: true, symbol: 'none', sampling: 'lttb',
        focus: 'series', blur: { lineStyle: { opacity: 0.08 } },
        emphasis: { lineStyle: { width: 3.5, shadowBlur: 10, shadowColor: 'rgba(79,195,247,0.5)' } },
        lineStyle: { width: 1.5, color: '#4fc3f7' } },
    ]
  });

  // 按钮事件绑定
  document.querySelectorAll('.filter-btn[data-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn[data-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateEventFilter(btn.dataset.type);
    });
  });
  document.querySelectorAll('.filter-btn[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn[data-range]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      updateRange(btn.dataset.range);
    });
  });
  document.querySelectorAll('.filter-btn[data-scale]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn[data-scale]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const isLog = btn.dataset.scale === 'log';
      chartInstance.setOption({
        yAxis: [{
          type: isLog ? 'log' : 'value',
          name: 'BTC (USD)',
          nameTextStyle: { color: '#f7931a', fontSize: 11 },
          axisLabel: { color: '#f7931a', fontSize: 11, formatter: v => v >= 1000 ? (v/1000).toFixed(0) + 'K' : v },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
        }],
      });
    });
  });

  // 归一化对比模式
  let isNormalized = false;
  function rebase(arr) {
    var base = arr.find(function(v) { return v != null && v > 0; });
    return base ? arr.map(function(v) { return v != null ? (v / base) * 100 : null; }) : arr;
  }
  document.getElementById('normToggle').addEventListener('click', function() {
    isNormalized = !isNormalized;
    this.classList.toggle('active');
    this.textContent = isNormalized ? '原始价' : '归一化';
    chartInstance.setOption({
      yAxis: isNormalized ? [
        { type: 'value', name: '相对表现 (%)', position: 'left',
          nameTextStyle: { color: '#e8edf5', fontSize: 11 },
          axisLabel: { color: '#e8edf5', fontSize: 11, formatter: function(v) { return v.toFixed(0) + '%'; } },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } } },
        { show: false }, { show: false }, { show: false }, { show: false }, { show: false }, { show: false },
      ] : [
        { type: 'value', name: 'BTC (USD)', position: 'left',
          nameTextStyle: { color: '#f7931a', fontSize: 11 },
          axisLabel: { color: '#f7931a', fontSize: 11, formatter: function(v) { return v >= 1000 ? (v/1000).toFixed(0) + 'K' : v; } },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } } },
        { type: 'value', name: 'Fed 利率', position: 'left', offset: 55,
          nameTextStyle: { color: '#b388ff', fontSize: 11 },
          axisLabel: { color: '#b388ff', fontSize: 11, formatter: function(v) { return v.toFixed(1) + '%'; } },
          splitLine: { show: false } },
        { type: 'value', name: 'DXY', position: 'right', offset: 0,
          nameTextStyle: { color: '#00e5ff', fontSize: 11 },
          axisLabel: { color: '#00e5ff', fontSize: 11 }, splitLine: { show: false } },
        { type: 'value', name: '10Y %', position: 'right', offset: 50,
          nameTextStyle: { color: '#00e676', fontSize: 11 },
          axisLabel: { color: '#00e676', fontSize: 11, formatter: function(v) { return v.toFixed(1) + '%'; } },
          splitLine: { show: false } },
        { type: 'value', name: '黄金', position: 'right', offset: 105,
          nameTextStyle: { color: '#ffd700', fontSize: 11 },
          axisLabel: { color: '#ffd700', fontSize: 10, formatter: function(v) { return '$' + v.toFixed(0); } },
          splitLine: { show: false } },
        { type: 'value', name: '原油', position: 'right', offset: 160,
          nameTextStyle: { color: '#ff5252', fontSize: 11 },
          axisLabel: { color: '#ff5252', fontSize: 10, formatter: function(v) { return '$' + v.toFixed(0); } },
          splitLine: { show: false } },
        { type: 'value', name: '纳指', position: 'right', offset: 215,
          nameTextStyle: { color: '#4fc3f7', fontSize: 11 },
          axisLabel: { color: '#4fc3f7', fontSize: 10, formatter: function(v) { return v >= 1000 ? (v/1000).toFixed(0) + 'K' : v; } },
          splitLine: { show: false } },
      ],
      series: isNormalized ? [
        { data: rebase(btcPrices), yAxisIndex: 0 },
        { data: rebase(dxyAligned), yAxisIndex: 0 },
        { data: rebase(treasuryAligned), yAxisIndex: 0 },
        { data: rebase(fedRateAligned), yAxisIndex: 0 },
        { data: rebase(goldAligned), yAxisIndex: 0 },
        { data: rebase(oilAligned), yAxisIndex: 0 },
        { data: rebase(nasdaqAligned), yAxisIndex: 0 },
      ] : [
        { data: btcPrices, yAxisIndex: 0 },
        { data: dxyAligned, yAxisIndex: 2 },
        { data: treasuryAligned, yAxisIndex: 3 },
        { data: fedRateAligned, yAxisIndex: 1 },
        { data: goldAligned, yAxisIndex: 4 },
        { data: oilAligned, yAxisIndex: 5 },
        { data: nasdaqAligned, yAxisIndex: 6 },
      ]
    });
  });

  // 事件标记点击 → 分析/展望面板
  chartInstance.on('click', { componentType: 'markLine' }, function(p) {
    const name = p.data?._name;
    const isFuture = p.data?._isFuture;
    if (name) {
      if (isFuture) showEventOutlook(name);
      else if (majorEventNames.includes(name)) showEventAnalysis(name);
    }
  });

  window.addEventListener('resize', () => { if (chartInstance && chartInstance.resize) chartInstance.resize(); });
  window.__cd = { btcDates, btcPrices, dxyAligned, treasuryAligned, fedRateAligned, goldAligned, oilAligned, nasdaqAligned, data, pastEvents, futureEvents, allEventMarkers, majorEventNames };
})();

let chartInstance = null;

// Rebuild classic K-line chart without page reload
function renderClassicChart(d, container) {
  if (chartInstance) chartInstance.dispose();
  chartInstance = echarts.init(container);
  var s = d.data, bt = d.btcDates, bp = d.btcPrices;
  var da = d.dxyAligned, ta = d.treasuryAligned, fa = d.fedRateAligned;
  var ga = d.goldAligned, oa = d.oilAligned, na = d.nasdaqAligned;
  var daEv = s.events, maEn = d.majorEventNames;
  var pe = daEv.filter(function(e){return maEn.includes(e.name)&&!e.is_future}).map(function(e){return{xAxis:e.date,_type:e.type,_name:e.name,label:{formatter:e.name,color:'#ff3355',fontSize:10,position:'insideEndTop',rotate:90},lineStyle:{color:'rgba(255,51,85,0.15)',width:1,type:'dashed'}}});
  var fe = daEv.filter(function(e){return e.is_future}).map(function(e){return{xAxis:e.date,_type:e.type,_name:e.name,_isFuture:true,label:{formatter:e.name,color:'#00ff88',fontSize:10,position:'insideEndTop',rotate:90},lineStyle:{color:'rgba(0,255,136,0.25)',width:1.5,type:'dashed'}}});
  var am = [].concat(pe, fe);
  var kl = [{yAxis:15500,label:{formatter:'$15.5K',color:'rgba(255,51,85,0.35)',fontSize:9},lineStyle:{color:'rgba(255,51,85,0.12)',width:1,type:'dashed'}},{yAxis:69000,label:{formatter:'$69K',color:'rgba(255,136,0,0.35)',fontSize:9},lineStyle:{color:'rgba(255,136,0,0.15)',width:1,type:'dashed'}},{yAxis:100000,label:{formatter:'$100K',color:'rgba(0,255,136,0.35)',fontSize:9},lineStyle:{color:'rgba(0,255,136,0.15)',width:1,type:'dashed'}}];
  chartInstance.setOption({
    backgroundColor:'transparent',
    tooltip:{trigger:'axis',axisPointer:{type:'cross'},backgroundColor:'rgba(10,14,26,0.9)',borderColor:'rgba(0,248,255,0.3)',textStyle:{color:'#e8edf5',fontSize:12},formatter:function(params){var s='<div style="font-weight:600;margin-bottom:4px;">'+params[0].axisValue+'</div>';params.forEach(function(p){if(p.value!=null){s+='<div>'+p.marker+' '+p.seriesName+': <b>'+(typeof p.value==='number'?p.value.toLocaleString():p.value)+'</b></div>';}});var ds=params[0].axisValue;var dE=daEv.filter(function(e){return e.date===ds});dE.forEach(function(e){s+='<div style="color:#ff3355;margin-top:2px;">&#9654; '+e.name+'</div>';});return s;}},
    legend:{data:['BTC 价格','美元指数 DXY','10Y 美债收益率','Fed 利率','黄金','原油','纳斯达克'],textStyle:{color:'#e8edf5',fontSize:12},top:0},
    grid:{left:110,right:280,top:36,bottom:40},
    xAxis:{type:'category',data:bt,axisLabel:{color:'#8899bb',fontSize:11,formatter:function(v){return v.split('-').slice(0,2).join('-');}},axisLine:{lineStyle:{color:'rgba(0,248,255,0.15)'}},splitLine:{show:false}},
    yAxis:[{type:'value',name:'BTC (USD)',position:'left',nameTextStyle:{color:'#f7931a',fontSize:11},axisLabel:{color:'#f7931a',fontSize:11,formatter:function(v){return v>=1000?(v/1000).toFixed(0)+'K':v;}},splitLine:{lineStyle:{color:'rgba(255,255,255,0.04)'}}},{type:'value',name:'Fed 利率',position:'left',offset:55,nameTextStyle:{color:'#b388ff',fontSize:11},axisLabel:{color:'#b388ff',fontSize:11,formatter:function(v){return v.toFixed(1)+'%';}},splitLine:{show:false}},{type:'value',name:'DXY',position:'right',offset:0,nameTextStyle:{color:'#00e5ff',fontSize:11},axisLabel:{color:'#00e5ff',fontSize:11},splitLine:{show:false}},{type:'value',name:'10Y %',position:'right',offset:50,nameTextStyle:{color:'#00e676',fontSize:11},axisLabel:{color:'#00e676',fontSize:11,formatter:function(v){return v.toFixed(1)+'%';}},splitLine:{show:false}},{type:'value',name:'黄金',position:'right',offset:105,nameTextStyle:{color:'#ffd700',fontSize:11},axisLabel:{color:'#ffd700',fontSize:10,formatter:function(v){return '$'+v.toFixed(0);}},splitLine:{show:false}},{type:'value',name:'原油',position:'right',offset:160,nameTextStyle:{color:'#ff5252',fontSize:11},axisLabel:{color:'#ff5252',fontSize:10,formatter:function(v){return '$'+v.toFixed(0);}},splitLine:{show:false}},{type:'value',name:'纳指',position:'right',offset:215,nameTextStyle:{color:'#4fc3f7',fontSize:11},axisLabel:{color:'#4fc3f7',fontSize:10,formatter:function(v){return v>=1000?(v/1000).toFixed(0)+'K':v;}},splitLine:{show:false}}],
    dataZoom:[{type:'inside',start:0,end:100},{type:'slider',start:0,end:100,height:24,bottom:0,borderColor:'rgba(0,248,255,0.2)',backgroundColor:'rgba(16,24,48,0.5)',dataBackground:{lineStyle:{color:'rgba(0,248,255,0.3)'}},selectedDataBackground:{lineStyle:{color:'#00e5ff'}},handleStyle:{color:'rgba(0,248,255,0.5)'},textStyle:{color:'#e8edf5'}}],
    series:[{id:'btc',name:'BTC 价格',type:'line',data:bp,smooth:true,symbol:'none',sampling:'lttb',focus:'series',blur:{lineStyle:{opacity:0.08}},emphasis:{lineStyle:{width:4,shadowBlur:12,shadowColor:'rgba(247,147,26,0.6)'}},lineStyle:{width:2,color:'#f7931a'},areaStyle:{color:new echarts.graphic.LinearGradient(0,0,0,1,[{offset:0,color:'rgba(247,147,26,0.3)'},{offset:1,color:'rgba(247,147,26,0)'}])},markLine:{silent:false,symbol:'none',data:[].concat(am,kl)}},{name:'美元指数 DXY',type:'line',yAxisIndex:2,data:da,connectNulls:true,smooth:true,symbol:'none',sampling:'lttb',focus:'series',blur:{lineStyle:{opacity:0.08}},emphasis:{lineStyle:{width:3.5,shadowBlur:10,shadowColor:'rgba(0,248,255,0.5)'}},lineStyle:{width:1.5,color:'#00e5ff'}},{name:'10Y 美债收益率',type:'line',yAxisIndex:3,data:ta,connectNulls:true,smooth:true,symbol:'none',sampling:'lttb',focus:'series',blur:{lineStyle:{opacity:0.08}},emphasis:{lineStyle:{width:3.5,shadowBlur:10,shadowColor:'rgba(0,230,118,0.5)'}},lineStyle:{width:1.5,color:'#00e676'}},{name:'Fed 利率',type:'line',yAxisIndex:1,data:fa,step:'end',symbol:'none',sampling:'lttb',focus:'series',blur:{lineStyle:{opacity:0.08}},emphasis:{lineStyle:{width:3.5,shadowBlur:10,shadowColor:'rgba(179,136,255,0.5)'}},lineStyle:{width:1.5,color:'#b388ff'}},{name:'黄金',type:'line',yAxisIndex:4,data:ga,connectNulls:true,smooth:true,symbol:'none',sampling:'lttb',focus:'series',blur:{lineStyle:{opacity:0.08}},emphasis:{lineStyle:{width:3.5,shadowBlur:10,shadowColor:'rgba(255,215,0,0.5)'}},lineStyle:{width:1.5,color:'#ffd700'}},{name:'原油',type:'line',yAxisIndex:5,data:oa,connectNulls:true,smooth:true,symbol:'none',sampling:'lttb',focus:'series',blur:{lineStyle:{opacity:0.08}},emphasis:{lineStyle:{width:3.5,shadowBlur:10,shadowColor:'rgba(255,82,82,0.5)'}},lineStyle:{width:1.5,color:'#ff5252'}},{name:'纳斯达克',type:'line',yAxisIndex:6,data:na,connectNulls:true,smooth:true,symbol:'none',sampling:'lttb',focus:'series',blur:{lineStyle:{opacity:0.08}},emphasis:{lineStyle:{width:3.5,shadowBlur:10,shadowColor:'rgba(79,195,247,0.5)'}},lineStyle:{width:1.5,color:'#4fc3f7'}}]
  });

  chartInstance.on('click',{componentType:'markLine'},function(p){var n=p.data?._name,f=p.data?._isFuture;if(n){if(f)showEventOutlook(n);else if(d.majorEventNames&&d.majorEventNames.includes(n))showEventAnalysis(n);}});
}
// ===== 视图模式切换 =====
function switchMode(mode) {
  if (chartInstance) chartInstance.dispose();
  chartInstance = null;
  const d = window.__cd;
  if (!d) return;
  const c = document.getElementById('timelineChart');
  const h = { classic:400, pixel:340, calendar:400, subway:380, parallel:360, polar:400, waterfall:360, range:340, bump:340, impact:380, percentile:340 };
  c.style.height = (h[mode] || 500) + 'px';
  if (mode === 'classic') { renderClassicChart(d, c); return; }
  const fns = { pixel:renderPixelHeatmap, calendar:renderCalendarHeatmap, subway:renderSubwayMap, parallel:renderParallelCoords, polar:renderPolarRing, waterfall:renderWaterfall, range:renderMonthlyRange, bump:renderBumpChart, impact:renderImpactStrips, percentile:renderPercentileBands };
  if (fns[mode]) fns[mode](d, c);
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.getElementById('analysisCard').style.display = 'none';
}

// ===== 通用工具 =====
function dailyReturns(arr) { const r=[]; for(let i=1;i<arr.length;i++){if(arr[i-1]!=null&&arr[i]!=null&&arr[i-1]!==0)r.push((arr[i]-arr[i-1])/arr[i-1]);else r.push(null);} return r; }
function monthKey(dates,i) { return dates[i]?dates[i].slice(0,7):''; }


// ===== 3. 地铁线路图 =====
function renderSubwayMap(d, container) {
  chartInstance = echarts.init(container);
  const assets = [
    { name:'BTC', data:d.btcPrices, color:'#f7931a', fmt:function(v){return '$'+(v>=1000?(v/1000).toFixed(0)+'K':v.toFixed(0))} },
    { name:'DXY', data:d.dxyAligned, color:'#00e5ff', fmt:function(v){return v.toFixed(1)} },
    { name:'10Y', data:d.treasuryAligned, color:'#00e676', fmt:function(v){return v.toFixed(1)+'%'} },
    { name:'黄金', data:d.goldAligned, color:'#ffd700', fmt:function(v){return '$'+v.toFixed(0)} },
    { name:'纳指', data:d.nasdaqAligned, color:'#4fc3f7', fmt:function(v){return v>=1000?(v/1000).toFixed(0)+'K':v.toFixed(0)} },
  ];
  const evTypeColors = { geopolitical:'#ff3355', macro:'#00e5ff', crypto:'#ff00aa' };
  const stations = d.data.events.filter(function(e){return d.majorEventNames.includes(e.name)&&!e.is_future}).slice(0,18);
  stations.sort(function(a,b){return a.date.localeCompare(b.date)});
  const stationDates = stations.map(function(s){return s.date});
  const idxs = stationDates.map(function(ds){return d.btcDates.indexOf(ds)}).filter(function(i){return i>=0});
  if(idxs.length<3) { container.innerHTML='<div class="loading" style="padding:40px;">事件站不足</div>';return; }
  const validStations = stations.filter(function(_,i){return stationDates.indexOf(stations[i].date)>=0&&idxs[i]>=0});
  const stationLabels = validStations.map(function(s){return s.name.slice(0,8)});
  const typeMarkers = validStations.map(function(s,i){return {value:[i,0], type:s.type||'macro', name:s.name}});
  chartInstance.setOption({
    tooltip:{trigger:'axis',backgroundColor:'rgba(10,14,26,0.9)',borderColor:'rgba(0,248,255,0.3)',textStyle:{color:'#e8edf5',fontSize:12},formatter:function(params){var s='<b>'+params[0].axisValue+'</b>';params.forEach(function(p){if(p.value!=null&&p.seriesName!=='事件')s+='<br/>'+p.marker+p.seriesName+': '+p.value;});return s;}},
    legend:{data:assets.map(function(a){return a.name}).concat(['事件']),textStyle:{color:'#e8edf5',fontSize:10},top:0},
    grid:{left:80,right:30,top:36,bottom:30},
    xAxis:{type:'category',data:stationLabels,axisLabel:{color:'#8899bb',fontSize:8,rotate:25,interval:0},axisLine:{lineStyle:{color:'rgba(0,248,255,0.15)'}},axisTick:{show:false}},
    yAxis:{type:'value',show:false,min:'dataMin',max:'dataMax',splitLine:{show:false}},
    series:[].concat(assets.map(function(a){return {name:a.name,type:'line',data:idxs.map(function(i){return a.data[i]}),smooth:true,symbol:'circle',symbolSize:7,lineStyle:{width:2.5,color:a.color,shadowBlur:8,shadowColor:a.color+'55'},itemStyle:{color:a.color,borderColor:'rgba(10,14,26,0.8)',borderWidth:2},label:{show:true,fontSize:8,color:a.color+'cc',backgroundColor:'rgba(10,14,26,0.5)',padding:[1,3],borderRadius:2,formatter:function(p){var idx=p.dataIndex;if(idx===0||idx===p.data.length-1||idx===Math.floor(p.data.length/2))return a.fmt(p.value);return '';}},connectNulls:true}}),[{name:'事件',type:'scatter',data:typeMarkers,symbol:'diamond',symbolSize:14,itemStyle:{color:function(p){return evTypeColors[p.data.type]||'#8899bb'},borderColor:'rgba(255,255,255,0.3)',borderWidth:1},label:{show:true,position:'bottom',fontSize:7,color:'rgba(255,255,255,0.5)',formatter:function(p){return p.data.name.slice(0,6)}},z:3}])
  });
}

// ===== 4. 平行坐标 =====
function renderParallelCoords(d, container) {
  chartInstance = echarts.init(container);
  const assets = [{name:'BTC',data:d.btcPrices},{name:'DXY',data:d.dxyAligned},{name:'10Y',data:d.treasuryAligned},{name:'黄金',data:d.goldAligned},{name:'原油',data:d.oilAligned},{name:'Fed',data:d.fedRateAligned},{name:'纳指',data:d.nasdaqAligned}];
  const windowSize=90;const windows=[];
  for(var i=0;i+windowSize<d.btcDates.length;i+=windowSize){
    var label=d.btcDates[i].slice(0,7)+'~'+d.btcDates[i+windowSize-1].slice(0,7);
    var row={label};var valid=true;
    assets.forEach(function(a,ai){var s=a.data[i],e=a.data[i+windowSize-1];if(s!=null&&e!=null&&s!==0)row['dim'+ai]=+((e-s)/s*100).toFixed(1);else{row['dim'+ai]=null;valid=false;}});
    if(valid)windows.push(row);
    if(windows.length>=16)break;
  }
  chartInstance.setOption({
    tooltip:{backgroundColor:'rgba(10,14,26,0.9)',borderColor:'rgba(0,248,255,0.3)',textStyle:{color:'#e8edf5',fontSize:12},formatter:function(params){var s='<b>'+params.data.label+'</b>';assets.forEach(function(a,i){s+='<br/>'+a.name+': '+(params.data['dim'+i]>0?'+':'')+params.data['dim'+i]+'%';});return s;}},
    parallel:{left:'8%',right:'8%',bottom:40,top:40,parallelAxisDefault:{type:'value',axisLabel:{color:'#8899bb',fontSize:9},splitLine:{lineStyle:{color:'rgba(255,255,255,0.04)'}},axisLine:{lineStyle:{color:'rgba(0,248,255,0.15)'}}}},
    parallelAxis:assets.map(function(a,i){return {dim:i,name:a.name,min:-60,max:60,nameTextStyle:{color:'#e8edf5',fontSize:11,fontWeight:'bold'}}}),
    series:[{type:'parallel',lineStyle:{width:3,opacity:0.85},data:windows,color:['#ff3355','#ff6644','#ffbb00','#00e5ff','#00ff88','#aa66ff'],smooth:true}]
  });
}

// ===== 5. 年轮环图 =====
function renderPolarRing(d, container) {
  chartInstance = echarts.init(container);
  const years=[...new Set(d.btcDates.map(function(s){return parseInt(s.slice(0,4))}))].sort();
  const colors=['#f7931a','#ff6644','#ffbb00','#00e5ff','#aa66ff','#00ff88','#ff3355'];
  const majorEvents=d.data.events.filter(function(e){return d.majorEventNames.includes(e.name)&&!e.is_future});
  const evInPolar=[];const evColors={geopolitical:'#ff3355',macro:'#00e5ff',crypto:'#ff00aa'};
  majorEvents.forEach(function(ev){var yi=years.indexOf(parseInt(ev.date.slice(0,4)));if(yi<0)return;var doy=Math.floor((new Date(ev.date).getTime()-new Date(parseInt(ev.date.slice(0,4)),0,1).getTime())/86400000);var price=null;for(var off=0;off<5;off++){var dStr=new Date(new Date(ev.date).getTime()+(off*86400000)).toISOString().slice(0,10);var idx=d.btcDates.indexOf(dStr);if(idx>=0&&d.btcPrices[idx]!=null){price=d.btcPrices[idx];break;}}if(price)evInPolar.push({value:[doy,price],name:ev.name,type:ev.type});});
  var series=years.map(function(yr,yi){var pts=[];d.btcDates.forEach(function(ds,i){var y=parseInt(ds.slice(0,4));if(y!==yr)return;var doy=Math.floor((new Date(ds).getTime()-new Date(yr,0,1).getTime())/86400000);if(d.btcPrices[i]!=null)pts.push([doy,d.btcPrices[i]]);});var isLast=yi===years.length-1;return{name:''+yr,type:'line',coordinateSystem:'polar',data:pts,smooth:true,symbol:'none',lineStyle:{width:isLast?3:1.5,color:colors[yi%colors.length],shadowBlur:isLast?12:0,shadowColor:'rgba(247,147,26,0.3)'},areaStyle:isLast?{color:new echarts.graphic.RadialGradient(0.5,0.5,1,[{offset:0,color:'rgba(247,147,26,0.12)'},{offset:1,color:'rgba(247,147,26,0)'}])}:void 0,z:isLast?3:1};});
  chartInstance.setOption({
    tooltip:{backgroundColor:'rgba(10,14,26,0.9)',borderColor:'rgba(0,248,255,0.3)',textStyle:{color:'#e8edf5',fontSize:12},formatter:function(params){return params.seriesName+': <b>$'+(params.value[1]>=1000?(params.value[1]/1000).toFixed(0)+'K':params.value[1].toFixed(0))+'</b>';}},
    legend:{data:years.map(function(y){return ''+y}),textStyle:{color:'#e8edf5',fontSize:10},top:0,selectedMode:'multiple'},
    polar:{radius:['12%','78%'],center:['50%','54%']},
    angleAxis:{type:'value',startAngle:90,axisLabel:{color:'#8899bb',fontSize:9,formatter:function(v){var m=['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];return m[Math.floor(v/30)]||'';}},splitLine:{lineStyle:{color:'rgba(255,255,255,0.04)'}}},
    radiusAxis:{type:'value',min:0,axisLabel:{color:'#8899bb',fontSize:9,formatter:function(v){return v>=1000?(v/1000).toFixed(0)+'K':v;}},splitLine:{lineStyle:{color:'rgba(255,255,255,0.04)'}}},
    series:[].concat(series,[{name:'重大事件',type:'scatter',coordinateSystem:'polar',data:evInPolar,symbol:'pin',symbolSize:22,itemStyle:{color:function(p){return evColors[p.data.type]||'#8899bb'},shadowBlur:6,shadowColor:'rgba(0,0,0,0.4)'},label:{show:true,fontSize:7,color:'#fff',formatter:function(p){return p.data.name.slice(0,6)}},tooltip:{formatter:function(params){return '<b>'+params.data.name+'</b><br/>$'+params.data.value[1].toLocaleString()}},z:4}])
  });
}

// ===== 6. 瀑布图 =====
function renderWaterfall(d, container) {
  chartInstance = echarts.init(container);
  const events=d.data.events.filter(function(e){return d.majorEventNames.includes(e.name)&&!e.is_future}).slice(0,10);
  const evData=events.map(function(ev){var idx=d.btcDates.indexOf(ev.date);if(idx<5)return null;var pre=d.btcPrices[idx-5];var post=d.btcPrices[Math.min(idx+20,d.btcPrices.length-1)];if(pre==null||post==null||pre===0)return null;return{name:ev.name.slice(0,12),change:+((post-pre)/pre*100).toFixed(1),pre};}).filter(Boolean);
  if(!evData.length){container.innerHTML='<div class="loading" style="padding:40px;">数据不足</div>';return;}
  var cum=0;const cumLine=evData.map(function(d){cum+=d.change;return +cum.toFixed(1);});const baseData=[0].concat(cumLine.slice(0,-1));const changes=evData.map(function(d){return d.change});const barColors=changes.map(function(v){return v>=0?'#00ff88':'#ff3355'});
  chartInstance.setOption({
    tooltip:{trigger:'axis',backgroundColor:'rgba(10,14,26,0.9)',borderColor:'rgba(0,248,255,0.3)',textStyle:{color:'#e8edf5',fontSize:12},formatter:function(params){var s='<b>'+evData[params[0].dataIndex].name+'</b>';params.forEach(function(p){s+='<br/>'+p.marker+p.seriesName+': '+p.value+'%';});return s;}},
    grid:{left:70,right:30,top:36,bottom:60},
    xAxis:{type:'category',data:evData.map(function(d){return d.name}),axisLabel:{color:'#8899bb',fontSize:8,rotate:0,interval:0},axisLine:{show:false},axisTick:{show:false}},
    yAxis:{type:'value',name:'累计变化 %',nameTextStyle:{color:'#8899bb',fontSize:10},axisLabel:{color:'#8899bb',fontSize:10,formatter:function(v){return v+'%'}},splitLine:{lineStyle:{color:'rgba(255,255,255,0.04)'}}},
    series:[{name:'累计水位',type:'bar',data:baseData,stack:'wf',itemStyle:{color:'transparent'},emphasis:{itemStyle:{color:'transparent'}}},{name:'事件冲击',type:'bar',data:changes,stack:'wf',itemStyle:{color:function(params){return barColors[params.dataIndex]}},label:{show:true,position:'outside',fontSize:9,fontWeight:'bold',color:'#e8edf5',formatter:function(p){return p.value>0?'+'+p.value+'%':p.value+'%'}}},{name:'累计趋势',type:'line',data:cumLine,smooth:false,symbol:'diamond',symbolSize:8,lineStyle:{width:2,color:'#00e5ff'},itemStyle:{color:'#00e5ff',borderColor:'rgba(10,14,26,0.8)',borderWidth:1.5},label:{show:true,position:'top',fontSize:9,color:'#00e5ff',formatter:function(p){return p.value+'%'}},z:3}]
  });
}

// ===== 7. 月度振幅图 =====
function renderMonthlyRange(d, container) {
  chartInstance = echarts.init(container);
  const months=[...new Set(d.btcDates.map(function(s){return s.slice(0,7)}))].sort();
  function monthStats(data,ym){var vals=[];d.btcDates.forEach(function(ds,i){if(ds.slice(0,7)===ym&&data[i]!=null)vals.push(data[i]);});if(vals.length<3)return null;return{high:Math.max.apply(null,vals),low:Math.min.apply(null,vals),open:vals[0],close:vals[vals.length-1]};}
  const stats=months.map(function(m){return monthStats(d.btcPrices,m)}).filter(Boolean);
  const labels=months.slice(0,stats.length);
  const ohlcData=stats.map(function(s){return[s.open,s.close,s.low,s.high]});
  const ma5=[];stats.forEach(function(s,i){var slice=stats.slice(Math.max(0,i-4),i+1).map(function(x){return x.close});ma5.push(slice.reduce(function(a,b){return a+b},0)/slice.length);});
  chartInstance.setOption({
    tooltip:{trigger:'axis',backgroundColor:'rgba(10,14,26,0.9)',borderColor:'rgba(0,248,255,0.3)',textStyle:{color:'#e8edf5',fontSize:12},formatter:function(params){var i=params[0].dataIndex,s=stats[i];return '<b>'+labels[i]+'</b><br/>高: $'+s.high.toLocaleString()+'<br/>低: $'+s.low.toLocaleString()+'<br/>开: $'+s.open.toLocaleString()+'<br/>收: $'+s.close.toLocaleString();}},
    grid:{left:80,right:30,top:10,bottom:40},
    xAxis:{type:'category',data:labels,axisLabel:{color:'#8899bb',fontSize:8,rotate:45},axisLine:{show:false},axisTick:{show:false},splitLine:{show:false}},
    yAxis:{type:'value',name:'BTC (USD)',nameTextStyle:{color:'#f7931a',fontSize:10},axisLabel:{color:'#f7931a',fontSize:9,formatter:function(v){return v>=1000?(v/1000).toFixed(0)+'K':v;}},splitLine:{lineStyle:{color:'rgba(255,255,255,0.04)'}}},
    series:[{name:'K线',type:'candlestick',data:ohlcData,barWidth:'60%',itemStyle:{color:'#00ff88',color0:'#ff3355',borderColor:'#00ff88',borderColor0:'#ff3355',borderWidth:1},markLine:{silent:true,symbol:'none',data:[{yAxis:15500,label:{formatter:'$15.5K',color:'rgba(255,51,85,0.25)',fontSize:8},lineStyle:{color:'rgba(255,51,85,0.1)',width:1,type:'dashed'}},{yAxis:69000,label:{formatter:'$69K',color:'rgba(255,136,0,0.25)',fontSize:8},lineStyle:{color:'rgba(255,136,0,0.1)',width:1,type:'dashed'}},{yAxis:100000,label:{formatter:'$100K',color:'rgba(0,255,136,0.25)',fontSize:8},lineStyle:{color:'rgba(0,255,136,0.1)',width:1,type:'dashed'}}]}},{name:'月均线(5)',type:'line',data:ma5,smooth:true,symbol:'none',lineStyle:{width:1.5,color:'rgba(0,248,255,0.4)'},z:2}]
  });
}

// ===== 8. 排名变化图 =====
function renderBumpChart(d, container) {
  chartInstance = echarts.init(container);
  const assets=[{name:'BTC',data:d.btcPrices,color:'#f7931a'},{name:'DXY',data:d.dxyAligned,color:'#00e5ff'},{name:'10Y',data:d.treasuryAligned,color:'#00e676'},{name:'黄金',data:d.goldAligned,color:'#ffd700'},{name:'原油',data:d.oilAligned,color:'#ff5252'},{name:'Fed',data:d.fedRateAligned,color:'#b388ff'}];
  var step=60;var periods=[];
  for(var i=0;i+step<d.btcDates.length;i+=step){
    var label=d.btcDates[i+step-1].slice(0,7);
    var rets=assets.map(function(a){var s=a.data[i],e=a.data[i+step-1];return s!=null&&e!=null&&s!==0?(e-s)/s:null;});
    var ranked=rets.map(function(r,ai){return{r,ai}}).filter(function(x){return x.r!=null}).sort(function(a,b){return b.r-a.r});
    var ranks={};ranked.forEach(function(x,ri){ranks[x.ai]=ri+1});periods.push({label,ranks});
  }
  var periodLabels=periods.map(function(p){return p.label});
  chartInstance.setOption({
    tooltip:{trigger:'axis',backgroundColor:'rgba(10,14,26,0.9)',borderColor:'rgba(0,248,255,0.3)',textStyle:{color:'#e8edf5',fontSize:12},formatter:function(params){var s='<b>'+params[0].axisValue+'</b>';params.forEach(function(p){s+='<br/>'+p.marker+p.seriesName+': 第'+p.value+'名';});return s;}},
    legend:{data:assets.map(function(a){return a.name}),textStyle:{color:'#e8edf5',fontSize:10},top:0},
    grid:{left:60,right:30,top:36,bottom:30},
    xAxis:{type:'category',data:periodLabels,axisLabel:{color:'#8899bb',fontSize:8,rotate:45},axisLine:{show:false},axisTick:{show:false}},
    yAxis:{type:'value',min:0.5,max:7.5,inverse:true,splitLine:{lineStyle:{color:'rgba(255,255,255,0.04)'}},axisLabel:{color:'#8899bb',fontSize:10},name:'排名',nameTextStyle:{color:'#8899bb',fontSize:9}},
    series:assets.map(function(a){return{name:a.name,type:'line',data:periods.map(function(p){return p.ranks[a.ai]||null}),smooth:true,symbol:'circle',symbolSize:10,lineStyle:{width:3,color:a.color,shadowBlur:6,shadowColor:a.color+'44'},itemStyle:{color:a.color,borderColor:'rgba(10,14,26,0.8)',borderWidth:2.5},connectNulls:true,label:{show:true,fontSize:8,color:'#fff',fontWeight:'bold',backgroundColor:a.color+'bb',padding:[1,4],borderRadius:3}}})
  });
}

// ===== 9. 事件冲击图 =====
function renderImpactStrips(d, container) {
  chartInstance = echarts.init(container);
  const assets=[{name:'BTC',data:d.btcPrices,color:'#f7931a'},{name:'DXY',data:d.dxyAligned,color:'#00e5ff'},{name:'10Y',data:d.treasuryAligned,color:'#00e676'},{name:'黄金',data:d.goldAligned,color:'#ffd700'},{name:'原油',data:d.oilAligned,color:'#ff5252'},{name:'Fed',data:d.fedRateAligned,color:'#b388ff'}];
  const events=d.data.events.filter(function(e){return d.majorEventNames.includes(e.name)&&!e.is_future}).slice(0,10);
  var impactData=[];var evNames=[];
  events.forEach(function(ev,ei){var idx=d.btcDates.indexOf(ev.date);if(idx<0||idx+10>=d.btcPrices.length)return;evNames.push(ev.name.slice(0,10));assets.forEach(function(a,ai){var pre=a.data[idx],post=a.data[idx+10];if(pre!=null&&post!=null&&pre!==0){var chg=+((post-pre)/pre*100).toFixed(1);impactData.push([ai,ei,chg]);}});});
  if(!evNames.length){container.innerHTML='<div class="loading" style="padding:40px;">数据不足</div>';return;}
  var minR=Math.min.apply(null,impactData.map(function(d){return d[2]}));var maxR=Math.max.apply(null,impactData.map(function(d){return d[2]}));var bound=Math.max(Math.abs(minR),Math.abs(maxR),5);
  chartInstance.setOption({
    tooltip:{backgroundColor:'rgba(10,14,26,0.9)',borderColor:'rgba(0,248,255,0.3)',textStyle:{color:'#e8edf5',fontSize:12},formatter:function(params){var v=params.data;return '<b>'+assets[v[0]].name+'</b> · '+evNames[v[1]]+'<br/>10日变化: <b style="color:'+(v[2]>0?'#00ff88':'#ff3355')+'">'+(v[2]>0?'+':'')+v[2]+'%</b>';}},
    grid:{left:75,right:20,top:25,bottom:60},
    xAxis:{type:'category',data:assets.map(function(a){return a.name}),position:'top',axisLabel:{color:'#e8edf5',fontSize:11,fontWeight:'bold'},axisLine:{show:false},splitLine:{show:false}},
    yAxis:{type:'category',data:evNames,axisLabel:{color:'#8899bb',fontSize:9},axisLine:{show:false},splitLine:{lineStyle:{color:'rgba(255,255,255,0.04)'}},splitArea:{show:true,areaStyle:{color:['rgba(0,0,0,0)','rgba(0,248,255,0.02)']}}},
    visualMap:{min:-bound,max:bound,calculable:true,left:'center',bottom:10,width:250,orient:'horizontal',inRange:{color:['#cc2244','#661133','#1a1a2e','#134433','#00cc77']},textStyle:{color:'#8899bb',fontSize:9}},
    series:[{type:'heatmap',data:impactData,label:{show:true,fontSize:11,fontWeight:'bold',color:'#fff',formatter:function(p){var v=p.data[2];return(v>0?'+':'')+v+'%';}},emphasis:{itemStyle:{shadowBlur:10,shadowColor:'rgba(0,0,0,0.5)',borderColor:'rgba(255,255,255,0.3)',borderWidth:1}},itemStyle:{borderColor:'rgba(0,0,0,0.2)',borderWidth:1}}]
  });
}

// ===== 10. 区间分位图 =====
function renderPercentileBands(d, container) {
  chartInstance = echarts.init(container);
  var quarters=[];var qLabels=[];
  for(var y=2020;y<=2026;y++){for(var q=1;q<=4;q++){var qStart=''+y+'-'+String((q-1)*3+1).padStart(2,'0')+'-01';var qEnd=''+y+'-'+String(q*3).padStart(2,'0')+'-31';var vals=[];d.btcDates.forEach(function(ds,i){if(ds>=qStart&&ds<=qEnd&&d.btcPrices[i]!=null)vals.push(d.btcPrices[i]);});if(vals.length<5)continue;vals.sort(function(a,b){return a-b});var p10=vals[Math.floor(vals.length*0.1)],p25=vals[Math.floor(vals.length*0.25)],p50=vals[Math.floor(vals.length*0.5)],p75=vals[Math.floor(vals.length*0.75)],p90=vals[Math.floor(vals.length*0.9)],avg=vals.reduce(function(a,b){return a+b},0)/vals.length;quarters.push({p10,p25,p50,p75,p90,avg});qLabels.push(y+'Q'+q);}}
  var p10=quarters.map(function(q){return q.p10}),p25=quarters.map(function(q){return q.p25}),p50=quarters.map(function(q){return q.p50}),p75=quarters.map(function(q){return q.p75}),p90=quarters.map(function(q){return q.p90}),avg=quarters.map(function(q){return q.avg});
  var p90mp10=p90.map(function(v,i){return v-p10[i]}),p75mp25=p75.map(function(v,i){return v-p25[i]});
  chartInstance.setOption({
    tooltip:{trigger:'axis',backgroundColor:'rgba(10,14,26,0.9)',borderColor:'rgba(0,248,255,0.3)',textStyle:{color:'#e8edf5',fontSize:12},formatter:function(params){var i=params[0].dataIndex,s=quarters[i];return '<b>'+qLabels[i]+'</b><br/>P90: $'+s.p90.toLocaleString()+'<br/>P75: $'+s.p75.toLocaleString()+'<br/>P50: $'+s.p50.toLocaleString()+'<br/>P25: $'+s.p25.toLocaleString()+'<br/>P10: $'+s.p10.toLocaleString()+'<br/>均价: $'+s.avg.toLocaleString();}},
    legend:{data:['P10-P90','P25-P75','中位数','均价'],textStyle:{color:'#e8edf5',fontSize:10},top:0},
    grid:{left:80,right:30,top:36,bottom:30},
    xAxis:{type:'category',data:qLabels,axisLabel:{color:'#8899bb',fontSize:9,rotate:45},axisLine:{show:false},axisTick:{show:false}},
    yAxis:{type:'value',name:'BTC (USD)',nameTextStyle:{color:'#f7931a',fontSize:10},axisLabel:{color:'#f7931a',fontSize:9,formatter:function(v){return v>=1000?(v/1000).toFixed(0)+'K':v;}},splitLine:{lineStyle:{color:'rgba(255,255,255,0.04)'}}},
    series:[{name:'P10-P90',type:'line',data:p10,stack:'out',symbol:'none',lineStyle:{width:0},areaStyle:{color:'rgba(247,147,26,0.08)'},z:1},{name:'P10-P90',type:'line',data:p90mp10,stack:'out',symbol:'none',lineStyle:{width:0.5,color:'rgba(247,147,26,0.15)'},areaStyle:{color:'rgba(247,147,26,0.08)'},z:1},{name:'P25-P75',type:'line',data:p25,stack:'in',symbol:'none',lineStyle:{width:0},areaStyle:{color:'rgba(247,147,26,0.18)'},z:2},{name:'P25-P75',type:'line',data:p75mp25,stack:'in',symbol:'none',lineStyle:{width:0.5,color:'rgba(247,147,26,0.35)'},areaStyle:{color:'rgba(247,147,26,0.18)'},z:2},{name:'中位数',type:'line',data:p50,smooth:true,symbol:'diamond',symbolSize:7,lineStyle:{width:2,color:'#f7931a'},itemStyle:{color:'#f7931a'},z:3},{name:'均价',type:'line',data:avg,smooth:true,symbol:'circle',symbolSize:4,lineStyle:{width:1,color:'#00e5ff',type:'dashed'},itemStyle:{color:'#00e5ff'},z:3}]
  });
}

// ===== 1. 像素图 =====
function renderPixelHeatmap(d, container) {
  chartInstance = echarts.init(container);
  const assets = [
    { name:'BTC', data:d.btcPrices }, { name:'DXY', data:d.dxyAligned },
    { name:'10Y', data:d.treasuryAligned }, { name:'黄金', data:d.goldAligned },
    { name:'原油', data:d.oilAligned }, { name:'Fed', data:d.fedRateAligned },
    { name:'纳指', data:d.nasdaqAligned }
  ];
  const months = [...new Set(d.btcDates.map(s=>s.slice(0,7)))].sort();
  function monthRet(data, ym) {
    const idxs = []; d.btcDates.forEach((ds,i)=>{if(ds.slice(0,7)===ym)idxs.push(i);});
    if(idxs.length<2) return null;
    const f=data[idxs[0]], l=data[idxs[idxs.length-1]];
    if(f==null||l==null||f===0) return null;
    return (l-f)/f*100;
  }
  const heatData = [];
  assets.forEach((a,ai)=>{ months.forEach((m,mi)=>{ const r=monthRet(a.data,m); if(r!=null) heatData.push([mi,ai,+r.toFixed(1)]); }); });

  // 找出极端月份标注
  const extremes = heatData.filter(d=>Math.abs(d[2])>=25).slice(0,60);

  chartInstance.setOption({
    tooltip: { position:'top', formatter:p=>{if(!p.data)return'';return '<b>'+assets[p.data[1]].name+'</b> '+months[p.data[0]]+'<br/>月收益率: <b style=\"color:'+(p.data[2]>0?'#00ff88':'#ff3355')+';\">'+(p.data[2]>0?'+':'')+p.data[2]+'%</b>';},
      backgroundColor:'rgba(10,14,26,0.9)',borderColor:'rgba(0,248,255,0.3)',textStyle:{color:'#e8edf5',fontSize:12} },
    grid: { left:60, right:30, top:10, bottom:40 },
    xAxis: { type:'category', data:months, axisLabel:{color:'#8899bb',fontSize:8,rotate:45,interval:Math.max(1,Math.floor(months.length/36))},
      axisLine:{show:false}, axisTick:{show:false}, splitArea:{show:true,areaStyle:{color:['rgba(0,0,0,0)','rgba(0,248,255,0.02)']}} },
    yAxis: { type:'category', data:assets.map(a=>a.name), axisLabel:{color:'#e8edf5',fontSize:12,fontWeight:'bold'},
      axisLine:{show:false}, axisTick:{show:false}, splitArea:{show:true,areaStyle:{color:['rgba(0,0,0,0)','rgba(0,248,255,0.02)']}} },
    visualMap: { min:-20, max:20, calculable:true, orient:'horizontal', left:'center', bottom:5, width:220,
      inRange:{color:['#cc2244','#661122','#1a1a2e','#1a3344','#00cc77']},
      textStyle:{color:'#8899bb',fontSize:9} },
    series: [{
      type:'heatmap', data:heatData, z:1,
      label:{show:true,fontSize:7,color:'rgba(255,255,255,0.5)',formatter:p=>Math.abs(p.data[2])>=20?(p.data[2]>0?'+'+p.data[2]:p.data[2])+ '%':''},
      emphasis:{itemStyle:{shadowBlur:10,shadowColor:'rgba(0,0,0,0.5)',borderColor:'#fff',borderWidth:1}},
    }]
  });
}

// ===== 2. 日历热力图 =====
function renderCalendarHeatmap(d, container) {
  chartInstance = echarts.init(container);
  const rets = dailyReturns(d.btcPrices);
  const calData = [];
  d.btcDates.forEach((ds,i)=>{ if(i>0&&rets[i-1]!=null) calData.push([ds, +(rets[i-1]*100).toFixed(1)]); });
  const years = [...new Set(d.btcDates.map(s=>parseInt(s.slice(0,4))))].sort();
  const cellH = Math.max(11, Math.min(18, Math.floor(380 / years.length)));
  const calendars = years.map((y,i)=>({ range:''+y, left:40, right:20, top:i*(cellH+19)+10, height:cellH,
    cellSize:['auto',cellH-2],
    splitLine:{lineStyle:{color:'rgba(0,248,255,0.06)'}},
    dayLabel:{show:i===0,color:'#8899bb',fontSize:8},
    monthLabel:{color:'#8899bb',fontSize:8},
    yearLabel:{show:true,color:'#e8edf5',fontSize:10} }));
  chartInstance.setOption({
    tooltip: { position:'top', formatter:p=>{if(!p.data||!p.data[0])return'';return p.data[0]+'<br/>日收益率: <b style=\"color:'+(p.data[1]>0?'#00ff88':'#ff3355')+';\">'+(p.data[1]>0?'+':'')+p.data[1]+'%</b>';},
      backgroundColor:'rgba(10,14,26,0.9)',borderColor:'rgba(0,248,255,0.3)',textStyle:{color:'#e8edf5',fontSize:12} },
    visualMap: { min:-8, max:8, calculable:true, orient:'horizontal', left:'center', bottom:5, width:280,
      inRange:{color:['#cc2244','#661133','#1a1a2e','#134433','#00cc77']},
      textStyle:{color:'#8899bb',fontSize:9} },
    calendar: calendars,
    series: [{ type:'heatmap', coordinateSystem:'calendar', data:calData }]
  });
}

// ===== 绑定视图切换按钮 =====
document.querySelectorAll('.filter-btn.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    switchMode(btn.dataset.mode);
  });
});

let analysisChartInstance = null;

// 事件分析: 调用 API + 渲染面板
async function showEventAnalysis(eventName) {
  const card = document.getElementById('analysisCard');
  const body = document.getElementById('analysisBody');
  const chartEl = document.getElementById('analysisChart');
  card.style.display = 'block';
  if (chartEl) chartEl.style.display = 'block';
  body.innerHTML = '<div class="loading"><div class="spinner"></div>分析中...</div>';

  try {
    const r = await fetch('/api/timeline/analysis?event=' + encodeURIComponent(eventName));
    const data = await r.json();
    if (data.error) { body.innerHTML = '<div class="loading">' + data.error + '</div>'; return; }

    const typeColors = { geopolitical: '#ffbb00', macro: '#00e5ff', crypto: '#ff00aa' };
    document.getElementById('analysisBadge').textContent = data.type;
    document.getElementById('analysisBadge').style.cssText =
      'background:' + (typeColors[data.type] || '#5a6a8a') + '22;color:' + (typeColors[data.type] || '#5a6a8a') + ';border:1px solid ' + (typeColors[data.type] || '#5a6a8a') + '44';
    document.getElementById('analysisTitle').textContent = data.event;
    document.getElementById('analysisDate').textContent = data.date;

    let html = '<div class="analysis-grid">';
    html += '<div class="glabel"></div><div class="gheader">7天</div><div class="gheader">30天</div><div class="gheader">90天</div>';

    const rows = [];
    if (data.windows[0]?.btc) rows.push({ label: 'BTC 事前%', key: 'btc', sub: 'pre_pct' });
    if (data.windows[0]?.btc) rows.push({ label: 'BTC 事后%', key: 'btc', sub: 'post_pct', isPost: true });
    if (data.windows[0]?.dxy) rows.push({ label: 'DXY 事前%', key: 'dxy', sub: 'pre_pct' });
    if (data.windows[0]?.dxy) rows.push({ label: 'DXY 事后%', key: 'dxy', sub: 'post_pct', isPost: true });
    if (data.windows[0]?.treasury) rows.push({ label: '10Y 事前bp', key: 'treasury', sub: 'pre_bp' });
    if (data.windows[0]?.treasury) rows.push({ label: '10Y 事后bp', key: 'treasury', sub: 'post_bp', isPost: true });
    if (data.windows[0]?.nasdaq) rows.push({ label: '纳指 事前%', key: 'nasdaq', sub: 'pre_pct' });
    if (data.windows[0]?.nasdaq) rows.push({ label: '纳指 事后%', key: 'nasdaq', sub: 'post_pct', isPost: true });

    for (const row of rows) {
      html += '<div class="grow-label">' + row.label + '</div>';
      for (const w of data.windows) {
        const val = w[row.key]?.[row.sub];
        const cls = val > 0 ? 'positive' : val < 0 ? 'negative' : 'neutral';
        const sign = val > 0 ? '+' : '';
        html += '<div class="grow ' + cls + '">' + sign + val + '</div>';
      }
    }

    html += '</div>';
    body.innerHTML = html;

    // 初始化迷你走势图
    if (analysisChartInstance) analysisChartInstance.dispose();
    const chartEl = document.getElementById('analysisChart');
    if (!chartEl) return;
    analysisChartInstance = echarts.init(chartEl);

    const series = data.series;
    if (!series) { analysisChartInstance = null; return; }

    const offsets = [];
    const btcPct = [], dxyPct = [], tnxBp = [], nasdaqPct = [];
    // 用 BTC 的 offset 作为 x 轴 (各资产可能缺失不同日期)
    if (series.btc) {
      for (const p of series.btc) {
        if (offsets.length === 0 || offsets[offsets.length-1] !== p.offset) offsets.push(p.offset);
        btcPct.push(p.change);
      }
    }
    // 对齐 DXY
    if (series.dxy) {
      const dxyMap = {};
      series.dxy.forEach(p => dxyMap[p.offset] = p.change);
      offsets.forEach(o => dxyPct.push(dxyMap[o] ?? null));
    }
    // 对齐 Treasury
    if (series.treasury) {
      const tnxMap = {};
      series.treasury.forEach(p => tnxMap[p.offset] = p.change);
      offsets.forEach(o => tnxBp.push(tnxMap[o] ?? null));
    }
    // 对齐 NASDAQ
    if (series.nasdaq) {
      const nasdaqMap = {};
      series.nasdaq.forEach(p => nasdaqMap[p.offset] = p.change);
      offsets.forEach(o => nasdaqPct.push(nasdaqMap[o] ?? null));
    }

    const miniOptions = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: 'rgba(10,14,26,0.9)',
        borderColor: 'rgba(0,248,255,0.3)',
        textStyle: { color: '#e8edf5', fontSize: 11 },
        formatter: function(params) {
          let s = '<div style="font-weight:600;font-size:11px;">偏移 ' + params[0].axisValue + ' 天</div>';
          params.forEach(p => {
            if (p.value != null) {
              const sign = p.value > 0 ? '+' : '';
              s += '<div style="font-size:11px;">' + p.marker + ' ' + p.seriesName + ': <b>' + sign + p.value + '</b></div>';
            }
          });
          return s;
        }
      },
      legend: {
        data: ['BTC %', 'DXY %', '10Y bp', '纳指 %'],
        textStyle: { color: '#8899bb', fontSize: 10 },
        top: 0, right: 0,
      },
      grid: { left: 50, right: 16, top: 28, bottom: 24 },
      xAxis: {
        type: 'category', data: offsets,
        axisLabel: { color: '#5a6a8a', fontSize: 9, formatter: v => v + 'd' },
        axisLine: { lineStyle: { color: 'rgba(0,248,255,0.1)' } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: '#5a6a8a', fontSize: 9, formatter: v => v + '%' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      },
      series: [
        { name: 'BTC %', type: 'line', data: btcPct, smooth: true, symbol: 'none',
          lineStyle: { width: 2, color: '#f7931a' } },
        { name: 'DXY %', type: 'line', data: dxyPct, smooth: true, symbol: 'none',
          lineStyle: { width: 1.5, color: '#00e5ff' } },
        { name: '10Y bp', type: 'line', data: tnxBp, smooth: true, symbol: 'none',
          lineStyle: { width: 1.5, color: '#00e676' } },
        { name: '纳指 %', type: 'line', data: nasdaqPct, smooth: true, symbol: 'none',
          lineStyle: { width: 1.5, color: '#4fc3f7' } },
      ],
    };
    // 添加 offset=0 竖线标记
    const zeroIdx = offsets.indexOf(0);
    if (zeroIdx >= 0) {
      miniOptions.series.push({
        name: '事件日', type: 'line',
        data: Array(offsets.length).fill(null),
        markLine: {
          silent: true, symbol: 'none',
          data: [{ xAxis: zeroIdx, label: { formatter: '事件日', color: 'rgba(255,255,255,0.3)', fontSize: 9 } }],
          lineStyle: { color: 'rgba(255,255,255,0.2)', width: 1, type: 'dashed' },
        }
      });
    }
    analysisChartInstance.setOption(miniOptions);
    analysisChartInstance.resize();
  } catch(e) {
    body.innerHTML = '<div class="loading">分析失败</div>';
  }
}

function closeAnalysis() {
  if (analysisChartInstance) { analysisChartInstance.dispose(); analysisChartInstance = null; }
  const chartEl = document.getElementById('analysisChart');
  if (chartEl) chartEl.style.display = 'block';
  document.getElementById('analysisCard').style.display = 'none';
}

// 未来事件展望
async function showEventOutlook(eventName) {
  const card = document.getElementById('analysisCard');
  const body = document.getElementById('analysisBody');
  const chartEl = document.getElementById('analysisChart');
  card.style.display = 'block';
  // 隐藏走势图 (展望不需要)
  if (chartEl) chartEl.style.display = 'none';
  body.innerHTML = '<div class="loading"><div class="spinner"></div>加载中...</div>';

  try {
    const r = await fetch('/api/timeline/analysis?event=' + encodeURIComponent(eventName));
    const data = await r.json();
    if (data.error) { body.innerHTML = '<div class="loading">' + data.error + '</div>'; return; }

    const typeColors = { geopolitical: '#ffbb00', macro: '#00e5ff', crypto: '#ff00aa' };
    document.getElementById('analysisBadge').textContent = '🔮 展望';
    document.getElementById('analysisBadge').style.cssText =
      'background:rgba(0,255,136,0.15);color:#00ff88;border:1px solid rgba(0,255,136,0.3)';
    document.getElementById('analysisTitle').textContent = '🔮 ' + data.event;
    document.getElementById('analysisDate').textContent = data.date;

    // 计算距离今天还有多少天
    const daysUntil = Math.ceil((new Date(data.date) - new Date()) / (86400000));
    const dayStr = daysUntil > 0 ? `距今日 ${daysUntil} 天` :
      daysUntil === 0 ? '今日' : '已过';

    const typeLabel = { geopolitical: '地缘政治', macro: '宏观', crypto: '加密' };
    let html = '<div class="outlook-card">';
    html += '<div class="outlook-row"><span class="outlook-label">类型</span><span>' + (typeLabel[data.type] || data.type) + '</span></div>';
    html += '<div class="outlook-row"><span class="outlook-label">日期</span><span>' + data.date + '</span></div>';
    html += '<div class="outlook-row"><span class="outlook-label">倒计时</span><span style="color:#00ff88;font-weight:600;">' + dayStr + '</span></div>';
    // 事件说明
    const desc = outlookDescriptions[data.event] || '等待事件发生。点击历史事件标记查看回顾分析。';
    html += '<div class="outlook-desc">' + desc + '</div>';
    html += '</div>';
    body.innerHTML = html;
  } catch(e) {
    body.innerHTML = '<div class="loading">加载失败</div>';
  }
}

// 未来事件简要说明
const outlookDescriptions = {
  '美国Q2 GDP初值': '市场预期GDP增速放缓至1.8%,关注是否触发衰退担忧。',
  '美国6月CPI': 'CPI预期维持在2.3%附近,核心CPI关注服务业通胀粘性。',
  'FOMC利率决议': '市场定价维持利率不变概率70%,关注点阵图及鲍威尔措辞。',
  '美国中期选举': '参众两院控制权争夺,结果将影响2027年财政政策走向。',
  'FOMC利率决议(含点阵图)': '季度点阵图更新,关注2027年利率路径预期变化。',
};

      };
      runScripts();
    } catch (e) {
      console.error('[Dashboard] Error executing page scripts:', e);
    }

    return () => {
      // Clean up fetch and globals
      window.fetch = origFetch;
      const styleEl = document.getElementById('dashboard-styles');
      if (styleEl) styleEl.remove();
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="page"
      dangerouslySetInnerHTML={{ __html: HTML_CONTENT }} 
    />
  );
}
