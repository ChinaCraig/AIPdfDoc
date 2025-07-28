/**
 * API接口管理
 * 封装所有后端API调用
 */

class ApiClient {
    constructor(baseURL = '/api') {
        this.baseURL = baseURL;
        this.defaultTimeout = 30000; // 30秒
        this.retryCount = 3;
    }

    /**
     * 发送HTTP请求
     */
    async request(url, options = {}) {
        const config = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            timeout: this.defaultTimeout,
            ...options
        };

        // 添加基础URL
        const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), config.timeout);

            const response = await fetch(fullUrl, {
                ...config,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // 检查响应状态
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
            }

            // 解析响应
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text();
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('请求超时');
            }
            throw error;
        }
    }

    /**
     * GET请求
     */
    async get(url, params = {}) {
        const searchParams = new URLSearchParams(params);
        const queryString = searchParams.toString();
        const fullUrl = queryString ? `${url}?${queryString}` : url;
        
        return this.request(fullUrl, { method: 'GET' });
    }

    /**
     * POST请求
     */
    async post(url, data = {}, options = {}) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(data),
            ...options
        });
    }

    /**
     * PUT请求
     */
    async put(url, data = {}) {
        return this.request(url, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    /**
     * DELETE请求
     */
    async delete(url, params = {}) {
        const searchParams = new URLSearchParams(params);
        const queryString = searchParams.toString();
        const fullUrl = queryString ? `${url}?${queryString}` : url;
        
        return this.request(fullUrl, { method: 'DELETE' });
    }

    /**
     * 上传文件
     */
    async upload(url, file, onProgress = null) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('user_id', Utils.CONSTANTS.USER_ID);

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            // 进度监听
            if (onProgress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = (e.loaded / e.total) * 100;
                        onProgress(percentComplete);
                    }
                });
            }

            // 完成监听
            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (error) {
                        reject(new Error('响应解析失败'));
                    }
                } else {
                    try {
                        const errorResponse = JSON.parse(xhr.responseText);
                        reject(new Error(errorResponse.message || `HTTP ${xhr.status}`));
                    } catch (error) {
                        reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
                    }
                }
            });

            // 错误监听
            xhr.addEventListener('error', () => {
                reject(new Error('网络错误'));
            });

            // 超时监听
            xhr.addEventListener('timeout', () => {
                reject(new Error('请求超时'));
            });

            // 发送请求
            xhr.timeout = this.defaultTimeout;
            xhr.open('POST', `${this.baseURL}${url}`);
            xhr.send(formData);
        });
    }
}

// 创建API客户端实例
const apiClient = new ApiClient();

// 文件管理API
const FileAPI = {
    /**
     * 上传文件
     */
    async uploadFile(file, onProgress) {
        return apiClient.upload('/file/upload', file, onProgress);
    },

    /**
     * 获取文件列表
     */
    async getFileList(page = 1, pageSize = 20, keyword = '') {
        const params = {
            user_id: Utils.CONSTANTS.USER_ID,
            page,
            page_size: pageSize
        };

        if (keyword) {
            params.keyword = keyword;
        }

        return apiClient.get('/file/list', params);
    },

    /**
     * 删除文件
     */
    async deleteFile(fileId) {
        return apiClient.delete(`/file/delete/${fileId}`, {
            user_id: Utils.CONSTANTS.USER_ID
        });
    },

    /**
     * 批量删除文件
     */
    async batchDeleteFiles(fileIds) {
        return apiClient.post('/file/batch/delete', {
            file_ids: fileIds,
            user_id: Utils.CONSTANTS.USER_ID
        });
    },

    /**
     * 重命名文件
     */
    async renameFile(fileId, newName) {
        return apiClient.put(`/file/rename/${fileId}`, {
            new_name: newName,
            user_id: Utils.CONSTANTS.USER_ID
        });
    },

    /**
     * 获取文件处理状态
     */
    async getFileStatus(fileId) {
        return apiClient.get(`/file/status/${fileId}`, {
            user_id: Utils.CONSTANTS.USER_ID
        });
    },

    /**
     * 搜索文件
     */
    async searchFiles(keyword, page = 1, pageSize = 20) {
        return apiClient.get('/file/search', {
            user_id: Utils.CONSTANTS.USER_ID,
            keyword,
            page,
            page_size: pageSize
        });
    },

    /**
     * 获取文件详细信息
     */
    async getFileInfo(fileId) {
        return apiClient.get(`/file/info/${fileId}`, {
            user_id: Utils.CONSTANTS.USER_ID
        });
    }
};

