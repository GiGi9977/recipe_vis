# 03 Recipe 抽取与数据模型

## 当前材料
本次维护的生成 prompt：data/llm_text/recipe_graph_prompt.txt。
历史候选 prompt：docs/reference/recipe_graph_prompt_reviewed.txt。其“每个 atomic step 都创建新输出节点”规则已被用户最新确认取代，不应据此覆盖当前 prompt。
上述材料不等于已确认用于原论文全部实验的 prompt。
原始数据位于 data/*.json，回归输入位于 tests/fixtures。

## 用户确认的模型要求
- PROCESS 动作创建新的输出节点，即使 state 属性未变。
- ADD 不创建新节点：源节点直接连接到已存在的当前接收节点，不更新接收方的 CURRENT_STATE。多次 ADD 可以指向同一接收节点，不因逐次加入或铺层创建接收状态副本。
- 初始原料节点不代替动作输出；分拆动作可产生多个新输出。
- 保留因果依赖与独立分支，文字顺序不自动产生跨分支边。
- 每个节点最多有一条向外的 ADD 边；此上限不限制入边或 split 输出数。后续同名原料再次作为 ADD 来源时，若先前节点已用于 ADD，必须创建不同 index、相同 name 的新来源份量节点，不复用旧节点。
- 只有原文明确描述分拆动作时才使用 split；不能根据多次使用、多个接收方或 ADD 出边上限推断 split。没有明确分拆时，后续 ADD 使用新建的同名来源节点，此规则也适用于加工产物；不补造分拆或加工动作。新来源节点不属于 ADD 的接收状态副本，previous 由后处理仅依据实际边生成。
- 数据结构不增加 physical_subtype。physical_state 直接使用用户确认的最小叶子类别。
- physical_state 叶子词表：whole、chunk、slice、shred、powder、liquid、batter、paste、mash、dough。solid 与 solid-liquid mixture 仅是推理上位类，不写入 JSON；dice/cube 归入 chunk。
- main/aux/container 按该 recipe 中的实际作用赋值，不为通过 matcher 强行更改 water 等角色。
- LLM 不再输出 previous；生成脚本在 nodes/edges 完成后调用既有 fill_previous_for_recipe，根据实际边确定性生成累计 provenance。
- 节点 name 表示食材或中间产物本体：本体不变时沿用基础名称（pork、fish、yolk 等），不附加 fried、cooked、baked、seasoned 或切形描述。不同 recipe 中的同一食材使用相同 canonical lowercase snake_case 标签。
- 只有形成不同本体时才改名，例如面粉加入 yolk 后搅拌形成 yolk_paste，cake_paste 烘烤形成 cake_base。ADD 不改接收节点名称，新产物名用于对应 PROCESS 输出；不同快照仍保留不同 index。
- 所有 heat 动作都识别加热环境，即使原文未明确写容器：fry 使用 wok_pot，bake 使用 oven。忽略 bowl、mold、plate 等非加热环境容器；烘焙模具不作为 container，烘焙环境为 oven。保留实际食物加工动作，纯粹向被忽略器皿的摆放不生成该器皿节点或指向它的 ADD 边。
- container 词表为 deep_pot、oven、sim_pot、wok_pot、none；非加热环境使用 none。mold 仍可作为明确塑形动作的 action 名称。
- 新生成数据应保留原始步骤文本和稳定的文本步骤 ID，并用节点—动作配对把每个 atomic step 映射到一个或多个节点及边。隐式创建的 stage/container 节点必须归到触发环境变化的原文步骤；不得为它虚构额外原文动作。

## 需要核对
- 当前数据含历史格式，尚未逐项核对其是否满足当前 PROCESS / ADD 规则。
- 已统一 split 例外：非 split PROCESS 创建一个新输出；split 按份量或组分创建多个新输出。
- 新 physical_state 词表与下游图标、匹配和历史 JSON 的兼容性仍需单独验证；本次不批量修改原数据。
- 实验实际使用的 prompt、GPT-4o 版本、参数、调用方式和日期尚未确认。
- GPT-6 Sol high 仅是讨论中的试验建议；没有执行新模型批量抽取或模型对比实验。

## 本次规则同步
- 已执行：根据用户最新确认，纠正本说明中的 ADD 节点语义，并明确当前维护的 prompt 路径。
- 已撤回：将“每个 atomic step 都创建新输出节点”作为通用规则，或据此让 ADD 创建接收状态副本。
- 已撤回：根据多个用途自动推断 split，或禁止无明确 split 时创建同名加工产物来源节点；以用户最新确认的显式分拆规则为准。
- 验证：已检查 prompt 文本差异、ADD 出边上限、重复同名来源与 split 例外；未执行 LLM 抽取、模型对比或代码测试。
- 已执行：更新生成 prompt 的来源份量规则、示例、节点清理例外和验证清单。未修改生成脚本或 recipe JSON；历史候选文件仅保留作记录。

## 新任务开场白
请阅读 AGENTS.md、docs/tasks/03-extraction.md 和 data/llm_text/recipe_graph_prompt.txt。
这次只处理 recipe 抽取/表示规则，不修改 matcher 来迁就错误数据。具体任务是：……

## 加热环境规则更新
- 已执行：统一加热环境识别、容器词表、烘焙示例与验证清单，将容器 mold 替换为 oven。
- 已撤回：将 mold 等非加热环境器皿建为 container 的旧规则。
- 验证：文本差异与词表检查；未运行 LLM 生成或浏览器验证，未修改代码和 recipe JSON。
- 未完成：新词表与下游图标、匹配和历史数据的兼容性尚未验证。

## 节点命名规则更新
- 已执行：增加本体保持与本体转化的命名规则、跨 recipe 标签一致性、示例及验证项；修正示例中的状态后缀，并明确示意节点 ID 不属于 name。
- 验证：命名规则和示例文本核对、git diff --check；未运行 LLM 生成验证。
- 未完成：跨 recipe 实际生成结果的一致性尚未验证。未修改代码或 recipe JSON。

## 同一锅具的独立加热分支
- 已执行：明确 container 表示连续、活跃的加热过程分支，不表示物理锅具的永久身份。食材“盛出/取出备用”后，该食材的加热 episode 结束；下一种食材即使复用同一口锅或余油，也使用新的同类别 container occurrence。
- 已执行：禁止把先后独立煎炸并盛出的 pork、egg、green_pepper、sugar 等全部 ADD 到同一个 wok_pot 后再 split。它们先保持独立分支，只在文本明确加入另一活跃分支时汇合。
- 已执行：在当前生成 prompt 的热环境规则、container 规则、建图步骤和最终检查中同步该例外；ADD 仍创建零节点，新 container 的原因是新独立加热 episode，而不是 ADD。
- 验证：文本规则、示例和最终检查项核对；未运行 LLM 生成，未修改生成脚本或 recipe JSON。

## 不同加工对象的独立加热分支
- 已执行：独立分支的判定不再依赖“盛出/备用”等措辞。若两个不同实体在明确合并前分别接受 PROCESS，它们必须保持独立，并使用各自分支内的同类别 container occurrence；同一口物理锅或同一份油不构成分支合并。
- 已执行：禁止同一个 container occurrence 通过多条 PROCESS 边分别产出不同实体。糖的 reduce/caramelize 与猪肉的 sear 应是两条分支，文本明确把猪肉加入糖色时才以 ADD 汇合，不能先共用锅节点再 split。
- 已执行：保留“不补造动作”约束。只有原文明确描述猪肉 sear 时才生成该 PROCESS；原文仅描述将猪肉加入糖色时，不因上述示例推断 sear。
- 验证：已同步热环境规则、container 复用条件、验证清单和最终建图步骤；未运行 LLM 生成，未修改生成脚本或 recipe JSON。

## Container 的输出 lineage 约束
- 已执行：是否复用锅节点以操作后的输出 lineage 为准。同一个 container occurrence 只能属于一条连续输出 lineage；若后续操作会产生位于不同分支的不同新节点，必须在操作前为每条分支分别创建同类别 container occurrence。
- 已执行：该约束也覆盖不对称结构。例如 sugar ADD 后以 pot 作为当前接收节点，而 pork 进入加热环境后经 fry 产生新的 pork 节点；pot-current 路径与新 pork 节点路径属于不同 lineage，不能共用同一个 pot 节点。
- 已执行：物理上使用同一口锅、步骤在文字中连续出现，都不能覆盖这一图结构约束。只有后续动作继续处理同一个已建立实体或 mixture，且不会形成分支输出时，才可复用 container occurrence。
- 适用例：两份 potato braised pork 中的 a6 与 m5 后续产生不同节点，因此不能共同使用 m6；糖分支和猪肉 fry 分支各自使用一个锅节点。
- 验证：已同步当前生成 prompt 的容器复用规则、验证项和最终建图步骤；未运行 LLM 生成，未修改 recipe JSON 或生成脚本。

## 2026-10-01 原文步骤与图节点/动作对齐
- 已执行：在 `data/llm_text/recipe_graph_prompt.txt` 中新增稳定的 `text_steps` ID、逐字原文片段及 Unicode 字符偏移、节点/边索引、`node_action_pairs` 和节点/边反向 `text_step_ids` 规则。
- 已执行：规定多动作步骤拆分后可以共享/重叠原文范围；ADD 不造节点；PROCESS 输入/输出关联动作；split 的多个输出关联同一步骤。新建 cooking-stage/container 节点和结构边归入触发它的步骤，环境节点也与对应烹饪动作配对。
- 设计用途：前端可用节点或边上的 `text_step_ids` 找到侧栏原文 span，并高亮所有共享该步骤 ID 的图对象；一个步骤支持多个 node-action pair。
- 限制：历史 recipe JSON 没有 `text_steps` 和节点/边引用；侧栏现可按 recipe ID 从 `data/llm_text/original_text` 读取并显示原文，但要点击图形后定位步骤，仍需生成并保存对齐元数据。此轮没有批量生成 recipe JSON 或运行 LLM 抽取；侧栏实现记录在 `docs/tasks/02-layout.md`。

## 固定 flavor 词表
- 已执行：将用户确认的 flavor 映射加入生成 prompt，表内食材必须使用固定值，只有表外食材允许推断；无法合理推断时使用 none。
- 固定映射：scallion/garlic=aromatic；ginger/cooking_wine/red_wine/mint=deodorizing；sugar/honey/dark_soy=sweet；cinnamon/bay_leaf/star_anise/thirteen_powder/nutmeg=spicing；light_soy/salt/cheese=savory；oyster_sauce/chicken_powder/soup/black_pepper/beef_sauce=umami；red_tofu/paprika=spicy；lemon_juice=sour；water/oil/butter=none。
- 已执行：输入名称先规范化为 lowercase snake_case，并将清晰的空格或 sauce 形式解析到词表名称；dark_soy=sweet 以用户词表为准，不按一般烹饪常识覆盖。
- 已执行：允许值使用前端支持的 `spicing`，禁止新生成 `spiced` 或旧拼写 `spicied`。未修改历史 recipe JSON。
- 验证：已核对 prompt 固定表、允许值和验证清单；未运行 LLM 生成，未修改生成脚本或历史数据。

## Physical state 叶子词表
- 已执行：生成 prompt 的 physical_state 只允许输出 whole、chunk、slice、shred、powder、liquid、batter、paste、mash、dough。
- 已执行：solid 是固体上位类；solid-liquid mixture 是混合物上位类。二者只用于推理，不写入 JSON，也不增加 physical_subtype。
- 固体映射：整块/未切为 whole；块、方块、丁和 cube/dice 为 chunk；片为 slice；丝为 shred；粉末为 powder。
- 混合物映射：可流动、可倾倒的面糊为 batter；较浓、细腻或半细腻且可涂抹的糊/膏为 paste；保留明显颗粒的粗泥/碎糊为 mash；可揉捏的连贯团块为 dough。纯可流动液体为 liquid。
- 已执行：同步修正 prompt 中仍将整块示例写成 solid 的位置，并在最终验证清单禁止输出 solid、solid-liquid mixture、dice、cube。
- 验证：已进行 prompt 文本与词表一致性检查；未修改历史 recipe JSON、生成脚本、前端或后端。

## Action duration
- 已执行：生成 prompt 为 PROCESS 和 ADD edge 增加可选 `duration` 字符串；duration 属于动作边，不属于 node，也不复制进 previous。
- 2026-10-07 格式规则：`duration`统一输出英文限定词与英文时间单位，即使原文为中文；保留原文的数值、约数/至少等限定语及范围语义。现有中文duration字段已规范为英文。
- 原文出现明确数值时长及时间单位时输出，包括准确值、带数值的约数和数值范围，例如 `30 seconds`、`about 50 minutes`、`10-15 minutes`、`1 hour 30 minutes`。没有数值时长时完全省略字段，不输出 null、none、0、空字符串或推断值。
- 已执行：时间只附着到其语法上修饰的 action；同一句有多个 atomic actions 时先判断时间范围，不向相邻 ADD、容器引入边或其他 PROCESS 传播。
- 已执行：`about/approximately 50 minutes` 和 `10-15 minutes` 因含数值而生成 duration，并保留约数限定词及完整范围。`a few minutes`、`briefly`、`overnight` 和 “until golden/fragrant/cooked through/reduced”等不含数值的模糊、惯例或条件时间不生成 duration；不得凭常识补造数字。
- 验证：已同步 PROCESS/ADD schema、duration 专节、最终检查与内部建图步骤；未运行 LLM 生成，未修改历史 JSON、生成脚本、matcher 或前后端。

## 顶层 recipe_id
- 已执行：生成 prompt 明确要求顶层 JSON 同时包含 recipe_id、source_text、text_steps、nodes、edges；recipe_id 必须逐字复制用户输入的 RECIPE_ID，不得省略、翻译、规范化或从正文推断。
- 原因：generate_recipe_json.py 的 validator 要求 recipe_id，但此前 prompt 的顶层格式只明确了 source_text/text_steps/nodes/edges，导致当前 output 普遍出现 `Missing recipe_id` warning。
- r5 诊断：使用正确的 C:\temp\recipe-llm\python.exe 后，5 dongpo_pork 请求约 3 分 48 秒成功返回；内容为合法 JSON，56 nodes、56 edges，唯一 validator 问题为缺少 recipe_id。
- 验证：对当前 output 批量检查后确认 15 份均缺少 recipe_id，因此不是 r5 独有的 recipe 内容错误。未修改 matcher 或前后端。
- 2026-10-07 下游接入：合并图现在只在 action edge 层比较 duration。单侧缺失时 shared edge 采用另一侧明确值；双方明确值不同时保留两条 recipe-specific edge。该规则不影响节点匹配，也不会反向写入或补造 recipe JSON；实现与验证详见 `docs/tasks/01-matching.md`。

## Previous 改为确定性后处理
- 已执行：从生成 prompt 的 node schema、验证清单和内部步骤中移除 previous；明确禁止模型输出该字段。
- 已执行：`data/llm_text/generate_recipe_json.py` 在模型返回合法 JSON 后强制写入请求中的 recipe_id，并调用既有 `data.generate_previous.fill_previous_for_recipe`，从最终 nodes/edges 生成累计上游 provenance。
- 已执行：同一自动后处理随后调用 `propagate_flavor_to_next_main`，把 prompt 输出的食材原始单值 flavor 沿实际依赖累积到 PROCESS 食物输出；container 只传递内容而不获得食物 flavor，ADD 接收节点延迟到下一次 PROCESS 才累积。
- 作用：缩短模型输出，避免 previous.edge_index/action/type 与 edges 不一致，同时保持 matcher 当前依赖的 previous 结构不变。
- 未修改 previous 的匹配语义；matcher 仍读取后处理生成的累计 provenance。历史 JSON 未批量改写。
- 验证：Python 语法检查及 `tests.test_generate_previous` 4 项通过。当前 `data/llm_text/output` 中存在的 4 份生成结果已全部运行 previous/flavor 后处理；分别检测到 7、6、9、7 个具有累积 flavor 列表的节点。该目录当时没有 r5 文件；未来由更新后的生成脚本生成时会自动累积。

## 2026-09-29 后处理 flavor 累积修复
- 已执行：修复 `data/generate_previous.py` 的 flavor 传播。按实际上游依赖计算，覆盖 container 中转、aux 加工及跨分支汇合，不再依赖节点编号的大小顺序或尚未完成传播的缓存。
- 规则：LLM prompt 仍输出原始单值 flavor；后处理在 PROCESS 食物输出上合并原有 flavor 与输入分支的累积 flavor，去重并保留 none/单值/列表格式。ADD 接收节点不因自身 ADD 入边改写当前 flavor；这些输入传到下一次 PROCESS。container 内部传递食物 flavor，但不改写 container 的 flavor。
- 已执行：增加 `tests/test_generate_previous.py`，覆盖容器与 aux 分支、非拓扑编号与乱序列表、独立分支隔离、重复运行、现有蛋糕 fixture 及环检测；previous 生成逻辑未修改。
- 验证：项目环境 `C:\temp\recipe-llm\python.exe -m unittest discover -s tests -p "test_*.py"` 共运行 27 项，25 项通过（含新增 4 项），2 项因缺少 `data/redpork1.json` / `data/redpork4.json` 报错。`git diff --check` 通过。
- 验证：对 data 根目录当前 15 份 recipe 在内存中运行 previous/flavor 生成，均完成，重复 flavor 计算结果不变，edges 不变；未写入 recipe JSON，未进行浏览器视觉验证。
- 未完成：原有两项测试的数据路径问题尚未处理；本次未批量重新生成数据。脚本修复在下一次运行时生效，无需重启后端或刷新前端来加载脚本本身。

## 2026-10-07 gpt-6_5 duration 一次性补全
- 已执行：只修改 `data/gpt-6_5` 中原文含数值时长、但对应动作边缺少 `duration` 的历史 JSON；共更新 11 个文件、19 条动作边。未修改 recipe 1、6、14，因为审计未发现缺失的数值时长。
- 已执行：保留原文数值、范围和限定语，并统一使用英文时间单位，例如 `about 50 minutes`、`at least 4 hours`、`30-40 minutes`。
- 已修正：recipe 15 的 `60-70 minutes` 原先误挂到下一条“再烤 10 分钟”的 bake edge；现在前一条 bake 为 `60-70 minutes`，后一条 bake 为 `10 minutes`。
- 范围：这是历史数据的一次性回填；未修改生成 prompt、生成脚本、matcher、前后端或其他数据目录。

## 2026-10-07 中英双语步骤
- 已执行：生成 prompt 要求每个 `text_steps` 条目同时保存逐字原文 `text` 和忠实英文翻译 `text_en`。中文仍用于 `source_text` 字符偏移和图文联动；英文只用于显示，不参与 offset。
- 翻译必须保留食材、动作、数量、温度、时长、条件和限定语，不得概括或补充推断；原文已是英文时，`text_en` 直接复制原文。
- 已执行：生成脚本验证顶层 `source_text`/`text_steps`、每步非空 `text_en` 和原文字符范围，缺失或错位时触发重试，不保存不完整结果。
- 兼容性：历史 JSON 没有 `text_en` 时，前端仍以原文作为主文本，不阻断步骤高亮。
- 2026-10-07 顺序澄清：项目输入均为中文。模型必须先把中文拆成 atomic steps，为每一步生成完整英文 `text_en`，再基于英文步骤做实体/动作规范化和图构建；不得到最终序列化阶段才补翻译。中文 `text` 始终保留并负责 offset 与高亮。

## 2026-10-14 Container 节点接收 flavor 累积
- 已执行：`propagate_flavor_to_next_main` 不再跳过 container 类型的 PROCESS 输出；加热/搅拌等动作产生的 container 阶段节点（如 5 Dongpo Pork 的 wok_pot 32–35、37）现在带有上游累积 flavor（sweet）。
- 不变：ADD 接收节点（如 31、15）仍不因 ADD 入边改写自身 flavor，输入留到下一次 PROCESS。
- 已撤回：此前“container 只传递内容、不获得 flavor”的规则。
- 验证：`tests.test_generate_previous` 4 项通过；在内存中对 5 Dongpo Pork 运行后 32–35、37 为 sweet，未写入 JSON。未运行完整测试集，未检查前端对 container flavor 的显示/匹配影响。需重新运行生成/后处理才会更新已有 JSON。

## 2026-10-16 heat_level（加热强度）字段
- 已执行（`data/llm_text/recipe_graph_prompt.txt`）：为 type 为 heat 的 PROCESS 边增加可选 `heat_level`，新增 16.2 专节，并同步 PROCESS 边 schema、验证清单（31.2、31.3）、内部步骤 9.6 与最终检查。ADD、split 和非 heat 边不得带该字段。
- 取值：`"low"`、`"middle"`、`"high"`。单一强度输出字符串；同一动作内出现多个强度时输出按时间顺序的对象，值为该强度占该动作的比例，保留两位小数且总和为 1.0，例如 `{"low": 0.2, "high": 0.8}`（用户写的 `["low": 0.2, ...]` 不是合法 JSON，故采用对象）。
- 判定：先看原文的火力词（小火/文火/低火→low，中火→middle，大火/旺火/猛火→high；中小火→low，中大火→high 是按“最近的三档”做的约定）。没有火力词但有数字时按阈值换算：烤箱/热空气 <150C low、150–200C middle、>200C high；油温/锅面/烤架 <130C low、130–180C middle、>180C high，油温“成热”一到四成 low、五到六成 middle、七成及以上 high；液体 <80C low、80–95C middle、>95C high；功率/百分比 ≤33% low、34–66% middle、≥67% high，旋钮按所在三分之一。华氏先转摄氏，范围取中点。预热/设定的烤箱温度对该烤箱内的 bake/roast 有效，直到被改动。这些阈值是我根据常见烹饪温度设定的，需要用户确认。
- 未提及温度：不输出该键，也不输出 null/none/空串；boil、simmer、hot oil、until golden 等不算火力描述，禁止凭动作名或常识推断（如“simmer 即 low”）。
- 多强度：同一动作动词内的变化用对象；各段给出时长则按时长占比，否则按措辞推断（简短的起始阶段占比小，主要烹饪强度占比大），无线索时平分。不同动作动词（如“大火烧开，转小火炖”）各自在自己的边上取单一强度。
- 传播：同一连续加热过程（同一 container occurrence 的连续加热 lineage）内，后续 heat 边若自己没有火力描述、原文也没有说火力改变，则取前一加热动作结束时的强度（前一动作有多个强度时取最后一个，输出为字符串）。ADD、split、非 heat 的 PROCESS 不改变强度也不带该键；关火/离火/盛出，或“调整火力”但未说明档位时传播中止；其他分支或其他 container occurrence 不继承；此前没有强度则省略。
- 已执行（`data/heat_level.py`、`data/llm_text/generate_recipe_json.py`）：新增 `heat_level_errors` 格式校验并接入 `validate_graph`：仅允许 heat PROCESS 边；字符串必须是三档之一；对象至少两项、键为三档、值在 0–1 且总和为 1.0（容差 0.011）；错误会触发既有重试。该校验只检查格式，不推断或改写强度，也不检查传播是否正确。
- 验证：新增 `tests/test_heat_level_format.py` 3 项通过；完整 unittest 47 项，15 失败 2 错误，与此前相同（旧数据漂移与缺文件），无新增失败。prompt 已改前备份在会话临时目录，仓库内未留副本。
- 未完成：没有运行 LLM 抽取，所以提示是否真正产出预期的 heat_level 与传播结果未验证；没有修改历史 recipe JSON、matcher、graph_builder 和前端（后端不读取该字段，也不会显示）。生成脚本改动在下次运行时生效。

## 2026-10-18 R25 分三次打发/加入后每次搅拌
- 用户指出 R25（Triple-Layer Matcha Cheesecake）多处写“分三次”，但图里只有一次动作，且每次加入后的搅拌没有画出。已按 R24/R21 的既有写法直接修改 `data/25 Triple-Layer Matcha Cheesecake.json`（备份在会话 scratchpad 的 r25_backup）：
  - 蛋白分三次打发（原 S007）：1 条 whisk 拆成 3 条串联 whisk，新增两个中间 egg_white_mixture 节点（batter raw sweet；终点仍是原来的 paste raw sweet）。
  - 蛋白霜分三份加入蛋黄糊（原 S009/S010）：原先三份 add 到同一个 yolk_mixture 后只搅拌一次。现为 add → 翻拌（stir）→ add → 翻拌 → add → 翻拌，新增两个 cake_mixture（batter raw sweet）中间节点，最后一次翻拌接回原 cake_mixture。
  - 全蛋液分三次加入（原 S029/S030）：蛋液先 split 成 3 份（新增 2 个 egg liquid raw），每份 add 后各 stir 一次，新增两个 egg_cream_cheese_mixture（paste raw）中间节点，最后一次 stir 接回原 cake_mixture。
  - text_steps 同一原文片段拆成逐次步骤（沿用 R24：相同 start/end_char，text_en 写明第几次），其后 S 编号顺延；节点/边编号按文本顺序重排。节点 66→75，边 68→79，步骤 55→66。重新生成了全部节点的 previous（旧 previous 里已有过期动作，例如边 6 写成 prepare，实际是 cool），flavor 传播结果与原来一致。heat 边的 duration、heat_level 不变，所有原有节点签名都保留。
- 验证：`validate_graph` 对新文件只剩原文件本来就有的 8 条 “invalid source span”（现在是 S059–S066，即原 S048–S055，span 整体偏 1 个字符，**这次没有修**）；25/25 全部 merged_exact，25 与 24、23 的双向比较、图构建和 established 布局都能运行。未做浏览器视觉验证。
- 未改：S049 “分次加入蛋黄牛奶液” 没写次数，保持一次 add；S034 “过筛两遍” 本来就是两条 sift。
