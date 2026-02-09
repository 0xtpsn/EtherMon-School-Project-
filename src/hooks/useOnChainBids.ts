import { useState, useCallback } from "react";
import { ethers } from "ethers";
import {
    POKECHAIN_NFT_ADDRESS,
    POKECHAIN_MARKETPLACE_ADDRESS,
    RPC_URL,
} from "@/config/contracts";
import { imageUrl, metadataUrl, fetchFromIpfs } from "@/config/ipfs";
import PokechainNFTAbi from "@/config/abi/PokechainNFT.json";
import PokechainMarketplaceAbi from "@/config/abi/PokechainMarketplace.json";

export interface OnChainBid {
    tokenId: number;
    nftName: string;
    nftImage: string;
    bidAmount: string;      // in ETH
    isHighestBidder: boolean;
    highestBid: string;     // in ETH
    auctionEndTime: number; // unix timestamp
    auctionActive: boolean;
    seller: string;
    txHash: string;
    timestamp: number;
}

/**
 * Hook to fetch a wallet's active auction bids from on-chain BidPlaced events.
 * Scans the marketplace contract's BidPlaced events for the given address,
 * then cross-references with getAuction() to check current auction state.
 */
export function useOnChainBids(walletAddress: string | null | undefined) {
    const [bids, setBids] = useState<OnChainBid[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchBids = useCallback(async () => {
        if (!walletAddress) {
            setBids([]);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const provider = new ethers.JsonRpcProvider(RPC_URL);
            const marketplace = new ethers.Contract(
                POKECHAIN_MARKETPLACE_ADDRESS,
                PokechainMarketplaceAbi,
                provider
            );
            const nftContract = new ethers.Contract(
                POKECHAIN_NFT_ADDRESS,
                PokechainNFTAbi,
                provider
            );

            // Get BidPlaced events where the bidder is this wallet, using chunked getLogs.
            // Some RPC providers reject large eth_getLogs ranges in one request.
            const currentBlock = await provider.getBlockNumber();
            const MAX_SCAN_BLOCKS = 50000;
            const fromBlock = Math.max(0, currentBlock - MAX_SCAN_BLOCKS);
            const iface = new ethers.Interface([
                "event BidPlaced(uint256 indexed tokenId, address indexed bidder, uint256 amount)"
            ]);
            const topic0 = iface.getEvent("BidPlaced")!.topicHash;
            const walletLower = walletAddress.toLowerCase();

            const CHUNK_SIZE = 2000;
            const BATCH_SIZE = 8;
            const allLogs: ethers.Log[] = [];
            const ranges: Array<{ from: number; to: number }> = [];
            for (let start = fromBlock; start <= currentBlock; start += CHUNK_SIZE) {
                ranges.push({ from: start, to: Math.min(start + CHUNK_SIZE - 1, currentBlock) });
            }

            for (let i = 0; i < ranges.length; i += BATCH_SIZE) {
                const batch = ranges.slice(i, i + BATCH_SIZE);
                const results = await Promise.allSettled(
                    batch.map(({ from, to }) =>
                        provider.getLogs({
                            address: POKECHAIN_MARKETPLACE_ADDRESS,
                            topics: [topic0],
                            fromBlock: from,
                            toBlock: to,
                        })
                    )
                );
                for (const result of results) {
                    if (result.status === "fulfilled" && result.value.length > 0) {
                        allLogs.push(...result.value);
                    }
                }
            }

            // Group by tokenId — keep only the latest bid per token
            const latestBidByToken = new Map<number, { log: ethers.Log; amount: bigint }>();
            for (const log of allLogs) {
                try {
                    const parsed = iface.parseLog(log);
                    const tokenId = Number(parsed!.args[0]);
                    const bidder = String(parsed!.args[1]).toLowerCase();
                    const amount = parsed!.args[2] as bigint;
                    if (bidder !== walletLower) continue;
                    latestBidByToken.set(tokenId, { log, amount }); // overwrite older bids for same token
                } catch {
                    // ignore unparseable logs
                }
            }

            // Cross-reference with current auction state
            const metaCache = new Map<number, { name: string; image: string }>();

            const getNFTMeta = async (tokenId: number) => {
                if (metaCache.has(tokenId)) return metaCache.get(tokenId)!;
                try {
                    const pokemonId = Number(await nftContract.getPokemonId(tokenId));
                    const img = imageUrl(pokemonId);
                    let name = `Pokémon #${pokemonId}`;
                    try {
                        const mdUrl = metadataUrl(pokemonId);
                        let response = await fetch(mdUrl);
                        if (!response.ok) response = await fetchFromIpfs(mdUrl);
                        const md = await response.json();
                        name = md.name || name;
                    } catch { /* metadata optional */ }
                    const result = { name, image: img };
                    metaCache.set(tokenId, result);
                    return result;
                } catch {
                    const result = { name: `Token #${tokenId}`, image: "" };
                    metaCache.set(tokenId, result);
                    return result;
                }
            };

            const results: OnChainBid[] = [];

            await Promise.all(
                Array.from(latestBidByToken.entries()).map(async ([tokenId, bid]) => {
                    try {
                        const bidAmount = ethers.formatEther(bid.amount);
                        const block = await provider.getBlock(bid.log.blockNumber);
                        const timestamp = block?.timestamp || 0;

                        // Check current auction state
                        const auction = await marketplace.getAuction(tokenId);
                        // returns: (seller, startingPrice, highestBid, highestBidder, endTime, active, settled)
                        const auctionActive = auction[5]; // active
                        const settled = auction[6];        // settled
                        const highestBid = ethers.formatEther(auction[2]);
                        const highestBidder = (auction[3] as string).toLowerCase();
                        const endTime = Number(auction[4]);
                        const seller = auction[0] as string;

                        // Skip fully settled auctions
                        if (settled) return;

                        const isHighestBidder = highestBidder === walletLower;

                        const meta = await getNFTMeta(tokenId);

                        // Only show bids relevant to currently open auctions.
                        if (!auctionActive) return;

                        results.push({
                            tokenId,
                            nftName: meta.name,
                            nftImage: meta.image,
                            bidAmount,
                            isHighestBidder,
                            highestBid,
                            auctionEndTime: endTime,
                            auctionActive,
                            seller,
                            txHash: bid.log.transactionHash,
                            timestamp,
                        });
                    } catch (err) {
                        console.warn(`Failed to process bid for token ${tokenId}:`, err);
                    }
                })
            );

            // Sort by most recent first
            results.sort((a, b) => b.timestamp - a.timestamp);
            setBids(results);
        } catch (err: any) {
            console.error("Failed to fetch on-chain bids:", err);
            setError(err.message || "Failed to load bids");
        } finally {
            setLoading(false);
        }
    }, [walletAddress]);

    return { bids, loading, error, refetch: fetchBids };
}
