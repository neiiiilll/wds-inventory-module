import {createHash} from 'node:crypto'
import {readFile,readdir} from 'node:fs/promises'
import process from 'node:process'

const migrationDirectory=new URL('../supabase/migrations/',import.meta.url)
const expected=[
 '20261023000100_inventory_procurement_foundation.sql',
 '20261023000200_inventory_procurement_reads.sql',
 '20261023000300_inventory_procurement_documents.sql',
 '20261023000400_inventory_procurement_receiving.sql',
 '20261023000500_inventory_procurement_setup.sql',
 '20261023000600_inventory_procurement_attachments.sql',
 '20261023000700_inventory_procurement_ui.sql',
]
const present=(await readdir(migrationDirectory)).filter(name=>name.startsWith('20261023')&&name.includes('inventory_procurement')).sort()
if(JSON.stringify(present)!==JSON.stringify(expected))throw new Error(`Reviewed migration set mismatch. Expected only: ${expected.join(', ')}`)
for(const name of expected){const bytes=await readFile(new URL(name,migrationDirectory)),source=bytes.toString('utf8');if(/\bsvc_/i.test(source)||/serviceDesk|SERVICE_DESK_BACKEND/i.test(source))throw new Error(`${name} crosses the Service Desk boundary.`);for(const match of source.matchAll(/\b(?:create|alter|drop)\s+table(?:\s+if\s+(?:not\s+)?exists)?\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi)){if(!match[1].startsWith('inv_'))throw new Error(`${name} attempts shared table DDL: ${match[1]}`)}console.log(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`)}
if(!process.env.INVENTORY_DATABASE_URL){console.log('Schema probe skipped: set INVENTORY_DATABASE_URL to an authorized Apps Core PostgreSQL connection. A Supabase service-role API key is not sufficient.');process.exit(2)}
const {Client}=await import('pg'),client=new Client({connectionString:process.env.INVENTORY_DATABASE_URL,ssl:{rejectUnauthorized:false}})
await client.connect()
try{const expectedRelations=['inv_procurement_events','inv_item_tracking','inv_procurement_attachments'];const expectedRpcs=['inv_get_inventory_dashboard(uuid,uuid)','inv_list_procurement_documents(uuid,uuid,jsonb)','inv_get_procurement_document(uuid,uuid,jsonb)','inv_get_procurement_reference_data(uuid,uuid,jsonb)','inv_list_inventory_movements(uuid,uuid,jsonb)','inv_execute_procurement_command(uuid,uuid,text,uuid,bigint,text,jsonb)','inv_reserve_procurement_attachment(uuid,uuid,text,uuid,text,text,bigint)'];for(const relation of expectedRelations){const {rows}=await client.query('select to_regclass($1) is not null as ok',[`public.${relation}`]);if(!rows[0]?.ok)throw new Error(`Missing Inventory relation: ${relation}`)}for(const rpc of expectedRpcs){const {rows}=await client.query('select to_regprocedure($1) is not null as ok',[`public.${rpc}`]);if(!rows[0]?.ok)throw new Error(`Missing Inventory RPC: ${rpc}`)}const {rows:uiRows}=await client.query("select strpos(pg_get_functiondef(to_regprocedure('public.inv_get_procurement_reference_data(uuid,uuid,jsonb)')),'''trackingVersion''')>0 as ok");if(!uiRows[0]?.ok)throw new Error('Missing Inventory procurement UI metadata migration.');console.log('Installed Inventory schema probe passed.')}finally{await client.end()}
