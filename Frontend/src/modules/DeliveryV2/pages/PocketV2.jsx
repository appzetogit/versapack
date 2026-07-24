import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, IndianRupee, ArrowRight, ArrowLeft,
  ShieldCheck, AlertTriangle, HelpCircle,
  Receipt, FileText, LayoutGrid, X, ChevronRight,
  Sparkles, Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { deliveryAPI, restaurantAPI } from '@food/api';
import { toast } from 'sonner';
import { formatCurrency } from '@food/utils/currency';
import { initRazorpayPayment } from "@food/utils/razorpay";
import { getCompanyNameAsync } from "@food/utils/businessSettings";
import useDeliveryBackNavigation from '../hooks/useDeliveryBackNavigation';

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

export const PocketV2 = () => {
  const navigate = useNavigate();
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [walletState, setWalletState] = useState({
    totalBalance: 0,
    cashInHand: 0,
    availableCashLimit: 0,
    totalCashLimit: 0,
    weeklyEarnings: 0,
    weeklyOrders: 0,
    payoutAmount: 0,
    payoutPeriod: 'Current Week',
    bankDetailsFilled: false
  });

  const [activeOffer, setActiveOffer] = useState({
    targetAmount: 0,
    targetOrders: 0,
    currentOrders: 0,
    currentEarnings: 0,
    validTill: '',
    isLive: false
  });

  const [showDepositPopup, setShowDepositPopup] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [codControlEnabled, setCodControlEnabled] = useState(true);

  useEffect(() => {
    const loadFeatureSettings = async () => {
      try {
        const res = await restaurantAPI.getFeatureSettingsPublic();
        const rows = Array.isArray(res?.data?.data) ? res.data.data : [];
        const codControl = rows.find((row) => row.key === "cod_control");
        if (codControl) {
          setCodControlEnabled(Boolean(codControl.isEnabled));
        }
      } catch (_error) {
        // Keep default enabled if API fails.
      }
    };
    loadFeatureSettings();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [profileRes, earningsRes, walletRes] = await Promise.allSettled([
          deliveryAPI.getProfile(),
          deliveryAPI.getEarnings({ period: 'week' }),
          deliveryAPI.getWallet()
        ]);

        const profile =
          (profileRes.status === "fulfilled" && profileRes.value?.data?.data?.profile) ||
          {};
        const summary =
          (earningsRes.status === "fulfilled" && earningsRes.value?.data?.data?.summary) ||
          {};
        const wallet =
          (walletRes.status === "fulfilled" && walletRes.value?.data?.data?.wallet) ||
          (walletRes.status === "fulfilled" && walletRes.value?.data?.wallet) ||
          {};
        const activeAddonsRes = await deliveryAPI.getActiveEarningAddons().catch(() => null);
        const activeOfferPayload =
          activeAddonsRes?.data?.data?.activeOffer ||
          activeAddonsRes?.data?.activeOffer ||
          null;
        
        const bankDetails = profile?.documents?.bankDetails;
        const isFilled = !!(bankDetails?.accountNumber);

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

        setWalletState({
          totalBalance: pocketBalance,
          cashInHand: Number(wallet.cashInHand ?? wallet.cash_in_hand ?? wallet.cashCollected) || 0,
          availableCashLimit: Number(wallet.availableCashLimit ?? wallet.available_cash_limit) || 0,
          totalCashLimit: Number(wallet.totalCashLimit ?? wallet.total_cash_limit) || 0,
          weeklyEarnings: Number(summary.totalEarnings) || 0,
          weeklyOrders: Number(summary.totalOrders) || 0,
          payoutAmount: Number(wallet.lastPayout?.amount || totalWithdrawn || 0),
          payoutPeriod: wallet.lastPayout ? new Date(wallet.lastPayout.date).toLocaleDateString() : 'No recent payout',
          bankDetailsFilled: isFilled
        });

        setActiveOffer({
           targetAmount: Number(activeOfferPayload?.targetAmount) || 0,
           targetOrders: Number(activeOfferPayload?.targetOrders) || 0,
           currentOrders: Number(activeOfferPayload?.currentOrders) || 0,
           currentEarnings: Number(activeOfferPayload?.currentEarnings) || 0,
           validTill: activeOfferPayload?.validTill || '',
           isLive: Boolean(activeOfferPayload)
        });

      } catch (err) {
        toast.error('Failed to load wallet data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleDeposit = async () => {
    const amt = parseFloat(depositAmount);
    if (!depositAmount || isNaN(amt) || amt < 1) {
      toast.error("Enter a valid amount (minimum ₹1)");
      return;
    }
    
    if (amt > walletState.cashInHand) {
       toast.error(`Deposit amount cannot exceed cash in hand (₹${walletState.cashInHand})`);
       return;
    }

    try {
      setDepositing(true);
      const orderRes = await deliveryAPI.createDepositOrder(amt);
      const data = orderRes?.data?.data;
      const rp = data?.razorpay;
      
      if (!rp?.orderId) {
        toast.error("Payment initialization failed");
        setDepositing(false);
        return;
      }

      const profileRes = await deliveryAPI.getProfile();
      const profile = profileRes?.data?.data?.profile || {};
      const companyName = await getCompanyNameAsync();

      await initRazorpayPayment({
        key: rp.key,
        amount: rp.amount,
        currency: rp.currency || "INR",
        order_id: rp.orderId,
        name: companyName,
        description: `Cash limit deposit - ₹${amt}`,
        prefill: { 
           name: profile.name, 
           email: profile.email, 
           contact: profile.phone 
        },
        handler: async (res) => {
          try {
            const verifyRes = await deliveryAPI.verifyDepositPayment({
              razorpay_order_id: res.razorpay_order_id,
              razorpay_payment_id: res.razorpay_payment_id,
              razorpay_signature: res.razorpay_signature,
              amount: amt
            });
            if (verifyRes?.data?.success) {
              toast.success("Deposit successful");
              setShowDepositPopup(false);
              setDepositAmount("");
              window.location.reload();
            }
          } catch (err) {
            toast.error("Verification failed");
          } finally {
            setDepositing(false);
          }
        },
        onError: () => setDepositing(false),
        onClose: () => setDepositing(false)
      });
    } catch (err) {
      setDepositing(false);
      toast.error("Deposit failed to start");
    }
  };

  const ordersProgress = activeOffer.targetOrders > 0 ? Math.min(activeOffer.currentOrders / activeOffer.targetOrders, 1) : 0;
  const earningsProgress = activeOffer.targetAmount > 0 ? Math.min(activeOffer.currentEarnings / activeOffer.targetAmount, 1) : 0;
  const hasActiveOffer = activeOffer.isLive && (activeOffer.targetAmount > 0 || activeOffer.targetOrders > 0);

  const formatOfferValidTill = (validTill) => {
    if (!validTill) return '';
    const parsed = new Date(validTill);
    if (Number.isNaN(parsed.getTime())) return String(validTill);
    return parsed.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const getCurrentWeekRange = () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const formatDate = (d) => `${d.getDate()} ${d.toLocaleString('en-US', { month: 'short' })}`;
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  if (loading) return (
    <div className="min-h-screen bg-[#f8f9fa] flex flex-col items-center justify-center font-poppins">
       <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
       <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Syncing Ledger...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8f9fa] pb-32 font-poppins relative overflow-hidden">
       <div className="sticky top-0 z-[100] bg-[#f8f9fa]/90 backdrop-blur-xl border-b border-gray-100 px-4 py-4 pt-8 mb-4">
         <div className="flex items-center justify-between">
           <div className="flex items-center gap-4">
             <button onClick={goBack} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-900 border border-gray-200 shadow-sm active:scale-95 transition-all">
               <ArrowLeft className="w-5 h-5" />
             </button>
             <div>
               <h1 className="text-xl font-black text-gray-900 tracking-tighter">POCKET</h1>
               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Your Milestones</p>
             </div>
           </div>
         </div>
       </div>

       {/* 1. BANK DETAILS BANNER */}
       {!walletState.bankDetailsFilled && (
         <motion.div 
           initial={{ opacity: 0, y: -20 }}
           animate={{ opacity: 1, y: 0 }}
           className="mx-4 mb-6 relative overflow-hidden shadow-lg shadow-yellow-500/10 rounded-[24px]"
         >
           <div className="bg-yellow-50 px-5 py-4 flex items-center gap-4 rounded-[24px] border border-yellow-200">
              <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center text-yellow-600 shrink-0">
                 <FileText className="w-6 h-6" />
              </div>
              <div className="flex-1">
                 <h3 className="text-[13px] font-black text-yellow-800 uppercase tracking-wider mb-0.5">Submit Bank Details</h3>
                 <p className="text-[11px] text-yellow-600/80 font-bold leading-tight">PAN & Bank details required for payouts</p>
              </div>
              <button 
                onClick={() => navigate('/food/delivery/profile/details')}
                className="bg-yellow-500 text-white px-4 py-2 rounded-xl font-bold text-[11px] uppercase tracking-wider active:scale-95 transition-transform shadow-md shadow-yellow-500/30"
              >
                 Submit
              </button>
           </div>
         </motion.div>
       )}

       <div className="px-4 space-y-5">
          
          {/* 2. WEEKLY EARNINGS CARD */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => navigate('/food/delivery/earnings')}
            className="relative bg-white rounded-[32px] p-8 border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.03)] text-center transition-all active:scale-[0.98] overflow-hidden"
          >
             <p className="relative text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mb-3">Earnings • {getCurrentWeekRange()}</p>
             <h2 className="relative text-5xl font-black text-gray-900 tracking-tighter">
                <span className="text-gray-300 mr-1">₹</span>
                {walletState.weeklyEarnings.toFixed(0)}
             </h2>
          </motion.div>

          {/* 3. EARNINGS GUARANTEE */}
          {hasActiveOffer && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-[32px] overflow-hidden border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.03)] relative"
          >
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-emerald-300" />
             
             <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-gray-900 uppercase tracking-wider mb-1">Earnings Guarantee</h3>
                  <div className="flex items-center gap-2">
                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Till {formatOfferValidTill(activeOffer.validTill)}</span>
                     {activeOffer.isLive && (
                       <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 rounded-full border border-emerald-100">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Live</span>
                       </div>
                     )}
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-2 rounded-2xl text-center border border-gray-100">
                   <p className="text-base font-black text-gray-900 leading-none mb-1">₹{activeOffer.targetAmount}</p>
                   <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{activeOffer.targetOrders} orders</p>
                </div>
             </div>

             <div className="p-8 flex items-center justify-around">
                {/* Orders Circle */}
                <div className="flex flex-col items-center">
                   <div className="relative w-24 h-24">
                      <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                         <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                         <motion.circle 
                            cx="50" cy="50" r="45" fill="none" stroke="#1e293b" strokeWidth="8" strokeLinecap="round"
                            initial={{ pathLength: 0 }} animate={{ pathLength: ordersProgress }} transition={{ duration: 1.5, ease: "easeOut" }}
                         />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                         <span className="text-xl font-black text-gray-900 leading-none">{activeOffer.currentOrders}</span>
                         <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest mt-1">of {activeOffer.targetOrders}</span>
                      </div>
                   </div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-4">Orders</p>
                </div>

                {/* Divider */}
                <div className="w-px h-16 bg-gray-100" />

                {/* Earnings Circle */}
                <div className="flex flex-col items-center">
                   <div className="relative w-24 h-24">
                      <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                         <circle cx="50" cy="50" r="45" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                         <motion.circle 
                            cx="50" cy="50" r="45" fill="none" stroke="#10b981" strokeWidth="8" strokeLinecap="round"
                            initial={{ pathLength: 0 }} animate={{ pathLength: earningsProgress }} transition={{ duration: 1.5, ease: "easeOut" }}
                         />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                         <span className="text-xl font-black text-gray-900 leading-none">₹{activeOffer.currentEarnings}</span>
                         <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest mt-1">Earned</span>
                      </div>
                   </div>
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-4">Status</p>
                </div>
             </div>
          </motion.div>
          )}

          {/* 4. POCKET ACTION BUTTONS */}
          <div className="bg-white rounded-[32px] border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.03)] overflow-hidden">
             <button 
                onClick={() => navigate('/food/delivery/pocket/balance')}
                className="w-full p-5 border-b border-gray-50 flex items-center justify-between active:bg-gray-50 transition-colors"
             >
                <div className="flex items-center gap-4">
                   <div
                     className="w-12 h-12 rounded-2xl flex items-center justify-center border"
                     style={{
                       backgroundColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.10)",
                       color: "var(--module-theme-color, #00B761)",
                       borderColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.22)",
                     }}
                   >
                      <Wallet className="w-6 h-6" />
                   </div>
                   <div className="text-left">
                      <span className="text-sm font-bold text-gray-900 block">Pocket balance</span>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-0.5">Withdrawal Hub</p>
                   </div>
                </div>
                <div className="flex items-center gap-3">
                   <span className="text-base font-black text-gray-900">₹{walletState.totalBalance.toFixed(2)}</span>
                   <ChevronRight className="w-5 h-5 text-gray-300" />
                </div>
             </button>

             {codControlEnabled && (
               <button 
                  onClick={() => navigate('/food/delivery/pocket/cash-limit')}
                  className="w-full p-5 border-b border-gray-50 flex items-center justify-between active:bg-gray-50 transition-colors"
               >
                  <div className="flex items-center gap-4">
                     <div
                       className="w-12 h-12 rounded-2xl flex items-center justify-center border"
                       style={{
                         backgroundColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.10)",
                         color: "var(--module-theme-color, #00B761)",
                         borderColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.22)",
                       }}
                     >
                        <ShieldCheck className="w-6 h-6" />
                     </div>
                     <div className="text-left">
                        <span className="text-sm font-bold text-gray-900 block">Available cash limit</span>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest mt-0.5">Spend Control</p>
                     </div>
                  </div>
                  <div className="flex items-center gap-3">
                     <span className="text-base font-black text-gray-900">₹{walletState.availableCashLimit.toFixed(2)}</span>
                     <ChevronRight className="w-5 h-5 text-gray-300" />
                  </div>
               </button>
             )}

             {codControlEnabled && (
               <div className="p-4">
                  <button 
                     onClick={() => setShowDepositPopup(true)}
                     className="w-full py-4 text-white rounded-[24px] font-black text-sm uppercase tracking-widest active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
                     style={{
                       background: "linear-gradient(135deg, rgba(var(--module-theme-rgb, 0,183,97), 0.9), var(--module-theme-color, #00B761))",
                       boxShadow: "0 8px 20px rgba(var(--module-theme-rgb, 0,183,97), 0.32)",
                     }}
                  >
                     <IndianRupee className="w-4 h-4" /> Deposit Cash
                  </button>
               </div>
             )}
          </div>

          {/* 5. MORE SERVICES - Grid */}
          <div className="grid grid-cols-2 gap-4 pb-8">
             <div onClick={() => navigate('/food/delivery/pocket/payout')} className="bg-white p-5 rounded-[28px] border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] active:bg-gray-50 transition-colors group">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center mb-4 border group-active:scale-95 transition-transform"
                  style={{
                    backgroundColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.10)",
                    color: "var(--module-theme-color, #00B761)",
                    borderColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.22)",
                  }}
                >
                   <IndianRupee className="w-5 h-5" />
                </div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Last Payout</p>
                <p className="text-2xl font-black text-gray-900 leading-none mb-1">₹{walletState.payoutAmount}</p>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tight">Prev Week Info</p>
             </div>

             {codControlEnabled && (
               <div onClick={() => navigate('/food/delivery/pocket/limit-settlement')} className="bg-white p-5 rounded-[28px] border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] active:bg-gray-50 transition-colors flex flex-col justify-between group">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center mb-4 border group-active:scale-95 transition-transform"
                    style={{
                      backgroundColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.10)",
                      color: "var(--module-theme-color, #00B761)",
                      borderColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.22)",
                    }}
                  >
                     <Receipt className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-bold text-gray-700 leading-tight">Limit<br/>Settlement</p>
               </div>
             )}

             <div onClick={() => navigate('/food/delivery/pocket/deductions')} className="bg-white p-5 rounded-[28px] border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] active:bg-gray-50 transition-colors flex flex-col justify-between group">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center mb-4 border group-active:scale-95 transition-transform"
                  style={{
                    backgroundColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.10)",
                    color: "var(--module-theme-color, #00B761)",
                    borderColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.22)",
                  }}
                >
                   <FileText className="w-5 h-5" />
                </div>
                <p className="text-sm font-bold text-gray-700 leading-tight">Deduction<br/>List</p>
             </div>

             <div onClick={() => navigate('/food/delivery/pocket/details')} className="bg-white p-5 rounded-[28px] border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] active:bg-gray-50 transition-colors flex flex-col justify-between group">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center mb-4 border group-active:scale-95 transition-transform"
                  style={{
                    backgroundColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.10)",
                    color: "var(--module-theme-color, #00B761)",
                    borderColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.22)",
                  }}
                >
                   <LayoutGrid className="w-5 h-5" />
                </div>
                <p className="text-sm font-bold text-gray-700 leading-tight">Pocket<br/>Statement</p>
             </div>
          </div>
       </div>

       {/* DEPOSIT MODAL - PRO GRADE */}
       <AnimatePresence>
          {showDepositPopup && (
             <div className="fixed inset-0 z-[1000] flex items-end">
                <motion.div 
                   initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
                   onClick={() => setShowDepositPopup(false)} 
                   className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" 
                />
                <motion.div 
                   initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: "spring", damping: 25, stiffness: 200 }} 
                   className="relative w-full bg-white border-t border-gray-100 rounded-t-[40px] p-8 pb-12 shadow-[0_-20px_50px_rgba(0,0,0,0.1)]"
                >
                   <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-8" />
                   
                   <div className="text-center mb-8">
                      <div className="w-20 h-20 bg-orange-50 rounded-[28px] flex items-center justify-center mx-auto mb-5 border border-orange-100 text-orange-500 relative shadow-inner">
                         <IndianRupee className="w-10 h-10 relative z-10" />
                      </div>
                      <h3 className="text-2xl font-black text-gray-900 tracking-tight mb-1">Deposit Cash</h3>
                      <p className="text-xs text-gray-400 font-black uppercase tracking-[0.2em]">Settle Hand Dues</p>
                   </div>
                   
                   <div className="bg-gray-50 rounded-[28px] p-6 mb-8 border border-gray-100 relative overflow-hidden">
                      <div className="flex justify-between items-center mb-4 relative z-10">
                         <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Cash in Hand</span>
                         <span className="text-sm font-black text-gray-900">₹{walletState.cashInHand}</span>
                      </div>
                      <div className="relative z-10">
                         <IndianRupee className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                         <input 
                            type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)}
                            placeholder="Amount to deposit"
                            className="w-full bg-white border border-gray-200 rounded-[20px] py-5 pl-14 pr-5 text-xl font-black text-gray-900 placeholder-gray-400 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 outline-none transition-all shadow-sm"
                         />
                      </div>
                      <p className="text-[9px] font-black text-gray-400 mt-4 text-center uppercase tracking-widest relative z-10">
                         Min Deposit ₹1 • Instant Limit Update
                      </p>
                   </div>
                   
                   <div className="space-y-4">
                      <button 
                         onClick={handleDeposit}
                         disabled={depositing}
                         className="w-full py-5 bg-gradient-to-br from-orange-400 to-orange-500 text-white rounded-[24px] font-black text-sm tracking-widest uppercase shadow-[0_8px_20px_rgba(249,115,22,0.3)] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:from-gray-200 disabled:to-gray-300 disabled:text-gray-400 disabled:shadow-none"
                      >
                         {depositing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                         {depositing ? 'Processing...' : 'Proceed to Pay'}
                      </button>
                      <button 
                        onClick={() => setShowDepositPopup(false)} 
                        className="w-full py-4 text-gray-400 font-black text-[11px] uppercase tracking-[0.2em] hover:text-gray-600 transition-colors"
                      >
                        Maybe Later
                      </button>
                   </div>
                </motion.div>
             </div>
          )}
       </AnimatePresence>

       {/* Icon Helper for Navigation Drawer */}
       <div className="hidden">
          <ChevronRight />
       </div>
    </div>
  );
};

export default PocketV2;
