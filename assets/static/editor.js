/*
 * Meme editor: an in-browser canvas editor with draggable, individually styled
 * text boxes and image layers. Everything renders client-side; export produces
 * a PNG/JPG straight from the canvas.
 */
(function () {
  "use strict";

  var root = document.getElementById("meme-editor");
  if (!root) return;
  var config = JSON.parse(root.getAttribute("data-config"));
  var canvas = document.getElementById("me-canvas");
  var ctx = canvas.getContext("2d");
  var statusEl = document.getElementById("me-status");

  var MAX_SIDE = 2000; // cap the working resolution
  var HANDLE = 10; // handle size in screen pixels
  var MIN_BOX = 24;

  // ---------------------------------------------------------------- utilities

  function $(id) {
    return document.getElementById(id);
  }
  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }
  function uid() {
    return Math.random().toString(36).slice(2, 9);
  }
  function setStatus(text) {
    statusEl.textContent = text;
  }
  function loadImage(src, useProxy) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      if (!/^data:/.test(src)) img.crossOrigin = "anonymous";
      img.onload = function () {
        resolve(img);
      };
      img.onerror = function () {
        if (!useProxy && /^https?:/.test(src) && src.indexOf(window.location.origin) !== 0) {
          loadImage("/proxy/image?url=" + encodeURIComponent(src), true).then(resolve, reject);
        } else {
          reject(new Error("Could not load image"));
        }
      };
      img.src = src;
    });
  }
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  var imageCache = {};
  function getImage(src) {
    if (!imageCache[src]) imageCache[src] = loadImage(src, false);
    return imageCache[src];
  }

  // ------------------------------------------------------------------- fonts

  var fontsReady = Promise.all(
    config.fonts.map(function (font) {
      if (!window.FontFace) return Promise.resolve();
      var face = new FontFace(font.id, "url(" + font.url + ")");
      return face
        .load()
        .then(function (loaded) {
          document.fonts.add(loaded);
        })
        .catch(function () {
          /* the browser falls back to a system font */
        });
    }),
  );

  // ------------------------------------------------------------------- state

  var state = {
    width: 800,
    height: 600,
    background: { kind: "template", src: config.images.length ? config.images[0].url : "", color: "#ffffff" },
    layers: [],
  };
  var selectedId = null;
  var history = [];
  var future = [];
  var bgImage = null;
  var zoom = 1; // CSS pixels per canvas pixel

  function serialize() {
    return JSON.stringify({ width: state.width, height: state.height, background: state.background, layers: state.layers });
  }

  function commit() {
    var snapshot = serialize();
    if (history.length && history[history.length - 1] === snapshot) return;
    history.push(snapshot);
    if (history.length > 60) history.shift();
    future = [];
    scheduleHashUpdate();
  }

  function restore(snapshot) {
    var data = JSON.parse(snapshot);
    state.width = data.width;
    state.height = data.height;
    state.background = data.background;
    state.layers = data.layers;
    if (selectedId && !findLayer(selectedId)) selectedId = null;
    return loadBackground().then(function () {
      return Promise.all(
        state.layers
          .filter(function (l) {
            return l.type === "image";
          })
          .map(function (l) {
            return getImage(l.src).catch(function () {});
          }),
      );
    });
  }

  function undo() {
    if (history.length < 2) return;
    future.push(history.pop());
    restore(history[history.length - 1]).then(refresh);
  }
  function redo() {
    if (!future.length) return;
    var snapshot = future.pop();
    history.push(snapshot);
    restore(snapshot).then(refresh);
  }

  function findLayer(id) {
    for (var i = 0; i < state.layers.length; i++) if (state.layers[i].id === id) return state.layers[i];
    return null;
  }
  function selected() {
    return selectedId ? findLayer(selectedId) : null;
  }

  // ------------------------------------------------------------ layer models

  function textLayer(box, index) {
    var W = state.width;
    var H = state.height;
    return {
      id: uid(),
      type: "text",
      name: "Text " + (index + 1),
      text: "",
      placeholder: box.placeholder || "Your text",
      x: box.x * W,
      y: box.y * H,
      w: Math.max(MIN_BOX, box.w * W),
      h: Math.max(MIN_BOX, box.h * H),
      angle: box.angle || 0,
      opacity: 1,
      font: box.font || "titilliumweb",
      size: 0, // 0 = automatic
      color: box.color || "#ffffff",
      strokeColor: "#000000",
      strokeWidth: -1, // -1 = automatic
      align: box.align || "center",
      valign: "middle",
      uppercase: box.uppercase !== false,
    };
  }

  function defaultLayers() {
    var boxes = config.boxes.length ? config.boxes : [{ x: 0, y: 0, w: 1, h: 0.2 }, { x: 0, y: 0.8, w: 1, h: 0.2 }];
    return boxes.map(function (box, index) {
      return textLayer(box, index);
    });
  }

  function addImageLayer(src) {
    return getImage(src).then(function (img) {
      var scale = Math.min((state.width * 0.4) / img.naturalWidth, (state.height * 0.4) / img.naturalHeight, 1);
      var w = Math.max(MIN_BOX, img.naturalWidth * scale);
      var h = Math.max(MIN_BOX, img.naturalHeight * scale);
      var layer = {
        id: uid(),
        type: "image",
        name: "Image " + (state.layers.filter(function (l) { return l.type === "image"; }).length + 1),
        src: src,
        x: (state.width - w) / 2,
        y: (state.height - h) / 2,
        w: w,
        h: h,
        angle: 0,
        opacity: 1,
        flip: false,
      };
      state.layers.push(layer);
      selectedId = layer.id;
      commit();
      refresh();
    });
  }

  // ------------------------------------------------------------- background

  function loadBackground() {
    var bg = state.background;
    if (bg.kind === "blank") {
      bgImage = null;
      return Promise.resolve();
    }
    return getImage(bg.src)
      .then(function (img) {
        bgImage = img;
      })
      .catch(function () {
        bgImage = null;
        setStatus("The background image could not be loaded.");
      });
  }

  function setBackgroundImage(src, kind) {
    return getImage(src).then(function (img) {
      var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      var newW = Math.round(img.naturalWidth * scale);
      var newH = Math.round(img.naturalHeight * scale);
      rescaleLayers(newW, newH);
      state.background = { kind: kind, src: src, color: "#ffffff" };
      bgImage = img;
      commit();
      refresh();
    });
  }

  function rescaleLayers(newW, newH) {
    var sx = newW / state.width;
    var sy = newH / state.height;
    state.layers.forEach(function (l) {
      l.x *= sx;
      l.y *= sy;
      l.w *= sx;
      l.h *= sy;
      if (l.type === "text" && l.size > 0) l.size = Math.round(l.size * Math.min(sx, sy));
    });
    state.width = newW;
    state.height = newH;
  }

  // ------------------------------------------------------------ text layout

  var layoutCache = {};

  function displayText(layer) {
    var text = layer.text || "";
    return layer.uppercase ? text.toUpperCase() : text;
  }

  function wrapLines(text, size, family, maxWidth) {
    ctx.font = "bold " + size + "px \"" + family + "\", sans-serif";
    var lines = [];
    text.split("\n").forEach(function (paragraph) {
      var words = paragraph.split(" ");
      var line = "";
      words.forEach(function (word) {
        var candidate = line ? line + " " + word : word;
        if (ctx.measureText(candidate).width <= maxWidth || !line) {
          if (!line && ctx.measureText(word).width > maxWidth) {
            // Break an over-long word by characters
            var chunk = "";
            Array.prototype.forEach.call(word, function (ch) {
              if (ctx.measureText(chunk + ch).width > maxWidth && chunk) {
                lines.push(chunk);
                chunk = ch;
              } else {
                chunk += ch;
              }
            });
            line = chunk;
          } else {
            line = candidate;
          }
        } else {
          lines.push(line);
          line = word;
        }
      });
      lines.push(line);
    });
    return lines;
  }

  function fits(lines, size, maxWidth, maxHeight) {
    if (lines.length * size * 1.15 > maxHeight) return false;
    for (var i = 0; i < lines.length; i++) if (ctx.measureText(lines[i]).width > maxWidth) return false;
    return true;
  }

  function layoutText(layer, text) {
    var key = [text, layer.w | 0, layer.h | 0, layer.font, layer.size, layer.strokeWidth].join("|");
    if (layoutCache[key]) return layoutCache[key];
    var pad = 6;
    var maxWidth = Math.max(10, layer.w - pad * 2);
    var maxHeight = Math.max(10, layer.h - pad * 2);
    var size;
    var lines;
    if (layer.size > 0) {
      size = layer.size;
      lines = wrapLines(text, size, layer.font, maxWidth);
    } else {
      var lo = 8;
      var hi = Math.max(8, Math.floor(maxHeight));
      while (lo < hi) {
        var mid = Math.ceil((lo + hi) / 2);
        var candidate = wrapLines(text, mid, layer.font, maxWidth);
        if (fits(candidate, mid, maxWidth, maxHeight)) lo = mid;
        else hi = mid - 1;
      }
      size = lo;
      lines = wrapLines(text, size, layer.font, maxWidth);
    }
    var result = { size: size, lines: lines, lineHeight: size * 1.15, pad: pad };
    layoutCache[key] = result;
    return result;
  }

  function strokeWidthFor(layer, size) {
    return layer.strokeWidth >= 0 ? layer.strokeWidth : Math.max(1, Math.round(size / 8));
  }

  // ------------------------------------------------------------------ render

  function drawText(context, layer, forExport) {
    var text = displayText(layer);
    var placeholder = !text && !forExport;
    if (placeholder) text = layer.uppercase ? layer.placeholder.toUpperCase() : layer.placeholder;
    if (!text) return;
    var layout = layoutText(layer, text);
    context.save();
    context.globalAlpha = layer.opacity * (placeholder ? 0.45 : 1);
    context.translate(layer.x + layer.w / 2, layer.y + layer.h / 2);
    context.rotate((layer.angle * Math.PI) / 180);
    context.translate(-layer.w / 2, -layer.h / 2);
    context.beginPath();
    context.rect(-2, -2, layer.w + 4, layer.h + 4);
    context.clip();
    context.font = "bold " + layout.size + "px \"" + layer.font + "\", sans-serif";
    context.textBaseline = "alphabetic";
    context.lineJoin = "round";
    context.miterLimit = 2;
    context.textAlign = layer.align;
    var x = layer.align === "left" ? layout.pad : layer.align === "right" ? layer.w - layout.pad : layer.w / 2;
    var blockHeight = layout.lines.length * layout.lineHeight;
    var top = layer.valign === "top" ? layout.pad : layer.valign === "bottom" ? layer.h - layout.pad - blockHeight : (layer.h - blockHeight) / 2;
    var strokeWidth = strokeWidthFor(layer, layout.size);
    layout.lines.forEach(function (line, index) {
      var y = top + index * layout.lineHeight + layout.size * 0.9;
      if (strokeWidth > 0) {
        context.lineWidth = strokeWidth;
        context.strokeStyle = layer.strokeColor;
        context.strokeText(line, x, y);
      }
      context.fillStyle = layer.color;
      context.fillText(line, x, y);
    });
    context.restore();
  }

  function drawImageLayer(context, layer) {
    var img = imageCache[layer.src] && imageCache[layer.src].resolved;
    if (!img) return;
    context.save();
    context.globalAlpha = layer.opacity;
    context.translate(layer.x + layer.w / 2, layer.y + layer.h / 2);
    context.rotate((layer.angle * Math.PI) / 180);
    if (layer.flip) context.scale(-1, 1);
    context.drawImage(img, -layer.w / 2, -layer.h / 2, layer.w, layer.h);
    context.restore();
  }

  function drawSelection(context, layer) {
    var s = 1 / zoom;
    context.save();
    context.translate(layer.x + layer.w / 2, layer.y + layer.h / 2);
    context.rotate((layer.angle * Math.PI) / 180);
    context.translate(-layer.w / 2, -layer.h / 2);
    context.lineWidth = 1.5 * s;
    context.strokeStyle = "#2563eb";
    context.setLineDash([6 * s, 4 * s]);
    context.strokeRect(0, 0, layer.w, layer.h);
    context.setLineDash([]);
    context.fillStyle = "#ffffff";
    var h = HANDLE * s;
    handlePositions(layer).forEach(function (p) {
      context.beginPath();
      if (p.id === "rotate") {
        context.moveTo(layer.w / 2, 0);
        context.lineTo(p.x, p.y);
        context.stroke();
        context.beginPath();
        context.arc(p.x, p.y, h / 2, 0, Math.PI * 2);
      } else {
        context.rect(p.x - h / 2, p.y - h / 2, h, h);
      }
      context.fill();
      context.stroke();
    });
    context.restore();
  }

  function handlePositions(layer) {
    var s = 1 / zoom;
    return [
      { id: "nw", x: 0, y: 0 },
      { id: "ne", x: layer.w, y: 0 },
      { id: "sw", x: 0, y: layer.h },
      { id: "se", x: layer.w, y: layer.h },
      { id: "rotate", x: layer.w / 2, y: -28 * s },
    ];
  }

  function render(context, forExport) {
    context.clearRect(0, 0, state.width, state.height);
    if (bgImage) {
      context.drawImage(bgImage, 0, 0, state.width, state.height);
    } else {
      context.fillStyle = state.background.color || "#ffffff";
      context.fillRect(0, 0, state.width, state.height);
    }
    state.layers.forEach(function (layer) {
      if (layer.type === "text") drawText(context, layer, forExport);
      else drawImageLayer(context, layer);
    });
    if (!forExport) {
      var sel = selected();
      if (sel) drawSelection(context, sel);
    }
  }

  function resizeCanvas() {
    canvas.width = state.width;
    canvas.height = state.height;
    var maxWidth = canvas.parentElement.clientWidth || state.width;
    zoom = Math.min(1, maxWidth / state.width);
    canvas.style.width = Math.round(state.width * zoom) + "px";
    canvas.style.height = Math.round(state.height * zoom) + "px";
  }

  var renderQueued = false;
  function draw() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(function () {
      renderQueued = false;
      render(ctx, false);
    });
  }

  function refresh() {
    resizeCanvas();
    renderLayerList();
    renderProps();
    draw();
  }

  // ------------------------------------------------------------- hit testing

  function toCanvasPoint(event) {
    var rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
  }

  function toLocal(layer, point) {
    var cx = layer.x + layer.w / 2;
    var cy = layer.y + layer.h / 2;
    var a = (-layer.angle * Math.PI) / 180;
    var dx = point.x - cx;
    var dy = point.y - cy;
    return { x: dx * Math.cos(a) - dy * Math.sin(a) + layer.w / 2, y: dx * Math.sin(a) + dy * Math.cos(a) + layer.h / 2 };
  }

  function hitHandle(layer, point) {
    var local = toLocal(layer, point);
    var r = (HANDLE / zoom) * 0.9;
    var positions = handlePositions(layer);
    for (var i = 0; i < positions.length; i++) {
      var p = positions[i];
      if (Math.abs(local.x - p.x) <= r && Math.abs(local.y - p.y) <= r) return p.id;
    }
    return null;
  }

  function hitLayer(point) {
    for (var i = state.layers.length - 1; i >= 0; i--) {
      var layer = state.layers[i];
      var local = toLocal(layer, point);
      if (local.x >= 0 && local.y >= 0 && local.x <= layer.w && local.y <= layer.h) return layer;
    }
    return null;
  }

  // ------------------------------------------------------------ interaction

  var drag = null;

  canvas.addEventListener("pointerdown", function (event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    var point = toCanvasPoint(event);
    var sel = selected();
    var handle = sel ? hitHandle(sel, point) : null;
    if (handle) {
      drag = { mode: handle === "rotate" ? "rotate" : "resize", handle: handle, layer: sel, start: point, orig: JSON.parse(JSON.stringify(sel)) };
    } else {
      var layer = hitLayer(point);
      selectedId = layer ? layer.id : null;
      drag = layer ? { mode: "move", layer: layer, start: point, orig: JSON.parse(JSON.stringify(layer)) } : null;
      renderLayerList();
      renderProps();
    }
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    draw();
  });

  canvas.addEventListener("pointermove", function (event) {
    var point = toCanvasPoint(event);
    if (!drag) {
      var sel = selected();
      var handle = sel ? hitHandle(sel, point) : null;
      canvas.style.cursor = handle ? (handle === "rotate" ? "grab" : "nwse-resize") : hitLayer(point) ? "move" : "default";
      return;
    }
    var layer = drag.layer;
    var orig = drag.orig;
    if (drag.mode === "move") {
      layer.x = orig.x + (point.x - drag.start.x);
      layer.y = orig.y + (point.y - drag.start.y);
    } else if (drag.mode === "rotate") {
      var cx = layer.x + layer.w / 2;
      var cy = layer.y + layer.h / 2;
      var angle = (Math.atan2(point.y - cy, point.x - cx) * 180) / Math.PI + 90;
      if (event.shiftKey) angle = Math.round(angle / 15) * 15;
      layer.angle = Math.round(((angle + 540) % 360) - 180);
    } else {
      var local = toLocal(orig, point);
      var keepAspect = layer.type === "image" ? !event.shiftKey : event.shiftKey;
      var x1 = orig.x;
      var y1 = orig.y;
      var x2 = orig.x + orig.w;
      var y2 = orig.y + orig.h;
      var lx = orig.x + local.x;
      var ly = orig.y + local.y;
      if (drag.handle.indexOf("w") !== -1) x1 = Math.min(lx, x2 - MIN_BOX);
      if (drag.handle.indexOf("e") !== -1) x2 = Math.max(lx, x1 + MIN_BOX);
      if (drag.handle.indexOf("n") !== -1) y1 = Math.min(ly, y2 - MIN_BOX);
      if (drag.handle.indexOf("s") !== -1) y2 = Math.max(ly, y1 + MIN_BOX);
      var w = x2 - x1;
      var h = y2 - y1;
      if (keepAspect) {
        var ratio = orig.w / orig.h;
        if (w / h > ratio) w = h * ratio;
        else h = w / ratio;
        if (drag.handle.indexOf("w") !== -1) x1 = x2 - w;
        if (drag.handle.indexOf("n") !== -1) y1 = y2 - h;
      }
      layer.x = x1;
      layer.y = y1;
      layer.w = w;
      layer.h = h;
    }
    draw();
  });

  function endDrag(event) {
    if (!drag) return;
    drag = null;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch (e) {
      /* ignore */
    }
    commit();
    renderProps();
    draw();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener("dblclick", function () {
    var sel = selected();
    if (sel && sel.type === "text") $("me-text").focus();
  });

  document.addEventListener("keydown", function (event) {
    var tag = (event.target.tagName || "").toLowerCase();
    var typing = tag === "input" || tag === "textarea" || tag === "select";
    var meta = event.ctrlKey || event.metaKey;
    if (meta && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (meta && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }
    if (typing) return;
    var sel = selected();
    if (!sel) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      deleteLayer(sel);
    } else if (event.key === "Escape") {
      selectedId = null;
      refresh();
    } else if (/^Arrow/.test(event.key)) {
      event.preventDefault();
      var step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowLeft") sel.x -= step;
      if (event.key === "ArrowRight") sel.x += step;
      if (event.key === "ArrowUp") sel.y -= step;
      if (event.key === "ArrowDown") sel.y += step;
      commit();
      draw();
    }
  });

  window.addEventListener("resize", function () {
    resizeCanvas();
    draw();
  });

  // ---------------------------------------------------------------- layers UI

  function deleteLayer(layer) {
    state.layers = state.layers.filter(function (l) {
      return l.id !== layer.id;
    });
    if (selectedId === layer.id) selectedId = null;
    commit();
    refresh();
  }

  function renderLayerList() {
    var list = $("me-layers");
    list.innerHTML = "";
    state.layers
      .slice()
      .reverse()
      .forEach(function (layer) {
        var item = document.createElement("li");
        var empty = layer.type === "text" && !layer.text;
        item.className = "me-layer" + (layer.id === selectedId ? " active" : "") + (empty ? " empty" : "");
        var label = layer.type === "text" ? (displayText(layer) || layer.name + " (empty, type to fill)") : layer.name;
        item.innerHTML =
          '<button type="button" class="me-layer-select"><span class="me-layer-kind">' +
          (layer.type === "text" ? "T" : "▣") +
          '</span><span class="me-layer-name"></span></button>' +
          '<button type="button" class="me-layer-remove" title="Delete" aria-label="Delete layer">×</button>';
        item.querySelector(".me-layer-name").textContent = label.length > 28 ? label.slice(0, 27) + "…" : label;
        item.querySelector(".me-layer-select").addEventListener("click", function () {
          selectedId = layer.id;
          refresh();
          if (layer.type === "text") $("me-text").focus();
        });
        item.querySelector(".me-layer-remove").addEventListener("click", function () {
          deleteLayer(layer);
        });
        list.appendChild(item);
      });
    if (!state.layers.length) {
      var empty = document.createElement("li");
      empty.className = "me-empty";
      empty.textContent = "No layers yet. Add text or an image.";
      list.appendChild(empty);
    }
  }

  // ------------------------------------------------------------- properties

  var props = $("me-props");
  var fontSelect = $("me-font");
  config.fonts.forEach(function (font) {
    var option = document.createElement("option");
    option.value = font.id;
    option.textContent = font.label;
    fontSelect.appendChild(option);
  });

  var bgSelect = $("me-background");
  config.images.forEach(function (image) {
    var option = document.createElement("option");
    option.value = image.url;
    option.textContent = image.style === "default" ? config.name : image.style;
    bgSelect.appendChild(option);
  });

  function renderProps() {
    var sel = selected();
    props.hidden = !sel;
    if (!sel) return;
    var isText = sel.type === "text";
    $("me-props-title").textContent = isText ? "Text" : "Image";
    props.querySelector('[data-for="text"]').hidden = !isText;
    props.querySelector('[data-for="image"]').hidden = isText;
    if (isText) {
      $("me-text").value = sel.text;
      $("me-text").placeholder = "e.g. " + sel.placeholder;
      fontSelect.value = sel.font;
      var auto = sel.size <= 0;
      $("me-auto-size").checked = auto;
      var layout = layoutText(sel, displayText(sel) || sel.placeholder);
      $("me-size").value = auto ? layout.size : sel.size;
      $("me-size").disabled = auto;
      $("me-size-value").textContent = (auto ? layout.size : sel.size) + "px";
      $("me-color").value = toHex(sel.color);
      $("me-stroke-color").value = toHex(sel.strokeColor);
      var stroke = strokeWidthFor(sel, layout.size);
      $("me-stroke").value = stroke;
      $("me-stroke-value").textContent = sel.strokeWidth < 0 ? "auto (" + stroke + "px)" : stroke + "px";
      $("me-opacity").value = sel.opacity;
      $("me-uppercase").checked = sel.uppercase;
      props.querySelectorAll("[data-align]").forEach(function (button) {
        button.classList.toggle("active", button.getAttribute("data-align") === sel.align);
      });
      props.querySelectorAll("[data-valign]").forEach(function (button) {
        button.classList.toggle("active", button.getAttribute("data-valign") === sel.valign);
      });
    } else {
      $("me-image-opacity").value = sel.opacity;
      $("me-flip").checked = !!sel.flip;
    }
    $("me-angle").value = sel.angle;
    $("me-angle-value").textContent = sel.angle + "°";
  }

  var colorProbe = document.createElement("canvas").getContext("2d");
  function toHex(color) {
    if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
    colorProbe.fillStyle = "#000000";
    colorProbe.fillStyle = color;
    var value = colorProbe.fillStyle;
    return /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  }

  function bind(id, eventName, handler) {
    $(id).addEventListener(eventName, function (event) {
      var sel = selected();
      if (!sel) return;
      handler(sel, event.target);
      draw();
      renderLayerList();
    });
  }
  function bindCommit(id) {
    $(id).addEventListener("change", function () {
      commit();
      renderProps();
    });
  }

  bind("me-text", "input", function (sel, el) {
    sel.text = el.value;
  });
  bind("me-font", "change", function (sel, el) {
    sel.font = el.value;
  });
  bind("me-auto-size", "change", function (sel, el) {
    sel.size = el.checked ? 0 : layoutText(sel, displayText(sel) || sel.placeholder).size;
    renderProps();
  });
  bind("me-size", "input", function (sel, el) {
    sel.size = Number(el.value);
    $("me-size-value").textContent = sel.size + "px";
  });
  bind("me-color", "input", function (sel, el) {
    sel.color = el.value;
  });
  bind("me-stroke-color", "input", function (sel, el) {
    sel.strokeColor = el.value;
  });
  bind("me-stroke", "input", function (sel, el) {
    sel.strokeWidth = Number(el.value);
    $("me-stroke-value").textContent = sel.strokeWidth + "px";
  });
  bind("me-opacity", "input", function (sel, el) {
    sel.opacity = Number(el.value);
  });
  bind("me-image-opacity", "input", function (sel, el) {
    sel.opacity = Number(el.value);
  });
  bind("me-flip", "change", function (sel, el) {
    sel.flip = el.checked;
  });
  bind("me-uppercase", "change", function (sel, el) {
    sel.uppercase = el.checked;
  });
  bind("me-angle", "input", function (sel, el) {
    sel.angle = Number(el.value);
    $("me-angle-value").textContent = sel.angle + "°";
  });
  ["me-text", "me-font", "me-auto-size", "me-size", "me-color", "me-stroke-color", "me-stroke", "me-opacity", "me-image-opacity", "me-flip", "me-uppercase", "me-angle"].forEach(bindCommit);

  props.querySelectorAll("[data-align]").forEach(function (button) {
    button.addEventListener("click", function () {
      var sel = selected();
      if (!sel) return;
      sel.align = button.getAttribute("data-align");
      commit();
      refresh();
    });
  });
  props.querySelectorAll("[data-valign]").forEach(function (button) {
    button.addEventListener("click", function () {
      var sel = selected();
      if (!sel) return;
      sel.valign = button.getAttribute("data-valign");
      commit();
      refresh();
    });
  });

  // ----------------------------------------------------------------- actions

  var actions = {
    "add-text": function () {
      var layer = textLayer({ x: 0.1, y: 0.4, w: 0.8, h: 0.2, placeholder: "Your text" }, state.layers.length);
      layer.name = "Text " + (state.layers.filter(function (l) { return l.type === "text"; }).length + 1);
      state.layers.push(layer);
      selectedId = layer.id;
      commit();
      refresh();
      $("me-text").focus();
    },
    "add-image-url": function () {
      var url = window.prompt("Image URL (http or https):");
      if (!url) return;
      setStatus("Loading image…");
      addImageLayer(url.trim()).then(
        function () {
          setStatus("Image added. Drag it into place, use the corners to resize.");
        },
        function () {
          setStatus("That image could not be loaded.");
        },
      );
    },
    "background-blank": function () {
      var size = window.prompt("Canvas size (width x height in pixels):", state.width + "x" + state.height);
      if (!size) return;
      var m = /^\s*(\d+)\s*[x×,\s]\s*(\d+)\s*$/i.exec(size);
      if (!m) return setStatus("Please enter a size like 800x600.");
      rescaleLayers(clamp(Number(m[1]), 50, MAX_SIDE), clamp(Number(m[2]), 50, MAX_SIDE));
      state.background = { kind: "blank", src: "", color: "#ffffff" };
      bgImage = null;
      bgSelect.value = "";
      commit();
      refresh();
    },
    undo: undo,
    redo: redo,
    reset: function () {
      if (!window.confirm("Reset the editor to the template defaults?")) return;
      state.width = 800;
      state.height = 600;
      state.background = { kind: "template", src: config.images.length ? config.images[0].url : "", color: "#ffffff" };
      selectedId = null;
      init(true);
    },
    "layer-up": function () {
      moveLayer(1);
    },
    "layer-down": function () {
      moveLayer(-1);
    },
    duplicate: function () {
      var sel = selected();
      if (!sel) return;
      var copy = JSON.parse(JSON.stringify(sel));
      copy.id = uid();
      copy.x += 20;
      copy.y += 20;
      copy.name = sel.name + " copy";
      state.layers.push(copy);
      selectedId = copy.id;
      commit();
      refresh();
    },
    delete: function () {
      var sel = selected();
      if (sel) deleteLayer(sel);
    },
    "download-png": function () {
      exportBlob("image/png").then(function (blob) {
        saveBlob(blob, config.id + ".png");
      });
    },
    "download-jpg": function () {
      exportBlob("image/jpeg", 0.92).then(function (blob) {
        saveBlob(blob, config.id + ".jpg");
      });
    },
    "copy-image": function () {
      if (!navigator.clipboard || !window.ClipboardItem) return setStatus("Copying images is not supported in this browser. Download instead.");
      var item = new ClipboardItem({ "image/png": exportBlob("image/png") });
      navigator.clipboard.write([item]).then(
        function () {
          setStatus("Image copied to the clipboard.");
        },
        function () {
          setStatus("Could not copy the image. Download instead.");
        },
      );
    },
    "copy-link": function () {
      updateHash();
      var link = window.location.href;
      var done = function () {
        setStatus("Editor link copied. Anyone opening it sees your text (uploaded images are not included).");
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () { window.prompt("Copy this link:", link); });
      else window.prompt("Copy this link:", link);
    },
  };

  function moveLayer(direction) {
    var sel = selected();
    if (!sel) return;
    var index = state.layers.indexOf(sel);
    var target = index + direction;
    if (target < 0 || target >= state.layers.length) return;
    state.layers.splice(index, 1);
    state.layers.splice(target, 0, sel);
    commit();
    refresh();
  }

  root.addEventListener("click", function (event) {
    var button = event.target.closest("[data-action]");
    if (!button || button.tagName === "INPUT") return;
    var action = actions[button.getAttribute("data-action")];
    if (action) action();
  });

  root.querySelector('[data-action="add-image-file"]').addEventListener("change", function (event) {
    var file = event.target.files[0];
    if (!file) return;
    readFile(file).then(addImageLayer).then(function () {
      setStatus("Image added. Drag it into place, use the corners to resize.");
    });
    event.target.value = "";
  });

  root.querySelector('[data-action="background-file"]').addEventListener("change", function (event) {
    var file = event.target.files[0];
    if (!file) return;
    readFile(file)
      .then(function (src) {
        return setBackgroundImage(src, "upload");
      })
      .then(function () {
        bgSelect.value = "";
        setStatus("Background replaced with your image.");
      });
    event.target.value = "";
  });

  bgSelect.addEventListener("change", function () {
    if (!bgSelect.value) return;
    setBackgroundImage(bgSelect.value, "template");
  });

  // ------------------------------------------------------------------ export

  function exportBlob(type, quality) {
    return fontsReady.then(function () {
      var out = document.createElement("canvas");
      out.width = state.width;
      out.height = state.height;
      var octx = out.getContext("2d");
      if (type === "image/jpeg") {
        octx.fillStyle = "#ffffff";
        octx.fillRect(0, 0, out.width, out.height);
      }
      render(octx, true);
      return new Promise(function (resolve) {
        out.toBlob(resolve, type, quality);
      });
    });
  }

  function saveBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 5000);
    setStatus("Downloaded " + filename + ".");
  }

  // ------------------------------------------------------------ share links

  function encodeState() {
    var data = {
      w: state.width,
      h: state.height,
      bg: state.background.kind === "upload" ? null : state.background,
      layers: state.layers
        .filter(function (l) {
          return l.type === "text" || !/^data:/.test(l.src);
        })
        .map(function (l) {
          var copy = JSON.parse(JSON.stringify(l));
          delete copy.id;
          return copy;
        }),
    };
    var json = JSON.stringify(data);
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function decodeState(encoded) {
    try {
      var json = decodeURIComponent(escape(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))));
      return JSON.parse(json);
    } catch (e) {
      return null;
    }
  }

  var hashTimer = null;
  function scheduleHashUpdate() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(updateHash, 500);
  }
  function updateHash() {
    var hasContent = state.layers.some(function (l) {
      return l.type === "image" || l.text;
    });
    if (!window.history || !window.history.replaceState) return;
    var url = window.location.pathname + window.location.search + (hasContent ? "#m=" + encodeState() : "");
    window.history.replaceState(null, "", url);
  }

  // -------------------------------------------------------------------- init

  function init(fromReset) {
    setStatus("Loading…");
    var params = new URLSearchParams(window.location.search);
    var hash = /^#m=(.+)$/.exec(window.location.hash);
    var shared = !fromReset && hash ? decodeState(hash[1]) : null;

    var start = state.background.src ? getImage(state.background.src) : Promise.resolve(null);
    return start
      .catch(function () {
        return null;
      })
      .then(function (img) {
        if (img) {
          var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
          state.width = Math.round(img.naturalWidth * scale);
          state.height = Math.round(img.naturalHeight * scale);
          bgImage = img;
        }
        state.layers = defaultLayers();
        var initial = params.getAll("text");
        initial.forEach(function (line, index) {
          if (state.layers[index]) state.layers[index].text = line;
        });
        if (shared && shared.layers) {
          state.width = shared.w || state.width;
          state.height = shared.h || state.height;
          if (shared.bg) state.background = shared.bg;
          state.layers = shared.layers.map(function (l) {
            l.id = uid();
            return l;
          });
          return loadBackground().then(function () {
            return Promise.all(
              state.layers
                .filter(function (l) {
                  return l.type === "image";
                })
                .map(function (l) {
                  return getImage(l.src).catch(function () {});
                }),
            );
          });
        }
      })
      .then(function () {
        return fontsReady;
      })
      .then(function () {
        layoutCache = {};
        history = [];
        future = [];
        commit();
        if (!selectedId && state.layers.length) selectedId = state.layers[0].id;
        refresh();
        setStatus("Click a text box to edit it. Drag to move, corners resize, top handle rotates.");
      });
  }

  // Keep resolved images reachable synchronously for rendering
  var originalGetImage = getImage;
  getImage = function (src) {
    var pending = originalGetImage(src);
    pending.then(function (img) {
      pending.resolved = img;
      draw();
    });
    return pending;
  };

  init(false);
})();
