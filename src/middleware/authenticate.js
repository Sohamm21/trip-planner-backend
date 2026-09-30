const supabase = require('../lib/supabase');

async function authenticate(req, res, next) {
  const token = req.cookies.access_token;

  if (!token) {
    return res.status(401).json({ error: 'Not logged in', code: 'UNAUTHORIZED' });
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    // The cookie's own maxAge outlives Supabase's token expiry, so without this the
    // browser keeps resending a dead cookie on every request until maxAge runs out.
    res.clearCookie('access_token');
    return res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' });
  }

  req.user = user;
  next();
}

module.exports = authenticate;
