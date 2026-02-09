import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Clock, ExternalLink, Tag, Gavel, X, Edit2, MoreHorizontal } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { NFTItem, MarketStatus } from "@/hooks/useAllNFTs";
import { BLOCK_EXPLORER, POKECHAIN_NFT_ADDRESS, POKECHAIN_MARKETPLACE_ADDRESS } from "@/config/contracts";
import { ethers } from "ethers";
import PokechainMarketplaceAbi from "@/config/abi/PokechainMarketplace.json";
import PokechainNFTAbi from "@/config/abi/PokechainNFT.json";
import { localNotifications } from "@/services/localNotifications";
import { useWallet } from "@/context/WalletContext";
import { nftLikesApi, Liker } from "@/api/notifications";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ArtCardProps {
  nft: NFTItem;
  onRefetch?: () => void;
}

/** Get a CSS color for a Pokémon type */
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

/** Get rarity badge styles */
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

/** Format ETH price */
function formatPrice(price: string): string {
  const num = parseFloat(price);
  if (num === 0) return "0";
  if (num < 0.0001) return "<0.0001";
  return num.toFixed(4);
}

/** Format remaining auction time */
function formatTimeRemaining(endTime: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = endTime - now;

  if (remaining <= 0) return "Ended";

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);

  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

const ArtCard = ({ nft, onRefetch }: ArtCardProps) => {
  const { toast } = useToast();
  const [showBuyDialog, setShowBuyDialog] = useState(false);
  const [showBidDialog, setShowBidDialog] = useState(false);
  const [showListDialog, setShowListDialog] = useState(false);
  const [showAuctionDialog, setShowAuctionDialog] = useState(false);
  const [showUpdatePriceDialog, setShowUpdatePriceDialog] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [auctionStartPrice, setAuctionStartPrice] = useState("");
  const [auctionDuration, setAuctionDuration] = useState("24"); // hours
  const [newPrice, setNewPrice] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Connected wallet from shared context
  const { address: walletAddress, signer: walletSigner, setShowSelector } = useWallet();
  const connectedWallet = walletAddress?.toLowerCase() || null;

  const [isFavorited, setIsFavorited] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [likersDialogOpen, setLikersDialogOpen] = useState(false);
  const [likers, setLikers] = useState<Liker[]>([]);
  const navigate = useNavigate();

  // Fetch like status from backend
  useEffect(() => {
    const fetchLikeStatus = async () => {
      try {
        const status = await nftLikesApi.getStatus(nft.tokenId, connectedWallet || undefined);
        setIsFavorited(status.liked);
        setLikeCount(status.count);
      } catch {
        // Backend might be offline, check localStorage fallback
        if (connectedWallet) {
          try {
            const stored = localStorage.getItem(`ethermon_favorites_${connectedWallet}`);
            if (stored) {
              const favorites = JSON.parse(stored);
              setIsFavorited(favorites.includes(nft.tokenId));
            }
          } catch { }
        }
      }
    };
    fetchLikeStatus();
  }, [connectedWallet, nft.tokenId]);

  // Check if connected wallet is the owner
  const isOwner = connectedWallet && nft.owner?.toLowerCase() === connectedWallet;

  /** Guard: opens wallet selector if not connected */
  const requireWallet = (): boolean => {
    if (!connectedWallet || !walletSigner) {
      setShowSelector(true);
      return false;
    }
    return true;
  };

  // Extract NFT attributes
  const type = nft.attributes.find((a) => a.trait_type === "Type")?.value as string | undefined;
  const secondaryType = nft.attributes.find((a) => a.trait_type === "Secondary Type")?.value as string | undefined;
  const rarity = nft.attributes.find((a) => a.trait_type === "Rarity")?.value as string | undefined;
  const generation = nft.attributes.find((a) => a.trait_type === "Generation")?.value;

  const etherscanUrl = `${BLOCK_EXPLORER}/nft/${POKECHAIN_NFT_ADDRESS}/${nft.tokenId}`;
  const isListed = nft.marketStatus === "listed";
  const isAuction = nft.marketStatus === "auction";
  const hasPrice = parseFloat(nft.price) > 0;

  const handleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

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
        await nftLikesApi.unlike(nft.tokenId, connectedWallet);
        setIsFavorited(false);
        setLikeCount((c) => Math.max(0, c - 1));
        toast({ title: "Removed from favorites" });
      } else {
        await nftLikesApi.like(nft.tokenId, connectedWallet, nft.owner);
        setIsFavorited(true);
        setLikeCount((c) => c + 1);
        toast({ title: "Added to favorites" });
      }
    } catch (error) {
      // Fallback to localStorage if backend fails
      const key = `ethermon_favorites_${connectedWallet}`;
      try {
        const stored = localStorage.getItem(key);
        const favorites = stored ? JSON.parse(stored) : [];
        if (isFavorited) {
          localStorage.setItem(key, JSON.stringify(favorites.filter((id: number) => id !== nft.tokenId)));
        } else {
          localStorage.setItem(key, JSON.stringify([...favorites, nft.tokenId]));
        }
        setIsFavorited(!isFavorited);
        toast({ title: isFavorited ? "Removed from favorites" : "Added to favorites" });
      } catch { }
    }
  };

  const handleBuy = async () => {
    if (!requireWallet()) return;

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
        title: "Purchase successful! 🎉",
        description: `You are now the owner of ${nft.name}`,
      });

      // Send local notification
      localNotifications.notifyPurchase(nft.tokenId, nft.price);

      setShowBuyDialog(false);
      onRefetch?.();
    } catch (error: any) {
      console.error("Purchase failed:", error);
      toast({
        title: "Purchase failed",
        description: error.reason || error.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePlaceBid = async () => {
    if (!requireWallet() || !walletSigner) return;

    const bidValue = parseFloat(bidAmount);
    if (isNaN(bidValue) || bidValue <= 0) {
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
        title: "Bid placed! 🎉",
        description: `Your bid of ${bidAmount} ETH has been placed`,
      });

      // Send local notification
      localNotifications.notifyBid(nft.tokenId, bidAmount);

      setShowBidDialog(false);
      setBidAmount("");
      onRefetch?.();
    } catch (error: any) {
      console.error("Bid failed:", error);
      toast({
        title: "Bid failed",
        description: error.reason || error.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isAuction) {
      setBidAmount(nft.price); // Pre-fill with current price as minimum
      setShowBidDialog(true);
    } else if (isListed) {
      setShowBuyDialog(true);
    }
  };

  // Check and request NFT approval for marketplace
  const ensureApproval = async (signer: ethers.Signer): Promise<boolean> => {
    const nftContract = new ethers.Contract(
      POKECHAIN_NFT_ADDRESS,
      PokechainNFTAbi,
      signer
    );

    const approved = await nftContract.getApproved(nft.tokenId);
    if (approved.toLowerCase() !== POKECHAIN_MARKETPLACE_ADDRESS.toLowerCase()) {
      toast({
        title: "Approval required",
        description: "Approving NFT for marketplace...",
      });

      const approveTx = await nftContract.approve(POKECHAIN_MARKETPLACE_ADDRESS, nft.tokenId);
      await approveTx.wait();

      toast({
        title: "Approval granted",
        description: "NFT approved for marketplace",
      });
    }
    return true;
  };

  const handleListForSale = async () => {
    if (!requireWallet() || !walletSigner) return;

    const priceValue = parseFloat(listPrice);
    if (isNaN(priceValue) || priceValue <= 0) {
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

      const tx = await marketplace.listItem(nft.tokenId, ethers.parseEther(listPrice));

      toast({
        title: "Listing submitted",
        description: "Waiting for confirmation...",
      });

      await tx.wait();

      toast({
        title: "Listed for sale! 🎉",
        description: `${nft.name} is now listed for ${listPrice} ETH`,
      });

      // Send local notification
      localNotifications.notifyListed(nft.tokenId, listPrice);

      setShowListDialog(false);
      setListPrice("");
      onRefetch?.();
    } catch (error: any) {
      console.error("Listing failed:", error);
      toast({
        title: "Listing failed",
        description: error.reason || error.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateAuction = async () => {
    if (!requireWallet() || !walletSigner) return;

    const startPrice = parseFloat(auctionStartPrice);
    const duration = parseInt(auctionDuration);
    if (isNaN(startPrice) || startPrice <= 0 || isNaN(duration) || duration <= 0) {
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

      const durationSeconds = duration * 3600; // Convert hours to seconds
      const tx = await marketplace.createAuction(
        nft.tokenId,
        ethers.parseEther(auctionStartPrice),
        durationSeconds
      );

      toast({
        title: "Auction submitted",
        description: "Waiting for confirmation...",
      });

      await tx.wait();

      toast({
        title: "Auction created! 🎉",
        description: `${nft.name} is now up for auction`,
      });

      setShowAuctionDialog(false);
      setAuctionStartPrice("");
      setAuctionDuration("24");
      onRefetch?.();
    } catch (error: any) {
      console.error("Auction creation failed:", error);
      toast({
        title: "Auction creation failed",
        description: error.reason || error.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelListing = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!requireWallet()) return;

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

      onRefetch?.();
    } catch (error: any) {
      console.error("Cancel listing failed:", error);
      toast({
        title: "Cancellation failed",
        description: error.reason || error.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelAuction = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!requireWallet()) return;

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

      onRefetch?.();
    } catch (error: any) {
      console.error("Cancel auction failed:", error);
      toast({
        title: "Cancellation failed",
        description: error.reason || error.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdatePrice = async () => {
    if (!requireWallet() || !walletSigner) return;
    const priceValue = parseFloat(newPrice);
    if (isNaN(priceValue) || priceValue <= 0) {
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

      const tx = await marketplace.updateListing(nft.tokenId, ethers.parseEther(newPrice));

      toast({
        title: "Price update submitted",
        description: "Waiting for confirmation...",
      });

      await tx.wait();

      toast({
        title: "Price updated! 🎉",
        description: `New price: ${newPrice} ETH`,
      });

      setShowUpdatePriceDialog(false);
      setNewPrice("");
      onRefetch?.();
    } catch (error: any) {
      console.error("Price update failed:", error);
      toast({
        title: "Price update failed",
        description: error.reason || error.message || "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const openListDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowListDialog(true);
  };

  const openAuctionDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowAuctionDialog(true);
  };

  const openUpdatePriceDialog = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setNewPrice(nft.price);
    setShowUpdatePriceDialog(true);
  };

  return (
    <>
      <Link to={`/nft/${nft.tokenId}`}>
        <Card className="group overflow-hidden bg-gradient-card border-border hover:border-primary/50 transition-all duration-300 hover:shadow-glow-primary hover:-translate-y-1">
          <div className="relative aspect-square overflow-hidden bg-muted flex items-center justify-center">
            {/* Top left badge: Rarity only */}
            {rarity && (
              <div className="absolute top-2 left-2 z-10">
                <span className={`text-xs font-semibold px-2 py-1 rounded-md border ${rarityStyle(rarity)}`}>
                  {rarity}
                </span>
              </div>
            )}

            {/* Image */}
            {nft.image ? (
              <img
                src={nft.image}
                alt={nft.name}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                loading="lazy"
              />
            ) : (
              <div className="text-4xl">❓</div>
            )}

            {/* Favorite button */}
            <div className="absolute top-2 right-2 flex items-center gap-0 z-10">
              <Button
                size="icon"
                variant="ghost"
                className="bg-white/90 backdrop-blur-sm hover:bg-white border border-border/20 shadow-md rounded-r-none"
                onClick={handleFavorite}
              >
                <Heart className={`w-4 h-4 ${isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-900'}`} />
              </Button>
              <button
                className="h-9 min-w-[36px] px-2 flex items-center justify-center text-sm font-semibold bg-white/90 backdrop-blur-sm border border-l-0 border-border/20 shadow-md rounded-r-md text-gray-700 hover:bg-white transition-colors cursor-pointer"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    const { likers: data } = await nftLikesApi.getLikers(nft.tokenId);
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

            {/* Auction timer */}
            {isAuction && nft.auctionEndTime > 0 && (
              <div className="absolute bottom-2 left-2 px-3 py-1 bg-accent/90 backdrop-blur-sm rounded-full flex items-center gap-2 text-accent-foreground">
                <Clock className="w-3 h-3" />
                <span className="text-xs font-medium">{formatTimeRemaining(nft.auctionEndTime)}</span>
              </div>
            )}

            {/* External link */}
            <a
              href={etherscanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-2 right-2 p-1.5 bg-background/80 backdrop-blur-sm rounded-md border border-border hover:bg-background transition-colors z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </a>
          </div>

          <CardContent className="p-4">
            {/* Name + Market Status */}
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-lg truncate">{nft.name}</h3>
              {nft.marketStatus === "none" && (
                <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                  Not Listed
                </span>
              )}
              {nft.marketStatus === "listed" && (
                <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded bg-green-500/20 text-green-500 border border-green-500/30">
                  Listed
                </span>
              )}
              {nft.marketStatus === "auction" && (
                <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/30">
                  Auction
                </span>
              )}
            </div>

            {/* Types */}
            <div className="flex gap-1.5 mb-2">
              {type && (
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: typeColor(type) }}
                >
                  {type}
                </span>
              )}
              {secondaryType && secondaryType !== "None" && (
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                  style={{ backgroundColor: typeColor(secondaryType) }}
                >
                  {secondaryType}
                </span>
              )}
            </div>

            {/* Generation info */}
            {generation && (
              <p className="text-xs text-muted-foreground mb-3">
                Gen {generation} · Pokédex #{nft.pokemonId}
              </p>
            )}

            {/* Price and action */}
            <div className="flex items-center justify-between">
              {isOwner ? (
                /* Owner sees management options */
                <>
                  {isListed || isAuction ? (
                    <>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {isAuction ? "Current Bid" : "Listed at"}
                        </p>
                        <p className="text-lg font-bold text-foreground">
                          {formatPrice(nft.price)} ETH
                        </p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="outline" disabled={isProcessing}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                          {isListed && (
                            <>
                              <DropdownMenuItem onClick={openUpdatePriceDialog}>
                                <Edit2 className="w-4 h-4 mr-2" />
                                Update Price
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={handleCancelListing}>
                                <X className="w-4 h-4 mr-2" />
                                Cancel Listing
                              </DropdownMenuItem>
                            </>
                          )}
                          {isAuction && (
                            <DropdownMenuItem onClick={handleCancelAuction}>
                              <X className="w-4 h-4 mr-2" />
                              Cancel Auction
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  ) : (
                    /* Not listed - show list/auction options */
                    <div className="flex gap-2 w-full">
                      <Button
                        size="sm"
                        className="flex-1 bg-gradient-primary hover:bg-gradient-hover"
                        onClick={openListDialog}
                        disabled={isProcessing}
                      >
                        <Tag className="w-3 h-3 mr-1" />
                        List
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={openAuctionDialog}
                        disabled={isProcessing}
                      >
                        <Gavel className="w-3 h-3 mr-1" />
                        Auction
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                /* Non-owner sees buy/bid options */
                <>
                  {isListed || isAuction ? (
                    <>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {isAuction ? "Current Bid" : "Price"}
                        </p>
                        <p className="text-lg font-bold text-foreground">
                          {formatPrice(nft.price)} ETH
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="bg-gradient-primary hover:bg-gradient-hover"
                        onClick={handleAction}
                      >
                        {isAuction ? "Place Bid" : "Buy Now"}
                      </Button>
                    </>
                  ) : (
                    <div className="w-full">
                      <p className="text-sm text-muted-foreground text-center">
                        Not available for purchase
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* Buy Confirmation Dialog */}
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
              <span className="font-bold text-lg">{formatPrice(nft.price)} ETH</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBuyDialog(false)}>
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
              Enter your bid amount for this NFT
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">NFT:</span>
              <span className="font-semibold">{nft.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Current Bid:</span>
              <span className="font-semibold">{formatPrice(nft.price)} ETH</span>
            </div>
            {nft.auctionEndTime > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Ends in:</span>
                <span className="font-semibold">{formatTimeRemaining(nft.auctionEndTime)}</span>
              </div>
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
            <Button variant="outline" onClick={() => setShowBidDialog(false)}>
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
              <div className="p-3 bg-muted rounded-lg space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Listing price</span>
                  <span className="font-medium">{listPrice} ETH</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Platform fee (2.5%)</span>
                  <span>-{(parseFloat(listPrice) * 0.025).toFixed(6)} ETH</span>
                </div>
                <div className="border-t border-border pt-1.5 flex justify-between font-semibold">
                  <span>You receive</span>
                  <span className="text-green-600">{(parseFloat(listPrice) * 0.975).toFixed(6)} ETH</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowListDialog(false)}>
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
            <DialogDescription>
              Start an auction for your NFT
            </DialogDescription>
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
                Common durations: 24h, 48h, 72h, 168h (1 week)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAuctionDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateAuction}
              disabled={isProcessing || !auctionStartPrice || !auctionDuration}
              className="bg-gradient-primary hover:bg-gradient-hover"
            >
              {isProcessing ? "Processing..." : "Create Auction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Price Dialog */}
      <Dialog open={showUpdatePriceDialog} onOpenChange={setShowUpdatePriceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Price</DialogTitle>
            <DialogDescription>
              Change the listing price for your NFT
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">NFT:</span>
              <span className="font-semibold">{nft.name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Current Price:</span>
              <span className="font-semibold">{formatPrice(nft.price)} ETH</span>
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
            <Button variant="outline" onClick={() => setShowUpdatePriceDialog(false)}>
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

export default ArtCard;
