-- =====================================================================
-- MIGRATION: Push subscriptions (web push notif murid)
-- Jalankan di Supabase SQL Editor.
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id   uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    endpoint     text NOT NULL,
    subscription jsonb NOT NULL,
    created_at   timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    -- Unik per (murid, device). 1 HP boleh menyimpan subscription >1 murid (gantian login)
    -- sehingga notif tetap sampai & disapa dengan nama masing-masing.
    CONSTRAINT push_subscriptions_student_endpoint_unique UNIQUE (student_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_student ON public.push_subscriptions (student_id);

-- Kalau sebelumnya sudah terlanjur pakai UNIQUE(endpoint), tukar ke UNIQUE(student_id, endpoint).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_endpoint_unique') THEN
    ALTER TABLE public.push_subscriptions DROP CONSTRAINT push_subscriptions_endpoint_unique;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_student_endpoint_unique') THEN
    ALTER TABLE public.push_subscriptions ADD CONSTRAINT push_subscriptions_student_endpoint_unique UNIQUE (student_id, endpoint);
  END IF;
END $$;
