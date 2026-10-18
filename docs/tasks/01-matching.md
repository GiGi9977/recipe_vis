# 01 匹配与建图

## 当前状态
有效源码：backend/matcher.py、backend/graph_builder.py。
最新后端交付包名：aux_created_main_matching。

## 已确定规则
- 只在分支上下文允许的候选间比较；主序列一对一，合并图不得产生因果环。
- 共同来源约束保留汇合前后差异，不能只凭相同 name 合并不同阶段。
- 容器起点用“容器名称 + 下游首批 main 产物名称”区分用途，避免所有 wok_pot 混为一条分支。
- aux 经非 add 动作生成 main/container 也进入候选；纯 add 列表不虚构加工动作。
- 若两个候选均没有共同起点可对应，同名 main 产物可补充分支对应：该名称在每个 recipe 中必须属于唯一、来源一致的因果链。
- 同名产物规则不覆盖已有共同来源冲突，不强行对应并行同名产物。
- graph_builder 不重复匹配已进入主序列的起始节点。
- 循环及无法解析的下游区域不抛 branch-label ValueError；保留显示但不猜测匹配。

## 五层优先级
state=(name,type,physical_state,chemical_state)。
1. exact：输入 state、动作、边 type、输出 state、输出的非 add previous、输入的 add previous 均相同。
2. similar2：动作、边 type、输出完整 state 相同。
3. similar3：输出完整 state 相同。
4. similar2_loose：动作、边 type 相同；name 相同且 physical 或 chemical 至少一项相同。
5. similar3_loose：name 相同且 physical 或 chemical 至少一项相同。
后四层显示为 similar；剩余为 only_r1/only_r2，不是独立的 different 属性公式。
loose 不比较节点 type；flavor 不属于这五层匹配特征。
仍在主序列外的起始节点另按分支资格与完整 state 匹配。
duration 不参与以上节点匹配层级，只用于判断已对应节点之间的 action edge 能否合并为 shared。

## 回归案例
- redpork4 节点 7 ↔ redpork5 节点 16 可以匹配。
- redpork1 节点 14 不可匹配 redpork_1 节点 9（汇合前后不对应）。
- cake_branch_1 节点 10 ↔ cake_branch_2 节点 9。
- moussaka_1 熟茄子 29 ↔ moussaka_2 熟茄子 9；白酱锅 32 ↔ 31，不可配肉酱锅 12。
- 最新 oil_braised_shrimp 节点 17 ↔ broccoli_with_shrimp 节点 15 为 similar2。
以上是 JSON 原始 index，不一定等于前端 M 编号。

## 验证
`python -m unittest discover -s tests -p "test_*.py"`
整理前已有 23 项测试通过，另检查过 72 组 redpork 有向组合无重复主节点。
具体输入见 tests/fixtures；不要为了通过测试改变用户原始 recipe。

## 限制与待办
- 仍按规范化后的文字名称比较，不自动推断同义词。
- previous 和 edges 不一致时不自动猜测修正；该差异会影响 exact。
- 通用规则不意味着所有 recipe 都能无歧义地自动匹配。

## 新任务开场白
请阅读 AGENTS.md 和 docs/tasks/01-matching.md，以当前源码为基线继续匹配任务。
保留已验证的分支与汇合约束，不修改前端布局或输入数据。本次需求是：……

