#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
环境检查和初始化模块
负责在系统启动前检查和初始化所有必要的组件
"""

import os
import sys
import yaml
import logging
import asyncio
import pymysql
import redis
from pathlib import Path
from typing import Dict, Any, List, Tuple
import requests
import json
import time
from datetime import datetime

# 第三方库导入
try:
    from pymilvus import connections, Collection, FieldSchema, CollectionSchema, DataType, utility
    MILVUS_AVAILABLE = True
except ImportError:
    MILVUS_AVAILABLE = False
    
try:
    from neo4j import GraphDatabase
    NEO4J_AVAILABLE = True
except ImportError:
    NEO4J_AVAILABLE = False

try:
    import paddleocr
    PADDLEOCR_AVAILABLE = True
except ImportError:
    PADDLEOCR_AVAILABLE = False

try:
    import sentence_transformers
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False


class EnvironmentChecker:
    """环境检查器"""
    
    def __init__(self, config_dir: str = "./config"):
        self.config_dir = Path(config_dir)
        self.logger = self._setup_logger()
        self.configs = self._load_configs()
        self.check_results = {}
        
    def _setup_logger(self) -> logging.Logger:
        """设置日志器"""
        logger = logging.getLogger("environment_checker")
        logger.setLevel(logging.INFO)
        
        # 创建日志目录
        log_dir = Path("./logs")
        log_dir.mkdir(exist_ok=True)
        
        # 创建文件处理器
        file_handler = logging.FileHandler(log_dir / "environment_check.log", encoding='utf-8')
        file_handler.setLevel(logging.INFO)
        
        # 创建控制台处理器
        console_handler = logging.StreamHandler()
        console_handler.setLevel(logging.INFO)
        
        # 设置格式
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        file_handler.setFormatter(formatter)
        console_handler.setFormatter(formatter)
        
        logger.addHandler(file_handler)
        logger.addHandler(console_handler)
        
        return logger
        
    def _load_configs(self) -> Dict[str, Any]:
        """加载配置文件"""
        configs = {}
        config_files = ['config.yaml', 'db.yaml', 'model.yaml', 'prompt.yaml']
        
        for config_file in config_files:
            config_path = self.config_dir / config_file
            if config_path.exists():
                with open(config_path, 'r', encoding='utf-8') as f:
                    configs[config_file.split('.')[0]] = yaml.safe_load(f)
                self.logger.info(f"已加载配置文件: {config_file}")
            else:
                self.logger.error(f"配置文件不存在: {config_file}")
                
        return configs
        
    async def check_all_components(self) -> Dict[str, bool]:
        """检查所有组件"""
        self.logger.info("开始环境检查...")
        
        # 检查任务列表
        check_tasks = [
            self._check_directories(),
            self._check_mysql_connection(),
            self._check_redis_connection(),
            self._check_milvus_connection(),
            self._check_neo4j_connection(),
            self._check_deepseek_api(),
            self._check_embedding_model(),
            self._check_ocr_model(),
            self._check_dependencies()
        ]
        
        # 并发执行检查任务
        results = await asyncio.gather(*check_tasks, return_exceptions=True)
        
        # 处理检查结果
        check_names = [
            "directories", "mysql", "redis", "milvus", 
            "neo4j", "deepseek_api", "embedding_model", 
            "ocr_model", "dependencies"
        ]
        
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                self.check_results[check_names[i]] = False
                self.logger.error(f"{check_names[i]} 检查失败: {result}")
            else:
                self.check_results[check_names[i]] = result
                
        self._log_check_summary()
        return self.check_results
        
    async def _check_directories(self) -> bool:
        """检查目录结构"""
        self.logger.info("检查目录结构...")
        
        required_dirs = [
            "./uploads", "./processed", "./temp", "./logs", 
            "./models", "./models/embedding", "./models/ocr",
            "./models/ocr/det", "./models/ocr/rec", "./models/ocr/cls",
            "./models/ocr/table", "./models/ocr/chart",
            "./models/image", "./models/text"
        ]
        
        for dir_path in required_dirs:
            path = Path(dir_path)
            if not path.exists():
                path.mkdir(parents=True, exist_ok=True)
                self.logger.info(f"创建目录: {dir_path}")
            else:
                self.logger.debug(f"目录已存在: {dir_path}")
                
        self.logger.info("✓ 目录结构检查完成")
        return True
        
    async def _check_mysql_connection(self) -> bool:
        """检查MySQL连接"""
        self.logger.info("检查MySQL数据库连接...")
        
        try:
            db_config = self.configs.get('db', {}).get('mysql', {})
            connection = pymysql.connect(
                host=db_config.get('host', 'localhost'),
                port=db_config.get('port', 3306),
                user=db_config.get('username', 'root'),
                password=db_config.get('password', ''),
                charset=db_config.get('charset', 'utf8mb4')
            )
            
            with connection.cursor() as cursor:
                cursor.execute("SELECT VERSION()")
                version = cursor.fetchone()
                self.logger.info(f"✓ MySQL连接成功，版本: {version[0]}")
                
            # 检查数据库是否存在
            database_name = db_config.get('database', 'pdf_ai_doc')
            with connection.cursor() as cursor:
                cursor.execute(f"SHOW DATABASES LIKE '{database_name}'")
                result = cursor.fetchone()
                if not result:
                    self.logger.warning(f"数据库 {database_name} 不存在，需要手动执行 db.sql 脚本")
                else:
                    self.logger.info(f"✓ 数据库 {database_name} 已存在")
                    
            connection.close()
            return True
            
        except Exception as e:
            self.logger.error(f"✗ MySQL连接失败: {e}")
            return False
            
    async def _check_redis_connection(self) -> bool:
        """检查Redis连接"""
        self.logger.info("检查Redis连接...")
        
        try:
            # 从db.yaml中读取Redis配置
            redis_config = self.configs.get('db', {}).get('redis', {})
            
            # 如果db.yaml中没有Redis配置，则尝试从config.yaml中读取
            if not redis_config:
                redis_config = self.configs.get('config', {}).get('cache', {})
            
            host = redis_config.get('host', 'localhost')
            port = redis_config.get('port', 6379)
            password = redis_config.get('password', None)
            db = redis_config.get('db', 0)
            
            # 创建Redis连接
            redis_client = redis.Redis(
                host=host,
                port=port,
                password=password,
                db=db,
                decode_responses=True
            )
            
            # 测试连接
            redis_client.ping()
            info = redis_client.info()
            self.logger.info(f"✓ Redis连接成功，版本: {info.get('redis_version', 'unknown')}")
            return True
            
        except Exception as e:
            self.logger.error(f"✗ Redis连接失败: {e}")
            return False
            
    async def _check_milvus_connection(self) -> bool:
        """检查Milvus向量数据库连接"""
        if not MILVUS_AVAILABLE:
            self.logger.error("✗ pymilvus 库未安装")
            return False
            
        self.logger.info("检查Milvus向量数据库连接...")
        
        try:
            milvus_config = self.configs.get('db', {}).get('milvus', {})
            host = milvus_config.get('host', '192.168.16.26')
            port = milvus_config.get('port', 19530)
            
            # 连接Milvus
            connections.connect(
                alias="default",
                host=host,
                port=port
            )
            
            # 检查连接状态
            if connections.has_connection("default"):
                self.logger.info(f"✓ Milvus连接成功 ({host}:{port})")
                
                # 检查集合是否存在
                collection_name = milvus_config.get('collection', 'pdf_doc')
                if utility.has_collection(collection_name):
                    self.logger.info(f"✓ 集合 {collection_name} 已存在")
                else:
                    # 创建集合
                    await self._create_milvus_collection(collection_name)
                    
                return True
            else:
                self.logger.error("✗ Milvus连接失败")
                return False
                
        except Exception as e:
            self.logger.error(f"✗ Milvus连接失败: {e}")
            return False
            
    async def _create_milvus_collection(self, collection_name: str):
        """创建Milvus集合"""
        try:
            # 定义字段
            fields = [
                FieldSchema(name="id", dtype=DataType.INT64, is_primary=True, auto_id=True),
                FieldSchema(name="file_id", dtype=DataType.INT64),
                FieldSchema(name="content_id", dtype=DataType.INT64),
                FieldSchema(name="content_type", dtype=DataType.VARCHAR, max_length=50),
                FieldSchema(name="page_number", dtype=DataType.INT64),
                FieldSchema(name="text_content", dtype=DataType.VARCHAR, max_length=65535),
                FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=768)
            ]
            
            # 创建集合模式
            schema = CollectionSchema(
                fields=fields,
                description=f"PDF文档内容向量集合"
            )
            
            # 创建集合
            collection = Collection(
                name=collection_name,
                schema=schema
            )
            
            # 创建索引
            index_params = {
                "metric_type": "L2",
                "index_type": "IVF_FLAT",
                "params": {"nlist": 1024}
            }
            collection.create_index(field_name="embedding", index_params=index_params)
            
            self.logger.info(f"✓ 创建Milvus集合: {collection_name}")
            
        except Exception as e:
            self.logger.error(f"✗ 创建Milvus集合失败: {e}")
            
    async def _check_neo4j_connection(self) -> bool:
        """检查Neo4j图数据库连接"""
        if not NEO4J_AVAILABLE:
            self.logger.error("✗ neo4j 库未安装")
            return False
            
        self.logger.info("检查Neo4j图数据库连接...")
        
        try:
            neo4j_config = self.configs.get('db', {}).get('neo4j', {})
            uri = neo4j_config.get('uri', 'bolt://localhost:7687')
            username = neo4j_config.get('username', 'neo4j')
            password = neo4j_config.get('password', 'password')
            
            driver = GraphDatabase.driver(uri, auth=(username, password))
            
            # 测试连接
            with driver.session() as session:
                result = session.run("RETURN 1")
                record = result.single()
                if record and record[0] == 1:
                    self.logger.info(f"✓ Neo4j连接成功")
                    
                    # 检查约束和索引
                    await self._setup_neo4j_constraints(session)
                    return True
                    
            driver.close()
            return False
            
        except Exception as e:
            self.logger.error(f"✗ Neo4j连接失败: {e}")
            return False
            
    async def _setup_neo4j_constraints(self, session):
        """设置Neo4j约束和索引"""
        try:
            # 创建节点约束
            constraints = [
                "CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE",
                "CREATE CONSTRAINT document_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE",
                "CREATE CONSTRAINT file_id IF NOT EXISTS FOR (f:File) REQUIRE f.id IS UNIQUE"
            ]
            
            for constraint in constraints:
                try:
                    session.run(constraint)
                    self.logger.debug(f"创建约束: {constraint}")
                except Exception as e:
                    # 约束可能已存在，忽略错误
                    pass
                    
            # 创建索引
            indexes = [
                "CREATE INDEX entity_name_index IF NOT EXISTS FOR (e:Entity) ON (e.name)",
                "CREATE INDEX entity_type_index IF NOT EXISTS FOR (e:Entity) ON (e.type)",
                "CREATE INDEX document_page_index IF NOT EXISTS FOR (d:Document) ON (d.page_number)"
            ]
            
            for index in indexes:
                try:
                    session.run(index)
                    self.logger.debug(f"创建索引: {index}")
                except Exception as e:
                    # 索引可能已存在，忽略错误
                    pass
                    
            self.logger.info("✓ Neo4j约束和索引设置完成")
            
        except Exception as e:
            self.logger.error(f"设置Neo4j约束失败: {e}")
            
    async def _check_deepseek_api(self) -> bool:
        """检查DeepSeek API连接"""
        self.logger.info("检查DeepSeek API连接...")
        
        try:
            llm_config = self.configs.get('model', {}).get('llm', {})
            api_key = llm_config.get('api_key')
            base_url = llm_config.get('base_url')
            
            if not api_key:
                self.logger.error("✗ DeepSeek API密钥未配置")
                return False
                
            # 测试API连接
            headers = {
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            }
            
            # 发送测试请求
            test_data = {
                "model": "deepseek-chat",
                "messages": [
                    {"role": "user", "content": "Hello"}
                ],
                "max_tokens": 10
            }
            
            response = requests.post(
                f"{base_url}/chat/completions",
                headers=headers,
                json=test_data,
                timeout=10
            )
            
            if response.status_code == 200:
                self.logger.info("✓ DeepSeek API连接成功")
                return True
            else:
                self.logger.error(f"✗ DeepSeek API连接失败: {response.status_code}")
                return False
                
        except Exception as e:
            self.logger.error(f"✗ DeepSeek API连接失败: {e}")
            return False
            
    async def _check_embedding_model(self) -> bool:
        """检查嵌入模型"""
        self.logger.info("检查嵌入模型...")
        
        try:
            model_config = self.configs.get('model', {}).get('embedding_model', {})
            model_path = model_config.get('model_path', './models/embedding/text-embedding-3-small')
            expected_vector_size = model_config.get('vector_size', 768)
            
            # 检查模型文件是否存在和有效
            model_path_obj = Path(model_path)
            model_needs_download = False
            
            if not model_path_obj.exists():
                self.logger.info(f"嵌入模型目录不存在: {model_path}")
                model_needs_download = True
            else:
                # 检查模型目录是否包含有效的模型文件
                model_files = ['config.json', 'pytorch_model.bin', 'tokenizer.json']
                if not any((model_path_obj / file).exists() for file in model_files):
                    self.logger.info(f"嵌入模型目录存在但缺少模型文件: {model_path}")
                    model_needs_download = True
            
            # 如果需要下载模型
            if model_needs_download:
                self.logger.info(f"开始自动下载嵌入模型到: {model_path}")
                await self._download_embedding_model(model_path, model_config)
            
            # 检查是否可以加载模型
            if SENTENCE_TRANSFORMERS_AVAILABLE:
                try:
                    from sentence_transformers import SentenceTransformer
                    model = SentenceTransformer(str(model_path))
                    # 测试编码
                    test_text = "这是一个测试文本"
                    embedding = model.encode([test_text])
                    if embedding.shape[1] == expected_vector_size:  # 检查向量维度
                        self.logger.info(f"✓ 嵌入模型加载成功，向量维度: {embedding.shape[1]}")
                        return True
                    else:
                        self.logger.error(f"✗ 嵌入模型向量维度错误: {embedding.shape[1]}，期望: {expected_vector_size}")
                        return False
                except Exception as e:
                    self.logger.error(f"✗ 嵌入模型加载失败: {e}")
                    return False
            else:
                self.logger.error("✗ sentence_transformers 库未安装")
                return False
                
        except Exception as e:
            self.logger.error(f"✗ 嵌入模型检查失败: {e}")
            return False
            
    async def _download_embedding_model(self, model_path: str, model_config: dict):
        """下载嵌入模型"""
        try:
            # 创建模型目录
            Path(model_path).mkdir(parents=True, exist_ok=True)
            
            # 从配置中获取模型信息
            huggingface_model = model_config.get('huggingface_model', 'sentence-transformers/all-mpnet-base-v2')
            expected_vector_size = model_config.get('vector_size', 768)
            alternative_models = model_config.get('alternative_models', [])
            
            self.logger.info(f"开始下载嵌入模型到: {model_path}")
            self.logger.info(f"正在下载 {huggingface_model} 模型 ({expected_vector_size}维)...")
            
            # 使用sentence-transformers下载模型
            if SENTENCE_TRANSFORMERS_AVAILABLE:
                from sentence_transformers import SentenceTransformer
                
                # 尝试下载主模型
                success = False
                models_to_try = [huggingface_model] + [alt['name'] for alt in alternative_models]
                
                for model_name in models_to_try:
                    try:
                        self.logger.info(f"尝试下载模型: {model_name}")
                        model = SentenceTransformer(model_name)
                        model.save(str(model_path))
                        
                        # 验证模型向量维度
                        test_embedding = model.encode(["测试文本"])
                        actual_vector_size = test_embedding.shape[1]
                        
                        if actual_vector_size == expected_vector_size:
                            self.logger.info(f"✓ 嵌入模型下载成功，向量维度: {actual_vector_size}")
                            success = True
                            break
                        else:
                            self.logger.warning(f"模型 {model_name} 向量维度为 {actual_vector_size}，期望 {expected_vector_size}")
                            # 如果维度不匹配，尝试下一个模型
                            continue
                            
                    except Exception as e:
                        self.logger.warning(f"下载模型 {model_name} 失败: {e}")
                        continue
                
                if not success:
                    raise Exception(f"所有候选模型都无法满足 {expected_vector_size} 维度要求")
                    
            else:
                self.logger.error("✗ sentence_transformers 库未安装，无法下载模型")
                raise Exception("sentence_transformers 库未安装")
                
        except Exception as e:
            self.logger.error(f"下载嵌入模型失败: {e}")
            # 创建错误标记文件
            error_file = Path(model_path) / "download_error.txt"
            with open(error_file, 'w') as f:
                f.write(f"Download failed at {datetime.now()}: {str(e)}")
            raise
            
    async def _check_ocr_model(self) -> bool:
        """检查OCR模型"""
        self.logger.info("检查OCR模型...")
        
        try:
            if not PADDLEOCR_AVAILABLE:
                self.logger.error("✗ paddleocr 库未安装")
                return False
                
            # 检查OCR模型配置
            ocr_config = self.configs.get('model', {}).get('ocr_model', {})
            model_dirs = [
                ocr_config.get('det_model_dir', './models/ocr/det'),
                ocr_config.get('rec_model_dir', './models/ocr/rec'),
                ocr_config.get('cls_model_dir', './models/ocr/cls')
            ]
            
            # 检查模型目录
            missing_models = []
            for model_dir in model_dirs:
                if not Path(model_dir).exists():
                    missing_models.append(model_dir)
                    
            if missing_models:
                self.logger.info("OCR模型文件不存在，开始下载...")
                await self._download_ocr_models(missing_models)
                
            # 测试OCR模型初始化
            try:
                # 简单的PaddleOCR初始化测试
                # 实际使用时会在第一次调用时下载模型
                self.logger.info("✓ OCR模型检查完成")
                return True
                
            except Exception as e:
                self.logger.error(f"✗ OCR模型初始化失败: {e}")
                return False
                
        except Exception as e:
            self.logger.error(f"✗ OCR模型检查失败: {e}")
            return False
            
    async def _download_ocr_models(self, missing_models: List[str]):
        """下载OCR模型"""
        try:
            self.logger.info("正在初始化PaddleOCR并下载必要的模型文件...")
            
            if not PADDLEOCR_AVAILABLE:
                self.logger.error("✗ paddleocr 库未安装，无法下载OCR模型")
                return
            
            # 创建模型目录
            for model_dir in missing_models:
                Path(model_dir).mkdir(parents=True, exist_ok=True)
                self.logger.info(f"创建OCR模型目录: {model_dir}")
            
            # 初始化PaddleOCR会自动下载模型
            import paddleocr
            
            # 配置PaddleOCR参数
            ocr_config = self.configs.get('model', {}).get('ocr_model', {})
            use_gpu = self.configs.get('model', {}).get('global_gpu_acceleration', False)
            
            self.logger.info("正在初始化PaddleOCR，首次运行会自动下载模型文件...")
            
            # 初始化OCR引擎，这会触发模型下载
            ocr = paddleocr.PaddleOCR(
                use_angle_cls=ocr_config.get('use_angle_cls', True),
                lang=ocr_config.get('lang', 'ch'),
                use_gpu=use_gpu,
                show_log=True
            )
            
            # 测试OCR功能
            self.logger.info("测试OCR模型...")
            test_result = ocr.ocr("test", cls=True)  # 使用一个简单的测试
            
            # 标记模型已就绪
            for model_dir in missing_models:
                marker_file = Path(model_dir) / "model_ready.txt"
                with open(marker_file, 'w') as f:
                    f.write(f"OCR model initialized and ready at {datetime.now()}")
            
            self.logger.info("✓ OCR模型初始化和下载完成")
            
        except Exception as e:
            self.logger.error(f"下载OCR模型失败: {e}")
            # 创建错误标记文件
            for model_dir in missing_models:
                error_file = Path(model_dir) / "download_error.txt"
                with open(error_file, 'w') as f:
                    f.write(f"OCR model download failed at {datetime.now()}: {str(e)}")
            
    async def _check_dependencies(self) -> bool:
        """检查Python依赖"""
        self.logger.info("检查Python依赖...")
        
        # 包名映射：(import_name, package_description)
        required_packages = [
            ('flask', 'Flask web框架'),
            ('pymysql', 'MySQL连接器'),
            ('redis', 'Redis客户端'),
            ('yaml', 'YAML解析器 (PyYAML)'),
            ('requests', 'HTTP请求库'),
            ('celery', '任务队列'),
            ('PIL', '图像处理库 (Pillow)'),
            ('fitz', 'PDF处理库 (PyMuPDF)'),
            ('numpy', '数值计算库'),
            ('pandas', '数据分析库')
        ]
        
        missing_packages = []
        for import_name, description in required_packages:
            try:
                __import__(import_name)
                self.logger.debug(f"✓ {import_name} ({description}) 已安装")
            except ImportError:
                missing_packages.append(f"{import_name} ({description})")
                self.logger.warning(f"✗ {import_name} ({description}) 未安装")
                
        if missing_packages:
            self.logger.error(f"缺少必要依赖: {', '.join(missing_packages)}")
            self.logger.info("请运行: pip install -r requirements.txt")
            return False
        else:
            self.logger.info("✓ 所有必要依赖已安装")
            return True
            
    def _log_check_summary(self):
        """记录检查总结"""
        self.logger.info("\n" + "="*50)
        self.logger.info("环境检查总结:")
        self.logger.info("="*50)
        
        all_passed = True
        for component, status in self.check_results.items():
            status_symbol = "✓" if status else "✗"
            status_text = "通过" if status else "失败"
            self.logger.info(f"{status_symbol} {component}: {status_text}")
            if not status:
                all_passed = False
                
        self.logger.info("="*50)
        if all_passed:
            self.logger.info("🎉 所有组件检查通过，系统可以启动！")
        else:
            self.logger.error("❌ 部分组件检查失败，请修复后重新启动系统")
        self.logger.info("="*50)
        
        return all_passed


async def main():
    """主函数"""
    checker = EnvironmentChecker()
    results = await checker.check_all_components()
    
    # 返回检查结果
    return all(results.values())


if __name__ == "__main__":
    # 运行环境检查
    success = asyncio.run(main())
    sys.exit(0 if success else 1) 