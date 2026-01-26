import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
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

export function NotificationBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const data = await notificationsApi.list();
        if (isMounted) {
          setNotifications(data.notifications);
          setUnreadCount(data.unread);
        }
      } catch (error) {
        // Silently fail - notifications won't show
      }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const fetchNotifications = async () => {
    try {
      const data = await notificationsApi.list();
      setNotifications(data.notifications);
      setUnreadCount(data.unread);
    } catch (error) {
      // Silently fail - notifications won't update
    }
  };

  const markAsRead = async (id: number, artworkId: number | null) => {
    await notificationsApi.markRead([id]);
    if (artworkId) {
      navigate(`/art/${artworkId}`);
    }
    fetchNotifications();
  };

  const markAllAsRead = async () => {
    await notificationsApi.markAllRead();
    fetchNotifications();
  };

  const getTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now.getTime() - time.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
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
                    !notification.is_read && "bg-primary/5"
                  )}
                  onClick={() => markAsRead(notification.id, notification.artwork_id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {notification.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {notification.message}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <div className="h-2 w-2 rounded-full bg-primary mt-1 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {getTimeAgo(notification.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
