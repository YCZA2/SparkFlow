# SparkFlow 阿里云单机部署

本文档记录当前仓库已经验证过的一套阿里云 ECS 单机部署方式，目标是用最少组件稳定跑起 SparkFlow 后端。

## 适用口径

- 单台 Ubuntu ECS
- `systemd + nginx + PostgreSQL + RabbitMQ + FastAPI`
- 文件存储先使用 `FILE_STORAGE_PROVIDER=local`
- Chroma 与 uploads 保存在应用目录下
- 仅启动 `1` 个 `uvicorn` worker；异步任务由独立 Celery worker 承载，周期任务由单独 Celery beat 发布
- 默认通过本机 `ssh aliyun` + `rsync` 发布，不依赖服务器额外配置 GitHub 凭据

## 服务器准备

推荐先完成：

```bash
sudo fallocate -l 2G /swapfile || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null

sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y python3-venv postgresql rabbitmq-server ffmpeg git rsync curl
sudo systemctl enable --now postgresql
sudo systemctl enable --now rabbitmq-server
```

## 代码同步

推荐直接从本机同步 `backend/`，避免服务器额外配置 GitHub 凭据：

```bash
ssh aliyun 'mkdir -p /home/ycza/apps/sparkflow/backend /home/ycza/apps/sparkflow/backend/runtime'
rsync -az --delete \
  --exclude '.venv' \
  --exclude '__pycache__' \
  --exclude '.pytest_cache' \
  --exclude '.hypothesis' \
  --exclude 'runtime_logs' \
  --exclude 'runtime' \
  --exclude 'uploads' \
  --exclude 'chroma_data' \
  backend/ aliyun:/home/ycza/apps/sparkflow/backend/
```

如果希望复用仓库脚本，也可以直接执行：

```bash
bash scripts/deploy-backend-aliyun.sh sync
```

## 生产环境变量

推荐把生产环境变量放在远端外置文件 `/home/ycza/.config/sparkflow/backend.env`，避免 `rsync --delete` 覆盖，也避免项目目录残留 `.env` 干扰生产配置。

```bash
ssh aliyun 'mkdir -p /home/ycza/.config/sparkflow'
```

然后在 `/home/ycza/.config/sparkflow/backend.env` 写入最少配置：

```dotenv
DEBUG=false
HOST=127.0.0.1
PORT=8000
SECRET_KEY=<强随机值>
ACCESS_TOKEN_EXPIRE_MINUTES=1440
ENABLE_TEST_AUTH=false
DATABASE_URL=postgresql+psycopg://sparkflow:<密码>@127.0.0.1:5432/sparkflow
SQLALCHEMY_ECHO=false
LOG_LEVEL=INFO
LOG_JSON=false
LLM_PROVIDER=qwen
LLM_MODEL=qwen-turbo
DASHSCOPE_API_KEY=<真实 DashScope Key>
STT_PROVIDER=dashscope
EMBEDDING_PROVIDER=qwen
EMBEDDING_MODEL=text-embedding-v2
VECTOR_DB_PROVIDER=chromadb
CHROMADB_PATH=./chroma_data
FILE_STORAGE_PROVIDER=local
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE=52428800
CELERY_BROKER_URL=amqp://guest:guest@127.0.0.1:5672//
CELERY_RESULT_BACKEND=rpc://
CELERY_TASK_ALWAYS_EAGER=false
ENABLE_DAILY_PUSH_SCHEDULER=false
ENABLE_WRITING_CONTEXT_SCHEDULER=true
```

注意：

- 生产命令必须显式带 `APP_ENV=production`，否则配置中心不会进入 production fail-fast 校验
- 远端项目目录不要保留 `backend/.env`；它会被基础加载逻辑优先读取，并可能把 `DEBUG=true` 等开发值带进生产进程
- 仅用占位值能让 provider 初始化通过，但 AI / STT 接口不会真正可用

## 数据库初始化

```bash
sudo -u postgres psql -c "CREATE ROLE sparkflow LOGIN PASSWORD '<密码>'"
sudo -u postgres createdb -O sparkflow sparkflow
PGPASSWORD='<密码>' psql -h 127.0.0.1 -U sparkflow -d sparkflow -c 'select current_user, current_database();'
```

如果角色已经存在，改用：

```bash
sudo -u postgres psql -c "ALTER ROLE sparkflow WITH LOGIN PASSWORD '<密码>'"
```

## Python 依赖与迁移

建议服务器侧把 pip 源切到阿里云镜像：