## 2026-10-01 bazirou 糖油分支错配诊断（未修改匹配代码）
- 对当前 data 中 1–5 号红烧肉逐一与 4 bazi_pork_with_braised_egg_and_green_pepper 建图复现。
- 1 的糖油锅9、2 的糖油锅27、3 的糖油锅18均误配4的空锅8（用于肉预热），标为 merged_exact；其后续10/29/21又配到4的糖油锅24，造成同一分支上下游配到不同锅链。
- 根因：build_branch_metadata 将容器身份设为容器名+下游首个main产物。4的肉锅8和糖油锅20都变成 ('container','wok_pot',('pork',))；aux油糖不进入来源身份。graph_builder 起点补配只检查来源资格和完整state，不检查aux添加物，按节点序号遇到8即选中，忽略正确的20。
- 5 dongpo 的独立糖支路30→33→34先生成main caramel35，其容器身份为caramel；4糖油锅直接到pork，没有显式caramel main，故当前规则不对应。该菜谱30仅有sugar输入，不应笼统称为糖油锅。
- 建议（未执行）：容器候选增加汇合前准备上下文以区分锅用途，并保持分支对应连续性；显式caramel与省略中间产物的对应需要单独约束，不能直接取消共同来源/汇合阶段保护。
- 本次只读运行建图诊断并更新本说明；未修改数据、后端或前端，未运行测试套件，无需重启。

## 2026-10-01 已执行：独立糖准备容器身份
- backend/matcher.py：独立container根的直接aux添加物包含sugar，且仅由sugar/oil/water组成时，容器role使用preparation/sugar；不再由后续pork或显式caramel决定。该身份随原有来源传播，仍保留共同来源、汇合阶段和一对一约束。肉分支后加糖不属于独立根，不改变其身份。
- 已验证1:9↔4:20、2:27↔4:20、3:18↔4:20、5:30↔4:20；加工节点分别10/29/21/33↔4:24。四组双向均通过，糖锅不再匹配4:8的肉预热锅。
- 新增tests/test_sugar_branch_matching.py三项回归，覆盖八个有向比较、起点/加工节点连续对应、一对一、输入不变、肉锅与糖锅来源分离。
- 运行完整Python unittest：30项中28通过，2项因旧data/redpork4.json与data/redpork1.json缺失报错，未改写历史测试或恢复原始数据。新增三项独立执行全部通过，git diff --check通过。
- 未修改前端或recipe JSON，未完成浏览器视觉检查。后端需重新加载（uvicorn --reload可自动加载），刷新页面并重新比较。

## 2026-10-07 Action edge duration 匹配（当前规则）
- `backend/graph_builder.py`：duration 只影响 edge matching，不影响节点的 exact/similar 匹配。action 和 type 相同的两条边若都有 duration，规范化后的字符串也必须相同才能合并为 shared；若只有一边有 duration，仍视为同一条 shared edge，并采用明确值作为比较结果中的默认 duration。
- 两边都有且 duration 不同时，已匹配的端点节点保持原来的 merged 状态，但 action edge 分别输出为 R1/R2，并各自保留 duration。比较过程不改写 recipe 对象或原始 JSON。
- 主节点边和 aux 节点边使用同一规则；比较 API 的 edge 输出保留可选 duration 字段。
- 新增 `tests/test_duration_matching.py`，覆盖缺失 duration 的双向默认值、相同明确 duration，以及不同明确 duration 只拆分边而不改变 exact node match。
- 实际验证：duration 专项 3 项通过，Python 语法与 `git diff --check` 通过。完整 unittest 运行 33 项，其中 22 项通过；7 项糖分支断言与当前重新生成数据的节点/分支结果不一致，4 项因缺少旧数据文件或编号报错。本次未修改 recipe 或这些历史测试。
- 未修改生成 prompt 或前端。后端需重启或由 uvicorn reload 重新加载。

## 2026-10-07 已匹配前序允许后续 similar（当前规则）
- 复现：recipe 7 node 23 与 recipe 8 node 7 已合并为 M3；其直接后继 R7:24 与 R8:9 都是 `shrimp/main/whole/cooked`，但动作分别为 simmer 与 ice。旧 branch-context gate 因 R7 后续增加 sauce/wok 来源、R8 保留 shrimp 来源而在 similar3 前拒绝。
- `backend/matcher.py`：若两个候选的直接 source node 已形成一对一匹配，则该前序对应允许后继继续进入匹配层级。分支来源不同时仍禁止 exact；动作不同但完整输出 state 相同时可在 similar3 合并。原有一对一、无环和输出 state 条件保留。
- 新增 `tests/test_merged_predecessor_matching.py`，双向验证 R7:23↔R8:7 已匹配且 R7:24↔R8:9 为 similar3 / merged_similar。
- 实际通过：该专项、aux/main product 6 项、branch alignment 6 项、duration 3 项；Python 语法与相关 `git diff --check` 通过。完整 unittest 共 34 项，23 项通过；9 项糖分支旧索引/来源断言与当前重新生成数据不一致，2 项仍因缺少 `data/redpork1.json`、`data/redpork4.json` 报错。
- 检查期间 recipe 15 JSON 被外部更新，早先基于 R15:31/32 的临时索引测试已不再对应当前连通图，因此已移除该临时测试；未修改 recipe JSON。
- 后端需重启或由 uvicorn reload 重新加载，前端重新 Compare。

