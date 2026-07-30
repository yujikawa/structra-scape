---
name: structra-modeling
description: Create, review, and improve Structra-Scape YAML models for business problem exploration. Use when editing a Structra YAML model, adding goals, KPIs, factors, processes, events, causal effects, relations, traces, or validation states.
---

# Structra Modeling

Use YAML as the source of truth. Keep the model concise and use the user's language for model content.

1. Read the target YAML and identify the exploration question.
2. Model business outcomes with `goal` or `kpi`, drivers with `causal_variable`, work with `process`, and instantaneous facts with `event`.
3. Use `causal` edges with `polarity: "+"` or `"-"`; use `delay: true` when the effect is delayed. Mark uncertain knowledge with `validation: hypothesis`.
4. Link abstraction levels with typed `relations`; use `traces` only for intentional next investigation targets.
5. For processes, prefer `expected_duration`, `metrics`, `bottleneck`, and `bottleneck_reason` over free-text notes.
6. Run `strscape validate <model.yaml>` after every edit. Use `strscape dev <model.yaml>` to inspect the result live.

Do not add `layer`; the view is derived from `type`.