// 智能检索API
const SearchAPI = {
    /**
     * 创建聊天会话
     */
    async createSession(sessionName = '') {
        return apiClient.post('/search/session/create', {
            user_id: Utils.CONSTANTS.USER_ID,
            session_name: sessionName
        });
    },

    /**
     * 智能检索问答
     */
    async searchQuery(sessionId, query, fileIds = []) {
        return apiClient.post('/search/query', {
            session_id: sessionId,
            user_id: Utils.CONSTANTS.USER_ID,
            query,
            file_ids: fileIds
        });
    },

    /**
     * 流式智能检索
     */
    async searchStream(sessionId, query, fileIds = [], onMessage) {
        const response = await fetch(`${apiClient.baseURL}/search/stream`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: sessionId,
                user_id: Utils.CONSTANTS.USER_ID,
                query,
                file_ids: fileIds
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            onMessage(data);
                        } catch (e) {
                            console.error('解析流数据失败:', e);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    },

    /**
     * 获取聊天历史
     */
    async getChatHistory(sessionId, page = 1, pageSize = 20) {
        return apiClient.get(`/search/history/${sessionId}`, {
            user_id: Utils.CONSTANTS.USER_ID,
            page,
            page_size: pageSize
        });
    },

    /**
     * 获取用户会话列表
     */
    async getUserSessions() {
        return apiClient.get('/search/sessions', {
            user_id: Utils.CONSTANTS.USER_ID
        });
    },

    /**
     * 删除会话
     */
    async deleteSession(sessionId) {
        return apiClient.delete(`/search/session/delete/${sessionId}`, {
            user_id: Utils.CONSTANTS.USER_ID
        });
    },

    /**
     * 重命名会话
     */
    async renameSession(sessionId, newName) {
        return apiClient.put(`/search/session/rename/${sessionId}`, {
            user_id: Utils.CONSTANTS.USER_ID,
            new_name: newName
        });
    },

    /**
     * 获取搜索建议
     */
    async getSearchSuggestions(keyword, limit = 5) {
        return apiClient.get('/search/suggestions', {
            user_id: Utils.CONSTANTS.USER_ID,
            keyword,
            limit
        });
    },

    /**
     * 获取搜索分析统计
     */
    async getSearchAnalytics(days = 7) {
        return apiClient.get('/search/analytics', {
            user_id: Utils.CONSTANTS.USER_ID,
            days
        });
    }
};

// 请求重试器
class RequestRetrier {
    constructor(maxRetries = 3, delay = 1000) {
        this.maxRetries = maxRetries;
        this.delay = delay;
    }

    async execute(requestFn, ...args) {
        let lastError;
        
        for (let i = 0; i <= this.maxRetries; i++) {
            try {
                return await requestFn(...args);
            } catch (error) {
                lastError = error;
                
                if (i === this.maxRetries) {
                    break;
                }
                
                // 只对网络错误进行重试
                if (this.shouldRetry(error)) {
                    await this.wait(this.delay * Math.pow(2, i)); // 指数退避
                } else {
                    break;
                }
            }
        }
        
        throw lastError;
    }

    shouldRetry(error) {
        // 网络错误或服务器错误（5xx）重试
        return error.message.includes('网络') || 
               error.message.includes('timeout') ||
               error.message.includes('500') ||
               error.message.includes('502') ||
               error.message.includes('503') ||
               error.message.includes('504');
    }

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// 创建重试器实例
const retrier = new RequestRetrier();

// 带重试的API包装器
const ReliableAPI = {
    FileAPI: {},
    SearchAPI: {}
};

// 为所有API方法添加重试功能
Object.keys(FileAPI).forEach(method => {
    ReliableAPI.FileAPI[method] = (...args) => retrier.execute(() => FileAPI[method](...args));
});

Object.keys(SearchAPI).forEach(method => {
    ReliableAPI.SearchAPI[method] = (...args) => retrier.execute(() => SearchAPI[method](...args));
});

// 请求拦截器
const RequestInterceptor = {
    requestQueue: new Map(),
    
    /**
     * 添加请求到队列
     */
    addRequest(key, promise) {
        this.requestQueue.set(key, promise);
        
        promise.finally(() => {
            this.requestQueue.delete(key);
        });
        
        return promise;
    },
    
    /**
     * 取消重复请求
     */
    cancelDuplicate(key) {
        if (this.requestQueue.has(key)) {
            return this.requestQueue.get(key);
        }
        return null;
    },
    
    /**
     * 取消所有请求
     */
    cancelAll() {
        this.requestQueue.clear();
    }
};

// 缓存管理器
const CacheManager = {
    cache: new Map(),
    defaultTTL: 5 * 60 * 1000, // 5分钟
    
    /**
     * 设置缓存
     */
    set(key, data, ttl = this.defaultTTL) {
        const expireTime = Date.now() + ttl;
        this.cache.set(key, { data, expireTime });
    },
    
    /**
     * 获取缓存
     */
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() > item.expireTime) {
            this.cache.delete(key);
            return null;
        }
        
        return item.data;
    },
    
    /**
     * 删除缓存
     */
    delete(key) {
        this.cache.delete(key);
    },
    
    /**
     * 清空缓存
     */
    clear() {
        this.cache.clear();
    },
    
    /**
     * 带缓存的请求
     */
    async withCache(key, requestFn, ttl) {
        const cached = this.get(key);
        if (cached) {
            return cached;
        }
        
        const data = await requestFn();
        this.set(key, data, ttl);
        return data;
    }
};

// 导出API
window.API = {
    FileAPI: ReliableAPI.FileAPI,
    SearchAPI: ReliableAPI.SearchAPI,
    Cache: CacheManager,
    Interceptor: RequestInterceptor
}; 