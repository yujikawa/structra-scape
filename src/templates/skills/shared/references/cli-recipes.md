# CLI recipes

Every write goes through the CLI so it is validated, locked and checked against the
revision you read. Pass patches on stdin with a quoted heredoc, so no temporary file is
left among the models and the shell does not touch `$` or quotes inside the JSON:

```bash
strscape apply models/contracts.yaml --expect-revision <revision> --patch - <<'JSON'
{"operations":[ ... ]}
JSON
```

Add `--dry-run` first for large transactions. All recipes below are one scenario applied
in order to a file created with `strscape init models/contracts.yaml --no-skills`; adapt
the IDs to the real model.

## Read before writing

```bash
strscape inspect models/contracts.yaml            # model + revision (+ imported definitions)
strscape concept get models/contracts.yaml Customer
strscape attribute get models/contracts.yaml --concept Contract
strscape step get models/contracts.yaml --process ContractProcess
```

## 1. Replace the starter content with a first model

One transaction: terms, a link, a classification rule and the flow that uses them; the
starter's example concept and process are removed in the same transaction.

```json
{"operations":[
  {"op":"upsert","entity":"model","value":{"name":"契約の業務"}},
  {"op":"upsert","entity":"concept","id":"Organization","value":{"name":"法人","description":"契約の当事者となる組織。名称が変わっても同じ法人として扱う。"}},
  {"op":"upsert","entity":"concept","id":"Contract","value":{"name":"契約","description":"法人と当社の間で結ぶ、サービス提供の合意。","attributes":[
    {"id":"startDate","name":"契約開始日","type":"date","required":true,"description":"契約の効力が始まる日。"},
    {"id":"status","name":"契約状態","type":"code","description":"契約の手続き上の状態。","values":[{"value":"active","name":"有効"},{"value":"terminated","name":"解約済み"}]}
  ]}},
  {"op":"upsert","entity":"concept","id":"Customer","value":{"name":"契約顧客","parent":"Organization","aliases":["顧客","取引先"],"description":"有効な契約を少なくとも1つ持つ法人。","question":"契約開始日が未来の法人を含めるか？","review_state":"discussion"}},
  {"op":"upsert","entity":"property","id":"hasContract","value":{"name":"契約を持つ","domain":"Organization","range":"Contract"}},
  {"op":"replace","entity":"restriction","value":[
    {"subject":"Customer","property":"hasContract","operator":"someValuesFrom","target":"Contract","mode":"equivalent"}
  ]},
  {"op":"upsert","entity":"process","id":"ContractProcess","value":{"name":"申込みから契約まで",
    "steps":[
      {"id":"Start","name":"申込みを受け取る","type":"start"},
      {"id":"Review","name":"内容を審査する","type":"task","owner":"営業担当","items":[{"concept":"Organization","role":"reads"}]},
      {"id":"Decision","name":"審査結果","type":"decision"},
      {"id":"Sign","name":"契約を締結する","type":"task","owner":"契約担当","items":[{"concept":"Contract","role":"creates"},{"concept":"Organization","role":"participates"}]},
      {"id":"Reject","name":"見送りを通知する","type":"end"},
      {"id":"End","name":"手続き完了","type":"end"}
    ],
    "flows":[
      {"source":"Start","target":"Review"},
      {"source":"Review","target":"Decision"},
      {"source":"Decision","target":"Sign","label":"審査OK"},
      {"source":"Decision","target":"Reject","label":"審査NG"},
      {"source":"Sign","target":"End"}
    ]}},
  {"op":"remove","entity":"process","id":"Intake"},
  {"op":"remove","entity":"concept","id":"Application"}
]}
```

## 2. Add or change one attribute

The `attribute` entity touches one attribute and keeps the others. (A concept upsert with
`attributes` would replace the whole list.)

```json
{"operations":[
  {"op":"upsert","entity":"attribute","concept":"Contract","id":"endDate","value":{"name":"契約終了日","type":"date","description":"契約の効力が終わる日。自動更新の契約では未設定。"}},
  {"op":"upsert","entity":"attribute","concept":"Contract","id":"startDate","value":{"data_mapping":{"source":"dwh.contracts.start_date","status":"proposed","gap":"申込日が入っている行があるかもしれない。"}}}
]}
```

