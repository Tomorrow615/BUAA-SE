import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { StatePanel } from "../components/StatePanel";
import { useAuth } from "../context/AuthContext";
import {
  createResearchTask,
  fetchResearchModels,
  formatObjectType,
  type ObjectType,
  type ResearchModelOption,
} from "../lib/research";

const OBJECT_BLUEPRINTS: Array<{
  value: ObjectType;
  label: string;
  description: string;
  nameLabel: string;
  namePlaceholder: string;
  goalPlaceholder: string;
}> = [
  {
    value: "STOCK",
    label: "股票",
    description: "市场表现与交易节奏",
    nameLabel: "股票名称或代码",
    namePlaceholder: "如：宁德时代 / 300750",
    goalPlaceholder: "写下你关注的问题和重点。",
  },
  {
    value: "COMPANY",
    label: "公司",
    description: "企业结构与经营质量",
    nameLabel: "公司名称",
    namePlaceholder: "如：比亚迪 / 苹果公司",
    goalPlaceholder: "写下你关注的问题和重点。",
  },
  {
    value: "COMMODITY",
    label: "商品",
    description: "价格趋势与供需结构",
    nameLabel: "商品名称",
    namePlaceholder: "如：黄金 / 原油 / 铜",
    goalPlaceholder: "写下你关注的问题和重点。",
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

  const activeBlueprint =
    OBJECT_BLUEPRINTS.find((item) => item.value === selectedObjectType) ??
    OBJECT_BLUEPRINTS[0];

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
          error instanceof Error ? error.message : "模型加载失败，请稍后重试。",
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

  return (
    <div className="page-section workspace-page-minimal">
      <header className="page-title page-title-minimal">
        <div>
          <p className="eyebrow">Research</p>
          <h1>研究工作台</h1>
        </div>

        <div className="button-row button-row-tight">
          <Link className="button-secondary" to="/tasks">
            任务
          </Link>
          <Link className="button-ghost" to="/chat">
            助理
          </Link>
          <button type="button" className="button-ghost" disabled>
            模板
          </button>
        </div>
      </header>

      <section className="object-track-grid object-track-grid-minimal">
        {OBJECT_BLUEPRINTS.map((item) => (
          <button
            key={item.value}
            type="button"
            className={
              item.value === selectedObjectType
                ? "object-track-card object-track-card-active object-track-card-minimal"
                : "object-track-card object-track-card-minimal"
            }
            onClick={() => {
              setSelectedObjectType(item.value);
              setSubmitError("");
            }}
          >
            <strong>{item.label}</strong>
            <p>{item.description}</p>
          </button>
        ))}
      </section>

      <section className="section-grid section-grid-wide workspace-layout workspace-layout-minimal">
        <article className="section-card workspace-primary-card workspace-primary-card-minimal">
          <form className="form-grid form-grid-compact" onSubmit={handleSubmit}>
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
              <span>标题</span>
              <input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="自定义标题"
              />
            </label>

            <label className="field">
              <span>问题</span>
              <textarea
                value={researchGoal}
                onChange={(event) => setResearchGoal(event.target.value)}
                placeholder={activeBlueprint.goalPlaceholder}
                rows={6}
              />
            </label>

            <div className="field-row field-row-three">
              <label className="field">
                <span>时间范围</span>
                <input
                  value={timeRange}
                  onChange={(event) => setTimeRange(event.target.value)}
                  placeholder="近 30 天"
                />
              </label>

              <label className="field">
                <span>深度</span>
                <select
                  value={researchDepth}
                  onChange={(event) => setResearchDepth(event.target.value)}
                >
                  <option value="QUICK">快速</option>
                  <option value="STANDARD">标准</option>
                  <option value="DEEP">深度</option>
                </select>
              </label>

              <label className="field">
                <span>报告</span>
                <select
                  value={reportType}
                  onChange={(event) => setReportType(event.target.value)}
                >
                  <option value="BRIEF">摘要</option>
                  <option value="FULL">完整</option>
                </select>
              </label>
            </div>

            <div className="field-row">
              <label className="field">
                <span>信息源</span>
                <select
                  value={sourceStrategy}
                  onChange={(event) => setSourceStrategy(event.target.value)}
                >
                  <option value="DEFAULT">智能</option>
                  <option value="OFFICIAL_FIRST">官方优先</option>
                  <option value="NEWS_HEAVY">新闻增强</option>
                </select>
              </label>

              <label className="field">
                <span>模型</span>
                <select
                  value={selectedModelId}
                  onChange={(event) => setSelectedModelId(event.target.value)}
                  disabled={isLoadingModels || models.length === 0}
                >
                  {models.length === 0 ? (
                    <option value="">
                      {isLoadingModels ? "加载中..." : "暂无模型"}
                    </option>
                  ) : null}

                  {models.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.display_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {modelsError ? (
              <p className="form-message form-message-error">{modelsError}</p>
            ) : null}

            {submitError ? (
              <p className="form-message form-message-error">{submitError}</p>
            ) : null}

            <div className="button-row">
              <button
                type="submit"
                className="button-primary"
                disabled={!accessToken || !objectName.trim() || isSubmitting}
              >
                {isSubmitting ? "创建中..." : "开始研究"}
              </button>
              <button type="button" className="button-secondary" disabled>
                保存模板
              </button>
              <button type="button" className="button-ghost" disabled>
                分享
              </button>
            </div>
          </form>
        </article>

        <div className="workspace-side-stack workspace-side-stack-minimal">
          <article className="section-card">
            <h2>设置</h2>
            <dl className="kv-list">
              <div>
                <dt>对象</dt>
                <dd>{formatObjectType(selectedObjectType)}</dd>
              </div>
              <div>
                <dt>名称</dt>
                <dd>{objectName.trim() || "-"}</dd>
              </div>
              <div>
                <dt>模型</dt>
                <dd>{selectedModel?.display_name || "-"}</dd>
              </div>
            </dl>
          </article>

          <article className="section-card">
            <h2>输出</h2>
            <div className="button-row button-row-column">
              <button type="button" className="button-secondary" disabled>
                导出 PDF
              </button>
              <button type="button" className="button-secondary" disabled>
                导出 Word
              </button>
              <button type="button" className="button-ghost" disabled>
                提醒订阅
              </button>
            </div>
          </article>

          {!isLoadingModels && models.length === 0 ? (
            <StatePanel
              title="暂无可用模型"
              description="请稍后重试。"
              tone={modelsError ? "danger" : "warning"}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
