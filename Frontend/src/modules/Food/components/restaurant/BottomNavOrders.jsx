import { useNavigate, useLocation } from "react-router-dom"
import { memo, useMemo } from "react"
import { motion } from "framer-motion"
import {
  FileText,
  Package,
  Wallet,
  Compass,
} from "lucide-react"

const getOrdersTabs = (basePath = "/restaurant") => [
  { id: "orders", label: "Orders", icon: FileText, route: `${basePath}` },
  { id: "inventory", label: "Inventory", icon: Package, route: `${basePath}/inventory` },
  { id: "payouts", label: "Payouts", icon: Wallet, route: `${basePath}/hub-finance` },
  { id: "explore", label: "Explore", icon: Compass, route: `${basePath}/explore` },
]

const findActiveTab = (tabs, pathname) =>
  tabs
    .slice()
    .sort((a, b) => b.route.length - a.route.length)
    .find((tab) => pathname === tab.route || pathname.startsWith(tab.route + "/"))

function BottomNavOrders() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const basePath = pathname.startsWith("/food/restaurant")
    ? "/food/restaurant"
    : pathname.startsWith("/restaurant")
      ? "/food/restaurant"
      : "/restaurant"

  const tabs = useMemo(() => getOrdersTabs(basePath), [basePath])

  const isInternalPage = pathname.includes("/create-offers")
  if (isInternalPage) {
    return null
  }

  const activeTab = useMemo(() => {
    const match = findActiveTab(tabs, pathname)
    return match?.id || "orders"
  }, [tabs, pathname])

  const handleTabClick = (tab) => {
    if (tab.route && tab.route !== pathname) {
      navigate(tab.route)
    }
  }

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-[60] px-3 pb-[max(0.55rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto w-full max-w-md">
        <div className="relative overflow-hidden rounded-full bg-gray-900/96 backdrop-blur-xl py-1.5 px-2 shadow-[0_24px_60px_rgba(0,0,0,0.35)] border border-white/10">
          <div className="relative flex items-center justify-around gap-1">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id

              return (
                <motion.button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabClick(tab)}
                  aria-current={isActive ? "page" : undefined}
                  className="relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2 rounded-full transition-colors duration-200"
                  whileTap={{ scale: 0.95 }}
                >
                  {isActive && (
                    <motion.div
                      layoutId="bottomNavActive"
                      className="absolute inset-x-1 inset-y-1 rounded-full"
                      style={{ backgroundColor: "rgba(var(--module-theme-rgb, 37,99,235), 0.16)" }}
                      initial={false}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon
                    className={`relative z-10 h-[18px] w-[18px] transition-all duration-300 ${isActive ? "scale-110" : "text-white/40"
                      }`}
                    style={isActive ? { color: "var(--module-theme-color, #2563EB)" } : undefined}
                  />
                  <span
                    className={`relative z-10 whitespace-nowrap text-[9px] font-bold tracking-tight transition-colors duration-300 ${isActive ? "" : "text-white/40"
                      }`}
                    style={isActive ? { color: "var(--module-theme-color, #2563EB)" } : undefined}
                  >
                    {tab.label}
                  </span>
                </motion.button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default memo(BottomNavOrders)
