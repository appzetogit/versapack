import { useState, useMemo, useEffect, useCallback } from "react"
import { useSearchParams } from "react-router-dom"
import { Search, Trash2, Loader2, Eye, Pencil, Plus, Save, ChevronDown, ChevronLeft, ChevronRight, FileUp, Download, X, Upload } from "lucide-react"
import { adminAPI, uploadAPI } from "@food/api"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@food/components/ui/popover"
import { getFoodDisplayOtherPrice, getFoodDisplayPrice, getFoodVariants } from "@food/utils/foodVariants"
import { canCurrentAdminAction } from "@food/utils/adminRbac"
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const getEntityId = (value) => {
  if (!value) return ""
  if (typeof value === "string" || typeof value === "number") return String(value)
  if (typeof value === "object") {
    return String(value._id || value.id || value.restaurantId || "")
  }
  return ""
}

const getRestaurantName = (value) => {
  if (!value || typeof value !== "object") return ""
  return String(value.name || value.restaurantName || "")
}

const createFoodForm = () => ({
  restaurantId: "",
  categoryId: "",
  categoryName: "",
  name: "",
  price: "",
  otherPrice: "",
  variants: [],
  description: "",
  image: "",
  foodType: "Non-Veg",
  isAvailable: true,
  preparationTime: "",
})

