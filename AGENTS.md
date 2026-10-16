# AGENTS.md — Halaman Approval Budget Plan (MRP)

Project fullstack terpisah: **Express (API) + React (Vite)**. Menulis langsung ke tabel
yang sama dengan aplikasi CodeIgniter (`BMC.dbo.PURCH_MRP`), jadi nama kolom harus
identik agar badge approval di `listmrp` ikut terupdate.

Sumber kebenaran pemetaan tahap ada di `server/src/config/stages.ts`. Mengubah nama
kolom di sana akan membuat badge di halaman `listmrp` tidak sinkron.

Tahap 1 memakai `ApprovalMgr_*` (bukan `Approval_shName`) dengan sengaja, supaya cocok
dengan badge di `listmrp`. **TODO: konfirmasi ke tim bahwa ini memang yang dikehendaki.**

Data nyata menunjukkan `PURCH_MRP` sebenarnya punya **9 tahap**, bukan 7:

| # | Tahap | Kolom nama | Kolom tanggal |
|---|-------|-----------|--------------|
| 8 | Direktur | `ApprovalDirektur_By` | `ApprovalDirektur_Date` |
| 9 | Presdir | `ApprovalPresdir_By` | `ApprovalPresdir_Date` |

Kedua tahap itu nyata terisi di database dan muncul di `Status_Info`
("Req Authorized to Dept.Head Finance Accounting, Direktur, Presiden Direktur").
Kolom `Approval_shName` / `Approval_shDate` juga ada dan ikut terisi.
**`STAGES` di `server/src/config/stages.ts` saat ini hanya memuat 7 tahap**, sehingga
`computeStatus()` akan menganggap MRP selesai padahal masih ada approval alkaline
Direktur dan Presdir. **Jangan dipublikasikan sebelum tim mengonfirmasi urutan
tahap yang benar.**

## Pemetaan tahap approval (WAJIB DIPATUHI)

| # | Tahap | Kolom nama | Kolom tanggal |
|---|-------|-----------|--------------|
| 1 | Section Head | `ApprovalMgr_By` | `ApprovalMgr_Date` |
| 2 | Group Head | `Approval_ghName` | `Approval_ghDate` |
| 3 | Dept. Head | `Approval_dhName` | `Approval_dhDate` |
| 4 | Internal Control | `ApprovalIc_By` | `ApprovalIc_Date` |
| 5 | Koor. Procurement | `ApprovalProc_By` | `ApprovalProc_Date` |
| 6 | Group Head Fin-Acc | `ApprovalGhFa_By` | `ApprovalGhFa_Date` |
| 7 | Dept Head Finance | `ApprovalCfo_By` | `ApprovalCfo_Date` |

Tabel turunan:

| Tabel | Dipakai untuk |
|---|---|
| `BMC.dbo.PURCH_MRP` | header + baris material + kolom approval |
| `BMC.dbo.PURCH_MRP_NOTE` | `Total`, `Note`, `DepartID` |
| `hris_Employee` | `NIP`, `Name`, `DepartID`, `Phone` |
| `MASCOSTCENTER` | `DepartID`, `NamaDepartemen` |

## Menjalankan

```bash
npm install
Copy-Item .env.example .env
npm run dev          # API :3001, client :5173
npm test             # 56 test
npm run check:db -w server   # cek koneksi SQL Server + baca nama kolom asli
```

Mode data dummy (tanpa database, untuk merapikan tampilan):
```bash
DUMMY_MODE=true  # taruh di .env, WAJIB false di production
# buka http://localhost:5173/approve?token=dummy
```

## Aturan yang tidak boleh dilanggar

1. **Anti race condition** — `UPDATE` approval selalu memakai guard
   `WHERE MRPNo = @mrpNo AND <kolom tanggal tahap ini> IS NULL`, lalu memeriksa
   `rowsAffected`. 0 berarti `already_processed`. Lihat
   `server/src/db/queries/approval.ts` dan `submitDecision()`.
