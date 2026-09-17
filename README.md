<h1 align="center">
  <img src="src/templates/structra-scape-mark.svg" width="32" height="32" alt="structra-scape logo" valign="middle"> structra-scape
</h1>

`structra-scape` は、AIがYAMLで記述した業務プロセスとオントロジーを、画面で確認するツールです。

## AIと一緒に作る

### 作業フォルダを初期化する

CLIをインストールした環境で、作業フォルダから `strscape init` を実行すると、`models/business.yaml` と両AIのスキルを作成します。

```text
作業フォルダ/
  models/business.yaml
  .agents/skills/strscape-modeling/SKILL.md
  .claude/skills/strscape-modeling/SKILL.md
```

Codexには `$strscape-modeling 契約受付業務を整理して`、Claude Codeには `/strscape-modeling 契約受付業務を整理して` と依頼します。AIは既存の `models/` を確認し、関連業務なら既存モデルを更新、独立領域なら `models/contracts.yaml` などを作成します。判断できない境界は確認します。生成後はそのフォルダでAIの新しいセッションを開いてください。

`strscape dev models/` で直下の複数YAMLをプルダウンで切り替えられます。新規モデルは `strscape init models/contracts.yaml --no-skills` で追加できます。ファイル間の概念参照には未対応のため、共通定義を共有する業務は同じモデルにまとめてください。既存のルート直下のYAMLは自動移動せず、そのまま利用できます。

`init --codex` / `init --claude` で片方を選択、`--no-skills` でYAMLのみ作成できます。既存YAMLは上書きしません。従来の探索モデルは `init --exploration` で作成します。`--ontology` は互換用に残り、オントロジーが既定です。

既存プロジェクトには `strscape skills` で両スキルを追加できます。`--directory <フォルダ>` と `--agent codex|claude|both` に対応します。独自編集されたスキルは上書きせず停止します。意図的な更新時のみ `--force` を指定してください。スキル本文はパッケージ内の共通テンプレートから配布します。

### 未確認事項

オントロジー閲覧画面のヘッダーで「日本語 / English」を切り替えられます。メニュー・案内・未確認事項の自動メッセージが切り替わり、選択はブラウザに保存されます。YAMLに記録した用語名や説明、質問は翻訳・変更しません。出力ファイルと旧探索モデルの画面はこの切り替えの対象外です。

「ことばと関係」「業務プロセス」と並ぶ「未確認事項」で、用語・関係ごとにまとめた未決定事項、定義の不足、未合意、不整合、データ対応の残件を確認できます。ボタンには残件数を表示し、用語名から該当する定義へ移動できます。

確認条件は、説明・含む例・含まない例・根拠・合意状態の記録です。例は `example` / `exclusion` または `cases` の included / excluded で記録します。`question` や unresolved のケースは合意済みでも残件に含めます。データ対応は任意ですが、登録した場合は確認状態・粒度・判定条件・未解決の差を確認します。

残件ゼロは完全性の保証ではありません。対象業務の範囲と定義の妥当性は業務担当者が確認してください。すべての論理矛盾や業務上の抜けを自動検出する機能ではありません。決定した内容は根拠や具体例とともにYAMLへ反映してください。

### ドキュメントへの掲載

画面上部の「出力」から現在の業務フロー／オントロジー図をSVG・PNGで保存し、全用語の説明をMarkdownで保存できます。図は白背景の掲載用レイアウトです（画面上の配置を完全再現するものではありません）。タイトルと出力日時を含みます。

```bash
node src/index.js export business.yaml --format svg --process Intake --output intake.svg
node src/index.js export business.yaml --format md --concept Application --output application.md
```

指定IDを省略するとオントロジー図／全用語が対象です。CLIはSVGとMarkdown、PNGはブラウザから出力できます。既存ファイルへの上書きは拒否します。貼り付けた成果物は自動同期されないため、YAML変更後は再出力してください。

### AI向け更新CLI

AIは `inspect` で現在のモデルとrevisionを読み、`apply` で変更を一括適用します。

```bash
node src/index.js inspect business.yaml
node src/index.js concept get business.yaml Customer
node src/index.js concept upsert business.yaml Customer --input customer.json
node src/index.js apply business.yaml --patch changes.json --dry-run
node src/index.js apply business.yaml --patch changes.json --expect-revision <取得したrevision>
```

`changes.json` は `{"operations":[{"op":"upsert","entity":"concept","id":"Customer","value":{"name":"顧客"}}]}` の形式です。
concept/property/process/step の取得・upsert・remove、flow/restriction のリスト一括置換に対応します。stepには `--process`、一括適用内では `process` を指定します。
詳しい形式は `node src/index.js guide` にあります。`--input -` / `--patch -` は標準入力のJSONを読みます。

