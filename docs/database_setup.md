# Database Setup Instructions

To ensure the Smart Campus System works correctly with the latest full-stack integration, follow these steps to import the updated database schema:

1. **Open XAMPP Control Panel** and ensure **Apache** and **MySQL** are running.
2. **Open phpMyAdmin** in your browser: [http://localhost/phpmyadmin](http://localhost/phpmyadmin).
3. **Select the Database**: Look for `smart_campus_db` in the left sidebar. If it doesn't exist, you can create it, but the SQL script handles this.
4. **Import the SQL File**:
   - Click the **"Import"** tab at the top.
   - Click **"Choose File"** and select: `c:\xampp\htdocs\smart_complaint_&_resonse_system\database.sql`.
   - Scroll down and click **"Go"** or **"Import"**.
5. **Verify Tables**: Ensure the following tables are now visible:
   - `users`
   - `verified_students`
   - `verified_staff`
   - `otp_logs`
   - `departments` (Check if `description`, `email`, `head` columns are present)
   - `complaints`
   - `feedback`
   - `otps`

### Connection Test
You can verify the connection by visiting:
[http://localhost/smart_complaint_&_resonse_system/public/test_connection.php](http://localhost/smart_complaint_&_resonse_system/public/test_connection.php)
