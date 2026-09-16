// YAML is the source of truth. Keep browsing separate from authoring.
const readerStyle=document.createElement('style');
readerStyle.textContent=`#open,#save,#canvas-add,#connect,#arrange,#add-concept,#add-property,#new-process,#new-step,#flow-connect,#flow-arrange,.model-settings,.inspector>details{display:none!important}.workspace,#process-workspace{grid-template-columns:210px minmax(0,1fr) 320px}.canvas-tools{display:none}.reader-text{white-space:pre-wrap;line-height:1.8;font-size:14px}.reader-links{display:grid;gap:8px}.reader-links button{text-align:left;padding:12px;background:#f7faf9}.reader-links small{display:block;margin-top:5px}.reader-id{font-size:11px;color:#718984}.reader-section{margin:22px 0}.reader-section summary{cursor:pointer;font-size:13px;color:#526e67}.reader-section p{font-size:13px}.process-toolbar{justify-content:flex-end}#detail h2,#process-detail h2{font-size:22px}.process-list>p{display:none}.legend-note{line-height:1.8}button:focus-visible{outline:2px solid #15796e;outline-offset:3px}@media(max-width:800px){.workspace,#process-workspace{display:flex;flex-direction:column;overflow:auto}body{height:auto;overflow:auto}.canvas,.process-canvas{min-height:420px;flex-shrink:0}aside{overflow:visible}.catalog{max-height:180px}}`;
document.head.append(readerStyle);
const exportMenu=document.createElement('details');exportMenu.style.position='relative';
exportMenu.innerHTML='<summary>出力</summary><div style="position:absolute;right:0;top:30px;z-index:20;background:white;padding:12px;border:1px solid #ccdcd4;width:220px"><p class="hint">図：現在の業務／オントロジー<br>定義：全用語</p><button data-export="svg">図をSVGで保存</button><button data-export="png">図をPNGで保存</button><button data-export="md">全用語をMarkdownで保存</button></div>';
document.querySelector('header').append(exportMenu);
exportMenu.querySelectorAll('[data-export]').forEach(button=>button.onclick=async()=>{
 try{const format=button.dataset.export;if(format==='md'){download('definitions.md',publicationMarkdown(model),'text/markdown');return;}
 const svg=publicationSvg(model,{process:processMode?activeProcess:undefined});
 if(format==='svg'){download('diagram.svg',svg,'image/svg+xml');return;}
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
 try{const picture=new Image();picture.src=url;await picture.decode();const canvas=document.createElement('canvas');const scale=Math.min(2,8192/Math.max(picture.width,picture.height));canvas.width=Math.ceil(picture.width*scale);canvas.height=Math.ceil(picture.height*scale);canvas.getContext('2d').drawImage(picture,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('PNGを生成できませんでした');const pngUrl=URL.createObjectURL(blob),a=document.createElement('a');a.href=pngUrl;a.download='diagram.png';a.click();setTimeout(()=>URL.revokeObjectURL(pngUrl),1000);}finally{URL.revokeObjectURL(url)}
 }catch(error){status('出力に失敗しました：'+error.message,true)}finally{exportMenu.open=false}
});
document.querySelector('.inspector .section-label').textContent='ことばの定義';
focusSelection=function(){
 cy.resize();cy.stop();cy.elements().unselect();
 const element=cy.$id(selected.kind==='concept'?selected.id:'property:'+selected.id);
 if(!element.length)return;
 element.select();
 // Focus the selected term, not the bounding box of the entire model.
 const target=element.isNode()?element:element.source();
 cy.zoom(Math.max(1,Math.min(1.6,cy.zoom())));cy.center(target);
 document.querySelector('.inspector').scrollTop=0;
 document.querySelector('.list button.active')?.scrollIntoView({block:'nearest'});
};
openConcept=function(id){setProcessMode(false);selected={kind:'concept',id};$('search').value='';refresh();focusSelection();status('ことばの定義と、使われている作業を確認できます。')};
$('status').textContent='YAMLから表示中 · 内容の変更はAIに依頼してください';
modeBar.setAttribute('aria-label','表示を切り替え');
const readerFields=item=>`<p class="reader-id">${esc(item.id)}</p><p class="reader-text">${esc(item.description||'説明はまだありません。')}</p>${item.example?`<section class="reader-section"><h3>具体例</h3><p class="reader-text">${esc(item.example)}</p></section>`:''}${item.question?`<section class="reader-section"><h3>確認したいこと</h3><p class="reader-text">${esc(item.question)}</p></section>`:''}`;
const sharedUnderstanding=item=>{
 const mapping=item.data_mapping;
 return `<section class="reader-section"><h3>定義の確認状況</h3><p>${({draft:'案・未合意',discussion:'相談中',agreed:'合意済み'})[item.review_state]||'未確認'}</p>${item.exclusion?`<h3>含まない例</h3><p class="reader-text">${esc(item.exclusion)}</p>`:''}${item.evidence?`<h3>定義の根拠</h3><p class="reader-text">${esc(item.evidence)}</p>`:'<p class="hint">根拠はまだ記録されていません。</p>'}</section><details class="reader-section" ${mapping?.gap?'open':''}><summary>データとの対応 · ${mapping?(mapping.status==='verified'?'確認済み':'対応案・未確認'):'未整理'}</summary>${mapping?`<h3>データの所在</h3><p class="reader-text">${esc(mapping.source)}</p><h3>1件が表すもの</h3><p class="reader-text">${esc(mapping.grain||'未確認')}</p><h3>実装上の判定条件</h3><p class="reader-text">${esc(mapping.condition||'未確認')}</p>${mapping.gap?`<h3>業務定義との差・確認事項</h3><p class="reader-text">${esc(mapping.gap)}</p>`:''}`:'<p class="hint">データ担当者と所在・粒度・判定条件を確認してください。</p>'}<p class="hint">記録された対応情報です。データ接続やSQL実行による検証は行っていません。</p></details>`;
};
detail=function(){
 const item=(selected.kind==='concept'?model.concepts:model.properties).find(x=>x.id===selected.id);
 if(!item){$('detail').innerHTML='<h2>ことばを選ぶ</h2><p class="hint">図や一覧から、定義と使われている業務を確認できます。</p>';return}
 const usages=selected.kind==='concept'?conceptUsages(model,item.id):[];
 $('detail').innerHTML=`<h2>${esc(item.name)}</h2>${readerFields(item)}<section class="reader-section"><h3>使われている作業 · ${usages.length}件</h3><div class="reader-links">${usages.map((u,i)=>`<button data-use="${i}">${esc(u.stepName)} ↗<small>${esc(u.processName)} · ${esc(usageRoles[u.role])}</small></button>`).join('')||'<p class="hint">関連する作業はありません。</p>'}</div></section><details class="reader-section"><summary>関係と分類条件</summary>${item.parent?`<p>${esc(term(item.parent))}の一種</p>`:''}${model.properties.filter(p=>p.domain===item.id||p.range===item.id||p.id===item.id).map(p=>`<p>${esc(term(p.domain))} → ${esc(p.name)} → ${esc(term(p.range))}</p>`).join('')}${model.restrictions.filter(r=>r.subject===item.id).map(r=>`<p>${esc(businessRule(r))}</p>`).join('')}</details>`;
 $('detail').querySelectorAll('[data-use]').forEach(b=>b.onclick=()=>{const u=usages[Number(b.dataset.use)];activeProcess=u.process;activeStep=u.step;setProcessMode(true);pickStep(u.step)});
 $('detail').insertAdjacentHTML('beforeend',sharedUnderstanding(item));
 organizeDetail(item);
};
function organizeDetail(item){
 const root=$('detail'), sections=[...root.children];
 const usage=root.querySelector('.reader-links').parentElement;
 if(!usage.querySelector('button'))usage.querySelector('.hint').textContent='このYAMLには作業との関連づけが未登録です。業務上の関係がないことを意味しません。';
 const data=sections.at(-1);data.open=true;
 const nav=document.createElement('div');nav.className='reader-tabs';nav.setAttribute('role','group');nav.setAttribute('aria-label','定義の表示内容');
 const panes=['意味','業務での利用','データとの対応'].map((label,i)=>{const pane=document.createElement('section');pane.hidden=i!==0;const button=document.createElement('button');button.textContent=label;button.setAttribute('aria-pressed',String(i===0));button.onclick=()=>{panes.forEach((p,j)=>p.hidden=j!==i);[...nav.children].forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)))};nav.append(button);return pane});
 for(const section of sections.slice(1))panes[section===usage?1:section===data?2:0].append(section);
 root.append(nav,...panes);
 if(item.cases?.length)panes[0].insertAdjacentHTML('beforeend',`<h3>このケースは含む？</h3>${item.cases.map(c=>`<article class="case-card"><strong>${esc(({included:'含む',excluded:'含まない',unresolved:'要確認'})[c.result])}</strong><p>${esc(c.description)}</p>${c.reason?`<p class="hint">${esc(c.reason)}</p>`:''}</article>`).join('')}`);
 if(item.question){const note=document.createElement('p');note.className='question-banner';note.textContent='相談したいこと：'+item.question;nav.before(note);}
 const button=document.createElement('button');button.textContent='AIへの修正依頼をコピー';button.className='request-copy';
 button.onclick=async()=>{const request=`モデル: ${model.name}\n対象: ${selected.kind} / ${item.id}\n現在の定義:\n${JSON.stringify(item,null,2)}\n\n修正したいこと: [ここに記入]\n\n対象モデルをinspectで確認し、CLI applyで変更してください。不明点は質問し、合意を推測しないでください。`;
 try{await navigator.clipboard.writeText(request);button.textContent='コピーしました';}catch{let fallback=root.querySelector('.copy-fallback');if(!fallback){fallback=document.createElement('textarea');fallback.className='copy-fallback';fallback.readOnly=true;fallback.setAttribute('aria-label','AIへの修正依頼');root.append(fallback)}fallback.value=request;fallback.focus();fallback.select();button.textContent='下の依頼文をコピーしてください';}};
 root.append(button);
}
readerStyle.textContent+=`.reader-tabs{display:flex;gap:4px;border-bottom:1px solid #dce6df;padding-bottom:10px}.reader-tabs button{font-size:12px;padding:7px;border:0;background:transparent}.reader-tabs button[aria-pressed="true"]{background:#e2f1eb;color:#155e50}.question-banner,.case-card{padding:12px;border-radius:8px;background:#fff6df;font-size:13px;line-height:1.7}.case-card{background:#f5f8f6;margin:8px 0}.request-copy{width:100%;margin-top:20px;font-size:12px}#detail>section[hidden]{display:none}`;
cy.off('tap','edge');
cy.on('tap','edge',e=>{const edge=e.target;selected={kind:edge.data('kind')==='property'?'property':'concept',id:edge.data('ref')};detail();const explanation=edge.data('kind')==='parent'?`${term(edge.source().id())}は${term(edge.target().id())}の一種です。`:edge.data('kind')==='property'?`${term(edge.source().id())}から${term(edge.target().id())}への「${edge.data('label')}」という関係です。`:`${term(edge.source().id())}の分類条件：${edge.data('label')}。相手の種類は${term(edge.target().id())}です。`;const note=document.createElement('p');note.className='meaning-card';note.textContent=explanation;$('detail').prepend(note)});
processDetail=function(){
 const p=process();if(!p){$('process-detail').innerHTML='<h2>業務フローはまだありません</h2>';return}
 const s=p.steps.find(x=>x.id===activeStep);
 $('process-detail').innerHTML=s?`<h2>${esc(s.name)}</h2>${readerFields(s)}<p class="hint">${esc(stepTypes[s.type])}${s.owner?' · '+esc(s.owner):''}</p><section class="reader-section"><h3>登場することば</h3><div class="reader-links">${(s.items||[]).map(x=>`<button data-term="${esc(x.concept)}">${esc(term(x.concept))} ↗<small>${esc(usageRoles[x.role])}</small></button>`).join('')||'<p class="hint">関連することばはありません。</p>'}</div></section>`:`<h2>${esc(p.name)}</h2><p class="hint">${p.steps.length}個の作業 · ${p.flows.length}本の流れ</p><p>作業を選ぶと、内容と登場することばを確認できます。</p>`;
 $('process-detail').querySelectorAll('[data-term]').forEach(b=>b.onclick=()=>openConcept(b.dataset.term));
};
pc.off('tap','edge');pc.off('dragfree');cy.off('dragfree');
pc.autoungrabify(true);cy.autoungrabify(false);
// Dragging is a view adjustment only. Existing refresh() preserves node positions.
cy.nodes().grabify();
// Consistent, labelled SVG icons across navigation and graph controls.
const iconPaths={book:'M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3z M12 6v16',flow:'M3 3h6v6H3z M15 15h6v6h-6z M6 9v9h9',data:'M3 6c0-5 18-5 18 0s-18 5-18 0 M3 6v12c0 5 18 5 18 0V6 M3 12c0 5 18 5 18 0',download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',fit:'M8 3H3v5 M16 3h5v5 M3 16v5h5 M21 16v5h-5',plus:'M12 5v14 M5 12h14',minus:'M5 12h14',check:'M4 12l5 5L20 6',chat:'M3 3h18v14H9l-6 4z',help:'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4 M12 18v1',task:'M4 5h16v14H4z',decision:'M12 2l10 10-10 10L2 12z',circle:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',copy:'M8 8h13v13H8z M16 8V3H3v13h5'};
function uiIcon(name){return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${iconPaths[name]||iconPaths.book}"/></svg>`}
function labelIcon(element,name){if(element&&!element.querySelector('.ui-icon'))element.insertAdjacentHTML('afterbegin',uiIcon(name));}
const viewSwitch=document.createElement('div');viewSwitch.className='view-switch';viewSwitch.setAttribute('role','group');viewSwitch.setAttribute('aria-label','ことばの表示形式');
const diagramButton=document.createElement('button');diagramButton.innerHTML=uiIcon('flow')+'関係図';diagramButton.onclick=()=>setReview(false);
const definitionsButton=$('review-toggle');definitionsButton.onclick=()=>setReview(true);
viewSwitch.append(diagramButton,definitionsButton);document.querySelector('.canvas').append(viewSwitch);
const originalSetReview=setReview;
setReview=function(enabled){originalSetReview(enabled);definitionsButton.innerHTML=uiIcon('book')+'定義一覧';diagramButton.setAttribute('aria-pressed',String(!enabled));definitionsButton.setAttribute('aria-pressed',String(enabled))};
setReview(false);$('review-board').setAttribute('aria-label','ことばの定義一覧');
readerStyle.textContent+=`.view-switch{position:absolute;top:14px;left:14px;z-index:4;display:flex;gap:3px;padding:4px;border:1px solid #d7e4df;border-radius:9px;background:#fff}.view-switch button{display:inline-flex;align-items:center;border:0;background:transparent;padding:7px 10px;font-size:12px}.view-switch button[aria-pressed="true"]{background:#e7f3ef;color:#155e50}body.reviewing #review-toggle{background:#e7f3ef;color:#155e50}body.reviewing .canvas>.graph-controls{display:none}body.reviewing .workspace{grid-template-columns:210px minmax(0,1fr)}@media(max-width:800px){body.reviewing .workspace{display:flex}}`;
$('mode-ontology').textContent='ことばと関係';labelIcon($('mode-ontology'),'book');labelIcon($('mode-process'),'flow');
exportMenu.classList.add('header-menu');labelIcon(exportMenu.querySelector('summary'),'download');
const helpMenu=document.createElement('details');helpMenu.className='header-menu';helpMenu.innerHTML=`<summary>${uiIcon('help')}使い方</summary><div class="help-content"><strong>業務とことばを確認する</strong><p>左の一覧や図から対象を選びます。詳細のリンクで、作業と用語の定義を行き来できます。</p><p>内容の変更はAIに依頼してください。YAMLを保存すると、この画面に反映されます。</p><p>図はドラッグで移動、＋／−で拡大縮小できます。「全体」で表示を戻します。</p></div>`;document.querySelector('header').append(helpMenu);
helpMenu.addEventListener('toggle',()=>{if(helpMenu.open)exportMenu.open=false});exportMenu.addEventListener('toggle',()=>{if(exportMenu.open)helpMenu.open=false});
for(const [container,graph,fitId] of [[document.querySelector('.canvas'),cy,'fit'],[document.querySelector('.process-canvas'),pc,'flow-fit']]){
 const controls=document.createElement('div');controls.className='graph-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','図の表示操作');
 for(const [name,label,factor] of [['minus','縮小',1/1.2],['plus','拡大',1.2]]){const b=document.createElement('button');b.innerHTML=uiIcon(name);b.title=label;b.setAttribute('aria-label',label);b.onclick=()=>graph.zoom({level:Math.max(.1,Math.min(3,graph.zoom()*factor)),renderedPosition:{x:graph.width()/2,y:graph.height()/2}});controls.append(b)}
 const fit=$(fitId);fit.textContent='全体';fit.title='図全体を表示';fit.setAttribute('aria-label','図全体を表示');labelIcon(fit,'fit');controls.append(fit);container.append(controls);
}
const plainProcessRender=renderProcess;
renderProcess=function(){plainProcessRender();const p=process();$('process-steps').querySelectorAll('[data-step]').forEach(b=>{const step=p?.steps.find(s=>s.id===b.dataset.step);labelIcon(b,['start','end'].includes(step?.type)?'circle':['decision','parallel','join'].includes(step?.type)?'decision':'task');b.classList.toggle('active',b.dataset.step===activeStep)})};
const plainPickStep=pickStep;
pickStep=function(id){plainPickStep(id);$('process-steps').querySelectorAll('[data-step]').forEach(b=>b.classList.toggle('active',b.dataset.step===activeStep))};
const plainDetail=detail;
detail=function(){plainDetail();const item=(selected.kind==='concept'?model.concepts:model.properties).find(x=>x.id===selected.id);if(!item)return;document.querySelectorAll('.reader-tabs button').forEach((b,i)=>labelIcon(b,['book','flow','data'][i]));labelIcon(document.querySelector('.question-banner'),'chat');labelIcon(document.querySelector('.request-copy'),'copy');if(item.review_state){const badge=document.createElement('p');badge.className='review-badge '+(item.review_state==='agreed'?'agreed':'pending');badge.innerHTML=uiIcon(item.review_state==='agreed'?'check':'chat')+esc(({agreed:'合意済み',discussion:'要確認',draft:'検討中'})[item.review_state]);$('detail').querySelector('h2').after(badge)}};
readerStyle.textContent+=`.ui-icon{width:17px;height:17px;display:inline-block;vertical-align:middle;flex-shrink:0;margin-right:6px}header .brand svg{width:28px;height:28px}#status:not(.error),#flow-hint,.process-toolbar{display:none}#process-cy{inset:0}.mode-bar button,.reader-tabs button{display:inline-flex;align-items:center}.reader-tabs{flex-wrap:wrap}.reader-tabs .ui-icon{width:14px;height:14px;margin-right:4px}.header-menu{margin:0;position:relative}.header-menu:first-of-type{margin-left:auto}.header-menu summary{cursor:pointer;list-style:none;display:flex;align-items:center;padding:8px 10px;border:1px solid #d7e4df;border-radius:8px;font-size:12px}.header-menu summary::-webkit-details-marker{display:none}.help-content{position:absolute;right:0;top:42px;z-index:30;width:min(320px,85vw);padding:18px;background:white;border:1px solid #d7e4df;border-radius:10px;box-shadow:0 8px 24px #193b4320;font-size:13px;line-height:1.7}.header-menu button{width:100%;margin:4px 0}.graph-controls{position:absolute;right:16px;bottom:16px;z-index:3;display:flex;gap:4px;background:#fff;padding:5px;border:1px solid #d7e4df;border-radius:10px;box-shadow:0 3px 10px #193b4310}.graph-controls button{position:static!important;font-size:12px;display:flex;align-items:center;padding:8px;border:0;background:white}.graph-controls button:hover{background:#e7f3ef}.graph-controls button[aria-label="拡大"] .ui-icon,.graph-controls button[aria-label="縮小"] .ui-icon{margin:0}#process-steps button{border-color:transparent;background:transparent;padding:12px 8px}#process-steps button.active{background:#e7f3ef;border-color:#b9d7cc}#process-steps small{padding-left:23px;margin-top:5px;color:#61796f}.review-badge{display:inline-flex;align-items:center;font-size:12px;border-radius:20px;padding:5px 9px;margin:0 0 12px}.review-badge.agreed{background:#e1f3e8;color:#206647}.review-badge.pending{background:#fff3d5;color:#795718}`;
// Store only browsing state, never a second copy of the model.
window.addEventListener('pagehide',()=>{sessionStorage.setItem('structra-view:'+location.pathname,JSON.stringify({selected,processMode,activeProcess,activeStep,zoom:cy.zoom(),pan:cy.pan(),pz:pc.zoom(),pp:pc.pan()}))});
setTimeout(()=>{let state;try{state=JSON.parse(sessionStorage.getItem('structra-view:'+location.pathname))}catch{}if(state){selected=state.selected||selected;activeProcess=state.activeProcess;activeStep=state.activeStep;refresh();setProcessMode(!!state.processMode);cy.zoom(state.zoom);cy.pan(state.pan);pc.zoom(state.pz);pc.pan(state.pp)}else if(model.processes?.length)setProcessMode(true)},0);
