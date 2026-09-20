import http from "node:http";

const PORT = Number(process.env.PORT || 3000);
const LATITUDE = 45.4215;
const LONGITUDE = -75.6972;
const TIMEZONE = "America/Toronto";
const RAIN_PROBABILITY_THRESHOLD = 40;
const RAIN_MM_THRESHOLD = 0.2;

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
  ["What do you call a dinosaur that is sleeping?", "A dino-snore."],
  ["Why did the golfer bring two pairs of pants?", "In case he got a hole in one."],
  ["What do elves learn in school?", "The elf-abet."],
  ["Why did the tomato turn red?", "Because it saw the salad dressing."],
  ["What do you call a boomerang that won't come back?", "A stick."],
  ["Why don't eggs tell jokes?", "They might crack each other up."],
  ["What did one plate say to the other plate?", "Dinner is on me."],
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
  ["Why did the orange stop rolling?", "Because it ran out of juice."],
  ["How do you organize a space party?", "You planet."],
  ["What do you call a duck that gets good grades?", "A wise quacker."],
  ["What did one volcano say to the other?", "I lava you."],
  ["Why couldn't the leopard play hide-and-seek?", "Because it was always spotted."],
  ["What kind of room has no doors or windows?", "A mushroom."],
  ["Why did the chicken join a band?", "Because it had the drumsticks."],
  ["What do you call a cow that plays an instrument?", "A moo-sician."],
  ["Why do bees have sticky hair?", "Because they use honeycombs."],
  ["What kind of key opens a banana?", "A monkey."],
  ["What is a cat's favourite colour?", "Purrr-ple."],
  ["Why did the mushroom get invited to the party?", "Because he was a fungi."],
  ["Why did the music teacher need a ladder?", "To reach the high notes."],
  ["What do you call a train carrying bubble gum?", "A chew-chew train."],
  ["What did the janitor say when he jumped out of the closet?", "Supplies!"],
  ["Why do seagulls fly over the sea?", "Because if they flew over the bay they'd be bagels."],
  ["What do you call two birds in love?", "Tweethearts."],
  ["Why did the clock get sent to the principal?", "It kept tocking."],
  ["What do you call a rabbit with fleas?", "Bugs Bunny."],
  ["Why did the kid bring a ladder to school?", "Because she wanted to go to high school."],
  ["What did the grape do when it got stepped on?", "Nothing. It just let out a little wine."],
  ["What do you call a fish wearing a bow tie?", "Sofishticated."],
  ["What do you call a funny mountain?", "Hill-arious."],
  ["What is orange and sounds like a parrot?", "A carrot."],
  ["Why did the cow cross the road?", "To get to the udder side."],
  ["What do you call a snail on a ship?", "A snailor."],
  ["What did one hat say to the other?", "You stay here. I'll go on ahead."],
  ["Why are elevator jokes so good?", "They work on many levels."],
  ["What did the paper say to the pencil?", "Write on!"],
  ["What kind of button can't you unbutton?", "A belly button."],
  ["How does the moon cut its hair?", "Eclipse it."],
  ["What is a tornado's favourite game?", "Twister."],
  ["What kind of lion never roars?", "A dandelion."],
  ["Why do pancakes always win at baseball?", "They have the best batter."],
  ["What do you call a group of musical whales?", "An orca-stra."],
  ["Why was the computer cold?", "It left its Windows open."],
  ["How does a penguin build its house?", "Igloos it together."],
  ["Why did the robot go on vacation?", "It needed to recharge."],
  ["Why are spiders great at computers?", "They're good at websites."],
  ["What do you call a lazy kangaroo?", "A pouch potato."],
  ["What did the traffic light say to the car?", "Don't look, I'm changing."],
  ["What kind of snacks do computers eat?", "Microchips."],
  ["Why did the frog take the bus?", "His car got toad away."]
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
    formatter.formatToParts(date)
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
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function dayOfYearIndex(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const start = Date.UTC(year, 0, 1);
  const current = Date.UTC(year, month - 1, day);
  return Math.floor((current - start) / 86400000);
}

function roundTemperature(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function formatHour(hour) {
  const h = ((Number(hour) % 24) + 24) % 24;
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  return h > 12 ? `${h - 12} PM` : `${h} AM`;
}

function formatGeneratedTime(parts) {
  const hour12 = parts.hour === 0 ? 12 : parts.hour > 12 ? parts.hour - 12 : parts.hour;
  return `${hour12}:${pad2(parts.minute)} ${parts.hour >= 12 ? "PM" : "AM"}`;
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
  if (c === 0 || c === 1) return "SUN";
  if (c === 2) return "PARTLY";
  if (c === 3) return "CLOUD";
  if ([45, 48].includes(c)) return "FOG";
  if ([71, 73, 75, 77, 85, 86].includes(c)) return "SNOW";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(c)) return "RAIN";
  return "CLOUD";
}

