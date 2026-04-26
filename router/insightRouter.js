const express = require('express');
const router = express.Router();
const insightController = require('../controller/insightController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Endpoint Global Dashboard
router.get('/dashboard', insightController.getGlobalDashboard);

// Endpoint Insights Kelas
router.get('/class', insightController.getClassInsights);

router.get('/filters', authMiddleware, insightController.getFilters);

module.exports = router;