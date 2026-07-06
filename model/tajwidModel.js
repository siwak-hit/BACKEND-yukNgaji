const supabase = require('../config/supabaseClient');

// daftar surat (unik), diurut An-Nas (114) dulu -> Al-Balad (90)
const listSurahs = async () => {
    const { data, error } = await supabase
        .from('tajwid_ayat')
        .select('surah_key, surah_name, surah_order, ayah_no')
        .order('surah_order', { ascending: false })
        .order('ayah_no', { ascending: false });
    if (error) throw error;
    const map = new Map();
    for (const r of data) {
        if (!map.has(r.surah_key)) map.set(r.surah_key, {
            surah_key: r.surah_key, surah_name: r.surah_name, surah_order: r.surah_order, ayah_count: r.ayah_no,
        });
    }
    return [...map.values()];
};

// semua ayat 1 surat (untuk auto-input ayat + tampilan)
const getSurahAyat = async (surahKey) => {
    const { data, error } = await supabase
        .from('tajwid_ayat')
        .select('id, ayah_no, arabic, words')
        .eq('surah_key', surahKey)
        .order('ayah_no', { ascending: true });
    if (error) throw error;
    return data;
};

const getAyat = async (id) => {
    const { data, error } = await supabase.from('tajwid_ayat').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
};

// --- Reference per guru per ayat (Fase B) ---
const getReference = async (ayatId, createdBy) => {
    const { data, error } = await supabase
        .from('tajwid_references')
        .select('*')
        .eq('ayat_id', ayatId)
        .eq('created_by', createdBy)
        .maybeSingle();
    if (error) throw error;
    return data; // null kalau belum ada
};

// rujukan guru ini untuk 1 surat (buat tandai ayat mana yang sudah dirujuk)
const getSurahReferences = async (surahKey, createdBy) => {
    const { data, error } = await supabase
        .from('tajwid_references')
        .select('ayat_id, words, durs, tajwid_ayat!inner(surah_key)')
        .eq('created_by', createdBy)
        .eq('tajwid_ayat.surah_key', surahKey);
    if (error) throw error;
    return data || [];
};

const deleteReference = async (ayatId, createdBy) => {
    const { error } = await supabase.from('tajwid_references').delete().eq('ayat_id', ayatId).eq('created_by', createdBy);
    if (error) throw error;
};

const saveReference = async (ayatId, createdBy, words, durs, transcript) => {
    const { data, error } = await supabase
        .from('tajwid_references')
        .upsert({ ayat_id: ayatId, created_by: createdBy, words, durs, transcript, updated_at: new Date().toISOString() },
            { onConflict: 'ayat_id,created_by' })
        .select('id')
        .single();
    if (error) throw error;
    return data;
};

// --- Exercises (latihan dibagikan ke siswa, Fase C) ---
const createExercise = async (ex) => {
    const { data, error } = await supabase.from('tajwid_exercises').insert(ex).select().single();
    if (error) throw error;
    return data;
};

const getExerciseByToken = async (token) => {
    const { data, error } = await supabase.from('tajwid_exercises').select('*').eq('token', token).maybeSingle();
    if (error) throw error;
    return data;
};

const listExercises = async (createdBy) => {
    const { data, error } = await supabase.from('tajwid_exercises')
        .select('*').eq('created_by', createdBy).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
};

const getExerciseById = async (id) => {
    const { data, error } = await supabase.from('tajwid_exercises').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
};

// --- Submissions (setoran siswa, Fase D) ---
const uploadRecording = async (path, buffer) => {
    const { error } = await supabase.storage.from('tajwid_recordings')
        .upload(path, buffer, { contentType: 'audio/webm', upsert: true });
    if (error) throw error;
    return supabase.storage.from('tajwid_recordings').getPublicUrl(path).data.publicUrl;
};

const findSubmission = async (exerciseId, ayatId, studentId) => {
    const { data, error } = await supabase.from('tajwid_submissions')
        .select('*').eq('exercise_id', exerciseId).eq('ayat_id', ayatId).eq('student_id', studentId).maybeSingle();
    if (error) throw error;
    return data;
};

const upsertSubmission = async (row) => {
    const { data, error } = await supabase.from('tajwid_submissions')
        .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: 'exercise_id,ayat_id,student_id' })
        .select('id').single();
    if (error) throw error;
    return data;
};

const listSubmissions = async (exerciseId) => {
    const { data, error } = await supabase.from('tajwid_submissions')
        .select('*').eq('exercise_id', exerciseId).order('student_name', { ascending: true }).order('ayat_id', { ascending: true });
    if (error) throw error;
    return data || [];
};

// semua setoran milik latihan-latihan guru ini + info exercise (buat drill-down pertemuan→surat→siswa)
const getAllSubmissionsByTeacher = async (username) => {
    const { data, error } = await supabase
        .from('tajwid_submissions')
        .select('*, tajwid_exercises!inner(id, created_by, surah_key, created_at, pertemuan)')
        .eq('tajwid_exercises.created_by', username);
    if (error) throw error;
    return data || [];
};

const getStudentSubmissions = async (exerciseId, studentId) => {
    const { data, error } = await supabase.from('tajwid_submissions')
        .select('*').eq('exercise_id', exerciseId).eq('student_id', studentId).order('ayat_id', { ascending: true });
    if (error) throw error;
    return data || [];
};

const getSubmission = async (id) => {
    const { data, error } = await supabase.from('tajwid_submissions').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
};

const reviewSubmission = async (id, finalScore, note) => {
    const { data, error } = await supabase.from('tajwid_submissions')
        .update({ final_score: finalScore, teacher_note: note, status: 'reviewed', updated_at: new Date().toISOString() })
        .eq('id', id).select('id').single();
    if (error) throw error;
    return data;
};

module.exports = {
    listSurahs, getSurahAyat, getAyat, getReference, getSurahReferences, saveReference, deleteReference,
    createExercise, getExerciseByToken, getExerciseById, listExercises,
    uploadRecording, findSubmission, upsertSubmission, listSubmissions, getAllSubmissionsByTeacher, getStudentSubmissions, getSubmission, reviewSubmission,
};
