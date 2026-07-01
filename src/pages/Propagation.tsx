// @ts-nocheck
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { CONFIG } from '../lib/config';
import { Store, HistoryDB } from '../lib/store';
import { DataAPI } from '../lib/data';
import { PropagationEngine } from '../lib/propagation-engine';

const nativeFetch = window.fetch;

// Local fetch mocker for propagation APIs
const localFetch = async (url, options) => {
  const urlObj = new URL(url, window.location.origin);
  const path = urlObj.pathname;
  const params = urlObj.searchParams;

  // Fallback to native fetch for non-mocked paths
  if (!path.startsWith('/api/') && !path.startsWith('/propagation_graph.json')) {
    return nativeFetch(url, options);
  }

  let data = null;

  try {
    if (path === '/api/propagation/graph') {
      data = PropagationEngine.getGraphData();
    } else if (path === '/api/propagation/save') {
      const body = options?.body ? JSON.parse(options.body) : {};
      PropagationEngine.updateGraphData(body);
      data = { ok: true };
    } else if (path.startsWith('/propagation_graph.json')) {
      const res = await nativeFetch('/propagation_graph.json');
      data = await res.json();
    }
  } catch (e) {
    console.error('[localFetch] Error propagation route:', path, e);
  }

  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data)
  };
};

const HTML_CONTENT = '\n<div class="page">\n<div class="header">\n<div>\n<h1>◉ PROPAGATION</h1>\n<div class="sub">事件传导关系图谱 · 因果路径引擎</div>\n</div>\n<div class="nav">\n<a href="/">Dashboard</a>\n<a href="/architecture">Architecture</a>\n<a class="active" href="/propagation">Propagation</a>\n</div>\n</div>\n<div class="stats-bar">\n<div class="stat-chip"><span class="num" id="stNodes">-</span><span class="lbl">节点</span></div>\n<div class="stat-chip"><span class="num" id="stEdges">-</span><span class="lbl">传导边</span></div>\n<div class="stat-chip"><span class="num green" id="stEvents">-</span><span class="lbl">事件</span></div>\n<div class="stat-chip"><span class="num yellow" id="stTargets">-</span><span class="lbl">目标资产</span></div>\n<div class="stat-chip"><span class="num orange" id="stLines">-</span><span class="lbl">驱动线</span></div>\n<div style="flex:1"></div>\n<button class="stat-chip btn" onclick="showEditModal()" style="cursor:pointer;border-color:var(--yellow);color:var(--yellow);font-size:11px;">✎ 编辑图谱</button>\n</div>\n<div class="line-filters" id="lineFilters"></div>\n<div class="main-layout">\n<div class="graph-wrap">\n<div id="graphChart"><div class="chart-loading" id="chartLoading"><div class="spinner"></div><div class="lt">加载图谱...</div></div></div>\n<div class="graph-toolbar">\n<div class="search-wrap"><span class="search-icon">🔎</span><input id="searchInput" oninput="debouncedSearch(this.value)" placeholder="搜索节点..."/></div>\n<label>事件</label>\n<select id="eventSelect"><option value="">选择事件...</option></select>\n<div style="flex:1"></div>\n<button class="btn" id="btnAnimate" onclick="toggleAnimation()">▶ 路径动画</button>\n<span class="speed-wrap"><input id="speedSlider" max="1200" min="200" oninput="animSpeed=+this.value;document.getElementById(\'speedVal\').textContent=this.value+\'ms\'" step="100" type="range" value="600"/><span id="speedVal" style="font-size:10px;color:var(--text-dim);min-width:38px;">600ms</span></span>\n<button class="btn" id="btnEdgeLabel" onclick="toggleEdgeLabels()">☰ 边标签</button>\n<button class="btn active" id="btnForce" onclick="toggleLayout()">◎ 力导向</button>\n<button class="btn" onclick="resetGraph()">↻ 重置</button>\n<button class="btn" id="btnDynamicWeight" onclick="toggleDynamicWeights()">⚞⚟ 动态权重</button>\n<button class="btn" id="btnMarketVerify" onclick="toggleMarketVerify()">📈 验证</button>\n<button class="btn" id="btnHeatmap" onclick="toggleHeatmap()">🌡 热力</button>\n<button class="btn" id="btnNarrative" onclick="toggleNarrative()">📰 叙事</button>\n<button class="btn" id="btnOnchain" onclick="toggleOnchain()">⚙ 链上</button>\n<button class="btn" id="btnCalendar" onclick="toggleCalendar()">📅 日历</button>\n<button class="btn" id="btnDecay" onclick="toggleDecay()">⏰ 衰减</button>\n<button class="btn" id="btnArbitrage" onclick="toggleArbitrage()">⇄ 套利</button>\n<span id="animStep" style="font-size:10px;color:var(--text-dim);min-width:60px;"></span>\n<button class="btn" onclick="exportImage()" title="导出为PNG">📷 导出</button>\n</div>\n<div class="legend-bar" id="legendBar"></div>\n</div>\n<div class="side-panel">\n<div class="card" style="flex:none;padding:12px 16px;">\n<div class="tab-bar" style="margin-bottom:0;">\n<button class="tab-btn active" onclick="switchTab(\'events\',this)">⚡ 事件</button>\n<button class="tab-btn" onclick="switchTab(\'market\',this)">📈 市场</button>\n<button class="tab-btn" onclick="switchTab(\'paths\',this)">🔎 路径</button>\n<button class="tab-btn" onclick="switchTab(\'selected\',this)">📋 已选</button>\n<button class="tab-btn" onclick="switchTab(\'signals\',this)">📈 信号</button>\n<button class="tab-btn" onclick="switchTab(\'derive\',this)">🔎 推导</button>\n<button class="tab-btn" onclick="switchTab(\'scenario\',this)">⚙ 情景</button>\n<button class="tab-btn" onclick="switchTab(\'trace\',this)">🔎 归因</button>\n</div>\n</div>\n<div class="card tab-panel" id="tabEvents" style="flex:none;">\n<div class="card-title">⚡ 事件列表 <span style="font-weight:400;color:var(--text-dim);">Ctrl+点击多选</span></div>\n<div class="panel-scroll" id="eventsList"><div class="loading">加载中...</div></div>\n</div>\n<div class="card tab-panel" id="tabMarket" style="flex:none;display:none;">\n<div class="card-title">📈 市场实况 <span class="mkt-refresh" data-count="30" id="mktTimer">-</span></div>\n<div id="marketPanel"><div class="loading">加载中...</div></div>\n</div>\n<div class="card tab-panel" id="tabPaths" style="flex:none;display:none;">\n<div class="card-title">🔎 传导路径</div>\n<div class="panel-scroll" id="exposurePanel" style="max-height:400px;"><div class="loading">点击事件查看传导路径</div></div>\n</div>\n<div class="card tab-panel" id="tabSelected" style="flex:none;display:none;">\n<div class="card-title">📋 已选事件 <span id="selCount" style="color:var(--cyan);">0</span></div>\n<div id="selectedPanel"><div class="loading">Ctrl+点击选择多个事件</div></div>\n</div>\n<div class="card tab-panel" id="tabSignals" style="flex:none;display:none;">\n<div class="card-title">📈 信号影响 <span style="font-weight:400;color:var(--text-dim);">点击信号高亮传导边</span></div>\n<div id="signalPanel" style="max-height:420px;overflow-y:auto;"><div class="loading">启用动态权重后查看</div></div>\n</div>\n<div class="card tab-panel" id="tabDerive" style="flex:none;display:none;">\n<div class="card-title">🔎 后果推导 <span style="font-weight:400;color:var(--text-dim);">点击事件查看因果链</span></div>\n<div id="derivePanel" style="max-height:560px;overflow-y:auto;"><div class="loading">点击事件节点查看推导</div></div>\n</div>\n<div class="card tab-panel" id="tabScenario" style="flex:none;display:none;">\n<div class="card-title">⚙ 情景推演 <span style="font-weight:400;color:var(--text-dim);">调整传导边参数后对比基线</span></div>\n<div id="scenarioPanel" style="max-height:620px;overflow-y:auto;">\n<div class="loading" id="scenarioIdle">先在事件列表选一个事件</div>\n<div id="scenarioControls" style="display:none;">\n<div style="margin-bottom:8px;">\n<div id="scenarioEventLabel" style="font-size:14px;font-weight:600;color:#fff;margin-bottom:2px;">-</div>\n<div style="font-size:10px;color:var(--text-dim);">调整以下传导边的参数，点击"推演"对比基线</div>\n</div>\n<div id="scenarioEdgeSliders"></div>\n<div style="display:flex;gap:8px;margin:10px 0;">\n<button class="btn" onclick="runSimulation()" style="background:rgba(0,248,255,0.12);border-color:var(--cyan);color:var(--cyan);flex:1;">▶ 推演</button>\n<button class="btn" onclick="resetSimulation()" style="background:rgba(255,255,255,0.05);flex:0;">↻ 重置</button>\n</div>\n<div id="scenarioResult" style="display:none;"></div>\n</div>\n</div>\n</div>\n<div class="card tab-panel" id="tabTrace" style="flex:none;display:none;">\n<div class="card-title">🔎 逆向归因 <span style="font-weight:400;color:var(--text-dim);">从资产回溯到源头事件</span></div>\n<div id="tracePanel" style="max-height:620px;overflow-y:auto;">\n<div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">\n<span style="font-size:12px;color:var(--text-dim);">目标资产</span>\n<select id="traceTargetSelect" onchange="loadReverseTrace(this.value)" style="flex:1;background:rgba(0,0,0,0.3);color:var(--text);border:1px solid var(--border);border-radius:5px;padding:5px 10px;font-size:13px;font-family:var(--font);outline:none;">\n<option value="">选择目标资产...</option>\n</select>\n</div>\n<div id="traceResult"><div class="loading" id="traceIdle">选择目标资产查看归因分析</div></div>\n</div>\n</div>\n</div>\n</div>\n</div>\n<div class="toast" id="toastContainer"></div>\n<div class="modal-overlay" id="editModal">\n<div class="modal">\n<h2>✎ 编辑图谱</h2>\n<div class="tab-bar">\n<button class="tab-btn active" onclick="editTab(\'nodes\',this)">节点</button>\n<button class="tab-btn" onclick="editTab(\'edges\',this)">边</button>\n<button class="tab-btn" onclick="editTab(\'add-node\',this)">+ 新增节点</button>\n<button class="tab-btn" onclick="editTab(\'add-edge\',this)">+ 新增边</button>\n</div>\n<div id="editNodes">\n<label>选择节点</label>\n<select id="editNodeSelect" onchange="editNodeSelect()"></select>\n<label>ID</label><input id="editNodeId"/>\n<label>标签</label><input id="editNodeLabel"/>\n<label>类型</label><select id="editNodeType"><option>event</option><option>verifier</option><option>intermediate</option><option>special</option><option>feedback</option><option>target</option></select>\n<label>驱动线</label><select id="editNodeLine"><option value="">无</option><option>monetary</option><option>geopolitical</option><option>congressional</option><option>macro</option></select>\n<label>子类型</label><input id="editNodeSubtype"/>\n<div class="modal-btns"><button class="btn btn-danger" onclick="deleteNode()">删除节点</button><button class="btn btn-primary" onclick="saveNode()">保存节点</button></div>\n</div>\n<div id="editEdges" style="display:none;">\n<label>选择边</label><select id="editEdgeSelect" onchange="editEdgeSelect()"></select>\n<label>来源</label><select id="editEdgeFrom"></select>\n<label>目标</label><select id="editEdgeTo"></select>\n<label>类型</label><select id="editEdgeType"><option>propagates</option><option>verifies</option><option>bypasses</option><option>feeds_back</option></select>\n<label>权重</label><input id="editEdgeWeight" max="1" min="0.1" step="0.1" type="number"/>\n<label>置信度</label><input id="editEdgeConfidence" max="1" min="0.1" step="0.1" type="number"/>\n<label>方向</label><select id="editEdgeDirection"><option>up</option><option>down</option><option>same</option><option>inverse</option><option>complex</option><option>stable</option></select>\n<label>时滞 (h)</label><input id="editEdgeLag" min="0" step="0.5" type="number"/>\n<div class="modal-btns"><button class="btn btn-danger" onclick="deleteEdge()">删除边</button><button class="btn btn-primary" onclick="saveEdge()">保存边</button></div>\n</div>\n<div id="editAddNode" style="display:none;">\n<label>ID</label><input id="addNodeId"/><label>标签</label><input id="addNodeLabel"/>\n<label>类型</label><select id="addNodeType"><option>event</option><option>verifier</option><option>intermediate</option><option>special</option><option>feedback</option><option>target</option></select>\n<label>驱动线</label><select id="addNodeLine"><option value="">无</option><option>monetary</option><option>geopolitical</option><option>congressional</option><option>macro</option></select>\n<label>子类型</label><input id="addNodeSubtype"/>\n<div class="modal-btns"><button class="btn btn-primary" onclick="addNode()">新增节点</button></div>\n</div>\n<div id="editAddEdge" style="display:none;">\n<label>来源</label><select id="addEdgeFrom"></select>\n<label>目标</label><select id="addEdgeTo"></select>\n<label>类型</label><select id="addEdgeType"><option>propagates</option><option>verifies</option><option>bypasses</option><option>feeds_back</option></select>\n<label>权重</label><input id="addEdgeWeight" max="1" min="0.1" step="0.1" type="number" value="0.5"/>\n<label>置信度</label><input id="addEdgeConfidence" max="1" min="0.1" step="0.1" type="number" value="0.7"/>\n<label>方向</label><select id="addEdgeDirection"><option>up</option><option>down</option><option>same</option><option>inverse</option></select>\n<label>时滞 (h)</label><input id="addEdgeLag" min="0" step="0.5" type="number" value="1"/>\n<div class="modal-btns"><button class="btn btn-primary" onclick="addEdge()">新增边</button></div>\n</div>\n<div class="modal-btns" style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);">\n<span id="editStatus" style="font-size:11px;color:var(--text-dim);flex:1;"></span>\n<button class="btn" onclick="closeEditModal()">关闭</button>\n</div>\n</div>\n</div>\n\n\n';

