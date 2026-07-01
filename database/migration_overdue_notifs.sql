-- =====================================================================
-- MIGRATION: Log push "tugas lewat deadline" (biar tidak dikirim berulang)
-- Jalankan di Supabase SQL Editor.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.overdue_notifs (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    subject    text NOT NULL,
    week       integer NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT overdue_notifs_unique UNIQUE (student_id, subject, week)
);
