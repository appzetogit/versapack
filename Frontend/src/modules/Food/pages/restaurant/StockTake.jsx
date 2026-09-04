import { useState, useEffect, useMemo, useCallback } from "react"
import { Loader2, Search, AlertTriangle, PackageSearch, RefreshCw } from "lucide-react"
import RestaurantNavbar from "@food/components/restaurant/RestaurantNavbar"
import BottomNavOrders from "@food/components/restaurant/BottomNavOrders"
import { Button } from "@food/components/ui/button"
import { restaurantAPI } from "@food/api"
import { toast } from "sonner"

/**
 * Stock-take: set counts for the whole catalogue in one pass.
 *
 * The endpoint takes up to 500 entries and answers per item, so a single bad id
 * does not throw away a shop's whole count. Only rows the seller actually
 * touched are sent — submitting every row would overwrite counts that another
 * device changed while this screen was open.
 */

const MAX_BATCH = 500

/**
 * Empty means untracked (`null`), "0" means the shelf is empty. They are
 * different states and the input has to be able to express both, so the value
 * is held as a string and only converted at save time.
 */
const toFieldValue = (value) => (value === null || value === undefined ? "" : String(value))

const parseFieldValue = (raw) => {
  const text = String(raw ?? "").trim()
  if (text === "") return null
  const n = Number(text)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null
}

const flattenMenu = (menuResponse) => {
  const sections = menuResponse?.data?.data?.menu?.sections
  if (!Array.isArray(sections)) return []

  const rows = []
  sections.forEach((section) => {
    if (!Array.isArray(section?.items)) return
    section.items.forEach((item) => {
      if (!item?.id) return
      rows.push({
        id: String(item.id),
        name: item.name || "Unnamed item",
        brand: item.brand || "",
        packSize: item.packSize || "",
        category: section.name || "",
        isAvailable: item.isAvailable !== false,
        stockQty: item.stockQty ?? null,
        lowStockThreshold: item.lowStockThreshold ?? null,
        maxQtyPerOrder: item.maxQtyPerOrder ?? null,
      })
    })
  })
  return rows
}

