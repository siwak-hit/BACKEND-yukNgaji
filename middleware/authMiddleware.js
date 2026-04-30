const { findUserByUsername } = require('../model/userModel');
const jwt = require('jsonwebtoken'); // JANGAN LUPA IMPORT INI

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ status: "error", message: "Unauthorized: Token tidak ditemukan" });
    }

    const token = authHeader.split(' ')[1];
    
    // --- 1. CEK APAKAH INI TOKEN MURID (JWT) ---
    try {
        const decodedJWT = jwt.verify(token, process.env.JWT_SECRET);
        // Jika berhasil tembus, ini adalah murid dari Mode PR
        req.user = decodedJWT; 
        return next();
    } catch (jwtError) {
        // Jika gagal, abaikan dan lanjut cek apakah ini token Ustadz (Base64)
    }

    // --- 2. CEK APAKAH INI TOKEN USTADZ (BASE64) ---
    try {
        const decodedString = Buffer.from(token, 'base64').toString('utf8');
        const [username] = decodedString.split('-');

        const user = await findUserByUsername(username);

        if (!user) {
            return res.status(401).json({ status: "error", message: "Unauthorized: User tidak valid" });
        }

        req.user = { username: user.username, role: user.role };
        next();
    } catch (error) {
        return res.status(401).json({ status: "error", message: "Unauthorized: Token tidak valid" });
    }
};

// Fungsi Generate Link PR
const generatePRLink = async (req, res) => {
    try {
        const { student_id, subject, week } = req.body;
        
        if (!student_id || !subject || !week) {
            return res.status(400).json({ status: 'error', message: 'Data tidak lengkap' });
        }

        const payload = { student_id: student_id, role: 'student_pr' };
        const pr_token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '3d' });
        
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4321';
        const link = `${frontendUrl}/consultations/fill?pr_token=${pr_token}&id=${student_id}&subject=${subject}&week=${week}&pr=true`;

        res.status(200).json({ status: "success", data: link });
    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { verifyToken, generatePRLink };