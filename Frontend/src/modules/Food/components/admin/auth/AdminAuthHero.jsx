import { motion, useReducedMotion } from "framer-motion"
import { Shield, BarChart3 } from "lucide-react"
import { useCompanyName } from "@food/hooks/useCompanyName"
import quickSpicyLogo from "@food/assets/switcheats-logo.png"

export default function AdminAuthHero({ themeColor, logoUrl }) {
  const companyName = useCompanyName()
  const prefersReducedMotion = useReducedMotion()

  const fadeUp = (delay = 0) =>
    prefersReducedMotion
      ? {}
      : {
          initial: { opacity: 0, y: 20 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, delay, ease: "easeOut" },
        }

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#141018]">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-16 -top-16 h-72 w-72 rounded-full blur-3xl"
          style={{ backgroundColor: `${themeColor}40` }}
        />
        <div
          className="absolute bottom-0 right-0 h-64 w-64 rounded-full blur-3xl"
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

      <div className="relative z-10 flex h-full flex-col justify-between p-8 xl:p-10">
        <div className="absolute right-8 top-8 xl:right-10 xl:top-10">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur-sm">
            <img
              src={logoUrl}
              alt={`${companyName} logo`}
              className="h-full w-full scale-[1.65] object-contain"
              loading="lazy"
              onError={(e) => {
                if (e.target.src !== quickSpicyLogo) {
                  e.target.src = quickSpicyLogo
                }
              }}
            />
          </div>
        </div>

        <motion.div {...fadeUp(0)} className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${themeColor}20` }}
          >
            <Shield className="h-4 w-4" style={{ color: themeColor }} aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-medium text-white/50">Admin Portal</p>
            <p className="text-base font-semibold text-white">{companyName}</p>
          </div>
        </motion.div>

        <div className="flex flex-col gap-6">
          <motion.div {...fadeUp(0.1)}>
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-white xl:text-4xl">
              Run your platform
              <span className="block" style={{ color: themeColor }}>
                from one dashboard
              </span>
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/60">
              Manage restaurants, orders, deliveries, and analytics — all in real time.
            </p>
          </motion.div>

          <motion.div
            {...fadeUp(0.2)}
            className="w-full max-w-xs rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
            aria-hidden="true"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                Overview
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: `${themeColor}25`, color: themeColor }}
              >
                Live
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Orders", value: "1,284" },
                { label: "Revenue", value: "₹4.2L" },
                { label: "Active", value: "342" },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg bg-white/5 p-2.5 ring-1 ring-white/10">
                  <p className="text-[9px] font-medium text-white/40">{stat.label}</p>
                  <p className="mt-0.5 text-sm font-bold text-white">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex h-8 items-end gap-1">
              {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${h}%`,
                    background: `linear-gradient(to top, ${themeColor}99, ${themeColor})`,
                    opacity: 0.35 + (i / 10) * 0.65,
                  }}
                />
              ))}
            </div>
          </motion.div>

          <motion.div {...fadeUp(0.3)} className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${themeColor}20` }}
            >
              <BarChart3 className="h-4 w-4" style={{ color: themeColor }} aria-hidden="true" />
            </div>
            <p className="text-sm text-white/50">
              Trusted by teams managing thousands of daily orders.
            </p>
          </motion.div>
        </div>

        <motion.p {...fadeUp(0.35)} className="text-[11px] text-white/30">
          &copy; {new Date().getFullYear()} {companyName}
        </motion.p>
      </div>
    </div>
  )
}
