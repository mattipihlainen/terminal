import http from "node:http";
import ical from "node-ical";

const PORT = Number(process.env.PORT || 3000);

const LATITUDE = 45.4215;
const LONGITUDE = -75.6972;
const TIMEZONE = "America/Toronto";

const RAIN_PROBABILITY_THRESHOLD = 40;
const RAIN_MM_THRESHOLD = 0.2;

const WEATHER_CACHE_TTL_MS = 15 * 60 * 1000;
const WEATHER_STALE_MAX_MS = 12 * 60 * 60 * 1000;
const CALENDAR_CACHE_TTL_MS = 5 * 60 * 1000;

let weatherCache = { data: null, fetchedAt: 0 };
let weatherFetchInFlight = null;
let lastWeatherError = null;
let lastWeatherProvider = null;
let openMeteoBlockedUntil = 0;

const calendarCache = new Map();
const calendarFetchInFlight = new Map();


// Keep calendar URLs in Render environment variables so they are not exposed in GitHub.
// ICLOUD_CALENDAR_URL = primary calendar
// ICLOUD_CALENDAR_URL_2 = second calendar
const ICLOUD_CALENDAR_URLS = [
  process.env.ICLOUD_CALENDAR_URL || "",
  process.env.ICLOUD_CALENDAR_URL_2 || ""
].filter(Boolean);

const JOKES = [
  ["Why did the bicycle fall over?", "Because it was two-tired."],
  ["What do you call a bear with no teeth?", "A gummy bear."],
  ["Why did the math book look sad?", "Because it had too many problems."],
  ["What did one wall say to the other wall?", "I'll meet you at the corner."],
  ["Why can't your nose be 12 inches long?", "Because then it would be a foot."],
  ["What do you call cheese that isn't yours?", "Nacho cheese."],
  ["Why did the cookie go to the doctor?", "Because it felt crummy."],
  ["What kind of tree fits in your hand?", "A palm tree."],
  ["What did the ocean say to the beach?", "Nothing. It just waved."],
  ["Why are fish so smart?", "Because they live in schools."],
  ["What do you call a sleeping bull?", "A bulldozer."],
  ["Why did the banana go to the doctor?", "Because it wasn't peeling well."],
  ["What does a cloud wear under its raincoat?", "Thunderwear."],
  ["Why did the teddy bear say no to dessert?", "Because it was stuffed."],
  ["What do you call an alligator in a vest?", "An investigator."],
  ["Why did the golfer bring two pairs of pants?", "In case he got a hole in one."],
  ["Why did the computer go to the doctor?", "Because it caught a virus."],
  ["Why did the tomato turn red?", "Because it saw the salad dressing."],
  ["What do you call a boomerang that won't come back?", "A stick."],
  ["Why don't eggs tell jokes?", "They might crack each other up."],
  ["What kind of music do balloons hate?", "Pop music."],
  ["Why did the scarecrow win an award?", "Because he was outstanding in his field."],
  ["What do you call a fake noodle?", "An impasta."],
  ["How do you make a tissue dance?", "Put a little boogie in it."],
  ["What do you call a pig that knows karate?", "A pork chop."],
  ["Why are frogs so happy?", "Because they eat whatever bugs them."],
  ["What did the zero say to the eight?", "Nice belt!"],
  ["Why couldn't the pony sing?", "Because it was a little hoarse."],
  ["What do you call a dog magician?", "A labracadabrador."],
  ["Why did the picture go to jail?", "Because it was framed."],
  ["What kind of shoes do ninjas wear?", "Sneakers."],
  ["Why did the broom arrive late?", "It over-swept."],
  ["What did the left eye say to the right eye?", "Between us, something smells."],
  ["What do you call a snowman in summer?", "A puddle."],
  ["How do you organize a space party?", "You planet."],
  ["What do you call a duck that gets good grades?", "A wise quacker."],
  ["Why couldn't the leopard play hide-and-seek?", "Because it was always spotted."],
  ["What kind of room has no doors or windows?", "A mushroom."],
  ["What do you call a fly without wings?", "A walk."],
  ["Why did the chicken join a band?", "Because it had the drumsticks."],
  ["Why do bees have sticky hair?", "Because they use honeycombs."],
  ["Why was six afraid of seven?", "Because seven eight nine."],
  ["What is a cat's favourite colour?", "Purrr-ple."],
  ["Why did the mushroom get invited to the party?", "Because he was a fungi."],
  ["Why did the music teacher need a ladder?", "To reach the high notes."],
  ["Why do seagulls fly over the sea?", "Because if they flew over the bay they'd be bagels."],
  ["Why are elevator jokes so good?", "They work on many levels."],
  ["Why was the computer cold?", "It left its Windows open."],
  ["How does a penguin build its house?", "Igloos it together."],
  ["Why are spiders great at computers?", "They're good at websites."],
  ["What kind of snacks do computers eat?", "Microchips."]
];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function localParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "long"
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday
  };
}

