import {emptyRow, checkAnswer} from './engine.js';
export const STORAGE_KEY='osnova.pilot.v1';
export const freshState=()=>({version:1,currentId:null,drafts:{},solved:[],journal:[],errorCount:0});
export const freshDraft=()=>({rows:[emptyRow()],punctuation:{},checked:false});
export function loadState(storage, sentences) {
  try {
    const saved=JSON.parse(storage.getItem(STORAGE_KEY));
    if(!saved||saved.version!==1) return freshState();
    const state=freshState(), valid=new Map(sentences.map(s=>[s.id,s]));
    state.currentId=valid.has(saved.currentId)?saved.currentId:null;
    state.solved=Array.isArray(saved.solved)?[...new Set(saved.solved.filter(id=>valid.has(id)))]:[];
    state.journal=Array.isArray(saved.journal)?saved.journal.filter(e=>e && valid.has(e.sentenceId) && e.result?.bases && e.answer?.rows):[];
    state.errorCount=Number.isSafeInteger(saved.errorCount)&&saved.errorCount>=0?saved.errorCount:state.journal.length;
    for(const [id,d] of Object.entries(saved.drafts||{})) {
      if(!valid.has(id)||!Array.isArray(d?.rows)||!d.punctuation||typeof d.punctuation!=='object') continue;
      const ids=new Set(valid.get(id).words.map(w=>w.id));
      if(!d.rows.every(r=>r&&['subject_word_ids','predicate_word_ids'].every(f=>Array.isArray(r[f])&&r[f].every(x=>ids.has(x))))) continue;
      if(!Object.values(d.punctuation).every(v=>Array.isArray(v)&&v.every(x=>typeof x==='string'))) continue;
      state.drafts[id]=d;
    }
    return state;
  } catch {return freshState();}
}
export function saveState(storage,state) {
  try {storage.setItem(STORAGE_KEY,JSON.stringify(state));return true;} catch {return false;}
}
export function recordAttempt(state,sentence,draft) {
  const result=checkAnswer(sentence,draft);
  draft.checked=true;
  if(result.correct) {if(!state.solved.includes(sentence.id)) state.solved.push(sentence.id);}
  else {
    if(result.bases.enabled!==false)state.errorCount++;
    state.journal.push({id:globalThis.crypto.randomUUID(),date:new Date().toISOString(),sentenceId:sentence.id,sentence:sentence.source_text,answer:structuredClone(draft),result,correctAnalysis:structuredClone(sentence.grammatical_bases),trap:sentence.syntactic_trap});
  }
  return result;
}
export function resetSentence(state,id) {state.drafts[id]=freshDraft();state.solved=state.solved.filter(x=>x!==id);}
