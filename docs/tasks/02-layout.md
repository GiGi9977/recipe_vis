# 02 可视化与布局

## 2026-10-11 React/Vite + ELK.js 恢复架构

- 已在 `docs/ARCHITECTURE_PLAN.md` 确定新目录恢复方案：React/Vite 负责应用、组件和声明式 SVG；ELK.js layered 负责基础从左到右布局；D3 只负责比例、几何、缩放和最终路径生成，不操作 React 所有的 DOM。
- ELK 输出只作为基础解。之后统一执行 recipe lane、水平 process chain、附加节点靠近、终点 ownership group 压缩、shared-node recipe-aware anchor、碰撞检测和自适应增距，不增加 recipe-pair 坐标硬编码。
- 文档加入 `visualize` 的分阶段布局检查，以及 `playwright-interactive` 的持久浏览器功能/视觉 QA 流程。当前会话缺少该 skill 所要求的 `js_repl`，所以本轮未执行交互式浏览器验证。
- 本轮只更新架构与恢复文档，未迁移当前 `frontend/app.js`，未安装 npm 依赖，也未改变现有布局坐标或图语义。

## 当前有效版本
frontend/app.js；交付版本名 single_main_horizontal。
基于 moussaka_parallel_layout 恢复，只把附加 main 的换行 y 间隔恢复为 22px。

## 用户最后确认的要求
- 仅没有前序加工、直接通过 add 加入已有流程的单个 main，放在 aux 相同的附加区域。
- 当前分类器要求唯一目标、全部出口为 add；有加工步骤、多目标或混合出口的 main 保留主分支。
- 附加节点按 recipe 侧分组，水平方向每行最多 5 个，多了换行；NB_AUX_ROW_GAP=22。
- 已有加工分支保留原来的布局，不整条挪到接收节点旁。
- 多条已加工 main 汇入同一空容器时，不能把这些主分支并成同一行。
- 单条 main 加入初始空容器仍是流程延续。
- 布局不得修改 domain、原始 index、节点状态、图标含义或匹配结果。
- hover 暂时显示 R1/R2 的原始 recipe index；开关 SHOW_ORIGINAL_NODE_INDICES。
- pieces 只归并描边样式；原始 physical_state、tooltip、匹配及图标命名不因此改变。

## 已撤回：不要恢复
- receiver_attachment_layout：全局分支带重排与碰撞避让方案。
- main_chain_as_aux：整条 main 加工链进入 aux 区域。
用户明确要求恢复先前整体布局，只让单个 main 使用横向附加布局。

## 文件与验证
核心：findAttachedMainNodes、newBranchLayout、applyPhysicalRingStyle。
`node --check frontend/app.js`
`node tests/test_attached_main_layout.js`
测试覆盖单个 main、已有加工分支保留、多主料汇合，以及 12 个附加节点按 5/5/2 分行、22px 行偏移。

## 限制
22px 为用户指定的行偏移，不等同于完整的碰撞消除；不能声称全图没有重叠或交叉。
最近一版未完成浏览器最终视觉验证；有布局问题时检查具体 recipe 和截图。
修改后浏览器强制刷新；本任务不需要重启 matcher。

## 新任务开场白
请阅读 AGENTS.md 和 docs/tasks/02-layout.md，保持当前横向五个一行的单 main 附加方案。
不要恢复整条加工链 aux 化或全局重排。只处理这次指定的布局问题：……

## 2026-09-24 首轮分支纵向间距修正（已被下述通用规则取代）
- 本次用户要求减少分支重叠；描述中图片顺序有冲突，暂按图 1（收尾长链在上、准备分支在下）实现，等待用户确认视觉结果。
- 在 fork 展开之后检查完整 main/container 分支的上下范围；同一比较区域内、分支之间没有 process 连接且范围重叠时，按接收分支优先的稳定顺序重新分配 y，整体平移各分支，保留分支内部形状与 x。
- 仅处理上述条件；混合 R1/shared/R2 区域及跨分支 process 汇合保留现有布局约束。不是恢复已撤回的全局分支带重排方案。
- 非 merged 分支的附加节点改用其实际接收节点 y，避免 fork 展开后仍附着在旧分支中心。
- 不修改匹配、原始数据、domain、状态或图标语义；五个一行、22px 换行规则保留。
- 已通过：`node --check frontend/app.js`、`node tests/test_attached_main_layout.js`、`node tests/test_branch_vertical_spacing.js`。
- 新回归用当前两份 ice_cream recipe 的节点/边构造三种同类节点视图，检查分支范围不重叠、接收链在上、语义不变、重复布局稳定；不等同于完整后端匹配或浏览器验证。
- 浏览器工具因 Windows sandbox CreateProcessWithLogonW 1385 无法启动，未完成视觉验证；不保证所有边或文字无交叉。需要强制刷新前端，不需要重启后端。

## 2026-09-24 通用分支避让（当前有效）
- 用户最新要求明确扩展至所有 recipe，并指定新图 2 为正确顺序：白酱分支在肉酱分支之上，汇入长边不穿过肉酱节点。本次允许为避让调整分支 y 与顺序，取代首轮仅检测同类区域高度重叠的条件；不是恢复历史交付包。
- `nb_avoidBranchObstructions` 在附加节点定位后运行，不按 recipe 名称特判；包括 main/container、aux 和单 main 附加节点的实际包围范围。
- process 连接的布局组件作为整体移动，保留 fork、汇合对齐及内部相对位置；各独立分支整体平移，不改变 x、domain、状态、匹配、边或输入数据。
- 用跨分支连接线到节点的距离与线段交叉数量评估候选顺序；稳定插入搜索最多四轮，优先减少穿节点，其次交叉，同分偏好接收链在上。已有清晰布局尽量保留，候选不优于原几何评分时不强行替换。
- 五个一行与 22px 行偏移不变。该算法为有界几何优化，不保证所有图绝对无交叉；分支内部冲突、文本标签及真实边界曲线不属于当前完整优化模型。
- 已通过 `node --check frontend/app.js`、`node tests/test_attached_main_layout.js`、`node tests/test_branch_vertical_spacing.js`、`node tests/test_branch_ordering.js`、`git diff --check`。
- 通用回归调用当前 backend 建图，对 data 根目录 12 份 recipe 的全部 144 个有向组合验证：坐标有限、布局可重复、语义及 x 不变、跨分支边穿节点计数不增加；111 组减少。potato_eggplant_moussaka 自比较从 1 降为 0，且白酱 44 在肉酱 21 上方；classic_moussaka 自比较维持 0。
- 已查看基于实际 moussaka 坐标生成的简化图，分支顺序符合本次图 2；这不是浏览器图标、tooltip、标签的视觉验证。浏览器工具仍受 Windows sandbox 1385 限制。
- 修改 frontend/app.js，新增 tests/test_branch_ordering.js，更新 tests/test_branch_vertical_spacing.js 与本说明。强制刷新前端即可，不需要重启后端。

## 2026-09-24 接收节点附近布局与等距链（当前追加规则）
- 用户最新图 2 要求：准备分支靠近其 add 接收节点，add 角度尽量一致；没有对齐约束时链内相邻节点等距。该要求明确允许调整 x，取代上一轮“不改变 x”的限制。
- 附加节点定位之前，对同组件内唯一前后继、水平且不受 fork 同级对齐或其他出口约束的流段，逆向消除 globalLevel 引入的空隙，使用 NB_SPINE_X_GAP=130。汇合和分叉约束保留。
- 分支避让后按接收端优先顺序进行局部候选搜索，整组移动准备分支及附件；以 45° 为目标，优先避免穿节点、节点重叠及交叉，再缩短连接并减少角度偏差。不同 x 区间可复用同一行，不再强制所有分支占据独立的全宽行。
- 多出口、共享分支或碰撞约束可能阻止统一角度；不强制牺牲原有约束。候选不得将原本向右的跨分支边反转。
- braised_pork_with_potato 自比较已验证：14→15 reduction、41→42 cut 均为 130px；10→15、42→38 的 dx=130、abs(dy)=130，均为 45°；两条准备链同 y 且 x 区间分离。
- 已通过语法检查、附加布局测试、ice-cream 布局测试、144 个真实后端比较回归；保留 moussaka 白酱在肉酱上方断言。节点语义、有限坐标和重复布局稳定性通过，跨分支穿节点计数未增加。上一轮要求 x 不变与全宽分支带分离的测试已按新要求替换。
- 中间一次 Node/V8 运行崩溃，随后相同运行时完整复测通过；未通过改变原始数据绕过测试。此次仍仅完成坐标验证，未完成浏览器视觉确认。
- 改动 frontend/app.js、tests/test_branch_ordering.js、tests/test_branch_vertical_spacing.js 与本说明。强制刷新前端，不需要重启后端。

- 最终复验补充：默认 Python 后续出现 Windows access violation，Node VM 也出现不一致错误。测试支持 RECIPE_TEST_PYTHON，并显式提供 Math；使用 C:/temp/recipe-llm/python.exe 与 `node --jitless` 完整通过全部 144 组（最后实测最大单次布局 78ms）。未修改环境或安装依赖。普通 Node 此前已有完整通过记录；最终结果以本次配置环境的完整输出为准。

## 2026-09-24 cake_2 加料目标导致加热链过长（已修复）
- cake_2 原始节点 17→18 为 oven heat；25→18 为 batter add。旧等距检查把两者都当作 flow 前驱，误判为需要保留间距的多前驱汇合。
- 当前等距规则：目标存在 main/container process 前驱时，仅用这些 process 前驱判断唯一流前驱；没有 process 前驱时保留原来的 add 连续流判断。真实多 process 汇合、fork 对齐与其他出口约束仍保留。不按 recipe 或节点编号特判。
- cake_2 自比较 17→18 已断言水平、130px。通用测试覆盖 only_r1、only_r2、merged_exact、merged_similar，验证 add 输入不拉长前序 process 步骤，第二个 process 输入则保留汇合对齐。
- 已通过 node --check frontend/app.js、node tests/test_attached_main_layout.js、node tests/test_branch_vertical_spacing.js、git diff --check；配置项目 Python 的 node --jitless 运行 tests/test_branch_ordering.js 全部 144 组通过。
- 修改 frontend/app.js、tests/test_attached_main_layout.js、tests/test_branch_ordering.js 与本说明；原始数据及匹配未改。仅坐标验证，未声称浏览器视觉验证。强制刷新前端，无需重启后端。

## 2026-09-24 cake_3 分拆端点、aux 流程与预热容器（当前追加规则）
- 用户要求以新图 2 为准：add 靠近接收节点、避免 add 相交、wok_pot→oil 等距、oven heat 独立放置。
- 单一 split 输入且所有出口 add 到同一接收节点的末端 main 作为独立布局端点；仍是 main，不进入 aux shelf。split 边可延长，add 端点优先贴近各自接收节点。兄弟端点一起评估，避免逐个移动被旧交叉边卡住。
- 在避免穿节点、节点重叠及交叉的前提下，局部评分先缩短边并减少角度偏差，再考虑上下朝向偏好；不再让朝向偏好压过接收端距离。
- 已有 container process 前驱的预备容器收到 main add 时保持独立组件；没有前序加工的初始空容器仍保留连续流规则。单一 main 汇入的预热容器在不恶化避让时放于接收阶段下方，内部加热链整组移动。
- main/container→aux 的唯一 process 过渡也参与等距修正；同步平移源节点的附加原料。修复 pot→heated oil 被 aux shelf 拉长的情况。
- cake_3 自比较验证：11→8、22→12、23→24 的 dx=130、dy=130，三条平行 add 依接收顺序排列；2→3 水平 130px；28→29 水平 130px 且低于 batter 27 一行（130px）。
- 已通过前端语法、附件测试（含 cake_2 同类规则）、ice-cream 测试与全量 144 比较回归；117 组穿节点计数减少，其余未增加。原始数据、状态、domain、匹配未改，布局重复运行稳定。
- Node VM 再次发生 invalid bytecode，中间 Python 进程也有异常。测试改为在同一 JS realm 中加载布局函数；配置项目 Python 后，最终普通 Node 完整通过（实测最大单次布局 28ms）。未改应用代码绕过测试，未安装依赖。
- 已查看实际 cake_3 坐标生成的简化图：分拆加料三条短斜线分离、油锅加热缩短、烤箱独立位于右下，与图 2 的结构一致。这仍不是浏览器图标与真实边界渲染验证。
- 修改 frontend/app.js、tests/test_branch_ordering.js 与本说明；强制刷新前端即可，无需重启后端。

## 2026-09-25 process 边不能为缩短 add 而无限拉长（当前规则）
- 用户指出 split/process 边被拉成跨大块空白的长线。此前“split 边可延长”的规则不再意味着可以无约束增长；必须同时控制 process 和 add 距离。
- 接收端定位后增加 process-aware 纵向压缩：固定 x，对整组准备分支平移；已有 add 长度作为上限，不允许通过拉长 add 换取缩短 process。按碰撞/交叉优先，再惩罚 process 超出一行间距的纵向跨度。
- 分拆组与端点整体评估，避免逐个移动卡在旧边关系。多个 split 产物加入同一目标时保留不同的近端槽位（至少 64px），避免重叠。
- 无 process 前驱的初始 fork 节点可移到其子节点 y 范围中点，防止长 split 穿过另一子分支。已有 process 链的相对位置和 x 对齐仍保留。
- cake_1 自比较最大 split 纵向跨度由 809px 降为 194px；回归要求不超过两行（260px），且全部 add 边不比关闭此压缩阶段时更长。此处是坐标度量，不是缩放后的屏幕像素。
- 已通过 144 个真实后端比较（状态语义不变、坐标有限、重复布局稳定、穿节点计数不增加），保留 cake_2 17→18 等距、cake_3 三条短 add 与独立 oven、pork/potato、moussaka 等断言。
- 修改 frontend/app.js、tests/test_branch_ordering.js 与本说明；不修改 recipe 或 matcher。浏览器视觉验证仍未完成。强制刷新前端，无需重启后端。

## 2026-09-25 单节点加料紧凑聚类（当前规则）
- 用户图 2 要求单节点加料更紧凑，同时避免 process/已加工分支的汇入连线穿过这些节点。新增 nb_packSingleAdditions，在主布局及分支优化完成后依据最终边位置放置。
- 仅收集无任何输入、所有出口 add 且目标唯一的 aux 或已识别附加 main；容器与已有加工输入不进入聚类，不改变加工链的位置、domain 或语义。
- 以接收节点为中心，每行最多五个，按真实尺寸分行。小 seasoning 中心距 26px，大 main 中心距 52px，尺寸不同则使用独立外排；不再因为一个 main 把整个调料组横向拉宽。新规则取代 standalone 节点此前固定 22px 行偏移；加工 aux 链的原排布保留。
- 保留 R1 上、R2 下；共享组可择上下位置。搜索紧邻目标的中心位置及小幅左右/外移候选，优先避开其它节点、process 和已加工 add 线段，再减少单节点加料线与其它加工边的交叉，最后选更紧凑的距离。
- 附件回归：10 个 seasoning 两行、中心横向跨度 104px，单独 main 不撑宽小节点排布，避开水平 process 和斜向 prepared-add 线且不移动加工源节点。实际 classic_moussaka 调料组也验证中心横向跨度不超过104px。
- 已通过 node --check frontend/app.js、附件测试、ice-cream 测试、配置项目 Python 的完整 144 比较回归及 git diff --check；保留 cake_1 process跨度、cake_2 等距、cake_3 近端 add/oven、pork 与 moussaka 断言。
- 候选搜索为有界几何检查，不等同于浏览器曲线、文字及图标的最终视觉验证。需强制刷新前端；不需要重启后端。
- 修改 frontend/app.js、tests/test_attached_main_layout.js、tests/test_branch_ordering.js 与本说明。

