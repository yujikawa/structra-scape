// Shared by Node and the reader: a semantic diff of two ontology models, keyed by stable IDs.
// Layout (position) is not a change of meaning and is ignored. Imported definitions belong to
// their own file and are skipped.
export const changeFieldLabels = {
  name: '名前', description: '説明', example: '具体例', exclusion: '含まない例', question: '確認したいこと',
  review_state: '合意状態', evidence: '根拠', cases: 'ケース', judgments: '判定', data_mapping: 'データ対応', parent: '上位概念',
  aliases: '別名', domain: '始点', range: '相手', owner: '担当', type: '種類', items: '登場することば',
  purpose: '目的', subprocess: '詳細フロー', required: '必須', values: '区分値', label: '条件', base: 'IRI', imports: '読み込む共通定義',
  agreed_by: '合意した人', agreed_at: '合意した日', deprecated: '廃止', replaced_by: '置き換え先',
  temporal: '時間の意味', effective_from: '適用開始日', effective_to: '適用終了日', concept: '対象の概念',
  aggregation: '集計方法', attribute: '集計対象', formula: '計算式', condition: '条件', unit: '単位',
  dimensions: '集計の軸', metrics: '指標', places: '作業場所', place: '作業場所', timing: 'いつ行うか', status: '確認状態', history: '過去の状態の保持', gap: '業務定義との差',
};
// Recording who agreed and when, where nothing was recorded, does not change an agreed definition.
const recordsAgreement = f => ['agreed_by', 'agreed_at'].includes(f.field) && f.before === undefined;
// Recording how people judged a case is evidence for the definition, not a change to it.
const withoutJudgments = cases => Array.isArray(cases) ? cases.map(c => { if (!c || typeof c !== 'object') return c; const { judgments, ...rest } = c; return rest; }) : cases;
const recordsJudgments = f => f.field === 'cases' && same(withoutJudgments(f.before), withoutJudgments(f.after));
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
      if (fields.length) changes.push({ entity, change: 'changed', id: item.id, name: item.name, ...context, fields, agreed: agreed(old) && !fields.every(f => recordsAgreement(f) || recordsJudgments(f)) });
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
    const modelFields = fieldChanges(before, after, ['concepts', 'properties', 'restrictions', 'processes', 'metrics', 'places', 'kind', 'imported_models']);
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
  // Metrics carry their own agreement, like concepts.
  changes.push(...compareById('metric', before.metrics, after.metrics, ['id'], {}, isAgreed));
  changes.push(...compareById('place', before.places, after.places, ['id']));
  const names = new Map([...local(before.concepts), ...local(before.properties), ...local(after.concepts), ...local(after.properties)].map(item => [item.id, item.name]));
  const name = id => names.get(id) || id;
  const subjectAgreed = r => isAgreed(local(before.concepts).find(c => c.id === r.subject));
  // Same wording as the reader's rule descriptions, so a change reads like the rule itself.
  const rule = r => `${name(r.subject)}：${r.operator === 'someValuesFrom' ? `「${name(r.property)}」でつながる「${name(r.target)}」が少なくとも1つ`
    : r.operator === 'allValuesFrom' ? `「${name(r.property)}」の相手はすべて「${name(r.target)}」`
      : `「${name(r.property)}」の相手は${({ minCardinality: '最低', maxCardinality: '最大', cardinality: 'ちょうど' })[r.operator] || r.operator}${r.count}`}（${r.mode === 'equivalent' ? '呼び分ける条件' : '必ず満たす'}）`;
  changes.push(...compareEntries('restriction', before.restrictions, after.restrictions, rule, {}, subjectAgreed));
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

const entityLabels = { model: 'モデル', concept: 'ことば', attribute: '属性', property: 'つながり', restriction: '分類条件', process: '業務フロー', step: '作業', flow: '流れ', metric: '指標', place: '作業場所' };
const changeLabels = { added: '追加', removed: '削除', changed: '変更' };
export function describeChange(change) {
  const owner = change.entity === 'attribute' ? `${change.conceptName} › ` : ['step', 'flow'].includes(change.entity) ? `${change.processName} › ` : '';
  return `${changeLabels[change.change]}・${entityLabels[change.entity]}：${owner}${change.name}${change.id ? ` (${change.id})` : ''}`;
}
// One bullet per change, with its changed fields indented below.
function changeLines(changes) {
  const show = value => value === undefined ? '（なし）' : typeof value === 'string' ? value : Array.isArray(value) && value.every(v => typeof v === 'string') ? value.join('、') : JSON.stringify(value);
  return changes.flatMap(change => [`- ${change.agreed ? '**［合意済み］** ' : ''}${describeChange(change)}`, ...(change.fields || []).map(f => `  - ${changeFieldLabels[f.field] || f.field}: ${show(f.before)} → ${show(f.after)}`)]);
}
// `sections` is [{file, changes}]: a folder is written as one section per file that changed.
function changesDocument(sections, base) {
  const all = sections.flatMap(s => s.changes);
  if (!all.length) return `変更はありません${base ? `（比較元: ${base}）` : ''}。\n`;
  const lines = [`# 変更点${base ? `（比較元: ${base}）` : ''}`, ''];
  const agreed = all.filter(c => c.agreed);
  if (agreed.length) lines.push(`> 合意済みの定義に関わる変更が ${agreed.length} 件あります。業務担当者と確認してください。`, '');
  for (const section of sections.filter(s => s.changes.length)) {
    if (section.file) lines.push(`## ${section.file}`, '');
    lines.push(...changeLines(section.changes), '');
  }
  return lines.join('\n').replace(/\n+$/, '') + '\n';
}
export function changesMarkdown(changes, { base = '' } = {}) {
  return changesDocument([{ changes }], base);
}
export function changesByFileMarkdown(results, { base = '' } = {}) {
  return changesDocument(results, base);
}
