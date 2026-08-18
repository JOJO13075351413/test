'use strict';
'require view';
'require dom';

return view.extend({
    load: function () {
        return Promise.all([
            loadCssOnce('/luci-static/custom/css/access-dev/fd.css'),
            loadScriptOnce('/luci-static/custom/js/components.js'),
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

        if (window.adDeviceInfo && typeof window.adDeviceInfo.refreshSelfDevInfo === 'function') {
            window.adDeviceInfo.refreshSelfDevInfo().catch(function () { });
        }

        function getActiveDev() {
            if (window.adDeviceInfo && typeof window.adDeviceInfo.getActiveDev === 'function') {
                return window.adDeviceInfo.getActiveDev();
            }
            return {
                dev_type: DEV_TYPE.AD,
                dev_id: '',
                title: '',
                ip: '',
                online: false
            };
        }

        var PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
        var PAGE_SIZE_DEFAULT = 10;
        var pager = { page: 1, pageSize: PAGE_SIZE_DEFAULT };

        var columns = [
            { key: '__sel__', title: '' },
            { key: 'idx', title: _('序号') },
            { key: 'devid', title: _('设备ID') },
            { key: 'dip', title: _('设备IP') },
            { key: 'dport', title: _('设备端口') },
            { key: 'mac', title: _('MAC') },
            { key: 'dstate', title: _('设备状态') },
            { key: 'ops', title: _('操作') }
        ];
        var rows = [];

        function parseCldDevArrays(arrays) {
            var list = [];
            if (!Array.isArray(arrays)) {
                return list;
            }
            var byInst = Object.create(null);

            arrays.forEach(function (item) {
                if (!item) {
                    return;
                }
                var uri = String(item.uri || '');
                var parts = uri.split('/');
                if (parts.length !== 3) {
                    return;
                }
                if (String(parts[0]) !== String(OBJ_ID.CLD_DEV)) {
                    return;
                }
                var instId = parseInt(parts[1], 10);
                var resId = parseInt(parts[2], 10);
                if (isNaN(instId) || isNaN(resId)) {
                    return;
                }
                if (!byInst[instId]) {
                    byInst[instId] = {
                        inst: instId,
                        dev_type: null,
                        dev_id: '',
                        dev_ip: '',
                        dev_port: '',
                        mac: '',
                        active: '',
                        lifetime: ''
                    };
                }
                var row = byInst[instId];
                var vp = (item.value_payload != null) ? String(item.value_payload) : '';
                if (resId === RES.CLD_DEV.DEV_TYPE) {
                    row.dev_type = parseInt(vp, 10);
                } else if (resId === RES.CLD_DEV.DEV_ID) {
                    row.dev_id = vp;
                } else if (resId === RES.CLD_DEV.DEV_IP) {
                    row.dev_ip = vp;
                } else if (resId === RES.CLD_DEV.DEV_PORT) {
                    row.dev_port = vp;
                } else if (resId === RES.CLD_DEV.MAC) {
                    row.mac = vp;
                } else if (resId === RES.CLD_DEV.ACTIVE) {
                    row.active = vp;
                } else if (resId === RES.CLD_DEV.LIFETIME) {
                    row.lifetime = vp;
                }
            });

            Object.keys(byInst).forEach(function (k) {
                var r = byInst[k];
                if (typeof r.dev_type !== 'number') {
                    return;
                }
                if (r.dev_type !== DEV_TYPE.FD) {
                    return;
                }
                var isOnline = (r.active === '1');
                var formattedMac = '-';
                if (r.mac && r.mac.length >= 12) {
                    var macStr = r.mac.substring(0, 12);
                    formattedMac = macStr.match(/.{1,2}/g).join(':').toUpperCase();
                } else if (r.mac) {
                    formattedMac = '-';
                }
                list.push({
                    inst: r.inst,
                    devid: r.dev_id || '-',
                    dip: r.dev_ip || '-',
                    dport: r.dev_port || '-',
                    mac: formattedMac,
                    dstate: isOnline ? _('在线') : _('离线'),
                    rawActive: isOnline ? '1' : '0',
                    devType: r.dev_type,
                    rawMac: r.mac || ''
                });
            });

            list.sort(function (a, b) {
                return a.inst - b.inst;
            });
            list.forEach(function (item, idx) {
                item.idx = idx + 1;
            });

            return list;
        }

        function spinOnce(btn) {
            if (!btn) {
                return;
            }
            btn.classList.remove('spin1');
            void btn.offsetWidth;
            btn.classList.add('spin1');

            var onEnd = function () {
                btn.classList.remove('spin1');
                btn.removeEventListener('animationend', onEnd, false);
            };
            btn.addEventListener('animationend', onEnd, false);
        }

        function getFilteredRows() {
            var idVal = String(idInput.value || '').trim();
            var ipVal = String(ipInput.value || '').trim();
            var stateVal = String(stateSel.getValue() || 'all');
            var data = rows.slice();

            if (idVal) {
                data = data.filter(function (r) {
                    return String(r.devid || '').indexOf(idVal) !== -1;
                });
            }
            if (ipVal) {
                data = data.filter(function (r) {
                    return String(r.dip || '').indexOf(ipVal) !== -1;
                });
            }
            if (stateVal && stateVal !== 'all') {
                data = data.filter(function (r) {
                    if (stateVal === 'online') {
                        return r.rawActive === '1';
                    }
                    if (stateVal === 'offline') {
                        return r.rawActive === '0';
                    }
                    return true;
                });
            }

            return data;
        }

        function attachAuditAction(req, actionKey, ctx) {
            if (window.adAuditActions && typeof window.adAuditActions.attach === 'function') {
                return window.adAuditActions.attach(req, actionKey, ctx || {});
            }
            return req;
        }

        function sendQueryForActive(opts) {
            opts = opts || {};
            var dev = getActiveDev();
            var req = createQueryAllRequest(dev, OBJ_ID.CLD_DEV);
            if (opts.auditKey) {
                req = attachAuditAction(req, opts.auditKey, opts.auditCtx || {});
            }

            return getEmpApi().then(function (api) {
                return api.empRequest(req).then(function (res) {
                    var nr = normalizeEmp(res);
                    rows = parseCldDevArrays(nr.arrays);
                    renderCurrent();
                    return { ok: nr.ok, code: nr.code };
                });
            }).catch(function () {
                return { ok: false, code: -1 };
            });
        }

        var idInput = E('input', { 'class': 'ns-input', type: 'text', placeholder: _('请输入') });
        var ipInput = E('input', { 'class': 'ns-input', type: 'text', placeholder: _('请输入') });
        function buildSingleDropdown(options, initValue, placeholderText) {
            if (!window.adComponents || typeof window.adComponents.createSingleSelect !== 'function') {
                throw new Error('adComponents.createSingleSelect is not available');
            }
            var select = window.adComponents.createSingleSelect({
                options: options,
                value: initValue,
                placeholder: placeholderText || _('请选择'),
                styleVars: {
                    '--adui-ss-min-width': '100px',
                    '--adui-ss-arrow-color': '#968a80',
                    '--adui-ss-placeholder': '#968a80',
                    '--adui-ss-menu-border': '#e9dfd5',
                    '--adui-ss-menu-bg': '#ffffff',
                    '--adui-ss-menu-text': '#3d434c',
                    '--adui-ss-menu-hover-bg': '#fff4ec',
                    '--adui-ss-menu-selected-bg': '#ffe3cd'
                }
            });
            return {
                root: select.root,
                getValue: function () { return String(select.get() || 'all'); },
                setValue: function (v) { select.set(v == null ? 'all' : String(v)); }
            };
        }

        var stateSel = buildSingleDropdown([
            { value: 'all', label: _('全部') },
            { value: 'online', label: _('在线') },
            { value: 'offline', label: _('离线') }
        ], 'all', _('请选择'));

        function pair(label, control) {
            return E('div', { 'class': 'ns-fieldpair' }, [
                E('label', { 'class': 'ns-lbl' }, _(label)),
                E('div', { 'class': 'ns-ctl' }, [control])
            ]);
        }

        var filterBtn = E('button', { 'class': 'ns-btn primary' }, _('筛选'));
        var resetBtn = E('button', { 'class': 'ns-btn' }, _('重置'));

        var exportBtn = E('button', { 'class': 'ns-btn' }, _('导出'));
        var rebootBtn = E('button', { 'class': 'ns-btn' }, _('重启'));
        var refreshBtn = E('button', { 'class': 'ns-icon-btn ns-refresh', title: _('刷新') });

        var filterBar = E('div', { 'class': 'ns-filter' }, [
            E('div', { 'class': 'left' }, [
                pair('设备ID：', idInput),
                pair('设备IP：', ipInput),
                pair('设备状态：', stateSel.root),
                filterBtn,
                resetBtn
            ]),
            E('div', { 'class': 'right' }, [
                refreshBtn
            ])
        ]);

        var tableArea = E('div', { 'class': 'ns-table' });
        var footerBar = E('div', { 'class': 'ns-footer pager-modern' }, [
            E('div', { 'class': 'ns-pag-info' }, _('共 0 行')),
            E('div', { 'class': 'ns-pag-controls', id: 'pageBtns' }),
            E('div', { 'class': 'ns-pag-size' }, [
                E('span', {}, _('每页行数：')),
                E('select', { 'class': 'ns-select', id: 'pageSizeSel' },
                    PAGE_SIZE_OPTIONS.map(function (n) {
                        return E('option', {
                            value: String(n),
                            selected: (n === PAGE_SIZE_DEFAULT) ? 'selected' : null
                        }, String(n));
                    })
                )
            ])
        ]);

        var card = E('div', { 'class': 'ns-card' }, [filterBar, tableArea, footerBar]);
        var root = E('div', { 'class': 'ns-wrap' }, [card]);

        function buildPageList(cur, total) {
            var out = [];
            function add(v) {
                if (out[out.length - 1] !== v) {
                    out.push(v);
                }
            }
            function push(a, b) {
                for (var i = a; i <= b; i++) {
                    add(i);
                }
            }
            if (total <= 7) {
                push(1, total);
                return out;
            }
            add(1);
            if (cur > 4) {
                add('…');
            }
            var start = Math.max(2, cur - 1);
            var end = Math.min(total - 1, cur + 1);
            push(start, end);
            if (cur < total - 3) {
                add('…');
            }
            add(total);
            return out;
        }

        function renderPager(total, sliceLen) {
            var totalPages = Math.max(1, Math.ceil(total / pager.pageSize));
            var cur = Math.min(pager.page, totalPages);
            if (cur !== pager.page) {
                pager.page = cur;
            }

            var wrap = footerBar.querySelector('#pageBtns');
            var btns = [];

            btns.push(E('button', {
                'class': 'pm-btn',
                disabled: (cur === 1) ? 'disabled' : null, type: 'button',
                click: function () {
                    if (pager.page > 1) {
                        pager.page--;
                        renderCurrent();
                    }
                }
            }, '‹'));

            buildPageList(cur, totalPages).forEach(function (v) {
                if (v === '…') {
                    btns.push(E('span', { 'class': 'pm-ellipsis' }, '…'));
                } else {
                    btns.push(E('button', {
                        'class': 'pm-btn' + (v === cur ? ' active' : ''), type: 'button',
                        click: function () {
                            pager.page = v;
                            renderCurrent();
                        }
                    }, String(v)));
                }
            });

            btns.push(E('button', {
                'class': 'pm-btn', disabled: (cur >= totalPages) ? 'disabled' : null, type: 'button',
                click: function () {
                    if (pager.page < totalPages) {
                        pager.page++;
                        renderCurrent();
                    }
                }
            }, '›'));

            dom.content(wrap, btns);

            var infoNode = footerBar.querySelector('.ns-pag-info');
            if (infoNode) {
                infoNode.textContent = _('共 ') + total + _(' 行');
            }

            var sizeSel = footerBar.querySelector('#pageSizeSel') || footerBar.querySelector('.ns-select');
            if (sizeSel) {
                var want = String(pager.pageSize);
                if (sizeSel.value !== want) {
                    sizeSel.value = want;
                }
                sizeSel.onchange = function () {
                    pager.pageSize = parseInt(sizeSel.value, 10) || PAGE_SIZE_DEFAULT;
                    pager.page = 1;
                    renderCurrent();
                };
            }

            var hide = (total === 0 || sliceLen === 0);
            footerBar.classList.toggle('hidden', hide);
            footerBar.style.display = hide ? 'none' : '';
        }

        function renderTable(cols, data, total) {
            var table = E('table', { 'class': 'ns-data-table' });
            var trh = E('tr');
            cols.forEach(function (col) {
                var th;
                if (col.key === '__sel__') {
                    th = E('th', { 'class': 'th-checkbox' }, [
                        E('input', { type: 'checkbox', class: 'ns-check-all', change: function () { } })
                    ]);
                } else {
                    th = E('th', {}, _(col.title));
                }
                trh.appendChild(th);
            });
            var thead = E('thead', {}, [trh]);
            var tbody = E('tbody');

            data.forEach(function (row) {
                var tr = E('tr');
                cols.forEach(function (col) {
                    var td;
                    if (col.key === '__sel__') {
                        td = E('td', { 'class': 'td-checkbox' }, [
                            E('input', { type: 'checkbox', class: 'ns-check-one' })
                        ]);
                    } else if (col.key === 'ops') {
                        td = E('td', {});
                    } else {
                        var v = row[col.key];
                        if (v == null) {
                            v = '';
                        }
                        td = E('td', {}, String(v));
                    }
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });

            table.appendChild(thead);
            table.appendChild(tbody);
            tableArea.innerHTML = '';
            tableArea.appendChild(table);

            renderPager(total, data.length);
        }

        function renderCurrent() {
            var filtered = getFilteredRows();
            var total = filtered.length;
            var start = (pager.page - 1) * pager.pageSize;
            var end = start + pager.pageSize;
            if (start < 0) {
                start = 0;
            }
            if (end > total) {
                end = total;
            }
            var slice = filtered.slice(start, end);
            renderTable(columns, slice, total);
        }

        filterBtn.onclick = function () {
            pager.page = 1;
            renderCurrent();
        };
        resetBtn.onclick = function () {
            idInput.value = '';
            ipInput.value = '';
            stateSel.setValue('all');
            pager.page = 1;
            renderCurrent();
        };

        exportBtn.onclick = function () { };
        rebootBtn.onclick = function () { };
        refreshBtn.onclick = function () {
            var self = this;
            spinOnce(self);
            pager.page = 1;
            sendQueryForActive({ auditKey: 'ACCESS_DEV_REFRESH' }).then(function (r) {
                if (r.ok) {
                    toastSuccess('刷新成功');
                } else {
                    toastWarn('刷新失败（' + empResultCodeText(r.code) + '）');
                }
            }).catch(function () {
                toastWarn('刷新失败');
            });
        };

        renderCurrent();

        empApiPromise.then(function () {
            return sendQueryForActive();
        }).catch(function () { });

        return root;
    }
});