## 2026-09-25 comparison 固定上下分区（已撤回，使用下述完整 process 分支规则）
- 用户图 2 明确要求：纯 R1 分支在上，shared 分支在中间，纯 R2 分支在下；距离或避让优化不得把分支交换到另一侧。
- 新增 nb_placeComparisonRegions，在分支几何优化之后、单节点加料聚类之前执行。按原始布局组件的 main/container 成员判断归属；临时拆出的 split 端点不改变比较归属。
- 共享组件保持原位。纯 R1/R2 组件及其附件整体移到共享范围之外并保留间距；x 和分支内部相对位置不变。共享链中内联 only_r1/only_r2 节点仍留在共享链中，保留上下半节点的对应关系。
- 无共享组件时，R1 仍整体高于 R2；只有一种 recipe 侧或只有 shared 的图保持原布局。最终单节点聚类继续按 R1 上、R2 下放置并检查最终连线。
- 144 个真实比较新增最终坐标断言：R1 分支全在 shared 之上、R2 全在 shared 之下，无 shared 时 R1 高于 R2；全部通过。已有 cake、moussaka、pork、ice-cream、附件与密集聚类回归也通过。
- 中间出现 Python 子进程 access violation，重试未改测试输入后完整通过。前述 117 组避让改善指标测量的是分区前优化阶段，不代表强制分区后全图交叉数不变；本次最新用户的分区约束优先。
- 修改 frontend/app.js、tests/test_branch_ordering.js 与本说明。语法及 git diff --check 通过。尚无浏览器最终视觉验证，强制刷新前端即可，无需重启后端。

## 2026-09-25 用户纠正：只有完整 only 分支应用上下规则（当前有效）
- 已撤回上一轮按布局组件强制划全局区域的规则及其全局上下断言，恢复此前几何布局作为基线。
- branch 定义为通过非 add process 边连接的完整分支，直到 add 到另一分支。检查包括 process 连接的 aux/container，不以临时 compOf 或 split 端点组切断判断。
- 仅完整分支所有节点都是 only_r1/only_r2，并有跨分支 add 出口时，才将整条准备分支放到共享区域的上方/下方。
- 一旦该完整 process 分支含 merged_exact 或 merged_similar 节点，整条分支豁免，包括前后的 only_r1/only_r2 段；全部遵循分区变更前的原布局。没有 add 出口的终末分支也不被当作单侧加料分支强移。无共享基线时保留原布局。
- 移动时带上该分支接收的单节点原料；不以这些附加原料判定 process 分支归属。随后仍使用原有紧凑聚类。
- 新回归验证：matched→only_r1→only_r1 的整个链坐标不变，独立 only_r1/only_r2 加料加工链位于上下对应区域，无 add 出口的尾端保持原位。全量144比较、附件与ice-cream回归、语法及diff检查通过。
- 修改 frontend/app.js、tests/test_branch_ordering.js、tests/test_attached_main_layout.js 与本说明。未修改数据/匹配，仍需强制刷新前端，无需重启后端；未声称浏览器视觉验证。

## 2026-09-27 cake_1 / cake_2 下方加工链上移修复
- 原因：Step 4b 汇合对齐按同一 comp + 拓扑层级批量覆盖 y，误将独立下方蛋白分支拉至上方；当前数据 cake_1 15→17、cake_2 3→12 出现 217px 上移。
- 已执行：仅沿目标的非 add process 后继、在同一组件内传播 y 平移，保留各节点原有 fork 相对偏移；无变化判断改为比较目标实际 y。未改数据、匹配、图标、附加布局规则。
- 新增 tests/test_cake_comparison_layout.js，覆盖 cake_1/cake_2 两个比较方向的 whisk 端口水平、语义不变与重复布局稳定。
- 已通过：node --check frontend/app.js、node tests/test_attached_main_layout.js、node tests/test_branch_vertical_spacing.js、设置 RECIPE_TEST_PYTHON=C:/temp/recipe-llm/python.exe 后 node --jitless tests/test_cake_comparison_layout.js、git diff --check。
- 完整 tests/test_branch_ordering.js 在红烧肉既有坐标断言失败（actual=26、expected=130）；内存恢复本次修改前的 Step 4b 后仍出现同样失败，未修改该断言来掩盖问题。
- 另在内存中只运行该测试的通用检查（明确排除 recipe 编号相关专用断言），普通 Node 全部 144 个比较通过：坐标有限、确定性、语义不变、优化阶段跨分支穿节点数不增加，119 组减少。这不等于完整旧测试通过。首次 --jitless 通用检查发生 V8 Invalid bytecode，普通 Node 重试成功。
- 未完成：浏览器最终视觉验证；旧红烧肉专用断言与当前数据的对应关系需另行检查。用户需强制刷新前端，无需重启后端。

## 2026-09-27 同一加工分支固定水平轴（cake_2 / cake_3）
- 用户明确要求：同一分支 shared 节点位于中心，哑铃节点中心与 shared 中心同 y，only_r1/only_r2 分别位于分支上/下半圆高度；不能为了局部接收点或避让将加工链折成斜线。
- 已执行：新增 nb_alignProcessBranchAxes，在几何避让后、完整单侧分支区域定位及附加原料聚类前统一轴线。按非 add、非 split 的 process 连通段确定分支，保留显式 split 分叉与跨分支 add 的连接角度；共享分支以最左共享节点为轴，纯单侧链保留最左节点所在行。随接收节点移动独立加料附件，不移动其他加工链或 x。
- 本次水平轴规则优先于旧局部纵向偏移；不会把多个 split 输出分支或 add 相连的独立分支压成一行。节点 kind/domain、状态、匹配和数据均未修改。
- tests/test_cake_comparison_layout.js 扩展为三个 cake 的九组比较，检查共享轴、only 高度、上一轮 cake_1/2 水平端口、语义不变、有限坐标及重复运行稳定。内存禁用新约束后，新增轴线断言如预期失败（M1→M6：397 vs 358）。
- 已通过：node --check frontend/app.js、node tests/test_attached_main_layout.js、node tests/test_branch_vertical_spacing.js、RECIPE_TEST_PYTHON=C:/temp/recipe-llm/python.exe 下 node tests/test_cake_comparison_layout.js、git diff --check。
- 全部144组通用检查（内存排除已知历史编号专用断言）通过，坐标有限、确定性、语义不变；119组避让改善指标仍只测量几何避让阶段，不代表新增水平对齐后全图无交叉。完整旧测试此前红烧肉断言失败仍未修复。
- 浏览器尝试打开 http://127.0.0.1:5500 时因 Windows sandbox CreateProcessWithLogonW 1385 失败，未完成实际浏览器视觉验证。不宣称最终无重叠或无交叉。
- 修改 frontend/app.js、tests/test_cake_comparison_layout.js 和本说明。请强制刷新前端，无需重启后端。

## 2026-09-27 跨分支 ADD 角度优先（已撤回局部接收段移动，见 2026-09-28）
- 用户明确选择移动接收分支，允许共享汇合附近的部分 PROCESS 倾斜；取代“所有 process 段最终必须同轴”的绝对约束。
- 已执行：nb_angleBranchAdditions 在水平轴及单侧区域定位后运行，仅处理主分支来源的 ADD，排除 standalone 附加 main 和普通 aux 加料。按实际 dumbbell 上下端口检查，近水平时移动接收加工段及其独立原料，保持 x 和段内相对位置。
- 遇下一独立加料接收节点、split 或具有外部 process 前驱的汇合时停止传播；这些边界允许 PROCESS 倾斜，不将相连的独立分支全部平移。候选位移保留受影响 ADD 的端口高度差，优先减少节点碰撞，再选较小位移。
- 新增 tests/test_branch_add_angles.js：全部144比较的932条主分支ADD端口有高度差，坐标有限、语义不变、重复布局稳定。cake 九组回归通过；全水平轴断言只检查 ADD 调整前基线，cake_1/2 独立下方 whisk 水平断言仍检查最终坐标。
- 已通过前端语法、附加布局、ice-cream 布局及 git diff --check。未修改数据或 matcher。
- 中间全量建图一次出现 previous 条目为 str 的异常；只读扫描未发现该类型，原样重试后144组通过，没有修改测试输入绕过异常。
- 未完成浏览器最终视觉验证，不保证全图无交叉；先前浏览器启动受 Windows sandbox 1385 限制。需要强制刷新前端，无需重启后端。

## 2026-09-28 仅独立分支之间 ADD 触发整支平移（当前规则）
- 用户用两张不同截图明确：不能只抬高 heat 终点造成 heat/sear 折线；需识别两个独立分支，整条平移。撤回上一轮沿接收节点截取局部后继、遇汇合停止的算法，以及强制每一条 main ADD 都倾斜的要求。
- nb_angleBranchAdditions 现按全部非 add 边（含 split）建立完整 process 连通分支。只有 ADD 两端分属不同分支才参与角度调整；同分支 ADD 不触发移动，不拆开共享节点或改变匹配。
- 接收分支的前驱、后继、分拆部分整体使用同一 dy，x 与内部相对几何不变；独立原料附件随接收支移动，其他主分支不能被当作附件带走。此前水平轴和 cake_1/2 修复保留。
- tests/test_branch_add_angles.js 增加 heat 前驱/接收端/sear 后继一起移动及内部 ADD 不移动的直接测试；全量检查每条 process/split 边在整支平移前后的相对坐标完全一致。cake 九组轴线断言恢复为最终布局检查。
- 已通过：144 组比较、814 条独立主分支 ADD 端口角度、语义不变、有限坐标、重复稳定；cake 九组最终水平回归；附加布局与 ice-cream 回归；前端语法及 diff 检查。Python 全量建图中间两次 access violation，原样重试后通过，未修改输入数据绕过。
- 修改 frontend/app.js、tests/test_branch_add_angles.js、tests/test_cake_comparison_layout.js、本说明。未改 recipe 数据或 matcher。浏览器视觉验证尚未完成，需 Ctrl+F5 强制刷新，无需重启后端。

## 2026-09-28 预热接收分支被共享汇合误合并造成重叠
- 复现 braised_pork_with_potato / redpork_2：M7（锅）与 M6 下半圆同坐标，M6→M8 ADD 与 M7→M8 heat 同行。根因是跨 recipe 的 M6→M9 prepare 与接收分支 M7→M8→M9 在共享 M9 汇合，纯无向 process 连通性把两条实际准备分支误判为同支。
- 已执行：新增 nb_receiverBranchConnectors。仅对有 process 前驱的接收容器、main 来源 ADD，识别供给支通往接收支后续共享节点的 process 连接，将其视作跨分支连接，不用于合并布局分支。原始边和匹配节点不变。
- 热锅前驱、heat、sear、后续加工与附件仍整组平移；仅供给分支到共享汇合的 connector 可倾斜，不再要求这条跨分支 connector 保持组内相对 y。普通加工和 split 内部相对位置仍有断言保护。
- 专项回归检查上述肉类比较两个方向：redpork_2 6→9 heat 与9→10 sear 保持水平，锅6与猪肉5分离，5→9 ADD 不再与 heat 重叠。
- 已通过 cake 九组、全部144比较及818条独立主分支ADD、语义不变、有限坐标、稳定布局、附件测试、前端语法和 diff 检查。ice-cream 测试首次遇 Node VM Math.hypot 的运行时异常，使用 --jitless 原样复测结果见本轮输出。
- 修改 frontend/app.js、tests/test_branch_add_angles.js 和本说明。仍未完成实际浏览器视觉验证，不宣称全图无交叉；强制刷新前端，无需重启后端。

## 2026-09-28 用户确认图1正确：只分离加工分支，R2向下/R1向上
- 用户补充错误图：绿色 R2 heat→sear→fry 整支位于供给支上方；正确图应位于下方。本轮撤回以碰撞评分在上下方向自由选择，以及把所有 main ADD 都视为分支汇合的行为。
- 当前触发条件：ADD 两端分属独立布局分支，并且来源、接收节点都已有 process 前驱。普通原料加入、进入未加工的空容器等不触发此额外移动。
- 移动保持完整接收分支和附件的相对几何，方向按 recipe side 硬约束：R1只向上，R2只向下；避让评分不能反转方向。已有正确方向和足够间隔时保留原布局。
- tests/test_branch_add_angles.js 增加普通加料不动、R1向上、R2向下断言，并将肉类两个比较方向的锅位置从绝对距离检查改为带方向的检查。
- 已通过：144组比较及670条真正加工分支汇合、数据语义不变/坐标稳定；cake九组；附件回归；分支间距回归；node --check frontend/app.js；git diff --check。分支间距批处理首次只输出一条通过信息，单独普通Node复测完整通过且退出码0。
- 修改 frontend/app.js、tests/test_branch_add_angles.js 和本说明。未改原始数据或 matcher。尚未完成浏览器最终视觉验证；需 Ctrl+F5 强制刷新前端，无需重启后端。

## 2026-09-28 普通节点转移 ADD 水平延续（图2正确）
- 用户明确：只有两个加工分支汇合才需要斜向 ADD；单个节点进入另一节点、无独立接收加工分支时应保持水平。
- 新增 nb_inlineContainerTransfers：单一 main 输入进入无 process 前驱的容器视为原流程延续；aux 加料不使空容器变成独立加工分支，多主料汇合不套用此规则。此延续同时参与水平轴分组和整体移动分组，防止 source 与目标容器被后续步骤分开。
- 保留已有预热容器的独立分支、heat→sear 整组移动和 R1向上/R2向下。新增候选最终方向验证，并防止后续分支加料把已正确分离的分支翻向另一侧。
- 新增肉类双向断言：redpork_2 15→17（猪肉入炖锅）、braised_pork_with_potato 32→33（猪肉入炒锅）ADD 端口同 y；已有锅/肉不重叠、heat/sear水平、方向断言继续通过。
- 已通过144比较及658条真正跨加工分支ADD、语义不变/有限坐标/确定性；cake九组、附加布局测试、分支间距测试、语法和diff检查。分支间距测试在本轮前半段完成，后续仅新增方向候选保护。
- 修改 frontend/app.js、tests/test_branch_add_angles.js、本说明。未改数据/匹配；浏览器视觉验证未完成。请强制刷新前端，无需重启后端。

## 2026-09-28 split 末端份量禁止跨越 recipe 侧别
- 用户新图2显示绿色 only_r2 split 末端被接收点避让移到上方，split/ADD 长边折返；图1要求保留在下方及兄弟份量附近。
- 新增 nb_keepSplitPortionsOnSide，作用仅限单一 split 输入、所有出口为 ADD 的 only_r1/only_r2 末端。R2不得越到来源下半端口上方，R1镜像；有共享 split 兄弟时保留相应上下间距。
- 仅修正越界末端：放回正确侧别，并在父节点与接收节点之间仍有空间时对齐共享兄弟的 x，避免反向边。加工链、普通 ADD、匹配和数据不变。
- cake 九组新增末端 split 侧别断言；九组和144全量比较、肉类水平转移与分支方向回归均通过，坐标稳定、语义不变。附件/间距检查和 diff 检查在本轮执行。
- 修改 frontend/app.js、tests/test_cake_comparison_layout.js、本说明。浏览器视觉验证未完成，不能保证所有连线和文字均无交叉。需强制刷新前端，无需重启后端。

