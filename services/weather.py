import requests
import time
from collections import OrderedDict


# ==========================================
# API CONFIGURATION
# ==========================================

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"

WEATHER_URL = "https://api.open-meteo.com/v1/forecast"


# ==========================================
# CACHE CONFIGURATION
# ==========================================

WEATHER_CACHE_DURATION = 300       # 5 minutes
CITY_CACHE_DURATION = 600          # 10 minutes
CACHE_MAX_ENTRIES = 500

weather_cache = OrderedDict()
city_cache = OrderedDict()


# ==========================================
# CACHE HELPER FUNCTIONS
# ==========================================

def get_cached_data(cache, key, duration):

    cached = cache.get(key)

    if cached is None:
        return None

    if time.time() - cached["timestamp"] > duration:

        cache.pop(key, None)

        return None

    cache.move_to_end(key)
    return cached["data"]


def save_cached_data(cache, key, data):

    cache[key] = {
        "timestamp": time.time(),
        "data": data
    }
    cache.move_to_end(key)
    while len(cache) > CACHE_MAX_ENTRIES:
        cache.popitem(last=False)


# ==========================================
# 1. GET WEATHER INFORMATION
# ==========================================

def get_weather(city):

    city = city.strip()

    if not city:
        return None

    cache_key = city.lower()

    # Check weather cache first

    cached_data = get_cached_data(
        weather_cache,
        cache_key,
        WEATHER_CACHE_DURATION
    )

    if cached_data is not None:

        return cached_data

    # --------------------------------------
    # STEP 1: FIND CITY COORDINATES
    # --------------------------------------

    geo_data = _search_locations(city, count=20, country_code="IN")

    # Prefer an Indian match, but preserve worldwide search if India has none.
    if not geo_data.get("results"):
        geo_data = _search_locations(city, count=20)

    if not geo_data.get("results"):

        return None

    location = geo_data["results"][0]

    return _get_weather_for_coordinates(
        location["latitude"],
        location["longitude"],
        location["name"],
        location.get("country", ""),
        location.get("admin1", ""),
        cache_key
    )


def _search_locations(name, count, country_code=None):

    params = {
        "name": name,
        "count": count,
        "language": "en",
        "format": "json"
    }
    if country_code:
        params["countryCode"] = country_code

    response = requests.get(GEOCODING_URL, params=params, timeout=10)
    response.raise_for_status()
    return response.json()


def get_weather_by_coordinates(latitude, longitude, city_name="Current location", country="", admin1=""):

    cache_key = f"coordinates:{latitude:.3f},{longitude:.3f}:{city_name.lower()}:{admin1.lower()}"
    return _get_weather_for_coordinates(
        latitude,
        longitude,
        city_name,
        country,
        admin1,
        cache_key
    )


def _get_weather_for_coordinates(latitude, longitude, city_name, country, admin1, cache_key):

    cached_data = get_cached_data(
        weather_cache,
        cache_key,
        WEATHER_CACHE_DURATION
    )

    if cached_data is not None:
        return cached_data

    # --------------------------------------
    # STEP 2: REQUEST WEATHER INFORMATION
    # --------------------------------------

    weather_params = {

        "latitude": latitude,

        "longitude": longitude,

        "current": [

            "temperature_2m",
            "relative_humidity_2m",
            "apparent_temperature",
            "is_day",
            "precipitation",
            "weather_code",
            "cloud_cover",
            "pressure_msl",
            "wind_speed_10m"

        ],

        "hourly": [

            "temperature_2m",
            "relative_humidity_2m",
            "precipitation_probability",
            "weather_code",
            "wind_speed_10m",
            "visibility"

        ],

        "daily": [

            "weather_code",
            "temperature_2m_max",
            "temperature_2m_min",
            "sunrise",
            "sunset",
            "precipitation_probability_max"

        ],

        "timezone": "auto",

        "cell_selection": "nearest",

        "forecast_days": 7

    }

    weather_response = requests.get(

        WEATHER_URL,
        params=weather_params,
        timeout=15

    )

    weather_response.raise_for_status()

    weather_data = weather_response.json()

    # --------------------------------------
    # STEP 3: COMBINE LOCATION AND WEATHER
    # --------------------------------------

    result = {

        "location": {

            "city": city_name,

            "country": country,

            "admin1": admin1,

            "latitude": latitude,

            "longitude": longitude

        },

        "weather": weather_data

    }

    # Save result in cache

    save_cached_data(

        weather_cache,
        cache_key,
        result

    )

    return result


# ==========================================
# 2. SEARCH CITY SUGGESTIONS
# ==========================================

def search_cities(city):

    city = city.strip()

    if len(city) < 2:

        return []

    cache_key = city.lower()

    # Check suggestion cache

    cached_data = get_cached_data(

        city_cache,
        cache_key,
        CITY_CACHE_DURATION

    )

    if cached_data is not None:

        return cached_data

    # --------------------------------------
    # REQUEST CITY SUGGESTIONS
    # --------------------------------------

    data = _search_locations(city, count=100)

    results = []

    # --------------------------------------
    # PROCESS CITY RESULTS
    # --------------------------------------

    for item in data.get("results", []):

        results.append({

            "name": item["name"],

            "country": item.get("country", ""),

            "country_code": item.get("country_code", ""),

            "admin1": item.get("admin1", ""),

            "latitude": item["latitude"],

            "longitude": item["longitude"]

        })

    # Prioritize India, then keep international matches available.
    results.sort(key=lambda item: item["country_code"] != "IN")
    results = results[:20]

    # Save suggestions in cache

    save_cached_data(

        city_cache,

        cache_key,

        results

    )

    return results
