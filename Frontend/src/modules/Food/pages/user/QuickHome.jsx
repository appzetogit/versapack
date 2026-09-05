import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronRight, MapPin, Search, Timer, RotateCcw } from "lucide-react"
import { adminAPI, searchAPI, orderAPI } from "@food/api"
import { API_BASE_URL } from "@food/api/config"
import { useDeliveryLocation } from "@food/context/DeliveryLocationContext"
import { useCart } from "@food/context/CartContext"
import OptimizedImage from "@food/components/OptimizedImage"

/**
 * The quick-commerce home.
 *
 * A food app opens on a list of restaurants because choosing where to eat IS the
 * decision. Quick commerce has no such decision to offer: the store is assigned by
 * distance and there is only one, so a store feed would be a list of length one. What
 * the customer came to do is find a product and leave, which makes the category grid
 * the primary navigation and the promise the headline.
 *
 * Buy-again sits above the grid deliberately. Grocery baskets repeat far more than
 * restaurant orders do -- the same milk, the same bread, most weeks -- so the fastest
 * path to a filled cart is usually the last one, and it is the strongest retention
 * surface this app has.
 */

const RAIL_LIMIT = 12

export default function QuickHome() {
  const navigate = useNavigate()
  const { cart, addToCart } = useCart()
  const {
    displayAddressText,
    zoneId,
    servingStore,
    serviceable,
    promiseMinutes,
    storeLoading,
  } = useDeliveryLocation()

  const [categories, setCategories] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [buyAgain, setBuyAgain] = useState([])
  const [bestSellers, setBestSellers] = useState([])

  const backendOrigin = useMemo(() => API_BASE_URL.replace(/\/api\/?$/, ""), [])

  /** Server image paths come back relative in places and absolute in others. */
  const resolveImage = useCallback(
    (value) => {
      const raw = String(value || "").trim()
      if (!raw) return ""
      if (/^(data:|blob:)/i.test(raw)) return raw
      if (/^(https?:)?\/\//i.test(raw)) return raw
      return raw.startsWith("/") ? `${backendOrigin}${raw}` : `${backendOrigin}/${raw}`
    },
    [backendOrigin],
  )

  useEffect(() => {
    let cancelled = false
    const loadCategories = async () => {
      try {
        setCategoriesLoading(true)
        const response = await adminAPI.getPublicCategories(zoneId ? { zoneId } : {})
        const list =
          response?.data?.data?.categories || response?.data?.categories || []
        if (cancelled) return
        setCategories(
          (Array.isArray(list) ? list : [])
            // Subcategories belong inside their parent, not on the top-level grid.
            .filter((category) => !category?.parentId)
            .map((category, index) => ({
              id: String(category?._id || category?.id || index),
              name: category?.name || "",
              image: resolveImage(category?.image || category?.imageUrl),
            })),
        )
      } catch {
        if (!cancelled) setCategories([])
      } finally {
        if (!cancelled) setCategoriesLoading(false)
      }
    }
    loadCategories()
    return () => {
      cancelled = true
    }
  }, [zoneId, resolveImage])

  useEffect(() => {
    let cancelled = false
    const loadRails = async () => {
      // Products the customer has actually bought before, newest first and
      // de-duplicated, because the same milk appears in every order.
      try {
        const response = await orderAPI.getOrders({ limit: 10 })
        const orders =
          response?.data?.data?.orders || response?.data?.orders || []
        const seen = new Set()
        const repeats = []
        for (const order of Array.isArray(orders) ? orders : []) {
          for (const item of order?.items || []) {
            const key = String(item?.itemId || "")
            if (!key || seen.has(key)) continue
            seen.add(key)
            repeats.push({
              _id: key,
              name: item?.name || "",
              price: Number(item?.price) || 0,
              image: resolveImage(item?.image),
              packSize: item?.packSize || "",
              restaurantId: order?.restaurantId?._id || order?.restaurantId || "",
            })
            if (repeats.length >= RAIL_LIMIT) break
          }
          if (repeats.length >= RAIL_LIMIT) break
        }
        if (!cancelled) setBuyAgain(repeats)
      } catch {
        // Signed-out customers have no order history, which is not an error.
        if (!cancelled) setBuyAgain([])
      }

      try {
        const response = await searchAPI.searchProducts({
          ...(zoneId ? { zoneId } : {}),
          inStockOnly: true,
          limit: RAIL_LIMIT,
        })
        const products = response?.data?.data?.products || []
        if (!cancelled) {
          setBestSellers(
            products.map((product) => ({
              ...product,
              image: resolveImage(product.image),
            })),
          )
        }
      } catch {
        if (!cancelled) setBestSellers([])
      }
    }
    loadRails()
    return () => {
      cancelled = true
    }
  }, [zoneId, resolveImage])

  /**
   * Shapes a rail product into what the cart context expects.
   *
   * normalizeCartData keys on `itemId`/`id`, and addToCart guards on `restaurantId`
   * to stop a basket spanning two stores. Passing the raw search row would leave both
   * unset, so the line would be treated as a new item on every tap and the store
   * guard would compare undefined against undefined.
   */
  const addProduct = useCallback(
    (product) => {
      if (!product?._id) return
      addToCart({
        itemId: String(product._id),
        id: String(product._id),
        restaurantId: String(product.restaurantId || servingStore?._id || ""),
        restaurant: servingStore?.name || "",
        name: product.name || "",
        price: Number(product.price) || 0,
        image: product.image || "",
        packSize: product.packSize || "",
        quantity: 1,
      })
    },
    [addToCart, servingStore],
  )

  const cartCount = Array.isArray(cart)
    ? cart.reduce((sum, item) => sum + (Number(item?.quantity) || 0), 0)
    : 0

  // A location we cannot serve is a full-screen answer, not a banner over a
  // catalogue the customer cannot buy from.
  if (serviceable === false) {
    return (
      <div className="min-h-screen bg-white dark:bg-[#0a0a0a] flex flex-col items-center justify-center px-8 text-center">
        <div className="w-16 h-16 rounded-3xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mb-5">
          <MapPin className="w-7 h-7 text-rose-500" />
        </div>
        <h1 className="text-lg font-black text-neutral-900 dark:text-neutral-100">
          We don't deliver here yet
        </h1>
        <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 mt-2 max-w-xs">
          {displayAddressText && displayAddressText !== "Select Location"
            ? `Nothing reaches ${displayAddressText} in time yet. Try another address.`
            : "Pick an address to see what we can get to you."}
        </p>
        <button
          onClick={() => navigate("/food/user/cart/select-address")}
          className="mt-6 px-6 py-3 rounded-2xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-black uppercase tracking-tight active:scale-95 transition-transform"
        >
          Change address
        </button>
      </div>
    )
  }

  return (
    <div
      // Bottom padding clears the tab bar, and grows when the cart bar is showing:
      // that bar is fixed and sits above the nav, so the fixed reserve is ~24px
      // short of it and the last rail would scroll underneath.
      className={`min-h-screen bg-neutral-50 dark:bg-[#0a0a0a] ${
        cartCount > 0 ? "pb-44" : "pb-28"
      }`}
    >
      {/* The promise is the headline. It is the reason to order, so it leads. */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-neutral-100 dark:border-neutral-800">
        <div className="px-4 pt-4 pb-3">
          <button
            onClick={() => navigate("/food/user/cart/select-address")}
            className="flex items-start gap-2 text-left w-full"
          >
            <Timer className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-base font-black text-neutral-900 dark:text-neutral-100 leading-tight">
                {storeLoading || promiseMinutes === null
                  ? "Checking delivery time…"
                  : `Delivery in ${promiseMinutes} min`}
              </p>
              <p className="text-[11px] font-bold text-neutral-500 dark:text-neutral-400 truncate flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 shrink-0" />
                {displayAddressText || "Select location"}
                <ChevronRight className="w-3 h-3 shrink-0" />
              </p>
            </div>
          </button>

          <button
            onClick={() => navigate("/food/user/search")}
            className="mt-3 w-full flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-neutral-100 dark:bg-neutral-900 text-neutral-400 text-sm font-semibold"
          >
            <Search className="w-4 h-4" />
            Search for milk, bread, eggs…
          </button>
        </div>
      </header>

      <main className="px-4 pt-5 space-y-7">
        {buyAgain.length > 0 && (
          <Rail
            title="Buy again"
            icon={<RotateCcw className="w-4 h-4 text-neutral-400" />}
            items={buyAgain}
            onOpen={(product) => navigate(`/food/user/product/${product._id}`)}
            onAdd={addProduct}
          />
        )}

        {/* The primary navigation. Everything else on this page is a shortcut. */}
        <section>
          <h2 className="text-sm font-black text-neutral-900 dark:text-neutral-100 mb-3">
            Shop by category
          </h2>
          {categoriesLoading ? (
            <div className="grid grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="animate-pulse">
                  <div className="aspect-square rounded-2xl bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-2.5 rounded bg-neutral-200 dark:bg-neutral-800 mt-2 mx-2" />
                </div>
              ))}
            </div>
          ) : categories.length === 0 ? (
            <p className="text-xs font-semibold text-neutral-400 py-6 text-center">
              Nothing stocked here yet.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() =>
                    navigate(`/food/user/category/${encodeURIComponent(category.name)}`)
                  }
                  className="text-center active:scale-95 transition-transform"
                >
                  <div className="aspect-square rounded-2xl bg-white dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 overflow-hidden flex items-center justify-center">
                    {category.image ? (
                      <OptimizedImage
                        src={category.image}
                        alt={category.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-2xl">🛒</span>
                    )}
                  </div>
                  <p className="text-[10px] font-bold text-neutral-700 dark:text-neutral-300 mt-1.5 leading-tight line-clamp-2">
                    {category.name}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        {bestSellers.length > 0 && (
          <Rail
            title={servingStore?.name ? `Popular at ${servingStore.name}` : "Popular now"}
            items={bestSellers}
            onOpen={(product) => navigate(`/food/user/product/${product._id}`)}
            onAdd={addProduct}
          />
        )}
      </main>

      {cartCount > 0 && (
        <button
          onClick={() => navigate("/food/user/cart")}
          className="fixed bottom-20 left-4 right-4 z-40 py-4 rounded-2xl bg-emerald-600 text-white flex items-center justify-between px-5 shadow-lg shadow-emerald-600/25 active:scale-[0.98] transition-transform"
        >
          <span className="text-xs font-black uppercase tracking-tight">
            {cartCount} {cartCount === 1 ? "item" : "items"}
          </span>
          <span className="text-xs font-black uppercase tracking-tight flex items-center gap-1">
            View cart <ChevronRight className="w-4 h-4" />
          </span>
        </button>
      )}
    </div>
  )
}

/** Horizontal product strip. Cards are deliberately narrow so a fourth peeks in. */
function Rail({ title, icon, items, onOpen, onAdd }) {
  return (
    <section>
      <h2 className="text-sm font-black text-neutral-900 dark:text-neutral-100 mb-3 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-hide">
        {items.map((product) => (
          <div
            key={product._id}
            className="w-[116px] shrink-0 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-100 dark:border-neutral-800 p-2.5"
          >
            <button onClick={() => onOpen(product)} className="w-full text-left">
              <div className="aspect-square rounded-xl bg-neutral-50 dark:bg-neutral-800 overflow-hidden mb-2">
                {product.image ? (
                  <OptimizedImage
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : null}
              </div>
              <p className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 leading-tight line-clamp-2 min-h-[26px]">
                {product.name}
              </p>
              {product.packSize && (
                <p className="text-[10px] font-semibold text-neutral-400 mt-0.5">
                  {product.packSize}
                </p>
              )}
            </button>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs font-black text-neutral-900 dark:text-neutral-100">
                ₹{Number(product.price || 0).toFixed(0)}
              </span>
              <button
                onClick={() => onAdd?.(product)}
                className="px-2.5 py-1 rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-400 text-[10px] font-black uppercase active:scale-90 transition-transform"
              >
                Add
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
