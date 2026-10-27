import yaml from 'js-yaml';

// Aliases (*name) share one value, so a few lines can stand for billions of values once expanded
// (JSON for the viewer, diffs). Expansion may add at most this many values over the file itself.
const MAX_ALIAS_GROWTH = 100000;

// Every model YAML is read through here.
export function loadYaml(text) {
  const data = yaml.load(text, { schema: yaml.CORE_SCHEMA });
  const sizes = new Map(), open = new Set();
  let written = 0;
  // Values as written count once; `size` counts them as expanded, every alias in full.
  const size = value => {
    if (!value || typeof value !== 'object') return 1;
    if (sizes.has(value)) return sizes.get(value);
    if (open.has(value)) throw new Error('YAML のエイリアス（*）が自分自身を参照しています');
    open.add(value);
    written++;
    let total = 1;
    for (const child of Object.values(value)) {
      if (!child || typeof child !== 'object') written++;
      total += size(child);
    }
    open.delete(value);
    sizes.set(value, total);
    return total;
  };
  const expanded = size(data);
  if (data && typeof data === 'object' && expanded - written > MAX_ALIAS_GROWTH) throw new Error('YAML のエイリアス（*）で展開されるデータが大きすぎます');
  return data;
}
