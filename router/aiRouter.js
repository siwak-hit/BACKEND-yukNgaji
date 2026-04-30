const express = require('express');
const router = express.Router();
const aiController = require('../controller/aiController');
const { verifyToken } = require('../middleware/authMiddleware');

// Protect the endpoint
router.use(verifyToken);

router.post('/recommendation', aiController.getRecommendation);

module.exports = router;