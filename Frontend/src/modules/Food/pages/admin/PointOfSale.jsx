import { useState, useEffect, useRef } from 'react'
import { Search, TrendingUp, ShoppingCart, XCircle, Star, Calendar, BarChart3, Users, Package, Clock, CreditCard, ChevronDown, Check, Store } from 'lucide-react'
import { adminAPI } from '@food/api'
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}

const EMPTY_SUBSCRIPTION_SUMMARY = {
  plan: '',
  planLabel: 'Not billed yet',
  cycleFee: 0,
  status: 'paid',
  statusLabel: 'No outstanding dues',
  currentBillingMonth: '',
  currentMonthGmv: 0,
  lastBilledMonth: null,
  dueAmount: 0,
  paidAmount: 0,
  totalBilled: 0,
  totalWaived: 0,
  totalCollected: 0,
  walletDeductionsTotal: 0,
  invoiceCount: 0,
  invoices: [],
  lastPayment: null,
}

const formatSubscriptionPaymentLabel = (eventType = '') => {
  const key = String(eventType || '').toLowerCase()
  if (key === 'wallet_deduction') return 'Deducted from wallet'
  if (key === 'manual_payment') return 'Manual payment recorded'
  if (key === 'waiver') return 'Due waived'
  if (key === 'adjustment') return 'Manual adjustment'
  if (key === 'invoice_generated') return 'Monthly invoice generated'
  if (key === 'legacy_carryforward') return 'Legacy balance carried forward'
  return 'Subscription payment'
}

