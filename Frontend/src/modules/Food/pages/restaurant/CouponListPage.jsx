import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { 
  ArrowLeft,
  Plus,
  Tag,
  Trash2,
  MoreVertical,
  Calendar,
  Percent,
  IndianRupee,
  Copy
} from "lucide-react"
import { restaurantAPI } from "@food/api"
import { toast } from "sonner"

export default function CouponListPage() {
  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [openMenuId, setOpenMenuId] = useState(null)
  const [coupons, setCoupons] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenuId && !event.target.closest(`[data-menu-id="${openMenuId}"]`)) {
        setOpenMenuId(null)
      }
    }
    if (openMenuId) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [openMenuId])

  const fetchCoupons = async () => {
    try {
      setIsLoading(true)
      const res = await restaurantAPI.listMyOffers()
      setCoupons(res.data?.data?.offers || [])
    } catch (error) {
      toast.error("Failed to fetch coupons")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchCoupons() }, [])

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this coupon?")) return
    try {
      await restaurantAPI.deleteMyOffer(id)
      toast.success("Coupon deleted")
      fetchCoupons()
    } catch {
      toast.error("Failed to delete coupon")
    }
  }

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code)
    toast.success("Code copied!")
  }

  const isActive = (coupon) => {
    const now = new Date()
    const start = coupon.startDate ? new Date(coupon.startDate) : null
    const end = coupon.endDate ? new Date(coupon.endDate) : null
    if (start && now < start) return false
    if (end && now > end) return false
    return coupon.status === "active"
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Go back">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-gray-900">Offers & Coupons</h1>
            <p className="text-xs text-gray-500">Restaurant-sponsored discounts</p>
          </div>
          <button
            onClick={() => navigate("/restaurant/coupon/new")}
            className="flex items-center gap-1.5 text-white text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
            style={{
              background: "linear-gradient(135deg, rgba(var(--module-theme-rgb,37,99,235),0.9), var(--module-theme-color,#2563EB))",
              boxShadow: "0 8px 18px rgba(var(--module-theme-rgb,37,99,235),0.26)",
            }}
          >
            <Plus className="w-4 h-4" />
            Add New
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-4 pb-8 space-y-3">
        {isLoading ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-gray-900 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-600 text-sm">Loading coupons...</p>
            </div>
          </div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-lg border border-gray-200">
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                <Tag className="w-8 h-8 text-gray-400" />
              </div>
              <div>
                <p className="text-gray-900 font-semibold text-sm">No coupons yet</p>
                <p className="text-gray-500 text-xs mt-1">Create your first offer to attract customers</p>
              </div>
              <button
                onClick={() => navigate("/restaurant/coupon/new")}
                className="flex items-center gap-2 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
                style={{
                  background: "linear-gradient(135deg, rgba(var(--module-theme-rgb,37,99,235),0.9), var(--module-theme-color,#2563EB))",
                }}
              >
                <Plus className="w-4 h-4" />
                Create Coupon
              </button>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {coupons.map((coupon, index) => {
              const active = isActive(coupon)
              return (
                <motion.div
                  key={coupon.id || coupon._id}
                  layout
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -20 }}
                  transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3), layout: { duration: 0.3 } }}
                  className="bg-white border border-gray-200 rounded-lg overflow-hidden"
                >
                  {/* Top accent bar */}
                  <div
                    className="h-1"
                    style={{ backgroundColor: active ? "var(--module-theme-color, #2563EB)" : "#d1d5db" }}
                  />

                  <div className="p-4">
                    {/* Header row */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2.5 py-1 rounded text-xs font-bold ${active ? "" : "bg-gray-100 text-gray-500"}`}
                          style={active ? {
                            backgroundColor: "rgba(var(--module-theme-rgb,37,99,235),0.10)",
                            color: "var(--module-theme-color,#2563EB)",
                          } : undefined}
                        >
                          {active ? "ACTIVE" : "INACTIVE"}
                        </span>
                        <span className="px-2.5 py-1 rounded text-xs font-bold bg-gray-100 text-gray-700">
                          {coupon.discountType === "percentage" ? "% OFF" : "FLAT OFF"}
                        </span>
                      </div>
                      <div className="relative" data-menu-id={coupon.id}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === coupon.id ? null : coupon.id) }}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                          data-menu-id={coupon.id}
                        >
                          <MoreVertical className="w-4 h-4 text-gray-500" />
                        </button>
                        <AnimatePresence>
                          {openMenuId === coupon.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -8 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -8 }}
                              transition={{ duration: 0.15 }}
                              className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-50 min-w-[160px]"
                              data-menu-id={coupon.id}
                            >
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(coupon.id); setOpenMenuId(null) }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" /> Delete
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {/* Coupon Code */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-xl font-extrabold text-gray-900 tracking-wider uppercase">
                        {coupon.couponCode}
                      </span>
                      <button onClick={() => handleCopyCode(coupon.couponCode)} className="p-1 hover:bg-gray-100 rounded transition-colors">
                        <Copy className="w-4 h-4" style={{ color: "var(--module-theme-color, #2563EB)" }} />
                      </button>
                    </div>

                    {/* Discount value */}
                    <div className="flex items-center gap-1.5 mb-3">
                      {coupon.discountType === "percentage"
                        ? <Percent className="w-4 h-4 text-gray-700" />
                        : <IndianRupee className="w-4 h-4 text-gray-700" />}
                      <span className="text-2xl font-black text-gray-900">{coupon.discountValue}</span>
                      <span className="text-sm text-gray-500 font-medium">
                        {coupon.discountType === "percentage" ? "% discount" : " flat off"}
                      </span>
                    </div>

                    {/* Divider */}
                    <div className="border-t border-dashed border-gray-200 my-3" />

                    {/* Details */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-0.5">Min Order</p>
                        <p className="text-sm font-semibold text-gray-900">₹{coupon.minOrderValue || 0}</p>
                      </div>
                      {coupon.maxDiscount && (
                        <div>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold mb-0.5">Max Discount</p>
                          <p className="text-sm font-semibold text-gray-900">₹{coupon.maxDiscount}</p>
                        </div>
                      )}
                      {(coupon.startDate || coupon.endDate) && (
                        <div className="col-span-2 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" />
                          <p className="text-xs text-gray-500">
                            {coupon.startDate ? new Date(coupon.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Now"}
                            {" → "}
                            {coupon.endDate ? new Date(coupon.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Forever"}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>

      {/* FAB */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => navigate("/restaurant/coupon/new")}
        className="fixed bottom-6 right-4 w-14 h-14 bg-gray-900 hover:bg-gray-800 text-white rounded-full shadow-lg flex items-center justify-center z-40 transition-colors"
      >
        <Plus className="w-6 h-6" />
      </motion.button>
    </div>
  )
}
