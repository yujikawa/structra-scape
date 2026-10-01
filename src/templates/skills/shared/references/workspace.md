# Files, domains and shared definitions

## Where models live

```text
models/
  common.yaml      terms used by several domains (customer, organization, contract…)
  contracts.yaml   imports: [common.yaml] + the contract domain's own terms and flows
  billing.yaml     imports: [common.yaml] + the billing domain's own terms and flows
```

- One YAML file per independent domain, directly under `models/`. The preview and the
  build read direct children only.
- Respect a file the user names, including older files outside `models/`. Never move,
  rename or merge files on your own.

## Extend, split or share?

Before adding anything, list `models/*.yaml` and `inspect` the candidates.

| Situation | Do this |
|---|---|
| The request is about a domain that already has a file | extend that file |
| A new domain with its own scope or owners | `strscape init models/<domain-slug>.yaml --no-skills`, then replace the starter content in one transaction |
| The new domain needs terms another file already defines | add that file (usually `common.yaml`) to `imports` and reference the terms; do not redefine them |
| A term defined in one domain file turns out to be used by another | move it to `common.yaml` with `strscape promote` |
| You cannot tell whether two things are the same domain | explain the tradeoff and ask |

The starter model from `init` contains an example concept (Application) and process
(Intake). Remove or replace them in the same transaction that adds the real content.

## Imports

- `imports` lists paths relative to the importing file. Imported concepts, properties and
  restrictions can be referenced (parent, domain, range, restriction target, step items).
- Imported definitions are read-only from the importing file. Change them in the file that
  owns them; the change reaches every importer.
- `strscape inspect <file>` lists what is available under `imported`.
- Processes are never imported. Imports are transitive. Cycles and duplicate IDs fail.
- A change to a shared file that would break a sibling model importing it is rejected
  (VALIDATION, with the sibling's file name in each error).
- Set imports with the `model` entity (see `cli-recipes.md`); it is the only root-level
  field besides `name` and `base` that you edit.

## Moving terms into common.yaml

Adding a term to `common.yaml` and deleting it from the domain file in two separate
transactions fails either way round (duplicate ID, or dangling references). Use one
command instead:

```bash
strscape promote models/contracts.yaml Customer Organization --to models/common.yaml --dry-run
strscape promote models/contracts.yaml Customer Organization --to models/common.yaml
```

- Moves the concepts and properties named, with their attributes and the restrictions on
  the moved concepts, adds `common.yaml` to the source's imports, and validates both files
  and their importers together.
- Creates the target when missing (`--name`, `--base` set its name and IRI).
- `DEPENDENCY` lists IDs the moved definitions depend on (`missing`). A shared file cannot
  point back into a domain file, so either move those too or reconsider what is shared.
- References from the moved definitions to things the source imports become imports of
  the target automatically.
- Moving is not a change of meaning, so agreed definitions can be moved. Mention the move
  in your report; the 変更点 view of the source shows them as removed.

## Choosing what goes into common.yaml

Share a term when two or more domains use it with the same meaning and someone can own
its definition across domains. Keep it in the domain file when only one domain uses it, or
when domains mean different things by it (then keep separate concepts and record the
difference as a question in each).
