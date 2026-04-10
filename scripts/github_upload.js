/**
 * GitHub Upload Script (No Git Required)
 * Uses GitHub REST API to create a private repo and push all project files.
 * 
 * Usage:
 *   node scripts/github_upload.js <GITHUB_PERSONAL_ACCESS_TOKEN> [repo-name]
 * 
 * Steps to get a Personal Access Token:
 *   1. Go to https://github.com/settings/tokens
 *   2. Click "Generate new token (classic)"
 *   3. Select scopes: "repo" (full control of private repositories)
 *   4. Copy the token and paste it as the first argument
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.argv[2];
const REPO_NAME = process.argv[3] || 'Smart-complaint-and-response-system';
const GITHUB_USERNAME = 'ashmitkumarbwj-code';

if (!GITHUB_TOKEN) {
    console.error('\n❌  Error: GitHub Personal Access Token is required.\n');
    console.error('   Usage: node scripts/github_upload.js <YOUR_TOKEN>\n');
    console.error('   Get your token at: https://github.com/settings/tokens\n');
    process.exit(1);
}

// Files/dirs to skip (respects .gitignore patterns)
const SKIP_PATTERNS = [
    'node_modules', 'vendor', '.git', 'logs', '.env', '.env.local',
    'tmp_sync_gallery.js', 'uploads', 'backups', 'package-lock.json',
    'scripts/github_upload.js' // don't upload this script itself
];

function shouldSkip(filePath) {
    const normalised = filePath.replace(/\\/g, '/');
    return SKIP_PATTERNS.some(p => normalised.includes(p));
}

function apiRequest(method, endpoint, data, token) {
    return new Promise((resolve, reject) => {
        const body = data ? JSON.stringify(data) : null;
        const options = {
            hostname: 'api.github.com',
            path: endpoint,
            method,
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'SmartCampusUploader/1.0',
                'Content-Type': 'application/json',
                ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
            }
        };

        const req = https.request(options, res => {
            let responseData = '';
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(responseData) });
                } catch (e) {
                    resolve({ status: res.statusCode, body: responseData });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

function collectFiles(dir, baseDir = dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        if (shouldSkip(relPath) || shouldSkip(entry.name)) continue;
        if (entry.isDirectory()) {
            results.push(...collectFiles(fullPath, baseDir));
        } else {
            results.push({ fullPath, relPath });
        }
    }
    return results;
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log(`\n🚀 Smart Campus SCRS — GitHub Upload`);
    console.log(`   Repo    : ${GITHUB_USERNAME}/${REPO_NAME} (private)`);
    console.log(`   Token   : ${GITHUB_TOKEN.substring(0, 8)}...`);
    console.log('');

    // 1. Create repository
    console.log('📁 Creating repository...');
    const createRes = await apiRequest('POST', '/user/repos', {
        name: REPO_NAME,
        description: 'Smart Campus Complaint & Response System — Node.js + MySQL',
        private: true,
        auto_init: false
    }, GITHUB_TOKEN);

    if (createRes.status === 201) {
        console.log(`✅  Repository created: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}`);
    } else if (createRes.status === 422) {
        console.log(`⚠️   Repository already exists, using it.`);
    } else {
        console.error(`❌  Failed to create repo: ${createRes.status}`, createRes.body.message || createRes.body);
        process.exit(1);
    }

    // 2. Collect files
    const projectDir = path.join(__dirname, '..');
    console.log('\n🔍 Scanning project files...');
    const files = collectFiles(projectDir);
    console.log(`   Found ${files.length} files to upload.\n`);

    // 3. Upload each file
    let uploaded = 0;
    let failed = 0;
    for (const { fullPath, relPath } of files) {
        try {
            const content = fs.readFileSync(fullPath);
            const base64 = content.toString('base64');

            // Check if file already exists (to get its SHA for update)
            const checkRes = await apiRequest(
                'GET',
                `/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${relPath}`,
                null, GITHUB_TOKEN
            );

            const fileData = {
                message: `Upload: ${relPath}`,
                content: base64,
                ...(checkRes.status === 200 ? { sha: checkRes.body.sha } : {})
            };

            const uploadRes = await apiRequest(
                'PUT',
                `/repos/${GITHUB_USERNAME}/${REPO_NAME}/contents/${relPath}`,
                fileData, GITHUB_TOKEN
            );

            if (uploadRes.status === 200 || uploadRes.status === 201) {
                uploaded++;
                process.stdout.write(`\r   ✅  ${uploaded}/${files.length} uploaded...`);
            } else {
                failed++;
                console.error(`\n   ❌  Failed: ${relPath} — ${uploadRes.body.message}`);
            }

            // Avoid rate limiting (GitHub allows 30 reqs/minute for content API)
            await sleep(250);
        } catch (err) {
            failed++;
            console.error(`\n   ❌  Error on ${relPath}:`, err.message);
        }
    }

    console.log(`\n\n🎉 Upload Complete!`);
    console.log(`   ✅  Uploaded : ${uploaded}`);
    console.log(`   ❌  Failed   : ${failed}`);
    console.log(`\n🔗  View your repo: https://github.com/${GITHUB_USERNAME}/${REPO_NAME}\n`);
}

main().catch(err => {
    console.error('\n💥 Unexpected error:', err.message);
    process.exit(1);
});
