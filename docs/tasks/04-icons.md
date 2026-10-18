# 04 图标与状态命名

## 当前代码与参考脚本
实际图标资产：data/icons。
后端名称构造与检索：backend/graph_builder.py。
保存的历史脚本：docs/reference/icon-scripts（供核对，不代表已部署到 data/icons）。
原 source/data 中目前没有这些图标生成脚本；不要把归档脚本误认为已完成安装。

## 已确定规则
- 图标标签来自 recipe JSON 的 name、原始 physical_state、chemical_state。
- name 的空格与下划线统一，避免 bay leaf 与 bay_leaf 重复。
- 同一规范化标签去重；不为一个 name 擅自生成不存在的状态组合。
- whole 在新模板中改为 solid；模板使用的状态词需与规范一致。
- pieces 归组仅用于前端描边，不把图标的 cube/slice/shred/dice/chunk 强行改成 pieces。
- 不引入 physical_subtype。

## 已知未解决差异
历史 make_iconlabels.py 接受 cube/slice/shred/dice 等，但不含 chunk。
修订抽取 prompt 使用 chunk，前端描边兼容两者；下一次图标任务先处理这项词表一致性。
既有 PNG 仍有 whole 命名，这是资产现状，不要声称全部已迁移为 solid。
不要覆盖整份旧 graph_builder.py：历史 icon_name_dedup 包中的版本早于当前 matcher 配套版本。

## 脚本职责
make_iconlabels：从实际 JSON 提取去重标签。
make_icons_spec：根据标签产生图标规格。
generate_icons_svg：根据规格生成图标（执行前核对输入、API 依赖及实际输出）。
这里保存的是待核对历史脚本，本次没有运行 API 或生成图标。

## 2026-10-07 aux 节点文字标签
- 已执行：所有 aux 节点中心标签改为其显示名称的前两个英文字母或数字，统一转为小写，例如 sugar 显示 `su`、oil 显示 `oi`。
- 已移除按类别排序后分配希腊字母的映射；matched aux 节点的上下两半分别使用各自名称的前两个字符。
- 仅修改前端显示，不修改状态名称、匹配、图结构或图标资产。
- 验证：`node --check frontend/app.js` 通过；检索确认不再保留希腊字母映射及渲染引用。

## 2026-10-07 physical state 外圈编码
- 已执行：外圈以固体平头线段和液体圆点作为两种基础纹理；只修改显示，不改变原始 `physical_state` 或匹配语义。
- 固体粒度顺序：`whole/solid` 为连续实线；`chunk/cube/cut` 为 4 段；`slice/dice` 为 6 段；`shred` 为 9 段；`powder` 为 14 段。中文块、片、丝、丁沿用对应级别。
- `liquid` 使用 9 个圆点，不再使用普通长虚线；圆点线宽为固体短线的 1.5 倍，以便和 `powder` 明显区分。混合态中的液体圆点使用相同比例。
- 混合态使用两个同半径图层：底层为平头固体线段，上层为圆形液体点。液体占比依次为 `batter 75%`、`paste 55%`、`mash 35%`、`dough 20%`。
- 未知状态回退为连续实线，避免外圈消失。
- 验证：`node --check frontend/app.js` 和 `node tests/test_attached_main_layout.js` 通过；尚未把坐标测试描述为浏览器视觉验证。

## 2026-10-12 React physical state 外圈迁移
- 已将上述外圈语义完整迁移到当前 React `PhysicalRing` 组件；此前 React 版本仅有简单 `strokeDasharray`，混合态没有真正区分方形短划与圆点。
- 固体编码：`whole/solid` 连续实线；`chunk/cube/cut` 4 段；`slice/dice` 6 段；`shred` 9 段；`powder` 14 段。未知状态回退为连续实线。
- `liquid` 使用 9 个均匀圆点。混合态使用 12 个均匀环形槽位，按 `batter 75%`、`paste 55%`、`mash 35%`、`dough 20%` 将圆点与平头方形短划均匀交错。
- 仅改变 SVG 显示，不修改原始 physical_state、匹配、节点 domain、图结构或布局坐标。
- 新增 `frontend/src/components/PhysicalRing.test.jsx`；React/Vitest 共 14 项通过，Vite production build 通过。尚未完成浏览器视觉核验，刷新前端即可，无需重启后端。

