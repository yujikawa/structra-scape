# 探索モデル（旧形式）

`kind: ontology` を指定しないYAMLは、因果ループと業務フローを扱う旧形式の「探索モデル」として読み込まれます。新規作成は `strscape init <file> --exploration` で行えます。オントロジー用の更新CLI（`inspect` / `apply` など）、未確認事項、変更点の表示には対応していません。オントロジーモデルと同じビルドに混在させることはできません。

因果ループ（なぜ起きるか）と業務フロー（どこで起きるか）を独立して表現し、`relations` と `traces` を通じて抽象と具体を往復できます。作図ツールではなく、構造をたどるための **Problem Exploration Tool** です。

```bash
strscape init my-model.yaml --exploration
strscape validate samples/support-backlog-loop.yaml
strscape build samples/support-backlog-loop.yaml --output dist
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

画面では次の操作ができます。

- typeから導出する Business / System / Process / Event ビューの切替
- Goal / KPI / Factor / Process / Event の描画
- 因果の正負、プロセスフロー、意味付きRelationの表示
- TraceとRelationを使った別の抽象度への探索
