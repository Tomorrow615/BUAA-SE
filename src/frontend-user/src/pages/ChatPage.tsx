import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";

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
    description: "市场与走势",
  },
  {
    value: "COMPANY",
    label: "公司",
    description: "企业与行业",
  },
  {
    value: "COMMODITY",
    label: "商品",
    description: "价格与供需",
  },
];

const PROMPT_SUGGESTIONS: Record<ChatObjectType, string[]> = {
  STOCK: [
    "梳理近一个月走势与风险。",
    "总结当前最关键的驱动因素。",
    "下一步还应该看哪些维度？",
  ],
  COMPANY: [
    "给我一份公司研究框架。",
    "经营与行业层面先看什么？",
    "帮我拟一份研究提纲。",
  ],
  COMMODITY: [
    "给我一份商品研究框架。",
    "应该优先跟踪哪些指标？",
    "帮我拆解这个研究问题。",
  ],
};

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
      return "自动";
    case "SOURCE_FIRST":
      return "数据优先";
    case "WEB_FALLBACK":
      return "联网";
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
  const promptSuggestions = PROMPT_SUGGESTIONS[selectedScope];

  return (
    <div className="page-section chat-page-shell chat-page-shell-minimal">
      <section className="chat-surface chat-surface-minimal">
        <header className="chat-page-header chat-page-header-minimal">
          <div>
            <p className="eyebrow">Assistant</p>
            <h1>AI 助理</h1>
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
                    {isLoadingOptions ? "加载中..." : "暂无模型"}
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
              <span>模式</span>
              <select
                value={selectedMode}
                onChange={(event) =>
                  setSelectedMode(event.target.value as ChatAnswerMode)
                }
                disabled={isSubmitting || isLoadingOptions}
              >
                {modeOptions.length === 0 ? (
                  <option value="AUTO">自动</option>
                ) : (
                  modeOptions.map((item) => (
                    <option
                      key={item.code}
                      value={item.code}
                      disabled={!item.is_available}
                    >
                      {item.label}
                    </option>
                  ))
                )}
              </select>
            </label>
          </div>
        </header>

        <section className="chat-scope-grid chat-scope-grid-minimal">
          {CHAT_SCOPES.map((item) => (
            <button
              key={item.value}
              type="button"
              className={
                item.value === selectedScope
                  ? "object-track-card object-track-card-active object-track-card-minimal"
                  : "object-track-card object-track-card-minimal"
              }
              onClick={() => setSelectedScope(item.value)}
            >
              <strong>{item.label}</strong>
              <p>{item.description}</p>
            </button>
          ))}
        </section>

        <section className="chat-prompt-grid chat-prompt-grid-minimal">
          {promptSuggestions.map((item) => (
            <button
              key={item}
              type="button"
              className="chat-prompt-card chat-prompt-card-minimal"
              onClick={() => setDraft(item)}
            >
              <p>{item}</p>
            </button>
          ))}
        </section>

        {submitError ? (
          <p className="form-message form-message-error">{submitError}</p>
        ) : null}

        <div className="chat-message-list chat-message-list-minimal">
          {messages.length === 0 ? (
            <div className="chat-empty-state chat-empty-state-minimal">
              <h2>{selectedModeOption?.label || normalizeModeLabel(selectedMode)}</h2>
            </div>
          ) : (
            messages.map((message) => (
              <article
                key={message.id}
                className={`chat-message chat-message-${message.role}`}
              >
                <div className="chat-message-meta">
                  <strong>{message.role === "user" ? "你" : "AI"}</strong>
                </div>

                {message.role === "assistant" ? (
                  <>
                    <MarkdownRenderer content={message.content} />
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
                <strong>AI</strong>
              </div>
              <p className="chat-plain-text">正在生成回复...</p>
            </article>
          ) : null}
        </div>

        <form className="chat-composer chat-composer-minimal" onSubmit={handleSubmit}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入问题"
            rows={5}
            disabled={isSubmitting}
          />

          <div className="chat-composer-footer">
            <button
              type="button"
              className="button-ghost"
              onClick={() => {
                setMessages([]);
                setSubmitError("");
              }}
              disabled={messages.length === 0 && !submitError}
            >
              清空
            </button>

            <button
              type="submit"
              className="button-primary"
              disabled={!accessToken || !draft.trim() || isSubmitting}
            >
              {isSubmitting ? "发送中..." : "发送"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
