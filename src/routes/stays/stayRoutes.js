const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { requireMembership } = require('../../lib/tripAccess');
const { dateStringFromEpoch, epochFromDate } = require('../../lib/dateUtils');
const { parseJsonQuery, applyFilters } = require('../../lib/queryFilters');
const { computeSplits } = require('../expenses/splitLogic');
const { createStaySchema, updateStaySchema, validateBody } = require('./validation');
const { STAY_SELECT, shapeStay } = require('./shape');
const { EXPENSE_CATEGORY_BY_STAY_CATEGORY, createLinkedExpense } = require('./linkedExpense');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const STAY_FILTER_FIELDS = { category: 'category', createdBy: 'created_by' };

// GET /api/trips/:id/stays — any member. Paginated + filterable via
// ?jsonQuery={"page":1,"limit":20,"filters":[{"key":"category","operator":"eq","value":"hotel"}]}.
router.get('/:id/stays', requireMembership(), async (req, res) => {
  const { id } = req.params;

  const { jsonQuery, error: queryError } = parseJsonQuery(req);
  if (queryError) return res.status(400).json({ error: queryError });

  const page = Math.max(parseInt(jsonQuery.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(jsonQuery.limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  try {
    let query = supabase.from('stays').select(STAY_SELECT, { count: 'exact' }).eq('trip_id', id);

    try {
      query = applyFilters(query, jsonQuery.filters, STAY_FILTER_FIELDS);
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
      stays: data.map(shapeStay),
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips/:id/stays — admin/editor only, same "creating this can obligate other
// members financially" reasoning as expenses.
router.post('/:id/stays', requireMembership(['admin', 'editor']), async (req, res) => {
  const { id } = req.params;

  const { value: body, error: validationError } = validateBody(createStaySchema, req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const { name, category, start_date, end_date, booking_url, location_name, location_url, expense } = body;

  try {
    let expenseId = null;

    if (expense) {
      try {
        expenseId = await createLinkedExpense(id, name, category, start_date, expense, req.user.id);
      } catch (err) {
        return res.status(err.status || 500).json({ error: err.message });
      }
    }

    const { data: stay, error } = await supabase
      .from('stays')
      .insert({
        trip_id: id,
        name,
        category,
        start_date: dateStringFromEpoch(start_date),
        end_date: dateStringFromEpoch(end_date),
        booking_url: booking_url || null,
        location_name: location_name || null,
        location_url: location_url || null,
        expense_id: expenseId,
        created_by: req.user.id,
      })
      .select(STAY_SELECT)
      .single();

    if (error) {
      if (expenseId) await supabase.from('expenses').delete().eq('id', expenseId); // avoid an orphan
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({ stay: shapeStay(stay) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/trips/:id/stays/:stayId — creator-only.
router.patch('/:id/stays/:stayId', requireMembership(), async (req, res) => {
  const { id, stayId } = req.params;

  const { value: body, error: validationError } = validateBody(updateStaySchema, req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  const { name, category, start_date, end_date, booking_url, location_name, location_url, expense, removeExpense } = body;

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('stays')
      .select('id, name, category, start_date, expense_id, created_by')
      .eq('id', stayId)
      .eq('trip_id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Stay not found' });

    if (existing.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the person who created this booking can edit it' });
    }

    // both-provided-together case is already covered by the schema's cross-field check —
    // this only covers a lone end_date compared against the already-stored start_date.
    if (end_date !== undefined && start_date === undefined && end_date < epochFromDate(existing.start_date)) {
      return res.status(400).json({ error: 'end_date must not be before start_date' });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (category !== undefined) updates.category = category;
    if (start_date !== undefined) updates.start_date = dateStringFromEpoch(start_date);
    if (end_date !== undefined) updates.end_date = dateStringFromEpoch(end_date);
    if (booking_url !== undefined) updates.booking_url = booking_url || null;
    if (location_name !== undefined) updates.location_name = location_name || null;
    if (location_url !== undefined) updates.location_url = location_url || null;

    if (removeExpense && existing.expense_id) {
      await supabase.from('expenses').delete().eq('id', existing.expense_id); // cascades expense_splits
      updates.expense_id = null;
    } else if (expense) {
      const effectiveName = name !== undefined ? name : existing.name;
      const effectiveCategory = category !== undefined ? category : existing.category;
      const effectiveStartDate = start_date !== undefined ? start_date : epochFromDate(existing.start_date);

      if (existing.expense_id) {
        // update the existing linked expense: amount/category/date + replace its splits
        const amountCents = Math.round(Number(expense.amount) * 100);
        const splits = await computeSplits(id, amountCents, { splitType: 'equal', participantIds: expense.participantIds });

        const { error: deleteSplitsError } = await supabase.from('expense_splits').delete().eq('expense_id', existing.expense_id);
        if (deleteSplitsError) return res.status(400).json({ error: deleteSplitsError.message });

        const { error: insertSplitsError } = await supabase
          .from('expense_splits')
          .insert(splits.map((s) => ({ expense_id: existing.expense_id, user_id: s.userId, share_amount: s.amountCents / 100 })));
        if (insertSplitsError) return res.status(400).json({ error: insertSplitsError.message });

        const { error: expenseUpdateError } = await supabase
          .from('expenses')
          .update({
            name: effectiveName,
            amount: Number(expense.amount),
            category: EXPENSE_CATEGORY_BY_STAY_CATEGORY[effectiveCategory],
            expense_date: dateStringFromEpoch(effectiveStartDate),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.expense_id);
        if (expenseUpdateError) return res.status(400).json({ error: expenseUpdateError.message });
      } else {
        // no expense linked yet — create one now
        try {
          updates.expense_id = await createLinkedExpense(id, effectiveName, effectiveCategory, effectiveStartDate, expense, req.user.id);
        } catch (err) {
          return res.status(err.status || 500).json({ error: err.message });
        }
      }
    }

    const { data: stay, error } = await supabase
      .from('stays')
      .update(updates)
      .eq('id', stayId)
      .select(STAY_SELECT)
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json({ stay: shapeStay(stay) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trips/:id/stays/:stayId — creator-only. Deletes the linked expense too.
router.delete('/:id/stays/:stayId', requireMembership(), async (req, res) => {
  const { id, stayId } = req.params;

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('stays')
      .select('id, expense_id, created_by')
      .eq('id', stayId)
      .eq('trip_id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Stay not found' });

    if (existing.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the person who created this booking can delete it' });
    }

    if (existing.expense_id) {
      await supabase.from('expenses').delete().eq('id', existing.expense_id); // cascades expense_splits
    }

    const { error } = await supabase.from('stays').delete().eq('id', stayId);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'Stay deleted', id: stayId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
