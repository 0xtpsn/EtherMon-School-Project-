import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Heart, Share2, MoreVertical, Edit, DollarSign, Eye, EyeOff } from "lucide-react";
import { meApi } from "@/api/me";
import { useToast } from "@/hooks/use-toast";
import AuthDialog from "@/components/auth/AuthDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BidHistoryTab } from "@/components/art/BidHistoryTab";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { artworksApi } from "@/api/artworks";
import { ArtworkDetail as ArtworkDetailType } from "@/api/types";
import { useSession } from "@/context/SessionContext";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCurrency } from "@/lib/utils";

type ArtworkDetail = ArtworkDetailType;

const ArtDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useSession();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [artwork, setArtwork] = useState<ArtworkDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isWatching, setIsWatching] = useState(false);
  const [editPriceDialogOpen, setEditPriceDialogOpen] = useState(false);
  const [newPrice, setNewPrice] = useState("");
  const [editDetailsDialogOpen, setEditDetailsDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [listForSaleDialogOpen, setListForSaleDialogOpen] = useState(false);
  const [listingType, setListingType] = useState<"fixed" | "auction">("fixed");
  const [salePrice, setSalePrice] = useState("");
  const [fixedPriceExpiry, setFixedPriceExpiry] = useState(""); // Duration in hours for fixed price
  const [startingBid, setStartingBid] = useState("");
  const [reservePrice, setReservePrice] = useState(""); // Reserve price for auctions
  const [auctionDuration, setAuctionDuration] = useState("24");
  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [bidAmount, setBidAmount] = useState("");
  const [bidExpiry, setBidExpiry] = useState("24");
  const [purchaseConfirmOpen, setPurchaseConfirmOpen] = useState(false);
  const [auctionExplainerOpen, setAuctionExplainerOpen] = useState(false);
  const [delistConfirmOpen, setDelistConfirmOpen] = useState(false);
  const [userBalance, setUserBalance] = useState<number>(0);
  const [activityPage, setActivityPage] = useState(1);
  const ITEMS_PER_PAGE = 10;
  const [userActiveBid, setUserActiveBid] = useState<{ id: number; amount: number; expires_at?: string | null } | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentUsername, setCurrentUsername] = useState<string>("");

  // Calculate available bid expiry options based on auction end time
  const getAvailableExpiryOptions = () => {
    if (!artwork?.auction?.end_time) return [];
    
    const auctionEndTime = new Date(artwork.auction.end_time).getTime();
    const now = Date.now();
    const remainingHours = Math.max(0, (auctionEndTime - now) / (1000 * 60 * 60));
    const remainingMinutes = remainingHours * 60;
    
    // Define all possible options (in hours for consistency)
    const allOptions = [
      { label: "30 minutes", value: "0.5", hours: 0.5 },
      { label: "1 hour", value: "1", hours: 1 },
      { label: "2 hours", value: "2", hours: 2 },
      { label: "4 hours", value: "4", hours: 4 },
      { label: "6 hours", value: "6", hours: 6 },
      { label: "12 hours", value: "12", hours: 12 },
      { label: "24 hours", value: "24", hours: 24 },
      { label: "2 days", value: "48", hours: 48 },
      { label: "3 days", value: "72", hours: 72 },
    ];
    
    // Filter options that don't exceed auction end time
    const validOptions = allOptions.filter(option => {
      return option.hours <= remainingHours;
    });
    
    // Always add "Until auction ends" option at the end
    const hoursUntilEnd = Math.floor(remainingHours);
    const minutesUntilEnd = Math.floor((remainingHours - hoursUntilEnd) * 60);
    let untilEndLabel = "";
    if (hoursUntilEnd > 0 && minutesUntilEnd > 0) {
      untilEndLabel = `${hoursUntilEnd}h ${minutesUntilEnd}m (until auction ends)`;
    } else if (hoursUntilEnd > 0) {
      untilEndLabel = `${hoursUntilEnd}h (until auction ends)`;
    } else if (minutesUntilEnd > 0) {
      untilEndLabel = `${minutesUntilEnd}m (until auction ends)`;
    } else {
      untilEndLabel = "Until auction ends";
    }
    
    // Add "until auction ends" option if there's time remaining
    // Use a special marker value that's clearly identifiable
    if (remainingHours > 0) {
      // Use a very large number as a unique identifier for "until end"
      // This ensures it won't conflict with any regular hour values
      validOptions.push({
        label: untilEndLabel,
        value: "999999", // Special marker value for "until auction ends"
        hours: remainingHours
      });
    }
    
    return validOptions;
  };
  
  // Calculate expiry hours from existing bid's expires_at
  const calculateExpiryFromExistingBid = (expiresAt: string | null | undefined): string | null => {
    if (!expiresAt) return null;
    const expiryDate = new Date(expiresAt);
    const now = new Date();
    const diffHours = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (diffHours <= 0) return null;
    return diffHours.toString();
  };
  
  // Get available expiry options, including current expiry if it exists
  const getAvailableExpiryOptionsWithCurrent = () => {
    const baseOptions = getAvailableExpiryOptions();
    
    // If user has existing bid with expiry, add it to options if not already present
    if (userActiveBid?.expires_at) {
      const currentExpiry = calculateExpiryFromExistingBid(userActiveBid.expires_at);
      if (currentExpiry) {
        const expiryHours = parseFloat(currentExpiry);
        const hours = Math.floor(expiryHours);
        const minutes = Math.floor((expiryHours - hours) * 60);
        
        let currentLabel = "";
        if (hours > 0 && minutes > 0) {
          currentLabel = `${hours}h ${minutes}m (current)`;
        } else if (hours > 0) {
          currentLabel = `${hours}h (current)`;
        } else if (minutes > 0) {
          currentLabel = `${minutes}m (current)`;
        } else {
          currentLabel = `${Math.round(expiryHours * 60)}m (current)`;
        }
        
        // Check if current expiry is already in options (compare with hours property if available)
        const exists = baseOptions.some(opt => {
          const optHours = opt.hours !== undefined ? opt.hours : parseFloat(opt.value);
          return Math.abs(optHours - expiryHours) < 0.1;
        });
        
        if (!exists && expiryHours > 0) {
          // Add current expiry as first option
          return [
            { label: currentLabel, value: currentExpiry, hours: expiryHours },
            ...baseOptions
          ];
        }
      }
    }
    
    return baseOptions;
  };
  
  const availableExpiryOptions = getAvailableExpiryOptionsWithCurrent();

  // Update timer every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Define fetchArtwork using useCallback so it can be used throughout the component
  const fetchArtwork = useCallback(async () => {
    if (!id) return;
    
    try {
      const data = await artworksApi.detail(id);
      
      setArtwork(data.artwork);
      setIsFavorited(Boolean(data.user_state?.favorited));
      setIsWatching(Boolean(data.user_state?.watching));
      if (data.user_state?.active_bid) {
        setUserActiveBid(data.user_state.active_bid);
      } else {
        setUserActiveBid(null);
      }
      setUserBalance(data.user_state?.available_balance ?? 0);
      setCurrentUsername(data.user_state?.username || user?.username || "");
    } catch (error: any) {
      const errorMessage = error.status === 0 
        ? "Unable to connect to server. Please check your connection."
        : error.message || "Failed to load artwork details";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [id, toast, user?.username]);

  useEffect(() => {
    if (!id) return;
    
    setLoading(true);
    fetchArtwork();
  }, [id, fetchArtwork]);

  const handlePurchase = async () => {
    if (!user) {
      setAuthDialogOpen(true);
      toast({
        title: "Sign in required",
        description: "Please sign in to purchase this artwork",
      });
      return;
    }

    if (!artwork) return;

    // Check if user is trying to buy their own artwork
    if (artwork.owner.id === user.id) {
      toast({
        title: "Cannot purchase",
        description: "You already own this artwork",
        variant: "destructive",
      });
      return;
    }

    // If it's an auction, open the bid dialog instead of auto-bidding
    if (auctionIsActive) {
      // If user has an active bid, pre-fill with their current bid amount and expiry
      if (userActiveBid) {
        setBidAmount(userActiveBid.amount.toString());
        // Calculate expiry from existing bid's expires_at
        const existingExpiry = calculateExpiryFromExistingBid(userActiveBid.expires_at);
        if (existingExpiry) {
          // Find closest matching option
          const matchingOption = availableExpiryOptions.find(opt => {
            if (opt.value === "999999") {
              // For "until end" option, check if existing expiry is close to auction end
              if (artwork.auction?.end_time) {
                const auctionEnd = new Date(artwork.auction.end_time);
                const existingExpiryDate = new Date(userActiveBid.expires_at!);
                const diff = Math.abs(auctionEnd.getTime() - existingExpiryDate.getTime());
                return diff < 60000; // Within 1 minute
              }
              return false;
            }
            const optValue = parseFloat(opt.value);
            return Math.abs(optValue - parseFloat(existingExpiry)) < 0.5;
          });
          setBidExpiry(matchingOption ? matchingOption.value : existingExpiry);
        } else {
          // Default to "until auction ends" if available, otherwise "24"
          const untilEndOption = availableExpiryOptions.find(opt => opt.value === "999999");
          setBidExpiry(untilEndOption ? untilEndOption.value : "24");
        }
      } else if (artwork.auction) {
        const minBid = (artwork.auction.current_bid ?? artwork.auction.start_price ?? 0) + 1; // Minimum increment
        setBidAmount(minBid.toString());
        // Default to "until auction ends" if available, otherwise "24"
        const untilEndOption = availableExpiryOptions.find(opt => opt.value === "999999");
        setBidExpiry(untilEndOption ? untilEndOption.value : "24");
      }
      setBidDialogOpen(true);
      return;
    }

    // Show purchase confirmation dialog
    setPurchaseConfirmOpen(true);
  };

  const confirmPurchase = async () => {
    if (!artwork || !user) return;

    // Handle direct purchase
    try {
      await artworksApi.purchase(artwork.id);

      setPurchaseConfirmOpen(false);
      toast({
        title: "Purchase successful! 🎉",
        description: `You are now the owner of ${artwork.title}`,
      });

      // Refresh the page to show new ownership
      fetchArtwork();
    } catch (error: any) {
      setPurchaseConfirmOpen(false);
      const errorMessage = error.status === 0
        ? "Unable to connect to server. Please check your connection."
        : error.message || "Failed to process your request. Please try again.";
      toast({
        title: "Transaction failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handlePlaceBid = async () => {
    if (!user || !artwork || !artwork.auction) return;

    // Check if auction has ended
    if (artwork.auction.end_time && new Date(artwork.auction.end_time).getTime() <= Date.now()) {
      toast({
        title: "Auction ended",
        description: "This auction has ended. Bidding is no longer available.",
        variant: "destructive",
      });
      return;
    }

    const bidIncrement = parseFloat(bidAmount || "0");
    
    // If user has an existing bid, calculate the total new bid amount
    let totalBidValue: number;
    if (userActiveBid) {
      // User is adding to existing bid
      if (isNaN(bidIncrement) || bidIncrement <= 0) {
        toast({
          title: "Invalid bid amount",
          description: "Please enter a positive amount to add to your bid",
          variant: "destructive",
        });
        return;
      }
      totalBidValue = userActiveBid.amount + bidIncrement;
    } else {
      // New bid - the amount entered is the total bid
      if (isNaN(bidIncrement) || bidIncrement <= 0) {
        toast({
          title: "Invalid bid amount",
          description: "Please enter a positive bid amount",
          variant: "destructive",
        });
        return;
      }
      totalBidValue = bidIncrement;
    }
    
    const minBid = (artwork.auction.current_bid ?? artwork.auction.start_price ?? 0) + 1;

    // Frontend validation: bid must be >= minBid (consistent with backend which uses >)
    // Backend will reject if bid <= current_bid, so we require >= minBid here
    if (isNaN(totalBidValue) || totalBidValue < minBid) {
      toast({
        title: "Invalid bid amount",
        description: `Minimum bid is $${formatCurrency(minBid)}. Your total bid would be $${formatCurrency(totalBidValue)}`,
        variant: "destructive",
      });
      return;
    }

    // Check balance - for existing bids, only check the additional amount needed
    const amountNeeded = userActiveBid ? bidIncrement : totalBidValue;
    if (amountNeeded > userBalance) {
      toast({
        title: "Insufficient balance",
        description: `You need $${formatCurrency(amountNeeded)} but only have $${formatCurrency(userBalance)}`,
        variant: "destructive",
      });
      return;
    }

    try {
      // Calculate expiry date if specified
      // If user has existing bid and didn't change expiry, preserve the existing expiry
      let expiryDate: string | undefined = undefined;
      
      if (bidExpiry) {
        // Handle special marker value "999999" for "until auction ends" option
        let expiryHours: number;
        if (bidExpiry === "999999") {
          // Use the actual remaining hours until auction ends
          if (artwork.auction?.end_time) {
            const auctionEnd = new Date(artwork.auction.end_time);
            const now = new Date();
            expiryHours = (auctionEnd.getTime() - now.getTime()) / (1000 * 60 * 60);
          } else {
            expiryHours = 24; // Fallback
          }
        } else {
          expiryHours = parseFloat(bidExpiry);
        }
        
        if (!isNaN(expiryHours) && expiryHours > 0) {
          const exp = new Date();
          exp.setTime(exp.getTime() + (expiryHours * 60 * 60 * 1000)); // Add hours in milliseconds
          
          // Ensure expiry doesn't exceed auction end time
          if (artwork.auction?.end_time) {
            const auctionEnd = new Date(artwork.auction.end_time);
            if (exp > auctionEnd) {
              expiryDate = auctionEnd.toISOString();
            } else {
              expiryDate = exp.toISOString();
            }
          } else {
            expiryDate = exp.toISOString();
          }
        }
      } else if (userActiveBid?.expires_at) {
        // If no expiry specified but user has existing bid, preserve existing expiry
        expiryDate = userActiveBid.expires_at;
      }

      // Place bid using Flask API - send the total bid amount
      const result = await artworksApi.placeBid(artwork.id, totalBidValue, expiryDate);

      toast({
        title: userActiveBid ? "Bid updated successfully! 🎉" : "Bid placed successfully! 🎉",
        description: userActiveBid 
          ? `Added $${formatCurrency(bidIncrement)} to your bid. New total: $${formatCurrency(totalBidValue)}`
          : `Your bid of $${formatCurrency(totalBidValue)} has been placed`,
      });

      setBidDialogOpen(false);
      
      // Refresh artwork data
      await fetchArtwork();
    } catch (error: any) {
      const errorMessage = error.status === 0
        ? "Unable to connect to server. Please check your connection."
        : error.message || "Failed to place your bid. Please try again.";
      toast({
        title: "Bid failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleFavorite = async () => {
    if (!user) {
      setAuthDialogOpen(true);
      toast({
        title: "Sign in required",
        description: "Please sign in to like artworks",
      });
      return;
    }

    // Optimistic update - update UI immediately
    const previousState = isFavorited;
    const previousFavorites = artwork?.favorites || 0;
    setIsFavorited(!isFavorited);
    if (artwork) {
      setArtwork({
        ...artwork,
        favorites: !isFavorited ? previousFavorites + 1 : previousFavorites - 1,
      });
    }

    try {
      const response = await artworksApi.toggleFavorite(
        artwork?.id || id!,
        !previousState
      );
      setIsFavorited(response.favorited);
      if (artwork) {
        setArtwork({
          ...artwork,
          favorites: response.favorites,
        });
      }
      toast({ title: response.favorited ? "Liked" : "Unliked" });
    } catch (error: any) {
      // Rollback on error
      setIsFavorited(previousState);
      if (artwork) {
        setArtwork({
          ...artwork,
          favorites: previousFavorites,
        });
      }
      toast({
        title: "Error",
        description: error.message || "Failed to update likes. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleWatch = async () => {
    if (!user) {
      setAuthDialogOpen(true);
      toast({
        title: "Sign in required",
        description: "Please sign in to watch artworks",
      });
      return;
    }

    // Optimistic update
    const previousState = isWatching;
    setIsWatching(!isWatching);

    try {
      const response = await artworksApi.toggleWatch(
        artwork?.id || id!,
        !previousState
      );
      setIsWatching(response.watching);
      toast({ title: response.watching ? "Added to watchlist" : "Removed from watchlist" });
    } catch (error: any) {
      // Rollback on error
      setIsWatching(previousState);
      toast({
        title: "Error",
        description: error.message || "Failed to update watchlist. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleEditPrice = () => {
    if (!artwork) return;
    setNewPrice(artwork.price.toString());
    setEditPriceDialogOpen(true);
  };

  const handleSavePrice = async () => {
    if (!artwork || !newPrice) return;

    const priceValue = parseFloat(newPrice);
    if (isNaN(priceValue) || priceValue <= 0) {
      toast({
        title: "Invalid price",
        description: "Please enter a valid price greater than 0",
        variant: "destructive",
      });
      return;
    }

    try {
      await artworksApi.update(artwork.id, { price: priceValue });
      setArtwork({ ...artwork, price: priceValue });
      setEditPriceDialogOpen(false);
      toast({
        title: "Price updated",
        description: `Price updated to $${formatCurrency(priceValue)}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update price",
        variant: "destructive",
      });
    }
  };

  const handleEditDetails = () => {
    if (!artwork) return;
    setNewTitle(artwork.title);
    setNewDescription(artwork.description || "");
    setEditDetailsDialogOpen(true);
  };

  const handleSaveDetails = async () => {
    if (!artwork || !newTitle.trim()) {
      toast({
        title: "Invalid input",
        description: "Title cannot be empty",
        variant: "destructive",
      });
      return;
    }

    try {
      await artworksApi.update(artwork.id, {
        title: newTitle.trim(),
        description: newDescription.trim()
      });
      setArtwork({ 
        ...artwork, 
        title: newTitle.trim(),
        description: newDescription.trim()
      });
      setEditDetailsDialogOpen(false);
      toast({
        title: "Details updated",
        description: "Artwork details have been updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update details",
        variant: "destructive",
      });
    }
  };

  const handleListForSale = () => {
    setListForSaleDialogOpen(true);
  };

  const handleDelistClick = () => {
    setDelistConfirmOpen(true);
  };

  const confirmDelist = async () => {
    if (!user || !isOwner || !artwork) {
      toast({
        title: "Unauthorized",
        description: "Only the owner can delist this artwork",
        variant: "destructive",
      });
      return;
    }

    try {
      await artworksApi.delist(artwork.id);
      toast({
        title: "Delisted successfully",
        description: auctionIsActive
          ? "Your auction has been cancelled and all bids refunded"
          : "Your artwork has been removed from sale",
      });
      setDelistConfirmOpen(false);
      await fetchArtwork();
    } catch (error: any) {
      // Error already handled by toast
      setDelistConfirmOpen(false);
      toast({
        title: "Error",
        description: error.message || "Failed to delist artwork",
        variant: "destructive",
      });
    }
  };

  const handleSaveListForSale = async () => {
    if (!artwork) return;

    if (listingType === "fixed") {
      if (!salePrice || parseFloat(salePrice) <= 0) {
        toast({
          title: "Invalid price",
          description: "Please enter a valid price greater than 0",
          variant: "destructive",
        });
        return;
      }
      if (parseFloat(salePrice) > 1000000) {
        toast({
          title: "Price too high",
          description: "Price cannot exceed $1,000,000",
          variant: "destructive",
        });
        return;
      }
      if (!fixedPriceExpiry) {
        toast({
          title: "Expiry required",
          description: "Please select a listing expiry duration or choose 'Never expires'",
          variant: "destructive",
        });
        return;
      }
    }

    if (listingType === "auction") {
      if (!startingBid || parseFloat(startingBid) <= 0) {
        toast({
          title: "Invalid starting bid",
          description: "Please enter a valid starting bid greater than 0",
          variant: "destructive",
        });
        return;
      }
      if (reservePrice && parseFloat(reservePrice) > 0) {
        if (parseFloat(reservePrice) < parseFloat(startingBid)) {
          toast({
            title: "Invalid reserve price",
            description: "Reserve price must be greater than or equal to starting bid",
            variant: "destructive",
          });
          return;
        }
      }
    }

    try {
      const payload: any = {
        type: listingType,
      };

      if (listingType === "fixed") {
        payload.price = parseFloat(salePrice);
        // Only add duration if not "never"
        if (fixedPriceExpiry !== "never") {
          payload.duration_hours = parseInt(fixedPriceExpiry);
        }
      } else {
        payload.start_price = parseFloat(startingBid);
        payload.duration_hours = parseInt(auctionDuration);
        // Add reserve price if provided
        if (reservePrice && parseFloat(reservePrice) > 0) {
          payload.reserve_price = parseFloat(reservePrice);
        }
      }

      await artworksApi.listForSale(artwork.id, payload);

      toast({
        title: "Artwork listed!",
        description: `Your artwork is now listed as ${listingType === "auction" ? "a timed auction" : "a fixed price listing"}`,
      });

      setListForSaleDialogOpen(false);
      setSalePrice("");
      setFixedPriceExpiry("");
      setStartingBid("");
      setReservePrice("");
      setAuctionDuration("24");
      await fetchArtwork();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to list artwork",
        variant: "destructive",
      });
    }
  };

  const isArtist = user && artwork && artwork.artist.id === user.id;
  const isSold = artwork && artwork.artist.id !== artwork.owner.id;
  const canEditDetails = isArtist && !isSold;
  const isOwner = user && artwork && artwork.owner.id === user.id;
  const auctionIsActive = Boolean(artwork?.auction && artwork.auction.status === "open");
  const isDisplayOnly = artwork && !Boolean(artwork.is_listed);

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </>
    );
  }

  if (!artwork) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-muted-foreground">Artwork not found</p>
        </div>
      </>
    );
  }

  const endTimeStr = artwork.auction 
    ? (() => {
        // Check if auction is closed
        if (artwork.auction.status === "closed") {
          return "Auction Ended";
        }
        const endTime = new Date(artwork.auction.end_time);
        const timeDiff = endTime.getTime() - currentTime.getTime();
        // If time has passed but status is still open, show "Ending..."
        if (timeDiff <= 0) {
          return "Ending...";
        }
        const hours = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
        return `${hours}h ${minutes}m ${seconds}s`;
      })()
    : null;

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* Back Button */}
          <Button
            variant="ghost"
            className="mb-6 gap-2"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Discover
          </Button>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Left: Image */}
            <div className="space-y-4">
              <Card className="overflow-hidden border-border bg-card">
                <div className="aspect-square relative">
                  <img
                    src={artwork.image_url}
                    alt={artwork.title}
                    className="w-full h-full object-cover"
                  />
                  {/* Favorite button overlay */}
                  {user ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm hover:bg-white border border-border/20 shadow-md"
                      onClick={handleFavorite}
                      title={isFavorited ? "Unlike" : "Like"}
                    >
                      <Heart className={`w-4 h-4 ${isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-900'}`} />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm hover:bg-white border border-border/20 shadow-md"
                      onClick={() => setAuthDialogOpen(true)}
                      title="Sign in to like"
                    >
                      <Heart className="w-4 h-4 text-gray-900" />
                    </Button>
                  )}
                </div>
              </Card>
            </div>

            {/* Right: Details */}
            <div className="space-y-6">
              {/* Collection & Title */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <img
                    src={artwork.artist.avatar_url}
                    alt={artwork.artist.display_name || artwork.artist.username}
                    className="w-6 h-6 rounded-full"
                  />
                  <span className="text-sm text-primary font-medium">
                    {artwork.artist.display_name || artwork.artist.username}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex flex-col">
                  <h1 className="text-4xl font-bold">{artwork.title}</h1>
                    <p className="text-xs text-muted-foreground mt-1">#{artwork.id}</p>
                  </div>
                  {canEditDetails && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={handleEditDetails}
                      className="gap-1"
                    >
                      <Edit className="w-4 h-4" />
                      Edit Details
                    </Button>
                  )}
                </div>
                <p className="text-muted-foreground">
                  Owned by{" "}
                  <span 
                    className="text-primary cursor-pointer hover:underline"
                    onClick={() => navigate(`/profile/${artwork.owner.username || artwork.owner.id}`)}
                  >
                    {artwork.owner.display_name || artwork.owner.username}
                  </span>
                </p>
              </div>

              {/* Stats */}
              <div className="flex gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Views: </span>
                  <span className="font-medium">{artwork.views}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Likes: </span>
                  <span className="font-medium">{artwork.favorites}</span>
                </div>
              </div>

              {/* Price Card */}
              <Card className="border-border bg-card">
                <CardContent className="p-6">
                  {isDisplayOnly ? (
                    <>
                      <div className="mb-4 text-center py-4">
                        <p className="text-sm text-muted-foreground mb-2">
                          This artwork is not listed for sale
                        </p>
                        {isOwner && (
                          <p className="text-xs text-muted-foreground">
                            You can list it for sale at any time
                          </p>
                        )}
                      </div>
                      {isOwner ? (
                        <Button
                          className="w-full bg-gradient-primary hover:bg-gradient-hover gap-2"
                          onClick={handleListForSale}
                        >
                          <DollarSign className="w-4 h-4" />
                          List
                        </Button>
                      ) : user ? (
                        <>
                          {/* Show watchlist button for unlisted items - users might want to track them */}
                          <Button
                            variant="outline"
                            className="w-full mt-2 gap-2"
                            onClick={handleWatch}
                            title={isWatching ? "Remove from watchlist" : "Add to watchlist to get notified if it becomes available"}
                          >
                            <Eye className={`w-4 h-4 ${isWatching ? 'text-primary' : ''}`} />
                            {isWatching ? "Remove from Watchlist" : "Add to Watchlist"}
                          </Button>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {artwork.auction && (
                        <div className="mb-4 space-y-2">
                          <div className="flex justify-between items-center">
                            <p className="text-sm text-muted-foreground">
                              {artwork.auction.status === "closed" ? "Auction Status" : "Auction ends in"}
                            </p>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => setAuctionExplainerOpen(true)}
                                    className="text-xs text-primary hover:text-primary/80"
                                  >
                                    How auctions work
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="bg-gray-900 text-white border-gray-700 dark:bg-gray-100 dark:text-gray-900">
                                  <p className="font-medium">Click to learn more about how auctions work on ArtMart</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <p className="text-lg font-bold text-primary">
                            {endTimeStr}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Ends: {new Date(artwork.auction.end_time).toLocaleString()}
                          </p>
                        </div>
                      )}
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm text-muted-foreground">
                            {artwork.auction ? (artwork.auction.current_bid ? "Current Bid" : "Starting Bid") : "Price"}
                          </p>
                          {user && artwork.owner.id === user.id && !artwork.auction && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={handleEditPrice}
                              className="gap-1"
                            >
                              <Edit className="w-3 h-3" />
                              Edit
                            </Button>
                          )}
                        </div>
                        <p className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                          ${formatCurrency(artwork.auction ? (artwork.auction.current_bid ?? artwork.auction.start_price ?? 0) : (artwork.price || 0))}
                        </p>
                        {artwork.auction?.highest_bidder && (
                          <p className="text-sm text-muted-foreground mt-1">
                            Bidded by {artwork.auction.highest_bidder.display_name || artwork.auction.highest_bidder.username}
                          </p>
                       )}
                      </div>
                       <div className="flex gap-3">
                         {artwork.owner.id === user?.id ? (
                           <Button
                             variant="destructive"
                             className="flex-1"
                             onClick={handleDelistClick}
                           >
                             {artwork.auction ? "Cancel Auction" : "Delist"}
                           </Button>
                         ) : (
                           <Button
                             className="flex-1 bg-gradient-primary hover:bg-gradient-hover"
                             onClick={handlePurchase}
                           >
                             {artwork.auction ? (userActiveBid ? "Update Bid" : "Place Bid") : "Buy Now"}
                           </Button>
                         )}
                         {user && (
                           <>
                             <Button 
                               variant="outline" 
                               size="icon"
                               onClick={handleFavorite}
                               title={isFavorited ? "Unlike" : "Like"}
                             >
                               <Heart className={`w-4 h-4 ${isFavorited ? 'fill-red-500 text-red-500' : ''}`} />
                             </Button>
                             <Button 
                               variant="outline" 
                               size="icon"
                               onClick={handleWatch}
                               title={isWatching ? "Remove from watchlist" : "Add to watchlist"}
                             >
                               {isWatching ? (
                                 <Eye className="w-4 h-4 text-primary" />
                               ) : (
                                 <Eye className="w-4 h-4" />
                               )}
                             </Button>
                           </>
                         )}
                         {!user && (
                           <>
                             <Button 
                               variant="outline" 
                               size="icon"
                               onClick={() => setAuthDialogOpen(true)}
                               title="Sign in to like"
                             >
                               <Heart className="w-4 h-4" />
                             </Button>
                           </>
                          )}
                           <Button 
                             variant="outline" 
                             size="icon"
                             onClick={() => {
                               navigator.clipboard.writeText(window.location.href);
                               toast({
                                 title: "Link copied!",
                                 description: "Artwork link copied to clipboard",
                               });
                             }}
                             title="Share artwork"
                           >
                             <Share2 className="w-4 h-4" />
                           </Button>
                       </div>
                    </>
                  )}
                </CardContent>
              </Card>

              {/* Tabs */}
              <Tabs defaultValue="details" className="w-full mt-6">
                <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none h-auto p-0">
                  <TabsTrigger 
                    value="details"
                    className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-3"
                  >
                    Details
                  </TabsTrigger>
                  <TabsTrigger 
                    value="activity"
                    className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-3"
                  >
                    Activity
                  </TabsTrigger>
                  <TabsTrigger 
                    value="price"
                    className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-3"
                  >
                    Price History
                  </TabsTrigger>
                  {artwork.auction && (
                    <TabsTrigger 
                      value="bids"
                      className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none px-4 py-3"
                    >
                      Bids
                    </TabsTrigger>
                  )}
                </TabsList>
                <TabsContent value="details" className="space-y-4 mt-4">
                  <Card className="border-border bg-card">
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-3">Description</h3>
                      <p className="text-muted-foreground">
                        {artwork.description}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border-border bg-card">
                    <CardContent className="p-6">
                      <h3 className="font-semibold mb-3">Details</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Category</span>
                          <Badge variant="secondary">{artwork.category}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Created</span>
                          <span>{new Date(artwork.created_at).toLocaleDateString()}</span>
                        </div>
                        {!artwork.auction && artwork.listing_expires_at && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Listing Expires</span>
                            <span>{new Date(artwork.listing_expires_at).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="activity" className="mt-4">
                  <>
                    <Card className="border-border bg-card">
                      <CardContent className="p-6">
                        <h3 className="font-semibold mb-4">Activity & Bid History</h3>
                        {artwork.activity && artwork.activity.length > 0 ? (
                          <div className="space-y-3">
                            {artwork.activity
                              .filter(a => !['offer', 'offer_accepted', 'offer_declined', 'offer_cancelled'].includes(a.activity_type))
                              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                              .slice((activityPage - 1) * ITEMS_PER_PAGE, activityPage * ITEMS_PER_PAGE)
                              .map((activity) => (
                              <div key={activity.id} className="border-b border-border pb-3 last:border-0">
                                <div className="flex justify-between items-start">
                                  <div className="flex-1">
                                    <p className="font-medium">
                                      {/* Listing */}
                                      {activity.activity_type === 'listed' && (
                                        <>
                                          Created by{' '}
                                          <Link to={`/profile/${artwork.artist.username}`} className="font-semibold hover:text-primary hover:underline">
                                            {artwork.artist.display_name || artwork.artist.username}
                                          </Link>
                                        </>
                                      )}
                                      
                                      {/* Sale - consolidated for auction_won, sold, sale, purchased */}
                                      {/* from_user = seller, to_user = buyer */}
                                      {(activity.activity_type === 'sold' || activity.activity_type === 'sale' || activity.activity_type === 'auction_won') && (
                                        <>
                                          <span className="text-green-500">Sold</span> to{' '}
                                          <Link to={`/profile/${activity.to_user?.username}`} className="font-semibold hover:text-primary hover:underline">
                                            {activity.to_user?.username || 'Unknown'}
                                          </Link>
                                          {' '}from{' '}
                                          <Link to={`/profile/${activity.from_user?.username}`} className="font-semibold hover:text-primary hover:underline">
                                            {activity.from_user?.username || 'Unknown'}
                                          </Link>
                                        </>
                                      )}
                                      
                                      {/* Bids */}
                                      {activity.activity_type === 'bid' && (
                                        <>
                                          <Link to={`/profile/${activity.from_user?.username}`} className="font-semibold hover:text-primary hover:underline">
                                            {activity.from_user?.username || 'Unknown'}
                                          </Link>
                                          {' '}placed a <span className="text-primary">bid</span>
                                        </>
                                      )}
                                      {activity.activity_type === 'bid_cancelled' && (
                                        <>
                                          <Link to={`/profile/${activity.from_user?.username}`} className="font-semibold hover:text-primary hover:underline">
                                            {activity.from_user?.username || 'Unknown'}
                                          </Link>
                                          {' '}<span className="text-orange-500">cancelled bid</span>
                                        </>
                                      )}
                                    </p>
                                    <p className="text-sm text-muted-foreground mt-1">
                                      {new Date(activity.created_at).toLocaleString()}
                                    </p>
                                  </div>
                                  {activity.price && (
                                    <span className={`text-lg font-bold ${activity.activity_type === 'bid' ? 'text-primary' : ''}`}>
                                      ${formatCurrency(activity.price)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-muted-foreground text-center py-8">
                            No activity yet
                          </p>
                        )}
                      </CardContent>
                    </Card>
                    {artwork.activity && artwork.activity.filter(a => !['offer', 'offer_accepted', 'offer_declined', 'offer_cancelled'].includes(a.activity_type)).length > ITEMS_PER_PAGE && (
                      <Pagination className="mt-4">
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious 
                              onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                              className={activityPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                          {Array.from({ length: Math.ceil(artwork.activity.filter(a => !['offer', 'offer_accepted', 'offer_declined', 'offer_cancelled'].includes(a.activity_type)).length / ITEMS_PER_PAGE) }, (_, i) => i + 1).map((page) => (
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
                              onClick={() => setActivityPage(p => Math.min(Math.ceil(artwork.activity.filter(a => !['offer', 'offer_accepted', 'offer_declined', 'offer_cancelled'].includes(a.activity_type)).length / ITEMS_PER_PAGE), p + 1))}
                              className={activityPage === Math.ceil(artwork.activity.filter(a => !['offer', 'offer_accepted', 'offer_declined', 'offer_cancelled'].includes(a.activity_type)).length / ITEMS_PER_PAGE) ? "pointer-events-none opacity-50" : "cursor-pointer"}
                            />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    )}
                  </>
                </TabsContent>
                <TabsContent value="price" className="mt-4">
                  <Card className="border-border bg-card">
                    <CardContent className="p-6">
                      {artwork.activity && artwork.activity.length > 0 ? (
                        <div className="space-y-3">
                          {artwork.activity
                            .filter(a => ['listed', 'sold', 'sale'].includes(a.activity_type) && !['offer', 'offer_accepted', 'offer_declined', 'offer_cancelled'].includes(a.activity_type))
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map((activity) => (
                              <div key={activity.id} className="flex justify-between items-center border-b border-border pb-3 last:border-0">
                                <div>
                                  <p className="font-medium">
                                    {activity.activity_type === 'listed' && (
                                      <>
                                        Listed by{' '}
                                        <Link to={`/profile/${artwork.artist.username}`} className="hover:text-primary hover:underline">
                                          {artwork.artist.display_name || artwork.artist.username}
                                        </Link>
                                      </>
                                    )}
                                    {(activity.activity_type === 'sold' || activity.activity_type === 'sale') && (
                                      <>
                                        <span className="text-green-500">Sold</span> to{' '}
                                        <Link to={`/profile/${activity.to_user?.username}`} className="hover:text-primary hover:underline">
                                          {activity.to_user?.username || 'Unknown'}
                                        </Link>
                                        {' '}from{' '}
                                        <Link to={`/profile/${activity.from_user?.username}`} className="hover:text-primary hover:underline">
                                          {activity.from_user?.username || 'Unknown'}
                                        </Link>
                                      </>
                                    )}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    {new Date(activity.created_at).toLocaleString()}
                                  </p>
                                </div>
                                {activity.price && (
                                  <p className="font-semibold text-primary">${formatCurrency(activity.price)}</p>
                                )}
                              </div>
                            ))}
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-center py-8">
                          No sales recorded yet
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
                <TabsContent value="bids" className="mt-4">
                  <BidHistoryTab artworkId={String(artwork.id)} userId={user?.id?.toString()} />
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} />
      
      {/* Edit Price Dialog */}
      <Dialog open={editPriceDialogOpen} onOpenChange={setEditPriceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Price</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="price">New Price ($)</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="Enter new price"
              />
            </div>
            {newPrice && parseFloat(newPrice) > 0 && (
              <div className="p-3 bg-secondary/50 rounded-lg border border-border space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">List Price:</span>
                  <span className="font-medium">${formatCurrency(parseFloat(newPrice))}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Platform Fee (2.5%):</span>
                  <span className="font-medium text-destructive">-${formatCurrency(parseFloat(newPrice) * 0.025)}</span>
                </div>
                <div className="pt-2 border-t border-border flex items-center justify-between">
                  <span className="text-sm font-semibold">You will receive:</span>
                  <span className="text-lg font-bold bg-gradient-primary bg-clip-text text-transparent">
                    ${formatCurrency(parseFloat(newPrice) * 0.975)}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPriceDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSavePrice}>
              Save Price
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Details Dialog */}
      <Dialog open={editDetailsDialogOpen} onOpenChange={setEditDetailsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Artwork Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter artwork title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Enter artwork description"
                rows={4}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Note: The image cannot be changed once created.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDetailsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveDetails}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* List for Sale Dialog */}
      <Dialog open={listForSaleDialogOpen} onOpenChange={setListForSaleDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>List Artwork</DialogTitle>
            <DialogDescription>
              Choose how you want to list your artwork
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Listing Type Selection */}
            <div className="space-y-3">
              <Label>Listing Type</Label>
              <RadioGroup value={listingType} onValueChange={(value: any) => setListingType(value)}>
                <div className="flex items-start space-x-3 p-4 rounded-lg border border-border hover:border-primary/50 transition-colors">
                  <RadioGroupItem value="fixed" id="list-fixed" />
                  <div className="flex-1">
                    <Label htmlFor="list-fixed" className="cursor-pointer">
                      <p className="font-semibold">List as Fixed Price</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        List your artwork at a set price. Buyers can purchase it immediately. The listing will expire if not purchased by the expiry date.
                      </p>
                    </Label>
                  </div>
                </div>
                
                <div className="flex items-start space-x-3 p-4 rounded-lg border border-border hover:border-primary/50 transition-colors">
                  <RadioGroupItem value="auction" id="list-auction" />
                  <div className="flex-1">
                    <Label htmlFor="list-auction" className="cursor-pointer">
                      <p className="font-semibold">Timed Auction</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Let collectors bid on your artwork. Highest bidder wins when time expires.
                      </p>
                    </Label>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Pricing Fields */}
            {listingType === "fixed" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="sale-price">Price (USD) *</Label>
                  <Input
                    id="sale-price"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Set the price at which collectors can purchase your artwork
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fixed-expiry">Listing Expiry Duration *</Label>
                  <Select value={fixedPriceExpiry} onValueChange={setFixedPriceExpiry}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24">24 hours</SelectItem>
                      <SelectItem value="48">2 days</SelectItem>
                      <SelectItem value="72">3 days</SelectItem>
                      <SelectItem value="168">7 days</SelectItem>
                      <SelectItem value="336">14 days</SelectItem>
                      <SelectItem value="720">30 days</SelectItem>
                      <SelectItem value="never">Never expires</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {fixedPriceExpiry === "never" 
                      ? "The listing will remain active until manually delisted or sold"
                      : "The listing will be automatically delisted if not purchased by this time"}
                  </p>
                </div>

                {salePrice && parseFloat(salePrice) > 0 && parseFloat(salePrice) <= 1000000 && (
                  <div className="p-4 bg-secondary/50 rounded-lg border border-border space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">List Price:</span>
                      <span className="font-medium">${formatCurrency(parseFloat(salePrice))}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Platform Fee (2.5%):</span>
                      <span className="font-medium text-destructive">-${formatCurrency(parseFloat(salePrice) * 0.025)}</span>
                    </div>
                    <div className="pt-2 border-t border-border flex items-center justify-between">
                      <span className="text-sm font-semibold">You will receive:</span>
                      <span className="text-lg font-bold text-primary">${formatCurrency(parseFloat(salePrice) * 0.975)}</span>
                    </div>
                  </div>
                )}
                {salePrice && parseFloat(salePrice) > 1000000 && (
                  <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                    <p className="text-sm text-destructive font-medium">
                      Price cannot exceed $1,000,000
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="starting-bid">Starting Bid (USD) *</Label>
                  <Input
                    id="starting-bid"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={startingBid}
                    onChange={(e) => setStartingBid(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum bid to start the auction
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reserve-price">Reserve Price (USD) <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                  <Input
                    id="reserve-price"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={reservePrice}
                    onChange={(e) => setReservePrice(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum price you're willing to accept. If bidding doesn't reach this price, the sale won't complete.
                  </p>
                  {reservePrice && startingBid && parseFloat(reservePrice) > 0 && parseFloat(startingBid) > 0 && (
                    parseFloat(reservePrice) < parseFloat(startingBid) ? (
                      <p className="text-xs text-destructive">
                        Reserve price must be greater than or equal to starting bid
                      </p>
                    ) : null
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Auction Duration *</Label>
                  <Select value={auctionDuration} onValueChange={setAuctionDuration}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">6 hours</SelectItem>
                      <SelectItem value="12">12 hours</SelectItem>
                      <SelectItem value="24">24 hours</SelectItem>
                      <SelectItem value="48">2 days</SelectItem>
                      <SelectItem value="72">3 days</SelectItem>
                      <SelectItem value="168">7 days</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    How long the auction will run
                  </p>
                  {auctionDuration && (
                    <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <p className="text-sm font-semibold text-primary mb-1">Auction End Date & Time:</p>
                      <p className="text-sm">
                        {(() => {
                          const endTime = new Date();
                          endTime.setHours(endTime.getHours() + parseInt(auctionDuration));
                          return endTime.toLocaleString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          });
                        })()}
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListForSaleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveListForSale} className="bg-gradient-primary hover:bg-gradient-hover">
              List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Bid Dialog */}
      <Dialog open={bidDialogOpen} onOpenChange={setBidDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{userActiveBid ? "Update Your Bid" : "Place Your Bid"}</DialogTitle>
            <DialogDescription>
              {userActiveBid 
                ? `Update your current bid of $${formatCurrency(userActiveBid.amount)}. Enter a new amount below.`
                : `Enter your bid amount for this auction. Minimum bid: $${artwork?.auction ? formatCurrency((artwork.auction.current_bid ?? artwork.auction.start_price ?? 0) + 1) : "0"}`
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-secondary/50 rounded-lg border border-border space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Current Bid:</span>
                <span className="text-xl font-bold">${artwork?.auction ? (artwork.auction.current_bid ?? artwork.auction.start_price) : 0}</span>
              </div>
              {userActiveBid && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Your Bid:</span>
                  <span className="text-xl font-bold text-primary">${userActiveBid.amount}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Your Balance:</span>
                <span className="text-lg font-semibold text-primary">${formatCurrency(userBalance)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Auction Ends:</span>
                <span className="text-sm font-medium">{endTimeStr}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bid-amount">
                {userActiveBid ? "Add to Your Bid (USD) *" : "Your Bid Amount (USD) *"}
              </Label>
              <Input
                id="bid-amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder={userActiveBid ? "Enter additional amount" : (artwork?.auction ? ((artwork.auction.current_bid ?? artwork.auction.start_price ?? 0) + 1).toString() : "0")}
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                {userActiveBid 
                  ? `Enter amount to add to your existing bid of $${formatCurrency(userActiveBid.amount)}`
                  : "Minimum bid increment is $1"
                }
              </p>
              {userActiveBid && bidAmount && parseFloat(bidAmount) > 0 && (
                <p className="text-sm font-semibold text-primary">
                  New total bid: ${formatCurrency(userActiveBid.amount + parseFloat(bidAmount))}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bid-expiry">Bid Expiry</Label>
              <Select 
                value={bidExpiry || (availableExpiryOptions.length > 0 ? availableExpiryOptions[0].value : "24")} 
                onValueChange={(value) => {
                  console.log("Bid expiry changed to:", value);
                  setBidExpiry(value);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select expiry duration" />
                </SelectTrigger>
                <SelectContent>
                  {availableExpiryOptions.length > 0 ? (
                    availableExpiryOptions.map(option => {
                      const isSelected = bidExpiry === option.value;
                      return (
                        <SelectItem 
                          key={option.value} 
                          value={option.value}
                          className={isSelected ? "bg-accent" : ""}
                        >
                          {option.label}
                        </SelectItem>
                      );
                    })
                  ) : (
                    <SelectItem value="1" disabled>Auction ending soon - no expiry options available</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Your bid will automatically expire after this time if not accepted (max: auction end time)
                {userActiveBid?.expires_at && (
                  <span className="block mt-1 text-primary font-medium">
                    Current expiry: {new Date(userActiveBid.expires_at).toLocaleString()}
                  </span>
                )}
              </p>
            </div>

            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
              <p className="text-sm font-semibold mb-2">How Auctions Work:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Bids are placed in real-time and are visible to all participants</li>
                <li>• The highest bid when the auction ends wins the artwork</li>
                <li>• Payment is processed automatically when the auction ends</li>
                <li>• You need sufficient balance to place a bid</li>
                <li>• You can outbid yourself to increase your maximum bid</li>
              </ul>
              <Button 
                variant="link" 
                className="text-xs p-0 h-auto mt-2"
                onClick={() => {
                  setBidDialogOpen(false);
                  setAuctionExplainerOpen(true);
                }}
              >
                Learn more about auctions →
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBidDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handlePlaceBid}
              className="bg-gradient-primary hover:bg-gradient-hover"
              disabled={!bidAmount || parseFloat(bidAmount) <= 0}
            >
              {userActiveBid 
                ? `Add $${bidAmount || '0'} to Bid` 
                : `Place Bid - $${bidAmount || '0'}`
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auction Explainer Dialog */}
      <Dialog open={auctionExplainerOpen} onOpenChange={setAuctionExplainerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>How Auctions Work on ArtMart</DialogTitle>
            <DialogDescription>
              Everything you need to know about participating in auctions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Placing a Bid</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-bold text-primary">1.</span>
                  <span>Each bid must be at least $1 higher than the current bid</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">2.</span>
                  <span>You can place multiple bids to increase your maximum bid</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">3.</span>
                  <span>All bids are final and cannot be retracted</span>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Auction Timeline</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-bold text-primary">•</span>
                  <span>Auctions have a set end time displayed on the artwork page</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">•</span>
                  <span>When time expires, the highest bidder wins automatically</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">•</span>
                  <span>If there are no bids when the auction ends, the artwork becomes unlisted</span>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Payment & Ownership</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-bold text-primary">•</span>
                  <span>When you win, payment is automatically deducted from your balance</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">•</span>
                  <span>The artwork is immediately transferred to your account</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">•</span>
                  <span>Sellers receive payment directly to their balance</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">•</span>
                  <span>Make sure you have sufficient balance before bidding</span>
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold text-lg">Bid History & Transparency</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-bold text-primary">•</span>
                  <span>All bids are publicly visible in the activity tab</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">•</span>
                  <span>You can see who placed each bid and when</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-primary">•</span>
                  <span>Watch an auction to get notifications when you're outbid</span>
                </li>
              </ul>
            </div>

            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
              <p className="text-sm font-semibold mb-2">💡 Pro Tips:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• Add artworks to your watchlist to track auctions you're interested in</li>
                <li>• Check the auction end time in your local timezone</li>
                <li>• Review bid history to understand the artwork's demand</li>
                <li>• Ensure you have funds in your balance before the auction ends</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button 
              onClick={() => setAuctionExplainerOpen(false)}
              className="w-full bg-gradient-primary hover:bg-gradient-hover"
            >
              Got it!
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purchase Confirmation Dialog */}
      <Dialog open={purchaseConfirmOpen} onOpenChange={setPurchaseConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Purchase</DialogTitle>
            <DialogDescription>
              Review your purchase details below
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <span className="text-muted-foreground">Price</span>
              <span className="font-bold text-lg">${artwork?.price ? formatCurrency(artwork.price) : '0.00'}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
              <span className="text-muted-foreground">Current Balance</span>
              <span className="font-semibold">${formatCurrency(userBalance)}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted rounded-lg border-2 border-primary">
              <span className="text-muted-foreground">Balance After Purchase</span>
              <span className={`font-bold ${(userBalance - (artwork?.price || 0)) < 0 ? 'text-destructive' : 'text-primary'}`}>
                ${formatCurrency(userBalance - (artwork?.price || 0))}
              </span>
            </div>
            {(userBalance - (artwork?.price || 0)) < 0 && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive font-medium mb-2">
                  Insufficient balance to complete this purchase
                </p>
                <Button
                  onClick={() => {
                    setPurchaseConfirmOpen(false);
                    navigate("/balance");
                  }}
                  className="w-full bg-gradient-primary hover:bg-gradient-hover"
                  size="sm"
                >
                  Add Funds to Balance
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPurchaseConfirmOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={confirmPurchase}
              disabled={(userBalance - (artwork?.price || 0)) < 0}
            >
              Confirm Purchase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delist Confirmation Dialog */}
      <Dialog open={delistConfirmOpen} onOpenChange={setDelistConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {auctionIsActive ? "Cancel Auction" : "Delist Artwork"}
            </DialogTitle>
            <DialogDescription>
              {auctionIsActive 
                ? "Are you sure you want to cancel this auction? All active bids will be refunded."
                : "Are you sure you want to remove this artwork from sale?"
              }
            </DialogDescription>
          </DialogHeader>
          {auctionIsActive && (
            <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
              <p className="text-sm text-destructive font-semibold mb-2">
                ⚠️ Warning
              </p>
              <p className="text-xs text-muted-foreground">
                This will immediately cancel the auction and refund all bidders. This action cannot be undone.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDelistConfirmOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={confirmDelist}
            >
              {auctionIsActive ? "Cancel Auction" : "Delist"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ArtDetail;

