import { useEffect, useState, useCallback } from "react";
import { Bell, Sparkles, Tag, ShoppingCart, Gavel, Heart, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { notificationsApi, NotificationItem } from "@/api/notifications";
import { useWallet } from "@/context/WalletContext";
import { localNotifications, LocalNotification } from "@/services/localNotifications";
import { useSaleChecker } from "@/hooks/useSaleChecker";
import { useBidChecker } from "@/hooks/useBidChecker";

const getIcon = (notification: NotificationItem | LocalNotification) => {
  // Check title for type hints
  const title = notification.title.toLowerCase();

  if (title.includes("liked")) {
    return <Heart className="w-4 h-4 text-red-500" />;
  }
  if (title.includes("mint")) {
    return <Sparkles className="w-4 h-4 text-primary" />;
  }
  if (title.includes("list")) {
    return <Tag className="w-4 h-4 text-blue-500" />;
  }
  if (title.includes("purchase") || title.includes("sold") || title.includes("bought")) {
    return <ShoppingCart className="w-4 h-4 text-green-500" />;
  }
  if (title.includes("bid") || title.includes("auction")) {
    return <Gavel className="w-4 h-4 text-purple-500" />;
  }
  if (title.includes("outbid")) {
    return <AlertCircle className="w-4 h-4 text-orange-500" />;
  }
  return <Bell className="w-4 h-4 text-muted-foreground" />;
};

interface CombinedNotification {
  id: string;
  title: string;
  message: string;
  tokenId?: number;
  fromWallet?: string;
  isRead: boolean;
  timestamp: number;
  source: "backend" | "local";
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<CombinedNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const { address } = useWallet();

  // Check for sales and bids since last visit
  useSaleChecker();
  useBidChecker();

  // Combine backend and local notifications
  const loadNotifications = useCallback(async () => {
    const combined: CombinedNotification[] = [];

    // Load backend notifications if wallet is connected
    if (address) {
      try {
        const data = await notificationsApi.listByWallet(address);
        for (const n of data.notifications) {
          combined.push({
            id: `backend-${n.id}`,
            title: n.title,
            message: n.message,
            tokenId: n.token_id || undefined,
            fromWallet: n.from_wallet || undefined,
            isRead: n.is_read === 1,
            timestamp: new Date(n.created_at).getTime(),
            source: "backend",
          });
        }
      } catch (err) {
        // Backend might be offline - that's okay, we'll show local notifications
      }
    }

    // Load local notifications
    const localNotifs = localNotifications.getAll();
    for (const n of localNotifs) {
      combined.push({
        id: `local-${n.id}`,
        title: n.title,
        message: n.message,
        tokenId: n.tokenId,
        isRead: n.isRead,
        timestamp: n.timestamp,
        source: "local",
      });
    }

    // Sort by timestamp (newest first)
    combined.sort((a, b) => b.timestamp - a.timestamp);

    // Dedupe by similar title and timestamp (within 5 seconds)
    const deduped: CombinedNotification[] = [];
    for (const n of combined) {
      const isDupe = deduped.some(
        (existing) =>
          existing.title === n.title &&
          Math.abs(existing.timestamp - n.timestamp) < 5000
      );
      if (!isDupe) {
        deduped.push(n);
      }
    }

    setNotifications(deduped.slice(0, 20));
    setUnreadCount(deduped.filter((n) => !n.isRead).length);
  }, [address]);

  // Load notifications on mount and when wallet changes
  useEffect(() => {
    loadNotifications();

    // Subscribe to local notification changes
    const unsubscribe = localNotifications.subscribe(loadNotifications);

    // Poll backend every 30 seconds
    const interval = setInterval(loadNotifications, 30000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [loadNotifications]);

  const handleNotificationClick = async (notification: CombinedNotification) => {
    // Mark as read
    if (!notification.isRead) {
      if (notification.source === "backend" && address) {
        const id = parseInt(notification.id.replace("backend-", ""));
        await notificationsApi.markReadByWallet(address, [id]);
      } else if (notification.source === "local") {
        const id = notification.id.replace("local-", "");
        localNotifications.markRead(id);
      }
    }

    // Navigate based on notification type
    if (notification.fromWallet) {
      // Like notification - go to liker's profile
      navigate(`/profile/${notification.fromWallet}`);
    } else if (notification.tokenId) {
      // NFT-related notification - go to NFT detail
      navigate(`/nft/${notification.tokenId}`);
    }

    // Refresh notifications
    loadNotifications();
  };

  const markAllAsRead = async () => {
    // Mark local notifications as read
    localNotifications.markAllRead();

    // Mark backend notifications as read
    if (address) {
      const backendIds = notifications
        .filter((n) => n.source === "backend" && !n.isRead)
        .map((n) => parseInt(n.id.replace("backend-", "")));

      if (backendIds.length > 0) {
        await notificationsApi.markReadByWallet(address, backendIds);
      }
    }

    loadNotifications();
  };

  const getTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "Just now";
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={markAllAsRead}
              className="text-xs"
            >
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "p-4 hover:bg-muted/50 cursor-pointer transition-colors",
                    !notification.isRead && "bg-primary/5"
                  )}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getIcon(notification as any)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-none">
                          {notification.title}
                        </p>
                        {!notification.isRead && (
                          <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {getTimeAgo(notification.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
