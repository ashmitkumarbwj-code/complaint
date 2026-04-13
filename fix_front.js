const fs = require('fs');
const path = require('path');

const jsDir = 'public/js';
const htmlDir = 'public';

// 1. Process JS Files
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js') && f !== 'uiUtils.js');
let stats = { alerts: 0, credentials: 0, duplicateToastsRemoved: 0 };

jsFiles.forEach(file => {
    let content = fs.readFileSync(path.join(jsDir, file), 'utf8');
    let original = content;

    // Replace alert('...') with showToast('...', 'error')
    content = content.replace(/alert\((['"`](.*?)['"`])\)/g, (match, p1, p2) => {
        stats.alerts++;
        if (p2.toLowerCase().includes('success') || p2.toLowerCase().includes('reviewed!') || p2.toLowerCase().includes('activated')) {
            return `showToast(${p1}, 'success')`;
        }
        return `showToast(${p1}, 'error')`;
    });

    // Replace fetch() without credentials using object blocks
    // Safe replace specifically for {}, missing credentials
    const objectRegex = /(fetch\([^,]+,\s*\{)([^}]+)(\})/g;
    content = content.replace(objectRegex, (match, start, body, end) => {
        if (!body.includes('credentials')) {
            stats.credentials++;
            return `${start}${body}, credentials: 'include' ${end}`;
        }
        return match;
    });

    // Also inject credentials in fetch that have NO init object
    const nakedFetchRegex = /fetch\(([`'"][^,]+[`'"])\)/g;
    content = content.replace(nakedFetchRegex, (match, url) => {
         stats.credentials++;
         return `fetch(${url}, { credentials: 'include' })`;
    });

    if (file === 'admin.js') {
        // Remove old showToast
        content = content.replace(/window\.showToast\s*=\s*\([^)]*\)\s*=>\s*\{[\s\S]*?setTimeout\(\(\)\s*=>\s*toast\.remove\(\),\s*\d+\);\s*\};/m, '// Removed embedded showToast');
        stats.duplicateToastsRemoved++;
    }

    if (content !== original) {
        fs.writeFileSync(path.join(jsDir, file), content);
    }
});

// 2. Process HTML files to inject script tag
const htmlFiles = fs.readdirSync(htmlDir).filter(f => f.endsWith('.html'));
htmlFiles.forEach(file => {
    let content = fs.readFileSync(path.join(htmlDir, file), 'utf8');
    if (!content.includes('js/uiUtils.js')) {
        content = content.replace('</body>', '    <script src="js/uiUtils.js"></script>\n</body>');
        fs.writeFileSync(path.join(htmlDir, file), content);
    }
});

console.log('Automated Audit Complete!', stats);
