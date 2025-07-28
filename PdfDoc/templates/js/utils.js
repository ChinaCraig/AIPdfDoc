/**
 * 工具函数库
 * 提供通用的工具函数和常量
 */

// 常量定义
const CONSTANTS = {
    API_BASE_URL: '/api',
    USER_ID: 1, // 简化处理，实际项目中从登录状态获取
    FILE_TYPES: {
        PDF: 'application/pdf'
    },
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
    NOTIFICATION_DURATION: 5000, // 5秒
    DEBOUNCE_DELAY: 300, // 300ms
    RETRY_ATTEMPTS: 3,
    STATUS_COLORS: {
        uploaded: '#22c55e',
        processing: '#f59e0b', 
        completed: '#3b82f6',
        failed: '#ef4444'
    }
};

// DOM操作工具
const DOM = {
    /**
     * 选择元素
     */
    $(selector) {
        return document.querySelector(selector);
    },

    /**
     * 选择所有匹配的元素
     */
    $$(selector) {
        return document.querySelectorAll(selector);
    },

    /**
     * 创建元素
     */
    create(tag, options = {}) {
        const element = document.createElement(tag);
        
        if (options.className) {
            element.className = options.className;
        }
        
        if (options.innerHTML) {
            element.innerHTML = options.innerHTML;
        }
        
        if (options.textContent) {
            element.textContent = options.textContent;
        }
        
        if (options.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
        }
        
        if (options.events) {
            Object.entries(options.events).forEach(([event, handler]) => {
                element.addEventListener(event, handler);
            });
        }
        
        return element;
    },

    /**
     * 添加CSS类
     */
    addClass(element, className) {
        if (element && className) {
            element.classList.add(className);
        }
    },

    /**
     * 移除CSS类
     */
    removeClass(element, className) {
        if (element && className) {
            element.classList.remove(className);
        }
    },

    /**
     * 切换CSS类
     */
    toggleClass(element, className) {
        if (element && className) {
            element.classList.toggle(className);
        }
    },

    /**
     * 检查是否包含CSS类
     */
    hasClass(element, className) {
        return element && element.classList.contains(className);
    },

    /**
     * 显示元素
     */
    show(element) {
        if (element) {
            element.style.display = '';
            this.removeClass(element, 'hidden');
        }
    },

    /**
     * 隐藏元素
     */
    hide(element) {
        if (element) {
            this.addClass(element, 'hidden');
        }
    },

    /**
     * 切换显示/隐藏
     */
    toggle(element) {
        if (element) {
            if (this.hasClass(element, 'hidden')) {
                this.show(element);
            } else {
                this.hide(element);
            }
        }
    }
};

