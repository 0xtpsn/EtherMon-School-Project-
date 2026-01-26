import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { artworksApi } from "@/api/artworks";
import { auctionsApi } from "@/api/auctions";

interface Bid {
  id: number;
  amount: number;
  created_at: string;
  bidder_id: number;
  bidder_username?: string;
  bidder_display_name?: string;
  bidder_avatar_url?: string | null;
}

interface BidHistoryTabProps {
  artworkId: string;
  userId?: string;
}

export const BidHistoryTab = ({ artworkId, userId }: BidHistoryTabProps) => {
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [selectedBid, setSelectedBid] = useState<Bid | null>(null);
  const [newBidAmount, setNewBidAmount] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [bidToCancel, setBidToCancel] = useState<{ id: number; amount: number } | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchBids();
  }, [artworkId]);

  const fetchBids = async () => {
    try {
      const response = await artworksApi.detail(artworkId);
      const bidList = (response.artwork.bids as Bid[]) || [];
      setBids(bidList);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load bid history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openCancelDialog = (bidId: number, bidAmount: number) => {
    setBidToCancel({ id: bidId, amount: bidAmount });
    setCancelDialogOpen(true);
  };

  const handleCancelBid = async () => {
    if (!bidToCancel) return;
    try {
      await auctionsApi.cancelBid(bidToCancel.id);
      toast({
        title: "Bid cancelled",
        description: `Your bid has been cancelled. $${bidToCancel.amount} returned to your balance.`,
      });
      setCancelDialogOpen(false);
      setBidToCancel(null);
      // Add a small delay to ensure backend has processed the cancellation
      setTimeout(() => {
        fetchBids();
      }, 100);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cancel bid",
        variant: "destructive",
      });
    }
  };

  const handleUpdateBid = async () => {
    if (!selectedBid) return;
    const newAmount = parseFloat(newBidAmount);
    if (isNaN(newAmount) || newAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid bid amount",
        variant: "destructive",
      });
      return;
    }
    try {
      await auctionsApi.updateBid(selectedBid.id, newAmount);
      toast({
        title: "Bid updated",
        description: `Your bid has been updated to $${newAmount}.`,
      });
      setUpdateDialogOpen(false);
      setSelectedBid(null);
      setNewBidAmount("");
      fetchBids();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update bid",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="p-6">
          <p className="text-muted-foreground text-center">Loading bids...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-border bg-card">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4">Bid</h3>
          {bids.length > 0 ? (
            <div className="space-y-3">
              {bids.map((bid) => {
                const isUserBid = userId && String(bid.bidder_id) === userId;
                return (
                  <div key={bid.id} className="border-b border-border pb-3 last:border-0">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={bid.bidder_avatar_url || ""} />
                            <AvatarFallback>
                              {(bid.bidder_display_name || bid.bidder_username || "U")[0].toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => navigate(`/profile/${bid.bidder_username || bid.bidder_id}`)}
                              className="font-medium hover:underline cursor-pointer"
                            >
                              {bid.bidder_display_name || bid.bidder_username || "Unknown"}
                            </button>
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground mt-1 ml-11">
                          <p>{new Date(bid.created_at).toLocaleString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-primary">${bid.amount}</span>
                        {isUserBid && (
                          <div className="flex gap-1">
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
                              onClick={() => openCancelDialog(bid.id, bid.amount)}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No bids placed yet</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Bid</DialogTitle>
            <DialogDescription>Modify your bid amount.</DialogDescription>
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

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Bid</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel this bid? The funds will be returned to your available balance.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelDialogOpen(false);
                setBidToCancel(null);
              }}
            >
              No, Keep Bid
            </Button>
            <Button variant="destructive" onClick={handleCancelBid}>
              Yes, Cancel Bid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
