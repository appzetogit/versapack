# Seller Store Location — Flutter Developer Integration Guide

This documents the API for saving a seller's shop location (`lat`, `lng`, shop name,
address) and having the backend resolve the delivery zone.

> 💡 Reverse geocoding and place-search autocomplete stay client-side (Google Maps SDK on
> the Flutter app). The backend only needs the confirmed coordinates + text address.

---

## 📌 Base Configuration

- **Base URL**: `https://<your-api-domain>/api`
- **Authentication Header**: `Authorization: Bearer <SELLER_JWT_TOKEN>`
- **Content-Type**: `application/json`

---

## 🛠️ The Endpoint

- **Method**: `PATCH`
- **Path**: `/v1/food/restaurant/location`
- **Auth**: Bearer token, `RESTAURANT` role

This is a thin wrapper around the store-profile update logic, exposed with the flat
contract the app needs — it does not touch any other profile field.

### Request Body

```json
{
  "lat": 19.0760,
  "lng": 72.8777,
  "shop_name": "Versapack Mart",
  "address": "Shop No 12, Main Market Road, Andheri West, Mumbai 400058"
}
```

Field notes:
- `lat` / `lng` — **required**. Must be finite numbers (not strings). 400 if missing or
  not numeric.
- `shop_name` — optional. Omit it to update only the location without renaming the store.
- `address` — optional free-text formatted address.

---

## ⚠️ Behavior You Must Handle

### 1. Zone resolution happens server-side, and can reject the pin

The backend loads every active delivery zone (`FoodZone`) and does a point-in-polygon check
against the submitted coordinates — it does **not** trust any zone the app might already
know about. If the pin doesn't fall inside any active zone polygon, the request fails:

```json
{ "success": false, "message": "Selected location is outside the service zone. Please pin inside an active zone.", "error": "Selected location is outside the service zone. Please pin inside an active zone." }
```
HTTP status: `400`.

Show this message to the seller and let them re-drop the pin — there is no partial save.

### 2. An existing, live store does not get the new location immediately

This is the part a naive "save location" screen will get wrong.

- **First-time location** (seller has never had a published location — e.g. still
  onboarding): the location is written straight to the live `location`/`zoneId` fields and
  is immediately in effect.
- **Changing an already-published location** (a live, approved store moving its pin): the
  new location is **not** applied. It's stored as a *pending* change and an admin has to
  approve it:
  - `location` (the live one customers/orders use) stays unchanged.
  - `pendingLocation` is set to what was just submitted.
  - `locationUpdateStatus` becomes `"pending"`.
  - Admins are notified to review it.

This exists so a seller can't silently relocate their store (and therefore its delivery
zone / delivery-time promise) without review.

**The app must show this state.** After a location submission, check the response's
`locationUpdateStatus`:

| `locationUpdateStatus` | Meaning | What to show |
|---|---|---|
| `"none"` | No location set yet, or first-time set just applied | Normal store screen |
| `"pending"` | Change submitted, awaiting admin review | Banner: "Location update pending approval" — keep showing the **old** `location` as the active one |
| `"approved"` | A previous pending request was approved | Normal store screen (this state clears back toward `"none"` once reviewed) |
| `"rejected"` | Admin rejected the change | Show `locationRejectionReason` to the seller so they can resubmit |

### 3. Response shape

```json
{
  "success": true,
  "message": "Store location updated successfully",
  "data": {
    "restaurant": {
      "id": "…",
      "name": "Versapack Mart",
      "zoneId": "…",
      "location": {
        "latitude": 19.0760,
        "longitude": 72.8777,
        "address": "Shop No 12, Main Market Road, Andheri West, Mumbai 400058",
        "addressLine1": "…", "city": "…", "state": "…", "pincode": "…"
      },
      "pendingLocation": null,
      "locationUpdateStatus": "none",
      "locationUpdateRequestedAt": null,
      "locationUpdateReviewedAt": null,
      "locationRejectionReason": "",

      "…": "…all other profile fields (cuisines, openingTime, status, etc.) are also present"
    }
  }
}
```

When a change is pending, `pendingLocation` is populated with the same shape as `location`
and `locationUpdateStatus` is `"pending"` — the app should render the pin from
`pendingLocation` in a distinct "awaiting approval" style if you show it on a map at all,
while the live `location` keeps driving everything customer-facing.

### 4. Reading current status without submitting a change

`GET /v1/food/restaurant/current` (same auth) returns the same restaurant object shape
shown above — use it to populate the store-location screen on load, including any
in-flight `pendingLocation`/`locationUpdateStatus`.

---

## ✅ Suggested Flutter Flow

1. On screen load, `GET /v1/food/restaurant/current` → read `location` and
   `locationUpdateStatus`. If `"pending"`, show the pending banner and disable re-submission
   (or allow it — a new submission simply overwrites the pending request).
2. Seller drops a pin (reverse-geocoded client-side) and confirms.
3. `PATCH /v1/food/restaurant/location` with `{ lat, lng, shop_name?, address? }`.
4. On `400` with the zone-rejection message → show it inline, keep the picker open.
5. On success → branch on `data.restaurant.locationUpdateStatus`:
   - `"none"` → done, show the new location as live.
   - `"pending"` → show the pending-approval banner, keep old location as the one in effect.

---

## 📦 Dart Model

