const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
dotenv.config();

const authRoutes = require('./routes/auth');
const lotsRoutes = require('./routes/lots');
const bookingsRoutes = require('./routes/bookings');

const app = express();
app.use(bodyParser.json());

app.use('/api/auth', authRoutes);
app.use('/api/lots', lotsRoutes);
app.use('/api/bookings', bookingsRoutes);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on ${port}`));
