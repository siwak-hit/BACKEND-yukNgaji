-- =====================================================================
-- MIGRATION: Login murid + Pengaduan murid (Frontend Siswa)
-- Jalankan di Supabase SQL Editor.
-- =====================================================================

-- 1) Kolom password untuk login murid.
--    Diisi otomatis oleh script: BACKEND/scripts/seedStudentPasswords.js
--    (password = nama + '123').
ALTER TABLE public.students
    ADD COLUMN IF NOT EXISTS password text;

-- 2) Tabel pengaduan murid -> guru ("chat 2").
--    Aturan: 1 pengaduan 'open' per murid. Murid tidak bisa kirim lagi
--    sampai guru menandai 'resolved'.
CREATE TABLE IF NOT EXISTS public.student_reports (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    category    text,
    message     text NOT NULL,
    status      text NOT NULL DEFAULT 'open',   -- 'open' | 'resolved'
    created_at  timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    resolved_at timestamp with time zone
);

-- Index bantu untuk cek "ada open?" dan daftar guru.
CREATE INDEX IF NOT EXISTS idx_student_reports_student_status
    ON public.student_reports (student_id, status);
