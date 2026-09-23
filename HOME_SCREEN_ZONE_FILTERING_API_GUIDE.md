# Home Screen Zone-Based Product Filtering — Flutter Developer Integration Guide

This documents how the customer app's Home Screen gets a product catalog scoped to the
user's current delivery location, and exactly which of the 6 Home Screen APIs actually
changed to support it.

> 💡 Map geocoding, location selection, and catalog grouping (Flash Sale, Best Sellers,
> Recommended, Shop by Brand, etc.) stay entirely client-side. The backend only filters
> the products array — the JSON response shape is unchanged.

---

## 📌 Base Configuration

- **Base URL**: `https://<your-api-domain>/api`
- **Content-Type**: `application/json`
- Most Home Screen endpoints below are public (no `Authorization` header required) except
  where noted.

---

## 📍 How Location Is Passed

Send the user's current coordinates as headers on every Home Screen catalog request:

```http
X-User-Latitude: 19.0760
X-User-Longitude: 72.8777
```

The backend resolves these to the one store that can actually deliver there (same
dark-store distance model used for order placement) and filters the product grid to that
store's shelf. You never need to know or pass a `storeId`/`zoneId` yourself — the headers
are enough.

**If you already have a `storeId`** (e.g. from a store-selection screen, or from calling
`GET /v1/food/restaurant/stores/nearest?lat=&lng=` yourself), pass it directly instead:

```
GET /v1/food/search/products?storeId=64f1a2b3c4d5e6f7a8b9c0d1
```

An explicit `storeId` (or `zoneId`) query param always wins over the headers — the headers
are just a convenience so you don't have to make a separate call before every catalog
fetch.

**No store serves the location** → the endpoint returns a normal `200` with an empty
`products` array (`total: 0`), not an error. Show your usual "not deliverable here" empty
state, driven off `total === 0`, not off a failed request.

---

## 🚀 Endpoint-by-Endpoint Status

| # | Endpoint | Zone filtering | Status |
|---|---|---|---|
| 1 | `GET /v1/food/search/products` | By resolved store, via `X-User-Latitude`/`X-User-Longitude` headers or explicit `storeId` | ✅ Implemented |
| 2 | `GET /v1/food/search/products?categoryId={id}` | Same endpoint, same headers — `categoryId` just narrows further | ✅ Implemented |
| 3 | `GET /v1/food/search/categories/admin` | Optional `zoneId` query param, if you want zone-scoped categories | ✅ Already supported (no change needed) |
| 4 | `GET /v1/food/orders?limit=10` (Buy It Again) | None — match returned order line items against the already zone-filtered `/products` list yourself | No backend change; client-side matching as originally planned |
| 5 | `/hero-banners/public`, `/top-banners/public`, `/hero-banners/home-promotion/public` | **Not implemented** — banners are global, not zone-aware | ⚠️ Out of scope for now |
| 6 | `/v1/food/restaurant/offers` | **Not implemented** — offers filter by `restaurantId`/`userId`, not zone | ⚠️ Out of scope for now |

Items 5 and 6 need a schema change (no `zoneId` field exists on those models yet) and were
deliberately deferred — treat all banners/offers as global for every user for now.

---

## 📦 Dart Model

```dart
class HomeProduct {
  final String id;
  final String restaurantId;
  final String? masterProductId;
  final String name;
  final String? brand;
  final String? packSize;
  final num? netQuantity;
  final String? netQuantityUnit;
  final String? image;
  final List<String> images;
  final num price;
  final num? otherPrice; // strike-through / MRP-adjacent display price, if set
  final num? mrp;
  final String? categoryId;
  final String? categoryName;
  final String? foodType; // "Veg" | "Non-Veg" | ...
  final num rating;
  final int totalRatings;
  final bool isAvailable;
  final int? stockQty;       // null = untracked (still sellable), not "zero"
  final int? maxQtyPerOrder;
  final bool inStockNearby;  // at least one in-range store can sell this right now

  HomeProduct({
    required this.id,
    required this.restaurantId,
    this.masterProductId,
    required this.name,
    this.brand,
    this.packSize,
    this.netQuantity,
    this.netQuantityUnit,
    this.image,
    this.images = const [],
    required this.price,
    this.otherPrice,
    this.mrp,
    this.categoryId,
    this.categoryName,
    this.foodType,
    this.rating = 0,
    this.totalRatings = 0,
    this.isAvailable = true,
    this.stockQty,
    this.maxQtyPerOrder,
    this.inStockNearby = true,
  });

  factory HomeProduct.fromJson(Map<String, dynamic> json) {
    return HomeProduct(
      id: json['_id'] ?? '',
      restaurantId: json['restaurantId'] ?? '',
      masterProductId: json['masterProductId'],
      name: json['name'] ?? '',
      brand: json['brand'],
      packSize: json['packSize'],
      netQuantity: json['netQuantity'],
      netQuantityUnit: json['netQuantityUnit'],
      image: json['image'],
      images: (json['images'] as List?)?.map((e) => e.toString()).toList() ?? [],
      price: json['price'] ?? 0,
      otherPrice: json['otherPrice'],
      mrp: json['mrp'],
      categoryId: json['categoryId'],
      categoryName: json['categoryName'],
      foodType: json['foodType'],
      rating: json['rating'] ?? 0,
      totalRatings: json['totalRatings'] ?? 0,
      isAvailable: json['isAvailable'] ?? true,
      stockQty: json['stockQty'],
      maxQtyPerOrder: json['maxQtyPerOrder'],
      inStockNearby: json['inStockNearby'] == null ? true : json['inStockNearby'] == 1 || json['inStockNearby'] == true,
    );
  }
}

class HomeProductPage {
  final List<HomeProduct> products;
  final int total;
  final int page;
  final int limit;

  HomeProductPage({required this.products, required this.total, required this.page, required this.limit});

  bool get isEmpty => products.isEmpty;

  factory HomeProductPage.fromJson(Map<String, dynamic> data) {
    return HomeProductPage(
      products: (data['products'] as List? ?? [])
          .map((e) => HomeProduct.fromJson(e as Map<String, dynamic>))
          .toList(),
      total: data['total'] ?? 0,
      page: data['page'] ?? 1,
      limit: data['limit'] ?? 20,
    );
  }
}
```

