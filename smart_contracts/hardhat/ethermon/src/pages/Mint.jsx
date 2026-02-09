import { useState, useContext } from 'react';
import { ethers } from 'ethers';
import { Web3Context } from '../context/Web3Context';

export function Mint() {
    const { account, nftContract, connectWallet } = useContext(Web3Context);
    const [quantity, setQuantity] = useState(1);
    const [minting, setMinting] = useState(false);
    const [txHash, setTxHash] = useState(null);
    const [error, setError] = useState(null);

    const MINT_PRICE = 0.01; // ETH per NFT - must match contract
    const MAX_PER_TX = 50;

    const totalCost = (quantity * MINT_PRICE).toFixed(4);

    async function handleMint() {
        if (!nftContract) return;

        setMinting(true);
        setError(null);
        setTxHash(null);

        try {
            const value = ethers.parseEther((quantity * MINT_PRICE).toString());
            const tx = await nftContract.mint(quantity, { value });
            setTxHash(tx.hash);

            await tx.wait();
            setMinting(false);
        } catch (err) {
            console.error(err);
            setError(err.reason || err.message || 'Mint failed');
            setMinting(false);
        }
    }

    return (
        <div className="min-h-screen bg-black text-white">
            <div className="max-w-4xl mx-auto px-6 py-16">
                <h1 className="text-5xl font-bold text-center mb-4">
                    Mint Your Pokemon
                </h1>
                <p className="text-neutral-400 text-center text-lg mb-12">
                    Each mint reveals a random Pokemon from all 1025 species!
                </p>

                {/* Mint Card */}
                <div className="bg-neutral-900 rounded-2xl p-8 max-w-md mx-auto border border-neutral-800">
                    <div className="flex justify-between items-center mb-6 pb-4 border-b border-neutral-800">
                        <span className="text-neutral-400">Price per mint</span>
                        <span className="text-xl font-bold text-white">{MINT_PRICE} ETH</span>
                    </div>

                    {/* Quantity */}
                    <div className="mb-6">
                        <label className="text-neutral-400 text-sm mb-2 block">Quantity</label>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                className="w-12 h-12 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xl font-bold transition-colors border border-neutral-700"
                                disabled={minting}
                            >
                                -
                            </button>
                            <input
                                type="number"
                                value={quantity}
                                onChange={(e) => setQuantity(Math.min(MAX_PER_TX, Math.max(1, parseInt(e.target.value) || 1)))}
                                className="w-20 h-12 bg-neutral-800 rounded-lg text-center text-xl font-bold focus:outline-none focus:ring-2 focus:ring-white border border-neutral-700"
                                min={1}
                                max={MAX_PER_TX}
                                disabled={minting}
                            />
                            <button
                                onClick={() => setQuantity(Math.min(MAX_PER_TX, quantity + 1))}
                                className="w-12 h-12 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xl font-bold transition-colors border border-neutral-700"
                                disabled={minting}
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* Total */}
                    <div className="flex justify-between items-center mb-6 p-4 bg-black rounded-lg border border-neutral-800">
                        <span className="text-neutral-400">Total</span>
                        <span className="text-2xl font-bold text-white">{totalCost} ETH</span>
                    </div>

                    {/* Button */}
                    {!account ? (
                        <button
                            onClick={connectWallet}
                            className="w-full py-4 rounded-xl bg-white hover:bg-neutral-200 text-black font-bold text-lg transition-all"
                        >
                            Connect Wallet
                        </button>
                    ) : (
                        <button
                            onClick={handleMint}
                            disabled={minting}
                            className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${minting
                                ? 'bg-neutral-700 cursor-not-allowed text-neutral-400'
                                : 'bg-white hover:bg-neutral-200 text-black'
                                }`}
                        >
                            {minting ? 'Minting...' : `Mint ${quantity} Pokemon`}
                        </button>
                    )}

                    {/* Status */}
                    {txHash && (
                        <div className="mt-4 p-3 bg-green-900/30 border border-green-700 rounded-lg">
                            <p className="text-green-400 text-sm">
                                Success!{' '}
                                <a
                                    href={`https://sepolia.etherscan.io/tx/${txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline hover:text-green-300"
                                >
                                    View on Etherscan
                                </a>
                            </p>
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
                            <p className="text-red-400 text-sm">{error}</p>
                        </div>
                    )}
                </div>

                <div className="mt-12 text-center text-neutral-500 text-sm">
                    <p>Max 50 per wallet • Sale must be active</p>
                    <p className="mt-1">Network: Sepolia Testnet</p>
                </div>
            </div>
        </div>
    );
}
