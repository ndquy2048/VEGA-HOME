"""Constants for the VEGA HOME custom integration."""
DOMAIN = "vega_home"
NAME = "VEGA HOME"
VERSION = "1.0.1"
PANEL_PATH = "vega-home"
PANEL_NAME = "vega-home"
ASSET_PATH = "/vega_home_static"
CACHE_TAG = "v101c1"
PANEL_MODULE = f"{ASSET_PATH}/vega-panel.js?v={CACHE_TAG}"
STARTUP_MODULE = f"{ASSET_PATH}/vega-startup.js?v={CACHE_TAG}"
MAX_CONFIG_BYTES = 1024 * 1024
MAX_ROOMS = 100
