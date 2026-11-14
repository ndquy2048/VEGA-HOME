"""Validate explicitly selected rooms and entities; no bundled home profile."""
import json
import re
from copy import deepcopy
from hashlib import sha256
from typing import Any
from .const import MAX_CONFIG_BYTES, MAX_ROOMS, VERSION
from .mdi_icons import MDI_ICON_KEYS, LEGACY_ICONS, LEGACY_ROOMS

ENTITY_ID = re.compile(r"[a-z_][a-z0-9_]*\.[a-z0-9_]+\Z")

SECTIONS = {
    "devices": {"light", "switch", "fan", "climate", "media_player", "cover", "lock", "sensor", "binary_sensor"},
    "scenes": {"scene"}, "automations": {"automation"}, "cameras": {"camera"},
}

class InvalidVegaConfig(ValueError):
    """Invalid VEGA HOME configuration."""

def empty_config() -> dict[str, Any]:
    return {"version": VERSION, "rooms": [], "settings": {"music_assistant_player": "", "media_players": [], "screen_entity": ""}}

def _name(value: Any) -> None:
    if not isinstance(value, str) or not value.strip() or len(value) > 200:
        raise InvalidVegaConfig("Invalid or missing name")

def _entity(value: Any, domains: set[str]) -> None:
    if not isinstance(value, str) or not ENTITY_ID.fullmatch(value) or value.split(".")[0] not in domains:
        raise InvalidVegaConfig("Invalid entity or domain")

