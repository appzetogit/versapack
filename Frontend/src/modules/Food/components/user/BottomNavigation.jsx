import { Link, useLocation } from "react-router-dom"
import { Tag, User, Truck, ShoppingCart } from "lucide-react"
import { clearHomeScrollState } from "@food/utils/homeScrollRestore"

export default function BottomNavigation() {
  const location = useLocation()
  const pathname = location.pathname

  // Check active routes - support both /user/* and /* paths
  const isCart = pathname === "/food/cart" || pathname.startsWith("/food/user/cart")
  const isUnder250 = pathname === "/food/under-250" || pathname.startsWith("/food/user/under-250")
  const isProfile = pathname.startsWith("/food/profile") || pathname.startsWith("/food/user/profile")
  const isDelivery =
    !isCart &&
    !isUnder250 &&
    !isProfile &&
    (pathname === "/food" ||
      pathname === "/food/" ||
      pathname === "/food/user" ||
      (pathname.startsWith("/food/user") &&
        !pathname.includes("/cart") &&
        !pathname.includes("/under-250") &&
        !pathname.includes("/profile")))

  const activeColor = "var(--module-theme-color, #FA0272)"
  const activeBg = "rgba(var(--module-theme-rgb, 250,2,114), 0.12)"
  const activeFill = "rgba(var(--module-theme-rgb, 250,2,114), 0.2)"

  const handleHomeNavClick = () => {
    // Explicit Home tab should start at top, not restore a prior restaurant leave position.
    clearHomeScrollState()
  }

  return (
    <div
      className="md:hidden fixed bottom-6 left-5 right-5 z-50 pointer-events-none"
    >
      <div className="flex items-center justify-around h-auto px-2 py-1.5 bg-white/85 dark:bg-[#1a1a1a]/85 backdrop-blur-[20px] border border-white/50 dark:border-white/10 rounded-full shadow-[0_20px_40px_rgba(0,0,0,0.15)] pointer-events-auto">
        
        {/* Delivery Tab */}
        <Link
          to="/food/user"
          onClick={handleHomeNavClick}
          className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${isDelivery
              ? ""
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
            }`}
          style={isDelivery ? { color: activeColor, backgroundColor: activeBg } : undefined}
        >
          <div className="relative">
            <Truck className={`h-5 w-5 transition-transform duration-300 ${isDelivery ? "scale-110" : "text-gray-500 dark:text-gray-400"}`} strokeWidth={isDelivery ? 2.5 : 2} style={isDelivery ? { color: activeColor, fill: activeFill } : undefined} />
          </div>
          <span className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${isDelivery ? "" : "text-gray-500 dark:text-gray-400 opacity-80"}`}>
            Delivery
          </span>
        </Link>

        {/* Cart Tab */}
        <Link
          to="/food/user/cart"
          className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${isCart
              ? ""
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
            }`}
          style={isCart ? { color: activeColor, backgroundColor: activeBg } : undefined}
        >
          <div className="relative">
            <ShoppingCart className={`h-5 w-5 transition-transform duration-300 ${isCart ? "scale-110" : "text-gray-500 dark:text-gray-400"}`} strokeWidth={isCart ? 2.5 : 2} style={isCart ? { color: activeColor } : undefined} />
          </div>
          <span className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${isCart ? "" : "text-gray-500 dark:text-gray-400 opacity-80"}`}>
            Cart
          </span>
        </Link>

        {/* Under 250 Tab */}
        <Link
          to="/food/user/under-250"
          className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${isUnder250
              ? ""
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
            }`}
          style={isUnder250 ? { color: activeColor, backgroundColor: activeBg } : undefined}
        >
          <div className="relative">
            <Tag className={`h-5 w-5 transition-transform duration-300 ${isUnder250 ? "scale-110" : "text-gray-500 dark:text-gray-400"}`} strokeWidth={isUnder250 ? 2.5 : 2} style={isUnder250 ? { color: activeColor, fill: activeFill } : undefined} />
          </div>
          <span className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${isUnder250 ? "" : "text-gray-500 dark:text-gray-400 opacity-80"}`}>
            Switch 99
          </span>
        </Link>

        {/* Profile Tab */}
        <Link
          to="/food/user/profile"
          className={`flex flex-1 flex-col items-center justify-center gap-1 px-1 py-1.5 transition-all duration-300 relative rounded-full ${isProfile
              ? ""
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
            }`}
          style={isProfile ? { color: activeColor, backgroundColor: activeBg } : undefined}
        >
          <div className="relative">
            <User className={`h-5 w-5 transition-transform duration-300 ${isProfile ? "scale-110" : "text-gray-500 dark:text-gray-400"}`} strokeWidth={isProfile ? 2.5 : 2} style={isProfile ? { color: activeColor, fill: activeFill } : undefined} />
          </div>
          <span className={`text-[10px] sm:text-xs font-semibold tracking-wide transition-all ${isProfile ? "" : "text-gray-500 dark:text-gray-400 opacity-80"}`}>
            Profile
          </span>
        </Link>
      </div>
    </div>
  )
}
