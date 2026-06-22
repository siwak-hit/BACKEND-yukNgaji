-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password text NOT NULL,
  role text NOT NULL DEFAULT 'teacher'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.students (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  grade text NOT NULL,
  age integer,
  created_by text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  has_infaq_can boolean NOT NULL DEFAULT false,
  last_can_received_at timestamp with time zone,
  current_surah_id integer,
  current_ayah integer DEFAULT 0,
  poin integer DEFAULT 0,
  item_double_score integer DEFAULT 0,
  item_serang integer DEFAULT 0,
  item_perisai integer DEFAULT 0,
  item_extra_life integer DEFAULT 0,
  has_claimed_bonus boolean DEFAULT false,
  is_shield_active boolean DEFAULT false,
  shield_activated_at timestamp with time zone,
  is_bullied boolean NOT NULL DEFAULT false,
  has_completed_exam_tutorial boolean NOT NULL DEFAULT false,
  pin character varying DEFAULT '123'::character varying,
  CONSTRAINT students_pkey PRIMARY KEY (id),
  CONSTRAINT students_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(username)
);
CREATE TABLE public.todos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid,
  title text NOT NULL,
  description text,
  status text DEFAULT 'pending'::text,
  week integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT todos_pkey PRIMARY KEY (id),
  CONSTRAINT todos_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.onboarding_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid,
  subject text NOT NULL,
  week integer DEFAULT 1,
  score integer NOT NULL,
  category text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  student_answers jsonb DEFAULT '[]'::jsonb,
  is_pr boolean DEFAULT false,
  time_taken integer DEFAULT 0,
  CONSTRAINT onboarding_results_pkey PRIMARY KEY (id),
  CONSTRAINT onboarding_results_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  question text NOT NULL,
  options jsonb NOT NULL,
  correct_answer text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  week integer NOT NULL DEFAULT 1,
  difficulty_level text NOT NULL DEFAULT 'sedang'::text,
  type text NOT NULL DEFAULT 'pilgan'::text,
  image_url text,
  CONSTRAINT questions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.consultations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid,
  subject text,
  message text,
  image_url text,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  week integer,
  akhlak_score integer NOT NULL DEFAULT 0,
  disiplin_score integer NOT NULL DEFAULT 0,
  aktif_score integer NOT NULL DEFAULT 0,
  CONSTRAINT consultations_pkey PRIMARY KEY (id),
  CONSTRAINT consultations_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.raports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid,
  created_by text,
  academic_grades jsonb NOT NULL,
  behavior_grades jsonb NOT NULL,
  teacher_note text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  academic_breakdown jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT raports_pkey PRIMARY KEY (id),
  CONSTRAINT raports_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id),
  CONSTRAINT raports_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(username)
);
CREATE TABLE public.attendances (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  date date NOT NULL,
  subject text NOT NULL,
  present_students jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT attendances_pkey PRIMARY KEY (id),
  CONSTRAINT attendances_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(username)
);
CREATE TABLE public.memorization_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  surah_name text NOT NULL,
  start_ayah integer NOT NULL,
  end_ayah integer NOT NULL,
  added_ayahs integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT memorization_logs_pkey PRIMARY KEY (id),
  CONSTRAINT memorization_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.exams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subject text NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 60,
  is_active boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  is_daring boolean DEFAULT false,
  deadline_at timestamp with time zone,
  extended_students jsonb DEFAULT '[]'::jsonb, -- [{student_id, until, penalty}] dispensasi per-murid (mirror pr_locks)
  CONSTRAINT exams_pkey PRIMARY KEY (id),
  CONSTRAINT exams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(username)
);
CREATE TABLE public.exam_questions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL,
  question text NOT NULL,
  options jsonb NOT NULL,
  correct_answer text NOT NULL,
  hint text,
  image_url text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  question_type text NOT NULL DEFAULT 'multiple_choice'::text,
  CONSTRAINT exam_questions_pkey PRIMARY KEY (id),
  CONSTRAINT exam_questions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id)
);
CREATE TABLE public.exam_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  exam_id uuid NOT NULL,
  subject text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  capture_url text,
  student_answers jsonb DEFAULT '[]'::jsonb,
  time_taken integer DEFAULT 0,
  CONSTRAINT exam_results_pkey PRIMARY KEY (id),
  CONSTRAINT exam_results_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id),
  CONSTRAINT exam_results_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id)
);
CREATE TABLE public.student_gallery (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  student_id uuid,
  image_url text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT student_gallery_pkey PRIMARY KEY (id),
  CONSTRAINT student_gallery_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.gamification_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,
  target_id uuid,
  action_type text NOT NULL,
  point_change integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  is_read boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT gamification_logs_pkey PRIMARY KEY (id),
  CONSTRAINT gamification_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.students(id),
  CONSTRAINT gamification_logs_target_id_fkey FOREIGN KEY (target_id) REFERENCES public.students(id)
);
CREATE TABLE public.pr_locks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  week integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  deadline_at timestamp with time zone,
  extended_students jsonb DEFAULT '[]'::jsonb,
  is_locked boolean DEFAULT true,
  CONSTRAINT pr_locks_pkey PRIMARY KEY (id)
);
CREATE TABLE public.satpam_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id text NOT NULL,
  subject text NOT NULL,
  week integer NOT NULL,
  photo_url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT satpam_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.pr_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_name text NOT NULL,
  subject text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  notif_type text NOT NULL DEFAULT 'pr'::text,
  student_id uuid,
  exam_id uuid,
  result_id uuid,
  week integer,
  score integer,
  title text,
  capture_url text,
  created_by text,
  CONSTRAINT pr_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT pr_notifications_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id),
  CONSTRAINT pr_notifications_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id),
  CONSTRAINT pr_notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(username)
);
CREATE TABLE public.pr_extension_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid,
  student_name text NOT NULL,
  subject text NOT NULL,
  week integer NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending'::text, -- pending | granted
  with_penalty boolean,
  extension_until timestamp with time zone,
  created_by text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  responded_at timestamp with time zone,
  CONSTRAINT pr_extension_requests_pkey PRIMARY KEY (id),
  CONSTRAINT pr_extension_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(username)
);
CREATE TABLE public.app_settings (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  is_maintenance boolean DEFAULT false,
  CONSTRAINT app_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.app_feedbacks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid,
  exam_id uuid,
  comfort_rating integer,
  difficulty_rating integer,
  favorite_part text,
  hardest_part text,
  suggestion text,
  message text,
  source text DEFAULT 'exam_final'::text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT app_feedbacks_pkey PRIMARY KEY (id),
  CONSTRAINT app_feedbacks_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id),
  CONSTRAINT app_feedbacks_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id)
);
CREATE TABLE public.oral_exam_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subject text NOT NULL,
  description text,
  created_by text,
  is_active boolean DEFAULT true,
  target_session_minutes integer DEFAULT 10,
  max_students_per_session integer DEFAULT 5,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT oral_exam_templates_pkey PRIMARY KEY (id),
  CONSTRAINT oral_exam_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(username)
);
CREATE TABLE public.oral_exam_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  title text NOT NULL,
  min_required integer NOT NULL DEFAULT 0,
  sort_order integer DEFAULT 0,
  CONSTRAINT oral_exam_sections_pkey PRIMARY KEY (id),
  CONSTRAINT oral_exam_sections_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.oral_exam_templates(id)
);
CREATE TABLE public.oral_exam_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL,
  title text NOT NULL,
  short_label text,
  description text,
  sort_order integer DEFAULT 0,
  CONSTRAINT oral_exam_items_pkey PRIMARY KEY (id),
  CONSTRAINT oral_exam_items_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.oral_exam_sections(id)
);
CREATE TABLE public.oral_understanding_prompts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  subject text NOT NULL,
  level text NOT NULL DEFAULT 'easy'::text,
  prompt text NOT NULL,
  expected_keywords jsonb DEFAULT '[]'::jsonb,
  sort_order integer DEFAULT 0,
  CONSTRAINT oral_understanding_prompts_pkey PRIMARY KEY (id),
  CONSTRAINT oral_understanding_prompts_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.oral_exam_templates(id)
);
CREATE TABLE public.oral_exam_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL,
  subject text NOT NULL,
  session_name text,
  target_duration_seconds integer DEFAULT 600,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  status text DEFAULT 'draft'::text,
  tested_by text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT oral_exam_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT oral_exam_sessions_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.oral_exam_templates(id),
  CONSTRAINT oral_exam_sessions_tested_by_fkey FOREIGN KEY (tested_by) REFERENCES public.users(username)
);
CREATE TABLE public.oral_exam_session_students (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  student_id uuid NOT NULL,
  order_index integer DEFAULT 0,
  CONSTRAINT oral_exam_session_students_pkey PRIMARY KEY (id),
  CONSTRAINT oral_exam_session_students_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.oral_exam_sessions(id),
  CONSTRAINT oral_exam_session_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.oral_exam_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid,
  template_id uuid NOT NULL,
  student_id uuid NOT NULL,
  subject text NOT NULL,
  memorization_score integer DEFAULT 0,
  understanding_score integer DEFAULT 0,
  final_score integer DEFAULT 0,
  understanding_level_used text,
  understanding_prompt_id uuid,
  understanding_rating integer DEFAULT 0,
  status text DEFAULT 'draft'::text,
  notes text,
  duration_seconds integer DEFAULT 0,
  tested_by text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  submitted_at timestamp with time zone,
  CONSTRAINT oral_exam_results_pkey PRIMARY KEY (id),
  CONSTRAINT oral_exam_results_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.oral_exam_sessions(id),
  CONSTRAINT oral_exam_results_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.oral_exam_templates(id),
  CONSTRAINT oral_exam_results_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id),
  CONSTRAINT oral_exam_results_understanding_prompt_id_fkey FOREIGN KEY (understanding_prompt_id) REFERENCES public.oral_understanding_prompts(id),
  CONSTRAINT oral_exam_results_tested_by_fkey FOREIGN KEY (tested_by) REFERENCES public.users(username)
);
CREATE TABLE public.oral_exam_result_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL,
  item_id uuid NOT NULL,
  score integer NOT NULL DEFAULT 0,
  note text,
  CONSTRAINT oral_exam_result_items_pkey PRIMARY KEY (id),
  CONSTRAINT oral_exam_result_items_result_id_fkey FOREIGN KEY (result_id) REFERENCES public.oral_exam_results(id),
  CONSTRAINT oral_exam_result_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.oral_exam_items(id)
);
CREATE TABLE public.exam_retake_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL,
  student_id uuid NOT NULL,
  mode text NOT NULL CHECK (mode = ANY (ARRAY['reset'::text, 'continue'::text, 'extra_time'::text])),
  extra_minutes integer NOT NULL DEFAULT 0,
  reason text,
  is_used boolean NOT NULL DEFAULT false,
  granted_by text,
  granted_at timestamp with time zone NOT NULL DEFAULT now(),
  used_at timestamp with time zone,
  CONSTRAINT exam_retake_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT exam_retake_permissions_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id),
  CONSTRAINT exam_retake_permissions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id),
  CONSTRAINT exam_retake_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES public.users(username)
);
CREATE TABLE public.daily_challenge_sentences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  subject text NOT NULL CHECK (subject = ANY (ARRAY['tajwid'::text, 'fiqih'::text, 'tauhid'::text])),
  level_min integer NOT NULL DEFAULT 1,
  level_max integer NOT NULL DEFAULT 10,
  sentence text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT daily_challenge_sentences_pkey PRIMARY KEY (id)
);
CREATE TABLE public.daily_challenge_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  challenge_date date NOT NULL DEFAULT CURRENT_DATE,
  level integer NOT NULL,
  subject text NOT NULL,
  sentence_id uuid,
  typed_text text,
  is_correct boolean NOT NULL DEFAULT false,
  base_reward integer NOT NULL DEFAULT 0,
  combo_reward integer NOT NULL DEFAULT 0,
  total_reward integer NOT NULL DEFAULT 0,
  time_taken_seconds numeric,
  is_rewarded boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT daily_challenge_logs_pkey PRIMARY KEY (id),
  CONSTRAINT daily_challenge_logs_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id),
  CONSTRAINT daily_challenge_logs_sentence_id_fkey FOREIGN KEY (sentence_id) REFERENCES public.daily_challenge_sentences(id)
);
CREATE TABLE public.daily_challenge_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  challenge_date date NOT NULL DEFAULT CURRENT_DATE,
  current_level integer NOT NULL DEFAULT 1,
  completed_levels ARRAY NOT NULL DEFAULT '{}'::integer[],
  total_coins_earned integer NOT NULL DEFAULT 0,
  total_combo_earned integer NOT NULL DEFAULT 0,
  last_played_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT daily_challenge_progress_pkey PRIMARY KEY (id),
  CONSTRAINT daily_challenge_progress_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.digital_rewards_purchases (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  item_filename text NOT NULL,
  item_type text NOT NULL CHECK (item_type = ANY (ARRAY['photo'::text, 'video'::text, 'ability'::text, 'game'::text])),
  cost integer NOT NULL,
  purchased_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT digital_rewards_purchases_pkey PRIMARY KEY (id),
  CONSTRAINT digital_rewards_purchases_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id)
);
CREATE TABLE public.coin_transfers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sender_id uuid,
  receiver_id uuid,
  amount integer NOT NULL,
  is_notified boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  note text,
  transfer_type character varying DEFAULT 'transfer'::character varying,
  CONSTRAINT coin_transfers_pkey PRIMARY KEY (id),
  CONSTRAINT coin_transfers_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.students(id),
  CONSTRAINT coin_transfers_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.students(id)
);
