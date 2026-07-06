-- ============================================================
-- Migrasi: Latihan tajwid yang dibagikan ke siswa (Fase C)
-- Jalankan di Supabase SQL Editor.
-- ============================================================
-- Guru bikin 1 "latihan" dari sebuah surat (yg ayatnya sudah dirujuk),
-- lalu dapat link publik (token). Siswa buka link -> pilih nama -> baca jendela ayat acak.
create table if not exists public.tajwid_exercises (
    id           bigint generated always as identity primary key,
    token        text   not null unique,        -- slug link publik
    created_by   text   not null,               -- guru
    surah_key    text   not null,
    title        text,
    pertemuan    int,                             -- nomor pertemuan (diisi guru)
    window_size  int    not null default 3,      -- berapa ayat ditampilkan ke siswa
    is_active    boolean default true,
    created_at   timestamptz default now()
);

create index if not exists idx_tajwid_ex_by on public.tajwid_exercises (created_by);
