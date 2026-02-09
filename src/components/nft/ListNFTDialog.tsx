import { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/context/WalletContext";
import { useOwnedNFTs } from "@/hooks/useOwnedNFTs";
import { Loader2, Tag, ArrowLeft, Clock, Gavel, CheckCircle, ChevronLeft, ChevronRight } from "lucide-react";
import PokechainNFTAbi from "@/config/abi/PokechainNFT.json";
import PokechainMarketplaceAbi from "@/config/abi/PokechainMarketplace.json";
import { POKECHAIN_NFT_ADDRESS, POKECHAIN_MARKETPLACE_ADDRESS } from "@/config/contracts";
import { localNotifications } from "@/services/localNotifications";

interface ListNFTDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

type ListingType = "fixed" | "auction";

export function ListNFTDialog({ open, onOpenChange, onSuccess }: ListNFTDialogProps) {
    const { address, signer, isCorrectNetwork, switchToSepolia } = useWallet();
    const { toast } = useToast();
    const { nfts, loading: loadingNFTs, refetch } = useOwnedNFTs(address);

    // Dialog state
    const [step, setStep] = useState<"select" | "configure">("select");
    const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null);
    const [listingType, setListingType] = useState<ListingType>("fixed");
    const [price, setPrice] = useState("");
    const [auctionStartPrice, setAuctionStartPrice] = useState("");
    const [auctionDuration, setAuctionDuration] = useState("24");
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 6;

    // Filter out already listed NFTs
    const availableNFTs = nfts.filter(nft => nft.marketStatus !== "listed" && nft.marketStatus !== "auction");

    // Reset state when dialog closes
    useEffect(() => {
        if (!open) {
            setStep("select");
            setSelectedTokenId(null);
            setListingType("fixed");
            setPrice("");
            setAuctionStartPrice("");
            setAuctionDuration("24");
            setCurrentPage(1);
        }
    }, [open]);

    const selectedNFT = nfts.find(nft => nft.tokenId === selectedTokenId);

    const ensureApproval = async (signer: ethers.Signer): Promise<boolean> => {
        const nftContract = new ethers.Contract(
            POKECHAIN_NFT_ADDRESS,
            PokechainNFTAbi,
            signer
        );

        const approved = await nftContract.getApproved(selectedTokenId);
        if (approved.toLowerCase() !== POKECHAIN_MARKETPLACE_ADDRESS.toLowerCase()) {
            toast({
                title: "Approval required",
                description: "Approving NFT for marketplace...",
            });

            const approveTx = await nftContract.approve(POKECHAIN_MARKETPLACE_ADDRESS, selectedTokenId);
            await approveTx.wait();

            toast({
                title: "Approval granted",
                description: "NFT approved for marketplace",
            });
        }
        return true;
    };

    const handleList = async () => {
        if (!address || !selectedTokenId) return;

        if (!isCorrectNetwork) {
            await switchToSepolia();
            return;
        }

        // Validate inputs
        if (listingType === "fixed") {
            if (!price || parseFloat(price) <= 0) {
                toast({
                    title: "Invalid price",
                    description: "Please enter a valid price greater than 0",
                    variant: "destructive",
                });
                return;
            }
        } else {
            if (!auctionStartPrice || parseFloat(auctionStartPrice) <= 0) {
                toast({
                    title: "Invalid starting price",
                    description: "Please enter a valid starting price",
                    variant: "destructive",
                });
                return;
            }
        }

        setIsProcessing(true);
        try {
            if (!signer) {
                toast({
                    title: "Wallet not connected",
                    description: "Please reconnect your wallet",
                    variant: "destructive",
                });
                setIsProcessing(false);
                return;
            }

            // Ensure approval first
            await ensureApproval(signer);

            const marketplace = new ethers.Contract(
                POKECHAIN_MARKETPLACE_ADDRESS,
                PokechainMarketplaceAbi,
                signer
            );

            if (listingType === "fixed") {
                toast({
                    title: "Listing NFT",
                    description: "Please confirm the transaction...",
                });

                const priceInWei = ethers.parseEther(price);
                const tx = await marketplace.listItem(selectedTokenId, priceInWei);
                await tx.wait();

                toast({
                    title: "Listed successfully! 🎉",
                    description: `NFT listed for ${price} ETH`,
                });

                // Send local notification
                localNotifications.notifyListed(selectedTokenId!, price);
            } else {
                toast({
                    title: "Creating auction",
                    description: "Please confirm the transaction...",
                });

                const startPriceInWei = ethers.parseEther(auctionStartPrice);
                const durationInSeconds = parseInt(auctionDuration) * 60 * 60;
                const tx = await marketplace.createAuction(selectedTokenId, startPriceInWei, durationInSeconds);
                await tx.wait();

                toast({
                    title: "Auction created! 🎉",
                    description: `Your ${auctionDuration}h auction has started`,
                });

                // Send local notification
                localNotifications.notifyAuctionCreated(selectedTokenId!, auctionStartPrice, `${auctionDuration}h`);
            }

            onOpenChange(false);
            refetch();
            onSuccess?.();
        } catch (error: any) {
            console.error("Listing error:", error);
            let message = "Failed to list. Please try again.";
            if (error.code === "ACTION_REJECTED") {
                message = "Transaction was rejected";
            }
            toast({
                title: "Listing failed",
                description: message,
                variant: "destructive",
            });
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        {step === "configure" && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 mr-1"
                                onClick={() => setStep("select")}
                            >
                                <ArrowLeft className="w-4 h-4" />
                            </Button>
                        )}
                        <Tag className="w-5 h-5 text-primary" />
                        {step === "select" ? "Select NFT to List" : "Configure Listing"}
                    </DialogTitle>
                    <DialogDescription>
                        {step === "select"
                            ? "Choose an NFT from your collection to list on the marketplace"
                            : "Set your listing price and type"}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4">
                    {step === "select" ? (
                        // NFT Selection Grid
                        loadingNFTs ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : availableNFTs.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-muted-foreground">
                                    {nfts.length === 0
                                        ? "You don't own any NFTs yet. Mint some first!"
                                        : "All your NFTs are already listed."}
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                    {availableNFTs
                                        .slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
                                        .map((nft) => (
                                            <button
                                                key={nft.tokenId}
                                                onClick={() => {
                                                    setSelectedTokenId(nft.tokenId);
                                                    setStep("configure");
                                                }}
                                                className="group relative aspect-square rounded-lg overflow-hidden border-2 border-border hover:border-primary transition-colors"
                                            >
                                                <img
                                                    src={nft.image}
                                                    alt={nft.name}
                                                    className="w-full h-full object-cover"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                                <div className="absolute bottom-0 left-0 right-0 p-2 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <p className="text-sm font-bold truncate">{nft.name}</p>
                                                    <p className="text-xs opacity-75">#{nft.tokenId}</p>
                                                </div>
                                            </button>
                                        ))}
                                </div>
                                {/* Pagination Controls */}
                                {availableNFTs.length > ITEMS_PER_PAGE && (
                                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="gap-1"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                            Previous
                                        </Button>
                                        <span className="text-sm text-muted-foreground">
                                            Page {currentPage} of {Math.ceil(availableNFTs.length / ITEMS_PER_PAGE)}
                                        </span>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCurrentPage(p => Math.min(Math.ceil(availableNFTs.length / ITEMS_PER_PAGE), p + 1))}
                                            disabled={currentPage >= Math.ceil(availableNFTs.length / ITEMS_PER_PAGE)}
                                            className="gap-1"
                                        >
                                            Next
                                            <ChevronRight className="w-4 h-4" />
                                        </Button>
                                    </div>
                                )}
                            </>
                        )
                    ) : (
                        // Configure Listing
                        <div className="space-y-6">
                            {/* Selected NFT Preview */}
                            {selectedNFT && (
                                <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                                    <img
                                        src={selectedNFT.image}
                                        alt={selectedNFT.name}
                                        className="w-16 h-16 rounded-lg object-cover"
                                    />
                                    <div>
                                        <p className="font-bold">{selectedNFT.name}</p>
                                        <p className="text-sm text-muted-foreground">Token #{selectedNFT.tokenId}</p>
                                    </div>
                                </div>
                            )}

                            {/* Listing Type Selection */}
                            <div className="space-y-3">
                                <Label>Listing Type</Label>
                                <RadioGroup value={listingType} onValueChange={(v) => setListingType(v as ListingType)}>
                                    <div className="flex items-start space-x-3 p-4 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer">
                                        <RadioGroupItem value="fixed" id="list-fixed" />
                                        <div className="flex-1">
                                            <Label htmlFor="list-fixed" className="cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <Tag className="w-4 h-4" />
                                                    <span className="font-semibold">Fixed Price</span>
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    Set a price for immediate purchase
                                                </p>
                                            </Label>
                                        </div>
                                    </div>

                                    <div className="flex items-start space-x-3 p-4 rounded-lg border border-border hover:border-primary/50 transition-colors cursor-pointer">
                                        <RadioGroupItem value="auction" id="list-auction" />
                                        <div className="flex-1">
                                            <Label htmlFor="list-auction" className="cursor-pointer">
                                                <div className="flex items-center gap-2">
                                                    <Gavel className="w-4 h-4" />
                                                    <span className="font-semibold">Timed Auction</span>
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-1">
                                                    Let collectors bid. Highest bidder wins when time expires.
                                                </p>
                                            </Label>
                                        </div>
                                    </div>
                                </RadioGroup>
                            </div>

                            {/* Price Input */}
                            {listingType === "fixed" ? (
                                <div className="space-y-2">
                                    <Label htmlFor="price">Price (ETH)</Label>
                                    <Input
                                        id="price"
                                        type="number"
                                        step="0.001"
                                        min="0"
                                        placeholder="0.00"
                                        value={price}
                                        onChange={(e) => setPrice(e.target.value)}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Buyers can purchase immediately at this price
                                    </p>
                                    {price && parseFloat(price) > 0 && (
                                        <div className="mt-3 p-3 bg-muted rounded-lg space-y-1.5 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Listing price</span>
                                                <span className="font-medium">{price} ETH</span>
                                            </div>
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>Platform fee (2.5%)</span>
                                                <span>-{(parseFloat(price) * 0.025).toFixed(6)} ETH</span>
                                            </div>
                                            <div className="border-t border-border pt-1.5 flex justify-between font-semibold">
                                                <span>You receive</span>
                                                <span className="text-green-600">{(parseFloat(price) * 0.975).toFixed(6)} ETH</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <div className="space-y-2">
                                        <Label htmlFor="start-price">Starting Price (ETH)</Label>
                                        <Input
                                            id="start-price"
                                            type="number"
                                            step="0.001"
                                            min="0"
                                            placeholder="0.00"
                                            value={auctionStartPrice}
                                            onChange={(e) => setAuctionStartPrice(e.target.value)}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="duration">Auction Duration</Label>
                                        <Select value={auctionDuration} onValueChange={setAuctionDuration}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">1 hour</SelectItem>
                                                <SelectItem value="6">6 hours</SelectItem>
                                                <SelectItem value="12">12 hours</SelectItem>
                                                <SelectItem value="24">24 hours</SelectItem>
                                                <SelectItem value="48">2 days</SelectItem>
                                                <SelectItem value="72">3 days</SelectItem>
                                                <SelectItem value="168">7 days</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    {auctionStartPrice && parseFloat(auctionStartPrice) > 0 && (
                                        <div className="p-3 bg-muted rounded-lg space-y-1.5 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Starting price</span>
                                                <span className="font-medium">{auctionStartPrice} ETH</span>
                                            </div>
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>Platform fee (2.5%)</span>
                                                <span>-{(parseFloat(auctionStartPrice) * 0.025).toFixed(6)} ETH</span>
                                            </div>
                                            <div className="border-t border-border pt-1.5 flex justify-between font-semibold">
                                                <span>You receive (minimum)</span>
                                                <span className="text-green-600">{(parseFloat(auctionStartPrice) * 0.975).toFixed(6)} ETH</span>
                                            </div>
                                            <p className="text-xs text-muted-foreground pt-1">
                                                Final proceeds depend on the winning bid
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {step === "configure" && (
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setStep("select")}>
                            Back
                        </Button>
                        <Button
                            onClick={handleList}
                            disabled={isProcessing}
                            className="gap-2"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="w-4 h-4" />
                                    {listingType === "fixed" ? "List for Sale" : "Start Auction"}
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}

export default ListNFTDialog;
