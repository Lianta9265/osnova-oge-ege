import {optionalConnectors} from '../data/answer-policy.js';
import {commaReference} from './comma-punctuation.js';
// Canonical analyses stay strict. Optional words are a separate checking policy.
export const fields = ['subject_word_ids', 'predicate_word_ids'];
export const emptyRow = () => ({subject_word_ids: [], predicate_word_ids: []});
const same = (a,b) => a.length===b.length && a.every(x=>b.includes(x));
const variants = b => b.accepted_answer_variants?.length ? b.accepted_answer_variants : [b];
export function optionalWords(sentence,basis,variant=basis) {
  const optional={subject_word_ids:[],predicate_word_ids:[]};
  // Only negative particles from this basis; another occurrence of не is not interchangeable.
  optional.predicate_word_ids=sentence.words.filter(w=>w.text.toLowerCase()==='не'&&basis.predicate_word_ids.includes(w.id)).map(w=>w.id);
  for(const rule of optionalConnectors) {
    if(rule.basis===basis.id&&rule.requires.every(id=>variant[rule.field].includes(id)))optional[rule.field].push(rule.word);
  }
  return optional;
}
const normalized=(row,optional)=>Object.fromEntries(fields.map(f=>[f,row[f].filter(id=>!optional[f].includes(id))]));
const equal = (a,b,optional) => {
  const actual=normalized(a,optional),expected=normalized(b,optional);
  return fields.every(f=>same(actual[f],expected[f]));
};
export const wordsText = (s, ids) => ids.map(id=>{const w=s.words.find(w=>w.id===id);return w?.display_text||w?.text||'[неизвестное слово]';}).join(' ');
export const basisLabel = b => `${b.subject_text || '∅'} — ${b.predicate_text || '∅'}`;
export function basisExplanation(b) {
  const types = (b.predicate_components||[]).map(p=>`${p.text} — ${p.type}`).join('; ');
  const clean=value=>String(value||'').replace(/Подлежащее отсутствует по устройству конструкции; поле остаётся пустым\./g,'').replace(/Подлежащее и сказуемое выражены; нулевая связка сама по себе не означает неполноту\./g,'').replace(/не предусмотрено типом односоставной конструкции/g,'').trim();
  const absence=!b.subject_word_ids.length?'Подлежащее в тексте не выражено: оставьте это поле пустым.':!b.predicate_word_ids.length?'Сказуемое в тексте не выражено: слова для него добавлять не нужно.':'';
  return [...new Set([types,clean(b.description),absence].filter(Boolean))].join('. ');
}
export function checkBases(sentence, rows) {
  const bases = sentence.grammatical_bases;
  if (!sentence.checking.strict_basis_autocheck_enabled) return {enabled:false,correct:false,matched:0,total:bases.length,countCorrect:rows.length===bases.length,rows:[],missing:[],message:'Этот разбор ожидает решения преподавателя.'};
  const valid = new Set(sentence.words.map(w=>w.id));
  const invalid = rows.map(row=> {
    const ids=fields.flatMap(f=>row[f]);
    if(ids.some(id=>!valid.has(id))) return 'foreign_word';
    if(new Set(ids).size!==ids.length) return 'duplicate_word';
    return null;
  });
  const policy=(b,v)=>sentence.answer_policy_materialized?{subject_word_ids:[],predicate_word_ids:[]}:optionalWords(sentence,b,v);
  const edges=rows.map((row,j)=>invalid[j]?[]:bases.flatMap((b,i)=>variants(b).some(v=>equal(row,v,policy(b,v)))?[i]:[]));
  const owners=new Map();
  function match(j,seen) {
    for(const i of edges[j]) {
      if(seen.has(i)) continue;
      seen.add(i);
      if(!owners.has(i)||match(owners.get(i),seen)) {owners.set(i,j);return true;}
    }
    return false;
  }
  rows.forEach((_,j)=>match(j,new Set()));
  const matched=new Map([...owners].map(([i,j])=>[j,i]));
  const feedback=rows.map((row,j)=> {
    if(matched.has(j)) return {status:'correct',basisIndex:matched.get(j),message:'Верно'};
    if(invalid[j]) return {status:invalid[j],message:invalid[j]==='duplicate_word'?'Одна и та же копия слова использована дважды. Удалите повтор.':'Слово принадлежит другому предложению.'};
    if(edges[j].length) return {status:'duplicate_basis',message:'Эта основа уже засчитана. Повторная карточка не образует новой основы.'};
    const options=bases.flatMap((b,i)=>variants(b).map(v=> {
      const optional=policy(b,v),actual=normalized(row,optional),expected=normalized(v,optional);
      const diff=Object.fromEntries(fields.map(f=>[f,{missing:expected[f].filter(x=>!actual[f].includes(x)),extra:actual[f].filter(x=>!expected[f].includes(x))}]));
      return {i,diff,distance:Object.values(diff).reduce((n,d)=>n+d.missing.length+d.extra.length,0)};
    })).sort((a,b)=>a.distance-b.distance);
    const nearest=options[0];
    const details=fields.flatMap(f=> {
      const label=f===fields[0]?'Подлежащее':'Сказуемое', d=nearest.diff[f];
      return [d.extra.length?`${label}: лишнее «${wordsText(sentence,d.extra)}».`:null,d.missing.length?`${label}: не хватает «${wordsText(sentence,d.missing)}».`:null].filter(Boolean);
    });
    const hasExtra=Object.values(nearest.diff).some(d=>d.extra.length);
    return {status:hasExtra?'incorrect':'incomplete',basisIndex:nearest.i,diff:nearest.diff,message:details.join(' '),explanation:basisExplanation(bases[nearest.i]),trap:sentence.syntactic_trap};
  });
  const missing=bases.flatMap((b,i)=>owners.has(i)?[]:[{basisIndex:i,label:basisLabel(b),explanation:basisExplanation(b)}]);
  return {enabled:true,correct:owners.size===bases.length&&rows.length===bases.length,matched:owners.size,total:bases.length,countCorrect:rows.length===bases.length,rows:feedback,missing};
}
// Answers reference both token boundaries, so repeating words cannot alias a gap.
export const boundary = (s,i) => `${s.words[i-1].id}|${s.words[i].id}`;
export function checkPunctuation(sentence, answer={}) {
  const allowedKeys=new Set();
  const errors=[];
  for(let i=1;i<sentence.words.length;i++) {
    const key=boundary(sentence,i); allowedKeys.add(key);
    const reference=commaReference(sentence,i);
    const allowed=reference.allowed||[];
    const actual=answer[key]||[];
    if(!reference.prepared||!allowed.some(seq=>seq.join('')===actual.join(''))) errors.push({boundary:key,position:i,after:sentence.words[i-1].text,before:sentence.words[i].text,actual,expected:allowed,reason:reference.reason});
  }
  for(const key of Object.keys(answer)) if(!allowedKeys.has(key)) errors.push({boundary:key,actual:answer[key],reason:'Неизвестная граница слов.'});
  return {correct:errors.length===0,errors,applicable:true};
}
export function checkAnswer(sentence, draft) {
  const bases=checkBases(sentence,draft.rows), punctuation=checkPunctuation(sentence,draft.punctuation);
  return {correct:bases.correct&&punctuation.correct,bases,punctuation};
}
