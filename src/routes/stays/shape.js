const { epochFromDate } = require('../../lib/dateUtils');
const { avatarPublicUrl } = require('../../lib/avatar');
const { EXPENSE_SELECT, shapeExpense } = require('../expenses/shape');

const STAY_SELECT = `
  id, trip_id, name, category, start_date, end_date, booking_url, location_name, location_url,
  expense_id, created_by, created_at, updated_at,
  creator:profiles(name, email, avatar_url),
  expense:expenses(${EXPENSE_SELECT})
`;

function shapeStay(row) {
  return {
    id: row.id,
    tripId: row.trip_id,
    name: row.name,
    category: row.category,
    startDate: epochFromDate(row.start_date),
    endDate: epochFromDate(row.end_date),
    bookingUrl: row.booking_url,
    locationName: row.location_name,
    locationUrl: row.location_url,
    createdBy: {
      id: row.created_by,
      name: row.creator?.name ?? null,
      email: row.creator?.email ?? null,
      avatarUrl: avatarPublicUrl(row.creator?.avatar_url),
    },
    expense: row.expense ? shapeExpense(row.expense) : null,
    createdAt: epochFromDate(row.created_at),
    updatedAt: epochFromDate(row.updated_at),
  };
}

module.exports = { STAY_SELECT, shapeStay };
