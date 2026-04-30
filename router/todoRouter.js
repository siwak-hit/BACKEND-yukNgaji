const express = require('express');
const router = express.Router();
const todoController = require('../controller/todoController');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);
router.put('/:id', todoController.updateTodo); // Endpoint modifikasi task & checkbox

module.exports = router;