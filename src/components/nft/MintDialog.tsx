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
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/context/WalletContext";
import { Loader2, Sparkles, AlertCircle, ExternalLink, PartyPopper } from "lucide-react";
import { Link } from "react-router-dom";
import PokechainNFTAbi from "@/config/abi/PokechainNFT.json";
import { POKECHAIN_NFT_ADDRESS, BLOCK_EXPLORER, RPC_URL } from "@/config/contracts";
import { imageUrl, metadataUrl, IMAGE_CID } from "@/config/ipfs";
import confetti from "canvas-confetti";
import { localNotifications } from "@/services/localNotifications";

/** Data for a single minted NFT shown in the success preview */
interface MintedNFT {
    tokenId: number;
    pokemonId: number;
    name: string;
    image: string;
    type?: string;
    rarity?: string;
}

/** Colour per Pokémon type */
function typeColor(type: string): string {
    const colors: Record<string, string> = {
        Fire: "#F08030", Water: "#6890F0", Grass: "#78C850", Electric: "#F8D030",
        Psychic: "#F85888", Dragon: "#7038F8", Normal: "#A8A878", Fighting: "#C03028",
        Ghost: "#705898", Dark: "#705848", Steel: "#B8B8D0", Fairy: "#EE99AC",
        Ice: "#98D8D8", Bug: "#A8B820", Rock: "#B8A038", Ground: "#E0C068",
        Poison: "#A040A0", Flying: "#A890F0",
    };
    return colors[type] || "#A8A878";
}

function rarityStyle(rarity: string) {
    switch (rarity) {
        case "Legendary": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
        case "Epic": return "bg-purple-500/20 text-purple-400 border-purple-500/30";
        case "Rare": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
        case "Uncommon": return "bg-green-500/20 text-green-400 border-green-500/30";
        default: return "bg-gray-500/20 text-gray-400 border-gray-500/30";
    }
}

interface MintDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function MintDialog({ open, onOpenChange, onSuccess }: MintDialogProps) {
    const { address, signer, isCorrectNetwork, switchToSepolia } = useWallet();
    const { toast } = useToast();
    const [quantity, setQuantity] = useState(1);
    const [isMinting, setIsMinting] = useState(false);
    const [saleActive, setSaleActive] = useState<boolean | null>(null);
    const [remainingSupply, setRemainingSupply] = useState<number | null>(null);
    const [walletMinted, setWalletMinted] = useState<number | null>(null);
    const [maxPerWallet, setMaxPerWallet] = useState<number>(50);
    const [loading, setLoading] = useState(true);

    // Success preview state
    const [showSuccess, setShowSuccess] = useState(false);
    const [mintedNFTs, setMintedNFTs] = useState<MintedNFT[]>([]);
    const [loadingPreview, setLoadingPreview] = useState(false);

    // Fetch contract state when dialog opens
    useEffect(() => {
        if (!open || !address) {
            setLoading(false);
            return;
        }

        const fetchContractState = async () => {
            setLoading(true);
            try {
                // Use JsonRpcProvider for read-only calls (faster, doesn't depend on MetaMask)
                const provider = new ethers.JsonRpcProvider(RPC_URL);
                const contract = new ethers.Contract(
                    POKECHAIN_NFT_ADDRESS,
                    PokechainNFTAbi,
                    provider
                );

                // Fetch each individually so one failure doesn't block the rest
                try { setSaleActive(await contract.saleActive()); } catch (e) { console.warn("saleActive fetch failed:", e); }
                try { setRemainingSupply(Number(await contract.remainingSupply())); } catch (e) { console.warn("remainingSupply fetch failed:", e); }
                try { setWalletMinted(Number(await contract.walletMinted(address))); } catch (e) { console.warn("walletMinted fetch failed:", e); }
                try { setMaxPerWallet(Number(await contract.MAX_PER_WALLET())); } catch (e) { console.warn("MAX_PER_WALLET fetch failed:", e); }
            } catch (error) {
                console.error("Error fetching contract state:", error);
                toast({
                    title: "Error",
                    description: "Failed to fetch minting status",
                    variant: "destructive",
                });
            } finally {
                setLoading(false);
            }
        };

        fetchContractState();
    }, [open, address, toast]);

