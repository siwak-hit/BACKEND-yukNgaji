const getProfile = (req, res) => {
    return res.status(200).json({
        status: "success",
        data: {
            username: req.user.username,
            role: req.user.role
        }
    });
};

module.exports = { getProfile };