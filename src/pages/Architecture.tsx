import { useEffect } from 'react';
import { Link } from 'react-router-dom';

const PAGE_STYLES = `
  .arch-page {
    min-height: 100vh;
    background: #0a0e1a;
    color: #e0e6f0;
    font-family: 'Inter', 'SF Mono', 'Fira Code', monospace, sans-serif;
    padding: 0;
    margin: 0;
  }

  /* ── Header ── */
  .arch-header {
    text-align: center;
    padding: 48px 24px 32px;
    position: relative;
  }
  .arch-header::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 60%;
    height: 1px;
    background: linear-gradient(90deg, transparent, #00f8ff44, #ff00aa44, transparent);
  }
  .arch-title {
    font-size: 2.4rem;
    font-weight: 700;
    letter-spacing: 0.15em;
    background: linear-gradient(135deg, #00f8ff 0%, #ff00aa 50%, #00ff88 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin: 0 0 8px;
    text-shadow: 0 0 40px #00f8ff33;
  }
  .arch-subtitle {
    font-size: 0.95rem;
    color: #8892a8;
    letter-spacing: 0.3em;
    margin: 0;
  }

  /* ── Nav ── */
  .arch-nav {
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 20px 24px 28px;
  }
  .arch-nav a {
    padding: 8px 20px;
    border-radius: 6px;
    font-size: 0.82rem;
    letter-spacing: 0.08em;
    text-decoration: none;
    color: #8892a8;
    border: 1px solid transparent;
    transition: all 0.25s ease;
  }
  .arch-nav a:hover {
    color: #00f8ff;
    border-color: #00f8ff33;
    background: #00f8ff08;
  }
  .arch-nav a.active {
    color: #00f8ff;
    border-color: #00f8ff55;
    background: linear-gradient(135deg, #00f8ff12 0%, #ff00aa08 100%);
    box-shadow: 0 0 20px #00f8ff15, inset 0 0 20px #00f8ff08;
  }

  /* ── Container ── */
  .arch-container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 24px 80px;
  }

  /* ── Glass Card ── */
  .glass-card {
    background: linear-gradient(135deg, #ffffff06 0%, #ffffff03 100%);
    border: 1px solid #ffffff10;
    border-radius: 16px;
    padding: 32px;
    margin-bottom: 32px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    position: relative;
    overflow: hidden;
  }
  .glass-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(90deg, transparent, #ffffff18, transparent);
  }

  /* ── Section Title ── */
  .section-title {
    font-size: 1.15rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    margin: 0 0 24px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .section-title .icon {
    font-size: 1.1rem;
  }
  .section-title .cyan { color: #00f8ff; }
  .section-title .magenta { color: #ff00aa; }
  .section-title .green { color: #00ff88; }

  /* ── Pipeline ── */
  .pipeline {
    display: flex;
    align-items: stretch;
    gap: 0;
    overflow-x: auto;
    padding: 8px 0;
  }
  .pipeline-stage {
    flex: 1;
    min-width: 150px;
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
  }
  .pipeline-box {
    border: 1px solid;
    border-radius: 12px;
    padding: 18px 14px;
    text-align: center;
    width: 100%;
    min-height: 140px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    position: relative;
    background: #0d111f;
  }
  .pipeline-box.cyan-border {
    border-color: #00f8ff44;
    box-shadow: 0 0 25px #00f8ff10, inset 0 0 25px #00f8ff06;
  }
  .pipeline-box.magenta-border {
    border-color: #ff00aa44;
    box-shadow: 0 0 25px #ff00aa10, inset 0 0 25px #ff00aa06;
  }
  .pipeline-box.green-border {
    border-color: #00ff8844;
    box-shadow: 0 0 25px #00ff8810, inset 0 0 25px #00ff8806;
  }
  .pipeline-box.yellow-border {
    border-color: #ffaa0044;
    box-shadow: 0 0 25px #ffaa0010, inset 0 0 25px #ffaa0006;
  }
  .pipeline-box-title {
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    margin-bottom: 12px;
    text-transform: uppercase;
  }
  .pipeline-box-title.cyan { color: #00f8ff; }
  .pipeline-box-title.magenta { color: #ff00aa; }
  .pipeline-box-title.green { color: #00ff88; }
  .pipeline-box-title.yellow { color: #ffaa00; }
  .pipeline-tag {
    display: inline-block;
    font-size: 0.7rem;
    padding: 3px 8px;
    border-radius: 4px;
    margin: 2px;
    letter-spacing: 0.04em;
  }
  .pipeline-tag.cyan {
    background: #00f8ff12;
    color: #00f8ffcc;
    border: 1px solid #00f8ff22;
  }
  .pipeline-tag.magenta {
    background: #ff00aa12;
    color: #ff00aacc;
    border: 1px solid #ff00aa22;
  }
  .pipeline-tag.green {
    background: #00ff8812;
    color: #00ff88cc;
    border: 1px solid #00ff8822;
  }
  .pipeline-tag.yellow {
    background: #ffaa0012;
    color: #ffaa00cc;
    border: 1px solid #ffaa0022;
  }
  .pipeline-desc {
    font-size: 0.72rem;
    color: #8892a8;
    margin-top: 8px;
    line-height: 1.5;
  }

  /* ── Pipeline Arrow ── */
  .pipeline-arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    flex-shrink: 0;
    position: relative;
  }
  .pipeline-arrow::before {
    content: '';
    width: 20px;
    height: 2px;
    background: linear-gradient(90deg, #00f8ff66, #ff00aa66);
  }
  .pipeline-arrow::after {
    content: '';
    position: absolute;
    right: 4px;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
    border-left: 7px solid #ff00aa66;
  }

  /* ── Scoring Grid ── */
  .scoring-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  @media (max-width: 700px) {
    .scoring-grid { grid-template-columns: 1fr; }
    .pipeline { flex-direction: column; align-items: center; }
    .pipeline-arrow {
      transform: rotate(90deg);
      min-height: 30px;
      min-width: unset;
    }
  }
  .scoring-card {
    background: #0d111f;
    border: 1px solid #ffffff0d;
    border-radius: 12px;
    padding: 24px 20px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .scoring-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    border-radius: 12px 12px 0 0;
  }
  .scoring-card.fast::before { background: linear-gradient(90deg, #00f8ff, #00f8ff88); }
  .scoring-card.medium::before { background: linear-gradient(90deg, #ffaa00, #ffaa0088); }
  .scoring-card.slow::before { background: linear-gradient(90deg, #ff00aa, #ff00aa88); }
  .scoring-label {
    font-size: 0.72rem;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .scoring-label.cyan { color: #00f8ff; }
  .scoring-label.yellow { color: #ffaa00; }
  .scoring-label.magenta { color: #ff00aa; }
  .scoring-tau {
    font-size: 1.6rem;
    font-weight: 700;
    margin: 8px 0 4px;
  }
  .scoring-tau.cyan { color: #00f8ff; }
  .scoring-tau.yellow { color: #ffaa00; }
  .scoring-tau.magenta { color: #ff00aa; }
  .scoring-unit {
    font-size: 0.75rem;
    color: #8892a8;
  }
  .scoring-desc {
    font-size: 0.72rem;
    color: #6b7590;
    margin-top: 10px;
    line-height: 1.5;
  }
  .scoring-formula {
    margin-top: 20px;
    padding: 16px 20px;
    background: #0d111f;
    border: 1px solid #00f8ff18;
    border-radius: 10px;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.82rem;
    color: #00f8ffcc;
    text-align: center;
    letter-spacing: 0.04em;
  }

  /* ── Propagation ── */
  .prop-visual {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
    padding: 20px 0;
  }
  .prop-node {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-size: 0.68rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    border: 1px solid;
    position: relative;
  }
  .prop-node.src {
    border-color: #ff00aa55;
    background: #ff00aa10;
    color: #ff00aa;
    box-shadow: 0 0 30px #ff00aa18;
  }
  .prop-node.mid {
    border-color: #ffaa0055;
    background: #ffaa0010;
    color: #ffaa00;
    box-shadow: 0 0 30px #ffaa0018;
  }
  .prop-node.tgt {
    border-color: #00f8ff55;
    background: #00f8ff10;
    color: #00f8ff;
    box-shadow: 0 0 30px #00f8ff18;
  }
  .prop-edge {
    font-size: 1.2rem;
    color: #ffffff30;
  }
  .prop-caption {
    font-size: 0.78rem;
    color: #8892a8;
    text-align: center;
    margin-top: 12px;
    line-height: 1.6;
  }

  /* ── Tech Stack ── */
  .tech-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: center;
  }
  .tech-chip {
    padding: 10px 22px;
    border-radius: 8px;
    font-size: 0.78rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    border: 1px solid #ffffff12;
    background: #0d111f;
    color: #e0e6f0;
    transition: all 0.3s ease;
  }
  .tech-chip:hover {
    border-color: #00f8ff44;
    box-shadow: 0 0 20px #00f8ff12;
    color: #00f8ff;
    transform: translateY(-2px);
  }

  /* ── Footer ── */
  .arch-footer {
    text-align: center;
    padding: 32px 24px;
    font-size: 0.7rem;
    color: #4a5568;
    letter-spacing: 0.08em;
    border-top: 1px solid #ffffff08;
  }
`;

