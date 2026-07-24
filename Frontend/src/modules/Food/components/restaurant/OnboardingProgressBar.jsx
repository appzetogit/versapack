import { Check } from "lucide-react"
import { ONBOARDING_STEPS, RESTAURANT_BRAND } from "./onboardingStyles"

const PROGRESS_GREEN = "#10b981"
const PROGRESS_GREEN_MID = "#34d399"
const PROGRESS_GREEN_LIGHT = "#6ee7b7"
const PROGRESS_GREEN_GLOW = "0 0 12px rgba(16, 185, 129, 0.5)"

function StepCircle({ stepId, currentStep, compact = false, variant = "default" }) {
  const isCompleted = stepId < currentStep
  const isActive = stepId === currentStep
  const isSidebar = variant === "sidebar"

  const completedStyle = isSidebar
    ? {
        borderColor: PROGRESS_GREEN_LIGHT,
        backgroundColor: PROGRESS_GREEN_MID,
        boxShadow: "0 1px 2px rgba(6, 78, 59, 0.2)",
      }
    : {
        borderColor: PROGRESS_GREEN,
        backgroundColor: PROGRESS_GREEN,
      }

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-full border-2 font-bold text-white transition-all duration-300 ${
        compact ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"
      } ${
        isCompleted
          ? ""
          : isActive
            ? isSidebar
              ? "border-white bg-white text-[#FA0272] shadow-lg shadow-black/20"
              : "border-[#FA0272] bg-[#FA0272] text-white shadow-lg shadow-[#FA0272]/25 motion-safe:scale-105"
            : isSidebar
              ? "border-white/35 bg-white/10 text-white/60"
              : "border-slate-200 bg-white text-slate-400"
      }`}
      style={isCompleted ? completedStyle : undefined}
      aria-current={isActive ? "step" : undefined}
    >
      {isCompleted ? <Check className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} strokeWidth={3} /> : stepId}
    </div>
  )
}

function Connector({ completed, vertical = false, variant = "default", centered = false }) {
  const isSidebar = variant === "sidebar"

  return (
    <div
      className={`transition-colors duration-300 ${
        vertical
          ? "mx-auto h-6 w-0.5 shrink-0"
          : centered
            ? "h-0.5 w-8 shrink-0 sm:w-10"
            : "h-0.5 flex-1 min-w-[12px]"
      } ${completed ? "" : isSidebar ? "bg-white/25" : "bg-slate-200"}`}
      style={
        completed
          ? { backgroundColor: isSidebar ? PROGRESS_GREEN_LIGHT : PROGRESS_GREEN_MID }
          : undefined
      }
      aria-hidden="true"
    />
  )
}

export function OnboardingProgressBarHorizontal({ currentStep }) {
  const activeStep = ONBOARDING_STEPS.find((s) => s.id === currentStep)

  return (
    <div className="w-full" aria-label={`Step ${currentStep} of ${ONBOARDING_STEPS.length}`}>
      <div className="mx-auto flex max-w-sm items-center justify-center">
        {ONBOARDING_STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <StepCircle stepId={step.id} currentStep={currentStep} compact />
            {index < ONBOARDING_STEPS.length - 1 && (
              <Connector completed={step.id < currentStep} centered />
            )}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: RESTAURANT_BRAND }}>
            Step {currentStep} of {ONBOARDING_STEPS.length}
          </p>
          <p className="truncate text-sm font-bold text-slate-900">{activeStep?.title}</p>
        </div>
        <div className="shrink-0 rounded-full bg-[#FA0272]/10 px-3 py-1">
          <span className="text-xs font-bold" style={{ color: RESTAURANT_BRAND }}>
            {Math.round((currentStep / ONBOARDING_STEPS.length) * 100)}%
          </span>
        </div>
      </div>
    </div>
  )
}

export function OnboardingProgressBarVertical({ currentStep }) {
  const progressPercent = Math.round((currentStep / ONBOARDING_STEPS.length) * 100)

  return (
    <div className="space-y-5 px-1">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/70">
          Onboarding Progress
        </p>
        <p className="mt-1 text-2xl font-black text-white xl:text-3xl">{progressPercent}%</p>
        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: PROGRESS_GREEN,
              boxShadow: PROGRESS_GREEN_GLOW,
            }}
          />
        </div>
      </div>

      <ol className="space-y-0 pl-1" aria-label="Onboarding steps">
        {ONBOARDING_STEPS.map((step, index) => {
          const isCompleted = step.id < currentStep
          const isActive = step.id === currentStep

          return (
            <li key={step.id} className="flex gap-4">
              <div className="flex w-10 shrink-0 flex-col items-center">
                <StepCircle stepId={step.id} currentStep={currentStep} variant="sidebar" />
                {index < ONBOARDING_STEPS.length - 1 && (
                  <Connector completed={isCompleted} vertical variant="sidebar" />
                )}
              </div>
              <div className={`pb-3 pt-1 ${isActive ? "opacity-100" : isCompleted ? "opacity-80" : "opacity-50"}`}>
                <p className={`text-sm font-bold leading-tight ${isActive ? "text-white" : "text-white/90"}`}>
                  {step.title}
                </p>
                <p className="mt-0.5 text-xs text-white/70">{step.subtitle}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
