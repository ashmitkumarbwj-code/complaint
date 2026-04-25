const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const filePath = 'c:/xampp/htdocs/smart_complaint_&_resonse_system/backups/smart_campus_backup_20260409_2111.sql.gz';

const fileContents = fs.createReadStream(filePath);
const unzip = zlib.createGunzip();

let buffer = '';
unzip.on('data', (chunk) => {
    buffer += chunk.toString();
    if (buffer.length > 1000) {
        console.log(buffer.substring(0, 1000));
        process.exit(0);
    }
});

fileContents.pipe(unzip);
