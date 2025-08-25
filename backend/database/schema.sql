-- Dokumenta Portal Database Schema
-- Create database
CREATE DATABASE IF NOT EXISTS dokumenta_portal;
USE dokumenta_portal;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('user', 'admin') DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    user_id INT NOT NULL,
    document_type ENUM('racun', 'ugovor', 'izvod', 'potvrda', 'ostalo') NOT NULL,
    original_size INT NOT NULL,
    compressed_size INT NOT NULL,
    compression_ratio VARCHAR(10),
    comment TEXT,
    page_number INT DEFAULT 1,
    total_pages INT DEFAULT 1,
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    file_path VARCHAR(500) NOT NULL,
    processed BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_document_type (document_type),
    INDEX idx_upload_date (upload_date)
);

-- Admin users table (separate from regular users)
CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL
);

-- Upload sessions table (for tracking upload batches)
CREATE TABLE IF NOT EXISTS upload_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    session_token VARCHAR(255),
    documents_count INT DEFAULT 0,
    total_size INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert default users
INSERT IGNORE INTO users (username, password_hash, role) VALUES 
('demo', '$2b$10$dummy.hash.for.demo123', 'user');

-- Insert default admin
INSERT IGNORE INTO admin_users (username, password_hash) VALUES 
('admin', '$2b$10$dummy.hash.for.admin123');

-- Create indexes for performance
CREATE INDEX idx_filename ON documents(filename);
CREATE INDEX idx_processed ON documents(processed);
