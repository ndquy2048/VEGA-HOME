# VEGA HOME FAQ

### I installed the files but cannot find VEGA HOME in Add integration.

Confirm the exact folder path is `/config/custom_components/vega_home`, with `manifest.json` immediately inside it. Restart Home Assistant, refresh the browser, and review Home Assistant logs if the integration fails to load.

### The panel does not appear in the sidebar.

Open **Settings → Devices & services** and confirm VEGA HOME is configured and loaded. Try `/vega-home`. Check Home Assistant logs for a panel-path conflict.

### Can I make VEGA HOME my Home Assistant dashboard?

VEGA HOME has its own panel and optional navigation settings. Your Home Assistant account and access permissions remain managed by Home Assistant. Ensure any redirect options do not interfere with your normal Home Assistant access.

### Why are some device buttons unavailable?

Controls depend on each entity's state, supported Home Assistant services and advertised features. VEGA HOME cannot force an integration or device to support a capability it lacks.

### The seek/progress control does not work for a track.

Some players and live streams do not support seeking. Try a different track or player that advertises media seek support.

### How do I turn off the VEGA HOME lock screen?

Open VEGA HOME settings and choose **Auto lock after → Do not use**. This preference is local to that browser/device. The Home Assistant login and normal security rules are unchanged.

### Why does Music open a player popup instead of the lock screen?

With the lock screen disabled, VEGA HOME opens the active device's ordinary media popup when possible. This is the intended behavior of the **Do not use** setting.

### Why are my rooms missing after a fresh installation?

A fresh install begins with a new VEGA HOME configuration. Rooms and device layout are configured within VEGA HOME; it does not automatically import layout settings from other dashboards.

### Do you collect telemetry or send my Home Assistant access token elsewhere?

VEGA HOME uses Home Assistant APIs and authentication. An optional remote wallpaper service can be contacted when you select that source. See [Privacy & network](PRIVACY.md). This is a description of the reviewed implementation, not a substitute for a full security audit.

### Where do I report a problem?

Once the repository is public, use its [GitHub Issues page](https://github.com/ndquy2048/VEGA-HOME/issues). Do not post credentials, local network details, private media or your complete Home Assistant backup.
