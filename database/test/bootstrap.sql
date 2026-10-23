-- Deliberately synthetic fixtures, only applied inside the runner-owned cluster.
insert into tenants(id, tenant_key, name) values
 ('10000000-0000-4000-8000-000000000001','fixture-a','Fixture A'),
 ('10000000-0000-4000-8000-000000000002','fixture-b','Fixture B');
insert into app_users(id,firebase_uid,display_name,active) values
 ('20000000-0000-4000-8000-000000000001','fixture-admin-a','Fixture Administrator',true),
 ('20000000-0000-4000-8000-000000000002','fixture-staff-a','Fixture Staff',true),
 ('20000000-0000-4000-8000-000000000003','fixture-viewer-a','Fixture Viewer',true),
 ('20000000-0000-4000-8000-000000000004','fixture-admin-b','Fixture Administrator B',true),
 ('20000000-0000-4000-8000-000000000005','fixture-inactive-a','Fixture Inactive',false);
insert into tenant_memberships(id,tenant_id,user_id,status)
 select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('10000000-0000-4000-8000-'||lpad((case when n=4 then 2 else 1 end)::text,12,'0'))::uuid,
 ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'active' from generate_series(1,5) n;
insert into membership_roles(membership_id,app_key,role_key)
 select ('30000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'inventory',
 case n when 2 then 'inventory_staff' when 3 then 'viewer' else 'administrator' end from generate_series(1,5) n;
insert into inv_material_requests(id,tenant_id,request_no,status,job)
 values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','HISTORICAL-MR','approved','Unchanged historical job');
-- Supabase installations can carry explicit default grants; do not rely on
-- PUBLIC revocation alone to protect internal helpers or append-only audit.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant execute on functions to service_role;
