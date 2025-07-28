/**
 * 文件管理模块
 * 处理文件上传、列表显示、删除等功能
 */

class FileManager {
    constructor() {
        this.currentPage = 1;
        this.pageSize = 20;
        this.totalPages = 0;
        this.selectedFiles = new Set();
        this.searchKeyword = '';
        this.sortField = 'created_at';
        this.sortOrder = 'desc';
        this.viewMode = 'list';
        this.autoRefreshInterval = null;
        
        this.init();
    }

    /**
     * 初始化文件管理器
     */
    init() {
        this.bindEvents();
        this.loadFileList();
        this.startAutoRefresh();
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 上传按钮
        const uploadBtn = Utils.DOM.$('#btn-upload');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => this.showUploadModal());
        }

        // 刷新按钮
        const refreshBtn = Utils.DOM.$('#btn-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshFileList());
        }

        // 批量删除按钮
        const batchDeleteBtn = Utils.DOM.$('#btn-batch-delete');
        if (batchDeleteBtn) {
            batchDeleteBtn.addEventListener('click', () => this.batchDeleteFiles());
        }

        // 搜索框
        const searchInput = Utils.DOM.$('#file-search');
        if (searchInput) {
            const debouncedSearch = Utils.EventUtils.debounce((e) => {
                this.searchKeyword = e.target.value.trim();
                this.currentPage = 1;
                this.loadFileList();
            }, Utils.CONSTANTS.DEBOUNCE_DELAY);
            searchInput.addEventListener('input', debouncedSearch);
        }

        // 视图切换
        const viewToggleBtns = Utils.DOM.$$('.view-toggle .btn');
        viewToggleBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const viewMode = e.target.closest('.btn').dataset.view;
                this.switchViewMode(viewMode);
            });
        });

        // 文件上传相关事件
        this.bindUploadEvents();

        // 文件列表事件委托
        this.bindFileListEvents();
    }

    /**
     * 绑定上传相关事件
     */
    bindUploadEvents() {
        const uploadModal = Utils.DOM.$('#upload-modal');
        const uploadArea = Utils.DOM.$('#upload-area');
        const fileInput = Utils.DOM.$('#file-input');
        const selectFileBtn = Utils.DOM.$('#btn-select-file');

        if (!uploadArea || !fileInput) return;

        // 拖拽上传
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            Utils.DOM.addClass(uploadArea, 'dragover');
        });

        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            Utils.DOM.removeClass(uploadArea, 'dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            Utils.DOM.removeClass(uploadArea, 'dragover');
            
            const files = Array.from(e.dataTransfer.files);
            this.handleFileSelect(files);
        });

        // 点击选择文件
        uploadArea.addEventListener('click', () => {
            fileInput.click();
        });

        if (selectFileBtn) {
            selectFileBtn.addEventListener('click', () => {
                fileInput.click();
            });
        }

        // 文件选择
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            this.handleFileSelect(files);
        });
    }

    /**
     * 绑定文件列表事件
     */
    bindFileListEvents() {
        const fileList = Utils.DOM.$('#file-list');
        if (!fileList) return;

        // 事件委托
        Utils.EventUtils.delegate(fileList, '.file-checkbox', 'change', (e) => {
            const fileId = parseInt(e.target.dataset.fileId);
            if (e.target.checked) {
                this.selectedFiles.add(fileId);
            } else {
                this.selectedFiles.delete(fileId);
            }
            this.updateSelectionUI();
        });

        // 文件操作按钮
        Utils.EventUtils.delegate(fileList, '.btn-delete-file', 'click', (e) => {
            e.stopPropagation();
            const fileId = parseInt(e.target.dataset.fileId);
            this.deleteFile(fileId);
        });

        Utils.EventUtils.delegate(fileList, '.btn-rename-file', 'click', (e) => {
            e.stopPropagation();
            const fileId = parseInt(e.target.dataset.fileId);
            this.renameFile(fileId);
        });

        Utils.EventUtils.delegate(fileList, '.btn-view-file', 'click', (e) => {
            e.stopPropagation();
            const fileId = parseInt(e.target.dataset.fileId);
            this.viewFileInfo(fileId);
        });

        // 全选/取消全选
        Utils.EventUtils.delegate(fileList, '#select-all-files', 'change', (e) => {
            const checkboxes = fileList.querySelectorAll('.file-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
                const fileId = parseInt(checkbox.dataset.fileId);
                if (e.target.checked) {
                    this.selectedFiles.add(fileId);
                } else {
                    this.selectedFiles.delete(fileId);
                }
            });
            this.updateSelectionUI();
        });
    }

    /**
     * 显示上传模态框
     */
    showUploadModal() {
        Utils.Modal.show('#upload-modal');
        
        // 重置上传状态
        const uploadArea = Utils.DOM.$('#upload-area');
        const uploadProgress = Utils.DOM.$('#upload-progress');
        const fileInput = Utils.DOM.$('#file-input');
        
        if (uploadArea) Utils.DOM.show(uploadArea);
        if (uploadProgress) Utils.DOM.hide(uploadProgress);
        if (fileInput) fileInput.value = '';
    }

    /**
     * 处理文件选择
     */
    async handleFileSelect(files) {
        if (!files || files.length === 0) return;

        // 验证文件
        const validFiles = [];
        for (const file of files) {
            if (this.validateFile(file)) {
                validFiles.push(file);
            }
        }

        if (validFiles.length === 0) {
            Utils.Notification.warning('文件验证失败', '没有有效的PDF文件');
            return;
        }

        // 上传文件
        for (const file of validFiles) {
            await this.uploadFile(file);
        }
    }

    /**
     * 验证文件
     */
    validateFile(file) {
        // 检查文件类型
        if (!Utils.Validator.isValidFileType(file, [Utils.CONSTANTS.FILE_TYPES.PDF])) {
            Utils.Notification.error('文件类型错误', `文件 ${file.name} 不是PDF格式`);
            return false;
        }

        // 检查文件大小
        if (!Utils.Validator.isValidFileSize(file, Utils.CONSTANTS.MAX_FILE_SIZE)) {
            Utils.Notification.error('文件过大', `文件 ${file.name} 超过100MB限制`);
            return false;
        }

        return true;
    }

    /**
     * 上传文件
     */
    async uploadFile(file) {
        const uploadArea = Utils.DOM.$('#upload-area');
        const uploadProgress = Utils.DOM.$('#upload-progress');
        const progressFill = Utils.DOM.$('#progress-fill');
        const progressText = Utils.DOM.$('#progress-text');

        try {
            // 显示进度条
            if (uploadArea) Utils.DOM.hide(uploadArea);
            if (uploadProgress) Utils.DOM.show(uploadProgress);

            // 上传文件
            const response = await API.FileAPI.uploadFile(file, (progress) => {
                if (progressFill) {
                    progressFill.style.width = progress + '%';
                }
                if (progressText) {
                    progressText.textContent = `上传中... ${Math.round(progress)}%`;
                }
            });

            if (response.success) {
                Utils.Notification.success('上传成功', `文件 ${file.name} 上传成功，正在处理中...`);
                
                // 关闭模态框
                Utils.Modal.hide('#upload-modal');
                
                // 刷新文件列表
                this.refreshFileList();
                
                // 开始监控文件处理状态
                this.monitorFileProcessing(response.data.file_id);
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('文件上传失败:', error);
            Utils.Notification.error('上传失败', error.message);
            
            // 重置上传界面
            if (uploadArea) Utils.DOM.show(uploadArea);
            if (uploadProgress) Utils.DOM.hide(uploadProgress);
        }
    }

    /**
     * 监控文件处理状态
     */
    async monitorFileProcessing(fileId) {
        const checkStatus = async () => {
            try {
                const response = await API.FileAPI.getFileStatus(fileId);
                if (response.success) {
                    const data = response.data;
                    
                    if (data.process_status === 'completed') {
                        Utils.Notification.success('处理完成', '文件内容分析完成，现在可以进行智能检索了');
                        this.refreshFileList();
                        return true; // 停止监控
                    } else if (data.process_status === 'failed') {
                        Utils.Notification.error('处理失败', '文件内容分析失败');
                        this.refreshFileList();
                        return true; // 停止监控
                    } else if (data.process_status === 'processing') {
                        // 继续监控
                        setTimeout(checkStatus, 3000); // 3秒后再次检查
                    }
                }
            } catch (error) {
                console.error('获取文件状态失败:', error);
                // 停止监控
                return true;
            }
        };

        // 开始监控
        setTimeout(checkStatus, 2000); // 2秒后开始检查
    }

    /**
     * 加载文件列表
     */
    async loadFileList() {
        try {
            Utils.Loading.show('加载文件列表...');

            const response = await API.FileAPI.getFileList(
                this.currentPage,
                this.pageSize,
                this.searchKeyword
            );

            if (response.success) {
                const data = response.data;
                this.renderFileList(data.files);
                this.renderPagination(data.pagination);
                this.totalPages = data.pagination.total_pages;
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('加载文件列表失败:', error);
            Utils.Notification.error('加载失败', '无法加载文件列表');
            this.renderEmptyState();
        } finally {
            Utils.Loading.hide();
        }
    }

    /**
     * 渲染文件列表
     */
    renderFileList(files) {
        const fileList = Utils.DOM.$('#file-list');
        if (!fileList) return;

        if (!files || files.length === 0) {
            this.renderEmptyState();
            return;
        }

        const isListView = this.viewMode === 'list';
        
        let html = '';
        
        if (isListView) {
            // 列表视图
            html = `
                <div class="file-list-header">
                    <div class="file-checkbox-header">
                        <input type="checkbox" id="select-all-files" class="form-checkbox">
                    </div>
                    <div class="file-header-name">文件名</div>
                    <div class="file-header-size">大小</div>
                    <div class="file-header-status">状态</div>
                    <div class="file-header-time">上传时间</div>
                    <div class="file-header-actions">操作</div>
                </div>
            `;
        }

        files.forEach(file => {
            html += this.renderFileItem(file, isListView);
        });

        fileList.innerHTML = html;
        
        // 更新选择状态
        this.updateFileSelection();
    }

    /**
     * 渲染单个文件项
     */
    renderFileItem(file, isListView = true) {
        const statusInfo = this.getStatusInfo(file);
        const fileSize = Utils.StringUtils.formatFileSize(file.file_size);
        const uploadTime = Utils.StringUtils.formatTime(file.created_at);
        
        if (isListView) {
            return `
                <div class="file-item" data-file-id="${file.id}">
                    <div class="file-checkbox">
                        <input type="checkbox" class="form-checkbox" data-file-id="${file.id}">
                    </div>
                    <div class="file-icon">
                        <i class="fas fa-file-pdf"></i>
                    </div>
                    <div class="file-info">
                        <div class="file-name" title="${Utils.StringUtils.escapeHtml(file.original_name)}">
                            ${Utils.StringUtils.truncate(file.original_name, 30)}
                        </div>
                        <div class="file-meta">
                            <span>ID: ${file.id}</span>
                        </div>
                    </div>
                    <div class="file-size">${fileSize}</div>
                    <div class="file-status">
                        <div class="status-badge ${statusInfo.class}">
                            ${statusInfo.text}
                        </div>
                        ${this.renderProgressBar(file)}
                    </div>
                    <div class="file-time">${uploadTime}</div>
                    <div class="file-actions">
                        <button class="btn btn-sm btn-view-file" data-file-id="${file.id}" title="查看详情">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-rename-file" data-file-id="${file.id}" title="重命名">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-danger btn-delete-file" data-file-id="${file.id}" title="删除">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        } else {
            // 网格视图
            return `
                <div class="file-card" data-file-id="${file.id}">
                    <div class="file-card-header">
                        <div class="file-checkbox">
                            <input type="checkbox" class="form-checkbox" data-file-id="${file.id}">
                        </div>
                        <div class="file-card-actions">
                            <div class="dropdown">
                                <button class="btn btn-sm dropdown-toggle">
                                    <i class="fas fa-ellipsis-v"></i>
                                </button>
                                <div class="dropdown-menu">
                                    <button class="dropdown-item btn-view-file" data-file-id="${file.id}">
                                        <i class="fas fa-eye"></i> 查看详情
                                    </button>
                                    <button class="dropdown-item btn-rename-file" data-file-id="${file.id}">
                                        <i class="fas fa-edit"></i> 重命名
                                    </button>
                                    <div class="dropdown-divider"></div>
                                    <button class="dropdown-item btn-delete-file" data-file-id="${file.id}">
                                        <i class="fas fa-trash"></i> 删除
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="file-card-icon">
                        <i class="fas fa-file-pdf"></i>
                    </div>
                    <div class="file-card-info">
                        <div class="file-name" title="${Utils.StringUtils.escapeHtml(file.original_name)}">
                            ${Utils.StringUtils.truncate(file.original_name, 20)}
                        </div>
                        <div class="file-size">${fileSize}</div>
                        <div class="file-time">${uploadTime}</div>
                    </div>
                    <div class="file-card-status">
                        <div class="status-badge ${statusInfo.class}">
                            ${statusInfo.text}
                        </div>
                        ${this.renderProgressBar(file)}
                    </div>
                </div>
            `;
        }
    }

    /**
     * 获取状态信息
     */
    getStatusInfo(file) {
        const statusMap = {
            'uploaded': { text: '已上传', class: 'status-uploaded' },
            'processing': { text: '处理中', class: 'status-processing' },
            'completed': { text: '已完成', class: 'status-completed' },
            'failed': { text: '处理失败', class: 'status-failed' }
        };

        return statusMap[file.process_status] || { text: '未知', class: 'status-unknown' };
    }

    /**
     * 渲染进度条
     */
    renderProgressBar(file) {
        if (file.process_status === 'processing' && file.process_progress !== undefined) {
            return `
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${file.process_progress}%"></div>
                </div>
                <span class="progress-text">${file.process_progress}%</span>
            `;
        }
        return '';
    }

    /**
     * 渲染空状态
     */
    renderEmptyState() {
        const fileList = Utils.DOM.$('#file-list');
        if (!fileList) return;

        const emptyMessage = this.searchKeyword
            ? `没有找到包含 "${this.searchKeyword}" 的文件`
            : '暂无文件，请上传PDF文件开始使用';

        fileList.innerHTML = `
            <div class="file-list-empty">
                <i class="fas fa-folder-open"></i>
                <p>${emptyMessage}</p>
                ${!this.searchKeyword ? '<button class="btn btn-primary" onclick="window.fileManager.showUploadModal()"><i class="fas fa-upload"></i> 上传文件</button>' : ''}
            </div>
        `;
    }

    /**
     * 渲染分页
     */
    renderPagination(pagination) {
        const paginationContainer = Utils.DOM.$('#pagination');
        if (!paginationContainer || pagination.total_pages <= 1) {
            if (paginationContainer) paginationContainer.innerHTML = '';
            return;
        }

        let html = '';
        const { page, total_pages } = pagination;

        // 上一页
        html += `
            <button class="btn ${page <= 1 ? 'disabled' : ''}" 
                    onclick="window.fileManager.goToPage(${page - 1})" 
                    ${page <= 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
        `;

        // 页码
        const startPage = Math.max(1, page - 2);
        const endPage = Math.min(total_pages, page + 2);

        if (startPage > 1) {
            html += `<button class="btn" onclick="window.fileManager.goToPage(1)">1</button>`;
            if (startPage > 2) {
                html += `<span class="pagination-ellipsis">...</span>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `
                <button class="btn ${i === page ? 'active' : ''}" 
                        onclick="window.fileManager.goToPage(${i})">
                    ${i}
                </button>
            `;
        }

        if (endPage < total_pages) {
            if (endPage < total_pages - 1) {
                html += `<span class="pagination-ellipsis">...</span>`;
            }
            html += `<button class="btn" onclick="window.fileManager.goToPage(${total_pages})">${total_pages}</button>`;
        }

        // 下一页
        html += `
            <button class="btn ${page >= total_pages ? 'disabled' : ''}" 
                    onclick="window.fileManager.goToPage(${page + 1})" 
                    ${page >= total_pages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        `;

        paginationContainer.innerHTML = html;
    }

    /**
     * 跳转到指定页
     */
    goToPage(page) {
        if (page < 1 || page > this.totalPages || page === this.currentPage) {
            return;
        }

        this.currentPage = page;
        this.loadFileList();
    }

    /**
     * 刷新文件列表
     */
    refreshFileList() {
        this.selectedFiles.clear();
        this.updateSelectionUI();
        this.loadFileList();
    }

    /**
     * 更新选择状态
     */
    updateFileSelection() {
        const checkboxes = Utils.DOM.$$('.file-checkbox input[type="checkbox"]:not(#select-all-files)');
        checkboxes.forEach(checkbox => {
            const fileId = parseInt(checkbox.dataset.fileId);
            checkbox.checked = this.selectedFiles.has(fileId);
        });

        // 更新全选状态
        const selectAllCheckbox = Utils.DOM.$('#select-all-files');
        if (selectAllCheckbox && checkboxes.length > 0) {
            const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
            selectAllCheckbox.checked = checkedCount === checkboxes.length;
            selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
        }
    }

    /**
     * 更新选择UI
     */
    updateSelectionUI() {
        const selectedCount = this.selectedFiles.size;
        const selectedCountSpan = Utils.DOM.$('#selected-count');
        const batchDeleteBtn = Utils.DOM.$('#btn-batch-delete');

        if (selectedCountSpan) {
            selectedCountSpan.textContent = selectedCount;
        }

        if (batchDeleteBtn) {
            batchDeleteBtn.disabled = selectedCount === 0;
        }
    }

    /**
     * 切换视图模式
     */
    switchViewMode(mode) {
        this.viewMode = mode;

        // 更新按钮状态
        const viewToggleBtns = Utils.DOM.$$('.view-toggle .btn');
        viewToggleBtns.forEach(btn => {
            Utils.DOM.removeClass(btn, 'active');
            if (btn.dataset.view === mode) {
                Utils.DOM.addClass(btn, 'active');
            }
        });

        // 重新渲染列表
        this.loadFileList();

        // 保存视图模式
        Utils.Storage.set('file_view_mode', mode);
    }

    /**
     * 删除单个文件
     */
    async deleteFile(fileId) {
        const result = confirm('确定要删除这个文件吗？删除后无法恢复。');
        if (!result) return;

        try {
            Utils.Loading.show('删除文件...');

            const response = await API.FileAPI.deleteFile(fileId);
            if (response.success) {
                Utils.Notification.success('删除成功', '文件已成功删除');
                this.selectedFiles.delete(fileId);
                this.refreshFileList();
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('删除文件失败:', error);
            Utils.Notification.error('删除失败', error.message);
        } finally {
            Utils.Loading.hide();
        }
    }

    /**
     * 批量删除文件
     */
    async batchDeleteFiles() {
        if (this.selectedFiles.size === 0) return;

        const result = confirm(`确定要删除选中的 ${this.selectedFiles.size} 个文件吗？删除后无法恢复。`);
        if (!result) return;

        try {
            Utils.Loading.show('批量删除文件...');

            const fileIds = Array.from(this.selectedFiles);
            const response = await API.FileAPI.batchDeleteFiles(fileIds);

            if (response.success) {
                const { success_count, total_count } = response.data;
                Utils.Notification.success('批量删除完成', `成功删除 ${success_count}/${total_count} 个文件`);
                this.selectedFiles.clear();
                this.refreshFileList();
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('批量删除失败:', error);
            Utils.Notification.error('批量删除失败', error.message);
        } finally {
            Utils.Loading.hide();
        }
    }

    /**
     * 重命名文件
     */
    async renameFile(fileId) {
        const newName = prompt('请输入新的文件名：');
        if (!newName || !newName.trim()) return;

        try {
            Utils.Loading.show('重命名文件...');

            const response = await API.FileAPI.renameFile(fileId, newName.trim());
            if (response.success) {
                Utils.Notification.success('重命名成功', '文件已成功重命名');
                this.refreshFileList();
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('重命名失败:', error);
            Utils.Notification.error('重命名失败', error.message);
        } finally {
            Utils.Loading.hide();
        }
    }

    /**
     * 查看文件详情
     */
    async viewFileInfo(fileId) {
        try {
            Utils.Loading.show('获取文件信息...');

            const response = await API.FileAPI.getFileInfo(fileId);
            if (response.success) {
                this.showFileInfoModal(response.data);
            } else {
                throw new Error(response.message);
            }

        } catch (error) {
            console.error('获取文件信息失败:', error);
            Utils.Notification.error('获取失败', error.message);
        } finally {
            Utils.Loading.hide();
        }
    }

    /**
     * 显示文件详情模态框
     */
    showFileInfoModal(fileInfo) {
        // 这里可以创建一个详情模态框
        const info = `
            文件名：${fileInfo.original_name}
            文件大小：${Utils.StringUtils.formatFileSize(fileInfo.file_size)}
            上传状态：${fileInfo.upload_status}
            处理状态：${fileInfo.process_status}
            处理进度：${fileInfo.process_progress}%
            内容提取：${fileInfo.content_extracted ? '是' : '否'}
            已建索引：${fileInfo.indexed ? '是' : '否'}
            上传时间：${Utils.StringUtils.formatTime(fileInfo.created_at)}
        `;

        alert(info); // 简化处理，实际项目中应该用自定义模态框
    }

    /**
     * 开始自动刷新
     */
    startAutoRefresh() {
        // 每30秒自动刷新一次，检查文件处理状态
        this.autoRefreshInterval = setInterval(() => {
            // 只有当前在文件管理页面时才刷新
            const fileManagementTab = Utils.DOM.$('#file-management');
            if (fileManagementTab && Utils.DOM.hasClass(fileManagementTab, 'active')) {
                this.loadFileList();
            }
        }, 30000);
    }

    /**
     * 停止自动刷新
     */
    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    /**
     * 销毁文件管理器
     */
    destroy() {
        this.stopAutoRefresh();
        this.selectedFiles.clear();
    }
}

// 全局文件管理器实例
window.fileManager = null;

// 初始化文件管理器
document.addEventListener('DOMContentLoaded', () => {
    try {
        // 确保Utils对象完全加载
        if (typeof Utils !== 'undefined' && 
            Utils.DOM && 
            typeof Utils.DOM.$ === 'function' && 
            Utils.DOM.$('#file-management')) {
            window.fileManager = new FileManager();
        } else {
            console.warn('文件管理器初始化被跳过：Utils对象或DOM元素未准备好');
        }
    } catch (error) {
        console.error('初始化文件管理器失败:', error);
        // 显示用户友好的错误消息
        const fileManagement = document.querySelector('#file-management');
        if (fileManagement) {
            fileManagement.innerHTML = `
                <div class="init-error">
                    <h3>文件管理器初始化失败</h3>
                    <p>请刷新页面重试</p>
                    <button class="btn btn-primary" onclick="location.reload()">刷新页面</button>
                </div>
            `;
        }
    }
}); 