import {expandImageURL,randomImageSource} from './vega-wallpaper.js?v=v200c1';

/* VEGA HOME: independent A/B/C surface coordinator; pointer-safe media seek unchanged. */

import {installLockScreenPower} from './vega-screen-power.js?v=v200c1';
export function installVegaScreensaver(panel) {
  if (panel._screensaver) return panel._screensaver;

  const root = panel.shadowRoot;
  const playerFadeMs=560;
  const lockAllowed=()=>panel.isLockAllowed();

  // ONLY CHANGE VALUES HERE WHEN CUSTOMIZING
  const OPTIONS = Object.freeze({
    idleMs: 60_000,
    slideMs: 300_000,
    autoFadeMs: 2_000,
    manualFadeMs: 450,
    enterFadeMs: 900,
    exitFadeMs: 620,
    volumeStep: 0.10, // 10 discrete levels: 1 (10%) through 10 (100%).
    maxImages: 300,
    photoCacheCount: 4,
    photoCacheBytes: 48 * 1024 * 1024,

  });

  const style = document.createElement("style");
  style.textContent = `
    #vega-saver[hidden] { display: none !important; }
    #vega-saver {
      position: fixed;
      inset: 0;
      z-index: 1000;
      overflow: hidden;
      /* Identical wallpaper token as Home. Surface coordinator controls
         z-index and opacity atomically for B -> A and A -> B. */
      background-color: #b9cbd5;
      background-image: var(--v41-wallpaper-image,none);
      background-size: cover;
      background-position: center;
      opacity: 0;
      transition: opacity ${OPTIONS.exitFadeMs}ms ease;
      touch-action: none;
      user-select: none;
      -webkit-user-select: none;
    }
    :host([data-theme="dark"]) #vega-saver { background-color:#151f2b; }
    #vega-saver.is-open { opacity: 1; }
    /* Once a lock photo has been decoded, the fallback below the slideshow
       MUST be the lock photo, never the Home wallpaper. This prevents Home's
       BG flashing through at subpixel seams or during a new photo decode. */
    #vega-saver.has-slide {background-image:var(--vega-lock-painted-image,none);}
    /* Slideshow is owned by Lock A. An opaque bottom image remains visible
       until the next decoded image is installed in the same 2-cell strip.
       Manual swipe translates ONE strip instead of two independent images. */
    #vega-saver .saver-photo-viewport {position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0;}
    /* Fixed 2-cell compositor: positions do not depend on flexbox layout,
       reorder or fractional child widths on WebKit. Only the track moves. */
    #vega-saver .saver-photo-track {
      position:absolute;top:0;left:0;width:100%;height:100%;display:block;
      backface-visibility:hidden;transform:translate3d(0,0,0);
    }
    #vega-saver .saver-photo-slot {
      position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;
      overflow:hidden;
    }
    #vega-saver .saver-photo-track[data-mode="slide"] {
      width:200%;will-change:transform;
    }
    #vega-saver .saver-photo-track[data-mode="slide"] .saver-photo-slot {
      width:50%;height:100%;opacity:1!important;
    }
    #vega-saver .saver-photo-slot .saver-image {
      position:absolute;top:0;left:-1px;width:calc(100% + 2px);height:100%;
      object-fit:cover;object-position:center;opacity:1;pointer-events:none;display:block;
    }
    /* Photo wait is part of Lock A, not a fullscreen backdrop/modal. */
    #vega-saver .saver-photo-wait {
      position:absolute;z-index:17;left:24px;bottom:26px;
      display:flex;align-items:center;gap:9px;max-width:calc(100% - 48px);
      padding:9px 13px;border-radius:15px;
      background:rgba(31,43,62,.66);color:#fff;
      border:1px solid rgba(255,255,255,.23);
      -webkit-backdrop-filter:blur(13px) saturate(1.12);
      backdrop-filter:blur(13px) saturate(1.12);
      font:600 12px/1.35 -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif;
      box-shadow:0 5px 15px rgba(4,9,18,.13);
      opacity:0;transform:translateY(6px);pointer-events:none;
      transition:opacity 190ms ease,transform 190ms ease;
    }
    #vega-saver .saver-photo-wait.is-visible {opacity:1;transform:translateY(0);}
    #vega-saver .saver-photo-wait svg {width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:2;}
    #vega-saver .saver-photo-wait.is-loading svg {animation:vega-photo-wait-spin .85s linear infinite;}
    @keyframes vega-photo-wait-spin {to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){
      #vega-saver .saver-photo-wait{transition:none;}
      #vega-saver .saver-photo-wait.is-loading svg{animation-duration:2.5s;}
    }

    /* Lock always owns the ONLY full-bleed photo, including while music plays.
       Artwork exists exclusively inside the player cover. */
    /* : follow the final render — a translucent liquid-glass panel with
       a fixed-height album cover on the right, plus a soft gradation seam. */
    #vega-saver .saver-music {
      position:absolute;inset:0;z-index:8;overflow:hidden;box-sizing:border-box;
      color:#fff;opacity:0;pointer-events:none;
      transition:opacity ${playerFadeMs}ms ease;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    }
    #vega-saver .saver-music.is-playing {opacity:1;pointer-events:auto;}
    /* During entry the incoming Lock is complete. Only the outgoing Home fades. */
    #vega-saver.is-preparing-lock .saver-music {transition:none;}
    #vega-saver .saver-music-shade {
      position:absolute;z-index:0;pointer-events:none;
      left:var(--saver-glass-left,68px);
      top:var(--saver-glass-top,90px);
      width:var(--saver-glass-width,664px);
      height:var(--saver-glass-height,300px);
      border-radius:9px;
      /* Glass shell is clear over the cover; blur is confined to ::before. */
      background:transparent;
      /* : static external halo + inner edge; no animated shadows. */
      box-shadow:
        0 0 7px rgba(105,175,255,.19),
        0 0 16px rgba(115,105,255,.10),
        inset 0 .5px 0 rgba(255,255,255,.38);
      overflow:hidden;
    }
    #vega-saver .saver-music-shade::before {
      content:'';position:absolute;left:0;top:0;bottom:0;pointer-events:none;
      width:50%;box-sizing:border-box;
      border-radius:9px 0 0 9px;
      border-right:1px solid rgba(255,255,255,.18);
      background:rgba(33,48,70,.40);
      -webkit-backdrop-filter:blur(13px) saturate(1.08);
      backdrop-filter:blur(13px) saturate(1.08);
      -webkit-mask-image:none;
      mask-image:none;
    }
    /* The right cover remains sharp: the border-only mask never covers its pixels. */
    #vega-saver .saver-music-shade::after {
      content:'';position:absolute;inset:0;z-index:2;pointer-events:none;
      border-radius:inherit;padding:1px;
      background:linear-gradient(120deg,
        rgba(186,239,255,.97) 0%,rgba(204,202,255,.68) 38%,
        rgba(137,191,255,.85) 70%,rgba(228,195,255,.88) 100%);
      -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
      -webkit-mask-composite:xor;mask-composite:exclude;
    }
    /* : classic straight seek bar, with a soft glow ONLY on played portion.
       Reuses  album color variables and the existing seek logic. */
    #vega-saver .saver-music-progress {position:relative;height:28px;display:block;min-width:0;}
    #vega-saver .saver-progress-track {
      position:absolute;left:0;right:0;top:0;height:15px;
      --saver-progress:0%;
    }
    #vega-saver .saver-progress-rail,
    #vega-saver .saver-progress-fill {
      position:absolute;left:0;top:5px;height:3px;border-radius:3px;
    }
    #vega-saver .saver-progress-rail {
      right:0;background:rgba(215,225,245,.27);
    }
    #vega-saver .saver-progress-fill {
      width:var(--saver-progress);
      background:linear-gradient(90deg,
        var(--saver-wave-color-1,#42dfff),
        var(--saver-wave-color-2,#8d92ff),
        var(--saver-wave-color-3,#d777ee));
      box-shadow:0 0 4px rgba(114,184,255,.57),0 0 9px rgba(151,120,255,.32);
    }
    #vega-saver .saver-progress-marker {
      position:absolute;left:var(--saver-progress);top:6.5px;
      width:6px;height:6px;border-radius:50%;pointer-events:none;
      background:#f1f5ff;transform:translate(-50%,-50%);
      box-shadow:0 0 5px rgba(182,190,255,.75);
      opacity:0;
    }
    #vega-saver .saver-progress-track.has-duration .saver-progress-marker {opacity:1;}
    #vega-saver .saver-progress-seek {
      position:absolute;left:0;right:0;top:0;width:100%;height:23px;
      margin:0;padding:0;opacity:0;cursor:pointer;
      z-index:6;pointer-events:auto;
      /* Let the range own horizontal touch movement; the overlay owns
         swipes only outside interactive controls. */
      touch-action:none;appearance:none;-webkit-appearance:none;
    }
    #vega-saver .saver-music-progress .saver-music-times {
      position:absolute;left:0;right:0;bottom:0;
    }
    :host([data-theme="light"]) #vega-saver .saver-progress-rail {
      background:rgba(59,75,98,.25);
    }
    #vega-saver .saver-music-content {
      position:absolute;z-index:2;
      left:var(--saver-content-left,96px);
      top:var(--saver-content-top,118px);
      width:var(--saver-content-width,276px);
      height:var(--saver-content-height,244px);
      box-sizing:border-box;
      display:grid;grid-template-rows:auto minmax(0,1fr) auto auto;
      gap:14px;
      padding:0;
      min-width:0;min-height:0;
    }
    #vega-saver .saver-music-source {display:flex;align-items:center;gap:10px;min-width:0;}
    #vega-saver .saver-source-icon {
      flex:none;width:34px;height:34px;border-radius:11px;
      display:grid;place-items:center;
      background:transparent;border:none;
    }
    #vega-saver .saver-source-icon svg {width:24px;height:24px;fill:none;
      stroke:currentColor;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round;}
    #vega-saver .saver-music-label {font-size:16px;font-weight:520;
      overflow:hidden;text-overflow:ellipsis;white-space:nowrap; letter-spacing:.01em;}
    #vega-saver .saver-music-copy {display:flex;flex-direction:column;
      justify-content:center;gap:8px;min-width:0;overflow:hidden;align-self:center;}
    #vega-saver .saver-music-title,#vega-saver .saver-music-artist {
      display:block;max-width:100%;white-space:nowrap;overflow:hidden;line-height:1.23;
    }
    #vega-saver .saver-music-title {font-size:clamp(28px,4.8vw,60px);font-weight:690; letter-spacing:-.03em;}
    #vega-saver .saver-music-artist {font-size:clamp(18px,3.1vw,28px);color:#d7dce7; letter-spacing:-.01em;}
    #vega-saver .saver-marquee-track {display:inline-block;white-space:nowrap;}
    #vega-saver .is-scrolling .saver-marquee-track {
      animation:saver-marquee var(--marquee-duration,11s) ease-in-out infinite;
    }
    @keyframes saver-marquee {
      0%,12% {transform:translateX(0)}
      55%,70% {transform:translateX(calc(-1 * var(--marquee-distance,0px)))}
      94%,100% {transform:translateX(0)}
    }
    #vega-saver .saver-music-times {display:flex;justify-content:space-between;
      color:rgba(250,252,255,.68);font-size:10px;font-variant-numeric:tabular-nums;}
    #vega-saver .saver-music-transport {display:flex;align-items:center;
      justify-content:flex-start;gap:clamp(9px,1.6vw,16px);min-width:0;}
    #vega-saver .saver-music-transport button {
      display:grid;place-items:center;flex:0 0 auto;
      width:46px;height:46px;min-width:0;padding:0;border:none;border-radius:0;
      background:transparent;color:inherit;box-shadow:none;
      touch-action:manipulation;cursor:pointer;
    }
    #vega-saver .saver-music-transport button svg {
      display:block;width:30px;height:30px;fill:none;
      stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;
    }
    #vega-saver .saver-music-transport .saver-play {width:54px;height:54px;}
    #vega-saver .saver-music-transport .saver-play svg {width:36px;height:36px;}
    #vega-saver .saver-music-transport .saver-volume-step {
      font-size:44px;font-weight:260;line-height:1;color:rgba(255,255,255,.93);
    }
    #vega-saver .saver-music-transport button:active:not(:disabled),
    #vega-saver .saver-album-actions button:active:not(:disabled) {
      transform:scale(.965);
    }
    /* Unframed speaker + level, below the panel. Visual glyph left aligns to the panel. */
    #vega-saver .saver-volume-toast {
      position:absolute;z-index:16;left:68px;bottom:26px;
      box-sizing:border-box;padding:0;min-width:0;
      border:0;border-radius:0;background:transparent;color:#fff;
      font-size:18px;font-weight:630;font-variant-numeric:tabular-nums;
      -webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none;
      opacity:0;transform:translateY(6px);pointer-events:none;
      transition:opacity 390ms ease,transform 390ms ease;
      display:flex;align-items:center;justify-content:flex-start;gap:10px;
      line-height:24px;
    }
    #vega-saver .saver-volume-toast.is-visible {opacity:1;transform:translateY(0);}
    #vega-saver .saver-volume-toast svg {
      width:24px;height:24px;flex:none;margin-left:-5px;color:#fff;
      fill:none;stroke:currentColor;stroke-width:1.9;
      stroke-linecap:round;stroke-linejoin:round;
    }
    /* Home and Music sit outside the panel at top-right. */
    #vega-saver .saver-album-actions {position:absolute;z-index:12;display:flex;gap:12px;}
    #vega-saver .saver-album-actions button {
      display:grid;place-items:center;flex:none;
      width:47px;height:47px;padding:0;box-sizing:border-box;
      border-radius:0;border:0;
      background:transparent;color:#fff;
      -webkit-backdrop-filter:none;backdrop-filter:none;
      box-shadow:none;
      touch-action:manipulation;cursor:pointer;
    }
    #vega-saver .saver-album-actions button svg {width:21px;height:21px;
      stroke:currentColor;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round;fill:none;
      filter:drop-shadow(0 1px 2px rgba(0,0,0,.5));}
    #vega-saver .saver-album-actions.is-compact button {width:38px;height:38px;border-radius:50%;}
    #vega-saver .saver-album-actions.is-compact button svg {width:18px;height:18px;}
    #vega-saver .saver-music button:disabled,#vega-saver .saver-music input:disabled {
      opacity:.36;cursor:default;
    }
    #vega-saver .saver-music button:focus-visible,#vega-saver .saver-music input:focus-visible {
      outline:2px solid #a6dcff;outline-offset:2px;
    }
    :host([data-theme="light"]) #vega-saver .saver-music {color:#202c3b;}
    :host([data-theme="light"]) #vega-saver .saver-music-shade {
      background:transparent;
      box-shadow:
        0 0 7px rgba(121,179,245,.20),
        0 0 16px rgba(171,140,235,.10),
        inset 0 .5px 0 rgba(255,255,255,.52);
    }
    :host([data-theme="light"]) #vega-saver .saver-music-shade::before {
      background:rgba(250,248,246,.44);
      border-right-color:rgba(255,255,255,.48);
    }
    :host([data-theme="light"]) #vega-saver .saver-music-artist {color:#4e5867;}
    :host([data-theme="light"]) #vega-saver .saver-music-times {color:#546070;}
    :host([data-theme="light"]) #vega-saver .saver-music-transport button {
      color:#243243;
    }
    :host([data-theme="light"]) #vega-saver .saver-album-actions button {
      background:transparent;color:#fff;border:0;
    }
    :host([data-theme="light"]) #vega-saver .saver-volume-toast {
      color:#fff;
    }
    #vega-saver .saver-music.is-small .saver-music-content {gap:10px;}
    #vega-saver .saver-music.is-small .saver-music-title {font-size:30px;}
    #vega-saver .saver-music.is-small .saver-music-artist {font-size:18px;}
    #vega-saver .saver-music.is-small .saver-source-icon {width:28px;height:28px;}
    #vega-saver .saver-music.is-small .saver-music-label {font-size:14px;}
    #vega-saver .saver-music.is-small .saver-music-transport button {width:40px;height:40px;}
    #vega-saver .saver-music.is-small .saver-music-transport .saver-play {width:46px;height:46px;}
    #vega-saver .saver-music.is-tiny .saver-music-content {gap:8px;}
    #vega-saver .saver-music.is-tiny .saver-music-title {font-size:24px;}
    #vega-saver .saver-music.is-tiny .saver-music-artist {font-size:15px;}
    #vega-saver .saver-music.is-tiny .saver-music-progress .saver-music-times {display:none;}
    #vega-saver .saver-music.is-tiny .saver-music-transport button {width:34px;height:34px;}
    #vega-saver .saver-music.is-tiny .saver-music-transport .saver-play {width:40px;height:40px;}
    @media(max-width:620px) {
      #vega-saver{--saver-clock-width:clamp(195px,32vw,215px);--saver-mini-gap:10px;}
      #vega-saver .saver-clock{font-size:clamp(66px,13.6vw,83px)}
      #vega-saver .saver-music-label {font-size:13px;}
      #vega-saver .saver-music-title {font-size:24px;}
      #vega-saver .saver-music-artist {font-size:16px;}
      #vega-saver .saver-music-transport {gap:18px;}
      #vega-saver .saver-music-transport button {width:36px;height:36px;}
      #vega-saver .saver-music-transport .saver-play {width:42px;height:42px;}
      #vega-saver .saver-album-actions button {width:42px;height:42px;}
    }
    @media(prefers-reduced-motion:reduce) {
      #vega-saver .saver-music {transition-duration:0ms!important;}
      #vega-saver .is-scrolling .saver-marquee-track,
      #vega-saver .is-scrolling .saver-mini-marquee-track {animation:none;}
    }
    #vega-saver {--saver-clock-width:clamp(290px,35vw,300px);--saver-mini-gap:18px;}
    #vega-saver .saver-clock {transition:opacity 650ms ease;}
    #vega-saver.has-music .saver-clock {opacity:0;}
    #vega-saver .saver-clock {
      --u: min(1vh, calc(80vw / 75));
      position: absolute;
      z-index: 2;
      left: calc(4 * var(--u));
      bottom: calc(2 * var(--u));
      color: white;
      font-size: calc(16 * var(--u));
      font-weight: 500;
      line-height: 1.1;
      white-space: nowrap;
      text-shadow: 3px 3px 6px rgba(0,0,0,0.6);
      pointer-events: none;
    }

    /* : frameless clock, matched to the 101px mini album height. */
    #vega-saver .saver-clock{
      left:var(--saver-panel-left,36px);bottom:24.5px;
      width:var(--saver-clock-width,252px);height:90px;box-sizing:border-box;
      border:0;border-radius:0;background:transparent;
      box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;
      display:flex;align-items:flex-start;justify-content:center;flex-direction:column;
      padding:0;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      font-weight:480;font-size:120px;line-height:90px;text-shadow:0 2px 7px #0008;
      font-variant-numeric:tabular-nums;opacity:1;
      transition:opacity 460ms ease,transform 550ms ease;
    }
    /* : time-only lock clock. Its line box matches the 90px Mini artwork. */
    #vega-saver .saver-clock-digits{display:block;height:90px;line-height:90px;font-weight:480;
      letter-spacing:-2.8px;white-space:nowrap;max-width:none;
      /* Real glyph proportions; never squeeze the clock horizontally or vertically. */
      transform:none;}
    #vega-saver.has-music:not(.is-mini) .saver-clock{opacity:0;transform:translateY(12px)}
    #vega-saver.has-music.is-mini .saver-clock{opacity:1;transform:translateY(0)}
    /* In mini mode reveal the real slideshow when a photograph exists. */
    #vega-saver .saver-mini{
      position:absolute;z-index:10;right:var(--saver-panel-left,36px);bottom:19px;
      /* Reserve actual glyph width + a clear gap; all remaining width goes to the seek rail. */
      width:calc(100% - 2 * var(--saver-panel-left,36px) - var(--saver-clock-width,252px) - var(--saver-mini-gap,18px));
      height:101px;display:flex;align-items:center;gap:12px;box-sizing:border-box;
      padding:10px 13px;border-radius:11px;border:1px solid rgba(178,219,255,.52);
      background:linear-gradient(128deg,rgba(63,80,108,.38),rgba(27,48,82,.36));
      -webkit-backdrop-filter:blur(17px) saturate(1.15);backdrop-filter:blur(17px) saturate(1.15);
      box-shadow:0 0 10px #8ab5ff28,inset 0 1px 0 #ffffff32;
      color:#fff;text-align:left;font-family:inherit;cursor:pointer;touch-action:manipulation;
      opacity:0;transform:translateY(12px);transition:opacity 440ms ease,transform 560ms cubic-bezier(.22,.74,.18,1);
      pointer-events:none;overflow:hidden;
    }
    #vega-saver.is-mini.has-music .saver-mini{opacity:1;transform:translateY(0);pointer-events:auto}
    #vega-saver .saver-mini-art,#vega-saver .saver-mini-fallback{width:79px;height:79px;flex:none;border-radius:7px;object-fit:cover}
    #vega-saver .saver-mini-art[hidden],#vega-saver .saver-mini-fallback[hidden]{display:none!important}
    #vega-saver .saver-mini-fallback{display:grid;place-items:center;background:#51648d;font-size:32px}
    #vega-saver .saver-mini-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
    #vega-saver .saver-mini-title{font-size:17px;font-weight:700;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #vega-saver .saver-mini-artist{font-size:12px;color:#d6dfea;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #vega-saver .saver-mini-progress{height:3px;margin-top:4px;background:#ffffff4a;border-radius:3px;position:relative;display:block;overflow:visible}
    #vega-saver .saver-mini-progress-fill{display:block;width:var(--mini-progress,0%);height:100%;border-radius:3px;background:linear-gradient(90deg,var(--saver-wave-color-1,#42dfff),var(--saver-wave-color-2,#8d92ff),var(--saver-wave-color-3,#d777ee));box-shadow:0 0 7px #718eff99}
    #vega-saver .saver-mini-times{display:flex;justify-content:space-between;color:#d8e3ef;font-size:10px;font-variant-numeric:tabular-nums}
    #vega-saver .saver-mini-wave{display:none;width:100%;height:26px;margin-top:0}
    #vega-saver .saver-mini.is-homepod .saver-mini-progress,
    #vega-saver .saver-mini.is-homepod .saver-mini-times{display:none}
    #vega-saver .saver-mini.is-homepod .saver-mini-wave{display:block}
    #vega-saver .saver-music-shade,#vega-saver .saver-music-content,#vega-saver .saver-volume-toast,#vega-saver .saver-album-actions{
      transition:opacity 390ms ease,transform 500ms ease;
    }
    #vega-saver.is-mini .saver-music-shade,#vega-saver.is-mini .saver-music-content,
    #vega-saver.is-mini .saver-volume-toast,#vega-saver.is-mini .saver-album-actions{opacity:0!important;pointer-events:none;transform:translateY(8px)}
    #vega-saver.is-mini .saver-music{pointer-events:none}
    #vega-saver .saver-morph-shell{position:fixed;z-index:45;pointer-events:none;box-sizing:border-box;overflow:hidden;border-radius:9px;border:1px solid rgba(159,215,255,.75);background:rgba(47,65,93,.28);box-shadow:0 0 10px #86b9ff60,inset 0 1px 0 #fff5;transform-origin:top left;will-change:transform,opacity}
    #vega-saver .saver-album-actions{gap:7px}
    #vega-saver .saver-album-actions button,
    #vega-saver .saver-album-actions.is-compact button{
      width:40px;height:40px;border-radius:11px;border:1px solid rgba(177,217,255,.46);
      background:linear-gradient(135deg,rgba(72,100,136,.37),rgba(33,55,84,.39));
      -webkit-backdrop-filter:blur(15px) saturate(1.12);backdrop-filter:blur(15px) saturate(1.12);
      box-shadow:0 0 7px #82bcff26,inset 0 1px 0 #fff3;color:#fff;
    }
    #vega-saver .saver-album-actions button svg{width:21px;height:21px}
    #vega-saver .saver-music.is-homepod .saver-progress-track{display:none}
    #vega-saver .saver-music.is-homepod .saver-music-progress{height:38px}
    #vega-saver .saver-music.is-homepod .saver-music-times{display:none}
    #vega-saver .saver-homepod-wave{display:none;width:100%;height:38px;overflow:visible}
    #vega-saver .saver-music.is-homepod .saver-homepod-wave{display:block}
    #vega-saver .saver-homepod-wave path{fill:none;stroke-linecap:round;stroke-linejoin:round}
    :host([data-theme="light"]) #vega-saver .saver-clock,
    :host([data-theme="light"]) #vega-saver .saver-mini,
    :host([data-theme="light"]) #vega-saver .saver-album-actions button{
      background:linear-gradient(133deg,rgba(65,85,111,.38),rgba(78,89,114,.38));border-color:#e5f5ff8a;color:#fff;
    }
    /* : mini is frameless; a content morph replaces the V4 glass-only shell. */
    #vega-saver .saver-mini{
      border:none!important;border-radius:0!important;background:transparent!important;
      -webkit-backdrop-filter:none!important;backdrop-filter:none!important;
      box-shadow:none!important;padding:5px 0 5px 8px!important;gap:10px!important;
    }
    #vega-saver .saver-mini-art,#vega-saver .saver-mini-fallback{width:90px;height:90px;border-radius:8px}
    #vega-saver .saver-mini-body{gap:5px}
    #vega-saver .saver-mini-art{transition:none!important}
    #vega-saver.is-morphing .saver-mini-art{opacity:0!important;transition:none!important}
    #vega-saver .saver-mini-title{font-size:15px}
    #vega-saver .saver-mini-artist{font-size:11px}
    /* : long Mini text scrolls just like Full; no ellipsis clipping. */
    #vega-saver .saver-mini-title,#vega-saver .saver-mini-artist{display:block;min-width:0;max-width:100%;text-overflow:clip}
    #vega-saver .saver-mini-marquee-track{display:inline-block;white-space:nowrap;max-width:none}
    #vega-saver .saver-mini-title.is-scrolling .saver-mini-marquee-track,
    #vega-saver .saver-mini-artist.is-scrolling .saver-mini-marquee-track{
      animation:saver-marquee var(--marquee-duration,12s) ease-in-out infinite;
    }
    #vega-saver.is-morphing .saver-mini-marquee-track,
    #vega-saver.is-morphing .saver-marquee-track{animation-play-state:paused!important}
    #vega-saver .saver-mini-controls{display:flex;align-items:center;gap:9px;margin-top:3px;pointer-events:auto}
    #vega-saver .saver-mini-controls button{width:31px;height:27px;flex:none;padding:2px;
      border:none;background:transparent;color:#fff;display:grid;place-items:center;touch-action:manipulation}
    #vega-saver .saver-mini-controls button svg{width:19px;height:19px;fill:none;stroke:currentColor;
      stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round}
    #vega-saver .saver-mini-controls button:disabled{opacity:.32}
    #vega-saver .saver-mini-progress{margin-top:3px}
    #vega-saver .saver-mini-times{font-size:9px}
    #vega-saver .saver-mini-wave{height:20px}
    #vega-saver .saver-morph-shell{background:rgba(49,67,95,.14);border:1px solid #b5d6ff6e;
      box-shadow:0 0 8px #8cb9ff44,inset 0 1px 0 #fff4}
    #vega-saver .saver-morph-art{position:fixed;z-index:46;display:block;overflow:hidden;
      pointer-events:none;max-width:none;max-height:none;will-change:left,top,width,height;image-rendering:auto}
    #vega-saver .saver-morph-art img{display:block;width:100%;height:100%;object-fit:cover;
      object-position:center center;transform-origin:center center;}
    #vega-saver.is-collapsing .saver-music-shade{transition:opacity 130ms linear!important;}
    #vega-saver.is-expanding .saver-music-shade{transition:opacity 340ms ease!important;}
    #vega-saver.is-morphing .saver-morph-shell{background:transparent!important;}
    /* A pair of real text elements travels along with the album during Full/Mini morph. */
    #vega-saver .saver-morph-copy{position:fixed;z-index:44;pointer-events:none;box-sizing:border-box;
      overflow:hidden;white-space:nowrap;text-overflow:ellipsis;line-height:1.2;
      color:#fff;text-shadow:0 2px 7px #000b,0 0 2px #101828;transform-origin:top left;
      -webkit-font-smoothing:antialiased;will-change:left,top,width,font-size,opacity}
    #vega-saver .saver-morph-copy.artist{color:#dde6f3;font-weight:500}
    #vega-saver .saver-mini-title,#vega-saver .saver-mini-artist{
      text-shadow:0 2px 6px rgba(0,0,0,.94),0 0 12px rgba(0,0,0,.72)}
    #vega-saver.is-morphing .saver-music-title,
    #vega-saver.is-morphing .saver-music-artist,
    #vega-saver.is-morphing .saver-mini-title,
    #vega-saver.is-morphing .saver-mini-artist{visibility:hidden!important}
    #vega-saver .saver-morph-text{position:absolute;left:4%;top:40%;max-width:45%;font-size:25px;
      font-weight:700;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      text-shadow:0 2px 6px #0008;pointer-events:none}
    :host([data-theme="light"]) #vega-saver .saver-clock,
    :host([data-theme="light"]) #vega-saver .saver-mini{background:transparent!important;border:none!important;box-shadow:none!important;color:#fff}
    @media(max-width:620px){
      #vega-saver .saver-clock{font-size:clamp(36px,10.5vw,64px);padding:0;height:90px}
      #vega-saver .saver-mini{height:90px;padding:7px;gap:7px}
      #vega-saver .saver-mini-art,#vega-saver .saver-mini-fallback{width:67px;height:67px}
      #vega-saver .saver-mini-title{font-size:12px}
      #vega-saver .saver-mini-artist{font-size:10px}
    }
    @media(prefers-reduced-motion:reduce){
      #vega-saver .saver-mini,#vega-saver .saver-clock,#vega-saver .saver-music-content{transition-duration:0ms!important}
    }
    /*  — one persistent glass, one artwork, and one pair of visible labels.
       Mini = 45px; animations use the SAME real nodes across both endpoints. */
    #vega-saver{--saver-clock-width:160px;--saver-mini-gap:20px}
    #vega-saver .saver-clock{
      left:var(--saver-panel-left,36px);bottom:24px;width:auto;min-width:0;
      height:45px;font-size:61px;font-weight:460;line-height:45px;
      letter-spacing:-1.6px;align-items:center;justify-content:flex-start;
      padding:0;border:0;background:transparent!important;box-shadow:none!important;
      backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
      transform:none;transition:opacity 580ms cubic-bezier(.4,0,.2,1)!important;
      font-variant-numeric:tabular-nums;text-shadow:0 2px 8px #0009;
    }
    #vega-saver .saver-clock-digits{height:45px;line-height:45px;letter-spacing:-1.6px;transform:none!important}
    #vega-saver.has-music:not(.is-mini) .saver-clock{opacity:0;transform:none!important}
    #vega-saver.has-music.is-mini .saver-clock{opacity:1;transform:none!important}
    #vega-saver .saver-mini{
      right:var(--saver-panel-left,36px);bottom:24px;
      width:clamp(220px,calc(35vw - 50px),620px);height:45px!important;
      display:flex;align-items:center;gap:7px!important;padding:0!important;
      background:transparent!important;border:none!important;border-radius:0!important;
      box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;
      opacity:0;transform:none!important;transition:opacity 580ms cubic-bezier(.4,0,.2,1)!important;
      pointer-events:none;
    }
    #vega-saver.is-mini.has-music .saver-mini{opacity:1;transform:none!important;pointer-events:auto}
    #vega-saver .saver-mini-art-slot{
      width:45px;height:45px;min-width:45px;flex:0 0 45px;
      position:relative;display:block;pointer-events:none;
    }
    #vega-saver .saver-mini-fallback{
      position:absolute;inset:0;width:45px!important;height:45px!important;
      border-radius:5px;font-size:23px;
    }
    #vega-saver .saver-mini-body{
      flex:1;min-width:0;height:45px;display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      grid-template-rows:16px 12px 17px;gap:0;
      align-items:center;
    }
    #vega-saver .saver-mini-title,#vega-saver .saver-mini-artist{
      grid-column:1/-1;min-width:0;visibility:hidden!important;
      display:block;max-width:100%;font-weight:650;
    }
    #vega-saver .saver-mini-title{grid-row:1;font-size:11px!important;line-height:16px}
    #vega-saver .saver-mini-artist{grid-row:2;font-size:9px!important;line-height:12px}
    #vega-saver .saver-mini-progress{
      grid-row:3;grid-column:1;height:3px;min-width:0;
      margin:0 5px 0 0!important;align-self:center;
    }
    #vega-saver .saver-mini-controls{
      grid-column:2;grid-row:3;display:flex;align-items:center;
      gap:3px;margin:0!important;height:17px;flex:none;
    }
    #vega-saver .saver-mini-controls button{
      width:18px;height:17px;min-width:18px;padding:0;
    }
    #vega-saver .saver-mini-controls button svg{width:14px;height:14px;stroke-width:1.9}
    #vega-saver .saver-mini-times{display:none!important}
    #vega-saver .saver-mini-wave{grid-row:3;grid-column:1;height:15px;margin:0 5px 0 0;width:calc(100% - 5px)}
    #vega-saver .saver-mini.is-homepod .saver-mini-wave{display:block}
    /* The real V4 glass shell, not a temporary duplicate, moves into the Mini. */
    #vega-saver .saver-music-shade{
      opacity:1!important;transform:none!important;
      will-change:left,top,width,height,border-radius;
      transition:none!important;
    }
    #vega-saver.is-mini .saver-music-shade{
      opacity:1!important;transform:none!important;pointer-events:none;
    }
    #vega-saver .saver-music-shade::before{
      transition:width 580ms cubic-bezier(.4,0,.2,1),background 580ms ease;
    }
    #vega-saver.is-mini .saver-music-shade::before{
      width:100%;border-right-color:transparent;border-radius:inherit;
      background:rgba(47,65,91,.35);
    }
    :host([data-theme="light"]) #vega-saver.is-mini .saver-music-shade::before{
      background:rgba(87,106,128,.37);
    }
    #vega-saver .saver-mini-art{position:absolute!important;inset:0;width:100%!important;height:100%!important;
      border-radius:0!important;object-fit:cover;display:block}
    #vega-saver .saver-shared-art-frame{
      position:absolute;z-index:11;overflow:hidden;pointer-events:none;
      border-radius:0 9px 9px 0;will-change:left,top,width,height,border-radius;
      box-shadow:0 2px 8px #0005;
    }
    /* The previous  selector hid the mini image during every morph.
       This is now the SAME moving image, so keep it visible throughout. */
    #vega-saver.is-morphing .saver-shared-art-frame .saver-mini-art{opacity:1!important}
    #vega-saver .saver-shared-art-frame .saver-mini-art[hidden]{display:none!important}
    #vega-saver .saver-shared-art-frame .saver-mini-art{transform:scale(1.06);transform-origin:center center;
      transition:none!important;}
    #vega-saver .saver-shared-art-frame .saver-art-old{
      position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;
    }
    #vega-saver .saver-music-title,#vega-saver .saver-music-artist{visibility:hidden!important}
    #vega-saver .saver-shared-title,#vega-saver .saver-shared-artist{
      position:absolute;z-index:12;pointer-events:none;overflow:hidden;white-space:nowrap;
      box-sizing:border-box;line-height:1.2;color:#fff;
      -webkit-font-smoothing:antialiased;will-change:left,top,width,height,font-size;
      text-shadow:0 2px 7px #0009;
    }
    #vega-saver .saver-shared-title{font-weight:690;letter-spacing:-.025em}
    #vega-saver .saver-shared-artist{font-weight:500;color:#dce4ed}
    #vega-saver .saver-shared-text-track{display:inline-block;max-width:none;white-space:nowrap}
    #vega-saver .saver-shared-title.is-scrolling .saver-shared-text-track,
    #vega-saver .saver-shared-artist.is-scrolling .saver-shared-text-track{
      animation:saver-marquee var(--marquee-duration,12s) ease-in-out infinite;
    }
    #vega-saver.is-morphing .saver-shared-text-track{animation-play-state:paused!important}
    #vega-saver.is-mini .saver-shared-title,#vega-saver.is-mini .saver-shared-artist{
      color:#fff;text-shadow:0 2px 6px #000f,0 0 10px #000a;
    }
    /* Keep light-theme labels AND the original dark transport icons legible.
       Restrict the brighter glass to the left half of FULL mode only. */
    :host([data-theme="light"]) #vega-saver:not(.is-mini) .saver-music-shade::before{
      background:rgba(238,244,250,.78);
    }
    :host([data-theme="light"]) #vega-saver:not(.is-mini) .saver-shared-title{color:#202c3b;text-shadow:0 1px 3px #fffa}
    :host([data-theme="light"]) #vega-saver:not(.is-mini) .saver-shared-artist{color:#4e5867;text-shadow:0 1px 3px #fffa}
    #vega-saver.is-mini .saver-music-content,#vega-saver.is-mini .saver-volume-toast,
    #vega-saver.is-mini .saver-album-actions{opacity:0!important;pointer-events:none;transform:translateY(8px)}
    /* CSS-only row layout scales its TRACK, never album, labels or controls. */
    @media(max-width:620px){
      #vega-saver{--saver-clock-width:130px;--saver-mini-gap:10px}
      #vega-saver .saver-clock{font-size:clamp(42px,9.5vw,61px);height:45px;line-height:45px}
      #vega-saver .saver-mini{width:clamp(200px,calc(45vw - 30px),220px);height:45px!important;padding:0!important;gap:6px!important}
      #vega-saver .saver-mini-art-slot,#vega-saver .saver-mini-fallback{width:45px!important;height:45px!important;min-width:45px}
    }
    @media(prefers-reduced-motion:reduce){
      #vega-saver .saver-mini,#vega-saver .saver-clock{transition:none!important}
    }
    /* Lock photo stays behind Mini and Full; album cover remains inside the player. */
    /* One glass shell morphs between the two endpoints. The Mini has no artwork
       or transport buttons: title, artist and a responsive progress line only. */
    #vega-saver .saver-mini{
      left:50%!important;right:auto!important;bottom:24px!important;
      width:clamp(350px,42vw,680px)!important;min-width:210px;
      height:64px!important;box-sizing:border-box;
      padding:10px 17px!important;gap:0!important;
      transform:translateX(-50%)!important;
      background:transparent!important;border:none!important;
      display:flex;align-items:center;
    }
    #vega-saver.is-mini.has-music .saver-mini,
    #vega-saver:not(.is-mini) .saver-mini{transform:translateX(-50%)!important}
    #vega-saver .saver-mini-art-slot{display:none!important}
    #vega-saver .saver-mini-body{
      width:100%;height:44px;display:grid;grid-template-columns:minmax(0,1fr);
      grid-template-rows:18px 14px 12px;gap:0;align-items:center;
    }
    #vega-saver .saver-mini-title,#vega-saver .saver-mini-artist{
      grid-column:1!important;overflow:hidden;max-width:100%;
      text-overflow:clip;white-space:nowrap;
    }
    #vega-saver .saver-mini-title{grid-row:1;font-size:14px!important;line-height:18px}
    #vega-saver .saver-mini-artist{grid-row:2;font-size:11px!important;line-height:14px}
    #vega-saver .saver-mini-progress{
      grid-column:1!important;grid-row:3!important;width:100%!important;
      margin:5px 0 0!important;height:3px;min-width:0;
    }
    #vega-saver .saver-mini-wave{
      grid-column:1!important;grid-row:3!important;width:100%!important;
      height:13px;margin:0!important;
    }
    #vega-saver .saver-mini-controls,#vega-saver .saver-mini-times{display:none!important}
    #vega-saver .saver-shared-art-frame{will-change:left,top,width,height,opacity}
    #vega-saver.is-mini:not(.is-morphing) .saver-shared-art-frame{opacity:0!important}
    #vega-saver .saver-shared-title,#vega-saver .saver-shared-artist{
      text-shadow:0 2px 8px #000a;
    }
    #vega-saver.is-mini .saver-music-shade::before{
      background:rgba(43,58,82,.37)!important;
      -webkit-backdrop-filter:blur(15px) saturate(1.12);
      backdrop-filter:blur(15px) saturate(1.12);
    }
    :host([data-theme="light"]) #vega-saver.is-mini .saver-music-shade::before{
      background:rgba(87,104,128,.38)!important;
    }
    @media(max-width:700px){
      #vega-saver .saver-mini{width:min(290px,calc(100vw - 390px))!important;
        min-width:190px;height:64px!important;padding:10px 12px!important}
    }

    /* === : approved 800x480 concept. Keep geometry identical to actual Chrome render. === */
    #vega-saver {
      --saver-v46-ease:cubic-bezier(.4,0,.2,1);
      --saver-mini-height:40px;
      --saver-mini-width:clamp(320px,43vw,560px);
    }
    /* Music glass is local to the player; it never creates another full-screen BG. */
    #vega-saver .saver-music-shade {
      background:linear-gradient(131deg,rgba(105,112,147,.47),rgba(89,94,122,.42) 58%,rgba(120,115,138,.40))!important;
      -webkit-backdrop-filter:blur(18px) saturate(1.15);
      backdrop-filter:blur(18px) saturate(1.15);
      border:1px solid rgba(239,245,255,.70)!important;
      box-shadow:0 0 11px rgba(188,191,255,.31),0 0 23px rgba(104,166,255,.19),inset 0 1px 0 rgba(255,255,255,.40)!important;
      border-radius:20px;
      overflow:hidden;
      will-change:left,top,width,height,border-radius;
    }
    #vega-saver .saver-music-shade::before,
    #vega-saver .saver-music-shade::after{display:none!important}
    :host([data-theme="light"]) #vega-saver .saver-music-shade{
      background:linear-gradient(131deg,rgba(116,130,156,.62),rgba(104,109,133,.53) 58%,rgba(124,122,142,.51))!important;
      border-color:rgba(255,255,255,.75)!important;
    }
    #vega-saver.is-mini .saver-music-shade{
      background:linear-gradient(127deg,rgba(83,90,119,.49),rgba(101,105,133,.40))!important;
      box-shadow:0 0 8px rgba(175,201,255,.25),inset 0 1px 0 rgba(255,255,255,.27)!important;
      border-radius:12px;
    }
    #vega-saver .saver-shared-art-frame{
      border:0!important;box-shadow:none!important;border-radius:15px;
      background:rgba(18,31,52,.19);overflow:hidden;
    }
    #vega-saver .saver-shared-art-frame .saver-mini-art{
      object-fit:contain!important;object-position:center!important;
      transform:none!important;border:0!important;box-shadow:none!important;
    }
    #vega-saver .saver-shared-art-frame .saver-art-old {object-fit:contain!important}
    #vega-saver .saver-music-content{
      z-index:3!important;display:block!important;padding:0!important;min-width:0!important;overflow:visible!important;
      transform:scale(var(--saver-v46-fit,1));transform-origin:left top;
    }
    #vega-saver .saver-music-source{
      position:absolute;left:0;top:0;height:26px;width:auto;padding:3px 9px 3px 6px;
      background:rgba(235,240,255,.17);border-radius:19px;gap:7px;
    }
    #vega-saver .saver-source-icon{width:18px!important;height:18px!important;border-radius:0}
    #vega-saver .saver-source-icon svg{width:18px;height:18px}
    #vega-saver .saver-music-label{font-size:12px!important;font-weight:520}
    #vega-saver .saver-music-copy{
      position:absolute;left:0;right:0;top:49px;height:55px!important;
      display:block!important;overflow:hidden;min-width:0;width:100%;
    }
    #vega-saver .saver-music-title,#vega-saver .saver-music.is-small .saver-music-title,#vega-saver .saver-music.is-tiny .saver-music-title{
      font-size:27px!important;line-height:33px!important;font-weight:710;letter-spacing:-.026em;
    }
    #vega-saver .saver-music-artist,#vega-saver .saver-music.is-small .saver-music-artist,#vega-saver .saver-music.is-tiny .saver-music-artist{
      font-size:16px!important;line-height:21px!important;color:#e6e9f1;
    }
    #vega-saver .saver-shared-title,#vega-saver .saver-shared-artist{
      overflow:hidden;white-space:nowrap;line-height:1.2!important;
      font-weight:700;color:#fff;text-shadow:0 1px 6px #0004;
    }
    #vega-saver .saver-shared-artist{font-weight:450;color:rgba(245,249,255,.82)}
    #vega-saver .saver-mini{
      left:50%!important;right:auto!important;top:auto!important;bottom:25px!important;
      width:var(--saver-mini-width)!important;min-width:0!important;
      height:var(--saver-mini-height)!important;
      padding:0!important;display:block!important;border:0!important;background:transparent!important;
      box-shadow:none!important;transform:translateX(-50%)!important;
      opacity:0;transition:opacity 700ms var(--saver-v46-ease)!important;z-index:10;
    }
    #vega-saver.is-mini.has-music .saver-mini {opacity:1;pointer-events:auto}
    #vega-saver .saver-mini-body{
      width:100%;height:100%!important;display:block!important;position:relative;
    }
    #vega-saver .saver-mini-title,#vega-saver .saver-mini-artist{
      display:block!important;position:absolute;left:12px;width:calc(46% - 12px);
      overflow:hidden;max-width:none!important;visibility:hidden!important;
      color:#fff;line-height:1.2!important;
    }
    #vega-saver .saver-mini-title{top:4px;font-size:12px!important;font-weight:700}
    #vega-saver .saver-mini-artist{top:20px;font-size:10px!important;font-weight:450}
    #vega-saver .saver-mini-progress{
      position:absolute;left:50%;right:12px;top:calc((var(--saver-mini-height) - 14px)/2);
      width:auto!important;height:14px;margin:0!important;
      background:transparent!important;box-shadow:none!important;opacity:0!important;
    }
    #vega-saver .saver-mini-controls,#vega-saver .saver-mini-wave,
    #vega-saver .saver-mini-times,#vega-saver .saver-mini-art-slot{display:none!important}
    #vega-saver .saver-shared-title,#vega-saver .saver-shared-artist{
      text-shadow:0 2px 5px rgba(0,0,0,.72);
    }
    #vega-saver.is-mini .saver-shared-title{font-weight:700}
    #vega-saver.is-mini .saver-shared-artist{color:#f7f8ffdd}
    #vega-saver .saver-full-progress-placeholder{
      position:absolute;left:0;right:0;top:119px;height:29px;
      pointer-events:none;
    }
    /* The ONE real progress bar travels between the two measured positions. */
    #vega-saver .saver-music-progress{
      position:absolute;z-index:5;box-sizing:border-box;display:block;
      margin:0!important;overflow:visible;
    }
    #vega-saver .saver-progress-track{height:14px!important;top:0}
    #vega-saver .saver-progress-rail,#vega-saver .saver-progress-fill{top:6px;height:3px}
    #vega-saver .saver-progress-marker{top:7.5px;width:9px;height:9px}
    #vega-saver .saver-music-progress .saver-music-times{
      bottom:0;left:0;right:0;font-size:10px;opacity:1;
      transition:opacity 250ms ease;
    }
    #vega-saver.is-mini .saver-music-progress .saver-music-times{opacity:0}
    #vega-saver.is-mini .saver-progress-seek{pointer-events:none}
    #vega-saver.is-mini .saver-progress-rail,#vega-saver.is-mini .saver-progress-fill{top:6px;height:2px}
    #vega-saver .saver-music-transport{
      position:absolute;top:161px;left:0;right:0;height:43px;
      display:flex!important;justify-content:space-between;gap:6px!important;
      align-items:center;margin:0!important;
      transition:opacity 270ms ease,transform 700ms var(--saver-v46-ease);
    }
    #vega-saver .saver-music-transport button,#vega-saver .saver-music.is-small .saver-music-transport button,#vega-saver .saver-music.is-tiny .saver-music-transport button{
      width:46px;height:43px;flex:0 0 auto;
      border:0;background:transparent;color:#fff;border-radius:0;box-shadow:none;
    }
    #vega-saver .saver-music-transport button svg{width:24px;height:24px}
    #vega-saver .saver-music-transport .saver-play,
    #vega-saver .saver-music.is-small .saver-music-transport .saver-play{
      width:48px;height:48px;border-radius:50%;
      border:1px solid rgba(255,255,255,.3);
      background:rgba(255,255,255,.19);
      box-shadow:inset 0 1px 0 #ffffff3a;
    }
    #vega-saver .saver-music-transport .saver-play svg{width:28px;height:28px}
    #vega-saver .saver-v46-volume{
      position:absolute;top:209px;left:0;right:0;height:31px;
      display:flex;gap:7px;align-items:center;
      transition:opacity 270ms ease,transform 700ms var(--saver-v46-ease);
    }
    #vega-saver .saver-v46-volume-step{
      flex:none;width:29px;height:29px;padding:0;color:#fff;
      border:1px solid #ffffff33;border-radius:50%;background:#ffffff1e;
      font-size:22px;line-height:1;
    }
    #vega-saver .saver-v46-volume > svg{width:17px;height:17px;flex:none;stroke:currentColor;fill:none;stroke-width:1.8}
    #vega-saver .saver-v46-volume-line{height:3px;position:relative;flex:1;min-width:0;border-radius:4px;background:#ffffff54}
    #vega-saver .saver-v46-volume-fill{position:absolute;inset:0 auto 0 0;width:70%;height:3px;border-radius:4px;background:#fff}
    #vega-saver .saver-v46-volume-seek{
      position:absolute;inset:-9px 0;width:100%;height:23px;margin:0;padding:0;opacity:0;
      touch-action:pan-x;cursor:pointer;
    }
    #vega-saver .saver-v46-modes{
      position:absolute;top:245px;left:0;right:0;height:28px;
      display:flex;align-items:center;justify-content:flex-start;gap:11px;
      transition:opacity 270ms ease,transform 700ms var(--saver-v46-ease);
    }
    #vega-saver .saver-v46-mode{
      height:28px;min-width:43px;display:grid;place-items:center;
      padding:0 8px;border:1px solid #f3f6ff66;border-radius:9px;
      background:#ffffff22;color:#fff;box-shadow:inset 0 1px #ffffff22;
      touch-action:manipulation;
    }
    #vega-saver .saver-v46-mode svg{width:22px;height:22px;stroke:currentColor;
      stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}
    #vega-saver .saver-v46-mode.is-active{background:#ffffff65;color:#fff;border-color:#ffffffb4;box-shadow:0 0 9px #e5eeff65,inset 0 1px #ffffff90}
    #vega-saver .saver-v46-mode:disabled{opacity:.36;cursor:default}
    #vega-saver.is-mini .saver-music-transport,#vega-saver.is-mini .saver-v46-volume,#vega-saver.is-mini .saver-v46-modes{
      opacity:0!important;pointer-events:none!important;transform:translateY(11px);
    }
    #vega-saver .saver-album-actions{
      left:auto!important;right:calc(var(--saver-actions-gutter,36px) + env(safe-area-inset-right,0px))!important;
      top:calc(17px + var(--vega-safe-top,0px))!important;gap:9px!important;
      opacity:1;transition:opacity 260ms ease,transform 700ms var(--saver-v46-ease);
    }
    #vega-saver .saver-album-actions button,#vega-saver .saver-album-actions.is-compact button{
      width:40px;height:40px;border-radius:12px;
      border:1px solid rgba(255,255,255,.46);
      background:linear-gradient(145deg,rgba(132,156,189,.38),rgba(68,85,111,.30));
      -webkit-backdrop-filter:blur(16px) saturate(1.2);backdrop-filter:blur(16px) saturate(1.2);
      box-shadow:inset 0 1px rgba(255,255,255,.35),0 0 11px rgba(171,192,255,.15);
    }
    #vega-saver.is-mini .saver-album-actions{opacity:0!important;pointer-events:none!important;transform:translateY(-6px)}
    #vega-saver .saver-clock{
      left:36px!important;bottom:25px!important;
      width:auto!important;height:auto!important;min-width:0!important;
      padding:0!important;margin:0!important;border:0!important;
      display:block!important;background:transparent!important;
      filter:drop-shadow(0 2px 6px #000a);
      opacity:0;transform:none!important;transition:opacity 700ms var(--saver-v46-ease)!important;
    }
    #vega-saver .saver-clock-ink{display:block;width:auto;height:auto}
    #vega-saver.has-music.is-mini .saver-clock{opacity:1!important}
    #vega-saver:not(.has-music) .saver-clock{opacity:1!important}
    #vega-saver.has-music:not(.is-mini) .saver-clock{opacity:0!important}
    #vega-saver.is-mini .saver-music-content{opacity:0!important;pointer-events:none!important;transform:scale(var(--saver-v46-fit,1)) translateY(11px)!important}
    #vega-saver .saver-music-content{transition:opacity 270ms ease,transform 700ms var(--saver-v46-ease)}
    #vega-saver.is-mini .saver-music-progress{opacity:1!important;pointer-events:none}
    #vega-saver .saver-music-progress{opacity:1!important;transform:none!important;pointer-events:auto}
    /* HomePod / Apple TV: retain the SAME straight progress rail and all
       transport icons for visual consistency. Unsupported interactions are disabled. */
    #vega-saver .saver-music.is-homepod .saver-homepod-wave{display:none!important}
    #vega-saver .saver-music.is-homepod .saver-progress-track{display:block!important}
    #vega-saver .saver-music.is-homepod .saver-progress-rail{opacity:.7}
    #vega-saver .saver-music.is-homepod .saver-progress-seek:not(:disabled){cursor:pointer}
    #vega-saver.is-mini .saver-homepod-wave{height:14px!important}
    :host([data-theme="light"]) #vega-saver .saver-music-transport button,
    :host([data-theme="light"]) #vega-saver .saver-v46-volume-step,
    :host([data-theme="light"]) #vega-saver .saver-v46-mode,
    :host([data-theme="light"]) #vega-saver .saver-music{color:white!important}
    @media(max-width:700px){
      #vega-saver{--saver-mini-width:min(290px,calc(100vw - 210px))}
      #vega-saver .saver-album-actions{--saver-actions-gutter:20px}
      #vega-saver .saver-clock{left:20px!important}
    }
    @media(prefers-reduced-motion:reduce){
      #vega-saver .saver-music-content,#vega-saver .saver-album-actions,
      #vega-saver .saver-v46-volume,#vega-saver .saver-v46-modes{transition-duration:0ms!important}
    }


    /* === V5: centered, compact Full player + reliable Full/Mini artwork === */
    #vega-saver { --saver-v46-ease:cubic-bezier(.22,.82,.22,1); }
    #vega-saver .saver-music-shade {box-sizing:border-box!important;}
    #vega-saver .saver-shared-art-frame {
      box-sizing:border-box!important;border:1px solid rgba(255,255,255,.22)!important;
    }
    #vega-saver .saver-shared-title,#vega-saver .saver-shared-artist {
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif!important;
    }
    /* Text sits on the glass already, so the whole player needs no letter glow. */
    #vega-saver .saver-music,#vega-saver .saver-music *,
    #vega-saver .saver-mini,#vega-saver .saver-mini * {
      text-shadow:none!important;
    }
    #vega-saver .saver-shared-art-frame .saver-mini-art,
    #vega-saver .saver-shared-art-frame .saver-art-old {
      width:100%!important;height:100%!important;
      object-fit:cover!important;object-position:center!important;
      border-radius:inherit!important;
    }
    #vega-saver .saver-shared-title,#vega-saver .saver-shared-artist,
    #vega-saver.is-mini .saver-shared-title,#vega-saver.is-mini .saver-shared-artist,
    :host([data-theme="light"]) #vega-saver:not(.is-mini) .saver-shared-title,
    :host([data-theme="light"]) #vega-saver:not(.is-mini) .saver-shared-artist {
      text-shadow:none!important;
    }
    /* Three transport actions remain intact; tighten their alignment. */
    #vega-saver .saver-music-transport {
      display:grid!important;grid-template-columns:repeat(3,48px);
      justify-content:center!important;justify-items:center;
      gap:28px!important;top:156px;height:48px;
    }
    #vega-saver .saver-music-transport button {
      width:46px!important;height:46px!important;border-radius:13px!important;
      transition:background-color .18s ease,transform .18s ease;
    }
    #vega-saver .saver-music-transport button:not(.saver-play):active:not(:disabled) {
      background:rgba(255,255,255,.14)!important;transform:scale(.94);
    }
    #vega-saver .saver-music-transport .saver-play {
      width:48px!important;height:48px!important;border-radius:16px!important;
      background:rgba(242,247,255,.22)!important;
      border:1px solid rgba(255,255,255,.26)!important;
    }
    #vega-saver .saver-v46-volume {top:209px}
    #vega-saver .saver-v46-modes {top:247px;gap:9px;justify-content:center!important}
    #vega-saver .saver-v46-mode {min-width:45px;height:30px;border-radius:12px}
    #vega-saver .saver-v46-mode svg {width:19px;height:19px}
    /* Music controls are hidden without active media; Lock photo is independent. */
    #vega-saver:not(.has-music) .saver-shared-art-frame,
    #vega-saver:not(.has-music) .saver-shared-title,
    #vega-saver:not(.has-music) .saver-shared-artist,
    #vega-saver:not(.has-music) .saver-music-shade,
    #vega-saver:not(.has-music) .saver-music-progress {
      opacity:0!important;pointer-events:none!important;
    }
    #vega-saver.has-music:not(.is-mini) .saver-shared-art-frame {opacity:1}
    #vega-saver.has-music.is-mini:not(.is-morphing) .saver-shared-art-frame {opacity:0!important}
    @media (prefers-reduced-motion:reduce){
      #vega-saver .saver-music-transport button {transition:none!important}
    }

    /* ===  · Minimal full-size controls & optically centered Mini === */
    #vega-saver .saver-mini{
      left:var(--saver-mini-center,50%)!important;
      width:var(--saver-mini-width,420px)!important;
      max-width:calc(100vw - 16px)!important;
    }
    #vega-saver .saver-mini-progress{left:43%!important;right:12px!important;}
    #vega-saver .saver-mini-progress-fill{border-radius:99px!important;}
    #vega-saver .saver-music-transport{top:160px!important;gap:22px!important;}
    #vega-saver .saver-music-transport button:not(.saver-play){
      border:0!important;border-radius:14px!important;
      background:rgba(255,255,255,.045)!important;
    }
    #vega-saver .saver-music-transport .saver-play{
      border-radius:15px!important;background:rgba(255,255,255,.23)!important;
      box-shadow:inset 0 1px rgba(255,255,255,.21)!important;
    }
    #vega-saver .saver-v46-volume{
      left:54%!important;right:0!important;top:225px!important;height:37px!important;
      justify-content:center!important;gap:8px!important;
      border:0!important;
    }
    #vega-saver .saver-v46-volume-step{
      width:42px!important;height:35px!important;font-size:21px!important;
      border:1px solid rgba(255,255,255,.10)!important;
      border-radius:12px!important;background:rgba(255,255,255,.09)!important;
    }
    #vega-saver .saver-v51-volume-caption{font-size:9px;letter-spacing:.09em;
      color:rgba(255,255,255,.57);font-weight:700;}
    #vega-saver .saver-v46-modes{
      left:0!important;right:53%!important;top:226px!important;height:36px!important;
      justify-content:center!important;gap:8px!important;
    }
    #vega-saver .saver-v46-mode{
      height:35px!important;width:43px!important;padding:0!important;min-width:43px!important;
      border:1px solid rgba(255,255,255,.10)!important;border-radius:12px!important;
      background:rgba(255,255,255,.09)!important;box-shadow:none!important;
    }
    #vega-saver .saver-v46-mode svg{width:19px!important;height:19px!important;stroke-width:1.9!important;}
    #vega-saver .saver-v46-mode.is-active{
      background:rgba(173,209,255,.30)!important;
      border-color:rgba(211,233,255,.38)!important;
      box-shadow:0 0 8px rgba(164,198,255,.20)!important;
    }
    #vega-saver .saver-v46-mode:active:not(:disabled),
    #vega-saver .saver-v46-volume-step:active:not(:disabled){transform:scale(.94);}

    /*  final: 30px album INSIDE the tiny mini capsule. Same art node
       transforms between Full and Mini, no duplicate requests or ghost cover. */
    #vega-saver .saver-mini{
      left:var(--saver-mini-center,50%)!important;
    }
    #vega-saver .saver-mini-title,#vega-saver .saver-mini-artist{
      left:46px!important;width:calc(45% - 51px)!important;
    }
    #vega-saver .saver-mini-progress{
      left:45%!important;right:9px!important;
    }
    #vega-saver.has-music.is-mini:not(.is-morphing) .saver-shared-art-frame{
      opacity:1!important;
    }
    /* The glass and seek bar fade with .saver-music. Fade its Mini siblings
       at the same rate, with their existing geometry and artwork in place. */
    #vega-saver.has-music.is-mini.is-mini-fading .saver-mini,
    #vega-saver.has-music.is-mini.is-mini-fading .saver-shared-art-frame,
    #vega-saver.has-music.is-mini.is-mini-fading .saver-shared-title,
    #vega-saver.has-music.is-mini.is-mini-fading .saver-shared-artist{
      opacity:0!important;transition:opacity ${playerFadeMs}ms ease!important;
    }
    #vega-saver .saver-shared-art-frame .saver-mini-art{
      object-fit:cover!important;transform:none!important;
    }
    #vega-saver.is-mini .saver-shared-art-frame{
      border:1px solid rgba(255,255,255,.30)!important;
      box-sizing:border-box!important;
      background:linear-gradient(125deg,#536c9f,#7e7a9c)!important;
      box-shadow:inset 0 0 0 1px #ffffff14!important;
    }
    #vega-saver:not(.has-artwork).is-mini .saver-shared-art-frame::after{
      content:'♫';position:absolute;inset:0;display:grid;place-items:center;
      font-size:18px;color:white;
    }
    #vega-saver.is-mini .saver-music-progress{
      z-index:15!important;
    }

    /* ============================================================
        / LOCKSCREEN ONLY — no changes to HA room/media popups.
       Rectilinear, thin soft edge with white, unframed controls.
       ============================================================ */
    #vega-saver .saver-music-shade,
    #vega-saver.is-mini .saver-music-shade{
      border:.7px solid rgba(228,241,255,.17)!important;
      box-shadow:0 0 3px rgba(171,208,255,.055),
                 inset 0 1px 0 rgba(255,255,255,.055)!important;
      background:linear-gradient(128deg,rgba(62,77,104,.34),rgba(45,57,82,.31))!important;
      backdrop-filter:blur(13px) saturate(1.08)!important;
      -webkit-backdrop-filter:blur(13px) saturate(1.08)!important;
      overflow:hidden;
    }
    #vega-saver .saver-music-shade{border-radius:7px!important;}
    #vega-saver.is-mini .saver-music-shade{border-radius:6px!important;}
    :host([data-theme="light"]) #vega-saver .saver-music-shade,
    :host([data-theme="light"]) #vega-saver.is-mini .saver-music-shade{
      background:linear-gradient(130deg,rgba(62,76,98,.43),rgba(47,60,83,.36))!important;
      border-color:rgba(243,248,255,.20)!important;
    }
    #vega-saver .saver-shared-art-frame,
    #vega-saver.is-mini .saver-shared-art-frame{
      border-radius:5px!important;border-color:rgba(255,255,255,.14)!important;
      box-shadow:none!important;
    }
    #vega-saver .saver-music,
    #vega-saver .saver-music *,
    #vega-saver .saver-mini,
    #vega-saver .saver-mini *,
    #vega-saver .saver-shared-title,
    #vega-saver .saver-shared-artist{
      color:#fff!important;text-shadow:none!important;
    }
    #vega-saver .saver-shared-artist,
    #vega-saver .saver-music-artist,
    #vega-saver .saver-mini-artist{opacity:.86;}
    #vega-saver .saver-music-source{
      background:transparent!important;border:none!important;
      border-radius:0!important;padding-left:0!important;
    }
    #vega-saver .saver-source-icon,
    #vega-saver .saver-mini-controls button,
    #vega-saver .saver-music-transport button,
    #vega-saver .saver-music-transport button:not(.saver-play),
    #vega-saver .saver-music-transport .saver-play,
    #vega-saver .saver-v46-mode,
    #vega-saver .saver-v46-volume-step,
    #vega-saver .saver-album-actions button,
    #vega-saver .saver-album-actions.is-compact button{
      background:transparent!important;border:0!important;
      border-radius:0!important;box-shadow:none!important;
      backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
      color:white!important;
      padding:0!important;
    }
    #vega-saver .saver-music button svg,
    #vega-saver .saver-mini-controls svg{
      color:#fff!important;filter:none!important;
      fill:none;stroke:#fff;
    }
    /* Full player: shuffle / prev / play-pause / next / repeat on ONE row.
       No button is raised; active shuffle/repeat is indicated by icon glow only. */
    #vega-saver .saver-music-transport{
      top:161px!important;left:0!important;right:0!important;
      height:42px!important;display:grid!important;
      grid-template-columns:repeat(3,42px)!important;
      gap:20px!important;place-content:center!important;
      justify-items:center!important;
    }
    #vega-saver .saver-music-transport button,
    #vega-saver .saver-music-transport .saver-play{
      width:42px!important;height:42px!important;
      transition:transform 130ms ease!important;
    }
    #vega-saver .saver-music-transport button svg{width:22px!important;height:22px!important;}
    #vega-saver .saver-music-transport .saver-play svg{width:27px!important;height:27px!important;}
    #vega-saver .saver-v46-modes{
      top:161px!important;left:0!important;right:0!important;
      height:42px!important;display:flex!important;align-items:center!important;
      justify-content:space-between!important;gap:0!important;
      padding:0 0!important;box-sizing:border-box!important;
      pointer-events:none;
    }
    #vega-saver .saver-v46-mode{
      height:42px!important;width:42px!important;min-width:42px!important;
      pointer-events:auto;transition:filter 200ms ease,transform 130ms ease!important;
    }
    #vega-saver .saver-v46-mode svg{width:22px!important;height:22px!important;}
    #vega-saver .saver-v46-mode.is-active{
      background:transparent!important;border:none!important;box-shadow:none!important;
      filter:drop-shadow(0 0 3px rgba(255,255,255,.9))
             drop-shadow(0 0 8px rgba(159,209,255,.65))!important;
    }
    #vega-saver .saver-v46-volume{
      top:224px!important;left:0!important;right:0!important;height:37px!important;
      display:flex!important;align-items:center!important;justify-content:center!important;gap:15px!important;
    }
    #vega-saver .saver-v46-volume-step{
      width:39px!important;height:36px!important;font-size:24px!important;font-weight:400!important;
    }
    #vega-saver .saver-v51-volume-caption{color:#fff!important;font-weight:600;letter-spacing:.12em;}
    #vega-saver .saver-album-actions button svg{filter:none!important;color:white!important;}
    #vega-saver .saver-music-transport button:active:not(:disabled),
    #vega-saver .saver-v46-mode:active:not(:disabled),
    #vega-saver .saver-v46-volume-step:active:not(:disabled),
    #vega-saver .saver-mini-controls button:active:not(:disabled){transform:scale(.89)!important;}

    /* Mini: album left, title/artist + three transport icons on first row,
       one continuous long seek bar underneath. Keep the original shared
       album/progress nodes so Full <-> Mini morph remains intact. */
    #vega-saver .saver-mini-title,
    #vega-saver .saver-mini-artist{
      left:49px!important;width:calc(100% - 179px)!important;
    }
    #vega-saver .saver-mini-title{top:2px!important;font-size:12px!important;}
    #vega-saver .saver-mini-artist{top:17px!important;font-size:10px!important;}
    #vega-saver .saver-mini-progress{
      left:49px!important;right:13px!important;
      top:calc(var(--saver-mini-height) - 12px)!important;
      height:11px!important;opacity:0!important;
    }
    #vega-saver .saver-mini-controls{
      display:flex!important;position:absolute!important;
      right:7px!important;top:1px!important;bottom:auto!important;
      height:29px!important;width:112px!important;
      margin:0!important;gap:5px!important;justify-content:space-between!important;
      align-items:center!important;z-index:18!important;
      pointer-events:auto!important;
    }
    #vega-saver .saver-mini-controls button{
      display:grid!important;place-items:center!important;
      flex:0 0 34px!important;width:34px!important;height:29px!important;
      opacity:1;touch-action:manipulation;
    }
    #vega-saver .saver-mini-controls button svg{
      width:19px!important;height:19px!important;stroke-width:1.9!important;
    }
    #vega-saver .saver-mini-controls button[data-mini-action="playpause"] svg{
      width:22px!important;height:22px!important;
    }
    #vega-saver .saver-mini-controls button:disabled{opacity:.34!important;}
    #vega-saver.is-mini .saver-shared-art-frame{
      background:rgba(42,55,77,.43)!important;
    }
    #vega-saver .saver-mini-progress-fill{box-shadow:0 0 3px rgba(134,179,255,.24)!important;}
    @media(max-width:640px){
      #vega-saver .saver-mini-title,#vega-saver .saver-mini-artist{
        width:calc(100% - 161px)!important;font-size:10px!important;
      }
      #vega-saver .saver-mini-controls{width:99px!important;gap:1px!important;right:4px!important;}
      #vega-saver .saver-mini-controls button{flex-basis:30px!important;width:30px!important;}
    }

    /* : Hidden music UI must NEVER intercept touch events.
        had pointer-events:auto on Shuffle/Repeat, and  on
       mini transport controls. Opacity:0 / pointer-events:none on the
       parent is insufficient when descendants explicitly re-enable hits.
       Only the currently visible player is touch interactive. */
    /* Mini transport glyphs use CSS geometry rather than inline SVG.
       On some Chromium/GPU combinations the tiny SVGs flash as solid white
       rectangles during the once-per-second progress repaint. The static
       shape nodes are never replaced, including when play/pause changes. */
    #vega-saver .saver-mini-controls .saver-mini-glyph{
      display:block;position:relative;flex:none;width:20px;height:20px;
      background:transparent!important;box-shadow:none!important;
      border:0!important;filter:none!important;transform:none!important;
      opacity:1!important;pointer-events:none;
    }
    #vega-saver .saver-mini-controls .saver-mini-glyph::before,
    #vega-saver .saver-mini-controls .saver-mini-glyph::after{
      content:"";position:absolute;display:block;box-sizing:border-box;
      background:transparent;filter:none;box-shadow:none;
    }
    #vega-saver .saver-mini-controls button[data-mini-action="previous"] .saver-mini-glyph::before{
      left:2px;top:3px;width:2px;height:14px;background:currentColor;
    }
    #vega-saver .saver-mini-controls button[data-mini-action="previous"] .saver-mini-glyph::after{
      left:7px;top:3px;width:0;height:0;
      border-top:7px solid transparent;border-bottom:7px solid transparent;
      border-right:11px solid currentColor;
    }
    #vega-saver .saver-mini-controls button[data-mini-action="next"] .saver-mini-glyph::before{
      right:2px;top:3px;width:2px;height:14px;background:currentColor;
    }
    #vega-saver .saver-mini-controls button[data-mini-action="next"] .saver-mini-glyph::after{
      right:7px;top:3px;width:0;height:0;
      border-top:7px solid transparent;border-bottom:7px solid transparent;
      border-left:11px solid currentColor;
    }
    /* Default play glyph; update data-playing only, not the element tree. */
    #vega-saver .saver-mini-controls button[data-mini-action="playpause"] .saver-mini-glyph::before{
      left:5px;top:3px;width:0;height:0;
      border-top:7px solid transparent;border-bottom:7px solid transparent;
      border-left:12px solid currentColor;
    }
    #vega-saver .saver-mini-controls button[data-mini-action="playpause"][data-playing="true"] .saver-mini-glyph::before,
    #vega-saver .saver-mini-controls button[data-mini-action="playpause"][data-playing="true"] .saver-mini-glyph::after{
      top:3px;width:3px;height:14px;background:currentColor;border:0;
    }
    #vega-saver .saver-mini-controls button[data-mini-action="playpause"][data-playing="true"] .saver-mini-glyph::before{left:5px;}
    #vega-saver .saver-mini-controls button[data-mini-action="playpause"][data-playing="true"] .saver-mini-glyph::after{left:13px;}
    #vega-saver .saver-mini {
      border:.7px solid rgba(228,241,255,.15)!important;
      box-shadow:0 0 3px rgba(171,208,255,.055),inset 0 1px 0 rgba(255,255,255,.05)!important;
    }
        #vega-saver:not(.has-music) .saver-music,
    #vega-saver:not(.has-music) .saver-music *,
    #vega-saver:not(.has-music) .saver-mini,
    #vega-saver:not(.has-music) .saver-mini *,
    #vega-saver:not(.is-mini) .saver-mini,
    #vega-saver:not(.is-mini) .saver-mini *,
    #vega-saver.is-mini .saver-music,
    #vega-saver.is-mini .saver-music * {
      pointer-events:none!important;
    }

  `;

  const overlay = document.createElement("div");
  overlay.id = "vega-saver";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="saver-photo-viewport" aria-hidden="true"><div class="saver-photo-track" data-mode="fade">
      <div class="saver-photo-slot"><img class="saver-image" alt=""></div>
      <div class="saver-photo-slot"><img class="saver-image" alt=""></div>
    </div></div>
    <output class="saver-photo-wait" aria-live="polite" aria-atomic="true" role="status">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 10 10" stroke-linecap="round"/></svg>
      <span class="saver-photo-wait-text"></span>
    </output>
    <div class="saver-clock"><canvas class="saver-clock-ink" aria-hidden="true"></canvas></div>
    <div class="saver-mini" role="button" tabindex="0" aria-label="${panel.escape(panel.t('music.maximize'))}">
      <span class="saver-mini-art-slot"><img class="saver-mini-art" alt="Album" hidden><span class="saver-mini-fallback">♫</span></span>
      <span class="saver-mini-body"><strong class="saver-mini-title"><span class="saver-mini-marquee-track">—</span></strong><small class="saver-mini-artist"><span class="saver-mini-marquee-track">—</span></small>
        <span class="saver-mini-progress"><span class="saver-mini-progress-fill"></span></span>
        <svg class="saver-mini-wave" viewBox="0 0 300 26" preserveAspectRatio="none" aria-label="${panel.escape(panel.t('media.waveLabel'))}">
          <path d="M0 13Q20 13 35 9T67 15 101 9 139 14 180 10 210 15 252 12 300 13" fill="none" stroke="#8daeff" stroke-width="7" opacity=".37" style="filter:blur(5px)"/>
          <path d="M0 13Q20 13 35 9T67 15 101 9 139 14 180 10 210 15 252 12 300 13" fill="none" stroke="#94beff" stroke-width="1.8"/>
        </svg>
        <span class="saver-mini-times"><span class="saver-mini-elapsed">0:00</span><span class="saver-mini-duration">0:00</span></span>
        <span class="saver-mini-controls">
          <button type="button" data-mini-action="previous" aria-label="${panel.escape(panel.t('media.previousTrack'))}"><span class="saver-mini-glyph" aria-hidden="true"></span></button>
          <button type="button" data-mini-action="playpause" aria-label="${panel.escape(panel.t('media.playPause'))}"><span class="saver-mini-glyph" aria-hidden="true"></span></button>
          <button type="button" data-mini-action="next" aria-label="${panel.escape(panel.t('media.nextTrack'))}"><span class="saver-mini-glyph" aria-hidden="true"></span></button>
        </span>
      </span>
    </div>
    <section class="saver-music" aria-label="${panel.escape(panel.t('media.speakerNowPlaying'))}">
      <div class="saver-music-shade"></div>
      <div class="saver-music-content">
        <div class="saver-music-source">
          <span class="saver-source-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="14" r="4"/><circle cx="12" cy="6" r="1"/></svg></span>
          <span class="saver-music-label">${panel.escape(panel.t('media.speakerNowPlaying'))}</span>
        </div>
        <div class="saver-music-copy">
          <strong class="saver-music-title"><span class="saver-marquee-track">—</span></strong>
          <span class="saver-music-artist"><span class="saver-marquee-track">—</span></span>
        </div>
        <div class="saver-full-progress-placeholder"></div>
        <div class="saver-music-progress">
          <svg class="saver-homepod-wave" viewBox="0 0 300 38" preserveAspectRatio="none" aria-label="${panel.escape(panel.t('media.waveLabel'))}">
            <defs><linearGradient id="saver-v4-wave-grad" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#42dfff"/><stop offset=".52" stop-color="#8d92ff"/><stop offset="1" stop-color="#d777ee"/></linearGradient></defs>
            <path d="M0 19C18 19 19 12 39 16S59 29 78 16 112 12 135 21 172 11 195 16 231 26 250 18 283 22 300 19" stroke="url(#saver-v4-wave-grad)" opacity=".33" stroke-width="9" style="filter:blur(5px)"/>
            <path d="M0 19C18 19 19 12 39 16S59 29 78 16 112 12 135 21 172 11 195 16 231 26 250 18 283 22 300 19" stroke="url(#saver-v4-wave-grad)" stroke-width="2"/>
            <path d="M0 19C18 19 28 24 46 19S74 12 92 20 132 16 151 19 174 26 202 18 243 16 265 20 287 18 300 19" stroke="url(#saver-v4-wave-grad)" opacity=".55" stroke-width="1"/>
          </svg>
          <div class="saver-progress-track">
            <div class="saver-progress-rail"></div>
            <div class="saver-progress-fill"></div>
            <span class="saver-progress-marker"></span>
            <input class="saver-progress-seek" type="range" data-saver-seek min="0" max="100" value="0" step="1" aria-label="${panel.escape(panel.t('media.seekPosition'))}">
          </div>
          <div class="saver-music-times"><span class="saver-music-elapsed">0:00</span><span class="saver-music-duration">0:00</span></div>
        </div>
        <div class="saver-music-transport">
          <button type="button" data-saver-action="previous" aria-label="${panel.escape(panel.t('media.previousTrack'))}"><svg viewBox="0 0 24 24"><path d="M5 5v14M19 5 8 12l11 7V5z"/></svg></button>
          <button type="button" class="saver-play" data-saver-action="playpause" aria-label="${panel.escape(panel.t('media.pause'))}"><svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke-width="3"/></svg></button>
          <button type="button" data-saver-action="next" aria-label="${panel.escape(panel.t('media.nextTrack'))}"><svg viewBox="0 0 24 24"><path d="M19 5v14M5 5l11 7-11 7V5z"/></svg></button>
        </div>
        <div class="saver-v46-volume">
          <button type="button" class="saver-v46-volume-step" data-saver-action="volume-down" aria-label="${panel.escape(panel.t('media.volumeDown'))}">−</button>
          <span class="saver-v51-volume-caption" aria-hidden="true">VOL</span>
          <button type="button" class="saver-v46-volume-step" data-saver-action="volume-up" aria-label="${panel.escape(panel.t('media.volumeUp'))}">+</button>
        </div>
        <div class="saver-v46-modes">
          <button type="button" data-saver-action="shuffle" class="saver-v46-mode" title="${panel.escape(panel.t('media.shuffleToggle'))}" aria-label="${panel.escape(panel.t('media.shuffleOff'))}" aria-pressed="false"><svg viewBox="0 0 24 24"><path d="M3 6h3.3c4.4 0 5.2 12 10 12H21"/><path d="m17 14 4 4-4 4"/><path d="M3 18h3.3c2.1 0 3.2-2.7 4.3-5.5"/><path d="M13.4 8.3C14.3 6.8 15.4 6 17 6h4"/><path d="m17 2 4 4-4 4"/></svg></button>
          <button type="button" data-saver-action="repeat" class="saver-v46-mode" title="${panel.escape(panel.t('media.repeatOff'))}" aria-label="${panel.escape(panel.t('media.repeatOff'))}" aria-pressed="false"><svg viewBox="0 0 24 24"><path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/></svg></button>
        </div>
      </div>
      <output class="saver-volume-toast" aria-live="polite" aria-atomic="true"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v6h4l5 4V5L9 9H5z"/><path d="M18 9.5a4 4 0 0 1 0 5"/><path d="M19.5 7a7.5 7.5 0 0 1 0 10"/></svg><span>0</span></output>
      <div class="saver-album-actions" inert>
        <button type="button" data-saver-action="home" aria-label="${panel.escape(panel.t('music.home'))}" title="${panel.escape(panel.t('music.home'))}"><svg viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg></button>
        <button type="button" data-saver-action="browse" aria-label="${panel.escape(panel.t('music.browse'))}" title="${panel.escape(panel.t('music.browse'))}"><svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></button>
        <button type="button" data-saver-action="minimize" aria-label="${panel.escape(panel.t('music.minimize'))}" title="${panel.escape(panel.t('music.minimize'))}"><svg viewBox="0 0 24 24"><path d="M4 4l7 7M5 11h6V5M20 20l-7-7M19 13h-6v6"/></svg></button>
      </div>
    </section>
  `;
  root.append(style, overlay);

  const images = [...overlay.querySelectorAll(".saver-image")];
  const photoTrack = overlay.querySelector('.saver-photo-track');
  const photoSlots = [...overlay.querySelectorAll('.saver-photo-slot')];
  const photoWait = overlay.querySelector('.saver-photo-wait');
  const photoWaitText = photoWait.querySelector('.saver-photo-wait-text');
  const clock = overlay.querySelector(".saver-clock");
  const music = overlay.querySelector('.saver-music');
  const albumActions=music.querySelector('.saver-album-actions');
  const mini = overlay.querySelector('.saver-mini');
  const miniArt = mini.querySelector('.saver-mini-art');
  let miniMode = false, animatingMode = false, autoMiniTimer = null, morphTimer = null;
  let miniFadeTimer=null;
  let suppressAutomatic = false;
  const miniText = (s,v) => {const el=mini.querySelector(s+' .saver-mini-marquee-track');if(el && el.textContent!==v)el.textContent=v;};
  function clearAutoMini(){clearTimeout(autoMiniTimer);autoMiniTimer=null;}
  function armAutoMini(){
    clearAutoMini();
    if(!active||!mediaState||miniMode||suppressAutomatic||suspended)return;
    autoMiniTimer=setTimeout(()=>setMiniMode(true),60_000);
  }
  // : FLIP geometry on the actual persistent glass, art and text.
  // No ghost panel, cloned album or copied title is constructed for Full/Mini.
  const glass=music.querySelector('.saver-music-shade');
  const fullTitleNode=music.querySelector('.saver-music-title');
  const fullArtistNode=music.querySelector('.saver-music-artist');
  const miniTitleNode=mini.querySelector('.saver-mini-title');
  const miniArtistNode=mini.querySelector('.saver-mini-artist');
  const miniArtSlot=mini.querySelector('.saver-mini-art-slot');
  const progressEl=music.querySelector('.saver-music-progress');
  music.append(progressEl); // SAME seek bar moves between Full and Mini; never clone it.
  const fullProgressMarker=music.querySelector('.saver-full-progress-placeholder');
  const movingFrame=document.createElement('div');
  movingFrame.className='saver-shared-art-frame';
  miniArtSlot.removeChild(miniArt);
  movingFrame.append(miniArt);
  overlay.append(movingFrame);
  const sharedTitle=document.createElement('strong');
  sharedTitle.className='saver-shared-title';
  sharedTitle.innerHTML='<span class="saver-shared-text-track">—</span>';
  const sharedArtist=document.createElement('span');
  sharedArtist.className='saver-shared-artist';
  sharedArtist.innerHTML='<span class="saver-shared-text-track">—</span>';
  overlay.append(sharedTitle,sharedArtist);
  let clockPainted='',clockPaintedSize=0;
  const clockCanvas=clock.querySelector('.saver-clock-ink');
  function paintClockInk(value){
    const size=overlay.clientWidth && overlay.clientWidth<=720 ? 51 : 58;
    if(clockPainted===value && clockPaintedSize===size)return;
    clockPainted=value;clockPaintedSize=size;
    // Measure painted alpha pixels, not the CSS font-box/line-height.
    const scratch=document.createElement('canvas');scratch.width=440;scratch.height=125;
    const c=scratch.getContext('2d',{willReadFrequently:true});
    c.font=`450 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`;
    c.textBaseline='alphabetic';c.fillStyle='#fff';c.fillText(value,12,84);
    const pixels=c.getImageData(0,0,440,125).data;
    let x0=440,y0=125,x1=0,y1=0;
    for(let y=0;y<125;y++)for(let x=0;x<440;x++){
      if(pixels[(y*440+x)*4+3]>36){
        if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;
      }
    }
    if(x1<=x0||y1<=y0)return;
    const w=x1-x0+1,h=y1-y0+1;
    clockCanvas.width=w;clockCanvas.height=h;
    clockCanvas.style.width=`${w}px`;clockCanvas.style.height=`${h}px`;
    clockCanvas.getContext('2d').drawImage(scratch,x0,y0,w,h,0,0,w,h);
    clock.style.width=`${w}px`;clock.style.height=`${h}px`;
    // : use the actual alpha-bound height of the white clock digits.
    // The clock canvas and Mini glass have identical visible top/bottom edges.
    // Do not use font-size, line-height, CSS text box or extra vertical padding.
    const miniH=h;
    overlay.style.setProperty('--saver-mini-height',`${miniH}px`);
    clock.dataset.inkHeight=String(h);
    clock.dataset.miniHeight=String(miniH);
    clock.setAttribute('aria-label',value);
    updateMiniPlacement();
  }

  // : center the Mini capsule in the space AFTER the clock, not the screen.
  function updateMiniPlacement(){
    const width=overlay.clientWidth;if(!width)return;
    const r=clock.getBoundingClientRect(),o=overlay.getBoundingClientRect();
    const clockRight=(r.width>0?r.right-o.left:width*.235);
    const leftEdge=Math.max(12,clockRight+22),rightEdge=width-28;
    const available=Math.max(125,rightEdge-leftEdge);
    const miniWidth=Math.min(470,Math.max(130,available-26));
    const center=Math.min(width-miniWidth/2-8,Math.max(miniWidth/2+8,(leftEdge+rightEdge)/2));
    overlay.style.setProperty('--saver-mini-center',`${center}px`);
    overlay.style.setProperty('--saver-mini-width',`${miniWidth}px`);
    if(active&&!animatingMode)applyVisuals(miniMode);
  }
  let morphAnimations=[];
  const morphEase='cubic-bezier(.22,.82,.22,1)';
  const morphDuration=520;
  const boxOf=el=>{
    const r=el.getBoundingClientRect(),o=overlay.getBoundingClientRect();
    return {left:r.left-o.left,top:r.top-o.top,width:r.width,height:r.height};
  };
  function geometryFor(isMini){
    const width=overlay.clientWidth,height=overlay.clientHeight;
    const left=parseFloat(overlay.style.getPropertyValue('--saver-panel-left'))||68;
    const top=parseFloat(overlay.style.getPropertyValue('--saver-panel-top'))||70;
    const panelWidth=parseFloat(overlay.style.getPropertyValue('--saver-panel-width'))||(width-left*2);
    const panelHeight=parseFloat(overlay.style.getPropertyValue('--saver-panel-height'))||315;
    const miniBox=boxOf(mini);
    const miniTitle=boxOf(miniTitleNode),miniArtist=boxOf(miniArtistNode);
    const miniSeek=boxOf(mini.querySelector('.saver-mini-progress'));
    const contentFit=parseFloat(getComputedStyle(overlay).getPropertyValue('--saver-v46-fit'))||1;
    if(isMini){
      return {glass:miniBox,
        artwork:{left:miniBox.left+8,top:miniBox.top+(miniBox.height-34)/2,width:34,height:34},
        title:miniTitle,artist:miniArtist,
        progress:{left:miniSeek.left,top:miniSeek.top,width:miniSeek.width,height:miniSeek.height},
        titleFont:12,artistFont:10,artRadius:'5px',glassRadius:'6px',crop:1,artOpacity:1};
    }
    const fullTitle=boxOf(fullTitleNode),fullArtist=boxOf(fullArtistNode);
    const fullSeek=boxOf(fullProgressMarker);
    return {glass:{left,top,width:panelWidth,height:panelHeight},
      artwork:{left:left+20,top:top+(panelHeight-Math.min(panelHeight-40,panelWidth/2-38))/2,
        width:Math.min(panelHeight-40,panelWidth/2-38),height:Math.min(panelHeight-40,panelWidth/2-38)},
      title:fullTitle,artist:fullArtist,progress:fullSeek,
      titleFont:27*contentFit,artistFont:16*contentFit,
      artRadius:'5px',glassRadius:'7px',crop:1,artOpacity:1};
  }
  function place(el,box,radius){
    Object.assign(el.style,{left:`${box.left}px`,top:`${box.top}px`,
      width:`${box.width}px`,height:`${box.height}px`});
    if(radius!=null)el.style.borderRadius=radius;
  }
  function applyVisuals(mode){
    if(miniFadeTimer!==null||!overlay.isConnected||overlay.hidden||!overlay.clientWidth)return;
    const target=geometryFor(mode);
    place(glass,target.glass,target.glassRadius);
    place(movingFrame,target.artwork,target.artRadius);
    miniArt.style.transform=`scale(${target.crop})`;
    movingFrame.style.opacity=String(target.artOpacity);
    place(sharedTitle,target.title);
    place(sharedArtist,target.artist);
    place(progressEl,target.progress);
    sharedTitle.style.fontSize=`${target.titleFont}px`;
    sharedArtist.style.fontSize=`${target.artistFont}px`;
    scheduleMarquee();
  }
  function cancelPlayerMorph(){
    clearTimeout(morphTimer);
    const running=morphAnimations;
    morphAnimations=[];
    running.forEach(animation=>animation.cancel());
    animatingMode=false;
    overlay.classList.remove('is-morphing','is-collapsing','is-expanding');
  }
  function setMiniMode(wantMini,{manual=false,instant=false}={}){
    if(disposed||!active||!mediaState||animatingMode)return;
    if(miniMode===wantMini){if(!wantMini&&manual){suppressAutomatic=true;clearAutoMini();}return;}
    if(manual){suppressAutomatic=true;clearAutoMini();}
    else if(wantMini)clearAutoMini();
    const before=geometryFor(miniMode),after=geometryFor(wantMini);
    if(instant||matchMedia('(prefers-reduced-motion:reduce)').matches){
      miniMode=wantMini;overlay.classList.toggle('is-mini',wantMini);
      syncAlbumActions();
      applyVisuals(wantMini);return;
    }
    // Place visible nodes at their exact starting endpoints before any class toggles.
    place(glass,before.glass,before.glassRadius);
    place(movingFrame,before.artwork,before.artRadius);
    place(sharedTitle,before.title);place(sharedArtist,before.artist);
    place(progressEl,before.progress);
    miniArt.style.transform=`scale(${before.crop})`;
    movingFrame.style.opacity=String(before.artOpacity);
    sharedTitle.style.fontSize=`${before.titleFont}px`;
    sharedArtist.style.fontSize=`${before.artistFont}px`;
    animatingMode=true;miniMode=wantMini;
    syncAlbumActions();
    overlay.classList.add('is-morphing',wantMini?'is-collapsing':'is-expanding');
    overlay.classList.toggle('is-mini',wantMini);
    const timing={duration:morphDuration,easing:morphEase,fill:'forwards'};
    const dims=box=>({left:`${box.left}px`,top:`${box.top}px`,width:`${box.width}px`,height:`${box.height}px`});
    const run=(el,start,end)=>{const anim=el.animate(Array.isArray(start)?start:[start,end],timing);morphAnimations.push(anim);return anim;};
    const shellAnim=run(glass,{...dims(before.glass),borderRadius:before.glassRadius},
      {...dims(after.glass),borderRadius:after.glassRadius});
    run(movingFrame,
      [{...dims(before.artwork),borderRadius:before.artRadius,filter:'blur(0px)',opacity:before.artOpacity,offset:0},
       {filter:'blur(4px)',opacity:(before.artOpacity+after.artOpacity)/2,offset:.5},
       {...dims(after.artwork),borderRadius:after.artRadius,filter:'blur(0px)',opacity:after.artOpacity,offset:1}]);
    run(miniArt,{transform:`scale(${before.crop})`},{transform:`scale(${after.crop})`});
    run(sharedTitle,{...dims(before.title),fontSize:`${before.titleFont}px`},
      {...dims(after.title),fontSize:`${after.titleFont}px`});
    run(sharedArtist,{...dims(before.artist),fontSize:`${before.artistFont}px`},
      {...dims(after.artist),fontSize:`${after.artistFont}px`});
    run(progressEl,dims(before.progress),dims(after.progress));
    const running=morphAnimations.slice();
    let finalized=false;
    const finish=()=>{
      if(finalized||!morphAnimations.includes(shellAnim))return;finalized=true;
      clearTimeout(morphTimer);
      applyVisuals(wantMini); // assign the exact final geometry BEFORE removing animations
      running.forEach(anim=>anim.cancel());
      morphAnimations=morphAnimations.filter(anim=>!running.includes(anim));
      overlay.classList.remove('is-morphing','is-collapsing','is-expanding');
      animatingMode=false;
    };
    Promise.allSettled(running.map(anim=>anim.finished)).then(finish);
    morphTimer=setTimeout(finish,morphDuration+120);
  }
  function expandManual(){setMiniMode(false,{manual:true});}

  const nowTitle = music.querySelector('.saver-music-title .saver-marquee-track');
  const nowArtist = music.querySelector('.saver-music-artist .saver-marquee-track');
  const volumeToast=music.querySelector('.saver-volume-toast');
  const progressTrack=music.querySelector('.saver-progress-track');
  let seekOverride=null; // Temporary visual position until HA reports the completed seek.
  let seekDragging=false,lastSeekCommit=null;
  let shuffleOverride=null,repeatOverride=null;
  const effectiveMode=(entity,mode)=>{
    const override=mode==='shuffle'?shuffleOverride:repeatOverride;
    const original=mode==='shuffle'?(entity?.attributes?.shuffle===true):String(entity?.attributes?.repeat||'off').toLowerCase();
    if(!override || override.id!==entity?.entity_id)return original;
    if(original===override.value||Date.now()>override.until){
      if(mode==='shuffle')shuffleOverride=null;else repeatOverride=null;
      return original;
    }
    return override.value;
  };
  function updateWavePalette(image) {
    const fallback=['#42dfff','#8d92ff','#d777ee'];
    let colors=fallback;
    if(image){
      try {
        const canvas=document.createElement('canvas');canvas.width=16;canvas.height=16;
        const ctx=canvas.getContext('2d',{willReadFrequently:true});
        if(ctx){
          ctx.drawImage(image,0,0,16,16);
          const data=ctx.getImageData(0,0,16,16).data;
          let hx=0,hy=0,count=0;
          for(let i=0;i<data.length;i+=4){
            const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255;
            const hi=Math.max(r,g,b),lo=Math.min(r,g,b),delta=hi-lo;
            if(delta<.17||hi<.18||hi>.96)continue;
            let h=hi===r?((g-b)/delta)%6:hi===g?(b-r)/delta+2:(r-g)/delta+4;
            h=(h*60+360)%360;
            hx+=Math.cos(h*Math.PI/180)*delta;
            hy+=Math.sin(h*Math.PI/180)*delta;
            count++;
          }
          if(count>=12 && Math.hypot(hx,hy)>count*.08){
            const hue=(Math.atan2(hy,hx)*180/Math.PI+360)%360;
            colors=[`hsl(${Math.round((hue+326)%360)} 91% 68%)`,
                    `hsl(${Math.round((hue+365)%360)} 86% 71%)`,
                    `hsl(${Math.round((hue+407)%360)} 84% 73%)`];
          }
        }
      } catch (_) {/* Image proxy may be cross-origin: keep fallback colors. */}
    }
    colors.forEach((color,i)=>music.style.setProperty(`--saver-wave-color-${i+1}`,color));
  }
  function updateWaveProgress(position,duration) {
    const percent=duration>0?Math.max(0,Math.min(100,position/duration*100)):0;
    progressTrack.style.setProperty('--saver-progress',`${percent.toFixed(3)}%`);
    progressTrack.classList.toggle('has-duration',duration>0);
  }
  const volumeDown=music.querySelector('[data-saver-action="volume-down"]');
  const volumeUp=music.querySelector('[data-saver-action="volume-up"]');
  let volumeToastTimer=null;
  let volumeOverride=null,volumeSending=false,queuedVolume=null,volumeCommitTimer=null;
  let currentArt='',artGeneration=0;
  let mediaState=null;
  const $m = selector => music.querySelector(selector);
  const fmt = sec => {
    const n=Math.max(0,Math.floor(Number(sec)||0));
    return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
  };
  const feature=(e,bit)=>{
    const val=e?.attributes?.supported_features;
    return val==null || (Number(val)&bit)!==0;
  };
  function syncAlbumActions(){
    albumActions.inert=!active||closing||!mediaState||miniMode;
  }

  function setPlayerLayout() {
    const shown=!!mediaState&&active&&!closing;
    overlay.classList.toggle('has-music',shown);
    movingFrame.style.opacity=shown?'1':'0';
    sharedTitle.style.opacity=shown?'1':'0';
    sharedArtist.style.opacity=shown?'1':'0';
    music.classList.toggle('is-playing',shown);
    syncAlbumActions();
    if(!shown)hideVolumeToast();
    positionMusicWithinArtwork();
    if(shown&&!animatingMode)applyVisuals(miniMode);
  }

  function clearMiniFade(){
    if(miniFadeTimer===null)return;
    clearTimeout(miniFadeTimer);miniFadeTimer=null;
    overlay.classList.remove('is-mini-fading');
    mini.inert=false;music.inert=false;
  }
  function resetPlayerAfterPlayback(){
    overlay.classList.remove('has-music');
    clearMiniFade();
    miniMode=false;overlay.classList.remove('is-mini');suppressAutomatic=false;
    music.classList.remove('is-homepod');
    updateArtwork('',null);
    setPlayerLayout();
  }
  function fadeMiniAfterPlayback(){
    if(animatingMode){cancelPlayerMorph();applyVisuals(true);}
    // Keep the painted cover for the fade but drop any in-flight decode.
    currentArt=null;++artGeneration;
    hideVolumeToast();
    mini.inert=true;music.inert=true;
    overlay.classList.add('is-mini-fading');
    music.classList.remove('is-playing');
    miniFadeTimer=setTimeout(()=>{
      // Commit zero opacity before restoring the default mode, even if
      // rendering was throttled during the fade.
      music.style.transition='none';
      resetPlayerAfterPlayback();
      void getComputedStyle(music).opacity;
      music.style.removeProperty('transition');
    },playerFadeMs+45);
  }

  // Request 1024px only on a real Music Assistant imageproxy URL.
  // If that proxy fails, use the original URL unchanged.
  function preferredArtworkUrl(url, e) {
    if(e?.entity_id !== panel.musicPlayerID() || !url) return url;
    try {
      const parsed=new URL(url,document.baseURI);
      if(!parsed.pathname.includes('/imageproxy/') || !parsed.searchParams.has('size'))return url;
      if(Number(parsed.searchParams.get('size'))>=1024)return url;
      parsed.searchParams.set('size','1024');
      return parsed.href;
    } catch (_) {return url;}
  }

  // Final artwork layout: a fixed-height cover aligned to the full panel height,
  // matching the approved render. The cover size is consistent across tracks.
  function fitAlbumArtwork(){
    const bounds=overlay.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return;
    const width=bounds.width,height=bounds.height;
    const edge=Math.max(20,Math.min(68,Math.round(width*.085)));
    const panelWidth=Math.min(664,width-2*edge); // Never upscale the Full panel on larger displays.
    const panelLeft=(width-panelWidth)/2;
    // V5: center the 800x480 full panel with equal physical top/bottom margins.
    const panelHeight=Math.min(334,Math.max(160,height-36));
    const panelTop=Math.max(0,(height-panelHeight)/2);
    overlay.style.setProperty('--saver-panel-left',`${panelLeft}px`);
    overlay.style.setProperty('--saver-panel-top',`${panelTop}px`);
    overlay.style.setProperty('--saver-panel-width',`${panelWidth}px`);
    overlay.style.setProperty('--saver-panel-height',`${panelHeight}px`);
    // Original wallpaper frames are BACKGROUND ONLY; actual sharp cover is a
    // single shared moving image, and displays ALL pixels using contain.
    positionMusicWithinArtwork();
    clockPainted='';updateClock();updateMiniPlacement();
    if(!animatingMode)applyVisuals(miniMode);
  }

  function positionMusicWithinArtwork(){
    if(!overlay.isConnected||overlay.hidden)return;
    const width=overlay.clientWidth,height=overlay.clientHeight;
    const left=Number.parseFloat(overlay.style.getPropertyValue('--saver-panel-left'))||68;
    const top=Number.parseFloat(overlay.style.getPropertyValue('--saver-panel-top'))||70;
    const panelWidth=Number.parseFloat(overlay.style.getPropertyValue('--saver-panel-width'))||664;
    const panelHeight=Number.parseFloat(overlay.style.getPropertyValue('--saver-panel-height'))||315;
    const fit=Math.min(1,Math.max(.50,(panelHeight-38)/277));
    overlay.style.setProperty('--saver-v46-fit',String(fit));
    music.style.setProperty('--saver-content-left',`${Math.round(left+panelWidth*.49)}px`);
    music.style.setProperty('--saver-content-top',`${Math.round(top+20)}px`);
    music.style.setProperty('--saver-content-width',`${Math.round((panelWidth*.51-23)/fit)}px`);
    music.style.setProperty('--saver-content-height',`${Math.round((panelHeight-38)/fit)}px`);
    music.classList.toggle('is-small',panelHeight<285);
    music.classList.toggle('is-tiny',panelHeight<240);
    // Three glass buttons remain at top right, OUTSIDE the main panel.
    // Volume toast stays below the glass and aligns with the panel's left edge.
    volumeToast.style.left=`${Math.round(left)}px`;
    volumeToast.style.bottom=`${Math.max(10,height-(top+panelHeight)-34)}px`;
    scheduleMarquee();
  }

  let marqueeMeasureRAF=0;
  function updateTextMarquee() {
    if(disposed||!mediaState||!active)return;
    // Measure while both views are laid out: the hidden view uses opacity,
    // not display:none. For reliable widths, temporarily reset animation.
    for(const line of overlay.querySelectorAll('.saver-music-title,.saver-music-artist,.saver-mini-title,.saver-mini-artist,.saver-shared-title,.saver-shared-artist')){
      const track=line.querySelector('.saver-marquee-track,.saver-mini-marquee-track,.saver-shared-text-track');
      if(!track)continue;
      // scrollWidth is intrinsic and unaffected by transform animations;
      // do not remove the scrolling class or every HA state push restarts it.
      const width=line.clientWidth;
      const overflow=Math.ceil(track.scrollWidth-width);
      line.style.setProperty('--marquee-distance',`${Math.max(0,overflow+10)}px`);
      line.style.setProperty('--marquee-duration',`${Math.min(26,Math.max(10,9+overflow/32))}s`);
      line.classList.toggle('is-scrolling',width>0&&overflow>4);
    }
  }
  function scheduleMarquee() {
    if(marqueeMeasureRAF||!active||!mediaState)return;
    marqueeMeasureRAF=requestAnimationFrame(()=>{marqueeMeasureRAF=0;updateTextMarquee();});
  }

  if(document.fonts?.ready)document.fonts.ready.then(()=>{if(!disposed)scheduleMarquee();}).catch(()=>{});

  function updateArtwork(url,entity) {
    if(url===currentArt)return;
    currentArt=url;
    const generation=++artGeneration;
    if(!url) {
      miniArt.removeAttribute('src');miniArt.hidden=true;
      mini.querySelector('.saver-mini-fallback').hidden=false;
      updateWavePalette(null);
      overlay.classList.remove('has-artwork');
      positionMusicWithinArtwork();
      return;
    }
    const preferred=preferredArtworkUrl(url,entity);
    const candidates=preferred===url?[url]:[preferred,url];
    function tryLoad(index) {
      const preload=new Image();
      preload.onload=async()=>{
        if(disposed||generation!==artGeneration)return;
        try{if(preload.decode)await preload.decode();}catch(_){}
        if(disposed||generation!==artGeneration)return;
        updateWavePalette(preload);
        const actual=preload.currentSrc||preload.src;
        if(miniArt.getAttribute('src') && miniArt.getAttribute('src')!==actual && !miniArt.hidden){
          const old=miniArt.cloneNode(true);
          old.className='saver-art-old';old.removeAttribute('hidden');
          old.style.transform=miniArt.style.transform;
          movingFrame.append(old);
          old.animate([{opacity:1},{opacity:0}],{duration:1250,easing:'ease-in-out',fill:'forwards'})
            .finished.then(()=>old.remove(),()=>old.remove());
        }
        miniArt.src=actual;miniArt.hidden=false;
        mini.querySelector('.saver-mini-fallback').hidden=true;
        // No additional blurred, full-screen album layer: only the Lock photo
        // stays behind Full/Mini, and the actual cover remains in its frame.
        overlay.classList.add('has-artwork');
        fitAlbumArtwork();
      };
      preload.onerror=()=>{
        if(disposed||generation!==artGeneration)return;
        if(index+1<candidates.length)tryLoad(index+1);
        else {
          updateWavePalette(null);
          miniArt.removeAttribute('src');miniArt.hidden=true;
          mini.querySelector('.saver-mini-fallback').hidden=false;
          overlay.classList.remove('has-artwork');
          positionMusicWithinArtwork();
        }
      };
      preload.src=candidates[index];
    }
    tryLoad(0);
  }
  function volumeValue(e) {
    const raw=Math.max(0,Math.min(1,Number(e?.attributes?.volume_level)||0));
    if(volumeOverride?.id===e?.entity_id && Date.now()<volumeOverride.until) {
      if(Math.abs(raw-volumeOverride.value)<0.006)volumeOverride=null;
      else return volumeOverride.value;
    }
    return raw;
  }
  let controlsKey='';
  function updateMusicProgress() {
    if(!mediaState||!active||closing)return;
    const a=mediaState.attributes||{};
    const duration=Number(a.media_duration)||0;
    let position=Number(a.media_position)||0;
    if(mediaState.state==='playing'&&a.media_position_updated_at){
      const since=Date.parse(a.media_position_updated_at);
      if(Number.isFinite(since))position+=Math.max(0,(Date.now()-since)/1000);
    }
    position=Math.max(0,Math.min(duration||position,position));
    if(seekOverride){
      if(seekOverride.id!==mediaState.entity_id || seekOverride.until<Date.now() ||
         Math.abs(position-(seekOverride.value+(mediaState.state==='playing'?(Date.now()-seekOverride.started)/1000:0)))<2){
        seekOverride=null;
      }else{
        position=Math.min(duration||Infinity,seekOverride.value+
          (mediaState.state==='playing'?(Date.now()-seekOverride.started)/1000:0));
      }
    }
    const seek=$m('[data-saver-seek]');
    if(seekDragging)position=Number(seek.value)||0;
    const max=String(Math.max(1,duration)),value=String(Math.round(position));
    if(seek.max!==max)seek.max=max;
    if(!seekDragging&&seek.value!==value)seek.value=value;
    // HA's supported_features is authoritative: do not simulate a seek on a
    // non-seekable speaker. MA's media_player entity exposes the bit when ready.
    const canSeek=!!duration&&feature(mediaState,2)&&!panel.mediaLimited(mediaState);
    if(seek.disabled===canSeek)seek.disabled=!canSeek;
    updateWaveProgress(position,duration);
    const elapsed=fmt(position),length=duration?fmt(duration):'—';
    const elapsedNode=$m('.saver-music-elapsed'),durationNode=$m('.saver-music-duration');
    if(elapsedNode.textContent!==elapsed)elapsedNode.textContent=elapsed;
    if(durationNode.textContent!==length)durationNode.textContent=length;
    mini.style.setProperty('--mini-progress',`${duration?Math.min(100,Math.max(0,position/duration*100)):0}%`);
    miniText('.saver-mini-elapsed',elapsed);
    miniText('.saver-mini-duration',length);
    const currentVolume=Math.round(volumeValue(mediaState)*10);
    const shuffleEnabled=effectiveMode(mediaState,'shuffle');
    const repeatMode=effectiveMode(mediaState,'repeat');
    const playing=mediaState.state==='playing';
    const signature=JSON.stringify([mediaState.entity_id,playing,a.supported_features,currentVolume,
      shuffleEnabled,repeatMode,panel.language]);
    if(signature===controlsKey)return;
    controlsKey=signature;
    const volumeSupported=feature(mediaState,4);
    const volumeCaption=$m('.saver-v51-volume-caption');
    if(volumeCaption)volumeCaption.setAttribute('aria-label',`${panel.t('media.volume')} ${currentVolume*10}%`);
    volumeDown.disabled=!volumeSupported;
    volumeUp.disabled=!volumeSupported;
    for(const action of ['previous','next']){
      const bit=action==='previous'?16:32;
      $m(`[data-saver-action="${action}"]`).disabled=
        panel.mediaLimited(mediaState)||!feature(mediaState,bit);
    }
    for(const action of ['previous','next']){
      const b=mini.querySelector(`[data-mini-action="${action}"]`);
      b.disabled=panel.mediaLimited(mediaState)||!feature(mediaState,action==='previous'?16:32);
    }
    const homePod=panel.mediaLimited(mediaState);
    const shuffleButton=$m('[data-saver-action="shuffle"]');
    const repeatButton=$m('[data-saver-action="repeat"]');
    shuffleButton.disabled=homePod||!feature(mediaState,32768);
    repeatButton.disabled=homePod||!feature(mediaState,262144);
    shuffleButton.classList.toggle('is-active',shuffleEnabled);
    repeatButton.classList.toggle('is-active',repeatMode!=='off');
    shuffleButton.setAttribute('aria-pressed',String(shuffleEnabled));
    repeatButton.setAttribute('aria-pressed',String(repeatMode!=='off'));
    if(repeatButton.dataset.mode!==repeatMode){
      repeatButton.dataset.mode=repeatMode;
      repeatButton.innerHTML=repeatMode==='one'
        ? '<svg viewBox="0 0 24 24"><path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/><text x="11" y="15" font-size="8" stroke="none" fill="currentColor">1</text></svg>'
        : '<svg viewBox="0 0 24 24"><path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/></svg>';
    }
    const repeatLabel=panel.t(repeatMode==='one'?'media.repeatOne':repeatMode==='all'?'media.repeatAll':'media.repeatOff');
    shuffleButton.title=panel.t(shuffleEnabled?'media.shuffleOn':'media.shuffleOff');
    repeatButton.title=repeatLabel;
    shuffleButton.setAttribute('aria-label',shuffleButton.title);
    repeatButton.setAttribute('aria-label',repeatLabel);
    const miniPlay=mini.querySelector('[data-mini-action="playpause"]');
    const fullPlay=$m('[data-saver-action="playpause"]');
    miniPlay.disabled=!feature(mediaState,playing?1:16384)&&!feature(mediaState,512);
    const glyphState=String(playing);
    if(miniPlay.dataset.playing!==glyphState){
      miniPlay.dataset.playing=glyphState;
      const pause='<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" stroke-width="3"/></svg>';
      // Mini controls are static CSS geometry: do not recreate inline SVG nodes
      // while Chromium composites the Pi kiosk's translucent player.
      fullPlay.innerHTML=playing?pause:'<svg viewBox="0 0 24 24"><path d="m7 5 12 7-12 7z" stroke-width="2.4"/></svg>';
    }
  }
  // : Music Assistant / HA often publish the content ID and title in
  // separate state pushes. The old [ID, title] key counted BOTH pushes as
  // different songs, advancing the background twice. Prefer the stable ID;
  // use the title only for players that do not expose one.
  let observedTrack = null;
  function trackIdentity(entity) {
    if (!entity) { observedTrack = null; return ''; }
    const a = entity.attributes || {};
    const player = String(entity.entity_id || '');
    const id = String(a.media_content_id || '').trim();
    const title = String(a.media_title || '').trim();
    if (!id && !title) return '';

    const previous = observedTrack;
    if (previous?.player === player) {
      // A temporarily missing content ID during a track switch is not a song.
      if (previous.id && !id) return trackKey;
      // Updates to title/artist/artwork for the SAME content ID are metadata,
      // not another transition. Preserve that ID as the single track key.
      if (id && previous.id === id) {
        if (title) previous.title = title;
        return trackKey;
      }
      // A title-only player may receive its content ID a moment later.
      // Adopt the ID without advancing the wallpaper a second time.
      if (id && !previous.id && previous.title === title) {
        previous.id = id;
        return trackKey;
      }
      if (!id && !previous.id && previous.title === title) return trackKey;
    }
    observedTrack = { player, id, title };
    return JSON.stringify([player, id ? `id:${id}` : `title:${title}`]);
  }
  function updateNowPlaying({fresh=false}={}) {
    if(disposed)return;
    const hadMusic=!fresh&&!!mediaState;
    const nextMedia=panel.mediaActive?.()||null;
    if(!fresh&&!hadMusic&&!nextMedia)return;
    const browse=music.querySelector('[data-saver-action="browse"]');if(browse)browse.hidden=!panel.musicAvailable();
    const playerChanged=mediaState?.entity_id!==nextMedia?.entity_id;
    if(fresh)observedTrack=null;
    const newKey=trackIdentity(nextMedia);
    const changed=active && hadMusic && !!newKey && !!trackKey && newKey!==trackKey;
    mediaState=nextMedia;
    trackKey=newKey;
    if(!mediaState){
      forgetTrackSlide();
      if(hadMusic && active && files.length)queueNextSlide();
      shuffleOverride=null;repeatOverride=null;controlsKey='';
      clearAutoMini();
      if(miniMode&&hadMusic&&active&&!overlay.classList.contains('is-preparing-lock')&&
        !matchMedia('(prefers-reduced-motion: reduce)').matches)fadeMiniAfterPlayback();
      else{
        if(animatingMode)cancelPlayerMorph();
        resetPlayerAfterPlayback();
      }
      return;
    }
    clearMiniFade();
    if(!hadMusic){
      clearTimeout(slideTimer);
      slideTimer=null;
      forgetTrackSlide();
    }
    if(changed){
      const requested=requestedTrackDirection;
      const direction=requested && requested.until>Date.now()?requested.direction:1;
      requestedTrackDirection=null;
      // Debounce partial HA metadata updates for one track (title/artist/content ID).
      clearTimeout(trackSlideTimer);
      trackSlideTimer=setTimeout(()=>requestTrackSlide(direction),420);
    }
    const a=mediaState.attributes||{};
    const nextTitle=String(a.media_title||'—'),nextArtist=String(a.media_artist||a.friendly_name||'—');
    const textChanged=nowTitle.textContent!==nextTitle||nowArtist.textContent!==nextArtist;
    const animateMetadata=!overlay.classList.contains('is-preparing-lock');
    if(nowTitle.textContent!==nextTitle){
      nowTitle.textContent=nextTitle;
      if(animateMetadata)nowTitle.animate?.([{opacity:0},{opacity:1}],{duration:1000,easing:'ease-in-out'});
    }
    if(nowArtist.textContent!==nextArtist){
      nowArtist.textContent=nextArtist;
      if(animateMetadata)nowArtist.animate?.([{opacity:0},{opacity:1}],{duration:1000,easing:'ease-in-out'});
    }
    for(const [display,text] of [[sharedTitle,nextTitle],[sharedArtist,nextArtist]]){
      const track=display.querySelector('.saver-shared-text-track');
      if(track.textContent!==text){track.textContent=text;
        if(animateMetadata&&active&&!animatingMode)track.animate?.([{opacity:.35},{opacity:1}],{duration:950,easing:'ease-in-out'});
      }
    }
    const homepod=panel.mediaLimited(mediaState);
    music.classList.toggle('is-homepod',homepod);
    mini.classList.toggle('is-homepod',homepod);
    if(!hadMusic||playerChanged){
      $m('.saver-music-label').textContent=mediaState.attributes?.friendly_name||panel.t('media.speakerName');
      setPlayerLayout();
    }
    miniText('.saver-mini-title',nextTitle);
    miniText('.saver-mini-artist',nextArtist);
    if(textChanged)scheduleMarquee();
    updateArtwork(panel.mediaArtwork?.(mediaState)||String(a.entity_picture||''),mediaState);
    updateMusicProgress();
  }

  function hideVolumeToast(){
    clearTimeout(volumeToastTimer);
    volumeToast.classList.remove('is-visible');
    if(photoWait.classList.contains('is-loading')&&active&&!closing)photoWait.classList.add('is-visible');
  }
  function showVolumeToast(value){
    const n=Math.max(0,Math.min(10,Math.round(value)));
    volumeToast.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v6h4l5 4V5L9 9H5z"/><path d="M18 9.5a4 4 0 0 1 0 5"/><path d="M19.5 7a7.5 7.5 0 0 1 0 10"/></svg><span>${n}</span>`;
    volumeToast.classList.add('is-visible');
    photoWait.classList.remove('is-visible');
    clearTimeout(volumeToastTimer);
    volumeToastTimer=setTimeout(()=>{volumeToast.classList.remove('is-visible');if(photoWait.classList.contains('is-loading')&&active&&!closing)photoWait.classList.add('is-visible');},2600);
  }

  // Serialize volume updates so rapid taps don't overwrite each other out of order.
  async function sendVolume(id,value) {
    if(volumeSending){queuedVolume={id,value};return;}
    volumeSending=true;
    try {await panel._hass?.callService?.('media_player','volume_set',{entity_id:id,volume_level:value});}
    catch(error){console.error('Screensaver volume:',error);}
    finally {
      volumeSending=false;
      if(queuedVolume){const next=queuedVolume;queuedVolume=null;void sendVolume(next.id,next.value);}
    }
  }
  function commitVolume(value,immediate=false) {
    if(!mediaState||!feature(mediaState,4))return;
    const id=mediaState.entity_id;
    const normalized=Math.max(0,Math.min(1,Number(value)/10));
    volumeOverride={id,value:normalized,until:Date.now()+3000};
    clearTimeout(volumeCommitTimer);
    volumeCommitTimer=setTimeout(()=>void sendVolume(id,normalized),immediate?0:115);
  }
  async function musicCommand(action,data={}) {
    if(!mediaState||!panel._hass?.callService)return;
    const trackNav=action==='media_next_track'||action==='media_previous_track';
    if(trackNav)requestedTrackDirection={direction:action==='media_next_track'?1:-1,until:Date.now()+7000};
    try{await panel._hass.callService('media_player',action,
      {entity_id:mediaState.entity_id,...data});}
    catch(error){
      if(trackNav)requestedTrackDirection=null;
      console.error('Screensaver media command:',error);
    }
  }
  function changeVolume(direction){
    if(!mediaState||!feature(mediaState,4))return;
    const newLevel=Math.max(0,Math.min(10,Math.round(volumeValue(mediaState)*10)+direction));
    commitVolume(newLevel,true);
    showVolumeToast(newLevel);
  }
  function musicClick(event) {
    const btn=event.target.closest('button[data-saver-action]');
    if(!btn||btn.disabled||!mediaState)return false;
    event.preventDefault();event.stopPropagation();
    const cmd=btn.dataset.saverAction;
    if(cmd==='home'){hideVolumeToast();stop(false);return true;}
    if(cmd==='browse'){hideVolumeToast();panel.openMusicPage?.('lock');return true;}
    if(cmd==='shuffle'){
      const next=!effectiveMode(mediaState,'shuffle');
      shuffleOverride={id:mediaState.entity_id,value:next,until:Date.now()+3500};
      void musicCommand('shuffle_set',{shuffle:next});updateMusicProgress();return true;
    }
    if(cmd==='repeat'){
      const prev=effectiveMode(mediaState,'repeat');
      const next=prev==='off'?'one':prev==='one'?'all':'off';
      repeatOverride={id:mediaState.entity_id,value:next,until:Date.now()+3500};
      void musicCommand('repeat_set',{repeat:next});updateMusicProgress();return true;
    }
    if(cmd==='minimize'){setMiniMode(true,{manual:true});return true;}
    if(cmd==='volume-down'){changeVolume(-1);return true;}
    if(cmd==='volume-up'){changeVolume(1);return true;}
    if(cmd==='playpause')void musicCommand(mediaState.state==='playing'?'media_pause':'media_play');
    if(cmd==='next')void musicCommand('media_next_track');
    if(cmd==='previous')void musicCommand('media_previous_track');
    return true;
  }
  function waveInput(event){
    if(event.target.matches('[data-saver-volume]') && !event.target.disabled){
      const level=Number(event.target.value)||0;
      $m('.saver-v46-volume-fill').style.width=`${level*10}%`;
      showVolumeToast(level);
      return;
    }
    if(event.target.matches('[data-saver-seek]') && !event.target.disabled){
      const a=mediaState?.attributes||{};
      const duration=Number(a.media_duration)||0;
      updateWaveProgress(Number(event.target.value),duration);
      $m('.saver-music-elapsed').textContent=fmt(Number(event.target.value));
    }
  }
  function commitSeek(){
    const seek=$m('[data-saver-seek]');
    if(seek.disabled||!mediaState)return;
    const target=Number(seek.value);
    if(!Number.isFinite(target))return;
    const now=Date.now();
    if(lastSeekCommit&&lastSeekCommit.id===mediaState.entity_id&&lastSeekCommit.value===target&&now-lastSeekCommit.at<400)return;
    lastSeekCommit={id:mediaState.entity_id,value:target,at:now};
    seekOverride={id:mediaState.entity_id,value:target,started:now,until:now+5000};
    updateWaveProgress(target,Number(mediaState.attributes?.media_duration)||0);
    void musicCommand('media_seek',{seek_position:target});
  }
  function musicChange(event){
    if(event.target.matches('[data-saver-seek]')&&!event.target.disabled){
      seekDragging=false;
      commitSeek();
    }
  }
  // A stable flag prevents the 1-second HA refresh from snapping the thumb
  // back during a touch drag. Pointer capture is retained by the real input.
  const seekControl=$m('[data-saver-seek]');
  function beginSeek(event){
    if(seekControl.disabled)return;
    seekDragging=true;
    event.stopPropagation();
    try{seekControl.setPointerCapture(event.pointerId);}catch(_){}
  }
  function finishSeek(event){
    if(!seekDragging)return;
    seekDragging=false;
    event.stopPropagation();
    commitSeek();
  }
  function cancelSeek(){seekDragging=false;}
  seekControl.addEventListener('pointerdown',beginSeek);
  seekControl.addEventListener('pointerup',finishSeek);
  seekControl.addEventListener('pointercancel',cancelSeek);

  let idleOverrideMs = OPTIONS.idleMs;
  let idleTimer = null;
  let slideTimer = null;
  let trackSlideTimer = null;
  let trackKey = '';
  let requestedTrackDirection = null;
  let pendingTrackSlideDirection = null;
  let clockTimer = null;
  let photoFadeTimer = null;
  let exitTimer = null;

  let active = false;
  let closing = false;
  let disposed = false;
  let suspended = false;
  let isLoading = false;
  let transitionUntil = 0;

  let currentFolder = null;
  let folderVersion = 0;
  let slideVersion = 0;
  let files = [];
  let shuffled = [];
  let shuffledPosition = 0;
  let history = [];
  let historyPosition = -1;
  let foreground = -1;

  /* ONE PHOTO OWNER: four decoded images at most, one visible photo state.
     Preloading reserves IDs but never moves historyPosition or foreground.
     Every photo request (manual/timer/track) uses the same cache and renderer. */
  const photoCache = new Map();
  const pendingBlobRevokes = new Set();
  // 2.5 MP per image: <= 10 MiB decoded; four images fit the 48 MiB target.
  // Large originals must NOT evict the first next image on every preload.
  const photoMaxPixels = 2_500_000;
  const plannedForward = [];
  let photoCacheClock = 0;
  let preloadTimer = null;
  let preloadEpoch = 0;
  let pendingManualDirection = null;
  let photoNoticeTimer = null;

  function hidePhotoNotice(){
    clearTimeout(photoNoticeTimer);photoNoticeTimer=null;
    photoWait.classList.remove('is-visible','is-loading');
  }
  function showPhotoNotice(kind='loading'){
    clearTimeout(photoNoticeTimer);photoNoticeTimer=null;
    if(!active||closing||suspended)return;
    photoWait.classList.toggle('is-loading',kind==='loading');
    photoWaitText.textContent=panel.t(kind==='loading'?'lock.preparingPhoto':'lock.photoUnavailable');
    photoWait.classList.add('is-visible');
    if(kind!=='loading')photoNoticeTimer=setTimeout(hidePhotoNotice,2500);
    // Volume is the more important notification when both need this corner.
    if(volumeToast.classList.contains('is-visible'))photoWait.classList.remove('is-visible');
  }
  function revokeUnusedPhotoBlobs(){
    for(const url of [...pendingBlobRevokes]){
      if(images.some(image=>image?.isConnected && (image.currentSrc===url||image.src===url)))continue;
      if(overlay.style.getPropertyValue('--vega-lock-painted-image').includes(url))continue;
      URL.revokeObjectURL(url);pendingBlobRevokes.delete(url);
    }
  }
  function disposeCacheEntry(entry){
    if(entry?.objectURL)pendingBlobRevokes.add(entry.objectURL);
  }
  function invalidatePhotoCache(){
    clearTimeout(preloadTimer);preloadTimer=null;++preloadEpoch;
    for(const entry of photoCache.values())disposeCacheEntry(entry);
    photoCache.clear();plannedForward.length=0;
    pendingManualDirection=null;hidePhotoNotice();
    revokeUnusedPhotoBlobs();
  }
  function photoIdAtCurrent(){return history[historyPosition]||null;}
  function reserveForward(count=2){
    const known=history.slice(historyPosition+1,historyPosition+1+count);
    while(known.length+plannedForward.length<count && files.length){
      const id=nextRandomId();if(!id)break;plannedForward.push(id);
    }
    return known.concat(plannedForward.slice(0,count-known.length));
  }
  function cachePriority(){
    const ahead=reserveForward(2);
    return [photoIdAtCurrent(),ahead[0],history[historyPosition-1],ahead[1]].filter(Boolean);
  }
  function trimPhotoCache(){
    const keep=cachePriority();
    // Keep current photo first, then the next image and the previous image.
    // The optional second-next is the first to lose its slot under memory pressure.
    const sizeOf=e=>e?.image?(e.image.naturalWidth||0)*(e.image.naturalHeight||0)*4:0;
    let size=[...photoCache.values()].reduce((sum,e)=>sum+sizeOf(e),0);
    const over=()=>photoCache.size>OPTIONS.photoCacheCount||size>OPTIONS.photoCacheBytes;
    const entries=[...photoCache.entries()].sort((a,b)=>{
      const pa=keep.indexOf(a[0]),pb=keep.indexOf(b[0]);
      return (pa===-1?-1:keep.length-pa)-(pb===-1?-1:keep.length-pb)||a[1].stamp-b[1].stamp;
    });
    for(const [id,entry] of entries){
      if(!over())break;
      if(id===photoIdAtCurrent() || id===keep[1] ||
          (isLoading && id===currentLoadingId))continue;
      // Never evict the visible slot or an actively rendering/preloading photo.
      if(entry.loading || images.some(image=>image?.isConnected && entry.image &&
          (image.currentSrc||image.src)===(entry.image.currentSrc||entry.image.src)))continue;
      photoCache.delete(id);size-=sizeOf(entry);disposeCacheEntry(entry);
    }
  }
  let currentLoadingId = null;
  async function screenSizedPhoto(original){
    const pixels=original.naturalWidth*original.naturalHeight;
    if(pixels<=photoMaxPixels)return {image:original,objectURL:null};
    const scale=Math.sqrt(photoMaxPixels/pixels);
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.floor(original.naturalWidth*scale));
    canvas.height=Math.max(1,Math.floor(original.naturalHeight*scale));
    try{
      const context=canvas.getContext('2d',{alpha:true});
      if(!context||typeof canvas.toBlob!=='function')return {image:original,objectURL:null};
      context.imageSmoothingEnabled=true;
      context.imageSmoothingQuality='high';
      context.drawImage(original,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.90));
      if(!blob)return {image:original,objectURL:null};
      const objectURL=URL.createObjectURL(blob);
      try{
        const optimized=new Image();optimized.src=objectURL;
        if(optimized.decode)await optimized.decode();
        else await new Promise((resolve,reject)=>{optimized.onload=resolve;optimized.onerror=reject;});
        if(!optimized.naturalWidth)throw new Error('Invalid resized Lock photo');
        return {image:optimized,objectURL};
      }catch(error){URL.revokeObjectURL(objectURL);throw error;}
    }catch(error){
      // Cross-origin/tainted images cannot be drawn on canvas. Fall back to
      // the real photo and guard current+next without discarding their slots.
      console.warn('Vega Lock: photo resizing skipped',error);
      return {image:original,objectURL:null};
    }finally{canvas.width=0;canvas.height=0;}
  }
  function acquirePhoto(id){
    const hit=photoCache.get(id);
    if(hit){hit.stamp=++photoCacheClock;return hit.promise;}
    const epoch=folderVersion;
    const entry={id,loading:true,image:null,objectURL:null,stamp:++photoCacheClock,promise:null};
    photoCache.set(id,entry);
    entry.promise=(async()=>{
      if(disposed||epoch!==folderVersion)throw new Error('Stale photo folder');
      let url=id;
      if(url?.startsWith('/media/')){
        // Browsers cannot attach an HA Authorization header to <img>. Use HA's
        // authenticated short-lived signed URL, obtained only when preloading.
        const signed=await panel._hass?.callWS?.({type:'auth/sign_path',path:id,expires:3600});
        if(!signed?.path?.startsWith('/media/'))throw new Error('Cannot authorize media photo');
        url=signed.path;
      }
      if(disposed||epoch!==folderVersion)throw new Error('Stale photo folder');
      if(!url)throw new Error('Media URL empty');
      const image=await new Promise((resolve,reject)=>{
        const node=new Image();node.referrerPolicy='no-referrer';let settled=false;
        const timeout=setTimeout(()=>finish(new Error('Lock photo timeout')),15000);
        function finish(error){
          if(settled)return;settled=true;clearTimeout(timeout);node.onload=node.onerror=null;
          if(error)reject(error);else resolve(node);
        }
        node.onload=async()=>{
          try{
            if(typeof node.decode==='function')await node.decode();
            if(!node.naturalWidth||!node.naturalHeight)throw new Error('Invalid lock photo');
            finish(null);
          }catch(error){finish(error);}
        };
        node.onerror=()=>finish(new Error('Lock photo load error'));
        node.src=url;
      });
      if(disposed||epoch!==folderVersion)throw new Error('Stale photo folder');
      const prepared=await screenSizedPhoto(image);
      if(disposed||epoch!==folderVersion){
        if(prepared.objectURL)URL.revokeObjectURL(prepared.objectURL);
        throw new Error('Stale photo folder');
      }
      entry.image=prepared.image;entry.objectURL=prepared.objectURL;
      entry.loading=false;entry.stamp=++photoCacheClock;
      trimPhotoCache();
      return entry.image;
    })().catch(error=>{
      if(photoCache.get(id)===entry){photoCache.delete(id);disposeCacheEntry(entry);}
      entry.loading=false;throw error;
    });
    trimPhotoCache();
    return entry.promise;
  }
  function schedulePhotoPreload(){
    clearTimeout(preloadTimer);preloadTimer=null;
    // Do not resolve a new image during Home -> Lock fade or Music -> Lock.
    if(disposed||!active||closing||suspended||surfacePhase!=='lock'||!files.length||foreground<0)return;
    const epoch=++preloadEpoch,folder=folderVersion;
    preloadTimer=setTimeout(async()=>{
      preloadTimer=null;
      // Current + 2 next + previous, with memory and entry-count limits.
      const wanted=cachePriority().slice(1);
      for(const id of wanted){
        if(disposed||!active||closing||suspended||surfacePhase!=='lock'||epoch!==preloadEpoch||folder!==folderVersion)return;
        if(photoCache.has(id))continue;
        try{await acquirePhoto(id);}catch(_){/* Background prefetch never shows an error. */}
      }
      trimPhotoCache();
    },140);
  }
  function waitPhotoPaint(){
    // decode() only confirms decoding, not the next compositor paint.
    return new Promise(resolve=>{
      let settled=false;
      const timeout=setTimeout(done,130);
      function done(){if(settled)return;settled=true;clearTimeout(timeout);resolve();}
      requestAnimationFrame(()=>requestAnimationFrame(done));
    });
  }

  /* RANDOM ORDER */

  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  /* GET FOLDER NAME FROM HELPER */

  function folderFromEntity() {
    return panel._v41?.imageSource?.()||'';
  }
  const photoInterval=()=>panel._v41?.imageInterval?.()||OPTIONS.slideMs;
  let imageNonce=Date.now();
  const imageURL=source=>expandImageURL(source,overlay.clientWidth,overlay.clientHeight,++imageNonce);
  const currentPhotoBelongs=()=>randomImageSource(currentFolder)||files.includes(photoIdAtCurrent());

  /* CLOCK - HH:mm ONLY */

  function updateSaverLabels(){
    const keys={home:'music.home',browse:'music.browse',minimize:'music.minimize'};
    for(const [action,key] of Object.entries(keys)){
      const b=music.querySelector(`[data-saver-action="${action}"]`);
      if(b){if(action==='browse')b.hidden=!panel.musicAvailable();const label=panel.t(key);b.setAttribute('aria-label',label);b.title=label;}
    }
    mini.setAttribute('aria-label',panel.t('music.maximize'));
    if(photoWait.classList.contains('is-loading')||photoWait.classList.contains('is-visible'))photoWaitText.textContent=panel.t(photoWait.classList.contains('is-loading')?'lock.preparingPhoto':'lock.photoUnavailable');
    const assign=(node,key,attr='aria-label')=>{if(node)node.setAttribute(attr,panel.t(key));};
    assign(music,'media.speakerNowPlaying');
    assign(music.querySelector('.saver-homepod-wave'),'media.waveLabel');
    assign(mini.querySelector('.saver-mini-wave'),'media.waveLabel');
    assign(music.querySelector('[data-saver-seek]'),'media.seekPosition');
    assign(mini.querySelector('[data-mini-action="playpause"]'),'media.playPause');
    assign(music.querySelector('[data-saver-action="playpause"]'),'media.playPause');
    if(mediaState){const homepod=panel.mediaLimited(mediaState);
      $m('.saver-music-label').textContent=mediaState.attributes?.friendly_name||panel.t('media.speakerName');}
    const shuffle=music.querySelector('[data-saver-action="shuffle"]'),repeat=music.querySelector('[data-saver-action="repeat"]');
    if(shuffle){const label=panel.t(shuffle.getAttribute('aria-pressed')==='true'?'media.shuffleOn':'media.shuffleOff');shuffle.title=label;shuffle.setAttribute('aria-label',label);}
    if(repeat){const label=panel.t(repeat.dataset.mode==='one'?'media.repeatOne':repeat.dataset.mode==='all'?'media.repeatAll':'media.repeatOff');repeat.title=label;repeat.setAttribute('aria-label',label);}
    for(const action of ['previous','next']){
      const label=panel.t(action==='previous'?'media.previousTrack':'media.nextTrack');
      mini.querySelector(`[data-mini-action="${action}"]`)?.setAttribute('aria-label',label);
      music.querySelector(`[data-saver-action="${action}"]`)?.setAttribute('aria-label',label);
    }
    for(const [action,key] of [['volume-down','media.volumeDown'],['volume-up','media.volumeUp']]){
      music.querySelector(`[data-saver-action="${action}"]`)?.setAttribute('aria-label',panel.t(key));
    }
  }

  let clockZone='',clockFormat;
  function updateClock() {
    const zone=panel._hass?.config?.time_zone||'';
    if(!clockFormat||zone!==clockZone){
      clockZone=zone;
      try{clockFormat=new Intl.DateTimeFormat('en-GB',{...(zone?{timeZone:zone}:{}),hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}
      catch(_){clockFormat=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}
    }
    paintClockInk(clockFormat.format(new Date()));
  }

  async function browseFolder(source,token) {
    if(disposed||token!==folderVersion||!source)return [];
    if(panel._v41?.imageSourceMode?.()==='helper'){
      // Browse the directory once, not every slide. The built-in HA auth/sign_path
      // command signs each individual file only when its preloader requests it.
      const result=await panel._hass?.callWS?.({type:'vega_home/media/folder',folder:source});
      if(disposed||token!==folderVersion)return [];
      return Array.isArray(result?.images)?result.images.filter(url=>
        typeof url==='string'&&url.startsWith('/media/')&&!url.includes('?')&&!url.includes('#')).slice(0,500):[];
    }
    return [randomImageSource(source)?source:imageURL(source)];
  }

  function resetImageOrder(found) {
    files = found;
    shuffled = shuffle([...found]);
    shuffledPosition = 0;
    history = [];
    historyPosition = -1;
  }

  /* CHANGE FOLDER AUTOMATICALLY */

  async function refreshFolder(state, force = false) {
    const folder = folderFromEntity(state);
    if (!force && folder === currentFolder) return;
    currentFolder = folder;
    const token = ++folderVersion;
    ++slideVersion;  // Discard any pending image from the previous folder.
    isLoading = false;
    transitionUntil = 0;
    clearTimeout(slideTimer);
    clearTimeout(photoFadeTimer);
    // Retain the old decoded and painted photo while the new folder is being
    // enumerated. No placeholder frame and no destructive cache reset during IO.
    if (!folder) {resetImageOrder([]);invalidatePhotoCache();clearPhotos();return false;}
    try {
      const found = await browseFolder(folder, token);
      if (disposed || token !== folderVersion) return;
      if (!found.length) {
        // Keep the last painted image (if any) instead of flashing black.
        // The normal wallpaper remains visible when no photo was painted yet.
        console.warn('Vega Lock: folder has no supported photos:',folder);
        return false;
      } else {
        resetImageOrder(found);
        invalidatePhotoCache();
        if(active)return await changeSlide(1,false,'initial');
      }
      return false;
    } catch (error) {
      if (!disposed && token === folderVersion) {
        console.error("Apple Screensaver: lỗi đọc thư mục", folder, error);
      }
    }
  }

  /* RANDOM QUEUE AND HISTORY */

  function nextRandomId() {
    if(randomImageSource(currentFolder))return imageURL(currentFolder);
    if (!files.length) return null;
    if (shuffledPosition >= shuffled.length) {
      shuffled = shuffle([...files]);
      shuffledPosition = 0;
      // Reserved preloads can cross a shuffle boundary BEFORE history commits.
      // Compare against the last reserved item, not only the visible photo.
      const lastId = plannedForward[plannedForward.length-1] || history[historyPosition];
      if (shuffled.length > 1 && shuffled[0] === lastId) {
        [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
      }
    }
    return shuffled[shuffledPosition++];
  }

  function selectImage(direction) {
    if (direction < 0) {
      if (historyPosition < 1) return null;
      return { id: history[historyPosition - 1], position: historyPosition - 1 };
    }
    if (historyPosition < history.length - 1) {
      return { id: history[historyPosition + 1], position: historyPosition + 1 };
    }
    const id = reserveForward(1)[0];
    return id ? { id, position: -1 } : null;
  }

  /* CROSSFADE BETWEEN PHOTOS */

  function keepLockPhotoUnderlay(image){
    const url=image?.currentSrc||image?.src;
    if(url)overlay.style.setProperty('--vega-lock-painted-image',`url(${JSON.stringify(url)})`);
  }
  function commitPhotoSurface(){
    if(foreground<0)return;
    const current=photoSlots[foreground];
    photoTrack.style.transition='none';photoTrack.style.transform='none';
    photoTrack.dataset.mode='fade';
    for(let i=0;i<photoSlots.length;i++){
      photoSlots[i].style.transition='none';
      photoSlots[i].style.left='0';
      photoSlots[i].style.zIndex=i===foreground?'1':'0';
      photoSlots[i].style.opacity=i===foreground?'1':'0';
    }
    keepLockPhotoUnderlay(images[foreground]);
  }
  function releaseUnusedPhotoSlot(){
    if(foreground<0)return;
    const other=foreground===0?1:0;
    photoSlots[other].replaceChildren();images[other]=null;
    revokeUnusedPhotoBlobs();trimPhotoCache();
  }

  async function showImage(decodedImage, fadeMs, slideDirection=0, stillCurrent=()=>true) {
    const previous=foreground,next=previous===0?1:0;
    const nextSlot=photoSlots[next],oldSlot=previous<0?null:photoSlots[previous];
    const outgoing=previous<0?null:images[previous];
    // Keep the outgoing (or first decoded) Lock image as opaque background
    // before either photo slot moves; the Home wallpaper must never show.
    keepLockPhotoUnderlay(outgoing||decodedImage);
    // Cache owns decoded resources, render slots own DOM nodes. A cached <img>
    // still in the outgoing slot must NEVER be moved (that caused a gap with
    // the previous Lock wallpaper visible as an apparent duplicate).
    const renderImage=decodedImage.isConnected?decodedImage.cloneNode(false):decodedImage;
    renderImage.className='saver-image';renderImage.alt='';
    renderImage.setAttribute('draggable','false');
    if(renderImage!==decodedImage){
      if(renderImage.decode)await renderImage.decode();
      if(!stillCurrent())return false;
    }
    nextSlot.replaceChildren(renderImage);
    images[next]=renderImage;
    clearTimeout(photoFadeTimer);
    photoTrack.style.transition='none';
    nextSlot.style.transition='none';
    if(oldSlot)oldSlot.style.transition='none';
    const slide=!!(slideDirection&&oldSlot);
    if(slide){
      photoTrack.dataset.mode='slide';
      // Both cells are exact halves of a fixed 200% track. Their opaque
      // pictures exist before the FIRST animation frame, even on iOS WebKit.
      oldSlot.style.left=slideDirection>0?'0':'50%';
      nextSlot.style.left=slideDirection>0?'50%':'0';
      oldSlot.style.zIndex='1';nextSlot.style.zIndex='1';
      oldSlot.style.opacity='1';nextSlot.style.opacity='1';
      photoTrack.style.transform=slideDirection>0?'translate3d(0,0,0)':'translate3d(-50%,0,0)';
      await waitPhotoPaint();
      if(!stillCurrent()){
        if(nextSlot.contains(renderImage)&&foreground!==next){nextSlot.replaceChildren();images[next]=null;}
        // The newer scene/transition owns compositor state. An obsolete
        // callback must never reset its transform or opacity.
        return false;
      }
      photoTrack.style.transition=`transform ${fadeMs}ms cubic-bezier(.32,.08,.68,.92)`;
      photoTrack.style.transform=slideDirection>0?'translate3d(-50%,0,0)':'translate3d(0,0,0)';
    }else{
      photoTrack.dataset.mode='fade';photoTrack.style.transform='none';
      nextSlot.style.zIndex='1';nextSlot.style.opacity='0';
      if(oldSlot){oldSlot.style.zIndex='0';oldSlot.style.opacity='1';}
      await waitPhotoPaint();
      if(!stillCurrent()){
        if(nextSlot.contains(renderImage)&&foreground!==next){nextSlot.replaceChildren();images[next]=null;}
        // The newer scene/transition owns compositor state. An obsolete
        // callback must never reset its transform or opacity.
        return false;
      }
      nextSlot.style.transition=`opacity ${fadeMs}ms ease`;
      nextSlot.style.opacity='1';
    }
    overlay.classList.add('has-slide');foreground=next;
    transitionUntil=Date.now()+fadeMs;
    photoFadeTimer=setTimeout(()=>{
      if(disposed||foreground!==next)return;
      // Atomic commit: one image stays painted; old slot no longer contributes.
      photoTrack.style.transition='none';photoTrack.style.transform='none';
      photoTrack.dataset.mode='fade';
      nextSlot.style.left='0';nextSlot.style.zIndex='1';
      nextSlot.style.transition='none';nextSlot.style.opacity='1';
      if(oldSlot){oldSlot.style.transition='none';oldSlot.style.left='0';oldSlot.style.zIndex='0';oldSlot.style.opacity='0';}
      keepLockPhotoUnderlay(images[next]);
      if(outgoing)outgoing.classList.remove('saver-slide-moving');
      releaseUnusedPhotoSlot();
      transitionUntil=0;
      schedulePhotoPreload();
      flushPendingPhotoActions();
    },fadeMs+45);
    return true;
  }

  function queueNextSlide(delay = photoInterval()) {
    clearTimeout(slideTimer);
    slideTimer = null;
    // A song controls photo changes; the slideshow interval is only for photo mode.
    if (!active || disposed || mediaState || suspended) return;
    slideTimer = setTimeout(() => {
      if (!mediaState) void changeSlide(1, false, 'timer');
    }, delay);
  }

  // Queue a single photo step on a real track change, not every HA state push.
  // When a previous photo is not in history, choose a new random one instead.
  function requestTrackSlide(direction) {
    if (!active || disposed || !mediaState || !files.length || foreground < 0) return;
    pendingTrackSlideDirection = direction;
    if(!suspended)flushTrackSlide();
  }
  function flushTrackSlide() {
    clearTimeout(trackSlideTimer);trackSlideTimer=null;
    if(pendingTrackSlideDirection===null||!active||disposed||!mediaState||suspended||surfacePhase!=='lock')return;
    if(!files.length||foreground<0){pendingTrackSlideDirection=null;return;}
    const wait=transitionUntil-Date.now()+45;
    if(isLoading||wait>0){
      trackSlideTimer=setTimeout(flushTrackSlide,Math.max(85,wait));
      return;
    }
    if(pendingManualDirection!==null){flushPendingPhotoActions();return;}
    const direction=pendingTrackSlideDirection;
    pendingTrackSlideDirection=null;
    void changeSlide(direction,false,'track');
  }
  function flushPendingPhotoActions(){
    if(disposed||!active||closing||suspended||isLoading)return;
    const wait=transitionUntil-Date.now();
    if(wait>0){clearTimeout(trackSlideTimer);trackSlideTimer=setTimeout(flushPendingPhotoActions,wait+50);return;}
    if(pendingManualDirection!==null){
      const direction=pendingManualDirection;pendingManualDirection=null;
      void changeSlide(direction,true,'manual');return;
    }
    if(pendingTrackSlideDirection!==null)flushTrackSlide();
  }
  function forgetTrackSlide() {
    clearTimeout(trackSlideTimer);
    trackSlideTimer = null;
    pendingTrackSlideDirection = null;
    requestedTrackDirection = null;
  }

  /* NEXT / PREVIOUS PHOTO */

  async function changeSlide(direction, manual, reason='timer') {
    if(!active||disposed||closing||!files.length)return false;
    if(reason==='initial'&&surfacePhase==='entering')return false;
    if(suspended){if(reason==='track')pendingTrackSlideDirection=direction;return false;}
    if(mediaState&&!manual&&reason!=='track'&&reason!=='initial')return false;
    if(isLoading||Date.now()<transitionUntil){
      // Preserve the most recent manual swipe instead of dropping it.
      if(manual)pendingManualDirection=direction;
      else if(reason==='track')pendingTrackSlideDirection=direction;
      else if(reason==='timer')queueNextSlide(1200);
      return false;
    }
    const target=selectImage(direction)||(reason==='track'?selectImage(1):null);
    if(!target||target.id===photoIdAtCurrent())return false;
    clearTimeout(slideTimer);
    isLoading=true;currentLoadingId=target.id;
    const token=++slideVersion,folderToken=folderVersion;
    const stillCurrent=()=>!disposed&&active&&!closing&&token===slideVersion&&folderToken===folderVersion;
    const alreadyReady=!!photoCache.get(target.id)?.image;
    if(manual&&!alreadyReady)showPhotoNotice('loading');
    try{
      const decoded=await acquirePhoto(target.id);
      if(!stillCurrent())return false;
      const fadeMs=manual?OPTIONS.manualFadeMs:OPTIONS.autoFadeMs;
      const moved=await showImage(decoded,fadeMs,manual?(direction>0?1:-1):0,stillCurrent);
      if(!moved||!stillCurrent())return false;
      if(target.position===-1){
        history.push(target.id);historyPosition=history.length-1;
        if(plannedForward[0]===target.id)plannedForward.shift();
        if(history.length>OPTIONS.maxImages){history.shift();historyPosition--;}
      }else historyPosition=target.position;
      hidePhotoNotice();
      trimPhotoCache();
      queueNextSlide(photoInterval()+fadeMs);
      return true;
    }catch(error){
      if(stillCurrent()){
        console.error('Vega Screensaver: photo load/decode failed',error);
        if(target.position===-1&&plannedForward[0]===target.id)plannedForward.shift();
        if(manual)showPhotoNotice('error');
        else hidePhotoNotice();
        queueNextSlide(10000);
      }
      return false;
    }finally{
      if(token===slideVersion){
        isLoading=false;currentLoadingId=null;
        if(Date.now()>=transitionUntil)flushPendingPhotoActions();
      }
    }
  }

  /* IDLE TIMER */
  const screenPower=installLockScreenPower(panel,()=>active&&!closing&&!suspended&&lockAllowed());

  function armIdle() {
    clearTimeout(idleTimer);
    if (lockAllowed()&&idleOverrideMs>0&&!disposed&&!active&&!closing&&!suspended) {
      idleTimer = setTimeout(start, idleOverrideMs);
    }
  }

  /* VEGA HOME SURFACE COORDINATOR (A=lock, B=Home, C=Music/popup).
   One compositor layer fades: B -> A fades the ENTIRE Home surface while
   the lock is fully painted BEHIND it; A -> B fades the lock above ready Home.
   C -> A leaves lock fully painted behind C before C starts fading.
   Do not animate children's opacity, wallpaper, or backdrop as a substitute. */
  const homeSurface = () => panel.shadowRoot?.querySelector('.app');
  let surfaceRAF=0,surfaceTimer=0,surfaceEpoch=0,surfacePhase='home';
  function cancelSurfaceTransition() {
    ++surfaceEpoch;
    cancelAnimationFrame(surfaceRAF);surfaceRAF=0;
    clearTimeout(surfaceTimer);surfaceTimer=0;
  }
  function settleLockSurface() {
    const completedHomeEntry=surfacePhase==='entering';
    const home=homeSurface();
    if(home){
      // Atomic swap under an opaque lock, with no visible Home frame.
      home.style.transition='none';home.style.zIndex='0';home.style.opacity='1';
      home.classList.add('vega-home-in-lock');
      home.inert=true;
      home.hidden=true; // Lock is opaque; no Home painting, focus or touch underneath.
      panel.cancelTabTransition?.();
      if(panel.tab===1)panel.stopCamera?.();
    }
    overlay.style.transition='none';overlay.style.opacity='1';overlay.style.zIndex='1000';
    overlay.classList.add('is-open');
    overlay.inert=suspended;
    if(overlay.classList.contains('is-preparing-lock')){
      void getComputedStyle(music).opacity;
      overlay.classList.remove('is-preparing-lock');
    }
    surfacePhase='lock';
    if(completedHomeEntry&&!suspended){
      const folderState=null;
      if(folderFromEntity(folderState)!==currentFolder)void refreshFolder(folderState);
      else if(foreground<0&&files.length&&!isLoading)void changeSlide(1,false,'initial');
    }
    if(pendingTrackSlideDirection!==null)flushTrackSlide();
    schedulePhotoPreload();
  }
  function prepareHomeBehindLock() {
    const home=homeSurface();
    if(home){
      home.hidden=false; // Prepare the complete B scene BEFORE A begins fading.
      home.inert=true;
      home.style.transition='none';home.style.opacity='1';home.style.zIndex='0';
      home.classList.add('vega-home-in-lock');
    }
    overlay.style.zIndex='1000';
  }

  /* START SCREENSAVER WITH FADE-IN */

  function startClock(){
    clearInterval(clockTimer);
    clockTimer=setInterval(()=>{updateClock();updateMusicProgress();},1000);
  }

  function start({instant=false}={}) {
    if (!lockAllowed()||active||closing||disposed||(suspended&&!instant))return;
    cancelSurfaceTransition();
    clearMiniFade();
    active=true;
    screenPower.sync(true);
    clearTimeout(idleTimer);clearTimeout(exitTimer);
    overlay.classList.add('is-preparing-lock');
    overlay.inert=true;
    overlay.hidden=false;
    miniMode=false;overlay.classList.remove('is-mini','is-morphing','is-collapsing','is-expanding');
    fitAlbumArtwork();
    updateClock();updateSaverLabels();
    startClock();
    const folderState=null;
    const folder=folderFromEntity(folderState);
    const waitForFirstPhoto=Boolean(folder&&foreground<0);
    // Return to the EXACT decoded Lock photo that was visible before A -> B.
    // Refreshing the same folder here reset history and selected a new image
    // behind Home during B -> A, producing a visible background switch.
    // Only initialize/refresh when the source changed or no valid photo remains.
    const retainedPhoto=folder && folder===currentFolder && foreground>=0 &&
      images[foreground]?.isConnected && images[foreground]?.complete &&
      images[foreground]?.naturalWidth>0 &&
      currentPhotoBelongs();
    let firstPhoto;
    if(retainedPhoto){
      commitPhotoSurface();
      firstPhoto=Promise.resolve(true);
      queueNextSlide(); // Resume the usual timer; do not advance on entry.
    }else if(folder!==currentFolder || !files.length){
      firstPhoto=refreshFolder(folderState,true);
    }else{
      // First Lock entry can follow a completed background folder browse.
      firstPhoto=changeSlide(1,false,'initial');
    }
    updateNowPlaying({fresh:true});
    if(mediaState){miniMode=false;overlay.classList.remove('is-mini','is-morphing');suppressAutomatic=false;armAutoMini();}

    // The destination is painted at 100% underneath the Home surface.
    // For a configured Lock slideshow on FIRST entry, do not fade Home until
    // the first decoded Lock photo is in the actual render tree. Re-entry
    // can reuse the last decoded Lock photo without a wallpaper flash.
    overlay.style.transition='none';overlay.style.zIndex='1000';overlay.style.opacity='1';
    overlay.classList.add('is-open');
    const home=homeSurface();
    if(instant||!home){settleLockSurface();return firstPhoto;}
    home.hidden=false;
    home.inert=true;
    home.style.transition='none';home.style.zIndex='1001';home.style.opacity='1';
    home.classList.add('vega-home-in-lock');
    surfacePhase='preparing';
    const epoch=surfaceEpoch;
    let begun=false,fadeStarted=false;
    const beginFade=()=>{
      if(begun||disposed||closing||!active||epoch!==surfaceEpoch||!lockAllowed())return;
      begun=true;clearTimeout(surfaceTimer);
      surfacePhase='entering';
      if(waitForFirstPhoto&&foreground>=0){
        // The first decoded photo already supplies the underlay. Commit it before
        // revealing the glass so a second opacity change cannot repack its backdrop.
        clearTimeout(photoFadeTimer);transitionUntil=0;
        commitPhotoSurface();releaseUnusedPhotoSlot();
      }else if(waitForFirstPhoto){
        // The fade is committed to its fallback. Reuse the pending decode
        // only after Lock takes over the screen.
        ++slideVersion;isLoading=false;currentLoadingId=null;
      }
      const startFade=()=>{
        if(fadeStarted||disposed||closing||!active||epoch!==surfaceEpoch||!lockAllowed())return;
        fadeStarted=true;
        clearTimeout(surfaceTimer);cancelAnimationFrame(surfaceRAF);surfaceRAF=0;
        home.style.transition=`opacity ${OPTIONS.enterFadeMs}ms cubic-bezier(.4,0,.2,1)`;
        home.style.opacity='0';
        surfaceTimer=setTimeout(()=>{
          if(epoch===surfaceEpoch&&active&&!closing)settleLockSurface();
        },OPTIONS.enterFadeMs+45);
      };
      surfaceRAF=requestAnimationFrame(()=>{
        surfaceRAF=requestAnimationFrame(startFade);
      });
      surfaceTimer=setTimeout(startFade,130);
    };
    if(waitForFirstPhoto){
      // Keep a responsive fallback on offline HA, but never begin before
      // first-photo decode when HA responds normally.
      surfaceTimer=setTimeout(beginFade,5000);
      Promise.resolve(firstPhoto).then(beginFade,beginFade);
    }else beginFade();
    return firstPhoto;
  }

  function clearPhotos() {
    invalidatePhotoCache();
    overlay.classList.remove('has-slide');
    overlay.style.removeProperty('--vega-lock-painted-image');
    foreground = -1;
    transitionUntil = 0;
    photoTrack.style.transition='none';photoTrack.style.transform='none';
    photoTrack.dataset.mode='fade';
    for(const slot of photoSlots){slot.style.cssText='';}
    for(let i=0;i<images.length;i++){images[i]?.removeAttribute('src');images[i]=null;photoSlots[i].replaceChildren();}
    revokeUnusedPhotoBlobs();
  }

  /* STOP SCREENSAVER WITH FADE-OUT */

  function stop(immediate = false) {
    if ((!active && !closing) || disposed) return;
    const home=homeSurface();
    // If the user interrupts B -> A mid-fade, the equivalent A-over-B alpha
    // equals 1 - current Home alpha. Avoid a snap at the layer-order swap.
    const interrupted=surfacePhase==='entering'||surfacePhase==='preparing';
    const homeAlpha=home?Math.max(0,Math.min(1,parseFloat(getComputedStyle(home).opacity)||0)):1;
    cancelSurfaceTransition();
    active=false;closing=true;surfacePhase='leaving';syncAlbumActions();
    screenPower.sync();
    ++slideVersion;isLoading=false;currentLoadingId=null;pendingManualDirection=null;
    clearTimeout(preloadTimer);preloadTimer=null;++preloadEpoch;hidePhotoNotice();
    clearAutoMini();clearTimeout(slideTimer);forgetTrackSlide();
    clearInterval(clockTimer);clearTimeout(photoFadeTimer);clearTimeout(exitTimer);
    overlay.style.pointerEvents='auto';
    // The old order rendered the device grid WHILE Home was display:none,
    // producing 150px fallback geometry and narrow cards until room change.
    prepareHomeBehindLock();
    if(!immediate)panel.restoreHomeFromScreensaver?.();
    overlay.style.transition='none';overlay.style.opacity=interrupted?String(1-homeAlpha):'1';
    overlay.classList.add('is-open');
    void overlay.offsetWidth;
    if(!immediate){
      overlay.style.transition=`opacity ${OPTIONS.exitFadeMs}ms cubic-bezier(.4,0,.2,1)`;
      overlay.style.opacity='0';
    }
    const finish=()=>{
      overlay.hidden=true;
      clearMiniFade();
      overlay.classList.remove('is-open','is-preparing-lock');
      overlay.style.transition='';overlay.style.opacity='';overlay.style.zIndex='';
      if(home){home.hidden=false;home.inert=false;home.classList.remove('vega-home-in-lock');home.style.transition='';home.style.opacity='';home.style.zIndex='';}
      cancelPlayerMorph();
      miniMode=false;
      overlay.classList.remove('is-mini','is-morphing','is-collapsing','is-expanding');
      suppressAutomatic=false;music.classList.remove('is-playing');overlay.classList.remove('has-music');
      closing=false;surfacePhase='home';overlay.style.pointerEvents='';overlay.inert=false;
      // Retain one decoded Lock photo while Home is visible. The next B->A
      // crossfade reveals a genuine Lock background, not Home's wallpaper.
      commitPhotoSurface();releaseUnusedPhotoSlot();hideVolumeToast();armIdle();
    };
    if(immediate)finish();
    else exitTimer=setTimeout(finish,OPTIONS.exitFadeMs+35);
  }

  /*  — One gesture path and a safe click fallback.
     Pointer events handle swipes and taps; delegated click handles cases
     without a usable pointerup, including touch-driver cancellations.
     Full Player: background is intentionally non-dismissable (Home button).
     Mini / photo-only: any background tap returns Home.
     Horizontal swipes still navigate tracks (Full) or photos (Mini/photo). */
  let pointerStart=null;
  let swiped=false;
  function onPointerDown(event) {
    if((event.button!==0&&event.pointerType!=='touch')||!active||closing)return;
    pointerStart={x:event.clientX,y:event.clientY,id:event.pointerId,
      control:!!event.target.closest('button,input,.saver-mini')};
    swiped=false;
    event.stopPropagation();
  }
  function onPointerUp(event) {
    if(!pointerStart||pointerStart.id!==event.pointerId)return;
    const start=pointerStart;pointerStart=null;
    if(!active||closing||start.control||event.target.closest('button,input,.saver-mini'))return;
    const dx=event.clientX-start.x,dy=event.clientY-start.y;
    if(mediaState&&!miniMode&&dy>39&&dy>Math.abs(dx)*1.10){
      swiped=true;event.preventDefault();event.stopPropagation();
      setMiniMode(true,{manual:true});
      return;
    }
    if(Math.abs(dx)>34&&Math.abs(dx)>Math.abs(dy)*1.12){
      swiped=true;event.preventDefault();event.stopPropagation();
      if(mediaState&&!miniMode){
        if(!panel.mediaLimited(mediaState)){
          const action=dx<0?'media_next_track':'media_previous_track';
          if(feature(mediaState,dx<0?32:16))void musicCommand(action);
        }
      } else void changeSlide(dx<0?1:-1,true);
      return;
    }
    // A true tap is handled on pointerup even when a touch driver omits click.
    // The click handler is a fallback for keyboard/synthetic/canceled sequences.
    if(Math.hypot(dx,dy)<=21){
      if(!mediaState||miniMode){
        event.preventDefault();event.stopPropagation();
        stop(false); // closing guards the later synthetic click from firing twice.
      }
    } else swiped=true; // movement below swipe threshold is not a tap.
  }
  function swallowEvent(event){event.preventDefault();event.stopPropagation();}
  function activity(event){if(active&&!closing)screenPower.activity();if(!active&&!closing&&!overlay.contains(event.target))armIdle();}
  const visibility=()=>screenPower.sync(true);
  document.addEventListener('visibilitychange',visibility);
  overlay.addEventListener('pointerdown',onPointerDown);
  overlay.addEventListener('pointerup',onPointerUp);
  overlay.addEventListener('pointercancel',()=>{pointerStart=null;});
  overlay.addEventListener('click',event=>{
    if(swiped){swiped=false;swallowEvent(event);return;}
    if(!active||closing){swallowEvent(event);return;}
    // Mini player intercepts its own buttons/taps to control or expand.
    if(event.target.closest('.saver-mini'))return;
    // Preserve existing Home, Browse, transport and mode buttons in Full.
    if(event.target.closest('.saver-music')&&musicClick(event))return;
    // Other button/slider touches must never act as background taps.
    if(event.target.closest('button,input')){swallowEvent(event);return;}
    if(mediaState&&!miniMode){swallowEvent(event);return;}
    // Mini or photo-only screensaver: background tap anywhere exits Home.
    swallowEvent(event);
    stop(false);
  });
  mini.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    const btn=event.target.closest('button[data-mini-action]');
    if(btn){if(btn.disabled||!mediaState)return;
      if(btn.dataset.miniAction==='playpause')void musicCommand(mediaState.state==='playing'?'media_pause':'media_play');
      if(btn.dataset.miniAction==='previous')void musicCommand('media_previous_track');
      if(btn.dataset.miniAction==='next')void musicCommand('media_next_track');
      return;
    }
    expandManual();
  });
  mini.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&event.target===mini){event.preventDefault();expandManual();}});
  music.addEventListener('change',musicChange);
  music.addEventListener('input',waveInput);
  overlay.addEventListener('dblclick',swallowEvent);
  overlay.addEventListener('contextmenu',swallowEvent);
  window.addEventListener('pointerdown',activity,{passive:true});
  window.addEventListener('pointermove',activity,{passive:true});
  window.addEventListener('wheel',activity,{passive:true});
  window.addEventListener('keydown',activity);
  let resizeRAF=0,releaseMusicPhotoWait=null;
  function resizePlayer(){
    if(!active||resizeRAF)return;
    resizeRAF=requestAnimationFrame(()=>{resizeRAF=0;if(active)fitAlbumArtwork();});
  }
  window.addEventListener('resize',resizePlayer);

  /* PUBLIC API - FUTURE EXTENSIONS */

  const api = {
    updateScreenPower(){screenPower.sync(true);},
    setIdleMs(ms){
      if(Number.isFinite(Number(ms)))idleOverrideMs=Number(ms)===0?0:Math.max(20000,Math.min(60000,Math.round(Number(ms))));
      armIdle();
    },
    onImageSourceChange(){if(active&&!suspended)void refreshFolder(null,true);else{currentFolder=null;++folderVersion;invalidatePhotoCache();resetImageOrder([]);clearPhotos();}},
    onLanguageChange(){updateSaverLabels();},
    onHass(hass) {
      screenPower.sync();
      if(!lockAllowed()||closing)return;
      const folderState=null;
      if(active&&!suspended&&surfacePhase!=='entering'&&folderFromEntity(folderState)!==currentFolder)void refreshFolder(folderState);
      // Passive playback can refresh Lock while it is open.
      if(!active||suspended)return;
      updateClock();
      const wasPlaying=!!mediaState;
      updateNowPlaying();
      if(!wasPlaying&&mediaState)armAutoMini();
    },
    open({automatic=true,instant=false}={}) {
      if(disposed||!lockAllowed())return;
      if(suspended){suspended=false;}
      if(!active)start({instant});
      else if(mediaState&&miniMode)setMiniMode(false,{manual:!automatic});
      if(mediaState){if(automatic){suppressAutomatic=false;armAutoMini();}else{suppressAutomatic=true;clearAutoMini();}}
    },
    /* A -> C: keep the lock painted behind the completely opaque Music surface.
       Unlike suspend(), coverByMusic NEVER reveals Home. */
    coverByMusic() {
      if(!lockAllowed())return;
      suspended=true;clearTimeout(idleTimer);clearTimeout(slideTimer);
      screenPower.sync();
      clearAutoMini();clearInterval(clockTimer);
      // Stop a photo that was only loading; never let it commit beneath C.
      if(isLoading){++slideVersion;isLoading=false;currentLoadingId=null;}
      pendingManualDirection=null;hidePhotoNotice();
      if(active){cancelSurfaceTransition();settleLockSurface();overlay.style.pointerEvents='none';}
    },
    /* C -> A: prepare A at 100% while C is still opaque. */
    async revealUnderMusic({full=false}={}) {
      if(disposed||!lockAllowed())return false;
      if(closing){clearTimeout(exitTimer);closing=false;}
      let firstPhoto;
      if(!active){
        suspended=false;
        firstPhoto=start({instant:true});
      }else{
        overlay.classList.add('is-preparing-lock');
        updateNowPlaying();
      }
      cancelSurfaceTransition();settleLockSurface();
      overlay.inert=true;overlay.style.pointerEvents='none';
      if(full&&mediaState){
        cancelPlayerMorph();clearAutoMini();suppressAutomatic=false;
        miniMode=false;overlay.classList.remove('is-mini');syncAlbumActions();applyVisuals(false);
      }
      // Allow the first Lock photo to decode while Music remains opaque.
      if(firstPhoto&&currentFolder&&foreground<0){
        await new Promise(resolve=>{
          const finish=()=>{
            clearTimeout(timer);
            if(releaseMusicPhotoWait===finish)releaseMusicPhotoWait=null;
            resolve();
          };
          const timer=setTimeout(finish,5000);
          releaseMusicPhotoWait=finish;
          Promise.resolve(firstPhoto).then(finish,finish);
        });
        if(disposed||!active||!lockAllowed())return false;
      }
      ++slideVersion;isLoading=false;currentLoadingId=null;
      clearTimeout(photoFadeTimer);transitionUntil=0;commitPhotoSurface();releaseUnusedPhotoSlot();
      hidePhotoNotice();
      suspended=true;clearTimeout(idleTimer);clearInterval(clockTimer);clearAutoMini();
      screenPower.sync();
      return true;
    },
    uncoverMusic() {
      if(!lockAllowed())return;
      suspended=false;
      screenPower.sync(true);
      if(active){
        overlay.inert=false;
        overlay.style.pointerEvents='';
        updateClock();updateNowPlaying();startClock();armAutoMini();
        if(files.length&&!currentPhotoBelongs()&&!isLoading)void changeSlide(1,false,'initial');
        else if(pendingTrackSlideDirection!==null)flushTrackSlide();
        else if(!mediaState)queueNextSlide();
        schedulePhotoPreload();
      }else armIdle();
    },
    surfaceState(){return surfacePhase;},
    syncAvailability(){
      if(lockAllowed()){armIdle();return;}
      stop(true);
      clearTimeout(idleTimer);
      releaseMusicPhotoWait?.();
    },
    suspend() {
      suspended=true;
      screenPower.sync();
      stop(true); // Home-origin modal (not the lock-origin Music browser).
      clearTimeout(idleTimer);
    },
    resume() {
      suspended = false;
      armIdle();
    },
    destroy() {
      disposed = true;
      screenPower.destroy();document.removeEventListener('visibilitychange',visibility);
      releaseMusicPhotoWait?.();
      cancelSurfaceTransition();
      const home=homeSurface();
      if(home){home.hidden=false;home.inert=false;home.classList.remove('vega-home-in-lock');home.style.transition='';home.style.opacity='';home.style.zIndex='';}
      ++folderVersion;
      ++slideVersion;
      invalidatePhotoCache();
      ++artGeneration;
      clearTimeout(idleTimer);
      clearTimeout(slideTimer);
      forgetTrackSlide();
      clearInterval(clockTimer);
      clearTimeout(photoFadeTimer);
      clearTimeout(exitTimer);
      clearMiniFade();
      clearTimeout(volumeCommitTimer);
      clearTimeout(volumeToastTimer);
      cancelAnimationFrame(marqueeMeasureRAF);marqueeMeasureRAF=0;
      clearAutoMini();cancelPlayerMorph();cancelAnimationFrame(resizeRAF);
      overlay.removeEventListener("pointerdown", onPointerDown);
      overlay.removeEventListener("pointerup", onPointerUp);
      music.removeEventListener("change",musicChange);
      music.removeEventListener("input",waveInput);
      seekControl.removeEventListener('pointerdown',beginSeek);
      seekControl.removeEventListener('pointerup',finishSeek);
      seekControl.removeEventListener('pointercancel',cancelSeek);
      overlay.removeEventListener("dblclick", swallowEvent);
      overlay.removeEventListener("contextmenu", swallowEvent);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("pointermove", activity);
      window.removeEventListener("wheel", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("resize", resizePlayer);
      overlay.remove();
      style.remove();
      for(const url of pendingBlobRevokes)URL.revokeObjectURL(url);
      pendingBlobRevokes.clear();
      if (panel._screensaver === api) panel._screensaver = null;
    }
  };

  armIdle();
  api.onHass(panel._hass);
  return api;
}
