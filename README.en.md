<h1 align="center">
  <img src="src/templates/structra-scape-mark.svg" width="32" height="32" alt="structra-scape logo" valign="middle"> structra-scape
</h1>

<p align="center"><a href="README.md">日本語</a> | English</p>

`structra-scape` (CLI: `strscape`) makes visible the knowledge that lives only in people's heads: what words mean, where the boundaries are, at what point in time things are judged, how things are counted, and what the data cannot tell. An AI agent (Claude Code or Codex) turns conversations into YAML; business users and data teams read it in a single self-contained HTML viewer and share what is agreed and what is still open.

- **Terms and relationships**: definitions, aliases, included and excluded examples, evidence and agreement state; how terms relate and the rules that classify them
- **Attributes (data items)**: the values a term carries (dates, amounts, codes…) and where they live in the data
- **Business processes**: what each process is for (its purpose), steps in order, who does them, where (the work place: a system, a spreadsheet…), and the terms each step uses, with drill-down into detail flows
- **Open questions**: what is missing, undecided, not yet agreed or not yet mapped to data, and gaps in the flows (purposes, owners, decision conditions, dead ends), phrased as questions business users can answer in the viewer
- **Changes**: how the meaning changed since the last commit, with changes to agreed definitions highlighted

The YAML is the source of truth. The viewer is read-only; the model is changed by the AI or in a text editor.

