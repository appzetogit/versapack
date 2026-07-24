const ADMIN_STATUS_NOTE_PATTERNS = [
  /^order accepted by admin$/i,
  /^order rejected by admin$/i,
  /^order cancelled by admin$/i,
  /^status updated by admin$/i,
  /^order marked as delivered by admin$/i,
];

/** Customer cooking requests only — excludes admin/restaurant status messages wrongly stored on `note`. */
export function getRestaurantCookingNote(order = {}) {
  const note = String(order?.note || "").trim();
  if (!note) return "";

  if (ADMIN_STATUS_NOTE_PATTERNS.some((pattern) => pattern.test(note))) {
    return "";
  }

  const cancelReason = String(
    order?.cancellationReason || order?.rejectionReason || "",
  ).trim();
  if (cancelReason && note.toLowerCase() === cancelReason.toLowerCase()) {
    return "";
  }

  return note;
}
