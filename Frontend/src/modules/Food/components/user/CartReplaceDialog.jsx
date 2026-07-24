import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@food/components/ui/dialog"
import { Button } from "@food/components/ui/button"
import { ArrowRight, ShoppingBag, Store } from "lucide-react"

export default function CartReplaceDialog({
  open,
  existingRestaurantName,
  newRestaurantName,
  onConfirm,
  onCancel,
}) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[10050]"
        className="z-[10050] w-[calc(100%-1.5rem)] max-w-[22rem] sm:max-w-sm rounded-3xl p-0 overflow-hidden border-0 shadow-2xl bg-white dark:bg-[#1a1a1a]"
      >
        <div className="px-5 pt-6 pb-5 sm:px-6 sm:pt-7 sm:pb-6">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-50 dark:bg-orange-950/40 ring-1 ring-orange-100 dark:ring-orange-900/50">
            <ShoppingBag className="h-7 w-7 text-[#EB590E]" />
          </div>

          <DialogTitle className="text-center text-lg sm:text-xl font-bold text-gray-900 dark:text-white leading-tight">
            Replace cart items?
          </DialogTitle>

          <DialogDescription className="mt-2 text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
            You already have items in your cart from another restaurant. Would you
            like to replace them?
          </DialogDescription>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl border border-gray-100 bg-gray-50/80 p-3.5 dark:border-gray-800 dark:bg-[#111111]">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Current cart
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-gray-100 dark:bg-[#1a1a1a] dark:ring-gray-800">
                  <Store className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                </div>
                <p className="min-w-0 flex-1 text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">
                  {existingRestaurantName}
                </p>
              </div>
            </div>

            <div className="flex justify-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-50 dark:bg-orange-950/40">
                <ArrowRight className="h-4 w-4 text-[#EB590E]" />
              </div>
            </div>

            <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-3.5 dark:border-orange-900/40 dark:bg-orange-950/20">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#EB590E]">
                New restaurant
              </p>
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-orange-100 dark:bg-[#1a1a1a] dark:ring-orange-900/40">
                  <Store className="h-4 w-4 text-[#EB590E]" />
                </div>
                <p className="min-w-0 flex-1 text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">
                  {newRestaurantName}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-[#111111] dark:text-gray-200 dark:hover:bg-[#1f1f1f]"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="h-11 rounded-xl bg-[#EB590E] text-sm font-semibold text-white shadow-[0_8px_20px_rgba(235,89,14,0.28)] hover:bg-[#d44f0d]"
              onClick={onConfirm}
            >
              Replace
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
