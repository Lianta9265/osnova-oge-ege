import {STORAGE_KEY,loadState} from './storage.js';
export function exportProgress(storage,state){
 const raw=storage.getItem(STORAGE_KEY);
 return {format:'osnova-progress',version:1,exportedAt:new Date().toISOString(),storageKey:STORAGE_KEY,state:raw?JSON.parse(raw):structuredClone(state)};
}
export function restoreProgress(payload,state,sentences){
 if(payload?.format!=='osnova-progress'||payload.version!==1||payload.storageKey!==STORAGE_KEY||payload.state?.version!==1)throw new Error('Это не файл сохранённого прогресса ОСНОВА.');
 const incoming=loadState({getItem:()=>JSON.stringify(payload.state)},sentences);
 const journal=new Map([...state.journal,...incoming.journal].map(e=>[e.id,e]));
 const knownErrors=[...journal.values()].filter(e=>e.result.bases.enabled!==false).length;
 return {...state,currentId:incoming.currentId||state.currentId,drafts:{...state.drafts,...incoming.drafts},solved:[...new Set([...state.solved,...incoming.solved])],journal:[...journal.values()].sort((a,b)=>a.date.localeCompare(b.date)),errorCount:Math.max(state.errorCount,incoming.errorCount,knownErrors)};
}
