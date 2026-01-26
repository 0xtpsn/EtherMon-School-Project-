import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, ShoppingBag, Store, Users, Check } from "lucide-react";
import { authApi } from "@/api/auth";
import { useSession } from "@/context/SessionContext";

declare global {
  interface Window {
    google: any;
  }
}

const Auth = () => {
  const navigate = useNavigate();
  const { login, loginWithGoogle } = useSession();
  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [role, setRole] = useState<"buyer" | "seller">("buyer");
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleSignupButtonRef = useRef<HTMLDivElement>(null);
  
  // Initialize Google Sign-In
  useEffect(() => {
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
        toast.success("Welcome!");
        navigate("/");
      } catch (error: any) {
        toast.error(error.message || "Failed to sign in with Google");
      } finally {
        setLoading(false);
      }
    };
    
    const renderGoogleButton = (element: HTMLDivElement | null, buttonText: "signin_with" | "signup_with") => {
      if (!element) {
        console.log(`Google ${buttonText} button element not found`);
        return;
      }
      
      if (!window.google?.accounts?.id) {
        console.log(`Google Identity Services not available for ${buttonText} button`);
        return;
      }
      
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
        console.log(`Google ${buttonText} button rendered successfully`);
      } catch (error: any) {
        // Suppress 403/origin errors - they're configuration issues
        if (error?.message?.includes('403') || error?.message?.includes('origin') || error?.message?.includes('not allowed')) {
          console.warn(`Google ${buttonText} button: Origin not configured. Add ${window.location.origin} to Google Cloud Console.`);
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
        console.warn("Google Identity Services not loaded");
        return;
      }
      
      // Validate Client ID format
      if (!googleClientId.includes('.apps.googleusercontent.com')) {
        console.error('Invalid Google Client ID format');
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
              return;
            }
            if (!error?.message?.includes('origin') && !error?.message?.includes('403')) {
              console.warn('Google Sign-In error:', error);
            }
          },
        });
      } catch (error: any) {
        // Suppress 403 errors - they're configuration issues
        if (error?.message?.includes('403') || error?.message?.includes('origin')) {
          console.warn('Google Sign-In origin not configured. Please add your origin to Google Cloud Console.');
          return;
        }
        console.error('Error initializing Google Sign-In:', error);
      }
      
      // Render buttons with a small delay to ensure DOM is ready
      const renderButtons = () => {
        try {
          renderGoogleButton(googleButtonRef.current, "signin_with");
          renderGoogleButton(googleSignupButtonRef.current, "signup_with");
        } catch (error: any) {
          if (!error?.message?.includes('403') && !error?.message?.includes('origin')) {
            console.error('Error rendering buttons:', error);
          }
        }
      };
      
      // Try immediately
      renderButtons();
      
      // Also try after a delay in case DOM isn't ready
      setTimeout(renderButtons, 200);
      setTimeout(renderButtons, 500);
      setTimeout(renderButtons, 1000);
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
      
      // Timeout after 10 seconds
      setTimeout(() => {
        clearInterval(checkGoogle);
        if (!window.google) {
          console.error("Google Identity Services failed to load after 10 seconds");
        }
      }, 10000);
      
      return () => clearInterval(checkGoogle);
    }
  }, [loginWithGoogle, navigate]);
  
  // Re-render buttons when refs become available (e.g., when switching tabs)
  useEffect(() => {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!googleClientId || !window.google?.accounts?.id) return;
    
    const renderButtons = () => {
      // Render sign-in button if element exists and is empty
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
      
      // Render sign-up button if element exists and is empty
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
    
    // Check periodically if buttons need to be rendered
    const interval = setInterval(renderButtons, 500);
    
    // Also check immediately
    renderButtons();
    
    return () => clearInterval(interval);
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(identifier, password);
      toast.success("Welcome back!");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in");
    }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    setLoading(true);

    try {
      await authApi.register({
        username,
        email,
        password,
        role,
        display_name: username,
      });
      toast.success("Account created successfully!");
      await login(username, password);
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Failed to sign up");
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword({ email: resetEmail });
      toast.success("Password reset instructions sent! Check your inbox.");
      setShowForgotPassword(false);
      setResetEmail("");
    } catch (error: any) {
      toast.error(error.message || "Unable to send reset link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-gradient-card border-border">
        <CardHeader className="text-center">
          <div className="w-16 h-16 rounded-lg bg-gradient-primary mx-auto mb-4 flex items-center justify-center">
            <span className="text-2xl font-bold">A</span>
          </div>
          <CardTitle className="text-2xl bg-gradient-primary bg-clip-text text-transparent">
            {showForgotPassword ? "Reset Password" : "Welcome to ArtSpace"}
          </CardTitle>
          <CardDescription>
            {showForgotPassword 
              ? "Enter your email to receive a password reset link"
              : "Sign in or create an account to start collecting digital art"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showForgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="you@example.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                  className="bg-secondary border-border"
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
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send Reset Link
                </Button>
              </div>
            </form>
          ) : (
            <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-username">Username or Email</Label>
                    <Input
                      id="signin-username"
                      type="text"
                      placeholder="username or email"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                      className="bg-secondary border-border"
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
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="bg-secondary border-border"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-gradient-primary hover:bg-gradient-hover"
                    disabled={loading}
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sign In
                  </Button>
                  
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>
                  
                  <div ref={googleButtonRef} className="w-full min-h-[40px]">
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
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="bg-secondary border-border"
                  />
                </div>
                <div className="space-y-2">
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
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Account
                </Button>
                
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                  </div>
                </div>
                
                <div ref={googleSignupButtonRef} className="w-full min-h-[40px] flex items-center justify-center">
                  {!import.meta.env.VITE_GOOGLE_CLIENT_ID && (
                    <div className="text-sm text-muted-foreground text-center py-2">
                      Google Sign-In not configured. Add VITE_GOOGLE_CLIENT_ID to your .env file.
                    </div>
                  )}
                </div>
              </form>
            </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
