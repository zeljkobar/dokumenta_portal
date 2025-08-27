# 📄 DOKUMENTA PORTAL - Projekat Dokumentacija

## 🎯 PREGLED PROJEKTA

**Cilj:** Kreiranje web portala za upload dokumenata od strane klijenata sa automatskim prebacivanjem na OneDrive

**URL:** `dokumenta.summasummarum.me`

**Tip:** Potpuno odvojen projekat od glavnog sajta

---

## 🏗️ ARHITEKTURA

### **Frontend:**

- [x] Mobile-first responsive design ✅ GOTOVO
- [x] Camera API za fotografisanje dokumenata ✅ GOTOVO
- [x] Multi-page document support ✅ GOTOVO
- [x] Real-time image compression ✅ GOTOVO
- [x] Preview functionality ✅ GOTOVO
- [x] File upload iz galerije ✅ GOTOVO

### **Backend:**

- [x] Node.js/Express server (port 3001) ✅ GOTOVO
- [x] JWT authentication ✅ GOTOVO
- [ ] Microsoft Graph API integracija
- [x] Multer za file upload ✅ GOTOVO
- [x] Sharp za image processing ✅ GOTOVO

### **Database:**

- [x] MySQL - nova baza `dokumenta_portal` ✅ GOTOVO
- [x] Potpuno odvojena od glavnog sajta ✅ GOTOVO
- [x] Novi database user `dokumenta_app` ✅ GOTOVO
- [x] Database tabele kreirane ✅ GOTOVO

### **Storage:**

- OneDrive via Microsoft Graph API
- Direktna integracija sa postojećom folder strukturom
- Automatska organizacija po klijentima/godinama/tipovima

---

## 📊 DATABASE STRUKTURA

### **Tabela: `klijenti`**

```sql
CREATE TABLE klijenti (
    id INT PRIMARY KEY AUTO_INCREMENT,
    ime_firme VARCHAR(255) NOT NULL,
    kontakt_osoba VARCHAR(255),
    email VARCHAR(255) UNIQUE NOT NULL,
    telefon VARCHAR(50),
    pib VARCHAR(20),
    adresa TEXT,
    napomene TEXT,
    onedrive_folder_name VARCHAR(255), -- npr. "MarkoPerovic"
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

### **Tabela: `klijenti_portal_users`**

```sql
CREATE TABLE klijenti_portal_users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    klijent_id INT NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status ENUM('active', 'inactive', 'pending') DEFAULT 'pending',
    last_login TIMESTAMP NULL,
    reset_token VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (klijent_id) REFERENCES klijenti(id) ON DELETE CASCADE
);
```

### **Tabela: `dokumenti`**

```sql
CREATE TABLE dokumenti (
    id INT PRIMARY KEY AUTO_INCREMENT,
    klijent_id INT NOT NULL,
    tip_dokumenta ENUM('racun', 'ugovor', 'izvod', 'potvrda', 'ostalo') NOT NULL,
    naziv_dokumenta VARCHAR(255) NOT NULL,
    napomena_klijenta TEXT,
    napomena_admina TEXT,
    status ENUM('novo', 'u_pregledu', 'potrebna_ponovna', 'u_obradi', 'zavrseno', 'preuzeto') DEFAULT 'novo',
    broj_strana INT DEFAULT 1,
    kompletnost ENUM('incomplete', 'complete') DEFAULT 'incomplete',
    onedrive_path VARCHAR(500), -- putanja na OneDrive
    upload_datum TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    preuzeto_datum TIMESTAMP NULL,
    admin_razlog TEXT, -- razlog zašto je potrebna nova slika
    FOREIGN KEY (klijent_id) REFERENCES klijenti(id) ON DELETE CASCADE
);
```

### **Tabela: `dokument_strane`**

```sql
CREATE TABLE dokument_strane (
    id INT PRIMARY KEY AUTO_INCREMENT,
    dokument_id INT NOT NULL,
    strana_broj INT NOT NULL,
    originalni_naziv VARCHAR(255),
    kompresovana_velicina INT, -- u bytes
    onedrive_file_id VARCHAR(255), -- Microsoft Graph file ID
    upload_datum TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dokument_id) REFERENCES dokumenti(id) ON DELETE CASCADE
);
```

### **Tabela: `admin_aktivnosti`**

```sql
CREATE TABLE admin_aktivnosti (
    id INT PRIMARY KEY AUTO_INCREMENT,
    dokument_id INT,
    akcija ENUM('preuzeo_dokument', 'zatrazio_novu_sliku', 'obrisao_dokument', 'promenio_status'),
    detalji JSON,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dokument_id) REFERENCES dokumenti(id) ON DELETE SET NULL
);
```

### **Tabela: `onedrive_mapping`**

```sql
CREATE TABLE onedrive_mapping (
    id INT PRIMARY KEY AUTO_INCREMENT,
    tip_dokumenta VARCHAR(50) NOT NULL,
    folder_path VARCHAR(255) NOT NULL, -- npr. "Ulazni_racuni"
    mesec_organizovan BOOLEAN DEFAULT TRUE
);

