# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`structra-scape` (CLI: `strscape`) is a Node.js ESM CLI that turns YAML models into a single self-contained HTML viewer. AI agents write the YAML; the viewer shows it. The README and most UI text are in Japanese, and Japanese is the default UI language.

## Commands

```bash
npm install
npm test                                   # node --test on the four files in tests/
node --test tests/mutate.test.js           # run one test file
node --test --test-name-pattern "UI translations" tests/ontology.test.js   # run one test
npm run validate / build / dev             # run against samples/support-backlog-loop.yaml
node src/index.js dev samples/ontology/customer-contract.yaml --port 4175
node src/index.js guide                    # prints src/templates/authoring.md (the AI authoring contract)
```

Inside this repo, use `node src/index.js` wherever the docs say `strscape`. No lint or format tooling is configured. `npm test` lists its test files explicitly in `package.json`, so a new test file must be added there.

## Architecture

**Two model kinds, two viewers.** `validate.js#validateModel` branches on `kind`:
- `kind: ontology` is the current main model: `concepts` / `properties` / `restrictions` / `processes` (with `steps` and `flows`). It is validated by `ontology.js#validateOntology` and rendered with `templates/ontology.html`.
- Anything else is the legacy "exploration" model (`nodes` / `edges` / causal loops). It is validated inline in `validate.js` and rendered with `templates/viewer.html`.
- One build can't mix the two kinds (`build.js` throws an error).

**Build is string templating, with no bundler.** `build.js#renderModel` reads one YAML file, or every `*.yaml` file directly inside a directory. It validates them, then replaces `<!-- PLACEHOLDER -->` comments in the HTML template with inlined sources:
- `cytoscape` and `js-yaml` minified builds, read from `node_modules`
- the model JSON as `window.__STRUCTRA_DATA__`
- **shared Node/browser modules** (`ontology.js`, `publication.js`, `completion.js`, `i18n.js`), with `^export ` stripped
- browser-only scripts from `src/templates/*.js`

Code in those shared modules runs both in Node (CLI and tests) and as plain browser globals:
- Keep them free of Node imports.
- Keep each `export` at the start of a line, because the build only strips `^export `.
- To add a new browser script, add a placeholder to the template and a matching `.replace` call in `build.js`.
- Always use replacement callbacks in `.replace`, because the minified bundles contain `$&`.

**Ontology viewer styling.** All CSS for the ontology viewer lives in the single `<style>` block in `templates/ontology.html`. This includes the elements the injected scripts create (mode tabs, process workspace, hierarchy tree, open-questions view). The scripts must not inject their own styles.
- Colors are tokens on `:root`. Navy (`--accent`) marks business meaning and navigation, teal (`--data`) marks the data layer (IDs, data mapping), and amber (`--warn`) marks open items.
- Authoring controls (`#save`, `#connect`, etc.) stay in the DOM but are hidden with `display:none!important`, because the viewer is read-only.
- New UI text must be added to `i18n.js`. Translation works per DOM text node, so keep each label in its own node.

**Dev server.** `dev.js` serves `renderModel` output with Express. Chokidar watches the YAML and pushes reload or error messages over SSE at `/events`. When the YAML is invalid, it keeps serving the last valid HTML. Templates are read at render time, but restart the server after changing template code (README guidance).

**AI mutation CLI.** `mutate.js#registerAuthoringCommands` adds these subcommands: `inspect`, `concept|property|process|step get/upsert/remove`, and `apply`.
- These commands work on ontology models only.
- `revision` is the sha256 of the file text. `--expect-revision` rejects stale writes.
- Writes take a lock file, validate the whole model before saving, and then re-dump the YAML, which drops comments and formatting.
- Flows and restrictions have no IDs, so they are replaced as whole lists.
- Nested values are replaced, not merged.

**Skills distribution.** `skills.js` copies `src/templates/skills/strscape-modeling/SKILL.md` into `.agents/skills/…` (Codex) and/or `.claude/skills/…` (Claude Code). It refuses to overwrite a customized copy unless `--force` is given. `init` calls it, except with `--no-skills` or `--exploration`. Nothing references `src/templates/codex/structra-modeling/SKILL.md`; the live template is the one under `skills/`.

**Other pieces:**
- `completion.js`: computes the "open questions" view (未確認事項) from missing definitions, unresolved cases, `question` fields, and data mappings.
- `publication.js`: SVG/Markdown export (`export` command, and the browser's 出力 menu).
- `i18n.js`: a Japanese→English UI-copy dictionary. Model text is never translated.
- `ontology.js#exportOntology`: legacy OWL Turtle export (`owl` command).
- `process-hierarchy.js`: drill-down navigation through `subprocess` references between processes.

## Tests

Tests use `node:test` and run against the `samples/` YAML files. `tests/ontology.test.js` renders full HTML with `renderModel`, then parses every inline `<script>` with `vm.Script` to catch syntax errors in the assembled page. Run this test after editing templates or shared modules. `tests/skills.test.js` spawns the CLI in a temp directory.
