// Shared, deterministic checks of recorded information; not an OWL reasoner.
export function assessCompletion(model) {
  const issues = [];
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const add = (category, message, target) => issues.push({ category, message, ...target });
  const entries = [...model.concepts.map(item => ({ item, kind: 'concept' })), ...model.properties.map(item => ({ item, kind: 'property' }))];
  if (!model.concepts.length) add('不足', '対象とする業務の概念を登録してください。');
  for (const { item, kind } of entries) {
    const target = { kind, id: item.id, name: item.name };
    if (text(item.question)) add('未決定', item.question, target);
    for (const c of item.cases || []) if (c.result === 'unresolved') add('未決定', `判定が未決定：${c.description}`, target);
    if (!text(item.description)) add('不足', '意味の説明を記録してください。', target);
    if (!text(item.example) && !(item.cases || []).some(c => c.result === 'included')) add('不足', '含む具体例を記録してください。', target);
    if (!text(item.exclusion) && !(item.cases || []).some(c => c.result === 'excluded')) add('不足', '含まない具体例を記録してください。', target);
    if (!text(item.evidence)) add('不足', '定義の根拠・合意の記録を残してください。', target);
    if (item.review_state !== 'agreed') add('未合意', '業務担当者と定義を確認し、合意状態を記録してください。', target);
    const mapping = item.data_mapping;
    if (mapping) {
      if (text(mapping.gap)) add('データ対応', mapping.gap, target);
      if (mapping.status !== 'verified') add('データ対応', 'データとの対応が未確認です。', target);
      for (const [key, label] of [['grain', '1件が表すもの'], ['condition', '判定条件']]) if (!text(mapping[key])) add('データ対応', `${label}を記録してください。`, target);
    }
  }
  // Report cycles and direct count contradictions without claiming full reasoning.
  for (const c of model.concepts) {
    const seen = new Set([c.id]);
    let parent = c.parent;
    while (parent) {
      if (seen.has(parent)) { add('不整合', '上位概念の参照が循環しています。', { kind: 'concept', id: c.id, name: c.name }); break; }
      seen.add(parent);
      parent = model.concepts.find(item => item.id === parent)?.parent;
    }
    for (const p of model.properties) {
      const rules = model.restrictions.filter(r => r.subject === c.id && r.property === p.id);
      const lower = Math.max(0, ...rules.map(r => r.operator === 'someValuesFrom' ? 1 : ['minCardinality', 'cardinality'].includes(r.operator) ? r.count : 0));
      const upper = Math.min(Infinity, ...rules.filter(r => ['maxCardinality', 'cardinality'].includes(r.operator)).map(r => r.count));
      if (lower > upper) add('不整合', `「${p.name}」の個数条件を同時に満たせません。`, { kind: 'concept', id: c.id, name: c.name });
    }
  }
  const ready = entries.filter(({ item, kind }) => !issues.some(issue => issue.kind === kind && issue.id === item.id)).length;
  return { issues, ready, total: entries.length };
}
