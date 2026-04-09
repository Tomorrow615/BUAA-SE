const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

const resolvedApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;

export const API_BASE_URL = trimTrailingSlash(resolvedApiBaseUrl);
export const ADMIN_STAGE_LABEL = "第 7 步 · 管理端页面骨架已完成";
export const ADMIN_STORAGE_KEY = "business-research-platform:admin-session";
