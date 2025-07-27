-- PDF智能文件管理系统数据库初始化脚本
-- 创建时间: 2024-01-01
-- 版本: 1.0.0

-- 创建数据库
CREATE DATABASE IF NOT EXISTS pdf_ai_doc DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE pdf_ai_doc;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    email VARCHAR(100) UNIQUE COMMENT '邮箱',
    password_hash VARCHAR(255) NOT NULL COMMENT '密码哈希',
    role ENUM('admin', 'user') DEFAULT 'user' COMMENT '用户角色',
    status ENUM('active', 'inactive', 'banned') DEFAULT 'active' COMMENT '用户状态',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_status (status)
) COMMENT = '用户表';

-- 文件表
CREATE TABLE IF NOT EXISTS files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT '用户ID',
    original_name VARCHAR(255) NOT NULL COMMENT '原始文件名',
    stored_name VARCHAR(255) NOT NULL COMMENT '存储文件名',
    file_path VARCHAR(500) NOT NULL COMMENT '文件路径',
    file_size BIGINT NOT NULL COMMENT '文件大小(字节)',
    file_hash VARCHAR(64) UNIQUE COMMENT '文件MD5哈希',
    upload_status ENUM('uploading', 'uploaded', 'failed') DEFAULT 'uploading' COMMENT '上传状态',
    process_status ENUM('pending', 'processing', 'completed', 'failed') DEFAULT 'pending' COMMENT '处理状态',
    process_progress INT DEFAULT 0 COMMENT '处理进度(0-100)',
    content_extracted BOOLEAN DEFAULT FALSE COMMENT '是否已提取内容',
    indexed BOOLEAN DEFAULT FALSE COMMENT '是否已建立索引',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_user_id (user_id),
    INDEX idx_upload_status (upload_status),
    INDEX idx_process_status (process_status),
    INDEX idx_file_hash (file_hash),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) COMMENT = '文件表';

-- 文档内容表
CREATE TABLE IF NOT EXISTS document_contents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_id INT NOT NULL COMMENT '文件ID',
    content_type ENUM('text', 'table', 'image', 'chart') NOT NULL COMMENT '内容类型',
    page_number INT NOT NULL COMMENT '页码',
    position_x FLOAT COMMENT 'X坐标位置',
    position_y FLOAT COMMENT 'Y坐标位置',
    width FLOAT COMMENT '宽度',
    height FLOAT COMMENT '高度',
    content_text TEXT COMMENT '文本内容',
    content_metadata JSON COMMENT '内容元数据',
    extraction_confidence FLOAT DEFAULT 0.0 COMMENT '提取置信度',
    vector_id VARCHAR(100) COMMENT '向量数据库ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_file_id (file_id),
    INDEX idx_content_type (content_type),
    INDEX idx_page_number (page_number),
    INDEX idx_vector_id (vector_id),
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
) COMMENT = '文档内容表';

-- 文档摘要表
CREATE TABLE IF NOT EXISTS document_summaries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_id INT NOT NULL COMMENT '文件ID',
    summary_type ENUM('full', 'chapter', 'page') NOT NULL COMMENT '摘要类型',
    summary_content TEXT NOT NULL COMMENT '摘要内容',
    keywords JSON COMMENT '关键词列表',
    page_range VARCHAR(50) COMMENT '页面范围',
    confidence_score FLOAT DEFAULT 0.0 COMMENT '置信度分数',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_file_id (file_id),
    INDEX idx_summary_type (summary_type),
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
) COMMENT = '文档摘要表';

-- 实体表
CREATE TABLE IF NOT EXISTS entities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_id INT NOT NULL COMMENT '文件ID',
    entity_type ENUM('person', 'organization', 'location', 'time', 'concept', 'other') NOT NULL COMMENT '实体类型',
    entity_name VARCHAR(255) NOT NULL COMMENT '实体名称',
    entity_value TEXT COMMENT '实体值',
    confidence_score FLOAT DEFAULT 0.0 COMMENT '置信度分数',
    page_number INT COMMENT '所在页码',
    position_info JSON COMMENT '位置信息',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_file_id (file_id),
    INDEX idx_entity_type (entity_type),
    INDEX idx_entity_name (entity_name),
    INDEX idx_page_number (page_number),
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
) COMMENT = '实体表';