## 2026-10-07 aux 加工容器身份（当前规则）
- 复现：recipe 4 node 7 是 pork 加工锅（heat→fry→pork）；recipe 5 node 16 先由 oil/ginger 加入并 fry 生成 aux ginger，再形成 spice_mix、汇入后续 pork 分支。旧容器身份只寻找下游首个 main，两者最终都得到 `('container','wok_pot',('pork',))`，被起始节点逻辑错误合并。
- `backend/matcher.py`：独立 container 若直接通过非 add 动作生成 aux，role 记录 action、edge type 和该 aux 完整 state 的 preparation signature。后续汇入哪个 main 不再覆盖该直接加工用途。既有 sugar preparation 特例优先保留。
- 装载后的相同 container 额外比较直接 add 输入：若两侧容器 state 相同且非空 add 输入签名相同，即使代表 transition 分别落在加工边和 add 边，也允许进入 similar 匹配；分支上下文不同时仍禁止 exact。
- 扩展 `tests/test_container_preparation_identity.py`，双向验证 R4:7 与 R5:16 来源身份不同且不产生 merged node，同时验证 R4:8 与 R5:2 以 `similar3` 合并。
- 实际通过：该专项 2 项、R7/R8 已匹配前序专项、aux/main product 6 项；Python 语法通过。完整 unittest 共 36 项，25 项通过；9 项糖分支旧索引/来源断言与当前重新生成数据不一致，2 项仍因缺少 `data/redpork1.json`、`data/redpork4.json` 报错。
- 未修改 recipe JSON、前端或生成 prompt。后端需重启或由 uvicorn reload 重新加载，前端重新 Compare。

## 2026-10-14 分支对应必须共享 main 食材；无 main 时才看共享 aux（当前规则，3/5 复现）
- 用户要求：分支对应要求沿分支至少共享一个 main 食材；若分支上完全没有 main，再考虑共享 aux。复现：3 的猪肉锅 13→14→16 应与 5 的猪肉锅 16→17 对应；5 的香料油锅 19→21→24→28（只有 oil/ginger/scallion/garlic/香料）不应与任何分支对应。
- 根因（`backend/matcher.py: build_branch_metadata`）：容器根的身份只取“沿所有出边找到的第一个下游 main 产物”。5:19 的油锅经 add 倒入 sim_pot 后下游是 pork，得到 `('container','wok_pot',('pork',))`，与 3 的猪肉锅身份相同，被错配；5 的猪肉锅 16 因先加入 pork 而继承食材来源，没有锅身份，3:14 无法与它对应。
- 已执行：
  1. 新增 `vessel_chain_ingredients`：只沿 process 边（add 边视为倒入另一容器，链到此结束）统计容器自己的 process 链上的 main（首个 main 产物及加入链上的 main）和 aux。
  2. 容器根的身份键：有 main 则每个 main 名一个键（共享任一 main 即对应）；无 main 则每个 aux 名一个键（共享任一 aux 即对应）；两者都没有则仍是 recipe 内唯一的 unresolved。糖准备与“直接加工 aux”两个特例保持优先。每个根的身份现在是键集合，`recipe_branches` 与上下文展平为键集合，`branch_contexts_compatible` 不变。
  3. 纯 aux 键不作为“共享锚点”：新增 `anchor_keys`，`match_by_rule` 里唯一产物桥接的“无共享锚点”判断忽略 aux 键，避免 oil 等常见调料让不相关分支互相阻断（首版因此让 5/6、5/7、5/8 的 sauce 对应丢失，已修正）。
  4. `match_by_rule` 新增 `vessels_correspond`：两个容器节点 state 相同且各自 process 链共享 main（若双方都没有 main 则共享 aux）时，即使来源上下文不同也允许 similar 对应（不允许 exact）。这使“先空锅加热再加肉”的 3:14 与“肉直接入锅”的 5:16 对应。
