<h1 align="center">
  <img src="src/templates/structra-scape-mark.svg" width="32" height="32" alt="structra-scape logo" valign="middle"> structra-scape
</h1>

`structra-scape`（CLI: `strscape`）は、業務の流れと、そこで使われる「ことば」の意味を、業務担当者とデータ担当者がそろえるためのツールです。AI（Claude Code / Codex）がYAMLに整理し、人は1ファイルのHTMLビューアで確認します。

- **ことばと関係**：用語の定義・別名・含む例／含まない例・根拠・合意状態、用語同士のつながりと分類条件
- **属性（データ項目）**：用語が持つ値（日付・金額・区分値など）と、その値が実際のデータのどこにあるか
- **業務プロセス**：作業の順番、担当、作業に登場する用語。詳細フローへ掘り下げられます
- **未確認事項**：定義の不足・未決定・未合意・データ対応の残件と、業務フローの抜け（担当、分岐条件、行き止まり）
- **変更点**：前回のコミットから意味がどう変わったか。合意済みの定義への変更は目立たせます

YAMLが正本です。ビューアは閲覧専用で、内容の変更はAIかテキストエディタで行います。

## インストール

Node.js 20以上が必要です。

```bash
npm install -g structra-scape
# npmに公開される前のバージョンを使う場合
npm install -g github:yujikawa/structra-scape
```

## 使い始める

作業フォルダで `strscape init` を実行すると、`models/business.yaml` と、Codex・Claude Code用のスキルを作成します。

```text
作業フォルダ/
  models/business.yaml
  .agents/skills/strscape-modeling/SKILL.md   # Codex
  .claude/skills/strscape-modeling/SKILL.md   # Claude Code
```

AIの新しいセッションを開き、Codexには `$strscape-modeling 契約受付業務を整理して`、Claude Codeには `/strscape-modeling 契約受付業務を整理して` と依頼します。AIは既存の `models/` を確認して、関連する業務なら既存モデルを更新し、独立した領域なら `models/contracts.yaml` などを作成します。境界を判断できない場合はAIが確認します。

```bash
strscape dev models/          # http://127.0.0.1:4173 でプレビュー。YAMLを保存すると自動で再読み込み
strscape build models/ --output dist   # 共有用の1ファイルHTMLを出力
```

- `init --codex` / `init --claude` でどちらか一方のスキルだけを入れられます。`--no-skills` はYAMLのみを作成します。既存のYAMLは上書きしません。
- 新しい領域は `strscape init models/contracts.yaml --no-skills` で追加します。
- 既存プロジェクトには `strscape skills`（`--directory <フォルダ>`、`--agent codex|claude|both`）でスキルを追加できます。独自に編集されたスキルは上書きしません。意図して更新する場合だけ `--force` を指定してください。
- スキルは `SKILL.md`（Codex版とClaude Code版で起動方法・プレビューの扱いが異なります）と、共通の参照資料 `references/`（モデル化の判断基準、ファイル分割と共通定義、動作確認済みの更新例、引き渡し前のチェック）で構成されます。

## 画面

ヘッダーで、モデル（ディレクトリを指定した場合）と表示を切り替えます。「日本語 / English」の切り替えはメニューと案内文だけが対象で、YAMLに書かれた用語名や説明は翻訳しません。

| 表示 | 内容 |
|---|---|
| ことばと関係 | 関係図と定義一覧。用語を選ぶと「意味」「業務での利用」「データとの対応」を確認できます。検索は名前・ID・別名・属性名が対象です |
| 業務プロセス | 業務フローの図と階層ツリー。作業から登場する用語へ、用語から使われている作業へ移動できます |
| 未確認事項 | 残件を用語・作業ごとにまとめて表示します。名前を押すと該当箇所へ移動します |
| 変更点 | `dev` では既定でgitのHEADと比べた変更を表示します（`--compare <revision>` / `--no-compare`）。`build` では `--compare <revision>` を指定した場合だけ表示します |

YAMLを更新すると、表示モード・選択・ズームを保ったまま再読み込みします。YAMLが不正な場合は、最後に正常だった図を表示したままエラーを知らせます。

「出力」から、現在の業務フロー／関係図をSVG・PNGで、全用語の定義をMarkdownで保存できます。CLIでも出力でき、OWL Turtle（他のオントロジーツールへの受け渡し用）も出せます（PNGはブラウザのみ）。

```bash
strscape export models/business.yaml --format svg --process Intake --output intake.svg
strscape export models/business.yaml --format md --concept Application --output application.md
strscape export models/business.yaml --format ttl --output business.ttl
```

### 未確認事項で確認すること

