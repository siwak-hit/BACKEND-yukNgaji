// Web Push (VAPID) — kirim notif ke device murid yang sudah subscribe.
const webpush = require('web-push');
const supabase = require('../config/supabaseClient');

const PUB = process.env.VAPID_PUBLIC_KEY;
const PRIV = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@yukngaji.app';

let configured = false;
if (PUB && PRIV) {
    try { webpush.setVapidDetails(SUBJECT, PUB, PRIV); configured = true; }
    catch (e) { console.error('VAPID config error:', e.message); }
} else {
    console.warn('[WARNING] VAPID keys belum diset — push notif nonaktif.');
}

const getPublicKey = () => PUB || null;

// Kirim push ke semua device milik 1 murid. Hapus subscription yang sudah mati (410/404).
// Body otomatis dipersonalisasi "Halo <nama depan>! ..." (penting kalau 1 HP dipakai banyak murid).
async function sendToStudent(student_id, payload) {
    if (!configured) return;

    // Ambil nama depan utk sapaan.
    let firstName = '';
    try {
        const { data: s } = await supabase.from('students').select('name').eq('id', student_id).single();
        if (s && s.name) firstName = String(s.name).trim().split(/\s+/)[0];
    } catch (e) { /* abaikan, kirim tanpa nama */ }

    const personalized = { ...payload };
    if (firstName && personalized.body && !/^halo/i.test(personalized.body)) {
        personalized.body = `Halo ${firstName}! ${personalized.body}`;
    }

    const { data: subs, error } = await supabase
        .from('push_subscriptions')
        .select('id, subscription')
        .eq('student_id', student_id);
    if (error) { console.error('Push fetch subs error:', error.message); return; }

    const body = JSON.stringify(personalized);
    await Promise.all((subs || []).map(async (row) => {
        try {
            const sub = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
            await webpush.sendNotification(sub, body);
        } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
                await supabase.from('push_subscriptions').delete().eq('id', row.id); // dead endpoint
            } else {
                console.error('Push send error:', err.statusCode, err.body || err.message);
            }
        }
    }));
}

// Kirim ke semua murid milik 1 guru (created_by). Dipakai utk "tugas baru".
// ponytail: N+1 query nama (via sendToStudent) — jumlah murid kecil, cukup.
async function sendToAllStudents(teacherUsername, payload) {
    if (!configured) return;
    const { data: students, error } = await supabase
        .from('students').select('id').eq('created_by', teacherUsername);
    if (error) { console.error('Push all fetch students error:', error.message); return; }
    await Promise.all((students || []).map(s => sendToStudent(s.id, payload).catch(() => {})));
}

module.exports = { getPublicKey, sendToStudent, sendToAllStudents };
