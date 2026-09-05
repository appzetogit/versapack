import { useCallback, useRef, useState } from "react"
import { userAPI } from "@food/api"

/**
 * Keeps the basket and the serving dark store in agreement when the address changes.
 *
 * The customer builds a basket against the store near wherever they were standing,
 * then picks a different address at checkout — home instead of the office, say — and
 * the items belong to a store that cannot reach it. In a marketplace they chose the
 * shop and can be told to start again; here they never chose it, so the basket has to
 * follow them.
 *
 * The server does the actual work, because it is the only side that knows what each
 * store stocks. This hook is the trigger and the bookkeeping: run it once per address,
 * apply what comes back, and hold on to what could not move so the cart screen can say
 * so instead of the basket quietly shrinking.
 */
export function useCartStoreRebind({ cart, replaceCart }) {
  const [rebinding, setRebinding] = useState(false)
  const [unavailable, setUnavailable] = useState([])
  const [movedStore, setMovedStore] = useState(null)
  const [notServiceable, setNotServiceable] = useState(false)

  // The last address this ran for. Address selection re-renders the cart screen
  // repeatedly, and without this the same rebind fires on every one of them.
  const lastKeyRef = useRef("")

  const rebindTo = useCallback(
    async ({ latitude, longitude }, { force = false } = {}) => {
      const lat = Number(latitude)
      const lng = Number(longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
      if (!Array.isArray(cart) || cart.length === 0) return null

      // ~10 m, matching the location hooks: below that the serving store cannot
      // change, so re-asking would only cost a request.
      const key = `${lat.toFixed(4)},${lng.toFixed(4)}`
      if (!force && key === lastKeyRef.current) return null
      lastKeyRef.current = key

      try {
        setRebinding(true)
        const payload = cart.map((item) => ({
          itemId: item.itemId || item.id,
          restaurantId: item.restaurantId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          image: item.image,
        }))

        const response = await userAPI.rebindCart(lat, lng, payload)
        const data = response?.data?.data || {}

        if (!data.serviceable) {
          // Nothing delivers here. The basket is deliberately left alone — the
          // customer may pick another address next, and emptying it in the
          // meantime would destroy work they did not ask us to undo.
          setNotServiceable(true)
          setUnavailable([])
          return data
        }

        setNotServiceable(false)

        if (data.unchanged) {
          setUnavailable([])
          setMovedStore(null)
          return data
        }

        // Mapped back into the shape the cart context normalises: it keys on
        // `id`, and dropping that would make every line look like a new one.
        replaceCart(
          (data.items || []).map((item) => ({
            ...item,
            id: item.itemId,
            restaurantId: item.restaurantId,
            restaurant: data.store?.name || "",
          })),
        )

        setUnavailable(data.unavailable || [])
        setMovedStore(data.store || null)
        return data
      } catch {
        // A failed rebind must not touch the basket. Checkout re-checks
        // serviceability server-side, so the worst case is the customer being
        // told there at the point where it actually matters.
        return null
      } finally {
        setRebinding(false)
      }
    },
    [cart, replaceCart],
  )

  const dismissNotice = useCallback(() => {
    setUnavailable([])
    setMovedStore(null)
  }, [])

  return { rebindTo, rebinding, unavailable, movedStore, notServiceable, dismissNotice }
}
