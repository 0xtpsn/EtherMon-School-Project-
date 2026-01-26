import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Clock } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useSession } from "@/context/SessionContext";
import { artworksApi } from "@/api/artworks";
import { meApi } from "@/api/me";
import { auctionsApi } from "@/api/auctions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

interface ArtCardProps {
  id: string;
  title: string;
  artist: string;
  price: string;
  image: string;
  endTime?: string;
  isAuction?: boolean;
  isListed?: boolean;
  onAuthRequired?: () => void;
  ownerId?: string;
  initialFavorited?: boolean;
  onFavoriteChange?: (artworkId: string, favorited: boolean) => void;
}

const ArtCard = ({ id, title, artist, price, image, endTime, isAuction, isListed = true, onAuthRequired, ownerId, initialFavorited = false, onFavoriteChange }: ArtCardProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useSession();
  const [showQuickDialog, setShowQuickDialog] = useState(false);
  const [balance, setBalance] = useState<number>(0);
  const [bidAmount, setBidAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [userActiveBid, setUserActiveBid] = useState<{ id: number; amount: number; expires_at?: string | null } | null>(null);
  const [isFavorited, setIsFavorited] = useState(initialFavorited);

  useEffect(() => {
    const fetchBalance = async () => {
      if (!user) return;
      try {
        const data = await meApi.balance();
        setBalance(data.available_balance || 0);
    } catch (error) {
      // Silently fail - balance will show 0
      }
    };
    
    const fetchUserBid = async () => {
      if (!user || !isAuction) return;
      try {
        const bids = await auctionsApi.myBids();
        const bid = bids.find((b: any) => b.artwork_id === parseInt(id) && b.is_active);
        if (bid) setUserActiveBid(bid.amount);
      } catch (error) {
        // Silently fail - no active bid shown
      }
    };
    
    fetchBalance();
    fetchUserBid();
  }, [user, id, isAuction]);

  // Update favorited state when initialFavorited prop changes
  useEffect(() => {
    setIsFavorited(initialFavorited);
  }, [initialFavorited]);

  const handleFavorite = async (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (!user) {
      onAuthRequired?.();
      return;
    }

    // Optimistic update - update UI immediately
    const previousState = isFavorited;
    const newState = !previousState;
    setIsFavorited(newState);

    try {
      const response = await artworksApi.toggleFavorite(id, newState);
      setIsFavorited(response.favorited);
      
      // Notify parent component of the change
      if (onFavoriteChange) {
        onFavoriteChange(id, response.favorited);
      }
    } catch (error: any) {
      // Rollback on error
      setIsFavorited(previousState);
      toast({
        title: "Error",
        description: error.message || "Failed to update like. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleAction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      onAuthRequired?.();
      return;
    }
    if (!isListed) {
      toast({
        title: "Not available",
        description: "This artwork is not currently listed for sale",
        variant: "destructive",
      });
      return;
    }
    setShowQuickDialog(true);
  };

  const handleQuickPurchase = async () => {
    if (!user) return;
    setIsProcessing(true);

    try {
      await artworksApi.purchase(id);
      toast({
        title: "Purchase successful!",
        description: "The artwork is now yours.",
      });
      setShowQuickDialog(false);
      // Navigate to artwork detail page instead of reloading
      navigate(`/art/${id}`);
    } catch (error: any) {
      toast({
        title: "Purchase failed",
        description: error.message || "Failed to purchase artwork",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickBid = async () => {
    if (!user || !bidAmount) return;
    
    // Check if auction has ended
    if (isAuction && endTime && new Date(endTime).getTime() <= Date.now()) {
      toast({
        title: "Auction ended",
        description: "This auction has ended. Bidding is no longer available.",
        variant: "destructive",
      });
      return;
    }
    
    const bidValue = parseFloat(bidAmount || "0");
    
    if (isNaN(bidValue) || bidValue <= 0) {
      toast({
        title: "Invalid bid amount",
        description: "Please enter a positive amount",
        variant: "destructive",
      });
      return;
    }
    
    // If user has existing bid, check that new total is valid
    const currentBid = parseFloat(price || "0");
    if (isNaN(currentBid)) {
      toast({
        title: "Invalid price",
        description: "Unable to determine current bid price",
        variant: "destructive",
      });
      return;
    }
    
    const totalBid = userActiveBid ? userActiveBid.amount + bidValue : bidValue;
    const minBid = currentBid + 1;
    
    if (totalBid < minBid) {
      toast({
        title: "Invalid bid",
        description: `Your total bid must be at least $${formatCurrency(minBid)} (current bid + $1)`,
        variant: "destructive",
      });
      return;
    }

    // Check balance - for existing bids, only check the additional amount needed
    const amountNeeded = userActiveBid ? bidValue : totalBid;
    if (amountNeeded > balance) {
      toast({
        title: "Insufficient balance",
        description: `You need $${formatCurrency(amountNeeded)} but only have $${formatCurrency(balance)}`,
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      // Use the artworks API to place bid (handles both new and update cases)
      await artworksApi.placeBid(id, totalBid);
      
      toast({
        title: userActiveBid ? "Bid updated!" : "Bid placed!",
        description: userActiveBid 
          ? `Added ${formatCurrency(bidValue)} to your bid. New total: ${formatCurrency(totalBid)}`
          : `Your bid of ${formatCurrency(bidValue)} has been placed.`,
      });
      
      setShowQuickDialog(false);
      // Refresh balance and bid status
      const data = await meApi.balance();
      setBalance(data.available_balance || 0);
        const bids = await auctionsApi.myBids();
        const bid = bids.find((b: any) => b.artwork_id === parseInt(id) && b.is_active);
        if (bid) setUserActiveBid({ id: bid.id, amount: bid.amount, expires_at: bid.expires_at || null });
        else setUserActiveBid(null);
    } catch (error: any) {
      toast({
        title: "Bid failed",
        description: error.message || "Failed to place bid",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };
  
  const priceValue = parseFloat(price || "0");
  const balanceAfterPurchase = isNaN(priceValue) ? balance : balance - priceValue;

  return (
    <>
      <Link to={`/art/${id}`}>
        <Card className="group overflow-hidden bg-gradient-card border-border hover:border-primary/50 transition-all duration-300 hover:shadow-glow-primary">
          <div className="relative aspect-square overflow-hidden">
            {!isListed && (
              <div className="absolute top-2 left-2 z-10 px-3 py-1 bg-muted/90 backdrop-blur-sm rounded-md">
                <span className="text-xs font-semibold">Not Listed</span>
              </div>
            )}
            <img
              src={image}
              alt={title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            />
            <Button
              size="icon"
              variant="ghost"
              className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm hover:bg-white border border-border/20 shadow-md"
              onClick={handleFavorite}
            >
              <Heart className={`w-4 h-4 ${isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-900'}`} />
            </Button>
            {isAuction && endTime && (
              <div className="absolute bottom-2 left-2 px-3 py-1 bg-accent/90 backdrop-blur-sm rounded-full flex items-center gap-2 text-accent-foreground">
                <Clock className="w-3 h-3" />
                <span className="text-xs font-medium">{endTime}</span>
              </div>
            )}
          </div>
          <CardContent className="p-4">
            <h3 className="font-semibold text-lg mb-1 truncate">{title}</h3>
            <p className="text-xs text-muted-foreground mb-1 truncate">#{id}</p>
            <p className="text-sm text-muted-foreground mb-3 truncate">by {artist}</p>
            <div className="flex items-center justify-between">
              {isListed ? (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {isAuction ? "Current Bid" : "Price"}
                    </p>
                    <p className="text-lg font-bold text-foreground">
                      ${formatCurrency(price || 0)}
                    </p>
                  </div>
                  {user && ownerId === user.id ? (
                    <div className="text-xs text-muted-foreground">
                      Your artwork
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      className="bg-gradient-primary hover:bg-gradient-hover"
                      onClick={handleAction}
                    >
                      {isAuction ? "Quick Bid" : "Quick Buy"}
                    </Button>
                  )}
                </>
              ) : (
                <div className="w-full">
                  <p className="text-sm text-muted-foreground text-center">
                    Not available for purchase
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>

      <Dialog open={showQuickDialog} onOpenChange={setShowQuickDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isAuction ? "Quick Bid" : "Quick Purchase"}</DialogTitle>
            <DialogDescription>
              {isAuction ? "Place your bid on this artwork" : "Confirm your purchase"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Artwork:</span>
              <span className="font-semibold">{title}</span>
            </div>
            
            {isAuction ? (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Current Bid:</span>
                  <span className="font-semibold">${formatCurrency(price || 0)}</span>
                </div>
                {userActiveBid && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Your Bid:</span>
                    <span className="font-semibold">${formatCurrency(userActiveBid.amount)}</span>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="bidAmount">
                    {userActiveBid ? "Add to Your Bid" : "Your Bid Amount"}
                  </Label>
                  <Input
                    id="bidAmount"
                    type="number"
                    placeholder={userActiveBid ? "Enter additional amount" : "Enter bid amount"}
                    value={bidAmount}
                    onChange={(e) => setBidAmount(e.target.value)}
                    min={0.01}
                    step="0.01"
                  />
                  {userActiveBid && bidAmount && (
                    <p className="text-sm text-muted-foreground">
                      New total: ${formatCurrency(userActiveBid.amount + parseFloat(bidAmount || "0"))}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Price:</span>
                <span className="font-semibold">${price}</span>
              </div>
            )}
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Your Balance:</span>
              <span className="font-semibold">${formatCurrency(balance)}</span>
            </div>
            
            {!isAuction && (
              <>
                <div className="flex justify-between items-center border-t pt-4">
                  <span className="text-sm text-muted-foreground">Balance After:</span>
                  <span className={`font-bold ${balanceAfterPurchase < 0 ? 'text-destructive' : 'text-foreground'}`}>
                    ${formatCurrency(balanceAfterPurchase)}
                  </span>
                </div>
                {balanceAfterPurchase < 0 && (
                  <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <p className="text-sm text-destructive font-medium mb-2">
                      Insufficient balance to complete this purchase
                    </p>
                    <Button
                      onClick={() => {
                        setShowQuickDialog(false);
                        navigate("/balance");
                      }}
                      className="w-full bg-gradient-primary hover:bg-gradient-hover"
                      size="sm"
                    >
                      Add Funds to Balance
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQuickDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={isAuction ? handleQuickBid : handleQuickPurchase}
              disabled={isProcessing || (!isAuction && balanceAfterPurchase < 0) || (isAuction && (!bidAmount || parseFloat(bidAmount || "0") > balance))}
            >
              {isProcessing ? "Processing..." : isAuction ? (userActiveBid ? "Add to Bid" : "Place Bid") : "Confirm Purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ArtCard;