export default function PointOfSale() {
  const [restaurants, setRestaurants] = useState([])
  const [selectedRestaurant, setSelectedRestaurant] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [restaurantData, setRestaurantData] = useState(null)
  const [paymentSummary, setPaymentSummary] = useState(null)
  const [subscriptionSummary, setSubscriptionSummary] = useState(EMPTY_SUBSCRIPTION_SUMMARY)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [showPickerDropdown, setShowPickerDropdown] = useState(false)
  const [pickerFilter, setPickerFilter] = useState('')
  const pickerDropdownRef = useRef(null)

  const getRestaurantName = (restaurant) => {
    return String(
      restaurant?.restaurantName ||
      restaurant?.name ||
      restaurant?.restaurant?.name ||
      restaurant?.restaurant?.restaurantName ||
      '',
    ).trim()
  }

  const getRestaurantCode = (restaurant) => {
    return String(
      restaurant?.restaurantId ||
      restaurant?.restaurantCode ||
      restaurant?.restaurant?.restaurantId ||
      restaurant?._id ||
      '',
    ).trim()
  }

  const normalizeRestaurants = (rawList) => {
    if (!Array.isArray(rawList)) return []

    return rawList
      .map((restaurant) => {
        const id = String(
          restaurant?._id ||
          restaurant?.id ||
          restaurant?.restaurant?._id ||
          restaurant?.restaurantId ||
          '',
        ).trim()
        if (!id) return null

        const resolvedName = getRestaurantName(restaurant) || `Restaurant ${id.slice(-6)}`
        const resolvedCode = getRestaurantCode(restaurant) || `REST${id.slice(-6).padStart(6, '0')}`

        return {
          ...restaurant,
          _id: id,
          name: resolvedName,
          restaurantId: resolvedCode,
        }
      })
      .filter(Boolean)
  }

  // Default analytics shape before the API responds
  const [analyticsData, setAnalyticsData] = useState({
    totalOrders: 0,
    cancelledOrders: 0,
    notDeliveredOrders: 0,
    explicitlyCancelledOrders: 0,
    inProgressOrders: 0,
    cancelledByRestaurant: 0,
    cancelledByAdmin: 0,
    cancelledByUser: 0,
    completedOrders: 0,
    averageRating: 0,
    totalRatings: 0,
    monthlyProfit: 0,
    yearlyProfit: 0,
    averageOrderValue: 0,
    totalRevenue: 0,
    restaurantEarning: 0,
    restaurantProfit: 0,
    monthlyOrders: 0,
    yearlyOrders: 0,
    averageMonthlyProfit: 0,
    averageYearlyProfit: 0,
    status: 'active',
    joinDate: '',
    totalCustomers: 0,
    repeatCustomers: 0,
    cancellationRate: 0,
    completionRate: 0,
    inProgressRate: 0
  })

  // Fetch restaurants list
  useEffect(() => {
    fetchRestaurants()
  }, [])

  useEffect(() => {
    if (!showPickerDropdown) return undefined

    const handleClickOutside = (event) => {
      if (pickerDropdownRef.current && !pickerDropdownRef.current.contains(event.target)) {
        setShowPickerDropdown(false)
        setPickerFilter('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPickerDropdown])

  // Fetch restaurant analytics when restaurant is selected
  useEffect(() => {
    if (selectedRestaurant) {
      fetchRestaurantAnalytics(selectedRestaurant)
    } else {
      setRestaurantData(null)
      setPaymentSummary(null)
      setSubscriptionSummary(EMPTY_SUBSCRIPTION_SUMMARY)
      setAnalyticsData({
        totalOrders: 0,
        cancelledOrders: 0,
        notDeliveredOrders: 0,
        explicitlyCancelledOrders: 0,
        inProgressOrders: 0,
        cancelledByRestaurant: 0,
        cancelledByAdmin: 0,
        cancelledByUser: 0,
        completedOrders: 0,
        averageRating: 0,
        totalRatings: 0,
        monthlyProfit: 0,
        yearlyProfit: 0,
        averageOrderValue: 0,
        totalRevenue: 0,
        restaurantEarning: 0,
        restaurantProfit: 0,
        monthlyOrders: 0,
        yearlyOrders: 0,
        averageMonthlyProfit: 0,
        averageYearlyProfit: 0,
        status: 'active',
        joinDate: '',
        totalCustomers: 0,
        repeatCustomers: 0,
        cancellationRate: 0,
        completionRate: 0,
        inProgressRate: 0
      })
    }
  }, [selectedRestaurant])

  const fetchRestaurants = async () => {
    try {
      setLoading(true)
      const response = await adminAPI.getApprovedRestaurants({
        limit: 1000,
        page: 1,
      })

      const body = response?.data
      const data = body?.data
      const rawRestaurants = Array.isArray(data?.restaurants)
        ? data.restaurants
        : Array.isArray(data)
          ? data
          : Array.isArray(body?.restaurants)
            ? body.restaurants
            : []

      if (body?.success !== false) {
        setRestaurants(normalizeRestaurants(rawRestaurants))
      } else {
        setRestaurants([])
      }
    } catch (error) {
      debugError('Error fetching restaurants:', error)
      setRestaurants([])
    } finally {
      setLoading(false)
    }
  }

  const fetchRestaurantAnalytics = async (restaurantId) => {
    try {
      setLoading(true)
      
      // Validate restaurantId
      if (!restaurantId) {
        debugError('Restaurant ID is required')
        return
      }
      
      debugLog('Fetching analytics for restaurant:', restaurantId)
      
      // Fetch comprehensive restaurant analytics from backend
      const analyticsResponse = await adminAPI.getRestaurantAnalytics(restaurantId)
      
      debugLog('Analytics response:', analyticsResponse)
      
      if (analyticsResponse?.data?.success && analyticsResponse.data.data) {
        const { restaurant, analytics, paymentSummary: apiPaymentSummary, subscriptionSummary: apiSubscriptionSummary } = analyticsResponse.data.data
        
        setRestaurantData(restaurant)
        setPaymentSummary(apiPaymentSummary || null)
        setSubscriptionSummary({
          ...EMPTY_SUBSCRIPTION_SUMMARY,
          ...(apiSubscriptionSummary || {}),
        })
        
        setAnalyticsData({
          totalOrders: Number(analytics.totalOrders) || 0,
          cancelledOrders: Number(analytics.cancelledOrders ?? analytics.explicitlyCancelledOrders) || 0,
          notDeliveredOrders: Number(analytics.notDeliveredOrders) || 0,
          explicitlyCancelledOrders: Number(analytics.explicitlyCancelledOrders ?? analytics.cancelledOrders) || 0,
          inProgressOrders: Number(analytics.inProgressOrders) || 0,
          cancelledByRestaurant: Number(analytics.cancelledByRestaurant) || 0,
          cancelledByAdmin: Number(analytics.cancelledByAdmin) || 0,
          cancelledByUser: Number(analytics.cancelledByUser) || 0,
          completedOrders: Number(analytics.completedOrders) || 0,
          averageRating: Number(analytics.averageRating) || 0,
          totalRatings: Number(analytics.totalRatings) || 0,
          monthlyProfit: analytics.monthlyProfit || 0,
          yearlyProfit: analytics.yearlyProfit || 0,
          averageOrderValue: analytics.averageOrderValue || 0,
          totalRevenue: analytics.totalRevenue || 0,
          restaurantEarning: analytics.restaurantEarning || 0,
          restaurantProfit: analytics.restaurantProfit || 0,
          monthlyOrders: analytics.monthlyOrders || 0,
          yearlyOrders: analytics.yearlyOrders || 0,
          averageMonthlyProfit: analytics.averageMonthlyProfit || 0,
          averageYearlyProfit: analytics.averageYearlyProfit || 0,
          status: analytics.status || 'inactive',
          joinDate: analytics.joinDate || restaurant.createdAt || new Date(),
          totalCustomers: analytics.totalCustomers || 0,
          repeatCustomers: analytics.repeatCustomers || 0,
          cancellationRate: analytics.cancellationRate || 0,
          completionRate: analytics.completionRate || 0,
          inProgressRate: analytics.inProgressRate || 0
        })
      } else {
        // Fallback to empty data if API fails
        setPaymentSummary(null)
        setSubscriptionSummary(EMPTY_SUBSCRIPTION_SUMMARY)
        setAnalyticsData({
          totalOrders: 0,
          cancelledOrders: 0,
          notDeliveredOrders: 0,
          explicitlyCancelledOrders: 0,
          inProgressOrders: 0,
          cancelledByRestaurant: 0,
          cancelledByAdmin: 0,
          cancelledByUser: 0,
          completedOrders: 0,
          averageRating: 0,
          totalRatings: 0,
          monthlyProfit: 0,
          yearlyProfit: 0,
          averageOrderValue: 0,
          totalRevenue: 0,
          restaurantEarning: 0,
          restaurantProfit: 0,
          monthlyOrders: 0,
          yearlyOrders: 0,
          averageMonthlyProfit: 0,
          averageYearlyProfit: 0,
          status: 'inactive',
          joinDate: new Date(),
          totalCustomers: 0,
          repeatCustomers: 0,
          cancellationRate: 0,
          completionRate: 0,
          inProgressRate: 0
        })
      }
    } catch (error) {
      debugError('Error fetching restaurant analytics:', error)
      debugError('Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        restaurantId: selectedRestaurant
      })
      
      // Show user-friendly error message
      if (error?.response?.status === 404) {
        debugWarn('Restaurant not found')
      } else if (error?.response?.status === 400) {
        debugWarn('Invalid restaurant ID')
      } else {
        debugWarn('Failed to fetch analytics. Please try again.')
      }
      
      // Set empty data on error
      setPaymentSummary(null)
      setSubscriptionSummary(EMPTY_SUBSCRIPTION_SUMMARY)
      setAnalyticsData({
        totalOrders: 0,
        cancelledOrders: 0,
        notDeliveredOrders: 0,
        explicitlyCancelledOrders: 0,
        inProgressOrders: 0,
        cancelledByRestaurant: 0,
        cancelledByAdmin: 0,
        cancelledByUser: 0,
        completedOrders: 0,
        averageRating: 0,
        totalRatings: 0,
        monthlyProfit: 0,
        yearlyProfit: 0,
        averageOrderValue: 0,
        totalRevenue: 0,
        restaurantEarning: 0,
        restaurantProfit: 0,
        monthlyOrders: 0,
        yearlyOrders: 0,
        averageMonthlyProfit: 0,
        averageYearlyProfit: 0,
        status: 'inactive',
        joinDate: new Date(),
        totalCustomers: 0,
        repeatCustomers: 0,
        cancellationRate: 0,
        completionRate: 0,
        inProgressRate: 0
      })
    } finally {
      setLoading(false)
    }
  }

  const filteredRestaurants = restaurants.filter(restaurant => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      restaurant.name?.toLowerCase().includes(query) ||
      restaurant.restaurantId?.toLowerCase().includes(query) ||
      restaurant._id?.toLowerCase().includes(query)
    )
  })

  const pickerFilteredRestaurants = restaurants.filter((restaurant) => {
    if (!pickerFilter.trim()) return true
    const query = pickerFilter.toLowerCase()
    return (
      restaurant.name?.toLowerCase().includes(query) ||
      restaurant.restaurantId?.toLowerCase().includes(query) ||
      restaurant._id?.toLowerCase().includes(query)
    )
  })

  // Handle restaurant selection from search
  const handleRestaurantSelect = (restaurantId) => {
    setSelectedRestaurant(restaurantId)
    const selected = restaurants.find(r => r._id === restaurantId)
    if (selected) {
      setSearchQuery(selected.name)
    }
    setShowSearchResults(false)
    setShowPickerDropdown(false)
    setPickerFilter('')
  }

  // Handle search input change
  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchQuery(value)
    setShowSearchResults(value.trim().length > 0)
    
    // If search is cleared, clear selection
    if (!value.trim()) {
      setSelectedRestaurant('')
      setShowSearchResults(false)
    }
  }

  const formatCurrency = (amount) => {
    return `\u20B9 ${amount?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}`
  }

  const formatNumber = (num) => {
    return num?.toLocaleString('en-IN') || '0'
  }

  const getSelectedRestaurantName = () => {
    const restaurant = restaurants.find(r => r._id === selectedRestaurant)
    return restaurant?.name || 'Select Restaurant'
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-neutral-200 overflow-x-hidden w-full" style={{ maxWidth: '100vw', boxSizing: 'border-box' }}>
      <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6 w-full overflow-hidden" style={{ maxWidth: '100%', boxSizing: 'border-box' }}>
        
        {/* Header Section */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#334257] mb-2">Restaurant POS Analytics & Benefits</h1>
          <p className="text-sm text-[#8a94aa]">Track restaurant performance, order earnings, and subscription billing</p>
                </div>

        {/* Restaurant Selection Card */}
        <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-6 mb-6">
          <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#334257] mb-2">
                Search Restaurant by Name or ID <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 z-10" />
                    <input
                      type="text"
                      value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => {
                    if (searchQuery.trim()) {
                      setShowSearchResults(true)
                    }
                  }}
                  onBlur={() => {
                    // Delay to allow click on results
                    setTimeout(() => setShowSearchResults(false), 200)
                  }}
                  placeholder="Type restaurant name or ID to search..."
                  className="w-full h-11 pl-10 pr-3 rounded-md border border-[#e3e6ef] bg-white text-sm text-[#4a5671] focus:outline-none focus:ring-1 focus:ring-[#006fbd]"
                />
                
                {/* Search Results Dropdown */}
                {showSearchResults && filteredRestaurants.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-[#e3e6ef] rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {filteredRestaurants.map(restaurant => (
                      <button
                        key={restaurant._id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          handleRestaurantSelect(restaurant._id)
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-[#f9fafc] cursor-pointer border-b border-[#e3e6ef] last:border-b-0 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-[#334257]">{restaurant.name}</p>
                            <p className="text-xs text-[#8a94aa]">ID: {restaurant.restaurantId || restaurant._id}</p>
                          </div>
                          {selectedRestaurant === restaurant._id && (
                            <div className="w-2 h-2 bg-[#006fbd] rounded-full"></div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                
                {/* No Results Message */}
                {showSearchResults && searchQuery.trim() && filteredRestaurants.length === 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-[#e3e6ef] rounded-md shadow-lg p-4">
                    <p className="text-sm text-[#8a94aa] text-center">No restaurants found matching "{searchQuery}"</p>
                  </div>
                )}
                  </div>
              {selectedRestaurant && (
                <p className="text-xs text-green-600 mt-2">
                  Selected: {getSelectedRestaurantName()}
                </p>
              )}
        </div>

            {/* Restaurant Picker */}
            <div>
              <label className="block text-sm font-medium text-[#334257] mb-2">
                Or Select from Dropdown
              </label>
              <div className="relative" ref={pickerDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowPickerDropdown((open) => !open)}
                  className={`w-full min-h-11 flex items-center justify-between gap-3 px-3 py-2 rounded-xl border bg-white text-sm transition-all ${
                    showPickerDropdown
                      ? 'border-[#006fbd] ring-2 ring-[#006fbd]/15 shadow-sm'
                      : 'border-[#e3e6ef] hover:border-[#006fbd]/35 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 text-left">
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#006fbd]/15 to-[#006fbd]/5 flex items-center justify-center shrink-0 border border-[#006fbd]/10">
                      <Store className="w-4 h-4 text-[#006fbd]" />
                    </div>
                    <div className="min-w-0">
                      <p className={`font-medium truncate ${selectedRestaurant ? 'text-[#334257]' : 'text-[#8a94aa]'}`}>
                        {selectedRestaurant ? getSelectedRestaurantName() : 'Choose a restaurant'}
                      </p>
                      {selectedRestaurant ? (
                        <p className="text-xs text-[#8a94aa] truncate mt-0.5">
                          ID: {restaurants.find((r) => r._id === selectedRestaurant)?.restaurantId || selectedRestaurant}
                        </p>
                      ) : (
                        <p className="text-xs text-[#8a94aa] mt-0.5">
                          {restaurants.length} approved restaurant{restaurants.length === 1 ? '' : 's'} available
                        </p>
                      )}
                    </div>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-[#8a94aa] shrink-0 transition-transform duration-200 ${
                      showPickerDropdown ? 'rotate-180 text-[#006fbd]' : ''
                    }`}
                  />
                </button>

                {showPickerDropdown && (
                  <div className="absolute z-50 w-full mt-2 bg-white border border-[#e3e6ef] rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                    <div className="p-3 border-b border-[#e3e6ef] bg-gradient-to-r from-[#f8fafc] to-white">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8a94aa]" />
                        <input
                          type="text"
                          value={pickerFilter}
                          onChange={(e) => setPickerFilter(e.target.value)}
                          placeholder="Filter by name or ID..."
                          className="w-full h-10 pl-9 pr-3 text-sm rounded-lg border border-[#e3e6ef] bg-white text-[#334257] placeholder:text-[#8a94aa] focus:outline-none focus:ring-2 focus:ring-[#006fbd]/20 focus:border-[#006fbd]"
                        />
                      </div>
                      <p className="text-[11px] font-medium text-[#8a94aa] mt-2 uppercase tracking-wide">
                        {pickerFilteredRestaurants.length} result{pickerFilteredRestaurants.length === 1 ? '' : 's'}
                      </p>
                    </div>

                    <div className="max-h-72 overflow-y-auto overscroll-contain">
                      {loading && restaurants.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-[#8a94aa]">Loading restaurants...</div>
                      ) : pickerFilteredRestaurants.length > 0 ? (
                        pickerFilteredRestaurants.map((restaurant) => {
                          const isSelected = selectedRestaurant === restaurant._id
                          return (
                            <button
                              key={restaurant._id}
                              type="button"
                              onClick={() => handleRestaurantSelect(restaurant._id)}
                              className={`w-full px-4 py-3 text-left transition-colors border-b border-[#eef1f6] last:border-b-0 ${
                                isSelected
                                  ? 'bg-[#006fbd]/8 hover:bg-[#006fbd]/10'
                                  : 'hover:bg-[#f8fafc]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                    isSelected ? 'bg-[#006fbd] text-white' : 'bg-slate-100 text-slate-500'
                                  }`}>
                                    <Store className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-[#334257] truncate">{restaurant.name}</p>
                                    <p className="text-xs text-[#8a94aa] truncate">
                                      ID: {restaurant.restaurantId || restaurant._id}
                                    </p>
                                  </div>
                                </div>
                                {isSelected && (
                                  <div className="w-6 h-6 rounded-full bg-[#006fbd] flex items-center justify-center shrink-0">
                                    <Check className="w-3.5 h-3.5 text-white" />
                                  </div>
                                )}
                              </div>
                            </button>
                          )
                        })
                      ) : (
                        <div className="px-4 py-8 text-center">
                          <p className="text-sm font-medium text-[#334257]">No restaurants found</p>
                          <p className="text-xs text-[#8a94aa] mt-1">Try a different search term</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
                  </div>
                </div>

        {/* Analytics Dashboard */}
        {selectedRestaurant && !loading ? (
          <div className="space-y-6">
            {/* Restaurant Header Info */}
            <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[#334257] mb-1">{getSelectedRestaurantName()}</h2>
                  <p className="text-sm text-[#8a94aa]">
                    Restaurant ID: {restaurants.find(r => r._id === selectedRestaurant)?.restaurantId || selectedRestaurant}
                  </p>
                </div>
                <div className={`px-4 py-2 rounded-full text-sm font-semibold ${
                  analyticsData.status === 'active' 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-red-100 text-red-700'
                }`}>
                  {analyticsData.status === 'active' ? 'Active' : 'Inactive'}
                </div>
              </div>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              {/* Total Orders */}
              <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <ShoppingCart className="w-6 h-6 text-blue-600" />
                  </div>
                  <TrendingUp className="w-5 h-5 text-green-500" />
                </div>
                <h3 className="text-sm font-medium text-[#8a94aa] mb-1">Total Orders</h3>
                <p className="text-2xl font-bold text-[#334257]">{formatNumber(analyticsData.totalOrders)}</p>
                <p className="text-xs text-[#8a94aa] mt-2">Completed: {formatNumber(analyticsData.completedOrders)}</p>
                </div>

              {/* Cancelled Orders */}
              <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-red-100 rounded-lg">
                    <XCircle className="w-6 h-6 text-red-600" />
                  </div>
                  <span className="text-sm font-semibold text-red-600">{analyticsData.cancellationRate.toFixed(1)}%</span>
                </div>
                <h3 className="text-sm font-medium text-[#8a94aa] mb-1">Cancelled Orders</h3>
                <p className="text-2xl font-bold text-[#334257]">{formatNumber(analyticsData.cancelledOrders)}</p>
                <p className="text-xs text-[#8a94aa] mt-2">
                  Restaurant: {formatNumber(analyticsData.cancelledByRestaurant)} | Admin: {formatNumber(analyticsData.cancelledByAdmin)} | User: {formatNumber(analyticsData.cancelledByUser)}
                </p>
                </div>

              {/* In Processing Orders */}
              <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <Clock className="w-6 h-6 text-orange-600" />
                  </div>
                  <span className="text-sm font-semibold text-orange-600">{analyticsData.inProgressRate.toFixed(1)}%</span>
                </div>
                <h3 className="text-sm font-medium text-[#8a94aa] mb-1">In Processing</h3>
                <p className="text-2xl font-bold text-[#334257]">{formatNumber(analyticsData.inProgressOrders)}</p>
                <p className="text-xs text-[#8a94aa] mt-2">Pending, accepted, preparing, on the way</p>
                </div>

              {/* Average Rating */}
              <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-yellow-100 rounded-lg">
                    <Star className="w-6 h-6 text-yellow-600 fill-yellow-600" />
                  </div>
                  <span className="text-sm font-semibold text-green-600">+{analyticsData.averageRating}</span>
                </div>
                <h3 className="text-sm font-medium text-[#8a94aa] mb-1">Average Rating</h3>
                <p className="text-2xl font-bold text-[#334257]">{analyticsData.averageRating.toFixed(1)}</p>
                <p className="text-xs text-[#8a94aa] mt-2">From {formatNumber(analyticsData.totalRatings)} reviews</p>
              </div>

              {/* Subscription Plan */}
              <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <CreditCard className="w-6 h-6 text-purple-600" />
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    subscriptionSummary.status === 'paid'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {subscriptionSummary.status === 'paid' ? 'Paid' : 'Due'}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-[#8a94aa] mb-1">Subscription Plan</h3>
                <p className="text-2xl font-bold text-[#334257]">{subscriptionSummary.planLabel}</p>
                <p className="text-xs text-[#8a94aa] mt-2">
                  Last invoice: {formatCurrency(subscriptionSummary.cycleFee)}
                  {subscriptionSummary.currentMonthGmv > 0
                    ? ` · This month GMV: ${formatCurrency(subscriptionSummary.currentMonthGmv)}`
                    : ''}
                </p>
              </div>
                  </div>

            {/* Profit & Revenue Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Monthly Profit */}
              <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-green-100 rounded-lg">
                      <Calendar className="w-6 h-6 text-green-600" />
                  </div>
                    <div>
                      <h3 className="text-base font-semibold text-[#334257]">Monthly Profit</h3>
                      <p className="text-xs text-[#8a94aa]">Current Month</p>
                  </div>
                  </div>
                  <TrendingUp className="w-5 h-5 text-green-500" />
                </div>
                <div className="mt-4">
                  <p className="text-3xl font-bold text-[#334257] mb-2">{formatCurrency(analyticsData.monthlyProfit)}</p>
                  <div className="flex items-center gap-4 mt-4 text-sm">
                    <div>
                      <span className="text-[#8a94aa]">Orders: </span>
                      <span className="font-semibold text-[#334257]">{formatNumber(analyticsData.monthlyOrders)}</span>
                    </div>
                    <div>
                      <span className="text-[#8a94aa]">Avg/Month: </span>
                      <span className="font-semibold text-[#334257]">{formatCurrency(analyticsData.averageMonthlyProfit)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Yearly Profit */}
              <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-100 rounded-lg">
                      <BarChart3 className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-[#334257]">Yearly Profit</h3>
                      <p className="text-xs text-[#8a94aa]">Current Year</p>
                    </div>
                  </div>
                  <TrendingUp className="w-5 h-5 text-green-500" />
                </div>
                <div className="mt-4">
                  <p className="text-3xl font-bold text-[#334257] mb-2">{formatCurrency(analyticsData.yearlyProfit)}</p>
                  <div className="flex items-center gap-4 mt-4 text-sm">
                    <div>
                      <span className="text-[#8a94aa]">Orders: </span>
                      <span className="font-semibold text-[#334257]">{formatNumber(analyticsData.yearlyOrders)}</span>
              </div>
                    <div>
                      <span className="text-[#8a94aa]">Avg/Year: </span>
                      <span className="font-semibold text-[#334257]">{formatCurrency(analyticsData.averageYearlyProfit)}</span>
            </div>
          </div>
        </div>
        </div>
      </div>

            {/* Detailed Financial Breakdown */}
            <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-6">
              <h3 className="text-lg font-semibold text-[#334257] mb-1">Financial Breakdown</h3>
              <p className="text-xs text-[#8a94aa] mb-4">Order earnings plus current subscription billing status for this restaurant.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Subtotal (Dish Price)</span>
                    <span className="text-base font-semibold text-[#334257]">{formatCurrency(paymentSummary?.subtotal || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Total Revenue</span>
                    <span className="text-base font-semibold text-[#334257]">{formatCurrency(analyticsData.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Restaurant Share (from orders)</span>
                    <span className="text-base font-semibold text-green-600">{formatCurrency(analyticsData.restaurantEarning)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Restaurant Profit</span>
                    <span className="text-base font-semibold text-emerald-700">{formatCurrency(analyticsData.restaurantProfit)}</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-3 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Average Order Value</span>
                    <span className="text-base font-semibold text-[#334257]">{formatCurrency(analyticsData.averageOrderValue)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Completion Rate</span>
                    <span className="text-base font-semibold text-green-600">{analyticsData.completionRate.toFixed(1)}%</span>
                  </div>
                  <div className="rounded-lg border border-purple-100 bg-purple-50/60 p-4 space-y-3">
                    <p className="text-sm font-semibold text-[#334257]">Subscription billing (monthly postpaid)</p>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[#8a94aa]">Last billed plan</span>
                      <span className="text-sm font-semibold text-[#334257]">{subscriptionSummary.planLabel}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[#8a94aa]">This month GMV</span>
                      <span className="text-sm font-semibold text-[#334257]">{formatCurrency(subscriptionSummary.currentMonthGmv)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[#8a94aa]">Outstanding due</span>
                      <span className={`text-sm font-semibold ${subscriptionSummary.dueAmount > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                        {formatCurrency(subscriptionSummary.dueAmount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[#8a94aa]">Total subscription collected</span>
                      <span className="text-sm font-semibold text-[#006fbd]">{formatCurrency(subscriptionSummary.totalCollected)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Restaurant Payments (from FoodTransaction ledger) */}
            <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-6">
              <h3 className="text-lg font-semibold text-[#334257] mb-1">Restaurant Payments (Completed Orders)</h3>
              <p className="text-xs text-[#8a94aa] mb-4">
                Order payout breakdown from the transaction ledger. Subscription payments are shown separately on the right.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Subtotal (Dish Price)</span>
                    <span className="text-sm font-semibold text-[#334257]">{formatCurrency(paymentSummary?.subtotal || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Tax</span>
                    <span className="text-sm font-semibold text-[#334257]">{formatCurrency(paymentSummary?.tax || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Delivery Fee</span>
                    <span className="text-sm font-semibold text-[#334257]">{formatCurrency(paymentSummary?.deliveryFee || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Platform Fee</span>
                    <span className="text-sm font-semibold text-[#334257]">{formatCurrency(paymentSummary?.platformFee || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Discount</span>
                    <span className="text-sm font-semibold text-[#334257]">{formatCurrency(paymentSummary?.discount || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Admin Bear Discount</span>
                    <span className="text-sm font-semibold text-[#334257]">{formatCurrency(paymentSummary?.adminDiscountShare || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Restaurant Bear Discount</span>
                    <span className="text-sm font-semibold text-[#334257]">{formatCurrency(paymentSummary?.restaurantDiscountShare || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm font-semibold text-[#334257]">Total Order Value</span>
                    <span className="text-sm font-bold text-[#006fbd]">{formatCurrency(paymentSummary?.total || 0)}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-lg border border-purple-100 bg-purple-50/60 p-3 mb-1">
                    <p className="text-sm font-semibold text-[#334257] mb-2">Subscription billing</p>
                    <p className="text-xs text-[#8a94aa] mb-3">
                      {subscriptionSummary.statusLabel}
                      {subscriptionSummary.invoiceCount > 0
                        ? ` · ${subscriptionSummary.invoiceCount} invoice${subscriptionSummary.invoiceCount === 1 ? '' : 's'}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Last billed plan & fee</span>
                    <span className="text-sm font-semibold text-[#334257]">
                      {subscriptionSummary.planLabel} · {formatCurrency(subscriptionSummary.cycleFee)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Total billed</span>
                    <span className="text-sm font-semibold text-[#334257]">{formatCurrency(subscriptionSummary.totalBilled)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Total collected</span>
                    <span className="text-sm font-semibold text-[#006fbd]">{formatCurrency(subscriptionSummary.totalCollected)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Deducted from wallet</span>
                    <span className="text-sm font-semibold text-[#334257]">{formatCurrency(subscriptionSummary.walletDeductionsTotal)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Waived</span>
                    <span className="text-sm font-semibold text-purple-700">{formatCurrency(subscriptionSummary.totalWaived)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Outstanding subscription due</span>
                    <span className={`text-sm font-semibold ${subscriptionSummary.dueAmount > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                      {formatCurrency(subscriptionSummary.dueAmount)}
                    </span>
                  </div>
                  {subscriptionSummary.lastPayment ? (
                    <div className="rounded-lg border border-[#e3e6ef] bg-[#f9fafc] p-3">
                      <p className="text-xs font-semibold text-[#334257] mb-1">Last subscription payment</p>
                      <p className="text-sm font-semibold text-[#334257]">
                        {formatCurrency(subscriptionSummary.lastPayment.amount)}
                      </p>
                      <p className="text-xs text-[#8a94aa] mt-1">
                        {formatSubscriptionPaymentLabel(subscriptionSummary.lastPayment.eventType)}
                        {subscriptionSummary.lastPayment.date
                          ? ` · ${new Date(subscriptionSummary.lastPayment.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
                          : ''}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-[#8a94aa]">No subscription payment recorded yet.</p>
                  )}
                  {Array.isArray(subscriptionSummary.invoices) && subscriptionSummary.invoices.length > 0 && (
                    <div className="rounded-lg border border-[#e3e6ef] bg-[#f9fafc] p-3">
                      <p className="text-xs font-semibold text-[#334257] mb-2">Monthly billing history</p>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {subscriptionSummary.invoices.map((inv) => (
                          <div key={inv.billingMonth} className="flex items-center justify-between text-xs">
                            <span className="text-[#8a94aa]">{inv.billingMonthLabel || inv.billingMonth}</span>
                            <span className="text-[#8a94aa] capitalize">{inv.planName}</span>
                            <span className="font-semibold text-[#334257]">{formatCurrency(inv.totalAmount)}</span>
                            <span className={`font-semibold ${inv.outstandingAmount > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                              {inv.outstandingAmount > 0 ? `Due ${formatCurrency(inv.outstandingAmount)}` : (inv.status === 'waived' ? 'Waived' : 'Paid')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-2 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Restaurant share (orders)</span>
                    <span className="text-sm font-semibold text-green-700">{formatCurrency(paymentSummary?.restaurantShare || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-[#e3e6ef]">
                    <span className="text-sm text-[#8a94aa]">Rider Share</span>
                    <span className="text-sm font-semibold text-[#334257]">{formatCurrency(paymentSummary?.riderShare || 0)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-[#8a94aa]">Platform Net Profit</span>
                    <span className="text-sm font-semibold text-[#334257]">{formatCurrency(paymentSummary?.platformNetProfit || 0)}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Additional Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Customer Statistics */}
              <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <Users className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h3 className="text-base font-semibold text-[#334257]">Customer Statistics</h3>
                  </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#8a94aa]">Total Customers</span>
                    <span className="text-sm font-semibold text-[#334257]">{formatNumber(analyticsData.totalCustomers)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#8a94aa]">Repeat Customers</span>
                    <span className="text-sm font-semibold text-[#334257]">{formatNumber(analyticsData.repeatCustomers)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#8a94aa]">Customer Retention</span>
                    <span className="text-sm font-semibold text-green-600">
                      {analyticsData.totalCustomers > 0 
                        ? ((analyticsData.repeatCustomers / analyticsData.totalCustomers) * 100).toFixed(1) 
                        : '0'}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Restaurant Details */}
              <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Package className="w-5 h-5 text-orange-600" />
                  </div>
                  <h3 className="text-base font-semibold text-[#334257]">Restaurant Details</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#8a94aa]">Join Date</span>
                    <span className="text-sm font-semibold text-[#334257]">
                      {new Date(analyticsData.joinDate).toLocaleDateString('en-IN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#8a94aa]">Status</span>
                    <span className={`text-sm font-semibold px-2 py-1 rounded ${
                      analyticsData.status === 'active' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {analyticsData.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#8a94aa]">Total Reviews</span>
                    <span className="text-sm font-semibold text-[#334257]">{formatNumber(analyticsData.totalRatings)}</span>
                  </div>
          </div>
              </div>
              </div>

            {/* Order Statistics Summary */}
            <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-6">
              <h3 className="text-lg font-semibold text-[#334257] mb-4">Order Statistics Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{formatNumber(analyticsData.totalOrders)}</p>
                  <p className="text-xs text-[#8a94aa] mt-1">Total Orders</p>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{formatNumber(analyticsData.completedOrders)}</p>
                  <p className="text-xs text-[#8a94aa] mt-1">Completed</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{formatNumber(analyticsData.cancelledOrders)}</p>
                  <p className="text-xs text-[#8a94aa] mt-1">Cancelled</p>
                  <p className="text-[10px] text-[#8a94aa] mt-1">
                    R: {formatNumber(analyticsData.cancelledByRestaurant)} | A: {formatNumber(analyticsData.cancelledByAdmin)} | U: {formatNumber(analyticsData.cancelledByUser)}
                  </p>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <p className="text-2xl font-bold text-orange-600">{formatNumber(analyticsData.inProgressOrders)}</p>
                  <p className="text-xs text-[#8a94aa] mt-1">In Processing</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-lg">
                  <p className="text-2xl font-bold text-yellow-600">{analyticsData.completionRate.toFixed(1)}%</p>
                  <p className="text-xs text-[#8a94aa] mt-1">Success Rate</p>
                </div>
              </div>
            </div>
          </div>
        ) : selectedRestaurant && loading ? (
          <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-12 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#006fbd] mx-auto mb-4"></div>
            <p className="text-sm text-[#8a94aa]">Loading restaurant analytics...</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-[#e3e6ef] p-12 text-center">
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-[#d1d7e6] flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-[#8a94aa]" />
            </div>
            <p className="text-base font-medium text-[#334257] mb-2">Select a Restaurant</p>
            <p className="text-sm text-[#8a94aa] max-w-md mx-auto">
              Please select a restaurant from the dropdown above to view detailed analytics, order earnings, and subscription billing.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
