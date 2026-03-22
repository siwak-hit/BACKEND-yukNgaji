const fs = require('fs');
const questionModel = require('../model/questionModel');

// POST /api/onboarding/upload-template
const uploadQuestionTemplate = async (req, res) => {
    try {
        const { subject } = req.body;
        
        if (!req.file || !subject) {
            return res.status(400).json({ status: "error", message: "File .txt dan subject wajib disertakan" });
        }

        // 1. Baca isi file TXT
        const rawText = fs.readFileSync(req.file.path, 'utf8');
        
        // 2. Hapus file dari server setelah dibaca (biar memori server gak penuh)
        fs.unlinkSync(req.file.path);

        // 3. Pisahkan teks berdasarkan baris kosong (antar soal)
        // Regex \r?\n\r?\n menangani format enter di Windows maupun Mac/Linux
        const blocks = rawText.split(/\r?\n\r?\n/); 
        
        const parsedQuestions = [];

        // 4. Proses setiap blok menjadi satu soal
        for (const block of blocks) {
            const lines = block.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '');
            
            if (lines.length >= 6) { // Pastikan ada Q, A, B, C, D, dan KUNCI
                const qLine = lines.find(l => l.startsWith('Q:'));
                const aLine = lines.find(l => l.startsWith('A:'));
                const bLine = lines.find(l => l.startsWith('B:'));
                const cLine = lines.find(l => l.startsWith('C:'));
                const dLine = lines.find(l => l.startsWith('D:'));
                const keyLine = lines.find(l => l.startsWith('KUNCI:'));

                if (qLine && aLine && bLine && cLine && dLine && keyLine) {
                    parsedQuestions.push({
                        subject: subject,
                        question: qLine.replace('Q:', '').trim(),
                        options: {
                            A: aLine.replace('A:', '').trim(),
                            B: bLine.replace('B:', '').trim(),
                            C: cLine.replace('C:', '').trim(),
                            D: dLine.replace('D:', '').trim(),
                        },
                        correct_answer: keyLine.replace('KUNCI:', '').trim().toUpperCase()
                    });
                }
            }
        }

        if (parsedQuestions.length === 0) {
            return res.status(400).json({ status: "error", message: "Gagal mendeteksi soal. Pastikan format TXT sudah benar (Q:, A:, B:, C:, D:, KUNCI:)" });
        }

        // 5. Simpan array soal ke Supabase
        const savedQuestions = await questionModel.insertQuestions(parsedQuestions);

        res.status(201).json({ 
            status: "success", 
            message: `${savedQuestions.length} soal berhasil diunggah dan disimpan ke bank soal ${subject}`,
            data: savedQuestions 
        });

    } catch (error) {
        // Jika error, pastikan file tetap terhapus
        if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { uploadQuestionTemplate };