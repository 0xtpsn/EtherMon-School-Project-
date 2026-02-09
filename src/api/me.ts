import { api } from "./http";
import { ArtworkSummary, ApiUser } from "./types";

export interface ProfileResponse {
  profile: ApiUser & {
    bio?: string | null;
    banner_url?: string | null;
    twitter_handle?: string | null;
    instagram_handle?: string | null;
    website_url?: string | null;
    contact_email?: string | null;
    show_contact_email?: number;
    notification_email?: number;
    notification_bid?: number;
    notification_sale?: number;
    notification_like?: number;
    notification_watchlist_outbid?: number;
    notification_watchlist_ending?: number;
    notification_auction_sold?: number;
  };
}

export interface ProfileDetailResponse extends ProfileResponse {
  owned_artworks: ArtworkSummary[];
  liked_artworks: ArtworkSummary[];
  watchlist_artworks?: ArtworkSummary[];
  created_count: number;
  activity: any[];
  bids: any[];
}

export interface Transaction {
  id: number;
  type: string;
  amount: number;
  status: string;
  description?: string;
  artwork_id?: number | null;
  created_at: string;
}

export const meApi = {
  profile: () => api.get<ProfileResponse>("/me/profile"),
  updateProfile: (payload: Record<string, any>) => api.put<{ status: string }>("/me/profile", payload),
  updateNotifications: (payload: Record<string, any>) =>
    api.put<{ status: string }>("/me/notifications", payload),
  balance: () => api.get("/balance"),
  deposit: (amount: number) => api.post<{ status: string }>("/deposits", { amount }),
  withdraw: (amount: number) => api.post<{ status: string }>("/withdrawals", { amount }),
  transactions: (params: { limit?: number; offset?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.limit) search.set("limit", params.limit.toString());
    if (params.offset) search.set("offset", params.offset.toString());
    const path = search.toString() ? `/transactions?${search}` : "/transactions";
    return api.get<{ transactions: Transaction[]; total: number }>(path);
  },
  profileDetail: (identifier: string) => api.get<ProfileDetailResponse>(`/profiles/${identifier}`),
  updateWalletProfile: (walletAddress: string, payload: Record<string, any>) =>
    api.put<{ status: string; profile: any }>(`/profiles/wallet/${walletAddress}`, payload),
};

