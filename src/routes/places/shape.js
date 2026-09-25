const { epochFromDate } = require('../../lib/dateUtils');

const PLACE_SELECT = `
  id, trip_id, name, category, location_url, lat, lng, photo_url, photo_attribution, notes,
  created_by, created_at, updated_at,
  creator:profiles(name)
`;

function shapePlace(row) {
  return {
    id: row.id,
    tripId: row.trip_id,
    name: row.name,
    category: row.category,
    notes: row.notes,
    locationDetails: {
      locationUrl: row.location_url,
      lat: Number(row.lat),
      lng: Number(row.lng),
      photoUrl: row.photo_url,
      photoAttribution: row.photo_attribution,
    },
    createdBy: { id: row.created_by, name: row.creator?.name ?? null },
    createdAt: epochFromDate(row.created_at),
    updatedAt: epochFromDate(row.updated_at),
  };
}

module.exports = { PLACE_SELECT, shapePlace };
