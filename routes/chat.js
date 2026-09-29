const express = require('express');
const router = express.Router();
const requireUser = require('../middleware/requireUser');
const requireMember = require('../middleware/requireMember');
const { listMessages, sendMessage } = require('../controllers/messagesController');

router.get('/groups/:id/messages', requireUser, requireMember, listMessages);
router.post('/groups/:id/messages', requireUser, requireMember, sendMessage);

module.exports = router;