## 2026-09-28 已加工中间产物接收分支漏判
- 原分支边界识别只覆盖 main 加入已加工容器，遗漏 cake_2/cake_3 中蛋黄加入 heat→stir→stir 中间产物；共享续接把接收链与蛋黄分支压到同一水平线上。
- 已修改 frontend/app.js：独立、同 recipe 侧且已有前序加工的 main 接收链，在接回共享节点处划分边界；整段接收链按 recipe 侧平移，内部 PROCESS 保持水平。容器跨 recipe 续接仅识别另一侧 PROCESS。普通空容器转移规则保留。
- tests/test_cake_comparison_layout.js 新增 cake_2/cake_3 双向断言：cake_3 的 2、3、6、8 节点同 y，且相对蛋黄 10 按侧分开至少80；仅跨分支续接免除水平约束。
- 实际通过：node --check frontend/app.js、cake 九组、144比较/676条分支ADD、附加布局、分支间距、git diff --check。坐标验证不等于浏览器视觉验证；本次未完成浏览器验证。
- 不修改匹配或原始 JSON。前端 Ctrl+F5，无需重启后端。
## 2026-09-28 独立接收分支保留相邻顺序
- 用户要求移动不能越过另一母分支，ADD角度可随空间变小。撤回固定至少80像素分离的测试要求。
- frontend/app.js：对整条同侧独立接收链，计算移动方向上相邻 main 加工节点的间距边界；候选位移不能越界。先加入所需最小位移，空间不足时减小ADD间距，保持整链平移。含共享节点的复杂接收组保留既有处理，未做全局分支重排。
- 测试新增上下镜像窄空间夹层：接收链整体移动不超过50，邻居保持110；cake_2/cake_3检查接收链仍在蛋黄与蛋白邻居之间。一般ADD测试改为非零倾角，不再要求固定角度。
- 实际通过 cake九组、144比较/676跨分支ADD、语法、附加布局与分支间距检查；坐标稳定、语义不变。未完成浏览器视觉验证。Ctrl+F5刷新前端，无需重启后端。
## 2026-09-28 修复邻居边界误包含左侧 split 根节点
- 用户截图重叠可在当前最终坐标复现：cake_2/cake_3 接收链 y426，蛋黄下端口 y422，仅差4。此前非零倾角测试不足。
- 原因：按130像素中心距离搜索邻居，把左侧共同split根节点当作下方障碍。改用节点实际横向包围范围相交判断，避免该根节点把可用位移压到4；保留蛋白邻居的移动边界。
- 修改 frontend/app.js、tests/test_cake_comparison_layout.js、tests/test_branch_add_angles.js：cake双向接收链距蛋黄端口至少60且不跨下方邻居；合成镜像案例加入左侧split根，断言接收链移动50而非被截为4。
- 已通过cake九组、144比较/676分支ADD、node语法检查、附加布局检查。浏览器视觉未验证；需Ctrl+F5，无需重启后端。
## 2026-09-28 供料加工分支靠近接收分支
- 新图要求R2供料heat链位于接收链下侧附近，辅助split链也靠近其加入的节点。
- frontend/app.js新增最终供料分支定位：仅完整独立同侧PROCESS分量、出口均为ADD且单一接收节点；同侧aux split组允许相近的多个接收节点。R1上侧、R2下侧，整段平移，携带无前序单目标附加节点；保留现有60–160范围内位置。共享骨架与普通单节点ADD不套用此规则。
- tests/test_branch_add_angles.js新增两种冰淇淋双向比较断言：no_churn 8→9 heat水平，9距6在正确侧60–160；另一菜谱5/6/7辅助split组距接收3在正确侧60–160。
- 已通过cake九组、144比较/676分支ADD、附加布局、分支间距、语法和diff检查。Python/Node运行时出现过访问冲突/Invalid bytecode，重跑通过。未做浏览器视觉验证，不能声称所有交叉均消除。
- 修改frontend/app.js、tests/test_branch_add_angles.js和本说明；Ctrl+F5前端，无需重启后端。
## 2026-09-28 共享原料起点的双侧供料分叉
- 用户指出broccoli_with_shrimp/oil_braised_shrimp两条供料分支同时从左上进入导致重叠，要求按recipe侧分开，允许cut连接倾斜。
- 原因：供料定位仅接受全only_r1/only_r2组，遗漏共享虾起点（一侧直接ADD，另一侧cut再ADD）。
- frontend/app.js新增严格限定分叉处理：仅一个无前序共享main根、其余main同侧、恰好两个外部ADD且分属两侧；根与直接接收端口同y，另一侧加工子链整体放在其接收端相应侧100像素附近。其余共享骨架不变，数据/匹配不变。
- tests/test_branch_add_angles.js新增上述虾菜谱双向回归：共享根与直接接收端同y、cut分支方向与接收距离、共享虾与blanch分支间距至少60。
- 已通过144比较/676条分支ADD、cake九组、附加布局、JS语法与diff检查。未完成浏览器视觉验证；不能宣称任意分支/标签均无交叉。前端Ctrl+F5，无需重启后端。
## 2026-09-28 冰淇淋原始分叉、split顺序和空白压缩
- 用户要求保留同一recipe真实split分叉，R1独立子链在共享子链上方/R2下方；共享链内仅上下半层；普通原料入锅ADD水平，跨branch ADD才分离；split份量按接收顺序展开，缩小M14链与下方的空白。
- frontend/app.js新增nb_restoreSplitBranchLanes：非split PROCESS/普通容器转移组成加工链，在存在共享split子链时将独立同侧子链分层；无前序split根放于子链中间。保留既有分支次序，压缩超过130的主节点空白层间距；辅助加工组跟随接收层平移。
- 单侧末端main split份量按ADD接收x排序，按顺序扇出，横坐标在父节点之后/接收点之前。不是一般图最小交叉求解，不能保证任意复杂图全部无交叉。
- 普通main进入无前序容器不再参与单节点附加packing；无前序原料的最终y与容器对齐，修复M4→M6倾角。独立aux供料组靠近目标时使用共同y，避免之前变形残留。
- tests/test_branch_add_angles.js新增冰淇淋双向断言：原始egg分支分离至少100、milk→empty pot水平、三个split末端的顺序、保留已有距离/方向检查。
- 已通过144比较/676跨分支ADD、cake九组、附加布局、分支间距、JS语法与diff检查。未完成浏览器视觉验证。坐标验证不能替代截图核验，任意附加标签/连线避让仍不保证。
- 本次按用户新要求做保序空白压缩，不恢复旧的全局分支带重排；不修改原始JSON/匹配。需Ctrl+F5前端，无需重启后端。
## 2026-09-28 processed inline ADD与split组间避让
- 用户指出冰淇淋M9→M10普通转移仍斜、两个split组连线交叉、cake1/2共享split份量贴入加工链。
- 根因：最终inline修正只处理无前序原料，已加工来源在后续位移后未恢复；旧split规则仅按组内顺序排列，没有计算别组连线；共享split份量不在only节点扇出规则内。
- frontend/app.js：最终修正同侧processed main进入无前序容器的ADD，平移容器后续独立加工链并停于共享节点；保留上游位置。原始无前序供料仍由容器位置确定。
- 新增末端split扇组候选评估：按接收顺序，候选同时考虑组内70像素节点间距、其他main占位、不同组split/ADD线段交叉；保护父节点侧别和前向x。已有非split输入的份量是接收分支，不参与末端扇组移动。共享split份量放在接收加工链外，独有兄弟保留侧别间距。
- ADD保留宽到窄的带状样式，在接收端追加短箭头尖端，PROCESS/split保留现有箭头。
- tests/test_branch_add_angles.js新增冰淇淋双向processed转移/后续heat水平、组内70间距、两组所有split/ADD线段不交叉断言。tests/test_cake_comparison_layout.js新增共享split到接收点至少100距离、ADD前向断言。
- 已通过144比较/676跨分支ADD、cake九组、附加布局、node --check、git diff --check。分支间距旧VM测试本轮两次遭遇运行时异常（isAddEdge非函数、V8 Fatal），未完成该检查；没有把它记录为通过。
- 未完成浏览器视觉验证；候选避让不能保证任意图全无交叉。修改frontend/app.js、两份回归测试及本说明。前端Ctrl+F5，无需重启后端。
## 2026-09-28 共享 split 兄弟节点重叠修复
- 用户最新截图：classic_moussaka 自比较的两个 split 份量重叠，并贴到其他加工节点；期望展开可见扇形。
- 根因：nb_separateSplitFans 对全部共享的末端份量赋相同接收 y 偏移后直接跳过扇组避让。
- frontend/app.js：两个及以上全部共享的末端 split 份量也进入已有候选避让；按父节点到接收点方向展开，并错开 x、y，保留前向连接、主节点占位检查和原有混合共享/独有分叉规则。不改变加工链、数据或匹配。
- 新增 tests/test_shared_split_layout.js：225 组当前 recipe 比较，9 个共享末端 split 扇组验证兄弟间距、split 射线分离、其他 main 节点间距、坐标稳定及语义不变。classic_moussaka 自比较的旧规则负对照确实报 shared split siblings overlap。
- 实际通过：上述新回归、test_attached_main_layout.js、node --check frontend/app.js、git diff --check。test_branch_add_angles.js 未通过冰淇淋 processed inline transfer 水平断言（839.5 / 886.5）；去掉本次修改的基线同样失败，作为已有问题保留，未宣称全套通过。
- 未完成浏览器视觉验证。修改 app.js、新回归测试和本说明；Ctrl+F5 刷新前端，无需重启后端。

## 2026-10-01 shared边连接哑铃中间
- 用户要求exact/shared连线靠哑铃腰部，R1/R2仍连接各自半圆。
- frontend/app.js的effectiveAnchor对shared强制M，覆盖继承的T/B；边路径与标签都使用该函数，位置一致。不移动节点或改变匹配。
- 新增tests/test_shared_edge_anchor.js，覆盖similar哑铃、exact shape_dumbbell、入边/出边及所有原始anchor；共享M和R1上/R2下均通过。node --check与git diff --check通过。
- 未做浏览器视觉核验。Ctrl+F5刷新前端，无需重启后端。

## 2026-10-01 澄清：shared exact ADD输入簇靠腰部
- 前一轮仅改anchor，没有改变附加节点位置，未解决用户截图诉求。
- nb_packSingleAdditions新增shared exact输入簇侧向候选：目标为哑铃、输入为merged_exact且所有出边shared ADD时，在腰部附近左右排列；保留每行最多5个、节点/加工线碰撞评分。其余组沿用既有规则。
- 未移动加工分支或改变匹配；本次范围为无前序单目标共享ADD输入簇。
- 新增test_shared_add_waist.js；附加布局回归与JS语法检查通过。未完成浏览器视觉验证。Ctrl+F5前端，无需重启后端。

## 2026-10-01 平滑渐细ADD流线
- ADD绘制由直三角形改为两侧三次Bezier闭合带：来源宽、接收端收尖；长横向连接使用水平切线，短距离按局部方向，保留PROCESS箭头。
- 多个ADD按对端节点位置排序分配小幅端口偏移；shared哑铃端口在腰部附近，R1/R2仍在对应半圆。节点布局和匹配不变。
- 新增test_smooth_add_flow.js覆盖正向、反向、垂直、短距离与零长度路径；现有shared anchor及attached布局测试通过，node语法通过。没有完成浏览器视觉验证，不能保证所有复杂曲线无交叉。
- 修改frontend/app.js、流线测试及本文档；Ctrl+F5刷新前端，无需重启后端。

## 2026-10-01 加工入共享节点水平与独立供料靠近
- 用户指定1/4并展示sear与potato支路；当前磁盘1 carmel无sear或potato，2 braised_pork_with_potato包含这些节点。未改动数据；验证1/4双向坐标稳定，以及2/4双向sear水平和potato靠近。
- 独立同侧加工分量在最终inline位移之后整段对齐接收共享节点端口，携带无前序附加物；不单独拉动sear端点。自由单目标供料分支整体向右靠近接收点，保留内部横向间距。
- 新增test_pork_feeder_layout.js；附加布局回归通过。未完成浏览器视觉核验，用户所见编号与磁盘数据差异尚未确认。前端Ctrl+F5，无需重启后端。

## 2026-10-01 倾斜PROCESS平滑曲线
- PROCESS（含split和容器加工）使用对称三次Bezier，近水平边保持直线；保留原颜色、线宽、箭头及节点端口。取消固定向上拱的容器特例。对称控制点使几何中点仍位于曲线上。
- 修改frontend/app.js并新增test_smooth_process_path.js。语法、process曲线与既有ADD曲线测试通过；未完成浏览器视觉核验。Ctrl+F5刷新前端，无需重启后端。

## 2026-10-01 长ADD曲线可见性
- 增加渐细带控制点宽度（0.75/0.2→0.9/0.4），使中后段不至于过早变细。
- ADD增加同色1.25px非缩放描边和圆角连接，缩小视图时陡峭段仍可见；保留来源宽、目标尖、recipe颜色与PROCESS样式。
- node语法、smooth ADD及PROCESS测试通过；浏览器视觉未验证。Ctrl+F5刷新前端。

## 2026-10-01 原文步骤联动侧栏
- `frontend/index.html` 增加并排的 R1/R2 原文步骤侧栏，图形占据剩余宽度。`frontend/app.js` 支持点击文本步骤高亮对应节点/动作，也支持点击节点或边反向高亮关联原文步骤；同一步的多个节点、边和隐式 stage/container 节点同时高亮。
- `backend/app.py` 将 recipe 的 `source_text`、`text_steps`、node/edge `text_step_ids` 接到比较图。兼容从 `node_indices`、`edge_indices`、`node_action_pairs` 读取引用，并按原 recipe 边索引映射到合并图边。
- 后端优先使用 JSON 中的 `source_text`，否则按 recipe ID 读取 `data/llm_text/original_text/<recipe-id>.txt`。历史 JSON 无步骤映射时仍显示原文，并说明节点/动作无法定位具体步骤；带 `text_steps` 的数据支持双向联动。
- 已运行 `node --check frontend/app.js` 与 `python -m py_compile backend/app.py`；未运行测试套件或浏览器视觉检查。前端需要 Ctrl+F5，后端需重启/热重载以载入 `app.py`。

## 2026-10-01 从 original_text 加载原文
- 修复侧栏错误提示：`backend/utils.py` 按 recipe ID 读取 `data/llm_text/original_text/<recipe-id>.txt`，比较 API 在 JSON 没有 `source_text` 时使用该原文。
- 有原文但没有 `text_steps` 时，侧栏展示完整原文并说明缺少节点/动作步骤映射；不再要求用户重新生成原文。图形联动仍需 recipe JSON 中存在步骤映射字段。
- 已运行 `node --check frontend/app.js`、`python -m py_compile backend/app.py`、`python -m py_compile backend/utils.py` 和 `git diff --check`；未运行测试套件或浏览器视觉检查。前端 Ctrl+F5，后端需重启/热重载。

## 2026-10-01 修复原文载入调用未执行
- 原因：`backend/app.py` 的 `_attach_text_alignment` 调用误放在比较接口 `return` 后，成为不可达代码。已移到返回响应之前。
- 已实际调用运行中的 `/compare`：1/10 比较返回 R1 原文594字符、25个步骤，R2 原文432字符、40个步骤，80个节点和78条边带步骤引用。当前数据已有这些步骤元数据，不再按此前历史数据缺字段的假设判断。
- `git diff --check` 通过；未完成浏览器视觉验证。运行中的后端已加载修复，浏览器重新点击 Compare 即可获取新响应。

## 2026-10-07 原文双栏紧凑布局
- `frontend/index.html` 将 R1/R2 原文步骤由纵向堆叠改为同一侧栏内左右两列；侧栏总宽缩为340px，步骤字号、内边距和列间距同步缩小，并用细分隔线区分两份 recipe。
- 两列标题保持顶部可见，长 recipe 名和步骤文字允许换行。节点、动作与文本联动逻辑未改变。
- 已运行 `node --check frontend/app.js` 与 `git diff --check`；未完成浏览器视觉验证。Ctrl+F5 强制刷新前端即可，无需重启后端。

## 2026-10-07 加工边时长波形
- PROCESS边有非空`duration`时，沿边方向绘制正弦波；周期数按统一分钟值的平方根压缩到1–8个完整周期。`duration`正式规定为英文值；现有中文值已转换，例如`at least 4 hours`为4周期，`at least 3 hours`为3周期。波形只在首尾8%渐隐，周期仍清楚可数。
- 无时长时继续使用原有路径（水平边仍为直线，倾斜边保留既有平滑曲线）；ADD边绘制规则不变。duration字段由后端图数据保留；改动仅在`frontend/app.js`，并更新本记录。
- 已运行`node --check frontend/app.js`；未运行浏览器视觉检查。前端Ctrl+F5刷新，无需重启后端。

## 2026-10-07 1/3替代加料保持水平
- 修复1 carmel_brasied_pork与3 brasied_pork_tofu_sauce比较：两份菜谱各自唯一的washed-pork输入加入同一个匹配锅时，按recipe侧分别统计main输入。它们属于两份菜谱的替代流程延续，不再因合并后总数为2而被误判为跨加工分支汇合。
- `nb_inlineContainerTransfers`的加工前驱检查也按R1/R2侧执行；真正同一recipe有多个main输入的汇合仍不视为inline。未修改recipe数据、匹配或节点语义。
- 新增`tests/test_inline_alternative_add_layout.js`，1/3双向比较的两条ADD均与对应哑铃半边水平，通过；`node --check frontend/app.js`通过。完整`test_branch_add_angles.js`仍在既有11/12冰淇淋断言处失败（processed inline transfer相差47px），早于本案例且与本次改动无关。未完成浏览器视觉检查；Ctrl+F5刷新前端，无需重启后端。