-- Default vrednosti
INSERT INTO onedrive_mapping (tip_dokumenta, folder_path) VALUES
('racun', 'Ulazni_racuni'),
('ugovor', 'Ugovori'),
('izvod', 'Bankovni_izvodi'),
('potvrda', 'Potvrde'),
('ostalo', 'Ostalo');
```

---

## 🔄 WORKFLOW DIJAGRAM

### **Klijentska Strana:**

```
1. Login → 2. Dashboard → 3. Novi Dokument
    ↓
4. Tip Dokumenta → 5. Camera Mode → 6. Slikanje Strana
    ↓
7. Preview → 8. Kompresija → 9. Upload → 10. Potvrda
```

### **Admin Strana:**

```
1. Lista Klijenata → 2. Novi Dokumenti Badge → 3. Pregled
    ↓
4. Status Akcije → 5. OneDrive Transfer → 6. Označavanje
```

---

## 📱 CAMERA MODE SPECIFIKACIJA

### **UI Flow:**

```
📷 POČETNI EKRAN
┌─────────────────────┐
│ Tip dokumenta: [▼] │
│ Napomena: [_______] │
│ [📷 POČNI SLIKANJE] │
└─────────────────────┘

📸 CAMERA INTERFACE
┌─────────────────────┐
│    LIVE PREVIEW     │
│  [dokument ovde]    │
│                     │
│ Saveti:             │
│ ✓ Osvetli dokument  │
│ ✓ Drži pravo        │
│ [  📸 SLIKAJ  ]     │
└─────────────────────┘

✅ NAKON SLIKE
┌─────────────────────┐
│ ✅ STRANA 1         │
│ [thumbnail preview] │
│                     │
│ [📷 DODAJ STRANU]   │
│ [✅ ZAVRŠI]         │
└─────────────────────┘
```

### **Tehnička Implementacija:**

- **getUserMedia()** API za kameru
- **Canvas** za image capture
- **Sharp.js** za kompresiju (70-85% kvalitet)
- **EXIF removal** za privatnost
- **Progressive resize:** maks 1920x1080px

---

## 🔐 MICROSOFT GRAPH API SETUP

### **App Registration (Azure Portal):**

1. portal.azure.com → App registrations → New registration
2. Name: "Dokumenta Portal"
3. Redirect URI: `https://dokumenta.summasummarum.me/auth/callback`

### **Permissions Needed:**

```
Files.ReadWrite.All (Delegated)
User.Read (Delegated)
```

### **Authentication Flow:**

```javascript
// config/onedrive.js
const clientId = "your-client-id";
const clientSecret = "your-client-secret";
const redirectUri = "https://dokumenta.summasummarum.me/auth/callback";
const scopes = ["Files.ReadWrite.All", "User.Read"];
```

### **OneDrive Folder Mapping:**

```
OneDrive/
├── {KlijentName}/
│   ├── 2025/
│   │   ├── Ulazni_racuni/
│   │   │   ├── 01_Januar/
│   │   │   ├── 02_Februar/
│   │   │   └── 08_Avgust/  ← upload ovde
│   │   ├── Ugovori/
│   │   └── Ostalo/
│   └── 2024/
└── {DrugiklijentName}/
```

---

## 🛠️ IMPLEMENTACIJA PLAN

### **FAZA 1: Osnovno (Dani 1-3)**

- [x] DNS A record setup (dokumenta.summasummarum.me) ✅ GOTOVO
- [x] Nginx konfiguracija i SSL sertifikat ✅ GOTOVO
- [x] Kreiranje novog Node.js projekta ✅ GOTOVO
- [x] Database setup i tabele ✅ GOTOVO
- [x] Basic authentication (login/logout) ✅ GOTOVO
- [x] Jednostavan file upload ✅ GOTOVO
- [x] PDF i image upload support ✅ GOTOVO
- [x] Admin panel - osnovni ✅ GOTOVO

### **FAZA 2: Core Features (Dani 4-7)**

- [x] Camera API implementacija ✅ GOTOVO
- [x] Multi-page document support ✅ GOTOVO
- [x] Image compression ✅ GOTOVO
- [ ] Microsoft Graph API integracija
- [x] Basic admin panel ✅ GOTOVO

### **FAZA 3: Advanced Features (Dani 8-10)**

- [ ] OneDrive folder auto-organization
- [ ] Status management sistem
- [ ] Email notifikacije
- [ ] Bulk download funkcionalnost
- [ ] Mobile UI optimizacija

### **FAZA 4: Production (Dani 11-14)**

- [ ] Nginx konfiguracija
- [ ] SSL sertifikat
- [ ] Production deployment
- [ ] Testing sa pravim klijentima
- [ ] Performance optimizacija

---

## 📋 TEKNIČKI STACK

