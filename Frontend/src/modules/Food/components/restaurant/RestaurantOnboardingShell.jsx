import { ChevronLeft, LogOut, Sparkles, X } from "lucide-react"
import { Button } from "@food/components/ui/button"
import RestaurantPartnerHero from "@food/components/restaurant/auth/RestaurantPartnerHero"
import {
  OnboardingProgressBarHorizontal,
  OnboardingProgressBarVertical,
} from "./OnboardingProgressBar"
import { ONBOARDING_STEPS, ONBOARDING_FONT, RESTAURANT_BRAND } from "./onboardingStyles"

export default function RestaurantOnboardingShell({
  step,
  companyName: _companyName,
  logoUrl: _logoUrl,
  loading,
  saving,
  error,
  keyboardInset,
  isEditing,
  isLoggingOut,
  nextDisabled = false,
  continueLabel,
  onBack,
  onLogout,
  onEnableEdit,
  onNext,
  children,
}) {
  const activeStep = ONBOARDING_STEPS.find((s) => s.id === step)

  const defaultContinueLabel = step === 4
    ? saving
      ? "Submitting..."
      : "Submit for approval"
    : saving
      ? "Saving..."
      : "Continue"

  const label = continueLabel || defaultContinueLabel

  return (
    <div
      className="min-h-screen w-full bg-[#F0F2F5]"
      style={{ fontFamily: ONBOARDING_FONT }}
    >
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[400px] flex-col border-r border-gray-200/80 xl:w-[440px] lg:flex">
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-hidden">
            <RestaurantPartnerHero compact themeColor={RESTAURANT_BRAND} />
          </div>
          <div className="shrink-0 border-t border-white/10 bg-[#0f0b14] px-6 py-6 xl:px-8">
            <div className="mb-5 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                Current step
              </p>
              <p className="mt-1 text-lg font-semibold text-white">{activeStep?.title}</p>
              <p className="mt-0.5 text-xs text-white/60">{activeStep?.subtitle}</p>
            </div>
            <OnboardingProgressBarVertical currentStep={step} />
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col lg:ml-[400px] lg:h-screen lg:overflow-hidden xl:ml-[440px]">
        <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur-md lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FA0272]/30"
                aria-label={step > 1 ? "Go back" : "Close onboarding"}
              >
                {step > 1 ? <ChevronLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
              </button>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">Restaurant onboarding</p>
                <p className="truncate text-xs text-gray-500">{activeStep?.title}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {!loading && !isEditing && (
                <Button
                  type="button"
                  onClick={onEnableEdit}
                  variant="outline"
                  size="sm"
                  className="cursor-pointer border-[#FA0272]/20 bg-[#FA0272]/5 text-[#FA0272] hover:bg-[#FA0272]/10"
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              <Button
                type="button"
                onClick={onLogout}
                disabled={isLoggingOut}
                variant="ghost"
                size="icon"
                className="h-10 w-10 cursor-pointer text-red-600 hover:bg-red-50 hover:text-red-700"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="border-t border-gray-100 px-4 pb-4 pt-3 sm:px-6">
            <OnboardingProgressBarHorizontal currentStep={step} />
          </div>
        </header>

        <header className="hidden shrink-0 items-center justify-between border-b border-gray-200 bg-white px-8 py-5 lg:flex xl:px-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Step {step} of {ONBOARDING_STEPS.length}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">
              {activeStep?.title}
            </h1>
            <p className="mt-1 text-sm text-gray-500">{activeStep?.subtitle}</p>
          </div>

          <div className="flex items-center gap-3">
            {!loading && !isEditing && (
              <Button
                type="button"
                onClick={onEnableEdit}
                variant="outline"
                className="cursor-pointer border-[#FA0272]/20 bg-[#FA0272]/5 text-[#FA0272] hover:bg-[#FA0272]/10"
              >
                <Sparkles className="mr-1.5 h-4 w-4" />
                Edit Details
              </Button>
            )}
            <Button
              type="button"
              onClick={onLogout}
              disabled={isLoggingOut}
              variant="outline"
              className="cursor-pointer border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <LogOut className="mr-1.5 h-4 w-4" />
              Exit
            </Button>
          </div>
        </header>

        <main
          id="onboarding-main-scroll"
          className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 lg:px-8 lg:py-8 xl:px-10"
          style={{ paddingBottom: keyboardInset ? `${keyboardInset + 20}px` : undefined }}
        >
          <div className="mx-auto w-full max-w-3xl space-y-5">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-gray-200 bg-white py-20 shadow-sm">
                <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-gray-200 border-t-[#FA0272]" />
                <p className="text-sm font-medium text-gray-500">Loading your onboarding details...</p>
              </div>
            ) : (
              <div className={!isEditing ? "pointer-events-none select-none opacity-95" : ""}>
                {children}
              </div>
            )}
          </div>
        </main>

        {error && (
          <div className="mx-auto w-full max-w-3xl px-4 pb-2 sm:px-6 lg:px-8 xl:px-10">
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          </div>
        )}

        <footer
          className={`shrink-0 border-t border-gray-200 bg-white/95 backdrop-blur-md lg:sticky lg:bottom-0 lg:z-30 ${
            keyboardInset ? "hidden" : ""
          }`}
        >
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:px-10">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 1 || saving}
              onClick={onBack}
              className="cursor-pointer text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40"
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={onNext}
              disabled={nextDisabled}
              className="min-w-[140px] cursor-pointer rounded-xl px-8 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: nextDisabled ? undefined : RESTAURANT_BRAND }}
            >
              {label}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  )
}
