# VEGA HOME

**VEGA HOME 1.0.2** is an independent smart-home dashboard for [Home Assistant](https://www.home-assistant.io/), with a visual design inspired by Apple Home. It works with devices and entities already connected to Home Assistant; **Apple Home, HomeKit and HomeKit-compatible devices are not required**.

[Installation guide](docs/INSTALLATION.md) · [FAQ](docs/FAQ.md) · [Privacy & network](docs/PRIVACY.md)

## Features

- **Apple Home–inspired interface:** A clean, familiar smart-home layout with rooms and interactive device cards.
- **Home Assistant without HomeKit:** Use VEGA HOME with Home Assistant entities; no Apple Home setup or HomeKit hardware is needed.
- **More device capabilities when available:** Access additional controls exposed by Home Assistant integrations, including functions that may not be available through HomeKit.
- **Wall-mounted control panels:** Designed for permanent touchscreen dashboards, with an optional smart lock screen and customizable background images or photo slideshows.
- **Touch-friendly controls:** Responsive buttons, sliders and popups designed for direct touch interaction.
- **Small-screen support:** Adaptive layouts for phones and compact touch displays.
- **Music and media players:** Connect to and monitor supported Home Assistant media players, view playback status, and control music; Music Assistant browsing is available when configured.

VEGA HOME is an **independent community integration**, not an official Home Assistant product and is not affiliated with Apple. It does not replace or modify the built-in Home Assistant dashboard.

## Installation

### Home Assistant 2026.11+ — Marketplace

For installation from the public VEGA HOME repository:

1. Back up your Home Assistant configuration.
2. In Home Assistant, open **Settings → Marketplace → Add from link** as an administrator.
3. Paste the URL of the published VEGA HOME GitHub repository and select the **Integration** type if prompted.
4. Open VEGA HOME in Marketplace, select **Install**, and follow the prompts.
5. Add **VEGA HOME** under **Settings → Devices & services** if setup does not open automatically.
6. Open **VEGA HOME** in the sidebar or navigate to `/vega-home`.

Repository: [https://github.com/ndquy2048/VEGA-HOME](https://github.com/ndquy2048/VEGA-HOME). Marketplace requires a **public** repository to install from a link.

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

Copyright © 2026 ndquy2048.

VEGA HOME is **open-source software licensed under the [Apache License, Version 2.0](LICENSE)** (`Apache-2.0`). The license permits personal and commercial use, modification and redistribution, subject to its terms. Please retain required copyright, license and NOTICE information when redistributing.

The VEGA / VEGA HOME names and project logos identify the original project. The Apache License does not grant trademark rights or permission to claim endorsement; see [brand and trademark information](TRADEMARKS.md).

Bundled Material Design Icons and other identified third-party resources retain their applicable licenses; see [third-party notices](THIRD_PARTY_NOTICES.md) and [NOTICE](NOTICE).