const createVariantDraft = (variant = {}) => ({
  id: String(variant?.id || variant?._id || `variant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
  name: String(variant?.name || ""),
  price: variant?.price != null ? String(variant.price) : "",
  otherPrice: variant?.otherPrice != null ? String(variant.otherPrice) : "",
})

const FOOD_FALLBACK_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
      <rect width="80" height="80" rx="12" fill="#F1F5F9"/>
      <circle cx="40" cy="30" r="12" fill="#CBD5E1"/>
      <rect x="20" y="48" width="40" height="8" rx="4" fill="#CBD5E1"/>
    </svg>`
  )

export default function FoodsList() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedRestaurant, setSelectedRestaurant] = useState("all")
  const [foods, setFoods] = useState([])
  const [restaurantsForFilter, setRestaurantsForFilter] = useState([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)
  const [selectedFood, setSelectedFood] = useState(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showFoodFormModal, setShowFoodFormModal] = useState(false)
  const [foodFormMode, setFoodFormMode] = useState("add")
  const [foodForm, setFoodForm] = useState(createFoodForm())
  const [editingFood, setEditingFood] = useState(null)
  const [submittingFood, setSubmittingFood] = useState(false)
  const [categoryOptions, setCategoryOptions] = useState([])
  const [categorySearch, setCategorySearch] = useState("")
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false)
  const [selectedImageFile, setSelectedImageFile] = useState(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalFoods, setTotalFoods] = useState(0)
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("")
  const [imageVersion, setImageVersion] = useState(Date.now())
  const [restaurantFilterSearch, setRestaurantFilterSearch] = useState("")
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false)
  const [bulkUploadFile, setBulkUploadFile] = useState(null)
  const [bulkUploadResults, setBulkUploadResults] = useState(null)
  const [isBulkUploading, setIsBulkUploading] = useState(false)
  const [bulkUploadRestaurantId, setBulkUploadRestaurantId] = useState("")
  const [bulkUploadRestaurantSearch, setBulkUploadRestaurantSearch] = useState("")
  const [selectedFoodIds, setSelectedFoodIds] = useState(() => new Set())
  const [selectAllForRestaurant, setSelectAllForRestaurant] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const ensureActionAccess = (action) => {
    if (canCurrentAdminAction(action)) return true
    toast.error("Insufficient permissions for this action")
    return false
  }

  const withImageVersion = (url) => {
    if (!url || typeof url !== "string") return FOOD_FALLBACK_IMAGE
    return `${url}${url.includes("?") ? "&" : "?"}v=${imageVersion}`
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim())
    }, 300)

    return () => window.clearTimeout(timeoutId)
  }, [searchQuery])

  const fetchRestaurantsForFilter = useCallback(async () => {
    try {
      const restaurantsResponse = await adminAPI.getRestaurants({ limit: 1000 })
      const list =
        restaurantsResponse?.data?.data?.restaurants ||
        restaurantsResponse?.data?.restaurants ||
        []

      const restaurantsMap = new Map()
      ;(Array.isArray(list) ? list : []).forEach((restaurant) => {
        const restaurantId = getEntityId(restaurant)
        if (!restaurantId || restaurantsMap.has(restaurantId)) return
        restaurantsMap.set(restaurantId, {
          id: restaurantId,
          name: getRestaurantName(restaurant) || "Unknown Restaurant",
        })
      })

      setRestaurantsForFilter(
        Array.from(restaurantsMap.values()).sort((a, b) => a.name.localeCompare(b.name))
      )
    } catch (error) {
      debugError("Error fetching restaurants:", error)
      setRestaurantsForFilter([])
    }
  }, [])

  useEffect(() => {
    fetchRestaurantsForFilter()
  }, [fetchRestaurantsForFilter])

  const fetchAllFoods = useCallback(async () => {
    try {
      setLoading(true)

      const params = { page: currentPage, limit: pageSize }
      if (selectedRestaurant !== "all") params.restaurantId = selectedRestaurant
      if (debouncedSearchQuery) params.search = debouncedSearchQuery

      const foodsRes = await adminAPI.getFoods(params)
      const list = foodsRes?.data?.data?.foods || []
      const total = Number(foodsRes?.data?.data?.total ?? foodsRes?.data?.total ?? 0)
      const normalizedFoods = Array.isArray(list)
        ? list.map((f) => ({
            id: String(f.id || f._id || ""),
            _id: f._id || f.id,
            name: f.name || "Unnamed Item",
            image: f.image || FOOD_FALLBACK_IMAGE,
            status: f.isAvailable !== false && String(f.approvalStatus || "").toLowerCase() !== "rejected",
            restaurantId: getEntityId(f.restaurantId || f.restaurant?._id || f.restaurant),
            restaurantName:
              f.restaurantName ||
              getRestaurantName(f.restaurant) ||
              "Unknown Restaurant",
            categoryId: String(f.categoryId || ""),
            categoryName: f.categoryName || "",
            price: getFoodDisplayPrice(f),
            otherPrice: getFoodDisplayOtherPrice(f),
            variants: getFoodVariants(f),
            foodType: f.foodType || "Non-Veg",
            approvalStatus: f.approvalStatus || "approved",
            description: f.description || "",
            preparationTime: f.preparationTime || "",
            isAvailable: f.isAvailable !== false,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
          }))
        : []

      setFoods(normalizedFoods)
      setTotalFoods(Number.isFinite(total) ? total : normalizedFoods.length)
      setImageVersion(Date.now())
      setRestaurantsForFilter((prev) => {
        const restaurantsMap = new Map((Array.isArray(prev) ? prev : []).map((restaurant) => [restaurant.id, restaurant]))
        normalizedFoods.forEach((food) => {
          const restaurantId = getEntityId(food.restaurantId)
          if (!restaurantId || restaurantsMap.has(restaurantId)) return
          restaurantsMap.set(restaurantId, {
            id: restaurantId,
            name: food.restaurantName || "Unknown Restaurant",
          })
        })
        return Array.from(restaurantsMap.values()).sort((a, b) => a.name.localeCompare(b.name))
      })
    } catch (error) {
      debugError("Error fetching foods:", error)
      toast.error("Failed to load foods")
      setFoods([])
      setTotalFoods(0)
    } finally {
      setLoading(false)
    }
  }, [currentPage, pageSize, selectedRestaurant, debouncedSearchQuery])

  useEffect(() => {
    fetchAllFoods()
  }, [fetchAllFoods])

  const [searchParams] = useSearchParams()
  const productIdFromUrl = searchParams.get("productId")

  useEffect(() => {
    if (productIdFromUrl && foods.length > 0) {
      const food = foods.find(f => f.id === productIdFromUrl || f._id === productIdFromUrl)
      if (food) {
        handleViewDetails(food)
      }
    }
  }, [productIdFromUrl, foods])

  // Format ID to FOOD format (e.g., FOOD519399)
  const formatFoodId = (id) => {
    if (!id) return "FOOD000000"
    
    const idString = String(id)
    // Extract last 6 digits from the ID
    // Handle formats like "1768285554154-0.703896654519399" or "item-1768285554154-0.703896654519399"
    const parts = idString.split(/[-.]/)
    let lastDigits = ""
    
    // Get the last part and extract digits
    if (parts.length > 0) {
      const lastPart = parts[parts.length - 1]
      // Extract only digits from the last part
      const digits = lastPart.match(/\d+/g)
      if (digits && digits.length > 0) {
        // Get last 6 digits from all digits found
        const allDigits = digits.join("")
        lastDigits = allDigits.slice(-6).padStart(6, "0")
      }
    }
    
    // If no digits found, use a hash of the ID
    if (!lastDigits) {
      const hash = idString.split("").reduce((acc, char) => {
        return ((acc << 5) - acc) + char.charCodeAt(0) | 0
      }, 0)
      lastDigits = Math.abs(hash).toString().slice(-6).padStart(6, "0")
    }
    
    return `FOOD${lastDigits}`
  }

  const totalPages = useMemo(() => {
    if (totalFoods === 0) return 1
    return Math.ceil(totalFoods / pageSize)
  }, [totalFoods, pageSize])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, selectedRestaurant, pageSize])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const restaurantOptions = useMemo(() => {
    return restaurantsForFilter
  }, [restaurantsForFilter])

  const filteredRestaurantOptions = useMemo(() => {
    const query = restaurantFilterSearch.trim().toLowerCase()
    if (!query) return restaurantOptions
    return restaurantOptions.filter((restaurant) =>
      restaurant.name.toLowerCase().includes(query)
    )
  }, [restaurantOptions, restaurantFilterSearch])

  const filteredBulkUploadRestaurants = useMemo(() => {
    const query = bulkUploadRestaurantSearch.trim().toLowerCase()
    if (!query) return restaurantOptions
    return restaurantOptions.filter((restaurant) =>
      restaurant.name.toLowerCase().includes(query)
    )
  }, [restaurantOptions, bulkUploadRestaurantSearch])

  const isRestaurantSelected = selectedRestaurant !== "all"
  const pageFoodIds = useMemo(() => foods.map((food) => food.id), [foods])
  const allPageSelected =
    pageFoodIds.length > 0 &&
    pageFoodIds.every((id) => selectAllForRestaurant || selectedFoodIds.has(id))
  const somePageSelected =
    !selectAllForRestaurant &&
    pageFoodIds.some((id) => selectedFoodIds.has(id))
  const selectedDeleteCount = selectAllForRestaurant ? totalFoods : selectedFoodIds.size

  useEffect(() => {
    setSelectedFoodIds(new Set())
    setSelectAllForRestaurant(false)
  }, [selectedRestaurant, debouncedSearchQuery])

  useEffect(() => {
    if (!selectAllForRestaurant) return
    setSelectedFoodIds(new Set())
  }, [currentPage, selectAllForRestaurant])

  const openAddFoodModal = () => {
    if (!ensureActionAccess("create")) return
    setFoodFormMode("add")
    setEditingFood(null)
    setFoodForm({
      ...createFoodForm(),
      restaurantId: selectedRestaurant !== "all" ? selectedRestaurant : "",
    })
    setSelectedImageFile(null)
    setImagePreviewUrl("")
    setCategorySearch("")
    setCategoryPopoverOpen(false)
    setShowFoodFormModal(true)
  }

  const openEditFoodModal = (food) => {
    if (!ensureActionAccess("edit")) return
    setFoodFormMode("edit")
    setEditingFood(food)
    setFoodForm({
      restaurantId: String(food.restaurantId || ""),
      categoryId: String(food.categoryId || ""),
      categoryName: String(food.categoryName || ""),
      name: String(food.name || ""),
      price: String(food.price || ""),
      otherPrice: String(food.otherPrice || ""),
      variants: getFoodVariants(food).map(createVariantDraft),
      description: String(food.description || ""),
      image: String(food.image || ""),
      foodType: String(food.foodType || "Non-Veg"),
      isAvailable: food.isAvailable !== false,
      preparationTime: String(food.preparationTime || ""),
    })
    setSelectedImageFile(null)
    setImagePreviewUrl(String(food.image || ""))
    setCategorySearch("")
    setCategoryPopoverOpen(false)
    setShowFoodFormModal(true)
  }

  useEffect(() => {
    if (!showFoodFormModal) {
      setCategoryOptions([])
      return
    }

    let cancelled = false

    const loadCategoryOptions = async () => {
      try {
        const res = await adminAPI.getCategories({ limit: 1000 })
        const list = res?.data?.data?.categories || []
        const options = Array.isArray(list)
          ? list
              .map((c) => ({ id: String(c.id || c._id || c.name), name: String(c.name || "").trim() }))
              .filter((c) => c.name)
          : []
        if (!cancelled) setCategoryOptions(options)
      } catch (error) {
        if (!cancelled) {
          setCategoryOptions([])
        }
      }
    }

    loadCategoryOptions()

    return () => {
      cancelled = true
    }
  }, [showFoodFormModal])

  const handleVariantChange = (variantId, field, value) => {
    setFoodForm((prev) => ({
      ...prev,
      variants: (Array.isArray(prev.variants) ? prev.variants : []).map((variant) =>
        variant.id === variantId ? { ...variant, [field]: value } : variant,
      ),
    }))
  }

  const handleAddVariant = () => {
    if (!ensureActionAccess(foodFormMode === "edit" ? "edit" : "create")) return
    setFoodForm((prev) => ({
      ...prev,
      variants: [...(Array.isArray(prev.variants) ? prev.variants : []), createVariantDraft()],
    }))
  }

  const handleRemoveVariant = (variantId) => {
    if (!ensureActionAccess(foodFormMode === "edit" ? "edit" : "create")) return
    setFoodForm((prev) => ({
      ...prev,
      variants: (Array.isArray(prev.variants) ? prev.variants : []).filter((variant) => variant.id !== variantId),
    }))
  }

  const handleFoodFormSubmit = async () => {
    if (!ensureActionAccess(foodFormMode === "edit" ? "edit" : "create")) return
    if (!foodForm.restaurantId) {
      toast.error("Please select a restaurant")
      return
    }
    if (!String(foodForm.categoryName || "").trim()) {
      toast.error("Please select or enter a category")
      return
    }
    if (!foodForm.name.trim()) {
      toast.error("Food name is required")
      return
    }

    const normalizedVariants = (Array.isArray(foodForm.variants) ? foodForm.variants : [])
      .map((variant) => ({
        id: String(variant?.id || variant?._id || "").trim(),
        name: String(variant?.name || "").trim(),
        price: Number(variant?.price),
        otherPrice: Number(variant?.otherPrice) || 0,
      }))
      .filter((variant) => variant.id || variant.name || variant.price)

    const hasVariants = normalizedVariants.length > 0
    const parsedPrice = Number(foodForm.price)
    const parsedOtherPrice = Number(foodForm.otherPrice) || 0

    if (normalizedVariants.some((variant) => !variant.name)) {
      toast.error("Each variant must have a name")
      return
    }

    if (normalizedVariants.some((variant) => !Number.isFinite(variant.price) || variant.price <= 0)) {
      toast.error("Each variant price must be greater than 0")
      return
    }

    if (!hasVariants && (!Number.isFinite(parsedPrice) || parsedPrice <= 0)) {
      toast.error("Base price must be greater than 0")
      return
    }

    if (!hasVariants && parsedOtherPrice > 0 && parsedOtherPrice <= parsedPrice) {
      toast.error("Other platform price should be greater than selling price")
      return
    }

    try {
      setSubmittingFood(true)
      let imageUrl = foodForm.image.trim()

      if (selectedImageFile) {
        const uploadResponse = await uploadAPI.uploadMedia(selectedImageFile, {
          folder: "foods",
        })
        imageUrl =
          uploadResponse?.data?.data?.url ||
          uploadResponse?.data?.url ||
          imageUrl
      }

      const payload = {
        restaurantId: foodForm.restaurantId,
        categoryId: foodForm.categoryId || undefined,
        categoryName: String(foodForm.categoryName || "").trim(),
        name: foodForm.name.trim(),
        price: hasVariants ? undefined : parsedPrice,
        otherPrice: hasVariants ? 0 : parsedOtherPrice,
        variants: normalizedVariants.map((variant) => ({
          ...(variant.id && !variant.id.startsWith("variant-") ? { _id: variant.id } : {}),
          name: variant.name,
          price: variant.price,
          otherPrice: variant.otherPrice > 0 ? variant.otherPrice : 0,
        })),
        description: foodForm.description.trim(),
        image: imageUrl,
        foodType: foodForm.foodType === "Veg" ? "Veg" : "Non-Veg",
        isAvailable: foodForm.isAvailable !== false,
        preparationTime: String(foodForm.preparationTime || "").trim(),
      }

      if (foodFormMode === "edit") {
        await adminAPI.updateFood(editingFood?._id || editingFood?.id, payload)
      } else {
        await adminAPI.createFood(payload)
      }
      toast.success(foodFormMode === "edit" ? "Food updated successfully" : "Food added successfully")
      setShowFoodFormModal(false)
      setEditingFood(null)
      setFoodForm(createFoodForm())
      setSelectedImageFile(null)
      setImagePreviewUrl("")
      await fetchAllFoods()
    } catch (error) {
      debugError("Error saving food:", error)
      toast.error(error?.response?.data?.message || "Failed to save food")
    } finally {
      setSubmittingFood(false)
    }
  }

  const handleDelete = async (id) => {
    if (!ensureActionAccess("delete")) return
    const food = foods.find(f => f.id === id)
    if (!food) return

    if (!window.confirm(`Are you sure you want to delete "${food.name}"? This action cannot be undone.`)) {
      return
    }

    try {
      setDeleting(true)
      await adminAPI.deleteFood(food?._id || food?.id)
      await fetchAllFoods()
      toast.success("Food item deleted successfully")
    } catch (error) {
      debugError("Error deleting food:", error)
      toast.error(error?.response?.data?.message || "Failed to delete food item")
    } finally {
      setDeleting(false)
    }
  }

  const openBulkUploadModal = () => {
    if (!ensureActionAccess("create")) return
    setBulkUploadRestaurantId(selectedRestaurant !== "all" ? selectedRestaurant : "")
    setBulkUploadRestaurantSearch("")
    setBulkUploadFile(null)
    setBulkUploadResults(null)
    setIsBulkUploadModalOpen(true)
  }

  const handleDownloadBulkTemplate = async () => {
    try {
      const response = await adminAPI.bulkUploadTemplate()
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement("a")
      link.href = url
      link.setAttribute("download", "Bulk_Menu_Template.xlsx")
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success("Template downloaded successfully")
    } catch (error) {
      debugError("Error downloading template:", error)
      toast.error("Failed to download template")
    }
  }

  const handleBulkUpload = async () => {
    if (!bulkUploadRestaurantId) {
      toast.error("Please select a restaurant first")
      return
    }
    if (!bulkUploadFile) {
      toast.error("Please select an Excel file first")
      return
    }

    try {
      setIsBulkUploading(true)
      const response = await adminAPI.bulkUploadFoods(bulkUploadRestaurantId, bulkUploadFile)
      if (response.data?.success) {
        const results = response.data.data || {}
        const normalizedErrors = Array.isArray(results.errors)
          ? results.errors
          : Array.isArray(results.details)
            ? results.details
            : []
        const normalizedResults = { ...results, errors: normalizedErrors }
        setBulkUploadResults(normalizedResults)
        toast.info(`Processed ${(normalizedResults.success || 0) + (normalizedResults.failed || 0)} items`)
        if (normalizedResults.success > 0) {
          await fetchAllFoods()
        }
      }
    } catch (error) {
      debugError("Error uploading menu:", error)
      toast.error(error?.response?.data?.message || "Bulk upload failed")
    } finally {
      setIsBulkUploading(false)
    }
  }

  const onBulkFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size exceeds 10MB limit")
      return
    }
    setBulkUploadFile(file)
  }

  const toggleFoodSelection = (foodId) => {
    if (selectAllForRestaurant) {
      setSelectAllForRestaurant(false)
      setSelectedFoodIds(new Set(pageFoodIds.filter((id) => id !== foodId)))
      return
    }
    setSelectedFoodIds((prev) => {
      const next = new Set(prev)
      if (next.has(foodId)) next.delete(foodId)
      else next.add(foodId)
      return next
    })
  }

  const toggleSelectAllPage = () => {
    if (allPageSelected) {
      setSelectAllForRestaurant(false)
      setSelectedFoodIds(new Set())
      return
    }
    setSelectAllForRestaurant(false)
    setSelectedFoodIds(new Set(pageFoodIds))
  }

  const handleSelectAllForRestaurant = () => {
    setSelectAllForRestaurant(true)
    setSelectedFoodIds(new Set())
  }

  const handleBulkDelete = async () => {
    if (!ensureActionAccess("delete")) return
    if (!isRestaurantSelected) {
      toast.error("Select a restaurant to bulk delete items")
      return
    }
    if (selectedDeleteCount === 0) {
      toast.error("Select at least one food item")
      return
    }

    const restaurantName =
      restaurantOptions.find((restaurant) => restaurant.id === selectedRestaurant)?.name ||
      "this restaurant"

    if (
      !window.confirm(
        `Delete ${selectedDeleteCount} food item(s) from ${restaurantName}? This cannot be undone.`
      )
    ) {
      return
    }

    try {
      setIsBulkDeleting(true)
      const response = await adminAPI.bulkDeleteFoods({
        restaurantId: selectedRestaurant,
        selectAll: selectAllForRestaurant,
        foodIds: selectAllForRestaurant ? [] : Array.from(selectedFoodIds),
        search: selectAllForRestaurant ? debouncedSearchQuery : undefined,
      })
      const deletedCount = response?.data?.data?.deletedCount ?? selectedDeleteCount
      toast.success(`Deleted ${deletedCount} food item(s)`)
      setSelectedFoodIds(new Set())
      setSelectAllForRestaurant(false)
      await fetchAllFoods()
    } catch (error) {
      debugError("Error bulk deleting foods:", error)
      toast.error(error?.response?.data?.message || "Failed to delete selected foods")
    } finally {
      setIsBulkDeleting(false)
    }
  }

  const handleViewDetails = (food) => {
    setSelectedFood(food)
    setShowDetailModal(true)
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Header Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center">
            <div className="grid grid-cols-2 gap-0.5">
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
              <div className="w-2 h-2 bg-white rounded-sm"></div>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Food</h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">Food List</h2>
            <span className="px-3 py-1 rounded-full text-sm font-semibold bg-slate-100 text-slate-700">
              {totalFoods}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={openAddFoodModal}
              className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Food</span>
            </button>
            <button
              type="button"
              onClick={openBulkUploadModal}
              className="px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 inline-flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              <span>Bulk Upload</span>
            </button>
            {isRestaurantSelected && selectedDeleteCount > 0 && (
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {isBulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Delete Selected ({selectedDeleteCount})</span>
              </button>
            )}
            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <input
                type="text"
                placeholder="Ex : Foods"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2.5 w-full text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
            <div className="flex flex-col gap-2 min-w-[240px]">
              <input
                type="text"
                placeholder="Search restaurant..."
                value={restaurantFilterSearch}
                onChange={(e) => setRestaurantFilterSearch(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              />
              <select
                value={selectedRestaurant}
                onChange={(e) => setSelectedRestaurant(e.target.value)}
                className="px-4 py-2.5 min-w-[240px] text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-400"
              >
                <option value="all">All Restaurants</option>
                {filteredRestaurantOptions.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isRestaurantSelected && allPageSelected && totalFoods > foods.length && !selectAllForRestaurant && (
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-800 flex flex-wrap items-center gap-2">
            <span>All {foods.length} items on this page are selected.</span>
            <button
              type="button"
              onClick={handleSelectAllForRestaurant}
              className="font-semibold underline hover:text-blue-900"
            >
              Select all {totalFoods} items for this restaurant
              {debouncedSearchQuery ? " matching your search" : ""}
            </button>
          </div>
        )}
        {isRestaurantSelected && selectAllForRestaurant && (
          <div className="px-6 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-800 flex flex-wrap items-center gap-2">
            <span>All {totalFoods} items are selected for bulk delete.</span>
            <button
              type="button"
              onClick={() => {
                setSelectAllForRestaurant(false)
                setSelectedFoodIds(new Set())
              }}
              className="font-semibold underline hover:text-blue-900"
            >
              Clear selection
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {isRestaurantSelected && (
                  <th className="px-4 py-4 text-left">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      ref={(input) => {
                        if (input) input.indeterminate = somePageSelected && !allPageSelected
                      }}
                      onChange={toggleSelectAllPage}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      aria-label="Select all on page"
                    />
                  </th>
                )}
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  SL
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Image
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Restaurant
                </th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={isRestaurantSelected ? 7 : 6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                      <p className="text-sm text-slate-500">Loading foods...</p>
                    </div>
                  </td>
                </tr>
              ) : foods.length === 0 ? (
                <tr>
                  <td colSpan={isRestaurantSelected ? 7 : 6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <p className="text-lg font-semibold text-slate-700 mb-1">No Data Found</p>
                      <p className="text-sm text-slate-500">No food items match your search or restaurant filter</p>
                    </div>
                  </td>
                </tr>
              ) : (
                foods.map((food, index) => (
                  <tr
                    key={food.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    {isRestaurantSelected && (
                      <td className="px-4 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectAllForRestaurant || selectedFoodIds.has(food.id)}
                          onChange={() => toggleFoodSelection(food.id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          aria-label={`Select ${food.name}`}
                        />
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-slate-700">{(currentPage - 1) * pageSize + index + 1}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
                        <img
                          src={withImageVersion(food.image)}
                          alt={food.name}
                          className="w-full h-full object-cover"
                          key={`${food.id}-${imageVersion}`}
                          loading="lazy"
                          onError={(e) => {
                            e.target.src = FOOD_FALLBACK_IMAGE
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-900">{food.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-800">{food.restaurantName || "-"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-800">{food.categoryName || "-"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleViewDetails(food)}
                          className="p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditFoodModal(food)}
                          className="p-1.5 rounded text-amber-600 hover:bg-amber-50 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(food.id)}
                          disabled={deleting}
                          className="p-1.5 rounded text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete"
                        >
                          {deleting ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!loading && totalFoods > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50">
            <div className="text-sm text-slate-600">
              Showing{" "}
              <span className="font-semibold text-slate-800">{(currentPage - 1) * pageSize + 1}</span>
              {" "}to{" "}
              <span className="font-semibold text-slate-800">
                {Math.min((currentPage - 1) * pageSize + foods.length, totalFoods)}
              </span>
              {" "}of{" "}
              <span className="font-semibold text-slate-800">{totalFoods}</span>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-2.5 py-1.5 text-sm rounded-md border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
              >
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>

              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>

              <span className="px-3 py-1.5 text-sm font-medium text-slate-700">
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-lg font-semibold text-slate-900">Food Details</DialogTitle>
          </DialogHeader>
          {selectedFood && (
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <img
                          src={withImageVersion(selectedFood.image)}
                          alt={selectedFood.name}
                          className="w-20 h-20 rounded-xl object-cover border border-slate-200"
                  onError={(e) => {
                    e.target.src = FOOD_FALLBACK_IMAGE
                  }}
                />
                <div>
                  <p className="text-lg font-semibold text-slate-900">{selectedFood.name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">ID #{formatFoodId(selectedFood.id)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p><span className="font-semibold text-slate-700">Restaurant:</span> <span className="text-slate-900">{selectedFood.restaurantName || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Price:</span> <span className="text-slate-900">{selectedFood.variants?.length ? `Starting from \u20B9${selectedFood.price}` : `\u20B9${selectedFood.price}`}</span></p>
                <p><span className="font-semibold text-slate-700">Category:</span> <span className="text-slate-900">{selectedFood.categoryName || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Food Type:</span> <span className="text-slate-900">{selectedFood.foodType || "-"}</span></p>
                <p><span className="font-semibold text-slate-700">Approval:</span> <span className="text-slate-900 capitalize">{selectedFood.approvalStatus || "-"}</span></p>
              </div>
              {selectedFood.variants?.length ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-800 mb-2">Variants</p>
                  <div className="space-y-2">
                    {selectedFood.variants.map((variant) => (
                      <div key={variant.id || variant._id} className="flex items-center justify-between text-sm text-slate-700">
                        <span>{variant.name}</span>
                        <span className="font-semibold text-slate-900">{"\u20B9"}{variant.price}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedFood.description && (
                <p className="text-sm text-slate-700 leading-relaxed">
                  <span className="font-semibold text-slate-800">Description:</span> {selectedFood.description}
                </p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showFoodFormModal}
        onOpenChange={(open) => {
          setShowFoodFormModal(open)
          if (!open) {
            setEditingFood(null)
            setFoodForm(createFoodForm())
            setCategoryOptions([])
            setCategorySearch("")
            setCategoryPopoverOpen(false)
            setSelectedImageFile(null)
            setImagePreviewUrl("")
          }
        }}
      >
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-lg font-semibold text-slate-900">
              {foodFormMode === "edit" ? "Edit Food" : "Add Food"}
            </DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Restaurant</label>
                <select
                  value={foodForm.restaurantId}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, restaurantId: e.target.value, categoryId: "", categoryName: "" }))}
                  disabled={foodFormMode === "edit"}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-100"
                >
                  <option value="">Select restaurant</option>
                  {restaurantOptions.map((restaurant) => (
                    <option key={restaurant.id} value={restaurant.id}>
                      {restaurant.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <Popover open={categoryPopoverOpen} onOpenChange={setCategoryPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white text-left flex items-center justify-between"
                    >
                      <span className={foodForm.categoryName ? "text-slate-900" : "text-slate-400"}>
                        {foodForm.categoryName || "Select category"}
                      </span>
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
                    <input
                      type="text"
                      value={categorySearch}
                      onChange={(e) => setCategorySearch(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white mb-2"
                      placeholder="Search category..."
                      autoFocus
                    />
                    <div className="max-h-56 overflow-y-auto">
                      {categoryOptions
                        .filter((c) => {
                          const q = String(categorySearch || "").trim().toLowerCase()
                          if (!q) return true
                          return String(c.name || "").toLowerCase().includes(q)
                        })
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setFoodForm((prev) => ({ ...prev, categoryId: c.id, categoryName: c.name }))
                              setCategoryPopoverOpen(false)
                            }}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm hover:bg-slate-100 ${
                              String(foodForm.categoryName || "") === String(c.name) ? "bg-slate-100 font-medium" : ""
                            }`}
                          >
                            {c.name}
                          </button>
                        ))}
                      {categoryOptions.length === 0 && (
                        <div className="px-3 py-2 text-sm text-slate-500">No categories found</div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Food Name</label>
                <input
                  type="text"
                  value={foodForm.name}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Base Price</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={foodForm.price}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, price: e.target.value }))}
                  disabled={(foodForm.variants || []).length > 0}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400"
                />
                {(foodForm.variants || []).length > 0 ? (
                  <p className="mt-1 text-xs text-slate-500">Variants are active, so customers will see the lowest variant price as the starting price.</p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Other Platform Price</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={foodForm.otherPrice}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, otherPrice: e.target.value }))}
                  disabled={(foodForm.variants || []).length > 0}
                  placeholder="Optional"
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400"
                />
                <p className="mt-1 text-xs text-slate-500">Shown with strikethrough when higher than selling price.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Food Type</label>
                <select
                  value={foodForm.foodType}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, foodType: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                >
                  <option value="Veg">Veg</option>
                  <option value="Non-Veg">Non-Veg</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Upload Image</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    setSelectedImageFile(file)
                    if (file) {
                      setImagePreviewUrl(URL.createObjectURL(file))
                    } else {
                      setImagePreviewUrl(foodForm.image.trim())
                    }
                  }}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Timing</label>
                <div className="relative">
                  <select
                  value={foodForm.preparationTime}
                  onChange={(e) => setFoodForm((prev) => ({ ...prev, preparationTime: e.target.value }))}
                    className="w-full px-3 py-2.5 pr-10 border border-slate-300 rounded-lg text-sm bg-white appearance-none"
                  >
                    <option value="">Select timing</option>
                    <option value="10-20 mins">10-20 mins</option>
                    <option value="20-25 mins">20-25 mins</option>
                    <option value="25-35 mins">25-35 mins</option>
                    <option value="35-45 mins">35-45 mins</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>
              {imagePreviewUrl ? (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Image Preview</label>
                  <div className="w-28 h-28 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                    <img
                      src={imagePreviewUrl}
                      alt="Food preview"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              ) : null}
              <div className="flex items-center gap-6 pt-7">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={foodForm.isAvailable}
                    onChange={(e) => setFoodForm((prev) => ({ ...prev, isAvailable: e.target.checked }))}
                  />
                  Available
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                rows={4}
                value={foodForm.description}
                onChange={(e) => setFoodForm((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white resize-none"
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Variants</p>
                  <p className="text-xs text-slate-500">Optional. Add multiple names and prices such as Half, Full, Small, or Large.</p>
                </div>
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add variant
                </button>
              </div>
              {(foodForm.variants || []).length ? (
                <div className="space-y-3">
                  {(foodForm.variants || []).map((variant, index) => (
                    <div key={variant.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-slate-200 bg-white p-3">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Variant name</label>
                          <input
                            type="text"
                            value={variant.name}
                            onChange={(e) => handleVariantChange(variant.id, "name", e.target.value)}
                            placeholder={index === 0 ? "Full" : "Half"}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Variant price</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={variant.price}
                            onChange={(e) => handleVariantChange(variant.id, "price", e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Other price</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={variant.otherPrice}
                            onChange={(e) => handleVariantChange(variant.id, "otherPrice", e.target.value)}
                            placeholder="Optional"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(variant.id)}
                        className="self-start rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-500"
                        aria-label="Remove variant"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No variants added. This food will use the single base price.</p>
              )}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleFoodFormSubmit}
                disabled={submittingFood}
                className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 inline-flex items-center gap-2"
              >
                {submittingFood ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{submittingFood ? "Saving..." : foodFormMode === "edit" ? "Update Food" : "Add Food"}</span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkUploadModalOpen} onOpenChange={(open) => {
        if (!isBulkUploading) setIsBulkUploadModalOpen(open)
      }}>
        <DialogContent className="max-w-xl p-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-lg font-semibold text-slate-900">Bulk Menu Upload</DialogTitle>
          </DialogHeader>
          <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
            {!bulkUploadResults ? (
              <>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-4">
                  <div className="bg-blue-100 p-2 rounded-lg shrink-0">
                    <Download className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">Step 1: Download Template</p>
                    <p className="text-xs text-slate-600 mt-1">Use the Excel template to add menu items in bulk.</p>
                    <button
                      type="button"
                      onClick={handleDownloadBulkTemplate}
                      className="mt-3 px-3 py-2 rounded-lg bg-white border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-100"
                    >
                      Download Template
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-900">Step 2: Select Restaurant</label>
                  <input
                    type="text"
                    placeholder="Search restaurant..."
                    value={bulkUploadRestaurantSearch}
                    onChange={(e) => setBulkUploadRestaurantSearch(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                  <select
                    value={bulkUploadRestaurantId}
                    onChange={(e) => setBulkUploadRestaurantId(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
                  >
                    <option value="">Choose a restaurant</option>
                    {filteredBulkUploadRestaurants.map((restaurant) => (
                      <option key={restaurant.id} value={restaurant.id}>
                        {restaurant.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-900">Step 3: Upload Excel File</label>
                  <label
                    className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                      bulkUploadFile ? "border-emerald-400 bg-emerald-50" : "border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/30"
                    }`}
                  >
                    <FileUp className={`w-8 h-8 mb-2 ${bulkUploadFile ? "text-emerald-500" : "text-slate-400"}`} />
                    <span className="text-sm text-slate-600 px-4 text-center">
                      {bulkUploadFile ? bulkUploadFile.name : "Click to select Excel file (.xlsx)"}
                    </span>
                    <input type="file" accept=".xlsx,.xls" onChange={onBulkFileChange} className="hidden" />
                  </label>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsBulkUploadModalOpen(false)}
                    disabled={isBulkUploading}
                    className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleBulkUpload}
                    disabled={!bulkUploadRestaurantId || !bulkUploadFile || isBulkUploading}
                    className="px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 inline-flex items-center gap-2"
                  >
                    {isBulkUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    <span>{isBulkUploading ? "Uploading..." : "Start Bulk Upload"}</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4 text-center">
                    <div className="text-2xl font-bold text-emerald-700">{bulkUploadResults.success || 0}</div>
                    <div className="text-sm text-emerald-600">Successful</div>
                  </div>
                  <div className="rounded-xl bg-rose-50 border border-rose-100 p-4 text-center">
                    <div className="text-2xl font-bold text-rose-700">{bulkUploadResults.failed || 0}</div>
                    <div className="text-sm text-rose-600">Failed</div>
                  </div>
                </div>

                {bulkUploadResults.errors?.length > 0 && (
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-700">
                      Errors
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {bulkUploadResults.errors.map((err, idx) => (
                        <div key={`${err.row}-${idx}`} className="px-4 py-2 text-sm text-slate-700">
                          <span className="font-medium">Row {err.row}:</span> {err.item ? `${err.item} - ` : ""}{err.error}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsBulkUploadModalOpen(false)
                      setBulkUploadFile(null)
                      setBulkUploadResults(null)
                    }}
                    className="px-4 py-2.5 rounded-lg bg-slate-900 text-white text-sm font-medium hover:bg-slate-800"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
