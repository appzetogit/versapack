export const FEATURE_SETTINGS_OWNER_EMAIL = "badeadmin@gmail.com"

export function canAccessFeatureSettings(adminUser) {
  if ((adminUser?.adminType || "") === "super_admin") return true
  const email = String(adminUser?.email || "").trim().toLowerCase()
  return email === FEATURE_SETTINGS_OWNER_EMAIL
}

export function canAccessSuperPowers(adminUser) {
  const email = String(adminUser?.email || "").trim().toLowerCase()
  return email === FEATURE_SETTINGS_OWNER_EMAIL
}
