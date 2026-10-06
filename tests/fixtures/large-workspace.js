// A synthetic workspace at the size of a real company's models, for scale tests:
// `domains` files, each with `concepts` terms (a few attributes each), relationships,
// subtypes, rules and `processes` flows with branches, importing a shared file.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export function writeLargeWorkspace(dir, { domains = 6, concepts = 60, processes = 5, steps = 12 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const shared = { kind: 'ontology', name: '共通の用語', base: 'https://example.com/common#', concepts: [], properties: [], restrictions: [] };
  for (let i = 0; i < 20; i++) shared.concepts.push({ id: `Common${i}`, name: `共通用語${i}`, description: `全社で使う${i}番目の用語。`, review_state: 'agreed', agreed_by: '業務標準化委員会', agreed_at: '2026-04-01', evidence: '用語集 v3' });
  fs.writeFileSync(path.join(dir, 'common.yaml'), yaml.dump(shared));
  for (let d = 0; d < domains; d++) {
    const id = n => `D${d}T${n}`, m = { kind: 'ontology', name: `ドメイン${d}の定義`, base: `https://example.com/d${d}#`, imports: ['common.yaml'], concepts: [], properties: [], restrictions: [], processes: [] };
    for (let n = 0; n < concepts; n++) m.concepts.push({
      id: id(n), name: `領域${d}の用語${n}${n % 7 === 0 ? 'という少し長めの名前を持つことば' : ''}`,
      ...(n % 5 ? { description: `領域${d}で扱う${n}番目のもの。` } : {}),
      ...(n % 3 === 0 ? { example: `例${n}` } : {}),
      ...(n > 0 && n % 4 === 0 ? { parent: id(n - 1) } : n % 11 === 0 ? { parent: `Common${n % 20}` } : {}),
      ...(n % 6 === 0 ? { aliases: [`別名${d}-${n}`] } : {}),
      review_state: ['draft', 'discussion', 'agreed'][n % 3], ...(n % 3 === 2 ? { agreed_by: '営業部', agreed_at: '2026-09-01' } : {}),
      attributes: Array.from({ length: n % 4 }, (_, a) => ({ id: `a${a}`, name: `項目${a}`, type: ['text', 'date', 'amount', 'code'][a], ...(a === 3 ? { values: [{ value: 'x' }, { value: 'y' }] } : {}) })),
    });
    for (let n = 0; n < concepts * 1.3; n++) m.properties.push({ id: `D${d}P${n}`, name: `関係${n}`, domain: id(n % concepts), range: n % 9 === 0 ? `Common${n % 20}` : id((n * 7 + 3) % concepts) });
    for (let n = 0; n < concepts / 6; n++) m.restrictions.push({ subject: id(n * 6), property: `D${d}P${n * 6}`, operator: n % 2 ? 'someValuesFrom' : 'minCardinality', ...(n % 2 ? { target: m.properties[n * 6].range } : { count: 1 }), mode: 'necessary' });
    for (let p = 0; p < processes; p++) {
      const s = [{ id: 'Start', name: '開始', type: 'start' }], flows = [];
      for (let k = 1; k < steps; k++) s.push(k % 5 === 0 ? { id: `S${k}`, name: `判断${k}`, type: 'decision' } : { id: `S${k}`, name: `作業${k}を行う`, type: 'task', ...(k % 4 ? { owner: `担当${k % 3}` } : {}), items: [{ concept: id((p * 13 + k) % concepts), role: ['creates', 'reads', 'updates'][k % 3] }] });
      s.push({ id: 'End', name: '完了', type: 'end' });
      for (let k = 0; k < s.length - 1; k++) {
        flows.push({ source: s[k].id, target: s[k + 1].id, ...(s[k].type === 'decision' ? { label: 'はい' } : {}) });
        if (s[k].type === 'decision') flows.push({ source: s[k].id, target: 'End', label: 'いいえ' });
      }
      m.processes.push({ id: `D${d}Flow${p}`, name: `領域${d}の業務${p}`, steps: s, flows });
    }
    fs.writeFileSync(path.join(dir, `domain${d}.yaml`), yaml.dump(m, { lineWidth: -1 }));
  }
  return dir;
}
