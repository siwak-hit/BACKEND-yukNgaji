const express = require('express');
const router = express.Router();
const ctrl = require('../controller/studentAuthController');
const { verifyToken } = require('../middleware/authMiddleware');

// Publik (tanpa login) — izin lewat link umum
router.post('/login', ctrl.login);
router.get('/public/students', ctrl.getPublicStudents);   // cari nama
router.post('/public/izin', ctrl.submitPublicIzin);       // kirim izin + alasan
router.get('/public/izin-today', ctrl.getIzinToday);      // cek sudah izin hari ini?
router.get('/push/key', ctrl.getPushKey);                 // VAPID public key
router.get('/push/overdue-scan', ctrl.overdueScan);       // cron: push tugas lewat deadline

// Butuh token (murid maupun guru; role dicek di controller)
router.use(verifyToken);
router.get('/me', ctrl.getMyProfile);                     // murid: profil + koin/inventory
router.post('/push/subscribe', ctrl.savePushSubscription);// daftar device utk push
router.get('/tasks', ctrl.getMyTasks);                    // murid: PR yang belum dikerjakan
router.get('/notifications', ctrl.getMyNotifications);    // murid: notif izin disetujui
router.post('/reports', ctrl.submitReport);              // murid kirim aduan
router.get('/reports/mine', ctrl.getMyReports);          // murid: riwayat + lock
router.get('/reports', ctrl.getReportsForTeacher);       // guru: daftar aduan
router.patch('/reports/:id/resolve', ctrl.resolveReport);// guru: tandai selesai
router.get('/izin/pending', ctrl.getPendingIzin);        // guru: izin harian menunggu
router.patch('/izin/:id/decide', ctrl.decideIzin);       // guru: terima/tolak izin

module.exports = router;
