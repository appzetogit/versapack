import React, { useEffect, useState } from "react"
import { adminAPI } from "@/services/api"
import { Button } from "@food/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@food/components/ui/card"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { Clock, Loader2, Save } from "lucide-react"
import { toast } from "sonner"

const MIN_MINUTES = 1
const MAX_MINUTES = 20
const DEFAULT_MINUTES = 4

const clampMinutes = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_MINUTES
  return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(numeric)))
}

export default function RestaurantSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedMinutes, setSavedMinutes] = useState(DEFAULT_MINUTES)
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setLoading(true)
        const response = await adminAPI.getRestaurantOrderAcceptanceSettings()
        const value = clampMinutes(response?.data?.data?.orderAcceptanceTimeMinutes)
        setSavedMinutes(value)
        setMinutes(value)
      } catch (error) {
        toast.error(error?.response?.data?.message || "Failed to load restaurant settings.")
      } finally {
        setLoading(false)
      }
    }

    loadSettings()
  }, [])

  const handleSave = async () => {
    const value = clampMinutes(minutes)
    try {
      setSaving(true)
      const response = await adminAPI.updateRestaurantOrderAcceptanceSettings({
        orderAcceptanceTimeMinutes: value,
      })
      const updatedValue = clampMinutes(response?.data?.data?.orderAcceptanceTimeMinutes ?? value)
      setSavedMinutes(updatedValue)
      setMinutes(updatedValue)
      toast.success("Order acceptance time updated.")
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update order acceptance time.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-[360px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const currentMinutes = clampMinutes(minutes)
  const isDirty = currentMinutes !== savedMinutes

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Restaurant Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Set the order acceptance timer for all restaurants.
        </p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-slate-600" />
            <CardTitle className="text-lg">Order Acceptance Time</CardTitle>
          </div>
          <CardDescription>
            New restaurant order popups will use this value. Existing active orders keep their current timer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="orderAcceptanceTimeMinutes">Timer duration</Label>
              <span className="text-sm font-semibold text-gray-900">{currentMinutes} minutes</span>
            </div>
            <Input
              id="orderAcceptanceTimeMinutes"
              type="range"
              min={MIN_MINUTES}
              max={MAX_MINUTES}
              value={currentMinutes}
              onChange={(event) => setMinutes(clampMinutes(event.target.value))}
              className="h-10"
            />
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={MIN_MINUTES}
                max={MAX_MINUTES}
                value={currentMinutes}
                onChange={(event) => setMinutes(clampMinutes(event.target.value))}
                className="w-28"
              />
              <span className="text-sm text-gray-500">Allowed range: 1 to 20 minutes</span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleSave} disabled={!isDirty || saving} className="min-w-[120px]">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
