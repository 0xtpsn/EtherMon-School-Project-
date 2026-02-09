import { useState, useEffect, useContext } from 'react';
import { ethers } from 'ethers';
import { Web3Context } from './context/Web3Context';
import { PokemonCard } from './components/PokemonCard';
import { InfiniteCarousel } from './components/InfiniteCarousel';

export function Home() {
    const { marketplaceContract, nftContract, provider } = useContext(Web3Context);
    const [auctions, setAuctions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchAuctions() {
            if (!marketplaceContract || !nftContract || !provider) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);

                // Query AuctionCreated events instead of looping
                const filter = marketplaceContract.filters.AuctionCreated();
                const events = await marketplaceContract.queryFilter(filter, 0); // Last ~10000 blocks

                const activeAuctions = [];

                // Check only tokens that have had auctions created
                for (const event of events) {
                    const tokenId = Number(event.args.tokenId);

                    try {
                        const auction = await marketplaceContract.getAuction(tokenId);

                        // Only include if still active
                        if (auction.active && !auction.settled) {
                            const pokemonId = await nftContract.getPokemonId(tokenId);
                            activeAuctions.push({
                                tokenId,
                                pokemonId: Number(pokemonId),
                                highestBid: auction.highestBid,
                                startingPrice: auction.startingPrice,
                                endTime: Number(auction.endTime),
                                seller: auction.seller
                            });
                        }
                    } catch (e) {
                        continue;
                    }
                }

                // Sort by highest bid (descending)
                activeAuctions.sort((a, b) => {
                    const bidA = a.highestBid > 0n ? a.highestBid : a.startingPrice;
                    const bidB = b.highestBid > 0n ? b.highestBid : b.startingPrice;
                    return bidB > bidA ? 1 : -1;
                });

                setAuctions(activeAuctions);
            } catch (err) {
                console.error('Error fetching auctions:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchAuctions();
    }, [marketplaceContract, nftContract, provider]);

    const topAuctions = auctions.slice(0, 10);
    const allAuctions = auctions;

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Hero */}
            <div className="text-center py-12 px-6">
                <h1 className="text-5xl font-bold mb-4 tracking-tight">
                    EtherMon
                </h1>
                <p className="text-neutral-400 text-lg">
                    Collect, trade, and auction Pokemon NFTs
                </p>
            </div>

            {/* Featured Auctions Carousel */}
            <section className="mb-12">
                <div className="px-6 mb-4">
                    <h2 className="text-2xl font-bold text-white">🔥 Top Auctions</h2>
                </div>

                {loading ? (
                    <div className="flex gap-6 px-6 overflow-hidden">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="w-64 h-96 bg-neutral-900 rounded-xl animate-pulse flex-shrink-0" />
                        ))}
                    </div>
                ) : topAuctions.length > 0 ? (
                    <InfiniteCarousel>
                        {topAuctions.map((auction) => (
                            <div key={auction.tokenId} className="flex-shrink-0">
                                <PokemonCard
                                    pokemonId={auction.pokemonId}
                                    tokenId={auction.tokenId}
                                    price={ethers.formatEther(auction.highestBid > 0n ? auction.highestBid : auction.startingPrice)}
                                    endTime={auction.endTime}
                                    showPrice={true}
                                />
                            </div>
                        ))}
                    </InfiniteCarousel>
                ) : (
                    <div className="text-center py-10 text-neutral-500">
                        No active auctions yet
                    </div>
                )}
            </section>

            {/* All Auctions Grid */}
            <section className="px-6 pb-12">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold text-white">All Auctions</h2>
                    <span className="text-neutral-500">{allAuctions.length} active</span>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                        {[...Array(10)].map((_, i) => (
                            <div key={i} className="w-64 h-96 bg-neutral-900 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : allAuctions.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                        {allAuctions.map((auction) => (
                            <PokemonCard
                                key={auction.tokenId}
                                pokemonId={auction.pokemonId}
                                tokenId={auction.tokenId}
                                price={ethers.formatEther(auction.highestBid > 0n ? auction.highestBid : auction.startingPrice)}
                                endTime={auction.endTime}
                                showPrice={true}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-20 border border-neutral-800 rounded-xl">
                        <p className="text-neutral-500 text-lg mb-4">No auctions yet</p>
                        <p className="text-neutral-600">List your Pokemon to start trading!</p>
                    </div>
                )}
            </section>
        </div>
    );
}