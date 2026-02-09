import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Heart,
  Share2,
  ExternalLink,
  Clock,
  Tag,
  Gavel,
  X,
  Edit2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNFTDetail } from "@/hooks/useNFTDetail";
import {
  BLOCK_EXPLORER,
  POKECHAIN_NFT_ADDRESS,
  POKECHAIN_MARKETPLACE_ADDRESS,
  CHAIN_NAME,
} from "@/config/contracts";
import { ethers } from "ethers";
import PokechainMarketplaceAbi from "@/config/abi/PokechainMarketplace.json";
import PokechainNFTAbi from "@/config/abi/PokechainNFT.json";
import { localNotifications } from "@/services/localNotifications";
import { useWallet } from "@/context/WalletContext";
import { nftLikesApi, Liker } from "@/api/notifications";
import { meApi } from "@/api/me";
import { BidRecord } from "@/hooks/useNFTDetail";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/* ─── helpers ──────────────────────────────────────────────── */

function typeColor(type: string): string {
  const colors: Record<string, string> = {
    Fire: "#F08030",
    Water: "#6890F0",
    Grass: "#78C850",
    Electric: "#F8D030",
    Psychic: "#F85888",
    Dragon: "#7038F8",
    Normal: "#A8A878",
    Fighting: "#C03028",
    Ghost: "#705898",
    Dark: "#705848",
    Steel: "#B8B8D0",
    Fairy: "#EE99AC",
    Ice: "#98D8D8",
    Bug: "#A8B820",
    Rock: "#B8A038",
    Ground: "#E0C068",
    Poison: "#A040A0",
    Flying: "#A890F0",
  };
  return colors[type] || "#A8A878";
}

