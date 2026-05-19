const supabase = require('../config/supabaseClient');

const getNotifs = async (req, res) => {
    try {
        const username = req.user.username;

        const { data, error } = await supabase
            .from('pr_notifications')
            .select('*')
            .eq('created_by', username)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        res.status(200).json({
            status: 'success',
            data: data || []
        });
    } catch (err) {
        res.status(500).json({
            status: 'error',
            message: err.message
        });
    }
};

const getNotifDetail = async (req, res) => {
    try {
        const username = req.user.username;
        const { id } = req.params;

        const { data: notif, error: notifErr } = await supabase
            .from('pr_notifications')
            .select('*')
            .eq('id', id)
            .eq('created_by', username)
            .single();

        if (notifErr || !notif) {
            return res.status(404).json({
                status: 'error',
                message: 'Notifikasi tidak ditemukan.'
            });
        }

        if (notif.notif_type === 'exam') {
            let result = null;

            if (notif.result_id) {
                const { data } = await supabase
                    .from('exam_results')
                    .select('id, score, capture_url, created_at, exam_id, student_id')
                    .eq('id', notif.result_id)
                    .maybeSingle();

                result = data;
            }

            if (!result && notif.student_id && notif.exam_id) {
                const { data } = await supabase
                    .from('exam_results')
                    .select('id, score, capture_url, created_at, exam_id, student_id')
                    .eq('student_id', notif.student_id)
                    .eq('exam_id', notif.exam_id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                result = data;
            }

            return res.status(200).json({
                status: 'success',
                data: {
                    type: 'exam',
                    student_name: notif.student_name,
                    subject: notif.subject,
                    title: notif.title || 'Ujian',
                    week: null,
                    score: result?.score ?? notif.score ?? 0,
                    photo_url: result?.capture_url || notif.capture_url || null,
                    created_at: result?.created_at || notif.created_at
                }
            });
        }

        // Default: PR
        let photoUrl = null;

        if (notif.student_id && notif.subject && notif.week) {
            const { data: satpamLog } = await supabase
                .from('satpam_logs')
                .select('photo_url')
                .eq('student_id', String(notif.student_id))
                .eq('subject', notif.subject)
                .eq('week', notif.week)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            photoUrl = satpamLog?.photo_url || null;
        }

        let result = null;

        if (notif.student_id && notif.subject && notif.week) {
            const { data } = await supabase
                .from('onboarding_results')
                .select('score, week, subject, created_at')
                .eq('student_id', notif.student_id)
                .eq('subject', notif.subject)
                .eq('week', notif.week)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            result = data;
        }

        return res.status(200).json({
            status: 'success',
            data: {
                type: 'pr',
                student_name: notif.student_name,
                subject: notif.subject,
                title: notif.title || `PR ${notif.subject}`,
                week: result?.week || notif.week,
                score: result?.score ?? notif.score ?? 0,
                photo_url: photoUrl,
                created_at: result?.created_at || notif.created_at
            }
        });

    } catch (err) {
        res.status(500).json({
            status: 'error',
            message: err.message
        });
    }
};

const deleteNotif = async (req, res) => {
    try {
        const username = req.user.username;

        const { error } = await supabase
            .from('pr_notifications')
            .delete()
            .eq('id', req.params.id)
            .eq('created_by', username);

        if (error) throw error;

        res.status(200).json({ status: 'success' });
    } catch (err) {
        res.status(500).json({
            status: 'error',
            message: err.message
        });
    }
};

const clearAllNotifs = async (req, res) => {
    try {
        const username = req.user.username;

        const { error } = await supabase
            .from('pr_notifications')
            .delete()
            .eq('created_by', username);

        if (error) throw error;

        res.status(200).json({ status: 'success' });
    } catch (err) {
        res.status(500).json({
            status: 'error',
            message: err.message
        });
    }
};

module.exports = {
    getNotifs,
    getNotifDetail,
    deleteNotif,
    clearAllNotifs
};
