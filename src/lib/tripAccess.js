const supabase = require('./supabase');

// Fetches the caller's membership row for a trip, or null if they're not a member.
async function getMembership(tripId, userId) {
  const { data } = await supabase
    .from('trip_members')
    .select('id, role, user_id, trip_id')
    .eq('trip_id', tripId)
    .eq('user_id', userId)
    .single();

  return data || null;
}

// Express middleware factory: 403s if the caller isn't a member of :id, or (when
// allowedRoles is given) isn't one of those roles. Attaches the membership row to req.membership.
function requireMembership(allowedRoles) {
  return async (req, res, next) => {
    const membership = await getMembership(req.params.id, req.user.id);

    if (!membership) {
      return res.status(403).json({ error: 'You do not have access to this trip' });
    }

    if (allowedRoles && !allowedRoles.includes(membership.role)) {
      return res.status(403).json({ error: `Requires one of the following roles: ${allowedRoles.join(', ')}` });
    }

    req.membership = membership;
    next();
  };
}

module.exports = { getMembership, requireMembership };
