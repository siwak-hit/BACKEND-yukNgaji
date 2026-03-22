const { findUserByUsername } = require('../model/userModel');

// Add 'async' here
const login = async (req, res) => {
    const { username, password } = req.body;

    // Add 'await' here
    const user = await findUserByUsername(username);

    // Check if user exists AND password matches
    // Note: In production, NEVER store plain text passwords. We should use bcrypt here eventually.
    if (user && user.password === password) {
        // Still using the fake token for now
        const fakeToken = Buffer.from(`${username}-${Date.now()}`).toString('base64');

        return res.status(200).json({
            status: "success",
            message: "Login berhasil",
            data: {
                username: user.username,
                role: user.role,
                token: fakeToken
            }
        });
    }

    return res.status(401).json({
        status: "error",
        message: "Username atau password salah"
    });
};

module.exports = { login };