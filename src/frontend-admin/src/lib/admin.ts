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
export type UserStatus = "ACTIVE" | "DISABLED";

export interface AdminAuditActor {
  id: number;
  username: string;
  display_name: string | null;
}

export interface AdminAuditLog {
  id: number;
  action_type: string;
  target_type: string;
  target_id: string | null;
  action_detail: string | null;
  ip_address: string | null;
  created_at: string;
  user: AdminAuditActor | null;
}

export interface AdminAuditLogListResponse {
  items: AdminAuditLog[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminModelConfig {
  id: number;
  provider_code: string;
  model_name: string;
  display_name: string;
  scene_type: string;
  api_base_url: string | null;
  api_key_masked: string | null;
  is_enabled: boolean;
  is_default: boolean;
  config_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AdminModelConfigListResponse {
  items: AdminModelConfig[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminUserSummary {
  id: number;
  username: string;
  email: string;
  display_name: string | null;
  status: UserStatus;
  roles: string[];
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  research_task_count: number;
}

export interface AdminUserListResponse {
  items: AdminUserSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminRecentTask {
  id: number;
  task_no: string;
  object_type: ObjectType;
  object_name: string;
  task_title: string;
  status: TaskStatus;
  current_stage: string;
  progress_percent: number;
  created_at: string;
  selected_model_name: string | null;
}

export interface AdminOverviewMetrics {
  total_users: number;
  active_users: number;
  admin_users: number;
  total_tasks: number;
  queued_tasks: number;
  running_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  enabled_models: number;
  enabled_sources: number;
  total_audit_logs: number;
}

export interface AdminOverviewResponse {
  metrics: AdminOverviewMetrics;
  recent_tasks: AdminRecentTask[];
  recent_audit_logs: AdminAuditLog[];
}

export interface ModelConfigSummary {
  id: number;
  provider_code: string;
  model_name: string;
  display_name: string;
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

export interface ResearchTaskListResponse {
  items: ResearchTaskSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminModelFilters {
  keyword?: string;
  enabledOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface AdminUserFilters {
  keyword?: string;
  status?: UserStatus | "";
  limit?: number;
  offset?: number;
}

export interface AdminAuditLogFilters {
  keyword?: string;
  actionType?: string;
  limit?: number;
  offset?: number;
}

export interface AdminTaskFilters {
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

export const USER_STATUS_OPTIONS: Array<{ value: UserStatus; label: string }> = [
  { value: "ACTIVE", label: "启用中" },
  { value: "DISABLED", label: "已禁用" },
];

function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null>,
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

export async function fetchAdminOverview(
  accessToken: string,
): Promise<AdminOverviewResponse> {
  return requestJson<AdminOverviewResponse>("/admin/overview", {
    accessToken,
  });
}

export async function listAdminModels(
  accessToken: string,
  filters: AdminModelFilters = {},
): Promise<AdminModelConfigListResponse> {
  const query = buildQueryString({
    keyword: filters.keyword?.trim() || undefined,
    enabled_only: filters.enabledOnly || undefined,
    limit: filters.limit ?? 20,
    offset: filters.offset ?? 0,
  });

  return requestJson<AdminModelConfigListResponse>(`/admin/models${query}`, {
    accessToken,
  });
}

export async function listAdminUsers(
  accessToken: string,
  filters: AdminUserFilters = {},
): Promise<AdminUserListResponse> {
  const query = buildQueryString({
    keyword: filters.keyword?.trim() || undefined,
    status: filters.status || undefined,
    limit: filters.limit ?? 20,
    offset: filters.offset ?? 0,
  });

  return requestJson<AdminUserListResponse>(`/admin/users${query}`, {
    accessToken,
  });
}

export async function listAdminAuditLogs(
  accessToken: string,
  filters: AdminAuditLogFilters = {},
): Promise<AdminAuditLogListResponse> {
  const query = buildQueryString({
    keyword: filters.keyword?.trim() || undefined,
    action_type: filters.actionType?.trim() || undefined,
    limit: filters.limit ?? 20,
    offset: filters.offset ?? 0,
  });

  return requestJson<AdminAuditLogListResponse>(`/admin/audit-logs${query}`, {
    accessToken,
  });
}

export async function listAdminTasks(
  accessToken: string,
  filters: AdminTaskFilters = {},
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

export function formatUserStatus(value: string): string {
  const item = USER_STATUS_OPTIONS.find((option) => option.value === value);
  return item?.label || value;
}

export function toTaskStatusClassName(value: string): string {
  return `status-badge status-${value.toLowerCase()}`;
}

export function toUserStatusClassName(value: string): string {
  return `status-badge status-user-${value.toLowerCase()}`;
}
