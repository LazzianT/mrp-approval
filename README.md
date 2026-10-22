# Halaman Approval Budget Plan (MRP)

Aplikasi web fullstack terpisah untuk approval Budget Plan (MRP) oleh atasan pemohon.
Dibuka dari link yang dikirim via WhatsApp. Tidak ada login: keamanan memakai token bertanda tangan.

- **Backend** — Express 4 + TypeScript (ESM) + SQL Server (`mssql`/tedious)
- **Frontend** — React 18 + Vite + Tailwind + TanStack Query
- Satu origin di production, tanpa CORS.

## Ringkasan

Link approval berbentuk `/approve?token=...`. Token berisi `{ mrpNo, tahap, exp, nonce }`
yang ditandatangani HMAC-SHA256 dan berlaku 72 jam. Semua keputusan approval diverifikasi
**di server** dan ditulis ke tabel yang sama dengan aplikasi CodeIgniter
(`BMC.dbo.PURCH_MRP`), memakai nama kolom yang identik agar badge di halaman `listmrp`
ikut terupdate.

## Menjalankan secara lokal

Prasyarat: Node.js 22 LTS atau lebih baru, dan akses ke SQL Server.

```bash
npm install
copy .env.example .env      # di PowerShell: Copy-Item .env.example .env
```

Isi `.env` dengan kredensial SQL Server yang dipakai aplikasi CodeIgniter
(salin dari `application/config/database.php`, group `default`, repo internal).
Lokal: `APP_URL=http://localhost:5173`. Production: `APP_URL` wajib HTTPS; isi
`PUBLIC_APP_URL=http://10.19.25.29:3014` bila link dibuka dari jaringan internal.

```bash
npm run dev
```

- Client: <http://localhost:5173>
- API: <http://localhost:3001>

Development memakai proxy Vite (`/api` -> `http://localhost:3001`), jadi **tidak ada CORS sama sekali**.

## Membuat link untuk pengujian

Cara tercepat tanpa menjalankan server:

```bash
npm run token -w server -- "MRP/2026/10/001" SH
npm run token -w server -- "MRP/2026/10/001" SH 5678            # sertakan NIP approver
npm run token -w server -- "MRP/2026/10/001" SH --expired       # sengaja kedaluwarsa
```

Tahap yang tersedia: `SH`, `GH`, `DH`, `IC`, `PROC`, `GHFA`, `CFO`.

Cara lain, lewat API (butuh header `x-api-key`):

```bash
curl -X POST http://localhost:3001/api/mrpApproval/createLink \
  -H "x-api-key: <API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"mrpNo":"MRP/2026/10/001","tahap":"SH"}'
```

## Build & deploy

Lokal:
```bash
npm run build
npm start
```

Portainer/Docker:
```bash
docker compose up -d --build
```
Frontend host: `http://10.19.25.29:3014`; backend host: `http://10.19.25.29:3015`.
Isi environment variables stack di Portainer; compose tidak membutuhkan file `.env`. Jangan commit secret.

Di production:

- `NODE_ENV=production`
- `APP_URL` wajib `https://...` (server menolak start kalau tidak)
- Letakkan di belakang reverse proxy yang Termination TLS
- `TOKEN_SECRET` dan `API_KEY` hanya di server, jangan pernah masuk repo atau bundle client

## Endpoint

| Method | Path | Auth | Keterangan |
|---|---|---|---|
| POST | `/api/mrpApproval/createLink` | `x-api-key` | Membuat token + URL. Body: `{ mrpNo, tahap?, approverNip? }` |
| GET | `/api/mrpApproval/detail?token=` | token | Detail MRP untuk approval |
| POST | `/api/mrpApproval/submit` | token | Body: `{ token, decision: "approve"\|"reject", note? }` |

Kegagalan pada `detail` dan `submit` dibalas **HTTP 200** dengan `{ success: false, reason, message }`
supaya frontend cukup membaca satu bentuk respons. `reason` yang mungkin muncul:
`expired`, `invalid`, `already_processed`, `not_found`, `stage_mismatch`, `validation_error`.

`createLink` dan endpoint yang tidak dikenal tetap memakai HTTP error biasa
(401, 400, 404, 429, 500).

## Pengujian end-to-end

1. Siapkan satu MRP yang semua kolom tanggal approval-nya masih NULL.
2. Jalankan `npm run dev`.
3. Buat link:
   ```bash
   npm run token -w server -- "MRP/2026/10/001" SH
   ```
