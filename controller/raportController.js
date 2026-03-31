const supabase = require('../config/supabaseClient');

// POST /api/raports/generate-note
const generateNote = (req, res) => {
    try {
        const { studentName, academic, behavior, checkpointText  } = req.body;

        // Fungsi pembantu untuk mengubah huruf menjadi angka (A=4, B=3, C=2, D=1)
        const getScore = (grade) => ({'A': 4, 'B': 3, 'C': 2, 'D': 1}[grade] || 2);

        // Rata-rata Akademik
        const acdScores = [academic.tajwid, academic.fiqih, academic.tauhid, academic.quran].map(getScore);
        const avgAcd = acdScores.reduce((a, b) => a + b, 0) / acdScores.length;

        // Rata-rata Sosial/Kepribadian
        const bhvScores = [behavior.kedisiplinan, behavior.akhlak, behavior.keaktifan].map(getScore);
        const avgBhv = bhvScores.reduce((a, b) => a + b, 0) / bhvScores.length;

        // A. PUJIAN & APRESIASI UMUM
        let pointA = `Alhamdulillah, segala puji bagi Allah. Kami sangat bersyukur atas semangat ananda ${studentName} dalam mengikuti kegiatan belajar ngaji sejauh ini.`;
        if (avgAcd >= 3.5 && avgBhv >= 3.5) {
            pointA += ` Ananda menunjukkan prestasi yang sangat luar biasa, baik dari sisi keilmuan maupun adabnya yang mulia.`;
        } else if (avgAcd >= 3 || avgBhv >= 3) {
            pointA += ` Ananda menunjukkan perkembangan yang baik dan membanggakan dari waktu ke waktu.`;
        }

        // B. KRITIK & SARAN AKADEMIK
        let pointB = `Terkait pemahaman materi pelajaran (Tajwid, Fiqih, Tauhid, dan Hafalan Al-Quran), `;
        if (avgAcd >= 3.5) {
            pointB += `ananda sangat cepat menangkap pelajaran. Pertahankan hafalan dan ketelitian bacaannya ya!`;
        } else if (avgAcd >= 2.5) {
            pointB += `ananda sudah cukup baik, namun masih perlu ditingkatkan sedikit murojaah-nya agar lebih lancar dan kuat hafalannya.`;
        } else {
            pointB += `ananda masih membutuhkan bimbingan ekstra. Jangan pantang menyerah untuk terus mengulang pelajaran dari dasar ya.`;
        }

        // C. KRITIK & SARAN SOSIAL/KEPRIBADIAN
        let pointC = `Dari segi kepribadian dan adab di kelas, `;
        if (avgBhv >= 3.5) {
            pointC += `masya Allah, ananda sangat sopan, rajin, dan aktif. Menjadi contoh yang sangat baik bagi teman-temannya.`;
        } else if (avgBhv >= 2.5) {
            pointC += `ananda anak yang baik, meski terkadang masih perlu diingatkan untuk lebih tenang dan fokus saat ustadz/ustadzah sedang menerangkan.`;
        } else {
            pointC += `ananda perlu banyak dilatih untuk lebih tertib, memperhatikan adab berbicara, dan tidak banyak bercanda saat majelis sedang berlangsung.`;
        }

        // D. PESAN UNTUK ORANG TUA
        let pointD = `${checkpointText ? `${checkpointText}. ` : ''}Kami memohon kerjasama Ayah/Bunda di rumah untuk terus mendampingi ananda mengulang pelajaran dan menanamkan adab islami sehari-hari. Semoga ananda ${studentName} menjadi anak yang sholeh/sholehah, ahli ilmu, dan penyejuk hati keluarga. Aamiin.`;

        // Gabungkan 4 poin tersebut dengan 2 enter (baris baru)
        const finalNote = `${pointA}\n\n${pointB}\n\n${pointC}\n\n${pointD}`;

        // --- BAGIAN BARU: PROFIL PSIKOLOGIS & KELEBIHAN/KEKURANGAN ---
        // (a) Profil Psikologis berdasarkan kombinasi skor akademik & kepribadian
        let profilPsikologis = '';
        const scoreAkhlak    = getScore(behavior.akhlak);
        const scoreDisiplin  = getScore(behavior.kedisiplinan);
        const scoreAktif     = getScore(behavior.keaktifan);
        const scoreTajwid    = getScore(academic.tajwid);
        const scoreFiqih     = getScore(academic.fiqih);
        const scoreTauhid    = getScore(academic.tauhid);
        const scoreQuran     = getScore(academic.quran);

        if (avgAcd >= 3.5 && avgBhv >= 3.5) {
            profilPsikologis = `${studentName} adalah tipe anak teladan. Secara kognitif, ananda memiliki daya serap yang tinggi terhadap ilmu agama, didukung oleh karakter yang disiplin dan berakhlak mulia. Dalam lingkungan sosial kelas, ananda cenderung menjadi figur positif yang memberi pengaruh baik kepada teman-temannya.`;
        } else if (avgAcd >= 3 && avgBhv < 2.5) {
            profilPsikologis = `${studentName} memiliki potensi akademik yang baik dan terlihat aktif menyerap materi pelajaran. Namun, energi sosialnya yang tinggi terkadang menjadikannya kurang fokus pada aturan kelas. Ananda butuh pengarahan yang konsisten agar potensi besarnya dapat tersalurkan secara positif.`;
        } else if (avgAcd < 2.5 && avgBhv >= 3) {
            profilPsikologis = `${studentName} adalah anak yang memiliki adab dan karakter yang sangat baik. Ananda dikenal sopan dan mudah diarahkan. Secara akademik, ananda mungkin membutuhkan waktu lebih lama untuk memahami materi, namun dengan ketekunan dan akhlaknya yang baik, insya Allah ananda akan terus berkembang.`;
        } else if (avgAcd < 2.5 && avgBhv < 2.5) {
            profilPsikologis = `${studentName} saat ini masih berada di tahap adaptasi. Baik dari sisi penguasaan materi maupun kebiasaan belajar di kelas, ananda masih memerlukan banyak bimbingan dan perhatian ekstra dari guru maupun orang tua. Dukungan yang hangat dan konsisten dari rumah akan sangat menentukan perkembangannya ke depan.`;
        } else {
            profilPsikologis = `${studentName} menunjukkan perkembangan yang cukup seimbang antara sisi akademik dan kepribadian. Ananda memiliki potensi yang baik dan mulai menunjukkan konsistensi dalam belajar. Dengan dorongan yang tepat, ananda dapat berkembang menjadi anak yang berprestasi.`;
        }

        // (b) Kelebihan berdasarkan nilai tertinggi
        const kelebihanList = [];
        if (scoreTajwid >= 3) kelebihanList.push('bacaan Tajwid yang baik dan teliti');
        if (scoreFiqih >= 3)  kelebihanList.push('pemahaman Fiqih yang memadai dalam kehidupan sehari-hari');
        if (scoreTauhid >= 3) kelebihanList.push('pondasi Tauhid yang kuat');
        if (scoreQuran >= 3)  kelebihanList.push('kelancaran dalam membaca atau menghafal Al-Quran/Iqro');
        if (scoreAkhlak >= 3) kelebihanList.push('akhlak dan adab yang baik di lingkungan belajar');
        if (scoreDisiplin >= 3) kelebihanList.push('kedisiplinan dalam mengikuti kegiatan pengajian');
        if (scoreAktif >= 3)  kelebihanList.push('keaktifan dan antusias dalam mengikuti pembelajaran');

        const kelebihan = kelebihanList.length > 0
            ? `Kelebihan ananda yang perlu terus dikembangkan antara lain: ${kelebihanList.join(', ')}.`
            : `Ananda masih dalam proses menemukan dan mengembangkan potensi terbaiknya. Terus semangat!`;

        // (c) Kekurangan berdasarkan nilai terendah
        const kekuranganList = [];
        if (scoreTajwid <= 2) kekuranganList.push('ketelitian dalam hukum-hukum Tajwid perlu lebih banyak latihan');
        if (scoreFiqih <= 2)  kekuranganList.push('pemahaman Fiqih masih perlu diperdalam dengan contoh nyata sehari-hari');
        if (scoreTauhid <= 2) kekuranganList.push('pemahaman Tauhid perlu lebih sering diulang dan didiskusikan');
        if (scoreQuran <= 2)  kekuranganList.push('kelancaran tilawah / hafalan Al-Quran masih perlu ditingkatkan dengan murojaah rutin');
        if (scoreAkhlak <= 2) kekuranganList.push('masih perlu bimbingan dalam menjaga adab dan sopan santun di kelas');
        if (scoreDisiplin <= 2) kekuranganList.push('kedisiplinan dalam mengikuti aturan kelas masih perlu dilatih');
        if (scoreAktif <= 2)  kekuranganList.push('masih terlihat pasif; perlu lebih banyak didorong untuk aktif bertanya dan menjawab');

        const kekurangan = kekuranganList.length > 0
            ? `Area yang perlu mendapat perhatian dan dukungan ekstra: ${kekuranganList.join('; ')}.`
            : `Secara keseluruhan ananda sudah menunjukkan perkembangan yang merata di semua aspek. Pertahankan!`;

        res.status(200).json({
            status: "success",
            data: finalNote,
            // Analisis tambahan untuk PDF Halaman 2
            analisis: {
                profilPsikologis,
                kelebihan,
                kekurangan
            }
        });
    } catch (error) {
        console.error("Generate Note Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

// POST /api/raports
const saveRaport = async (req, res) => {
    try {
        // Tangkap 'id' dari frontend (kalau null berarti baru, kalau ada berarti edit)
        const { id, student_id, academic_grades, behavior_grades, teacher_note } = req.body;
        const created_by = req.user.username;

        let result;

        if (id) {
            // MODE EDIT (UPDATE)
            result = await supabase
                .from('raports')
                .update({ academic_grades, behavior_grades, teacher_note })
                .eq('id', id)
                .select()
                .single();
        } else {
            // MODE BUAT BARU (INSERT)
            result = await supabase
                .from('raports')
                .insert([{ student_id, created_by, academic_grades, behavior_grades, teacher_note }])
                .select()
                .single();
        }

        if (result.error) throw result.error;
        res.status(id ? 200 : 201).json({ status: "success", data: result.data });
    } catch (error) {
        console.error("Save Raport Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { generateNote, saveRaport };