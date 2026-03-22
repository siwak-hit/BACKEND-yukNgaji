const express = require('express');
const router = express.Router();
const profileController = require('../controller/profileController');
const authMiddleware = require('../middleware/authMiddleware');

// Apply middleware to protect the route
router.get('/profile', authMiddleware, profileController.getProfile);

module.exports = router;