---

## 🛠️ Flutter API Service

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class HomeCatalogApiService {
  final String baseUrl; // e.g. https://<your-api-domain>/api

  HomeCatalogApiService({required this.baseUrl});

  /// Home Catalog, Flash Sale, Best Sellers, Recommended, Shop by Brand, category rows —
  /// all backed by this one call. Pass categoryId to scope a horizontal category row.
  Future<HomeProductPage> fetchHomeProducts({
    required double userLat,
    required double userLng,
    String? categoryId,
    String? q,
    bool? isVeg,
    bool inStockOnly = false,
    int page = 1,
    int limit = 20,
  }) async {
    final query = <String, String>{
      'page': '$page',
      'limit': '$limit',
      if (categoryId != null) 'categoryId': categoryId,
      if (q != null && q.isNotEmpty) 'q': q,
      if (isVeg != null) 'isVeg': '$isVeg',
      if (inStockOnly) 'inStockOnly': 'true',
    };

    final uri = Uri.parse('$baseUrl/v1/food/search/products').replace(queryParameters: query);

    final response = await http.get(
      uri,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Latitude': '$userLat',
        'X-User-Longitude': '$userLng',
      },
    );

    final decoded = jsonDecode(response.body);
    if (response.statusCode == 200 && decoded['success'] == true) {
      return HomeProductPage.fromJson(decoded['data']);
    }
    throw Exception(decoded['message'] ?? 'Failed to load products');
  }

  /// Top category icons grid. zoneId is optional — omit it for the global list.
  Future<List<dynamic>> fetchAdminCategories({String? zoneId}) async {
    final uri = Uri.parse('$baseUrl/v1/food/search/categories/admin')
        .replace(queryParameters: zoneId != null ? {'zoneId': zoneId} : null);
    final response = await http.get(uri);
    final decoded = jsonDecode(response.body);
    if (response.statusCode == 200 && decoded['success'] == true) {
      return decoded['data']['categories'] ?? [];
    }
    throw Exception(decoded['message'] ?? 'Failed to load categories');
  }
}
```

### Usage on the Home Screen

```dart
final api = HomeCatalogApiService(baseUrl: apiBaseUrl);

// Main catalog / Flash Sale / Best Sellers / Recommended / Shop by Brand rows —
// group client-side as today, just from a location-scoped result set now.
final page = await api.fetchHomeProducts(userLat: pos.latitude, userLng: pos.longitude);

if (page.isEmpty) {
  // Show "We don't deliver to this location yet" — this is a normal 200, not an error.
} else {
  // Render Home Catalog grid; slice/group into Flash Sale, Best Sellers, etc. as before.
}

// A category row (e.g. "Fruits & Vegetables")
final categoryPage = await api.fetchHomeProducts(
  userLat: pos.latitude,
  userLng: pos.longitude,
  categoryId: fruitsAndVegCategoryId,
);

// "Buy It Again": fetch order history, then intersect item ids with `page.products`
// yourself — the backend does not zone-filter order history.
```

---

## 🧭 Implementation Note (backend)

`X-User-Latitude`/`X-User-Longitude` are read by `resolveStoreFromLocationHeaders`
(`Backend/src/modules/food/search/controllers/search.controller.js`), which runs **before**
the response-cache middleware on this route and resolves the headers to a `storeId` via the
same `assignStoreForCustomer` logic used by `GET /v1/food/restaurant/stores/nearest`. This
keeps the 30s response cache correct and effective: it keys by the resolved store rather
than by raw GPS coordinates, so two users assigned to the same store share a cache entry,
and one user's location never leaks into another's cached response.
