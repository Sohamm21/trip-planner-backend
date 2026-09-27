const express = require('express');
const router = express.Router();

const { DESTINATION_IMAGES, PLACEHOLDER_IMAGE, RAW_DESTINATIONS } = require('../data/destinationsData');

function mapsUrl(name, state) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${state}`)}`;
}

const MONTHLY_DESTINATIONS = Object.fromEntries(
  Object.entries(RAW_DESTINATIONS).map(([month, destinations]) => [
    month,
    destinations.map((destination, index) => ({
      id: `${month}-${index}`,
      ...destination,
      image: DESTINATION_IMAGES[destination.name] || PLACEHOLDER_IMAGE,
      mapUrl: mapsUrl(destination.name, destination.state),
    })),
  ]),
);

// GET /api/destinations?month=1-12 — editorial "best places to visit" content
// for the trips dashboard's empty state. month defaults to the current month.
// Public/read-only content, no auth required.
router.get('/', (req, res) => {
  const requestedMonth = parseInt(req.query.month, 10);
  const month =
    requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : new Date().getMonth() + 1;

  res.json({ month, destinations: MONTHLY_DESTINATIONS[month] || [] });
});

module.exports = router;
