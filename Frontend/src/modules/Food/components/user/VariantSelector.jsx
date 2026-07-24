import { motion } from "framer-motion"
import { Check, Sparkles, ShoppingBag } from "lucide-react"
import { getFoodDiscountPercent } from "@food/utils/foodVariants"

const RUPEE_SYMBOL = "\u20B9"

const getAccentStyles = (isSelected) => ({
  border: isSelected
    ? "border-[#EB590E] bg-gradient-to-br from-[#FFF7F2] via-white to-[#FFF2EB] dark:from-[#EB590E]/10 dark:via-[#1a1a1a] dark:to-[#EB590E]/5"
    : "border-gray-200/90 bg-white dark:border-gray-700/90 dark:bg-[#222222] hover:border-[#EB590E]/40 hover:bg-[#FFFBF8] dark:hover:bg-[#252525]",
  radio: isSelected
    ? "border-[#EB590E] bg-[#EB590E] text-white shadow-[0_4px_14px_-4px_rgba(235,89,14,0.65)]"
    : "border-gray-300 bg-white text-transparent dark:border-gray-600 dark:bg-[#2a2a2a]",
  price: isSelected ? "text-[#EB590E]" : "text-gray-900 dark:text-white",
})

export default function VariantSelector({
  variants = [],
  selectedVariantId = "",
  onSelectVariant,
  getVariantQuantity,
  className = "",
}) {
  if (!Array.isArray(variants) || variants.length === 0) return null

  const prices = variants.map((variant) => Number(variant.price) || 0)
  const minPrice = Math.min(...prices)

  return (
    <div className={`mb-5 ${className}`}>
      <div className="space-y-2.5" role="radiogroup" aria-label="Select variant">
        {variants.map((variant, index) => {
          const isSelected = String(selectedVariantId || "") === String(variant.id)
          const accent = getAccentStyles(isSelected)
          const variantPrice = Number(variant.price) || 0
          const isBestValue = variants.length > 1 && variantPrice === minPrice
          const qtyInCart = typeof getVariantQuantity === "function" ? getVariantQuantity(variant.id) : 0
          const priceDiff = variantPrice - minPrice

          return (
            <motion.button
              key={variant.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelectVariant?.(variant.id)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
              whileTap={{ scale: 0.985 }}
              className={`group relative w-full text-left rounded-2xl border px-3.5 py-3.5 transition-all duration-200 ${accent.border}`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${accent.radio}`}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[15px] font-semibold leading-tight ${isSelected ? "text-gray-900 dark:text-white" : "text-gray-800 dark:text-gray-100"}`}>
                      {variant.name}
                    </span>

                    {isBestValue && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                        <Sparkles className="h-3 w-3" />
                        Best value
                      </span>
                    )}

                    {qtyInCart > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#EB590E]/10 border border-[#EB590E]/20 px-2 py-0.5 text-[10px] font-semibold text-[#EB590E]">
                        <ShoppingBag className="h-3 w-3" />
                        {qtyInCart} in cart
                      </span>
                    )}
                  </div>

                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      Portion {index + 1} of {variants.length}
                    </span>
                    {priceDiff > 0 && (
                      <span className="text-[11px] font-medium text-gray-400 dark:text-gray-500">
                        +{RUPEE_SYMBOL}{Math.round(priceDiff)} vs base
                      </span>
                    )}
                    {priceDiff === 0 && variants.length > 1 && (
                      <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        Lowest price
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0 pl-2">
                  {Number(variant.otherPrice) > 0 && Number(variant.otherPrice) > variantPrice ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-gray-400 line-through tabular-nums">
                        {RUPEE_SYMBOL}{Math.round(Number(variant.otherPrice))}
                      </span>
                      <div className="flex items-center gap-1">
                        <span
                          className={`inline-flex items-center rounded-full border border-[#FA0272] bg-[#FA0272]/10 px-2 py-0.5 text-sm font-bold text-[#FA0272] tabular-nums leading-none`}
                        >
                          {RUPEE_SYMBOL}{Math.round(variantPrice)}
                        </span>
                        {getFoodDiscountPercent(null, variantPrice, variant.otherPrice) > 0 ? (
                          <span className="inline-flex items-center rounded-full bg-[#FA0272] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white tabular-nums">
                            {getFoodDiscountPercent(null, variantPrice, variant.otherPrice)}% OFF
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p className={`text-lg font-bold tabular-nums leading-none ${accent.price}`}>
                      {RUPEE_SYMBOL}{Math.round(variantPrice)}
                    </p>
                  )}
                  <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mt-1 uppercase tracking-wide">
                    per item
                  </p>
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
