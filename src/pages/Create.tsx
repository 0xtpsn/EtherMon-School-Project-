import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Upload, Image as ImageIcon, Clock, DollarSign, Loader2, X } from "lucide-react";
import { uploadApi } from "@/api/uploads";
import { artworksApi } from "@/api/artworks";
import { auctionsApi } from "@/api/auctions";
import { useToast } from "@/hooks/use-toast";
import { useSession } from "@/context/SessionContext";
import { formatCurrency } from "@/lib/utils";

const CATEGORIES = ["Abstract", "Digital", "Photography", "3D Art", "Pixel Art", "Illustration"];

const Create = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { user, loading: sessionLoading } = useSession();
  
  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [listingType, setListingType] = useState<"fixed" | "auction" | "display">("fixed");
  const [price, setPrice] = useState("");
  const [fixedPriceExpiry, setFixedPriceExpiry] = useState(""); // Duration in hours for fixed price
  const [startingBid, setStartingBid] = useState("");
  const [reservePrice, setReservePrice] = useState(""); // Reserve price for auctions
  const [auctionDuration, setAuctionDuration] = useState("24");

  useEffect(() => {
    if (!sessionLoading && !user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to create artwork",
        variant: "destructive",
      });
      navigate("/auth");
    } else if (!sessionLoading && user && user.role !== "seller") {
      toast({
        title: "Access restricted",
        description: "Only sellers can create artwork. Please sign in with a seller account.",
        variant: "destructive",
      });
      navigate("/");
    }
  }, [user, sessionLoading, navigate, toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file size (10MB - matches backend limit)
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast.error("File size must be less than 10MB");
        return;
      }

      // Validate file type
      const validTypes = ["image/jpeg", "image/png", "image/gif", "image/svg+xml", "image/webp"];
      if (!validTypes.includes(selectedFile.type)) {
        toast.error("File must be JPG, PNG, GIF, SVG, or WEBP");
        return;
      }

      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      const event = {
        target: { files: [droppedFile] }
      } as any;
      handleFileChange(event);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Please sign in to create artwork",
        variant: "destructive",
      });
      return;
    }

    if (!file) {
      toast.error("Please upload an artwork file");
      return;
    }

    if (!title.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a title for your artwork",
        variant: "destructive",
      });
      return;
    }

    if (!description.trim()) {
      toast({
        title: "Description required",
        description: "Please enter a description for your artwork",
        variant: "destructive",
      });
      return;
    }

    if (!category) {
      toast({
        title: "Category required",
        description: "Please select a category for your artwork",
        variant: "destructive",
      });
      return;
    }

    if (listingType === "fixed") {
      if (!price || parseFloat(price) <= 0) {
        toast({
          title: "Invalid price",
          description: "Please enter a valid price greater than 0",
          variant: "destructive",
        });
        return;
      }
      if (parseFloat(price) > 1000000) {
        toast({
          title: "Price too high",
          description: "Price cannot exceed $1,000,000",
          variant: "destructive",
        });
        return;
      }
      if (!fixedPriceExpiry) {
        toast({
          title: "Expiry required",
          description: "Please select a listing expiry duration",
          variant: "destructive",
        });
        return;
      }
    }

    if (listingType === "auction") {
      if (!startingBid || parseFloat(startingBid) <= 0) {
        toast({
          title: "Invalid starting bid",
          description: "Please enter a valid starting bid greater than 0",
          variant: "destructive",
        });
        return;
      }
      if (reservePrice && parseFloat(reservePrice) > 0) {
        if (parseFloat(reservePrice) < parseFloat(startingBid)) {
          toast({
            title: "Invalid reserve price",
            description: "Reserve price must be greater than or equal to starting bid",
            variant: "destructive",
          });
          return;
        }
      }
    }

    setLoading(true);

    try {
      const { url } = await uploadApi.upload(file);

      if (listingType === "auction") {
        const endTime = new Date();
        endTime.setHours(endTime.getHours() + parseInt(auctionDuration, 10));
        const auctionPayload: any = {
          title: title.trim(),
          description: description.trim(),
          category,
          start_price: parseFloat(startingBid),
          end_time: endTime.toISOString(),
          image_url: url,
        };
        // Add reserve price if provided
        if (reservePrice && parseFloat(reservePrice) > 0) {
          auctionPayload.reserve_price = parseFloat(reservePrice);
        }
        const { artwork_id } = await auctionsApi.create(auctionPayload);
        toast({
          title: "Auction created",
          description: "Your artwork auction is now live.",
        });
        navigate(`/art/${artwork_id}`);
      } else {
        const payload = {
          title: title.trim(),
          description: description.trim(),
          category,
          image_url: url,
          price: listingType === "display" ? null : parseFloat(price),
          is_listed: listingType !== "display",
        };
        const { artwork_id } = await artworksApi.create(payload);
        
        // If it's a fixed price listing, list it with expiry (if specified)
        if (listingType === "fixed") {
          const listPayload: any = {
            type: "fixed",
            price: parseFloat(price),
          };
          // Only add duration if not "never"
          if (fixedPriceExpiry !== "never") {
            listPayload.duration_hours = parseInt(fixedPriceExpiry);
          }
          await artworksApi.listForSale(artwork_id, listPayload);
        }
        
        toast({
          title: "Artwork published",
          description: listingType === "display" ? "Your artwork is visible in your gallery." : "Collectors can now purchase your piece.",
        });
        navigate(`/art/${artwork_id}`);
      }
    } catch (error: any) {
      const errorMessage = error.status === 0
        ? "Unable to connect to server. Please check your connection."
        : error.message || "Failed to create artwork. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setPreview("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent">
              Create New Artwork
            </h1>
            <p className="text-muted-foreground">
              Upload your digital art and choose how you want to sell it
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Upload Section */}
              <div className="space-y-6">
                <Card className="bg-gradient-card border-border">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <ImageIcon className="w-5 h-5" />
                      Upload Artwork
                    </CardTitle>
                    <CardDescription>
                      Your artwork will be stored securely and displayed to collectors
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!preview ? (
                      <div
                        className="border-2 border-dashed border-border rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                        <p className="text-muted-foreground mb-2 font-medium">
                          Drop your file here or click to browse
                        </p>
                        <p className="text-sm text-muted-foreground">
                          JPG, PNG, GIF, SVG, WEBP. Max 10MB
                        </p>
                      </div>
                    ) : (
                      <div className="relative">
                        <img
                          src={preview}
                          alt="Preview"
                          className="w-full h-auto rounded-lg"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2"
                          onClick={removeFile}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                        <div className="mt-4 p-3 bg-secondary rounded-lg">
                          <p className="text-sm font-medium truncate">{file?.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {(file!.size / (1024 * 1024)).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/svg+xml,image/webp"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </CardContent>
                </Card>

                {/* Listing Type */}
                <Card className="bg-gradient-card border-border">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="w-5 h-5" />
                      Listing Type
                    </CardTitle>
                    <CardDescription>
                      Choose how you want to sell your artwork
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <RadioGroup value={listingType} onValueChange={(value: any) => setListingType(value)}>
                      <div className="flex items-start space-x-3 p-4 rounded-lg border border-border hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="fixed" id="fixed" />
                        <div className="flex-1">
                          <Label htmlFor="fixed" className="cursor-pointer">
                            <p className="font-semibold">List as Fixed Price</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              List your artwork at a set price. Buyers can purchase it immediately. The listing will expire if not purchased by the expiry date.
                            </p>
                          </Label>
                        </div>
                      </div>
                      
                      <div className="flex items-start space-x-3 p-4 rounded-lg border border-border hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="auction" id="auction" />
                        <div className="flex-1">
                          <Label htmlFor="auction" className="cursor-pointer">
                            <p className="font-semibold">Timed Auction</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              Let collectors bid on your artwork. Highest bidder wins when time expires.
                            </p>
                          </Label>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3 p-4 rounded-lg border border-border hover:border-primary/50 transition-colors">
                        <RadioGroupItem value="display" id="display" />
                        <div className="flex-1">
                          <Label htmlFor="display" className="cursor-pointer">
                            <p className="font-semibold">Display Only</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              Showcase your artwork without selling. Perfect for testing the platform or building your portfolio.
                            </p>
                          </Label>
                        </div>
                      </div>
                    </RadioGroup>
                  </CardContent>
                </Card>
              </div>

              {/* Details Section */}
              <div className="space-y-6">
                <Card className="bg-gradient-card border-border">
                  <CardHeader>
                    <CardTitle>Artwork Details</CardTitle>
                    <CardDescription>
                      Provide information about your artwork
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Title *</Label>
                      <Input
                        id="title"
                        placeholder="Enter artwork title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="bg-secondary border-border"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Description *</Label>
                      <Textarea
                        id="description"
                        placeholder="Tell collectors about your artwork, inspiration, and technique"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="bg-secondary border-border min-h-32"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="category">Category *</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="bg-secondary border-border">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent className="bg-secondary border-border">
                          {CATEGORIES.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                {/* Pricing */}
                {listingType !== "display" && (
                  <Card className="bg-gradient-card border-border">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {listingType === "auction" ? (
                          <>
                            <Clock className="w-5 h-5" />
                            Auction Settings
                          </>
                        ) : (
                          <>
                            <DollarSign className="w-5 h-5" />
                            Pricing
                          </>
                        )}
                      </CardTitle>
                    </CardHeader>
                  <CardContent className="space-y-4">
                    {listingType === "fixed" ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="price">Price (USD) *</Label>
                          <Input
                            id="price"
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="0.00"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            className="bg-secondary border-border"
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            Set the price at which collectors can purchase your artwork
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="fixed-expiry">Listing Expiry Duration *</Label>
                          <Select value={fixedPriceExpiry} onValueChange={setFixedPriceExpiry}>
                            <SelectTrigger className="bg-secondary border-border">
                              <SelectValue placeholder="Select duration" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="24">24 hours</SelectItem>
                              <SelectItem value="48">2 days</SelectItem>
                              <SelectItem value="72">3 days</SelectItem>
                              <SelectItem value="168">7 days</SelectItem>
                              <SelectItem value="336">14 days</SelectItem>
                              <SelectItem value="720">30 days</SelectItem>
                              <SelectItem value="never">Never expires</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            {fixedPriceExpiry === "never" 
                              ? "The listing will remain active until manually delisted or sold"
                              : "The listing will be automatically delisted if not purchased by this time"}
                          </p>
                        </div>

                        {price && parseFloat(price) > 0 && parseFloat(price) <= 1000000 && (
                          <div className="p-3 bg-secondary/50 rounded-lg border border-border space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">List Price:</span>
                              <span className="font-medium">${formatCurrency(parseFloat(price))}</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Platform Fee (2.5%):</span>
                              <span className="font-medium text-destructive">-${formatCurrency(parseFloat(price) * 0.025)}</span>
                            </div>
                            <div className="pt-2 border-t border-border flex items-center justify-between">
                              <span className="text-sm font-semibold">You will receive:</span>
                              <span className="text-lg font-bold bg-gradient-primary bg-clip-text text-transparent">
                                ${formatCurrency(parseFloat(price) * 0.975)}
                              </span>
                            </div>
                          </div>
                        )}
                        {price && parseFloat(price) > 1000000 && (
                          <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                            <p className="text-sm text-destructive font-medium">
                              Price cannot exceed $1,000,000
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="starting-bid">Starting Bid (USD) *</Label>
                          <Input
                            id="starting-bid"
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="0.00"
                            value={startingBid}
                            onChange={(e) => setStartingBid(e.target.value)}
                            className="bg-secondary border-border"
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            Minimum bid to start the auction
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reserve-price">Reserve Price (USD) <span className="text-muted-foreground text-xs">(Optional)</span></Label>
                          <Input
                            id="reserve-price"
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="0.00"
                            value={reservePrice}
                            onChange={(e) => setReservePrice(e.target.value)}
                            className="bg-secondary border-border"
                          />
                          <p className="text-xs text-muted-foreground">
                            Minimum price you're willing to accept. If bidding doesn't reach this price, the sale won't complete.
                          </p>
                          {reservePrice && startingBid && parseFloat(reservePrice) > 0 && parseFloat(startingBid) > 0 && (
                            parseFloat(reservePrice) < parseFloat(startingBid) ? (
                              <p className="text-xs text-destructive">
                                Reserve price must be greater than or equal to starting bid
                              </p>
                            ) : null
                          )}
                        </div>

                        {startingBid && parseFloat(startingBid) > 0 && (
                          <div className="p-3 bg-secondary/50 rounded-lg border border-border space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Starting Bid:</span>
                              <span className="font-medium">${formatCurrency(parseFloat(startingBid))}</span>
                            </div>
                            {reservePrice && parseFloat(reservePrice) > 0 && (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Reserve Price:</span>
                                <span className="font-medium">${formatCurrency(parseFloat(reservePrice))}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Platform Fee (2.5%):</span>
                              <span className="font-medium text-destructive">-${formatCurrency(parseFloat(startingBid) * 0.025)}</span>
                            </div>
                            <div className="pt-2 border-t border-border flex items-center justify-between">
                              <span className="text-sm font-semibold">Min. you will receive:</span>
                              <span className="text-lg font-bold bg-gradient-primary bg-clip-text text-transparent">
                                ${formatCurrency(parseFloat(startingBid) * 0.975)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground italic">
                              * Final amount based on winning bid
                            </p>
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label htmlFor="duration">Auction Duration *</Label>
                          <Select value={auctionDuration} onValueChange={setAuctionDuration}>
                            <SelectTrigger className="bg-secondary border-border">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-secondary border-border">
                              <SelectItem value="6">6 hours</SelectItem>
                              <SelectItem value="12">12 hours</SelectItem>
                              <SelectItem value="24">24 hours</SelectItem>
                              <SelectItem value="48">2 days</SelectItem>
                              <SelectItem value="72">3 days</SelectItem>
                              <SelectItem value="168">7 days</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            How long the auction will run
                          </p>
                          {auctionDuration && (
                            <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                              <p className="text-sm font-semibold text-primary mb-1">Auction End Date & Time:</p>
                              <p className="text-sm">
                                {(() => {
                                  const endTime = new Date();
                                  endTime.setHours(endTime.getHours() + parseInt(auctionDuration));
                                  return endTime.toLocaleString('en-US', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                    hour12: true
                                  });
                                })()}
                              </p>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
                )}

                <Button
                  type="submit"
                  className="w-full bg-gradient-primary hover:bg-gradient-hover h-12 text-base font-semibold"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Creating Artwork...
                    </>
                  ) : (
                    listingType === "display" 
                      ? "Upload Artwork" 
                      : `Create ${listingType === "auction" ? "Auction" : "Artwork"}`
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
};

export default Create;