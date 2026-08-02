const express = require('express');
const router = express.Router();
const oral = require('../controller/oralController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

// Bank perintah
router.get('/prompts', oral.listPrompts);
router.post('/prompts', oral.createPrompt);
router.post('/prompts/bulk-delete', oral.bulkDeletePrompts);   // sebelum /:id biar tak ketabrak
router.put('/prompts/:id', oral.updatePrompt);
router.delete('/prompts/:id', oral.deletePrompt);

// Nilai lisan seorang murid (taruh sebelum /sessions/:id biar tak ketabrak)
router.get('/summary/:studentId', oral.getStudentSummary);

// Sesi
router.get('/sessions', oral.listSessions);
router.post('/sessions', oral.createSession);
router.post('/sessions/bulk-delete', oral.bulkDeleteSessions);
router.get('/sessions/:id', oral.getSessionDetail);
router.delete('/sessions/:id', oral.deleteSession);
router.post('/sessions/:id/students/:studentId/result', oral.submitStudentResult);

module.exports = router;