- **用語・つながり**：説明、含む例、含まない例、根拠、合意状態の記録。`question` と判定が未決定のケースは、合意済みでも残件に含めます
- **属性**：説明、値の種類、区分値（`type: code` の場合）、データ対応
- **データ対応**（登録した場合）：確認状態、1件が表すもの、判定条件、業務定義との差
- **不整合**：上位概念の循環、直接指定した個数条件の矛盾、別名がほかの用語の名前・別名と重なっていること
- **業務フロー**：作業の担当、分岐の行き先が2つ以上あり条件が書かれているか、並行開始と合流の対応。開始・終了を置いたフローでは、開始からたどり着けない作業と行き止まりも確認します

残件ゼロは完全性の保証ではありません。すべての論理矛盾や業務上の抜けを検出するものではないため、対象範囲と定義の妥当性は業務担当者が確認してください。

## YAMLモデル

```yaml
# 抜粋です。参照先を含む完全な例は samples/customer-contract.yaml にあります。
kind: ontology
name: 顧客と契約の定義
base: https://example.com/customer#
concepts:
  - id: Customer
    name: 契約顧客
    aliases: [ 顧客, 取引先 ]          # 同じものを指す別の呼び方
    parent: Organization               # 「〜の一種」
    description: 有効な契約を少なくとも1つ持つ法人。
    example: A社は有効な保守契約を持つため含める。
    exclusion: 過去の契約だけが残っている法人は含めない。
    question: 契約が終了した会社は別の呼び名で管理する？
    review_state: discussion           # draft / discussion / agreed
    evidence: 2026-09 営業部との打ち合わせ
    data_mapping:
      source: dwh.contracts
      status: proposed                 # proposed / verified
      grain: 1行は1契約
  - id: Contract
    name: 契約
    attributes:                        # 用語が持つ値（下位の用語にも引き継がれます）
      - id: startDate
        name: 契約開始日
        type: date                     # text / integer / decimal / amount / boolean / date / datetime / code / identifier
        required: true
      - id: status
        name: 契約状態
        type: code
        values:
          - { value: active, name: 有効 }
          - { value: terminated, name: 解約済み }
properties:
  - { id: hasContract, name: 契約を持つ, domain: Organization, range: Contract }
restrictions:
  - { subject: Customer, property: hasContract, operator: someValuesFrom, target: ActiveContract, mode: equivalent }
processes:
  - id: ContractProcess
    name: 申込みから契約まで
    steps:
      - { id: Start, name: 申込みを受け取る, type: start }
      - id: Sign
        name: 契約を締結する
        type: task                     # start / task / decision / parallel / join / end
        owner: 契約担当
        items:
          - { concept: Contract, role: creates }   # creates / reads / updates / participates
      - { id: End, name: 手続き完了, type: end }
    flows:
      - { source: Start, target: Sign }
      - { source: Sign, target: End }
```

完全な例は [samples/](samples/) にあります。項目の正式な定義は `strscape guide` が出力するAI向けの説明を参照してください。

- **ID** は英字で始まる英数字・`_`・`-` です。名前を変えてもIDは変えません。用語とつながりのIDは共通の名前空間です。
- **つながり（properties）と属性（attributes）**：用語同士を結ぶものはつながり、日付や金額など値そのものは属性にします。
- **分類条件（restrictions）**：`someValuesFrom`（少なくとも1つある）、`allValuesFrom`（相手はすべて。存在は要求しない）、`minCardinality` / `maxCardinality` / `cardinality`（重複を除いた相手の数）。`mode: equivalent` は「この条件で呼び分ける」、`necessary` は「必ず満たす」です。
- **詳細フロー**：作業に `subprocess: ReviewDetails` のように別の業務フローのIDを指定すると、図から掘り下げられます。親は1つで、循環は検証で拒否します。

### 共通定義の読み込み（imports）

複数の業務で同じ用語を使う場合は、定義を1つのファイルに置き、ほかのファイルから読み込みます。

```yaml
kind: ontology
name: 請求の定義
base: https://example.com/billing#
imports:
  - customer-contract.yaml     # このファイルからの相対パス
concepts:
  - id: Invoice
    name: 請求書
properties:
  - { id: billedTo, name: 請求先, domain: Invoice, range: Customer }   # 読み込んだ用語を参照できます
```

