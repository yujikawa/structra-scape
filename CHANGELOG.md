# Changelog

## Unreleased

### Viewer
- A 業務向け / データ向け switch in the header. The business view is the default: it hides
  IDs and the data mapping tab, opens terms on the definitions list, and leaves data-mapping
  items out of the open questions. The choice is remembered in the browser.
- In the business view, open items are phrased as questions for business users (each issue
  from `assessCompletion` now carries an `ask` next to its `message`), with gentler category
  names (決めたいこと, 教えてほしいこと, …). The data view keeps the recording tasks.
- Definition cards open the term's full detail when its name is selected.
- Business users can answer open questions in the business view. Answers are kept in the
  browser and exported as `answers-<model>-<time>.json`; under `strscape dev` they are saved
  to `answers/` next to the models instead. An answer disappears once its question is no
  longer asked by the model.

### CLI
- `questions <file>` lists the business view's open questions with stable keys (each issue
  from `assessCompletion` now has a `key`).
- `answers <file|dir>` reads exported answers and marks whether each question is still
  open; `--resolve <keys...>` removes recorded answers and deletes the file once empty.
- Builds embed each model's file name and revision, which exported answers carry.

### Skills
- `references/modeling.md`: write `question` as a plain question business users can answer
  (they see it as-is in the business view); data-team questions go in `data_mapping.gap`.
- `references/review.md`: the hand-off report mentions the データ向け switch.
- `references/answers.md`: how to record answers from business users and remove them.

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
