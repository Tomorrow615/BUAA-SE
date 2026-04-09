import { API_BASE_URL } from "./config";

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export interface RequestOptions extends Omit<RequestInit, "body"> {
  accessToken?: string | null;
  body?: BodyInit | Record<string, unknown> | unknown[] | null;
}

function isJsonBody(
  value: RequestOptions["body"],
): value is Record<string, unknown> | unknown[] {
  return (
    Array.isArray(value) ||
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

function extractErrorMessage(statusText: string, payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
  }

  return statusText || "Request failed.";
}

export async function requestJson<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");

  let requestBody: BodyInit | undefined;
  if (isJsonBody(options.body)) {
    headers.set("Content-Type", "application/json");
    requestBody = JSON.stringify(options.body);
  } else if (options.body) {
    requestBody = options.body;
  }

  if (options.accessToken) {
    headers.set("Authorization", `Bearer ${options.accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    body: requestBody,
    headers,
  });

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      extractErrorMessage(response.statusText, payload),
      response.status,
      payload,
    );
  }

  return payload as T;
}
