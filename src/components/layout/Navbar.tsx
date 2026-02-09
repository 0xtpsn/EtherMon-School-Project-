import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Search, Wallet, Sun, Moon, Menu, Compass, LogOut, AlertTriangle, User, Sparkles, Tag, Bell, BookOpen } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "@/components/theme-provider";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useWallet } from "@/context/WalletContext";
import WalletSelectorDialog from "@/components/wallet/WalletSelectorDialog";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { MintDialog } from "@/components/nft/MintDialog";
import { ListNFTDialog } from "@/components/nft/ListNFTDialog";

/** Truncate an Ethereum address: 0x1234…abcd */
const truncateAddress = (addr: string) =>
  `${addr.slice(0, 6)}…${addr.slice(-4)}`;

const Navbar = () => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { address, isConnecting, isCorrectNetwork, disconnect, switchToSepolia, setShowSelector } = useWallet();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mintDialogOpen, setMintDialogOpen] = useState(false);
  const [listDialogOpen, setListDialogOpen] = useState(false);

  return (
    <>
      <WalletSelectorDialog />
      <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center">
            <span className="text-2xl font-black tracking-tight text-foreground">
              ETHERMON
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" className="hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black">
                <Compass className="w-4 h-4 mr-2" />
                Discover
              </Button>
            </Link>
            <Link to="/search">
              <Button variant="ghost" className="hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black">
                <Search className="w-4 h-4 mr-2" />
                Search
              </Button>
            </Link>

            {address ? (
              <>
                {/* Wrong network warning */}
                {!isCorrectNetwork && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={switchToSepolia}
                    className="gap-2"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Switch to Sepolia
                  </Button>
                )}

                {/* Mint Button */}
                <Button
                  variant="ghost"
                  className="hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black gap-2"
                  onClick={() => setMintDialogOpen(true)}
                >
                  <Sparkles className="w-4 h-4" />
                  Mint
                </Button>

                {/* List Button */}
                <Button
                  variant="ghost"
                  className="hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black gap-2"
                  onClick={() => setListDialogOpen(true)}
                >
                  <Tag className="w-4 h-4" />
                  List
                </Button>

                {/* Notification Bell */}
                <NotificationBell />

                {/* Wallet dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="border-foreground/30 gap-2 font-mono text-sm"
                    >
                      <Wallet className="w-4 h-4" />
                      {truncateAddress(address)}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuItem className="font-mono text-xs text-muted-foreground cursor-default">
                      {address}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => navigate("/profile")}
                    >
                      <User className="mr-2 h-4 w-4" />
                      <span>My Profile</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => navigate("/documentation")}
                    >
                      <BookOpen className="mr-2 h-4 w-4" />
                      <span>Documentation</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    >
                      {theme === "dark" ? (
                        <Sun className="mr-2 h-4 w-4" />
                      ) : (
                        <Moon className="mr-2 h-4 w-4" />
                      )}
                      <span>{theme === "dark" ? "Light" : "Dark"} Mode</span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="cursor-pointer text-destructive"
                      onClick={disconnect}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Disconnect</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="border-foreground text-foreground hover:bg-foreground hover:text-background gap-2"
                  onClick={() => setShowSelector(true)}
                  disabled={isConnecting}
                >
                  <Wallet className="w-4 h-4" />
                  {isConnecting ? "Connecting..." : "Connect Wallet"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  title="Toggle theme"
                >
                  {theme === "dark" ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  )}
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu */}
          <div className="flex md:hidden items-center gap-1">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Menu className="h-6 w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <div className="flex flex-col gap-4 mt-8">
                  <Link to="/" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" className="w-full justify-start hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black">
                      <Compass className="w-4 h-4 mr-2" />
                      Discover
                    </Button>
                  </Link>
                  <Link to="/search" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" className="w-full justify-start hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black">
                      <Search className="w-4 h-4 mr-2" />
                      Search
                    </Button>
                  </Link>

                  {address ? (
                    <>
                      <div className="px-4 py-2 bg-muted rounded-md">
                        <p className="text-xs text-muted-foreground">Connected</p>
                        <p className="font-mono text-sm truncate">{truncateAddress(address)}</p>
                      </div>

                      <Link to="/profile" onClick={() => setMobileMenuOpen(false)}>
                        <Button variant="ghost" className="w-full justify-start hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black">
                          <User className="w-4 h-4 mr-2" />
                          My Profile
                        </Button>
                      </Link>

                      <Link to="/documentation" onClick={() => setMobileMenuOpen(false)}>
                        <Button variant="ghost" className="w-full justify-start hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black">
                          <BookOpen className="w-4 h-4 mr-2" />
                          Documentation
                        </Button>
                      </Link>

                      {!isCorrectNetwork && (
                        <Button
                          variant="destructive"
                          className="w-full gap-2"
                          onClick={() => {
                            switchToSepolia();
                            setMobileMenuOpen(false);
                          }}
                        >
                          <AlertTriangle className="w-4 h-4" />
                          Switch to Sepolia
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => {
                          setTheme(theme === "dark" ? "light" : "dark");
                          setMobileMenuOpen(false);
                        }}
                      >
                        {theme === "dark" ? (
                          <Sun className="mr-2 h-4 w-4" />
                        ) : (
                          <Moon className="mr-2 h-4 w-4" />
                        )}
                        {theme === "dark" ? "Light" : "Dark"} Mode
                      </Button>

                      <Button
                        variant="ghost"
                        className="w-full justify-start text-destructive"
                        onClick={() => {
                          disconnect();
                          setMobileMenuOpen(false);
                        }}
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        className="w-full border-foreground text-foreground hover:bg-foreground hover:text-background gap-2"
                        onClick={() => {
                          setShowSelector(true);
                          setMobileMenuOpen(false);
                        }}
                        disabled={isConnecting}
                      >
                        <Wallet className="w-4 h-4" />
                        {isConnecting ? "Connecting..." : "Connect Wallet"}
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => {
                          setTheme(theme === "dark" ? "light" : "dark");
                          setMobileMenuOpen(false);
                        }}
                      >
                        {theme === "dark" ? (
                          <Sun className="mr-2 h-4 w-4" />
                        ) : (
                          <Moon className="mr-2 h-4 w-4" />
                        )}
                        {theme === "dark" ? "Light" : "Dark"} Mode
                      </Button>
                    </>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>

      {/* Dialogs */}
      <MintDialog
        open={mintDialogOpen}
        onOpenChange={setMintDialogOpen}
      />
      <ListNFTDialog
        open={listDialogOpen}
        onOpenChange={setListDialogOpen}
      />
    </>
  );
};

export default Navbar;
