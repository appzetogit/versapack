import { useEffect, useState } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { adminAPI } from "@food/api"
import {
  clearModuleAuth,
  ensureValidAccessToken,
  getCurrentUser,
  isModuleAuthenticated,
  setAuthData,
} from "@food/utils/auth"
import { canAccessAdminPath, findFirstAllowedAdminPath } from "@food/utils/adminRbac"

export default function ProtectedRoute({ children }) {
  const location = useLocation()
  const [status, setStatus] = useState(() =>
    isModuleAuthenticated("admin") ? "checking" : "deny"
  )

  useEffect(() => {
    let isMounted = true

    const syncAdminProfile = async () => {
      if (!isModuleAuthenticated("admin")) {
        if (isMounted) setStatus("deny")
        return
      }

      if (isMounted) setStatus("checking")

      const accessToken = await ensureValidAccessToken("admin")
      if (!accessToken) {
        if (isMounted) setStatus("deny")
        return
      }

      try {
        const res = await adminAPI.getCurrentAdmin()
        const user =
          res?.data?.data?.user ??
          res?.data?.user ??
          res?.data?.data ??
          res?.data
        const token = localStorage.getItem("admin_accessToken")
        const refreshToken = localStorage.getItem("admin_refreshToken")
        if (token && user) {
          setAuthData("admin", token, user, refreshToken)
          window.dispatchEvent(new Event("adminAuthChanged"))
        }
        if (isMounted) setStatus("ok")
      } catch (error) {
        // Only force logout on auth failure — keep session on network/server blips.
        const statusCode = error?.response?.status
        if (statusCode === 401 || statusCode === 403) {
          clearModuleAuth("admin")
          if (isMounted) setStatus("deny")
          return
        }
        if (isMounted) setStatus("ok")
      }
    }

    syncAdminProfile()

    return () => {
      isMounted = false
    }
  }, [location.pathname])

  if (status === "checking") {
    return <div className="min-h-screen bg-neutral-100" />
  }

  if (status === "deny") {
    return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
  }

  const adminUser = getCurrentUser("admin")
  if (!canAccessAdminPath(location.pathname, "view")) {
    return <Navigate to={findFirstAllowedAdminPath(adminUser)} replace />
  }

  return children
}
