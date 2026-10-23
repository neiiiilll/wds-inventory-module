-- Private attachment metadata. Storage objects remain private and server-authorized.
create function public.inv_reserve_procurement_attachment(p_tenant_id uuid,p_actor_user_id uuid,p_document_kind text,p_document_id uuid,p_file_name text,p_mime_type text,p_byte_size bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare attachment_id uuid:=gen_random_uuid();extension text;object_path text;
begin
 perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,false,true);
 if p_document_kind not in ('material_request','quotation','purchase_request','purchase_order','inspection') or not exists(select 1 from public.inv_document_headers(p_tenant_id) h where h.kind=p_document_kind and h.id=p_document_id) then raise exception using errcode='P0002',message='Attachment parent is unavailable.';end if;
 if p_mime_type not in ('application/pdf','image/png','image/jpeg') or p_byte_size not between 1 and 5242880 or length(btrim(p_file_name)) not between 1 and 255 then raise exception using errcode='22023',message='Invalid attachment metadata.';end if;
 perform pg_advisory_xact_lock(hashtextextended('inventory-attachment:'||p_tenant_id::text||':'||p_document_id::text,0));
 if (select count(*) from public.inv_procurement_attachments where tenant_id=p_tenant_id and document_kind=p_document_kind and document_id=p_document_id and state in ('pending','ready'))>=10 then raise exception using errcode='55000',message='Attachment limit reached.';end if;
 extension:=case p_mime_type when 'application/pdf' then '.pdf' when 'image/png' then '.png' else '.jpg' end;
 object_path:=p_tenant_id::text||'/'||p_document_kind||'/'||p_document_id::text||'/'||attachment_id::text||extension;
 insert into public.inv_procurement_attachments(id,tenant_id,document_kind,document_id,storage_path,file_name,mime_type,byte_size,uploaded_by_user_id,state) values(attachment_id,p_tenant_id,p_document_kind,p_document_id,object_path,btrim(p_file_name),p_mime_type,p_byte_size,p_actor_user_id,'pending');
 return jsonb_build_object('id',attachment_id,'path',object_path);
end $$;
create function public.inv_get_procurement_attachment(p_tenant_id uuid,p_actor_user_id uuid,p_attachment_id uuid,p_write boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare row public.inv_procurement_attachments%rowtype;
begin
 perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,false,p_write);
 select * into row from public.inv_procurement_attachments where tenant_id=p_tenant_id and id=p_attachment_id;
 if not found or not exists(select 1 from public.inv_document_headers(p_tenant_id) h where h.kind=row.document_kind and h.id=row.document_id) then raise exception using errcode='P0002',message='Attachment is unavailable.';end if;
 if (not p_write and row.state<>'ready') then raise exception using errcode='P0002',message='Attachment is unavailable.';end if;
 return jsonb_build_object('id',row.id,'storagePath',row.storage_path,'name',row.file_name,'contentType',row.mime_type,'size',row.byte_size,'state',row.state,'documentKind',row.document_kind,'documentId',row.document_id);
end $$;
create function public.inv_finalize_procurement_attachment(p_tenant_id uuid,p_actor_user_id uuid,p_attachment_id uuid,p_actual_size bigint,p_actual_type text,p_checksum text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare row public.inv_procurement_attachments%rowtype;
begin
 perform public.inv_require_procurement_access(p_tenant_id,p_actor_user_id,false,true);
 select * into row from public.inv_procurement_attachments where tenant_id=p_tenant_id and id=p_attachment_id for update;
 if not found or row.state<>'pending' or not exists(select 1 from public.inv_document_headers(p_tenant_id) h where h.kind=row.document_kind and h.id=row.document_id) then raise exception using errcode='P0002',message='Pending attachment is unavailable.';end if;
 if p_actual_size<>row.byte_size or p_actual_type<>row.mime_type or length(coalesce(p_checksum,''))<>64 then raise exception using errcode='55000',message='Uploaded bytes do not match the reservation.';end if;
 update public.inv_procurement_attachments set state='ready',checksum=p_checksum,finalized_at=now() where tenant_id=p_tenant_id and id=row.id;
 return jsonb_build_object('attachmentId',row.id,'state','ready');
end $$;
revoke all on function public.inv_reserve_procurement_attachment(uuid,uuid,text,uuid,text,text,bigint),public.inv_get_procurement_attachment(uuid,uuid,uuid,boolean),public.inv_finalize_procurement_attachment(uuid,uuid,uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.inv_reserve_procurement_attachment(uuid,uuid,text,uuid,text,text,bigint),public.inv_get_procurement_attachment(uuid,uuid,uuid,boolean),public.inv_finalize_procurement_attachment(uuid,uuid,uuid,bigint,text,text) to service_role;