    // Reset success state when dialog closes
    useEffect(() => {
        if (!open) {
            setShowSuccess(false);
            setMintedNFTs([]);
        }
    }, [open]);

    // Trigger confetti when success screen shows
    useEffect(() => {
        if (showSuccess) {
            // Fire confetti from both sides
            const duration = 3000;
            const end = Date.now() + duration;

            const frame = () => {
                // Left side
                confetti({
                    particleCount: 3,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0, y: 0.6 },
                    colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'],
                });
                // Right side
                confetti({
                    particleCount: 3,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1, y: 0.6 },
                    colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'],
                });

                if (Date.now() < end) {
                    requestAnimationFrame(frame);
                }
            };

            // Initial burst
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { x: 0.5, y: 0.5 },
                colors: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'],
            });

            frame();
        }
    }, [showSuccess]);

    // Max 50 per transaction, capped by remaining supply
    const maxCanMint = remainingSupply !== null
        ? Math.min(50, remainingSupply)
        : 50;

    /**
     * Parse the transaction receipt to extract minted token IDs,
     * then fetch metadata for each one.
     */
    const fetchMintedNFTs = async (receipt: ethers.TransactionReceipt) => {
        setLoadingPreview(true);

        // Show the success dialog immediately — NFT cards will appear as they load
        setShowSuccess(true);

        try {
            // Use JsonRpcProvider for read-only parsing (no MetaMask needed)
            const provider = new ethers.JsonRpcProvider(RPC_URL);
            const contract = new ethers.Contract(
                POKECHAIN_NFT_ADDRESS,
                PokechainNFTAbi,
                provider
            );

            // Parse Transfer events from the receipt
            // Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
            // Mints come from address(0)
            const transferLogs = receipt.logs
                .map((log) => {
                    try {
                        return contract.interface.parseLog({
                            topics: log.topics as string[],
                            data: log.data,
                        });
                    } catch {
                        return null;
                    }
                })
                .filter(
                    (parsed): parsed is ethers.LogDescription =>
                        parsed !== null &&
                        parsed.name === "Transfer" &&
                        parsed.args[0] === ethers.ZeroAddress // from == 0x0 means mint
                );

            const tokenIds = transferLogs.map((log) => Number(log.args[2]));

            if (tokenIds.length === 0) {
                setLoadingPreview(false);
                return;
            }

            // For each token, fetch only the pokemonId from the contract (fast, single RPC call)
            // then build the image URL directly — no IPFS metadata fetch needed for the preview
            const nftPromises = tokenIds.map(async (tid) => {
                const pokemonId = Number(await contract.getPokemonId(tid));

                // Use shared gateway config (fast fallback when Storacha/w3s is slow)
                const image = imageUrl(pokemonId);

                // Try to fetch metadata JSON for name/type/rarity (non-blocking)
                let name = `Pokémon #${pokemonId}`;
                let typeAttr: string | undefined;
                let rarityAttr: string | undefined;

                try {
                    const metaUrl = metadataUrl(pokemonId);
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout
                    const res = await fetch(metaUrl, { signal: controller.signal });
                    clearTimeout(timeout);
                    const metadata = await res.json();
                    name = metadata.name || name;
                    typeAttr = metadata.attributes?.find(
                        (a: any) => a.trait_type === "Type"
                    )?.value;
                    rarityAttr = metadata.attributes?.find(
                        (a: any) => a.trait_type === "Rarity"
                    )?.value;
                } catch {
                    // Metadata fetch failed/timed out — image will still show
                    console.warn(`Metadata fetch timed out for pokemonId ${pokemonId}`);
                }

                return {
                    tokenId: tid,
                    pokemonId,
                    name,
                    image,
                    type: typeAttr,
                    rarity: rarityAttr,
                } as MintedNFT;
            });

            const results = await Promise.all(nftPromises);
            setMintedNFTs(results);
        } catch (err) {
            console.error("Failed to fetch minted NFT previews:", err);
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleMint = async () => {
        if (!address || !window.ethereum) {
            toast({
                title: "Wallet not connected",
                description: "Please connect your wallet first",
                variant: "destructive",
            });
            return;
        }

        if (!isCorrectNetwork) {
            await switchToSepolia();
            return;
        }

        if (saleActive === false) {
            toast({
                title: "Sale not active",
                description: "Minting is currently paused",
                variant: "destructive",
            });
            return;
        }

        if (quantity < 1 || quantity > maxCanMint) {
            toast({
                title: "Invalid quantity",
                description: `You can mint between 1 and ${maxCanMint} NFTs`,
                variant: "destructive",
            });
            return;
        }

        setIsMinting(true);
        try {
            if (!signer) {
                toast({
                    title: "Wallet not connected",
                    description: "Please reconnect your wallet",
                    variant: "destructive",
                });
                setIsMinting(false);
                return;
            }

            const contract = new ethers.Contract(
                POKECHAIN_NFT_ADDRESS,
                PokechainNFTAbi,
                signer
            );

            toast({
                title: "Confirm in wallet",
                description: `Minting ${quantity} Pokémon NFT${quantity > 1 ? "s" : ""}...`,
            });

            console.log("[Mint] Step 4: Sending mint transaction for quantity:", quantity);
            const tx = await contract.mint(quantity);
            console.log("[Mint] Step 5: Transaction sent:", tx.hash);

            toast({
                title: "Transaction submitted",
                description: "Waiting for confirmation...",
            });

            const receipt = await tx.wait();
            console.log("[Mint] Step 6: Transaction confirmed!");

            toast({
                title: "Minting successful!",
                description: `You minted ${quantity} Pokémon NFT${quantity > 1 ? "s" : ""}!`,
            });

            // Send local notification
            localNotifications.notifyMint(quantity);

            onSuccess?.();

            // Fetch the minted NFTs and show the success preview
            await fetchMintedNFTs(receipt);
        } catch (error: any) {
            console.error("[Mint] Error:", error);
            let message = "Failed to mint. Please try again.";
            if (error.code === "ACTION_REJECTED") {
                message = "Transaction was rejected";
            } else if (error.message?.includes("Sale is not active")) {
                message = "Sale is currently paused";
            } else if (error.message?.includes("Exceeds max supply")) {
                message = "Not enough supply remaining";
            } else if (error.message?.includes("Exceeds wallet limit")) {
                message = "You've reached the wallet limit";
            }
            toast({
                title: "Mint failed",
                description: message,
                variant: "destructive",
            });
        } finally {
            setIsMinting(false);
        }
    };

    const handleClose = () => {
        setShowSuccess(false);
        setMintedNFTs([]);
        onOpenChange(false);
    };

    /* ─── Success Preview ─── */
    if (showSuccess) {
        return (
            <Dialog open={open} onOpenChange={handleClose}>
                <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
                    <DialogHeader className="text-center pb-2">
                        <div className="flex justify-center mb-3">
                            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                                <PartyPopper className="w-8 h-8 text-green-500" />
                            </div>
                        </div>
                        <DialogTitle className="text-2xl">
                            Mint Successful!
                        </DialogTitle>
                        <DialogDescription>
                            {mintedNFTs.length > 0
                                ? `You minted ${mintedNFTs.length} Pokémon NFT${mintedNFTs.length > 1 ? "s" : ""}!`
                                : "Your NFTs have been minted successfully!"}
                        </DialogDescription>
                    </DialogHeader>

                    {loadingPreview ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <p className="text-sm text-muted-foreground">
                                Loading your new Pokémon...
                            </p>
                        </div>
                    ) : mintedNFTs.length > 0 ? (
                        <div className="overflow-y-auto flex-1 -mx-6 px-6 py-2">
                            <div className={`grid gap-4 ${mintedNFTs.length === 1 ? "grid-cols-1 max-w-[280px] mx-auto" : "grid-cols-2"}`}>
                                {mintedNFTs.map((nft) => (
                                    <Link
                                        key={nft.tokenId}
                                        to={`/nft/${nft.tokenId}`}
                                        onClick={handleClose}
                                        className="group"
                                    >
                                        <div className="rounded-xl border border-border bg-card overflow-hidden transition-all duration-200 hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5">
                                            {/* Image */}
                                            <div className="aspect-square relative bg-muted flex items-center justify-center overflow-hidden">
                                                {nft.image ? (
                                                    <img
                                                        src={nft.image}
                                                        alt={nft.name}
                                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                        onError={(e) => {
                                                            const img = e.currentTarget;
                                                            // Try alternative gateway (e.g. dweb, w3s) if primary fails
                                                            if (!img.src.includes("dweb.link")) {
                                                                img.src = `https://dweb.link/ipfs/${IMAGE_CID}/${nft.pokemonId}.png`;
                                                            } else if (!img.src.includes("w3s.link")) {
                                                                img.src = `https://w3s.link/ipfs/${IMAGE_CID}/${nft.pokemonId}.png`;
                                                            }
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="text-4xl">❓</div>
                                                )}

                                                {/* Token ID badge */}
                                                <span className="absolute top-2 left-2 bg-background/80 backdrop-blur-sm text-xs font-mono px-2 py-0.5 rounded-md border border-border">
                                                    #{nft.tokenId}
                                                </span>

                                                {/* Rarity badge */}
                                                {nft.rarity && (
                                                    <span className={`absolute top-2 right-2 text-xs font-semibold px-2 py-0.5 rounded-md border ${rarityStyle(nft.rarity)}`}>
                                                        {nft.rarity}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Info */}
                                            <div className="p-3">
                                                <p className="font-semibold text-sm truncate">
                                                    {nft.name}
                                                </p>
                                                <div className="flex items-center gap-1.5 mt-1.5">
                                                    {nft.type && (
                                                        <span
                                                            className="text-[10px] font-medium px-2 py-0.5 rounded-full text-white"
                                                            style={{ backgroundColor: typeColor(nft.type) }}
                                                        >
                                                            {nft.type}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] text-muted-foreground">
                                                        Pokédex #{nft.pokemonId}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            Mint was successful but we couldn't load the preview.
                            <br />
                            Check your NFTs on the homepage.
                        </div>
                    )}

                    <DialogFooter className="pt-4 gap-2 sm:gap-2">
                        {mintedNFTs.length === 1 && (
                            <Button
                                variant="outline"
                                className="flex-1 gap-2"
                                asChild
                            >
                                <Link to={`/nft/${mintedNFTs[0].tokenId}`} onClick={handleClose}>
                                    <ExternalLink className="w-4 h-4" />
                                    View NFT
                                </Link>
                            </Button>
                        )}
                        <Button
                            className="flex-1 bg-gradient-primary hover:bg-gradient-hover"
                            onClick={handleClose}
                        >
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    /* ─── Normal Mint Form ─── */
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-primary" />
                        Mint Pokémon NFTs
                    </DialogTitle>
                    <DialogDescription>
                        Mint random Pokémon from the collection. Each mint gives you a unique, randomly selected Pokémon!
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : !address ? (
                        <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
                            <AlertCircle className="w-5 h-5 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">Connect your wallet to mint</p>
                        </div>
                    ) : (
                        <>
                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 bg-muted rounded-lg">
                                    <p className="text-xs text-muted-foreground">Remaining Supply</p>
                                    <p className="text-lg font-bold">{remainingSupply?.toLocaleString() || "—"}</p>
                                </div>
                                <div className="p-3 bg-muted rounded-lg">
                                    <p className="text-xs text-muted-foreground">Your Mints</p>
                                    <p className="text-lg font-bold">{walletMinted || 0} / {maxPerWallet}</p>
                                </div>
                            </div>

                            {/* Quantity selector */}
                            <div className="space-y-2">
                                <Label htmlFor="mint-quantity">Quantity (max 50 per transaction)</Label>
                                <Input
                                    id="mint-quantity"
                                    type="number"
                                    min={1}
                                    max={50}
                                    value={quantity}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value) || 1;
                                        setQuantity(Math.min(50, Math.max(1, val)));
                                    }}
                                    className="w-full"
                                    placeholder="Enter quantity (1-50)"
                                />
                            </div>

                            {/* Price info */}
                            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm">Total Cost</span>
                                    <span className="font-bold text-primary">FREE (0 ETH)</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Only gas fees apply
                                </p>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleMint}
                        disabled={!address || isMinting || loading || quantity < 1 || quantity > 50}
                        className="gap-2"
                    >
                        {isMinting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Minting...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                Mint {quantity} NFT{quantity > 1 ? "s" : ""}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default MintDialog;
