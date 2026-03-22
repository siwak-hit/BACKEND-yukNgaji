const supabase = require('../config/supabaseClient');

// POST /api/consultations
const submitConsultation = async (req, res) => {
    try {
        const { student_id, subject, week, akhlak_score, disiplin_score, aktif_score } = req.body;

        if (!student_id) {
            return res.status(400).json({ status: "error", message: "Data siswa tidak lengkap" });
        }

        let image_url = null;

        // 1. JIKA ADA FOTO YANG DIUPLOAD, KIRIM KE SUPABASE STORAGE
        if (req.file) {
            // Buat nama file unik (Contoh: 1698123456789_foto.png)
            const fileExt = req.file.originalname.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `selfies/${fileName}`; // Akan masuk ke folder 'selfies' di dalam bucket

            // Proses upload dari memory (buffer) langsung ke Supabase
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('consultations')
                .upload(filePath, req.file.buffer, {
                    contentType: req.file.mimetype,
                    upsert: false
                });

            if (uploadError) {
                console.error("Gagal upload foto ke Supabase:", uploadError.message);
                throw uploadError;
            }

            // Dapatkan URL Publik dari gambar yang baru diupload
            const { data: publicUrlData } = supabase.storage
                .from('consultations')
                .getPublicUrl(filePath);

            image_url = publicUrlData.publicUrl; // Ini yang akan disimpan ke Database
        }

            // 2. SIMPAN DATA KE DATABASE (Tabel consultations)
            const { data, error } = await supabase
            .from('consultations')
            .insert([{
                student_id,
                subject,
                week: week ? parseInt(week) : null,
                akhlak_score: parseInt(akhlak_score) || 0,
                disiplin_score: parseInt(disiplin_score) || 0,
                aktif_score: parseInt(aktif_score) || 0,
                image_url 
            }])
            .select()
            .single();

        if (error) {
            console.error("Supabase Insert Error:", error.message);
            throw error;
        }

        res.status(201).json({ status: "success", data });

    } catch (error) {
        console.error("Submit Consultation Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { submitConsultation };