import { api } from "./http";
import { ApiUser, Role } from "./types";

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  role: Role;
  display_name?: string;
}

export const authApi = {
  register: (payload: RegisterPayload) => api.post<{ status: string }>("/register", payload),
  login: (payload: { identifier: string; password: string }) =>
    api.post<ApiUser>("/login", payload),
  googleLogin: (payload: { id_token: string }) =>
    api.post<ApiUser>("/auth/google", payload),
  logout: () => api.post<{ status: string }>("/logout"),
  currentSession: () => api.get<{ user: ApiUser | null }>("/session"),
  resetPassword: (payload: { email: string; password: string; token: string }) =>
    api.post<{ status: string }>("/password/reset", payload),
  forgotPassword: (payload: { email: string }) =>
    api.post<{ status: string }>("/password/forgot", payload),
};

