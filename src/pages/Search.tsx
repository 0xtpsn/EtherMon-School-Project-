import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ArtCard from "@/components/art/ArtCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search as SearchIcon, RefreshCw, Plus, Filter, ChevronDown, X } from "lucide-react";
import { searchApi } from "@/api/search";
import { ArtworkSummary, ApiUser, Role } from "@/api/types";
import { useSession } from "@/context/SessionContext";
import { formatCurrency } from "@/lib/utils";
import { getRoleBioPlaceholder } from "@/lib/bioPlaceholders";

const CATEGORIES = ["All", "Abstract", "Digital", "Photography", "3D Art", "Pixel Art", "Illustration"];
const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
  { value: "alphabet-asc", label: "Alphabetical (A-Z)" },
  { value: "alphabet-desc", label: "Alphabetical (Z-A)" },
];

const Search = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useSession();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [artworks, setArtworks] = useState<ArtworkSummary[]>([]);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<any>(null);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "artworks");
  const [artView, setArtView] = useState<"grid" | "table">(
    (searchParams.get("view") as "grid" | "table") || "grid"
  );
  // Filter states - load from URL params
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get("category") || "All");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "all");
  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") || "");
  const [sortBy, setSortBy] = useState(searchParams.get("sort") || "newest");

  const fetchResults = async () => {
    setLoading(true);
    setError(null);
    try {
      const { artworks, users } = await searchApi.query(searchQuery.trim());
      setArtworks(artworks);
      setUsers(users);
    } catch (error: any) {
      setError(error);
      setArtworks([]);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  // Update URL params when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("q", searchQuery);
    if (activeTab !== "artworks") params.set("tab", activeTab);
    if (artView !== "grid") params.set("view", artView);
    if (categoryFilter !== "All") params.set("category", categoryFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (sortBy !== "newest") params.set("sort", sortBy);
    
    setSearchParams(params, { replace: true });
  }, [searchQuery, activeTab, categoryFilter, statusFilter, minPrice, maxPrice, sortBy, artView, setSearchParams]);

  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchResults();
    }, 300);
    return () => clearTimeout(debounce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  // Filter and sort artworks
  const filteredAndSortedArtworks = useMemo(() => {
    try {
      let filtered = [...artworks];

    // Category filter (case-insensitive)
    if (categoryFilter !== "All") {
      filtered = filtered.filter(a => 
        a.category?.toLowerCase() === categoryFilter.toLowerCase()
      );
    }

    // Status filter
    if (statusFilter === "listed") {
      filtered = filtered.filter(a => Boolean(a.is_listed) && (!a.auction || a.auction.status !== "open"));
    } else if (statusFilter === "auctions") {
      filtered = filtered.filter(a => Boolean(a.is_listed) && a.auction && a.auction.status === "open");
    } else if (statusFilter === "unlisted") {
      filtered = filtered.filter(a => !Boolean(a.is_listed));
    }

    // Price range filter
    if (minPrice || maxPrice) {
      const min = minPrice ? parseFloat(minPrice) : 0;
      const max = maxPrice ? parseFloat(maxPrice) : Infinity;
      
      // When price range is set, only show listed items (they have prices)
      // Unlisted items don't have prices and shouldn't appear
        filtered = filtered.filter(a => {
        // Exclude unlisted items when price filter is active
        if (!Boolean(a.is_listed)) return false;
        
          const price = a.auction 
            ? (a.auction.current_bid ?? a.auction.start_price ?? a.price ?? null)
            : (a.price ?? null);
          // Only filter items with valid prices (exclude null/undefined, but allow 0)
          if (price === null || price === undefined) return false;
        
        // Validate price range
        if (!isNaN(min) && !isNaN(max) && min <= max) {
          return price >= min && price <= max;
      } else if (minPrice && !isNaN(min)) {
        // Only min price specified
          return price >= min;
      } else if (maxPrice && !isNaN(max)) {
        // Only max price specified
          return price <= max;
        }
        return false;
        });
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "newest": {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateB - dateA;
        }
        case "oldest": {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateA - dateB;
        }
        case "price-low": {
          const priceA = a.auction 
            ? (a.auction.current_bid ?? a.auction.start_price ?? a.price ?? Infinity)
            : (a.price ?? Infinity);
          const priceB = b.auction 
            ? (b.auction.current_bid ?? b.auction.start_price ?? b.price ?? Infinity)
            : (b.price ?? Infinity);
          // Items without prices go to the end
          return priceA - priceB;
        }
        case "price-high": {
          const priceA = a.auction 
            ? (a.auction.current_bid ?? a.auction.start_price ?? a.price ?? -Infinity)
            : (a.price ?? -Infinity);
          const priceB = b.auction 
            ? (b.auction.current_bid ?? b.auction.start_price ?? b.price ?? -Infinity)
            : (b.price ?? -Infinity);
          // Items without prices go to the end
          return priceB - priceA;
        }
        case "alphabet-asc": {
          const titleA = (a.title || "").toLowerCase();
          const titleB = (b.title || "").toLowerCase();
          return titleA.localeCompare(titleB);
        }
        case "alphabet-desc": {
          const titleA = (a.title || "").toLowerCase();
          const titleB = (b.title || "").toLowerCase();
          return titleB.localeCompare(titleA);
        }
        default:
          return 0;
      }
    });

    return filtered;
    } catch (error) {
      // If filtering/sorting fails, return original artworks
      console.error("Error filtering/sorting artworks:", error);
      return artworks;
    }
  }, [artworks, categoryFilter, statusFilter, minPrice, maxPrice, sortBy]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (categoryFilter !== "All") count++;
    if (statusFilter !== "all") count++;
    if (minPrice) count++;
    if (maxPrice) count++;
    if (sortBy !== "newest") count++;
    return count;
  }, [categoryFilter, statusFilter, minPrice, maxPrice, sortBy]);

  // Clear all filters
  const clearAllFilters = () => {
    setCategoryFilter("All");
    setStatusFilter("all");
    setMinPrice("");
    setMaxPrice("");
    setSortBy("newest");
  };

  // Remove individual filter
  const removeFilter = (filterType: string) => {
    switch (filterType) {
      case "category":
        setCategoryFilter("All");
        break;
      case "status":
        setStatusFilter("all");
        break;
      case "minPrice":
        setMinPrice("");
        break;
      case "maxPrice":
        setMaxPrice("");
        break;
      case "sort":
        setSortBy("newest");
        break;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-8 bg-gradient-primary bg-clip-text text-transparent">
            Search
          </h1>
          
          <div className="flex gap-4 mb-8">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search artworks or users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-secondary border-border"
              />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
              <TabsList>
                <TabsTrigger value="artworks">Artworks ({filteredAndSortedArtworks.length})</TabsTrigger>
                <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
              </TabsList>
              {activeTab === "artworks" && (
                <div className="flex flex-wrap gap-3 items-center justify-end">
                  <div className="flex rounded-full border border-border overflow-hidden" role="group" aria-label="Toggle artworks view">
                    <button
                      type="button"
                      onClick={() => setArtView("grid")}
                      className={`px-3 py-1 text-sm flex items-center gap-1 ${artView === "grid" ? "bg-foreground text-background" : "text-muted-foreground"}`}
                      aria-pressed={artView === "grid"}
                    >
                      <span className="hidden sm:inline">Grid</span>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <rect x="2" y="2" width="4" height="4" />
                        <rect x="10" y="2" width="4" height="4" />
                        <rect x="2" y="10" width="4" height="4" />
                        <rect x="10" y="10" width="4" height="4" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => setArtView("table")}
                      className={`px-3 py-1 text-sm flex items-center gap-1 ${artView === "table" ? "bg-foreground text-background" : "text-muted-foreground"}`}
                      aria-pressed={artView === "table"}
                    >
                      <span className="hidden sm:inline">Table</span>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                        <rect x="2" y="3" width="12" height="2" />
                        <rect x="2" y="7" width="12" height="2" />
                        <rect x="2" y="11" width="12" height="2" />
                      </svg>
                    </button>
                  </div>
                <Button
                  variant="outline"
                  onClick={() => setFiltersOpen(!filtersOpen)}
                  className="gap-2"
                    aria-label={`${filtersOpen ? "Close" : "Open"} filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ""}`}
                  aria-expanded={filtersOpen}
                >
                  <Filter className="w-4 h-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-1" aria-label={`${activeFilterCount} active filters`}>
                      {activeFilterCount}
                    </Badge>
                  )}
                    <ChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
                </Button>
                </div>
              )}
            </div>

            {/* Active Filter Chips */}
            {activeTab === "artworks" && activeFilterCount > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {categoryFilter !== "All" && (
                  <Badge variant="secondary" className="gap-1">
                    Category: {categoryFilter}
                    <button
                      onClick={() => removeFilter("category")}
                      className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {statusFilter !== "all" && (
                  <Badge variant="secondary" className="gap-1">
                    Status: {statusFilter === "listed" ? "Listed" : statusFilter === "auctions" ? "Auctions" : "Unlisted"}
                    <button
                      onClick={() => removeFilter("status")}
                      className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {minPrice && (
                  <Badge variant="secondary" className="gap-1">
                    Min: ${formatCurrency(parseFloat(minPrice) || 0)}
                    <button
                      onClick={() => removeFilter("minPrice")}
                      className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {maxPrice && (
                  <Badge variant="secondary" className="gap-1">
                    Max: ${formatCurrency(parseFloat(maxPrice) || 0)}
                    <button
                      onClick={() => removeFilter("maxPrice")}
                      className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {sortBy !== "newest" && (
                  <Badge variant="secondary" className="gap-1">
                    Sort: {SORT_OPTIONS.find(o => o.value === sortBy)?.label}
                    <button
                      onClick={() => removeFilter("sort")}
                      className="ml-1 hover:bg-secondary-foreground/20 rounded-full p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="h-6 text-xs"
                >
                  Clear All
                </Button>
              </div>
            )}

            {/* Collapsible Filter Section */}
            {activeTab === "artworks" && (
              <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen} className="mb-6">
                <CollapsibleContent className="space-y-4" aria-label="Artwork filters">
                  <Card className="bg-gradient-card border-border">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold">Filter Artworks</h3>
                        {activeFilterCount > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={clearAllFilters}
                            className="text-xs"
                            aria-label="Clear all filters"
                          >
                            Clear All
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Category Filter */}
                        <div className="space-y-2">
                          <Label htmlFor="category-filter">Category</Label>
                          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                            <SelectTrigger id="category-filter" className="bg-secondary border-border" aria-label="Filter by category">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map((cat) => (
                                <SelectItem key={cat} value={cat}>
                                  {cat}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Status Filter */}
                        <div className="space-y-2">
                          <Label>Listing Status</Label>
                          <RadioGroup value={statusFilter} onValueChange={setStatusFilter}>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="all" id="status-all" />
                                <Label htmlFor="status-all" className="cursor-pointer font-normal">All</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="listed" id="status-listed" />
                                <Label htmlFor="status-listed" className="cursor-pointer font-normal">Listed Only</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="auctions" id="status-auctions" />
                                <Label htmlFor="status-auctions" className="cursor-pointer font-normal">Auctions Only</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="unlisted" id="status-unlisted" />
                                <Label htmlFor="status-unlisted" className="cursor-pointer font-normal">Unlisted Only</Label>
                              </div>
                            </div>
                          </RadioGroup>
                        </div>

                        {/* Price Range */}
                        <div className="space-y-2">
                          <Label htmlFor="min-price-filter">Price Range (USD)</Label>
                          <div className="flex gap-2">
                            <Input
                              id="min-price-filter"
                              type="number"
                              placeholder="Min"
                              value={minPrice}
                              onChange={(e) => setMinPrice(e.target.value)}
                              className="bg-secondary border-border"
                              min="0"
                              step="0.01"
                              aria-label="Minimum price filter"
                            />
                            <Input
                              id="max-price-filter"
                              type="number"
                              placeholder="Max"
                              value={maxPrice}
                              onChange={(e) => setMaxPrice(e.target.value)}
                              className="bg-secondary border-border"
                              min="0"
                              step="0.01"
                              aria-label="Maximum price filter"
                            />
                          </div>
                          {minPrice && maxPrice && parseFloat(minPrice) > parseFloat(maxPrice) && (
                            <p className="text-xs text-destructive" role="alert">
                              Min price must be less than or equal to max price
                            </p>
                          )}
                        </div>

                        {/* Sort By */}
                        <div className="space-y-2">
                          <Label htmlFor="sort-filter">Sort By</Label>
                          <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger id="sort-filter" className="bg-secondary border-border" aria-label="Sort artworks">
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

            <TabsContent value="artworks">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="space-y-3">
                      <Skeleton className="aspect-square w-full rounded-lg" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </div>
                  ))}
                </div>
              ) : error ? (
                <Card className="bg-gradient-card border-border">
                  <CardContent className="p-12 text-center">
                    <p className="text-muted-foreground mb-4">
                      {error.status === 0
                        ? "Unable to connect to server. Please check your connection."
                        : "Failed to search. Please try again."}
                    </p>
                    <Button onClick={fetchResults} variant="outline" className="gap-2">
                      <RefreshCw className="w-4 h-4" />
                      Retry
                    </Button>
                  </CardContent>
                </Card>
              ) : filteredAndSortedArtworks.length > 0 ? (
                <>
                  {/* Auction Items */}
                  {artView === "grid" && filteredAndSortedArtworks.filter(a => Boolean(a.is_listed) && a.auction && a.auction.status === "open").length > 0 && (
                    <div className="mb-8">
                      <h3 className="text-lg font-semibold mb-4">🔥 Live Auctions</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredAndSortedArtworks.filter(a => Boolean(a.is_listed) && a.auction && a.auction.status === "open").map((artwork) => {
                          const auction = artwork.auction!;
                          const formatEndTime = (endTime: string) => {
                            const end = new Date(endTime);
                            const now = new Date();
                            const timeDiff = end.getTime() - now.getTime();
                            const hours = Math.floor(timeDiff / (1000 * 60 * 60));
                            const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
                            return `${hours}h ${minutes}m`;
                          };
                          return (
                            <ArtCard
                              key={artwork.id}
                              id={artwork.id.toString()}
                              title={artwork.title}
                              artist={artwork.artist.display_name || artwork.artist.username || "Unknown"}
                              price={(auction.current_bid ?? artwork.price ?? auction.start_price ?? 0).toString()}
                              image={artwork.image_url || ""}
                              isAuction={true}
                              isListed={Boolean(artwork.is_listed)}
                              endTime={formatEndTime(auction.end_time)}
                              ownerId={artwork.owner.id.toString()}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                
                  {/* Table view */}
                  {artView === "table" && (
                    <div className="mb-8 overflow-x-auto rounded-xl border border-border">
                      <table className="min-w-full text-sm">
                        <thead className="bg-secondary text-muted-foreground">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium">Artwork</th>
                            <th className="px-4 py-3 text-left font-medium">Price / Current Bid</th>
                            <th className="px-4 py-3 text-left font-medium">Type</th>
                            <th className="px-4 py-3 text-left font-medium">Owner</th>
                            <th className="px-4 py-3 text-right font-medium">Views</th>
                            <th className="px-4 py-3 text-right font-medium">Likes</th>
                            <th className="px-4 py-3 text-left font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-background">
                          {filteredAndSortedArtworks.map((artwork) => {
                            const auction = artwork.auction;
                            const price = auction
                              ? (auction.current_bid ?? auction.start_price ?? artwork.price ?? 0)
                              : (artwork.price ?? 0);
                            const isAuction = Boolean(auction && auction.status === "open");
                            return (
                              <tr
                                key={artwork.id}
                                className="hover:bg-muted/40 cursor-pointer"
                                onClick={() => navigate(`/art/${artwork.id}`)}
                              >
                                <td className="px-4 py-4">
                                  <div className="flex items-center gap-3">
                                    <img
                                      src={artwork.image_url || "/placeholder.svg"}
                                      alt={artwork.title}
                                      className="w-12 h-12 rounded-md object-cover border border-border"
                                    />
                                    <div>
                                      <p className="font-semibold">{artwork.title}</p>
                                      <p className="text-xs text-muted-foreground">
                                        #{artwork.id} • {artwork.category || "Uncategorized"}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-4">
                                  <div className="font-semibold">{formatCurrency(price)}</div>
                                  {auction?.current_bid && (
                                    <p className="text-xs text-muted-foreground">
                                      Started at {formatCurrency(auction.start_price ?? 0)}
                                    </p>
                                  )}
                                </td>
                                <td className="px-4 py-4">
                                  <span
                                    className={`px-2 py-1 rounded-full text-xs ${
                                      isAuction
                                        ? "bg-orange-100 text-orange-800"
                                        : artwork.is_listed
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {isAuction ? "Auction" : artwork.is_listed ? "Fixed" : "Unlisted"}
                                  </span>
                                </td>
                                <td className="px-4 py-4">
                                  <div>
                                    <p>{artwork.owner.display_name || artwork.owner.username || "Unknown"}</p>
                                    <p className="text-xs text-muted-foreground">
                                      Artist: {artwork.artist.display_name || artwork.artist.username || "Unknown"}
                                    </p>
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-right">{artwork.views ?? 0}</td>
                                <td className="px-4 py-4 text-right">{artwork.favorites ?? 0}</td>
                                <td className="px-4 py-4">
                                  <p>
                                    {(() => {
                                      if (isAuction) {
                                        const endTime = new Date(auction!.end_time).getTime();
                                        const diff = endTime - Date.now();
                                        if (diff <= 0) return "Auction ended";
                                        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                                        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                        if (days > 0) return `Ends in ${days}d ${hours}h`;
                                        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                                        return `Ends in ${hours}h ${minutes}m`;
                                      }
                                      if (artwork.is_listed) {
                                        if (artwork.listing_expires_at) {
                                          const endTime = new Date(artwork.listing_expires_at).getTime();
                                          const diff = endTime - Date.now();
                                          if (diff <= 0) return "Listing expired";
                                          const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                                          const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                                          if (days > 0) return `Listing ends in ${days}d ${hours}h`;
                                          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                                          return `Listing ends in ${hours}h ${minutes}m`;
                                        }
                                        return "Listing active (no end date)";
                                      }
                                      return "Not listed";
                                    })()}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {artwork.created_at
                                      ? `Added ${new Date(artwork.created_at).toLocaleDateString()}`
                                      : "—"}
                                  </p>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                
                  {/* Regular Listed Artworks (non-auction) */}
                  {artView === "grid" && filteredAndSortedArtworks.filter(a => Boolean(a.is_listed) && (!a.auction || a.auction.status !== "open")).length > 0 && (
                    <div className="mb-8">
                      <h3 className="text-lg font-semibold mb-4">Listed</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredAndSortedArtworks.filter(a => Boolean(a.is_listed) && (!a.auction || a.auction.status !== "open")).map((artwork) => (
                          <ArtCard
                            key={artwork.id}
                            id={artwork.id.toString()}
                            title={artwork.title}
                            artist={artwork.artist.display_name || artwork.artist.username || "Unknown"}
                            price={(artwork.price || 0).toString()}
                            image={artwork.image_url || ""}
                            isAuction={false}
                            isListed={Boolean(artwork.is_listed)}
                            ownerId={artwork.owner.id.toString()}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Unlisted Artworks */}
                  {artView === "grid" && filteredAndSortedArtworks.filter(a => !Boolean(a.is_listed)).length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4">Unlisted</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredAndSortedArtworks.filter(a => !Boolean(a.is_listed)).map((artwork) => (
                          <ArtCard
                            key={artwork.id}
                            id={artwork.id.toString()}
                            title={artwork.title}
                            artist={artwork.artist.display_name || artwork.artist.username || "Unknown"}
                            price={(artwork.price || 0).toString()}
                            image={artwork.image_url || ""}
                            isAuction={false}
                            isListed={false}
                            ownerId={artwork.owner.id.toString()}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <Card className="bg-gradient-card border-border">
                  <CardContent className="p-12 text-center">
                    <SearchIcon className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground mb-4">
                      {searchQuery || activeFilterCount > 0
                        ? `No artworks found${searchQuery ? ` for "${searchQuery}"` : ""}${activeFilterCount > 0 ? " with current filters" : ""}`
                        : "Start searching to discover amazing artworks"}
                    </p>
                    {user && searchQuery && (
                      <Button onClick={() => navigate("/create")} variant="outline" className="gap-2">
                        <Plus className="w-4 h-4" />
                        Create Artwork
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="users">
              {loading ? (
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
                      onClick={() => navigate(`/profile/${user.username || user.id}`)}
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
                      {searchQuery ? `No users found for "${searchQuery}"` : "Start searching to find artists"}
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
