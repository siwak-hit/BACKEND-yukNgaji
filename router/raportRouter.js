const express = require('express');
const router = express.Router();
const raportController = require('../controller/raportController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);
router.post('/generate-note', raportController.generateNote);
router.post('/', raportController.saveRaport);

module.exports = router;