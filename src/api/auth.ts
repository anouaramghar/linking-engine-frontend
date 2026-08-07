import { api } from "./client";

export type DashboardUserStatus = "pending" | "approved" | "revoked";

export interface DashboardUser {
  id: number;
  telegram_id: number;
  username: string | null;
  display_name: string | null;
  status: DashboardUserStatus;
  requested_at: string;
  approved_at: string | null;
  approved_by: string | null;
  last_seen_at: string | null;
}

export interface LoginStart {
  nonce: string;
  deep_link: string;
  expires_in_seconds: number;
}

/**
 * `waiting` is the only state worth polling again. The endpoint answers 200 for
 * all of them on purpose: a 401 here would be indistinguishable from the proxy
 * refusing the request, and "not yet" is not a failure.
 */
export type LoginState = "waiting" | "approved" | "pending" | "revoked" | "invalid";

export interface LoginPoll {
  state: LoginState;
  user: DashboardUser | null;
}

export const startLogin = () =>
  api.post<LoginStart>("/auth/login/start").then((response) => response.data);

export const pollLogin = (nonce: string) =>
  api.get<LoginPoll>(`/auth/login/${nonce}`).then((response) => response.data);

export const getSession = () =>
  api.get<{ user: DashboardUser }>("/auth/session").then((response) => response.data.user);

export const logout = () => api.post("/auth/logout").then(() => undefined);

export const listDashboardUsers = () =>
  api.get<DashboardUser[]>("/auth/users").then((response) => response.data);

export const approveDashboardUser = (id: number) =>
  api.post<DashboardUser>(`/auth/users/${id}/approve`).then((response) => response.data);

export const revokeDashboardUser = (id: number) =>
  api.post<DashboardUser>(`/auth/users/${id}/revoke`).then((response) => response.data);

/** How a person is named in the approval queue, best identifier first. */
export const describeUser = (user: DashboardUser) =>
  user.display_name ?? (user.username ? `@${user.username}` : `Telegram ${user.telegram_id}`);
