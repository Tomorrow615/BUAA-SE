import { USER_STORAGE_KEY } from "./config";

export interface SessionUser {
  id: number | null;
  username: string;
  email: string | null;
  displayName: string | null;
  status: string | null;
  roles: string[];
}

export interface AuthSession {
  accessToken: string;
  tokenType: string;
  expiresAt: string | null;
  createdAt: string;
  source: "placeholder" | "api";
  user: SessionUser;
}

export interface ApiUserProfile {
  id: number;
  username: string;
  email: string;
  display_name: string | null;
  status: string;
  roles: string[];
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: ApiUserProfile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function parseUser(value: unknown): SessionUser | null {
  if (!isRecord(value)) {
    return null;
  }

  const username = normalizeString(value.username);
  if (!username) {
    return null;
  }

  const roles = Array.isArray(value.roles)
    ? value.roles.filter((item): item is string => typeof item === "string")
    : [];

  return {
    id: typeof value.id === "number" ? value.id : null,
    username,
    email: normalizeString(value.email),
    displayName: normalizeString(value.displayName),
    status: normalizeString(value.status),
    roles,
  };
}

export function loadSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    const user = parseUser(parsed.user);
    const accessToken = normalizeString(parsed.accessToken);
    const tokenType = normalizeString(parsed.tokenType) ?? "bearer";
    const createdAt = normalizeString(parsed.createdAt);
    const source = parsed.source === "api" ? "api" : "placeholder";

    if (!user || !accessToken || !createdAt) {
      return null;
    }

    return {
      accessToken,
      tokenType,
      expiresAt: normalizeString(parsed.expiresAt),
      createdAt,
      source,
      user,
    };
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(session));
}

export function clearSessionStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(USER_STORAGE_KEY);
}

export function isSessionExpired(session: AuthSession): boolean {
  if (!session.expiresAt) {
    return false;
  }

  return new Date(session.expiresAt).getTime() <= Date.now();
}

export function buildApiSession(payload: AuthTokenResponse): AuthSession {
  const now = Date.now();
  const expiresAt = new Date(now + payload.expires_in * 1000).toISOString();

  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type,
    expiresAt,
    createdAt: new Date(now).toISOString(),
    source: "api",
    user: {
      id: payload.user.id,
      username: payload.user.username,
      email: payload.user.email,
      displayName: payload.user.display_name,
      status: payload.user.status,
      roles: payload.user.roles,
    },
  };
}
