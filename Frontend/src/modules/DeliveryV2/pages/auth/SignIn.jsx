import { useState, useEffect, useRef } from "react"
import { useNavigate, Link } from "react-router-dom"
import { deliveryAPI } from "@food/api"
import { clearModuleAuth } from "@food/utils/auth"
import { useCompanyName } from "@food/hooks/useCompanyName"
import { motion, AnimatePresence } from "framer-motion"
import { Bike, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@food/components/ui/button"

export default function DeliverySignIn() {
  const companyName = useCompanyName()
  const navigate = useNavigate()
  const phoneInputRef = useRef(null)
  const [formData, setFormData] = useState({
    phone: "",
    countryCode: "+91",
  })
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)

  useEffect(() => {
    const stored = sessionStorage.getItem("deliveryAuthData")
    if (stored) {
      try {
        const data = JSON.parse(stored)
        if (data.phone) {
          const phoneDigits = data.phone.replace("+91", "").trim()
          setFormData(prev => ({ ...prev, phone: phoneDigits }))
        }
      } catch (err) { }
    }
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

  const handleSendOTP = async () => {
    setError("")
    const phoneError = validatePhone(formData.phone)
    if (phoneError) {
      setError(phoneError)
      return
    }

    const fullPhone = `${formData.countryCode} ${formData.phone}`.trim()

    try {
      setIsSending(true)
      clearModuleAuth("delivery")
      await deliveryAPI.sendOTP(fullPhone, "login")
      sessionStorage.setItem("deliveryAuthData", JSON.stringify({
        method: "phone",
        phone: fullPhone,
        isSignUp: false,
        purpose: "login",
        module: "delivery",
      }))
      navigate("/food/delivery/otp")
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to send OTP")
    } finally {
      setIsSending(false)
    }
  }

  const handlePhoneChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10)
    setFormData(prev => ({ ...prev, phone: value }))
    if (error) setError(validatePhone(value))
  }

  return (
    <div className="min-h-[100dvh] bg-white dark:bg-[#0A0A0B] flex flex-col font-sans overflow-x-hidden overflow-y-auto">
      {/* Top Branding Section - 40% height */}
      <div className={`relative w-full bg-[#00B761] overflow-hidden flex flex-col items-center justify-center transition-all duration-200 ${keyboardInset > 0 ? "h-[22dvh] min-h-[130px]" : "h-[40dvh] min-h-[260px]"}`}>
        {/* Subtle Decorative Elements (No Blur) */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 right-0 w-64 h-64 border-word border-white/20 rounded-full -mr-20 -mt-20" />
          <div className="absolute bottom-0 left-0 w-48 h-48 border border-white/10 rounded-full -ml-16 -mb-16" />
        </div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="relative z-10 flex flex-col items-center gap-4"
        >
          <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-xl transform -rotate-12 border-4 border-white/30">
            <Bike className="w-10 h-10 text-[#00B761] rotate-12" />
          </div>
          <div className="text-center text-white">
            <h1 className="font-black text-3xl tracking-tighter leading-none mb-1 italic">
              {companyName.toUpperCase()} <span className="opacity-60">CAPTAIN</span>
            </h1>
            <div className="bg-black/10 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
              Delivery Partner
            </div>
          </div>
        </motion.div>
      </div>

      {/* Bottom Form Section - 60% height */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className={`flex-1 bg-white dark:bg-[#0A0A0B] relative z-20 shadow-[0_-20px_40px_rgba(0,0,0,0.05)] px-6 pt-10 pb-6 flex flex-col transition-all duration-200 ${keyboardInset > 0 ? "rounded-t-3xl mt-0" : "rounded-t-[40px] -mt-10"}`}
        style={{ paddingBottom: keyboardInset ? `calc(1.5rem + ${keyboardInset}px)` : undefined }}
      >
        <div className="max-w-md mx-auto w-full flex flex-col h-full">
          <div className="space-y-2 mb-10">
            <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
              Start your shift
            </h2>
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              Enter your mobile number to sign in as a captain.
            </p>
          </div>

          <div className="space-y-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.3em] ml-1">
                Linked Identity
              </label>

              <div className="flex items-center gap-0 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl focus-within:border-[color:var(--module-theme-color)] focus-within:ring-4 focus-within:ring-[rgba(var(--module-theme-rgb),0.12)] transition-all overflow-hidden h-16">
                <div className="px-5 border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 text-zinc-900 dark:text-white font-black text-lg h-full flex items-center">
                  +91
                </div>
                <input
                  ref={phoneInputRef}
                  type="tel"
                  maxLength={10}
                  inputMode="numeric"
                  placeholder="Mobile Number"
                  value={formData.phone}
                  onChange={handlePhoneChange}
                  className="flex-1 bg-transparent border-0 outline-none ring-0 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 text-lg font-black tracking-widest px-5 text-zinc-900 dark:text-white h-full"
                />
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center gap-1.5 text-xs font-bold text-[#00B761] pl-2"
                  >
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Button
              onClick={handleSendOTP}
              disabled={isSending || formData.phone.length !== 10}
              className="w-full h-16 rounded-2xl font-black text-base tracking-widest uppercase transition-all duration-300 bg-[#00B761] hover:bg-[#009049] text-white shadow-[0_12px_24px_rgba(0,183,97,0.3)] active:scale-[0.98] disabled:opacity-50 disabled:grayscale"
            >
              {isSending ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Checking...</span>
                </div>
              ) : (
                "Go Online"
              )}
            </Button>
          </div>

          <footer className="mt-auto pt-10 text-center">
            <p className="text-[10px] text-zinc-400 dark:text-zinc-600 font-medium tracking-wide uppercase">
              By joining, you agree to our policies
            </p>
            <p className="text-[10px] text-zinc-300 dark:text-zinc-700 font-bold mt-2 uppercase tracking-widest">
              <Link to="/food/delivery/terms" className="hover:text-[#00B761]">Terms</Link> • <Link to="/food/delivery/profile/privacy" className="hover:text-[#00B761]">Privacy</Link> • <Link to="/food/delivery/help/content" className="hover:text-[#00B761]">Support</Link>
            </p>
          </footer>
        </div>
      </motion.div>
    </div>
  )
}
