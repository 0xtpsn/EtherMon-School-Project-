import { useEffect, useRef } from "react";
import { ethers } from "ethers";
import { useWallet } from "@/context/WalletContext";
import {
    POKECHAIN_NFT_ADDRESS,
    POKECHAIN_MARKETPLACE_ADDRESS,
    RPC_URL,
} from "@/config/contracts";
import { localNotifications } from "@/services/localNotifications";

const LAST_CHECK_KEY = "ethermon_sale_check_block";

/**
 * Lightweight hook that checks if any of the connected user's NFTs
 * were sold since the last time they opened the app.
 *
 * Uses alchemy_getAssetTransfers to find recent outbound ERC-721
 * transfers through the marketplace contract.
 */
export function useSaleChecker() {
    const { address } = useWallet();
    const checkedRef = useRef(false);

    useEffect(() => {
        if (!address || checkedRef.current) return;
        checkedRef.current = true;

        const check = async () => {
            try {
                const provider = new ethers.JsonRpcProvider(RPC_URL);
                const lastBlock = localStorage.getItem(`${LAST_CHECK_KEY}_${address.toLowerCase()}`);
                const fromBlockHex = lastBlock
                    ? `0x${(parseInt(lastBlock) + 1).toString(16)}`
                    : `0x${(await provider.getBlockNumber() - 5000).toString(16)}`; // default: last ~5000 blocks

                // Get outbound ERC-721 transfers FROM this wallet
                const response = await fetch(RPC_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: 1,
                        jsonrpc: "2.0",
                        method: "alchemy_getAssetTransfers",
                        params: [{
                            fromBlock: fromBlockHex,
                            fromAddress: address,
                            contractAddresses: [POKECHAIN_NFT_ADDRESS],
                            category: ["erc721"],
                            order: "desc",
                            withMetadata: true,
                            maxCount: "0x32", // up to 50
                        }],
                    }),
                });

                const data = await response.json();
                const transfers = data?.result?.transfers || [];

                if (transfers.length === 0) return;

                // Check which transfers went through the marketplace contract (= sales)
                // Limit to first 5 to avoid excessive RPC calls
                const MARKETPLACE_LOWER = POKECHAIN_MARKETPLACE_ADDRESS.toLowerCase();

                for (const tx of transfers.slice(0, 5)) {
                    const txHash = tx.hash;
                    // Skip if already notified
                    const saleNotifKey = `ethermon_sale_notified_${txHash}`;
                    if (localStorage.getItem(saleNotifKey)) continue;

                    try {
                        const txData = await provider.getTransaction(txHash);
                        if (txData?.to?.toLowerCase() === MARKETPLACE_LOWER) {
                            // This was a marketplace sale
                            const tokenIdHex = tx.tokenId || tx.erc721TokenId;
                            const tokenId = tokenIdHex ? parseInt(tokenIdHex, 16) : 0;
                            const priceWei = txData.value;
                            const priceEth = ethers.formatEther(priceWei);

                            localStorage.setItem(saleNotifKey, "1");
                            localNotifications.notifySale(
                                tokenId,
                                parseFloat(priceEth) > 0 ? priceEth : "?"
                            );
                        }
                    } catch { /* skip individual tx lookups */ }
                }

                // Update last checked block
                const latestBlock = await provider.getBlockNumber();
                localStorage.setItem(
                    `${LAST_CHECK_KEY}_${address.toLowerCase()}`,
                    latestBlock.toString()
                );
            } catch (err) {
                console.warn("Sale checker error:", err);
            }
        };

        // Delay 10s to avoid competing with page-load RPC calls
        const timer = setTimeout(check, 10_000);
        return () => clearTimeout(timer);
    }, [address]);
}
