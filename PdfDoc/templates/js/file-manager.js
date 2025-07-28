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
        this.globalClickHandlerBound = false;
        
        this.init();
    }

    /**
     * 初始化文件管理器
     */
    init() {
        this.initializeViewMode();
        this.bindEvents();
        this.loadFileList();
        this.startAutoRefresh();
    }

    /**
     * 初始化视图模式
     */
    initializeViewMode() {
        // 从本地存储读取视图模式偏好
        const savedViewMode = Utils.Storage.get('file_view_mode');
        if (savedViewMode && (savedViewMode === 'list' || savedViewMode === 'grid')) {
            this.viewMode = savedViewMode;
        }
        
        // 确保DOM元素就绪后再设置样式
        setTimeout(() => {
            this.applyViewMode();
        }, 0);
    }
    
    /**
     * 应用视图模式样式
     */
    applyViewMode() {
        // 设置文件列表的CSS类
        const fileList = Utils.DOM.$('#file-list');
        if (fileList) {
            Utils.DOM.removeClass(fileList, 'list-view');
            Utils.DOM.removeClass(fileList, 'grid-view');
            Utils.DOM.addClass(fileList, this.viewMode + '-view');
            
            console.log('Applied view mode:', this.viewMode, 'to element:', fileList);
        } else {
            console.warn('File list element not found during view mode initialization');
        }
        
        // 设置按钮的活动状态
        const viewToggleBtns = Utils.DOM.$$('.view-toggle .btn');
        viewToggleBtns.forEach(btn => {
            Utils.DOM.removeClass(btn, 'active');
            if (btn.dataset.view === this.viewMode) {
                Utils.DOM.addClass(btn, 'active');
            }
        });
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
            selectFileBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止事件冒泡触发uploadArea的点击事件
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
        Utils.EventUtils.delegate(fileList, '.form-checkbox', 'change', (e) => {
            const fileId = parseInt(e.target.dataset.fileId);
            if (isNaN(fileId)) {
                console.error('Invalid file ID:', e.target.dataset.fileId);
                return;
            }
            
            const card = e.target.closest('.file-card');
            if (e.target.checked) {
                this.selectedFiles.add(fileId);
                if (card) Utils.DOM.addClass(card, 'selected');
            } else {
                this.selectedFiles.delete(fileId);
                if (card) Utils.DOM.removeClass(card, 'selected');
            }
            this.updateSelectionUI();
        });

        // 文件操作按钮
        Utils.EventUtils.delegate(fileList, '.btn-delete-file', 'click', (e) => {
            e.stopPropagation();
            const button = e.target.closest('.btn-delete-file');
            const fileId = parseInt(button.dataset.fileId);
            
            // 关闭下拉菜单（如果在卡片视图中）
            this.closeAllDropdowns();
            
            this.deleteFile(fileId);
        });

        Utils.EventUtils.delegate(fileList, '.btn-rename-file', 'click', (e) => {
            e.stopPropagation();
            const button = e.target.closest('.btn-rename-file');
            const fileId = parseInt(button.dataset.fileId);
            
            // 关闭下拉菜单（如果在卡片视图中）
            this.closeAllDropdowns();
            
            this.renameFile(fileId);
        });

        Utils.EventUtils.delegate(fileList, '.btn-view-file', 'click', (e) => {
            e.stopPropagation();
            const button = e.target.closest('.btn-view-file');
            const fileId = parseInt(button.dataset.fileId);
            
            // 关闭下拉菜单（如果在卡片视图中）
            this.closeAllDropdowns();
            
            this.viewFileInfo(fileId);
        });

        // 卡片视图下拉菜单按钮
        Utils.EventUtils.delegate(fileList, '.dropdown-toggle', 'click', (e) => {
            this.handleDropdownToggle(e);
        });

        // 卡片视图下拉菜单按钮内的图标
        Utils.EventUtils.delegate(fileList, '.dropdown-toggle i', 'click', (e) => {
            this.handleDropdownToggle(e);
        });

        // 点击其他地方关闭下拉菜单（只绑定一次）
        if (!this.globalClickHandlerBound) {
            document.addEventListener('click', (e) => {
                // 如果点击的不是下拉菜单相关元素，则关闭所有下拉菜单
                if (!e.target.closest('.dropdown')) {
                    this.closeAllDropdowns();
                }
            });
            this.globalClickHandlerBound = true;
        }

        // 全选/取消全选
        Utils.EventUtils.delegate(fileList, '#select-all-files', 'change', (e) => {
            const checkboxes = fileList.querySelectorAll('.form-checkbox');
            checkboxes.forEach(checkbox => {
                if (checkbox.id === 'select-all-files') return; // 跳过全选框本身
                
                checkbox.checked = e.target.checked;
                const fileId = parseInt(checkbox.dataset.fileId);
                if (isNaN(fileId)) {
                    console.error('Invalid file ID in select all:', checkbox.dataset.fileId);
                    return;
                }
                
                const card = checkbox.closest('.file-card');
                if (e.target.checked) {
                    this.selectedFiles.add(fileId);
                    if (card) Utils.DOM.addClass(card, 'selected');
                } else {
                    this.selectedFiles.delete(fileId);
                    if (card) Utils.DOM.removeClass(card, 'selected');
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
            const fileExtension = file.name.toLowerCase().split('.').pop();
            Utils.Notification.error('文件类型错误', 
                `文件 ${file.name} 不是PDF格式。文件类型: ${file.type || '未知'}, 扩展名: .${fileExtension}`);
            return false;
        }

        // 检查文件大小
        if (!Utils.Validator.isValidFileSize(file, Utils.CONSTANTS.MAX_FILE_SIZE)) {
            const sizeMB = (file.size / 1024 / 1024).toFixed(2);
            Utils.Notification.error('文件过大', `文件 ${file.name} 大小为 ${sizeMB}MB，超过100MB限制`);
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
        
        // 清理无效的选择
        this.cleanupInvalidSelections(files);
        
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
                    <div class="file-name" title="${Utils.StringUtils.escapeHtml(file.original_name)}">
                        ${Utils.StringUtils.truncate(file.original_name, 30)}
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
            const progressBarHTML = this.renderProgressBar(file);
            return `
                <div class="file-card" data-file-id="${file.id}">
                    <div class="file-card-header">
                        <div class="file-card-checkbox">
                            <input type="checkbox" class="form-checkbox" data-file-id="${file.id}">
                        </div>
                        <div class="file-card-actions">
                            <div class="dropdown">
                                <button class="dropdown-toggle" type="button">
                                    <i class="fas fa-ellipsis-v"></i>
                                </button>
                                <div class="dropdown-menu">
                                    <button class="dropdown-item btn-view-file" data-file-id="${file.id}">
                                        <i class="fas fa-eye"></i>
                                        <span>查看详情</span>
                                    </button>
                                    <button class="dropdown-item btn-rename-file" data-file-id="${file.id}">
                                        <i class="fas fa-edit"></i>
                                        <span>重命名</span>
                                    </button>
                                    <div class="dropdown-divider"></div>
                                    <button class="dropdown-item btn-delete-file" data-file-id="${file.id}">
                                        <i class="fas fa-trash"></i>
                                        <span>删除</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="file-card-body">
                        <div class="file-card-icon">
                            <i class="fas fa-file-pdf"></i>
                        </div>
                        <div class="file-card-info">
                            <div class="file-name" title="${Utils.StringUtils.escapeHtml(file.original_name)}">
                                ${Utils.StringUtils.truncate(file.original_name, 25)}
                            </div>
                            <div class="file-meta">
                                <div class="file-meta-item">
                                    <div class="file-meta-label">文件大小</div>
                                    <div class="file-meta-value">${fileSize}</div>
                                </div>
                                <div class="file-meta-item">
                                    <div class="file-meta-label">上传时间</div>
                                    <div class="file-meta-value">${Utils.StringUtils.formatTime(file.created_at, 'MM-DD')}</div>
                                </div>
                            </div>
                        </div>
                        <div class="file-card-status">
                            <div class="status-badge ${statusInfo.class}">
                                ${statusInfo.text}
                            </div>
                            ${progressBarHTML ? `<div class="progress-container">${progressBarHTML}</div>` : ''}
                        </div>
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
                <div class="progress-text">${file.process_progress}%</div>
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
     * 清理无效的选择（已删除或不在当前列表中的文件）
     */
    cleanupInvalidSelections(currentFiles) {
        if (!currentFiles || currentFiles.length === 0) {
            this.selectedFiles.clear();
            return;
        }
        
        const currentFileIds = new Set(currentFiles.map(file => file.id));
        const selectedFileIds = Array.from(this.selectedFiles);
        
        // 如果是在搜索模式，保留所有选择
        if (this.searchKeyword && this.searchKeyword.trim()) {
            return;
        }
        
        // 移除不在当前文件列表中的选择（仅在非搜索模式下）
        selectedFileIds.forEach(fileId => {
            if (!currentFileIds.has(fileId)) {
                this.selectedFiles.delete(fileId);
            }
        });
    }

    /**
     * 更新选择状态
     */
    updateFileSelection() {
        const checkboxes = Utils.DOM.$$('.form-checkbox:not(#select-all-files)');
        checkboxes.forEach(checkbox => {
            const fileId = parseInt(checkbox.dataset.fileId);
            const isSelected = this.selectedFiles.has(fileId);
            checkbox.checked = isSelected;
            
            // 更新卡片的选中状态
            const card = checkbox.closest('.file-card');
            if (card) {
                if (isSelected) {
                    Utils.DOM.addClass(card, 'selected');
                } else {
                    Utils.DOM.removeClass(card, 'selected');
                }
            }
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
        const totalSelectedCount = this.selectedFiles.size;
        const selectedCountSpan = Utils.DOM.$('#selected-count');
        const batchDeleteBtn = Utils.DOM.$('#btn-batch-delete');

        if (selectedCountSpan) {
            selectedCountSpan.textContent = totalSelectedCount;
        }

        if (batchDeleteBtn) {
            batchDeleteBtn.disabled = totalSelectedCount === 0;
        }
    }

    /**
     * 处理下拉菜单切换
     */
    handleDropdownToggle(e) {
        e.stopPropagation();
        e.preventDefault();
        
        console.log('Dropdown toggle clicked', e.target);
        
        const button = e.target.closest('.dropdown-toggle');
        if (!button) {
            console.error('Could not find dropdown button');
            return;
        }
        
        const dropdown = button.closest('.dropdown');
        if (!dropdown) {
            console.error('Could not find dropdown container');
            return;
        }
        
        const isOpen = Utils.DOM.hasClass(dropdown, 'show');
        
        console.log('Dropdown state:', { button, dropdown, isOpen });
        
        // 关闭所有其他下拉菜单
        this.closeAllDropdowns();
        
        // 切换当前下拉菜单
        if (!isOpen) {
            Utils.DOM.addClass(dropdown, 'show');
            // 确保菜单在页面范围内显示
            this.adjustDropdownPosition(dropdown);
            console.log('Opened dropdown', dropdown);
        }
    }

    /**
     * 关闭所有下拉菜单
     */
    closeAllDropdowns() {
        const allDropdowns = Utils.DOM.$$('.dropdown.show');
        allDropdowns.forEach(dd => {
            Utils.DOM.removeClass(dd, 'show');
            // 清除位置调整
            const menu = dd.querySelector('.dropdown-menu');
            if (menu) {
                menu.style.left = '';
                menu.style.right = '';
                menu.style.top = '';
            }
        });
    }

    /**
     * 调整下拉菜单位置，确保在视窗内显示
     */
    adjustDropdownPosition(dropdown) {
        const menu = dropdown.querySelector('.dropdown-menu');
        if (!menu) return;

        // 重置样式
        menu.style.left = '';
        menu.style.right = '';
        menu.style.top = '';

        // 等待DOM更新后计算位置
        setTimeout(() => {
            const rect = menu.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // 检查是否超出右边界
            if (rect.right > viewportWidth) {
                menu.style.right = '0';
                menu.style.left = 'auto';
            }

            // 检查是否超出底部边界
            if (rect.bottom > viewportHeight) {
                menu.style.top = 'auto';
                menu.style.bottom = '100%';
                menu.style.marginTop = '0';
                menu.style.marginBottom = '4px';
            }
        }, 10);
    }

    /**
     * 切换视图模式
     */
    switchViewMode(mode) {
        this.viewMode = mode;

        // 应用视图模式样式
        this.applyViewMode();

        // 重新渲染列表
        this.loadFileList();

        // 保存视图模式
        Utils.Storage.set('file_view_mode', mode);
        
        // 调试信息
        console.log(`视图模式已切换到: ${mode}`);
        
        // 确保在网格视图下正确初始化下拉菜单
        if (mode === 'grid') {
            setTimeout(() => {
                this.initializeGridDropdowns();
            }, 100);
        }
    }
    
    /**
     * 初始化网格视图的下拉菜单
     */
    initializeGridDropdowns() {
        const dropdowns = Utils.DOM.$$('.file-card .dropdown');
        console.log(`找到 ${dropdowns.length} 个下拉菜单`);
        
        dropdowns.forEach((dropdown, index) => {
            const toggle = dropdown.querySelector('.dropdown-toggle');
            const menu = dropdown.querySelector('.dropdown-menu');
            
            if (toggle && menu) {
                console.log(`下拉菜单 ${index + 1} 初始化完成`);
                
                // 确保样式正确
                if (!toggle.style.cursor) {
                    toggle.style.cursor = 'pointer';
                }
                
                // 验证事件监听器
                const hasListener = toggle.getAttribute('data-dropdown-initialized');
                if (!hasListener) {
                    toggle.setAttribute('data-dropdown-initialized', 'true');
                    console.log(`为下拉菜单 ${index + 1} 添加事件监听器标记`);
                }
            } else {
                console.warn(`下拉菜单 ${index + 1} 缺少必要元素`, { toggle, menu });
            }
        });
    }

    /**
     * 删除单个文件
     */
    async deleteFile(fileId) {
        try {
            // 获取文件信息以显示在确认对话框中
            const fileInfoResponse = await API.FileAPI.getFileInfo(fileId);
            let fileName = '未知文件';
            let fileSize = '';
            
            if (fileInfoResponse.success) {
                fileName = fileInfoResponse.data.original_name;
                fileSize = Utils.StringUtils.formatFileSize(fileInfoResponse.data.file_size);
            }

            // 显示删除确认模态框
            this.showDeleteConfirmModal(fileId, fileName, fileSize);

        } catch (error) {
            console.error('获取文件信息失败:', error);
            // 如果获取文件信息失败，仍然显示删除确认框但不显示详细信息
            this.showDeleteConfirmModal(fileId, '未知文件', '');
        }
    }

    /**
     * 显示删除确认模态框
     */
    showDeleteConfirmModal(fileId, fileName, fileSize) {
        // 更新模态框内容
        const fileInfoElement = Utils.DOM.$('#delete-file-info');
        if (fileInfoElement) {
            fileInfoElement.innerHTML = `
                <div class="file-name">${Utils.StringUtils.escapeHtml(fileName)}</div>
                ${fileSize ? `<div class="file-size">大小: ${fileSize}</div>` : ''}
            `;
        }

        // 显示模态框
        Utils.Modal.show('#delete-confirm-modal');

        // 绑定确认和取消按钮事件
        const confirmBtn = Utils.DOM.$('#delete-confirm-btn');
        const cancelBtn = Utils.DOM.$('#delete-cancel-btn');

        const handleConfirm = async () => {
            Utils.Modal.hide('#delete-confirm-modal');
            await this.performDeleteFile(fileId);
            cleanup();
        };

        const handleCancel = () => {
            Utils.Modal.hide('#delete-confirm-modal');
            cleanup();
        };

        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
    }

    /**
     * 执行删除文件操作
     */
    async performDeleteFile(fileId) {
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
        if (this.selectedFiles.size === 0) {
            Utils.Notification.warning('请选择文件', '请先选择要删除的文件');
            return;
        }

        // 显示批量删除确认模态框
        this.showBatchDeleteModal();
    }

    /**
     * 显示批量删除确认模态框
     */
    showBatchDeleteModal() {
        const selectedCount = this.selectedFiles.size;
        
        // 更新模态框内容
        const batchCountElement = Utils.DOM.$('#batch-count');
        if (batchCountElement) {
            batchCountElement.textContent = selectedCount;
        }

        // 显示模态框
        Utils.Modal.show('#batch-delete-modal');

        // 绑定确认和取消按钮事件
        const confirmBtn = Utils.DOM.$('#batch-confirm-btn');
        const cancelBtn = Utils.DOM.$('#batch-cancel-btn');

        const handleConfirm = async () => {
            Utils.Modal.hide('#batch-delete-modal');
            await this.performBatchDelete();
            cleanup();
        };

        const handleCancel = () => {
            Utils.Modal.hide('#batch-delete-modal');
            cleanup();
        };

        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
    }

    /**
     * 执行批量删除操作
     */
    async performBatchDelete() {
        try {
            Utils.Loading.show('批量删除文件...');

            // 过滤有效的文件ID
            const fileIds = Array.from(this.selectedFiles).filter(id => 
                id != null && !isNaN(id) && Number.isInteger(id) && id > 0
            );
            
            if (fileIds.length === 0) {
                Utils.Notification.warning('没有有效的文件', '请选择要删除的文件');
                return;
            }
            
            const response = await API.FileAPI.batchDeleteFiles(fileIds);

            if (response.success) {
                const { success_count, total_count } = response.data;
                Utils.Notification.success('批量删除完成', `成功删除 ${success_count}/${total_count} 个文件`);
                this.selectedFiles.clear();
                this.updateSelectionUI();
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
        try {
            // 首先获取当前文件信息，获得当前文件名
            Utils.Loading.show('获取文件信息...');
            const fileInfoResponse = await API.FileAPI.getFileInfo(fileId);
            
            if (!fileInfoResponse.success) {
                throw new Error(fileInfoResponse.message);
            }
            
            const fileInfo = fileInfoResponse.data;
            Utils.Loading.hide();
            
            // 显示重命名模态框
            this.showRenameModal(fileId, fileInfo);

        } catch (error) {
            console.error('获取文件信息失败:', error);
            Utils.Notification.error('获取文件信息失败', error.message);
            Utils.Loading.hide();
        }
    }

    /**
     * 显示重命名模态框
     */
    showRenameModal(fileId, fileInfo) {
        // 获取不带扩展名的文件名
        const currentFileName = fileInfo.original_name;
        const fileNameWithoutExt = currentFileName.replace(/\.pdf$/i, '');
        
        // 更新模态框内容
        const renameInput = Utils.DOM.$('#rename-input');
        const fileInfoElement = Utils.DOM.$('#rename-file-info');
        
        if (renameInput) {
            renameInput.value = fileNameWithoutExt;
            // 聚焦并选中文本
            setTimeout(() => {
                renameInput.focus();
                renameInput.select();
            }, 100);
        }
        
        if (fileInfoElement) {
            fileInfoElement.innerHTML = `
                <div class="file-name">当前文件名: ${Utils.StringUtils.escapeHtml(currentFileName)}</div>
                <div class="file-size">文件大小: ${Utils.StringUtils.formatFileSize(fileInfo.file_size)}</div>
            `;
        }

        // 显示模态框
        Utils.Modal.show('#rename-modal');

        // 绑定事件
        const confirmBtn = Utils.DOM.$('#rename-confirm-btn');
        const cancelBtn = Utils.DOM.$('#rename-cancel-btn');

        const handleConfirm = async () => {
            const newName = renameInput ? renameInput.value.trim() : '';
            if (!newName) {
                Utils.Notification.warning('输入错误', '文件名不能为空');
                return;
            }
            
            // 添加.pdf扩展名
            const newFullName = newName.endsWith('.pdf') ? newName : newName + '.pdf';
            
            if (newFullName === currentFileName) {
                Utils.Modal.hide('#rename-modal');
                cleanup();
                return;
            }

            Utils.Modal.hide('#rename-modal');
            await this.performRename(fileId, newFullName);
            cleanup();
        };

        const handleCancel = () => {
            Utils.Modal.hide('#rename-modal');
            cleanup();
        };

        const handleEnterKey = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            }
        };

        const cleanup = () => {
            confirmBtn.removeEventListener('click', handleConfirm);
            cancelBtn.removeEventListener('click', handleCancel);
            if (renameInput) {
                renameInput.removeEventListener('keypress', handleEnterKey);
            }
        };

        confirmBtn.addEventListener('click', handleConfirm);
        cancelBtn.addEventListener('click', handleCancel);
        if (renameInput) {
            renameInput.addEventListener('keypress', handleEnterKey);
        }
    }

    /**
     * 执行重命名操作
     */
    async performRename(fileId, newName) {
        try {
            Utils.Loading.show('重命名文件...');
            const response = await API.FileAPI.renameFile(fileId, newName);
            
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
        const statusMap = {
            'uploaded': '已上传',
            'processing': '处理中', 
            'completed': '已完成',
            'failed': '失败'
        };

        const content = `
            <div class="file-detail-item">
                <label>文件名:</label>
                <span>${Utils.StringUtils.escapeHtml(fileInfo.original_name)}</span>
            </div>
            <div class="file-detail-item">
                <label>文件大小:</label>
                <span>${Utils.StringUtils.formatFileSize(fileInfo.file_size)}</span>
            </div>
            <div class="file-detail-item">
                <label>上传状态:</label>
                <span class="status-badge status-${fileInfo.upload_status}">${statusMap[fileInfo.upload_status] || fileInfo.upload_status}</span>
            </div>
            <div class="file-detail-item">
                <label>处理状态:</label>
                <span class="status-badge status-${fileInfo.process_status}">${statusMap[fileInfo.process_status] || fileInfo.process_status}</span>
            </div>
            <div class="file-detail-item">
                <label>处理进度:</label>
                <div class="progress-bar-container">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${fileInfo.process_progress || 0}%"></div>
                    </div>
                    <span class="progress-text">${fileInfo.process_progress || 0}%</span>
                </div>
            </div>
            <div class="file-detail-item">
                <label>内容提取:</label>
                <span class="feature-status ${fileInfo.content_extracted ? 'enabled' : 'disabled'}">
                    <i class="fas fa-${fileInfo.content_extracted ? 'check-circle' : 'times-circle'}"></i>
                    ${fileInfo.content_extracted ? '已完成' : '未完成'}
                </span>
            </div>
            <div class="file-detail-item">
                <label>建立索引:</label>
                <span class="feature-status ${fileInfo.indexed ? 'enabled' : 'disabled'}">
                    <i class="fas fa-${fileInfo.indexed ? 'check-circle' : 'times-circle'}"></i>
                    ${fileInfo.indexed ? '已建立' : '未建立'}
                </span>
            </div>
            <div class="file-detail-item">
                <label>上传时间:</label>
                <span>${Utils.StringUtils.formatTime(fileInfo.created_at)}</span>
            </div>
            ${fileInfo.updated_at ? `
            <div class="file-detail-item">
                <label>更新时间:</label>
                <span>${Utils.StringUtils.formatTime(fileInfo.updated_at)}</span>
            </div>
            ` : ''}
        `;

        const contentContainer = Utils.DOM.$('#file-info-content');
        if (contentContainer) {
            contentContainer.innerHTML = content;
            Utils.Modal.show('#file-info-modal');
        }
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