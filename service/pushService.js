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
async function sendToStudent(student_id, payload) {
    if (!configured) return;
    const { data: subs, error } = await supabase
        .from('push_subscriptions')
        .select('id, subscription')
        .eq('student_id', student_id);
    if (error) { console.error('Push fetch subs error:', error.message); return; }

    const body = JSON.stringify(payload);
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

module.exports = { getPublicKey, sendToStudent };
