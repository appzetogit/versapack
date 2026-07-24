import { useState, useEffect, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { motion, useReducedMotion } from "framer-motion"
import { adminAPI } from "@food/api"
import { setAuthData } from "@food/utils/auth"
import {
  loadBusinessSettings,
  applyModulePowerScanning,
  getModulePowerScanning,
} from "@food/utils/businessSettings"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import AdminAuthHero from "@food/components/admin/auth/AdminAuthHero"
import { Eye, EyeOff, Shield, Loader2 } from "lucide-react"
import quickSpicyLogo from "@food/assets/switcheats-logo.png"

const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const THEME = "#FA0272"
const THEME_RGB = "250,2,114"

export default function AdminLogin() {
  const navigate = useNavigate()
  const location = useLocation()
  const companyName = useCompanyName()
  const prefersReducedMotion = useReducedMotion()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [successMessage, setSuccessMessage] = useState("")
  const [logoUrl, setLogoUrl] = useState(quickSpicyLogo)
  const [themeColor, setThemeColor] = useState(THEME)
  const submittingRef = useRef(false)

  useEffect(() => {
    const message = location.state?.message
    if (message) {
      setSuccessMessage(message)
      window.history.replaceState({}, document.title, location.pathname)
    }
  }, [location.state?.message, location.pathname])

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
      } catch (err) {
        debugWarn("Failed to load business settings:", err)
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setSuccessMessage("")
    if (submittingRef.current) return

    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setError("Email is required")
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedEmail)) {
      setError("Please enter a valid email address")
      return
    }
    if (!password) {
      setError("Password is required")
      return
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    submittingRef.current = true
    setIsLoading(true)

    try {
      const response = await adminAPI.login(trimmedEmail, password)
      const data = response?.data?.data || response?.data || {}

      const accessToken = data.accessToken
      const adminUser = data.user || data.admin
      const refreshToken = data.refreshToken ?? null

      if (!accessToken || !adminUser) {
        throw new Error("Invalid response from server")
      }
      if (!refreshToken) {
        throw new Error("Invalid response from server: missing refresh token")
      }
      setAuthData("admin", accessToken, adminUser, refreshToken)
      navigate("/admin/food", { replace: true })
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        err?.message ||
        "Login failed. Please check your credentials."
      setError(message)
    } finally {
      setIsLoading(false)
      submittingRef.current = false
    }
  }

  const formMotion = prefersReducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.35, ease: "easeOut" },
      }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-white">
      {/* Left — hero */}
      <div className="hidden h-full lg:block lg:w-1/2">
        <AdminAuthHero themeColor={themeColor} logoUrl={logoUrl} />
      </div>

      {/* Right — form */}
      <div className="flex h-full w-full flex-col bg-[#F0F2F5] lg:w-1/2">
        {/* Mobile brand strip */}
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

        <div className="flex flex-1 items-center justify-center overflow-hidden px-5 sm:px-10">
          <motion.div {...formMotion} className="w-full max-w-[380px]">
            {/* Header */}
            <div className="mb-7 text-center lg:text-left">
              <div className="mb-5 flex justify-center lg:justify-start">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
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
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">Sign in</h2>
              <p className="mt-1 text-sm text-gray-500">
                Enter your credentials to access the dashboard
              </p>
            </div>

            {/* Form card */}
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_4px_24px_rgba(0,0,0,0.08)] sm:p-7">
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {successMessage && (
                  <div
                    role="status"
                    className="rounded-xl px-4 py-3 text-sm"
                    style={{
                      backgroundColor: `rgba(${THEME_RGB},0.08)`,
                      color: themeColor,
                      border: `1px solid rgba(${THEME_RGB},0.15)`,
                    }}
                  >
                    {successMessage}
                  </div>
                )}
                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"
                  >
                    {error}
                  </div>
                )}

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
                    autoComplete="off"
                    required
                    className="h-12 rounded-xl border border-gray-200 bg-white text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus-visible:ring-2 focus-visible:ring-primary-orange/30"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading}
                      autoComplete="new-password"
                      required
                      className="h-12 rounded-xl border border-gray-200 bg-white pr-12 text-gray-900 shadow-sm transition-all placeholder:text-gray-400 focus:border-gray-300 focus:bg-white focus-visible:ring-2 focus-visible:ring-primary-orange/30 [&::-ms-reveal]:hidden [&::-webkit-password-reveal-button]:hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-none"
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

                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={() => navigate("/admin/forgot-password")}
                    className="cursor-pointer text-sm font-medium transition-colors hover:underline focus-visible:outline-none"
                    style={{ color: themeColor }}
                    disabled={isLoading}
                  >
                    Forgot password?
                  </button>
                </div>

                <Button
                  type="submit"
                  variant="ghost"
                  className="h-12 w-full cursor-pointer rounded-xl border-0 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 focus-visible:ring-2 focus-visible:ring-offset-2"
                  style={{ backgroundColor: themeColor }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Signing in...
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>
            </div>

            <p className="mt-5 text-center text-xs text-gray-400">
              Protected admin access &middot; {companyName}
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
