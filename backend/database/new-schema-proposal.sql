-- DOKUMENTA PORTAL - FINALNA STRUKTURA BAZE PODATAKA
-- Multi-tenant sistem za knjigovođe sa OneDrive integracijom

CREATE DATABASE IF NOT EXISTS dokumenta_portal;
USE dokumenta_portal;

-- ============================================================================
-- BRISANJE POSTOJEĆIH TABELA I STRUKTURA
-- ============================================================================

-- Prvo obrišemo views ako postoje
DROP VIEW IF EXISTS admin_sync_review_view;
DROP VIEW IF EXISTS user_documents_view;
DROP VIEW IF EXISTS admin_documents_view;

-- Disable foreign key checks da možemo da brišemo tabele u bilo kom redosledu
SET FOREIGN_KEY_CHECKS = 0;

-- Brišemo sve postojeće tabele (prema trenutnoj strukturi baze)
DROP TABLE IF EXISTS admin_aktivnosti;
DROP TABLE IF EXISTS dokument_strane;
DROP TABLE IF EXISTS klijenti_portal_users;
DROP TABLE IF EXISTS klijenti;
DROP TABLE IF EXISTS documents;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS admin_users;

-- Brišemo i tabele koje možda postoje ali nisu u trenutnoj strukturi
DROP TABLE IF EXISTS upload_sessions;
DROP TABLE IF EXISTS onedrive_sync_log;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS document_status_history;
DROP TABLE IF EXISTS notifications;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

COMMIT;

-- ============================================================================
-- KREIRANJE NOVIH TABELA
-- ============================================================================

-- ============================================================================
-- 1. ADMIN_USERS - Knjigovođe (glavni administratori)
-- ============================================================================
CREATE TABLE admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Podaci o knjigovođi/firmi
    company_name VARCHAR(200) NOT NULL,
    full_name VARCHAR(100),
    phone VARCHAR(20),
    address TEXT,
    pib VARCHAR(20),
    
    -- Subscription & limits
    subscription_plan ENUM('basic', 'premium', 'enterprise') DEFAULT 'basic',
    max_clients INT DEFAULT 10,
    max_storage_mb INT DEFAULT 1000,
    is_active BOOLEAN DEFAULT TRUE,
    trial_expires_at TIMESTAMP NULL,
    
    -- OneDrive integracija
    onedrive_access_token TEXT,
    onedrive_refresh_token TEXT,
    onedrive_tenant_id VARCHAR(255),
    onedrive_root_folder_id VARCHAR(255), -- '/Firme/' folder ID
    onedrive_connected_at TIMESTAMP NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    
    INDEX idx_email (email),
    INDEX idx_company (company_name),
    INDEX idx_active (is_active)
);

-- ============================================================================
-- 2. USERS - Klijenti knjigovođa (firme koje upload-uju dokumente)
-- ============================================================================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL, -- Kojoj knjigovođi pripada
    
    username VARCHAR(50) NOT NULL,
    email VARCHAR(100),
    password_hash VARCHAR(255) NOT NULL,
    
    -- Podaci o klijentu/firmi
    full_name VARCHAR(100) NOT NULL,
    company_name VARCHAR(200),
    phone VARCHAR(20),
    pib VARCHAR(20),
    address TEXT,
    
    -- Admin notes & status
    notes TEXT, -- Napomene knjigovođe o klijentu
    status ENUM('active', 'inactive', 'pending') DEFAULT 'active',
    
    -- OneDrive folder za ovog klijenta
    onedrive_company_folder_id VARCHAR(255), -- '/Firme/ABC_doo/' folder ID
    onedrive_folder_name VARCHAR(255), -- 'ABC_doo'
    
    created_by INT, -- Koji admin je kreirao
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    
    -- Username mora biti unique samo unutar admin-a
    UNIQUE KEY unique_username_per_admin (admin_id, username),
    UNIQUE KEY unique_email_per_admin (admin_id, email),
    
    INDEX idx_admin_user (admin_id, username),
    INDEX idx_status (status),
    INDEX idx_company (company_name)
);

