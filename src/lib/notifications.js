const { epochFromDate } = require('./dateUtils');

function shapeNotification(row) {
  return {
    id: row.id,
    type: row.type,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    data: row.data,
    isRead: row.is_read,
    createdAt: epochFromDate(row.created_at),
  };
}

module.exports = { shapeNotification };
