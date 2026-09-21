# Ottawa TRMNL Weather v6

A custom Ottawa family weather screen for TRMNL.

## What v6 fixes

- One shared Open-Meteo request is used even if TRMNL Preview and the physical device request the screen at the same time.
- Weather is cached for 10 minutes.
- Once weather has been fetched successfully, TRMNL is served immediately from cache while a refresh happens in the background.
- The old aggressive 12-second weather abort/retry loop has been removed.
- On a cold Render start, the server allows up to 35 seconds for the first weather response without cancelling the underlying request.
- iCloud calendar feeds are cached independently for 5 minutes and cannot take the weather screen down.

## Existing behavior retained

- Ottawa weather, Celsius.
- Current temperature always visible.
- Weekday 7–8 AM School Morning view; weekends stay on Today.
- 8–9 AM calendar view.
- Evening tomorrow-focused view.
- Daily kids joke.
- Raincoat warning.
- Two iCloud calendar feeds.
- 4–7 PM Clare Work panel when an evening event contains `CLARE WORK`.
- Clare panel includes walk-home weather, overnight hazards, and tomorrow at 7 AM.

## Render

Build command: `npm install`

Start command: `npm start`

Environment variables:

- `ICLOUD_CALENDAR_URL`
- `ICLOUD_CALENDAR_URL_2`

Do not commit the private iCloud URLs to GitHub. Render accepts the original `webcal://` values.

## TRMNL

Polling URL:

`https://terminal-in32.onrender.com/weather`

Paste `full-liquid.txt` (or `full.liquid`) into the TRMNL Private Plugin **Full** markup editor.


## v7 Clare panel cleanup
When Clare Work is active, the walk-home forecast is the only dedicated 7 AM callout. The duplicate Tomorrow at 7 AM card and Tomorrow Morning summary are hidden, and the hourly row starts at 8 AM.


## v8 weather-source resilience

This version fixes repeated HTTP 429 rate-limit failures from Open-Meteo on shared Render IPs. It uses Open-Meteo as the primary source, enters a 30-minute cooldown after a 429, and automatically falls back to MET Norway. Successful weather is cached for 15 minutes and shared across all TRMNL/preview requests.


## v9
- Adds a different kid-friendly animal fact each day.
- Uses the space to the right of Joke of the Day for the animal fact.
- Joke and animal fact stay fixed for the Ottawa calendar day and change the next day.


## v10 fix
The animal fact is now exposed as a simple root-level `animal_fact_text` field for maximum TRMNL Liquid compatibility.


## v11 animal fact fix
The animal fact is now exposed under both `animal_fact_text` and `animal_fact_of_day`, and the Liquid template falls back to the older nested `animal_fact.text` value. This prevents a blank fact while TRMNL is still holding an older cached plugin payload.
