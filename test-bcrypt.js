const bcrypt = require('bcryptjs'); 
bcrypt.compare('admin123', '$2a$10$XmS5L/n5cI6tS.8yv.A7uejX0.9v0q3W5O.qfR/e.J8fR8Z2YfVmW').then(console.log);
