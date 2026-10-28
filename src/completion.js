// Shared, deterministic checks of recorded information; not an OWL reasoner.
// `message` tells the modeler what to record; `ask` (when set) is the same item as a question
// for business users, shown in the viewer above the task.
export function assessCompletion(model) {
  const issues = [];
  const text = value => typeof value === 'string' && value.trim().length > 0;
  const add = (category, message, target, ask) => {
    const issue = { category, message, ...(ask ? { ask } : {}), ...target };
    issues.push({ key: completionIssueKey(issue), ...issue });
  };
  // Imported definitions are reviewed in the model that owns them.
  const local = item => !item.imported_from;
  // A deprecated term is no longer reviewed; what still uses it is reported instead.
  const current = item => !item.deprecated;
  const entries = [...model.concepts.filter(local).filter(current).map(item => ({ item, kind: 'concept' })), ...model.properties.filter(local).filter(current).map(item => ({ item, kind: 'property' }))];
  if (!model.concepts.length) add('不足', '対象とする業務の概念を登録してください。', undefined, 'この業務では、どんな「もの」や「こと」を扱いますか？');
  // `definition` is the temporal meaning of what the data stands for: a definition judged at a
  // past moment needs data that keeps past states.
  const mappingIssues = (mapping, target, prefix = '', definition) => {
    if (text(mapping.gap)) add('データ対応', prefix + mapping.gap, target);
    if (mapping.status === 'rejected') add('データ対応', prefix + '確認の結果、この対応は誤りと分かっています。正しい所在を記録するか、対応を外してください。', target);
    else if (mapping.status !== 'verified') add('データ対応', prefix + 'データとの対応が未確認です。', target);
    for (const [key, label] of [['grain', '1件が表すもの'], ['condition', '判定条件']]) if (!text(mapping[key])) add('データ対応', prefix + `${label}を記録してください。`, target);
    if (definition?.basis && definition.basis !== 'current' && !mapping.history) add('データ対応', prefix + '基準日時点で判定する定義です。データが過去の状態を保持しているか（history）を記録してください。', target);
  };
  // Time in a business definition (concepts and metrics). Asked only once temporal is recorded,
  // so models that never describe time get no new questions.
  const temporalIssues = (temporal, target, subject) => {
    if (text(temporal.question)) add('未決定', temporal.question, target);
    if (!temporal.basis) add('不足', '判定の時点（temporal.basis: current / as_of / period）を記録してください。', target, `${subject}は、いつの時点の状態で判断しますか？（現在か、指定した基準日時点か、期間中か）`);
    if (((temporal.basis && temporal.basis !== 'current') || temporal.period) && !text(temporal.timezone)) add('不足', 'タイムゾーン（temporal.timezone）を記録してください。', target, '日付や月末の区切りは、どの地域の時刻で考えますか？');
    const period = temporal.period;
    if (period?.start !== undefined && period.start_inclusive === undefined) add('不足', '有効期間の開始時点を含むか（temporal.period.start_inclusive）を記録してください。', target, '開始日時ちょうどの時点では、もう有効ですか？');
    if (period?.end !== undefined && period.end_inclusive === undefined) add('不足', '有効期間の終了時点を含むか（temporal.period.end_inclusive）を記録してください。', target, '終了日時ちょうどの時点では、まだ有効ですか？');
  };
  const agreementIssues = (item, target, ask) => {
    if (item.review_state !== 'agreed') add('未合意', '業務担当者と定義を確認し、合意状態を記録してください。', target, ask);
    else if (!text(item.agreed_by) || !item.agreed_at) add('不足', '誰がいつ合意したか（agreed_by・agreed_at）を記録してください。', target, 'この定義は、どなたがいつ確認しましたか？');
  };
  for (const { item, kind } of entries) {
    const target = { kind, id: item.id, name: item.name };
    if (text(item.question)) add('未決定', item.question, target);
    for (const c of item.cases || []) if (c.result === 'unresolved') add('未決定', `判定が未決定：${c.description}`, target, `「${c.description}」は含みますか、含みませんか？`);
    if (!text(item.description)) add('不足', '意味の説明を記録してください。', target, 'これは、どういう意味ですか？');
    if (!text(item.example) && !(item.cases || []).some(c => c.result === 'included')) add('不足', '含む具体例を記録してください。', target, '具体的には、どんなものが含まれますか？');
    if (!text(item.exclusion) && !(item.cases || []).some(c => c.result === 'excluded')) add('不足', '含まない具体例を記録してください。', target, '似ているけれど含まれないものはありますか？');
    if (!text(item.evidence)) add('不足', '定義の根拠・合意の記録を残してください。', target, 'この定義は、どの資料や打ち合わせで決まったものですか？');
    agreementIssues(item, target, 'この定義で合っていますか？');
    if (item.temporal) temporalIssues(item.temporal, target, `「${item.name}」に当たるかどうか`);
    if (item.data_mapping) mappingIssues(item.data_mapping, target, '', item.temporal);
    for (const a of item.attributes || []) {
      const prefix = `属性「${a.name}」：`;
      if (text(a.question)) add('未決定', prefix + a.question, target);
      if (!text(a.description)) add('不足', prefix + '意味の説明を記録してください。', target, prefix + 'どういう値ですか？');
      if (!a.type) add('不足', prefix + '値の種類（type）を記録してください。', target, prefix + '日付・金額・区分など、どんな種類の値ですか？');
      if (a.type === 'code' && !a.values?.length) add('不足', prefix + '取りうる区分値を記録してください。', target, prefix + 'どんな区分がありますか？');
      if (a.data_mapping) mappingIssues(a.data_mapping, target, prefix);
    }
  }
  const metrics = (model.metrics || []).filter(current);
  for (const m of metrics) metricIssues(m);
  function metricIssues(m) {
    const target = { kind: 'metric', id: m.id, name: m.name };
    if (text(m.question)) add('未決定', m.question, target);
    if (!text(m.description)) add('不足', '指標の意味を記録してください。', target, 'この指標は、何を表す数ですか？');
    if (!m.concept) add('不足', '集計の対象となる概念（concept）を記録してください。', target, 'この指標は、何を数える（集計する）ものですか？');
    if (!m.aggregation && !text(m.formula)) add('不足', '集計方法（aggregation）か計算式（formula）を記録してください。', target, 'どのように数えますか？（件数、重複を除いた件数、合計など）');
    if (['count_distinct', 'sum', 'average', 'min', 'max'].includes(m.aggregation) && !m.attribute) add('不足', '集計対象の属性・識別子（attribute）を記録してください。', target, m.aggregation === 'count_distinct' ? '同じものを二度数えないために、何で同じものと判断しますか？' : 'どの値を集計しますか？');
    if (!m.temporal) add('不足', '基準日や対象期間の意味（temporal.basis）を記録してください。', target, 'これは、ある日時点の数ですか、ある期間中の数ですか？');
    else temporalIssues(m.temporal, target, `「${m.name}」`);
    for (const d of m.dimensions || []) if (d.additive === undefined) add('不足', `軸「${d.name}」：足し合わせられるか（additive）を記録してください。`, target, `「${d.name}」ごとの値を足し合わせると、全体の値になりますか？`);
    for (const c of m.cases || []) if (!text(c.expected)) add('未決定', `数え方が未決定：${c.description}`, target, `「${c.description}」のとき、どう数えますか？`);
    if (!text(m.evidence)) add('不足', '定義の根拠・合意の記録を残してください。', target, 'この指標の定義は、どの資料や打ち合わせで決まったものですか？');
    agreementIssues(m, target, 'この指標の定義で合っていますか？');
  }
  // The same word must not point at two different definitions.
  const labels = new Map();
  for (const item of [...model.concepts, ...model.properties, ...metrics].filter(current)) for (const label of [item.name, ...(item.aliases || [])]) {
    const key = String(label).trim().toLowerCase();
    if (!labels.has(key)) labels.set(key, new Set());
    labels.get(key).add(item);
  }
  for (const { item, kind } of [...entries, ...metrics.map(item => ({ item, kind: 'metric' }))]) for (const alias of item.aliases || []) {
    const others = [...labels.get(alias.trim().toLowerCase())].filter(other => other !== item);
    if (others.length) add('不整合', `別名「${alias}」が「${others.map(o => o.name).join('」「')}」の名前・別名と重なっています。`, { kind, id: item.id, name: item.name }, `「${alias}」は、「${[item, ...others].map(o => o.name).join('」「')}」のどれを指しますか？`);
  }
  // Report cycles and direct count contradictions without claiming full reasoning.
  for (const c of model.concepts.filter(local)) {
    const seen = new Set([c.id]);
    let parent = c.parent;
    while (parent) {
      if (seen.has(parent)) { add('不整合', '上位概念の参照が循環しています。', { kind: 'concept', id: c.id, name: c.name }, '「何の一種か」をたどると元に戻ってしまいます。どれが上位の分類ですか？'); break; }
      seen.add(parent);
      parent = model.concepts.find(item => item.id === parent)?.parent;
    }
    for (const p of model.properties) {
      const rules = model.restrictions.filter(r => r.subject === c.id && r.property === p.id);
      const lower = Math.max(0, ...rules.map(r => r.operator === 'someValuesFrom' ? 1 : ['minCardinality', 'cardinality'].includes(r.operator) ? r.count : 0));
      const upper = Math.min(Infinity, ...rules.filter(r => ['maxCardinality', 'cardinality'].includes(r.operator)).map(r => r.count));
      if (lower > upper) add('不整合', `「${p.name}」の個数条件を同時に満たせません。`, { kind: 'concept', id: c.id, name: c.name }, `「${p.name}」の相手は、いくつありえますか？`);
    }
  }
  // Definitions and work that still point at a deprecated term.
  const byId = new Map([...model.concepts, ...model.properties].map(item => [item.id, item]));
  const retired = id => byId.get(id)?.deprecated ? byId.get(id) : null;
  const stillUsed = (old, target) => {
    const next = old.replaced_by && byId.get(old.replaced_by);
    add('不整合', `廃止したことば「${old.name}」を使っています。${next ? `「${next.name}」に置き換えてください。` : '置き換え先を確認してください。'}`, target,
      next ? `ここで扱うのは「${next.name}」ですか？（「${old.name}」は廃止されました）` : `「${old.name}」は廃止されました。ここでは代わりに何を扱いますか？`);
  };
  for (const { item, kind } of entries) {
    const target = { kind, id: item.id, name: item.name };
    for (const id of kind === 'concept' ? [item.parent] : [item.domain, item.range]) if (retired(id)) stillUsed(retired(id), target);
  }
  for (const m of metrics) if (retired(m.concept)) stillUsed(retired(m.concept), { kind: 'metric', id: m.id, name: m.name });
  for (const p of model.processes || []) for (const s of p.steps || []) for (const use of s.items || []) {
    if (retired(use.concept)) stillUsed(retired(use.concept), { kind: 'step', process: p.id, processName: p.name, id: s.id, name: s.name });
  }
  for (const p of model.processes || []) assessProcess(p, add, text);
  const reviewed = [...entries, ...metrics.map(item => ({ item, kind: 'metric' }))];
  const ready = reviewed.filter(({ item, kind }) => !issues.some(issue => issue.kind === kind && issue.id === item.id)).length;
  return { issues, ready, total: reviewed.length };
}

