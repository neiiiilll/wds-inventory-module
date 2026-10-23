import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {firebaseAuth} from './firebase'
const VALID=new Set(['dashboard','procurement','inventory','movements','references'])
const listeners=new Set<(keys:Set<string>)=>void>()
export function invalidateLiveInventory(keys:string[]){const valid=new Set(keys.filter(key=>VALID.has(key)));if(valid.size)for(const listener of listeners)listener(valid)}
export function useLiveInventoryResource<T>(key:string,loader:()=>Promise<T>){const uid=firebaseAuth?.currentUser?.uid??null;const loaderRef=useRef(loader);loaderRef.current=loader;const [nonce,setNonce]=useState(0);const [state,setState]=useState<{loading:boolean;data:T|null;error:unknown}>({loading:true,data:null,error:null});const reload=useCallback(()=>setNonce(value=>value+1),[])
 useEffect(()=>{const listener=(keys:Set<string>)=>{if(keys.has(key))reload()};listeners.add(listener);return()=>{listeners.delete(listener)}},[key,reload])
 useEffect(()=>{let current=true;const expectedUid=uid;setState({loading:true,data:null,error:null});void loaderRef.current().then(data=>{if(current&&(firebaseAuth?.currentUser?.uid??null)===expectedUid)setState({loading:false,data,error:null})},error=>{if(current&&(firebaseAuth?.currentUser?.uid??null)===expectedUid)setState({loading:false,data:null,error})});return()=>{current=false}},[key,nonce,uid])
 return useMemo(()=>({...state,reload}),[state,reload])
}
export function useSessionScopedState<T>(initial:T|(()=>T)){const uid=firebaseAuth?.currentUser?.uid??null;const [state,setState]=useState<T>(initial);useEffect(()=>setState(typeof initial==='function'?(initial as()=>T)():initial),[uid]);return [state,setState] as const}