export default function StockTake() {
  const [rows, setRows] = useState([])
  const [edits, setEdits] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [lowStockOnly, setLowStockOnly] = useState(false)

  const loadCatalogue = useCallback(async () => {
    setLoading(true)
    try {
      const response = await restaurantAPI.getMenu()
      setRows(flattenMenu(response))
      setEdits({})
    } catch {
      toast.error("Could not load your products")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCatalogue()
  }, [loadCatalogue])

  const fieldValue = (row, field) => {
    const edit = edits[row.id]
    if (edit && field in edit) return edit[field]
    return toFieldValue(row[field])
  }

  const setField = (rowId, field, value) => {
    setEdits((prev) => ({
      ...prev,
      [rowId]: { ...(prev[rowId] || {}), [field]: value },
    }))
  }

  /** Rows whose typed value actually differs from what the server holds. */
  const changedRows = useMemo(() => {
    return Object.entries(edits)
      .map(([rowId, edit]) => {
        const row = rows.find((r) => r.id === rowId)
        if (!row) return null

        const payload = { itemId: rowId }
        let changed = false

        for (const field of ["stockQty", "lowStockThreshold", "maxQtyPerOrder"]) {
          if (!(field in edit)) continue
          const next = parseFieldValue(edit[field])
          if (next !== (row[field] ?? null)) {
            payload[field] = next
            changed = true
          }
        }

        return changed ? payload : null
      })
      .filter(Boolean)
  }, [edits, rows])

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (lowStockOnly) {
        const qty = row.stockQty
        const threshold = row.lowStockThreshold
        if (qty === null || threshold === null || qty > threshold) return false
      }
      if (!term) return true
      return (
        row.name.toLowerCase().includes(term) ||
        row.brand.toLowerCase().includes(term)
      )
    })
  }, [rows, search, lowStockOnly])

  const handleSave = async () => {
    if (changedRows.length === 0) return

    if (changedRows.length > MAX_BATCH) {
      toast.error(`Save at most ${MAX_BATCH} products at a time`)
      return
    }

    setSaving(true)
    try {
      const response = await restaurantAPI.updateFoodStock(changedRows)
      const result = response?.data?.data || {}
      const failed = Array.isArray(result.failed) ? result.failed : []
      const updatedCount = result.updatedCount ?? changedRows.length - failed.length

      if (failed.length > 0) {
        // Per-item results exist precisely so a partial save is reported as one.
        toast.error(`${updatedCount} saved, ${failed.length} could not be saved`)
      } else {
        toast.success(`${updatedCount} product${updatedCount === 1 ? "" : "s"} updated`)
      }

      await loadCatalogue()
    } catch (error) {
      toast.error(
        error?.response?.data?.message || "Could not save the stock count",
      )
    } finally {
      setSaving(false)
    }
  }

  const numberInput = (row, field, placeholder) => (
    <input
      type="number"
      min="0"
      inputMode="numeric"
      value={fieldValue(row, field)}
      placeholder={placeholder}
      onChange={(e) => setField(row.id, field, e.target.value)}
      className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm tabular-nums focus:border-[#EB590E] focus:outline-none dark:border-gray-700 dark:bg-[#141414] dark:text-white"
    />
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] pb-24">
      <RestaurantNavbar />

      <div className="mx-auto max-w-5xl px-4 py-5">
        <div className="mb-1 flex items-center gap-2">
          <PackageSearch className="h-5 w-5 text-[#EB590E]" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Stock take</h1>
        </div>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
          Leave a count blank to keep a product untracked. Enter <strong>0</strong> to mark it
          out of stock — it hides from shoppers and comes back when you restock.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product or brand..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-[#EB590E] focus:outline-none dark:border-gray-700 dark:bg-[#141414] dark:text-white"
            />
          </div>

          <Button
            type="button"
            variant={lowStockOnly ? "default" : "outline"}
            onClick={() => setLowStockOnly((v) => !v)}
            className={lowStockOnly ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}
          >
            <AlertTriangle className="mr-1.5 h-4 w-4" />
            Low stock
          </Button>

          <Button type="button" variant="outline" onClick={loadCatalogue} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading products...
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-500 dark:border-gray-700">
            {lowStockOnly
              ? "Nothing is running low right now."
              : "No products match your search."}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#141414]">
            <div className="hidden grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-gray-200 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:border-gray-800 md:grid">
              <span>Product</span>
              <span className="w-24 text-center">In stock</span>
              <span className="w-24 text-center">Alert at</span>
              <span className="w-24 text-center">Max/order</span>
            </div>

            {visibleRows.map((row) => {
              const isDirty = changedRows.some((c) => c.itemId === row.id)
              return (
                <div
                  key={row.id}
                  className={`flex flex-col gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 dark:border-gray-800 md:grid md:grid-cols-[1fr_auto_auto_auto] md:items-center md:gap-4 ${
                    isDirty ? "bg-orange-50/60 dark:bg-orange-900/10" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                      {row.name}
                    </p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {[row.brand, row.packSize, row.category].filter(Boolean).join(" · ")}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 md:contents">
                    <label className="flex items-center gap-2 md:block">
                      <span className="text-xs text-gray-500 md:hidden">In stock</span>
                      {numberInput(row, "stockQty", "Untracked")}
                    </label>
                    <label className="flex items-center gap-2 md:block">
                      <span className="text-xs text-gray-500 md:hidden">Alert at</span>
                      {numberInput(row, "lowStockThreshold", "Off")}
                    </label>
                    <label className="flex items-center gap-2 md:block">
                      <span className="text-xs text-gray-500 md:hidden">Max/order</span>
                      {numberInput(row, "maxQtyPerOrder", "No cap")}
                    </label>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {changedRows.length > 0 ? (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t border-gray-200 bg-white px-4 py-3 shadow-lg dark:border-gray-800 dark:bg-[#141414] md:bottom-0">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {changedRows.length} product{changedRows.length === 1 ? "" : "s"} changed
            </span>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setEdits({})} disabled={saving}>
                Discard
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="bg-[#EB590E] text-white hover:opacity-90"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save changes
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <BottomNavOrders />
    </div>
  )
}
