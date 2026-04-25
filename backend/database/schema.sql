-- Dokumenta Portal database schema
-- Matches the current production database structure.

CREATE DATABASE IF NOT EXISTS dokumenta_portal;
USE dokumenta_portal;

-- Views depend on tables, so drop them first when recreating the schema.
DROP VIEW IF EXISTS admin_sync_review_view;
DROP VIEW IF EXISTS user_documents_view;
DROP VIEW IF EXISTS admin_documents_view;

CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,

    company_name VARCHAR(200) NOT NULL,
    full_name VARCHAR(100),
    phone VARCHAR(20),
    address TEXT,
    pib VARCHAR(20),

    subscription_plan ENUM('basic', 'premium', 'enterprise') DEFAULT 'basic',
    max_clients INT DEFAULT 10,
    max_storage_mb INT DEFAULT 1000,
    is_active BOOLEAN DEFAULT TRUE,
    trial_expires_at TIMESTAMP NULL,

    onedrive_access_token TEXT,
    onedrive_refresh_token TEXT,
    onedrive_tenant_id VARCHAR(255),
    onedrive_root_folder_id VARCHAR(255),
    onedrive_connected_at TIMESTAMP NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,

    INDEX idx_email (email),
    INDEX idx_company (company_name),
    INDEX idx_active (is_active)
);

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,

    username VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    password_hash VARCHAR(255) NOT NULL,

    full_name VARCHAR(100) NOT NULL,
    company_name VARCHAR(200),
    phone VARCHAR(20),
    pib VARCHAR(20),
    address TEXT,

    notes TEXT,
    status ENUM('active', 'inactive', 'pending') DEFAULT 'active',

    onedrive_company_folder_id VARCHAR(255),
    onedrive_folder_name VARCHAR(255),

    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,

    CONSTRAINT fk_users_admin
        FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_users_created_by
        FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,

    UNIQUE KEY unique_username_per_admin (admin_id, username),
    UNIQUE KEY unique_email_per_admin (admin_id, email),
    INDEX idx_admin_user (admin_id, username),
    INDEX idx_status (status),
    INDEX idx_company (company_name)
);

CREATE TABLE IF NOT EXISTS documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    user_id INT NOT NULL,

    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100),
    original_size INT NOT NULL,
    compressed_size INT,
    compression_ratio DECIMAL(5,2),

    document_type ENUM('ulazni', 'izlazni', 'izvod') NOT NULL,
    document_subtype ENUM('virman', 'gotovina', 'kartica', 'racun', 'ugovor', 'potvrda', 'licna_karta', 'pasos', 'ostalo') NOT NULL,

    status ENUM('uploaded', 'reviewed', 'approved', 'rejected', 'reshoot_requested') DEFAULT 'uploaded',
    admin_comment TEXT,
    user_comment TEXT,
    fiscalization_url VARCHAR(1000),

    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_date TIMESTAMP NULL,
    reviewed_by INT NULL,

    suggested_year INT,
    suggested_month INT,
    suggested_onedrive_path VARCHAR(500),

    actual_year INT,
    actual_month INT,
    actual_onedrive_path VARCHAR(500),
    path_manually_set BOOLEAN DEFAULT FALSE,

    onedrive_file_id VARCHAR(255),
    onedrive_download_url TEXT,
    onedrive_share_link TEXT,
    sync_status ENUM('pending', 'synced', 'failed', 'skipped') DEFAULT 'pending',
    sync_pending_review BOOLEAN DEFAULT TRUE,
    onedrive_synced_at TIMESTAMP NULL,
    sync_error_message TEXT,

    CONSTRAINT fk_documents_admin
        FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_documents_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_documents_reviewed_by
        FOREIGN KEY (reviewed_by) REFERENCES admin_users(id) ON DELETE SET NULL,

    INDEX idx_admin_user (admin_id, user_id),
    INDEX idx_status (status),
    INDEX idx_sync_status (sync_status),
    INDEX idx_sync_pending (sync_pending_review),
    INDEX idx_document_type (document_type),
    INDEX idx_upload_date (upload_date),
    INDEX idx_year_month (actual_year, actual_month),
    INDEX idx_documents_admin_status (admin_id, status),
    INDEX idx_documents_admin_sync (admin_id, sync_status),
    INDEX idx_documents_user_status (user_id, status)
);

CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    document_id INT,

    type ENUM('document_approved', 'document_rejected', 'reshoot_requested', 'document_synced', 'general') NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,

    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL,

    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_document
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,

    INDEX idx_user_unread (user_id, is_read),
    INDEX idx_created (created_at),
    INDEX idx_notifications_user_type (user_id, type)
);

CREATE TABLE IF NOT EXISTS document_status_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT NOT NULL,

    old_status ENUM('uploaded', 'reviewed', 'approved', 'rejected', 'reshoot_requested'),
    new_status ENUM('uploaded', 'reviewed', 'approved', 'rejected', 'reshoot_requested'),

    changed_by INT NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_status_history_document
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    CONSTRAINT fk_status_history_changed_by
        FOREIGN KEY (changed_by) REFERENCES admin_users(id) ON DELETE CASCADE,

    INDEX idx_document (document_id),
    INDEX idx_created (created_at)
);

CREATE TABLE IF NOT EXISTS onedrive_sync_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    document_id INT,

    action ENUM('upload', 'download', 'delete', 'update', 'folder_create') NOT NULL,
    status ENUM('success', 'failed', 'pending') NOT NULL,

    onedrive_path VARCHAR(500),
    onedrive_file_id VARCHAR(255),
    request_data LONGTEXT,
    response_data LONGTEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_onedrive_sync_admin
        FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    CONSTRAINT fk_onedrive_sync_document
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,

    INDEX idx_admin_status (admin_id, status),
    INDEX idx_document (document_id),
    INDEX idx_created (created_at)
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,

    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_info TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,

    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_user_sessions_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,

    INDEX idx_token (session_token),
    INDEX idx_user (user_id),
    INDEX idx_expires (expires_at)
);

CREATE OR REPLACE VIEW admin_documents_view AS
SELECT
    d.*,
    u.company_name AS client_company,
    u.full_name AS client_name,
    u.phone AS client_phone,
    au.username AS reviewed_by_username
FROM documents d
JOIN users u ON d.user_id = u.id
LEFT JOIN admin_users au ON d.reviewed_by = au.id;

CREATE OR REPLACE VIEW user_documents_view AS
SELECT
    d.id,
    d.user_id,
    d.filename,
    d.original_name,
    d.document_type,
    d.document_subtype,
    d.status,
    d.admin_comment,
    d.fiscalization_url,
    d.upload_date,
    d.reviewed_date,
    CASE
        WHEN d.sync_status = 'synced' THEN 'Sinhronizovano sa OneDrive'
        WHEN d.sync_status = 'pending' THEN 'Ceka sinhronizaciju'
        WHEN d.sync_status = 'failed' THEN 'Greska pri sinhronizaciji'
        ELSE 'Nije sinhronizovano'
    END AS sync_status_text
FROM documents d;

CREATE OR REPLACE VIEW admin_sync_review_view AS
SELECT
    d.id,
    d.admin_id,
    d.filename,
    d.original_name,
    u.company_name,
    d.suggested_onedrive_path,
    d.actual_onedrive_path,
    d.sync_pending_review,
    d.upload_date
FROM documents d
JOIN users u ON d.user_id = u.id
WHERE d.sync_pending_review = TRUE
ORDER BY d.upload_date DESC;