- 曾尝试把“只由 add 装载的容器”改成新的来源根，导致 recipe 5 的 sauce 55/57 唯一产物判定失败（来源集合不同）并丢失 5/6–5/8 的 sauce 对应，已撤回，未保留。
- 3/5 与 5/3 结果：3:14↔5:16、3:16↔5:17 对应，5:19/21/24/28 无对应，一对一；3:12、3:13 无对应。附带变化：3:29↔5:15（sim_pot 对 sim_pot）取代 3:29↔5:56；3:31↔5:45、3:35↔5:52 取代 3:21↔5:45 等错阶段配对。
- 对 18×18=324 个有向组合比较新旧匹配器：22 个组合的 merged 集合改变，共丢失 19、新增 42 个对应，自比较组合全部不变，一对一无重复。改变的组合：1/5、2/3、2/4、3/2、3/5、4/2、4/5、5/1、5/3、5/4、9/10、9/12、9/13、10/9、11/13、12/9、13/9、13/11、16/18、17/18、18/16、18/17。新增多为锅/烤箱容器配对（如 2:25↔3:14、16:24↔18:30），其合理性未逐个人工核对。
- 新增 `tests/test_vessel_branch_ingredients.py` 3 项，通过。完整 unittest 共 39 项，15 个失败、2 个错误；用旧匹配器在副本中运行同样失败（旧数据索引漂移与缺失旧 data 文件，早已记录），失败集合一致，没有新增失败。
- 未修改 recipe JSON、graph_builder 或前端。uvicorn --reload 会自动加载，前端重新 Compare。
- 注意：用户说的“5 的 15 到 28”被理解为香料油锅 19→28（倒入 sim_pot 15）；若指的是别的范围需再确认。

## 2026-10-15 aux 节点增加 similar 层（6/8、7/8 的酱汁水）
- 现象：6 的水(8, liquid raw)与 8 的水(19, liquid cooked)都以 stir 进入同一个已合并的 sauce（6:14↔8:20），但没有合并。原因：`compare_non_main_nodes` 对 aux 只有“state_key 完全相同”这一层，main 则有 exact/similar2/similar3/两个 loose 层。
- 已执行（`backend/matcher.py`）：新增 `can_aux_similar_match`（aux 对 aux、state 不同、名称相同且 physical 或 chemical 至少一项相同）和 `pair_ups`：对每层上游节点先做 exact 配对，再对剩下的做 similar 配对，保持一对一；similar 配对继续向上游配（例如 6/8 里随之配上 garlic 与 light_soy）。记录 kind 为 `similar`；容器仍只允许同名 exact。
- 已执行（`backend/graph_builder.py`）：`build_aux_merged_nodes_from_records` 处理 `similar`：若任一侧的该 aux 节点有入向 add（下一步被加料，如酱汁水），按用户要求作为共享的 `merged_exact`（蓝色哑铃，shape_dumbbell 由原有规则决定，两半各保留自己的 state）；没有入向 add 的保持 `merged_similar`（渐变哑铃，如 6/8 的 garlic chunk/whole）。aux 目标上的共享边合并现在也接受 merged_similar。
- 对 324 个有向组合比较改动前后：20 个组合的 aux 合并集合改变，新增 30 个、丢失 0 个，main 合并集合完全不变；新增全部是同名对（sugar 8、garlic 6、water 4、light_soy 4、onion/cheese/oyster_sauce/vinegar 各 2）。
- 新增 `tests/test_aux_similar_matching.py` 5 项通过；完整 unittest 44 项仍是 15 失败 2 错误（与旧匹配器相同，旧索引漂移与缺文件）。
- 后端 uvicorn --reload 自动加载；前端重新 Compare。

