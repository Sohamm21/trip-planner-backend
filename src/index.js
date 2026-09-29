require('dotenv').config()
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 4000;

// FRONTEND_URL is a comma-separated list so local dev (localhost:3000) and
// production (www.bhatakgo.com) can both be allowed without code changes.
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim());

app.use(morgan('dev'));
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/trips', require('./routes/trips'));
app.use('/api/trips', require('./routes/itinerary'));
app.use('/api/trips', require('./routes/collaborators'));
app.use('/api/trips', require('./routes/expenses'));
app.use('/api/trips', require('./routes/media'));
app.use('/api/trips', require('./routes/stays'));
app.use('/api/trips', require('./routes/places'));
app.use('/api/trips', require('./routes/notes'));
app.use('/api/invites', require('./routes/invites'));
app.use('/api/destinations', require('./routes/destinations'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/notifications', require('./routes/notifications'));


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
});