## 2026-10-07 9/10加工aux加料支路紧凑化
- 修复classic_moussaka与potato_eggplant_moussaka比较中cut cheese、whisked egg等完整aux加工支路：最终碰撞排布后重新以整支平移方式靠近ADD接收节点，不改变支路内部process几何。
- 新增最终候选评分：在接收端两侧测试多个近端位置，先减少节点/process/标签包围区重叠，再减少ADD与既有边交叉、ADD长度和移动量。9/10双向三条目标支路的中心距由155–171px降到89–137px。
- 新增`tests/test_prepared_aux_feeder_layout.js`，覆盖9/10双向距离、语义不变和重复布局稳定。前端语法、附加main、1/3 inline、分支垂直间距、shared ADD waist检查通过。完整`test_branch_ordering.js`两次都在Python matcher子进程以Windows access violation `3221225477`退出，未进入布局断言；未把它记为通过。浏览器视觉检查尚未完成；Ctrl+F5刷新，无需重启后端。

## 2026-10-07 多支prepared ADD扇入与3/4替代加工紧凑化（替代加工压缩已撤回）
- 完整prepared aux支路按recipe侧进入目标：R1只使用目标上方候选，R2只使用下方候选，shared可使用两侧。每放置一支就把其实际节点/标签占位加入后续评分，避免多支支路重复选择同一坐标。1/4与4/1双向验证四支prepared分支位置互异、保持所属侧且与目标保持紧凑。
- 对“一个相似匹配状态直接ADD、另一recipe先走独有加工链再ADD到同一目标”的严格模式，压缩接收节点及其后续链，并把替代加工节点错层放在直接连接旁。3/4双向的直接ADD限制在135px内，替代链各段限制在155px内。
- exact共享来源不使用上述替代链压缩，保留1/3两侧ADD的原水平规则；不改变匹配、图语义或recipe数据。
- 新增`tests/test_alternative_detour_layout.js`并扩充`tests/test_prepared_aux_feeder_layout.js`。已通过这两项、`tests/test_inline_alternative_add_layout.js`、`tests/test_attached_main_layout.js`及`node --check frontend/app.js`。浏览器视觉检查尚未完成；Ctrl+F5刷新前端，无需重启后端。

## 2026-10-07 3/4单输入靠近与stir链恢复
- 用户新截图确认：需要缩短的是单个aux到pan的ADD，不应压缩跨越另一recipe两个stir步骤的main ADD。删除nb_compactAlternativeDetours及其调用，撤回上述135px直接ADD要求；恢复两步stir的水平130px间距。
- 单个aux输入的候选限定在两个近端环内；全部支路位置确定后再次执行单输入packing，防止为避让远处process线而把输入推远。3/4双向目标输入距pan对应半节点中心47px。
- 更新test_alternative_detour_layout.js，验证输入距离、stir水平与至少120px横向间距、双向稳定和语义不变。该测试、attached_main、prepared_aux_feeder、inline_alternative_add、shared_add_waist、node --check、git diff --check均通过；prepared测试首次Python子进程退出3221226356，重试通过。
- 未完成浏览器视觉核验。修改frontend/app.js、上述回归及本文；Ctrl+F5刷新前端，无需重启后端。

## 2026-10-07 2/3 shared prepared支路放置在腰部
- 用户要求蓝色shared prepared支路进入匹配哑铃的中间区域，并与R1-only prepared支路分开。最终prepared feeder候选改为：R1使用目标上方-70/-100/-130，R2使用下方+70/+100/+130，shared只使用腰部0/-35/+35，并为三条shared支路增加横向近端候选。
- 新增`tests/test_shared_prepared_waist_layout.js`，双向验证三条shared prepared终点距目标中心不超过35、recipe-only终点保持所属侧至少70、两组终点间距至少50、shared彼此不重叠、坐标稳定且语义不变。
- 已通过新回归、prepared aux feeder、attached main、shared ADD waist、3/4单输入/stir链及`node --check frontend/app.js`。本轮未完成浏览器视觉核验；Ctrl+F5刷新前端，无需重启后端。

## 2026-10-07 2/4节点24→25 ADD水平
- recipe 2节点24为匹配pork哑铃，节点25为R1-only wok。旧最终inline修正只处理exclusive→exclusive，导致该matched→exclusive ADD被跳过，wok支路留在上方分支带而形成大角度。
- `nb_finalizeInlineTransfers`增加仅用于最终阶段的matched-source模式：碰撞和支路排布完成后，将recipe-only接收容器及其加工后续对齐到匹配来源对应的R1/R2半节点。早期阶段仍只处理原exclusive→exclusive规则，避免重排其他支路。
- `tests/test_pork_feeder_layout.js`新增2/4及4/2节点24→25端口水平断言；同时把旧potato回归从已过期的2→3索引修正为当前数据的1→2 cut和2→41 ADD。该测试与`node --check frontend/app.js`通过。
- `test_inline_alternative_add_layout.js`本轮在布局前因当前图中找不到旧断言的两份washed-pork来源而失败，未把它记录为通过。后续检查因外部执行授权被拒绝而未运行。浏览器视觉未核验；Ctrl+F5刷新前端，无需重启后端。

## 2026-10-07 9/10 heat水平与1/5终端feeder方向
- 9/10中recipe 10节点27 wok→28 heated butter被最终碰撞分到不同高度。新增最终main→aux加工入口修正：仅当aux继续另一条非ADD加工边时，将同侧exclusive上游整体对齐到aux续链；27→28双向保持水平，butter→stir续链不移动。
- 1/5中recipe 5节点61 pot→62 soup是终端prepared feeder，62随后ADD到58 molded pork，不应套用上述续链规则。新增终端mixed main/aux feeder修正：先保持内部prepare/reduce水平，再将整支按recipe侧放置，R1从上方进入、R2从下方进入。
- 新增`tests/test_moussaka_heated_butter_layout.js`和`tests/test_dongpo_terminal_feeder_direction.js`。两项双向回归、2/4 pork、attached main、`node --check frontend/app.js`和`git diff --check`通过。未完成浏览器视觉核验；Ctrl+F5刷新前端，无需重启后端。

## 2026-10-07 2/5 pot原料簇紧凑间距
- recipe 5 sim_pot节点17的8个R2 raw aux输入被碰撞评分推到第7圈，中心距达到229–256px。exclusive recipe目标的多aux输入现只评估前三个近端圈；shared/merged目标仍保留原8圈避让范围。
- 2/5及5/2中该8节点簇固定使用两行，保持recipe侧别，每个原料到pot中心不超过145px。新增`tests/test_dongpo_pot_ingredient_spacing.js`覆盖双向距离、行数、侧别、稳定性和语义不变。
- 新回归、1/5终端feeder、9/10 heat、2/4 pork、attached main、`node --check frontend/app.js`及`git diff --check`通过。浏览器视觉未核验；Ctrl+F5刷新前端，无需重启后端。

## 2026-10-07 14/15 recipe15 flour节点4靠近加工支路
- recipe 15节点4 flour是无前序raw main，ADD到节点3 heated oil（aux加工快照），原中心距约590px。
- 已撤回“修改findAttachedMainNodes分类”的方案，因为它会改变其他main分支布局。当前规则只扩展最终单节点ADD packing：无前序、单目标、纯ADD的main→aux来源可在最后靠近目标；main→main继续使用原attachedMainIds规则，aux来源沿用原packing。加工过、split和多目标来源均不移动。
- 新增`tests/test_cake15_flour_attachment.js`，14/15及15/14双向验证flour到接收支路不超过150px、坐标稳定和语义不变。新回归、attached main、2/5 pot、1/5 feeder、9/10 heat、2/4 pork、`node --check frontend/app.js`及`git diff --check`通过。浏览器视觉未核验；Ctrl+F5刷新前端，无需重启后端。

## 2026-10-07 14/15 recipe15 matched→exclusive whisk水平
- recipe 15节点12的matched egg-white状态进入节点19的recipe-only whisk续链时，旧规则只对齐exclusive→matched出口，没有对齐matched→exclusive入口，导致对应半节点端口与节点19相差约172px。
- 新增最终`nb_finalizeMergedProcessEntries`：matched节点发出的非ADD加工边进入单侧节点时，保持matched来源不动，将同侧exclusive下游加工链及其自由ADD装饰整体对齐到对应哑铃半节点。split及后续加工保持相对几何。
- 扩充`tests/test_cake15_flour_attachment.js`，双向验证该whisk入口水平，同时保留flour靠近、稳定和语义断言。该回归、attached main、branch vertical spacing、2/5 pot、1/5 feeder、9/10 heat、2/4 pork、shared ADD waist、JS语法及diff检查通过。浏览器视觉未核验；Ctrl+F5刷新前端，无需重启后端。

## 2026-10-07 中英双语步骤显示
- 原文步骤侧栏优先用较大、较粗文本显示 `text_en`，并在下一行用较小、淡色文本保留原始中文 `text`。点击和图形反向高亮仍使用原有 step ID，不改变联动语义。
- 历史 JSON 缺少 `text_en` 时只显示原文作为主文本，保持兼容。后端现有步骤同步会保留新增字段，无需修改 API。
- 修改 `frontend/app.js`、`frontend/index.html`；需 Ctrl+F5 刷新前端。未修改布局坐标或匹配逻辑。

## 2026-10-07 — Preserve split ADD clearance after final process alignment

- Executed: after the final merged-process alignment, restore split portions to
  their recipe-side fan and separate them again. This prevents split ingredient
  additions such as recipe 15 sugar from overlapping a horizontal process link.
- Scope: frontend layout only; recipe data, matching, domains, and graph
  structure are unchanged.
- Validation: the required local JavaScript checks could not be launched in
  this session because the Windows runner failed at process creation with error
  1385. They remain to be rerun when the runner is available.

### Follow-up: recipe 15 sugar split fan

- Executed: detect split groups whose portions each ADD into consecutive
  process nodes. Place each portion 54 px off its target and keep the split root
  104 px off the process lane, choosing the less crowded side dynamically.
- This specifically covers recipe 15 steps 15–18 feeding steps 19–21, while
  leaving ordinary split branches unchanged.

## 2026-10-08 终点多支路汇合紧凑化
- 对至少三条main ADD支路汇入同一右侧终点、且至少三条连接超过180px的结构，按现有纵向顺序压缩各完整分支组；每组整体平移，内部process节点、间距和语义保持不变。
- 相邻分支组中心间距最初限制为82–112px；按后续截图发现该值小于main哑铃的视觉高度，会使eggplant与white sauce支路拥挤，现调整为125–150px。最终接收节点及其process后续组放在汇合栈之后96px，避免接收节点停留在顶部造成多条长曲线重叠。
- 在125–150px基础间距之后增加实际节点包围框检查：按main/aux/container外半径及哑铃half-offset计算节点实体范围；若不同终点分支在同一横向区域仍重叠，则只向下增加后一个分支的间距，直到至少保留14px净空。最终接收组同样检查前序分支实体范围。
- 只处理专属于该接收点的分支组；同时把只流入最终组的aux feeder整组带到新位置。存在其他外部目标的共享/分叉组不会移动。
- 新增`tests/test_terminal_merge_fan.js`，9/10及10/9双向验证终点顺序、自适应间距、跨分支节点实体不重叠、最大连线长度、最终process水平、坐标稳定和语义不变。
- `node --check frontend/app.js`、新回归和`tests/test_attached_main_layout.js`通过。若干历史回归因引用已不存在的旧小写/别名recipe文件而在进入布局断言前失败：prepared aux、cake comparison、cake15、dongpo、vertical spacing；pork回归当前fixture未找到预期案例。未完成浏览器视觉核验，前端需Ctrl+F5，无需重启后端。

## 2026-10-08 哑铃上下ADD带保持分离
- 同一哑铃节点同时发出R1和R2 ADD时，两条渐细带在大部分水平距离内分别保持来源上半圆和下半圆的纵向通道，只在接近各自目标时完成纵向弯曲。
- 后续按用户更正扩展：凡水平跨度超过180px且纵向差超过60px的长斜向ADD带，无论是否来自哑铃，都先沿来源高度水平离开，再在后半段弯向汇合目标；用于避开来源附近的节点和横向process箭头。
- 再次按截图校正：长汇合带不再使用按目标方向旋转的扇出端口，而从所选来源半圆的水平右中心出发。shared节点的R1/R2分别使用上/下半圆中心高度，only_r1/only_r2使用自身节点中心高度。延迟弯曲控制点推进到路径水平跨度的70%和88%，避免仍在来源附近下弯穿过另一条带或process线。
- 保留原来源/目标锚点、端口扇出、颜色、带宽和精确终点；普通单条ADD继续使用原对称平滑曲线，不移动任何节点。
- 新增`tests/test_paired_add_flow.js`验证两条控制带保持上下顺序且终点不变。该测试、smooth ADD、shared anchor、terminal merge fan与`node --check frontend/app.js`通过。未完成浏览器视觉核验；Ctrl+F5刷新前端。

## 2026-10-08 终点压缩后恢复process水平轴
- 原因：终点汇合压缩按ownership group分别平移，但9/11中recipe 11的一条R2 `simmer`连接跨越两个ownership group；下游组被压缩而上游组未同步，原水平连接变成约435px的竖向绕线，并与其他分支纠缠。
- 已执行：终点汇合压缩及节点防重叠完成后，再运行既有`nb_alignProcessBranchAxes`，按R1/R2/shared实际半节点端口恢复process链水平；不改变ADD汇合顺序、节点语义或匹配。
- 新增`tests/test_final_process_axes.js`，覆盖9/10/11三份recipe的全部六种有序比较，排除真实receiver connector和split后，验证全部main→main process边最终端口水平、布局稳定且语义不变。
- process-axis、terminal merge fan、attached main、JS语法及`git diff --check`均通过。未完成浏览器视觉核验；Ctrl+F5刷新，无需重启后端。
# React/ELK migration status (copied workspace)

- The source project at `recipe_vis` remains unchanged; all work is in the
  copied `recipe_vis_plan` workspace.
- React now owns the interface, selection state, and SVG scene graph. Vite is
  the development/build tool.
- ELK layered layout supplies deterministic node positions and edge routes;
  CSS transitions smooth changes between comparisons.
- The existing backend contract and visual grammar are retained, including
  recipe colors, ingredient icons, dumbbells, process labels, physical-state
  rings, and temperature-coded edges.
- The former D3 implementation remains available at `/legacy.html` for direct
  comparison.
- Layout refinements can continue in React without changing the data pipeline:
  terminal fan-out, shared anchors, ADD clustering, process axes, and adaptive
  collision spacing are isolated in the layout and graph components.

## 2026-10-12 React long-ADD outer-branch routing

- The initial diagnosis used recipes 1/2 and did not resolve the reported
  screenshot; that recipe-pair diagnosis is withdrawn. The user identified the
  actual comparison as recipes 6/7.
- Retained in the copied React workspace: long ADD edges with more than 180px
  horizontal span and 60px vertical change now retain their source branch lane
  through 70% of the span and finish the bend between 88% and the receiver.
- This keeps a long processed branch from bending through shorter outer feeder
  branches near its receiver. Short ADD edges retain the existing recipe-side
  approach, and node positions, matching, graph data, and process edges are
  unchanged.
- Reproduced recipes 6/7 and traced the crossing to the free shared-shrimp → R2
  cut detour intersecting three processed R2 aux feeders entering the adjacent
  shared wok. `nb_clearOuterDetours` now moves this structural two-node detour
  left as a rigid unit until all of those prepared ADD feeders clear its process
  edge. The rule is structural and does not use recipe names or node indexes.
- Validation executed after the 6/7 correction: React/Vitest suite (10 tests)
  and Vite production build. Browser visual verification remains for the user
  after refresh.

# Recipe-specific edge anchoring

## Legacy runtime removed

The user-visible legacy page and toolbar link remain removed. The previously
approved compact coordinates are preserved through an internal local layout
host (`layout-host.html`) using local D3. It is not exposed as a view and skips
recipe loading/drawing in layout-only mode. ELK remains the fallback.

## React canvas navigation

- The SVG now fills a fixed clipped canvas; graph movement uses one viewport
  transform rather than resizing the SVG and scroll area.
- Mouse/touch pointer drag pans the graph. Wheel, `+`, and `-` zoom smoothly
  around the pointer or canvas center.
