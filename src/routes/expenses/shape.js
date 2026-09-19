const { epochFromDate } = require('../../lib/dateUtils');

const CATEGORIES = ['food', 'transport', 'accommodation', 'activity', 'shopping', 'other'];

const EXPENSE_SELECT = `
  id, name, amount, category, expense_date, created_at, updated_at, paid_by,
  payer:profiles!expenses_paid_by_fkey(name, email),
  expense_splits!expense_splits_expense_id_fkey(id, user_id, share_amount,
    participant:profiles!expense_splits_user_id_fkey(name, email))
`;

const SETTLEMENT_SELECT = `
  id, amount, note, created_at, paid_by, paid_to,
  payer:profiles!settlements_paid_by_fkey(name, email),
  payee:profiles!settlements_paid_to_fkey(name, email)
`;

function shapeExpense(row) {
  return {
    id: row.id,
    name: row.name,
    amount: Number(row.amount),
    category: row.category,
    date: epochFromDate(row.expense_date),
    createdAt: epochFromDate(row.created_at),
    updatedAt: epochFromDate(row.updated_at),
    paidBy: { id: row.paid_by, name: row.payer?.name ?? null, email: row.payer?.email ?? null },
    splits: (row.expense_splits || []).map((s) => ({
      id: s.id,
      userId: s.user_id,
      amount: Number(s.share_amount),
      name: s.participant?.name ?? null,
      email: s.participant?.email ?? null,
    })),
  };
}

function shapeSettlement(row) {
  return {
    id: row.id,
    amount: Number(row.amount),
    note: row.note,
    createdAt: epochFromDate(row.created_at),
    paidBy: { id: row.paid_by, name: row.payer?.name ?? null, email: row.payer?.email ?? null },
    paidTo: { id: row.paid_to, name: row.payee?.name ?? null, email: row.payee?.email ?? null },
  };
}

module.exports = { CATEGORIES, EXPENSE_SELECT, SETTLEMENT_SELECT, shapeExpense, shapeSettlement };
