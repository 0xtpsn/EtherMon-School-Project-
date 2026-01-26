import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Share2, Twitter, Globe, Instagram, Mail, Eye, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ArtCard from "@/components/art/ArtCard";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useSession } from "@/context/SessionContext";
import { meApi, ProfileDetailResponse } from "@/api/me";
import { auctionsApi } from "@/api/auctions";
import { artworksApi } from "@/api/artworks";
import { Role } from "@/api/types";
import { getRoleBioPlaceholder } from "@/lib/bioPlaceholders";
import { ArtworkSummary } from "@/api/types";

// Sortable Watchlist Item Component
interface SortableWatchlistItemProps {
  artwork: ArtworkSummary;
  onRemove: (artworkId: number) => Promise<void>;
  formatEndTime: (endTime: string) => string;
}

const SortableWatchlistItem = ({ artwork, onRemove, formatEndTime }: SortableWatchlistItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: artwork.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isAuction = artwork.auction && artwork.auction.status === 'open';
  const activeAuction = artwork.auction;
  const highestBid = artwork.bids?.reduce((max, b) => Math.max(max, b.amount), 0) || 0;
  const displayPrice = isAuction
    ? (highestBid > 0 ? highestBid : (activeAuction?.current_bid || activeAuction?.start_price || artwork.price || 0))
    : (artwork.price || 0);

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      <div
        {...attributes}
        {...listeners}
        className="absolute top-2 left-2 z-20 cursor-grab active:cursor-grabbing bg-background/90 backdrop-blur-sm rounded p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </div>
      <ArtCard
        id={artwork.id.toString()}
        title={artwork.title}
        artist={artwork.artist?.display_name || artwork.artist?.username || "Unknown"}
        price={displayPrice.toString()}
        image={artwork.image_url}
        isAuction={!!isAuction}
        isListed={!!artwork.is_listed}
        endTime={activeAuction ? formatEndTime(activeAuction.end_time) : undefined}
        ownerId={artwork.artist.id.toString()}
      />
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="outline"
          size="icon"
          className="bg-background/90 backdrop-blur-sm"
          onClick={async () => {
            await onRemove(artwork.id);
          }}
          title="Remove from watchlist"
        >
          <Eye className="w-4 h-4 text-primary" />
        </Button>
      </div>
    </div>
  );
};

