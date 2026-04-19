import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { StatePanel } from "../components/StatePanel";
import { useAuth } from "../context/AuthContext";
import {
  createResearchTask,
  fetchResearchModels,
  formatDateTime,
  formatObjectType,
  formatReportType,
  formatResearchDepth,
  formatSourceStrategy,
  type ObjectType,
  type ResearchModelOption,
} from "../lib/research";

const OBJECT_BLUEPRINTS: Array<{
  value: ObjectType;
  label: string;
  eyebrow: string;
  state: "ready" | "preview";
  summary: string;
  description: string;
  nameLabel: string;
  namePlaceholder: string;
  goalPlaceholder: string;
}> = [
  {
    value: "STOCK",
    label: "股票",
    eyebrow: "已接通",
    state: "ready",
    summary: "行情采集、分析、报告和任务详情已打通。",
    description: "适合围绕价格走势、波动风险、交易活跃度和阶段结论发起研究。",
    nameLabel: "股票名称或代码",
    namePlaceholder: "如：宁德时代 / 贵州茅台 / 300750 / 600519",
    goalPlaceholder:
      "如：重点关注近一个月价格表现、阶段回撤、交易活跃度和可见风险。",
  },
  {
    value: "COMPANY",
    label: "公司",
    eyebrow: "预留态",
    state: "preview",
    summary: "界面已完整预留，后续补财报、公告、舆情和行业资料链路。",
    description: "适合围绕公司基本面、经营质量、行业位置和事件影响发起研究。",
    nameLabel: "公司名称",
    namePlaceholder: "如：腾讯控股 / 比亚迪 / 苹果公司",
    goalPlaceholder:
      "如：重点梳理近两季经营变化、管理层动作、行业竞争格局与风险点。",
  },
  {
    value: "COMMODITY",
    label: "商品",
    eyebrow: "预留态",
    state: "preview",
    summary: "界面已完整预留，后续补商品行情、供需、库存与周期数据。",
    description: "适合围绕价格趋势、供需结构、库存变化和周期位置发起研究。",
    nameLabel: "商品名称",
    namePlaceholder: "如：黄金 / 原油 / 铜 / 碳酸锂",
    goalPlaceholder:
      "如：重点关注近一个季度价格趋势、供需矛盾、库存变化与宏观驱动因素。",
  },
];

function resolveDefaultModelId(models: ResearchModelOption[]): string {
  const preferredModel = models.find((item) => item.is_default) ?? models[0];
  return preferredModel ? String(preferredModel.id) : "";
}

