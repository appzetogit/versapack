import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "framer-motion"
import {
  AlertTriangle,
  Barcode,
  Boxes,
  ChevronDown,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  Store,
  Unlink,
  X,
} from "lucide-react"
import { adminAPI } from "@food/api"
import { toast } from "sonner"
import { canCurrentAdminAction } from "@food/utils/adminRbac"

/**
 * The shared catalogue behind every seller listing.
 *
 * Two jobs, and the second is the one that earns the screen: create and edit master
 * products, and review the ones whose tax class nobody agrees on. The backfill script
 * deliberately leaves gstRate and hsnCode blank whenever the sellers of a product
 * disagree about them, because the majority answer is still wrong on an invoice. Those
 * blanks are the work queue, so they are surfaced here rather than left to be noticed.
 */

const NET_QUANTITY_UNITS = ["g", "kg", "ml", "l", "piece"]
const FOOD_TYPES = ["None", "Veg", "Non-Veg"]

const emptyForm = {
  name: "",
  brand: "",
  barcode: "",
  packSize: "",
  netQuantity: "",
  netQuantityUnit: "",
  gstRate: "",
  hsnCode: "",
  countryOfOrigin: "",
  manufacturerName: "",
  marketedByName: "",
  foodType: "None",
  image: "",
  isActive: true,
}

const money = (value) =>
  Number.isFinite(Number(value)) ? `₹${Number(value).toFixed(2)}` : "—"

/**
 * A master is "incomplete" when it cannot produce a compliant invoice line.
 *
 * Both fields are required on a tax invoice for goods, and a master exists precisely so
 * every seller of the product bills them the same way. One left blank means the
 * backfill found sellers disagreeing, or nobody has filled it in yet — either way it is
 * unfinished work, not a valid state to leave the catalogue in.
 */
const needsTaxReview = (product) =>
  product?.gstRate === null || product?.gstRate === undefined || !product?.hsnCode

