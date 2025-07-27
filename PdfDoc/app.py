#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PDF智能文件管理系统主应用程序
Author: AI Assistant
Version: 1.0.0
Description: 基于Flask的PDF智能检索系统，集成文件管理、内容提取、智能检索和GraphRAG功能
"""

import os
import sys
import asyncio
import logging
from pathlib import Path
from datetime import datetime

# Flask相关
from flask import Flask, render_template, jsonify, request, send_from_directory
from flask_cors import CORS

# 导入路由模块
from app.routes.FileRoutes import file_bp
from app.routes.SearchRoutes import search_bp

# 导入环境检查模块
from app.environment_check import main as environment_check


def create_app():
    """
    创建Flask应用程序工厂函数
    """
    # 创建Flask应用实例
    app = Flask(__name__, 
                template_folder='templates/html',
                static_folder='templates')
    
    # 应用配置
    configure_app(app)
    
    # 配置日志
    configure_logging(app)
    
    # 注册蓝图
    register_blueprints(app)
    
    # 配置CORS
    configure_cors(app)
    
    # 注册错误处理器
    register_error_handlers(app)
    
    # 注册上下文处理器
    register_context_processors(app)
    
    # 应用启动前检查
    register_before_first_request(app)
    
    return app


def configure_app(app):
    """配置应用程序"""
    # 基础配置
    app.config['SECRET_KEY'] = 'pdf_ai_doc_secret_key_2024'
    app.config['DEBUG'] = True
    
    # 文件上传配置
    app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB
    app.config['UPLOAD_FOLDER'] = './uploads'
    
    # JSON配置
    app.config['JSON_AS_ASCII'] = False
    app.config['JSONIFY_PRETTYPRINT_REGULAR'] = True
    
    # 创建必要的目录
    create_directories()


def create_directories():
    """创建必要的目录结构"""
    directories = [
        './uploads',
        './processed', 
        './temp',
        './logs',
        './models',
        './models/embedding',
        './models/ocr',
        './models/ocr/det',
        './models/ocr/rec', 
        './models/ocr/cls',
        './models/ocr/table',
        './models/ocr/chart',
        './models/image',
        './models/text'
    ]
    
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)


def configure_logging(app):
    """配置日志系统"""
    if not app.debug:
        # 生产环境日志配置
        log_dir = Path('./logs')
        log_dir.mkdir(exist_ok=True)
        
        # 文件处理器
        file_handler = logging.FileHandler(log_dir / 'app.log', encoding='utf-8')
        file_handler.setLevel(logging.INFO)
        
        # 日志格式
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        file_handler.setFormatter(formatter)
        
        # 添加到应用日志器
        app.logger.addHandler(file_handler)
        app.logger.setLevel(logging.INFO)
        app.logger.info('PDF智能文件管理系统启动')


def register_blueprints(app):
    """注册蓝图"""
    # 注册文件管理路由
    app.register_blueprint(file_bp)
    
    # 注册智能检索路由
    app.register_blueprint(search_bp)
    
    app.logger.info('所有蓝图注册完成')


def configure_cors(app):
    """配置跨域资源共享"""
    CORS(app, resources={
        r"/api/*": {
            "origins": ["*"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
            "allow_headers": ["Content-Type", "Authorization"]
        }
    })


def register_error_handlers(app):
    """注册错误处理器"""
    
    @app.errorhandler(404)
    def not_found_error(error):
        """404错误处理"""
        if request.path.startswith('/api/'):
            return jsonify({
                'success': False,
                'message': '接口不存在',
                'code': 404
            }), 404
        else:
            return render_template('index.html'), 200  # SPA应用，统一返回index.html
    
    @app.errorhandler(500)
    def internal_error(error):
        """500错误处理"""
        app.logger.error(f'服务器内部错误: {error}')
        if request.path.startswith('/api/'):
            return jsonify({
                'success': False,
                'message': '服务器内部错误',
                'code': 500
            }), 500
        else:
            return render_template('index.html'), 200
    
    @app.errorhandler(413)
    def request_entity_too_large(error):
        """文件过大错误处理"""
        return jsonify({
            'success': False,
            'message': '上传文件过大，请确保文件小于100MB',
            'code': 413
        }), 413
    
    @app.errorhandler(400)
    def bad_request_error(error):
        """400错误处理"""
        return jsonify({
            'success': False,
            'message': '请求参数错误',
            'code': 400
        }), 400


def register_context_processors(app):
    """注册上下文处理器"""
    
    @app.context_processor
    def inject_system_info():
        """注入系统信息到模板上下文"""
        return {
            'system_name': 'PDF智能文件管理系统',
            'system_version': '1.0.0',
            'build_time': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }


def register_before_first_request(app):
    """注册首次请求前的处理"""
    # Flask 3.0+ 已经移除了 before_first_request 装饰器
    # 改为在应用创建时直接执行初始化任务
    app.logger.info('执行应用初始化')
    
    # 这里可以添加一些初始化任务
    # 比如检查数据库连接、初始化缓存等
    pass


# 路由定义
def register_routes(app):
    """注册主要路由"""
    
    @app.route('/')
    def index():
        """主页路由"""
        return render_template('index.html')
    
    @app.route('/health')
    def health_check():
        """健康检查接口"""
        return jsonify({
            'status': 'healthy',
            'timestamp': datetime.now().isoformat(),
            'version': '1.0.0'
        })
    
    @app.route('/api/system/info')
    def system_info():
        """系统信息接口"""
        return jsonify({
            'success': True,
            'data': {
                'name': 'PDF智能文件管理系统',
                'version': '1.0.0',
                'description': 'PDF文档智能检索和管理系统',
                'features': [
                    'PDF文件上传和管理',
                    '智能内容提取',
                    '语义搜索',
                    'GraphRAG检索',
                    '流式对话',
                    '多模态内容分析'
                ],
                'technology_stack': {
                    'backend': 'Python Flask',
                    'frontend': 'HTML5 + CSS3 + JavaScript',
                    'database': 'MySQL + Milvus + Neo4j',
                    'ai_models': 'DeepSeek API + Local Models'
                },
                'build_time': datetime.now().isoformat()
            }
        })
    
    # 静态文件路由
    @app.route('/static/<path:filename>')
    def static_files(filename):
        """静态文件服务"""
        return send_from_directory(app.static_folder, filename)


def main():
    """主函数"""
    print("="*60)
    print("PDF智能文件管理系统")
    print("版本: 1.0.0")
    print("启动时间:", datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    print("="*60)
    
    # 环境检查
    print("正在进行环境检查...")
    try:
        # 运行环境检查
        environment_success = asyncio.run(environment_check())
        
        if not environment_success:
            print("❌ 环境检查失败，部分功能可能无法正常使用")
            print("请检查日志文件 ./logs/environment_check.log 获取详细信息")
            print("⚠️  自动继续启动系统...")
        else:
            print("✅ 环境检查通过")
    
    except KeyboardInterrupt:
        print("\n系统启动已取消")
        return
    except Exception as e:
        print(f"❌ 环境检查过程中发生错误: {e}")
        print("⚠️  自动继续启动系统...")
    
    # 创建Flask应用
    app = create_app()
    
    # 注册路由
    register_routes(app)
    
    print("\n🚀 正在启动Web服务器...")
    print("访问地址: http://localhost:5001")
    print("API文档: http://localhost:5001/api/system/info")
    print("健康检查: http://localhost:5001/health")
    print("\n按 Ctrl+C 停止服务器")
    print("="*60)
    
    try:
        # 从环境变量获取配置
        host = os.environ.get('FLASK_HOST', '0.0.0.0')
        port = int(os.environ.get('FLASK_PORT', '5001'))
        debug = os.environ.get('FLASK_DEBUG', '1') == '1'
        
        # 启动Flask应用
        app.run(
            host=host,
            port=port,
            debug=debug,
            threaded=True,
            use_reloader=True
        )
    except KeyboardInterrupt:
        print("\n\n系统正在关闭...")
        print("感谢使用PDF智能文件管理系统！")
    except Exception as e:
        print(f"启动失败: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main() 