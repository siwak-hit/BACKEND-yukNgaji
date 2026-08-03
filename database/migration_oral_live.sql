-- ============================================================
-- Ujian Lisan — mode 2 device (layar guru + layar murid)
-- Jalankan di Supabase SQL Editor.
--
-- live_code  : kode acak buat link layar murid (/tampil/<kode>), dibuat otomatis
--              saat sesi pertama kali dibuka.
-- live_state : satu-satunya "kabel" antara dua device. Guru menulis, layar murid
--              membaca tiap detik. Bentuknya:
--              {phase, name, category, title, index, total, prep, duration, startAt, score, details}
--              phase: idle | ready | run | result
-- ============================================================

ALTER TABLE public.oral_sessions
    ADD COLUMN IF NOT EXISTS live_code  text,
    ADD COLUMN IF NOT EXISTS live_state jsonb NOT NULL DEFAULT '{"phase":"idle"}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS oral_sessions_live_code_idx
    ON public.oral_sessions (live_code) WHERE live_code IS NOT NULL;
