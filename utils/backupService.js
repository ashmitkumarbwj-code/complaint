const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const zlib = require('zlib');
const logger = require('./logger');

// Hardcoded path to mysqldump in XAMPP on Windows
// In production (Linux), this might just be 'mysqldump'
const MYSQLDUMP_PATH = process.platform === 'win32' 
    ? 'C:\\xampp\\mysql\\bin\\mysqldump.exe' 
    : 'mysqldump';

const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Automates a mysqldump to the backups/ folder
 */
exports.runBackup = () => {
    return new Promise((resolve, reject) => {
        const date = new Date();
        const timestamp = `${date.getFullYear()}${(date.getMonth()+1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}_${date.getHours().toString().padStart(2, '0')}${date.getMinutes().toString().padStart(2, '0')}`;
        const fileName = `smart_campus_backup_${timestamp}.sql.gz`;
        const filePath = path.join(BACKUP_DIR, fileName);

        logger.info(`[Backup] Starting database backup with compression to ${fileName}`);

        const dbUser = process.env.DB_USER || 'root';
        const dbPass = process.env.DB_PASSWORD || '';
        const dbName = process.env.DB_NAME || 'smart_campus_db';

        const args = ['-u', dbUser];
        if (dbPass) {
            args.push(`-p${dbPass}`);
        }
        args.push(dbName);

        const dumpProcess = spawn(MYSQLDUMP_PATH, args);

        const gzip = zlib.createGzip();
        const writeStream = fs.createWriteStream(filePath);
        
        // Pipe mysqldump stdout -> gzip compression -> file
        dumpProcess.stdout.pipe(gzip).pipe(writeStream);

        // Capture stderr to log errors
        let errorOutput = '';
        dumpProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        dumpProcess.on('close', (code) => {
            if (code === 0) {
                logger.info(`[Backup] Completed successfully: ${fileName}`);
                resolve(filePath);
            } else {
                logger.error(`[Backup] Failed with exit code ${code}: ${errorOutput}`);
                // Erase faulty file
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                reject(new Error(`mysqldump exited with code ${code}`));
            }
        });

        dumpProcess.on('error', (err) => {
            logger.error(`[Backup] Process failed to spawn:`, err);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            reject(err);
        });
    });
};

/**
 * Deletes backup files older than 30 days
 */
exports.cleanupOldBackups = () => {
    return new Promise((resolve) => {
        logger.info('[Backup] Starting 30-day retention cleanup...');
        
        fs.readdir(BACKUP_DIR, (err, files) => {
            if (err) {
                logger.error('[Backup] Failed to read backup directory for cleanup:', err);
                return resolve();
            }

            const now = Date.now();
            const retentionMs = 30 * 24 * 60 * 60 * 1000; // 30 days
            let deletedCount = 0;

            files.forEach(file => {
                if (!file.endsWith('.sql.gz') && !file.endsWith('.sql')) return;
                
                const filePath = path.join(BACKUP_DIR, file);
                try {
                    const stats = fs.statSync(filePath);
                    if (now - stats.mtimeMs > retentionMs) {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                        logger.info(`[Backup] Deleted old backup: ${file}`);
                    }
                } catch (e) {
                    logger.error(`[Backup] Failed to stat/delete file ${file}:`, e);
                }
            });

            logger.info(`[Backup] Cleanup finished. Deleted ${deletedCount} old files.`);
            resolve();
        });
    });
};
