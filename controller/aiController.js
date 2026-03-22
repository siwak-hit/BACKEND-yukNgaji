const onboardingModel = require('../model/onboardingModel');
const aiService = require('../service/aiRecommendationService');

const getRecommendation = async (req, res) => {
    try {
        const { student_id } = req.body;

        if (!student_id) {
            return res.status(400).json({ status: "error", message: "student_id wajib diisi" });
        }

        // Fetch all onboarding data for this student
        const progressData = await onboardingModel.getStudentProgress(student_id);

        if (!progressData || progressData.length === 0) {
            return res.status(404).json({ 
                status: "error", 
                message: "Data onboarding tidak ditemukan untuk siswa ini" 
            });
        }

        // Isolate latest and previous data
        const latestData = progressData[progressData.length - 1];
        const previousData = progressData.length > 1 ? progressData[progressData.length - 2] : null;

        // Pass to the AI logic service
        const recommendation = aiService.generateRecommendation(latestData, previousData);

        res.status(200).json({
            status: "success",
            data: recommendation
        });

    } catch (error) {
        res.status(500).json({ status: "error", message: error.message });
    }
};

module.exports = { getRecommendation };