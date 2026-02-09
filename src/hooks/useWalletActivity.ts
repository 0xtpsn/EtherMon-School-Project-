import { useState, useCallback } from "react";
import { ethers } from "ethers";
import {
    POKECHAIN_NFT_ADDRESS,
    POKECHAIN_MARKETPLACE_ADDRESS,
    RPC_URL,
} from "@/config/contracts";
import { imageUrl, metadataUrl, fetchFromIpfs } from "@/config/ipfs";
import PokechainNFTAbi from "@/config/abi/PokechainNFT.json";

export type ActivityType =
    | "mint"
    | "transfer"
    | "listed"
    | "listing_cancelled"
    | "listing_updated"
    | "sold"
    | "bought"
    | "bid"
    | "auction_created"
    | "auction_won"
    | "auction_cancelled";

export interface ActivityItem {
    id: string;
    type: ActivityType;
    tokenId: number;
    nftName: string;
    nftImage: string;
    price: string;
    from: string;
    to: string;
    timestamp: number;
    blockNumber: number;
    txHash: string;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Use Alchemy's alchemy_getAssetTransfers API for fast transfer history.
 * This avoids the eth_getLogs block-range limit on Alchemy free tier.
 */
async function getAlchemyTransfers(
    address: string,
    direction: "from" | "to"
): Promise<any[]> {
    const params: any = {
        contractAddresses: [POKECHAIN_NFT_ADDRESS],
        category: ["erc721"],
        order: "desc",
        maxCount: "0x64", // last 100 transfers
        withMetadata: true,
    };

    if (direction === "from") {
        params.fromAddress = address;
    } else {
        params.toAddress = address;
    }

    const response = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            id: 1,
            jsonrpc: "2.0",
            method: "alchemy_getAssetTransfers",
            params: [params],
        }),
    });

    const data = await response.json();
    return data?.result?.transfers || [];
}

export function useWalletActivity(walletAddress: string | null | undefined) {
    const [activities, setActivities] = useState<ActivityItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchActivity = useCallback(async () => {
        if (!walletAddress) {
            setActivities([]);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const provider = new ethers.JsonRpcProvider(RPC_URL);
            const nftContract = new ethers.Contract(
                POKECHAIN_NFT_ADDRESS,
                PokechainNFTAbi,
                provider
            );

            const addr = walletAddress.toLowerCase();
            const MARKETPLACE_LOWER = POKECHAIN_MARKETPLACE_ADDRESS.toLowerCase();

            // --- Metadata cache ---
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

            // --- Fetch transfers using Alchemy API (fast, no block-range limit) ---
            const [inbound, outbound] = await Promise.all([
                getAlchemyTransfers(addr, "to"),
                getAlchemyTransfers(addr, "from"),
            ]);

            const seenIds = new Set<string>();
            const items: ActivityItem[] = [];

            // Collect raw transfer data
            interface RawTransfer {
                txHash: string;
                from: string;
                to: string;
                tokenId: number;
                blockNum: number;
                timestamp: number;
                direction: "in" | "out";
                value: string;
            }
            const rawTransfers: RawTransfer[] = [];

            const parseTransfer = (tx: any, direction: "in" | "out") => {
                const txHash = tx.hash as string;
                const tokenIdHex = tx.tokenId || tx.erc721TokenId;
                const tokenId = tokenIdHex ? parseInt(tokenIdHex, 16) : 0;
                const blockNum = parseInt(tx.blockNum, 16);
                const id = `${txHash}-${direction}-${tokenId}`;
                if (seenIds.has(id)) return;
                seenIds.add(id);
                rawTransfers.push({
                    txHash,
                    from: (tx.from || "").toLowerCase(),
                    to: (tx.to || "").toLowerCase(),
                    tokenId,
                    blockNum,
                    timestamp: tx.metadata?.blockTimestamp
                        ? Math.floor(new Date(tx.metadata.blockTimestamp).getTime() / 1000)
                        : 0,
                    direction,
                    value: tx.value ? String(tx.value) : "",
                });
            };

            for (const tx of inbound) parseTransfer(tx, "in");
            for (const tx of outbound) parseTransfer(tx, "out");

            // Batch-fetch transaction details to check if they targeted the marketplace
            const uniqueHashes = [...new Set(rawTransfers.map((t) => t.txHash))];
            const txTargets = new Map<string, string>(); // txHash → contract called
            await Promise.all(
                uniqueHashes.map(async (hash) => {
                    try {
                        const tx = await provider.getTransaction(hash);
                        if (tx?.to) txTargets.set(hash, tx.to.toLowerCase());
                    } catch { /* skip */ }
                })
            );

            // Classify each transfer
            for (const t of rawTransfers) {
                const calledContract = txTargets.get(t.txHash) || "";
                const isMarketplaceTx = calledContract === MARKETPLACE_LOWER;

                let type: ActivityType;
                if (t.from === ZERO_ADDRESS) {
                    type = "mint";
                } else if (isMarketplaceTx && t.direction === "in") {
                    type = "bought";
                } else if (isMarketplaceTx && t.direction === "out") {
                    type = "sold";
                } else {
                    type = "transfer";
                }

                items.push({
                    id: `${t.txHash}-${t.direction}-${t.tokenId}`,
                    type,
                    tokenId: t.tokenId,
                    nftName: "",
                    nftImage: "",
                    price: t.value,
                    from: t.from,
                    to: t.to,
                    timestamp: t.timestamp,
                    blockNumber: t.blockNum,
                    txHash: t.txHash,
                });
            }

            // --- Enrich with NFT metadata ---
            const uniqueTokenIds = [...new Set(items.map((i) => i.tokenId).filter(Boolean))];
            await Promise.all(uniqueTokenIds.map((tid) => getNFTMeta(tid)));

            for (const item of items) {
                const meta = metaCache.get(item.tokenId);
                if (meta) {
                    item.nftName = meta.name;
                    item.nftImage = meta.image;
                }
            }

            items.sort((a, b) => b.blockNumber - a.blockNumber);
            setActivities(items);
        } catch (err: any) {
            console.error("Failed to fetch wallet activity:", err);
            setError(err.message || "Failed to load activity");
        } finally {
            setLoading(false);
        }
    }, [walletAddress]);

    // Lazy loading — caller must explicitly call refetch
    return { activities, loading, error, refetch: fetchActivity };
}
