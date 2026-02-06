import { useState, useEffect, useContext } from 'react';
import { Web3Context } from '../context/Web3Context';
import { PokemonCard } from '../components/PokemonCard';

export function Collection() {
    const { account, nftContract, provider, connectWallet } = useContext(Web3Context);
    const [tokens, setTokens] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        async function fetchUserTokens() {
            if (!nftContract || !account || !provider) return;

            setLoading(true);
            setError(null);

            try {
                // Query Transfer events TO this user (they received tokens)
                const receivedFilter = nftContract.filters.Transfer(null, account);
                const receivedEvents = await nftContract.queryFilter(receivedFilter, 0);

                // Query Transfer events FROM this user (they sent tokens)
                const sentFilter = nftContract.filters.Transfer(account, null);
                const sentEvents = await nftContract.queryFilter(sentFilter, 0);

                // Build a set of tokens received
                const receivedTokens = new Set();
                for (const event of receivedEvents) {
                    receivedTokens.add(Number(event.args.tokenId));
                }

                // Remove tokens that were sent away
                for (const event of sentEvents) {
                    receivedTokens.delete(Number(event.args.tokenId));
                }

                // Fetch pokemon IDs for owned tokens
                const userTokens = [];
                for (const tokenId of receivedTokens) {
                    try {
                        // Verify current ownership (in case of edge cases)
                        const owner = await nftContract.ownerOf(tokenId);
                        if (owner.toLowerCase() === account.toLowerCase()) {
                            const pokemonId = await nftContract.getPokemonId(tokenId);
                            userTokens.push({
                                tokenId,
                                pokemonId: Number(pokemonId)
                            });
                        }
                    } catch (e) {
                        continue;
                    }
                }

                setTokens(userTokens);
            } catch (err) {
                console.error('Error fetching tokens:', err);
                setError('Failed to load your collection');
            } finally {
                setLoading(false);
            }
        }

        fetchUserTokens();
    }, [nftContract, account, provider]);

    if (!account) {
        return (
            <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
                <h1 className="text-3xl font-bold mb-6">My Collection</h1>
                <p className="text-neutral-400 mb-6">Connect your wallet to view your Pokemon</p>
                <button
                    onClick={connectWallet}
                    className="bg-white hover:bg-neutral-200 text-black font-bold px-6 py-3 rounded-xl transition-all"
                >
                    Connect Wallet
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white p-8">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-4xl font-bold mb-2">My Collection</h1>
                <p className="text-neutral-400 mb-8">
                    {account.slice(0, 6)}...{account.slice(-4)}
                </p>

                {loading && (
                    <div className="flex justify-center items-center py-20">
                        <div className="text-neutral-400">Loading your Pokemon...</div>
                    </div>
                )}

                {error && (
                    <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
                        <p className="text-red-400">{error}</p>
                    </div>
                )}

                {!loading && !error && tokens.length === 0 && (
                    <div className="text-center py-20 border border-neutral-800 rounded-xl">
                        <p className="text-neutral-400 text-lg mb-4">You don't own any Pokemon yet!</p>
                        <a
                            href="/mint"
                            className="inline-block bg-white hover:bg-neutral-200 text-black font-bold px-6 py-3 rounded-xl transition-all"
                        >
                            Mint Your First Pokemon
                        </a>
                    </div>
                )}

                {!loading && tokens.length > 0 && (
                    <>
                        <p className="text-neutral-400 mb-6">{tokens.length} Pokemon owned</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {tokens.map((token) => (
                                <PokemonCard
                                    key={token.tokenId}
                                    tokenId={token.tokenId}
                                    pokemonId={token.pokemonId}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
