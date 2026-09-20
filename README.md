# Ottawa TRMNL Weather v2

Files for the TRMNL weather screen with iCloud calendar support.

## Render
Build command:

npm install

Start command:

npm start

Weather endpoint:

https://terminal-in32.onrender.com/weather

## iCloud calendar
The current calendar feed is included in `server.js` as a fallback.
For better privacy, add this Render environment variable and then redeploy:

ICLOUD_CALENDAR_URL = your webcal:// or https:// published calendar URL

The screen shows today's events only from 8:00 AM through 8:59 AM Ottawa time.

## Screen modes
- 5:00-7:00 AM: normal today weather
- 7:00-8:00 AM weekdays: school morning
- 7:00-8:00 AM weekends: normal today weather
- 8:00-9:00 AM: weather + today's iCloud calendar events
- 9:00 AM-6:00 PM: normal today weather
- 6:00-11:00 PM: tomorrow-focused weather
- 11:00 PM-5:00 AM: configure TRMNL Sleep Mode

Current temperature is always shown.
