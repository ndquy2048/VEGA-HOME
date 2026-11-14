# VEGA HOME

![VEGA HOME logo](custom_components/vega_home/brand/icon@2x.png)

**VEGA HOME 1.0.0** is a customizable smart-home dashboard inspired by Apple Home, built for [Home Assistant](https://www.home-assistant.io/). Arrange rooms and devices in a glass-style interface designed for phones, tablets, desktop browsers and touch displays.

**[Hướng dẫn tiếng Việt](docs/README.vi.md)** · [Installation guide](docs/INSTALLATION.md) · [FAQ](docs/FAQ.md) · [Privacy & network](docs/PRIVACY.md)

## Features

- Rooms and device controls based on entities already configured in Home Assistant.
- Device, scene, automation and camera views, with support dependent on entity capabilities.
- Media-player popups and optional Music Assistant browsing when configured.
- Light/dark appearance and a selection of interface languages.
- Brightness-only lights use a simple vertical slider with a separate power button; color-capable lights retain their full controls.
- Optional per-device confirmation before turning off supported power-controlled devices, with a customizable message.
- Inactive device and appearance settings close automatically after 60 seconds; unfinished device edits are discarded, while already autosaved appearance preferences remain.
- Optional lock-screen/slideshow. **Auto lock after → Do not use** disables the lock screen on the current browser/device. In that mode, Music opens the active player's regular popup instead.
- Touch-friendly layouts, including compact wall-mounted dashboards.

VEGA HOME is an **independent community integration**, not an official Home Assistant product and is not affiliated with Apple. It does not replace or modify the built-in Home Assistant dashboard.

## Installation

### Home Assistant 2026.11+ — Marketplace

Once this project has a **public GitHub repository** and has passed publication checks:

1. Back up your Home Assistant configuration.
2. In Home Assistant, open **Settings → Marketplace → Add from link** as an administrator.
3. Paste the URL of the published VEGA HOME GitHub repository and select the **Integration** type if prompted.
4. Open VEGA HOME in Marketplace, select **Install**, and follow the prompts.
5. Add **VEGA HOME** under **Settings → Devices & services** if setup does not open automatically.
6. Open **VEGA HOME** in the sidebar or navigate to `/vega-home`.

Repository: [https://github.com/ndquy2048/VEGA-HOME](https://github.com/ndquy2048/VEGA-HOME). The repository must be made **public** before Marketplace can install it from a link.

### Manual installation

1. Back up Home Assistant.
2. Copy `custom_components/vega_home` to `/config/custom_components/vega_home` on Home Assistant.
3. Restart Home Assistant if needed for the new integration to be discovered.
4. Go to **Settings → Devices & services → Add integration** and search for **VEGA HOME**.
5. Complete the setup, then open the sidebar entry or `/vega-home`.

For older Home Assistant versions that use HACS instead of the built-in Marketplace, see the [installation guide](docs/INSTALLATION.md). Compatibility with each Home Assistant version must be verified before a minimum supported version is announced.

## First use

Choose rooms and add Home Assistant entities through VEGA HOME's setup interface. To save shared integration configuration, use an administrator account. Some controls and media features only work with entities exposing the required Home Assistant services or attributes.

Auto-lock preferences are stored per browser/device. Selecting **Do not use** turns off lock-screen navigation and timers on that browser; it does not disable Home Assistant security or authentication.

## Documentation and support

- [Installation and updating](docs/INSTALLATION.md)
- [Frequently asked questions](docs/FAQ.md)
- [Privacy and external services](docs/PRIVACY.md)
- [Security reporting](SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

After public launch, report bugs in [GitHub Issues](https://github.com/ndquy2048/VEGA-HOME/issues). Please do not publish private Home Assistant configuration, access tokens, personal media, addresses, or internal network identifiers.

## License and credits

Copyright © 2026 ndquy2048. All rights reserved.

VEGA HOME is **source-available, not open-source**. The [VEGA HOME Personal Use License — Version 1.0](LICENSE) permits personal, non-commercial household use, subject to restrictions on redistribution, publishing modified versions and commercial use. GitHub users retain platform permissions to view and fork public repositories under GitHub's Terms of Service.

Bundled Material Design Icons and other identified third-party resources retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
