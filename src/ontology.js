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
  // Relative paths only, so a model cannot pull in files from arbitrary places on the machine.
  if (model.imports !== undefined && (!Array.isArray(model.imports) || model.imports.some(p => typeof p !== 'string' || !p.trim() || /^([\\/]|[A-Za-z]:)/.test(p)))) errors.push('imports は共通定義YAMLへの相対パスの配列にしてください');
  const collections = ['concepts', 'properties', 'restrictions'];
  for (const key of collections) if (!Array.isArray(model[key])) errors.push(`${key} は配列にしてください`);
  if (errors.length) return errors;
  const ids = new Set();
  for (const item of [...model.concepts, ...model.properties]) {
    if (!item || typeof item !== 'object') { errors.push('概念・関係はオブジェクトで指定してください'); continue; }
    if(item.cases!==undefined){
      if(!Array.isArray(item.cases))errors.push(`${item.id}.cases: 配列にしてください`);
      else item.cases.forEach((c,i)=>{if(!c||typeof c.description!=='string'||!c.description.trim()||!['included','excluded','unresolved'].includes(c.result)||(c.reason!==undefined&&typeof c.reason!=='string'))errors.push(`${item.id}.cases[${i}]: description、result（included/excluded/unresolved）、任意のreasonが必要です`)});
    }
    for (const field of ['exclusion', 'evidence']) {
      if (item[field] !== undefined && typeof item[field] !== 'string') errors.push(`${item.id}.${field}: 文字列にしてください`);
    }
    if (item.data_mapping !== undefined) errors.push(...validateMapping(item.id, item.data_mapping));
    if (item.aliases !== undefined && (!Array.isArray(item.aliases) || item.aliases.some(a => typeof a !== 'string' || !a.trim()) || new Set(item.aliases).size !== item.aliases.length)) errors.push(`${item.id}.aliases: 重複のない空でない文字列の配列にしてください`);
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
    if (c.attributes !== undefined) errors.push(...validateAttributes(c));
  }
  for (const p of model.properties.filter(Boolean)) {
    if (p.attributes !== undefined) errors.push(`${p.id}: 属性は概念に指定してください`);
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

function validateMapping(owner, mapping) {
  const errors = [];
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) return [`${owner}.data_mapping: オブジェクトにしてください`];
  for (const field of ['source', 'grain', 'condition', 'gap']) {
    if (mapping[field] !== undefined && typeof mapping[field] !== 'string') errors.push(`${owner}.data_mapping.${field}: 文字列にしてください`);
  }
  if (typeof mapping.source !== 'string' || !mapping.source.trim()) errors.push(`${owner}.data_mapping.source: データの所在が必要です`);
  if (!['proposed', 'verified'].includes(mapping.status)) errors.push(`${owner}.data_mapping.status: proposed または verified にしてください`);
  return errors;
}
// Data items carried by a concept (OWL datatype properties). The type is the business-level kind of value.
export const attributeTypes = { text: '文字列', integer: '整数', decimal: '数値', amount: '金額', boolean: 'はい／いいえ', date: '日付', datetime: '日時', code: '区分値', identifier: '識別子' };
function validateAttributes(concept) {
  if (!Array.isArray(concept.attributes)) return [`${concept.id}.attributes: 配列にしてください`];
  const errors = [], ids = new Set();
  for (const a of concept.attributes) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) { errors.push(`${concept.id}.attributes: 属性はオブジェクトで指定してください`); continue; }
    const at = `${concept.id}.${a.id}`;
    if (typeof a.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(a.id)) errors.push(`${concept.id}: 無効な属性ID: ${a.id}`);
    else if (ids.has(a.id)) errors.push(`${concept.id}: 重複した属性ID: ${a.id}`);
    ids.add(a.id);
    if (typeof a.name !== 'string' || !a.name.trim()) errors.push(`${at}: 名前が必要です`);
    if (a.type !== undefined && !Object.hasOwn(attributeTypes, a.type)) errors.push(`${at}: type は ${Object.keys(attributeTypes).join(' / ')} のいずれかにしてください`);
    for (const field of ['description', 'example', 'question']) if (a[field] !== undefined && typeof a[field] !== 'string') errors.push(`${at}.${field}: 文字列にしてください`);
    if (a.required !== undefined && typeof a.required !== 'boolean') errors.push(`${at}.required: true または false にしてください`);
    if (a.values !== undefined) {
      if (a.type !== 'code') errors.push(`${at}.values: 区分値は type: code の属性に指定してください`);
      if (!Array.isArray(a.values) || a.values.some(v => !v || typeof v.value !== 'string' || !v.value.trim() || ['name', 'description'].some(k => v[k] !== undefined && typeof v[k] !== 'string'))) errors.push(`${at}.values: [{value, name?, description?}] の配列にしてください`);
      else if (new Set(a.values.map(v => v.value)).size !== a.values.length) errors.push(`${at}.values: value が重複しています`);
    }
    if (a.data_mapping !== undefined) errors.push(...validateMapping(at, a.data_mapping));
  }
  return errors;
}
// Own attributes first, then those inherited from ancestors (nearest first). Cycles are reported elsewhere.
export function conceptAttributes(model, conceptId) {
  const result = [], seen = new Set();
  for (let c = model.concepts.find(x => x.id === conceptId), inherited = false; c && !seen.has(c.id); c = model.concepts.find(x => x.id === c.parent), inherited = true) {
    seen.add(c.id);
    for (const attribute of c.attributes || []) result.push({ attribute, owner: c.id, ownerName: c.name, inherited });
  }
  return result;
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
      for (const field of ['owner','description','example','question']) if(s[field] !== undefined && typeof s[field] !== 'string') errors.push(`${s.id}: ${field} は文字列にしてください`);
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
  const byId = new Map(model.processes.filter(Boolean).map(p => [p.id, p]));
  const parents = new Set();
  for (const p of byId.values()) for (const s of Array.isArray(p.steps) ? p.steps : []) {
    if (!s || s.subprocess === undefined) continue;
    if (typeof s.subprocess !== 'string' || !byId.has(s.subprocess)) errors.push(`${p.id}/${s.id}: 詳細フローの参照先が見つかりません`);
    if (s.type !== 'task') errors.push(`${p.id}/${s.id}: 詳細フローは作業に指定してください`);
    if (parents.has(s.subprocess)) errors.push(`${s.subprocess}: 詳細フローの親は一つにしてください`);
    parents.add(s.subprocess);
  }
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) { errors.push(`${id}: 詳細フローの階層が循環しています`); return; }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    for (const s of Array.isArray(byId.get(id).steps) ? byId.get(id).steps : []) if (s?.subprocess) visit(s.subprocess);
    visiting.delete(id); visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
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
  const lines = ['@prefix : <' + model.base + '> .', '@prefix owl: <http://www.w3.org/2002/07/owl#> .', '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .', '@prefix skos: <http://www.w3.org/2004/02/skos/core#> .', '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .', '', `<${model.base}> a owl:Ontology ; rdfs:label ${literal(model.name)} .`, ''];
  // Imported definitions are declared by the file that owns them; reference it with owl:imports.
  for (const imported of model.imported_models || []) if (imported.base) lines.push(`<${model.base}> owl:imports <${imported.base}> .`);
  if (model.imported_models?.length) lines.push('');
  const own = item => !item.imported_from;
  // An imported term lives under the base IRI of the file that declares it.
  const bases = new Map((model.imported_models || []).map(m => [m.path, m.base]));
  const owners = new Map([...model.concepts, ...model.properties].filter(x => x.imported_from).map(x => [x.id, bases.get(x.imported_from)]));
  const ref = id => owners.get(id) ? `<${owners.get(id)}${id}>` : `:${id}`;
  const aliases = item => (item.aliases || []).map(a => ' ; skos:altLabel ' + literal(a)).join('');
  const xsd = { integer: 'integer', decimal: 'decimal', amount: 'decimal', boolean: 'boolean', date: 'date', datetime: 'dateTime' };
  for (const c of model.concepts.filter(own)) {
    lines.push(`:${c.id} a owl:Class ; rdfs:label ${literal(c.name)}${aliases(c)}${c.description ? ' ; rdfs:comment ' + literal(c.description) : ''} .`);
    if (c.parent) lines.push(`:${c.id} rdfs:subClassOf ${ref(c.parent)} .`);
    // Attribute IDs are unique per concept only, so their IRIs are scoped by the concept.
    for (const a of c.attributes || []) lines.push(`<${model.base}${c.id}.${a.id}> a owl:DatatypeProperty ; rdfs:label ${literal(a.name)} ; rdfs:domain :${c.id} ; rdfs:range xsd:${xsd[a.type] || 'string'}${a.description ? ' ; rdfs:comment ' + literal(a.description) : ''} .`);
  }
  for (const p of model.properties.filter(own)) lines.push(`:${p.id} a owl:ObjectProperty ; rdfs:label ${literal(p.name)}${aliases(p)} ; rdfs:domain ${ref(p.domain)} ; rdfs:range ${ref(p.range)}${p.description ? ' ; rdfs:comment ' + literal(p.description) : ''} .`);
  // Equivalent conditions for one concept form ONE conjunction, not several equivalences.
  const expression = r => `[ a owl:Restriction ; owl:onProperty ${ref(r.property)} ; owl:${r.operator} ${r.operator.endsWith('ValuesFrom') ? ref(r.target) : '"' + r.count + '"^^xsd:nonNegativeInteger'} ]`;
  for (const c of model.concepts.filter(own)) {
    const rows = model.restrictions.filter(r => r.subject === c.id && own(r));
    for (const r of rows.filter(r => r.mode === 'necessary')) lines.push(`:${c.id} rdfs:subClassOf ${expression(r)} .`);
    const eq = rows.filter(r => r.mode === 'equivalent');
    if (eq.length) {
      const parts = [...(c.parent ? [ref(c.parent)] : []), ...eq.map(expression)];
      lines.push(`:${c.id} owl:equivalentClass ${parts.length === 1 ? parts[0] : '[ a owl:Class ; owl:intersectionOf ( ' + parts.join(' ') + ' ) ]'} .`);
    }
  }
  return lines.join('\n') + '\n';
}
