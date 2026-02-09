export type Role = "buyer" | "seller";

export interface ApiUser {
  id: number;
  username: string;
  email?: string;
  role: Role;
  display_name?: string;
  avatar_url?: string | null;
  bio?: string | null;
  wallet_address?: string | null;
}

export interface AuctionSummary {
  id: number;
  artwork_id: number;
  title: string;
  image_url?: string;
  price: number;
  start_price: number;
  current_bid?: number;
  end_time: string;
  status: string;
  seller_name?: string;
}

export interface ArtworkAuction {
  id: number;
  artwork_id: number;
  seller_id: number;
  start_price: number;
  reserve_price?: number;
  current_bid?: number;
  end_time: string;
  status: string;
  winner_id?: number;
  highest_bidder_id?: number;
}

export interface ArtworkSummary {
  id: number;
  title: string;
  description?: string;
  category?: string;
  image_url?: string;
  price?: number;
  is_listed: number;
  listing_type?: 'fixed' | 'auction' | 'display' | null;
  listing_expires_at?: string | null;
  views?: number;
  favorites?: number;
  created_at?: string | null;
  artist: {
    id: number;
    username?: string;
    display_name?: string;
    avatar_url?: string | null;
  };
  owner: {
    id: number;
    username?: string;
    display_name?: string;
    avatar_url?: string | null;
  };
  auction?: ArtworkAuction;
  bids?: Bid[];
}

export interface Bid {
  id: number;
  auction_id: number;
  bidder_id: number;
  amount: number;
  created_at: string;
}

export interface ActivityRecord {
  id: number;
  activity_type: string;
  price?: number;
  created_at: string;
  from_user?: {
    username?: string;
    display_name?: string;
  } | null;
  to_user?: {
    username?: string;
    display_name?: string;
  } | null;
}

export interface ArtworkDetail extends ArtworkSummary {
  created_at: string;
  activity?: ActivityRecord[];
}

export interface UserArtworkState {
  favorited: boolean;
  watching: boolean;
  active_bid: { id: number; amount: number; expires_at?: string | null } | null;
  available_balance: number;
  username?: string | null;
}

export interface ArtworkDetailResponse {
  artwork: ArtworkDetail;
  user_state: UserArtworkState | null;
}

export interface Balance {
  available_balance: number;
  pending_balance: number;
  total_earned: number;
  total_spent: number;
}