- Arrow keys pan by 48px. `0` and `F` run a true fit-to-canvas calculation.
- A zoom percentage is shown in the toolbar. Node selection is suppressed
  after a drag so panning does not accidentally select a recipe state.

## Refresh behavior

The React app persists the last valid recipe pair and automatically rebuilds
that comparison after refresh. Initial API/layout work displays a loading
notice. Repeated no-click browser checks rendered 67 nodes with no page errors
on six consecutive fresh pages.

### Compact collision-free ADD distance

ADD placement starts close to its receiving node. Collision search expands the
feeder by 24px at a time and keeps the first clear candidate, so the ADD edge
is the shortest checked collision-free route. Empty-container and provenance
merge gaps were reduced accordingly; process branches still move as rigid
units and retain horizontal process edges.

Standalone ingredients with one ADD target are now packed next to that target
in rows of at most five. Collision detection compares actual node rectangles,
not a single rectangle spanning all empty space within a long process branch.
This removes the long ingredient rays seen in the React screenshot while
retaining compact R1-above, shared-middle, and R2-below clusters.

- Process and ADD edges now use the same recipe-aware anchor calculation.
- R1 edges route through R1 node centers; R2 edges route through R2 centers.
- For shared dumbbells, R1 uses the upper-disc center and R2 uses the
  lower-disc center. Shared edges remain centered on the whole dumbbell.
- Edge paths remain below node artwork, which clips the center-to-center route
  at the visible disc boundary.

## React semantic branch refinement

- ELK output is now refined by process-connected component. Process endpoint
  equations use the backend `source_anchor` and `target_anchor`, so each
  process line remains horizontal at the correct dumbbell half.
- Pure R1/shared/pure R2 components are placed in upper/middle/lower bands.
- Ordinary ADD feeders use upper/middle/lower target approaches for
  R1/shared/R2.
- Empty container targets keep ADD horizontal. A container with a process
  predecessor is treated as a merge: R1/shared feeder components move
  above-left and R2 feeder components move below-right.
- Feeder placement moves the whole process component, preserving its internal
  horizontal process geometry and data semantics.
- Split transitions delimit rigid process branches. The collision pass checks
  expanded branch bounds after ADD placement and extends a feeder outward in
  58px steps until it clears other branches. R1 expands upward, R2 downward,
  shared/empty-container feeds leftward, and provenance merges expand along
  their prescribed diagonal. ADD length is flexible; process geometry stays
  fixed.

## 2026-10-12 ADD edge taper

- ADD edges retain their established routing but render as a tapered ribbon:
  7px wide at the source and 2.5px wide at the receiving node.
- A transparent centerline preserves the click target and existing target
  arrowhead.
- The wide click target and arrow-bearing centerline are separate paths, so
  zooming out cannot scale the arrow marker from the 10px interaction stroke.
- Process and ADD markers use `userSpaceOnUse`, keeping arrowheads proportional
  to graph nodes instead of to non-scaling SVG stroke widths at different zooms.
- Process lines still terminate at the recipe-specific node center. Their
  arrowhead is carried on a separate transparent path ending at the visible
  circle boundary, preventing the node from covering the correctly sized arrow.
- Validation: frontend Vitest suite passed (17 tests); Vite build passed.

## 2026-10-12 multi-branch receiver spacing

- General cause: obstruction packing used complete branch bounding boxes and
  stacked every intersecting x-range. The ADD-angle pass then moved the same
  receiver group once per incoming prepared branch, accumulating lane offsets.
- Obstruction packing now reserves space from actual node-disc collisions.
  Sparse branches can reuse vertical space without changing their internal
  process geometry.
- Receiver groups with at least three incoming inter-branch ADD joins are no
  longer moved edge by edge. The existing terminal-fan pass places the complete
  many-to-one structure once.
- Active r9/r11 pipeline verification reduced the graph center-coordinate
  height to 973px and its largest empty y interval to 157px. The React Vitest
  suite passed (17 tests), the required attached-main layout test passed, and
  the Vite production build passed.
- Several optional legacy layout scripts could not enter their assertions
  because they reference removed lowercase/alias data filenames. The pork
  fixture also no longer finds its historical expected case; these are stale
  fixture failures rather than results from the active React layout.

## 2026-10-12 experimental semantic ELK layout

- Added a selectable `Auto (ELK)` mode while retaining `Established` for direct
  comparison and rollback. The selected mode persists in local storage.
- Auto layout uses ELK Layered with fixed recipe-aware input/output ports,
  process-edge priority, edge-label dimensions, crossing minimization, balanced
  node placement, and spacing for nodes, edges, and disconnected components.
- Existing semantic refinement still enforces horizontal process anchors,
  R1/shared/R2 bands, compact standalone additions, provenance merges, and
  collision expansion. Node dragging remains a view-local override.
- ELK is dynamically imported into a separate production chunk. Auto failure
  falls back to Established, then to the fast emergency layout.
- Validation: React Vitest suite passed (18 tests), including deterministic Auto
  layout and recipe-band placement; syntax checks and Vite production build
  passed. Automated browser inspection was unavailable because the Windows UI
  runner could not start (`CreateProcessWithLogonW` error 1385).

### Auto branch offsets and compact additions

- Auto layout now runs the established process-branch separation pass after
  semantic refinement. Overlapping process branches and their owned ingredient
  decorations move as rigid groups, retaining horizontal process edges and
  recipe-specific anchors.
- The compact standalone-ADD placement runs before branch separation; ownership
  propagation carries those additions with their receiver branch, so the final
  offset cannot stretch a previously short ADD edge.
- Full r9/r11 Auto coordinates contained seven multi-node process branches with
  zero overlapping branch bounds at a 20px diagnostic margin.
- Validation: React Vitest suite passed (20 tests), including rigid branch
  separation and final compact-ADD distance; Vite production build passed.

### Auto prepared-branch ADD compaction

- Extended compact placement from standalone nodes to complete process-linked
  donor branches. A branch with one external receiver group moves as a rigid
  unit so its terminal sits 96px before the receiver and on the appropriate
  R1 upper, shared center, or R2 lower approach lane.
- Raw decorations feeding that donor move with it. A true middle stage fed by
  another process branch is excluded to avoid shortening one ADD by stretching
  another.
- Standalone aux additions into containers are now packed near the container.
  Main branches entering provenance containers retain the established diagonal
  branch-merge rule.
- The collision offset pass runs again after compaction. Validation: React
  Vitest suite passed (21 tests) and Vite production build passed.

#### Receiver-relative correction

- Replaced the loose distance threshold with explicit terminal positions:
  process donors finish 88px left of the receiver, R1 approaches from 82px
  above, R2 from 82px below, and shared approaches at the center lane.
- Donor branches are compacted upstream-to-downstream. When a downstream branch
  moves later, its already compacted upstream preparation bundle moves with it.
- Standalone ingredient groups remain under the existing five-per-row compact
  packer and are excluded from per-branch slot offsets.
- Validation after the correction: React Vitest suite passed (21 tests) and
  Vite production build passed.

### 2026-10-12 Auto ADD placement follows Established

- Auto (ELK) no longer invents separate fixed 88/82px slots when a complete
  process donor is still far from its unique external ADD receiver after the
  semantic and branch-separation passes.
- ELK continues to determine the overall graph and each rigid process branch.
  For the final donor-to-receiver approach, Auto now copies the source/target
  anchor vector from the Established layout and moves the donor plus its
  upstream preparation bundle as one unit. Matching, graph data, node domain,
  state, and process-branch geometry are unchanged.
- Added a regression that compares Auto and Established ADD anchor vectors
  directly. React Vitest passed (21 tests), the Vite production build passed,
  `node --check frontend/src/layout/semanticElkLayout.js` passed, and
  `node tests/test_attached_main_layout.js` passed. Browser visual verification
  remains to be done after a hard refresh; no backend restart is required.
- Screenshot follow-up: the first correction covered complete process donors
  but not the distant standalone ingredients shown by the user. Auto now also
  restores the Established receiver-relative offset for every no-input,
  single-target, pure-ADD node after all branch movement is complete.

### 2026-10-13 Established ADD-derived process boundary

- Verified from source JSON and the merged r9/r10 graph that r10 node 24 is an
  R2-only container with incoming `M1 -> M24` ADD (`B -> S`) and outgoing
  `M24 -> M12` FRY (`S -> B`), while r9 node 42 is a standalone aux node with
  only one outgoing ADD edge.
- Process-chain alignment now preserves an exclusive node's established side
  when it is derived by ADD from a shared/dumbbell node. Ordinary auxiliary
  additions do not block chain alignment, so the r10 node 10 predecessor chain
  can still align with its shared target.
- `node --check frontend/src/layout/portedLayout.js` and
  `node tests/test_attached_main_layout.js` passed. Browser visual verification
  remains pending after a force refresh; no backend restart is required.
- R9 node 42 was not excluded by the standalone predicate. Its shared target
  is moved once by the R1 split fork and again by the R2 split fork; a one-time
  `movedAddSources` guard left node 42 behind after the second move. Attached
  standalone ADD sources are now re-anchored after every target move.
- Exclusive process-chain alignment now evaluates the ideal aligned lane and
  several recipe-side outward alternatives with one shared priority: preserve
  semantic side constraints, then minimize edge crossings, then node overlaps,
  then extra displacement. Internal chain geometry remains rigid.


## 2026-10-13 Established: 不可避免的边冲突时选冲突最少的位置（当前规则）
- 触发案例：16/18（Basic Cake Baking 1/3）共享终端 split 份量的长 ADD 带穿过其他加工链；6/7（Shrimp with Broccoli / Oil Braised Shrimp）三条 R2 prepared feeder（cut→add）原先落在长 ADD 带 M7→M11 之上而相互压线。
- 原因：此前 feeder 放置只用中心直线与矩形包围检查，不含渲染器真实 ADD 路径（长带 70%/88% 延迟弯曲）与 feeder 本体是否被他支路穿过；分支分离（`separateProcessBranches`）又在其后平移 feeder，导致布局阶段判定无冲突的位置在最终坐标中重叠。
- 已执行：`frontend/src/layout/portedLayout.js` 导出 `minimizeEdgeConflicts`，由 `establishedLayout.js` 在 `separateProcessBranches` 之后基于最终坐标调用（不再在 `newBranchLayout` 内调用）。只移动 x/y，不改节点 domain、kind、状态、匹配、process 边相对几何。
  1. prepared aux feeder 链（仅 aux、无外部输入、单一 ADD 出口）：在接收节点附近、所属 recipe 侧候选格中（间距 55–180、侧向偏移 45–205，步长 11px），对同一接收点的多个 feeder 联合搜索，保持刚体平移。
  2. 单个自由 aux 加料：仅当其当前位置被边穿过或有交叉时才在接收点附近重定位，且只接受严格更优的位置。
  3. 自由终端 split 份量（只有 ADD 出口）：只做纵向 65px 步长位移，不得越过附近 matched 节点的上下侧。
- 优先级：先满足约束（候选不得与非 aux 节点主体重叠；feeder 保持接收端所属 recipe 侧并靠近接收节点；exclusive 份量不越侧），再按真实 ADD 路径计分：边穿过节点×100、边交叉×10、aux 轻微接触×5、边长×0.001；仅 feeder 之间/aux 之间允许不超过 40% 的轻微接触，作为比压穿长带更小的碰撞。
- 6/7 结果：三条 cut feeder 均在长 ADD 带上方紧凑排列并靠近 M8。16/18：M3 位于 M2 上方。
- 验证（324 个有序组合，使用一次性缓存的后端响应，分块运行）：坐标全部有限；直线近似指标——边交叉 1676→1420，边穿节点 6562→6116，节点中心重叠（<22px）708→654，没有任何组合的重叠增加。该指标用直线近似，不是真实曲线；仍有 30 个组合的交叉数和 32 个组合的穿节点数比改动前多（计分用的是曲线路径）。单个自由 aux 的重定位（第 2 项）在这 324 个组合上没有改变总数。
- 测试：`frontend` vitest 24 项通过（新增 `src/layout/edgeConflicts.test.js`，覆盖 feeder 靠近接收点、避开长 ADD 带、确定性）。旧 `tests/*.js` 读取 `frontend/app.js`，不覆盖本改动。验证期间 Node 多次以 Segmentation fault 退出（本机已记录的原生崩溃），单个用例单独重跑通过，因此回归改为分块并重试。
- 未完成：浏览器视觉验证；强制刷新前端，无需重启后端。
- 2026-10-13 追加（9/9 自比较，节点 40 = M18 压在 ADD 带上）：自由终端 split 份量若有独立 aux 加料输入（如 M18 的 A21），原先被排除；现在份量连同这些附加 aux 一起纵向整体移动。同一 split 根的兄弟份量保持上下顺序（不互换）。M18 由 y=350 移到 545，仍在 M19（618）之上。
- 追加后全 324 组合复测（直线近似）：边交叉 1676→1519，边穿节点 6562→6120，节点重叠 708→641，没有组合重叠增加。与追加前（1420/6116/654）相比，交叉数回升约 100，原因是有 split 份量被移动；46 个组合交叉数高于改动前、31 个组合穿节点数高于改动前。vitest 24 项通过。仍无浏览器视觉验证。

### 2026-10-13 更正：撤回“统一分支间距”，只在真实重叠时分离分支
- 已撤回：`equalizeBranchGaps`（把所有上下相邻分支的净间距统一到 76px）。原因：它会移动没有碰撞的分支。1/3（默认 Auto 模式下读取 Established 坐标）中 R2 锅分支（含 r2 node 14，M9）被无故下移 66px，3/1 中整组上移 50–78px，使原先无碰撞的位置被改动。
- 当前规则：`frontend/src/layout/establishedLayout.js` 的 `separateOverlappingBands` 在 `separateProcessBranches` 之后运行。仅当某个 process 分支（含附属 aux）的节点体与其上方分支节点体重叠或间距小于 8px 时，把该分支整体下移到刚好清除；没有碰撞的分支保持原位置。只改 y，x、顺序、节点语义不变。
- 复测：1/3 与 3/1 在 Auto 模式下 node 14 所在分支恢复到未加此规则时的坐标；9/11 中 aux 压在 main 上的跨分支重叠（如 M25/A15）仍被清除。不再追求“所有分支间距相同”，该点用户此前提出的间距不均仍可能存在，需要另行定义目标间距。
- 更正后 324 个有序组合复测（直线近似，分块运行并重试；Node 本机间歇性 Segmentation fault，单个用例逐个运行均通过）：边交叉 1676→1432，边穿节点 6562→5441，节点中心重叠（<22px）708→473；仍有 39 个组合交叉数、23 个组合穿节点数高于改动前，5 个组合重叠各增加 1–2（10/12、12/9、13/13、13/2、17/4）。vitest 24 项通过。尚无浏览器视觉验证。

### 2026-10-13 1/3 node 14 应在哑铃中间：共享 container 不再被 alignExclusiveInputsToSharedPorts 抬高（当前规则）
- 目标（用户确认）：1/3 中原始 node 14（共享 wok_pot container，r1=14/r2=17，merged_exact）放在其 process 目标哑铃（r1 15 / r2 20）的中间，两条 `low heat`/`heat` 边接近水平，su/oi 加料在其上方。
- 诊断：逐阶段跟踪 M10/M11 坐标。`nb_avoidBranchObstructions` 与 `nb_restoreSplitBranchLanes`（含“压缩超过130的空白”）之后两者同 y；最后一步 `alignExclusiveInputsToSharedPorts` 把 M10 上移 137px 而 M11 不动。关闭空白压缩后斜线仍在，因此不是分支间距逻辑。原因：该函数只跳过哑铃来源，把 merged_exact（非哑铃）共享 container 当作单侧链：对 R1 边计算到哑铃上半的对齐，并从 dy、dy−48、−80、−112 中选了最外侧候选。
- 已执行：`frontend/src/layout/portedLayout.js` 的 `alignExclusiveInputsToSharedPorts` 对 `source.kind === "merged_exact"` 的共享来源直接跳过（共享来源同时服务两个 recipe，保持在目标中间）。只改 y，不改匹配、domain、状态。
- 验证：Established 1/3：M10 (1258,293)→M11 (1388,293) 水平；Auto 1/3：(3264,461)→(3394,461)，3/1 同样水平。此前撤回的“统一分支间距”及误判（把斜线当作 Established 本来就是这样）以本条为准。
- Auto（`semanticElkLayout.js`）新增 `restoreEstablishedContainerStarts`：没有 process 入边的 container 起点沿用 Established 与其 process 目标的相对位置，并带上只向它加料的独立 aux；压到其它节点时跳过。108 个组合上 Auto 节点重叠 2726→2623，无组合变差。
- 未完成：浏览器视觉验证；其它含共享 container 起点的组合会随之改变，全组合回归见本次回复。

