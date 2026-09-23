# Seller Zone Management APIs — Flutter Developer Integration Guide

This guide details how to integrate the **Seller Zone Management APIs** in the Seller/Restaurant Flutter app.

---

## 📌 Base Configuration

- **Base URL**: `https://<your-api-domain>/api`
- **Authentication Header**: `Authorization: Bearer <SELLER_JWT_TOKEN>`
- **Content-Type**: `application/json`

---

## 📦 1. Data Model (Dart `ZoneModel`)

Use this Dart model class to parse API responses:

```dart
class SellerZoneModel {
  final String id;
  final String? sellerId;
  final String name;
  final double centerLat;
  final double centerLng;
  final int radiusM;
  final bool isActive;
  final String createdAt;
  final String updatedAt;

  SellerZoneModel({
    required this.id,
    this.sellerId,
    required this.name,
    required this.centerLat,
    required this.centerLng,
    required this.radiusM,
    required this.isActive,
    required this.createdAt,
    required this.updatedAt,
  });

  factory SellerZoneModel.fromJson(Map<String, dynamic> json) {
    return SellerZoneModel(
      id: json['id'] ?? '',
      sellerId: json['seller_id'],
      name: json['name'] ?? '',
      centerLat: (json['center_lat'] as num).toDouble(),
      centerLng: (json['center_lng'] as num).toDouble(),
      radiusM: (json['radius_m'] as num).toInt(),
      isActive: json['is_active'] ?? false,
      createdAt: json['created_at'] ?? '',
      updatedAt: json['updated_at'] ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'seller_id': sellerId,
      'name': name,
      'center_lat': centerLat,
      'center_lng': centerLng,
      'radius_m': radiusM,
      'is_active': isActive,
      'created_at': createdAt,
      'updated_at': updatedAt,
    };
  }
}
```

---

## 🚀 2. API Endpoints Reference

### 1️⃣ List All Seller Zones (Screen Load)

Fetch all delivery zones configured for the logged-in seller.

- **Method**: `GET`
- **Path**: `/api/seller/zones` (or `/api/v1/seller/zones`)
- **Headers**: `Authorization: Bearer <token>`

#### Response `200 OK`
```json
{
  "success": true,
  "data": [
    {
      "id": "6741abf2e12a9b0012345678",
      "seller_id": "6741a001e12a9b0087654321",
      "name": "Zone 1 (Default)",
      "center_lat": 19.0760,
      "center_lng": 72.8777,
      "radius_m": 5000,
      "is_active": true,
      "created_at": "2026-09-23T10:00:00.000Z",
      "updated_at": "2026-09-23T10:00:00.000Z"
    }
  ]
}
```

---

### 2️⃣ Add New Zone ("Add New Zone" Button)

Create a new circular delivery zone on map setup.

- **Method**: `POST`
- **Path**: `/api/seller/zones`
- **Headers**: `Authorization: Bearer <token>`

#### Request Body
```json
{
  "name": "Zone 2",
  "center_lat": 19.0821,
  "center_lng": 72.8416,
  "radius_m": 3000
}
```

#### Validation Rules (Server Side)
- `center_lat`: Must be valid latitude between `-90.0` and `90.0`.
- `center_lng`: Must be valid longitude between `-180.0` and `180.0`.
- `radius_m`: Integer between `500` (500m / 0.5km) and `50000` (50km).
- **Auto-Activate Logic**: If this is the seller's first zone, the server automatically sets `is_active = true`.

