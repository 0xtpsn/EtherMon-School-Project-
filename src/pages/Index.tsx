import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import ArtCard from "@/components/art/ArtCard";
import Recommendations from "@/components/art/Recommendations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame, TrendingUp, Grid3x3, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import AuthDialog from "@/components/auth/AuthDialog";
import { artworksApi } from "@/api/artworks";
import { ArtworkSummary } from "@/api/types";
import { useSession } from "@/context/SessionContext";

const CATEGORIES = ["All", "Abstract", "Digital", "Photography", "3D Art", "Pixel Art", "Illustration"];

const Index = () => {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedTab, setSelectedTab] = useState("all");
  const [artworks, setArtworks] = useState<ArtworkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useSession();
  const navigate = useNavigate();

  const fetchArtworks = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await artworksApi.list();
      setArtworks(data);
    } catch (error: any) {
      setError(error);
      const errorMessage = error.status === 0
        ? "Unable to connect to server. Please check your connection."
        : "Failed to load artworks. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTrendingArtworks = async () => {
    try {
      const data = await artworksApi.list({ trending: true, limit: 20 });
      return data;
    } catch (error: any) {
      console.error("Failed to fetch trending artworks:", error);
      return [];
    }
  };

  useEffect(() => {
    fetchArtworks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Memoize filtered items to prevent unnecessary recalculations
  const filteredItems = useMemo(() => {
    return selectedCategory === "All" 
      ? artworks 
      : artworks.filter(item => item.category === selectedCategory);
  }, [artworks, selectedCategory]);

  const [trendingArtworks, setTrendingArtworks] = useState<ArtworkSummary[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(false);

  useEffect(() => {
    const loadTrending = async () => {
      setTrendingLoading(true);
      const trending = await fetchTrendingArtworks();
      setTrendingArtworks(trending);
      setTrendingLoading(false);
    };
    loadTrending();
  }, []);

  // Filter trending artworks by selected category
  const filteredTrendingArtworks = useMemo(() => {
    return selectedCategory === "All"
      ? trendingArtworks
      : trendingArtworks.filter(item => item.category === selectedCategory);
  }, [trendingArtworks, selectedCategory]);

  // Memoize separated items
  const { listedItems, unlistedItems, auctionItems } = useMemo(() => {
    const listed = filteredItems.filter(item => {
      if (!Boolean(item.is_listed)) return false;
      // Check if it's an expired fixed-price listing
      if (!item.auction && item.listing_expires_at) {
        const expiryDate = new Date(item.listing_expires_at);
        if (expiryDate.getTime() <= Date.now()) {
          return false; // Skip expired listings
        }
      }
      return true;
    });
    const unlisted = filteredItems.filter(item => !Boolean(item.is_listed));
    const auctions = listed.filter(item => {
      const auction = item.auction;
      if (!auction || typeof auction !== 'object') return false;
      // Check if auction is open and not expired
      const isOpen = auction.status === "open";
      if (!isOpen) return false;
      const notExpired = new Date(auction.end_time).getTime() > Date.now();
      return notExpired;
    });
    // Fixed-price listings: items that are listed but not active auctions
    const fixedPriceListings = listed.filter(item => {
      const hasOpenAuction = item.auction && typeof item.auction === 'object' && 
        item.auction.status === "open" && 
        new Date(item.auction.end_time).getTime() > Date.now();
      return !hasOpenAuction; // Only show if it's not an active auction
    });
    return {
      listedItems: fixedPriceListings, // Now only contains fixed-price listings
      unlistedItems: unlisted,
      auctionItems: auctions,
    };
  }, [filteredItems]);

  const formatEndTime = (endTime: string) => {
    const end = new Date(endTime);
    const now = new Date();
    const timeDiff = end.getTime() - now.getTime();
    if (timeDiff <= 0) return "Ended";
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
      
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
            Discover Digital Art
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Explore, collect, and sell extraordinary digital artworks from creators worldwide
          </p>
        </div>

        {/* Categories */}
        <div className="flex flex-wrap gap-2 justify-center mb-8">
          {CATEGORIES.map((category) => (
            <Button
              key={category}
              variant={selectedCategory === category ? "default" : "outline"}
              className={
                selectedCategory === category
                  ? "bg-gradient-primary hover:bg-gradient-hover"
                  : "border-border hover:border-primary/50"
              }
              onClick={() => setSelectedCategory(category)}
            >
              {category}
            </Button>
          ))}
        </div>

        {/* Content Tabs */}
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto grid-cols-3 mb-8">
            <TabsTrigger value="all" className="flex items-center gap-2">
              <Grid3x3 className="w-4 h-4" />
              All
            </TabsTrigger>
            <TabsTrigger value="auctions" className="flex items-center gap-2">
              <Flame className="w-4 h-4" />
              Auctions
            </TabsTrigger>
            <TabsTrigger value="trending" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Trending
            </TabsTrigger>
          </TabsList>

          {/* All Items - Shows everything in one page */}
          <TabsContent value="all" className="mt-0 space-y-12">
            {/* Recommendations Section */}
            <Recommendations selectedCategory={selectedCategory} selectedTab={selectedTab} />

            {/* Live Auctions Section */}
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <Skeleton className="aspect-square w-full rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  {error.status === 0
                    ? "Unable to connect to server. Please check your connection."
                    : "Failed to load artworks."}
                </p>
                <Button onClick={fetchArtworks} variant="outline" className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </Button>
              </div>
            ) : (
              <>
                {auctionItems.length > 0 && (
                  <div>
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold mb-2">🔥 Live Auctions</h2>
                      <p className="text-muted-foreground">Place your bids before time runs out</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {auctionItems.map((item) => {
                        const displayPrice = item.auction 
                          ? (item.auction.current_bid ?? item.auction.start_price ?? 0)
                          : (item.price ?? 0);
                        return (
                          <ArtCard 
                            key={item.id} 
                            id={item.id}
                            title={item.title}
                            artist={item.artist.display_name || item.artist.username || "Unknown"}
                            price={displayPrice.toString()}
                            image={item.image_url || ""}
                            isAuction={true}
                            isListed={Boolean(item.is_listed)}
                            endTime={item.auction ? formatEndTime(item.auction.end_time) : undefined}
                            ownerId={item.owner.id.toString()}
                            onAuthRequired={() => setAuthDialogOpen(true)}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Trending & All Items */}
                <div>
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold mb-2">🎨 Available Artworks</h2>
                    <p className="text-muted-foreground">Browse and purchase digital art</p>
                  </div>
                  {listedItems.filter(item => {
                    // Only show fixed-price listings (items without open auctions)
                    const hasAuction = item.auction && typeof item.auction === 'object';
                    if (hasAuction) {
                      // If auction exists and is open, exclude from this section
                      return item.auction.status !== "open";
                    }
                    // No auction = fixed price listing, show it
                    return true;
                  }).length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {listedItems.filter(item => {
                        // Only show fixed-price listings (items without open auctions)
                        const hasAuction = item.auction && typeof item.auction === 'object';
                        if (hasAuction) {
                          // If auction exists and is open, exclude from this section
                          return item.auction.status !== "open";
                        }
                        // No auction = fixed price listing, show it
                        return true;
                      }).map((item) => {
                        // This section is for fixed-price listings only, so isAuction should always be false
                        return (
                          <ArtCard 
                            key={item.id} 
                            id={item.id}
                            title={item.title}
                            artist={item.artist.display_name || item.artist.username || "Unknown"}
                            price={(item.price || 0).toString()}
                            image={item.image_url || ""}
                            isAuction={false}
                            isListed={Boolean(item.is_listed)}
                            ownerId={item.owner.id.toString()}
                            onAuthRequired={() => setAuthDialogOpen(true)}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground mb-4">
                        {unlistedItems.length > 0 
                          ? "No listed artworks available. Check the Unlisted Artworks section below."
                          : "No artworks available"}
                      </p>
                      {user?.role === "seller" && (
                        <Button 
                          onClick={() => navigate("/create")} 
                          variant="outline"
                        >
                          Create Artwork
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Unlisted Artworks */}
                {unlistedItems.length > 0 && (
                  <div>
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold mb-2">📂 Unlisted Artworks</h2>
                      <p className="text-muted-foreground">Not currently for sale</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {unlistedItems.map((item) => (
                        <ArtCard 
                          key={item.id} 
                          id={item.id}
                          title={item.title}
                          artist={item.artist.display_name || item.artist.username || "Unknown"}
                          price={(item.price || 0).toString()}
                          image={item.image_url || ""}
                          isAuction={false}
                          isListed={false}
                          ownerId={item.owner.id.toString()}
                          onAuthRequired={() => setAuthDialogOpen(true)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="auctions" className="mt-0">
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">Live Auctions</h2>
              <p className="text-muted-foreground">Place your bids before time runs out</p>
            </div>
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <Skeleton className="aspect-square w-full rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))}
              </div>
            ) : auctionItems.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {auctionItems.map((item) => (
                  <ArtCard 
                    key={item.id} 
                    id={item.id}
                    title={item.title}
                    artist={item.artist.display_name || item.artist.username || "Unknown"}
                    price={(
                      item.auction?.current_bid ??
                      item.price ??
                      item.auction?.start_price ??
                      0
                    ).toString()}
                    image={item.image_url || ""}
                    isAuction={true}
                    isListed={Boolean(item.is_listed)}
                    endTime={item.auction ? formatEndTime(item.auction.end_time) : undefined}
                    ownerId={item.owner.id.toString()}
                    onAuthRequired={() => setAuthDialogOpen(true)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No active auctions at the moment</p>
                <p className="text-sm text-muted-foreground">
                  Check back later or create an auction yourself!
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="trending" className="mt-0">
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">Trending Now</h2>
              <p className="text-muted-foreground">Most popular artworks based on views, likes, and recent activity</p>
            </div>
            {trendingLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <Skeleton className="aspect-square w-full rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredTrendingArtworks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredTrendingArtworks.map((item) => (
                  <ArtCard 
                    key={item.id} 
                    id={item.id}
                    title={item.title}
                    artist={item.artist.display_name || item.artist.username || "Unknown"}
                    price={(item.price || 0).toString()}
                    image={item.image_url || ""}
                    isAuction={false}
                    isListed={Boolean(item.is_listed)}
                    ownerId={item.owner.id.toString()}
                    onAuthRequired={() => setAuthDialogOpen(true)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  {selectedCategory === "All" 
                    ? "No trending artworks yet" 
                    : `No trending ${selectedCategory} artworks yet`}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  Trending artworks are determined by views, likes, and recent activity
                </p>
                {user?.role === "seller" ? (
                  <Button 
                    onClick={() => navigate("/create")} 
                    variant="outline"
                  >
                    Create Artwork
                  </Button>
                ) : !user ? (
                  <Button 
                    onClick={() => setAuthDialogOpen(true)} 
                    variant="outline"
                  >
                    Sign in to Create
                  </Button>
                ) : null}
              </div>
            )}
          </TabsContent>

        </Tabs>
      </main>
    </div>
  );
};

export default Index;