## 2026-10-13 React：边标签放在各自边上并互相避让；原文栏按 R1/R2 着色
- 问题：PROCESS 边标签固定画在“起点 y−9”处，斜线上的标签离开边本身；两条共端点的边（如 1/3 的 heat / low heat、两条 split）标签重叠，无法判断标签属于哪条边。
- 已执行：新增 `frontend/src/layout/edgeLabels.js`。每条非 ADD 的有 action 的边只有一个标签，落在该边自己的线段上；优先中点，其次沿边向两端依次尝试（0.5、0.42、0.58 … 0.18、0.82），选第一个不与节点体、其它标签重叠的位置，都不行时取重叠最少的位置。标签画在独立的 `edge-labels` 层（在边之上、节点之下），文字颜色随 heat/cold/prep，带浅色描边保证可读。`GraphEdge` 不再自己画标签；ADD 边仍不显示标签。
- 原文栏：R1 栏用 R1 颜色 `#C4D1FF`（透明度 0.30），R2 栏用 R2 颜色 `#CAF95F`（透明度 0.26）；标题行用对应浅色实底，步骤条目底色半透明白，条目左边线分别为 R1/R2 色，选中仍为黄色。
- 验证：vitest 26 项通过（新增 `edgeLabels.test.js`，覆盖标签在自己的边上、共端点的两条边标签分开、ADD 边不画标签）。浏览器 1/3：19 个标签互不重叠，`heat` 与 `low heat` 分别在 (1323,281) 与 (1323,306)；原文栏背景颜色经 computed style 与截图确认。标签与边的视觉对应仍需用户在页面上确认；强制刷新前端，无需重启后端。

## 2026-10-13 React：选中高亮改用 R1/R2 实色，不再用黄色
- 原文步骤行选中：R1 栏整行底色和左边线为 `#C4D1FF`，R2 栏为 `#CAF95F`（实色，无透明度）。
- 图中选中的节点和边：按选中的原文步骤所属 recipe 取色。只有 R1 步骤键命中用 R1 色发光，只有 R2 命中用 R2 色，同时命中（共享节点/边）时 R1、R2 两色叠加发光。判断函数 `selectedSides`（`frontend/src/graph.js`），节点/边 class 为 `selected sel-R1|sel-R2|sel-both`；样式在 `frontend/src/styles.css`，已删除全部 `#efb900`/`#fff1a8`/`#e0a800`。
- 验证：vitest 26 项通过；浏览器中分别点击 R1、R2 栏第 4 步，选中行底色为 rgb(196,209,255) / rgb(202,249,95)，命中的节点和边带对应的 `sel-R1` / `sel-R2` 并使用同色 drop-shadow。发光效果的视觉强度（浅色在浅灰背景上的可见度）未经用户确认。强制刷新前端，无需重启后端。
- 2026-10-13 高亮调整：节点高亮由整节点 CSS drop-shadow 改为 SVG 光晕层（`GraphNode.jsx` 的 `node-halo`）。光晕半径=节点半径+4，高斯模糊 stdDeviation 2.5（`GraphCanvas.jsx` 中 `#halo-blur`），整体不透明度 0.55，比之前更透明、半径更小。哑铃节点：上半圆用 R1 色 `#C4D1FF`、下半圆用 R2 色 `#CAF95F`（只命中一侧步骤时只亮对应半圆）；非哑铃的共享节点同时命中两侧时，上半盘 R1、下半盘 R2。边的高亮 drop-shadow 缩小到 2–3px 并加透明度（0.7–0.75）。验证：vitest 26 项通过；浏览器点击共享哑铃节点后 `sel-both`，光晕为 R1 圆 `cy=-25` 与 R2 圆 `cy=25`。视觉强度需用户确认；强制刷新前端。
- 2026-10-13 字号与颜色：边标签字号 10→13px、全部黑色（不再按 heat/cold/prep 着色），标签占位常量同步为 `CHAR_WIDTH=7.4`、`LABEL_HEIGHT=17`（`edgeLabels.js`，避让按新尺寸计算）。原文栏字号 11→13.5px，标题 12→15px，步骤编号 9→11px，原文小字 12px；为容纳更大字号，右栏宽度 340→400px。验证：vitest 26 项通过；浏览器 1/3 中 19 个标签 fill 均为 #000、字号 13px、互不重叠。强制刷新前端。
- 2026-10-13 原文栏字重变细：步骤正文 `strong` 由粗体改为 400，R1/R2 标题 600，步骤编号 500；边标签仍为 600。强制刷新前端。
- 2026-10-13 边标签字重 600→400，描边 5→4px。强制刷新前端。

## 2026-10-13 Established：汇合前的独立 process 链按常规边长靠近汇合点（16/18 的超长 stir 边）
- 现象：16/18 中 M7→M9（stir R1）约 910px、M6→M9（stir R2）约 780px，而常规 process 边长 130px。原因：汇合节点 M9 因来自底部长链（M17→M19/M21）的 ADD 输入被推到很靠右，M9 的两条 process 前驱链仍留在原处，边被拉长。已有的 `NB_SPINE_X_GAP` 压缩只处理“唯一前驱”的段，汇合处按既有约束被保留。
- 已执行：`frontend/src/layout/establishedLayout.js` 新增 `compactJoinChains`，在 `separateOverlappingBands` 之后、`minimizeEdgeConflicts` 之前运行。对每个 process 汇合边，若前驱离目标超过 130px+40px，则把该前驱上游的整条 process 链（以及只向这条链加料的独立 aux）整体右移，使最后一条边为 130px。仅 x 变化，y、节点 domain/状态/匹配不变。
- 约束（不满足则不动）：上游含 split 子节点；上游节点有指向链外（汇合点之外）的 process 出边；右移后链的 ADD 出边会不再指向前方；右移后与链外节点体重叠（每次递减 65px 重试，不足 40px 则放弃）。split 边不处理，仍可能很长。
- 验证：16/18 Established 的 stir 边不再出现在最长边列表里；浏览器中 stir 标签间距约 130px。324 个组合：非 split process 边宽度 >300 的条数 201→166，总长 134698→106488，27 个组合改善、0 个变差。边交叉 1428→1411，穿节点 5453→5471（19 个组合略增、6 个减少），节点重叠 473→472。vitest 28 项通过（新增 `compactJoinChains.test.js`）。尚无浏览器视觉验证。强制刷新前端，无需重启后端。
- Auto（ELK）模式未应用该规则。

## 2026-10-13 Established：process 链、split 边、整组左移（16/18 的超长边）
- `compactJoinChains` 扩展：汇合前驱所在的整组 process 连通节点（去掉汇合点后连通的全部节点，含分叉链、split 子节点开头的链）连同只向它加料的独立 aux 一起右移到最后一条边为 130px。右移后 ADD/split 出边必须仍指向前方且不压节点（每次减 65px 重试）。324 组合：非 split process 边宽度 >300 的条数 166→94，总长 106488→45110，代价是直线近似的边交叉 1411→1594、穿节点 5471→5655。
- `minimizeEdgeConflicts` Phase 2（自由终端 split 份量）除纵向外增加 x 向 split 源靠近：x 取“分裂源 +130 起、步长 65”的候选，y 增加“分裂源到当前位置连线上的点”；split 边超过 260px 的部分按 0.25/px 计入代价，排在碰撞（穿节点×100、交叉×10）之后。同时修正 R1/R2 份量“不越过附近 matched 节点上下侧”的检查：按候选 x 判断，不再按旧 x。16/18 的 split 边由 935/900/844/528 降到 226/221/219/477。324 组合：宽度 >300 的 split 边 371→278，总长 226171→161488；ADD 总长 +2%，边交叉 1609→1632。
- 新增 `compactComponentsLeft`（在 `minimizeEdgeConflicts` 之后）：process 连通组（连同只经 ADD 向它供料的整组：独立 aux、prepared 供料链）整体左移，到使其周围 ADD/split 边总长最短的位置；传入 ADD/split 边不得短于 130px，不压节点；只改 x。16/18：汇合组左移 585px，M19→M9 935→350，M21→M11 740→155，M22→M12 1195→610，M3→M7 1715→1130。324 组合：ADD 总长 1461770→1440614（59 个组合变短、0 个变长），边交叉 1632→1661，穿节点 5685→5703，节点重叠 472→470。
- 测试：vitest 31 项通过（`compactJoinChains.test.js`、`compactComponentsLeft.test.js`）。Auto（ELK）未应用上述规则。浏览器视觉验证未完成。
- 注意：`compactComponentsLeft` 里局部变量名 `process` 会遮蔽全局 `process`，调试输出需用 `globalThis.process`。

## 2026-10-13 碰撞优先：压缩前先检查全图边/节点碰撞；split 份量可交换顺序；整组左移重复执行
- 触发：16/16 中 split 边 M12→M16 穿过 scrape 边 M5→M6（该交叉在未加任何新规则的原布局里也存在，不是新规则引入）；16/18 的 R2 node 30（M28）分支 x 仍然很靠右。
- `portedLayout.js`：新增并导出 `createConflictModel(nodes, edges)`（边按渲染器路线计：长 ADD 带先保持源行再弯曲；`partsIds(ids)` 返回穿节点数、交叉数、轻微接触数、边长）。`minimizeEdgeConflicts` 改用该模型，行为不变。
- `establishedLayout.js`：新增 `makeCollisionGuard`。`compactJoinChains`、`compactComponentsLeft` 的每个候选位移，必须不增加该整组周围的边穿节点数和边交叉数才允许（原来只检查节点体重叠和 ADD/split 方向）。
- split 份量：长度惩罚改为超过 260px 的部分 0.1/px、上限 30（约 3 次交叉）；原先 0.25/px 无上限会为缩短 split 接受交叉，上限过低（9）则 16/18 的 split 又变回 700–970。兄弟份量的上下顺序由硬约束改为软约束（互换一对代价 6），只有互换能少一次交叉时才换。16/16：交叉与穿节点均为 0。16/18：split 最长 228，仍有 1 处 split×split 交叉（M0→M2 与 M8→M3）。
- 边标签（`edgeLabels.js`）：除避让节点和其他标签外，也避让其他边的线（含 ADD 曲线）；使用 `createConflictModel` 的路线。
- `compactComponentsLeft` 重复最多 4 轮：先移动的组可能腾出被它挡住的组。16/18 的 node 30（M28）分支 x 2843→2128，M27→M29 的 ADD 为 (130,130)。
- 324 组合（直线近似，对比上一版）：边交叉 1661→1242，边穿节点 5703→5443，宽度 >300 的 split 边 300→233（总长 165655→121053），ADD 总长 1440614→1430647，节点重叠 470→472（17/4、4/17 各 +1）。最后一次“整组左移重复”改动之后的全组合复测见本次回复。vitest 32 项通过。
- 页面空白：Vite 热更新期间浏览器缓存了编辑中的 `edgeLabels.js`（报错 “does not provide an export named placeEdgeLabels”），磁盘与开发服务器返回的文件均正确；需强制刷新。未在浏览器中再次确认。
- 整组左移重复执行后的 324 组合复测：边交叉 1242→1242，边穿节点 5443→5442，节点重叠 472→472，宽度 >300 的 split 边 233→233，ADD 总长 1430647→1428546；没有组合变差。

## 2026-10-13 Established：aux split 扇的根节点放在份量远离接收点的一侧
- 现象：14/15、15/14 中糖（`su`）的 aux split 扇，根节点与两个份量排成同一行（根在两份量中间，行内间距 ≈ 65–130），split 边水平且很短，“split” 标签被节点压住、无法分辨。16/18 中根节点在份量下方仅 60，split 边近乎垂直。该排布在未加任何新规则的原布局里就存在。
- 已执行：`frontend/src/layout/portedLayout.js` 的 `minimizeEdgeConflicts` 新增 Phase 3。对没有输入、全部出口为 split、且份量都是 aux 并且份量的出口全部是 ADD 的根节点：x 取份量 x 的平均值，y 放在份量远离其接收点的一侧（份量在接收点下方则根在份量下方，反之在上方），距离在 70/100/130/160 中选碰撞最少且最近的一个；份量 x 跨度小于 60 时从 100 起选，保证近乎垂直的 split 边也留出标签空间；同侧都不可用时才尝试另一侧（代价 +5）。只移动根节点。
- 结果：14/15 的糖扇根 (1025,229)、份量 (960,159)/(1090,159)，呈 V 形；两侧 split 长度约 96。15/14 对称。16/18 根 (868,887)，份量行 y=817，距 70。
- 324 组合（直线近似，对比上一版）：边穿节点 5442→5288，边交叉 1242→1223，节点重叠 472→417，宽度 >300 的 split 边 233→220；没有组合重叠增加。vitest 33 项通过（`edgeConflicts.test.js` 新增 aux split 扇根节点用例）。尚无浏览器视觉验证；强制刷新前端。

## 2026-10-13 React：节点 hover 显示两侧的完整状态与 flavor
- `frontend/src/components/GraphNode.jsx` 的节点 `<title>` 现在对每个有节点的 recipe 侧显示三行：`R1/R2 original node index: N · name`；`type · physical state · chemical state`（取 `state_r1/state_r2`，原始 `physical_state`，不是描边分组）；`flavor: …`（取 `flavor_r1/flavor_r2`，列表用逗号连接，缺失显示 none）。共享节点两侧各显示一段，所以状态不同（如 14/15 的 batter/raw 与 paste/cooked）可直接对比。
- 浏览器验证：共享节点 hover 文本含两侧各自的 physical/chemical state 与 flavor；多 flavor 显示为 `savory, deodorizing`；页面加载正常，vitest 33 项通过。强制刷新前端。
- 过程中一次编辑把 `join("\n")` 写成了字符串内的真实换行，导致 Vite 对 GraphNode.jsx 返回 500、页面空白；已修复并确认返回 200。

## 2026-10-13 14/15 数据更新后布局混乱：split 份量不再拖动接收端；链末端的 split 根不再被搬走
- 背景：recipe 14（18:51）、15（19:04）的 JSON 在缓存之后被修改，比较图由 47 节点/54 边变为 43/52，新增三个 merged_similar：`yolk_mixture`（14:14/15:6）、`cream`（14:12/15:17）、`ice_cream_mixture`（14:27/15:18）。此前“29 与 18 为什么不合并”的节点现在以 27/18 合并。新图的布局出现：黄油酱 R1 链被抬到图最上方、蛋清 R1 链落到共享行下方、`ice` 边斜得很长、纵向约 1000。
- 诊断（逐阶段跟踪 M2/M7/M21/M24）：
  1. `nb_angleBranchAdditions` 把“只有 split 入边的自由 split 份量”（M26）当作“已有 process 前驱的独立分支”，来自 M26 的 ADD 触发整组接收端平移：M21 及其下游被上移 260，而汇入它的两条链（M24、M17）留在原处，两条汇合边都倾斜。
  2. `newBranchLayout` 末尾“split 扇靠近连续接收节点”的 IIFE（原为 recipe 15 的糖扇）把蛋清链末端 M7 当作扇根搬到接收节点旁（x +780、y +251），`ice` 边 M6→M7 被拉斜。
