---
name: strscape-modeling
description: Organize business workflows and the meaning of business terms into structra-scape (strscape) YAML models through the strscape CLI — definitions, aliases, attributes (data items), relationships, classification rules, process flows, data mappings and shared common.yaml definitions. Use this whenever the user wants to define or clarify business terms, build a glossary or ontology, map a 業務フロー, align business and data definitions, record open questions about meaning, or change anything under models/*.yaml, even if they do not name structra-scape.
---

# structra-scape modeling

Help business users and data engineers agree on what their words mean and how their work
flows. You write the model; they read it in the strscape viewer and correct you. A model
that records an honest question is better than one that guesses confidently.

The user's request is the message that invoked this skill (for example
`$strscape-modeling 契約受付業務を整理して`).

This skill has reference files in `.agents/skills/strscape-modeling/references/`. Open
them with the shell (`cat`) when a step below points to them:
- `modeling.md` — which construct to use; read before your first model in a session
- `workspace.md` — which file to write, imports, moving terms to common.yaml
- `cli-recipes.md` — tested patch JSON for each kind of change, and error codes
- `review.md` — checks before handing off, and the report format

## 1. Get oriented

1. Run `strscape --help` and `strscape guide`. The guide is the schema contract for the
   installed version; follow it over anything you remember. If `strscape` is not on PATH,
   tell the user it must be installed — do not hunt for source files or download a CLI.
2. List `models/*.yaml` and `strscape inspect` the candidates. Decide whether to extend a
   file, create a domain file, or share through `common.yaml` (`workspace.md`). If the
   boundary is genuinely unclear, stop and ask the user, laying out the options and their
   tradeoff, before writing anything.

## 2. Understand the work

Start from what people do — steps, owners, decisions — then the words those steps use.
Use `modeling.md` to choose between concept, attribute, property, alias, subtype, rule
and case. Ask the user only when the answer changes the model (same or different meaning,
who decides, which domain). Otherwise proceed and record what you assumed as a `question`
so it shows up in the viewer's 未確認事項.

## 3. Write through the CLI

1. `inspect` the file and keep the `revision`.
2. Build one transaction per coherent change (`cli-recipes.md`) and pass it on stdin with
   a quoted heredoc (`--patch - <<'JSON'`), so no temporary patch file lands among the
   models. Run `--dry-run` for anything large, then apply with
   `--expect-revision <revision>`.
3. Keep in mind:
   - upserts merge top-level fields; nested lists (`items`, `attributes`, `cases`,
     `values`) are replaced whole — use the `attribute` entity for single attributes
   - restrictions and flows are replaced as complete lists: copy, then edit
   - IDs never change in place; a rename is add + re-point + remove in one transaction
   - shared terms are referenced through `imports`, never redefined; move a term to
     common.yaml with `strscape promote`
4. On `AGREED_CHANGE`, stop and show the user what would change. Use
   `--allow-agreed-change` only after they confirm. On `CONFLICT`, re-inspect and rebuild.
   On `VALIDATION` or `DEPENDENCY`, fix the transaction. Do not bypass the CLI by editing
   the YAML directly or with apply_patch, and never delete a `.lock` file. If the sandbox
   blocks a write, report it instead of working around it.

## 4. Verify and report

Follow `review.md`: validate, read `strscape diff <file> --format md`, check the
open-question items you can resolve, then report in the user's language — changes,
assumptions, questions, and where to look.

Do not start `strscape dev` yourself: it runs until stopped and would block this session.
Tell the user to run `strscape dev models/` (or keep their running preview open); it
reloads when the YAML changes. If they want a file to share, run
`strscape build models/ --output dist` and point them to `dist/index.html`.

## Ground rules

- Never invent agreement (`review_state: agreed`), owners, evidence, or table and column
  names. Unknowns become questions.
- Names, descriptions and questions use the user's language; IDs stay ASCII and stable.
- Do not commit, push or publish unless the user asks.
