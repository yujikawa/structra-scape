# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`structra-scape` (CLI: `strscape`) is a Node.js ESM CLI that turns YAML models into a single self-contained HTML viewer. AI agents write the YAML; the viewer shows it. The README and most UI text are in Japanese, and Japanese is the default UI language.

## Commands

```bash
npm install
npm test                                   # node --test on the files listed in package.json
npm run test:browser                       # builds samples/ and walks every view in headless Chromium
node --test tests/mutate.test.js           # run one test file
node --test --test-name-pattern "UI translations" tests/ontology.test.js   # run one test
npm run validate / build / dev             # run against samples/
node src/index.js dev samples/ --port 4175
node src/index.js guide                    # prints src/templates/authoring.md (the AI authoring contract)
```

Inside this repo, use `node src/index.js` wherever the docs say `strscape`. No lint or format tooling is configured. `npm test` lists its test files explicitly in `package.json`, so a new test file must be added there.

## Architecture

**One model format.** A model is `kind: ontology` YAML: `concepts` (with optional `aliases` and `attributes`) / `properties` / `restrictions` / `processes` (with `steps` and `flows`). It is validated by `ontology.js#validateOntology` and rendered with `templates/ontology.html`. The project is pre-release: there is no backward compatibility to keep, so change formats and commands freely and update samples, recipes and docs with them.

**Imports.** An ontology model may list `imports` (relative YAML paths). `imports.js#resolveImports` merges their concepts/properties/restrictions, tagged with `imported_from`, plus an `imported_models` list. `validate.js#loadModel` resolves by default (`{ resolve: false }` for the raw file). Anything that writes or diffs must use the raw model; completion, diff and OWL export skip `imported_from` entries.

**Build is string templating, with no bundler.** `build.js#renderBundle` reads one YAML file, or every `*.yaml` file directly inside a directory. It validates them, then replaces `<!-- PLACEHOLDER -->` comments in the HTML template with inlined sources, and returns the HTML plus every source file (including imports) for the dev watcher. `renderModel` returns only the HTML.
- the `cytoscape` minified build, resolved through `require.resolve`
- the model JSON as `window.__STRUCTRA_DATA__`; with `compare`, each entry also carries `baseline: {ref, model}` read from git by `baseline.js`
- **shared Node/browser modules** (`ontology.js`, `publication.js`, `completion.js`, `diff.js`, `i18n.js`), with `^export ` stripped
- browser-only scripts from `src/templates/*.js`

Code in those shared modules runs both in Node (CLI and tests) and as plain browser globals:
- Keep them free of imports of any kind; in the browser they all share one script scope, so avoid generic top-level names.
- Keep each `export` at the start of a line, because the build only strips `^export `.
- To add a new browser script, add a placeholder to the template and a matching `.replace` call in `build.js`.
- Always use replacement callbacks in `.replace`, because the minified bundles contain `$&`.

**Ontology viewer.** The viewer is read-only; there are no in-browser authoring controls. The base script in `templates/ontology.html` owns the term graph, lists and glossary. Later scripts extend it by reassigning global functions (`refresh`, `setProcessMode`, `renderProcess`, `processDetail`): `process-view.js` → `reader.js` (detail panes, menus, icons) → `completion-view.js` / `changes-view.js` (extra mode tabs) → `process-hierarchy.js` → `language-view.js` → `view-state.js` (restores navigation from sessionStorage).
- All CSS lives in the single `<style>` block in `templates/ontology.html`, including for elements the scripts create. The scripts must not inject their own styles.
- Colors are tokens on `:root`. Navy (`--accent`) marks business meaning and navigation, teal (`--data`) marks the data layer (IDs, attributes, data mapping), and amber (`--warn`) marks open items.
- New UI text must be added to `i18n.js`. Translation works per DOM text node, so keep each label in its own node and model text in separate nodes.

**Dev server.** `dev.js` serves `renderBundle` output with Express on `127.0.0.1` by default, comparing with git `HEAD` unless `--no-compare`. Chokidar watches the YAML and its imports and pushes reload or error messages over SSE at `/events`. When the YAML is invalid, it keeps serving the last valid HTML. Templates are read at render time.

**AI mutation CLI.** `mutate.js#registerAuthoringCommands` adds these subcommands: `inspect`, `concept|property|process|step get/upsert/remove`, and `apply`.
- These commands work on ontology models only.
- `revision` is the sha256 of the file text. `--expect-revision` rejects stale writes.
- Writes take a lock file and validate the whole model (with imports, and sibling files that import it) before saving.
- `yaml-document.js` edits the YAML in place with the `yaml` package, so comments and styles survive; js-yaml stays the parser everywhere else.
- Changes to anything with `review_state: agreed` fail with `AGREED_CHANGE` unless `--allow-agreed-change` is passed (`diff.js` decides what counts as a change).
- Attributes are a nested entity (`--concept`), like steps (`--process`). The `model` entity edits only the root `name` / `base` / `imports`.
- `promote` moves definitions into a shared file and adds the import, locking and validating both files (and their importers) together.
- Flows and restrictions have no IDs, so they are replaced as whole lists.
- Nested values are replaced, not merged.

**Skills distribution.** `skills.js` installs the `strscape-modeling` skill into `.agents/skills/…` (Codex) and/or `.claude/skills/…` (Claude Code). Each gets its own `src/templates/skills/{codex,claude}/SKILL.md` plus everything in `src/templates/skills/shared/` (the `references/` files). It checks every file first and refuses to overwrite any customized one unless `--force` is given. `init` calls it, except with `--no-skills`. `tests/skills.test.js` applies every JSON block of `references/cli-recipes.md` in order to a fresh model, so keep those recipes valid when the schema changes.

**Other pieces:**
- `completion.js`: computes the "open questions" view (未確認事項) from missing definitions, unresolved cases, `question` fields, attributes, alias collisions, data mappings and flow structure (owners, decision labels, gateways, reachability).
- `diff.js`: semantic diff keyed by IDs (ignores `position`), used by `diff`, `apply` and the 変更点 view.
- `publication.js`: SVG/Markdown export (`export` command, and the browser's 出力 menu).
- `i18n.js`: a Japanese→English UI-copy dictionary. Model text is never translated.
- `ontology.js#exportOntology`: OWL Turtle export (`export --format ttl`).
- `process-hierarchy.js`: drill-down navigation through `subprocess` references between processes.

## Tests

Tests use `node:test` and run against the `samples/` YAML files. `tests/ontology.test.js` renders full HTML with `renderModel`, then parses every inline `<script>` with `vm.Script` to catch syntax errors in the assembled page. Run this test after editing templates or shared modules; it does not catch runtime errors, so also run `npm run test:browser` (`tests/browser.test.js`, skipped when no Chromium is installed). `tests/skills.test.js` spawns the CLI in a temp directory. `tests/files.test.js` covers imports, in-place writes, the agreed-change guard, diff and git baselines in temp directories.
