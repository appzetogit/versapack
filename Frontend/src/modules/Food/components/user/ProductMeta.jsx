import { getProductSubtitle, getStockLabel, getStockState, STOCK_OUT } from "@food/utils/productStock"

/**
 * The two lines a grocery shopper needs that a food menu never had: what one
 * unit actually is, and whether it is still on the shelf.
 *
 * Both are conditional. A product with no brand or pack size renders nothing
 * rather than an empty row, and a comfortably-stocked product gets no badge —
 * a scarcity badge on everything stops meaning anything.
 */
export default function ProductMeta({ item, className = "" }) {
  const subtitle = getProductSubtitle(item)
  const stockLabel = getStockLabel(item)

  if (!subtitle && !stockLabel) return null

  const isOut = getStockState(item) === STOCK_OUT

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`.trim()}>
      {subtitle ? (
        <span className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</span>
      ) : null}

      {stockLabel ? (
        <span
          className={
            isOut
              ? "inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              : "inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          }
        >
          {stockLabel}
        </span>
      ) : null}
    </div>
  )
}
