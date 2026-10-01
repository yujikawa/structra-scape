# Changelog

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
