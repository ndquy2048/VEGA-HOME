# VEGA HOME releases

## 1.0.2 — iOS light popup stability

- Avoid iOS WebKit background flicker when controlling a light brightness slider by using a stable tinted modal underlay rather than sampling multiple backdrop-blur layers.
- Preserve the existing blurred-glass modal appearance for non-iOS platforms and other popup types.
- No changes to light service commands, layouts, settings, or saved configurations.
- Updated displayed version labels and frontend cache identifier to 1.0.2.

## 1.0.1 — Documentation and release metadata

- Removed the oversized logo image from the repository introduction.
- Rewrote the feature overview to clarify Apple Home-inspired styling, independence from HomeKit, touch and compact-display support, wall panels, and media player features.
- Removed the separate Vietnamese installation guide from the public repository (the VEGA HOME user interface remains multilingual).
- Updated integration version metadata, displayed version labels, and frontend cache identifier to 1.0.1.
- No device-control, popup, or dashboard behavior changes.

## 1.0.0 — Initial public release

- VEGA HOME dashboard integration for Home Assistant.
- Room-based device, media, scene, automation and camera controls.
- Configurable appearance, language and optional lock screen.
