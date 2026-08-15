const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/authenticate');

router.use(authenticate);

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

    const trips = data.map((row) => {
      const start = new Date(row.trips.start_date);
      const end = new Date(row.trips.end_date);

      let tripStatus;
      if (end < today) tripStatus = 'COMPLETED';
      else if (start > today) tripStatus = 'UPCOMING';
      else tripStatus = 'ONGOING';

      return { ...row.trips, my_role: row.role, tripStatus };
    });

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
        start_date,
        end_date,
        created_by: req.user.id,
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });

    const { error: memberError } = await supabase
      .from('trip_members')
      .insert({ trip_id: trip.id, user_id: req.user.id, role: 'admin' });

    if (memberError) return res.status(400).json({ error: memberError.message });

    res.status(201).json({ trip });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
