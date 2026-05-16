const supabase = require('../config/supabaseClient');

const generateNote = (req, res) => {
    try {
        const {
            studentName,
            academic = {},
            behavior = {},
            checkpointText,
            academicBreakdown = {}
        } = req.body;

        const getScore = (grade) => ({ A: 4, B: 3, C: 2, D: 1 }[grade] || 2);

        const getNumber = (value) => {
            const n = Number(value);
            return Number.isFinite(n) ? n : 0;
        };

        const academicSubjects = ['tajwid', 'fiqih', 'tauhid', 'quran'];
        const acdScores = academicSubjects.map(subject => getScore(academic[subject]));
        const avgAcd = acdScores.reduce((a, b) => a + b, 0) / acdScores.length;

        const bhvScores = [
            behavior.kedisiplinan,
            behavior.akhlak,
            behavior.keaktifan
        ].map(getScore);

        const avgBhv = bhvScores.reduce((a, b) => a + b, 0) / bhvScores.length;

        const oralSubjects = ['tajwid', 'fiqih', 'tauhid'];
        const oralValues = oralSubjects
            .map(subject => academicBreakdown?.[subject]?.oral)
            .filter(value => value !== null && value !== undefined && value !== '-')
            .map(getNumber);

        const hasOralData = oralValues.length > 0;
        const avgOral = hasOralData
            ? oralValues.reduce((a, b) => a + b, 0) / oralValues.length
            : null;

        const subjectLabels = {
            tajwid: 'Tajwid',
            fiqih: 'Fiqih',
            tauhid: 'Tauhid',
            quran: 'Al-Quran / Iqro'
        };

        const weakOralSubjects = oralSubjects.filter(subject => {
            const oral = academicBreakdown?.[subject]?.oral;
            return oral !== null && oral !== undefined && oral !== '-' && Number(oral) < 70;
        });

        const strongOralSubjects = oralSubjects.filter(subject => {
            const oral = academicBreakdown?.[subject]?.oral;
            return oral !== null && oral !== undefined && oral !== '-' && Number(oral) >= 80;
        });

        let pointA = `Alhamdulillah, segala puji bagi Allah. Kami bersyukur atas semangat ananda ${studentName} dalam mengikuti kegiatan belajar ngaji.`;

        if (avgAcd >= 3.5 && avgBhv >= 3.5) {
            pointA += ` Ananda menunjukkan perkembangan yang sangat baik, baik dari sisi pemahaman materi maupun adab di kelas.`;
        } else if (avgAcd >= 3 || avgBhv >= 3) {
            pointA += ` Ananda menunjukkan perkembangan yang baik dan tetap perlu diarahkan agar semakin konsisten.`;
        } else {
            pointA += ` Ananda masih dalam proses bertumbuh dan membutuhkan pendampingan yang lebih rutin.`;
        }

        let pointB = `Pada aspek akademik, khususnya Tajwid, Fiqih, Tauhid, dan hafalan Al-Quran, `;

        if (avgAcd >= 3.5) {
            pointB += `ananda mampu mengikuti materi dengan sangat baik.`;
        } else if (avgAcd >= 2.5) {
            pointB += `ananda sudah cukup mampu mengikuti materi, namun masih perlu murojaah dan latihan bertahap.`;
        } else {
            pointB += `ananda masih perlu bimbingan dasar secara perlahan agar lebih percaya diri memahami materi.`;
        }

        if (hasOralData) {
            if (avgOral >= 80) {
                pointB += ` Hasil evaluasi lisan/hafalan juga menunjukkan kemampuan yang baik, terutama dalam keberanian menjawab dan mengingat materi.`;
            } else if (avgOral >= 60) {
                pointB += ` Pada evaluasi lisan/hafalan, ananda sudah mulai mampu mengikuti, namun perlu lebih sering mengulang agar hafalannya semakin kuat.`;
            } else {
                pointB += ` Pada evaluasi lisan/hafalan, ananda masih membutuhkan pendampingan tambahan, terutama dalam mengingat materi dan menjelaskan kembali dengan kata-katanya sendiri.`;
            }
        }

        let pointC = `Dari segi kepribadian dan adab di kelas, `;

        if (avgBhv >= 3.5) {
            pointC += `masya Allah, ananda menunjukkan sikap yang sangat baik, sopan, dan aktif dalam pembelajaran.`;
        } else if (avgBhv >= 2.5) {
            pointC += `ananda sudah cukup baik, meskipun sesekali masih perlu diingatkan untuk lebih fokus dan tertib.`;
        } else {
            pointC += `ananda masih perlu banyak dilatih untuk lebih tertib, memperhatikan adab, dan menjaga fokus saat belajar.`;
        }

        let oralNote = '';

        if (strongOralSubjects.length > 0) {
            oralNote += ` Kekuatan ananda terlihat pada evaluasi lisan/hafalan ${strongOralSubjects.map(s => subjectLabels[s]).join(', ')}.`;
        }

        if (weakOralSubjects.length > 0) {
            oralNote += ` Area yang perlu lebih sering diulang adalah hafalan/pemahaman lisan pada ${weakOralSubjects.map(s => subjectLabels[s]).join(', ')}.`;
        }

        let pointD = `${checkpointText ? `${checkpointText}. ` : ''}${oralNote} Kami memohon kerja sama Ayah/Bunda di rumah untuk mendampingi ananda mengulang pelajaran, hafalan, serta membiasakan adab islami sehari-hari. Semoga ananda ${studentName} menjadi anak yang sholeh/sholehah, ahli ilmu, dan penyejuk hati keluarga. Aamiin.`;

        const finalNote = `${pointA}\n\n${pointB}\n\n${pointC}\n\n${pointD}`;

        let profilPsikologis = '';
        const scoreAkhlak = getScore(behavior.akhlak);
        const scoreDisiplin = getScore(behavior.kedisiplinan);
        const scoreAktif = getScore(behavior.keaktifan);
        const scoreTajwid = getScore(academic.tajwid);
        const scoreFiqih = getScore(academic.fiqih);
        const scoreTauhid = getScore(academic.tauhid);
        const scoreQuran = getScore(academic.quran);

        if (avgAcd >= 3.5 && avgBhv >= 3.5) {
            profilPsikologis = `${studentName} menunjukkan profil anak yang sangat baik. Secara kognitif, ananda mampu menyerap materi agama dengan cepat, dan secara sikap menunjukkan adab yang positif.`;
        } else if (avgAcd >= 3 && avgBhv < 2.5) {
            profilPsikologis = `${studentName} memiliki potensi akademik yang baik, namun masih perlu diarahkan dalam kedisiplinan dan fokus saat kegiatan belajar.`;
        } else if (avgAcd < 2.5 && avgBhv >= 3) {
            profilPsikologis = `${studentName} memiliki adab yang baik. Secara akademik, ananda membutuhkan waktu lebih panjang, namun dengan latihan rutin insya Allah akan berkembang.`;
        } else if (avgAcd < 2.5 && avgBhv < 2.5) {
            profilPsikologis = `${studentName} masih berada pada tahap adaptasi dan membutuhkan pendampingan yang konsisten, baik dalam pemahaman materi maupun pembiasaan adab belajar.`;
        } else {
            profilPsikologis = `${studentName} menunjukkan perkembangan yang cukup seimbang antara akademik dan kepribadian.`;
        }

        if (hasOralData) {
            profilPsikologis += ` Berdasarkan evaluasi lisan/hafalan, ananda ${avgOral >= 70 ? 'cukup mampu menunjukkan pemahaman secara lisan' : 'masih perlu dilatih untuk lebih percaya diri menjawab secara lisan'}.`;
        }

        const kelebihanList = [];
        if (scoreTajwid >= 3) kelebihanList.push('bacaan Tajwid yang baik');
        if (scoreFiqih >= 3) kelebihanList.push('pemahaman Fiqih yang memadai');
        if (scoreTauhid >= 3) kelebihanList.push('pondasi Tauhid yang baik');
        if (scoreQuran >= 3) kelebihanList.push('kelancaran tilawah/hafalan Al-Quran');
        if (scoreAkhlak >= 3) kelebihanList.push('akhlak dan adab yang baik');
        if (scoreDisiplin >= 3) kelebihanList.push('kedisiplinan dalam belajar');
        if (scoreAktif >= 3) kelebihanList.push('keaktifan belajar');
        if (strongOralSubjects.length > 0) kelebihanList.push(`kemampuan lisan/hafalan pada ${strongOralSubjects.map(s => subjectLabels[s]).join(', ')}`);

        const kelebihan = kelebihanList.length > 0
            ? `Kelebihan ananda: ${kelebihanList.join(', ')}.`
            : `Ananda masih dalam proses menemukan potensi terbaiknya.`;

        const kekuranganList = [];
        if (scoreTajwid <= 2) kekuranganList.push('ketelitian hukum Tajwid');
        if (scoreFiqih <= 2) kekuranganList.push('pemahaman Fiqih sehari-hari');
        if (scoreTauhid <= 2) kekuranganList.push('pemahaman Tauhid');
        if (scoreQuran <= 2) kekuranganList.push('kelancaran murojaah');
        if (scoreAkhlak <= 2) kekuranganList.push('menjaga adab di kelas');
        if (scoreDisiplin <= 2) kekuranganList.push('kedisiplinan aturan kelas');
        if (scoreAktif <= 2) kekuranganList.push('dorongan untuk aktif bertanya');
        if (weakOralSubjects.length > 0) kekuranganList.push(`penguatan hafalan/lisan pada ${weakOralSubjects.map(s => subjectLabels[s]).join(', ')}`);

        const kekurangan = kekuranganList.length > 0
            ? `Area yang perlu mendapat perhatian ekstra: ${kekuranganList.join('; ')}.`
            : `Perkembangan merata di semua aspek.`;

        res.status(200).json({
            status: "success",
            data: finalNote,
            analisis: {
                profilPsikologis,
                kelebihan,
                kekurangan
            }
        });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

const saveRaport = async (req, res) => {
    try {
        const {
            id,
            student_id,
            academic_grades,
            behavior_grades,
            teacher_note,
            academic_breakdown = {}
        } = req.body;

        const created_by = req.user.username;

        let result;

        if (id) {
            result = await supabase
                .from('raports')
                .update({
                    academic_grades,
                    behavior_grades,
                    teacher_note,
                    academic_breakdown
                })
                .eq('id', id)
                .select('id, academic_grades, behavior_grades, teacher_note, academic_breakdown')
                .single();
        } else {
            result = await supabase
                .from('raports')
                .insert([{
                    student_id,
                    created_by,
                    academic_grades,
                    behavior_grades,
                    teacher_note,
                    academic_breakdown
                }])
                .select('id, academic_grades, behavior_grades, teacher_note, academic_breakdown')
                .single();
        }

        if (result.error) throw result.error;

        res.status(id ? 200 : 201).json({
            status: "success",
            data: result.data
        });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { generateNote, saveRaport };
