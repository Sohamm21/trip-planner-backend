const express = require('express');
const router = express.Router();
const authenticate = require('../../middleware/authenticate');

router.use(authenticate);

// balanceRoutes/settlementRoutes mounted before expenseRoutes so their more specific
// /:id/expenses/balances and /:id/expenses/settlements paths are never at risk of being
// shadowed by expenseRoutes' /:id/expenses/:expenseId pattern.
router.use(require('./balanceRoutes'));
router.use(require('./settlementRoutes'));
router.use(require('./expenseRoutes'));

module.exports = router;
