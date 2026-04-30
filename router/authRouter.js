const express = require('express');
const router = express.Router();
const authController = require('../controller/authController');

// HANYA import verifyToken di sini
const { verifyToken } = require('../middleware/authMiddleware');

router.post('/login', authController.login);

router.get('/dashboard', verifyToken, (req, res) => {
    res.status(200).json({
        status: "success",
        message: "Selamat datang di dashboard guru",
        data: {
            providedToken: req.token
        }
    });
});

module.exports = router;