## 2026-10-17 容器分支身份：多个 main 汇入的装配炉不再算含各原料（13 的烤茄子炉被错配到最终烤箱）
- 现象：13 中烤茄子的 oven（9，只加入 eggplant，产出 eggplant）与 9/10/11/12 的最终装配 oven 被合并。原因：`vessel_chain_ingredients` 把“加入链上的所有 main”都算作该分支的 main 食材，装配炉里层叠加入了 eggplant、meat_sauce、white_sauce 等，于是与 13 的烤茄子炉共享了 eggplant，`vessels_correspond` 误判为同一分支。
- 已执行（`backend/matcher.py: vessel_chain_ingredients`）：分支的 main 食材 = 链的产物 + 仅在“恰好加入一个 main”时的那个 main（如 cake_paste 烤成 cake_base/cake、pork 炒成 pork）；多个 main 汇合成新产物时只取产物（moussaka），加入的各 main 属于其他分支；没有产物时才用加入的 main。aux 回退规则不变。
- 与改动前（同一数据）比较 324 个有向组合：6 个组合的合并集合改变，丢失 8、新增 2，自比较组合全部不变。13/12 与 12/13：丢失 12:58 oven↔13:9 oven（错配），新增 12:9 eggplant↔13:22 eggplant；10/11、10/13 与反向：丢失羊肉锅(10:4、10:5)与牛肉/番茄酱锅(11:10、13:3、13:4)的配对（产物 lamb 与 beef 无共享 main，此前只因加入的 tomato 类食材共享才配上）。蛋糕 16/17/18 的 oven 配对保留。
- 首版只取产物时曾丢掉 16/18、17/18 的蛋糕 oven 配对（cake_base 与 cake 名称不同但都烘烤同一份 cake_paste），所以改为“单一加入 main 计入”。
- 新增 `tests/test_oven_branch_identity.py` 3 项通过；完整 unittest 50 项，15 失败 2 错误，与此前相同，无新增失败。
- 注意：此前一次与旧快照的对比因 recipe 13 等数据已改动而包含大量数据漂移，不能作为本改动的效果；上述数字来自用改动前匹配器在当前数据上重算的对比。

## 2026-10-17 实验：先分支、再配对分支、节点只在已配对的分支内合并（默认关闭）
- 用户要求：节点必须在同一分支才能合并；分支标签由该分支内所有 main 节点决定（不能出现 wok_pot 之类的容器名）；分支配对依次用“main 集合完全相同 → 至少共享一个 main → 无共享 main 时共享 aux”；一个分支配对后不得再与别的分支配对。
- 已执行（`backend/matcher.py`）：新增 `build_branch_partition`（分支在根节点、split 输出和 join 之后开始；join 节点仍属于进入它的分支；只携带食物、自己没有 main 的容器分支并入它的 process 链送达的唯一后继分支；aux 节点在容器中被加工时继续传递分支）、`branch_similarity`（配对平局时按分支内 main 节点的状态/动作逐一对应程度打分）、`pair_branches`（三层优先级，一对一贪心）、`branch_pairing`，以及 `_apply_rule`；`match_by_rule` 在传入 `branch_pairs` 时只允许已配对分支的节点比较（不再使用旧的上下文判断和各种例外）；`backend/graph_builder.py` 的起始节点配对同样改用分支配对。
- 开关：`matcher.USE_BRANCH_PAIRING`，默认关闭；启动后端前设置环境变量 `RECIPE_BRANCH_PAIRING=1` 才启用。关闭时与实验前完全一致（324 个组合 0 个不同，unittest 仍是 15 失败 2 错误）。
- 启用后的效果（与实验前对比，324 个有向组合）：134 个组合合并集合改变，丢失 166、新增 327，总合并数 1406→1567；自比较全部不变。13 的烤茄子分支与 12 的茄子分支配对、最终烤箱分支与最终烤箱分支配对，烤茄子炉不会和最终分支合并。原先失败的 R7:24↔R8:9 测试变为通过。
- 启用后新出现的 4 个测试失败（说明一对一分支配对与已确认的案例冲突）：
  1. `test_cake_products_and_downstream_match_both_directions`：cake 1 的黄糊在 join 处被分成 yolk 与 yolk_paste 两个分支，cake 2 里是同一个 {yolk, yolk_paste} 分支；一个分支对应两个分支，一对一阻止了已确认的 10↔9。
  2. `test_moussaka_food_and_pan_branches_match_both_directions`：缺 (29,9)，并出现被禁止的 (29,3)。
  3. `test_r3_pork_wok_matches_r5_pork_wok_and_not_aromatic_oil_wok`（本次早些时候新增）：3 与 5 各有多条 pork 分支，仅按 main 名称配对时 3 的猪肉锅被配到 5 的香料油锅（第三层按 aux 配对）。
  4. `test_single_main_baked_into_a_product_still_merges`（16/18 的 oven）：cake_base 与 cake 名称不同，没有共享 main。
