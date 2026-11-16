// ============================================
// WEATHERLY - WEATHER FORECASTING APPLICATION
// Optimized JavaScript
// ============================================

// 1. DOM ELEMENTS
const dateElement = document.getElementById("currentDate");
const cityInput = document.getElementById("cityInput");
const searchBtn = document.getElementById("searchBtn");
const searchMessage = document.getElementById("searchMessage");
const suggestionsBox = document.getElementById("suggestions");

// 2. CONFIGURATION
const WEATHER_CACHE_TIME = 5 * 60 * 1000;
const CITY_CACHE_TIME = 10 * 60 * 1000;
const SUGGESTION_DELAY = 45;
const SEARCH_HISTORY_KEY = "weatherly-recent-searches";
const SEARCH_HISTORY_LIMIT = 8;

// 3. CACHES
const weatherCache = new Map();
const cityCache = new Map();
let weatherController = null;
let suggestionController = null;
let suggestionTimer = null;
let selectedIndex = -1;
let citySuggestions = [];

// 4. CURRENT DATE
if (dateElement) {
    dateElement.textContent = new Date().toLocaleDateString(
        "en-IN",
        {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric"
        }
    );
}

// 5. WEATHER CONDITIONS

function getWeatherInfo(code) {
    const conditions = {
        0: ["☀️", "Clear Sky"],
        1: ["🌤️", "Mainly Clear"],
        2: ["⛅", "Partly Cloudy"],
        3: ["☁️", "Overcast"],
        45: ["🌫️", "Fog"],
        48: ["🌫️", "Rime Fog"],
        51: ["🌦️", "Light Drizzle"],
        53: ["🌦️", "Moderate Drizzle"],
        55: ["🌧️", "Heavy Drizzle"],
        56: ["🌧️", "Freezing Drizzle"],
        57: ["🌧️", "Heavy Freezing Drizzle"],
        61: ["🌧️", "Light Rain"],
        63: ["🌧️", "Moderate Rain"],
        65: ["🌧️", "Heavy Rain"],
        66: ["🌨️", "Freezing Rain"],
        67: ["🌨️", "Heavy Freezing Rain"],
        71: ["🌨️", "Light Snow"],
        73: ["❄️", "Moderate Snow"],
        75: ["❄️", "Heavy Snow"],
        77: ["❄️", "Snow Grains"],
        80: ["🌦️", "Rain Showers"],
        81: ["🌧️", "Moderate Showers"],
        82: ["⛈️", "Heavy Showers"],
        85: ["🌨️", "Snow Showers"],
        86: ["❄️", "Heavy Snow"],
        95: ["⛈️", "Thunderstorm"],
        96: ["⛈️", "Thunderstorm with Hail"],
        99: ["⛈️", "Heavy Thunderstorm"]
    };
    return conditions[code] || ["🌡️", "Unknown"];
}

// 6. MESSAGE HANDLING

function showMessage(message) {
    if (!searchMessage) return;
    searchMessage.replaceChildren();
    if (!message) {
        searchMessage.hidden = true;
        searchMessage.className = "status-message";
        searchMessage.setAttribute("role", "status");
        return;
    }
    searchMessage.hidden = false;
    const normalized = message.toLowerCase();
    const isLoading = /fetching|getting|finding|estimating/.test(normalized);
    const isError = /not found|unavailable|denied|couldn't|unable|timed out|failed|error|valid city|please enter/.test(normalized);
    const type = isLoading ? "loading" : isError ? "error" : "info";
    searchMessage.className = `status-message status-${type}`;
    searchMessage.setAttribute("role", isError ? "alert" : "status");
    const icon = document.createElement("span");
    icon.className = isLoading ? "status-spinner" : "status-icon";
    icon.setAttribute("aria-hidden", "true");
    if (!isLoading) icon.textContent = isError ? "!" : "i";
    const content = document.createElement("span");
    content.className = "status-content";
    const title = document.createElement("strong");
    const detail = document.createElement("span");
    if (message === "City not found.") {
        title.textContent = "We couldn't find that place";
        detail.textContent = "Check the spelling, add the state, or choose a nearby suggestion.";
    } else if (normalized.includes("valid city name")) {
        title.textContent = "Enter a place to search";
        detail.textContent = "Type at least two letters for a city, town, or village.";
    } else if (isLoading) {
        title.textContent = message.includes("location") || message.includes("area")
            ? "Finding your local weather"
            : "Loading weather";
        detail.textContent = message;
    } else if (isError) {
        title.textContent = "We couldn't load the weather";
        detail.textContent = message;
    } else {
        title.textContent = "Location update";
        detail.textContent = message;
    }
    content.append(title, detail);
    searchMessage.append(icon, content);
}