保存前にモデル全体を検証し、失敗時は変更しません。同時CLI更新はロックで排他し、revisionで古いモデルへの更新を拒否できます。保存時にYAMLを再生成するためコメント・書式は保持されません。ネストした値は部分マージせず置換します。元YAMLを直接編集する場合はCLIと同時に書き込まないでください。

Claude / Codexに `strscape guide` の出力と編集するYAMLを読ませ、業務とことばの定義を整理します。リポジトリ内では `strscape` を `node src/index.js` に置き換えてください。

```bash
strscape init business.yaml --ontology
strscape guide
strscape validate business.yaml --json
strscape dev business.yaml --port 4175
```

`--json` は `{valid, errors}` を出力し、検証失敗時は終了コード1を返します。AIへの依頼例：

> guideを読み、business.yamlに契約受付業務と登場することばを整理してください。既存IDを維持し、不明点をquestionに記載し、最後にvalidate --jsonで検証してください。

オントロジー画面は閲覧専用です。作業から用語の定義へ、用語から使用箇所へ移動できます。YAML更新時には再読み込みし、表示モード・選択・ズームを復元します。不正なYAMLの場合は最後の正常な図を表示し、エラーを通知します。テンプレートのコード変更後はdevサーバーを再起動してください。

以下の画面編集・YAMLダウンロードについての記述は旧編集画面の仕様です。現在の閲覧画面ではAIやテキストエディタで元YAMLを更新します。

因果ループ（なぜ起きるか）と業務フロー（どこで起きるか）を独立して表現し、`relations` と `traces` を通じて抽象と具体を往復できます。作図ツールではなく、構造をたどるための **Problem Exploration Tool** です。

## 使い方

```bash
npm install
npm run validate
npm run build
```

生成された `dist/index.html` をブラウザで開いてください。新しいモデルは以下で作れます。

```bash
strscape init my-model.yaml
strscape build my-model.yaml --output dist
```

## AI-driven modeling and live preview

Create a model together with a project-local Codex skill:

```bash
strscape init model.yaml --codex
```

This installs `.agents/skills/strscape-modeling/SKILL.md`. It guides the AI through CLI-based ontology and business-process modeling, validation, and handling unresolved definitions.

Start a live preview while the agent edits the YAML:

```bash
strscape dev model.yaml
# http://localhost:4173
```

The browser reloads automatically whenever the YAML file changes. Use `--port 5000` to choose another port.

To preview multiple models, pass a directory. When more than one YAML file is found, the viewer shows a model selector in its header.

```bash
strscape dev samples/
strscape build samples/ --output dist
```

## YAMLモデル

```yaml
name: 承認プロセスの改善
nodes:
  - id: approval_wait
    name: 承認待ち時間
    type: causal_variable # goal | kpi | causal_variable | process | event
    description: 承認完了までの待機時間
    relations:
      - target: manager_approval
        type: occurs_in
    validation: hypothesis
    position: { x: 140, y: 330 }

  - id: manager_approval
    name: 部長承認
    type: process
    owner: 部長
    expected_duration: 2 days
    bottleneck: true
    metrics:
      average_duration: 2 days
      throughput: 250/day
    position: { x: 430, y: 720 }

edges:
  - source: approval_wait
    target: customer_satisfaction
    kind: causal            # causal | flow
    polarity: "-"
```

`type` から表示ビューが決まるため、`layer` は指定しません。`kind: causal` のエッジには `polarity: "+"` または `polarity: "-"` を指定します。因果効果に時間遅れがある場合は `delay: true`（または期間文字列）を指定できます。ビューアでは二重線 `∥` で表示されます。

- `relations` はモデル上の意味関係です。常に双方向に探索できます（`occurs_in`、`affects`、`derived_from`、`produces`、`consumes`）。
- `traces` はRelationでは表せない、UI上で優先して提示する掘り下げ先です。通常の関係は `relations` のみで十分です。
- `validation` は知識の検証状態です（`hypothesis` / `observed` / `validated` / `rejected`）。仮説の因果エッジは破線で示します。

Processは `owner`、`expected_duration`、`metrics`、`bottleneck` を保持できます。`expected_duration` は期待値、`metrics.average_duration` は実績平均です。`metrics` は任意のキーを使える拡張可能なマップです（例: `p95_duration`、`queue_length`、`error_rate`、`cost`）。

