# LLM 方法段落草稿（不是已确认实验记录）

以下保留对话中的候选表述。模型选择理由与 prompt 描述需核对是否确实用于论文实验；方括号不得用猜测值替换。

## LLM-Assisted Recipe Representation

We used GPT-4o to convert recipe descriptions into the structured state–action representation introduced above. This task requires interpreting procedural language, resolving ingredient references, decomposing compound instructions, and maintaining dependencies across multiple preparation branches. GPT-4o was selected to support these tasks within a unified natural-language interface and to produce outputs following an explicitly specified schema. This choice was pragmatic rather than based on a comparative evaluation of language models; we do not claim that GPT-4o is uniquely suited to the task.

We designed an instruction-based prompt combining task decomposition, explicit representation constraints, and a prescribed JSON output schema. The prompt instructed the model to first identify atomic actions and their participating entities, and then construct the corresponding states and transitions. It specified the meanings and permitted values of state and action attributes, distinguished main ingredients, auxiliary ingredients, and cooking environments, and provided guidance for preserving entity continuity and independent preparation branches. The prompting strategy therefore made the intermediate extraction tasks and output requirements explicit, rather than relying on an unrestricted request to summarize a recipe.

The experiments used [model identifier/version], accessed through [API or ChatGPT interface] during [date range]. The generation settings were [actual parameters; distinguish explicitly configured values from unspecified settings]. Each request contained [recipe input and any conversational context or examples]. The complete experimental prompt and an example input–output pair are provided in [actual appendix or supplementary material location] to support conceptual reproducibility.