function setSearchLoading(isLoading) {
    if (!searchBtn) return;
    searchBtn.disabled = isLoading;
    searchBtn.innerHTML = isLoading
        ? '<span class="button-loader" aria-hidden="true"></span> Searching'
        : "Search";
}

function setDashboardLoading(isLoading) {
    document.body.classList.toggle("weather-loading", isLoading);
    document.querySelectorAll(
        ".current-weather, .stats-grid, .forecast-section"
    ).forEach(element => element.classList.toggle("weather-updating", isLoading));
}

function showSuggestionsLoading(message = "Searching cities…") {
    if (!suggestionsBox) return;
    suggestionsBox.textContent = "";
    const status = document.createElement("div");
    status.className = "suggestions-loading";
    status.setAttribute("role", "status");
    status.textContent = message;
    suggestionsBox.appendChild(status);
    suggestionsBox.style.display = "block";
    cityInput?.setAttribute("aria-expanded", "true");
    cityInput?.removeAttribute("aria-activedescendant");
}

// 7. CACHE HELPER

function getValidCache(cache, key, duration) {
    const item = cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > duration) {
        cache.delete(key);
        return null;
    }
    return item.data;
}

function saveCache(cache, key, data) {
    cache.set(key, {
        data: data,
        timestamp: Date.now()
    });
    while (cache.size > 100) {
        cache.delete(cache.keys().next().value);
    }
}

function getSearchHistory() {
    try {
        const history = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]");
        return Array.isArray(history) ? history.filter(item =>
            item && typeof item.name === "string" &&
            Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
        ).slice(0, SEARCH_HISTORY_LIMIT) : [];
    } catch {
        return [];
    }
}

function saveSearchHistory(location) {
    if (!location || !location.city ||
        !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return;
    const entry = {
        name: location.city,
        country: location.country || "",
        admin1: location.admin1 || "",
        latitude: location.latitude,
        longitude: location.longitude
    };
    const key = `${entry.name.toLowerCase()}|${entry.country.toLowerCase()}`;
    const history = getSearchHistory().filter(item =>
        `${item.name.toLowerCase()}|${(item.country || "").toLowerCase()}` !== key
    );
    history.unshift(entry);
    try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, SEARCH_HISTORY_LIMIT)));
    } catch {
        // Browsers can disable local storage; search still works without history.
    }
}

function showRecentSearches() {
    const history = getSearchHistory();
    displaySuggestions(history, "Recent searches");
}

// 8. SEARCH WEATHER

async function searchWeather(city, coordinates = null) {
    city = city.trim();
    if (city.length < 2) {
        showMessage("Please enter a valid city name.");
        return;
    }
    const cacheKey = coordinates
        ? `coordinates:${coordinates.latitude.toFixed(3)},${coordinates.longitude.toFixed(3)}:${city.toLowerCase()}`
        : city.toLowerCase();
    // Cancel previous weather request
    if (weatherController) {
        weatherController.abort();
    }
    weatherController = new AbortController();
    const controller = weatherController;
    setSearchLoading(true);
    showMessage("Fetching weather...");
    setDashboardLoading(true);
    try {
        let data = getValidCache(
            weatherCache,
            cacheKey,
            WEATHER_CACHE_TIME
        );
        // Fetch only if cache is unavailable
        if (!data) {
            const query = coordinates
                ? `latitude=${encodeURIComponent(coordinates.latitude)}&longitude=${encodeURIComponent(coordinates.longitude)}&city=${encodeURIComponent(city)}&country=${encodeURIComponent(coordinates.country || "")}&admin1=${encodeURIComponent(coordinates.admin1 || "")}`
                : `city=${encodeURIComponent(city)}`;
            const response = await fetch(`/api/weather?${query}`, {
                signal: controller.signal
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                    errorData.error || "Weather request failed."
                );
            }
            data = await response.json();
            if (
                !data.location ||
                !data.weather ||
                !data.weather.current
            ) {
                throw new Error("Invalid weather data.");
            }
            saveCache(weatherCache, cacheKey, data);
        }
        // Ignore outdated requests
        if (controller !== weatherController) return;
        updateDashboard(data);
        saveSearchHistory(data.location);
        showMessage("");
    }
    catch (error) {
        if (error.name !== "AbortError") {
            console.error("Weather Error:", error);
            showMessage(error.message);
        }
    }
    finally {
    if (controller === weatherController) {
        setSearchLoading(false);
        setDashboardLoading(false);
    }
}
}