function isoDate(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function addCalendarDays(dateString, numberOfDays) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + numberOfDays));
  return [date.getUTCFullYear(), pad2(date.getUTCMonth() + 1), pad2(date.getUTCDate())].join("-");
}

function dayOfYearIndex(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const start = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  return Math.floor((current - start) / 86400000);
}

function roundTemperature(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value));
}

function formatHour(hour) {
  const normalized = ((Number(hour) % 24) + 24) % 24;
  if (normalized === 0) return "12 AM";
  if (normalized === 12) return "12 PM";
  if (normalized > 12) return `${normalized - 12} PM`;
  return `${normalized} AM`;
}


function formatTodayDate(parts) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    month: "long",
    day: "numeric"
  }).format(date);
}
function formatGeneratedTime(parts) {
  const hour12 = parts.hour === 0 ? 12 : parts.hour > 12 ? parts.hour - 12 : parts.hour;
  const suffix = parts.hour >= 12 ? "PM" : "AM";
  return `${hour12}:${pad2(parts.minute)} ${suffix}`;
}

function weatherDescription(code) {
  const c = Number(code);
  if (c === 0) return "Clear";
  if (c === 1) return "Mostly clear";
  if (c === 2) return "Partly cloudy";
  if (c === 3) return "Cloudy";
  if (c === 45 || c === 48) return "Fog";
  if ([51, 53, 55].includes(c)) return "Drizzle";
  if ([56, 57].includes(c)) return "Freezing drizzle";
  if (c === 61) return "Light rain";
  if (c === 63) return "Rain";
  if (c === 65) return "Heavy rain";
  if ([66, 67].includes(c)) return "Freezing rain";
  if (c === 71) return "Light snow";
  if (c === 73) return "Snow";
  if (c === 75) return "Heavy snow";
  if (c === 77) return "Snow grains";
  if (c === 80) return "Light showers";
  if (c === 81) return "Showers";
  if (c === 82) return "Heavy showers";
  if ([85, 86].includes(c)) return "Snow showers";
  if ([95, 96, 99].includes(c)) return "Thunderstorm";
  return "Mixed weather";
}

function weatherIcon(code) {
  const c = Number(code);
  if (c === 0 || c === 1) return "☀";
  if (c === 2) return "◐";
  if (c === 3) return "☁";
  if (c === 45 || c === 48) return "≋";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(c)) return "☂";
  if ([71, 73, 75, 77, 85, 86].includes(c)) return "❄";
  return "○";
}

function isRainCode(code) {
  return [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(Number(code));
}

function hourlyRows(weather) {
  const result = [];
  if (!weather || !weather.hourly || !Array.isArray(weather.hourly.time)) return result;
  for (let i = 0; i < weather.hourly.time.length; i += 1) {
    const time = weather.hourly.time[i];
    const match = time.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):/);
    if (!match) continue;
    result.push({
      date: match[1],
      hour: Number(match[2]),
      temp: roundTemperature(weather.hourly.temperature_2m[i]),
      feels: roundTemperature(weather.hourly.apparent_temperature[i]),
      probability: Math.round(Number(weather.hourly.precipitation_probability[i] || 0)),
      rain: Number(weather.hourly.rain[i] || 0),
      showers: Number(weather.hourly.showers[i] || 0),
      precipitation: Number(weather.hourly.precipitation[i] || 0),
      snowfall: Number(weather.hourly.snowfall?.[i] || 0),
      wind: Number(weather.hourly.wind_speed_10m?.[i] || 0),
      gust: Number(weather.hourly.wind_gusts_10m?.[i] || 0),
      code: Number(weather.hourly.weather_code[i])
    });
  }
  return result;
}

function dailyRow(weather, targetDate) {
  if (!weather || !weather.daily || !Array.isArray(weather.daily.time)) {
    return { high: "--", low: "--", code: 0, description: "Forecast unavailable" };
  }
  const index = weather.daily.time.findIndex((date) => date === targetDate);
  if (index < 0) {
    return { high: "--", low: "--", code: 0, description: "Forecast unavailable" };
  }
  return {
    high: roundTemperature(weather.daily.temperature_2m_max[index]),
    low: roundTemperature(weather.daily.temperature_2m_min[index]),
    code: Number(weather.daily.weather_code[index]),
    description: weatherDescription(weather.daily.weather_code[index])
  };
}