-- ============================================================================
-- 3. DOCUMENTS - Glavni dokumenti sa workflow-om i OneDrive sync-om
-- ============================================================================
CREATE TABLE documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL, -- Data isolation po admin-u
    user_id INT NOT NULL,
    
    -- File info
    filename VARCHAR(255) NOT NULL, -- Stored filename
    original_name VARCHAR(255) NOT NULL, -- User uploaded name
    file_path VARCHAR(500) NOT NULL, -- Local storage path
    mime_type VARCHAR(100),
    original_size INT NOT NULL,
    compressed_size INT,
    compression_ratio DECIMAL(5,2),
    
    -- Document classification
    document_type ENUM('ulazni', 'izlazni', 'izvod') NOT NULL,
    document_subtype ENUM('racun', 'ugovor', 'potvrda', 'licna_karta', 'pasos', 'ostalo') NOT NULL,
    
    -- Workflow status
    status ENUM('uploaded', 'reviewed', 'approved', 'rejected', 'reshoot_requested') DEFAULT 'uploaded',
    admin_comment TEXT, -- Feedback od admin-a
    user_comment TEXT, -- Komentar korisnika
    
    -- Dates & review info
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_date TIMESTAMP NULL,
    reviewed_by INT NULL, -- Koji admin je review-ovao
    
    -- OneDrive sync - SUGGESTED paths (auto-generated)
    suggested_year INT, -- 2025
    suggested_month INT, -- 4 (april)
    suggested_onedrive_path VARCHAR(500), -- '/Firme/ABC/2025/ulazni/04_april/'
    
    -- OneDrive sync - ACTUAL paths (admin override)
    actual_year INT, -- 3 (admin changed to mart)
    actual_month INT, -- 3 (admin changed to mart)
    actual_onedrive_path VARCHAR(500), -- '/Firme/ABC/2025/ulazni/03_mart/'
    path_manually_set BOOLEAN DEFAULT FALSE,
    
    -- OneDrive status
    onedrive_file_id VARCHAR(255), -- File ID u OneDrive
    onedrive_download_url TEXT,
    onedrive_share_link TEXT,
    sync_status ENUM('pending', 'synced', 'failed', 'skipped') DEFAULT 'pending',
    sync_pending_review BOOLEAN DEFAULT TRUE, -- Čeka admin approval za sync
    onedrive_synced_at TIMESTAMP NULL,
    sync_error_message TEXT,
    
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES admin_users(id) ON DELETE SET NULL,
    
    INDEX idx_admin_user (admin_id, user_id),
    INDEX idx_status (status),
    INDEX idx_sync_status (sync_status),
    INDEX idx_sync_pending (sync_pending_review),
    INDEX idx_document_type (document_type),
    INDEX idx_upload_date (upload_date),
    INDEX idx_year_month (actual_year, actual_month)
);

-- ============================================================================
-- 4. NOTIFICATIONS - Notifikacije za korisnike o statusu dokumenata
-- ============================================================================
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    document_id INT, -- Može biti NULL za opšte notifikacije
    
    type ENUM('document_approved', 'document_rejected', 'reshoot_requested', 'document_synced', 'general') NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    
    INDEX idx_user_unread (user_id, is_read),
    INDEX idx_created (created_at)
);

-- ============================================================================
-- 5. DOCUMENT_STATUS_HISTORY - Audit trail svih promena statusa
-- ============================================================================
CREATE TABLE document_status_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT NOT NULL,
    
    old_status ENUM('uploaded', 'reviewed', 'approved', 'rejected', 'reshoot_requested'),
    new_status ENUM('uploaded', 'reviewed', 'approved', 'rejected', 'reshoot_requested'),
    
    changed_by INT NOT NULL, -- Admin koji je promenio
    comment TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES admin_users(id) ON DELETE CASCADE,
    
    INDEX idx_document (document_id),
    INDEX idx_created (created_at)
);

-- ============================================================================
-- 6. ONEDRIVE_SYNC_LOG - Log svih OneDrive operacija
-- ============================================================================
CREATE TABLE onedrive_sync_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    admin_id INT NOT NULL,
    document_id INT,
    
    action ENUM('upload', 'download', 'delete', 'update', 'folder_create') NOT NULL,
    status ENUM('success', 'failed', 'pending') NOT NULL,
    
    onedrive_path VARCHAR(500),
    onedrive_file_id VARCHAR(255),
    
    request_data JSON, -- OneDrive API request
    response_data JSON, -- OneDrive API response
    error_message TEXT,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    
    INDEX idx_admin_status (admin_id, status),
    INDEX idx_document (document_id),
    INDEX idx_created (created_at)
);

