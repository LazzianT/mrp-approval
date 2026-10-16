# Prompt 2 — Perubahan di aplikasi CodeIgniter

Semua perubahan berikut untuk repo `https://app.bmc.co.id/webapps`, file
`application/controllers/online_pr.php`.

> **Status: belum diterapkan.** Repo tersebut tidak ada di mesin kerja ini
> (`online_pr.php` dan `mrplist.php` tidak ditemukan di seluruh drive D:).
> Dokumen ini adalah perubahan siap tempel dalam bentuk diff. Baris cari dengan
> nama method, bukan nomor baris.

## Config/env key baru

| Key | Dipakai di | Nilai |
|---|---|---|
| `MRP_APPROVAL_API_URL` | server CI (env) | `https://<host approval>` |
| `MRP_APPROVAL_API_KEY` | server CI (env) | sama dengan `API_KEY` di `.env` project approval |

File konfigurasi: `application/config/approval_api.php` (sudah disiapkan di
`ci-integration/application/config/approval_api.php`). API key dibaca dari
environment variable supaya tidak hardcode di dalam repo.

## 1. Tautan di pesan WA

### `build_mrp_approval_wa_message()`

Tambahkan parameter `$approverNip` di awal method, karena nama approver
menjadi bagian dari token (project approval butuh NIP untuk menulis nama ke
kolom approval).

```php
public function build_mrp_approval_wa_message($mrpNo, $approverNip = null)
{
    // ... bagian atas method yang sudah ada tetap ...

    // Link approval diambil dari API project approval baru.
    // Kalau API gagal, method ini mengembalikan null supaya pemanggil
    // membatalkan pengiriman dan menampilkan pesan error ke user,
    // bukan mengirim pesan berisi link rusak.
    $link = $this->mrp_approval_api_create_link($mrpNo, 'SH', $approverNip);
    if ($link === null) {
        return null;
    }

    // Ganti baris lama:
    //   $pesan .= base_url('online_pr/listmrp') . "\n\n";
    // menjadi:
    $pesan .= "Silakan buka tautan berikut untuk melakukan approval:\n";
    $pesan .= $link . "\n\n";
    $pesan .= "Tautan berlaku 72 jam.\n\n";

    // ... sisa method yang sudah ada ...
}
```

Seluruh pemanggil `build_mrp_approval_wa_message()` (di `previewMrpApprovalWa()`
dan `sendMrpApprovalWa()`) harus ikut mengoper NIP atasan dan memeriksa hasil
`null`:

```php
$message = $this->build_mrp_approval_wa_message($mrpNo, $nipAtasan);
if ($message === null) {
    // jangan lanjut kirim; kembalikan success = false ke frontend
}
```

### Helper baru `mrp_approval_api_create_link()`

Letakkan di controller yang sama, di dekat `sendMrpApprovalWa()`.

```php
private function mrp_approval_api_create_link($mrpNo, $tahap = 'SH', $approverNip = null)
{
    $baseUrl = $this->config->item('mrp_approval_api_url');
    $apiKey  = $this->config->item('mrp_approval_api_key');
    $timeout = (int) $this->config->item('mrp_approval_api_timeout');

    if (empty($baseUrl) || $baseUrl === '' || empty($apiKey)) {
        log_message('error', 'MRP approval: API URL atau API key belum dikonfigurasi. mrpNo=' . $mrpNo);
        return null;
    }

    $payload = array('mrpNo' => $mrpNo, 'tahap' => $tahap);
    if (!empty($approverNip)) {
        $payload['approverNip'] = $approverNip;
    }

    $ch = curl_init(rtrim($baseUrl, '/') . '/api/mrpApproval/createLink');
    curl_setopt_array($ch, array(
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => $timeout > 0 ? $timeout : 15,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_HTTPHEADER     => array(
            'Content-Type: application/json',
            'x-api-key: ' . $apiKey,
        ),
        CURLOPT_POSTFIELDS     => json_encode($payload),
    ));

    $body    = curl_exec($ch);
    $curlErr = curl_error($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    // API tidak terjangkau -> tidak boleh jatuh diam, tapi tetap tidak kirim pesan rusak.
    if ($body === false || $curlErr !== '') {
        log_message('error', 'MRP approval: cURL gagal. ' . $curlErr . ' mrpNo=' . $mrpNo);
        return null;
    }

    $result = json_decode($body, true);
    if ($httpCode !== 200 || empty($result['success']) || empty($result['url'])) {
        log_message('error', 'MRP approval: API menolak. http=' . $httpCode . ' mrpNo=' . $mrpNo);
        return null;
    }

    return $result['url'];
}
```

## 2. Matikan mode uji

Di `sendMrpApprovalWa()`, hapus blok berikut:

```php
// =========================================================
// SEMENTARA (QA): semua pesan dikirim ke nomor uji coba.
$phoneUjiCoba = '6281977785738';
$phoneAsli    = $phone;
$phone        = $phoneUjiCoba;
// =========================================================
```

Serta:

- `$phone` kembali ke `hris_Employee.Phone` milik atasan.
- Aktifkan kembali validasi "nomor WhatsApp kosong".
- Hapus `$phoneAsli` kalau tidak dipakai lagi di tempat lain pada method itu.
- Hapus field `mode_uji` dari response JSON.
- Field `atasan` **tetap dipertahankan** untuk audit.

## 3. Rapikan response

`sendMrpApprovalWa()` harus selalu mengembalikan `success` + `message`, bukan
hanya `status`, supaya frontend bisa menampilkan error dengan benar. Contoh
pola untuk kasus gagal saat link tidak berhasil dibuat:

```php
echo json_encode(array(
    'success'  => false,
    'message'  => 'Gagal membuat tautan approval. Silakan coba lagi.',
));
return;
```

## Yang tidak diubah

- Layout/UI halaman `listmrp`.
- Alur Simpan Approval (sudah dihapus sebelumnya).
- Project approval Express.

## Verifikasi end-to-end

1. Deploy project approval dengan `APP_URL` dan `API_KEY` yang benar.
2. Set `MRP_APPROVAL_API_URL` dan `MRP_APPROVAL_API_KEY` di server CI, restart PHP.
3. Cek log CI untuk memastikan tidak ada `MRP approval: ...` error.
4. Di `listmrp`, klik "Kirim Reminder Approval" untuk satu MRP uji.
5. Pastikan pesan diterima di nomor WhatsApp **atasan yang sebenarnya** (bukan
   nomor uji coba).
6. Buka link dari HP. Halaman harus menampilkan detail MRP dan badge tahap.
7. Tekan **Setujui**.
8. Query untuk memastikan kolom yang benar terisi:
   ```sql
   SELECT MRPNo, ApprovalMgr_By, ApprovalMgr_Date, Status, Status_Info,
          Approval, Approval_Info
   FROM BMC.dbo.PURCH_MRP
   WHERE MRPNo = '<MRPNo uji>';
   ```
   `ApprovalMgr_Date` terisi, `Status` = 3, `Approval` = `GH`.
9. Buka ulang `listmrp` -> badge tahap Section Head harus hijau.
10. Klik "Kirim Reminder" lagi untuk MRP yang sama. Pesan tetap terkirim ke
    atasan, dan ketika link dibuka lagi halaman menampilkan "sudah diproses",
    bukan error.
11. Matikan API approval sementara, lalu coba "Kirim Reminder". Pesan **tidak**
    boleh terkirim, dan frontend menampilkan pesan error.