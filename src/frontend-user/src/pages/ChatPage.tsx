import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";

import { MarkdownRenderer } from "../components/MarkdownRenderer";
import { useAuth } from "../context/AuthContext";
import {
  fetchChatOptions,
  sendChatCompletion,
  type ChatAnswerMode,
  type ChatCitation,
  type ChatMessage,
  type ChatModeOption,
  type ChatModelOption,
  type ChatObjectType,
} from "../lib/chat";

interface UiChatMessage extends ChatMessage {
  id: string;
  citations?: ChatCitation[];
  note?: string | null;
}

const CHAT_SCOPES: Array<{
  value: ChatObjectType;
  label: string;
  description: string;
}> = [
  {
    value: "STOCK",
    label: "股票",
    description: "可走数据优先问答，当前链路最完整。",
  },
  {
    value: "COMPANY",
    label: "公司",
    description: "界面完整预留，当前以纯聊天或自动回退为主。",
  },
  {
    value: "COMMODITY",
    label: "商品",
    description: "界面完整预留，后续接入商品行情和供需数据。",
  },
];

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildUiMessage(role: ChatMessage["role"], content: string): UiChatMessage {
  return {
    id: createMessageId(),
    role,
    content,
  };
}

function findModeByCode(
  modes: ChatModeOption[],
  code: ChatAnswerMode,
): ChatModeOption | undefined {
  return modes.find((item) => item.code === code);
}

function normalizeModeLabel(code: ChatAnswerMode): string {
  switch (code) {
    case "CHAT":
      return "纯聊天";
    case "AUTO":
      return "自动模式";
    case "SOURCE_FIRST":
      return "数据优先";
    case "WEB_FALLBACK":
      return "联网兜底";
    default:
      return code;
  }
}

