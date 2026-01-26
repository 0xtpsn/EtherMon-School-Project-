import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { authApi } from "@/api/auth";
import { useSession } from "@/context/SessionContext";
import { Eye, EyeOff, ShoppingBag, Store, Users, Check } from "lucide-react";
import { Card } from "@/components/ui/card";

declare global {
  interface Window {
    google: any;
  }
}

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectTo?: string;
}

const AuthDialog = ({ open, onOpenChange, redirectTo }: AuthDialogProps) => {
  const { login, loginWithGoogle } = useSession();
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [role, setRole] = useState<"buyer" | "seller">("buyer");
  const { toast } = useToast();
  const navigate = useNavigate();
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleSignupButtonRef = useRef<HTMLDivElement>(null);
  
  // Initialize Google Sign-In
  useEffect(() => {
    if (!open) return; // Only initialize when dialog is open
    
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    
    if (!googleClientId) {
      console.warn("Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID in your .env file.");
      console.warn("All env vars:", Object.keys(import.meta.env).filter(k => k.startsWith('VITE_')));
      return;
    }
    
    console.log("Google Client ID loaded:", googleClientId ? googleClientId.substring(0, 20) + "..." : "NOT FOUND");
    
    const handleCredentialResponse = async (response: any) => {
      setLoading(true);
      try {
        await loginWithGoogle(response.credential);
        toast({
          title: "Welcome!",
          description: "You've successfully signed in with Google.",
        });
        onOpenChange(false);
        const finalRedirect = redirectTo || "/";
        navigate(finalRedirect);
      } catch (error: any) {
        toast({
          variant: "destructive",
          title: "Error signing in",
          description: error.message || "Failed to sign in with Google",
        });
      } finally {
        setLoading(false);
      }
    };
    
    const renderGoogleButton = (element: HTMLDivElement | null, buttonText: "signin_with" | "signup_with") => {
      if (!element || !window.google?.accounts?.id) return;
      
      // Clear any existing content
      element.innerHTML = '';
      
      try {
        window.google.accounts.id.renderButton(
          element,
          {
            theme: "outline",
            size: "large",
            width: "100%",
            text: buttonText,
            locale: "en",
          }
        );
      } catch (error: any) {
        // Suppress 403/origin errors - they're configuration issues, not runtime errors
        if (error?.message?.includes('403') || error?.message?.includes('origin') || error?.message?.includes('not allowed')) {
          console.warn(`Google ${buttonText} button: Origin not configured. Add ${window.location.origin} to Google Cloud Console.`);
          // Show a helpful message instead of the button
          element.innerHTML = `<div class="text-sm text-muted-foreground text-center py-2">
            Google Sign-In not configured. Please add ${window.location.origin} to Google Cloud Console.
          </div>`;
          return;
        }
        console.error(`Error rendering Google ${buttonText} button:`, error);
      }
    };
    
    const initializeGoogleSignIn = () => {
      if (!window.google || !window.google.accounts) {
        return;
      }
      
      // Validate Client ID format (should be like: xxxxxx-xxxxx.apps.googleusercontent.com)
      if (!googleClientId.includes('.apps.googleusercontent.com')) {
        console.error('Invalid Google Client ID format. It should end with .apps.googleusercontent.com');
        return;
      }
      
      // Initialize Google Sign-In once with error handling
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: handleCredentialResponse,
          error_callback: (error: any) => {
            // Suppress 403 errors - they're usually due to origin configuration
            if (error?.type === 'popup_closed' || error?.type === 'popup_blocked') {
              // User closed popup or it was blocked - not an error
              return;
            }
            console.warn('Google Sign-In error:', error);
            // Don't show toast for origin errors - they're configuration issues
            if (!error?.message?.includes('origin') && !error?.message?.includes('403')) {
              toast({
                variant: "destructive",
                title: "Google Sign-In Error",
                description: "Failed to sign in with Google. Please check your Google Cloud Console configuration.",
              });
            }
          },
        });
        console.log('Google Sign-In initialized with Client ID:', googleClientId.substring(0, 20) + '...');
      } catch (error: any) {
        // Suppress 403 errors in console - they're configuration issues
        if (error?.message?.includes('403') || error?.message?.includes('origin')) {
          console.warn('Google Sign-In origin not configured. Please add your origin to Google Cloud Console.');
          return;
        }
        console.error('Error initializing Google Sign-In:', error);
      }
      
      // Render buttons with delays to ensure DOM is ready
      const renderButtons = () => {
        try {
          renderGoogleButton(googleButtonRef.current, "signin_with");
          renderGoogleButton(googleSignupButtonRef.current, "signup_with");
        } catch (error: any) {
          // Suppress 403 errors when rendering buttons
          if (!error?.message?.includes('403') && !error?.message?.includes('origin')) {
            console.error('Error rendering Google buttons:', error);
          }
        }
      };
      
      // Try multiple times to ensure buttons render
      setTimeout(renderButtons, 100);
      setTimeout(renderButtons, 300);
      setTimeout(renderButtons, 500);
    };
    
    // Wait for Google script to load
    if (window.google && window.google.accounts) {
      initializeGoogleSignIn();
    } else {
      const checkGoogle = setInterval(() => {
        if (window.google && window.google.accounts) {
          clearInterval(checkGoogle);
          initializeGoogleSignIn();
        }
      }, 100);
      
      setTimeout(() => clearInterval(checkGoogle), 10000);
      
      return () => clearInterval(checkGoogle);
    }
  }, [open, loginWithGoogle, navigate, redirectTo, onOpenChange, toast]);
  
  // Re-render buttons when dialog opens
  useEffect(() => {
    if (!open) return;
    
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId || !window.google?.accounts?.id) return;
    
    const renderButtons = () => {
      if (googleButtonRef.current && googleButtonRef.current.children.length === 0) {
        try {
          window.google.accounts.id.renderButton(
            googleButtonRef.current,
            {
              theme: "outline",
              size: "large",
              width: "100%",
              text: "signin_with",
              locale: "en",
            }
          );
        } catch (error) {
          console.error("Error rendering Google sign-in button:", error);
        }
      }
      
      if (googleSignupButtonRef.current && googleSignupButtonRef.current.children.length === 0) {
        try {
          window.google.accounts.id.renderButton(
            googleSignupButtonRef.current,
            {
              theme: "outline",
              size: "large",
              width: "100%",
              text: "signup_with",
              locale: "en",
            }
          );
        } catch (error) {
          console.error("Error rendering Google sign-up button:", error);
        }
      }
    };
    
    const interval = setInterval(renderButtons, 500);
    renderButtons();
    
    return () => clearInterval(interval);
  }, [open]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const loggedInUser = await login(identifier, password);
      toast({
        title: "Welcome back!",
        description: "You've successfully signed in.",
      });
      onOpenChange(false);
      setIdentifier("");
      setPassword("");
      setShowPassword(false);
      
      // Check if user is a buyer trying to access /create - redirect to home
      const finalRedirect = (redirectTo === "/create" && loggedInUser?.role !== "seller") 
        ? "/" 
        : (redirectTo || "/");
      navigate(finalRedirect);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error signing in",
        description: error.message || "Unable to sign in",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.register({
        username,
        email,
        password,
        role,
        display_name: username,
      });
      const loggedInUser = await login(username, password);
      toast({
        title: "Account created!",
        description: "Welcome to ArtSpace. You can now start collecting digital art.",
      });
      onOpenChange(false);
      setIdentifier("");
      setUsername("");
      setEmail("");
      setPassword("");
      setShowPassword(false);
      
      // Check if user is a buyer trying to access /create - redirect to home
      const finalRedirect = (redirectTo === "/create" && loggedInUser?.role !== "seller") 
        ? "/" 
        : (redirectTo || "/");
      navigate(finalRedirect);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error signing up",
        description: error.message || "Unable to create account",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword({ email: resetEmail });
      toast({
        title: "Password reset email sent",
        description: "Check your email for the password reset instructions.",
      });
      setShowForgotPassword(false);
      setResetEmail("");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Unable to send password reset email",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl bg-gradient-primary bg-clip-text text-transparent">
            {showForgotPassword ? "Reset Password" : "Welcome to ArtSpace"}
          </DialogTitle>
          <DialogDescription>
            {showForgotPassword 
              ? "Enter your email to receive a password reset link"
              : "Sign in or create an account to start collecting digital art"}
          </DialogDescription>
        </DialogHeader>
        {showForgotPassword ? (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="your@email.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setShowForgotPassword(false)}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-gradient-primary hover:bg-gradient-hover"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
            </div>
          </form>
        ) : (
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-identifier">Username or Email</Label>
                  <Input
                    id="signin-identifier"
                    type="text"
                    placeholder="your@email.com / username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="signin-password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="signin-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-primary hover:bg-gradient-hover"
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                  </div>
                </div>
                
                <div ref={googleButtonRef} className="w-full min-h-[40px] flex items-center justify-center">
                  {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                    <div className="text-sm text-muted-foreground text-center py-2">
                      Google Sign-In not configured
                    </div>
                  )}
                </div>
              </form>
            </TabsContent>
          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-username">Username</Label>
                <Input
                  id="signup-username"
                  type="text"
                  placeholder="yourname"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <div className="relative">
                  <Input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                  </button>
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-base font-semibold">Select Your Role</Label>
                <div className="grid grid-cols-1 gap-3">
                  <Card
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      role === "buyer"
                        ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setRole("buyer")}
                  >
                    <div className="flex items-start gap-4 p-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                        role === "buyer" ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        <ShoppingBag className="h-5 w-5" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold cursor-pointer">Buyer</Label>
                          {role === "buyer" && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Browse, bid, and collect digital artworks
                        </p>
                      </div>
                    </div>
                  </Card>

                  <Card
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      role === "seller"
                        ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20"
                        : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setRole("seller")}
                  >
                    <div className="flex items-start gap-4 p-4">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                        role === "seller" ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        <Store className="h-5 w-5" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold cursor-pointer">Seller</Label>
                          {role === "seller" && (
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-3 w-3" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Create and sell your digital art creations
                        </p>
                      </div>
                    </div>
                  </Card>

                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-gradient-primary hover:bg-gradient-hover"
                disabled={loading}
              >
                {loading ? "Creating account..." : "Create Account"}
              </Button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>
              
              <div ref={googleSignupButtonRef} className="w-full min-h-[40px] flex items-center justify-center">
                {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                  <div className="text-sm text-muted-foreground text-center py-2">
                    Google Sign-In not configured
                  </div>
                )}
              </div>
            </form>
          </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AuthDialog;
