import { useContext, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Web3Context } from '../context/Web3Context';

export function Navbar() {
    const { account, connectWallet, disconnectWallet } = useContext(Web3Context);
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <nav className="flex justify-between items-center px-6 py-4 bg-black border-b border-neutral-800">
            {/* Logo */}
            <Link to="/" className="text-2xl font-bold text-white hover:text-neutral-300 transition-colors">
                EtherMon
            </Link>

            {/* Nav Links */}
            <div className="flex gap-8">
                <Link to="/mint" className="text-neutral-400 hover:text-white transition-colors">
                    Mint
                </Link>
                <Link to="/marketplace" className="text-neutral-400 hover:text-white transition-colors">
                    Marketplace
                </Link>
                <Link to="/collection" className="text-neutral-400 hover:text-white transition-colors">
                    My Collection
                </Link>
            </div>

            {/* Wallet Button with Dropdown */}
            <div className="relative" ref={dropdownRef}>
                {account ? (
                    <>
                        <button
                            onClick={() => setShowDropdown(!showDropdown)}
                            className="bg-white hover:bg-neutral-200 text-black font-semibold px-4 py-2 rounded-lg transition-colors"
                        >
                            {account.slice(0, 6)}...{account.slice(-4)}
                        </button>

                        {showDropdown && (
                            <div className="absolute right-0 mt-2 w-48 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50">
                                <div className="px-4 py-3 border-b border-neutral-700">
                                    <p className="text-xs text-neutral-400">Connected</p>
                                    <p className="text-sm text-white font-mono truncate">{account}</p>
                                </div>
                                <button
                                    onClick={() => {
                                        disconnectWallet();
                                        setShowDropdown(false);
                                    }}
                                    className="w-full px-4 py-3 text-left text-red-400 hover:bg-neutral-800 rounded-b-lg transition-colors"
                                >
                                    Sign Out
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <button
                        onClick={connectWallet}
                        className="bg-white hover:bg-neutral-200 text-black font-semibold px-4 py-2 rounded-lg transition-colors"
                    >
                        Connect Wallet
                    </button>
                )}
            </div>
        </nav>
    );
}