import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import Navbar from "@/components/layout/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Share2, Twitter, Globe, Instagram, Mail, Pencil, Camera, Upload, ImageIcon } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import ArtCard from "@/components/art/ArtCard";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useSession } from "@/context/SessionContext";
import { useWallet } from "@/context/WalletContext";
import { meApi, ProfileDetailResponse } from "@/api/me";
import { auctionsApi } from "@/api/auctions";
import { Role } from "@/api/types";
import { getRoleBioPlaceholder } from "@/lib/bioPlaceholders";
import { useOwnedNFTs } from "@/hooks/useOwnedNFTs";
import { useAllNFTs, NFTItem } from "@/hooks/useAllNFTs";
import { useWalletActivity } from "@/hooks/useWalletActivity";
import { useOnChainBids } from "@/hooks/useOnChainBids";
import { nftLikesApi } from "@/api/notifications";
import { POKECHAIN_MARKETPLACE_ADDRESS, RPC_URL } from "@/config/contracts";
import PokechainMarketplaceAbi from "@/config/abi/PokechainMarketplace.json";
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

interface ProfileBid {
  id: number;
  auction_id: number;
  artwork_id?: number;
  title?: string;
  status?: string;
  amount: number;
  created_at: string;
  expires_at?: string | null;
  artworks?: {
    title?: string;
    image_url?: string;
    artist?: {
      username?: string;
      display_name?: string;
    };
  };
}

interface ProfileActivity {
  id?: number | string;
  activity_type?: string;
  artwork_id?: number;
  created_at?: string;
  price?: number | string;
  artworks?: {
    title?: string;
    image_url?: string;
  };
}

interface CurrentAuctionBid {
  tokenId: number;
  nftName: string;
  nftImage: string;
  bidAmount: string;
  highestBid: string;
  auctionEndTime: number;
  isHighestBidder: boolean;
}