function raincoatForecast(rows, date, startHour, endHour) {
  const candidates = rows.filter((row) => row.date === date && row.hour >= startHour && row.hour <= endHour);
  const rainy = candidates.filter((row) => {
    const rainAmount = row.rain + row.showers;
    return rainAmount >= RAIN_MM_THRESHOLD || (row.probability >= RAIN_PROBABILITY_THRESHOLD && isRainCode(row.code));
  });

  if (rainy.length === 0) {
    return { needed: false, message: "No rain expected before 3 PM" };
  }

  const first = rainy[0];
  let last = first;
  for (let i = 1; i < rainy.length; i += 1) {
    if (rainy[i].hour === last.hour + 1) last = rainy[i];
    else break;
  }

  const timing = first.hour === last.hour
    ? `around ${formatHour(first.hour)}`
    : `${formatHour(first.hour)}–${formatHour(last.hour + 1)}`;

  return { needed: true, message: `Rain likely ${timing}` };
}

function buildDisplayHours(rows, mode, today, tomorrow, currentHour, clareWorkActive = false) {
  let chosen = [];

  if (mode === "school") {
    chosen = rows.filter((row) => row.date === today && row.hour >= 7 && row.hour <= 14);
  } else if (mode === "calendar") {
    chosen = rows.filter((row) => row.date === today && row.hour >= Math.max(currentHour, 8) && row.hour <= 15);
  } else if (mode === "evening") {
    chosen = rows.filter((row) => row.date === tomorrow && row.hour >= (clareWorkActive ? 8 : 7) && row.hour <= 14);
  } else {
    const currentIndex = rows.findIndex((row) => row.date === today && row.hour >= currentHour);
    if (currentIndex >= 0) chosen = rows.slice(currentIndex, currentIndex + 8);
  }

  return chosen.slice(0, 8).map((row) => ({
    time: formatHour(row.hour),
    temp: row.temp,
    pop: row.probability,
    icon: weatherIcon(row.code),
    condition: weatherDescription(row.code)
  }));
}

function findMorningTemperature(rows, date) {
  const seven = rows.find((row) => row.date === date && row.hour === 7);
  const eight = rows.find((row) => row.date === date && row.hour === 8);
  if (seven && eight) return Math.round((seven.temp + eight.temp) / 2);
  if (seven) return seven.temp;
  if (eight) return eight.temp;
  return null;
}

function weekdayForDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("en-CA", { weekday: "long", timeZone: "UTC" }).format(date);
}

function selectJoke(today) {
  const index = dayOfYearIndex(today) % JOKES.length;
  const [question, answer] = JOKES[index];
  return { question, answer };
}

function normalizeCalendarUrl(url) {
  if (!url) return "";
  return url.replace(/^webcal:/i, "https:");
}

function localDateString(date) {
  const p = localParts(date);
  return isoDate(p);
}

function formatDateTime(date) {
  const p = localParts(date);
  const h12 = p.hour === 0 ? 12 : p.hour > 12 ? p.hour - 12 : p.hour;
  return `${h12}:${pad2(p.minute)} ${p.hour >= 12 ? "PM" : "AM"}`;
}

function eventLocalHour(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return localParts(date).hour;
}

function isAllDayCalendarEvent(event) {
  return event?.datetype === "date";
}

function eventDurationMs(event) {
  if (!(event?.start instanceof Date) || !(event?.end instanceof Date)) return 0;
  return Math.max(0, event.end.getTime() - event.start.getTime());
}

function addCalendarOccurrence(results, event, start, end, targetDate, sourceIndex) {
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return;

  const allDay = isAllDayCalendarEvent(event);
  const startDate = localDateString(start);
  let endDate = end instanceof Date && !Number.isNaN(end.getTime()) ? localDateString(end) : startDate;

  if (allDay && end instanceof Date && !Number.isNaN(end.getTime())) {
    endDate = localDateString(new Date(end.getTime() - 1000));
  }

  if (targetDate < startDate || targetDate > endDate) return;

  const title = String(event.summary || "Untitled event").trim();
  const location = String(event.location || "").trim();

  results.push({
    title,
    location,
    all_day: allDay,
    start,
    end: end instanceof Date && !Number.isNaN(end.getTime()) ? end : null,
    time: allDay ? "All day" : formatDateTime(start),
    end_time: !allDay && end instanceof Date && !Number.isNaN(end.getTime()) ? formatDateTime(end) : "",
    source_index: sourceIndex,
    uid: String(event.uid || ""),
    sort_time: allDay ? 0 : start.getTime()
  });
}

function expandCalendarEvents(parsed, targetDate, sourceIndex) {
  const results = [];
  const [y, m, d] = targetDate.split("-").map(Number);
  const rangeStart = new Date(Date.UTC(y, m - 1, d - 1, 0, 0, 0));
  const rangeEnd = new Date(Date.UTC(y, m - 1, d + 2, 0, 0, 0));

  for (const component of Object.values(parsed || {})) {
    if (!component || component.type !== "VEVENT") continue;
    if (String(component.status || "").toUpperCase() === "CANCELLED") continue;
    if (!(component.start instanceof Date) || Number.isNaN(component.start.getTime())) continue;

    const duration = eventDurationMs(component);

    if (component.rrule && typeof component.rrule.between === "function") {
      const occurrences = component.rrule.between(rangeStart, rangeEnd, true);
      for (const occurrence of occurrences) {
        const start = new Date(occurrence);
        const end = duration > 0 ? new Date(start.getTime() + duration) : null;
        addCalendarOccurrence(results, component, start, end, targetDate, sourceIndex);
      }
    } else {
      addCalendarOccurrence(results, component, component.start, component.end, targetDate, sourceIndex);
    }
  }

  return results;
}