-- 实体关系表
CREATE TABLE IF NOT EXISTS entity_relations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_id INT NOT NULL COMMENT '文件ID',
    source_entity_id INT NOT NULL COMMENT '源实体ID',
    target_entity_id INT NOT NULL COMMENT '目标实体ID',
    relation_type VARCHAR(100) NOT NULL COMMENT '关系类型',
    relation_strength FLOAT DEFAULT 0.0 COMMENT '关系强度',
    confidence_score FLOAT DEFAULT 0.0 COMMENT '置信度分数',
    context_info TEXT COMMENT '上下文信息',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_file_id (file_id),
    INDEX idx_source_entity (source_entity_id),
    INDEX idx_target_entity (target_entity_id),
    INDEX idx_relation_type (relation_type),
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (source_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
    FOREIGN KEY (target_entity_id) REFERENCES entities(id) ON DELETE CASCADE
) COMMENT = '实体关系表';

-- 搜索历史表
CREATE TABLE IF NOT EXISTS search_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT '用户ID',
    search_query TEXT NOT NULL COMMENT '搜索查询',
    search_type ENUM('semantic', 'keyword', 'graph') DEFAULT 'semantic' COMMENT '搜索类型',
    file_ids JSON COMMENT '涉及的文件ID列表',
    result_count INT DEFAULT 0 COMMENT '结果数量',
    response_time FLOAT COMMENT '响应时间(秒)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_user_id (user_id),
    INDEX idx_search_type (search_type),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) COMMENT = '搜索历史表';

-- 对话会话表
CREATE TABLE IF NOT EXISTS chat_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT '用户ID',
    session_name VARCHAR(255) COMMENT '会话名称',
    session_status ENUM('active', 'archived', 'deleted') DEFAULT 'active' COMMENT '会话状态',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_user_id (user_id),
    INDEX idx_session_status (session_status),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) COMMENT = '对话会话表';

-- 对话消息表
CREATE TABLE IF NOT EXISTS chat_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id INT NOT NULL COMMENT '会话ID',
    message_type ENUM('user', 'assistant', 'system') NOT NULL COMMENT '消息类型',
    message_content TEXT NOT NULL COMMENT '消息内容',
    related_file_ids JSON COMMENT '相关文件ID列表',
    search_results JSON COMMENT '搜索结果',
    response_sources JSON COMMENT '回答来源',
    processing_time FLOAT COMMENT '处理时间(秒)',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_session_id (session_id),
    INDEX idx_message_type (message_type),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
) COMMENT = '对话消息表';

-- 任务队列表
CREATE TABLE IF NOT EXISTS task_queue (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_type ENUM('file_process', 'content_extract', 'index_build', 'search_query') NOT NULL COMMENT '任务类型',
    task_id VARCHAR(100) UNIQUE NOT NULL COMMENT '任务ID',
    file_id INT COMMENT '相关文件ID',
    user_id INT COMMENT '用户ID',
    task_params JSON COMMENT '任务参数',
    task_status ENUM('pending', 'running', 'completed', 'failed', 'cancelled') DEFAULT 'pending' COMMENT '任务状态',
    progress INT DEFAULT 0 COMMENT '任务进度(0-100)',
    error_message TEXT COMMENT '错误信息',
    started_at TIMESTAMP NULL COMMENT '开始时间',
    completed_at TIMESTAMP NULL COMMENT '完成时间',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_task_type (task_type),
    INDEX idx_task_id (task_id),
    INDEX idx_task_status (task_status),
    INDEX idx_file_id (file_id),
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) COMMENT = '任务队列表';

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_configs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL COMMENT '配置键',
    config_value TEXT COMMENT '配置值',
    config_type ENUM('string', 'int', 'float', 'boolean', 'json') DEFAULT 'string' COMMENT '配置类型',
    description TEXT COMMENT '配置描述',
    is_editable BOOLEAN DEFAULT TRUE COMMENT '是否可编辑',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_config_key (config_key)
) COMMENT = '系统配置表';

