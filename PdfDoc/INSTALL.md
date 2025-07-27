# 安装指南

## 快速开始

### 1. 环境准备

确保您的系统满足以下要求：
- Python 3.8+
- MySQL 5.7+
- Redis 6.0+
- Milvus 2.3+
- Neo4j 5.0+

### 2. 安装步骤

#### 步骤1: 克隆项目
```bash
cd /path/to/your/workspace
# 项目已在 PdfDoc/ 目录中
```

#### 步骤2: 安装Python依赖
```bash
cd PdfDoc
pip install -r requirements.txt
```

#### 步骤3: 配置数据库
```bash
# 连接到MySQL并执行初始化脚本
mysql -u root -p
# 输入密码：zhang

# 在MySQL中执行：
source db.sql;
```

#### 步骤4: 配置其他服务

**启动Redis:**
```bash
redis-server
```

**启动Milvus:**
```bash
# 使用Docker启动Milvus
docker run -d --name milvus \
  -p 19530:19530 \
  -p 9091:9091 \
  milvusdb/milvus:latest
```

**启动Neo4j:**
```bash
# 部署Neo4j
1.拉取代码
 docker pull neo4j:2025.06.2
2.在工作空间创建工作目录
 mkdir neo4j
3.在neo4j下创建一个docker-compose.yml文件，将一下内容粘贴进去（注意修改账号和密码）
	services:
	  neo4j:
	    image: neo4j:latest
	    volumes:
	      - ./data:/data
	      - ./logs:/logs
	      - ./conf:/conf
	      - ./import:/import
	    environment:
	        - NEO4J_AUTH=neo4j/123456
	    ports:
	      - "7474:7474"
	      - "7687:7687"
	    restart: always
	注：
		volumes这里配置了文件的存储位置，这样配置好以后，会在刚才创建的neo4j这个文件夹下创建这几个文件夹
4.
# 使用Docker启动Neo4j
 docker compose up -d
# 访问
	localhost::7474/browser/
	
	账号：neo4j
	密码：123456
```

#### 步骤5: 启动应用
```bash
# 方式1: 使用启动脚本（推荐）
python start.py

# 方式2: 直接启动
python app.py

# 方式3: 仅检查环境
python start.py --check-only
```

### 3. 访问系统

打开浏览器访问：http://localhost:5000

### 4. 验证安装

1. 访问健康检查接口：http://localhost:5000/health
2. 查看系统信息：http://localhost:5000/api/system/info
3. 尝试上传一个PDF文件
4. 测试智能检索功能

## 故障排除

### 常见问题

1. **Python依赖安装失败**
```bash
# 升级pip
pip install --upgrade pip

# 使用国内源
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple/
```

2. **MySQL连接失败**
- 确保MySQL服务正在运行
- 检查用户名和密码是否正确
- 确认3306端口未被占用

3. **Milvus连接失败**
- 确保Milvus服务正在运行
- 检查19530端口是否可访问
- 验证网络连接：`telnet 192.168.16.26 19530`

4. **模型下载失败**
```bash
# 手动下载模型到指定目录
mkdir -p models/embedding
mkdir -p models/ocr
# 根据配置文件中的路径放置模型文件
```

5. **端口被占用**
```bash
# 查看端口使用情况
lsof -i :5000

# 使用其他端口启动
python start.py --port 8000
```

### 日志查看

```bash
# 应用日志
tail -f logs/app.log

# 环境检查日志
tail -f logs/environment_check.log
```

### 开发模式

```bash
# 启用调试模式
python start.py --debug

# 跳过环境检查
python start.py --skip-check
```

## 生产部署

### 使用Gunicorn

```bash
# 安装Gunicorn（已在requirements.txt中）
pip install gunicorn

# 启动应用
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

### 使用Nginx反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 系统服务配置

创建systemd服务文件 `/etc/systemd/system/pdf-ai-doc.service`:

```ini
[Unit]
Description=PDF智能文件管理系统
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/PdfDoc
ExecStart=/usr/bin/python3 app.py
Restart=always

[Install]
WantedBy=multi-user.target
```

启动服务：
```bash
sudo systemctl enable pdf-ai-doc
sudo systemctl start pdf-ai-doc
```

## 性能优化

1. **使用Redis缓存**
   - 启用Redis缓存以提高响应速度
   - 配置合适的缓存过期时间

2. **数据库优化**
   - 为频繁查询的字段添加索引
   - 定期优化数据库表

3. **并发处理**
   - 调整Gunicorn worker数量
   - 使用连接池

4. **静态文件处理**
   - 使用Nginx处理静态文件
   - 启用gzip压缩

## 备份策略

1. **数据库备份**
```bash
# MySQL备份
mysqldump -u root -p pdf_ai_doc > backup.sql

# 恢复
mysql -u root -p pdf_ai_doc < backup.sql
```

2. **文件备份**
```bash
# 备份上传文件
tar -czf uploads_backup.tar.gz uploads/

# 备份配置文件
cp -r config/ config_backup/
```

需要帮助？请查看 [README.md](README.md) 或提交Issue。 