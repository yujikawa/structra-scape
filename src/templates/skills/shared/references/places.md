# Work places, and how data gets around

A work place (作業場所) is where a step is done: a business system, a department's
spreadsheet, a shared mailbox, a partner's portal, a paper ledger. Because a step creates,
reads or updates terms there, knowing the place of each step tells where the data is and
where it has to get to. How it gets there is the tacit knowledge to draw out.

## What to record, and what not

- Give each step its `place` when people say where they do it (「販売管理で契約を登録する」).
  Manual or automated does not matter and is not recorded.
- When data has to move between places, there is work that moves it — someone imports a CSV,
  a nightly job copies it, a clerk retypes it from a mail. Record that work as a step on the
  receiving place whose item has `role: receives`, with `owner` and `timing` (毎日の夜間,
  月末の締め日, 都度) as people say them. Write how it is done in `description` only as
  people describe it (「経理担当がメールで受け取ったCSVを取り込む」).
- Do not record means as a category (hand-off / file / API) and do not guess it: if nobody
  knows, leave the step out and let the open question ask.
- Leave out implementation: endpoints, file formats, field mappings and job schedules live in
  the code and the integration tools.
- What people know about the place itself goes on the place: what it holds and is the
  source of truth for, what it does not hold, who looks after it, what people call it
  (「販管」). A place is not a term: do not add a concept for a system or a spreadsheet,
  and do not draw relationships from terms to it — the steps' `place` already says where
  each term is.

## Where it lives

```text
models/
  places.yaml      the shared list of work places every domain imports
  common.yaml      shared terms
  contracts.yaml   imports: [places.yaml, common.yaml]; steps name their place
  billing.yaml     imports: [places.yaml, common.yaml]; steps name their place
```

- Create `models/places.yaml` the first time a place appears:
  `strscape init models/places.yaml --no-skills`, then replace the starter content with
  `places` and empty `concepts` / `properties` / `restrictions` in one transaction. Add it
  to `imports` of each domain whose steps name a place.
- A place first written in a domain file moves to places.yaml with
  `strscape promote models/<domain>.yaml <PlaceID> --to models/places.yaml`.
- A small process of its own is fine for work that only moves data (契約の取り込み: start →
  取り込む → end).

## Fields

- places: `id`, `name`, `description?`, `owner?` (the department in charge), `aliases?`
  (other names people use: 請求確認Excel), `question?`, `evidence?`.
- steps: `place?` (place ID), `timing?` (when the step is done).
- step items: `role` may be `receives` — the step takes the term in from another place.

## What the open questions ask

Across every model in the folder:
- a term used on a place where no step creates or receives it: 「契約は販売管理システムで作られて
  います。請求システムへは、どうやって渡っていますか？」 — answer with a receiving step;
- a receiving step for a term no other place creates, updates or receives: 「どこから受け取って
  いますか？」;
- a receiving step without `timing`, and places without a description or an owner. A place
  is asked about in places.yaml and in every model whose steps are done on it (places.yaml
  has no view of its own in the viewer); the question's target has `imported_from`, and the
  answer is recorded in that file.
`strscape overview models/ --format md` lists, per term, where it is created, received and
used, and where no way of getting there is recorded.

## Example

```json
{"operations":[
  {"op":"upsert","entity":"process","id":"ImportContracts","value":{"name":"契約の取り込み",
    "purpose":"締結した契約を翌朝までに請求システムへ反映し、請求漏れを防ぐため。",
    "steps":[
      {"id":"Start","name":"夜間の取り込み時刻になる","type":"start"},
      {"id":"Import","name":"契約を請求システムに取り込む","type":"task","owner":"情報システム部","place":"BillingSystem","timing":"毎日の夜間","items":[{"concept":"Contract","role":"receives"}]},
      {"id":"End","name":"取り込み完了","type":"end"}
    ],
    "flows":[{"source":"Start","target":"Import"},{"source":"Import","target":"End"}]}}
]}
```
