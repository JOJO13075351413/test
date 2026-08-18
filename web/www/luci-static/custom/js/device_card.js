'use strict';

(function (win) {
    if (!win) {
        return;
    }

    var STYLE_ID = 'ad-ui-device-card-style';

    var STYLE_CSS = [
        ':root {',
        '    --ns-device-card-w: 200px;',
        '}',
        '',
        '.ns-device-row {',
        '    display: flex;',
        '    gap: 12px;',
        '    justify-content: flex-start;',
        '    flex-wrap: wrap;',
        '    margin-bottom: 12px;',
        '}',
        '',
        '.ns-device {',
        '    display: flex;',
        '    justify-content: space-between;',
        '    gap: 12px;',
        '    align-items: center;',
        '    flex: 0 0 var(--ns-device-card-w);',
        '    max-width: var(--ns-device-card-w);',
        '    height: 76px;',
        '    padding: 10px 12px;',
        '    background: #f6f1eb;',
        '    border: 1px solid #e9dfd5;',
        '    border-radius: 8px;',
        '    color: #2e333b;',
        '    cursor: pointer;',
        '    transition: all 0.2s ease;',
        '}',
        '',
        '.ns-device:hover {',
        '    background: #e1d6cc;',
        '    border-color: #f4bc97;',
        '}',
        '',
        '.ns-device.is-offline {',
        '    background: #e9dfd5;',
        '    border-color: #fdf8f3;',
        '}',
        '',
        '.ns-device-left {',
        '    display: flex;',
        '    flex-direction: column;',
        '    gap: 6px;',
        '    flex: 1 1 auto;',
        '    min-width: 0;',
        '}',
        '',
        '.ns-dev-id {',
        '    display: inline-flex;',
        '    align-items: center;',
        '    gap: 4px;',
        '    font-size: 13px;',
        '    font-weight: 500;',
        '}',
        '',
        '.ns-device .dev-dot {',
        '    width: 6px;',
        '    height: 6px;',
        '    border-radius: 50%;',
        '    display: inline-block;',
        '    background: #968a80;',
        '    box-shadow: 0 0 0 1px rgba(237, 116, 29, .05);',
        '}',
        '',
        '.ns-device.is-online .dev-dot {',
        '    background: #0dff00;',
        '}',
        '',
        '.ns-device.is-offline .dev-dot {',
        '    background: #968a80;',
        '}',
        '',
        '.ns-dev-ip {',
        '    display: flex;',
        '    flex-direction: column;',
        '    line-height: 1.2;',
        '    gap: 2px;',
        '}',
        '',
        '.ns-dev-ip .ip-label {',
        '    font-size: 10px;',
        '    color: #968a80;',
        '    opacity: .8;',
        '}',
        '',
        '.ns-dev-ip .ip-val {',
        '    font-size: 11px;',
        '    color: #3d434c;',
        '    white-space: nowrap;',
        '    overflow: hidden;',
        '    text-overflow: ellipsis;',
        '}',
        '',
        '.ns-device-right {',
        '    width: 46px;',
        '    flex: 0 0 46px;',
        '    margin-left: auto;',
        '    display: flex;',
        '    align-items: center;',
        '    justify-content: center;',
        '}',
        '',
        '.ns-device-right img {',
        '    max-height: 36px;',
        '    max-width: 100%;',
        '    opacity: .9;',
        '}'
    ].join('\n');

    function ensureStyles() {
        var doc = win.document;
        if (!doc) {
            return;
        }
        if (doc.getElementById(STYLE_ID)) {
            return;
        }
        var style = doc.createElement('style');
        style.id = STYLE_ID;
        style.type = 'text/css';
        style.textContent = STYLE_CSS;
        (doc.head || doc.documentElement).appendChild(style);
    }

    function createEl(tag, attrs, children) {
        var el = document.createElement(tag);
        var a = attrs || {};
        Object.keys(a).forEach(function (k) {
            var v = a[k];
            if (v == null) {
                return;
            }
            if (k === 'class') {
                el.className = String(v);
            } else if (k === 'click' && typeof v === 'function') {
                el.addEventListener('click', v);
            } else {
                el.setAttribute(k, String(v));
            }
        });

        (children || []).forEach(function (ch) {
            if (ch == null) {
                return;
            }
            if (typeof ch === 'string') {
                el.appendChild(document.createTextNode(ch));
            } else {
                el.appendChild(ch);
            }
        });

        return el;
    }

    function createDeviceCardRow(opts) {
        ensureStyles();
        opts = opts || {};

        var t = (typeof opts.translate === 'function') ? opts.translate : function (s) { return s; };
        var devices = Array.isArray(opts.devices) ? opts.devices.slice() : [];
        var activeIndex = (typeof opts.activeIndex === 'number') ? opts.activeIndex : 0;

        var iconOn = '/luci-static/custom/img/ad-dev-on.png';
        var iconOff = '/luci-static/custom/img/ad-dev-off.png';
        var root = createEl('div', { 'class': 'ns-device-row' });

        function isOnline(item) {
            return !!(item && item.online === true);
        }

        function pickIcon(item) {
            return isOnline(item) ? iconOn : iconOff;
        }

        function buildCard(item, idx) {
            var img = createEl('img', { alt: '', src: pickIcon(item) });

            var card = createEl('div', {
                'class': 'ns-device' + ' ' + (item && item.online ? 'is-online' : 'is-offline')
            }, [
                createEl('div', { 'class': 'ns-device-left' }, [
                    createEl('div', { 'class': 'ns-dev-id' }, [
                        createEl('span', { 'class': 'dev-dot' }),
                        t((item && item.title) ? item.title : '—')
                    ]),
                    createEl('div', { 'class': 'ns-dev-ip' }, [
                        createEl('div', { 'class': 'ip-label' }, [t('IP:')]),
                        createEl('div', { 'class': 'ip-val' }, [(item && item.ip) ? item.ip : '—'])
                    ])
                ]),
                createEl('div', { 'class': 'ns-device-right' }, [img])
            ]);

            card.addEventListener('click', function () {
                setActiveIndex(idx);
            });

            card.__img = img;
            return card;
        }

        function render() {
            root.innerHTML = '';
            devices.forEach(function (d, i) {
                var card = buildCard(d || {}, i);
                if (i === activeIndex) {
                    card.classList.add('active');
                }
                root.appendChild(card);
            });
        }

        function refreshActiveState() {
            var cards = root.querySelectorAll('.ns-device');
            cards.forEach(function (el, idx) {
                if (idx === activeIndex) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
                if (el.__img) {
                    el.__img.src = pickIcon(devices[idx]);
                }
            });
        }

        function setDevices(next) {
            devices = Array.isArray(next) ? next.slice() : [];
            if (activeIndex >= devices.length) {
                activeIndex = devices.length > 0 ? 0 : -1;
            }
            render();
        }

        function setActiveIndex(idx) {
            var n = parseInt(idx, 10);
            if (isNaN(n) || n < 0 || n >= devices.length) {
                n = 0;
            }
            activeIndex = n;
            refreshActiveState();
        }

        render();

        return {
            root: root,
            setDevices: setDevices,
            setActiveIndex: setActiveIndex,
            getActiveIndex: function () {
                return activeIndex;
            },
            refresh: refreshActiveState
        };
    }

    win.adUiDeviceCard = {
        createDeviceCardRow: createDeviceCardRow
    };
})(window);
