#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PDF智能文件管理系统启动脚本
提供简化的启动选项和环境检查
"""

import os
import sys
import argparse
from pathlib import Path


def check_python_version():
    """检查Python版本"""
    if sys.version_info < (3, 8):
        print("❌ 错误: 需要Python 3.8或更高版本")
        print(f"当前版本: {sys.version}")
        return False
    print(f"✅ Python版本检查通过: {sys.version}")
    return True


def check_dependencies():
    """检查关键依赖包"""
    required_packages = [
        'flask',
        'pymysql', 
        'redis',
        'pymilvus',
        'neo4j',
        'yaml',  # PyYAML包的导入名称是yaml
        'requests'
    ]
    
    missing_packages = []
    
    for package in required_packages:
        try:
            __import__(package)
            print(f"✅ {package} - 已安装")
        except ImportError:
            missing_packages.append(package)
            print(f"❌ {package} - 缺失")
    
    if missing_packages:
        print(f"\n缺失的依赖包: {', '.join(missing_packages)}")
        print("请运行: pip install -r requirements.txt")
        return False
    
    return True


def check_directories():
    """检查必要目录"""
    required_dirs = [
        'config',
        'app',
        'app/routes',
        'app/service', 
        'templates',
        'templates/html',
        'templates/css',
        'templates/js'
    ]
    
    for directory in required_dirs:
        path = Path(directory)
        if not path.exists():
            print(f"❌ 目录不存在: {directory}")
            return False
        print(f"✅ 目录检查通过: {directory}")
    
    return True


def check_config_files():
    """检查配置文件"""
    config_files = [
        'config/db.yaml',
        'config/model.yaml', 
        'config/config.yaml',
        'config/prompt.yaml'
    ]
    
    for config_file in config_files:
        path = Path(config_file)
        if not path.exists():
            print(f"❌ 配置文件不存在: {config_file}")
            return False
        print(f"✅ 配置文件检查通过: {config_file}")
    
    return True


def create_runtime_directories():
    """创建运行时目录"""
    runtime_dirs = [
        'uploads',
        'processed',
        'temp',
        'logs',
        'models'
    ]
    
    for directory in runtime_dirs:
        path = Path(directory)
        path.mkdir(parents=True, exist_ok=True)
        print(f"✅ 运行时目录: {directory}")


def main():
    """主函数"""
    parser = argparse.ArgumentParser(description='PDF智能文件管理系统启动脚本')
    parser.add_argument('--check-only', action='store_true', help='仅执行环境检查')
    parser.add_argument('--skip-check', action='store_true', help='跳过环境检查直接启动')
    parser.add_argument('--host', default='0.0.0.0', help='服务器地址 (默认: 0.0.0.0)')
    parser.add_argument('--port', type=int, default=5000, help='服务器端口 (默认: 5000)')
    parser.add_argument('--debug', action='store_true', help='启用调试模式')
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("PDF智能文件管理系统启动脚本")
    print("=" * 60)
    
    # 执行环境检查
    if not args.skip_check:
        print("\n🔍 正在执行环境检查...")
        
        checks = [
            ("Python版本", check_python_version),
            ("项目目录", check_directories),
            ("配置文件", check_config_files),
            ("Python依赖", check_dependencies)
        ]
        
        all_passed = True
        for check_name, check_func in checks:
            print(f"\n📋 检查 {check_name}:")
            if not check_func():
                all_passed = False
        
        if not all_passed:
            print("\n❌ 环境检查失败，请解决上述问题后重试")
            if not args.check_only:
                user_input = input("\n是否继续启动？(y/N): ").strip().lower()
                if user_input not in ['y', 'yes']:
                    sys.exit(1)
        else:
            print("\n✅ 所有环境检查通过！")
    
    # 如果只是检查，则退出
    if args.check_only:
        print("\n环境检查完成")
        return
    
    # 创建运行时目录
    print("\n📁 创建运行时目录...")
    create_runtime_directories()
    
    # 启动应用
    print(f"\n🚀 正在启动应用...")
    print(f"服务器地址: http://{args.host}:{args.port}")
    print("按 Ctrl+C 停止服务器")
    print("=" * 60)
    
    # 设置环境变量
    os.environ['FLASK_HOST'] = args.host
    os.environ['FLASK_PORT'] = str(args.port)
    if args.debug:
        os.environ['FLASK_DEBUG'] = '1'
    # 标记已经进行过环境检查，避免重复检查
    os.environ['SKIP_ENV_CHECK'] = '1'
    
    # 导入并启动主应用
    try:
        import app as main_app
        main_app.main()
    except ImportError as e:
        print(f"❌ 导入应用失败: {e}")
        print("请确保在项目根目录下运行此脚本")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\n系统正在关闭...")
        print("感谢使用PDF智能文件管理系统！")
    except Exception as e:
        print(f"❌ 启动失败: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main() 