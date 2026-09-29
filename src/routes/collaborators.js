const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/authenticate');
const { requireMembership } = require('../lib/tripAccess');
const { epochFromDate } = require('../lib/dateUtils');
const { sendInviteEmail } = require('../lib/email');
const { parseJsonQuery, applyFilters } = require('../lib/queryFilters');
const { avatarPublicUrl } = require('../lib/avatar');

// Both members and pendingInvites are filterable by role; no pagination here since this
// endpoint returns two lists in one response rather than a single paginated collection —
// collaborator counts are small enough that pagination wouldn't add real value.
const MEMBER_FILTER_FIELDS = { role: 'role' };
const INVITE_FILTER_FIELDS = { role: 'role' };

router.use(authenticate);

function shapeMember(member) {
  return {
    id: member.id,
    userId: member.user_id,
    role: member.role,
    name: member.profiles?.name ?? null,
    email: member.profiles?.email ?? null,
    avatarUrl: avatarPublicUrl(member.profiles?.avatar_url),
  };
}

function shapeInvite(invite) {
  return {
    id: invite.id,
    email: invite.invited_email,
    role: invite.role,
    createdAt: epochFromDate(invite.created_at),
    expiresAt: epochFromDate(invite.expires_at),
    invitedBy: invite.inviter
      ? {
          name: invite.inviter.name,
          email: invite.inviter.email,
          avatarUrl: avatarPublicUrl(invite.inviter.avatar_url),
        }
      : null,
  };
}

// GET /api/trips/:id/collaborators — current members + pending invites. Filterable via
// ?jsonQuery={"filters":[{"key":"role","operator":"eq","value":"admin"}]} (applies to both lists).
router.get('/:id/collaborators', requireMembership(), async (req, res) => {
  const { id } = req.params;

  const { jsonQuery, error: queryError } = parseJsonQuery(req);
  if (queryError) return res.status(400).json({ error: queryError });

  try {
    let membersQuery = supabase
      .from('trip_members')
      .select('id, user_id, role, profiles!trip_members_user_id_profiles_fkey(name, email, avatar_url)')
      .eq('trip_id', id);

    let invitesQuery = supabase
      .from('trip_invites')
      .select('id, invited_email, role, created_at, expires_at, inviter:profiles!trip_invites_invited_by_fkey(name, email, avatar_url)')
      .eq('trip_id', id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString());

    try {
      membersQuery = applyFilters(membersQuery, jsonQuery.filters, MEMBER_FILTER_FIELDS);
      invitesQuery = applyFilters(invitesQuery, jsonQuery.filters, INVITE_FILTER_FIELDS);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    const { data: members, error: membersError } = await membersQuery;
    if (membersError) return res.status(400).json({ error: membersError.message });

    const { data: invites, error: invitesError } = await invitesQuery;
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
    // profile may not exist yet — inviting someone with no account is allowed.
    // handle_new_user() links invited_user_id automatically once they sign up.
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, name')
      .eq('email', normalizedEmail)
      .single();

    if (profile) {
      const { data: existingMember } = await supabase
        .from('trip_members')
        .select('id')
        .eq('trip_id', id)
        .eq('user_id', profile.id)
        .single();

      if (existingMember) {
        return res.status(409).json({ error: 'This user is already a collaborator on this trip' });
      }
    }

    const { data: existingInvite } = await supabase
      .from('trip_invites')
      .select('id')
      .eq('trip_id', id)
      .eq('invited_email', normalizedEmail)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .single();

    if (existingInvite) {
      return res.status(409).json({ error: 'This email already has a pending invite to this trip' });
    }

    const { data: invite, error } = await supabase
      .from('trip_invites')
      .insert({
        trip_id: id,
        invited_email: normalizedEmail,
        invited_user_id: profile?.id ?? null,
        role,
        invited_by: req.user.id,
      })
      .select('id, invited_email, role, created_at')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    const { data: trip } = await supabase.from('trips').select('name').eq('id', id).single();
    const inviterName = req.user.user_metadata?.name || req.user.email;

    // Only create the notification if they already have an account — otherwise
    // there's no user_id to attach it to yet; handle_new_user() creates it for
    // them once they sign up (see the trigger for the equivalent insert).
    if (profile) {
      const { error: notifyError } = await supabase.from('notifications').insert({
        user_id: profile.id,
        type: 'trip_invite',
        reference_type: 'trip_invite',
        reference_id: invite.id,
        data: {
          inviteId: invite.id,
          tripId: id,
          tripName: trip?.name || 'a trip',
          role,
          inviterId: req.user.id,
          inviterName,
        },
      });

      if (notifyError) console.warn(`[notifications] failed to create trip_invite notification: ${notifyError.message}`);
    }

    const { ok, error: emailError } = await sendInviteEmail({
      to: normalizedEmail,
      tripName: trip?.name || 'a trip',
      inviterName,
      role,
      hasAccount: Boolean(profile),
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
      .select('id, user_id, role, profiles!trip_members_user_id_profiles_fkey(name, email, avatar_url)')
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
