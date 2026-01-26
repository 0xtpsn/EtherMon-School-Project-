import { api } from "./http";
import { ArtworkSummary, ApiUser } from "./types";

export const searchApi = {
  query: async (term: string) => {
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    const qs = params.toString();
    const path = qs ? `/search?${qs}` : "/search";
    return api.get<{ artworks: ArtworkSummary[]; users: ApiUser[] }>(path);
  },
};

