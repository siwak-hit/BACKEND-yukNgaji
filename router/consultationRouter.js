const express = require('express');
const router = express.Router();
const multer = require('multer');
const consultationController = require('../controller/consultationController');
const { verifyToken } = require('../middleware/authMiddleware');

// 1. UBAH MULTER: Gunakan memoryStorage agar aman di Vercel
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // Batasi maksimal 5MB agar aman
});

router.use(verifyToken);

// 2. Pastikan nama field-nya 'image' (Sesuai dengan formData.append('image', file) di Frontend)
router.post('/', upload.single('image'), consultationController.submitConsultation);

module.exports = router;