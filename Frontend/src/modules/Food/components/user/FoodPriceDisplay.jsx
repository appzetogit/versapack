import {
  getFoodDiscountPercent,
  getFoodDisplayOtherPrice,
  getFoodDisplayPrice,
  hasFoodStrikePrice,
  hasFoodVariants,
} from "@food/utils/foodVariants"

const RUPEE = "₹"

const formatAmount = (value, decimals = 0) => {
  const n = Number(value) || 0
  if (decimals > 0) return n.toFixed(decimals)
  return String(Math.round(n))
}

/**
 * Compact dual amount for bills / line totals (strike + sale + % OFF).
 * When compareAmount <= amount, renders a plain price.
 */
export function DualMoney({
  amount,
  compareAmount = 0,
  decimals = 0,
  showDiscountTag = true,
  className = "",
  strikeClassName = "text-sm text-gray-400 line-through tabular-nums",
  saleClassName = "inline-flex items-center rounded-full border border-[#FA0272] bg-[#FA0272]/10 px-2 py-0.5 text-sm font-bold text-[#FA0272] tabular-nums",
  offClassName = "inline-flex items-center rounded-full bg-[#FA0272] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white tabular-nums",
  plainClassName = "font-semibold text-gray-900 dark:text-white tabular-nums",
}) {
  const price = Number(amount) || 0
  const otherPrice = Number(compareAmount) || 0
  const showStrike = otherPrice > price
  const discountPercent = showStrike
    ? Math.max(1, Math.round(((otherPrice - price) / otherPrice) * 100))
    : 0

  if (!showStrike) {
    return (
      <span className={`${plainClassName} ${className}`.trim()}>
        {RUPEE}
        {formatAmount(price, decimals)}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 flex-wrap justify-end ${className}`.trim()}>
      <span className={strikeClassName}>
        {RUPEE}
        {formatAmount(otherPrice, decimals)}
      </span>
      <span className={saleClassName}>
        {RUPEE}
        {formatAmount(price, decimals)}
      </span>
      {showDiscountTag && discountPercent > 0 ? (
        <span className={offClassName}>{discountPercent}% OFF</span>
      ) : null}
    </span>
  )
}

/**
 * Strikethrough other-platform price + pink sale badge + "% OFF" tag.
 * Existing items without otherPrice render a plain price.
 */
export default function FoodPriceDisplay({
  item,
  price: priceProp,
  otherPrice: otherPriceProp,
  startingFrom,
  showDiscountTag = true,
  className = "",
  strikeClassName = "text-sm text-gray-400 line-through tabular-nums",
  saleClassName = "inline-flex items-center rounded-full border border-[#FA0272] bg-[#FA0272]/10 px-2 py-0.5 text-sm font-bold text-[#FA0272] tabular-nums",
  offClassName = "inline-flex items-center rounded-full bg-[#FA0272] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white tabular-nums",
  plainClassName = "font-semibold text-gray-900 dark:text-white tabular-nums",
}) {
  const price = Math.round(
    priceProp != null ? Number(priceProp) || 0 : getFoodDisplayPrice(item),
  )
  const otherPrice = Math.round(
    otherPriceProp != null
      ? Number(otherPriceProp) || 0
      : getFoodDisplayOtherPrice(item),
  )
  const showStarting =
    startingFrom != null ? Boolean(startingFrom) : hasFoodVariants(item || {})
  const showStrike = hasFoodStrikePrice(item, price, otherPrice)
  const discountPercent = showStrike
    ? getFoodDiscountPercent(item, price, otherPrice)
    : 0

  if (!showStrike) {
    return (
      <span className={`${plainClassName} ${className}`.trim()}>
        {showStarting ? `Starting from ${RUPEE}${price}` : `${RUPEE}${price}`}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 flex-wrap ${className}`.trim()}>
      {showStarting ? (
        <span className="text-xs text-gray-500 dark:text-gray-400">Starting from</span>
      ) : null}
      <span className={strikeClassName}>
        {RUPEE}
        {otherPrice}
      </span>
      <span className={saleClassName}>
        {RUPEE}
        {price}
      </span>
      {showDiscountTag && discountPercent > 0 ? (
        <span className={offClassName}>{discountPercent}% OFF</span>
      ) : null}
    </span>
  )
}
