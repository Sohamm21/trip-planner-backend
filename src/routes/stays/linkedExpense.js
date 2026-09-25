const supabase = require('../../lib/supabase');
const { dateStringFromEpoch } = require('../../lib/dateUtils');
const { computeSplits } = require('../expenses/splitLogic');

// A booking's own category (hotel/flight/...) is a different enum than expenses.category
// (food/transport/...) — this maps one onto the other for its linked expense.
const EXPENSE_CATEGORY_BY_STAY_CATEGORY = {
  hotel: 'accommodation',
  flight: 'transport',
  cab: 'transport',
  train: 'transport',
  bus: 'transport',
  other: 'other',
};

// Creates the expenses + expense_splits rows for a stay's attached expense (equal split
// only, per the UI). Returns the new expense id, or throws { status, message }.
async function createLinkedExpense(tripId, stayName, stayCategory, startDate, expenseInput, userId) {
  const { amount, participantIds } = expenseInput || {};

  if (!amount || Number(amount) <= 0) {
    throw { status: 400, message: 'expense.amount must be a positive number' };
  }

  const amountCents = Math.round(Number(amount) * 100);
  const splits = await computeSplits(tripId, amountCents, { splitType: 'equal', participantIds });

  const { data: expense, error } = await supabase
    .from('expenses')
    .insert({
      trip_id: tripId,
      name: stayName,
      amount: Number(amount),
      category: EXPENSE_CATEGORY_BY_STAY_CATEGORY[stayCategory],
      paid_by: userId,
      expense_date: dateStringFromEpoch(startDate),
    })
    .select('id')
    .single();

  if (error) throw { status: 400, message: error.message };

  const { error: splitsError } = await supabase
    .from('expense_splits')
    .insert(splits.map((s) => ({ expense_id: expense.id, user_id: s.userId, share_amount: s.amountCents / 100 })));

  if (splitsError) {
    await supabase.from('expenses').delete().eq('id', expense.id);
    throw { status: 400, message: splitsError.message };
  }

  return expense.id;
}

module.exports = { EXPENSE_CATEGORY_BY_STAY_CATEGORY, createLinkedExpense };