// 9. UPDATE DASHBOARD

function updateDashboard(data) {
    const location = data.location;
    const weather = data.weather;
    const current = weather.current;
    const condition = getWeatherInfo(
        current.weather_code
    );
    document.getElementById("cityName").textContent =
        [location.city, location.admin1, location.country]
            .filter(Boolean)
            .join(", ");
    document.getElementById("temperature").textContent =
        Math.round(current.temperature_2m) + "°";
    document.getElementById("conditionText").textContent =
        condition[0] + " " + condition[1];
    document.getElementById("weatherIcon").textContent =
        condition[0];
    document.getElementById("feelsLike").textContent =
        "Feels like " +
        Math.round(current.apparent_temperature) + "°";
    document.getElementById("humidity").textContent =
        current.relative_humidity_2m + "%";
    document.getElementById("windSpeed").textContent =
        current.wind_speed_10m + " km/h";
    document.getElementById("pressure").textContent =
        current.pressure_msl + " hPa";
    updateHourlyForecast(weather);
    updateWeeklyForecast(weather);
}

// 10. HOURLY FORECAST

function updateHourlyForecast(weather) {
    const hourly = weather.hourly;
    const grid = document.getElementById("hourlyGrid");
    if (!hourly || !grid) return;
    grid.innerHTML = "";
    if (
        !Array.isArray(hourly.time) ||
        !Array.isArray(hourly.temperature_2m) ||
        !Array.isArray(hourly.weather_code)
    ) return;
    let startIndex = hourly.time.findIndex(
        time => time >= weather.current.time
    );
    if (startIndex === -1) startIndex = 0;
    for (
        let i = startIndex;
        i < Math.min(startIndex + 5, hourly.time.length);
        i++
    ) {
        const [hour = "00", minute = "00"] = hourly.time[i]
            .split("T")[1]?.split(":") || [];
        // Open-Meteo returns wall-clock timestamps in the forecast location's
        // timezone without an offset. Keep those clock parts intact for display.
        const forecastTime = new Date(Date.UTC(2000, 0, 1, Number(hour), Number(minute)));
        const label = new Intl.DateTimeFormat("en-IN", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: "UTC"
        }).format(forecastTime);
        const condition = getWeatherInfo(
            hourly.weather_code[i]
        );
        const card = document.createElement("div");
        card.className = "hour-card";
        const time = document.createElement("p");
        time.textContent =
            i === startIndex ? "Now" : label;
        const icon = document.createElement("h2");
        icon.textContent = condition[0];
        const temperature = document.createElement("h3");
        temperature.textContent =
            Math.round(hourly.temperature_2m[i]) + "°";
        card.append(time, icon, temperature);
        grid.appendChild(card);
    }
    // Visibility safety check
    if (
        Array.isArray(hourly.visibility) &&
        hourly.visibility[startIndex] !== undefined
    ) {
        const visibilityElement =
            document.getElementById("visibility");
        if (visibilityElement) {
            visibilityElement.textContent =
                (hourly.visibility[startIndex] / 1000).toFixed(1)
                + " km";
        }
    }
}

// 11. WEEKLY FORECAST

function updateWeeklyForecast(weather) {
    const daily = weather.daily;
    const list = document.getElementById("weeklyList");
    if (!daily || !list) return;
    list.innerHTML = "";
    daily.time.forEach((date, index) => {
        const day = new Date(date + "T12:00:00")
            .toLocaleDateString("en-IN", {
                weekday: "long"
            });
        const condition = getWeatherInfo(
            daily.weather_code[index]
        );
        const maximum = Math.round(
            daily.temperature_2m_max[index]
        );
        const minimum = Math.round(
            daily.temperature_2m_min[index]
        );
        const row = document.createElement("div");
        const dayName = document.createElement("span");
        dayName.textContent = day;
        const icon = document.createElement("span");
        icon.textContent = condition[0];
        const temperature = document.createElement("b");
        temperature.textContent =
            maximum + "° / " + minimum + "°";
        row.append(dayName, icon, temperature);
        list.appendChild(row);
    });
}

// 12. CITY SUGGESTIONS

