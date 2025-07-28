/**
 * 聊天模块
 * 处理智能检索对话功能
 */

class ChatManager {
    constructor() {
        this.currentSessionId = null;
        this.sessions = [];
        this.messages = [];
        this.isStreaming = false;
        this.selectedFiles = [];
        this.suggestions = [];
        this.typingTimeout = null;
        
        this.init();
    }

    /**
     * 初始化聊天管理器
     */
    init() {
        this.bindEvents();
        this.loadSessions();
        this.loadAvailableFiles();
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 新建对话按钮
        const newChatBtn = Utils.DOM.$('#btn-new-chat');
        if (newChatBtn) {
            newChatBtn.addEventListener('click', () => this.createNewSession());
        }

        // 发送消息按钮
        const sendBtn = Utils.DOM.$('#btn-send-message');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }

        // 聊天输入框
        const chatInput = Utils.DOM.$('#chat-input');
        if (chatInput) {
            // 回车发送消息
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

            // 输入时获取建议
            const debouncedSuggestion = Utils.EventUtils.debounce((e) => {
                const query = e.target.value.trim();
                if (query.length > 2) {
                    this.getSearchSuggestions(query);
                } else {
                    this.clearSuggestions();
                }
            }, 500);

            chatInput.addEventListener('input', debouncedSuggestion);

            // 自动调整高度
            chatInput.addEventListener('input', () => {
                this.autoResizeTextarea(chatInput);
            });
        }

        // 语音输入按钮
        const voiceBtn = Utils.DOM.$('#btn-voice-input');
        if (voiceBtn) {
            voiceBtn.addEventListener('click', () => this.toggleVoiceInput());
        }

        // 清空对话按钮
        const clearChatBtn = Utils.DOM.$('#btn-clear-chat');
        if (clearChatBtn) {
            clearChatBtn.addEventListener('click', () => this.clearCurrentChat());
        }

        // 导出对话按钮
        const downloadChatBtn = Utils.DOM.$('#btn-download-chat');
        if (downloadChatBtn) {
            downloadChatBtn.addEventListener('click', () => this.downloadChatHistory());
        }

        // 文件选择器
        const fileSelector = Utils.DOM.$('#search-files');
        if (fileSelector) {
            fileSelector.addEventListener('change', (e) => {
                const selected = Array.from(e.target.selectedOptions).map(option => parseInt(option.value)).filter(id => !isNaN(id));
                this.selectedFiles = selected;
                this.updateFileSelectionStatus();
            });
        }

        // 会话列表事件委托
        this.bindSessionListEvents();
        
