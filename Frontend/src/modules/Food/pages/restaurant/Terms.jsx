import RestaurantCMSPage from "./RestaurantCMSPage"
import { API_ENDPOINTS } from "@food/api/config"

export default function RestaurantTerms() {
  return (
    <RestaurantCMSPage 
      endpoint={API_ENDPOINTS.ADMIN.TERMS_PUBLIC} 
      title="Terms & Conditions" 
      module="RESTAURANT"
    />
  )
}
