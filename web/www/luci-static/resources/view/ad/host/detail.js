'use strict';
'require view';
'require ui';
'require rpc';
'require dom';

return view.extend({
    load: function () {
        return Promise.all([
            loadCssOnce('/luci-static/custom/css/host/detail.css'),
            loadScriptOnce('/luci-static/custom/js/enum.js'),
            loadScriptOnce('/luci-static/custom/js/device_info.js'),
            loadScriptOnce('/luci-static/custom/js/toast.js'),
            loadScriptOnce('/luci-static/custom/js/audit_actions.js')
        ]);
    },

    render: function () {
        var empApiPromise = L.require('emp/api').then(function (mod) {
            return (typeof mod === 'function') ? new mod() : mod;
        });
        function getEmpApi() {
            return empApiPromise;
        }

        function attachAuditAction(req, actionKey, ctx) {
            if (window.adAuditActions && typeof window.adAuditActions.attach === 'function') {
                return window.adAuditActions.attach(req, actionKey, ctx || {});
            }
            return req;
        }

        if (window.adDeviceInfo && typeof window.adDeviceInfo.refreshSelfDevInfo === 'function') {
            window.adDeviceInfo.refreshSelfDevInfo().catch(function () { });
        }

        function __(s) {
            try {
                return _(s);
            } catch (e) {
                return s;
            }
        }
        function createEl(tag, attrs, children) {
            return E(tag, attrs || {}, children || []);
        }

        function showAdModal(title, nodes, opts) {
            if (window.adModal && typeof window.adModal.show === 'function') {
                return window.adModal.show(ui, title, nodes, opts || {});
            }
            ui.showModal(title, nodes);
            return true;
        }
        function showCustomModal(title, body, footer, opts) {
            if (window.adModal && typeof window.adModal.showCustom === 'function') {
                return window.adModal.showCustom(title, body, footer, opts || {});
            }
            showAdModal(title, [
                E('div', { class: 'modal-body' }, Array.isArray(body) ? body : [body]),
                E('div', { class: 'right' }, Array.isArray(footer) ? footer : [footer])
            ], opts || {});
            return {
                close: ui.hideModal
            };
        }
        function showNestedConfirm(title, message, onConfirm, onCancel) {
            var modalRef = null;
            function closeOnly() {
                if (modalRef && typeof modalRef.close === 'function') {
                    modalRef.close();
                }
            }
            function closeAndCancel() {
                closeOnly();
                if (typeof onCancel === 'function') {
                    onCancel();
                }
            }
            var confirmBtn = E('button', {
                class: 'btn cbi-button-negative',
                click: async function (ev) {
                    await onConfirm(ev && ev.currentTarget, closeOnly);
                }
            }, [__('确认')]);
            modalRef = showCustomModal(
                title,
                E('div', { class: 'ad-modal-msg' }, message),
                [
                    E('button', {
                        class: 'btn',
                        click: closeAndCancel
                    }, [__('取消')]),
                    confirmBtn
                ],
                { panelClass: 'ad-modal-confirm', width: 430 }
            );
            return closeOnly;
        }

        function spinOnce(btn) {
            if (!btn) {
                return;
            }
            var ico = btn.querySelector('.ico') || btn;
            ico.classList.remove('spin-once');
            void ico.offsetWidth;
            ico.classList.add('spin-once');
            var onEnd = function () {
                ico.classList.remove('spin-once');
                ico.removeEventListener('animationend', onEnd);
            };
            ico.addEventListener('animationend', onEnd);
        }

        function readCachedDevice() {
            try {
                if (window.adDeviceInfo && typeof window.adDeviceInfo.getActiveDev === 'function') {
                    var live = window.adDeviceInfo.getActiveDev();
                    if (live && (live.dev_id || live.id)) {
                        return live;
                    }
                }
            } catch (e) { }
            return null;
        }

        function writeCachedDevice(dev) {
            try {
                if (window.adDeviceInfo && typeof window.adDeviceInfo.toLegacyDevice === 'function') {
                    var legacy = window.adDeviceInfo.toLegacyDevice({
                        dev_id: dev && (dev.dev_id || dev.id),
                        dev_name: dev && (dev.dev_name || dev.name || dev.title),
                        dev_ip: dev && (dev.dev_ip || dev.ip),
                        dev_type: dev && dev.dev_type
                    });
                    if (!legacy) {
                        return;
                    }
                    localStorage.setItem('currentDevice', JSON.stringify(legacy));
                    return;
                }
            } catch (e) { }
            try {
                localStorage.setItem('currentDevice', JSON.stringify(dev));
            } catch (e) { }
        }
        function readDetailCache() {
            try {
                var raw = localStorage.getItem('adHostDetailCache');
                if (!raw) {
                    return null;
                }
                var obj = JSON.parse(raw);
                if (!obj || typeof obj !== 'object') {
                    return null;
                }
                var active = readCachedDevice();
                var activeId = active && (active.dev_id || active.id);
                if (activeId && obj.dev_id && String(activeId) !== String(obj.dev_id)) {
                    return null;
                }
                return obj;
            } catch (e) {
                return null;
            }
        }
        function writeDetailCache(row) {
            try {
                if (!row || typeof row !== 'object') {
                    return;
                }
                localStorage.setItem('adHostDetailCache', JSON.stringify({
                    dev_id: row.dev_id || '',
                    type: row.type || '-',
                    ip: row.ip || '-',
                    mask: row.mask || '-',
                    port: row.port || '-',
                    mac: row.mac || '-',
                    cld_num: row.cld_num || '-',
                    manu: row.manu || '-',
                    model: row.model || '-',
                    dev_seq: row.dev_seq || '-',
                    sw_ver: row.sw_ver || '-',
                    antenna_cnt: row.antenna_cnt || '-',
                    wireless_func: row.wireless_func || '-',
                    work_mode: row.work_mode || '-'
                }));
            } catch (e) { }
        }

        const callSystemReboot = rpc.declare({ object: 'system', method: 'reboot' });
        const state = { row: null };
        let configModalClose = null;

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

        function isValidIPv4(ip) {
            var s = String(ip == null ? '' : ip).trim();
            if (!/^\d+\.\d+\.\d+\.\d+$/.test(s)) {
                return false;
            }
            var parts = s.split('.');
            if (parts.length !== 4) {
                return false;
            }
            for (var i = 0; i < parts.length; i++) {
                var p = parts[i];
                if (p === '' || !/^\d+$/.test(p)) {
                    return false;
                }
                var n = parseInt(p, 10);
                if (isNaN(n) || n < 0 || n > 255) {
                    return false;
                }
            }
            return true;
        }
        function isValidIPv4WithMask(ip) {
            var s = String(ip == null ? '' : ip).trim();
            var parts = s.split('/');
            if (parts.length > 2 || !isValidIPv4(parts[0])) {
                return false;
            }
            if (parts.length === 1) {
                return true;
            }
            var mask = parts[1];
            if (mask === '') {
                return false;
            }
            if (/^\d+$/.test(mask)) {
                var prefix = parseInt(mask, 10);
                return !isNaN(prefix) && prefix >= 0 && prefix <= 32;
            }
            return isValidIPv4(mask);
        }
        function maskToPrefix(mask) {
            var s = String(mask == null ? '' : mask).trim();
            if (s === '' || s === '-') {
                return '';
            }
            if (/^\d+$/.test(s)) {
                var n = parseInt(s, 10);
                return (!isNaN(n) && n >= 0 && n <= 32) ? String(n) : '';
            }
            if (!isValidIPv4(s)) {
                return '';
            }
            var parts = s.split('.');
            var bits = '';
            for (var i = 0; i < parts.length; i++) {
                var bin = parseInt(parts[i], 10).toString(2);
                bits += ('00000000' + bin).slice(-8);
            }
            if (!/^1*0*$/.test(bits)) {
                return '';
            }
            return String(bits.indexOf('0') === -1 ? 32 : bits.indexOf('0'));
        }
        function formatIpWithPrefix(ip, mask) {
            var ipText = String(ip == null ? '' : ip).trim();
            if (!ipText || ipText === '-') {
                return '-';
            }
            var ipParts = ipText.split('/');
            if (ipParts.length === 2 && isValidIPv4(ipParts[0])) {
                var inlinePrefix = maskToPrefix(ipParts[1]);
                return ipParts[0] + '/' + (inlinePrefix || '24');
            }
            if (!isValidIPv4(ipText)) {
                return ipText;
            }
            var prefix = maskToPrefix(mask);
            return ipText + '/' + (prefix || '24');
        }
        function parseIpConfigInput(input, fallbackMask) {
            var s = String(input == null ? '' : input).trim();
            var parts = s.split('/');
            if (parts.length > 2 || !isValidIPv4(parts[0])) {
                return null;
            }
            var mask = '';
            if (parts.length === 2) {
                mask = String(parts[1] || '').trim();
                if (!mask) {
                    return null;
                }
                if (/^\d+$/.test(mask)) {
                    var prefix = parseInt(mask, 10);
                    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
                        return null;
                    }
                } else if (!isValidIPv4(mask) || maskToPrefix(mask) === '') {
                    return null;
                }
            } else {
                mask = String(fallbackMask == null ? '' : fallbackMask).trim();
                if (!mask || mask === '-' || maskToPrefix(mask) === '') {
                    mask = '24';
                }
            }
            return {
                ip: parts[0],
                mask: mask,
                display: formatIpWithPrefix(parts[0], mask)
            };
        }
        function broadcastCurrentDevice(dev) {
            try {
                window.dispatchEvent(new CustomEvent('device:info', { detail: dev }));
            } catch (e) { }
        }
        const toolbar = createEl('div', { class: 'dev-toolbar' }, [
            createEl('div', { class: 'toolbar-left' }, []),
            createEl('div', { class: 'toolbar-right' }, [
                createEl('button', { class: 'btn btn-mini', 'data-act': 'config' }, __('配置修改')),
                createEl('button', { class: 'btn btn-mini btn-danger', 'data-act': 'reboot' }, __('设备重启')),
                createEl('button', { class: 'btn btn-mini btn-danger', 'data-act': 'factory' }, __('恢复出厂设置')),
                createEl('button', { class: 'ns-icon-btn refresh', 'data-act': 'refresh', title: __('刷新') }, [
                    createEl('span', { class: 'ico' })
                ])
            ])
        ]);

        const table = createEl('table', { class: 'dev-table' }, [
            createEl('thead', {}, [
                createEl('tr', {}, [
                    createEl('th', {}, __('设备ID')),
                    createEl('th', {}, __('设备类型')),
                    createEl('th', {}, __('设备IP')),
                    createEl('th', {}, __('设备MAC地址')),
                    createEl('th', {}, __('设备序列号'))
                ])
            ]),
            createEl('tbody', { id: 'dev-tbody' })
        ]);

        const detailTable = createEl('table', { class: 'dev-kv-table' }, [
            createEl('tbody', { id: 'dev-detail-tbody' })
        ]);

        const wrap = createEl('div', { class: 'dev-detail-wrap' }, [
            toolbar,
            createEl('div', { class: 'detail-sections' }, [
                createEl('div', { class: 'section-wrap' }, [
                    createEl('div', { class: 'section-title' }, __('基本信息')),
                    table
                ]),
                createEl('div', { class: 'section-wrap' }, [
                    createEl('div', { class: 'section-title' }, __('设备详情')),
                    detailTable
                ])
            ])
        ]);

        toolbar.addEventListener('click', function (ev) {
            const btn = ev.target.closest('button[data-act]');
            if (!btn) {
                return;
            }
            const act = btn.getAttribute('data-act');

            switch (act) {
                case 'config':
                    openConfigModal();
                    break;
                case 'upgrade':
                    openUpgradeModal();
                    break;
                case 'reboot':
                    confirmReboot();
                    break;
                case 'factory':
                    confirmFactoryReset();
                    break;
                case 'refresh':
                    (async function () {
                        spinOnce(btn);
                        var data = await fetchFromEMP({ auditKey: 'HOST_DETAIL_REFRESH' });
                        if (data) {
                            state.row = Object.assign({}, state.row || {}, data);
                            renderRow(state.row);
                            writeDetailCache(state.row);
                            toastSuccess('刷新成功');
                            try {
                                const cur = {
                                    id: state.row.dev_id || 'ad001',
                                    title: 'AD',
                                    ip: state.row.ip || '',
                                    mask: state.row.mask || '',
                                    online: true
                                };
                                writeCachedDevice(cur);
                                broadcastCurrentDevice(cur);
                            } catch (e) { }
                        }
                    })();
                    break;
            }
        });

        function renderRow(row) {
            const tb = table.querySelector('#dev-tbody');
            tb.textContent = '';
            row = row || {};
            var devIdVal = String(row.dev_id == null ? '' : row.dev_id);
            var ipText = formatIpWithPrefix(row.ip, row.mask);
            const tr = createEl('tr', {}, [
                createEl('td', {}, [devIdVal || '-']),
                createEl('td', {}, [row.type || '-']),
                createEl('td', {}, [ipText]),
                createEl('td', {}, [row.mac || '-']),
                createEl('td', {}, [row.dev_seq || '-'])
            ]);
            tb.appendChild(tr);

            var detailTb = detailTable.querySelector('#dev-detail-tbody');
            detailTb.textContent = '';
            var detailRows = [
                [__('子设备数量'), row.cld_num || '-'],
                [__('制造商'), row.manu || '-'],
                [__('设备型号'), row.model || '-'],
                [__('固件版本'), row.sw_ver || '-'],
                [__('天线个数'), row.antenna_cnt || '-'],
                [__('无线功能'), row.wireless_func || '-'],
                [__('工作模式'), row.work_mode || '-']
            ];
            detailRows.forEach(function (item) {
                detailTb.appendChild(createEl('tr', {}, [
                    createEl('td', { class: 'k' }, item[0]),
                    createEl('td', { class: 'v' }, item[1])
                ]));
            });
        }

        async function saveDeviceConfigAndApply(nextConfig, confirmBtn, closeConfirm) {
            var cur = state.row || {};
            var dev = (typeof getActiveDev === 'function') ? getActiveDev() : { dev_type: DEV_TYPE.AD, dev_id: '' };
            if (!dev || !(dev.dev_id || dev.id)) {
                toastWarn('未获取到当前设备信息');
                return;
            }

            try {
                if (confirmBtn) {
                    confirmBtn.disabled = true;
                    confirmBtn.classList.add('disabled');
                }
                var api = await getEmpApi();
                var insts = [
                    wStrInst(strcatURI(OBJ_ID.CUR_DEV, 0, RES.CUR_DEV.DEV_ID), nextConfig.devId),
                    wStrInst(strcatURI(OBJ_ID.CUR_DEV, 0, RES.CUR_DEV.DEV_IP), nextConfig.ip),
                    wStrInst(strcatURI(OBJ_ID.CUR_DEV, 0, RES.CUR_DEV.DEV_MASK), nextConfig.mask)
                ];
                var req = createEmpRequest(dev.dev_type, dev.dev_id, insts);
                req = attachAuditAction(req, 'HOST_DETAIL_CONFIG_MODIFY');
                var resp = await api.empRequest(req);
                var nr = normalizeEmp(resp);
                if (!nr.ok) {
                    toastWarn('配置写入失败（' + empResultCodeText(nr.code) + '）');
                    return;
                }
                var applyReq = createExecInstRequest(dev, strcatURI(OBJ_ID.CUR_DEV, 0, RES.CUR_DEV.SAVE_CONFIG));
                applyReq = attachAuditAction(applyReq, 'HOST_DETAIL_CONFIG_APPLY');
                var applyResp = await api.empRequest(applyReq);
                var applyNr = normalizeEmp(applyResp);
                if (!applyNr.ok) {
                    toastWarn('配置生效失败（' + empResultCodeText(applyNr.code) + '）');
                    return;
                }

                state.row = Object.assign({}, cur, {
                    dev_id: nextConfig.devId,
                    ip: nextConfig.ip,
                    mask: nextConfig.mask
                });
                renderRow(state.row);
                writeDetailCache(state.row);
                writeCachedDevice({
                    id: nextConfig.devId,
                    title: 'AD',
                    ip: nextConfig.ip,
                    mask: nextConfig.mask,
                    online: true,
                    dev_type: DEV_TYPE.AD
                });
                broadcastCurrentDevice({
                    id: nextConfig.devId,
                    title: 'AD',
                    ip: nextConfig.ip,
                    mask: nextConfig.mask,
                    online: true
                });
                if (typeof closeConfirm === 'function') {
                    closeConfirm();
                }
                if (typeof configModalClose === 'function') {
                    configModalClose();
                } else {
                    ui.hideModal();
                }
            } catch (e) {
                console.error('[DEV-DETAIL] save ip config failed', e);
                toastWarn('配置修改失败');
            } finally {
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.classList.remove('disabled');
                }
            }
        }

        function openUpgradeModal() {
            showAdModal(__('版本升级'), [
                E('div', { class: 'modal-body' }, [
                    E('p', {}, __('此处接入版本升级逻辑（占位）。'))
                ]),
                E('div', { class: 'right' }, [
                    E('button', { class: 'btn', click: ui.hideModal }, [__('关闭')]),
                    E('button', {
                        class: 'btn cbi-button-action', click: function () {
                            ui.hideModal();
                            ui.addNotification(null, E('p', {}, [__('升级任务已触发（占位）')]));
                        }
                    }, [__('开始升级')])
                ])
            ], { width: 430 });
        }

        async function fetchFromEMP(opts) {
            opts = opts || {};
            // Wait for self_dev_info bootstrap to avoid using an empty dev_id.
            if (window.adDeviceInfo && typeof window.adDeviceInfo.refreshSelfDevInfo === 'function') {
                try {
                    await window.adDeviceInfo.refreshSelfDevInfo();
                } catch (e) { }
            }
            var dev = (typeof getActiveDev === 'function') ? getActiveDev() : { dev_type: 1, dev_id: '' };
            try {
                if (!dev || !(dev.dev_id || dev.id)) {
                    console.warn('[DEV-DETAIL] active device is not ready yet');
                    return null;
                }
                function parseU8(v, dft) {
                    var n = parseInt(v, 10);
                    return isNaN(n) ? (dft || 0) : n;
                }
                function toWirelessFuncText(code) {
                    if (code === PORT_SETTING_ENUM.WIRELESS_FUNC.STD_WIAFA) {
                        return '标准WIA-FA';
                    }
                    if (code === PORT_SETTING_ENUM.WIRELESS_FUNC.PRI_WIAFA) {
                        return '私有WIA-FA';
                    }
                    return '-';
                }
                function toWorkModeText(code) {
                    if (code === PORT_SETTING_ENUM.WORK_MODE.STD_WIFI) {
                        return 'STD-WIFI';
                    }
                    if (code === PORT_SETTING_ENUM.WORK_MODE.STD_WIAFA) {
                        return 'STD-WIAFA';
                    }
                    if (code === PORT_SETTING_ENUM.WORK_MODE.PRI_WIAFA) {
                        return 'PRI-WIAFA';
                    }
                    return '-';
                }
                var api = await getEmpApi();
                var reqCurDev = createQueryAllRequest(dev, OBJ_ID.CUR_DEV);
                if (opts.auditKey) {
                    reqCurDev = attachAuditAction(reqCurDev, opts.auditKey, opts.auditCtx || {});
                }
                var reqDevInfo = createEmpRequest(
                    dev.dev_type,
                    dev.dev_id,
                    rInsAllInst(strcatURI(OBJ_ID.DEV_INFO, 0, 0))
                );
                var resps = await Promise.all([api.empRequest(reqCurDev), api.empRequest(reqDevInfo)]);
                var nrCurDev = normalizeEmp(resps[0]);
                var nrDevInfo = normalizeEmp(resps[1]);
                var curArrays = Array.isArray(nrCurDev.arrays) ? nrCurDev.arrays : [];
                var devInfoArrays = Array.isArray(nrDevInfo.arrays) ? nrDevInfo.arrays : [];
                if (!nrCurDev.ok && curArrays.length === 0) {
                    toastWarn('读取设备信息失败（' + empResultCodeText(nrCurDev.code) + '）');
                    return null;
                }
                var out = {
                    dev_id: '',
                    type: '',
                    ip: '',
                    mask: '',
                    port: '',
                    mac: '',
                    cld_num: '',
                    manu: '',
                    model: '',
                    dev_seq: '',
                    sw_ver: '',
                    antenna_cnt: '-',
                    wireless_func: '-',
                    work_mode: '-'
                };
                curArrays.forEach(function (it) {
                    var uri = String((it && it.uri) || '');
                    var v = (it && it.value_payload != null) ? String(it.value_payload) : '';

                    if (uri === (OBJ_ID.CUR_DEV + '/0/' + RES.CUR_DEV.DEV_TYPE)) {
                        if (v === String(DEV_TYPE.PF)) {
                            out.type = '平台';
                        } else if (v === String(DEV_TYPE.GW)) {
                            out.type = '网关';
                        } else if (v === String(DEV_TYPE.AD)) {
                            out.type = 'AD';
                        } else if (v === String(DEV_TYPE.FD)) {
                            out.type = 'FD';
                        } else {
                            out.type = v;
                        }
                        return;
                    }

                    if (uri === (OBJ_ID.CUR_DEV + '/0/' + RES.CUR_DEV.DEV_ID)) {
                        out.dev_id = v;
                        return;
                    }

                    if (uri === (OBJ_ID.CUR_DEV + '/0/' + RES.CUR_DEV.DEV_IP)) {
                        out.ip = v;
                        return;
                    }

                    if (uri === (OBJ_ID.CUR_DEV + '/0/' + RES.CUR_DEV.DEV_MASK)) {
                        out.mask = v;
                        return;
                    }

                    if (uri === (OBJ_ID.CUR_DEV + '/0/' + RES.CUR_DEV.DEV_PORT)) {
                        out.port = v || '-';
                        return;
                    }

                    if (uri === (OBJ_ID.CUR_DEV + '/0/' + RES.CUR_DEV.MAC)) {
                        try {
                            var hex = v.replace(/[^0-9A-Fa-f]/g, '');
                            if (hex.length >= 12) {
                                var macParts = [];
                                for (var i = 0; i < 12; i += 2) {
                                    macParts.push(hex.substr(i, 2));
                                }
                                out.mac = macParts.join(':').toUpperCase();
                            } else {
                                out.mac = v;
                            }
                        } catch (_) {
                            out.mac = v;
                        }
                        return;
                    }

                    if (uri === (OBJ_ID.CUR_DEV + '/0/' + RES.CUR_DEV.CLD_NUM)) {
                        out.cld_num = v || '-';
                        return;
                    }

                    if (uri === (OBJ_ID.CUR_DEV + '/0/' + RES.CUR_DEV.MANU)) {
                        out.manu = v || '-';
                        return;
                    }

                    if (uri === (OBJ_ID.CUR_DEV + '/0/' + RES.CUR_DEV.DEV_MODE)) {
                        out.model = v || '-';
                        return;
                    }

                    if (uri === (OBJ_ID.CUR_DEV + '/0/' + RES.CUR_DEV.DEV_SEQ)) {
                        out.dev_seq = v || '-';
                        return;
                    }

                    if (uri === (OBJ_ID.CUR_DEV + '/0/' + RES.CUR_DEV.FIRMWARE_VER)) {
                        out.sw_ver = v || '-';
                        return;
                    }
                });
                if (nrDevInfo.ok || devInfoArrays.length > 0) {
                    devInfoArrays.forEach(function (it) {
                        var uri = String((it && it.uri) || '');
                        var parts = uri.split('/');
                        if (parts.length < 3) {
                            return;
                        }
                        if (parseU8(parts[0], -1) !== OBJ_ID.DEV_INFO || parseU8(parts[1], -1) !== 0) {
                            return;
                        }
                        var resId = parseU8(parts[2], -1);
                        var v = (it && it.value_payload != null) ? String(it.value_payload) : '';
                        if (resId === RES.DEV_INFO.ANTENNA_CNT) {
                            out.antenna_cnt = String(parseU8(v, 0));
                            return;
                        }
                        if (resId === RES.DEV_INFO.WIRELESS_FUNC) {
                            out.wireless_func = toWirelessFuncText(parseU8(v, -1));
                            return;
                        }
                        if (resId === RES.DEV_INFO.WORK_MODE) {
                            out.work_mode = toWorkModeText(parseU8(v, -1));
                            return;
                        }
                    });
                }
                return out;
            } catch (e) {
                console.error('[DEV-DETAIL] EMP query failed', e);
                toastWarn('读取设备信息失败');
                return null;
            }
        }

        function openConfigModal() {
            var cur = state.row || {};
            var devId = String(cur.dev_id == null ? '' : cur.dev_id).trim();
            var phIP = formatIpWithPrefix(cur.ip || '192.168.1.1', cur.mask || '24');
            var inpID = E('input', {
                class: 'cfg-input',
                type: 'text',
                value: devId && devId !== '-' ? devId : ''
            });
            var inpIP = E('input', {
                class: 'cfg-input', type: 'text',
                placeholder: phIP, value: phIP
            });
            inpID.addEventListener('input', function () {
                var raw = String(inpID.value || '');
                var normalized = truncateUtf8ByBytes(raw.trim(), 63);
                if (normalized !== raw) {
                    inpID.value = normalized;
                }
            });
            inpIP.addEventListener('input', function () {
                var raw = String(inpIP.value || '');
                var filtered = raw.replace(/[^0-9./]/g, '');
                var slashIdx = filtered.indexOf('/');
                if (slashIdx !== -1) {
                    filtered = filtered.slice(0, slashIdx + 1) + filtered.slice(slashIdx + 1).replace(/\//g, '');
                }
                if (filtered !== raw) {
                    inpIP.value = filtered;
                }
            });

            function confirmSaveAndApply() {
                var nextDevId = String(inpID.value || '').trim();
                if (!nextDevId) {
                    toastWarn('设备ID不能为空');
                    if (typeof inpID.focus === 'function') {
                        inpID.focus();
                    }
                    return;
                }
                if (utf8ByteLength(nextDevId) > 63) {
                    toastWarn('设备ID长度不能超过63字节');
                    if (typeof inpID.focus === 'function') {
                        inpID.focus();
                    }
                    return;
                }
                var parsed = parseIpConfigInput(inpIP.value, cur.mask);
                if (!parsed) {
                    toastWarn('设备IP格式无效');
                    if (typeof inpIP.focus === 'function') {
                        inpIP.focus();
                    }
                    return;
                }
                var latest = state.row || cur;
                var current = parseIpConfigInput(formatIpWithPrefix(latest.ip, latest.mask), latest.mask);
                var curIp = current ? current.ip : String(latest.ip == null ? '' : latest.ip).trim();
                var curPrefix = current ? maskToPrefix(current.mask) : maskToPrefix(latest.mask);
                var nextPrefix = maskToPrefix(parsed.mask);
                var curDevId = String(latest.dev_id == null ? '' : latest.dev_id).trim();
                if (nextDevId === curDevId && parsed.ip === curIp && nextPrefix === curPrefix) {
                    toastWarn('未检测到配置变更');
                    return;
                }
                showNestedConfirm(
                    __('配置修改确认'),
                    __('配置修改后会自动重启当前设备并生效，确认修改？'),
                    async function (btn, close) {
                        await saveDeviceConfigAndApply({
                            devId: nextDevId,
                            ip: parsed.ip,
                            mask: parsed.mask
                        }, btn, close);
                    },
                    function () {
                        if (modalRef && modalRef.root && modalRef.root.classList) {
                            modalRef.root.classList.remove('is-hidden');
                        }
                    }
                );
                if (modalRef && modalRef.root && modalRef.root.classList) {
                    modalRef.root.classList.add('is-hidden');
                }
            }

            var modalRef = null;
            modalRef = showCustomModal(
                __('配置修改'),
                E('div', { class: 'cfg-form' }, [
                        E('div', { class: 'cfg-row' }, [
                            E('label', {}, __('设备ID')),
                            inpID
                        ]),
                        E('div', { class: 'cfg-row' }, [
                            E('label', {}, __('设备IP')),
                            inpIP
                        ])
                    ]),
                [
                    E('button', {
                        class: 'btn',
                        click: function () {
                            if (typeof configModalClose === 'function') {
                                configModalClose();
                            }
                        }
                    }, [__('取消')]),
                    E('button', { class: 'btn cbi-button-action', click: confirmSaveAndApply }, [__('确认')])
                ],
                { width: 430 }
            );
            configModalClose = function () {
                if (modalRef && typeof modalRef.close === 'function') {
                    modalRef.close();
                }
                configModalClose = null;
            };
        }

        function confirmReboot() {
            showAdModal(__('设备重启确认'), [
                E('div', { class: 'modal-body' }, [E('p', {}, __('确定要重启该设备吗？'))]),
                E('div', { class: 'right' }, [
                    E('button', { class: 'btn', click: ui.hideModal }, [__('取消')]),
                    E('button', {
                        class: 'btn cbi-button-negative', click: async function () {
                            try {
                                await callSystemReboot();
                                window.adAuditActions.record('HOST_DETAIL_REBOOT', {}, '成功');
                                ui.hideModal();
                                toastSuccess('已下发重启指令');
                            } catch (e) {
                                window.adAuditActions.record('HOST_DETAIL_REBOOT', {}, '失败');
                                toastError('重启失败');
                            }
                        }
                    }, [__('设备重启')])
                ])
            ], { width: 430 });
        }
        function confirmFactoryReset() {
            showAdModal(__('恢复出厂设置确认'), [
                E('div', { class: 'modal-body' }, [
                    E('p', {}, __('确定要恢复出厂设置吗？该操作会清空当前配置并重启设备。'))
                ]),
                E('div', { class: 'right' }, [
                    E('button', { class: 'btn', click: ui.hideModal }, [__('取消')]),
                    E('button', {
                        class: 'btn cbi-button-negative', click: function (ev) {
                            var btn = ev && ev.currentTarget;
                            if (btn) {
                                btn.disabled = true;
                                btn.classList.add('disabled');
                            }

                            setTimeout(async function () {
                                ui.hideModal();
                                toastSuccess('恢复出厂设置请求已下发');

                                try {
                                    var dev = (typeof getActiveDev === 'function') ? getActiveDev() : { dev_type: DEV_TYPE.AD, dev_id: '' };
                                    var req = createExecInstRequest(dev, strcatURI(OBJ_ID.CUR_DEV, 0, RES.CUR_DEV.FACTORY));
                                    req = attachAuditAction(req, 'HOST_DETAIL_FACTORY_RESET');
                                    var api = await getEmpApi();
                                    await api.empRequest(req);
                                } catch (e) { }
                            }, 500);
                        }
                    }, [__('确认')])
                ])
            ], { width: 430 });
        }

        async function fetchDevice() {
            var cached = readCachedDevice();
            if (cached) {
                return {
                    dev_id: cached.id || cached.dev_id || 'ad001',
                    name: cached.title || cached.name || 'AD',
                    type: 'AD',
                    ip: cached.ip || '192.168.1.1',
                    mask: cached.mask || '24',
                    mac: state.row && state.row.mac || '-',
                    online: true
                };
            }

            return {
                dev_id: 'ad001',
                name: 'AD',
                type: 'AD',
                ip: '192.168.1.1',
                mask: '24',
                mac: '-',
                online: true
            };
        }

        async function reload() {
            var cached = readCachedDevice();
            if (cached) {
                state.row = Object.assign({}, state.row, {
                    dev_id: cached.id || cached.dev_id || 'ad001',
                    name: cached.title || cached.name || 'AD',
                    type: 'AD',
                    ip: cached.ip || '192.168.1.1',
                    mask: cached.mask || state.row && state.row.mask || '24',
                    mac: state.row && state.row.mac || '-',
                    online: true
                });
                renderRow(state.row);
            }

            var data = await fetchFromEMP();
            if (data) {
                state.row = Object.assign({}, state.row || {}, data);
                renderRow(state.row);
                writeDetailCache(state.row);
                try {
                    writeCachedDevice({ id: state.row.dev_id || 'ad001', title: 'AD', ip: state.row.ip || '', mask: state.row.mask || '', online: true });
                    broadcastCurrentDevice({
                        id: state.row.dev_id || 'ad001',
                        title: 'AD',
                        ip: state.row.ip || '',
                        mask: state.row.mask || '',
                        online: true
                    });
                } catch (e) { }
            }
        }

        state.row = Object.assign({
            dev_id: '-',
            type: '-',
            ip: '-',
            mask: '-',
            port: '-',
            mac: '-',
            cld_num: '-',
            manu: '-',
            model: '-',
            dev_seq: '-',
            sw_ver: '-',
            antenna_cnt: '-',
            wireless_func: '-',
            work_mode: '-'
        }, readDetailCache() || {});
        renderRow(state.row);

        reload();

        setTimeout(() => {
            const saveBar = document.querySelector('.cbi-page-actions, .apply, .actions, .cbi-page-save');
            if (saveBar) {
                saveBar.remove();
            }
        }, 300);

        return wrap;
    }
});
