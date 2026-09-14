// Deliberately shared by Node and the offline editor: one validation/export contract.
export const restrictionLabels = {
  someValuesFrom: '条件を満たす関係先が少なくとも1つある',
  allValuesFrom: '関係先はすべて指定した概念に属する（存在は要求しない）',
  minCardinality: '関係先の数が最低',
  maxCardinality: '関係先の数が最大',
  cardinality: '関係先の数がちょうど',
};

export function validateOntology(model) {
  const errors = [];
  if (!model || typeof model !== 'object') return ['モデルはオブジェクトで指定してください'];
  if (model.kind !== 'ontology') errors.push('kind は ontology にしてください');
  if (typeof model.name !== 'string' || !model.name.trim()) errors.push('モデル名が必要です');
  if (typeof model.base !== 'string' || !/^https?:\/\/[^\s<>"{}|^`\\]+[#/]$/.test(model.base)) errors.push('base は # または / で終わる HTTP(S) IRI にしてください');
  const collections = ['concepts', 'properties', 'restrictions'];
  for (const key of collections) if (!Array.isArray(model[key])) errors.push(`${key} は配列にしてください`);
  if (errors.length) return errors;
  const ids = new Set();
  for (const item of [...model.concepts, ...model.properties]) {
    if (!item || typeof item !== 'object') { errors.push('概念・関係はオブジェクトで指定してください'); continue; }
    if (typeof item.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(item.id)) errors.push(`無効なID: ${item.id}`);
    if (ids.has(item.id)) errors.push(`重複ID: ${item.id}`);
    ids.add(item.id);
    if (typeof item.name !== 'string' || !item.name.trim()) errors.push(`${item.id}: 名前が必要です`);
    if (item.description !== undefined && typeof item.description !== 'string') errors.push(`${item.id}: 説明は文字列にしてください`);
    for (const field of ['example', 'question']) if (item[field] !== undefined && typeof item[field] !== 'string') errors.push(`${item.id}: ${field} は文字列にしてください`);
    if (item.review_state !== undefined && !['draft', 'discussion', 'agreed'].includes(item.review_state)) errors.push(`${item.id}: 話し合いの状態が無効です`);
    if (item.position !== undefined && (!item.position || !Number.isFinite(item.position.x) || !Number.isFinite(item.position.y))) errors.push(`${item.id}: 配置には有限のx・y座標が必要です`);
  }
  const concepts = new Set(model.concepts.filter(Boolean).map(c => c.id));
  const properties = new Set(model.properties.filter(Boolean).map(p => p.id));
  for (const c of model.concepts.filter(Boolean)) {
    if (c.parent && !concepts.has(c.parent)) errors.push(`${c.id}: 上位概念が見つかりません`);
    if (c.parent === c.id) errors.push(`${c.id}: 自分自身を上位概念には指定できません`);
  }
  for (const p of model.properties.filter(Boolean)) {
    if (!concepts.has(p.domain) || !concepts.has(p.range)) errors.push(`${p.id}: 主語・関係先の概念が見つかりません`);
  }
  for (const r of model.restrictions) {
    if (!r || typeof r !== 'object') { errors.push('制限はオブジェクトで指定してください'); continue; }
    if (!concepts.has(r.subject) || !properties.has(r.property)) errors.push('制限の概念または関係が見つかりません');
    if (!Object.hasOwn(restrictionLabels, r.operator)) errors.push(`未対応の制限: ${r.operator}`);
    else if (r.operator.endsWith('ValuesFrom')) {
      if (!concepts.has(r.target)) errors.push('制限の関係先が見つかりません');
    } else if (!Number.isSafeInteger(r.count) || r.count < 0) errors.push('個数は0以上の安全な整数にしてください');
    if (!['necessary', 'equivalent'].includes(r.mode)) errors.push('制限の定義方法は necessary または equivalent にしてください');
  }
  if (model.processes !== undefined) errors.push(...validateProcesses(model));
  return errors;
}

export const usageRoles = { creates: '作成する', reads: '参照する', updates: '更新する', participates: '参加する' };
export const stepTypes = { start: '開始', task: '作業', decision: '分岐（一つ選ぶ）', parallel: '並行開始', join: '合流（すべて待つ）', end: '終了' };
export function conceptUsages(model, conceptId) {
  return (model.processes || []).flatMap(process => process.steps.flatMap(step => (step.items || []).filter(item => item.concept === conceptId).map(item => ({ process: process.id, processName: process.name, step: step.id, stepName: step.name, role: item.role }))));
}
export function validateProcesses(model) {
  if (!Array.isArray(model.processes)) return ['processes は配列にしてください'];
  const errors = [], processIds = new Set(), concepts = new Set(model.concepts.filter(Boolean).map(c => c.id));
  const validId = id => typeof id === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(id);
  for (const p of model.processes) {
    if (!p || !validId(p.id) || processIds.has(p.id)) { errors.push('業務フローのIDが無効または重複しています'); continue; }
    processIds.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim()) errors.push(`${p.id}: 業務名が必要です`);
    if (!Array.isArray(p.steps) || !Array.isArray(p.flows)) { errors.push(`${p.id}: steps と flows は配列にしてください`); continue; }
    const ids = new Set();
    for (const s of p.steps) {
      if (!s || !validId(s.id) || ids.has(s.id)) { errors.push(`${p.id}: 作業IDが無効または重複しています`); continue; }
      ids.add(s.id);
      if (typeof s.name !== 'string' || !s.name.trim() || !Object.hasOwn(stepTypes,s.type)) errors.push(`${s.id}: 名前と有効な種類が必要です`);
      for (const field of ['owner','description']) if(s[field] !== undefined && typeof s[field] !== 'string') errors.push(`${s.id}: ${field} は文字列にしてください`);
      if(s.position !== undefined && (!s.position || !Number.isFinite(s.position.x) || !Number.isFinite(s.position.y))) errors.push(`${s.id}: 配置が無効です`);
      if(s.items !== undefined && !Array.isArray(s.items)) { errors.push(`${s.id}: items は配列にしてください`); continue; }
      const seen = new Set();
      for (const item of s.items || []) {
        if (!item || !concepts.has(item.concept) || !Object.hasOwn(usageRoles,item.role)) errors.push(`${s.id}: 登場することば、または関わり方が無効です`);
        else { const key=item.concept+':'+item.role; if(seen.has(key)) errors.push(`${s.id}: 同じことばと関わり方が重複しています`); seen.add(key); }
      }
    }
    for (const f of p.flows) {
      if(!f || !ids.has(f.source) || !ids.has(f.target)) { errors.push(`${p.id}: 矢印の参照先が見つかりません`); continue; }
      if(f.label !== undefined && typeof f.label !== 'string') errors.push(`${p.id}: 矢印の説明は文字列にしてください`);
      if(p.steps.find(s=>s.id===f.source)?.type==='end') errors.push('終了から次の作業へは接続できません');
      if(p.steps.find(s=>s.id===f.target)?.type==='start') errors.push('開始へ戻る矢印は接続できません');
    }
  }
  return errors;
}

export function describeRestriction(model, r) {
  const name = id => [...model.concepts, ...model.properties].find(x => x.id === id)?.name || id;
  const start = `${name(r.property)}：`;
  const condition = r.operator === 'someValuesFrom' ? `${name(r.target)}に属する関係先が少なくとも1つある`
    : r.operator === 'allValuesFrom' ? `関係先はすべて${name(r.target)}に属する。関係先の存在は要求しない`
      : `関係先の数が${({ minCardinality: '最低', maxCardinality: '最大', cardinality: 'ちょうど' })[r.operator]}${r.count}`;
  return `${name(r.subject)}${r.mode === 'equivalent' ? 'の必要十分条件' : 'の必要条件'} — ${start}${condition}`;
}

export function exportOntology(model) {
  const errors = validateOntology(model);
  if (errors.length) throw new Error(errors.join('\n'));
  const literal = value => JSON.stringify(String(value));
  const lines = ['@prefix : <' + model.base + '> .', '@prefix owl: <http://www.w3.org/2002/07/owl#> .', '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .', '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .', '', `<${model.base}> a owl:Ontology ; rdfs:label ${literal(model.name)} .`, ''];
  for (const c of model.concepts) {
    lines.push(`:${c.id} a owl:Class ; rdfs:label ${literal(c.name)}${c.description ? ' ; rdfs:comment ' + literal(c.description) : ''} .`);
    if (c.parent) lines.push(`:${c.id} rdfs:subClassOf :${c.parent} .`);
  }
  for (const p of model.properties) lines.push(`:${p.id} a owl:ObjectProperty ; rdfs:label ${literal(p.name)} ; rdfs:domain :${p.domain} ; rdfs:range :${p.range}${p.description ? ' ; rdfs:comment ' + literal(p.description) : ''} .`);
  // Equivalent conditions for one concept form ONE conjunction, not several equivalences.
  const expression = r => `[ a owl:Restriction ; owl:onProperty :${r.property} ; owl:${r.operator} ${r.operator.endsWith('ValuesFrom') ? ':' + r.target : '"' + r.count + '"^^xsd:nonNegativeInteger'} ]`;
  for (const c of model.concepts) {
    const rows = model.restrictions.filter(r => r.subject === c.id);
    for (const r of rows.filter(r => r.mode === 'necessary')) lines.push(`:${c.id} rdfs:subClassOf ${expression(r)} .`);
    const eq = rows.filter(r => r.mode === 'equivalent');
    if (eq.length) {
      const parts = [...(c.parent ? [':' + c.parent] : []), ...eq.map(expression)];
      lines.push(`:${c.id} owl:equivalentClass ${parts.length === 1 ? parts[0] : '[ a owl:Class ; owl:intersectionOf ( ' + parts.join(' ') + ' ) ]'} .`);
    }
  }
  return lines.join('\n') + '\n';
}
