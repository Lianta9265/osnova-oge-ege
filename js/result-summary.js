// The sentence verdict is independent of a single card's local success.
export function resultSummary(result,rowCount) {
  const {bases,punctuation}=result;
  if(bases.enabled===false)return {title:'ТРЕБУЕТ ПРОВЕРКИ',found:'Автоматическая оценка основ недоступна.',reason:bases.message+(punctuation.correct?' Запятые расставлены верно.':' Есть ошибка в расстановке запятых.')};
  const count=bases.matched||0,total=bases.total||0;
  const noun=count===1?'основа':count>=2&&count<=4?'основы':'основ';
  const found=`${count===1?'Найдена':count>=2&&count<=4?'Найдены':'Найдено'} ${count} ${noun} из ${total}.`;
  if(result.correct)return {title:'ЗАЧТЕНО',reason:'Все грамматические основы собраны правильно.'+(punctuation.applicable?' Запятые расставлены верно.':''),found};
  const reasons=[];
  if(rowCount<total)reasons.push('Не все основы собраны.');
  if(rowCount>total||bases.rows.some(r=>r.status==='duplicate_basis'))reasons.push('Добавлена лишняя основа.');
  if(bases.rows.some(r=>!['correct','duplicate_basis'].includes(r.status)))reasons.push('Есть неверно собранная основа.');
  if(!punctuation.correct)reasons.push('Ошибка в расстановке запятых.');
  if(!reasons.length)reasons.push('Не все грамматические основы найдены.');
  return {title:'НЕ ЗАЧТЕНО',found,reason:(reasons.length>1?'Несколько ошибок одновременно. ':'')+reasons.join(' ')};
}