- 新增 `tests/test_branch_pairing.py` 6 项通过（不依赖开关）：分支划分、茄子分支与最终分支、一对一、三层优先级。
- 待用户决定：是否接受这 4 项变化并更新旧测试；或允许“多对一”（一个分支可对应拆成两段的另一个分支）；或保持关闭，仅保留此前已完成的产物/加入 main 规则。

## 2026-10-17 分支一致性检查（在节点级匹配之上做否决）与审计工具
- 决定：保留已验证的节点级匹配（上下文判断 + 例外）作为基础；分支配对实验保持默认关闭。分支规则只作为一道检查加在其上。
- 已执行（`backend/matcher.py: hierarchical_main_match_two_stage`）：记录每个分支已合并的对方分支。若一个节点对会让某分支与“对方的另一个分支”合并，而这两个分支没有任何共享 main（且该分支此前已与别的分支合并），则拒绝该节点对。一个分支与多个各自共享 main 的分支合并仍允许（同一食材线在两个 recipe 里分段不同，如 cake 的 yolk/yolk_paste、白酱各阶段）。
- 效果：324 个有向组合中仅 5/1、5/3 改变（5/1 丢失 R5:17↔R1:6 pork、33↔15 wok，新增 R5:16↔R1:15 wok、R5:17↔R1:16 pork；5/3 丢失 R5:33↔R3:20 wok）；自比较不变；unittest 仍是 15 失败 2 错误，无新增。
- 新增审计工具 `tests/audit_branch_conflicts.py`（非单元测试，约 40 秒）：列出所有“一个分支合并进对方多个分支”的情形，并区分“各自共享 main”（48 处，分段差异，合理）和“有分支不共享任何 main”（10 处，需要人工判断）。
- 10 处仍被标记：1/5、5/1、2/5、5/2、3/5、5/3 的 pork 分支（对方分支无 main 或含 pork/sauce）；11/12、12/11 的 R12 beef 分支同时合并了 tomato 分支和 beef 分支；12/9、9/12 的 meat_sauce 分支同时合并了 beef 分支和 meat_sauce 分支。原因：该检查只阻止“第二次”不相关的合并，不会撤销已经接受的第一次合并；这些情形中第一次合并本身就是错误或需要判断的。
- 茄子/最终烤箱的错配已由此前的“分支 main = 产物 + 单一加入的 main”规则修复，本次检查不改变它。
- 未完成：上述 10 处需要用户给出期望配对后再决定是否收紧第一次合并（例如要求有共享 main 或共享 aux）；收紧会遇到 cake_base 与 cake 这类产物改名的情形，需要先处理。

