import type {DocumentDetail} from '../../functions/src/procurement/contracts'

export type DetailSection='lines'|'history'|'related'
export async function collectProcurementDocument(fetchPage:(section:DetailSection,cursor?:string)=>Promise<DocumentDetail>,maxPages=20):Promise<DocumentDetail>{
 let complete:DocumentDetail|null=null
 for(const section of ['lines','history','related'] as const){let cursor:string|undefined,pages=0;const collected:unknown[]=[];do{if(++pages>maxPages)throw new Error('The document is too large to edit safely.');const page=await fetchPage(section,cursor);if(!complete)complete={...page,lines:[],history:[],related:[]};collected.push(...page[section]);cursor=page[`${section}NextCursor`]??undefined}while(cursor);if(complete)(complete[section] as unknown[]).push(...collected)}
 if(!complete)throw new Error('The document is unavailable.')
 return complete
}