async function fetchSingleCalendar(url, targetDate, sourceIndex) {
  const normalized = normalizeCalendarUrl(url);
  const response = await fetch(normalized, {
    headers: { "User-Agent": "ottawa-trmnl-weather/6.0" }
  });

  if (!response.ok) {
    throw new Error(`iCloud calendar ${sourceIndex + 1} returned HTTP ${response.status}`);
  }

  const text = await response.text();
  const parsed = ical.sync.parseICS(text);
  return expandCalendarEvents(parsed, targetDate, sourceIndex);
}

async function fetchCalendarsFromSource(targetDate) {
  if (ICLOUD_CALENDAR_URLS.length === 0) return [];

  const settled = await Promise.allSettled(
    ICLOUD_CALENDAR_URLS.map((url, index) => fetchSingleCalendar(url, targetDate, index))
  );

  const events = [];
  for (const result of settled) {
    if (result.status === "fulfilled") events.push(...result.value);
    else console.error("Calendar fetch failed:", result.reason?.message || result.reason);
  }

  const seen = new Set();
  const deduped = [];
  for (const event of events) {
    const key = `${event.uid}|${event.start?.toISOString?.() || ""}|${event.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(event);
  }

  return deduped.sort((a, b) => a.sort_time - b.sort_time);
}

async function fetchCalendars(targetDate) {
  if (ICLOUD_CALENDAR_URLS.length === 0) return [];

  const cached = calendarCache.get(targetDate);
  const nowMs = Date.now();
  if (cached && nowMs - cached.fetchedAt < CALENDAR_CACHE_TTL_MS) {
    return cached.events;
  }

  if (!calendarFetchInFlight.has(targetDate)) {
    const promise = fetchCalendarsFromSource(targetDate)
      .then((events) => {
        calendarCache.set(targetDate, { events, fetchedAt: Date.now() });
        return events;
      })
      .finally(() => {
        calendarFetchInFlight.delete(targetDate);
      });

    calendarFetchInFlight.set(targetDate, promise);
  }

  try {
    return await calendarFetchInFlight.get(targetDate);
  } catch (error) {
    if (cached) {
      console.error("Calendar refresh failed; using cached calendar:", error.message);
      return cached.events;
    }
    throw error;
  }
}

function displayCalendarEvents(events) {
  return events.slice(0, 6).map((event) => ({
    title: event.title,
    location: event.location,
    time: event.end_time ? `${event.time}–${event.end_time}` : event.time,
    all_day: event.all_day
  }));
}

function findClareWorkEvent(events) {
  return events.find((event) => {
    if (!/CLARE\s+WORK/i.test(event.title || "")) return false;
    if (event.all_day) return true;

    const startHour = eventLocalHour(event.start);
    const endHour = eventLocalHour(event.end);

    return (startHour !== null && startHour >= 12) || (endHour !== null && endHour >= 16);
  }) || null;
}

function weatherSeverity(code) {
  const c = Number(code);
  if ([95, 96, 99].includes(c)) return 6;
  if ([66, 67].includes(c)) return 5;
  if ([75, 82, 86].includes(c)) return 4;
  if ([63, 65, 73, 81, 85].includes(c)) return 3;
  if ([51, 53, 55, 56, 57, 61, 71, 80].includes(c)) return 2;
  if ([45, 48].includes(c)) return 1;
  return 0;
}

function nearestWeatherRow(rows, date, hour) {
  const candidates = rows.filter((row) => row.date === date);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, row) => {
    if (!best) return row;
    return Math.abs(row.hour - hour) < Math.abs(best.hour - hour) ? row : best;
  }, null);
}

function summarizeWeatherRow(row, label) {
  if (!row) {
    return {
      label,
      temp: "--",
      feels: "--",
      condition: "Forecast unavailable",
      pop: 0,
      wind: "--",
      gust: "--",
      detail: "Forecast unavailable"
    };
  }

  const extras = [];
  if (row.snowfall >= 0.2) extras.push(`${row.snowfall.toFixed(1)} cm snow`);
  else if (row.rain + row.showers >= 0.2) extras.push(`${(row.rain + row.showers).toFixed(1)} mm rain`);
  if (row.gust >= 40) extras.push(`gusts ${Math.round(row.gust)} km/h`);

  return {
    label,
    temp: row.temp,
    feels: row.feels,
    condition: weatherDescription(row.code),
    pop: row.probability,
    wind: Math.round(row.wind || 0),
    gust: Math.round(row.gust || 0),
    detail: extras.length ? extras.join(" · ") : `${row.probability}% precip.`
  };
}

function buildClareWorkSummary(events, rows, today, tomorrow, nowHour) {
  const event = findClareWorkEvent(events);
  const active = Boolean(event) && nowHour >= 16 && nowHour < 19;

  if (!active) {
    return { active: false };
  }

  let walkDate = today;
  let walkHour = 22;
  let walkLabel = "Walk home";

  if (event.end instanceof Date && !Number.isNaN(event.end.getTime())) {
    walkDate = localDateString(event.end);
    walkHour = eventLocalHour(event.end) ?? 22;
    walkLabel = `Walk home around ${formatDateTime(event.end)}`;
  } else if (event.start instanceof Date && !Number.isNaN(event.start.getTime())) {
    const startHour = eventLocalHour(event.start);
    if (startHour !== null) walkHour = Math.min(23, startHour + 4);
  }

  const walkRow = nearestWeatherRow(rows, walkDate, walkHour);
  const sevenRow = nearestWeatherRow(rows, tomorrow, 7);

  const overnightRows = rows.filter((row) =>
    (row.date === today && row.hour >= 19) ||
    (row.date === tomorrow && row.hour <= 5)
  );

  const snowTotal = overnightRows.reduce((sum, row) => sum + (row.snowfall || 0), 0);
  const rainTotal = overnightRows.reduce((sum, row) => sum + (row.rain || 0) + (row.showers || 0), 0);
  const maxPop = overnightRows.reduce((max, row) => Math.max(max, row.probability || 0), 0);
  const maxGust = overnightRows.reduce((max, row) => Math.max(max, row.gust || 0), 0);
  const minTemp = overnightRows.length ? Math.min(...overnightRows.map((row) => row.temp).filter((v) => v !== null)) : null;
  const minFeels = overnightRows.length ? Math.min(...overnightRows.map((row) => row.feels).filter((v) => v !== null)) : null;
  const worst = overnightRows.reduce((best, row) => !best || weatherSeverity(row.code) > weatherSeverity(best.code) ? row : best, null);

  const overnightBits = [];
  if (snowTotal >= 0.5) overnightBits.push(`${snowTotal.toFixed(snowTotal >= 10 ? 0 : 1)} cm snow overnight`);
  else if (rainTotal >= 0.5) overnightBits.push(`${rainTotal.toFixed(rainTotal >= 10 ? 0 : 1)} mm rain overnight`);
  else if (maxPop >= 40) overnightBits.push(`Precipitation chance up to ${Math.round(maxPop)}% overnight`);
  else overnightBits.push("No significant precipitation expected overnight");

  if (worst && weatherSeverity(worst.code) >= 1) overnightBits.push(weatherDescription(worst.code));
  if (minTemp !== null && Number.isFinite(minTemp)) overnightBits.push(`low ${Math.round(minTemp)}°`);
  if (minFeels !== null && Number.isFinite(minFeels) && minFeels <= (minTemp ?? 999) - 3) overnightBits.push(`feels ${Math.round(minFeels)}°`);
  if (maxGust >= 40) overnightBits.push(`gusts to ${Math.round(maxGust)} km/h`);

  const urgent = snowTotal >= 10 || rainTotal >= 15 || maxGust >= 60 || (worst && weatherSeverity(worst.code) >= 5);

  return {
    active: true,
    urgent,
    event_title: event.title,
    event_time: event.end_time ? `${event.time}–${event.end_time}` : event.time,
    walk_home: summarizeWeatherRow(walkRow, walkLabel),
    overnight: overnightBits.join(" · "),
    tomorrow_7am: summarizeWeatherRow(sevenRow, "Tomorrow 7 AM")
  };
}

function weatherRequestUrl() {
  const params = new URLSearchParams({
    latitude: String(LATITUDE),
    longitude: String(LONGITUDE),
    timezone: TIMEZONE,
    forecast_days: "3",
    current: ["temperature_2m", "apparent_temperature", "weather_code", "precipitation", "rain", "showers"].join(","),
    hourly: ["temperature_2m", "apparent_temperature", "precipitation_probability", "precipitation", "rain", "showers", "snowfall", "weather_code", "wind_speed_10m", "wind_gusts_10m"].join(","),
    daily: ["weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max"].join(",")
  });

  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function metNoSymbolToCode(symbolCode = "") {
  const s = String(symbolCode).toLowerCase();
  if (s.includes("thunder")) return 95;
  if (s.includes("snow")) return 73;
  if (s.includes("sleet")) return 67;
  if (s.includes("rain")) return s.includes("showers") ? 81 : 63;
  if (s.includes("fog")) return 45;
  if (s.includes("partlycloudy")) return 2;
  if (s.includes("cloudy")) return 3;
  if (s.includes("fair")) return 1;
  if (s.includes("clearsky")) return 0;
  return 3;
}

function apparentTemperatureC(tempC, windMs, humidity) {
  const t = Number(tempC);
  const windKmh = Number(windMs || 0) * 3.6;
  const rh = Number(humidity || 0);

  if (Number.isFinite(t) && t <= 10 && windKmh > 4.8) {
    return 13.12 + 0.6215 * t - 11.37 * Math.pow(windKmh, 0.16) + 0.3965 * t * Math.pow(windKmh, 0.16);
  }

  // Keep the fallback conservative in warm weather rather than inventing a humidex.
  if (Number.isFinite(t)) return t;
  return null;
}

function metNoToWeather(data) {
  const series = data?.properties?.timeseries;
  if (!Array.isArray(series) || series.length === 0) {
    throw new Error("MET Norway response was missing hourly data");
  }

  const hourly = {
    time: [],
    temperature_2m: [],
    apparent_temperature: [],
    precipitation_probability: [],
    precipitation: [],
    rain: [],
    showers: [],
    snowfall: [],
    weather_code: [],
    wind_speed_10m: [],
    wind_gusts_10m: []
  };

  const dailyMap = new Map();
  let firstCurrent = null;

  for (const point of series.slice(0, 80)) {
    const instant = point?.data?.instant?.details || {};
    const next1 = point?.data?.next_1_hours || {};
    const next6 = point?.data?.next_6_hours || {};
    const summary = next1.summary || next6.summary || {};
    const details = next1.details || next6.details || {};
    const d = new Date(point.time);
    if (Number.isNaN(d.getTime())) continue;

    const lp = localParts(d);
    const date = isoDate(lp);
    const localStamp = `${date}T${pad2(lp.hour)}:00`;
    const temp = Number(instant.air_temperature);
    const humidity = Number(instant.relative_humidity);
    const windMs = Number(instant.wind_speed || 0);
    const gustMs = Number(instant.wind_speed_of_gust || windMs || 0);
    const precip = Number(details.precipitation_amount || 0);
    const pop = Number(details.probability_of_precipitation || 0);
    const symbol = String(summary.symbol_code || "cloudy");
    const code = metNoSymbolToCode(symbol);
    const snowish = symbol.toLowerCase().includes("snow") || symbol.toLowerCase().includes("sleet");

    hourly.time.push(localStamp);
    hourly.temperature_2m.push(Number.isFinite(temp) ? temp : null);
    hourly.apparent_temperature.push(apparentTemperatureC(temp, windMs, humidity));
    hourly.precipitation_probability.push(Number.isFinite(pop) ? pop : 0);
    hourly.precipitation.push(precip);
    hourly.rain.push(snowish ? 0 : precip);
    hourly.showers.push(0);
    // MET Norway gives liquid-equivalent precipitation. For the fallback only,
    // use a conservative 1 mm water ~= 1 cm snow estimate when the symbol is snow/sleet.
    hourly.snowfall.push(snowish ? precip : 0);
    hourly.weather_code.push(code);
    hourly.wind_speed_10m.push(windMs * 3.6);
    hourly.wind_gusts_10m.push(gustMs * 3.6);

    if (!firstCurrent) {
      firstCurrent = {
        temperature_2m: Number.isFinite(temp) ? temp : null,
        apparent_temperature: apparentTemperatureC(temp, windMs, humidity),
        weather_code: code,
        precipitation: precip,
        rain: snowish ? 0 : precip,
        showers: 0
      };
    }

    const existing = dailyMap.get(date) || {
      temps: [],
      codes: [],
      pops: []
    };
    if (Number.isFinite(temp)) existing.temps.push(temp);
    existing.codes.push(code);
    if (Number.isFinite(pop)) existing.pops.push(pop);
    dailyMap.set(date, existing);
  }

  const dates = [...dailyMap.keys()].sort();
  const daily = {
    time: [],
    weather_code: [],
    temperature_2m_max: [],
    temperature_2m_min: [],
    precipitation_probability_max: []
  };

  for (const date of dates.slice(0, 4)) {
    const d = dailyMap.get(date);
    const temps = d.temps.length ? d.temps : [null];
    const validTemps = temps.filter(Number.isFinite);
    const codes = d.codes.length ? d.codes : [3];
    const representative = codes.reduce((best, code) => weatherSeverity(code) > weatherSeverity(best) ? code : best, codes[0]);

    daily.time.push(date);
    daily.weather_code.push(representative);
    daily.temperature_2m_max.push(validTemps.length ? Math.max(...validTemps) : null);
    daily.temperature_2m_min.push(validTemps.length ? Math.min(...validTemps) : null);
    daily.precipitation_probability_max.push(d.pops.length ? Math.max(...d.pops) : 0);
  }

  return {
    provider: "MET Norway",
    current: firstCurrent || {},
    hourly,
    daily
  };
}

async function fetchMetNoWeather() {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${LATITUDE}&lon=${LONGITUDE}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ottawa-trmnl-weather/8.0 contact: trmnl-weather",
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`MET Norway returned HTTP ${response.status}`);
  }

  return metNoToWeather(await response.json());
}

async function fetchOpenMeteoWeather() {
  const response = await fetch(weatherRequestUrl(), {
    headers: {
      "User-Agent": "ottawa-trmnl-weather/8.0",
      "Accept": "application/json"
    }
  });

  if (response.status === 429) {
    openMeteoBlockedUntil = Date.now() + 30 * 60 * 1000;
    throw new Error("Open-Meteo returned HTTP 429");
  }

  if (!response.ok) {
    throw new Error(`Open-Meteo returned HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data || !data.current || !data.hourly || !data.daily) {
    throw new Error("Open-Meteo response was missing required weather fields");
  }

  data.provider = "Open-Meteo";
  return data;
}

