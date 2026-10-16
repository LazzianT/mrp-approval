<?php
defined('BASEPATH') or exit('No direct script access allowed');

/*
|--------------------------------------------------------------------------
| Konfigurasi API Approval Budget Plan
|--------------------------------------------------------------------------
|
| Dipakai controller online_pr untuk membuat tautan approval lewat WhatsApp.
| Nilai dibaca dari environment variable kalau ada, supaya tidak perlu
| menaruh API key langsung di file konfigurasi yang ikut ter-deploy.
|
| Environment variable yang perlu diset di server:
|   MRP_APPROVAL_API_URL   contoh: https://approval.bmc.co.id
|   MRP_APPROVAL_API_KEY   nilai yang sama dengan API_KEY di .env project approval
|
*/

$config['mrp_approval_api_url'] = getenv('MRP_APPROVAL_API_URL') ?: 'https://REPLACE-WITH-APPROVAL-HOST';
$config['mrp_approval_api_key'] = getenv('MRP_APPROVAL_API_KEY') ?: '';
$config['mrp_approval_api_timeout'] = 15;