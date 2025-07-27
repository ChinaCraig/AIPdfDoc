# PDF智能文件管理系统

一个基于Flask和AI技术的PDF文档智能检索和管理系统，支持多模态内容提取、语义搜索和GraphRAG检索。

## 🚀 系统特性

### 核心功能
- **文件管理**: PDF文件上传、删除、重命名、批量操作
- **智能提取**: 文字、表格、图片、图表自动识别和提取
- **语义搜索**: 基于向量数据库的智能检索
- **GraphRAG**: 知识图谱增强的检索生成
- **流式对话**: ChatGPT风格的实时问答交互
- **多模态分析**: 支持文本、表格、图像、图表综合分析

### 技术特色
- **AI驱动**: 集成DeepSeek LLM、本地OCR和嵌入模型
- **多数据库**: MySQL + Milvus向量库 + Neo4j图数据库
- **实时处理**: 异步任务处理和进度跟踪
- **现代UI**: 响应式Web界面，支持拖拽上传
- **高性能**: 支持并发处理和缓存优化

## 🏗️ 系统架构

```
PdfDoc/
├── app/                    # 应用程序核心
│   ├── routes/            # 路由模块
│   │   ├── FileRoutes.py  # 文件管理路由
│   │   └── SearchRoutes.py # 智能检索路由
│   ├── service/           # 业务逻辑
│   │   ├── FileService.py # 文件管理服务
│   │   └── SearchService.py # 智能检索服务
│   └── environment_check.py # 环境检查
├── config/                # 配置文件
│   ├── db.yaml           # 数据库配置
│   ├── model.yaml        # 模型配置
│   ├── config.yaml       # 应用配置
│   └── prompt.yaml       # 提示词配置
├── templates/             # 前端资源
│   ├── html/             # HTML模板
│   ├── css/              # 样式文件
│   └── js/               # JavaScript脚本
├── db.sql                # 数据库初始化脚本
├── app.py                # 主应用程序
├── requirements.txt      # Python依赖
└── README.md            # 项目文档
```

## 🛠️ 安装部署

### 环境要求
- Python 3.8+
- MySQL 5.7+
- Redis 6.0+
- Milvus 2.3+
- Neo4j 5.0+

### 快速开始

1. **克隆项目**
```bash
git clone <repository-url>
cd PdfDoc
```

2. **安装Python依赖**
```bash
pip install -r requirements.txt
```

3. **配置数据库**
```bash
# 执行MySQL初始化脚本
mysql -u root -p < db.sql
```

4. **配置环境**
```bash
# 修改配置文件
cp config/db.yaml.example config/db.yaml
# 编辑配置文件，设置数据库连接信息
```

5. **启动系统**
```bash
python app.py
```

系统将自动进行环境检查，然后启动Web服务器。

访问地址: http://localhost:5000

## ⚙️ 配置说明

### 数据库配置 (`config/db.yaml`)
```yaml
mysql:
  host: localhost
  port: 3306
  username: root
  password: zhang
  database: pdf_ai_doc

milvus:
  host: 192.168.16.26
  port: 19530
  database: pdf_ai_doc
  collection: pdf_doc

neo4j:
  uri: bolt://localhost:7687
  username: neo4j
  password: password
```

### 模型配置 (`config/model.yaml`)
```yaml
# 全局GPU加速开关
global_gpu_acceleration: false

# LLM配置
llm:
  provider: deepseek
  api_key: sk-27e712e3a6c64533884adc0ad040ff3b
  base_url: https://api.deepseek.com

# 嵌入模型配置
embedding_model:
  model_name: text-embedding-3-small
  vector_size: 768

# OCR模型配置
ocr_model:
  ocr_type: paddleocr
  lang: ch
```

## 📋 系统功能

### 文件管理
- ✅ PDF文件上传（支持拖拽）
- ✅ 文件列表查看和搜索
- ✅ 文件重命名和删除
- ✅ 批量操作支持
- ✅ 处理进度实时显示
- ✅ 文件状态监控

