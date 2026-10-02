// What connects the domain files of one workspace (the models built together from a folder).
// Shared by the viewer's 全体マップ and `strscape overview`. Everything is derived from the
// models as recorded; nothing here is a new kind of model data.
// `entries` are [{file, name, slug?, model}], with each model's imports resolved. A concept is
// identified by the file that owns it (imported_from, or the entry's own file) and its ID.
export function workspaceOverview(entries) {
  const domains = new Map(), concepts = new Map(), links = new Map(), questions = [];
  const processes = [], relations = new Map();
  const roleOrder = ['creates', 'updates', 'reads', 'participates'];
  for (const entry of entries) {
    const model = entry.model;
    domains.set(entry.file, { file: entry.file, name: entry.name || model.name || entry.file, slug: entry.slug, local: true, concepts: 0, processes: (model.processes || []).length });
  }
  // Shared files outside the workspace still appear, as domains that cannot be opened.
  for (const entry of entries) for (const imported of entry.model.imported_models || []) {
    if (!domains.has(imported.path)) domains.set(imported.path, { file: imported.path, name: imported.name || imported.path, local: false, concepts: 0, processes: 0 });
  }
  const ownerOf = (entry, item) => item.imported_from || entry.file;
  const conceptIn = (entry, id) => {
    const item = entry.model.concepts.find(c => c.id === id);
    if (!item) return null;
    const key = `${ownerOf(entry, item)}#${item.id}`;
    if (!concepts.has(key)) {
      concepts.set(key, { key, id: item.id, name: item.name, owner: ownerOf(entry, item), aliases: item.aliases || [], usages: [] });
      domains.get(ownerOf(entry, item)).concepts++;
    }
    return concepts.get(key);
  };
  const link = (from, to) => {
    const key = `${from}\u0000${to}`;
    if (!links.has(key)) links.set(key, { from, to, imports: false, handoffs: [], uses: [] });
    return links.get(key);
  };
  for (const entry of entries) {
    const model = entry.model;
    model.concepts.forEach(c => conceptIn(entry, c.id));
    for (const path of model.imports || []) {
      const target = (model.imported_models || []).find(m => m.path === path)?.path || path;
      if (domains.has(target)) link(entry.file, target).imports = true;
    }
    // Every relationship and subtype, once, for the diagram.
    for (const p of model.properties) {
      const from = conceptIn(entry, p.domain), to = conceptIn(entry, p.range), owner = ownerOf(entry, p);
      if (from && to) relations.set(`property:${owner}#${p.id}`, { kind: 'property', id: p.id, name: p.name, owner, from: from.key, to: to.key });
    }
    for (const c of model.concepts.filter(c => c.parent)) {
      const child = conceptIn(entry, c.id), parent = conceptIn(entry, c.parent);
      if (child && parent) relations.set(`parent:${child.key}`, { kind: 'parent', owner: child.owner, from: child.key, to: parent.key });
    }
    for (const process of model.processes || []) processes.push({ key: `${entry.file}#${process.id}`, id: process.id, name: process.name, domain: entry.file });
    // Definitions owned here that point at terms another domain owns.
    for (const p of model.properties.filter(p => !p.imported_from)) {
      for (const end of [p.domain, p.range]) {
        const c = conceptIn(entry, end);
        if (c && c.owner !== entry.file && !link(entry.file, c.owner).uses.some(u => u.kind === 'property' && u.id === p.id && u.concept === c.name)) {
          link(entry.file, c.owner).uses.push({ kind: 'property', id: p.id, name: p.name, concept: c.name, conceptId: c.id });
        }
      }
    }
    for (const local of model.concepts.filter(c => !c.imported_from && c.parent)) {
      const parent = conceptIn(entry, local.parent);
      if (parent && parent.owner !== entry.file) link(entry.file, parent.owner).uses.push({ kind: 'parent', id: local.id, name: local.name, concept: parent.name, conceptId: parent.id });
    }
    for (const process of model.processes || []) for (const step of process.steps) for (const item of step.items || []) {
      const c = conceptIn(entry, item.concept);
      if (!c) continue;
      const usage = { domain: entry.file, process: process.id, processName: process.name, step: step.id, stepName: step.name, role: item.role };
      c.usages.push(usage);
      if (c.owner !== entry.file) link(entry.file, c.owner).uses.push({ kind: 'step', id: step.id, name: step.name, process: process.id, processName: process.name, role: item.role, concept: c.name, conceptId: c.id });
    }
  }
  // A term created in one domain's work and read or updated in another's is handed over.
  for (const c of concepts.values()) {
    const creators = c.usages.filter(u => u.role === 'creates');
    const consumers = c.usages.filter(u => u.role === 'reads' || u.role === 'updates');
    for (const from of creators) for (const to of consumers.filter(u => u.domain !== from.domain)) {
      link(from.domain, to.domain).handoffs.push({ concept: c.name, conceptId: c.id, owner: c.owner, from, to });
    }
    if (!creators.length && consumers.some(u => u.domain !== c.owner)) {
      questions.push({ kind: 'creator', concepts: [c.key], message: `「${c.name}」を作成する作業が、どの業務フローにも記録されていません。`, ask: `「${c.name}」は、どの業務で作られますか？` });
    }
  }
  // The same word defined separately in two domains may be one thing, or two that need telling apart.
  const labels = new Map();
  for (const c of concepts.values()) for (const label of [c.name, ...c.aliases]) {
    const key = String(label).trim().toLowerCase();
    if (!labels.has(key)) labels.set(key, { label: String(label).trim(), concepts: new Set() });
    labels.get(key).concepts.add(c);
  }
  for (const { label, concepts: same } of labels.values()) {
    const owners = new Set([...same].map(c => c.owner));
    if (owners.size < 2) continue;
    const list = [...same].map(c => `「${domains.get(c.owner).name}」の「${c.name}」`).join('と');
    questions.push({ kind: 'overlap', concepts: [...same].map(c => c.key), message: `「${label}」が複数のドメインで別々に定義されています：${list}`, ask: `「${label}」は、${list}で同じものを指していますか？` });
  }
  const usedConcepts = [...concepts.values()].filter(c => c.usages.length).map(c => {
    const cells = {};
    for (const u of c.usages) (cells[u.domain] ||= []).push(u);
    for (const list of Object.values(cells)) list.sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));
    return { key: c.key, id: c.id, name: c.name, owner: c.owner, cells };
  }).sort((a, b) => [...domains.keys()].indexOf(a.owner) - [...domains.keys()].indexOf(b.owner) || a.name.localeCompare(b.name, 'ja'));
  // What crosses a domain boundary: the diagram can show only these.
  const relationList = [...relations.values()];
  for (const r of relationList) r.cross = new Set([r.owner, concepts.get(r.from).owner, concepts.get(r.to).owner]).size > 1;
  for (const c of concepts.values()) c.cross = c.usages.some(u => u.domain !== c.owner) || relationList.some(r => r.cross && (r.from === c.key || r.to === c.key));
  for (const p of processes) p.cross = [...concepts.values()].some(c => c.cross && c.usages.some(u => u.domain === p.domain && u.process === p.id));
  return {
    domains: [...domains.values()],
    concepts: [...concepts.values()].map(({ aliases, ...c }) => c),
    processes,
    relations: relationList,
    links: [...links.values()].filter(l => l.imports || l.handoffs.length || l.uses.length),
    matrix: usedConcepts,
    questions,
  };
}

