#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
智能检索服务模块
负责处理PDF文档的智能检索功能，实现GraphRAG系统
"""

import os
import json
import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Generator
import uuid
import time

# 数据库相关
import pymysql
from pymysql.cursors import DictCursor

# 向量数据库相关
try:
    from pymilvus import connections, Collection, utility
    MILVUS_AVAILABLE = True
except ImportError:
    MILVUS_AVAILABLE = False

# 图数据库相关
try:
    from neo4j import GraphDatabase
    NEO4J_AVAILABLE = True
except ImportError:
    NEO4J_AVAILABLE = False

# 嵌入模型相关
try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    SENTENCE_TRANSFORMERS_AVAILABLE = False

# HTTP请求
import requests

# 配置加载
import yaml

# 文本处理
import re
import jieba
import numpy as np
from collections import defaultdict


class SearchService:
    """智能检索服务类"""
    
    def __init__(self, config_path: str = "./config"):
        self.config_path = Path(config_path)
        self.logger = self._setup_logger()
        self.configs = self._load_configs()
        
        # 初始化各种组件
        self.embedding_model = None
        self.milvus_collection = None
        self.neo4j_driver = None
        self.conversation_sessions = {}  # 存储对话会话
        
        self._init_components()
        
    def _setup_logger(self) -> logging.Logger:
        """设置日志器"""
        logger = logging.getLogger("search_service")
        logger.setLevel(logging.INFO)
        
        if not logger.handlers:
            # 创建文件处理器
            log_dir = Path("./logs")
            log_dir.mkdir(exist_ok=True)
            file_handler = logging.FileHandler(log_dir / "search_service.log", encoding='utf-8')
            file_handler.setLevel(logging.INFO)
            
            # 设置格式
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
            
        return logger
        
    def _load_configs(self) -> Dict[str, Any]:
        """加载配置文件"""
        configs = {}
        config_files = ['config.yaml', 'db.yaml', 'model.yaml', 'prompt.yaml']
        
        for config_file in config_files:
            config_path = self.config_path / config_file
            if config_path.exists():
                with open(config_path, 'r', encoding='utf-8') as f:
                    configs[config_file.split('.')[0]] = yaml.safe_load(f)
                    
        return configs
        
    def _init_components(self):
        """初始化各种组件"""
        try:
            # 初始化嵌入模型
            self._init_embedding_model()
            
            # 初始化Milvus连接
            self._init_milvus_connection()
            
            # 初始化Neo4j连接
            self._init_neo4j_connection()
            
        except Exception as e:
            self.logger.error(f"组件初始化失败: {e}")
            
    def _init_embedding_model(self):
        """初始化嵌入模型"""
        if not SENTENCE_TRANSFORMERS_AVAILABLE:
            self.logger.warning("sentence_transformers不可用，向量检索功能将受限")
            return
            
        try:
            model_config = self.configs.get('model', {}).get('embedding_model', {})
            model_path = model_config.get('model_path', './models/embedding/text-embedding-3-small')
            
            # 检查模型是否存在
            if Path(model_path).exists():
                self.embedding_model = SentenceTransformer(model_path)
                self.logger.info("嵌入模型初始化成功")
            else:
                self.logger.warning(f"嵌入模型路径不存在: {model_path}")
                
        except Exception as e:
            self.logger.error(f"嵌入模型初始化失败: {e}")
            
    def _init_milvus_connection(self):
        """初始化Milvus连接"""
        if not MILVUS_AVAILABLE:
            self.logger.warning("pymilvus不可用，向量检索功能将受限")
            return
            
        try:
            milvus_config = self.configs.get('db', {}).get('milvus', {})
            host = milvus_config.get('host', '192.168.16.26')
            port = milvus_config.get('port', 19530)
            collection_name = milvus_config.get('collection', 'pdf_doc')
            
            # 连接Milvus
            connections.connect(
                alias="default",
                host=host,
                port=port
            )
            
            # 获取集合
            if utility.has_collection(collection_name):
                self.milvus_collection = Collection(collection_name)
                self.milvus_collection.load()
                self.logger.info(f"Milvus集合连接成功: {collection_name}")
            else:
                self.logger.warning(f"Milvus集合不存在: {collection_name}")
                
        except Exception as e:
            self.logger.error(f"Milvus连接失败: {e}")
            
    def _init_neo4j_connection(self):
        """初始化Neo4j连接"""
        if not NEO4J_AVAILABLE:
            self.logger.warning("neo4j不可用，图检索功能将受限")
            return
            
        try:
            neo4j_config = self.configs.get('db', {}).get('neo4j', {})
            uri = neo4j_config.get('uri', 'bolt://localhost:7687')
            username = neo4j_config.get('username', 'neo4j')
            password = neo4j_config.get('password', 'password')
            
            self.neo4j_driver = GraphDatabase.driver(uri, auth=(username, password))
            
            # 测试连接
            with self.neo4j_driver.session() as session:
                result = session.run("RETURN 1")
                if result.single():
                    self.logger.info("Neo4j连接成功")
                    
        except Exception as e:
            self.logger.error(f"Neo4j连接失败: {e}")
            
    def get_db_connection(self):
        """获取数据库连接"""
        try:
            db_config = self.configs.get('db', {}).get('mysql', {})
            connection = pymysql.connect(
                host=db_config.get('host', 'localhost'),
                port=db_config.get('port', 3306),
                user=db_config.get('username', 'root'),
                password=db_config.get('password', ''),
                database=db_config.get('database', 'pdf_ai_doc'),
                charset=db_config.get('charset', 'utf8mb4'),
                cursorclass=DictCursor,
                autocommit=True
            )
            return connection
        except Exception as e:
            self.logger.error(f"数据库连接失败: {e}")
            raise
            
    async def create_chat_session(self, user_id: int, session_name: str = None) -> Dict[str, Any]:
        """创建对话会话"""
        try:
            if not session_name:
                session_name = f"对话会话_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = """
                INSERT INTO chat_sessions (user_id, session_name, session_status)
                VALUES (%s, %s, 'active')
                """
                cursor.execute(sql, (user_id, session_name))
                session_id = cursor.lastrowid
                
                # 获取创建的会话信息
                cursor.execute("SELECT * FROM chat_sessions WHERE id = %s", (session_id,))
                session_info = cursor.fetchone()
                
            connection.close()
            
            # 初始化会话上下文
            self.conversation_sessions[session_id] = {
                'user_id': user_id,
                'session_name': session_name,
                'context': [],
                'related_files': set(),
                'created_at': datetime.now()
            }
            
            return {
                'success': True,
                'data': {
                    'session_id': session_id,
                    'session_name': session_name,
                    'created_at': session_info['created_at'].isoformat() if session_info['created_at'] else None
                }
            }
            
        except Exception as e:
            self.logger.error(f"创建对话会话失败: {e}")
            return {
                'success': False,
                'message': f'创建对话会话失败: {str(e)}'
            }
            
    async def search_and_answer(self, session_id: int, user_id: int, query: str, 
                              file_ids: List[int] = None) -> Dict[str, Any]:
        """智能检索并回答问题"""
        try:
            start_time = time.time()
            
            # 验证会话权限
            session_valid = await self._validate_session(session_id, user_id)
            if not session_valid:
                return {
                    'success': False,
                    'message': '会话不存在或无权限访问'
                }
                
            # 记录用户消息
            await self._save_chat_message(session_id, 'user', query, file_ids)
            
            # 优化查询词
            optimized_queries = await self._optimize_search_query(query)
            
            # 多模态检索
            search_results = await self._multi_modal_search(query, optimized_queries, file_ids, user_id)
            
            # GraphRAG增强
            enhanced_results = await self._graph_rag_enhancement(query, search_results, file_ids)
            
            # 生成回答
            answer = await self._generate_answer(query, enhanced_results, session_id)
            
            # 记录响应时间
            response_time = time.time() - start_time
            
            # 保存助手回答
            await self._save_chat_message(
                session_id, 'assistant', answer['content'], 
                file_ids, search_results, answer.get('sources', []), response_time
            )
            
            # 记录搜索历史
            await self._save_search_history(user_id, query, 'semantic', file_ids, len(search_results), response_time)
            
            return {
                'success': True,
                'data': {
                    'answer': answer['content'],
                    'sources': answer.get('sources', []),
                    'search_results_count': len(search_results),
                    'response_time': response_time,
                    'session_id': session_id
                }
            }
            
        except Exception as e:
            self.logger.error(f"智能检索失败: {e}")
            return {
                'success': False,
                'message': f'智能检索失败: {str(e)}'
            }
            
    async def _validate_session(self, session_id: int, user_id: int) -> bool:
        """验证会话权限"""
        try:
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = """
                SELECT user_id, session_status FROM chat_sessions 
                WHERE id = %s
                """
                cursor.execute(sql, (session_id,))
                result = cursor.fetchone()
                
            connection.close()
            
            if result and result['user_id'] == user_id and result['session_status'] == 'active':
                return True
            return False
            
        except Exception as e:
            self.logger.error(f"验证会话权限失败: {e}")
            return False
            
    async def _optimize_search_query(self, query: str) -> List[str]:
        """优化搜索查询词"""
        try:
            # 使用LLM优化查询
            prompt_config = self.configs.get('prompt', {}).get('search_prompts', {})
            optimization_prompt = prompt_config.get('semantic_search_optimization', '')
            
            if optimization_prompt:
                optimized_response = await self._call_llm(
                    optimization_prompt.format(query=query)
                )
                
                # 解析优化后的查询词
                if optimized_response:
                    # 简单解析，实际可以更复杂
                    optimized_queries = [q.strip() for q in optimized_response.split('\n') if q.strip()]
                    return optimized_queries[:5]  # 最多5个优化查询
                    
            # 如果LLM不可用，使用简单的查询扩展
            return self._simple_query_expansion(query)
            
        except Exception as e:
            self.logger.error(f"查询优化失败: {e}")
            return [query]
            
    def _simple_query_expansion(self, query: str) -> List[str]:
        """简单的查询扩展"""
        expanded_queries = [query]
        
        # 分词并添加关键词组合
        words = list(jieba.cut(query))
        if len(words) > 1:
            # 添加单个关键词
            expanded_queries.extend([word for word in words if len(word) > 1])
            
            # 添加两两组合
            for i in range(len(words) - 1):
                if len(words[i]) > 1 and len(words[i + 1]) > 1:
                    expanded_queries.append(words[i] + words[i + 1])
                    
        return list(set(expanded_queries))[:5]
        
    async def _multi_modal_search(self, query: str, optimized_queries: List[str], 
                                file_ids: List[int], user_id: int) -> List[Dict[str, Any]]:
        """多模态检索"""
        all_results = []
        
        # 1. 向量检索
        vector_results = await self._vector_search(query, file_ids, user_id)
        all_results.extend(vector_results)
        
        # 2. 关键词检索
        keyword_results = await self._keyword_search(optimized_queries, file_ids, user_id)
        all_results.extend(keyword_results)
        
        # 3. 图检索
        graph_results = await self._graph_search(query, file_ids, user_id)
        all_results.extend(graph_results)
        
        # 去重和排序
        unique_results = self._deduplicate_and_rank_results(all_results, query)
        
        return unique_results[:20]  # 返回前20个结果
        
    async def _vector_search(self, query: str, file_ids: List[int], user_id: int) -> List[Dict[str, Any]]:
        """向量检索"""
        if not self.embedding_model or not self.milvus_collection:
            return []
            
        try:
            # 生成查询向量
            query_vector = self.embedding_model.encode([query])[0].tolist()
            
            # 构建过滤表达式
            expr = f"file_id in {file_ids}" if file_ids else ""
            
            # 执行向量检索
            search_params = {
                "metric_type": "L2",
                "params": {"nprobe": 10}
            }
            
            results = self.milvus_collection.search(
                data=[query_vector],
                anns_field="embedding",
                param=search_params,
                limit=10,
                expr=expr
            )
            
            # 处理结果
            vector_results = []
            for hits in results:
                for hit in hits:
                    # 获取详细内容信息
                    content_info = await self._get_content_info(hit.entity.get('content_id'))
                    if content_info:
                        vector_results.append({
                            'content_id': hit.entity.get('content_id'),
                            'file_id': hit.entity.get('file_id'),
                            'content_type': hit.entity.get('content_type'),
                            'page_number': hit.entity.get('page_number'),
                            'text_content': hit.entity.get('text_content'),
                            'score': hit.score,
                            'search_type': 'vector',
                            'content_info': content_info
                        })
                        
            return vector_results
            
        except Exception as e:
            self.logger.error(f"向量检索失败: {e}")
            return []
            
    async def _keyword_search(self, queries: List[str], file_ids: List[int], user_id: int) -> List[Dict[str, Any]]:
        """关键词检索"""
        try:
            keyword_results = []
            
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                for query in queries:
                    # 构建SQL查询
                    sql = """
                    SELECT dc.*, f.original_name, f.user_id
                    FROM document_contents dc
                    JOIN files f ON dc.file_id = f.id
                    WHERE f.user_id = %s
                    AND dc.content_text LIKE %s
                    """
                    params = [user_id, f'%{query}%']
                    
                    if file_ids:
                        sql += " AND dc.file_id IN ({})".format(','.join(['%s'] * len(file_ids)))
                        params.extend(file_ids)
                        
                    sql += " ORDER BY dc.page_number LIMIT 10"
                    
                    cursor.execute(sql, params)
                    results = cursor.fetchall()
                    
                    for result in results:
                        # 计算关键词匹配分数
                        score = self._calculate_keyword_score(query, result['content_text'])
                        
                        keyword_results.append({
                            'content_id': result['id'],
                            'file_id': result['file_id'],
                            'content_type': result['content_type'],
                            'page_number': result['page_number'],
                            'text_content': result['content_text'],
                            'score': score,
                            'search_type': 'keyword',
                            'matched_query': query,
                            'file_name': result['original_name']
                        })
                        
            connection.close()
            return keyword_results
            
        except Exception as e:
            self.logger.error(f"关键词检索失败: {e}")
            return []
            
    def _calculate_keyword_score(self, query: str, content: str) -> float:
        """计算关键词匹配分数"""
        if not content:
            return 0.0
            
        content_lower = content.lower()
        query_lower = query.lower()
        
        # 精确匹配
        exact_matches = content_lower.count(query_lower)
        
        # 部分匹配
        query_words = list(jieba.cut(query_lower))
        partial_matches = sum(1 for word in query_words if word in content_lower)
        
        # 计算分数
        score = exact_matches * 2.0 + partial_matches * 0.5
        
        # 归一化
        max_score = len(content) / 10.0
        return min(score / max_score, 1.0) if max_score > 0 else 0.0
        
    async def _graph_search(self, query: str, file_ids: List[int], user_id: int) -> List[Dict[str, Any]]:
        """图检索"""
        if not self.neo4j_driver:
            return []
            
        try:
            graph_results = []
            
            with self.neo4j_driver.session() as session:
                # 实体检索
                entity_query = """
                MATCH (e:Entity)-[:BELONGS_TO]->(f:File)
                WHERE f.user_id = $user_id
                AND (e.name CONTAINS $query OR e.value CONTAINS $query)
                RETURN e, f
                LIMIT 10
                """
                
                result = session.run(entity_query, user_id=user_id, query=query)
                
                for record in result:
                    entity = record['e']
                    file_node = record['f']
                    
                    graph_results.append({
                        'entity_id': entity.id,
                        'entity_name': entity.get('name'),
                        'entity_type': entity.get('type'),
                        'entity_value': entity.get('value'),
                        'file_id': file_node.get('file_id'),
                        'score': 0.8,  # 图检索固定分数
                        'search_type': 'graph'
                    })
                    
            return graph_results
            
        except Exception as e:
            self.logger.error(f"图检索失败: {e}")
            return []
            
    def _deduplicate_and_rank_results(self, results: List[Dict[str, Any]], query: str) -> List[Dict[str, Any]]:
        """去重和排序结果"""
        # 按content_id去重
        unique_results = {}
        for result in results:
            content_id = result.get('content_id')
            if content_id and content_id not in unique_results:
                unique_results[content_id] = result
            elif content_id and result.get('score', 0) > unique_results[content_id].get('score', 0):
                unique_results[content_id] = result
                
        # 按分数排序
        sorted_results = sorted(unique_results.values(), key=lambda x: x.get('score', 0), reverse=True)
        
        return sorted_results
        
    async def _graph_rag_enhancement(self, query: str, search_results: List[Dict[str, Any]], 
                                   file_ids: List[int]) -> Dict[str, Any]:
        """GraphRAG增强"""
        try:
            # 提取相关实体
            entities = await self._extract_entities_from_results(search_results)
            
            # 扩展实体关系
            expanded_entities = await self._expand_entity_relations(entities, file_ids)
            
            # 构建上下文图
            context_graph = await self._build_context_graph(entities, expanded_entities)
            
            return {
                'search_results': search_results,
                'entities': entities,
                'expanded_entities': expanded_entities,
                'context_graph': context_graph
            }
            
        except Exception as e:
            self.logger.error(f"GraphRAG增强失败: {e}")
            return {
                'search_results': search_results,
                'entities': [],
                'expanded_entities': [],
                'context_graph': {}
            }
            
    async def _extract_entities_from_results(self, search_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """从搜索结果中提取实体"""
        entities = []
        
        try:
            # 获取搜索结果涉及的内容ID
            content_ids = [r['content_id'] for r in search_results if r.get('content_id')]
            
            if content_ids:
                connection = self.get_db_connection()
                with connection.cursor() as cursor:
                    # 查询相关实体
                    sql = """
                    SELECT DISTINCT e.* FROM entities e
                    JOIN document_contents dc ON e.file_id = dc.file_id 
                    AND e.page_number = dc.page_number
                    WHERE dc.id IN ({})
                    """.format(','.join(['%s'] * len(content_ids)))
                    
                    cursor.execute(sql, content_ids)
                    entities = cursor.fetchall()
                    
                connection.close()
                
        except Exception as e:
            self.logger.error(f"提取实体失败: {e}")
            
        return entities
        
    async def _expand_entity_relations(self, entities: List[Dict[str, Any]], 
                                     file_ids: List[int]) -> List[Dict[str, Any]]:
        """扩展实体关系"""
        expanded_entities = []
        
        try:
            entity_ids = [e['id'] for e in entities]
            
            if entity_ids:
                connection = self.get_db_connection()
                with connection.cursor() as cursor:
                    # 查询实体关系
                    sql = """
                    SELECT er.*, 
                           se.entity_name as source_name, se.entity_type as source_type,
                           te.entity_name as target_name, te.entity_type as target_type
                    FROM entity_relations er
                    JOIN entities se ON er.source_entity_id = se.id
                    JOIN entities te ON er.target_entity_id = te.id
                    WHERE (er.source_entity_id IN ({}) OR er.target_entity_id IN ({}))
                    """.format(
                        ','.join(['%s'] * len(entity_ids)),
                        ','.join(['%s'] * len(entity_ids))
                    )
                    
                    cursor.execute(sql, entity_ids + entity_ids)
                    relations = cursor.fetchall()
                    
                    # 获取关联的实体
                    related_entity_ids = set()
                    for relation in relations:
                        related_entity_ids.add(relation['source_entity_id'])
                        related_entity_ids.add(relation['target_entity_id'])
                        
                    if related_entity_ids:
                        sql = """
                        SELECT * FROM entities 
                        WHERE id IN ({})
                        """.format(','.join(['%s'] * len(related_entity_ids)))
                        
                        cursor.execute(sql, list(related_entity_ids))
                        expanded_entities = cursor.fetchall()
                        
                connection.close()
                
        except Exception as e:
            self.logger.error(f"扩展实体关系失败: {e}")
            
        return expanded_entities
        
    async def _build_context_graph(self, entities: List[Dict[str, Any]], 
                                 expanded_entities: List[Dict[str, Any]]) -> Dict[str, Any]:
        """构建上下文图"""
        try:
            # 简化的图结构
            nodes = {}
            edges = []
            
            # 添加节点
            all_entities = entities + expanded_entities
            for entity in all_entities:
                nodes[entity['id']] = {
                    'id': entity['id'],
                    'name': entity['entity_name'],
                    'type': entity['entity_type'],
                    'value': entity.get('entity_value', ''),
                    'file_id': entity['file_id']
                }
                
            # 添加边（这里简化处理）
            # 实际应该查询entity_relations表
            
            return {
                'nodes': list(nodes.values()),
                'edges': edges,
                'node_count': len(nodes),
                'edge_count': len(edges)
            }
            
        except Exception as e:
            self.logger.error(f"构建上下文图失败: {e}")
            return {'nodes': [], 'edges': [], 'node_count': 0, 'edge_count': 0}
            
    async def _generate_answer(self, query: str, enhanced_results: Dict[str, Any], 
                             session_id: int) -> Dict[str, Any]:
        """生成回答"""
        try:
            # 获取对话历史
            conversation_history = await self._get_conversation_history(session_id)
            
            # 构建提示词
            prompt_config = self.configs.get('prompt', {}).get('search_prompts', {})
            
            if conversation_history:
                # 多轮对话
                prompt_template = prompt_config.get('multi_turn_context', '')
                prompt = prompt_template.format(
                    conversation_history=self._format_conversation_history(conversation_history),
                    current_question=query,
                    search_results=self._format_search_results(enhanced_results['search_results'])
                )
            else:
                # 单轮问答
                prompt_template = prompt_config.get('qa_search', '')
                prompt = prompt_template.format(
                    question=query,
                    search_results=self._format_search_results(enhanced_results['search_results'])
                )
                
            # 调用LLM生成回答
            answer_content = await self._call_llm(prompt)
            
            if not answer_content:
                # 如果LLM不可用，生成简单回答
                answer_content = self._generate_simple_answer(query, enhanced_results['search_results'])
                
            # 提取信息来源
            sources = self._extract_sources(enhanced_results['search_results'])
            
            return {
                'content': answer_content,
                'sources': sources,
                'context_graph': enhanced_results.get('context_graph', {}),
                'entities_count': len(enhanced_results.get('entities', []))
            }
            
        except Exception as e:
            self.logger.error(f"生成回答失败: {e}")
            return {
                'content': '抱歉，我无法回答您的问题，请稍后重试。',
                'sources': [],
                'context_graph': {},
                'entities_count': 0
            }
            
    async def _call_llm(self, prompt: str) -> str:
        """调用大语言模型"""
        try:
            llm_config = self.configs.get('model', {}).get('llm', {})
            api_key = llm_config.get('api_key')
            base_url = llm_config.get('base_url')
            model_name = llm_config.get('model_name', 'deepseek-chat')
            
            if not api_key or not base_url:
                return ""
                
            headers = {
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            }
            
            data = {
                "model": model_name,
                "messages": [
                    {"role": "system", "content": self.configs.get('prompt', {}).get('system_prompts', {}).get('search_assistant', '')},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": llm_config.get('max_tokens', 4096),
                "temperature": llm_config.get('temperature', 0.7),
                "stream": False
            }
            
            response = requests.post(
                f"{base_url}/chat/completions",
                headers=headers,
                json=data,
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                return result['choices'][0]['message']['content']
            else:
                self.logger.error(f"LLM调用失败: {response.status_code}")
                return ""
                
        except Exception as e:
            self.logger.error(f"调用LLM失败: {e}")
            return ""
            
    def _generate_simple_answer(self, query: str, search_results: List[Dict[str, Any]]) -> str:
        """生成简单回答（当LLM不可用时）"""
        if not search_results:
            return "很抱歉，我没有找到相关信息来回答您的问题。"
            
        # 简单拼接搜索结果
        answer_parts = ["根据文档内容，我找到以下相关信息：\n"]
        
        for i, result in enumerate(search_results[:3]):  # 只取前3个结果
            content = result.get('text_content', '')
            if content:
                # 截取前200字符
                summary = content[:200] + "..." if len(content) > 200 else content
                answer_parts.append(f"{i+1}. {summary}")
                
        answer_parts.append("\n以上信息来源于您上传的PDF文档。")
        
        return "\n".join(answer_parts)
        
    def _format_search_results(self, search_results: List[Dict[str, Any]]) -> str:
        """格式化搜索结果"""
        if not search_results:
            return "未找到相关内容。"
            
        formatted_results = []
        for i, result in enumerate(search_results[:5]):  # 只格式化前5个结果
            content = result.get('text_content', '')
            page_num = result.get('page_number', 0)
            file_name = result.get('file_name', '未知文档')
            
            if content:
                formatted_results.append(
                    f"[结果{i+1}] 来源：{file_name} 第{page_num}页\n内容：{content[:300]}{'...' if len(content) > 300 else ''}\n"
                )
                
        return "\n".join(formatted_results)
        
    def _extract_sources(self, search_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """提取信息来源"""
        sources = []
        file_pages = defaultdict(set)
        
        for result in search_results:
            file_id = result.get('file_id')
            page_number = result.get('page_number')
            if file_id and page_number:
                file_pages[file_id].add(page_number)
                
        for file_id, pages in file_pages.items():
            sources.append({
                'file_id': file_id,
                'file_name': result.get('file_name', f'文档{file_id}'),
                'pages': sorted(list(pages)),
                'page_count': len(pages)
            })
            
        return sources
        
    async def _get_conversation_history(self, session_id: int, limit: int = 5) -> List[Dict[str, Any]]:
        """获取对话历史"""
        try:
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = """
                SELECT message_type, message_content, created_at
                FROM chat_messages 
                WHERE session_id = %s 
                ORDER BY created_at DESC 
                LIMIT %s
                """
                cursor.execute(sql, (session_id, limit * 2))  # 获取更多消息，然后过滤
                messages = cursor.fetchall()
                
            connection.close()
            
            # 反转顺序，使历史按时间正序
            return list(reversed(messages))
            
        except Exception as e:
            self.logger.error(f"获取对话历史失败: {e}")
            return []
            
    def _format_conversation_history(self, history: List[Dict[str, Any]]) -> str:
        """格式化对话历史"""
        formatted_history = []
        for msg in history:
            role = "用户" if msg['message_type'] == 'user' else "助手"
            content = msg['message_content']
            formatted_history.append(f"{role}: {content}")
            
        return "\n".join(formatted_history)
        
    async def _save_chat_message(self, session_id: int, message_type: str, content: str,
                                related_file_ids: List[int] = None, search_results: List = None,
                                response_sources: List = None, processing_time: float = None):
        """保存聊天消息"""
        try:
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = """
                INSERT INTO chat_messages 
                (session_id, message_type, message_content, related_file_ids, 
                 search_results, response_sources, processing_time)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """
                cursor.execute(sql, (
                    session_id, message_type, content,
                    json.dumps(related_file_ids) if related_file_ids else None,
                    json.dumps(search_results) if search_results else None,
                    json.dumps(response_sources) if response_sources else None,
                    processing_time
                ))
                
            connection.close()
            
        except Exception as e:
            self.logger.error(f"保存聊天消息失败: {e}")
            
    async def _save_search_history(self, user_id: int, query: str, search_type: str,
                                 file_ids: List[int], result_count: int, response_time: float):
        """保存搜索历史"""
        try:
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = """
                INSERT INTO search_history 
                (user_id, search_query, search_type, file_ids, result_count, response_time)
                VALUES (%s, %s, %s, %s, %s, %s)
                """
                cursor.execute(sql, (
                    user_id, query, search_type,
                    json.dumps(file_ids) if file_ids else None,
                    result_count, response_time
                ))
                
            connection.close()
            
        except Exception as e:
            self.logger.error(f"保存搜索历史失败: {e}")
            
    async def _get_content_info(self, content_id: int) -> Optional[Dict[str, Any]]:
        """获取内容详细信息"""
        try:
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = """
                SELECT dc.*, f.original_name 
                FROM document_contents dc
                JOIN files f ON dc.file_id = f.id
                WHERE dc.id = %s
                """
                cursor.execute(sql, (content_id,))
                result = cursor.fetchone()
                
            connection.close()
            return result
            
        except Exception as e:
            self.logger.error(f"获取内容信息失败: {e}")
            return None
            
    async def get_chat_history(self, session_id: int, user_id: int, page: int = 1, 
                             page_size: int = 20) -> Dict[str, Any]:
        """获取聊天历史"""
        try:
            # 验证会话权限
            session_valid = await self._validate_session(session_id, user_id)
            if not session_valid:
                return {
                    'success': False,
                    'message': '会话不存在或无权限访问'
                }
                
            offset = (page - 1) * page_size
            
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                # 获取总数
                count_sql = "SELECT COUNT(*) as total FROM chat_messages WHERE session_id = %s"
                cursor.execute(count_sql, (session_id,))
                total = cursor.fetchone()['total']
                
                # 获取消息列表
                list_sql = """
                SELECT message_type, message_content, response_sources, 
                       processing_time, created_at
                FROM chat_messages 
                WHERE session_id = %s 
                ORDER BY created_at ASC 
                LIMIT %s OFFSET %s
                """
                cursor.execute(list_sql, (session_id, page_size, offset))
                messages = cursor.fetchall()
                
            connection.close()
            
            return {
                'success': True,
                'data': {
                    'messages': messages,
                    'pagination': {
                        'total': total,
                        'page': page,
                        'page_size': page_size,
                        'total_pages': (total + page_size - 1) // page_size
                    }
                }
            }
            
        except Exception as e:
            self.logger.error(f"获取聊天历史失败: {e}")
            return {
                'success': False,
                'message': f'获取聊天历史失败: {str(e)}'
            }
            
    async def get_user_sessions(self, user_id: int) -> Dict[str, Any]:
        """获取用户的会话列表"""
        try:
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = """
                SELECT id, session_name, session_status, created_at, updated_at
                FROM chat_sessions 
                WHERE user_id = %s AND session_status = 'active'
                ORDER BY updated_at DESC
                """
                cursor.execute(sql, (user_id,))
                sessions = cursor.fetchall()
                
            connection.close()
            
            return {
                'success': True,
                'data': {
                    'sessions': sessions,
                    'count': len(sessions)
                }
            }
            
        except Exception as e:
            self.logger.error(f"获取用户会话列表失败: {e}")
            return {
                'success': False,
                'message': f'获取用户会话列表失败: {str(e)}'
            } 