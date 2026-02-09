import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { BrowserProvider, JsonRpcSigner } from "ethers";

// Sepolia testnet chain ID
const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111 in hex
const SEPOLIA_CHAIN_CONFIG = {
    chainId: SEPOLIA_CHAIN_ID,
    chainName: "Sepolia Testnet",
    nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
    rpcUrls: ["https://rpc.sepolia.org"],
    blockExplorerUrls: ["https://sepolia.etherscan.io"],
};

/** Detected wallet provider info */
export interface WalletOption {
    id: string;
    name: string;
    icon: string;
    provider: any; // EIP-1193 provider
}

/** Detect all available wallet providers in the browser */
export function detectWallets(): WalletOption[] {
    const wallets: WalletOption[] = [];
    if (typeof window === "undefined") return wallets;

    const eth = window.ethereum as any;

    // Gather all providers from the multi-provider array
    // When multiple extensions compete, they populate this array
    const providers: any[] = eth?.providers ?? [];

    // Also check providerMap (some setups use Map instead of array)
    const providerMap: Map<string, any> | undefined = eth?.providerMap;

    // --- MetaMask ---
    // 1. Check providers array for the real MetaMask (isMetaMask && !isPhantom)
    let metamask = providers.find(
        (p: any) => p.isMetaMask && !p.isPhantom && !p.isBraveWallet
    );
    // 2. Check providerMap
    if (!metamask && providerMap) {
        metamask = providerMap.get("MetaMask");
    }
    // 3. Check top-level only if it's genuinely MetaMask (not Phantom faking it)
    if (!metamask && eth?.isMetaMask && !eth?.isPhantom && !eth?.phantom) {
        metamask = eth;
    }
    if (metamask) {
        wallets.push({
            id: "metamask",
            name: "MetaMask",
            icon: "🦊",
            provider: metamask,
        });
    }

    // --- Phantom ---
    // Phantom has its own dedicated namespace
    const phantomProvider = (window as any).phantom?.ethereum;
    if (phantomProvider) {
        wallets.push({
            id: "phantom",
            name: "Phantom",
            icon: "👻",
            provider: phantomProvider,
        });
    }

    // --- Coinbase Wallet ---
    const coinbase =
        providers.find((p: any) => p.isCoinbaseWallet) ??
        (eth?.isCoinbaseWallet ? eth : null) ??
        (providerMap?.get("CoinbaseWallet") ?? null);
    if (coinbase) {
        wallets.push({
            id: "coinbase",
            name: "Coinbase Wallet",
            icon: "🔵",
            provider: coinbase,
        });
    }

    // Fallback — generic window.ethereum if nothing matched
    if (wallets.length === 0 && eth) {
        wallets.push({
            id: "injected",
            name: "Browser Wallet",
            icon: "🌐",
            provider: eth,
        });
    }

    return wallets;
}