function isRainCode(code) {
  return [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(Number(code));
}

function hourlyRows(weather) {
  const result = [];
  for (let i = 0; i < weather.hourly.time.length; i += 1) {
    const match = weather.hourly.time[i].match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):/);
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
      code: Number(weather.hourly.weather_code[i])
    });
  }
  return result;
}

function dailyRow(weather, targetDate) {
  const index = weather.daily.time.findIndex((date) => date === targetDate);
  if (index < 0) return { high: null, low: null, code: 0, description: "Forecast unavailable" };
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
    const measurable = row.rain + row.showers >= RAIN_MM_THRESHOLD;
    return measurable || (row.probability >= RAIN_PROBABILITY_THRESHOLD && isRainCode(row.code));
  });

  if (!rainy.length) return { needed: false, message: "No rain expected before 3 PM" };

  const first = rainy[0];
  let last = first;
  for (let i = 1; i < rainy.length; i += 1) {
    if (rainy[i].hour === last.hour + 1) last = rainy[i];
    else break;
  }

  const timing = first.hour === last.hour
    ? `around ${formatHour(first.hour)}`
    : `${formatHour(first.hour)}-${formatHour(last.hour + 1)}`;

  return { needed: true, message: `Rain likely ${timing}` };
}

function buildDisplayHours(rows, mode, today, tomorrow, currentHour) {
  let chosen = [];
  if (mode === "school") {
    chosen = rows.filter((row) => row.date === today && row.hour >= 7 && row.hour <= 14);
  } else if (mode === "evening") {
    chosen = rows.filter((row) => row.date === tomorrow && row.hour >= 7 && row.hour <= 14);
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
  return seven?.temp ?? eight?.temp ?? null;
}

function weekdayForDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("en-CA", { weekday: "long", timeZone: "UTC" }).format(date);
}

function selectJoke(today) {
  const [question, answer] = JOKES[dayOfYearIndex(today) % JOKES.length];
  return { question, answer };
}

async function fetchWeather() {
  const params = new URLSearchParams({
    latitude: String(LATITUDE),
    longitude: String(LONGITUDE),
    timezone: TIMEZONE,
    forecast_days: "3",
    current: "temperature_2m,apparent_temperature,weather_code,precipitation,rain,showers",
    hourly: "temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    headers: { "User-Agent": "ottawa-trmnl-weather/1.0" }
  });

  if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}`);
  return response.json();
}

async function makePayload() {
  const now = localParts();
  const today = isoDate(now);
  const tomorrow = addCalendarDays(today, 1);
  const mode = now.hour >= 18 ? "evening" : now.hour >= 7 && now.hour < 8 ? "school" : "day";

  const weather = await fetchWeather();
  const rows = hourlyRows(weather);
  const focusDate = mode === "evening" ? tomorrow : today;
  const focusDaily = dailyRow(weather, focusDate);

  const raincoat = mode === "evening"
    ? raincoatForecast(rows, tomorrow, 6, 15)
    : raincoatForecast(rows, today, Math.max(now.hour, 6), 15);

  return {
    location: "Ottawa",
    mode,
    mode_title: mode === "evening" ? "TOMORROW" : mode === "school" ? "SCHOOL MORNING" : "TODAY",
    date_label: mode === "evening" ? `${weekdayForDate(tomorrow).toUpperCase()} - TOMORROW` : `${now.weekday.toUpperCase()} - TODAY`,
    current: {
      temp: roundTemperature(weather.current.temperature_2m),
      feels: roundTemperature(weather.current.apparent_temperature),
      condition: weatherDescription(weather.current.weather_code),
      icon: weatherIcon(weather.current.weather_code)
    },
    focus: {
      date: focusDate,
      high: focusDaily.high,
      low: focusDaily.low,
      condition: focusDaily.description,
      icon: weatherIcon(focusDaily.code),
      morning_temp: findMorningTemperature(rows, focusDate)
    },
    raincoat: {
      needed: raincoat.needed,
      title: mode === "evening"
        ? (raincoat.needed ? "RAINCOAT TOMORROW" : "NO RAINCOAT NEEDED")
        : (raincoat.needed ? "RAINCOAT TODAY" : "NO RAINCOAT NEEDED"),
      message: raincoat.message
    },
    hours: buildDisplayHours(rows, mode, today, tomorrow, now.hour),
    joke: selectJoke(today),
    updated: formatGeneratedTime(now)
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
      return sendJson(response, 200, { ok: true, service: "ottawa-trmnl-weather" });
    }
    if (url.pathname === "/" || url.pathname === "/weather") {
      return sendJson(response, 200, await makePayload());
    }
    return sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: "Weather service failed", detail: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Ottawa TRMNL weather running on port ${PORT}`);
});
