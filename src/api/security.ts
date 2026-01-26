import { api } from "./http";

export const securityApi = {
  changePassword: (payload: { current_password: string; new_password: string }) =>
    api.post<{ status: string }>("/password/change", payload),
  sendTestEmail: () => api.post<{ status: string }>("/security/test-email"),
};

