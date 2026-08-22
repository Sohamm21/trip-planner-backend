const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/authenticate');
const { timestampFromEpoch, epochFromDate } = require('../lib/dateUtils');

router.use(authenticate);

async function checkMembership(tripId, userId) {
  const { data: member } = await supabase
    .from('trip_members')
    .select('role')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .single();

  return member;
}

function shapeItem(item) {
  return { ...item, scheduled_at: epochFromDate(item.scheduled_at) };
}

// GET /api/trips/:id/itinerary — all activities for a trip
router.get('/:id/itinerary', async (req, res) => {
  const { id } = req.params;

  try {
    const member = await checkMembership(id, req.user.id);
    if (!member) return res.status(403).json({ error: 'You do not have access to this trip' });

    const { data: items, error } = await supabase
      .from('itinerary_items')
      .select('id, name, description, scheduled_at')
      .eq('trip_id', id)
      .order('scheduled_at', { ascending: true });

    if (error) return res.status(400).json({ error: error.message });

    res.json({ itinerary: items.map(shapeItem) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips/:id/itinerary — upsert: no itemId in body creates a new activity,
// itemId present updates that activity (partial fields)
router.post('/:id/itinerary', async (req, res) => {
  const { id } = req.params;
  const { itemId, name, description, scheduled_at } = req.body;

  try {
    const member = await checkMembership(id, req.user.id);
    if (!member) return res.status(403).json({ error: 'You do not have access to this trip' });

    if (itemId) {
      const updates = {};
      if (name !== undefined) updates.name = name;
      if (description !== undefined) updates.description = description;
      if (scheduled_at !== undefined) updates.scheduled_at = timestampFromEpoch(scheduled_at);
      updates.updated_at = new Date().toISOString();

      const { data: item, error } = await supabase
        .from('itinerary_items')
        .update(updates)
        .eq('id', itemId)
        .eq('trip_id', id)
        .select('id, name, description, scheduled_at')
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
      })
      .select('id, name, description, scheduled_at')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({ item: shapeItem(item) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trips/:id/itinerary?itemId=:itemId
router.delete('/:id/itinerary', async (req, res) => {
  const { id } = req.params;
  const { itemId } = req.query;

  if (!itemId) return res.status(400).json({ error: 'itemId is required' });

  try {
    const member = await checkMembership(id, req.user.id);
    if (!member) return res.status(403).json({ error: 'You do not have access to this trip' });

    const { error } = await supabase.from('itinerary_items').delete().eq('id', itemId).eq('trip_id', id);

    if (error) return res.status(400).json({ error: error.message });

    res.status(200).json({ message: 'Itinerary item deleted', itemId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
