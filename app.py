import logging
import requests

from flask import Flask, render_template, request, jsonify

from services.weather import get_weather, get_weather_by_coordinates, search_cities


# ==========================================
# FLASK CONFIGURATION
# ==========================================

app = Flask(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)


# ==========================================
# HOME ROUTE
# ==========================================

@app.route("/", methods=["GET"])
def home():

    return render_template("index.html")


# ==========================================
# WEATHER API
# ==========================================

@app.route("/api/weather", methods=["GET"])
def weather():

    city = request.args.get("city", "").strip()
    latitude = request.args.get("latitude")
    longitude = request.args.get("longitude")

    if latitude is not None or longitude is not None:
        try:
            latitude = float(latitude)
            longitude = float(longitude)
            if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
                raise ValueError("Coordinates are outside valid ranges.")
        except (TypeError, ValueError):
            return jsonify({"error": "Please provide valid coordinates."}), 400
    elif len(city) < 2:
        return jsonify({"error": "Please enter a valid city name."}), 400

    try:

        location_name = city or "Current location"
        country = request.args.get("country", "")
        admin1 = request.args.get("admin1", "")
        logger.info("Weather request received for: %s", location_name)

        data = (
            get_weather_by_coordinates(latitude, longitude, location_name, country, admin1)
            if latitude is not None
            else get_weather(city)
        )

        # City not found

        if data is None:

            return jsonify({
                "error": "City not found."
            }), 404

        logger.info("Weather data retrieved for: %s", location_name)

        return jsonify(data), 200

    except requests.exceptions.Timeout:

        logger.warning("Weather API timeout for: %s", city)

        return jsonify({
            "error": "Weather service timed out. Please try again."
        }), 504

    except requests.exceptions.RequestException:

        logger.exception("Weather API request failed for: %s", city)

        return jsonify({
            "error": "Weather service is temporarily unavailable."
        }), 503

    except (ValueError, KeyError, TypeError):

        logger.exception("Invalid weather data received for: %s", city)

        return jsonify({
            "error": "Invalid weather data received."
        }), 502

    except Exception:

        logger.exception("Unexpected error while fetching weather.")

        return jsonify({
            "error": "An unexpected error occurred."
        }), 500


# ==========================================
# CITY AUTOCOMPLETE API
# ==========================================

@app.route("/api/cities", methods=["GET"])
def cities():

    city = request.args.get("city", "").strip()

    # Validate search query

    if len(city) < 2:

        return jsonify([]), 200

    try:

        logger.info("City search request: %s", city)

        results = search_cities(city)

        return jsonify(results), 200

    except requests.exceptions.Timeout:

        logger.warning("City search API timeout: %s", city)

        return jsonify({
            "error": "City search timed out."
        }), 504

    except requests.exceptions.RequestException:

        logger.exception("City search API request failed: %s", city)

        return jsonify({
            "error": "Unable to fetch city suggestions."
        }), 503

    except (ValueError, KeyError, TypeError):

        logger.exception("Invalid city search data received.")

        return jsonify({
            "error": "Invalid city data received."
        }), 502

    except Exception:

        logger.exception("Unexpected error during city search.")

        return jsonify({
            "error": "An unexpected error occurred."
        }), 500


# ==========================================
# APPLICATION ENTRY POINT
# ==========================================

if __name__ == "__main__":

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False
    )
