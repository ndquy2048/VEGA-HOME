import {DEFAULT_ICONS,normalizeIcon,entityKind,mdiIconMarkup,paletteStyle,MDI_READY} from './vega-icons.js?v=v201c1';
import {fanCapabilities,climateControls,monitoredPlayers} from './vega-device-model.js?v=v201c1';
import {installVegaLocale,LOCALE_WORDS,LANGUAGE_META} from './vega-i18n.js?v=v201c1';
import { installVegaConfiguration } from './vega-config.js?v=v201c1';
import { installVegaAppearance } from "./vega-v41.js?v=v201c1";
import { installVegaSurface } from "./vega-surface.js?v=v201c1";
import {vegaRequest} from './vega-request.js?v=v201c1';
const DEVICE_MEMORY_FIELDS = {
  light:['brightness','color_mode','color_temp_kelvin','hs_color','effect'],
  climate:['temperature','fan_mode','swing_mode','swing_horizontal_mode','target_temp_high','target_temp_low','preset_mode'],
  fan:['percentage','preset_mode','direction','oscillating'],
  switch:[],select:[]
};
// The compact Home layout and short touch landscape viewports use the phone policy.
const PHONE_VIEWPORT = '(max-width: 478.99px), (pointer: coarse) and (max-width: 1024px) and (max-height: 460px)';
/* Render bundled English immediately while loading the selected locale. */
class VegaHomePanel extends HTMLElement {

  constructor() {
    super();

    this.attachShadow({ mode: "open" });

    // The Home aggregate is the entry view whenever the user enables Home.
    // Real room selection remains an explicit navigation action.
    this.room = -1;
    this._lastRegularRoom = 0;
    this._deviceFilter = 'all';
    this._homeDeviceIndex = [];
    this.tab = 0;
    this.tabTransition = null;
    this.deviceMemoryIDs = [];
    this.cameraTimer = null;
    this.cameraMode = null;
    this.cameraKey = null;
    this._cameraExpandedID = null;
    this._cameraSnapshotKeys = new Map();
    this._cameraVisible = new Set();
    this.actionPending = new Set();
    this.rooms = [];
    this.ready = false;
    this._configEpoch = 0;
    this._configWaiting = true;
    this._configLoading = false;
    this._configRetryTimer = null;
    this._configRetryCount = 0;
    this.swipeStart = null;

    this.pending = new Set();

    // : last *real* ON settings survive an OFF state and a page reload.
    // Only device settings (no auth tokens or personal media) are stored locally.
    try {
      const saved=JSON.parse(localStorage.getItem('vega-panel-device-memory-vega')||'{}');
      this._lastDevices=saved && typeof saved==='object' && !Array.isArray(saved)?saved:{};
    } catch (_) { this._lastDevices={}; }


    //  — Theme, Pi screen switch and independent screensaver
    this._screensaver = null;
    this._popup = null;
    this._media = null;
    this._musicPage = null;
    this._surface = null;
    this._confirmEpoch = 0;
    // Header artwork: ignore late image loads after song/player changes.
    this._headerArtworkEpoch = 0;
    this._headerArtworkPending = '';
    this._headerArtworkOwner = '';
    this._confirmOpenRAF = [];
    this.screenBusy = false;
    this.themePreference = this.readThemePreference();
    this._locale=installVegaLocale(this);
    this.themeTimer = null;
  }

  // The version displayed by every settings/editor dialog follows the HA
  // integration manifest so dialogs display the current integration version.
  get releaseVersion() {
    return this._panelInfo?.config?.integration_version || '2.0.1';
  }

  /* KẾT NỐI HOME ASSISTANT */

  set panel(value) {
    const previous = this._panelInfo?.config;
    this._panelInfo = value;
    if (previous?.entry_id !== value?.config?.entry_id ||
        previous?.config_revision !== value?.config?.config_revision) {
      ++this._configEpoch;
      this._configController?.abort();
      this._configWaiting = true;
    }
    if (this.ready && this._configWaiting && !this._configRetryTimer) void this.loadConfig();
  }

  set hass(value) {
    const previousUser = this._hass?.user?.id;
    this._hass = value;
    this._locale?.onHass();
    if (previousUser !== value?.user?.id) {
      ++this._configEpoch;
      this._configController?.abort();
      this._configWaiting = true;
    }
    if (this.ready && this._configWaiting && !this._configRetryTimer) void this.loadConfig();
    if(this.ready)this.watchSharedConfiguration();
    this._v41?.onHass?.();
    this._configuration?.onHass?.();
    this.syncDeviceMemory();
    this._screensaver?.onHass(value);
    this._popup?.onHass(value);
    this._media?.onHass(value);
    this._musicPage?.onHass(value);
    this.updateHomeStates();
  }

  watchSharedConfiguration() {
    const connection=this._hass?.connection;
    if(!this.isConnected||!connection||this._sharedConnection===connection||(this._sharedSubscribePending&&this._sharedPendingConnection===connection))return;
    this._sharedSubscribePending=true;this._sharedPendingConnection=connection;
    const seq=(this._sharedSubscriptionEpoch||0)+1;this._sharedSubscriptionEpoch=seq;
    Promise.resolve().then(()=>connection.subscribeEvents(event=>{
      if(!this.isConnected||this._sharedSubscriptionEpoch!==seq||this._hass?.connection!==connection)return;
      if(event?.data?.entry_id!==this._panelInfo?.config?.entry_id)return;
      if(event.data.revision===this._configRevision)return;
      this._configInvalidated=true;
      this._configChangeRevision=event.data.revision;
      ++this._configEpoch;
      this._configController?.abort();
      this.refreshChangedConfiguration();
    },'vega_home_config_updated')).then(unsubscribe=>{
      if(!this.isConnected||this._sharedSubscriptionEpoch!==seq||this._hass?.connection!==connection){unsubscribe?.();return;}
      this._sharedUnsubscribe?.();this._sharedUnsubscribe=unsubscribe;this._sharedConnection=connection;
    }).catch(error=>console.warn('VEGA HOME: shared configuration subscription unavailable',error))
      .finally(()=>{if(this._sharedSubscriptionEpoch===seq){this._sharedSubscribePending=false;this._sharedPendingConnection=null;}});
  }

  updateHomeStates({underMusic=false}={}) {
    if(!this.ready||this.shadowRoot.querySelector('.app')?.hidden||this._surface?.hasModal()||
      (!underMusic&&this._musicPage?.isOpen()))return;
    if((this._homeRenderPending||this._mdiRenderPending)&&this._sharedConfig&&!this._v41?.isResizing()){
      this.renderHomeView();
      return;
    }
    this.updateStates();
    this.updateHeaderNowPlaying();
    if(this.tab===1)this.updateCameraView();
    if(this.tab===2||this.tab===3)this.updateActionStates();
  }

  connectedCallback() {
    if(!this._locale)this._locale=installVegaLocale(this);
    if(!this._mdiReadyBound){
      this._mdiReadyBound=true;
      void MDI_READY.then(ready=>{
        if(ready&&this.isConnected&&this.ready){this._mdiRenderPending=true;this.updateHomeStates();}
      });
    }
    if (this.ready) {
      if (!this._surface) this._surface=installVegaSurface(this);
      if (!this._v41) this._v41=installVegaAppearance(this);
      if (!this._configuration) this._configuration=installVegaConfiguration(this);
      this._locale.onHass();
      this.updateLanguageUI();
      this.watchSharedConfiguration();
      this.watchResume();
      this.applyTheme();
      if (!this.themeTimer) {
        this.themeTimer = setInterval(() => this.applyTheme(), 30_000);
      }
      this.watchLockLayout();
      this.loadPopup();
      this.loadMedia();
      this.loadMusicPage();
      if (this._configWaiting) void this.loadConfig();
      if(this._sharedConfig)this.renderHomeView();
      this.updateHomeStates();
      return;
    }

    this.ready = true;

    this.shadowRoot.innerHTML = `
      <style>${this.styles()}</style>
      <link rel="stylesheet" href="/vega_home_static/vega-style.css?v=v201c1">
      <link rel="stylesheet" href="/vega_home_static/vega-v41.css?v=v201c1">
      <link rel="stylesheet" href="/vega_home_static/vega-setup.css?v=v201c1">

      <div class="app">

        <aside class="side" id="room-sidebar">
          <nav class="rooms" id="rooms" aria-label="${this.escape(this.t('nav.rooms'))}"></nav>
        </aside>

        <main class="main">
          <div class="room-menu-scrim" aria-hidden="true" hidden></div>

          <header class="head">
            <div class="head-copy">
              <div class="room-title">
                <h1 id="title"><span id="room-title-text">${this.escape(this.t("loading"))}</span><button
                  id="room-menu-toggle" type="button" aria-controls="room-menu" aria-expanded="false"
                  disabled><span class="room-menu-label">${this.escape(this.t("loading"))}</span><span class="room-menu-chevron" aria-hidden="true">⌄</span></button></h1>
                <nav id="room-menu" class="room-menu" aria-label="${this.escape(this.t('nav.rooms'))}" hidden></nav>
              </div>
              <div class="sub" id="info" role="alert" aria-live="polite"></div>
            </div>

            <div class="head-actions">
              <button id="header-nowplaying" class="header-nowplaying" type="button" hidden
                aria-label="${this.escape(this.t('media.speakerNowPlaying'))}" title="${this.escape(this.t('music.music'))}">
                <img class="header-nowplaying-art" alt="" hidden>
                <span class="header-nowplaying-symbol">♫</span>
                <span class="header-nowplaying-text"><strong>—</strong><small>—</small></span>
              </button>
              <div class="vega-device-filter-anchor" id="vega-device-filter-anchor" hidden>
                <button id="device-filter-toggle" class="vega-filter-action" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="${this.escape(this.t('v2.filter'))}" title="${this.escape(this.t('v2.filter'))}">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5.5h16l-6.45 7.6v5.25l-3.1 1.8v-7.05L4 5.5Z"/></svg>
                </button>
                <div id="device-filter-popover" class="vega-device-filter-popover" role="menu" hidden></div>
              </div>
              <button id="theme-toggle" class="head-action"
                aria-label="${this.escape(this.t("appearance.settings"))}"
                aria-haspopup="dialog" aria-expanded="false"
                title="${this.escape(this.t("appearance.settings"))}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="11" cy="17" r="2" fill="currentColor" stroke="none"/>
                </svg>
              </button>
              <button id="screen-power" class="head-action"
                aria-label="${this.escape(this.t('screen.lock'))}" title="${this.escape(this.t('screen.lock'))}">
                <svg viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="1.8"
                  stroke-linecap="round" stroke-linejoin="round"
                  aria-hidden="true">
                  <rect x="5" y="10" width="14" height="11" rx="2"/>
                  <path d="M8 10V7a4 4 0 0 1 8 0v3"/>
                </svg>
              </button>
            </div>

          </header>

          <nav class="tabs" id="tabs"></nav>

          <section
            class="content"
            id="content">
          </section>

          <footer class="foot">
            <span id="footer-inspiration">${this.escape(this.t("footer.inspired"))}</span>
          </footer>

        </main>
      </div>

      <div
        class="confirm-overlay"
        id="confirm"
        hidden>

        <div
          class="confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title">

          <strong id="confirm-title">${this.escape(this.t("device.confirmDefault"))}</strong>

          <div class="confirm-actions">
            <button id="cancel-off">${this.escape(this.t("cancel"))}</button>
            <button id="accept-off">${this.escape(this.t("power.off"))}</button>
          </div>

        </div>
      </div>

      <div class="confirm-overlay" id="screen-confirm" hidden>
        <div class="confirm-dialog" role="dialog"
          aria-modal="true" aria-labelledby="screen-confirm-title">
          <strong id="screen-confirm-title">${this.escape(this.t("screen.confirmTitle"))}</strong>
          <p id="screen-confirm-description">${this.escape(this.t("screen.confirmBody"))}</p>
          <div class="confirm-actions">
            <button id="screen-cancel-off">${this.escape(this.t("cancel"))}</button>
            <button id="screen-accept-off">${this.escape(this.t("screen.offAction"))}</button>
          </div>
        </div>
      </div>
    `;

    // One canonical modal backdrop; the modules retain their own dialog DOM.
    this._surface = installVegaSurface(this);

    this._v41=installVegaAppearance(this);
    this._configuration=installVegaConfiguration(this);
    this.watchResume();
    this.watchSharedConfiguration();
    this.bindEvents();
    this.updateLanguageUI();
    this.loadConfig();
    this._locale.onHass();

    this.applyTheme();
    this.themeTimer = setInterval(() => this.applyTheme(), 30_000);
    this.watchLockLayout();
    this.loadPopup();
    this.loadMedia();
    this.loadMusicPage();
  }

  isLockSupported() {
    return !this._phoneLayout?.matches;
  }

  isLockAllowed() {
    // An idle value of 0 disables the lock entirely (including manual entry).
    return this.isLockSupported() && this._v41?.lockSeconds?.() !== 0;
  }

  watchLockLayout() {
    const query=matchMedia(PHONE_VIEWPORT);
    this._phoneLayout=query;
    this._syncLockLayout=()=>{
      const allowed=this.isLockAllowed();
      // Phone-only layout rules must not hide the setting used to re-enable lock.
      if(this.isLockSupported())this.removeAttribute('data-vega-phone');
      else this.setAttribute('data-vega-phone','');
      this.updateScreenButton();
      this._screensaver?.syncAvailability();
      this._musicPage?.onLockAvailabilityChange();
      if(allowed&&!this._screensaver)this.loadScreensaver();
      else if(!allowed)this.updateHomeStates();
    };
    if(query.addEventListener)query.addEventListener('change',this._syncLockLayout);
    else query.addListener?.(this._syncLockLayout);
    this._syncLockLayout();
  }