- 已执行（`frontend/src/layout/portedLayout.js`）：(1) `nb_angleBranchAdditions` 的 join 条件要求来源有“非 split 的 process 入边”；(2) 上述 IIFE 对“有非 split process 入边”的根节点跳过，只处理没有 process 输入的自由根。
- 14/15 结果：高度 759→630；蛋清 R1 链 M2/M6/M7 同在 y=275，`ice` 边 130px 水平；黄油 R1 链 y=400、R2 链 y=502、M21 y=425，R1 半圆端口水平；process 与 split 边的交叉 0、穿节点 0；宽度 >400 的边 8→4。15/14 同样紧凑（高 655）。
- 324 组合（缓存重建，用当前数据；对比这两处改动之前；直线近似）：64 个组合改变。斜的 process 边（纵向差 >60）117→97（19 个组合变好，0 个变差），宽度 >300 的 split 边 222→193（总长 103613→90302）；代价：边交叉 1281→1346，穿节点 5257→5305，ADD 总长 1421637→1473711（+3.7%），节点重叠 415→418（17/14、9/4、9/6 各 +1）。vitest 33 项通过。尚无浏览器视觉验证。
- 注意：测试用缓存文件已被清理过一次，本次重建；所用比较数据为当前 data（含上述 14/15 更新）。

## 2026-10-13 碰撞/流向规则一轮（边交叉优先级、倒流修复、链的 recipe 侧）与 join 步骤的碰撞检查
- `portedLayout.js`：`createConflictModel` 的 `partsIds` 新增 `crossProc`（涉及 process 或 split 边的交叉数），`scoreIds` 对其额外加权（process 交叉 = 30，ADD×ADD = 10，穿节点 = 100）。新增 Phase 4：一条只含同一 recipe 节点、由匹配 main 节点的 split 开头的 process 链，若位于该节点错误的一侧（R1 在下/R2 在上），整条链（含只向它加料的 aux）移到正确一侧最少碰撞的行，起点与该节点的 recipe 半圆对齐。Phase 3 的 aux split 扇根节点 x 改为取最左份量的 x，所有 split 边不再倒流。
- `establishedLayout.js`：新增 `fixBackwardProcessEdges`（倒流的 process 边：把其目标连通的整组右移到边长 130px，仍需 ADD/split 出口指向前方、不压节点、通过碰撞检查）。碰撞检查 `makeCollisionGuard.allows` 同时要求不增加穿节点、不增加任何交叉、不增加 process/split 交叉。
- 用户要求恢复 join 步骤的碰撞检查（严格版）。此前我曾把检查放宽为只看穿节点和 process 交叉，使 16/18 的 stir 边 M6→M9、M7→M9 从 780 恢复到 130；已按要求改回严格版，这两条 stir 边又是 780px。16/18 其余：交叉 1、穿节点 0。14/15：交叉 0、穿节点 0，高度 630。vitest 33 项通过。
- 未完成：本轮改动后的全 324 组合复测（倒流边数、process 交叉数）被中断，没有结果；改动前的参照数：倒流 165 条/99 组合，process 边交叉 792/200 组合。

## 2026-10-13 join 步骤碰撞检查：严格版加窄例外（16/18 的长 stir 与长 ADD）
- 用户要求：碰撞检查保持严格，不得因放宽检查而改变其他边的布局；16/18 只缩短长 stir 边和长 ADD 间距。
- `establishedLayout.js` 的 `makeCollisionGuard.allows(ids, dx, worth)`：默认仍要求不增加穿节点、不增加任何交叉、不增加 process/split 交叉。仅当该移动去掉很长的边（`worth >= 600`）时，才允许增加穿节点和 ADD×ADD 交叉；process/split 交叉任何情况下都不能增加。`worth` 的来源：`compactJoinChains` 中，被拉长的 process 边原长 >300 时取移动距离；`compactComponentsLeft` 中，该组周围最长的 ADD/split 边 ≥800 时取总边长的减少量。`fixBackwardProcessEdges` 不使用例外。
- 原因（16/18）：整组左移的每个位移都被严格检查拒绝，因为左移会使 wok 容器 M1 压到长 ADD 带 M3→M7 的水平段上（穿节点 +1）；join 步骤被拒绝是因为右移 stir 前驱链会多交叉一条 ADD 带。
- 16/18：stir 边最长 260、中位 130；宽度 3275→2560；ADD 总长 9133→5673，最长 ADD 1754→1091；process/split 边交叉 1、穿节点 0。14/15、16/16：交叉 0、穿节点 0。
- 对比严格版，324 个组合中只有 10 个布局改变（10/12、10/13、11/13、12/10、13/11、16/17、16/18、17/16、18/16、8/5），它们此前都有 >300 的 process 边；没有一个原本不含长 process 边的组合被改变。>300 的 process 边总数 112→101。vitest 33 项通过。尚无浏览器视觉验证。

## 2026-10-13 aux split 扇根节点：连续搜索距离；倒流 process 边与 process 交叉复测
- 14/15（数据更新后）中 `co` 扇的根节点在两个份量上方约 210，两条 split 边各穿过三条 ADD 带；期望（用户图 2）是根节点紧贴份量上方、位于带之下。原因：Phase 3 只尝试 70/100/130/160 四个距离，70 处根压在带上被判为穿节点，于是选了更远、交叉更多的位置，而带与份量之间只有约 35–40 的空隙，不在候选里。
- 已执行：`portedLayout.js` Phase 3 改为在 [35, 240]（窄扇 [100, 240]）内每 10 为步长扫描全部距离，两侧都试，取碰撞最少者（同分取更近）。14/15：根 (960,305)、份量 y=340，split 边不再穿 ADD 带；涉及 process/split 的交叉由 8 降到 2（余下为 ADD M13→M16 穿过 M3 的 split/stir 边，M16 链必须在共享行之上，难以避免）。
- `establishedLayout.js` 的 `fixBackwardProcessEdges` 增加回退：目标侧整组向右被卡住时，改为把来源侧整组向左移。
- 全 324 组合复测（缓存基于当前数据）：倒流的 process/split 边 165 条/99 组合→8 条/8 组合（全部是涉及 recipe 14 的 `stir` 边，例如 11/14 的 M14→M17 倒流 130、5/14 的 M23→M27 倒流 65，两侧都被相邻节点和 ADD/split 约束卡住，未修复）；涉及 process 边的交叉 792→674（process×process 176→143，process×ADD 616→531）。直线近似：边交叉 1346→1280，穿节点 5305→5379，ADD 总长 1473711→1475346，节点重叠 418→418。vitest 33 项通过。
- 已知：固定候选表的搜索会漏掉候选之外的空位。Phase 2（split 份量，65px 步长）仍使用固定步长，尚未检查是否有同类遗漏。

## 2026-10-13 全 324 组合复测结果（碰撞/流向规则一轮之后）
- 直线近似复测完成（324/324）：倒流的 process/split 边 165 条/99 组合 → 8 条/8 组合；剩余均涉及 recipe 14：11/14、14/6、14/7、5/14、6/14、7/14、8/14、9/14（各 1 条），原因尚未查明（`fixBackwardProcessEdges` 的右移被碰撞检查或 ADD/split 前向约束拒绝，未验证）。
- process 边交叉 792（process×process 176 + process×ADD 616，200 组合）→ 674（143 + 531，193 组合）。
- 对比上一轮：边交叉 1346→1280，穿节点 5305→5379，节点重叠 418→418（无组合变差），宽度 >300 的 split 边 193→195，ADD 总长 1473711→1475346，斜 process 边 97→97。
- 未完成：上述 8 条倒流边未修；浏览器视觉验证未做。vitest 33 项通过。

## 2026-10-13 split 边角度不统一：split 子节点的整条 lane 向其 split 源收拢（17/18 等）
- 现象：17/18 中 M2（共享哑铃）→M4 的 split 边 dx=130、dy=600（78°），下方 whisk 链离上方链约 700；期望（用户图 1）两个子节点的 split 边约 30–45°。全组合统计：960 条主 split 边中 84 条 >60°（66 个组合），出现最多的是 recipe 11、18、13、12、14，并非只有 17/18；每个组合的角度各不相同。
- 诊断（17/18 逐阶段）：M2 的两个 split 子节点原本只相距 89，`nb_resolveFinalBranchCollisions`（`nb_resolveFinalBranchCollisionsPass`，按 y 顺序依次让后面的分支组跳过前面分支的形状，并为 ADD 边留 ±40 的角度空间）把 M4 所在组整体下推 603（283→886），之后没有任何步骤把它收回。该步骤插入的空间取决于每个组合里相邻分支的形状，所以角度因组合而异；没有哪一步规定过 split 子节点相对其 split 源的标准偏移。
- 已执行：`establishedLayout.js` 新增 `compactSplitLanes`（在整组左移之后）。对 main 源→main 子节点的 split 边，若 |dy| > max(65, dx)（超过约 45°），把子节点的整组（process 连通的全部节点，加上只向它加料的独立节点与供料链）只沿 y 向 split 源移动到最近的一行（最小 |dy| = max(65, 0.35·dx)，步长 10），不压节点。判定用总碰撞成本：穿节点 100、process/split 交叉 30、其他交叉 10；穿节点不得增加，其余成本可随“角度改善”（从原角度降到 max(新角度,45°) 的度数）抵扣。严格的“每项不增”检查会拒绝 17/18 的所有候选，因为上移会多交叉 6 条 process 相关的边，而穿节点和总成本反而下降。
- 17/18：M2→M4 78°→27°，M2→M3 35°；最大 split 角度 46°。324 组合：>60° 的 split 边 84 条/66 组合→46 条/35 组合（最陡的是 18/16 M7→M3 80°、12/18 M12→M14 79°，被穿节点检查挡住）。倒流的 process/split 边 8→1。涉及 process 边的交叉 674→670；边交叉 1280→1298，穿节点 5379→5393，节点重叠 418→416，ADD 总长 +0.9%（上一轮对照使用同一缓存的完整运行）。vitest 35 项通过（新增 `compactSplitLanes.test.js`）。尚无浏览器视觉验证。
- 注意：本次的“前一版对照”文件有一半缺块，因此只引用上一轮完整运行的数字。

## 2026-10-13 倒流边清零、split 子节点换边、aux 扇靠近接收点（`establishedLayout.js`）
- `fixBackwardProcessEdges`：右移被 ADD/split 出口挡住时，新增回退方案——让接收该出口的整组（process 连通组+只向它加料的独立 aux）一起右移，仍须通过 `makeCollisionGuard`，且不得包含倒流边的源节点。原因（recipe 14 的 8 个组合）：目标节点被 ADD 出口卡住，源节点左移会压到目标上。
- 新增 `fixSplitSides`（在 `compactSplitLanes` 之后）：同 recipe 的单侧（only_r1/only_r2）main split 子节点若落在源节点错误一侧（R1 应在上、R2 应在下），把该子节点的整组纵向移到正确一侧最近的、不压节点且通过碰撞检查的行。原因（17/18）：分支分带的整组平移把 M13（R1）带到 R2 whisk 行之下，split 穿过 M15→M17 的 whisk。结果 M13 y 493→303。
- 新增 `compactAuxFans`（在 `fixSplitSides` 之后）：无输入的 aux 根节点 split 成多份、每份只 ADD 到 process 节点的“扇”，整体纵向向接收点靠近，至少保持 130px，须通过碰撞检查。17/18 糖扇 y 874→594，ADD 约 480→200px。
- 先尝试在 `portedLayout.js` 里做同样的扇移动，无效（偏移发生在后续分带平移），已撤回，未保留。`portedLayout.js` 的 Phase 4 同样试过放宽到“未匹配的同 recipe 父节点”，对 17/18 无效，已还原。
- 324 组合复测（直线近似，324/324 完成）：倒流边 165→0；process 边交叉 792→657；边交叉 1346→1282，穿节点 5305→5368，节点重叠 418→414（无组合变差），宽度 >300 的 split 边 193→177，ADD 总长 1473711→1493666（+1.4%，未查明原因），斜 process 边 97→97。vitest 35 项通过。
- 未完成：浏览器视觉验证；ADD 总长略增的原因；11/14 此前的倒流边在本次复测中为 0，但未单独确认是哪项改动所致。Ctrl+F5 强制刷新前端，无需重启后端。

## 2026-10-14 Established：ADD 供料链换边（`fixFeederChainSides`）与 inline 容器转移保持水平（4/5）
- 现象（4/5，用户截图）：R1 的 ADD 供料链（M25–M27；M28→M29→M30）落在 R2 行之下，应像图2那样位于其接收行上方。原因：分带的整组平移把这些链推到下面。
- 已执行：`establishedLayout.js` 新增 `fixFeederChainSides`（在 `fixSplitSides` 之后、`compactAuxFans` 之前）。只处理仅由 ADD 供料、同 recipe 单侧（only_r1/only_r2）的 main process 链；若它位于共享列的另一 recipe process 节点的错误一侧（R1 应在上、R2 应在下），整链连同只向它加料的独立 aux 纵向移到其 ADD 邻居中点附近、正确一侧、不压节点且通过碰撞检查的最近行。只改 y。
- 例外（用户既有规则：单个节点 ADD 进空容器应水平）：链首是无 process 前驱的容器、并从 main 节点接收 ADD 时，ADD 须保持水平。来源是独立原料（无输入、出口只 ADD 进该链）时与链一起移动；来源是另一条 process 链的末端（如 4/5 的 M7→M9 blanch）时整条链不动。曾因缺少该例外使 M7→M9 变成斜 ADD（674→840），已修复。
- 过程失误：为做“有/无该修复”对比，曾临时注释 `establishedLayout.js` 里的调用，用户此时刷新看到旧布局。之后对比一律在 scratchpad 的源码副本上做，不改运行中的文件。
- 4/5 验证：在浏览器内对实时数据运行布局，M28–M30 y 756→476，M28→M29 水平，M7→M9 水平 674；应用内视觉观察到该链位于 R1 主行上方。Auto (ELK) 模式未应用这些规则，未验证。
- 324 组合复测（当前数据，直线近似，324/324）：倒流边 0；process 交叉 688；边交叉 1304，穿节点 4894，节点重叠 352；>300 的 split 边 180；ADD 总长 1497484；斜 process 边 94。单个 main 入起始容器的非水平 ADD：0 个组合。注意 recipe 5 数据已在此前基线之后更新，与旧基线的差值不是同数据对比；复测脚本列出的“重叠增多”组合：11/2（0→2）、5/6（14→15），原因未查。
- vitest 35 项通过。强制刷新前端（Ctrl+F5），无需重启后端。

## 2026-10-14 Established：未输入且仅 ADD 出口的纯食材 main 链按 aux 供料链布局（9/10 的蛋链）
- 现象：9/10 把 recipe 10 的 38、39（蛋，打开后加入）从 aux 改为 main 后，该两节点链被当作独立分支放进自己的 R2 泳道，落在最底部（y≈1322，距接收点 M32 约 265px），整图高度 1151→1482。作为 aux 时它由 `nb_placeFinalAuxFeeders` 贴在接收点旁。原有“单个无前序加工 main 按 aux 附加布局”规则不覆盖两节点链。
- 已执行（`establishedLayout.js`，用户同意）：`findFeederChains` 找同 recipe 单侧、无任何输入、只由一个源节点以 ADD 出口进入一个接收点、不含容器的 main process 链。`runEstablishedLayout` 先按原样布局；仅当这样的链离接收点超过 250px（`FEEDER_NEAR`）时，用把这些节点视作 aux 的图视图重新布局，并且只有重算结果“不更高、ADD 总长不更长”才采用，否则保留原布局。节点 domain、尺寸、状态与匹配不变，只改坐标。
- 曾试做事后重排（`attachMainFeederChains`）：邻域已被占满，所有候选位置都与现有节点碰撞，已撤回；也曾去掉 250px 与“不更高”条件，结果 222/324 组合有候选链、75 组合布局改变且 34 组合变高（最多 +600px），已收紧为上述条件。
- 324 组合（当前数据，新旧布局对比）：37 个组合改变，35 个变矮、2 个同高、0 个变高，总高 58406→51664。9/10：1482→1151，蛋链距 M32 约 89px。
- 同日另有三项：`compactAuxAdditions`（aux 接收点上方/下方的自由单加料簇向接收点靠近，6/7 的 R1 加料簇 150→80px），`attachMainFeederChains` 已撤回；此前 `fixFeederChainSides` 对“链首是无 process 前驱的容器且接收 main 的 ADD”做了例外（孤立原料随链移动，来源是另一条 process 链末端则整链不动）。`compactAuxAdditions` 加入后的全 324 组合回归未完整跑完（后台任务被会话结束中断），其结果未验证。
- 浏览器未做视觉验证；Auto (ELK) 未应用这些规则。Ctrl+F5 强制刷新前端，无需重启后端。

