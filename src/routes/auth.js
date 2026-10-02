const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/authenticate');
const { createAuthRateLimiter } = require('../middleware/rateLimiter');
const { avatarPublicUrl } = require('../lib/avatar');

const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
const OAUTH_PROVIDERS = ['google'];

function setAuthCookie(res, token) {
  res.cookie('access_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TWO_DAYS,
  });
}

// POST /api/auth/register — step 1: sends OTP to email
router.post('/register', createAuthRateLimiter(), async (req, res) => {
  const { email, name, password } = req.body;

  if (!email || !name || !password) {
    return res.status(400).json({ error: 'email, name and password are required' });
  }

  try {
    const { error } = await supabase.auth.signInWithOtp({ email });

    if (error) return res.status(400).json({ error: error.message || error.toString() });

    res.json({ message: 'OTP sent to your email. Please check your inbox.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/verify-registration — step 2: verifies OTP and creates account
router.post('/verify-registration', createAuthRateLimiter(), async (req, res) => {
  const { email, otp, password, name } = req.body;

  if (!email || !otp || !password || !name) {
    return res.status(400).json({ error: 'email, otp, password and name are required' });
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });

    if (error) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const { error: updateError } = await supabase.auth.admin.updateUserById(data.user.id, {
      password,
      user_metadata: { name },
    });

    if (updateError) return res.status(400).json({ error: updateError.message });

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) return res.status(400).json({ error: signInError.message });

    setAuthCookie(res, signInData.session.access_token);
    res.status(201).json({ user: { name, email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/forgot-password — sends an OTP to the account's email so it
// can be used (via /reset-password) to set a new password.
router.post('/forgot-password', createAuthRateLimiter(), async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', String(email).trim().toLowerCase())
      .single();

    if (!profile) {
      return res.status(404).json({ error: 'No account found with this email', code: 'USER_NOT_FOUND' });
    }

    const { error } = await supabase.auth.signInWithOtp({ email });

    if (error) return res.status(400).json({ error: error.message || error.toString() });

    res.json({ message: 'OTP sent to your email. Please check your inbox.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/reset-password — verifies the OTP from /forgot-password and
// sets a new password, then signs the user in.
router.post('/reset-password', createAuthRateLimiter(), async (req, res) => {
  const { email, otp, password } = req.body;

  if (!email || !otp || !password) {
    return res.status(400).json({ error: 'email, otp and password are required' });
  }

  try {
    const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });

    if (error) return res.status(400).json({ error: 'Invalid or expired OTP' });

    const { error: updateError } = await supabase.auth.admin.updateUserById(data.user.id, {
      password,
    });

    if (updateError) return res.status(400).json({ error: updateError.message });

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) return res.status(400).json({ error: signInError.message });

    setAuthCookie(res, signInData.session.access_token);
    res.json({
      user: {
        name: signInData.user.user_metadata?.name,
        email: signInData.user.email,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', createAuthRateLimiter(), async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', String(email).trim().toLowerCase())
      .single();

    if (!profile) {
      return res.status(404).json({ error: 'No account found with this email', code: 'USER_NOT_FOUND' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });

    setAuthCookie(res, data.session.access_token);
    res.json({
      user: {
        name: data.user.user_metadata.name,
        email: data.user.email,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/oauth/:provider — returns the provider's OAuth URL for the frontend
// to redirect the browser to. Doesn't redirect itself: the frontend calls this via
// fetch (it needs the JSON url), then does `window.location.href = url` itself.
router.get('/oauth/:provider', async (req, res) => {
  const { provider } = req.params;

  if (!OAUTH_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: `Unsupported provider: ${provider}` });
  }

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: process.env.OAUTH_REDIRECT_URL,
        skipBrowserRedirect: true, // we just want the URL back as JSON, not a 302
      },
    });

    if (error) return res.status(400).json({ error: error.message });

    res.json({ url: data.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/oauth/session — after the OAuth redirect lands back on the frontend
// with #access_token=... in the URL fragment, the frontend reads that fragment
// (server never sees it) and posts the token here. We verify it ourselves via
// getUser rather than trusting it, then set the same cookie /login sets. The
// public.profiles row for a first-time Google user is created automatically by
// the on_auth_user_created DB trigger — nothing to do for that here.
router.post('/oauth/session', async (req, res) => {
  const { access_token } = req.body;

  if (!access_token) {
    return res.status(400).json({ error: 'access_token is required' });
  }

  try {
    const { data, error } = await supabase.auth.getUser(access_token);

    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' });
    }

    setAuthCookie(res, access_token);
    res.json({
      user: {
        name: data.user.user_metadata?.name,
        email: data.user.email,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/logout — always clears the cookie, even if the session is already
// invalid/expired server-side (that's not a reason to fail a logout request).
router.post('/logout', async (req, res) => {
  const token = req.cookies.access_token;

  if (token) {
    // Best-effort server-side revoke; if it's already gone/invalid, that's fine —
    // the outcome we want (no valid session) is already true.
    await supabase.auth.admin.signOut(token).catch(() => {});
  }

  res.clearCookie('access_token');
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', req.user.id)
    .single();

  res.json({
    user: { ...req.user, avatar_url: avatarPublicUrl(profile?.avatar_url) },
  });
});

module.exports = router;