  loadScreensaver() {
    if(!this.isLockAllowed())return Promise.resolve(null);
    if(this._screensaver)return Promise.resolve(this._screensaver);
    if(this._screensaverLoading)return this._screensaverLoading;
    this._screensaverLoading=import("/vega_home_static/vega-screensaver.js?v=v201c1")
      .then(({ installVegaScreensaver }) => {
        if (this.isConnected&&this.isLockAllowed()) {
          this._screensaver = installVegaScreensaver(this);
          this._screensaver?.setIdleMs?.((this._v41?.lockSeconds?.() ?? 60)*1000);
          if (this._surface?.hasModal()||this._musicPage?.isOpen()||(this.tab === 1 && this.cameraConfig()))
            this._screensaver?.suspend();
        }
        return this._screensaver;
      })
      .catch(error => {console.error("Apple Screensaver:", error);return null;})
      .finally(()=>{this._screensaverLoading=null;});
    return this._screensaverLoading;
  }

  loadPopup() {
    if(this._popup || this._popupLoading)return;
    this._popupLoading=true;
    import("/vega_home_static/vega-popup.js?v=v201c1")
      .then(({ installVegaPopup }) => {
        if (this.isConnected) {
          this._popup = installVegaPopup(this);
          if(this._pendingPopup){const d=this._pendingPopup;this._pendingPopup=null;this._popup.open(d.device,d.anchor);}
        }
      })
      .catch(error => console.error("VEGA Popup:", error))
      .finally(()=>{this._popupLoading=false;});
  }

  loadMedia() {
    if(this._media||this._mediaLoading)return;
    this._mediaLoading=true;
    import('/vega_home_static/vega-media.js?v=v201c1')
      .then(({ installVegaMedia }) => {
        if (this.isConnected) {
          this._media = installVegaMedia(this);
          if(this._pendingActiveMediaOpen){
            const options=this._pendingActiveMediaOpen;
            this._pendingActiveMediaOpen=null;
            this.openActiveMediaPopup(options);
          }
        }
      }).catch(error => console.error('Apple Media:', error))
      .finally(()=>{this._mediaLoading=false;});
  }

  /* : never silently redirect the MA stereo group to an unrelated HomePod. */
  mediaEntityID(device) {
    return device?.entity_id || '';
  }

  /* One shared priority rule for Header, Music popup, Music page and Screensaver.
     Only a real HA `playing` state activates Now Playing. */
  mediaActive() {
    const states = this._hass?.states || {};
    return this.monitoredPlayerIDs().map(id=>states[id]).find(e=>e?.state==='playing') || null;
  }

  monitoredPlayerIDs() { return monitoredPlayers(this._sharedConfig); }
  climateControls(device) { return climateControls(device,(key)=>this.t(key)); }

  updateHeaderNowPlaying() {
    const el=this.shadowRoot?.getElementById('header-nowplaying');
    if(!el)return;
    const e=this.mediaActive();
    if(el.hidden===!!e)el.hidden=!e;
    if(!e){
      // A late image decode must never repaint a newly hidden/different player.
      ++this._headerArtworkEpoch;
      this._headerArtworkPending='';this._headerArtworkOwner='';
      return;
    }
    const a=e.attributes||{};
    const title=el.querySelector('strong'),artist=el.querySelector('small');
    const nextTitle=String(a.media_title||this.t('media.unknownTitle')),nextArtist=String(a.media_artist||a.friendly_name||'—');
    if(title.textContent!==nextTitle)title.textContent=nextTitle;
    if(artist.textContent!==nextArtist)artist.textContent=nextArtist;
    const image=el.querySelector('img'),fallback=el.querySelector('.header-nowplaying-symbol');
    const url=this.mediaArtwork(e),owner=e.entity_id;
    if(this._headerArtworkOwner!==owner){
      this._headerArtworkOwner=owner;this._headerArtworkPending='';++this._headerArtworkEpoch;
      // Retain a decoded cover on speaker handoff; only the new request may replace it.
    }
    if(this._headerArtworkPending===url)return;
    this._headerArtworkPending=url;
    const serial=++this._headerArtworkEpoch;
    if(!url){
      image.hidden=true;image.removeAttribute('src');fallback.hidden=false;
      return;
    }
    if(image.getAttribute('src')===url&&!image.hidden)return;
    // Keep the previous cover painted until the next one has decoded.
    // This avoids blank frames on rapid HA metadata updates / song changes.
    const probe=new Image();
    const valid=()=>this.isConnected&&serial===this._headerArtworkEpoch&&
      this._headerArtworkOwner===owner&&this.mediaActive()?.entity_id===owner;
    probe.onload=()=>{
      const commit=()=>{
        if(!valid()||this.mediaArtwork(this.mediaActive())!==url)return;
        image.src=url;image.hidden=false;fallback.hidden=true;
      };
      if(typeof probe.decode==='function')void probe.decode().then(commit,commit);
      else commit();
    };
    probe.onerror=()=>{
      if(!valid()||this.mediaArtwork(this.mediaActive())!==url)return;
      image.hidden=true;image.removeAttribute('src');fallback.hidden=false;
    };
    probe.src=url;
  }

  loadMusicPage() {
    if(this._musicPage||this._musicPageLoading)return;
    this._musicPageLoading=true;
    import('/vega_home_static/vega-music-page.js?v=v201c1')
      .then(({installVegaMusicPage}) => {
        if(this.isConnected){this._musicPage=installVegaMusicPage(this);
          if(this._musicOpenQueued){this._musicOpenQueued=false;this._musicPage.open(...this._musicOrigin);}}
      }).catch(error => console.error('VEGA Music page:',error))
      .finally(()=>{this._musicPageLoading=false;});
  }

  openMusicPage(origin='home',device=null) {
    if(!this.musicAvailable())return;
    this._musicOrigin=[origin,device];
    if(this._musicPage){this._musicPage.open(origin,device);return;}
    this._musicOpenQueued=true;
    this.loadMusicPage();
  }

  // Use the exact popup that opening a media_player device tile uses.
  // The current HA 'playing' state is authoritative, not a stale room selection.
  openActiveMediaPopup({anchor=null,instant=false}={}) {
    const active=this.mediaActive();
    if(!active)return false;
    const device=(this._sharedConfig?.rooms||[])
      .flatMap(room=>room.devices||[])
      .find(device=>device.entity_id===active.entity_id)
      ||{entity_id:active.entity_id,name:active.attributes?.friendly_name||active.entity_id};
    if(!this._media){
      this._pendingActiveMediaOpen={anchor,instant};
      this.loadMedia();
      return true;
    }
    return this._media.open(device,anchor,{instant});
  }

