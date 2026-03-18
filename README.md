# Smart Campus Complaint & Response System (SCRS)

A professional, real-time complaint management platform designed for educational institutions.

## 🚀 Features
- **Secure Activation**: Student account activation via pre-verified master data and OTP verification.
- **Real-time Updates**: Instant dashboard updates for students and admins using Socket.io.
- **Smart Routing**: Automated complaint assignment to relevant departments (Hostel, Mess, Security, etc.).
- **Media Support**: Cloudinary-powered image and file attachments for complaints.
- **Security**: 
  - JWT-based authentication.
  - Bcrypt password hashing.
  - Global rate limiting.
  - Account locking after failed attempts.
- **Notifications**: Automated Email and SMS notifications (Nodemailer + Twilio).

## 🛠️ Technology Stack
- **Frontend**: Vanilla JavaScript + GSAP Animations + FontAwesome.
- **Backend**: Node.js + Express.
- **Database**: MySQL.
- **Infrastructure**: Cloudinary (Media), Twilio (SMS), SMTP (Email), Socket.io (Real-time).

## 📋 Setup Instructions
1.  **Clone the Repository**.
2.  **Install Dependencies**:
    ```bash
    npm install
    ```
3.  **Environment Setup**:
    - Copy `.env.example` to `.env`.
    - Fill in your database, Cloudinary, Twilio, and SMTP credentials.
4.  **Database Setup**:
    - Run the SQL script in `database/schema.sql` on your MySQL server.
    - Seed initial verification data:
      ```bash
      node scripts/seed_verification_data.js
      ```
5.  **Start the Server**:
    ```bash
    npm start
    ```

## 🔒 Security Best Practices
- Keep your `.env` file secure and never commit it to version control.
- In production, set `NODE_ENV=production`.
- Periodically clear expired OTPs using a cron job.

## 👨‍💻 Developed for
Govt Degree College Dharamshala
"A digital nervous system for the campus."
