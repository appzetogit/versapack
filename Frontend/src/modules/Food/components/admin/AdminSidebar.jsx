import { useState, useEffect, useMemo } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  Search,
  FileText,
  Calendar,
  Clock,
  Receipt,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Link as LinkIcon,
  UtensilsCrossed,
  Building2,
  FolderTree,
  Plus,
  Utensils,
  Megaphone,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  X,
  LayoutDashboard,
  Gift,
  DollarSign,
  Image,
  Bell,
  MessageSquare,
  Mail,
  Users,
  Wallet,
  Award,
  Truck,
  Package,
  CreditCard,
  Settings,
  UserCog,
  User,
  Globe,
  Palette,
  Camera,
  LogIn,
  Database,
  Zap,
  Phone,
  IndianRupee,
  PiggyBank,
  Lock,
} from "lucide-react"
import { cn } from "@food/utils/utils"
import { Input } from "@food/components/ui/input"
import { adminSidebarMenu } from "@food/utils/adminSidebarMenu"
import { adminAPI } from "@food/api"
import { getCachedSettings, loadBusinessSettings } from "@food/utils/businessSettings"
import { canAccessFeatureSettings, canAccessSuperPowers } from "@food/utils/adminPermissions"
import { canAdminAccess, isSuperAdmin, resolvePermissionSectionByPath } from "@food/utils/adminRbac"
import quickSpicyLogo from "@food/assets/switcheats-logo.png"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}


// Icon mapping
const iconMap = {
  LayoutDashboard,
  UtensilsCrossed,
  Building2,
  FileText,
  Calendar,
  Clock,
  Receipt,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Link: LinkIcon,
  FolderTree,
  Plus,
  Utensils,
  Megaphone,
  Gift,
  DollarSign,
  Image,
  Bell,
  MessageSquare,
  Mail,
  Users,
  Wallet,
  Award,
  Truck,
  Package,
  CreditCard,
  Settings,
  UserCog,
  User,
  Globe,
  Palette,
  Camera,
  LogIn,
  Database,
  Zap,
  Phone,
  IndianRupee,
  PiggyBank,
  Lock,
  X,
}

const buildLabelDictionary = (menu = []) => {
  const dictionary = new Map()
  const walkItems = (items = []) => {
    items.forEach((entry) => {
      if (!entry || typeof entry !== "object") return
      const path = String(entry.path || "").trim()
      const label = String(entry.label || "").trim()
      if (path && label && !dictionary.has(path)) {
        dictionary.set(path, label)
      }
      if (entry.type === "section" && Array.isArray(entry.items)) {
        walkItems(entry.items)
      }
      if (entry.type === "expandable" && Array.isArray(entry.subItems)) {
        walkItems(entry.subItems)
      }
    })
  }
  walkItems(menu)
  return dictionary
}

const SIDEBAR_LABEL_BY_PATH = buildLabelDictionary(adminSidebarMenu)

