const express = require('express');
const router = express.Router();
const todoController = require('../controller/todoController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);
router.put('/:id', todoController.updateTodo); // Endpoint modifikasi task & checkbox

module.exports = router;