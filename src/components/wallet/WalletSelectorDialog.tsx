import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useWallet, detectWallets, WalletOption } from "@/context/WalletContext";
import { useMemo } from "react";
import { Loader2 } from "lucide-react";

const WalletSelectorDialog = () => {
    const { showSelector, setShowSelector, connectWithProvider, isConnecting } = useWallet();
    const wallets = useMemo(() => detectWallets(), [showSelector]);

    const handleSelect = async (wallet: WalletOption) => {
        await connectWithProvider(wallet);
    };

    return (
        <Dialog open={showSelector} onOpenChange={setShowSelector}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold">Connect Wallet</DialogTitle>
                    <DialogDescription>
                        Choose a wallet to connect to EtherMon on Sepolia
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3 mt-4">
                    {wallets.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-4xl mb-4">🔌</p>
                            <p className="text-muted-foreground mb-4">
                                No wallets detected
                            </p>
                            <Button
                                variant="outline"
                                onClick={() =>
                                    window.open("https://metamask.io/download/", "_blank")
                                }
                            >
                                Install MetaMask
                            </Button>
                        </div>
                    ) : (
                        wallets.map((wallet) => (
                            <Button
                                key={wallet.id}
                                variant="outline"
                                className="w-full h-14 justify-between text-base font-medium hover:bg-accent transition-colors"
                                onClick={() => handleSelect(wallet)}
                                disabled={isConnecting}
                            >
                                <span className="flex items-center gap-3">
                                    <span className="text-2xl">{wallet.icon}</span>
                                    <span>{wallet.name}</span>
                                </span>
                                {isConnecting ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                ) : (
                                    <span className="text-muted-foreground text-sm">→</span>
                                )}
                            </Button>
                        ))
                    )}
                </div>

                <p className="text-xs text-muted-foreground text-center mt-4">
                    By connecting, you agree to interact with the Sepolia testnet
                </p>
            </DialogContent>
        </Dialog>
    );
};

export default WalletSelectorDialog;
