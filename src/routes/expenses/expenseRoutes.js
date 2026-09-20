const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { requireMembership } = require('../../lib/tripAccess');
const { dateStringFromEpoch } = require('../../lib/dateUtils');
const { CATEGORIES, EXPENSE_SELECT, shapeExpense } = require('./shape');
const { computeSplits } = require('./splitLogic');
const { parseJsonQuery, applyFilters } = require('../../lib/queryFilters');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const EXPENSE_FILTER_FIELDS = { category: 'category', paidBy: 'paid_by' };

// GET /api/trips/:id/expenses — all expenses for the trip. Paginated + filterable via
// ?jsonQuery={"page":1,"limit":20,"filters":[{"key":"category","operator":"eq","value":"food"}]}.
router.get('/:id/expenses', requireMembership(), async (req, res) => {
  const { id } = req.params;

  const { jsonQuery, error: queryError } = parseJsonQuery(req);
  if (queryError) return res.status(400).json({ error: queryError });

  const page = Math.max(parseInt(jsonQuery.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(jsonQuery.limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  try {
    let query = supabase.from('expenses').select(EXPENSE_SELECT, { count: 'exact' }).eq('trip_id', id);

    try {
      query = applyFilters(query, jsonQuery.filters, EXPENSE_FILTER_FIELDS);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    const from = (page - 1) * limit;
    const { data, error, count } = await query
      .order('expense_date', { ascending: false })
      .range(from, from + limit - 1);

    if (error) return res.status(400).json({ error: error.message });

    const total = count ?? 0;
    res.json({
      expenses: data.map(shapeExpense),
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips/:id/expenses — log an expense + its splits.
// Restricted to admin/editor (not viewer): unlike an itinerary item, creating an expense
// immediately assigns a debt to other members, so a read-only role shouldn't be able to
// financially obligate people. PATCH/DELETE are separately guarded by payer-only ownership.
router.post('/:id/expenses', requireMembership(['admin', 'editor']), async (req, res) => {
  const { id } = req.params;
  const { name, amount, category, date } = req.body;

  if (!name || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'name and a positive amount are required' });
  }

  if (category && !CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
  }

  try {
    const amountCents = Math.round(Number(amount) * 100);
    const splits = await computeSplits(id, amountCents, req.body);

    const { data: expense, error } = await supabase
      .from('expenses')
      .insert({
        trip_id: id,
        name,
        amount: Number(amount),
        category,
        paid_by: req.user.id,
        expense_date: date ? dateStringFromEpoch(date) : undefined,
      })
      .select('id')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    const { error: splitsError } = await supabase
      .from('expense_splits')
      .insert(splits.map((s) => ({ expense_id: expense.id, user_id: s.userId, share_amount: s.amountCents / 100 })));

    if (splitsError) {
      await supabase.from('expenses').delete().eq('id', expense.id);
      return res.status(400).json({ error: splitsError.message });
    }

    const { data: full, error: refetchError } = await supabase
      .from('expenses')
      .select(EXPENSE_SELECT)
      .eq('id', expense.id)
      .single();

    if (refetchError) return res.status(400).json({ error: refetchError.message });

    res.status(201).json({ expense: shapeExpense(full) });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

// PATCH /api/trips/:id/expenses/:expenseId — payer-only
router.patch('/:id/expenses/:expenseId', requireMembership(), async (req, res) => {
  const { id, expenseId } = req.params;
  const { name, amount, category, date, splitType } = req.body;

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('expenses')
      .select('id, paid_by, amount')
      .eq('id', expenseId)
      .eq('trip_id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Expense not found' });

    if (existing.paid_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the person who paid for this expense can edit it' });
    }

    if (amount !== undefined && !splitType) {
      return res.status(400).json({ error: 'Provide splitType/participantIds or splits when changing the amount' });
    }

    if (category && !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (amount !== undefined) updates.amount = Number(amount);
    if (category !== undefined) updates.category = category;
    if (date !== undefined) updates.expense_date = dateStringFromEpoch(date);

    if (splitType) {
      const amountCents = Math.round(Number(amount !== undefined ? amount : existing.amount) * 100);
      const splits = await computeSplits(id, amountCents, req.body);

      const { error: deleteError } = await supabase.from('expense_splits').delete().eq('expense_id', expenseId);
      if (deleteError) return res.status(400).json({ error: deleteError.message });

      const { error: insertError } = await supabase
        .from('expense_splits')
        .insert(splits.map((s) => ({ expense_id: expenseId, user_id: s.userId, share_amount: s.amountCents / 100 })));
      if (insertError) return res.status(400).json({ error: insertError.message });
    }

    const { error: updateError } = await supabase.from('expenses').update(updates).eq('id', expenseId);
    if (updateError) return res.status(400).json({ error: updateError.message });

    const { data: full, error: refetchError } = await supabase
      .from('expenses')
      .select(EXPENSE_SELECT)
      .eq('id', expenseId)
      .single();

    if (refetchError) return res.status(400).json({ error: refetchError.message });

    res.json({ expense: shapeExpense(full) });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
});

// DELETE /api/trips/:id/expenses/:expenseId — payer-only, splits cascade automatically
router.delete('/:id/expenses/:expenseId', requireMembership(), async (req, res) => {
  const { id, expenseId } = req.params;

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('expenses')
      .select('id, paid_by')
      .eq('id', expenseId)
      .eq('trip_id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Expense not found' });

    if (existing.paid_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the person who paid for this expense can delete it' });
    }

    const { error } = await supabase.from('expenses').delete().eq('id', expenseId);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'Expense deleted', expenseId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
