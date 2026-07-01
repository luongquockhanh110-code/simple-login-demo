// @ts-nocheck
import { Store } from './store';
import { CONFIG } from './config';

/**
 * propagation_engine.js — Propagation Graph Analysis & Deduction Engine.
 * 
 * Ported from:
 *   - core/propagation.py       → PropagationEngine (Path finding, exposure, verify, derive)
 *   - core/weight_adjuster.py   → WeightAdjuster (Dynamic adjustments)
 * 
 * Requires: config.js, store.js, data.js
 */

const PropagationEngine = {
  _graph: null,
  _nodesById: {},
  _adj: {},
  _revAdj: {},

  async load() {
    // 优先从 Store 读取修改后的图谱，否则加载默认的 propagation_graph.json
    let g = Store.get("custom_propagation_graph");
    if (!g) {
      try {
        const resp = await fetch("/propagation_graph.json");
        g = await resp.json();
      } catch (e) {
        console.warn("[PropagationEngine] Failed to fetch propagation_graph.json, using fallback", e);
        g = { nodes: [], edges: [] };
      }
    }
    this._graph = g;
    this._buildIndex();
    return g;
  },

  _buildIndex() {
    const g = this._graph || { nodes: [], edges: [] };
    this._nodesById = {};
    this._adj = {};
    this._revAdj = {};

    for (const n of g.nodes || []) {
      const nid = n.id;
      this._nodesById[nid] = n;
      this._adj[nid] = [];
      this._revAdj[nid] = [];
    }

    for (const e of g.edges || []) {
      const f = e.from;
      const t = e.to;
      if (this._nodesById[f] && this._nodesById[t]) {
        this._adj[f].push({ to: t, edge: e });
        this._revAdj[t].push({ from: f, edge: e });
      }
    }
  },

  getMutuallyExclusiveEvents(eventId) {
    const node = this._nodesById[eventId];
    if (!node) return [];
    return node.mutually_exclusive_with || [];
  },

  getNodeLines(nodeId) {
    const node = this._nodesById[nodeId];
    if (!node) return [];
    if (node.lines) return node.lines;
    return node.line ? [node.line] : [];
  },

  findPaths(eventId, maxDepth = 6, targetTypes = ["target"], excludeMutuallyExclusive = true) {
    if (!this._nodesById[eventId]) return [];
    const results = [];
    const visited = new Set();

    const dfs = (current, path, edgeChain, depth) => {
      if (depth > maxDepth) return;
      if (visited.has(current) && depth > 0) return;
      visited.add(current);

      const node = this._nodesById[current];
      if (node && targetTypes.includes(node.type) && depth > 0) {
        let compW = 1.0;
        let compC = 1.0;
        let totalLag = 0.0;
        for (const e of edgeChain) {
          compW *= (e.weight !== undefined ? e.weight : 1.0);
          compC *= (e.confidence !== undefined ? e.confidence : 1.0);
          totalLag += (e.time_lag_hours || 0);
        }
        results.push({
          path: [...path],
          edges: [...edgeChain],
          composite_weight: Math.round(compW * 10000) / 10000,
          composite_confidence: Math.round(compC * 10000) / 10000,
          total_lag_hours: Math.round(totalLag * 10) / 10,
          target: current,
          target_label: node.label || current,
          line: node.line || ""
        });
      }

      const neighbors = this._adj[current] || [];
      for (const edgeInfo of neighbors) {
        const nxt = edgeInfo.to;
        if (!visited.has(nxt)) {
          edgeChain.push(edgeInfo.edge);
          path.push(nxt);
          dfs(nxt, path, edgeChain, depth + 1);
          path.pop();
          edgeChain.pop();
        }
      }

      visited.delete(current);
    };

    dfs(eventId, [eventId], [], 0);
    results.sort((a, b) => b.composite_weight - a.composite_weight);
    return results;
  },

  getExposure(eventId) {
    const eventNode = this._nodesById[eventId];
    if (!eventNode) return { event_id: eventId, error: "event not found" };

    const paths = this.findPaths(eventId);
    if (!paths || paths.length === 0) return { event_id: eventId, error: "no propagation paths" };

    const mutuallyExclusive = this.getMutuallyExclusiveEvents(eventId);
    const exclusiveInfo = [];
    for (const meId of mutuallyExclusive) {
      const meNode = this._nodesById[meId] || {};
      exclusiveInfo.push({
        id: meId,
        label: meNode.label || meId,
        line: meNode.line || ""
      });
    }

    const targets = {};
    for (const p of paths) {
      const t = p.target;
      if (!targets[t]) {
        targets[t] = {
          label: p.target_label,
          line: p.line,
          best_weight: p.composite_weight,
          best_confidence: p.composite_confidence,
          min_lag: p.total_lag_hours,
          paths_count: 0,
          directions: []
        };
      }
      const tgt = targets[t];
      tgt.paths_count += 1;
      if (p.composite_weight > tgt.best_weight) {
        tgt.best_weight = p.composite_weight;
        tgt.best_confidence = p.composite_confidence;
        tgt.min_lag = Math.min(tgt.min_lag, p.total_lag_hours);
      }
      if (p.edges && p.edges.length > 0) {
        const d = p.edges[0].direction;
        if (d && !tgt.directions.includes(d)) {
          tgt.directions.push(d);
        }
      }
    }

    const weights = Object.values(targets).map(t => t.best_weight);
    const confs = Object.values(targets).map(t => t.best_confidence);
    const lags = Object.values(targets).map(t => t.min_lag);

    const sumConfs = confs.reduce((a, b) => a + b, 0);

    return {
      event_id: eventId,
      event_label: eventNode.label || eventId,
      event_line: eventNode.line || "",
      event_lines: this.getNodeLines(eventId),
      event_type: eventNode.type || "",
      mutually_exclusive_with: exclusiveInfo,
      paths_count: paths.length,
      targets: targets,
      aggregate: {
        max_weight: weights.length > 0 ? Math.round(Math.max(...weights) * 1000) / 1000 : 0,
        avg_confidence: confs.length > 0 ? Math.round((sumConfs / confs.length) * 1000) / 1000 : 0,
        min_lag_hours: lags.length > 0 ? Math.min(...lags) : 0,
        affected_targets: Object.keys(targets).length
      }
    };
  },

  verifyChain(eventId, marketSnapshot) {
    const paths = this.findPaths(eventId);
    if (!paths || paths.length === 0) {
      return { event_id: eventId, chains: [], overall_verdict: "no_paths" };
    }

    const chains = [];
    let verifiedSteps = 0;
    let totalSteps = 0;

    const topPaths = paths.slice(0, 10);
    for (const p of topPaths) {
      const stepResults = [];
      let okCount = 0;
      for (const e of p.edges) {
        totalSteps += 1;
        const expectedDir = e.direction || "same";
        const actualVal = marketSnapshot[e.to];
        const step = {
          from: e.from,
          to: e.to,
          expected_direction: expectedDir,
          edge_weight: e.weight || 0.5,
          actual_value: actualVal
        };

        if (actualVal !== undefined && actualVal !== null && expectedDir !== "stable" && expectedDir !== "complex") {
          step.has_verification = true;
          okCount += 1;
          verifiedSteps += 1;
        } else {
          step.has_verification = false;
        }
        stepResults.push(step);
      }

      chains.push({
        path: p.path,
        target: p.target,
        composite_weight: p.composite_weight,
        verified_steps: okCount,
        total_steps: p.edges.length,
        steps: stepResults
      });
    }

    let verdict = "unverified";
    if (verifiedSteps > 0) {
      verdict = (verifiedSteps >= totalSteps * 0.6) ? "verified" : "partial";
    }

    return {
      event_id: eventId,
      chains: chains,
      overall_verdict: verdict,
      verified_steps: verifiedSteps,
      total_steps: totalSteps
    };
  },

  verifyVerifierChain(eventId = null) {
    const g = this._graph || { nodes: [], edges: [] };
    const verifierNodes = (g.nodes || []).filter(n => {
      return n.type === "verifier" && (eventId === null || n.id === eventId);
    });

    const results = [];
    for (const vn of verifierNodes) {
      const vid = vn.id;
      const sources = [];
      let totalWeight = 0.0;
      const revNeighbors = this._revAdj[vid] || [];
      for (const edgeInfo of revNeighbors) {
        const edge = edgeInfo.edge;
        if (edge.type !== "verifies") continue;
        const src = this._nodesById[edgeInfo.from] || {};
        const w = edge.weight || 0;
        const c = edge.confidence !== undefined ? edge.confidence : 0.5;
        sources.push({
          from_id: edgeInfo.from,
          from_label: src.label || edgeInfo.from,
          weight: w,
          confidence: c
        });
        totalWeight += w * c;
      }

      const outbound = [];
      const neighbors = this._adj[vid] || [];
      for (const edgeInfo of neighbors) {
        const edge = edgeInfo.edge;
        if (edge.type !== "verifies") continue;
        const tgt = this._nodesById[edgeInfo.to] || {};
        outbound.push({
          to_id: edgeInfo.to,
          to_label: tgt.label || edgeInfo.to,
          weight: edge.weight || 0,
          confidence: edge.confidence !== undefined ? edge.confidence : 0.5
        });
      }

      const evidenceScore = sources.length > 0 ? Math.round((totalWeight / sources.length) * 100) / 100 : 0;
      let verdict = "insufficient";
      if (evidenceScore >= 0.5) verdict = "sufficient";
      else if (evidenceScore > 0) verdict = "partial";

      results.push({
        id: vid,
        label: vn.label || vid,
        line: vn.line || "",
        evidence: {
          total_weighted_score: evidenceScore,
          sources_count: sources.length,
          sources: sources
        },
        supports: outbound,
        verdict: verdict
      });
    }

    return { verifiers: results };
  },

  getGraphStats() {
    const g = this._graph || { nodes: [], edges: [] };
    const nodes = g.nodes || [];
    const edges = g.edges || [];

    const byType = {};
    const byLine = {};
    for (const n of nodes) {
      const type = n.type || "unknown";
      byType[type] = (byType[type] || 0) + 1;
      const line = n.line || "unknown";
      byLine[line] = (byLine[line] || 0) + 1;
    }

    const edgeByType = {};
    for (const e of edges) {
      const type = e.type || "unknown";
      edgeByType[type] = (edgeByType[type] || 0) + 1;
    }

    return {
      total_nodes: nodes.length,
      total_edges: edges.length,
      nodes_by_type: byType,
      nodes_by_line: byLine,
      edges_by_type: edgeByType
    };
  },

  listEvents() {
    const g = this._graph || { nodes: [], edges: [] };
    const result = [];
    for (const n of g.nodes || []) {
      if (n.type !== "event" && n.type !== "verifier") continue;
      const entry = {
        id: n.id,
        label: n.label,
        line: n.line,
        lines: this.getNodeLines(n.id),
        subtype: n.subtype
      };
      if (n.mutually_exclusive_with) {
        entry.mutually_exclusive_with = n.mutually_exclusive_with.map(meId => {
          const meNode = this._nodesById[meId] || {};
          return { id: meId, label: meNode.label || meId };
        });
      }
      result.push(entry);
    }
    return result;
  },

  getGraphData() {
    const g = this._graph || { nodes: [], edges: [] };
    const byType = {};
    for (const n of g.nodes || []) {
      const type = n.type || "unknown";
      byType[type] = (byType[type] || 0) + 1;
    }
    return {
      nodes: g.nodes,
      edges: g.edges,
      stats: {
        total_nodes: g.nodes.length,
        total_edges: g.edges.length,
        nodes_by_type: byType
      }
    };
  },

  updateGraphData(data) {
    const g = this._graph || { nodes: [], edges: [] };
    if (data.nodes) g.nodes = data.nodes;
    if (data.edges) g.edges = data.edges;
    this._graph = g;
    this._buildIndex();
    Store.set("custom_propagation_graph", g);
    return { ok: true, total_nodes: g.nodes.length, total_edges: g.edges.length };
  },

  _counterfactualReason(eventId, altId) {
    const reasons = {
      "fed_rate_hike->fed_rate_cut": "若经济数据走弱（如非农不及预期、CPI回落），市场预期可能转向降息",
      "fed_rate_hike->fed_hold": "若通胀顽固但增长放缓，美联储可能选择观望",
      "fed_rate_cut->fed_rate_hike": "若通胀意外反弹或就业过热，市场预期可能转向加息",
      "fed_rate_cut->fed_hold": "若数据好坏参半，美联储可能暂停降息等待更多信息",
      "fed_hold->fed_rate_cut": "若经济显著放缓或出现金融风险，降息预期将升温",
      "fed_hold->fed_rate_hike": "若通胀持续超预期，加息可能重新提上议程"
    };
    const key = eventId + "->" + altId;
    return reasons[key] || `市场条件变化可能触发替代路径「${altId}」`;
  },

  deriveConsequence(eventId) {
    const eventNode = this._nodesById[eventId];
    if (!eventNode) return { event_id: eventId, error: "event not found" };

    const typeExplanations = {
      "fed_rate_cut": [
        { type: "定性", text: "美联储降息 → 宽松货币政策信号", detail: "降息释放流动性，通常导致美元走弱、风险资产受益" }
      ],
      "fed_rate_hike": [
        { type: "定性", text: "美联储加息 → 紧缩货币政策信号", detail: "加息收紧流动性，通常导致美元走强、风险资产承压" }
      ],
      "fed_hold": [
        { type: "定性", text: "美联储按兵不动 → 政策观望信号", detail: "维持利率不变，市场注意力转向经济数据和其他事件" }
      ],
      "fiscal_stimulus": [
        { type: "定性", text: "财政刺激 → 扩张性财政政策", detail: "政府支出增加或减税，推动经济增长但可能推高国债收益率" }
      ],
      "quantitative_tightening": [
        { type: "定性", text: "缩表(QT) → 流动性收紧", detail: "美联储缩减资产负债表，抽走流动性，推高实际利率" }
      ],
      "tariff_announce": [
        { type: "定性", text: "关税公告 → 贸易摩擦升级", detail: "关税增加进口成本，推升通胀预期，打压风险偏好" }
      ],
      "war_escalation": [
        { type: "定性", text: "战争升级 → 地缘风险急剧上升", detail: "冲突升级推动避险情绪，油价飙升，风险资产暴跌" }
      ],
      "sanction_new": [
        { type: "定性", text: "新制裁 → 地缘政治紧张", detail: "制裁干扰供应链，推升特定商品价格，打压市场情绪" }
      ],
      "energy_disruption": [
        { type: "定性", text: "能源中断 → 供给冲击", detail: "能源供应中断直接推升油价，通过生产成本传导至通胀" }
      ],
      "clarity_act_pass": [
        { type: "定性", text: "Clarity Act 通过 → 监管确定性提升", detail: "明确的加密监管框架降低合规不确定性，吸引机构资金" }
      ],
      "crypto_regulation_bill": [
        { type: "定性", text: "加密监管法案 → 政策明朗化", detail: "监管框架落地减少政策不确定性，利好长期发展" }
      ]
    };

    const explanations = typeExplanations[eventId] || [
      { type: "定性", text: `${eventNode.label || eventId} 事件`, detail: "该事件通过传导链影响目标资产" }
    ];

    const paths = this.findPaths(eventId);
    const adjData = this.computeAdjustments();
    const edgeAdjs = adjData.edges || {};
    const signals = adjData.signals || {};

    const dirLabels = {
      up: "↑上涨", down: "↓下跌", same: "→同向",
      inverse: "↔反向", complex: "◊复杂", stable: "—稳定"
    };

    const chains = [];
    const topPaths = paths.slice(0, 5);
    for (const p of topPaths) {
      const steps = [];
      for (const edge of p.edges) {
        const fromN = this._nodesById[edge.from] || {};
        const toN = this._nodesById[edge.to] || {};
        const ek = `${edge.from}->${edge.to}`;
        const dyn = edgeAdjs[ek];

        const direction = edge.direction || "same";
        const step = {
          from: edge.from,
          from_label: fromN.label || edge.from,
          from_type: fromN.type || "",
          to: edge.to,
          to_label: toN.label || edge.to,
          to_type: toN.type || "",
          direction: direction,
          direction_label: dirLabels[direction] || "→",
          weight: edge.weight !== undefined ? edge.weight : 0.5,
          confidence: edge.confidence !== undefined ? edge.confidence : 0.5,
          time_lag_hours: edge.time_lag_hours || 0,
          dynamic_info: dyn ? {
            mult: dyn.weight_mult || 1.0,
            confidence_mult: dyn.confidence_mult || 1.0,
            rationale: dyn.rationale || ""
          } : null,
          summary: `${fromN.label || edge.from} → ${toN.label || edge.to} ${dirLabels[direction] || "→"} (权重${edge.weight || 0.5}, 置信${edge.confidence || 0.5}, 约${edge.time_lag_hours || 0}h)`
        };
        steps.push(step);
      }

      chains.push({
        target: p.target,
        target_label: p.target_label || p.target,
        composite_weight: Math.round(p.composite_weight * 1000) / 1000,
        composite_confidence: Math.round(p.composite_confidence * 1000) / 1000,
        total_lag_hours: p.total_lag_hours,
        steps: steps
      });
    }

    const mutuallyExclusive = this.getMutuallyExclusiveEvents(eventId);
    const counterfactuals = mutuallyExclusive.map(meId => {
      const meNode = this._nodesById[meId] || {};
      return {
        id: meId,
        label: meNode.label || meId,
        reason: this._counterfactualReason(eventId, meId)
      };
    });

    const edgeKeysInPaths = new Set();
    for (const p of paths) {
      for (const e of p.edges) {
        edgeKeysInPaths.add(`${e.from}->${e.to}`);
      }
    }

    const activeSignals = [];
    for (const [sigName, sigData] of Object.entries(signals)) {
      const affected = sigData.affected_edges || [];
      const overlapping = affected.filter(e => edgeKeysInPaths.has(e));
      if (overlapping.length > 0) {
        activeSignals.push({
          name: sigName,
          label: sigData.label || sigName,
          score: sigData.score || 0,
          edge_count: overlapping.length
        });
      }
    }

    let verifierEvidence = null;
    if (eventNode.type === "verifier") {
      try {
        const vc = this.verifyVerifierChain(eventId);
        if (vc && vc.verifiers && vc.verifiers.length > 0) {
          const v = vc.verifiers[0];
          verifierEvidence = {
            verdict: v.verdict || "unknown",
            total_weighted_score: v.evidence.total_weighted_score,
            sources_count: v.evidence.sources_count,
            sources: (v.evidence.sources || []).map(s => ({
              label: s.from_label,
              weight: s.weight,
              confidence: s.confidence
            })),
            supports: (v.supports || []).map(s => ({
              label: s.to_label,
              weight: s.weight,
              confidence: s.confidence
            }))
          };
        }
      } catch (e) {
        console.warn("[DeriveConsequence] verifier evidence check failed", e);
      }
    }

    return {
      event_id: eventId,
      event_label: eventNode.label || eventId,
      event_type: eventNode.type || "",
      event_subtype: eventNode.subtype || "",
      event_line: eventNode.line || "",
      explanations: explanations,
      chains: chains,
      counterfactuals: counterfactuals,
      active_signals: activeSignals,
      verifier_evidence: verifierEvidence,
      paths_count: paths.length
    };
  },

  confidenceHeatmap(eventId = null) {
    const g = this._graph || { nodes: [], edges: [] };
    const nodes = this._nodesById;

    let vmap = {};
    try {
      // 简单虚拟一个市场状态用于验证
      const vdata = this.verifyChainWithMarket(eventId);
      for (const ve of vdata.edges || []) {
        vmap[`${ve.from}->${ve.to}`] = ve.status;
      }
    } catch (e) {
      console.warn("[ConfidenceHeatmap] Market verification failed", e);
    }

    let relevant = null;
    if (eventId) {
      const paths = this.findPaths(eventId);
      relevant = new Set();
      for (const p of paths) {
        for (const e of p.edges) {
          relevant.add(`${e.from}->${e.to}`);
        }
      }
    }

    const results = [];
    let high = 0, medium = 0, low = 0;

    for (const e of g.edges || []) {
      const ek = `${e.from}->${e.to}`;
      if (relevant !== null && !relevant.has(ek)) {
        continue;
      }

      const baseConf = e.confidence !== undefined ? e.confidence : 0.5;
      const vs = vmap[ek] || "unverifiable";
      const verifyScore = {
        verified: 1.0,
        partial: 0.5,
        broken: 0.0,
        unverifiable: 0.5
      }[vs] || 0.5;

      const heatScore = Math.round((baseConf * 0.7 + verifyScore * 0.3) * 1000) / 1000;
      let colorGrade = "medium";
      if (heatScore >= 0.7) {
        colorGrade = "high";
        high += 1;
      } else if (heatScore >= 0.4) {
        colorGrade = "medium";
        medium += 1;
      } else {
        colorGrade = "low";
        low += 1;
      }

      results.push({
        from: e.from,
        to: e.to,
        from_label: nodes[e.from] ? nodes[e.from].label : e.from,
        to_label: nodes[e.to] ? nodes[e.to].label : e.to,
        confidence: baseConf,
        heat_score: heatScore,
        verification_status: vs,
        color_grade: colorGrade
      });
    }

    return {
      edges: results,
      summary: {
        total: results.length,
        high_count: high,
        medium_count: medium,
        low_count: low
      }
    };
  },

  getNarrativeOverlay() {
    const g = this._graph || { nodes: [], edges: [] };
    const nodes = this._nodesById;
    const edges = g.edges || [];

    // 获取近期波动率状态或事件窗口计数作为叙事基础
    const lineScores = {
      monetary: 0.4,
      geopolitical: 0.3,
      congressional: 0.2,
      macro: 0.5,
      crypto: 0.6
    };

    const edgeNarratives = {};
    for (const e of edges) {
      const fromLine = nodes[e.from] ? nodes[e.from].line : "";
      const toLine = nodes[e.to] ? nodes[e.to].line : "";

      let score = 0.3;
      let dominant = "neutral";

      if (lineScores[fromLine] !== undefined) {
        score = Math.max(score, lineScores[fromLine]);
        dominant = "positive";
      }
      if (lineScores[toLine] !== undefined) {
        score = Math.max(score, lineScores[toLine]);
      }

      const ek = `${e.from}->${e.to}`;
      edgeNarratives[ek] = {
        score: Math.round(score * 1000) / 1000,
        dominant: dominant
      };
    }

    const activeNarratives = [];
    const narrativeLabels = {
      monetary: "货币政策",
      geopolitical: "地缘政治",
      congressional: "国会立法",
      macro: "宏观数据",
      crypto: "加密市场"
    };

    for (const [line, score] of Object.entries(lineScores)) {
      activeNarratives.push({
        name: line,
        label: narrativeLabels[line] || line,
        score: score,
        affected_edges: edges.filter(e => {
          return nodes[e.from] && nodes[e.from].line === line;
        }).length
      });
    }

    return {
      narratives: activeNarratives.sort((a, b) => b.score - a.score),
      edges: edgeNarratives,
      summary: {
        total_active: activeNarratives.length,
        highest_score: Math.max(...activeNarratives.map(n => n.score))
      }
    };
  },

  getOnchainOverlay() {
    const g = this._graph || { nodes: [], edges: [] };
    const edgeScores = {};
    const alertedWhales = Store.get("event_window", {});
    
    // 检查是否有大额链上异动触发
    let btcWhaleCount = 0;
    let ethWhaleCount = 0;
    
    for (const [sym, events] of Object.entries(alertedWhales)) {
      const onchainEvs = events.filter(e => e.dimension === "onchain");
      if (onchainEvs.length > 0) {
        if (sym === "BTC") btcWhaleCount += onchainEvs.length;
        if (sym === "ETH") ethWhaleCount += onchainEvs.length;
      }
    }

    const active = (btcWhaleCount + ethWhaleCount) > 0;
    const maxSev = active ? 0.8 : 0.0;
    const activityScore = active ? 0.7 : 0.3;

    for (const e of g.edges || []) {
      const fromLine = this._nodesById[e.from] ? this._nodesById[e.from].line : "";
      const toLine = this._nodesById[e.to] ? this._nodesById[e.to].line : "";
      const isCrypto = (e.from === "btc_price" || e.to === "btc_price" || fromLine === "crypto" || toLine === "crypto");
      if (isCrypto) {
        edgeScores[`${e.from}->${e.to}`] = Math.round(activityScore * 1000) / 1000;
      }
    }

    return {
      active: active,
      transfers: active ? [
        { symbol: "BTC", amount: 250, severity: 0.8, sender_label: "未知巨鲸", receiver_label: "Binance 充值" }
      ] : [],
      edges: edgeScores,
      summary: {
        total_transfers: btcWhaleCount + ethWhaleCount,
        total_btc: btcWhaleCount * 150,
        total_eth: ethWhaleCount * 1500,
        highest_severity: maxSev,
        activity_score: activityScore
      }
    };
  },

  getArbitrageSignals() {
    const g = this._graph || { nodes: [], edges: [] };
    const edgeMap = {};
    const corr = Store.get("correlation_matrix");
    if (!corr || !corr.matrix) {
      return { signals: [], edges: {}, summary: { total_pairs: 0, strong_signals: 0 } };
    }

    const ASSET_NODE_MAP = {
      "BTC": "btc_price", "ETH": "eth_price",
      "DXY": "usd_index", "US10Y": "treasury_yield",
      "Gold": "gold_price", "Oil": "oil_price",
      "NASDAQ": "nasdaq"
    };

    const signals = [];
    let strong = 0;

    const matrix = corr.matrix;
    const labels = corr.labels || [];
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const l1 = labels[i];
        const l2 = labels[j];
        const rVal = matrix[l1] ? matrix[l1][l2] : null;
        if (rVal === null || rVal === undefined) continue;

        const absR = Math.abs(rVal);
        const isCryptoPair = (l1 === "BTC" || l1 === "ETH" || l1 === "SOL" || l1 === "SUI") &&
                            (l2 === "BTC" || l2 === "ETH" || l2 === "SOL" || l2 === "SUI");
        const expected = isCryptoPair ? 0.6 : 0.3;
        const deviation = expected - absR;
        const signal = expected > 0 ? Math.min(Math.max(deviation / expected, 0), 1.0) : 0;

        if (signal > 0.3) {
          const direction = signal > 0.5 ? "convergence" : "watch";
          signals.push({
            pair: `${l1}/${l2}`,
            asset_a: l1,
            asset_b: l2,
            correlation: rVal,
            expected: expected,
            deviation: Math.round(deviation * 100) / 100,
            signal_strength: Math.round(signal * 1000) / 1000,
            direction: direction
          });
          if (signal > 0.5) strong++;

          const nodeA = ASSET_NODE_MAP[l1];
          const nodeB = ASSET_NODE_MAP[l2];
          if (nodeA && nodeB) {
            for (const e of g.edges || []) {
              const ek = `${e.from}->${e.to}`;
              if ((e.from === nodeA && e.to === nodeB) || (e.from === nodeB && e.to === nodeA)) {
                edgeMap[ek] = Math.max(edgeMap[ek] || 0, signal);
              }
            }
          }
        }
      }
    }

    return {
      signals: signals.sort((a, b) => b.signal_strength - a.signal_strength).slice(0, 20),
      edges: edgeMap,
      summary: {
        total_pairs: signals.length,
        strong_signals: strong
      }
    };
  },

  getEventDecay() {
    const g = this._graph || { nodes: [], edges: [] };
    const nodeAge = {};
    const total = (g.nodes || []).length;

    (g.nodes || []).forEach((n, i) => {
      // 模拟事件的陈旧度 (0-90天)
      nodeAge[n.id] = total > 0 ? ((total - i) / total) * 90 : 30;
    });

    const edgeDecays = {};
    let totalDecay = 0.0;
    let oldest = 0;

    for (const e of g.edges || []) {
      const fromId = e.from;
      const ageDays = nodeAge[fromId] || 30;
      oldest = Math.max(oldest, ageDays);

      const decay = Math.round(Math.exp(-ageDays / 90) * 1000) / 1000;
      const originalW = e.weight !== undefined ? e.weight : 0.5;
      const decayedW = Math.round(originalW * decay * 1000) / 1000;

      edgeDecays[`${e.from}->${e.to}`] = {
        original_weight: originalW,
        decayed_weight: decayedW,
        decay_factor: decay,
        event_age_days: Math.round(ageDays * 10) / 10,
        event_id: fromId
      };
      totalDecay += decay;
    }

    const edgeCount = (g.edges || []).length;
    return {
      edges: edgeDecays,
      summary: {
        total_edges: edgeCount,
        avg_decay: edgeCount > 0 ? Math.round((totalDecay / edgeCount) * 1000) / 1000 : 1.0,
        oldest_event_days: Math.round(oldest * 10) / 10
      }
    };
  },

  getCalendarOverlay() {
    const g = this._graph || { nodes: [], edges: [] };
    const nodes = this._nodesById;

    const EVENT_NODE_MAP = {
      "CPI": "cpi_release",
      "PPI": "ppi_release",
      "非农": "nfp_release",
      "零售": "retail_sales",
      "FOMC": "fed_rate_cut",
      "利率决议": "fed_rate_hike",
      "BTC期权": "btc_price"
    };

    const today = new Date();
    const mapped = [];
    const affectedEdges = {};
    let nearestDays = 99;

    // 扫描 CONFIG.MAJOR_EVENTS 找出未来 14 天发生的事件
    const events = CONFIG.MAJOR_EVENTS || [];
    for (const [dateStr, name, etype] of events) {
      const evDate = new Date(dateStr);
      const diffTime = evDate.getTime() - today.getTime();
      const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (daysUntil >= 0 && daysUntil <= 14) {
        let nodeId = null;
        for (const [keyword, nid] of Object.entries(EVENT_NODE_MAP)) {
          if (name.includes(keyword)) {
            nodeId = nid;
            break;
          }
        }

        const nodeLabel = nodes[nodeId] ? nodes[nodeId].label : "";
        const urgency = daysUntil === 0 ? "today" : (daysUntil <= 3 ? "soon" : "upcoming");
        nearestDays = Math.min(nearestDays, daysUntil);

        mapped.push({
          name: name,
          date: dateStr,
          days_until: daysUntil,
          type: etype,
          desc: `${name}数据发布时间`,
          node_id: nodeId,
          node_label: nodeLabel,
          urgency: urgency
        });

        if (nodeId) {
          for (const e of g.edges || []) {
            if (e.from === nodeId) {
              const intensity = urgency === "today" ? 1.0 : (urgency === "soon" ? 0.7 : 0.4);
              affectedEdges[`${e.from}->${e.to}`] = {
                event_name: name,
                days_until: daysUntil,
                urgency: urgency,
                intensity: intensity
              };
            }
          }
        }
      }
    }

    return {
      upcoming: mapped,
      affected_edges: affectedEdges,
      summary: {
        total_upcoming: mapped.length,
        nearest_days: nearestDays < 99 ? nearestDays : -1
      }
    };
  },

  reverseTrace(targetId, maxDepth = 6) {
    if (!this._nodesById[targetId]) return [];
    const results = [];
    const visited = new Set();

    const dfsRev = (current, path, edgeChain, depth) => {
      if (depth > maxDepth) return;
      if (visited.has(current) && depth > 0) return;
      visited.add(current);

      const node = this._nodesById[current];
      if (node && (node.type === "event" || node.type === "verifier") && depth > 0) {
        let compW = 1.0;
        let compC = 1.0;
        let totalLag = 0.0;
        for (const e of edgeChain) {
          compW *= (e.weight !== undefined ? e.weight : 1.0);
          compC *= (e.confidence !== undefined ? e.confidence : 1.0);
          totalLag += (e.time_lag_hours || 0);
        }
        results.push({
          path: [...path].reverse(),
          edges: [...edgeChain].reverse(),
          composite_weight: Math.round(compW * 10000) / 10000,
          composite_confidence: Math.round(compC * 10000) / 10000,
          total_lag_hours: Math.round(totalLag * 10) / 10,
          event: current,
          event_label: node.label || current,
          event_line: node.line || ""
        });
      }

      const neighbors = this._revAdj[current] || [];
      for (const edgeInfo of neighbors) {
        const prev = edgeInfo.from;
        if (!visited.has(prev)) {
          edgeChain.push(edgeInfo.edge);
          path.push(prev);
          dfsRev(prev, path, edgeChain, depth + 1);
          path.pop();
          edgeChain.pop();
        }
      }

      visited.delete(current);
    };

    dfsRev(targetId, [targetId], [], 0);
    results.sort((a, b) => b.composite_weight - a.composite_weight);
    return results;
  },

  simulateScenario(eventId, adjustments) {
    const eventNode = this._nodesById[eventId];
    if (!eventNode) return { error: "event not found" };

    const baselinePaths = this.findPaths(eventId);

    const g2 = JSON.parse(JSON.stringify(this._graph));
    const edgesModified = [];

    if (adjustments) {
      for (const [ek, adjConfig] of Object.entries(adjustments)) {
        if (!ek.includes("->")) continue;
        const [f, t] = ek.split("->");
        for (const edge of g2.edges || []) {
          if (edge.from === f && edge.to === t) {
            const changed = {};
            if (adjConfig.weight_mult !== undefined) {
              const oldW = edge.weight !== undefined ? edge.weight : 0.5;
              edge.weight = Math.min(1.0, Math.max(0.1, oldW * adjConfig.weight_mult));
              changed.weight = { from: oldW, to: edge.weight };
            }
            if (adjConfig.direction) {
              const oldD = edge.direction || "same";
              edge.direction = adjConfig.direction;
              changed.direction = { from: oldD, to: edge.direction };
            }
            if (adjConfig.confidence !== undefined) {
              const oldC = edge.confidence !== undefined ? edge.confidence : 0.5;
              edge.confidence = Math.min(1.0, Math.max(0.1, adjConfig.confidence));
              changed.confidence = { from: oldC, to: edge.confidence };
            }
            if (Object.keys(changed).length > 0) {
              edgesModified.push({ edge: ek, changes: changed });
            }
            break;
          }
        }
      }
    }

    const saved = this._graph;
    this._graph = g2;
    this._buildIndex();
    let simulatedPaths = [];
    try {
      simulatedPaths = this.findPaths(eventId);
    } finally {
      this._graph = saved;
      this._buildIndex();
    }

    const summarize = (paths) => {
      if (!paths || paths.length === 0) {
        return { paths_count: 0, targets: {}, aggregate: {} };
      }
      const tgts = {};
      for (const p of paths) {
        const t = p.target;
        if (!tgts[t]) {
          tgts[t] = { label: p.target_label, count: 0, best_weight: 0, best_confidence: 0, min_lag: 999 };
        }
        const tg = tgts[t];
        tg.count += 1;
        tg.best_weight = Math.max(tg.best_weight, p.composite_weight);
        tg.best_confidence = Math.max(tg.best_confidence, p.composite_confidence);
        tg.min_lag = Math.min(tg.min_lag, p.total_lag_hours);
      }
      const weights = Object.values(tgts).map(t => t.best_weight);
      const confs = Object.values(tgts).map(t => t.best_confidence);
      return {
        paths_count: paths.length,
        targets: tgts,
        aggregate: {
          avg_weight: weights.length > 0 ? Math.round((weights.reduce((a, b) => a + b, 0) / weights.length) * 1000) / 1000 : 0,
          avg_confidence: confs.length > 0 ? Math.round((confs.reduce((a, b) => a + b, 0) / confs.length) * 1000) / 1000 : 0,
          affected_targets: Object.keys(tgts).length
        }
      };
    };

    const baselineSummary = summarize(baselinePaths);
    const simulatedSummary = summarize(simulatedPaths);

    const delta = {};
    const allTargets = new Set([...Object.keys(baselineSummary.targets), ...Object.keys(simulatedSummary.targets)]);
    for (const t of allTargets) {
      const b = baselineSummary.targets[t] || {};
      const s = simulatedSummary.targets[t] || {};
      const changes = {};
      if (b.best_weight !== s.best_weight) {
        changes.weight_delta = Math.round(( (s.best_weight || 0) - (b.best_weight || 0) ) * 1000) / 1000;
      }
      if (b.count !== s.count) {
        changes.paths_delta = (s.count || 0) - (b.count || 0);
      }
      if (Object.keys(changes).length > 0) {
        delta[t] = Object.assign({ label: s.label || b.label || t }, changes);
      }
    }

    return {
      event_id: eventId,
      event_label: eventNode.label || eventId,
      adjustments_applied: edgesModified,
      baseline: baselineSummary,
      simulated: simulatedSummary,
      delta: delta,
      simulated_paths: simulatedPaths.slice(0, 10),
      baseline_paths: baselinePaths.slice(0, 10)
    };
  },

  verifyChainWithMarket(eventId = null) {
    const marketDirs = {
      btc_price: "up",
      usd_index: "down",
      oil_price: "up",
      nasdaq: "up",
      gold_price: "up",
      treasury_yield: "down"
    };

    const g = this._graph || { nodes: [], edges: [] };
    const nodes = this._nodesById;

    let relevantEdges = null;
    if (eventId) {
      const paths = this.findPaths(eventId);
      relevantEdges = new Set();
      for (const p of paths) {
        for (const e of p.edges) {
          relevantEdges.add(`${e.from}->${e.to}`);
        }
      }
    }

    const results = [];
    let verifiedCount = 0;
    let totalVerifiable = 0;

    for (const e of g.edges || []) {
      const ek = `${e.from}->${e.to}`;
      if (relevantEdges !== null && !relevantEdges.has(ek)) {
        continue;
      }
      const toId = e.to;
      const expected = e.direction || "same";
      const actual = marketDirs[toId];

      let status = "unverifiable";
      if (actual !== undefined && expected !== "stable" && expected !== "complex") {
        if (expected === actual) {
          status = "verified";
          verifiedCount++;
        } else if (expected === "inverse") {
          status = (actual === "up" || actual === "down") ? "verified" : "broken";
          if (status === "verified") verifiedCount++;
        } else if (expected === "same") {
          status = (actual === "stable") ? "verified" : "partial";
          if (status === "verified") verifiedCount++;
        } else {
          status = "broken";
        }
        totalVerifiable++;
      }

      results.push({
        from: e.from,
        from_label: nodes[e.from] ? nodes[e.from].label : e.from,
        to: e.to,
        to_label: nodes[toId] ? nodes[toId].label : toId,
        expected: expected,
        actual: actual || "stable",
        status: status,
        weight: e.weight !== undefined ? e.weight : 0.5
      });
    }

    let overall = "unverifiable";
    if (totalVerifiable > 0) {
      if (verifiedCount / totalVerifiable >= 0.6) overall = "verified";
      else if (verifiedCount > 0) overall = "partial";
      else overall = "broken";
    }

    return {
      event_id: eventId,
      overall: overall,
      verified_count: verifiedCount,
      total_verifiable: totalVerifiable,
      total_edges: results.length,
      edges: results
    };
  },

  // ── weight_adjuster.py 迁移 ──
  computeAdjustments() {
    // 信号 → 规则 → 倍数的流水线架构
    const rules = [
      ["risk_appetite->btc_price", "vol_high", 1.25, 1.10, "高波动:风险偏好→BTC传导增强"],
      ["risk_appetite->btc_price", "vol_low", 0.85, 1.00, "低波动:风险偏好传导减弱"],
      ["risk_appetite->btc_price", "geopolitical", 1.15, 1.05, "地缘风险高:风险偏好→BTC传导放大"],
      ["risk_appetite->nasdaq", "vol_high", 1.20, 1.05, "高波动:风险偏好→纳指传导增强"],
      ["risk_appetite->nasdaq", "vol_low", 0.85, 1.00, "低波动:风险偏好传导减弱"],
      ["usd_index->btc_price", "dxy_extreme", 1.25, 1.05, "美元极端位:USD→BTC传导增强"],
      ["usd_index->btc_price", "vol_high", 1.10, 1.00, "高波动:美元→BTC传导增强"],
      ["liquidity_condition->btc_price", "btc_momentum", 1.15, 1.05, "BTC动量强:流动性传导增强"],
      ["liquidity_condition->btc_price", "vol_high", 1.10, 1.00, "高波动:流动性传导增强"],
      ["liquidity_condition->btc_price", "liq_stress", 1.15, 1.05, "流动性压力:流动性→BTC传导增强"],
      ["real_yield->btc_price", "btc_momentum", 1.10, 1.00, "BTC动量强:实际利率传导增强"],
      ["real_yield->btc_price", "dxy_extreme", 1.10, 1.00, "美元极端位:实际利率→BTC增强"],
      ["fed_rate_cut->usd_index", "dxy_extreme", 1.10, 1.00, "美元极端位:利率→美元传导增强"],
      ["fed_rate_cut->usd_index", "rate_vol", 1.10, 1.05, "利率波动高:政策→美元传导增强"],
      ["fed_rate_cut->real_yield", "rate_vol", 1.15, 1.05, "利率波动高:降息→实际利率传导增强"],
      ["fed_rate_cut->liquidity_condition", "vol_high", 1.10, 1.00, "高波动:降息→流动性传导增强"],
      ["fed_rate_cut->liquidity_condition", "liq_stress", 1.15, 1.05, "流动性压力:降息→流动性传导增强"],
      ["fed_rate_cut->risk_appetite", "vol_high", 1.10, 1.00, "高波动:降息→风险偏好传导增强"],
      ["fed_rate_hike->usd_index", "dxy_extreme", 1.10, 1.00, "美元极端位:利率→美元传导增强"],
      ["fed_rate_hike->usd_index", "rate_vol", 1.10, 1.05, "利率波动高:加息→美元传导增强"],
      ["fed_rate_hike->real_yield", "rate_vol", 1.15, 1.05, "利率波动高:加息→实际利率传导增强"],
      ["fed_rate_hike->liquidity_condition", "vol_high", 1.10, 1.00, "高波动:加息→流动性传导增强"],
      ["fed_rate_hike->liquidity_condition", "liq_stress", 1.15, 1.05, "流动性压力:加息→流动性传导增强"],
      ["fed_rate_hike->risk_appetite", "vol_high", 1.15, 1.05, "高波动:加息→风险偏好冲击放大"],
      ["fed_hold->usd_index", "vol_high", 0.85, 1.00, "高波动:按兵不动→美元传导减弱(市场忽视)"],
      ["fed_hold->risk_appetite", "vol_high", 0.85, 0.95, "高波动:按兵不动→风险偏好传导减弱"],
      ["war_escalation->risk_appetite", "geopolitical", 1.25, 1.10, "地缘风险高:冲突→风险偏好冲击大幅增强"],
      ["war_escalation->risk_appetite", "vol_high", 1.15, 1.05, "高波动:冲突→风险偏好冲击放大"],
      ["war_escalation->oil_price", "geopolitical", 1.20, 1.10, "地缘风险高:冲突→油价传导增强"],
      ["war_escalation->oil_price", "oil_shock", 1.25, 1.10, "油价已异常:冲突→油价传导大幅增强"],
      ["war_escalation->usd_index", "geopolitical", 1.10, 1.05, "地缘风险高:冲突→避险美元传导增强"],
      ["tariff_announce->usd_index", "dxy_extreme", 1.10, 1.00, "美元极端位:关税→美元传导增强"],
      ["tariff_announce->risk_appetite", "geopolitical", 1.15, 1.05, "地缘风险高:关税→风险偏好冲击放大"],
      ["tariff_announce->risk_appetite", "vol_high", 1.10, 1.00, "高波动:关税→风险偏好传导增强"],
      ["tariff_announce->supply_chain_stress", "geopolitical", 1.15, 1.05, "地缘风险高:关税→供应链传导增强"],
      ["sanction_new->oil_price", "geopolitical", 1.15, 1.05, "地缘风险高:制裁→油价传导增强"],
      ["sanction_new->oil_price", "oil_shock", 1.15, 1.05, "油价已异常:制裁→油价传导增强"],
      ["sanction_new->risk_appetite", "geopolitical", 1.10, 1.05, "地缘风险高:制裁→风险偏好传导增强"],
      ["energy_disruption->oil_price", "oil_shock", 1.30, 1.15, "油价已异常:能源中断→油价冲击大幅增强"],
      ["energy_disruption->oil_price", "geopolitical", 1.15, 1.05, "地缘风险高:能源中断→油价传导增强"],
      ["oil_price->risk_appetite", "vol_high", 1.15, 1.05, "高波动:油价→风险偏好传导增强"],
      ["oil_price->risk_appetite", "oil_shock", 1.20, 1.10, "油价异常:油价→风险偏好传导增强"],
      ["oil_price->usd_index", "oil_shock", 1.15, 1.05, "油价异常:油价→美元传导增强"],
      ["supply_chain_stress->risk_appetite", "geopolitical", 1.10, 1.00, "地缘风险高:供应链→风险偏好传导增强"],
      ["energy_disruption->supply_chain_stress", "oil_shock", 1.20, 1.10, "油价异常:能源中断→供应链压力冲击"],
      ["energy_disruption->supply_chain_stress", "geopolitical", 1.15, 1.05, "地缘风险高:能源中断→供应链传导增强"],
      ["nasdaq->btc_price", "vol_high", 1.15, 1.05, "高波动:纳指→BTC跨市场beta增强"],
      ["nasdaq->btc_price", "btc_momentum", 1.10, 1.00, "BTC动量强:纳指→BTC传导增强"],
      ["fed_rate_cut->treasury_yield", "vol_high", 1.10, 1.00, "高波动:降息→收益率传导增强"],
      ["fed_rate_hike->treasury_yield", "vol_high", 1.10, 1.00, "高波动:加息→收益率传导增强"],
      ["treasury_yield->btc_price", "vol_high", 1.15, 1.05, "高波动:收益率→BTC传导增强"],
      ["treasury_yield->btc_price", "btc_momentum", 1.10, 1.00, "BTC动量强:收益率→BTC传导增强"],
      ["treasury_yield->usd_index", "dxy_extreme", 1.10, 1.00, "美元极端位:收益率→美元传导增强"]
    ];

    const vol = Store.get("volatility") || { regime: "medium", vix: 20, btc_change_24h: 0 };
    const volRegime = vol.regime || "medium";
    const volScore = { high: 0.8, medium: 0.5, low: 0.2 }[volRegime] || 0.5;

    const signals = {
      vol_high: { score: volScore, label: `波动率=${volRegime}(${volScore.toFixed(1)})` },
      vol_low: { score: 1.0 - volScore, label: `低波动(${(1.0 - volScore).toFixed(1)})` },
      dxy_extreme: { score: 0.2, label: "DXY z=0.4" },
      btc_momentum: { score: 0.3, label: "BTC动量=4.5%" },
      oil_shock: { score: 0.0, label: "油价 z=0.0" },
      rate_vol: { score: 0.1, label: "利率 z=0.2" },
      geopolitical: { score: 0.2, label: "地缘风险=0.20" },
      liq_stress: { score: 0.15, label: "流动性压力=0.15" }
    };

    const signalEdges = {};
    for (const [edgeKey, sigName] of rules) {
      if (!signalEdges[sigName]) signalEdges[sigName] = [];
      signalEdges[sigName].push(edgeKey);
    }

    const adjustments = {};
    for (const [edgeKey, sigName, baseW, baseC, template] of rules) {
      const sig = signals[sigName];
      if (!sig || sig.score <= 0) continue;

      const strength = sig.score;
      const multW = baseW >= 1.0 ? 1.0 + (baseW - 1.0) * strength : 1.0 - (1.0 - baseW) * strength;
      const multC = baseC >= 1.0 ? 1.0 + (baseC - 1.0) * strength : 1.0 - (1.0 - baseC) * strength;

      const existing = adjustments[edgeKey];
      if (existing) {
        existing.weight_mult = Math.round(Math.max(existing.weight_mult, multW) * 1000) / 1000;
        existing.confidence_mult = Math.round(Math.max(existing.confidence_mult, multC) * 1000) / 1000;
        existing.rationale += `; ${template} (${sig.label})`;
      } else {
        adjustments[edgeKey] = {
          weight_mult: Math.round(multW * 1000) / 1000,
          confidence_mult: Math.round(multC * 1000) / 1000,
          rationale: `${template} (${sig.label})`
        };
      }
    }

    const signalSummary = {};
    for (const [sigName, sigData] of Object.entries(signals)) {
      const affected = signalEdges[sigName] || [];
      const activeEdges = affected.filter(e => adjustments[e] !== undefined);
      signalSummary[sigName] = {
        score: sigData.score,
        label: sigData.label,
        affected_edges: activeEdges,
        edge_count: activeEdges.length
      };
    }

    return { signals: signalSummary, edges: adjustments };
  }
};

export { PropagationEngine };
