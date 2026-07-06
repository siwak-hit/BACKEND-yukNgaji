-- ============================================================
-- Migrasi: Latihan Tajwid (mad) — Fase 1 vertical slice
-- Jalankan di Supabase SQL Editor.
-- ============================================================

-- Satu baris = satu ayat.
--   words   : urutan kata + penanda mad. Format tiap kata:
--             { "t": "<teks arab>", "mad": { "name":"...", "graded":true, "type":"twoSided|oneSided" } }
--             - graded:true  = mad PANJANG (4-6 harakat: wajib/aridh/jaiz/lazim) -> DINILAI.
--             - graded:false = mad thobi'i (2 harakat) -> cuma highlight/info, TIDAK dinilai
--                              (durasinya di bawah ambang deteksi Whisper).
--             - type twoSided = harus pas (kepanjangan dihukum) | oneSided = mad aridh (panjang OK).
--   ref_profile : diisi otomatis saat guru merekam rujukan (baseline + rasio tiap mad). NULL = belum ada rujukan.
create table if not exists public.tajwid_ayat (
    id           bigint generated always as identity primary key,
    surah_key    text    not null,
    surah_name   text    not null,
    surah_order  int     not null,          -- urutan juz amma (untuk sorting)
    ayah_no      int     not null,
    arabic       text    not null,
    words        jsonb   not null,
    ref_profile  jsonb,
    created_at   timestamptz default now(),
    unique (surah_key, ayah_no)
);

create index if not exists idx_tajwid_ayat_surah on public.tajwid_ayat (surah_order, ayah_no);

-- ------------------------------------------------------------
-- SEED. Titik panjang menurut guru (An-Nasr:1): إِذَا, جَاءَ, اللَّهِ = 3 mad.
--   نَصْرُ & وَالْفَتْحُ = pendek (jadi baseline).
-- Re-run aman: on conflict -> update (rujukan lama direset kalau tag berubah).
-- Tambah ayat lain: copy 1 blok, sebutkan kata mana yg mad + tipenya.
-- ------------------------------------------------------------
insert into public.tajwid_ayat (surah_key, surah_name, surah_order, ayah_no, arabic, words) values
('an-nasr', 'An-Nasr', 110, 1,
 'إِذَا جَاءَ نَصْرُ اللَّهِ وَالْفَتْحُ',
 '[
   {"t":"إِذَا","mad":{"name":"Mad Thobi''i","graded":false}},
   {"t":"جَاءَ","mad":{"name":"Mad Wajib","graded":true,"type":"twoSided"}},
   {"t":"نَصْرُ"},
   {"t":"اللَّهِ","mad":{"name":"Mad Thobi''i (panjang biasa)","graded":false}},
   {"t":"وَالْفَتْحُ"}
 ]'::jsonb)
on conflict (surah_key, ayah_no) do update
   set words = excluded.words, arabic = excluded.arabic, ref_profile = null;
