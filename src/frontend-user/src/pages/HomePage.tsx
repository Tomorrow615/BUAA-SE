import { Link } from "react-router-dom";

import { useAuth } from "../context/AuthContext";

const objectTracks = [
  {
    title: "股票研究",
    state: "已接通",
    description: "已支持任务创建、行情采集、AI 分析、报告展示与聊天问答。",
  },
  {
    title: "公司研究",
    state: "界面已就绪",
    description: "前端流程和入口已预留，后续补公司资料、公告与行业数据链路。",
  },
  {
    title: "商品研究",
    state: "界面已就绪",
    description: "前端结构已具备，后续补行情、供需与周期性数据源。",
  },
];

const featureCards = [
  {
    title: "统一研究入口",
    description: "工作台统一容纳对象选择、模型配置、信息源策略与成果交付选项。",
  },
  {
    title: "报告资产中心",
    description: "任务详情围绕分析结果、报告正文、材料引用和阶段日志组织。",
  },
  {
    title: "AI 协作空间",
    description: "闲聊、数据优先问答、后续追问入口都放在同一套交互框架里。",
  },
];

export function HomePage() {
  const { status } = useAuth();

  return (
    <div className="public-page public-page-home">
      <section className="hero-card hero-card-home">
        <div className="hero-home-grid">
          <div className="hero-home-copy">
            <p className="eyebrow">深度研究平台</p>
            <h1>商业对象智能深度调研分析平台</h1>
            <p className="hero-home-summary">
              以统一工作台承接股票、公司、商品三类研究对象，用数据源、模型能力和报告资产把整个研究流程串起来。
            </p>

            <div className="hero-stat-row">
              <div className="hero-stat-card">
                <strong>3 类</strong>
                <span>研究对象入口</span>
              </div>
              <div className="hero-stat-card">
                <strong>1 条</strong>
                <span>已跑通股票链路</span>
              </div>
              <div className="hero-stat-card">
                <strong>多层</strong>
                <span>后续模型与数据源可扩展</span>
              </div>
            </div>

            <div className="button-row">
              {status === "authenticated" ? (
                <Link className="button-primary" to="/workspace">
                  进入研究工作台
                </Link>
              ) : (
                <Link className="button-primary" to="/login">
                  登录后开始使用
                </Link>
              )}
              <Link className="button-secondary" to="/tasks">
                查看任务中心
              </Link>
              {status === "authenticated" ? (
                <Link className="button-ghost" to="/chat">
                  打开 AI 助理
                </Link>
              ) : (
                <Link className="button-ghost" to="/register">
                  创建用户账号
                </Link>
              )}
            </div>
          </div>

          <div className="hero-home-panel">
            <div className="hero-panel-highlight">
              <span>当前可演示主链路</span>
              <strong>股票研究任务 → 材料采集 → AI 报告</strong>
            </div>

            <div className="hero-panel-track-list">
              {objectTracks.map((item) => (
                <article key={item.title} className="hero-track-card">
                  <div className="hero-track-head">
                    <h2>{item.title}</h2>
                    <span>{item.state}</span>
                  </div>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section-grid feature-grid-home">
        {featureCards.map((item) => (
          <article key={item.title} className="section-card feature-card-home">
            <h2>{item.title}</h2>
            <p>{item.description}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
