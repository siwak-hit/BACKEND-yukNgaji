const { findUserByUsername } = require('../model/userModel');

// Add 'async' here
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            status: "error",
            message: "Unauthorized: Token tidak ditemukan"
        });
    }

    const token = authHeader.split(' ')[1];
    
    try {
        const decodedString = Buffer.from(token, 'base64').toString('utf8');
        const [username] = decodedString.split('-');

        // Add 'await' here
        const user = await findUserByUsername(username);

        if (!user) {
            return res.status(401).json({
                status: "error",
                message: "Unauthorized: User tidak valid"
            });
        }

        req.user = {
            username: user.username,
            role: user.role
        };
        
        next();
    } catch (error) {
        return res.status(401).json({
            status: "error",
            message: "Unauthorized: Token tidak valid"
        });
    }
};

module.exports = verifyToken;