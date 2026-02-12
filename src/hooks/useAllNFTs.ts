import { useEffect, useState, useCallback, useRef } from "react";
import { ethers } from "ethers";
import {
    POKECHAIN_NFT_ADDRESS,
    POKECHAIN_MARKETPLACE_ADDRESS,
    RPC_URL,
} from "@/config/contracts";
import { fetchFromIpfs, imageUrl, metadataUrl } from "@/config/ipfs";
import PokechainNFTAbi from "@/config/abi/PokechainNFT.json";
import PokechainMarketplaceAbi from "@/config/abi/PokechainMarketplace.json";

export type MarketStatus = "none" | "listed" | "auction";

export interface NFTItem {
    tokenId: number;
    pokemonId: number;
    name: string;
    image: string;
    description: string;
    attributes: { trait_type: string; value: string | number }[];
    owner: string;
    // Marketplace status
    marketStatus: MarketStatus;
    price: string; // in ETH
    seller: string;
    auctionEndTime: number; // unix timestamp, 0 if not auction
}

/**
 * Hook to fetch ALL minted NFTs from the PokechainNFT contract.
 *
 * Strategy: fetch RPC data in batches of 10, then stream metadata
 * via IPFS race (all gateways simultaneously). Cards appear progressively.
 */
export function useAllNFTs() {
    const [nfts, setNfts] = useState<NFTItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const refetch = useCallback(() => {
        setRefreshTrigger((prev) => prev + 1);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const fetchAllNFTs = async () => {
            setLoading(true);
            setError(null);
            setNfts([]);

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

                const totalSupply = Number(await nftContract.totalSupply());

                if (totalSupply === 0) {
                    if (!cancelled) {
                        setNfts([]);
                        setLoading(false);
                    }
                    return;
                }

                // Process in batches of 10 — each batch streams results to UI
                const BATCH = 10;
                const allResults: NFTItem[] = [];

                for (let start = 0; start < totalSupply && !cancelled; start += BATCH) {
                    const end = Math.min(start + BATCH, totalSupply);
                    const batchPromises = [];

                    for (let i = start; i < end; i++) {
                        batchPromises.push(fetchSingleNFT(nftContract, marketplace, i));
                    }

                    const batchResults = await Promise.all(batchPromises);
                    const validResults = batchResults.filter(Boolean) as NFTItem[];
                    allResults.push(...validResults);

                    // Stream results to UI as each batch completes
                    if (!cancelled) {
                        setNfts([...allResults]);
                    }
                }

                if (!cancelled) {
                    setNfts(allResults);
                }
            } catch (err: any) {
                console.error("Failed to fetch all NFTs:", err);
                if (!cancelled) {
                    setError(err.message || "Failed to load NFTs");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchAllNFTs();
        return () => { cancelled = true; };
    }, [refreshTrigger]);

    // // Auto-refresh when marketplace events fire (listings, auctions, bids, etc.)
    // useMarketplaceEventRefresh(refetch);

    return { nfts, loading, error, refetch };
}

// /**
//  * Marketplace event names that indicate the homepage data is stale.
//  */
// const MARKETPLACE_EVENTS = [
//     "ItemListed",
//     "ItemSold",
//     "ListingCancelled",
//     "ListingUpdated",
//     "AuctionCreated",
//     "BidPlaced",
//     "AuctionEnded",
//     "AuctionCancelled"
// ];

// /**
//  * Hook to subscribe to marketplace events and auto-refetch NFTs.
//  * Used internally by useAllNFTs — split out for clarity.
//  */
// function useMarketplaceEventRefresh(refetch: () => void) {
//     const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

//     useEffect(() => {
//         const provider = new ethers.JsonRpcProvider(RPC_URL);
//         const marketplace = new ethers.Contract(
//             POKECHAIN_MARKETPLACE_ADDRESS,
//             PokechainMarketplaceAbi,
//             provider
//         );

//         // Debounce so multiple events in one tx don't cause multiple refetches
//         const debouncedRefetch = () => {
//             clearTimeout(timeoutRef.current);
//             timeoutRef.current = setTimeout(() => {
//                 console.log("[useAllNFTs] Marketplace event detected — refreshing");
//                 refetch();
//             }, 2000);
//         };

//         MARKETPLACE_EVENTS.forEach((event) => marketplace.on(event, debouncedRefetch));

//         return () => {
//             MARKETPLACE_EVENTS.forEach((event) => marketplace.off(event, debouncedRefetch));
//             clearTimeout(timeoutRef.current);
//             provider.destroy();
//         };
//     }, [refetch]);
// }

async function fetchSingleNFT(
    nftContract: ethers.Contract,
    marketplace: ethers.Contract,
    tokenId: number
): Promise<NFTItem | null> {
    try {
        // RPC calls — fast with Alchemy
        const [owner, pokemonId, tokenStatus] = await Promise.all([
            nftContract.ownerOf(tokenId),
            nftContract.getPokemonId(tokenId),
            marketplace.getTokenStatus(tokenId),
        ]);

        const statusCode = Number(tokenStatus[0]);
        const marketStatus: MarketStatus =
            statusCode === 1 ? "listed" : statusCode === 2 ? "auction" : "none";
        const price = ethers.formatEther(tokenStatus[1]);
        const seller = tokenStatus[2];
        const auctionEndTime = Number(tokenStatus[3]);
        const pokemonIdNum = Number(pokemonId);

        // Build image URL directly — no IPFS fetch needed for the image
        const image = imageUrl(pokemonIdNum);

        // Fetch metadata from Lighthouse (direct URL — most reliable)
        let name = `Pokémon #${pokemonIdNum}`;
        let description = "";
        let attributes: { trait_type: string; value: string | number }[] = [];

        const mdUrl = metadataUrl(pokemonIdNum);
        try {
            let response = await fetch(mdUrl, { method: "GET" });
            if (!response.ok) {
                response = await fetchFromIpfs(mdUrl);
            }
            const metadata = await response.json();
            name = metadata.name || name;
            description = metadata.description || "";
            attributes = metadata.attributes || [];
        } catch {
            // Metadata fetch failed — card still shows with image + pokemonId
        }

        return {
            tokenId,
            pokemonId: pokemonIdNum,
            name,
            image,
            description,
            attributes,
            owner,
            marketStatus,
            price,
            seller,
            auctionEndTime,
        };
    } catch (err) {
        console.warn(`Failed to fetch token ${tokenId}:`, err);
        return null;
    }
}
