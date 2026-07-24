import { Outlet, useLocation, useNavigate } from "react-router-dom"
import { useEffect, useState, createContext, useContext, useRef, useCallback } from "react"
import { ProfileProvider } from "@food/context/ProfileContext"
import { DeliveryLocationProvider } from "@food/context/DeliveryLocationContext"
import LocationPrompt from "./LocationPrompt"
import { CartProvider } from "@food/context/CartContext"
import AutoCouponController from "@food/components/user/AutoCouponController"
import { OrdersProvider } from "@food/context/OrdersContext"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

import SearchOverlay from "./SearchOverlay"
import BottomNavigation from "./BottomNavigation"
import DesktopNavbar from "./DesktopNavbar"
import { useUserNotifications } from "../../hooks/useUserNotifications"
import { shouldSkipScrollResetForHome } from "@food/utils/homeScrollRestore"

// Create SearchOverlay context with default value
const SearchOverlayContext = createContext({
  isSearchOpen: false,
  searchValue: "",
  isListening: false,
  setSearchValue: () => {
    debugWarn("SearchOverlayProvider not available")
  },
  openSearch: () => {
    debugWarn("SearchOverlayProvider not available")
  },
  closeSearch: () => { },
  startVoiceSearch: () => {
    debugWarn("SearchOverlayProvider not available")
  }
})

export function useSearchOverlay() {
  const context = useContext(SearchOverlayContext)
  // Always return context, even if provider is not available (will use default values)
  return context
}

function SearchOverlayProvider({ children }) {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchValue, setSearchValue] = useState("")
  const [isListening, setIsListening] = useState(false)
  const recognitionRef = useRef(null)

  const openSearch = () => {
    setIsSearchOpen(true)
  }

  const closeSearch = () => {
    setIsSearchOpen(false)
    setSearchValue("")
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
  }

  const startVoiceSearch = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Voice search is not supported in this browser.");
      return;
    }

    // Stop existing if any
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onstart = () => {
      setIsListening(true);
      setIsSearchOpen(true); 
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setSearchValue(transcript.trim());
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (err) {
      console.error("Failed to start recognition", err);
      setIsListening(false);
    }
  }, []);

  return (
    <SearchOverlayContext.Provider value={{ isSearchOpen, searchValue, setSearchValue, isListening, openSearch, closeSearch, startVoiceSearch }}>
      {children}
      {isSearchOpen && (
        <SearchOverlay
          isOpen={isSearchOpen}
          onClose={closeSearch}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          isListening={isListening}
          startVoiceSearch={startVoiceSearch}
        />
      )}
    </SearchOverlayContext.Provider>
  )
}

// Create LocationSelector context with default value
const LocationSelectorContext = createContext({
  isLocationSelectorOpen: false,
  openLocationSelector: () => {
    debugWarn("LocationSelectorProvider not available")
  },
  closeLocationSelector: () => { }
})

export function useLocationSelector() {
  const context = useContext(LocationSelectorContext)
  if (!context) {
    throw new Error("useLocationSelector must be used within LocationSelectorProvider")
  }
  return context
}

function LocationSelectorProvider({ children }) {
  const navigate = useNavigate()
  const location = useLocation()

  const openLocationSelector = () => {
    // Navigate to the standalone address selector page
    // Provide current pathname to state so back button returns here accurately
    navigate("/food/user/cart/address-selector", { state: { backTo: location.pathname } })
  }

  const closeLocationSelector = () => { }

  const value = {
    isLocationSelectorOpen: false,
    openLocationSelector,
    closeLocationSelector
  }

  return (
    <LocationSelectorContext.Provider value={value}>
      {children}
    </LocationSelectorContext.Provider>
  )
}

export default function UserLayout() {
  const location = useLocation()

  useEffect(() => {
    // Reset scroll to top whenever location changes (pathname, search, or hash).
    // Skip when Home has a pending scroll position to restore (in-app back uses PUSH).
    if (shouldSkipScrollResetForHome(location.pathname)) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname, location.search, location.hash])

  useUserNotifications()

  // Note: Authentication checks and redirects are handled by ProtectedRoute components
  // UserLayout should not interfere with authentication redirects

  // Show bottom navigation only on home page, dining page, under-250 page, and profile page
  const path = location.pathname.startsWith("/food")
    ? location.pathname.substring(5) || "/"
    : location.pathname
  const normalizedPath =
    path.length > 1 ? path.replace(/\/+$/, "") : path

  const isProfileRoot =
    normalizedPath === "/profile" ||
    normalizedPath === "/user/profile"

  const showBottomNav = normalizedPath === "/" ||
    normalizedPath === "/user" ||
    normalizedPath === "/dining" ||
    normalizedPath === "/user/dining" ||
    normalizedPath === "/under-250" ||
    normalizedPath === "/user/under-250" ||
    isProfileRoot ||
    normalizedPath === "" // Handle empty string case for root relative to /food

  const isUnder250 = normalizedPath === "/under-250" || normalizedPath === "/user/under-250"

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a] transition-colors duration-200">
      <CartProvider>
        <AutoCouponController />
        <ProfileProvider>
          <DeliveryLocationProvider>
          <OrdersProvider>
            <SearchOverlayProvider>
              <LocationSelectorProvider>
                {/* <Navbar /> */}
                {/* Desktop Navbar - Hidden on mobile, visible on medium+ screens */}
                <div className="hidden md:block">
                  {showBottomNav && <DesktopNavbar showLogo={!isUnder250} />}
                </div>
                {/* <LocationPrompt /> */}
                <main className={showBottomNav ? "md:pt-40" : ""}>
                  <Outlet />
                </main>
                {showBottomNav && <BottomNavigation />}
              </LocationSelectorProvider>
            </SearchOverlayProvider>
          </OrdersProvider>
          </DeliveryLocationProvider>
        </ProfileProvider>
      </CartProvider>
    </div>
  )
}
