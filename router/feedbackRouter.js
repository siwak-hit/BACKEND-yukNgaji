const express = require('express');
const router = express.Router();
const feedbackController = require('../controller/feedbackController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);
router.get('/', feedbackController.getFeedbacks);

module.exports = router;
