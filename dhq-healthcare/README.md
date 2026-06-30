# DHQ Healthcare

Disha HealthQ healthcare web prototype for doctor appointment booking, hospital services, nearby care tracking and complete care services from the attached DHQ feature chart.

## Run

Backend production target is Render. The Hostinger website must not run the backend locally; it calls the Render API:

```text
https://dishahealthq-c7gv.onrender.com
```

For local development only:

```bash
node server.js
```

Then open `http://127.0.0.1:5175/`.

For production-style local testing only, configure `.env` and use:

```bash
npm run start:prod
```

Or double-click `start-production.bat` on Windows.

Admin login is required at `/admin.html` on the same host.
The local production credentials are stored in `.env`; rotate `ADMIN_PASSWORD` and `SESSION_SECRET` before public deployment.

If running behind HTTPS/reverse proxy, set:

```env
TRUST_PROXY=true
SECURE_COOKIES=true
HOST=0.0.0.0
```

Use `0.0.0.0` for Render so the web service can detect the open port. Do not set a fixed `PORT` value in Render; Render provides `process.env.PORT` automatically.

Render environment should include:

```env
NODE_ENV=production
HOST=0.0.0.0
TRUST_PROXY=true
SECURE_COOKIES=true
CORS_ORIGINS=https://dishahealthq.in,https://www.dishahealthq.in
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-password-12-plus-chars>
SESSION_SECRET=<random-secret-32-plus-chars>
DOCTOR_LOGIN_CODE=<doctor-code>
```

The backend creates a local SQLite database automatically at:

```text
data/disha-healthq.sqlite
```

Existing JSON data is migrated on first run. JSON files remain for local fallback/migration, but SQLite is now the main store for doctors, appointments, service requests, consultation messages and VC signaling metadata.

## Included Features

- Doctor search, filters, clinic/video/home booking and payment choices
- Online consultation slots, appointment reminders and success toast
- Hospital bed availability with ICU, oxygen and general bed status
- Medicine prescription upload and nearby pharmacy ordering
- Home lab tests and report downloads
- Emergency SOS, live location status and ambulance ETA
- AI symptom checker with smart care routes
- Digital health profile, prescriptions, reports and reminders
- Subscription plans, wellness, mental health, women and child care, elderly care, blood services, insurance help, student plans and nearby tracking
- Multi-language selector for English, Hindi, Assamese and Bengali support
- Password-protected admin page for approving and rejecting doctor applications

## Production Security Added

- Admin login with HTTP-only session cookie
- CSRF token required for admin write actions
- Public live events only expose approved public doctors
- Admin APIs and admin live events require authentication
- SQLite-backed persistence for doctors, appointments, service requests, consultation messages and recent VC signaling
- Patient consultation rooms require a per-appointment room token; doctors access rooms only through their approved doctor session
- Doctor chat and VC signaling writes require CSRF protection
- Security headers including CSP, frame blocking and nosniff
- Static file allowlist blocks `.env`, backend source, logs and `data/*.json`
- Request size limits, rate limits and validated location/service request inputs
