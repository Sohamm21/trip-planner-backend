const supabase = require('../../lib/supabase');

// Verifies every id in userIds is actually a member of tripId.
async function allAreMembers(tripId, userIds) {
  const unique = [...new Set(userIds)];
  const { data, error } = await supabase
    .from('trip_members')
    .select('user_id')
    .eq('trip_id', tripId)
    .in('user_id', unique);

  if (error) return false;
  return data.length === unique.length;
}

// Builds { userId, amountCents }[] for either split mode. Throws { status, message } on
// invalid input so route handlers can just try/catch and respond.
async function computeSplits(tripId, amountCents, body) {
  const { splitType } = body;

  if (splitType === 'equal') {
    const participantIds = [...new Set(body.participantIds || [])];

    if (participantIds.length === 0) {
      throw { status: 400, message: 'participantIds is required for an equal split' };
    }

    if (!(await allAreMembers(tripId, participantIds))) {
      throw { status: 400, message: 'One or more participants are not members of this trip' };
    }

    participantIds.sort(); // deterministic remainder distribution
    const n = participantIds.length;
    const base = Math.floor(amountCents / n);
    const remainder = amountCents - base * n;

    return participantIds.map((userId, i) => ({
      userId,
      amountCents: base + (i < remainder ? 1 : 0),
    }));
  }

  if (splitType === 'custom') {
    const splits = body.splits || [];

    if (splits.length === 0) {
      throw { status: 400, message: 'splits is required for a custom split' };
    }

    const userIds = splits.map((s) => s.userId);

    if (!(await allAreMembers(tripId, userIds))) {
      throw { status: 400, message: 'One or more participants are not members of this trip' };
    }

    const result = splits.map((s) => ({
      userId: s.userId,
      amountCents: Math.round(Number(s.amount) * 100),
    }));

    const sum = result.reduce((acc, s) => acc + s.amountCents, 0);

    if (sum !== amountCents) {
      throw { status: 400, message: 'Split amounts must add up to the total expense amount' };
    }

    return result;
  }

  throw { status: 400, message: "splitType must be 'equal' or 'custom'" };
}

module.exports = { allAreMembers, computeSplits };
