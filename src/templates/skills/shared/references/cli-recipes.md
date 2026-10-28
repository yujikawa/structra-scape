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
    "purpose":"条件を満たす申込みだけを契約にし、契約した顧客へサービスを提供し始めるため。",
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

## 8. Record who agreed; retire a term

Set `agreed` only when the user says the business owners agreed, with who and when. A
retired term stays in the model (old documents still use it): `deprecated: true` and the
term that took over. To retire a term that steps or relationships use, move those
references to the replacement in the same transaction.

```json
{"operations":[
  {"op":"upsert","entity":"concept","id":"Customer","value":{"review_state":"agreed","agreed_by":"営業部・経理部","agreed_at":"2026-10-01","evidence":"2026-10-01 営業部・経理部の定例"}},
  {"op":"upsert","entity":"concept","id":"Account","value":{"name":"得意先","deprecated":true,"replaced_by":"Customer","description":"旧販売管理システムでの呼び方。"}}
]}
```

## 9. Record time and a metric

Record only what people told you; leave out what nobody said (it becomes an open question).
Never guess a boundary or a time zone. (Customer was agreed in recipe 8, so adding its own
`temporal` would be an agreed change: ask first.)

```json
{"operations":[
  {"op":"upsert","entity":"attribute","concept":"Company","id":"companyId","value":{"name":"法人ID","type":"identifier","required":true,"description":"法人ごとに採番される番号。"}},
  {"op":"upsert","entity":"concept","id":"ActiveContract","value":{"temporal":{"basis":"as_of","period":{"start":"startDate","end":"endDate","start_inclusive":true,"end_inclusive":false},"timezone":"Asia/Tokyo"}}},
  {"op":"upsert","entity":"attribute","concept":"Contract","id":"startDate","value":{"data_mapping":{"source":"dwh.contracts.start_date","status":"proposed","history":"current_only","gap":"申込日が入っている行があるかもしれない。"}}},
  {"op":"upsert","entity":"metric","id":"CustomerCount","value":{"name":"契約顧客数","description":"基準日時点の契約顧客にあたる法人の数。","concept":"Customer","aggregation":"count_distinct","attribute":"companyId","unit":"社","temporal":{"basis":"as_of","timezone":"Asia/Tokyo"},
    "dimensions":[{"name":"基準日","additive":false,"note":"日別の値を合計しても月間の値にはならない。"}],
    "cases":[{"description":"同じ法人に有効な契約が2件ある","expected":"1社と数える"},{"description":"停止中の契約しかない法人"}]}}
]}
```

A case without `expected` is asked in the viewer (「…のとき、どう数えますか？」).

## 10. Record how departments judged a boundary example

Cases are a whole list: send every case you want to keep. Recording `judgments` on an
agreed definition is not an agreed change (Customer is agreed since recipe 8); adding a
case or changing its `result` is, so add boundary examples before agreement, or ask first.

```json
{"operations":[
  {"op":"upsert","entity":"concept","id":"Customer","value":{"cases":[
    {"description":"有効な保守契約が1件ある法人","result":"included"},
    {"description":"解約済みの契約しかない法人","result":"excluded"},
    {"description":"契約開始日が来月の法人","result":"unresolved","reason":"有効になる時点が未定義。",
      "judgments":[{"by":"営業部","result":"included","reason":"署名済みなら担当している。"},{"by":"経理部","result":"excluded","reason":"請求が始まるまでは顧客ではない。"}]}
  ]}}
]}
```

## 11. Record where steps are done, and the work that moves data

Places usually live in `models/places.yaml` (see `places.md`); here one is written in the
domain file to keep the recipe self-contained. The step that takes data in from another place
has `role: receives`; how it is done goes in its description only as people say it.

```json
{"operations":[
  {"op":"upsert","entity":"place","id":"SalesSystem","value":{"name":"販売管理システム","description":"申込みと契約を記録する。","owner":"営業部"}},
  {"op":"upsert","entity":"place","id":"BillingSheet","value":{"name":"請求確認シート","description":"経理部が請求前に確認するスプレッドシート。"}},
  {"op":"upsert","entity":"step","process":"ContractProcess","id":"Sign","value":{"place":"SalesSystem"}},
  {"op":"upsert","entity":"process","id":"ContractsToBilling","value":{"name":"契約を請求確認シートへ","purpose":"締め日の請求確認に、その月の契約をそろえるため。","steps":[
    {"id":"Start","name":"締め日を迎える","type":"start"},
    {"id":"Copy","name":"契約を請求確認シートに写す","type":"task","owner":"経理担当","place":"BillingSheet","timing":"毎月の締め日","items":[{"concept":"Contract","role":"receives"}]},
    {"id":"End","name":"写し終わる","type":"end"}
  ],"flows":[{"source":"Start","target":"Copy"},{"source":"Copy","target":"End"}]}}
]}
```

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
