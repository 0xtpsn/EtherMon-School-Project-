import { api } from "./http";
import {
  ArtworkDetailResponse,
  ArtworkSummary,
} from "./types";

export const artworksApi = {
  create: (payload: Record<string, any>) =>
    api.post<{ status: string; artwork_id: number }>("/artworks", payload),
  list: (params?: { category?: string; listed?: boolean; trending?: boolean; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.category) query.set("category", params.category);
    if (typeof params?.listed === "boolean") query.set("listed", String(params.listed));
    if (params?.trending) query.set("trending", "true");
    if (params?.limit) query.set("limit", String(params.limit));
    const qs = query.toString();
    const path = qs ? `/artworks?${qs}` : "/artworks";
    return api.get<ArtworkSummary[]>(path);
  },
  detail: (id: number | string) => api.get<ArtworkDetailResponse>(`/artworks/${id}`),
  toggleFavorite: (id: number | string, favorite: boolean) =>
    api.post<{ favorited: boolean; favorites: number }>(`/artworks/${id}/favorite`, {
      favorite,
    }),
  toggleWatch: (id: number | string, watch: boolean) =>
    api.post<{ watching: boolean }>(`/artworks/${id}/watch`, {
      watch,
    }),
  purchase: (id: number | string) => api.post<{ status: string }>(`/artworks/${id}/purchase`),
  update: (id: number | string, payload: Record<string, any>) =>
    api.put<{ status: string }>(`/artworks/${id}`, payload),
  listForSale: (id: number | string, payload: Record<string, any>) =>
    api.post<{ status: string; type: string }>(`/artworks/${id}/list`, payload),
  delist: (id: number | string) => api.post<{ status: string }>(`/artworks/${id}/delist`),
  placeBid: (id: number | string, amount: number, expiresAt?: string) =>
    api.post<{ status: string; amount: number }>(`/artworks/${id}/bids`, { amount, expires_at: expiresAt }),
  recommendations: () => api.get<{ recommendations: ArtworkSummary[] }>("/recommendations"),
};

