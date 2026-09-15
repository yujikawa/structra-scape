---
name: strscape-modeling
description: Build and update Structra-Scape business-process and ontology YAML through its CLI. Use when organizing business terms, workflows, definition examples, or data mappings in a Structra model.
---

# Structra modeling

Help business users and data engineers agree on terms and workflows. Use the user's
language for names and descriptions. YAML is the persisted model; the CLI validates
and writes it, and the dev viewer follows saved changes.

## Discover the CLI and model

Use the installed `strscape` command from the user's working folder. Run
`strscape --help` and `strscape guide` before constructing a patch; the guide
describes the current schema and transaction format. If `strscape` is unavailable,
report that the CLI must be installed or made available on PATH. Do not search for
source entrypoints or download an arbitrary CLI as a fallback.

Read the requested file with `inspect <file>` to obtain the model and revision.
If no model exists, use `init <file> --ontology`, then inspect it. If several models
could be the target and context does not resolve which one, ask before modifying.
Legacy exploration models are not supported by the ontology mutation commands.

## Model the business meaning

Start from the work people do, identify the terms used, and connect steps to
concept IDs through items. Reuse IDs when updating names. Record definitions,
included/excluded examples, unresolved cases and evidence. Keep uncertain data
mappings proposed. SQL conditions observed in an implementation are not evidence
of business agreement. Do not invent real table names or agreement status.

## Write through the CLI

Use `concept|property|process|step get` for focused reads. Build a JSON transaction
for related changes and call `apply <file> --patch <json-file> --dry-run`, then
`apply <file> --patch <json-file> --expect-revision <revision>`.
Use a JSON file or stdin rather than shell-embedded JSON. Store temporary patches
in a scratch location, not among YAML models watched by a directory preview.

Example transaction for a model with an Intake process and Receive step:

```json
{"operations":[
  {"op":"upsert","entity":"concept","id":"Customer","value":{"name":"顧客","review_state":"discussion","question":"契約終了済みの法人を含めるか？"}},
  {"op":"upsert","entity":"step","process":"Intake","id":"Receive","value":{"items":[{"concept":"Customer","role":"reads"}]}}
]}
```

Upserts merge top-level fields only: arrays and nested objects replace their whole
field. Preserve existing entries when adding items or data mappings. Flows and
restrictions use replace operations on the full list; consult guide for syntax.
Related deletes and reference changes belong in one transaction. CLI validation
rejects dangling references. Saving reserializes YAML and does not retain comments.

On CONFLICT, inspect again and reconcile with the user's intent before retrying.
On VALIDATION, correct the patch. Do not remove a lock automatically or fall back
to overwriting YAML to bypass an error. Report persistent failure with its cause.

## Verify and hand off

Read the saved entities and check that the intended definitions and references
are present. Report assumptions and unresolved questions along with the result.
If a preview is needed, use `dev <file> --port <port>`; reuse an existing server
watching that file rather than launching duplicates. For document output use
`export --help`. Commit, push, and external publishing require user intent.
