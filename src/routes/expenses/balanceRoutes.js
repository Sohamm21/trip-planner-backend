const express = require('express');
const router = express.Router();
const supabase = require('../../lib/supabase');
const { requireMembership } = require('../../lib/tripAccess');

// GET /api/trips/:id/expenses/balances — declared before expenseRoutes' /:expenseId
// routes (see index.js mount order) so it can never be shadowed by a future
// GET /:id/expenses/:expenseId.
router.get('/:id/expenses/balances', requireMembership(), async (req, res) => {
  const { id } = req.params;

  try {
    const { data: trip } = await supabase.from('trips').select('currency').eq('id', id).single();

    const { data: members, error: membersError } = await supabase
      .from('trip_members')
      .select('user_id, profiles!trip_members_user_id_profiles_fkey(name, email)')
      .eq('trip_id', id);

    if (membersError) return res.status(400).json({ error: membersError.message });

    const { data: expenses, error: expensesError } = await supabase
      .from('expenses')
      .select('paid_by, expense_splits!expense_splits_expense_id_fkey(user_id, share_amount)')
      .eq('trip_id', id);

    if (expensesError) return res.status(400).json({ error: expensesError.message });

    const { data: settlements, error: settlementsError } = await supabase
      .from('settlements')
      .select('paid_by, paid_to, amount')
      .eq('trip_id', id);

    if (settlementsError) return res.status(400).json({ error: settlementsError.message });

    // Pass 1: net balance per member, worked in integer cents to avoid float drift.
    const balanceCents = {};
    members.forEach((m) => { balanceCents[m.user_id] = 0; });

    expenses.forEach((expense) => {
      (expense.expense_splits || []).forEach((split) => {
        if (split.user_id === expense.paid_by) return; // payer's own share is a no-op
        const shareCents = Math.round(Number(split.share_amount) * 100);
        balanceCents[split.user_id] = (balanceCents[split.user_id] || 0) - shareCents;
        balanceCents[expense.paid_by] = (balanceCents[expense.paid_by] || 0) + shareCents;
      });
    });

    settlements.forEach((s) => {
      const cents = Math.round(Number(s.amount) * 100);
      balanceCents[s.paid_by] = (balanceCents[s.paid_by] || 0) + cents;
      balanceCents[s.paid_to] = (balanceCents[s.paid_to] || 0) - cents;
    });

    const profileById = {};
    members.forEach((m) => { profileById[m.user_id] = m.profiles; });

    const balances = Object.entries(balanceCents).map(([userId, cents]) => ({
      userId,
      name: profileById[userId]?.name ?? null,
      email: profileById[userId]?.email ?? null,
      balance: Math.round(cents) / 100,
    }));

    // Pass 2: greedy "suggested settlements" — matches the biggest debtor to the biggest
    // creditor repeatedly. This is a minimum-transaction HEURISTIC, not a proven-optimal
    // solver — it always zeroes every balance in at most n-1 transactions, but there can
    // exist topologies where a smarter pairing uses fewer transactions than this greedy pass.
    const creditors = balances.filter((b) => b.balance > 0).map((b) => ({ ...b })).sort((a, b) => b.balance - a.balance);
    const debtors = balances.filter((b) => b.balance < 0).map((b) => ({ ...b })).sort((a, b) => a.balance - b.balance);

    const suggestedSettlements = [];
    let i = 0;
    let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amount = Math.round(Math.min(-debtor.balance, creditor.balance) * 100) / 100;

      if (amount > 0) {
        suggestedSettlements.push({
          fromUserId: debtor.userId,
          fromName: debtor.name,
          toUserId: creditor.userId,
          toName: creditor.name,
          amount,
        });
      }

      debtor.balance += amount;
      creditor.balance -= amount;
      if (Math.abs(debtor.balance) < 0.005) i += 1;
      if (Math.abs(creditor.balance) < 0.005) j += 1;
    }

    res.json({ currency: trip?.currency ?? 'USD', balances, suggestedSettlements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
