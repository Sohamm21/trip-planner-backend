const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/authenticate');

// Note: unlike collaborators.js, these routes are gated by IDENTITY (does this invite
// belong to req.user), not trip membership — the invitee isn't a trip member yet by
// definition, so requireMembership() would always reject them. Kept in a separate file
// from collaborators.js so the two authorization models don't get cross-wired later.
//
// Listing invites now happens via GET /api/notifications (type: 'trip_invite') instead
// of a route here — this file only holds the accept/decline actions themselves, since
// "create a trip_members row" is real business logic that belongs with the rest of the
// invite lifecycle, not in the generic notifications surface.
router.use(authenticate);

async function markInviteNotificationRead(inviteId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('reference_type', 'trip_invite')
    .eq('reference_id', inviteId);

  if (error) console.warn(`[notifications] failed to mark trip_invite notification read: ${error.message}`);
}

// POST /api/invites/:inviteId/accept
router.post('/:inviteId/accept', async (req, res) => {
  const { inviteId } = req.params;

  try {
    const { data: invite, error } = await supabase
      .from('trip_invites')
      .select('id, trip_id, invited_user_id, role, status, expires_at')
      .eq('id', inviteId)
      .single();

    if (error || !invite) return res.status(404).json({ error: 'Invite not found' });

    if (invite.invited_user_id !== req.user.id) {
      return res.status(403).json({ error: 'This invite is not addressed to you' });
    }

    if (invite.status !== 'pending') {
      return res.status(409).json({ error: 'This invite has already been responded to' });
    }

    if (new Date(invite.expires_at) < new Date()) {
      await supabase.from('trip_invites').update({ status: 'expired' }).eq('id', inviteId);
      await markInviteNotificationRead(inviteId);
      return res.status(410).json({ error: 'This invite has expired' });
    }

    const { error: memberError } = await supabase
      .from('trip_members')
      .insert({ trip_id: invite.trip_id, user_id: invite.invited_user_id, role: invite.role });

    // A unique-violation here means the user is already a member (e.g. a race with
    // another accept) — treat that as an idempotent success rather than an error.
    if (memberError && memberError.code !== '23505') {
      return res.status(400).json({ error: memberError.message });
    }

    const { error: updateError } = await supabase
      .from('trip_invites')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', inviteId);

    if (updateError) return res.status(400).json({ error: updateError.message });

    await markInviteNotificationRead(inviteId);

    res.json({ message: 'Invite accepted', tripId: invite.trip_id, role: invite.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invites/:inviteId/decline
router.post('/:inviteId/decline', async (req, res) => {
  const { inviteId } = req.params;

  try {
    const { data: invite, error } = await supabase
      .from('trip_invites')
      .select('id, invited_user_id, status, expires_at')
      .eq('id', inviteId)
      .single();

    if (error || !invite) return res.status(404).json({ error: 'Invite not found' });

    if (invite.invited_user_id !== req.user.id) {
      return res.status(403).json({ error: 'This invite is not addressed to you' });
    }

    if (invite.status !== 'pending') {
      return res.status(409).json({ error: 'This invite has already been responded to' });
    }

    if (new Date(invite.expires_at) < new Date()) {
      await supabase.from('trip_invites').update({ status: 'expired' }).eq('id', inviteId);
      await markInviteNotificationRead(inviteId);
      return res.status(410).json({ error: 'This invite has expired' });
    }

    const { error: updateError } = await supabase
      .from('trip_invites')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('id', inviteId);

    if (updateError) return res.status(400).json({ error: updateError.message });

    await markInviteNotificationRead(inviteId);

    res.json({ message: 'Invite declined' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
