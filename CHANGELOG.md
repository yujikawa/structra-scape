# Changelog

## Unreleased

### Answering
- Questions with a known set of answers are answered by choice in the viewer (yes / no /
  not sure, included / excluded, time basis, value types, aggregation, which term an alias
  means…), with free text always possible; exports carry `choice` and `note`.
- Each question shows what is recorded now; *1問ずつ答える* shows one question at a time with
  the progress; questions can be filtered by process owner.
- `strscape answers --patch` proposes an apply transaction for the answers given by choice and
  lists everything else as notes.

### Judging examples
- Cases may record `judgments`: how each department or role judged them (included,
  excluded, unsure, with a reason). Undecided cases are answered in the viewer with three
  choices, and the exported answer carries the judgment. Differing judgments, and judgments
  that differ from the decided result, appear as open items to reconcile; agreeing ones ask
  whether that settles the case. Recording judgments is not an agreed change.
- The modeling skill adds boundary examples after each definition instead of judging them.

### Analysis
- Models record the tacit knowledge an analysis depends on, not its implementation:
  `temporal` on concepts (basis current / as_of / period, validity period with inclusive
  boundaries, time zone) and `effective_from` / `effective_to` (when a definition applies,
  separate from `agreed_at`).
- `metrics`: numbers defined apart from concepts (aggregation, counted attribute, formula as
  text, conditions, unit, time basis, non-additive dimensions, and `cases` in words), agreed
  and guarded like definitions. The viewer shows what the records can answer now and at a
  past moment.
- `data_mapping.history` (current_only / snapshot / versioned) and status `rejected`.
- Open questions are derived only for the features a definition uses; models without them
  get no new items. CLI entity `metric`; semantic diff and Markdown export cover it; OWL/SKOS
  exports state what they leave out.

### Docs
- README.en.md, an English README.
- Screenshots of the viewer in both READMEs, captured from the samples by
  `npm run screenshots` (scripts/screenshots.js).

### Viewer
- Tool buttons are icons with tooltips and accessible names: export, help, language (a globe
  menu), color scheme, the diagram's fit / zoom / view switch / 表示範囲, the overview's fit,
  clearing the filter and opening answer files (now a keyboard-reachable button). View tabs
  and Export answers keep their text. One header menu is open at a time.
- Open items are phrased as questions business users can answer (each issue from
  `assessCompletion` now carries an `ask` next to its `message`), with the recording task in
  small print underneath and gentler category names (決めたいこと, 教えてほしいこと, …).
  Business users and the data team share one view: IDs and data mappings are always shown.
- Terms open on the definitions list. Definition cards open the term's full detail when its
  name is selected.
- Business users can answer open questions (all but data-mapping items). Answers are kept in the
  browser and exported as `answers-<model>-<time>.json`; under `strscape dev` they are saved
  to `answers/` next to the models instead. An answer disappears once its question is no
  longer asked by the model.

- 全体マップ, the first view when several models are built together: each domain is a box
  of its processes and terms, with lines for what crosses domains — hand-overs (a term one
  domain's work creates and another's reads or updates) and definitions used through
  imports. Below it: the relationships per pair of domains, a terms-by-process table grouped
  by the defining domain, and questions across domains (the same word defined in two
  domains; a term read elsewhere that no process creates).
- Nodes can be dragged in every diagram (process flows and the overview too, as in the term
  diagram). Dragged positions last while the page is open and are never saved to the YAML.

### Models
- `agreed_by` / `agreed_at` record who agreed a definition and when (only with
  `review_state: agreed`). An agreed definition without them is an open question; adding them
  where they were missing is not an agreed change.
- `deprecated: true` and `replaced_by` retire a term without deleting it. The viewer marks it
  as retired; open questions stop reviewing it and list the steps, relationships and subtypes
  that still use it; the OWL export adds `owl:deprecated` and `dcterms:isReplacedBy`.
- YAML is read with the YAML 1.2 core schema, so dates such as `2026-09-15` stay strings.

### Viewer
- Dark mode follows the system setting by default; a header button (icons for system, light,
  dark) overrides it per browser. Diagram sheets stay light. Every stylesheet color is
  now a token (a test enforces it).
- Printing gives the open view as a document: no navigation or controls, light colors, cards
  and questions kept whole across pages.
- Hint text (`--ink-3`) meets WCAG AA contrast (4.5:1) on every background.

### Viewer (large models)
- The term diagram has a 表示範囲 control: every term, the selection and its neighbours, or
  two steps away. Selecting a neighbour re-centres the diagram on it. Models with more than
  40 terms open on the neighbourhood.
- 未確認事項: the count tiles filter by kind, and a search box filters by name or question.
- Tests build a synthetic workspace at company scale (7 domains, ~400 terms, 30 flows) and
  check that it loads, narrows and filters in the browser and builds quickly in Node.