function hideSuggestions() {
    if (!suggestionsBox) return;
    suggestionsBox.style.display = "none";
    cityInput?.setAttribute("aria-expanded", "false");
    cityInput?.removeAttribute("aria-activedescendant");
    suggestionsBox.innerHTML = "";
    selectedIndex = -1;
    citySuggestions = [];
}

async function fetchCitySuggestions(query) {
    const key = query.toLowerCase();
    // First check exact cache
    const cached = getValidCache(
        cityCache,
        key,
        CITY_CACHE_TIME
    );
    if (cached) {
        displaySuggestions(cached);
        return;
    }
    // Try using results from a shorter cached query
    for (const [cachedKey, cachedItem] of cityCache.entries()) {
        if (
            key.startsWith(cachedKey) &&
            Date.now() - cachedItem.timestamp < CITY_CACHE_TIME
        ) {
            const filtered = cachedItem.data.filter(city =>
                city.name.toLowerCase().startsWith(key)
            );
            if (filtered.length > 0) {
                displaySuggestions(filtered);
                return;
            }
        }
    }
    // Cancel previous request
    if (suggestionController) {
        suggestionController.abort();
    }
    suggestionController = new AbortController();
    const controller = suggestionController;
    try {
        const response = await fetch(
            "/api/cities?city=" + encodeURIComponent(query),
            {
                signal: controller.signal
            }
        );
        if (!response.ok) {
            throw new Error("City search unavailable.");
        }
        const cities = await response.json();
        if (controller !== suggestionController) return;
        if (cityInput.value.trim().toLowerCase() !== key) return;
        saveCache(cityCache, key, cities);
        displaySuggestions(cities);
    }
    catch (error) {
        if (error.name !== "AbortError") {
            console.error("Suggestion Error:", error);
            if (controller === suggestionController) {
                showSuggestionsLoading("Suggestions unavailable. Try again.");
            }
        }
    }
}

// 13. DISPLAY SUGGESTIONS

function displaySuggestions(cities, heading = "") {
    if (!suggestionsBox) return;
    suggestionsBox.innerHTML = "";
    selectedIndex = -1;
    citySuggestions = cities;
    if (!cities.length) {
        hideSuggestions();
        return;
    }
    if (heading) {
        const title = document.createElement("div");
        title.className = "suggestions-heading";
        title.setAttribute("role", "presentation");
        title.textContent = heading;
        suggestionsBox.appendChild(title);
    }
    cities.forEach(function(city, index) {
        const item = document.createElement("div");
        item.className = "suggestion-item";
        item.id = `city-suggestion-${index}`;
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", "false");
        const name = document.createElement("span");
        name.textContent = "📍 " + city.name;
        const details = document.createElement("small");
        details.textContent =
            [city.admin1, city.country]
                .filter(Boolean)
                .join(", ");
        item.append(name, details);
        item.addEventListener("mousedown", function(event) {
            event.preventDefault();
            selectCity(city);
        });
        suggestionsBox.appendChild(item);
    });
    suggestionsBox.style.display = "block";
    cityInput?.setAttribute("aria-expanded", "true");
}

// 14. SELECT CITY

function selectCity(city) {
    const selectedCity = city.name;
    // Clear the search input
    cityInput.value = "";
    cityInput.blur();
    hideSuggestions();
    searchWeather(selectedCity, {
        latitude: city.latitude,
        longitude: city.longitude,
        country: city.country,
        admin1: city.admin1
    });
}

