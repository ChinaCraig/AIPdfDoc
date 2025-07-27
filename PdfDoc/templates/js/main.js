/**
 * 主应用程序
 * 负责整体应用的初始化和标签页管理
 */

class MainApp {
    constructor() {
        this.currentTab = 'file-management';
        this.isInitialized = false;
        this.modules = {};
        
        this.init();
    }

    /**
     * 初始化应用程序
     */
    async init() {
        try {
            // 显示加载状态
            this.showLoadingState();
            
            // 绑定事件
            this.bindEvents();
            
            // 初始化标签页
            this.initTabs();
            
            // 加载用户偏好设置
            this.loadUserPreferences();
            
            // 初始化各个模块
            await this.initModules();
            
            // 标记为已初始化
            this.isInitialized = true;
            
            // 隐藏加载状态
            this.hideLoadingState();
            
            console.log('PDF智能文件管理系统初始化完成');
            
        } catch (error) {
            console.error('应用程序初始化失败:', error);
            this.showInitError(error);
        }
    }

    /**
     * 绑定全局事件
     */
    bindEvents() {
        // 标签页切换
        const navItems = Utils.DOM.$$('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = item.dataset.tab;
                if (tabId) {
                    this.switchTab(tabId);
                }
            });
        });

        // 全局快捷键
        document.addEventListener('keydown', (e) => {
            this.handleGlobalKeydown(e);
        });

        // 窗口大小变化
        window.addEventListener('resize', Utils.EventUtils.throttle(() => {
            this.handleWindowResize();
        }, 250));

        // 页面可见性变化
        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange();
        });

        // 在线/离线状态
        window.addEventListener('online', () => {
            this.handleNetworkStatusChange(true);
        });

        window.addEventListener('offline', () => {
            this.handleNetworkStatusChange(false);
        });

        // 页面卸载前
        window.addEventListener('beforeunload', (e) => {
            this.handleBeforeUnload(e);
        });
    }

    /**
     * 初始化标签页
     */
    initTabs() {
        // 从URL参数或localStorage获取初始标签页
        const urlTab = Utils.URLUtils.getParam('tab');
        const savedTab = Utils.Storage.get('current_tab');
        const initialTab = urlTab || savedTab || 'file-management';
        
        this.switchTab(initialTab);
    }

    /**
     * 切换标签页
     */
    switchTab(tabId) {
        if (tabId === this.currentTab) return;

        // 隐藏当前标签页
        const currentTabContent = Utils.DOM.$(`#${this.currentTab}`);
        if (currentTabContent) {
            Utils.DOM.removeClass(currentTabContent, 'active');
        }

        // 移除当前导航项的激活状态
        const currentNavItem = Utils.DOM.$(`.nav-item[data-tab="${this.currentTab}"]`);
        if (currentNavItem) {
            Utils.DOM.removeClass(currentNavItem, 'active');
        }

        // 显示新标签页
        const newTabContent = Utils.DOM.$(`#${tabId}`);
        if (newTabContent) {
            Utils.DOM.addClass(newTabContent, 'active');
        }

        // 激活新导航项
        const newNavItem = Utils.DOM.$(`.nav-item[data-tab="${tabId}"]`);
        if (newNavItem) {
            Utils.DOM.addClass(newNavItem, 'active');
        }

        // 更新当前标签页
        this.currentTab = tabId;

        // 保存到localStorage和URL
        Utils.Storage.set('current_tab', tabId);
        Utils.URLUtils.setParam('tab', tabId);

        // 触发标签页切换事件
        this.onTabSwitch(tabId);

        console.log(`切换到标签页: ${tabId}`);
    }

    /**
     * 标签页切换回调
     */
    onTabSwitch(tabId) {
        switch (tabId) {
            case 'file-management':
                // 刷新文件列表
                if (window.fileManager) {
                    window.fileManager.refreshFileList();
                }
                break;
                
            case 'intelligent-search':
                // 聊天页面激活时的处理
                if (window.chatManager) {
                    // 更新可用文件列表
                    window.chatManager.loadAvailableFiles();
                }
                break;
                
            case 'analytics':
                // 加载统计数据
                this.loadAnalyticsData();
                break;
        }
    }

    /**
     * 初始化模块
     */
    async initModules() {
        try {
            // 等待DOM完全加载
            await this.waitForDOM();
            
            // 初始化各个模块（模块在各自的文件中已经初始化）
            this.modules = {
                fileManager: window.fileManager,
                chatManager: window.chatManager
            };
            
            console.log('所有模块初始化完成');
            
        } catch (error) {
            console.error('模块初始化失败:', error);
            throw error;
        }
    }

    /**
     * 等待DOM元素就绪
     */
    waitForDOM() {
        return new Promise((resolve) => {
            if (document.readyState === 'complete') {
                resolve();
            } else {
                window.addEventListener('load', resolve);
            }
        });
    }

    /**
     * 加载用户偏好设置
     */
    loadUserPreferences() {
        // 主题设置
        const theme = Utils.Storage.get('theme', 'light');
        this.setTheme(theme);

        // 语言设置
        const language = Utils.Storage.get('language', 'zh-CN');
        this.setLanguage(language);

        // 视图模式
        const viewMode = Utils.Storage.get('file_view_mode', 'list');
        if (window.fileManager) {
            window.fileManager.viewMode = viewMode;
        }
    }

    /**
     * 设置主题
     */
    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        Utils.Storage.set('theme', theme);
    }

    /**
     * 设置语言
     */
    setLanguage(language) {
        document.documentElement.setAttribute('lang', language);
        Utils.Storage.set('language', language);
    }

    /**
     * 加载统计数据
     */
    async loadAnalyticsData() {
        try {
            Utils.Loading.show('加载统计数据...');

            // 获取搜索分析数据
            const analyticsResponse = await API.SearchAPI.getSearchAnalytics(7);
            
            // 获取文件统计
            const filesResponse = await API.FileAPI.getFileList(1, 1);

            if (analyticsResponse.success && filesResponse.success) {
                this.renderAnalyticsData(analyticsResponse.data, filesResponse.data);
            }

        } catch (error) {
            console.error('加载统计数据失败:', error);
            Utils.Notification.error('加载失败', '无法加载统计数据');
        } finally {
            Utils.Loading.hide();
        }
    }

    /**
     * 渲染统计数据
     */
    renderAnalyticsData(analytics, filesData) {
        // 更新统计卡片
        const totalFilesElement = Utils.DOM.$('#total-files');
        if (totalFilesElement) {
            totalFilesElement.textContent = filesData.pagination?.total || 0;
        }

        const totalSearchesElement = Utils.DOM.$('#total-searches');
        if (totalSearchesElement) {
            totalSearchesElement.textContent = analytics.search_count || 0;
        }

        const totalSessionsElement = Utils.DOM.$('#total-sessions');
        if (totalSessionsElement) {
            totalSessionsElement.textContent = analytics.active_sessions || 0;
        }

        const avgResponseTimeElement = Utils.DOM.$('#avg-response-time');
        if (avgResponseTimeElement) {
            avgResponseTimeElement.textContent = analytics.avg_response_time + 's' || '0s';
        }

        // 渲染热门查询
        this.renderPopularQueries(analytics.popular_queries || []);
    }

    /**
     * 渲染热门查询
     */
    renderPopularQueries(queries) {
        const container = Utils.DOM.$('#popular-queries');
        if (!container) return;

        if (queries.length === 0) {
            container.innerHTML = '<p class="text-gray-500">暂无查询记录</p>';
            return;
        }

        let html = '';
        queries.forEach(query => {
            html += `
                <div class="query-item">
                    <span class="query-text">${Utils.StringUtils.escapeHtml(query.search_query)}</span>
                    <span class="query-count">${query.count}</span>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    /**
     * 处理全局快捷键
     */
    handleGlobalKeydown(e) {
        // Ctrl/Cmd + 数字键切换标签页
        if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '3') {
            e.preventDefault();
            const tabIndex = parseInt(e.key) - 1;
            const tabs = ['file-management', 'intelligent-search', 'analytics'];
            if (tabs[tabIndex]) {
                this.switchTab(tabs[tabIndex]);
            }
        }

        // Ctrl/Cmd + U 上传文件
        if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
            e.preventDefault();
            if (this.currentTab === 'file-management' && window.fileManager) {
                window.fileManager.showUploadModal();
            }
        }

        // Ctrl/Cmd + N 新建对话
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            if (this.currentTab === 'intelligent-search' && window.chatManager) {
                window.chatManager.createNewSession();
            }
        }

        // ESC 关闭模态框
        if (e.key === 'Escape') {
            const activeModal = Utils.DOM.$('.modal.active');
            if (activeModal) {
                Utils.Modal.hide('#' + activeModal.id);
            }
        }
    }

    /**
     * 处理窗口大小变化
     */
    handleWindowResize() {
        // 响应式处理
        const width = window.innerWidth;
        
        if (width < 768) {
            document.body.classList.add('mobile');
        } else {
            document.body.classList.remove('mobile');
        }

        // 通知各个模块窗口大小变化
        if (this.modules.chatManager) {
            // 聊天消息区域需要重新计算高度
            const chatMessages = Utils.DOM.$('#chat-messages');
            if (chatMessages) {
                // 触发滚动到底部
                setTimeout(() => {
                    if (this.modules.chatManager.scrollToBottom) {
                        this.modules.chatManager.scrollToBottom();
                    }
                }, 100);
            }
        }
    }

    /**
     * 处理页面可见性变化
     */
    handleVisibilityChange() {
        if (document.hidden) {
            // 页面隐藏时暂停某些操作
            if (this.modules.fileManager) {
                this.modules.fileManager.stopAutoRefresh();
            }
        } else {
            // 页面显示时恢复操作
            if (this.modules.fileManager) {
                this.modules.fileManager.startAutoRefresh();
                // 刷新数据
                if (this.currentTab === 'file-management') {
                    this.modules.fileManager.refreshFileList();
                }
            }
        }
    }

    /**
     * 处理网络状态变化
     */
    handleNetworkStatusChange(isOnline) {
        if (isOnline) {
            Utils.Notification.success('网络连接', '网络连接已恢复');
            // 恢复自动刷新等功能
            if (this.modules.fileManager) {
                this.modules.fileManager.startAutoRefresh();
            }
        } else {
            Utils.Notification.warning('网络断开', '网络连接已断开，部分功能可能无法使用');
            // 停止自动刷新等功能
            if (this.modules.fileManager) {
                this.modules.fileManager.stopAutoRefresh();
            }
        }
    }

    /**
     * 处理页面卸载前
     */
    handleBeforeUnload(e) {
        // 如果有未完成的操作，提示用户
        if (this.modules.chatManager && this.modules.chatManager.isStreaming) {
            e.preventDefault();
            e.returnValue = '正在进行智能检索，确定要离开吗？';
            return e.returnValue;
        }

        // 保存当前状态
        this.saveCurrentState();
    }

    /**
     * 保存当前状态
     */
    saveCurrentState() {
        const state = {
            currentTab: this.currentTab,
            timestamp: Date.now()
        };

        Utils.Storage.set('app_state', state);
    }

    /**
     * 显示加载状态
     */
    showLoadingState() {
        Utils.Loading.show('正在初始化系统...');
    }

    /**
     * 隐藏加载状态
     */
    hideLoadingState() {
        Utils.Loading.hide();
    }

    /**
     * 显示初始化错误
     */
    showInitError(error) {
        Utils.Loading.hide();
        
        const errorMessage = `
            <div class="init-error">
                <h2>系统初始化失败</h2>
                <p>错误信息：${Utils.StringUtils.escapeHtml(error.message)}</p>
                <p>请刷新页面重试，或联系系统管理员。</p>
                <button class="btn btn-primary" onclick="window.location.reload()">
                    <i class="fas fa-refresh"></i> 刷新页面
                </button>
            </div>
        `;

        document.body.innerHTML = errorMessage;
    }

    /**
     * 获取系统信息
     */
    getSystemInfo() {
        return {
            version: '1.0.0',
            buildTime: new Date().toISOString(),
            userAgent: navigator.userAgent,
            currentTab: this.currentTab,
            isInitialized: this.isInitialized,
            modules: Object.keys(this.modules),
            storage: {
                localStorage: !!window.localStorage,
                sessionStorage: !!window.sessionStorage
            },
            api: {
                fetch: !!window.fetch,
                fileReader: !!window.FileReader
            }
        };
    }

    /**
     * 清理资源
     */
    cleanup() {
        // 停止自动刷新
        if (this.modules.fileManager) {
            this.modules.fileManager.destroy();
        }

        // 取消所有API请求
        if (window.API && window.API.Interceptor) {
            window.API.Interceptor.cancelAll();
        }

        // 清理事件监听器
        // （大部分事件监听器会随着页面卸载自动清理）

        console.log('应用程序资源清理完成');
    }
}

// 全局应用实例
window.mainApp = null;

// 应用程序入口点
document.addEventListener('DOMContentLoaded', () => {
    // 创建主应用实例
    window.mainApp = new MainApp();
    
    // 开发模式下将应用实例暴露到控制台
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        window.debugApp = {
            app: window.mainApp,
            utils: window.Utils,
            api: window.API,
            fileManager: window.fileManager,
            chatManager: window.chatManager
        };
        console.log('开发模式：调试对象已挂载到 window.debugApp');
    }
});

// 页面卸载时清理资源
window.addEventListener('beforeunload', () => {
    if (window.mainApp) {
        window.mainApp.cleanup();
    }
}); 