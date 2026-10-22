begin;

create extension if not exists pgtap;
select plan(19);

insert into public.tenants (id, tenant_key, name)
values
  ('10000000-0000-0000-0000-000000000001', 'rpc-test-one', 'RPC Test One'),
  ('10000000-0000-0000-0000-000000000002', 'rpc-test-two', 'RPC Test Two')
on conflict (id) do nothing;

insert into public.app_users (id, firebase_uid, email, display_name)
values ('20000000-0000-0000-0000-000000000001', 'rpc-test-user', 'rpc@example.test', 'RPC Tester')
on conflict (id) do nothing;

insert into public.personnel (id, tenant_id, employee_code, full_name, user_id)
values (
  '30000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'RPC-001',
  'RPC Tester',
  '20000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

insert into public.inv_categories (id, tenant_id, code, name)
values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'CAT', 'Category'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'CAT', 'Category')
on conflict (id) do nothing;

insert into public.inv_units (id, tenant_id, code, name)
values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'EA', 'Each'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'EA', 'Each')
on conflict (id) do nothing;

insert into public.inv_warehouses (id, tenant_id, code, name)
values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'MAIN', 'Main'),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'MAIN', 'Main')
on conflict (id) do nothing;

insert into public.inv_storage_locations (id, tenant_id, warehouse_id, location_code)
values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'A-01'),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', 'A-01')
on conflict (id) do nothing;

insert into public.inv_inventory_items (id, tenant_id, item_code, name, category_id, unit_id)
values
  ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'ITEM-1', 'Item One', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'ITEM-2', 'Item Two', '40000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

select is(
  public.inv_next_document_number('10000000-0000-0000-0000-000000000001', 'MR', '2026-10-22'),
  'MR-202610-000001',
  'first monthly document number starts at one'
);
select is(
  public.inv_next_document_number('10000000-0000-0000-0000-000000000001', 'MR', '2026-10-22'),
  'MR-202610-000002',
  'same tenant and month increments atomically'
);
select is(
  public.inv_next_document_number('10000000-0000-0000-0000-000000000002', 'MR', '2026-10-22'),
  'MR-202610-000001',
  'another tenant has an independent sequence'
);

select ok(
  (public.inv_create_material_request(
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'Pump maintenance',
    '2026-10-22',
    '[{"lineNo":1,"itemId":"80000000-0000-0000-0000-000000000001","quantity":2,"specification":"New"}]'
  )->>'requestId') is not null,
  'material request returns its identifier'
);
select is((select count(*)::integer from public.inv_material_requests where tenant_id = '10000000-0000-0000-0000-000000000001'), 1, 'material request header is persisted');
select is((select count(*)::integer from public.inv_material_request_lines where tenant_id = '10000000-0000-0000-0000-000000000001'), 1, 'material request lines are persisted');
select is((select count(*)::integer from public.audit_events where tenant_id = '10000000-0000-0000-0000-000000000001' and entity_type = 'inv_material_request'), 1, 'material request is audited');

select ok(
  (public.inv_post_stock_movement(
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'receipt', null, null, 'receipt-0001', null,
    '[{"lineNo":1,"itemId":"80000000-0000-0000-0000-000000000001","locationId":"70000000-0000-0000-0000-000000000001","signedQuantity":10,"unitCost":5}]'
  )->>'movementId') is not null,
  'receipt returns its movement identifier'
);
select is((select quantity from public.inv_inventory_balances where tenant_id = '10000000-0000-0000-0000-000000000001'), 10::numeric, 'receipt increases quantity');
select is((select inventory_value from public.inv_inventory_balances where tenant_id = '10000000-0000-0000-0000-000000000001'), 50::numeric, 'receipt increases value');

select lives_ok($$
  select public.inv_post_stock_movement(
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'issue', null, null, 'issue-0001', null,
    '[{"lineNo":1,"itemId":"80000000-0000-0000-0000-000000000001","locationId":"70000000-0000-0000-0000-000000000001","signedQuantity":-2,"unitCost":999}]'
  )
$$, 'issue posts with stored average cost');
select is((select inventory_value from public.inv_inventory_balances where tenant_id = '10000000-0000-0000-0000-000000000001'), 40::numeric, 'issue ignores caller cost and uses average cost');

select is(
  public.inv_post_stock_movement(
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'receipt', null, null, 'receipt-0001', null,
    '[{"lineNo":1,"itemId":"80000000-0000-0000-0000-000000000001","locationId":"70000000-0000-0000-0000-000000000001","signedQuantity":10,"unitCost":5}]'
  )->>'replayed',
  'true',
  'duplicate idempotency key replays the original movement'
);
select is((select quantity from public.inv_inventory_balances where tenant_id = '10000000-0000-0000-0000-000000000001'), 8::numeric, 'idempotent replay does not change balance');

select throws_ok($$
  select public.inv_post_stock_movement(
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'receipt', null, null, 'cross-tenant', null,
    '[{"lineNo":1,"itemId":"80000000-0000-0000-0000-000000000002","locationId":"70000000-0000-0000-0000-000000000001","signedQuantity":1,"unitCost":5}]'
  )
$$, 'P0001', 'Stock movement references must belong to the authorized tenant.', 'cross-tenant item is rejected');
select throws_ok($$
  select public.inv_post_stock_movement(
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'issue', null, null, 'insufficient', null,
    '[{"lineNo":1,"itemId":"80000000-0000-0000-0000-000000000001","locationId":"70000000-0000-0000-0000-000000000001","signedQuantity":-100,"unitCost":0}]'
  )
$$, 'P0001', 'Insufficient stock for item 80000000-0000-0000-0000-000000000001 at location 70000000-0000-0000-0000-000000000001.', 'insufficient stock is rejected');
select throws_ok($$
  select public.inv_post_stock_movement(
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'receipt', null, null, 'mixed-tenant-batch', null,
    '[{"lineNo":1,"itemId":"80000000-0000-0000-0000-000000000001","locationId":"70000000-0000-0000-0000-000000000001","signedQuantity":1,"unitCost":5},{"lineNo":2,"itemId":"80000000-0000-0000-0000-000000000002","locationId":"70000000-0000-0000-0000-000000000001","signedQuantity":1,"unitCost":5}]'
  )
$$, 'P0001', 'Stock movement references must belong to the authorized tenant.', 'a later invalid line rolls back the whole batch');
select is((select count(*)::integer from public.inv_stock_movements where idempotency_key = 'mixed-tenant-batch'), 0, 'failed multi-line post leaves no movement header');
select is((select quantity from public.inv_inventory_balances where tenant_id = '10000000-0000-0000-0000-000000000001'), 8::numeric, 'failed posts leave balances unchanged');

select * from finish();
rollback;
