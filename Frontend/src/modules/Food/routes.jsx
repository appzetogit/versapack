import { Routes, Route, Navigate, useLocation } from "react-router-dom"
import { useEffect, Suspense, lazy } from "react"
import ProtectedRoute from "@food/components/ProtectedRoute"
import AuthRedirect from "@food/components/AuthRedirect"
import Loader from "@food/components/Loader"
import PushSoundEnableButton from "@food/components/PushSoundEnableButton"
import { registerWebPushForCurrentModule } from "@food/utils/firebaseMessaging"
import { isModuleAuthenticated } from "@food/utils/auth"
import { useRestaurantNotifications } from "@food/hooks/useRestaurantNotifications"
import { applyModulePowerScanning, getCachedSettings } from "@food/utils/businessSettings"
import { PublicAppConfigProvider } from "@food/context/PublicAppConfigContext"
import { shouldSkipScrollResetForHome } from "@food/utils/homeScrollRestore"

// Lazy Loading Components
const UserRouter = lazy(() => import("@food/components/user/UserRouter"))

// Restaurant Module
const RestaurantRouter = lazy(() => import("@food/components/restaurant/RestaurantRouter"))

// Admin Module
const AdminRouter = lazy(() => import("@food/components/admin/AdminRouter"))
const AdminLogin = lazy(() => import("@food/pages/admin/auth/AdminLogin"))
const AdminSignup = lazy(() => import("@food/pages/admin/auth/AdminSignup"))
const AdminForgotPassword = lazy(() => import("@food/pages/admin/auth/AdminForgotPassword"))

// Delivery Module
const DeliveryRouter = lazy(() => import("../DeliveryV2"))

function UserPathRedirect() {
  const location = useLocation()
  // Correctly handle the /food/user -> /food redirect regardless of where it starts
  const newPath = location.pathname.replace("/user", "") || "/food"
  return <Navigate to={newPath} replace />
}

// Scroll to top on route change (skip when Home has a pending scroll restore)
function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    if (shouldSkipScrollResetForHome(location.pathname)) return;
    window.scrollTo(0, 0);
  }, [location.pathname, location.search, location.key]);
  return null;
}

function RestaurantGlobalNotificationListenerInner() {
  useRestaurantNotifications()
  return null
}

function RestaurantGlobalNotificationListener() {
  const location = useLocation()
  const isRestaurantRoute =
    location.pathname.startsWith("/food/restaurant") &&
    !location.pathname.startsWith("/food/restaurants")
  const isRestaurantAuthRoute =
    location.pathname === "/food/restaurant/login" ||
    location.pathname === "/food/restaurant/auth/sign-in" ||
    location.pathname === "/food/restaurant/signup" ||
    location.pathname === "/food/restaurant/signup-email" ||
    location.pathname === "/food/restaurant/forgot-password" ||
    location.pathname === "/food/restaurant/otp" ||
    location.pathname === "/food/restaurant/welcome" ||
    location.pathname === "/food/restaurant/auth/google-callback"
  const isOrderManagedRoute =
    location.pathname === "/food/restaurant" ||
    location.pathname === "/food/restaurant/orders" ||
    location.pathname.startsWith("/food/restaurant/orders/")

  const shouldListen =
    isRestaurantRoute &&
    !isRestaurantAuthRoute &&
    !isOrderManagedRoute &&
    isModuleAuthenticated("restaurant")

  if (!shouldListen) {
    return null
  }

  return <RestaurantGlobalNotificationListenerInner />
}

export default function App() {
  const location = useLocation()

  useEffect(() => {
    registerWebPushForCurrentModule(location.pathname)
  }, [location.pathname])

  useEffect(() => {
    const resolveModule = () => {
      if (location.pathname.startsWith("/food/restaurant")) return "restaurant"
      if (location.pathname.startsWith("/food/delivery")) return "delivery"
      return "user"
    }

    const cached = getCachedSettings()
    if (cached) {
      applyModulePowerScanning(resolveModule(), cached)
    }
  }, [location.pathname])

  return (
    <PublicAppConfigProvider>
      <ScrollToTop />
      <RestaurantGlobalNotificationListener />
      <PushSoundEnableButton />
      <Suspense fallback={<Loader />}>
        <Routes>
          {/* User Module - Explicitly mapped to /user */}
          <Route
            path="user/*"
            element={<UserRouter />}
          />

          {/* Restaurant Module - Already mapped to /restaurant */}
          <Route
            path="restaurant/*"
            element={
              <RestaurantRouter />
            }
          />

          {/* Delivery Module - Already mapped to /delivery */}
          <Route
            path="delivery/*"
            element={<DeliveryRouter />}
          />

          {/* Legacy Redirects & Fallbacks - use absolute path to avoid /user appended in a loop */}
          <Route path="/" element={<Navigate to="/food/user" replace />} />
          <Route path="*" element={<Navigate to="/food/user" replace />} />
        </Routes>
      </Suspense>
    </PublicAppConfigProvider>
  )
}
