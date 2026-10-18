# Recipe Vis 项目约定

## 项目范围
- 本目录是代码根目录，包含 backend、frontend、data 和 tests。
- 后端为 Python/FastAPI；前端为原生 JavaScript + D3，没有 npm 构建步骤。
- 本项目支持 recipe graph 比较与可视化。启动方式见 RUN_LOCAL.md。

## 新任务交接
- 开始工作先读 docs/tasks/README.md，再读与本次任务相关的分类说明。
- 匹配、布局、抽取、图标、论文和环境任务分别记录；不要把某类历史方案自动应用到其他任务。
- 以当前源码与用户最新要求为准，旧 deliverables 不是可以叠加覆盖的升级包。
- 任务结束时更新对应说明的规则、验证结果和未完成事项；区分建议、已执行和已撤回。

## 本地运行
以下命令均从本目录执行，Python 使用项目虚拟环境。
- 安装 Web 运行依赖：`python -m pip install fastapi uvicorn`。
- 后端：`python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload`。
- 前端（另一个终端）：`python -m http.server 5500 --bind 127.0.0.1 --directory frontend`。
- 前端地址：http://127.0.0.1:5500；后端文档：http://127.0.0.1:8000/docs。
- 不直接执行 backend/app.py；该文件使用包内相对导入。

## 维护约定
- 尊重已有未提交修改；针对当前请求修改，避免顺带重构 matcher 或整套布局。
- 未明确要求时，不修改原始 recipe JSON、不推断补边、不改变数据结构。
- exact/similar 使用原始 physical_state；pieces 分组只影响节点描边，不增加 physical_subtype。
- 保留分支来源与汇合阶段约束，以及一对一、无环的主节点匹配。
- aux 加工生成 main 可以进入候选；同名产物对应不能覆盖已有共同来源的分支冲突。
- 布局中的单个无前序加工 main 可按 aux 附加布局；已有加工分支保留原布局。
- 附加布局按 recipe 侧分组，横向每行最多 5 个，换行 y 偏移沿用 NB_AUX_ROW_GAP。
- 不恢复已撤回的“整条 main 加工链都移入 aux 区域”或全局分支带重排方案。
- main 的布局位置不得改变其 domain、状态、图标语义或匹配结果。

## 验证与交付
- 修改 Python 匹配/建图逻辑后：`python -m unittest discover -s tests -p "test_*.py"`。
- 修改前端后：`node --check frontend/app.js`；若涉及附加布局，再运行 `node tests/test_attached_main_layout.js`。
- 按改动范围检查相关 recipe；不要把坐标测试通过描述成已完成浏览器视觉验证。
- 说明改了哪些文件、实际运行了哪些检查，以及需要重启后端还是强制刷新前端。