### **Backend Dependencies:**

```json
{
  "express": "^4.18.2",
  "mysql2": "^3.6.0",
  "bcryptjs": "^2.4.3",
  "jsonwebtoken": "^9.0.2",
  "multer": "^1.4.5-lts.1",
  "sharp": "^0.32.5",
  "@azure/msal-node": "^2.0.0",
  "axios": "^1.5.0",
  "cors": "^2.8.5",
  "helmet": "^7.0.0",
  "rate-limiter-flexible": "^3.0.0"
}
```

### **Frontend Stack:**

- Vanilla JavaScript (mobile optimized)
- Bootstrap 5 za UI
- Camera API
- Canvas za image processing
- Service Worker za offline support

---

## 🔒 SIGURNOST

### **Authentication:**

- JWT tokens sa 24h expiry
- Bcrypt password hashing (12 rounds)
- Rate limiting na login endpoint

### **File Upload:**

- MIME type validation
- File size limits (10MB max)
- Virus scanning (ClamAV)
- Secure filename generation

### **API Security:**

- CORS konfiguracija
- Helmet.js za HTTP headers
- Request validation middleware
- SQL injection protection

---

## 📊 MONITORING I MAINTENANCE

### **Logs:**

- Morgan za HTTP request logs
- Winston za application logs
- Separate error logging
- OneDrive API call tracking

### **Backup Strategy:**

- Database backup (daily)
- OneDrive = primary storage
- Local temp storage cleanup (7 dana)

### **Performance Metrics:**

- Upload success rate
- Image compression ratio
- OneDrive API response times
- User session duration

---

## 🚀 DEPLOYMENT CHECKLIST

### **Server Setup:**

- [ ] Node.js 18+ instaliran
- [ ] MySQL database kreirana
- [ ] Nginx virtual host konfigurisan
- [ ] SSL sertifikat aktiviran
- [ ] Firewall rules postavljen

### **Environment Variables:**

```bash
# .env file
NODE_ENV=production
PORT=3001
DB_HOST=localhost
DB_USER=dokumenta_app
DB_PASSWORD=secure_password
DB_NAME=dokumenta_portal
JWT_SECRET=your-jwt-secret
ONEDRIVE_CLIENT_ID=your-client-id
ONEDRIVE_CLIENT_SECRET=your-client-secret
```

### **PM2 Process Management:**

```bash
pm2 start app.js --name "dokumenta-portal"
pm2 startup
pm2 save
```

---

## 📞 SUPPORT I ODRŽAVANJE

### **Česti Problemi:**

1. **OneDrive API rate limiting** → Implement exponential backoff
2. **Large file uploads** → Progressive upload chunks
3. **Mobile camera issues** → Fallback to file input
4. **SSL certificate renewal** → Certbot auto-renewal

### **Update Procedure:**

1. Git pull latest changes
2. npm install (if package.json changed)
3. Run database migrations
4. pm2 reload dokumenta-portal
5. Test critical paths

---

## 📈 BUDUĆE OPTIMIZACIJE

### **V2 Features:**

- [ ] OCR za automatsko čitanje faktura
- [ ] AI kategorization dokumenata
- [ ] WhatsApp integration
- [ ] Mobile app (React Native)
- [ ] Bulk operations API

### **Scalability:**

- [ ] Redis cache layer
- [ ] CDN za static assets
- [ ] Database read replicas
- [ ] Horizontal scaling sa Load Balancer

---

**Kreirao:** GitHub Copilot  
**Datum:** August 26, 2025  
**Status:** FAZA 1 i 2 ZAVRŠENE - Core funkcionalnost radi!  
**Sledeći korak:** Microsoft Graph API integracija za OneDrive

---

## ✅ ZAVRŠENE FUNKCIONALNOSTI

### **Korisnici mogu:**

- ✅ Da se login-uju na portal
- ✅ Da uploaduju dokumente (slike i PDF-ove)
- ✅ Da koriste kameru za slikanje dokumenata
- ✅ Da dodaju više strana dokumenta
- ✅ Da biraju tip dokumenta
- ✅ Da dodaju komentare
- ✅ Da vide listu svojih dokumenata

### **Admin može:**

- ✅ Da se login-uje na admin panel
- ✅ Da vidi sve dokumente svih korisnika
- ✅ Da vidi statistike
- ✅ Da upravlja korisnicima
- ✅ Da preuzima dokumente

### **Sistem:**

- ✅ Kompresuje slike automatski (80% kvalitet)
- ✅ Podržava PDF i sve image formate
- ✅ Responsive dizajn za mobile i desktop
- ✅ Bezbednost - JWT autentifikacija
- ✅ Upload progress indicator
- ✅ Error handling

---

## 🔄 TRENUTNI STATUS

Portal je **FUNKCIONALAN** i radi lokalno i na produkciji!
Upload bug je **REŠEN** - problem je bio u neusklađenosti naziva polja (document vs file).
