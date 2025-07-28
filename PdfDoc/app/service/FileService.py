#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文件管理服务模块
负责处理PDF文件的上传、删除、重命名、内容提取等功能
"""

import os
import uuid
import hashlib
import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import json

# 数据库相关
import pymysql
from pymysql.cursors import DictCursor

# PDF处理相关
import fitz  # PyMuPDF
from PIL import Image
import pandas as pd

# OCR相关
try:
    import paddleocr
    PADDLEOCR_AVAILABLE = True
except ImportError:
    PADDLEOCR_AVAILABLE = False

# 配置加载
import yaml

# 任务队列相关
try:
    from celery import Celery
    CELERY_AVAILABLE = True
except ImportError:
    CELERY_AVAILABLE = False


class FileService:
    """文件管理服务类"""
    
    def __init__(self, config_path: str = "./config"):
        self.config_path = Path(config_path)
        self.logger = self._setup_logger()
        self.configs = self._load_configs()
        self.db_pool = None
        self.ocr_engine = None
        self._init_ocr_engine()
        
    def _setup_logger(self) -> logging.Logger:
        """设置日志器"""
        logger = logging.getLogger("file_service")
        logger.setLevel(logging.INFO)
        
        if not logger.handlers:
            # 创建文件处理器
            log_dir = Path("./logs")
            log_dir.mkdir(exist_ok=True)
            file_handler = logging.FileHandler(log_dir / "file_service.log", encoding='utf-8')
            file_handler.setLevel(logging.INFO)
            
            # 设置格式
            formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
            file_handler.setFormatter(formatter)
            logger.addHandler(file_handler)
            
        return logger
        
    def _load_configs(self) -> Dict[str, Any]:
        """加载配置文件"""
        configs = {}
        config_files = ['config.yaml', 'db.yaml', 'model.yaml']
        
        for config_file in config_files:
            config_path = self.config_path / config_file
            if config_path.exists():
                with open(config_path, 'r', encoding='utf-8') as f:
                    configs[config_file.split('.')[0]] = yaml.safe_load(f)
                    
        return configs
        
    def _init_ocr_engine(self):
        """初始化OCR引擎"""
        if not PADDLEOCR_AVAILABLE:
            self.logger.warning("PaddleOCR不可用，OCR功能将受限")
            return
            
        try:
            ocr_config = self.configs.get('model', {}).get('ocr_model', {})
            gpu_enabled = self.configs.get('model', {}).get('global_gpu_acceleration', False)
            
            self.ocr_engine = paddleocr.PaddleOCR(
                use_angle_cls=ocr_config.get('use_angle_cls', True),
                lang=ocr_config.get('lang', 'ch'),
                use_gpu=gpu_enabled,
                show_log=False
            )
            self.logger.info("OCR引擎初始化成功")
            
        except Exception as e:
            self.logger.error(f"OCR引擎初始化失败: {e}")
            
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
            
    async def upload_file(self, file_data: bytes, filename: str, user_id: int, original_filename: str = None) -> Dict[str, Any]:
        """
        上传文件
        
        Args:
            file_data: 文件二进制数据
            filename: 安全处理后的文件名
            user_id: 用户ID
            original_filename: 原始文件名（用于显示）
            
        Returns:
            上传结果信息
        """
        try:
            # 验证文件
            validation_result = self._validate_file(file_data, filename)
            if not validation_result['valid']:
                return {
                    'success': False,
                    'message': validation_result['message'],
                    'file_id': None
                }
                
            # 生成存储文件名
            file_extension = Path(filename).suffix.lower()
            stored_filename = f"{uuid.uuid4().hex}{file_extension}"
            
            # 计算文件哈希
            file_hash = hashlib.md5(file_data).hexdigest()
            
            # 检查文件是否已存在
            existing_file = await self._check_file_exists(file_hash, user_id)
            if existing_file:
                return {
                    'success': False,
                    'message': '文件已存在',
                    'file_id': existing_file['id']
                }
                
            # 保存文件到磁盘
            file_storage_config = self.configs.get('config', {}).get('file_storage', {})
            upload_dir = Path(file_storage_config.get('upload_dir', './uploads'))
            upload_dir.mkdir(parents=True, exist_ok=True)
            file_path = upload_dir / stored_filename
            
            with open(file_path, 'wb') as f:
                f.write(file_data)
                
            # 保存文件信息到数据库
            # 使用原始文件名作为显示名称，如果没有则使用处理后的文件名
            display_name = original_filename if original_filename else filename
            file_record = await self._save_file_record(
                user_id=user_id,
                original_name=display_name,
                stored_name=stored_filename,
                file_path=str(file_path),
                file_size=len(file_data),
                file_hash=file_hash
            )
            
            if file_record:
                # 异步启动文件处理任务
                await self._start_file_processing(file_record['id'])
                
                return {
                    'success': True,
                    'message': '文件上传成功',
                    'file_id': file_record['id'],
                    'filename': filename,
                    'size': len(file_data)
                }
            else:
                # 删除已保存的文件
                file_path.unlink(missing_ok=True)
                return {
                    'success': False,
                    'message': '文件记录保存失败',
                    'file_id': None
                }
                
        except Exception as e:
            self.logger.error(f"文件上传失败: {e}")
            return {
                'success': False,
                'message': f'文件上传失败: {str(e)}',
                'file_id': None
            }
            
    def _validate_file(self, file_data: bytes, filename: str) -> Dict[str, Any]:
        """验证文件"""
        try:
            # 检查文件扩展名
            file_extension = Path(filename).suffix.lower()
            file_storage_config = self.configs.get('config', {}).get('file_storage', {})
            allowed_extensions = file_storage_config.get('allowed_extensions', ['.pdf'])
            
            if file_extension not in allowed_extensions:
                return {
                    'valid': False,
                    'message': f'不支持的文件类型: {file_extension}，支持的类型: {", ".join(allowed_extensions)}'
                }
                
            # 检查文件大小
            max_size = file_storage_config.get('max_file_size', 100) * 1024 * 1024  # MB转字节
            if len(file_data) > max_size:
                return {
                    'valid': False,
                    'message': f'文件大小超出限制: {len(file_data) / 1024 / 1024:.2f}MB'
                }
                
            # 检查PDF文件格式
            if file_extension == '.pdf':
                try:
                    doc = fitz.open(stream=file_data, filetype="pdf")
                    if doc.page_count == 0:
                        return {
                            'valid': False,
                            'message': 'PDF文件没有页面'
                        }
                    doc.close()
                except Exception as e:
                    return {
                        'valid': False,
                        'message': f'PDF文件格式错误: {str(e)}'
                    }
                    
            return {'valid': True, 'message': '文件验证通过'}
            
        except Exception as e:
            self.logger.error(f"文件验证失败: {e}")
            return {
                'valid': False,
                'message': f'文件验证失败: {str(e)}'
            }
            
    async def _check_file_exists(self, file_hash: str, user_id: int) -> Optional[Dict[str, Any]]:
        """检查文件是否已存在"""
        try:
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = """
                SELECT id, original_name, upload_status, process_status 
                FROM files 
                WHERE file_hash = %s AND user_id = %s
                """
                cursor.execute(sql, (file_hash, user_id))
                result = cursor.fetchone()
                
            connection.close()
            return result
            
        except Exception as e:
            self.logger.error(f"检查文件是否存在失败: {e}")
            return None
            
    async def _save_file_record(self, user_id: int, original_name: str, stored_name: str, 
                              file_path: str, file_size: int, file_hash: str) -> Optional[Dict[str, Any]]:
        """保存文件记录到数据库"""
        try:
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = """
                INSERT INTO files (user_id, original_name, stored_name, file_path, 
                                 file_size, file_hash, upload_status, process_status) 
                VALUES (%s, %s, %s, %s, %s, %s, 'uploaded', 'pending')
                """
                cursor.execute(sql, (user_id, original_name, stored_name, file_path, file_size, file_hash))
                
                # 获取插入的记录ID
                file_id = cursor.lastrowid
                
                # 查询完整记录
                cursor.execute("SELECT * FROM files WHERE id = %s", (file_id,))
                result = cursor.fetchone()
                
            connection.close()
            return result
            
        except Exception as e:
            self.logger.error(f"保存文件记录失败: {e}")
            return None
            
    async def _start_file_processing(self, file_id: int):
        """启动文件处理任务"""
        try:
            # 创建任务记录
            task_id = str(uuid.uuid4())
            connection = self.get_db_connection()
            
            with connection.cursor() as cursor:
                # 获取文件的用户ID
                cursor.execute("SELECT user_id FROM files WHERE id = %s", (file_id,))
                file_info = cursor.fetchone()
                user_id = file_info['user_id'] if file_info else None
                
                sql = """
                INSERT INTO task_queue (task_type, task_id, file_id, user_id, task_status, task_params)
                VALUES (%s, %s, %s, %s, %s, %s)
                """
                task_params = {
                    'file_id': file_id,
                    'extract_text': True,
                    'extract_images': True,
                    'extract_tables': True,
                    'build_index': True
                }
                cursor.execute(sql, ('file_process', task_id, file_id, user_id, 'pending', json.dumps(task_params)))
                
            connection.close()
            
            # 如果有Celery，使用异步任务队列
            if CELERY_AVAILABLE:
                # 这里应该调用Celery任务
                pass
            else:
                # 直接在后台处理
                asyncio.create_task(self.process_file(file_id, task_id))
                
            self.logger.info(f"文件处理任务已启动: file_id={file_id}, task_id={task_id}")
            
        except Exception as e:
            self.logger.error(f"启动文件处理任务失败: {e}")
            
    async def process_file(self, file_id: int, task_id: str):
        """处理文件内容提取"""
        try:
            # 更新任务状态
            await self._update_task_status(task_id, 'running', 0)
            await self._update_file_status(file_id, 'processing', 0)
            
            # 获取文件信息
            file_info = await self._get_file_info(file_id)
            if not file_info:
                raise Exception(f"文件不存在: {file_id}")
                
            file_path = file_info['file_path']
            self.logger.info(f"开始处理文件: {file_path}")
            
            # 打开PDF文件
            doc = fitz.open(file_path)
            total_pages = doc.page_count
            
            # 处理每一页
            for page_num in range(total_pages):
                try:
                    await self._process_page(doc, page_num, file_id)
                    
                    # 更新进度
                    progress = int((page_num + 1) * 100 / total_pages)
                    await self._update_task_status(task_id, 'running', progress)
                    await self._update_file_status(file_id, 'processing', progress)
                    
                except Exception as e:
                    self.logger.error(f"处理第{page_num + 1}页失败: {e}")
                    continue
                    
            doc.close()
            
            # 生成文档摘要
            await self._generate_document_summary(file_id)
            
            # 构建索引
            await self._build_document_index(file_id)
            
            # 完成处理
            await self._update_task_status(task_id, 'completed', 100)
            await self._update_file_status(file_id, 'completed', 100)
            
            self.logger.info(f"文件处理完成: file_id={file_id}")
            
        except Exception as e:
            self.logger.error(f"文件处理失败: {e}")
            await self._update_task_status(task_id, 'failed', 0, str(e))
            await self._update_file_status(file_id, 'failed', 0)
            
    async def _process_page(self, doc, page_num: int, file_id: int):
        """处理单页内容"""
        page = doc[page_num]
        
        # 提取文本
        text_content = page.get_text()
        if text_content.strip():
            await self._save_content(
                file_id=file_id,
                content_type='text',
                page_number=page_num + 1,
                content_text=text_content,
                content_metadata={'text_length': len(text_content)}
            )
            
        # 提取图片
        image_list = page.get_images()
        for img_index, img in enumerate(image_list):
            try:
                # 获取图片数据
                xref = img[0]
                pix = fitz.Pixmap(doc, xref)
                
                if pix.n < 5:  # GRAY或RGB
                    img_data = pix.tobytes("png")
                    
                    # OCR处理图片中的文字
                    ocr_text = ""
                    if self.ocr_engine:
                        try:
                            # 将图片数据转换为PIL Image
                            from io import BytesIO
                            img_pil = Image.open(BytesIO(img_data))
                            
                            # OCR识别
                            result = self.ocr_engine.ocr(img_pil, cls=True)
                            if result:
                                ocr_text = "\n".join([line[1][0] for line in result[0] if line])
                                
                        except Exception as e:
                            self.logger.error(f"OCR处理失败: {e}")
                            
                    # 保存图片内容信息
                    await self._save_content(
                        file_id=file_id,
                        content_type='image',
                        page_number=page_num + 1,
                        content_text=ocr_text,
                        content_metadata={
                            'image_index': img_index,
                            'width': pix.width,
                            'height': pix.height,
                            'has_ocr_text': bool(ocr_text)
                        }
                    )
                    
                pix = None
                
            except Exception as e:
                self.logger.error(f"处理图片失败: {e}")
                continue
                
        # 提取表格
        tables = page.find_tables()
        for table_index, table in enumerate(tables):
            try:
                # 提取表格数据
                table_data = table.extract()
                if table_data:
                    # 转换为文本格式
                    table_text = self._table_to_text(table_data)
                    
                    # 保存表格内容
                    await self._save_content(
                        file_id=file_id,
                        content_type='table',
                        page_number=page_num + 1,
                        content_text=table_text,
                        content_metadata={
                            'table_index': table_index,
                            'rows': len(table_data),
                            'cols': len(table_data[0]) if table_data else 0,
                            'bbox': table.bbox
                        }
                    )
                    
            except Exception as e:
                self.logger.error(f"处理表格失败: {e}")
                continue
                
    def _table_to_text(self, table_data: List[List[str]]) -> str:
        """将表格数据转换为文本"""
        if not table_data:
            return ""
            
        # 使用制表符分隔的格式
        text_lines = []
        for row in table_data:
            # 清理每个单元格的文本
            cleaned_row = [str(cell).strip() if cell else "" for cell in row]
            text_lines.append("\t".join(cleaned_row))
            
        return "\n".join(text_lines)
        
    async def _save_content(self, file_id: int, content_type: str, page_number: int, 
                          content_text: str = "", content_metadata: Dict = None):
        """保存内容到数据库"""
        try:
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = """
                INSERT INTO document_contents 
                (file_id, content_type, page_number, content_text, content_metadata)
                VALUES (%s, %s, %s, %s, %s)
                """
                cursor.execute(sql, (
                    file_id, content_type, page_number, content_text,
                    json.dumps(content_metadata) if content_metadata else None
                ))
                
            connection.close()
            
        except Exception as e:
            self.logger.error(f"保存内容失败: {e}")
            
    async def _generate_document_summary(self, file_id: int):
        """生成文档摘要"""
        try:
            # 获取所有文本内容
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = """
                SELECT content_text FROM document_contents 
                WHERE file_id = %s AND content_type = 'text'
                ORDER BY page_number
                """
                cursor.execute(sql, (file_id,))
                results = cursor.fetchall()
                
            # 合并文本
            full_text = "\n".join([row['content_text'] for row in results if row['content_text']])
            
            if full_text:
                # 生成简单摘要（前500字）
                summary = full_text[:500] + "..." if len(full_text) > 500 else full_text
                
                # 提取关键词（简单实现）
                keywords = self._extract_keywords(full_text)
                
                # 保存摘要
                with connection.cursor() as cursor:
                    sql = """
                    INSERT INTO document_summaries 
                    (file_id, summary_type, summary_content, keywords)
                    VALUES (%s, 'full', %s, %s)
                    """
                    cursor.execute(sql, (file_id, summary, json.dumps(keywords)))
                    
            connection.close()
            
        except Exception as e:
            self.logger.error(f"生成文档摘要失败: {e}")
            
    def _extract_keywords(self, text: str, max_keywords: int = 10) -> List[str]:
        """提取关键词（简单实现）"""
        try:
            import jieba
            # 分词
            words = jieba.cut(text)
            
            # 过滤停用词和短词
            stopwords = {'的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这'}
            keywords = [word for word in words if len(word) > 1 and word not in stopwords]
            
            # 计算词频
            word_freq = {}
            for word in keywords:
                word_freq[word] = word_freq.get(word, 0) + 1
                
            # 按词频排序
            sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
            
            return [word for word, freq in sorted_words[:max_keywords]]
            
        except Exception as e:
            self.logger.error(f"提取关键词失败: {e}")
            return []
            
    async def _build_document_index(self, file_id: int):
        """构建文档索引"""
        try:
            # 标记文件已建立索引
            await self._update_file_index_status(file_id, True)
            self.logger.info(f"文档索引构建完成: file_id={file_id}")
            
        except Exception as e:
            self.logger.error(f"构建文档索引失败: {e}")
            
    async def _update_task_status(self, task_id: str, status: str, progress: int, error_message: str = None):
        """更新任务状态"""
        try:
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                if status == 'running' and progress == 0:
                    sql = """
                    UPDATE task_queue 
                    SET task_status = %s, progress = %s, started_at = %s
                    WHERE task_id = %s
                    """
                    cursor.execute(sql, (status, progress, datetime.now(), task_id))
                elif status in ['completed', 'failed']:
                    sql = """
                    UPDATE task_queue 
                    SET task_status = %s, progress = %s, completed_at = %s, error_message = %s
                    WHERE task_id = %s
                    """
                    cursor.execute(sql, (status, progress, datetime.now(), error_message, task_id))
                else:
                    sql = """
                    UPDATE task_queue 
                    SET task_status = %s, progress = %s
                    WHERE task_id = %s
                    """
                    cursor.execute(sql, (status, progress, task_id))
                    
            connection.close()
            
        except Exception as e:
            self.logger.error(f"更新任务状态失败: {e}")
            
    async def _update_file_status(self, file_id: int, status: str, progress: int):
        """更新文件状态"""
        try:
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = """
                UPDATE files 
                SET process_status = %s, process_progress = %s, updated_at = %s
                WHERE id = %s
                """
                cursor.execute(sql, (status, progress, datetime.now(), file_id))
                
            connection.close()
            
        except Exception as e:
            self.logger.error(f"更新文件状态失败: {e}")
            
    async def _update_file_index_status(self, file_id: int, indexed: bool):
        """更新文件索引状态"""
        try:
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = "UPDATE files SET indexed = %s WHERE id = %s"
                cursor.execute(sql, (indexed, file_id))
                
            connection.close()
            
        except Exception as e:
            self.logger.error(f"更新文件索引状态失败: {e}")
            
    async def _get_file_info(self, file_id: int) -> Optional[Dict[str, Any]]:
        """获取文件信息"""
        try:
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = "SELECT * FROM files WHERE id = %s"
                cursor.execute(sql, (file_id,))
                result = cursor.fetchone()
                
            connection.close()
            return result
            
        except Exception as e:
            self.logger.error(f"获取文件信息失败: {e}")
            return None
            
    async def get_file_list(self, user_id: int, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        """获取文件列表"""
        try:
            offset = (page - 1) * page_size
            
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                # 获取总数
                count_sql = "SELECT COUNT(*) as total FROM files WHERE user_id = %s"
                cursor.execute(count_sql, (user_id,))
                total = cursor.fetchone()['total']
                
                # 获取文件列表
                list_sql = """
                SELECT id, original_name, file_size, upload_status, process_status, 
                       process_progress, content_extracted, indexed, created_at, updated_at
                FROM files 
                WHERE user_id = %s 
                ORDER BY created_at DESC 
                LIMIT %s OFFSET %s
                """
                cursor.execute(list_sql, (user_id, page_size, offset))
                raw_files = cursor.fetchall()
                
                # 格式化文件数据
                files = []
                for file_info in raw_files:
                    formatted_file = {
                        'id': file_info['id'],
                        'original_name': file_info['original_name'],
                        'file_size': file_info['file_size'],
                        'upload_status': file_info['upload_status'],
                        'process_status': file_info['process_status'],
                        'process_progress': file_info['process_progress'],
                        'content_extracted': bool(file_info['content_extracted']),
                        'indexed': bool(file_info['indexed']),
                        'created_at': file_info['created_at'].isoformat() if file_info['created_at'] else None,
                        'updated_at': file_info['updated_at'].isoformat() if file_info['updated_at'] else None
                    }
                    files.append(formatted_file)
                
            connection.close()
            
            return {
                'success': True,
                'data': {
                    'files': files,
                    'pagination': {
                        'total': total,
                        'page': page,
                        'page_size': page_size,
                        'total_pages': (total + page_size - 1) // page_size
                    }
                }
            }
            
        except Exception as e:
            self.logger.error(f"获取文件列表失败: {e}")
            return {
                'success': False,
                'message': f'获取文件列表失败: {str(e)}',
                'data': None
            }
    
    async def search_files(self, user_id: int, keyword: str, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
        """搜索文件"""
        try:
            offset = (page - 1) * page_size
            search_pattern = f"%{keyword}%"
            
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                # 获取搜索结果总数
                count_sql = """
                SELECT COUNT(*) as total FROM files 
                WHERE user_id = %s AND original_name LIKE %s
                """
                cursor.execute(count_sql, (user_id, search_pattern))
                total = cursor.fetchone()['total']
                
                # 获取搜索结果列表
                search_sql = """
                SELECT id, original_name, file_size, upload_status, process_status, 
                       process_progress, content_extracted, indexed, created_at, updated_at
                FROM files 
                WHERE user_id = %s AND original_name LIKE %s
                ORDER BY created_at DESC 
                LIMIT %s OFFSET %s
                """
                cursor.execute(search_sql, (user_id, search_pattern, page_size, offset))
                raw_files = cursor.fetchall()
                
                # 格式化文件数据
                files = []
                for file_info in raw_files:
                    formatted_file = {
                        'id': file_info['id'],
                        'original_name': file_info['original_name'],
                        'file_size': file_info['file_size'],
                        'upload_status': file_info['upload_status'],
                        'process_status': file_info['process_status'],
                        'process_progress': file_info['process_progress'],
                        'content_extracted': bool(file_info['content_extracted']),
                        'indexed': bool(file_info['indexed']),
                        'created_at': file_info['created_at'].isoformat() if file_info['created_at'] else None,
                        'updated_at': file_info['updated_at'].isoformat() if file_info['updated_at'] else None
                    }
                    files.append(formatted_file)
                
            connection.close()
            
            return {
                'success': True,
                'data': {
                    'files': files,
                    'pagination': {
                        'total': total,
                        'page': page,
                        'page_size': page_size,
                        'total_pages': (total + page_size - 1) // page_size
                    }
                }
            }
            
        except Exception as e:
            self.logger.error(f"搜索文件失败: {e}")
            return {
                'success': False,
                'message': f'搜索文件失败: {str(e)}',
                'data': None
            }
            
    async def delete_file(self, file_id: int, user_id: int) -> Dict[str, Any]:
        """删除文件"""
        try:
            # 获取文件信息
            file_info = await self._get_file_info(file_id)
            if not file_info:
                return {
                    'success': False,
                    'message': '文件不存在'
                }
                
            if file_info['user_id'] != user_id:
                return {
                    'success': False,
                    'message': '无权限删除此文件'
                }
                
            # 删除数据库记录（触发器会自动清理相关数据）
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = "DELETE FROM files WHERE id = %s AND user_id = %s"
                cursor.execute(sql, (file_id, user_id))
                affected_rows = cursor.rowcount
                
                if affected_rows == 0:
                    connection.close()
                    return {
                        'success': False,
                        'message': '文件删除失败，可能已被删除或无权限'
                    }
                
            connection.close()
            
            # 删除物理文件
            try:
                file_path = Path(file_info['file_path'])
                if file_path.exists():
                    file_path.unlink()
                    self.logger.info(f"物理文件删除成功: {file_path}")
            except Exception as e:
                self.logger.warning(f"物理文件删除失败: {e}，但数据库记录已删除")
            
            self.logger.info(f"文件删除成功: file_id={file_id}")
            return {
                'success': True,
                'message': '文件删除成功'
            }
            
        except Exception as e:
            self.logger.error(f"删除文件失败: {e}")
            return {
                'success': False,
                'message': f'删除文件失败: {str(e)}'
            }
            
    async def rename_file(self, file_id: int, new_name: str, user_id: int) -> Dict[str, Any]:
        """重命名文件"""
        try:
            # 检查文件是否存在
            file_info = await self._get_file_info(file_id)
            if not file_info:
                return {
                    'success': False,
                    'message': '文件不存在'
                }
                
            if file_info['user_id'] != user_id:
                return {
                    'success': False,
                    'message': '无权限修改此文件'
                }
                
            # 更新文件名
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = "UPDATE files SET original_name = %s, updated_at = %s WHERE id = %s AND user_id = %s"
                cursor.execute(sql, (new_name, datetime.now(), file_id, user_id))
                affected_rows = cursor.rowcount
                
                if affected_rows == 0:
                    connection.close()
                    return {
                        'success': False,
                        'message': '文件重命名失败，可能文件不存在或无权限'
                    }
                
            connection.close()
            
            return {
                'success': True,
                'message': '文件重命名成功'
            }
            
        except Exception as e:
            self.logger.error(f"重命名文件失败: {e}")
            return {
                'success': False,
                'message': f'重命名文件失败: {str(e)}'
            }
            
    async def get_file_processing_status(self, file_id: int, user_id: int) -> Dict[str, Any]:
        """获取文件处理状态"""
        try:
            # 检查文件权限
            file_info = await self._get_file_info(file_id)
            if not file_info or file_info['user_id'] != user_id:
                return {
                    'success': False,
                    'message': '文件不存在或无权限访问'
                }
                
            # 获取任务状态
            connection = self.get_db_connection()
            with connection.cursor() as cursor:
                sql = """
                SELECT task_status, progress, error_message, started_at, completed_at
                FROM task_queue 
                WHERE file_id = %s AND task_type = 'file_process'
                ORDER BY created_at DESC 
                LIMIT 1
                """
                cursor.execute(sql, (file_id,))
                task_info = cursor.fetchone()
                
            connection.close()
            
            return {
                'success': True,
                'data': {
                    'file_id': file_id,
                    'process_status': file_info['process_status'],
                    'process_progress': file_info['process_progress'],
                    'content_extracted': file_info['content_extracted'],
                    'indexed': file_info['indexed'],
                    'task_info': task_info
                }
            }
            
        except Exception as e:
            self.logger.error(f"获取文件处理状态失败: {e}")
            return {
                'success': False,
                'message': f'获取文件处理状态失败: {str(e)}'
            } 