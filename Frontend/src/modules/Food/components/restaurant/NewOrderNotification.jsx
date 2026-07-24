import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, ShoppingBag, MapPin, Clock, IndianRupee } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getRestaurantCookingNote } from '@food/utils/orderCookingNote';

/**
 * New Order Notification Component
 * Displays a notification popup when a new order is received
 */
export default function NewOrderNotification({ order, onClose, onViewOrder }) {
  const navigate = useNavigate();

  if (!order) return null;

  const cookingNote = getRestaurantCookingNote(order);

  const handleViewOrder = () => {
    if (onViewOrder) {
      onViewOrder(order);
    } else {
      navigate(`/restaurant/orders/${order.orderMongoId || order.orderId}`);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -100, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -100, scale: 0.95 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed top-4 inset-x-4 z-[9999] max-w-md mx-auto"
      >
        <div className="bg-gray-950 rounded-[32px] p-5 shadow-[0_20px_40px_rgba(0,0,0,0.4)] border border-gray-800">
          <div className="flex justify-between items-start mb-4">
             <div className="flex items-center gap-4">
               <div className="w-14 h-14 bg-emerald-500 rounded-[24px] flex items-center justify-center flex-shrink-0 animate-[pulse_2s_ease-in-out_infinite] shadow-[0_0_24px_rgba(16,185,129,0.4)]">
                 <Bell className="w-7 h-7 text-emerald-950" />
               </div>
               <div>
                 <h3 className="text-emerald-400 font-black text-[11px] uppercase tracking-widest leading-none mb-1.5">New Order</h3>
                 <p className="text-white text-2xl font-black tracking-tight leading-none mb-2">#{order.orderId?.toString().slice(-6) || '---'}</p>
                 <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                   <span>{order.items?.length || 0} Items</span>
                   <span className="w-1 h-1 bg-gray-700 rounded-full" />
                   <span className="text-white text-sm">₹{order.total?.toFixed(2) || '0.00'}</span>
                 </div>
               </div>
             </div>
             
             <button
               onClick={onClose}
               className="w-10 h-10 rounded-full bg-gray-900 flex items-center justify-center text-gray-500 hover:bg-gray-800 hover:text-white transition-colors flex-shrink-0 border border-gray-800"
             >
               <X className="w-5 h-5" />
             </button>
          </div>

          {/* Compressed Items List */}
          <div className="bg-gray-900 rounded-[20px] p-4 border border-gray-800 mb-4">
            <p className="text-gray-300 text-sm font-medium leading-relaxed line-clamp-2">
              {order.items?.map(i => `${i.quantity}x ${i.name}`).join(', ') || 'Standard Order Items'}
            </p>
            {(cookingNote || order.estimatedDeliveryTime) && (
              <div className="mt-3 pt-3 border-t border-gray-800 flex flex-wrap gap-3">
                {order.estimatedDeliveryTime && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                    <Clock className="w-3.5 h-3.5 text-gray-500" />
                    {order.estimatedDeliveryTime} mins
                  </div>
                )}
                {cookingNote && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-400 uppercase tracking-widest truncate flex-1">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full flex-shrink-0" />
                    <span className="truncate">Cooking: {cookingNote}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-900 hover:bg-gray-800 text-gray-300 font-black text-[11px] uppercase tracking-widest py-4 rounded-[20px] transition-colors border border-gray-800"
            >
              Dismiss
            </button>
            <button
              onClick={handleViewOrder}
              className="flex-[2] bg-emerald-500 hover:bg-emerald-600 text-emerald-950 font-black text-[12px] uppercase tracking-widest py-4 rounded-[20px] transition-colors flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(16,185,129,0.3)] active:scale-[0.98]"
            >
              <ShoppingBag className="w-4 h-4" />
              View Order
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
