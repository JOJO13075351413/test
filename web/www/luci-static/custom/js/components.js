'use strict';

/*
 * Usage:
 *   var dd = window.adComponents.createSingleSelect({
 *       options: [{ value: 'a', label: 'A' }],
 *       value: 'a',
 *       placeholder: '请选择',
 *       styleVars: {
 *           '--adui-ss-min-width': '120px',
 *           '--adui-ss-arrow-color': '#968a80'
 *       }
 *   });
 *   container.appendChild(dd.root);
 */
(function (win) {
    if (!win) {
        return;
    }

    var STYLE_ID = 'ad-ui-components-style';
    var STYLE_CSS = [
        '.adui-ss {',
        '    --adui-ss-min-width: 180px;',
        '    --adui-ss-control-height: 32px;',
        '    --adui-ss-bg: #ffffff;',
        '    --adui-ss-border: #e9dfd5;',
        '    --adui-ss-focus-border: #ed741d;',
        '    --adui-ss-focus-shadow: rgba(77, 144, 255, .18);',
        '    --adui-ss-text: #3d434c;',
        '    --adui-ss-placeholder: #8b7b6e;',
        '    --adui-ss-arrow-color: #968a80;',
        '    --adui-ss-arrow-top-closed: 48%;',
        '    --adui-ss-arrow-top-open: 52%;',
        '    --adui-ss-arrow-shift-closed: -70%;',
        '    --adui-ss-arrow-shift-open: -50%;',
        '    --adui-ss-radius: 6px;',
        '    --adui-ss-font-size: 13px;',
        '    --adui-ss-height: 24px;',
        '    --adui-ss-menu-bg: #ffffff;',
        '    --adui-ss-menu-border: #e9dfd5;',
        '    --adui-ss-menu-text: #3d434c;',
        '    --adui-ss-menu-hover-bg: #fff4ec;',
        '    --adui-ss-menu-selected-bg: #ffe3cd;',
        '    --adui-ss-menu-divider: rgba(237, 116, 29, .15);',
        '    position: relative;',
        '    display: inline-block;',
        '    width: auto;',
        '    min-width: var(--adui-ss-min-width);',
        '    min-height: var(--adui-ss-control-height);',
        '    cursor: pointer;',
        '    background: var(--adui-ss-bg);',
        '    border: 1px solid var(--adui-ss-border);',
        '    border-radius: var(--adui-ss-radius);',
        '    padding: 0 8px;',
        '    box-sizing: border-box;',
        '    display: flex;',
        '    align-items: center;',
        '}',
        '',
        '.adui-ss:focus {',
        '    outline: none;',
        '    border-color: var(--adui-ss-focus-border);',
        '    box-shadow: 0 0 0 2px var(--adui-ss-focus-shadow);',
        '}',
        '',
        '.adui-ss.ns-invalid,',
        '.adui-ss.is-invalid {',
        '    border-color: #ec4343 !important;',
        '    box-shadow: 0 0 0 2px rgba(236, 67, 67, .18);',
        '}',
        '',
        '.adui-ss.is-disabled {',
        '    cursor: not-allowed;',
        '    opacity: .6;',
        '}',
        '',
        '.adui-ss.is-disabled .adui-ss-display,',
        '.adui-ss.is-disabled .adui-ss-arrow {',
        '    cursor: not-allowed;',
        '}',
        '',
        '.adui-ss-display {',
        '    color: var(--adui-ss-text);',
        '    font-size: var(--adui-ss-font-size);',
        '    padding: 0 6px;',
        '    min-height: calc(var(--adui-ss-control-height) - 2px);',
        '    line-height: calc(var(--adui-ss-control-height) - 2px);',
        '    white-space: nowrap;',
        '    overflow: hidden;',
        '    text-overflow: ellipsis;',
        '    padding-right: 18px;',
        '    width: 100%;',
        '}',
        '',
        '.adui-ss-display.is-placeholder {',
        '    color: var(--adui-ss-placeholder);',
        '}',
        '',
        '.adui-ss-arrow {',
        '    position: absolute;',
        '    right: 8px;',
        '    top: var(--adui-ss-arrow-top-closed);',
        '    width: 8px;',
        '    height: 8px;',
        '    transform: translateY(var(--adui-ss-arrow-shift-closed)) rotate(45deg);',
        '    border-right: 1.5px solid var(--adui-ss-arrow-color);',
        '    border-bottom: 1.5px solid var(--adui-ss-arrow-color);',
        '    box-sizing: border-box;',
        '    pointer-events: none;',
        '}',
        '',
        '.adui-ss.is-open .adui-ss-arrow {',
        '    top: var(--adui-ss-arrow-top-open);',
        '    transform: translateY(var(--adui-ss-arrow-shift-open)) rotate(-135deg);',
        '}',
        '',
        '.adui-ss-menu {',
        '    --adui-ss-menu-divider: rgba(237, 116, 29, .15);',
        '    position: fixed;',
        '    z-index: 100000;',
        '    max-height: 220px;',
        '    overflow: auto;',
        '    background: var(--adui-ss-menu-bg);',
        '    border: 1px solid var(--adui-ss-menu-border);',
        '    border-radius: 8px;',
        '    padding: 6px;',
        '    color: var(--adui-ss-menu-text);',
        '    box-shadow: 0 8px 18px rgba(0, 0, 0, .35);',
        '    scrollbar-width: thin;',
        '    scrollbar-color: var(--adui-ss-menu-border) #f0e9e1;',
        '}',
        '',
        '.adui-ss-menu::-webkit-scrollbar {',
        '    width: 8px;',
        '}',
        '',
        '.adui-ss-menu::-webkit-scrollbar-track {',
        '    background: #f0e9e1;',
        '}',
        '',
        '.adui-ss-menu::-webkit-scrollbar-thumb {',
        '    background: var(--adui-ss-menu-border);',
        '}',
        '',
        '.adui-ss-opt {',
        '    padding: 6px 8px;',
        '    border-radius: 6px;',
        '    border-bottom: 1px solid var(--adui-ss-menu-divider, rgba(237, 116, 29, .15));',
        '    cursor: pointer;',
        '    user-select: none;',
        '}',
        '',
        '.adui-ss-opt:last-child {',
        '    border-bottom-color: transparent;',
        '}',
        '',
        '.adui-ss-opt:hover {',
        '    background: var(--adui-ss-menu-hover-bg);',
        '}',
        '',
        '.adui-ss-opt.is-selected {',
        '    background: var(--adui-ss-menu-selected-bg, #ffe3cd);',
        '}',
        '',
        '.adui-ss-opt.is-selected:hover {',
        '    background: var(--adui-ss-menu-selected-bg, #ffe3cd);',
        '}',
        '',
        '.adui-msi {',
        '    --adui-msi-bg: #ffffff;',
        '    --adui-msi-border: #e9dfd5;',
        '    --adui-msi-focus: #ed741d;',
        '    --adui-msi-text: #3d434c;',
        '    --adui-msi-sep: #968a80;',
        '    display: inline-flex;',
        '    align-items: center;',
        '    gap: 4px;',
        '    min-height: 32px;',
        '    flex-wrap: nowrap;',
        '    background: var(--adui-msi-bg);',
        '    border: 1px solid var(--adui-msi-border);',
        '    border-radius: 6px;',
        '    padding: 0 8px;',
        '    box-sizing: border-box;',
        '}',
        '',
        '.adui-msi.is-disabled {',
        '    opacity: .6;',
        '    cursor: not-allowed;',
        '}',
        '',
        '.adui-msi-slot {',
        '    width: 52px;',
        '    height: 30px;',
        '    border: 0;',
        '    border-radius: 4px;',
        '    background: transparent;',
        '    color: var(--adui-msi-text);',
        '    text-align: center;',
        '    padding: 0 4px;',
        '    box-sizing: border-box;',
        '    box-shadow: none;',
        '    outline: none;',
        '    transition: none;',
        '    caret-color: var(--adui-msi-text);',
        '}',
        '',
        '.adui-msi-slot:focus,',
        '.adui-msi-slot:focus-visible {',
        '    outline: none !important;',
        '    box-shadow: none !important;',
        '    border-color: transparent !important;',
        '    background: transparent !important;',
        '}',
        '',
        '.adui-msi-sep {',
        '    color: var(--adui-msi-sep);',
        '    font-weight: 600;',
        '    user-select: none;',
        '}',
        '',
        '.adui-ms {',
        '    --adui-ms-min-width: 180px;',
        '    --adui-ms-bg: #ffffff;',
        '    --adui-ms-border: #e9dfd5;',
        '    --adui-ms-text: #3d434c;',
        '    --adui-ms-placeholder: #968a80;',
        '    --adui-ms-arrow-color: #968a80;',
        '    --adui-ms-chip-bg: #fff4ec;',
        '    --adui-ms-chip-text: #3d434c;',
        '    --adui-ms-chip-border: #e9dfd5;',
        '    --adui-ms-menu-bg: #ffffff;',
        '    --adui-ms-menu-border: #e9dfd5;',
        '    --adui-ms-menu-text: #3d434c;',
        '    --adui-ms-menu-hover-bg: #fff4ec;',
        '    --adui-ms-menu-divider: rgba(237, 116, 29, .15);',
        '    --adui-ms-box-border: #e9dfd5;',
        '    --adui-ms-box-bg: #ffffff;',
        '    --adui-ms-box-checked: #ed741d;',
        '    --adui-ms-arrow-top-closed: 48%;',
        '    --adui-ms-arrow-top-open: 52%;',
        '    --adui-ms-arrow-shift-closed: -70%;',
        '    --adui-ms-arrow-shift-open: -50%;',
        '    position: relative;',
        '    display: inline-block;',
        '    width: auto;',
        '    min-width: var(--adui-ms-min-width);',
        '    background: var(--adui-ms-bg);',
        '    border: 1px solid var(--adui-ms-border);',
        '    border-radius: 6px;',
        '    padding: 4px 6px;',
        '    color: var(--adui-ms-text);',
        '    cursor: pointer;',
        '    box-sizing: border-box;',
        '}',
        '',
        '.adui-ms.ns-invalid,',
        '.adui-ms.is-invalid {',
        '    border-color: #ec4343 !important;',
        '    box-shadow: 0 0 0 2px rgba(236, 67, 67, .18);',
        '}',
        '',
        '.adui-ms.is-disabled {',
        '    opacity: .6;',
        '    cursor: not-allowed;',
        '}',
        '',
        '.adui-ms-chips {',
        '    display: flex;',
        '    flex-wrap: wrap;',
        '    gap: 6px;',
        '    align-items: center;',
        '    min-height: 24px;',
        '    padding-right: 18px;',
        '}',
        '',
        '.adui-ms-placeholder {',
        '    color: var(--adui-ms-placeholder);',
        '    font-size: 13px;',
        '    padding: 2px 2px;',
        '    min-height: 24px;',
        '    line-height: 24px;',
        '    padding-right: 18px;',
        '}',
        '',
        '.adui-ms-arrow {',
        '    position: absolute;',
        '    right: 8px;',
        '    top: var(--adui-ms-arrow-top-closed);',
        '    width: 8px;',
        '    height: 8px;',
        '    transform: translateY(var(--adui-ms-arrow-shift-closed)) rotate(45deg);',
        '    border-right: 1.5px solid var(--adui-ms-arrow-color);',
        '    border-bottom: 1.5px solid var(--adui-ms-arrow-color);',
        '    box-sizing: border-box;',
        '    pointer-events: none;',
        '}',
        '',
        '.adui-ms.is-open .adui-ms-arrow {',
        '    top: var(--adui-ms-arrow-top-open);',
        '    transform: translateY(var(--adui-ms-arrow-shift-open)) rotate(-135deg);',
        '}',
        '',
        '.adui-ms-chip {',
        '    display: inline-flex;',
        '    align-items: center;',
        '    gap: 6px;',
        '    padding: 2px 8px;',
        '    border-radius: 999px;',
        '    background: var(--adui-ms-chip-bg);',
        '    color: var(--adui-ms-chip-text);',
        '    font-size: 12px;',
        '    border: 1px solid var(--adui-ms-chip-border);',
        '    user-select: none;',
        '}',
        '',
        '.adui-ms-chip-x {',
        '    width: 14px;',
        '    height: 14px;',
        '    background: center/12px 12px no-repeat url(\'/luci-static/custom/img/close-btn.svg\');',
        '    cursor: pointer;',
        '    opacity: .8;',
        '    transition: opacity .2s;',
        '}',
        '',
        '.adui-ms-chip-x:hover {',
        '    opacity: 1;',
        '}',
        '',
        '.adui-ms-menu {',
        '    --adui-ms-menu-divider: rgba(237, 116, 29, .15);',
        '    position: absolute;',
        '    left: 0;',
        '    right: 0;',
        '    top: calc(100% + 6px);',
        '    background: var(--adui-ms-menu-bg);',
        '    border: 1px solid var(--adui-ms-menu-border);',
        '    border-radius: 8px;',
        '    padding: 6px;',
        '    display: none;',
        '    max-height: 220px;',
        '    overflow: auto;',
        '    z-index: 10010;',
        '    color: var(--adui-ms-menu-text);',
        '    scrollbar-width: thin;',
        '    scrollbar-color: var(--adui-ms-menu-border) #f0e9e1;',
        '}',
        '',
        '.adui-ms.is-open .adui-ms-menu {',
        '    display: block;',
        '}',
        '',
        '.adui-ms-menu::-webkit-scrollbar {',
        '    width: 8px;',
        '    height: 8px;',
        '}',
        '',
        '.adui-ms-menu::-webkit-scrollbar-track {',
        '    background: #f0e9e1;',
        '    border-radius: 4px;',
        '}',
        '',
        '.adui-ms-menu::-webkit-scrollbar-thumb {',
        '    background: var(--adui-ms-menu-border);',
        '    border-radius: 4px;',
        '}',
        '',
        '.adui-ms-opt {',
        '    display: flex;',
        '    align-items: center;',
        '    gap: 8px;',
        '    padding: 6px 8px;',
        '    border-radius: 6px;',
        '    border-bottom: 1px solid var(--adui-ms-menu-divider, rgba(237, 116, 29, .15));',
        '    cursor: pointer;',
        '}',
        '',
        '.adui-ms-opt:last-child {',
        '    border-bottom-color: transparent;',
        '}',
        '',
        '.adui-ms-opt:hover {',
        '    background: var(--adui-ms-menu-hover-bg);',
        '}',
        '',
        '.adui-ms-box {',
        '    width: 14px;',
        '    height: 14px;',
        '    border: 1px solid var(--adui-ms-box-border);',
        '    border-radius: 3px;',
        '    background: var(--adui-ms-box-bg);',
        '    display: inline-block;',
        '    flex: 0 0 auto;',
        '}',
        '',
        '.adui-ms-opt.is-selected .adui-ms-box {',
        '    background: var(--adui-ms-box-checked);',
        '    border-color: var(--adui-ms-box-checked);',
        '}'
    ].join('\n');

    function ensureStyles() {
        var doc = win.document;
        if (!doc || doc.getElementById(STYLE_ID)) {
            return;
        }
        var style = doc.createElement('style');
        style.id = STYLE_ID;
        style.type = 'text/css';
        style.textContent = STYLE_CSS;
        (doc.head || doc.documentElement).appendChild(style);
    }

    var shared = win.adComponents || {};
    var activeSingleSelect = null;

    function toOptions(input) {
        if (!Array.isArray(input)) {
            return [];
        }

        return input.map(function (item) {
            var o = item || {};
            var value = (o.value != null) ? String(o.value) : '';
            var label = (o.label != null) ? String(o.label) : value;
            return {
                value: value,
                label: label
            };
        });
    }

    function findLabel(options, val) {
        var v = String(val || '');
        for (var i = 0; i < options.length; i++) {
            if (String(options[i].value) === v) {
                return options[i].label;
            }
        }
        return v;
    }

    function applyStyleVars(root, vars) {
        if (!root || !vars || typeof vars !== 'object') {
            return;
        }
        Object.keys(vars).forEach(function (k) {
            if (!k) {
                return;
            }
            var v = vars[k];
            if (v == null) {
                return;
            }
            root.style.setProperty(String(k), String(v));
        });
    }

    function createSingleSelect(config) {
        ensureStyles();
        config = config || {};

        var options = toOptions(config.options);
        var value = (config.value != null) ? String(config.value) : '';
        var placeholder = (config.placeholder != null) ? String(config.placeholder) :
            _('请选择');
        var disabled = !!config.disabled;

        var root = document.createElement('div');
        root.className = 'adui-ss adui-single-select';
        if (config.className) {
            root.className += ' ' + String(config.className);
        }
        root.setAttribute('role', 'combobox');
        root.setAttribute('aria-expanded', 'false');
        root.tabIndex = 0;

        var display = document.createElement('div');
        display.className = 'adui-ss-display';

        var arrow = document.createElement('div');
        arrow.className = 'adui-ss-arrow';

        root.appendChild(display);
        root.appendChild(arrow);

        if (config.minWidth != null && config.minWidth !== '') {
            root.style.setProperty('--adui-ss-min-width', String(config.minWidth));
        }
        applyStyleVars(root, config.styleVars);

        var portal = null;
        var portalOpen = false;
        var onChange = null;

        function syncPortalVars(menu) {
            if (!menu) {
                return;
            }
            var keys = [
                '--adui-ss-menu-bg',
                '--adui-ss-menu-border',
                '--adui-ss-menu-text',
                '--adui-ss-menu-hover-bg',
                '--adui-ss-menu-selected-bg',
                '--adui-ss-menu-divider'
            ];
            keys.forEach(function (k) {
                var val = win.getComputedStyle(root).getPropertyValue(k);
                if (val) {
                    menu.style.setProperty(k, val.trim());
                }
            });
        }

        function renderDisplay() {
            if (!value) {
                display.textContent = placeholder;
                display.classList.add('is-placeholder');
            } else {
                display.textContent = findLabel(options, value);
                display.classList.remove('is-placeholder');
            }
        }

        function positionMenu() {
            if (!portalOpen || !portal) {
                return;
            }

            var r = root.getBoundingClientRect();
            portal.style.left = r.left + 'px';
            portal.style.top = (r.bottom + 4) + 'px';
            portal.style.minWidth = r.width + 'px';
        }

        function detachEvents() {
            document.removeEventListener('click', handleDocumentClick, true);
            window.removeEventListener('resize', positionMenu);
            window.removeEventListener('scroll', positionMenu, true);
        }

        function closeMenu() {
            if (!portalOpen) {
                return;
            }

            portalOpen = false;
            root.classList.remove('is-open');
            root.setAttribute('aria-expanded', 'false');

            if (portal && portal.parentNode) {
                portal.parentNode.removeChild(portal);
            }
            portal = null;
            detachEvents();

            if (activeSingleSelect === api) {
                activeSingleSelect = null;
            }
        }

        function handleDocumentClick(ev) {
            if (!root.contains(ev.target) && (!portal || !portal.contains(ev.target))) {
                closeMenu();
            }
        }

        function set(next, silent) {
            value = (next != null) ? String(next) : '';
            renderDisplay();

            if (!silent && typeof onChange === 'function') {
                onChange(value);
            }
        }

        function openMenu() {
            if (disabled) {
                return;
            }

            if (portalOpen) {
                closeMenu();
                return;
            }

            if (activeSingleSelect && activeSingleSelect !== api && typeof activeSingleSelect._closeFromOutside === 'function') {
                activeSingleSelect._closeFromOutside();
            }

            portal = document.createElement('div');
            portal.className = 'adui-ss-menu';
            syncPortalVars(portal);

            options.forEach(function (opt) {
                var optEl = document.createElement('div');
                optEl.className = 'adui-ss-opt' + (String(opt.value) === value ? ' is-selected' : '');
                optEl.textContent = opt.label;
                optEl.onclick = function () {
                    set(opt.value);
                    closeMenu();
                };
                portal.appendChild(optEl);
            });

            document.body.appendChild(portal);
            portalOpen = true;
            root.classList.add('is-open');
            root.setAttribute('aria-expanded', 'true');
            activeSingleSelect = api;

            positionMenu();
            document.addEventListener('click', handleDocumentClick, true);
            window.addEventListener('resize', positionMenu);
            window.addEventListener('scroll', positionMenu, true);
        }

        function setOptions(newOptions) {
            options = toOptions(newOptions);

            var has = false;
            for (var i = 0; i < options.length; i++) {
                if (String(options[i].value) === value) {
                    has = true;
                    break;
                }
            }

            if (!has) {
                value = '';
            }

            if (portalOpen) {
                closeMenu();
            }

            renderDisplay();
        }

        function setDisabled(flag) {
            disabled = !!flag;
            root.classList.toggle('is-disabled', disabled);
            if (disabled && portalOpen) {
                closeMenu();
            }
        }

        function onKeyDown(ev) {
            if (disabled) {
                return;
            }

            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                openMenu();
                return;
            }

            if (ev.key === 'Escape') {
                closeMenu();
            }
        }

        root.addEventListener('click', function (ev) {
            ev.stopPropagation();
            openMenu();
        });

        root.addEventListener('keydown', onKeyDown);

        var api = {
            root: root,
            get: function () {
                return value;
            },
            set: set,
            setOptions: setOptions,
            setDisabled: setDisabled,
            onChange: function (fn) {
                onChange = (typeof fn === 'function') ? fn : null;
            },
            close: closeMenu,
            destroy: function () {
                closeMenu();
                root.removeEventListener('keydown', onKeyDown);
            },
            _closeFromOutside: closeMenu
        };

        setDisabled(disabled);
        if (value && findLabel(options, value) === value && !options.some(function (it) { return it.value === value; })) {
            value = '';
        }
        renderDisplay();

        return api;
    }

    function createMultiSelect(config) {
        ensureStyles();
        config = config || {};

        var options = toOptions(config.options);
        var placeholder = (config.placeholder != null) ? String(config.placeholder) :
            _('请选择');
        var disabled = !!config.disabled;
        var closeOnSelect = !!config.closeOnSelect;
        var valueSet = {};

        function toValueArray(input) {
            if (!Array.isArray(input)) {
                return [];
            }
            return input.map(function (v) { return String(v); });
        }

        function setFromArray(arr) {
            valueSet = {};
            toValueArray(arr).forEach(function (v) {
                valueSet[v] = true;
            });
        }

        setFromArray(config.values || config.value || []);

        var root = document.createElement('div');
        root.className = 'adui-ms adui-multi-select';
        if (config.className) {
            root.className += ' ' + String(config.className);
        }
        root.setAttribute('role', 'listbox');
        root.setAttribute('aria-multiselectable', 'true');
        root.setAttribute('aria-expanded', 'false');
        root.tabIndex = 0;

        var chips = document.createElement('div');
        chips.className = 'adui-ms-chips';
        var placeholderEl = document.createElement('div');
        placeholderEl.className = 'adui-ms-placeholder';
        placeholderEl.textContent = placeholder;
        var arrow = document.createElement('div');
        arrow.className = 'adui-ms-arrow';
        var menu = document.createElement('div');
        menu.className = 'adui-ms-menu';

        root.appendChild(chips);
        root.appendChild(placeholderEl);
        root.appendChild(arrow);
        root.appendChild(menu);

        if (config.minWidth != null && config.minWidth !== '') {
            root.style.setProperty('--adui-ms-min-width', String(config.minWidth));
        }
        applyStyleVars(root, config.styleVars);

        var open = false;
        var onChange = null;

        function selectedValues() {
            return Object.keys(valueSet).filter(function (k) { return !!valueSet[k]; });
        }

        function isSelected(v) {
            return !!valueSet[String(v)];
        }

        function emitChange() {
            if (typeof onChange === 'function') {
                onChange(selectedValues());
            }
        }

        function renderChips() {
            chips.innerHTML = '';
            var vals = selectedValues();
            if (!vals.length) {
                chips.style.display = 'none';
                placeholderEl.style.display = '';
                return;
            }
            chips.style.display = '';
            placeholderEl.style.display = 'none';

            vals.forEach(function (v) {
                var label = findLabel(options, v);
                var chip = document.createElement('span');
                chip.className = 'adui-ms-chip';
                chip.appendChild(document.createTextNode(label));
                var x = document.createElement('span');
                x.className = 'adui-ms-chip-x';
                x.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    if (disabled) {
                        return;
                    }
                    delete valueSet[v];
                    renderChips();
                    renderMenu();
                    emitChange();
                });
                chip.appendChild(x);
                chips.appendChild(chip);
            });
        }

        function renderMenu() {
            menu.innerHTML = '';
            options.forEach(function (opt) {
                var v = String(opt.value);
                var selected = isSelected(v);
                var optEl = document.createElement('div');
                optEl.className = 'adui-ms-opt' + (selected ? ' is-selected' : '');
                var box = document.createElement('span');
                box.className = 'adui-ms-box';
                var txt = document.createElement('span');
                txt.textContent = opt.label;
                optEl.appendChild(box);
                optEl.appendChild(txt);
                optEl.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    if (disabled) {
                        return;
                    }
                    if (isSelected(v)) {
                        delete valueSet[v];
                    } else {
                        valueSet[v] = true;
                    }
                    renderChips();
                    renderMenu();
                    emitChange();
                    if (closeOnSelect) {
                        closeMenu();
                    }
                });
                menu.appendChild(optEl);
            });
        }

        function openMenu() {
            if (disabled) {
                return;
            }
            open = true;
            root.classList.add('is-open');
            root.setAttribute('aria-expanded', 'true');
        }

        function closeMenu() {
            open = false;
            root.classList.remove('is-open');
            root.setAttribute('aria-expanded', 'false');
        }

        function handleDocumentClick(ev) {
            if (!root.contains(ev.target) && open) {
                closeMenu();
            }
        }

        root.addEventListener('click', function (ev) {
            ev.stopPropagation();
            if (open) {
                closeMenu();
            } else {
                openMenu();
            }
        });

        document.addEventListener('click', handleDocumentClick, true);

        function setOptions(newOptions) {
            options = toOptions(newOptions);
            var valid = {};
            options.forEach(function (o) { valid[String(o.value)] = true; });
            selectedValues().forEach(function (v) {
                if (!valid[v]) {
                    delete valueSet[v];
                }
            });
            renderChips();
            renderMenu();
        }

        function setDisabled(flag) {
            disabled = !!flag;
            root.classList.toggle('is-disabled', disabled);
            if (disabled) {
                closeMenu();
            }
        }

        function setValues(nextValues, silent) {
            setFromArray(nextValues);
            renderChips();
            renderMenu();
            if (!silent) {
                emitChange();
            }
        }

        renderChips();
        renderMenu();
        setDisabled(disabled);

        return {
            root: root,
            getValues: function () {
                return selectedValues();
            },
            setValues: setValues,
            setOptions: setOptions,
            setDisabled: setDisabled,
            onChange: function (fn) {
                onChange = (typeof fn === 'function') ? fn : null;
            },
            close: closeMenu,
            destroy: function () {
                closeMenu();
                document.removeEventListener('click', handleDocumentClick, true);
            }
        };
    }

    function createMultiSlotInput(config) {
        ensureStyles();
        config = config || {};

        var segCount = parseInt(config.segments, 10);
        if (isNaN(segCount) || segCount < 1) {
            segCount = 1;
        }

        var separators = Array.isArray(config.separators) ? config.separators.slice() : [];
        if (!separators.length && typeof config.separators === 'string' && config.separators) {
            separators = [config.separators];
        }

        function getSeparatorAt(idx) {
            if (!separators.length) {
                return '';
            }
            if (idx < separators.length) {
                return String(separators[idx] || '');
            }
            return String(separators[separators.length - 1] || '');
        }

        function getRule(arrOrVal, idx, dft) {
            if (Array.isArray(arrOrVal)) {
                return arrOrVal[idx] != null ? arrOrVal[idx] : dft;
            }
            return arrOrVal != null ? arrOrVal : dft;
        }

        function trimByLength(text, maxLen) {
            var s = String(text == null ? '' : text);
            var n = parseInt(maxLen, 10);
            if (!isNaN(n) && n > 0 && s.length > n) {
                return s.slice(0, n);
            }
            return s;
        }

        function sanitizeByPattern(text, pattern) {
            var s = String(text == null ? '' : text);
            if (!pattern) {
                return s;
            }

            if (typeof pattern === 'function') {
                return String(pattern(s));
            }

            if (pattern instanceof RegExp) {
                var out = '';
                for (var i = 0; i < s.length; i++) {
                    var ch = s.charAt(i);
                    pattern.lastIndex = 0;
                    if (pattern.test(ch)) {
                        out += ch;
                    }
                }
                return out;
            }

            return s;
        }

        var root = document.createElement('div');
        root.className = 'adui-msi';
        if (config.className) {
            root.className += ' ' + String(config.className);
        }
        applyStyleVars(root, config.styleVars);

        var slots = [];
        var onChange = null;
        var disabled = !!config.disabled;
        var separatorsChars = {};
        var i;

        for (i = 0; i < segCount - 1; i++) {
            var sep = getSeparatorAt(i);
            if (sep) {
                separatorsChars[sep] = true;
            }
        }

        function emitChange() {
            if (typeof onChange === 'function') {
                onChange({
                    value: api.get(),
                    segments: api.getSegments()
                });
            }
        }

        function setSlotValue(idx, raw) {
            var maxLen = getRule(config.maxLengths, idx, config.maxLength);
            var pattern = getRule(config.patterns, idx, config.pattern);
            var val = sanitizeByPattern(raw, pattern);
            val = trimByLength(val, maxLen);
            slots[idx].value = val;
            return val;
        }

        function focusSlot(idx, atEnd) {
            if (idx < 0 || idx >= slots.length) {
                return;
            }
            var el = slots[idx];
            el.focus();
            if (atEnd) {
                var len = el.value.length;
                try {
                    el.setSelectionRange(len, len);
                } catch (e) { }
            }
        }

        function splitBySeparators(text) {
            var s = String(text == null ? '' : text);
            if (!s) {
                return [''];
            }
            var chars = Object.keys(separatorsChars);
            if (!chars.length) {
                return [s];
            }
            var esc = chars.map(function (ch) {
                return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }).join('');
            if (!esc) {
                return [s];
            }
            var re = new RegExp('[' + esc + ']+');
            return s.split(re);
        }

        function applyFrom(startIdx, chunks) {
            var idx = startIdx;
            for (var j = 0; j < chunks.length && idx < slots.length; j++, idx++) {
                setSlotValue(idx, chunks[j]);
            }
        }

        for (i = 0; i < segCount; i++) {
            (function (idx) {
                var input = document.createElement('input');
                input.type = 'text';
                input.className = 'adui-msi-slot';
                var ph = getRule(config.placeholders, idx, config.placeholder);
                if (ph != null && ph !== '') {
                    input.placeholder = String(ph);
                }
                var maxLen = getRule(config.maxLengths, idx, config.maxLength);
                if (maxLen != null && !isNaN(parseInt(maxLen, 10)) && parseInt(maxLen, 10) > 0) {
                    input.maxLength = parseInt(maxLen, 10);
                }

                input.addEventListener('keydown', function (ev) {
                    if (disabled) {
                        return;
                    }

                    if (ev.key === 'Backspace' && !input.value && idx > 0) {
                        ev.preventDefault();
                        var prev = slots[idx - 1];
                        prev.value = prev.value.slice(0, Math.max(0, prev.value.length - 1));
                        focusSlot(idx - 1, true);
                        emitChange();
                        return;
                    }

                    if (ev.key === 'ArrowLeft' && idx > 0 && input.selectionStart === 0 && input.selectionEnd === 0) {
                        ev.preventDefault();
                        focusSlot(idx - 1, true);
                        return;
                    }

                    if (ev.key === 'ArrowRight' && idx < slots.length - 1) {
                        var pos = input.selectionStart;
                        var len = input.value.length;
                        if (pos === len && input.selectionEnd === len) {
                            ev.preventDefault();
                            focusSlot(idx + 1, false);
                            return;
                        }
                    }

                    if (separatorsChars[ev.key] && idx < slots.length - 1) {
                        ev.preventDefault();
                        if (input.value) {
                            focusSlot(idx + 1, false);
                        }
                    }
                });

                input.addEventListener('input', function (ev) {
                    if (disabled) {
                        return;
                    }

                    var raw = input.value;
                    var chunks = splitBySeparators(raw);
                    if (chunks.length > 1) {
                        if (!chunks[0]) {
                            setSlotValue(idx, chunks[0]);
                            emitChange();
                            return;
                        }
                        applyFrom(idx, chunks);
                        var to = Math.min(slots.length - 1, idx + chunks.length - 1);
                        focusSlot(to, true);
                        emitChange();
                        return;
                    }

                    var out = setSlotValue(idx, raw);
                    var limit = parseInt(getRule(config.maxLengths, idx, config.maxLength), 10);
                    if (!isNaN(limit) && limit > 0 && out.length >= limit && idx < slots.length - 1) {
                        focusSlot(idx + 1, false);
                    }
                    emitChange();
                });

                input.addEventListener('paste', function (ev) {
                    if (disabled) {
                        return;
                    }
                    var txt = (ev.clipboardData && ev.clipboardData.getData) ? ev.clipboardData.getData('text') : '';
                    if (!txt) {
                        return;
                    }
                    ev.preventDefault();
                    applyFrom(idx, splitBySeparators(txt));
                    emitChange();
                });

                slots.push(input);
                root.appendChild(input);

                if (idx < segCount - 1) {
                    root.appendChild(document.createElement('span'));
                    root.lastChild.className = 'adui-msi-sep';
                    root.lastChild.textContent = getSeparatorAt(idx);
                }
            })(i);
        }

        function setDisabled(flag) {
            disabled = !!flag;
            root.classList.toggle('is-disabled', disabled);
            slots.forEach(function (s) {
                s.disabled = disabled;
            });
        }

        function setValue(next, silent) {
            var chunks = Array.isArray(next) ? next : splitBySeparators(next);
            for (var k = 0; k < slots.length; k++) {
                setSlotValue(k, chunks[k] || '');
            }
            if (!silent) {
                emitChange();
            }
        }

        var api = {
            root: root,
            get: function () {
                var out = [];
                for (var k = 0; k < slots.length; k++) {
                    out.push(slots[k].value || '');
                }
                var joined = '';
                for (var m = 0; m < out.length; m++) {
                    if (m > 0) {
                        joined += getSeparatorAt(m - 1);
                    }
                    joined += out[m];
                }
                return joined;
            },
            getSegments: function () {
                return slots.map(function (s) { return s.value || ''; });
            },
            set: setValue,
            setDisabled: setDisabled,
            focus: function (idx) {
                focusSlot(parseInt(idx, 10) || 0, true);
            },
            onChange: function (fn) {
                onChange = (typeof fn === 'function') ? fn : null;
            }
        };

        setValue(config.value || '', true);
        setDisabled(disabled);
        return api;
    }

    shared.createSingleSelect = createSingleSelect;
    shared.createMultiSelect = createMultiSelect;
    shared.createMultiSlotInput = createMultiSlotInput;
    win.adComponents = shared;
})(window);
