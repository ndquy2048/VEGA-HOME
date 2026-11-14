# Privacy, local storage, and network connections

VEGA HOME runs as a Home Assistant custom integration and loads its interface from the Home Assistant instance. It uses the authenticated Home Assistant frontend and WebSocket interfaces to read states, send supported device commands and store dashboard configuration.

## Information stored by VEGA HOME

- Room/device dashboard configuration is stored with the VEGA HOME configuration entry in Home Assistant.
- Some UI preferences (for example, the optional lock-screen setting) are stored in the browser/device's local storage.
- VEGA HOME's integration is not an independent cloud account service.

## Media and camera content

VEGA HOME uses Home Assistant media and camera access paths. A helper can list **photo file paths/names** under configured local media directories for authenticated Home Assistant WebSocket users; image URLs are handled through Home Assistant's authentication mechanisms. This means file names in selected media folders may be visible to other signed-in Home Assistant users. Restrict access to private media through your Home Assistant configuration. This behavior needs a final permission review before publication.

## Optional external images

If a user explicitly chooses the remote random-wallpaper option, the browser requests images from **picsum.photos**. The remote image provider may receive ordinary request metadata (for example, network address and browser headers). Local wallpapers do not require this external service. This option may not work offline.

## Bug reports

Do not upload Home Assistant access tokens, IP addresses, precise addresses, device identifiers, full configuration backups, private media or camera feeds to public issue reports. See [Security](../SECURITY.md).

This document describes the inspected integration package. Future releases and Home Assistant versions may change behavior, so security and privacy reviews remain necessary.