### Answers from several people
- Under each question the viewer lists the answers given so far: under `dev` it reads the
  ones saved in `answers/` (new `GET /answers?model=`), and any build can open exported
  answer files. Questions answered differently are marked 回答が分かれています.
- `strscape answers` adds `others` and `conflict` to answers that several files give for the
  same question, and a `conflicts` count; the skill asks the user instead of picking one.

### CLI
- `export --format skos` writes the terms as a SKOS thesaurus in Turtle (prefLabel, altLabel,
  definition, example, broader, related, notation, deprecation), for data catalogs.
- `import-glossary <csv>` turns a glossary exported from a spreadsheet (CSV/TSV, Japanese or
  English headers) into concept upserts for `apply`. It needs an ID column, never invents
  IDs, never marks anything agreed, and lists the columns it left out.
- `check-mapping <path> --schema <files...>` checks the tables and columns named in data
  mappings against a dbt manifest.json / catalog.json or a CSV of
  information_schema.columns; exit code 1 when something is missing.
- `validate` and `diff` take a folder and cover every model in it. `validate --json` now prints
  `{valid, files: [{file, errors}]}`; `diff <folder>` groups changes by file and lists models
  deleted since the baseline. `diff --fail-on-agreed` exits with 1 when an agreed definition
  changed.
- `ci` writes a GitHub Actions workflow: on each pull request touching the models it validates
  them, comments the changes in meaning (one comment, updated in place), and attaches the
  viewer with the 変更点 tab as an artifact.
- `guide --read` prints a guide for AIs that are handed a model rather than editing it: how
  settled each statement is (agreed vs. draft, open questions, unresolved cases, proposed
  data mappings), how to read classification rules, and what to do when an imported file is
  missing. `init` puts the same guide in the models folder as `README.md` (never in the
  project root, never over an existing README). Tested with fresh agents: without it, a
  smaller model misread `equivalent` and `allValuesFrom` rules and treated a proposed data
  mapping as usable; with it, it answered all of them correctly.
- `overview <dir>` prints the same overview as JSON or Markdown (`--format md`).
- `questions <file>` lists the open questions that have an answer box, with stable keys (each issue
  from `assessCompletion` now has a `key`).
- `answers <file|dir>` reads exported answers and marks whether each question is still
  open; `--resolve <keys...>` removes recorded answers and deletes the file once empty.
- Builds embed each model's file name and revision, which exported answers carry.

### Skills
- `references/existing-assets.md`: starting from a glossary spreadsheet, table definitions
  or dbt, and checking data mappings against the warehouse schema.
- `references/modeling.md`: write `question` as a plain question business users can answer
  (they see it as-is, with an answer box); data-team questions go in `data_mapping.gap`.
- `references/review.md`: the hand-off report mentions the answer boxes.
- `references/answers.md`: how to record answers from business users and remove them.
- `references/workspace.md`: check `strscape overview` for words other domains already define.

### Fixes
- The answers test left the dev server's reload stream open, so `npm test` never exited.

## 0.1.0 — 2026-10-01

First release.

### Models
- One YAML format (`kind: ontology`) for business terms and processes: concepts with
  definitions, examples, exclusions, cases, evidence, questions and agreement state;
  aliases; attributes (data items with value types and code lists, inherited by subtypes);
  relationships; classification rules; process flows with steps, owners, decisions,
  parallel gateways and detail flows; data mappings for concepts and attributes.
- `imports` to share definitions between files (for example `models/common.yaml`).

### Viewer
- Self-contained, read-only HTML viewer (`strscape dev`, `strscape build`) with four views:
  terms and relationships, business processes, open questions, and changes since a git
  revision. Japanese and English UI.
- Open questions cover missing definitions, undecided cases, unagreed terms, alias
  collisions, data mappings, and flow structure (owners, decision labels, gateways,
  reachability, dead ends).
- Export of diagrams (SVG, PNG), definitions (Markdown) and OWL Turtle.
- `dev` listens on 127.0.0.1 and rejects requests for other host names (DNS rebinding).
  `build --compare` embeds only the computed changes, not the previous model.

### AI authoring
- JSON CLI for agents: `inspect`, `apply` transactions, per-entity commands
  (`concept`, `property`, `attribute`, `process`, `step`), `promote` to move terms into a
  shared file, `diff` for changes in meaning, `guide` for the authoring contract.
- Writes are validated (including importing files), locked, revision-checked, and edit
  the YAML in place so comments and formatting survive. Locks left by a crashed process
  are recovered automatically.
- Changes to agreed definitions require explicit confirmation (`--allow-agreed-change`).
- `strscape-modeling` skill for Claude Code and Codex, installed by `strscape init` or
  `strscape skills`, with shared references on modeling decisions, file layout, tested
  patch recipes and hand-off checks.
