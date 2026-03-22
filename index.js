const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

const authRouter = require('./router/authRouter');
const profileRouter = require('./router/profileRouter');
const studentRouter = require('./router/studentRouter');
const onboardingRouter = require('./router/onboardingRouter');
const insightRouter = require('./router/insightRouter');
const todoRouter = require('./router/todoRouter');
const consultationRouter = require('./router/consultationRouter');
const raportRouter = require('./router/raportRouter');
const attendanceRouter = require('./router/attendanceRouter');

// 1. Konfigurasi CORS (Sangat penting agar Frontend di Vercel bisa akses)
app.use(cors({
    origin: '*', // Jika Frontend sudah di-hosting, ganti '*' menjadi ['https://domain-frontend-kamu.vercel.app', 'http://localhost:5173']
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ⚠️ PERHATIAN: Di Vercel, folder /uploads ini bersifat Read-Only.
// Jika ada fitur upload foto, fotonya akan hilang beberapa saat setelah di-upload.
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 2. Route Default (Cek Status Server di Vercel)
app.get('/', (req, res) => {
    res.status(200).json({ 
        status: 'success', 
        message: '🚀 yukNgaji API is perfectly running on Vercel!' 
    });
});

// 3. API Routes
app.use('/api', authRouter);
app.use('/api', profileRouter);
app.use('/api/students', studentRouter);
app.use('/api/onboarding', onboardingRouter);
app.use('/api/insights', insightRouter);
app.use('/api/todos', todoRouter);
app.use('/api/consultations', consultationRouter);
app.use('/api/raports', raportRouter);
app.use('/api/attendances', attendanceRouter);

// 4. Export untuk dibaca oleh platform Serverless Vercel
module.exports = app;