#### Response `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "6741ac03e12a9b0012345679",
    "seller_id": "6741a001e12a9b0087654321",
    "name": "Zone 2",
    "center_lat": 19.0821,
    "center_lng": 72.8416,
    "radius_m": 3000,
    "is_active": false,
    "created_at": "2026-09-23T12:00:00.000Z",
    "updated_at": "2026-09-23T12:00:00.000Z"
  }
}
```

#### Error Response `400 Bad Request`
```json
{
  "success": false,
  "message": "radius_m must be an integer between 500 and 50000 meters"
}
```

---

### 3️⃣ Edit Zone ("Edit Zone" Button)

Update center point, radius, or zone name.

- **Method**: `PUT`
- **Path**: `/api/seller/zones/{zone_id}`
- **Headers**: `Authorization: Bearer <token>`

#### Request Body (Pass updated fields)
```json
{
  "name": "Zone 1 - Updated",
  "center_lat": 19.0770,
  "center_lng": 72.8790,
  "radius_m": 6000
}
```

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "6741abf2e12a9b0012345678",
    "seller_id": "6741a001e12a9b0087654321",
    "name": "Zone 1 - Updated",
    "center_lat": 19.0770,
    "center_lng": 72.8790,
    "radius_m": 6000,
    "is_active": true,
    "created_at": "2026-09-23T10:00:00.000Z",
    "updated_at": "2026-09-23T12:10:00.000Z"
  }
}
```

#### Error Response `404 Not Found`
```json
{
  "success": false,
  "message": "Zone not found"
}
```

---

### 4️⃣ Activate Zone (Select Active Zone)

Set a zone as active for the seller.

- **Method**: `PATCH`
- **Path**: `/api/seller/zones/{zone_id}/activate`
- **Headers**: `Authorization: Bearer <token>`
- **Request Body**: Empty `{}`

> 💡 **Behavior Note**: Activating this zone sets `is_active = true` for it and automatically sets `is_active = false` for all other zones of this seller.

#### Response `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "6741abf2e12a9b0012345678",
    "is_active": true
  }
}
```

---

### 5️⃣ Delete Zone

Delete a seller zone.

- **Method**: `DELETE`
- **Path**: `/api/seller/zones/{zone_id}`
- **Headers**: `Authorization: Bearer <token>`

> 💡 **Behavior Note**: If the active zone is deleted, the backend automatically activates the seller's most recently created remaining zone.

#### Response `200 OK`
```json
{
  "success": true
}
```

---

## 🛠️ 3. Flutter Example Service Implementation (`Dio` / `http`)

Here is a ready-to-use Flutter API Service class:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class SellerZoneApiService {
  final String baseUrl;
  final String authToken;

  SellerZoneApiService({
    required this.baseUrl,
    required this.authToken,
  });

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $authToken',
      };

  /// 1. Fetch List of Zones
  Future<List<SellerZoneModel>> getSellerZones() async {
    final response = await http.get(
      Uri.parse('$baseUrl/seller/zones'),
      headers: _headers,
    );

    if (response.statusCode == 200) {
      final decoded = jsonDecode(response.body);
      final List list = decoded['data'] ?? [];
      return list.map((item) => SellerZoneModel.fromJson(item)).toList();
    } else {
      throw Exception('Failed to load seller zones');
    }
  }

  /// 2. Add New Zone
  Future<SellerZoneModel> createZone({
    required String name,
    required double centerLat,
    required double centerLng,
    required int radiusM,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/seller/zones'),
      headers: _headers,
      body: jsonEncode({
        'name': name,
        'center_lat': centerLat,
        'center_lng': centerLng,
        'radius_m': radiusM,
      }),
    );

    final decoded = jsonDecode(response.body);
    if (response.statusCode == 201 && decoded['success'] == true) {
      return SellerZoneModel.fromJson(decoded['data']);
    } else {
      throw Exception(decoded['message'] ?? 'Failed to create zone');
    }
  }

  /// 3. Update Zone
  Future<SellerZoneModel> updateZone({
    required String zoneId,
    String? name,
    double? centerLat,
    double? centerLng,
    int? radiusM,
  }) async {
    final body = <String, dynamic>{};
    if (name != null) body['name'] = name;
    if (centerLat != null) body['center_lat'] = centerLat;
    if (centerLng != null) body['center_lng'] = centerLng;
    if (radiusM != null) body['radius_m'] = radiusM;

    final response = await http.put(
      Uri.parse('$baseUrl/seller/zones/$zoneId'),
      headers: _headers,
      body: jsonEncode(body),
    );

    final decoded = jsonDecode(response.body);
    if (response.statusCode == 200 && decoded['success'] == true) {
      return SellerZoneModel.fromJson(decoded['data']);
    } else {
      throw Exception(decoded['message'] ?? 'Failed to update zone');
    }
  }

  /// 4. Activate Zone
  Future<bool> activateZone(String zoneId) async {
    final response = await http.patch(
      Uri.parse('$baseUrl/seller/zones/$zoneId/activate'),
      headers: _headers,
    );

    final decoded = jsonDecode(response.body);
    if (response.statusCode == 200 && decoded['success'] == true) {
      return true;
    } else {
      throw Exception(decoded['message'] ?? 'Failed to activate zone');
    }
  }

  /// 5. Delete Zone
  Future<bool> deleteZone(String zoneId) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/seller/zones/$zoneId'),
      headers: _headers,
    );

    final decoded = jsonDecode(response.body);
    if (response.statusCode == 200 && decoded['success'] == true) {
      return true;
    } else {
      throw Exception(decoded['message'] ?? 'Failed to delete zone');
    }
  }
}
```

