-- ============================================================
-- Bersih-bersih data UJI COBA latihan tajwid (mis. setoran John Doe).
-- Jalankan di Supabase SQL Editor.
-- ============================================================
-- Hapus SEMUA setoran siswa + link latihan (data transaksi uji coba).
-- Rekaman audio di Storage bucket 'tajwid_recordings' TIDAK ikut terhapus otomatis —
-- kalau mau bersih total, hapus manual isinya via Storage dashboard.
delete from public.tajwid_submissions;
delete from public.tajwid_exercises;

-- (OPSIONAL) kalau mau hapus juga rujukan rekaman guru (kunci jawaban) yang dibuat saat uji coba:
-- delete from public.tajwid_references;

-- (OPSIONAL) reset urutan id kalau perlu — biasanya tidak wajib.
-- alter sequence public.tajwid_submissions_id_seq restart with 1;
-- alter sequence public.tajwid_exercises_id_seq restart with 1;
