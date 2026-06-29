require('dotenv').config()
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(morgan('dev'));
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', require('./routes/auth'));


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
});