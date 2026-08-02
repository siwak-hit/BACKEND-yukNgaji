-- ============================================================
-- Ujian Lisan v2 (bank perintah + sesi antrian anak)
-- Jalankan di Supabase SQL Editor.
--
-- Tabel oral_exam_* yang LAMA sengaja dibiarkan (riwayat nilai lama aman),
-- tapi sudah tidak dipakai kode manapun.
-- ============================================================

-- 1) Bank perintah. Guru bikin sekali, dipakai berulang di banyak sesi.
CREATE TABLE IF NOT EXISTS public.oral_prompts (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_by text,
    subject text NOT NULL,                      -- tajwid | fiqih | tauhid
    category text NOT NULL,                     -- sebutkan | jelaskan | bacakan | ...
    title text NOT NULL,                        -- teks perintahnya
    duration_seconds integer NOT NULL DEFAULT 30,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT oral_prompts_pkey PRIMARY KEY (id),
    CONSTRAINT oral_prompts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(username)
);
CREATE INDEX IF NOT EXISTS oral_prompts_owner_idx ON public.oral_prompts (created_by, subject);

-- 2) Sesi = 1 kelas. Jatah waktu per anak dipatok di sini.
CREATE TABLE IF NOT EXISTS public.oral_sessions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_by text,
    subject text NOT NULL,
    title text,
    per_student_seconds integer NOT NULL DEFAULT 300,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT oral_sessions_pkey PRIMARY KEY (id),
    CONSTRAINT oral_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(username)
);
CREATE INDEX IF NOT EXISTS oral_sessions_owner_idx ON public.oral_sessions (created_by, created_at DESC);

-- 3) Antrian anak dalam sesi + perintah yang dipilih untuk anak itu + hasilnya.
--    details = [{prompt_id,title,category,duration,used,outcome,score}] (diisi backend saat submit).
CREATE TABLE IF NOT EXISTS public.oral_session_students (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL,
    student_id uuid NOT NULL,
    order_index integer NOT NULL DEFAULT 0,
    prompt_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
    status text NOT NULL DEFAULT 'pending',     -- pending | done
    final_score integer,
    details jsonb NOT NULL DEFAULT '[]'::jsonb,
    done_at timestamp with time zone,
    CONSTRAINT oral_session_students_v2_pkey PRIMARY KEY (id),
    CONSTRAINT oral_session_students_v2_session_fkey FOREIGN KEY (session_id) REFERENCES public.oral_sessions(id) ON DELETE CASCADE,
    CONSTRAINT oral_session_students_v2_student_fkey FOREIGN KEY (student_id) REFERENCES public.students(id),
    CONSTRAINT oral_session_students_v2_unique UNIQUE (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS oral_session_students_student_idx ON public.oral_session_students (student_id, status);
