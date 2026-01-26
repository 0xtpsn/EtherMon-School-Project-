import { api } from "./http";
import { AuctionSummary } from "./types";

export interface AuctionDetail {
  auction: {
    id: number;
    artwork_id: number;
    seller_id: number;
    start_price: number;
    reserve_price?: number | null;
    current_bid?: number | null;
    status: string;
    end_time: string;
    winner_id?: number | null;
    seller_username: string;
    title: string;
    description: string;
    category: string;
    image_url?: string;
  };
  bids: Array<{
    id: number;
    amount: number;
    created_at: string;
    bidder: string;
  }>;
}

export const auctionsApi = {
  list: () => api.get<AuctionSummary[]>("/auctions"),
  create: (payload: Record<string, any>) => api.post<{ status: string; auction_id: number }>("/auctions", payload),
  detail: (id: number) => api.get<AuctionDetail>(`/auctions/${id}`),
  placeBid: (auctionId: number, amount: number) => api.post<{ status: string }>(`/auctions/${auctionId}/bids`, { amount }),
  close: (auctionId: number) => api.post<{ status: string; winner_id: number | null }>(`/auctions/${auctionId}/close`),
  myAuctions: () => api.get(`/me/auctions`),
  myBids: () => api.get(`/me/bids`),
  updateBid: (bidId: number, amount: number) => api.put<{ status: string }>(`/bids/${bidId}`, { amount }),
  cancelBid: (bidId: number) => api.post<{ status: string }>(`/bids/${bidId}/cancel`),
};

