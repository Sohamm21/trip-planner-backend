const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const authenticate = require('../middleware/authenticate');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'email, password and name are required' });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) return res.status(400).json({ error: error.message || error.toString() });

  res.status(201).json({ message: 'Account created successfully', user: data.user });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

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