function rarityStyle(rarity: string) {
  switch (rarity) {
    case "Legendary":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    case "Epic":
      return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    case "Rare":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "Uncommon":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    default:
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

function formatPrice(price: string): string {
  const num = parseFloat(price);
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  return num.toFixed(4);
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatTimeRemaining(endTimeUnix: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = endTimeUnix - now;
  if (remaining <= 0) return "Ended";
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h}h ${m}m ${s}s`;
}

/* ─── component ────────────────────────────────────────────── */

const ArtDetail = () => {
  const { tokenId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { nft, loading, error, refetch } = useNFTDetail(tokenId);

  // Connected wallet from shared context
  const { address: walletAddress, signer: walletSigner, setShowSelector } = useWallet();
  const connectedWallet = walletAddress?.toLowerCase() || null;

  // Dialog state
  const [showBuyDialog, setShowBuyDialog] = useState(false);
  const [showBidDialog, setShowBidDialog] = useState(false);
  const [showListDialog, setShowListDialog] = useState(false);
  const [showAuctionDialog, setShowAuctionDialog] = useState(false);
  const [showUpdatePriceDialog, setShowUpdatePriceDialog] = useState(false);
  const [showCancelListingDialog, setShowCancelListingDialog] = useState(false);
  const [showCancelAuctionDialog, setShowCancelAuctionDialog] = useState(false);

  // Form state
  const [bidAmount, setBidAmount] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [auctionStartPrice, setAuctionStartPrice] = useState("");
  const [auctionDuration, setAuctionDuration] = useState("24");
  const [newPrice, setNewPrice] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likersDialogOpen, setLikersDialogOpen] = useState(false);
  const [likers, setLikers] = useState<Liker[]>([]);
  const [bidderProfiles, setBidderProfiles] = useState<Record<string, { username?: string; avatar_url?: string | null; display_name?: string }>>({});

  // Fetch like status from backend
  useEffect(() => {
    const fetchLikeStatus = async () => {
      if (!tokenId) return;
      try {
        const status = await nftLikesApi.getStatus(Number(tokenId), connectedWallet || undefined);
        setIsFavorited(status.liked);
        setLikeCount(status.count);
      } catch {
        // Backend might be offline, check localStorage fallback
        if (connectedWallet) {
          try {
            const stored = localStorage.getItem(`ethermon_favorites_${connectedWallet}`);
            if (stored) {
              const favorites = JSON.parse(stored);
              setIsFavorited(favorites.includes(Number(tokenId)));
            }
          } catch { }
        }
      }
    };
    fetchLikeStatus();
  }, [connectedWallet, tokenId]);

  // Fetch bidder profiles for the Bids tab
  useEffect(() => {
    if (!nft?.bidHistory || nft.bidHistory.length === 0) return;
    const uniqueBidders = [...new Set(nft.bidHistory.map(b => b.bidder.toLowerCase()))];
    // Only fetch profiles we don't have yet
    const missing = uniqueBidders.filter(addr => !(addr in bidderProfiles));
    if (missing.length === 0) return;

    const fetchProfiles = async () => {
      const profiles: typeof bidderProfiles = { ...bidderProfiles };
      for (const addr of missing) {
        try {
          const data = await meApi.profileDetail(addr);
          if (data?.profile) {
            profiles[addr] = {
              username: data.profile.username,
              display_name: data.profile.display_name,
              avatar_url: data.profile.avatar_url,
            };
          }
        } catch {
          // Profile not found — wallet-only user
          profiles[addr] = {};
        }
      }
      setBidderProfiles(profiles);
    };
    fetchProfiles();
  }, [nft?.bidHistory]);

  // Live countdown ticker
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);



  // Derived
  const isOwner =
    connectedWallet && nft?.owner?.toLowerCase() === connectedWallet;
  const isListed = nft?.marketStatus === "listed";
  const isAuction = nft?.marketStatus === "auction";
  const type = nft?.attributes.find(
    (a) => a.trait_type === "Type"
  )?.value as string | undefined;
  const secondaryType = nft?.attributes.find(
    (a) => a.trait_type === "Secondary Type"
  )?.value as string | undefined;
  const rarity = nft?.attributes.find(
    (a) => a.trait_type === "Rarity"
  )?.value as string | undefined;
  const generation = nft?.attributes.find(
    (a) => a.trait_type === "Generation"
  )?.value;
  const hp = nft?.attributes.find(
    (a) => a.trait_type === "HP"
  )?.value;
  const attack = nft?.attributes.find(
    (a) => a.trait_type === "Attack"
  )?.value;
  const defense = nft?.attributes.find(
    (a) => a.trait_type === "Defense"
  )?.value;
  const speed = nft?.attributes.find(
    (a) => a.trait_type === "Speed"
  )?.value;

  const etherscanTokenUrl = `${BLOCK_EXPLORER}/nft/${POKECHAIN_NFT_ADDRESS}/${nft?.tokenId}`;
  const etherscanOwnerUrl = `${BLOCK_EXPLORER}/address/${nft?.owner}`;

  /* ─── marketplace helpers (same pattern as ArtCard) ──────── */

  const ensureApproval = async (signer: ethers.Signer): Promise<boolean> => {
    if (!nft) return false;
    const nftContract = new ethers.Contract(
      POKECHAIN_NFT_ADDRESS,
      PokechainNFTAbi,
      signer
    );
    const approved = await nftContract.getApproved(nft.tokenId);
    if (
      approved.toLowerCase() !== POKECHAIN_MARKETPLACE_ADDRESS.toLowerCase()
    ) {
      toast({
        title: "Approval required",
        description: "Approving NFT for marketplace...",
      });
      const approveTx = await nftContract.approve(
        POKECHAIN_MARKETPLACE_ADDRESS,
        nft.tokenId
      );
      await approveTx.wait();
      toast({
        title: "Approval granted",
        description: "NFT approved for marketplace",
      });
    }
    return true;
  };

  const requireWallet = (): boolean => {
    if (!connectedWallet || !walletSigner) {
      setShowSelector(true);
      return false;
    }
    return true;
  };

  /* Buy */
  const handleBuy = async () => {
    if (!requireWallet() || !nft || !walletSigner) return;
    setIsProcessing(true);
    try {
      const marketplace = new ethers.Contract(
        POKECHAIN_MARKETPLACE_ADDRESS,
        PokechainMarketplaceAbi,
        walletSigner
      );
      const tx = await marketplace.buyItem(nft.tokenId, {
        value: ethers.parseEther(nft.price),
      });
      toast({
        title: "Transaction submitted",
        description: "Waiting for confirmation...",
      });
      await tx.wait();
      toast({
        title: "Purchase successful!",
        description: `You are now the owner of ${nft.name}`,
      });

      // Send local notification
      localNotifications.notifyPurchase(nft.tokenId, nft.price);

      setShowBuyDialog(false);
      // Small delay to let RPC node index the new block
      await new Promise(r => setTimeout(r, 2000));
      refetch();
    } catch (err: any) {
      toast({
        title: "Purchase failed",
        description: err.reason || err.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /* Place bid */
  const handlePlaceBid = async () => {
    if (!requireWallet() || !nft) return;
    const bidVal = parseFloat(bidAmount);
    if (isNaN(bidVal) || bidVal <= 0) {
      toast({
        title: "Invalid bid",
        description: "Please enter a valid bid amount",
        variant: "destructive",
      });
      return;
    }
    setIsProcessing(true);
    try {
      const marketplace = new ethers.Contract(
        POKECHAIN_MARKETPLACE_ADDRESS,
        PokechainMarketplaceAbi,
        walletSigner
      );
      const tx = await marketplace.placeBid(nft.tokenId, {
        value: ethers.parseEther(bidAmount),
      });
      toast({
        title: "Bid submitted",
        description: "Waiting for confirmation...",
      });
      await tx.wait();
      toast({
        title: "Bid placed!",
        description: `Your bid of ${bidAmount} ETH has been placed`,
      });

      // Send local notification
      localNotifications.notifyBid(nft.tokenId, bidAmount);

      setShowBidDialog(false);
      setBidAmount("");
      // Small delay to let RPC node index the new block
      await new Promise(r => setTimeout(r, 2000));
      refetch();
    } catch (err: any) {
      toast({
        title: "Bid failed",
        description: err.reason || err.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /* List for sale */
  const handleListForSale = async () => {
    if (!requireWallet() || !nft) return;
    const priceVal = parseFloat(listPrice);
    if (isNaN(priceVal) || priceVal <= 0) {
      toast({
        title: "Invalid price",
        description: "Please enter a valid price",
        variant: "destructive",
      });
      return;
    }
    setIsProcessing(true);
    try {
      await ensureApproval(walletSigner);
      const marketplace = new ethers.Contract(
        POKECHAIN_MARKETPLACE_ADDRESS,
        PokechainMarketplaceAbi,
        walletSigner
      );
      const tx = await marketplace.listItem(
        nft.tokenId,
        ethers.parseEther(listPrice)
      );
      toast({
        title: "Listing submitted",
        description: "Waiting for confirmation...",
      });
      await tx.wait();
      toast({
        title: "Listed for sale!",
        description: `${nft.name} listed for ${listPrice} ETH`,
      });

      // Send local notification
      localNotifications.notifyListed(nft.tokenId, listPrice);

      setShowListDialog(false);
      setListPrice("");
      // Small delay to let RPC node index the new block
      await new Promise(r => setTimeout(r, 2000));
      refetch();
    } catch (err: any) {
      toast({
        title: "Listing failed",
        description: err.reason || err.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /* Create auction */
  const handleCreateAuction = async () => {
    if (!requireWallet() || !nft) return;
    const startP = parseFloat(auctionStartPrice);
    const dur = parseInt(auctionDuration);
    if (isNaN(startP) || startP <= 0 || isNaN(dur) || dur <= 0) {
      toast({
        title: "Invalid input",
        description: "Please enter valid price and duration",
        variant: "destructive",
      });
      return;
    }
    setIsProcessing(true);
    try {
      await ensureApproval(walletSigner);
      const marketplace = new ethers.Contract(
        POKECHAIN_MARKETPLACE_ADDRESS,
        PokechainMarketplaceAbi,
        walletSigner
      );
      const tx = await marketplace.createAuction(
        nft.tokenId,
        ethers.parseEther(auctionStartPrice),
        dur * 3600
      );
      toast({
        title: "Auction submitted",
        description: "Waiting for confirmation...",
      });
      await tx.wait();
      toast({
        title: "Auction created!",
        description: `${nft.name} is now up for auction`,
      });
      setShowAuctionDialog(false);
      setAuctionStartPrice("");
      setAuctionDuration("24");
      // Small delay to let RPC node index the new block
      await new Promise(r => setTimeout(r, 2000));
      refetch();
    } catch (err: any) {
      toast({
        title: "Auction creation failed",
        description: err.reason || err.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /* Cancel listing */
  const handleCancelListing = async () => {
    if (!requireWallet() || !nft || !walletSigner) return;
    setIsProcessing(true);
    try {
      const marketplace = new ethers.Contract(
        POKECHAIN_MARKETPLACE_ADDRESS,
        PokechainMarketplaceAbi,
        walletSigner
      );
      const tx = await marketplace.cancelListing(nft.tokenId);
      toast({
        title: "Cancellation submitted",
        description: "Waiting for confirmation...",
      });
      await tx.wait();
      toast({
        title: "Listing cancelled",
        description: `${nft.name} has been delisted`,
      });
      setShowCancelListingDialog(false);
      // Small delay to let RPC node index the new block
      await new Promise(r => setTimeout(r, 2000));
      refetch();
    } catch (err: any) {
      toast({
        title: "Cancellation failed",
        description: err.reason || err.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /* Cancel auction */
  const handleCancelAuction = async () => {
    if (!requireWallet() || !nft || !walletSigner) return;
    setIsProcessing(true);
    try {
      const marketplace = new ethers.Contract(
        POKECHAIN_MARKETPLACE_ADDRESS,
        PokechainMarketplaceAbi,
        walletSigner
      );
      const tx = await marketplace.cancelAuction(nft.tokenId);
      toast({
        title: "Cancellation submitted",
        description: "Waiting for confirmation...",
      });
      await tx.wait();
      toast({
        title: "Auction cancelled",
        description: `${nft.name} auction has been cancelled`,
      });
      setShowCancelAuctionDialog(false);
      // Small delay to let RPC node index the new block
      await new Promise(r => setTimeout(r, 2000));
      refetch();
    } catch (err: any) {
      toast({
        title: "Cancellation failed",
        description: err.reason || err.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /* Update listing price */
  const handleUpdatePrice = async () => {
    if (!requireWallet() || !nft) return;
    const priceVal = parseFloat(newPrice);
    if (isNaN(priceVal) || priceVal <= 0) {
      toast({
        title: "Invalid price",
        description: "Please enter a valid price",
        variant: "destructive",
      });
      return;
    }
    setIsProcessing(true);
    try {
      const marketplace = new ethers.Contract(
        POKECHAIN_MARKETPLACE_ADDRESS,
        PokechainMarketplaceAbi,
        walletSigner
      );
      const tx = await marketplace.updateListing(
        nft.tokenId,
        ethers.parseEther(newPrice)
      );
      toast({
        title: "Price update submitted",
        description: "Waiting for confirmation...",
      });
      await tx.wait();
      toast({
        title: "Price updated!",
        description: `New price: ${newPrice} ETH`,
      });
      setShowUpdatePriceDialog(false);
      setNewPrice("");
      // Small delay to let RPC node index the new block
      await new Promise(r => setTimeout(r, 2000));
      refetch();
    } catch (err: any) {
      toast({
        title: "Price update failed",
        description: err.reason || err.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  /* ─── render ────────────────────────────────────────────── */

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground">Loading NFT data from chain...</p>
          </div>
        </div>
      </>
    );
  }

  if (error || !nft) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-2xl font-bold">NFT not found</p>
            <p className="text-muted-foreground">
              {error || "This token may not exist on-chain yet."}
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Discover
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* Back button */}
          <Button
            variant="ghost"
            className="mb-6 gap-2"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Discover
          </Button>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* ────── Left: Image ────── */}
            <div className="space-y-4">
              <Card className="overflow-hidden border-border bg-card">
                <div className="aspect-square relative bg-muted flex items-center justify-center">
                  {nft.image ? (
                    <img
                      src={nft.image}
                      alt={nft.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-6xl">❓</div>
                  )}

                  {/* Favorite overlay */}
                  <div className="absolute top-3 right-3 flex items-center gap-0 z-10">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="bg-white/90 backdrop-blur-sm hover:bg-white border border-border/20 shadow-md rounded-r-none"
                      onClick={async () => {
                        if (!connectedWallet) {
                          toast({
                            title: "Connect wallet",
                            description: "Please connect your wallet to save favorites",
                            variant: "destructive",
                          });
                          return;
                        }

                        // Prevent liking your own NFT
                        if (isOwner) {
                          toast({
                            title: "Can't like your own NFT",
                            variant: "destructive",
                          });
                          return;
                        }

                        try {
                          if (isFavorited) {
                            await nftLikesApi.unlike(Number(tokenId), connectedWallet);
                            setIsFavorited(false);
                            setLikeCount((c) => Math.max(0, c - 1));
                            toast({ title: "Removed from favorites" });
                          } else {
                            await nftLikesApi.like(Number(tokenId), connectedWallet, nft.owner);
                            setIsFavorited(true);
                            setLikeCount((c) => c + 1);
                            toast({ title: "Added to favorites" });
                          }
                        } catch {
                          // Fallback to localStorage if backend fails
                          const key = `ethermon_favorites_${connectedWallet}`;
                          try {
                            const stored = localStorage.getItem(key);
                            const favorites = stored ? JSON.parse(stored) : [];
                            const tid = Number(tokenId);
                            if (isFavorited) {
                              localStorage.setItem(key, JSON.stringify(favorites.filter((id: number) => id !== tid)));
                            } else {
                              localStorage.setItem(key, JSON.stringify([...favorites, tid]));
                            }
                            setIsFavorited(!isFavorited);
                            toast({ title: isFavorited ? "Removed from favorites" : "Added to favorites" });
                          } catch { }
                        }
                      }}
                    >
                      <Heart
                        className={`w-4 h-4 ${isFavorited
                          ? "fill-red-500 text-red-500"
                          : "text-gray-900"
                          }`}
                      />
                    </Button>
                    <button
                      className="h-9 min-w-[36px] px-2 flex items-center justify-center text-sm font-semibold bg-white/90 backdrop-blur-sm border border-l-0 border-border/20 shadow-md rounded-r-md text-gray-700 hover:bg-white transition-colors cursor-pointer"
                      onClick={async () => {
                        if (!tokenId) return;
                        try {
                          const { likers: data } = await nftLikesApi.getLikers(Number(tokenId));
                          setLikers(data);
                        } catch {
                          setLikers([]);
                        }
                        setLikersDialogOpen(true);
                      }}
                      title="View who liked this NFT"
                    >
                      {likeCount}
                    </button>
                  </div>

                  {/* Auction timer overlay */}
                  {isAuction && nft.auctionEndTime > 0 && (
                    <div className="absolute bottom-3 left-3 px-3 py-1.5 bg-foreground/90 backdrop-blur-sm rounded-full flex items-center gap-2 text-background">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-sm font-medium">
                        {formatTimeRemaining(nft.auctionEndTime)}
                      </span>
                    </div>
                  )}

                  {/* Etherscan link overlay */}
                  <a
                    href={etherscanTokenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-3 right-3 p-2 bg-background/80 backdrop-blur-sm rounded-md border border-border hover:bg-background transition-colors"
                  >
                    <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  </a>
                </div>
              </Card>
            </div>

            {/* ────── Right: Details ────── */}
            <div className="space-y-6">
              {/* Name & identifiers */}
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs font-mono bg-muted px-2 py-1 rounded-md border border-border">
                    Token #{nft.tokenId}
                  </span>
                  {rarity && (
                    <span
                      className={`text-xs font-semibold px-2 py-1 rounded-md border ${rarityStyle(
                        rarity
                      )}`}
                    >
                      {rarity}
                    </span>
                  )}
                  {isListed && (
                    <Badge variant="secondary" className="text-xs">
                      Listed
                    </Badge>
                  )}
                  {isAuction && (
                    <Badge
                      variant="secondary"
                      className="text-xs bg-accent text-accent-foreground"
                    >
                      Auction
                    </Badge>
                  )}
                </div>

                <h1 className="text-3xl sm:text-4xl font-bold mb-1">
                  {nft.name}
                </h1>

                {/* Types */}
                <div className="flex gap-1.5 mb-2 mt-2">
                  {type && (
                    <span
                      className="text-xs font-medium px-2.5 py-1 rounded-full text-white"
                      style={{ backgroundColor: typeColor(type) }}
                    >
                      {type}
                    </span>
                  )}
                  {secondaryType && secondaryType !== "None" && (
                    <span
                      className="text-xs font-medium px-2.5 py-1 rounded-full text-white"
                      style={{ backgroundColor: typeColor(secondaryType) }}
                    >
                      {secondaryType}
                    </span>
                  )}
                </div>

                {generation && (
                  <p className="text-sm text-muted-foreground">
                    Gen {generation} · Pokédex #{nft.pokemonId}
                  </p>
                )}

                {/* Owner */}
                <p className="text-sm text-muted-foreground mt-3">
                  Owned by{" "}
                  <span
                    className="text-primary font-medium hover:underline cursor-pointer"
                    onClick={() => navigate(`/profile/${nft.owner}`)}
                  >
                    {isOwner ? "you" : truncateAddress(nft.owner)}
                  </span>
                </p>
              </div>

              {/* ── Price / Action Card ── */}
              <Card className="border-border bg-card">
                <CardContent className="p-6">
                  {/* Not listed */}
                  {nft.marketStatus === "none" && (
                    <>
                      <div className="mb-4 text-center py-4">
                        <p className="text-sm text-muted-foreground mb-1">
                          Not listed on marketplace
                        </p>
                        {isOwner && (
                          <p className="text-xs text-muted-foreground">
                            List or auction this NFT to sell it
                          </p>
                        )}
                      </div>
                      {isOwner ? (
                        <div className="flex gap-3">
                          <Button
                            className="flex-1 bg-gradient-primary hover:bg-gradient-hover gap-2"
                            onClick={() => setShowListDialog(true)}
                          >
                            <Tag className="w-4 h-4" />
                            List
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1 gap-2"
                            onClick={() => setShowAuctionDialog(true)}
                          >
                            <Gavel className="w-4 h-4" />
                            Auction
                          </Button>
                        </div>
                      ) : (
                        <p className="text-center text-sm text-muted-foreground">
                          Not for sale
                        </p>
                      )}
                    </>
                  )}

                  {/* Listed — fixed price */}
                  {isListed && (
                    <>
                      <div className="mb-4">
                        <p className="text-sm text-muted-foreground mb-1">
                          Price
                        </p>
                        <p className="text-3xl font-bold">
                          {formatPrice(nft.price)}{" "}
                          <span className="text-lg text-muted-foreground">
                            ETH
                          </span>
                        </p>
                      </div>
                      {isOwner ? (
                        <div className="flex gap-3">
                          <Button
                            variant="outline"
                            className="flex-1 gap-2"
                            onClick={() => {
                              setNewPrice(nft.price);
                              setShowUpdatePriceDialog(true);
                            }}
                          >
                            <Edit2 className="w-4 h-4" />
                            Update Price
                          </Button>
                          <Button
                            variant="destructive"
                            className="flex-1 gap-2"
                            onClick={() => setShowCancelListingDialog(true)}
                          >
                            <X className="w-4 h-4" />
                            Cancel Listing
                          </Button>
                        </div>
                      ) : (
                        <Button
                          className="w-full bg-gradient-primary hover:bg-gradient-hover text-lg py-6"
                          onClick={() => setShowBuyDialog(true)}
                        >
                          Buy Now
                        </Button>
                      )}
                    </>
                  )}

                  {/* Auction */}
                  {isAuction && nft.auction && (
                    <>
                      {/* Countdown */}
                      <div className="mb-4 space-y-1">
                        <div className="flex justify-between items-center">
                          <p className="text-sm text-muted-foreground">
                            {nft.auctionEndTime > 0 &&
                              nft.auctionEndTime * 1000 > Date.now()
                              ? "Auction ends in"
                              : "Auction ended"}
                          </p>
                          <div className="flex items-center gap-1.5 text-foreground">
                            <Clock className="w-4 h-4" />
                            <span className="text-sm font-semibold">
                              {formatTimeRemaining(nft.auctionEndTime)}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Ends:{" "}
                          {new Date(
                            nft.auctionEndTime * 1000
                          ).toLocaleString()}
                        </p>
                      </div>

                      {/* Bid info */}
                      <div className="mb-4">
                        <p className="text-sm text-muted-foreground mb-1">
                          {parseFloat(nft.auction.highestBid) > 0
                            ? "Current Bid"
                            : "Starting Price"}
                        </p>
                        <p className="text-3xl font-bold">
                          {parseFloat(nft.auction.highestBid) > 0
                            ? formatPrice(nft.auction.highestBid)
                            : formatPrice(nft.auction.startingPrice)}{" "}
                          <span className="text-lg text-muted-foreground">
                            ETH
                          </span>
                        </p>
                        {parseFloat(nft.auction.highestBid) > 0 &&
                          nft.auction.highestBidder !==
                          ethers.ZeroAddress && (
                            <p className="text-sm text-muted-foreground mt-1">
                              by{" "}
                              <a
                                href={`${BLOCK_EXPLORER}/address/${nft.auction.highestBidder}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                {connectedWallet &&
                                  nft.auction.highestBidder.toLowerCase() ===
                                  connectedWallet
                                  ? "you"
                                  : truncateAddress(
                                    nft.auction.highestBidder
                                  )}
                              </a>
                            </p>
                          )}
                      </div>

                      {isOwner ? (
                        <Button
                          variant="destructive"
                          className="w-full gap-2"
                          onClick={() => setShowCancelAuctionDialog(true)}
                        >
                          <X className="w-4 h-4" />
                          Cancel Auction
                        </Button>
                      ) : (
                        <Button
                          className="w-full bg-gradient-primary hover:bg-gradient-hover text-lg py-6"
                          onClick={() => {
                            setBidAmount("");
                            setShowBidDialog(true);
                          }}
                          disabled={
                            nft.auctionEndTime > 0 &&
                            nft.auctionEndTime * 1000 <= Date.now()
                          }
                        >
                          Place Bid
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>


              {/* Share button */}
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast({
                    title: "Link copied!",
                    description: "NFT link copied to clipboard",
                  });
                }}
              >
                <Share2 className="w-4 h-4" />
                Share
              </Button>

              {/* ── Tabs ── */}
              <Tabs defaultValue="details" className="w-full mt-2">
                <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none h-auto p-0">
                  <TabsTrigger
                    value="details"
                    className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-3"
                  >
                    Details
                  </TabsTrigger>
                  <TabsTrigger
                    value="contract"
                    className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-3"
                  >
                    Contract Info
                  </TabsTrigger>
                  {nft.marketStatus === "auction" && (
                    <TabsTrigger
                      value="bids"
                      className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-3"
                    >
                      Bids{nft.bidHistory && nft.bidHistory.length > 0 ? ` (${nft.bidHistory.length})` : ""}
                    </TabsTrigger>
                  )}
                </TabsList>

                {/* Details tab */}
                <TabsContent value="details" className="space-y-4 mt-4">
                  {/* Description */}
                  <Card className="border-border bg-card">
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-3">Description</h3>
                      <p className="text-muted-foreground text-sm">
                        {nft.description || "No description available."}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Attributes */}
                  {nft.attributes.length > 0 && (
                    <Card className="border-border bg-card">
                      <CardContent className="p-6">
                        <h3 className="font-semibold mb-3">Attributes</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {nft.attributes.map((attr, i) => (
                            <div
                              key={i}
                              className="p-3 bg-muted/50 rounded-lg border border-border text-center"
                            >
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                                {attr.trait_type}
                              </p>
                              <p className="font-semibold text-sm mt-1">
                                {attr.value}
                              </p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Stats bar (if available) */}
                  {(hp || attack || defense || speed) && (
                    <Card className="border-border bg-card">
                      <CardContent className="p-6">
                        <h3 className="font-semibold mb-3">Base Stats</h3>
                        <div className="space-y-3">
                          {[
                            { label: "HP", value: hp },
                            { label: "Attack", value: attack },
                            { label: "Defense", value: defense },
                            { label: "Speed", value: speed },
                          ]
                            .filter((s) => s.value !== undefined)
                            .map((stat) => (
                              <div key={stat.label} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    {stat.label}
                                  </span>
                                  <span className="font-medium">
                                    {stat.value}
                                  </span>
                                </div>
                                <div className="h-2 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full transition-all"
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        (Number(stat.value) / 255) * 100
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* Contract Info tab */}
                <TabsContent value="contract" className="mt-4">
                  <Card className="border-border bg-card">
                    <CardContent className="p-6 space-y-4">
                      <h3 className="font-semibold mb-1">Contract Info</h3>
                      <div className="space-y-3 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            Token ID
                          </span>
                          <span className="font-mono">#{nft.tokenId}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">
                            Pokémon ID
                          </span>
                          <span className="font-mono">#{nft.pokemonId}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Chain</span>
                          <span>{CHAIN_NAME}</span>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-muted-foreground">
                            NFT Contract
                          </span>
                          <a
                            href={`${BLOCK_EXPLORER}/address/${POKECHAIN_NFT_ADDRESS}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-mono text-xs flex items-center gap-1"
                          >
                            {truncateAddress(POKECHAIN_NFT_ADDRESS)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-muted-foreground">
                            Marketplace
                          </span>
                          <a
                            href={`${BLOCK_EXPLORER}/address/${POKECHAIN_MARKETPLACE_ADDRESS}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-mono text-xs flex items-center gap-1"
                          >
                            {truncateAddress(POKECHAIN_MARKETPLACE_ADDRESS)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                        <div className="flex justify-between items-center gap-4">
                          <span className="text-muted-foreground">Owner</span>
                          <a
                            href={etherscanOwnerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline font-mono text-xs flex items-center gap-1"
                          >
                            {truncateAddress(nft.owner)}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-border">
                        <a
                          href={etherscanTokenUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary hover:underline flex items-center gap-1"
                        >
                          View on Etherscan
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Bids tab */}
                {nft.marketStatus === "auction" && (
                  <TabsContent value="bids" className="mt-4">
                    <Card className="border-border bg-card">
                      <CardContent className="p-6">
                        {(!nft.bidHistory || nft.bidHistory.length === 0) ? (
                          <div className="text-center py-8">
                            <Gavel className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                            <p className="text-muted-foreground">No bids yet</p>
                            <p className="text-sm text-muted-foreground mt-1">Be the first to place a bid!</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {[...nft.bidHistory]
                              .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))
                              .map((bid, index) => {
                                const profile = bidderProfiles[bid.bidder.toLowerCase()];
                                const displayName = connectedWallet && bid.bidder.toLowerCase() === connectedWallet
                                  ? "You"
                                  : profile?.display_name || profile?.username || truncateAddress(bid.bidder);
                                const profileLink = profile?.username
                                  ? `/profile/${profile.username}`
                                  : `/profile/${bid.bidder}`;

                                return (
                                  <div
                                    key={bid.transactionHash}
                                    className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${bid.isHighest
                                      ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800"
                                      : "bg-muted/30 border-border/30 hover:bg-muted/50"
                                      }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <div
                                        className="cursor-pointer"
                                        onClick={() => navigate(profileLink)}
                                      >
                                        <Avatar className="w-10 h-10 border-2 border-background">
                                          {profile?.avatar_url ? (
                                            <AvatarImage src={profile.avatar_url} alt={displayName} />
                                          ) : null}
                                          <AvatarFallback className={bid.isHighest ? "bg-green-500 text-white" : ""}>
                                            {displayName.slice(0, 2).toUpperCase()}
                                          </AvatarFallback>
                                        </Avatar>
                                      </div>
                                      <div>
                                        <span
                                          className="text-sm font-medium hover:underline cursor-pointer"
                                          onClick={() => navigate(profileLink)}
                                        >
                                          {displayName}
                                        </span>
                                        <div className="flex items-center gap-2 mt-0.5">
                                          {bid.isHighest ? (
                                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                                              ★ Highest Bidder
                                            </span>
                                          ) : (
                                            <span className="text-xs text-orange-500 dark:text-orange-400">
                                              Outbid
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className={`font-bold text-lg ${bid.isHighest ? "text-green-700 dark:text-green-400" : ""}`}>
                                        {parseFloat(bid.amount).toFixed(4)}
                                        <span className="text-sm text-muted-foreground ml-1">ETH</span>
                                      </p>
                                      <a
                                        href={`${BLOCK_EXPLORER}/tx/${bid.transactionHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-muted-foreground hover:text-primary hover:underline"
                                      >
                                        View tx ↗
                                      </a>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                )}
              </Tabs>
            </div>
          </div>
        </div>
      </div>

      {/* ────── Dialogs ────── */}

      {/* Buy Confirmation */}
      <Dialog open={showBuyDialog} onOpenChange={setShowBuyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Purchase</DialogTitle>
            <DialogDescription>
              You are about to purchase this NFT
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">NFT:</span>
              <span className="font-semibold">{nft.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Token ID:</span>
              <span className="font-mono">#{nft.tokenId}</span>
            </div>
            <div className="flex justify-between items-center border-t pt-4">
              <span className="text-sm text-muted-foreground">Price:</span>
              <span className="font-bold text-lg">
                {formatPrice(nft.price)} ETH
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBuyDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBuy}
              disabled={isProcessing}
              className="bg-gradient-primary hover:bg-gradient-hover"
            >
              {isProcessing ? "Processing..." : "Confirm Purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bid Dialog */}
      <Dialog open={showBidDialog} onOpenChange={setShowBidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Place Your Bid</DialogTitle>
            <DialogDescription>
              Enter your bid amount for this auction
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">NFT:</span>
              <span className="font-semibold">{nft.name}</span>
            </div>
            {nft.auction && (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Current Bid:
                  </span>
                  <span className="font-semibold">
                    {parseFloat(nft.auction.highestBid) > 0
                      ? `${formatPrice(nft.auction.highestBid)} ETH`
                      : `${formatPrice(nft.auction.startingPrice)} ETH (starting)`}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">
                    Ends in:
                  </span>
                  <span className="font-semibold">
                    {formatTimeRemaining(nft.auctionEndTime)}
                  </span>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="bidAmount">Your Bid (ETH)</Label>
              <Input
                id="bidAmount"
                type="number"
                placeholder="Enter bid amount"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                min={0.0001}
                step="0.0001"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBidDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePlaceBid}
              disabled={isProcessing || !bidAmount}
              className="bg-gradient-primary hover:bg-gradient-hover"
            >
              {isProcessing ? "Processing..." : "Place Bid"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* List for Sale Dialog */}
      <Dialog open={showListDialog} onOpenChange={setShowListDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>List for Sale</DialogTitle>
            <DialogDescription>
              Set a fixed price for your NFT
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">NFT:</span>
              <span className="font-semibold">{nft.name}</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="listPrice">Price (ETH)</Label>
              <Input
                id="listPrice"
                type="number"
                placeholder="0.01"
                value={listPrice}
                onChange={(e) => setListPrice(e.target.value)}
                min={0.0001}
                step="0.0001"
              />
            </div>
            {listPrice && parseFloat(listPrice) > 0 && (
              <div className="p-3 bg-secondary/50 rounded-lg border border-border space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">List Price:</span>
                  <span className="font-medium">{listPrice} ETH</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Platform Fee (2.5%):
                  </span>
                  <span className="font-medium text-destructive">
                    -{(parseFloat(listPrice) * 0.025).toFixed(6)} ETH
                  </span>
                </div>
                <div className="pt-2 border-t border-border flex justify-between">
                  <span className="text-sm font-semibold">You receive:</span>
                  <span className="font-bold text-primary">
                    {(parseFloat(listPrice) * 0.975).toFixed(6)} ETH
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowListDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleListForSale}
              disabled={isProcessing || !listPrice}
              className="bg-gradient-primary hover:bg-gradient-hover"
            >
              {isProcessing ? "Processing..." : "List for Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Auction Dialog */}
      <Dialog open={showAuctionDialog} onOpenChange={setShowAuctionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Auction</DialogTitle>
            <DialogDescription>Start an auction for your NFT</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">NFT:</span>
              <span className="font-semibold">{nft.name}</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="auctionStartPrice">Starting Price (ETH)</Label>
              <Input
                id="auctionStartPrice"
                type="number"
                placeholder="0.01"
                value={auctionStartPrice}
                onChange={(e) => setAuctionStartPrice(e.target.value)}
                min={0.0001}
                step="0.0001"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auctionDuration">Duration (hours)</Label>
              <Input
                id="auctionDuration"
                type="number"
                placeholder="24"
                value={auctionDuration}
                onChange={(e) => setAuctionDuration(e.target.value)}
                min={1}
                step="1"
              />
              <p className="text-xs text-muted-foreground">
                Min 1 hour, max 168 hours (1 week)
              </p>
            </div>
            {auctionDuration && parseInt(auctionDuration) > 0 && (
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                <p className="text-sm font-semibold text-primary mb-1">
                  Auction End:
                </p>
                <p className="text-sm">
                  {(() => {
                    const end = new Date();
                    end.setHours(end.getHours() + parseInt(auctionDuration));
                    return end.toLocaleString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                    });
                  })()}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAuctionDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateAuction}
              disabled={
                isProcessing || !auctionStartPrice || !auctionDuration
              }
              className="bg-gradient-primary hover:bg-gradient-hover"
            >
              {isProcessing ? "Processing..." : "Create Auction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Price Dialog */}
      <Dialog
        open={showUpdatePriceDialog}
        onOpenChange={setShowUpdatePriceDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Price</DialogTitle>
            <DialogDescription>
              Change the listing price for your NFT
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Current Price:
              </span>
              <span className="font-semibold">
                {formatPrice(nft.price)} ETH
              </span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPrice">New Price (ETH)</Label>
              <Input
                id="newPrice"
                type="number"
                placeholder="0.01"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                min={0.0001}
                step="0.0001"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUpdatePriceDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdatePrice}
              disabled={isProcessing || !newPrice}
              className="bg-gradient-primary hover:bg-gradient-hover"
            >
              {isProcessing ? "Processing..." : "Update Price"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Listing Confirmation */}
      <Dialog
        open={showCancelListingDialog}
        onOpenChange={setShowCancelListingDialog}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Listing</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this NFT from sale?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCancelListingDialog(false)}
            >
              Keep Listed
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelListing}
              disabled={isProcessing}
            >
              {isProcessing ? "Processing..." : "Cancel Listing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Auction Confirmation */}
      <Dialog
        open={showCancelAuctionDialog}
        onOpenChange={setShowCancelAuctionDialog}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Auction</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this auction? Any existing bids
              will be refunded.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
            <p className="text-sm text-destructive font-semibold mb-1">
              Warning
            </p>
            <p className="text-xs text-muted-foreground">
              This will immediately cancel the auction and refund all bidders.
              This action cannot be undone.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCancelAuctionDialog(false)}
            >
              Keep Auction
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelAuction}
              disabled={isProcessing}
            >
              {isProcessing ? "Processing..." : "Cancel Auction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Likers Dialog */}
      <Dialog open={likersDialogOpen} onOpenChange={setLikersDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500 fill-red-500" />
              Liked by {likers.length} {likers.length === 1 ? "person" : "people"}
            </DialogTitle>
            <DialogDescription>
              Users who liked this NFT
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[300px]">
            {likers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No likes yet</p>
            ) : (
              <div className="space-y-3">
                {likers.map((liker) => (
                  <div
                    key={liker.wallet}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => {
                      setLikersDialogOpen(false);
                      navigate(`/profile/${liker.wallet}`);
                    }}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={liker.avatar_url || undefined} />
                      <AvatarFallback className="bg-gradient-primary text-white text-xs">
                        {(liker.display_name || liker.wallet.slice(2, 4)).slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {liker.display_name || `${liker.wallet.slice(0, 6)}...${liker.wallet.slice(-4)}`}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {`${liker.wallet.slice(0, 6)}...${liker.wallet.slice(-4)}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ArtDetail;
