var Graph = (function (exports) {
    'use strict';

    const DEBOUNCE = 1000 / 24;

    class EventAware {

        constructor(container) {
            this.container = container;
            this.debounces = {};
            this.events = {};

            this.sendEvent = this.sendEvent.bind(this);
        }

        static subscribeTo(element, eventName, handler) {
            element.addEventListener(eventName, handler, false);
        }

        static notifyTo(element, eventName, detail = {}) {
            const event = new CustomEvent(eventName, {
                detail,
                bubbles: true,
                cancelable: true
            });

            element.dispatchEvent(event);
        }

        subscribe(eventName, handler) {
            EventAware.subscribeTo(this.container, eventName, handler);
        }

        sendEvent(eventName) {
            if (this.events[eventName]) {
                EventAware.notifyTo(this.container, eventName, this.events[eventName]);
                this.events[eventName] = null;
                this.debounces[eventName] = setTimeout(() => this.sendEvent(eventName), DEBOUNCE);
            } else {
                this.debounces[eventName] = null;
            }
        }

        notify(eventName, detail = {}) {
            if (this.debounces[eventName]) {
                this.events[eventName] = detail;
            } else {
                EventAware.notifyTo(this.container, eventName, detail);
                this.debounces[eventName] = setTimeout(() => this.sendEvent(eventName), DEBOUNCE);
            }
        }
    }

    class Drawable extends EventAware {

        constructor(container, config = {}) {
            super(container);
            this.canvas = document.createElement('canvas');
            this.canvas.classList.add(this.constructor.name.toLowerCase());
            this.context = this.canvas.getContext('2d');
            this.container.appendChild(this.canvas);
            this.config = Object.assign(this.getDefaultConfig(), config);
            this.animationStart = false;
            this.animation = {};
            this.clear = this.clear.bind(this);
            this.draw = this.draw.bind(this);
            this.animateTick = this.animateTick.bind(this);
            this.resize();
        }

        getDefaultConfig() {
            return {
                padding: {
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 0
                }
            }
        }

        draw(delta) {
        }

        initCanvas() {
            this.context.lineWidth = this.config.lineWidth;
        }

        clear() {
            this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        animateProperties(draw, properties, duration) {
            this.animation = {
                draw,
                start: performance.now(),
                duration,
                fromValues: Object.keys(properties).reduce((result, property) => ({
                    ...result,
                    [property]: this[property]
                }), {}),
                toValues: properties
            };

            if (!this.animationStart) {
                requestAnimationFrame(this.animateTick);
                this.animationStart = true;
            }
        }

        animateTick(time) {
            const delta = Math.min(Math.max((time - this.animation.start) / this.animation.duration, 0), 1);
            Object.keys(this.animation.toValues).forEach((property) => {
                this[property] = this.animation.fromValues[property] + (this.animation.toValues[property] - this.animation.fromValues[property]) * delta;
            });
            this.animation.draw(delta);
            if (delta < 1) {
                requestAnimationFrame(this.animateTick);
            } else {
                this.animationStart = false;
            }
        }

        animate(draw, duration = 0) {
            const start = performance.now();

            requestAnimationFrame(function animate(time) {
                const delta = Math.min(Math.max((time - start) / duration, 0), 1);
                draw(delta);
                if (delta < 1) {
                    requestAnimationFrame(animate);
                }
            });
        }

        getTop() {
            return this.config.padding.top
        }

        getLeft() {
            return this.config.padding.left
        }

        getRight() {
            return this.config.padding.left + this.canvas.drawableWidth
        }

        getBottom() {
            return this.canvas.height - this.config.padding.bottom
        }

        resize() {
            const { left = 0, top = 0, right = 0, bottom = 0 } = this.config.padding;
            this.canvas.width = this.canvas.clientWidth;
            this.canvas.drawableWidth = this.canvas.clientWidth - left - right;
            this.canvas.drawableHeight = this.canvas.clientWidth * this.config.hToWRatio;
            this.canvas.height = this.canvas.drawableHeight + top + bottom;
            this.initCanvas();
        }
    }

    class Lines extends Drawable {

        constructor(container, lines, config = {}) {
            super(container, config);

            this.drawLine = this.drawLine.bind(this);
            this.handleMouseMove = this.handleMouseMove.bind(this);
            this.handleMouseLeave = this.handleMouseLeave.bind(this);

            this.lines = lines;
            this.ratio = 0;
            this.linesOpacity = {};

            this.animate(this.draw);
        }

        changeBounds(min, max) {
            if (!this.min) {
                this.min = min;
            }
            if (!this.max) {
                this.max = max;
            }
            const ratio = this.canvas.drawableHeight / (max - min);
            this.animateProperties(
                this.draw,
                { min, max, ratio },
                300
            );
        }

        changeRange(left, right) {
            this.left = left;
            this.right = right;
            this.step = this.canvas.drawableWidth / (this.right - this.left);
            this.animate(this.draw);
        }

        draw() {
            this.clear();
            this.lines.forEach(this.drawLine);
        }

        drawLine(line) {
            const lineOpacity = this.linesOpacity[line.name];
            this.context.globalAlpha = isFinite(lineOpacity) ? lineOpacity : 1;
            this.context.strokeStyle = line.color;
            this.context.beginPath();
            this.context.moveTo(this.getLeft(), this.getBottom() - this.ratio * (line.data[this.left] - this.min));
            for (let i = this.left; i <= this.right; i++) {
                this.context.lineTo((i - this.left) * this.step + this.getLeft(), this.getBottom() - this.ratio * (line.data[i] - this.min));
            }
            this.context.stroke();
            this.context.globalAlpha = 1;
        }

        getVisibleLines() {
            return this.lines.filter(line => line.isVisible)
        }

        setLineState(id, state) {
            const targetOpacity = state ? 0 : 1;
            this.animate((delta) => {
                this.linesOpacity[id] = Math.abs(delta - targetOpacity);
                this.draw();
            }, 300);
        }

        onResize() {
            super.resize();
            this.ratio = this.canvas.drawableHeight / (this.max - this.min);
            this.config.paddingBottom = this.min * this.ratio;
            this.step = this.canvas.drawableWidth / (this.right - this.left);
            this.draw();
        }

        handleMouseMove(e) {
            if (e.buttons === 0) {
                const index = Math.round((e.pageX - this.canvas.parentNode.offsetLeft) / this.step + this.left);
                if (index > this.right) {
                    return
                }
                const detail = this.getVisibleLines().reduce((result, line) => {
                    result.lines.push({
                        y: this.getBottom() - Math.round((line.data[index] - this.min) * this.ratio),
                        value: line.data[index],
                        color: line.color,
                        title: line.title
                    });
                    return result
                }, { lines: [], x: (index - this.left) * this.step + this.getLeft(), index, show: true });
                this.notify('toggleDetails', detail);
            }
        }

        handleMouseLeave() {
            this.notify('toggleDetails', { show: false });
        }
    }

    const createContainer = (parent, className = null) => {
        const container = document.createElement('div');
        container.classList.add(className);
        parent.appendChild(container);
        return container
    };

    const formatValue = (value, config = {}) => {
        if (value) {
            return new Intl.DateTimeFormat(config.locale, config.options).format(new Date(value))
        }
        return ''
    };

    class XAxis extends Drawable {

        constructor (container, data, left, right, config = {}) {
            super(container, config);
            this.data = data;
            this.linesCount = config.linesCount;

            this.draw = this.draw.bind(this);
            this.draw2 = this.draw2.bind(this);

            this.ratio = 0;
            this.offset = 0;
            this.changeRange(left, right);
        }

        getDefaultConfig () {
            return {
                textMargin: 16,
                chartPadding: 4
            }
        }

        initCanvas () {
            this.context.fillStyle = 'rgba(150,162,170,0.7)';
            this.context.font = '24px Ubuntu';
            this.context.textAlign = 'center';
        }

        onResize () {
            super.resize();
            this.calculateRatio();
            this.animate(this.draw);
        }

        calculateRatio () {
            this.ratio = this.canvas.drawableWidth / (this.right - this.left);
        }

        draw () {
            this.clear();
            this.context.globalAlpha = this.alpha;
            for (let i = 0; i < this.linesCount; i++) {
                const index = Math.max(Math.floor(this.left + i * this.step), 1);
                const x = i * this.step * this.ratio + this.getLeft();
                this.context.fillText(formatValue(this.data[index], this.config.formatOptions), x, this.getBottom());
            }
            this.context.globalAlpha = 1 - this.alpha;
            for (let i = 0; i < this.linesCount; i++) {
                const index = Math.max(Math.floor(this.left + i * this.oldStep), 1);
                const x = i * this.oldStep * this.ratio + this.getLeft();
                this.context.fillText(formatValue(this.data[index], this.config.formatOptions), x, this.getBottom());
            }
        }

        draw2 () {
            this.clear();
            this.context.globalAlpha = 1;
            for (let i = 0; i < this.linesCount + 1; i++) {
                const index = Math.max(Math.floor(i * this.step + (Math.trunc((this.left + this.offset) / this.step) * this.step)), 1);
                const x = ((i * this.step - (this.left + this.offset) % this.step) * this.ratio + this.getLeft());
                this.context.fillText(formatValue(this.data[index], this.config.formatOptions), x, this.getBottom());
            }
        }

        changeRange (left, right) {
            if (this.left === left && this.right === right) {
                return
            }
            if (right - left === this.right - this.left) {
                this.offset = this.offset - (left - this.left);
                this.left = left;
                this.right = right;
                this.animateProperties(this.draw2, {
                    alpha: 1,
                    offset: 0
                }, 300);
            } else {
                this.oldStep = this.step;
                this.alpha = 0.5;
                this.left = left;
                this.right = right;
                this.step = (right - left) / this.linesCount;
                const newRatio = this.canvas.drawableWidth / (this.right - this.left);

                this.animateProperties(this.draw, {
                    alpha: 1,
                    ratio: newRatio
                }, 300);
            }
        }
    }

    class YAxis extends Drawable {

        constructor (container, min, max, config = {}) {
            super(container, config);
            this.linesCount = config.linesCount;

            this.draw = this.draw.bind(this);

            this.ratio = 0;
            this.changeBounds(min, max);
        }

        getDefaultConfig () {
            return {
                textMargin: 16,
                chartPadding: 4
            }
        }

        initCanvas () {
            this.context.strokeStyle = 'rgba(200,200,200,0.8)';
            this.context.strokeWidth = 2;
            this.context.fillStyle = 'rgba(150,162,170,0.7)';
            this.context.font = '24px Ubuntu';
        }

        onResize () {
            super.resize();
            this.calculateRatio();
            this.animate(this.draw);
        }

        calculateRatio () {
            this.ratio = this.canvas.drawableHeight / (this.max - this.min);
        }

        draw () {
            this.clear();
            this.context.globalAlpha = this.alpha;
            for (let i = 0; i <= this.linesCount; i++) {
                const y = this.getBottom() - i * this.step * this.ratio;
                this.drawLine(y, (Math.floor(this.min + i * this.step)));
            }
            this.context.globalAlpha = 1 - this.alpha;
            for (let i = 0; i <= this.linesCount; i++) {
                const y = this.getBottom() - i * this.oldStep * this.ratio;
                this.drawLine(y, (Math.floor(this.min + i * this.oldStep)));
            }
        }

        drawLine (position, text) {
            this.context.beginPath();
            this.context.moveTo(this.getLeft(), position);
            this.context.lineTo(this.getRight(), position);
            this.context.stroke();
            this.context.fillText(text.toString(), this.getLeft(), position - this.config.textMargin);
        }

        changeBounds (min, max) {
            if (this.min === min && this.max === max) {
                return
            }

            this.oldStep = this.step;

            this.alpha = 0.5;
            this.min = min;
            this.max = max;
            this.step = (max - min) / this.linesCount;

            const newRatio = this.canvas.drawableHeight / (this.max - this.min);

            this.animateProperties(this.draw, {
                alpha: 1,
                ratio: newRatio
            }, 300);
        }
    }

    class Popup {

        constructor (container, config) {
            this.container = container;
            this.config = config;
            this.popup = this.createPopup();
            this.init();
        }

        createPopup () {
            const popup = document.createElement('div');
            popup.classList.add('popup');
            this.container.appendChild(popup);
            return popup
        }

        setConfig (config) {
            this.config = config;
            this.init();
        }

        init () {
            this.popup.innerHTML = `<h2>${this.config.header}</h2>`;
            let popupData = '<div class="popup-data">';
            this.config.lines.forEach((line) => {
                popupData += `<div style="color: ${line.color}"><h5>${line.value}</h5><span>${line.title}</span></div>`;
            });
            this.popup.innerHTML += `${popupData}</div>`;
            this.popup.classList.add('hidden');
            this.popup.style.backgroundColor = getComputedStyle(document.body).getPropertyValue('background-color');
            const x = Math.round(this.config.position.x - this.popup.getBoundingClientRect().width * this.config.ratio);
            const y = this.config.position.y - this.popup.getBoundingClientRect().height;
            this.popup.style.transform = `translate(${x}px, calc(${y}px - 1em))`;
        }

        show () {
            this.popup.classList.add('visible');
        }

        hide () {
            this.popup.classList.remove('visible');
        }
    }

    class Details extends Drawable {

        constructor(container, data, config = {}) {
            super(container, config);

            this.xAxis = data;
            this.popup = new Popup(this.container, { ...this.config, header: '', lines: [], position: { x: 0, y: 0 } });

            this.drawPoint = this.drawPoint.bind(this);
            this.show = this.show.bind(this);
            this.hide = this.hide.bind(this);
            this.toggle = this.toggle.bind(this);
            this.subscribe('toggleDetails', this.toggle);
        }

        show(e) {
            const { x, lines, index } = e.detail;
            this.x = x;
            this.lines = lines;
            this.y = this.getMinY();
            this.index = index;
            this.draw();
        }

        draw() {
            this.clear();
            this.drawLine();
            this.lines.forEach(this.drawPoint);
            this.popup.setConfig({
                ...this.config,
                header: formatValue(this.xAxis[this.index], this.config.formatOptions),
                lines: this.lines,
                ratio: this.x / this.canvas.drawableWidth,
                position: { x: this.x, y: this.y }
            });
            this.popup.show();
        }

        getMinY() {
            return this.lines.reduce((result, line) => {
                return Math.min(result, line.y)
            }, Number.MAX_SAFE_INTEGER)
        }

        hide() {
            this.clear();
            this.popup.hide();
        }

        toggle(e) {
            if (e.detail.show) {
                this.show(e);
            } else {
                this.hide();
            }
        }

        drawLine() {
            this.context.strokeStyle = 'rgba(200,200,200,0.25)';
            this.context.beginPath();
            this.context.moveTo(this.x, 0);
            this.context.lineTo(this.x, this.getBottom());
            this.context.stroke();
        }

        drawPoint(line) {
            const radius = 7;

            this.drawCircle(line.color, this.x, line.y, radius);
            const bgColor = getComputedStyle(document.body).getPropertyValue('background-color');
            this.drawCircle(bgColor, this.x, line.y, radius - this.config.lineWidth);
        }

        drawCircle(color, x, y, radius) {
            this.context.fillStyle = color;
            this.context.beginPath();
            this.context.arc(x, y, radius, 0, 2 * Math.PI);
            this.context.fill();
        }
    }

    class Main {

        constructor(parent, data, config = {}) {
            this.container = createContainer(parent, 'main-chart');
            this.x = data.xAxis;
            this.y = data.yAxis;

            this.left = 1;
            this.right = this.x.length - 1;

            this.recalculateYBounds();

            this.config = Object.assign(Main.DEFAULT_CONFIG, config);

            this.xAxis = new XAxis(this.container, this.x, this.left, this.right, this.config);
            this.yAxis = new YAxis(this.container, this.min, this.max, this.config);

            this.lines = new Lines(this.container, this.y, this.config);
            this.lines.changeBounds(this.min, this.max);
            this.lines.changeRange(this.left, this.right);
            this.lines.subscribe('mousemove', this.lines.handleMouseMove);
            this.lines.subscribe('mouseleave', this.lines.handleMouseLeave);

            this.details = new Details(this.container, this.x, this.config);

            window.addEventListener('resize', this.onResize.bind(this));

            parent.addEventListener('seriaToggle', this.onToggleLine.bind(this), false);
            parent.addEventListener('changeRange', this.onChangeRange.bind(this), false);
        }

        static get DEFAULT_CONFIG() {
            return {
                linesCount: 4,
                hToWRatio: 0.25,
                lineWidth: 3,
                padding: {
                    top: 40,
                    bottom: 20,
                    left: 0,
                    right: 0
                },
                formatOptions: {
                    locale: navigator.language,
                    options: {
                        weekday: 'short', month: 'short', day: 'numeric'
                    }
                }
            }
        }

        onResize() {
            this.xAxis.onResize();
            this.yAxis.onResize();
            this.lines.onResize();
            this.details.resize();
        }

        onChangeRange(e) {
            const { start, end } = e.detail;
            this.left = start;
            this.right = end;
            this.recalculateYBounds();
            this.lines.changeBounds(this.min, this.max);
            this.lines.changeRange(this.left, this.right);
            this.xAxis.changeRange(this.left, this.right);
            this.yAxis.changeBounds(this.min, this.max);
        }

        recalculateYBounds() {
            let max = Number.MIN_SAFE_INTEGER;
            let min = Number.MAX_SAFE_INTEGER;

            this.y.filter((line) => line.isVisible).forEach((line) => {
                for (let i = this.left; i <= this.right; i++) {
                    const value = line.data[i];
                    if (value > max) {
                        max = value;
                    } else if (value < min) {
                        min = value;
                    }
                }
            });

            this.max = max;
            this.min = min;
        }

        onToggleLine(e) {
            const { name, value } = e.detail;
            this.changeVisible(name, value);
            this.recalculateYBounds();
            this.lines.setLineState(name, value);
            this.lines.changeBounds(this.min, this.max);
            this.yAxis.changeBounds(this.min, this.max);
        }

        changeVisible(id, isVisible) {
            for (let i = 0; i < this.y.length; i++) {
                if (this.y[i].name === id) {
                    this.y[i].isVisible = isVisible;
                    break
                }
            }
        }
    }

    class Scope extends Drawable {

        constructor(container, config) {
            super(container, config);

            this.maxX = config.maxX;

            this.initCanvas();

            this.handleMouseMove = this.handleMouseMove.bind(this);
            this.handleMouseDown = this.handleMouseDown.bind(this);
            this.releaseDrag = this.releaseDrag.bind(this);

            this.subscribeToEvents();
            this.draw();
        }

        initCanvas() {
            this.scopeOptions = {
                scopeStart: this.canvas.width / 3,
                scopeEnd: this.canvas.width / 2,
                vStrokeWidth: this.canvas.width / 150,
                canDrag: false,
                shouldDrag: false,
                canResize: false,
                shouldResize: false
            };
            this.scopeOptions.halfVStrokeWidth = this.scopeOptions.vStrokeWidth / 2;
            this.scopeOptions.hStrokeWidth = this.scopeOptions.halfVStrokeWidth / 4;
        }

        draw() {
            this.clear();
            const { scopeStart, scopeEnd, hStrokeWidth, halfVStrokeWidth, vStrokeWidth } = this.scopeOptions;
            this.context.fillStyle = 'rgba(0,0,0,0.1)';
            this.context.fillRect(0, 0, scopeStart, this.canvas.height);

            this.context.strokeStyle = 'rgba(154,211,251,0.337)';
            this.context.beginPath();
            this.context.moveTo(scopeStart, 0);
            this.context.lineWidth = hStrokeWidth;
            this.context.lineTo(scopeEnd - halfVStrokeWidth, 0);
            this.context.lineWidth = vStrokeWidth;
            this.context.lineTo(scopeEnd - halfVStrokeWidth, this.canvas.height);
            this.context.lineWidth = hStrokeWidth;
            this.context.lineTo(scopeStart + halfVStrokeWidth, this.canvas.height);
            this.context.lineWidth = vStrokeWidth;
            this.context.lineTo(scopeStart + halfVStrokeWidth, 0);
            this.context.stroke();

            this.context.fillStyle = 'rgba(0,0,0,0.1)';
            this.context.fillRect(scopeEnd, 0, this.canvas.width, this.canvas.height);

            this.notifyChanges(this.scopeOptions);
        }

        handleMouseDown(e) {
            if (e.button === 0) {
                this.scopeOptions.shouldDrag = this.scopeOptions.canDrag;
                this.scopeOptions.shouldResize = this.scopeOptions.canResize;
                this.scopeOptions.isLeftSide = e.layerX < this.scopeOptions.scopeStart + this.scopeOptions.vStrokeWidth;
                this.scopeOptions.resizeModifier = this.scopeOptions.isLeftSide ? -1 : 1;
            } else {
                this.scopeOptions.shouldDrag = false;
                this.scopeOptions.shouldResize = false;
            }
        }

        shouldDrag(x) {
            const { scopeStart, scopeEnd, vStrokeWidth } = this.scopeOptions;
            return (x > (scopeStart + vStrokeWidth)) && (x < (scopeEnd - vStrokeWidth))
        }

        shouldResize(x) {
            const { scopeStart, scopeEnd } = this.scopeOptions;
            return x > scopeStart && x < scopeEnd
        }

        releaseDrag() {
            this.scopeOptions.shouldDrag = false;
            this.scopeOptions.shouldResize = false;
        }

        handleMouseMove(e) {
            const { shouldDrag, shouldResize, scopeStart, scopeEnd } = this.scopeOptions;
            const mouseX = e.pageX - this.canvas.parentNode.offsetLeft;
            e.preventDefault();
            e.stopPropagation();
            if ((mouseX < 0 && scopeStart === this.getLeft()) || (mouseX >= this.canvas.width && scopeEnd === this.getRight())) {
                return
            }
            this.scopeOptions.canDrag = this.shouldDrag(mouseX);
            this.scopeOptions.canResize = !this.scopeOptions.canDrag && this.shouldResize(mouseX);
            this.canvas.style.cursor = 'auto';
            if (this.scopeOptions.canDrag) {
                this.canvas.style.cursor = 'move';
            }
            if (this.scopeOptions.canResize) {
                this.canvas.style.cursor = 'ew-resize';
            }
            if (shouldDrag && e.movementX) {
                this.drag(e);
            }
            if (shouldResize && e.movementX) {
                this.resizeScope(e);
            }
        }

        drag(e) {
            const { scopeStart, scopeEnd } = this.scopeOptions;
            let newStart = scopeStart + e.movementX;
            let newEnd = scopeEnd + e.movementX;
            if (newStart < 0) {
                newStart = 0;
                newEnd = scopeEnd - scopeStart;
            }
            if (newEnd > this.canvas.width) {
                newEnd = this.canvas.width;
                newStart = newEnd - (scopeEnd - scopeStart);
            }
            if (newStart !== scopeStart && newEnd !== scopeEnd) {
                this.scopeOptions.scopeStart = newStart;
                this.scopeOptions.scopeEnd = newEnd;
                this.draw();
            }
        }

        resizeScope(e) {
            const { resizeModifier, scopeStart, scopeEnd, isLeftSide, vStrokeWidth } = this.scopeOptions;
            let newStart = scopeStart;
            let newEnd = scopeEnd;
            if (isLeftSide) {
                newStart = scopeStart + e.movementX;
                if (newStart < 0) {
                    newStart = 0;
                }
            } else {
                newEnd = scopeEnd + e.movementX * resizeModifier;
                if (newEnd > this.canvas.width) {
                    newEnd = this.canvas.width;
                }
            }
            if ((newStart !== scopeStart || newEnd !== scopeEnd) && newEnd > newStart + vStrokeWidth * 2) {
                this.scopeOptions.scopeStart = newStart;
                this.scopeOptions.scopeEnd = newEnd;
                this.draw();
            }
        }

        notifyChanges(config) {
            const ratio = this.maxX / this.canvas.width;
            this.notify('changeRange', {
                start: Math.floor(1 + ratio * config.scopeStart),
                end: Math.floor(ratio * config.scopeEnd)
            });
        }

        subscribeToEvents() {
            this.subscribe('mousedown', this.handleMouseDown);
            EventAware.subscribeTo(document, 'mousemove', this.handleMouseMove);
            EventAware.subscribeTo(document, 'mouseup', this.releaseDrag);
        }

        onResize() {
            super.resize();
            this.initCanvas();
            this.draw();
        }
    }

    class Selector {

        constructor(parent, data, config = {}) {
            this.container = createContainer(parent, 'main-chart');

            this.x = data.xAxis;
            this.y = data.yAxis;
            this.left = 1;
            this.right = data.xAxis.length - 1;

            this.recalculateYBounds();
            this.config = Object.assign(Selector.DEFAULT_CONFIG, config, { maxX: this.x.length - 1 });

            this.lines = new Lines(this.container, this.y, this.config);
            this.lines.changeBounds(this.min, this.max);
            this.lines.changeRange(this.left, this.right);

            this.scope = new Scope(this.container, this.config);

            window.addEventListener('resize', this.onResize.bind(this));
            parent.addEventListener('seriaToggle', this.onToggleLine.bind(this), false);
        }

        static get DEFAULT_CONFIG() {
            return {
                hToWRatio: 0.05,
                lineWidth: 1,
                padding: {
                    top: 10,
                    bottom: 10,
                    left: 0,
                    right: 0
                }
            }
        }

        onResize() {
            this.scope.onResize();
            this.lines.onResize();
        }

        recalculateYBounds() {
            let max = Number.MIN_SAFE_INTEGER;
            let min = Number.MAX_SAFE_INTEGER;

            this.y.filter((line) => line.isVisible).forEach((line) => {
                for (let i = this.left; i < this.right; i++) {
                    const value = line.data[i];
                    if (value > max) {
                        max = value;
                    } else if (value < min) {
                        min = value;
                    }
                }
            });

            this.max = max;
            this.min = min;
        }

        changeVisible(id, isVisible) {
            for (let i = 0; i < this.y.length; i++) {
                if (this.y[i].name === id) {
                    this.y[i].isVisible = isVisible;
                    break
                }
            }
        }

        onToggleLine(e) {
            const { name, value } = e.detail;
            this.changeVisible(name, value);
            this.recalculateYBounds();
            this.lines.changeBounds(this.min, this.max);
        }
    }

    class GraphControls {

        static createContainer() {
            let container = document.createElement('div');
            container.className = 'control-container';
            return container;
        }

        constructor(container, config = {data: []}) {
            this.container = container;
            this.config = config;
            this.draw = this.draw.bind(this);
            this.createControl = this.createControl.bind(this);
            this.draw();
        }

        draw() {
            const container = GraphControls.createContainer();
            this.config.data.forEach((config) => {
                container.appendChild(this.createControl(config));
            });
            this.container.appendChild(container);
        }

        handleOnToggle(name) {
            return (e) => {
                const event = new CustomEvent('seriaToggle', {
                    detail: {
                        name,
                        value: e.target.checked
                    },
                    bubbles: true,
                    cancelable: true
                });

                this.container.dispatchEvent(event);
            }
        }

        createControl(config = {}) {
            let control = document.createElement('label');
            control.className = 'seria-toggler';
            control.innerHTML = `<input type="checkbox" checked name="${config.name}"/><span class="seria-toggler-checkmark" style="color: ${config.color}"></span>${config.title}`;
            control.onchange = this.handleOnToggle(config.name);
            return control;
        }
    }

    class Chart {

        constructor (container, data, config = {}) {
            this.container = container;
            this.data = data;
            this.config = config;
            this.container.appendChild(this.createTitle());
            this.main = new Main(this.container, this.data, config);
            this.selector = new Selector(this.container, this.data, config);
            this.controls = new GraphControls(this.container, { data: data.yAxis });
        }

        createTitle () {
            let title = document.createElement('h1');
            title.innerText = this.config.header;
            title.classList.add('chart-title');
            return title
        }
    }

    const draw = (container, loadDataPromise, config = {}) => {
        loadDataPromise.then((rawData) => {
            const normalizedData = normalizeChartData(container, rawData);
            new Chart(container, normalizedData, config);
        });
    };

    const normalizeChartData = (container, rawData = {}) => {
        const names = Object.keys(rawData.names);
        return {
                xAxis: rawData.columns.find((column) => names.indexOf(column[0]) === -1),
                yAxis: names.map((name) => ({
                    name,
                    color: rawData.colors[name],
                    title: rawData.names[name],
                    data: rawData.columns.find((column) => column[0] === name),
                    isVisible: true
                }))
        }
    };

    exports.draw = draw;

    return exports;

}({}));
