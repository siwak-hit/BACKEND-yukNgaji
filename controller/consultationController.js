const supabase = require('../config/supabaseClient');

// POST /api/consultations
const submitConsultation = async (req, res) => {
    try {
        const { student_id, subject, week, message } = req.body;
        const username = req.user.username; // dari authMiddleware

        if (!student_id || !message) {
            return res.status(400).json({ status: "error", message: "Data tidak lengkap" });
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
                .from('consultations') // Nama bucket yang kamu buat di Langkah 1
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

            image_url = publicUrlData.publicUrl; // Ini yang akan disimpan ke Database!
        }

        // 2. SIMPAN DATA KE DATABASE (Tabel consultations)
        const { data, error } = await supabase
            .from('consultations')
            .insert([{
                student_id,
                subject,
                week: parseInt(week),
                message,
                image_url, // Berisi link HTTPS Supabase, atau null jika tidak ada foto
                created_by: username
            }])
            .select()
            .single();

        if (error) throw error;

        res.status(201).json({ status: "success", data });

    } catch (error) {
        console.error("Submit Consultation Error:", error.message);
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { submitConsultation };