const express = require('express');
const router = express.Router();
const raportController = require('../controller/raportController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);
router.post('/generate-note', raportController.generateNote);
router.post('/', raportController.saveRaport);

module.exports = router;