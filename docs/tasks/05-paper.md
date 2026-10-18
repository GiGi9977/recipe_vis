# 05 论文与实验记录

## 已保存材料
- docs/reference/paper/section_3_1_original.txt：用户粘贴的原 3.1 文本。
- docs/reference/paper/branch_context_paragraph.md：用户要求的 match rules 前置概念段落。
- docs/reference/paper/llm_methods_draft.md：可复现性方法段落草稿，含待填项。
原 PDF：Beyond_Linear_Recipes_A_Visualization_for_Comparing_Procedural_Variants.pdf，位于用户 Downloads；本包没有复制或修改 PDF。

## 写作要求
- match rules 前用概念性语言说明局部 ingredient–action 语义与全局分支位置。
- 解释相同调料/操作序列可能在多个分支重复出现，需要先确定分支语境，再在对应分支内比较。
- 这一概念段落不写算法、变量、集合判断或实现细节。
- 模型部分可说明独立准备分支、汇合、实体连续性；不要把布局规则写成语义模型。

## 待同步的论文与实现差异
- 新模型每个 atomic step 创建输出，而非仅属性发生显著变化才创建。
- physical_state 原始词表与 pieces 描边分组要区分。
- whole/solid 示例词汇统一。
- 原文 exact/similar/different 定义与当前五层实现不完全相同；修订时参照 01-matching.md。
- local transition provenance 与 branch provenance 需要区分。

## 审稿人关于 GPT-4o 的意见
需报告选择理由、完整 prompt、参数、提示策略、模型版本、日期、人工修正过程。
目前用户未确认原实验调用方式和参数；严禁编造 temperature=0、模型快照或比较结果。
对话中讨论了 GPT-6 API 和 Sol high 的候选设置，但尚未执行迁移或对照实验。
更换论文模型名称必须反映实际运行；既有用户实验的模型与刺激材料来源应如实保留。

## 新任务开场白
请阅读 AGENTS.md 和 docs/tasks/05-paper.md，以及相关论文参考文本。
先核对当前实现和已确认实验事实，不编造模型设置。此次只修改这段论文：……
