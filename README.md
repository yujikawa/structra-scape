<h1 align="center">
  <img src="src/templates/structra-scape-mark.svg" width="32" height="32" alt="structra-scape logo" valign="middle"> structra-scape
</h1>

`structra-scape` は、ビジネス課題・因果構造・業務プロセスを結び付け、問題を探索するためのYAML駆動OSSツールです。

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

This installs `.codex/skills/structra-modeling/SKILL.md`. It instructs an AI agent to treat YAML as the source of truth, use structured process metadata, mark hypotheses with `validation`, validate every edit, and avoid redundant `layer` fields.

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
