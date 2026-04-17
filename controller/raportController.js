const supabase = require('../config/supabaseClient');

const generateNote = (req, res) => {
    try {
        const { studentName, academic, behavior, checkpointText  } = req.body;

        const getScore = (grade) => ({'A': 4, 'B': 3, 'C': 2, 'D': 1}[grade] || 2);

        const acdScores = [academic.tajwid, academic.fiqih, academic.tauhid, academic.quran].map(getScore);
        const avgAcd = acdScores.reduce((a, b) => a + b, 0) / acdScores.length;

        const bhvScores = [behavior.kedisiplinan, behavior.akhlak, behavior.keaktifan].map(getScore);
        const avgBhv = bhvScores.reduce((a, b) => a + b, 0) / bhvScores.length;

        let pointA = `Alhamdulillah, segala puji bagi Allah. Kami sangat bersyukur atas semangat ananda ${studentName} dalam mengikuti kegiatan belajar ngaji sejauh ini.`;
        if (avgAcd >= 3.5 && avgBhv >= 3.5) pointA += ` Ananda menunjukkan prestasi yang sangat luar biasa, baik dari sisi keilmuan maupun adabnya yang mulia.`;
        else if (avgAcd >= 3 || avgBhv >= 3) pointA += ` Ananda menunjukkan perkembangan yang baik dan membanggakan dari waktu ke waktu.`;

        let pointB = `Terkait pemahaman materi pelajaran (Tajwid, Fiqih, Tauhid, dan Hafalan Al-Quran), `;
        if (avgAcd >= 3.5) pointB += `ananda sangat cepat menangkap pelajaran. Pertahankan hafalan dan ketelitian bacaannya ya!`;
        else if (avgAcd >= 2.5) pointB += `ananda sudah cukup baik, namun masih perlu ditingkatkan sedikit murojaah-nya agar lebih lancar dan kuat hafalannya.`;
        else pointB += `ananda masih membutuhkan bimbingan ekstra. Jangan pantang menyerah untuk terus mengulang pelajaran dari dasar ya.`;

        let pointC = `Dari segi kepribadian dan adab di kelas, `;
        if (avgBhv >= 3.5) pointC += `masya Allah, ananda sangat sopan, rajin, dan aktif. Menjadi contoh yang sangat baik bagi teman-temannya.`;
        else if (avgBhv >= 2.5) pointC += `ananda anak yang baik, meski terkadang masih perlu diingatkan untuk lebih tenang dan fokus saat ustadz/ustadzah sedang menerangkan.`;
        else pointC += `ananda perlu banyak dilatih untuk lebih tertib, memperhatikan adab berbicara, dan tidak banyak bercanda saat majelis sedang berlangsung.`;

        let pointD = `${checkpointText ? `${checkpointText}. ` : ''}Kami memohon kerjasama Ayah/Bunda di rumah untuk terus mendampingi ananda mengulang pelajaran dan menanamkan adab islami sehari-hari. Semoga ananda ${studentName} menjadi anak yang sholeh/sholehah, ahli ilmu, dan penyejuk hati keluarga. Aamiin.`;

        const finalNote = `${pointA}\n\n${pointB}\n\n${pointC}\n\n${pointD}`;

        let profilPsikologis = '';
        const scoreAkhlak    = getScore(behavior.akhlak);
        const scoreDisiplin  = getScore(behavior.kedisiplinan);
        const scoreAktif     = getScore(behavior.keaktifan);
        const scoreTajwid    = getScore(academic.tajwid);
        const scoreFiqih     = getScore(academic.fiqih);
        const scoreTauhid    = getScore(academic.tauhid);
        const scoreQuran     = getScore(academic.quran);

        if (avgAcd >= 3.5 && avgBhv >= 3.5) profilPsikologis = `${studentName} adalah tipe anak teladan. Secara kognitif, ananda memiliki daya serap yang tinggi terhadap ilmu agama, didukung oleh karakter yang disiplin dan berakhlak mulia.`;
        else if (avgAcd >= 3 && avgBhv < 2.5) profilPsikologis = `${studentName} memiliki potensi akademik yang baik. Namun, energi sosialnya yang tinggi terkadang menjadikannya kurang fokus pada aturan kelas.`;
        else if (avgAcd < 2.5 && avgBhv >= 3) profilPsikologis = `${studentName} memiliki adab yang sangat baik. Secara akademik, ananda mungkin membutuhkan waktu lebih lama, namun dengan ketekunan, insya Allah ananda akan terus berkembang.`;
        else if (avgAcd < 2.5 && avgBhv < 2.5) profilPsikologis = `${studentName} saat ini masih berada di tahap adaptasi dan memerlukan banyak bimbingan. Dukungan konsisten dari rumah akan sangat menentukan.`;
        else profilPsikologis = `${studentName} menunjukkan perkembangan yang cukup seimbang antara sisi akademik dan kepribadian.`;

        const kelebihanList = [];
        if (scoreTajwid >= 3) kelebihanList.push('bacaan Tajwid yang baik');
        if (scoreFiqih >= 3)  kelebihanList.push('pemahaman Fiqih yang memadai');
        if (scoreTauhid >= 3) kelebihanList.push('pondasi Tauhid yang kuat');
        if (scoreQuran >= 3)  kelebihanList.push('kelancaran tilawah/hafalan Al-Quran');
        if (scoreAkhlak >= 3) kelebihanList.push('akhlak dan adab yang baik');
        if (scoreDisiplin >= 3) kelebihanList.push('kedisiplinan dalam belajar');
        if (scoreAktif >= 3)  kelebihanList.push('keaktifan belajar');

        const kelebihan = kelebihanList.length > 0 ? `Kelebihan ananda: ${kelebihanList.join(', ')}.` : `Ananda masih dalam proses menemukan potensi terbaiknya.`;

        const kekuranganList = [];
        if (scoreTajwid <= 2) kekuranganList.push('ketelitian hukum Tajwid');
        if (scoreFiqih <= 2)  kekuranganList.push('pemahaman Fiqih sehari-hari');
        if (scoreTauhid <= 2) kekuranganList.push('pemahaman Tauhid');
        if (scoreQuran <= 2)  kekuranganList.push('kelancaran murojaah');
        if (scoreAkhlak <= 2) kekuranganList.push('menjaga adab di kelas');
        if (scoreDisiplin <= 2) kekuranganList.push('kedisiplinan aturan kelas');
        if (scoreAktif <= 2)  kekuranganList.push('dorongan untuk aktif bertanya');

        const kekurangan = kekuranganList.length > 0 ? `Area yang perlu mendapat perhatian ekstra: ${kekuranganList.join('; ')}.` : `Perkembangan merata di semua aspek.`;

        res.status(200).json({ status: "success", data: finalNote, analisis: { profilPsikologis, kelebihan, kekurangan } });
    } catch (error) { res.status(500).json({ status: "error", message: error.message }); }
};

const saveRaport = async (req, res) => {
    try {
        const { id, student_id, academic_grades, behavior_grades, teacher_note } = req.body;
        const created_by = req.user.username;

        let result;
        if (id) {
            result = await supabase
                .from('raports')
                .update({ academic_grades, behavior_grades, teacher_note })
                .eq('id', id)
                .select('id, academic_grades, behavior_grades, teacher_note') // [OPTIMASI]
                .single();
        } else {
            result = await supabase
                .from('raports')
                .insert([{ student_id, created_by, academic_grades, behavior_grades, teacher_note }])
                .select('id, academic_grades, behavior_grades, teacher_note') // [OPTIMASI]
                .single();
        }

        if (result.error) throw result.error;
        res.status(id ? 200 : 201).json({ status: "success", data: result.data });
    } catch (error) { res.status(500).json({ status: "error", message: error.message }); }
};

module.exports = { generateNote, saveRaport };