export default function AdminSidebar({ isOpen = false, onClose, onCollapseChange }) {
  const location = useLocation()
  const [searchQuery, setSearchQuery] = useState("")
  const [badges, setBadges] = useState({})
  const [restaurantSubscriptionEnabled, setRestaurantSubscriptionEnabled] = useState(true)
  const [codControlEnabled, setCodControlEnabled] = useState(true)
  const [adminAccessSectionEnabled, setAdminAccessSectionEnabled] = useState(true)
  const [rootLandingAndUnregisteredControlEnabled, setRootLandingAndUnregisteredControlEnabled] = useState(true)
  const [canViewFeatureSettings, setCanViewFeatureSettings] = useState(false)
  const [adminUser, setAdminUser] = useState(() => {
    try {
      const raw = localStorage.getItem("admin_user")
      return raw ? JSON.parse(raw) : null
    } catch (_e) {
      return null
    }
  })

  const parseFeatureEnabled = (value, fallback = true) => {
    if (typeof value === "boolean") return value
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase()
      if (normalized === "true") return true
      if (normalized === "false") return false
    }
    if (typeof value === "number") {
      if (value === 1) return true
      if (value === 0) return false
    }
    return fallback
  }

  const deriveMenuLabel = (menuItem, parentLabel = "") => {
    const rawPath = String(menuItem?.path || "").trim()
    const canonical = rawPath ? SIDEBAR_LABEL_BY_PATH.get(rawPath) : ""
    if (canonical) return canonical
    const explicit = String(menuItem?.label || "").trim()
    if (explicit) return explicit
    if (rawPath) {
      const last = rawPath.split("/").filter(Boolean).pop() || ""
      if (last) {
        return last
          .replace(/[-_]+/g, " ")
          .replace(/\b\w/g, (ch) => ch.toUpperCase())
      }
    }
    const parent = String(parentLabel || "").trim()
    return parent || "Untitled"
  }

  useEffect(() => {
    const fetchBadges = async () => {
      try {
        const res = await adminAPI.getSidebarBadges()
        if (res?.data?.success) {
          setBadges(res.data.counts || {})
        }
      } catch (error) {
        debugError("Error fetching sidebar badges:", error)
      }
    }
    fetchBadges()
    const timer = setInterval(fetchBadges, 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    setCanViewFeatureSettings(canAccessFeatureSettings(adminUser))

    const loadFeatureSettings = async () => {
      try {
        const res = await adminAPI.getFeatureSettings()
        const rows = Array.isArray(res?.data?.data) ? res.data.data : []
        const feature = rows.find((row) => row.key === "restaurant_subscription")
        const codFeature = rows.find((row) => row.key === "cod_control")
        const adminAccessFeature = rows.find((row) => row.key === "admin_access_section")
        const rootAndUnregisteredFeature = rows.find((row) => row.key === "root_landing_and_unregistered_control")
        if (feature) {
          setRestaurantSubscriptionEnabled((prev) =>
            parseFeatureEnabled(feature.isEnabled, prev)
          )
        }
        if (codFeature) {
          setCodControlEnabled((prev) =>
            parseFeatureEnabled(codFeature.isEnabled, prev)
          )
        }
        if (adminAccessFeature) {
          setAdminAccessSectionEnabled((prev) =>
            parseFeatureEnabled(adminAccessFeature.isEnabled, prev)
          )
        }
        if (rootAndUnregisteredFeature) {
          setRootLandingAndUnregisteredControlEnabled((prev) =>
            parseFeatureEnabled(rootAndUnregisteredFeature.isEnabled, prev)
          )
        }
      } catch (error) {
        // keep default enabled if API fails
      }
    }
    loadFeatureSettings()

    const handleFeatureUpdate = async (event) => {
      const detail = event?.detail || {}
      if (detail.key === "restaurant_subscription") {
        setRestaurantSubscriptionEnabled((prev) =>
          parseFeatureEnabled(detail.isEnabled, prev)
        )
      }
      if (detail.key === "cod_control") {
        setCodControlEnabled((prev) =>
          parseFeatureEnabled(detail.isEnabled, prev)
        )
      }
      if (detail.key === "admin_access_section") {
        setAdminAccessSectionEnabled((prev) =>
          parseFeatureEnabled(detail.isEnabled, prev)
        )
      }
      if (detail.key === "root_landing_and_unregistered_control") {
        setRootLandingAndUnregisteredControlEnabled((prev) =>
          parseFeatureEnabled(detail.isEnabled, prev)
        )
      }
      await loadFeatureSettings()
    }

    window.addEventListener("adminFeatureSettingUpdated", handleFeatureUpdate)
    const handleAuthUpdate = () => {
      try {
        const raw = localStorage.getItem("admin_user")
        const nextAdminUser = raw ? JSON.parse(raw) : null
        setAdminUser(nextAdminUser)
        setCanViewFeatureSettings(canAccessFeatureSettings(nextAdminUser))
      } catch (_e) {
        setAdminUser(null)
        setCanViewFeatureSettings(false)
      }
    }
    window.addEventListener("adminAuthChanged", handleAuthUpdate)
    return () => {
      window.removeEventListener("adminFeatureSettingUpdated", handleFeatureUpdate)
      window.removeEventListener("adminAuthChanged", handleAuthUpdate)
    }
  }, [adminUser])

  const menuData = useMemo(() => {
    const featureSettingsPath = "/admin/food/feature-settings"
    const subscriptionSettingsPath = "/admin/food/restaurants/subscription-settings"
    const subscriptionHistoryPath = "/admin/food/restaurants/subscription-history"
    const deliveryCashLimitPath = "/admin/food/delivery-cash-limit"
    const cashLimitSettlementPath = "/admin/food/cash-limit-settlement"
    const offlinePaymentsPath = "/admin/food/orders/offline-payments"

    const mapped = adminSidebarMenu.map((section) => {
      if (section.type === "link") {
        const permissionSection = resolvePermissionSectionByPath(section.path)
        if (!permissionSection && !isSuperAdmin(adminUser)) {
          return null
        }
        if (permissionSection && !canAdminAccess(adminUser, permissionSection, "view")) {
          return null
        }
        return section
      }

      if (section.type !== "section" || !Array.isArray(section.items)) return section
      return {
        ...section,
        items: section.items
          .map((item) => {
            if (section.label === "ADMIN ACCESS" && !adminAccessSectionEnabled) {
              return null
            }
            if (section.label === "SUPER POWERS" && !canAccessSuperPowers(adminUser)) {
              return null
            }
            if (item.type === "link" && item.path === featureSettingsPath && !canViewFeatureSettings) {
              return null
            }
            if (item.type === "link") {
              const permissionSection = resolvePermissionSectionByPath(item.path)
              if (!permissionSection && !isSuperAdmin(adminUser)) return null
              if (permissionSection && !canAdminAccess(adminUser, permissionSection, "view")) return null
            }
            if (item.type === "link" && !codControlEnabled && (item.path === deliveryCashLimitPath || item.path === cashLimitSettlementPath)) {
              return null
            }
            if (item.type === "expandable" && Array.isArray(item.subItems)) {
              const filteredSubItems = item.subItems
                .filter((sub) => {
                  if (!sub?.path) return false
                  if ((sub.path === subscriptionSettingsPath || sub.path === subscriptionHistoryPath) && !restaurantSubscriptionEnabled) return false
                  if (sub.path === offlinePaymentsPath && !codControlEnabled) return false
                  if (sub.path === "/admin/food/restaurants/unregistered" && !rootLandingAndUnregisteredControlEnabled) return false
                  const permissionSection = resolvePermissionSectionByPath(sub.path)
                  if (!permissionSection && !isSuperAdmin(adminUser)) return false
                  if (permissionSection && !canAdminAccess(adminUser, permissionSection, "view")) return false
                  return true
                })
                .map((sub) => ({
                  ...sub,
                  label: deriveMenuLabel(sub, item.label),
                }))
              return {
                ...item,
                label: deriveMenuLabel(item),
                subItems: filteredSubItems,
              }
            }
            return item
          })
          .filter((item) => item && (item.type !== "expandable" || (Array.isArray(item.subItems) && item.subItems.length > 0))),
      }
    })
    return mapped.filter((section) => {
      if (!section) return false
      if (section?.type !== "section") return true
      return Array.isArray(section.items) && section.items.length > 0
    })
  }, [adminAccessSectionEnabled, adminUser, canViewFeatureSettings, codControlEnabled, restaurantSubscriptionEnabled, rootLandingAndUnregisteredControlEnabled])

  const getBadgeCount = (label = "", path = "") => {
    const l = label.toLowerCase()
    const p = path?.toLowerCase() || ""

    if (l.includes("food approval")) return badges.foodApprovals
    if (l === "foods") return badges.foods
    if (l === "restaurants" || l.includes("new joining request")) return badges.restaurants
    if (l.includes("restaurant complaints")) return badges.restaurantComplaints
    if (p.includes("orders/pending")) return badges.orders
    if (p.includes("offline-payments")) return badges.offlinePayments
    if (l.includes("support tickets")) return l.includes("delivery") ? badges.deliverySupportTickets : badges.userSupportTickets
    if (l.includes("withdrawal")) return l.includes("delivery") ? badges.deliveryWithdrawals : badges.restaurantWithdrawals
    if (l.includes("emergency help")) return badges.emergencyHelp
    if (l.includes("earning addon history")) return badges.earningAddons
    if (l.includes("safety emergency reports")) return badges.safetyReports
    if (l === "deliveryman" && !p.includes("join-request")) return badges.deliveryPartners // expandable parent
    if (l.includes("join-request")) return badges.deliveryPartners
    return 0
  }
  const [logoUrl, setLogoUrl] = useState(() => getCachedSettings()?.logo?.url || null)
  const [companyName, setCompanyName] = useState(() => getCachedSettings()?.companyName || null)

  // Load business settings logo
  useEffect(() => {
    const loadLogo = async () => {
      try {
        // First check cache
        let cached = getCachedSettings()
        if (cached) {
          if (cached.logo?.url) {
            setLogoUrl(cached.logo.url)
          }
          if (cached.companyName) {
            setCompanyName(cached.companyName)
          }
        }

        // Always try to load fresh data to ensure we have the latest
        const settings = await loadBusinessSettings()
        if (settings) {
          if (settings.logo?.url) {
            setLogoUrl(settings.logo.url)
          }
          if (settings.companyName) {
            setCompanyName(settings.companyName)
          }
        }
      } catch (error) {
        debugError('Error loading logo:', error)
      }
    }

    // Load immediately
    loadLogo()

    // Also try after a small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      loadLogo()
    }, 100)

    // Listen for business settings updates
    const handleSettingsUpdate = () => {
      const cached = getCachedSettings()
      if (cached) {
        if (cached.logo?.url) {
          setLogoUrl(cached.logo.url)
        }
        if (cached.companyName) {
          setCompanyName(cached.companyName)
        }
      }
    }
    window.addEventListener('businessSettingsUpdated', handleSettingsUpdate)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener('businessSettingsUpdated', handleSettingsUpdate)
    }
  }, [])

  // Get initial states from consolidated admin_sidebar_state
  const getInitialStates = () => {
    try {
      const saved = localStorage.getItem('admin_sidebar_state')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch (e) {
      debugError('Error loading sidebar state:', e)
    }
    return { isCollapsed: false, expandedSections: {} }
  }

  const [isCollapsed, setIsCollapsed] = useState(() => getInitialStates().isCollapsed)
  const [expandedSections, setExpandedSections] = useState(() => {
    const initialState = getInitialStates().expandedSections
    if (Object.keys(initialState || {}).length > 0) return initialState

    // Generate defaults if empty
    const state = {}
    adminSidebarMenu.forEach((item) => {
      if (item.type === "section") {
        item.items.forEach((subItem) => {
          if (subItem.type === "expandable") {
            state[subItem.label.toLowerCase().replace(/\s+/g, "")] = false
          }
        })
      }
    })
    return state
  })

  // Save states to consolidated localStorage and notify parent
  useEffect(() => {
    try {
      const currentState = JSON.parse(localStorage.getItem('admin_sidebar_state') || '{}')
      localStorage.setItem('admin_sidebar_state', JSON.stringify({
        ...currentState,
        isCollapsed
      }))
      if (onCollapseChange) {
        onCollapseChange(isCollapsed)
      }
    } catch (e) {
      debugError('Error saving sidebar collapsed state:', e)
    }
  }, [isCollapsed, onCollapseChange])

  // Notify parent on initial load
  useEffect(() => {
    if (onCollapseChange) {
      onCollapseChange(isCollapsed)
    }
  }, [])

  const toggleCollapse = () => {
    setIsCollapsed(prev => !prev)
  }

  // expandedSections state is initialized above in getInitialStates consolidation


  // Filter menu items based on search query
  const filteredMenuData = useMemo(() => {
    if (!searchQuery.trim()) {
      return menuData
    }

    const query = searchQuery.toLowerCase().trim()
    const filtered = []

    menuData.forEach((item) => {
      if (!item) return
      if (item.type === "link") {
        if (item.label.toLowerCase().includes(query)) {
          filtered.push(item)
        }
      } else if (item.type === "section") {
        const filteredItems = []

        item.items.forEach((subItem) => {
          if (subItem.type === "link") {
            if (subItem.label.toLowerCase().includes(query)) {
              filteredItems.push(subItem)
            }
          } else if (subItem.type === "expandable") {
            const matchesLabel = subItem.label.toLowerCase().includes(query)
            const matchingSubItems = subItem.subItems?.filter(
              (si) => si.label.toLowerCase().includes(query)
            ) || []

            if (matchesLabel || matchingSubItems.length > 0) {
              filteredItems.push({
                ...subItem,
                subItems: matchesLabel ? subItem.subItems : matchingSubItems,
              })
            }
          }
        })

        if (filteredItems.length > 0) {
          filtered.push({
            ...item,
            items: filteredItems,
          })
        }
      }
    })

    return filtered
  }, [menuData, searchQuery])

  // Auto-expand sections with matches when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()

      setExpandedSections((prev) => {
        const newExpandedState = { ...prev }

        menuData.forEach((item) => {
          if (!item) return
          if (item.type === "section") {
            item.items.forEach((subItem) => {
              if (subItem.type === "expandable") {
                const matchesLabel = subItem.label.toLowerCase().includes(query)
                const hasMatchingSubItems = subItem.subItems?.some(
                  (si) => si.label.toLowerCase().includes(query)
                )

                if (matchesLabel || hasMatchingSubItems) {
                  const sectionKey = subItem.label.toLowerCase().replace(/\s+/g, "")
                  newExpandedState[sectionKey] = true
                }
              }
            })
          }
        })

        return newExpandedState
      })
    }
  }, [menuData, searchQuery])

  const isActive = (path, allPaths = []) => {
    const currentPath = location.pathname.replace(/\/+$/, "") || "/"
    const targetPath = String(path || "").replace(/\/+$/, "") || "/"
    const matchesPath = (candidatePath) =>
      currentPath === candidatePath || currentPath.startsWith(`${candidatePath}/`)

    if (targetPath === "/admin" || targetPath === "/admin/food") {
      return currentPath === targetPath
    }

    // For subItems, check if this is the most specific match
    if (allPaths.length > 0) {
      // Sort paths by length (longest first) to find most specific match
      const sortedPaths = [...allPaths].sort((a, b) => b.length - a.length)
      const bestMatch = sortedPaths.find((candidatePath) =>
        matchesPath(String(candidatePath || "").replace(/\/+$/, "") || "/")
      )
      return (String(bestMatch || "").replace(/\/+$/, "") || "/") === targetPath
    }

    return matchesPath(targetPath)
  }

  useEffect(() => {
    try {
      const currentState = JSON.parse(localStorage.getItem('admin_sidebar_state') || '{}')
      localStorage.setItem('admin_sidebar_state', JSON.stringify({
        ...currentState,
        expandedSections
      }))
    } catch (e) {
      debugError('Error saving sidebar state:', e)
    }
  }, [expandedSections])

  const toggleSection = (sectionKey) => {
    setExpandedSections((prev) => {
      const isCurrentlyOpen = Boolean(prev[sectionKey])

      // Accordion behavior:
      // 1) If current section is open -> close it.
      // 2) If current section is closed -> open it and close all others.
      if (isCurrentlyOpen) {
        return {
          ...prev,
          [sectionKey]: false,
        }
      }

      const next = {}
      Object.keys(prev).forEach((key) => {
        next[key] = key === sectionKey
      })
      return next
    })
  }

  const renderMenuItem = (item, index, isInSection = false) => {
    const getDisplayLabel = (menuItem) => {
      const rawLabel = String(menuItem?.label || "").trim()
      if (rawLabel) return rawLabel
      const path = String(menuItem?.path || "").trim()
      if (!path) return "Untitled"
      const last = path.split("/").filter(Boolean).pop() || "item"
      return last
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (ch) => ch.toUpperCase())
    }

    if (item.type === "link") {
      const Icon = iconMap[item.icon] || Utensils
      const displayLabel = getDisplayLabel(item)
      return (
        <Link
          key={item.path || index}
          to={item.path}
          onClick={() => {
            if (window.innerWidth < 1024 && onClose) {
              onClose()
            }
          }}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-300 ease-out menu-item-animate text-left",
            isInSection ? "text-sm font-semibold" : "text-sm",
            isActive(item.path)
              ? "bg-white/10 text-white border border-white/15 font-semibold"
              : "text-neutral-300 hover:bg-white/5 hover:text-white",
            isCollapsed && "justify-center px-2"
          )}
          style={{ animationDelay: `${index * 0.05}s` }}
          title={isCollapsed ? displayLabel : undefined}
        >
          <Icon className={cn(
            "shrink-0 transition-all duration-300 text-left",
            isInSection ? "w-4 h-4" : "w-4 h-4",
            isActive(item.path) ? "text-white scale-110" : "text-neutral-300"
          )} />
          {!isCollapsed && (
            <div className="flex-1 flex items-center justify-between overflow-hidden">
              <span className={cn("text-left truncate", isInSection ? "font-semibold" : "font-medium")}>
                {displayLabel}
              </span>
              {getBadgeCount(displayLabel, item.path) > 0 && (
                <span className="shrink-0 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1 min-w-[18px] text-center">
                  {getBadgeCount(displayLabel, item.path) > 99 ? "99+" : getBadgeCount(displayLabel, item.path)}
                </span>
              )}
            </div>
          )}
          {isCollapsed && getBadgeCount(displayLabel, item.path) > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full border-2 border-neutral-950" />
          )}
        </Link>
      )
    }

    if (item.type === "expandable") {
      const Icon = iconMap[item.icon] || Utensils
      const sectionKey = item.label.toLowerCase().replace(/\s+/g, "")
      const isExpanded = expandedSections[sectionKey] || false

      if (isCollapsed) {
        return (
          <div key={index} className="menu-item-animate" style={{ animationDelay: `${index * 0.05}s` }}>
            <button
              onClick={() => toggleSection(sectionKey)}
              className={cn(
                "w-full flex items-center justify-center px-2 py-2 rounded-lg transition-all duration-300 ease-out text-sm font-medium",
                "text-white hover:bg-white/5"
              )}
              title={item.label}
            >
              <div className="relative">
                <Icon className="w-4 h-4 shrink-0 text-neutral-300 transition-transform duration-300" />
                {getBadgeCount(item.label, item.path) > 0 && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full border-2 border-neutral-950" />
                )}
              </div>
            </button>
          </div>
        )
      }

      return (
        <div key={index} className="menu-item-animate" style={{ animationDelay: `${index * 0.05}s` }}>
          <button
            onClick={() => toggleSection(sectionKey)}
            className={cn(
              "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg transition-all duration-300 ease-out text-sm font-medium text-left",
              "text-white hover:bg-white/5"
            )}
          >
            <div className="flex items-center gap-2.5 text-left flex-1 min-w-0">
              <Icon className="w-4 h-4 shrink-0 text-neutral-300 transition-transform duration-300" />
              <span className="font-medium text-left truncate">{item.label}</span>
              {getBadgeCount(item.label, item.path) > 0 && (
                <span className="shrink-0 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1 min-w-[18px] text-center">
                  {getBadgeCount(item.label, item.path) > 99 ? "99+" : getBadgeCount(item.label, item.path)}
                </span>
              )}
            </div>
            <div className="transition-transform duration-300 shrink-0" style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
              <ChevronDown className="w-4 h-4 shrink-0 text-neutral-300" />
            </div>
          </button>
          {isExpanded && item.subItems && (
            <div className="ml-5 mt-1 space-y-1 border-neutral-800/60 pl-3 submenu-animate overflow-hidden">
              {item.subItems.map((subItem, subIndex) => {
                const allSubPaths = item.subItems.map(si => si.path)
                const isSubItemActive = isActive(subItem.path, allSubPaths)
                const displaySubLabel = deriveMenuLabel(
                  subItem,
                  item.subItems.length === 1 ? item.label : ""
                )
                return (
                  <Link
                    key={subItem.path || `${index}-${subIndex}`}
                    to={subItem.path}
                    onClick={() => {
                      if (window.innerWidth < 1024 && onClose) {
                        onClose()
                      }
                    }}
                    className={cn(
                      "w-full grid grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-300 ease-out text-sm font-normal text-left",
                      isSubItemActive
                        ? "bg-white/10 text-white font-semibold"
                        : "text-neutral-300 hover:bg-white/5 hover:text-white"
                    )}
                    style={{ animationDelay: `${subIndex * 0.03}s` }}
                  >
                    <span className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-300",
                      isSubItemActive ? "bg-white scale-125" : "bg-neutral-400"
                    )}></span>
                    <span
                      className={cn(
                        "block text-left text-[13px] leading-5",
                        isSubItemActive ? "text-white" : "text-neutral-300"
                      )}
                    >
                      {String(displaySubLabel || subItem?.label || subItem?.path || "Menu item")}
                    </span>
                    {getBadgeCount(displaySubLabel, subItem.path) > 0 && (
                      <span className="shrink-0 bg-red-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1 min-w-[18px] text-center">
                        {getBadgeCount(displaySubLabel, subItem.path) > 99 ? "99+" : getBadgeCount(displaySubLabel, subItem.path)}
                      </span>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    return null
  }

  return (
    <>
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        @keyframes expandDown {
          from {
            opacity: 0;
            max-height: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            max-height: 500px;
            transform: translateY(0);
          }
        }
        
        .menu-item-animate {
          animation: slideIn 0.3s ease-out forwards;
        }
        
        .submenu-animate {
          animation: expandDown 0.3s ease-out forwards;
        }
        
        .admin-sidebar-scroll {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
        }
        
        .admin-sidebar-scroll::-webkit-scrollbar {
          width: 2px;
        }
        .admin-sidebar-scroll::-webkit-scrollbar-track {
          background: rgba(17, 24, 39, 0.4);
        }
        .admin-sidebar-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          transition: background 0.2s ease;
        }
        .admin-sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.35);
        }
        .admin-sidebar-scroll:hover::-webkit-scrollbar {
          width: 6px;
        }
        .admin-sidebar-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.25) rgba(17, 24, 39, 0.4);
        }
      `}</style>
      <div
        className={cn(
          "bg-neutral-950 border-r border-neutral-800/60 h-screen fixed left-0 top-0 z-50 flex flex-col overflow-hidden",
          "transform transition-all duration-300 ease-in-out",
          "lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
          isCollapsed ? "w-20" : "w-80"
        )}
      >
        {/* Header with Logo and Brand */}
        <div className="shrink-0 px-3 py-3 border-b border-neutral-800/60 bg-neutral-900 animate-[fadeIn_0.4s_ease-out]">
          <div className="flex items-center justify-between mb-3">
            {!isCollapsed && (
              <div className="flex items-center gap-2 animate-[slideIn_0.3s_ease-out]">
                <div className="w-24 h-12 rounded-lg flex items-center justify-center shadow-black/20">
                  {logoUrl ? (
                    <img
                      src={logoUrl || quickSpicyLogo}
                      alt={companyName || "Company"}
                      className="w-24 h-10 object-contain"
                      loading="lazy"
                      onError={(e) => {
                        if (e.target.src !== quickSpicyLogo) {
                          e.target.src = quickSpicyLogo
                        }
                      }}
                    />
                  ) : companyName ? (
                    <span className="text-xs font-semibold text-white px-2 truncate">
                      {companyName}
                    </span>
                  ) : (
                    <img src={quickSpicyLogo} alt="Company" className="w-24 h-10 object-contain" loading="lazy" />
                  )}
                </div>
              </div>
            )}
            {isCollapsed && (
              <div className="w-full flex items-center justify-center">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center shadow-lg shadow-black/20 ring-1 ring-white/10">
                  {logoUrl || companyName ? (
                    <img
                      src={logoUrl || quickSpicyLogo}
                      alt={companyName || "Company"}
                      className="w-10 h-10 object-contain"
                      loading="lazy"
                      onError={(e) => {
                        if (e.target.src !== quickSpicyLogo) {
                          e.target.src = quickSpicyLogo
                        }
                      }}
                    />
                  ) : (
                    <img src={quickSpicyLogo} alt="Company" className="w-10 h-10 object-contain" loading="lazy" />
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleCollapse}
                className="text-neutral-300 hover:text-white transition-all duration-200 hover:scale-110 p-1.5 rounded-lg hover:bg-white/5"
                title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4" />
                ) : (
                  <ChevronLeft className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={onClose}
                className="lg:hidden text-neutral-300 hover:text-white transition-all duration-200 hover:scale-110"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Admin Panel Label */}
          {!isCollapsed && (
            <div className="mb-3 animate-[slideIn_0.4s_ease-out_0.1s_both]">
              <h2 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider text-left">
                Admin Panel
              </h2>
            </div>
          )}

          {/* Search Bar */}
          {!isCollapsed && (
            <div className="relative animate-[slideIn_0.4s_ease-out_0.2s_both]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-neutral-400 w-4 h-4 z-10 transition-colors duration-200" />
              <Input
                type="text"
                placeholder="Search Menu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={cn(
                  "w-full pl-9 py-2 bg-neutral-900 border border-neutral-800 rounded-lg text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 transition-all duration-200 text-left",
                  searchQuery ? "pr-9" : "pr-3"
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-neutral-400 hover:text-white transition-all duration-200 hover:scale-110 z-10"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Navigation Menu */}
        <nav className="admin-sidebar-scroll flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 py-3 space-y-2">
          {filteredMenuData.length === 0 && searchQuery.trim() ? (
            <div className="px-3 py-12 text-left animate-[fadeIn_0.4s_ease-out]">
              <p className="text-neutral-300 text-sm font-medium text-left">No menu items found</p>
              <p className="text-neutral-500 text-sm mt-2 text-left">Try a different search term</p>
            </div>
          ) : (
            filteredMenuData.map((item, index) => {
              if (!item) return null
              if (item.type === "link") {
                return renderMenuItem(item, item.path || item.label || `link-${index}`)
              }

              if (item.type === "section") {
                const sectionStableKey = `section-${item.label || index}`
                return (
                  <div
                    key={sectionStableKey}
                    className={cn(
                      index > 0 ? "mt-4 pt-4 border-t border-neutral-800/60" : "",
                      "animate-[fadeIn_0.4s_ease-out]"
                    )}
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    {!isCollapsed && (
                      <div className="px-3 py-2 mb-2">
                        <span className="text-neutral-400 font-bold text-sm uppercase tracking-wider text-left">
                          {item.label}
                        </span>
                      </div>
                    )}
                    <div className="space-y-1">
                      {item.items.map((subItem, subIndex) =>
                        renderMenuItem(
                          subItem,
                          subItem?.path || subItem?.label || `${sectionStableKey}-item-${subIndex}`,
                          true
                        )
                      )}
                    </div>
                  </div>
                )
              }

              return null
            })
          )}
        </nav>
      </div>
    </>
  )
}
