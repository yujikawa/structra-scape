// What connects the domain files of one workspace (the models built together from a folder).
// Shared by the viewer's 全体マップ and `strscape overview`. Everything is derived from the
// models as recorded; nothing here is a new kind of model data.
// `entries` are [{file, name, slug?, model}], with each model's imports resolved. A concept is
// identified by the file that owns it (imported_from, or the entry's own file) and its ID.
export function workspaceOverview(entries) {
  const domains = new Map(), concepts = new Map(), links = new Map(), questions = [];
  const processes = [], relations = new Map();
  const roleOrder = ['creates', 'receives', 'updates', 'reads', 'participates'];
  // A file that only lists places (places.yaml) is a shared catalog, not a business domain.
  const catalog = model => !model.concepts.some(c => !c.imported_from) && !(model.processes || []).length && (model.places || []).some(s => !s.imported_from);
  const catalogs = new Set(entries.filter(entry => catalog(entry.model)).map(entry => entry.file));
  const places = workPlaces(entries);
  entries = entries.filter(entry => !catalogs.has(entry.file));
  for (const entry of entries) {
    const model = entry.model;
    domains.set(entry.file, { file: entry.file, name: entry.name || model.name || entry.file, slug: entry.slug, local: true, concepts: 0, processes: (model.processes || []).length });
  }
  // Shared files outside the workspace still appear, as domains that cannot be opened.
  for (const entry of entries) for (const imported of entry.model.imported_models || []) {
    if (!domains.has(imported.path) && !catalogs.has(imported.path)) domains.set(imported.path, { file: imported.path, name: imported.name || imported.path, local: false, concepts: 0, processes: 0 });
  }
  const ownerOf = (entry, item) => item.imported_from || entry.file;
  const conceptIn = (entry, id) => {
    const item = entry.model.concepts.find(c => c.id === id);
    if (!item) return null;
    const key = `${ownerOf(entry, item)}#${item.id}`;
    if (!concepts.has(key)) {
      concepts.set(key, { key, id: item.id, name: item.name, owner: ownerOf(entry, item), aliases: item.aliases || [], ...(item.deprecated ? { deprecated: true } : {}), usages: [] });
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
    const consumers = c.usages.filter(u => ['receives', 'reads', 'updates'].includes(u.role));
    for (const from of creators) for (const to of consumers.filter(u => u.domain !== from.domain)) {
      link(from.domain, to.domain).handoffs.push({ concept: c.name, conceptId: c.id, owner: c.owner, from, to });
    }
    if (!creators.length && consumers.some(u => u.domain !== c.owner)) {
      questions.push({ kind: 'creator', concepts: [c.key], message: `「${c.name}」を作成する作業が、どの業務フローにも記録されていません。`, ask: `「${c.name}」は、どの業務で作られますか？` });
    }
  }
  // The same word defined separately in two domains may be one thing, or two that need telling apart.
  const labels = new Map();
  // A deprecated term's name often lives on as an alias of its replacement.
  for (const c of [...concepts.values()].filter(c => !c.deprecated)) for (const label of [c.name, ...c.aliases]) {
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
  // Where data is and how it moves between work places, read from the steps.
  const uses = placeUses(entries), placeData = { list: places, uses, moves: dataMoves(uses) };
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
    places: placeData,
  };
}

// Every work place of the models built together, shared catalogs (places.yaml) included, with the
// steps done on it. Places are keyed like terms: the file that owns them and their ID.
export function workPlaces(entries) {
  const places = new Map();
  for (const entry of entries) {
    const model = entry.model, owner = item => item.imported_from || entry.file;
    for (const place of model.places || []) {
      const key = `${owner(place)}#${place.id}`, { imported_from, ...fields } = place;
      if (!places.has(key)) places.set(key, { key, file: owner(place), ...fields, steps: [] });
    }
    for (const p of model.processes || []) for (const s of p.steps || []) {
      const place = s.place && (model.places || []).find(x => x.id === s.place);
      if (place) places.get(`${owner(place)}#${place.id}`).steps.push({ domain: entry.file, domainName: entry.name || model.name, process: p.id, processName: p.name, step: s.id, stepName: s.name, ...(s.timing ? { timing: s.timing } : {}) });
    }
  }
  return [...places.values()];
}
// Where data is, read from the steps: a step names the place (作業場所) it is done on and the
// terms it creates, receives, reads or updates there. Across every model built together.
// Terms and places are identified by the file that owns them and their ID.
export function placeUses(entries) {
  const uses = [];
  for (const entry of entries) {
    const model = entry.model, owner = item => item.imported_from || entry.file;
    const placeOf = s => s?.place && (model.places || []).find(x => x.id === s.place);
    for (const p of model.processes || []) for (const s of p.steps || []) {
      const place = placeOf(s);
      if (!place) continue;
      for (const item of s.items || []) {
        const concept = model.concepts.find(c => c.id === item.concept);
        if (!concept || item.role === 'participates') continue;
        // A receiving step takes the term from the place of the nearest earlier step in its flow
        // that holds it elsewhere, when there is one.
        const prior = item.role === 'receives' && earlier(p, s.id).map(id => p.steps.find(x => x.id === id)).find(x => placeOf(x) && placeOf(x) !== place && (x.items || []).some(i => i.concept === item.concept && i.role !== 'reads' && i.role !== 'participates'));
        uses.push({ concept: `${owner(concept)}#${concept.id}`, conceptId: concept.id, conceptName: concept.name, place: `${owner(place)}#${place.id}`, placeId: place.id, placeName: place.name, role: item.role,
          domain: entry.file, domainName: entry.name || model.name, process: p.id, processName: p.name, step: s.id, stepName: s.name, ...(s.timing ? { timing: s.timing } : {}),
          ...(prior ? { from: `${owner(placeOf(prior))}#${placeOf(prior).id}` } : {}) });
      }
    }
  }
  return uses;
}
// Step IDs before `id` in a process, nearest first (breadth-first along the flows, backwards).
function earlier(p, id) {
  const order = [], queue = [id], seen = new Set([id]);
  while (queue.length) {
    const at = queue.shift();
    for (const f of (p.flows || []).filter(f => f.target === at)) if (!seen.has(f.source)) { seen.add(f.source); order.push(f.source); queue.push(f.source); }
  }
  return order;
}
const holds = role => role === 'creates' || role === 'receives';
// How each term moves between places. A step that receives a term on a place takes it from the
// place of the nearest earlier step in its flow that holds the term; failing that, from the
// places where it is created or updated (or, failing those, received). A term used on a place
// where nothing creates or receives it has no recorded way of getting there: a gap.
export function dataMoves(uses) {
  const moves = new Map();
  const move = (u, from, via) => {
    const key = [u.concept, from.place, u.place].join('\u0000');
    if (!moves.has(key)) moves.set(key, { concept: u.concept, conceptName: u.conceptName, from: from.place, fromName: from.placeName, to: u.place, toName: u.placeName, via: [], gap: !via });
    if (via && !moves.get(key).via.some(v => v.domain === via.domain && v.process === via.process && v.step === via.step)) moves.get(key).via.push(via);
  };
  for (const u of uses) {
    const others = uses.filter(o => o.concept === u.concept && o.place !== u.place);
    const makers = others.filter(o => o.role === 'creates' || o.role === 'updates'), sources = makers.length ? makers : others.filter(o => o.role === 'receives');
    if (u.role === 'receives') for (const from of u.from ? others.filter(o => o.place === u.from).slice(0, 1) : sources) move(u, from, u);
    else if (!uses.some(o => o.concept === u.concept && o.place === u.place && holds(o.role))) for (const from of makers) move(u, from, null);
  }
  return [...moves.values()];
}
// What the open questions need from the rest of the workspace: every place use, and which
// file the model being checked is.
export function completionContext(entries, file) {
  return { file, uses: placeUses(entries) };
}

const overviewRoleNames = { creates: '作成する', receives: '受け取る', reads: '参照する', updates: '更新する', participates: '参加する' };
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
  const { list, uses, moves } = overview.places;
  if (list.length) {
    lines.push('', '## 作業場所', '');
    for (const place of list) {
      const domains = [...new Set(place.steps.map(s => s.domainName))];
      lines.push(`- ${place.name}${place.owner ? `（担当：${place.owner}）` : ''}${place.description ? `：${place.description}` : ''}${domains.length ? ` — 作業 ${place.steps.length}件（${domains.join('、')}）` : ' — まだどの作業でも使われていません'}`);
    }
  }
  if (uses.length) {
    lines.push('', '## 作業場所とデータ', '', '作業に書かれた作業場所から読み取ったものです。渡し方（手渡し・ファイル・APIなど）は区別していません。', '');
    const roleNames = { creates: '作成', receives: '受け取り', reads: '参照', updates: '更新' };
    for (const concept of [...new Set(uses.map(u => u.concept))]) {
      const rows = uses.filter(u => u.concept === concept);
      lines.push(`### ${rows[0].conceptName}`, '');
      for (const u of rows) lines.push(`- ${u.placeName}：${u.processName} › ${u.stepName} が${roleNames[u.role]}${u.timing ? `（${u.timing}）` : ''}`);
      for (const m of moves.filter(m => m.concept === concept)) lines.push(m.gap ? `- **経路が未記録**：${m.fromName} → ${m.toName}` : `- 移動：${m.fromName} → ${m.toName}（${m.via.map(v => v.stepName).join('、')}）`);
      lines.push('');
    }
  }
  lines.push('', '## 確認したいこと', '');
  if (!overview.questions.length) lines.push('確認したいことはありません。');
  for (const q of overview.questions) lines.push(`- ${q.ask}`);
  return lines.join('\n') + '\n';
}
