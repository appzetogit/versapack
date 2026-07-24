import { useEffect, useState } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { ensureValidAccessToken, isModuleAuthenticated } from "@food/utils/auth"

export default function ProtectedRoute({ children }) {
  const location = useLocation()
  const [status, setStatus] = useState(() =>
    isModuleAuthenticated("delivery") ? "checking" : "deny"
  )

  useEffect(() => {
    let cancelled = false

    const hydrateSession = async () => {
      if (!isModuleAuthenticated("delivery")) {
        if (!cancelled) setStatus("deny")
        return
      }

      if (!cancelled) setStatus("checking")
      const token = await ensureValidAccessToken("delivery")
      if (cancelled) return
      setStatus(token ? "ok" : "deny")
    }

    hydrateSession()

    return () => {
      cancelled = true
    }
  }, [location.pathname])

  if (status === "checking") {
    return <div className="min-h-screen bg-slate-50" />
  }

  if (status === "deny") {
    return <Navigate to="/food/delivery/login" state={{ from: location.pathname }} replace />
  }

  return children
}
