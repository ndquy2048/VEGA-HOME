"""Fresh setup and an optional advanced editor; no implicit migration."""
import json
try:
    import probatio as vol
except ImportError:
    import voluptuous as vol
from homeassistant import config_entries
from homeassistant.components import frontend
from homeassistant.core import callback
from homeassistant.helpers import selector
from .config import InvalidVegaConfig, empty_config, parse_config
from .const import DOMAIN, NAME, PANEL_PATH

class VegaHomeConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")
        if frontend.async_panel_exists(self.hass, PANEL_PATH):
            return self.async_abort(reason="panel_conflict")
        if user_input is not None:
            await self.async_set_unique_id(DOMAIN)
            self._abort_if_unique_id_configured()
            return self.async_create_entry(title=NAME, data={"devices": empty_config(), "source": "fresh"})
        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return VegaHomeOptionsFlow()

class VegaHomeOptionsFlow(config_entries.OptionsFlow):
    async def async_step_init(self, user_input=None):
        errors = {}
        if user_input is not None:
            try:
                devices = parse_config(user_input["config_json"])
            except InvalidVegaConfig:
                errors["base"] = "invalid_config"
            else:
                return self.async_create_entry(title="", data={"devices": devices, "source": "json"})
        current = self.config_entry.options.get("devices", self.config_entry.data["devices"])
        return self.async_show_form(
            step_id="init", errors=errors,
            data_schema=vol.Schema({vol.Required("config_json", default=(user_input or {}).get("config_json", json.dumps(current, ensure_ascii=False, indent=2))): selector.TextSelector(selector.TextSelectorConfig(multiline=True))}),
        )
