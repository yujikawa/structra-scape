// Detail panes, header menus and icons for the read-only reader.
const exportMenu=document.createElement('details');exportMenu.className='header-menu';
exportMenu.innerHTML='<summary>出力</summary><div class="menu-panel"><p class="hint">図：現在の業務／オントロジー<br>定義：全用語<br>OWL・SKOS：表示中のモデル</p><button data-export="svg">図をSVGで保存</button><button data-export="png">図をPNGで保存</button><button data-export="md">全用語をMarkdownで保存</button><button data-export="owl">OWL（Turtle）で保存</button><button data-export="skos">SKOS（Turtle）で保存</button></div>';
document.querySelector('header').append(exportMenu);
exportMenu.querySelectorAll('[data-export]').forEach(button=>button.onclick=async()=>{
 try{const format=button.dataset.export;if(format==='md'){download('definitions.md',publicationMarkdown(model),'text/markdown');return;}
 // RDF exports take the model as built, imports included, the same as `strscape export --format ttl|skos`.
 if(format==='owl'||format==='skos'){const slug=entries[Number(entryIndex)].slug;download(`${slug}.${format}.ttl`,format==='owl'?exportOntology(model):exportSkos(model),'text/turtle');return;}
 const svg=publicationSvg(model,{process:processMode?activeProcess:undefined});
 if(format==='svg'){download('diagram.svg',svg,'image/svg+xml');return;}
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 try{const picture=new Image();picture.src=url;await picture.decode();const canvas=document.createElement('canvas');const scale=Math.min(2,8192/Math.max(picture.width,picture.height));canvas.width=Math.ceil(picture.width*scale);canvas.height=Math.ceil(picture.height*scale);canvas.getContext('2d').drawImage(picture,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNGを生成できませんでした');const pngUrl=URL.createObjectURL(blob),a=document.createElement('a');a.href=pngUrl;a.download='diagram.png';a.click();setTimeout(()=>URL.revokeObjectURL(pngUrl),1000);}finally{URL.revokeObjectURL(url)}
 }catch(error){status('出力に失敗しました：'+error.message,true)}finally{exportMenu.open=false}
});
// Business name first, stable ID underneath: the shared key between business users and data engineers.
const headword=item=>`<h2>${esc(item.name)}</h2><p class="reader-id"><span>ID</span><code>${esc(item.id)}</code></p>${item.imported_from?`<p class="imported-note"><span>共通定義から読み込み</span><code>${esc(item.imported_from)}</code></p>`:''}${item.aliases?.length?`<p class="aliases"><span>別名</span>${item.aliases.map(a=>`<span class="alias">${esc(a)}</span>`).join('')}</p>`:''}`;
// Data items of a concept, including those inherited from its ancestors.
const attributesSection=item=>{
 const rows=conceptAttributes(model,item.id);
 if(!rows.length)return '';
 return `<section class="reader-section"><h3>属性（データ項目） · ${rows.length}件</h3><div class="attribute-list">${rows.map(({attribute:a,ownerName,inherited})=>`<article class="attribute"><div class="attribute-head"><strong>${esc(a.name)}</strong>${a.type?`<span class="attr-type">${esc(attributeTypes[a.type])}</span>`:''}${a.required?'<span class="attr-required">必須</span>':''}</div><code class="term-id">${esc(a.id)}</code>${a.description?`<p class="reader-text">${esc(a.description)}</p>`:''}${a.example?`<p class="hint"><span>例</span>　${esc(a.example)}</p>`:''}${a.values?.length?`<ul class="attr-values">${a.values.map(v=>`<li><code>${esc(v.value)}</code>${v.name?`<span>${esc(v.name)}</span>`:''}${v.description?`<small>${esc(v.description)}</small>`:''}</li>`).join('')}</ul>`:''}${a.question?`<p class="attr-question"><span>確認したいこと</span>${esc(a.question)}</p>`:''}${inherited?`<small class="attr-inherited"><span>上位概念から引き継ぎ</span> · ${esc(ownerName)}</small>`:''}</article>`).join('')}</div></section>`;
};
const mappingStatus=mapping=>mappingStatuses[mapping.status]||'対応案・未確認';
// Empty fields are left out: the open-questions view already lists what is missing.
const readerFields=item=>`${item.description?`<p class="reader-text">${esc(item.description)}</p>`:''}${item.example?`<section class="reader-section"><h3>具体例</h3><p class="reader-text">${esc(item.example)}</p></section>`:''}${item.question?`<section class="reader-section"><h3>確認したいこと</h3><p class="reader-text">${esc(item.question)}</p></section>`:''}`;
// Who agreed and on what grounds: a footnote to the meaning, shown only when recorded.
const recordSection=item=>item.agreed_by||item.agreed_at||item.evidence?`<section class="reader-section reader-record">${item.agreed_by||item.agreed_at?`<p class="agreement">${item.agreed_by?`<span>合意した人</span><span>${esc(item.agreed_by)}</span>`:''}${item.agreed_at?`<span>合意した日</span><span>${esc(item.agreed_at)}</span>`:''}</p>`:''}${item.evidence?`<h3>定義の根拠</h3><p class="reader-text">${esc(item.evidence)}</p>`:''}</section>`:'';
const dataSection=item=>{
 const mapping=item.data_mapping, attributes=attributeMappings(item);
 return `<section class="reader-section"><p class="mapping-state"><span class="attr-status ${esc(mapping?.status||'')}">${mapping?mappingStatus(mapping):'未整理'}</span></p>${mapping?`<h3>データの所在</h3><p class="reader-text">${esc(mapping.source)}</p><h3>1件が表すもの</h3><p class="reader-text">${esc(mapping.grain||'未確認')}</p><h3>実装上の判定条件</h3><p class="reader-text">${esc(mapping.condition||'未確認')}</p>${mapping.gap?`<h3>業務定義との差・確認事項</h3><p class="reader-text">${esc(mapping.gap)}</p>`:''}`:'<p class="hint">データ担当者と所在・粒度・判定条件を確認してください。</p>'}${attributes}${mapping||attributes?'<p class="hint">記録された対応情報です。データ接続やSQL実行による検証は行っていません。</p>':''}</section>`;
};
function attributeMappings(item){
 const rows=(item.attributes||[]).filter(a=>a.data_mapping);
 if(!rows.length)return '';
 return `<h3>属性のデータ対応</h3>${rows.map(a=>{const m=a.data_mapping;return `<div class="attr-mapping"><div class="attribute-head"><strong>${esc(a.name)}</strong><span class="attr-status ${esc(m.status)}">${mappingStatus(m)}</span></div><code class="term-id">${esc(m.source)}</code>${m.condition?`<p class="reader-text">${esc(m.condition)}</p>`:''}${m.gap?`<p class="attr-question"><span>業務定義との差・確認事項</span>${esc(m.gap)}</p>`:''}</div>`}).join('')}`;
}
// The definition reads top to bottom: what it is, examples, cases, data items, relations, then the record.
function detail(){
 const item=(selected.kind==='concept'?model.concepts:model.properties).find(x=>x.id===selected.id);
 if(!item){$('detail').innerHTML='<h2>ことばを選ぶ</h2><p class="hint">図や一覧から、定義と使われている業務を確認できます。</p>';return}
 const usages=selected.kind==='concept'?conceptUsages(model,item.id):[];
 const relations=`${item.parent?`<p>${esc(term(item.parent))}の一種</p>`:''}${model.properties.filter(p=>p.domain===item.id||p.range===item.id||p.id===item.id).map(p=>`<p>${esc(term(p.domain))} → ${esc(p.name)} → ${esc(term(p.range))}</p>`).join('')}${model.restrictions.filter(r=>r.subject===item.id).map(r=>`<p>${esc(businessRule(r))}</p>`).join('')}`;
 const cases=item.cases?.length?`<section class="reader-section"><h3>このケースは含む？</h3>${item.cases.map(c=>{const firm=(c.judgments||[]).filter(j=>j.result!=='unsure'),split=new Set(firm.map(j=>j.result)).size>1||(c.result!=='unresolved'&&firm.some(j=>j.result!==c.result));return `<article class="case-card ${esc(c.result)}${split?' split':''}"><strong>${esc(({included:'含む',excluded:'含まない',unresolved:'要確認'})[c.result])}</strong>${split?' <span class="answer-conflict">判定が分かれています</span>':''}<p>${esc(c.description)}</p>${c.reason?`<p class="hint">${esc(c.reason)}</p>`:''}${c.judgments?.length?`<ul class="case-judgments">${c.judgments.map(j=>`<li class="${esc(j.result)}" title="${esc(j.reason||'')}"><b>${esc(j.by)}</b><span>：</span><span>${esc(judgmentResults[j.result])}</span></li>`).join('')}</ul>${c.judgments.filter(j=>j.reason).map(j=>`<p class="hint"><span>${esc(j.by)}</span><span>：</span><span>${esc(j.reason)}</span></p>`).join('')}`:''}</article>`}).join('')}</section>`:'';
 const meaning=`${item.description?'':'<p class="hint">説明はまだ記録されていません。</p>'}${readerFields({...item,question:undefined})}${item.exclusion?`<section class="reader-section"><h3>含まない例</h3><p class="reader-text">${esc(item.exclusion)}</p></section>`:''}${cases}${selected.kind==='concept'?attributesSection(item):''}${relations?`<details class="reader-section"><summary>関係と分類条件</summary>${relations}</details>`:''}${recordSection(item)}`;
 const usage=`<section class="reader-section"><h3>使われている作業 · ${usages.length}件</h3><div class="reader-links">${usages.map((u,i)=>`<button data-use="${i}">${esc(u.stepName)} ↗<small>${esc(u.processName)} · ${esc(usageRoles[u.role])}</small></button>`).join('')||'<p class="hint">使われている作業は登録されていません。</p>'}</div></section>`;
 const tabs=['意味','業務での利用','データとの対応'];
 $('detail').innerHTML=`${headword(item)}${item.question?`<p class="question-banner">${uiIcon('chat')}<span><span>相談したいこと：</span><span>${esc(item.question)}</span></span></p>`:''}<div class="reader-tabs" role="group" aria-label="定義の表示内容">${tabs.map((label,i)=>`<button aria-pressed="${i===0}">${label}</button>`).join('')}</div>${[meaning,usage,dataSection(item)].map((pane,i)=>`<section class="reader-pane"${i?' hidden':''}>${pane}</section>`).join('')}`;
 const buttons=[...$('detail').querySelectorAll('.reader-tabs button')], panes=[...$('detail').querySelectorAll('.reader-pane')];
 buttons.forEach((button,i)=>button.onclick=()=>{panes.forEach((p,j)=>p.hidden=j!==i);buttons.forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)))});
 $('detail').querySelectorAll('[data-use]').forEach(b=>b.onclick=()=>{const u=usages[Number(b.dataset.use)];activeProcess=u.process;activeStep=u.step;setProcessMode(true);pickStep(u.step)});
 if(item.deprecated){const next=item.replaced_by&&[...model.concepts,...model.properties].find(x=>x.id===item.replaced_by);const banner=document.createElement('p');banner.className='deprecated-banner';banner.innerHTML=`<strong>廃止したことば</strong>${next?`<span>代わりに使うことば</span><button data-replaced>${esc(next.name)} ↗</button>`:'<span>新しい資料では使いません。</span>'}`;$('detail').querySelector('.reader-id').after(banner);banner.querySelector('[data-replaced]')?.addEventListener('click',()=>{selected={kind:selected.kind,id:next.id};refresh();focusSelection()})}
 if(item.review_state&&!item.deprecated){const badge=document.createElement('p');badge.className='review-badge '+({agreed:'agreed',discussion:'pending'}[item.review_state]||'');badge.innerHTML=uiIcon(item.review_state==='agreed'?'check':'chat')+esc(({agreed:'合意済み',discussion:'要確認',draft:'検討中'})[item.review_state]);$('detail').querySelector('.reader-id').after(badge)}
}
function processDetail(){
 const p=process();if(!p){$('process-detail').innerHTML='<h2>業務フローはまだありません</h2>';return}
 const s=p.steps.find(x=>x.id===activeStep);
 $('process-detail').innerHTML=s?`${headword(s)}<div class="step-meta"><span>${esc(stepTypes[s.type])}</span>${s.owner?`<span>${esc(s.owner)}</span>`:''}</div><div class="reader-section">${readerFields(s)}</div><section class="reader-section"><h3>登場することば</h3><div class="reader-links">${(s.items||[]).map(x=>`<button data-term="${esc(x.concept)}">${esc(term(x.concept))} ↗<small>${esc(usageRoles[x.role])}</small></button>`).join('')||'<p class="hint">関連することばはありません。</p>'}</div></section>`:`<h2>${esc(p.name)}</h2><p class="hint">${p.steps.length}個の作業 · ${p.flows.length}本の流れ</p><p>作業を選ぶと、内容と登場することばを確認できます。</p>`;
 $('process-detail').querySelectorAll('[data-term]').forEach(b=>b.onclick=()=>openConcept(b.dataset.term));
}
// Consistent, labelled SVG icons across navigation and graph controls.
const iconPaths={book:'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3z M12 6v16',map:'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15',flow:'M3 3h6v6H3z M15 15h6v6h-6z M6 9v9h9',data:'M3 6c0-5 18-5 18 0s-18 5-18 0 M3 6v12c0 5 18 5 18 0V6 M3 12c0 5 18 5 18 0',download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',fit:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',plus:'M12 5v14 M5 12h14',minus:'M5 12h14',check:'M4 12l5 5L20 6',chat:'M3 3h18v14H9l-6 4z',help:'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1 1-1.1 1.8 M12 16.8v.2',task:'M4 5h16v14H4z',decision:'M12 2l10 10-10 10L2 12z',circle:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',diff:'M7 3v13 M4 13l3 3 3-3 M17 21V8 M14 11l3-3 3 3',sun:'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',moon:'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',monitor:'M3 4h18v12H3z M8 20h8 M12 16v4',graph:'M6 4a2 2 0 1 0 0 4a2 2 0 1 0 0-4 M18 4a2 2 0 1 0 0 4a2 2 0 1 0 0-4 M12 16a2 2 0 1 0 0 4a2 2 0 1 0 0-4 M8 6h8 M7 7.8l4 8.4 M17 7.8l-4 8.4',list:'M9 6h12 M9 12h12 M9 18h12 M4 6h.01 M4 12h.01 M4 18h.01',globe:'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M3 12h18 M12 3c3.5 3.5 3.5 14.5 0 18 M12 3c-3.5 3.5-3.5 14.5 0 18',folder:'M3 6h6l2 2h10v11H3z',close:'M6 6l12 12 M18 6L6 18',image:'M3 5h18v14H3z M3 16l5-5 4 4 3-3 6 6 M15 9h.01',file:'M6 3h9l4 4v14H6z M14 3v5h5 M9 13h6 M9 17h6',scopeAll:'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z',scopeNear:'M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5 M12 3v4 M12 17v4 M3 12h4 M17 12h4',scopeFar:'M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4 M12 5a7 7 0 1 0 0 14a7 7 0 1 0 0-14'};
function uiIcon(name){return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${iconPaths[name]||iconPaths.book}"/></svg>`}
function labelIcon(element,name){if(element&&!element.querySelector('.ui-icon'))element.insertAdjacentHTML('afterbegin',uiIcon(name));}
// Tools and secondary actions show only an icon; the name is the tooltip and the accessible name.
// Main navigation and the main action of a view keep their text.
function iconOnly(element,name,label){if(!element)return;element.innerHTML=uiIcon(name);element.title=label;element.setAttribute('aria-label',label);element.classList.add('icon-only')}
iconOnly($('diagram-toggle'),'graph','関係図');iconOnly($('review-toggle'),'list','定義一覧');
labelIcon($('mode-ontology'),'book');labelIcon($('mode-process'),'flow');
iconOnly(exportMenu.querySelector('summary'),'download','出力');
for(const [format,icon] of [['svg','image'],['png','image'],['md','file']])labelIcon(exportMenu.querySelector(`[data-export="${format}"]`),icon);
const helpMenu=document.createElement('details');helpMenu.className='header-menu';helpMenu.innerHTML=`<summary></summary><div class="menu-panel"><strong>業務とことばを確認する</strong><p>左の一覧や図から対象を選びます。詳細のリンクで、作業と用語の定義を行き来できます。</p><p>内容の変更はAIに依頼してください。YAMLを保存すると、この画面に反映されます。</p><p>図はドラッグで移動、＋／−で拡大縮小できます。四隅の矢印のボタンで、図全体を表示し直します。</p><p>ボタンの名前は、マウスを乗せると表示されます。</p></div>`;document.querySelector('header').append(helpMenu);
iconOnly(helpMenu.querySelector('summary'),'help','使い方');
for(const [container,graph,fitId] of [[document.querySelector('.canvas'),cy,'fit'],[document.querySelector('.process-canvas'),pc,'flow-fit']]){
 const controls=document.createElement('div');controls.className='graph-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','図の表示操作');
 for(const [name,label,factor] of [['minus','縮小',1/1.2],['plus','拡大',1.2]]){const b=document.createElement('button');b.innerHTML=uiIcon(name);b.title=label;b.setAttribute('aria-label',label);b.onclick=()=>graph.zoom({level:Math.max(.1,Math.min(3,graph.zoom()*factor)),renderedPosition:{x:graph.width()/2,y:graph.height()/2}});controls.append(b)}
 const fit=$(fitId);iconOnly(fit,'fit','図全体を表示');controls.append(fit);container.append(controls);
}
// Terms open on the definitions list; the relationship diagram is one click away.
function openTerms(){setProcessMode(false);setReview(true)}
$('mode-ontology').onclick=()=>openTerms();
