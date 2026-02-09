import { api } from "./http";

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  artwork_id: number | null;
  token_id: number | null;
  from_wallet: string | null;
  is_read: number;
  created_at: string;
}

export interface LikeStatus {
  count: number;
  liked: boolean;
}

export const notificationsApi = {
  // Legacy session-based notifications
  list: (limit = 10) => api.get<{ notifications: NotificationItem[]; unread: number }>(`/notifications?limit=${limit}`),
  markRead: (ids: number[]) => api.post<{ status: string }>("/notifications/mark-read", { ids }),
  markAllRead: () => api.post<{ status: string }>("/notifications/mark-all-read"),

  // Wallet-based notifications (for web3 users)
  listByWallet: (wallet: string, limit = 20) =>
    api.get<{ notifications: NotificationItem[]; unread: number }>(`/notifications/wallet/${wallet}?limit=${limit}`),
  markReadByWallet: (wallet: string, ids: number[]) =>
    api.post<{ status: string }>(`/notifications/wallet/${wallet}/mark-read`, { ids }),
};

export interface Liker {
  wallet: string;
  display_name: string | null;
  avatar_url: string | null;
  liked_at: string;
}

export const nftLikesApi = {
  /**
   * Like an NFT
   */
  like: (tokenId: number, likerWallet: string, ownerWallet: string) =>
    api.post<{ status: string }>(`/nfts/${tokenId}/like`, {
      liker_wallet: likerWallet,
      owner_wallet: ownerWallet,
    }),

  /**
   * Unlike an NFT
   */
  unlike: (tokenId: number, likerWallet: string) =>
    api.delete<{ status: string }>(`/nfts/${tokenId}/like?liker_wallet=${likerWallet}`),

  /**
   * Get like count and whether current wallet has liked
   */
  getStatus: (tokenId: number, wallet?: string) =>
    api.get<LikeStatus>(`/nfts/${tokenId}/likes${wallet ? `?wallet=${wallet}` : ""}`),

  /**
   * Get all token IDs liked by a wallet
   */
  likedByWallet: (wallet: string) =>
    api.get<{ token_ids: number[] }>(`/nfts/liked-by/${wallet}`),

  /**
   * Get list of users who liked an NFT
   */
  getLikers: (tokenId: number) =>
    api.get<{ likers: Liker[] }>(`/nfts/${tokenId}/likers`),
};
