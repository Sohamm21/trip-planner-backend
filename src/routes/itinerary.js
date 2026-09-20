const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/authenticate');
const { requireMembership } = require('../lib/tripAccess');
const { timestampFromEpoch, epochFromDate } = require('../lib/dateUtils');
const { parseJsonQuery, applyFilters } = require('../lib/queryFilters');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const ITINERARY_FILTER_FIELDS = { isActive: 'is_active' };

router.use(authenticate);

// TODO: currently any trip member (including 'viewer') can write itinerary items.
// Gating writes to requireMembership(['admin', 'editor']) is a natural follow-up,
// intentionally not bundled into the collaborators change so existing behavior doesn't
// shift as a side effect.

function shapeItem(item) {
  return { ...item, scheduled_at: epochFromDate(item.scheduled_at) };
}

// GET /api/trips/:id/itinerary — all activities for a trip. Paginated + filterable via
// ?jsonQuery={"page":1,"limit":20,"filters":[{"key":"isActive","operator":"eq","value":true}]}.
router.get('/:id/itinerary', requireMembership(), async (req, res) => {
  const { id } = req.params;

  const { jsonQuery, error: queryError } = parseJsonQuery(req);
  if (queryError) return res.status(400).json({ error: queryError });

  const page = Math.max(parseInt(jsonQuery.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(jsonQuery.limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  try {
    let query = supabase
      .from('itinerary_items')
      .select('id, name, description, scheduled_at, is_active', { count: 'exact' })
      .eq('trip_id', id);

    try {
      query = applyFilters(query, jsonQuery.filters, ITINERARY_FILTER_FIELDS);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    const from = (page - 1) * limit;
    const { data: items, error, count } = await query
      .order('scheduled_at', { ascending: true })
      .range(from, from + limit - 1);

    if (error) return res.status(400).json({ error: error.message });

    const total = count ?? 0;
    res.json({
      itinerary: items.map(shapeItem),
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips/:id/itinerary — upsert: no itemId in body creates a new activity,
// itemId present updates that activity (partial fields)
router.post('/:id/itinerary', requireMembership(), async (req, res) => {
  const { id } = req.params;
  const { itemId, name, description, scheduled_at, is_active } = req.body;

  try {
    if (itemId) {
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (scheduled_at !== undefined) updates.scheduled_at = timestampFromEpoch(scheduled_at);
      if (is_active !== undefined) updates.is_active = !!is_active;
      updates.updated_at = new Date().toISOString();

      const { data: item, error } = await supabase
        .from('itinerary_items')
        .update(updates)
        .eq('id', itemId)
        .eq('trip_id', id)
        .select('id, name, description, scheduled_at, is_active')
        .single();

      if (error) return res.status(400).json({ error: error.message });

      return res.json({ item: shapeItem(item) });
    }

    if (!name || !scheduled_at) {
      return res.status(400).json({ error: 'name and scheduled_at are required to create an activity' });
    }

    const { data: item, error } = await supabase
      .from('itinerary_items')
      .insert({
        trip_id: id,
        name,
        description,
        scheduled_at: timestampFromEpoch(scheduled_at),
        created_by: req.user.id,
        ...(is_active !== undefined && { is_active: !!is_active }),
      })
      .select('id, name, description, scheduled_at, is_active')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({ item: shapeItem(item) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trips/:id/itinerary?jsonQuery={"itemId":"..."}
router.delete('/:id/itinerary', requireMembership(), async (req, res) => {
  const { id } = req.params;

  const { jsonQuery, error: queryError } = parseJsonQuery(req);
  if (queryError) return res.status(400).json({ error: queryError });

  const { itemId } = jsonQuery;

  if (!itemId) return res.status(400).json({ error: 'itemId is required' });

  try {
    const { error } = await supabase.from('itinerary_items').delete().eq('id', itemId).eq('trip_id', id);

    if (error) return res.status(400).json({ error: error.message });

    res.status(200).json({ message: 'Itinerary item deleted', itemId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
