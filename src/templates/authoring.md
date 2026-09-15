# AI authoring guide (Claude / Codex / any YAML-capable agent)

The YAML file is the source of truth. Prefer the CLI transactions below to update it;
the dev viewer watches it. All authoring commands emit JSON, exit 1 on failure.
Read with `strscape inspect business.yaml` and retain its revision.
Use `strscape apply business.yaml --patch changes.json --expect-revision HASH`
to apply an entire transaction. Add --dry-run to validate without saving. Use - as
the patch/input filename to read JSON from stdin (avoid shell quoting large JSON).

Patch example:
```json
{"operations":[
  {"op":"upsert","entity":"concept","id":"Customer","value":{"name":"顧客"}},
  {"op":"upsert","entity":"step","process":"Intake","id":"Receive","value":{"items":[{"concept":"Customer","role":"reads"}]}}
]}
```

Entities concept/property/process/step support upsert and remove by id. Step also
requires process. Upsert merges top-level fields; nested objects and arrays replace
the entire field. Patch operations may include unset: ["example"] to remove fields.
IDs cannot be changed. To rename an ID, add the new entity, update all references,
and remove the old entity in ONE transaction. Referenced deletes fail validation.
Flows use {"op":"replace","entity":"flow","process":"Intake","value":[]}.
Restrictions use {"op":"replace","entity":"restriction","value":[]}.
These replace entire lists; include all entries you want to retain.
Data mappings are updated as the data_mapping field of concept/property upserts.

Convenience commands:
    strscape concept get business.yaml Customer
    strscape concept get business.yaml
    strscape concept upsert business.yaml Customer --input customer.json
    strscape concept remove business.yaml Customer
Replace concept with property/process/step; step requires --process ID.
All mutation commands support --dry-run and --expect-revision HASH.

On CONFLICT, read again and reconsider the changes; never blindly overwrite. On
VALIDATION, repair the transaction. A .lock file serializes CLI writers. Direct
external editors do not honor that lock, so avoid concurrent direct editing.
YAML is serialized on save: comments and formatting are not preserved. Failed
transactions leave the original bytes intact. No-op transactions do not rewrite.
Read the existing file before editing. Preserve IDs and unrelated content. Write
the complete file atomically where possible, then validate. Do not launch a second
dev server if one is already running. Never commit or push unless requested.

Commands (installed CLI; in this repository substitute `node src/index.js` for `strscape`):

    strscape init business.yaml --ontology
    strscape guide
    strscape validate business.yaml --json
    strscape dev business.yaml --port 4175
    strscape build business.yaml --output dist/business

Root: kind: ontology, name: nonempty string, base: HTTP(S) IRI ending in # or /.
Concepts and properties may also include exclusion (non-example), evidence
and cases: [{description: string, result: included|excluded|unresolved, reason?: string}].
Cases are human-authored review examples, not reasoner results. Preserve unresolved
cases until the user decides. They can be set using concept/property upsert.
(source of the definition), and data_mapping. data_mapping requires source (text)
and status (proposed or verified), with optional grain (what one row represents),
condition (implemented selection rule, text only), and gap (difference from the
business definition). Never invent actual table names or mark a mapping verified
without evidence. SQL-derived meaning is an implementation observation, not business
agreement. Use proposed for inferred mappings and record unresolved gaps. These
fields are documentation, not executable SQL or automatic database validation.
Required arrays: concepts, properties, restrictions. Optional array: processes.
IDs start with an ASCII letter, followed by letters, digits, underscores or hyphens.
Concept and property IDs share a namespace. Process IDs are unique, step IDs are
unique within each process. References must resolve.

- concepts: id, name, description?, example?, question?, review_state? (draft,
  discussion, agreed), parent? (concept ID), position? ({x, y}, finite numbers).
- properties: id, name, domain (concept ID), range (concept ID), description?,
  example?, question?, review_state?. Domain/range describe types, not input checks.
- restrictions: subject (concept ID), property (property ID), mode (necessary or
  equivalent), operator. someValuesFrom/allValuesFrom require target (concept ID).
  minCardinality/maxCardinality/cardinality require count (nonnegative integer).
  allValuesFrom does not imply existence. Cardinality counts all distinct targets.
  Equivalent conditions combine with parents as an AND. Validation checks structure,
  not logical consistency; no reasoner is included.
- processes: id, name, steps, flows.
- steps: id, name, type (start, task, decision, parallel, join, end), owner?,
  description?, position?, items? [{concept: concept ID, role: creates|reads|updates|participates}].
- flows: source (step ID), target (step ID), label? (condition or explanation).

Start by expressing the business steps, then define terms used by those steps.
Reuse concepts via items; do not duplicate definitions in each process. Mark uncertain
definitions with question and review_state: discussion. Do not invent agreement.
Use position only when explicit layout is needed. Always run validate after editing;
fix errors before reporting completion. Explain changed definitions and assumptions
to the user so they can review the diagram.