export default function Propagation() {
  const containerRef = useRef(null);

  useEffect(() => {
    // Set globals
    window.CONFIG = CONFIG;
    window.Store = Store;
    window.DataAPI = DataAPI;
    window.PropagationEngine = PropagationEngine;
    window.echarts = echarts;

    // Intercept fetches
    const origFetch = window.fetch;
    window.fetch = localFetch;

    // Inject styles
    const style = document.createElement('style');
    style.id = 'propagation-styles';
    style.innerHTML = "\n/* ===== Propagation-specific overrides ===== */\nbody{font-size:15px;line-height:1.7;padding:24px;}\n.page{max-width:1500px;}\n.header{padding:14px 0 18px;margin-bottom:14px;}\n.header h1{font-size:22px;}\n.header .nav{font-size:15px;}\n.card{padding:16px;}\n.card-title{font-size:12px;letter-spacing:2px;margin-bottom:10px;font-weight:500;}\n\n.stats-bar{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;}\n.stat-chip{display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:8px;background:var(--surface);border:1px solid var(--border);font-size:13px;}\n.stat-chip .num{font-size:17px;font-weight:700;color:var(--cyan);}\n.stat-chip .num.magenta{color:var(--magenta);}\n.stat-chip .num.green{color:var(--green);}\n.stat-chip .num.yellow{color:var(--yellow);}\n.stat-chip .num.orange{color:var(--orange);}\n.stat-chip .lbl{color:var(--text-dim);letter-spacing:1px;}\n\n.line-filters{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;}\n.line-btn{padding:5px 14px;border-radius:20px;border:1px solid var(--border);background:rgba(0,0,0,0.2);color:var(--text-dim);font-size:13px;font-family:var(--font);cursor:pointer;transition:all 0.2s;letter-spacing:1px;}\n.line-btn:hover{border-color:rgba(255,255,255,0.15);color:var(--text);}\n.line-btn.active{background:rgba(0,248,255,0.08);color:#fff;border-color:var(--cyan);}\n.line-btn .dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:middle;}\n\n.main-layout{display:grid;grid-template-columns:1fr 360px;gap:14px;}\n@media(max-width:1100px){.main-layout{grid-template-columns:1fr;}}\n\n.graph-wrap{background:var(--surface);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;min-height:720px;position:relative;}\n#graphChart{width:100%;height:820px;position:relative;}\n.chart-loading{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(10,14,26,0.7);z-index:10;transition:opacity 0.5s;}\n.chart-loading .spinner{width:32px;height:32px;border:2px solid var(--border);border-top-color:var(--cyan);border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:12px;}\n@keyframes spin{to{transform:rotate(360deg)}}\n.chart-loading .lt{font-size:13px;color:var(--text-dim);letter-spacing:2px;}\n.chart-loading.hide{opacity:0;pointer-events:none;}\n\n.graph-toolbar{display:flex;gap:6px;padding:8px 14px;flex-wrap:wrap;align-items:center;border-top:1px solid var(--border);}\n.graph-toolbar label{font-size:12px;color:var(--text-dim);letter-spacing:1px;white-space:nowrap;}\n.graph-toolbar select{background:rgba(0,0,0,0.3);color:var(--text);border:1px solid var(--border);border-radius:5px;padding:5px 10px;font-size:13px;font-family:var(--font);cursor:pointer;outline:none;max-width:200px;}\n.graph-toolbar select:hover{border-color:var(--cyan);}\n.graph-toolbar .btn{padding:5px 12px;border-radius:5px;border:1px solid var(--border);background:rgba(0,0,0,0.3);color:var(--text-dim);font-size:13px;font-family:var(--font);cursor:pointer;transition:all 0.2s;white-space:nowrap;}\n.graph-toolbar .btn:hover{background:rgba(0,248,255,0.1);border-color:var(--cyan);color:var(--cyan);}\n.graph-toolbar .btn.active{background:rgba(0,248,255,0.12);border-color:var(--cyan);color:var(--cyan);}\n\n.search-wrap{position:relative;display:inline-block;}\n.search-wrap input{background:rgba(0,0,0,0.3);color:var(--text);border:1px solid var(--border);border-radius:5px;padding:5px 10px 5px 24px;font-size:13px;font-family:var(--font);width:150px;outline:none;transition:border-color 0.2s;}\n.search-wrap input:focus{border-color:var(--cyan);}\n.search-wrap input::placeholder{color:var(--text-dim);font-size:12px;}\n.search-icon{position:absolute;left:7px;top:4px;color:var(--text-dim);font-size:10px;pointer-events:none;}\n\n.side-panel{display:flex;flex-direction:column;gap:12px;}\n.panel-scroll{max-height:280px;overflow-y:auto;}\n.panel-scroll::-webkit-scrollbar{width:3px;}\n.panel-scroll::-webkit-scrollbar-track{background:transparent;}\n.panel-scroll::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}\n\n.legend-bar{display:flex;gap:10px;padding:3px 14px 8px;flex-wrap:wrap;}\n.legend-item{font-size:12px;color:var(--text-dim);display:flex;align-items:center;gap:4px;}\n.legend-dot{display:inline-block;width:7px;height:7px;border-radius:50%;flex-shrink:0;}\n\n.event-item{padding:8px 10px;border-radius:5px;cursor:pointer;border:1px solid transparent;margin-bottom:3px;transition:all 0.15s;font-size:14px;}\n.event-item:hover{background:rgba(0,248,255,0.05);border-color:rgba(0,248,255,0.15);}\n.event-item.active{background:rgba(0,248,255,0.1);border-color:var(--cyan);}\n.event-item.active2{background:rgba(255,0,170,0.1);border-color:var(--magenta);}\n.event-item .ei-label{color:#fff;font-weight:600;font-size:14px;}\n.event-item .ei-tag{font-size:11px;color:var(--text-dim);margin-left:6px;}\n\n.path-card{padding:8px 10px;border-radius:5px;border:1px solid rgba(255,255,255,0.06);margin-bottom:5px;font-size:14px;transition:all 0.2s;}\n.path-card:hover{border-color:rgba(0,248,255,0.2);}\n.path-card .pt{color:var(--cyan);font-weight:600;font-size:14px;}\n.path-card .pm{display:flex;gap:8px;margin-top:3px;font-size:12px;color:var(--text-dim);flex-wrap:wrap;}\n.path-card .pc{font-size:12px;color:var(--text-dim);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}\n.hl-path{color:var(--yellow);}\n\n.exposure-row{display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04);font-size:13px;}\n.exposure-row:last-child{border-bottom:none;}\n.er-label{color:var(--text-dim);}\n.er-val{color:var(--cyan);font-weight:600;}\n.er-val.magenta{color:var(--magenta);}\n.er-val.green{color:var(--green);}\n\n\n\n.mkt-bar{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;}\n.mkt-chip{padding:4px 10px;border-radius:4px;font-size:12px;border:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.15);}\n.mkt-chip .mkt-sym{color:var(--text-dim);}\n.mkt-chip .mkt-val{color:#fff;font-weight:600;margin-left:4px;}\n.mkt-chip .mkt-chg{font-weight:600;margin-left:4px;}\n\n.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:1000;align-items:center;justify-content:center;}\n.modal{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:24px;max-width:560px;width:90%;max-height:80vh;overflow-y:auto;}\n.modal h2{font-size:20px;color:#fff;margin-bottom:16px;}\n.modal label{display:block;font-size:13px;color:var(--text-dim);margin-bottom:4px;margin-top:12px;letter-spacing:1px;}\n.modal input,.modal select{width:100%;background:rgba(0,0,0,0.3);color:var(--text);border:1px solid var(--border);border-radius:5px;padding:6px 10px;font-size:13px;font-family:var(--font);outline:none;}\n.modal input:focus,.modal select:focus{border-color:var(--cyan);}\n.modal-btns{display:flex;gap:10px;margin-top:20px;justify-content:flex-end;}\n.modal-btns .btn{padding:6px 16px;border-radius:6px;border:1px solid var(--border);font-size:12px;font-family:var(--font);cursor:pointer;transition:all 0.2s;}\n.modal-btns .btn-primary{background:rgba(0,248,255,0.15);border-color:var(--cyan);color:var(--cyan);}\n.modal-btns .btn-primary:hover{background:rgba(0,248,255,0.25);}\n.modal-btns .btn-danger{background:rgba(255,51,85,0.15);border-color:var(--red);color:var(--red);}\n.modal-btns .btn-danger:hover{background:rgba(255,51,85,0.25);}\n\n.toast{position:fixed;top:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:6px;pointer-events:none;}\n.toast-item{padding:8px 16px;border-radius:8px;font-size:12px;font-family:var(--font);backdrop-filter:blur(12px);border:1px solid;animation:toastIn 0.25s ease-out;pointer-events:auto;max-width:320px;}\n.toast-item.success{background:rgba(0,255,136,0.12);border-color:rgba(0,255,136,0.3);color:var(--green);}\n.toast-item.error{background:rgba(255,51,85,0.12);border-color:rgba(255,51,85,0.3);color:var(--red);}\n.toast-item.info{background:rgba(0,248,255,0.1);border-color:rgba(0,248,255,0.2);color:var(--cyan);}\n@keyframes toastIn{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}\n.mkt-refresh{font-size:9px;color:var(--text-dim);margin-left:6px;display:inline-block;min-width:30px;}\n.speed-wrap{display:flex;align-items:center;gap:4px;}\n.speed-wrap input[type=range]{width:50px;height:2px;-webkit-appearance:none;background:var(--border);border-radius:2px;outline:none;cursor:pointer;}\n.speed-wrap input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:10px;height:10px;border-radius:50%;background:var(--cyan);cursor:pointer;}\n\n#signalPanel::-webkit-scrollbar{width:3px;}\n#signalPanel::-webkit-scrollbar-track{background:transparent;}\n#signalPanel::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}\n.signal-card{cursor:pointer;border-radius:6px;padding:8px 10px;margin-bottom:5px;transition:all 0.25s cubic-bezier(0.16,1,0.3,1);border:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.15);}\n.signal-card:hover{border-color:rgba(0,248,255,0.2) !important;background:rgba(255,255,255,0.03) !important;}\n\n/* Flowchart chain */\n.flow-chain{display:flex;align-items:center;flex-wrap:wrap;gap:2px;padding:4px 0;}\n.flow-node{display:flex;flex-direction:column;align-items:center;padding:6px 12px;border-radius:8px;border:1.5px solid;background:rgba(0,0,0,0.35);min-width:52px;transition:all 0.25s;box-shadow:0 0 8px rgba(255,255,255,0.03),inset 0 0 12px rgba(255,255,255,0.02);}\n.flow-node:hover{box-shadow:0 0 14px currentColor,inset 0 0 12px rgba(255,255,255,0.05);}\n.flow-node .fn-label{font-size:13px;font-weight:600;color:#fff;line-height:1.4;text-align:center;white-space:nowrap;}\n.flow-node .fn-type{font-size:10px;color:var(--text-dim);letter-spacing:0.5px;margin-top:1px;}\n.flow-conn{display:flex;flex-direction:column;align-items:center;padding:0 3px;min-width:36px;position:relative;}\n.flow-conn .fc-line{width:24px;height:2px;background:linear-gradient(90deg,var(--cyan),rgba(0,248,255,0.4));border-radius:2px;position:relative;margin:3px 0;box-shadow:0 0 6px rgba(0,248,255,0.35),0 0 12px rgba(0,248,255,0.1);}\n.flow-conn .fc-line::after{content:'►';position:absolute;right:-11px;top:-7px;font-size:9px;color:var(--cyan);text-shadow:0 0 6px rgba(0,248,255,0.6),0 0 12px rgba(0,248,255,0.2);}\n.flow-conn .fc-dir{font-size:15px;font-weight:700;line-height:1;text-shadow:0 0 8px currentColor,0 0 16px currentColor;}\n.flow-conn .fc-meta{font-size:10px;color:var(--text-dim);line-height:1.4;white-space:nowrap;}\n.flow-conn .fc-mult{font-size:10px;font-weight:700;padding:0 4px;border-radius:3px;line-height:1.4;}\n@media(max-width:768px){\n  body{padding:12px;}\n  .header h1{font-size:16px;}\n  .header .sub{font-size:10px;}\n  .graph-toolbar select{max-width:120px;}\n  #graphChart{height:400px;}\n  .stats-bar{gap:6px;}\n  .stat-chip{font-size:10px;padding:4px 8px;}\n  #animStep{display:none;}\n  .speed-wrap{display:none;}\n}\n\n.tab-bar{display:flex;gap:0;margin-bottom:14px;border-bottom:1px solid var(--border);}\n.tab-btn{padding:8px 16px;font-size:13px;font-family:var(--font);background:transparent;border:none;color:var(--text-dim);cursor:pointer;border-bottom:2px solid transparent;transition:all 0.2s;letter-spacing:1px;}\n.tab-btn:hover{color:var(--text);}\n.tab-btn.active{color:var(--cyan);border-bottom-color:var(--cyan);}\n";
    document.head.appendChild(style);

    // Run scripts
    try {
      const runScripts = () => {
        
// --- Script Segment ---

// ===== Global API Interceptor (Replaces Python backend) =====
(function() {
  const originalFetch = window.fetch;
  window.fetch = async function(url, options) {
    if (typeof url === 'string' && url.startsWith('/api/')) {
      console.log("[API Interceptor] Intercepting: " + url);
      try {
        if (!PropagationEngine._graph) {
          await PropagationEngine.load();
        }
        const u = new URL(url, window.location.href);
        const path = u.pathname;
        let data = null;

        if (path === '/api/propagation/graph') {
          if (options && options.method === 'POST') {
            const body = JSON.parse(options.body);
            data = PropagationEngine.updateGraphData(body);
          } else {
            data = PropagationEngine.getGraphData();
          }
        } else if (path === '/api/propagation/paths') {
          const eventId = u.searchParams.get('event');
          data = PropagationEngine.findPaths(eventId);
        } else if (path === '/api/propagation/exposure') {
          const eventId = u.searchParams.get('event');
          data = PropagationEngine.getExposure(eventId);
        } else if (path === '/api/propagation/market') {
          data = await getPropagationMarketLocal();
        } else if (path === '/api/propagation/dynamic-weights') {
          data = PropagationEngine.computeAdjustments();
        } else if (path === '/api/propagation/verify-market') {
          const eventId = u.searchParams.get('event');
          data = PropagationEngine.verifyChainWithMarket(eventId);
        } else if (path === '/api/propagation/narrative-overlay') {
          data = PropagationEngine.getNarrativeOverlay();
        } else if (path === '/api/propagation/onchain-overlay') {
          data = PropagationEngine.getOnchainOverlay();
        } else if (path === '/api/propagation/calendar-overlay') {
          data = PropagationEngine.getCalendarOverlay();
        } else if (path === '/api/propagation/event-decay') {
          data = PropagationEngine.getEventDecay();
        } else if (path === '/api/propagation/arbitrage-signals') {
          data = PropagationEngine.getArbitrageSignals();
        } else if (path === '/api/propagation/confidence-heatmap') {
          const eventId = u.searchParams.get('event');
          data = PropagationEngine.confidenceHeatmap(eventId);
        } else if (path === '/api/propagation/simulate') {
          const body = JSON.parse(options.body);
          data = PropagationEngine.simulateScenario(body.event, body.adjustments);
        } else if (path === '/api/propagation/reverse-trace') {
          const targetId = u.searchParams.get('target');
          data = PropagationEngine.reverseTrace(targetId);
        } else if (path === '/api/propagation/derive') {
          const eventId = u.searchParams.get('event');
          data = PropagationEngine.deriveConsequence(eventId);
        } else if (path === '/api/propagation/verifiers') {
          const eventId = u.searchParams.get('event');
          data = PropagationEngine.verifyVerifierChain(eventId);
        } else if (path === '/api/propagation/stats') {
          data = PropagationEngine.getGraphStats();
        } else if (path === '/api/propagation/events') {
          data = PropagationEngine.listEvents();
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
        console.error("[API Interceptor] Error intercepting " + url + ":", e);
      }
    }
    return originalFetch(url, options);
  };
})();

async function getPropagationMarketLocal() {
  const tl = await DataAPI.getTimelineData();
  const result = {};
  const aliases = {
    btc_price: 'btc',
    usd_index: 'dxy',
    oil_price: 'oil',
    nasdaq: 'nasdaq',
    gold_price: 'gold',
    treasury_yield: 'treasury'
  };
  const fields = {
    btc: 'price', dxy: 'price', oil: 'price',
    nasdaq: 'price', gold: 'price', treasury: 'yield'
  };
  for (const [key, alias] of Object.entries(aliases)) {
    const series = tl[alias] || [];
    const field = fields[alias];
    if (series.length > 0 && field) {
      const last = series[series.length - 1];
      const prev = series[0];
      const lastVal = last[field];
      const prevVal = prev[field];
      result[key] = {
        label: key,
        current: lastVal,
        change_pct: prevVal ? Math.round(((lastVal - prevVal) / prevVal * 100) * 10) / 10 : null,
        date: last.date
      };
    }
  }
  return result;
}

// 自动初始化传导引擎图谱
(async function() {
  console.log('[Propagation] Initializing propagation graph...');
  try {
    await PropagationEngine.load();
  } catch (e) {
    console.error('[Propagation] Graph load failed:', e);
  }
})();

window.onerror=function(m,s,l,c,err){
  var d=document.getElementById('jsError');
  if(!d){d=document.createElement('div');d.id='jsError';
  d.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:#1a0a0a;color:#ff3355;padding:20px;font-family:monospace;font-size:14px;border-bottom:2px solid #ff3355;max-height:200px;overflow:auto;';
  document.body.prepend(d);}
  d.innerHTML+='<div style="margin-bottom:4px;">JS Error: '+m+' at line '+l+':<br><span style="color:#ff8899;font-size:12px;">'+s+'</span></div>';
  console.error(m,s,l,c,err);
};
// ===== Config =====
const TYPE_COLORS={event:'#ff00aa',verifier:'#ff8800',intermediate:'#00f8ff',special:'#ffbb00',feedback:'#ff3355',target:'#00ff88'};
const TYPE_SYMBOLS={event:'diamond',verifier:'triangle',intermediate:'circle',special:'star',feedback:'rect',target:'roundRect'};
const TYPE_LABELS={event:'事件',verifier:'验证层',intermediate:'中介变量',special:'特殊',feedback:'反馈',target:'目标资产'};
const EDGE_COLORS={propagates:'rgba(0,248,255,0.45)',verifies:'rgba(255,136,0,0.5)',bypasses:'rgba(255,187,0,0.6)',feeds_back:'rgba(255,51,85,0.5)'};
const LINE_META={monetary:{label:'💲 货币政策',color:'#00f8ff'},geopolitical:{label:'🔥 地缘冲突',color:'#ff8800'},congressional:{label:'⚖️ 国会立法',color:'#ffbb00'},macro:{label:'📊 宏观',color:'#00ff88'},crypto:{label:'🪙 加密内生',color:'#ff00aa'}};
const DIR_MAP={up:'↑上涨',down:'↓下跌',same:'→同向',inverse:'↔反向',complex:'◊复杂',stable:'—稳定'};
const DIR_SYMBOLS={up:'↑',down:'↓',same:'→',inverse:'↔',complex:'◊',stable:'—'};
const DIR_COLORS={up:'#ff3355',down:'#00ff88',same:'#00f8ff',inverse:'#ff8800',complex:'#ffbb00',stable:'#8899bb'};


let rawGraph={nodes:[],edges:[]},chart=null,eventList=[],selectedEvents=[];
let layoutMode='force',showEdgeLabels=false,animating=false,animTimer=null,activeLines=new Set();
let marketData=null,mkTimer=null,animSpeed=600;
let dynamicWeightsEnabled=false,dynamicWeightData=null,dynamicSignalData=null,baseEdgeWidths=null,activeSignal=null;

function showToast(msg,type,ms){
  ms=ms||2500;const c=document.getElementById('toastContainer'),el=document.createElement('div');
  el.className='toast-item '+type;el.textContent=msg;c.appendChild(el);
  setTimeout(()=>{el.style.opacity='0';el.style.transition='opacity 0.3s';setTimeout(()=>el.remove(),300);},ms);
}
function nodeLabel(id){const n=rawGraph.nodes.find(x=>x.id===id);return n?n.label||id:id||id;}
function debounce(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);}}

// ===== Load =====

async function loadGraph(){
  try{
    logLoad(0);if(!true)throw new Error('ECharts library load timeout');
    logLoad(1);const r=await fetch('/api/propagation/graph'),data=await r.json();
    logLoad(2);if(!data.nodes){showToast('图谱数据异常','error');return;}
    rawGraph=data;eventList=data.nodes.filter(n=>n.type==='event'||n.type==='verifier');
    const st=data.stats||{};
    logLoad(3);document.getElementById('stNodes').textContent=st.total_nodes||0;
    document.getElementById('stEdges').textContent=st.total_edges||0;
    document.getElementById('stEvents').textContent=st.nodes_by_type?.event||0;
    document.getElementById('stTargets').textContent=st.nodes_by_type?.target||0;
    const lines=[...new Set(data.nodes.map(n=>n.line).filter(Boolean))];
    document.getElementById('stLines').textContent=lines.length;
    lines.forEach(l=>activeLines.add(l));
    logLoad(4);renderLineFilters(lines);
    logLoad(5);if(typeof echarts==='undefined')throw new Error('ECharts library not loaded');
    logLoad(6);renderGraph();
    logLoad(7);renderEventList();
    logLoad(8);populateTraceTargets();
    logLoad(9);startMarketRefresh();
    logLoad(10);
  }catch(e){console.error('loadGraph error:',e);const el=document.getElementById('chartLoading');const msg=e&&e.message?e.message:String(e);if(el){el.innerHTML='<div style="color:#ff3355;font-size:16px;font-weight:bold;text-align:center;padding:40px 20px;line-height:1.8;">⚠ ['+loadStep+'] 加载失败<br><span style="font-size:13px;font-weight:normal;color:#ff8899;">'+msg+'</span></div>';}showToast('['+loadStep+'] '+'图谱加载失败: '+msg,'error',8000);}
}
let loadStep=0;
function logLoad(s){loadStep=s;console.log('loadGraph step:',s);}

// ===== Layout (#1: 分层定位) =====
function computeLayout(nodes,edges){
  const xPos={event:130,verifier:180,intermediate:440,special:440,target:740,feedback:60};
  const symSize={event:28,verifier:24,intermediate:24,special:26,target:32,feedback:22};
  const colOf={event:'a',verifier:'a',intermediate:'b',special:'b',target:'c',feedback:'x'};
  const LPOS={event:'right',verifier:'right',intermediate:'right',special:'right',target:'left',feedback:'right'};
  // Count per lane+col
  const counts={};
  nodes.forEach(n=>{const l=n.line||'',t=n.type||'';if(!xPos[t])return;const k=l+':'+colOf[t];counts[k]=(counts[k]||0)+1;});
  // Stack lanes based on tallest column
  const laneY={},laneSp={};let y=60;
  ['monetary','geopolitical','congressional'].forEach(line=>{
    const a=counts[line+':a']||0,b=counts[line+':b']||0,c=counts[line+':c']||0,x=counts[line+':x']||0;
    const maxN=Math.max(a,b,c);if(maxN===0&&x===0)return;
    const sp=Math.max(42,Math.min(52,400/maxN));const span=Math.max((maxN-1)*sp,80);
    laneY[line]=y+span/2;laneSp[line]=sp;
    y+=span+60;
    // Place feedback nodes in a dedicated bottom row
    if(x>0){const fk='_fb_'+line;laneY[fk]=y;laneSp[fk]=28;y+=28*x+10;}
  });
  // crypto/macro share monetary/geopolitical centers
  if(laneY.monetary!==void 0){laneY.crypto=laneY.monetary;laneSp.crypto=laneSp.monetary;}
  if(laneY.geopolitical!==void 0){laneY.macro=laneY.geopolitical;laneSp.macro=laneSp.geopolitical;}
  // Shared intermediaries: place in primary line but visible in all lines
  nodes.forEach(n=>{
    const lines=n.lines||[n.line];
    if(lines.length>1&&!n._primaryLine){n._primaryLine=n.line;n._allLines=lines;}
  });
  // Distribute nodes
  const posCount={},positions={};
  nodes.forEach(n=>{
    const l=n.line||'',t=n.type||'',col=colOf[t];
    if(!xPos[t]){positions[n.id]={x:400,y:400};return;}
    if(laneY[l]===void 0){positions[n.id]={x:xPos[t],y:y};return;}
    if(col==='x'){ // feedback goes to dedicated bottom row
      const fk='_fb_'+l;if(laneY[fk]===void 0){positions[n.id]={x:xPos[t],y:laneY[l]};return;}
      const fk2=fk+':x';const fc=counts[l+':x']||1;
      const idx=(posCount[fk2]=(posCount[fk2]||0)+1)-1;
      positions[n.id]={x:xPos[t],y:laneY[fk]+idx*laneSp[fk]};
      return;
    }
    const k=l+':'+col;const total=counts[k]||1;
    const idx=(posCount[k]=(posCount[k]||0)+1)-1;
    const sp=Math.max(laneSp[l]||34,symSize[t]*1.2);
    positions[n.id]={x:xPos[t],y:laneY[l]-(total-1)*sp/2+idx*sp};
  });
  return nodes.map(n=>{
    const t=n.type||'intermediate',p=positions[n.id]||{x:300,y:300};
    return{
      id:n.id,name:n.label||n.id,category:t,line:n.line||'',subtype:n.subtype||'',
      symbol:TYPE_SYMBOLS[t]||'circle',symbolSize:symSize[t]||24,
      itemStyle:{color:TYPE_COLORS[t]||'#8899bb',borderColor:LINE_META[n.line]?.color||'rgba(255,255,255,0.1)',borderWidth:t==='target'?3:t==='event'?2:1.5,opacity:n.opacity??1},
      label:{position:LPOS[t]||'right'},
      fixed:true,x:p.x,y:p.y,
    };
  });
}
// ===== Render Graph =====
function renderGraph(){
  const dom=document.getElementById('graphChart');
  const loadEl=document.getElementById('chartLoading');
  if(!chart)chart=echarts.init(dom,null,{renderer:'canvas',devicePixelRatio:Math.max(window.devicePixelRatio||1,2)});
  const laidOut=computeLayout(rawGraph.nodes,rawGraph.edges);
  const cats=[...new Set(laidOut.map(n=>n.category))].map(c=>({name:c,itemStyle:{color:TYPE_COLORS[c]||'#8899bb'}}));
  const edges=rawGraph.edges.map(e=>({
    source:e.from,target:e.to,weight:e.weight||0.5,type:e.type||'propagates',
    direction:e.direction||'same',confidence:e.confidence||0.5,time_lag_hours:e.time_lag_hours||0,
    lineStyle:{color:EDGE_COLORS[e.type]||'rgba(0,248,255,0.3)',width:Math.max(2.5,(e.weight||0.5)*6),curveness:e.type==='feeds_back'?0.3:e.type==='verifies'?0.2:0.1,opacity:0.85,shadowBlur:8,shadowColor:'rgba(0,248,255,0.15)'},
    symbol:['feeds_back','verifies'].includes(e.type)?'none':'arrow',symbolSize:[8,12],
  }));
  chart.setOption({
    backgroundColor:'transparent',
    tooltip:{formatter:p=>{
      if(p.dataType==='node'){const n=p.data;return `<strong>${n.name}</strong><br/><span style="color:${TYPE_COLORS[n.category]||'#8899bb'}">${TYPE_LABELS[n.category]||n.category}</span>${LINE_META[n.line]?'<br/>'+LINE_META[n.line].label:''}${n.subtype?'<br/>子类型:'+n.subtype:''}`;}
      if(p.dataType==='edge'){const e=p.data;const sn=nodeLabel(e.source),tn=nodeLabel(e.target);return `<strong>${sn} → ${tn}</strong><br/>类型:${e.type} 权重:${e.weight}<br/>方向:${DIR_MAP[e.direction]||e.direction}<br/>时滞:${e.time_lag_hours}h 置信:${e.confidence}`;}
      return '';
    },backgroundColor:'rgba(10,14,26,0.92)',borderColor:'rgba(0,248,255,0.2)',textStyle:{color:'#e8edf5',fontSize:14}},
    legend:{data:cats.map(c=>c.name),textStyle:{color:'#8899bb',fontSize:13},pageIconColor:'#00f8ff',pageTextStyle:{color:'#8899bb'},bottom:0,left:16,icon:'circle',itemWidth:12,itemHeight:12},
    series:[{
      type:'graph',layout:layoutMode,roam:true,draggable:true,
      force:{repulsion:400,edgeLength:[30,120],layoutAnimation:false,friction:0.1,gravity:0.03},
      data:laidOut,edges,categories:cats,
      edgeSymbol:['none','arrow'],edgeSymbolSize:[0,8],
      labelLayout:{hideOverlap:true},label:{show:true,color:'#e0e6f0',fontSize:13,fontWeight:500,textShadowColor:'rgba(0,0,0,0.5)',textShadowBlur:4,formatter:p=>p.data.name},
      emphasis:{focus:'adjacency',lineStyle:{width:4}},
      lineStyle:{color:'source',curveness:0.1},
      itemStyle:{borderColor:'rgba(255,255,255,0.15)',borderWidth:1},
    }],
  },true);
  if(loadEl)loadEl.classList.add('hide');
  renderLegendBar();
  chart.on('click',function(p){
    if(p.dataType!=='node')return;
    var n=rawGraph.nodes.find(function(x){return x.id===p.data.id;});
    if(n&&n.type==='target'){
      document.getElementById('traceTargetSelect').value=n.id;
      loadReverseTrace(n.id);
      switchTab('trace');
    } else {
      toggleSelectEvent(p.data.id,p.event);
    }
  });
}

// ===== Line Filters =====
function renderLineFilters(lines){
  const c=document.getElementById('lineFilters');
  c.innerHTML='<button class="btn" onclick="resetGraph()" style="font-size:10px;padding:3px 8px;">&#8635; 清除筛选</button>';
  lines.forEach(line=>{
    const m=LINE_META[line]||{label:line,color:'#8899bb'};
    const btn=document.createElement('button');btn.className='line-btn active';
    btn.innerHTML=`<span class="dot" style="background:${m.color}"></span>${m.label}`;
    btn.dataset.line=line;
    btn.onclick=()=>{activeLines.has(line)?activeLines.delete(line):activeLines.add(line);btn.classList.toggle('active');applyLineFilter();};
    c.appendChild(btn);
  });
}
function applyLineFilter(){
  const nodes=rawGraph.nodes.map(n=>{
    const nodeLines=n.lines||[n.line];
    const visible=nodeLines.some(l=>activeLines.has(l))||!n.line;
    return{...n,opacity:visible?1:0.12};
  });
  chart.setOption({series:[{data:computeLayout(nodes,rawGraph.edges)}]});
}

// ===== Search =====
function searchNode(q){
  if(!q){resetGraphHighlight();return;}
  const ql=q.toLowerCase();
  const nodes=rawGraph.nodes.map(n=>{const m=(n.label||n.id).toLowerCase().includes(ql)||n.id.toLowerCase().includes(ql);return{...n,opacity:m?1:0.1};});
  chart.setOption({series:[{data:computeLayout(nodes,rawGraph.edges)}]});
}
const debouncedSearch=debounce(searchNode,200);

// ===== Event List =====
function renderEventList(){
  const sel=document.getElementById('eventSelect');
  sel.innerHTML='<option value="">选择事件...</option>';
  const grouped={};
  eventList.forEach(ev=>{const l=ev.line||'other';if(!grouped[l])grouped[l]=[];grouped[l].push(ev);});
  Object.entries(grouped).forEach(([line,events])=>{
    const grp=document.createElement('optgroup');grp.label=LINE_META[line]?.label||line;
    events.forEach(ev=>{const opt=document.createElement('option');opt.value=ev.id;opt.textContent=`${ev.label}${ev.subtype?' ['+ev.subtype+']':''}`;grp.appendChild(opt);});
    sel.appendChild(grp);
  });
  sel.onchange=()=>{if(sel.value)toggleSelectEvent(sel.value);};
  const container=document.getElementById('eventsList');
  container.innerHTML='';
  eventList.forEach(ev=>{
    const item=document.createElement('div');item.className='event-item';item.dataset.id=ev.id;
    const lines=ev.lines||[ev.line];
    const dot=LINE_META[lines[0]]?.color||'#8899bb';
    let badgeHtml='';
    if(ev.mutually_exclusive_with&&ev.mutually_exclusive_with.length){
      const meLabels=ev.mutually_exclusive_with.map(m=>m.label).join(', ');
      badgeHtml=`<span class="ei-tag" style="color:var(--orange);border:1px solid rgba(255,136,0,0.3);border-radius:3px;padding:0 4px;margin-left:4px;" title="与 ${meLabels} 互斥">⚡互斥</span>`;
    }
    item.innerHTML=`<div class="ei-label"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${dot};margin-right:5px;"></span>${ev.label} <span class="ei-tag">${ev.subtype||''}</span>${badgeHtml}</div>`;
    item.onclick=e=>toggleSelectEvent(ev.id,e);
    container.appendChild(item);
  });
}

// ===== Flow Pulse =====
let flowTimer=null;
function stopFlowPulse(){if(flowTimer){clearInterval(flowTimer);flowTimer=null;}}
function startFlowPulse(eventId){
  stopFlowPulse();
  fetch(`/api/propagation/paths?event=${eventId}`).then(r=>r.json()).then(paths=>{
    if(!paths.length)return;
    const touchedEdges=new Set();
    paths.forEach(p=>{p.edges.forEach(e=>touchedEdges.add(`${e.from}->${e.to}`));});
    let phase=0;
    flowTimer=setInterval(()=>{
      phase=(phase+1)%20;
      const intensity=0.5+0.5*Math.sin(phase*Math.PI/10);
      const ed=rawGraph.edges.map(e=>{
        const k=`${e.from}->${e.to}`;const onPath=touchedEdges.has(k);
        return{source:e.from,target:e.to,weight:e.weight||0.5,type:e.type||'propagates',
          direction:e.direction||'same',confidence:e.confidence||0.5,time_lag_hours:e.time_lag_hours||0,
          lineStyle:{...e.lineStyle,
            opacity:onPath?0.3+0.7*intensity:0.03,
            width:onPath?2+2*intensity:Math.max(0.5,(e.weight||0.5)*2),
            shadowBlur:onPath?4+14*intensity:0,
            shadowColor:onPath?`rgba(0,248,255,${0.1+0.35*intensity})`:'transparent'},
          symbol:['feeds_back','verifies'].includes(e.type)?'none':'arrow',symbolSize:[8,12]};
      });
      chart.setOption({series:[{edges:ed}]});
    },100);
  })['catch'](function(){});
}
// ===== Multi-Select (#4) =====
async function propagateOnce(id){
  try{
    const paths=await fetch(`/api/propagation/paths?event=${id}`).then(r=>r.json());
    if(!paths.length)return;
    const allEdges=[];const seen=new Set();
    paths.forEach(p=>{p.edges.forEach(e=>{const k=`${e.from}->${e.to}`;if(!seen.has(k)){seen.add(k);allEdges.push(e);}});});
    const nodeIds=new Set();paths.forEach(p=>p.path.forEach(n=>nodeIds.add(n)));
    const panel=document.getElementById('exposurePanel');
    // Build node lookup
    const nMap={};rawGraph.nodes.forEach(n=>{nMap[n.id]=n;});
    // Step-by-step: animate + show detail
    for(let i=0;i<allEdges.length;i++){
      const active=new Set();for(let j=0;j<=i;j++)active.add(`${allEdges[j].from}->${allEdges[j].to}`);
      const edge=allEdges[i];
      const fromN=nMap[edge.from],toN=nMap[edge.to];
      const dirSym=DIR_SYMBOLS[edge.direction]||'→';
      const dirCls=DIR_COLORS[edge.direction]||'var(--text-dim)';
      // Side panel: step detail
      panel.innerHTML=`<div style="font-size:10px;color:var(--text-dim);margin-bottom:6px;letter-spacing:1px;">⚡ 传导 ${i+1}/${allEdges.length}</div>
        <div class="path-card" style="border-color:var(--cyan);background:rgba(0,248,255,0.05);">
          <div style="font-size:11px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span style="color:${TYPE_COLORS[fromN?.type]||'#8899bb'}">${fromN?.label||edge.from}</span>
            <span style="color:${dirCls};font-weight:700;">${dirSym}</span>
            <span style="color:${TYPE_COLORS[toN?.type]||'#8899bb'}">${toN?.label||edge.to}</span>
          </div>
          <div class="pm" style="margin-top:4px;">
            <span>权重 <b style="color:var(--cyan)">${edge.weight||'?'}</b></span>
            <span>置信 <b style="color:var(--green)">${edge.confidence||'?'}</b></span>
            <span>时滞 <b style="color:var(--yellow)">${edge.time_lag_hours||0}h</b></span>
          </div>
        </div>
        <div style="font-size:10px;color:var(--text-dim);margin-top:4px;">${edge.note||''}</div>`;
      // Animate graph
      const nd=rawGraph.nodes.map(n=>({...n,opacity:nodeIds.has(n.id)?(i>=allEdges.length-1?1:0.25):0.08}));
      const ed=rawGraph.edges.map(e=>{
        const k=`${e.from}->${e.to}`;const a=active.has(k);
        return{source:e.from,target:e.to,weight:e.weight||0.5,type:e.type||'propagates',direction:e.direction||'same',confidence:e.confidence||0.5,time_lag_hours:e.time_lag_hours||0,
          lineStyle:{color:a?'rgba(0,248,255,0.9)':EDGE_COLORS[e.type]||'rgba(0,248,255,0.3)',width:a?4:Math.max(1,(e.weight||0.5)*3),opacity:a?1:0.06,shadowBlur:a?14:0,shadowColor:a?'rgba(0,248,255,0.4)':'transparent',curveness:e.type==='feeds_back'?0.3:e.type==='verifies'?0.2:0.1},
          symbol:['feeds_back','verifies'].includes(e.type)?'none':'arrow',symbolSize:[8,12]};
      });
      chart.setOption({series:[{data:computeLayout(nd,rawGraph.edges),edges:ed}]});
      await new Promise(r=>setTimeout(r,180));
    }
    // Show final path summary
    renderCombinedExposure(paths);
    switchTab('paths');
    // Start continuous flow pulse
    startFlowPulse(id);
  }catch(e){}
}
function toggleSelectEvent(id,e){
  stopFlowPulse();
  if(animTimer){clearInterval(animTimer);animTimer=null;animating=false;document.getElementById('btnAnimate').classList.remove('active');}
  if(e&&(e.ctrlKey||e.metaKey)){
    const idx=selectedEvents.indexOf(id);
    idx>=0?selectedEvents.splice(idx,1):selectedEvents.push(id);
  } else {
    selectedEvents.length===1&&selectedEvents[0]===id?selectedEvents=[]:selectedEvents=[id];
  }
  updateSelectedUI();
  if(selectedEvents.length===1){loadExposureForEvent(selectedEvents[0]);propagateOnce(selectedEvents[0]);loadDerive(selectedEvents[0]);loadScenario(selectedEvents[0]);}
  else if(selectedEvents.length>1)highlightMultiPaths();
  else resetGraphHighlight();
}
function updateSelectedUI(){
  document.querySelectorAll('.event-item').forEach(el=>el.classList.remove('active','active2'));
  selectedEvents.forEach((id,i)=>{const el=document.querySelector(`.event-item[data-id="${id}"]`);if(el)el.classList.add(i===0?'active':'active2');});
  document.getElementById('selCount').textContent=selectedEvents.length;
  const panel=document.getElementById('selectedPanel');
  if(!selectedEvents.length){panel.innerHTML='<div class="loading">Ctrl+点击选择多个事件</div>';return;}
  panel.innerHTML=selectedEvents.map((id,i)=>{
    const n=rawGraph.nodes.find(x=>x.id===id);
    const ev=eventList.find(x=>x.id===id);
    let meHtml='';
    if(ev&&ev.mutually_exclusive_with&&ev.mutually_exclusive_with.length){
      meHtml='<div style="font-size:9px;color:var(--orange);margin-top:2px;">⚠ 互斥: '+ev.mutually_exclusive_with.map(m=>m.label).join(', ')+'</div>';
    }
    return`<div class="path-card"><div class="pt" style="color:${i===0?'var(--cyan)':'var(--magenta)'}">${n?.label||id}</div><div class="pm">${n?.line?LINE_META[n.line]?.label||n.line:''} ${n?.subtype||''}</div>${meHtml}</div>`;
  }).join('');
  document.getElementById('eventSelect').value=selectedEvents.length===1?selectedEvents[0]:'';
}

async function highlightMultiPaths(){
  if(!selectedEvents.length)return;
  const allPaths=[];
  for(const id of selectedEvents){
    try{const p=await fetch(`/api/propagation/paths?event=${id}`).then(r=>r.json());allPaths.push(...p);}catch(e){}
  }
  const touchedNodes=new Set(selectedEvents),touchedEdges=new Set();
  allPaths.forEach(p=>{p.path.forEach(n=>touchedNodes.add(n));p.edges.forEach(e=>touchedEdges.add(`${e.from}->${e.to}`));});
  const nodeData=rawGraph.nodes.map(n=>{
    const hit=touchedNodes.has(n.id);
    return{...n,opacity:hit?1:0.08};
  });
  const edgeData=rawGraph.edges.map(e=>{
    const hit=touchedEdges.has(`${e.from}->${e.to}`);
    return{source:e.from,target:e.to,weight:e.weight||0.5,type:e.type||'propagates',direction:e.direction||'same',confidence:e.confidence||0.5,time_lag_hours:e.time_lag_hours||0,
      lineStyle:{...e.lineStyle,opacity:hit?0.9:0.03,width:hit?(e.lineStyle?.width||1)*1.8:(e.lineStyle?.width||1),shadowBlur:hit?12:0,shadowColor:hit?'rgba(0,248,255,0.35)':'transparent'},
      symbol:['feeds_back','verifies'].includes(e.type)?'none':'arrow',symbolSize:[8,12]};
  });
  chart.setOption({series:[{data:computeLayout(nodeData,rawGraph.edges),edges:edgeData}]});
  renderCombinedExposure(allPaths);
}

function renderCombinedExposure(paths){
  const panel=document.getElementById('exposurePanel');
  if(!paths.length){panel.innerHTML='<div class="loading">无传导路径</div>';return;}
  const targets={};
  paths.forEach(p=>{if(!targets[p.target])targets[p.target]={label:p.target_label||p.target,count:0,maxWeight:0};targets[p.target].count++;if(p.composite_weight>targets[p.target].maxWeight)targets[p.target].maxWeight=p.composite_weight;});
  let html=`<div style="font-size:10px;color:var(--text-dim);margin-bottom:4px;">共 ${paths.length} 条路径</div>`;
  for(const t of Object.values(targets))html+=`<div class="path-card"><div class="pt">${t.label}</div><div class="pm"><span>路径 ${t.count}</span><span>最大权重 ${t.maxWeight}</span></div></div>`;
  html+=`<div style="margin-top:6px;font-size:10px;font-weight:600;color:var(--text-dim);letter-spacing:1px;">路径详情 (Top 8)</div>`;
  paths.sort((a,b)=>b.composite_weight-a.composite_weight).slice(0,8).forEach((p,i)=>{
    const chain=p.path.map(id=>{const n=rawGraph.nodes.find(n=>n.id===id);return n?n.label||id:id;}).join(' → ');
    html+=`<div class="path-card"><div class="hl-path">#${i+1} → ${p.target_label||p.target}</div><div class="pm"><span>权重 ${p.composite_weight}</span><span>置信 ${p.composite_confidence}</span><span>滞后 ${p.total_lag_hours}h</span></div><div class="pc">${chain}</div></div>`;
  });
  panel.innerHTML=html;
  switchTab('paths');
}

async function loadExposureForEvent(id){
  try{
    const exposure=await fetch(`/api/propagation/exposure?event=${id}`).then(r=>r.json());
    const targets=exposure.targets||{};
    // Show mutual exclusivity warning
    if(exposure.mutually_exclusive_with&&exposure.mutually_exclusive_with.length){
      const meHtml=exposure.mutually_exclusive_with.map(m=>
        `<span style="color:var(--orange);font-size:10px;border:1px solid rgba(255,136,0,0.3);border-radius:3px;padding:1px 5px;margin:2px;display:inline-block;cursor:pointer;" onclick="toggleSelectEvent('${m.id}',event)">⚠ 与「${m.label}」互斥</span>`
      ).join('');
      document.getElementById('exposurePanel').innerHTML=`<div style="margin-bottom:6px;">${meHtml}</div>`;
    }
    if(Object.keys(targets).length&&marketData){
      let html='<div style="font-size:10px;color:var(--text-dim);margin-bottom:4px;">传导链相关资产</div>';
      Object.entries(targets).forEach(([tid,t])=>{
        const v=marketData[tid];
        if(!v||v.current==null)return;
        const dir=v.change_pct>0?'▲':'▼',cls=v.change_pct>0?'var(--green)':'var(--red)';
        html+=`<div class="exposure-row"><span class="er-label">${t.label||tid}</span><span><span class="er-val">${+(v.current.toFixed?.(2)||v.current)}</span><span style="color:${cls};font-weight:600;margin-left:6px;">${dir} ${Math.abs(v.change_pct).toFixed(1)}%</span></span></div>`;
      });
      document.getElementById('marketPanel').innerHTML=html;
    }
  }catch(e){}
}

// ===== Market (#3) =====
async function loadMarket(){
  try{const r=await fetch('/api/propagation/market');marketData=await r.json();if(!marketData||!Object.keys(marketData).length)throw new Error('empty');renderMarket();}catch(e){showToast('市场数据暂不可用,30秒后重试','info',2000);var panel=document.getElementById('marketPanel');if(panel)panel.innerHTML='<div class=\"loading\">⚠ 市场数据暂不可用</div>';}
}
function startMarketRefresh(){
  loadMarket();
  function tick(){mkTimer=setTimeout(function(){loadMarket().then(function(){tick();})['catch'](function(){tick();});},30000);}
  tick();
}
function renderMarket(){
  const panel=document.getElementById('marketPanel');
  if(!marketData||!Object.keys(marketData).length){panel.innerHTML='<div class="loading">暂无市场数据</div>';return;}
  const labels={btc_price:'BTC',usd_index:'DXY',oil_price:'原油',nasdaq:'纳斯达克',risk_appetite:'风险偏好(纳指)',real_yield:'实际利率(≈美债)',treasury_yield:'10Y美债收益率',china_fx:'人民币汇率'};
  let html='<div style="font-size:10px;color:var(--text-dim);margin-bottom:4px;">全量区间变化率</div>';
  Object.entries(marketData).forEach(([k,v])=>{
    if(v&&v.current!=null){
      const dir=v.change_pct>0?'▲':'▼',cls=v.change_pct>0?'var(--green)':'var(--red)';
      html+=`<div class="exposure-row"><span class="er-label">${labels[k]||k}</span><span><span class="er-val">${+(v.current.toFixed?.(2)||v.current)}</span><span style="color:${cls};font-weight:600;margin-left:6px;">${dir} ${Math.abs(v.change_pct).toFixed(1)}%</span></span></div>`;
    }
  });
  panel.innerHTML=html;
}

// ===== Dynamic Weights =====
function buildEdgeKey(e){return(e.from||e.source)+'->'+(e.to||e.target);}
function saveBaseEdgeWidths(){
  if(baseEdgeWidths)return;
  baseEdgeWidths={};
  rawGraph.edges.forEach(function(e){baseEdgeWidths[buildEdgeKey(e)]=Math.max(2.5,(e.weight||0.5)*6);});
}
function rebuildEdges(signalFilter){
  return rawGraph.edges.map(function(e){
    var k=buildEdgeKey(e);
    var dyn=dynamicWeightsEnabled&&dynamicWeightData?dynamicWeightData[k]:null;
    var baseW=baseEdgeWidths?baseEdgeWidths[k]:Math.max(2.5,(e.weight||0.5)*6);
    var w=dyn?Math.min(baseW*dyn.weight_mult,10):baseW;
    var op=dyn?Math.min(0.85*dyn.confidence_mult,1):0.85;
    var ec=dyn?'rgba(0,248,255,0.65)':EDGE_COLORS[e.type]||'rgba(0,248,255,0.3)';
    return{source:e.from,target:e.to,weight:e.weight||0.5,type:e.type||'propagates',
      direction:e.direction||'same',confidence:e.confidence||0.5,time_lag_hours:e.time_lag_hours||0,
      lineStyle:{color:ec,width:w,opacity:op,shadowBlur:dyn?12:8,shadowColor:dyn?'rgba(0,248,255,0.35)':'rgba(0,248,255,0.15)',curveness:e.type==='feeds_back'?0.3:e.type==='verifies'?0.2:0.1},
      symbol:['feeds_back','verifies'].includes(e.type)?'none':'arrow',symbolSize:[8,12]};
  });
}
async function toggleDynamicWeights(){
  var btn=document.getElementById('btnDynamicWeight');
  dynamicWeightsEnabled=!dynamicWeightsEnabled;
  btn.classList.toggle('active');
  if(dynamicWeightsEnabled){
    btn.innerHTML='&#9886;&#9887; 加载中...';
    try{
      saveBaseEdgeWidths();
      var r=await fetch('/api/propagation/dynamic-weights');
      var data=await r.json();
      dynamicWeightData=data.edges||{};
      dynamicSignalData=data.signals||{};
      var count=Object.keys(dynamicWeightData).length;
      showToast('动态权重已应用 ('+count+' 条边调整)','info',2000);
      btn.innerHTML='&#9886;&#9887; 动态权重';
      renderSignalPanel();
    }catch(e){dynamicWeightsEnabled=false;btn.classList.remove('active');btn.innerHTML='&#9886;&#9887; 动态权重';showToast('动态权重获取失败','error',2000);return;}
  } else {
    dynamicSignalData=null;activeSignal=null;
    btn.innerHTML='&#9886;&#9887; 动态权重';
    showToast('已恢复静态权重','info',1500);
    document.getElementById('signalPanel').innerHTML='<div class="loading">启用动态权重后查看</div>';
  }
  chart.setOption({series:[{edges:rebuildEdges()}]});
}
// ===== Signal Panel =====
const SIGNAL_META={vol_high:{label:'高波动',color:'#ff3355',icon:'&#9650;'},vol_low:{label:'低波动',color:'#00ff88',icon:'&#9660;'},dxy_extreme:{label:'美元极端',color:'#ff8800',icon:'&#9883;'},btc_momentum:{label:'BTC动量',color:'#ffbb00',icon:'&#9889;'},oil_shock:{label:'油价冲击',color:'#ff3355',icon:'&#128293;'},rate_vol:{label:'利率波动',color:'#ff00aa',icon:'&#65293;'},geopolitical:{label:'地缘风险',color:'#ff8800',icon:'&#9888;'},liq_stress:{label:'流动性压力',color:'#00f8ff',icon:'&#127919;'}};
function renderSignalPanel(){
  var panel=document.getElementById('signalPanel');
  if(!dynamicSignalData||!Object.keys(dynamicSignalData).length){panel.innerHTML='<div class="loading">无信号数据</div>';return;}
  var html='';
  Object.entries(dynamicSignalData).forEach(function(a){
    var s=a[0],d=a[1],meta=SIGNAL_META[s]||{label:s,color:'#8899bb',icon:'&#9679;'};
    var barW=Math.round((d.score||0)*100);
    var isActive=activeSignal===s;
    html+='<div class="signal-card'+(isActive?' signal-active':'')+'" data-signal="'+s+'" onclick="toggleSignalFilter(\''+s+'\')" style="'+(isActive?'border-color:'+meta.color+';background:rgba(255,255,255,0.05)':'')+'">';
    html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">';
    html+='<span style="font-size:11px;font-weight:600;"><span style="color:'+meta.color+';">'+meta.icon+'</span> '+meta.label+'</span>';
    var pct=(d.score*100).toFixed(0);
    html+='<span style="font-size:10px;"><b style="color:'+meta.color+';">'+pct+'%</b> <span style="color:var(--text-dim);">| '+d.edge_count+' 条边</span></span>';
    html+='</div>';
    html+='<div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;margin-bottom:3px;">';
    html+='<div style="height:100%;width:'+pct+'%;background:'+meta.color+';border-radius:2px;transition:width 0.3s;"></div></div>';
    html+='<div style="font-size:9px;color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+d.label+'</div>';
    if(isActive&&d.affected_edges){
      html+='<div style="margin-top:4px;font-size:9px;color:var(--text-dim);max-height:80px;overflow-y:auto;">';
      d.affected_edges.forEach(function(ek){
        var fromId=ek.split('->')[0],toId=ek.split('->')[1];
        var fn=rawGraph.nodes.find(function(n){return n.id===fromId;});
        var tn=rawGraph.nodes.find(function(n){return n.id===toId;});
        html+='<div style="padding:1px 4px;border-radius:2px;background:rgba(255,255,255,0.03);margin-bottom:1px;">'+(fn?fn.label:fromId)+' → '+(tn?tn.label:toId)+'</div>';
      });
      html+='</div>';
    }
    html+='</div>';
  });
  panel.innerHTML=html;
}
function toggleSignalFilter(signal){
  var switching=activeSignal&&activeSignal!==signal;
  if(activeSignal===signal){activeSignal=null;renderSignalPanel();}
  else if(switching){
    // Reset old highlight first, then apply new one after a pause
    var prevActive=activeSignal;
    activeSignal=null;
    renderSignalPanel();
    // Restore to normal
    var animOpts={animationDurationUpdate:300,animationEasing:'cubicOut'};
    chart.setOption({series:[{data:computeLayout(rawGraph.nodes,rawGraph.edges),edges:rebuildEdges(),...animOpts}]},true);
    // After reset completes, apply new highlight
    setTimeout(function(){
      activeSignal=signal;
      renderSignalPanel();
      applySignalHighlight();
    },140);
    return;
  } else {
    activeSignal=signal;
    renderSignalPanel();
  }
  applySignalHighlight();
}
function applySignalHighlight(){
  if(!dynamicWeightsEnabled||!activeSignal)return;
  // Compute affected node IDs from edges
  var affectedNodes=new Set();
  if(dynamicSignalData[activeSignal]?.affected_edges){
    dynamicSignalData[activeSignal].affected_edges.forEach(function(ek){
      var parts=ek.split('->');
      if(parts.length>=2){affectedNodes.add(parts[0]);affectedNodes.add(parts[1]);}
    });
  }
  var animOpts={animationDurationUpdate:400,animationEasing:'cubicOut'};
  var nodeData=rawGraph.nodes.map(function(n){
    var hit=affectedNodes.has(n.id);
    return{...n,opacity:hit?1:0.1};
  });
  var edgeData=rawGraph.edges.map(function(e){
    var k=buildEdgeKey(e),dyn=dynamicWeightData?dynamicWeightData[k]:null,baseW=baseEdgeWidths?baseEdgeWidths[k]:Math.max(2.5,(e.weight||0.5)*6);
    var w=dyn?Math.min(baseW*dyn.weight_mult,10):baseW;
    var op=dyn?Math.min(0.85*dyn.confidence_mult,1):0.85;
    var onSignal=dynamicSignalData[activeSignal]?.affected_edges?.includes(k);
    return{source:e.from,target:e.to,weight:e.weight||0.5,type:e.type||'propagates',direction:e.direction||'same',confidence:e.confidence||0.5,time_lag_hours:e.time_lag_hours||0,
      lineStyle:{color:onSignal?'#fff':(dyn?'rgba(0,248,255,0.65)':EDGE_COLORS[e.type]||'rgba(0,248,255,0.3)'),width:onSignal?Math.min(w*2,12):w,opacity:onSignal?1:0.06,shadowBlur:onSignal?18:(dyn?12:8),shadowColor:onSignal?'rgba(0,248,255,0.6)':(dyn?'rgba(0,248,255,0.35)':'rgba(0,248,255,0.15)'),curveness:e.type==='feeds_back'?0.3:e.type==='verifies'?0.2:0.1},
      symbol:['feeds_back','verifies'].includes(e.type)?'none':'arrow',symbolSize:[8,12]};
  });
  chart.setOption({series:[{data:computeLayout(nodeData,rawGraph.edges),edges:edgeData,...animOpts}]},true);
}
// ===== Market Verify Overlay =====
let marketVerifyActive = false;
let marketVerifyData = null;

async function toggleMarketVerify() {
  const btn = document.getElementById('btnMarketVerify');
  // Turn off heatmap if active
  if (heatmapActive && !marketVerifyActive) {
    heatmapActive = false; heatmapData = null;
    document.getElementById('btnHeatmap').classList.remove('active');
    document.getElementById('btnHeatmap').innerHTML = '&#127777; 热力';
  }
  marketVerifyActive = !marketVerifyActive;
  btn.classList.toggle('active');
  if (marketVerifyActive) {
    btn.innerHTML = '&#128200; 验证中...';
    try {
      const evId = selectedEvents.length === 1 ? selectedEvents[0] : '';
      const r = await fetch('/api/propagation/verify-market?event=' + (evId ? encodeURIComponent(evId) : ''));
      marketVerifyData = await r.json();
      const ok = marketVerifyData.verified_count || 0;
      const total = marketVerifyData.total_verifiable || 0;
      showToast('验证: ' + marketVerifyData.overall + ' (' + ok + '/' + total + ' 边符合)',
        marketVerifyData.overall === 'verified' ? 'success' : marketVerifyData.overall === 'partial' ? 'info' : 'error', 3000);
      btn.innerHTML = '&#128200; 验证';
      applyMarketVerify();
    } catch (e) {
      marketVerifyActive = false;
      btn.classList.remove('active');
      btn.innerHTML = '&#128200; 验证';
      showToast('验证失败', 'error', 2000);
    }
  } else {
    marketVerifyData = null;
    btn.innerHTML = '&#128200; 验证';
    clearMarketVerify();
  }
}

function applyMarketVerify() {
  if (!marketVerifyData || !marketVerifyData.edges) return;
  const statusColors = { verified: '#00ff88', broken: '#ff3355', partial: '#ffbb00', unverifiable: '#8899bb' };
  const edgeStatusMap = {};
  marketVerifyData.edges.forEach(function (e) {
    edgeStatusMap[e.from + '->' + e.to] = e.status;
  });
  const ed = rawGraph.edges.map(function (e) {
    const k = e.from + '->' + e.to;
    const st = edgeStatusMap[k];
    const c = st ? statusColors[st] || 'rgba(0,248,255,0.3)' : EDGE_COLORS[e.type] || 'rgba(0,248,255,0.3)';
    const w = st === 'verified' ? Math.max(4, (e.weight || 0.5) * 7) : Math.max(2, (e.weight || 0.5) * 4);
    const op = st === 'unverifiable' ? 0.2 : 0.9;
    return {
      source: e.from, target: e.to, weight: e.weight || 0.5, type: e.type || 'propagates',
      direction: e.direction || 'same', confidence: e.confidence || 0.5, time_lag_hours: e.time_lag_hours || 0,
      lineStyle: {
        color: c, width: w, opacity: op,
        shadowBlur: st === 'verified' ? 14 : st === 'broken' ? 10 : 4,
        shadowColor: st === 'verified' ? 'rgba(0,255,136,0.4)' : st === 'broken' ? 'rgba(255,51,85,0.4)' : 'transparent',
        curveness: e.type === 'feeds_back' ? 0.3 : e.type === 'verifies' ? 0.2 : 0.1
      },
      symbol: ['feeds_back', 'verifies'].includes(e.type) ? 'none' : 'arrow', symbolSize: [8, 12]
    };
  });
  chart.setOption({ series: [{ edges: ed }] });
}

function clearMarketVerify() {
  chart.setOption({ series: [{ edges: rebuildEdges() }] });
}

// ===== Narrative Overlay =====
let narrativeActive = false;
let narrativeData = null;

async function toggleNarrative() {
  const btn = document.getElementById('btnNarrative');
  if (heatmapActive && !narrativeActive) {
    heatmapActive = false; heatmapData = null;
    document.getElementById('btnHeatmap').classList.remove('active');
    document.getElementById('btnHeatmap').innerHTML = '&#127777; 热力';
  }
  if (marketVerifyActive && !narrativeActive) {
    marketVerifyActive = false; marketVerifyData = null;
    document.getElementById('btnMarketVerify').classList.remove('active');
    document.getElementById('btnMarketVerify').innerHTML = '&#128200; 验证';
  }
  narrativeActive = !narrativeActive;
  btn.classList.toggle('active');
  if (narrativeActive) {
    btn.innerHTML = '&#128240; 加载中...';
    try {
      const r = await fetch('/api/propagation/narrative-overlay');
      narrativeData = await r.json();
      const s = narrativeData.summary || {};
      showToast('叙事: 活跃线 ' + s.total_active + ' 最高 ' + (s.highest_score * 100).toFixed(0) + '%',
        'info', 2500);
      btn.innerHTML = '&#128240; 叙事';
      applyNarrativeOverlay();
    } catch (e) {
      narrativeActive = false;
      btn.classList.remove('active');
      btn.innerHTML = '&#128240; 叙事';
      showToast('叙事数据加载失败', 'error', 2000);
    }
  } else {
    narrativeData = null;
    btn.innerHTML = '&#128240; 叙事';
    clearNarrativeOverlay();
  }
}

function applyNarrativeOverlay() {
  if (!narrativeData || !narrativeData.edges) return;
  const edgeData = narrativeData.edges;
  const dominantColors = { positive: '#00ff88', negative: '#ff3355', neutral: '#8899bb' };
  const ed = rawGraph.edges.map(function (e) {
    const k = e.from + '->' + e.to;
    const nd = edgeData[k];
    const score = nd ? nd.score : 0.3;
    const dom = nd ? nd.dominant : 'neutral';
    const c = dominantColors[dom] || '#8899bb';
    const w = Math.max(3, score * 8);
    return {
      source: e.from, target: e.to, weight: e.weight || 0.5, type: e.type || 'propagates',
      direction: e.direction || 'same', confidence: e.confidence || 0.5, time_lag_hours: e.time_lag_hours || 0,
      lineStyle: {
        color: c, width: w, opacity: Math.max(0.4, score),
        shadowBlur: score > 0.5 ? 12 : 4,
        shadowColor: score > 0.5 ? c + '66' : 'transparent',
        curveness: e.type === 'feeds_back' ? 0.3 : e.type === 'verifies' ? 0.2 : 0.1
      },
      symbol: ['feeds_back', 'verifies'].includes(e.type) ? 'none' : 'arrow', symbolSize: [8, 12]
    };
  });
  chart.setOption({ series: [{ edges: ed }] });

  // Show narrative legend
  const legendEl = document.getElementById('legendBar');
  let html = '<span class="legend-item"><span class="legend-dot" style="background:#00ff88"></span>正面叙事</span>' +
    '<span class="legend-item"><span class="legend-dot" style="background:#ff3355"></span>负面叙事</span>' +
    '<span class="legend-item"><span class="legend-dot" style="background:#8899bb"></span>中性</span>' +
    '<span style="flex:1"></span>';

  // Show active narratives
  if (narrativeData.narratives && narrativeData.narratives.length) {
    narrativeData.narratives.forEach(function (n) {
      const nc = n.score > 0.5 ? '#ffbb00' : 'var(--text-dim)';
      html += '<span style="font-size:10px;color:' + nc + ';margin-left:8px;">' + n.label + ' ' + (n.score * 100).toFixed(0) + '%</span>';
    });
  }
  legendEl.innerHTML = html;
}

function clearNarrativeOverlay() {
  renderLegendBar();
  chart.setOption({ series: [{ edges: rebuildEdges() }] });
}

// ===== Onchain Overlay =====
let onchainActive = false;
let onchainData = null;

async function toggleOnchain() {
  const btn = document.getElementById('btnOnchain');
  // Turn off other overlays
  if (heatmapActive && !onchainActive) { heatmapActive = false; heatmapData = null; document.getElementById('btnHeatmap').classList.remove('active'); document.getElementById('btnHeatmap').innerHTML = '&#127777; 热力'; }
  if (marketVerifyActive && !onchainActive) { marketVerifyActive = false; marketVerifyData = null; document.getElementById('btnMarketVerify').classList.remove('active'); document.getElementById('btnMarketVerify').innerHTML = '&#128200; 验证'; }
  if (narrativeActive && !onchainActive) { narrativeActive = false; narrativeData = null; document.getElementById('btnNarrative').classList.remove('active'); document.getElementById('btnNarrative').innerHTML = '&#128240; 叙事'; }
  onchainActive = !onchainActive;
  btn.classList.toggle('active');
  if (onchainActive) {
    btn.innerHTML = '&#9881; 加载中...';
    try {
      const r = await fetch('/api/propagation/onchain-overlay');
      onchainData = await r.json();
      btn.innerHTML = '&#9881; 链上';
      if (!onchainData.active) {
        showToast('暂无链上大额转账数据', 'info', 2000);
        onchainActive = false; btn.classList.remove('active');
        return;
      }
      const s = onchainData.summary || {};
      showToast('链上: ' + s.total_transfers + ' 笔转账 BTC:' + s.total_btc + ' ETH:' + s.total_eth, 'info', 2500);
      applyOnchainOverlay();
    } catch (e) {
      onchainActive = false; btn.classList.remove('active'); btn.innerHTML = '&#9881; 链上';
      showToast('链上数据加载失败', 'error', 2000);
    }
  } else {
    onchainData = null; btn.innerHTML = '&#9881; 链上';
    clearOnchainOverlay();
  }
}

function applyOnchainOverlay() {
  if (!onchainData || !onchainData.edges) return;
  const scores = onchainData.edges;
  const ed = rawGraph.edges.map(function (e) {
    const k = e.from + '->' + e.to;
    const sc = scores[k] || 0;
    const isActive = sc > 0;
    return {
      source: e.from, target: e.to, weight: e.weight || 0.5, type: e.type || 'propagates',
      direction: e.direction || 'same', confidence: e.confidence || 0.5, time_lag_hours: e.time_lag_hours || 0,
      lineStyle: {
        color: isActive ? '#ff00aa' : 'rgba(0,248,255,0.2)', width: isActive ? Math.max(3, sc * 8) : 1,
        opacity: isActive ? 0.9 : 0.1, shadowBlur: isActive ? 14 : 0,
        shadowColor: isActive ? 'rgba(255,0,170,0.5)' : 'transparent',
        curveness: e.type === 'feeds_back' ? 0.3 : e.type === 'verifies' ? 0.2 : 0.1
      },
      symbol: ['feeds_back', 'verifies'].includes(e.type) ? 'none' : 'arrow', symbolSize: [8, 12]
    };
  });
  chart.setOption({ series: [{ edges: ed }] });

  // Panel showing transfer details
  const panel = document.getElementById('legendBar');
  let html = '<span class="legend-item"><span class="legend-dot" style="background:#ff00aa"></span>链上活跃</span>' +
    '<span class="legend-item"><span class="legend-dot" style="background:rgba(0,248,255,0.2)"></span>正常</span>' +
    '<span style="flex:1"></span>';
  if (onchainData.transfers && onchainData.transfers.length) {
    onchainData.transfers.slice(0, 3).forEach(function (t) {
      html += '<span style="font-size:9px;color:var(--magenta);margin-left:6px;">' + t.symbol + ' ' + t.amount.toFixed(1) + '</span>';
    });
  }
  panel.innerHTML = html;
}

function clearOnchainOverlay() {
  renderLegendBar();
  chart.setOption({ series: [{ edges: rebuildEdges() }] });
}

// ===== Calendar Overlay =====
let calendarActive = false;
let calendarData = null;

async function toggleCalendar() {
  const btn = document.getElementById('btnCalendar');
  // Turn off other overlays
  if (heatmapActive && !calendarActive) { heatmapActive = false; heatmapData = null; document.getElementById('btnHeatmap').classList.remove('active'); document.getElementById('btnHeatmap').innerHTML = '&#127777; 热力'; }
  if (marketVerifyActive && !calendarActive) { marketVerifyActive = false; marketVerifyData = null; document.getElementById('btnMarketVerify').classList.remove('active'); document.getElementById('btnMarketVerify').innerHTML = '&#128200; 验证'; }
  if (narrativeActive && !calendarActive) { narrativeActive = false; narrativeData = null; document.getElementById('btnNarrative').classList.remove('active'); document.getElementById('btnNarrative').innerHTML = '&#128240; 叙事'; }
  if (onchainActive && !calendarActive) { onchainActive = false; onchainData = null; document.getElementById('btnOnchain').classList.remove('active'); document.getElementById('btnOnchain').innerHTML = '&#9881; 链上'; }
  calendarActive = !calendarActive;
  btn.classList.toggle('active');
  if (calendarActive) {
    btn.innerHTML = '&#128197; 加载中...';
    try {
      const r = await fetch('/api/propagation/calendar-overlay');
      calendarData = await r.json();
      btn.innerHTML = '&#128197; 日历';
      const s = calendarData.summary || {};
      if (!s.total_upcoming) {
        showToast('未来14天无重大经济事件', 'info', 2000);
        calendarActive = false; btn.classList.remove('active');
        return;
      }
      showToast('日历: 未来 ' + s.total_upcoming + ' 个事件,最近 ' + (s.nearest_days === 0 ? '今天' : s.nearest_days + '天后'), 'info', 2500);
      applyCalendarOverlay();
    } catch (e) {
      calendarActive = false; btn.classList.remove('active'); btn.innerHTML = '&#128197; 日历';
      showToast('日历数据加载失败', 'error', 2000);
    }
  } else {
    calendarData = null; btn.innerHTML = '&#128197; 日历';
    clearCalendarOverlay();
  }
}

function applyCalendarOverlay() {
  if (!calendarData || !calendarData.affected_edges) return;
  const ae = calendarData.affected_edges;
  const urgencyColors = { today: '#ff3355', soon: '#ffbb00', upcoming: '#00f8ff' };
  const ed = rawGraph.edges.map(function (e) {
    const k = e.from + '->' + e.to;
    const info = ae[k];
    const hasEvent = !!info;
    const c = hasEvent ? (urgencyColors[info.urgency] || '#00f8ff') : 'rgba(0,248,255,0.15)';
    const w = hasEvent ? Math.max(3, info.intensity * 8) : 1;
    return {
      source: e.from, target: e.to, weight: e.weight || 0.5, type: e.type || 'propagates',
      direction: e.direction || 'same', confidence: e.confidence || 0.5, time_lag_hours: e.time_lag_hours || 0,
      lineStyle: {
        color: c, width: w, opacity: hasEvent ? 0.9 : 0.08,
        shadowBlur: hasEvent ? 12 : 0, shadowColor: hasEvent ? c + '66' : 'transparent',
        curveness: e.type === 'feeds_back' ? 0.3 : e.type === 'verifies' ? 0.2 : 0.1
      },
      symbol: ['feeds_back', 'verifies'].includes(e.type) ? 'none' : 'arrow', symbolSize: [8, 12]
    };
  });
  chart.setOption({ series: [{ edges: ed }] });

  // Show upcoming events in legend area
  const panel = document.getElementById('legendBar');
  let html = '<span class="legend-item"><span class="legend-dot" style="background:#ff3355"></span>今天</span>' +
    '<span class="legend-item"><span class="legend-dot" style="background:#ffbb00"></span>3天内</span>' +
    '<span class="legend-item"><span class="legend-dot" style="background:#00f8ff"></span>14天内</span>' +
    '<span style="flex:1"></span>';
  if (calendarData.upcoming && calendarData.upcoming.length) {
    calendarData.upcoming.slice(0, 4).forEach(function (ev) {
      const ec = ev.urgency === 'today' ? '#ff3355' : ev.urgency === 'soon' ? '#ffbb00' : 'var(--text-dim)';
      html += '<span style="font-size:9px;color:' + ec + ';margin-left:6px;white-space:nowrap;">' +
        (ev.days_until === 0 ? '🔴' : '') + ev.name + ' ' + ev.date +
        '</span>';
    });
  }
  panel.innerHTML = html;
}

function clearCalendarOverlay() {
  renderLegendBar();
  chart.setOption({ series: [{ edges: rebuildEdges() }] });
}

// ===== Event Decay =====
let decayActive = false;
let decayData = null;

async function toggleDecay() {
  const btn = document.getElementById('btnDecay');
  decayActive = !decayActive;
  btn.classList.toggle('active');
  if (decayActive) {
    btn.innerHTML = '&#9200; 加载中...';
    try {
      const r = await fetch('/api/propagation/event-decay');
      decayData = await r.json();
      btn.innerHTML = '&#9200; 衰减';
      const s = decayData.summary || {};
      showToast('衰减: 平均 ' + (s.avg_decay * 100).toFixed(0) + '% 最老 ' + s.oldest_event_days + '天', 'info', 2500);
      applyDecay();
    } catch (e) {
      decayActive = false; btn.classList.remove('active'); btn.innerHTML = '&#9200; 衰减';
      showToast('衰减数据加载失败', 'error', 2000);
    }
  } else {
    decayData = null; btn.innerHTML = '&#9200; 衰减';
    clearDecay();
  }
}

function applyDecay() {
  if (!decayData || !decayData.edges) return;
  const de = decayData.edges;
  const ed = rawGraph.edges.map(function (e) {
    const k = e.from + '->' + e.to;
    const info = de[k];
    const df = info ? info.decay_factor : 1.0;
    const c = df >= 0.8 ? '#00ff88' : df >= 0.5 ? '#ffbb00' : '#ff3355';
    return {
      source: e.from, target: e.to, weight: info ? info.decayed_weight : e.weight,
      type: e.type || 'propagates', direction: e.direction || 'same',
      confidence: e.confidence || 0.5, time_lag_hours: e.time_lag_hours || 0,
      lineStyle: {
        color: c, width: Math.max(2, df * 6), opacity: Math.max(0.3, df),
        shadowBlur: df > 0.7 ? 8 : 2, shadowColor: df > 0.7 ? c + '44' : 'transparent',
        curveness: e.type === 'feeds_back' ? 0.3 : e.type === 'verifies' ? 0.2 : 0.1
      },
      symbol: ['feeds_back', 'verifies'].includes(e.type) ? 'none' : 'arrow', symbolSize: [8, 12]
    };
  });
  chart.setOption({ series: [{ edges: ed }] });

  const panel = document.getElementById('legendBar');
  panel.innerHTML = '<span class="legend-item"><span class="legend-dot" style="background:#00ff88"></span>新事件 ≥0.8</span>' +
    '<span class="legend-item"><span class="legend-dot" style="background:#ffbb00"></span>中 0.5-0.8</span>' +
    '<span class="legend-item"><span class="legend-dot" style="background:#ff3355"></span>旧 &lt;0.5</span>' +
    '<span style="flex:1"></span>' +
    '<span style="font-size:9px;color:var(--text-dim);">平均衰减 ' + ((decayData.summary.avg_decay || 0) * 100).toFixed(0) + '% | 最老 ' + (decayData.summary.oldest_event_days || 0) + '天</span>';
}

function clearDecay() {
  renderLegendBar();
  chart.setOption({ series: [{ edges: rebuildEdges() }] });
}

// ===== Arbitrage Signals =====
let arbitrageActive = false;
let arbitrageData = null;

async function toggleArbitrage() {
  const btn = document.getElementById('btnArbitrage');
  arbitrageActive = !arbitrageActive;
  btn.classList.toggle('active');
  if (arbitrageActive) {
    btn.innerHTML = '&#8644; 加载中...';
    try {
      const r = await fetch('/api/propagation/arbitrage-signals');
      arbitrageData = await r.json();
      btn.innerHTML = '&#8644; 套利';
      const s = arbitrageData.summary || {};
      showToast('套利: ' + s.total_pairs + ' 对偏离, ' + s.strong_signals + ' 强信号', 'info', 2500);
      applyArbitrage();
    } catch (e) {
      arbitrageActive = false; btn.classList.remove('active'); btn.innerHTML = '&#8644; 套利';
      showToast('套利信号加载失败', 'error', 2000);
    }
  } else {
    arbitrageData = null; btn.innerHTML = '&#8644; 套利';
    clearArbitrage();
  }
}

function applyArbitrage() {
  if (!arbitrageData || !arbitrageData.signals) return;
  // Highlight edges that connect diverged pairs
  const em = arbitrageData.edges || {};
  const signals = arbitrageData.signals || [];
  const ed = rawGraph.edges.map(function (e) {
    const k = e.from + '->' + e.to;
    const sig = em[k] || 0;
    const isArb = sig > 0.3;
    const c = isArb ? '#ff00aa' : 'rgba(0,248,255,0.12)';
    return {
      source: e.from, target: e.to, weight: e.weight || 0.5, type: e.type || 'propagates',
      direction: e.direction || 'same', confidence: e.confidence || 0.5, time_lag_hours: e.time_lag_hours || 0,
      lineStyle: {
        color: c, width: isArb ? Math.max(2, sig * 6) : 1, opacity: isArb ? 0.9 : 0.06,
        shadowBlur: isArb ? 10 : 0, shadowColor: isArb ? c + '55' : 'transparent',
        curveness: e.type === 'feeds_back' ? 0.3 : e.type === 'verifies' ? 0.2 : 0.1
      },
      symbol: ['feeds_back', 'verifies'].includes(e.type) ? 'none' : 'arrow', symbolSize: [8, 12]
    };
  });
  chart.setOption({ series: [{ edges: ed }] });

  // Show top signals
  const panel = document.getElementById('legendBar');
  let html = '<span class="legend-item"><span class="legend-dot" style="background:#ff00aa"></span>套利偏离</span>' +
    '<span style="flex:1"></span>';
  signals.slice(0, 5).forEach(function (s) {
    const dc = s.direction === 'convergence' ? 'var(--green)' : 'var(--yellow)';
    html += '<span style="font-size:9px;color:' + dc + ';margin-left:6px;">' + s.pair + ' r=' + s.correlation + '</span>';
  });
  panel.innerHTML = html;
}

function clearArbitrage() {
  renderLegendBar();
  chart.setOption({ series: [{ edges: rebuildEdges() }] });
}

// ===== Confidence Heatmap =====
let heatmapActive = false;
let heatmapData = null;

async function toggleHeatmap() {
  const btn = document.getElementById('btnHeatmap');
  // Turn off market verify if active
  if (marketVerifyActive && !heatmapActive) {
    marketVerifyActive = false; marketVerifyData = null;
    document.getElementById('btnMarketVerify').classList.remove('active');
    document.getElementById('btnMarketVerify').innerHTML = '&#128200; 验证';
  }
  heatmapActive = !heatmapActive;
  btn.classList.toggle('active');
  if (heatmapActive) {
    btn.innerHTML = '&#127777; 加载中...';
    try {
      const evId = selectedEvents.length === 1 ? selectedEvents[0] : '';
      const r = await fetch('/api/propagation/confidence-heatmap' + (evId ? '?event=' + encodeURIComponent(evId) : ''));
      heatmapData = await r.json();
      const s = heatmapData.summary || {};
      showToast('热力: 高' + s.high_count + ' 中' + s.medium_count + ' 低' + s.low_count + ' (' + s.total + ' 条边)',
        'info', 2500);
      btn.innerHTML = '&#127777; 热力';
      applyHeatmap();
    } catch (e) {
      heatmapActive = false;
      btn.classList.remove('active');
      btn.innerHTML = '&#127777; 热力';
      showToast('热力图加载失败', 'error', 2000);
    }
  } else {
    heatmapData = null;
    btn.innerHTML = '&#127777; 热力';
    clearHeatmap();
  }
}

function applyHeatmap() {
  if (!heatmapData || !heatmapData.edges) return;
  const gradeColors = { high: '#00ff88', medium: '#ffbb00', low: '#ff3355' };
  const heatMap = {};
  heatmapData.edges.forEach(function (e) {
    heatMap[e.from + '->' + e.to] = { score: e.heat_score, grade: e.color_grade };
  });
  const ed = rawGraph.edges.map(function (e) {
    const k = e.from + '->' + e.to;
    const h = heatMap[k];
    const grade = h ? h.grade : 'medium';
    const score = h ? h.score : 0.5;
    const c = gradeColors[grade] || 'rgba(0,248,255,0.3)';
    const w = Math.max(3, score * 7);
    const op = Math.max(0.3, score);
    return {
      source: e.from, target: e.to, weight: e.weight || 0.5, type: e.type || 'propagates',
      direction: e.direction || 'same', confidence: e.confidence || 0.5, time_lag_hours: e.time_lag_hours || 0,
      lineStyle: {
        color: c, width: w, opacity: op,
        shadowBlur: 10, shadowColor: c + '66',
        curveness: e.type === 'feeds_back' ? 0.3 : e.type === 'verifies' ? 0.2 : 0.1
      },
      symbol: ['feeds_back', 'verifies'].includes(e.type) ? 'none' : 'arrow', symbolSize: [8, 12]
    };
  });
  chart.setOption({ series: [{ edges: ed }] });

  // Show gradient legend in legend bar
  const legendEl = document.getElementById('legendBar');
  legendEl.innerHTML = '<span class="legend-item"><span class="legend-dot" style="background:#00ff88"></span>高置信 ≥0.7</span>' +
    '<span class="legend-item"><span class="legend-dot" style="background:#ffbb00"></span>中置信 0.4-0.7</span>' +
    '<span class="legend-item"><span class="legend-dot" style="background:#ff3355"></span>低置信 &lt;0.4</span>' +
    '<span style="flex:1"></span>' +
    '<span style="font-size:10px;color:var(--text-dim);">评分 = 置信×0.7 + 验证×0.3</span>';
}

function clearHeatmap() {
  renderLegendBar();
  chart.setOption({ series: [{ edges: rebuildEdges() }] });
}

function renderLegendBar() {
  document.getElementById('legendBar').innerHTML =
    Object.entries(TYPE_LABELS).map(function (a) { return '<span class="legend-item"><span class="legend-dot" style="background:' + TYPE_COLORS[a[0]] + '"></span>' + a[1] + '</span>'; }).join('') +
    '<span style="flex:1"></span>' +
    Object.entries(EDGE_COLORS).map(function (a) { return '<span class="legend-item"><span class="legend-dot" style="background:' + a[1] + '"></span>' + a[0] + '</span>'; }).join('');
}

// ===== Scenario Simulation =====
let scenarioAdjustments = {};

function loadScenario(eventId) {
  const n = rawGraph.nodes.find(function (x) { return x.id === eventId; });
  if (!n) return;
  document.getElementById('scenarioEventLabel').textContent = n.label || eventId;
  document.getElementById('scenarioIdle').style.display = 'none';
  document.getElementById('scenarioControls').style.display = 'block';
  document.getElementById('scenarioResult').style.display = 'none';
  document.getElementById('scenarioEdgeSliders').innerHTML = '<div class="loading">加载传导边...</div>';
  scenarioAdjustments = {};

  fetch('/api/propagation/paths?event=' + encodeURIComponent(eventId)).then(function (r) { return r.json(); }).then(function (paths) {
    if (!paths.length) {
      document.getElementById('scenarioEdgeSliders').innerHTML = '<div class="loading">该事件没有传导路径</div>';
      return;
    }
    const seen = new Set();
    const edges = [];
    paths.forEach(function (p) {
      p.edges.forEach(function (e) {
        const k = e.from + '->' + e.to;
        if (!seen.has(k)) { seen.add(k); edges.push(e); }
      });
    });
    if (!edges.length) {
      document.getElementById('scenarioEdgeSliders').innerHTML = '<div class="loading">无可用传导边</div>';
      return;
    }
    let html = '<div style="font-size:10px;color:var(--text-dim);margin-bottom:4px;">拖动滑块调整传导强度 (×倍数)</div>';
    edges.slice(0, 12).forEach(function (e) {
      const k = e.from + '->' + e.to;
      const fn = rawGraph.nodes.find(function (x) { return x.id === e.from; });
      const tn = rawGraph.nodes.find(function (x) { return x.id === e.to; });
      const fromLabel = fn ? fn.label || e.from : e.from;
      const toLabel = tn ? tn.label || e.to : e.to;
      const dirSym = DIR_SYMBOLS[e.direction] || '→';
      const dirColor = DIR_COLORS[e.direction] || 'var(--text-dim)';
      html += '<div style="margin:6px 0;padding:6px 8px;border-radius:5px;border:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.15);">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">';
      html += '<span style="font-size:11px;font-weight:500;color:#fff;">' + fromLabel + ' <span style="color:' + dirColor + ';">' + dirSym + '</span> ' + toLabel + '</span>';
      html += '<span style="font-size:10px;color:var(--text-dim);">' + e.weight + 'w</span></div>';
      html += '<div style="display:flex;align-items:center;gap:6px;">';
      html += '<span style="font-size:10px;color:var(--text-dim);min-width:16px;">0.2×</span>';
      html += '<input type="range" min="0.2" max="2.0" step="0.1" value="1.0" data-edgekey="' + k + '" data-original="' + e.weight + '" style="flex:1;" oninput="onScenarioSlider(this)">';
      html += '<span style="font-size:10px;color:var(--text-dim);min-width:16px;">2.0×</span>';
      html += '<span class="scenario-val" style="font-size:11px;min-width:30px;text-align:right;color:var(--cyan);font-weight:600;">1.0×</span>';
      html += '</div></div>';
    });
    if (edges.length > 12) {
      html += '<div style="font-size:9px;color:var(--text-dim);text-align:center;">仅显示前12条边，完整传导包含 ' + edges.length + ' 条边</div>';
    }
    document.getElementById('scenarioEdgeSliders').innerHTML = html;
  })['catch'](function () {
    document.getElementById('scenarioEdgeSliders').innerHTML = '<div class="loading">加载失败</div>';
  });
}

function onScenarioSlider(el) {
  const val = parseFloat(el.value);
  const valEl = el.parentElement.querySelector('.scenario-val');
  if (valEl) valEl.textContent = val.toFixed(1) + '×';
  const k = el.dataset.edgekey;
  if (val === 1.0) {
    delete scenarioAdjustments[k];
  } else {
    scenarioAdjustments[k] = { weight_mult: val };
  }
}

async function runSimulation() {
  const eventId = selectedEvents[0];
  if (!eventId) { showToast('请先选择一个事件', 'info', 2000); return; }
  const panel = document.getElementById('scenarioResult');
  panel.style.display = 'block';
  panel.innerHTML = '<div class="loading">推演中...</div>';

  try {
    const r = await fetch('/api/propagation/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: eventId, adjustments: scenarioAdjustments })
    });
    const d = await r.json();
    if (d.error) { panel.innerHTML = '<div class="loading">⚠ ' + d.error + '</div>'; return; }
    renderScenarioResult(d);
  } catch (e) {
    panel.innerHTML = '<div class="loading">⚠ 推演失败: ' + e.message + '</div>';
  }
}

function renderScenarioResult(d) {
  const panel = document.getElementById('scenarioResult');
  let html = '<div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;">';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
  html += '<div style="font-size:13px;font-weight:600;color:#fff;">推演结果</div>';
  html += '<div style="font-size:10px;color:var(--text-dim);">' + d.event_label + '</div>';
  html += '</div>';

  // Aggregate comparison
  const bAgg = d.baseline.aggregate || {};
  const sAgg = d.simulated.aggregate || {};
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">';
  html += '<div class="path-card" style="text-align:center;padding:8px;"><div style="font-size:9px;color:var(--text-dim);">基线路径</div><div style="font-size:18px;font-weight:700;color:var(--cyan);">' + d.baseline.paths_count + '</div></div>';
  html += '<div class="path-card" style="text-align:center;padding:8px;"><div style="font-size:9px;color:var(--text-dim);">推演路径</div><div style="font-size:18px;font-weight:700;color:' + (d.simulated.paths_count !== d.baseline.paths_count ? 'var(--magenta)' : 'var(--green)') + ';">' + d.simulated.paths_count + '</div></div>';
  html += '<div class="path-card" style="text-align:center;padding:8px;"><div style="font-size:9px;color:var(--text-dim);">受影响资产</div><div style="font-size:18px;font-weight:700;color:var(--yellow);">' + sAgg.affected_targets + '</div></div>';
  html += '</div>';

  // Delta per target
  if (d.delta && Object.keys(d.delta).length) {
    html += '<div style="font-size:10px;color:var(--text-dim);margin-bottom:4px;">&#9889; 传导变化:</div>';
    Object.entries(d.delta).forEach(function (a) {
      const tid = a[0], chg = a[1];
      const wd = chg.weight_delta;
      const pd = chg.paths_delta;
      html += '<div class="path-card" style="padding:6px 8px;margin-bottom:3px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
      html += '<span style="font-size:12px;font-weight:600;color:#fff;">' + chg.label + '</span>';
      html += '<span style="font-size:11px;">';
      if (wd != null) {
        const wc = wd > 0 ? 'var(--green)' : 'var(--red)';
        html += '<span style="color:' + wc + ';font-weight:600;">' + (wd > 0 ? '+' : '') + wd + 'w</span> ';
      }
      if (pd != null) {
        const pc = pd > 0 ? 'var(--green)' : 'var(--red)';
        html += '<span style="color:' + pc + ';font-weight:600;">' + (pd > 0 ? '+' : '') + pd + '条</span>';
      }
      html += '</span></div></div>';
    });
  } else {
    html += '<div style="font-size:11px;color:var(--text-dim);text-align:center;padding:8px;">当前调整未改变传导结果</div>';
  }

  // Simulated paths top 3
  if (d.simulated_paths && d.simulated_paths.length) {
    html += '<div style="font-size:10px;color:var(--text-dim);margin:6px 0 4px;">&#128270; 推演路径 (Top 3):</div>';
    d.simulated_paths.slice(0, 3).forEach(function (p, i) {
      const chain = p.path.map(function (id) {
        const n = rawGraph.nodes.find(function (x) { return x.id === id; });
        return n ? n.label || id : id;
      }).join(' → ');
      html += '<div class="path-card" style="padding:5px 8px;margin-bottom:2px;">';
      html += '<div style="font-size:10px;color:var(--cyan);">#' + (i + 1) + ' → ' + p.target_label + '</div>';
      html += '<div style="font-size:9px;color:var(--text-dim);">' + chain + '</div>';
      html += '</div>';
    });
  }

  html += '</div>';
  panel.innerHTML = html;
}

function resetSimulation() {
  scenarioAdjustments = {};
  document.querySelectorAll('#scenarioEdgeSliders input[type=range]').forEach(function (el) {
    el.value = '1.0';
    const valEl = el.parentElement.querySelector('.scenario-val');
    if (valEl) valEl.textContent = '1.0×';
  });
  document.getElementById('scenarioResult').style.display = 'none';
  showToast('已重置所有参数', 'info', 1500);
}

// ===== Reverse Trace (逆向归因) =====
function populateTraceTargets() {
  const sel = document.getElementById('traceTargetSelect');
  if (!sel) return;
  const targets = rawGraph.nodes.filter(function (n) { return n.type === 'target'; });
  targets.forEach(function (n) {
    const opt = document.createElement('option');
    opt.value = n.id;
    opt.textContent = n.label || n.id;
    sel.appendChild(opt);
  });
}

async function loadReverseTrace(targetId) {
  const panel = document.getElementById('traceResult');
  if (!targetId) { panel.innerHTML = '<div class="loading">选择目标资产查看归因分析</div>'; return; }
  panel.innerHTML = '<div class="loading">归因分析中...</div>';
  try {
    const r = await fetch('/api/propagation/reverse-trace?target=' + encodeURIComponent(targetId));
    const d = await r.json();
    if (d.error || !Array.isArray(d)) { panel.innerHTML = '<div class="loading">' + (d.error || '无归因结果') + '</div>'; return; }
    if (!d.length) { panel.innerHTML = '<div class="loading">该资产没有可追溯的事件链</div>'; return; }
    renderReverseTrace(d, targetId);
  } catch (e) {
    panel.innerHTML = '<div class="loading">归因分析失败: ' + e.message + '</div>';
  }
}

function renderReverseTrace(paths, targetId) {
  const panel = document.getElementById('traceResult');
  const targetNode = rawGraph.nodes.find(function (n) { return n.id === targetId; });
  const targetLabel = targetNode ? targetNode.label || targetId : targetId;

  let html = '<div style="border-top:1px solid rgba(255,255,255,0.06);padding-top:8px;">';

  // Summary header
  const events = new Set();
  const lines = new Set();
  paths.forEach(function (p) { events.add(p.event); if (p.event_line) lines.add(p.event_line); });
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:10px;">';
  html += '<div class="path-card" style="text-align:center;padding:8px;"><div style="font-size:9px;color:var(--text-dim);">源头事件</div><div style="font-size:18px;font-weight:700;color:var(--cyan);">' + events.size + '</div></div>';
  html += '<div class="path-card" style="text-align:center;padding:8px;"><div style="font-size:9px;color:var(--text-dim);">传导路径</div><div style="font-size:18px;font-weight:700;color:var(--magenta);">' + paths.length + '</div></div>';
  html += '<div class="path-card" style="text-align:center;padding:8px;"><div style="font-size:9px;color:var(--text-dim);">驱动线</div><div style="font-size:18px;font-weight:700;color:var(--yellow);">' + lines.size + '</div></div>';
  html += '</div>';

  // Group by event
  const byEvent = {};
  paths.forEach(function (p) {
    if (!byEvent[p.event]) byEvent[p.event] = { label: p.event_label, line: p.event_line, paths: [] };
    byEvent[p.event].paths.push(p);
  });

  html += '<div style="font-size:10px;color:var(--text-dim);margin-bottom:4px;">&#9889; 可能影响 <span style="color:#fff;font-weight:600;">' + targetLabel + '</span> 的事件:</div>';

  Object.entries(byEvent).forEach(function (a) {
    const evId = a[0], ev = a[1];
    const bestPath = ev.paths.reduce(function (a, b) { return a.composite_weight > b.composite_weight ? a : b; });
    const lineMeta = LINE_META[ev.line] || {};
    const lineColor = lineMeta.color || 'var(--text-dim)';

    html += '<div class="path-card" style="padding:8px;margin-bottom:6px;border-left:3px solid ' + lineColor + ';">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">';
    html += '<div><span style="font-size:14px;font-weight:600;color:#fff;">' + ev.label + '</span>';
    if (ev.line) html += ' <span style="font-size:9px;color:' + lineColor + ';">' + (lineMeta.label || ev.line) + '</span>';
    html += '</div>';
    html += '<span style="font-size:11px;color:var(--cyan);font-weight:600;">最佳权重 ' + bestPath.composite_weight + '</span>';
    html += '</div>';

    // Top 3 paths for this event
    ev.paths.slice(0, 3).forEach(function (p, i) {
      const chain = p.path.map(function (id) {
        const n = rawGraph.nodes.find(function (x) { return x.id === id; });
        return n ? n.label || id : id;
      }).join(' → ');
      html += '<div style="font-size:10px;color:var(--text-dim);padding:2px 0;display:flex;gap:6px;">';
      html += '<span style="color:var(--green);min-width:24px;">#' + (i + 1) + '</span>';
      html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + chain + '</span>';
      html += '<span style="color:var(--cyan);min-width:50px;text-align:right;">' + p.composite_weight + 'w</span>';
      html += '<span style="color:var(--yellow);min-width:40px;text-align:right;">' + p.total_lag_hours + 'h</span>';
      html += '</div>';
    });

    if (ev.paths.length > 3) {
      html += '<div style="font-size:9px;color:var(--text-dim);text-align:center;margin-top:2px;">+ ' + (ev.paths.length - 3) + ' 条路径</div>';
    }
    html += '</div>';
  });

  panel.innerHTML = html;
}

// ===== Derive (后果推导) =====
async function loadDerive(eventId){
  try{
    var panel=document.getElementById('derivePanel');
    panel.innerHTML='<div class="loading">推导中...</div>';
    var r=await fetch('/api/propagation/derive?event='+encodeURIComponent(eventId));
    var d=await r.json();
    if(d.error){panel.innerHTML='<div class="loading">⚠ '+d.error+'</div>';return;}
    renderDerive(d);
    switchTab('derive');
  }catch(e){
    document.getElementById('derivePanel').innerHTML='<div class="loading">⚠ 推导失败</div>';
  }
}
function renderDerive(d){
  var panel=document.getElementById('derivePanel');
  var html='';
  // Header
  html+='<div style="margin-bottom:10px;">';
  html+='<div style="font-size:16px;font-weight:700;color:#fff;">'+d.event_label+'</div>';
  html+='<div style="font-size:12px;color:var(--text-dim);letter-spacing:1px;">'+TYPE_LABELS[d.event_type||'']+' · '+(LINE_META[d.event_line]?.label||d.event_line)+'</div>';
  html+='</div>';

  // Explanations
  if(d.explanations&&d.explanations.length){
    d.explanations.forEach(function(ex){
      html+='<div class="path-card" style="background:rgba(0,248,255,0.04);border-color:rgba(0,248,255,0.15);margin-bottom:6px;">';
      html+='<div style="font-size:14px;font-weight:600;color:var(--cyan);">'+ex.text+'</div>';
      html+='<div style="font-size:12px;color:var(--text-dim);margin-top:2px;">'+ex.detail+'</div>';
      html+='</div>';
    });
  }

  // Verifier evidence
  if(d.verifier_evidence){
    var ve=d.verifier_evidence;
    var vcolor=ve.verdict==='sufficient'?'var(--green)':ve.verdict==='partial'?'var(--yellow)':'var(--red)';
    html+='<div class="path-card" style="border-color:'+vcolor+';background:rgba(255,255,255,0.02);margin-bottom:6px;">';
    html+='<div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:4px;">📊 数据验证层</div>';
    html+='<div style="font-size:12px;">判定: <span style="color:'+vcolor+';font-weight:600;">'+(ve.verdict==='sufficient'?'✅ 证据充分':ve.verdict==='partial'?'⚠ 部分支持':'❌ 证据不足')+'</span> (评分 '+ve.total_weighted_score+')</div>';
    if(ve.sources&&ve.sources.length){
      html+='<div style="font-size:9px;color:var(--text-dim);margin-top:3px;">数据来源: ';
      ve.sources.forEach(function(s){html+=s.label+'('+s.weight+'w,'+s.confidence+'c) ';});
      html+='</div>';
    }
    if(ve.supports&&ve.supports.length){
      html+='<div style="font-size:9px;color:var(--text-dim);margin-top:2px;">支持: ';
      ve.supports.forEach(function(s){html+=s.label+'('+s.weight+'w) ';});
      html+='</div>';
    }
    html+='</div>';
  }

  // Active signals affecting this event
  if(d.active_signals&&d.active_signals.length){
    html+='<div style="font-size:10px;color:var(--text-dim);margin:6px 0 4px;letter-spacing:1px;">当前市场条件影响:</div>';
    html+='<div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:6px;">';
    d.active_signals.forEach(function(s){
      var meta=SIGNAL_META[s.name]||{label:s.name,color:'#8899bb',icon:'&#9679;'};
      html+='<span style="font-size:9px;padding:2px 6px;border-radius:3px;border:1px solid '+meta.color+'33;background:'+meta.color+'11;color:'+meta.color+';">'+meta.icon+' '+meta.label+' '+Math.round(s.score*100)+'%</span>';
    });
    html+='</div>';
  }

  // Counterfactual analysis
  if(d.counterfactuals&&d.counterfactuals.length){
    html+='<div style="font-size:10px;color:var(--orange);margin:6px 0 4px;letter-spacing:1px;border-top:1px solid rgba(255,136,0,0.15);padding-top:6px;">⚡ 反事实分析 — 如果该事件没发生:</div>';
    d.counterfactuals.forEach(function(cf){
      html+='<div class="path-card" style="border-color:rgba(255,136,0,0.15);background:rgba(255,136,0,0.03);margin-bottom:3px;">';
      html+='<div style="font-size:11px;font-weight:600;color:var(--orange);">'+cf.label+'</div>';
      html+='<div style="font-size:10px;color:var(--text-dim);">'+cf.reason+'</div>';
      html+='</div>';
    });
  }

  // Transmission chains — flowchart style
  if(d.chains&&d.chains.length){
    html+='<div style="font-size:10px;color:var(--text-dim);margin:6px 0 4px;letter-spacing:1px;border-top:1px solid rgba(255,255,255,0.06);padding-top:6px;">📡 传导链 (Top '+Math.min(d.chains.length,5)+'):</div>';
    d.chains.forEach(function(chain,ci){
      html+='<div class="path-card" style="margin-bottom:6px;padding:8px;">';
      // Chain header
      html+='<div style="font-size:13px;font-weight:600;color:var(--green);margin-bottom:6px;">#'+(ci+1)+' → '+chain.target_label+' <span style="font-size:11px;color:var(--text-dim);font-weight:400;">权重 '+chain.composite_weight+' · 置信 '+chain.composite_confidence+' · '+chain.total_lag_hours+'h</span></div>';
      // Flowchart
      if(chain.steps&&chain.steps.length){
        html+='<div class="flow-chain">';
        chain.steps.forEach(function(step,si){
          var fcolor=TYPE_COLORS[step.from_type]||'#8899bb';
          var tcolor=TYPE_COLORS[step.to_type]||'#8899bb';
          var dcolor=DIR_COLORS[step.direction]||'var(--text-dim)';
          var dyn=step.dynamic_info;
          // Node box for "from" (only on first step)
          if(si===0){
            html+='<div class="flow-node" style="border-color:'+fcolor+';">';
            html+='<div class="fn-label">'+step.from_label+'</div>';
            html+='<div class="fn-type">'+TYPE_LABELS[step.from_type]||step.from_type+'</div>';
            html+='</div>';
          }
          // Connector
          html+='<div class="flow-conn">';
          html+='<div class="fc-dir" style="color:'+dcolor+';">'+step.direction_label+'</div>';
          html+='<div class="fc-line"></div>';
          html+='<div class="fc-meta">'+step.weight+'w</div>';
          html+='<div class="fc-meta">'+step.time_lag_hours+'h</div>';
          if(dyn&&dyn.mult!==1){
            var dc=dyn.mult>1?'var(--magenta)':'var(--green)';
            html+='<div class="fc-mult" style="background:'+dc+'22;color:'+dc+';">×'+dyn.mult+'</div>';
          }
          html+='</div>';
          // Node box for "to"
          html+='<div class="flow-node" style="border-color:'+tcolor+';">';
          html+='<div class="fn-label">'+step.to_label+'</div>';
          html+='<div class="fn-type">'+TYPE_LABELS[step.to_type]||step.to_type+'</div>';
          html+='</div>';
          // Rationale
          if(dyn&&dyn.rationale){
            html+='<div style="width:100%;font-size:8px;color:var(--text-dim);margin-top:2px;padding-left:4px;opacity:0.7;">'+dyn.rationale+'</div>';
          }
        });
        html+='</div>';
      }
      html+='</div>';
    });
  }

  // Footer
  html+='<div style="font-size:9px;color:var(--text-dim);text-align:center;padding-top:6px;border-top:1px solid rgba(255,255,255,0.04);">共 '+d.paths_count+' 条传导路径</div>';

  panel.innerHTML=html;
}

// ===== Animation (#2) =====
function toggleAnimation(){
  if(!selectedEvents.length)return;
  if(animTimer){clearInterval(animTimer);animTimer=null;animating=false;document.getElementById('btnAnimate').classList.remove('active');return;}
  animating=true;document.getElementById('btnAnimate').classList.add('active');animatePaths();
}
async function animatePaths(){
  const id=selectedEvents[0];
  try{
    const paths=await fetch(`/api/propagation/paths?event=${id}`).then(r=>r.json());
    if(!paths.length)return;
    const allEdges=[];const seen=new Set();
    paths.forEach(p=>{p.edges.forEach(e=>{const k=`${e.from}->${e.to}`;if(!seen.has(k)){seen.add(k);allEdges.push({from:e.from,to:e.to});}});});
    let step=0;
    if(animTimer){clearInterval(animTimer);}
    animTimer=setInterval(()=>{
      if(step>=allEdges.length){
        clearInterval(animTimer);animTimer=null;animating=false;document.getElementById('btnAnimate').classList.remove('active');
        document.getElementById('animStep').textContent='';
        highlightMultiPaths();return;
      }
      document.getElementById('animStep').textContent=`${step+1}/${allEdges.length}`;
      const edge=allEdges[step];
      const nd=rawGraph.nodes.map(n=>{const hit=selectedEvents.includes(n.id)||n.id===edge.to||allEdges.slice(0,step+1).some(s=>s.to===n.id||s.from===n.id);return{...n,opacity:hit?1:0.1};});
      const ed=rawGraph.edges.map(e=>{
        const k=`${e.from}->${e.to}`;const isC=k===`${edge.from}->${edge.to}`;const iP=allEdges.slice(0,step).some(s=>`${s.from}->${s.to}`===k);
        return{source:e.from,target:e.to,weight:e.weight||0.5,type:e.type||'propagates',direction:e.direction||'same',confidence:e.confidence||0.5,time_lag_hours:e.time_lag_hours||0,
          lineStyle:{...e.lineStyle,opacity:iP?0.9:isC?1:0.03,width:isC?(e.lineStyle?.width||1)*2.5:iP?(e.lineStyle?.width||1)*1.5:(e.lineStyle?.width||1),color:isC?'#fff':e.lineStyle?.color},
          symbol:['feeds_back','verifies'].includes(e.type)?'none':'arrow',symbolSize:[8,12]};
      });
      chart.setOption({series:[{data:computeLayout(nd,rawGraph.edges),edges:ed}]});
      step++;
    },animSpeed);
  }catch(e){}
}

// ===== Controls =====
function toggleLayout(){
  const btn=document.getElementById('btnForce');
  layoutMode=layoutMode==='force'?'none':'force';btn.classList.toggle('active');
  btn.innerHTML=layoutMode==='force'?'&#9678; 力导向':'&#9678; 固定';
  chart.setOption({series:[{layout:layoutMode,force:layoutMode==='force'?{layoutAnimation:true}:void 0}]});
}
function toggleEdgeLabels(){
  showEdgeLabels=!showEdgeLabels;document.getElementById('btnEdgeLabel').classList.toggle('active');
  chart.setOption({series:[{edgeLabel:showEdgeLabels?{show:true,fontSize:8,color:'#8899bb',formatter:p=>`${DIR_SYMBOLS[p.data.direction]||''} ${p.data.weight}`}:{show:false}}]});
}
function resetGraphHighlight(){
  stopFlowPulse();
  selectedEvents=[];document.querySelectorAll('.event-item.active,.event-item.active2').forEach(el=>el.classList.remove('active','active2'));
  document.getElementById('eventSelect').value='';document.getElementById('selCount').textContent='0';
  document.getElementById('exposurePanel').innerHTML='<div class="loading">点击事件查看传导路径</div>';
  document.getElementById('selectedPanel').innerHTML='<div class="loading">Ctrl+点击选择多个事件</div>';
  chart.setOption({series:[{data:computeLayout(rawGraph.nodes,rawGraph.edges)}]});
  document.getElementById('animStep').textContent='';
}
function resetGraph(){
  if(animTimer){clearInterval(animTimer);animTimer=null;animating=false;document.getElementById('btnAnimate').classList.remove('active');}
  if(activeSignal){activeSignal=null;if(dynamicSignalData)renderSignalPanel();}
  if(heatmapActive){heatmapActive=false;heatmapData=null;document.getElementById('btnHeatmap').classList.remove('active');document.getElementById('btnHeatmap').innerHTML='&#127777; 热力';}
  if(marketVerifyActive){marketVerifyActive=false;marketVerifyData=null;document.getElementById('btnMarketVerify').classList.remove('active');document.getElementById('btnMarketVerify').innerHTML='&#128200; 验证';}
  if(narrativeActive){narrativeActive=false;narrativeData=null;document.getElementById('btnNarrative').classList.remove('active');document.getElementById('btnNarrative').innerHTML='&#128240; 叙事';}
  if(onchainActive){onchainActive=false;onchainData=null;document.getElementById('btnOnchain').classList.remove('active');document.getElementById('btnOnchain').innerHTML='&#9881; 链上';}
  if(calendarActive){calendarActive=false;calendarData=null;document.getElementById('btnCalendar').classList.remove('active');document.getElementById('btnCalendar').innerHTML='&#128197; 日历';}
  if(decayActive){decayActive=false;decayData=null;document.getElementById('btnDecay').classList.remove('active');document.getElementById('btnDecay').innerHTML='&#9200; 衰减';}
  if(arbitrageActive){arbitrageActive=false;arbitrageData=null;document.getElementById('btnArbitrage').classList.remove('active');document.getElementById('btnArbitrage').innerHTML='&#8644; 套利';}
  resetGraphHighlight();document.getElementById('searchInput').value='';document.getElementById('animStep').textContent='';
  renderLegendBar();
  activeLines.clear();[...document.querySelectorAll('.line-btn')].forEach(b=>{activeLines.add(b.dataset.line);b.classList.add('active');});
}

function switchTab(name,btn){
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p=>p.style.display='none');
  if(btn)btn.classList.add('active');else document.querySelector(`.tab-btn[onclick*="'${name}'"]`)?.classList.add('active');
  const el=document.getElementById({events:'tabEvents',market:'tabMarket',paths:'tabPaths',selected:'tabSelected',signals:'tabSignals',derive:'tabDerive',scenario:'tabScenario',trace:'tabTrace'}[name]);
  if(el)el.style.display='';
}

// ===== Export =====
function exportImage(){
  if(!chart){showToast('图谱未加载','error');return;}
  const url=chart.getDataURL({type:'png',pixelRatio:2,backgroundColor:'#0a0e1a'});
  const a=document.createElement('a');a.href=url;a.download='propagation_graph.png';a.click();
  showToast('图谱已导出','success',1500);
}

// ===== Keyboard =====
document.addEventListener('keydown',e=>{
  if(e.key==='/'&&e.target.tagName!=='INPUT'&&e.target.tagName!=='SELECT'&&e.target.tagName!=='TEXTAREA'){e.preventDefault();document.getElementById('searchInput').focus();}
  if(e.key==='Escape'){if(document.getElementById('editModal').style.display==='flex')closeEditModal();else resetGraph();}
});

// ===== Edit Modal (#5) =====
function showEditModal(){document.getElementById('editModal').style.display='flex';populateEditNodes();populateEditEdges();populateEditSelects();}
function closeEditModal(){document.getElementById('editModal').style.display='none';}
function editTab(name,btn){
  document.querySelectorAll('#editModal .tab-btn').forEach(b=>b.classList.remove('active'));if(btn)btn.classList.add('active');
  ['editNodes','editEdges','editAddNode','editAddEdge'].forEach(id=>document.getElementById(id).style.display='none');
  const el=document.getElementById({nodes:'editNodes',edges:'editEdges','add-node':'editAddNode','add-edge':'editAddEdge'}[name]);
  if(el)el.style.display='';if(name==='nodes')populateEditNodes();if(name==='edges')populateEditEdges();if(name==='add-node'||name==='add-edge')populateEditSelects();
}
function populateEditSelects(){['editEdgeFrom','editEdgeTo','addEdgeFrom','addEdgeTo'].forEach(id=>{const sel=document.getElementById(id);sel.innerHTML='';rawGraph.nodes.forEach(n=>{const o=document.createElement('option');o.value=n.id;o.textContent=n.label||n.id;sel.appendChild(o);});});}
function populateEditNodes(){const sel=document.getElementById('editNodeSelect');sel.innerHTML='';rawGraph.nodes.forEach(n=>{const o=document.createElement('option');o.value=n.id;o.textContent=n.label||n.id;sel.appendChild(o);});if(rawGraph.nodes.length)editNodeSelect();}
function editNodeSelect(){const id=document.getElementById('editNodeSelect').value,n=rawGraph.nodes.find(x=>x.id===id);if(!n)return;document.getElementById('editNodeId').value=n.id;document.getElementById('editNodeLabel').value=n.label||'';document.getElementById('editNodeType').value=n.type||'intermediate';document.getElementById('editNodeLine').value=n.line||'';document.getElementById('editNodeSubtype').value=n.subtype||'';}
function saveNode(){const id=document.getElementById('editNodeId').value,n=rawGraph.nodes.find(x=>x.id===id);if(!n){document.getElementById('editStatus').textContent='节点不存在';return;}n.label=document.getElementById('editNodeLabel').value;n.type=document.getElementById('editNodeType').value;n.line=document.getElementById('editNodeLine').value;n.subtype=document.getElementById('editNodeSubtype').value;saveGraph();}
function deleteNode(){const id=document.getElementById('editNodeSelect').value;rawGraph.nodes=rawGraph.nodes.filter(n=>n.id!==id);rawGraph.edges=rawGraph.edges.filter(e=>e.from!==id&&e.to!==id);saveGraph();}
function populateEditEdges(){const sel=document.getElementById('editEdgeSelect');sel.innerHTML='';rawGraph.edges.forEach(e=>{const o=document.createElement('option');o.value=`${e.from}->${e.to}`;const f=rawGraph.nodes.find(n=>n.id===e.from);const t=rawGraph.nodes.find(n=>n.id===e.to);o.textContent=`${f?.label||e.from} → ${t?.label||e.to}`;sel.appendChild(o);});if(rawGraph.edges.length)editEdgeSelect();}
function editEdgeSelect(){const v=document.getElementById('editEdgeSelect').value,[from,to]=v.split('->'),e=rawGraph.edges.find(x=>x.from===from&&x.to===to);if(!e)return;document.getElementById('editEdgeFrom').value=e.from;document.getElementById('editEdgeTo').value=e.to;document.getElementById('editEdgeType').value=e.type||'propagates';document.getElementById('editEdgeWeight').value=e.weight||0.5;document.getElementById('editEdgeConfidence').value=e.confidence||0.5;document.getElementById('editEdgeDirection').value=e.direction||'same';document.getElementById('editEdgeLag').value=e.time_lag_hours||0;}
function saveEdge(){const v=document.getElementById('editEdgeSelect').value,[from,to]=v.split('->'),e=rawGraph.edges.find(x=>x.from===from&&x.to===to);if(!e){document.getElementById('editStatus').textContent='边不存在';return;}e.type=document.getElementById('editEdgeType').value;e.weight=+document.getElementById('editEdgeWeight').value||0.5;e.confidence=+document.getElementById('editEdgeConfidence').value||0.5;e.direction=document.getElementById('editEdgeDirection').value;e.time_lag_hours=+document.getElementById('editEdgeLag').value||0;saveGraph();}
function deleteEdge(){const v=document.getElementById('editEdgeSelect').value,[from,to]=v.split('->');rawGraph.edges=rawGraph.edges.filter(e=>!(e.from===from&&e.to===to));saveGraph();}
function addNode(){const id=document.getElementById('addNodeId').value.trim();if(!id){document.getElementById('editStatus').textContent='请输入ID';return;}if(rawGraph.nodes.find(n=>n.id===id)){document.getElementById('editStatus').textContent='ID已存在';return;}rawGraph.nodes.push({id,label:document.getElementById('addNodeLabel').value,type:document.getElementById('addNodeType').value,line:document.getElementById('addNodeLine').value,subtype:document.getElementById('addNodeSubtype').value});saveGraph();}
function addEdge(){const from=document.getElementById('addEdgeFrom').value,to=document.getElementById('addEdgeTo').value;if(from===to){document.getElementById('editStatus').textContent='来源和目标不能相同';return;}if(rawGraph.edges.find(e=>e.from===from&&e.to===to)){document.getElementById('editStatus').textContent='边已存在';return;}rawGraph.edges.push({from,to,type:document.getElementById('addEdgeType').value,weight:+document.getElementById('addEdgeWeight').value||0.5,confidence:+document.getElementById('addEdgeConfidence').value||0.7,direction:document.getElementById('addEdgeDirection').value,time_lag_hours:+document.getElementById('addEdgeLag').value||1});saveGraph();}
async function saveGraph(){
  document.getElementById('editStatus').textContent='保存中...';
  try{
    const r=await fetch('/api/propagation/graph',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nodes:rawGraph.nodes,edges:rawGraph.edges})});
    const d=await r.json();
    if(d.ok){document.getElementById('editStatus').textContent=`已保存: ${d.total_nodes}节点 ${d.total_edges}边`;
	      document.getElementById('stNodes').textContent=d.total_nodes||0;document.getElementById('stEdges').textContent=d.total_edges||0;
	      setTimeout(async()=>{closeEditModal();const r2=await fetch('/api/propagation/graph');const d2=await r2.json();if(d2.nodes){rawGraph=d2;renderGraph();renderEventList();}},500);}
    else{showToast('保存失败: '+d.error,'error');document.getElementById('editStatus').textContent='保存失败: '+d.error;}
  }catch(e){showToast('保存失败: '+e.message,'error');document.getElementById('editStatus').textContent='保存失败: '+e.message;}
}

window.addEventListener('resize',()=>{if(chart)chart.resize();});
loadGraph().catch(function(e){console.error('loadGraph unhandled:',e);var d=document.getElementById('jsError');if(d)d.innerHTML+='<div>loadGraph failed: '+(e.message||String(e))+'</div>';});

      };
      runScripts();
    } catch (e) {
      console.error('[Propagation] Error executing page scripts:', e);
    }

    return () => {
      // Clean up fetch and styles
      window.fetch = origFetch;
      const styleEl = document.getElementById('propagation-styles');
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
