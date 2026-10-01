// Shared by Node and the reader: a semantic diff of two ontology models, keyed by stable IDs.
// Layout (position) is not a change of meaning and is ignored. Imported definitions belong to
// their own file and are skipped.
export const changeFieldLabels = {
  name: '名前', description: '説明', example: '具体例', exclusion: '含まない例', question: '確認したいこと',
  review_state: '合意状態', evidence: '根拠', cases: 'ケース', data_mapping: 'データ対応', parent: '上位概念',
  aliases: '別名', domain: '始点', range: '相手', owner: '担当', type: '種類', items: '登場することば',
  subprocess: '詳細フロー', required: '必須', values: '区分値', label: '条件', base: 'IRI', imports: '読み込む共通定義',
};
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const local = list => (Array.isArray(list) ? list : []).filter(item => item && typeof item === 'object' && !item.imported_from);

function fieldChanges(before, after, skip) {
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].filter(key => !skip.includes(key));
  return keys.filter(key => !same(before?.[key], after?.[key])).map(field => ({ field, before: before?.[field], after: after?.[field] }));
}
// Compare two lists of entities by id. `context` adds parent information to every change.
function compareById(entity, before, after, skip, context = {}, agreed = () => false) {
  const changes = [], previous = new Map(local(before).map(item => [item.id, item]));
  for (const item of local(after)) {
    const old = previous.get(item.id);
    previous.delete(item.id);
    if (!old) changes.push({ entity, change: 'added', id: item.id, name: item.name, ...context, agreed: false });
    else {
      const fields = fieldChanges(old, item, skip);
      if (fields.length) changes.push({ entity, change: 'changed', id: item.id, name: item.name, ...context, fields, agreed: agreed(old) });
    }
  }
  for (const old of previous.values()) changes.push({ entity, change: 'removed', id: old.id, name: old.name, ...context, agreed: agreed(old) });
  return changes;
}
// Lists without IDs (restrictions, flows) can only be added or removed as whole entries.
function compareEntries(entity, before, after, describe, context = {}, agreed = () => false) {
  const key = item => JSON.stringify(canonical(item));
  const old = new Set(local(before).map(key)), next = new Set(local(after).map(key));
  return [
    ...local(after).filter(item => !old.has(key(item))).map(item => ({ entity, change: 'added', id: '', name: describe(item), ...context, agreed: agreed(item) })),
    ...local(before).filter(item => !next.has(key(item))).map(item => ({ entity, change: 'removed', id: '', name: describe(item), ...context, agreed: agreed(item) })),
  ];
}

export function diffModels(before, after) {
  before = before || {}; after = after || {};
  const isAgreed = item => item?.review_state === 'agreed';
  const changes = [];
  // A file that did not exist in the baseline is one added model, not a list of new top-level fields.
  if (!before.kind && after.kind) changes.push({ entity: 'model', change: 'added', id: '', name: after.name || '', agreed: false });
  else {
    const modelFields = fieldChanges(before, after, ['concepts', 'properties', 'restrictions', 'processes', 'kind', 'imported_models']);
    if (modelFields.length) changes.push({ entity: 'model', change: 'changed', id: '', name: after.name || before.name || '', fields: modelFields, agreed: false });
  }
  changes.push(...compareById('concept', before.concepts, after.concepts, ['id', 'position', 'attributes'], {}, isAgreed));
  // Attributes are compared one by one; they inherit the agreement of their concept.
  const beforeConcepts = new Map(local(before.concepts).map(c => [c.id, c]));
  for (const concept of local(after.concepts)) {
    const old = beforeConcepts.get(concept.id);
    if (old) changes.push(...compareById('attribute', old.attributes, concept.attributes, ['id'], { concept: concept.id, conceptName: concept.name }, () => isAgreed(old)));
    else if (concept.attributes?.length) changes.push(...compareById('attribute', [], concept.attributes, ['id'], { concept: concept.id, conceptName: concept.name }));
  }
  for (const old of beforeConcepts.values()) if (!local(after.concepts).some(c => c.id === old.id) && old.attributes?.length) changes.push(...compareById('attribute', old.attributes, [], ['id'], { concept: old.id, conceptName: old.name }, () => isAgreed(old)));
  changes.push(...compareById('property', before.properties, after.properties, ['id', 'position'], {}, isAgreed));
  const names = new Map([...local(before.concepts), ...local(before.properties), ...local(after.concepts), ...local(after.properties)].map(item => [item.id, item.name]));
  const name = id => names.get(id) || id;
  const subjectAgreed = r => isAgreed(local(before.concepts).find(c => c.id === r.subject));
  changes.push(...compareEntries('restriction', before.restrictions, after.restrictions,
    r => `${name(r.subject)}：${name(r.property)} ${r.operator} ${r.target !== undefined ? name(r.target) : r.count}（${r.mode}）`, {}, subjectAgreed));
  changes.push(...compareById('process', before.processes, after.processes, ['id', 'steps', 'flows']));
  const beforeProcesses = new Map(local(before.processes).map(p => [p.id, p]));
  for (const p of local(after.processes)) {
    const old = beforeProcesses.get(p.id) || { steps: [], flows: [] };
    const context = { process: p.id, processName: p.name };
    changes.push(...compareById('step', old.steps, p.steps, ['id', 'position'], context));
    const stepName = id => [...(p.steps || []), ...(old.steps || [])].find(s => s?.id === id)?.name || id;
    changes.push(...compareEntries('flow', old.flows, p.flows, f => `${stepName(f.source)} → ${stepName(f.target)}${f.label ? `（${f.label}）` : ''}`, context));
  }
  return changes;
}

const entityLabels = { model: 'モデル', concept: 'ことば', attribute: '属性', property: 'つながり', restriction: '分類条件', process: '業務フロー', step: '作業', flow: '流れ' };
const changeLabels = { added: '追加', removed: '削除', changed: '変更' };
export function describeChange(change) {
  const owner = change.entity === 'attribute' ? `${change.conceptName} › ` : ['step', 'flow'].includes(change.entity) ? `${change.processName} › ` : '';
  return `${changeLabels[change.change]}・${entityLabels[change.entity]}：${owner}${change.name}${change.id ? ` (${change.id})` : ''}`;
}
export function changesMarkdown(changes, { base = '' } = {}) {
  if (!changes.length) return `変更はありません${base ? `（比較元: ${base}）` : ''}。\n`;
  const show = value => value === undefined ? '（なし）' : typeof value === 'string' ? value : Array.isArray(value) && value.every(v => typeof v === 'string') ? value.join('、') : JSON.stringify(value);
  const lines = [`# 変更点${base ? `（比較元: ${base}）` : ''}`, ''];
  const agreed = changes.filter(c => c.agreed);
  if (agreed.length) lines.push(`> 合意済みの定義に関わる変更が ${agreed.length} 件あります。業務担当者と確認してください。`, '');
  for (const change of changes) {
    lines.push(`- ${change.agreed ? '**［合意済み］** ' : ''}${describeChange(change)}`);
    for (const f of change.fields || []) lines.push(`  - ${changeFieldLabels[f.field] || f.field}: ${show(f.before)} → ${show(f.after)}`);
  }
  return lines.join('\n') + '\n';
}