async function fetchWeatherFromSource() {
  const errors = [];

  if (Date.now() >= openMeteoBlockedUntil) {
    try {
      return await fetchOpenMeteoWeather();
    } catch (error) {
      errors.push(error?.message || String(error));
      console.warn("Primary weather source unavailable:", errors[errors.length - 1]);
    }
  } else {
    errors.push("Open-Meteo temporarily in 429 cooldown");
  }

  try {
    const fallback = await fetchMetNoWeather();
    console.log("Using MET Norway weather fallback");
    return fallback;
  } catch (error) {
    errors.push(error?.message || String(error));
  }

  throw new Error(`All weather sources failed: ${errors.join("; ")}`);
}

function startWeatherRefresh() {
  if (weatherFetchInFlight) return weatherFetchInFlight;

  weatherFetchInFlight = fetchWeatherFromSource()
    .then((data) => {
      weatherCache = { data, fetchedAt: Date.now() };
      lastWeatherError = null;
      lastWeatherProvider = data?.provider || "unknown";
      console.log(`Weather cache refreshed successfully via ${lastWeatherProvider}`);
      return data;
    })
    .catch((error) => {
      lastWeatherError = error?.message || String(error);
      console.error("Weather refresh failed:", lastWeatherError);
      throw error;
    })
    .finally(() => {
      weatherFetchInFlight = null;
    });

  return weatherFetchInFlight;
}

function softTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`Weather request still pending after ${Math.round(timeoutMs / 1000)} seconds`)), timeoutMs);
      if (typeof timer.unref === "function") timer.unref();
    })
  ]);
}

async function getWeather() {
  const age = weatherCache.data ? Date.now() - weatherCache.fetchedAt : Infinity;

  if (weatherCache.data && age < WEATHER_CACHE_TTL_MS) {
    return { data: weatherCache.data, stale: false };
  }

  const refresh = startWeatherRefresh();

  if (weatherCache.data) {
    // Never make TRMNL wait on a refresh when we already have usable data.
    refresh.catch(() => {});
    return {
      data: weatherCache.data,
      stale: age >= WEATHER_CACHE_TTL_MS,
      very_stale: age >= WEATHER_STALE_MAX_MS
    };
  }

  // Cold start only: wait longer for the first successful weather fetch.
  const data = await softTimeout(refresh, 35000);
  return { data, stale: false };
}

async function makePayload() {
  const now = localParts();
  const today = isoDate(now);
  const tomorrow = addCalendarDays(today, 1);
  const isWeekend = now.weekday === "Saturday" || now.weekday === "Sunday";

  let mode = "day";
  if (now.hour >= 18) mode = "evening";
  else if (now.hour >= 8 && now.hour < 9) mode = "calendar";
  else if (!isWeekend && now.hour >= 7 && now.hour < 8) mode = "school";

  const weatherResult = await getWeather();
  const weather = weatherResult.data;

  let allCalendarEvents = [];
  if (mode === "calendar" || (now.hour >= 16 && now.hour < 19)) {
    try {
      allCalendarEvents = await fetchCalendars(today);
    } catch (error) {
      console.error("Calendar fetch failed:", error.message);
      allCalendarEvents = [];
    }
  }

  const calendarResult = displayCalendarEvents(allCalendarEvents);

  const rows = hourlyRows(weather);
  const focusDate = mode === "evening" ? tomorrow : today;
  const focusDaily = dailyRow(weather, focusDate);
  const currentWeather = weather.current || {};

  const current = {
    temp: roundTemperature(currentWeather.temperature_2m) ?? "--",
    feels: roundTemperature(currentWeather.apparent_temperature) ?? "--",
    condition: weatherDescription(currentWeather.weather_code),
    icon: weatherIcon(currentWeather.weather_code)
  };

  let raincoat;
  if (mode === "evening") {
    raincoat = raincoatForecast(rows, tomorrow, 6, 15);
  } else {
    raincoat = raincoatForecast(rows, today, Math.max(now.hour, 6), 15);
  }

  const clareWork = buildClareWorkSummary(allCalendarEvents, rows, today, tomorrow, now.hour);

  const payload = {
    weather_ok: true,
    weather_source: weather?.provider || lastWeatherProvider || "unknown",
    stale: Boolean(weatherResult.stale),
    location: "Ottawa",
    timezone: TIMEZONE,
    mode,
    mode_title:
      mode === "evening" ? "TOMORROW" :
      mode === "school" ? "SCHOOL MORNING" :
      "TODAY",
    date_label: `${now.weekday.toUpperCase()} · ${formatTodayDate(now).toUpperCase()}`,
    current,
    focus: {
      date: focusDate,
      high: focusDaily.high ?? "--",
      low: focusDaily.low ?? "--",
      condition: focusDaily.description || "Forecast unavailable",
      icon: weatherIcon(focusDaily.code),
      morning_temp: findMorningTemperature(rows, mode === "evening" ? tomorrow : today) ?? "--"
    },
    raincoat: {
      needed: Boolean(raincoat && raincoat.needed),
      title:
        mode === "evening"
          ? raincoat?.needed ? "RAINCOAT TOMORROW" : "NO RAINCOAT NEEDED"
          : raincoat?.needed ? "RAINCOAT TODAY" : "NO RAINCOAT NEEDED",
      message: raincoat?.message || "Rain forecast unavailable"
    },
    hours: buildDisplayHours(rows, mode, today, tomorrow, now.hour, Boolean(clareWork && clareWork.active)),
    calendar: {
      visible: mode === "calendar",
      has_events: calendarResult.length > 0,
      events: calendarResult,
      empty_message: ICLOUD_CALENDAR_URLS.length > 0 ? "Nothing on these calendars today" : "Calendar not configured"
    },
    clare_work: clareWork,
    joke: selectJoke(today),
    updated: formatGeneratedTime(now),
    status_message: ""
  };

  return payload;
}

