const express = require('express');
const router = express.Router();
const profileController = require('../controller/profileController');
const { verifyToken } = require('../middleware/authMiddleware');

// Apply middleware to protect the route
router.get('/profile', verifyToken, profileController.getProfile);

module.exports = router;