-- 系统日志表
CREATE TABLE IF NOT EXISTS system_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    log_level ENUM('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL') NOT NULL COMMENT '日志级别',
    log_source VARCHAR(100) COMMENT '日志来源',
    log_message TEXT NOT NULL COMMENT '日志消息',
    log_data JSON COMMENT '日志数据',
    user_id INT COMMENT '用户ID',
    file_id INT COMMENT '文件ID',
    task_id VARCHAR(100) COMMENT '任务ID',
    ip_address VARCHAR(45) COMMENT 'IP地址',
    user_agent TEXT COMMENT '用户代理',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_log_level (log_level),
    INDEX idx_log_source (log_source),
    INDEX idx_user_id (user_id),
    INDEX idx_file_id (file_id),
    INDEX idx_task_id (task_id),
    INDEX idx_created_at (created_at)
) COMMENT = '系统日志表';

-- 插入默认系统配置
INSERT INTO system_configs (config_key, config_value, config_type, description, is_editable) VALUES
('max_file_size', '104857600', 'int', '最大文件大小(字节)', TRUE),
('allowed_file_types', '["pdf"]', 'json', '允许的文件类型', TRUE),
('default_page_size', '20', 'int', '默认分页大小', TRUE),
('search_timeout', '30', 'int', '搜索超时时间(秒)', TRUE),
('processing_timeout', '300', 'int', '文件处理超时时间(秒)', TRUE),
('max_concurrent_tasks', '5', 'int', '最大并发任务数', TRUE),
('vector_similarity_threshold', '0.7', 'float', '向量相似度阈值', TRUE),
('enable_gpu_acceleration', 'false', 'boolean', '启用GPU加速', TRUE),
('system_initialized', 'false', 'boolean', '系统是否已初始化', FALSE);

-- 插入默认管理员用户
INSERT INTO users (username, email, password_hash, role, status) VALUES
('admin', 'admin@example.com', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/lewKI0nKj08MFGHqe', 'admin', 'active');

-- 创建触发器：文件删除时清理相关数据
DELIMITER //

CREATE TRIGGER before_files_delete
BEFORE DELETE ON files
FOR EACH ROW
BEGIN
    -- 删除文档内容
    DELETE FROM document_contents WHERE file_id = OLD.id;
    -- 删除文档摘要
    DELETE FROM document_summaries WHERE file_id = OLD.id;
    -- 删除实体关系
    DELETE FROM entity_relations WHERE file_id = OLD.id;
    -- 删除实体
    DELETE FROM entities WHERE file_id = OLD.id;
    -- 清理任务队列
    UPDATE task_queue SET task_status = 'cancelled' WHERE file_id = OLD.id AND task_status IN ('pending', 'running');
END //

-- 创建触发器：更新文件处理进度
CREATE TRIGGER after_document_contents_insert
AFTER INSERT ON document_contents
FOR EACH ROW
BEGIN
    DECLARE total_pages INT DEFAULT 0;
    DECLARE processed_pages INT DEFAULT 0;
    DECLARE progress_percent INT DEFAULT 0;
    
    -- 获取总页数（假设从文件元数据中获取，这里简化处理）
    SELECT JSON_EXTRACT(content_metadata, '$.total_pages') INTO total_pages
    FROM document_contents 
    WHERE file_id = NEW.file_id 
    LIMIT 1;
    
    -- 获取已处理页数
    SELECT COUNT(DISTINCT page_number) INTO processed_pages
    FROM document_contents 
    WHERE file_id = NEW.file_id;
    
    -- 计算进度百分比
    IF total_pages > 0 THEN
        SET progress_percent = ROUND((processed_pages * 100.0) / total_pages);
    END IF;
    
    -- 更新文件处理进度
    UPDATE files 
    SET process_progress = progress_percent,
        process_status = CASE 
            WHEN progress_percent >= 100 THEN 'completed'
            WHEN progress_percent > 0 THEN 'processing'
            ELSE process_status
        END,
        content_extracted = TRUE
    WHERE id = NEW.file_id;
END //

DELIMITER ;

-- 创建索引优化查询性能
CREATE INDEX idx_document_contents_composite ON document_contents(file_id, content_type, page_number);
CREATE INDEX idx_entities_composite ON entities(file_id, entity_type, entity_name);
CREATE INDEX idx_chat_messages_composite ON chat_messages(session_id, message_type, created_at);
CREATE INDEX idx_task_queue_composite ON task_queue(task_status, task_type, created_at);

-- 显示表结构信息
SHOW TABLES;

-- 显示创建完成信息
SELECT 'PDF智能文件管理系统数据库初始化完成!' as message; 