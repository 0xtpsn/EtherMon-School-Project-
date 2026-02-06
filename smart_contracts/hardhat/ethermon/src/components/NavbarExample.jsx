import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { Web3Context } from '../context/Web3Context';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';

export function NavbarExample() {
    const { account, connectWallet, disconnectWallet } = useContext(Web3Context);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Format wallet address for display
    const formatAddress = (addr) => {
        if (!addr) return '';
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    };

    return (
        <nav className="bg-gradient-to-r from-purple-900 via-indigo-900 to-blue-900 shadow-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16">
                    {/* Logo */}
                    <div className="flex-shrink-0">
                        <Link to="/" className="flex items-center">
                            <span className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                                ⚡ EtherMon
                            </span>
                        </Link>
                    </div>

                    {/* Desktop Navigation */}
                    <div className="hidden md:flex items-center space-x-8">
                        <Link
                            to="/"
                            className="text-gray-300 hover:text-white transition-colors duration-200 font-medium"
                        >
                            Home
                        </Link>
                        <Link
                            to="/collection"
                            className="text-gray-300 hover:text-white transition-colors duration-200 font-medium"
                        >
                            Collection
                        </Link>
                        <Link
                            to="/marketplace"
                            className="text-gray-300 hover:text-white transition-colors duration-200 font-medium"
                        >
                            Marketplace
                        </Link>
                        <Link
                            to="/battle"
                            className="text-gray-300 hover:text-white transition-colors duration-200 font-medium"
                        >
                            Battle
                        </Link>
                    </div>

                    {/* Wallet Connection */}
                    <div className="hidden md:flex items-center">
                        {account ? (
                            <Menu as="div" className="relative">
                                <MenuButton className="flex items-center space-x-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 transition-all duration-200">
                                    <span className="w-2 h-2 bg-green-300 rounded-full animate-pulse"></span>
                                    <span>{formatAddress(account)}</span>
                                </MenuButton>
                                <MenuItems className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-1 z-50">
                                    <MenuItem>
                                        {({ active }) => (
                                            <Link
                                                to="/profile"
                                                className={`block px-4 py-2 text-sm ${active ? 'bg-gray-700 text-white' : 'text-gray-300'}`}
                                            >
                                                My Profile
                                            </Link>
                                        )}
                                    </MenuItem>
                                    <MenuItem>
                                        {({ active }) => (
                                            <Link
                                                to="/my-monsters"
                                                className={`block px-4 py-2 text-sm ${active ? 'bg-gray-700 text-white' : 'text-gray-300'}`}
                                            >
                                                My Monsters
                                            </Link>
                                        )}
                                    </MenuItem>
                                    <MenuItem>
                                        {({ active }) => (
                                            <button
                                                onClick={disconnectWallet}
                                                className={`block w-full text-left px-4 py-2 text-sm ${active ? 'bg-red-600 text-white' : 'text-red-400'}`}
                                            >
                                                Disconnect
                                            </button>
                                        )}
                                    </MenuItem>
                                </MenuItems>
                            </Menu>
                        ) : (
                            <button
                                onClick={connectWallet}
                                className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-2 rounded-lg font-medium hover:from-purple-600 hover:to-pink-600 transition-all duration-200 shadow-lg hover:shadow-purple-500/25"
                            >
                                Connect Wallet
                            </button>
                        )}
                    </div>

                    {/* Mobile menu button */}
                    <div className="md:hidden">
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="text-gray-300 hover:text-white p-2"
                        >
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                {mobileMenuOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                )}
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Mobile Navigation */}
                {mobileMenuOpen && (
                    <div className="md:hidden pb-4">
                        <div className="flex flex-col space-y-2">
                            <Link to="/" className="text-gray-300 hover:text-white px-3 py-2 rounded-md">Home</Link>
                            <Link to="/collection" className="text-gray-300 hover:text-white px-3 py-2 rounded-md">Collection</Link>
                            <Link to="/marketplace" className="text-gray-300 hover:text-white px-3 py-2 rounded-md">Marketplace</Link>
                            <Link to="/battle" className="text-gray-300 hover:text-white px-3 py-2 rounded-md">Battle</Link>
                            {account ? (
                                <button
                                    onClick={disconnectWallet}
                                    className="text-left text-red-400 hover:text-red-300 px-3 py-2 rounded-md"
                                >
                                    Disconnect ({formatAddress(account)})
                                </button>
                            ) : (
                                <button
                                    onClick={connectWallet}
                                    className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-2 rounded-lg font-medium mt-2"
                                >
                                    Connect Wallet
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </nav>
    );
}
