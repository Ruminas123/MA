const express = require('express');
const cors = require('cors');
const compression = require('compression');
const timeoutMiddleware = require('./middlewares/timeout.middleware');
const authRoutes = require('./routes/auth.routes');
const ipRoutes = require('./routes/ip.routes');
const protocolRoutes = require('./routes/protocol.routes');
require('dotenv').config();

const app = express();
const port = 2000;

app.use(compression());
app.use(cors());
app.use(express.json());
app.use(timeoutMiddleware);

app.use('/api/auth', authRoutes);
app.use('/api/ip', ipRoutes);
app.use('/api/protocols', protocolRoutes);

app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

app.listen(port, () => console.log(`Server running on port ${port}`));
