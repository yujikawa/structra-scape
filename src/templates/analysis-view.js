// Metrics and time: listed under the terms and read in the same detail pane. Like the rest of
// the reader, they show what people know and have agreed, not how it is implemented.
const metricSection=document.createElement('section');metricSection.className='catalog';metricSection.id='metric-section';metricSection.hidden=true;
metricSection.innerHTML='<div class="catalog-head"><h3>指標 <small id="metric-count"></small></h3></div><div id="metrics-list" class="list"></div>';
$('retired-section').before(metricSection);
// The list a selection belongs to; the base reader only knows concepts and properties.
function selectionCollection(kind){return kind==='property'?model.properties:kind==='metric'?model.metrics||[]:model.concepts}
const factsHtml=facts=>facts.length?`<dl class="fact-list">${facts.map(([label,...values])=>`<dt>${esc(label)}</dt><dd>${values.map(v=>`<span>${esc(v)}</span>`).join('<span> — </span>')}</dd>`).join('')}</dl>`:'';
const effectiveHtml=item=>item.effective_from||item.effective_to?`<p class="hint"><span>適用期間</span> · <span>${esc(item.effective_from||'…')}</span><span> 〜 </span><span>${esc(item.effective_to||'…')}</span></p>`:'';
const openButton=(kind,item)=>`<button data-open-kind="${kind}" data-open-id="${esc(item.id)}">${esc(item.name)} ↗<small>${kind==='metric'?'指標':'ことば'}</small></button>`;
function wireOpenButtons(){$('detail').querySelectorAll('[data-open-kind]').forEach(b=>b.onclick=()=>{selected={kind:b.dataset.openKind,id:b.dataset.openId};refresh();focusSelection()})}

