import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle
} from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { toast } from 'sonner';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';

/**
 * PayoutV2 - 1:1 Match with Old Payout UI.
 * Background: #f6e9dc (for consistency with Pocket) or gray-50 (original)
 * Font: Poppins
 */
export const PayoutV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const [loading, setLoading] = useState(true);
  const [withdrawals, setWithdrawals] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Fetch withdrawal transactions
        const response = await deliveryAPI.getWalletTransactions({ 
          type: 'withdrawal', 
          limit: 100 
        });
        
        if (response?.data?.success) {
          const transactions = response.data.data.transactions || [];
          const withdrawalTx = transactions
            .filter((t) => String(t?.type || '').trim().toLowerCase() === 'withdrawal')
            .sort((a, b) => {
              const aTime = new Date(a?.date || a?.createdAt || 0).getTime();
              const bTime = new Date(b?.date || b?.createdAt || 0).getTime();
              return bTime - aTime;
            });

          const formatDateTime = (value) => {
            if (!value) return null;
            const dt = new Date(value);
            if (Number.isNaN(dt.getTime())) return null;
            return dt.toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
          };

          setWithdrawals(withdrawalTx.map(t => {
            const rawStatus = String(t.status || 'pending').trim().toLowerCase();
            const status =
              rawStatus === 'approved' ? 'Approved'
              : rawStatus === 'completed' ? 'Completed'
              : rawStatus === 'rejected' || rawStatus === 'denied' ? 'Rejected'
              : 'Pending';

            return {
              id: t._id || t.id,
              amount: Number(t.amount) || 0,
              status,
              date: formatDateTime(t.date || t.createdAt),
              processedAt: formatDateTime(t.processedAt || t.updatedAt),
              failureReason: t.failureReason || t.rejectionReason || null
            };
          }));
        }
      } catch (err) {
        toast.error('Failed to load payout history');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const getStatusInfo = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'approved':
        return {
          icon: CheckCircle2,
          color: 'theme-text',
          bgColor: 'theme-bg-soft',
          borderColor: 'theme-border'
        };
      case 'pending':
        return {
          icon: Clock,
          color: 'theme-text',
          bgColor: 'theme-bg-soft',
          borderColor: 'theme-border'
        };
      case 'denied':
      case 'rejected':
        return {
          icon: XCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200'
        };
      default:
        return {
          icon: Clock,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200'
        };
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-poppins pb-32">
      {/* Header */}
      <div className="fixed top-0 inset-x-0 h-20 bg-[#f8f9fa]/90 backdrop-blur-xl z-50 px-5 flex items-center justify-between pb-2 pt-6">
        <div className="flex items-center gap-3">
           <button onClick={goBack} className="p-3 bg-white hover:bg-gray-50 border border-gray-100 shadow-sm rounded-[20px] transition-all active:scale-95">
              <ArrowLeft className="w-5 h-5 text-gray-700" />
           </button>
           <h1 className="text-xl font-black text-gray-900 tracking-tight">Withdrawal History</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-24 px-5 max-w-lg mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Loading History...</p>
          </div>
        ) : withdrawals.length > 0 ? (
          <div className="space-y-4">
            {withdrawals.map((withdrawal, index) => {
              const statusInfo = getStatusInfo(withdrawal.status);
              const StatusIcon = statusInfo.icon;
              
              return (
                <div
                  key={withdrawal.id || index}
                  className="bg-white rounded-[28px] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.02)] border border-gray-100 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                         <div className={`px-3 py-1.5 rounded-[12px] flex items-center gap-1.5 ${statusInfo.bgColor} border ${statusInfo.borderColor}`}>
                           <StatusIcon className={`w-3.5 h-3.5 ${statusInfo.color}`} />
                           <span className={`text-[9px] font-black uppercase tracking-widest ${statusInfo.color}`}>
                             {withdrawal.status}
                           </span>
                         </div>
                      </div>
                      <p className="text-gray-900 text-3xl font-black mb-1.5 tracking-tight">
                        ₹{withdrawal.amount}
                      </p>
                      <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest mb-1">
                        Requested: {withdrawal.date}
                      </p>
                      {withdrawal.processedAt && (
                        <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest">
                          Processed: {withdrawal.processedAt}
                        </p>
                      )}
                      {withdrawal.failureReason && (
                        <div className="mt-3 bg-red-50 p-3 rounded-[12px] border border-red-100">
                          <p className="text-red-600 text-[10px] font-black uppercase tracking-widest">
                            Failed: <span className="font-bold text-red-500 normal-case tracking-normal">{withdrawal.failureReason}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
             <div className="w-16 h-16 rounded-[24px] bg-white flex items-center justify-center mb-4 border border-gray-100 shadow-sm">
               <Clock className="w-6 h-6 text-gray-300" />
             </div>
             <p className="text-gray-900 text-lg font-black mb-2 tracking-tight">No withdrawal history</p>
             <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest leading-relaxed max-w-[250px] mx-auto">
               You haven't made any withdrawal requests yet. Your withdrawal history will appear here.
             </p>
          </div>
        )}
      </div>
    </div>
  );
};
