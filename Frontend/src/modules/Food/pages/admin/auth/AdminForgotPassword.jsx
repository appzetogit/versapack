import { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { motion, useReducedMotion } from "framer-motion"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import AdminAuthHero from "@food/components/admin/auth/AdminAuthHero"
import { ArrowLeft, Shield, Eye, EyeOff, Loader2 } from "lucide-react"
import quickSpicyLogo from "@food/assets/switcheats-logo.png"
import { adminAPI } from "@food/api"
import { useCompanyName } from "@food/hooks/useCompanyName"
import {
  loadBusinessSettings,
  applyModulePowerScanning,
  getModulePowerScanning,
} from "@food/utils/businessSettings"

const THEME = "#FA0272"

const STEP_META = {
  1: { title: "Forgot password", subtitle: "Enter your email to receive a verification code" },
  2: { title: "Verify OTP", subtitle: "Enter the 6-digit code sent to your email" },
  3: { title: "Reset password", subtitle: "Choose a new password for your account" },
}

function StepIndicator({ step, themeColor }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex flex-1 items-center gap-2">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors"
            style={{
              backgroundColor: s <= step ? themeColor : "#E5E7EB",
              color: s <= step ? "#fff" : "#9CA3AF",
            }}
          >
            {s}
          </div>
          {s < 3 && (
            <div
              className="h-0.5 flex-1 rounded-full transition-colors"
              style={{ backgroundColor: s < step ? themeColor : "#E5E7EB" }}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default function AdminForgotPassword() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const prefersReducedMotion = useReducedMotion()
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState(["", "", "", "", "", ""])
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [resendTimer, setResendTimer] = useState(0)
  const [logoUrl, setLogoUrl] = useState(quickSpicyLogo)
  const [themeColor, setThemeColor] = useState(THEME)
  const inputRefs = useRef(Array(6).fill(null).map(() => null))

  useEffect(() => {
    const initBranding = async () => {
      try {
        const settings = await loadBusinessSettings()
        applyModulePowerScanning("user", settings)
        const { themeColor: color } = getModulePowerScanning("user", settings)
        setThemeColor(color)
        if (settings?.logo?.url) {
          setLogoUrl(settings.logo.url)
        }
      } catch {
        // Silently fail
      }
    }
    initBranding()

    const handleSettingsUpdate = async () => {
      const settings = await loadBusinessSettings()
      applyModulePowerScanning("user", settings)
      const { themeColor: color } = getModulePowerScanning("user", settings)
      setThemeColor(color)
      if (settings?.logo?.url) {
        setLogoUrl(settings.logo.url)
      }
    }
    window.addEventListener("businessSettingsUpdated", handleSettingsUpdate)
    return () => window.removeEventListener("businessSettingsUpdated", handleSettingsUpdate)
  }, [])

  const handleEmailSubmit = async (e) => {
    e.preventDefault()
    setError("")

    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail) {
      setError("Email is required")
      return
    }

    setIsLoading(true)
    try {
      await adminAPI.requestForgotPasswordOtp(trimmedEmail)
      setEmail(trimmedEmail)
      setStep(2)
      setResendTimer(60)
      const timer = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "This email is not registered as an admin account or something went wrong."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return

    const newOtp = [...otp]
    newOtp[index] = value.slice(-1)
    setOtp(newOtp)

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleOtpPaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData("text")
    const digits = pastedData.replace(/\D/g, "").slice(0, 6).split("")
    const newOtp = [...otp]
    digits.forEach((digit, i) => {
      if (i < 6) {
        newOtp[i] = digit
      }
    })
    setOtp(newOtp)
    if (digits.length === 6) {
      inputRefs.current[5]?.focus()
    } else {
      inputRefs.current[digits.length]?.focus()
    }
  }

  const handleOtpSubmit = (e) => {
    e.preventDefault()
    setError("")

    const otpCode = otp.join("")
    if (otpCode.length !== 6) {
      setError("Please enter the complete 6-digit OTP")
      return
    }
    setStep(3)
  }

  const handleResendOtp = async () => {
    if (resendTimer > 0) return

    setIsLoading(true)
    setError("")
    try {
      await adminAPI.requestForgotPasswordOtp(email)
      setResendTimer(60)
      const timer = setInterval(() => {
        setResendTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to resend OTP. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setError("")

    if (!newPassword || !confirmPassword) {
      setError("Please fill in all fields")
      return
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long")
      return
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setIsLoading(true)
    try {
      await adminAPI.resetPasswordWithOtp(email, otp.join(""), newPassword)

      navigate("/admin/login", {
        state: { message: "Password reset successfully. Please login with your new password." },
      })
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Failed to reset password. Please try again."
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const formMotion = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.35, ease: "easeOut" },
      }

  const inputClass =
    "h-12 rounded-xl border border-gray-200 bg-white text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus-visible:ring-2 focus-visible:ring-primary-orange/30"

  const { title, subtitle } = STEP_META[step]

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-white">
      <div className="hidden h-full lg:block lg:w-1/2">
        <AdminAuthHero themeColor={themeColor} logoUrl={logoUrl} />
      </div>

      <div className="flex h-full w-full flex-col bg-[#F0F2F5] lg:w-1/2">
        <div
          className="relative shrink-0 overflow-hidden px-6 py-5 lg:hidden"
          style={{ backgroundColor: "#141018" }}
        >
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full blur-2xl"
            style={{ backgroundColor: `${themeColor}35` }}
          />
          <div className="relative flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${themeColor}20` }}
            >
              <Shield className="h-3.5 w-3.5" style={{ color: themeColor }} aria-hidden="true" />
            </div>
            <div>
              <p className="text-[10px] font-medium text-white/50">Admin Portal</p>
              <p className="text-sm font-semibold text-white">{companyName}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-6 sm:px-10">
          <motion.div {...formMotion} className="my-auto w-full max-w-[400px]">
            <div className="mb-6 text-center lg:text-left">
              <div className="mb-5 flex justify-center lg:justify-start">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                  <img
                    src={logoUrl || quickSpicyLogo}
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
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h2>
              <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.08)] sm:p-7">
              <StepIndicator step={step} themeColor={themeColor} />

              {error && (
                <div
                  role="alert"
                  className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"
                >
                  {error}
                </div>
              )}

              {step === 1 && (
                <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={isLoading}
                      autoComplete="email"
                      required
                      className={inputClass}
                    />
                  </div>

                  <Button
                    type="submit"
                    variant="ghost"
                    className="h-12 w-full cursor-pointer rounded-xl border-0 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90"
                    style={{ backgroundColor: themeColor }}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Sending...
                      </>
                    ) : (
                      "Send verification code"
                    )}
                  </Button>
                </form>
              )}

              {step === 2 && (
                <form onSubmit={handleOtpSubmit} className="space-y-4" noValidate>
                  <div className="space-y-3">
                    <Label className="block text-center text-sm font-medium text-gray-700">
                      Verification code
                    </Label>
                    <div className="flex justify-center gap-2">
                      {otp.map((digit, index) => (
                        <Input
                          key={index}
                          ref={(el) => {
                            if (inputRefs.current) {
                              inputRefs.current[index] = el
                            }
                          }}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          onChange={(e) => handleOtpChange(index, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(index, e)}
                          onPaste={index === 0 ? handleOtpPaste : undefined}
                          className="h-12 w-11 rounded-xl border border-gray-200 bg-white p-0 text-center text-lg font-semibold shadow-sm focus-visible:ring-2 focus-visible:ring-primary-orange/30 sm:h-14 sm:w-12 sm:text-xl"
                          disabled={isLoading}
                          aria-label={`Digit ${index + 1}`}
                        />
                      ))}
                    </div>
                    <p className="text-center text-sm text-gray-500">
                      Sent to <span className="font-medium text-gray-700">{email}</span>
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flex cursor-pointer items-center gap-1.5 text-gray-500 transition-colors hover:text-gray-800"
                      disabled={isLoading}
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      Change email
                    </button>
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={resendTimer > 0 || isLoading}
                      className="cursor-pointer font-medium transition-colors hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
                      style={{ color: resendTimer > 0 ? undefined : themeColor }}
                    >
                      {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend code"}
                    </button>
                  </div>

                  <Button
                    type="submit"
                    variant="ghost"
                    className="h-12 w-full cursor-pointer rounded-xl border-0 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90"
                    style={{ backgroundColor: themeColor }}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Verifying...
                      </>
                    ) : (
                      "Verify code"
                    )}
                  </Button>
                </form>
              )}

              {step === 3 && (
                <form onSubmit={handlePasswordSubmit} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <Label htmlFor="newPassword" className="text-sm font-medium text-gray-700">
                      New password
                    </Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={isLoading}
                        autoComplete="new-password"
                        required
                        className={`${inputClass} pr-12 [&::-ms-reveal]:hidden [&::-webkit-password-reveal-button]:hidden`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:text-gray-600"
                        disabled={isLoading}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
                      Confirm password
                    </Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={isLoading}
                        autoComplete="new-password"
                        required
                        className={`${inputClass} pr-12 [&::-ms-reveal]:hidden [&::-webkit-password-reveal-button]:hidden`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:text-gray-600"
                        disabled={isLoading}
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="ghost"
                    className="h-12 w-full cursor-pointer rounded-xl border-0 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90"
                    style={{ backgroundColor: themeColor }}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Resetting...
                      </>
                    ) : (
                      "Reset password"
                    )}
                  </Button>
                </form>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigate("/admin/login")}
              className="mt-5 flex w-full cursor-pointer items-center justify-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-800"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to login
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
