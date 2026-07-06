-- ============================================================
-- Migrasi: Setoran bacaan siswa + rekaman (Fase D)
-- Jalankan di Supabase SQL Editor.
-- ============================================================
create table if not exists public.tajwid_submissions (
    id            bigint generated always as identity primary key,
    exercise_id   bigint references public.tajwid_exercises(id) on delete cascade,
    ayat_id       bigint not null,
    student_id    text,          -- students.id = UUID, jadi text
    student_name  text,
    audio_url     text,
    ai_score      int,
    ai_detail     jsonb,
    transcript    text,
    final_score   int,          -- diisi guru saat koreksi
    teacher_note  text,
    status        text default 'pending',   -- pending | reviewed
    created_at    timestamptz default now(),
    updated_at    timestamptz default now(),
    unique (exercise_id, ayat_id, student_id)
);

create index if not exists idx_tajwid_sub_ex on public.tajwid_submissions (exercise_id);

-- Bucket rekaman suara siswa (publik untuk diputar guru), pola seperti exam_recordings.
insert into storage.buckets (id, name, public)
values ('tajwid_recordings', 'tajwid_recordings', true)
on conflict (id) do nothing;

do $$
begin
    if not exists (
        select 1 from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'Public read tajwid_recordings'
    ) then
        create policy "Public read tajwid_recordings"
            on storage.objects for select
            using ( bucket_id = 'tajwid_recordings' );
    end if;
end $$;
