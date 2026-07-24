import { Check } from "lucide-react"

const THEME = "#FF5F00"

export const ONBOARDING_STEPS = [
  { id: 1, title: "Restaurant details", subtitle: "Basic info & location" },
  { id: 2, title: "Operations", subtitle: "Menu, hours & media" },
  { id: 3, title: "Compliance", subtitle: "Legal & bank details" },
  { id: 4, title: "Subscription", subtitle: "Plans & onboarding fee" },
]

export default function RestaurantOnboardingProgress({ currentStep = 1, variant = "mobile" }) {
  const progressPercent = Math.min(100, Math.max(0, (currentStep / ONBOARDING_STEPS.length) * 100))
  const currentMeta = ONBOARDING_STEPS.find((s) => s.id === currentStep) || ONBOARDING_STEPS[0]

  if (variant === "sidebar") {
    return (
      <div className="flex flex-1 flex-col border-t border-white/10 px-6 py-6">
        <p className="mb-5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
          Onboarding progress
        </p>
        <ol className="space-y-0">
          {ONBOARDING_STEPS.map((stepItem, index) => {
            const isComplete = currentStep > stepItem.id
            const isCurrent = currentStep === stepItem.id
            const isLast = index === ONBOARDING_STEPS.length - 1

            return (
              <li key={stepItem.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors"
                    style={{
                      backgroundColor: isComplete || isCurrent ? THEME : "rgba(255,255,255,0.08)",
                      color: isComplete || isCurrent ? "#fff" : "rgba(255,255,255,0.35)",
                      boxShadow: isCurrent ? `0 0 0 3px ${THEME}40` : undefined,
                    }}
                  >
                    {isComplete ? <Check className="h-4 w-4" strokeWidth={3} /> : stepItem.id}
                  </div>
                  {!isLast && (
                    <div
                      className="my-1 w-0.5 flex-1 min-h-[28px] rounded-full transition-colors"
                      style={{
                        backgroundColor: isComplete ? THEME : "rgba(255,255,255,0.1)",
                      }}
                    />
                  )}
                </div>
                <div className={`pb-6 ${isLast ? "pb-0" : ""}`}>
                  <p
                    className={`text-sm font-semibold leading-tight ${isCurrent ? "text-white" : isComplete ? "text-white/70" : "text-white/35"}`}
                  >
                    {stepItem.title}
                  </p>
                  <p className="mt-0.5 text-xs text-white/40">{stepItem.subtitle}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    )
  }

  return (
    <div className="border-b border-gray-100 bg-white px-4 py-4 sm:px-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Step {currentStep} of {ONBOARDING_STEPS.length}
          </p>
          <p className="truncate text-sm font-bold text-gray-900">{currentMeta.title}</p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-white"
          style={{ backgroundColor: THEME }}
        >
          {Math.round(progressPercent)}%
        </span>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%`, backgroundColor: THEME }}
        />
      </div>

      <div className="mt-3 hidden gap-1 sm:grid sm:grid-cols-4">
        {ONBOARDING_STEPS.map((stepItem) => {
          const isComplete = currentStep > stepItem.id
          const isCurrent = currentStep === stepItem.id
          return (
            <div
              key={stepItem.id}
              className={`rounded-lg px-2 py-1.5 text-center text-[10px] font-semibold leading-tight transition-colors ${
                isCurrent
                  ? "text-white"
                  : isComplete
                    ? "bg-orange-50 text-[#FF5F00]"
                    : "bg-gray-50 text-gray-400"
              }`}
              style={isCurrent ? { backgroundColor: THEME } : undefined}
            >
              {stepItem.title}
            </div>
          )
        })}
      </div>
    </div>
  )
}
