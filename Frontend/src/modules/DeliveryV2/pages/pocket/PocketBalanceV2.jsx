import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, AlertTriangle, Loader2, IndianRupee,
  HelpCircle, ChevronRight
} from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import { formatCurrency } from '@food/utils/currency';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

const toNum = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const derivePocketBalanceFromTransactions = (transactions = []) => {
  if (!Array.isArray(transactions) || transactions.length === 0) return 0;
  return transactions.reduce((sum, tx) => {
    const type = String(tx?.type || "").trim().toLowerCase();
    const status = String(tx?.status || "").trim().toLowerCase();
    const amount = toNum(tx?.amount);
    if (amount <= 0) return sum;

    if (type === "withdrawal") {
      if (status === "completed" || status === "approved" || status === "pending") return sum - amount;
      return sum;
    }

    if (type === "payment" || type === "earning_addon" || type === "bonus") {
      if (!status || status === "completed" || status === "approved" || status === "paid") return sum + amount;
    }
    return sum;
  }, 0);
};

/**
 * PocketBalanceV2 - 1:1 Match with Old PocketBalance Page.
 * Features: Big Withdraw amount display, Withdraw button, and Detail rows.
 * Background: #f6e9dc
 * Font: Poppins
 */
export const PocketBalanceV2 = () => {
  const navigate = useNavigate();
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [walletState, setWalletState] = useState({
     pocketBalance: 0,
     weeklyEarnings: 0,
     totalBonus: 0,
     totalWithdrawn: 0,
     cashCollected: 0,
     deductions: 0,
     withdrawalLimit: 100,
     withdrawableAmount: 0,
     canWithdraw: false
  });
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [earningsRes, walletRes] = await Promise.allSettled([
          deliveryAPI.getEarnings({ period: 'week' }),
          deliveryAPI.getWallet()
        ]);

        const summary =
          (earningsRes.status === "fulfilled" && earningsRes.value?.data?.data?.summary) ||
          {};
        const wallet =
          (walletRes.status === "fulfilled" && walletRes.value?.data?.data?.wallet) ||
          (walletRes.status === "fulfilled" && walletRes.value?.data?.wallet) ||
          {};
        
        const totalEarned = toNum(wallet.totalEarned ?? wallet.total_earned);
        const totalBonus = toNum(wallet.totalBonus ?? wallet.total_bonus);
        const totalWithdrawn = toNum(wallet.totalWithdrawn ?? wallet.total_withdrawn);
        const pendingWithdrawals = toNum(wallet.pendingWithdrawals ?? wallet.pending_withdrawals);
        const lockedAmount = toNum(wallet.lockedAmount ?? wallet.locked_amount);
        const computedPocketBalance = Math.max(0, (totalEarned + totalBonus) - (totalWithdrawn + pendingWithdrawals));
        const transactionDerivedBalance = Math.max(0, derivePocketBalanceFromTransactions(wallet.transactions));
        const availableWalletBalance = Math.max(0, toNum(wallet.balance) - Math.max(lockedAmount, pendingWithdrawals));
        const pocketBalance = Math.max(
          0,
          toNum(wallet.pocketBalance ?? wallet.pocket_balance),
          availableWalletBalance,
          computedPocketBalance,
          transactionDerivedBalance
        );
        const withdrawalLimit = toNum(wallet.deliveryWithdrawalLimit ?? wallet.delivery_withdrawal_limit) || 100;
        const withdrawableAmount = Math.max(0, pocketBalance);
        const earningsToShow = totalEarned || toNum(summary.totalEarnings) || 0;

        setWalletState({
           pocketBalance: pocketBalance,
           weeklyEarnings: earningsToShow,
           totalBonus: totalBonus,
           totalWithdrawn: totalWithdrawn,
           cashCollected: Number(wallet.cashInHand ?? wallet.cash_in_hand ?? wallet.cashCollected) || 0,
           deductions: 0, // Mocked
           withdrawalLimit,
           withdrawableAmount,
           canWithdraw: withdrawableAmount >= withdrawalLimit
        });
      } catch (err) {
        toast.error('Failed to load pocket details');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleWithdraw = async () => {
     const amount = Number(withdrawAmount);

     if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Enter a valid withdrawal amount");
        return;
     }

     if (amount < walletState.withdrawalLimit) {
        toast.error(`Minimum withdrawal amount is ₹${walletState.withdrawalLimit}`);
        return;
     }

     if (amount > walletState.withdrawableAmount) {
        toast.error(`Amount cannot exceed ₹${walletState.withdrawableAmount.toFixed(2)}`);
        return;
     }

     setWithdrawSubmitting(true);
     try {
        const profileRes = await deliveryAPI.getProfile();
        const profile = profileRes?.data?.data?.profile || {};
        const bank = profile?.documents?.bankDetails;

        if (!bank?.accountNumber) {
           toast.error("Please add bank details first");
           navigate("/food/delivery/profile/details");
           return;
        }

        const res = await deliveryAPI.createWithdrawalRequest({
           amount,
           paymentMethod: 'bank_transfer'
        });
        if (res?.data?.success) {
           toast.success("Withdrawal request submitted");
           setShowWithdrawModal(false);
           setWithdrawAmount("");
           setWalletState((prev) => {
             const nextWithdrawable = Math.max(0, prev.withdrawableAmount - amount);
             return {
               ...prev,
               pocketBalance: Math.max(0, prev.pocketBalance - amount),
               withdrawableAmount: nextWithdrawable,
               canWithdraw: nextWithdrawable >= prev.withdrawalLimit
             };
           });
        }
     } catch (err) {
        toast.error(err?.response?.data?.message || "Withdrawal failed");
     } finally {
        setWithdrawSubmitting(false);
     }
  };

  const DetailRow = ({ label, value, subLabel }) => (
     <div className="py-4 flex justify-between items-start border-b border-gray-100/60 last:border-0">
        <div className="flex-1 pr-4">
           <p className="text-sm font-black text-gray-800 tracking-tight">{label}</p>
           {subLabel && <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-relaxed mt-1">{subLabel}</p>}
        </div>
        <p className="text-sm font-black text-gray-900">{value}</p>
     </div>
  );

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-poppins pb-32">
       {/* Header */}
       <div className="fixed top-0 inset-x-0 h-20 bg-[#f8f9fa]/90 backdrop-blur-xl z-50 px-5 flex items-center justify-between pb-2 pt-6">
          <div className="flex items-center gap-3">
             <button onClick={goBack} className="p-3 bg-white hover:bg-gray-50 border border-gray-100 shadow-sm rounded-[20px] transition-all active:scale-95">
                <ArrowLeft className="w-5 h-5 text-gray-700" />
             </button>
             <h1 className="text-xl font-black text-gray-900 tracking-tight">Pocket Balance</h1>
          </div>
       </div>

       <div className="pt-24 px-5 space-y-4 max-w-lg mx-auto">
       {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
             <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
             <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Loading Balance...</p>
          </div>
       ) : (
          <>
             {/* Warning Banner */}
             {!walletState.canWithdraw && (
               <div className="bg-orange-50 border border-orange-100 p-5 rounded-[28px] flex items-start gap-4">
                  <div className="w-10 h-10 rounded-[16px] bg-orange-100/50 flex items-center justify-center shrink-0">
                     <AlertTriangle className="w-5 h-5 text-orange-500" />
                  </div>
                  <div>
                     <p className="text-sm font-black text-orange-900 tracking-tight mb-0.5">Withdraw Disabled</p>
                     <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest leading-relaxed">
                        {walletState.withdrawableAmount <= 0 ? 'Withdrawable amount is ₹0' : `Minimum withdrawal requirement is ₹${walletState.withdrawalLimit}`}
                     </p>
                  </div>
               </div>
             )}

             {/* Top Withdraw Section */}
             <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.04)] text-center relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-full -mr-16 -mt-16 blur-2xl transition-colors" />
                <div className="relative z-10">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3">Withdrawable Amount</p>
                   <h2 className="text-[56px] font-black text-gray-900 mb-8 tracking-tighter leading-none">₹{walletState.withdrawableAmount.toFixed(0)}</h2>
                   
                   <button 
                     onClick={() => {
                       setWithdrawAmount(String(Math.trunc(walletState.withdrawableAmount || 0)));
                       setShowWithdrawModal(true);
                     }}
                     disabled={!walletState.canWithdraw || withdrawSubmitting}
                     className={`w-full py-4 rounded-[20px] font-black text-sm tracking-widest uppercase transition-all active:scale-[0.98] ${
                        walletState.canWithdraw 
                        ? 'text-white' 
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                     } flex items-center justify-center gap-2`}
                     style={walletState.canWithdraw ? {
                       background: "linear-gradient(135deg, rgba(var(--module-theme-rgb, 0,183,97), 0.88), var(--module-theme-color, #00B761))",
                       boxShadow: "0 8px 20px rgba(var(--module-theme-rgb, 0,183,97), 0.30)",
                     } : undefined}
                   >
                      {withdrawSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                      {withdrawSubmitting ? 'PROCESSING...' : 'WITHDRAW'}
                   </button>
                </div>
             </div>

             {/* Details Section */}
             <div className="pt-4">
                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-2 mb-3">Pocket Details</h3>
                <div className="bg-white rounded-[32px] p-2 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
                   <div className="px-4">
                      <DetailRow label="Earnings" value={formatCurrency(walletState.weeklyEarnings)} />
                      <DetailRow label="Bonus" value={formatCurrency(walletState.totalBonus)} />
                      <DetailRow label="Amount withdrawn" value={formatCurrency(walletState.totalWithdrawn)} />
                      <DetailRow label="Cash collected" value={formatCurrency(walletState.cashCollected)} />
                      <DetailRow label="Deductions" value={formatCurrency(walletState.deductions)} />
                      <DetailRow label="Pocket balance" value={formatCurrency(walletState.pocketBalance)} />
                      <DetailRow 
                         label="Min. withdrawal amount" 
                         value={formatCurrency(walletState.withdrawalLimit)} 
                         subLabel="Withdrawal allowed only when withdrawable amount reaches this limit."
                      />
                      <div className="py-4 flex justify-between items-start border-t border-gray-100 mt-2">
                         <div className="flex-1 pr-4">
                            <p className="text-sm font-black text-gray-900 tracking-tight">Withdrawable amount</p>
                         </div>
                         <p className="text-sm font-black text-emerald-600">{formatCurrency(walletState.withdrawableAmount)}</p>
                      </div>
                   </div>
                </div>
             </div>
          </>
       )}
       </div>

       {showWithdrawModal && (
         <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm px-5 flex items-end sm:items-center justify-center">
           <div className="w-full max-w-md bg-white rounded-[32px] border border-gray-100 shadow-[0_20px_60px_rgba(0,0,0,0.18)] p-6 mb-6 sm:mb-0">
             <div className="flex items-start justify-between gap-4 mb-5">
               <div>
                 <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">Withdrawal Request</p>
                 <h3 className="text-2xl font-black text-gray-900 tracking-tight">How much do you want to withdraw?</h3>
               </div>
               <button
                 onClick={() => {
                   if (withdrawSubmitting) return;
                   setShowWithdrawModal(false);
                   setWithdrawAmount("");
                 }}
                 className="w-10 h-10 rounded-2xl bg-gray-100 text-gray-500 flex items-center justify-center"
               >
                 <ChevronRight className="w-4 h-4 rotate-45" />
               </button>
             </div>

             <div className="mb-4">
               <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.18em] mb-2">
                 Amount
               </label>
               <div className="flex items-center gap-3 rounded-[24px] border border-gray-200 bg-gray-50 px-4 py-4">
                 <IndianRupee className="w-5 h-5 text-gray-500 shrink-0" />
                 <input
                   type="number"
                   min={walletState.withdrawalLimit}
                   max={walletState.withdrawableAmount}
                   step="0.01"
                   value={withdrawAmount}
                   onChange={(e) => setWithdrawAmount(e.target.value)}
                   placeholder="Enter amount"
                   className="w-full bg-transparent text-2xl font-black text-gray-900 outline-none"
                 />
               </div>
               <div className="mt-3 flex items-center justify-between text-[11px] font-bold text-gray-500">
                 <span>Min: {formatCurrency(walletState.withdrawalLimit)}</span>
                 <span>Available: {formatCurrency(walletState.withdrawableAmount)}</span>
               </div>
             </div>

             <div className="grid grid-cols-2 gap-3">
               <button
                 onClick={() => {
                   if (withdrawSubmitting) return;
                   setShowWithdrawModal(false);
                   setWithdrawAmount("");
                 }}
                 className="py-4 rounded-[20px] border border-gray-200 text-sm font-black text-gray-700 tracking-widest uppercase"
               >
                 Cancel
               </button>
               <button
                 onClick={handleWithdraw}
                 disabled={withdrawSubmitting}
                 className="py-4 rounded-[20px] text-sm font-black text-white tracking-widest uppercase flex items-center justify-center gap-2 disabled:opacity-70"
                 style={{
                   background: "linear-gradient(135deg, rgba(var(--module-theme-rgb, 0,183,97), 0.88), var(--module-theme-color, #00B761))",
                   boxShadow: "0 8px 20px rgba(var(--module-theme-rgb, 0,183,97), 0.30)",
                 }}
               >
                 {withdrawSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                 {withdrawSubmitting ? 'SUBMITTING...' : 'SUBMIT'}
               </button>
             </div>
           </div>
         </div>
       )}
    </div>
  );
};