const overviewRoleNames = { creates: '作成する', reads: '参照する', updates: '更新する', participates: '参加する' };
export function overviewMarkdown(overview) {
  const name = file => overview.domains.find(d => d.file === file)?.name || file;
  const lines = ['# 全体マップ', '', '## ドメイン', ''];
  for (const d of overview.domains) lines.push(`- ${d.name}（${d.file}${d.local ? '' : '・このフォルダの外'}）：ことば ${d.concepts} · 業務フロー ${d.processes}`);
  lines.push('', '## ドメインをまたぐ関係', '');
  if (!overview.links.length) lines.push('ドメインをまたぐ関係はまだありません。');
  for (const l of overview.links) {
    lines.push(`### ${name(l.from)} → ${name(l.to)}`, '');
    for (const h of l.handoffs) lines.push(`- 受け渡し：${h.concept}（${h.from.processName} › ${h.from.stepName} が作成 → ${h.to.processName} › ${h.to.stepName} が${overviewRoleNames[h.to.role]}）`);
    for (const u of l.uses) lines.push(`- 定義を使う：${u.kind === 'property' ? `つながり「${u.name}」→ ${u.concept}` : u.kind === 'parent' ? `${u.name} は ${u.concept} の一種` : `${u.processName} › ${u.name} が ${u.concept} を${overviewRoleNames[u.role]}`}`);
    if (l.imports && !l.uses.length && !l.handoffs.length) lines.push('- 読み込んでいますが、使っている箇所はありません。');
    lines.push('');
  }
  lines.push('## ことばと業務の対応表', '');
  const used = overview.domains.filter(d => overview.matrix.some(row => row.cells[d.file]));
  if (overview.matrix.length) {
    lines.push(`| ことば | 定義元 | ${used.map(d => d.name).join(' | ')} |`, `|---|---|${used.map(() => '---|').join('')}`);
    for (const row of overview.matrix) lines.push(`| ${row.name} | ${name(row.owner)} | ${used.map(d => [...new Set((row.cells[d.file] || []).map(u => overviewRoleNames[u.role]))].join('、')).join(' | ')} |`);
  } else lines.push('業務フローで使われていることばはありません。');
  lines.push('', '## 確認したいこと', '');
  if (!overview.questions.length) lines.push('確認したいことはありません。');
  for (const q of overview.questions) lines.push(`- ${q.ask}`);
  return lines.join('\n') + '\n';
}
