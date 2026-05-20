(function () {
    'use strict';

    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');

    const els = {
        text: document.getElementById('textInput'),
        fontFamily: document.getElementById('fontFamily'),
        fontStyle: document.getElementById('fontStyle'),
        fontSize: document.getElementById('fontSize'),
        fontSizeOut: document.getElementById('fontSizeOut'),
        spacing: document.getElementById('spacing'),
        spacingOut: document.getElementById('spacingOut'),
        speed: document.getElementById('speed'),
        speedOut: document.getElementById('speedOut'),
        stroke: document.getElementById('stroke'),
        strokeOut: document.getElementById('strokeOut'),
        repeatGap: document.getElementById('repeatGap'),
        repeatGapOut: document.getElementById('repeatGapOut'),
        repeatGapField: document.getElementById('repeatGapField'),
        fontColor: document.getElementById('fontColor'),
        bgColor: document.getElementById('bgColor'),
        lineColor: document.getElementById('lineColor'),
        direction: document.getElementById('direction'),
        repeat: document.getElementById('repeatText'),
        showLine: document.getElementById('showLine'),
        upright: document.getElementById('upright'),
        clear: document.getElementById('clearBtn'),
        modeDraw: document.getElementById('modeDraw'),
        modeView: document.getElementById('modeView'),
        playPause: document.getElementById('playPause'),
        save: document.getElementById('saveBtn'),
        hint: document.getElementById('hint'),
        fullscreen: document.getElementById('fullscreenBtn'),
        canvasWrap: document.querySelector('.canvas-wrap'),
        toolbar: document.querySelector('.canvas-toolbar')
    };

    const state = {
        points: [],
        cum: [],
        totalLen: 0,
        offset: 0,
        mode: 'draw',
        playing: true,
        drawing: false,
        lastTime: 0,
        dpr: Math.max(1, window.devicePixelRatio || 1),
        lastSize: { w: 0, h: 0 }
    };

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        const dpr = state.dpr;
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(rect.height * dpr));
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function cssSize() {
        const rect = canvas.getBoundingClientRect();
        return { w: rect.width, h: rect.height };
    }

    function getPointerPos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    function addPoint(p, minDist) {
        const pts = state.points;
        if (pts.length === 0) {
            pts.push(p);
            state.cum.push(0);
            return;
        }
        const last = pts[pts.length - 1];
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        const d = Math.hypot(dx, dy);
        if (d < (minDist || 2)) return;
        pts.push(p);
        state.totalLen += d;
        state.cum.push(state.totalLen);
    }

    function rebuildCumulative() {
        const pts = state.points;
        state.cum = [0];
        let total = 0;
        for (let i = 1; i < pts.length; i++) {
            const dx = pts[i].x - pts[i - 1].x;
            const dy = pts[i].y - pts[i - 1].y;
            total += Math.hypot(dx, dy);
            state.cum.push(total);
        }
        state.totalLen = total;
    }

    function pointAtDistance(d) {
        const pts = state.points;
        const cum = state.cum;
        if (pts.length < 2) return null;
        if (d <= 0) {
            const dx = pts[1].x - pts[0].x;
            const dy = pts[1].y - pts[0].y;
            return { x: pts[0].x, y: pts[0].y, angle: Math.atan2(dy, dx) };
        }
        if (d >= state.totalLen) {
            const a = pts[pts.length - 2];
            const b = pts[pts.length - 1];
            return { x: b.x, y: b.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
        }
        let lo = 0, hi = cum.length - 1;
        while (lo + 1 < hi) {
            const mid = (lo + hi) >> 1;
            if (cum[mid] <= d) lo = mid;
            else hi = mid;
        }
        const a = pts[lo];
        const b = pts[lo + 1];
        const segLen = cum[lo + 1] - cum[lo];
        const t = segLen > 0 ? (d - cum[lo]) / segLen : 0;
        return {
            x: a.x + (b.x - a.x) * t,
            y: a.y + (b.y - a.y) * t,
            angle: Math.atan2(b.y - a.y, b.x - a.x)
        };
    }

    function fontString() {
        const style = els.fontStyle.value;
        const size = parseInt(els.fontSize.value, 10);
        const family = els.fontFamily.value;
        return `${style} ${size}px ${family}`;
    }

    function drawLine() {
        if (!els.showLine.checked) return;
        const thickness = parseInt(els.stroke.value, 10);
        if (thickness <= 0) return;
        const pts = state.points;
        if (pts.length < 2) return;
        ctx.save();
        ctx.strokeStyle = els.lineColor.value;
        ctx.lineWidth = thickness;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.restore();
    }

    function drawTextAlongPath() {
        if (state.points.length < 2 || state.totalLen <= 0) return;
        const text = els.text.value;
        if (!text) return;

        const spacing = parseInt(els.spacing.value, 10);
        const upright = els.upright.checked;
        const repeat = els.repeat.checked;
        const repeatGap = Math.max(0, parseInt(els.repeatGap.value, 10) || 0);

        ctx.save();
        ctx.font = fontString();
        ctx.fillStyle = els.fontColor.value;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        const chars = Array.from(text);
        const widths = chars.map(c => ctx.measureText(c).width + spacing);
        const textWidth = widths.reduce((a, b) => a + b, 0);
        if (textWidth <= 0) { ctx.restore(); return; }

        const cycleWidth = repeat ? (textWidth + repeatGap) : textWidth;
        const L = state.totalLen;
        let startD;
        if (repeat) {
            const wrapped = ((state.offset % cycleWidth) + cycleWidth) % cycleWidth;
            startD = -wrapped;
        } else {
            startD = state.offset;
        }

        let d = startD;
        let i = 0;
        const limit = repeat ? 10000 : chars.length;
        let drawn = 0;

        while (drawn < limit) {
            const idx = repeat ? (i % chars.length) : i;
            if (!repeat && i >= chars.length) break;
            const w = widths[idx];
            const centerD = d + w / 2;
            if (centerD > L + w) break;
            if (centerD >= 0 && centerD <= L) {
                const pos = pointAtDistance(centerD);
                if (pos) {
                    ctx.save();
                    ctx.translate(pos.x, pos.y);
                    if (!upright) {
                        let angle = pos.angle;
                        // flip text so it isn't upside-down when path goes leftward
                        if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
                            angle += Math.PI;
                        }
                        ctx.rotate(angle);
                    }
                    ctx.fillText(chars[idx], 0, 0);
                    ctx.restore();
                }
            }
            d += w;
            i++;
            drawn++;
            // insert gap after a full text iteration (only in repeat mode)
            if (repeat && i % chars.length === 0) d += repeatGap;
            if (d > L && !repeat) break;
        }
        ctx.restore();
    }

    function render() {
        const { w, h } = cssSize();
        ctx.save();
        ctx.fillStyle = els.bgColor.value;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
        drawLine();
        drawTextAlongPath();
    }

    function tick(now) {
        if (!state.lastTime) state.lastTime = now;
        const dt = (now - state.lastTime) / 1000;
        state.lastTime = now;
        if (state.playing) {
            const speed = parseFloat(els.speed.value);
            const dir = parseFloat(els.direction.value);
            state.offset += speed * dir * dt;
        }
        render();
        requestAnimationFrame(tick);
    }

    function setMode(mode) {
        state.mode = mode;
        if (mode === 'draw') {
            els.modeDraw.classList.add('active');
            els.modeView.classList.remove('active');
            canvas.classList.remove('view-mode');
        } else {
            els.modeView.classList.add('active');
            els.modeDraw.classList.remove('active');
            canvas.classList.add('view-mode');
        }
    }

    function clearPath() {
        state.points = [];
        state.cum = [];
        state.totalLen = 0;
        state.offset = 0;
        els.hint.classList.remove('hide');
    }

    function onPointerDown(e) {
        if (state.mode !== 'draw') return;
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
        state.drawing = true;
        clearPath();
        addPoint(getPointerPos(e), 0);
        els.hint.classList.add('hide');
    }

    function onPointerMove(e) {
        if (!state.drawing) return;
        e.preventDefault();
        addPoint(getPointerPos(e), 2);
    }

    function onPointerUp(e) {
        if (!state.drawing) return;
        e.preventDefault();
        state.drawing = false;
        try { canvas.releasePointerCapture && canvas.releasePointerCapture(e.pointerId); } catch (err) {}
        if (state.points.length < 2) {
            clearPath();
        }
    }

    function bindControls() {
        const liveOuts = [
            ['fontSize', 'fontSizeOut'],
            ['spacing', 'spacingOut'],
            ['speed', 'speedOut'],
            ['stroke', 'strokeOut'],
            ['repeatGap', 'repeatGapOut']
        ];
        liveOuts.forEach(([inp, out]) => {
            els[inp].addEventListener('input', () => {
                els[out].textContent = els[inp].value;
            });
        });

        els.clear.addEventListener('click', clearPath);
        els.modeDraw.addEventListener('click', () => setMode('draw'));
        els.modeView.addEventListener('click', () => setMode('view'));
        els.playPause.addEventListener('click', () => {
            state.playing = !state.playing;
            els.playPause.textContent = state.playing ? 'Pause' : 'Play';
        });
        els.save.addEventListener('click', savePng);
        els.fullscreen.addEventListener('click', toggleFullscreen);
        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', onFullscreenChange);

        const syncRepeatGapEnabled = () => {
            els.repeatGapField.classList.toggle('disabled', !els.repeat.checked);
        };
        els.repeat.addEventListener('change', syncRepeatGapEnabled);
        syncRepeatGapEnabled();
    }

    function savePng() {
        render();
        const link = document.createElement('a');
        link.download = 'textorbit.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    function bindCanvas() {
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);
        canvas.addEventListener('pointerleave', onPointerUp);
        // prevent page scrolling/zooming on touch over canvas
        canvas.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
        canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

        const wakeToolbar = () => {
            if (!isFullscreen()) return;
            els.toolbar.classList.remove('idle');
            scheduleToolbarHide();
        };
        els.canvasWrap.addEventListener('pointermove', wakeToolbar);
        els.canvasWrap.addEventListener('pointerdown', wakeToolbar);
    }

    let toolbarHideTimer = null;
    function scheduleToolbarHide() {
        clearTimeout(toolbarHideTimer);
        toolbarHideTimer = setTimeout(() => {
            if (isFullscreen()) els.toolbar.classList.add('idle');
        }, 2200);
    }

    function isFullscreen() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }

    function toggleFullscreen() {
        if (isFullscreen()) {
            (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        } else {
            const target = els.canvasWrap;
            const req = target.requestFullscreen || target.webkitRequestFullscreen;
            if (req) req.call(target);
        }
    }

    function onFullscreenChange() {
        const fs = isFullscreen();
        els.fullscreen.textContent = fs ? 'Exit FS' : 'Fullscreen';
        if (fs) {
            setMode('view');
            scheduleToolbarHide();
        } else {
            els.toolbar.classList.remove('idle');
            clearTimeout(toolbarHideTimer);
        }
        // wait for layout to settle, then resize the canvas backbuffer
        requestAnimationFrame(handleResize);
    }

    function handleResize() {
        const oldW = state.lastSize.w;
        const oldH = state.lastSize.h;
        resizeCanvas();
        const newSize = cssSize();
        if (state.points.length > 0 && oldW > 0 && oldH > 0 && (oldW !== newSize.w || oldH !== newSize.h)) {
            const sx = newSize.w / oldW;
            const sy = newSize.h / oldH;
            state.points = state.points.map(p => ({ x: p.x * sx, y: p.y * sy }));
            rebuildCumulative();
        }
        state.lastSize = newSize;
    }

    function init() {
        resizeCanvas();
        state.lastSize = cssSize();
        bindControls();
        bindCanvas();
        window.addEventListener('resize', handleResize);
        // demo path so first-load shows the effect
        seedDemoPath();
        requestAnimationFrame(tick);
    }

    function seedDemoPath() {
        const { w, h } = cssSize();
        if (w < 40 || h < 40) return;
        const pts = [];
        const cx = w / 2;
        const cy = h / 2;
        const amp = Math.min(w, h) * 0.25;
        const step = Math.max(4, w / 200);
        for (let x = 20; x < w - 20; x += step) {
            const t = (x - 20) / (w - 40);
            const y = cy + Math.sin(t * Math.PI * 3) * amp * 0.6;
            pts.push({ x, y });
        }
        state.points = pts;
        rebuildCumulative();
        els.hint.classList.add('hide');
    }

    init();
})();
