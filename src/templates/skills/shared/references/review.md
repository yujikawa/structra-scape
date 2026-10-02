# Before handing off

## Check

1. `strscape validate <file> --json` returns `{"valid":true}` for every file you touched.
   When you changed a shared file, validate the files that import it too.
2. `strscape diff <file> --format md` shows exactly the changes you intended — nothing
   removed by accident, no agreed definition touched without the user's confirmation.
3. Walk the open-questions checks the viewer runs, and fix what you can fix from what the
   user told you. Leave the rest as explicit questions rather than guesses:
   - each concept, property and attribute has a `description`; each attribute has a `type`
     and each `code` attribute its `values`
   - each concept or property has an included and an excluded example (or `cases`)
   - `evidence` says where the definition came from
   - no alias equals another term's name or alias
   - every task has an `owner`; every decision path has a `label`; parallel splits and
     joins have two or more paths; flows with start/end reach the end without dead ends
   - data mappings are `proposed` unless verified, with `grain`, `condition` and `gap`
     where known
4. Open questions do not have to reach zero. A remaining question that names exactly what
   needs deciding is a good result; a confident guess is not.

## Report to the user

Write in the user's language. Keep it short and concrete:

```markdown
## 変更内容
- 追加：契約顧客（Customer）— 有効な契約を1つ以上持つ法人。別名：顧客、取引先
- 追加：契約の属性 契約開始日・契約状態（区分値：有効／解約済み）
- 変更：申込みから契約まで — 「審査結果」に審査OK／審査NGの条件を記載
- 移動：法人（Organization）を common.yaml へ（契約・請求の両方で使うため）

## 仮定したこと
- 「顧客」と「取引先」は同じ意味として別名にしました（会話から判断）

## 確認したいこと
- 契約開始日が未来の法人を契約顧客に含めますか？
- 審査の担当は営業担当ですか、審査部ですか？

## 確認方法
`strscape dev models/` を開き、「変更点」と「未確認事項」タブを見てください。
IDとデータ対応の残件は、ヘッダーで「データ向け」に切り替えると表示されます。
```

Mention any agreed definitions that changed (and that the user confirmed them), any file
created or any term moved between files, and anything you could not do.
