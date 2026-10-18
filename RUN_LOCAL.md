# 在 Codex 中运行 Recipe Vis

## 打开正确目录

在 Codex 桌面应用中将含 backend、frontend、data 的目录选为项目目录。
本机对应：`/Users/yangqi/Documents/ChatGPT/recipe_vis/source`。
Windows 上对应你的 `C:\temp\QiYang\recipe\recipe_vis`（按实际路径替换）。

AGENTS.md 是 Codex 的项目说明，不是可执行脚本。新任务会加载适用的项目说明；
刚创建或更新后，可以新建任务并要求 Codex 概述当前规则。
普通 Markdown 文件如本文不会自动执行，需要明确让 Codex 阅读。

## Windows：Anaconda Prompt（CMD）

已配置的 conda 环境为 `C:\temp\recipe-llm`。直接使用，不需要创建 `.venv` 或重新安装依赖。
下面的 Windows 后端端口按用户提供的命令记为 **8000**。

终端 1（Anaconda Prompt），激活已有环境并在项目根目录启动后端：

```bat
conda activate C:\temp\recipe-llm
cd /d "C:\temp\QiYang\recipe\recipe_vis"
uvicorn backend.app:app --reload --port 8000
```

终端 2（另开 Anaconda Prompt），进入 **frontend 目录**后启动前端：

```bat
conda activate C:\temp\recipe-llm
cd /d "C:\temp\QiYang\recipe\recipe_vis\frontend"
python -m http.server 3000
```

前端访问：http://127.0.0.1:3000。
如果从项目根目录运行 `python -m http.server 3000`，则应访问 http://127.0.0.1:3000/frontend/。
## macOS

终端 1，首次准备：

```sh
cd /Users/yangqi/Documents/ChatGPT/recipe_vis/source
python3 -m venv .venv
.venv/bin/python -m pip install fastapi uvicorn
```

启动后端：

```sh
.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload
```

另开终端 2：

```sh
cd /Users/yangqi/Documents/ChatGPT/recipe_vis/source
.venv/bin/python -m http.server 5500 --bind 127.0.0.1 --directory frontend
```

## 查看结果

- Windows 前端使用 http://127.0.0.1:3000；上述 macOS 示例使用 http://127.0.0.1:5500。
- 后端接口文档：Windows 按上面的端口核对说明；macOS 示例为 http://127.0.0.1:8000/docs。
- 前端 API_BASE 当前为 http://127.0.0.1:8000，改变后端端口时需要同步更新。
- 前端使用 CDN 加载 D3，需要能访问 cdn.jsdelivr.net。
- 修改前端后强制刷新浏览器；Ctrl+C 停止对应终端的服务。
- 这些命令启动本地开发服务，并未将项目发布到互联网。

## 给 Codex 的任务示例

“阅读 AGENTS.md 和 RUN_LOCAL.md，检查运行环境，然后启动本地前后端。
报告两个访问地址和启动结果，不修改匹配或布局逻辑。”

如已安装 Codex CLI，也可从项目根目录运行：

```sh
codex
```

然后输入上面的任务。CLI 的 `/init` 可生成 AGENTS.md；本项目已提供该文件，无需重新生成。

## 测试

Windows 在已激活 `C:\temp\recipe-llm` 的 Anaconda Prompt 中执行；macOS 使用项目虚拟环境的 Python：

```sh
python -m unittest discover -s tests -p "test_*.py"
node --check frontend/app.js
node tests/test_attached_main_layout.js
```

Node.js 仅用于这些 JavaScript 检查；运行静态前端不需要 Node.js。
本文安装命令用于开发环境初始化；如需复现实验依赖版本，应记录实际环境版本。

## 官方说明

- https://learn.chatgpt.com/docs/agent-configuration/agents-md
- https://learn.chatgpt.com/docs/codex/cli

# React frontend (current copied version)

The original `recipe_vis` folder is unchanged. Run this copied project from
`recipe_vis_plan`.

In the first terminal:

```powershell
conda activate C:\temp\recipe-llm
cd C:\temp\QiYang\recipe\recipe_vis_plan
python -m uvicorn backend.app:app --host 127.0.0.1 --port 8001 --reload
```

In a second terminal:

```powershell
conda activate C:\temp\recipe-llm
cd C:\temp\QiYang\recipe\recipe_vis_plan\frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5500/`. The preserved D3 version is available at
`http://127.0.0.1:5500/legacy.html`.

