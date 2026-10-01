# Modeling decisions

How to turn what the user says about their work into a structra-scape model. The YAML
syntax is in `strscape guide`; this file is about choosing the right construct.

## Contents
1. Work first, then words
2. Which construct? (decision table)
3. Writing a definition
4. Process flows
5. Data mappings
6. IDs and names

## 1. Work first, then words

Start from what people do: who starts the work, which steps follow, where it branches,
who does each step, and when it ends. Then list the words those steps use and define
each once. Connect steps to the concepts they create, read, update or involve through
`items`. A concept nobody's work touches is often out of scope or a sign of a missing step.

## 2. Which construct?

| What the user describes | Model it as | Example |
|---|---|---|
| A thing people identify, count or track on its own | concept | 契約, 請求書, 法人 |
| A value that describes a concept | attribute on that concept | 契約開始日 (date), 請求金額 (amount) |
| A value with a fixed list of options | attribute `type: code` with `values` | 契約状態: active / suspended / terminated |
| A link between two things | property (domain → range) | 請求書 → 請求先 → 契約顧客 |
| "X is a kind of Y" | concept with `parent` | 契約顧客 is a kind of 法人 |
| A rule that decides whether something belongs to a concept | restriction, `mode: equivalent` | 契約顧客 = 法人 with at least one 有効契約 |
| A rule every member must satisfy, without defining membership | restriction, `mode: necessary` | a 請求書 has exactly one 請求先 |
| Another word people use for the same thing | `aliases` of that concept | 顧客, 取引先 for 契約顧客 |
| The same word used for different things | separate concepts with distinct names, plus a `question` | 「顧客」 meaning 契約顧客 in sales but 見込み客 in marketing |
| A borderline example someone asked about | `cases` with included / excluded / unresolved | 「契約開始日が来月の法人」→ unresolved |
| Something nobody has decided yet | `question` (on the concept, attribute or step) | 停止中の契約は有効契約に含める？ |

Rules of thumb:
- Attribute or concept? If it has its own definition, lifecycle or identity (people talk
  about "the" address and change it independently), make it a concept and link it. If
  it is just a value read off the concept, make it an attribute.
- A status attribute and a subtype often coexist: `Contract.status` is the recorded
  value; `ActiveContract` is the business meaning. Do not equate them silently — record
  the link in the subtype's `data_mapping.condition` and any difference in `gap`.
- Put an attribute on the most general concept it applies to; subtypes inherit it.
- Properties are directional verb phrases from the domain's side (「契約を持つ」,
  「請求先」), not nouns for the target.
- Do not create a concept per synonym, and do not use aliases to paper over a real
  disagreement about meaning. Ask.

## 3. Writing a definition

- `description`: what makes something a member, in one or two sentences a new employee
  could apply. Avoid circular definitions (「契約顧客とは契約している顧客」).
- `example` / `exclusion`, or `cases`: at least one thing that is in and one that is out.
  Exclusions near the boundary are the most valuable.
- `evidence`: where the definition came from (a meeting, a document, a person's role).
  Write "assumption by AI from <source>" when you inferred it.
- `question`: anything you had to guess. A concept with a question gets
  `review_state: discussion`.
- `review_state`: leave `draft` (or omit) for new definitions. Set `agreed` only when the
  user states that the business owners agreed. Never infer agreement from confidence.

## 4. Process flows

- Use `start` and `end` steps for every flow you model end to end; the open-questions view
  then checks reachability and dead ends.
- `task` steps get an `owner`: a role or team (営業担当), not a person's name. If unknown,
  leave owner out and put the question on the step.
- A `decision` has two or more outgoing flows, each with a `label` stating the condition
  (審査OK / 審査NG). A `parallel` split has two or more outgoing flows and is closed by a
  `join` with two or more incoming flows.
- A step that is itself a multi-step procedure becomes a separate process referenced by
  `subprocess` (tasks only, one parent per detail flow). Split when a flow grows beyond
  roughly 7–9 steps or mixes levels of detail.
- `items` roles: `creates` (the step brings it into existence), `updates`, `reads`,
  `participates` (a party or actor involved). Prefer one precise role per concept and step.

## 5. Data mappings

Data mappings document where a business definition lives in data; they are not proof.
- Concept-level `data_mapping`: the table or row set and its grain (「1行は1契約」).
  Attribute-level: the column.
- `status: proposed` unless the user or a data owner confirmed it. `verified` requires
  evidence you can cite.
- `source` must come from what the user gave you or what is visible in the repository
  (SQL, dbt models, schema files). Never invent table or column names; if you only know
  the concept exists in data somewhere, leave the mapping out and add a question.
- `condition`: how the implementation selects members (text, not executable).
  `gap`: how that differs from the business definition. An SQL filter is an observation
  about the implementation, never evidence of business agreement.

## 6. IDs and names

- IDs are stable keys shared with data engineers: concept `PascalCase` (`ActiveContract`),
  property and attribute `camelCase` (`hasContract`, `startDate`), process and step
  `PascalCase` (`Billing`, `IssueInvoice`). ASCII letters first, then letters, digits, `_`, `-`.
- Names, descriptions and questions use the user's language.
- Renaming is a name change; the ID stays. Change an ID only when it is wrong, using the
  rename recipe in `cli-recipes.md`.