### 智能检索
- ✅ 创建和管理对话会话
- ✅ 实时流式问答
- ✅ 多文件范围检索
- ✅ 搜索结果来源标注
- ✅ 对话历史管理
- ✅ 响应时间统计

### 内容处理
- ✅ 文本内容提取
- ✅ 表格识别和解析
- ✅ 图片提取和分析
- ✅ 图表识别和数据提取
- ✅ 多模态内容融合

### 数据管理
- ✅ MySQL关系数据存储
- ✅ Milvus向量索引
- ✅ Neo4j知识图谱
- ✅ Redis缓存加速
- ✅ 任务队列管理

## 🔧 开发指南

### 项目结构
- `app/routes/`: API路由定义
- `app/service/`: 业务逻辑实现
- `config/`: 系统配置文件
- `templates/`: 前端资源文件

### 添加新功能
1. 在`app/service/`中实现业务逻辑
2. 在`app/routes/`中添加API接口
3. 在`templates/js/`中添加前端交互
4. 更新配置文件（如需要）

### 代码规范
```bash
# 代码格式化
black app/

# 代码检查
flake8 app/

# 类型检查
mypy app/
```

### 运行测试
```bash
pytest tests/
```

## 📊 API接口

### 文件管理接口
- `POST /api/file/upload` - 上传文件
- `GET /api/file/list` - 获取文件列表
- `DELETE /api/file/delete/{id}` - 删除文件
- `PUT /api/file/rename/{id}` - 重命名文件
- `GET /api/file/status/{id}` - 获取文件状态

### 智能检索接口
- `POST /api/search/session/create` - 创建会话
- `POST /api/search/query` - 智能问答
- `POST /api/search/stream` - 流式问答
- `GET /api/search/history/{session_id}` - 获取历史记录
- `GET /api/search/sessions` - 获取会话列表

### 系统接口
- `GET /health` - 健康检查
- `GET /api/system/info` - 系统信息

## 🚨 注意事项

### 环境检查
系统启动时会自动检查：
- 模型文件下载状态
- 数据库连接状态
- 向量数据库初始化
- 图数据库初始化
- AI模型加载状态

### 性能优化
- 启用Redis缓存
- 配置合适的并发数
- 使用GPU加速（如可用）
- 定期清理临时文件

### 安全建议
- 修改默认密钥和密码
- 启用HTTPS（生产环境）
- 配置文件上传限制
- 定期备份数据库

## 🐛 故障排除

### 常见问题

1. **模型下载失败**
   - 检查网络连接
   - 手动下载模型文件到指定目录

2. **数据库连接失败**
   - 确认数据库服务运行状态
   - 检查配置文件中的连接信息

3. **文件上传失败**
   - 检查文件大小限制
   - 确认上传目录权限

4. **OCR识别错误**
   - 确认PaddleOCR模型安装
   - 检查图片质量和格式

### 日志查看
```bash
# 应用日志
tail -f logs/app.log

# 环境检查日志
tail -f logs/environment_check.log
```

## 📈 性能监控

系统提供以下监控指标：
- 文件处理速度
- 搜索响应时间
- 内存使用情况
- 数据库连接状态
- API调用统计

## 🤝 贡献指南

欢迎提交问题和改进建议！

1. Fork 项目
2. 创建特性分支
3. 提交变更
4. 推送到分支
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🔗 相关链接

- [DeepSeek API文档](https://api.deepseek.com)
- [PaddleOCR文档](https://github.com/PaddlePaddle/PaddleOCR)
- [Milvus文档](https://milvus.io/docs)
- [Neo4j文档](https://neo4j.com/docs)

## 📞 技术支持

如有问题，请提交Issue或联系开发团队。

---

**PDF智能文件管理系统** - 让文档检索更智能！ 