const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { requireMembership } = require('../../lib/tripAccess');
const { SETTLEMENT_SELECT, shapeSettlement } = require('./shape');
const { allAreMembers } = require('./splitLogic');
const { parseJsonQuery, applyFilters } = require('../../lib/queryFilters');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const SETTLEMENT_FILTER_FIELDS = { paidBy: 'paid_by', paidTo: 'paid_to' };

// GET /api/trips/:id/expenses/settlements — settlement history for the trip. Paginated +
// filterable via ?jsonQuery={"page":1,"limit":20,"filters":[{"key":"paidBy","operator":"eq","value":"..."}]}.
router.get('/:id/expenses/settlements', requireMembership(), async (req, res) => {
  const { id } = req.params;

  const { jsonQuery, error: queryError } = parseJsonQuery(req);
  if (queryError) return res.status(400).json({ error: queryError });

  const page = Math.max(parseInt(jsonQuery.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(jsonQuery.limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  try {
    let query = supabase.from('settlements').select(SETTLEMENT_SELECT, { count: 'exact' }).eq('trip_id', id);

    try {
      query = applyFilters(query, jsonQuery.filters, SETTLEMENT_FILTER_FIELDS);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    const from = (page - 1) * limit;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (error) return res.status(400).json({ error: error.message });

    const total = count ?? 0;
    res.json({
      settlements: data.map(shapeSettlement),
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    });
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
