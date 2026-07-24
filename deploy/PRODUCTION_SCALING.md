# Production scaling notes for Hostinger KVM2

## What changed in code
- Public search now uses Redis caching with normalized query-string keys.
- Cached endpoints now generate stable keys even if query parameters arrive in different order.
- API background intervals were separated from clustered API processes.
- Added a standalone scheduler process for offer expiry, FSSAI sync, and stuck-order recovery.
- Added a dedicated socket server process on port 5001.
- Clustered API processes still initialize Socket.IO internally so Redis-backed emits from API code keep working.
- Added a PM2 ecosystem file for clustered API + dedicated socket + workers.

## Recommended process layout
- `switcheats-api`: PM2 cluster mode, `instances: max`, port `5000`
- `switcheats-socket`: single dedicated socket server, port `5001`
- `switcheats-scheduler`: single instance
- BullMQ workers: single-purpose forked processes

## Environment variables for API cluster
Set these for the clustered API app:
- `NODE_ENV=production`
- `PORT=5000`
- `SOCKET_PORT=5001`
- `REDIS_ENABLED=true`
- `BULLMQ_ENABLED=true`
- `SERVER_BACKGROUND_JOBS_ENABLED=false`
- `SERVER_QUEUE_BOOTSTRAP_ENABLED=false`

## PM2 commands
Run from repo root:
```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup
```

## Nginx
Use `deploy/nginx-hostinger-kvm2.conf.example` as the starting point.
Important pieces already included:
- `/api/` proxied to `127.0.0.1:5000`
- `/socket.io/` proxied to `127.0.0.1:5001`
- websocket upgrade headers
- gzip for JSON/text payloads
- direct file serving for `/uploads/`
- basic request throttling

## MongoDB indexes to add next
Add these if they are not already present:
- `FoodRestaurant: { status: 1, zoneId: 1, rating: -1, createdAt: -1 }`
- `FoodRestaurant: { status: 1, estimatedDeliveryTimeMinutes: 1 }`
- `FoodRestaurant: { restaurantNameNormalized: 1, status: 1 }`
- `FoodItem: { restaurantId: 1, approvalStatus: 1, isRecommended: 1, createdAt: -1 }`
- `FoodItem: { categoryId: 1, approvalStatus: 1, restaurantId: 1 }`
- `FoodItem: { name: 1, approvalStatus: 1 }`

## Rollout order
1. Ensure Redis is enabled and healthy.
2. Start PM2 with the new ecosystem file.
3. Put Nginx in front using the example config.
4. Watch `pm2 monit`, MongoDB slow queries, and Redis memory.
5. Add indexes during a low-traffic window.