```bash
mkdir -p ~/.config/pip
cat > ~/.config/pip/pip.conf <<'EOF'
[global]
index-url = https://mirrors.aliyun.com/pypi/simple/
trusted-host = mirrors.aliyun.com
EOF
```

然后安装并迁移：

```bash
cd /home/ycza/apps/sparkflow/backend
mkdir -p uploads chroma_data runtime
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
set -a
. /home/ycza/.config/sparkflow/backend.env
set +a
APP_ENV=production .venv/bin/alembic upgrade heads
```

## systemd 服务

`/etc/systemd/system/sparkflow-backend.service`：

```ini
[Unit]
Description=SparkFlow FastAPI Backend
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=ycza
WorkingDirectory=/home/ycza/apps/sparkflow/backend
Environment=APP_ENV=production
EnvironmentFile=/home/ycza/.config/sparkflow/backend.env
ExecStart=/home/ycza/apps/sparkflow/backend/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 1 --no-access-log
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/sparkflow-celery-worker.service`：

```ini
[Unit]
Description=SparkFlow Celery Worker
After=network.target postgresql.service rabbitmq-server.service
Wants=postgresql.service rabbitmq-server.service

[Service]
Type=simple
User=ycza
WorkingDirectory=/home/ycza/apps/sparkflow/backend
Environment=APP_ENV=production
EnvironmentFile=/home/ycza/.config/sparkflow/backend.env
ExecStart=/home/ycza/apps/sparkflow/backend/.venv/bin/celery -A celery_app:celery_app worker -Q transcription,fragment-derivative,document-import,script-generation,knowledge-processing,daily-push,default --pool=solo --concurrency=1 --loglevel=INFO
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/sparkflow-celery-beat.service`：

```ini
[Unit]
Description=SparkFlow Celery Beat
After=network.target rabbitmq-server.service
Wants=rabbitmq-server.service

[Service]
Type=simple
User=ycza
WorkingDirectory=/home/ycza/apps/sparkflow/backend
Environment=APP_ENV=production
EnvironmentFile=/home/ycza/.config/sparkflow/backend.env
ExecStart=/home/ycza/apps/sparkflow/backend/.venv/bin/celery -A celery_app:celery_app beat --schedule=/home/ycza/apps/sparkflow/backend/runtime/celerybeat-schedule --loglevel=INFO
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sparkflow-backend sparkflow-celery-worker sparkflow-celery-beat
sudo systemctl status sparkflow-backend --no-pager -l
sudo systemctl status sparkflow-celery-worker --no-pager -l
sudo systemctl status sparkflow-celery-beat --no-pager -l
sudo journalctl -u sparkflow-backend -n 200 --no-pager
sudo journalctl -u sparkflow-celery-worker -n 200 --no-pager
sudo journalctl -u sparkflow-celery-beat -n 200 --no-pager
```

仓库内也提供了一个发布脚本，默认会按同样口径执行同步、装依赖、迁移、重启和健康检查：

```bash
bash scripts/deploy-backend-aliyun.sh deploy
```

如果只是在服务器上改了配置或想手动拉起服务，当前远端已经放了两个重启命令：

```bash
sparkflow-backend-restart
sfrestart
```

它们应与仓库发布脚本保持一致，重启 `sparkflow-backend`、`sparkflow-celery-worker` 和 `sparkflow-celery-beat`，然后直接打印最近的服务状态。

## nginx 反代

当前推荐同域名接入：前端静态站点继续占 `/`，后端占 `/api/*` 和 `/uploads/*`。

`/etc/nginx/sites-enabled/web` 的 `443` server block 里至少需要：

```nginx
location = /api/health {
    proxy_pass http://127.0.0.1:8000/health;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /uploads/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

变更后执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 验证

```bash
curl http://127.0.0.1:8000/health
curl -k --resolve www.onepercent.ltd:443:127.0.0.1 https://www.onepercent.ltd/api/health
sudo journalctl -u sparkflow-backend -n 200 --no-pager
sudo journalctl -u sparkflow-celery-worker -n 200 --no-pager
sudo journalctl -u sparkflow-celery-beat -n 200 --no-pager
```

如需验证邮件注册链路，注意当前依赖里已经显式补齐了 `email-validator`；新环境必须重新 `pip install -r requirements.txt` 才能避免 `EmailStr` 导致的启动失败。

已验证的最小 smoke 包括：

- `register -> login -> me -> refresh -> logout -> me(401)`
- `curl http://127.0.0.1:8000/health`
- `curl -k --resolve www.onepercent.ltd:443:127.0.0.1 https://www.onepercent.ltd/api/health`
