const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const tajwidController = require('../controller/tajwidController');
const { verifyToken } = require('../middleware/authMiddleware');

// --- Publik: latihan siswa (link + token) ---
router.get('/public/:token', tajwidController.getPublicExercise);
router.post('/public/:token/ayat/:ayatId/score', upload.single('audio'), tajwidController.scorePublic);
router.get('/public/result/:exerciseId/:studentId', tajwidController.getPublicStudentResult);

// --- Publik (teks Quran, tak sensitif) ---
router.get('/surahs', tajwidController.listSurahs);
router.get('/surah/:key', tajwidController.getSurahAyat);
router.get('/surah/:key/references', verifyToken, tajwidController.getSurahReferences);

// --- Guru only: kelola latihan ---
router.post('/exercises', verifyToken, tajwidController.createExercise);
router.get('/exercises', verifyToken, tajwidController.listExercises);
router.get('/results-all', verifyToken, tajwidController.resultsAll);
router.get('/exercises/:id/submissions', verifyToken, tajwidController.listSubmissions);
router.post('/submissions/:id/review', verifyToken, tajwidController.reviewSubmission);
router.post('/exercises/:id/students/:studentId/notify', verifyToken, tajwidController.notifyResult);
router.get('/ayat/:id', tajwidController.getAyat);

// --- Guru only (Fase B: bikin reference) ---
router.get('/ayat/:id/suggest', verifyToken, tajwidController.suggestMad);
router.get('/ayat/:id/reference', verifyToken, tajwidController.getReference);
router.post('/ayat/:id/reference', verifyToken, upload.single('audio'), tajwidController.saveReference);
router.delete('/ayat/:id/reference', verifyToken, tajwidController.deleteReference);

// debug
router.post('/transcribe', upload.single('audio'), tajwidController.transcribe);

module.exports = router;
