import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft,
  Loader2,
  Clock
} from 'lucide-react';
import WeekSelector from '@delivery/components/WeekSelector';
import { deliveryAPI } from '@food/api';
import { formatCurrency } from '@food/utils/currency';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

/**
 * DeductionStatementV2 - 1:1 Match with Old DeductionStatement UI.
 * Background: #f6e9dc
 * Font: Poppins
 */
export const DeductionStatementV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [deductions, setDeductions] = useState([]);
  const [weekRange, setWeekRange] = useState({
    start: new Date(new Date().setDate(new Date().getDate() - new Date().getDay())),
    end: new Date(new Date().setDate(new Date().getDate() - new Date().getDay() + 6))
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await deliveryAPI.getWalletTransactions({ 
          type: 'deduction', 
          limit: 100 
        });
        
        if (response?.data?.success) {
           const all = response.data.data.transactions || [];
           const filtered = all.filter((t) => {
              const type = String(t.type || '').trim().toLowerCase();
              const isManualDeduction = type === 'withdrawal' || type === 'deposit';
              if (!isManualDeduction) return false;

              const baseDate = t.date || t.createdAt;
              const d = new Date(baseDate);
              return d >= weekRange.start && d <= weekRange.end;
           });
           setDeductions(filtered);
        }
      } catch (err) {
        toast.error('Failed to load deductions');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [weekRange]);

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-poppins pb-32">
       {/* Header */}
       <div className="fixed top-0 inset-x-0 h-20 bg-[#f8f9fa]/90 backdrop-blur-xl z-50 px-5 flex items-center justify-between pb-2 pt-6">
          <div className="flex items-center gap-3">
             <button onClick={goBack} className="p-3 bg-white hover:bg-gray-50 border border-gray-100 shadow-sm rounded-[20px] transition-all active:scale-95">
                <ArrowLeft className="w-5 h-5 text-gray-700" />
             </button>
             <h1 className="text-xl font-black text-gray-900 tracking-tight">Deduction Statement</h1>
          </div>
       </div>

       {/* Main Content */}
       <div className="pt-24 px-5 max-w-lg mx-auto">
          <WeekSelector onChange={setWeekRange} />

          {/* Transactions List */}
          {loading ? (
             <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Loading deductions...</p>
             </div>
          ) : deductions.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                {/* Classic Empty State Illustration */}
                <div className="flex flex-col gap-3 mb-8 opacity-40">
                   {[...Array(3)].map((_, i) => (
                      <div key={i} className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100 w-[260px]">
                         <div className="flex items-center gap-4">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "var(--module-theme-color, #00B761)" }}></div>
                            <div className="flex-1 space-y-2.5">
                               <div className="h-2 bg-gray-100 rounded-full w-3/4"></div>
                               <div className="h-2 bg-gray-100 rounded-full w-1/2"></div>
                            </div>
                         </div>
                      </div>
                   ))}
                </div>
                <p className="text-gray-900 text-lg font-black mb-2 tracking-tight">No Transactions</p>
                <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest leading-relaxed max-w-[250px] mx-auto">
                   Is hafton mein koi deduction nahi hui.
                </p>
             </div>
          ) : (
             <div className="space-y-4 mb-6 mt-4">
                {deductions.map((item, index) => (
                   <div
                     key={item._id || index}
                     className="bg-white rounded-[28px] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.02)] border border-gray-100 active:scale-[0.98] transition-all"
                   >
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-4">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "var(--module-theme-color, #00B761)" }}></div>
                            <div>
                               <p className="text-gray-900 text-sm font-black leading-none tracking-tight mb-2">{item.description || 'System Deduction'}</p>
                               <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest leading-none">
                                  {new Date(item.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                               </p>
                            </div>
                         </div>
                         <div className="text-red-600 text-xl font-black tracking-tight">
                            -{formatCurrency(item.amount)}
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          )}
       </div>
    </div>
  );
};