Only use a `source` the user gave you or that you saw in the repository.

## 3. Add a subtype and a rule (restrictions are a whole list)

Restrictions have no IDs: `replace` sends the complete list. Copy the existing entries
from `inspect` and append.

```json
{"operations":[
  {"op":"upsert","entity":"concept","id":"ActiveContract","value":{"name":"有効契約","parent":"Contract","description":"基準日時点で効力のある契約。"}},
  {"op":"replace","entity":"restriction","value":[
    {"subject":"Customer","property":"hasContract","operator":"someValuesFrom","target":"ActiveContract","mode":"equivalent"}
  ]}
]}
```

## 4. Change a step's terms or a flow (nested lists are replaced)

`items` and `flows` are replaced as a whole: send every entry you want to keep.

```json
{"operations":[
  {"op":"upsert","entity":"step","process":"ContractProcess","id":"Sign","value":{"items":[{"concept":"Contract","role":"creates"},{"concept":"Customer","role":"participates"}]}},
  {"op":"replace","entity":"flow","process":"ContractProcess","value":[
    {"source":"Start","target":"Review"},
    {"source":"Review","target":"Decision"},
    {"source":"Decision","target":"Sign","label":"審査OK"},
    {"source":"Decision","target":"Reject","label":"審査NG"},
    {"source":"Sign","target":"End","label":"署名済み"}
  ]}
]}
```

## 5. Record a borderline case and an open question; remove a field

```json
{"operations":[
  {"op":"upsert","entity":"concept","id":"Customer","value":{"cases":[
    {"description":"有効な保守契約が1件ある法人","result":"included"},
    {"description":"解約済みの契約しかない法人","result":"excluded"},
    {"description":"契約開始日が来月の法人","result":"unresolved","reason":"有効になる時点が未定義。"}
  ]}},
  {"op":"upsert","entity":"step","process":"ContractProcess","id":"Review","value":{"question":"審査の担当は営業担当か、審査部か？"},"unset":["owner"]}
]}
```

## 6. Rename an ID

IDs cannot change in place. Add the new entity, move every reference, remove the old
one — all in one transaction (validation fails on any reference you missed).

```json
{"operations":[
  {"op":"upsert","entity":"concept","id":"Company","value":{"name":"法人","description":"契約の当事者となる組織。名称が変わっても同じ法人として扱う。"}},
  {"op":"upsert","entity":"concept","id":"Customer","value":{"parent":"Company"}},
  {"op":"upsert","entity":"property","id":"hasContract","value":{"domain":"Company"}},
  {"op":"upsert","entity":"step","process":"ContractProcess","id":"Review","value":{"items":[{"concept":"Company","role":"reads"}]}},
  {"op":"remove","entity":"concept","id":"Organization"}
]}
```

## 7. Import shared definitions

```json
{"operations":[
  {"op":"upsert","entity":"model","value":{"imports":["common.yaml"]}}
]}
```

The `model` entity accepts only `name`, `base` and `imports` (and `unset` of them). To
move existing terms into `common.yaml`, use `strscape promote` (see `workspace.md`).

## When a command fails

Every command prints JSON; `ok: false` comes with `code` and `errors`.

| code | Meaning | What to do |
|---|---|---|
| `VALIDATION` | The result would be invalid (bad reference, type, duplicate ID, broken importer) | Fix the transaction; errors name the item. Do not edit the YAML by hand to get around it |
| `CONFLICT` | The file changed since your `inspect` | `inspect` again, reconcile with the user's intent, rebuild the patch |
| `AGREED_CHANGE` | The change touches an agreed definition | Stop. Show the user `errors` and ask. Retry with `--allow-agreed-change` only after they confirm |
| `DEPENDENCY` | `promote` would leave the shared file pointing into the domain file | Move the IDs in `missing` too, or rethink what is shared |
| `LOCKED` | Another CLI write is running | Wait and retry. Never delete the `.lock` file yourself |
| `NOT_FOUND` | Unknown ID or parent | Check IDs with `inspect`; steps need `process`, attributes need `concept` |
