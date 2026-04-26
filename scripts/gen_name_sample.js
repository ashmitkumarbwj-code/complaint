const fs = require('fs');
try {
    // Read the TSV file. It might be UTF-16LE or UTF-8.
    const content = fs.readFileSync('verified_students_export.tsv', 'utf16le');
    const lines = content.split('\n').slice(0, 100);
    const sqlUpdates = [];

    for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length >= 4) {
            const roll = parts[2]?.trim();
            const name = parts[3]?.trim();
            if (roll && name && name !== 'NULL') {
                sqlUpdates.push(`UPDATE verified_students SET name = '${name.replace(/'/g, "''")}' WHERE roll_number = '${roll}' AND name IS NULL;`);
            }
        }
    }
    console.log(sqlUpdates.join('\n'));
} catch (err) {
    console.error('Error generating sample SQL:', err.message);
}
