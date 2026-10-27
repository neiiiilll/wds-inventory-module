import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {firebaseAuth} from './firebase'
import {matchesLiveInvalidation,validLiveInvalidations} from './live-invalidation'
const listeners=new Set<(keys:Set<string>)=>void>()
export {matchesLiveInvalidation} from './live-invalidation'
export function invalidateLiveInventory(keys:string[]){const valid=validLiveInvalidations(keys);if(valid.size)for(const listener of listeners)listener(valid)}
export function useLiveInventoryResource<T>(key:string,loader:()=>Promise<T>){const uid=firebaseAuth?.currentUser?.uid??null;const loaderRef=useRef(loader);loaderRef.current=loader;const [nonce,setNonce]=useState(0);const [state,setState]=useState<{ownerUid:string|null;loading:boolean;data:T|null;error:unknown}>({ownerUid:uid,loading:true,data:null,error:null});const reload=useCallback(()=>setNonce(value=>value+1),[])
 useEffect(()=>{const listener=(keys:Set<string>)=>{if([...keys].some(value=>matchesLiveInvalidation(key,value)))reload()};listeners.add(listener);return()=>{listeners.delete(listener)}},[key,reload])
 useEffect(()=>{let current=true;const expectedUid=uid;setState({ownerUid:expectedUid,loading:true,data:null,error:null});void loaderRef.current().then(data=>{if(current&&(firebaseAuth?.currentUser?.uid??null)===expectedUid)setState({ownerUid:expectedUid,loading:false,data,error:null})},error=>{if(current&&(firebaseAuth?.currentUser?.uid??null)===expectedUid)setState({ownerUid:expectedUid,loading:false,data:null,error})});return()=>{current=false}},[key,nonce,uid])
 const visible=state.ownerUid===uid?state:{ownerUid:uid,loading:true,data:null,error:null}
 return useMemo(()=>({...visible,reload}),[visible,reload])
}
export function useSessionScopedState<T>(initial:T|(()=>T)){const uid=firebaseAuth?.currentUser?.uid??null;const [state,setState]=useState<T>(initial);useEffect(()=>setState(typeof initial==='function'?(initial as()=>T)():initial),[uid]);return [state,setState] as const}
