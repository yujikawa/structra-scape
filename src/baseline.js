import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';
import { diffModels } from './diff.js';

const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });

// The model as it was at a git revision. Returns null when the file is not in a git work tree or
// the revision does not exist; an empty model when the file did not exist at that revision.
export function gitBaseline(file, ref = 'HEAD') {
  // A revision is never an option: refuse values git would parse as flags.
  if (typeof ref !== 'string' || !ref || ref.startsWith('-')) throw new Error(`Invalid git revision: ${ref}`);
  const absolute = path.resolve(file), cwd = path.dirname(absolute);
  try { git(cwd, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]); } catch { return null; }
  let text;
  try { text = git(cwd, ['show', `${ref}:./${path.basename(absolute)}`]); } catch { return { ref, model: null }; }
  return { ref, model: yaml.load(text) || {} };
}

// --base accepts either a YAML file or a git revision.
export function loadBaseline(file, base = 'HEAD') {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return { ref: base, model: yaml.load(fs.readFileSync(base, 'utf8')) || {} };
  const baseline = gitBaseline(file, base);
  if (!baseline) throw new Error(`Cannot read ${base}: not a file, or not a git revision of ${file}`);
  return baseline;
}

// YAML files directly inside `dir` at a git revision (to report models deleted since then).
function gitModelNames(dir, ref) {
  try { return git(dir, ['ls-tree', '--name-only', `${ref}:./`]).split('\n').filter(name => /\.ya?ml$/i.test(name)); } catch { return []; }
}

// Semantic changes of one model file, or of every model in a folder (including files deleted
// since the baseline). `base` is a git revision, or for a single file also another YAML file.
export function diffTarget(target, base = 'HEAD') {
  const absolute = path.resolve(target);
  if (!fs.existsSync(absolute)) throw new Error(`File not found: ${target}`);
  const current = file => yaml.load(fs.readFileSync(file, 'utf8')) || {};
  if (!fs.statSync(absolute).isDirectory()) {
    const baseline = loadBaseline(target, base);
    return [{ file: path.basename(absolute), ref: baseline.ref, changes: diffModels(baseline.model, current(absolute)) }];
  }
  if (fs.existsSync(base)) throw new Error('--base must be a git revision when comparing a folder');
  const names = fs.readdirSync(absolute).filter(name => /\.ya?ml$/i.test(name));
  const deleted = gitModelNames(absolute, base).filter(name => !names.includes(name));
  if (!names.length && !deleted.length) throw new Error(`No YAML files found in ${target}`);
  return [...names, ...deleted].sort().map(name => {
    const file = path.join(absolute, name), baseline = gitBaseline(file, base);
    if (!baseline) throw new Error(`Cannot read ${base}: not a git revision of ${target}`);
    if (!fs.existsSync(file)) return { file: name, ref: baseline.ref, changes: [{ entity: 'model', change: 'removed', id: '', name: baseline.model?.name || name, agreed: (baseline.model?.concepts || []).some(c => c?.review_state === 'agreed') }] };
    return { file: name, ref: baseline.ref, changes: diffModels(baseline.model, current(file)) };
  });
}