interface WalletContextValue {
    address: string | null;
    signer: JsonRpcSigner | null;
    provider: BrowserProvider | null;
    chainId: string | null;
    isConnecting: boolean;
    isCorrectNetwork: boolean;
    connectedWalletId: string | null;
    connectWithProvider: (wallet: WalletOption) => Promise<void>;
    disconnect: () => void;
    switchToSepolia: () => Promise<void>;
    /** Open the wallet selector — managed by Navbar dialog */
    showSelector: boolean;
    setShowSelector: (open: boolean) => void;
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

export const WalletProvider = ({ children }: { children: ReactNode }) => {
    const [address, setAddress] = useState<string | null>(null);
    const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
    const [provider, setProvider] = useState<BrowserProvider | null>(null);
    const [chainId, setChainId] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [rawProvider, setRawProvider] = useState<any>(null);
    const [connectedWalletId, setConnectedWalletId] = useState<string | null>(null);
    const [showSelector, setShowSelector] = useState(false);

    const isCorrectNetwork = chainId === SEPOLIA_CHAIN_ID;

    const switchToSepolia = useCallback(async () => {
        if (!rawProvider) return;
        try {
            await rawProvider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: SEPOLIA_CHAIN_ID }],
            });
        } catch (switchError: any) {
            if (switchError.code === 4902) {
                await rawProvider.request({
                    method: "wallet_addEthereumChain",
                    params: [SEPOLIA_CHAIN_CONFIG],
                });
            }
        }
    }, [rawProvider]);

    const connectWithProvider = useCallback(
        async (wallet: WalletOption) => {
            setIsConnecting(true);
            try {
                const ethProvider = wallet.provider;
                const browserProvider = new BrowserProvider(ethProvider);
                await browserProvider.send("eth_requestAccounts", []);
                const walletSigner = await browserProvider.getSigner();
                const walletAddress = await walletSigner.getAddress();
                const network = await browserProvider.getNetwork();
                const currentChainId = "0x" + network.chainId.toString(16);

                setRawProvider(ethProvider);
                setProvider(browserProvider);
                setSigner(walletSigner);
                setAddress(walletAddress);
                setChainId(currentChainId);
                setConnectedWalletId(wallet.id);

                // Auto-switch to Sepolia if on wrong network
                if (currentChainId !== SEPOLIA_CHAIN_ID) {
                    try {
                        await ethProvider.request({
                            method: "wallet_switchEthereumChain",
                            params: [{ chainId: SEPOLIA_CHAIN_ID }],
                        });
                    } catch (switchError: any) {
                        if (switchError.code === 4902) {
                            await ethProvider.request({
                                method: "wallet_addEthereumChain",
                                params: [SEPOLIA_CHAIN_CONFIG],
                            });
                        }
                    }
                }

                // Register/login wallet user in the backend
                try {
                    await fetch("http://localhost:5002/api/auth/wallet", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ wallet_address: walletAddress }),
                    });
                } catch (backendErr) {
                    console.warn("Backend wallet auth failed (backend may be offline):", backendErr);
                }

                // Persist connection preference
                localStorage.setItem("walletConnected", "true");
                localStorage.setItem("walletProvider", wallet.id);
                setShowSelector(false);
            } catch (error) {
                console.error("Failed to connect wallet:", error);
            } finally {
                setIsConnecting(false);
            }
        },
        []
    );

    const disconnect = useCallback(() => {
        setAddress(null);
        setSigner(null);
        setProvider(null);
        setChainId(null);
        setRawProvider(null);
        setConnectedWalletId(null);
        localStorage.removeItem("walletConnected");
        localStorage.removeItem("walletProvider");
    }, []);

    // Listen for account and chain changes
    useEffect(() => {
        if (!rawProvider) return;

        const handleAccountsChanged = (accounts: string[]) => {
            if (accounts.length === 0) {
                disconnect();
            } else {
                setAddress(accounts[0]);
                const browserProvider = new BrowserProvider(rawProvider);
                browserProvider.getSigner().then(setSigner);
                setProvider(browserProvider);
            }
        };

        const handleChainChanged = (newChainId: string) => {
            setChainId(newChainId);
            const browserProvider = new BrowserProvider(rawProvider);
            setProvider(browserProvider);
            browserProvider.getSigner().then(setSigner).catch(() => { });
        };

        rawProvider.on("accountsChanged", handleAccountsChanged);
        rawProvider.on("chainChanged", handleChainChanged);

        return () => {
            rawProvider?.removeListener?.("accountsChanged", handleAccountsChanged);
            rawProvider?.removeListener?.("chainChanged", handleChainChanged);
        };
    }, [rawProvider, disconnect]);

    // Auto-reconnect on page load if previously connected
    useEffect(() => {
        const wasConnected = localStorage.getItem("walletConnected");
        const savedProviderId = localStorage.getItem("walletProvider");
        if (wasConnected === "true" && savedProviderId) {
            const wallets = detectWallets();
            const savedWallet = wallets.find((w) => w.id === savedProviderId);
            if (savedWallet) {
                connectWithProvider(savedWallet);
            }
        }
    }, [connectWithProvider]);

    return (
        <WalletContext.Provider
            value={{
                address,
                signer,
                provider,
                chainId,
                isConnecting,
                isCorrectNetwork,
                connectedWalletId,
                connectWithProvider,
                disconnect,
                switchToSepolia,
                showSelector,
                setShowSelector,
            }}
        >
            {children}
        </WalletContext.Provider>
    );
};

export const useWallet = () => {
    const ctx = useContext(WalletContext);
    if (!ctx) {
        throw new Error("useWallet must be used within WalletProvider");
    }
    return ctx;
};
