import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, ChevronDown, Loader2, Gift, 
  CheckCircle2, Clock, Search, History, Calendar, Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { deliveryAPI, restaurantAPI } from '@food/api';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../hooks/useDeliveryBackNavigation';
import useCloseOnBrowserBack from '../hooks/useCloseOnBrowserBack';

export const HistoryV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [activeTab, setActiveTab] = useState("daily");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTripType, setSelectedTripType] = useState("ALL TRIPS");
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTripTypePicker, setShowTripTypePicker] = useState(false);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [bonusTransactions, setBonusTransactions] = useState([]);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [codControlEnabled, setCodControlEnabled] = useState(true);
  useCloseOnBrowserBack(showBonusModal, () => setShowBonusModal(false), "history-bonus-modal");

  const tripTypes = ["ALL TRIPS", "Completed", "Cancelled", "Pending"];

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  // Fetch Logic
  useEffect(() => {
    const fetchTrips = async () => {
      setLoading(true);
      try {
        const anchorDate = new Date(selectedDate);
        // Noon anchor prevents timezone rollover issues on server date parsing.
        anchorDate.setHours(12, 0, 0, 0);

        const params = {
          period: activeTab,
          date: anchorDate.toISOString(),
          status: selectedTripType !== "ALL TRIPS" ? selectedTripType : undefined,
          limit: 1000
        };
        
        const response = await deliveryAPI.getTripHistory(params);
        if (response.data?.success) {
          const apiTrips = response.data.data.trips || [];
          const nextTrips =
            activeTab === "daily"
              ? apiTrips.filter((trip) => {
                  const tripDateRaw = trip.date || trip.deliveredAt || trip.completedAt || trip.createdAt;
                  if (!tripDateRaw) return false;
                  const tripDate = new Date(tripDateRaw);
                  if (Number.isNaN(tripDate.getTime())) return false;
                  return isSameDay(tripDate, selectedDate);
                })
              : apiTrips;
          setTrips(nextTrips);
        }
      } catch (error) {
        toast.error("Failed to load history");
      } finally {
        setLoading(false);
      }
    };
    fetchTrips();
  }, [selectedDate, activeTab, selectedTripType]);

  // Bonus Logic
  useEffect(() => {
     if (showBonusModal) {
        const fetchBonus = async () => {
           setBonusLoading(true);
           try {
              const res = await deliveryAPI.getWalletTransactions({ type: 'bonus', limit: 50 });
              if (res.data?.success) setBonusTransactions(res.data.data.transactions || []);
           } catch (e) { toast.error("Failed to load bonuses"); }
           finally { setBonusLoading(false); }
        };
        fetchBonus();
     }
  }, [showBonusModal]);

  // COD feature control
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

  const formatDateDisplay = (date) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const day = date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    
    if (date.toDateString() === today.toDateString()) return `Today: ${day}`;
    if (date.toDateString() === yesterday.toDateString()) return `Yesterday: ${day}`;
    return day;
  };

  const recentDates = useMemo(() => {
    return [...Array(30)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d;
    });
  }, []);

  const metrics = useMemo(() => {
     return trips.reduce((acc, trip) => {
        if (trip.status === 'Completed') {
           acc.earnings += Number(trip.deliveryEarning || trip.amount || trip.earningAmount || 0);
           const isCOD = (trip.paymentMethod || '').toLowerCase() === 'cash' || (trip.paymentMethod || '').toLowerCase() === 'cod';
           if (isCOD) acc.cod += Number(trip.codCollectedAmount || trip.orderTotal || 0);
        }
        return acc;
     }, { earnings: 0, cod: 0 });
  }, [trips]);

  const extractItems = (trip) => {
    const items = trip.items || trip.orderItems || [];
    if (items.length === 0) return 'Standard Delivery';
    const first = items[0];
    const qty = first.quantity || first.qty || 1;
    const name = first.name || first.itemName || 'Item';
    return `${qty}x ${name}${items.length > 1 ? ` +${items.length - 1} more` : ''}`;
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-poppins pb-32">
       {/* 1. Header (Premium Floating Glass) */}
       <div className="sticky top-0 z-[100] bg-[#f8f9fa]/90 backdrop-blur-xl border-b border-gray-100 px-4 py-4 pt-8">
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-4">
               <button onClick={goBack} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-900 border border-gray-200 shadow-sm active:scale-95 transition-all">
                  <ArrowLeft className="w-5 h-5" />
               </button>
               <div>
                  <h1 className="text-xl font-black text-gray-900 tracking-tighter">TRIP HISTORY</h1>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Your Milestones</p>
               </div>
             </div>
             <button onClick={() => setShowBonusModal(true)} className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-emerald-500 border border-gray-200 shadow-sm relative active:scale-95 transition-all">
                <Gift className="w-5 h-5" />
                {bonusTransactions.length > 0 && (
                   <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                      {bonusTransactions.length}
                   </span>
                )}
             </button>
          </div>

          {/* 2. iOS Segmented Control for Tabs */}
          <div className="mt-6 bg-gray-100/80 p-1 rounded-2xl flex items-center relative">
             {['daily', 'weekly', 'monthly'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wider relative z-10 transition-colors ${activeTab === tab ? 'text-gray-900' : 'text-gray-400'}`}
                >
                   {tab}
                   {activeTab === tab && (
                     <motion.div 
                       layoutId="tab-pill" 
                       className="absolute inset-0 bg-white rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.08)] -z-10 border border-gray-50" 
                     />
                   )}
                </button>
             ))}
          </div>
       </div>

       {/* 3. Filter Controls */}
       <div className="px-4 py-4 flex gap-3 sticky top-[152px] z-[80] bg-[#f8f9fa]">
          <button 
             onClick={() => { setShowDatePicker(!showDatePicker); setShowTripTypePicker(false); }}
             className="flex-1 px-4 py-3.5 bg-white border border-gray-200 rounded-2xl flex items-center justify-between text-gray-800 shadow-sm active:scale-[0.98] transition-transform"
          >
             <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-bold">{formatDateDisplay(selectedDate)}</span>
             </div>
             <ChevronDown className={`w-4 h-4 text-gray-400 transform transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
          </button>
          <button 
             onClick={() => { setShowTripTypePicker(!showTripTypePicker); setShowDatePicker(false); }}
             className="w-[140px] px-4 py-3.5 bg-white border border-gray-200 rounded-2xl flex items-center justify-between text-gray-800 shadow-sm active:scale-[0.98] transition-transform"
          >
             <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-bold text-gray-900">{selectedTripType === "ALL TRIPS" ? "All" : selectedTripType}</span>
             </div>
             <ChevronDown className={`w-4 h-4 text-gray-400 transform transition-transform ${showTripTypePicker ? 'rotate-180' : ''}`} />
          </button>
       </div>

       {/* Dropdowns */}
       <AnimatePresence>
          {showDatePicker && (
             <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[190] bg-black/10 backdrop-blur-sm" onClick={() => setShowDatePicker(false)} />
                <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed left-4 right-4 top-[220px] z-[200] bg-white rounded-[24px] shadow-2xl border border-gray-100 max-h-[350px] overflow-y-auto p-2">
                   {recentDates.map((date, idx) => (
                      <button 
                         key={idx} 
                         onClick={() => { setSelectedDate(date); setShowDatePicker(false); }}
                         className={`w-full text-left p-4 rounded-[16px] text-sm font-bold transition-colors ${date.toDateString() === selectedDate.toDateString() ? 'bg-emerald-50 text-emerald-600' : 'text-gray-600 hover:bg-gray-50'}`}
                      >
                         {formatDateDisplay(date)}
                      </button>
                   ))}
                </motion.div>
             </>
          )}
          {showTripTypePicker && (
             <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[190] bg-black/10 backdrop-blur-sm" onClick={() => setShowTripTypePicker(false)} />
                <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="fixed right-4 top-[220px] w-48 z-[200] bg-white rounded-[24px] shadow-2xl border border-gray-100 p-2">
                   {tripTypes.map((type, idx) => (
                      <button 
                         key={idx} 
                         onClick={() => { setSelectedTripType(type); setShowTripTypePicker(false); }}
                         className={`w-full text-left p-4 rounded-[16px] text-sm font-bold transition-colors ${type === selectedTripType ? 'bg-emerald-50 text-emerald-600' : 'text-gray-600 hover:bg-gray-50'}`}
                      >
                         {type}
                      </button>
                   ))}
                </motion.div>
             </>
          )}
       </AnimatePresence>

       {/* 4. Page Content */}
       <div className="px-4 space-y-4">
          {/* Performance Summary Banner */}
          <div className="bg-white rounded-[28px] p-6 border border-gray-100 shadow-[0_8px_30px_rgba(0,0,0,0.03)] flex justify-between items-center relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-emerald-300" />
             {codControlEnabled ? (
               <>
                 <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">COD Collected</p>
                    <h3 className="text-2xl font-black text-gray-900 tracking-tight">₹{metrics.cod.toFixed(0)}</h3>
                 </div>
                 <div className="w-px h-12 bg-gray-100" />
                 <div className="text-right">
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1.5">Earnings</p>
                    <h3 className="text-2xl font-black text-gray-900 tracking-tight">₹{metrics.earnings.toFixed(0)}</h3>
                 </div>
               </>
             ) : (
               <div className="w-full text-center">
                  <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1.5">Earnings</p>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight">₹{metrics.earnings.toFixed(0)}</h3>
               </div>
             )}
          </div>

          {/* Trip List */}
          {loading ? (
             <div className="flex flex-col items-center justify-center py-24 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Syncing History...</p>
             </div>
          ) : trips.length > 0 ? (
             <div className="space-y-4 pt-2">
                {trips.map((trip, idx) => {
                  const isCompleted = (trip.status || '').toLowerCase() === 'completed';
                  const isCancelled = (trip.status || '').toLowerCase() === 'cancelled';
                  const isPending = !isCompleted && !isCancelled;
                  const payout = Number(trip.deliveryEarning || trip.amount || trip.earningAmount || 0);
                  const collection = Number(trip.codCollectedAmount || trip.orderTotal || 0);
                  const isCOD = (trip.paymentMethod || '').toLowerCase() === 'cash' || (trip.paymentMethod || '').toLowerCase() === 'cod';
                  const tripDateRaw = trip.date || trip.deliveredAt || trip.completedAt || trip.createdAt;
                  const tripDateLabel = tripDateRaw
                    ? new Date(tripDateRaw).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                    : '--';

                   return (
                      <div key={trip.orderId || idx} className="bg-white rounded-[28px] p-5 border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] relative overflow-hidden group">
                         <div className="flex justify-between items-start mb-3">
                             <div className="pr-4">
                                <div className="flex items-center gap-2 mb-1.5">
                                   <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">{trip.orderId || 'ORDER-ID'}</h4>
                                </div>
                                <p className="text-base font-bold text-gray-800 leading-tight mb-1">{trip.restaurant || trip.restaurantName || 'Restaurant'}</p>
                                <p className="text-xs text-gray-400 font-medium line-clamp-1">{extractItems(trip)}</p>
                             </div>
                             <div className={`px-2.5 py-1 rounded-full border flex items-center justify-center ${isCompleted ? 'bg-emerald-50 border-emerald-100 text-emerald-600' : isCancelled ? 'bg-red-50 border-red-100 text-red-600' : 'bg-orange-50 border-orange-100 text-orange-600'}`}>
                                <span className="text-[9px] font-black uppercase tracking-wider">
                                   {trip.status || 'Status'}
                                </span>
                             </div>
                         </div>

                         <div className="bg-gray-50 rounded-2xl p-4 mt-4 grid grid-cols-3 gap-2 border border-gray-100/50">
                             <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Time</p>
                                <p className="text-sm font-bold text-gray-900">{trip.time || '--:--'}</p>
                             </div>
                             <div className="text-center">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Date</p>
                                <p className="text-xs font-bold mt-0.5 text-gray-700">{tripDateLabel}</p>
                             </div>
                             <div className="text-right">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Earning</p>
                                <p className="text-sm font-bold text-gray-900">₹{payout.toFixed(0)}</p>
                             </div>
                         </div>
                      </div>
                   );
                })}
             </div>
          ) : (
             <div className="py-24 text-center flex flex-col items-center bg-white rounded-[32px] border border-gray-100 shadow-sm mt-4">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                   <Clock className="w-8 h-8 text-gray-300" />
                </div>
                <h3 className="text-lg font-black text-gray-900 mb-1">No Trips Yet</h3>
                <p className="text-sm font-medium text-gray-400">You haven't made any deliveries in this period.</p>
             </div>
          )}
       </div>

       {/* Bonus Drawer (The Gift Modal) - Modernized */}
       <AnimatePresence>
          {showBonusModal && (
             <div className="fixed inset-0 z-[1000] flex items-end">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowBonusModal(false)} className="absolute inset-0 bg-gray-900/40 backdrop-blur-md" />
                <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="relative w-full bg-white border-t border-gray-100 rounded-t-[40px] p-8 pb-12 shadow-[0_-20px_50px_rgba(0,0,0,0.1)] flex flex-col max-h-[85vh]">
                   <button
                      type="button"
                      onClick={() => setShowBonusModal(false)}
                      className="mx-auto mb-6 shrink-0 block px-6 py-3"
                      aria-label="Close incentives popup"
                   >
                      <div className="w-12 h-1.5 bg-gray-200 rounded-full" />
                   </button>
                   
                   <div className="text-center mb-8 shrink-0 relative">
                      <div className="w-16 h-16 bg-emerald-50 rounded-[24px] flex items-center justify-center mx-auto mb-4 border border-emerald-100 text-emerald-500 shadow-inner">
                         <Gift className="w-8 h-8" />
                      </div>
                      <h3 className="text-2xl font-black text-gray-900 tracking-tight mb-1">Incentives</h3>
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">Extra bonuses from team</p>
                   </div>
                   
                   <div className="flex-1 overflow-y-auto pr-1 space-y-3 no-scrollbar pb-6">
                      {bonusLoading ? (
                         <div className="py-12 flex flex-col items-center gap-3">
                            <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Loading...</span>
                         </div>
                      ) : bonusTransactions.length > 0 ? bonusTransactions.map((tx, i) => (
                         <div key={i} className="bg-gray-50 rounded-[24px] p-5 border border-gray-100 flex justify-between items-center relative overflow-hidden group">
                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-400" />
                            <div className="pl-2">
                               <p className="text-xl font-black text-gray-900 mb-0.5">₹{Number(tx.amount || 0).toFixed(0)}</p>
                               <p className="text-xs font-bold text-gray-500 line-clamp-1 mb-1">{tx.description || 'Bonus Payout'}</p>
                               <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">{new Date(tx.createdAt || tx.date).toLocaleDateString()}</p>
                            </div>
                            <span className="bg-white text-emerald-600 border border-emerald-100 text-[9px] font-black px-3 py-1.5 rounded-full uppercase tracking-wider shadow-sm">
                               DELIVERED
                            </span>
                         </div>
                      )) : (
                         <div className="py-12 text-center flex flex-col items-center bg-gray-50 rounded-[24px] border border-gray-100">
                             <Search className="w-10 h-10 text-gray-300 mb-3" />
                             <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">No Incentives Yet</p>
                         </div>
                      )}
                   </div>
                   
                   <button onClick={() => setShowBonusModal(false)} className="w-full py-5 bg-gray-900 text-white rounded-[24px] font-black text-sm tracking-widest uppercase active:scale-[0.98] transition-all shrink-0 mt-4 shadow-xl shadow-gray-900/20">
                      Okay, Got It
                   </button>
                </motion.div>
             </div>
          )}
       </AnimatePresence>
    </div>
  );
};

export default HistoryV2;
