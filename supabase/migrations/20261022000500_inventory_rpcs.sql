-- Service-role-only inventory transaction functions.

create or replace function public.inv_next_document_number(
  p_tenant_id uuid,
  p_document_type text,
  p_document_date date default current_date
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_type text := upper(btrim(p_document_type));
  period_start date := date_trunc('month', coalesce(p_document_date, current_date)::timestamptz)::date;
  next_number bigint;
begin
  if normalized_type not in ('MR', 'SQ', 'PR', 'PO', 'IR', 'RIS', 'SR', 'SC', 'SM') then
    raise exception 'Unsupported inventory document type.';
  end if;

  if not exists (select 1 from public.tenants where id = p_tenant_id and active) then
    raise exception 'Active inventory tenant was not found.';
  end if;

  insert into public.inv_document_counters (tenant_id, document_type, period_month, last_number)
  values (p_tenant_id, normalized_type, period_start, 1)
  on conflict (tenant_id, document_type, period_month) do update
    set last_number = public.inv_document_counters.last_number + 1
  returning last_number into next_number;

  return normalized_type || '-' || to_char(period_start, 'YYYYMM') || '-' || lpad(next_number::text, 6, '0');
end
$$;

create or replace function public.inv_create_material_request(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_requester_personnel_id uuid,
  p_job text,
  p_requested_on date,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_id uuid;
  request_number text;
  line_count integer;
  distinct_line_count integer;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id and active) then
    raise exception 'Active inventory tenant was not found.';
  end if;
  if not exists (select 1 from public.app_users where id = p_actor_user_id and active) then
    raise exception 'Active inventory actor was not found.';
  end if;
  if p_requester_personnel_id is not null and not exists (
    select 1 from public.personnel
    where tenant_id = p_tenant_id and id = p_requester_personnel_id and active
  ) then
    raise exception 'Requester personnel was not found in the authorized tenant.';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Material request requires at least one line.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_lines) line
    where jsonb_typeof(line) <> 'object'
      or coalesce(line->>'lineNo', '') !~ '^[1-9][0-9]*$'
      or coalesce(line->>'itemId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(line->>'quantity', '') !~ '^[0-9]+([.][0-9]+)?$'
      or (line->>'quantity')::numeric <= 0
  ) then
    raise exception 'Material request line is invalid.';
  end if;

  select count(*), count(distinct (line->>'lineNo')::integer)
  into line_count, distinct_line_count
  from jsonb_array_elements(p_lines) line;

  if line_count <> distinct_line_count then
    raise exception 'Material request line numbers must be unique.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_lines) line
    left join public.inv_inventory_items item
      on item.tenant_id = p_tenant_id and item.id = (line->>'itemId')::uuid and item.active
    where item.id is null
  ) then
    raise exception 'Material request items must belong to the authorized tenant.';
  end if;

  request_number := public.inv_next_document_number(p_tenant_id, 'MR', coalesce(p_requested_on, current_date));
  insert into public.inv_material_requests (
    tenant_id, request_no, requester_personnel_id, job, requested_on
  ) values (
    p_tenant_id, request_number, p_requester_personnel_id, nullif(btrim(p_job), ''), coalesce(p_requested_on, current_date)
  ) returning id into request_id;

  insert into public.inv_material_request_lines (
    tenant_id, material_request_id, line_no, item_id, quantity, specification
  )
  select
    p_tenant_id,
    request_id,
    (line->>'lineNo')::integer,
    (line->>'itemId')::uuid,
    (line->>'quantity')::numeric,
    nullif(btrim(line->>'specification'), '')
  from jsonb_array_elements(p_lines) line
  order by (line->>'lineNo')::integer;

  insert into public.audit_events (
    tenant_id, entity_type, entity_id, action, after_data, actor_user_id
  ) values (
    p_tenant_id,
    'inv_material_request',
    request_id,
    'create',
    jsonb_build_object('requestNo', request_number, 'lineCount', line_count),
    p_actor_user_id
  );

  return jsonb_build_object(
    'requestId', request_id,
    'requestNo', request_number,
    'version', 1,
    'status', 'draft'
  );
end
$$;