  mediaArtwork(entity) {
    const a=entity?.attributes || {};
    const raw=String(a.entity_picture||a.media_image_url||a.entity_picture_local||'');
    if (!raw || /^(javascript|data):/i.test(raw)) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('/')) return this._hass?.hassUrl ? this._hass.hassUrl(raw) : raw;
    return '';
  }

  disconnectedCallback() {
    ++this._headerArtworkEpoch;
    this._headerArtworkPending='';this._headerArtworkOwner='';
    this._locale?.destroy();this._locale=null;
    this._sharedSubscriptionEpoch=(this._sharedSubscriptionEpoch||0)+1;this._sharedSubscribePending=false;this._sharedPendingConnection=null;
    this._sharedUnsubscribe?.();this._sharedUnsubscribe=null;this._sharedConnection=null;
    this._pendingPopup=null;
    this._pendingActiveMediaOpen=null;
    this._configuration?.destroy();this._configuration=null;
    ++this._configEpoch;
    this._configController?.abort();
    this._configWaiting = true;
    clearTimeout(this._configRetryTimer);this._configRetryTimer=null;
    this.rememberRoom();
    document.removeEventListener?.('visibilitychange',this._onVegaVisibility);
    this._onVegaVisibility=null;
    this.clearFanMotion();
    this.setRoomMenu(false);
    const query=this._phoneLayout;
    if(query?.removeEventListener)query.removeEventListener('change',this._syncLockLayout);
    else query?.removeListener?.(this._syncLockLayout);
    this._phoneLayout=null;
    this._syncLockLayout=null;
    clearInterval(this.themeTimer);
    this.themeTimer = null;
    this._screensaver?.destroy();
    this._v41?.destroy?.();
    this._v41=null;
    this._popup?.destroy();
    this._media?.destroy();
    this._musicPage?.destroy();
    this._surface?.destroy();
    this._musicOpenQueued=false;
    this.cancelTabTransition();
    for(const raf of this._confirmOpenRAF)cancelAnimationFrame(raf);
    this._confirmOpenRAF=[];++this._confirmEpoch;
    
    this.stopCamera();
    this.closeDeviceFilter();
    clearTimeout(this.errorTimer);this.errorTimer=null;
    clearTimeout(this._v45ConfirmTimer);
  }

  /*  — LIGHT / DARK / AUTO (ASIA/TOKYO) */

  readThemePreference() {
    try {
      const saved = localStorage.getItem("smart-home-panel-theme-vega");
      return ["auto", "light", "dark"].includes(saved)
        ? saved : "auto";
    } catch (_) {
      return "auto";
    }
  }

  japanHour() {
    // The Pi browser may use another system timezone.
    try { return Number(new Intl.DateTimeFormat('en-GB',{timeZone:this._hass?.config?.time_zone,hour:'2-digit',hourCycle:'h23'}).format(new Date())); }
    catch (_) { return new Date().getHours(); }
  }

  applyTheme() {
    const hour = this.themePreference === "auto" ? this.japanHour() : 0;
    const mode = this.themePreference === "auto"
      ? (hour >= 7 && hour < 19 ? "light" : "dark")
      : this.themePreference;

    if (this.getAttribute("data-theme") !== mode) {
      this.setAttribute("data-theme", mode);
    }

  }

  selectTheme(preference) {
    if (!["auto", "light", "dark"].includes(preference)) return;
    this.themePreference = preference;
    try {
      localStorage.setItem("smart-home-panel-theme-vega", preference);
    } catch (_) { /* Continue without persistent storage. */ }
    this.applyTheme();
  }

  languageOptions(){return Object.entries(LANGUAGE_META).map(([code,meta])=>({code,nativeName:meta.nativeName}));}
  languagePreference(){return this._locale?.preference()||'auto';}
  t(key,variables={}){
    const template=LOCALE_WORDS[this.language]?.[key]??LOCALE_WORDS.en[key]??key;
    return template.replace(/\{(\w+)\}/g,(match,name)=>Object.hasOwn(variables,name)?String(variables[name]??''):match);
  }

  applyLocaleChange(){
    this.updateLanguageUI();
    if(this._sharedConfig){
      if(this._surface?.hasModal()||this._v41?.isResizing())this._homeRenderPending=true;
      else this.renderHomeView();
    }
    this._v41?.onLanguageChange?.();this._configuration?.onLanguageChange?.();
    this._popup?.onLanguageChange?.();this._media?.onLanguageChange?.();
    this._screensaver?.onLanguageChange?.();this._musicPage?.onLanguageChange?.();
    this.updateHeaderNowPlaying();
  }

  roomName(room) {
    return this.deviceName(room);
  }

  deviceName(device) {
    return device?.names?.[this.language] || device?.names?.[this.language.split('-')[0]] || device?.name || "";
  }


  updateLanguageUI() {
    this.setRoomMenu(false,{restoreFocus:true});
    const root = this.shadowRoot;
    const set = (selector, key, attr = "textContent") => {
      const el = root.querySelector(selector);
      if (el) el[attr] = this.t(key);
    };
    this.setAttribute("lang", this.language);
    this.setAttribute("dir",LANGUAGE_META[this.language]?.isRTL?"rtl":"ltr");
    set("#footer-inspiration", "footer.inspired");
    set("#room-menu", "nav.rooms", "ariaLabel");
    set("#rooms", "nav.rooms", "ariaLabel");
    set("#theme-toggle", "appearance.settings", "ariaLabel");
    set("#theme-toggle", "appearance.settings", "title");
    set("#header-nowplaying", "media.speakerNowPlaying", "ariaLabel");
    set("#header-nowplaying", "music.music", "title");
    const confirm=this.shadowRoot.getElementById('confirm');
    const pendingDevice=this.getDevice(Number(confirm?.dataset.index));
    const message=pendingDevice?.confirm_message?.trim()||this.t('device.confirmDefault');
    if(confirm?.querySelector('#confirm-title'))confirm.querySelector('#confirm-title').textContent=message;
    set("#cancel-off", "cancel");
    set("#accept-off", "power.off");
    set("#screen-confirm-title", "screen.confirmTitle");
    set("#screen-confirm-description", "screen.confirmBody");
    set("#screen-cancel-off", "cancel");
    set("#screen-accept-off", "screen.offAction");
    this.updateScreenButton();
    this.applyTheme();
  }

  selectLanguage(language){return this._locale?.select(language);}

  /*  — PI 5 SCREEN POWER */

  screenState() {
    return this._hass?.states?.[this._sharedConfig?.settings?.screen_entity]?.state;
  }

  // V4: Lock button opens the screensaver; NEVER toggles physical Pi power.
  updateScreenButton() {
    const button = this.shadowRoot?.getElementById('screen-power');
    if (!button) return;
    const allowed=this.isLockAllowed();
    if(!allowed&&this.shadowRoot.activeElement===button)
      this.shadowRoot.getElementById('theme-toggle')?.focus({preventScroll:true});
    button.hidden=!allowed;
    button.disabled=!allowed;
    button.classList.remove('screen-on','screen-off','screen-busy');
    const label=this.t('screen.lock');
    button.setAttribute('aria-label',label);
    button.title=label;
  }

  toggleScreenPower() {
    if(!this.isLockAllowed())return;
    this._v41?.endTileResize();
    this.setRoomMenu(false);
    this._screensaver?.open?.({automatic:true});
  }

  closeScreenConfirm() {
    this.shadowRoot.getElementById("screen-confirm").hidden = true;
  }

  async sendScreenService(service) {
    const id=this._sharedConfig?.settings?.screen_entity;
    if (this.screenBusy || !this._hass?.callService || !id || !['on','off'].includes(this.screenState())) return false;

    this.screenBusy = true;
    this.updateScreenButton();
    try {
      await this._hass.callService(id.split('.')[0], service, {
        entity_id: id
      });
      return true;
    } catch (error) {
      console.error("VEGA HOME: screen control failed", error);
      this.showError(this.t("error.screen"));
      return false;
    } finally {
      this.screenBusy = false;
      this.updateScreenButton();
    }
  }

  /* ĐỌC DEVICES.JSON */

  scheduleConfigRetry() {
    if(!this.isConnected||this._configRetryTimer||this.isEditingConfiguration())return;
    if(this._configRetryCount>=4){
      this._configWaiting=false;
      this.showConfigLoadError();
      return;
    }
    const delay=[1000,2000,3500,6000][this._configRetryCount++];
    this._configRetryTimer=setTimeout(()=>{
      this._configRetryTimer=null;
      if(this.isConnected&&this._configWaiting)void this.loadConfig();
    },delay);
  }

  showConfigLoadError() {
    if(!this.isConnected)return;
    if(this._sharedConfig){
      this.showError(this.t('error.configFile'));
      return;
    }
    this.setRoomMenu(false);
    this.setRoomTitle(this.t('error.config'),false);
    const info=this.shadowRoot.getElementById('info');
    const content=this.shadowRoot.getElementById('content');
    if(!info||!content)return;
    info.textContent=this.t('error.configFile');
    content.replaceChildren();
    const message=document.createElement('p');
    message.textContent=this.t('error.configFile');
    const retry=document.createElement('button');
    retry.id='vega-config-retry';retry.type='button';retry.textContent=this.t('vega.retryConfig');
    retry.style.cssText='margin:12px 0;padding:12px 22px;border-radius:12px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;';
    retry.addEventListener('click',()=>{
      clearTimeout(this._configRetryTimer);this._configRetryTimer=null;
      this._configRetryCount=0;this._configWaiting=true;
      void this.loadConfig();
    });
    content.append(message,retry);
  }

  isEditingConfiguration() {
    return Boolean(this._configuration?.isOpen?.()||this._v41?.isRemoving());
  }

  async loadConfig() {
    // A disconnected HA session or a slow websocket must not leave an eternal spinner.
    if(this.isEditingConfiguration()){this._configWaiting=true;return;}
    if(this._configLoading)return;
    const entryID=this._panelInfo?.config?.entry_id;
    const userID=this._hass?.user?.id;
    if(!this.isConnected||!entryID||!userID||!this._hass?.callWS){
      this._configWaiting=true;
      this.scheduleConfigRetry();
      return;
    }
    clearTimeout(this._configRetryTimer);this._configRetryTimer=null;
    this._configWaiting=false;this._configLoading=true;
    const epoch=++this._configEpoch;
    const current=()=>this.isConnected&&epoch===this._configEpoch&&
      userID===this._hass?.user?.id&&entryID===this._panelInfo?.config?.entry_id;
    const controller=new AbortController();this._configController=controller;
    try {
      const response=await vegaRequest(this._hass,{type:'vega_home/config',entry_id:entryID},{signal:controller.signal});
      if(!current())return;
      if(this.isEditingConfiguration()){this._configWaiting=true;return;}
      const config=response?.devices;
      if(!Array.isArray(config?.rooms)||config.rooms.length>100||typeof response.revision!=='string')
        throw new Error(this.t('error.rooms'));
      this.applyConfiguration(config,response.revision,{fromRead:true});
    } catch(error) {
      if(!current())return;
      this._configWaiting=true;
      this.showConfigLoadError();
      console.warn('VEGA HOME: configuration request failed, retry scheduled',error);
    } finally {
      if(this._configController===controller)this._configController=null;
      this._configLoading=false;
      if(this._configWaiting&&this.isConnected)this.scheduleConfigRetry();
    }
  }

  refreshChangedConfiguration() {
    if((!this._configInvalidated&&!this._configWaiting)||!this.isConnected||this.isEditingConfiguration())return;
    this._configWaiting=true;void this.loadConfig();
  }

  async saveSharedConfiguration(devices,revision,{signal}={}) {
    const hass=this._hass,user=hass?.user?.id,entry=this._panelInfo?.config?.entry_id;
    if(!this.isConnected||!hass?.user?.is_admin||!entry)throw Object.assign(new Error('Vega configuration owner changed'),{code:'cancelled'});
    const result=await vegaRequest(hass,{type:'vega_home/config/save',entry_id:entry,revision,devices},{signal});
    if(!this.isConnected||this._hass?.user?.id!==user||!this._hass?.user?.is_admin||this._panelInfo?.config?.entry_id!==entry)
      throw Object.assign(new Error('Vega configuration owner changed'),{code:'cancelled'});
    if(!Array.isArray(result?.devices?.rooms)||typeof result.revision!=='string')throw new Error('Invalid Vega configuration response');
    return result;
  }

  captureHomeView() {
    const room=this.rooms[this.room],root=this.shadowRoot;
    const content=root.getElementById('content');
    return {roomName:room?.name,areaID:room?.area_id,index:this.room,tab:this.tab,
      cameraID:this._cameraExpandedID||this.cameraConfig()?.entity_id,cameraExpanded:Boolean(root.querySelector('.vega-camera-shell.is-expanded')),
      home:this.room===-1,scroll:content?.scrollTop||0,gridScroll:(content?.querySelector(':scope > .vega-camera-shell > .v41-device-wrap')||content?.firstElementChild)?.scrollTop||0};
  }

  renderHomeView(view=this.captureHomeView()) {
    this.render();
    if(this.tab!==view.tab)return;
    if(view.tab===1&&view.cameraExpanded&&this.categoryEntries('cameras').some(({item})=>item.entity_id===view.cameraID))
      this.cameraCommand({dataset:{cameraCommand:'expand',cameraId:view.cameraID}});
    const content=this.shadowRoot.getElementById('content');
    const grid=content?.querySelector(':scope > .vega-camera-shell > .v41-device-wrap')||content?.firstElementChild;
    if(content)content.scrollTop=view.scroll;
    if(grid)grid.scrollTop=view.gridScroll;
  }

  applyConfiguration(config,revision,{render=true,fromRead=false,activeRoomName}={}) {
    if(!Array.isArray(config?.rooms)||config.rooms.length>100)throw Error(this.t('error.rooms'));
    const view=this.captureHomeView();
    const user=this._hass?.user?.id,entry=this._panelInfo?.config?.entry_id;
    const sameOwner=this._configOwner?.user===user&&this._configOwner?.entry===entry;
    const keepView=sameOwner&&(view.home||Boolean(this.rooms[this.room]));
    // A save reply must not consume a different revision announced while saving.
    const newerRevision=!fromRead&&this._configChangeRevision&&this._configChangeRevision!==revision;
    ++this._configEpoch;this._configController?.abort();
    this._configInvalidated=Boolean(newerRevision);
    if(!newerRevision)this._configChangeRevision=null;
    this._configWaiting=false;this._configRetryCount=0;
    clearTimeout(this._configRetryTimer);this._configRetryTimer=null;
    this._configOwner={user,entry};
    this._sharedConfig=structuredClone(config);this._configRevision=revision;
    this.rooms=this._sharedConfig.rooms;
    if(keepView){
      const index=this.findRoom(activeRoomName??view.roomName,view.areaID);
      this.room=view.home&&this._v41?.showHomeTab?.()?-1:(index>=0?index:Math.max(0,Math.min(view.index,this.rooms.length-1)));
      const room=this.rooms[this.room];
      if(room&&view.cameraID&&room.cameras?.some(camera=>camera.entity_id===view.cameraID)){
        this._cameraSelection||=Object.create(null);
        this._cameraSelection[room.name]=view.cameraID;
      }
    }else{
      if(!sameOwner)this._cameraSelection=null;
      this.restoreRoom();
    }
    this.rememberRoom();
    this.deviceMemoryIDs=[...new Set(this.rooms.flatMap(room=>(room.devices||[])
      .flatMap(device=>[device.entity_id,...this.climateControls(device).map(control=>control.entity_id)])))];
    this.syncDeviceMemory();
    if(render){
      if(keepView)this.renderHomeView(view);
      else this.render();
    }else this._homeRenderPending=true;
    this._media?.onHass?.();this._screensaver?.onHass?.(this._hass);
    if(newerRevision)this.refreshChangedConfiguration();
  }

  openConfiguration(options={}) { void this._configuration?.open(options); }
  devicePaletteStyle(kind) {
    return paletteStyle(kind,this._sharedConfig?.settings?.kind_colors||{});
  }

  musicAssistantInstalled() {
    return !!this._hass?.services?.music_assistant?.play_media;
  }

  musicPlayerID() { return this._sharedConfig?.settings?.music_assistant_player || ''; }

  musicAvailable() { return this.musicAssistantInstalled() && !!this.musicPlayerID() && !!this._hass?.states?.[this.musicPlayerID()]; }

  mediaLimited(entity) {
    const features=Number(entity?.attributes?.supported_features)||0;
    return !(features & (2|16|32));
  }

  /* HÀM HỖ TRỢ */

  findRoom(name,areaID) {
    const index=this.rooms.findIndex(room=>room.name===name);
    if(index>=0||!areaID)return index;
    const matches=this.rooms.map((room,i)=>room.area_id===areaID?i:-1).filter(i=>i>=0);
    return matches.length===1?matches[0]:-1;
  }

  restoreRoom() {
    this.room=0;this.tab=0;
    const user=this._hass?.user?.id;
    if(user&&this.rooms.length){
      try{
        const saved=JSON.parse(localStorage.getItem(`vega-last-room-vega:${user}`));
        const index=saved?.version===1?this.findRoom(saved.name,saved.area_id):-1;
        if(index>=0){this._lastRegularRoom=index;this.room=index;}
      }catch(_){}
    }
    // The saved room is only a fallback for when Home is disabled. Navigating
    // explicitly to a room does not change the startup destination.
    if(this.rooms.length&&this._v41?.showHomeTab?.())this.room=-1;
  }

  rememberRoom() {
    const user=this._hass?.user?.id,room=this.rooms[this.room];
    if(!user||!room?.name||this._configOwner?.user!==user)return;
    try{localStorage.setItem(`vega-last-room-vega:${user}`,JSON.stringify({version:1,name:room.name,area_id:room.area_id}));}catch(_){}
  }

  watchResume() {
    if(this._onVegaVisibility)return;
    this._onVegaVisibility=()=>{
      if(document.hidden){this.rememberRoom();this.stopCamera();}
      else if(this.tab===1&&this.ready)this.renderHomeView();
      else this.updateHomeStates();
    };
    document.addEventListener?.('visibilitychange',this._onVegaVisibility);
  }

  escape(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]
    );
  }

  roomIcon(name) {
    return mdiIconMarkup(normalizeIcon(name,true)||'mdi:home-outline');
  }

  getDevice(index) {
    // Home cards carry a transient index, never a saved config index.
    return this.room === -1 ? this._homeDeviceIndex[index]?.device : this.rooms[this.room]?.devices?.[index];
  }

  deviceEntries() {
    if(this.room !== -1)return (this.rooms[this.room]?.devices||[]).map((device,index)=>({device,index,roomIndex:this.room}));
    const entries=[];
    this.rooms.forEach((room,roomIndex)=>(room.devices||[]).forEach(device=>{
      entries.push({device,index:entries.length,roomIndex});
    }));
    this._homeDeviceIndex=entries;
    return entries;
  }

  // Display kind controls filtering, including switch entities intentionally
  // styled as a light, fan/climate or media player. The service domain stays real.
  deviceFilterGroup(device) {
    const kind=this.deviceKind(device);
    if(kind==='light')return 'light';
    if(kind==='climate'||kind==='fan')return 'climate';
    if(kind==='media'||kind==='homepod'||kind==='speaker'||kind==='tv')return 'media';
    return null;
  }
  filterKinds() {return ['light','climate','media'];}
  filterDevice(device,filter=this._deviceFilter) {
    return filter==='all'||this.deviceFilterGroup(device)===filter;
  }

  // The Home category tabs flatten entries only for display and event routing.
  // Actual room membership stays in HA shared config, untouched.
  categoryEntries(category) {
    if(this.room>=0)return (this.rooms[this.room]?.[category]||[]).map((item,index)=>({item,index,roomIndex:this.room}));
    const entries=[];
    this.rooms.forEach((room,roomIndex)=>(room[category]||[]).forEach(item=>
      entries.push({item,index:entries.length,roomIndex})));
    return entries;
  }

  categoryGroups(category,entries) {
    if(this.room>=0)return [{room:this.rooms[this.room],index:this.room,entries}];
    return this.rooms.map((room,index)=>({room,index,entries:entries.filter(entry=>entry.roomIndex===index)}))
      .filter(group=>group.entries.length);
  }

  homeSectionHeading(room) {
    return `<h2 class="vega-home-room-heading"><span>${this.escape(this.roomName(room))}</span></h2>`;
  }

  closeDeviceFilter() {
    const menu=this.shadowRoot.getElementById('device-filter-popover');
    if(menu)menu.hidden=true;
    this.shadowRoot.getElementById('device-filter-toggle')?.setAttribute('aria-expanded','false');
  }

  renderDeviceFilter() {
    const anchor=this.shadowRoot.getElementById('vega-device-filter-anchor');
    if(!anchor)return;
    anchor.hidden=this.tab!==0||!this.rooms.length;
    const kinds=this.filterKinds();
    if(this._deviceFilter!=='all'&&!kinds.includes(this._deviceFilter))this._deviceFilter='all';
    const menu=anchor.querySelector('#device-filter-popover');
    menu.innerHTML=['all',...kinds].map(kind=>{
      const name=kind==='all'?this.t('v2.allTypes'):
        kind==='climate'?`${this.t('vega.type.climate')} · ${this.t('vega.type.fan')}`:
        kind==='media'?`${this.t('vega.type.media')} · ${this.t('vega.type.speaker')}`:
        this.t('vega.type.light');
      return `<button type="button" role="menuitemradio" data-vega-filter-kind="${this.escape(kind)}" aria-checked="${kind===this._deviceFilter}">${this.escape(name)}${kind===this._deviceFilter?' ✓':''}</button>`;
    }).join('');
  }

  // Device icons use the bundled, approved icon mapping. Icon keys are
  // exclusively selected from this allow-list; HA names never enter asset URLs.
  deviceKind(device) {
    return entityKind(device,this.stateOf(device));
  }

  deviceIconName(device) {
    return normalizeIcon(device.icon_override)||'mdi:'+(DEFAULT_ICONS[this.deviceKind(device)]||'power-socket-jp');
  }

  deviceIcon(device) {
    return mdiIconMarkup(this.deviceIconName(device),{rotor:this.deviceKind(device)==='fan'});
  }

  // : preserve per-device last-on values even when HA clears attributes at OFF.
  lastDeviceSettings(id) {return this._lastDevices?.[id]||null;}
  persistDeviceMemory() {
    try{localStorage.setItem('vega-panel-device-memory-vega',JSON.stringify(this._lastDevices));}
    catch(error){console.warn('Unable to save device settings',error);}
  }
  syncDeviceMemory() {
    if(!this._hass?.states)return;
    let changed=false;
    for(const id of this.deviceMemoryIDs)if(this.rememberDeviceState(id,false))changed=true;
    if(changed)this.persistDeviceMemory();
  }
  rememberDeviceState(id,persist=true) {
    const entity=this._hass?.states?.[id];
    if(!id||!entity||['off','unknown','unavailable'].includes(entity.state))return false;
    const fields=DEVICE_MEMORY_FIELDS[id.split('.')[0]];
    if(!Array.isArray(fields))return false;
    const previous=this._lastDevices[id];
    const saved=previous?.attributes||{};
    let attributes=saved;
    for(const key of fields){
      const v=entity.attributes?.[key];
      const isArray=Array.isArray(v);
      if(!['string','number','boolean'].includes(typeof v)&&
        !(isArray&&v.length<=4&&v.every(x=>typeof x==='number')))continue;
      const old=saved[key];
      const equal=isArray?Array.isArray(old)&&v.length===old.length&&v.every((x,i)=>x===old[i]):v===old;
      if(equal)continue;
      if(attributes===saved)attributes={...saved};
      attributes[key]=isArray?v.slice():v;
    }
    if(previous?.state===entity.state&&attributes===saved)return false;
    this._lastDevices[id]={state:entity.state,attributes};
    if(persist)this.persistDeviceMemory();
    return true;
  }
  // Record values edited in our popups even if HA still reports the prior state.
  noteDeviceCommand(id,domain,action,data={}) {
    if(!id || ['turn_off'].includes(action)||(domain==='climate'&&action==='set_hvac_mode'&&data.hvac_mode==='off'))return;
    this.rememberDeviceState(id);
    const old=this._lastDevices[id]||{state:domain==='climate'?'cool':'on',attributes:{}};
    const attributes={...old.attributes};let state=old.state;
    if(domain==='light'&&action==='turn_on') {
      if(Number.isFinite(data.brightness_pct))attributes.brightness=Math.round(data.brightness_pct*255/100);
      if(Number.isFinite(data.brightness))attributes.brightness=data.brightness;
      if(Array.isArray(data.hs_color)){attributes.hs_color=data.hs_color;attributes.color_mode='hs';}
      if(Number.isFinite(data.color_temp_kelvin)){attributes.color_temp_kelvin=data.color_temp_kelvin;attributes.color_mode='color_temp';}
      state='on';
    }
    if(domain==='climate') {
      if(action==='set_hvac_mode'&&data.hvac_mode)state=data.hvac_mode;
      if(action==='set_temperature')for(const key of ['temperature','target_temp_low','target_temp_high'])if(Number.isFinite(data[key]))attributes[key]=data[key];
      if(action==='set_fan_mode')attributes.fan_mode=data.fan_mode;
      if(action==='set_swing_mode')attributes.swing_mode=data.swing_mode;
    }
    if(domain==='fan'){
      if(action==='set_percentage'&&Number.isFinite(data.percentage)){attributes.percentage=data.percentage;state='on';}
      if(action==='set_preset_mode')attributes.preset_mode=data.preset_mode;
    }
    if(domain==='select'&&action==='select_option')state=data.option;
    this._lastDevices[id]={state,attributes};this.persistDeviceMemory();
  }
  async restoreDevice(id) {
    if(!id || !this._hass?.callService)return;
    const domain=id.split('.')[0],e=this._hass.states?.[id],a=e?.attributes||{};
    const prev=this.lastDeviceSettings(id),saved=prev?.attributes||{};
    const send=(service,data={})=>this._hass.callService(domain,service,{entity_id:id,...data});
    // No guessing: restore only values actually recorded while ON.
    if(domain==='light') {
      const data={};
      if(Number.isFinite(saved.brightness)&&saved.brightness>0)data.brightness=Math.min(255,Math.max(1,Math.round(saved.brightness)));
      const modes=a.supported_color_modes||[];
      const canTemp=modes.includes('color_temp')||modes.includes('rgbww');
      const canColor=modes.some(m=>['hs','xy','rgb','rgbw','rgbww'].includes(m));
      if(saved.color_mode==='color_temp'&&canTemp&&Number.isFinite(saved.color_temp_kelvin))data.color_temp_kelvin=saved.color_temp_kelvin;
      else if(canColor&&Array.isArray(saved.hs_color)&&saved.hs_color.length===2)data.hs_color=saved.hs_color;
      else if(canTemp&&Number.isFinite(saved.color_temp_kelvin))data.color_temp_kelvin=saved.color_temp_kelvin;
      await send('turn_on',data);
    } else if(domain==='climate') {
      const modes=Array.isArray(a.hvac_modes)?a.hvac_modes:[];
      const mode=modes.includes(prev?.state)&&prev.state!=='off'?prev.state:
        (modes.find(x=>x!=='off')||null);
      if(mode)await send('set_hvac_mode',{hvac_mode:mode});else await send('turn_on');
      if(Number.isFinite(saved.temperature)) {
        const low=Number.isFinite(a.min_temp)?a.min_temp:16;
        const high=Number.isFinite(a.max_temp)?a.max_temp:31;
        const value=Math.max(low,Math.min(high,saved.temperature));
        await send('set_temperature',{temperature:value});
      }
      if(saved.fan_mode&&a.fan_modes?.includes(saved.fan_mode))await send('set_fan_mode',{fan_mode:saved.fan_mode});
      if(saved.swing_mode&&a.swing_modes?.includes(saved.swing_mode))await send('set_swing_mode',{swing_mode:saved.swing_mode});
      if(saved.swing_horizontal_mode&&a.swing_horizontal_modes?.includes(saved.swing_horizontal_mode))await send('set_swing_horizontal_mode',{swing_horizontal_mode:saved.swing_horizontal_mode});
      const device=this.rooms.flatMap(room=>room.devices||[]).find(d=>d.entity_id===id);
      for(const {entity_id:vaneID} of this.climateControls(device)){
        const target=this.lastDeviceSettings(vaneID)?.state;
        const ve=this._hass.states?.[vaneID];
        if(target&&ve?.attributes?.options?.includes(target))
          await this._hass.callService('select','select_option',{entity_id:vaneID,option:target});
      }
    } else if(domain==='fan') {
      await send('turn_on');
      if(Number.isFinite(saved.percentage)&&saved.percentage>0&&(Number(a.supported_features||0)&1))
        await send('set_percentage',{percentage:Math.min(100,Math.max(1,Math.round(saved.percentage)))});
    } else await send('turn_on');
  }

  stateOf(device) {
    const id = device?.entity_id?.startsWith("media_player.") ? this.mediaEntityID(device) : device?.entity_id;
    return this._hass?.states?.[id];
  }

  /* ĐỌC TRẠNG THÁI THỰC TẾ */

  stateInfo(device) {
    const entity = this.stateOf(device);
    const state = entity?.state;

    if (
      !state ||
      state === "unknown" ||
      state === "unavailable"
    ) {
      return {
        on: false,
        unavailable: true,
        text: this.t(state === "unknown" ? "status.unknown" : "status.unavailable")
      };
    }

    if (device.entity_id.startsWith('media_player.')) {
      const on=state==='playing';
      return {on,unavailable:false,text:on ?
        (entity.attributes?.media_title || this.t('media.playing')) :
        state==='paused' ? this.t('media.paused') : this.t('media.idle')};
    }
    const domain=device.entity_id.split('.')[0];
    // Locks and sensors have semantics different from a generic on/off switch.
    if(domain==='lock')return {on:state==='locked',unavailable:false,text:state};
    if(domain==='sensor'||domain==='binary_sensor'){
      const attrs=entity.attributes||{};
      const suffix=attrs.unit_of_measurement||'';
      return {on:state==='on',unavailable:false,text:`${state}${suffix?` ${suffix}`:''}`};
    }
    const on = state !== "off";

    if (
      device.entity_id.startsWith("climate.")
    ) {
      const mode = on
        ? (this.t(`hvac.${state}`) !== `hvac.${state}` ? this.t(`hvac.${state}`) : state)
        : this.t("status.climateOff");

      const temperature = entity.attributes?.temperature;
      const measured = entity.attributes?.current_temperature;
      return {
        on,
        unavailable: false,
        roomTemperature: typeof measured === 'number' && Number.isFinite(measured) ? measured : null,
        text: on && typeof temperature === 'number'
          ? this.t('status.climate', {mode, temp:temperature}) : mode
      };
    }

    if (on && device.entity_id.startsWith("fan.")) {
      const pct = entity.attributes?.percentage;
      if (typeof pct === "number") {
        const {count}=fanCapabilities(entity);
        const level=count?Math.max(1,Math.min(count,Math.round(pct*count/100))):null;
        return {on,unavailable:false,text:level&&count<=8?this.t('status.speed',{level,pct:Math.round(pct)}):`${Math.round(pct)}%`};
      }
    }
    if (on && device.entity_id.startsWith("light.")) {
      const brightness = entity.attributes?.brightness;
      if (typeof brightness === "number") {
        return { on, unavailable: false, text: this.t("status.brightness", {pct:Math.round(brightness * 100 / 255)}) };
      }
    }
    return {
      on,
      unavailable: false,
      text: this.t(on ? "status.on" : "status.off")
    };
  }


  // : concise Apple Home tile captions. Does not alter popup/HA semantics.
  tileStatus(device,info) {
    if(info.unavailable){
      const entity=this.stateOf(device);
      const changed=Date.parse(entity?.last_changed||'');
      const elapsed=Number.isFinite(changed)?Math.max(0,Date.now()-changed):NaN;
      const unit=Number.isFinite(elapsed) && elapsed>=60000
        ? (elapsed>=3600000 ? {num:Math.floor(elapsed/3600000),kind:'hour'} : {num:Math.floor(elapsed/60000),kind:'minute'}) : null;
      const base=this.t('status.unavailable');if(!unit)return base;
      let duration;try{duration=new Intl.NumberFormat(this.language,{style:'unit',unit:unit.kind,unitDisplay:'narrow'}).format(unit.num);}catch(_){duration=String(unit.num);}
      return `${base} ${duration}`;
    }
    // Display categories do not grant a switch fan/climate/lock capabilities.
    // Switch entities always report the two physical states, regardless of icon.
    if(device?.entity_id?.startsWith('switch.'))return info.on?this.t('tile.on'):this.t('tile.off');
    const kind=this.deviceKind(device);
    const on=this.t('tile.on'),off=this.t('tile.off');
    if(kind==='homepod')return this.t(info.on?'tile.playing':'tile.notPlaying');
    if(kind==='fan'){
      if(!info.on)return off;
      const pct=this.stateOf(device)?.attributes?.percentage;
      return Number.isFinite(pct)?`${Math.round(pct)}%`:on;
    }
    if(kind==='climate'){
      if(!info.on)return off;
      const entity=this.stateOf(device);
      const mode=entity?.state;
      const modeKey=`hvac.${mode}`;
      const label=this.t(modeKey),modeLabel=label===modeKey?mode:label;
      const temp=entity?.attributes?.temperature;
      if(!Number.isFinite(temp))return modeLabel;
      const rounded=Number(temp).toFixed(1);
      return this.t('status.climateTarget',{mode:modeLabel,temp:rounded});

    }
    if(kind==='lock'){
      const state=this.stateOf(device)?.state;
      return state==='locked'?this.t('tile.locked'):state==='unlocked'?this.t('tile.unlocked'):info.text;
    }
    if(kind==='sensor')return info.text;
    return info.on?on:off;
  }

  /* VẼ GIAO DIỆN */

  syncRoomMenu(compact) {
    if(this.compactRooms===compact)return;
    this.compactRooms=compact;
    this.setRoomMenu(false);
  }

  setRoomTitle(label,ready) {
    const root=this.shadowRoot;
    root.getElementById('room-title-text').textContent=label;
    const toggle=root.getElementById('room-menu-toggle');
    toggle.querySelector('.room-menu-label').textContent=label;
    toggle.disabled=!ready;
  }

  setRoomMenu(open,{restoreFocus=false}={}) {
    const root=this.shadowRoot;
    const menu=root?.getElementById('room-menu');
    if(!menu)return;
    const toggle=root.getElementById('room-menu-toggle');
    open=Boolean(open&&this.compactRooms&&!toggle.disabled);
    if(open===!menu.hidden)return;
    if(open){
      this._v41?.endTileResize();
      menu.innerHTML=(this._v41?.showHomeTab?.()?`<button type="button" data-room-menu-option="-1" aria-current="${this.room===-1}">${this.escape(this.t('v2.home'))}</button>`:'')+this.rooms.map((room,index)=>`
        <button type="button" data-room-menu-option="${index}" aria-current="${index===this.room}">
          ${this.escape(this.roomName(room))}
        </button>
      `).join('');
    }
    menu.hidden=!open;
    root.querySelector('.room-menu-scrim').hidden=!open;
    toggle.setAttribute('aria-expanded',String(open));
    if(open)menu.querySelector('[aria-current="true"]')?.focus();
    else if(restoreFocus&&this.compactRooms)toggle.focus({preventScroll:true});
  }

  render() {
    this._homeRenderPending=false;this._mdiRenderPending=false;
    if(this.room===-1&&!this._v41?.showHomeTab?.())this.room=Math.min(this._lastRegularRoom,Math.max(0,this.rooms.length-1));
    const home=this.room===-1&&Boolean(this.rooms.length);
    const room = home?null:this.rooms[this.room];

    if (!home && !room) {
      this._v41?.endTileResize();
      this.cancelTabTransition();
      this.stopCamera();this.setRoomMenu(false);this.closeDeviceFilter();
      // Empty installations must retain an entry point in the room navigation.
      // Mobile uses the room-title button because the sidebar is hidden there.
      const isAdmin=Boolean(this._hass?.user?.is_admin);
      const addRoomLabel=this.t('vega.addRoom');
      this.shadowRoot.getElementById('rooms').innerHTML=isAdmin?
        `<button type="button" class="room room-empty-add" data-empty-add-room aria-label="${this.escape(addRoomLabel)}"><span class="ico" aria-hidden="true">＋</span><span class="room-name">${this.escape(addRoomLabel)}</span></button>`:
        `<span class="room room-empty-message">${this.escape(this.t('vega.adminOnly'))}</span>`;
      this.shadowRoot.getElementById('tabs').innerHTML='';
      this.setRoomTitle(isAdmin?`＋ ${addRoomLabel}`:'VEGA HOME',isAdmin);
      this.shadowRoot.getElementById('info').textContent='';
      this.shadowRoot.getElementById('content').innerHTML=`<div class="vega-home-empty"><h2>${this.escape(this.t('vega.emptyTitle'))}</h2><p>${this.escape(this.t('vega.emptyBody'))}</p>${this._hass?.user?.is_admin?`<button type="button" data-vega-setup>${this.escape(this.t('vega.setup'))}</button>`:`<p>${this.escape(this.t('vega.adminOnly'))}</p>`}</div>`;
      this.shadowRoot.querySelector('[data-vega-setup]')?.addEventListener('click',()=>this.openConfiguration({mode:'rooms'}));
      this.updateHeaderNowPlaying();return;
    }

    this.shadowRoot.getElementById(
      "rooms"
    ).innerHTML = (this._v41?.showHomeTab?.()?`<button class="room ${home?'selected':''}" data-room="-1" aria-label="${this.escape(this.t('v2.home'))}" aria-pressed="${home}"><span class="ico">${this.roomIcon('mdi:home')}</span><span class="room-name">${this.escape(this.t('v2.home'))}</span></button>`:'')+this.rooms.map(
      (item, index) => `
        <button
          class="room ${
            index === this.room
              ? "selected"
              : ""
          }"
          data-room="${index}"
          aria-label="${this.escape(this.roomName(item))}"
          aria-pressed="${
            index === this.room
          }">

          <span class="ico">
            ${this.roomIcon(item.icon)}
          </span>

          <span class="room-name">
            ${this.escape(this.roomName(item))}
          </span>

        </button>
      `
    ).join("");

    this.setRoomTitle(home?this.t('v2.home'):this.roomName(room),true);

    this.renderTabs();
    this.renderContent();
    this.updateHeaderNowPlaying();
  }

  /* : Restore the last room's DEVICE tab before lockscreen exit paints.
     Never allow a tap on the fading overlay to toggle an underlying tile. */
  restoreHomeFromScreensaver() {
    this.setRoomMenu(false);
    this._popup?.close?.();
    this._media?.close?.();
    this._musicPage?.close?.();
    this._v41?.close?.();
    this.closeConfirm?.();
    this.tab = 0;
    if (this.ready) { this.renderTabs(); this.renderContent(); this.updateHeaderNowPlaying(); }
  }

  cancelTabTransition() {
    const transition=this.tabTransition;
    if(!transition)return;
    this.tabTransition=null;
    for(const animation of transition.animations)animation.cancel();
    for(const image of transition.outgoing.querySelectorAll('.camera-image'))image.removeAttribute('src');
    transition.outgoing.remove();
    transition.content.classList.remove('is-tab-transitioning');
  }

  /* Keep at most one inert outgoing view and reuse its actual DOM. */
  switchTabAnimated(nextTab,{slide=false}={}) {
    nextTab=Math.max(0,Math.min(3,Number(nextTab)));
    if(!Number.isInteger(nextTab))return;
    this._v41?.endTileResize();
    if(nextTab===this.tab){
      if(!slide){this.renderTabs();this.renderContent();}
      return;
    }
    this.cancelTabTransition();
    const content=this.shadowRoot.getElementById('content');
    const direction=(nextTab>this.tab?1:-1)*(this.getAttribute('dir')==='rtl'?-1:1);
    const canAnimate=content.firstElementChild&&typeof content.animate==='function'&&
      !matchMedia('(prefers-reduced-motion: reduce)').matches&&
      !content.querySelector('.vega-camera-shell.is-expanded')&&
      (slide||(this.tab!==1&&nextTab!==1));
    if(!canAnimate){
      this.tab=nextTab;this.renderTabs();this.renderContent();return;
    }
    const outgoing=document.createElement('div');
    outgoing.className='vega-tab-outgoing';
    outgoing.inert=true;
    outgoing.setAttribute('aria-hidden','true');
    // Keep the outgoing scroll position and at most one camera stream.
    const scrollTop=content.firstElementChild?.matches('.vega-camera-shell')
      ? content.firstElementChild.querySelector('.v41-device-wrap')?.scrollTop||0
      : content.firstElementChild?.scrollTop||0;
    outgoing.append(...content.childNodes);
    this.stopCamera({retainImage:this.tab===1});
    this.tab=nextTab;
    this.renderTabs();this.renderContent();
    const incoming=content.firstElementChild;
    content.classList.add('is-tab-transitioning');
    content.append(outgoing);
    const oldViewport=outgoing.firstElementChild?.matches('.vega-camera-shell')
      ? outgoing.querySelector('.v41-device-wrap') : outgoing.firstElementChild;
    if(oldViewport)oldViewport.scrollTop=scrollTop;
    const timing={duration:slide?350:190,easing:slide?'cubic-bezier(.2,.75,.25,1)':'ease-out',fill:'both'};
    const from=slide?[{transform:'translateX(0)'},{transform:`translateX(${-direction*100}%)`}]
      :[{opacity:1},{opacity:0}];
    const to=slide?[{transform:`translateX(${direction*100}%)`},{transform:'translateX(0)'}]
      :[{opacity:0},{opacity:1}];
    const animations=[outgoing.animate(from,timing),incoming.animate(to,timing)];
    const transition={content,outgoing,animations};
    this.tabTransition=transition;
    Promise.allSettled(animations.map(animation=>animation.finished)).then(()=>{
      if(this.tabTransition===transition)this.cancelTabTransition();
    });
  }

  renderTabs() {
    const names = ['tab.devices','tab.camera','tab.scenes','tab.automation'];
    this.shadowRoot.getElementById('tabs').innerHTML = names.map((key,index) => `
      <button class="tab ${this.tab === index ? 'active' : ''}"
        data-tab="${index}" aria-pressed="${this.tab === index}">
        ${this.escape(this.t(key))}
      </button>`).join('');
    this.renderDeviceFilter();
  }

  renderContent() {
    this.clearFanMotion(this.shadowRoot.getElementById('content'));
    this._v41?.endTileResize();
    this.cancelTabTransition();
    this.stopCamera();
    this._cameraExpandedID=null;
    if (this.tab === 1 && this.cameraConfig()) this._screensaver?.suspend();
    else if (!this._surface?.hasModal() && !this._popup?.isOpen() && !this._musicPage?.isOpen()) this._screensaver?.resume();
    const content = this.shadowRoot.getElementById('content');
    content.scrollTop=0;
    if (this.tab === 1) this.renderCamera(content);
    else if (this.tab === 2 || this.tab === 3)
      this.renderActions(content, this.tab === 2 ? 'scenes' : 'automations');
    else this._v41.render(content);
    // Keep exactly one scroll owner per tab. In WKWebView the outer .content
    // scrollbar can remain visible (and scroll independently) even when its
    // nested device list hides the WebKit scrollbar.
    const first=content.firstElementChild;
    content.classList.toggle('vega-inner-scroll',Boolean(first?.matches(
      '.v41-device-wrap, .vega-camera-shell, .action-grid')));
    this.updateStates();
  }

  actionName(action) { return this.deviceName(action); }

  renderActions(content, category) {
    const isScene=category==='scenes';
    const entries=this.categoryEntries(category);
    if(!entries.length){
      content.innerHTML=`<div class="empty-tab"><span>${this.escape(this.t(isScene?'scenes.empty':'automation.empty'))}</span></div>`;
      return;
    }
    const cards=group=>`<div class="action-grid">${group.entries.map(({item:action,index})=>`
      <div class="action-card ${isScene?'scene-card':'automation-card'}" data-action-card="${index}" tabindex="0" role="group" aria-label="${this.escape(this.actionName(action))}" aria-keyshortcuts="Shift+F10">
        <div class="action-title">
          <span class="action-icon">${this.deviceIcon(action)}</span>
          <strong>${this.escape(this.actionName(action))}</strong>
        </div>
        <div class="action-bottom">
          <small class="action-status">${this.escape(this.t('status.loading'))}</small>
          <button type="button" data-action-type="${isScene?'scene':'automation'}"
            data-action-index="${index}">${this.escape(this.t(isScene?'scene.activate':'automation.disabled'))}</button>
        </div>
      </div>`).join('')}</div>`;
    if(this.room>=0)content.innerHTML=cards({entries});
    else content.innerHTML=`<div class="v41-device-wrap vega-all-home vega-home-actions">${this.categoryGroups(category,entries).map(group=>`
      <section class="vega-home-room-section" data-home-room="${group.index}">${this.homeSectionHeading(group.room)}${cards(group)}</section>`).join('')}</div>`;
    this.updateActionStates();
  }

  updateActionStates() {
    if(this.tab!==2&&this.tab!==3)return;
    const isScene=this.tab===2;
    const entries=this.categoryEntries(isScene?'scenes':'automations');
    const cards=new Map([...this.shadowRoot.querySelectorAll('#content [data-action-card]')]
      .map(card=>[Number(card.dataset.actionCard),card]));
    for(const {item:action,index} of entries){
      const card=cards.get(index);
      if(!card)continue;
      const entity=this._hass?.states?.[action.entity_id];
      const unavailable=!entity||['unavailable','unknown'].includes(entity.state);
      const busy=this.actionPending.has(action.entity_id);
      const active=!isScene&&entity?.state==='on';
      card.classList.toggle('is-enabled',active);
      card.classList.toggle('unavailable',unavailable);
      const status=card.querySelector('.action-status');
      const statusText=busy?this.t(isScene?'scene.running':'popup.sending'):
        unavailable?this.t('status.unavailable'):
        isScene?this.t('scene.ready'):this.t(active?'automation.enabled':'automation.disabled');
      const button=card.querySelector('[data-action-type]');
      const label=isScene?this.t('scene.activate'):this.t(active?'popup.turnOff':'popup.turnOn');
      if(status.textContent!==statusText)status.textContent=statusText;
      if(button.textContent!==label)button.textContent=label;
      if(button.disabled!==(unavailable||busy))button.disabled=unavailable||busy;
      if(button.getAttribute('aria-pressed')!==String(active))button.setAttribute('aria-pressed',String(active));
    }
  }

  async runAction(category,index) {
    const isScene=category==='scene';
    const action=this.categoryEntries(isScene?'scenes':'automations')[index]?.item;
    if(!action||!this._hass?.callService||this.actionPending.has(action.entity_id))return;
    const entity=this._hass.states?.[action.entity_id];
    if(!entity||['unavailable','unknown'].includes(entity.state))return;
    this.actionPending.add(action.entity_id);this.updateActionStates();
    try{
      await this._hass.callService(category,isScene?'turn_on':entity.state==='on'?'turn_off':'turn_on',
        {entity_id:action.entity_id});
    }catch(error){
      console.error('VEGA action:',action.entity_id,error);this.showError(this.t('error.control'));
    }finally{
      this.actionPending.delete(action.entity_id);this.updateActionStates();
    }
  }

  cameraConfig() {
    const entries=this.categoryEntries('cameras');
    const key=this.room===-1?'__home__':this.rooms[this.room]?.name;
    const id=this._cameraExpandedID||this._cameraSelection?.[key];
    return entries.find(({item})=>item.entity_id===id)?.item||entries[0]?.item||null;
  }
  cameraState() {
    const camera=this.cameraConfig();
    return camera?this._hass?.states?.[camera.entity_id]:null;
  }

  renderCamera(content) {
    const entries=this.categoryEntries('cameras');
    if(!entries.length){content.innerHTML=`<div class="empty-tab"><span>${this.escape(this.t('camera.empty'))}</span></div>`;return;}
    // Snapshots only in the tile grid; the enlarged popup owns the sole stream.
    const grids=this.categoryGroups('cameras',entries).map(group=>`
      ${this.room===-1?`<section class="vega-home-room-section" data-home-room="${group.index}">${this.homeSectionHeading(group.room)}`:''}
      <div class="cards devices v41-grid vega-camera-grid" aria-label="${this.escape(this.roomName(group.room))}">
      ${group.entries.map(({item:camera,index})=>`<button class="vega-camera-launch" type="button" data-camera-command="expand" data-camera-index="${index}" data-camera-id="${this.escape(camera.entity_id)}" aria-label="${this.escape(this.deviceName(camera))}">
        <span class="vega-camera-photo" data-camera-preview="${index}"><span class="camera-loading">${this.escape(this.t('camera.loading'))}</span></span>
        <span class="vega-camera-label"><span class="vega-camera-icon">${this.deviceIcon(camera)}</span><strong>${this.escape(this.deviceName(camera))}</strong><small data-cam-signal="${index}"></small></span>
      </button>`).join('')}</div>${this.room===-1?'</section>':''}`).join('');
    content.innerHTML=`<div class="vega-camera-shell${this.room===-1?' vega-home-camera':''}">
      <div class="v41-device-wrap vega-camera-list${this.room===-1?' vega-all-home':''}">${grids}</div>
      <div class="vega-camera-popover" aria-hidden="true" role="dialog" aria-modal="true" aria-label="${this.escape(this.t('camera.feed'))}">
        <div class="vega-camera-top"><span class="vega-camera-icon" data-camera-modal-icon></span><strong data-camera-modal-title></strong><button type="button" data-camera-command="close" aria-label="${this.escape(this.t('popup.close'))}">×</button></div>
        <div class="vega-camera-screen" data-camera-live-stage><span class="camera-loading">${this.escape(this.t('camera.loading'))}</span></div>
        <div class="vega-camera-controls"><button type="button" data-camera-switch="power" hidden><span>${this.escape(this.t('camera.power'))}</span><span class="camera-switch-indicator"></span></button></div>
      </div>
    </div>`;
    this._cameraSnapshotKeys=new Map();
    this._cameraVisible=new Set();
    const cards=content.querySelectorAll('[data-camera-index]');
    if(typeof IntersectionObserver==='function'){
      this._cameraObserver=new IntersectionObserver(records=>{
        for(const entry of records){
          const index=Number(entry.target.dataset.cameraIndex);
          if(entry.isIntersecting)this._cameraVisible.add(index);
          else this._cameraVisible.delete(index);
        }
        this.updateCameraView();
      },{root:content.querySelector('.vega-camera-list'),rootMargin:'80px'});
      cards.forEach(card=>this._cameraObserver.observe(card));
    }else cards.forEach(card=>this._cameraVisible.add(Number(card.dataset.cameraIndex)));
    this.cameraTimer=setInterval(()=>this.updateCameraView(true),7000);
    this.updateCameraView();
  }

  stopCamera({retainImage=false}={}) {
    clearInterval(this.cameraTimer);this.cameraTimer=null;
    clearInterval(this._cameraLiveTimer);this._cameraLiveTimer=null;
    this._cameraObserver?.disconnect();this._cameraObserver=null;
    this.cameraMode=null;this.cameraKey=null;
    if(!retainImage)this.cameraImage?.removeAttribute('src');
    this.cameraImage=null;
  }

  cameraStillUrl(camera,state) {
    if(!state||['unavailable','unknown','off'].includes(state.state))return '';
    const token=state.attributes?.access_token;
    const direct=state.attributes?.entity_picture;
    if(token)return `/api/camera_proxy/${encodeURIComponent(camera.entity_id)}?token=${encodeURIComponent(token)}`;
    return typeof direct==='string'&&direct.startsWith('/')?direct:`/api/camera_proxy/${encodeURIComponent(camera.entity_id)}`;
  }

  startCameraImage(state) {
    const stage=this.shadowRoot.querySelector('[data-camera-live-stage]');
    const camera=this.cameraConfig();
    if(!stage||!camera||!state||this.tab!==1||!this._cameraExpandedID)return;
    clearInterval(this._cameraLiveTimer);this._cameraLiveTimer=null;
    this.cameraImage?.removeAttribute('src');
    const token=state.attributes?.access_token;
    const picture=state.attributes?.entity_picture;
    const key=`${camera.entity_id}:${token||picture||''}`;
    this.cameraKey=key;this.cameraMode='stream';
    const image=document.createElement('img');this.cameraImage=image;
    image.className='camera-image';image.alt=this.deviceName(camera);
    image.referrerPolicy='same-origin';
    const stillUrl=this.cameraStillUrl(camera,state);
    const fallback=()=>{
      if(this.cameraImage!==image||this.cameraMode!=='stream')return;
      this.cameraMode='snapshot';
      const refresh=()=>{if(!image.isConnected||document.hidden)return;image.src=stillUrl+(stillUrl.includes('?')?'&':'?')+'_='+Date.now();};
      image.onerror=()=>{if(this.cameraImage!==image)return;clearInterval(this._cameraLiveTimer);this._cameraLiveTimer=null;stage.innerHTML=`<span class="camera-loading camera-failed">${this.escape(this.t('camera.unavailable'))}</span>`;this.cameraImage=null;};
      refresh();this._cameraLiveTimer=setInterval(refresh,7000);
    };
    image.onerror=fallback;
    stage.replaceChildren(image);
    image.src=`/api/camera_proxy_stream/${encodeURIComponent(camera.entity_id)}${token?'?token='+encodeURIComponent(token):''}`;
  }

  updateCameraView(force=false) {
    if(this.tab!==1||document.hidden||this._v41?.isRemoving())return;
    const cameras=this.categoryEntries('cameras').map(entry=>entry.item);
    const shell=this.shadowRoot.querySelector('.vega-camera-shell');
    if(!shell||shell.hidden)return;
    // Only visible previews request snapshots; they do not share MJPEG streams.
    let active=0;
    for(const [index,camera] of cameras.entries()){
      if(!this._cameraVisible.has(index)||active>=4)continue;
      active++;
      const stage=shell.querySelector(`[data-camera-preview="${index}"]`);
      const state=this._hass?.states?.[camera.entity_id];
      const src=this.cameraStillUrl(camera,state);
      const key=`${src}`;
      if(!stage)continue;
      if(!src){if(this._cameraSnapshotKeys.get(index)!=='offline'){stage.innerHTML=`<span class="camera-loading">${this.escape(this.t('camera.unavailable'))}</span>`;this._cameraSnapshotKeys.set(index,'offline');}continue;}
      if(force||this._cameraSnapshotKeys.get(index)!==key){
        this._cameraSnapshotKeys.set(index,key);
        // Preload off-DOM; keep the previous frame until the new still arrives.
        const preload=document.createElement('img');
        const url=src+(src.includes('?')?'&':'?')+'_='+Date.now();
        preload.onload=()=>{
          if(!stage.isConnected||this._cameraSnapshotKeys.get(index)!==key)return;
          let image=stage.querySelector('img');
          if(!image){image=document.createElement('img');image.className='camera-image';image.alt=this.deviceName(camera);stage.replaceChildren(image);}
          image.src=url;
        };
        preload.onerror=()=>{
          if(!stage.isConnected||this._cameraSnapshotKeys.get(index)!==key)return;
          if(!stage.querySelector('img'))stage.innerHTML=`<span class="camera-loading">${this.escape(this.t('camera.unavailable'))}</span>`;
        };
        preload.src=url;
      }
      const signal=this._hass?.states?.[camera.signal_entity];
      const el=shell.querySelector(`[data-cam-signal="${index}"]`);
      if(el){el.hidden=!camera.signal_entity;el.textContent=signal&&!['unknown','unavailable'].includes(signal.state)?String(signal.state)+(signal.attributes?.unit_of_measurement||''):'—';}
    }
    if(!this._cameraExpandedID)return;
    const camera=this.cameraConfig();
    if(!camera)return;
    const entity=this.cameraState();
    const stateKey=`${camera.entity_id}:${entity?.attributes?.access_token||entity?.attributes?.entity_picture||''}`;
    const available=Boolean(this.cameraStillUrl(camera,entity));
    if(!available){
      if(this.cameraImage){this.cameraImage.removeAttribute('src');this.cameraImage=null;}
      clearInterval(this._cameraLiveTimer);this._cameraLiveTimer=null;
      shell.querySelector('[data-camera-live-stage]').innerHTML=`<span class="camera-loading">${this.escape(this.t('camera.unavailable'))}</span>`;
      this.cameraKey=null;
    }else if(this.cameraKey!==stateKey)this.startCameraImage(entity);
    const button=shell.querySelector('[data-camera-switch="power"]');
    if(button){
      button.hidden=!camera.power_entity;
      const e=this._hass?.states?.[camera.power_entity];
      button.disabled=!e||['unknown','unavailable'].includes(e.state)||this.actionPending.has(camera.power_entity);
      const powered=e?.state==='on';button.classList.toggle('active',powered);button.setAttribute('aria-pressed',String(powered));
    }
  }

  async cameraService(domain,service,id,data={}) {
    if(!this._hass?.callService||this.actionPending.has(id))return false;
    const entity=this._hass.states?.[id];
    if(!entity||['unknown','unavailable'].includes(entity.state))return false;
    this.actionPending.add(id);this.updateCameraView();
    try{await this._hass.callService(domain,service,{entity_id:id,...data});return true;}
    catch(error){console.error('Camera service:',id,error);this.showError(this.t('error.control'));return false;}
    finally{this.actionPending.delete(id);this.updateCameraView();}
  }

  cameraCommand(button) {
    const command=button.dataset.cameraCommand;
    const shell=this.shadowRoot.querySelector('.vega-camera-shell');
    if(!shell)return;
    if(command==='expand'){
      const entries=this.categoryEntries('cameras');
      const id=button.dataset.cameraId||entries[Number(button.dataset.cameraIndex)]?.item?.entity_id;
      const camera=entries.find(({item})=>item.entity_id===id)?.item;
      if(!camera)return;
      this.cancelTabTransition();
      this._cameraExpandedID=id;
      this._cameraSelection||=Object.create(null);this._cameraSelection[this.room===-1?'__home__':this.rooms[this.room].name]=id;
      shell.querySelector('[data-camera-modal-title]').textContent=this.deviceName(camera);
      shell.querySelector('[data-camera-modal-icon]').innerHTML=this.deviceIcon(camera);
      shell.classList.add('is-expanded');shell.querySelector('.vega-camera-popover')?.setAttribute('aria-hidden','false');
      this.updateCameraView();
      shell.querySelector('[data-camera-command="close"]')?.focus({preventScroll:true});return;
    }
    if(command==='close'){
      shell.classList.remove('is-expanded');
      shell.querySelector('.vega-camera-popover')?.setAttribute('aria-hidden','true');
      clearInterval(this._cameraLiveTimer);this._cameraLiveTimer=null;
      this.cameraImage?.removeAttribute('src');this.cameraImage=null;this.cameraKey=null;this.cameraMode=null;
      const previous=this._cameraExpandedID;this._cameraExpandedID=null;
      [...shell.querySelectorAll('[data-camera-id]')].find(item=>item.dataset.cameraId===previous)?.focus({preventScroll:true});return;
    }
    if(button.dataset.cameraSwitch==='power'){
      const id=this.cameraConfig()?.power_entity,state=this._hass?.states?.[id]?.state;
      if(['on','off'].includes(state)){
        const off=state==='on';
        void this.cameraService('switch',off?'turn_off':'turn_on',id).then(ok=>{
          if(ok&&off)this.cameraCommand({dataset:{cameraCommand:'close'}});
        });
      }
    }
  }

  /* ĐỒNG BỘ TRẠNG THÁI */

  syncFanRotor(rotor,state) {
    if(!rotor)return;
    const rotors=this._fanRotors ||= new Map();
    for(const [node,entry] of rotors){
      if(this.shadowRoot.contains(node))continue;
      entry.animation?.cancel();rotors.delete(node);
    }
    const previous=rotors.get(rotor);
    if(previous?.state===state)return;
    const transform=getComputedStyle(rotor).transform;
    const matrix=transform.match(/matrix(?:3d)?\(([^)]+)\)/);
    const values=matrix?matrix[1].split(',').map(Number):[1,0];
    const angle=Math.atan2(values[1],values[0])*180/Math.PI;
    previous?.animation?.cancel();
    const entry={state,animation:null};
    rotors.set(rotor,entry);
    rotor.style.setProperty('--vega-fan-start',`${angle}deg`);
    rotor.style.removeProperty('transform');
    const coast=previous?.state==='on'&&state==='off'&&
      !matchMedia('(prefers-reduced-motion: reduce)').matches&&typeof rotor.animate==='function';
    if(!coast)return;
    const end=angle+450;
    const animation=rotor.animate([{transform:`rotate(${angle}deg)`},{transform:`rotate(${end}deg)`}],
      {duration:2000,easing:'cubic-bezier(.333333,.666667,.666667,1)',fill:'forwards'});
    entry.animation=animation;
    animation.finished.then(()=>{
      if(rotors.get(rotor)!==entry||entry.animation!==animation)return;
      rotor.style.setProperty('transform',`rotate(${end}deg)`);
      entry.animation=null;animation.cancel();
    }).catch(()=>{});
  }

  clearFanMotion(container=this.shadowRoot) {
    for(const [rotor,entry] of this._fanRotors||[]){
      if(this.shadowRoot.contains(rotor)&&!container?.contains(rotor))continue;
      entry.animation?.cancel();
      rotor.style.removeProperty('transform');
      rotor.style.removeProperty('--vega-fan-start');
      this._fanRotors.delete(rotor);
    }
  }

  updateStates() {
    if (!this.rooms.length || this.shadowRoot.querySelector('.app')?.hidden || this._surface?.hasModal()) return;

    // Device count stays accurate across Home/room categories, not only Devices.
    const entries=this.deviceEntries();
    const devices=entries.map(entry=>entry.device);
    const cards=new Map(Array.from(this.tab===0?
      this.shadowRoot.querySelectorAll('#content > .v41-device-wrap [data-device]'):[])
      .map(card=>[Number(card.dataset.device),card]));


    for (
      const [index, device]
      of devices.entries()
    ) {
      const info = this.stateInfo(device);


      const card=cards.get(index);

      if (!card) continue;

      const currentTemp=card.querySelector('.climate-current');
      if(currentTemp){
        const mode=this.stateOf(device)?.state||'off';
        const hvacMode=['heat','cool','dry','fan_only','auto'].includes(mode)?mode:'off';
        if(card.dataset.hvacMode!==hvacMode)card.dataset.hvacMode=hvacMode;
        const nextTemp=typeof info.roomTemperature==='number'
          ? `${info.roomTemperature.toFixed(1)}°`:'—°';
        if(currentTemp.textContent!==nextTemp)currentTemp.textContent=nextTemp;
      }

      this.syncFanRotor(card.querySelector('.vega-fan-rotor'),
        info.unavailable?'unavailable':info.on?'on':'off');
      card.classList.toggle(
        "on",
        info.on
      );

      card.classList.toggle(
        "unavailable",
        info.unavailable
      );

      card.classList.toggle(
        "busy",
        this.pending.has(device.entity_id)
      );

      const tileToggle=card.querySelector('[data-device-toggle]');
      const pressed=String(info.on),toggleLabel=`${this.deviceName(device)} · ${this.t(info.on?'tile.off':'tile.on')}`;
      if(tileToggle?.getAttribute('aria-pressed')!==pressed)tileToggle?.setAttribute('aria-pressed',pressed);
      if(tileToggle?.getAttribute('aria-label')!==toggleLabel)tileToggle?.setAttribute('aria-label',toggleLabel);
      // Passive sensors, locks and covers have no generic on/off command.
      // Never advertise a working toggle for a domain without a safe handler.
      const toggleDomain=device.entity_id.split('.')[0];
      const toggleSupported=['light','switch','fan','climate','media_player'].includes(toggleDomain);
      const disabled=info.unavailable||this.pending.has(device.entity_id)||!toggleSupported;
      if(tileToggle&&tileToggle.disabled!==disabled)tileToggle.disabled=disabled;
      card.classList.toggle('device-is-playing',device.entity_id.startsWith('media_player.')&&this.deviceKind(device)==='homepod'&&info.on);
      const cardLabel=`${this.deviceName(device)} · ${info.text}`;
      if(card.getAttribute('aria-label')!==cardLabel)card.setAttribute('aria-label',cardLabel);
      const statusNode=card.querySelector('.device-status'),statusText=this.tileStatus(device,info);
      if(statusNode&&statusNode.textContent!==statusText)statusNode.textContent=statusText;

    }

    const info =
      this.shadowRoot.getElementById(
        "info"
      );

    // The header no longer displays an always-on device counter. Preserve
    // the small status node only for transient command errors.
    if(info&&!this.errorTimer&&info.textContent)info.textContent='';
  }

  /* GỬI LỆNH ĐIỀU KHIỂN */

  async sendService(device, service) {
    if (!this._hass?.callService) return;

    const entityId = device.entity_id;

    if (this.pending.has(entityId)) {
      return;
    }

    const domain =
      entityId.split(".")[0];

    this.pending.add(entityId);
    this.updateStates();

    try {
      if(service==='turn_off')this.rememberDeviceState(entityId);
      if(service==='turn_on')await this.restoreDevice(entityId);
      else await this._hass.callService(domain,service,{entity_id:entityId});

    } catch (error) {
      console.error(
        this.t("error.deviceControl", {device:entityId}),
        error
      );

      this.showError(
        this.t("error.control")
      );

    } finally {
      this.pending.delete(entityId);
      this.updateStates();
    }
  }

  showError(message) {
    const info =
      this.shadowRoot.getElementById(
        "info"
      );

    if (!info) return;

    info.textContent = message;

    clearTimeout(this.errorTimer);

    this.errorTimer = setTimeout(
      () => {this.errorTimer=null;this.updateStates();},
      3500
    );
  }

  // The glyph is the toggle target; everywhere else on the card opens VEGA popup.
  requiresOffConfirmation(device) {
    // Confirmation applies to an actual power-off/pause command, not read-only
    // sensors, locks or covers with different action semantics.
    const domain=device?.entity_id?.split('.')[0];
    return ['light','switch','fan','climate','media_player'].includes(domain) &&
      (device.confirm_off===true||device.tap==='confirm-off'||device.kind==='printer');
  }

  toggleDevice(index,anchor=null) {
    const device=this.getDevice(index);if(!device)return;
    const info=this.stateInfo(device),domain=device.entity_id.split('.')[0];
    if(info.unavailable||this.pending.has(device.entity_id))return;
    if(this.requiresOffConfirmation(device)&&info.on){this.confirmOff(index,anchor);return;}
    if(domain==='climate'){
      const saved=this.lastDeviceSettings(device.entity_id);
      const modes=this._hass?.states?.[device.entity_id]?.attributes?.hvac_modes||[];
      const restore=(saved?.state && saved.state!=='off' && modes.includes(saved.state))?saved.state
        :(['auto','heat','cool','fan_only','dry'].find(m=>modes.includes(m)) || null);
      if(info.on)void this.sendClimateToggle(device,'off');
      else if(restore)void this.sendClimateToggle(device,restore);
      else this.showError(this.t('error.control'));
      return;
    }
    if(domain==='media_player'){
      if(!this._hass?.callService)return;
      const action=info.on?'media_pause':'media_play';
      this.pending.add(device.entity_id);this.updateStates();
      void this._hass.callService('media_player',action,{entity_id:device.entity_id})
        .catch(error=>{console.error('VEGA media toggle',error);this.showError(this.t('error.control'));})
        .finally(()=>{this.pending.delete(device.entity_id);this.updateStates();});
      return;
    }
    if(!['switch','light','fan'].includes(domain))return this.openDevicePopup(device,anchor);
    void this.sendService(device,info.on?'turn_off':'turn_on');
  }

  async sendClimateToggle(device,mode){
    if(!this._hass?.callService||this.pending.has(device.entity_id))return;
    const id=device.entity_id;
    this.pending.add(id);this.updateStates();
    try {
      if(mode==='off')this.rememberDeviceState(id);
      await this._hass.callService('climate','set_hvac_mode',{entity_id:id,hvac_mode:mode});
      if(mode!=='off')this.noteDeviceCommand?.(id,'climate','set_hvac_mode',{hvac_mode:mode});
    }catch(error){console.error('VEGA climate toggle',error);this.showError(this.t('error.control'));}
    finally{this.pending.delete(id);this.updateStates();}
  }

  openDevicePopup(device,anchor=null){
    if(!device)return;
    if(device.entity_id.startsWith('media_player.')){
      if(!this._media?.open(device,anchor))this.showError(this.t('error.control'));
      return;
    }
    if(!this._popup?.open(device,anchor)){
      if(!this._popup){this._pendingPopup={device,anchor};this.loadPopup();}
      else this.showError(this.t('error.control'));
    }
  }

  tapDevice(index,anchor=null){this.openDevicePopup(this.getDevice(index),anchor);}

  /* Confirmation policy is configured per device, not per visual type. */

  confirmOff(index,anchor=null) {
    const overlay =
      this.shadowRoot.getElementById(
        "confirm"
      );

    this._surface?.open('confirm',18);
    clearTimeout(this._v45ConfirmTimer);
    for(const raf of this._confirmOpenRAF)cancelAnimationFrame(raf);
    this._confirmOpenRAF=[];
    const epoch=++this._confirmEpoch;
    const device=this.getDevice(index);
    overlay.querySelector('#confirm-title').textContent=device?.confirm_message?.trim()||this.t('device.confirmDefault');
    overlay.dataset.index = index;
    overlay.hidden = false;
    overlay.querySelector('.confirm-dialog').classList.add('v43-prep');
    const dialog=overlay.querySelector('.confirm-dialog'),sr=anchor?.getBoundingClientRect?.(),frame=overlay.getBoundingClientRect();
    const naturalW=dialog.offsetWidth,naturalH=dialog.offsetHeight;
    if(sr&&naturalW&&naturalH){
      dialog.style.setProperty('--v43-origin-x',`${sr.left+sr.width/2-frame.left-frame.width/2}px`);
      dialog.style.setProperty('--v43-origin-y',`${sr.top+sr.height/2-frame.top-frame.height/2}px`);
      dialog.style.setProperty('--v43-origin-sx',String(Math.max(.1,sr.width/naturalW)));
      dialog.style.setProperty('--v43-origin-sy',String(Math.max(.1,sr.height/naturalH)));
    }
    overlay.classList.remove('v43-visible');void getComputedStyle(dialog).transform;
    const first=requestAnimationFrame(()=>{
      if(epoch!==this._confirmEpoch||overlay.hidden)return;
      dialog.classList.remove('v43-prep');
      const second=requestAnimationFrame(()=>{
        if(epoch===this._confirmEpoch&&!overlay.hidden)overlay.classList.add('v43-visible');
      });this._confirmOpenRAF.push(second);
    });this._confirmOpenRAF.push(first);
  }

  closeConfirm() {
    const overlay = this.shadowRoot.getElementById('confirm');
    this._popup?.onConfirmClose();
    ++this._confirmEpoch;
    for(const raf of this._confirmOpenRAF)cancelAnimationFrame(raf);
    this._confirmOpenRAF=[];
    if(overlay.hidden){this._surface?.close('confirm');return;}
    clearTimeout(this._v45ConfirmTimer);
    overlay.classList.remove('v43-visible');
    this._surface?.close('confirm');
    this._v45ConfirmTimer=setTimeout(()=>{
      if(!overlay.classList.contains('v43-visible')){
        overlay.hidden=true;delete overlay.dataset.index;
        this._surface?.close('confirm');
      }
    },220);
  }

  /* SỰ KIỆN CẢM ỨNG */

  bindEvents() {
    const root = this.shadowRoot;
    const content = root.getElementById('content');
    const roomMenu = root.getElementById('room-menu');
    const roomToggle = root.getElementById('room-menu-toggle');

    root.addEventListener(
      "click",
      event => {
        const filterMenu=root.getElementById('device-filter-popover');
        const filterButton=root.getElementById('device-filter-toggle');
        if(filterButton?.contains(event.target)){
          event.preventDefault();this.renderDeviceFilter();
          const open=filterMenu.hidden;this.closeDeviceFilter();filterMenu.hidden=!open;
          filterButton.setAttribute('aria-expanded',String(open));return;
        }
        const filterChoice=event.target.closest?.('[data-vega-filter-kind]');
        if(filterChoice&&filterMenu?.contains(filterChoice)){
          const kind=filterChoice.dataset.vegaFilterKind;
          if(kind==='all'||this.filterKinds().includes(kind))this._deviceFilter=kind;
          this.closeDeviceFilter();this.renderContent();filterButton?.focus({preventScroll:true});return;
        }
        if(filterMenu&&!filterMenu.hidden&&!filterMenu.contains(event.target))this.closeDeviceFilter();
        if(!roomMenu.hidden&&!roomMenu.contains(event.target)&&!roomToggle.contains(event.target)){
          this.setRoomMenu(false,{restoreFocus:true});
          return;
        }
        const button =
          event.target.closest("button, .v41-card[data-device]");

        if (!button) {
          return;
        }

        /*  — header Now Playing is a status button, not a transport. */
        if (button.id === 'header-nowplaying') {
          if(this.isLockAllowed())this.openMusicPage();
          else this.openActiveMediaPopup({anchor:button});
          return;
        }
        if (button === roomToggle) {
          if (!this.rooms.length) {
            if(this._hass?.user?.is_admin)this.openConfiguration({mode:'rooms'});
          } else this.setRoomMenu(roomMenu.hidden,{restoreFocus:true});
          return;
        }
        if (button.hasAttribute('data-empty-add-room')) {
          if(!this.rooms.length&&this._hass?.user?.is_admin)this.openConfiguration({mode:'rooms'});
          return;
        }

        if (button.id === "screen-power") {
          this.toggleScreenPower();
          return;
        }

        if (button.id === "screen-cancel-off") {
          this.closeScreenConfirm();
          return;
        }

        if (button.id === "screen-accept-off") {
          this.closeScreenConfirm();
          if (this.screenState() === "on") {
            void this.sendScreenService("turn_off");
          }
          return;
        }
        /* Cancel device power-off */

        if (button.id === "cancel-off") {
          this.closeConfirm();
          return;
        }

        /* Confirm device power-off */

        if (button.id === "accept-off") {
          const overlay =
            root.getElementById("confirm");

          const index = Number(
            overlay.dataset.index
          );

          const device =
            this.getDevice(index);

          this.closeConfirm();

          if (
            device &&
            !this.stateInfo(device).unavailable &&
            this.stateInfo(device).on
          ) {
            if(!this._popup?.confirmPowerOff(device)){
            const domain=device.entity_id.split('.')[0];
            if(domain==='climate')void this.sendClimateToggle(device,'off');
            else if(domain==='media_player')void this._hass?.callService('media_player','media_pause',{entity_id:device.entity_id});
            else if(['switch','light','fan'].includes(domain))void this.sendService(device,'turn_off');
          }
          }

          return;
        }

        /* Chuyển phòng */

        const roomOption=button.dataset.roomMenuOption;
        const roomIndex=roomOption??button.dataset.room;
        if(roomIndex!==undefined){
          if(roomOption!==undefined&&(roomMenu.hidden||!this.compactRooms))return;
          const index=Number(roomIndex);
          if(!Number.isInteger(index)||(index===-1?!this._v41?.showHomeTab?.():!this.rooms[index]))return;
          this._v41?.endTileResize();this.closeDeviceFilter();
          if(index>=0)this._lastRegularRoom=index;
          this.room=index;this._deviceFilter='all';this.rememberRoom();
          this.tab = 0;
          this.render();
          if(roomOption!==undefined)this.setRoomMenu(false,{restoreFocus:true});
          return;
        }

        /* Chuyển tab */

        if (
          button.dataset.tab !== undefined
        ) {
          this.switchTabAnimated(button.dataset.tab);
          return;
        }

        if (button.dataset.actionType && button.dataset.actionIndex !== undefined) {
          void this.runAction(button.dataset.actionType,Number(button.dataset.actionIndex));
          return;
        }

        if (button.dataset.cameraMove || button.dataset.cameraSwitch || button.dataset.cameraCommand) {
          this.cameraCommand(button);
          return;
        }

        if(button.dataset.deviceToggle !== undefined){
          event.stopPropagation();
          this.toggleDevice(Number(button.dataset.deviceToggle),button);
          return;
        }
        // Other parts of each tile (including labels) open the internal popup.
        if(button.dataset.device !== undefined){
          this.tapDevice(Number(button.dataset.device),button);
          return;
        }
      }
    );

    // Click/keyboard activation shares the same two-target contract.
    root.addEventListener('keydown',event=>{
      if(event.key!=='Enter'&&event.key!==' ')return;
      const card=event.target.closest?.('.v41-card[data-device]');
      if(!card||event.target.closest?.('button'))return;
      event.preventDefault();this.tapDevice(Number(card.dataset.device),card);
    });

    root.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&!roomMenu.hidden){
        event.stopPropagation();
        this.setRoomMenu(false,{restoreFocus:true});
      }
    });
    root.addEventListener('focusout',event=>{
      const inRoomMenu=node=>roomToggle.contains(node)||roomMenu.contains(node);
      if(!roomMenu.hidden&&event.relatedTarget&&inRoomMenu(event.target)&&!inRoomMenu(event.relatedTarget)){
        this.setRoomMenu(false);
      }
    });
    content.addEventListener('touchstart',event=>{
      this.swipeStart=null;
      if(this._v41?.isResizing()||event.touches.length!==1||event.target.closest('input, textarea, select, .vega-camera-shell.is-expanded'))return;
      const {identifier,clientX,clientY}=event.touches[0];
      this.swipeStart={identifier,clientX,clientY};
    },{passive:true});
    content.addEventListener('touchend',event=>{
      const start=this.swipeStart;
      this.swipeStart=null;
      if(!start||this._v41?.isResizing())return;
      const touch=Array.from(event.changedTouches).find(item=>item.identifier===start.identifier);
      if(!touch)return;
      const dx=touch.clientX-start.clientX,dy=touch.clientY-start.clientY;
      if(Math.abs(dx)<=65||Math.abs(dx)<=Math.abs(dy)*1.5)return;
      if(event.cancelable)event.preventDefault(); // A swipe is not a device tap.
      const direction=(dx<0?1:-1)*(this.getAttribute('dir')==='rtl'?-1:1);
      if(this.room>=0)this.switchTabAnimated(this.tab+direction,{slide:true});
    },{passive:false});
    content.addEventListener('touchcancel',()=>{this.swipeStart=null;},{passive:true});
  }

  /* CSS GỐC  — GIỮ KÍCH THƯỚC */

  styles() {
    return `
      :host {
        --vega-safe-top: env(safe-area-inset-top, 0px);
        --vega-compact-rooms: 0;
        display: block;
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        height: 100dvh;
        z-index: 20;
        font-family: -apple-system,
          BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        color: #f7f5fb;
        overflow: hidden;
        box-sizing: border-box;
      }

      * {
        box-sizing: border-box;
      }

      button {
        font: inherit;
        color: inherit;
        border: 0;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
      }

      button:focus-visible {
        outline: 2px solid #e1cbff;
        outline-offset: -2px;
      }

      /* FULL VIEWPORT */

      .app {
        --vega-home-padding: 14px;
        position: absolute;
        inset: 0;
        display: grid;
        grid-template-columns:
          180px minmax(0, 1fr);
        gap: 12px;
        padding: calc(var(--vega-home-padding) + var(--vega-safe-top)) var(--vega-home-padding) var(--vega-home-padding);
        background:
          radial-gradient(
            ellipse at 60% 0,
            #312b3b 0,
            transparent 60%
          ),
          #111116;
      }

      /* SIDEBAR */

      .side {
        min-height: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        padding: 12px 8px;
        border-radius: 17px;
        background: #24222b;
        border: 1px solid #ffffff12;
      }

      .rooms {
        flex: 1;
        min-height: 0;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
        overflow-x: hidden;
        overflow-y: auto;
        overscroll-behavior: contain;
        touch-action: pan-y;
        scrollbar-width: auto;
        scrollbar-gutter: stable;
        padding-inline-end: 5px;
      }

      .room {
        min-width: 0;
        display: flex;
        align-items: center;
        gap: 9px;
        padding: 0 8px;
        text-align: left;
        border-radius: 10px;
        background: transparent;
        color: #c0bbc8;
        font-size: 11px;
        font-weight: 650;
      }

      .room.selected {
        background: #41464f;
        color: white;
      }

      .room .ico {
        width: 22px;
        flex: none;
        display: grid;
        place-items: center;
        color: #bfc0c5;
      }

      .room.selected .ico {
        color: #f4ca66;
      }

      .room .ico svg {
        width: 20px;
        height: 20px;
      }

      .room span:last-child {
        line-height: 1.25;
      }

      /* MAIN LAYOUT */

      .main {
        display: grid;
        grid-template-rows:
          50px 40px minmax(0, 1fr) 19px;
        min-height: 0;
        min-width: 0;
        gap: 5px;
      }

      .head {
        padding: 0 4px;
        min-width: 0;
      }

      .head h1 {
        font-size: 26px;
        line-height: 1.1;
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .room-title { display: contents; }
      #room-menu-toggle, .room-menu, .room-menu-scrim { display: none; }

      /* Errors appear transiently without reserving a second title line. */
      .sub {
        position: absolute;
        top: calc(100% + 3px);
        left: 4px;
        max-width: min(360px, 80vw);
        padding: 5px 9px;
        border-radius: 8px;
        background: rgba(36,47,58,.94);
        color: #fff;
        font-size: 11px;
        pointer-events: none;
        box-shadow: 0 4px 12px #0003;
      }
      .sub:empty {display:none;}

      /* TABS */

      .tabs {
        display: grid;
        grid-template-columns:
          repeat(3, minmax(0, 1fr));
        gap: 4px;
        padding: 4px;
        background: #2a2732;
        border-radius: 12px;
      }

      .tab {
        border-radius: 9px;
        background: transparent;
        font-size: 12px;
        color: #c4becc;
        font-weight: 650;
      }

      .tab.active {
        background: #6c5d80;
        color: #fff;
      }

      /* CONTENT */

      .content {
        min-height: 0;
        min-width: 0;
        overflow: auto;
        touch-action: pan-y;
        overscroll-behavior: contain;
      }

      .cards {
        display: grid;
        grid-template-columns:
          repeat(2, minmax(0, 1fr));
        gap: 9px;
        height: 100%;
        min-height: 0;
        align-content: stretch;
      }

      .devices {
        grid-template-rows:
          repeat(var(--rows), minmax(0, 1fr));
      }

      /* DEVICE CARDS */

      .card {
        position: relative;
        min-width: 0;
        min-height: 0;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 11px;
        text-align: left;
        border-radius: 15px;
        background: #292731;
        border: 1px solid #ffffff12;
      }

      .card.on {
        background: linear-gradient(
          110deg,
          #443948,
          #352f3b
        );
        border-color: #907b9055;
      }

      .card:active {
        transform: scale(0.982);
      }

      .symbol {
        width: 39px;
        height: 39px;
        flex: none;
        display: grid;
        place-items: center;
        border-radius: 11px;
        background: #4c4757;
        color: #eee5fa;
        font-size: 22px;
      }

      .on .symbol {
        background: #91805d;
        color: #fff1cb;
      }

      .detail {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .detail strong {
        font-size: 12px;
        line-height: 1.2;
        white-space: normal;
        overflow-wrap: anywhere;
      }

      .detail small {
        font-size: 10px;
        color: #b9b3c0;
      }

      .on .detail small {
        color: #e4cdb6;
      }

      /* THIẾT BỊ KHÔNG KHẢ DỤNG */

      .card.unavailable {
        opacity: 0.42;
        filter: grayscale(1);
      }

      .card.busy {
        pointer-events: none;
      }

      /* EMPTY TABS */

      .empty-tab {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 10px;
        color: #d2cbda;
        text-align: center;
      }

      .empty-tab small {
        color: #98919f;
        font-size: 11px;
      }

      /* CONFIRM DIALOG */

      .confirm-overlay[hidden] {
        display: none !important;
      }

      .confirm-overlay {
        position: fixed;
        inset: 0;
        z-index: 320;
        display: grid;
        place-items: center;
        padding-top: var(--vega-safe-top);
        padding: 25px;
      }

      .confirm-dialog {
        width: min(330px, 100%);
        border-radius: 17px;
        padding: 20px;
      }

      .confirm-dialog strong {
        font-size: 17px;
      }

      .confirm-dialog p {
        font-size: 14px;
        line-height: 1.5;
      }

      .confirm-actions {
        display: flex;
        gap: 10px;
        margin-top: 16px;
      }

      .confirm-actions button {
        flex: 1;
        padding: 11px 8px;
        border-radius: 10px;
        font-size: 13px;
        font-weight: 650;
      }

      /* FOOTER */

      .foot {
        display: flex;
        align-items: end;
        justify-content: flex-start;
        color: #8b8594;
        font-size: 9px;
        padding: 0 2px;
      }

      /* SHORT VIEWPORT -  */

      @media (max-height: 410px) {
        .app {
          --vega-home-padding: 9px;
        }

        .main {
          grid-template-rows:
            44px 36px minmax(0, 1fr) 13px;
          gap: 4px;
        }

        .head h1 {
          font-size: 22px;
          margin: 0;
        }

        .card {
          padding: 7px 9px;
        }

        .symbol {
          width: 32px;
          height: 32px;
          font-size: 18px;
        }
      }

      /* NARROW VIEWPORT -  */

      @media (max-width: 680px) {
        .app {
          grid-template-columns:
            145px minmax(0, 1fr);
          gap: 8px;
          --vega-home-padding: 9px;
        }

        .side {
          padding: 8px 5px;
        }

        .room {
          font-size: 10px;
          padding: 0 5px;
          gap: 5px;
        }

        .room .ico {
          width: 19px;
        }

        .card {
          gap: 7px;
          padding: 8px;
        }

        .symbol {
          width: 30px;
          height: 30px;
          font-size: 17px;
        }

        .detail strong {
          font-size: 11px;
        }

        .tab {
          font-size: 10px;
        }
      }

      /*  — Header controls (no layout grid size changes) */

      .head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        position: relative;
        z-index: 5;
      }

      .head-copy {
        flex: 1;
        min-width: 0;
      }

      .head-actions {
        display: flex;
        flex: none;
        gap: 7px;
        align-items: center;
      }

      .head-action {
        width: 36px;
        height: 36px;
        display: grid;
        place-items: center;
        border-radius: 10px;
        background: #34313d;
        border: 1px solid #504a5a;
        color: #e8e5ed;
      }

      .head-action svg {
        width: 19px;
        height: 19px;
      }

      #theme-toggle { color: #e9d2a2; }
      #screen-power.screen-on { color: #f4ca66; }
      #screen-power.screen-off { color: #aaa5b4; }
      #screen-power:disabled { opacity: 0.42; }





      #screen-confirm #screen-accept-off {
        background: #914b4b;
      }

      /*  — Light palette; the original dark CSS above is unchanged. */
      :host([data-theme="light"]) {
        --light-background: #f2f2f7;
        --light-panel: #ffffff;
        --light-text: #24232b;
        --light-muted: #77727f;
        --light-border: #e1dfe7;
        color: var(--light-text);
      }

      :host([data-theme="light"]) .app {
        background: radial-gradient(
          ellipse at 60% 0, #fff 0, transparent 60%
        ), var(--light-background);
      }

      :host([data-theme="light"]) .side {
        background: var(--light-panel);
        border-color: var(--light-border);
      }

      :host([data-theme="light"]) .room { color: #5d5866; }
      :host([data-theme="light"]) .room.selected {
        background: #e8e9ed;
        color: var(--light-text);
      }
      :host([data-theme="light"]) .room .ico { color: #77727f; }
      :host([data-theme="light"]) .room.selected .ico { color: #b57c25; }



      :host([data-theme="light"]) .tabs { background: #e8e7ed; }
      :host([data-theme="light"]) .tab { color: #605b68; }
      :host([data-theme="light"]) .tab.active {
        background: #fff;
        color: var(--light-text);
      }

      :host([data-theme="light"]) .card {
        background: #fff;
        border-color: var(--light-border);
      }
      :host([data-theme="light"]) .card.on {
        background: linear-gradient(110deg, #fff0cb, #fff7e5);
        border-color: #e4cfa6;
      }
      :host([data-theme="light"]) .symbol {
        background: #eeeaf1;
        color: #686170;
      }
      :host([data-theme="light"]) .on .symbol {
        background: #e9cc8c;
        color: #634b18;
      }
      :host([data-theme="light"]) .detail strong { color: var(--light-text); }
      :host([data-theme="light"]) .detail small { color: #77727e; }
      :host([data-theme="light"]) .on .detail small { color: #806a45; }
      :host([data-theme="light"]) .empty-tab { color: #494450; }
      :host([data-theme="light"]) .empty-tab small { color: #827c88; }

      :host([data-theme="light"]) .head-action {
        background: #fff;
        border-color: var(--light-border);
        color: #57515e;
      }
      :host([data-theme="light"]) #theme-toggle { color: #ae7629; }
      :host([data-theme="light"]) #screen-power.screen-on { color: #b57c25; }
      :host([data-theme="light"]) #screen-power.screen-off { color: #77727f; }




      :host([data-theme="light"]) .foot { color: #77727f; }
      :host([data-theme="light"]) button:focus-visible { outline-color: #996fba; }
    `;
  }
}

/* ĐĂNG KÝ CUSTOM PANEL */

if (!customElements.get("vega-home")) {
  customElements.define(
    "vega-home",
    VegaHomePanel
  );
}
