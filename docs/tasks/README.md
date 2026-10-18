# 任务索引：新任务从这里开始

整理日期：2026-09-24。当前源码是工作基线，不要从历史交付包随意覆盖。

| 任务 | 说明 | 主要文件 |
|---|---|---|
| 匹配与建图 | [01-matching.md](01-matching.md) | backend/matcher.py、backend/graph_builder.py |
| 可视化与布局 | [02-layout.md](02-layout.md) | frontend/app.js |
| Recipe 抽取与数据模型 | [03-extraction.md](03-extraction.md) | docs/reference/recipe_graph_prompt_reviewed.txt、data/*.json |
| 图标与状态命名 | [04-icons.md](04-icons.md) | data/icons、docs/reference/icon-scripts |
| 论文与实验记录 | [05-paper.md](05-paper.md) | docs/reference/paper、模型实验记录（待补） |
| 环境与启动 | [06-environment.md](06-environment.md) | AGENTS.md、RUN_LOCAL.md |

布局架构与新目录恢复方案见 [comparison-graph-layout-recovery-plan.md](../architecture/comparison-graph-layout-recovery-plan.md)。该文档包含数据契约、布局阶段、约束优先级、模块拆分、测试矩阵、恢复步骤和当前基线警告。

## 如何开启新任务
在 Codex 中选择同一个项目目录（含 backend、frontend 的目录），新建任务。
复制对应任务文件末尾的“新任务开场白”，再写本次具体需求。
新任务不应假设它读过此前聊天；这些文件是交接入口。
同一目录中的代码是共享的，不要让多个任务同时改同一文件。

## 每次任务结束
更新对应说明中的当前规则、实际修改、验证结果和未完成事项。
如果用户撤回方案，将它标记为已撤回，不再作为默认实现。
不把未运行的测试、未验证的视觉效果、未执行的 API 实验写成已完成。

## 当前快照
对应交付包 recipe_vis_checkpoint_2026-09-24.zip，包含当前源码、数据、图标、测试和本组文档。
包内 CHECKPOINT_MANIFEST.json 记录文件 SHA-256 与原始 Git HEAD。
它包含未提交改动，是文件快照，不是一个新 Git commit。
此前 deliverables 中的不同目录不是一组可同时覆盖使用的升级包。
