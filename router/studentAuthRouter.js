const express = require('express');
const router = express.Router();
const ctrl = require('../controller/studentAuthController');
const { verifyToken } = require('../middleware/authMiddleware');

// Publik (tanpa login) — izin lewat link umum
router.post('/login', ctrl.login);
router.get('/public/students', ctrl.getPublicStudents);   // cari nama
router.post('/public/izin', ctrl.submitPublicIzin);       // kirim izin + alasan

// Butuh token (murid maupun guru; role dicek di controller)
router.use(verifyToken);
router.get('/me', ctrl.getMyProfile);                     // murid: profil + koin/inventory
router.get('/tasks', ctrl.getMyTasks);                    // murid: PR yang belum dikerjakan
router.get('/notifications', ctrl.getMyNotifications);    // murid: notif izin disetujui
router.post('/reports', ctrl.submitReport);              // murid kirim aduan
router.get('/reports/mine', ctrl.getMyReports);          // murid: riwayat + lock
router.get('/reports', ctrl.getReportsForTeacher);       // guru: daftar aduan
router.patch('/reports/:id/resolve', ctrl.resolveReport);// guru: tandai selesai

module.exports = router;
