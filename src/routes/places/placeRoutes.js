const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { requireMembership } = require('../../lib/tripAccess');
const { createPlaceSchema, updatePlaceSchema, validateBody } = require('./validation');
const { PLACE_SELECT, shapePlace } = require('./shape');

// GET /api/trips/:id/places — any member
router.get('/:id/places', requireMembership(), async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('places')
      .select(PLACE_SELECT)
      .eq('trip_id', id)
      .order('created_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    res.json({ places: data.map(shapePlace) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips/:id/places — admin/editor only, same reasoning as stays/expenses:
// creating shared trip content shouldn't be left to a read-only role.
router.post('/:id/places', requireMembership(['admin', 'editor']), async (req, res) => {
  const { id } = req.params;

  const { value: body, error: validationError } = validateBody(createPlaceSchema, req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const { data, error } = await supabase
      .from('places')
      .insert({
        trip_id: id,
        name: body.name,
        category: body.category,
        location_url: body.location_url,
        lat: body.lat,
        lng: body.lng,
        photo_url: body.photo_url || null,
        photo_attribution: body.photo_attribution || null,
        notes: body.notes || null,
        created_by: req.user.id,
      })
      .select(PLACE_SELECT)
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({ place: shapePlace(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/trips/:id/places/:placeId — creator-only, matches stays' rule (not role-based).
router.patch('/:id/places/:placeId', requireMembership(), async (req, res) => {
  const { id, placeId } = req.params;

  const { value: body, error: validationError } = validateBody(updatePlaceSchema, req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('places')
      .select('id, created_by')
      .eq('id', placeId)
      .eq('trip_id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Place not found' });

    if (existing.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the person who added this place can edit it' });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.category !== undefined) updates.category = body.category;
    if (body.location_url !== undefined) updates.location_url = body.location_url;
    if (body.lat !== undefined) updates.lat = body.lat;
    if (body.lng !== undefined) updates.lng = body.lng;
    if (body.photo_url !== undefined) updates.photo_url = body.photo_url || null;
    if (body.photo_attribution !== undefined) updates.photo_attribution = body.photo_attribution || null;
    if (body.notes !== undefined) updates.notes = body.notes || null;

    const { data, error } = await supabase
      .from('places')
      .update(updates)
      .eq('id', placeId)
      .select(PLACE_SELECT)
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json({ place: shapePlace(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trips/:id/places/:placeId — creator-only.
router.delete('/:id/places/:placeId', requireMembership(), async (req, res) => {
  const { id, placeId } = req.params;

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('places')
      .select('id, created_by')
      .eq('id', placeId)
      .eq('trip_id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Place not found' });

    if (existing.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the person who added this place can delete it' });
    }

    const { error } = await supabase.from('places').delete().eq('id', placeId);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'Place deleted', id: placeId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
