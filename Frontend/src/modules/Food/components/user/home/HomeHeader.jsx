import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ChevronDown, Search, Mic, Bell, CheckCircle2, Tag, Gift, AlertCircle, Clock, BellOff, X, ChevronRight, ShoppingBag } from 'lucide-react';
import { Badge } from "@food/components/ui/badge";
import { Avatar, AvatarFallback } from "@food/components/ui/avatar";
import foodIcon from "@food/assets/category-icons/food.png";
import quickIcon from "@food/assets/category-icons/quick.png";
import taxiIcon from "@food/assets/category-icons/taxi.png";
import hotelIcon from "@food/assets/category-icons/hotel.png";
import useNotificationInbox from "@food/hooks/useNotificationInbox";
import { useSearchOverlay } from "../UserLayout";
const ICON_MAP = {
  CheckCircle2,
  Tag,
  Gift,
  AlertCircle
};



export default function HomeHeader({ 
  activeTab,
  setActiveTab,
  location, 
  savedAddressText, 
  handleLocationClick, 
  handleSearchFocus, 
  placeholderIndex, 
  placeholders,
  handleVegModeChange,
  isVegMode,
  vegModeToggleRef,
  isCategoryStuck = false,
  topBanners = [],
  topBannersLoaded = false,
}) {
  const { startVoiceSearch } = useSearchOverlay();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState(() => {
    const saved = localStorage.getItem('food_user_notifications');
    return saved ? JSON.parse(saved) : [];
  });
  const {
    items: broadcastNotifications,
    unreadCount: broadcastUnreadCount,
    dismiss: dismissBroadcastNotification,
  } = useNotificationInbox("user", { limit: 20 });

  useEffect(() => {
    const syncNotifications = () => {
      const saved = localStorage.getItem('food_user_notifications');
      setNotifications(saved ? JSON.parse(saved) : []);
    };

    // Listen for updates from the main Notifications page
    window.addEventListener('notificationsUpdated', syncNotifications);
    // Also listen for new notifications being added via listeners in Notifications.jsx (indirectly via localStorage update)
    // But since localStorage doesn't fire events on same window, we can use a custom event or a simple interval if needed.
    // However, the Notifications.jsx already multi-dispatches.
    
    return () => window.removeEventListener('notificationsUpdated', syncNotifications);
  }, []);

  const festCategories = [
    { id: "food", name: "Food", icon: foodIcon, bgColor: "bg-white dark:bg-[#1a1a1a]" },
    { id: "quick", name: "Quick", icon: quickIcon, bgColor: "bg-white dark:bg-[#1a1a1a]" },
    { id: "taxi", name: "Taxi", icon: taxiIcon, bgColor: "bg-white dark:bg-[#1a1a1a]" },
    { id: "hotel", name: "Hotel", icon: hotelIcon, bgColor: "bg-white dark:bg-[#1a1a1a]" },
  ];

  const mergedNotifications = useMemo(() => {
    const localItems = Array.isArray(notifications)
      ? notifications.map((item) => ({ ...item, source: "local" }))
      : [];
    const broadcastItems = (broadcastNotifications || []).map((item) => ({
      ...item,
      source: "broadcast",
      time: item.createdAt
        ? new Date(item.createdAt).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          })
        : "Just now",
      type: "broadcast",
      icon: "Bell",
      iconColor: "text-blue-600",
    }));

    return [...broadcastItems, ...localItems].sort(
      (a, b) =>
        new Date(b.createdAt || b.timestamp || 0).getTime() -
        new Date(a.createdAt || a.timestamp || 0).getTime()
    );
  }, [broadcastNotifications, notifications]);

  const unreadCount = notifications.filter(n => !n.read).length + broadcastUnreadCount;

  const handleDeleteNotification = (id, source = "local") => {
    if (source === "broadcast") {
      dismissBroadcastNotification(id);
      return;
    }
    setNotifications((prev) => {
      const next = prev.filter((notification) => notification.id !== id);
      localStorage.setItem('food_user_notifications', JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('notificationsUpdated', { detail: { count: next.filter((n) => !n.read).length } }));
      return next;
    });
  };

  const [currentSlide, setCurrentSlide] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationsHistoryPushedRef = useRef(false);
  const touchStartXRef = useRef(0);
  const touchEndXRef = useRef(0);

  const hasDynamicBanners = Array.isArray(topBanners) && topBanners.length > 0;

  useEffect(() => {
    const slideCount = hasDynamicBanners ? topBanners.length : 0;

    if (slideCount <= 1) {
      setCurrentSlide(0);
      return;
    }

    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      setCurrentSlide((prev) => (prev + 1) % slideCount);
    }, 4000);

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        setCurrentSlide((prev) => (prev + 1) % slideCount);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [hasDynamicBanners, topBanners]);

  const handleTouchStart = (event) => {
    touchStartXRef.current = event.touches[0]?.clientX || 0;
    touchEndXRef.current = touchStartXRef.current;
  };

  const handleTouchMove = (event) => {
    touchEndXRef.current = event.touches[0]?.clientX || touchEndXRef.current;
  };

  const handleTouchEnd = () => {
    const deltaX = touchStartXRef.current - touchEndXRef.current;
    const minSwipeDistance = 45;

    if (Math.abs(deltaX) < minSwipeDistance) return;

    if (deltaX > 0) {
      // Swipe left -> next slide
      setCurrentSlide((prev) => (prev + 1) % displayBanners.length);
      return;
    }

    // Swipe right -> previous slide
    setCurrentSlide((prev) => (prev - 1 + displayBanners.length) % displayBanners.length);
  };

  useEffect(() => {
    if (!isNotificationsOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    if (!notificationsHistoryPushedRef.current) {
      window.history.pushState({ notificationsPopup: true }, "");
      notificationsHistoryPushedRef.current = true;
    }

    const handlePopState = () => {
      notificationsHistoryPushedRef.current = false;
      setIsNotificationsOpen(false);
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isNotificationsOpen]);

  const closeNotifications = (useHistoryBack = true) => {
    if (useHistoryBack && notificationsHistoryPushedRef.current) {
      notificationsHistoryPushedRef.current = false;
      window.history.back();
      return;
    }
    setIsNotificationsOpen(false);
  };

  const displayBanners = hasDynamicBanners
    ? topBanners.map((banner, index) => ({
        id: index,
        bg: "bg-gray-100 dark:bg-gray-800",
        content: (
          <img 
            src={banner.image || banner.imageUrl} 
            alt={`Banner ${index + 1}`} 
            className="absolute inset-0 w-full h-full object-cover" 
          />
        )
      }))
    : [];

  return (
    <>
      <div
        className="relative h-[340px] w-full overflow-hidden rounded-b-[2rem] shadow-[0_10px_40px_rgba(250,2,114,0.15)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        
        {/* Sliding Background Track */}
        {hasDynamicBanners ? (
          <div 
            className="absolute inset-0 flex transition-transform duration-700 ease-in-out z-0"
            style={{ transform: `translateX(-${currentSlide * 100}%)` }}
          >
            {displayBanners.map((banner) => (
              <div key={banner.id} className={`relative w-full h-full shrink-0 ${banner.bg}`}>
                {banner.content}
              </div>
            ))}
          </div>
        ) : (
          <div
            className={`absolute inset-0 z-0 transition-opacity duration-300 ${
              topBannersLoaded ? "bg-[#FA0272]" : "bg-gradient-to-br from-[#ff2d8d] via-[#FA0272] to-[#ff6a00] animate-pulse"
            }`}
          >
            <div className="absolute top-0 left-1/4 w-32 h-32 bg-white/20 blur-[60px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-40 h-40 bg-white/10 blur-[80px] rounded-full pointer-events-none" />
          </div>
        )}

        {/* Static Overlay Location Row */}
        <div className="absolute top-0 inset-x-0 z-20 px-4 pt-5 flex items-center justify-between gap-3">
          <div 
            className="flex items-center gap-1.5 cursor-pointer group min-w-0 flex-1"
            onClick={handleLocationClick}
          >
            <div className="bg-white/20 p-1.5 rounded-full backdrop-blur-md border border-white/20 hover:bg-white/30 transition-colors shadow-sm dark:bg-black/20 dark:border-white/10 dark:hover:bg-white/10 flex-shrink-0">
              <MapPin className="h-4 w-4 text-gray-900 dark:text-white" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                <span className="text-[10px] font-bold text-gray-900/80 dark:text-white/80 uppercase tracking-wider">Deliver to</span>
                <ChevronDown className="h-2.5 w-2.5 text-gray-900/80 dark:text-white/80" />
              </div>
              <span className="text-sm font-bold text-gray-900 dark:text-white truncate drop-shadow-sm max-w-full">
                {savedAddressText || (location?.area && location?.city 
                  ? `${location.area}, ${location.city}` 
                  : location?.area || location?.city || "Select Location")}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              onClick={() => setIsNotificationsOpen(true)}
              className="h-10 w-10 relative flex items-center justify-center rounded-full bg-white/20 backdrop-blur-md border border-white/30 shadow-sm cursor-pointer active:scale-95 transition-all hover:bg-white/30 dark:bg-black/20 dark:border-white/10 dark:hover:bg-white/10 flex-shrink-0"
            >
              <Bell className="h-[22px] w-[22px] text-gray-900 dark:text-white" />
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-yellow-400 rounded-full border-2 border-white animate-pulse dark:border-gray-900" />
              )}
            </div>
 
            {/* Veg Mode Toggle */}
            <div 
              className="flex items-center gap-1.5 h-10 bg-white/20 dark:bg-black/20 backdrop-blur-md rounded-full px-2.5 border border-white/30 shadow-sm cursor-pointer hover:bg-white/30 dark:border-white/10 dark:hover:bg-white/10 active:scale-95 transition-all flex-shrink-0"
              onClick={() => handleVegModeChange && handleVegModeChange(!isVegMode)}
              ref={vegModeToggleRef}
            >
              <div
                className={`flex items-center justify-center p-[2px] rounded-sm border ${isVegMode ? '' : 'border-gray-500'} bg-white flex-shrink-0`}
                style={isVegMode ? { borderColor: "#16A34A" } : undefined}
              >
                <div
                  className={`w-[6px] h-[6px] rounded-full ${isVegMode ? '' : 'bg-gray-500'}`}
                  style={isVegMode ? { backgroundColor: "#16A34A" } : undefined}
                />
              </div>
              <span
                className={`text-[9px] font-black uppercase tracking-tight ${isVegMode ? '' : 'text-gray-800 dark:text-gray-200'} hidden xs:inline`}
                style={isVegMode ? { color: "#166534" } : undefined}
              >
                Veg
              </span>
              <div
                className={`w-6 h-3.5 rounded-full relative transition-colors ml-0.5 flex-shrink-0 ${isVegMode ? '' : 'bg-gray-400/80 dark:bg-gray-600'}`}
                style={isVegMode ? { backgroundColor: "#22C55E" } : undefined}
              >
                <div className={`absolute top-[1.5px] w-2.5 h-2.5 rounded-full bg-white transition-transform ${isVegMode ? 'translate-x-[11px]' : 'translate-x-[1.5px]'}`} />
              </div>
            </div>
          </div>
        </div>
        
        {/* Carousel Pager Dots */}
        {hasDynamicBanners && displayBanners.length > 1 && (
          <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1.5 z-20">
            {displayBanners.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setCurrentSlide(i)}
                className={`h-1 rounded-full transition-all duration-300 ${i === currentSlide ? 'bg-black/60 w-3 dark:bg-white/80' : 'bg-black/20 w-1.5 dark:bg-white/30'}`}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {isNotificationsOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/25 backdrop-blur-[1px]"
            onClick={() => closeNotifications()}
          >
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute top-[84px] right-3 w-[calc(100vw-24px)] max-w-80 rounded-2xl overflow-hidden shadow-2xl bg-white dark:bg-gray-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  Notifications
                  {unreadCount > 0 && (
                    <Badge variant="secondary" className="bg-orange-100 text-orange-600 border-none text-[10px] h-4">
                      {unreadCount} New
                    </Badge>
                  )}
                </h3>
                <div className="flex items-center gap-2">
                  <Link
                    to="/food/user/notifications"
                    onClick={() => closeNotifications()}
                    className="text-xs font-bold text-orange-600 hover:text-orange-700"
                  >
                    {mergedNotifications.length > 0 ? "View All" : ""}
                  </Link>
                  <button
                    type="button"
                    onClick={() => closeNotifications()}
                    className="rounded-full p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Close notifications"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="max-h-[60vh] overflow-y-auto overscroll-contain">
                {mergedNotifications.length > 0 ? (
                  mergedNotifications.slice(0, 5).map((notif) => {
                    const Icon = ICON_MAP[notif.icon] || Bell;
                    return (
                      <div
                        key={notif.id}
                        className={`p-4 flex items-start gap-3 border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer ${!notif.read ? 'bg-orange-50/20' : ''}`}
                      >
                        <div className={`mt-1 p-2 rounded-full ${notif.type === "order" ? "bg-green-100/50 text-green-600" : "bg-orange-100/50 text-orange-600"}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <span className="text-sm font-bold text-gray-900 dark:text-white truncate">{notif.title}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-gray-400 whitespace-nowrap">{notif.time}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleDeleteNotification(notif.id, notif.source);
                                }}
                                className="rounded-full p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">
                            {notif.message}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center flex flex-col items-center gap-2">
                    <BellOff className="h-10 w-10 text-gray-200" />
                    <p className="text-xs text-gray-400 font-medium">All caught up!</p>
                  </div>
                )}
              </div>
              <div className="p-3 bg-gray-50/50 dark:bg-gray-800/50 text-center">
                <Link
                  to="/food/user/notifications"
                  onClick={() => closeNotifications()}
                  className="text-xs font-bold text-gray-400 hover:text-gray-600"
                >
                  {mergedNotifications.length > 0 ? "Manage Settings" : "Check Notifications Page"}
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sticky Search Bar wrapper — position adjusts when categories are also stuck */}
      <div
        className={`relative sticky z-[60] px-3 pb-0 -mt-[256px] mb-[210px] pointer-events-none ${
          isCategoryStuck ? 'top-0 pt-2' : 'top-2'
        }`}
      >
        <div 
          className={`relative z-[60] rounded-[1.5rem] flex items-center px-4 py-3.5 border cursor-pointer active:scale-[0.98] group mx-1 pointer-events-auto ${
            isCategoryStuck
              ? "bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-xl border-white dark:border-gray-800 shadow-[0_12px_36px_rgba(0,0,0,0.12)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.4)]"
              : "bg-white dark:bg-[#1a1a1a] border-gray-100 dark:border-gray-800 shadow-sm"
          }`}
          onClick={handleSearchFocus}
          onTouchStart={handleSearchFocus}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleSearchFocus();
            }
          }}
        >
          <Search className="h-5 w-5 text-gray-400 mr-3 group-hover:text-[#FA0272] transition-colors duration-300 dark:text-gray-500" strokeWidth={2.5} />
          <div className="flex-1 overflow-hidden relative h-5">
            <input
              type="text"
              readOnly
              aria-label="Search"
              onFocus={handleSearchFocus}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <AnimatePresence mode="wait">
              <motion.span
                key={placeholderIndex}
                initial={{ y: 15, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -15, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="absolute inset-0 text-[14px] font-bold text-gray-500 dark:text-gray-400"
              >
                {placeholders?.[placeholderIndex] || 'Search "pizza"'}
              </motion.span>
            </AnimatePresence>
          </div>
          <div 
            className="bg-[#FA0272]/5 dark:bg-[#FA0272]/10 p-2 rounded-full border border-[#FA0272]/10 ml-2 group-hover:bg-[#FA0272]/10 transition-all flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              navigate('/user/search?voice=true');
            }}
            onTouchStart={(e) => {
              e.stopPropagation();
              navigate('/user/search?voice=true');
            }}
          >
            <Mic className="h-4 w-4 text-[#FA0272]" strokeWidth={2.5} />
          </div>
        </div>
      </div>
    </>
  );
}
