import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { useLocation } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import confetti from "canvas-confetti"
import { Check } from "lucide-react"
import { AUTO_COUPON_APPLIED_EVENT } from "@food/utils/autoCoupon"

function fireOfferConfetti(originY = 0.78) {
  try {
    confetti({
      particleCount: 28,
      spread: 46,
      startVelocity: 18,
      gravity: 1,
      ticks: 90,
      origin: { x: 0.5, y: originY },
      colors: ["#FA0272", "#ff85b3", "#16a34a", "#ffffff"],
      disableForReducedMotion: true,
    })
  } catch {
    // ignore
  }
}

export default function AutoCouponCelebration() {
  const [celebration, setCelebration] = useState(null)
  const location = useLocation()
  const isCartPage = /\/cart(?:\/|$)/.test(location.pathname)

  useEffect(() => {
    if (isCartPage) return undefined

    const onApplied = (event) => {
      const detail = event?.detail || {}
      const savings = Math.max(0, Number(detail.savings) || 0)
      const code = String(detail.code || "").trim().toUpperCase()

      setCelebration({ savings, code, estimated: Boolean(detail.estimated) })
      fireOfferConfetti(0.8)
    }

    window.addEventListener(AUTO_COUPON_APPLIED_EVENT, onApplied)
    return () => window.removeEventListener(AUTO_COUPON_APPLIED_EVENT, onApplied)
  }, [isCartPage])

  useEffect(() => {
    if (!celebration) return undefined
    const timer = setTimeout(() => setCelebration(null), 2800)
    return () => clearTimeout(timer)
  }, [celebration])

  if (typeof document === "undefined") return null

  return createPortal(
    <AnimatePresence>
      {celebration && !isCartPage ? (
        <motion.div
          key="auto-coupon-celebration"
          initial={{ opacity: 0, y: 16, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className="fixed left-0 right-0 z-[10001] pointer-events-none flex justify-center px-3 sm:px-4"
          style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="relative w-full max-w-[280px] sm:max-w-sm">
            <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-white border border-slate-200/90 shadow-[0_10px_32px_rgba(15,23,42,0.16)]">
              <div className="absolute inset-y-0 left-0 w-1 bg-[#FA0272]" />
              <div className="relative flex items-center gap-2 sm:gap-3 px-2.5 py-2 sm:px-3.5 sm:py-2.5 pl-3.5 sm:pl-4">
                <div className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                  <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 stroke-[3]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] sm:text-[11px] font-semibold text-[#FA0272] leading-none">
                    Offer applied
                  </p>
                  <p className="mt-0.5 text-[13px] sm:text-[15px] font-bold text-slate-900 leading-tight truncate">
                    {celebration.savings > 0
                      ? `You save ₹${Math.round(celebration.savings)}`
                      : "Discount unlocked"}
                  </p>
                  <p className="hidden sm:block mt-0.5 text-[10px] text-slate-500 leading-snug">
                    {celebration.estimated
                      ? "Best coupon matched to your cart"
                      : "Applied automatically"}
                  </p>
                </div>
                {celebration.code ? (
                  <span className="shrink-0 rounded-md bg-[#FFF0F6] border border-[#FA0272]/15 px-1.5 py-0.5 sm:px-2 sm:py-1 text-[9px] sm:text-[10px] font-bold text-[#FA0272] tracking-wide">
                    {celebration.code}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="mx-auto h-2 w-2 sm:h-2.5 sm:w-2.5 rotate-45 bg-white border-r border-b border-slate-200 -mt-1 shadow-sm" />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