// Stable key of an open item, shared by the viewer's answer form and `strscape answers`. It
// covers the question text, so an answer never carries over to a reworded question.
export function completionIssueKey(issue) {
  const text = [issue.category, issue.kind || '', issue.process || '', issue.id || '', issue.ask || issue.message].join('\u0000');
  let hash = 0x811c9dc5;
  for (const char of text) hash = Math.imul(hash ^ char.codePointAt(0), 0x01000193) >>> 0;
  return 'q' + hash.toString(16).padStart(8, '0');
}

// Structural checks of a recorded flow. Reachability and dead ends are checked only when the
// flow declares a start or end, because an informal sketch of steps has no defined boundary.
function assessProcess(p, add, text) {
  const processTarget = { kind: 'process', id: p.id, name: p.name };
  if (!p.steps.length) { add('不足', '作業を記録してください。', processTarget, 'この業務は、どんな作業で進みますか？'); return; }
  const outgoing = id => p.flows.filter(f => f.source === id), incoming = id => p.flows.filter(f => f.target === id);
  const strict = p.steps.some(s => s.type === 'start' || s.type === 'end');
  const reached = new Set();
  const queue = p.steps.filter(s => s.type === 'start').map(s => s.id);
  while (queue.length) { const id = queue.shift(); if (reached.has(id)) continue; reached.add(id); queue.push(...outgoing(id).map(f => f.target)); }
  for (const s of p.steps) {
    const target = { kind: 'step', process: p.id, processName: p.name, id: s.id, name: s.name };
    if (text(s.question)) add('未決定', s.question, target);
    if (s.type === 'task' && !s.subprocess && !text(s.owner)) add('不足', '担当（owner）を記録してください。', target, 'この作業は、誰が担当しますか？');
    if (s.type === 'decision') {
      if (outgoing(s.id).length < 2) add('フロー', '分岐の行き先が2つ以上ありません。', target, '判断の結果、どんな行き先がありますか？');
      if (outgoing(s.id).some(f => !text(f.label))) add('フロー', '分岐の矢印に進む条件（label）を記録してください。', target, 'どんな条件で、どちらへ進みますか？');
    }
    if (s.type === 'parallel' && outgoing(s.id).length < 2) add('フロー', '並行開始の行き先が2つ以上ありません。', target, 'ここから同時に進める作業は何ですか？');
    if (s.type === 'join' && incoming(s.id).length < 2) add('フロー', '合流する流れが2つ以上ありません。', target, 'ここで、どの作業が終わるのを待ちますか？');
    if (strict && s.type !== 'start' && !reached.has(s.id)) add('フロー', '開始からたどり着けません。', target, 'この作業は、どの作業の後に行いますか？');
    if (strict && s.type !== 'end' && !outgoing(s.id).length) add('フロー', '次へ進む流れがなく、終了につながっていません。', target, 'この作業の後は、どうなりますか？');
  }
  if (strict && !p.steps.some(s => s.type === 'start')) add('フロー', '開始を記録してください。', processTarget, 'この業務は、何をきっかけに始まりますか？');
  if (strict && !p.steps.some(s => s.type === 'end')) add('フロー', '終了を記録してください。', processTarget, 'この業務は、どうなったら完了ですか？');
  if (p.steps.some(s => s.type === 'parallel') !== p.steps.some(s => s.type === 'join')) add('フロー', '並行開始と合流の対応を確認してください。', processTarget, '同時に進めた作業は、どこで合流しますか？');
}
