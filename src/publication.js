import { conceptAttributes, temporalFacts, metricReach, mappingStatuses, historyKinds, metricAggregations } from './ontology.js';
// Shared, dependency-free document output for CLI and browser.
const xml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const md = value => String(value ?? '').replace(/([\\`*_{}\[\]<>#|])/g,'\\$1');
const cell = value => md(value).replace(/\r?\n/g,' ');
export function publicationMarkdown(model, { concept, date = new Date().toISOString() } = {}) {
  const concepts = concept ? model.concepts.filter(c=>c.id===concept) : model.concepts;
  if(concept&&!concepts.length)throw new Error(`Concept not found: ${concept}`);
  const blocks = [`# ${md(model.name)}`,`出力日時: ${date}\n\n元モデル: ${md(model.base)}\n\n出力時点のスナップショットです。`];
  for(const c of concepts){
    blocks.push(`## ${md(c.name)}\n\nID: ${md(c.id)}${c.aliases?.length?`\n\n別名: ${c.aliases.map(md).join('、')}`:''}${c.imported_from?`\n\n共通定義: ${md(c.imported_from)}`:''}${c.deprecated?`\n\n**廃止**${c.replaced_by?` — 代わりに「${md(model.concepts.find(x=>x.id===c.replaced_by)?.name||c.replaced_by)}」`:''}`:''}`);
    for(const [key,label] of [['description','定義'],['example','具体例'],['exclusion','含まない例'],['question','確認事項'],['evidence','根拠'],['review_state','確認状況'],['agreed_by','合意した人'],['agreed_at','合意した日']])if(c[key])blocks.push(`### ${label}\n\n${md(c[key])}`);
    if(c.cases?.length)blocks.push(`### ケース\n\n${c.cases.map(x=>`- ${md(x.result)}: ${md(x.description)}${x.reason?' — '+md(x.reason):''}`).join('\n')}`);
    if(c.attributes?.length)blocks.push(`### 属性（データ項目）\n\n| 属性 | ID | 種類 | 必須 | 説明 | データの所在 |\n|---|---|---|---|---|---|\n${c.attributes.map(a=>`| ${cell(a.name)} | ${cell(a.id)} | ${cell(a.type)}${a.values?.length?' ('+a.values.map(v=>cell(v.value)).join(', ')+')':''} | ${a.required?'はい':''} | ${cell(a.description)} | ${a.data_mapping?cell(a.data_mapping.source)+' ['+cell(a.data_mapping.status)+']':''} |`).join('\n')}`);
    if(c.effective_from||c.effective_to)blocks.push(`### 適用期間\n\n${md(c.effective_from||'…')} 〜 ${md(c.effective_to||'…')}（定義を業務で適用する期間。合意した日とは別です）`);
    const attributeName=id=>conceptAttributes(model,c.id).find(r=>r.attribute.id===id)?.attribute.name||id;
    if(c.temporal)blocks.push(`### 時間の意味\n\n${factLines(temporalFacts(c.temporal,attributeName))}`);
    if(c.data_mapping)blocks.push(`### データとの対応\n\n${mappingLines(c.data_mapping)}\n\n記録された対応情報であり、実データの検証結果ではありません。`);
    const uses=(model.processes||[]).flatMap(p=>p.steps.filter(s=>s.items?.some(i=>i.concept===c.id)).map(s=>`- ${md(p.name)} → ${md(s.name)}`));
    blocks.push(`### 業務での利用\n\n${uses.join('\n')||'関連づけは未登録です。'}`);
  }
  if(!concept)blocks.push(...analysisBlocks(model));
  return blocks.join('\n\n')+'\n';
}
const factLines=facts=>facts.map(([label,...values])=>`- ${md(label)}: ${values.map(md).join(' — ')}`).join('\n');
function mappingLines(m){
  return [['データの所在',m.source],['確認状態',mappingStatuses[m.status]||m.status],m.grain&&['1件が表すもの',m.grain],m.condition&&['実装上の判定条件',m.condition],m.history&&['過去の状態',historyKinds[m.history]],m.gap&&['業務定義との差・確認事項',m.gap]].filter(Boolean).map(([label,value])=>`- ${md(label)}: ${md(value)}`).join('\n');
}
// Metrics as people define them; nothing here computes them.
function analysisBlocks(model){
  if(!model.metrics?.length)return [];
  const blocks=['## 指標'],name=id=>model.concepts.find(x=>x.id===id)?.name||id;
  for(const m of model.metrics){
    const lines=[`ID: ${md(m.id)}${m.aliases?.length?` · 別名: ${m.aliases.map(md).join('、')}`:''} · 合意状態: ${({agreed:'合意済み',discussion:'要相談',draft:'考え中'})[m.review_state||'draft']}${m.deprecated?' · **廃止**':''}`];
    if(m.description)lines.push(md(m.description));
    lines.push(factLines([m.concept&&['対象の概念',name(m.concept)],m.aggregation&&['集計方法',metricAggregations[m.aggregation]],m.attribute&&['集計対象',conceptAttributes(model,m.concept).find(r=>r.attribute.id===m.attribute)?.attribute.name||m.attribute],m.formula&&['計算式',m.formula],m.condition&&['対象条件',m.condition],m.exclusion&&['除外条件',m.exclusion],m.unit&&['単位',m.unit],...temporalFacts(m.temporal),(m.effective_from||m.effective_to)&&['適用期間',`${m.effective_from||'…'} 〜 ${m.effective_to||'…'}`],m.question&&['確認事項',m.question],m.evidence&&['根拠',m.evidence],m.agreed_by&&['合意した人',m.agreed_by],m.agreed_at&&['合意した日',m.agreed_at]].filter(Boolean)));
    if(m.dimensions?.length)lines.push(`| 軸 | 足し合わせ | 補足 |\n|---|---|---|\n${m.dimensions.map(d=>`| ${cell(d.name)} | ${d.additive===undefined?'未記録':d.additive?'できる':'できない'} | ${cell(d.note)} |`).join('\n')}`);
    if(m.cases?.length)lines.push(`数え方の例:\n\n${m.cases.map(c=>`- ${md(c.description)} → ${c.expected?md(c.expected):'**未決定**'}${c.reason?' — '+md(c.reason):''}`).join('\n')}`);
    lines.push(`答えられる範囲（記録からの判断。実データでは確かめていません）:\n\n${metricReach(model,m).rows.map(r=>`- ${md(r.label)}: ${md(r.note)}`).join('\n')}`);
    blocks.push(`### ${md(m.name)}\n\n${lines.join('\n\n')}`);
  }
  return blocks;
}
export function publicationSvg(model, { process, date = new Date().toISOString() } = {}) {
  const p=process?(model.processes||[]).find(p=>p.id===process):null;
  if(process&&!p)throw new Error(`Process not found: ${process}`);
  const nodes=p?p.steps:model.concepts;
  const edges=p?p.flows.map(f=>({...f,label:f.label||'次へ'})):[
    ...model.properties.map(r=>({source:r.domain,target:r.range,label:r.name})),
    ...model.concepts.filter(c=>c.parent).map(c=>({source:c.id,target:c.parent,label:'の一種',dashed:true})),
    ...model.restrictions.filter(r=>r.target).map(r=>({source:r.subject,target:r.target,label:`${model.properties.find(p=>p.id===r.property)?.name||r.property}: ${r.operator==='someValuesFrom'?'1つ以上':'相手はすべて'}`,dashed:true}))
  ];
  const positions=new Map(nodes.map((n,i)=>[n.id,n.position||{x:(i%3)*320,y:Math.floor(i/3)*190}]));
  const xs=[...positions.values()].map(p=>p.x),ys=[...positions.values()].map(p=>p.y);
  const minX=Math.min(0,...xs),minY=Math.min(0,...ys);
  const width=Math.max(800,Math.max(0,...xs)-minX+340),height=Math.max(300,Math.max(0,...ys)-minY+280);
  const point=id=>{const pos=positions.get(id);if(!pos)throw new Error(`Missing node: ${id}`);return {x:pos.x-minX+170,y:pos.y-minY+130}};
  const lines=edges.map((e,i)=>{const a=point(e.source),b=point(e.target),dx=b.x-a.x,dy=b.y-a.y;const f=1/Math.max(Math.abs(dx)/110,Math.abs(dy)/36,1);const end={x:b.x-dx*f,y:b.y-dy*f};return `<path d="M ${a.x} ${a.y} Q ${(a.x+b.x)/2+30*(i%2)} ${(a.y+b.y)/2-35} ${end.x} ${end.y}" fill="none" stroke="#718780" ${e.dashed?'stroke-dasharray="5 4"':''} marker-end="url(#arrow)"/><text x="${(a.x+b.x)/2}" y="${(a.y+b.y)/2-24}" text-anchor="middle" font-size="12" paint-order="stroke" stroke="white" stroke-width="4">${xml(e.label)}</text>`}).join('');
  const boxes=nodes.map(n=>{const a=point(n.id),chars=Array.from(n.name);return `<rect x="${a.x-110}" y="${a.y-36}" width="220" height="72" rx="10" fill="white" stroke="#278b88"/><text text-anchor="middle" font-size="14">${Array.from({length:Math.ceil(chars.length/14)},(_,i)=>`<tspan x="${a.x}" y="${a.y-10+i*18}">${xml(chars.slice(i*14,i*14+14).join(''))}</tspan>`).join('')}</text>`}).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="white"/><style>text{font-family:system-ui,sans-serif;fill:#203d35}</style><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8Z" fill="#718780"/></marker></defs><text x="24" y="32" font-size="20">${xml(p?.name||model.name)}</text><text x="24" y="58" font-size="11">${xml(model.name)} · ${xml(date)} · 出力時点のスナップショット</text>${lines}${boxes}<text x="24" y="${height-20}" font-size="11">${p?'矢印：作業の順序':'実線：関係　破線：上位概念・分類条件（ラベル参照）'}</text></svg>`;
}
