const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { requireMembership } = require('../../lib/tripAccess');
const { SETTLEMENT_SELECT, shapeSettlement } = require('./shape');
const { allAreMembers } = require('./splitLogic');

// GET /api/trips/:id/expenses/settlements — settlement history for the trip
router.get('/:id/expenses/settlements', requireMembership(), async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('settlements')
      .select(SETTLEMENT_SELECT)
      .eq('trip_id', id)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    res.json({ settlements: data.map(shapeSettlement) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips/:id/expenses/settlements — record "I paid X back"
router.post('/:id/expenses/settlements', requireMembership(), async (req, res) => {
  const { id } = req.params;
  const { paidTo, amount, note } = req.body;

  if (!paidTo || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'paidTo and a positive amount are required' });
  }

  if (paidTo === req.user.id) {
    return res.status(400).json({ error: 'You cannot record a settlement with yourself' });
  }

  try {
    if (!(await allAreMembers(id, [paidTo]))) {
      return res.status(400).json({ error: 'paidTo is not a member of this trip' });
    }

    const { data, error } = await supabase
      .from('settlements')
      .insert({ trip_id: id, paid_by: req.user.id, paid_to: paidTo, amount: Number(amount), note })
      .select(SETTLEMENT_SELECT)
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({ settlement: shapeSettlement(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
