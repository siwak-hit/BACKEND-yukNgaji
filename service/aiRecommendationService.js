const generateRecommendation = (latestData, previousData) => {
    // 1. Dynamic scaling: We can add more subjects here in the future
    const subjects = ['tajwid', 'fiqih', 'tauhid'];
    
    let focus = [];
    let todos = [];
    let lowestScore = 100;
    let weakSubjectsCount = 0;
    let note_for_teacher = "";

    // 2. Analyze current week scores
    const analyzedSubjects = subjects.map(subject => {
        const score = latestData[`${subject}_score`];
        
        if (score < lowestScore) lowestScore = score;
        if (score < 60) weakSubjectsCount++;
        
        return { name: subject, score: score };
    });

    // Sort subjects from lowest score to highest to prioritize weaknesses
    analyzedSubjects.sort((a, b) => a.score - b.score);

    // 3. Cross Analysis Rule: Load Reduction
    let subjectsToProcess = analyzedSubjects;
    if (weakSubjectsCount > 1) {
        subjectsToProcess = analyzedSubjects.slice(0, 2); // Keep only top 2 worst subjects
        note_for_teacher += "Beban belajar dikurangi: Fokus maksimal pada 2 subjek terlemah saja. ";
    }

    // 4. Base Priority & Teaching Method based on the absolute lowest score
    let priority = "low";
    let teaching_method = "challenge-based";

    if (lowestScore < 50) {
        priority = "high";
        teaching_method = "repetition + simple explanation";
    } else if (lowestScore <= 70) {
        priority = "medium";
        teaching_method = "practice + correction";
    }

    // 5. Generate Specific Focus and Todos
    subjectsToProcess.forEach(subject => {
        const subjectName = subject.name.charAt(0).toUpperCase() + subject.name.slice(1);

        if (subject.score < 50) {
            focus.push(`${subjectName} - Ulang materi dasar`);
            todos.push({
                title: `Review Dasar ${subjectName}`,
                description: `Latihan pengulangan materi dasar ${subject.name}. Kategori: penting dan mendesak`
            });
        } else if (subject.score <= 70) {
            focus.push(`${subjectName} - Perbaikan dan latihan`);
            todos.push({
                title: `Latihan ${subjectName}`,
                description: `Perbanyak praktik mandiri ${subject.name}. Kategori: penting tapi gak mendesak`
            });
        } else {
            focus.push(`${subjectName} - Penguatan dan materi baru`);
            todos.push({
                title: `Tantangan Lanjutan ${subjectName}`,
                description: `Persiapan materi baru ${subject.name}. Kategori: gak penting tapi mendesak`
            });
        }
    });

    // 6. Cross Analysis Rule: Improvement Check
    if (previousData) {
        const calculateAvg = (data) => (data.tajwid_score + data.fiqih_score + data.tauhid_score) / 3;
        
        const currentAvg = calculateAvg(latestData);
        const previousAvg = calculateAvg(previousData);

        if (currentAvg <= previousAvg) {
            note_for_teacher += "Metode sebelumnya kurang efektif: Skor rata-rata siswa tidak mengalami kenaikan dari minggu lalu. Jangan lanjut ke materi baru sebelum siswa memahami dasar.";
        }
    }

    if (!note_for_teacher) {
        note_for_teacher = "Siswa menunjukkan progres positif. Lanjutkan ritme pembelajaran.";
    }

    return {
        focus,
        priority,
        teaching_method,
        todos,
        note_for_teacher: note_for_teacher.trim()
    };
};

module.exports = { generateRecommendation };