import { useState } from "react"
import useRestaurantBackNavigation from "@food/hooks/useRestaurantBackNavigation"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, X } from "lucide-react"
import { API_ENDPOINTS } from "@food/api/config"
import api from "@food/api"
import { toast } from "sonner"
import { useCompanyName } from "@food/hooks/useCompanyName"

const debugError = (...args) => {}

export default function ShareFeedback() {
  const companyName = useCompanyName()
  const goBack = useRestaurantBackNavigation()
  const [rating, setRating] = useState(null)
  const [showThanks, setShowThanks] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const numbers = Array.from({ length: 11 }, (_, i) => i)

  const handleClose = () => {
    goBack()
  }

  const handleContinue = async () => {
    if (rating === null) return

    try {
      setIsSubmitting(true)
      const response = await api.post(API_ENDPOINTS.ADMIN.FEEDBACK_EXPERIENCE_CREATE, {
        rating: Math.ceil(rating / 2) || 1,
        module: "restaurant",
        comment: `User rated ${rating}/10 overall experience`,
      })

      if (response.data?.success) {
        setShowThanks(true)
      } else {
        throw new Error(response.data?.message || "Failed to submit")
      }
    } catch (error) {
      debugError("Error submitting feedback:", error)
      toast.error(error.message || "Failed to save feedback")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col md:min-h-full md:h-full md:overflow-y-auto md:bg-slate-50">
      <div className="flex-1 flex flex-col px-4 pt-4 pb-6 md:px-8 md:py-10 md:items-center">
        <div className="w-full flex-1 flex flex-col px-0 md:max-w-lg md:flex-none md:rounded-2xl md:border md:border-slate-200 md:bg-white md:shadow-sm md:overflow-hidden md:p-6">
          {/* Header */}
          <div className="flex items-center justify-between pb-3 md:pb-4">
            <div className="min-w-0">
              <p className="hidden md:block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-1">
                Help
              </p>
              <h1 className="text-xl font-semibold text-gray-900 md:text-2xl md:font-bold">
                Share your feedback
              </h1>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-full hover:bg-gray-100 md:hidden shrink-0"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-900" />
            </button>
          </div>

          <div className="flex-1 flex flex-col min-w-0">
            {/* Question */}
            <div className="mt-4 mb-6 md:mt-0 md:mb-5">
              <p className="text-sm text-gray-700 mb-1">Tell us about your</p>
              <p className="text-lg font-semibold text-gray-900">
                Overall experience with {companyName.toLowerCase()}
              </p>
            </div>

            {/* Rating scale */}
            <div className="mb-3 md:mb-5 min-w-0">
              <div className="grid grid-cols-11 gap-0.5 sm:gap-1 rounded-xl border border-gray-300 bg-white overflow-hidden">
                {numbers.map((num) => {
                  const isActive = rating === num
                  const intensity = rating === null ? 0 : Math.abs(num - rating)
                  const scale = isActive ? 1.05 : intensity === 1 ? 1.02 : 1

                  return (
                    <motion.button
                      key={num}
                      type="button"
                      onClick={() => setRating(num)}
                      whileTap={{ scale: 0.96 }}
                      animate={{ scale }}
                      transition={{ type: "spring", stiffness: 260, damping: 20 }}
                      className={`min-w-0 py-2.5 text-[11px] sm:text-xs font-medium border-l border-gray-200 first:border-l-0 focus:outline-none md:py-3 ${
                        isActive
                          ? "bg-black text-white"
                          : "bg-white text-gray-900 hover:bg-gray-50"
                      }`}
                    >
                      {num}
                    </motion.button>
                  )
                })}
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-xs text-red-500">Very Bad</span>
                <span className="text-xs text-green-600">Very Good</span>
              </div>
              {rating !== null && (
                <motion.p
                  className="mt-3 text-xs text-gray-600"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={rating}
                >
                  You rated your experience{" "}
                  <span className="font-semibold text-gray-900">{rating}/10</span>.
                </motion.p>
              )}
            </div>

            {/* Illustration placeholder */}
            <div className="mt-8 flex items-center justify-center md:mt-4">
              <div className="w-full max-w-xs h-44 rounded-3xl bg-gradient-to-r from-indigo-100 via-pink-100 to-yellow-100 flex items-end justify-center px-6 pb-6">
                <div className="flex items-end gap-2 w-full justify-between">
                  <div className="w-10 h-20 rounded-full bg-indigo-300" />
                  <div className="w-10 h-32 rounded-full bg-pink-300" />
                  <div className="w-10 h-24 rounded-full bg-purple-300" />
                  <div className="w-10 h-28 rounded-full bg-green-300" />
                  <div className="w-10 h-22 rounded-full bg-yellow-300" />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom button — inside the card */}
          <div className="pt-6 mt-auto md:pt-6">
            <motion.button
              type="button"
              onClick={handleContinue}
              disabled={rating === null || isSubmitting}
              className={`w-full py-3 rounded-full text-sm font-medium transition-colors ${
                rating === null || isSubmitting ? "bg-gray-200 text-gray-500" : "text-white"
              }`}
              style={
                rating !== null && !isSubmitting
                  ? {
                      background:
                        "linear-gradient(135deg, rgba(var(--module-theme-rgb,37,99,235),0.9), var(--module-theme-color,#2563EB))",
                      boxShadow: "0 8px 18px rgba(var(--module-theme-rgb,37,99,235),0.25)",
                    }
                  : undefined
              }
              whileTap={rating !== null && !isSubmitting ? { scale: 0.98 } : undefined}
            >
              {isSubmitting ? "Submitting..." : "Continue"}
            </motion.button>
          </div>
        </div>
      </div>

      {/* Thank you popup */}
      <AnimatePresence>
        {showThanks && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setShowThanks(false)
              goBack()
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 10, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 10, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-sm rounded-3xl bg-white px-5 pt-5 pb-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center text-center">
                <div className="mb-3 h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-green-600" />
                </div>
                <h2 className="text-base font-semibold text-gray-900 mb-1">Thanks for your feedback</h2>
                <p className="text-xs text-gray-600 mb-4">
                  It helps us improve your experience with {companyName.toLowerCase()}.
                </p>
                <button
                  type="button"
                  className="w-full py-2.5 rounded-full text-white text-sm font-medium"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(var(--module-theme-rgb,37,99,235),0.9), var(--module-theme-color,#2563EB))",
                  }}
                  onClick={() => {
                    setShowThanks(false)
                    goBack()
                  }}
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
