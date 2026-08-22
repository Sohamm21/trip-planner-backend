const express = require('express');
const router = express.Router();
const multer = require('multer');
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/authenticate');
const { dateStringFromEpoch, epochFromDate } = require('../lib/dateUtils');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const COVER_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour

router.use(authenticate);

// Converts a trip row's date/timestamp columns to epoch ms for API responses.
function formattedTripPayload(trip) {
  return {
    ...trip,
    start_date: epochFromDate(trip.start_date),
    end_date: epochFromDate(trip.end_date),
    created_at: epochFromDate(trip.created_at),
    updated_at: epochFromDate(trip.updated_at),
  };
}

// cover_image is stored as a private storage path — replace it with a short-lived signed URL.
async function withSignedCoverImage(trip) {
  if (!trip.cover_image) return trip;

  const { data, error } = await supabase.storage
    .from('trip-covers')
    .createSignedUrl(trip.cover_image, COVER_URL_EXPIRY_SECONDS);

  if (error) return { ...trip, cover_image: null };

  return { ...trip, cover_image: data.signedUrl };
}

// GET /api/trips — all trips where the logged-in user is a member
router.get('/getTrips', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('trip_members')
      .select(`
        role,
        trips (
          id, name, description, destination,
          start_date, end_date, cover_image, status,
          created_by, created_at
        )
      `)
      .eq('user_id', req.user.id);

    if (error) return res.status(400).json({ error: error.message });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const trips = await Promise.all(
      data.map(async (row) => {
        const start = new Date(row.trips.start_date);
        const end = new Date(row.trips.end_date);

        let tripStatus;
        if (end < today) tripStatus = 'COMPLETED';
        else if (start > today) tripStatus = 'UPCOMING';
        else tripStatus = 'ONGOING';

        const trip = await withSignedCoverImage(formattedTripPayload(row.trips));
        return { ...trip, my_role: row.role, tripStatus };
      })
    );

    const counts = trips.reduce(
      (acc, trip) => {
        acc[trip.tripStatus] = (acc[trip.tripStatus] || 0) + 1;
        return acc;
      },
      { UPCOMING: 0, ONGOING: 0, COMPLETED: 0 }
    );

    res.json({ trips, counts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trips/createTrip — create a new trip
router.post('/createTrip', async (req, res) => {
  const { name, start_date, end_date } = req.body;

  if (!name || !start_date || !end_date) {
    return res.status(400).json({ error: 'name, start_date and end_date are required' });
  }

  try {
    const { data: trip, error } = await supabase
      .from('trips')
      .insert({
        name,
        start_date: dateStringFromEpoch(start_date),
        end_date: dateStringFromEpoch(end_date),
        created_by: req.user.id,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    const { error: memberError } = await supabase
      .from('trip_members')
      .insert({ trip_id: trip.id, user_id: req.user.id, role: 'admin' });

    if (memberError) return res.status(400).json({ error: memberError.message });

    res.status(201).json({ trip: formattedTripPayload(trip) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trips/:id/details — single trip details
router.get('/:id/details', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: member, error: memberError } = await supabase
      .from('trip_members')
      .select('role')
      .eq('trip_id', id)
      .eq('user_id', req.user.id)
      .single();

    if (memberError || !member) {
      return res.status(403).json({ error: 'You do not have access to this trip' });
    }

    const { data: trip, error } = await supabase
      .from('trips')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);

    let tripStatus;
    if (end < today) tripStatus = 'COMPLETED';
    else if (start > today) tripStatus = 'UPCOMING';
    else tripStatus = 'ONGOING';

    const shaped = await withSignedCoverImage(formattedTripPayload(trip));

    res.json({ trip: { ...shaped, my_role: member.role, tripStatus } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/trips/:id/update — update name, dates, and/or cover image
router.patch('/:id/update', upload.single('image'), async (req, res) => {
  const { id } = req.params;

  try {
    const { data: member } = await supabase
      .from('trip_members')
      .select('role')
      .eq('trip_id', id)
      .eq('user_id', req.user.id)
      .single();

    if (!member || member.role !== 'admin') {
      return res.status(403).json({ error: 'Only trip admins can edit this trip' });
    }

    const updates = {};
    if (req.body.name) updates.name = req.body.name;
    if (req.body.start_date) updates.start_date = dateStringFromEpoch(req.body.start_date);
    if (req.body.end_date) updates.end_date = dateStringFromEpoch(req.body.end_date);

    if (req.file) {
      const filePath = `${id}/${Date.now()}.${req.file.mimetype.split('/')[1]}`;

      const { error: uploadError } = await supabase.storage
        .from('trip-covers')
        .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

      if (uploadError) return res.status(400).json({ error: uploadError.message });

      updates.cover_image = filePath;
    }

    const { data: trip, error } = await supabase
      .from('trips')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json({ trip: await withSignedCoverImage(formattedTripPayload(trip)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
