import { createContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';
import PokechainNFT from '../contracts/PokechainNFT.json';
import PokechainMarket from '../contracts/PokechainMarketplace.json';

export const Web3Context = createContext();

const NFT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const MARKETPLACE_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

export function Web3Provider({ children }) {
    const [provider, setProvider] = useState(null);
    const [account, setAccount] = useState(null);
    const [signer, setSigner] = useState(null);
    const [nftContract, setNftContract] = useState(null);
    const [marketplaceContract, setMarketplaceContract] = useState(null);

    // Setup contracts and state after getting signer
    async function setupContracts(walletSigner, walletAddress) {
        const nft = new ethers.Contract(NFT_ADDRESS, PokechainNFT.abi, walletSigner);
        const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, PokechainMarket.abi, walletSigner);

        setSigner(walletSigner);
        setAccount(walletAddress);
        setNftContract(nft);
        setMarketplaceContract(marketplace);
    }

    function disconnectWallet() {
        setAccount(null);
        setSigner(null);
        setProvider(null);
        setNftContract(null);
        setMarketplaceContract(null);
    }

    async function connectWallet() {
        if (window.ethereum) {
            try {
                await window.ethereum.request({ method: 'eth_requestAccounts' });

                const browserProvider = new ethers.BrowserProvider(window.ethereum);
                setProvider(browserProvider);

                const walletSigner = await browserProvider.getSigner();
                const walletAddress = await walletSigner.getAddress();

                await setupContracts(walletSigner, walletAddress);
            } catch (error) {
                console.error("Wallet connection failed:", error);
            }
        } else {
            console.error("No ethereum wallet found");
        }
    }

    // Auto-reconnect on page load if already connected
    useEffect(() => {
        async function checkConnection() {
            if (window.ethereum) {
                try {
                    // Check if already connected (doesn't trigger popup)
                    const accounts = await window.ethereum.request({ method: 'eth_accounts' });

                    if (accounts.length > 0) {
                        const browserProvider = new ethers.BrowserProvider(window.ethereum);
                        setProvider(browserProvider);

                        const walletSigner = await browserProvider.getSigner();
                        const walletAddress = await walletSigner.getAddress();

                        await setupContracts(walletSigner, walletAddress);
                    }
                } catch (error) {
                    console.error("Auto-connect failed:", error);
                }
            }
        }

        checkConnection();
    }, []);

    // Listen for account/chain changes
    useEffect(() => {
        if (window.ethereum) {
            function handleAccounts(accounts) {
                if (accounts.length > 0) {
                    window.location.reload();
                } else {
                    setAccount(null);
                    setSigner(null);
                    setNftContract(null);
                    setMarketplaceContract(null);
                }
            }

            function handleChain() {
                window.location.reload();
            }

            window.ethereum.on('accountsChanged', handleAccounts);
            window.ethereum.on('chainChanged', handleChain);

            return () => {
                window.ethereum.removeListener('accountsChanged', handleAccounts);
                window.ethereum.removeListener('chainChanged', handleChain);
            };
        }
    }, []);

    return (
        <Web3Context.Provider value={{
            account,
            provider,
            signer,
            nftContract,
            marketplaceContract,
            connectWallet,
            disconnectWallet
        }}>
            {children}
        </Web3Context.Provider>
    );
}