import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

const researchEntrances = [
  {
    title: "公司研究",
    description: "企业、行业、公告与经营结构",
    disabled: true,
  },
  {
    title: "股票研究",
    description: "行情、波动、交易与市场表现",
    disabled: false,
  },
  {
    title: "商品研究",
    description: "价格、供需、库存与周期节奏",
    disabled: true,
  },
];

const productCards = [
  {
    title: "研究工作台",
    description: "统一发起研究",
  },
  {
    title: "任务中心",
    description: "集中查看进度",
  },
  {
    title: "报告空间",
    description: "沉淀成果与交付",
  },
  {
    title: "AI 助理",
    description: "继续追问与协作",
  },
];

export function HomePage() {
  const { status } = useAuth();

  return (
    <div className="public-page public-page-home">
      <section className="hero-card hero-card-home hero-card-minimal">
        <div className="hero-home-grid hero-home-grid-compact">
          <div className="hero-home-copy hero-home-copy-compact">
            <p className="eyebrow">DeepSearch</p>
            <h1>商业对象深度研究平台</h1>
            <p className="hero-home-summary">
              为公司、股票、商品提供统一的研究入口、任务流与报告交付。
            </p>

            <div className="button-row">
              {status === "authenticated" ? (
                <Link className="button-primary" to="/workspace">
                  进入工作台
                </Link>
              ) : (
                <Link className="button-primary" to="/login">
                  立即开始
                </Link>
              )}
              <Link className="button-secondary" to="/tasks">
                任务中心
              </Link>
              {status === "authenticated" ? (
                <Link className="button-ghost" to="/chat">
                  AI 助理
                </Link>
              ) : (
                <Link className="button-ghost" to="/register">
                  创建账号
                </Link>
              )}
            </div>
          </div>

          <div className="hero-compact-panel">
            <div className="hero-stat-row hero-stat-row-compact">
              <div className="hero-stat-card">
                <strong>Research</strong>
                <span>Workspace</span>
              </div>
              <div className="hero-stat-card">
                <strong>Tasks</strong>
                <span>Reports</span>
              </div>
              <div className="hero-stat-card">
                <strong>Agent</strong>
                <span>Follow-up</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-entrance-grid">
        {researchEntrances.map((item) => (
          <article key={item.title} className="section-card landing-entrance-card">
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            {item.disabled ? (
              <button type="button" className="button-secondary" disabled>
                进入研究
              </button>
            ) : (
              <Link className="button-secondary" to="/workspace">
                进入研究
              </Link>
            )}
          </article>
        ))}
      </section>

      <section className="section-grid feature-grid-home feature-grid-home-minimal">
        {productCards.map((item) => (
          <article key={item.title} className="section-card feature-card-home feature-card-home-minimal">
            <h2>{item.title}</h2>
            <p>{item.description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
