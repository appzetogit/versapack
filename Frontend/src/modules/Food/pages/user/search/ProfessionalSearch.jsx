import { useState, useMemo, useRef, useEffect, useCallback } from "react"
import { useSearchParams, Link, useNavigate } from "react-router-dom"
import { 
  ArrowLeft, Star, Clock, Search, SlidersHorizontal, 
  ChevronDown, Bookmark, BadgePercent, Mic, Grid2x2,
  X, Utensils, Store, Loader2, History
} from "lucide-react"
import { Card, CardContent } from "@food/components/ui/card"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { useLocation as useGeoLocation } from "@food/hooks/useLocation"
import { useZone } from "@food/hooks/useZone"
import { adminAPI, searchAPI } from "@/services/api"
import { motion, AnimatePresence } from "framer-motion"

// Helper to resolve media URLs consistently
const getMediaUrl = (url) => {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('http')) return url;
  
  // Use VITE_API_BASE_URL to derive the backend origin
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1";
  const origin = apiBase.split('/api/v1')[0];
  
  return `${origin}${url.startsWith('/') ? url : '/' + url}`;
};

// Debounce hook for real-time search
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

const SEARCH_HISTORY_KEY = "professional_search_history_v1"

export default function ProfessionalSearch() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialQuery = searchParams.get("q") || ""
  const navigate = useNavigate()
  const { location: userCoords } = useGeoLocation()
  const { zoneId, zoneStatus } = useZone(userCoords)
  
  const [query, setQuery] = useState(initialQuery)
  const debouncedQuery = useDebounce(query, 500)
  
  const [results, setResults] = useState({ restaurants: [], dishes: [] })
  const [loading, setLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [categories, setCategories] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState(searchParams.get("cat") || null)
  const [history, setHistory] = useState([])

  // Load search history
  useEffect(() => {
    const savedHistory = localStorage.getItem(SEARCH_HISTORY_KEY)
    if (savedHistory) setHistory(JSON.parse(savedHistory))

    // Trigger voice search if param is present
    if (searchParams.get('voice') === 'true') {
      handleVoiceSearch();
      // Clear the param so it doesn't trigger again on reload
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('voice');
      setSearchParams(newParams, { replace: true });
    }
  }, [])

  useEffect(() => {
    if (zoneStatus === "loading") return

    let cancelled = false

    const fetchCategories = async () => {
      try {
        const res = await adminAPI.getPublicCategories(zoneId ? { zoneId } : {})
        if (!cancelled && res.data?.success) {
          const list = res.data?.data?.categories || res.data?.categories || []
          setCategories(Array.isArray(list) ? list : [])
        }
      } catch (err) {
        if (!cancelled) {
          setCategories([])
        }
        console.error("Failed to fetch categories", err)
      }
    }

    fetchCategories()

    return () => {
      cancelled = true
    }
  }, [zoneId, zoneStatus])

  const addToHistory = (term) => {
    const newHistory = [term, ...history.filter(h => h !== term)].slice(0, 5)
    setHistory(newHistory)
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(newHistory))
  }

  const performSearch = useCallback(async (searchTerm, catId) => {
    if (!searchTerm && !catId) {
      setResults({ restaurants: [], dishes: [] })
      return
    }
    
    setLoading(true)
    try {
      const res = await searchAPI.unifiedSearch({
        q: searchTerm,
        categoryId: catId,
        lat: userCoords?.latitude,
        lng: userCoords?.longitude,
        zoneId,
        strictZone: catId ? "true" : "false",
      })
      
      if (res.data?.success) {
        // Grouping results into Restaurants and potential Dishes
        const all = (res.data.data.restaurants || []).filter((row) => {
          const restaurantZoneId = row?.zoneId || row?.zone?._id || row?.zone || null
          if (zoneId && restaurantZoneId && String(restaurantZoneId) !== String(zoneId)) {
            return false
          }
          return true
        })
        setResults({
          restaurants: all.filter(r => r.matchType === 'restaurant' || !r.matchType),
          dishes: all.filter(r => r.matchType === 'food')
        })
      }
    } catch (err) {
      console.error("Search failed", err)
    } finally {
      setLoading(false)
    }
  }, [userCoords, zoneId])

  useEffect(() => {
    performSearch(debouncedQuery, selectedCategoryId)
    if (debouncedQuery) {
        setSearchParams({ q: debouncedQuery, ...(selectedCategoryId ? { cat: selectedCategoryId } : {}) }, { replace: true })
    }
  }, [debouncedQuery, selectedCategoryId, performSearch, setSearchParams])

  // Speech Recognition Implementation
  const handleVoiceSearch = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert("Voice search is not supported in this browser.")
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-IN'
    recognition.onstart = () => setIsListening(true)
    recognition.onend = () => setIsListening(false)
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      setQuery(transcript.trim())
      addToHistory(transcript.trim())
    }
    recognition.start()
  }

  const handleClear = () => {
    setQuery("")
    setSelectedCategoryId(null)
    setSearchParams({}, { replace: true })
    setResults({ restaurants: [], dishes: [] })
  }

  const handleCategoryClick = (id) => {
    const newCat = selectedCategoryId === id ? null : id
    setSelectedCategoryId(newCat)
    if (newCat) {
        setSearchParams({ ...Object.fromEntries(searchParams), cat: newCat }, { replace: true })
    } else {
        const p = Object.fromEntries(searchParams)
        delete p.cat
        setSearchParams(p, { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 z-10" />
            <Input 
              autoFocus
              placeholder="Search for restaurants or dishes..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-12 pr-12 h-12 w-full bg-slate-100 dark:bg-zinc-800 border-none focus:ring-2 focus:ring-rose-500 rounded-full text-base"
            />
            {query && (
              <button onClick={handleClear} className="absolute right-12 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={handleVoiceSearch}
              className={`absolute right-4 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all ${isListening ? 'bg-rose-500 text-white animate-pulse' : 'text-gray-400 hover:text-rose-500 hover:bg-rose-50'}`}
            >
              <Mic className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4">
        {/* Categories (Admin only) */}
        {!query && !loading && (
          <div className="mb-8">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 px-1">Top Categories</h3>
            <div className="flex gap-4 overflow-x-auto px-1 pt-2 pb-3 snap-x snap-mandatory scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((cat) => (
                <button 
                  key={cat._id} 
                  onClick={() => handleCategoryClick(cat._id)}
                  className={`flex w-16 min-w-16 flex-shrink-0 snap-start flex-col items-center group transition-all ${selectedCategoryId === cat._id ? 'scale-110' : ''}`}
                >
                  <div className={`w-14 h-14 rounded-2xl mb-2 flex items-center justify-center overflow-hidden border-2 transition-all ${selectedCategoryId === cat._id ? 'border-rose-500 shadow-lg shadow-rose-100' : 'border-transparent bg-white dark:bg-zinc-900'}`}>
                    {cat.image ? (
                      <img 
                        src={getMediaUrl(cat.image)} 
                        alt={cat.name} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform" 
                      />
                    ) : (
                      <Utensils className="w-6 h-6 text-slate-300" />
                    )}
                  </div>
                  <span className={`text-[11px] font-medium text-center line-clamp-1 ${selectedCategoryId === cat._id ? 'text-rose-600' : 'text-slate-600 dark:text-slate-400'}`}>
                    {cat.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        <AnimatePresence>
          {loading && (
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               className="flex flex-col items-center justify-center py-20"
            >
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin mb-3" />
              <p className="text-slate-400 text-sm">Finding the best for you...</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recent History */}
        {!query && !loading && history.length > 0 && (
          <div className="mb-8">
             <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">Recently Searched</h3>
             <div className="flex flex-wrap gap-2">
                {history.map((term, i) => (
                  <button 
                    key={i} 
                    onClick={() => setQuery(term)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-full text-sm text-slate-600 dark:text-zinc-400 hover:bg-slate-50 transition-colors"
                  >
                    <History className="w-3 h-3" />
                    {term}
                  </button>
                ))}
             </div>
          </div>
        )}

        {/* Search Results */}
        {!loading && (query || selectedCategoryId) && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            
            {/* Dish Results Section */}
            {results.dishes.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                   <div className="w-1 h-5 bg-orange-500 rounded-full" />
                   <h2 className="text-lg font-bold dark:text-white">Dishes from restaurants</h2>
                </div>
                <div className="grid gap-4">
                  {results.dishes.map((r) => (
                    <Link to={`/user/restaurants/${r.slug || r._id}${r.matchedDishId ? `?dish=${r.matchedDishId}` : ''}`} key={r._id} className="flex gap-4 p-3 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-100 dark:border-zinc-800 hover:shadow-md transition-shadow group">
                       <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0 relative">
                           <img 
                            src={getMediaUrl(r.matchedDishImage || r.profileImage || r.image || (Array.isArray(r.images) && r.images[0]))} 
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                            onError={(e) => (e.target.src = "/placeholder-dish.jpg")}
                          />
                          {r.pureVegRestaurant && (
                            <div className="absolute top-1 left-1 w-4 h-4 border border-green-600 p-[1px] bg-white rounded-sm">
                               <div className="w-full h-full bg-green-600 rounded-full" />
                            </div>
                          )}
                       </div>
                       <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="text-rose-500 text-[10px] font-bold uppercase tracking-wider mb-1">
                             Matched: {r.matchedDish || query}
                          </div>
                          <h3 className="font-bold text-slate-900 dark:text-white line-clamp-1">{r.restaurantName}</h3>
                          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-zinc-400 mt-1">
                             <div className="flex items-center gap-1">
                                <Star className="w-3 h-3 text-orange-500 fill-orange-500" />
                                <span className="font-semibold text-slate-700 dark:text-white">{r.rating || "New"}</span>
                             </div>
                             <span>•</span>
                             <span>{r.estimatedDeliveryTime || "30-40 mins"}</span>
                             <span>•</span>
                             <span className="line-clamp-1">{r.cuisines?.slice(0, 2).join(", ")}</span>
                          </div>
                       </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Restaurant Results Section */}
            {results.restaurants.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                   <div className="w-1 h-5 bg-rose-500 rounded-full" />
                   <h2 className="text-lg font-bold dark:text-white">Restaurants</h2>
                </div>
                <div className="grid gap-6">
                  {results.restaurants.map((r) => (
                    <Link to={`/user/restaurants/${r._id}`} key={r._id} className="block group">
                      <div className="relative rounded-3xl overflow-hidden aspect-[16/9] mb-3 bg-slate-200">
                         <img 
                          src={getMediaUrl(r.profileImage || r.image || (Array.isArray(r.images) && r.images[0]))} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          onError={(e) => (e.target.src = "/placeholder-restaurant.jpg")}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                           <div>
                              <h3 className="text-xl font-bold text-white mb-1">{r.restaurantName}</h3>
                              <p className="text-white/80 text-xs line-clamp-1">{r.cuisines?.join(", ")}</p>
                           </div>
                           <div className="bg-white/20 backdrop-blur-md border border-white/30 px-2 py-1 rounded-lg flex items-center gap-1">
                              <Star className="w-3 h-3 text-white fill-white" />
                              <span className="text-white text-xs font-bold">{r.rating || "4.0"}</span>
                           </div>
                        </div>
                        {r.offer && (
                           <div className="absolute top-4 left-0 bg-blue-600 text-white text-[10px] font-black px-3 py-1.5 rounded-r-lg shadow-lg flex items-center gap-1 tracking-tighter">
                              <BadgePercent className="w-3 h-3" />
                              {r.offer.toUpperCase()}
                           </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between px-1">
                         <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-zinc-400 font-medium">
                            <div className="flex items-center gap-1">
                               <Clock className="w-3 h-3" />
                               {r.estimatedDeliveryTime || "30 mins"}
                            </div>
                            <span>•</span>
                            <span>{r.location?.area || "Nearby"}</span>
                         </div>
                         <div className="text-[10px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Top Pick
                         </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Empty State */}
            {!loading && results.restaurants.length === 0 && results.dishes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                 <div className="w-20 h-20 bg-slate-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-4">
                    <Search className="w-8 h-8 text-slate-300" />
                 </div>
                 <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">We couldn't find any results</h2>
                 <p className="text-slate-500 text-sm max-w-xs">Maybe try searching for something else or check your spelling</p>
                 <Button variant="outline" onClick={handleClear} className="mt-6 rounded-xl border-rose-500 text-rose-500 hover:bg-rose-50">
                    Clear all filters
                 </Button>
              </div>
            )}

          </div>
        )}
      </div>
      {/* Speak Now Overlay */}
      {isListening && (
        <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-white/95 dark:bg-[#0a0a0a]/95 backdrop-blur-md">
          <div className="relative flex items-center justify-center">
            {/* Animated Ripples */}
            <div className="absolute w-40 h-40 bg-rose-500/20 rounded-full animate-ping" />
            <div className="absolute w-32 h-32 bg-rose-500/30 rounded-full animate-pulse" />
            
            {/* Mic Icon Container */}
            <div className="relative bg-gradient-to-tr from-rose-600 to-rose-400 p-8 rounded-full text-white shadow-[0_0_40px_rgba(225,29,72,0.4)] border-4 border-white dark:border-zinc-800">
              <Mic className="h-12 w-12" />
            </div>

            {/* Sound Wave Bars */}
            <div className="absolute -bottom-16 flex items-end gap-1.5 h-12">
              {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div 
                  key={i}
                  className="w-1.5 bg-rose-500 rounded-full animate-voice-bar"
                  style={{ 
                    animationDelay: `${i * 0.1}s`,
                    height: `${20 + Math.random() * 80}%`
                  }}
                />
              ))}
            </div>
          </div>

          <div className="mt-24 text-center">
            <h2 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Speak Now</h2>
            <p className="mt-3 text-gray-500 dark:text-gray-400 font-medium">I'm listening for dishes or restaurants...</p>
          </div>

          <Button
            variant="ghost"
            onClick={() => setIsListening(false)}
            className="mt-16 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-full px-8"
          >
            Cancel
          </Button>
        </div>
      )}

      <style>{`
          @keyframes voice-bar {
            0%, 100% { height: 20%; }
            50% { height: 100%; }
          }
          .animate-voice-bar {
            animation: voice-bar 0.6s ease-in-out infinite;
          }
      `}</style>
    </div>
  )
}
