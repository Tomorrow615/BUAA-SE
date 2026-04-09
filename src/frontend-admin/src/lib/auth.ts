import { requestJson } from "./api";
import type { ApiUserProfile, AuthTokenResponse } from "./session-storage";

export interface LoginPayload {
  account: string;
  password: string;
}

export interface AdminCheckResponse {
  status: string;
  message: string;
  user_id: number;
  roles: string[];
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

export async function fetchCurrentUser(
  accessToken: string,
): Promise<ApiUserProfile> {
  return requestJson<ApiUserProfile>("/auth/me", {
    accessToken,
  });
}

export async function checkAdminPermission(
  accessToken: string,
): Promise<AdminCheckResponse> {
  return requestJson<AdminCheckResponse>("/auth/admin-check", {
    accessToken,
  });
}