export function ChatPage() {
  const { session } = useAuth();
  const accessToken = session?.accessToken ?? null;

  const [selectedScope, setSelectedScope] = useState<ChatObjectType>("STOCK");
  const [modelOptions, setModelOptions] = useState<ChatModelOption[]>([]);
  const [modeOptions, setModeOptions] = useState<ChatModeOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedMode, setSelectedMode] = useState<ChatAnswerMode>("AUTO");
  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);

  useEffect(() => {
    const token = accessToken;
    if (!token) {
      return;
    }
    const resolvedAccessToken: string = token;

    let cancelled = false;

    async function loadOptions() {
      setIsLoadingOptions(true);
      try {
        const response = await fetchChatOptions(resolvedAccessToken, selectedScope);
        if (cancelled) {
          return;
        }

        setModelOptions(response.models);
        setModeOptions(response.modes);
        setSelectedModel((currentValue) => {
          const nextValue = response.default_model || response.models[0]?.value || "";
          if (
            currentValue &&
            response.models.some((item) => item.value === currentValue)
          ) {
            return currentValue;
          }
          return nextValue;
        });
        setSelectedMode((currentValue) => {
          const matched = findModeByCode(response.modes, currentValue);
          if (matched?.is_available) {
            return currentValue;
          }
          const defaultMode = findModeByCode(response.modes, response.default_mode);
          if (defaultMode?.is_available) {
            return response.default_mode;
          }
          return "CHAT";
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setSubmitError(
          error instanceof Error ? error.message : "聊天配置加载失败，请稍后重试。",
        );
      } finally {
        if (!cancelled) {
          setIsLoadingOptions(false);
        }
      }
    }

    void loadOptions();

    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedScope]);

  async function submitMessage(content: string) {
    const token = accessToken;
    if (!token) {
      setSubmitError("当前会话不可用，请重新登录。");
      return;
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setSubmitError("请输入消息内容。");
      return;
    }

    const nextMessages = [...messages, buildUiMessage("user", trimmedContent)];

    setMessages(nextMessages);
    setDraft("");
    setSubmitError("");
    setIsSubmitting(true);

    try {
      const response = await sendChatCompletion(token, {
        model: selectedModel || undefined,
        answer_mode: selectedMode,
        object_type: selectedMode === "CHAT" ? undefined : selectedScope,
        include_citations: true,
        allow_web_fallback: selectedMode === "WEB_FALLBACK",
        messages: nextMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });

      setSelectedModel((currentValue) => currentValue || response.model);
      setMessages([
        ...nextMessages,
        {
          ...buildUiMessage("assistant", response.reply),
          citations: response.citations,
          note: response.note,
        },
      ]);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "聊天响应失败，请稍后重试。",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitMessage(draft);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!isSubmitting) {
        void submitMessage(draft);
      }
    }
  }

  const selectedModeOption = findModeByCode(modeOptions, selectedMode);
  const selectedScopeInfo =
    CHAT_SCOPES.find((item) => item.value === selectedScope) ?? CHAT_SCOPES[0];
  const chatCapabilities = useMemo(
    () => [
      "纯聊天与自由问答",
      "股票数据优先回答",
      "引用材料展示",
      "后续追问入口预留",
    ],
    [],
  );

  return (
    <div className="page-section chat-page-shell">
      <section className="chat-surface chat-surface-rich">
        <header className="chat-page-header chat-page-header-rich">
          <div>
            <p className="eyebrow">AI 协作助理</p>
            <h1>研究协作助理</h1>
            <p className="chat-page-summary">
              支持自由对话、股票数据优先回答与后续可扩展的多对象问答。当前股票链路最完整，公司和商品问答先按最终界面预留。
            </p>
          </div>

          <div className="chat-page-tools">
            <label className="chat-model-field">
              <span>模型</span>
              <select
                value={selectedModel}
                onChange={(event) => setSelectedModel(event.target.value)}
                disabled={isSubmitting || isLoadingOptions}
              >
                {modelOptions.length === 0 ? (
                  <option value="">
                    {isLoadingOptions ? "正在加载模型..." : "暂无可用模型"}
                  </option>
                ) : (
                  modelOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.display_name}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="chat-model-field">
              <span>回答方式</span>
              <select
                value={selectedMode}
                onChange={(event) =>
                  setSelectedMode(event.target.value as ChatAnswerMode)
                }
                disabled={isSubmitting || isLoadingOptions}
              >
                {modeOptions.length === 0 ? (
                  <option value="AUTO">自动模式</option>
                ) : (
                  modeOptions.map((item) => (
                    <option
                      key={item.code}
                      value={item.code}
                      disabled={!item.is_available}
                    >
                      {item.label}
                      {!item.is_available ? "（预留）" : ""}
                    </option>
                  ))
                )}
              </select>
            </label>

            <button
              type="button"
              className="button-ghost"
              onClick={() => {
                setMessages([]);
                setSubmitError("");
              }}
              disabled={messages.length === 0 && !submitError}
            >
              清空对话
            </button>
          </div>
        </header>

        <section className="chat-scope-grid">
          {CHAT_SCOPES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={
                item.value === selectedScope
                  ? "object-track-card object-track-card-active"
                  : "object-track-card"
              }
              onClick={() => setSelectedScope(item.value)}
            >
              <div className="object-track-head">
                <span>{item.value === "STOCK" ? "优先支持" : "预留对象"}</span>
                <strong>{item.label}</strong>
              </div>
              <p>{item.description}</p>
            </button>
          ))}
        </section>

        <section className="section-grid section-grid-wide chat-info-grid">
          <article className="section-card">
            <h2>当前会话设定</h2>
            <dl className="kv-list">
              <div>
                <dt>对象范围</dt>
                <dd>{selectedScopeInfo.label}</dd>
              </div>
              <div>
                <dt>回答方式</dt>
                <dd>{selectedModeOption?.label || normalizeModeLabel(selectedMode)}</dd>
              </div>
              <div>
                <dt>当前模型</dt>
                <dd>
                  {modelOptions.find((item) => item.value === selectedModel)?.display_name ||
                    "等待选择"}
                </dd>
              </div>
            </dl>
            {selectedModeOption?.availability_note ? (
              <p className="field-hint">{selectedModeOption.availability_note}</p>
            ) : null}
          </article>

          <article className="section-card">
            <h2>能力预览</h2>
            <ul className="placeholder-list">
              {chatCapabilities.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        </section>

        {submitError ? (
          <p className="form-message form-message-error">{submitError}</p>
        ) : null}

        <div className="chat-message-list">
          {messages.length === 0 ? (
            <div className="chat-empty-state">
              <h2>开始对话</h2>
              <p>
                可以直接闲聊，也可以切到股票范围后使用数据优先模式提问。公司与商品入口已经在界面中预留，后续接通数据链路后会直接承接。
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <article
                key={message.id}
                className={`chat-message chat-message-${message.role}`}
              >
                <div className="chat-message-meta">
                  <strong>{message.role === "user" ? "你" : "AI 助理"}</strong>
                </div>

                {message.role === "assistant" ? (
                  <>
                    <MarkdownRenderer content={message.content} />
                    {message.note ? (
                      <p className="chat-assistant-note">{message.note}</p>
                    ) : null}
                    {message.citations && message.citations.length > 0 ? (
                      <div className="chat-citation-list">
                        {message.citations.map((item) => (
                          <a
                            key={`${message.id}-${item.source_id}`}
                            className="chat-citation-item"
                            href={item.source_url || undefined}
                            target={item.source_url ? "_blank" : undefined}
                            rel={item.source_url ? "noreferrer" : undefined}
                          >
                            <strong>{item.source_id}</strong>
                            <span>{item.title}</span>
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="chat-plain-text">{message.content}</p>
                )}
              </article>
            ))
          )}

          {isSubmitting ? (
            <article className="chat-message chat-message-assistant chat-message-pending">
              <div className="chat-message-meta">
                <strong>AI 助理</strong>
              </div>
              <p className="chat-plain-text">正在生成回复，请稍候...</p>
            </article>
          ) : null}
        </div>

        <form className="chat-composer" onSubmit={handleSubmit}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题。按 Enter 发送，Shift + Enter 换行。"
            rows={5}
            disabled={isSubmitting}
          />

          <div className="chat-composer-footer">
            <span className="field-hint">
              当前模式：{selectedModeOption?.label || normalizeModeLabel(selectedMode)}
            </span>
            <button
              type="submit"
              className="button-primary"
              disabled={!accessToken || !draft.trim() || isSubmitting}
            >
              {isSubmitting ? "正在回复..." : "发送消息"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
