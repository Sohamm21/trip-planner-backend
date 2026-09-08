const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/authenticate');
const { epochFromDate } = require('../lib/dateUtils');

// Note: unlike collaborators.js, these routes are gated by IDENTITY (does this invite
// belong to req.user), not trip membership — the invitee isn't a trip member yet by
// definition, so requireMembership() would always reject them. Kept in a separate file
// from collaborators.js so the two authorization models don't get cross-wired later.
router.use(authenticate);

function shapeInvite(invite) {
  return {
    id: invite.id,
    role: invite.role,
    createdAt: epochFromDate(invite.created_at),
    trip: invite.trips
      ? {
          id: invite.trips.id,
          name: invite.trips.name,
          destination: invite.trips.destination,
          start_date: epochFromDate(invite.trips.start_date),
          end_date: epochFromDate(invite.trips.end_date),
        }
      : null,
    invitedBy: invite.inviter ? { name: invite.inviter.name, email: invite.inviter.email } : null,
  };
}

// GET /api/invites — pending invites addressed to the logged-in user. No "/mine" suffix
// needed: every route on this router is already identity-scoped to req.user.
router.get('/', async (req, res) => {
  try {
    const { data: invites, error } = await supabase
      .from('trip_invites')
      .select(`
        id, role, created_at,
        trips ( id, name, destination, start_date, end_date ),
        inviter:profiles!trip_invites_invited_by_fkey ( name, email )
      `)
      .eq('invited_user_id', req.user.id)
      .eq('status', 'pending');

    if (error) return res.status(400).json({ error: error.message });

    res.json({ invites: invites.map(shapeInvite) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/invites/:inviteId/accept
router.post('/:inviteId/accept', async (req, res) => {
  const { inviteId } = req.params;

  try {
    const { data: invite, error } = await supabase
      .from('trip_invites')
      .select('id, trip_id, invited_user_id, role, status')
      .eq('id', inviteId)
      .single();

    if (error || !invite) return res.status(404).json({ error: 'Invite not found' });

    if (invite.invited_user_id !== req.user.id) {
      return res.status(403).json({ error: 'This invite is not addressed to you' });
    }

    if (invite.status !== 'pending') {
      return res.status(409).json({ error: 'This invite has already been responded to' });
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
      .select('id, invited_user_id, status')
      .eq('id', inviteId)
      .single();

    if (error || !invite) return res.status(404).json({ error: 'Invite not found' });

    if (invite.invited_user_id !== req.user.id) {
      return res.status(403).json({ error: 'This invite is not addressed to you' });
    }

    if (invite.status !== 'pending') {
      return res.status(409).json({ error: 'This invite has already been responded to' });
    }

    const { error: updateError } = await supabase
      .from('trip_invites')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('id', inviteId);

    if (updateError) return res.status(400).json({ error: updateError.message });

    res.json({ message: 'Invite declined' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
