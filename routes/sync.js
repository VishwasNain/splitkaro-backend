const express = require('express');
const router = express.Router();
const {
  getSync,
  putUser,
  putGroups,
  putExpenses,
  putSettlements,
} = require('../controllers/syncController');

router.get('/sync', getSync);
router.put('/user', putUser);
router.put('/groups', putGroups);
router.put('/expenses', putExpenses);
router.put('/settlements', putSettlements);

module.exports = router;
