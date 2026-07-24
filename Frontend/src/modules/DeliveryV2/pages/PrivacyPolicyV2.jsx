import DeliveryCMSPage from "./DeliveryCMSPage"
import { API_ENDPOINTS } from "@food/api/config"

export default function PrivacyPolicyV2() {
  return (
    <DeliveryCMSPage 
      endpoint={API_ENDPOINTS.ADMIN.PRIVACY_PUBLIC} 
      title="Privacy Policy" 
      module="DELIVERY"
    />
  )
}