create or replace function public.inv_post_stock_movement(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_movement_type text,
  p_source_type text,
  p_source_reference text,
  p_idempotency_key text,
  p_notes text,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  movement_id uuid;
  movement_posted_at timestamptz;
  movement_type_value text := lower(btrim(p_movement_type));
  idempotency_value text := btrim(p_idempotency_key);
  input_count integer;
  distinct_count integer;
  stock_line record;
  old_balance public.inv_inventory_balances%rowtype;
  new_quantity numeric;
  new_value numeric;
  applied_cost numeric;
  applied_value numeric;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id and active) then
    raise exception 'Active inventory tenant was not found.';
  end if;
  if not exists (select 1 from public.app_users where id = p_actor_user_id and active) then
    raise exception 'Active inventory actor was not found.';
  end if;
  if movement_type_value not in ('receipt', 'issue', 'transfer', 'adjustment', 'return', 'writeoff') then
    raise exception 'Unsupported stock movement type.';
  end if;
  if idempotency_value is null or idempotency_value = '' then
    raise exception 'Stock movement idempotency key is required.';
  end if;

  select id, posted_at
  into movement_id, movement_posted_at
  from public.inv_stock_movements
  where tenant_id = p_tenant_id
    and idempotency_key = btrim(p_idempotency_key);

  if found then
    return jsonb_build_object('movementId', movement_id, 'postedAt', movement_posted_at, 'replayed', true);
  end if;

  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Stock movement requires at least one line.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_lines) line
    where jsonb_typeof(line) <> 'object'
      or coalesce(line->>'lineNo', '') !~ '^[1-9][0-9]*$'
      or coalesce(line->>'itemId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(line->>'locationId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(line->>'signedQuantity', '') !~ '^-?[0-9]+([.][0-9]+)?$'
      or (line->>'signedQuantity')::numeric = 0
      or coalesce(line->>'unitCost', '') !~ '^[0-9]+([.][0-9]+)?$'
      or (line->>'unitCost')::numeric < 0
      or (line ? 'assetId' and line->>'assetId' is not null and line->>'assetId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  ) then
    raise exception 'Stock movement line is invalid.';
  end if;

  select count(*), count(distinct (line->>'lineNo')::integer)
  into input_count, distinct_count
  from jsonb_array_elements(p_lines) line;
  if input_count <> distinct_count then
    raise exception 'Stock movement line numbers must be unique.';
  end if;

  create temporary table if not exists inv_stock_post_work (
    line_no integer not null,
    item_id uuid not null,
    location_id uuid not null,
    signed_quantity numeric not null,
    submitted_cost numeric not null,
    asset_id uuid
  ) on commit delete rows;
  truncate table inv_stock_post_work;

  insert into inv_stock_post_work (line_no, item_id, location_id, signed_quantity, submitted_cost, asset_id)
  select
    (line->>'lineNo')::integer,
    (line->>'itemId')::uuid,
    (line->>'locationId')::uuid,
    (line->>'signedQuantity')::numeric,
    (line->>'unitCost')::numeric,
    nullif(line->>'assetId', '')::uuid
  from jsonb_array_elements(p_lines) line;

  if exists (
    select 1
    from inv_stock_post_work work
    left join public.inv_inventory_items item
      on item.tenant_id = p_tenant_id and item.id = work.item_id and item.active
    left join public.inv_storage_locations location
      on location.tenant_id = p_tenant_id and location.id = work.location_id and location.active
    left join public.inv_inventory_assets asset
      on asset.tenant_id = p_tenant_id and asset.id = work.asset_id and asset.item_id = work.item_id
    where item.id is null or location.id is null or (work.asset_id is not null and asset.id is null)
  ) then
    raise exception 'Stock movement references must belong to the authorized tenant.';
  end if;
  if exists (
    select 1
    from inv_stock_post_work
    group by item_id, location_id, asset_id
    having min(sign(signed_quantity)) <> max(sign(signed_quantity))
  ) then
    raise exception 'Duplicate stock lines for one balance must use the same direction.';
  end if;

  insert into public.inv_stock_movements (
    tenant_id, movement_type, source_type, source_reference, idempotency_key, actor_user_id, notes
  ) values (
    p_tenant_id,
    movement_type_value,
    nullif(btrim(p_source_type), ''),
    nullif(btrim(p_source_reference), ''),
    idempotency_value,
    p_actor_user_id,
    nullif(btrim(p_notes), '')
  )
  on conflict (tenant_id, idempotency_key) do nothing
  returning id into movement_id;

  if movement_id is null then
    select id, posted_at
    into movement_id, movement_posted_at
    from public.inv_stock_movements
    where tenant_id = p_tenant_id
      and idempotency_key = idempotency_value;
    return jsonb_build_object('movementId', movement_id, 'postedAt', movement_posted_at, 'replayed', true);
  end if;

  insert into public.inv_inventory_balances (tenant_id, item_id, location_id)
  select distinct p_tenant_id, item_id, location_id
  from inv_stock_post_work
  on conflict (tenant_id, item_id, location_id) do nothing;

  perform 1
  from public.inv_inventory_balances balance
  join (
    select distinct item_id, location_id
    from inv_stock_post_work
  ) work using (item_id, location_id)
  where balance.tenant_id = p_tenant_id
  order by item_id, location_id
  for update of balance;

  for stock_line in
    select
      min(line_no) as line_no,
      item_id,
      location_id,
      asset_id,
      sum(signed_quantity) as signed_quantity,
      sum(signed_quantity * submitted_cost) as submitted_value
    from inv_stock_post_work
    group by item_id, location_id, asset_id
    order by item_id, location_id, asset_id nulls first
  loop
    select * into strict old_balance
    from public.inv_inventory_balances
    where tenant_id = p_tenant_id
      and item_id = stock_line.item_id
      and location_id = stock_line.location_id
    for update;

    new_quantity := old_balance.quantity + stock_line.signed_quantity;
    if new_quantity < 0 then
      raise exception 'Insufficient stock for item % at location %.', stock_line.item_id, stock_line.location_id;
    end if;

    if stock_line.signed_quantity > 0 then
      applied_value := stock_line.submitted_value;
      applied_cost := applied_value / stock_line.signed_quantity;
    else
      applied_cost := old_balance.average_cost;
      applied_value := stock_line.signed_quantity * applied_cost;
    end if;
    new_value := case when new_quantity = 0 then 0 else old_balance.inventory_value + applied_value end;
    if new_value < 0 then
      raise exception 'Stock movement would create a negative inventory value.';
    end if;

    update public.inv_inventory_balances
    set quantity = new_quantity,
        inventory_value = new_value,
        average_cost = case when new_quantity = 0 then 0 else new_value / new_quantity end,
        version = version + 1,
        updated_at = now()
    where tenant_id = p_tenant_id
      and item_id = stock_line.item_id
      and location_id = stock_line.location_id;

    insert into public.inv_stock_movement_lines (
      tenant_id, movement_id, line_no, item_id, location_id,
      signed_quantity, unit_cost, value_delta, balance_after, asset_id
    ) values (
      p_tenant_id, movement_id, stock_line.line_no, stock_line.item_id, stock_line.location_id,
      stock_line.signed_quantity, applied_cost, applied_value, new_quantity, stock_line.asset_id
    );
  end loop;

  movement_posted_at := now();
  update public.inv_stock_movements
  set posted_at = movement_posted_at,
      updated_at = movement_posted_at
  where tenant_id = p_tenant_id and id = movement_id;

  insert into public.audit_events (
    tenant_id, entity_type, entity_id, action, after_data, actor_user_id
  ) values (
    p_tenant_id,
    'inv_stock_movement',
    movement_id,
    'post',
    jsonb_build_object(
      'movementType', movement_type_value,
      'idempotencyKey', idempotency_value,
      'lineCount', input_count,
      'postedAt', movement_posted_at
    ),
    p_actor_user_id
  );

  return jsonb_build_object('movementId', movement_id, 'postedAt', movement_posted_at, 'replayed', false);
end
$$;

revoke all on function public.inv_next_document_number(uuid, text, date) from public, anon, authenticated;
grant execute on function public.inv_next_document_number(uuid, text, date) to service_role;

revoke all on function public.inv_create_material_request(uuid, uuid, uuid, text, date, jsonb) from public, anon, authenticated;
grant execute on function public.inv_create_material_request(uuid, uuid, uuid, text, date, jsonb) to service_role;

revoke all on function public.inv_post_stock_movement(uuid, uuid, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.inv_post_stock_movement(uuid, uuid, text, text, text, text, text, jsonb) to service_role;
