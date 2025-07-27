#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
智能检索路由模块
处理智能检索相关的HTTP请求
"""

import asyncio
import logging
from flask import Blueprint, request, jsonify, Response
from typing import Dict, Any
import json

# 导入服务层
from ..service.SearchService import SearchService

# 创建蓝图
search_bp = Blueprint('search', __name__, url_prefix='/api/search')

# 初始化服务
search_service = SearchService()

# 日志配置
logger = logging.getLogger(__name__)


@search_bp.route('/session/create', methods=['POST'])
def create_session():
    """
    创建对话会话接口
    
    JSON Body:
        user_id: 用户ID
        session_name: 会话名称（可选）
        
    Returns:
        JSON响应包含会话信息
    """
    try:
        # 获取请求数据
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'message': '请求数据为空',
                'code': 400
            }), 400
            
        user_id = data.get('user_id')
        session_name = data.get('session_name', '').strip()
        
        # 参数验证
        if not user_id:
            return jsonify({
                'success': False,
                'message': '用户ID不能为空',
                'code': 400
            }), 400
            
        try:
            user_id = int(user_id)
        except ValueError:
            return jsonify({
                'success': False,
                'message': '用户ID格式错误',
                'code': 400
            }), 400
            
        # 调用服务层创建会话
        result = asyncio.run(search_service.create_chat_session(user_id, session_name))
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': '会话创建成功',
                'data': result['data'],
                'code': 200
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result['message'],
                'code': 400
            }), 400
            
    except Exception as e:
        logger.error(f"创建会话接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


@search_bp.route('/query', methods=['POST'])
def search_query():
    """
    智能检索问答接口
    
    JSON Body:
        session_id: 会话ID
        user_id: 用户ID
        query: 查询问题
        file_ids: 文件ID列表（可选）
        
    Returns:
        JSON响应包含回答结果
    """
    try:
        # 获取请求数据
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'message': '请求数据为空',
                'code': 400
            }), 400
            
        session_id = data.get('session_id')
        user_id = data.get('user_id')
        query = data.get('query', '').strip()
        file_ids = data.get('file_ids', [])
        
        # 参数验证
        if not session_id:
            return jsonify({
                'success': False,
                'message': '会话ID不能为空',
                'code': 400
            }), 400
            
        if not user_id:
            return jsonify({
                'success': False,
                'message': '用户ID不能为空',
                'code': 400
            }), 400
            
        if not query:
            return jsonify({
                'success': False,
                'message': '查询问题不能为空',
                'code': 400
            }), 400
            
        try:
            session_id = int(session_id)
            user_id = int(user_id)
            if file_ids:
                file_ids = [int(fid) for fid in file_ids if fid]
        except ValueError:
            return jsonify({
                'success': False,
                'message': '参数格式错误',
                'code': 400
            }), 400
            
        # 调用服务层进行智能检索
        result = asyncio.run(search_service.search_and_answer(session_id, user_id, query, file_ids))
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': '检索成功',
                'data': result['data'],
                'code': 200
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result['message'],
                'code': 400
            }), 400
            
    except Exception as e:
        logger.error(f"智能检索接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


@search_bp.route('/stream', methods=['POST'])
def search_stream():
    """
    流式智能检索问答接口
    
    JSON Body:
        session_id: 会话ID
        user_id: 用户ID
        query: 查询问题
        file_ids: 文件ID列表（可选）
        
    Returns:
        流式响应
    """
    try:
        # 获取请求数据
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'message': '请求数据为空',
                'code': 400
            }), 400
            
        session_id = data.get('session_id')
        user_id = data.get('user_id')
        query = data.get('query', '').strip()
        file_ids = data.get('file_ids', [])
        
        # 参数验证
        if not session_id or not user_id or not query:
            return jsonify({
                'success': False,
                'message': '必要参数不能为空',
                'code': 400
            }), 400
            
        try:
            session_id = int(session_id)
            user_id = int(user_id)
            if file_ids:
                file_ids = [int(fid) for fid in file_ids if fid]
        except ValueError:
            return jsonify({
                'success': False,
                'message': '参数格式错误',
                'code': 400
            }), 400
            
        # 流式生成器函数
        def generate_stream():
            try:
                # 发送开始信号
                yield f"data: {json.dumps({'type': 'start', 'message': '开始检索...'})}\n\n"
                
                # 发送检索进度
                yield f"data: {json.dumps({'type': 'progress', 'message': '正在搜索相关内容...'})}\n\n"
                
                # 执行检索
                result = asyncio.run(search_service.search_and_answer(session_id, user_id, query, file_ids))
                
                if result['success']:
                    # 发送回答内容（模拟逐字输出）
                    answer = result['data']['answer']
                    chunk_size = 10  # 每次发送10个字符
                    
                    for i in range(0, len(answer), chunk_size):
                        chunk = answer[i:i+chunk_size]
                        yield f"data: {json.dumps({'type': 'content', 'content': chunk})}\n\n"
                        
                    # 发送来源信息
                    sources = result['data'].get('sources', [])
                    if sources:
                        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"
                        
                    # 发送完成信号
                    yield f"data: {json.dumps({'type': 'done', 'message': '回答完成'})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'error', 'message': result['message']})}\n\n"
                    
            except Exception as e:
                logger.error(f"流式检索错误: {e}")
                yield f"data: {json.dumps({'type': 'error', 'message': f'检索失败: {str(e)}'})}\n\n"
                
        return Response(generate_stream(), mimetype='text/plain')
        
    except Exception as e:
        logger.error(f"流式检索接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


@search_bp.route('/history/<int:session_id>', methods=['GET'])
def get_chat_history(session_id: int):
    """
    获取聊天历史接口
    
    Args:
        session_id: 会话ID
        
    Query Parameters:
        user_id: 用户ID
        page: 页码，默认1
        page_size: 每页大小，默认20
        
    Returns:
        JSON响应包含聊天历史
    """
    try:
        # 获取查询参数
        user_id = request.args.get('user_id')
        page = request.args.get('page', 1)
        page_size = request.args.get('page_size', 20)
        
        # 参数验证
        if not user_id:
            return jsonify({
                'success': False,
                'message': '用户ID不能为空',
                'code': 400
            }), 400
            
        try:
            user_id = int(user_id)
            page = int(page)
            page_size = int(page_size)
        except ValueError:
            return jsonify({
                'success': False,
                'message': '参数格式错误',
                'code': 400
            }), 400
            
        # 参数范围检查
        if page < 1:
            page = 1
        if page_size < 1 or page_size > 100:
            page_size = 20
            
        # 调用服务层获取聊天历史
        result = asyncio.run(search_service.get_chat_history(session_id, user_id, page, page_size))
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': '获取聊天历史成功',
                'data': result['data'],
                'code': 200
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result['message'],
                'code': 400
            }), 400
            
    except Exception as e:
        logger.error(f"获取聊天历史接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


@search_bp.route('/sessions', methods=['GET'])
def get_user_sessions():
    """
    获取用户会话列表接口
    
    Query Parameters:
        user_id: 用户ID
        
    Returns:
        JSON响应包含会话列表
    """
    try:
        # 获取查询参数
        user_id = request.args.get('user_id')
        
        # 参数验证
        if not user_id:
            return jsonify({
                'success': False,
                'message': '用户ID不能为空',
                'code': 400
            }), 400
            
        try:
            user_id = int(user_id)
        except ValueError:
            return jsonify({
                'success': False,
                'message': '用户ID格式错误',
                'code': 400
            }), 400
            
        # 调用服务层获取会话列表
        result = asyncio.run(search_service.get_user_sessions(user_id))
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': '获取会话列表成功',
                'data': result['data'],
                'code': 200
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result['message'],
                'code': 400
            }), 400
            
    except Exception as e:
        logger.error(f"获取会话列表接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


@search_bp.route('/session/delete/<int:session_id>', methods=['DELETE'])
def delete_session(session_id: int):
    """
    删除会话接口
    
    Args:
        session_id: 会话ID
        
    Query Parameters:
        user_id: 用户ID
        
    Returns:
        JSON响应包含删除结果
    """
    try:
        # 获取用户ID
        user_id = request.args.get('user_id')
        
        # 参数验证
        if not user_id:
            return jsonify({
                'success': False,
                'message': '用户ID不能为空',
                'code': 400
            }), 400
            
        try:
            user_id = int(user_id)
        except ValueError:
            return jsonify({
                'success': False,
                'message': '用户ID格式错误',
                'code': 400
            }), 400
            
        # 验证会话权限
        session_valid = asyncio.run(search_service._validate_session(session_id, user_id))
        if not session_valid:
            return jsonify({
                'success': False,
                'message': '会话不存在或无权限访问',
                'code': 403
            }), 403
            
        # 删除会话（标记为删除状态）
        try:
            connection = search_service.get_db_connection()
            with connection.cursor() as cursor:
                sql = "UPDATE chat_sessions SET session_status = 'deleted' WHERE id = %s"
                cursor.execute(sql, (session_id,))
                
            connection.close()
            
            return jsonify({
                'success': True,
                'message': '会话删除成功',
                'code': 200
            }), 200
            
        except Exception as e:
            logger.error(f"删除会话数据库操作失败: {e}")
            return jsonify({
                'success': False,
                'message': '删除会话失败',
                'code': 500
            }), 500
            
    except Exception as e:
        logger.error(f"删除会话接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


@search_bp.route('/session/rename/<int:session_id>', methods=['PUT'])
def rename_session(session_id: int):
    """
    重命名会话接口
    
    Args:
        session_id: 会话ID
        
    JSON Body:
        user_id: 用户ID
        new_name: 新会话名称
        
    Returns:
        JSON响应包含重命名结果
    """
    try:
        # 获取请求数据
        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'message': '请求数据为空',
                'code': 400
            }), 400
            
        user_id = data.get('user_id')
        new_name = data.get('new_name', '').strip()
        
        # 参数验证
        if not user_id:
            return jsonify({
                'success': False,
                'message': '用户ID不能为空',
                'code': 400
            }), 400
            
        if not new_name:
            return jsonify({
                'success': False,
                'message': '新会话名称不能为空',
                'code': 400
            }), 400
            
        try:
            user_id = int(user_id)
        except ValueError:
            return jsonify({
                'success': False,
                'message': '用户ID格式错误',
                'code': 400
            }), 400
            
        # 验证会话权限
        session_valid = asyncio.run(search_service._validate_session(session_id, user_id))
        if not session_valid:
            return jsonify({
                'success': False,
                'message': '会话不存在或无权限访问',
                'code': 403
            }), 403
            
        # 重命名会话
        try:
            connection = search_service.get_db_connection()
            with connection.cursor() as cursor:
                sql = """
                UPDATE chat_sessions 
                SET session_name = %s, updated_at = %s 
                WHERE id = %s
                """
                from datetime import datetime
                cursor.execute(sql, (new_name, datetime.now(), session_id))
                
            connection.close()
            
            return jsonify({
                'success': True,
                'message': '会话重命名成功',
                'code': 200
            }), 200
            
        except Exception as e:
            logger.error(f"重命名会话数据库操作失败: {e}")
            return jsonify({
                'success': False,
                'message': '重命名会话失败',
                'code': 500
            }), 500
            
    except Exception as e:
        logger.error(f"重命名会话接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


@search_bp.route('/suggestions', methods=['GET'])
def get_search_suggestions():
    """
    获取搜索建议接口
    
    Query Parameters:
        user_id: 用户ID
        keyword: 关键词
        limit: 建议数量限制，默认5
        
    Returns:
        JSON响应包含搜索建议
    """
    try:
        # 获取查询参数
        user_id = request.args.get('user_id')
        keyword = request.args.get('keyword', '').strip()
        limit = request.args.get('limit', 5)
        
        # 参数验证
        if not user_id:
            return jsonify({
                'success': False,
                'message': '用户ID不能为空',
                'code': 400
            }), 400
            
        if not keyword:
            return jsonify({
                'success': False,
                'message': '关键词不能为空',
                'code': 400
            }), 400
            
        try:
            user_id = int(user_id)
            limit = int(limit)
        except ValueError:
            return jsonify({
                'success': False,
                'message': '参数格式错误',
                'code': 400
            }), 400
            
        # 限制建议数量
        limit = min(max(limit, 1), 20)
        
        # 获取搜索建议（简单实现）
        suggestions = []
        
        try:
            connection = search_service.get_db_connection()
            with connection.cursor() as cursor:
                # 从搜索历史中获取相似查询
                sql = """
                SELECT DISTINCT search_query 
                FROM search_history 
                WHERE user_id = %s 
                AND search_query LIKE %s 
                ORDER BY created_at DESC 
                LIMIT %s
                """
                cursor.execute(sql, (user_id, f'%{keyword}%', limit))
                history_results = cursor.fetchall()
                
                suggestions.extend([r['search_query'] for r in history_results])
                
                # 如果历史记录不够，从文档内容中获取相关关键词
                if len(suggestions) < limit:
                    remaining = limit - len(suggestions)
                    sql = """
                    SELECT DISTINCT dc.content_text 
                    FROM document_contents dc
                    JOIN files f ON dc.file_id = f.id
                    WHERE f.user_id = %s 
                    AND dc.content_text LIKE %s 
                    AND dc.content_type = 'text'
                    LIMIT %s
                    """
                    cursor.execute(sql, (user_id, f'%{keyword}%', remaining))
                    content_results = cursor.fetchall()
                    
                    # 从内容中提取相关短语
                    for result in content_results:
                        content = result['content_text']
                        if content and keyword in content:
                            # 简单提取包含关键词的句子
                            sentences = content.split('。')
                            for sentence in sentences:
                                if keyword in sentence and len(sentence.strip()) < 50:
                                    suggestions.append(sentence.strip() + '？')
                                    if len(suggestions) >= limit:
                                        break
                            if len(suggestions) >= limit:
                                break
                                
            connection.close()
            
            # 去重并限制数量
            unique_suggestions = list(dict.fromkeys(suggestions))[:limit]
            
            return jsonify({
                'success': True,
                'message': '获取搜索建议成功',
                'data': {
                    'suggestions': unique_suggestions,
                    'count': len(unique_suggestions)
                },
                'code': 200
            }), 200
            
        except Exception as e:
            logger.error(f"获取搜索建议数据库操作失败: {e}")
            return jsonify({
                'success': False,
                'message': '获取搜索建议失败',
                'code': 500
            }), 500
            
    except Exception as e:
        logger.error(f"获取搜索建议接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


@search_bp.route('/analytics', methods=['GET'])
def get_search_analytics():
    """
    获取搜索分析统计接口
    
    Query Parameters:
        user_id: 用户ID
        days: 统计天数，默认7天
        
    Returns:
        JSON响应包含搜索统计信息
    """
    try:
        # 获取查询参数
        user_id = request.args.get('user_id')
        days = request.args.get('days', 7)
        
        # 参数验证
        if not user_id:
            return jsonify({
                'success': False,
                'message': '用户ID不能为空',
                'code': 400
            }), 400
            
        try:
            user_id = int(user_id)
            days = int(days)
        except ValueError:
            return jsonify({
                'success': False,
                'message': '参数格式错误',
                'code': 400
            }), 400
            
        # 限制天数范围
        days = min(max(days, 1), 365)
        
        # 获取统计信息
        try:
            from datetime import datetime, timedelta
            
            start_date = datetime.now() - timedelta(days=days)
            
            connection = search_service.get_db_connection()
            with connection.cursor() as cursor:
                # 搜索次数统计
                sql = """
                SELECT COUNT(*) as search_count, 
                       AVG(response_time) as avg_response_time
                FROM search_history 
                WHERE user_id = %s AND created_at >= %s
                """
                cursor.execute(sql, (user_id, start_date))
                search_stats = cursor.fetchone()
                
                # 热门查询词
                sql = """
                SELECT search_query, COUNT(*) as count
                FROM search_history 
                WHERE user_id = %s AND created_at >= %s
                GROUP BY search_query 
                ORDER BY count DESC 
                LIMIT 10
                """
                cursor.execute(sql, (user_id, start_date))
                popular_queries = cursor.fetchall()
                
                # 活跃会话数
                sql = """
                SELECT COUNT(DISTINCT session_id) as active_sessions
                FROM chat_messages cm
                JOIN chat_sessions cs ON cm.session_id = cs.id
                WHERE cs.user_id = %s AND cm.created_at >= %s
                """
                cursor.execute(sql, (user_id, start_date))
                session_stats = cursor.fetchone()
                
            connection.close()
            
            analytics = {
                'search_count': search_stats['search_count'] or 0,
                'avg_response_time': round(search_stats['avg_response_time'] or 0, 2),
                'active_sessions': session_stats['active_sessions'] or 0,
                'popular_queries': popular_queries,
                'period_days': days
            }
            
            return jsonify({
                'success': True,
                'message': '获取搜索分析成功',
                'data': analytics,
                'code': 200
            }), 200
            
        except Exception as e:
            logger.error(f"获取搜索分析数据库操作失败: {e}")
            return jsonify({
                'success': False,
                'message': '获取搜索分析失败',
                'code': 500
            }), 500
            
    except Exception as e:
        logger.error(f"获取搜索分析接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


# 错误处理
@search_bp.errorhandler(404)
def not_found(error):
    """404错误处理"""
    return jsonify({
        'success': False,
        'message': '接口不存在',
        'code': 404
    }), 404


@search_bp.errorhandler(405)
def method_not_allowed(error):
    """405错误处理"""
    return jsonify({
        'success': False,
        'message': '请求方法不允许',
        'code': 405
    }), 405


@search_bp.errorhandler(500)
def internal_server_error(error):
    """500错误处理"""
    logger.error(f"内部服务器错误: {error}")
    return jsonify({
        'success': False,
        'message': '服务器内部错误',
        'code': 500
    }), 500 