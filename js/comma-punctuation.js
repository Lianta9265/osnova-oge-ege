// Only editable commas are removed. Word tokens, quotes and every other mark stay intact.
export function commaStudentGaps(sentence) {
  return sentence.key_gaps.map((gap,i)=>i>0&&i<sentence.words.length?gap.replaceAll(',',''):gap);
}
export function commaReference(sentence,position) {
  const override=sentence.comma_overrides?.find(p=>p.after_position===position);
  if(override)return {prepared:true,allowed:override.accepted_mark_sequences,reason:override.reason};
  const annotation=sentence.punctuation.find(p=>p.after_position===position);
  const keyHasComma=sentence.key_gaps[position].includes(',');
  if(keyHasComma&&!annotation)return {prepared:false,reason:'В пунктуационном ключе есть запятая, но для её позиции отсутствует разметка. Требуется проверка преподавателем.'};
  if(annotation&&(!Array.isArray(annotation.accepted_mark_sequences)||!annotation.reason))return {prepared:false,reason:'Пунктуационный ключ не подготовлен для автоматической проверки.'};
  const allowed=annotation?annotation.accepted_mark_sequences.map(seq=>seq.filter(mark=>mark===',')):[[]];
  const keyCount=(sentence.key_gaps[position].match(/,/g)||[]).length;
  if(annotation&&((annotation.marks.filter(mark=>mark===',').length!==keyCount)||!allowed.some(seq=>seq.length===keyCount)))return {prepared:false,reason:'Разметка запятых не соответствует опубликованному ключу. Требуется проверка преподавателем.'};
  return {prepared:true,allowed,reason:annotation?.marks.includes(',')?annotation.reason:'В этой позиции запятая не требуется. '+sentence.punctuation_explanation};
}