export default function Architecture() {
  useEffect(() => {
    const id = 'arch-page-styles';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = PAGE_STYLES;
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);

  return (
    <div className="arch-page">
      {/* ── Header ── */}
      <header className="arch-header">
        <h1 className="arch-title">◊ ARCHITECTURE</h1>
        <p className="arch-subtitle">业务知识图谱 · 系统架构全景</p>
      </header>

      {/* ── Navigation ── */}
      <nav className="arch-nav">
        <Link to="/">Dashboard</Link>
        <Link to="/propagation">Propagation</Link>
        <Link to="/architecture" className="active">Architecture</Link>
      </nav>

      <div className="arch-container">
        {/* ═══════════════ Pipeline ═══════════════ */}
        <section className="glass-card">
          <h2 className="section-title">
            <span className="icon">⬡</span>
            <span className="cyan">数据处理管线</span>
          </h2>

          <div className="pipeline">
            {/* Stage 1 – Data Sources */}
            <div className="pipeline-stage">
              <div className="pipeline-box cyan-border">
                <div className="pipeline-box-title cyan">数据源</div>
                <div>
                  {['Binance', 'CoinGecko', 'Yahoo', 'FRED', 'blockchain.info', 'Etherscan', 'RSS'].map((s) => (
                    <span key={s} className="pipeline-tag cyan">{s}</span>
                  ))}
                </div>
                <div className="pipeline-desc">多源实时数据采集</div>
              </div>
            </div>

            <div className="pipeline-arrow" />

            {/* Stage 2 – Scanner Engine */}
            <div className="pipeline-stage">
              <div className="pipeline-box magenta-border">
                <div className="pipeline-box-title magenta">扫描引擎</div>
                <div>
                  {['crypto', 'onchain', 'derivatives', 'macro', 'sentiment', 'narrative'].map((s) => (
                    <span key={s} className="pipeline-tag magenta">{s}</span>
                  ))}
                </div>
                <div className="pipeline-desc">六维信号扫描矩阵</div>
              </div>
            </div>

            <div className="pipeline-arrow" />

            {/* Stage 3 – Event Window */}
            <div className="pipeline-stage">
              <div className="pipeline-box green-border">
                <div className="pipeline-box-title green">事件窗口</div>
                <div>
                  <span className="pipeline-tag green">fast</span>
                  <span className="pipeline-tag green">medium</span>
                  <span className="pipeline-tag green">slow</span>
                </div>
                <div className="pipeline-desc">三窗口时间衰减评分</div>
              </div>
            </div>

            <div className="pipeline-arrow" />

            {/* Stage 4 – AI Evaluation */}
            <div className="pipeline-stage">
              <div className="pipeline-box yellow-border">
                <div className="pipeline-box-title yellow">AI 研判</div>
                <div>
                  <span className="pipeline-tag yellow">DeepSeek</span>
                </div>
                <div className="pipeline-desc">DeepSeek 信号评估</div>
              </div>
            </div>

            <div className="pipeline-arrow" />

            {/* Stage 5 – Push Notifications */}
            <div className="pipeline-stage">
              <div className="pipeline-box cyan-border">
                <div className="pipeline-box-title cyan">推送通知</div>
                <div>
                  <span className="pipeline-tag cyan">ServerChan</span>
                </div>
                <div className="pipeline-desc">ServerChan 微信推送</div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════ Scoring Engine ═══════════════ */}
        <section className="glass-card">
          <h2 className="section-title">
            <span className="icon">◈</span>
            <span className="magenta">评分引擎详解</span>
          </h2>

          <div className="scoring-grid">
            {/* Fast */}
            <div className="scoring-card fast">
              <div className="scoring-label cyan">FAST WINDOW</div>
              <div className="scoring-tau cyan">τ = 1800s</div>
              <div className="scoring-unit">30 min half-life</div>
              <div className="scoring-desc">
                捕捉闪电级别的市场事件，高频信号在 30 分钟内衰减至 50%。适用于突发行情与短线异动。
              </div>
            </div>
            {/* Medium */}
            <div className="scoring-card medium">
              <div className="scoring-label yellow">MEDIUM WINDOW</div>
              <div className="scoring-tau yellow">τ = 14400s</div>
              <div className="scoring-unit">4 hr half-life</div>
              <div className="scoring-desc">
                中频事件窗口，信号在 4 小时衰减至 50%。覆盖日内趋势级别的信号变化与情绪传导。
              </div>
            </div>
            {/* Slow */}
            <div className="scoring-card slow">
              <div className="scoring-label magenta">SLOW WINDOW</div>
              <div className="scoring-tau magenta">τ = 172800s</div>
              <div className="scoring-unit">48 hr half-life</div>
              <div className="scoring-desc">
                低频宏观窗口，信号 48 小时半衰。追踪宏观政策、链上结构性变化等长周期事件。
              </div>
            </div>
          </div>

          <div className="scoring-formula">
            Score(t) = Σ w<sub>i</sub> · e<sup>−(t − t<sub>i</sub>) / τ</sup>
          </div>
        </section>

        {/* ═══════════════ Propagation Graph ═══════════════ */}
        <section className="glass-card">
          <h2 className="section-title">
            <span className="icon">◇</span>
            <span className="green">传导图谱</span>
          </h2>

          <div className="prop-visual">
            <div className="prop-node src">
              <span style={{ fontSize: '1.2rem' }}>⚡</span>
              <span>BTC</span>
            </div>
            <div className="prop-edge">──▸</div>
            <div className="prop-node mid">
              <span style={{ fontSize: '1.2rem' }}>◈</span>
              <span>ETH</span>
            </div>
            <div className="prop-edge">──▸</div>
            <div className="prop-node tgt">
              <span style={{ fontSize: '1.2rem' }}>◇</span>
              <span>ALT</span>
            </div>
            <div className="prop-edge">──▸</div>
            <div className="prop-node tgt">
              <span style={{ fontSize: '1.2rem' }}>⬡</span>
              <span>DeFi</span>
            </div>
          </div>

          <p className="prop-caption">
            基于 Pearson 相关性与 Granger 因果检验构建资产间传导路径。<br />
            节点 = 资产 / 指标，边 = 传导关系（带延迟权重）。<br />
            实时可视化市场冲击如何从源头传导至周边资产。
          </p>
        </section>

        {/* ═══════════════ Tech Stack ═══════════════ */}
        <section className="glass-card">
          <h2 className="section-title">
            <span className="icon">⚙</span>
            <span className="cyan">技术栈</span>
          </h2>

          <div className="tech-grid">
            {['React', 'TypeScript', 'Vite', 'Tailwind CSS', 'ECharts'].map((tech) => (
              <span key={tech} className="tech-chip">{tech}</span>
            ))}
          </div>
        </section>
      </div>

      {/* ── Footer ── */}
      <footer className="arch-footer">
        FINANCIAL ALERT SYSTEM · ARCHITECTURE BLUEPRINT · v2.0
      </footer>
    </div>
  );
}
