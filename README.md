# Ottawa Family Weather for TRMNL

A small Node service plus a TRMNL Private Plugin template.

## What it does

- Ottawa, Ontario only
- Current temperature is always visible
- Current condition and feels-like temperature are always visible
- 7-8 AM: school-morning view showing 7 AM through 2 PM
- 6 PM onward: focuses on tomorrow, while still keeping the current temperature at the top
- Other daytime hours: upcoming hourly forecast
- Raincoat warning if meaningful rain is expected before 3 PM
- New deterministic kid-friendly joke every Ottawa calendar day
- Celsius

## Deploy to Render

1. Create a new GitHub repository.
2. Upload every file in this folder to the repository root.
3. In Render, create a new Web Service from that repository.
4. Runtime: Node.
5. Build command: `npm install`
6. Start command: `npm start`
7. Deploy.
8. When Render is live, open:
   `https://YOUR-RENDER-URL.onrender.com/weather`
9. You should see JSON containing `location`, `current`, `hours`, `raincoat`, and `joke`.

The included `render.yaml` contains the same settings if you prefer Render Blueprint deployment.

## Configure TRMNL

TRMNL's Private Plugin polling strategy can read a JSON endpoint directly.

### Option A - create the plugin in the TRMNL UI

1. Create a Private Plugin.
2. Strategy: Polling.
3. Polling URL: your Render `/weather` URL.
4. Verb: GET.
5. Save.
6. Open Edit Markup.
7. Paste the contents of `full.liquid` into the Full layout.
8. Force Refresh so TRMNL fetches the JSON.

For a single polling URL, TRMNL exposes root JSON fields directly, so the template uses variables such as `{{ current.temp }}` and `{{ hours }}`.

### Option B - import the TRMNL plugin files

TRMNL's private-plugin import format supports `settings.yml` plus Liquid layout files. Before importing, edit `settings.yml` and replace:

`https://YOUR-RENDER-URL.onrender.com/weather`

with your real Render URL.

## Refresh schedule

The weather endpoint can be called whenever TRMNL needs it. Set the TRMNL device/playlist schedule to:

- 5:00-7:00 AM: every 30 minutes
- 7:00-8:00 AM: every 10 minutes if your TRMNL plan supports it
- 8:00 AM-11:00 PM: every 30 minutes
- 11:00 PM-5:00 AM: Sleep Mode / no updates

Important: current TRMNL standard Private Plugin polling intervals list 15 minutes as the shortest standard polling interval. If your plan does not permit a 10-minute refresh, use 15 minutes for 7-8 AM or use TRMNL+ / a webhook-based approach.

## Raincoat logic

The raincoat warning checks today from the current morning hour through 3 PM. After 6 PM it checks tomorrow from 6 AM through 3 PM.

It turns on when either:

- hourly rain/showers are at least 0.2 mm, or
- precipitation probability is at least 40% and the weather code indicates rain/showers/thunderstorms.

To change this, edit these two values near the top of `server.js`:

`RAIN_PROBABILITY_THRESHOLD`

`RAIN_MM_THRESHOLD`

## Useful URLs

- `/weather` - TRMNL JSON data
- `/health` - simple Render health check