## 2026-10-17 更正：分支一致性检查的 5/1、5/3 改动是记录遗漏造成的假象
- 上一条“仅 5/1、5/3 改变”不准确。逐条打印被拒绝的合并后发现：检查只记录了主循环里的合并，没有记录起始节点（在 graph_builder 里合并的无主序列前驱节点，如 R3 糖锅 17↔R5 糖锅 32）。因此 5/3 里糖锅的后续节点 R5:33↔R3:20 被误判为“同一个猪肉分支的第二个不相关合并”而被拒绝（误否决）；5/1 里被拒绝的 R5:33↔R1:15 也是同一情形（R1 把猪肉加进糖锅，糖锅与猪肉锅在 R1 里属于同一个 {pork} 分支）。
- 已执行（`backend/matcher.py`）：在主循环前复现起始节点的配对（同样的状态相等 + 旧的上下文判断），并把它们记为各分支的首次合并。修正后，324 个有向组合与没有该检查时完全一致（0 个不同），自比较不变，unittest 仍是 15 失败 2 错误。
- 含义：在当前数据上，该检查只起防护作用，不改变任何现有结果；此前 5/1 里“R5:17 pork 改配 R1:16、wok 改配 R5:16”的变化已不存在，5/1 仍是 R5:17↔R1:6 与 R5:33↔R1:15。审计仍标记同样的 10 处，需要用户给出期望配对后再收紧第一次合并。

## 2026-10-17 共享 main 的分支允许对应（10/13 的 meat_sauce 分支）
- 现象：10 与 13 的 meat_sauce 分支完全没有合并（R10:15、17 与 R13:20、21 都是 `meat_sauce`，状态 paste/mash cooked 仅 physical 不同）。
- 原因（逐项打印 `match_by_rule` 判断）：旧的上下文判断拒绝了它们。join 之后分支标签取 join 节点自己的名字，R10 的分支叫 `lamb_tmato_mixture`、R13 的叫 `meat_sauce`；根（lamb 与 beef，tomato 与 potato）也不同。产物类例外要求两侧标签相同，所以也没有触发。按分支的 main 看，R10 的分支 {lamb_tmato_mixture, meat_sauce} 与 R13 的 {meat_sauce} 共享 meat_sauce。
- 已执行（`backend/matcher.py`）：把“分支配对”只作为附加允许，而不是替换旧判断。`pair_branches` 新增 `tiers` 参数；`hierarchical_main_match_two_stage` 总是计算只用前两层（main 集合相同、至少共享一个 main）的一对一分支配对 `branch_allow`；`match_by_rule` 在旧上下文判断不通过时，若两节点所在分支已被如此配对，则允许对应，但只限 similar 各层，不允许 exact（与其他例外相同）。旧判断和已验证案例不变。同时把分支的 aux 收集改成迭代写法。
- 效果（324 个有向组合，与加入前对比）：8 个组合改变，丢失 8、新增 16，总合并数 1406→1414，自比较不变。新增：10/13 与 13/10 的 R10:15↔R13:20、R10:17↔R13:21（meat_sauce）；11/12 与 12/11 的 white_sauce（44↔50）；11/13 与 13/11 的 beef（R11:15↔R13:6）。7/8 与 8/7 的 shrimp 链原先错位一格（22↔7、23↔9、24↔10、25↔11），现在是 23↔7、24↔9、25↔10、26↔11，即文档中已确认的 R7:23↔R8:7、R7:24↔R8:9 对齐；测试 `test_r7_node_24_matches_r8_node_9_after_merged_predecessor` 由失败变为通过。
- 测试：新增 `tests/test_meat_sauce_branch.py` 3 项通过（meat_sauce 两个方向合并、羊肉锅与牛肉锅不被带入、一对一）。完整 unittest 59 项，13 失败 2 错误（此前 15 失败 2 错误），无新增失败。
- 审计（`tests/audit_branch_conflicts.py`）：标记数由 10 变为 12，新增的 11/13、13/11 是 R13 的 beef 分支同时合并了 R11 的 tomato 分支和 beef 分支——新增的 beef↔beef 是对的，暴露的是此前已存在的 beef 分支配 tomato 分支（与 11/12 同类）。仍待用户给出期望配对后处理。
- 备注：本机 Python 偶发段错误或随机内部异常，审计脚本和全量比较需要重试，不是代码逻辑造成。

