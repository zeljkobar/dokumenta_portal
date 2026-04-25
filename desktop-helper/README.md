# Desktop Helper

Desktop helper aplikacija za lokalni sync dokumenata sa portala.

## Funkcije

- Admin login na portal (`/api/admin/login`)
- Ucitavanje dokumenata za helper (`/api/admin/helper/documents`)
- Download svakog dokumenta sa admin tokenom (`/api/admin/documents/:id/download`)
- Snimanje fajla u lokalnu strukturu foldera
- `mark-synced` poziv nakon uspesnog snimanja (`/api/admin/helper/documents/:id/mark-synced`)

## Pokretanje

```bash
cd desktop-helper
npm install
npm run dev
```

## Build

```bash
npm run build:mac
npm run build:win
```

Build artefakti idu u:

`../frontend/downloads/`
