import RestaurantCMSPage from "./RestaurantCMSPage"
import { API_ENDPOINTS } from "@food/api/config"

export default function RestaurantHelpSupport() {
  return (
    <RestaurantCMSPage 
      endpoint={API_ENDPOINTS.ADMIN.SUPPORT_PUBLIC} 
      title="Help & Support" 
      module="RESTAURANT"
    />
  )
}
