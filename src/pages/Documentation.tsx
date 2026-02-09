import Navbar from "@/components/layout/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
    Sparkles,
    ShoppingCart,
    Tag,
    Gavel,
    Layers,
    Info,
    ArrowRight,
    Shield,
    Coins,
    RefreshCw,
    Zap,
    Code2,
} from "lucide-react";

const Documentation = () => {
    return (
        <div className="min-h-screen bg-background">
            <Navbar />

            <main className="container mx-auto px-4 py-12 max-w-4xl">
                {/* Hero */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
                        Documentation
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        Everything you need to know about EtherMon — from minting your first
                        Pokémon NFT to trading on the marketplace.
                    </p>
                </div>

                <div className="space-y-8">
                    {/* ── 1. How EtherMon Works ── */}
                    <Card className="border-border bg-gradient-card">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-3 text-xl">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <Info className="h-5 w-5 text-primary" />
                                </div>
                                How EtherMon Works
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
                            <p>
                                EtherMon is a <strong className="text-foreground">decentralised NFT marketplace</strong> built
                                on the Ethereum Sepolia test network. It lets you mint, collect, and
                                trade unique Pokémon-themed digital cards — all powered by smart
                                contracts with no central intermediary.
                            </p>
                            <p>
                                Every card in the <strong className="text-foreground">PokéChain Collection (POKE)</strong> is
                                a unique ERC-721 token. There are <strong className="text-foreground">1,025 possible Pokémon</strong> that
                                can be assigned when you mint, and the Pokémon you receive is
                                determined on-chain using randomisation, making every mint a surprise.
                            </p>
                            <div className="flex flex-wrap gap-2 pt-2">
                                <Badge variant="secondary">Decentralised</Badge>
                                <Badge variant="secondary">Non-custodial</Badge>
                                <Badge variant="secondary">Open Source</Badge>
                                <Badge variant="secondary">Sepolia Testnet</Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── 2. Minting ── */}
                    <Card className="border-border bg-gradient-card">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-3 text-xl">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <Sparkles className="h-5 w-5 text-primary" />
                                </div>
                                Minting
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
                            <p>
                                Minting is how new NFTs enter the collection. Each mint costs{" "}
                                <strong className="text-foreground">0.01 ETH</strong> and you can mint up to{" "}
                                <strong className="text-foreground">50 per wallet</strong>.
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                                    <h4 className="font-semibold text-foreground flex items-center gap-2">
                                        <Zap className="h-4 w-4 text-primary" />
                                        Blind-Box Mechanic
                                    </h4>
                                    <p className="text-sm">
                                        You don't choose your Pokémon — it's determined by on-chain
                                        randomisation (<code className="text-xs bg-muted px-1 py-0.5 rounded">block.prevrandao</code>).
                                        This ensures fair, transparent, and tamper-proof distribution.
                                    </p>
                                </div>
                                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                                    <h4 className="font-semibold text-foreground flex items-center gap-2">
                                        <Layers className="h-4 w-4 text-primary" />
                                        Gas-Optimised
                                    </h4>
                                    <p className="text-sm">
                                        The contract uses <strong>ERC721A</strong> (by Chiru Labs), meaning
                                        batch-minting multiple NFTs costs nearly the same gas as minting a
                                        single one.
                                    </p>
                                </div>
                            </div>
                            <p className="text-sm">
                                <strong className="text-foreground">How to mint:</strong> Click the{" "}
                                <em>Mint</em> button in the navigation bar, choose a quantity, and
                                confirm the transaction in your wallet.
                            </p>
                        </CardContent>
                    </Card>

                    {/* ── 3. Buying (Fixed-Price) ── */}
                    <Card className="border-border bg-gradient-card">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-3 text-xl">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <ShoppingCart className="h-5 w-5 text-primary" />
                                </div>
                                Buying (Fixed-Price Sales)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
                            <p>
                                When an NFT is listed for a fixed price, you can buy it instantly.
                                The process is fully on-chain:
                            </p>
                            <ol className="space-y-3 list-none">
                                <li className="flex gap-3">
                                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">1</span>
                                    <span>You send the listed price (in ETH) by clicking <em>Buy Now</em>.</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">2</span>
                                    <span>
                                        The smart contract splits the payment: <strong className="text-foreground">97.5%</strong> goes
                                        to the seller, and <strong className="text-foreground">2.5%</strong> is sent to the platform as a
                                        fee.
                                    </span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">3</span>
                                    <span>The NFT is transferred directly to your wallet in the same transaction.</span>
                                </li>
                            </ol>
                            <div className="p-4 rounded-lg bg-muted/50 flex items-start gap-3">
                                <Shield className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                                <p className="text-sm">
                                    <strong className="text-foreground">Security:</strong> All transfers happen
                                    atomically — if any part fails, the entire transaction reverts.
                                    Any excess ETH you send is automatically refunded.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── 4. Selling (Listing) ── */}
                    <Card className="border-border bg-gradient-card">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-3 text-xl">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <Tag className="h-5 w-5 text-primary" />
                                </div>
                                Selling (Listing Your NFTs)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
                            <p>
                                As a seller, you list your NFT for a price and it stays in your
                                wallet until someone buys it. The marketplace uses an{" "}
                                <strong className="text-foreground">approval-based model</strong> (similar to
                                OpenSea) — you never lose custody of your NFT during listing.
                            </p>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <ArrowRight className="h-4 w-4 text-primary" />
                                    <span><strong className="text-foreground">List:</strong> Set a price for your NFT. You'll need to approve the marketplace contract once.</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <ArrowRight className="h-4 w-4 text-primary" />
                                    <span><strong className="text-foreground">Update:</strong> Change the listing price at any time.</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <ArrowRight className="h-4 w-4 text-primary" />
                                    <span><strong className="text-foreground">Cancel:</strong> Remove the listing — the NFT remains in your wallet.</span>
                                </div>
                            </div>
                            <div className="p-4 rounded-lg bg-muted/50 flex items-start gap-3">
                                <Coins className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                                <p className="text-sm">
                                    <strong className="text-foreground">Fee Preview:</strong> A 2.5% platform fee
                                    is deducted from the sale price upon purchase. When listing, the fee
                                    breakdown is shown so you know exactly what you'll receive.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── 5. Auctions & Bidding ── */}
                    <Card className="border-border bg-gradient-card">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-3 text-xl">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <Gavel className="h-5 w-5 text-primary" />
                                </div>
                                Auctions &amp; Bidding
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
                            <p>
                                EtherMon supports <strong className="text-foreground">English-style auctions</strong> where
                                the highest bidder at the end of the time window wins the NFT.
                            </p>

                            <Separator />

                            <div className="space-y-4">
                                <div>
                                    <h4 className="font-semibold text-foreground mb-1">Creating an Auction</h4>
                                    <p className="text-sm">
                                        Set a starting price and duration (1 hour to 7 days). Your NFT
                                        stays in your wallet until the auction is settled.
                                    </p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-foreground mb-1">Placing Bids</h4>
                                    <p className="text-sm">
                                        Each new bid must exceed the current highest bid. Your bid amount
                                        is held in escrow inside the smart contract. If you're outbid,
                                        your funds are marked for withdrawal.
                                    </p>
                                </div>
                                <div>
                                    <h4 className="font-semibold text-foreground mb-1">Settlement</h4>
                                    <p className="text-sm">
                                        Once the timer expires, anyone can call <em>End Auction</em>.
                                        The NFT transfers to the highest bidder, the seller receives
                                        the winning bid (minus 2.5% fee), and the platform fee is sent
                                        immediately.
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 rounded-lg bg-muted/50 flex items-start gap-3">
                                <RefreshCw className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                                <p className="text-sm">
                                    <strong className="text-foreground">Refunds:</strong> If you're outbid, your
                                    ETH moves to a <em>pending-returns</em> ledger. You can withdraw
                                    it at any time via the <em>Withdraw</em> button. This{" "}
                                    <strong className="text-foreground">pull-over-push</strong> pattern protects
                                    against gas-griefing and denial-of-service attacks.
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── 6. Tech Stack ── */}
                    <Card className="border-border bg-gradient-card">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-3 text-xl">
                                <div className="p-2 rounded-lg bg-primary/10">
                                    <Code2 className="h-5 w-5 text-primary" />
                                </div>
                                Tech Stack
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4 text-muted-foreground leading-relaxed">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                                    <h4 className="font-semibold text-foreground">Frontend</h4>
                                    <ul className="text-sm space-y-1">
                                        <li>• React 18 + TypeScript</li>
                                        <li>• Vite (build tooling)</li>
                                        <li>• Tailwind CSS + shadcn/ui</li>
                                        <li>• Ethers.js (wallet interaction)</li>
                                    </ul>
                                </div>
                                <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                                    <h4 className="font-semibold text-foreground">Smart Contracts</h4>
                                    <ul className="text-sm space-y-1">
                                        <li>• Solidity 0.8.28</li>
                                        <li>• ERC721A (gas-optimised NFT)</li>
                                        <li>• Hardhat 2.22.0 (testing &amp; deploy)</li>
                                        <li>• 86-test verification suite</li>
                                    </ul>
                                </div>
                                <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                                    <h4 className="font-semibold text-foreground">Architecture</h4>
                                    <ul className="text-sm space-y-1">
                                        <li>• Fully decentralised (EVM state)</li>
                                        <li>• No centralised database required</li>
                                        <li>• IPFS for NFT metadata</li>
                                        <li>• Approval-based marketplace</li>
                                    </ul>
                                </div>
                                <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                                    <h4 className="font-semibold text-foreground">Security</h4>
                                    <ul className="text-sm space-y-1">
                                        <li>• ReentrancyGuard on all value calls</li>
                                        <li>• Emergency pause (circuit breaker)</li>
                                        <li>• Atomic fee distribution</li>
                                        <li>• Pull-over-push refund pattern</li>
                                    </ul>
                                </div>
                            </div>

                            <Separator />

                            <p className="text-sm text-center">
                                Built for the <strong className="text-foreground">UCL MSc DeFi</strong> coursework by{" "}
                                <strong className="text-foreground">Tep San</strong> &amp;{" "}
                                <strong className="text-foreground">Nicholas Lim</strong>.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    );
};

export default Documentation;
