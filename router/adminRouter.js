const express = require('express');
const router = express.Router();
const adminController = require('../controller/adminController');
const authMiddleware = require('../middleware/authMiddleware');

// Gunakan auth middleware
router.use(authMiddleware);

// Endpoint Reset
router.post('/factory-reset', adminController.factoryReset);

module.exports = router;