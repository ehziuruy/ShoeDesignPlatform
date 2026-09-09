-- ShoeDesignPlatform 数据库初始化脚本
-- 使用方法：mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS shoe_design_platform
    DEFAULT CHARACTER SET utf8mb4
    DEFAULT COLLATE utf8mb4_unicode_ci;

USE shoe_design_platform;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '用户ID',
    username VARCHAR(50) NOT NULL UNIQUE COMMENT '用户名',
    email VARCHAR(100) NULL UNIQUE COMMENT '邮箱（可选）',
    password_hash VARCHAR(255) NOT NULL COMMENT '密码哈希（bcrypt）',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = '用户表';

-- 项目表（鞋款设计项目）
CREATE TABLE IF NOT EXISTS projects (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT '项目ID',
    user_id BIGINT UNSIGNED NOT NULL COMMENT '所属用户ID',
    project_name VARCHAR(100) NOT NULL COMMENT '项目名称',
    file_path VARCHAR(255) NOT NULL COMMENT '模型文件路径',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' COMMENT '项目状态：draft/editing/completed/archived',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    CONSTRAINT fk_projects_user
        FOREIGN KEY (user_id) REFERENCES users (id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    INDEX idx_projects_user_id (user_id),
    INDEX idx_projects_status (status)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci
  COMMENT = '设计项目表';
