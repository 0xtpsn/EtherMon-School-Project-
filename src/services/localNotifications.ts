/**
 * Local notification service using localStorage
 * Handles notifications for both blockchain and non-blockchain events
 */

export interface LocalNotification {
    id: string;
    title: string;
    message: string;
    type: "mint" | "list" | "buy" | "bid" | "auction" | "like" | "sale" | "outbid" | "info";
    tokenId?: number;
    timestamp: number;
    isRead: boolean;
}

const STORAGE_KEY = "ethermon_notifications";
const MAX_NOTIFICATIONS = 50;

// Event listeners for real-time updates
type Listener = () => void;
const listeners: Set<Listener> = new Set();

export const localNotifications = {
    /**
     * Get all notifications from localStorage
     */
    getAll(): LocalNotification[] {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    },

    /**
     * Get unread count
     */
    getUnreadCount(): number {
        return this.getAll().filter((n) => !n.isRead).length;
    },

    /**
     * Add a new notification
     */
    add(notification: Omit<LocalNotification, "id" | "timestamp" | "isRead">): void {
        const notifications = this.getAll();
        const newNotification: LocalNotification = {
            ...notification,
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            isRead: false,
        };

        // Add to beginning (newest first)
        notifications.unshift(newNotification);

        // Keep only the last MAX_NOTIFICATIONS
        const trimmed = notifications.slice(0, MAX_NOTIFICATIONS);

        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        this.notifyListeners();
    },

    /**
     * Mark a notification as read
     */
    markRead(id: string): void {
        const notifications = this.getAll();
        const updated = notifications.map((n) =>
            n.id === id ? { ...n, isRead: true } : n
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        this.notifyListeners();
    },

    /**
     * Mark all notifications as read
     */
    markAllRead(): void {
        const notifications = this.getAll();
        const updated = notifications.map((n) => ({ ...n, isRead: true }));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        this.notifyListeners();
    },

    /**
     * Clear all notifications
     */
    clear(): void {
        localStorage.removeItem(STORAGE_KEY);
        this.notifyListeners();
    },

    /**
     * Subscribe to notification changes
     */
    subscribe(listener: Listener): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    },

    /**
     * Notify all listeners of changes
     */
    notifyListeners(): void {
        listeners.forEach((listener) => listener());
    },

    // ─────────────────────────────────────────────────────────
    // Helper methods for common notification types
    // ─────────────────────────────────────────────────────────

    /**
     * Notify successful mint
     */
    notifyMint(quantity: number, tokenIds?: number[]): void {
        this.add({
            title: "NFT Minted! 🎉",
            message:
                quantity === 1
                    ? `Your Pokémon NFT has been minted successfully!`
                    : `You minted ${quantity} Pokémon NFTs!`,
            type: "mint",
            tokenId: tokenIds?.[0],
        });
    },

    /**
     * Notify successful listing
     */
    notifyListed(tokenId: number, price: string): void {
        this.add({
            title: "NFT Listed! 🏷️",
            message: `Your NFT #${tokenId} is now listed for ${price} ETH`,
            type: "list",
            tokenId,
        });
    },

    /**
     * Notify successful auction creation
     */
    notifyAuctionCreated(tokenId: number, startPrice: string, duration: string): void {
        this.add({
            title: "Auction Started! 🔨",
            message: `Auction for NFT #${tokenId} started at ${startPrice} ETH for ${duration}`,
            type: "auction",
            tokenId,
        });
    },

    /**
     * Notify successful purchase
     */
    notifyPurchase(tokenId: number, price: string): void {
        this.add({
            title: "NFT Purchased! 🎊",
            message: `You bought NFT #${tokenId} for ${price} ETH`,
            type: "buy",
            tokenId,
        });
    },

    /**
     * Notify successful bid
     */
    notifyBid(tokenId: number, amount: string): void {
        this.add({
            title: "Bid Placed! 💰",
            message: `You bid ${amount} ETH on NFT #${tokenId}`,
            type: "bid",
            tokenId,
        });
    },

    /**
     * Notify when you win an auction
     */
    notifyAuctionWon(tokenId: number, amount: string): void {
        this.add({
            title: "Auction Won! 🏆",
            message: `You won NFT #${tokenId} for ${amount} ETH`,
            type: "sale",
            tokenId,
        });
    },

    /**
     * Notify sale (as seller)
     */
    notifySale(tokenId: number, price: string): void {
        this.add({
            title: "NFT Sold! 💵",
            message: `Your NFT #${tokenId} sold for ${price} ETH`,
            type: "sale",
            tokenId,
        });
    },

    /**
     * Notify when outbid
     */
    notifyOutbid(tokenId: number): void {
        this.add({
            title: "You've been outbid! ⚠️",
            message: `Someone placed a higher bid on NFT #${tokenId}`,
            type: "outbid",
            tokenId,
        });
    },

    /**
     * Notify when someone bids on your auction (for sellers)
     */
    notifyNewBid(tokenId: number, bidder: string, amount: string): void {
        const shortAddr = `${bidder.slice(0, 6)}...${bidder.slice(-4)}`;
        this.add({
            title: "New Bid Received! 🔔",
            message: `${shortAddr} bid ${amount} ETH on your NFT #${tokenId}`,
            type: "bid",
            tokenId,
        });
    },
};
