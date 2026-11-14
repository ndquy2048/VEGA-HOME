"""Authenticated reads and admin-only, revision guarded configuration writes."""
from copy import deepcopy
from typing import Any
try:
    import probatio as vol
except ImportError:
    import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from .config import InvalidVegaConfig, config_revision, validate_devices
from .const import DOMAIN, VERSION
from .media_folder import InvalidMediaFolder, list_media_photos

def payload(runtime):
    return {"version": VERSION, "revision": config_revision(runtime.devices), "devices": deepcopy(runtime.devices)}

@websocket_api.websocket_command({vol.Required("type"): "vega_home/config", vol.Required("entry_id"): str})
@callback
def websocket_get_config(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    runtime = hass.data.get(DOMAIN, {}).get("entries", {}).get(msg["entry_id"])
    if runtime is None:
        connection.send_error(msg["id"], "not_loaded", "VEGA HOME is not loaded")
        return
    connection.send_result(msg["id"], payload(runtime))

@websocket_api.websocket_command({vol.Required("type"): "vega_home/config/save", vol.Required("entry_id"): str, vol.Required("revision"): str, vol.Required("devices"): dict})
@websocket_api.require_admin
@callback
def websocket_save_config(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    runtime = hass.data.get(DOMAIN, {}).get("entries", {}).get(msg["entry_id"])
    entry = hass.config_entries.async_get_entry(msg["entry_id"])
    if runtime is None or entry is None or entry.domain != DOMAIN:
        connection.send_error(msg["id"], "not_loaded", "VEGA HOME is not loaded")
        return
    if msg["revision"] != config_revision(runtime.devices):
        connection.send_error(msg["id"], "conflict", "Configuration changed. Reopen settings before saving.")
        return
    try:
        devices = validate_devices(msg["devices"], enforce_unique_rooms=True)
    except InvalidVegaConfig as err:
        connection.send_error(msg["id"], "invalid_config", str(err))
        return
    # HA can run the options listener inside async_update_entry. It must see
    # the new runtime snapshot when HA exposes the new options.
    options = {**entry.options, "devices": devices, "source": "editor"}
    previous = runtime.devices
    runtime.devices = devices
    try:
        hass.config_entries.async_update_entry(entry, options=options)
    except Exception:
        # Options may already have been set if notification failed.
        if entry.options.get("devices") != devices:
            runtime.devices = previous
        raise
    result = payload(runtime)
    hass.bus.async_fire(
        "vega_home_config_updated", {"entry_id": msg["entry_id"], "revision": result["revision"]}
    )
    connection.send_result(msg["id"], result)


@websocket_api.websocket_command({
    vol.Required("type"): "vega_home/media/folder",
    vol.Required("folder"): str,
})
@websocket_api.async_response
async def websocket_media_folder(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Return local-media photo paths; signed URLs are minted client-side on demand.

    Every caller must have an authenticated HA WebSocket. Paths are constrained
    to HA media roots and never traverse outside /media.
    """
    if not connection.user:
        connection.send_error(msg["id"], "unauthorized", "Home Assistant login required")
        return
    try:
        images = await hass.async_add_executor_job(
            list_media_photos, msg["folder"], dict(hass.config.media_dirs or {})
        )
    except InvalidMediaFolder as err:
        connection.send_error(msg["id"], "invalid_media_folder", str(err))
        return
    except OSError:
        connection.send_error(msg["id"], "media_unavailable", "Unable to read media folder")
        return
    connection.send_result(msg["id"], {"images": images})
