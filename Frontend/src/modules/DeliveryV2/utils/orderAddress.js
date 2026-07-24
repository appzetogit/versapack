/**
 * Resolve a human-readable customer delivery address from order payload shapes
 * (socket offer, accept response, current-trip sync).
 */
export function resolveCustomerAddress(order) {
  if (!order) return '';

  const saved =
    order.customerAddress ||
    order.customer_address ||
    order.deliveryAddress?.formattedAddress ||
    order.deliveryAddress?.address ||
    '';

  if (String(saved).trim()) return String(saved).trim();

  const deliveryAddress = order.deliveryAddress || {};
  const addressParts = [
    deliveryAddress.street,
    deliveryAddress.additionalDetails,
    deliveryAddress.city,
    deliveryAddress.state,
    deliveryAddress.zipCode,
  ]
    .map((v) => String(v || '').trim())
    .filter(Boolean);

  return addressParts.length ? addressParts.join(', ') : '';
}

/** Open Google Maps with a searchable address (same pattern as restaurant pickup). */
export function openGoogleMapsForAddress(address) {
  const query = String(address || '').trim();
  if (!query) return false;
  window.open(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
    '_blank',
  );
  return true;
}
