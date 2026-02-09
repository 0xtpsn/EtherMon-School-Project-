import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import {
    POKECHAIN_NFT_ADDRESS,
    POKECHAIN_MARKETPLACE_ADDRESS,
    RPC_URL,
} from "@/config/contracts";
import { fetchFromIpfs, imageUrl, metadataUrl } from "@/config/ipfs";
import PokechainNFTAbi from "@/config/abi/PokechainNFT.json";
import PokechainMarketplaceAbi from "@/config/abi/PokechainMarketplace.json";
import { MarketStatus, NFTItem } from "./useAllNFTs";

export interface AuctionDetail {
    seller: string;
    startingPrice: string;
    highestBid: string;
    highestBidder: string;
    endTime: number;
    active: boolean;
    settled: boolean;
}

export interface BidRecord {
    bidder: string;
    amount: string;
    amountWei: bigint;
    timestamp?: number;
    transactionHash: string;
    isHighest: boolean;
}

export interface NFTDetail extends NFTItem {
    auction?: AuctionDetail;
    bidHistory?: BidRecord[];
}

/**
 * Hook to fetch a single NFT's detail from the PokechainNFT contract
 * plus marketplace data (listing / auction).
 */
export function useNFTDetail(tokenId: string | undefined) {
    const [nft, setNft] = useState<NFTDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchNFT = useCallback(async () => {
        if (!tokenId) return;

        setLoading(true);
        setError(null);

        try {
            const provider = new ethers.JsonRpcProvider(RPC_URL);
            const nftContract = new ethers.Contract(
                POKECHAIN_NFT_ADDRESS,
                PokechainNFTAbi,
                provider
            );
            const marketplace = new ethers.Contract(
                POKECHAIN_MARKETPLACE_ADDRESS,
                PokechainMarketplaceAbi,
                provider
            );

            const id = parseInt(tokenId);

            // Fetch core data in parallel
            const [owner, pokemonId, tokenStatus] = await Promise.all([
                nftContract.ownerOf(id),
                nftContract.getPokemonId(id),
                marketplace.getTokenStatus(id),
            ]);

            // Parse marketplace status
            const statusCode = Number(tokenStatus[0]);
            const marketStatus: MarketStatus =
                statusCode === 1 ? "listed" : statusCode === 2 ? "auction" : "none";
            const price = ethers.formatEther(tokenStatus[1]);
            const seller = tokenStatus[2];
            const auctionEndTime = Number(tokenStatus[3]);

            const pokemonIdNum = Number(pokemonId);

            // Fetch metadata - try direct fetch first (faster), then fallback to IPFS gateway
            let metadata: any = {};
            const mdUrl = metadataUrl(pokemonIdNum);
            try {
                let response = await fetch(mdUrl, { method: "GET" });
                if (!response.ok) {
                    response = await fetchFromIpfs(mdUrl);
                }
                metadata = await response.json();
            } catch {
                console.warn(`Failed to fetch metadata for token ${tokenId}`);
            }

            const image = imageUrl(pokemonIdNum);

            // If it's an auction, fetch full auction detail
            let auctionDetail: AuctionDetail | undefined;
            if (statusCode === 2) {
                try {
                    const auction = await marketplace.getAuction(id);
                    auctionDetail = {
                        seller: auction.seller,
                        startingPrice: ethers.formatEther(auction.startingPrice),
                        highestBid: ethers.formatEther(auction.highestBid),
                        highestBidder: auction.highestBidder,
                        endTime: Number(auction.endTime),
                        active: auction.active,
                        settled: auction.settled,
                    };
                } catch (err) {
                    console.warn("Could not fetch auction detail:", err);
                }
            }

            // Fetch bid history from BidPlaced events
            // Alchemy free tier limits eth_getLogs to 10-block ranges, so we
            // scan in parallel batches of small chunks for speed.
            let bidHistory: BidRecord[] = [];
            if (statusCode === 2) {
                try {
                    const currentBlock = await provider.getBlockNumber();
                    const highestBidder = auctionDetail?.highestBidder?.toLowerCase() || "";
                    const iface = new ethers.Interface([
                        "event BidPlaced(uint256 indexed tokenId, address indexed bidder, uint256 amount)"
                    ]);
                    const topic0 = iface.getEvent("BidPlaced")!.topicHash;
                    const topic1 = ethers.zeroPadValue(ethers.toBeHex(id), 32);

                    // Build all chunk ranges (500 blocks = 50 chunks of 10)
                    const MAX_SCAN = 500;
                    const scanStart = Math.max(0, currentBlock - MAX_SCAN);
                    const chunks: { from: number; to: number }[] = [];
                    for (let end = currentBlock; end >= scanStart; end -= 10) {
                        chunks.push({ from: Math.max(end - 9, scanStart), to: end });
                    }

                    // Execute in parallel batches of 5 to avoid rate limiting
                    const allLogs: any[] = [];
                    const BATCH_SIZE = 5;
                    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
                        const batch = chunks.slice(i, i + BATCH_SIZE);
                        const results = await Promise.allSettled(
                            batch.map(({ from, to }) =>
                                provider.getLogs({
                                    address: POKECHAIN_MARKETPLACE_ADDRESS,
                                    topics: [topic0, topic1],
                                    fromBlock: from,
                                    toBlock: to,
                                })
                            )
                        );
                        for (const r of results) {
                            if (r.status === "fulfilled" && r.value.length > 0) {
                                allLogs.push(...r.value);
                            }
                        }
                    }

                    bidHistory = allLogs.map((log) => {
                        const parsed = iface.parseLog(log);
                        const bidder = parsed!.args[1];
                        const amount = parsed!.args[2];
                        return {
                            bidder,
                            amount: ethers.formatEther(amount),
                            amountWei: amount,
                            transactionHash: log.transactionHash,
                            isHighest: bidder.toLowerCase() === highestBidder,
                        };
                    });
                } catch (err) {
                    console.warn("Could not fetch bid history:", err);
                }
            }

            const nftDetail: NFTDetail = {
                tokenId: id,
                pokemonId: pokemonIdNum,
                name: metadata.name || `Pokémon #${pokemonId}`,
                image,
                description: metadata.description || "",
                attributes: metadata.attributes || [],
                owner,
                marketStatus,
                price,
                seller,
                auctionEndTime,
                auction: auctionDetail,
                bidHistory,
            };

            setNft(nftDetail);
        } catch (err: any) {
            console.error("Failed to fetch NFT detail:", err);
            setError(err.message || "Failed to load NFT details");
        } finally {
            setLoading(false);
        }
    }, [tokenId]);

    useEffect(() => {
        fetchNFT();
    }, [fetchNFT]);

    return { nft, loading, error, refetch: fetchNFT };
}
