-- =====================================================================
-- MIGRATION: Sistem Waktu PR (manual per-tugas, perpanjangan, sekali pakai)
-- Jalankan di Supabase SQL Editor.
-- =====================================================================

-- [BUG #1] Cegah duplikat pr_locks yang bikin .single() error 500.
-- De-dupe dulu baru pasang UNIQUE biar upsert(onConflict) jalan benar.
DELETE FROM public.pr_locks a USING public.pr_locks b
WHERE a.id < b.id AND a.subject = b.subject AND a.week = b.week;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pr_locks_subject_week_unique'
  ) THEN
    ALTER TABLE public.pr_locks
      ADD CONSTRAINT pr_locks_subject_week_unique UNIQUE (subject, week);
  END IF;
END $$;

-- [2.1] Durasi pengerjaan PR yang bisa diatur guru per tugas (dalam detik).
-- NULL = pakai default lama (minggu 1 = 105 dtk, lainnya = 180 dtk).
ALTER TABLE public.pr_locks
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

-- [2.2 / 2.7] Perluas tabel permohonan: jenis permohonan, penambahan waktu,
-- dan penanda sekali-pakai (sudah dipakai / hangus).
ALTER TABLE public.pr_extension_requests
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'late';      -- 'late' | 'extra_time'
ALTER TABLE public.pr_extension_requests
  ADD COLUMN IF NOT EXISTS extra_seconds integer DEFAULT 0;        -- utk kind = extra_time
ALTER TABLE public.pr_extension_requests
  ADD COLUMN IF NOT EXISTS is_used boolean NOT NULL DEFAULT false; -- link sudah dibuka & dikerjakan
ALTER TABLE public.pr_extension_requests
  ADD COLUMN IF NOT EXISTS used_at timestamp with time zone;
ALTER TABLE public.pr_extension_requests
  ADD COLUMN IF NOT EXISTS token text;                            -- token link sakti per-murid

-- Indeks bantu pencarian "permohonan apapun utk PR ini" (enforce sekali permohonan)
CREATE INDEX IF NOT EXISTS idx_pr_ext_student_pr
  ON public.pr_extension_requests (student_id, subject, week);

CREATE INDEX IF NOT EXISTS idx_pr_ext_token
  ON public.pr_extension_requests (token);

-- [Gap 1: ganti device] Simpan checkpoint pengerjaan PR di server supaya bisa
-- dilanjutkan dari HP/browser lain (localStorage tidak ikut pindah device).
-- Per (student_id, subject, week). session_end = timestamp absolut kapan waktu habis.
CREATE TABLE IF NOT EXISTS public.pr_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  subject text NOT NULL,
  week integer NOT NULL,
  question_ids jsonb DEFAULT '[]'::jsonb,
  answers jsonb DEFAULT '{}'::jsonb,
  current_index integer DEFAULT 0,
  session_end timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT pr_drafts_student_subject_week_unique UNIQUE (student_id, subject, week),
  CONSTRAINT pr_drafts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
