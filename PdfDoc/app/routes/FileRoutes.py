#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文件管理路由模块
处理文件管理相关的HTTP请求
"""

import asyncio
import logging
from flask import Blueprint, request, jsonify, current_app
from werkzeug.utils import secure_filename
from typing import Dict, Any
import json

# 导入服务层
from ..service.FileService import FileService

# 创建蓝图
file_bp = Blueprint('file', __name__, url_prefix='/api/file')

# 初始化服务
file_service = FileService()

# 日志配置
logger = logging.getLogger(__name__)


@file_bp.route('/upload', methods=['POST'])
def upload_file():
    """
    文件上传接口
    
    Returns:
        JSON响应包含上传结果
    """
    try:
        # 检查文件是否存在
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'message': '没有选择文件',
                'code': 400
            }), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({
                'success': False,
                'message': '文件名为空',
                'code': 400
            }), 400
            
        # 获取用户ID（从session或token中获取，这里简化处理）
        user_id = request.form.get('user_id', 1)  # 默认用户ID为1
        try:
            user_id = int(user_id)
        except ValueError:
            return jsonify({
                'success': False,
                'message': '用户ID无效',
                'code': 400
            }), 400
            
        # 安全文件名处理
        filename = secure_filename(file.filename)
        if not filename:
            return jsonify({
                'success': False,
                'message': '文件名无效',
                'code': 400
            }), 400
            
        # 读取文件数据
        file_data = file.read()
        if not file_data:
            return jsonify({
                'success': False,
                'message': '文件内容为空',
                'code': 400
            }), 400
            
        # 调用服务层处理文件上传
        result = asyncio.run(file_service.upload_file(file_data, filename, user_id))
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': result['message'],
                'data': {
                    'file_id': result['file_id'],
                    'filename': result['filename'],
                    'size': result['size']
                },
                'code': 200
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result['message'],
                'code': 400
            }), 400
            
    except Exception as e:
        logger.error(f"文件上传接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


@file_bp.route('/list', methods=['GET'])
def get_file_list():
    """
    获取文件列表接口
    
    Query Parameters:
        user_id: 用户ID
        page: 页码，默认1
        page_size: 每页大小，默认20
        
    Returns:
        JSON响应包含文件列表
    """
    try:
        # 获取查询参数
        user_id = request.args.get('user_id', 1)
        page = request.args.get('page', 1)
        page_size = request.args.get('page_size', 20)
        
        # 参数验证
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
            
        # 调用服务层获取文件列表
        result = asyncio.run(file_service.get_file_list(user_id, page, page_size))
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': '获取文件列表成功',
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
        logger.error(f"获取文件列表接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


@file_bp.route('/delete/<int:file_id>', methods=['DELETE'])
def delete_file(file_id: int):
    """
    删除文件接口
    
    Args:
        file_id: 文件ID
        
    Returns:
        JSON响应包含删除结果
    """
    try:
        # 获取用户ID
        user_id = request.args.get('user_id', 1)
        try:
            user_id = int(user_id)
        except ValueError:
            return jsonify({
                'success': False,
                'message': '用户ID无效',
                'code': 400
            }), 400
            
        # 调用服务层删除文件
        result = asyncio.run(file_service.delete_file(file_id, user_id))
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': result['message'],
                'code': 200
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result['message'],
                'code': 400
            }), 400
            
    except Exception as e:
        logger.error(f"删除文件接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


@file_bp.route('/rename/<int:file_id>', methods=['PUT'])
def rename_file(file_id: int):
    """
    重命名文件接口
    
    Args:
        file_id: 文件ID
        
    JSON Body:
        new_name: 新文件名
        user_id: 用户ID
        
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
            
        new_name = data.get('new_name', '').strip()
        user_id = data.get('user_id', 1)
        
        # 参数验证
        if not new_name:
            return jsonify({
                'success': False,
                'message': '新文件名不能为空',
                'code': 400
            }), 400
            
        try:
            user_id = int(user_id)
        except ValueError:
            return jsonify({
                'success': False,
                'message': '用户ID无效',
                'code': 400
            }), 400
            
        # 文件名安全处理
        new_name = secure_filename(new_name)
        if not new_name:
            return jsonify({
                'success': False,
                'message': '文件名无效',
                'code': 400
            }), 400
            
        # 调用服务层重命名文件
        result = asyncio.run(file_service.rename_file(file_id, new_name, user_id))
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': result['message'],
                'code': 200
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': result['message'],
                'code': 400
            }), 400
            
    except Exception as e:
        logger.error(f"重命名文件接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


@file_bp.route('/status/<int:file_id>', methods=['GET'])
def get_file_status(file_id: int):
    """
    获取文件处理状态接口
    
    Args:
        file_id: 文件ID
        
    Query Parameters:
        user_id: 用户ID
        
    Returns:
        JSON响应包含文件处理状态
    """
    try:
        # 获取用户ID
        user_id = request.args.get('user_id', 1)
        try:
            user_id = int(user_id)
        except ValueError:
            return jsonify({
                'success': False,
                'message': '用户ID无效',
                'code': 400
            }), 400
            
        # 调用服务层获取文件处理状态
        result = asyncio.run(file_service.get_file_processing_status(file_id, user_id))
        
        if result['success']:
            return jsonify({
                'success': True,
                'message': '获取文件状态成功',
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
        logger.error(f"获取文件状态接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


@file_bp.route('/batch/delete', methods=['POST'])
def batch_delete_files():
    """
    批量删除文件接口
    
    JSON Body:
        file_ids: 文件ID列表
        user_id: 用户ID
        
    Returns:
        JSON响应包含批量删除结果
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
            
        file_ids = data.get('file_ids', [])
        user_id = data.get('user_id', 1)
        
        # 参数验证
        if not file_ids or not isinstance(file_ids, list):
            return jsonify({
                'success': False,
                'message': '文件ID列表不能为空',
                'code': 400
            }), 400
            
        try:
            user_id = int(user_id)
            file_ids = [int(fid) for fid in file_ids]
        except ValueError:
            return jsonify({
                'success': False,
                'message': '参数格式错误',
                'code': 400
            }), 400
            
        # 批量删除文件
        results = []
        for file_id in file_ids:
            result = asyncio.run(file_service.delete_file(file_id, user_id))
            results.append({
                'file_id': file_id,
                'success': result['success'],
                'message': result['message']
            })
            
        # 统计结果
        success_count = sum(1 for r in results if r['success'])
        total_count = len(results)
        
        return jsonify({
            'success': True,
            'message': f'批量删除完成，成功删除 {success_count}/{total_count} 个文件',
            'data': {
                'results': results,
                'success_count': success_count,
                'total_count': total_count
            },
            'code': 200
        }), 200
        
    except Exception as e:
        logger.error(f"批量删除文件接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


@file_bp.route('/search', methods=['GET'])
def search_files():
    """
    搜索文件接口
    
    Query Parameters:
        user_id: 用户ID
        keyword: 搜索关键词
        page: 页码，默认1
        page_size: 每页大小，默认20
        
    Returns:
        JSON响应包含搜索结果
    """
    try:
        # 获取查询参数
        user_id = request.args.get('user_id', 1)
        keyword = request.args.get('keyword', '').strip()
        page = request.args.get('page', 1)
        page_size = request.args.get('page_size', 20)
        
        # 参数验证
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
            
        if not keyword:
            return jsonify({
                'success': False,
                'message': '搜索关键词不能为空',
                'code': 400
            }), 400
            
        # 参数范围检查
        if page < 1:
            page = 1
        if page_size < 1 or page_size > 100:
            page_size = 20
            
        # 这里应该实现文件搜索逻辑
        # 简化实现：按文件名搜索
        result = {
            'success': True,
            'data': {
                'files': [],  # 搜索结果
                'pagination': {
                    'total': 0,
                    'page': page,
                    'page_size': page_size,
                    'total_pages': 0
                }
            }
        }
        
        return jsonify({
            'success': True,
            'message': '搜索完成',
            'data': result['data'],
            'code': 200
        }), 200
        
    except Exception as e:
        logger.error(f"搜索文件接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


@file_bp.route('/info/<int:file_id>', methods=['GET'])
def get_file_info(file_id: int):
    """
    获取文件详细信息接口
    
    Args:
        file_id: 文件ID
        
    Query Parameters:
        user_id: 用户ID
        
    Returns:
        JSON响应包含文件详细信息
    """
    try:
        # 获取用户ID
        user_id = request.args.get('user_id', 1)
        try:
            user_id = int(user_id)
        except ValueError:
            return jsonify({
                'success': False,
                'message': '用户ID无效',
                'code': 400
            }), 400
            
        # 获取文件信息
        file_info = asyncio.run(file_service._get_file_info(file_id))
        
        if not file_info:
            return jsonify({
                'success': False,
                'message': '文件不存在',
                'code': 404
            }), 404
            
        if file_info['user_id'] != user_id:
            return jsonify({
                'success': False,
                'message': '无权限访问此文件',
                'code': 403
            }), 403
            
        # 移除敏感信息
        safe_info = {
            'id': file_info['id'],
            'original_name': file_info['original_name'],
            'file_size': file_info['file_size'],
            'upload_status': file_info['upload_status'],
            'process_status': file_info['process_status'],
            'process_progress': file_info['process_progress'],
            'content_extracted': file_info['content_extracted'],
            'indexed': file_info['indexed'],
            'created_at': file_info['created_at'].isoformat() if file_info['created_at'] else None,
            'updated_at': file_info['updated_at'].isoformat() if file_info['updated_at'] else None
        }
        
        return jsonify({
            'success': True,
            'message': '获取文件信息成功',
            'data': safe_info,
            'code': 200
        }), 200
        
    except Exception as e:
        logger.error(f"获取文件信息接口错误: {e}")
        return jsonify({
            'success': False,
            'message': f'服务器内部错误: {str(e)}',
            'code': 500
        }), 500


# 错误处理
@file_bp.errorhandler(404)
def not_found(error):
    """404错误处理"""
    return jsonify({
        'success': False,
        'message': '接口不存在',
        'code': 404
    }), 404


@file_bp.errorhandler(405)
def method_not_allowed(error):
    """405错误处理"""
    return jsonify({
        'success': False,
        'message': '请求方法不允许',
        'code': 405
    }), 405


@file_bp.errorhandler(413)
def request_entity_too_large(error):
    """413错误处理 - 文件过大"""
    return jsonify({
        'success': False,
        'message': '上传文件过大',
        'code': 413
    }), 413


@file_bp.errorhandler(500)
def internal_server_error(error):
    """500错误处理"""
    logger.error(f"内部服务器错误: {error}")
    return jsonify({
        'success': False,
        'message': '服务器内部错误',
        'code': 500
    }), 500 