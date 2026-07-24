import DeliveryCMSPage from "./DeliveryCMSPage"
import { API_ENDPOINTS } from "@food/api/config"

export default function DeliveryHelpContentV2() {
  return (
    <DeliveryCMSPage 
      endpoint={API_ENDPOINTS.ADMIN.SUPPORT_PUBLIC} 
      title="Help & Support" 
      module="DELIVERY"
    />
  )
}
