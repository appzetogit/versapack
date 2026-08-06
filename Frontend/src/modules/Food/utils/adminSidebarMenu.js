export const adminSidebarMenu = [
  {
    type: "link",
    label: "Dashboard",
    path: "/admin/store",
    icon: "LayoutDashboard",
  },
  {
    type: "link",
    label: "Point of Sale",
    path: "/admin/store/point-of-sale",
    icon: "CreditCard",
  },
  {
    type: "section",
    label: "CATALOG MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Product Approval",
        path: "/admin/store/food-approval",
        icon: "CheckCircle2",
      },
      {
        type: "expandable",
        label: "Products",
        icon: "Utensils",
        subItems: [
          { label: "Seller Products List", path: "/admin/store/products" },
          { label: "Seller Add-ons List", path: "/admin/store/addons" },
        ],
      },
      {
        type: "link",
        label: "Categories",
        icon: "FolderTree",
        path: "/admin/store/categories",
      },
    ],
  },
  {
    type: "section",
    label: "SELLER MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Zone Setup",
        path: "/admin/store/zone-setup",
        icon: "MapPin",
      },
      {
        type: "expandable",
        label: "Sellers",
        icon: "UtensilsCrossed",
        subItems: [
          { label: "Sellers List", path: "/admin/store/sellers" },
          { label: "New Seller Requests", path: "/admin/store/sellers/joining-request" },
          { label: "Unregistered Sellers", path: "/admin/store/sellers/unregistered" },
          { label: "Seller Reviews", path: "/admin/store/sellers/reviews" },
          { label: "Seller Complaints", path: "/admin/store/sellers/complaints" },
          { label: "Seller Settings", path: "/admin/store/sellers/settings" },
          { label: "Subscription Settings", path: "/admin/store/sellers/subscription-settings" },
          { label: "Subscription Billing", path: "/admin/store/sellers/subscription-history" },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "ORDER MANAGEMENT",
    items: [
      {
        type: "expandable",
        label: "Orders",
        icon: "FileText",
        subItems: [
          { label: "All", path: "/admin/store/orders/all" },
          { label: "Pending", path: "/admin/store/orders/pending" },
          { label: "Processing", path: "/admin/store/orders/processing" },
          { label: "Out For Delivery", path: "/admin/store/orders/food-on-the-way" },
          { label: "Delivered", path: "/admin/store/orders/delivered" },
          { label: "Cancelled", path: "/admin/store/orders/canceled" },
          { label: "Seller cancelled", path: "/admin/store/orders/restaurant-cancelled" },
          { label: "Payment Failed", path: "/admin/store/orders/payment-failed" },
          { label: "Refunded", path: "/admin/store/orders/refunded" },
          { label: "Offline Payments", path: "/admin/store/orders/offline-payments" },
          { label: "User Carts", path: "/admin/store/orders/user-carts" },
        ],
      },
      {
        type: "link",
        label: "Order Detect Delivery",
        path: "/admin/store/order-detect-delivery",
        icon: "Truck",
      },
    ],
  },
  {
    type: "section",
    label: "PROMOTIONS MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Seller Coupons & Offers",
        path: "/admin/store/coupons",
        icon: "Gift",
      },
    ],
  },
  {
    type: "section",
    label: "REFERRAL & REWARDS",
    items: [
      { type: "link", label: "Referral Settings", path: "/admin/store/referral-settings", icon: "Gift" },
    ],
  },
  {
    type: "section",
    label: "CUSTOMER MANAGEMENT",
    items: [
      {
        type: "link",
        label: "Customers",
        path: "/admin/store/customers",
        icon: "Users",
      },
      {
        type: "link",
        label: "Support Tickets (User & Seller)",
        path: "/admin/store/support-tickets",
        icon: "MessageSquare",
      },
    ],
  },
  {
    type: "section",
    label: "DELIVERY MANAGEMENT",
    items: [
      { type: "link", label: "Delivery & Platform Fee", path: "/admin/store/fee-settings", icon: "DollarSign" },
      { type: "link", label: "Delivery Withdrawal", path: "/admin/store/delivery-withdrawal", icon: "Wallet" },
      { type: "link", label: "Delivery boy Wallet", path: "/admin/store/delivery-boy-wallet", icon: "PiggyBank" },
      { type: "link", label: "Delivery Emergency Help", path: "/admin/store/delivery-emergency-help", icon: "Phone" },
      { type: "link", label: "Delivery Support Tickets", path: "/admin/store/delivery-support-tickets", icon: "MessageSquare" },
      { type: "link", label: "Order Reassignment Requests", path: "/admin/store/delivery-order-reassignment-requests", icon: "AlertTriangle" },
      {
        type: "expandable",
        label: "Deliveryman",
        icon: "Package",
        subItems: [
          { label: "New Join Request", path: "/admin/store/delivery-partners/join-request" },
          { label: "Deliveryman List", path: "/admin/store/delivery-partners" },
          { label: "Live Tracking", path: "/admin/store/delivery-partners/live-tracking" },
          { label: "Deliveryman Reviews", path: "/admin/store/delivery-partners/reviews" },
          { label: "Bonus", path: "/admin/store/delivery-partners/bonus" },
          { label: "Earning Addon", path: "/admin/store/delivery-partners/earning-addon" },
          { label: "Earning Addon History", path: "/admin/store/delivery-partners/earning-addon-history" },
          { label: "Delivery Earning", path: "/admin/store/delivery-partners/earnings" },
        ],
      },
    ],
  },
  {
    type: "section",
    label: "HELP & SUPPORT",
    items: [
      { type: "link", label: "User Feedback", path: "/admin/store/contact-messages", icon: "Mail" },
      { type: "link", label: "Safety Emergency Reports", path: "/admin/store/safety-emergency-reports", icon: "AlertTriangle" },
    ],
  },
  {
    type: "section",
    label: "REPORT MANAGEMENT",
    items: [
      { type: "link", label: "Transaction Report", path: "/admin/store/transaction-report", icon: "FileText" },
      { type: "link", label: "Order Report", path: "/admin/store/order-report/regular", icon: "FileText" },
      { type: "link", label: "Tax Report", path: "/admin/store/tax-report", icon: "Receipt" },
      {
        type: "expandable",
        label: "Restaurant Report",
        icon: "FileText",
        subItems: [{ label: "Restaurant Report", path: "/admin/store/restaurant-report" }],
      },
      {
        type: "expandable",
        label: "Customer Report",
        icon: "FileText",
        subItems: [{ label: "Feedback Experience", path: "/admin/store/customer-report/feedback-experience" }],
      },
    ],
  },
  {
    type: "section",
    label: "TRANSACTION MANAGEMENT",
    items: [
      { type: "link", label: "Restaurant Withdraws", path: "/admin/store/restaurant-withdraws", icon: "CreditCard" },
    ],
  },
  {
    type: "section",
    label: "BANNER SETTINGS",
    items: [
      { type: "link", label: "Landing Page Management", path: "/admin/store/hero-banner-management", icon: "Image" },
      { type: "link", label: "Promotional Banners", path: "/admin/store/promotional-banner", icon: "Megaphone" },
// { type: "link", label: "General Banners", path: "/admin/store/banners", icon: "Image" },
    ],
  },
  {
    type: "section",
    label: "DINING MANAGEMENT",
    items: [
      // { type: "link", label: "Dining Banners", path: "/admin/store/dining-management", icon: "UtensilsCrossed" },
      // { type: "link", label: "Dining List", path: "/admin/store/dining-list", icon: "FileText" },
    ],
  },
  {
    type: "section",
    label: "SYSTEM SETTINGS",
    items: [
      { type: "link", label: "Broadcast Notification", path: "/admin/store/broadcast-notification", icon: "Bell" },
      { type: "link", label: "Business Setup", path: "/admin/store/business-setup", icon: "Settings" },
    ],
  },
  {
    type: "section",
    label: "SUPER POWERS",
    items: [
      { type: "link", label: "Feature Settings", path: "/admin/store/feature-settings", icon: "Settings" },
      { type: "link", label: "Power Scanning", path: "/admin/store/power-scanning", icon: "Zap" },
    ],
  },
  {
    type: "section",
    label: "ADMIN ACCESS",
    items: [
      { type: "link", label: "Sub Admin List", path: "/admin/store/employees", icon: "UserCog" },
    ],
  },
  {
    type: "section",
    label: "PAGES & SOCIAL MEDIA",
    items: [
      { type: "link", label: "About Us", path: "/admin/store/pages-social-media/about", icon: "Globe" },
      { type: "link", label: "Terms & Conditions", path: "/admin/store/pages-social-media/terms", icon: "FileText" },
      { type: "link", label: "Privacy Policy", path: "/admin/store/pages-social-media/privacy", icon: "Lock" },
      { type: "link", label: "Support", path: "/admin/store/pages-social-media/support", icon: "Headset" },
      { type: "link", label: "Refund Policy", path: "/admin/store/pages-social-media/refund", icon: "Receipt" },
      { type: "link", label: "Shipping Policy", path: "/admin/store/pages-social-media/shipping", icon: "Truck" },
      { type: "link", label: "Cancellation Policy", path: "/admin/store/pages-social-media/cancellation", icon: "X" },
    ],
  },
];