4. Buka URL yang muncul di browser (atau di HP untuk menguji tampilan mobile).
5. Tekan **Setujui**.
6. Cek `SELECT ApprovalMgr_By, ApprovalMgr_Date, Status, Status_Info, Approval, Approval_Info FROM BMC.dbo.PURCH_MRP WHERE MRPNo = 'MRP/2026/10/001'`
   -> `ApprovalMgr_Date` terisi, `Status` = 3, `Approval` = `GH`.
7. Buka `listmrp` di aplikasi CodeIgniter -> badge tahap Section Head harus hijau.
8. Uji klik ganda: tekan Setujui dua kali cepat, atau buka link di dua tab.
   Hanya satu yang tersimpan, yang lain menampilkan "sudah diproses".
9. Uji penolakan: klik **Tolak** tanpa alasan -> pesan validasi, tidak ada request terkirim.
10. Uji token rusak: ubah satu karakter pada URL -> halaman menampilkan "Tautan tidak dapat diproses".
11. Uji token kedaluwarsa: buat token dengan `--expired` -> halaman "Tautan sudah kedaluwarsa".

## Test

```bash
npm test          # server: token, approval service, level HTTP, dan mode dummy
npm run typecheck
```

## Hal yang masih perlu dikonfirmasi tim

Tiga hal berikut ditandai di kode dengan `TODO: konfirmasi ke tim` dan sengaja
tidak ditebak:

1. **Status angka 5 (selesai/ditutup)** — belum terverifikasi dari
   `update_approvalmrp()` di aplikasi CodeIgniter. Seluruh penentuan status hanya
   melewati `computeStatus()` di `server/src/services/approval.ts`.
2. **Nama kolom baris material** di `BMC.dbo.PURCH_MRP` belum diketahui.
   Ada di satu tempat saja: `MRP_MATERIAL_COLUMNS` pada
   `server/src/config/mrpColumns.ts`. Selama masih placeholder, server memberi
   peringatan saat start.
3. **Penyimpanan alasan reject** — belum ada kolom yang ditentukan. Saat ini
   alasan reject hanya tercatat di log server, tidak ditulis ke database.

Perlu dicek juga ke tim: tahap 1 memakai `ApprovalMgr_*` (bukan `Approval_shName`)
sesuai badge di halaman `listmrp`.

## Struktur

```
mrp-approval/
├── server/
│   ├── scripts/generate-token.ts
│   ├── src/
│   │   ├── index.ts                 # Express, static client di production
│   │   ├── config/env.ts            # validasi env (zod)
│   │   ├── config/stages.ts         # pemetaan tahap -> kolom (WAJIB tidak diubah)
│   │   ├── config/mrpColumns.ts     # pemetaan kolom database
│   │   ├── db/pool.ts               # SQL Server + abstraksi Executor
│   │   ├── db/queries/{mrp,approval}.ts
│   │   ├── services/token.ts        # token bertanda tangan
│   │   ├── services/approval.ts     # detail, submit, perhitungan status
│   │   ├── routes/mrpApproval.ts
│   │   └── middleware/
│   └── test/
└── client/src/
    ├── api/            # http + mrpApproval
    ├── components/     # Header, MrpInfo, SummaryCard, MaterialTable, HistoryList, ...
    ├── hooks/          # useApprovalDetail, useApprovalSubmit
    ├── pages/ApprovePage.tsx
    ├── types/          # approval.ts
    └── utils/          # formatRupiah, formatDate
```

## Out of scope

Tidak ada login/register, tidak ada halaman selain `/approve`, tidak ada generate MRP,
edit material, upload file, PDF, dan tidak ada pengiriman WhatsApp dari project ini
(itulah urusan backend CodeIgniter).
## Mode data dummy

Untuk merapikan tampilan tanpa koneksi database:

`ash
# taruh di .env
DUMMY_MODE=true

npm run dev
`

Buka <http://localhost:5173/approve?token=dummy>. Server tidak menyentuh SQL Server
sama sekali dan memakai data contoh. DUMMY_MODE=true ditolak saat
`NODE_ENV=production`.

## Cek koneksi database

`ash
npm run check:db -w server
`

Skrip ini mencetak daftar kolom asli `BMC.dbo.PURCH_MRP` beserta kandidat nama kolom
material, untuk mengisi `MRP_MATERIAL_COLUMNS` yang sekarang masih placeholder.
