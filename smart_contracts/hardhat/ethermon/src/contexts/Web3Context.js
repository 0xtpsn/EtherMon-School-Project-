// modular wallet connector

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
                await window.ethereum.request({method: 'eth_requestAccounts'});

                const _provider = new ethers.BrowserProvider(window.ethereum);
                const _signer = await _provider.getSigner();
                const _account = await _signer.getAddress();

                setProvider(_provider);
                setSigner(_signer);
                setAccount(_account);
            } catch (error) {
                console.log(error)
                console.error("Metamask connection denied")
            }
        } else {
            alert("Metamask wallet required for use!");
        }
    }

    // account switch listener
    useEffect(() => {
        if (window.ethereum) {
            function handleAccounts(accounts) {
                if (accounts.length > 0) {
                    window.location.reload();
                } else {
                    setAccount(null);
                }
            }
        }
        window.ethereum.on('accountsChanged', handleAccounts);
        window.ethereum.on('chainChanged', () => window.location.reload());
    }, []);

    return (
        <Web3Context.Provider value = {{account, provider, signer, connectWallet}}>
            {children}
        </Web3Context.Provider>
    )
}

