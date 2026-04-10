'use strict';

require('dotenv').config();
const app = require('../server.js');

// Export the raw Express app for Vercel's serverless handler
module.exports = app;
