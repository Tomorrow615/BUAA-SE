import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { StatePanel } from "../components/StatePanel";
import { useAuth } from "../context/AuthContext";
import {
  createResearchTask,
  fetchResearchModels,
  formatDateTime,
  formatObjectType,
  type ObjectType,
  type ResearchModelOption,
} from "../lib/research";

const STOCK_OBJECT_TYPE: ObjectType = "STOCK";

function resolveDefaultModelId(models: ResearchModelOption[]): string {
  const preferredModel = models.find((item) => item.is_default) ?? models[0];
  return preferredModel ? String(preferredModel.id) : "";
}

export function WorkspacePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? null;

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
          STOCK_OBJECT_TYPE,
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
  }, [accessToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = accessToken;
    if (!token) {
      setSubmitError("当前会话不可用，请重新登录。");
      return;
    }

    if (!objectName.trim()) {
      setSubmitError("请输入股票名称或 6 位股票代码。");
      return;
    }

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const createdTask = await createResearchTask(token, {
        object_type: STOCK_OBJECT_TYPE,
        object_name: objectName.trim(),
        task_title: taskTitle.trim() || undefined,
        research_goal: researchGoal.trim() || undefined,
        time_range: timeRange.trim() || undefined,
        selected_model_id: selectedModelId ? Number(selectedModelId) : undefined,
        source_strategy: sourceStrategy,
        task_params: {
          research_depth: researchDepth,
          report_type: reportType,
          target_domain: "stock",
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
    Boolean(accessToken) && Boolean(objectName.trim()) && !isSubmitting;

  return (
    <div className="page-section">
      <header className="page-title">
        <p className="eyebrow">调研工作台</p>
        <h1>股票调研最小闭环工作台</h1>
        <p>
          当前第 8 步先聚焦股票。提交后会进入真实的股票采集、AI 分析和报告生成链路，
          然后直接跳转到任务详情页查看材料、分析结论和引用式报告。
        </p>
        <div className="page-meta-line">
          <p className="field-hint">
            最近模型同步：{formatDateTime(lastModelSyncAt)}
          </p>
          <div className="button-row button-row-tight">
            <Link className="button-secondary" to="/tasks">
              查看任务中心
            </Link>
            <Link className="button-ghost" to="/profile">
              打开个人中心
            </Link>
          </div>
        </div>
      </header>

      <section className="section-grid section-grid-wide">
        <article className="section-card">
          <h2>发起股票调研</h2>
          <form className="form-grid" onSubmit={handleSubmit}>
            <div className="field-row">
              <label className="field">
                <span>当前对象类型</span>
                <input value={formatObjectType(STOCK_OBJECT_TYPE)} disabled />
              </label>

              <label className="field">
                <span>股票名称或代码</span>
                <input
                  value={objectName}
                  onChange={(event) => setObjectName(event.target.value)}
                  placeholder="如：宁德时代 / 贵州茅台 / 300750 / 600519"
                />
              </label>
            </div>

            <label className="field">
              <span>任务标题</span>
              <input
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                placeholder="如：宁德时代近30天走势与风险分析（可选）"
              />
            </label>

            <label className="field">
              <span>调研目标</span>
              <textarea
                value={researchGoal}
                onChange={(event) => setResearchGoal(event.target.value)}
                placeholder="如：重点关注近一个月价格表现、阶段回撤、交易活跃度和可见风险。"
                rows={5}
              />
            </label>

            <div className="field-row field-row-three">
              <label className="field">
                <span>时间范围</span>
                <input
                  value={timeRange}
                  onChange={(event) => setTimeRange(event.target.value)}
                  placeholder="如：近30天 / 近60天"
                />
              </label>

              <label className="field">
                <span>调研深度</span>
                <select
                  value={researchDepth}
                  onChange={(event) => setResearchDepth(event.target.value)}
                >
                  <option value="QUICK">快速</option>
                  <option value="STANDARD">标准</option>
                  <option value="DEEP">深入</option>
                </select>
              </label>

              <label className="field">
                <span>报告形式</span>
                <select
                  value={reportType}
                  onChange={(event) => setReportType(event.target.value)}
                >
                  <option value="BRIEF">简版</option>
                  <option value="FULL">详版</option>
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
                  <option value="DEFAULT">默认平衡</option>
                  <option value="OFFICIAL_FIRST">优先结构化数据</option>
                  <option value="NEWS_HEAVY">后续预留新闻增强</option>
                </select>
              </label>

              <label className="field">
                <span>模型选择</span>
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
                      {item.display_name} ({item.provider_code})
                    </option>
                  ))}
                </select>
                <p className="field-hint">
                  当前对象类型：{formatObjectType(STOCK_OBJECT_TYPE)}
                </p>
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
                disabled={!canSubmit}
              >
                {isSubmitting ? "正在创建任务..." : "提交股票调研任务"}
              </button>
              <Link className="button-secondary" to="/tasks">
                查看任务中心
              </Link>
            </div>
          </form>
        </article>

        <article className="section-card">
          <h2>当前配置概览</h2>
          <dl className="kv-list">
            <div>
              <dt>对象类型</dt>
              <dd>{formatObjectType(STOCK_OBJECT_TYPE)}</dd>
            </div>
            <div>
              <dt>股票名称或代码</dt>
              <dd>{objectName.trim() || "待填写"}</dd>
            </div>
            <div>
              <dt>模型</dt>
              <dd>{selectedModel?.display_name || "等待选择"}</dd>
            </div>
            <div>
              <dt>提供方</dt>
              <dd>{selectedModel?.provider_code || "暂无"}</dd>
            </div>
            <div>
              <dt>调研深度</dt>
              <dd>{researchDepth}</dd>
            </div>
            <div>
              <dt>报告形式</dt>
              <dd>{reportType}</dd>
            </div>
          </dl>

          <div className="info-panel">
            <strong>当前真实链路</strong>
            <p>
              现在会按股票对象读取 <code>GET /research/models</code>，
              提交 <code>POST /research/tasks</code> 后由 worker 继续采集行情、
              写入材料、生成分析和报告。
            </p>
          </div>

          <ul className="placeholder-list">
            <li>当前最小版仅支持股票，不再开放公司和商品入口。</li>
            <li>股票名称支持中文名，输入 6 位代码会优先按代码解析。</li>
            <li>提交成功后会直接进入详情页查看阶段进度和实际结果。</li>
          </ul>

          {!isLoadingModels && models.length === 0 ? (
            <StatePanel
              eyebrow="模型状态"
              title="当前没有可用模型"
              description="你可以先检查后端种子数据和模型启用状态，然后再回来重试。"
              tone={modelsError ? "danger" : "warning"}
              actions={
                <Link className="button-secondary" to="/tasks">
                  先去看任务中心
                </Link>
              }
            />
          ) : null}
        </article>
      </section>
    </div>
  );
}
