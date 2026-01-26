import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Search, User, Wallet, Plus, Settings, LogOut, Sun, Moon, Menu, X, Compass } from "lucide-react";
import { useState } from "react";
import AuthDialog from "@/components/auth/AuthDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTheme } from "@/components/theme-provider";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useSession } from "@/context/SessionContext";

const Navbar = () => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useSession();
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authRedirectTo, setAuthRedirectTo] = useState<string>("/");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const displayName = user?.display_name || user?.username;
  const profilePath = user ? user.username || String(user.id) : "";
  const avatarUrl = user?.avatar_url;

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-lg">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center">
          <span className="text-2xl font-black tracking-tight text-foreground">
            ARTMART
          </span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-6">
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
          {user && (
            <Link to="/balance">
              <Button variant="ghost" className="hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black">
                <Wallet className="w-4 h-4 mr-2" />
                Balance
              </Button>
            </Link>
          )}
          {user ? (
            <>
              <NotificationBell />
              {user.role === "seller" && (
                <Link to="/create">
                  <Button className="bg-foreground text-background hover:bg-foreground/90">
                    <Plus className="w-4 h-4 mr-2" />
                    Create
                  </Button>
                </Link>
              )}
            </>
          ) : (
            <>
              <Button 
                className="bg-foreground text-background hover:bg-foreground/90"
                onClick={() => {
                  setAuthRedirectTo("/create");
                  setAuthDialogOpen(true);
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create
              </Button>
              <Button 
                variant="outline" 
                className="border-foreground text-foreground hover:bg-foreground hover:text-background"
                onClick={() => {
                  setAuthRedirectTo("/");
                  setAuthDialogOpen(true);
                }}
              >
                Log In
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
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={avatarUrl || ""} alt={displayName || "Profile"} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {displayName ? displayName.charAt(0).toUpperCase() : <User className="h-5 w-5" />}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuItem asChild>
                  <Link to={`/profile/${profilePath}`} className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings" className="cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </Link>
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
                  className="cursor-pointer"
                  onClick={async () => {
                    await logout();
                    navigate("/");
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Mobile Menu */}
        <div className="flex md:hidden items-center gap-1">
          {user && <NotificationBell />}
          {user && (
            <Avatar className="h-8 w-8">
              <AvatarImage src={avatarUrl || ""} alt={displayName || "Profile"} />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {displayName ? displayName.charAt(0).toUpperCase() : <User className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
          )}
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
                {user && (
                  <Link to="/balance" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="ghost" className="w-full justify-start hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black">
                      <Wallet className="w-4 h-4 mr-2" />
                      Balance
                    </Button>
                  </Link>
                )}
                {user ? (
                  <>
                    {user.role === "seller" && (
                      <Link to="/create" onClick={() => setMobileMenuOpen(false)}>
                        <Button className="w-full bg-foreground text-background hover:bg-foreground/90">
                          <Plus className="w-4 h-4 mr-2" />
                          Create
                        </Button>
                      </Link>
                    )}
                    <Link to={`/profile/${profilePath}`} onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start">
                        <User className="mr-2 h-4 w-4" />
                        Profile
                      </Button>
                    </Link>
                    <Link to="/settings" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="ghost" className="w-full justify-start">
                        <Settings className="mr-2 h-4 w-4" />
                        Settings
                      </Button>
                    </Link>
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
                      onClick={async () => {
                        await logout();
                        setMobileMenuOpen(false);
                        navigate("/");
                      }}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </Button>
                  </>
                 ) : (
                  <>
                    <Button 
                      className="w-full bg-foreground text-background hover:bg-foreground/90"
                      onClick={() => {
                        setAuthRedirectTo("/create");
                        setAuthDialogOpen(true);
                        setMobileMenuOpen(false);
                      }}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Create
                    </Button>
                    <Button 
                      variant="outline" 
                      className="w-full border-foreground text-foreground hover:bg-foreground hover:text-background"
                      onClick={() => {
                        setAuthRedirectTo("/");
                        setAuthDialogOpen(true);
                        setMobileMenuOpen(false);
                      }}
                    >
                      Log In
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
      <AuthDialog open={authDialogOpen} onOpenChange={setAuthDialogOpen} redirectTo={authRedirectTo} />
    </nav>
  );
};

export default Navbar;
