const express = require('express');
const router = express.Router();
const aiController = require('../controller/aiController');
const authMiddleware = require('../middleware/authMiddleware');

// Protect the endpoint
router.use(authMiddleware);

router.post('/recommendation', aiController.getRecommendation);

module.exports = router;