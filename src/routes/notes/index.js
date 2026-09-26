const express = require('express');
const router = express.Router();
const authenticate = require('../../middleware/authenticate');

router.use(authenticate);
router.use(require('./notesRoutes'));

module.exports = router;
