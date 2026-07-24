import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ensureValidAccessToken, isModuleAuthenticated } from "@food/utils/auth";

/**
 * Role-based Protected Route Component
 * Only allows access if user is authenticated for the specific module.
 *
 * If the access token expired but a refresh token is still valid, silently
 * refreshes before rendering — avoids forcing re-login after a few days idle.
 *
 * Note: the postpaid subscription model never blocks restaurant access —
 * dues are billed at month end and settled by the admin, so no payment
 * gate exists here anymore.
 */
export default function ProtectedRoute({ children, requiredRole, loginPath = "/food/user/auth/login" }) {
  const location = useLocation();
  const [status, setStatus] = useState(() => {
    if (!requiredRole) return "ok";
    return isModuleAuthenticated(requiredRole) ? "checking" : "deny";
  });

  useEffect(() => {
    if (!requiredRole) {
      setStatus("ok");
      return undefined;
    }

    let cancelled = false;

    const hydrateSession = async () => {
      if (!isModuleAuthenticated(requiredRole)) {
        if (!cancelled) setStatus("deny");
        return;
      }

      if (!cancelled) setStatus("checking");
      const token = await ensureValidAccessToken(requiredRole);
      if (cancelled) return;
      setStatus(token ? "ok" : "deny");
    };

    hydrateSession();

    return () => {
      cancelled = true;
    };
  }, [requiredRole, location.pathname]);

  if (!requiredRole) {
    return children;
  }

  if (status === "checking") {
    return <div className="min-h-screen bg-slate-50" />;
  }

  if (status === "deny") {
    return <Navigate to={loginPath} state={{ from: location.pathname }} replace />;
  }

  return children;
}
