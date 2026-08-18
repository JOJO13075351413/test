'use strict';
'require view';
'require dom';
'require ui';
'require rpc';

function createActiveDeviceContext(fallbackDevType) {
    function toCardDevice(src) {
        var s = src || {};
        var id = String(s.dev_id || s.id || '').trim();
        var title = String(s.title || s.name || s.dev_name || '').trim();
        var ip = String(s.ip || s.dev_ip || '').trim();
        return {
            id: id,
            dev_id: id,
            title: title || '—',
            name: title || '—',
            ip: ip || '—',
            dev_ip: ip || '—',
            online: (typeof s.online === 'boolean') ? s.online : true,
            dev_type: (typeof s.dev_type === 'number') ? s.dev_type : fallbackDevType
        };
    }

    var legacy = (window.adDeviceInfo && typeof window.adDeviceInfo.getActiveDev === 'function')
        ? window.adDeviceInfo.getActiveDev()
        : { id: '', dev_id: '', title: '', ip: '', dev_type: fallbackDevType, online: true };

    var devices = [toCardDevice(legacy)];
    var activeIndex = 0;

    function getActiveDev() {
        var d = devices[activeIndex] || devices[0] || {};
        return {
            id: d.id || d.dev_id || '',
            title: d.title || d.name || '',
            ip: d.ip || '',
            online: (typeof d.online === 'boolean') ? d.online : true,
            dev_type: (typeof d.dev_type === 'number') ? d.dev_type : fallbackDevType,
            dev_id: d.id || d.dev_id || ''
        };
    }

    function applyActiveDevice(src, deviceCardComp) {
        devices[0] = toCardDevice(src);
        if (deviceCardComp && typeof deviceCardComp.setDevices === 'function') {
            deviceCardComp.setDevices(devices);
        }
    }

    async function syncActiveDeviceCard(deviceCardComp) {
        if (window.adDeviceInfo && typeof window.adDeviceInfo.refreshSelfDevInfo === 'function') {
            try {
                await window.adDeviceInfo.refreshSelfDevInfo();
            } catch (e) { }
        }
        if (window.adDeviceInfo && typeof window.adDeviceInfo.getActiveDev === 'function') {
            applyActiveDevice(window.adDeviceInfo.getActiveDev(), deviceCardComp);
        }
    }

    return {
        devices: devices,
        activeIndex: activeIndex,
        getActiveDev: getActiveDev,
        applyActiveDevice: applyActiveDevice,
        syncActiveDeviceCard: syncActiveDeviceCard
    };
}

