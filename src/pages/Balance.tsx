import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet, ArrowUpRight, ArrowDownLeft, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useSession } from "@/context/SessionContext";
import { meApi, Transaction } from "@/api/me";
import { formatCurrency } from "@/lib/utils";

const Balance = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading } = useSession();
  const [balance, setBalance] = useState(0);
  const [pendingBalance, setPendingBalance] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsTotal, setTransactionsTotal] = useState(0);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (!loading && !user) {
      navigate("/auth");
      return;
    }
    if (user) {
      loadBalance();
      loadTransactions();
    }
  }, [user, loading, navigate]);

  const loadBalance = async () => {
    try {
      const data = await meApi.balance();
      setBalance(data.available_balance || 0);
      setPendingBalance(data.pending_balance || 0);
    } catch (error) {
      // Silently fail - balance will show 0
    }
  };

  const loadTransactions = async () => {
    try {
      const { transactions, total } = await meApi.transactions();
      setTransactions(transactions);
      setTransactionsTotal(total);
      setCurrentPage(1);
    } catch (error) {
      // Silently fail - transactions will be empty
    }
  };

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast({
        title: "Invalid input",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    try {
      const amount = parseFloat(depositAmount);
      await meApi.deposit(amount);

      toast({
        title: "Deposit successful!",
        description: `$${amount} has been added to your balance`,
      });

      setDepositDialogOpen(false);
      setDepositAmount("");
      loadBalance();
      loadTransactions();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      toast({
        title: "Invalid input",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(withdrawAmount);

    if (amount > balance) {
      toast({
        title: "Insufficient balance",
        description: "You don't have enough funds to withdraw",
        variant: "destructive",
      });
      return;
    }

    try {
      await meApi.withdraw(amount);

      toast({
        title: "Withdrawal initiated!",
        description: `$${amount} withdrawal is being processed`,
      });

      setWithdrawDialogOpen(false);
      setWithdrawAmount("");
      loadBalance();
      loadTransactions();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Pagination calculations
  const totalPages = Math.ceil(transactions.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentTransactions = useMemo(
    () => transactions.slice(startIndex, endIndex),
    [transactions, startIndex, endIndex]
  );

  if (loading || !user) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold mb-8 bg-gradient-primary bg-clip-text text-transparent">
            Your Balance
          </h1>

          {/* Balance Card */}
          <Card className="bg-gradient-card border-border mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                Available Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <p className="text-5xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-2">
                  ${formatCurrency(balance)}
                </p>
                <p className="text-sm text-muted-foreground">Available to withdraw</p>
                {pendingBalance > 0 && (
                  <>
                    <p className="text-sm text-muted-foreground mt-2">
                      On hold (bids): ${formatCurrency(pendingBalance)}
                    </p>
                    <div className="mt-4 p-4 bg-muted/50 rounded-lg text-left">
                      <p className="text-xs text-muted-foreground">
                        <strong>How to get your money back:</strong>
                      </p>
                      <ul className="text-xs text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                        <li>Cancel your bid on the artwork page to get an immediate refund</li>
                        <li>If the auction ends and you lose, funds automatically return</li>
                        <li>If you win the auction, you'll receive the artwork</li>
                      </ul>
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <Button
                  onClick={() => setDepositDialogOpen(true)}
                  className="bg-gradient-primary hover:bg-gradient-hover gap-2"
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  Deposit
                </Button>
                <Button
                  onClick={() => setWithdrawDialogOpen(true)}
                  variant="outline"
                  className="gap-2"
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Withdraw
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Balance History */}
          <Card className="bg-gradient-card border-border">
            <CardHeader>
              <CardTitle>Balance History</CardTitle>
            </CardHeader>
            <CardContent>
              {transactions.length > 0 ? (
                <>
                  <div className="space-y-3">
                    {currentTransactions.map((transaction) => {
                    // Format transaction type for display with clear, user-friendly labels
                    const getTransactionDisplay = (type: string) => {
                      const typeMap: Record<string, { title: string; subtitle: string }> = {
                        'deposit': { title: 'Deposit', subtitle: 'Funds added to wallet' },
                        'withdrawal': { title: 'Withdrawal', subtitle: 'Funds withdrawn' },
                        'bid': { title: 'Auction Bid', subtitle: 'Funds reserved for bid' },
                        'bid_refund': { title: 'Bid Refunded', subtitle: 'Funds returned to wallet' },
                        'bid_increase': { title: 'Bid Updated', subtitle: 'Additional funds reserved' },
                        'bid_decrease': { title: 'Bid Reduced', subtitle: 'Excess funds returned' },
                        'purchase': { title: 'Artwork Purchased', subtitle: 'Artwork added to collection' },
                        'sale': { title: 'Artwork Sold', subtitle: 'Payment received' },
                      };
                      return typeMap[type] || { 
                        title: type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' '), 
                        subtitle: '' 
                      };
                    };

                    // Determine if it's a credit or debit
                    const isCredit = transaction.type === "deposit" || 
                                    transaction.type === "bid_refund" || 
                                    transaction.type === "bid_decrease" ||
                                    transaction.type === "sale";
                    
                    // Get user-friendly status based on transaction type and status
                    const getStatusDisplay = (status: string, type: string) => {
                      // Completed transactions - show appropriate success message
                      if (status === "completed") {
                        switch (type) {
                          case "withdrawal": return "Approved";
                          case "deposit": return "Received";
                          case "bid_refund": return "Returned";
                          case "bid_decrease": return "Returned";
                          case "purchase": return "Paid";
                          case "sale": return "Received";
                          default: return "Complete";
                        }
                      }
                      
                      // Pending transactions - show appropriate pending message
                      if (status === "pending") {
                        switch (type) {
                          case "bid": return "On Hold";
                          case "bid_increase": return "On Hold";
                          case "withdrawal": return "Processing";
                          default: return "Pending";
                        }
                      }
                      
                      if (status === "cancelled") return "Cancelled";
                      if (status === "failed") return "Failed";
                      
                      return status.charAt(0).toUpperCase() + status.slice(1);
                    };
                    
                    const display = getTransactionDisplay(transaction.type);

                    return (
                      <div
                        key={transaction.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${
                              isCredit
                                ? "bg-green-500/20 text-green-500"
                                : "bg-red-500/20 text-red-500"
                            }`}
                          >
                            {isCredit ? (
                              <ArrowDownLeft className="w-5 h-5" />
                            ) : (
                              <ArrowUpRight className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium">{display.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {display.subtitle}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Date(transaction.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className={`text-lg font-bold ${
                              isCredit
                                ? "text-green-500"
                                : "text-red-500"
                            }`}
                          >
                            {isCredit ? "+" : "-"}$
                            {formatCurrency(transaction.amount)}
                          </p>
                        <Badge
                          variant={
                            transaction.status === "completed"
                              ? "default"
                              : transaction.status === "pending"
                              ? "secondary"
                              : "destructive"
                          }
                          className="capitalize"
                        >
                          {getStatusDisplay(transaction.status, transaction.type)}
                        </Badge>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                  
                  {totalPages > 1 && (
                    <Pagination className="mt-6">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious 
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                        
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                          <PaginationItem key={page}>
                            <PaginationLink
                              onClick={() => setCurrentPage(page)}
                              isActive={currentPage === page}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        ))}
                        
                        <PaginationItem>
                          <PaginationNext 
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">No transactions yet</p>
                  <p className="text-sm text-muted-foreground">
                    Your transaction history will appear here once you make a purchase or deposit.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Deposit Dialog */}
      <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Deposit Funds</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
            <Button
              onClick={handleDeposit}
              disabled={!depositAmount}
              className="w-full"
            >
              Deposit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Withdraw Dialog */}
      <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Withdraw Funds</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                className="bg-secondary border-border"
              />
            </div>
            
            <Button
              onClick={handleWithdraw}
              disabled={!withdrawAmount}
              className="w-full"
            >
              Withdraw
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Withdrawals are processed internally; allow 1-2 business days.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Balance;
