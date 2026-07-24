import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import confetti from "canvas-confetti"
import { BadgePercent, CheckCircle2 } from "lucide-react"

const SESSION_BANNER_KEY = "food_auto_coupon_cart_banner_session"

function fireCartOfferConfetti() {
  try {
    const burst = (x) =>
      confetti({
        particleCount: 22,
        spread: 42,
        startVelocity: 16,
        gravity: 0.95,
        ticks: 85,
        origin: { x, y: 0.22 },
        colors: ["#FA0272", "#ff9ec4", "#22c55e", "#ffffff"],
        disableForReducedMotion: true,
      })
    burst(0.35)
    setTimeout(() => burst(0.65), 120)
  } catch {
    // ignore
  }
}

export default function CartAutoCouponBanner({ appliedCoupon, savings = 0 }) {
  const [phase, setPhase] = useState("hidden")
  const confettiFiredRef = useRef(false)

  useEffect(() => {
    if (!appliedCoupon?.code) {
      setPhase("hidden")
      confettiFiredRef.current = false
      return undefined
    }

    try {
      const shownFor = sessionStorage.getItem(SESSION_BANNER_KEY)
      if (shownFor === appliedCoupon.code) {
        setPhase("compact")
        return undefined
      }
      sessionStorage.setItem(SESSION_BANNER_KEY, appliedCoupon.code)
    } catch {
      // ignore
    }

    setPhase("expanded")
    if (!confettiFiredRef.current) {
      confettiFiredRef.current = true
      fireCartOfferConfetti()
    }

    const collapseTimer = setTimeout(() => setPhase("compact"), 4500)
    return () => clearTimeout(collapseTimer)
  }, [appliedCoupon?.code])

  const displaySavings = Math.max(
    0,
    Number(savings) || Number(appliedCoupon?.discount) || 0,
  )

  if (!appliedCoupon?.code || phase === "hidden") return null

  return (
    <AnimatePresence mode="wait">
      {phase === "expanded" ? (
        <motion.div
          key="expanded"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="px-4 md:px-6 pt-3 pb-1"
        >
          <div className="relative overflow-hidden rounded-2xl border border-[#FA0272]/15 bg-white dark:bg-[#1a1a1a] shadow-[0_6px_24px_rgba(250,2,114,0.1)]">
            <div className="absolute inset-0 bg-gradient-to-br from-[#FFF8FB] to-white dark:from-[#FA0272]/8 dark:to-[#1a1a1a]" />
            <div className="relative px-3.5 py-3 sm:px-4 sm:py-3.5">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl bg-[#FA0272] text-white shadow-[0_6px_16px_rgba(250,2,114,0.28)]">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                    Coupon applied
                  </p>
                  <p className="mt-0.5 text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                    {displaySavings > 0
                      ? `₹${displaySavings.toFixed(0)} off on this order`
                      : `${appliedCoupon.code} added to your cart`}
                  </p>
                  <p className="mt-0.5 text-[11px] sm:text-xs text-slate-600 dark:text-slate-400">
                    Highest savings coupon picked for you.
                  </p>
                </div>
                <div className="shrink-0 rounded-lg border border-[#FA0272]/20 bg-[#FFF0F6] dark:bg-[#FA0272]/10 px-2 py-1.5 sm:px-2.5 text-center">
                  <BadgePercent className="mx-auto h-3.5 w-3.5 text-[#FA0272]" />
                  <p className="mt-0.5 text-[10px] font-bold text-[#FA0272]">{appliedCoupon.code}</p>
                </div>
              </div>
              <div className="mt-2.5 h-0.5 overflow-hidden rounded-full bg-[#FA0272]/10">
                <motion.div
                  className="h-full rounded-full bg-[#FA0272]"
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: 4.5, ease: "linear" }}
                />
              </div>
            </div>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="compact"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
          className="px-4 md:px-6 pt-2.5 pb-1"
        >
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/90 bg-white dark:bg-[#1a1a1a] dark:border-gray-800 px-3 py-2 shadow-sm">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                {displaySavings > 0
                  ? `₹${displaySavings.toFixed(0)} saved · ${appliedCoupon.code}`
                  : `${appliedCoupon.code} applied`}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Reflected in your bill total
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
