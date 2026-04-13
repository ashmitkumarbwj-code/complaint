const fs = require('fs');
const path = require('path');
const jsDir = 'public/js';
const files = ['principal.js', 'forgot-password.js', 'activate.js'];

files.forEach(file => {
    const filePath = path.join(jsDir, file);
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace alert('...') with showToast('...', 'error')
    content = content.replace(/alert\((['"`](.*?)['"`])\)/g, (match, p1, p2) => {
        if (p2.toLowerCase().includes('success') || p2.toLowerCase().includes('activated') || p2.toLowerCase().includes('reviewed')) {
             return `showToast(${p1}, 'success')`;
        }
        return `showToast(${p1}, 'error')`;
    });

    fs.writeFileSync(filePath, content);
});
console.log('Final UX Sweep Complete!');
