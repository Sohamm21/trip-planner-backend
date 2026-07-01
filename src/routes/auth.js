const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/authenticate');

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

    res.cookie('access_token', data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000,
    });

    res.status(201).json({ user: { name, email } });
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) return res.status(401).json({ error: error.message });

    res.cookie('access_token', data.session.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000,
    });

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

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  const token = req.cookies.access_token;

  const { error } = await supabase.auth.admin.signOut(token);

  if (error) return res.status(400).json({ error: error.message });

  res.clearCookie('access_token');
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
