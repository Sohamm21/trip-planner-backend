const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { requireMembership } = require('../../lib/tripAccess');
const { createNoteSchema, updateNoteSchema, validateBody } = require('./validation');
const { NOTE_SELECT, shapeNote } = require('./shape');
const { sanitizeNoteContent } = require('../../lib/sanitizeHtml');

// GET /api/trips/:id/notes — any member. Pinned first, then most recently updated.
router.get('/:id/notes', requireMembership(), async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('notes')
      .select(NOTE_SELECT)
      .eq('trip_id', id)
      .order('is_pinned', { ascending: false })
      .order('updated_at', { ascending: false });

    if (error) return res.status(400).json({ error: error.message });

    res.json({ notes: data.map(shapeNote) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips/:id/notes — admin/editor only, same reasoning as places/stays:
// creating shared trip content shouldn't be left to a read-only role.
router.post('/:id/notes', requireMembership(['admin', 'editor']), async (req, res) => {
  const { id } = req.params;

  const { value: body, error: validationError } = validateBody(createNoteSchema, req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const { data, error } = await supabase
      .from('notes')
      .insert({
        trip_id: id,
        content: sanitizeNoteContent(body.content),
        is_pinned: body.is_pinned ?? false,
        created_by: req.user.id,
      })
      .select(NOTE_SELECT)
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.status(201).json({ note: shapeNote(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/trips/:id/notes/:noteId — admin/editor only (viewers can't manage
// notes at all); content edits are further restricted to the note's creator
// (matches places/stays' rule), while pinning is open to any admin/editor.
router.patch('/:id/notes/:noteId', requireMembership(['admin', 'editor']), async (req, res) => {
  const { id, noteId } = req.params;

  const { value: body, error: validationError } = validateBody(updateNoteSchema, req.body);
  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('notes')
      .select('id, created_by')
      .eq('id', noteId)
      .eq('trip_id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Note not found' });

    const isEditingContent = body.content !== undefined;
    if (isEditingContent && existing.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the person who created this note can edit it' });
    }

    const updates = { updated_at: new Date().toISOString() };
    if (body.content !== undefined) updates.content = sanitizeNoteContent(body.content);
    if (body.is_pinned !== undefined) updates.is_pinned = body.is_pinned;

    const { data, error } = await supabase
      .from('notes')
      .update(updates)
      .eq('id', noteId)
      .select(NOTE_SELECT)
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json({ note: shapeNote(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trips/:id/notes/:noteId — admin/editor only, and creator-only
// within that (a viewer can't delete even a note they created before being
// demoted).
router.delete('/:id/notes/:noteId', requireMembership(['admin', 'editor']), async (req, res) => {
  const { id, noteId } = req.params;

  try {
    const { data: existing, error: fetchError } = await supabase
      .from('notes')
      .select('id, created_by')
      .eq('id', noteId)
      .eq('trip_id', id)
      .single();

    if (fetchError || !existing) return res.status(404).json({ error: 'Note not found' });

    if (existing.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Only the person who created this note can delete it' });
    }

    const { error } = await supabase.from('notes').delete().eq('id', noteId);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'Note deleted', id: noteId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
