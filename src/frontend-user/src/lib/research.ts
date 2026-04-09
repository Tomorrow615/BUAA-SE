import { requestJson } from "./api";

export type ObjectType = "COMPANY" | "STOCK" | "COMMODITY";
export type TaskStatus =
  | "CREATED"
  | "QUEUED"
  | "COLLECTING"
  | "PROCESSING"
  | "ANALYZING"
  | "REPORTING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface ResearchModelOption {
  id: number;
  provider_code: string;
  model_name: string;
  display_name: string;
  scene_type: string;
  is_default: boolean;
}

export interface ResearchModelOptionListResponse {
  items: ResearchModelOption[];
  total: number;
}

export interface ModelConfigSummary {
  id: number;
  provider_code: string;
  model_name: string;
  display_name: string;
}

export interface TaskStageLog {
  id: number;
  stage_code: string;
  stage_name: string | null;
  status: string;
  message: string;
  detail_data: Record<string, unknown>;
  operator_type: string;
  created_at: string;
}

export interface ResearchMaterial {
  id: number;
  title: string;
  summary: string | null;
  content_text: string | null;
  source_name: string;
  source_url: string | null;
  source_type: string;
  authority_level: string;
  published_at: string | null;
  captured_at: string;
  topic_tag: string | null;
  relevance_score: number;
  is_selected: boolean;
}

export interface ResearchAnalysisResult {
  id: number;
  summary: string | null;
  key_findings: string | null;
  risks: string | null;
  opportunities: string | null;
  conclusion: string | null;
  structured_payload: Record<string, unknown>;
  model_config_detail: ModelConfigSummary | null;
  created_at: string;
  updated_at: string;
}

export interface ResearchReport {
  id: number;
  report_type: string;
  report_version: number;
  title: string;
  markdown_content: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ResearchTaskSummary {
  id: number;
  task_no: string;
  object_type: ObjectType;
  object_name: string;
  task_title: string;
  research_goal: string | null;
  status: TaskStatus;
  current_stage: string;
  progress_percent: number;
  result_summary: string | null;
  error_message: string | null;
  selected_model: ModelConfigSummary | null;
  created_at: string;
  updated_at: string;
}

export interface ResearchTaskDetail extends ResearchTaskSummary {
  user_id: number;
  time_range: string | null;
  source_strategy: string | null;
  task_params: Record<string, unknown>;
  started_at: string | null;
  completed_at: string | null;
  stage_logs: TaskStageLog[];
  materials: ResearchMaterial[];
  latest_analysis_result: ResearchAnalysisResult | null;
  latest_report: ResearchReport | null;
}

export interface ResearchTaskStatusResponse {
  id: number;
  task_no: string;
  status: TaskStatus;
  current_stage: string;
  progress_percent: number;
  result_summary: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  stage_logs: TaskStageLog[];
  materials: ResearchMaterial[];
  latest_analysis_result: ResearchAnalysisResult | null;
  latest_report: ResearchReport | null;
}

export interface ResearchTaskListResponse {
  items: ResearchTaskSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateResearchTaskPayload {
  object_type: ObjectType;
  object_name: string;
  task_title?: string;
  research_goal?: string;
  time_range?: string;
  selected_model_id?: number;
  source_strategy?: string;
  task_params?: Record<string, unknown>;
}

export interface ResearchTaskListFilters {
  objectType?: ObjectType | "";
  status?: TaskStatus | "";
  selectedModelId?: number | "";
  keyword?: string;
  limit?: number;
  offset?: number;
}

export const OBJECT_TYPE_OPTIONS: Array<{ value: ObjectType; label: string }> = [
  { value: "COMPANY", label: "公司" },
  { value: "STOCK", label: "股票" },
  { value: "COMMODITY", label: "商品" },
];

export const TASK_STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: "CREATED", label: "已创建" },
  { value: "QUEUED", label: "排队中" },
  { value: "COLLECTING", label: "采集中" },
  { value: "PROCESSING", label: "处理中" },
  { value: "ANALYZING", label: "分析中" },
  { value: "REPORTING", label: "报告生成中" },
  { value: "COMPLETED", label: "已完成" },
  { value: "FAILED", label: "失败" },
  { value: "CANCELLED", label: "已取消" },
];

const TERMINAL_STATUSES = new Set<TaskStatus>([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

function buildQueryString(
  params: Record<string, string | number | undefined | null>,
): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function fetchResearchModels(
  accessToken: string,
  objectType?: ObjectType,
): Promise<ResearchModelOption[]> {
  const query = buildQueryString({
    object_type: objectType,
  });
  const response = await requestJson<ResearchModelOptionListResponse>(
    `/research/models${query}`,
    {
      accessToken,
    },
  );
  return response.items;
}

export async function createResearchTask(
  accessToken: string,
  payload: CreateResearchTaskPayload,
): Promise<ResearchTaskDetail> {
  return requestJson<ResearchTaskDetail>("/research/tasks", {
    method: "POST",
    accessToken,
    body: payload as unknown as Record<string, unknown>,
  });
}

export async function listResearchTasks(
  accessToken: string,
  filters: ResearchTaskListFilters = {},
): Promise<ResearchTaskListResponse> {
  const query = buildQueryString({
    object_type: filters.objectType || undefined,
    status: filters.status || undefined,
    selected_model_id:
      typeof filters.selectedModelId === "number"
        ? filters.selectedModelId
        : undefined,
    keyword: filters.keyword?.trim() || undefined,
    limit: filters.limit ?? 20,
    offset: filters.offset ?? 0,
  });

  return requestJson<ResearchTaskListResponse>(`/research/tasks${query}`, {
    accessToken,
  });
}

export async function fetchResearchTaskDetail(
  accessToken: string,
  taskId: number,
): Promise<ResearchTaskDetail> {
  return requestJson<ResearchTaskDetail>(`/research/tasks/${taskId}`, {
    accessToken,
  });
}

export async function fetchResearchTaskStatus(
  accessToken: string,
  taskId: number,
): Promise<ResearchTaskStatusResponse> {
  return requestJson<ResearchTaskStatusResponse>(
    `/research/tasks/${taskId}/status`,
    {
      accessToken,
    },
  );
}

export function isTerminalTaskStatus(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function formatObjectType(value: ObjectType): string {
  const item = OBJECT_TYPE_OPTIONS.find((option) => option.value === value);
  return item?.label || value;
}

export function formatTaskStatus(value: string): string {
  switch (value) {
    case "CREATED":
    case "QUEUED":
    case "COLLECTING":
    case "PROCESSING":
    case "ANALYZING":
    case "REPORTING":
    case "COMPLETED":
    case "FAILED":
    case "CANCELLED": {
      const item = TASK_STATUS_OPTIONS.find((option) => option.value === value);
      return item?.label || value;
    }
    case "STARTED":
      return "已开始";
    case "RUNNING":
      return "进行中";
    case "SKIPPED":
      return "已跳过";
    default:
      return value;
  }
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function toStatusClassName(value: string): string {
  return `status-badge status-${value.toLowerCase()}`;
}
