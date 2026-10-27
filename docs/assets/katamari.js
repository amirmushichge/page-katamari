(() => {
  if (window.__pageKatamariInstalled) return;
  window.__pageKatamariInstalled = true;

  const state = {
    active: false,
    raf: 0,
    lastTime: 0,
    canvas: null,
    ctx: null,
    itemsLayer: null,
    hud: null,
    help: null,
    dpr: 1,
    score: 0,
    tokens: [],
    attached: [],
    pendingPickups: [],
    pickupHopCount: 0,
    landingSplashCount: 0,
    landingBurstCount: 0,
    impactRings: [],
    landingBurst: null,
    shakeAnimations: [],
    wrappers: [],
    objects: [],
    mediaSurfaces: [],
    clearedAreas: [],
    keys: new Set(),
    scrollScanTimer: 0,
    scrollRefreshRaf: 0,
    periodicScanTimer: 0,
    mutationScanTimer: 0,
    scanning: false,
    observer: null,
    pointer: { x: 0, y: 0, active: false },
    orientation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    rolls: 0,
    trail: [],
    trailTick: 0,
    targetRadiusSquared: 24 * 24,
    spriteCanvas: document.createElement("canvas"),
    spriteCtx: null,
    ball: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: 18,
      rotation: 0,
      z: 0,
      vz: 0,
      landingPulse: 0,
      lastJumpAt: -Infinity,
      vaultUntil: 0
    }
  };

  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION",
    "VIDEO", "AUDIO", "CANVAS", "IFRAME", "TEMPLATE"
  ]);

  const OBJECT_SELECTOR = [
    "button", "[role='button']", "a[href]", "[role='link']",
    "img", "video", "canvas", "iframe", "object", "embed", "svg", "[role='img']",
    "[style*='background-image' i]", "[data-ad]", "[data-ad-container]", "ins.adsbygoogle",
    "[class*='advert' i]", "[class*='banner' i]", "[class*='promo' i]",
    "[id*='advert' i]", "[id*='banner' i]", "[aria-label*='advert' i]", "[aria-label*='реклам' i]"
  ].join(", ");
  const CONTROL_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", "W", "A", "S", "D", " "]);
  const BALL_DOT_COUNT = 74;
  const START_RADIUS = 24;
  const MANUAL_JUMP_POWER = 0.64;
  const AUTO_VAULT_JUMP_POWER = MANUAL_JUMP_POWER / 3;
  const LANDING_BURST_RADIUS = START_RADIUS * 2;
  const REDUCED_MOTION = matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const BALL_DOTS = Array.from({ length: BALL_DOT_COUNT }, (_, index) => {
    const y = 1 - index / (BALL_DOT_COUNT - 1) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    return [Math.cos(angle) * ring, y, Math.sin(angle) * ring];
  });

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  function isOwnNode(node) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(element?.closest?.("#page-katamari-canvas, #page-katamari-items, #page-katamari-hud, #page-katamari-help, [data-pk-ignore]"));
  }

  function isVisible(element) {
    if (!element || isOwnNode(element)) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.05) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1 && rect.bottom > -window.innerHeight * 0.25 && rect.top < window.innerHeight * 1.5;
  }

  function getReadableColor(element) {
    const color = getComputedStyle(element).color;
    return color && color !== "rgba(0, 0, 0, 0)" ? color : "#ffffff";
  }

  function isSplitMediaCard(element) {
    if (!element?.matches?.("a[href], [role='link']")) return false;
    const backgroundImage = getComputedStyle(element).backgroundImage;
    const hasMedia = Boolean(element.querySelector("img, video, canvas, iframe, object, embed, svg, [role='img']")) ||
      (backgroundImage && backgroundImage !== "none") || isAdElement(element);
    const hasText = Boolean((element.innerText || element.textContent || "").replace(/\s+/g, " ").trim());
    return hasMedia && hasText;
  }

  function isAdElement(element) {
    return Boolean(element?.matches?.(
      "[data-ad], [data-ad-container], ins.adsbygoogle, [class*='advert' i], [class*='banner' i], " +
      "[class*='promo' i], [id*='advert' i], [id*='banner' i], [aria-label*='advert' i], [aria-label*='реклам' i]"
    ));
  }

  function findMediaSurface(element) {
    const mediaRect = element.getBoundingClientRect();
    if (!mediaRect.width || !mediaRect.height) return null;
    let candidate = element.parentElement;
    let best = null;
    for (let depth = 0; candidate && depth < 4; depth += 1, candidate = candidate.parentElement) {
      if ([document.body, document.documentElement].includes(candidate) || isOwnNode(candidate)) break;
      const rect = candidate.getBoundingClientRect();
      if (!rect.width || !rect.height) break;
      const widthFill = mediaRect.width / rect.width;
      const heightFill = mediaRect.height / rect.height;
      const areaRatio = rect.width * rect.height / Math.max(1, mediaRect.width * mediaRect.height);
      if (widthFill < 0.72 || heightFill < 0.68 || areaRatio > 1.7) break;
      best = candidate;
      break;
    }
    return best;
  }

  function clearMediaSurface(token) {
    const surface = token.mediaSurface;
    if (!surface?.isConnected || [document.body, document.documentElement].includes(surface)) return;
    if (!state.mediaSurfaces.some((record) => record === surface)) state.mediaSurfaces.push(surface);
    surface.classList.add("page-katamari-media-cleared");
  }

  function addClearedArea(token) {
    const source = token.mediaSurface?.isConnected ? token.mediaSurface : token.element;
    const rect = source?.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) return;
    const style = getComputedStyle(source);
    const existing = state.clearedAreas.find((area) => area.source === source);
    const area = existing || { source };
    area.pageX = rect.left + scrollX;
    area.pageY = rect.top + scrollY;
    area.width = rect.width;
    area.height = rect.height;
    area.radius = clamp(parseFloat(style.borderTopLeftRadius) || 0, 0, Math.min(rect.width, rect.height) / 2);
    if (!existing) state.clearedAreas.push(area);
  }

  function makeTextCollectibles() {
    if (state.tokens.length > 1500) return;

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || SKIP_TAGS.has(parent.tagName) || isOwnNode(parent)) return NodeFilter.FILTER_REJECT;
        if (parent.closest(".page-katamari-text-node, [contenteditable='true'], button, [role='button'], svg")) return NodeFilter.FILTER_REJECT;
        const link = parent.closest("a[href], [role='link']");
        if (link && !isSplitMediaCard(link)) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue?.trim() || !isVisible(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    while (walker.nextNode() && nodes.length < 160) nodes.push(walker.currentNode);

    for (const textNode of nodes) {
      if (state.tokens.length >= 1500 || !textNode.isConnected) break;
      const parent = textNode.parentElement;
      const source = textNode.nodeValue;
      const wrapper = document.createElement("span");
      wrapper.className = "page-katamari-text-node";

      const style = getComputedStyle(parent);
      const fontSize = parseFloat(style.fontSize) || 14;
      const color = getReadableColor(parent);
      const fontFamily = style.fontFamily || "sans-serif";
      const fontWeight = style.fontWeight || "400";

      const segments = source.match(/\s+|[^\s]+/g) || [];
      for (const segment of segments) {
        if (/^\s+$/.test(segment)) {
          wrapper.append(document.createTextNode(segment));
          continue;
        }

        const span = document.createElement("span");
        span.className = "page-katamari-character";
        span.textContent = segment;
        wrapper.append(span);
        state.tokens.push({
          kind: "character",
          element: span,
          character: segment,
          color,
          fontFamily,
          fontWeight,
          fontSize,
          collected: false,
          pageX: 0,
          pageY: 0,
          width: Math.max(4, fontSize * 0.52 * segment.length),
          height: fontSize
        });
      }

      textNode.replaceWith(wrapper);
      state.wrappers.push({ wrapper, textNode, original: source });
    }

    refreshTokenPositions();
  }

  function makeObjectCollectibles() {
    const elements = document.querySelectorAll(OBJECT_SELECTOR);
    let added = 0;
    for (const element of elements) {
      if (added >= 500) break;
      if (!isVisible(element) || element.dataset.pageKatamariObject === "1") continue;
      if (element.closest(".page-katamari-text-node")) continue;
      const adContainer = isAdElement(element);
      const hasChildMedia = Boolean(element.querySelector?.("img, video, canvas, iframe, object, embed, svg, [role='img']"));
      if (isSplitMediaCard(element) && hasChildMedia && !adContainer) continue;
      if (element.parentElement?.closest("[data-page-katamari-object='1']")) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10 || rect.width > innerWidth * 0.96 || rect.height > innerHeight * 0.85) continue;

      const style = getComputedStyle(element);
      const footprint = Math.sqrt(rect.width * rect.height);
      const role = element.getAttribute("role");
      const isInteractive = element.matches("button, [role='button'], a[href], [role='link']");
      const hasVisualBackground = Boolean(style.backgroundImage && style.backgroundImage !== "none");
      const isMedia = ["IMG", "VIDEO", "CANVAS", "IFRAME", "OBJECT", "EMBED", "SVG"].includes(element.tagName) ||
        role === "img" || hasVisualBackground || adContainer;
      const minRadius = isMedia
        ? clamp(footprint * 0.08, 14, 24)
        : isInteractive
          ? clamp(footprint * 0.12, 13, 36)
          : clamp(footprint * 0.24, 16, 54);
      const character = element.tagName === "VIDEO"
        ? "▶"
        : element.tagName === "IFRAME"
          ? "□"
          : ["IMG", "PICTURE", "CANVAS"].includes(element.tagName) || element.getAttribute("role") === "img"
            ? "◉"
        : element.tagName === "SVG"
          ? "✦"
          : element.tagName === "ARTICLE"
            ? "▤"
            : "●";

      element.dataset.pageKatamariObject = "1";
      state.objects.push({
        element,
        opacity: element.style.getPropertyValue("opacity"),
        opacityPriority: element.style.getPropertyPriority("opacity"),
        transform: element.style.getPropertyValue("transform"),
        transformPriority: element.style.getPropertyPriority("transform"),
        pointerEvents: element.style.getPropertyValue("pointer-events"),
        pointerEventsPriority: element.style.getPropertyPriority("pointer-events")
      });
      state.tokens.push({
        kind: "object",
        media: isMedia,
        interactive: isInteractive,
        mediaSurface: isMedia ? (hasVisualBackground || adContainer ? element : findMediaSurface(element)) : null,
        element,
        character,
        color: style.color === "rgba(0, 0, 0, 0)" ? "#ffffff" : style.color,
        fontFamily: "PK Manrope, sans-serif",
        fontWeight: "650",
        fontSize: clamp(footprint * 0.18, 10, 21),
        collected: false,
        pageX: rect.left + scrollX + rect.width / 2,
        pageY: rect.top + scrollY + rect.height / 2,
        width: rect.width,
        height: rect.height,
        minRadius
      });
      added += 1;
    }
  }

  function refreshTokenPositions() {
    for (const token of state.tokens) {
      if (token.collected || !token.element?.isConnected) continue;
      const rect = token.element.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      token.pageX = rect.left + scrollX + rect.width / 2;
      token.pageY = rect.top + scrollY + rect.height / 2;
      token.width = Math.max(token.width || 0, rect.width);
      token.height = Math.max(token.height || 0, rect.height);
    }
  }

  function scanPage() {
    if (!state.active || state.scanning) return;
    state.scanning = true;
    try {
      state.tokens = state.tokens.filter((token) => !token.collected && token.element?.isConnected);
      makeTextCollectibles();
      makeObjectCollectibles();
      refreshTokenPositions();
    } finally {
      state.scanning = false;
    }
  }

  function createOverlay() {
    const itemsLayer = document.createElement("div");
    itemsLayer.id = "page-katamari-items";
    itemsLayer.setAttribute("aria-hidden", "true");
    document.documentElement.append(itemsLayer);
    state.itemsLayer = itemsLayer;

    const canvas = document.createElement("canvas");
    canvas.id = "page-katamari-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.documentElement.append(canvas);
    state.canvas = canvas;
    state.ctx = canvas.getContext("2d");

    const hud = document.createElement("div");
    hud.id = "page-katamari-hud";
    const readout = document.createElement("div");
    const score = document.createElement("div");
    score.className = "pk-score";
    score.append("Collected ");
    const scoreValue = document.createElement("span");
    scoreValue.textContent = "0";
    score.append(scoreValue);
    const size = document.createElement("div");
    size.className = "pk-size";
    size.textContent = `Size ${Math.round(state.ball.radius)}`;
    readout.append(score, size);
    const controls = document.createElement("div");
    controls.className = "pk-controls";
    for (const [className, label, glyph] of [["pk-jump", "Jump", "↑"], ["pk-stop", "Stop Page Katamari", "×"]]) {
      const button = document.createElement("button");
      button.className = className;
      button.type = "button";
      button.setAttribute("aria-label", label);
      button.title = label;
      button.textContent = glyph;
      controls.append(button);
    }
    hud.append(readout, controls);
    hud.querySelector(".pk-jump").addEventListener("click", (event) => {
      event.stopPropagation();
      state.pointer.active = false;
      jump();
    });
    hud.querySelector(".pk-stop").addEventListener("click", stop);
    document.documentElement.append(hud);
    state.hud = hud;

    const help = document.createElement("div");
    help.id = "page-katamari-help";
    help.textContent = matchMedia("(pointer: coarse)").matches
      ? "Drag to steer · Tap ↑ to jump · Tap × to stop"
      : "Cursor or WASD to steer · Space to jump · Esc to restore";
    document.documentElement.append(help);
    state.help = help;

    resize();
  }

  function copyComputedVisual(source, target, limit = 160) {
    const sources = [source, ...source.querySelectorAll?.("*") || []].slice(0, limit);
    const targets = [target, ...target.querySelectorAll?.("*") || []].slice(0, limit);
    for (let index = 0; index < Math.min(sources.length, targets.length); index += 1) {
      const computed = getComputedStyle(sources[index]);
      const style = targets[index].style;
      for (const property of computed) {
        const value = computed.getPropertyValue(property);
        if (value) style.setProperty(property, value, computed.getPropertyPriority(property));
      }
      targets[index].removeAttribute?.("id");
      targets[index].classList?.remove("page-katamari-collected");
    }
  }

  function makeVisualClone(token) {
    const source = token.element;
    const clone = source.cloneNode(true);
    copyComputedVisual(source, clone);
    clone.removeAttribute?.("id");
    clone.querySelectorAll?.("[id]").forEach((element) => element.removeAttribute("id"));
    clone.querySelectorAll?.(".page-katamari-collected").forEach((element) => element.classList.remove("page-katamari-collected"));
    clone.classList?.remove("page-katamari-character", "page-katamari-text-node", "page-katamari-collected");
    clone.classList?.add("page-katamari-attached");
    clone.setAttribute?.("aria-hidden", "true");

    Object.assign(clone.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: `${Math.max(1, token.width)}px`,
      height: `${Math.max(1, token.height)}px`,
      minWidth: "0px",
      minHeight: "0px",
      maxWidth: "none",
      maxHeight: "none",
      margin: "0px",
      pointerEvents: "none",
      transformOrigin: "50% 50%",
      transition: "none",
      animation: "none",
      willChange: "transform, opacity, filter"
    });

    if (source instanceof HTMLCanvasElement && clone instanceof HTMLCanvasElement) {
      try {
        clone.width = source.width;
        clone.height = source.height;
        clone.getContext("2d")?.drawImage(source, 0, 0);
      } catch {}
    }
    if (source instanceof HTMLVideoElement && clone instanceof HTMLVideoElement) {
      try {
        clone.muted = true;
        clone.currentTime = source.currentTime;
        clone.play().catch(() => {});
      } catch {}
    }

    state.itemsLayer.append(clone);
    return clone;
  }

  function roundedRectPath(context, x, y, width, height, radius) {
    const value = clamp(radius, 0, Math.min(width, height) / 2);
    context.beginPath();
    context.moveTo(x + value, y);
    context.arcTo(x + width, y, x + width, y + height, value);
    context.arcTo(x + width, y + height, x, y + height, value);
    context.arcTo(x, y + height, x, y, value);
    context.arcTo(x, y, x + width, y, value);
    context.closePath();
  }

  function drawFallbackSprite(canvas, token) {
    const context = canvas.getContext("2d");
    const source = token.element;
    const style = getComputedStyle(source);
    const ratio = canvas.width / Math.max(1, token.width);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, token.width, token.height);

    const radius = parseFloat(style.borderTopLeftRadius) || 0;
    roundedRectPath(context, 0, 0, token.width, token.height, radius);
    const background = style.backgroundColor;
    if (background && background !== "rgba(0, 0, 0, 0)") {
      context.fillStyle = background;
      context.fill();
    }
    const borderWidth = parseFloat(style.borderTopWidth) || 0;
    if (borderWidth > 0 && style.borderTopStyle !== "none") {
      context.lineWidth = borderWidth;
      context.strokeStyle = style.borderTopColor;
      context.stroke();
    }

    if (source instanceof HTMLImageElement && source.complete && source.naturalWidth) {
      context.save();
      roundedRectPath(context, 0, 0, token.width, token.height, radius);
      context.clip();
      try { context.drawImage(source, 0, 0, token.width, token.height); } catch {}
      context.restore();
      return;
    }
    if (source instanceof HTMLCanvasElement) {
      try { context.drawImage(source, 0, 0, token.width, token.height); return; } catch {}
    }

    const text = token.kind === "character"
      ? token.character
      : (source.innerText || source.getAttribute?.("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (!text) return;
    const fontSize = parseFloat(style.fontSize) || token.fontSize || 14;
    context.fillStyle = style.color && style.color !== "rgba(0, 0, 0, 0)" ? style.color : "#111";
    context.font = `${style.fontStyle || "normal"} ${style.fontWeight || 500} ${fontSize}px ${style.fontFamily || "sans-serif"}`;
    context.textAlign = token.kind === "character" ? "left" : "center";
    context.textBaseline = "middle";
    const x = token.kind === "character" ? 0 : token.width / 2;
    context.fillText(text, x, token.height / 2, Math.max(1, token.width - 4));
  }

  function inlineVisualStyles(source, target, limit = 180) {
    const sources = [source, ...(source.querySelectorAll?.("*") || [])].slice(0, limit);
    const targets = [target, ...(target.querySelectorAll?.("*") || [])].slice(0, limit);
    for (let index = 0; index < Math.min(sources.length, targets.length); index += 1) {
      const computed = getComputedStyle(sources[index]);
      for (const property of computed) {
        const value = computed.getPropertyValue(property);
        if (value) targets[index].style?.setProperty(property, value, computed.getPropertyPriority(property));
      }
      targets[index].removeAttribute?.("id");
      targets[index].classList?.remove("page-katamari-collected", "page-katamari-character", "page-katamari-text-node");
    }
  }

  function makeSprite(token) {
    const maxSide = Math.max(token.width, token.height, 1);
    const resolution = clamp(240 / maxSide, 0.3, 1.5);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(token.width * resolution));
    canvas.height = Math.max(1, Math.ceil(token.height * resolution));
    drawFallbackSprite(canvas, token);

    if (token.kind === "character") {
      return { canvas, width: token.width, height: token.height };
    }

    const source = token.element;
    if (source instanceof HTMLImageElement || source instanceof HTMLCanvasElement) {
      return { canvas, width: token.width, height: token.height };
    }

    try {
      const clone = source.cloneNode(true);
      inlineVisualStyles(source, clone);
      clone.removeAttribute?.("id");
      Object.assign(clone.style, {
        position: "relative",
        inset: "auto",
        transform: "none",
        margin: "0",
        width: `${token.width}px`,
        height: `${token.height}px`,
        maxWidth: "none",
        maxHeight: "none",
        opacity: "1",
        animation: "none",
        transition: "none"
      });
      const markup = new XMLSerializer().serializeToString(clone);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${token.width}" height="${token.height}" viewBox="0 0 ${token.width} ${token.height}"><foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${token.width}px;height:${token.height}px;overflow:hidden">${markup}</div></foreignObject></svg>`;
      const image = new Image();
      image.onload = () => {
        const context = canvas.getContext("2d");
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        try { context.drawImage(image, 0, 0, canvas.width, canvas.height); } catch { drawFallbackSprite(canvas, token); }
      };
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch {}
    return { canvas, width: token.width, height: token.height };
  }

  function toWorld(vector, out = [0, 0, 0]) {
    const matrix = state.orientation;
    out[0] = matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2];
    out[1] = matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2];
    out[2] = matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2];
    return out;
  }

  function toLocal(vector) {
    const matrix = state.orientation;
    return [
      matrix[0] * vector[0] + matrix[3] * vector[1] + matrix[6] * vector[2],
      matrix[1] * vector[0] + matrix[4] * vector[1] + matrix[7] * vector[2],
      matrix[2] * vector[0] + matrix[5] * vector[1] + matrix[8] * vector[2]
    ];
  }

  function orthonormalize() {
    const matrix = state.orientation;
    const c0 = [matrix[0], matrix[3], matrix[6]];
    const c1 = [matrix[1], matrix[4], matrix[7]];
    const n0 = Math.hypot(...c0) || 1;
    for (let index = 0; index < 3; index += 1) c0[index] /= n0;
    const dot = c0[0] * c1[0] + c0[1] * c1[1] + c0[2] * c1[2];
    for (let index = 0; index < 3; index += 1) c1[index] -= dot * c0[index];
    const n1 = Math.hypot(...c1) || 1;
    for (let index = 0; index < 3; index += 1) c1[index] /= n1;
    const c2 = [
      c0[1] * c1[2] - c0[2] * c1[1],
      c0[2] * c1[0] - c0[0] * c1[2],
      c0[0] * c1[1] - c0[1] * c1[0]
    ];
    state.orientation = [c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]];
  }

  function rollOrientation(dx, dy) {
    const distanceMoved = Math.hypot(dx, dy);
    if (distanceMoved < 0.001) return;
    const angle = distanceMoved / Math.max(12, state.ball.radius);
    const ax = -dy / distanceMoved;
    const ay = dx / distanceMoved;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const oneMinusCosine = 1 - cosine;
    const rotation = [
      oneMinusCosine * ax * ax + cosine,
      oneMinusCosine * ax * ay,
      sine * ay,
      oneMinusCosine * ax * ay,
      oneMinusCosine * ay * ay + cosine,
      -sine * ax,
      -sine * ay,
      sine * ax,
      cosine
    ];
    const matrix = state.orientation;
    const output = new Array(9);
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        output[row * 3 + column] =
          rotation[row * 3] * matrix[column] +
          rotation[row * 3 + 1] * matrix[3 + column] +
          rotation[row * 3 + 2] * matrix[6 + column];
      }
    }
    state.orientation = output;
    state.rolls += 1;
    if (state.rolls % 120 === 0) orthonormalize();
  }

  function createAttachment(token, sprite) {
    const ball = state.ball;
    let x = (token.pageX - scrollX - ball.x) / Math.max(1, ball.radius);
    let y = (token.pageY - scrollY - ball.y) / Math.max(1, ball.radius);
    const length = Math.hypot(x, y);
    if (length > 0.94) {
      x = x / length * 0.94;
      y = y / length * 0.94;
    }
    const z = Math.sqrt(Math.max(0.04, 1 - x * x - y * y));
    const world = [x, y, z];
    const axis = Math.abs(z) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let tangent = [
      world[1] * axis[2] - world[2] * axis[1],
      world[2] * axis[0] - world[0] * axis[2],
      world[0] * axis[1] - world[1] * axis[0]
    ];
    const tangentLength = Math.hypot(...tangent) || 1;
    tangent = tangent.map((value) => value / tangentLength);
    const bitangent = [
      world[1] * tangent[2] - world[2] * tangent[1],
      world[2] * tangent[0] - world[0] * tangent[2],
      world[0] * tangent[1] - world[1] * tangent[0]
    ];
    const randomAngle = Math.random() * Math.PI * 2;
    const orientedTangent = tangent.map((value, index) =>
      value * Math.cos(randomAngle) + bitangent[index] * Math.sin(randomAngle)
    );
    const maxVisualSide = token.kind === "object"
      ? token.media
        ? clamp(ball.radius * 1.25, 44, 120)
        : clamp(ball.radius * 1.15, 40, 96)
      : Infinity;
    const baseScale = Math.min(1, maxVisualSide / Math.max(token.width, token.height, 1));
    const attachmentRadius = Math.min(
      ball.radius * 1.25,
      ball.radius * 0.84 + Math.min(token.width, token.height) * baseScale * 0.12
    );
    return {
      sprite,
      u: toLocal(world),
      t: toLocal(orientedTangent),
      radius: attachmentRadius,
      baseScale,
      width: token.width,
      height: token.height,
      bornAtRadius: ball.radius
    };
  }

  function renderAttachments() {}

  function resize() {
    if (!state.canvas) return;
    state.dpr = Math.min(devicePixelRatio || 1, 2);
    state.canvas.width = Math.round(innerWidth * state.dpr);
    state.canvas.height = Math.round(innerHeight * state.dpr);
    state.canvas.style.width = `${innerWidth}px`;
    state.canvas.style.height = `${innerHeight}px`;
    state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    state.ball.x = clamp(state.ball.x || innerWidth * 0.5, state.ball.radius, innerWidth - state.ball.radius);
    state.ball.y = clamp(state.ball.y || innerHeight * 0.65, state.ball.radius, innerHeight - state.ball.radius);
  }

  function addAttachment(attachment) {
    state.attached.push(attachment);
    if (state.attached.length > 320) state.attached.splice(0, state.attached.length - 320);
  }

  function jump(power = MANUAL_JUMP_POWER) {
    if (!state.active) return false;
    const ball = state.ball;
    const now = performance.now();
    if (ball.z > 3 || now - ball.lastJumpAt < 260) return false;
    ball.vz = Math.max(ball.vz, REDUCED_MOTION ? Math.min(power, 0.3) : power);
    ball.lastJumpAt = now;
    ball.landingPulse = 0;
    return true;
  }

  function cancelLandingShake() {
    for (const animation of state.shakeAnimations) animation.cancel();
    state.shakeAnimations = [];
  }

  function triggerLandingShake(strength) {
    cancelLandingShake();
    const frames = [
      [0, 0, 0],
      [0.12, 0.72, -0.42],
      [0.25, -0.68, 0.48],
      [0.38, 0.52, 0.3],
      [0.52, -0.4, -0.28],
      [0.68, 0.27, 0.16],
      [0.84, -0.14, -0.09],
      [1, 0, 0]
    ].map(([offset, x, y]) => ({
      offset,
      transform: `translate3d(${(x * strength).toFixed(2)}px, ${(y * strength).toFixed(2)}px, 0)`,
      composite: "add"
    }));
    const pageLayers = Array.from(document.body?.children || []).filter((element) =>
      !["SCRIPT", "STYLE", "LINK", "META"].includes(element.tagName)
    );
    const targets = [...new Set([
      ...pageLayers,
      state.itemsLayer,
      state.canvas,
      state.hud,
      state.help
    ].filter(Boolean))];
    state.shakeAnimations = targets.map((element) => element.animate(frames, {
      duration: 180,
      easing: "linear"
    }));
  }

  function triggerLandingBurst() {
    const ball = state.ball;
    if (REDUCED_MOTION || ball.radius < LANDING_BURST_RADIUS) return;
    const sizeRatio = ball.radius / START_RADIUS;
    state.landingBurst = {
      elapsed: 0,
      duration: 420,
      angle: Math.random() * Math.PI * 2
    };
    state.landingBurstCount += 1;

    const strength = clamp(1.8 + (sizeRatio - 2) * 1.25, 1.8, 3.1);
    triggerLandingShake(strength);
  }

  function queuePickup(token, sprite, attachment, effect = null) {
    if (effect?.mode === "landing-letter") {
      token.pickupInFlight = true;
      state.pendingPickups.push({
        token,
        mode: "landing-letter",
        sprite,
        attachment,
        pageX: token.pageX,
        pageY: token.pageY,
        elapsed: 0,
        duration: REDUCED_MOTION ? 220 : 560,
        outwardX: effect.outwardX,
        outwardY: effect.outwardY,
        spin: (Math.random() * 2 - 1) * 0.34
      });
      state.pickupHopCount += 1;
      return;
    }

    if (token.kind !== "object") {
      addAttachment(attachment);
      return;
    }

    const duration = REDUCED_MOTION ? 180 : token.media ? 470 : 360;
    token.pickupInFlight = true;
    state.pendingPickups.push({
      token,
      mode: "object-hop",
      sprite,
      attachment,
      pageX: token.pageX,
      pageY: token.pageY,
      elapsed: 0,
      duration,
      hop: token.media ? clamp(42 + Math.min(token.width, token.height) * 0.12, 48, 105) : 38,
      spin: (Math.random() * 2 - 1) * (token.media ? 0.28 : 0.18)
    });
    state.pickupHopCount += 1;
  }

  function collect(token, effect = null) {
    const sprite = makeSprite(token);
    const attachment = createAttachment(token, sprite);
    token.collected = true;
    token.collectedAt = performance.now();
    token.element.classList?.add("page-katamari-collected");
    if (token.kind === "object") {
      if (token.media) {
        clearMediaSurface(token);
        addClearedArea(token);
      }
      token.element.style.setProperty("opacity", "0", "important");
      token.element.style.setProperty("transform", "scale(.04)", "important");
      token.element.style.setProperty("pointer-events", "none", "important");
    }

    queuePickup(token, sprite, attachment, effect);

    if (token.kind === "object") {
      for (const nested of state.tokens) {
        if (nested === token || nested.collected || !nested.element?.isConnected) continue;
        if (token.element.contains?.(nested.element)) nested.collected = true;
      }
    }

    const rawArea = Math.max(10, (token.width || 8) * (token.height || 12));
    const areaLimit = Math.PI * state.ball.radius * state.ball.radius * 0.85;
    const effectiveArea = Math.min(rawArea, areaLimit);
    const growth = token.kind === "object" ? 0.055 : 0.018;
    state.targetRadiusSquared = Math.min(72 * 72, state.targetRadiusSquared + effectiveArea * growth / Math.PI);
    state.score += 1;
    updateHud();
  }

  function triggerLandingLetterSplash() {
    const ball = state.ball;
    const range = Math.max(112, ball.radius * 4.15);
    const candidates = state.tokens
      .filter((token) => {
        if (token.kind !== "character" || token.collected || !token.element?.isConnected) return false;
        const x = token.pageX - scrollX;
        const y = token.pageY - scrollY;
        return distance(ball.x, ball.y, x, y) <= range;
      })
      .sort((a, b) =>
        distance(ball.x, ball.y, a.pageX - scrollX, a.pageY - scrollY) -
        distance(ball.x, ball.y, b.pageX - scrollX, b.pageY - scrollY)
      )
      .slice(0, REDUCED_MOTION ? 8 : 22);

    state.landingSplashCount += candidates.length;

    for (const token of candidates) {
      const x = token.pageX - scrollX;
      const y = token.pageY - scrollY;
      const dx = x - ball.x;
      const dy = y - ball.y;
      const length = Math.hypot(dx, dy) || 1;
      const force = 20 + (1 - Math.min(1, length / range)) * 28;
      const jitter = (Math.random() * 2 - 1) * 0.18;
      const cosine = Math.cos(jitter);
      const sine = Math.sin(jitter);
      const nx = dx / length;
      const ny = dy / length;
      collect(token, {
        mode: "landing-letter",
        outwardX: (nx * cosine - ny * sine) * force,
        outwardY: (nx * sine + ny * cosine) * force
      });
    }
  }

  function updateHud() {
    if (!state.hud) return;
    state.hud.querySelector(".pk-score span").textContent = String(state.score);
    state.hud.querySelector(".pk-size").textContent = `Size ${Math.round(state.ball.radius)}`;
  }

  function applyInput(dt) {
    const ball = state.ball;
    const targetRadius = Math.sqrt(state.targetRadiusSquared);
    ball.radius += (targetRadius - ball.radius) * Math.min(1, dt * 0.0045);
    const previousZ = ball.z;
    if (ball.z > 0 || ball.vz > 0) {
      ball.z += ball.vz * dt;
      ball.vz -= (REDUCED_MOTION ? 0.0035 : 0.00265) * dt;
      if (ball.z <= 0) {
        ball.z = 0;
        if (previousZ > 0 && ball.vz < -0.2) {
          ball.landingPulse = 1;
          state.impactRings.push({ x: ball.x, y: ball.y + ball.radius * 0.72, life: 1, radius: ball.radius * 0.72 });
          state.impactRings.push({ x: ball.x, y: ball.y + ball.radius * 0.72, life: 0.72, radius: ball.radius * 1.08 });
          triggerLandingBurst();
          triggerLandingLetterSplash();
        }
        ball.vz = 0;
      }
    }
    ball.landingPulse *= Math.pow(0.78, dt / 16.67);
    const acceleration = 0.095 * dt;
    const maxSpeed = clamp(7 + ball.radius * 0.035, 8, 12);
    let ax = 0;
    let ay = 0;

    if (state.keys.has("ArrowLeft") || state.keys.has("a") || state.keys.has("A")) ax -= acceleration;
    if (state.keys.has("ArrowRight") || state.keys.has("d") || state.keys.has("D")) ax += acceleration;
    if (state.keys.has("ArrowUp") || state.keys.has("w") || state.keys.has("W")) ay -= acceleration;
    if (state.keys.has("ArrowDown") || state.keys.has("s") || state.keys.has("S")) ay += acceleration;

    if (state.pointer.active) {
      const pointerDx = state.pointer.x - ball.x;
      const pointerDy = state.pointer.y - ball.y;
      const pointerDistance = Math.hypot(pointerDx, pointerDy);
      if (pointerDistance > Math.max(12, ball.radius * 0.35)) {
        const pointerStrength = clamp(pointerDistance / 180, 0.18, 1.35);
        ax += pointerDx / pointerDistance * acceleration * pointerStrength;
        ay += pointerDy / pointerDistance * acceleration * pointerStrength;
      }
    }

    ball.vx += ax;
    ball.vy += ay;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > maxSpeed) {
      ball.vx = (ball.vx / speed) * maxSpeed;
      ball.vy = (ball.vy / speed) * maxSpeed;
    }

    const friction = Math.pow(0.88, dt / 16.67);
    ball.vx *= friction;
    ball.vy *= friction;
    const previousX = ball.x;
    const previousY = ball.y;
    ball.x += ball.vx * (dt / 16.67);
    ball.y += ball.vy * (dt / 16.67);
    rollOrientation(ball.x - previousX, ball.y - previousY);
    ball.rotation += speed / Math.max(28, ball.radius) * 0.075 * (dt / 16.67);

    const edge = Math.max(55, ball.radius * 0.8);
    if (ball.y < edge && scrollY > 0) scrollBy(0, -Math.max(3, Math.abs(ball.vy) * 1.3));
    if (ball.y > innerHeight - edge && scrollY + innerHeight < document.documentElement.scrollHeight) scrollBy(0, Math.max(3, Math.abs(ball.vy) * 1.3));

    if (ball.x < ball.radius) { ball.x = ball.radius; ball.vx *= -0.45; }
    if (ball.x > innerWidth - ball.radius) { ball.x = innerWidth - ball.radius; ball.vx *= -0.45; }
    if (ball.y < ball.radius) { ball.y = ball.radius; ball.vy *= -0.45; }
    if (ball.y > innerHeight - ball.radius) { ball.y = innerHeight - ball.radius; ball.vy *= -0.45; }
  }

  function getTokenContact(token, x, y, ball, collisionRadius) {
    if (token.kind !== "object") {
      const hitRadius = clamp(Math.max(token.width, token.height) * 0.45, 4, 16);
      const separation = distance(ball.x, ball.y, x, y);
      const safeSeparation = separation || 1;
      return {
        hit: separation < collisionRadius + hitRadius,
        separation,
        nx: (ball.x - x) / safeSeparation,
        ny: (ball.y - y) / safeSeparation,
        push: collisionRadius + hitRadius - separation
      };
    }

    const left = x - token.width / 2;
    const right = x + token.width / 2;
    const top = y - token.height / 2;
    const bottom = y + token.height / 2;
    const nearestX = clamp(ball.x, left, right);
    const nearestY = clamp(ball.y, top, bottom);
    const dx = ball.x - nearestX;
    const dy = ball.y - nearestY;
    const separation = Math.hypot(dx, dy);
    if (separation > 0.01) {
      return {
        hit: separation < collisionRadius,
        separation,
        nx: dx / separation,
        ny: dy / separation,
        push: collisionRadius - separation
      };
    }

    const edges = [
      { depth: ball.x - left, nx: -1, ny: 0 },
      { depth: right - ball.x, nx: 1, ny: 0 },
      { depth: ball.y - top, nx: 0, ny: -1 },
      { depth: bottom - ball.y, nx: 0, ny: 1 }
    ].sort((a, b) => a.depth - b.depth);
    return {
      hit: true,
      separation: 0,
      nx: edges[0].nx,
      ny: edges[0].ny,
      push: collisionRadius + edges[0].depth
    };
  }

  function detectCollisions() {
    const ball = state.ball;
    const collisionRadius = ball.radius * clamp(1 - ball.z / Math.max(1, ball.radius * 1.15), 0, 1);
    if (collisionRadius < 3) return;
    const collisionTime = performance.now();
    for (const token of state.tokens) {
      if (token.collected || !token.element?.isConnected) continue;
      const x = token.pageX - scrollX;
      const y = token.pageY - scrollY;
      const halfWidth = token.kind === "object" ? token.width / 2 : 0;
      const halfHeight = token.kind === "object" ? token.height / 2 : 0;
      if (x + halfWidth < -120 || x - halfWidth > innerWidth + 120 || y + halfHeight < -120 || y - halfHeight > innerHeight + 120) continue;
      const contact = getTokenContact(token, x, y, ball, collisionRadius);
      if (token.kind === "object" && ball.radius < token.minRadius) {
        if (collisionTime < ball.vaultUntil) continue;
        if (contact.hit) {
          const incoming = ball.vx * contact.nx + ball.vy * contact.ny;
          const now = collisionTime;
          if (!token.lastBumpAt || now - token.lastBumpAt > 520) {
            token.lastBumpAt = now;
            const speed = Math.hypot(ball.vx, ball.vy);
            const travelX = speed > 0.35 ? ball.vx / speed : -contact.nx;
            const travelY = speed > 0.35 ? ball.vy / speed : -contact.ny;
            const obstacleDepth = Math.abs(travelX) * token.width + Math.abs(travelY) * token.height;
            const vaultDuration = clamp(
              460 + obstacleDepth / Math.max(4, speed) * 16.67,
              560,
              1200
            );
            const vaulted = jump(AUTO_VAULT_JUMP_POWER);
            if (vaulted) {
              ball.vaultUntil = now + vaultDuration;
              const carrySpeed = Math.max(4.2, speed * 0.88);
              ball.vx = travelX * carrySpeed;
              ball.vy = travelY * carrySpeed;
              const recoil = clamp(contact.push, 0.5, 1.6);
              ball.x += contact.nx * recoil;
              ball.y += contact.ny * recoil;
            } else {
              if (incoming < 0) {
                ball.vx -= 1.25 * incoming * contact.nx;
                ball.vy -= 1.25 * incoming * contact.ny;
              }
              const push = Math.max(0.5, contact.push + 0.5);
              ball.x += contact.nx * push;
              ball.y += contact.ny * push;
            }
            state.impactRings.push({ x: ball.x - contact.nx * ball.radius * 0.55, y: ball.y - contact.ny * ball.radius * 0.55, life: 1, radius: ball.radius * 0.45 });
          } else if (incoming < 0) {
            ball.vx -= 1.25 * incoming * contact.nx;
            ball.vy -= 1.25 * incoming * contact.ny;
          }
        }
        continue;
      }
      if (contact.hit) {
        if (token.media) {
          const halfWidth = token.width / 2;
          const halfHeight = token.height / 2;
          const now = performance.now();
          const overlayText = state.tokens.filter((candidate) =>
            candidate.kind === "character" &&
            candidate !== token &&
            candidate.pageX >= token.pageX - halfWidth &&
            candidate.pageX <= token.pageX + halfWidth &&
            candidate.pageY >= token.pageY - halfHeight &&
            candidate.pageY <= token.pageY + halfHeight
          );
          const hasPendingText = overlayText.some((candidate) => !candidate.collected || candidate.pickupInFlight);
          const justCollectedText = overlayText.some((candidate) =>
            candidate.collected && now - (candidate.collectedAt || 0) < 260
          );
          if (hasPendingText || justCollectedText) continue;
        }
        collect(token);
      }
    }
  }

  function updatePickupAnimations(dt) {
    for (let index = state.pendingPickups.length - 1; index >= 0; index -= 1) {
      const pickup = state.pendingPickups[index];
      pickup.elapsed += dt;
      if (pickup.elapsed < pickup.duration) continue;
      addAttachment(pickup.attachment);
      if (pickup.token) pickup.token.pickupInFlight = false;
      state.pendingPickups.splice(index, 1);
    }
    for (const ring of state.impactRings) {
      ring.life -= dt / (REDUCED_MOTION ? 180 : 520);
      ring.radius += dt * 0.035;
    }
    state.impactRings = state.impactRings.filter((ring) => ring.life > 0);
  }

  function drawImpactRings() {
    const { ctx } = state;
    if (!ctx) return;
    ctx.save();
    for (const ring of state.impactRings) {
      const alpha = ring.life * ring.life;
      ctx.strokeStyle = `rgba(0,0,0,${alpha * 0.18})`;
      ctx.lineWidth = 1.2 + alpha * 1.8;
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, ring.radius * 1.45, ring.radius * 0.38, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function updateLandingBurst(dt) {
    if (!state.landingBurst) return;
    state.landingBurst.elapsed += dt;
    if (state.landingBurst.elapsed >= state.landingBurst.duration) state.landingBurst = null;
  }

  function drawLandingBurst() {
    const effect = state.landingBurst;
    if (!effect || !state.ctx) return;
    const { ctx, ball } = state;
    const progress = clamp(effect.elapsed / effect.duration, 0, 1);
    const attack = Math.sin(Math.min(1, progress * 3) * Math.PI / 2);
    const alpha = attack * (1 - progress);
    const length = ball.radius * (2.5 + 4.5 * Math.min(1, progress * 2)) + 90;
    const centerY = ball.y - ball.z;
    const hues = [198, 258, 304, 342, 24, 52, 156];

    ctx.save();
    ctx.translate(ball.x, centerY);

    const glowRadius = ball.radius * (1.8 + progress * 1.4);
    const glow = ctx.createRadialGradient(0, 0, ball.radius * 0.18, 0, 0, glowRadius);
    glow.addColorStop(0, `hsla(${hues[1]}, 96%, 64%, ${alpha * 0.58})`);
    glow.addColorStop(0.36, `hsla(${hues[0]}, 98%, 58%, ${alpha * 0.34})`);
    glow.addColorStop(0.7, `hsla(${hues[3]}, 96%, 64%, ${alpha * 0.16})`);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(effect.angle + progress * 0.22);
    for (let index = 0; index < 16; index += 1) {
      const angle = index * Math.PI / 8;
      const width = 0.055 + index % 3 * 0.012;
      const hue = hues[index % hues.length];
      const ray = ctx.createLinearGradient(0, 0, Math.cos(angle) * length, Math.sin(angle) * length);
      ray.addColorStop(0, `hsla(${hue}, 98%, 58%, 0.88)`);
      ray.addColorStop(0.52, `hsla(${hue}, 96%, 61%, 0.38)`);
      ray.addColorStop(1, `hsla(${hue}, 94%, 62%, 0)`);
      ctx.globalAlpha = alpha * (index % 2 ? 0.62 : 0.46);
      ctx.fillStyle = ray;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle - width) * length, Math.sin(angle - width) * length);
      ctx.lineTo(Math.cos(angle + width) * length, Math.sin(angle + width) * length);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawClearedAreas() {
    const { ctx } = state;
    if (!ctx) return;
    ctx.save();
    ctx.fillStyle = "#fff";
    for (const area of state.clearedAreas) {
      const x = area.pageX - scrollX;
      const y = area.pageY - scrollY;
      if (x + area.width < -10 || x > innerWidth + 10 || y + area.height < -10 || y > innerHeight + 10) continue;
      roundedRectPath(ctx, x, y, area.width, area.height, area.radius);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPickupAnimations() {
    const { ctx, ball } = state;
    if (!ctx) return;
    for (const pickup of state.pendingPickups) {
      const progress = clamp(pickup.elapsed / pickup.duration, 0, 1);
      const startX = pickup.pageX - scrollX;
      const startY = pickup.pageY - scrollY;
      const targetY = ball.y - ball.z;
      const maxSide = Math.max(pickup.sprite.width, pickup.sprite.height, 1);
      const startScale = Math.min(1, Math.max(92, ball.radius * 3.4) / maxSide);
      let x;
      let y;
      let scale;
      let rotation;
      let shadowLift;

      if (pickup.mode === "landing-letter") {
        const burstEnd = 0.36;
        if (progress < burstEnd) {
          const phase = progress / burstEnd;
          const burst = 1 - Math.pow(1 - phase, 3);
          x = startX + pickup.outwardX * burst;
          y = startY + pickup.outwardY * burst - Math.sin(phase * Math.PI) * 9;
          scale = 1 + Math.sin(phase * Math.PI) * 0.08;
          rotation = pickup.spin * burst;
          shadowLift = Math.sin(phase * Math.PI);
        } else {
          const phase = (progress - burstEnd) / (1 - burstEnd);
          const pull = phase * phase * (3 - 2 * phase);
          const pushedX = startX + pickup.outwardX;
          const pushedY = startY + pickup.outwardY;
          x = pushedX + (ball.x - pushedX) * pull;
          y = pushedY + (targetY - pushedY) * pull - Math.sin(phase * Math.PI) * 12;
          scale = 1 - pull * 0.42;
          rotation = pickup.spin * (1 - pull);
          shadowLift = Math.sin(phase * Math.PI);
        }
      } else {
        const travel = progress * progress * (3 - 2 * progress);
        x = startX + (ball.x - startX) * travel;
        y = startY + (targetY - startY) * travel - Math.sin(progress * Math.PI) * pickup.hop;
        scale = startScale + (pickup.attachment.baseScale - startScale) * travel;
        rotation = pickup.spin * Math.sin(progress * Math.PI);
        shadowLift = Math.sin(progress * Math.PI);
      }
      const width = pickup.sprite.width * scale;
      const height = pickup.sprite.height * scale;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.globalAlpha = clamp(1 - Math.max(0, progress - 0.86) / 0.14 * 0.35, 0.65, 1);
      ctx.shadowColor = "rgba(0,0,0,.22)";
      ctx.shadowBlur = 8 + shadowLift * 14;
      ctx.shadowOffsetY = 3 + shadowLift * 8;
      ctx.drawImage(pickup.sprite.canvas, -width / 2, -height / 2, width, height);
      ctx.restore();
    }
  }

  function drawTrail() {
    const { ctx } = state;
    if (!ctx || state.trail.length < 1) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const wisp of state.trail) {
      const alpha = wisp.life * wisp.life;
      const cosine = Math.cos(wisp.angle);
      const sine = Math.sin(wisp.angle);
      const normalX = -sine;
      const normalY = cosine;
      const y = wisp.y - (wisp.z || 0) * 0.11;
      const startX = wisp.x - cosine * wisp.length * 0.52;
      const startY = y - sine * wisp.length * 0.52;
      const endX = wisp.x + cosine * wisp.length * 0.48;
      const endY = y + sine * wisp.length * 0.48;
      const middleX = wisp.x + normalX * wisp.curl;
      const middleY = y + normalY * wisp.curl;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(middleX, middleY, endX, endY);
      ctx.strokeStyle = `rgba(82,82,82,${alpha * (0.075 + wisp.seed * 0.055)})`;
      ctx.lineWidth = wisp.weight;
      ctx.stroke();

      const echoOffset = wisp.radius * (0.16 + wisp.seed * 0.18);
      ctx.beginPath();
      ctx.moveTo(startX + normalX * echoOffset, startY + normalY * echoOffset);
      ctx.quadraticCurveTo(
        middleX + normalX * echoOffset * 0.48,
        middleY + normalY * echoOffset * 0.48,
        endX + normalX * echoOffset * 0.2,
        endY + normalY * echoOffset * 0.2
      );
      ctx.strokeStyle = `rgba(128,128,128,${alpha * 0.055})`;
      ctx.lineWidth = Math.max(0.45, wisp.weight * 0.62);
      ctx.stroke();

      for (let speck = 0; speck < 2; speck += 1) {
        const amount = 0.18 + speck * 0.46 + wisp.seed * 0.12;
        const speckX = startX + (endX - startX) * amount + normalX * wisp.curl * 0.14;
        const speckY = startY + (endY - startY) * amount + normalY * wisp.curl * 0.14;
        ctx.fillStyle = `rgba(70,70,70,${alpha * (0.08 - speck * 0.018)})`;
        ctx.beginPath();
        ctx.arc(speckX, speckY, 0.7 + wisp.seed * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawBall() {
    const { ctx, ball } = state;
    if (!ctx) return;

    // Stickers deliberately protrude from the sphere. Keep the offscreen canvas
    // wider than the whole silhouette so wide images never reveal a hard box.
    const extent = ball.radius * 2.75;
    const size = Math.max(96, Math.ceil(extent * 2) + 12);
    const canvas = state.spriteCanvas;
    if (canvas.width !== size || canvas.height !== size) {
      canvas.width = size;
      canvas.height = size;
      state.spriteCtx = canvas.getContext("2d");
    }
    const graphics = state.spriteCtx;
    const center = size / 2;
    graphics.setTransform(1, 0, 0, 1, 0, 0);
    graphics.globalCompositeOperation = "source-over";
    graphics.clearRect(0, 0, size, size);

    const raised = [];
    const flat = [];
    for (let index = state.attached.length - 1; index >= 0 && raised.length + flat.length < 320; index -= 1) {
      const item = state.attached[index];
      const world = toWorld(item.u, [0, 0, 0]);
      if (item.radius >= ball.radius * 0.8) {
        if (world[2] > -0.58) raised.push({ item, world, radius: item.radius });
      } else if (world[2] > 0.05 && flat.length < 280) {
        flat.push({ item, world, radius: ball.radius * 0.97 });
      }
    }
    raised.sort((a, b) => a.world[2] - b.world[2]);
    flat.sort((a, b) => a.world[2] - b.world[2]);

    const drawSticker = ({ item, world, radius }) => {
      const tangent = toWorld(item.t, [0, 0, 0]);
      const angle = Math.atan2(tangent[1], tangent[0]);
      const depthScale = 0.78 + 0.22 * Math.max(0, world[2]);
      const cosine = Math.cos(angle) * depthScale;
      const sine = Math.sin(angle) * depthScale;
      graphics.setTransform(
        cosine,
        sine,
        -sine,
        cosine,
        center + world[0] * radius,
        center + world[1] * radius
      );
      const stickerWidth = item.sprite.width * item.baseScale;
      const stickerHeight = item.sprite.height * item.baseScale;
      graphics.drawImage(
        item.sprite.canvas,
        -stickerWidth / 2,
        -stickerHeight / 2,
        stickerWidth,
        stickerHeight
      );
    };

    let split = 0;
    while (split < raised.length && raised[split].world[2] < 0) {
      drawSticker(raised[split]);
      split += 1;
    }

    graphics.setTransform(1, 0, 0, 1, 0, 0);
    const radius = ball.radius;
    const core = graphics.createRadialGradient(
      center - radius * 0.42,
      center - radius * 0.5,
      0,
      center - radius * 0.1,
      center - radius * 0.1,
      radius * 1.2
    );
    core.addColorStop(0, "#ffffff");
    core.addColorStop(0.5, "#fbfbf8");
    core.addColorStop(0.82, "#eeeeea");
    core.addColorStop(1, "#d4d4cf");
    graphics.fillStyle = core;
    graphics.beginPath();
    graphics.arc(center, center, radius, 0, Math.PI * 2);
    graphics.fill();

    graphics.fillStyle = "rgba(5,5,5,.88)";
    for (const point of BALL_DOTS) {
      const world = toWorld(point, [0, 0, 0]);
      if (world[2] <= 0.04) continue;
      const dotRadius = clamp(radius * (0.018 + world[2] * 0.012), 0.85, 2.25);
      graphics.beginPath();
      graphics.ellipse(
        center + world[0] * radius,
        center + world[1] * radius,
        dotRadius * (0.62 + world[2] * 0.38),
        dotRadius,
        Math.atan2(world[1], world[0]),
        0,
        Math.PI * 2
      );
      graphics.fill();
    }

    for (const item of flat) drawSticker(item);
    for (; split < raised.length; split += 1) drawSticker(raised[split]);

    graphics.setTransform(1, 0, 0, 1, 0, 0);
    graphics.globalCompositeOperation = "source-atop";
    const shade = graphics.createRadialGradient(
      center - radius * 0.38,
      center - radius * 0.45,
      0,
      center,
      center,
      radius * 1.48
    );
    shade.addColorStop(0, "rgba(255,255,255,.24)");
    shade.addColorStop(0.28, "rgba(255,255,255,0)");
    shade.addColorStop(0.68, "rgba(0,0,0,0)");
    shade.addColorStop(0.84, "rgba(0,0,0,.11)");
    shade.addColorStop(1, "rgba(0,0,0,.28)");
    graphics.fillStyle = shade;
    graphics.fillRect(0, 0, size, size);
    graphics.globalCompositeOperation = "source-over";
    graphics.strokeStyle = "rgba(0,0,0,.18)";
    graphics.lineWidth = 1;
    graphics.beginPath();
    graphics.arc(center, center, radius - 0.5, 0, Math.PI * 2);
    graphics.stroke();

    const visualY = ball.y - ball.z;
    const altitude = clamp(ball.z / Math.max(1, ball.radius * 3.2), 0, 1);
    const stretch = clamp(ball.vz * 0.16, -0.08, 0.1);
    const scaleX = 1 + ball.landingPulse * 0.13 - stretch * 0.35;
    const scaleY = 1 - ball.landingPulse * 0.16 + stretch;

    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.2 * (1 - altitude * 0.62)})`;
    ctx.filter = `blur(${3 + altitude * 7}px)`;
    ctx.beginPath();
    ctx.ellipse(
      ball.x + 7,
      ball.y + ball.radius * 0.76,
      ball.radius * (0.78 - altitude * 0.2),
      ball.radius * (0.23 - altitude * 0.05),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(ball.x, visualY);
    ctx.scale(scaleX, scaleY);
    ctx.shadowColor = `rgba(0,0,0,${0.2 * (1 - altitude * 0.5)})`;
    ctx.shadowBlur = 13;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 7;
    ctx.drawImage(canvas, -center, -center);
    ctx.restore();

    state.canvas.dataset.jumpHeight = ball.z.toFixed(1);
    state.canvas.dataset.pendingPickups = String(state.pendingPickups.length);
    state.canvas.dataset.pickupHopCount = String(state.pickupHopCount);
    state.canvas.dataset.landingSplashCount = String(state.landingSplashCount);
    state.canvas.dataset.landingBurstCount = String(state.landingBurstCount);
    state.canvas.dataset.clearedAreaCount = String(state.clearedAreas.length);

    if (state.score === 0) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,.92)";
      ctx.font = '650 10px "PK Manrope", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("ROLL", ball.x, visualY + 0.5);
      ctx.restore();
    }
  }

  function drawPointerTarget() {
    if (!state.pointer.active || !state.ctx) return;
    const { ctx, pointer } = state;
    ctx.save();
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = "#050505";
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255,255,255,.88)";
    ctx.stroke();
    ctx.restore();
  }

  function frame(time) {
    if (!state.active) return;
    const dt = clamp(time - (state.lastTime || time), 0, 34);
    state.lastTime = time;
    state.ctx.clearRect(0, 0, innerWidth, innerHeight);
    applyInput(dt);
    detectCollisions();
    updatePickupAnimations(dt);
    updateLandingBurst(dt);
    drawClearedAreas();
    drawImpactRings();
    drawLandingBurst();
    drawBall();
    drawPickupAnimations();
    renderAttachments();
    drawPointerTarget();
    state.raf = requestAnimationFrame(frame);
  }

  function onPointerMove(event) {
    if (!state.active) return;
    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;
    state.pointer.active = true;
  }

  function onPointerLeave() {
    state.pointer.active = false;
  }

  function onKeyDown(event) {
    if (state.active && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      stop();
      return;
    }
    if (!state.active || !CONTROL_KEYS.has(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === " ") {
      if (!event.repeat) jump();
      return;
    }
    state.keys.add(event.key);
  }

  function onKeyUp(event) {
    if (!state.active || !CONTROL_KEYS.has(event.key)) return;
    event.preventDefault();
    if (event.key === " ") return;
    state.keys.delete(event.key);
  }

  function onScroll() {
    if (!state.active) return;
    if (!state.scrollRefreshRaf) {
      state.scrollRefreshRaf = requestAnimationFrame(() => {
        state.scrollRefreshRaf = 0;
        refreshTokenPositions();
      });
    }
    clearTimeout(state.scrollScanTimer);
    state.scrollScanTimer = setTimeout(scanPage, 90);
  }

  function observeDynamicPage() {
    state.observer = new MutationObserver((mutations) => {
      if (!state.active) return;
      const hasNewContent = mutations.some((mutation) =>
        mutation.type === "childList" && mutation.addedNodes.length > 0
      );
      if (!hasNewContent) return;
      clearTimeout(state.mutationScanTimer);
      state.mutationScanTimer = setTimeout(scanPage, 320);
    });
    state.observer.observe(document.body, { childList: true, subtree: true });
  }

  function start() {
    if (state.active) return;
    if (globalThis.chrome?.runtime?.id && !document.fonts.check('12px "PK Manrope"')) {
      const font = new FontFace("PK Manrope", `url("${chrome.runtime.getURL("assets/Manrope-VariableFont_wght.ttf")}")`, { weight: "200 800" });
      font.load().then(loaded => document.fonts.add(loaded)).catch(() => {});
    }
    state.active = true;
    state.score = 0;
    state.tokens = [];
    state.attached = [];
    state.pendingPickups = [];
    state.pickupHopCount = 0;
    state.landingSplashCount = 0;
    state.landingBurstCount = 0;
    state.impactRings = [];
    state.landingBurst = null;
    cancelLandingShake();
    state.wrappers = [];
    state.objects = [];
    state.mediaSurfaces = [];
    state.clearedAreas = [];
    state.keys.clear();
    state.orientation = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    state.rolls = 0;
    state.trail = [];
    state.trailTick = 0;
    state.targetRadiusSquared = 24 * 24;
    state.pointer = { x: innerWidth * 0.72, y: innerHeight * 0.65, active: false };
    state.ball = {
      x: innerWidth * 0.5,
      y: innerHeight * 0.65,
      vx: 0,
      vy: 0,
      radius: 24,
      rotation: 0,
      z: 0,
      vz: 0,
      landingPulse: 0,
      lastJumpAt: -Infinity,
      vaultUntil: 0
    };
    document.documentElement.classList.add("page-katamari-running");
    createOverlay();
    scanPage();
    addEventListener("resize", resize);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("keydown", onKeyDown, true);
    addEventListener("keyup", onKeyUp, true);
    addEventListener("pointermove", onPointerMove, true);
    document.documentElement.addEventListener("pointerleave", onPointerLeave, true);
    observeDynamicPage();
    state.periodicScanTimer = setInterval(scanPage, 850);
    state.lastTime = performance.now();
    state.raf = requestAnimationFrame(frame);
    dispatchEvent(new CustomEvent("pagekatamari:change", { detail: { active: true } }));
  }

  function restorePage() {
    for (const { wrapper, textNode, original } of state.wrappers) {
      if (!wrapper.isConnected) continue;
      // Keep the original Text node so frameworks retaining its reference can
      // update it. Prefer such an update, then any change to the visible wrapper.
      if (textNode.nodeValue === original && wrapper.textContent !== original) {
        textNode.nodeValue = wrapper.textContent;
      }
      wrapper.replaceWith(textNode);
    }
    for (const record of state.objects) {
      const { element } = record;
      if (!element?.isConnected) continue;
      element.classList.remove("page-katamari-collected");
      record.opacity
        ? element.style.setProperty("opacity", record.opacity, record.opacityPriority)
        : element.style.removeProperty("opacity");
      record.transform
        ? element.style.setProperty("transform", record.transform, record.transformPriority)
        : element.style.removeProperty("transform");
      record.pointerEvents
        ? element.style.setProperty("pointer-events", record.pointerEvents, record.pointerEventsPriority)
        : element.style.removeProperty("pointer-events");
      delete element.dataset.pageKatamariObject;
    }
    for (const surface of state.mediaSurfaces) {
      surface.classList?.remove("page-katamari-media-cleared");
    }
  }

  function stop() {
    if (!state.active) return;
    state.active = false;
    cancelAnimationFrame(state.raf);
    clearTimeout(state.scrollScanTimer);
    cancelAnimationFrame(state.scrollRefreshRaf);
    clearInterval(state.periodicScanTimer);
    clearTimeout(state.mutationScanTimer);
    state.observer?.disconnect();
    removeEventListener("resize", resize);
    removeEventListener("scroll", onScroll);
    removeEventListener("keydown", onKeyDown, true);
    removeEventListener("keyup", onKeyUp, true);
    removeEventListener("pointermove", onPointerMove, true);
    document.documentElement.removeEventListener("pointerleave", onPointerLeave, true);
    document.documentElement.classList.remove("page-katamari-running");
    state.canvas?.remove();
    state.itemsLayer?.remove();
    state.hud?.remove();
    state.help?.remove();
    restorePage();
    state.canvas = null;
    state.itemsLayer = null;
    state.ctx = null;
    state.hud = null;
    state.help = null;
    state.tokens = [];
    state.attached = [];
    state.pendingPickups = [];
    state.impactRings = [];
    state.landingBurst = null;
    cancelLandingShake();
    state.trail = [];
    state.wrappers = [];
    state.objects = [];
    state.mediaSurfaces = [];
    state.clearedAreas = [];
    state.observer = null;
    state.scrollRefreshRaf = 0;
    state.periodicScanTimer = 0;
    state.scanning = false;
    dispatchEvent(new CustomEvent("pagekatamari:change", { detail: { active: false } }));
  }

  if (globalThis.chrome?.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "PK_TOGGLE") {
        state.active ? stop() : start();
        sendResponse({ active: state.active, score: state.score });
      }
      if (message?.type === "PK_STATUS") {
        sendResponse({ active: state.active, score: state.score });
      }
      return true;
    });
  }

  // The web demo uses the same core as the extension. In an extension this
  // object stays out of the host page; messages remain the control surface.
  if (!globalThis.chrome?.runtime?.id) {
    window.PageKatamari = Object.freeze({
      start,
      stop,
      toggle: () => state.active ? stop() : start(),
      getStatus: () => ({ active: state.active, score: state.score })
    });
  }

  if (location.hostname === "127.0.0.1" && new URLSearchParams(location.search).has("pkqa")) {
    window.__pageKatamariQa = {
      start,
      stop,
      jump,
      setBall: (x, y, radius = state.ball.radius) => {
        state.pointer.active = false;
        state.ball.x = x;
        state.ball.y = y;
        state.ball.vx = 0;
        state.ball.vy = 0;
        state.ball.radius = radius;
        state.targetRadiusSquared = radius * radius;
      },
      triggerLargestMedia: () => {
        const token = state.tokens
          .filter((candidate) => candidate.kind === "object" && candidate.media && !candidate.collected)
          .sort((a, b) => b.width * b.height - a.width * a.height)[0];
        if (!token) return null;
        collect(token);
        return { width: token.width, height: token.height, mode: "media" };
      },
      getState: () => ({
        active: state.active,
        score: state.score,
        pendingPickups: state.pendingPickups.length,
        ballX: state.ball.x,
        ballY: state.ball.y,
        jumpHeight: state.ball.z,
        radius: state.ball.radius,
        targetRadius: Math.sqrt(state.targetRadiusSquared),
        landingBurstCount: state.landingBurstCount,
        landingBurstActive: Boolean(state.landingBurst),
        vaultActive: performance.now() < state.ball.vaultUntil,
        manualJumpPower: MANUAL_JUMP_POWER,
        autoVaultJumpPower: AUTO_VAULT_JUMP_POWER
      })
    };
    start();
  }
})();
