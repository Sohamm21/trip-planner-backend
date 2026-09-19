const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/authenticate');

const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;

function setAuthCookie(res, token) {
  res.cookie('access_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TWO_DAYS,
  });
}

// POST /api/auth/register — step 1: sends OTP to email
router.post('/register', async (req, res) => {
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
router.post('/verify-registration', async (req, res) => {
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
router.post('/forgot-password', async (req, res) => {
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
router.post('/reset-password', async (req, res) => {
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
router.post('/login', async (req, res) => {
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
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
