import type {CommandInput,CommandResult,DashboardDto,DocumentDetail,DocumentKind,DocumentSummary,MovementDto,Page,PageInput,ReferenceDto,ReferenceKind} from '../../functions/src/procurement/contracts'
import {callInventoryFunction,InventoryApiError} from './inventory-api'
const FORBIDDEN=new Set(['tenant','tenantId','tenant_id','actor','actorId','actorUserId','role','roleKey','roles','status','history'])
function input<T extends Record<string,unknown>>(value:T):T{for(const key of Object.keys(value))if(FORBIDDEN.has(key))throw new InventoryApiError('invalid-argument');return value}
export type {CommandInput,CommandResult,DashboardDto,DocumentDetail,DocumentKind,DocumentSummary,MovementDto,Page,ReferenceDto,ReferenceKind}
export interface DocumentListInput extends PageInput{kind:DocumentKind;status?:string}
export interface DetailInput{kind:DocumentKind;id:string;section?:'lines'|'history'|'related';limit?:number;cursor?:string}
export interface ReferenceInput extends PageInput{kind:ReferenceKind}
export interface MovementInput extends PageInput{itemId?:string;locationId?:string;dateFrom?:string;dateTo?:string}
export const getInventoryDashboard=()=>callInventoryFunction<Record<string,never>,DashboardDto>('getInventoryDashboard',{})
export const listProcurementDocuments=(value:DocumentListInput)=>callInventoryFunction<DocumentListInput,Page<DocumentSummary>>('listProcurementDocuments',input(value as DocumentListInput&Record<string,unknown>))
export const getProcurementDocument=(value:DetailInput)=>callInventoryFunction<DetailInput,DocumentDetail>('getProcurementDocument',input(value as DetailInput&Record<string,unknown>))
export const getProcurementReferenceData=(value:ReferenceInput)=>callInventoryFunction<ReferenceInput,Page<ReferenceDto>>('getProcurementReferenceData',input(value as ReferenceInput&Record<string,unknown>))
export const listInventoryMovements=(value:MovementInput={})=>callInventoryFunction<MovementInput,Page<MovementDto>>('listInventoryMovements',input(value as MovementInput&Record<string,unknown>))
export const executeProcurementCommand=(value:CommandInput)=>callInventoryFunction<CommandInput,CommandResult>('executeProcurementCommand',input(value as CommandInput&Record<string,unknown>))
export interface AttachmentUploadInput{kind:DocumentKind;id:string;name:string;contentType:'application/pdf'|'image/png'|'image/jpeg';size:number}
export interface AttachmentUploadResponse{attachmentId:string;path:string;token:string;signedUrl:string;expiresInSeconds:number}
export const createProcurementAttachmentUpload=(value:AttachmentUploadInput)=>callInventoryFunction<AttachmentUploadInput,AttachmentUploadResponse>('createProcurementAttachmentUpload',input(value as AttachmentUploadInput&Record<string,unknown>))
export const finalizeProcurementAttachment=(attachmentId:string)=>callInventoryFunction<{attachmentId:string},{attachmentId:string;state:'ready'}>('finalizeProcurementAttachment',{attachmentId})
export const getProcurementAttachmentDownload=(attachmentId:string)=>callInventoryFunction<{attachmentId:string},{url:string;expiresInSeconds:number;name:string}>('getProcurementAttachmentDownload',{attachmentId})
export function createCommandSubmission(command:Omit<CommandInput,'idempotencyKey'>,invoke=executeProcurementCommand){let key=crypto.randomUUID(),pending:Promise<CommandResult>|null=null;return {get idempotencyKey(){return key},submit(){if(!pending)pending=invoke({...command,idempotencyKey:key}).finally(()=>{pending=null});return pending},reset(){key=crypto.randomUUID();pending=null}}}
