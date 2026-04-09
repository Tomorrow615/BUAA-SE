import { useEffect, useState, type FormEvent } from "react";

import { StatePanel } from "../components/StatePanel";
import { useAdminAuth } from "../context/AdminAuthContext";
import {
  formatDateTime,
  listAdminModels,
  type AdminModelConfig,
} from "../lib/admin";

type EnabledFilter = "all" | "enabled";

export function ModelsPage() {
  const { session } = useAdminAuth();
  const accessToken = session?.accessToken ?? null;

  const [keyword, setKeyword] = useState("");
  const [enabledFilter, setEnabledFilter] = useState<EnabledFilter>("all");

  const [models, setModels] = useState<AdminModelConfig[]>([]);
  const [total, setTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  async function loadModels(
    nextKeyword = keyword,
    nextEnabledFilter = enabledFilter,
  ) {
    if (!accessToken) {
      setErrorMessage("当前管理员会话不可用，请重新登录。");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await listAdminModels(accessToken, {
        keyword: nextKeyword,
        enabledOnly: nextEnabledFilter === "enabled",
        limit: 50,
        offset: 0,
      });
      setModels(response.items);
      setTotal(response.total);
      setLastUpdatedAt(new Date().toISOString());
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "模型列表加载失败，请稍后重试。",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const token = accessToken;
    if (!token) {
      return;
    }
    const resolvedAccessToken: string = token;

    let cancelled = false;

    async function bootstrap() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await listAdminModels(resolvedAccessToken, {
          limit: 50,
          offset: 0,
        });
        if (cancelled) {
          return;
        }

        setModels(response.items);
        setTotal(response.total);
        setLastUpdatedAt(new Date().toISOString());
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "模型列表加载失败，请稍后重试。",
        );
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadModels(keyword, enabledFilter);
  }

  async function handleReset() {
    setKeyword("");
    setEnabledFilter("all");
    await loadModels("", "all");
  }

  return (
    <div className="page-section">
      <header className="page-title">
        <p className="eyebrow">模型配置</p>
        <h1>模型治理页已经接入真实模型列表查询</h1>
        <p>
          当前页面调用 <code>/admin/models</code>，可按关键字和是否启用过滤，
          方便管理员快速查看当前模型配置情况。
        </p>
        <div className="page-meta-line">
          <p className="field-hint">
            最近刷新：{formatDateTime(lastUpdatedAt)}
          </p>
          <div className="button-row button-row-tight">
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                void loadModels();
              }}
              disabled={isLoading}
            >
              刷新模型
            </button>
          </div>
        </div>
      </header>

      <section className="section-card">
        <form className="form-grid" onSubmit={handleSubmit}>
          <div className="field-row">
            <label className="field">
              <span>关键字</span>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="模型名称、展示名或提供方"
              />
            </label>

            <label className="field">
              <span>启用状态</span>
              <select
                value={enabledFilter}
                onChange={(event) =>
                  setEnabledFilter(event.target.value as EnabledFilter)
                }
              >
                <option value="all">全部</option>
                <option value="enabled">仅启用</option>
              </select>
            </label>
          </div>

          {errorMessage ? (
            <p className="form-message form-message-error">{errorMessage}</p>
          ) : null}

          <div className="toolbar-inline">
            <p className="field-hint">
              当前共返回 <strong>{total}</strong> 条模型记录。
            </p>
            <div className="button-row button-row-tight">
              <button
                type="submit"
                className="button-primary"
                disabled={isLoading}
              >
                {isLoading ? "正在加载..." : "应用筛选"}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  void loadModels();
                }}
                disabled={isLoading}
              >
                刷新
              </button>
              <button
                type="button"
                className="button-ghost"
                onClick={() => {
                  void handleReset();
                }}
                disabled={isLoading}
              >
                清空筛选
              </button>
            </div>
          </div>
        </form>
      </section>

      {isLoading && models.length === 0 ? (
        <StatePanel
          eyebrow="模型状态"
          title="正在加载模型列表"
          description="当前正在同步模型配置与筛选结果，请稍候。"
        />
      ) : null}

      {models.length === 0 && !isLoading ? (
        <StatePanel
          eyebrow="模型状态"
          title="当前没有匹配的模型"
          description="你可以调整关键字或启用状态后重新查询。"
          tone={errorMessage ? "danger" : "warning"}
          actions={
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                void loadModels();
              }}
            >
              再刷新一次
            </button>
          }
        />
      ) : null}

      <section className="data-grid">
        {models.map((model) => (
          <article key={model.id} className="data-card">
            <div className="data-card-header">
              <div>
                <p className="eyebrow">模型 #{model.id}</p>
                <h2>{model.display_name}</h2>
              </div>
              <div className="chip-row">
                <span className={model.is_enabled ? "tag-chip tag-positive" : "tag-chip"}>
                  {model.is_enabled ? "已启用" : "未启用"}
                </span>
                {model.is_default ? (
                  <span className="tag-chip tag-warm">默认模型</span>
                ) : null}
              </div>
            </div>

            <dl className="meta-grid meta-grid-compact">
              <div>
                <dt>提供方</dt>
                <dd>{model.provider_code}</dd>
              </div>
              <div>
                <dt>模型名</dt>
                <dd>{model.model_name}</dd>
              </div>
              <div>
                <dt>场景</dt>
                <dd>{model.scene_type}</dd>
              </div>
              <div>
                <dt>更新时间</dt>
                <dd>{formatDateTime(model.updated_at)}</dd>
              </div>
              <div>
                <dt>API Base URL</dt>
                <dd>{model.api_base_url || "未配置"}</dd>
              </div>
              <div>
                <dt>API Key</dt>
                <dd>{model.api_key_masked || "未配置"}</dd>
              </div>
            </dl>

            <p className="field-hint">
              当前配置项数量：{Object.keys(model.config_json || {}).length}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
