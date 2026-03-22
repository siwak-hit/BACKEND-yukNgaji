require('dotenv').config();
const app = require('./index');

const PORT = process.env.PORT || 3000;

// File ini HANYA akan dijalankan di komputermu via perintah "node server.js"
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});