-- ============================================================================
-- 7. USER_SESSIONS - Mobile/Web session management
-- ============================================================================
CREATE TABLE user_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    
    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_info TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    
    INDEX idx_token (session_token),
    INDEX idx_user (user_id),
    INDEX idx_expires (expires_at)
);

-- ============================================================================
-- POČETNI PODACI
-- ============================================================================

-- Default admin (vi)
INSERT IGNORE INTO admin_users (
    username, email, password_hash, company_name, full_name, subscription_plan
) VALUES (
    'admin', 'admin@example.com', '$2b$10$dummy.hash.for.admin123', 
    'Vaša Knjigovodstvena Firma', 'Admin User', 'premium'
);

-- Demo korisnik za testiranje
INSERT IGNORE INTO users (
    admin_id, username, email, password_hash, full_name, company_name, created_by
) VALUES (
    1, 'demo', 'demo@example.com', '$2b$10$dummy.hash.for.demo123', 
    'Demo Korisnik', 'Demo Firma d.o.o.', 1
);

-- ============================================================================
-- INDEKSI ZA PERFORMANCE
-- ============================================================================

-- Composite indeksi za česte queries
CREATE INDEX idx_documents_admin_status ON documents(admin_id, status);
CREATE INDEX idx_documents_admin_sync ON documents(admin_id, sync_status);
CREATE INDEX idx_documents_user_status ON documents(user_id, status);
CREATE INDEX idx_notifications_user_type ON notifications(user_id, type);

-- ============================================================================
-- VIEWS ZA ČESTE QUERIES
-- ============================================================================

-- Admin dashboard - pregled svih dokumenata
CREATE VIEW admin_documents_view AS
SELECT 
    d.*,
    u.company_name as client_company,
    u.full_name as client_name,
    u.phone as client_phone,
    au.username as reviewed_by_username
FROM documents d
JOIN users u ON d.user_id = u.id
LEFT JOIN admin_users au ON d.reviewed_by = au.id;

-- User dashboard - korisnikovi dokumenti sa statusima
CREATE VIEW user_documents_view AS
SELECT 
    d.id,
    d.user_id,
    d.filename,
    d.original_name,
    d.document_type,
    d.document_subtype,
    d.status,
    d.admin_comment,
    d.upload_date,
    d.reviewed_date,
    CASE 
        WHEN d.sync_status = 'synced' THEN 'Sinhronizovano sa OneDrive'
        WHEN d.sync_status = 'pending' THEN 'Čeka sinhronizaciju'
        WHEN d.sync_status = 'failed' THEN 'Greška pri sinhronizaciji'
        ELSE 'Nije sinhronizovano'
    END as sync_status_text
FROM documents d;

-- Sync dashboard za admin-a
CREATE VIEW admin_sync_review_view AS
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

-- ============================================================================
-- KOMENTARI I OBJAŠNJENJA
-- ============================================================================

/*
KLJUČNE FUNKCIONALNOSTI:

1. MULTI-TENANT ISOLATION:
   - Svaki admin_id obezbeđuje potpunu separaciju podataka
   - Admin vidi samo svoje korisnike i dokumente

2. ONEDRIVE FLEXIBILITY:
   - Suggested paths (automatski generisani)
   - Actual paths (admin override)
   - Manual sync review process

3. WORKFLOW MANAGEMENT:
   - Document status lifecycle
   - Notifications sistem
   - History tracking

4. SCALABILITY:
   - Subscription plans
   - Storage limits
   - Performance indeksi

5. REAL-WORLD ACCOUNTING:
   - Podrška za vašu folder strukturu
   - Year/month/type organizacija
   - Bulk sync operations

USAGE EXAMPLES:

-- Admin vidi sve svoje dokumente
SELECT * FROM admin_documents_view WHERE admin_id = 1;

-- Dokumenti za sync review
SELECT * FROM admin_sync_review_view WHERE admin_id = 1;

-- Korisnikovi dokumenti
SELECT * FROM user_documents_view WHERE user_id = 1;

-- Notifikacije
SELECT * FROM notifications WHERE user_id = 1 AND is_read = FALSE;
*/
