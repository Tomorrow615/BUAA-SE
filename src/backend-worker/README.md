# backend-worker

第 6 步“Worker 最小执行链路”的后台执行进程，负责：

1. 从数据库中领取 `QUEUED` 状态的调研任务
2. 推动任务进入 `COLLECTING`、`PROCESSING` 和 `COMPLETED`
3. 同步写入 `task_stage_logs`，让任务状态与过程日志保持一致

当前实现仍然是最小闭环，不包含真实 DeepSearch 抓取、AI 分析和报告生成。

## 当前能力

当前 worker 已支持：

1. 使用 PostgreSQL 中的任务表直接领取排队任务
2. 通过 `FOR UPDATE SKIP LOCKED` 避免多个 worker 抢到同一条任务
3. 为 `COLLECTING` 和 `PROCESSING` 写入开始/完成阶段日志
4. 以占位执行方式将任务最终推进到 `COMPLETED`
5. 执行失败时写入 `FAILED` 状态和错误日志

## 环境说明

worker 默认复用 `src/.env` 中的数据库配置，并复用 `backend-api` 下的 ORM 模型和数据库会话。

建议先安装依赖：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 启动方式

处理当前队列并在队列空时退出：

```powershell
python -m research_worker.main --once
```

持续轮询队列：

```powershell
python -m research_worker.main
```

常用参数：

1. `--worker-name`：指定当前 worker 名称，便于写入阶段日志
2. `--poll-interval`：持续模式下的轮询间隔，单位秒
3. `--max-tasks`：本次进程最多处理的任务数
4. `--stage-delay`：在阶段切换之间额外等待的秒数，便于演示过程日志变化