export function WorkspacePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? null;

  const [selectedObjectType, setSelectedObjectType] = useState<ObjectType>("STOCK");
  const [objectName, setObjectName] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [researchGoal, setResearchGoal] = useState("");
  const [timeRange, setTimeRange] = useState("");
  const [sourceStrategy, setSourceStrategy] = useState("DEFAULT");
  const [researchDepth, setResearchDepth] = useState("STANDARD");
  const [reportType, setReportType] = useState("FULL");
  const [selectedModelId, setSelectedModelId] = useState("");

  const [models, setModels] = useState<ResearchModelOption[]>([]);
  const [modelsError, setModelsError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastModelSyncAt, setLastModelSyncAt] = useState<string | null>(null);

  const activeBlueprint =
    OBJECT_BLUEPRINTS.find((item) => item.value === selectedObjectType) ??
    OBJECT_BLUEPRINTS[0];
  const isReadyObject = activeBlueprint.state === "ready";

  useEffect(() => {
    const token = accessToken;
    if (!token) {
      return;
    }
    const resolvedAccessToken: string = token;

    let cancelled = false;

    async function loadModels() {
      setIsLoadingModels(true);
      setModelsError("");

      try {
        const items = await fetchResearchModels(
          resolvedAccessToken,
          selectedObjectType,
        );
        if (cancelled) {
          return;
        }

        setModels(items);
        setLastModelSyncAt(new Date().toISOString());
        setSelectedModelId((currentValue) => {
          const hasCurrent =
            currentValue &&
            items.some((item) => String(item.id) === currentValue);

          if (hasCurrent) {
            return currentValue;
          }

          return resolveDefaultModelId(items);
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setModels([]);
        setSelectedModelId("");
        setModelsError(
          error instanceof Error
            ? error.message
            : "模型列表加载失败，请稍后重试。",
        );
      } finally {
        if (!cancelled) {
          setIsLoadingModels(false);
        }
      }
    }

    void loadModels();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedObjectType]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessToken) {
      setSubmitError("当前会话不可用，请重新登录。");
      return;
    }

    if (!isReadyObject) {
      setSubmitError("当前对象入口已展示，但后端研究链路仍在建设中。");
      return;
    }

    if (!objectName.trim()) {
      setSubmitError(`请输入${activeBlueprint.nameLabel}。`);
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const createdTask = await createResearchTask(accessToken, {
        object_type: selectedObjectType,
        object_name: objectName.trim(),
        task_title: taskTitle.trim() || undefined,
        research_goal: researchGoal.trim() || undefined,
        time_range: timeRange.trim() || undefined,
        selected_model_id: selectedModelId ? Number(selectedModelId) : undefined,
        source_strategy: sourceStrategy,
        task_params: {
          research_depth: researchDepth,
          report_type: reportType,
          target_domain: selectedObjectType.toLowerCase(),
        },
      });

      navigate(`/tasks/${createdTask.id}`, { replace: true });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "任务创建失败，请稍后重试。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedModel =
    models.find((item) => String(item.id) === selectedModelId) ?? null;
  const canSubmit =
    Boolean(accessToken) &&
    Boolean(objectName.trim()) &&
    !isSubmitting &&
    isReadyObject;

  const deliveryItems = useMemo(
    () => [
      { label: "Markdown 报告", state: "可用" },
      { label: "PDF 导出", state: "即将开放" },
      { label: "Word 导出", state: "即将开放" },
      { label: "引用索引", state: "展示中" },
    ],
    [],
  );

  const collaborationItems = useMemo(
    () => [
      "收藏研究模板",
      "订阅结果提醒",
      "报告追问与追踪",
      "分享给协作成员",
    ],
    [],
  );

  return (
    <div className="page-section">
      <header className="page-title workspace-page-header">
        <div>
          <p className="eyebrow">统一研究工作台</p>
          <h1>统一研究工作台</h1>
          <p>
            同一套界面承接股票、公司、商品三类研究对象。当前股票链路可直接提交，其他对象先按最终形态预留。
          </p>
        </div>

        <div className="workspace-header-actions">
          <div className="workspace-header-stat">
            <strong>{formatDateTime(lastModelSyncAt)}</strong>
            <span>最近模型同步</span>
          </div>
          <div className="button-row button-row-tight">
            <Link className="button-secondary" to="/tasks">
              任务中心
            </Link>
            <Link className="button-ghost" to="/chat">
              打开 AI 助理
            </Link>
          </div>
        </div>
      </header>

      <section className="object-track-grid">
        {OBJECT_BLUEPRINTS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={
              item.value === selectedObjectType
                ? "object-track-card object-track-card-active"
                : "object-track-card"
            }
            onClick={() => {
              setSelectedObjectType(item.value);
              setSubmitError("");
            }}
          >
            <div className="object-track-head">
              <span>{item.eyebrow}</span>
              <strong>{item.label}</strong>
            </div>
            <p>{item.summary}</p>
          </button>
        ))}
      </section>

      <section className="section-grid section-grid-wide workspace-layout">
        <article className="section-card workspace-primary-card">
          <div className="workspace-card-head">
            <div>
              <h2>{activeBlueprint.label}研究任务</h2>
              <p>{activeBlueprint.description}</p>
            </div>
            {!isReadyObject ? (
              <span className="soft-badge soft-badge-warm">后端链路建设中</span>
            ) : (
              <span className="soft-badge soft-badge-cool">当前可提交</span>
            )}
          </div>

          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="field-row">
              <label className="field">
                <span>研究对象</span>
                <input value={formatObjectType(selectedObjectType)} disabled />
              </label>

              <label className="field">
                <span>{activeBlueprint.nameLabel}</span>
                <input
                  value={objectName}
                  onChange={(event) => setObjectName(event.target.value)}
                  placeholder={activeBlueprint.namePlaceholder}
                />
              </label>
            </div>

            <label className="field">
              <span>任务标题</span>
              <input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder={`如：${activeBlueprint.label}重点问题研究（可选）`}
              />
            </label>

            <label className="field">
              <span>研究目标</span>
              <textarea
                value={researchGoal}
                onChange={(event) => setResearchGoal(event.target.value)}
                placeholder={activeBlueprint.goalPlaceholder}
                rows={5}
              />
            </label>

            <div className="field-row field-row-three">
              <label className="field">
                <span>时间范围</span>
                <input
                  value={timeRange}
                  onChange={(event) => setTimeRange(event.target.value)}
                  placeholder="如：近30天 / 近60天 / 近一季度"
                />
              </label>

              <label className="field">
                <span>研究深度</span>
                <select
                  value={researchDepth}
                  onChange={(event) => setResearchDepth(event.target.value)}
                >
                  <option value="QUICK">快速扫描</option>
                  <option value="STANDARD">标准分析</option>
                  <option value="DEEP">深度研究</option>
                </select>
              </label>

              <label className="field">
                <span>报告形式</span>
                <select
                  value={reportType}
                  onChange={(event) => setReportType(event.target.value)}
                >
                  <option value="BRIEF">简版摘要</option>
                  <option value="FULL">完整报告</option>
                </select>
              </label>
            </div>

            <div className="field-row">
              <label className="field">
                <span>信息源策略</span>
                <select
                  value={sourceStrategy}
                  onChange={(event) => setSourceStrategy(event.target.value)}
                >
                  <option value="DEFAULT">智能平衡</option>
                  <option value="OFFICIAL_FIRST">官方优先</option>
                  <option value="NEWS_HEAVY">新闻增强</option>
                </select>
              </label>

              <label className="field">
                <span>研究模型</span>
                <select
                  value={selectedModelId}
                  onChange={(event) => setSelectedModelId(event.target.value)}
                  disabled={isLoadingModels || models.length === 0}
                >
                  {models.length === 0 ? (
                    <option value="">
                      {isLoadingModels ? "正在加载模型..." : "暂无可用模型"}
                    </option>
                  ) : null}

                  {models.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.display_name}
                    </option>
                  ))}
                </select>
                <p className="field-hint">
                  当前入口会优先显示与 {activeBlueprint.label}研究相关的模型。
                </p>
              </label>
            </div>

            {modelsError ? (
              <p className="form-message form-message-error">{modelsError}</p>
            ) : null}

            {!isReadyObject ? (
              <p className="workspace-preview-note">
                这个入口已经按照最终产品界面预留完成，但当前后端仍只支持股票研究闭环。
              </p>
            ) : null}

            {submitError ? (
              <p className="form-message form-message-error">{submitError}</p>
            ) : null}

            <div className="button-row">
              <button
                type="submit"
                className="button-primary"
                disabled={!canSubmit}
              >
                {isReadyObject
                  ? isSubmitting
                    ? "正在创建任务..."
                    : `提交${activeBlueprint.label}研究任务`
                  : `${activeBlueprint.label}链路即将开放`}
              </button>
              <Link className="button-secondary" to="/tasks">
                查看任务中心
              </Link>
              <button type="button" className="button-ghost" disabled>
                保存为模板
              </button>
            </div>
          </form>
        </article>

        <div className="workspace-side-stack">
          <article className="section-card">
            <h2>当前配置概览</h2>
            <dl className="kv-list">
              <div>
                <dt>研究对象</dt>
                <dd>{formatObjectType(selectedObjectType)}</dd>
              </div>
              <div>
                <dt>对象名称</dt>
                <dd>{objectName.trim() || "待填写"}</dd>
              </div>
              <div>
                <dt>研究深度</dt>
                <dd>{formatResearchDepth(researchDepth)}</dd>
              </div>
              <div>
                <dt>报告形式</dt>
                <dd>{formatReportType(reportType)}</dd>
              </div>
              <div>
                <dt>信息源策略</dt>
                <dd>{formatSourceStrategy(sourceStrategy)}</dd>
              </div>
              <div>
                <dt>研究模型</dt>
                <dd>{selectedModel?.display_name || "等待选择"}</dd>
              </div>
            </dl>
          </article>

          <article className="section-card">
            <h2>交付资产包</h2>
            <div className="delivery-grid">
              {deliveryItems.map((item) => (
                <div key={item.label} className="delivery-card">
                  <strong>{item.label}</strong>
                  <span>{item.state}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="section-card">
            <h2>后续协作能力</h2>
            <ul className="placeholder-list">
              {collaborationItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>

          {!isLoadingModels && models.length === 0 ? (
            <StatePanel
              eyebrow="模型状态"
              title="当前没有可用模型"
              description="请先检查后端种子数据和模型启用状态，然后再回来重试。"
              tone={modelsError ? "danger" : "warning"}
              actions={
                <Link className="button-secondary" to="/tasks">
                  先去看任务中心
                </Link>
              }
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