## 2026-10-17 审计更正：同一线程的相邻分段不算冲突（11/13 的 beef 与 tomato）
- 用户指出 11 与 13 没有错配，beef 与 tomato 在同一分支。核对：11/13 的两处合并是 R11:10 wok↔R13:4 wok 与 R11:15 beef↔R13:6 beef，确属同一肉酱烹饪。审计的误报来自分支划分：R11 的锅 10 只被加入 tomato 一个 main，按“主父节点”规则被划进 tomato 线程，之后加入 beef 的 join 又使 beef 成为新分支，于是同一烹饪线程被切成“tomato（锅）”和“beef”两段。匹配器本身没有错。
- 已执行（`tests/audit_branch_conflicts.py`）：若某个“不共享 main”的对方分支与一个“共享 main”的对方分支之间有 process 边相连（即同一线程的相邻分段），不再标记。茄子与最终烤箱之间只有 ADD 边，所以仍会被标记。
- 效果：标记数 12→6，分段差异但一致的从 48 升到 54；11/12、12/11、11/13、13/11 的 beef/tomato 与 12/9、9/12 的 meat_sauce/beef 都不再标记，剩下的 6 处均为 1、2、3 号与 5 号之间的 pork 分支（1/5、2/5、3/5 及反向），尚未逐项核对。

## 2026-10-17 用户确认：5/1 无需改动；R5 节点 19 的香料油锅分支不合并是正确的
- 用户确认 5 与 1 的结果没有问题，且 R5 节点 19 分支（19、21、24、28 的香料油锅，只有 aux）不被合并是正确的。
- 核对：该分支只在 5/5（自比较）、5/7、7/5 里有合并节点。5/7：R5:21↔R7:20、R5:24↔R7:21（R7 的这两个锅属于 R7 的 shrimp 分支，aux 为 garlic、ginger、oil、scallion），节点 19 本身没有合并；这种“分支只合并了一部分”是否合理待用户确认。
- 已执行（`tests/audit_branch_conflicts.py`）：不再标记“对方分支没有 main”的情形（如糖锅这类只有 aux 的容器分支，无法按 main 判断）；标记数 6→0。匹配代码未改动。

## 2026-10-17 撤回：共享 aux 层与分支线程连续性改动
- 经过：为 9/11 的肉酱锅尝试了两处改动，均已撤回。
  1. “共享至少 3 个 aux 且两个分支都有 main”的第三层允许（`allowed_branch_pairs`，`matcher.py` 与 `graph_builder.py` 起始节点）。该命令被用户中断，但文件实际上已被修改并生效（之前我误以为没有执行）。它让 R1/R3 的糖锅/猪肉锅与 R9 的锅等错误合并（如 1/9 的 R1:14↔R9:11、R1:15↔R9:15 wok）。
  2. `build_branch_partition` 的“原料不切断线程、只由 ADD 装载的容器自成线程”改动，用户确认改动前的划分是对的。
- 已执行：把 `backend/matcher.py` 和 `backend/graph_builder.py` 恢复到第三层允许之前的版本。恢复后 324 个有向组合与 17:50 的结果（共享 main 允许之后）逐一相同（0 个不同），unittest 为 13 失败 2 错误（此前相同的基线），无新增失败。
- 当前保留的规则：共享 main 的分支允许对应（`pair_branches` 前两层）、分支一致性检查（含起始节点记录）、审计工具。
- 未解决：9/11 的肉酱锅（R9:11、R11:10）仍不合并。分支划分把 R11 的锅线程切成 tomato/beef/meat_sauce 几段，用户确认当前划分正确，因此需要另外的办法而不是改划分。
- 更正：此前对用户说“被拒绝的补丁没有执行”不准确，实际已执行；撤回前约有一段时间后端一直在用它。
