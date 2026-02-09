import { useMemo, useState } from "react";
import Navbar from "@/components/layout/Navbar";
import ArtCard from "@/components/art/ArtCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Flame, Grid3x3, Tag, RefreshCw } from "lucide-react";
import { useAllNFTs } from "@/hooks/useAllNFTs";

const CATEGORIES = ["All", "Fire", "Water", "Grass", "Electric", "Psychic", "Dragon", "Normal", "Fighting", "Ghost"];

const Index = () => {
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedTab, setSelectedTab] = useState("all");
  const { nfts, loading, error, refetch } = useAllNFTs();

  // Filter by Pokémon type (from metadata attributes)
  const filteredNFTs = useMemo(() => {
    if (selectedCategory === "All") return nfts;
    return nfts.filter((nft) => {
      const primaryType = nft.attributes.find((a) => a.trait_type === "Type")?.value;
      const secondaryType = nft.attributes.find((a) => a.trait_type === "Secondary Type")?.value;
      return primaryType === selectedCategory || secondaryType === selectedCategory;
    });
  }, [nfts, selectedCategory]);

  // Split by marketplace status
  const { listedNFTs, auctionNFTs, unlistedNFTs } = useMemo(() => ({
    listedNFTs: filteredNFTs.filter((n) => n.marketStatus === "listed"),
    auctionNFTs: filteredNFTs.filter((n) => n.marketStatus === "auction"),
    unlistedNFTs: filteredNFTs.filter((n) => n.marketStatus === "none"),
  }), [filteredNFTs]);

  const formatEndTime = (endTimeUnix: number) => {
    const timeDiff = endTimeUnix * 1000 - Date.now();
    if (timeDiff <= 0) return "Ended";
    const hours = Math.floor(timeDiff / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const SkeletonGrid = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );

  const NFTGrid = ({ items }: { items: typeof nfts }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {items.map((nft) => (
        <ArtCard key={nft.tokenId} nft={nft} onRefetch={refetch} />
      ))}
    </div>
  );

  const EmptyState = ({ message }: { message: string }) => (
    <div className="text-center py-12">
      <p className="text-muted-foreground">{message}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 bg-gradient-primary bg-clip-text text-transparent">
            Discover Pokémon NFTs
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Catch, trade, and collect Pokémon NFTs
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
              All ({filteredNFTs.length})
            </TabsTrigger>
            <TabsTrigger value="sale" className="flex items-center gap-2">
              <Tag className="w-4 h-4" />
              For Sale ({listedNFTs.length})
            </TabsTrigger>
            <TabsTrigger value="auctions" className="flex items-center gap-2">
              <Flame className="w-4 h-4" />
              Auctions ({auctionNFTs.length})
            </TabsTrigger>
          </TabsList>

          {/* All NFTs */}
          <TabsContent value="all" className="mt-0 space-y-12">
            {loading ? (
              <SkeletonGrid />
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">Failed to load NFTs from the blockchain.</p>
                <Button onClick={() => window.location.reload()} variant="outline" className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </Button>
              </div>
            ) : filteredNFTs.length > 0 ? (
              <>
                {/* Auctions Section (if any) */}
                {auctionNFTs.length > 0 && (
                  <div>
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold mb-2">🔥 Live Auctions</h2>
                      <p className="text-muted-foreground">Place your bids before time runs out</p>
                    </div>
                    <NFTGrid items={auctionNFTs} />
                  </div>
                )}

                {/* For Sale Section (if any) */}
                {listedNFTs.length > 0 && (
                  <div>
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold mb-2">💰 For Sale</h2>
                      <p className="text-muted-foreground">Buy Pokémon NFTs at a fixed price</p>
                    </div>
                    <NFTGrid items={listedNFTs} />
                  </div>
                )}

                {/* Not Listed Section */}
                {unlistedNFTs.length > 0 && (
                  <div>
                    <div className="mb-6">
                      <h2 className="text-2xl font-bold mb-2">⚡ All Pokémon</h2>
                      <p className="text-muted-foreground">Browse the collection</p>
                    </div>
                    <NFTGrid items={unlistedNFTs} />
                  </div>
                )}
              </>
            ) : (
              <EmptyState message={
                selectedCategory === "All"
                  ? "No NFTs minted yet — be the first to mint!"
                  : `No ${selectedCategory}-type Pokémon found`
              } />
            )}
          </TabsContent>

          {/* For Sale */}
          <TabsContent value="sale" className="mt-0">
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">💰 For Sale</h2>
              <p className="text-muted-foreground">Pokémon listed at a fixed price</p>
            </div>
            {loading ? (
              <SkeletonGrid />
            ) : listedNFTs.length > 0 ? (
              <NFTGrid items={listedNFTs} />
            ) : (
              <EmptyState message="No Pokémon are listed for sale right now" />
            )}
          </TabsContent>

          {/* Auctions */}
          <TabsContent value="auctions" className="mt-0">
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">🔥 Live Auctions</h2>
              <p className="text-muted-foreground">Place your bids before time runs out</p>
            </div>
            {loading ? (
              <SkeletonGrid />
            ) : auctionNFTs.length > 0 ? (
              <NFTGrid items={auctionNFTs} />
            ) : (
              <EmptyState message="No active auctions at the moment" />
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