// 15. AUTOCOMPLETE INPUT
if (cityInput && suggestionsBox) {
    cityInput.addEventListener("input", function() {
        const query = cityInput.value.trim();
        clearTimeout(suggestionTimer);
        if (suggestionController) {
            suggestionController.abort();
            suggestionController = null;
        }
        if (query.length < 2) {
            if (!query) showRecentSearches();
            else hideSuggestions();
            return;
        }
        showSuggestionsLoading();
        suggestionTimer = setTimeout(function() {
            fetchCitySuggestions(query);
        }, SUGGESTION_DELAY);
    });
    cityInput.addEventListener("focus", function() {
        if (!cityInput.value.trim()) showRecentSearches();
    });
// Keyboard navigation
    cityInput.addEventListener("keydown", function(event) {
        const items = suggestionsBox.querySelectorAll(
            ".suggestion-item"
        );
        if (event.key === "Escape") {
            hideSuggestions();
            return;
        }
        if (event.key === "ArrowDown" && items.length) {
            event.preventDefault();
            selectedIndex = Math.min(
                selectedIndex + 1,
                items.length - 1
            );
        }
        else if (event.key === "ArrowUp" && items.length) {
            event.preventDefault();
            selectedIndex = Math.max(
                selectedIndex - 1,
                0
            );
        }
        else if (event.key === "Enter") {
            event.preventDefault();
            if (
                selectedIndex >= 0 &&
                citySuggestions[selectedIndex]
            ) {
                selectCity(citySuggestions[selectedIndex]);
                return;
            }
            const city = cityInput.value.trim();
            // Clear the search input
            cityInput.value = "";
            cityInput.blur();
            hideSuggestions();
            searchWeather(city);
            return;
        }
        else {
            return;
        }
        items.forEach(function(item, index) {
            item.classList.toggle(
                "selected",
                index === selectedIndex
            );
            item.setAttribute("aria-selected", String(index === selectedIndex));
        });
        if (items[selectedIndex]) {
            cityInput.setAttribute("aria-activedescendant", items[selectedIndex].id);
            items[selectedIndex].scrollIntoView({
                block: "nearest"
            });
        }
    });
}

// 16. SEARCH BUTTON
if (searchBtn && cityInput) {
    searchBtn.addEventListener("click", function() {
        const city = cityInput.value.trim();
        // Clear the search input
        cityInput.value = "";
        cityInput.blur();
        hideSuggestions();
        searchWeather(city);
    });
}

// 17. CLOSE SUGGESTIONS OUTSIDE
document.addEventListener("click", function(event) {
    if (
        !event.target.closest(".search-wrapper")
    ) {
        hideSuggestions();
    }
});

// 18. WEATHER AT THE USER'S LOCATION
async function loadLocationWeather(latitude = null, longitude = null, approximate = false) {
    if (weatherController) return;
    weatherController = new AbortController();
    const controller = weatherController;
    setSearchLoading(true);
    setDashboardLoading(true);
    showMessage(approximate
        ? "Browser location unavailable. Estimating your area…"
        : "Finding your current location…");
    try {
        let place = null;
        if (latitude === null || longitude === null) {
            const ipResponse = await fetch(
                "https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en",
                { signal: controller.signal }
            );
            if (!ipResponse.ok) throw new Error("Could not estimate your location.");
            place = await ipResponse.json();
            latitude = Number(place.latitude);
            longitude = Number(place.longitude);
        } else {
            try {
                const params = new URLSearchParams({
                    latitude: String(latitude),
                    longitude: String(longitude),
                    localityLanguage: "en"
                });
                const placeResponse = await fetch(
                    `https://api.bigdatacloud.net/data/reverse-geocode-client?${params}`,
                    { signal: controller.signal }
                );
                if (placeResponse.ok) place = await placeResponse.json();
            } catch (error) {
                if (error.name === "AbortError") throw error;
            }
        }
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            throw new Error("Couldn't determine a location. Search for a city instead.");
        }
        const city = place?.locality || place?.city || place?.principalSubdivision || "Current location";
        const country = place?.countryName || "";
        const admin1 = place?.principalSubdivision || "";
        const query = new URLSearchParams({
            latitude: String(latitude),
            longitude: String(longitude),
            city,
            country,
            admin1
        });
        showMessage("Getting weather for your nearby area…");
        const response = await fetch(`/api/weather?${query}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Weather for your area is unavailable.");
        if (controller !== weatherController) return;
        updateDashboard(data);
        showMessage(approximate ? "Showing an approximate location based on your internet connection." : "");
    } catch (error) {
        if (error.name !== "AbortError" && controller === weatherController) {
            console.error("Location Weather Error:", error);
            document.getElementById("cityName").textContent = "Location unavailable";
            document.getElementById("conditionText").textContent = "Search for a city to see weather";
            showMessage(error.message || "Couldn't load local weather. Search for a city instead.");
        }
    } finally {
        if (controller === weatherController) {
            setSearchLoading(false);
            setDashboardLoading(false);
        }
    }
}

function startLocationLookup() {
    if (weatherController) return;
    showMessage("Finding your current location…");
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            position => loadLocationWeather(
                position.coords.latitude,
                position.coords.longitude
            ),
            () => loadLocationWeather(null, null, true),
            { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
        );
    } else {
        loadLocationWeather(null, null, true);
    }
}
startLocationLookup();