const Profile = () => {
  const { username } = useParams<{ username?: string }>();
  const identifier = username; // Support both :username and :identifier routes
  const navigate = useNavigate();
  const { user } = useSession();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<ProfileDetailResponse | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedBid, setSelectedBid] = useState<any>(null);
  const [newBidAmount, setNewBidAmount] = useState("");
  const [activityPage, setActivityPage] = useState(1);
  const [ownedFilter, setOwnedFilter] = useState<"all" | "listed" | "unlisted" | "auction">("all");
  const [orderedWatchlist, setOrderedWatchlist] = useState<any[]>([]);

  const ITEMS_PER_PAGE = 10;

  const profile = profileData?.profile;
  const ownedArtworks = profileData?.owned_artworks || [];
  const likedArtworks = profileData?.liked_artworks || [];
  const watchlistArtworks = profileData?.watchlist_artworks || [];
  const createdCount = profileData?.created_count || 0;
  const activity = profileData?.activity || [];
  const bids = profileData?.bids || [];
  const bidsData = bids;
  const activityData = activity;
  const profileRole = profile?.role as Role | undefined;
  const displayedBio = profile?.bio?.trim() || getRoleBioPlaceholder(profileRole);

  const isOwnProfile = useMemo(() => {
    return user && (user.id === profile?.id || user.username === identifier);
  }, [user, profile, identifier]);

  // Initialize and sync ordered watchlist
  useEffect(() => {
    if (watchlistArtworks.length > 0) {
      const storageKey = `watchlist_order_${user?.id || 'anonymous'}`;
      const savedOrder = localStorage.getItem(storageKey);
      
      if (savedOrder) {
        try {
          const orderIds = JSON.parse(savedOrder) as number[];
          // Create a map for quick lookup
          const artworkMap = new Map(watchlistArtworks.map(a => [a.id, a]));
          // Reorder based on saved order, then append any new items
          const ordered = orderIds
            .map(id => artworkMap.get(id))
            .filter(Boolean) as ArtworkSummary[];
          const newItems = watchlistArtworks.filter(a => !orderIds.includes(a.id));
          setOrderedWatchlist([...ordered, ...newItems]);
        } catch (error) {
          // If parsing fails, use default order
          setOrderedWatchlist(watchlistArtworks);
        }
      } else {
        setOrderedWatchlist(watchlistArtworks);
      }
    } else {
      setOrderedWatchlist([]);
    }
  }, [watchlistArtworks, user?.id]);

  // Save order to localStorage when it changes
  useEffect(() => {
    if (orderedWatchlist.length > 0 && user?.id) {
      const storageKey = `watchlist_order_${user.id}`;
      const orderIds = orderedWatchlist.map(a => a.id);
      localStorage.setItem(storageKey, JSON.stringify(orderIds));
    }
  }, [orderedWatchlist, user?.id]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setOrderedWatchlist((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleFavoriteChange = async (artworkId: string, favorited: boolean) => {
    // If artwork was unliked, refresh the profile data to update the liked artworks list
    if (!favorited && identifier) {
      try {
        const data = await meApi.profileDetail(identifier);
        setProfileData(data);
      } catch (error) {
        // Silently fail - the list will update on next page refresh
      }
    }
  };

  const handleRemoveFromWatchlist = async (artworkId: number) => {
    const artwork = orderedWatchlist.find(a => a.id === artworkId);
    if (!artwork) return;

    // Optimistic update
    const previousWatchlist = [...orderedWatchlist];
    const updatedWatchlist = orderedWatchlist.filter(a => a.id !== artworkId);
    setOrderedWatchlist(updatedWatchlist);
    
    if (profileData) {
      setProfileData({
        ...profileData,
        watchlist_artworks: updatedWatchlist,
      });
    }

    try {
      await artworksApi.toggleWatch(artworkId, false);
      toast({
        title: "Removed from watchlist",
        description: `${artwork.title} has been removed from your watchlist`
      });
    } catch (error: any) {
      // Rollback on error
      setOrderedWatchlist(previousWatchlist);
      if (profileData) {
        setProfileData({
          ...profileData,
          watchlist_artworks: previousWatchlist,
        });
      }
      toast({
        title: "Error",
        description: error.message || "Failed to remove from watchlist",
        variant: "destructive",
      });
    }
  };

  const filteredOwnedArtworks = useMemo(() => {
    if (ownedFilter === "all") return ownedArtworks;

    return ownedArtworks.filter(artwork => {
      const isAuction = artwork.auction && artwork.auction.status === 'open';

      if (ownedFilter === "auction") {
        return isAuction;
      } else if (ownedFilter === "listed") {
        return artwork.is_listed && !isAuction; // Listed but not auction
      } else if (ownedFilter === "unlisted") {
        return !artwork.is_listed;
      }
      return true;
    });
  }, [ownedArtworks, ownedFilter]);

  useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      if (!identifier) {
        // If no username in URL, try to redirect to current user's profile or show error
        if (user?.username) {
          navigate(`/profile/${user.username}`, { replace: true });
          return;
        }
        setLoading(false);
        setProfileData(null);
        return;
      }
      setLoading(true);
      setProfileData(null); // Clear previous data
      try {
        console.log("Fetching profile for:", identifier);
        const data = await meApi.profileDetail(identifier);
        console.log("Profile data received:", data);
        if (!cancelled) {
          if (data && data.profile) {
            setProfileData(data);
          } else {
            console.warn("Profile data missing profile field:", data);
            setProfileData(null);
          }
        }
      } catch (error: any) {
        console.error("Error fetching profile:", error);
        if (!cancelled) {
          toast({
            title: "Error",
            description: error.message || "Failed to load profile",
            variant: "destructive",
          });
          setProfileData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [identifier, user?.username, navigate]); // Added dependencies for redirect logic

  const handleUpdateBid = async () => {
    if (!selectedBid || !newBidAmount) return;
    try {
      await auctionsApi.updateBid(selectedBid.auction_id, parseFloat(newBidAmount));
      toast({ title: "Bid updated successfully" });
      setUpdateDialogOpen(false);
      setSelectedBid(null);
      setNewBidAmount("");
      // Refresh profile data
      if (identifier) {
        const data = await meApi.profileDetail(identifier);
        setProfileData(data);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update bid",
        variant: "destructive",
      });
    }
  };

  const handleCancelBid = async () => {
    if (!selectedBid) return;
    try {
      await auctionsApi.cancelBid(selectedBid.auction_id);
      toast({ title: "Bid cancelled successfully" });
      setCancelDialogOpen(false);
      setSelectedBid(null);
      // Refresh profile data
      if (identifier) {
        const data = await meApi.profileDetail(identifier);
        setProfileData(data);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel bid",
        variant: "destructive",
      });
    }
  };

  const formatEndTime = (endTime: string) => {
    const end = new Date(endTime);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    if (diff <= 0) return "Ended";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <Skeleton className="h-32 w-32 rounded-full mx-auto mb-4" />
            <Skeleton className="h-8 w-48 mx-auto mb-2" />
            <Skeleton className="h-4 w-64 mx-auto" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!profileData || !profile) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <p className="text-muted-foreground mb-2">Profile not found</p>
            <p className="text-sm text-muted-foreground">The user you're looking for doesn't exist or the profile couldn't be loaded.</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => navigate("/")}
            >
              Go Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-8">
        {/* Banner */}
        <div className="relative h-64 rounded-xl overflow-hidden mb-20 bg-gradient-primary">
          {profile.banner_url ? (
            <img src={profile.banner_url} alt="Banner" className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 opacity-20">
              <div className="w-full h-full bg-[url('/placeholder.svg')] bg-cover bg-center" />
            </div>
          )}
          {/* Darkened overlay for better text visibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/50 to-transparent" />
        </div>

        {/* Profile Info */}
        <div className="relative -mt-32 mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-end gap-6">
            <div className="w-32 h-32 rounded-xl border-4 border-background overflow-hidden bg-gradient-card shadow-xl">
              <img
                src={profile.avatar_url || "/placeholder.svg"}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2 drop-shadow-lg">
                {profile.display_name || profile.username || "Unnamed"}
              </h1>
              <p className="text-muted-foreground mb-4">
                {displayedBio}
              </p>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Owned: </span>
                  <span className="font-semibold">{ownedArtworks.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Created: </span>
                  <span className="font-semibold">{createdCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Liked: </span>
                  <span className="font-semibold">{likedArtworks.length}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {profile.twitter_handle ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(`https://twitter.com/${profile.twitter_handle}`, "_blank")}
                >
                  <Twitter className="w-4 h-4" />
                </Button>
              ) : null}
              {profile.instagram_handle ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(`https://instagram.com/${profile.instagram_handle}`, "_blank")}
                >
                  <Instagram className="w-4 h-4" />
                </Button>
              ) : null}
              {profile.website_url ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(profile.website_url, "_blank")}
                >
                  <Globe className="w-4 h-4" />
                </Button>
              ) : null}
              {profile.show_contact_email && profile.contact_email ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(profile.contact_email);
                    toast({ title: "Email copied to clipboard!" });
                  }}
                  title="Copy email"
                >
                  <Mail className="w-4 h-4" />
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  const url = window.location.href;
                  if (navigator.share) {
                    navigator.share({
                      title: `${profile.display_name || profile.username}'s Profile`,
                      url: url
                    }).catch(() => {
                      navigator.clipboard.writeText(url);
                      toast({ title: "Link copied to clipboard!" });
                    });
                  } else {
                    navigator.clipboard.writeText(url);
                    toast({ title: "Link copied to clipboard!" });
                  }
                }}>
                <Share2 className="w-4 h-4" />
              </Button>
              {isOwnProfile && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => navigate("/settings")}
                >
                  <Settings className="w-4 h-4" />
                  Edit Profile
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="owned" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="owned">Owned</TabsTrigger>
            <TabsTrigger value="liked">Liked</TabsTrigger>
            {isOwnProfile && <TabsTrigger value="watchlist">Watchlist</TabsTrigger>}
            {isOwnProfile && <TabsTrigger value="bids">Bids</TabsTrigger>}
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="owned">
            {/* Filter Buttons */}
            {ownedArtworks.length > 0 && (
              <div className="flex gap-2 mb-6 flex-wrap">
                <Button
                  variant={ownedFilter === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setOwnedFilter("all")}
                >
                  All ({ownedArtworks.length})
                </Button>
                <Button
                  variant={ownedFilter === "listed" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setOwnedFilter("listed")}
                >
                  On Sale ({ownedArtworks.filter(a => a.is_listed && !(a.auction && a.auction.status === 'open')).length})
                </Button>
                <Button
                  variant={ownedFilter === "auction" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setOwnedFilter("auction")}
                >
                  On Auction ({ownedArtworks.filter(a => a.auction && a.auction.status === 'open').length})
                </Button>
                <Button
                  variant={ownedFilter === "unlisted" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setOwnedFilter("unlisted")}
                >
                  Not Listed ({ownedArtworks.filter(a => !a.is_listed).length})
                </Button>
              </div>
            )}

            {filteredOwnedArtworks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredOwnedArtworks.map((artwork) => {
                  const isAuction = artwork.auction && artwork.auction.status === 'open';
                  const activeAuction = artwork.auction;
                  const highestBid = artwork.bids?.reduce((max, b) => Math.max(max, b.amount), 0) || 0;
                  const displayPrice = isAuction
                    ? (highestBid > 0 ? highestBid : (activeAuction?.current_bid || activeAuction?.start_price || artwork.price || 0))
                    : (artwork.price || 0);

                  return (
                    <ArtCard
                      key={artwork.id}
                      id={artwork.id.toString()}
                      title={artwork.title}
                      artist={artwork.artist?.display_name || artwork.artist?.username || "Unknown"}
                      price={displayPrice.toString()}
                      image={artwork.image_url}
                      isAuction={!!isAuction}
                      isListed={!!artwork.is_listed}
                      endTime={activeAuction ? formatEndTime(activeAuction.end_time) : undefined}
                      ownerId={artwork.artist.id.toString()}
                    />
                  );
                })}
              </div>
            ) : (
              <Card className="bg-gradient-card border-border">
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">
                    {ownedArtworks.length === 0
                      ? "No items owned yet"
                      : ownedFilter === "listed"
                        ? "No listed items"
                        : ownedFilter === "auction"
                          ? "No items on auction"
                          : ownedFilter === "unlisted"
                            ? "No unlisted items"
                            : "No items found"}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="liked">
            {likedArtworks.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {likedArtworks.map((artwork) => {
                  const isAuction = artwork.auction && artwork.auction.status === 'open';
                  const activeAuction = artwork.auction;
                  const highestBid = artwork.bids?.reduce((max, b) => Math.max(max, b.amount), 0) || 0;
                  const displayPrice = isAuction
                    ? (highestBid > 0 ? highestBid : (activeAuction?.current_bid || activeAuction?.start_price || artwork.price || 0))
                    : (artwork.price || 0);

                  return (
                    <ArtCard
                      key={artwork.id}
                      id={artwork.id.toString()}
                      title={artwork.title}
                      artist={artwork.artist?.display_name || artwork.artist?.username || "Unknown"}
                      price={displayPrice.toString()}
                      image={artwork.image_url}
                      isAuction={!!isAuction}
                      isListed={!!artwork.is_listed}
                      endTime={activeAuction ? formatEndTime(activeAuction.end_time) : undefined}
                      ownerId={artwork.artist.id.toString()}
                      initialFavorited={true}
                      onFavoriteChange={handleFavoriteChange}
                    />
                  );
                })}
              </div>
            ) : (
              <Card className="bg-gradient-card border-border">
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">No liked items yet</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="watchlist">
            {orderedWatchlist.length > 0 ? (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={orderedWatchlist.map(a => a.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {orderedWatchlist.map((artwork) => (
                      <SortableWatchlistItem
                        key={artwork.id}
                        artwork={artwork}
                        onRemove={handleRemoveFromWatchlist}
                        formatEndTime={formatEndTime}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <Card className="bg-gradient-card border-border">
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">No items in watchlist yet</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Add artworks to your watchlist to track auctions you're interested in
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="bids">
            {bidsData.length > 0 ? (
              <Card className="bg-gradient-card border-border">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {bidsData.map((bid) => (
                      <div key={bid.id} className="flex items-start gap-4 p-4 border border-border rounded-lg">
                        {bid.artworks?.image_url && (
                          <img
                            src={bid.artworks.image_url}
                            alt={bid.artworks.title}
                            className="w-16 h-16 rounded object-cover cursor-pointer"
                            onClick={() => navigate(`/art/${bid.artwork_id}`)}
                          />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{bid.artworks?.title}</p>
                          <p className="text-sm text-muted-foreground">
                            by {bid.artworks?.artist?.display_name || bid.artworks?.artist?.username}
                          </p>
                          <div className="flex gap-4 mt-2">
                            <div>
                              <p className="text-xs text-muted-foreground">Your Bid</p>
                              <p className="text-lg font-semibold text-primary">${bid.amount}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Expires</p>
                              <p className="text-sm font-medium">
                                {bid.expires_at ? new Date(bid.expires_at).toLocaleString() : 'No expiry'}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Placed: {new Date(bid.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate(`/art/${bid.artwork_id}`)}
                          >
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedBid(bid);
                              setNewBidAmount(bid.amount.toString());
                              setUpdateDialogOpen(true);
                            }}
                          >
                            Update
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedBid(bid);
                              setCancelDialogOpen(true);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-gradient-card border-border">
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">No active bids</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="activity">
            {activityData.length > 0 ? (
              <>
                <Card className="bg-gradient-card border-border">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      {activityData
                        .slice((activityPage - 1) * ITEMS_PER_PAGE, activityPage * ITEMS_PER_PAGE)
                        .map((activity) => {
                          return (
                            <div key={activity.id} className="flex items-start gap-4 p-4 border border-border rounded-lg">
                              <div
                                className="flex items-start gap-4 cursor-pointer"
                                onClick={() => activity.artwork_id && navigate(`/art/${activity.artwork_id}`)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    activity.artwork_id && navigate(`/art/${activity.artwork_id}`);
                                  }
                                }}
                              >
                                {activity.artworks?.image_url && (
                                  <img
                                    src={activity.artworks.image_url}
                                    alt={activity.artworks.title}
                                    className="w-16 h-16 rounded object-cover"
                                  />
                                )}
                                <div className="flex-1">
                                  <p className="font-medium capitalize">
                                    {(() => {
                                      // If activity is "sold" or "sale", check if profile user is buyer or seller
                                      if ((activity.activity_type === 'sold' || activity.activity_type === 'sale' || activity.activity_type === 'auction_won') && profile) {
                                        // Use profile.id to check if the profile owner is the buyer or seller
                                        const profileUserId = profile.id;
                                        // If profile user is the buyer (to_user_id), show "bought"
                                        if ((activity as any).to_user_id === profileUserId) {
                                          return 'bought';
                                        }
                                        // If profile user is the seller (from_user_id), show "sold"
                                        if ((activity as any).from_user_id === profileUserId) {
                                          return 'sold';
                                        }
                                      }
                                      // For other activity types, use the original type
                                      return activity.activity_type;
                                    })()}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {activity.artworks?.title}
                                  </p>
                                  {activity.price && (
                                    <p className="text-sm font-semibold text-primary">${activity.price}</p>
                                  )}
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {new Date(activity.created_at).toLocaleString()}
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
                {activityData.length > ITEMS_PER_PAGE && (
                  <Pagination className="mt-4">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                          className={activityPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {Array.from({ length: Math.ceil(activityData.length / ITEMS_PER_PAGE) }, (_, i) => i + 1).map((page) => (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => setActivityPage(page)}
                            isActive={activityPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      ))}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => setActivityPage(p => Math.min(Math.ceil(activityData.length / ITEMS_PER_PAGE), p + 1))}
                          className={activityPage === Math.ceil(activityData.length / ITEMS_PER_PAGE) ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </>
            ) : (
              <Card className="bg-gradient-card border-border">
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">No recent activity</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Bid</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel your bid of ${selectedBid?.amount}? The funds will be returned to your available balance.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Bid</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelBid}>
              Yes, Cancel Bid
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Update Bid Dialog */}
      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Bid</DialogTitle>
            <DialogDescription>
              Modify your bid amount. You can increase or decrease it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-bid">New Bid Amount (USD)</Label>
              <Input
                id="new-bid"
                type="number"
                step="0.01"
                value={newBidAmount}
                onChange={(e) => setNewBidAmount(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">
                Current bid: ${selectedBid?.amount}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUpdateDialogOpen(false);
                setSelectedBid(null);
                setNewBidAmount("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateBid}>Update Bid</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
