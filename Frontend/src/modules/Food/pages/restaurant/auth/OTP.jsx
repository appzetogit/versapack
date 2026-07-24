import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { motion, useReducedMotion } from "framer-motion"
import { Shield, Loader2, Timer, RefreshCw, ArrowLeft } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { restaurantAPI } from "@food/api"
import {
  setAuthData as setRestaurantAuthData,
  setRestaurantPendingPhone,
} from "@food/utils/auth"
import { resolveDeviceFcmToken, registerWebPushForCurrentModule } from "@food/utils/firebaseMessaging"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { loadBusinessSettings, getModuleLogoUrl } from "@food/utils/businessSettings"
import RestaurantPartnerHero from "@food/components/restaurant/auth/RestaurantPartnerHero"
import quickSpicyLogo from "@food/assets/switcheats-logo.png"

const THEME = "#FA0272"

export default function RestaurantOTP() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const prefersReducedMotion = useReducedMotion()
  const [logoUrl, setLogoUrl] = useState(() => getModuleLogoUrl("restaurant") || quickSpicyLogo)
  const [otp, setOtp] = useState(["", "", "", ""])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [authData, setAuthData] = useState(null)
  const [contactInfo, setContactInfo] = useState("")
  const [focusedIndex, setFocusedIndex] = useState(null)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const inputRefs = useRef([])
  const hasSubmittedRef = useRef(false)

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
    const stored = sessionStorage.getItem("restaurantAuthData")
    if (stored) {
      const data = JSON.parse(stored)
      setAuthData(data)
      if (data.method === "email" && data.email) {
        setContactInfo(data.email)
      } else if (data.phone) {
        const phoneMatch = data.phone?.match(/(\+\d+)\s*(.+)/)
        setContactInfo(
          phoneMatch ? `${phoneMatch[1]} ${phoneMatch[2].replace(/\D/g, "")}` : data.phone || ""
        )
      }
    } else {
      navigate("/food/restaurant/login")
      return
    }

    setResendTimer(60)
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return
      setResendTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [navigate])

  useEffect(() => {
    const focusFirstInput = () => inputRefs.current[0]?.focus()
    const frameId = requestAnimationFrame(() => {
      focusFirstInput()
      window.setTimeout(focusFirstInput, 120)
    })
    return () => cancelAnimationFrame(frameId)
  }, [authData])

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return undefined
    const viewport = window.visualViewport
    const updateKeyboardInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardInset(inset > 0 ? inset : 0)
    }
    updateKeyboardInset()
    viewport.addEventListener("resize", updateKeyboardInset)
    viewport.addEventListener("scroll", updateKeyboardInset)
    return () => {
      viewport.removeEventListener("resize", updateKeyboardInset)
      viewport.removeEventListener("scroll", updateKeyboardInset)
    }
  }, [])

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    setError("")

    if (value && index < 3) inputRefs.current[index + 1]?.focus()

    if (newOtp.every((digit) => digit !== "") && newOtp.length === 4) {
      if (!hasSubmittedRef.current) {
        hasSubmittedRef.current = true
        handleVerify(newOtp.join(""))
      }
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace") {
      if (otp[index]) {
        const newOtp = [...otp]
        newOtp[index] = ""
        setOtp(newOtp)
      } else if (index > 0) {
        inputRefs.current[index - 1]?.focus()
        const newOtp = [...otp]
        newOtp[index - 1] = ""
        setOtp(newOtp)
      }
    }
  }

  const handlePaste = (index, e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text")
    const digits = pastedData.replace(/\D/g, "").slice(0, 4).split("")
    const newOtp = [...otp]
    digits.forEach((digit, i) => {
      if (i < 4) newOtp[i] = digit
    })
    setOtp(newOtp)
    if (digits.length === 4) handleVerify(newOtp.join(""))
    else inputRefs.current[digits.length]?.focus()
  }

  const handleVerify = async (otpValue = null) => {
    const code = otpValue || otp.join("")
    if (hasSubmittedRef.current && !otpValue) return
    if (code.length !== 4) {
      setError("Please enter the complete 4-digit code")
      hasSubmittedRef.current = false
      return
    }

    setIsLoading(true)
    setError("")

    try {
      if (!authData) throw new Error("Session expired.")
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      const purpose = authData.isSignUp ? "register" : "login"

      let fcmToken = null
      let platform = "web"
      try {
        const resolved = await resolveDeviceFcmToken("restaurant", { allowPrompt: true })
        fcmToken = resolved?.token || null
        platform = resolved?.platform || "web"
      } catch (e) {
        // Continue login even if FCM resolve fails
      }

      const response = await restaurantAPI.verifyOTP(phone, code, purpose, null, email, fcmToken, platform)
      const data = response?.data?.data || response?.data
      const needsRegistration = data?.needsRegistration === true
      const normalizedPhone = data?.phone || phone

      if (needsRegistration) {
        setRestaurantPendingPhone(normalizedPhone)
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        navigate("/food/restaurant/onboarding", { replace: true })
        return
      }

      const accessToken = data?.accessToken
      const refreshToken = data?.refreshToken ?? null
      const restaurant = data?.user ?? data?.restaurant

      if (accessToken && restaurant) {
        setRestaurantAuthData("restaurant", accessToken, restaurant, refreshToken)
        window.dispatchEvent(new Event("restaurantAuthChanged"))
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        registerWebPushForCurrentModule("/food/restaurant", { force: true }).catch(() => {})
        navigate("/food/restaurant", { replace: true })
      }
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Invalid OTP."
      if (/pending approval/i.test(message)) {
        const pendingPhone = authData?.phone || authData?.email || contactInfo
        if (pendingPhone) setRestaurantPendingPhone(pendingPhone)
        sessionStorage.removeItem("restaurantAuthData")
        sessionStorage.removeItem("restaurantLoginPhone")
        navigate("/food/restaurant/pending-verification", {
          replace: true,
          state: { phone: pendingPhone || "" },
        })
        return
      }
      setError(message)
      setOtp(["", "", "", ""])
      hasSubmittedRef.current = false
      inputRefs.current[0]?.focus()
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendTimer > 0) return
    setIsLoading(true)
    setError("")
    try {
      if (!authData) throw new Error("Session expired.")
      const purpose = authData.isSignUp ? "register" : "login"
      const phone = authData.method === "phone" ? authData.phone : null
      const email = authData.method === "email" ? authData.email : null
      await restaurantAPI.sendOTP(phone, purpose, email)
      setResendTimer(60)
    } catch {
      setError("Failed to resend OTP.")
    }
    setIsLoading(false)
    setOtp(["", "", "", ""])
    inputRefs.current[0]?.focus()
  }

  const formMotion = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.35, ease: "easeOut" },
      }

  const isOtpComplete = otp.every((digit) => digit !== "")

  if (!authData) return null

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-white">
      <div className="hidden h-full lg:block lg:w-1/2">
        <RestaurantPartnerHero themeColor={THEME} />
      </div>

      <div className="flex h-full w-full flex-col bg-[#F0F2F5] lg:w-1/2">
        <div className="relative shrink-0 overflow-hidden px-6 py-5 lg:hidden" style={{ backgroundColor: "#141018" }}>
          <button
            type="button"
            onClick={() => navigate("/food/restaurant/login")}
            className="absolute left-5 top-5 flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="relative flex items-center justify-center gap-2.5 pt-6">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${THEME}20` }}
            >
              <Shield className="h-3.5 w-3.5" style={{ color: THEME }} aria-hidden="true" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-white/50">Verification</p>
              <p className="text-sm font-semibold text-white">{companyName}</p>
            </div>
          </div>
        </div>

        <div className="hidden shrink-0 px-8 pt-6 lg:block">
          <button
            type="button"
            onClick={() => navigate("/food/restaurant/login")}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
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
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">Verify OTP</h2>
              <p className="mt-1 text-sm text-gray-500">
                Enter the 4-digit code sent to{" "}
                <span className="font-semibold" style={{ color: THEME }}>
                  {contactInfo}
                </span>
              </p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.08)] sm:p-7">
              <div className="space-y-5">
                {error && (
                  <div role="alert" className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {error}
                  </div>
                )}

                <div className="flex justify-center gap-3">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (inputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      onPaste={(e) => handlePaste(index, e)}
                      onFocus={() => setFocusedIndex(index)}
                      onBlur={() => setFocusedIndex(null)}
                      disabled={isLoading}
                      className={`h-14 w-12 rounded-xl border-2 bg-white text-center text-xl font-bold text-gray-900 shadow-sm transition-all focus:outline-none sm:h-16 sm:w-14 sm:text-2xl ${
                        error
                          ? "border-red-300 bg-red-50"
                          : focusedIndex === index
                            ? "border-[#FA0272] ring-4 ring-[#FA0272]/15"
                            : "border-gray-200"
                      }`}
                    />
                  ))}
                </div>

                <Button
                  onClick={() => handleVerify()}
                  disabled={isLoading || !isOtpComplete}
                  variant="ghost"
                  className="h-12 w-full cursor-pointer rounded-xl border-0 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: THEME }}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify & continue"
                  )}
                </Button>

                <div className="flex flex-col items-center gap-3 pt-1">
                  {resendTimer > 0 ? (
                    <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                      <Timer className="h-3.5 w-3.5" style={{ color: THEME }} />
                      Resend in <span style={{ color: THEME }}>{resendTimer}s</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={isLoading}
                      className="flex items-center gap-2 text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ color: THEME }}
                    >
                      <RefreshCw className="h-4 w-4" />
                      Resend code
                    </button>
                  )}
                </div>
              </div>
            </div>

            <p className="mt-5 text-center text-xs text-gray-400">
              Secure verification &middot; {companyName}
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
