const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/authenticate');
const { parseJsonQuery, applyFilters } = require('../lib/queryFilters');
const { shapeNotification } = require('../lib/notifications');

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const NOTIFICATION_FILTER_FIELDS = { type: 'type', isRead: 'is_read' };

router.use(authenticate);

// GET /api/notifications — every notification addressed to the logged-in user,
// any type (trip_invite, expense_tagged, ...). Paginated + filterable via
// ?jsonQuery={"page":1,"limit":20,"filters":[{"key":"isRead","operator":"eq","value":false}]}.
// Type-specific *actions* (e.g. accepting a trip invite) stay on their own routes —
// this is a read/inbox surface, not where business logic like "create a trip_members
// row" belongs. The frontend reads `data.inviteId` etc. and calls those routes directly.
router.get('/', async (req, res) => {
  const { jsonQuery, error: queryError } = parseJsonQuery(req);
  if (queryError) return res.status(400).json({ error: queryError });

  const page = Math.max(parseInt(jsonQuery.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(jsonQuery.limit, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

  try {
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id);

    try {
      query = applyFilters(query, jsonQuery.filters, NOTIFICATION_FILTER_FIELDS);
    } catch (err) {
      return res.status(err.status || 400).json({ error: err.message });
    }

    const from = (page - 1) * limit;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (error) return res.status(400).json({ error: error.message });

    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .eq('is_read', false);

    const total = count ?? 0;
    res.json({
      notifications: data.map(shapeNotification),
      unreadCount: unreadCount ?? 0,
      page,
      limit,
      total,
      totalPages: Math.max(Math.ceil(total / limit), 1),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error || !data) return res.status(404).json({ error: 'Notification not found' });

    res.json({ notification: shapeNotification(data) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', req.user.id)
      .eq('is_read', false);

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
