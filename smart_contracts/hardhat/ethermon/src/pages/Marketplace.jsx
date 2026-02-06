import { useState, useEffect, useContext } from 'react';
import { ethers } from 'ethers';
import { Web3Context } from '../context/Web3Context';
import { PokemonCard } from '../components/PokemonCard';

export function Marketplace() {
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

                // Query AuctionCreated events
                const filter = marketplaceContract.filters.AuctionCreated();
                const events = await marketplaceContract.queryFilter(filter, 0);

                const activeAuctions = [];

                for (const event of events) {
                    const tokenId = Number(event.args.tokenId);

                    try {
                        const auction = await marketplaceContract.getAuction(tokenId);

                        if (auction.active && !auction.settled) {
                            const pokemonId = await nftContract.getPokemonId(tokenId);
                            activeAuctions.push({
                                tokenId,
                                pokemonId: Number(pokemonId),
                                highestBid: auction.highestBid,
                                startingPrice: auction.startingPrice,
                                endTime: Number(auction.endTime),
                                seller: auction.seller,
                                highestBidder: auction.highestBidder
                            });
                        }
                    } catch (e) {
                        continue;
                    }
                }

                // Sort by end time (soonest first)
                activeAuctions.sort((a, b) => a.endTime - b.endTime);

                setAuctions(activeAuctions);
            } catch (err) {
                console.error('Error fetching auctions:', err);
            } finally {
                setLoading(false);
            }
        }

        fetchAuctions();
    }, [marketplaceContract, nftContract, provider]);

    return (
        <div className="min-h-screen bg-black text-white p-8">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-4xl font-bold mb-2">Marketplace</h1>
                <p className="text-neutral-400 mb-8">Browse and bid on Pokemon auctions</p>

                {loading && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {[...Array(8)].map((_, i) => (
                            <div key={i} className="w-64 h-96 bg-neutral-900 rounded-xl animate-pulse" />
                        ))}
                    </div>
                )}

                {!loading && auctions.length === 0 && (
                    <div className="text-center py-20 border border-neutral-800 rounded-xl">
                        <p className="text-neutral-400 text-lg mb-4">No active auctions</p>
                        <p className="text-neutral-600">List your Pokemon to start trading!</p>
                    </div>
                )}

                {!loading && auctions.length > 0 && (
                    <>
                        <p className="text-neutral-400 mb-6">{auctions.length} active auctions</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {auctions.map((auction) => (
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
                    </>
                )}
            </div>
        </div>
    );
}