```dart
class StoreLocation {
  final double latitude;
  final double longitude;
  final String address;

  StoreLocation({
    required this.latitude,
    required this.longitude,
    required this.address,
  });

  factory StoreLocation.fromJson(Map<String, dynamic> json) {
    return StoreLocation(
      latitude: (json['latitude'] as num).toDouble(),
      longitude: (json['longitude'] as num).toDouble(),
      address: json['address'] ?? '',
    );
  }
}

class StoreLocationStatus {
  final String name;
  final String? zoneId;
  final StoreLocation? location;           // live location, shown to customers
  final StoreLocation? pendingLocation;    // awaiting admin approval, or null
  final String locationUpdateStatus;       // "none" | "pending" | "approved" | "rejected"
  final String locationRejectionReason;

  StoreLocationStatus({
    required this.name,
    this.zoneId,
    this.location,
    this.pendingLocation,
    required this.locationUpdateStatus,
    required this.locationRejectionReason,
  });

  bool get isPending => locationUpdateStatus == 'pending';
  bool get isRejected => locationUpdateStatus == 'rejected';

  factory StoreLocationStatus.fromRestaurantJson(Map<String, dynamic> restaurant) {
    return StoreLocationStatus(
      name: restaurant['name'] ?? '',
      zoneId: restaurant['zoneId'],
      location: restaurant['location'] != null
          ? StoreLocation.fromJson(restaurant['location'])
          : null,
      pendingLocation: restaurant['pendingLocation'] != null
          ? StoreLocation.fromJson(restaurant['pendingLocation'])
          : null,
      locationUpdateStatus: restaurant['locationUpdateStatus'] ?? 'none',
      locationRejectionReason: restaurant['locationRejectionReason'] ?? '',
    );
  }
}
```

---

## 🛠️ Flutter API Service

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class StoreLocationApiException implements Exception {
  final String message;
  StoreLocationApiException(this.message);
  @override
  String toString() => message;
}

class StoreLocationApiService {
  final String baseUrl; // e.g. https://<your-api-domain>/api
  final String authToken;

  StoreLocationApiService({required this.baseUrl, required this.authToken});

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $authToken',
      };

  /// Screen load: read current live/pending location state.
  Future<StoreLocationStatus> getCurrentLocationStatus() async {
    final response = await http.get(
      Uri.parse('$baseUrl/v1/food/restaurant/current'),
      headers: _headers,
    );
    final decoded = jsonDecode(response.body);
    if (response.statusCode == 200 && decoded['success'] == true) {
      return StoreLocationStatus.fromRestaurantJson(decoded['data']['restaurant']);
    }
    throw StoreLocationApiException(decoded['message'] ?? 'Failed to load store location');
  }

  /// Submit a confirmed pin from the map picker.
  Future<StoreLocationStatus> updateStoreLocation({
    required double lat,
    required double lng,
    String? shopName,
    String? address,
  }) async {
    final response = await http.patch(
      Uri.parse('$baseUrl/v1/food/restaurant/location'),
      headers: _headers,
      body: jsonEncode({
        'lat': lat,
        'lng': lng,
        if (shopName != null) 'shop_name': shopName,
        if (address != null) 'address': address,
      }),
    );

    final decoded = jsonDecode(response.body);
    if (response.statusCode == 200 && decoded['success'] == true) {
      return StoreLocationStatus.fromRestaurantJson(decoded['data']['restaurant']);
    }

    // 400 with the zone-rejection message is the expected "pin outside service area" case —
    // surface decoded['message'] directly to the seller rather than a generic error.
    throw StoreLocationApiException(decoded['message'] ?? 'Failed to update store location');
  }
}
```

### Usage in the map-picker screen

```dart
final api = StoreLocationApiService(baseUrl: apiBaseUrl, authToken: sellerToken);

// 1. On screen load
final status = await api.getCurrentLocationStatus();
if (status.isPending) {
  // show "Location update pending approval" banner; keep rendering status.location on the map
}
if (status.isRejected) {
  // show status.locationRejectionReason, let them resubmit
}

// 2. Seller confirms a pin (reverse-geocoded client-side with Google Maps SDK)
try {
  final updated = await api.updateStoreLocation(
    lat: pickedLatLng.latitude,
    lng: pickedLatLng.longitude,
    shopName: shopNameController.text,
    address: reverseGeocodedAddress,
  );
  if (updated.isPending) {
    // banner: pending approval, keep showing the OLD live location as active
  } else {
    // done — new location is live
  }
} on StoreLocationApiException catch (e) {
  // e.message is user-facing, e.g. "Selected location is outside the service zone..."
  showErrorSnackbar(e.message);
}
```

---

## 🧭 Implementation Note (backend)

This endpoint (`updateRestaurantLocationController` in
`Backend/src/modules/food/restaurant/controllers/restaurant.controller.js`) is a thin
translation layer: it maps `{lat, lng, shop_name, address}` into the nested
`{name, location: {latitude, longitude, address}}` shape and delegates to the same
`updateRestaurantProfile` service function used by `PATCH /v1/food/restaurant/profile`.
The zone-resolution and pending-approval rules therefore live in exactly one place —
this endpoint does not duplicate that logic, so any future change to those rules (e.g.
zone matching, approval requirements) applies to both endpoints automatically.