        // 建议点击事件
        this.bindSuggestionEvents();
    }

    /**
     * 绑定会话列表事件
     */
    bindSessionListEvents() {
        const sessionList = Utils.DOM.$('#session-list');
        if (!sessionList) return;

        // 会话项点击
        Utils.EventUtils.delegate(sessionList, '.session-item', 'click', (e) => {
            const sessionId = parseInt(e.currentTarget.dataset.sessionId);
            this.switchSession(sessionId);
        });

        // 会话删除
        Utils.EventUtils.delegate(sessionList, '.btn-delete-session', 'click', (e) => {
            e.stopPropagation();
            const sessionId = parseInt(e.target.dataset.sessionId);
            this.deleteSession(sessionId);
        });

        // 会话重命名
        Utils.EventUtils.delegate(sessionList, '.btn-rename-session', 'click', (e) => {
            e.stopPropagation();
            const sessionId = parseInt(e.target.dataset.sessionId);
            this.renameSession(sessionId);
        });
    }

    /**
     * 绑定建议事件
     */
    bindSuggestionEvents() {
        const suggestions = Utils.DOM.$('#suggestions');
        if (!suggestions) return;

        Utils.EventUtils.delegate(suggestions, '.suggestion-item', 'click', (e) => {
            const text = e.target.textContent;
            const chatInput = Utils.DOM.$('#chat-input');
            if (chatInput) {
                chatInput.value = text;
                chatInput.focus();
                this.clearSuggestions();
            }
        });
    }

    /**
     * 创建新会话
     */
    async createNewSession() {
        try {
            Utils.Loading.show('创建新对话...');

            const sessionName = `对话${this.sessions.length + 1}`;
            const response = await API.SearchAPI.createSession(sessionName);

            if (response.success) {
                const sessionData = response.data;
                this.sessions.unshift(sessionData);
                this.renderSessionList();
                this.switchSession(sessionData.session_id);
                
                Utils.Notification.success('创建成功', '新对话已创建');
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('创建会话失败:', error);
            Utils.Notification.error('创建失败', error.message);
        } finally {
            Utils.Loading.hide();
        }
    }

    /**
     * 加载会话列表
     */
    async loadSessions() {
        try {
            const response = await API.SearchAPI.getUserSessions();
            if (response.success) {
                this.sessions = response.data.sessions;
                this.renderSessionList();
                
                // 如果有会话，选择第一个
                if (this.sessions.length > 0) {
                    this.switchSession(this.sessions[0].id);
                } else {
                    // 没有会话时创建一个默认会话
                    await this.createNewSession();
                }
            }
        } catch (error) {
            console.error('加载会话列表失败:', error);
            // 创建默认会话
            await this.createNewSession();
        }
    }

    /**
     * 渲染会话列表
     */
    renderSessionList() {
        const sessionList = Utils.DOM.$('#session-list');
        if (!sessionList) return;

        if (this.sessions.length === 0) {
            sessionList.innerHTML = `
                <div class="session-list-empty">
                    <p>暂无对话记录</p>
                </div>
            `;
            return;
        }

        let html = '';
        this.sessions.forEach(session => {
            const isActive = session.id === this.currentSessionId;
            const time = Utils.StringUtils.formatTime(session.created_at);
            
            html += `
                <div class="session-item ${isActive ? 'active' : ''}" data-session-id="${session.id}">
                    <div class="session-content">
                        <div class="session-name" title="${Utils.StringUtils.escapeHtml(session.session_name)}">
                            ${Utils.StringUtils.truncate(session.session_name, 15)}
                        </div>
                        <div class="session-time">${time}</div>
                    </div>
                    <div class="session-actions">
                        <button class="btn btn-sm btn-rename-session" data-session-id="${session.id}" title="重命名">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger btn-delete-session" data-session-id="${session.id}" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        sessionList.innerHTML = html;
    }

    /**
     * 切换会话
     */
    async switchSession(sessionId) {
        if (sessionId === this.currentSessionId) return;

        this.currentSessionId = sessionId;
        
        // 更新会话列表UI
        this.renderSessionList();
        
        // 更新会话标题
        const session = this.sessions.find(s => s.id === sessionId);
        if (session) {
            this.updateSessionTitle(session.session_name);
        }
        
        // 加载聊天历史
        await this.loadChatHistory();
    }

    /**
     * 更新会话标题
     */
    updateSessionTitle(sessionName) {
        const titleElement = Utils.DOM.$('#current-session-name');
        if (titleElement) {
            titleElement.textContent = sessionName;
        }
    }

    /**
     * 加载聊天历史
     */
    async loadChatHistory() {
        if (!this.currentSessionId) return;

        try {
            this.updateChatStatus('加载历史记录...');

            const response = await API.SearchAPI.getChatHistory(this.currentSessionId);
            if (response.success) {
                this.messages = response.data.messages;
                this.renderChatMessages();
                this.updateChatStatus('准备就绪');
            }
        } catch (error) {
            console.error('加载聊天历史失败:', error);
            this.updateChatStatus('加载失败');
        }
    }

    /**
     * 渲染聊天消息
     */
    renderChatMessages() {
        const chatMessages = Utils.DOM.$('#chat-messages');
        if (!chatMessages) return;

        if (this.messages.length === 0) {
            this.showWelcomeMessage();
            return;
        }

        let html = '';
        this.messages.forEach(message => {
            html += this.renderMessage(message);
        });

        chatMessages.innerHTML = html;
        this.scrollToBottom();
    }

    /**
     * 显示欢迎消息
     */
    showWelcomeMessage() {
        const chatMessages = Utils.DOM.$('#chat-messages');
        if (!chatMessages) return;

        chatMessages.innerHTML = `
            <div class="welcome-message">
                <div class="assistant-avatar">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="message-content">
                    <h4>欢迎使用PDF智能检索系统！</h4>
                    <p>我可以帮助您：</p>
                    <ul>
                        <li>📄 搜索和分析PDF文档内容</li>
                        <li>📊 提取表格和图表信息</li>
                        <li>🔍 智能问答和知识检索</li>
                        <li>📝 生成文档摘要和要点</li>
                    </ul>
                    <p>请先上传PDF文件，然后向我提问吧！</p>
                </div>
            </div>
        `;
    }

    /**
     * 渲染单条消息
     */
    renderMessage(message) {
        const isUser = message.message_type === 'user';
        const time = Utils.StringUtils.formatTime(message.created_at);
        
        if (isUser) {
            return `
                <div class="message-item user">
                    <div class="user-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="message-content">
                        <div class="message-text">${Utils.StringUtils.escapeHtml(message.message_content)}</div>
                        <div class="message-time">${time}</div>
                    </div>
                </div>
            `;
        } else {
            const sources = message.response_sources ? JSON.parse(message.response_sources) : [];
            const processingTime = message.processing_time ? Utils.StringUtils.formatResponseTime(message.processing_time) : '';
            
            return `
                <div class="message-item assistant">
                    <div class="assistant-avatar">
                        <i class="fas fa-robot"></i>
                    </div>
                    <div class="message-content">
                        <div class="message-text">${this.formatAssistantMessage(message.message_content)}</div>
                        ${this.renderMessageSources(sources)}
                        <div class="message-meta">
                            <span class="message-time">${time}</span>
                            ${processingTime ? `<span class="response-time">响应时间: ${processingTime}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }
    }

    /**
     * 格式化助手消息
     */
    formatAssistantMessage(content) {
        // 简单的Markdown格式化
        let formatted = Utils.StringUtils.escapeHtml(content);
        
        // 代码块
        formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
        
        // 加粗
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        
        // 斜体
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // 换行
        formatted = formatted.replace(/\n/g, '<br>');
        
        return formatted;
    }

    /**
     * 渲染消息来源
     */
    renderMessageSources(sources) {
        if (!sources || sources.length === 0) return '';

        let html = '<div class="message-sources"><h5>信息来源：</h5><ul>';
        sources.forEach(source => {
            const pages = source.pages.join(', ');
            html += `<li><strong>${Utils.StringUtils.escapeHtml(source.file_name)}</strong> (第${pages}页)</li>`;
        });
        html += '</ul></div>';

        return html;
    }

    /**
     * 发送消息
     */
    async sendMessage() {
        const chatInput = Utils.DOM.$('#chat-input');
        if (!chatInput) return;

        const query = chatInput.value.trim();
        if (!query) return;

        if (this.isStreaming) {
            Utils.Notification.warning('请等待', '请等待当前回答完成');
            return;
        }

        if (!this.currentSessionId) {
            await this.createNewSession();
            if (!this.currentSessionId) return;
        }

        // 清空输入框
        chatInput.value = '';
        this.autoResizeTextarea(chatInput);
        this.clearSuggestions();

        // 添加用户消息到界面
        this.addMessageToUI({
            message_type: 'user',
            message_content: query,
            created_at: new Date().toISOString()
        });

        // 显示输入状态
        this.showTypingIndicator();
        this.updateChatStatus('正在思考...');

        try {
            this.isStreaming = true;
            
            // 使用流式API
            let assistantMessage = '';
            let sources = [];
            
            await API.SearchAPI.searchStream(
                this.currentSessionId,
                query,
                this.selectedFiles,
                (data) => {
                    switch (data.type) {
                        case 'start':
                            this.updateChatStatus('开始检索...');
                            break;
                        case 'progress':
                            this.updateChatStatus(data.message);
                            break;
                        case 'content':
                            assistantMessage += data.content;
                            this.updateStreamingMessage(assistantMessage);
                            break;
                        case 'sources':
                            sources = data.sources;
                            break;
                        case 'done':
                            this.hideTypingIndicator();
                            this.finalizeStreamingMessage(assistantMessage, sources);
                            this.updateChatStatus('准备就绪');
                            break;
                        case 'error':
                            this.hideTypingIndicator();
                            this.showErrorMessage(data.message);
                            this.updateChatStatus('发生错误');
                            break;
                    }
                }
            );

        } catch (error) {
            console.error('发送消息失败:', error);
            this.hideTypingIndicator();
            this.showErrorMessage(error.message);
            this.updateChatStatus('发送失败');
        } finally {
            this.isStreaming = false;
        }
    }

    /**
     * 添加消息到UI
     */
    addMessageToUI(message) {
        const chatMessages = Utils.DOM.$('#chat-messages');
        if (!chatMessages) return;

        // 如果是第一条消息，清除欢迎信息
        if (chatMessages.querySelector('.welcome-message')) {
            chatMessages.innerHTML = '';
        }

        const messageHtml = this.renderMessage(message);
        chatMessages.insertAdjacentHTML('beforeend', messageHtml);
        this.scrollToBottom();
    }

    /**
     * 显示输入指示器
     */
    showTypingIndicator() {
        const chatMessages = Utils.DOM.$('#chat-messages');
        if (!chatMessages) return;

        const typingHtml = `
            <div class="typing-indicator" id="typing-indicator">
                <div class="assistant-avatar">
                    <i class="fas fa-robot"></i>
                </div>
                <div class="typing-dots">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;

        chatMessages.insertAdjacentHTML('beforeend', typingHtml);
        this.scrollToBottom();
    }

    /**
     * 隐藏输入指示器
     */
    hideTypingIndicator() {
        const typingIndicator = Utils.DOM.$('#typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    /**
     * 更新流式消息
     */
    updateStreamingMessage(content) {
        let streamingMessage = Utils.DOM.$('#streaming-message');
        
        if (!streamingMessage) {
            // 创建流式消息容器
            const chatMessages = Utils.DOM.$('#chat-messages');
            if (!chatMessages) return;

            const messageHtml = `
                <div class="message-item assistant" id="streaming-message">
                    <div class="assistant-avatar">
                        <i class="fas fa-robot"></i>
                    </div>
                    <div class="message-content">
                        <div class="message-text" id="streaming-text"></div>
                    </div>
                </div>
            `;

            chatMessages.insertAdjacentHTML('beforeend', messageHtml);
            streamingMessage = Utils.DOM.$('#streaming-message');
        }

        const textElement = streamingMessage.querySelector('#streaming-text');
        if (textElement) {
            textElement.innerHTML = this.formatAssistantMessage(content);
        }

        this.scrollToBottom();
    }

    /**
     * 完成流式消息
     */
    finalizeStreamingMessage(content, sources) {
        const streamingMessage = Utils.DOM.$('#streaming-message');
        if (!streamingMessage) return;

        const messageContent = streamingMessage.querySelector('.message-content');
        if (messageContent) {
            const time = Utils.StringUtils.formatTime(new Date().toISOString());
            
            messageContent.innerHTML = `
                <div class="message-text">${this.formatAssistantMessage(content)}</div>
                ${this.renderMessageSources(sources)}
                <div class="message-meta">
                    <span class="message-time">${time}</span>
                </div>
            `;
        }

        streamingMessage.removeAttribute('id');
    }

    /**
     * 显示错误消息
     */
    showErrorMessage(errorMsg) {
        const chatMessages = Utils.DOM.$('#chat-messages');
        if (!chatMessages) return;

        const errorHtml = `
            <div class="message-item assistant error">
                <div class="assistant-avatar">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="message-content">
                    <div class="message-text">抱歉，处理您的问题时出现了错误：${Utils.StringUtils.escapeHtml(errorMsg)}</div>
                    <div class="message-time">${Utils.StringUtils.formatTime(new Date().toISOString())}</div>
                </div>
            </div>
        `;

        chatMessages.insertAdjacentHTML('beforeend', errorHtml);
        this.scrollToBottom();
    }

    /**
     * 滚动到底部
     */
    scrollToBottom() {
        const chatMessages = Utils.DOM.$('#chat-messages');
        if (chatMessages) {
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    /**
     * 更新聊天状态
     */
    updateChatStatus(status) {
        const statusElement = Utils.DOM.$('#chat-status');
        if (statusElement) {
            statusElement.textContent = status;
        }
    }

    /**
     * 自动调整文本框高度
     */
    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    /**
     * 获取搜索建议
     */
    async getSearchSuggestions(keyword) {
        try {
            const response = await API.SearchAPI.getSearchSuggestions(keyword, 5);
            if (response.success) {
                this.suggestions = response.data.suggestions;
                this.renderSuggestions();
            }
        } catch (error) {
            console.error('获取搜索建议失败:', error);
        }
    }

    /**
     * 渲染搜索建议
     */
    renderSuggestions() {
        const suggestionsContainer = Utils.DOM.$('#suggestions');
        if (!suggestionsContainer) return;

        if (this.suggestions.length === 0) {
            suggestionsContainer.innerHTML = '';
            return;
        }

        let html = '';
        this.suggestions.forEach(suggestion => {
            html += `<div class="suggestion-item">${Utils.StringUtils.escapeHtml(suggestion)}</div>`;
        });

        suggestionsContainer.innerHTML = html;
    }

    /**
     * 清除搜索建议
     */
    clearSuggestions() {
        const suggestionsContainer = Utils.DOM.$('#suggestions');
        if (suggestionsContainer) {
            suggestionsContainer.innerHTML = '';
        }
    }

    /**
     * 加载可用文件
     */
    async loadAvailableFiles() {
        try {
            const response = await API.FileAPI.getFileList(1, 100);
            if (response.success) {
                this.renderFileSelector(response.data.files);
            }
        } catch (error) {
            console.error('加载文件列表失败:', error);
        }
    }

    /**
     * 渲染文件选择器
     */
    renderFileSelector(files) {
        const fileSelector = Utils.DOM.$('#search-files');
        if (!fileSelector) return;

        let html = '<option value="">所有文件</option>';
        
        files.forEach(file => {
            if (file.process_status === 'completed') {
                html += `<option value="${file.id}">${Utils.StringUtils.escapeHtml(file.original_name)}</option>`;
            }
        });

        fileSelector.innerHTML = html;
    }

    /**
     * 更新文件选择状态
     */
    updateFileSelectionStatus() {
        const count = this.selectedFiles.length;
        const status = count === 0 ? '所有文件' : `已选择 ${count} 个文件`;
        
        // 这里可以更新UI显示选择状态
        console.log('文件选择状态:', status);
    }

    /**
     * 删除会话
     */
    async deleteSession(sessionId) {
        const result = confirm('确定要删除这个对话吗？删除后无法恢复。');
        if (!result) return;

        try {
            const response = await API.SearchAPI.deleteSession(sessionId);
            if (response.success) {
                this.sessions = this.sessions.filter(s => s.id !== sessionId);
                this.renderSessionList();
                
                if (sessionId === this.currentSessionId) {
                    // 如果删除的是当前会话，切换到其他会话或创建新会话
                    if (this.sessions.length > 0) {
                        this.switchSession(this.sessions[0].id);
                    } else {
                        await this.createNewSession();
                    }
                }
                
                Utils.Notification.success('删除成功', '对话已删除');
            }
        } catch (error) {
            console.error('删除会话失败:', error);
            Utils.Notification.error('删除失败', error.message);
        }
    }

    /**
     * 重命名会话
     */
    async renameSession(sessionId) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (!session) return;

        const newName = prompt('请输入新的对话名称：', session.session_name);
        if (!newName || !newName.trim()) return;

        try {
            const response = await API.SearchAPI.renameSession(sessionId, newName.trim());
            if (response.success) {
                session.session_name = newName.trim();
                this.renderSessionList();
                
                if (sessionId === this.currentSessionId) {
                    this.updateSessionTitle(newName.trim());
                }
                
                Utils.Notification.success('重命名成功', '对话已重命名');
            }
        } catch (error) {
            console.error('重命名会话失败:', error);
            Utils.Notification.error('重命名失败', error.message);
        }
    }

    /**
     * 清空当前对话
     */
    clearCurrentChat() {
        const result = confirm('确定要清空当前对话吗？清空后无法恢复。');
        if (!result) return;

        this.messages = [];
        this.showWelcomeMessage();
        Utils.Notification.success('清空完成', '当前对话已清空');
    }

    /**
     * 下载聊天记录
     */
    downloadChatHistory() {
        if (this.messages.length === 0) {
            Utils.Notification.warning('无内容', '当前对话没有消息记录');
            return;
        }

        // 生成文本内容
        let content = `PDF智能检索系统 - 对话记录\n`;
        content += `导出时间: ${new Date().toLocaleString()}\n\n`;

        this.messages.forEach((message, index) => {
            const time = Utils.StringUtils.formatTime(message.created_at);
            const sender = message.message_type === 'user' ? '用户' : '助手';
            content += `[${time}] ${sender}:\n${message.message_content}\n\n`;
        });

        // 创建下载链接
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `对话记录_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        Utils.Notification.success('导出成功', '对话记录已下载');
    }

    /**
     * 语音输入切换
     */
    toggleVoiceInput() {
        // 这里可以实现语音输入功能
        Utils.Notification.info('功能提示', '语音输入功能开发中...');
    }
}

// 全局聊天管理器实例
window.chatManager = null;

// 初始化聊天管理器
document.addEventListener('DOMContentLoaded', () => {
    try {
        if (Utils && Utils.DOM && Utils.DOM.$('#intelligent-search')) {
            window.chatManager = new ChatManager();
        }
    } catch (error) {
        console.error('初始化聊天管理器失败:', error);
    }
}); 