return view.extend({
    load: function () {
        return Promise.all([
            loadCssOnce('/luci-static/custom/css/ad_common.css'),
            loadCssOnce('/luci-static/custom/css/network/wireless_config.css'),
            loadScriptOnce('/luci-static/custom/js/enum.js'),
            loadScriptOnce('/luci-static/custom/js/components.js'),
            loadScriptOnce('/luci-static/custom/js/device_card.js'),
            loadScriptOnce('/luci-static/custom/js/device_info.js'),
            loadScriptOnce('/luci-static/custom/js/toast.js'),
            loadScriptOnce('/luci-static/custom/js/audit_actions.js')
        ]);
    },

    render: function () {
        var auditActions = window.adAuditActions;
        var fallbackDevType = ((typeof DEV_TYPE !== 'undefined') && typeof DEV_TYPE.AD === 'number') ? DEV_TYPE.AD : 1;
        var deviceCtx = createActiveDeviceContext(fallbackDevType);
        var getActiveDev = deviceCtx.getActiveDev;
        var callSystemReboot = rpc.declare({ object: 'system', method: 'reboot' });
        var empApiPromise = L.require('emp/api').then(function (mod) {
            return (typeof mod === 'function') ? new mod() : mod;
        });

        function getEmpApi() {
            return empApiPromise;
        }

        function showAdModal(title, nodes, opts) {
            if (window.adModal && typeof window.adModal.show === 'function') {
                return window.adModal.show(ui, title, nodes, opts || {});
            }
            ui.showModal(title, nodes);
            return true;
        }

        function showApplyRebootConfirm() {
            showAdModal(_('配置生效确认'), [
                E('div', { 'class': 'modal-body' }, [
                    E('p', {}, _('当前配置将在设备重启后生效，是否重启？'))
                ]),
                E('div', { 'class': 'right' }, [
                    E('button', {
                        'class': 'btn',
                        'click': function () {
                            ui.hideModal();
                        }
                    }, _('取消')),
                    E('button', {
                        'class': 'btn cbi-button-negative',
                        'click': function () {
                            callSystemReboot().then(function () {
                                auditActions.record('WIRELESS_CONFIG_APPLY', {
                                    sectionKey: activeTab,
                                    sectionTitle: getTabTitle(activeTab)
                                }, '成功');
                                ui.hideModal();
                                if (typeof window.toastSuccess === 'function') {
                                    window.toastSuccess('已下发重启指令');
                                }
                            }).catch(function (e) {
                                auditActions.record('WIRELESS_CONFIG_APPLY', {
                                    sectionKey: activeTab,
                                    sectionTitle: getTabTitle(activeTab)
                                }, '失败');
                                if (typeof window.toastWarn === 'function') {
                                    window.toastWarn('重启失败');
                                }
                            });
                        }
                    }, _('确认'))
                ])
            ], { width: 420 });
        }

        function createGeneralConfigModal() {
            if (!window.adComponents || typeof window.adComponents.createMultiSlotInput !== 'function') {
                showWarn('组件未就绪');
                return;
            }

            var ipInput = window.adComponents.createMultiSlotInput({
                segments: 5,
                separators: ['.', '.', '.', '/'],
                pattern: /\d/,
                maxLengths: [3, 3, 3, 3, 2],
                className: 'ns-general-ip-slot',
                styleVars: {
                    '--adui-msi-bg': '#ffffff',
                    '--adui-msi-border': '#e9dfd5',
                    '--adui-msi-text': '#3d434c',
                    '--adui-msi-sep': '#968a80'
                }
            });
            var generalIpTip = E('span', { 'class': 'ns-w24-input-msg' });
            var generalIpTipTimer = null;

            function showGeneralIpFeedback(msg) {
                if (!msg) {
                    return;
                }
                if (ipInput && ipInput.root) {
                    ipInput.root.classList.remove('is-invalid');
                    void ipInput.root.offsetWidth;
                    ipInput.root.classList.add('is-invalid');
                }
                generalIpTip.textContent = msg;
                generalIpTip.classList.add('show');
                if (generalIpTipTimer) {
                    clearTimeout(generalIpTipTimer);
                }
                generalIpTipTimer = setTimeout(function () {
                    if (ipInput && ipInput.root) {
                        ipInput.root.classList.remove('is-invalid');
                    }
                    generalIpTip.classList.remove('show');
                }, 1800);
            }

            function sanitizeGeneralIpByInput() {
                if (!ipInput || typeof ipInput.getSegments !== 'function' || typeof ipInput.set !== 'function') {
                    return;
                }
                var segs = ipInput.getSegments();
                if (!Array.isArray(segs) || segs.length < 5) {
                    return;
                }

                var normalized = segs.slice(0, 5).map(function (s) {
                    return String(s == null ? '' : s);
                });
                var corrected = false;
                var tipMsg = '';
                var i;
                for (i = 0; i < 4; i++) {
                    var rawOct = normalized[i];
                    var octDigits = rawOct.replace(/[^\d]/g, '');
                    if (octDigits !== rawOct) {
                        corrected = true;
                    }
                    if (octDigits === '') {
                        normalized[i] = '';
                        continue;
                    }
                    var oct = parseInt(octDigits, 10);
                    if (isNaN(oct)) {
                        normalized[i] = '';
                        corrected = true;
                        continue;
                    }
                    if (oct > 255) {
                        oct = 255;
                        corrected = true;
                        tipMsg = tipMsg || '设备IP每段范围 0~255';
                    }
                    normalized[i] = String(oct);
                }

                var rawMask = normalized[4];
                var maskDigits = rawMask.replace(/[^\d]/g, '');
                if (maskDigits !== rawMask) {
                    corrected = true;
                }
                if (maskDigits === '') {
                    normalized[4] = '';
                } else {
                    var mask = parseInt(maskDigits, 10);
                    if (isNaN(mask)) {
                        normalized[4] = '';
                        corrected = true;
                    } else {
                        if (mask > 32) {
                            mask = 32;
                            corrected = true;
                            tipMsg = tipMsg || '掩码范围 0~32';
                        }
                        normalized[4] = String(mask);
                    }
                }

                if (corrected) {
                    ipInput.set(normalized, true);
                    showGeneralIpFeedback(tipMsg || '设备IP输入已自动校正');
                }
            }

            function validateGeneralIpCompleteness() {
                if (!ipInput || typeof ipInput.getSegments !== 'function') {
                    return true;
                }
                var segs = ipInput.getSegments();
                if (!Array.isArray(segs) || segs.length < 5) {
                    showGeneralIpFeedback('设备IP格式无效');
                    return false;
                }
                var i;
                for (i = 0; i < 4; i++) {
                    if (String(segs[i] || '').trim() === '') {
                        showGeneralIpFeedback('请填写完整设备IP地址');
                        return false;
                    }
                }
                if (String(segs[4] || '').trim() === '') {
                    showGeneralIpFeedback('请填写掩码');
                    return false;
                }
                return true;
            }

            if (typeof ipInput.onChange === 'function') {
                ipInput.onChange(function () {
                    sanitizeGeneralIpByInput();
                });
            }

            function makeRadio(name, val, text, checked) {
                var input = E('input', {
                    'type': 'radio',
                    'name': name,
                    'value': val,
                    'checked': checked ? 'checked' : null
                });
                return E('label', { 'class': 'ns-general-radio-item' }, [
                    input,
                    E('span', {}, text)
                ]);
            }

            var mainLinkGroupName = 'ns-general-main-link-' + String(Date.now());
            var mainLinkWrap = E('div', { 'class': 'ns-general-radio-group' }, [
                makeRadio(mainLinkGroupName, '2.4G', _('2.4G'), true),
                makeRadio(mainLinkGroupName, '5G', _('5G'), false)
            ]);
            var redundancyGroupName = 'ns-general-redundancy-' + String(Date.now());
            var redundancyWrap = E('div', { 'class': 'ns-general-radio-group' }, [
                makeRadio(redundancyGroupName, '1', _('开启'), true),
                makeRadio(redundancyGroupName, '0', _('关闭'), false)
            ]);
            var body = E('div', { 'class': 'modal-body' }, [
                E('div', { 'class': 'ns-general-form' }, [
                    E('div', { 'class': 'ns-general-row' }, [
                        E('div', { 'class': 'ns-general-label' }, _('主链路')),
                        E('div', { 'class': 'ns-general-control' }, [mainLinkWrap])
                    ]),
                    E('div', { 'class': 'ns-general-row' }, [
                        E('div', { 'class': 'ns-general-label' }, _('双频冗余')),
                        E('div', { 'class': 'ns-general-control' }, [redundancyWrap])
                    ])
                ])
            ]);

            showAdModal(_('通用配置'), [
                body,
                E('div', { 'class': 'right' }, [
                    E('button', {
                        'class': 'btn',
                        'click': function () {
                            ui.hideModal();
                        }
                    }, _('取消')),
                    E('button', {
                        'class': 'btn cbi-button-action',
                        'click': function () {
                            ui.hideModal();
                            showWarn('通用配置后端待接入');
                        }
                    }, _('确认'))
                ])
            ], { width: 430 });
        }

        var deviceCardComp = (window.adUiDeviceCard && typeof window.adUiDeviceCard.createDeviceCardRow === 'function')
            ? window.adUiDeviceCard.createDeviceCardRow({
                translate: _,
                devices: deviceCtx.devices,
                activeIndex: deviceCtx.activeIndex
            })
            : null;

        var tabs = [
            { key: 'wireless24g', title: _('2.4G无线网络配置') },
            { key: 'wireless5g', title: _('5G无线网络配置') },
            { key: 'wirelessLowPower', title: _('低功耗无线网络设置') },
            { key: 'wirelessCommon', title: _('通用无线网络配置') }
        ];
        var activeTab = tabs[0].key;

        function getTabTitle(key) {
            for (var i = 0; i < tabs.length; i++) {
                if (tabs[i].key === key) {
                    return String(tabs[i].title || '');
                }
            }
            return '';
        }

        function attachAuditAction(req, actionKey, ctx) {
            if (auditActions && typeof auditActions.attach === 'function') {
                return auditActions.attach(req, actionKey, ctx || {});
            }
            return req;
        }

        function makeFormRow(label, control, extra, rowClass) {
            var cls = 'ns-w24-form-row' + (rowClass ? (' ' + rowClass) : '');
            return E('div', { 'class': cls }, [
                E('div', { 'class': 'ns-w24-form-label' }, label),
                E('div', { 'class': 'ns-w24-form-control' }, extra ? [control, extra] : [control])
            ]);
        }

        function normalizeMacType(type) {
            var t = String(type || '').trim();
            if (t === '') {
                return '';
            }
            var allowed = {
                'eth_mac': true,
                'wia_mac': true
            };
            if (allowed[t]) {
                return t;
            }
            if (/^wia_mac\(\d+\)$/.test(t)) {
                return 'wia_mac';
            }
            return 'eth_mac';
        }

        function getEnabledMacSlotCount(typeVal) {
            var t = normalizeMacType(typeVal);
            if (t === '') {
                return 0;
            }
            if (t === 'eth_mac') {
                return 6;
            }
            return 8;
        }

        function splitMacToPairs(raw) {
            var s = String(raw || '').trim();
            if (!s) {
                return [];
            }
            if (s.indexOf(':') >= 0) {
                return s.split(':').map(function (p) {
                    return String(p || '').replace(/[^0-9a-fA-F]/g, '').slice(0, 2);
                });
            }
            var hex = s.replace(/[^0-9a-fA-F]/g, '');
            var out = [];
            for (var i = 0; i < hex.length; i += 2) {
                out.push(hex.slice(i, i + 2));
            }
            return out;
        }

        function decodeOpaqueBytes(rawPayload) {
            var raw = String(rawPayload == null ? '' : rawPayload).trim();
            if (!raw) {
                return [];
            }

            var hexOnlyPattern = /^[0-9a-fA-F\s,:-]+$/;
            if (hexOnlyPattern.test(raw)) {
                var hex = raw.replace(/[^0-9a-fA-F]/g, '');
                if (hex.length >= 2 && hex.length % 2 === 0) {
                    var out = [];
                    for (var i = 0; i < hex.length; i += 2) {
                        out.push(parseInt(hex.slice(i, i + 2), 16) & 0xFF);
                    }
                    return out;
                }
            }

            var bytes = [];
            var j;
            for (j = 0; j < raw.length; j++) {
                bytes.push(raw.charCodeAt(j) & 0xFF);
            }
            return bytes;
        }

        function decodeMacFilterPayloadBytes(rawPayload) {
            var raw = String(rawPayload == null ? '' : rawPayload).trim();
            if (!raw) {
                return [];
            }

            var tokenMatches = raw.match(/0x[0-9a-fA-F]{2}/g);
            if (tokenMatches && tokenMatches.length) {
                return tokenMatches.map(function (token) {
                    return parseInt(token.slice(2), 16) & 0xFF;
                });
            }

            if (/^[0-9a-fA-F\s,:-]+$/.test(raw)) {
                var hex = raw.replace(/[^0-9a-fA-F]/g, '');
                if (hex.length >= 88 && hex.length % 88 === 0) {
                    var out = [];
                    for (var i = 0; i < hex.length; i += 2) {
                        out.push(parseInt(hex.slice(i, i + 2), 16) & 0xFF);
                    }
                    return out;
                }
            }

            var bytes = [];
            for (var j = 0; j < raw.length; j++) {
                bytes.push(raw.charCodeAt(j) & 0xFF);
            }
            return bytes;
        }

        function parseSsidPayload(rawPayload) {
            var bytes = decodeOpaqueBytes(rawPayload);
            if (bytes.length) {
                var chars = [];
                for (var i = 0; i < bytes.length; i++) {
                    var b = bytes[i];
                    if (b === 0) {
                        continue;
                    }
                    if (b >= 0x20 && b <= 0x7E) {
                        chars.push(String.fromCharCode(b));
                    }
                }
                return chars.join('').trim();
            }
            return String(rawPayload == null ? '' : rawPayload).replace(/\0+/g, '').replace(/[^\x20-\x7E]/g, '').trim();
        }

        function bytesToMacText(bytes) {
            return (bytes || []).map(function (n) {
                var h = (n & 0xFF).toString(16).toUpperCase();
                return h.length < 2 ? ('0' + h) : h;
            }).join(':');
        }

        function normalizeGatewayMacPayload(rawPayload) {
            var text = String(rawPayload == null ? '' : rawPayload).replace(/\0+/g, '').trim();
            if (!text) {
                return '';
            }

            var hex = text.replace(/[^0-9a-fA-F]/g, '');
            if (hex && /^0+$/.test(hex)) {
                return '';
            }

            var bytes = decodeOpaqueBytes(rawPayload);
            if (bytes.length && bytes.every(function (b) { return (b & 0xFF) === 0; })) {
                return '';
            }

            return text;
        }

        function isMacAsciiByte(n) {
            return (
                (n >= 0x30 && n <= 0x39) ||
                (n >= 0x41 && n <= 0x46) ||
                (n >= 0x61 && n <= 0x66) ||
                n === 0x3A ||
                n === 0x20
            );
        }

        function decodeAsciiBytes(bytes) {
            var out = [];
            for (var i = 0; i < bytes.length; i++) {
                out.push(String.fromCharCode(bytes[i] & 0xFF));
            }
            return out.join('');
        }

        function normalizeMacPairs(parts, maxSlots) {
            var pairs = (parts || []).map(function (p) {
                var hex = String(p || '').replace(/[^0-9a-fA-F]/g, '');
                if (!hex) {
                    return '';
                }
                if (hex.length > 2) {
                    hex = hex.slice(hex.length - 2);
                }
                if (hex.length < 2) {
                    hex = '0' + hex;
                }
                return hex.toUpperCase();
            }).filter(function (p) {
                return !!p;
            });
            if (!pairs.length) {
                return [];
            }
            if (pairs.length > maxSlots) {
                return pairs.slice(pairs.length - maxSlots);
            }
            return pairs;
        }

        function parseMacPairsFromTailText(text, maxSlots) {
            var src = String(text || '');
            if (!src) {
                return [];
            }
            var revParts = [];
            var cur = '';
            var i;
            for (i = src.length - 1; i >= 0; i--) {
                var ch = src.charAt(i);
                if (ch === ':') {
                    if (cur !== '') {
                        revParts.push(cur);
                        cur = '';
                    }
                    continue;
                }
                if (!/[0-9a-fA-F]/.test(ch)) {
                    continue;
                }
                cur = ch + cur;
            }
            if (cur !== '') {
                revParts.push(cur);
            }
            if (!revParts.length) {
                return [];
            }
            return normalizeMacPairs(revParts.reverse(), maxSlots);
        }

        function parseMacPairsFromText(text, maxSlots) {
            return normalizeMacPairs(splitMacToPairs(text || ''), maxSlots);
        }

        function parseMacFromPartHead(bytes, maxSlots) {
            var part = Array.isArray(bytes) ? bytes : [];
            if (!part.length) {
                return [];
            }
            var start = -1;
            var i;
            for (i = 0; i < part.length; i++) {
                if ((part[i] & 0xFF) !== 0) {
                    start = i;
                    break;
                }
            }
            if (start < 0) {
                return [];
            }
            var end = start;
            for (i = start; i < part.length; i++) {
                var b = part[i] & 0xFF;
                if (b === 0 || !isMacAsciiByte(b)) {
                    break;
                }
                end = i;
            }
            var token = decodeAsciiBytes(part.slice(start, end + 1));
            return parseMacPairsFromText(token, maxSlots);
        }

        function parseMacFromPartTail(bytes, maxSlots) {
            var part = Array.isArray(bytes) ? bytes : [];
            if (!part.length) {
                return [];
            }
            var end = -1;
            var i;
            for (i = part.length - 1; i >= 0; i--) {
                if ((part[i] & 0xFF) !== 0) {
                    end = i;
                    break;
                }
            }
            if (end < 0) {
                return [];
            }
            var start = end;
            for (i = end; i >= 0; i--) {
                if (!isMacAsciiByte(part[i] & 0xFF)) {
                    break;
                }
                start = i;
            }
            var token = decodeAsciiBytes(part.slice(start, end + 1));
            return parseMacPairsFromTailText(token, maxSlots);
        }

        function parseMacFromPart(bytes, maxSlots, type) {
            var pairs = parseMacFromPartHead(bytes, maxSlots);
            if (!pairs.length) {
                pairs = parseMacFromPartTail(bytes, maxSlots);
            }
            if (!pairs.length) {
                return null;
            }
            if (type === 'eth_mac') {
                if (pairs.length < 6) {
                    return null;
                }
                pairs = pairs.slice(pairs.length - 6);
                return {
                    type: 'eth_mac',
                    mac: pairs.join(':')
                };
            }
            var wiaLen = parseWiaMacLength(pairs.length);
            if (!wiaLen) {
                return null;
            }
            pairs = pairs.slice(pairs.length - wiaLen);
            return {
                type: 'wia_mac',
                mac: pairs.join(':')
            };
        }

        function parseWiaMacLength(len) {
            var n = parseInt(len, 10);
            if (isNaN(n)) {
                return 0;
            }
            if (n >= 8) {
                return 8;
            }
            if (n >= 6) {
                return 6;
            }
            if (n >= 4) {
                return 4;
            }
            if (n >= 2) {
                return 2;
            }
            return 0;
        }

        function parseExactWiaMacLength(len) {
            var n = parseInt(len, 10);
            return ([2, 4, 6, 8].indexOf(n) >= 0) ? n : 0;
        }

        function parseMacFilterPayload(rawPayload) {
            var bytes = decodeMacFilterPayloadBytes(rawPayload);
            var rows = [];
            var blockSize = 44;
            var i;

            if (!bytes.length) {
                return rows;
            }

            for (i = 0; i < bytes.length; i += blockSize) {
                var block = bytes.slice(i, i + blockSize);
                if (!block.length) {
                    continue;
                }
                var hasAny = block.some(function (b) { return b !== 0; });
                if (!hasAny) {
                    continue;
                }

                var ethPart = block.slice(0, 20);
                var wiaPart = block.slice(20, 44);
                var ethParsed = parseMacFromPart(ethPart, 6, 'eth_mac');
                var wiaParsed = parseMacFromPart(wiaPart, 8, 'wia_mac');
                var ethHasAny = ethPart.some(function (b) { return b !== 0; });
                var wiaHasAny = wiaPart.some(function (b) { return b !== 0; });

                if (ethParsed && !wiaParsed) {
                    rows.push(ethParsed);
                    continue;
                }
                if (wiaParsed && !ethParsed) {
                    rows.push(wiaParsed);
                    continue;
                }
                if (ethParsed && wiaParsed) {
                    rows.push(wiaHasAny ? wiaParsed : ethParsed);
                    continue;
                }
                if (ethHasAny && !wiaHasAny && ethParsed) {
                    rows.push(ethParsed);
                    continue;
                }
                if (wiaHasAny && !ethHasAny && wiaParsed) {
                    rows.push(wiaParsed);
                }
            }

            return rows;
        }

        function parseIntSafe(val, dft) {
            var n = parseInt(val, 10);
            return isNaN(n) ? dft : n;
        }

        function utf8ToHex(str) {
            function h2(n) {
                var h = (n & 0xFF).toString(16).toUpperCase();
                return h.length < 2 ? ('0' + h) : h;
            }
            var s = String(str == null ? '' : str);
            var out = '';
            var i = 0;
            while (i < s.length) {
                var c = s.charCodeAt(i);
                if (c <= 0x7F) {
                    out += h2(c);
                } else if (c <= 0x7FF) {
                    out += h2(0xC0 | (c >> 6));
                    out += h2(0x80 | (c & 0x3F));
                } else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
                    var c2 = s.charCodeAt(i + 1);
                    if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
                        var cp = ((c - 0xD800) << 10) + (c2 - 0xDC00) + 0x10000;
                        out += h2(0xF0 | (cp >> 18));
                        out += h2(0x80 | ((cp >> 12) & 0x3F));
                        out += h2(0x80 | ((cp >> 6) & 0x3F));
                        out += h2(0x80 | (cp & 0x3F));
                        i++;
                    } else {
                        out += h2(0xE0 | (c >> 12));
                        out += h2(0x80 | ((c >> 6) & 0x3F));
                        out += h2(0x80 | (c & 0x3F));
                    }
                } else {
                    out += h2(0xE0 | (c >> 12));
                    out += h2(0x80 | ((c >> 6) & 0x3F));
                    out += h2(0x80 | (c & 0x3F));
                }
                i++;
            }
            return out;
        }

        function macTextToAsciiBytes(rawMac, maxSlots) {
            var pairs = splitMacToPairs(rawMac).map(function (p) {
                var hex = String(p || '').replace(/[^0-9a-fA-F]/g, '');
                if (!hex) {
                    return '';
                }
                if (hex.length > 2) {
                    hex = hex.slice(hex.length - 2);
                }
                if (hex.length < 2) {
                    hex = '0' + hex;
                }
                return hex.toUpperCase();
            }).filter(function (p) {
                return !!p;
            });
            if (!pairs.length) {
                return [];
            }
            if (pairs.length > maxSlots) {
                pairs = pairs.slice(pairs.length - maxSlots);
            }
            var text = pairs.join(':');
            var out = [];
            for (var i = 0; i < text.length; i++) {
                out.push(text.charCodeAt(i) & 0xFF);
            }
            return out;
        }

        function putTailBytes(dst, bytes) {
            var src = Array.isArray(bytes) ? bytes : [];
            var use = src.slice(Math.max(0, src.length - dst.length));
            var start = dst.length - use.length;
            for (var i = 0; i < use.length; i++) {
                dst[start + i] = use[i];
            }
        }

        function putHeadBytes(dst, bytes) {
            var src = Array.isArray(bytes) ? bytes : [];
            var use = src.slice(0, dst.length);
            for (var i = 0; i < use.length; i++) {
                dst[i] = use[i];
            }
        }

        function encodeMacFilterRowsToHex(rows) {
            var list = Array.isArray(rows) ? rows : [];
            var blocks = [];

            list.forEach(function (row) {
                var type = normalizeMacType(row && row.type);
                var macText = String((row && row.mac) || '').trim();
                if (!type || !macText) {
                    return;
                }

                var macPairs = splitMacToPairs(macText).filter(function (p) {
                    return String(p || '').replace(/[^0-9a-fA-F]/g, '') !== '';
                });
                var maxSlots = 6;
                if (type === 'wia_mac') {
                    maxSlots = parseExactWiaMacLength(macPairs.length);
                    if (!maxSlots) {
                        return;
                    }
                }
                var bytes = macTextToAsciiBytes(macText, maxSlots);
                if (!bytes.length) {
                    return;
                }

                var block = new Array(44);
                var i;
                for (i = 0; i < block.length; i++) {
                    block[i] = 0;
                }

                if (type === 'eth_mac') {
                    var ethPart = block.slice(0, 20);
                    putHeadBytes(ethPart, bytes);
                    for (i = 0; i < 20; i++) {
                        block[i] = ethPart[i];
                    }
                } else {
                    var wiaPart = block.slice(20, 44);
                    putHeadBytes(wiaPart, bytes);
                    for (i = 0; i < 24; i++) {
                        block[20 + i] = wiaPart[i];
                    }
                }
                blocks = blocks.concat(block);
            });

            return blocks.map(function (n) {
                var h = (n & 0xFF).toString(16).toUpperCase();
                return h.length < 2 ? ('0' + h) : h;
            }).join('');
        }

        function truncateUtf8ByBytes(str, maxBytes) {
            var s = String(str == null ? '' : str);
            var out = '';
            var used = 0;
            var i = 0;

            while (i < s.length) {
                var c1 = s.charCodeAt(i);
                var unit = s.charAt(i);
                var byteLen = 1;
                var step = 1;

                if (c1 <= 0x7F) {
                    byteLen = 1;
                } else if (c1 <= 0x7FF) {
                    byteLen = 2;
                } else if (c1 >= 0xD800 && c1 <= 0xDBFF && i + 1 < s.length) {
                    var c2 = s.charCodeAt(i + 1);
                    if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
                        unit = s.slice(i, i + 2);
                        byteLen = 4;
                        step = 2;
                    } else {
                        byteLen = 3;
                    }
                } else {
                    byteLen = 3;
                }

                if (used + byteLen > maxBytes) {
                    break;
                }

                out += unit;
                used += byteLen;
                i += step;
            }

            return out;
        }

        function utf8ByteLength(str) {
            var s = String(str == null ? '' : str);
            var bytes = 0;
            var i = 0;
            while (i < s.length) {
                var c1 = s.charCodeAt(i);
                if (c1 <= 0x7F) {
                    bytes += 1;
                } else if (c1 <= 0x7FF) {
                    bytes += 2;
                } else if (c1 >= 0xD800 && c1 <= 0xDBFF && i + 1 < s.length) {
                    var c2 = s.charCodeAt(i + 1);
                    if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
                        bytes += 4;
                        i++;
                    } else {
                        bytes += 3;
                    }
                } else {
                    bytes += 3;
                }
                i++;
            }
            return bytes;
        }

        function showWarn(msg) {
            if (typeof window.toastWarn === 'function') {
                window.toastWarn(msg);
                return;
            }
            try {
                console.warn(msg);
            } catch (e) { }
        }

        function createWirelessBandSection(cfg) {
            var editEnabled = false;
            var editSnapshot = null;
            var loadingFromBackend = false;
            var fields = [];
            var inputFeedbackMapLocal = new WeakMap();
            var macRows = [];
            var macList = E('div', { 'class': 'ns-w24-mac-list' });
            var macAddBtn = E('button', {
                'type': 'button',
                'class': 'ns-w24-icon-btn ns-w24-mac-add',
                'title': _('添加')
            }, [E('img', { 'src': '/luci-static/custom/img/add.svg', 'alt': '' })]);

            function makeInputLocal(placeholder) {
                var el = E('input', {
                    'class': 'ns-input ad-c-input',
                    'type': 'text',
                    'placeholder': placeholder || _('请输入')
                });
                fields.push({ kind: 'input', el: el });
                var tip = E('span', { 'class': 'ns-w24-input-msg' });
                var wrap = E('div', { 'class': 'ns-w24-input-wrap' }, [el, tip]);
                inputFeedbackMapLocal.set(el, {
                    wrap: wrap,
                    tip: tip,
                    timer: null
                });
                return el;
            }

            function getInputControlLocal(el) {
                var fb = inputFeedbackMapLocal.get(el);
                return fb ? fb.wrap : el;
            }

            function showInputFeedbackLocal(el, msg) {
                var fb = inputFeedbackMapLocal.get(el);
                if (!fb || !msg) {
                    return;
                }
                el.classList.remove('ns-input-alert');
                void el.offsetWidth;
                el.classList.add('ns-input-alert');

                fb.tip.textContent = msg;
                fb.tip.classList.add('show');

                if (fb.timer) {
                    clearTimeout(fb.timer);
                }
                fb.timer = setTimeout(function () {
                    el.classList.remove('ns-input-alert');
                    fb.tip.classList.remove('show');
                }, 1800);
            }

            function makeSelectLocal(options, value, minWidth, track) {
                if (!window.adComponents || typeof window.adComponents.createSingleSelect !== 'function') {
                    throw new Error('adComponents.createSingleSelect is not available');
                }
                var sel = window.adComponents.createSingleSelect({
                    options: options || [],
                    value: value || '',
                    placeholder: _('请选择'),
                    styleVars: {
                        '--adui-ss-min-width': minWidth || '220px',
                        '--adui-ss-arrow-color': '#968a80',
                        '--adui-ss-placeholder': '#968a80',
                        '--adui-ss-menu-border': '#e9dfd5',
                        '--adui-ss-menu-bg': '#ffffff',
                        '--adui-ss-menu-text': '#3d434c',
                        '--adui-ss-menu-hover-bg': '#fff4ec'
                    }
                });
                if (track !== false) {
                    fields.push({ kind: 'select', api: sel });
                }
                return sel;
            }

            function createWorkChannelControl(channelCfg) {
                var customValue = '__custom__';
                var opts = (channelCfg.options || []).map(function (v) {
                    var text = String(v);
                    return { value: text, label: text };
                });
                opts.push({ value: customValue, label: _('自定义') });

                var allowedCustom = {};
                (channelCfg.customValues || []).forEach(function (v) {
                    allowedCustom[String(v)] = true;
                });

                var select = makeSelectLocal(opts, '', '150px', false);
                var input = E('input', {
                    'class': 'ns-input ad-c-input ns-work-channel-custom',
                    'type': 'text',
                    'maxlength': '4'
                });
                var tip = E('span', { 'class': 'ns-w24-input-msg ns-work-channel-msg' });
                var fieldsWrap = E('div', { 'class': 'ns-work-channel-fields' }, [select.root, input]);
                var root = E('div', { 'class': 'ns-work-channel-control' }, [fieldsWrap, tip]);
                var onInput = null;
                var tipTimer = null;

                function isCustomSelected() {
                    return String(select.get() || '') === customValue;
                }

                function syncCustomInput() {
                    input.style.display = isCustomSelected() ? '' : 'none';
                }

                function emit() {
                    if (typeof onInput === 'function') {
                        onInput();
                    }
                }

                select.onChange(function () {
                    syncCustomInput();
                    emit();
                });

                input.addEventListener('input', function () {
                    var next = String(input.value || '').replace(/[^\d]/g, '').slice(0, 4);
                    if (next !== input.value) {
                        input.value = next;
                    }
                    input.classList.remove('ns-input-alert');
                    tip.classList.remove('show');
                    emit();
                });

                syncCustomInput();

                return {
                    root: root,
                    input: input,
                    get: function () {
                        return isCustomSelected() ? String(input.value || '') : String(select.get() || '');
                    },
                    set: function (v, silent) {
                        var value = String(v == null ? '' : v);
                        var isPreset = opts.some(function (opt) {
                            return opt.value !== customValue && opt.value === value;
                        });
                        if (isPreset || value === '') {
                            select.set(value, true);
                            input.value = '';
                        } else {
                            select.set(customValue, true);
                            input.value = value.replace(/[^\d]/g, '').slice(0, 4);
                        }
                        syncCustomInput();
                        if (!silent) {
                            emit();
                        }
                    },
                    setDisabled: function (disabled) {
                        select.setDisabled(!!disabled);
                        input.disabled = !!disabled;
                        input.classList.toggle('is-readonly', !!disabled);
                    },
                    isValid: function () {
                        if (!isCustomSelected()) {
                            input.classList.remove('ns-input-alert');
                            tip.classList.remove('show');
                            return true;
                        }
                        var value = String(input.value || '');
                        var ok = !!allowedCustom[value];
                        input.classList.toggle('ns-input-alert', !ok);
                        if (!ok) {
                            tip.textContent = _('自定义信道值非法');
                            tip.classList.add('show');
                            if (tipTimer) {
                                clearTimeout(tipTimer);
                            }
                            tipTimer = setTimeout(function () {
                                input.classList.remove('ns-input-alert');
                                tip.classList.remove('show');
                            }, 1800);
                        } else {
                            tip.classList.remove('show');
                        }
                        return ok;
                    },
                    onChange: function (cb) {
                        onInput = (typeof cb === 'function') ? cb : null;
                    }
                };
            }

            function makeMacSlotInputLocal(value) {
                if (!window.adComponents || typeof window.adComponents.createMultiSlotInput !== 'function') {
                    throw new Error('adComponents.createMultiSlotInput is not available');
                }
                return window.adComponents.createMultiSlotInput({
                    segments: 8,
                    separators: [':'],
                    pattern: /[0-9a-fA-F]/,
                    maxLength: 2,
                    value: value || '',
                    className: 'ns-w24-mac-slot',
                    styleVars: {
                        '--adui-msi-bg': '#ffffff',
                        '--adui-msi-border': '#e9dfd5',
                        '--adui-msi-text': '#3d434c',
                        '--adui-msi-sep': '#968a80'
                    }
                });
            }

            function makeGatewayMacInputLocal(value) {
                if (!window.adComponents || typeof window.adComponents.createMultiSlotInput !== 'function') {
                    throw new Error('adComponents.createMultiSlotInput is not available');
                }
                return window.adComponents.createMultiSlotInput({
                    segments: 6,
                    separators: [':'],
                    pattern: /[0-9a-fA-F]/,
                    maxLength: 2,
                    value: value || '',
                    className: 'ns-w24-mac-slot',
                    styleVars: {
                        '--adui-msi-bg': '#ffffff',
                        '--adui-msi-border': '#e9dfd5',
                        '--adui-msi-text': '#3d434c',
                        '--adui-msi-sep': '#968a80'
                    }
                });
            }

            function makeRadioGroupLocal(nameSeed, defaultValue) {
                var groupName = 'ns-w24-radio-' + nameSeed + '-' + String(Date.now());
                var onInput = null;
                function mk(value, label, checked) {
                    var ipt = E('input', {
                        'type': 'radio',
                        'name': groupName,
                        'value': value,
                        'checked': checked ? 'checked' : null
                    });
                    return E('label', { 'class': 'ns-general-radio-item' }, [
                        ipt,
                        E('span', {}, label)
                    ]);
                }
                var root = E('div', { 'class': 'ns-general-radio-group' }, [
                    mk('1', _('开启'), String(defaultValue || '1') === '1'),
                    mk('0', _('关闭'), String(defaultValue || '1') !== '1')
                ]);
                root.addEventListener('change', function () {
                    if (typeof onInput === 'function') {
                        onInput();
                    }
                });
                return {
                    root: root,
                    get: function () {
                        var checked = root.querySelector('input[type="radio"][name="' + groupName + '"]:checked');
                        return checked ? String(checked.value || '') : '1';
                    },
                    set: function (v) {
                        var target = root.querySelector('input[type="radio"][name="' + groupName + '"][value="' + String(v || '1') + '"]');
                        if (!target) {
                            target = root.querySelector('input[type="radio"][name="' + groupName + '"][value="1"]');
                        }
                        if (target) {
                            target.checked = true;
                        }
                    },
                    setDisabled: function (disabled) {
                        var radios = root.querySelectorAll('input[type="radio"][name="' + groupName + '"]');
                        for (var i = 0; i < radios.length; i++) {
                            radios[i].disabled = !!disabled;
                        }
                    },
                    onChange: function (cb) {
                        onInput = cb;
                    }
                };
            }

            function getGatewayMacValueLocal(inputApi) {
                if (!inputApi || typeof inputApi.getSegments !== 'function') {
                    return '';
                }
                var segs = inputApi.getSegments();
                var out = [];
                var hasAny = false;
                for (var i = 0; i < segs.length; i++) {
                    var h = String(segs[i] || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
                    if (h.length > 2) {
                        h = h.slice(h.length - 2);
                    }
                    if (h.length === 1) {
                        h = '0' + h;
                    }
                    if (h !== '') {
                        hasAny = true;
                    }
                    out.push(h);
                }
                if (!hasAny) {
                    return '';
                }
                return out.join(':');
            }

            function setGatewayMacValueLocal(inputApi, rawValue) {
                if (!inputApi || typeof inputApi.set !== 'function') {
                    return;
                }
                var parts = splitMacToPairs(rawValue || '');
                var out = ['', '', '', '', '', ''];
                var use = parts.slice(Math.max(0, parts.length - 6));
                var start = 6 - use.length;
                for (var i = 0; i < use.length; i++) {
                    var h = String(use[i] || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
                    if (h.length > 2) {
                        h = h.slice(h.length - 2);
                    }
                    if (h.length === 1) {
                        h = '0' + h;
                    }
                    out[start + i] = h;
                }
                inputApi.set(out, true);
            }

            function setMacRowValueLocal(rowObj, rawValue) {
                if (!rowObj || !rowObj.macInput || typeof rowObj.macInput.set !== 'function') {
                    return;
                }
                var slotCount = 8;
                var all = new Array(slotCount);
                var i;
                for (i = 0; i < slotCount; i++) {
                    all[i] = '';
                }

                var parts = splitMacToPairs(rawValue);
                var type = normalizeMacType(rowObj.typeSel && rowObj.typeSel.get ? rowObj.typeSel.get() : '');
                var enabledCount = (type === 'eth_mac') ? 6 : parseExactWiaMacLength(parts.length);
                if (!enabledCount) {
                    enabledCount = getEnabledMacSlotCount(type);
                }
                var use = parts.slice(Math.max(0, parts.length - enabledCount));
                var start = slotCount - use.length;
                for (i = 0; i < use.length; i++) {
                    all[start + i] = use[i];
                }
                rowObj.macInput.set(all, true);
            }

            function syncMacRowByTypeLocal(rowObj) {
                if (!rowObj || !rowObj.macInput || !rowObj.macInput.root) {
                    return;
                }
                var slotEls = rowObj.macInput.root.querySelectorAll('.adui-msi-slot');
                var sepEls = rowObj.macInput.root.querySelectorAll('.adui-msi-sep');
                if (!slotEls || !slotEls.length) {
                    return;
                }
                var type = normalizeMacType(rowObj.typeSel && rowObj.typeSel.get ? rowObj.typeSel.get() : '');
                var enabledCount = getEnabledMacSlotCount(type);
                var start = Math.max(0, slotEls.length - enabledCount);
                var segs = (typeof rowObj.macInput.getSegments === 'function') ? rowObj.macInput.getSegments() : [];
                var displayEnabledCount = enabledCount;
                if (!editEnabled && type === 'wia_mac') {
                    var usedCount = 0;
                    for (var s = 0; s < segs.length; s++) {
                        if (String(segs[s] || '').replace(/[^0-9a-fA-F]/g, '') !== '') {
                            usedCount++;
                        }
                    }
                    displayEnabledCount = usedCount ? (parseExactWiaMacLength(usedCount) || enabledCount) : 0;
                }
                var displayStart = Math.max(0, slotEls.length - displayEnabledCount);
                var normalized = [];
                var changed = false;
                var i;
                for (i = 0; i < slotEls.length; i++) {
                    var allowed = (i >= start);
                    var visible = (i >= displayStart);
                    var slot = slotEls[i];
                    slot.classList.toggle('ns-w24-mac-slot-disabled', !visible);
                    slot.disabled = (!editEnabled) || (!allowed);
                    if (!allowed) {
                        normalized[i] = '';
                        if (String(segs[i] || '') !== '') {
                            changed = true;
                        }
                    } else {
                        normalized[i] = String(segs[i] || '');
                    }
                }
                if (changed && typeof rowObj.macInput.set === 'function') {
                    rowObj.macInput.set(normalized, true);
                }

                for (i = 0; i < sepEls.length; i++) {
                    var sepEnabled = (i >= displayStart);
                    sepEls[i].classList.toggle('ns-w24-mac-sep-disabled', !sepEnabled);
                }
            }

            function focusFirstEnabledMacSlotLocal(rowObj) {
                if (!rowObj || !rowObj.macInput || !rowObj.macInput.root || !editEnabled) {
                    return;
                }
                var slotEls = rowObj.macInput.root.querySelectorAll('.adui-msi-slot');
                if (!slotEls || !slotEls.length) {
                    return;
                }
                var enabledCount = getEnabledMacSlotCount(rowObj.typeSel && rowObj.typeSel.get ? rowObj.typeSel.get() : '');
                if (enabledCount <= 0) {
                    return;
                }
                var start = Math.max(0, slotEls.length - enabledCount);
                if (typeof rowObj.macInput.focus === 'function') {
                    rowObj.macInput.focus(start);
                } else if (slotEls[start]) {
                    slotEls[start].focus();
                }
            }

            function bindMacInactiveAreaFocusLocal(rowObj) {
                if (!rowObj || !rowObj.macInput || !rowObj.macInput.root) {
                    return;
                }
                rowObj.macInput.root.addEventListener('mousedown', function (ev) {
                    if (!editEnabled) {
                        return;
                    }
                    var slotEls = rowObj.macInput.root.querySelectorAll('.adui-msi-slot');
                    if (!slotEls || !slotEls.length) {
                        return;
                    }

                    var enabledCount = getEnabledMacSlotCount(rowObj.typeSel && rowObj.typeSel.get ? rowObj.typeSel.get() : '');
                    if (enabledCount <= 0) {
                        return;
                    }
                    var start = Math.max(0, slotEls.length - enabledCount);
                    if (start <= 0) {
                        return;
                    }

                    var target = ev.target;
                    var i;
                    for (i = 0; i < slotEls.length; i++) {
                        if (slotEls[i] === target && i < start) {
                            ev.preventDefault();
                            focusFirstEnabledMacSlotLocal(rowObj);
                            return;
                        }
                    }

                    if (target && target.classList && target.classList.contains('adui-msi-sep')) {
                        var sepEls = rowObj.macInput.root.querySelectorAll('.adui-msi-sep');
                        for (i = 0; i < sepEls.length; i++) {
                            if (sepEls[i] === target && i < start) {
                                ev.preventDefault();
                                focusFirstEnabledMacSlotLocal(rowObj);
                                return;
                            }
                        }
                    }

                    if (target === rowObj.macInput.root && slotEls[start]) {
                        var firstEnabledRect = slotEls[start].getBoundingClientRect();
                        if (ev.clientX < firstEnabledRect.left) {
                            ev.preventDefault();
                            focusFirstEnabledMacSlotLocal(rowObj);
                        }
                    }
                });
            }

            function clearMacRowFeedbackLocal(rowObj) {
                if (!rowObj) {
                    return;
                }
                if (rowObj.macInput && rowObj.macInput.root) {
                    rowObj.macInput.root.classList.remove('ns-input-alert');
                }
                if (rowObj.macTip) {
                    rowObj.macTip.classList.remove('show');
                }
            }

            function showMacRowFeedbackLocal(rowObj, msg) {
                if (!rowObj || !msg) {
                    return;
                }
                if (rowObj.macInput && rowObj.macInput.root) {
                    rowObj.macInput.root.classList.remove('ns-input-alert');
                    void rowObj.macInput.root.offsetWidth;
                    rowObj.macInput.root.classList.add('ns-input-alert');
                }
                if (rowObj.macTip) {
                    rowObj.macTip.textContent = msg;
                    rowObj.macTip.classList.add('show');
                }
                if (rowObj.macTipTimer) {
                    clearTimeout(rowObj.macTipTimer);
                }
                rowObj.macTipTimer = setTimeout(function () {
                    clearMacRowFeedbackLocal(rowObj);
                    rowObj.macTipTimer = null;
                }, 1800);
            }

            function getMacRowValueLocal(rowObj) {
                if (!rowObj || !rowObj.macInput || typeof rowObj.macInput.getSegments !== 'function') {
                    return '';
                }
                var segs = rowObj.macInput.getSegments();
                var enabledCount = getEnabledMacSlotCount(rowObj.typeSel && rowObj.typeSel.get ? rowObj.typeSel.get() : '');
                var start = Math.max(0, segs.length - enabledCount);
                var out = [];
                var hasAny = false;
                for (var i = start; i < segs.length; i++) {
                    var part = String(segs[i] || '');
                    if (part !== '') {
                        hasAny = true;
                    }
                    out.push(part);
                }
                if (!hasAny) {
                    return '';
                }
                return out.join(':');
            }

            function clearMacRowLocal(rowObj) {
                if (!rowObj) {
                    return;
                }
                if (rowObj.typeSel && typeof rowObj.typeSel.set === 'function') {
                    rowObj.typeSel.set('', true);
                }
                if (rowObj.macInput && typeof rowObj.macInput.set === 'function') {
                    rowObj.macInput.set('', true);
                }
                syncMacRowByTypeLocal(rowObj);
            }

            function removeMacRowLocal(rowObj) {
                if (!rowObj) {
                    return;
                }
                if (macRows.length <= 1) {
                    clearMacRowLocal(rowObj);
                    return;
                }
                var idx = macRows.indexOf(rowObj);
                if (idx >= 0) {
                    macRows.splice(idx, 1);
                }
                if (rowObj.root && rowObj.root.parentNode) {
                    rowObj.root.parentNode.removeChild(rowObj.root);
                }
            }

            function createMacFilterRowLocal(initData) {
                var src = initData || {};
                var typeSel = makeSelectLocal([
                    { value: '', label: _('请选择') },
                    { value: 'eth_mac', label: 'eth_mac' },
                    { value: 'wia_mac', label: 'wia_mac' }
                ], normalizeMacType(src.type), '132px', false);
                var macInput = makeMacSlotInputLocal('');
                var macTip = E('span', { 'class': 'ns-w24-input-msg ns-w24-mac-msg' });
                var delBtn = E('button', {
                    'type': 'button',
                    'class': 'ns-w24-icon-btn ns-w24-mac-del',
                    'title': _('删除')
                }, [E('img', { 'src': '/luci-static/custom/img/trash.svg', 'alt': '' })]);

                var row = E('div', { 'class': 'ns-w24-mac-row' }, [
                    E('div', { 'class': 'ns-w24-mac-type' }, [typeSel.root]),
                    E('div', { 'class': 'ns-w24-mac-input' }, [macInput.root]),
                    E('div', { 'class': 'ns-w24-mac-del-wrap' }, [delBtn]),
                    E('div', { 'class': 'ns-w24-mac-msg-wrap' }, [macTip])
                ]);

                var rowObj = {
                    root: row,
                    typeSel: typeSel,
                    macInput: macInput,
                    macTip: macTip,
                    macTipTimer: null,
                    delBtn: delBtn
                };

                bindMacInactiveAreaFocusLocal(rowObj);

                if (rowObj.typeSel && typeof rowObj.typeSel.onChange === 'function') {
                    rowObj.typeSel.onChange(function () {
                        clearMacRowFeedbackLocal(rowObj);
                        syncMacRowByTypeLocal(rowObj);
                    });
                }
                if (rowObj.macInput && typeof rowObj.macInput.onChange === 'function') {
                    rowObj.macInput.onChange(function () {
                        clearMacRowFeedbackLocal(rowObj);
                        syncMacRowByTypeLocal(rowObj);
                    });
                }

                delBtn.addEventListener('click', function () {
                    if (!editEnabled) {
                        return;
                    }
                    removeMacRowLocal(rowObj);
                });

                setMacRowValueLocal(rowObj, src.mac || '');
                syncMacRowByTypeLocal(rowObj);
                macRows.push(rowObj);
                macList.appendChild(row);
                return rowObj;
            }

            function getMacFilterValuesLocal() {
                return macRows.map(function (r) {
                    return {
                        type: normalizeMacType((r.typeSel && typeof r.typeSel.get === 'function') ? String(r.typeSel.get() || '') : ''),
                        mac: getMacRowValueLocal(r)
                    };
                });
            }

            function validateMacFilterRowsLocal() {
                for (var i = 0; i < macRows.length; i++) {
                    var row = macRows[i];
                    var type = normalizeMacType((row.typeSel && typeof row.typeSel.get === 'function') ? String(row.typeSel.get() || '') : '');
                    var mac = getMacRowValueLocal(row);
                    var pairs = splitMacToPairs(mac).filter(function (p) {
                        return String(p || '').replace(/[^0-9a-fA-F]/g, '') !== '';
                    });
                    var segs = (row.macInput && typeof row.macInput.getSegments === 'function') ? row.macInput.getSegments() : [];
                    if (!type && !pairs.length) {
                        continue;
                    }
                    if (!type) {
                        showMacRowFeedbackLocal(row, '请选择MAC地址类型');
                        return false;
                    }
                    if (type === 'wia_mac') {
                        var firstFilled = -1;
                        var filledCount = 0;
                        for (var j = 0; j < segs.length; j++) {
                            var part = String(segs[j] || '').replace(/[^0-9a-fA-F]/g, '');
                            if (part !== '') {
                                if (firstFilled < 0) {
                                    firstFilled = j;
                                }
                                filledCount++;
                            }
                        }
                        if (firstFilled < 0 || !parseExactWiaMacLength(filledCount)) {
                            showMacRowFeedbackLocal(row, '非法wia_mac地址输入');
                            return false;
                        }
                        for (var k = firstFilled; k < segs.length; k++) {
                            if (String(segs[k] || '').replace(/[^0-9a-fA-F]/g, '') === '') {
                                showMacRowFeedbackLocal(row, '非法wia_mac地址输入');
                                return false;
                            }
                        }
                        continue;
                    }
                    if (!pairs.length) {
                        showMacRowFeedbackLocal(row, '请输入MAC地址');
                        return false;
                    }
                    if (type === 'eth_mac' && pairs.length !== 6) {
                        showMacRowFeedbackLocal(row, 'eth_mac 需填写6段MAC地址');
                        return false;
                    }
                }
                return true;
            }

            function setMacFilterValuesLocal(rows) {
                macRows.forEach(function (r) {
                    if (r.root && r.root.parentNode) {
                        r.root.parentNode.removeChild(r.root);
                    }
                });
                macRows = [];

                var list = Array.isArray(rows) && rows.length ? rows : [{}];
                list.forEach(function (item) {
                    createMacFilterRowLocal(item || {});
                });
            }

            function bindPositiveIntegerRangeLocal(inputEl, min, max, hintText) {
                if (!inputEl) {
                    return;
                }
                inputEl.addEventListener('input', function () {
                    var raw = String(inputEl.value || '');
                    var v = raw.replace(/[^\d]/g, '');
                    var corrected = false;
                    if (v !== raw) {
                        corrected = true;
                    }
                    if (v === '') {
                        inputEl.value = '';
                        if (corrected) {
                            showInputFeedbackLocal(inputEl, hintText || '');
                        }
                        return;
                    }
                    var n = parseInt(v, 10);
                    if (isNaN(n)) {
                        inputEl.value = '';
                        return;
                    }
                    if (n < min) {
                        n = min;
                        corrected = true;
                    }
                    if (n > max) {
                        n = max;
                        corrected = true;
                    }
                    inputEl.value = String(n);
                    if (corrected) {
                        showInputFeedbackLocal(inputEl, hintText || '');
                    }
                });
            }

            function bindDigitsOnlyLocal(inputEl, hintText) {
                if (!inputEl) {
                    return;
                }
                inputEl.addEventListener('input', function () {
                    var raw = String(inputEl.value || '');
                    var digits = raw.replace(/[^\d]/g, '');
                    if (digits !== raw) {
                        inputEl.value = digits;
                        showInputFeedbackLocal(inputEl, hintText || '');
                    }
                });
            }

            function bindSignedIntegerRangeLocal(inputEl, min, max, hintText) {
                if (!inputEl) {
                    return;
                }
                inputEl.addEventListener('input', function () {
                    var raw = String(inputEl.value || '');
                    var sign = '';
                    var corrected = false;
                    if (raw.indexOf('-') === 0) {
                        sign = '-';
                    }
                    var digits = raw.replace(/[^\d]/g, '');
                    var normalized = sign + digits;
                    if (raw !== normalized && raw !== '-' && raw !== '') {
                        corrected = true;
                    }
                    if (!digits) {
                        inputEl.value = sign;
                        if (corrected) {
                            showInputFeedbackLocal(inputEl, hintText || '');
                        }
                        return;
                    }
                    var n = parseInt(sign + digits, 10);
                    if (isNaN(n)) {
                        inputEl.value = '';
                        return;
                    }
                    if (n < min) {
                        n = min;
                        corrected = true;
                    }
                    if (n > max) {
                        n = max;
                        corrected = true;
                    }
                    inputEl.value = String(n);
                    if (corrected) {
                        showInputFeedbackLocal(inputEl, hintText || '');
                    }
                });
                inputEl.addEventListener('blur', function () {
                    var v = String(inputEl.value || '').trim();
                    if (v === '' || v === '-') {
                        inputEl.value = '';
                    }
                });
            }

            function bindUtf8MaxBytesLocal(inputEl, maxBytes, hintText) {
                if (!inputEl) {
                    return;
                }
                inputEl.addEventListener('input', function () {
                    var cur = String(inputEl.value || '');
                    var next = truncateUtf8ByBytes(cur, maxBytes);
                    if (next !== cur) {
                        inputEl.value = next;
                        showInputFeedbackLocal(inputEl, hintText || '');
                    }
                });
            }

            var connModeSel = makeSelectLocal([
                { value: '0', label: _('正常连接') },
                { value: '1', label: _('快速连接') }
            ], '0');
            var devRoleSel = makeSelectLocal([
                { value: '1', label: _('主AD') },
                { value: '0', label: _('从AD') }
            ], '1');
            var ssidInput = makeInputLocal(_('请输入SSID'));
            bindUtf8MaxBytesLocal(ssidInput, 32, '输入长度 0~32');
            var workChanCtrl = createWorkChannelControl(cfg.workChannel || {});
            var chanWidthOptions = [
                { value: '20', label: '20 MHz' },
                { value: '40', label: '40 MHz' }
            ];
            if (cfg.objId === OBJ_ID.WIRELESS_ATTR_5G) {
                chanWidthOptions.push(
                    { value: '80', label: '80 MHz' },
                    { value: '160', label: '160 MHz' }
                );
            }
            var chanWidthSel = makeSelectLocal(chanWidthOptions, '20');
            var commModeSel = makeSelectLocal([
                { value: '0', label: 'TDMA' },
                { value: '1', label: 'CSMA/CA' }
            ], '0');
            if (commModeSel && commModeSel.root && commModeSel.root.classList) {
                commModeSel.root.classList.add('ns-w24-readonly');
            }
            var netModeSel = makeSelectLocal([
                { value: '0', label: _('显式网络') },
                { value: '1', label: _('隐式网络') },
                { value: '2', label: _('无Beacon网络') }
            ], '0');
            var maxConnInput = makeInputLocal(_('请输入0-128'));
            var txPowerInput = makeInputLocal(_('请输入-128~127'));
            var retryTimesInput = makeInputLocal(_('请输入重传次数'));
            var rateInput = makeInputLocal(_('请输入速率'));
            var oneToManySel = makeRadioGroupLocal(cfg.key || 'wireless', '0');
            var gatewayMacInput = makeGatewayMacInputLocal('');
            if (gatewayMacInput && gatewayMacInput.root && gatewayMacInput.root.classList) {
                gatewayMacInput.root.classList.add('ns-w24-gateway-mac');
            }
            fields.push({ kind: 'workChannel', api: workChanCtrl });
            fields.push({ kind: 'radio', api: oneToManySel });
            fields.push({ kind: 'msi', api: gatewayMacInput });

            bindPositiveIntegerRangeLocal(maxConnInput, 0, 128, '输入范围 0~128');
            bindSignedIntegerRangeLocal(txPowerInput, -128, 127, '输入范围 -128~127');
            bindPositiveIntegerRangeLocal(retryTimesInput, 0, 50, '输入范围 0~50');
            bindPositiveIntegerRangeLocal(rateInput, 0, 65535, '输入范围 0~65535');

            var modifyBtn = E('button', {
                'type': 'button',
                'class': 'ns-btn ad-c-btn ns-w24-modify-btn'
            }, _('配置修改'));

            var saveBtn = E('button', {
                'type': 'button',
                'class': 'ns-btn ad-c-btn ad-c-btn--primary primary'
            }, _('配置保存'));

            var applyBtn = E('button', {
                'type': 'button',
                'class': 'ns-btn ad-c-btn'
            }, _('配置生效'));

            var macFilterControl = E('div', { 'class': 'ns-w24-mac-wrap' }, [
                macList,
                E('div', { 'class': 'ns-w24-mac-add-wrap' }, [macAddBtn])
            ]);

            var form = E('div', { 'class': 'ns-w24-form' }, [
                makeFormRow(_('设备连接方式'), connModeSel.root),
                makeFormRow(_('SSID'), getInputControlLocal(ssidInput)),
                makeFormRow(_('工作信道'), workChanCtrl.root),
                makeFormRow(_('信道宽度'), chanWidthSel.root),
                makeFormRow(_('通信模式'), commModeSel.root),
                makeFormRow(_('网络模式'), netModeSel.root),
                makeFormRow(_('最大连接数'), getInputControlLocal(maxConnInput)),
                makeFormRow(_('发射功率'), getInputControlLocal(txPowerInput)),
                makeFormRow(_('重传次数'), getInputControlLocal(retryTimesInput)),
                makeFormRow(_('速率'), getInputControlLocal(rateInput))
            ]);
            var oneToManyRow = makeFormRow(_('一发多收'), oneToManySel.root);
            var devRoleRow = makeFormRow(_('设备角色'), devRoleSel.root);
            var gatewayMacRow = makeFormRow(_('网关MAC'), gatewayMacInput.root);
            var advancedForm = E('div', { 'class': 'ns-w24-form ns-w24-advanced-form' }, [
                oneToManyRow,
                devRoleRow,
                gatewayMacRow
            ]);

            var basicConfigCard = E('div', { 'class': 'ns-w24-config-card' }, [
                E('div', { 'class': 'ns-w24-config-card-title' }, _('基础配置')),
                E('div', { 'class': 'ns-w24-config-card-body ns-w24-config-card-body--basic' }, [form, advancedForm])
            ]);
            var securityConfigCard = E('div', { 'class': 'ns-w24-config-card' }, [
                E('div', { 'class': 'ns-w24-config-card-title' }, _('安全配置')),
                E('div', { 'class': 'ns-w24-config-card-body' }, [
                    E('div', { 'class': 'ns-w24-form' }, [
                        makeFormRow(_('MAC地址过滤'), macFilterControl, null, 'ns-w24-form-row--mac')
                    ])
                ])
            ]);
            var configGrid = E('div', { 'class': 'ns-w24-config-grid' }, [
                basicConfigCard,
                securityConfigCard
            ]);

            function setEditable(editable) {
                editEnabled = !!editable;
                fields.forEach(function (ctrl) {
                    if (!ctrl) {
                        return;
                    }
                    if (ctrl.kind === 'select' && ctrl.api && typeof ctrl.api.setDisabled === 'function') {
                        var forceReadonly = (ctrl.api === commModeSel);
                        ctrl.api.setDisabled(forceReadonly || !editEnabled);
                        return;
                    }
                    if (ctrl.kind === 'workChannel' && ctrl.api && typeof ctrl.api.setDisabled === 'function') {
                        ctrl.api.setDisabled(!editEnabled);
                        return;
                    }
                    if (ctrl.kind === 'input' && ctrl.el) {
                        if (editEnabled) {
                            ctrl.el.removeAttribute('disabled');
                            ctrl.el.classList.remove('is-readonly');
                        } else {
                            ctrl.el.setAttribute('disabled', 'disabled');
                            ctrl.el.classList.add('is-readonly');
                        }
                        return;
                    }
                    if (ctrl.kind === 'radio' && ctrl.api && typeof ctrl.api.setDisabled === 'function') {
                        ctrl.api.setDisabled(!editEnabled);
                        return;
                    }
                    if (ctrl.kind === 'msi' && ctrl.api && ctrl.api.root) {
                        var slotEls = ctrl.api.root.querySelectorAll('.adui-msi-slot');
                        for (var i = 0; i < slotEls.length; i++) {
                            slotEls[i].disabled = !editEnabled;
                        }
                    }
                });

                var txRaw = String(txPowerInput.value || '').replace(/\s*dBm\s*$/i, '').trim();
                txPowerInput.value = editEnabled ? txRaw : (txRaw ? (txRaw + ' dBm') : '');

                macRows.forEach(function (r) {
                    if (r.typeSel && typeof r.typeSel.setDisabled === 'function') {
                        r.typeSel.setDisabled(!editEnabled);
                    }
                    syncMacRowByTypeLocal(r);
                    if (r.delBtn) {
                        r.delBtn.disabled = !editEnabled;
                        r.delBtn.classList.toggle('is-disabled', !editEnabled);
                    }
                });
                macAddBtn.disabled = !editEnabled;
                macAddBtn.classList.toggle('is-disabled', !editEnabled);

                saveBtn.disabled = !editEnabled;
                saveBtn.classList.toggle('is-disabled', !editEnabled);
                modifyBtn.textContent = editEnabled ? _('取消修改') : _('配置修改');
            }

            function updateOneToManyDependentRows() {
                var enabled = String(oneToManySel.get() || '0') === '1';
                devRoleRow.classList.toggle('ns-w24-form-row-hidden', !enabled);
                gatewayMacRow.classList.toggle('ns-w24-form-row-hidden', !enabled);

                if (devRoleSel && typeof devRoleSel.setDisabled === 'function') {
                    devRoleSel.setDisabled(!editEnabled || !enabled);
                }

                if (gatewayMacInput && gatewayMacInput.root) {
                    var slotEls = gatewayMacInput.root.querySelectorAll('.adui-msi-slot');
                    for (var i = 0; i < slotEls.length; i++) {
                        slotEls[i].disabled = !editEnabled || !enabled;
                    }
                    gatewayMacInput.root.classList.toggle('is-readonly', !editEnabled || !enabled);
                }
            }

            function getValues() {
                return {
                    conn_mode: String(connModeSel.get() || ''),
                    dev_role: String(devRoleSel.get() || ''),
                    ssid: String(ssidInput.value || ''),
                    work_channel: String(workChanCtrl.get() || ''),
                    channel_width: String(chanWidthSel.get() || ''),
                    comm_mode: String(commModeSel.get() || ''),
                    network_mode: String(netModeSel.get() || ''),
                    max_conn: String(maxConnInput.value || ''),
                    tx_power: String(txPowerInput.value || '').replace(/\s*dBm\s*$/i, '').trim(),
                    retry_times_ui: String(retryTimesInput.value || ''),
                    rate_ui: String(rateInput.value || ''),
                    one_to_many_ui: String(oneToManySel.get() || '0'),
                    gateway_mac_ui: getGatewayMacValueLocal(gatewayMacInput),
                    mac_filter: getMacFilterValuesLocal()
                };
            }

            function setValues(v) {
                var src = v || {};
                connModeSel.set(src.conn_mode != null ? String(src.conn_mode) : '0', true);
                devRoleSel.set(src.dev_role != null ? String(src.dev_role) : '1', true);
                ssidInput.value = src.ssid != null ? String(src.ssid) : '';
                workChanCtrl.set(src.work_channel != null ? String(src.work_channel) : '', true);
                chanWidthSel.set(src.channel_width != null ? String(src.channel_width) : '20', true);
                commModeSel.set(src.comm_mode != null ? String(src.comm_mode) : '0', true);
                netModeSel.set(src.network_mode != null ? String(src.network_mode) : '0', true);
                maxConnInput.value = src.max_conn != null ? String(src.max_conn) : '';
                txPowerInput.value = src.tx_power != null ? String(src.tx_power).replace(/\s*dBm\s*$/i, '').trim() : '';
                retryTimesInput.value = src.retry_times_ui != null ? String(src.retry_times_ui) : '';
                rateInput.value = src.rate_ui != null ? String(src.rate_ui) : '';
                oneToManySel.set(src.one_to_many_ui != null ? String(src.one_to_many_ui) : '0');
                setGatewayMacValueLocal(gatewayMacInput, src.gateway_mac_ui != null ? String(src.gateway_mac_ui) : '');
                setMacFilterValuesLocal(src.mac_filter);
                updateOneToManyDependentRows();
                setEditable(editEnabled);
            }

            function pickPersistedValues(v) {
                var src = v || {};
                var oneToMany = String(src.one_to_many_ui || '0');
                return {
                    conn_mode: src.conn_mode,
                    dev_role: oneToMany === '1' ? src.dev_role : '',
                    ssid: src.ssid,
                    work_channel: src.work_channel,
                    channel_width: src.channel_width,
                    comm_mode: src.comm_mode,
                    network_mode: src.network_mode,
                    max_conn: src.max_conn,
                    tx_power: src.tx_power,
                    retry_times_ui: src.retry_times_ui,
                    rate_ui: src.rate_ui,
                    one_to_many_ui: src.one_to_many_ui,
                    gateway_mac_ui: oneToMany === '1' ? src.gateway_mac_ui : '',
                    mac_filter: src.mac_filter
                };
            }

            function isValueChanged() {
                if (!editSnapshot) {
                    return false;
                }
                return JSON.stringify(pickPersistedValues(getValues())) !== JSON.stringify(pickPersistedValues(editSnapshot));
            }

            function isNewFieldsValid() {
                var retry = String(retryTimesInput.value || '').trim();
                if (retry !== '') {
                    if (!/^\d+$/.test(retry)) {
                        showInputFeedbackLocal(retryTimesInput, '输入范围 0~50');
                        return false;
                    }
                    var r = parseInt(retry, 10);
                    if (isNaN(r) || r < 0 || r > 50) {
                        showInputFeedbackLocal(retryTimesInput, '输入范围 0~50');
                        return false;
                    }
                }

                var rate = String(rateInput.value || '').trim();
                if (rate !== '') {
                    if (!/^\d+$/.test(rate)) {
                        showInputFeedbackLocal(rateInput, '输入范围 0~65535');
                        return false;
                    }
                    var n = parseInt(rate, 10);
                    if (isNaN(n) || n < 0 || n > 65535) {
                        showInputFeedbackLocal(rateInput, '输入范围 0~65535');
                        return false;
                    }
                }

                var gatewayMac = String(getGatewayMacValueLocal(gatewayMacInput) || '').trim();
                if (utf8ByteLength(gatewayMac) > 63) {
                    showWarn('网关MAC长度不能超过63字符');
                    return false;
                }
                if (gatewayMac !== '' && !/^[0-9a-fA-F:]+$/.test(gatewayMac)) {
                    showWarn('网关MAC仅允许十六进制字符和冒号');
                    return false;
                }
                if (!validateMacFilterRowsLocal()) {
                    return false;
                }
                return true;
            }

            function buildChangedWriteInsts(beforeVal, afterVal) {
                var before = beforeVal || {};
                var after = afterVal || {};
                var resMap = (cfg.objId === OBJ_ID.WIRELESS_ATTR_5G) ? RES.WIRELESS_ATTR_5G : RES.WIRELESS_ATTR_24G;
                var insts = [];

                function changed(k) {
                    return JSON.stringify(before[k]) !== JSON.stringify(after[k]);
                }

                function u8(resId, v) {
                    insts.push(wU8Inst(strcatURI(cfg.objId, 0, resId), parseIntSafe(v, 0)));
                }
                function bool(resId, v) {
                    insts.push(wBoolInst(strcatURI(cfg.objId, 0, resId), parseIntSafe(v, 0)));
                }
                function u16(resId, v) {
                    insts.push(wU16Inst(strcatURI(cfg.objId, 0, resId), parseIntSafe(v, 0)));
                }
                function i8(resId, v) {
                    var n = parseIntSafe(v, 0);
                    if (n < -128) {
                        n = -128;
                    }
                    if (n > 127) {
                        n = 127;
                    }
                    insts.push(createInstArray(
                        strcatURI(cfg.objId, 0, resId),
                        OPT_TYPE.WRITE,
                        OPT_RANGE.SINGLE_RES,
                        VALUE_TYPE.I8,
                        VALUE_LENGTH.I8,
                        String(n)
                    ));
                }
                function opaque(resId, hex) {
                    insts.push(wByteArrayInst(strcatURI(cfg.objId, 0, resId), hex));
                }

                if (changed('conn_mode')) {
                    u8(resMap.CONN_MODE, after.conn_mode);
                }
                if (changed('dev_role')) {
                    if (String(after.one_to_many_ui || '0') === '1') {
                        bool(resMap.IS_MASTER_AD, after.dev_role);
                    }
                }
                if (changed('ssid')) {
                    opaque(resMap.NETW_SSID, utf8ToHex(after.ssid));
                }
                if (changed('work_channel')) {
                    u16(resMap.WORK_CHAN, after.work_channel);
                }
                if (changed('channel_width')) {
                    u8(resMap.BAND_WIDTH, after.channel_width);
                }
                if (changed('comm_mode')) {
                    u8(resMap.COMM_MODE, after.comm_mode);
                }
                if (changed('network_mode')) {
                    u8(resMap.NETW_MODE, after.network_mode);
                }
                if (changed('max_conn')) {
                    u8(resMap.MAX_CONN_CNT, after.max_conn);
                }
                if (changed('tx_power')) {
                    i8(resMap.TX_POWER, after.tx_power);
                }
                if (changed('one_to_many_ui')) {
                    bool(resMap.MULTI_RCV_ENABLED, after.one_to_many_ui);
                }
                if (changed('retry_times_ui')) {
                    u8(resMap.RETR_CNT, after.retry_times_ui);
                }
                if (changed('rate_ui')) {
                    u16(resMap.RATE, after.rate_ui);
                }
                if (changed('gateway_mac_ui')) {
                    if (String(after.one_to_many_ui || '0') === '1') {
                        insts.push(wStrInst(strcatURI(cfg.objId, 0, resMap.GATEWAY_MAC), String(after.gateway_mac_ui || '')));
                    }
                }
                if (changed('mac_filter')) {
                    opaque(resMap.MAC_FILTER, encodeMacFilterRowsToHex(after.mac_filter));
                }

                return insts;
            }

            function writeChangedValues(snapshotBefore, currentVal) {
                var dev = getActiveDev();
                if (!dev || !(dev.dev_id || dev.id)) {
                    showWarn('未获取到当前设备信息');
                    return Promise.resolve(false);
                }
                var insts = buildChangedWriteInsts(snapshotBefore, currentVal);
                if (!insts.length) {
                    return Promise.resolve(true);
                }
                var req;
                try {
                    req = createEmpRequest(dev.dev_type, dev.dev_id, insts);
                    req = attachAuditAction(req, 'WIRELESS_CONFIG_SAVE', {
                        sectionTitle: getTabTitle(cfg.key)
                    });
                } catch (e) {
                    console.error('[WIRELESS] create write request failed:', e);
                    return Promise.resolve(false);
                }
                return getEmpApi().then(function (api) {
                    return api.empRequest(req);
                }).then(function (resp) {
                    var nr = normalizeEmp(resp);
                    if (!nr.ok) {
                        showWarn('保存配置失败（' + empResultCodeText(nr.code) + '）');
                        return false;
                    }
                    return true;
                }).catch(function (e) {
                    console.error('[WIRELESS] write failed:', e);
                    showWarn('保存配置失败');
                    return false;
                });
            }

            function parseWirelessAttrsFromArrays(arrays) {
                var out = {
                    conn_mode: '0',
                    dev_role: '1',
                    ssid: '',
                    work_channel: '',
                    channel_width: '20',
                    comm_mode: '0',
                    network_mode: '0',
                    max_conn: '',
                    tx_power: '',
                    retry_times_ui: '',
                    rate_ui: '',
                    one_to_many_ui: '0',
                    gateway_mac_ui: '',
                    mac_filter: [{}]
                };
                var resMap = (cfg.objId === OBJ_ID.WIRELESS_ATTR_5G) ? RES.WIRELESS_ATTR_5G : RES.WIRELESS_ATTR_24G;
                var byRes = {};

                (arrays || []).forEach(function (it) {
                    var uri = String((it && it.uri) || '');
                    var parts = uri.split('/');
                    if (parts.length < 3) {
                        return;
                    }
                    if (parseIntSafe(parts[0], -1) !== cfg.objId) {
                        return;
                    }
                    if (parseIntSafe(parts[1], -1) !== 0) {
                        return;
                    }
                    var resId = parseIntSafe(parts[2], -1);
                    if (resId < 0) {
                        return;
                    }
                    byRes[resId] = String((it && it.value_payload != null) ? it.value_payload : '');
                });

                if (byRes[resMap.CONN_MODE] != null) {
                    out.conn_mode = String(byRes[resMap.CONN_MODE]);
                }
                if (byRes[resMap.IS_MASTER_AD] != null) {
                    out.dev_role = String(parseIntSafe(byRes[resMap.IS_MASTER_AD], 1) === 1 ? '1' : '0');
                }
                if (byRes[resMap.NETW_SSID] != null) {
                    out.ssid = parseSsidPayload(byRes[resMap.NETW_SSID]);
                }
                if (byRes[resMap.WORK_CHAN] != null) {
                    out.work_channel = String(byRes[resMap.WORK_CHAN]);
                }
                if (byRes[resMap.BAND_WIDTH] != null) {
                    out.channel_width = String(byRes[resMap.BAND_WIDTH]);
                }
                if (byRes[resMap.COMM_MODE] != null) {
                    out.comm_mode = String(byRes[resMap.COMM_MODE]);
                }
                if (byRes[resMap.NETW_MODE] != null) {
                    out.network_mode = String(byRes[resMap.NETW_MODE]);
                }
                if (byRes[resMap.MAX_CONN_CNT] != null) {
                    out.max_conn = String(byRes[resMap.MAX_CONN_CNT]);
                }
                if (byRes[resMap.TX_POWER] != null) {
                    out.tx_power = String(byRes[resMap.TX_POWER]).replace(/\s*dBm\s*$/i, '').trim();
                }
                if (byRes[resMap.MULTI_RCV_ENABLED] != null) {
                    out.one_to_many_ui = String(parseIntSafe(byRes[resMap.MULTI_RCV_ENABLED], 1) === 1 ? '1' : '0');
                }
                if (byRes[resMap.RETR_CNT] != null) {
                    out.retry_times_ui = String(byRes[resMap.RETR_CNT]);
                }
                if (byRes[resMap.RATE] != null) {
                    out.rate_ui = String(byRes[resMap.RATE]);
                }
                if (byRes[resMap.GATEWAY_MAC] != null) {
                    out.gateway_mac_ui = normalizeGatewayMacPayload(byRes[resMap.GATEWAY_MAC]);
                }
                if (byRes[resMap.MAC_FILTER] != null) {
                    var parsedRows = parseMacFilterPayload(byRes[resMap.MAC_FILTER]);
                    out.mac_filter = parsedRows.length ? parsedRows : [{}];
                }

                return out;
            }

            function buildWirelessReadInsts() {
                var resMap = (cfg.objId === OBJ_ID.WIRELESS_ATTR_5G) ? RES.WIRELESS_ATTR_5G : RES.WIRELESS_ATTR_24G;
                var resIds = [
                    resMap.CONN_MODE,
                    resMap.IS_MASTER_AD,
                    resMap.NETW_SSID,
                    resMap.WORK_CHAN,
                    resMap.BAND_WIDTH,
                    resMap.COMM_MODE,
                    resMap.NETW_MODE,
                    resMap.MAX_CONN_CNT,
                    resMap.TX_POWER,
                    resMap.MULTI_RCV_ENABLED,
                    resMap.RETR_CNT,
                    resMap.RATE,
                    resMap.GATEWAY_MAC,
                    resMap.MAC_FILTER
                ];
                var insts = [];
                resIds.forEach(function (resId) {
                    if (resId == null) {
                        return;
                    }
                    insts.push(rSingleInst(strcatURI(cfg.objId, 0, resId)));
                });
                return insts;
            }

            function refreshFromBackend(force) {
                if (!cfg.objId) {
                    return Promise.resolve(false);
                }
                if (loadingFromBackend) {
                    return Promise.resolve(false);
                }
                if (editEnabled && !force) {
                    return Promise.resolve(false);
                }

                var dev = getActiveDev();
                if (!dev || !(dev.dev_id || dev.id)) {
                    return Promise.resolve(false);
                }

                var req;
                try {
                    req = createEmpRequest(
                        dev.dev_type,
                        dev.dev_id,
                        buildWirelessReadInsts()
                    );
                } catch (e) {
                    console.error('[WIRELESS] create request failed:', e);
                    return Promise.resolve(false);
                }

                loadingFromBackend = true;
                return getEmpApi().then(function (api) {
                    return api.empRequest(req);
                }).then(function (resp) {
                    var nr = normalizeEmp(resp);
                    var arrays = Array.isArray(nr.arrays) ? nr.arrays : [];
                    var hasData = arrays.length > 0;

                    if (!nr.ok && !hasData) {
                        showWarn('读取无线配置失败（' + empResultCodeText(nr.code) + '）');
                        return false;
                    }
                    if (!nr.ok && hasData) {
                        console.warn('[WIRELESS] query code is non-zero but payload exists, continue rendering:', nr.code);
                    }

                    setValues(parseWirelessAttrsFromArrays(arrays));
                    if (!editEnabled) {
                        editSnapshot = null;
                    }
                    return true;
                }).catch(function (e) {
                    console.error('[WIRELESS] query failed:', e);
                    showWarn('读取无线配置失败');
                    return false;
                }).finally(function () {
                    loadingFromBackend = false;
                });
            }

            createMacFilterRowLocal({});
            oneToManySel.onChange(function () {
                updateOneToManyDependentRows();
            });
            macAddBtn.addEventListener('click', function () {
                if (!editEnabled) {
                    return;
                }
                createMacFilterRowLocal({});
                setEditable(editEnabled);
            });

            modifyBtn.addEventListener('click', function () {
                if (!editEnabled) {
                    editSnapshot = getValues();
                    setEditable(true);
                    return;
                }
                if (editSnapshot) {
                    setValues(editSnapshot);
                }
                setEditable(false);
                editSnapshot = null;
            });

            saveBtn.addEventListener('click', function () {
                if (!editEnabled) {
                    return;
                }
                if (!workChanCtrl.isValid()) {
                    return;
                }
                if (!isNewFieldsValid()) {
                    return;
                }
                var currentValues = getValues();
                if (!isValueChanged()) {
                    showWarn('未检测到配置变更');
                    setEditable(false);
                    editSnapshot = null;
                    return;
                }
                var snapshotBefore = editSnapshot ? JSON.parse(JSON.stringify(editSnapshot)) : null;
                writeChangedValues(snapshotBefore, currentValues).then(function (ok) {
                    if (!ok) {
                        return;
                    }
                    if (typeof window.toastSuccess === 'function') {
                        window.toastSuccess('保存配置成功');
                    }
                    setEditable(false);
                    editSnapshot = null;
                    refreshFromBackend(true).catch(function () { });
                });
            });

            applyBtn.addEventListener('click', function () {
                showApplyRebootConfirm();
            });

            setEditable(false);
            updateOneToManyDependentRows();

            var panel = E('div', { 'class': 'ns-wireless-panel', 'data-key': cfg.key }, [
                E('div', { 'class': 'ns-w24-main' }, [configGrid]),
                E('div', { 'class': 'ns-w24-actions-block' }, [
                    E('div', { 'class': 'ns-w24-actions' }, [modifyBtn, saveBtn, applyBtn])
                ])
            ]);

            return {
                panel: panel,
                refreshFromBackend: refreshFromBackend
            };
        }

        function createLowPowerSection(cfg) {
            var inputFeedbackMapLocal = new WeakMap();
            var lpObjId = OBJ_ID.AD_LP;

            function makeInputLocal(placeholder, readonly) {
                var el = E('input', {
                    'class': 'ns-input ad-c-input' + (readonly ? ' is-readonly' : ''),
                    'type': 'text',
                    'placeholder': placeholder || _('请输入')
                });
                if (readonly) {
                    el.setAttribute('disabled', 'disabled');
                }
                var tip = E('span', { 'class': 'ns-w24-input-msg' });
                inputFeedbackMapLocal.set(el, {
                    tip: tip,
                    timer: null
                });
                return {
                    input: el,
                    tip: tip
                };
            }

            function showInputFeedbackLocal(el, msg) {
                var fb = inputFeedbackMapLocal.get(el);
                if (!fb || !msg) {
                    return;
                }
                el.classList.remove('ns-input-alert');
                void el.offsetWidth;
                el.classList.add('ns-input-alert');

                fb.tip.textContent = msg;
                fb.tip.classList.add('show');

                if (fb.timer) {
                    clearTimeout(fb.timer);
                }
                fb.timer = setTimeout(function () {
                    el.classList.remove('ns-input-alert');
                    fb.tip.classList.remove('show');
                }, 1800);
            }

            function makeLowPowerSelect(options, value, minWidth) {
                if (!window.adComponents || typeof window.adComponents.createSingleSelect !== 'function') {
                    throw new Error('adComponents.createSingleSelect is not available');
                }
                return window.adComponents.createSingleSelect({
                    options: options || [],
                    value: value || '',
                    placeholder: _('请选择'),
                    styleVars: {
                        '--adui-ss-min-width': minWidth || '420px',
                        '--adui-ss-arrow-color': '#968a80',
                        '--adui-ss-placeholder': '#968a80',
                        '--adui-ss-menu-border': '#e9dfd5',
                        '--adui-ss-menu-bg': '#ffffff',
                        '--adui-ss-menu-text': '#3d434c',
                        '--adui-ss-menu-hover-bg': '#fff4ec'
                    }
                });
            }

            function createRefreshBtn(label) {
                return E('button', {
                    'type': 'button',
                    'class': 'ns-w24-icon-btn ns-lp-refresh-btn',
                    'title': _('刷新')
                }, [E('img', { 'src': '/luci-static/custom/img/refresh.svg', 'alt': String(label || '') })]);
            }

            function createSaveBtn(label) {
                return E('button', {
                    'type': 'button',
                    'class': 'ns-w24-icon-btn ns-lp-save-btn',
                    'title': _('保存修改')
                }, [E('img', { 'src': '/luci-static/custom/img/save.svg', 'alt': String(label || '') })]);
            }

            function spinOnce(btn) {
                if (!btn) {
                    return;
                }
                var ico = btn.querySelector('img') || btn;
                ico.classList.remove('spin-once');
                void ico.offsetWidth;
                ico.classList.add('spin-once');
                var onEnd = function () {
                    ico.classList.remove('spin-once');
                    ico.removeEventListener('animationend', onEnd);
                };
                ico.addEventListener('animationend', onEnd);
            }

            function makeFieldControl(field) {
                var selectObj = null;
                var inputObj = null;
                var controlNode = null;
                if (Array.isArray(field.options)) {
                    selectObj = makeLowPowerSelect(field.options, field.value || '', '420px');
                    if (selectObj.root && selectObj.root.classList) {
                        selectObj.root.classList.add('ns-lp-select');
                    }
                    controlNode = selectObj.root;
                } else {
                    inputObj = makeInputLocal(field.placeholder, !!field.readonly);
                    controlNode = inputObj.input;
                }
                var refreshBtn = createRefreshBtn(field.label);
                var saveBtn = null;
                var wrap = E('div', { 'class': 'ns-lp-field-control' }, [
                    controlNode,
                    refreshBtn,
                    inputObj ? inputObj.tip : E('span', { 'class': 'ns-w24-input-msg' })
                ]);
                var tip = wrap.querySelector('.ns-w24-input-msg');
                if (field.showSave) {
                    saveBtn = createSaveBtn(field.label);
                    wrap.insertBefore(saveBtn, tip);
                }
                refreshBtn.addEventListener('click', function () {
                    spinOnce(refreshBtn);
                    if (typeof field.onRefresh === 'function') {
                        field.onRefresh();
                    } else {
                        showWarn('字段刷新功能待接入');
                    }
                });
                if (saveBtn) {
                    saveBtn.addEventListener('click', function () {
                        if (typeof field.onSave === 'function') {
                            field.onSave(selectObj ? String(selectObj.get() || '') : String(inputObj.input.value || ''));
                        } else {
                            showWarn('保存功能待接入');
                        }
                    });
                }
                return {
                    root: wrap,
                    input: inputObj ? inputObj.input : null,
                    select: selectObj,
                    get: function () {
                        return selectObj ? String(selectObj.get() || '') : String(inputObj.input.value || '');
                    },
                    set: function (value, silent) {
                        if (selectObj) {
                            selectObj.set(String(value == null ? '' : value), !!silent);
                            return;
                        }
                        inputObj.input.value = String(value == null ? '' : value);
                    },
                    refreshBtn: refreshBtn,
                    saveBtn: saveBtn
                };
            }

            function bindPositiveIntegerRangeLocal(inputEl, min, max, hintText) {
                if (!inputEl) {
                    return;
                }
                inputEl.addEventListener('input', function () {
                    var raw = String(inputEl.value || '');
                    var v = raw.replace(/[^\d]/g, '');
                    var corrected = false;
                    if (v !== raw) {
                        corrected = true;
                    }
                    if (v === '') {
                        inputEl.value = '';
                        if (corrected) {
                            showInputFeedbackLocal(inputEl, hintText || '');
                        }
                        return;
                    }
                    var n = parseInt(v, 10);
                    if (isNaN(n)) {
                        inputEl.value = '';
                        return;
                    }
                    if (n < min) {
                        n = min;
                        corrected = true;
                    }
                    if (n > max) {
                        n = max;
                        corrected = true;
                    }
                    inputEl.value = String(n);
                    if (corrected) {
                        showInputFeedbackLocal(inputEl, hintText || '');
                    }
                });
            }

            function bindLowPowerTxRange(inputEl, hintText) {
                if (!inputEl) {
                    return;
                }
                var allowed = {};
                var lastValid = '';
                var i;
                for (i = 0; i <= 8; i++) {
                    allowed[String(i)] = true;
                }
                for (i = -2; i >= -20; i -= 2) {
                    allowed[String(i)] = true;
                }

                inputEl.addEventListener('input', function () {
                    var raw = String(inputEl.value || '');
                    var sign = '';
                    if (raw.indexOf('-') === 0) {
                        sign = '-';
                    }
                    var digits = raw.replace(/[^\d]/g, '');
                    var normalized = sign + digits;
                    if (normalized !== raw) {
                        inputEl.value = normalized;
                        showInputFeedbackLocal(inputEl, hintText || '');
                    }

                    var cur = String(inputEl.value || '');
                    if (cur === '' || cur === '-') {
                        if (cur === '') {
                            lastValid = '';
                        }
                        return;
                    }

                    if (!allowed[cur]) {
                        inputEl.value = lastValid;
                        showInputFeedbackLocal(inputEl, hintText || '');
                        return;
                    }
                    lastValid = cur;
                });

                inputEl.addEventListener('blur', function () {
                    var v = String(inputEl.value || '').trim();
                    if (!v) {
                        lastValid = '';
                        return;
                    }
                    if (v === '-') {
                        inputEl.value = '';
                        lastValid = '';
                        showInputFeedbackLocal(inputEl, hintText || '');
                        return;
                    }
                    if (!allowed[v]) {
                        inputEl.value = lastValid;
                        showInputFeedbackLocal(inputEl, hintText || '');
                        return;
                    }
                    lastValid = v;
                });
            }

            function isLowPowerTxAllowed(v) {
                var s = String(v == null ? '' : v).trim();
                if (!s) {
                    return false;
                }
                var n = parseInt(s, 10);
                if (isNaN(n)) {
                    return false;
                }
                if (n >= 0 && n <= 8) {
                    return true;
                }
                return (n <= -2 && n >= -20 && (n % 2 === 0));
            }

            function makeNumberOptions(min, max) {
                var out = [];
                for (var i = min; i <= max; i++) {
                    out.push({ value: String(i), label: String(i) });
                }
                return out;
            }

            function makeLowPowerTxOptions() {
                var out = makeNumberOptions(0, 8);
                for (var i = -2; i >= -20; i -= 2) {
                    out.push({ value: String(i), label: String(i) });
                }
                return out;
            }

            function readLpResource(resId, auditKey, auditCtx) {
                var dev = getActiveDev();
                if (!dev || !(dev.dev_id || dev.id)) {
                    showWarn('未获取到当前设备信息');
                    return Promise.resolve(null);
                }
                var req;
                try {
                    req = createEmpRequest(
                        dev.dev_type,
                        dev.dev_id,
                        rSingleInst(strcatURI(lpObjId, 0, resId))
                    );
                    if (auditKey) {
                        req = attachAuditAction(req, auditKey, auditCtx || {});
                    }
                } catch (e) {
                    console.error('[LOWPOWER] create read request failed:', e);
                    return Promise.resolve(null);
                }

                return getEmpApi().then(function (api) {
                    return api.empRequest(req);
                }).then(function (resp) {
                    var nr = normalizeEmp(resp);
                    var arrays = Array.isArray(nr.arrays) ? nr.arrays : [];
                    var hasData = arrays.length > 0;
                    if (!nr.ok && !hasData) {
                        showWarn('刷新失败（' + empResultCodeText(nr.code) + '）');
                        return null;
                    }
                    var expectedUri = String(lpObjId) + '/0/' + String(resId);
                    for (var i = 0; i < arrays.length; i++) {
                        var it = arrays[i] || {};
                        if (String(it.uri || '') === expectedUri) {
                            return String(it.value_payload == null ? '' : it.value_payload);
                        }
                    }
                    return hasData ? String(arrays[0].value_payload == null ? '' : arrays[0].value_payload) : null;
                }).catch(function (e) {
                    console.error('[LOWPOWER] read failed:', e);
                    showWarn('刷新失败');
                    return null;
                });
            }

            function writeLpU8Resource(resId, value, auditKey, auditCtx) {
                var dev = getActiveDev();
                if (!dev || !(dev.dev_id || dev.id)) {
                    showWarn('未获取到当前设备信息');
                    return Promise.resolve(false);
                }
                var req;
                try {
                    req = createEmpRequest(
                        dev.dev_type,
                        dev.dev_id,
                        wU8Inst(strcatURI(lpObjId, 0, resId), value)
                    );
                    req = attachAuditAction(req, auditKey, auditCtx || {});
                } catch (e) {
                    console.error('[LOWPOWER] create write request failed:', e);
                    return Promise.resolve(false);
                }
                return getEmpApi().then(function (api) {
                    return api.empRequest(req);
                }).then(function (resp) {
                    var nr = normalizeEmp(resp);
                    if (!nr.ok) {
                        showWarn('保存失败（' + empResultCodeText(nr.code) + '）');
                        return false;
                    }
                    if (typeof window.toastSuccess === 'function') {
                        window.toastSuccess('保存成功');
                    }
                    return true;
                }).catch(function (e) {
                    console.error('[LOWPOWER] write failed:', e);
                    showWarn('保存失败');
                    return false;
                });
            }

            var devVersion = makeFieldControl({
                label: _('设备版本'),
                placeholder: _('设备版本'),
                readonly: true,
                onRefresh: function () {
                    readLpResource(RES.AD_LP.DEV_VER, 'WIRELESS_LOW_POWER_REFRESH').then(function (raw) {
                        if (raw == null) {
                            return;
                        }
                        devVersion.input.value = String(raw || '').replace(/\0+/g, '').trim();
                    });
                }
            });
            var devChannel = makeFieldControl({
                label: _('设备信道'),
                options: makeNumberOptions(0, 10),
                value: '',
                showSave: true,
                onRefresh: function () {
                    readLpResource(RES.AD_LP.DEV_CHAN, 'WIRELESS_LOW_POWER_REFRESH').then(function (raw) {
                        if (raw == null) {
                            return;
                        }
                        var n = parseInt(raw, 10);
                        devChannel.set(isNaN(n) ? '' : String(n), true);
                    });
                },
                onSave: function (val) {
                    var s = String(val || '').trim();
                    if (!/^\d+$/.test(s)) {
                        showWarn('请选择设备信道');
                        return;
                    }
                    var n = parseInt(s, 10);
                    if (isNaN(n) || n < 0 || n > 10) {
                        showWarn('请选择设备信道');
                        return;
                    }
                    writeLpU8Resource(RES.AD_LP.DEV_CHAN, n, 'WIRELESS_LOW_POWER_SAVE').then(function (ok) {
                        if (!ok) {
                            return;
                        }
                        return readLpResource(RES.AD_LP.DEV_CHAN).then(function (raw) {
                            if (raw == null) {
                                return;
                            }
                            var v = parseInt(raw, 10);
                            devChannel.set(isNaN(v) ? '' : String(v), true);
                        });
                    });
                }
            });
            var devTxPower = makeFieldControl({
                label: _('设备发射功率'),
                options: makeLowPowerTxOptions(),
                value: '',
                showSave: true,
                onRefresh: function () {
                    readLpResource(RES.AD_LP.DEV_POWER, 'WIRELESS_LOW_POWER_REFRESH').then(function (raw) {
                        if (raw == null) {
                            return;
                        }
                        var n = parseInt(raw, 10);
                        if (isNaN(n)) {
                            devTxPower.set('', true);
                            return;
                        }
                        devTxPower.set(String(n - 20), true);
                    });
                },
                onSave: function (val) {
                    var s = String(val || '').trim();
                    if (!isLowPowerTxAllowed(s)) {
                        showWarn('请选择设备发射功率');
                        return;
                    }
                    var n = parseInt(s, 10);
                    var backendVal = n + 20;
                    if (backendVal < 0 || backendVal > 255) {
                        showWarn('请选择设备发射功率');
                        return;
                    }
                    writeLpU8Resource(RES.AD_LP.DEV_POWER, backendVal, 'WIRELESS_LOW_POWER_SAVE').then(function (ok) {
                        if (!ok) {
                            return;
                        }
                        return readLpResource(RES.AD_LP.DEV_POWER).then(function (raw) {
                            if (raw == null) {
                                return;
                            }
                            var v = parseInt(raw, 10);
                            devTxPower.set(isNaN(v) ? '' : String(v - 20), true);
                        });
                    });
                }
            });
            var serialStatus = makeFieldControl({
                label: _('当前串口状态'),
                placeholder: _('当前串口状态'),
                readonly: true,
                onRefresh: function () {
                    readLpResource(RES.AD_LP.SERIAL_STAT, 'WIRELESS_LOW_POWER_REFRESH').then(function (raw) {
                        if (raw == null) {
                            return;
                        }
                        var n = parseInt(raw, 10);
                        if (n === 0) {
                            serialStatus.input.value = '串口走数据';
                            return;
                        }
                        if (n === 1) {
                            serialStatus.input.value = '串口走固件下载';
                            return;
                        }
                        serialStatus.input.value = String(raw || '');
                    });
                }
            });

            var form = E('div', { 'class': 'ns-w24-form' }, [
                makeFormRow(_('设备版本'), devVersion.root),
                makeFormRow(_('当前串口状态'), serialStatus.root),
                makeFormRow(_('设备信道'), devChannel.root),
                makeFormRow(_('设备发射功率'), devTxPower.root)
            ]);

            var panel = E('div', { 'class': 'ns-wireless-panel', 'data-key': cfg.key }, [
                E('div', { 'class': 'ns-w24-config-block' }, [
                    E('div', { 'class': 'ns-wireless-title' }, _('低功耗模块配置')),
                    E('div', { 'class': 'ns-w24-main' }, [form])
                ])
            ]);

            return {
                panel: panel
            };
        }

        function createWirelessCommonSection(cfg) {
            var editEnabled = false;
            var editSnapshot = null;
            var loadingFromBackend = false;
            var fields = [];

            function makeSelectLocal(options, value, minWidth) {
                if (!window.adComponents || typeof window.adComponents.createSingleSelect !== 'function') {
                    throw new Error('adComponents.createSingleSelect is not available');
                }
                var sel = window.adComponents.createSingleSelect({
                    options: options || [],
                    value: value || '',
                    placeholder: _('请选择'),
                    styleVars: {
                        '--adui-ss-min-width': minWidth || '220px',
                        '--adui-ss-arrow-color': '#968a80',
                        '--adui-ss-placeholder': '#968a80',
                        '--adui-ss-menu-border': '#e9dfd5',
                        '--adui-ss-menu-bg': '#ffffff',
                        '--adui-ss-menu-text': '#3d434c',
                        '--adui-ss-menu-hover-bg': '#fff4ec'
                    }
                });
                fields.push({ kind: 'select', api: sel });
                return sel;
            }

            function makeBoolRadioLocal(nameSeed, defaultValue) {
                var groupName = 'ns-common-radio-' + nameSeed + '-' + String(Date.now());
                var onInput = null;
                function mk(value, label, checked) {
                    var ipt = E('input', {
                        'type': 'radio',
                        'name': groupName,
                        'value': value,
                        'checked': checked ? 'checked' : null
                    });
                    return E('label', { 'class': 'ns-general-radio-item' }, [
                        ipt,
                        E('span', {}, label)
                    ]);
                }
                var root = E('div', { 'class': 'ns-general-radio-group' }, [
                    mk('1', _('是'), String(defaultValue || '0') === '1'),
                    mk('0', _('否'), String(defaultValue || '0') !== '1')
                ]);
                root.addEventListener('change', function () {
                    if (typeof onInput === 'function') {
                        onInput();
                    }
                });
                return {
                    root: root,
                    get: function () {
                        var checked = root.querySelector('input[type="radio"][name="' + groupName + '"]:checked');
                        return checked ? String(checked.value || '') : '0';
                    },
                    set: function (v) {
                        var target = root.querySelector('input[type="radio"][name="' + groupName + '"][value="' + String(v || '0') + '"]');
                        if (!target) {
                            target = root.querySelector('input[type="radio"][name="' + groupName + '"][value="0"]');
                        }
                        if (target) {
                            target.checked = true;
                        }
                    },
                    setDisabled: function (disabled) {
                        var radios = root.querySelectorAll('input[type="radio"][name="' + groupName + '"]');
                        for (var i = 0; i < radios.length; i++) {
                            radios[i].disabled = !!disabled;
                        }
                    },
                    onChange: function (cb) {
                        onInput = cb;
                    }
                };
            }

            function pickPersistedValues(v) {
                var src = v || {};
                var dfr = String(src.dfr_enabled || '0');
                return {
                    host_link: dfr === '1' ? String(src.host_link || '2.4G') : '',
                    dfr_enabled: dfr
                };
            }

            function isValueChanged() {
                if (!editSnapshot) {
                    return false;
                }
                return JSON.stringify(pickPersistedValues(getValues())) !== JSON.stringify(pickPersistedValues(editSnapshot));
            }

            var redundancySel = makeBoolRadioLocal(cfg.key || 'wireless_common', '0');
            var hostLinkSel = makeSelectLocal([
                { value: '2.4G', label: '2.4G' },
                { value: '5G', label: '5G' }
            ], '2.4G', '150px');

            fields.push({ kind: 'radio', api: redundancySel });

            var modifyBtn = E('button', {
                'type': 'button',
                'class': 'ns-btn ad-c-btn ns-w24-modify-btn'
            }, _('配置修改'));

            var saveBtn = E('button', {
                'type': 'button',
                'class': 'ns-btn ad-c-btn ad-c-btn--primary primary'
            }, _('配置保存'));

            var applyBtn = E('button', {
                'type': 'button',
                'class': 'ns-btn ad-c-btn'
            }, _('配置生效'));

            var hostLinkRow = makeFormRow(_('主链路'), hostLinkSel.root);
            var form = E('div', { 'class': 'ns-w24-form' }, [
                makeFormRow(_('双频冗余'), redundancySel.root),
                hostLinkRow
            ]);

            function getValues() {
                return {
                    host_link: String(hostLinkSel.get() || '2.4G'),
                    dfr_enabled: String(redundancySel.get() || '0')
                };
            }

            function updateHostLinkDependentRow() {
                var enabled = String(redundancySel.get() || '0') === '1';
                hostLinkRow.classList.toggle('ns-w24-form-row-hidden', !enabled);
                if (hostLinkSel && typeof hostLinkSel.setDisabled === 'function') {
                    hostLinkSel.setDisabled(!editEnabled || !enabled);
                }
            }

            function setEditable(editable) {
                editEnabled = !!editable;
                fields.forEach(function (ctrl) {
                    if (!ctrl) {
                        return;
                    }
                    if (ctrl.kind === 'select' && ctrl.api && typeof ctrl.api.setDisabled === 'function') {
                        ctrl.api.setDisabled(!editEnabled);
                        return;
                    }
                    if (ctrl.kind === 'radio' && ctrl.api && typeof ctrl.api.setDisabled === 'function') {
                        ctrl.api.setDisabled(!editEnabled);
                        return;
                    }
                });
                updateHostLinkDependentRow();
                saveBtn.disabled = !editEnabled;
                saveBtn.classList.toggle('is-disabled', !editEnabled);
                modifyBtn.textContent = editEnabled ? _('取消修改') : _('配置修改');
            }

            function setValues(v) {
                var src = v || {};
                redundancySel.set(src.dfr_enabled != null ? String(src.dfr_enabled) : '0');
                hostLinkSel.set(src.host_link != null ? String(src.host_link) : '2.4G', true);
                updateHostLinkDependentRow();
                setEditable(editEnabled);
            }

            function refreshFromBackend(force) {
                if (loadingFromBackend) {
                    return Promise.resolve(false);
                }
                if (editEnabled && !force) {
                    return Promise.resolve(false);
                }
                loadingFromBackend = true;
                return readWirelessCommonFromBackend().then(function (ok) {
                    if (!ok) {
                        return false;
                    }
                    setValues(commonState);
                    if (!editEnabled) {
                        editSnapshot = JSON.parse(JSON.stringify(getValues()));
                    }
                    return true;
                }).finally(function () {
                    loadingFromBackend = false;
                });
            }

            redundancySel.onChange(function () {
                updateHostLinkDependentRow();
            });

            modifyBtn.addEventListener('click', function () {
                if (!editEnabled) {
                    editSnapshot = getValues();
                    setEditable(true);
                    return;
                }
                if (editSnapshot) {
                    setValues(editSnapshot);
                }
                setEditable(false);
                editSnapshot = null;
            });

            saveBtn.addEventListener('click', function () {
                if (!editEnabled) {
                    return;
                }
                var currentValues = getValues();
                if (!isValueChanged()) {
                    showWarn('未检测到配置变更');
                    setEditable(false);
                    editSnapshot = null;
                    return;
                }
                writeWirelessCommonToBackend(currentValues).then(function (ok) {
                    if (!ok) {
                        return;
                    }
                    if (typeof window.toastSuccess === 'function') {
                        window.toastSuccess('保存配置成功');
                    }
                    setEditable(false);
                    editSnapshot = null;
                    refreshFromBackend(true).catch(function () { });
                });
            });

            applyBtn.addEventListener('click', function () {
                showApplyRebootConfirm();
            });

            setEditable(false);
            setValues(commonState);

            var panel = E('div', { 'class': 'ns-wireless-panel', 'data-key': cfg.key }, [
                E('div', { 'class': 'ns-w24-config-block' }, [
                    E('div', { 'class': 'ns-wireless-title' }, _('通用配置')),
                    E('div', { 'class': 'ns-w24-main' }, [form])
                ]),
                E('div', { 'class': 'ns-w24-actions-block' }, [
                    E('div', { 'class': 'ns-w24-actions' }, [modifyBtn, saveBtn, applyBtn])
                ])
            ]);

            return {
                panel: panel,
                refreshFromBackend: refreshFromBackend
            };
        }

        var wirelessCommonSection = createWirelessCommonSection({
            key: 'wirelessCommon'
        });
        var wireless24gSection = createWirelessBandSection({
            key: 'wireless24g',
            objId: OBJ_ID.WIRELESS_ATTR_24G,
            workChannel: {
                options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13'],
                customValues: ['2372', '2392']
            }
        });

        var wireless5gSection = createWirelessBandSection({
            key: 'wireless5g',
            objId: OBJ_ID.WIRELESS_ATTR_5G,
            workChannel: {
                options: ['36', '40', '44', '48', '52', '56', '60', '64', '149', '153', '157', '161', '165'],
                customValues: ['5140', '5160']
            }
        });

        var wirelessLowPowerSection = createLowPowerSection({
            key: 'wirelessLowPower'
        });

        var panels = {
            wirelessCommon: wirelessCommonSection.panel,
            wireless24g: wireless24gSection.panel,
            wireless5g: wireless5gSection.panel,
            wirelessLowPower: wirelessLowPowerSection.panel
        };
        var sectionByKey = {
            wirelessCommon: wirelessCommonSection,
            wireless24g: wireless24gSection,
            wireless5g: wireless5gSection,
            wirelessLowPower: wirelessLowPowerSection
        };
        var commonState = {
            host_link: '2.4G',
            dfr_enabled: '0'
        };

        function getHostLinkTextByCode(code) {
            return parseIntSafe(code, 0) === 1 ? '5G' : '2.4G';
        }

        function getHostLinkCodeByText(text) {
            return String(text || '') === '5G' ? 1 : 0;
        }

        function readWirelessCommonFromBackend() {
            var dev = getActiveDev();
            if (!dev || !(dev.dev_id || dev.id)) {
                return Promise.resolve(false);
            }
            var req;
            try {
                req = createEmpRequest(
                    dev.dev_type,
                    dev.dev_id,
                    rInsAllInst(strcatURI(OBJ_ID.WIRELESS_COMMON, 0, 0))
                );
            } catch (e) {
                return Promise.resolve(false);
            }
            return getEmpApi().then(function (api) {
                return api.empRequest(req);
            }).then(function (resp) {
                var nr = normalizeEmp(resp);
                var arrays = Array.isArray(nr.arrays) ? nr.arrays : [];
                if (!nr.ok && !arrays.length) {
                    showWarn('读取无线公共配置失败（' + empResultCodeText(nr.code) + '）');
                    return false;
                }
                var byRes = {};
                arrays.forEach(function (it) {
                    var uri = String((it && it.uri) || '');
                    var parts = uri.split('/');
                    if (parts.length < 3) {
                        return;
                    }
                    if (parseIntSafe(parts[0], -1) !== OBJ_ID.WIRELESS_COMMON || parseIntSafe(parts[1], -1) !== 0) {
                        return;
                    }
                    var resId = parseIntSafe(parts[2], -1);
                    if (resId < 0) {
                        return;
                    }
                    byRes[resId] = String((it && it.value_payload != null) ? it.value_payload : '');
                });
                commonState.host_link = getHostLinkTextByCode(byRes[RES.WIRELESS_COMMON.HOST_LINK]);
                commonState.dfr_enabled = String(parseIntSafe(byRes[RES.WIRELESS_COMMON.DFR_ENABLED], 0) === 1 ? '1' : '0');
                return true;
            }).catch(function () {
                showWarn('读取无线公共配置失败');
                return false;
            });
        }

        function writeWirelessCommonToBackend(nextState) {
            var dev = getActiveDev();
            if (!dev || !(dev.dev_id || dev.id)) {
                showWarn('未获取到当前设备信息');
                return Promise.resolve(false);
            }
            var insts = [];
            var nextDfr = (nextState.dfr_enabled != null)
                ? String(nextState.dfr_enabled)
                : String(commonState.dfr_enabled);
            var shouldWriteHostLink = (nextDfr === '1');
            var wroteHostLink = false;

            if (shouldWriteHostLink &&
                nextState.host_link != null &&
                String(nextState.host_link) !== String(commonState.host_link)) {
                insts.push(wU8Inst(strcatURI(OBJ_ID.WIRELESS_COMMON, 0, RES.WIRELESS_COMMON.HOST_LINK), getHostLinkCodeByText(nextState.host_link)));
                wroteHostLink = true;
            }
            if (nextState.dfr_enabled != null && String(nextState.dfr_enabled) !== String(commonState.dfr_enabled)) {
                insts.push(wU8Inst(strcatURI(OBJ_ID.WIRELESS_COMMON, 0, RES.WIRELESS_COMMON.DFR_ENABLED), parseIntSafe(nextState.dfr_enabled, 0)));
            }
            if (!insts.length) {
                return Promise.resolve(true);
            }
            var req;
            try {
                req = createEmpRequest(dev.dev_type, dev.dev_id, insts);
                req = attachAuditAction(req, 'WIRELESS_COMMON_SAVE', {
                    sectionTitle: getTabTitle('wirelessCommon')
                });
            } catch (e) {
                return Promise.resolve(false);
            }
            return getEmpApi().then(function (api) {
                return api.empRequest(req);
            }).then(function (resp) {
                var nr = normalizeEmp(resp);
                if (!nr.ok) {
                    showWarn('保存无线公共配置失败（' + empResultCodeText(nr.code) + '）');
                    return false;
                }
                if (wroteHostLink) {
                    commonState.host_link = String(nextState.host_link);
                }
                if (nextState.dfr_enabled != null) {
                    commonState.dfr_enabled = String(nextState.dfr_enabled);
                }
                return true;
            }).catch(function () {
                showWarn('保存无线公共配置失败');
                return false;
            });
        }

        var subTabs = E('div', { 'class': 'ns-subtabs' });
        var subTabsLeft = E('div', { 'class': 'ns-subtabs-left' });
        tabs.forEach(function (tab) {
            subTabsLeft.appendChild(E('button', {
                'type': 'button',
                'class': 'ns-subtab' + (tab.key === activeTab ? ' active' : ''),
                'data-key': tab.key,
                'click': function () {
                    activeTab = tab.key;
                    updateActiveTab();
                }
            }, tab.title));
        });
        subTabs.appendChild(subTabsLeft);

        var panelWrap = E('div', { 'class': 'ns-wireless-panel-wrap' }, [
            panels.wirelessCommon,
            panels.wireless24g,
            panels.wireless5g,
            panels.wirelessLowPower
        ]);

        function updateActiveTab() {
            subTabs.querySelectorAll('.ns-subtab').forEach(function (el) {
                var key = el.getAttribute('data-key');
                el.classList.toggle('active', key === activeTab);
            });

            Object.keys(panels).forEach(function (key) {
                panels[key].style.display = (key === activeTab) ? '' : 'none';
            });

            var sec = sectionByKey[activeTab];
            if (sec && typeof sec.refreshFromBackend === 'function') {
                sec.refreshFromBackend(false).catch(function () { });
            }
        }

        var card = E('div', { 'class': 'ns-card ad-c-card ns-wireless-card' }, [
            subTabs,
            panelWrap
        ]);

        var root = E('div', { 'class': 'ns-wrap' }, [
            deviceCardComp ? deviceCardComp.root : E('div', { 'class': 'ns-device-row' }),
            card
        ]);

        window.addEventListener('device:info', function (ev) {
            deviceCtx.applyActiveDevice(ev && ev.detail, deviceCardComp);
            var sec = sectionByKey[activeTab];
            if (sec && typeof sec.refreshFromBackend === 'function') {
                sec.refreshFromBackend(true).catch(function () { });
            }
        });

        deviceCtx.syncActiveDeviceCard(deviceCardComp).then(function () {
            var sec = sectionByKey[activeTab];
            if (sec && typeof sec.refreshFromBackend === 'function') {
                return sec.refreshFromBackend(true);
            }
            return false;
        }).catch(function () { });
        updateActiveTab();

        return root;
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