const Profile = () => {
  const { username } = useParams<{ username?: string }>();
  const identifier = username; // Support both :username and :identifier routes
  const navigate = useNavigate();
  const { user } = useSession();
  const { address: walletAddress } = useWallet();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<ProfileDetailResponse | null>(null);
  const [activityPage, setActivityPage] = useState(1);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [selectedBid, setSelectedBid] = useState<ProfileBid | null>(null);
  const [newBidAmount, setNewBidAmount] = useState("");
  const [myBids, setMyBids] = useState<ProfileBid[]>([]);
  const [myBidsLoading, setMyBidsLoading] = useState(false);
  const [bidsFetched, setBidsFetched] = useState(false);
  const [currentAuctionBids, setCurrentAuctionBids] = useState<CurrentAuctionBid[]>([]);
  const [currentAuctionBidsLoading, setCurrentAuctionBidsLoading] = useState(false);


  // ── Edit Profile Dialog State ──
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editBannerUrl, setEditBannerUrl] = useState("");
  const [editTwitter, setEditTwitter] = useState("");
  const [editInstagram, setEditInstagram] = useState("");
  const [editWebsite, setEditWebsite] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Convert file to base64 data URL
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Avatar must be under 2MB", variant: "destructive" });
      return;
    }
    const base64 = await fileToBase64(file);
    setEditAvatarUrl(base64);
  };

  const handleBannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: "File too large", description: "Banner must be under 4MB", variant: "destructive" });
      return;
    }
    const base64 = await fileToBase64(file);
    setEditBannerUrl(base64);
  };

  // localStorage profile data for wallet-only users
  const [localProfileData, setLocalProfileData] = useState<{
    display_name?: string;
    bio?: string;
    avatar_url?: string;
    banner_url?: string;
    twitter_handle?: string;
    instagram_handle?: string;
    website_url?: string;
  } | null>(null);


  const ITEMS_PER_PAGE = 10;

  const profile = profileData?.profile;
  const profileRole = profile?.role as Role | undefined;
  const displayedBio = profile?.bio?.trim() || getRoleBioPlaceholder(profileRole);
  const profileBids = ((profileData?.bids ?? []) as ProfileBid[]).filter((b) => Boolean(b && b.id));
  const backendActivities = (profileData?.activity ?? []) as ProfileActivity[];

  const isOwnProfile = useMemo(() => {
    if (user && (user.id === profile?.id || user.username === identifier)) return true;
    if (walletAddress && profile?.wallet_address && walletAddress.toLowerCase() === profile.wallet_address.toLowerCase()) return true;
    if (walletAddress && identifier && identifier.startsWith("0x") && walletAddress.toLowerCase() === identifier.toLowerCase()) return true;
    return false;
  }, [user, profile, identifier, walletAddress]);

  // Determine wallet to use for on-chain lookups.
  // For wallet-only profiles where backend wallet_address may be missing,
  // fall back to currently connected wallet only on own profile.
  const profileWalletAddress = useMemo(() => {
    const explicit = profile?.wallet_address || (identifier?.startsWith("0x") ? identifier : null);
    if (explicit) return explicit;
    if (isOwnProfile && walletAddress) return walletAddress;
    return null;
  }, [profile?.wallet_address, identifier, isOwnProfile, walletAddress]);

  // On-chain activity (lazy — only fetches when Activity tab is clicked)
  const { activities: onChainActivity, loading: activityLoading, refetch: fetchActivity } = useWalletActivity(profileWalletAddress);
  const [activityFetched, setActivityFetched] = useState(false);
  const { bids: onChainBids, loading: onChainBidsLoading, refetch: fetchOnChainBids } = useOnChainBids(profileWalletAddress);

  const { nfts: ownedNFTs, loading: nftsLoading, refetch: refetchNFTs } = useOwnedNFTs(profileWalletAddress);

  // Get all NFTs for the liked filter
  const { nfts: allNFTs, loading: allNFTsLoading } = useAllNFTs();

  // ── localStorage profile for wallet-only users ──
  const localStorageKey = profileWalletAddress
    ? `ethermon_profile_${profileWalletAddress.toLowerCase()}`
    : null;

  // Load localStorage profile data
  useEffect(() => {
    if (!localStorageKey) return;
    try {
      const stored = localStorage.getItem(localStorageKey);
      if (stored) {
        setLocalProfileData(JSON.parse(stored));
      }
    } catch {
      // ignore parse errors
    }
  }, [localStorageKey]);

  // Merge: localStorage overrides backend defaults for wallet-only users
  const mergedDisplayName = localProfileData?.display_name || profile?.display_name || profile?.username || "Unnamed";
  const mergedBio = localProfileData?.bio || profile?.bio?.trim() || getRoleBioPlaceholder(profileRole);
  const mergedAvatarUrl = localProfileData?.avatar_url || profile?.avatar_url || "/placeholder.svg";
  const mergedBannerUrl = localProfileData?.banner_url || profile?.banner_url || "";
  const mergedTwitter = localProfileData?.twitter_handle || profile?.twitter_handle || "";
  const mergedInstagram = localProfileData?.instagram_handle || profile?.instagram_handle || "";
  const mergedWebsite = localProfileData?.website_url || profile?.website_url || "";

  const openEditDialog = useCallback(() => {
    setEditDisplayName(localProfileData?.display_name || profile?.display_name || "");
    setEditBio(localProfileData?.bio || profile?.bio || "");
    setEditAvatarUrl(localProfileData?.avatar_url || profile?.avatar_url || "");
    setEditBannerUrl(localProfileData?.banner_url || profile?.banner_url || "");
    setEditTwitter(mergedTwitter);
    setEditInstagram(mergedInstagram);
    setEditWebsite(mergedWebsite);
    setEditDialogOpen(true);
  }, [localProfileData, profile, mergedTwitter, mergedInstagram, mergedWebsite]);

  const saveEditProfile = useCallback(async () => {
    if (!profileWalletAddress) return;
    const data: Record<string, string> = {};
    if (editDisplayName.trim()) data.display_name = editDisplayName.trim();
    if (editBio.trim()) data.bio = editBio.trim();
    if (editAvatarUrl) data.avatar_url = editAvatarUrl;
    if (editBannerUrl) data.banner_url = editBannerUrl;
    if (editTwitter.trim()) data.twitter_handle = editTwitter.trim();
    if (editInstagram.trim()) data.instagram_handle = editInstagram.trim();
    if (editWebsite.trim()) data.website_url = editWebsite.trim();

    try {
      // Persist to backend so all users can see it
      await meApi.updateWalletProfile(profileWalletAddress, data);

      // Also cache locally for instant display
      if (localStorageKey) {
        localStorage.setItem(localStorageKey, JSON.stringify(data));
      }
      setLocalProfileData(data);
      setEditDialogOpen(false);
      toast({ title: "Profile updated!" });

      // Refresh profile data from backend
      if (identifier) {
        const freshData = await meApi.profileDetail(identifier);
        setProfileData(freshData);
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to save profile", variant: "destructive" });
    }
  }, [profileWalletAddress, localStorageKey, editDisplayName, editBio, editAvatarUrl, editBannerUrl, editTwitter, editInstagram, editWebsite, toast, identifier]);

  // Get liked NFTs from backend
  const [likedNFTs, setLikedNFTs] = useState<NFTItem[]>([]);

  useEffect(() => {
    if (!profileWalletAddress || allNFTsLoading) return;

    const fetchLiked = async () => {
      try {
        const { token_ids } = await nftLikesApi.likedByWallet(profileWalletAddress);
        const liked = allNFTs.filter(nft => token_ids.includes(nft.tokenId));
        setLikedNFTs(liked);
      } catch {
        // Fallback to localStorage if backend is offline
        try {
          const stored = localStorage.getItem(`ethermon_favorites_${profileWalletAddress.toLowerCase()}`);
          if (stored) {
            const likedIds: number[] = JSON.parse(stored);
            const liked = allNFTs.filter(nft => likedIds.includes(nft.tokenId));
            setLikedNFTs(liked);
          } else {
            setLikedNFTs([]);
          }
        } catch {
          setLikedNFTs([]);
        }
      }
    };
    fetchLiked();
  }, [profileWalletAddress, allNFTs, allNFTsLoading]);

  const fetchMyBids = useCallback(async () => {
    if (!isOwnProfile) {
      setMyBids([]);
      return;
    }

    setMyBidsLoading(true);
    try {
      const bids = await auctionsApi.myBids();
      setMyBids(Array.isArray(bids) ? (bids as ProfileBid[]) : []);
    } catch {
      setMyBids([]);
    } finally {
      setMyBidsLoading(false);
    }
  }, [isOwnProfile]);

  const combinedProfileBids = useMemo(() => {
    const map = new Map<number, ProfileBid>();
    for (const bid of profileBids) map.set(bid.id, bid);
    for (const bid of myBids) map.set(bid.id, bid);
    return Array.from(map.values()).sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return bTime - aTime;
    });
  }, [profileBids, myBids]);

  const combinedOnChainBids = useMemo(() => {
    const map = new Map<number, {
      tokenId: number;
      nftName: string;
      nftImage: string;
      bidAmount: string;
      highestBid: string;
      auctionEndTime: number;
      isHighestBidder: boolean;
    }>();

    for (const bid of onChainBids) {
      map.set(bid.tokenId, {
        tokenId: bid.tokenId,
        nftName: bid.nftName,
        nftImage: bid.nftImage,
        bidAmount: bid.bidAmount,
        highestBid: bid.highestBid,
        auctionEndTime: bid.auctionEndTime,
        isHighestBidder: bid.isHighestBidder,
      });
    }

    for (const bid of currentAuctionBids) {
      map.set(bid.tokenId, bid);
    }

    return Array.from(map.values());
  }, [onChainBids, currentAuctionBids]);

  const fallbackActivities = useMemo(() => {
    return backendActivities.map((act, idx) => ({
      id: String(act.id ?? `backend-${idx}`),
      type: act.activity_type || "activity",
      tokenId: act.artwork_id || 0,
      nftName: act.artworks?.title || "Artwork",
      nftImage: act.artworks?.image_url || "",
      price: act.price ? String(act.price) : "",
      timestamp: act.created_at ? Math.floor(new Date(act.created_at).getTime() / 1000) : 0,
    }));
  }, [backendActivities]);

  const displayedActivities = onChainActivity.length > 0 ? onChainActivity : fallbackActivities;

  useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      if (!identifier) {
        // If no username in URL, redirect using session user or wallet address
        if (user?.username) {
          navigate(`/profile/${user.username}`, { replace: true });
          return;
        }
        if (walletAddress) {
          navigate(`/profile/${walletAddress}`, { replace: true });
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

  useEffect(() => {
    if (!bidsFetched) return;
    fetchMyBids();
    fetchOnChainBids();
  }, [bidsFetched, fetchMyBids, fetchOnChainBids]);

  useEffect(() => {
    if (!bidsFetched || !profileWalletAddress || allNFTsLoading) return;

    let cancelled = false;
    const fetchCurrentAuctionBids = async () => {
      setCurrentAuctionBidsLoading(true);
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const marketplace = new ethers.Contract(
          POKECHAIN_MARKETPLACE_ADDRESS,
          PokechainMarketplaceAbi,
          provider
        );
        const walletLower = profileWalletAddress.toLowerCase();
        const auctionNfts = allNFTs.filter((nft) => nft.marketStatus === "auction");

        const results = await Promise.all(
          auctionNfts.map(async (nft) => {
            try {
              const auction = await marketplace.getAuction(nft.tokenId);
              const highestBidder = String(auction.highestBidder || auction[3]).toLowerCase();
              const active = Boolean(auction.active ?? auction[5]);
              if (!active || highestBidder !== walletLower) return null;

              return {
                tokenId: nft.tokenId,
                nftName: nft.name,
                nftImage: nft.image || "",
                bidAmount: ethers.formatEther(auction.highestBid ?? auction[2]),
                highestBid: ethers.formatEther(auction.highestBid ?? auction[2]),
                auctionEndTime: Number(auction.endTime ?? auction[4]),
                isHighestBidder: true,
              } as CurrentAuctionBid;
            } catch {
              return null;
            }
          })
        );

        if (!cancelled) {
          setCurrentAuctionBids(results.filter(Boolean) as CurrentAuctionBid[]);
        }
      } catch {
        if (!cancelled) {
          setCurrentAuctionBids([]);
        }
      } finally {
        if (!cancelled) {
          setCurrentAuctionBidsLoading(false);
        }
      }
    };

    fetchCurrentAuctionBids();
    return () => {
      cancelled = true;
    };
  }, [bidsFetched, profileWalletAddress, allNFTsLoading, allNFTs]);

  const handleUpdateBid = async () => {
    if (!selectedBid || !newBidAmount) return;
    try {
      await auctionsApi.updateBid(selectedBid.id, parseFloat(newBidAmount));
      toast({ title: "Bid updated successfully" });
      setUpdateDialogOpen(false);
      setSelectedBid(null);
      setNewBidAmount("");
      // Refresh profile data
      if (identifier) {
        const data = await meApi.profileDetail(identifier);
        setProfileData(data);
      }
      fetchMyBids();
      fetchOnChainBids();
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
      await auctionsApi.cancelBid(selectedBid.id);
      toast({ title: "Bid cancelled successfully" });
      setCancelDialogOpen(false);
      setSelectedBid(null);
      // Refresh profile data
      if (identifier) {
        const data = await meApi.profileDetail(identifier);
        setProfileData(data);
      }
      fetchMyBids();
      fetchOnChainBids();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel bid",
        variant: "destructive",
      });
    }
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
          {mergedBannerUrl ? (
            <img src={mergedBannerUrl} alt="Banner" className="w-full h-full object-cover" />
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
                src={mergedAvatarUrl}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2 drop-shadow-lg">
                {mergedDisplayName}
              </h1>
              <p className="text-muted-foreground mb-4">
                {mergedBio}
              </p>
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">NFTs: </span>
                  <span className="font-semibold">{nftsLoading ? "…" : ownedNFTs.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Liked: </span>
                  <span className="font-semibold">{likedNFTs.length}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              {mergedTwitter ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(`https://twitter.com/${mergedTwitter}`, "_blank")}
                >
                  <Twitter className="w-4 h-4" />
                </Button>
              ) : null}
              {mergedInstagram ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(`https://instagram.com/${mergedInstagram}`, "_blank")}
                >
                  <Instagram className="w-4 h-4" />
                </Button>
              ) : null}
              {mergedWebsite ? (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(mergedWebsite, "_blank")}
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
                  onClick={openEditDialog}
                >
                  <Pencil className="w-4 h-4" />
                  Edit Profile
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="owned" className="w-full" onValueChange={(val) => {
          if (val === "activity" && !activityFetched && profileWalletAddress) {
            setActivityFetched(true);
            fetchActivity();
          }
          if (val === "bids" && !bidsFetched) {
            setBidsFetched(true);
          }
        }}>
          <TabsList className="mb-6">
            <TabsTrigger value="owned">Owned</TabsTrigger>
            <TabsTrigger value="liked">Liked</TabsTrigger>
            {isOwnProfile && <TabsTrigger value="bids">Bids</TabsTrigger>}
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="owned">
            {nftsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <Skeleton className="aspect-square w-full rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))}
              </div>
            ) : ownedNFTs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {ownedNFTs.map((nft) => (
                  <ArtCard key={nft.tokenId} nft={nft} onRefetch={refetchNFTs} />
                ))}
              </div>
            ) : (
              <Card className="bg-gradient-card border-border">
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">No NFTs owned yet</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Mint some Pokémon from the collection to get started!
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="liked">
            {likedNFTs.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {likedNFTs.map((nft) => (
                  <ArtCard key={nft.tokenId} nft={nft} onRefetch={refetchNFTs} />
                ))}
              </div>
            ) : (
              <Card className="bg-gradient-card border-border">
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">No liked items yet</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Click the heart icon on any NFT to add it to your favorites
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="bids">
            {myBidsLoading || onChainBidsLoading || currentAuctionBidsLoading ? (
              <Card className="bg-gradient-card border-border">
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">Loading bids...</p>
                </CardContent>
              </Card>
            ) : (combinedProfileBids.length > 0 || combinedOnChainBids.length > 0) ? (
              <Card className="bg-gradient-card border-border">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {combinedOnChainBids.map((bid) => (
                      <div key={`onchain-${bid.tokenId}`} className="flex items-start gap-4 p-4 border border-border rounded-lg">
                        {bid.nftImage && (
                          <img
                            src={bid.nftImage}
                            alt={bid.nftName}
                            className="w-16 h-16 rounded object-cover cursor-pointer"
                            onClick={() => navigate(`/nft/${bid.tokenId}`)}
                          />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{bid.nftName}</p>
                          <div className="flex gap-4 mt-2">
                            <div>
                              <p className="text-xs text-muted-foreground">Your Bid</p>
                              <p className="text-lg font-semibold text-primary">{bid.bidAmount} ETH</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Highest Bid</p>
                              <p className="text-sm font-medium">{bid.highestBid} ETH</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Auction Ends</p>
                              <p className="text-sm font-medium">{new Date(bid.auctionEndTime * 1000).toLocaleString()}</p>
                            </div>
                          </div>
                          <div className="mt-2">
                            <Badge variant={bid.isHighestBidder ? "default" : "secondary"}>
                              {bid.isHighestBidder ? "Highest Bidder" : "Outbid"}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button variant="outline" size="sm" onClick={() => navigate(`/nft/${bid.tokenId}`)}>
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                    {combinedProfileBids.map((bid) => (
                      <div key={bid.id} className="flex items-start gap-4 p-4 border border-border rounded-lg">
                        {bid.artworks?.image_url && (
                          <img
                            src={bid.artworks.image_url}
                            alt={bid.artworks.title || bid.title || "Artwork"}
                            className="w-16 h-16 rounded object-cover cursor-pointer"
                            onClick={() => bid.artwork_id && navigate(`/art/${bid.artwork_id}`)}
                          />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{bid.artworks?.title || bid.title || `Auction #${bid.auction_id}`}</p>
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
                            onClick={() => bid.artwork_id && navigate(`/art/${bid.artwork_id}`)}
                            disabled={!bid.artwork_id}
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
            {activityLoading && fallbackActivities.length === 0 ? (
              <Card className="bg-gradient-card border-border">
                <CardContent className="p-12 text-center">
                  <p className="text-muted-foreground">Loading on-chain activity...</p>
                </CardContent>
              </Card>
            ) : displayedActivities.length > 0 ? (
              <>
                <Card className="bg-gradient-card border-border">
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      {displayedActivities
                        .slice((activityPage - 1) * ITEMS_PER_PAGE, activityPage * ITEMS_PER_PAGE)
                        .map((act) => {
                          const label: Record<string, string> = {
                            mint: "🎉 Minted",
                            transfer: "↗ Transferred",
                            listed: "📋 Listed",
                            listing_cancelled: "❌ Listing Cancelled",
                            listing_updated: "✏️ Price Updated",
                            sold: "💰 Sold",
                            bought: "🛒 Bought",
                            bid: "🔨 Bid Placed",
                            auction_created: "🏷️ Auction Created",
                            auction_won: "🏆 Auction Won",
                            auction_cancelled: "❌ Auction Cancelled",
                          };
                          const timeAgo = act.timestamp
                            ? (() => {
                              const diff = Math.floor(Date.now() / 1000 - act.timestamp);
                              if (diff < 60) return "just now";
                              if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
                              if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
                              return `${Math.floor(diff / 86400)}d ago`;
                            })()
                            : "";

                          return (
                            <div
                              key={act.id}
                              className="flex items-center gap-4 p-4 border border-border rounded-lg hover:bg-accent/50 transition-colors cursor-pointer"
                              onClick={() => navigate(`/nft/${act.tokenId}`)}
                            >
                              {act.nftImage && (
                                <img
                                  src={act.nftImage}
                                  alt={act.nftName}
                                  className="w-14 h-14 rounded-lg object-cover"
                                />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm">
                                  {label[act.type] || act.type}
                                </p>
                                <p className="text-sm text-muted-foreground truncate">
                                  {act.nftName}
                                </p>
                              </div>
                              {act.price && (
                                <p className="text-sm font-semibold whitespace-nowrap">
                                  {parseFloat(act.price).toFixed(4)} ETH
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground whitespace-nowrap">
                                {timeAgo}
                              </p>
                            </div>
                          );
                        })}
                    </div>
                  </CardContent>
                </Card>
                {displayedActivities.length > ITEMS_PER_PAGE && (
                  <Pagination className="mt-4">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                          className={activityPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {Array.from({ length: Math.ceil(displayedActivities.length / ITEMS_PER_PAGE) }, (_, i) => i + 1).map((page) => (
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
                          onClick={() => setActivityPage(p => Math.min(Math.ceil(displayedActivities.length / ITEMS_PER_PAGE), p + 1))}
                          className={activityPage === Math.ceil(displayedActivities.length / ITEMS_PER_PAGE) ? "pointer-events-none opacity-50" : "cursor-pointer"}
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

      {/* Edit Profile Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-card border-border sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update your profile information. Changes are saved locally to your browser.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2 max-h-[60vh] overflow-y-auto">
            {/* Profile Picture Upload */}
            <div>
              <Label className="mb-2 block">Profile Picture</Label>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-xl overflow-hidden bg-gradient-card border-2 border-border relative group">
                  <img
                    src={editAvatarUrl || "/placeholder.svg"}
                    alt="Avatar preview"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
                  />
                  <div
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => avatarInputRef.current?.click()}
                    className="gap-2"
                    type="button"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Photo
                  </Button>
                  <p className="text-xs text-muted-foreground">JPG, PNG or GIF. Max 2MB.</p>
                </div>
              </div>
            </div>

            {/* Banner Upload */}
            <div>
              <Label className="mb-2 block">Banner Image</Label>
              <div className="space-y-2">
                <div className="w-full h-24 rounded-lg overflow-hidden bg-gradient-card border-2 border-border relative group">
                  {editBannerUrl ? (
                    <img
                      src={editBannerUrl}
                      alt="Banner preview"
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}
                  <div
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                    onClick={() => bannerInputRef.current?.click()}
                  >
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </div>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBannerFileChange}
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => bannerInputRef.current?.click()}
                    className="gap-2"
                    type="button"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    {editBannerUrl ? "Change Banner" : "Upload Banner"}
                  </Button>
                  {editBannerUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditBannerUrl("")}
                      className="text-muted-foreground text-xs"
                      type="button"
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Recommended: 1400×400px. Max 4MB.</p>
              </div>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="edit-display-name">Display Name</Label>
              <Input
                id="edit-display-name"
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="Enter your display name"
                className="bg-secondary border-border"
              />
            </div>

            {/* Bio */}
            <div className="space-y-2">
              <Label htmlFor="edit-bio">Bio</Label>
              <Textarea
                id="edit-bio"
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="Tell the world about yourself..."
                className="bg-secondary border-border"
                rows={3}
              />
            </div>

            {/* Social Links */}
            <div className="space-y-3 pt-2 border-t border-border">
              <p className="text-sm font-medium text-muted-foreground">Social Links</p>
              <div className="space-y-2">
                <Label htmlFor="edit-twitter" className="flex items-center gap-2 text-sm">
                  <Twitter className="w-3.5 h-3.5" /> Twitter
                </Label>
                <Input
                  id="edit-twitter"
                  value={editTwitter}
                  onChange={(e) => setEditTwitter(e.target.value)}
                  placeholder="username (without @)"
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-instagram" className="flex items-center gap-2 text-sm">
                  <Instagram className="w-3.5 h-3.5" /> Instagram
                </Label>
                <Input
                  id="edit-instagram"
                  value={editInstagram}
                  onChange={(e) => setEditInstagram(e.target.value)}
                  placeholder="username (without @)"
                  className="bg-secondary border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-website" className="flex items-center gap-2 text-sm">
                  <Globe className="w-3.5 h-3.5" /> Website
                </Label>
                <Input
                  id="edit-website"
                  value={editWebsite}
                  onChange={(e) => setEditWebsite(e.target.value)}
                  placeholder="https://yourwebsite.com"
                  className="bg-secondary border-border"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveEditProfile} className="bg-gradient-primary hover:bg-gradient-hover">
              Save Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Profile;
