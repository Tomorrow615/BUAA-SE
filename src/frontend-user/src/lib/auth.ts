import { requestJson } from "./api";
import type { ApiUserProfile, AuthTokenResponse } from "./session-storage";

export interface LoginPayload {
  account: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  displayName?: string;
}

export async function login(payload: LoginPayload): Promise<AuthTokenResponse> {
  return requestJson<AuthTokenResponse>("/auth/login", {
    method: "POST",
    body: {
      account: payload.account,
      password: payload.password,
    },
  });
}

export async function register(
  payload: RegisterPayload,
): Promise<AuthTokenResponse> {
  return requestJson<AuthTokenResponse>("/auth/register", {
    method: "POST",
    body: {
      username: payload.username,
      email: payload.email,
      password: payload.password,
      display_name: payload.displayName?.trim() || null,
    },
  });
}

export async function fetchCurrentUser(
  accessToken: string,
): Promise<ApiUserProfile> {
  return requestJson<ApiUserProfile>("/auth/me", {
    accessToken,
  });
}
