import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/layout/Navbar";
import { Home, Search } from "lucide-react";

const NotFound = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-center px-4">
          <h1 className="mb-4 text-6xl font-bold bg-gradient-primary bg-clip-text text-transparent">404</h1>
          <p className="mb-2 text-2xl font-semibold">Page Not Found</p>
          <p className="mb-8 text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div className="flex gap-4 justify-center">
            <Button asChild>
              <Link to="/">
                <Home className="w-4 h-4 mr-2" />
                Go Home
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/search">
                <Search className="w-4 h-4 mr-2" />
                Browse Artworks
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