![Terms and relationships: the diagram and the selected term's definition](docs/images/terms-en.png)

| Overview | Business processes | Open questions |
|---|---|---|
| ![Overview](docs/images/overview-en.png) | ![Business processes](docs/images/process-en.png) | ![Open questions](docs/images/questions-en.png) |

The viewer's menus and guidance switch between Japanese (the default) and English. Model text — term names, definitions, questions — is shown as written and never translated; the samples are written in Japanese.

## Install

Requires Node.js 22 or later.

```bash
npm install -g structra-scape
# before the package is published to npm
npm install -g github:yujikawa/structra-scape
```

## Getting started

Run `strscape init` in your project. It creates `models/business.yaml` and installs the modeling skill for Codex and Claude Code.

```text
project/
  models/business.yaml
  models/README.md                            # how to read the models (for AIs handed the YAML)
  .agents/skills/strscape-modeling/SKILL.md   # Codex
  .claude/skills/strscape-modeling/SKILL.md   # Claude Code
```

Open a new AI session and ask: `$strscape-modeling organize our contract intake` (Codex) or `/strscape-modeling organize our contract intake` (Claude Code). The AI reads the existing `models/`, extends a model for related work or creates a new domain file such as `models/contracts.yaml`, and asks when the boundary is unclear.

```bash
strscape dev models/                   # preview at http://127.0.0.1:4173; reloads when the YAML is saved
strscape build models/ --output dist   # one self-contained HTML file to share
```

- `init --codex` / `init --claude` installs only one skill; `--no-skills` creates only the YAML. Existing YAML is never overwritten.
- Add another domain with `strscape init models/contracts.yaml --no-skills`.
- `models/README.md` tells an AI that is handed only the YAML how to read it (agreed vs. draft, how to read classification rules, what to do when an imported file is missing). Share it with `models/`. Create it for an existing folder with `strscape guide --read > models/README.md`.
- Add the skill to an existing project with `strscape skills` (`--directory <folder>`, `--agent codex|claude|both`). Customized skill files are never overwritten unless you pass `--force`.

## Starting from what you already have

### A glossary spreadsheet

Save the glossary as CSV (or TSV) and give it to the AI. Following the skill, the AI adds an English ID column and imports it:

```bash
strscape import-glossary glossary-with-ids.csv > patch.json   # reads term, definition, synonyms, parent, source… columns
strscape apply models/business.yaml --patch patch.json --dry-run
```

- Headers are recognized in English or Japanese (`name` / `用語`, `description` / `定義`, `aliases` / `同義語`, `parent` / `上位語`, `evidence` / `出典`, …).
- Rows without an ID, or with a duplicate one, are refused. The CLI never invents IDs.
- An "approved" column is never imported as `agreed`: the AI confirms with you that the agreement still stands. Columns that were not imported are listed in `warnings`.

### Checking data mappings against the schema

Check that the tables and columns named in `data_mapping` exist:

```bash
strscape check-mapping models/ --schema target/catalog.json --format md   # dbt catalog.json or manifest.json
strscape check-mapping models/ --schema columns.csv                       # a CSV export of information_schema.columns
```

- The exit code is 1 when a table or column is missing, so it works in CI.
- Only names are checked. Whether the data means what the business definition says (`verified`) is for the data team to confirm.

## The viewer

The header switches models (when a folder is built) and views. Tool buttons (export, help, language, color scheme, diagram controls, the *Show* range…) are icons; hover for their names. View tabs and *Export answers* keep their text. Business users and the data team use the same view: IDs and data mappings are always visible.

| View | Shows |
|---|---|
| Overview | The entry point when several models are built together. Each domain is a box with its processes and terms; lines show what crosses domains. Below: relationships per pair of domains, a terms-by-process table, and questions across domains |
| Business processes | The flow diagram and the process tree; move from a step to the terms it uses and back |
| Terms & relationships | The relationship diagram and the definitions list. A term's detail has Meaning, Process usage and Data mapping tabs. Search covers names, IDs, aliases and attribute names |
| Open questions | Open items grouped by term and step, each with an answer box. Questions for business users come first; data-mapping work follows under *Work for the data team*, without answer boxes. The tab counts the questions |
| Changes | Under `dev`, changes since git `HEAD` by default (`--compare <revision>` / `--no-compare`); in `build`, only with `--compare <revision>` |

- **Large models**: the diagram's *Show* control narrows the view to the selected term and its neighbours (or two steps away); selecting a neighbour re-centres on it. Models with more than 40 terms open this way. In Open questions, the count tiles filter by kind and a search box filters by name or question. A workspace of 7 domains, ~400 terms and 30 flows switches views in under a second (`tests/fixtures/large-workspace.js`).
- Browser back and forward walk through the views opened (tabs, the selected term or step, the model): after opening a definition from the open questions, back returns to the questions.
- Deprecated terms and relationships are folded into one section at the bottom of the list, above the legend, and listed last in the definitions view.
- Relationship and subtype names on the overview diagram show on hover, so they do not overlap; hand-overs (creates, reads…) are always labelled.
- The page reloads when the YAML changes, keeping the view, selection and zoom. Invalid YAML keeps the last valid view and shows the error.
- The color-scheme button in the header picks System, Light or Dark (icons; System follows the OS and is the default). The choice is remembered in the browser. Diagrams keep a light sheet in dark mode. Printing gives the open view as a clean light document.
- *Export* saves the current diagram as SVG or PNG, all definitions as Markdown, and the model shown as OWL or SKOS (both RDF in Turtle). Everything except PNG can also be exported from the CLI, with the same content.

```bash
strscape export models/business.yaml --format svg --process Intake --output intake.svg
strscape export models/business.yaml --format md --concept Application --output application.md
strscape export models/business.yaml --format ttl --output business.ttl    # OWL Turtle
strscape export models/business.yaml --format skos --output glossary.ttl   # SKOS thesaurus for data catalogs
```

### What the open questions check

- **Terms and relationships**: description, included and excluded examples, evidence, agreement state. A `question` and undecided cases stay open even on agreed definitions
- **Attributes**: description, value type, code values (`type: code`), data mapping
- **Data mappings** (when recorded): verified or not, what one row represents, the selection condition, differences from the business definition
- **Agreement records**: an agreed definition that does not say who agreed and when
- **Inconsistencies**: cyclic parents, contradicting cardinalities, an alias that is another term's name or alias, deprecated terms still in use
- **Flows**: the purpose of each process, task owners, decisions with two or more labelled paths, parallel splits matched by joins; with start/end steps, steps that cannot be reached and dead ends

No open questions does not mean the model is complete: the checks are structural. Business owners still confirm the scope and the definitions.

### Answers from business users

Business users type answers in Open questions and click *Export answers* to save a JSON file (`answers-<model>-<time>.json`). Under `strscape dev` the file is saved to `answers/` next to the models instead.

```text
Business user: answers → exports (or saves through dev)
Data team:     asks the AI to take in the answers
AI (skill):    strscape answers (--patch) → apply → strscape answers --resolve
```

- Questions with a known set of answers (agreeing with a definition, included or excluded, when something is judged, whether a boundary counts, whether values add up, value types, aggregation, which term an alias means…) are answered by choice, with an optional note; the rest are free text.
- Each question shows what is recorded now (the description, and the owner of a step).
- *One question at a time* shows the questions one by one with the progress; moving on skips, while "not sure" is an answer.
- Filtering by owner shows the questions about that owner's steps and the terms and metrics they use (estimated from process owners).
- `strscape answers --patch` turns the answers given by choice into a proposed apply transaction; free text, agreement and differing answers are listed as notes for the AI and you.

- Each question lists the answers given so far: under `dev` the ones saved in `answers/`, in any build the files opened with *Open answer files*. Differing answers are marked *Answers differ*, and `strscape answers` reports them as `conflict`; the AI asks you instead of picking one.
- Answers in progress are kept in the browser and disappear once the model records them.
- The AI writes who answered and when into `evidence`. A "yes" to "Is this definition right?" becomes `agreed` only after you confirm.

## The YAML model

```yaml
# An excerpt. samples/customer-contract.yaml is a complete example.
kind: ontology
name: Customers and contracts
base: https://example.com/customer#
concepts:
  - id: Customer
    name: Customer
    aliases: [ Client, Account holder ]   # other words for the same thing
    parent: Organization                  # "is a kind of"
    description: An organization with at least one active contract.
    example: Company A has an active maintenance contract.
    exclusion: An organization whose contracts have all ended.
    question: Do ended customers get a different name?
    review_state: discussion              # draft / discussion / agreed
    evidence: 2026-09 meeting with Sales
    data_mapping:
      source: dwh.contracts
      status: proposed                    # proposed / verified
      grain: one row per contract
  - id: Organization
    name: Organization
    review_state: agreed
    agreed_by: Sales and Finance          # who agreed, and when (only with agreed)
    agreed_at: 2026-09-15
  - id: Account
    name: Account
    deprecated: true                      # retired, kept for old documents
    replaced_by: Customer                 # use this instead
  - id: Contract
    name: Contract
    attributes:                           # values a term carries (inherited by subtypes)
      - id: startDate
        name: Start date
        type: date                        # text / integer / decimal / amount / boolean / date / datetime / code / identifier
        required: true
properties:
  - { id: hasContract, name: has contract, domain: Organization, range: Contract }
restrictions:
  - { subject: Customer, property: hasContract, operator: someValuesFrom, target: Contract, mode: equivalent }
processes:
  - id: ContractProcess
    name: From application to contract
    purpose: Turn only applications that meet the conditions into contracts   # why the process exists; who suffers if it stops
    steps:
      - { id: Start, name: Receive the application, type: start }
      - id: Sign
        name: Sign the contract
        type: task                        # start / task / decision / parallel / join / end
        owner: Contracts team
        items:
          - { concept: Contract, role: creates }   # creates / reads / updates / participates
      - { id: End, name: Done, type: end }
    flows:
      - { source: Start, target: Sign }
      - { source: Sign, target: End }
```

`strscape guide` prints the full schema (written for AI agents).

- **IDs** start with a letter and use letters, digits, `_` and `-`. They stay the same when a name changes. Terms and relationships share one ID space.
- **Relationships vs. attributes**: a link between terms is a relationship (`properties`); a value such as a date or an amount is an attribute.
- **Classification rules** (`restrictions`): `someValuesFrom` (at least one), `allValuesFrom` (all of them; does not require any), `minCardinality` / `maxCardinality` / `cardinality` (number of distinct targets). `mode: equivalent` means "this is how the term is told apart"; `necessary` means "always holds".
- **Purpose**: why the process exists. The steps can be read off the flow, but the purpose usually lives only in people's heads; held against it, steps kept only out of habit, and steps missing to achieve it, stand out. A process without one appears in the open questions.
- **Detail flows**: `subprocess: ReviewDetails` on a task links to another flow for drill-down. A flow has one parent; cycles are rejected.
- **Shared definitions**: `imports: [common.yaml]` reads another file's terms, relationships and rules (read-only; processes are not imported). `strscape promote <file> <ids...> --to models/common.yaml` moves existing terms into a shared file.

### Tacit knowledge behind an analysis (time, metrics)

What an AI should know before writing SQL, and that only people know. Implementation (join
keys, SQL) is not recorded: it lives in the code and data tools and changes too often.
Everything is optional; open questions appear only for the items a model uses.

- `temporal` on a concept: `basis` (`current`, `as_of` a reference time, `period`), the
  validity `period` (attributes, `start_inclusive` / `end_inclusive`) and `timezone`.
  `effective_from` / `effective_to` are when a definition applies (not `agreed_at`).
- `data_mapping.history`: `current_only`, `snapshot` or `versioned`. `status` may also be
  `rejected` (checked and found wrong); limits and reasons go in `gap`.
- `metrics`: the counted concept, `aggregation` and `attribute` (e.g. distinct
  organization IDs), formula (text), unit, time basis, `dimensions` with `additive`, and
  `cases` in words (without `expected`, the viewer asks how to count it). The viewer shows
  what the records can answer: the current value, and values at a past moment such as last
  month-end (not answerable from `current_only` data).
- Case `judgments`: people judge examples more easily than they define words. The AI adds
  boundary examples as undecided cases; the open-questions view asks them with three
  choices (included / excluded / not sure), and the answers are recorded per department.
  Cases where departments judge differently, or differently from the decision, are shown as
  differences to reconcile. Recording judgments on an agreed definition is not a change to it.
- OWL and SKOS exports leave this out and say so in a comment at the top; the Markdown
  export includes it. See `samples/customer-contract.yaml`.

### Work places

Each step may name its work `place` (a business system, a department's spreadsheet, a
partner; usually listed in a shared `models/places.yaml`) and its `timing`. That says where
the data a step creates or uses is. Work that moves data to another place is a step on the
receiving place with `role: receives`; how it is done (by hand, a file, an API) is not
categorized or guessed. Across the folder, open questions ask how a term gets to a place
where it is used but neither created nor received. The term detail lists where a term is
created, received and used; `strscape overview` lists the places and the same per term.

A place carries what people know about it the way a term does — `description`, `owner`
(department), `aliases` (what people call it), `question`, `evidence` — but it is not a term.
In the business process view, the places this model's steps are done on are listed under
the flows: choosing one highlights its steps in the diagram and shows its description,
owner, the steps done there, the terms there and the data handed over. The step detail and
the term detail link to it, and the term search finds places by name or alias. The overview
lists every place of the folder. A places.yaml that holds only places is left out of the
model selector; questions about a place are asked in the models whose steps are done on it,
and their answers are recorded in places.yaml.

## How the AI edits, and how agreed definitions are protected

```bash
strscape inspect models/business.yaml
strscape apply models/business.yaml --patch changes.json --dry-run
strscape apply models/business.yaml --patch changes.json --expect-revision <revision>
strscape diff models/ --format md
```

- A patch is `{"operations":[{"op":"upsert","entity":"concept","id":"Customer","value":{"name":"Customer"}}]}`. Concepts, properties, attributes, processes and steps support get / upsert / remove; flows and restrictions are replaced as whole lists.
- The whole model (with its imports, and the files that import it) is validated before saving; nothing is written on failure. A lock serializes concurrent writes and `--expect-revision` rejects stale ones.
- Writes edit the YAML in place: **comments, key order and `{ }` styles are kept.**
- **Changing or removing anything with `review_state: agreed` fails with `AGREED_CHANGE`** until the user confirms and the AI passes `--allow-agreed-change`.

## Checking pull requests (GitHub Actions)

```bash
strscape ci    # writes .github/workflows/strscape.yml (--models <folder> if not models/)
```

On every pull request that touches the models, the workflow validates them, posts the changes in meaning as one comment (updated in place, also in the job summary, with agreed definitions highlighted), and attaches the viewer with the Changes view as a downloadable artifact. Add `--fail-on-agreed` to its `diff` step to stop pull requests that change agreed definitions.

## Commands

| Command | Does |
|---|---|
| `init [file]` | Create a model and install the skills (default `models/business.yaml`) |
| `skills` | Install the Codex / Claude Code skill |
| `guide [--read]` | Print the authoring guide for AIs; `--read` prints the reading guide |
| `validate <file\|dir> [--json]` | Validate one model or every model in a folder; exit code 1 on errors |
| `dev <file\|dir>` | Preview server: `--port`, `--host` (default `127.0.0.1`), `--compare <rev>` / `--no-compare` |
| `build <file\|dir>` | One self-contained HTML file: `--output`, `--compare <rev>` |
| `inspect` / `apply` / `concept` / `property` / `attribute` / `process` / `step` | Read and change the model (JSON in and out, for AIs) |
| `promote <file> <ids...> --to <file>` | Move terms into a shared file and import it |
| `overview <dir>` | Hand-overs, shared definitions and overlapping words across domains; `--format json\|md` |
| `questions <file>` | The open questions that take answers, with their keys |
| `answers <file\|dir>` | Read exported answers (`open`, `conflict`); `--patch` proposes a transaction for answers given by choice; `--resolve <keys...>` removes recorded ones |
| `import-glossary <csv>` | Turn a glossary CSV/TSV into a patch for `apply` (needs an ID column) |
| `check-mapping <file\|dir> --schema <files...>` | Check mapped tables and columns against a dbt manifest/catalog or an information_schema CSV |
| `diff <file\|dir>` | Changes in meaning: `--base <rev\|file>`, `--format json\|md`, `--fail-on-agreed` |
| `ci` | Write the GitHub Actions workflow |
| `export <file> --format svg\|md\|ttl\|skos` | Diagram, definitions, OWL Turtle or SKOS; never overwrites a file |

## Before sharing

- **A built HTML file contains the whole model**, including table and column names and imported definitions. Check it before sending it outside your organization.
- `build --compare <rev>` also embeds the **previous values** of changed fields (not the whole old model).
- `dev` listens on `127.0.0.1` and rejects other Host headers (against DNS rebinding). `--host 0.0.0.0` lets anyone on the network read the models and the saved answers.
- The skill tells the AI to treat text in models and answers as data, never as instructions.

## Limits

- No implementation details such as joins or SQL. Their source of truth is the code and the data platform.
- The viewer does not edit models; answers are recorded by the AI.
- No OWL import, reasoning or satisfiability checks. Validation covers references, input shapes and supported operators.
- Data mappings are records. No database connection or SQL; `check-mapping` only compares names with schema files.
- No simultaneous co-editing.

## Development

```bash
npm install
npm test                 # CLI, validation, writes, skills
npm run test:browser     # walks the built viewer in headless Chromium (npx playwright install chromium-headless-shell)
npm run dev              # preview samples/
npm run screenshots      # regenerate docs/images from samples/
```

Inside this repository, use `node src/index.js` wherever the docs say `strscape`. See [CHANGELOG.md](CHANGELOG.md).