// 字符串工具
const StringUtils = {
    /**
     * 格式化文件大小
     */
    formatFileSize(bytes) {
        if (!bytes) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    },

    /**
     * 格式化时间
     */
    formatTime(dateString) {
        if (!dateString) return '';
        
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        // 小于1分钟
        if (diff < 60000) {
            return '刚刚';
        }
        
        // 小于1小时
        if (diff < 3600000) {
            return Math.floor(diff / 60000) + '分钟前';
        }
        
        // 小于1天
        if (diff < 86400000) {
            return Math.floor(diff / 3600000) + '小时前';
        }
        
        // 小于7天
        if (diff < 604800000) {
            return Math.floor(diff / 86400000) + '天前';
        }
        
        // 格式化为日期
        return date.toLocaleDateString('zh-CN');
    },

    /**
     * 格式化响应时间
     */
    formatResponseTime(seconds) {
        if (!seconds) return '0s';
        
        if (seconds < 1) {
            return Math.round(seconds * 1000) + 'ms';
        }
        
        return seconds.toFixed(1) + 's';
    },

    /**
     * 截取文本
     */
    truncate(text, length = 50, suffix = '...') {
        if (!text || text.length <= length) {
            return text || '';
        }
        
        return text.substring(0, length) + suffix;
    },

    /**
     * 高亮关键词
     */
    highlight(text, keyword) {
        if (!text || !keyword) return text;
        
        const regex = new RegExp(`(${keyword})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    },

    /**
     * 生成随机ID
     */
    generateId(prefix = 'id') {
        return prefix + '_' + Math.random().toString(36).substr(2, 9);
    },

    /**
     * 转义HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// 数组工具
const ArrayUtils = {
    /**
     * 去重
     */
    unique(array) {
        return [...new Set(array)];
    },

    /**
     * 分块
     */
    chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    },

    /**
     * 分组
     */
    groupBy(array, key) {
        return array.reduce((groups, item) => {
            const value = item[key];
            groups[value] = groups[value] || [];
            groups[value].push(item);
            return groups;
        }, {});
    },

    /**
     * 排序
     */
    sortBy(array, key, desc = false) {
        return array.sort((a, b) => {
            const valueA = a[key];
            const valueB = b[key];
            
            if (valueA < valueB) return desc ? 1 : -1;
            if (valueA > valueB) return desc ? -1 : 1;
            return 0;
        });
    }
};

// 事件工具
const EventUtils = {
    /**
     * 防抖
     */
    debounce(func, delay = CONSTANTS.DEBOUNCE_DELAY) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    },

    /**
     * 节流
     */
    throttle(func, delay = 300) {
        let lastExec = 0;
        return function (...args) {
            const elapsed = Date.now() - lastExec;
            if (elapsed >= delay) {
                func.apply(this, args);
                lastExec = Date.now();
            }
        };
    },

    /**
     * 一次性事件监听
     */
    once(element, event, handler) {
        const onceHandler = (e) => {
            handler(e);
            element.removeEventListener(event, onceHandler);
        };
        element.addEventListener(event, onceHandler);
    },

    /**
     * 委托事件
     */
    delegate(container, selector, event, handler) {
        container.addEventListener(event, (e) => {
            if (e.target.matches(selector)) {
                handler(e);
            }
        });
    }
};

// 存储工具
const Storage = {
    /**
     * 设置本地存储
     */
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (e) {
            console.error('存储失败:', e);
            return false;
        }
    },

    /**
     * 获取本地存储
     */
    get(key, defaultValue = null) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : defaultValue;
        } catch (e) {
            console.error('读取存储失败:', e);
            return defaultValue;
        }
    },

    /**
     * 移除本地存储
     */
    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.error('移除存储失败:', e);
            return false;
        }
    },

    /**
     * 清空本地存储
     */
    clear() {
        try {
            localStorage.clear();
            return true;
        } catch (e) {
            console.error('清空存储失败:', e);
            return false;
        }
    },

    /**
     * 获取所有存储的键
     */
    keys() {
        return Object.keys(localStorage);
    }
};

// 验证工具
const Validator = {
    /**
     * 验证邮箱
     */
    isEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    },

    /**
     * 验证URL
     */
    isUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    /**
     * 验证文件类型
     */
    isValidFileType(file, allowedTypes) {
        return allowedTypes.includes(file.type);
    },

    /**
     * 验证文件大小
     */
    isValidFileSize(file, maxSize) {
        return file.size <= maxSize;
    },

    /**
     * 验证字符串长度
     */
    isValidLength(str, min = 0, max = Infinity) {
        const length = str ? str.length : 0;
        return length >= min && length <= max;
    },

    /**
     * 验证手机号
     */
    isPhone(phone) {
        const regex = /^1[3-9]\d{9}$/;
        return regex.test(phone);
    }
};

// 通知工具
const Notification = {
    container: null,

    /**
     * 初始化通知容器
     */
    init() {
        this.container = DOM.$('#notification-container');
        if (!this.container) {
            this.container = DOM.create('div', {
                attributes: { id: 'notification-container' },
                className: 'notification-container'
            });
            document.body.appendChild(this.container);
        }
    },

    /**
     * 显示通知
     */
    show(title, message, type = 'info', duration = CONSTANTS.NOTIFICATION_DURATION) {
        if (!this.container) {
            this.init();
        }

        const notification = DOM.create('div', {
            className: `notification ${type}`,
            innerHTML: `
                <div class="notification-icon">
                    <i class="fas fa-${this.getIcon(type)}"></i>
                </div>
                <div class="notification-content">
                    <div class="notification-title">${StringUtils.escapeHtml(title)}</div>
                    <div class="notification-message">${StringUtils.escapeHtml(message)}</div>
                </div>
                <button class="notification-close">
                    <i class="fas fa-times"></i>
                </button>
            `
        });

        // 添加关闭事件
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            this.remove(notification);
        });

        // 添加到容器
        this.container.appendChild(notification);

        // 显示动画
        setTimeout(() => {
            DOM.addClass(notification, 'show');
        }, 10);

        // 自动移除
        if (duration > 0) {
            setTimeout(() => {
                this.remove(notification);
            }, duration);
        }

        return notification;
    },

    /**
     * 移除通知
     */
    remove(notification) {
        DOM.removeClass(notification, 'show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    },

    /**
     * 获取图标
     */
    getIcon(type) {
        const icons = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        return icons[type] || icons.info;
    },

    /**
     * 成功通知
     */
    success(title, message, duration) {
        return this.show(title, message, 'success', duration);
    },

    /**
     * 错误通知
     */
    error(title, message, duration) {
        return this.show(title, message, 'error', duration);
    },

    /**
     * 警告通知
     */
    warning(title, message, duration) {
        return this.show(title, message, 'warning', duration);
    },

    /**
     * 信息通知
     */
    info(title, message, duration) {
        return this.show(title, message, 'info', duration);
    }
};

// 加载指示器
const Loading = {
    overlay: null,

    /**
     * 显示加载
     */
    show(message = '处理中...') {
        if (!this.overlay) {
            this.overlay = DOM.create('div', {
                attributes: { id: 'loading-overlay' },
                className: 'loading-overlay',
                innerHTML: `
                    <div class="loading-spinner">
                        <div class="spinner"></div>
                        <p>${StringUtils.escapeHtml(message)}</p>
                    </div>
                `
            });
            document.body.appendChild(this.overlay);
        } else {
            this.overlay.querySelector('p').textContent = message;
        }

        DOM.addClass(this.overlay, 'active');
    },

    /**
     * 隐藏加载
     */
    hide() {
        if (this.overlay) {
            DOM.removeClass(this.overlay, 'active');
        }
    },

    /**
     * 更新消息
     */
    updateMessage(message) {
        if (this.overlay) {
            this.overlay.querySelector('p').textContent = message;
        }
    }
};

// 模态框工具
const Modal = {
    /**
     * 显示模态框
     */
    show(selector) {
        const modal = DOM.$(selector);
        if (modal) {
            DOM.addClass(modal, 'active');
            document.body.style.overflow = 'hidden';
        }
    },

    /**
     * 隐藏模态框
     */
    hide(selector) {
        const modal = DOM.$(selector);
        if (modal) {
            DOM.removeClass(modal, 'active');
            document.body.style.overflow = '';
        }
    },

    /**
     * 初始化模态框事件
     */
    init() {
        // 点击关闭按钮
        EventUtils.delegate(document, '.modal-close', 'click', (e) => {
            const modal = e.target.closest('.modal');
            if (modal) {
                this.hide('#' + modal.id);
            }
        });

        // 点击背景关闭
        EventUtils.delegate(document, '.modal', 'click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hide('#' + e.target.id);
            }
        });

        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const activeModal = DOM.$('.modal.active');
                if (activeModal) {
                    this.hide('#' + activeModal.id);
                }
            }
        });
    }
};

// URL工具
const URLUtils = {
    /**
     * 获取URL参数
     */
    getParams() {
        const params = new URLSearchParams(window.location.search);
        const result = {};
        for (const [key, value] of params) {
            result[key] = value;
        }
        return result;
    },

    /**
     * 获取单个URL参数
     */
    getParam(name, defaultValue = null) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name) || defaultValue;
    },

    /**
     * 设置URL参数
     */
    setParam(name, value) {
        const url = new URL(window.location);
        url.searchParams.set(name, value);
        window.history.replaceState({}, '', url);
    },

    /**
     * 移除URL参数
     */
    removeParam(name) {
        const url = new URL(window.location);
        url.searchParams.delete(name);
        window.history.replaceState({}, '', url);
    }
};

// 剪贴板工具
const Clipboard = {
    /**
     * 复制文本到剪贴板
     */
    async copy(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            // 降级方案
            try {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const result = document.execCommand('copy');
                document.body.removeChild(textArea);
                return result;
            } catch (e) {
                console.error('复制失败:', e);
                return false;
            }
        }
    },

    /**
     * 读取剪贴板文本
     */
    async read() {
        try {
            return await navigator.clipboard.readText();
        } catch (err) {
            console.error('读取剪贴板失败:', err);
            return null;
        }
    }
};

// 错误处理工具
const ErrorHandler = {
    /**
     * 处理API错误
     */
    handleApiError(error, showNotification = true) {
        let message = '发生未知错误';
        
        if (error.response) {
            // 服务器响应错误
            const data = error.response.data;
            message = data?.message || `服务器错误 (${error.response.status})`;
        } else if (error.request) {
            // 网络错误
            message = '网络连接失败，请检查网络设置';
        } else {
            // 其他错误
            message = error.message || '请求失败';
        }

        console.error('API错误:', error);

        if (showNotification) {
            Notification.error('操作失败', message);
        }

        return message;
    },

    /**
     * 全局错误处理
     */
    init() {
        // 捕获未处理的Promise拒绝
        window.addEventListener('unhandledrejection', (event) => {
            console.error('未处理的Promise拒绝:', event.reason);
            // 只在开发环境显示错误通知
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                Notification.error('系统错误', '系统发生错误，请稍后重试');
            }
        });

        // 捕获JavaScript错误
        window.addEventListener('error', (event) => {
            console.error('JavaScript错误:', event.error);
            // 避免不必要的错误提示，只记录到控制台
        });
    }
};

// 导出工具
window.Utils = {
    CONSTANTS,
    DOM,
    StringUtils,
    ArrayUtils,
    EventUtils,
    Storage,
    Validator,
    Notification,
    Loading,
    Modal,
    URLUtils,
    Clipboard,
    ErrorHandler,
    /**
     * 初始化所有工具
     */
    init() {
        Notification.init();
        Modal.init();
        ErrorHandler.init();
    }
};

// 确保DOM方法直接可用
window.Utils.DOM = DOM;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    window.Utils.init();
}); 