---

## 🎨 4. Flutter UI Tips (Google Maps / Mapbox Circle Rendering)

- **Map Circle Overlay**: Use Flutter's `Circle` object in `GoogleMap` widget:
  ```dart
  Circle(
    circleId: CircleId(zone.id),
    center: LatLng(zone.centerLat, zone.centerLng),
    radius: zone.radiusM.toDouble(), // Radius in meters
    strokeWidth: 2,
    strokeColor: zone.isActive ? Colors.blue : Colors.grey,
    fillColor: (zone.isActive ? Colors.blue : Colors.grey).withOpacity(0.2),
  );
  ```
- **Radius Input**: Ensure radius input in UI has validation `500` to `50000` meters (0.5km - 50km).

---

## 📱 5. User App Integration (Check Seller Serviceability for User Location)

User App me jab customer kisi specific restaurant/seller se order karna chahta hai ya restaurant details dekh raha ho, tab check karne ke liye ki user customer seller ke active circle delivery zone ke andar hai ya nahi:

### Endpoint: `GET /api/v1/food/zones/seller-check`

- **Method**: `GET`
- **Query Params**:
  - `sellerId`: Restaurant / Store ObjectId (e.g. `6741a001e12a9b0087654321`)
  - `lat`: User's current latitude (e.g. `19.0780`)
  - `lng`: User's current longitude (e.g. `72.8750`)

#### Response `200 OK` (Inside Delivery Zone)
```json
{
  "success": true,
  "message": "Location is serviceable by seller",
  "data": {
    "isServiceable": true,
    "distanceMeters": 1250,
    "activeZone": {
      "id": "6741abf2e12a9b0012345678",
      "name": "Zone 1",
      "center_lat": 19.0760,
      "center_lng": 72.8777,
      "radius_m": 5000,
      "is_active": true
    }
  }
}
```

#### Response `200 OK` (Outside Delivery Zone)
```json
{
  "success": true,
  "message": "Location is out of seller service zone",
  "data": {
    "isServiceable": false,
    "distanceMeters": 7800,
    "activeZone": {
      "id": "6741abf2e12a9b0012345678",
      "name": "Zone 1",
      "center_lat": 19.0760,
      "center_lng": 72.8777,
      "radius_m": 5000,
      "is_active": true
    }
  }
}
```

### Flutter User App Example Method

```dart
Future<bool> checkSellerServiceability({
  required String sellerId,
  required double userLat,
  required double userLng,
}) async {
  final url = Uri.parse('$baseUrl/v1/food/zones/seller-check?sellerId=$sellerId&lat=$userLat&lng=$userLng');
  final response = await http.get(url);

  if (response.statusCode == 200) {
    final decoded = jsonDecode(response.body);
    return decoded['data']?['isServiceable'] ?? false;
  }
  return false;
}
```

