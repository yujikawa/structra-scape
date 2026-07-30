# structra-scape

`structra-scape` は、システム思考の因果構造と業務プロセスを、Git管理しやすいYAMLで記述してHTMLで探索するためのOSSツールです。

因果ループ（なぜ起きるか）と業務フロー（どこで起きるか）を別レイヤーとして保ちながら、`links` と `link` エッジで行き来できます。

## 使い方

```bash
npm install
npm run validate
npm run build
```

生成された `dist/index.html` をブラウザで開いてください。新しいモデルは以下で作れます。

```bash
node src/index.js init my-model.yaml
node src/index.js build my-model.yaml --output dist
```

## YAMLモデル

```yaml
name: 承認プロセスの改善
nodes:
  - id: approval_wait
    name: 承認待ち時間
    type: causal_variable # goal | kpi | causal_variable | process | event
    layer: causal          # business | causal | process | event
    description: 承認完了までの待機時間
    links: [manager_approval]
    position: { x: 140, y: 330 }

  - id: manager_approval
    name: 部長承認
    type: process
    layer: process
    owner: 部長
    duration: 2 days
    position: { x: 430, y: 720 }

edges:
  - source: approval_wait
    target: manager_approval
    kind: link             # causal | flow | link
```

`kind: causal` のエッジには `polarity: "+"` または `polarity: "-"` を指定します。`process` ノードは `owner`、`duration`、`note` を保持できます。

## 現時点のMVP

- YAMLモデルの初期化・検証・単一HTMLへのビルド
- Business / Causal / Process / Event のレイヤー切替
- Goal / KPI / Causal Variable / Process / Event の描画
- 因果の正負、プロセスフロー、レイヤー間リンクの表示
- ノード選択から関連する別レイヤーへ探索

キャンバス上での直接編集やドラッグ配置は、YAMLを正本とする次の段階の機能です。