// A concept gains its time section, the history its data keeps, and the metrics counting it.
function decorateConcept(item){
  const panes=$('detail').querySelectorAll('.reader-pane');
  const attributeName=id=>conceptAttributes(model,item.id).find(r=>r.attribute.id===id)?.attribute.name||id;
  if(item.temporal||item.effective_from||item.effective_to)panes[0]?.insertAdjacentHTML('afterbegin',`<section class="reader-section"><h3>時間の意味</h3>${factsHtml(temporalFacts(item.temporal,attributeName))}${effectiveHtml(item)}</section>`);
  const metrics=(model.metrics||[]).filter(m=>m.concept===item.id);
  if(metrics.length)panes[1]?.insertAdjacentHTML('beforeend',`<section class="reader-section"><h3>この概念を数える指標</h3><div class="reader-links">${metrics.map(m=>openButton('metric',m)).join('')}</div></section>`);
  // Where the term is: the steps that create, receive, update or read it, by work place.
  const owner=item.imported_from||entries[Number(entryIndex)]?.file, key=`${owner}#${item.id}`;
  const uses=placeUses(entries).filter(u=>u.concept===key), gaps=dataMoves(placeUses(entries)).filter(m=>m.concept===key&&m.gap);
  if(uses.length){
    const roleNames={creates:'生まれる',receives:'受け取る',updates:'更新する',reads:'使う'};
    panes[1]?.insertAdjacentHTML('beforeend',`<section class="reader-section"><h3>作業場所とデータ</h3><ol class="place-trail">${['creates','receives','updates','reads'].flatMap(role=>uses.filter(u=>u.role===role).map(u=>`<li class="${role}"><span class="kind-tag">${roleNames[role]}</span><button class="place-name" data-place-open="${uses.indexOf(u)}">${esc(u.placeName)}</button><button data-place-step="${uses.indexOf(u)}">${esc(u.stepName)} ↗<small>${esc(u.domainName)} · ${esc(u.processName)}${u.timing?` · ${esc(u.timing)}`:''}</small></button></li>`)).join('')}</ol>${gaps.map(g=>`<p class="attr-question"><span>経路が未記録</span>${esc(g.fromName)} → ${esc(g.toName)}</p>`).join('')}<p class="hint">作業に書かれた作業場所から読み取っています。渡し方（手渡し・ファイル・APIなど）は区別していません。</p></section>`);
    $('detail').querySelectorAll('[data-place-open]').forEach(b=>b.onclick=()=>{const u=uses[Number(b.dataset.placeOpen)];openFromOverview(u.domain,()=>{setProcessMode(true);openPlace(u.placeId)})});
    $('detail').querySelectorAll('[data-place-step]').forEach(b=>b.onclick=()=>{const u=uses[Number(b.dataset.placeStep)];openFromOverview(u.domain,()=>{activeProcess=u.process;activeStep=u.step;setProcessMode(true);pickStep(u.step)})});
  }
  if(item.data_mapping?.history)panes[2]?.querySelector('.reader-section')?.insertAdjacentHTML('beforeend',`<h3>過去の状態</h3><p class="reader-text">${esc(historyKinds[item.data_mapping.history])}</p>`);
  wireOpenButtons();
}
function metricDetail(m){
  const reach=metricReach(model,m), concept=model.concepts.find(c=>c.id===m.concept);
  const attribute=m.attribute&&conceptAttributes(model,m.concept).find(r=>r.attribute.id===m.attribute)?.attribute.name;
  const how=factsHtml([concept&&['対象の概念',concept.name],m.aggregation&&['集計方法',metricAggregations[m.aggregation]],m.attribute&&['集計対象',attribute||m.attribute],m.formula&&['計算式',m.formula],m.condition&&['対象条件',m.condition],m.exclusion&&['除外条件',m.exclusion],m.unit&&['単位',m.unit]].filter(Boolean));
  const dimensions=m.dimensions?.length?`<section class="reader-section"><h3>集計の軸</h3><table class="data-table"><thead><tr><th>軸</th><th>足し合わせ</th><th>補足</th></tr></thead><tbody>${m.dimensions.map(d=>`<tr><td>${esc(d.name)}</td><td><span class="additive ${d.additive===false?'no':d.additive?'ok':''}">${d.additive===undefined?'未記録':d.additive?'できる':'できない'}</span></td><td>${esc(d.note||'')}</td></tr>`).join('')}</tbody></table></section>`:'';
  const cases=m.cases?.length?`<section class="reader-section"><h3>数え方の例</h3>${m.cases.map(c=>`<article class="case-card ${c.expected?'included':'unresolved'}"><strong>${c.expected?'決定':'要確認'}</strong><p>${esc(c.description)}</p>${c.expected?`<p class="case-expected"><span>→ </span><span>${esc(c.expected)}</span></p>`:''}${c.reason?`<p class="hint">${esc(c.reason)}</p>`:''}</article>`).join('')}</section>`:'';
  const reachHtml=`<section class="reader-section"><h3>答えられる範囲</h3>${reach.rows.map(r=>`<div class="reach-row ${r.state}"><strong>${esc(r.label)}</strong><span>${esc(r.note)}</span></div>`).join('')}<p class="hint">${reach.concept?`<span>根拠：</span><span>${esc(reach.concept.name)}</span><span>のデータ対応の記録</span><span>。実データでは確かめていません。</span>`:'<span>対象の概念が記録されていません。</span>'}</p></section>`;
  const badge=m.review_state?`<p class="review-badge ${({agreed:'agreed',discussion:'pending'})[m.review_state]||''}">${uiIcon(m.review_state==='agreed'?'check':'chat')}${esc(({agreed:'合意済み',discussion:'要確認',draft:'検討中'})[m.review_state])}</p>`:'';
  const question=m.question?`<p class="question-banner">${uiIcon('chat')}<span><span>相談したいこと：</span><span>${esc(m.question)}</span></span></p>`:'';
  $('detail').innerHTML=`${headword(m)}<p class="kind-line"><span class="kind-tag">指標</span></p>${badge}${question}${m.description?`<p class="reader-text">${esc(m.description)}</p>`:'<p class="hint">説明はまだ記録されていません。</p>'}<section class="reader-section"><h3>数え方</h3>${how}</section>${cases}<section class="reader-section"><h3>時点</h3>${factsHtml(temporalFacts(m.temporal))||'<p class="hint">基準日や対象期間の意味は未記録です。</p>'}${effectiveHtml(m)}</section>${reachHtml}${dimensions}${concept?`<section class="reader-section"><div class="reader-links">${openButton('concept',concept)}</div></section>`:''}${recordSection(m)}`;
  wireOpenButtons();
}
const metricBaseDetail=detail;
detail=function(){
  if(selected.kind!=='metric'){metricBaseDetail();const item=selected.kind==='concept'&&model.concepts.find(c=>c.id===selected.id);if(item)decorateConcept(item);return}
  const metric=(model.metrics||[]).find(m=>m.id===selected.id);
  if(metric){metricDetail(metric);return}
  selected={kind:'concept',id:model.concepts[0]?.id};metricBaseDetail();
};
const metricRenderLists=renderLists;
renderLists=function(){
  metricRenderLists();
  const all=model.metrics||[], query=$('search').value.trim().toLowerCase();
  const items=all.filter(m=>`${m.name} ${m.id} ${(m.aliases||[]).join(' ')}`.toLowerCase().includes(query));
  metricSection.hidden=!all.length;
  $('metric-count').textContent=`${items.length} / ${all.length}`;
  $('metrics-list').innerHTML=items.map(m=>`<button data-kind="metric" data-id="${esc(m.id)}" class="${selected.kind==='metric'&&selected.id===m.id?'active':''}${m.deprecated?' deprecated':''}">${esc(m.name)}<code class="term-id">${esc(m.id)}</code></button>`).join('')||'<small>該当する項目はありません</small>';
  $('metrics-list').querySelectorAll('button').forEach(b=>b.onclick=()=>{setReview(false);selected={kind:'metric',id:b.dataset.id};refresh();focusSelection()});
  // A term in the list stays highlighted only while a term or relationship is selected.
  if(selected.kind==='metric')document.querySelectorAll('#concepts button.active,#properties button.active,#retired button.active').forEach(b=>b.classList.remove('active'));
};
// Metrics are reviewed with the terms: one card each, after the term cards.
const metricUpdateReview=updateReview;
updateReview=function(){
  metricUpdateReview();
  const metrics=(model.metrics||[]).filter(m=>!m.deprecated);if(!metrics.length)return;
  $('review-board').insertAdjacentHTML('beforeend',`<h3 class="retired-heading"><span>指標</span><small>${metrics.length}件</small></h3><div class="review-grid">${metrics.map(m=>`<article class="review-card"><div class="entry-head"><span class="review-status ${esc(m.review_state||'draft')}">${({draft:'考え中',discussion:'要相談',agreed:'合意済み'})[m.review_state||'draft']}</span><h3><button data-review-metric="${esc(m.id)}">${esc(m.name)} ↗</button></h3><code class="term-id">${esc(m.id)}</code></div><div class="entry-body"><p>${esc(m.description||'この指標の意味を、一緒に決めましょう。')}</p>${m.unit?`<p class="hint"><span>単位</span> · <span>${esc(m.unit)}</span></p>`:''}</div></article>`).join('')}</div>`);
  $('review-board').querySelectorAll('[data-review-metric]').forEach(b=>b.onclick=()=>{setReview(false);selected={kind:'metric',id:b.dataset.reviewMetric};refresh();focusSelection()});
};
