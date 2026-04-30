const express = require('express');
const router = express.Router();
const insightController = require('../controller/insightController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

// Endpoint Global Dashboard
router.get('/dashboard', insightController.getGlobalDashboard);

// Endpoint Insights Kelas
router.get('/class', insightController.getClassInsights);

router.get('/filters', verifyToken, insightController.getFilters);

module.exports = router;