- 読み込んだ用語・つながり・分類条件は参照できますが、編集は元のファイルで行います。画面では「共通定義」として点線で表示します。業務フローは読み込みません。
- 読み込みは連鎖します。循環と重複IDは検証エラーになります。
- `imports` は `{"op":"upsert","entity":"model","value":{"imports":["common.yaml"]}}` で更新します。
- 既にある用語を共通定義へ移すときは `strscape promote models/contracts.yaml Customer Organization --to models/common.yaml` を使います。属性と分類条件も一緒に移し、元ファイルに読み込みを追加し、関係するファイルをまとめて検証します。移す用語が元ファイルに残る用語に依存している場合は、`DEPENDENCY` で一緒に移すべきIDを示します。
- CLIで共通定義を変更したとき、同じフォルダでそれを読み込むモデルが壊れる場合は、変更を拒否します。
- OWL Turtle 出力（`export --format ttl`）では、読み込んだ用語を元のファイルの `base` で参照し、`owl:imports` を付けます。

## AIによる更新と、合意済み定義の保護

AIは `inspect` で現在のモデルとrevisionを読み、`apply` で変更をまとめて適用します。

```bash
strscape inspect models/business.yaml
strscape concept get models/business.yaml Customer
strscape attribute upsert models/business.yaml startDate --concept Contract --input attribute.json
strscape apply models/business.yaml --patch changes.json --dry-run
strscape apply models/business.yaml --patch changes.json --expect-revision <取得したrevision>
strscape diff models/business.yaml --format md
```

- `changes.json` は `{"operations":[{"op":"upsert","entity":"concept","id":"Customer","value":{"name":"顧客"}}]}` の形式です。`concept` / `property` / `attribute` / `process` / `step` の取得・upsert・remove と、`flow` / `restriction` のリスト一括置換に対応します。`--input -` / `--patch -` で標準入力のJSONを読みます。
- 保存前にモデル全体（読み込む共通定義を含む）を検証し、失敗した場合は何も変更しません。同時に動くCLIはロックで排他し、`--expect-revision` で古いモデルへの書き込みを拒否します。
- 保存時は変更した箇所だけを書き換えます。**コメント・キーの順序・`{ }` 形式の書き方は保たれます。** ネストした値は部分マージせず置換します。
- **`review_state: agreed` の定義（その属性・分類条件を含む）を変更・削除する操作は `AGREED_CHANGE` で拒否します。** スキルは、AIが利用者に変更内容を説明し、確認を得てから `--allow-agreed-change` を付けて再実行するよう指示しています。
- `apply` の結果には、意味上の変更（`changes`）が含まれます。`diff` はgitのリビジョン（既定はHEAD）または別のYAMLファイル（`--base`）と比べます。図の配置（`position`）の変更は含みません。

元のYAMLを直接編集する場合は、CLIと同時に書き込まないでください（エディタはロックを使いません）。

## コマンド

| コマンド | 内容 |
|---|---|
| `init [file]` | モデルとスキルを作成（既定は `models/business.yaml`） |
| `skills` | Codex / Claude Code用のスキルを追加 |
| `guide` | AI向けのYAML記述ルールを表示 |
| `validate <file> [--json]` | 検証。`--json` は `{valid, errors}` を出力し、失敗時は終了コード1 |
| `dev <file\|dir>` | プレビューサーバー。`--port`、`--host`（既定 `127.0.0.1`。LANで共有する場合は `0.0.0.0`）、`--compare <rev>` / `--no-compare` |
| `build <file\|dir>` | 1ファイルのHTMLを出力。`--output`、`--compare <rev>` |
| `inspect` / `apply` / `concept` / `property` / `attribute` / `process` / `step` | AI向けの読み取り・更新（JSON入出力） |
| `promote <file> <ids...> --to <file>` | 用語を共通定義ファイルへ移し、読み込みを追加 |
| `diff <file>` | 意味上の変更点。`--base <rev\|file>`、`--format json\|md` |
| `export <file> --format svg\|md\|ttl` | 図（SVG）、定義（Markdown）、OWL Turtle を出力。既存ファイルへの上書きは拒否 |

## できないこと

- 画面上での編集はできません（閲覧専用です）。
- OWLの読み込み、推論、論理的な充足可能性の検査はしません。構造検証は参照・入力形式・対応演算子のみを確認します。`domain` / `range` は入力チェックではなく型の定義です。
- データ対応は記録のみです。データベースへの接続やSQLの実行による検証はしません。
- 同時の共同編集はできません。

## 開発

```bash
npm install
npm test                 # CLI・検証・更新・スキルのテスト
npm run test:browser     # ビルドした画面をヘッドレスChromiumで全表示確認（未導入なら npx playwright install chromium-headless-shell）
npm run dev              # samples/ をプレビュー
```

リポジトリ内では `strscape` を `node src/index.js` に読み替えてください。変更履歴は [CHANGELOG.md](CHANGELOG.md) にあります。
