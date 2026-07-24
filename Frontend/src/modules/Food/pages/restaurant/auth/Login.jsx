import { useEffect, useRef, useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { motion, useReducedMotion } from "framer-motion"
import { Shield, Loader2 } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Label } from "@food/components/ui/label"
import { restaurantAPI } from "@food/api"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { loadBusinessSettings, getModuleLogoUrl } from "@food/utils/businessSettings"
import RestaurantPartnerHero from "@food/components/restaurant/auth/RestaurantPartnerHero"
import quickSpicyLogo from "@food/assets/switcheats-logo.png"

const DEFAULT_COUNTRY_CODE = "+91"
const THEME = "#FA0272"

export default function RestaurantLogin() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const prefersReducedMotion = useReducedMotion()
  const phoneInputRef = useRef(null)
  const [logoUrl, setLogoUrl] = useState(() => getModuleLogoUrl("restaurant") || quickSpicyLogo)
  const [formData, setFormData] = useState(() => {
    const saved = sessionStorage.getItem("restaurantLoginPhone")
    return {
      phone: saved || "",
      countryCode: DEFAULT_COUNTRY_CODE,
    }
  })
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        await loadBusinessSettings()
        const logo = getModuleLogoUrl("restaurant")
        if (logo) setLogoUrl(logo)
      } catch {
        // keep fallback
      }
    }
    fetchSettings()

    const handleSettingsUpdate = async () => {
      await loadBusinessSettings()
      const logo = getModuleLogoUrl("restaurant")
      if (logo) setLogoUrl(logo)
    }
    window.addEventListener("businessSettingsUpdated", handleSettingsUpdate)
    return () => window.removeEventListener("businessSettingsUpdated", handleSettingsUpdate)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return undefined

    const updateKeyboardInset = () => {
      const viewport = window.visualViewport
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardInset(inset > 0 ? inset : 0)
    }

    updateKeyboardInset()
    window.visualViewport.addEventListener("resize", updateKeyboardInset)
    window.visualViewport.addEventListener("scroll", updateKeyboardInset)

    return () => {
      window.visualViewport.removeEventListener("resize", updateKeyboardInset)
      window.visualViewport.removeEventListener("scroll", updateKeyboardInset)
    }
  }, [])

  const validatePhone = (phone) => {
    if (!phone || phone.trim() === "") return "Phone number required"
    const digitsOnly = phone.replace(/\D/g, "")
    if (digitsOnly.length !== 10) return "Must be 10 digits"
    if (!["6", "7", "8", "9"].includes(digitsOnly[0])) return "Invalid number"
    return ""
  }

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10)
    setFormData((prev) => ({ ...prev, phone: value }))
    sessionStorage.setItem("restaurantLoginPhone", value)
    if (error) setError(validatePhone(value))
  }

  const handleSendOTP = async () => {
    const phoneError = validatePhone(formData.phone)
    if (phoneError) {
      setError(phoneError)
      return
    }

    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      setIsSending(true)
      await restaurantAPI.sendOTP(fullPhone, "login")
      sessionStorage.setItem(
        "restaurantAuthData",
        JSON.stringify({
          method: "phone",
          phone: fullPhone,
          isSignUp: false,
          module: "restaurant",
        })
      )
      navigate("/food/restaurant/otp")
    } catch (apiErr) {
      setError(apiErr?.response?.data?.message || "Failed to send OTP")
    } finally {
      setIsSending(false)
    }
  }

  const formMotion = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.35, ease: "easeOut" },
      }

  const isValidPhone = !validatePhone(formData.phone)

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-white">
      <div className="hidden h-full lg:block lg:w-1/2">
        <RestaurantPartnerHero themeColor={THEME} />
      </div>

      <div className="flex h-full w-full flex-col bg-[#F0F2F5] lg:w-1/2">
        <div className="relative shrink-0 overflow-hidden px-6 py-5 lg:hidden" style={{ backgroundColor: "#141018" }}>
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-2xl"
            style={{ backgroundColor: `${THEME}35` }}
          />
          <div className="relative flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${THEME}20` }}
            >
              <Shield className="h-3.5 w-3.5" style={{ color: THEME }} aria-hidden="true" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-white/50">Partner Portal</p>
              <p className="text-sm font-semibold text-white">{companyName}</p>
            </div>
          </div>
        </div>

        <div
          className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-8 sm:px-10"
          style={{ paddingBottom: keyboardInset ? `${keyboardInset + 24}px` : undefined }}
        >
          <motion.div {...formMotion} className="my-auto w-full max-w-[380px]">
            <div className="mb-7 text-center lg:text-left">
              <div className="mb-5 flex justify-center lg:justify-start">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                  <img
                    src={logoUrl}
                    alt={`${companyName} logo`}
                    className="h-full w-full scale-[1.65] object-contain"
                    loading="lazy"
                    onError={(e) => {
                      if (e.target.src !== quickSpicyLogo) e.target.src = quickSpicyLogo
                    }}
                  />
                </div>
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">Partner sign in</h2>
              <p className="mt-1 text-sm text-gray-500">
                Enter your registered mobile number to receive a secure OTP
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.08)] sm:p-7">
              <div className="space-y-4">
                {error && (
                  <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="restaurant-phone" className="text-sm font-medium text-gray-700">
                    Mobile number
                  </Label>
                  <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all focus-within:ring-2 focus-within:ring-[#FA0272]/30">
                    <div className="flex items-center border-r border-gray-200 bg-gray-50 px-4 text-sm font-semibold text-gray-700">
                      +91
                    </div>
                    <input
                      ref={phoneInputRef}
                      id="restaurant-phone"
                      type="tel"
                      maxLength={10}
                      inputMode="numeric"
                      autoComplete="tel-national"
                      placeholder="00000 00000"
                      value={formData.phone}
                      onChange={handlePhoneChange}
                      className="h-12 w-full border-0 bg-transparent px-4 text-base font-medium text-gray-900 outline-none placeholder:text-gray-400"
                      style={{ caretColor: THEME }}
                    />
                  </div>
                </div>

                <Button
                  onClick={handleSendOTP}
                  disabled={!isValidPhone || isSending}
                  variant="ghost"
                  className="h-12 w-full cursor-pointer rounded-xl border-0 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: THEME }}
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending OTP...
                    </>
                  ) : (
                    "Continue securely"
                  )}
                </Button>
              </div>
            </div>

            <footer className="mt-5 space-y-2 text-center">
              <p className="text-xs text-gray-400">
                Secure partner login &middot; {companyName}
              </p>
              <p className="text-[11px] text-gray-400">
                <Link to="/food/restaurant/terms" className="transition-colors hover:text-[#FA0272]">
                  Terms
                </Link>
                {" · "}
                <Link to="/food/restaurant/privacy" className="transition-colors hover:text-[#FA0272]">
                  Privacy
                </Link>
                {" · "}
                <Link to="/food/restaurant/help-content" className="transition-colors hover:text-[#FA0272]">
                  Support
                </Link>
              </p>
            </footer>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
