const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/authenticate');
const { requireMembership } = require('../lib/tripAccess');
const { epochFromDate } = require('../lib/dateUtils');
const { sendInviteEmail } = require('../lib/email');

router.use(authenticate);

function shapeMember(member) {
  return {
    id: member.id,
    userId: member.user_id,
    role: member.role,
    name: member.profiles?.name ?? null,
    email: member.profiles?.email ?? null,
  };
}

function shapeInvite(invite) {
  return {
    id: invite.id,
    email: invite.invited_email,
    role: invite.role,
    createdAt: epochFromDate(invite.created_at),
    invitedBy: invite.inviter ? { name: invite.inviter.name, email: invite.inviter.email } : null,
  };
}

// GET /api/trips/:id/collaborators — current members + pending invites
router.get('/:id/collaborators', requireMembership(), async (req, res) => {
  const { id } = req.params;

  try {
    const { data: members, error: membersError } = await supabase
      .from('trip_members')
      .select('id, user_id, role, profiles!trip_members_user_id_profiles_fkey(name, email)')
      .eq('trip_id', id);

    if (membersError) return res.status(400).json({ error: membersError.message });

    const { data: invites, error: invitesError } = await supabase
      .from('trip_invites')
      .select('id, invited_email, role, created_at, inviter:profiles!trip_invites_invited_by_fkey(name, email)')
      .eq('trip_id', id)
      .eq('status', 'pending');

    if (invitesError) return res.status(400).json({ error: invitesError.message });

    res.json({
      members: members.map(shapeMember),
      pendingInvites: invites.map(shapeInvite),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips/:id/collaborators/invite — admin-only, invite by email
router.post('/:id/collaborators/invite', requireMembership(['admin']), async (req, res) => {
  const { id } = req.params;
  const { email, role } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: 'email and role are required' });
  }

  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: "role must be one of 'admin', 'editor', 'viewer'" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, name')
      .eq('email', normalizedEmail)
      .single();

    if (!profile) {
      return res.status(404).json({ error: 'No account found with this email' });
    }

    const { data: existingMember } = await supabase
      .from('trip_members')
      .select('id')
      .eq('trip_id', id)
      .eq('user_id', profile.id)
      .single();

    if (existingMember) {
      return res.status(409).json({ error: 'This user is already a collaborator on this trip' });
    }

    const { data: existingInvite } = await supabase
      .from('trip_invites')
      .select('id')
      .eq('trip_id', id)
      .eq('invited_user_id', profile.id)
      .eq('status', 'pending')
      .single();

    if (existingInvite) {
      return res.status(409).json({ error: 'This user already has a pending invite to this trip' });
    }

    const { data: invite, error } = await supabase
      .from('trip_invites')
      .insert({
        trip_id: id,
        invited_email: normalizedEmail,
        invited_user_id: profile.id,
        role,
        invited_by: req.user.id,
      })
      .select('id, invited_email, role, created_at')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    const { data: trip } = await supabase.from('trips').select('name').eq('id', id).single();
    const inviterName = req.user.user_metadata?.name || req.user.email;

    const { ok, error: emailError } = await sendInviteEmail({
      to: normalizedEmail,
      tripName: trip?.name || 'a trip',
      inviterName,
      role,
    });

    if (!ok) console.warn(`[invite email] failed to send to ${normalizedEmail}: ${emailError}`);

    res.status(201).json({ invite: shapeInvite({ ...invite, inviter: null }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/trips/:id/collaborators/:memberId — admin-only, change a member's role
router.patch('/:id/collaborators/:memberId', requireMembership(['admin']), async (req, res) => {
  const { id, memberId } = req.params;
  const { role } = req.body;

  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: "role must be one of 'admin', 'editor', 'viewer'" });
  }

  try {
    const { data: target, error: targetError } = await supabase
      .from('trip_members')
      .select('id, role')
      .eq('id', memberId)
      .eq('trip_id', id)
      .single();

    if (targetError || !target) return res.status(404).json({ error: 'Collaborator not found' });

    if (target.role === 'admin' && role !== 'admin') {
      const { count } = await supabase
        .from('trip_members')
        .select('id', { count: 'exact', head: true })
        .eq('trip_id', id)
        .eq('role', 'admin');

      if (count <= 1) {
        return res.status(400).json({ error: 'Cannot change the role of the last remaining admin' });
      }
    }

    const { data: member, error } = await supabase
      .from('trip_members')
      .update({ role })
      .eq('id', memberId)
      .select('id, user_id, role, profiles!trip_members_user_id_profiles_fkey(name, email)')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json({ member: shapeMember(member) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trips/:id/collaborators/:memberId — admin-only, remove a collaborator
router.delete('/:id/collaborators/:memberId', requireMembership(['admin']), async (req, res) => {
  const { id, memberId } = req.params;

  try {
    const { data: target, error: targetError } = await supabase
      .from('trip_members')
      .select('id, user_id, role')
      .eq('id', memberId)
      .eq('trip_id', id)
      .single();

    if (targetError || !target) return res.status(404).json({ error: 'Collaborator not found' });

    const { data: trip } = await supabase.from('trips').select('created_by').eq('id', id).single();

    if (trip && trip.created_by === target.user_id) {
      return res.status(400).json({ error: 'Cannot remove the trip creator' });
    }

    if (target.role === 'admin') {
      const { count } = await supabase
        .from('trip_members')
        .select('id', { count: 'exact', head: true })
        .eq('trip_id', id)
        .eq('role', 'admin');

      if (count <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last remaining admin' });
      }
    }

    const { error } = await supabase.from('trip_members').delete().eq('id', memberId);

    if (error) return res.status(400).json({ error: error.message });

    res.status(200).json({ message: 'Collaborator removed', memberId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