def validate_devices(config: Any, *, migrate_legacy: bool = False, enforce_unique_rooms: bool = False) -> dict[str, Any]:
    if not isinstance(config, dict):
        raise InvalidVegaConfig("Expected an object")
    try:
        encoded = json.dumps(config, ensure_ascii=False, allow_nan=False)
    except (TypeError, ValueError, RecursionError) as err:
        raise InvalidVegaConfig("Configuration must be finite JSON") from err
    if len(encoded.encode("utf-8")) > MAX_CONFIG_BYTES:
        raise InvalidVegaConfig("Configuration exceeds 1 MiB")
    config = deepcopy(config)
    rooms = config.get("rooms")
    if not isinstance(rooms, list) or len(rooms) > MAX_ROOMS:
        raise InvalidVegaConfig("Expected zero to 100 rooms")
    names = set()
    owners = set()
    for room in rooms:
        if not isinstance(room, dict):
            raise InvalidVegaConfig("Invalid room")
        _name(room.get("name"))
        if room["name"].strip().casefold() in names:
            raise InvalidVegaConfig("Room names must be unique")
        names.add(room["name"].strip().casefold())
        icon = room.get("icon", "mdi:home-outline")
        icon = LEGACY_ROOMS.get(icon, icon) if isinstance(icon, str) else None
        if icon not in MDI_ICON_KEYS:
            if migrate_legacy and isinstance(icon, str) and re.fullmatch(r"mdi:[a-z0-9-]{1,64}", icon):
                icon = "mdi:home-outline"
            else:
                raise InvalidVegaConfig("Invalid room icon")
        room["icon"] = icon
        for section, domains in SECTIONS.items():
            items = room.get(section, [])
            if not isinstance(items, list) or len(items) > 200:
                raise InvalidVegaConfig(f"Invalid {section}")
            seen = set()
            for item in items:
                if not isinstance(item, dict):
                    raise InvalidVegaConfig("Invalid item")
                _name(item.get("name"))
                if "icon_override" in item:
                    key = item["icon_override"]
                    key = LEGACY_ICONS.get(key, key) if isinstance(key, str) else None
                    if key not in MDI_ICON_KEYS:
                        if migrate_legacy and isinstance(key, str) and re.fullmatch(r"mdi:[a-z0-9-]{1,64}", key):
                            item.pop("icon_override", None)
                        else:
                            raise InvalidVegaConfig("Icon is not in the bundled MDI catalog")
                    else:
                        item["icon_override"] = key
                _entity(item.get("entity_id"), domains)
                if item["entity_id"] in seen:
                    raise InvalidVegaConfig("Duplicate entity in room section")
                seen.add(item["entity_id"])
                if enforce_unique_rooms and item["entity_id"] in owners:
                    raise InvalidVegaConfig("Entity may belong to only one room")
                owners.add(item["entity_id"])
                # Existing private installations may contain the old printer visual kind.
                # Preserve the former safety behavior while normalizing to a switch.
                if item.get("kind") == "printer":
                    item["kind"] = "switch"
                    item["confirm_off"] = True
                    item.setdefault("icon_override", "mdi:printer-3d-nozzle")
                if item.get("tap") == "confirm-off":
                    item["confirm_off"] = True
                    item["tap"] = "popup"
                if "confirm_off" in item and not isinstance(item["confirm_off"], bool):
                    raise InvalidVegaConfig("Invalid confirmation option")
                if "confirm_message" in item and (
                    not isinstance(item["confirm_message"], str)
                    or len(item["confirm_message"]) > 300
                    or any(ord(ch) < 32 and ch not in "\n\t" for ch in item["confirm_message"])
                ):
                    raise InvalidVegaConfig("Invalid confirmation message")
                if item.get("confirm_message"):
                    item["confirm_message"] = item["confirm_message"].strip()
                # Visual type is independent of the service contract: a switch
                # remains a binary switch even if it resembles a fan or lamp.
                switch_visual_types = {"light", "switch", "homepod", "media", "fan", "climate",
                                       "blinds", "computer", "sensor", "lock", "camera",
                                       "scene", "automation", "other"}
                kinds = {"light": {"light"}, "switch": switch_visual_types,
                         "media_player": {"homepod", "media", "computer", "other"}, "fan": {"fan"}, "climate": {"climate"},
                         "cover": {"blinds"}, "sensor": {"sensor", "computer", "other"}, "binary_sensor": {"sensor", "other"},
                         "lock": {"lock"}, "camera": {"camera"}, "scene": {"scene"}, "automation": {"automation"}}
                if "kind" in item and (not isinstance(item["kind"], str) or item["kind"] not in kinds.get(item["entity_id"].split(".")[0], set())):
                    raise InvalidVegaConfig("Invalid device type for entity domain")
                controls = item.get("extra_controls", [])
                if not isinstance(controls, list) or len(controls) > 12 or (controls and not item["entity_id"].startswith("climate.")):
                    raise InvalidVegaConfig("Invalid optional climate controls")
                control_ids = set()
                for control in controls:
                    if not isinstance(control, dict):
                        raise InvalidVegaConfig("Invalid climate control")
                    _name(control.get("name"))
                    _entity(control.get("entity_id"), {"select"})
                    if control["entity_id"] in control_ids:
                        raise InvalidVegaConfig("Duplicate climate control")
                    control_ids.add(control["entity_id"])
                vanes = item.get("vanes", {})
                if not isinstance(vanes, dict) or set(vanes) - {"horizontal", "vertical"}:
                    raise InvalidVegaConfig("Invalid vanes")
                for entity_id in vanes.values():
                    _entity(entity_id, {"select"})
                for key, allowed in (("power_entity", {"switch"}), ("signal_entity", {"sensor"})):
                    if item.get(key):
                        _entity(item[key], allowed)
    settings = config.setdefault("settings", {})
    if not isinstance(settings, dict):
        raise InvalidVegaConfig("Invalid settings")
    for key, domains in (("music_assistant_player", {"media_player"}), ("screen_entity", {"switch", "input_boolean"})):
        if settings.get(key):
            _entity(settings[key], domains)
    # Persist one shared, curated color swatch per device kind.
    # User-selected reference colors and supported saved color swatches.
    # Keep aligned with frontend/vega-icons.js.
    allowed_palette = {
        "#fbdddf", "#f9e4df", "#ca9293", "#e793aa", "#f37988", "#fa4f9e",
        "#e34f65", "#cb4367", "#e880b3", "#7a3d5c", "#aa3059", "#f42039",
        "#ae342f", "#fe612a", "#fd841c", "#ffbb7e", "#e5a87c", "#bd954d",
        "#febd01", "#fed732", "#fde962", "#dff145", "#bed901", "#c1ccbb",
        "#abb67e", "#669934", "#029551", "#37553d", "#888f63", "#b5fde5",
        "#019c98", "#3ea69b", "#85ccbe", "#7fa1a2", "#c8ebed", "#65d4e7",
        "#00aed3", "#0191da", "#005fba", "#2795ac", "#333367", "#481526",
        "#5e396f", "#af92cc", "#77406a", "#edeae1", "#dbcfb7", "#f5d193",
        "#dcc09b", "#ceb0a5", "#cdae80", "#623c25", "#e3e4e6", "#b8b4b1",
        "#746f75", "#171719", "#a48745", "#9e6c6b", "#9b9a9f", "#b17145",
        "#e5b83f", "#c9d8e4", "#b9dcd6", "#d4c9e4", "#d9d3c4", "#d8d5c7",
        "#c8dccc", "#c9d7da", "#ddd0dd", "#d5cad0", "#cfddc5", "#d9cfb9",
        "#c9d0e5", "#d3d8d8", "#e2cebc", "#bad6e0",
    }
    palette_kinds = {"light", "switch", "homepod", "media", "fan", "climate",
                     "blinds", "computer", "sensor", "lock", "camera",
                     "scene", "automation", "other"}
    colors = settings.get("kind_colors", {})
    if isinstance(colors, dict) and "printer" in colors:
        colors.setdefault("switch", colors["printer"])
        colors.pop("printer", None)
    if not isinstance(colors, dict) or set(colors) - palette_kinds or any(
        not isinstance(value, str) or value not in allowed_palette for value in colors.values()
    ):
        raise InvalidVegaConfig("Invalid device kind color palette")
    players = settings.get("media_players")
    if players is None:
        players = [settings.get("music_assistant_player")] + [d["entity_id"] for r in rooms for d in r.get("devices", []) if d["entity_id"].startswith("media_player.")]
        settings["media_players"] = list(dict.fromkeys(p for p in players if p))
    else:
        if not isinstance(players, list) or len(players) > 100:
            raise InvalidVegaConfig("Invalid monitored media players")
        for player in players:
            _entity(player, {"media_player"})
        if len(set(players)) != len(players):
            raise InvalidVegaConfig("Duplicate monitored media player")
    result = config
    result["version"] = VERSION
    result.setdefault("settings", {})
    return result

def parse_config(raw: str) -> dict[str, Any]:
    if len(raw.encode("utf-8")) > MAX_CONFIG_BYTES:
        raise InvalidVegaConfig("Configuration exceeds 1 MiB")
    try:
        value = json.loads(raw)
    except (ValueError, RecursionError) as err:
        raise InvalidVegaConfig("Invalid JSON") from err
    return validate_devices(value)

def config_revision(config: dict[str, Any]) -> str:
    return sha256(json.dumps(config, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
