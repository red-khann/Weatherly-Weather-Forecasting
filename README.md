# Weatherly Weather Forecasting

Weatherly is a Flask weather dashboard that lets users search for locations, view current conditions and forecasts, and use their browser location when they grant permission.

## Features

- Current weather, hourly forecast, and seven-day forecast
- Location suggestions, with Indian locations prioritized
- Browser geolocation and nearby locality lookup
- Recent searches saved in the browser
- Loading, empty-result, and error feedback

Weather and geocoding data come from Open-Meteo. Reverse geocoding uses BigDataCloud. The app needs an internet connection for live data.

## Run locally

Requires Python 3.10 or later.

```bash
python -m venv .venv
```

Activate the virtual environment, then install the project dependencies and start Flask:

```bash
pip install -r requirements.txt
python app.py
```

Open <http://127.0.0.1:5000> in a browser. Allow location access to try the current-location feature, or search for a place manually.

## Project structure

```text
app.py                 Flask routes and application entry point
services/weather.py    Weather and location API integration
templates/index.html   Dashboard markup
static/css/style.css   Dashboard styles
static/js/script.js    Search, location, and forecast interactions
requirements.txt      Python dependencies
```

## Hosting

GitHub can store this project’s source code. GitHub Pages serves static sites and does not run the Flask/Python backend, so the complete application needs a Python-capable hosting service. Configure that service to start the Flask application with a production WSGI server and to bind to the host and port required by the provider.
