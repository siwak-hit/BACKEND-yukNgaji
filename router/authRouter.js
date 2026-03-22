const express = require('express');
const router = express.Router();
const authController = require('../controller/authController');
const authMiddleware = require('../middleware/authMiddleware');

// Public route for login
router.post('/login', authController.login);

// Example of a protected route using the middleware
router.get('/dashboard', authMiddleware, (req, res) => {
    res.status(200).json({
        status: "success",
        message: "Selamat datang di dashboard guru",
        data: {
            providedToken: req.token
        }
    });
});

module.exports = router;