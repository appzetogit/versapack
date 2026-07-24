import { motion, useReducedMotion } from "framer-motion"
import { ShieldCheck, UtensilsCrossed, TrendingUp, Clock } from "lucide-react"
import { useCompanyName } from "@food/hooks/useCompanyName"

const DEFAULT_THEME = "#FA0272"

const HIGHLIGHTS = [
  { icon: UtensilsCrossed, text: "Manage menus, orders & outlet timings" },
  { icon: TrendingUp, text: "Track earnings and subscription insights" },
  { icon: Clock, text: "Go live faster with guided onboarding" },
]

export default function RestaurantPartnerHero({ compact = false, themeColor = DEFAULT_THEME }) {
  const companyName = useCompanyName()
  const prefersReducedMotion = useReducedMotion()

  const fadeUp = (delay = 0) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.4, delay, ease: "easeOut" },
        }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#141018]">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-16 -top-16 h-72 w-72 rounded-full blur-3xl"
          style={{ backgroundColor: `${themeColor}40` }}
        />
        <div
          className="absolute bottom-0 right-0 h-56 w-56 rounded-full blur-3xl"
          style={{ backgroundColor: `${themeColor}25` }}
        />
      </div>

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className={`relative z-10 flex h-full flex-col ${compact ? "p-6 xl:p-8" : "justify-between p-8 xl:p-10"}`}>
        <motion.div {...fadeUp(0)} className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${themeColor}20` }}
          >
            <ShieldCheck className="h-4 w-4" style={{ color: themeColor }} aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium text-white/50">Partner Portal</p>
            <p className="text-base font-semibold text-white">{companyName}</p>
          </div>
        </motion.div>

        <div className={`flex flex-col gap-6 ${compact ? "mt-8 flex-1" : "py-8"}`}>
          <motion.div {...fadeUp(0.08)}>
            <h1
              className={`font-bold leading-tight tracking-tight text-white ${compact ? "text-2xl xl:text-3xl" : "text-3xl xl:text-4xl"}`}
            >
              Grow your restaurant
              <span className="block" style={{ color: themeColor }}>
                with {companyName}
              </span>
            </h1>
            {!compact && (
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/60">
                Sign in to manage orders, update your menu, track finances, and onboard your outlet in minutes.
              </p>
            )}
          </motion.div>

          <motion.ul {...fadeUp(0.16)} className="space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item.text} className="flex items-start gap-3">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${themeColor}20` }}
                >
                  <item.icon className="h-4 w-4" style={{ color: themeColor }} aria-hidden="true" />
                </div>
                <span className="pt-1 text-sm leading-snug text-white/55">{item.text}</span>
              </li>
            ))}
          </motion.ul>
        </div>

        {!compact && (
          <motion.p {...fadeUp(0.24)} className="text-[11px] text-white/30">
            &copy; {new Date().getFullYear()} {companyName}
          </motion.p>
        )}
      </div>
    </div>
  )
}
