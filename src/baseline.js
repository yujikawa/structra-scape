import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import yaml from 'js-yaml';

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
