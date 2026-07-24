import DeliveryCMSPage from "./DeliveryCMSPage"
import { API_ENDPOINTS } from "@food/api/config"

export default function TermsAndConditionsV2() {
  return (
    <DeliveryCMSPage 
      endpoint={API_ENDPOINTS.ADMIN.TERMS_PUBLIC} 
      title="Terms and Conditions" 
      module="DELIVERY"
    />
  )
}