Processは継続する業務・工程、Eventはその処理の前後で一瞬発生する出来事です。たとえば `ApprovalCompleted` は「承認」というProcessそのものではなく、承認完了を通知・記録するEventです。

## 現時点のMVP

### ことばと関係の共同確認・編集

「みんなで確認」では意味・具体例・相談事項・考え中／要相談／合意済みをカードで確認できます。これらは description / example / question / review_state に保存され、図の配置は position に保存されます。合意状態は手動の話し合い記録です。「内容を反映」でモデルへ反映し、「YAMLを保存」で保存します。

```bash
node src/index.js dev samples/ontology/customer-contract.yaml
node src/index.js build samples/ontology/customer-contract.yaml --output dist/ontology
node src/index.js owl samples/ontology/customer-contract.yaml --output dist/ontology/customer.ttl
```

`kind: ontology` のモデルは専用のオントロジー編集画面で開きます。概念・上位概念・オブジェクト関係を図で確認し、業務名・説明・関係の条件を編集できます。編集内容はメモリ上に保持され、**「YAMLを保存」でダウンロード**します。元ファイルへの自動上書きはしません。保存したYAMLを再度開いて編集を続けられます。

対応条件は `someValuesFrom` / `allValuesFrom` / `minCardinality` / `maxCardinality` / `cardinality`。必要条件は `subClassOf`、必要十分条件は `equivalentClass` として出力します。同じ概念の必要十分条件が複数あるときは、上位概念と合わせた一つのAND式になります。個数制限は条件付き個数ではなく、関係先全体に対する制限です。

画面ではOWL表示・出力を外し、YAMLを正本としています。従来のOWL出力CLIは互換用に残っています。OWLのインポート、任意のOWLの往復編集、推論、実データの検証、Snowflakeとの対応付け、同時共同編集は未実装です。構造検証は参照・入力形式・対応演算子を検査し、論理的な充足可能性までは検査しません。`allValuesFrom` は関係先の存在を要求しません。`domain` / `range` は入力チェックではなく型の推論に使う定義です。

モデルは `concepts`（id / name / description / parent）、`properties`（id / name / description / domain / range）、`restrictions`（subject / property / operator / targetまたはcount / mode）の3配列で管理します。IDは英字から始まる英数字・ハイフン・アンダースコアです。`mode` は `necessary` または `equivalent`。モデル例は `samples/ontology/customer-contract.yaml` を参照してください。探索モデルとオントロジーモデルは別々にビルドします。

### オントロジーと業務プロセスを一つのYAMLで作る

1. `concepts` に、業務で意味をそろえたいものを追加します。`id` は名前を変更しても変えない共通識別子です。`parent` は「〜の一種」を表します。
2. `properties` に概念同士のつながりを追加します。`domain` が始点、`range` が相手です。
3. `restrictions` に分類条件を追加します。たとえば `someValuesFrom` は「その種類の相手が少なくとも一つある」、`allValuesFrom` は「相手がすべてその種類である」を表します。`mode: equivalent` は、その条件で概念を呼び分ける設定です。
4. `processes` に業務フローを追加します。`steps` が作業、`flows` が順番です。`type` は `start`、`task`、`decision`、`parallel`、`join`、`end` から選びます。
5. 作業の `items` で、オントロジーの概念IDを参照します。`role` は `creates`（作成）、`reads`（参照）、`updates`（更新）、`participates`（参加）です。

最小例は次の形です。

```yaml
concepts:
  - id: Contract
    name: 契約
properties: []
restrictions: []
processes:
  - id: SignContract
    name: 契約締結
    steps:
      - id: Sign
        name: 契約を締結する
        type: task
        items:
          - concept: Contract
            role: creates
    flows: []
```

作成・検証・表示は次のコマンドです。

```bash
strscape validate samples/ontology/customer-contract.yaml
strscape build samples/ontology/customer-contract.yaml --output dist/ontology
strscape dev samples/ontology/customer-contract.yaml
```

画面では「オントロジー」と「業務プロセス」のモードを切り替えます。業務プロセスの作業から登場する概念を開くと定義へ移動でき、概念側の「登場する業務」から該当作業へ戻れます。

- YAMLモデルの初期化・検証・単一HTMLへのビルド
- typeから導出する Business / System / Process / Event ビューの切替
- Goal / KPI / Factor / Process / Event の描画
- 因果の正負、プロセスフロー、意味付きRelationの表示
- TraceとRelationを使った別の抽象度への探索

キャンバス上での直接編集やドラッグ配置は、YAMLを正本とする次の段階の機能です。