2. **Token selalu diverifikasi di server.** Isi token tidak pernah dipercaya begitu saja.
3. **Tahap bergeser hanya dari tahapan yang benar-benar terisi.** `computeStatus()` di
   `server/src/services/approval.ts` adalah satu-satunya tempat penentuan status.
4. **Semua query parameterized.** Nama kolom datang dari konfigurasi, bukan dari input user.
5. **Nilai placeholder `-` tidak boleh ditulis ke kolom approval** — merusak badge `listmrp`.
6. `TOKEN_SECRET` dan `API_KEY` hanya di server, tidak masuk repo, tidak masuk log,
   tidak dikirim ke client. Log token hanya 8 karakter pertama (`tokenForLog`).

## Endpoint

| Method | Path | Auth |
|---|---|---|
| POST | `/api/mrpApproval/createLink` | header `x-api-key` |
| GET | `/api/mrpApproval/detail?token=` | token |
| POST | `/api/mrpApproval/submit` | token |

Kegagalan `detail` dan `submit` dibalas **HTTP 200** dengan `{ success: false, reason, message }`.

## Open item (jangan ditebak)

| # | Item | Lokasi |
|---|---|---|
| 1 | Angka status `5` (selesai/ditutup) belum terverifikasi dari `update_approvalmrp()` | `services/approval.ts` |
| 2 | Nama kolom baris material masih placeholder | `config/mrpColumns.ts` |
| 3 | Belum ada kolom penyimpanan alasan reject | `db/queries/approval.ts` |
| 4 | `Approval` berisi angka urut, bukan kode tahap | `config/env.ts` |
| 5 | Urutan 9 tahap (ada Direktur & Presdir) belum dikonfirmasi | `config/stages.ts` |

Untuk item 2, jalankan `npm run check:db -w server` — skripnya mencetak daftar kolom
nyata dan kandidat pola nama.

## Temuan dari data nyata (SQL Server 2019, 2026-10-16)

Verified langsung ke `10.19.25.27` dengan `npm run check:db -w server` dan
`npm run inspect -w server` (39.279 baris `PURCH_MRP`). Yang berbeda dari asumsi awal:

| Temuan | Kenyataan | Dampak |
|---|---|---|
| Kolom `Approval` | Berisi `"1"` atau `"3"` (angka, `nchar`) | Menulis kode tahap seperti `GH` akan merusak listmrp |
| Kolom `Approval_Info` | Teks bebas, mis. `"Req Approval Manager"` | Kode tahap tidak cocok |
| Kolom `Status` | `1` = "Req Approval Manager", `3` = "Informing to BOD" | Angka status di spesifikasi belum cocok |
| `MRPDate` | `varchar`, isinya `"2026-10"`, bukan tanggal | `periodeFrom()` harus tahu format ini |
| `PURCH_MRP_NOTE.Total` | `varchar`, bukan numerik | Harus diparse dari teks |
| `MaterialId`, `UoM` | `nchar`/`char`, selalu ada spasi di kanan | Semua teks wajib `trim()` |
| Nama material | **Tidak ada** di `PURCH_MRP` | Harus join ke `MATERIAL_NAME` atau `MAS_MATERIAL` |

Karena temuan `Approval` dan `Status`, penulisan kolom ringkasan **dimatikan secara
bawaan** lewat `WRITE_STATUS_SUMMARY=false`. Server hanya menulis kolom tahap
(`ApprovalMgr_By` + `ApprovalMgr_Date`), yang itu memang kontrak dari spesifikasi.

## Jebakan yang sudah pernah terjadi

- `mssql` adalah paket CommonJS. Di Node ESM, `import { ConnectionPool } from 'mssql'`
  membuat server gagal start dengan "does not provide an export named 'ConnectionPool'",
  padahal `tsc` dan test tetap hijau. Pakai default import lalu destructure.
- Handler async di Express 4 melempar exception tanpa respons apa pun. Semua route
  async wajib dibungkus `asyncHandler`.
- `Set-Content` di PowerShell menghapus baris baru saat menulis ulang file. Pakai
  tool edit, bukan `Set-Content`, untuk file sumber.