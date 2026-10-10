import {exportProgress,restoreProgress} from './progress-transfer.js';
import {commaStudentGaps} from './comma-punctuation.js';
import {emptyRow,fields,wordsText,basisLabel,basisExplanation,checkAnswer,boundary} from './engine.js';
import {resultSummary} from './result-summary.js';
import {freshState,freshDraft,loadState,saveState,recordAttempt,resetSentence} from './storage.js';

const app=document.querySelector('#app'), modal=document.querySelector('#modal');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let sentences=[], state, storage, active={row:0,field:fields[0]}, mode='words', selectedSign=',', storageFailed=false;
const colors=['#08776c','#92600c','#7b409f','#a74135','#225f9b'];
const blockNumber=s=>(s.task===21?10:0)+s.block;
const globalNumber=s=>sentences.findIndex(x=>x.id===s.id)+1;
const current=()=>sentences.find(s=>s.id===state.currentId);
const draft=()=>state.drafts[state.currentId]??=freshDraft();
function announce(message){document.querySelector('#announcement').textContent=message;}
function persist(){storageFailed=!saveState(storage,state);}
function go(id){state.currentId=id;active={row:0,field:fields[0]};mode='words';persist();render();}
function invalidate(){draft().checked=false;persist();}
function refAnalysis(s){return `<ul class="analysis-list">${s.grammatical_bases.map(b=>`<li><strong>${escape(basisLabel(b))}</strong>${escape(basisExplanation(b))}</li>`).join('')}</ul><p>${escape(s.syntactic_trap)}</p>`;}
function renderSentence(s,d,result){
  const gaps=commaStudentGaps(s);
  const styles=new Map();
  for(const row of result?.bases.rows||[]) if(row.status==='correct') {
    const b=s.grammatical_bases[row.basisIndex];
    fields.forEach((f,j)=>b[f].forEach(id=>styles.set(id,{role:j?'predicate':'subject',color:colors[row.basisIndex%colors.length]})));
  }
  return escape(gaps[0])+s.words.map((w,index)=>{
    const annotation=styles.get(w.id), used=d.rows.some(r=>fields.some(f=>r[f].includes(w.id)));
    let html=`<span class="sentence-unit"><button class="word ${annotation?.role||''} ${d.checked&&s.common_element?.word_ids.includes(w.id)?'common-word':''} ${used?'used':''}" data-word="${w.id}" draggable="true" ${annotation?`style="--basis-color:${annotation.color}"`:''} aria-label="Добавить слово ${escape(w.text)}, позиция ${index+1}" title="${escape(w.text)} · слово ${index+1}">${escape(w.display_text||w.text)}</button>`;
    if(index<s.words.length-1){
      const key=boundary(s,index+1),marks=d.punctuation[key]||[];
      // Fixed quotes stay with their source boundary; all pilot gaps contain spaces only.
      const fixed=gaps[index+1],close=fixed.match(/^[»”’")]+/)?.[0]||'';
      const rest=fixed.slice(close.length);
      if(mode==='punctuation'&&(selectedSign===','||marks.length)) html+=escape(close)+`<button class="gap ${marks.length?'':'empty'}" data-gap="${index+1}" aria-label="${selectedSign===','?'Поставить':'Убрать'} запятую между ${escape(w.text)} и ${escape(s.words[index+1].text)}">${marks.length?escape(marks.join('')):'·'}</button>`+escape(rest.trim());
      else html+=escape(close)+`<button class="gap passive ${marks.length?'':'empty'}" data-gap="${index+1}" tabindex="-1" aria-hidden="true" aria-label="Знак между ${escape(w.text)} и ${escape(s.words[index+1].text)}">${escape(marks.join(''))}</button>`+escape(rest);
    } else html+=escape(gaps[index+1]);
    return html+'</span>';
  }).join('');
}
function renderCard(s,row,index,result){
  const r=result?.bases.rows[index];
  return `<article class="basis-card ${r?(r.status==='correct'?'correct':'incorrect'):''}" data-card="${index}"><div class="card-top"><span>Основа ${String(index+1).padStart(2,'0')}</span><div class="card-actions">${r?`<span class="verdict ${r.status==='correct'?'good':''}">${r.status==='correct'?'✓ Основа верна':r.status==='duplicate_basis'?'Повтор':'Проверьте состав'}</span>`:''}<button data-action="delete-row" data-row="${index}" aria-label="Удалить основу ${index+1}">×</button></div></div><div class="fields">${fields.map((f,j)=>`<div class="field ${active.row===index&&active.field===f?'active':''}" data-row="${index}" data-field="${f}" tabindex="0" role="button" aria-pressed="${active.row===index&&active.field===f}" aria-label="${j?'Сказуемое':'Подлежащее'}, основа ${index+1}"><div class="field-label ${j?'predicate-label':''}"><i aria-hidden="true"></i>${j?'СКАЗУЕМОЕ':'ПОДЛЕЖАЩЕЕ'}</div><div class="field-content">${row[f].length?row[f].map(id=>`<button class="chip" data-remove="${id}" data-row="${index}" data-field="${f}" aria-label="Удалить ${escape(wordsText(s,[id]))} из ${j?'сказуемого':'подлежащего'}">${escape(wordsText(s,[id]))}<span aria-hidden="true">×</span></button>`).join(''):`<span class="placeholder">${active.row===index&&active.field===f?'Выберите слова выше':'Нажмите или перенесите'}</span>`}</div></div>`).join('')}</div>${r&&r.status!=='correct'?`<div class="card-feedback"><p>${escape(r.message)}</p>${r.explanation?`<details><summary>Почему так</summary><p>${escape(r.explanation)}</p></details>`:''}</div>`:''}</article>`;
}
function renderOverall(result,rowCount){
  if(!result)return '';
  const summary=resultSummary(result,rowCount);
  return `<section class="overall-result ${result.correct?'accepted':'rejected'}" role="status" aria-label="Общий результат предложения"><strong class="overall-title">${summary.title}</strong><p class="overall-count">${summary.found}</p><p class="overall-reason">${summary.reason}</p></section>`;
}
function renderFeedback(s,result){
  if(!result)return '';
  const {bases,punctuation}=result;
  if(result.correct)return `<section class="feedback-panel success"><p>✓ Все основы собраны правильно, запятые проверены.</p>${s.common_element?`<p>${escape(s.common_element.explanation)}</p>`:''}<details><summary>Подробный разбор</summary>${refAnalysis(s)}<p>${escape(s.final_teacher_decision?.comma_override?.reason||s.punctuation_explanation)}</p></details></section>`;
  return `<section class="feedback-panel ${result.correct?'success':''}" aria-label="Результат проверки"><h2>${!bases.enabled?'Предварительный разбор':result.correct?'Разбор предложения':'Объяснения ошибок'}</h2><p>${!bases.enabled?escape(bases.message)+' Автоматическая оценка основ недоступна.':''}</p>${bases.enabled?`<p>Верных основ: ${bases.matched} из ${bases.total}. ${bases.countCorrect?'Количество карточек верное.':`Карточек: ${draft().rows.length}; основ в предложении: ${bases.total}.`}</p>`:''}${bases.missing.length?`<details open><summary>Не собраны полностью: ${bases.missing.length}</summary><ul class="analysis-list">${bases.missing.map(b=>`<li><strong>${escape(b.label)}</strong>${escape(b.explanation)}</li>`).join('')}</ul></details>`:''}${punctuation.applicable?punctuation.correct?`<p>✓ Пунктуация верна. ${escape(s.punctuation_explanation)}</p>`:`<h3>Пунктуация</h3>${punctuation.errors.map(e=>`<p class="punctuation-error">Между «${escape(e.after)}» и «${escape(e.before)}»: ${e.actual.length?`поставлено «${escape(e.actual.join(''))}»`:'знак не поставлен'}. Ожидается: ${e.expected?.map(v=>v.length?`«${escape(v.join(''))}»`:'без знака').join(' или ')||'другая позиция'}.</p>`).join('')}${[...new Set(punctuation.errors.map(e=>e.reason.split(/[.!?]\s/)[0]))].map(reason=>`<p class="punctuation-rule">${escape(reason)}.</p>`).join('')}`:''}<details><summary>${bases.enabled?'Полный разбор и синтаксическая ловушка':'Исходная разметка — требует согласования'}</summary>${refAnalysis(s)}</details></section>`;
}
function render(){
  const s=current(),d=draft(),group=sentences,index=group.findIndex(x=>x.id===s.id),result=d.checked?checkAnswer(s,d):null;
  app.innerHTML=`<div class="shell"><header class="topbar"><div class="brand" aria-label="ОСНОВА. ОГЭ — ЕГЭ"><div class="brand-symbol" aria-hidden="true"><i></i><i></i></div><div><div class="brand-name">ОСНОВА<span>.</span></div><div class="brand-sub">ОГЭ — ЕГЭ</div></div></div><div class="header-actions"><button class="quiet-button" data-action="export-progress">Сохранить прогресс</button><button class="quiet-button" data-action="import-progress">Восстановить</button><input id="import-progress-file" type="file" accept="application/json,.json" hidden><button class="quiet-button" data-action="rules">Правила</button><button class="quiet-button" data-action="journal">Журнал ошибок<span class="journal-count">${state.journal.length}</span></button></div></header><main><section class="intro"><div><h1>Собери основы</h1><p class="intro-sub">Перенеси подлежащее и сказуемое в специальные окошки. Если в предложении несколько основ, нажми +. Затем расставь запятые.</p></div><div class="progress-box"><div class="progress-label"><span>Ваш прогресс</span><strong>${state.solved.length} <small>/ ${sentences.length}</small></strong></div><div class="progress-track" role="progressbar" aria-label="Решено предложений" aria-valuenow="${state.solved.length}" aria-valuemin="0" aria-valuemax="${sentences.length}"><i style="width:${state.solved.length/sentences.length*100}%"></i></div><div class="progress-meta"><span>Ошибочных попыток: ${state.errorCount}</span><button data-action="reset-all">Сбросить прогресс</button></div></div></section><div class="toolbar"><button class="quiet-button" data-action="navigator">Блоки и предложения ☰</button><nav class="nav" aria-label="Навигация по предложениям"><button data-action="previous" ${index===0?'disabled':''}>← Назад</button><span class="navigation-location">${globalNumber(s)} / 160 · Блок ${blockNumber(s)} · № ${s.number}</span><button data-action="next" ${index===group.length-1?'disabled':''}>Далее →</button></nav></div><section class="sentence-panel" aria-label="Исходное предложение"><div class="panel-top"><span class="section-label"><span class="step-number">01</span>Предложение ${globalNumber(s)} · Блок ${blockNumber(s)} · № ${s.number}</span><span class="small-status ${state.solved.includes(s.id)?'solved':''}">${result?.correct?'✓ Зачтено':!result&&state.solved.includes(s.id)?'Решено ранее':'Блок '+blockNumber(s)+' · '+'основы и запятые'}</span></div>${!s.checking.strict_basis_autocheck_enabled?'<p class="review-notice" role="note">Разбор требует решения преподавателя. Запятые проверяются автоматически; основы не оцениваются и предложение не засчитывается в прогресс. <a href="data/teacher-review.md" target="_blank" rel="noopener">Отчёт для преподавателя</a></p>':''}<div class="sentence" id="sentence">${renderSentence(s,d,result)}</div><div class="sentence-footer"><span>${mode==='punctuation'?(selectedSign===','?'Выбери место для запятой.':'Выбери запятую, которую нужно убрать.'):'Выберите поле основы, затем нажимайте на слова.'}</span><div class="mode" role="group" aria-label="Режим предложения"><button data-mode="words" aria-pressed="${mode==='words'}">Слова</button><button data-mode="punctuation" aria-pressed="${mode==='punctuation'}">Запятые</button></div></div></section>${renderOverall(result,d.rows.length)}<div class="workspace"><section aria-label="Грамматические основы"><div class="workspace-heading"><h2><span class="section-label"><span class="step-number">02</span></span>Грамматические основы</h2><button class="add-basis" data-action="add-row" aria-label="Добавить основу">+ Добавить основу</button></div><div id="basis-cards">${d.rows.map((r,i)=>renderCard(s,r,i,result)).reverse().join('')}</div>${!d.rows.length?'<p class="intro-sub">Добавьте карточку основы кнопкой «+».</p>':''}</section><aside class="punctuation-panel"><span class="section-label">03 · Запятые</span><h2>Сундучок запятых</h2><div class="comma-chest"><div class="chest-lid" aria-hidden="true"></div><div class="signs" role="group" aria-label="Добавить или убрать запятую"><button class="sign" data-sign="," draggable="true" aria-pressed="${selectedSign===','&&mode==='punctuation'}" aria-label="Запятая">,</button><button class="sign eraser" data-sign="" aria-pressed="${selectedSign===''&&mode==='punctuation'}">Убрать запятую</button></div></div><p>Выбери запятую и нажми между словами. Можно перетащить её в нужное место.</p></aside></div><div class="actionbar"><button class="primary-button" data-action="check">Проверить<span aria-hidden="true">↗</span></button><button class="text-button" data-action="reset-sentence">Сбросить предложение</button></div>${renderFeedback(s,result)}${storageFailed?'<p class="saving-error" role="alert">Браузер не сохранил изменения. Проверьте доступ к локальному хранилищу; текущая работа остаётся на странице.</p>':''}</main><footer class="footer"><span>ОСНОВА. ОГЭ — ЕГЭ</span><span>${sentences.length} предложений · полная база<br>Прогресс сохраняется в этом браузере</span></footer></div>`;
}
function addWord(id,rowIndex=active.row,field=active.field){
  if(!current().words.some(w=>w.id===id))return;
  if(!draft().rows.length){draft().rows.push(emptyRow());rowIndex=0;}
  if(!draft().rows[rowIndex])rowIndex=0;
  const row=draft().rows[rowIndex];
  if(fields.some(f=>row[f].includes(id))){announce('Это слово уже есть в этой основе.');return;}
  row[field].push(id);active={row:rowIndex,field};invalidate();render();
  document.querySelector(`[data-word="${id}"]`)?.focus({preventScroll:true});
  announce(`Добавлено: ${wordsText(current(),[id])}.`);
}
function putSign(position,sign=selectedSign){
  const s=current(); if(position<1||position>=s.words.length)return;
  const key=boundary(s,position);
  if(![',',''].includes(sign))return;
  const changed=sign===''?Boolean(draft().punctuation[key]?.length):draft().punctuation[key]?.join('')!==',';
  if(changed){
    if(sign==='')delete draft().punctuation[key];
    else draft().punctuation[key]=[sign];
    invalidate();
  }
  mode='words';render();document.querySelector(`[data-sign="${sign}"]`)?.focus({preventScroll:true});
  announce(sign?`Поставлен знак ${sign}`:'Знак удалён.');
}
function showModal(title,body){
  modal.className='';
  modal.innerHTML=`<div class="modal-header"><h2 id="modal-title">${title}</h2><button data-dialog="close" aria-label="Закрыть">×</button></div><div class="modal-body">${body}</div>`;
  if(!modal.open)modal.showModal();
}
function showNavigator(block=blockNumber(current())){
  const members=sentences.filter(s=>blockNumber(s)===block);
  showModal('Блоки и предложения',`<div class="navigator-layout"><div class="block-list" aria-label="Блоки">${Array.from({length:20},(_,i)=>i+1).map(b=>`<button data-nav-block="${b}" aria-pressed="${b===block}">${b}</button>`).join('')}</div><div class="sentence-list"><h3>Блок ${block}</h3>${members.map(s=>`<button data-nav-sentence="${s.id}" aria-current="${s.id===state.currentId?'true':'false'}">${s.number}<small>№ ${globalNumber(s)} ${state.solved.includes(s.id)?'✓':''}</small></button>`).join('')}</div></div>`);
  modal.className='navigator-dialog';
}
function downloadProgress(){
  try{persist();const payload=exportProgress(storage,state),url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='osnova-progress-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);announce('Файл прогресса сохранён. Сохраните его до переноса на другой адрес.');}catch{announce('Не удалось выгрузить прогресс.');}
}
function showJournal(){
  showModal('Журнал ошибок',state.journal.length?`<p>Попыток в журнале: ${state.journal.length}. Верное решение сохраняет историю ошибок.</p><button class="quiet-button" data-dialog="clear-journal">Очистить журнал</button>${[...state.journal].reverse().map(entry=>{
    const s=sentences.find(x=>x.id===entry.sentenceId);
    return `<details class="journal-entry"><summary><time>${escape(new Date(entry.date).toLocaleString('ru-RU'))} · Блок ${blockNumber(s)}, предложение ${globalNumber(s)} (№ ${s.number})</time>${escape(entry.sentence)}</summary><p><strong>Ваш ответ</strong></p><ul>${entry.answer.rows.map((r,i)=>`<li>${escape(wordsText(s,r.subject_word_ids)||'∅')} — ${escape(wordsText(s,r.predicate_word_ids)||'∅')}. ${escape(entry.result.bases.rows[i]?.message)}</li>`).join('')||'<li>Карточки не созданы.</li>'}</ul><p>Не собраны полностью: ${entry.result.bases.missing.map(x=>escape(x.label)).join('; ')||'нет'}.</p>${entry.result.punctuation.errors.map(e=>`<p>Пунктуация: «${escape(e.after)} | ${escape(e.before)}», ответ: ${escape(e.actual?.join('')||'без знака')}. ${escape(e.reason)}</p>`).join('')}<p><strong>${entry.result.bases.enabled===false?'Исходная разметка — требует согласования':'Правильный разбор'}</strong></p><ul>${entry.correctAnalysis.map(b=>`<li>${escape(basisLabel(b))}. ${escape(basisExplanation(b))}</li>`).join('')}</ul><p>${escape(entry.trap)}</p><button class="quiet-button" data-review="${s.id}">Вернуться к предложению</button></details>`;
  }).join('')}`:'<div class="journal-empty"><p>Здесь появятся ошибочные попытки и объяснения к ним.</p></div>');
}
app.addEventListener('click',event=>{
  const t=event.target.closest('button,[data-field]');if(!t)return;
  if(t.dataset.remove){const r=draft().rows[Number(t.dataset.row)];r[t.dataset.field]=r[t.dataset.field].filter(x=>x!==t.dataset.remove);invalidate();render();return;}
  if(t.dataset.field){active={row:Number(t.dataset.row),field:t.dataset.field};render();document.querySelector(`.field[data-row="${active.row}"][data-field="${active.field}"]`)?.focus({preventScroll:true});return;}
  if(t.dataset.word){addWord(t.dataset.word);return;}
  if(t.dataset.gap){if(mode==='punctuation'&&!t.classList.contains('passive'))putSign(Number(t.dataset.gap));return;}
  if(t.hasAttribute('data-sign')){mode=mode==='punctuation'&&selectedSign===t.dataset.sign?'words':'punctuation';selectedSign=t.dataset.sign;render();return;}
  if(t.dataset.mode){mode=t.dataset.mode==='punctuation'&&mode==='punctuation'?'words':t.dataset.mode;if(mode==='punctuation')selectedSign=',';render();return;}
  const action=t.dataset.action;
  if(action==='add-row'){draft().rows.push(emptyRow());active={row:draft().rows.length-1,field:fields[0]};invalidate();render();document.querySelector(`.field[data-row="${active.row}"]`)?.focus({preventScroll:true});}
  if(action==='delete-row'){const index=Number(t.dataset.row);draft().rows.splice(index,1);active.row=Math.max(0,Math.min(active.row,draft().rows.length-1));invalidate();render();}
  if(action==='check'){mode='words';document.body.classList.remove('dragging-sign');const result=recordAttempt(state,current(),draft());persist();render();document.querySelector('.overall-result')?.scrollIntoView({block:'center',behavior:'instant'});const summary=resultSummary(result,draft().rows.length);announce(`${summary.title}. ${summary.found} ${summary.reason}`);}
  if(action==='previous'||action==='next'){const group=sentences,i=group.findIndex(x=>x.id===state.currentId);if(group[i+(action==='next'?1:-1)])go(group[i+(action==='next'?1:-1)].id);}
  if(action==='reset-sentence'){resetSentence(state,state.currentId);active={row:0,field:fields[0]};mode='words';persist();render();announce('Предложение сброшено. Журнал сохранён.');}
  if(action==='navigator')showNavigator();
  if(action==='export-progress')downloadProgress();
  if(action==='import-progress')document.querySelector('#import-progress-file').click();
  if(action==='rules')showModal('Как работать с основой','<ol><li>Нажмите на поле «Подлежащее» или «Сказуемое», затем на нужные слова. Можно также перетаскивать слова в поле — предложение остаётся на месте.</li><li>Собирайте основу из нескольких слов, если это нужно. Порядок слов и карточек не влияет на проверку. Союз между однородными главными членами и частицу «не» при сказуемом можно переносить или оставлять в предложении. Однородные сказуемые при общем подлежащем относятся к одной основе.</li><li>Кнопка «+ Добавить основу» добавляет карточку. Крестик у слова убирает копию; крестик у карточки удаляет основу. Если подлежащего или сказуемого нет, соответствующее поле оставьте пустым.</li><li>В обоих заданиях выберите запятую в сундучке, затем нажмите в нужном промежутке предложения. Запятую можно перетащить. «Убрать запятую» включает выбор поставленной запятой. После выбора режим завершается. Повторное нажатие кнопки отменяет режим.</li><li>Нажмите «Проверить». Верные основы станут зелёными, ошибки получат объяснение. В предложении подлежащее отмечается одной линией, сказуемое — двумя.</li><li>Прогресс и журнал сохраняются в этом браузере. Ошибки остаются в журнале после верного решения; журнал очищается отдельно.</li></ol>');
  if(action==='journal')showJournal();
  if(action==='reset-all')showModal('Сбросить прогресс?','<p>Будут очищены все ответы, решённые предложения и счётчик попыток. Журнал ошибок сохранится; его можно очистить отдельно.</p><button class="primary-button" data-dialog="confirm-reset">Сбросить прогресс</button><button class="quiet-button" data-dialog="close">Отмена</button>');
});
app.addEventListener('change',async e=>{if(e.target.id==='import-progress-file'&&e.target.files[0]){
 try{state=restoreProgress(JSON.parse(await e.target.files[0].text()),state,sentences);active={row:0,field:fields[0]};mode='words';persist();render();announce('Прогресс восстановлен. Журнал объединён с текущим.');}catch(error){announce(error.message);showModal('Восстановление не выполнено',`<p>${escape(error.message)}</p>`);}
}});
app.addEventListener('keydown',e=>{if(e.target.matches('.field')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.target.click();}});
app.addEventListener('dragstart',e=>{
  const word=e.target.closest('[data-word]'),sign=e.target.closest('[data-sign]');
  if(word)e.dataTransfer.setData('application/json',JSON.stringify({type:'word',id:word.dataset.word,sentenceId:state.currentId}));
  else if(sign){
    e.dataTransfer.setData('application/json',JSON.stringify({type:'sign',value:sign.dataset.sign,sentenceId:state.currentId}));
    document.body.classList.add('dragging-sign');
  }
  else return;
  e.dataTransfer.effectAllowed='copy';
});
app.addEventListener('dragover',e=>{const target=e.target.closest('.field,[data-gap]');if(target){e.preventDefault();e.dataTransfer.dropEffect='copy';target.classList.add('dragover');}});
app.addEventListener('dragleave',e=>e.target.closest('.field,[data-gap]')?.classList.remove('dragover'));
document.addEventListener('dragend',()=>document.body.classList.remove('dragging-sign'));
app.addEventListener('drop',e=>{
  e.preventDefault();document.body.classList.remove('dragging-sign');document.querySelectorAll('.dragover').forEach(x=>x.classList.remove('dragover'));
  let data;try{data=JSON.parse(e.dataTransfer.getData('application/json'));}catch{return;}
  if(data.sentenceId!==state.currentId)return;
  const field=e.target.closest('.field'),gap=e.target.closest('[data-gap]');
  if(data.type==='word'&&field)addWord(data.id,Number(field.dataset.row),field.dataset.field);
  if(data.type==='sign'&&gap&&[',',''].includes(data.value)){selectedSign=data.value;putSign(Number(gap.dataset.gap),data.value);}
});
modal.addEventListener('click',e=>{
  if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){modal.close();return;}}
  const t=e.target.closest('button');if(!t)return;
  if(t.dataset.navBlock){showNavigator(Number(t.dataset.navBlock));return;}
  if(t.dataset.navSentence){modal.close();go(t.dataset.navSentence);return;}
  if(t.dataset.review){modal.close();go(t.dataset.review);return;}
  if(t.dataset.dialog==='close')modal.close();
  if(t.dataset.dialog==='clear-journal')showModal('Очистить журнал?','<p>Все сохранённые ошибочные попытки будут удалены. Ответы, решённые предложения и общий счётчик попыток сохранятся.</p><button class="primary-button" data-dialog="confirm-clear">Очистить журнал</button><button class="quiet-button" data-dialog="journal">Отмена</button>');
  if(t.dataset.dialog==='journal')showJournal();
  if(t.dataset.dialog==='confirm-clear'){state.journal=[];persist();render();showJournal();}
  if(t.dataset.dialog==='confirm-reset'){const journal=state.journal;state=freshState();state.journal=journal;state.currentId=sentences[0].id;active={row:0,field:fields[0]};mode='words';persist();render();modal.close();}
});
async function init(){
  try{
    const response=await fetch('data/sentences.json');if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();sentences=data.sentences;
    if(!sentences.length)throw new Error('В наборе есть неутверждённые записи.');
    try{storage=window.localStorage;}catch{storage={getItem(){return null;},setItem(){throw new Error('Unavailable');}};}
    state=loadState(storage,sentences);state.currentId??=sentences[0].id;render();
  }catch(error){app.innerHTML=`<div class="shell"><p class="loading">Не удалось загрузить предложения. Откройте тренажёр через локальный сервер.</p><p>${escape(error.message)}</p><button class="quiet-button" onclick="location.reload()">Повторить загрузку</button></div>`;}
}
init();
