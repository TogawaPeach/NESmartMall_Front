# Docker + Nginx 部署

目标：通过 `http://服务器公网IPv4:8080/` 访问首页。使用本机已构建的 `dist/`，服务器仅需 Docker，无须安装 Node.js。

## 1. 上传文件

在本机项目根目录的终端中执行。将 IP、SSH 用户名替换为实际值；下面的服务器地址仅是格式示例。SSH 用户需要能够在服务器上运行 Docker（或者给 Docker 命令加 `sudo`）。

```sh
DEPLOY_IP='203.0.113.10'
DEPLOY_USER='ubuntu'

ssh "${DEPLOY_USER}@${DEPLOY_IP}" 'mkdir -p ~/nesmartmall/nginx'
scp -r dist "${DEPLOY_USER}@${DEPLOY_IP}:nesmartmall/"
scp deploy/nginx.conf "${DEPLOY_USER}@${DEPLOY_IP}:nesmartmall/nginx/default.conf"
```

如果使用 SSH 私钥或非默认端口，在 SSH/SCP 命令中补充自己的连接参数。

上传后服务器目录应为：

```text
~/nesmartmall/
├── dist/
│   ├── index.html
│   └── assets/
└── nginx/
    └── default.conf
```

## 2. 启动容器

SSH 登录服务器，使用与上传时相同的用户：

```sh
cd ~/nesmartmall

docker run -d \
  --name nesmartmall-web \
  --restart unless-stopped \
  -p 8080:80 \
  --mount "type=bind,source=$(pwd)/dist,target=/usr/share/nginx/html,readonly" \
  --mount "type=bind,source=$(pwd)/nginx/default.conf,target=/etc/nginx/conf.d/default.conf,readonly" \
  nginx:stable-alpine
```

`8080:80` 将服务器 8080 端口映射到容器内 Nginx 的 80 端口，Nginx 配置中的 `listen` 保持 80。端口 8080 必须尚未被其他服务占用。

配置文件使用 `try_files` 回退到 `index.html`，支持本项目 Vue Router history 模式。`/assets/` 下缺失的文件返回 404，首页 HTML 每次重新验证缓存。

## 3. 检查与访问

在服务器上执行：

```sh
docker exec nesmartmall-web nginx -t
docker ps --filter name=nesmartmall-web
curl -I http://127.0.0.1:8080/
curl -I http://127.0.0.1:8080/about
```

两条 curl 正常应返回 `200 OK`。容器端口应显示 `0.0.0.0:8080->80/tcp`。

在云服务器控制台的安全组/防火墙中允许 **TCP 8080 入站**，来源设置为需要访问的客户端；如果希望任何人访问，IPv4 来源为 `0.0.0.0/0`。操作系统防火墙若启用，也需放行 TCP 8080，使用服务器已有的防火墙管理方式。

浏览器打开：

```text
http://服务器公网IPv4:8080/
```

使用公网 IPv4，而非服务器私网地址；当前是 HTTP 访问。

## 4. 更新版本

在本机重新 `npm run build`，再执行第 1 步的 `scp -r dist ...` 将文件上传到相同目录。仅更新静态文件不需要重新构建镜像或重启容器。

如果修改了 Nginx 配置，再上传 `deploy/nginx.conf`，然后在服务器执行：

```sh
docker exec nesmartmall-web nginx -t
docker exec nesmartmall-web nginx -s reload
```

## 常见问题

- 公网无法访问但服务器 curl 成功：检查云安全组、操作系统防火墙、公网 IP 是否正确。
- 显示 Nginx 默认欢迎页：检查绑定挂载路径，确认挂载的是包含 `index.html` 的 dist 目录。
- 容器启动失败：执行 `docker logs nesmartmall-web`；检查端口冲突、目录/配置文件是否存在及可读。
- 提示容器名称已存在：先用 `docker ps -a --filter name=nesmartmall-web` 确认已有容器；若就是本项目已部署容器，更新静态文件即可。
- 商品区显示“仪器加载失败，请重试”：检查后端是否可访问、接口地址与 API 代理是否配置正确。开发环境的 Vite 代理不会随 `dist/` 部署；当前 Nginx 配置仅托管静态文件，生产环境需另外配置 `/api` 反向代理，或在构建前设置 `VITE_API_BASE_URL` 并由后端允许跨域访问。

后续对接后端时，Vite 环境变量需要在构建之前设置。只改变运行中 Nginx 容器的环境变量不会改变已经打包的前端；修改后需重新构建、上传。接口对接见 [商品接口契约](product-api-contract.md)。

官方资料：[Docker 端口发布](https://docs.docker.com/engine/network/port-publishing/)、[NGINX 镜像使用说明](https://github.com/docker-library/docs/blob/master/nginx/README.md)、[Nginx try_files](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files)。