## 2026-10-12 React flavor 编码迁移
- 复用旧 `frontend/app.js` 的 `FLAVOR_COLORS` 原值：savory `#7F7F7F`、sweet `#e39ac7`、sour `#e3ff65`、umami `#7A5C8E`、aromatic `#5FAF5F`、spicing `#9A6A3A`、spicy `#EC5823`、deodorizing `#4FA3A5`、none 白色；未知 flavor 回退 `#bdbdbd`。
- main/container 每个 recipe 圆盘在图标外、physical ring 内绘制 flavor ring；多个 flavor 按项目原规则等比例分段。匹配哑铃的 R1/R2 半圆各自读取对应 flavor，不混合两侧数据。
- aux 中心使用主 flavor 填色，physical-state border 同时使用该 flavor 色；标签文字沿用旧版亮度计算自动选择黑色或白色。
- 为给 flavor ring 留出清晰空间，main 图标缩放到圆盘直径的 96%；不改变图标资产、节点尺寸、布局、匹配或原始 flavor 数据。
- 新增 `FlavorRing.jsx` 和 `FlavorRing.test.jsx`。React/Vitest 共 17 项通过，Vite production build 通过；尚未完成浏览器视觉核验，刷新前端即可，无需重启后端。

## 新任务开场白
请阅读 AGENTS.md 和 docs/tasks/04-icons.md，先核对 chunk/cube、solid/whole 的实际使用情况。
保持 pieces 只影响描边，不修改匹配语义。具体任务是：……
### 2026-10-12 physical-state border refinement

- Kept the physical-state border hidden for container nodes.
- Increased the border width to `1.75` for main nodes and `1` for auxiliary nodes.
- Validation: frontend Vitest suite passed (17 tests); Vite production build passed.


## 2026-10-17 一条命令生成图标；mash/batter 模板；尺寸与含水量分级
- 已执行：新增 `data/icons/build_icons.py`。`python data/icons/build_icons.py` 为 dry run（只列出缺哪些图标、各物理状态数量和 API 调用次数，不需要 openai 或 key）；`--run` 才真正生成。流程：从 data/*.json 取标签 → 只处理 data/icons 里还没有 `<name>.png` 的标签 → 规格（按批调用，缓存在 `data/icons/_build/icon_specs.json`）→ 每个图标多张候选并选最佳（候选与最佳图在 `_build/icons_png`）→ 把最佳图复制到 `data/icons/<name>.png`（后端读取位置；已有图标不覆盖，除非 `--overwrite`）。可选：`--all`、`--only LABEL…`、`--candidates`、`--batch`、`--size`、`--data`。中断后重跑只补未完成的部分。
- 已执行：新增 `data/icons/icon_vocab.py` 作为三个脚本共用的词表：物理状态 solid、chunk、slice、shred、dice、powder、mash、paste、batter、liquid；`whole` 按 solid 模板处理（文件名仍保留 whole）。`make_iconlabels.py`、`make_icons_spec.py`、`generate_icons_svg.py` 都改用它；此前它们不接受 whole/mash/batter（标签步骤直接报错、规格步骤抛异常）。
- 分级（写进规格提示词和出图提示词）：固体按尺寸 solid 1 → chunk 2 → slice/dice 3 → shred 4 → powder 5，级别越高单元越小越多（数量与大致占比写在提示里）；固液混合物按含水量 mash 35% < paste 55% < batter 75% < liquid 100%（与前端外圈液体占比一致），越湿越扁、越流淌、有滴落，越干越高、有颗粒块。新增 `mash_mound`、`batter_pool` 模板，调整 paste/powder/shred 模板描述使其与分级一致。
- 修正：`make_iconlabels.extract_labels` 注释声称与后端命名一致，但此前没有把名称里的空格改成下划线，现已一致。
- 验证：`tests/test_icon_vocab.py` 12 项（词表、分级单调、提示词差异、状态以文件名为准、标签/缺失/dry run 不调用 API）通过；dry run 对当前数据：193 个标签，171 个缺图（5 次规格 + 513 次出图调用）。**没有调用任何 API，没有生成图标**；`openai` 在当前 Python 环境未安装，真实生成前需安装并设置 OPENAI_API_KEY。`docs/reference/icon-scripts` 里的归档脚本未更新。
