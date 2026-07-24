import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { 
  ArrowLeft,
  ChevronDown,
  Wand2,
  Percent,
  IndianRupee,
  Tag,
  Loader2
} from "lucide-react"
import { restaurantAPI } from "@food/api"
import { toast } from "sonner"

export default function AddCouponPage(props) {
  const { mode = "create" } = props || {}
  const isEditMode = mode === "edit"

  const navigate = useNavigate()
  const goBack = useRestaurantBackNavigation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showDiscountTypeDropdown, setShowDiscountTypeDropdown] = useState(false)
  const discountTypeRef = useRef(null)

  const [formData, setFormData] = useState({
    couponCode: "",
    discountType: "percentage",
    discountValue: "",
    minOrderValue: "",
    maxDiscount: "",
    usageLimit: "",
    perUserLimit: "",
    startDate: "",
    endDate: "",
  })

  const [errors, setErrors] = useState({})
  const today = new Date()
  const todayDateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`

  useEffect(() => {
    const handle = (e) => {
      if (discountTypeRef.current && !discountTypeRef.current.contains(e.target)) setShowDiscountTypeDropdown(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [])

  const set = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: null }))
  }

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let code = ""
    for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
    set("couponCode", code)
  }

  const validate = () => {
    const e = {}
    if (!formData.couponCode.trim()) e.couponCode = "Coupon code is required"
    if (!formData.discountValue || isNaN(formData.discountValue) || Number(formData.discountValue) <= 0)
      e.discountValue = "Enter a valid discount value"
    if (formData.discountType === "percentage" && Number(formData.discountValue) > 100)
      e.discountValue = "Percentage cannot exceed 100"
    if (!formData.startDate) e.startDate = "Start date is required"
    if (!formData.endDate) e.endDate = "End date is required"
    if (formData.startDate && formData.startDate < todayDateString)
      e.startDate = "Start date cannot be in the past"
    if (formData.startDate && formData.endDate && new Date(formData.startDate) > new Date(formData.endDate))
      e.endDate = "End date must be after start date"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (!validate()) return
    setIsSubmitting(true)
    try {
      const payload = {
        couponCode: formData.couponCode.toUpperCase(),
        discountType: formData.discountType,
        discountValue: Number(formData.discountValue),
        minOrderValue: Number(formData.minOrderValue) || 0,
        maxDiscount: formData.maxDiscount ? Number(formData.maxDiscount) : undefined,
        usageLimit: formData.usageLimit ? Number(formData.usageLimit) : undefined,
        perUserLimit: formData.perUserLimit ? Number(formData.perUserLimit) : undefined,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
        status: "active"
      }
      await restaurantAPI.createMyOffer(payload)
      toast.success("Coupon created successfully!")
      navigate("/restaurant/coupon")
    } catch (error) {
      toast.error(error.response?.data?.message || error.message || "Failed to save coupon")
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputCls = (field) =>
    `w-full px-4 py-3 bg-gray-50 border rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 transition-colors ${
      errors[field]
        ? "border-red-300 focus:ring-red-300"
        : "border-gray-200 focus:ring-gray-400 focus:border-gray-500"
    }`

  const FieldLabel = ({ children, required }) => (
    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
      {children} {required && <span className="text-red-500">*</span>}
    </label>
  )

  const ErrorMsg = ({ field }) => errors[field]
    ? <p className="text-xs text-red-500 mt-1">{errors[field]}</p>
    : null

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <button onClick={goBack} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" aria-label="Go back">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-gray-900">
              {isEditMode ? "Edit Coupon" : "Create Coupon"}
            </h1>
            <p className="text-xs text-gray-500">Restaurant-sponsored offer</p>
          </div>
                  </div>
      </div>

      <div className="px-4 py-4 pb-8 space-y-3 max-w-lg mx-auto">

        {/* Basic Details */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Coupon Details</h2>

          {/* Coupon Code */}
          <div>
            <FieldLabel required>Coupon Code</FieldLabel>
            <div className="flex gap-2">
              <input
                value={formData.couponCode}
                onChange={(e) => set("couponCode", e.target.value.toUpperCase())}
                placeholder="e.g. SAVE20"
                className={`${inputCls("couponCode")} flex-1 font-mono tracking-widest`}
              />
              <button
                onClick={generateCode}
                className="px-3 py-3 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg transition-colors flex items-center gap-1.5 text-sm font-medium text-gray-700 shrink-0"
                title="Auto-generate code"
              >
                <Wand2 className="w-4 h-4" />
              </button>
            </div>
            <ErrorMsg field="couponCode" />
          </div>

          {/* Discount */}
          <div>
            <FieldLabel required>Discount</FieldLabel>
            <div className="flex gap-2">
              <input
                type="number"
                value={formData.discountValue}
                onChange={(e) => set("discountValue", e.target.value)}
                placeholder="Enter amount"
                className={`${inputCls("discountValue")} flex-1`}
              />
              {/* Discount type toggle */}
              <div className="relative" ref={discountTypeRef}>
                <button
                  onClick={() => setShowDiscountTypeDropdown(!showDiscountTypeDropdown)}
                  className="flex items-center gap-1.5 px-3 py-3 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg transition-colors text-sm font-semibold text-gray-800 min-w-[84px]"
                >
                  {formData.discountType === "percentage"
                    ? <Percent className="w-4 h-4 text-gray-700" />
                    : <IndianRupee className="w-4 h-4 text-gray-700" />}
                  <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                </button>
                {showDiscountTypeDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden min-w-[150px]"
                  >
                    {[
                      { value: "percentage", label: "Percentage (%)", icon: Percent },
                      { value: "flat-price", label: "Flat (₹)", icon: IndianRupee }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { set("discountType", opt.value); setShowDiscountTypeDropdown(false) }}
                        className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
                          formData.discountType === opt.value
                            ? "bg-gray-900 text-white font-semibold"
                            : "text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <opt.icon className="w-4 h-4" />
                        {opt.label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>
            <ErrorMsg field="discountValue" />
          </div>

          {/* Min Order */}
          <div>
            <FieldLabel>Minimum Order Value</FieldLabel>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₹</span>
              <input
                type="number"
                value={formData.minOrderValue}
                onChange={(e) => set("minOrderValue", e.target.value)}
                placeholder="0"
                className={`${inputCls("minOrderValue")} pl-7`}
              />
            </div>
          </div>

          {/* Max Discount (only for percentage) */}
          {formData.discountType === "percentage" && (
            <div>
              <FieldLabel>Max Discount Cap</FieldLabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">₹</span>
                <input
                  type="number"
                  value={formData.maxDiscount}
                  onChange={(e) => set("maxDiscount", e.target.value)}
                  placeholder="No cap"
                  className={`${inputCls("maxDiscount")} pl-7`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Usage Limits */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Usage Limits</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Total Uses</FieldLabel>
              <input
                type="number"
                value={formData.usageLimit}
                onChange={(e) => set("usageLimit", e.target.value)}
                placeholder="Unlimited"
                className={inputCls("usageLimit")}
              />
            </div>
            <div>
              <FieldLabel>Per User</FieldLabel>
              <input
                type="number"
                value={formData.perUserLimit}
                onChange={(e) => set("perUserLimit", e.target.value)}
                placeholder="Unlimited"
                className={inputCls("perUserLimit")}
              />
            </div>
          </div>
        </div>

        {/* Validity */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Validity Period</h2>

          {/* Start Date */}
          <div>
            <FieldLabel required>Start Date</FieldLabel>
            <div className="relative">
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                min={todayDateString}
                className={`${inputCls("startDate")} appearance-none`}
                style={{ colorScheme: "light" }}
              />
            </div>
            <ErrorMsg field="startDate" />
          </div>

          {/* End Date */}
          <div>
            <FieldLabel required>End Date</FieldLabel>
            <div className="relative">
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                min={formData.startDate || todayDateString}
                className={`${inputCls("endDate")} appearance-none`}
                style={{ colorScheme: "light" }}
              />
            </div>
            <ErrorMsg field="endDate" />
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-lg transition-colors text-sm"
          style={{
            background: "linear-gradient(135deg, rgba(var(--module-theme-rgb,37,99,235),0.9), var(--module-theme-color,#2563EB))",
            boxShadow: "0 10px 22px rgba(var(--module-theme-rgb,37,99,235),0.28)",
          }}
        >
          {isSubmitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
          ) : (
            isEditMode ? "Update Coupon" : "Create Coupon"
          )}
        </button>
      </div>
    </div>
  )
}
