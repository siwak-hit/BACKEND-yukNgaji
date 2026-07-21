-- Pengingat kaleng infaq: catat kapan terakhir guru mengirim push (batasan 1x/24 jam).
-- Push subscription murid TIDAK di sini — sudah di tabel push_subscriptions (per device).
ALTER TABLE students
ADD COLUMN IF NOT EXISTS last_infaq_reminded_at timestamp with time zone NULL;

-- Kolom lama yang tidak dipakai lagi (subscription per-murid di students). Aman dihapus.
ALTER TABLE students DROP COLUMN IF EXISTS push_subscription;