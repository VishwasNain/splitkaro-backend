const express = require('express');
const router = express.Router();
const requireUser = require('../middleware/requireUser');
const {
  getSync,
  putUser,
  putGroups,
  putExpenses,
  putSettlements,
} = require('../controllers/syncController');

router.get('/sync', requireUser, getSync);
router.put('/user', requireUser, putUser);
router.put('/groups', requireUser, putGroups);
router.put('/expenses', requireUser, putExpenses);
router.put('/settlements', requireUser, putSettlements);

module.exports = router;