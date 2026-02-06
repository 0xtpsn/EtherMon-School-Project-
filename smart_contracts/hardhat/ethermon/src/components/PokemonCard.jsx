import { useState, useEffect } from 'react';

// Pokemon type colors for card styling
const typeColors = {
    normal: 'from-gray-400 to-gray-500',
    fire: 'from-orange-500 to-red-600',
    water: 'from-blue-400 to-blue-600',
    electric: 'from-yellow-400 to-yellow-500',
    grass: 'from-green-400 to-green-600',
    ice: 'from-cyan-300 to-cyan-500',
    fighting: 'from-red-700 to-red-900',
    poison: 'from-purple-500 to-purple-700',
    ground: 'from-yellow-600 to-amber-700',
    flying: 'from-indigo-300 to-indigo-500',
    psychic: 'from-pink-500 to-pink-600',
    bug: 'from-lime-500 to-green-600',
    rock: 'from-stone-500 to-stone-700',
    ghost: 'from-purple-700 to-purple-900',
    dragon: 'from-indigo-600 to-purple-700',
    dark: 'from-gray-700 to-gray-900',
    steel: 'from-gray-400 to-slate-500',
    fairy: 'from-pink-300 to-pink-500',
};

export function PokemonCard({ pokemonId, tokenId, price, endTime, showPrice = false }) {
    const [metadata, setMetadata] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const BASE_URI = "https://bafybeienzjyalm2axjk3gx75mcrbjjjv2ej3j5guoaeddjifgryheut57m.ipfs.dweb.link/";

    useEffect(() => {
        async function fetchMetadata() {
            try {
                setLoading(true);
                const response = await fetch(`${BASE_URI}${pokemonId}.json`);
                if (!response.ok) throw new Error('Failed to fetch');
                const data = await response.json();
                setMetadata(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }

        if (pokemonId) {
            fetchMetadata();
        }
    }, [pokemonId]);

    // Format time remaining
    function formatTimeRemaining(endTimestamp) {
        if (!endTimestamp) return null;
        const now = Math.floor(Date.now() / 1000);
        const remaining = endTimestamp - now;
        if (remaining <= 0) return 'Ended';

        const hours = Math.floor(remaining / 3600);
        const mins = Math.floor((remaining % 3600) / 60);

        if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
        return `${hours}h ${mins}m`;
    }

    if (loading) {
        return (
            <div className="w-64 h-96 bg-gray-700 rounded-xl animate-pulse flex items-center justify-center">
                <span className="text-gray-400">Loading...</span>
            </div>
        );
    }

    if (error || !metadata) {
        return (
            <div className="w-64 h-96 bg-gray-700 rounded-xl flex items-center justify-center">
                <span className="text-red-400">Failed to load</span>
            </div>
        );
    }

    // Get primary type for card color
    const primaryType = metadata.attributes?.find(a => a.trait_type === 'Type')?.value?.toLowerCase() || 'normal';
    const gradientClass = typeColors[primaryType] || typeColors.normal;

    return (
        <div className={`w-64 h-96 rounded-xl bg-gradient-to-br ${gradientClass} p-1 shadow-xl hover:scale-105 transition-transform cursor-pointer`}>
            <div className="bg-gray-900 rounded-lg h-full p-3 flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-white font-bold text-lg capitalize truncate">
                        {metadata.name || `Pokemon #${pokemonId}`}
                    </h3>
                    <span className="text-yellow-400 text-sm font-bold">
                        #{pokemonId}
                    </span>
                </div>

                {/* Image */}
                <div className="bg-gray-800 rounded-lg flex-1 flex items-center justify-center overflow-hidden mb-3">
                    <img
                        src={metadata.image}
                        alt={metadata.name}
                        className="w-full h-full object-contain p-2"
                        onError={(e) => { e.target.src = '/placeholder.png'; }}
                    />
                </div>

                {/* Price/Bid info */}
                {showPrice && price && (
                    <div className="bg-gray-800 rounded-lg px-3 py-2 mb-2">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400 text-xs">Current Bid</span>
                            <span className="text-white font-bold">{price} ETH</span>
                        </div>
                        {endTime && (
                            <div className="flex justify-between items-center mt-1">
                                <span className="text-gray-400 text-xs">Ends in</span>
                                <span className="text-gray-300 text-sm">{formatTimeRemaining(endTime)}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Token ID */}
                {tokenId !== undefined && !showPrice && (
                    <div className="bg-gray-800 rounded px-2 py-1">
                        <span className="text-gray-400 text-xs">Token: </span>
                        <span className="text-white text-xs font-mono">{tokenId}</span>
                    </div>
                )}

                {/* Attributes */}
                {!showPrice && metadata.attributes && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {metadata.attributes.slice(0, 2).map((attr, i) => (
                            <span
                                key={i}
                                className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded capitalize"
                            >
                                {attr.value}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
