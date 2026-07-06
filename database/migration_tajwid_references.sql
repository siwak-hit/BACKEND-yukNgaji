-- ============================================================
-- Migrasi: Reference tajwid per guru per ayat (Fase B)
-- Jalankan di Supabase SQL Editor (setelah migration_tajwid.sql + seed).
-- ============================================================
-- Tiap guru rekam bacaan rujukannya sendiri untuk sebuah ayat.
--   words : tag mad hasil validasi guru [{t, mad?:{name,graded,type}}]
--   durs  : durasi tiap kata dari rekaman rujukan (index-aligned) -> patokan skor siswa
create table if not exists public.tajwid_references (
    id          bigint generated always as identity primary key,
    ayat_id     bigint not null references public.tajwid_ayat(id) on delete cascade,
    created_by  text   not null,
    words       jsonb  not null,
    durs        jsonb  not null,
    transcript  text,
    created_at  timestamptz default now(),
    updated_at  timestamptz default now(),
    unique (ayat_id, created_by)
);

create index if not exists idx_tajwid_ref_by on public.tajwid_references (created_by, ayat_id);
