-- ============================================================
-- Migrasi: Rekaman suara mic per ujian (Phase 1)
-- Jalankan di Supabase SQL Editor.
-- ============================================================

-- 1) Tambah kolom URL rekaman di tabel hasil ujian.
ALTER TABLE public.exam_results
    ADD COLUMN IF NOT EXISTS recording_url text;

-- 2) Buat bucket Storage untuk menyimpan file rekaman (publik, seperti 'exam_captures').
--    Kalau lebih nyaman lewat dashboard: Storage → New bucket → name "exam_recordings" → Public.
insert into storage.buckets (id, name, public)
values ('exam_recordings', 'exam_recordings', true)
on conflict (id) do nothing;

-- 3) (Opsional) Policy agar publik bisa MEMBACA file rekaman (untuk diputar di halaman wrapped nanti).
--    Upload dilakukan backend pakai service key, jadi cukup policy SELECT publik.
do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'Public read exam_recordings'
    ) then
        create policy "Public read exam_recordings"
            on storage.objects for select
            using ( bucket_id = 'exam_recordings' );
    end if;
end $$;
