# Install and update VEGA HOME

VEGA HOME is a **Home Assistant custom integration**. Its integration domain is `vega_home` and its interface path is `/vega-home`.

## Prerequisites

- A working Home Assistant installation and an administrator account for initial setup.
- A Home Assistant version compatible with the integration's APIs. The minimum version is **not yet certified**.
- A recent browser or Home Assistant Companion app for the dashboard.

## Back up first

Create a Home Assistant backup before copying files, installing updates, or removing an existing integration. A new installation has its own configuration; room selections are not automatically imported from other dashboards.

## Install with Marketplace (Home Assistant 2026.11 and newer)

This procedure uses the public VEGA HOME repository.

1. Open **Settings → Marketplace** using an administrator account.
2. Accept the Marketplace warning if prompted.
3. Select **Add from link**, then paste the public repository URL: `https://github.com/ndquy2048/VEGA-HOME`.
4. Choose type **Integration** if the type is not detected automatically and confirm **Add**.
5. Open the repository page and select **Install**.
6. Follow the setup flow if Home Assistant opens it. Otherwise open **Settings → Devices & services → Add integration** and search **VEGA HOME**.
7. Open the VEGA HOME sidebar entry or go to `/vega-home`.

Marketplace installation from a link requires a **public** GitHub repository. Marketplace may ask you to authorize a GitHub connection. The repository is `https://github.com/ndquy2048/VEGA-HOME`. Marketplace requires the repository to be **public**.

## Install with HACS (older Home Assistant setups)

On supported Home Assistant installations using HACS, add the public repository as a custom **Integration** repository, install VEGA HOME, restart Home Assistant when prompted, and add the integration from **Settings → Devices & services**.

HACS compatibility and the minimum supported Home Assistant version must be tested before publication.

## Manual installation

1. Extract a clean official VEGA HOME release package.
2. Copy **only** the directory `custom_components/vega_home` to Home Assistant's configuration directory at `/config/custom_components/vega_home`.
3. Restart Home Assistant if needed for integration discovery.
4. Add **VEGA HOME** from **Settings → Devices & services → Add integration**.
5. Open `/vega-home` or the sidebar entry.

Do not replace unrelated custom integration folders. If `/vega-home` is already registered by another panel, resolve that conflict first.

## First configuration

Create rooms, assign Home Assistant entities and configure optional media, cameras, wallpapers and screen control. The dashboard respects each entity's supported capabilities. Configuration saving requires an administrator account.

The **Auto lock after** setting is per browser. **Do not use** prevents VEGA HOME's optional lock screen on that device, without turning off Home Assistant authentication.

## Update

- **Marketplace/HACS:** use the repository's update action, then restart Home Assistant when requested. Reopen the dashboard.
- **Manual:** back up Home Assistant, replace the `custom_components/vega_home` files with the published version, and restart Home Assistant. Force-reload the browser only if stale cached files remain.

## Uninstall

Remove the VEGA HOME integration from **Settings → Devices & services**. If installed through Marketplace/HACS, uninstall the repository from that manager; for manual installs, remove `custom_components/vega_home` after disabling the integration. Restart Home Assistant as prompted. Existing Home Assistant devices and their original integrations remain separate from VEGA HOME.

## Troubleshooting

See [FAQ](FAQ.md) and [security guidance](../SECURITY.md).