export default function MasterProducts() {
  const [products, setProducts] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState("")
  const [reviewOnly, setReviewOnly] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const [expandedId, setExpandedId] = useState(null)
  const [listings, setListings] = useState({})
  const [listingsLoading, setListingsLoading] = useState(false)

  const canEdit = canCurrentAdminAction("edit")
  const canCreate = canCurrentAdminAction("create")

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getMasterProducts({ q: query.trim(), limit: 100 })
      const data = response?.data?.data || {}
      setProducts(Array.isArray(data.items) ? data.items : [])
      setTotal(Number(data.total) || 0)
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not load master products")
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    // Debounced so typing a barcode does not fire a request per digit.
    const timer = setTimeout(load, query ? 350 : 0)
    return () => clearTimeout(timer)
  }, [load, query])

  const visible = useMemo(
    () => (reviewOnly ? products.filter(needsTaxReview) : products),
    [products, reviewOnly],
  )
  const reviewCount = useMemo(() => products.filter(needsTaxReview).length, [products])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (product) => {
    setEditingId(String(product._id))
    setForm({
      ...emptyForm,
      ...product,
      // Inputs are controlled, so every field has to be a string. null would make
      // React switch the input to uncontrolled and warn.
      barcode: product.barcode ?? "",
      netQuantity: product.netQuantity ?? "",
      netQuantityUnit: product.netQuantityUnit ?? "",
      gstRate: product.gstRate ?? "",
      isActive: product.isActive !== false,
    })
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Product name is required")
      return
    }
    try {
      setSaving(true)
      // Empty strings are sent as null so the server clears the field rather than
      // storing "" — the two mean different things to the resolver.
      const payload = {
        ...form,
        barcode: form.barcode.trim() || null,
        netQuantity: form.netQuantity === "" ? null : Number(form.netQuantity),
        netQuantityUnit: form.netQuantityUnit || null,
        gstRate: form.gstRate === "" ? null : Number(form.gstRate),
      }

      if (editingId) {
        await adminAPI.updateMasterProduct(editingId, payload)
        toast.success("Master product updated")
      } else {
        const response = await adminAPI.createMasterProduct(payload)
        const adopted = Number(response?.data?.data?.product?.listingCount) || 0
        toast.success(
          adopted > 0
            ? `Created, and ${adopted} existing listing${adopted === 1 ? "" : "s"} linked by barcode`
            : "Master product created",
        )
      }
      setModalOpen(false)
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not save master product")
    } finally {
      setSaving(false)
    }
  }

  const toggleListings = async (product) => {
    const id = String(product._id)
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (listings[id]) return

    try {
      setListingsLoading(true)
      const response = await adminAPI.getMasterProductListings(id)
      setListings((prev) => ({ ...prev, [id]: response?.data?.data?.items || [] }))
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not load linked listings")
      setListings((prev) => ({ ...prev, [id]: [] }))
    } finally {
      setListingsLoading(false)
    }
  }

  const detach = async (listingId, masterId) => {
    if (!window.confirm("Detach this listing? It will go back to being sold under the seller's own name and tax code.")) {
      return
    }
    try {
      await adminAPI.linkListingToMaster(listingId, null)
      setListings((prev) => ({
        ...prev,
        [masterId]: (prev[masterId] || []).filter((l) => String(l._id) !== String(listingId)),
      }))
      toast.success("Listing detached")
      await load()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not detach listing")
    }
  }

  return (
    <div className="p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <Layers className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900">Master Products</h1>
            <p className="text-xs font-semibold text-slate-500">
              One row per manufactured product. Sellers list against these, so the name,
              pack and tax class stop differing shop to shop.
            </p>
          </div>
        </div>
        {canCreate && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-tight hover:bg-black active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" /> New master product
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, brand or scan a barcode"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
        <button
          onClick={() => setReviewOnly((v) => !v)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-tight border transition-all ${
            reviewOnly
              ? "bg-amber-500 text-white border-amber-500"
              : "bg-white text-amber-700 border-amber-200 hover:bg-amber-50"
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Needs tax review
          {reviewCount > 0 && (
            <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${reviewOnly ? "bg-white/20" : "bg-amber-100"}`}>
              {reviewCount}
            </span>
          )}
        </button>
        <span className="text-xs font-bold text-slate-500">{total} total</span>
      </div>

      {reviewOnly && reviewCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-xs font-black text-amber-900">
            These have no GST rate or no HSN code
          </p>
          <p className="text-[11px] font-semibold text-amber-800/80 mt-1 leading-relaxed">
            A tax invoice for goods needs both. Where the backfill found the sellers of a
            product disagreeing, it left the field blank on purpose rather than picking
            the more popular answer — a majority is still wrong on an invoice. Set the
            correct value here and every linked listing bills it.
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : visible.length === 0 ? (
          <div className="p-16 text-center">
            <Boxes className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-black text-slate-700">
              {reviewOnly ? "Nothing needs tax review" : "No master products yet"}
            </p>
            <p className="text-xs font-semibold text-slate-500 mt-1">
              {reviewOnly
                ? "Every master has a GST rate and an HSN code."
                : "Run npm run migrate:master-products to build these from existing listings, or add one by hand."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3">Barcode</th>
                  <th className="px-5 py-3">Tax</th>
                  <th className="px-5 py-3">Sellers</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((product) => {
                  const id = String(product._id)
                  const isOpen = expandedId === id
                  const rows = listings[id] || []
                  return (
                    <>
                      <tr key={id} className="hover:bg-slate-50/60">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            {product.image ? (
                              <img
                                src={product.image}
                                alt={product.name}
                                className="w-10 h-10 rounded-xl object-cover border border-slate-100"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                                <Boxes className="w-5 h-5 text-slate-300" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-black text-slate-900 truncate">
                                {product.name}
                              </p>
                              <p className="text-[11px] font-bold text-slate-500 truncate">
                                {[product.brand, product.packSize].filter(Boolean).join(" · ") || "—"}
                              </p>
                            </div>
                            {product.isActive === false && (
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[9px] font-black uppercase">
                                Retired
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          {product.barcode ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 tabular-nums">
                              <Barcode className="w-3.5 h-3.5 text-slate-400" />
                              {product.barcode}
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">
                              No barcode — link by hand
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          {needsTaxReview(product) ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-black uppercase">
                              <AlertTriangle className="w-3 h-3" /> Needs review
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-slate-700">
                              {product.gstRate}% · HSN {product.hsnCode}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <button
                            onClick={() => toggleListings(product)}
                            className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-600 hover:text-indigo-800"
                          >
                            <Store className="w-3.5 h-3.5" />
                            {product.listingCount ?? 0}
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                            />
                          </button>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {canEdit && (
                            <button
                              onClick={() => openEdit(product)}
                              className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-900 transition-colors"
                              aria-label={`Edit ${product.name}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${id}-listings`}>
                          <td colSpan={5} className="px-5 pb-5 bg-slate-50/60">
                            {listingsLoading && rows.length === 0 ? (
                              <div className="py-6 flex justify-center">
                                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                              </div>
                            ) : rows.length === 0 ? (
                              <p className="py-4 text-xs font-semibold text-slate-500">
                                No seller stocks this yet.
                              </p>
                            ) : (
                              <div className="space-y-1.5 pt-2">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 pb-1">
                                  Sellers, cheapest first
                                </p>
                                {rows.map((listing) => (
                                  <div
                                    key={String(listing._id)}
                                    className="flex items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl px-4 py-2.5"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-black text-slate-800 truncate">
                                        {listing.restaurantId?.restaurantName || "Unknown seller"}
                                      </p>
                                      <p className="text-[11px] font-semibold text-slate-500 truncate">
                                        {listing.name}
                                      </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <p className="text-xs font-black text-slate-900 tabular-nums">
                                        {money(listing.price)}
                                      </p>
                                      <p className="text-[10px] font-bold text-slate-400">
                                        {listing.stockQty === null || listing.stockQty === undefined
                                          ? "Untracked"
                                          : `${listing.stockQty} in stock`}
                                      </p>
                                    </div>
                                    {canEdit && (
                                      <button
                                        onClick={() => detach(listing._id, id)}
                                        className="p-2 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors shrink-0"
                                        aria-label="Detach this listing"
                                        title="Detach from this master product"
                                      >
                                        <Unlink className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/*
        Portalled to the body, with a scrim that does not animate.
        //
        Animating opacity on the scrim itself left it stuck part-way — this app runs
        Lenis and GSAP alongside framer-motion, and the interrupted animation settles at
        a fractional value. Because opacity applies to the whole subtree, the white panel
        inherited it and the table behind showed straight through the form. The static
        scrim plus a portal is the structure the other admin modals already use, and it
        cannot land in that state at all.
      */}
      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {modalOpen && (
              <div className="fixed inset-0 z-[200]">
                <div
                  className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                  onClick={() => !saving && setModalOpen(false)}
                />
                <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
                  <motion.div
                    initial={{ scale: 0.96, y: 12 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.96, y: 12 }}
                    className="bg-white rounded-3xl w-full max-w-2xl max-h-[88vh] overflow-y-auto pointer-events-auto"
                  >
              <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-black text-slate-900">
                  {editingId ? "Edit master product" : "New master product"}
                </h2>
                <button
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Product name" required className="sm:col-span-2">
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Amul Butter"
                    className={inputClass}
                  />
                </Field>

                <Field label="Brand">
                  <input
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    placeholder="Amul"
                    className={inputClass}
                  />
                </Field>

                <Field
                  label="Barcode (EAN/UPC)"
                  hint="Listings carrying this code link automatically, on save and from then on."
                >
                  <input
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                    placeholder="8901234567890"
                    className={inputClass}
                  />
                </Field>

                <Field label="Pack size" hint="As printed: “500 g”, “pack of 6”.">
                  <input
                    value={form.packSize}
                    onChange={(e) => setForm({ ...form, packSize: e.target.value })}
                    placeholder="500 g"
                    className={inputClass}
                  />
                </Field>

                <Field label="Net quantity" hint="The comparable form — drives price per 100 g.">
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      value={form.netQuantity}
                      onChange={(e) => setForm({ ...form, netQuantity: e.target.value })}
                      placeholder="500"
                      className={inputClass}
                    />
                    <select
                      value={form.netQuantityUnit}
                      onChange={(e) => setForm({ ...form, netQuantityUnit: e.target.value })}
                      className={`${inputClass} w-28`}
                    >
                      <option value="">Unit</option>
                      {NET_QUANTITY_UNITS.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </Field>

                <Field label="GST rate %" hint="Applies to every seller of this product.">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.gstRate}
                    onChange={(e) => setForm({ ...form, gstRate: e.target.value })}
                    placeholder="12"
                    className={inputClass}
                  />
                </Field>

                <Field label="HSN code" hint="Required on a tax invoice for goods.">
                  <input
                    value={form.hsnCode}
                    onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
                    placeholder="0405"
                    className={inputClass}
                  />
                </Field>

                <Field label="Veg marking">
                  <select
                    value={form.foodType}
                    onChange={(e) => setForm({ ...form, foodType: e.target.value })}
                    className={inputClass}
                  >
                    {FOOD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t === "None" ? "Not applicable (non-food)" : t}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Country of origin">
                  <input
                    value={form.countryOfOrigin}
                    onChange={(e) => setForm({ ...form, countryOfOrigin: e.target.value })}
                    placeholder="India"
                    className={inputClass}
                  />
                </Field>

                <Field label="Manufacturer">
                  <input
                    value={form.manufacturerName}
                    onChange={(e) => setForm({ ...form, manufacturerName: e.target.value })}
                    className={inputClass}
                  />
                </Field>

                <Field label="Marketed by">
                  <input
                    value={form.marketedByName}
                    onChange={(e) => setForm({ ...form, marketedByName: e.target.value })}
                    className={inputClass}
                  />
                </Field>

                <Field label="Image URL" className="sm:col-span-2">
                  <input
                    value={form.image}
                    onChange={(e) => setForm({ ...form, image: e.target.value })}
                    placeholder="https://…"
                    className={inputClass}
                  />
                </Field>

                <label className="sm:col-span-2 flex items-center gap-3 pt-1">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    className="w-4 h-4 accent-slate-900"
                  />
                  <span className="text-xs font-bold text-slate-700">
                    Active — retired products keep their existing listings but take no new ones
                  </span>
                </label>
              </div>

              <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-slate-100 flex gap-3">
                <button
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-tight hover:bg-slate-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-tight hover:bg-black disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? "Saving" : editingId ? "Save changes" : "Create"}
                </button>
              </div>
                  </motion.div>
                </div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  )
}

const inputClass =
  "w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"

function Field({ label, hint, required, className = "", children }) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] font-semibold text-slate-400 mt-1.5">{hint}</p>}
    </div>
  )
}
