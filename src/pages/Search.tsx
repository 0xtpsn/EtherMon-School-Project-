import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Search as SearchIcon, RefreshCw, Filter, ChevronDown, X } from "lucide-react";
import { searchApi } from "@/api/search";
import { ApiUser, Role } from "@/api/types";
import { formatCurrency } from "@/lib/utils";
import { getRoleBioPlaceholder } from "@/lib/bioPlaceholders";
import { useAllNFTs, NFTItem } from "@/hooks/useAllNFTs";
import ArtCard from "@/components/art/ArtCard";

const RARITY_OPTIONS = ["All", "Common", "Uncommon", "Rare", "Epic", "Legendary"];
const MARKET_STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "listed", label: "Listed" },
  { value: "auction", label: "Auction" },
  { value: "none", label: "Not Listed" },
];
const SORT_OPTIONS = [
  { value: "id-asc", label: "Token ID (Low → High)" },
  { value: "id-desc", label: "Token ID (High → Low)" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
];

const Search = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "nfts");

  // NFT data from blockchain
  const { nfts: allNFTs, loading: nftsLoading, refetch: refetchNFTs } = useAllNFTs();

  // Filter states
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rarityFilter, setRarityFilter] = useState(searchParams.get("rarity") || "All");
  const [marketFilter, setMarketFilter] = useState(searchParams.get("market") || "all");
  const [sortBy, setSortBy] = useState(searchParams.get("sort") || "id-asc");

  // Search users from backend API
  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const result = await searchApi.query(searchQuery.trim());
      setUsers(result.users);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  };

  // Debounced user search
  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchUsers();
    }, 300);
    return () => clearTimeout(debounce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Update URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    if (activeTab !== "nfts") params.set("tab", activeTab);
    if (rarityFilter !== "All") params.set("rarity", rarityFilter);
    if (marketFilter !== "all") params.set("market", marketFilter);
    if (sortBy !== "id-asc") params.set("sort", sortBy);
    setSearchParams(params, { replace: true });
  }, [searchQuery, activeTab, rarityFilter, marketFilter, sortBy, setSearchParams]);

  // Filter and sort NFTs client-side
  const filteredNFTs = useMemo(() => {
    let filtered = [...allNFTs];

    // Text search — match name, tokenId, type, or rarity
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((nft) => {
        const name = nft.name.toLowerCase();
        const tokenStr = `#${nft.tokenId}`;
        const rarity = nft.attributes.find(a => a.trait_type === "Rarity")?.value?.toString().toLowerCase() || "";
        const type = nft.attributes.find(a => a.trait_type === "Type")?.value?.toString().toLowerCase() || "";
        return (
          name.includes(q) ||
          tokenStr.includes(q) ||
          rarity.includes(q) ||
          type.includes(q)
        );
      });
    }

    // Rarity filter
    if (rarityFilter !== "All") {
      filtered = filtered.filter((nft) => {
        const rarity = nft.attributes.find(a => a.trait_type === "Rarity")?.value?.toString();
        return rarity?.toLowerCase() === rarityFilter.toLowerCase();
      });
    }

    // Market status filter
    if (marketFilter !== "all") {
      filtered = filtered.filter((nft) => nft.marketStatus === marketFilter);
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "id-asc":
          return a.tokenId - b.tokenId;
        case "id-desc":
          return b.tokenId - a.tokenId;
        case "price-low": {
          const pa = parseFloat(a.price) || 0;
          const pb = parseFloat(b.price) || 0;
          return pa - pb;
        }
        case "price-high": {
          const pa = parseFloat(a.price) || 0;
          const pb = parseFloat(b.price) || 0;
          return pb - pa;
        }
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        default:
          return 0;
      }
    });

    return filtered;
  }, [allNFTs, searchQuery, rarityFilter, marketFilter, sortBy]);

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (rarityFilter !== "All") count++;
    if (marketFilter !== "all") count++;
    if (sortBy !== "id-asc") count++;
    return count;
  }, [rarityFilter, marketFilter, sortBy]);

  const clearAllFilters = () => {
    setRarityFilter("All");
    setMarketFilter("all");
    setSortBy("id-asc");
  };

  const removeFilter = (filterType: string) => {
    switch (filterType) {
      case "rarity": setRarityFilter("All"); break;
      case "market": setMarketFilter("all"); break;
      case "sort": setSortBy("id-asc"); break;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-bold mb-8 bg-gradient-primary bg-clip-text text-transparent">
            Search
          </h1>

          <div className="flex gap-4 mb-8">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search NFTs by name, type, rarity, or token ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-secondary border-border"
              />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
              <TabsList>
                <TabsTrigger value="nfts">
                  NFTs ({nftsLoading ? "..." : filteredNFTs.length})
                </TabsTrigger>
                <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
              </TabsList>
              {activeTab === "nfts" && (
                <div className="flex flex-wrap gap-3 items-center justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={refetchNFTs}
                    className="gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${nftsLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setFiltersOpen(!filtersOpen)}
                    className="gap-2"
                  >
                    <Filter className="w-4 h-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge variant="secondary" className="ml-1">
                        {activeFilterCount}
                      </Badge>
                    )}
                    <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
                  </Button>
                </div>
              )}
            </div>

            {/* Active Filter Chips */}
            {activeTab === "nfts" && activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {rarityFilter !== "All" && (
                  <Badge variant="secondary" className="gap-1">
                    Rarity: {rarityFilter}
                    <button onClick={() => removeFilter("rarity")} className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {marketFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1">
                    Status: {MARKET_STATUS_OPTIONS.find(o => o.value === marketFilter)?.label}
                    <button onClick={() => removeFilter("market")} className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {sortBy !== "id-asc" && (
                  <Badge variant="secondary" className="gap-1">
                    Sort: {SORT_OPTIONS.find(o => o.value === sortBy)?.label}
                    <button onClick={() => removeFilter("sort")} className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-6 text-xs">
                  Clear All
                </Button>
              </div>
            )}

            {/* Collapsible Filter Panel */}
            {activeTab === "nfts" && (
              <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="mb-6">
                <CollapsibleContent className="space-y-4">
                  <Card className="bg-gradient-card border-border">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold">Filter NFTs</h3>
                        {activeFilterCount > 0 && (
                          <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-xs">
                            Clear All
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Rarity Filter */}
                        <div className="space-y-2">
                          <Label>Rarity</Label>
                          <Select value={rarityFilter} onValueChange={setRarityFilter}>
                            <SelectTrigger className="bg-secondary border-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RARITY_OPTIONS.map((r) => (
                                <SelectItem key={r} value={r}>{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Market Status Filter */}
                        <div className="space-y-2">
                          <Label>Market Status</Label>
                          <RadioGroup value={marketFilter} onValueChange={setMarketFilter}>
                            <div className="flex flex-col gap-2">
                              {MARKET_STATUS_OPTIONS.map((opt) => (
                                <div key={opt.value} className="flex items-center space-x-2">
                                  <RadioGroupItem value={opt.value} id={`market-${opt.value}`} />
                                  <Label htmlFor={`market-${opt.value}`} className="cursor-pointer font-normal">
                                    {opt.label}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </RadioGroup>
                        </div>

                        {/* Sort By */}
                        <div className="space-y-2">
                          <Label>Sort By</Label>
                          <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="bg-secondary border-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SORT_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* NFTs Tab */}
            <TabsContent value="nfts">
              {nftsLoading && allNFTs.length === 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="space-y-3">
                      <Skeleton className="aspect-square w-full rounded-lg" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : filteredNFTs.length > 0 ? (
                <>
                  {nftsLoading && (
                    <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Loading more NFTs...
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filteredNFTs.map((nft) => (
                      <ArtCard key={nft.tokenId} nft={nft} onRefetch={refetchNFTs} />
                    ))}
                  </div>
                </>
              ) : (
                <Card className="bg-gradient-card border-border">
                  <CardContent className="p-12 text-center">
                    <SearchIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground mb-4">
                      {searchQuery || activeFilterCount > 0
                        ? `No NFTs found${searchQuery ? ` for "${searchQuery}"` : ""}${activeFilterCount > 0 ? " with current filters" : ""}`
                        : "No NFTs minted yet"}
                    </p>
                    {activeFilterCount > 0 && (
                      <Button onClick={clearAllFilters} variant="outline" className="gap-2">
                        <X className="w-4 h-4" />
                        Clear Filters
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users">
              {usersLoading ? (
                <div className="grid gap-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Card key={i} className="bg-gradient-card border-border">
                      <CardContent className="p-6">
                        <div className="flex items-center gap-4">
                          <Skeleton className="w-16 h-16 rounded-full" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-1/3" />
                            <Skeleton className="h-3 w-1/2" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : users.length > 0 ? (
                <div className="grid gap-4">
                  {users.map((user) => (
                    <Card
                      key={user.id}
                      className="bg-gradient-card border-border hover:border-primary/50 cursor-pointer transition-all"
                      onClick={() => navigate(`/profile/${user.wallet_address || user.username || user.id}`)}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-center gap-4">
                          <Avatar className="w-16 h-16">
                            <AvatarImage src={user.avatar_url} />
                            <AvatarFallback>{(user.display_name || user.username || "U")[0].toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold">{user.display_name || user.username}</h3>
                            {user.username && <p className="text-sm text-muted-foreground">@{user.username}</p>}
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {user.bio?.trim() || getRoleBioPlaceholder(user.role as Role | undefined)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="bg-gradient-card border-border">
                  <CardContent className="p-12 text-center">
                    <SearchIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {searchQuery ? `No users found for "${searchQuery}"` : "Start searching to find users"}
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </div>
  );
};

export default Search;
