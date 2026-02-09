import { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { POKECHAIN_NFT_ADDRESS, POKECHAIN_MARKETPLACE_ADDRESS, RPC_URL } from "@/config/contracts";
import PokechainNFTAbi from "@/config/abi/PokechainNFT.json";
import PokechainMarketplaceAbi from "@/config/abi/PokechainMarketplace.json";
import { NFTItem, MarketStatus } from "./useAllNFTs";
import { fetchFromIpfs, imageUrl, metadataUrl } from "@/config/ipfs";

// Re-export NFTItem for convenience
export type { NFTItem } from "./useAllNFTs";

// Legacy type for backward compatibility
export interface OwnedNFT {
    tokenId: number;
    pokemonId: number;
    name: string;
    image: string;
    description: string;
    attributes: { trait_type: string; value: string | number }[];
}

/**
 * Hook to fetch NFTs owned by a wallet address from the PokechainNFT contract.
 * Now includes marketplace status data for compatibility with ArtCard.
 *
 * Optimised: instead of calling ownerOf() for every minted token,
 * we check batches and stop early once we've found all the user's tokens.
 */
export function useOwnedNFTs(walletAddress: string | null) {
    const [nfts, setNfts] = useState<NFTItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const refetch = useCallback(() => {
        setRefreshTrigger((prev) => prev + 1);
    }, []);

    useEffect(() => {
        if (!walletAddress) {
            setNfts([]);
            return;
        }

        let cancelled = false;

        const fetchNFTs = async () => {
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

                // Get total supply and user's balance
                const [totalSupply, balance] = await Promise.all([
                    nftContract.totalSupply(),
                    nftContract.balanceOf(walletAddress),
                ]);

                const total = Number(totalSupply);
                const userBalance = Number(balance);

                if (userBalance === 0) {
                    if (!cancelled) {
                        setNfts([]);
                        setLoading(false);
                    }
                    return;
                }

                // ── Find owned token IDs efficiently ──
                // Check ownerOf in batches of 50. Stop once we've found all userBalance tokens.
                const BATCH = 50;
                const ownedTokenIds: number[] = [];

                for (let start = 0; start < total && ownedTokenIds.length < userBalance; start += BATCH) {
                    const end = Math.min(start + BATCH, total);
                    const batch = Array.from({ length: end - start }, (_, i) =>
                        nftContract.ownerOf(start + i)
                    );
                    const owners = await Promise.all(batch);

                    for (let j = 0; j < owners.length; j++) {
                        if (owners[j].toLowerCase() === walletAddress.toLowerCase()) {
                            ownedTokenIds.push(start + j);
                        }
                    }

                    if (cancelled) return;
                }

                if (cancelled) return;

                // ── Fetch metadata + marketplace status for each owned token ──
                const nftPromises = ownedTokenIds.map(async (tokenId) => {
                    try {
                        const [pokemonId, tokenStatus] = await Promise.all([
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

                        // Build image URL directly — no IPFS fetch needed for image
                        const image = imageUrl(pokemonIdNum);

                        // Try to fetch metadata for name/type/rarity
                        let name = `Pokémon #${pokemonIdNum}`;
                        let description = "";
                        let attributes: { trait_type: string; value: string | number }[] = [];

                        const mdUrl = metadataUrl(pokemonIdNum);
                        try {
                            // Use direct fetch first (faster), then fallback to IPFS gateway
                            let response = await fetch(mdUrl, { method: "GET" });
                            if (!response.ok) {
                                response = await fetchFromIpfs(mdUrl);
                            }
                            const metadata = await response.json();
                            name = metadata.name || name;
                            description = metadata.description || "";
                            attributes = metadata.attributes || [];
                        } catch {
                            // Metadata fetch failed — still show with image + pokemonId
                        }

                        return {
                            tokenId,
                            pokemonId: pokemonIdNum,
                            name,
                            image,
                            description,
                            attributes,
                            owner: walletAddress,
                            marketStatus,
                            price,
                            seller,
                            auctionEndTime,
                        } as NFTItem;
                    } catch (err) {
                        console.warn(`Failed to fetch metadata for token ${tokenId}:`, err);
                        return {
                            tokenId,
                            pokemonId: 0,
                            name: `Token #${tokenId}`,
                            image: "",
                            description: "",
                            attributes: [],
                            owner: walletAddress,
                            marketStatus: "none" as MarketStatus,
                            price: "0",
                            seller: "",
                            auctionEndTime: 0,
                        } as NFTItem;
                    }
                });

                const results = await Promise.all(nftPromises);

                if (!cancelled) {
                    setNfts(results);
                }
            } catch (err: any) {
                console.error("Failed to fetch owned NFTs:", err);
                if (!cancelled) {
                    setError(err.message || "Failed to load NFTs");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        fetchNFTs();

        return () => {
            cancelled = true;
        };
    }, [walletAddress, refreshTrigger]);

    return { nfts, loading, error, refetch };
}
