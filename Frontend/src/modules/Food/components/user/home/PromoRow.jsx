import React from 'react';
import { motion } from 'framer-motion';
import discountPromoIcon from "@food/assets/category-icons/discount_promo.png";
import gourmetPromoIcon from "@food/assets/explore more icons/gourmet.png";
import pricePromoIcon from "@food/assets/category-icons/price_promo.png";
import collectionPromoIcon from "@food/assets/explore more icons/collection.png";

export default function PromoRow({ handleVegModeChange, navigate, isVegMode, toggleRef }) {
  const promoCardsData = [
    {
      id: 'offers',
      title: "Hot Deals",
      value: "Offers",
      icon: discountPromoIcon,
    },
    {
      id: 'gourmet',
      title: "Premium",
      value: "Gourmet",
      icon: gourmetPromoIcon,
    },
    {
      id: 'under-250',
      title: "Under ₹99",
      value: "Switch 99",
      icon: pricePromoIcon,
    },
    {
      id: 'collections',
      title: "Favorites",
      value: "Collections",
      icon: collectionPromoIcon,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2 px-3 py-6 bg-transparent justify-items-center w-full max-w-[500px] mx-auto">
      {promoCardsData.map((promo, idx) => (
        <motion.div
          key={idx}
          ref={promo.id === 'gourmet' ? toggleRef : null}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          whileHover={{ y: -4 }}
          whileTap={{ scale: 0.95 }}
          className="flex flex-col items-center gap-1.5 group cursor-pointer w-full"
          onClick={() => {
            if (promo.id === 'gourmet') navigate('/food/user/gourmet');
            else if (promo.id === 'offers') navigate('/food/user/offers');
            else if (promo.id === 'under-250') navigate('/food/user/under-250');
            else if (promo.id === 'collections') navigate('/food/user/profile/favorites');
          }}
        >
          {/* Floating Minimalist Image */}
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center p-0.5">
            <img
              src={promo.icon}
              alt={promo.value}
              className="w-full h-full object-contain relative z-20 transition-transform duration-500 group-hover:scale-110 drop-shadow-sm"
            />
          </div>

          {/* Clean Typography */}
          <div className="flex flex-col items-center text-center w-full">
            <span className="text-[12px] font-black text-gray-900 dark:text-gray-100 tracking-tight leading-tight mb-0.5">
              {promo.value}
            </span>
            <span className="text-[9px] font-bold text-gray-500 dark:text-gray-400 capitalize whitespace-nowrap">
              {promo.title}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
