# Ottawa TRMNL Weather v5

Custom Ottawa weather screen for TRMNL with two iCloud calendar feeds.

## Render

Build command:

    npm install

Start command:

    npm start

Health check:

    /health

Weather endpoint:

    /weather

## Required Render environment variables

Set these in Render > Environment. Use the full `webcal://...` links; the app converts them to HTTPS automatically.

    ICLOUD_CALENDAR_URL
    ICLOUD_CALENDAR_URL_2

Do not put the calendar URLs in a public GitHub repository. Anyone with a published iCloud calendar URL can read that calendar.

## Screen behaviour

- Current Ottawa temperature is always shown.
- 7-8 AM Monday-Friday: School Morning.
- 7-8 AM Saturday/Sunday: normal Today view.
- 8-9 AM: today's events from both configured iCloud calendars plus weather.
- 6-11 PM: tomorrow-focused forecast.
- If either calendar contains an evening event whose title includes `CLARE WORK`, then from 4-7 PM a special panel replaces the normal raincoat panel.
- The Clare panel shows:
  - weather around the scheduled end of the work event for the walk home;
  - an overnight summary covering roughly 7 PM-5 AM, including snow accumulation, rain, significant weather, low temperature/feels-like, and strong gusts;
  - a specific forecast for 7 AM the following morning.
- Significant overnight conditions such as >=10 cm snow, >=15 mm rain, severe freezing precipitation/thunderstorms, or gusts >=60 km/h are flagged prominently.

## TRMNL

Use this polling URL:

    https://terminal-in32.onrender.com/weather

Paste `full.liquid` into the Full layout of your TRMNL Private Plugin.
