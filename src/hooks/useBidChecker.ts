import { useEffect, useRef } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/context/WalletContext";
import {
    POKECHAIN_MARKETPLACE_ADDRESS,
    RPC_URL,
} from "@/config/contracts";
import PokechainMarketplaceAbi from "@/config/abi/PokechainMarketplace.json";
import { localNotifications } from "@/services/localNotifications";

const LAST_BID_CHECK_KEY = "ethermon_bid_check_block";

/**
 * Hook that checks for new bids on the connected user's active auctions.
 * Queries BidPlaced events since the last check and notifies the seller.
 * Runs once on app load with a delay to avoid RPC rate limiting.
 */
export function useBidChecker() {
    const { address } = useWallet();
    const checkedRef = useRef(false);

    useEffect(() => {
        if (!address || checkedRef.current) return;
        checkedRef.current = true;

        const check = async () => {
            try {
                const provider = new ethers.JsonRpcProvider(RPC_URL);
                const marketplace = new ethers.Contract(
                    POKECHAIN_MARKETPLACE_ADDRESS,
                    PokechainMarketplaceAbi,
                    provider
                );

                const lastBlock = localStorage.getItem(
                    `${LAST_BID_CHECK_KEY}_${address.toLowerCase()}`
                );
                const currentBlock = await provider.getBlockNumber();

                // Default: check last ~500 blocks
                const fromBlock = lastBlock
                    ? parseInt(lastBlock) + 1
                    : currentBlock - 500;

                // Alchemy free tier limits eth_getLogs to 10-block ranges
                // Scan in parallel batches for speed
                const iface = new ethers.Interface([
                    "event BidPlaced(uint256 indexed tokenId, address indexed bidder, uint256 amount)"
                ]);
                const topic0 = iface.getEvent("BidPlaced")!.topicHash;

                const chunks: { from: number; to: number }[] = [];
                for (let end = currentBlock; end >= fromBlock; end -= 10) {
                    chunks.push({ from: Math.max(end - 9, fromBlock), to: end });
                }

                const allLogs: any[] = [];
                const BATCH_SIZE = 5;
                for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
                    const batch = chunks.slice(i, i + BATCH_SIZE);
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
                    for (const r of results) {
                        if (r.status === "fulfilled" && r.value.length > 0) {
                            allLogs.push(...r.value);
                        }
                    }
                }

                if (allLogs.length === 0) {
                    localStorage.setItem(
                        `${LAST_BID_CHECK_KEY}_${address.toLowerCase()}`,
                        currentBlock.toString()
                    );
                    return;
                }

                const addressLower = address.toLowerCase();

                for (const log of allLogs) {
                    const parsed = iface.parseLog(log);
                    if (!parsed) continue;
                    const tokenId = Number(parsed.args[0]);
                    const bidder = parsed.args[1] as string;
                    const amount = parsed.args[2] as bigint;

                    if (bidder.toLowerCase() === addressLower) continue;

                    const notifKey = `ethermon_bid_notified_${log.transactionHash}_${tokenId}`;
                    if (localStorage.getItem(notifKey)) continue;

                    try {
                        const auction = await marketplace.getAuction(tokenId);
                        if (auction.seller.toLowerCase() === addressLower) {
                            const amountEth = ethers.formatEther(amount);
                            localStorage.setItem(notifKey, "1");
                            localNotifications.notifyNewBid(
                                tokenId,
                                bidder,
                                parseFloat(amountEth) > 0 ? amountEth : "?"
                            );
                        }
                    } catch {
                        // Auction may have ended, skip
                    }
                }

                // Update checkpoint
                localStorage.setItem(
                    `${LAST_BID_CHECK_KEY}_${address.toLowerCase()}`,
                    currentBlock.toString()
                );
            } catch (err) {
                console.warn("Bid checker error:", err);
            }
        };

        // Delay 15s to avoid competing with page-load and sale checker RPC calls
        const timer = setTimeout(check, 15_000);
        return () => clearTimeout(timer);
    }, [address]);
}
