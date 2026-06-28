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
    CONSTRAINT push_subscriptions_endpoint_unique UNIQUE (endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_student ON public.push_subscriptions (student_id);
