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

export function formatSourceType(value: string): string {
  switch (value) {
    case "API":
      return "数据接口";
    case "WEB":
      return "网页资料";
    case "FILE":
      return "文件资料";
    case "MANUAL":
      return "人工整理";
    default:
      return value;
  }
}

export function formatAuthorityLevel(value: string): string {
  switch (value) {
    case "HIGH":
      return "高可信";
    case "MEDIUM":
      return "中可信";
    case "LOW":
      return "低可信";
    default:
      return value;
  }
}

export function formatSourceStrategy(value: string | null): string {
  switch (value) {
    case "DEFAULT":
      return "智能平衡";
    case "OFFICIAL_FIRST":
      return "官方优先";
    case "NEWS_HEAVY":
      return "新闻增强";
    case "":
    case null:
      return "未设置";
    default:
      return value;
  }
}

export function formatReportType(value: string): string {
  switch (value) {
    case "BRIEF":
      return "简版";
    case "FULL":
      return "详版";
    default:
      return value;
  }
}

export function formatReportStatus(value: string): string {
  switch (value) {
    case "DRAFT":
      return "草稿中";
    case "READY":
      return "已生成";
    case "FAILED":
      return "生成失败";
    default:
      return value;
  }
}

export function formatOperatorType(value: string): string {
  switch (value) {
    case "SYSTEM":
      return "系统";
    case "USER":
      return "用户";
    case "ADMIN":
      return "管理员";
    case "WORKER":
      return "执行引擎";
    default:
      return value;
  }
}

export function formatResearchDepth(value: string): string {
  switch (value) {
    case "QUICK":
      return "快速";
    case "STANDARD":
      return "标准";
    case "DEEP":
      return "深入";
    default:
      return value;
  }
}

export function formatTaskParamLabel(key: string): string {
  switch (key) {
    case "research_depth":
      return "调研深度";
    case "report_type":
      return "报告形式";
    case "target_domain":
      return "研究领域";
    case "original_object_query":
      return "原始输入";
    case "resolved_stock_name":
      return "识别后的股票名称";
    case "resolved_stock_symbol":
      return "识别后的交易代码";
    case "resolved_stock_code":
      return "识别后的股票代码";
    case "lookback_days":
      return "观察窗口";
    case "quote_page_url":
      return "行情页面";
    case "material_collection_mode":
      return "材料采集模式";
    case "material_collection_error":
      return "采集失败原因";
    default:
      return key;
  }
}

export function formatTaskParamValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return "暂无";
  }

  if (key === "report_type" && typeof value === "string") {
    return formatReportType(value);
  }

  if (key === "research_depth" && typeof value === "string") {
    return formatResearchDepth(value);
  }

  if (key === "lookback_days" && typeof value === "number") {
    return `${value} 天`;
  }

  if (key === "target_domain" && typeof value === "string") {
    switch (value.toLowerCase()) {
      case "stock":
        return "股票";
      case "company":
        return "公司";
      case "commodity":
        return "商品";
      default:
        return value;
    }
  }

  if (key === "material_collection_mode" && typeof value === "string") {
    switch (value) {
      case "GEMINI_GOOGLE_SEARCH":
        return "Gemini 联网补充";
      default:
        return value;
    }
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
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
