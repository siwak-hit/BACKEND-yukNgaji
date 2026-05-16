const express = require('express');
const router = express.Router();
const oralExamController = require('../controller/oralExamController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

router.get('/', oralExamController.getOralExamTemplates);
router.get('/student/:studentId/summary', oralExamController.getStudentOralExamSummary);
router.get('/:id', oralExamController.getOralExamDetail);

router.post('/:id/sessions', oralExamController.createOralExamSession);
router.get('/:id/sessions/:sessionId', oralExamController.getOralExamSessionDetail);
router.post('/:id/sessions/:sessionId/start', oralExamController.startOralExamSession);
router.post('/:id/sessions/:sessionId/results', oralExamController.submitOralExamSessionResults);

module.exports = router;
