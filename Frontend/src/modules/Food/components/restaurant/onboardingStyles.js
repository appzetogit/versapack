export const RESTAURANT_BRAND = "#FA0272"
export const RESTAURANT_BRAND_RGB = "250,2,114"
export const RESTAURANT_BRAND_HOVER = "#D90263"

export const ONBOARDING_FONT =
  "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

export const ONBOARDING_STEPS = [
  { id: 1, title: "Restaurant Info", subtitle: "Name, owner & location" },
  { id: 2, title: "Menu & Hours", subtitle: "Photos & delivery timings" },
  { id: 3, title: "Legal Documents", subtitle: "PAN, GST, FSSAI & bank" },
  { id: 4, title: "Subscription", subtitle: "Plans & onboarding fee" },
]

export const ONBOARDING_SECTION =
  "rounded-2xl border border-gray-200/90 bg-white shadow-[0_2px_16px_rgba(15,23,42,0.06)]"

export const ONBOARDING_SECTION_INNER = "p-5 sm:p-6 lg:p-7 space-y-5"

export const ONBOARDING_SECTION_FULL =
  "rounded-2xl border border-gray-200/90 bg-white shadow-[0_2px_16px_rgba(15,23,42,0.06)] p-5 sm:p-6 lg:p-7 space-y-5"

export const ONBOARDING_SECTION_TITLE =
  "text-base sm:text-lg font-semibold text-gray-900 tracking-tight"

export const ONBOARDING_SECTION_DESC = "text-sm text-gray-500 leading-relaxed"

export const ONBOARDING_LABEL = "text-sm font-medium text-gray-700"

export const ONBOARDING_HINT = "text-xs text-gray-500 leading-relaxed mt-1.5"

export const ONBOARDING_INPUT =
  "mt-2 h-11 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-[#FA0272]/20 focus-visible:border-[#FA0272]/50 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"

export const ONBOARDING_TEXTAREA =
  "mt-2 min-h-[96px] rounded-xl border border-gray-200 bg-white text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-[#FA0272]/20 focus-visible:border-[#FA0272]/50 disabled:bg-gray-50"

export const ONBOARDING_CHIP_BASE =
  "px-4 py-2 text-sm font-medium rounded-xl border transition-all duration-200"

export const ONBOARDING_CHIP_ACTIVE =
  "bg-[#FA0272] text-white border-[#FA0272] shadow-sm shadow-[#FA0272]/20"

export const ONBOARDING_CHIP_INACTIVE =
  "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50"

export const ONBOARDING_DAY_ACTIVE =
  "bg-[#FA0272] text-white border-[#FA0272] shadow-sm shadow-[#FA0272]/15"

export const ONBOARDING_DAY_INACTIVE =
  "bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-white"

export const ONBOARDING_UPLOAD_BOX =
  "mt-2 rounded-xl border border-dashed border-gray-300 bg-gray-50/80 px-4 py-4 transition-colors hover:border-[#FA0272]/40 hover:bg-[#FA0272]/5"

export const ONBOARDING_UPLOAD_BTN =
  "h-10 rounded-xl border-gray-200 text-sm font-medium text-gray-700 hover:border-[#FA0272]/30 hover:bg-[#FA0272]/5 hover:text-[#FA0272]"

export const ONBOARDING_INFO_BOX =
  "rounded-2xl border border-[#FA0272]/15 bg-[#FA0272]/5 p-5 sm:p-6"

export const ONBOARDING_PLAN_CARD =
  "flex h-full flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-[#FA0272]/25 hover:shadow-md"

export const ONBOARDING_DOC_PREVIEW =
  "mt-3 relative w-full max-w-[160px] sm:max-w-[180px] lg:max-w-[200px] aspect-[4/3] rounded-xl overflow-hidden border border-gray-200 bg-gray-50 shadow-sm"

export const chipClass = (active, disabled = false) =>
  `${ONBOARDING_CHIP_BASE} ${active ? ONBOARDING_CHIP_ACTIVE : ONBOARDING_CHIP_INACTIVE} ${
    disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
  }`
