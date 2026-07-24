import RestaurantCMSPage from "./RestaurantCMSPage"
import { API_ENDPOINTS } from "@food/api/config"

export default function RestaurantPrivacy() {
  return (
    <RestaurantCMSPage 
      endpoint={API_ENDPOINTS.ADMIN.PRIVACY_PUBLIC} 
      title="Privacy Policy" 
      module="RESTAURANT"
    />
  )
}
