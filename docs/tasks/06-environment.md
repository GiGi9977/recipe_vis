# 06 本地运行与项目环境

代码根目录应直接包含 backend、frontend、data；本机为 /Users/yangqi/Documents/ChatGPT/recipe_vis/source。
Windows 用户工作目录可能为 C:\temp\QiYang\recipe\recipe_vis，使用实际路径。

完整命令见 ../../RUN_LOCAL.md。
- 后端：FastAPI，127.0.0.1:8000；通过 uvicorn backend.app:app 启动。
- 前端：静态 D3，127.0.0.1:5500；通过 Python http.server 提供 frontend 目录。
- 无 npm 构建流程；Node.js 用于语法与布局测试。
- D3 来自 CDN，需要网络；API_BASE 当前写为本机 8000 端口。
- 已写启动文档，尚未由本次任务安装依赖或启动服务；未对外部署。

AGENTS.md 是新任务的项目规则入口；普通 md 需要明确要求读取。
新任务不会自动拥有此前所有聊天内容，请使用 docs/tasks 的交接材料。

## 新任务开场白
阅读 AGENTS.md、RUN_LOCAL.md 和 docs/tasks/06-environment.md，启动本地前后端并验证访问地址。
不要改动匹配、布局或输入数据。
# 2026-10-12 frontend/backend port alignment

- Executed: changed the React/Vite proxy and retained legacy frontend API base
  from port 8001 to the documented backend port 8000.
- Restart Vite after this configuration change. The backend does not need a
  restart when it is already running on port 8000.

