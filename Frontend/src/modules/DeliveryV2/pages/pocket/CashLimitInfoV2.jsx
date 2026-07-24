import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, Loader2, IndianRupee, HelpCircle,
  ShieldCheck, AlertTriangle
} from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import { formatCurrency } from '@food/utils/currency';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

/**
 * CashLimitInfoV2 - 1:1 Match with Old AvailableCashLimit Component.
 * Features: Breakthrough of Total Limit, Cash in hand, Deductions, etc.
 * Background: #f6e9dc
 * Font: Poppins
 */
export const CashLimitInfoV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [walletState, setWalletState] = useState({
     totalCashLimit: 0,
     cashInHand: 0,
     deductions: 0,
     pocketWithdrawals: 0,
     availableCashLimit: 0
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [walletRes, cashLimitRes] = await Promise.allSettled([
          deliveryAPI.getWallet(),
          deliveryAPI.getCashLimit()
        ]);

        const walletData =
          (walletRes.status === "fulfilled" && walletRes.value?.data?.data?.wallet) ||
          (walletRes.status === "fulfilled" && walletRes.value?.data?.wallet) ||
          {};
        const cashLimitData =
          (cashLimitRes.status === "fulfilled" && cashLimitRes.value?.data?.data) ||
          (cashLimitRes.status === "fulfilled" && cashLimitRes.value?.data) ||
          {};

        const totalLimit =
          Number(walletData.totalCashLimit ?? walletData.total_cash_limit) ||
          Number(cashLimitData.deliveryCashLimit ?? cashLimitData.delivery_cash_limit) ||
          0;
        const cashInHand =
          Number(walletData.cashInHand ?? walletData.cash_in_hand ?? walletData.cashCollected) || 0;
        const deductions = Number(walletData.deductions) || 0;
        const withdrawals = Number(walletData.totalWithdrawn ?? walletData.total_withdrawn) || 0;
        const available =
          Number(walletData.availableCashLimit ?? walletData.available_cash_limit) ||
          Math.max(0, totalLimit - cashInHand - deductions);

        setWalletState({
           totalCashLimit: totalLimit,
           cashInHand: cashInHand,
           deductions: deductions,
           pocketWithdrawals: withdrawals,
           availableCashLimit: available
        });
      } catch (err) {
        toast.error('Failed to load cash limit details');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const DetailRow = ({ label, value, subLabel }) => (
     <div className="py-4 flex justify-between items-start border-b border-gray-100/60 last:border-0 px-4">
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
             <h1 className="text-xl font-black text-gray-900 tracking-tight">Available Cash Limit</h1>
          </div>
       </div>

       <div className="pt-24 px-5 max-w-lg mx-auto">
       {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
             <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
             <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Checking Limits...</p>
          </div>
       ) : (
          <div className="space-y-4">
             <div className="bg-white rounded-[32px] shadow-[0_4px_20px_rgba(0,0,0,0.02)] border border-gray-100 overflow-hidden">
                <div className="flex items-center gap-4 p-5 pb-2">
                   <div
                     className="w-12 h-12 rounded-[18px] flex items-center justify-center border"
                     style={{
                       backgroundColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.10)",
                       borderColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.22)",
                       color: "var(--module-theme-color, #00B761)",
                     }}
                   >
                      <ShieldCheck className="w-6 h-6" />
                   </div>
                   <div>
                      <h3 className="text-lg font-black tracking-tight leading-none mb-1 text-gray-900">Total cash limit</h3>
                      <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "var(--module-theme-color, #00B761)" }}>{formatCurrency(walletState.totalCashLimit)}</p>
                   </div>
                </div>

                <div className="space-y-1">
                   <DetailRow 
                      label="Total cash limit" 
                      value={formatCurrency(walletState.totalCashLimit)} 
                      subLabel="Resets every Monday and increases with earnings"
                   />
                   <DetailRow label="Cash in hand" value={formatCurrency(walletState.cashInHand)} />
                   <DetailRow label="Deductions" value={formatCurrency(walletState.deductions)} />
                   <DetailRow label="Pocket withdrawals" value={formatCurrency(walletState.pocketWithdrawals)} />

                   <div className="py-5 px-5 mt-2 flex justify-between items-center bg-emerald-50 border-t border-emerald-100/50">
                      <div className="text-[11px] font-black text-emerald-900 uppercase tracking-widest">Available cash limit</div>
                      <div className="text-xl font-black text-emerald-600">{formatCurrency(walletState.availableCashLimit)}</div>
                   </div>
                </div>
             </div>

             <div className="bg-white rounded-[32px] p-8 text-center shadow-[0_4px_20px_rgba(0,0,0,0.02)] border border-gray-100 mb-6">
                <HelpCircle className="w-8 h-8 text-gray-200 mx-auto mb-4" />
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2">How it works?</h4>
                <p className="text-[11px] text-gray-500 font-bold leading-relaxed">
                   Your available limit is the maximum cash you can carry in hand. As you receive cash orders, this limit decreases. Settling your dues or earning more will increase this limit.
                </p>
             </div>

             <div className="pt-2">
                <button 
                  onClick={goBack}
                  className="w-full py-4 text-white rounded-[20px] font-black text-sm uppercase tracking-widest active:scale-[0.98] transition-all"
                  style={{
                    background: "linear-gradient(135deg, rgba(var(--module-theme-rgb, 0,183,97), 0.88), var(--module-theme-color, #00B761))",
                    boxShadow: "0 8px 20px rgba(var(--module-theme-rgb, 0,183,97), 0.30)",
                  }}
                >
                   Okay
                </button>
             </div>
          </div>
       )}
       </div>
    </div>
  );
};
