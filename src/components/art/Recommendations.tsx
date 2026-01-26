import { useEffect, useState, useMemo } from "react";
import ArtCard from "./ArtCard";
import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { useSession } from "@/context/SessionContext";
import { artworksApi } from "@/api/artworks";
import { ArtworkSummary } from "@/api/types";

interface RecommendationsProps {
  selectedCategory?: string;
  selectedTab?: string;
}

const Recommendations = ({ selectedCategory = "All", selectedTab = "all" }: RecommendationsProps) => {
  const { user } = useSession();
  const [recommendations, setRecommendations] = useState<ArtworkSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecommendations = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const { recommendations } = await artworksApi.recommendations();
        setRecommendations(recommendations || []);
      } catch (error) {
        // Silently fail - recommendations won't show
      } finally {
        setLoading(false);
      }
    };
    fetchRecommendations();
  }, [user]);

  // Filter recommendations based on category and tab
  const filteredRecommendations = useMemo(() => {
    let filtered = [...recommendations];

    // Apply category filter
    if (selectedCategory && selectedCategory !== "All") {
      filtered = filtered.filter(item => item.category === selectedCategory);
    }

    // Apply tab filter (all, auctions, trending)
    if (selectedTab === "auctions") {
      // Only show auction recommendations
      filtered = filtered.filter(item => {
        const auction = item.auction;
        if (!auction) return false;
        const isOpen = auction.status === "open";
        if (!isOpen) return false;
        const notExpired = new Date(auction.end_time).getTime() > Date.now();
        return notExpired;
      });
    } else if (selectedTab === "trending") {
      // For trending, show all recommendations (trending is handled by backend)
      // No additional filtering needed
    } else {
      // "all" tab - show all recommendations (listed or unlisted)
      // No additional filtering needed
    }

    return filtered;
  }, [recommendations, selectedCategory, selectedTab]);

  if (!user || loading || filteredRecommendations.length === 0) {
    return null;
  }

  return (
    <div className="mb-12">
      <Card className="bg-gradient-card border-border p-6 mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Recommended for You</h2>
            <p className="text-muted-foreground text-sm">
              Based on your bidding history and what similar collectors like
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredRecommendations.map((artwork) => {
          const auction = artwork.auction;
          const isAuction = Boolean(auction && auction.status === "open");
          const price = isAuction
            ? (auction?.current_bid ?? auction?.start_price ?? 0).toString()
            : (artwork.price ?? 0).toString();
          let endTime: string | undefined;
          if (isAuction && auction?.end_time) {
            const end = new Date(auction.end_time);
            const now = new Date();
            const diff = end.getTime() - now.getTime();
            const hours = Math.max(Math.floor(diff / (1000 * 60 * 60)), 0);
            const minutes = Math.max(Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)), 0);
            endTime = `${hours}h ${minutes}m`;
          }
          return (
            <ArtCard
              key={artwork.id}
              id={artwork.id.toString()}
              title={artwork.title}
              artist={artwork.artist?.display_name || artwork.artist?.username || "Unknown"}
              price={price}
              image={artwork.image_url || "/placeholder.svg"}
              endTime={endTime}
              isAuction={isAuction}
              isListed={Boolean(artwork.is_listed)}
              ownerId={artwork.owner.id}
            />
          );
        })}
      </div>
    </div>
  );
};

export default Recommendations;
