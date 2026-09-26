const { epochFromDate } = require('../../lib/dateUtils');

const NOTE_SELECT = `
  id, trip_id, content, is_pinned, created_by, created_at, updated_at,
  creator:profiles(name)
`;

function shapeNote(row) {
  return {
    id: row.id,
    tripId: row.trip_id,
    content: row.content,
    isPinned: row.is_pinned,
    createdBy: { id: row.created_by, name: row.creator?.name ?? null },
    createdAt: epochFromDate(row.created_at),
    updatedAt: epochFromDate(row.updated_at),
  };
}

module.exports = { NOTE_SELECT, shapeNote };
