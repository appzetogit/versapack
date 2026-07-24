import React, { useState, useMemo, useEffect } from "react";
import { 
  ArrowLeft,
  Loader2,
  Package,
  IndianRupee,
  Gift,
  Search,
  ChevronRight,
  TrendingUp
} from "lucide-react";
import { formatCurrency } from "@food/utils/currency";
import WeekSelector from "@delivery/components/WeekSelector";
import { deliveryAPI } from "@food/api";
import { motion, AnimatePresence } from "framer-motion";
import useDeliveryBackNavigation from "../../hooks/useDeliveryBackNavigation";

export const PocketDetailsV2 = () => {
  const goBack = useDeliveryBackNavigation();

  // Current week range (Sunday–Saturday)
  const getInitialWeekRange = () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  };

  const [weekRange, setWeekRange] = useState(getInitialWeekRange);
  const [orders, setOrders] = useState([]);
  const [paymentTransactions, setPaymentTransactions] = useState([]);
  const [bonusTransactions, setBonusTransactions] = useState([]);
  const [summaryData, setSummaryData] = useState({ totalEarning: 0, totalBonus: 0, grandTotal: 0 });
  const [loading, setLoading] = useState(true);

  const isWithinSelectedRange = (value) => {
    if (!value) return false;
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return false;
    return dt >= weekRange.start && dt <= weekRange.end;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const anchorDate = new Date(weekRange.start);
        // Send noon time to avoid timezone rollover shifting the selected week on backend.
        anchorDate.setHours(12, 0, 0, 0);
        const response = await deliveryAPI.getPocketDetails({
          date: anchorDate.toISOString(),
          limit: 2000
        });

        const payload = response?.data?.data || {};
        const trips = payload?.trips || payload?.orders || [];
        const payments = payload?.transactions?.payment || [];
        const bonuses = payload?.transactions?.bonus || [];
        const summary = payload?.summary || {};

        const safeTrips = (Array.isArray(trips) ? trips : []).filter((trip) =>
          isWithinSelectedRange(trip?.deliveredAt || trip?.date || trip?.createdAt || trip?.completedAt)
        );
        const safePayments = (Array.isArray(payments) ? payments : []).filter((tx) =>
          isWithinSelectedRange(tx?.date || tx?.createdAt)
        );
        const safeBonuses = (Array.isArray(bonuses) ? bonuses : []).filter((tx) =>
          isWithinSelectedRange(tx?.date || tx?.createdAt)
        );

        const calculatedTotalEarning = safePayments.reduce((sum, p) => sum + (Number(p?.amount) || 0), 0);
        const calculatedTotalBonus = safeBonuses.reduce((sum, b) => sum + (Number(b?.amount) || 0), 0);

        setOrders(safeTrips);
        setPaymentTransactions(safePayments);
        setBonusTransactions(safeBonuses);
        setSummaryData({
          totalEarning: Number(summary.totalEarning) || calculatedTotalEarning,
          totalBonus: Number(summary.totalBonus) || calculatedTotalBonus,
          grandTotal: Number(summary.grandTotal) || (calculatedTotalEarning + calculatedTotalBonus),
        });
      } catch (error) {
        setOrders([]);
        setPaymentTransactions([]);
        setBonusTransactions([]);
        setSummaryData({ totalEarning: 0, totalBonus: 0, grandTotal: 0 });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [weekRange]);

  const summary = useMemo(() => {
    let totalEarning = 0;
    let totalBonus = 0;
    paymentTransactions.forEach((p) => { totalEarning += p.amount || 0; });
    bonusTransactions.forEach((b) => { totalBonus += b.amount || 0; });
    return {
      totalEarning: summaryData.totalEarning || totalEarning,
      totalBonus: summaryData.totalBonus || totalBonus,
      grandTotal: summaryData.grandTotal || (summaryData.totalEarning || totalEarning) + (summaryData.totalBonus || totalBonus),
    };
  }, [paymentTransactions, bonusTransactions, summaryData]);

  const getOrderEarning = (orderId) => {
    const p = paymentTransactions.find(p => (p.orderId || p.metadata?.orderId) === orderId);
    if (p) return p.amount || 0;
    const order = orders.find(o => (o.orderId || o._id || o.id) === orderId);
    return order?.deliveryEarning || order?.earningAmount || order?.amount || 0;
  };

  const getOrderBonus = (orderId) => {
    const b = bonusTransactions.find(b => (b.orderId || b.metadata?.orderId) === orderId);
    return b ? b.amount : 0;
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-poppins pb-32">
      {/* ─── HEADER ─── */}
      <div className="fixed top-0 inset-x-0 h-20 bg-[#f8f9fa]/90 backdrop-blur-xl z-50 px-5 flex items-center justify-between pb-2 pt-6">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="p-3 bg-white hover:bg-gray-50 border border-gray-100 shadow-sm rounded-[20px] transition-all active:scale-95">
            <ArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none mb-0.5">Pocket Details</h1>
            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none">Trips & Earnings</p>
          </div>
        </div>
        <div
          className="w-10 h-10 rounded-[16px] flex items-center justify-center border shadow-sm"
          style={{
            backgroundColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.10)",
            borderColor: "rgba(var(--module-theme-rgb, 0,183,97), 0.25)",
            color: "var(--module-theme-color, #00B761)",
          }}
        >
          <IndianRupee className="w-5 h-5" />
        </div>
      </div>

      <div className="pt-24 px-5 pb-6 space-y-6 max-w-lg mx-auto">
        {/* ─── WEEK SELECTOR ─── */}
        <div className="bg-white p-5 rounded-[32px] shadow-[0_4px_20px_rgba(0,0,0,0.02)] border border-gray-100">
           <WeekSelector 
             onChange={setWeekRange}
             weekStartsOn={0}
           />
        </div>

        {/* ─── SUMMARY CARD ─── */}
        <div className="bg-gray-950 rounded-[32px] p-7 shadow-[0_20px_40px_rgba(0,0,0,0.15)] relative overflow-hidden group">
           <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/10 transition-colors" />
           <div className="relative z-10">
              <div className="flex justify-between items-center mb-6">
                 <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-1">Total Payout</p>
                    <h2 className="text-4xl font-black text-white tracking-tight">{formatCurrency(summary.grandTotal)}</h2>
                 </div>
                 <div className="w-12 h-12 bg-white/10 rounded-[20px] flex items-center justify-center border border-white/5 backdrop-blur-md">
                    <TrendingUp className="w-6 h-6" style={{ color: "var(--module-theme-color, #00B761)" }} />
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-white/5 p-4 rounded-[20px] border border-white/5">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Trip Earnings</p>
                    <p className="text-lg font-black text-white tracking-tight">{formatCurrency(summary.totalEarning)}</p>
                 </div>
                 <div className="bg-white/5 p-4 rounded-[20px] border border-white/5">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Weekly Bonus</p>
                    <p className="text-lg font-black tracking-tight" style={{ color: "var(--module-theme-color, #00B761)" }}>+{formatCurrency(summary.totalBonus)}</p>
                 </div>
              </div>
           </div>
        </div>

        {/* ─── ORDERS LIST ─── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
             <h3 className="text-[11px] font-black text-gray-900 uppercase tracking-widest">Trips History</h3>
             <span className="bg-gray-200 text-gray-600 px-3 py-1 rounded-[12px] text-[9px] font-black uppercase tracking-widest">{orders.length} Orders</span>
          </div>

          {loading ? (
            <div className="py-20 flex flex-col items-center">
              <Loader2 className="w-10 h-10 animate-spin text-gray-400" />
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-4">Syncing History...</p>
            </div>
          ) : orders.length > 0 ? (
            <div className="grid gap-4">
              {orders.map((order, idx) => {
                const oid = order.orderId || order._id || order.id;
                const earning = getOrderEarning(oid);
                const bonus = getOrderBonus(oid);
                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={oid}
                    className="bg-white p-5 rounded-[28px] shadow-[0_4px_20px_rgba(0,0,0,0.02)] border border-gray-100 flex items-center justify-between active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-[#f8f9fa] rounded-[20px] flex items-center justify-center text-gray-900 border border-gray-100 shadow-sm">
                          <Package className="w-5 h-5" />
                       </div>
                       <div>
                          <div className="flex items-center gap-2 mb-1">
                             <h4 className="text-sm font-black text-gray-900 tracking-tight">#{oid.toString().slice(-6)}</h4>
                             <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">• {new Date(order.deliveredAt || order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                          </div>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest truncate max-w-[140px]">
                            {order.restaurantName || order.restaurantId?.name || "Premium Restaurant"}
                          </p>
                       </div>
                    </div>
                    <div className="text-right">
                       <p className="text-xl font-black text-gray-900 tracking-tight mb-1.5">{formatCurrency(earning + bonus)}</p>
                       <div className="flex items-center justify-end gap-1.5">
                          {bonus > 0 && <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: "var(--module-theme-color, #00B761)" }}>+{formatCurrency(bonus)} BP</span>}
                          <div className={`px-2 py-0.5 rounded-[8px] ${order.paymentMethod?.toLowerCase() === 'cod' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'} text-[8px] font-black uppercase tracking-widest`}>
                             {order.paymentMethod || 'Online'}
                          </div>
                       </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          ) : (
            <div className="py-20 text-center bg-white rounded-[32px] shadow-[0_4px_20px_rgba(0,0,0,0.02)] border border-gray-100">
               <div className="w-16 h-16 bg-[#f8f9fa] rounded-[24px] shadow-sm border border-gray-100 flex items-center justify-center mx-auto mb-4 text-gray-300">
                  <Package className="w-6 h-6" />
               </div>
               <h3 className="text-lg font-black text-gray-900 tracking-tight mb-1">No Trips Found</h3>
               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Check another week range</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PocketDetailsV2;
