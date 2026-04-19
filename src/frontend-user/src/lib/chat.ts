import { requestJson } from "./api";

export type ChatRole = "user" | "assistant";
export type ChatAnswerMode = "CHAT" | "AUTO" | "SOURCE_FIRST" | "WEB_FALLBACK";
export type ChatObjectType = "STOCK" | "COMPANY" | "COMMODITY";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCitation {
  source_id: string;
  title: string;
  source_name: string;
  source_url: string | null;
  published_at: string | null;
  authority_level: string;
}

export interface ChatModelOption {
  value: string;
  provider_code: string;
  model_name: string;
  display_name: string;
  scene_type: string;
  is_default: boolean;
}

export interface ChatModeOption {
  code: ChatAnswerMode;
  label: string;
  description: string;
  is_available: boolean;
  availability_note: string | null;
}

export interface ChatSourceOption {
  source_code: string;
  source_name: string;
  object_type: string;
  source_type: string;
  authority_level: string;
  priority_weight: number;
  base_url: string | null;
}

export interface ChatOptionsResponse {
  models: ChatModelOption[];
  modes: ChatModeOption[];
  sources: ChatSourceOption[];
  default_model: string | null;
  default_mode: ChatAnswerMode;
  web_fallback_ready: boolean;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model?: string;
  system_prompt?: string;
  answer_mode?: ChatAnswerMode;
  object_type?: ChatObjectType;
  include_citations?: boolean;
  allow_web_fallback?: boolean;
}

export interface ChatCompletionResponse {
  reply: string;
  model: string;
  provider: string;
  answer_mode: ChatAnswerMode;
  grounding_status: string;
  citations: ChatCitation[];
  used_source_codes: string[];
  note: string | null;
}

export async function fetchChatOptions(
  accessToken: string,
  objectType: ChatObjectType = "STOCK",
): Promise<ChatOptionsResponse> {
  return requestJson<ChatOptionsResponse>(`/chat/options?object_type=${objectType}`, {
    accessToken,
  });
}

export async function sendChatCompletion(
  accessToken: string,
  payload: ChatCompletionRequest,
): Promise<ChatCompletionResponse> {
  return requestJson<ChatCompletionResponse>("/chat/completions", {
    method: "POST",
    accessToken,
    body: payload as unknown as Record<string, unknown>,
  });
}
