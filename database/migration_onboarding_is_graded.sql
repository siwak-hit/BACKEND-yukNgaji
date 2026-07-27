-- Bedakan "sudah dicetak (dikerjakan)" vs "sudah dinilai" pada tugas AI.
-- Row lama (submit online / nilai manual) dianggap sudah dinilai → default true.
ALTER TABLE public.onboarding_results
  ADD COLUMN IF NOT EXISTS is_graded boolean NOT NULL DEFAULT true;