## 2026-10-14/15 Established：共享供料链、split 根避让、进哑铃对齐、最终重叠检查（9/10、1/5、1/2 复现）
- 共享 exact 供料链：`findFeederChains` 现在也接受全 `merged_exact` 的纯食材两节点链（10/10 的蛋链 M26→M27），仍只在链离接收点超过 250px 且重算布局“不更高、ADD 总长不更长、碰撞不更多”时才采用。10/10 高度 976→796。
- `runEstablishedLayout` 重构为多步选择：先原样布局；供料链重算（上条）；若仍有 split 边穿 process 边，再启用 `clearSplitRootCrossings` 重算，只在“split×process 严格减少、碰撞不增、高度不增”时采用。`clearSplitRootCrossings`：无输入、出口仅 split 和 ADD 的自由根节点，在 65px 步长的左/上/下邻近位置中，选无交叉、不压节点、根节点自己的 split+ADD 总长最短者（首版只向左，把 9/10 的 M28 推出 390px，被用户指出太长，已改为二维最短）。9/10：M28 (480,483)→(480,873)，split×process 交叉 2→0，高度不变。此前无条件启用的版本在 324 组合中改变 5 个、2 好 2 坏、12/10 与 14/5 穿节点增加、14/5 高 146px，因此改为上述逐布局择优。
- `alignChainsIntoDumbbells`：只含单一 recipe 的链（无共享或其他 recipe 节点）末端进入哑铃半圆的 process 边若端口高度差 >6px，整条链（含只向它加料的独立 aux/main）纵向平移到端口水平。清距：对 main 节点允许 8px 相互贴近（哑铃上下半圆仅相距约 50px，R1/R2 两行必然近乎相贴）；碰撞代价允许 120 以内（穿节点 100、交叉 10），但不得新增 process/split 交叉，直线 process 边优先于 ADD 带碰撞。9/10：simmer R2 M13→M17（dy −80）与 heat R1 M7→M10（dy 48）拉直。M25→M29/M27 的 ±25px 是共享节点 R1/R2 分叉端口，保留。
- `resolveNodeOverlaps`（最后一步）：两个 main 节点体重叠（两方向均 >12px）时，移动其中的单 recipe 链：R2 往下、R1 往上，同 recipe 取较晚者；链与共享节点相连则只移同 recipe 的连续节点段；取最近的清距位置，碰撞代价允许 300。首版阈值 4px，误把 R1/R2 行设计上的 6px 相贴当作碰撞，把 1/2 的节点 34（M14）上移 208px，已把阈值提高到 12px 并改为“最小位移优先”。1/5 的 M6×M18、M31×M33 完全重叠已消除。重叠原因：这些链在基础布局输出里已与共享节点同 x、相距 13px，`separateProcessBranches` 不处理单节点分支。
- 回归（324 组合中 297 组合，一个分块反复崩溃未产出）：main-main 重叠(>4px，含设计上的 6px) 367→162，main-aux 重叠 141→104，穿节点 3244→2218，process 交叉 0→0；34 个组合改变，主要涉及 recipe 5；10/18 穿节点 2→3；约 10 个组合变高 60–100px（1/5 360→438）。
- 浏览器：9/10 在 Established 模式下可见 split 源位于链左下方、split 不再穿 heat 边；其余改动只做了坐标验证。一次合成拖动画布后页面崩溃（React `lastProps.hasOwnProperty`），重新加载后未复现，未确认来源。
- 仍未完成：一个回归分块的结果；alignChains 单独的全组合回归未跑完；浏览器逐图视觉验证；Auto (ELK) 未应用这些规则。Ctrl+F5 强制刷新前端，无需重启后端。

## 2026-10-15 Established：aux 的 process 源靠近目标、共享加料按腰部布局（6/8 的酱汁水）
- 现象：6/8 合并后的水（aux 哑铃）在基础布局里离 sauce（M9）254px，stir 边很长；共享的 garlic(哑铃)/light_soy 叠在水上方同 x，而不是在哑铃腰部旁。
- `establishedLayout.js` 新增 `attachAuxProcessSources`（在 `fixFeederChainSides` 之前）：aux 节点经 process 边（stir 等）进入 main 节点且离目标 >200px 时，连同只向它加料的 aux 一起平移到目标左侧 65/130/195/260px 中最近的、与其他节点不重叠且碰撞代价在 120 内（不得新增 process/split 交叉）的位置，纵向对齐目标端口。6/8：水 (234,686)→(218,432)，与 sauce 同行。守卫新增 `allowsShift`。
- `portedLayout.js`（`nb_packSingleAdditions` 的 waistGroup）：共享加料簇原来要求全部是 `merged_exact`，garlic 是 merged_similar 就整体落到普通摆法（叠在上方）；现在接受 merged_exact/merged_similar 且边为 shared。并改为优先放在目标 process 出口的相反侧（首版放右侧，压住 stir 边，已修正）；只有优先侧有碰撞时才用另一侧。6/8：light_soy (141,432) 与水 y 相同，garlic 哑铃 (129,458)。
- 324 组合（当前数据，与关闭这两处改动对比，324/324 完成）：11 个组合改变（1/2、1/5、2/1、2/3、2/4、3/2、4/2、5/1、6/8、7/8、8/6）；离目标 >200px 的 aux process 源 13→12；穿节点 2460→2459（1/5 +3、5/1 +2、7/8 +2 变多，其余持平或减少）；process 交叉 0→0；main-main 重叠(>12px) 10→10；高度 343778→343482，无组合变高 >60px。
- 浏览器：Established 模式下读取节点坐标确认 6/8 的水(218,432)、light_soy(141,432)、garlic(129,458)；未做逐图视觉检查；Auto(ELK) 模式回退到同一布局。
- 此前一次实验：把所有 aux 相似合并都当作共享 exact 单节点会隐藏 garlic 的 chunk/whole 差异，已改为只在“下一步被加料”时才用 exact（见 01-matching.md）。

## 2026-10-15 Established：供料链的“错误一侧”判断加入跨列的另一 recipe process 边（10/11 的 ADD 穿过 simmer 边）
- 现象：10/11 中 R1 供料链 M41→M42 在 y=392，位于 R2 的长 simmer 边 M39→M40（y≈300，横跨相同的列）下方；它进入 M40 R1 半圆的 ADD 必须穿过这条 simmer 边。`fixFeederChainSides` 只把“同列的另一 recipe process 节点”当作对手，simmer 边的两端不在这些列里，所以不触发。
- 已执行（`establishedLayout.js` 的 `fixFeederChainSides`）：对手集合新增“style 为另一 recipe（R1 链看 R2，R2 链看 R1）、横向范围覆盖该链所在列的 process 边”，取其在链中心 x 处的端口高度（含哑铃半圆偏移）；R1 链必须在所有对手之上、R2 链必须在之下，否则按原有规则移到最近的正确一侧行。10/11：M41/M42 y 392→266，位于 simmer 线之上。
- 324 组合（当前数据，与去掉该规则对比）：按节点坐标比较，4 个组合布局改变：10/11（2 个节点，高度不变，即目标案例）；3/1（50 个节点，高 474→538）与 5/1（70 个节点，高 468→566），原因是一条 R1 供料链被提到 R2 边之上并成为新的顶行，整体下移 64/98px；11/12（20 个节点，其中 only_r1 的一组整体 +196px，高度不变），原因未追查。冲突模型的指标（穿节点、process 交叉、main 重叠）基本不变，且该模型不把本案例的 ADD×process 穿越算作冲突，所以这些指标无法证明交叉已消除。
- 未完成：浏览器中未查看 10/11；3/1、5/1 变高是否可接受、11/12 的 +196px 是否合理需要确认；若不想接受变高可限制该规则只在不增高时生效。Ctrl+F5 强制刷新前端，无需重启后端。

## 2026-10-17 12/15 自由 split 根的子节点贴近根节点
- 现象：12/15 中 R12 的 only_r1 split 根（M37）两个单节点输出，其中 M38 被 `minimizeEdgeConflicts` 放到约 440px 之下，split 边很长。原因：Phase 4（单侧 split 链侧别）只处理“匹配 main 节点”发出的 split，这个无前驱的未匹配 split 根被跳过。
- 已执行：`minimizeEdgeConflicts(nodes,edges,{relaxSplitRoots})` 新增可选参数，开启时无 process 前驱、至少两个 split 输出的同侧 main 根也适用 Phase 4。默认关闭，其他调用不变（此前对全部未匹配父节点放宽曾使 324 组中 120 组改变且总体变差，已撤回）。
- `establishedLayout.js` 在 runEstablishedLayout 第 3 步额外布局一次开启该选项，仅当 split 总长缩短 ≥ SPLIT_GAIN(80)、不更高、碰撞不增、ADD 增长小于 split 缩短量时采用。
- 验证（坐标，非浏览器视觉）：324 组中只有 12/15、13/16、14/16 改变，split 总长 609→405、3178→3008、3017→2888，高度均不增（13/16 减少 81px，宽度 +65）。需强制刷新前端。
- 2026-10-17 追加（12/15 继续）：`compactAuxFans` 恢复并扩展到单侧 main 的 split 扇（root 无前序、≥2 个 split 输出、输出均 ADD 到接收点）：纵向滑向接收点，保留 MAIN_FAN_GAP=90；直滑被挡时可每次右移 65px（FAN_STEP_X，最多 260）再滑；滑动后每个份量尝试右移到接收点前 FAN_KID_GAP=110，root 跟随最左份量（允许向上微调 13/26/39px，经 allowsShift 检查）。`fixFeederChainSides` 的携带集合新增 prepared aux feeder（仅 aux、process 相连、出口全是 ADD 到被携带节点），避免链被移走后 go→cut→go 留在原处。runEstablishedLayout 第 3 步的放宽变体在“更矮≥100px、ADD 不更长、碰撞最多多 100、split 不多于 80px 变长”时也被采用。
- 12/15 坐标：高 1626→1416；扇的份量距接收链约 120–180px；cut feeder 紧邻 M40。M38 因 allowsShift（会增加 process/split 交叉）未能再右移到接收点前，距接收点仍约 250px，与用户目标图仍有差距。未做 324 组全量回归、vitest、test_attached_main_layout.js；未做浏览器视觉验证。
- 2026-10-17 追加（12/15 节点 31 的 split）：R12 节点 39→37（M42→M41）的 ADD 曲线沿源点水平走过 split 扇，擦过 M38，用户要求 split 不与其交叉。`compactAuxFans` 的单侧 main 扇在摆放后，按 GraphEdge 实际画法（ADD 用 addGeometry 三次曲线采样，其余直线）检查：份量被其他边穿过，或其 root→份量 split 边与其他边交叉，则该份量上/下微调（13px 步长，≤130px，需通过位置占用和 allowsY）。12/15 坐标：M38 y=180，曲线在其下方约 12px 经过，与两条 split 边均不相交。仍未做 324 组全量回归、vitest、浏览器视觉验证。

## 2026-10-17 PROCESS 边样式：heat_level 粗细、duration 正弦
- 已执行：`backend/graph_builder.py` 新增 `resolved_heat_level`，两处 `add_edge` 与最终 edges 输出都带上 `heat_level`（字符串或 {level: share}），与 duration 同样透传。需要重启后端。
- 已执行：新增 `frontend/src/edgeStyle.js`，`GraphEdge.jsx` 的非 ADD 边使用：粗细 = 默认宽度（shared 2.5 / 其他 1.8）× 系数（low 0.55，middle 1，high 1.75）；多级对象按顺序与占比分段，每段用各自宽度；有可解析 duration 时画成正弦（周期数 = round(1+log2(分钟+1))，限制 2–9，振幅 3.6，两端渐入渐出落在直线端点上），无 duration 保持直线。无 heat_level 保持默认粗细。ADD 边、箭头标记线、布局和匹配均未改。
- 验证：`frontend/src/edgeStyle.test.js` 6 项；vitest 全部 10 个文件 41 项通过；`vite build`（输出到临时目录）成功。未做浏览器视觉验证；非 ADD 边的 duration 周期数与振幅是估计值，可按观感调整。
- 2026-10-17 边标签位置：`placeEdgeLabels` 不再把标签压在边线上。平缓边（斜率 ≤1.2）的标签放在线正上方，间距 = 标签半高 + 5px（带 duration 的正弦边再加 4px，并按斜率补偿，最多 +40px）；陡峭边放在线右侧（半宽 + 5px）。上方/右侧被占用（节点、其他标签、其他边线）时才尝试下方/左侧，沿边的候选位置顺序不变。`edgeLabels.test.js` 把“标签在线上”改为“在线旁”，并新增平缓边在上、陡边在侧、正弦边留更大间距三项；vitest 10 个文件 44 项通过。未做浏览器视觉验证。
- 2026-10-17 点击图跳转到原文步骤：`TextPanel.jsx` 在 `selected` 变化时（点击图上的节点/边）把右侧面板滚动到高亮步骤：已完全可见则不动；R1、R2 两侧步骤能同屏时居中两者的范围，放不下时把最靠上的步骤放到粘性标题下方；面板内点击步骤不滚动。滚动量由 `frontend/src/textScroll.js` 的 `scrollDelta` 计算（`textScroll.test.js` 5 项）。尊重 prefers-reduced-motion。vitest 11 个文件 49 项通过，`vite build`（临时目录）成功；未做浏览器视觉验证。
- 2026-10-17 正弦周期按时长线性增加：原 round(1+log2(分钟+1)) 使 30–40 与 40–50 分钟都是 6 个周期，看不出差别。改为每 2.5 分钟一个周期（最少 2），且按边长限制：波长不小于 6px（边长 130px 时最多 21 个周期）；波长短时振幅降为 波长×0.3（最大 3.6）。例：35 分钟 14 周期，45 分钟 18 周期，60 分钟 21（受边长限制），1 分钟 2。`edgeStyle.test.js` 增加 30–40 与 40–50 至少差 3 个周期、不小于最小波长两项；vitest 11 个文件 51 项通过。周期系数（2.5 分钟/周期）与最小波长是估计值，未做浏览器视觉验证。
- 2026-10-17 正弦周期调稀：用户反馈 2.5 分钟/周期过密。改为每 4 分钟一个周期、最小波长 8px（130px 边最多 16 个周期）：35 分钟 9 周期，45 分钟 11 周期，1 分钟 2 周期。30–40 与 40–50 仍相差 2 个周期。测试断言相应改为至少差 2；系数仍是估计值，未做浏览器视觉验证。
- 2026-10-17 高亮：共享部分用蓝色。选中集合同时含 R1 和 R2 步骤（点击共享节点/边）时：右侧文字面板里两侧高亮步骤都用共享蓝 #AEEDFF（`TextPanel.jsx` 的 `active shared`，styles.css），非哑铃节点的 halo 由上蓝下绿两半改为整圈蓝，边的 `sel-both` 发光改为蓝色。只属一侧的选择仍是 R1 浅蓝紫/R2 绿；哑铃节点的上下半 halo 未改。vitest 11 个文件 51 项通过，`vite build`（临时目录）成功；未做浏览器视觉验证。
- 2026-10-17 高亮补充：merged_exact 哑铃节点被共享选中（selected==="both"）时，上下两个 halo 都用共享蓝；merged_similar 哑铃仍上蓝紫/下绿，因为两侧状态不同。vitest 51 项、`vite build` 通过；未做浏览器视觉验证。
- 2026-10-18 拖动一会儿网页崩溃：每次 pointermove（平移画布也一样）都会让 `GraphCanvas` 整体重渲染，并在渲染里重新跑 `placeEdgeLabels`（建冲突模型、逐条边找位置），再加上新的正弦边每次渲染都重算采样点，几百次拖动就把页面拖垮、内存暴涨。已执行：`GraphCanvas.jsx` 缓存边标签（只在 graph/layout/节点位置变化时重算；拖节点时最多每 150ms 重算一次，平移/缩放不重算），`selectItem`、`nodePointerDown` 用 useCallback；`GraphEdge`、`GraphNode` 用 React.memo；正弦边每周期采样点 14→12。内置浏览器里 25/24 的合成拖动测试（含 pointermove 200 次平移、120 次拖节点）：平移 3409ms→391ms，拖节点 2261ms→185ms，堆内存不再持续增长。未用真实鼠标长时间拖动验证；如果还是崩溃，请告诉我崩溃时的现象或控制台报错。
