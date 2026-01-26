import { api } from "./http";

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  artwork_id: number | null;
  is_read: number;
  created_at: string;
}

export const notificationsApi = {
  list: (limit = 10) => api.get<{ notifications: NotificationItem[]; unread: number }>(`/notifications?limit=${limit}`),
  markRead: (ids: number[]) => api.post<{ status: string }>("/notifications/mark-read", { ids }),
  markAllRead: () => api.post<{ status: string }>("/notifications/mark-all-read"),
};

