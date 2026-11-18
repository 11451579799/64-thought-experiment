(function () {
  "use strict";

  var TAU = Math.PI * 2;
  var CENTER = 240;
  var CREAM = "#f2e1ba";
  var BRASS = "#cbb78a";
  var RUST = "#b76a51";
  var SERIF = '"Noto Serif SC","Songti SC","STSong","SimSun",serif';
  var SANS = '"PingFang SC","Microsoft YaHei",sans-serif';
  var sigil;
  var nextId = 0;

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function point(radius, theta) {
    return [
      (CENTER + radius * Math.sin(theta)).toFixed(2),
      (CENTER - radius * Math.cos(theta)).toFixed(2)
    ].join(" ");
  }

  function glyph(index, phase, variant) {
    var sector = Math.floor(index / 8);
    var slot = index % 8;
    var angle = TAU * (sector * 8.6 + slot + 0.8) / 68.8;
    var axis = phase * Math.PI / 8 + variant * TAU / 64;
    var wave = Math.cos(8 * (angle + axis / 4));
    var radius = 182 + (Math.min(phase, 4) * 3.4) * wave;
    var width = 0.016 + (0.006 * (1 + Math.sin(phase + angle * 4)));
    var height = 10 + 7 * Math.cos(phase * 0.55 + slot * Math.PI / 7);
    return "M" + point(radius + height, angle + 0.015 * Math.sin(axis)) +
      " L" + point(radius, angle + width) +
      " L" + point(radius - height, angle - 0.012 * Math.sin(axis)) +
      " L" + point(radius, angle - width) + " Z";
  }

  function weave(phase, variant, offset) {
    var points = [];
    var angle = phase * TAU / 32 + variant * TAU / 64 + offset;
    var high = 148 - 19 * (0.5 + 0.5 * Math.sin(phase * 0.8 + variant * 0.3));
    var low = 66 + 38 * (0.5 + 0.5 * Math.cos(phase * 0.9 + variant * 0.4));
    for (var i = 0; i < 16; i += 1) {
      points.push(point(i % 2 ? low : high, angle + i * TAU / 16));
    }
    return "M" + points.join(" L") + " Z";
  }

  function thread(phase, variant, inner) {
    var lines = [];
    var rotation = phase * TAU / 30 + variant * TAU / 64;
    var reach = inner ? 66 : 122;
    var span = inner ? 2.5 : 3.35;
    for (var i = 0; i < 8; i += 1) {
      var angle = rotation + i * TAU / 8;
      lines.push("M" + point(reach, angle) + " Q" +
        point(10 + 4 * phase, angle + span / 2) + " " +
        point(reach, angle + span));
    }
    return lines.join(" ");
  }

  function rings() {
    var ticks = [];
    for (var i = 0; i < 8; i += 1) {
      var angle = i * TAU / 8;
      ticks.push(
        '<line x1="' + point(214, angle).replace(" ", '" y1="') +
        '" x2="' + point(225, angle).replace(" ", '" y2="') +
        '" stroke-width="' + (i % 2 ? 1 : 1.8) + '"/>'
      );
    }
    return '<g fill="none" stroke="' + BRASS + '" opacity=".42">' +
      '<circle cx="240" cy="240" r="216" stroke-width=".65"/>' +
      '<circle cx="240" cy="240" r="208" stroke-width="1"/>' +
      '<circle cx="240" cy="240" r="200" stroke-width=".6" stroke-dasharray="1 6"/>' +
      '<circle cx="240" cy="240" r="156" stroke-width=".65" opacity=".65"/>' +
      ticks.join("") + '</g>';
  }

  function markers(answered, phase, variant) {
    var nodes = [];
    for (var i = 0; i < 64; i += 1) {
      var lit = i < answered;
      nodes.push('<path data-sigil-node="' + (i + 1) +
        '" class="sigil-marker' + (lit ? ' is-lit' : '') +
        '" d="' + glyph(i, phase, variant) +
        '" fill="' + (lit ? (i % 8 === 7 ? CREAM : BRASS) : "transparent") +
        '" fill-opacity="' + (lit ? "0.86" : "0") +
        '" stroke="' + (lit ? CREAM : BRASS) +
        '" stroke-opacity="' + (lit ? "0.9" : "0.32") + '" stroke-width=".75"/>');
    }
    return nodes.join("");
  }

  function badge(answered, variant) {
    var count = answered === undefined ? 64 : Math.trunc(clamp(Number(answered) || 0, 0, 64));
    var index = Math.trunc(clamp(Number(variant) || 0, 0, 7));
    var phase = Math.floor(count / 8);
    var id = "sigil-halo-" + (++nextId);
    return '<svg class="sigil-astrolabe" xmlns="http://www.w3.org/2000/svg" ' +
      'viewBox="0 0 480 480" width="480" height="480" fill="none" aria-hidden="true">' +
      '<defs><radialGradient id="' + id + '"><stop offset="0" stop-color="#735441" stop-opacity=".31"/>' +
      '<stop offset=".63" stop-color="#503729" stop-opacity=".14"/>' +
      '<stop offset="1" stop-color="#503729" stop-opacity="0"/></radialGradient></defs>' +
      '<circle cx="240" cy="240" r="228" fill="url(#' + id + ')"/>' + rings() +
      '<path data-weave="outer" d="' + weave(phase, index, 0) + '" stroke="' + BRASS +
      '" stroke-width=".85" stroke-opacity=".54"/>' +
      '<path data-weave="inner" d="' + weave(phase, index, TAU / 16) + '" stroke="' + RUST +
      '" stroke-width=".8" stroke-opacity=".62"/>' +
      '<path data-thread="outer" d="' + thread(phase, index, false) + '" stroke="' + BRASS +
      '" stroke-width=".5" stroke-opacity=".48"/>' +
      '<path data-thread="inner" d="' + thread(phase, index, true) + '" stroke="' + BRASS +
      '" stroke-width=".7" stroke-opacity=".54"/>' +
      '<g data-pivot="center" class="sigil-pivot" transform="rotate(' + (phase * 22.5 + index * 11.25) + ' 240 240)">' +
      '<circle cx="240" cy="240" r="30" stroke="' + BRASS + '" stroke-opacity=".7" stroke-width=".75"/>' +
      '<circle cx="240" cy="240" r="36" stroke="' + BRASS + '" stroke-opacity=".38" stroke-width=".7" stroke-dasharray="1 5"/>' +
      '<path d="M240 198 247 233 282 240 247 247 240 282 233 247 198 240 233 233Z" ' +
      'fill="#473025" fill-opacity=".76" stroke="' + BRASS + '" stroke-width=".9"/>' +
      '<path d="M240 222 258 240 240 258 222 240Z" fill="' + RUST +
      '" fill-opacity=".53" stroke="' + CREAM + '" stroke-width=".8"/>' +
      '<circle cx="240" cy="240" r="3" fill="' + CREAM + '"/></g>' +
      markers(count, phase, index) + '</svg>';
  }

  function drawMorph(state, phase) {
    state.phase = phase;
    state.markers.forEach(function (marker, index) {
      marker.setAttribute("d", glyph(index, phase, 0));
    });
    state.weaveOuter.setAttribute("d", weave(phase, 0, 0));
    state.weaveInner.setAttribute("d", weave(phase, 0, TAU / 16));
    state.threadOuter.setAttribute("d", thread(phase, 0, false));
    state.threadInner.setAttribute("d", thread(phase, 0, true));
    state.pivot.setAttribute("transform", "rotate(" + phase * 22.5 + " 240 240)");
  }

  function mount(container) {
    if (sigil && sigil.container === container && container.contains(sigil.svg)) {
      return sigil.svg;
    }
    if (sigil) {
      window.cancelAnimationFrame(sigil.frame);
    }
    container.innerHTML = badge(0, 0);
    var svg = container.firstElementChild;
    sigil = {
      container: container,
      svg: svg,
      markers: Array.prototype.slice.call(svg.querySelectorAll("[data-sigil-node]")),
      weaveOuter: svg.querySelector('[data-weave="outer"]'),
      weaveInner: svg.querySelector('[data-weave="inner"]'),
      threadOuter: svg.querySelector('[data-thread="outer"]'),
      threadInner: svg.querySelector('[data-thread="inner"]'),
      pivot: svg.querySelector('[data-pivot]'),
      count: null,
      phase: 0,
      target: 0,
      frame: 0
    };
    return svg;
  }

  function update(answered) {
    if (!sigil) {
      return;
    }
    var state = sigil;
    var count = Math.trunc(clamp(Number(answered) || 0, 0, 64));
    var previous = state.count;
    state.count = count;
    state.markers.forEach(function (marker, index) {
      var lit = index < count;
      if (marker.classList.contains("is-lit") === lit) {
        return;
      }
      marker.classList.toggle("is-lit", lit);
      marker.setAttribute("fill", lit ? (index % 8 === 7 ? CREAM : BRASS) : "transparent");
      marker.setAttribute("fill-opacity", lit ? ".86" : "0");
      marker.setAttribute("stroke", lit ? CREAM : BRASS);
      marker.setAttribute("stroke-opacity", lit ? ".9" : ".32");
    });
    var target = Math.floor(count / 8);
    if (target === state.target) {
      return;
    }
    state.target = target;
    window.cancelAnimationFrame(state.frame);
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (previous === null || reduced) {
      drawMorph(state, target);
      return;
    }
    var from = state.phase;
    var start;
    function animate(now) {
      if (start === undefined) {
        start = now;
      }
      var progress = Math.min((now - start) / 880, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      drawMorph(state, from + (target - from) * eased);
      if (progress < 1) {
        state.frame = window.requestAnimationFrame(animate);
      }
    }
    state.frame = window.requestAnimationFrame(animate);
  }

  function texture() {
    var id = "sigil-grain-" + (++nextId);
    return '<svg class="sigil-texture" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 740" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs><filter id="' + id + '" x="0" y="0" width="100%" height="100%">' +
      '<feTurbulence type="fractalNoise" baseFrequency=".67" numOctaves="3" seed="23" stitchTiles="stitch"/>' +
      '<feColorMatrix type="saturate" values="0"/></filter></defs>' +
      '<rect width="420" height="740" filter="url(#' + id + ')"/></svg>';
  }

  function wax() {
    var id = "sigil-wax-" + (++nextId);
    var pieces = [
      ["M49 46 44 25 53 0H99L96 29 77 40Z", 18, -24, 24],
      ["M49 46 77 40 96 29 99 82 70 65 60 61Z", 32, 0, 52],
      ["M49 46 60 61 70 65 99 82V99H31L37 72Z", 12, 30, -33],
      ["M49 46 37 72 31 99H0V48L24 51Z", -28, 23, 36],
      ["M49 46 24 51 0 48V0H53L44 25Z", -30, -18, -45]
    ];
    var plate = '<path d="M49 7C58 5 63 11 71 12Q81 14 85 25C96 28 91 42 93 48' +
      'Q95 57 89 63C90 76 78 80 72 84Q63 96 53 91C42 94 39 88 32 87' +
      'Q17 89 13 75C3 69 10 59 7 52Q2 41 10 34C7 23 22 19 27 14Q34 5 49 7Z" ' +
      'fill="url(#' + id + '-red)" stroke="#c67858" stroke-width=".8"/>' +
      '<circle cx="50" cy="49" r="32" fill="none" stroke="#31171a" stroke-width="2.5"/>' +
      '<circle cx="50" cy="49" r="28" fill="none" stroke="#c47f61" stroke-opacity=".58"/>' +
      '<path d="M39 45V42A11 11 0 0 1 61 42V45M38 45H62V64H38ZM50 52V57" ' +
      'fill="none" stroke="#eac393" stroke-opacity=".9" stroke-width="1.7" stroke-linejoin="round"/>';
    var definitions = pieces.map(function (piece, index) {
      return '<clipPath id="' + id + '-' + index + '"><path d="' + piece[0] + '"/></clipPath>';
    }).join("");
    var fragments = pieces.map(function (piece, index) {
      return '<g class="sigil-wax-piece" style="--wax-x:' + piece[1] + 'px;--wax-y:' +
        piece[2] + 'px;--wax-r:' + piece[3] + 'deg" clip-path="url(#' + id + '-' + index +
        ')">' + plate + '</g>';
    }).join("");
    return '<svg class="sigil-wax" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">' +
      '<defs><radialGradient id="' + id + '-red" cx=".36" cy=".22" r=".82">' +
      '<stop stop-color="#ab573c"/><stop offset=".62" stop-color="#763028"/>' +
      '<stop offset="1" stop-color="#492020"/></radialGradient>' + definitions + '</defs>' +
      fragments + '</svg>';
  }

  function collapse() {
    var nodes = [];
    for (var row = -3; row <= 4; row += 1) {
      for (var column = -3; column <= 4; column += 1) {
        var index = (row + 3) * 8 + column + 3;
        var x = (column - 0.5) * 26;
        var y = (row - 0.5) * 26;
        nodes.push('<rect class="sigil-calc-node" x="' + (236 + x) + '" y="' + (236 + y) +
          '" width="8" height="8" style="--calc-x:' + (-x) + 'px;--calc-y:' + (-y) +
          'px;--calc-delay:' + ((index * 17) % 460) + 'ms" fill="' + (index % 9 === 0 ? RUST : BRASS) + '"/>');
      }
    }
    return '<svg class="sigil-collapse" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 480" aria-hidden="true">' +
      '<g class="sigil-calc-rings" fill="none" stroke="' + BRASS + '">' +
      '<circle cx="240" cy="240" r="145" stroke-width="1" stroke-dasharray="1 8"/>' +
      '<circle cx="240" cy="240" r="172" stroke-width=".65"/>' +
      '<rect x="120" y="120" width="240" height="240" stroke-width=".65" transform="rotate(45 240 240)"/></g>' +
      '<g class="sigil-calc-matrix">' + nodes.join("") + '</g>' +
      '<path class="sigil-calc-flare" d="M240 155 250 230 325 240 250 250 240 325 230 250 155 240 230 230Z" ' +
      'fill="' + CREAM + '"/></svg>';
  }

  function svgImage(markup) {
    return new Promise(function (resolve, reject) {
      var source = new Image();
      source.onload = function () { resolve(source); };
      source.onerror = function () { reject(new Error("图腾图像生成失败")); };
      source.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(markup);
    });
  }

  function line(context, x1, y1, x2, y2) {
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
  }

  function ornament(context, x, y, radius) {
    context.beginPath();
    context.moveTo(x, y - radius);
    context.lineTo(x + radius, y);
    context.lineTo(x, y + radius);
    context.lineTo(x - radius, y);
    context.closePath();
    context.fill();
  }

  function wrap(context, content, width) {
    var lines = [];
    var current = "";
    Array.from(content).forEach(function (character) {
      var closing = /[，。！？；：、）”’》]/u.test(character);
      if (current && !closing && context.measureText(current + character).width > width) {
        lines.push(current);
        current = character;
      } else {
        current += character;
      }
    });
    if (current) {
      lines.push(current);
    }
    return lines;
  }

  function write(context, content, y, size, color, width, family) {
    context.font = size + "px " + (family || SERIF);
    context.fillStyle = color;
    var lines = wrap(context, content, width);
    lines.forEach(function (entry, index) {
      context.fillText(entry, 540, y + index * size * 1.46);
    });
    return y + lines.length * size * 1.46;
  }

  function canvasArtwork(data, wallpaperIndex) {
    var wallpaperMode = wallpaperIndex !== undefined;
    var variant = Number(data.variant) || 0;
    var index = wallpaperMode ? Math.trunc(clamp(Number(wallpaperIndex) || 0, 0, 7)) : 0;
    var badgeVariant = wallpaperMode ? (variant + index) % 8 : variant;
    return svgImage(badge(64, badgeVariant)).then(function (source) {
      var canvas = document.createElement("canvas");
      canvas.hidden = true;
      canvas.width = 1080;
      canvas.height = wallpaperMode ? 1920 : 1620;
      document.body.appendChild(canvas);
      try {
        var context = canvas.getContext("2d");
        if (!context) {
          throw new Error("当前浏览器无法绘制图像");
        }
        var height = canvas.height;
        var gradient = context.createRadialGradient(540, height * 0.42, 12, 540, height * 0.42, 1030);
        gradient.addColorStop(0, wallpaperMode && index % 2 ? "#252127" : "#2a1d19");
        gradient.addColorStop(0.57, "#171211");
        gradient.addColorStop(1, "#0e0c0c");
        context.fillStyle = gradient;
        context.fillRect(0, 0, 1080, height);
        context.strokeStyle = "#b49b6b";
        context.lineWidth = 1;
        context.strokeRect(50, 50, 980, height - 100);
        context.strokeStyle = "#625340";
        context.strokeRect(62, 62, 956, height - 124);
        context.fillStyle = BRASS;
        ornament(context, 50, 50, 4);
        ornament(context, 1030, 50, 4);
        ornament(context, 50, height - 50, 4);
        ornament(context, 1030, height - 50, 4);
        context.textAlign = "center";
        context.textBaseline = "middle";
        if (wallpaperMode) {
          write(context, "64 重思想实验", 290, 31, BRASS, 850);
          context.drawImage(source, 115, 468, 850, 850);
          write(context, data.name, 1440, 52, CREAM, 846);
          write(context, data.quote, 1524, 33, BRASS, 810);
          write(context, "· " + data.id + " · " + String(index + 1).padStart(2, "0") + " / 08", 1738, 25, BRASS, 850, SANS);
        } else {
          write(context, "64 重思想实验", 132, 32, BRASS, 846);
          write(context, "精神档案  /  " + data.id, 190, 23, BRASS, 846, SANS);
          context.drawImage(source, 204, 236, 672, 672);
          context.strokeStyle = "#806b50";
          line(context, 136, 940, 510, 940);
          line(context, 570, 940, 944, 940);
          context.fillStyle = BRASS;
          ornament(context, 540, 940, 7);
          var nameSize = Math.min(62, Math.floor(844 / Math.max(1, Array.from(data.name).length)));
          var quoteY = write(context, data.name, 1018, nameSize, CREAM, 850) + 28;
          var profileY = write(context, data.quote, quoteY, 37, BRASS, 820) + 40;
          write(context, data.profile, profileY, 32, "#ddd0ba", 800);
          var entryLabel = data.entryLabel && data.entryLabel.length <= 72 ? data.entryLabel : "灵 魂 侧 写";
          write(context, entryLabel, 1505, 23, BRASS, 850, data.entryLabel ? SANS : SERIF);
        }
        return canvas.toDataURL("image/png");
      } finally {
        document.body.removeChild(canvas);
      }
    });
  }

  window.Sigil = {
    mount: mount,
    update: update,
    badge: badge,
    texture: texture,
    wax: wax,
    collapse: collapse,
    poster: function (data) { return canvasArtwork(data); },
    wallpaper: function (data, index) { return canvasArtwork(data, index === undefined ? 0 : index); }
  };
})();
