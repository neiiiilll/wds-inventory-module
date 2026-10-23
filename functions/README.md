# Inventory Firebase Functions — rollback only

The canonical Inventory API is the Supabase Apps Core `inventory-api` Edge Function. This Node.js 22, second-generation Firebase Functions source remains temporarily buildable for rollback during the Edge cutover. It is isolated as Firebase codebase `inventory`, uses `asia-southeast1`, and must never modify or delete the separate `serviceDesk` function.

Do not deploy this directory during the normal Edge release. A rollback requires an explicit decision and this exact command:

```sh
npm run test:functions
npm run build:functions
npm run deploy:functions:rollback
```

The rollback functions use only the Firebase JSON secret `INVENTORY_BACKEND`; they never use or modify Service Desk's `SERVICE_DESK_BACKEND`. Do not print, copy into React, or commit either secret.

## Rollback callable reference

### provisionInventoryAccess

Rollback purpose: validate existing access and synchronize the legacy Firebase tenant claim. Input: `{}`. Output: access status, Firebase identity fields, tenant key, role key, and the legacy claim-refresh indicator. Reads shared authorization records and may update Inventory's `tenant_id` claim through Firebase Admin. It does not create memberships or roles. Secret: `INVENTORY_BACKEND`.

### listInventoryItems

Rollback purpose: list tenant catalog items and aggregate balances. Input: optional search, limit, and opaque cursor. Output: items and next cursor. Reads tenant-filtered `inv_inventory_items`, `inv_inventory_balances`, `inv_categories`, and `inv_units`. Secret: `INVENTORY_BACKEND`.

### updateInventoryItem

Rollback purpose: update allowed item fields with optimistic concurrency. Input: item ID, expected version, and allowlisted changes. Output: updated item. Updates tenant-filtered `inv_inventory_items` and reads reference/balance data. Secret: `INVENTORY_BACKEND`.

### createMaterialRequest

Rollback purpose: create an atomic draft request. Input: optional requester/job/date and validated lines. Output: request ID, number, version, and draft status. Calls `inv_create_material_request`; writes only the RPC's authorized Inventory and audit objects. Secret: `INVENTORY_BACKEND`.

### postStockMovement

Rollback purpose: atomically post an idempotent stock movement. Input: movement metadata, idempotency key, and validated lines. Output: movement ID, posting time, and replay status. Calls `inv_post_stock_movement`; writes only the RPC's authorized Inventory and audit objects. Secret: `INVENTORY_BACKEND`.

All rollback callables require Firebase authentication and verified email. Business calls also require the legacy valid `tenant_id` claim, one active database membership, active tenant/application, and explicit allowed Inventory role. They reject caller-supplied tenant, actor, role, status, document number, and replacement-version authority fields.

## Retirement safety

After the Edge-backed production client passes tenant A/B acceptance, list Firebase Functions, delete only the five Inventory names, and list again to confirm `serviceDesk` remains. Keep this source until the agreed rollback window closes. Do not delete `INVENTORY_BACKEND` as part of the initial Function retirement.
