# backend-api

首版后端 API 服务，负责：

1. 提供用户端与管理端所需的 HTTP API
2. 管理数据库连接与迁移
3. 作为后续账户、任务、报告等业务模块的主服务

## 当前进度

当前 API 侧已完成第 5 步“调研任务主链路”，并补齐了第 6 步 Worker 所需的共享任务阶段能力，包括：

1. FastAPI 启动骨架
2. 配置读取
3. 数据库连接基础设施
4. 首版 11 张核心表 ORM 模型
5. Alembic 配置与首版初始化迁移
6. 默认角色、默认模型配置、默认信息源配置初始化脚本
7. 默认管理员初始化
8. 注册、登录、当前用户信息接口
9. JWT 鉴权与基础角色权限拦截
10. 调研任务创建、自动入队、列表、详情和状态查询接口
11. 任务阶段日志联动与最小审计日志写入
12. 健康检查接口
13. 供 `backend-worker` 复用的任务阶段名称与阶段日志写入 helper

## 环境变量说明

当前配置默认从 `src/.env` 读取。

本阶段重点相关变量包括：

1. `POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`、`POSTGRES_HOST`、`POSTGRES_PORT`
2. `JWT_SECRET`、`JWT_EXPIRE_MINUTES`、`JWT_ALGORITHM`
3. `DEFAULT_ADMIN_USERNAME`、`DEFAULT_ADMIN_EMAIL`、`DEFAULT_ADMIN_PASSWORD`、`DEFAULT_ADMIN_DISPLAY_NAME`
4. `CORS_ALLOWED_ORIGINS`

## 数据库初始化

首次初始化数据库时，先执行：

```powershell
.\.venv\Scripts\alembic.exe -c alembic.ini upgrade head
.\.venv\Scripts\python.exe .\scripts\seed_initial_data.py
```

其中 `seed_initial_data.py` 支持重复执行，当前会确保默认角色、默认模型配置、默认信息源配置和默认管理员账号处于可用状态。

## 本地启动 API

建议先在本目录创建虚拟环境并安装依赖：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

启动开发服务：

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## 当前可用接口

当前可用接口包括：

1. `GET /health/live`
2. `GET /health/ready`
3. `POST /auth/register`
4. `POST /auth/login`
5. `GET /auth/me`
6. `GET /auth/admin-check`
7. `POST /research/tasks`
8. `GET /research/tasks`
9. `GET /research/models`
10. `GET /research/tasks/{task_id}`
11. `GET /research/tasks/{task_id}/status`

其中：

1. 新创建的调研任务会自动进入 `QUEUED` 状态。
2. `GET /research/models` 会返回当前启用的可用模型，支持按 `object_type` 过滤与该对象场景匹配的模型。
3. `GET /research/tasks` 当前支持按 `object_type`、`status`、`selected_model_id`、`keyword`、`created_from`、`created_to` 进行基础筛选。
4. `ready` 会校验数据库连通性。
5. 当前已默认放行 `5173` 和 `5174` 端口的前端跨域访问，可通过 `CORS_ALLOWED_ORIGINS` 调整。

## 默认管理员

默认管理员账号由 `DEFAULT_ADMIN_*` 环境变量控制，并在执行 `seed_initial_data.py` 时自动创建或更新。

本地开发请以 `src/.env` 中的实际值为准；共享环境或演示环境中，必须主动修改默认管理员密码。
