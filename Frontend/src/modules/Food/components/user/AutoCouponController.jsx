import useAutoCouponEngine from "@food/hooks/useAutoCouponEngine"
import AutoCouponCelebration from "@food/components/user/AutoCouponCelebration"

export default function AutoCouponController() {
  useAutoCouponEngine({ enabled: true })
  return <AutoCouponCelebration />
}
