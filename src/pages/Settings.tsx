import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import { ChangePassword } from "@/components/security/ChangePassword";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { User, Bell, CreditCard, Shield, Upload, Camera, Wallet, ArrowDownLeft, ArrowUpRight, Twitter, Instagram, Globe, Mail, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/context/SessionContext";
import { meApi } from "@/api/me";
import { uploadApi } from "@/api/uploads";
import { securityApi } from "@/api/security";
import { formatCurrency } from "@/lib/utils";
import { getRoleBioPlaceholder } from "@/lib/bioPlaceholders";

const Settings = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user, loading } = useSession();
  const [profile, setProfile] = useState<any>(null);
  const [balance, setBalance] = useState(0);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "profile");

  // Deposit/Withdrawal dialogs
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  // Profile state
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [twitterHandle, setTwitterHandle] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [showContactEmail, setShowContactEmail] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Notification state
  const [notificationEmail, setNotificationEmail] = useState(true);
  const [notificationBid, setNotificationBid] = useState(true);
  const [notificationSale, setNotificationSale] = useState(true);
  const [notificationLike, setNotificationLike] = useState(true);
  const [notificationWatchlistOutbid, setNotificationWatchlistOutbid] = useState(true);
  const [notificationWatchlistEnding, setNotificationWatchlistEnding] = useState(true);
  const [notificationAuctionSold, setNotificationAuctionSold] = useState(true);
  const savedNotificationPrefs = useRef({
    bid: true,
    sale: true,
    like: true,
    watchlistOutbid: true,
    watchlistEnding: true,
    auctionSold: true,
  });
  const notificationPrefsInitialized = useRef(false);
  const bioPlaceholder = getRoleBioPlaceholder((profile?.role as any) ?? user?.role);

  useEffect(() => {
    if (!notificationPrefsInitialized.current) {
      notificationPrefsInitialized.current = true;
      return;
    }

    if (!notificationEmail) {
      savedNotificationPrefs.current = {
        bid: notificationBid,
        sale: notificationSale,
        like: notificationLike,
        watchlistOutbid: notificationWatchlistOutbid,
        watchlistEnding: notificationWatchlistEnding,
        auctionSold: notificationAuctionSold,
      };

      setNotificationBid(false);
      setNotificationSale(false);
      setNotificationLike(false);
      setNotificationWatchlistOutbid(false);
      setNotificationWatchlistEnding(false);
      setNotificationAuctionSold(false);
    } else {
      setNotificationBid(savedNotificationPrefs.current.bid);
      setNotificationSale(savedNotificationPrefs.current.sale);
      setNotificationLike(savedNotificationPrefs.current.like);
      setNotificationWatchlistOutbid(savedNotificationPrefs.current.watchlistOutbid);
      setNotificationWatchlistEnding(savedNotificationPrefs.current.watchlistEnding);
      setNotificationAuctionSold(savedNotificationPrefs.current.auctionSold);
    }
  }, [notificationEmail]);

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
      return;
    }
    if (user) {
      fetchProfile();
      fetchBalance();
    }
  }, [user, loading, navigate]);

  const fetchProfile = async () => {
    try {
      const { profile } = await meApi.profile();
      setProfile(profile);
      setUsername(profile.username || "");
      setDisplayName(profile.display_name || "");
      setBio(profile.bio || "");
      setAvatarUrl(profile.avatar_url || "");
      setBannerUrl(profile.banner_url || "");
      setTwitterHandle(profile.twitter_handle || "");
      setInstagramHandle(profile.instagram_handle || "");
      setWebsiteUrl(profile.website_url || "");
      setContactEmail(profile.contact_email || "");
      setShowContactEmail(Boolean(profile.show_contact_email));
      setNotificationEmail(Boolean(profile.notification_email));
      setNotificationBid(Boolean(profile.notification_bid));
      setNotificationSale(Boolean(profile.notification_sale));
      setNotificationLike(Boolean(profile.notification_like));
      setNotificationWatchlistOutbid(Boolean(profile.notification_watchlist_outbid));
      setNotificationWatchlistEnding(Boolean(profile.notification_watchlist_ending));
      setNotificationAuctionSold(Boolean(profile.notification_auction_sold));
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load profile settings",
        variant: "destructive",
      });
    }
  };

  const fetchBalance = async () => {
    try {
      const { available_balance = 0 } = (await meApi.balance()) as { available_balance?: number };
      setBalance(available_balance || 0);
    } catch (error) {
      // Silently fail - balance will show 0
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (!user) return;

    try {
      const { url } = await uploadApi.upload(file);
      await meApi.updateProfile({ avatar_url: url });
      setAvatarUrl(url);
      toast({ title: "Avatar updated successfully!" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleBannerUpload = async (file: File) => {
    if (!user) return;

    try {
      const { url } = await uploadApi.upload(file);
      await meApi.updateProfile({ banner_url: url });
      setBannerUrl(url);
      toast({ title: "Banner updated successfully!" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const saveProfile = async () => {
    if (!user) return;

    try {
      await meApi.updateProfile({
        display_name: displayName,
        bio,
        twitter_handle: twitterHandle,
        instagram_handle: instagramHandle,
        website_url: websiteUrl,
        contact_email: contactEmail,
        show_contact_email: showContactEmail,
      });

      toast({ title: "Profile updated successfully!" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const saveNotifications = async () => {
    if (!user) return;

    try {
      await meApi.updateNotifications({
        notification_email: notificationEmail,
        notification_bid: notificationBid,
        notification_sale: notificationSale,
        notification_like: notificationLike,
        notification_watchlist_outbid: notificationWatchlistOutbid,
        notification_watchlist_ending: notificationWatchlistEnding,
        notification_auction_sold: notificationAuctionSold,
      });

      toast({ title: "Notification preferences saved!" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0 || !user) {
      toast({
        title: "Invalid input",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    try {
      const amount = parseFloat(depositAmount);

      await meApi.deposit(amount);
      const newBalance = (balance || 0) + amount;
      setBalance(newBalance);
      setDepositDialogOpen(false);
      setDepositAmount("");

      toast({
        title: "Deposit added!",
        description: `$${formatCurrency(amount)} added to your balance`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0 || !user) {
      toast({
        title: "Invalid input",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(withdrawAmount);

    // Check sufficient balance
    if (amount > balance) {
      toast({
        title: "Insufficient balance",
        description: "You don't have enough funds to withdraw",
        variant: "destructive",
      });
      return;
    }

    try {
      await meApi.withdraw(amount);
      const newBalance = (balance || 0) - amount;
      setWithdrawDialogOpen(false);
      setWithdrawAmount("");
      setBalance(newBalance);

      toast({
        title: "Withdrawal completed!",
        description: `$${formatCurrency(amount)} withdrawn from your balance`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-8 bg-gradient-primary bg-clip-text text-transparent">
            Settings
          </h1>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-8">
              <TabsTrigger value="profile" className="gap-2">
                <User className="w-4 h-4" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-2">
                <Bell className="w-4 h-4" />
                Notifications
              </TabsTrigger>
              <TabsTrigger value="payment" className="gap-2">
                <CreditCard className="w-4 h-4" />
                Payment
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2">
                <Shield className="w-4 h-4" />
                Security
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile">
              <Card className="bg-gradient-card border-border">
                <CardHeader>
                  <CardTitle>Profile Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Avatar & Banner */}
                  <div className="space-y-4">
                    <div>
                      <Label className="mb-2 block">Profile Picture</Label>
                      <div className="flex items-center gap-4">
                        <Avatar className="w-20 h-20">
                          <AvatarImage src={avatarUrl} />
                          <AvatarFallback><User className="w-8 h-8" /></AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleAvatarUpload(file);
                            }}
                          />
                          <Button
                            variant="outline"
                            onClick={() => avatarInputRef.current?.click()}
                            className="gap-2"
                          >
                            <Camera className="w-4 h-4" />
                            Change Avatar
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <Label className="mb-2 block">Banner Image</Label>
                      <div className="space-y-2">
                        {bannerUrl && (
                          <div className="w-full h-32 rounded-lg overflow-hidden">
                            <img src={bannerUrl} alt="Banner" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <input
                          ref={bannerInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleBannerUpload(file);
                          }}
                        />
                        <Button
                          variant="outline"
                          onClick={() => bannerInputRef.current?.click()}
                          className="gap-2"
                        >
                          <Upload className="w-4 h-4" />
                          {bannerUrl ? "Change Banner" : "Upload Banner"}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <div className="px-3 py-2 bg-secondary border border-border rounded-md text-sm text-muted-foreground">
                      {username || "Loading..."}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Username cannot be changed
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <div className="px-3 py-2 bg-secondary border border-border rounded-md text-sm">
                      <span className="capitalize font-medium">{profile?.role || user?.role || "Loading..."}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your account role
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter display name"
                      className="bg-secondary border-border"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder={bioPlaceholder}
                      className="bg-secondary border-border"
                      rows={3}
                    />
                  </div>

                  {/* Social Links */}
                  <div className="space-y-4 pt-4 border-t border-border">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Social Links</h3>
                      <TooltipProvider delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="w-4 h-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">
                              Add your social media profiles and contact information to help others connect with you.
                              These links will be displayed on your public profile.
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="twitter" className="flex items-center gap-2">
                        <Twitter className="w-4 h-4" />
                        Twitter Handle
                      </Label>
                      <Input
                        id="twitter"
                        value={twitterHandle}
                        onChange={(e) => setTwitterHandle(e.target.value)}
                        placeholder="username (without @)"
                        className="bg-secondary border-border"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="instagram" className="flex items-center gap-2">
                        <Instagram className="w-4 h-4" />
                        Instagram Handle
                      </Label>
                      <Input
                        id="instagram"
                        value={instagramHandle}
                        onChange={(e) => setInstagramHandle(e.target.value)}
                        placeholder="username (without @)"
                        className="bg-secondary border-border"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="website" className="flex items-center gap-2">
                        <Globe className="w-4 h-4" />
                        Website URL
                      </Label>
                      <Input
                        id="website"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        placeholder="https://yourwebsite.com"
                        className="bg-secondary border-border"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contactEmail" className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        Contact Email (Optional)
                      </Label>
                      <Input
                        id="contactEmail"
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="contact@example.com"
                        className="bg-secondary border-border"
                      />
                      <div className="flex items-center gap-2 pt-2">
                        <Switch
                          checked={showContactEmail}
                          onCheckedChange={setShowContactEmail}
                        />
                        <Label htmlFor="showEmail" className="text-sm cursor-pointer">
                          Show email publicly on profile
                        </Label>
                      </div>
                    </div>
                  </div>

                  <Button onClick={saveProfile} className="bg-gradient-primary hover:bg-gradient-hover">
                    Save Profile
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications">
              <Card className="bg-gradient-card border-border">
                <CardHeader>
                  <CardTitle>Notification Preferences</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Email Notifications</p>
                      <p className="text-sm text-muted-foreground">Receive updates via email</p>
                    </div>
                    <Switch
                      checked={notificationEmail}
                      onCheckedChange={setNotificationEmail}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Bid Notifications</p>
                      <p className="text-sm text-muted-foreground">Get notified when someone places a bid on your artwork</p>
                    </div>
                    <Switch
                      checked={notificationBid}
                      onCheckedChange={setNotificationBid}
                      disabled={!notificationEmail}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Sale Notifications</p>
                      <p className="text-sm text-muted-foreground">Get notified when your artwork is sold</p>
                    </div>
                    <Switch
                      checked={notificationSale}
                      onCheckedChange={setNotificationSale}
                      disabled={!notificationEmail}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Like Notifications</p>
                      <p className="text-sm text-muted-foreground">Get notified when someone likes your artwork</p>
                    </div>
                    <Switch
                      checked={notificationLike}
                      onCheckedChange={setNotificationLike}
                      disabled={!notificationEmail}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Watchlist - Outbid Notifications</p>
                      <p className="text-sm text-muted-foreground">Get notified when you're outbid on watched items</p>
                    </div>
                    <Switch
                      checked={notificationWatchlistOutbid}
                      onCheckedChange={setNotificationWatchlistOutbid}
                      disabled={!notificationEmail}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Watchlist - Auction Ending</p>
                      <p className="text-sm text-muted-foreground">Get notified when watched auctions are ending</p>
                    </div>
                    <Switch
                      checked={notificationWatchlistEnding}
                      onCheckedChange={setNotificationWatchlistEnding}
                      disabled={!notificationEmail}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Auction Sold Notifications</p>
                      <p className="text-sm text-muted-foreground">Get notified when your auction ends</p>
                    </div>
                    <Switch
                      checked={notificationAuctionSold}
                      onCheckedChange={setNotificationAuctionSold}
                      disabled={!notificationEmail}
                    />
                  </div>
                  <Button onClick={saveNotifications} className="bg-gradient-primary hover:bg-gradient-hover">
                    Save Preferences
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payment">
              <div className="space-y-6">
                {/* Balance Card */}
                <Card className="bg-gradient-card border-border">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wallet className="w-5 h-5" />
                      Your Balance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center py-6">
                      <p className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-4">
                        ${formatCurrency(balance)}
                      </p>
                      <div className="grid grid-cols-2 gap-4">
                        <Button
                          onClick={() => setDepositDialogOpen(true)}
                          className="bg-foreground text-background hover:bg-foreground/90 gap-2"
                        >
                          <ArrowDownLeft className="w-4 h-4" />
                          Deposit
                        </Button>
                        <Button
                          onClick={() => setWithdrawDialogOpen(true)}
                          variant="outline"
                          className="gap-2"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                          Withdraw
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-card border-border">
                  <CardHeader>
                    <CardTitle>How Deposits Work</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>Balances are fully managed inside Art Offchain Avenue. When you record a deposit we create a completed transaction and credit your in-app ledger immediately.</p>
                    <p>Need to add funds for real? Contact an admin and they'll adjust your balance through the internal console -- no cards or external processors involved.</p>
                    <p>Withdrawals are mirrored entirely in-app as debits. Make sure the amount matches any offline settlement you've coordinated.</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="security" className="space-y-6">
              <ChangePassword />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Deposit Dialog */}
      <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Deposit Funds</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
            <Button
              onClick={handleDeposit}
              disabled={!depositAmount}
              className="w-full bg-foreground text-background hover:bg-foreground/90"
            >
              Deposit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Withdraw Dialog */}
      <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Withdraw Funds</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
            <Button
              onClick={handleWithdraw}
              disabled={!withdrawAmount}
              className="w-full bg-foreground text-background hover:bg-foreground/90"
            >
              Withdraw
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;