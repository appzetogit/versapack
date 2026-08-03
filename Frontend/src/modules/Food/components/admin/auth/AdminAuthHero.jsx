import { motion, useReducedMotion } from "framer-motion"
import { Boxes, Timer, Store } from "lucide-react"
import { useCompanyName } from "@food/hooks/useCompanyName"
import QuickCommerceArt from "./QuickCommerceArt"

/**
 * Left-hand hero on the admin auth screens.
 *
 * Reads as a grocery marketplace rather than a restaurant platform: the three
 * figures below are the ones a quick-commerce operator actually watches —
 * delivery time, stock, and how many sellers are trading.
 */
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

  const float = prefersReducedMotion
    ? {}
    : {
        animate: { y: [0, -10, 0] },
        transition: { duration: 6, repeat: Infinity, ease: "easeInOut" },
      }

  const stats = [
    { icon: Timer, label: "Avg delivery", value: "12 min" },
    { icon: Boxes, label: "In stock", value: "1,240 SKUs" },
    { icon: Store, label: "Sellers live", value: "24" },
  ]

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#0B1410]">
      {/* Ambient wash */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-20 -top-24 h-80 w-80 rounded-full blur-3xl"
          style={{ backgroundColor: `${themeColor}33` }}
        />
        <div
          className="absolute -bottom-16 right-0 h-72 w-72 rounded-full blur-3xl"
          style={{ backgroundColor: `${themeColor}22` }}
        />
      </div>

      {/* Faint grid, kept low so the artwork stays the focus */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative z-10 flex h-full flex-col justify-between p-8 xl:p-10">
        {/* Brand lockup */}
        <motion.div {...fadeUp(0)} className="flex items-center gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              className="h-10 w-10 rounded-xl object-contain ring-1 ring-white/15"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
            />
          ) : null}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              Admin Portal
            </p>
            <p className="text-lg font-bold leading-tight text-white">
              Suvio <span style={{ color: themeColor }}>Quick Commerce</span>
            </p>
          </div>
        </motion.div>

        {/* Headline + artwork */}
        <div className="flex flex-col gap-7">
          <motion.div {...fadeUp(0.1)}>
            <h1 className="text-[2rem] font-bold leading-[1.15] tracking-tight text-white xl:text-[2.6rem]">
              Groceries at the door
              <span className="block" style={{ color: themeColor }}>
                in minutes, not hours
              </span>
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/55">
              Sellers, stock, riders and orders — one console for the whole
              marketplace, updating as it happens.
            </p>
          </motion.div>

          <motion.div {...fadeUp(0.18)} className="relative">
            <motion.div {...float}>
              <QuickCommerceArt accent={themeColor} className="h-auto w-full max-w-[330px]" />
            </motion.div>
          </motion.div>

          <motion.div {...fadeUp(0.26)} className="grid max-w-sm grid-cols-3 gap-2.5">
            {stats.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm"
              >
                <Icon
                  className="mb-2 h-4 w-4"
                  style={{ color: themeColor }}
                  aria-hidden="true"
                />
                <p className="text-[10px] font-medium text-white/40">{label}</p>
                <p className="mt-0.5 text-sm font-bold text-white">{value}</p>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.p {...fadeUp(0.32)} className="text-[11px] text-white/30">
          &copy; {new Date().getFullYear()} {companyName || "Suvio Quick Commerce"}
        </motion.p>
      </div>
    </div>
  )
}