function makeFallbackPayload(error) {
  const now = localParts();
  const today = isoDate(now);
  const tomorrow = addCalendarDays(today, 1);
  const isWeekend = now.weekday === "Saturday" || now.weekday === "Sunday";

  let mode = "day";
  if (now.hour >= 18) mode = "evening";
  else if (now.hour >= 8 && now.hour < 9) mode = "calendar";
  else if (!isWeekend && now.hour >= 7 && now.hour < 8) mode = "school";

  return {
    weather_ok: false,
    weather_source: lastWeatherProvider || "unavailable",
    stale: false,
    location: "Ottawa",
    timezone: TIMEZONE,
    mode,
    mode_title: mode === "evening" ? "TOMORROW" : mode === "school" ? "SCHOOL MORNING" : "TODAY",
    date_label: `${now.weekday.toUpperCase()} · ${formatTodayDate(now).toUpperCase()}`,
    current: { temp: "--", feels: "--", condition: "Weather unavailable", icon: "!" },
    focus: {
      date: mode === "evening" ? tomorrow : today,
      high: "--",
      low: "--",
      condition: "Forecast unavailable",
      icon: "!",
      morning_temp: "--"
    },
    raincoat: {
      needed: false,
      title: "WEATHER TEMPORARILY UNAVAILABLE",
      message: "Trying again automatically"
    },
    hours: [],
    calendar: {
      visible: mode === "calendar",
      has_events: false,
      events: [],
      empty_message: "Calendar will return when weather service reconnects"
    },
    clare_work: { active: false },
    joke: selectJoke(today),
    updated: formatGeneratedTime(now),
    status_message: error?.message || "Weather service unavailable"
  };
}

function sendJson(response, statusCode, object) {
  const body = JSON.stringify(object);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "public, max-age=300"
  });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        service: "ottawa-trmnl-weather",
        version: "8.0.0",
        calendar_feeds_configured: ICLOUD_CALENDAR_URLS.length,
        has_cached_weather: Boolean(weatherCache.data),
        weather_cache_age_seconds: weatherCache.data ? Math.round((Date.now() - weatherCache.fetchedAt) / 1000) : null,
        weather_refresh_in_flight: Boolean(weatherFetchInFlight),
        last_weather_error: lastWeatherError,
        last_weather_provider: lastWeatherProvider,
        open_meteo_cooldown_seconds: Math.max(0, Math.round((openMeteoBlockedUntil - Date.now()) / 1000))
      });
      return;
    }

    if (url.pathname === "/" || url.pathname === "/weather") {
      try {
        sendJson(response, 200, await makePayload());
      } catch (error) {
        console.error("Weather payload failed:", error);
        sendJson(response, 200, makeFallbackPayload(error));
      }
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Weather service failed", detail: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Ottawa TRMNL weather v8 running on port ${PORT}`);
  startWeatherRefresh().catch(() => {});
});
