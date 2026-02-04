import React, { createContext, useState, useEffect } from 'react';
import { ethers } from 'ethers';

export const Web3Context = createContext();

export function Web3Provider({ children }) {
    const [account, setAccount] = useState(null);
    const [provider, setProvider] = useState(null);
    const [signer, setSigner] = useState(null);

    async function connectWallet() {
        if (window.ethereum) {
            try {
                await window.ethereum.request({ method: 'eth_requestAccounts' });

                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();
                const account = await signer.getAddress();

                setProvider(provider);
                setSigner(signer);
                setAccount(account);
            } catch (error) {
                console.log(error);
                console.error("Wallet connection denied");
            }
        }
    }

    // avoid prop drill here
    useEffect(() => {
        // reload window if account
        if (window.ethereum) {
            function handleAccounts(accounts) {
                if (accounts.length > 0) {
                    window.location.reload();
                } else {
                    setAccount(null);
                }
            };

            // reload window if chain swap
            function handleChain() {
                window.location.reload()
            };
            window.ethereum.on('accountsChanged', handleAccounts);
            window.ethereum.on('chainChanged', () => window.location.reload());

            // cleanup after useEffect
            return () => {
                window.ethereum.removeListener('accountsChanged', handleAccounts);
                window.ethereum.removeListener('chainChanged', handleChain);
            }
        }
    }, []);     // runs once when component mounts, no need for rerender run

    return (
        <Web3Context.Provider value={{ account, provider, signer, connectWallet }}>
            {children}
        </Web3Context.Provider>
    );
}