const express = require('express');
const router = express.Router();
const multer = require('multer');
const { compareAsc, compareDesc } = require('date-fns');
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/authenticate');
const { epochFromDate } = require('../lib/dateUtils');
const { ALLOWED_AVATAR_TYPES, avatarPublicUrl } = require('../lib/avatar');

const RECENT_TRIPS_LIMIT = 4;
const COVER_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour, matches trips.js

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_AVATAR_TYPES.includes(file.mimetype)) {
      return cb(new Error('avatar must be a jpg, jpeg, png, webp or gif image'));
    }
    cb(null, true);
  },
});

router.use(authenticate);

function tripStatusOf(trip) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(trip.start_date);
  const end = new Date(trip.end_date);

  if (end < today) return 'COMPLETED';
  if (start > today) return 'UPCOMING';
  return 'ONGOING';
}

// cover_image is stored as a private storage path — replace it with a short-lived signed URL.
// The default cover (no upload at creation) is a plain external URL, not a storage path — pass it through as-is.
async function withSignedCoverImage(trip) {
  if (!trip.cover_image) return trip;
  if (/^https?:\/\//i.test(trip.cover_image)) return trip;

  const { data, error } = await supabase.storage
    .from('trip-covers')
    .createSignedUrl(trip.cover_image, COVER_URL_EXPIRY_SECONDS);

  if (error) return { ...trip, cover_image: null };

  return { ...trip, cover_image: data.signedUrl };
}

// GET /api/profile — profile summary: avatar, stats, and the 4 most recent trips.
router.get('/', async (req, res) => {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('name, email, avatar_url')
      .eq('id', req.user.id)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const { data: memberRows, error: memberError } = await supabase
      .from('trip_members')
      .select('trips (id, name, destination, cover_image, start_date, end_date)')
      .eq('user_id', req.user.id);

    if (memberError) return res.status(400).json({ error: memberError.message });

    const trips = memberRows.map((row) => ({ ...row.trips, tripStatus: tripStatusOf(row.trips) }));

    trips.sort((a, b) => {
      if (a.tripStatus !== b.tripStatus) return 0;
      if (a.tripStatus === 'COMPLETED') return compareDesc(new Date(a.end_date), new Date(b.end_date));
      return compareAsc(new Date(a.start_date), new Date(b.start_date));
    });

    const tripsPlanned = trips.length;
    const placesExplored = new Set(trips.map((t) => t.destination).filter(Boolean)).size;

    const tripIds = trips.map((t) => t.id);
    let travelBuddies = 0;

    if (tripIds.length > 0) {
      const { data: collaboratorRows, error: collaboratorError } = await supabase
        .from('trip_members')
        .select('user_id')
        .in('trip_id', tripIds)
        .neq('user_id', req.user.id);

      if (collaboratorError) return res.status(400).json({ error: collaboratorError.message });

      travelBuddies = new Set(collaboratorRows.map((r) => r.user_id)).size;
    }

    const recentTrips = trips.slice(0, RECENT_TRIPS_LIMIT);
    const recentTripIds = recentTrips.map((t) => t.id);

    let membersByTripId = {};
    if (recentTripIds.length > 0) {
      const { data: memberDetailRows, error: memberDetailError } = await supabase
        .from('trip_members')
        .select('trip_id, user_id, profiles (name, avatar_url)')
        .in('trip_id', recentTripIds);

      if (memberDetailError) return res.status(400).json({ error: memberDetailError.message });

      membersByTripId = memberDetailRows.reduce((acc, row) => {
        acc[row.trip_id] = acc[row.trip_id] || [];
        acc[row.trip_id].push({
          id: row.user_id,
          name: row.profiles?.name ?? null,
          avatarUrl: avatarPublicUrl(row.profiles?.avatar_url),
        });
        return acc;
      }, {});
    }

    const shapedRecentTrips = await Promise.all(
      recentTrips.map(async (trip) => {
        const { tripStatus, ...rest } = trip;
        return {
          ...rest,
          start_date: epochFromDate(trip.start_date),
          end_date: epochFromDate(trip.end_date),
          cover_image: (await withSignedCoverImage(trip)).cover_image,
          tripStatus,
          members: membersByTripId[trip.id] || [],
        };
      })
    );

    res.json({
      user: {
        name: profile.name,
        email: profile.email,
        avatarUrl: avatarPublicUrl(profile.avatar_url),
      },
      stats: { tripsPlanned, placesExplored, travelBuddies },
      recentTrips: shapedRecentTrips,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/profile/update — update name and/or avatar photo.
router.patch('/update', (req, res, next) => {
  upload.single('avatar')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const { name } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 3 || name.trim().length > 100) {
    return res.status(400).json({ error: 'name is required and must be 3-100 characters' });
  }

  try {
    const updates = { name: name.trim() };

    if (req.file) {
      const ext = req.file.mimetype.split('/')[1];
      const filePath = `${req.user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: true });

      if (uploadError) return res.status(400).json({ error: uploadError.message });

      updates.avatar_url = filePath;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select('name, email, avatar_url')
      .single();

    if (error) return res.status(400).json({ error: error.message });

    res.json({ user: { name: profile.name, avatarUrl: avatarPublicUrl(profile.avatar_url) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
