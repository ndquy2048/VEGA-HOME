"""Home Assistant integration and dashboard registration for VEGA HOME."""

import json
import logging
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Any

from homeassistant.components import frontend, panel_custom, websocket_api
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .config import InvalidVegaConfig, validate_devices
from .const import (
    ASSET_PATH,
    DOMAIN,
    PANEL_MODULE,
    PANEL_NAME,
    PANEL_PATH,
    STARTUP_MODULE,
    VERSION,
)
from .websocket import websocket_get_config, websocket_save_config, websocket_media_folder

_LOGGER = logging.getLogger(__name__)

# VEGA HOME is configured through the Home Assistant UI, not configuration.yaml.
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


@dataclass
class VegaRuntime:
    """Configuration owned by one loaded config entry."""

    devices: dict[str, Any]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register transport once, including across config entry reloads."""
    data = hass.data.setdefault(DOMAIN, {"entries": {}, "static_registered": False})
    if not data.get("websocket_registered"):
        websocket_api.async_register_command(hass, websocket_get_config)
        websocket_api.async_register_command(hass, websocket_save_config)
        websocket_api.async_register_command(hass, websocket_media_folder)
        data["websocket_registered"] = True
    return True


def _owns_panel(hass: HomeAssistant, entry_id: str) -> bool:
    panel = hass.data.get(frontend.DATA_PANELS, {}).get(PANEL_PATH)
    return bool(panel and (panel.config or {}).get("entry_id") == entry_id)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Publish assets and a custom panel without a separate server or token."""
    if frontend.async_panel_exists(hass, PANEL_PATH):
        raise ConfigEntryError(
            translation_domain=DOMAIN, translation_key="panel_conflict"
        )
    try:
        devices = validate_devices(
            entry.options.get("devices", entry.data.get("devices")), migrate_legacy=True
        )
    except InvalidVegaConfig as err:
        raise ConfigEntryError(
            translation_domain=DOMAIN, translation_key="invalid_config"
        ) from err

    data = hass.data[DOMAIN]
    # aiohttp routes live for the HA process. Register once; only non-sensitive
    # JS/CSS/icons/wallpapers are served here. Configuration is never static.
    if not data["static_registered"]:
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    ASSET_PATH, str(Path(__file__).parent / "frontend"), False
                )
            ]
        )
        data["static_registered"] = True

    runtime = VegaRuntime(devices)
    entry.runtime_data = runtime
    data["entries"][entry.entry_id] = runtime
    try:
        await panel_custom.async_register_panel(
            hass,
            frontend_url_path=PANEL_PATH,
            webcomponent_name=PANEL_NAME,
            sidebar_title="VEGA HOME",
            sidebar_icon="mdi:home-variant",
            module_url=PANEL_MODULE,
            config={
                "entry_id": entry.entry_id,
                "integration_version": VERSION,
                "config_revision": sha256(
                    json.dumps(devices, sort_keys=True, ensure_ascii=False).encode()
                ).hexdigest()[:16],
            },
            require_admin=False,
            config_panel_domain=DOMAIN,
        )
        frontend.add_extra_js_url(hass, STARTUP_MODULE)
    except Exception:
        data["entries"].pop(entry.entry_id, None)
        if _owns_panel(hass, entry.entry_id):
            frontend.async_remove_panel(hass, PANEL_PATH)
        raise

    entry.async_on_unload(entry.add_update_listener(async_options_updated))
    _LOGGER.info("Vega %s loaded with %s rooms", VERSION, len(devices["rooms"]))
    return True


async def async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload imports, while editor writes already update the live runtime."""
    runtime = hass.data.get(DOMAIN, {}).get("entries", {}).get(entry.entry_id)
    if runtime and entry.options.get("devices", entry.data.get("devices")) == runtime.devices:
        # The editor sets the runtime snapshot before notifying HA listeners.
        # Its revision event updates clients without replacing the panel.
        return
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Remove only Vega's panel, startup registration and active configuration."""
    if _owns_panel(hass, entry.entry_id):
        frontend.async_remove_panel(hass, PANEL_PATH)
    if STARTUP_MODULE in hass.data[frontend.DATA_EXTRA_MODULE_URL].urls:
        frontend.remove_extra_js_url(hass, STARTUP_MODULE)
    hass.data[DOMAIN]["entries"].pop(entry.entry_id, None)
    return True
