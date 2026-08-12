'use strict';
'require view';
'require dom';

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
            dev_type: (typeof d.dev_type === 'number') ? d.dev_type : ((typeof DEV_TYPE !== 'undefined') ? DEV_TYPE.AD : 1),
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
            loadCssOnce('/luci-static/custom/css/network/inf_setting.css'),
            loadScriptOnce('/luci-static/custom/js/enum.js'),
            loadScriptOnce('/luci-static/custom/js/components.js'),
            loadScriptOnce('/luci-static/custom/js/device_card.js'),
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

        var isIfacePaused = false;
        var ifacePollTimerId = null;

        var fallbackDevType = ((typeof DEV_TYPE !== 'undefined') && typeof DEV_TYPE.AD === 'number') ? DEV_TYPE.AD : 1;
        var deviceCtx = createActiveDeviceContext(fallbackDevType);
        var devices = deviceCtx.devices;
        var activeDevice = deviceCtx.activeIndex;
        var getActiveDev = deviceCtx.getActiveDev;

        var tabs = [
            { key: 'iface', title: _('端口信息') }
        ];
        var activeTab = 'iface';
        var viewModes = [
            { key: 'panel', title: _('面板模式'), icon: '/luci-static/custom/img/fourfold.svg' },
            { key: 'list', title: _('列表模式'), icon: '/luci-static/custom/img/more_list.svg' }
        ];
        var activeMode = 'panel';

        var tableSchemas = {
            iface: {
                columns: [_('端口'), _('端口状态'), _('端口模式'), _('端口IP'), _('端口MAC')],
                data: []
            }
        };

        var PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
        var PAGE_SIZE_DEFAULT = 10;
        var pagers = {
            iface: { page: 1, pageSize: PAGE_SIZE_DEFAULT }
        };

        var ifaceFilters = { port: '', status: 'all' };

        var deviceCardComp = (window.adUiDeviceCard && typeof window.adUiDeviceCard.createDeviceCardRow === 'function')
            ? window.adUiDeviceCard.createDeviceCardRow({
                translate: _,
                devices: devices,
                activeIndex: activeDevice
            })
            : null;
        var deviceRow = deviceCardComp ? deviceCardComp.root : E('div', { 'class': 'ns-device-row' });

        var filterBtn = E('button', { 'class': 'ns-btn ad-c-btn ad-c-btn--primary primary' }, _('筛选'));
        var resetBtn = E('button', { 'class': 'ns-btn ad-c-btn' }, _('重置'));
        var customBtn = E('button', { 'class': 'ns-btn ad-c-btn ghost ns-custom', 'style': 'display:none;' }, _('定制'));

        var pauseBtn = E('button', { 'class': 'ns-icon-btn ad-c-icon-btn ns-pause', 'title': _('暂停自动刷新') }, [
            E('span', { 'class': 'ico' })
        ]);
        var refreshBtn = E('button', { 'class': 'ns-icon-btn ad-c-icon-btn ns-refresh', 'title': _('主动刷新') }, [
            E('span', { 'class': 'ico' })
        ]);

        var subTabs = (function () {
            var bar = E('div', { 'class': 'ns-subtabs' });
            tabs.forEach(function (t) {
                var btn = E('div', {
                    'class': 'ns-subtab' + (t.key === activeTab ? ' active' : ''),
                    'data-key': t.key,
                    'click': function () {
                        activeTab = 'iface';
                        updateTabsActive();
                        updateFilterBar();
                        updateModeView();
                        pagers.iface.page = 1;
                        if (activeMode === 'list') {
                            sendIfaceStatusQuery();
                            sendDeviceInfoQuery();
                        }
                    }
                }, _(t.title));
                bar.appendChild(btn);
            });
            return bar;
        })();
        var modeSwitch = (function () {
            var bar = E('div', { 'class': 'ns-mode-switch' });
            viewModes.forEach(function (m) {
                var btn = E('button', {
                    'type': 'button',
                    'class': 'ns-mode-tab' + (m.key === activeMode ? ' active' : ''),
                    'data-key': m.key,
                    'click': function () {
                        activeMode = m.key;
                        updateModeActive();
                        updateModeView();
                        if (activeMode === 'list') {
                            pagers.iface.page = 1;
                            sendIfaceStatusQuery();
                            sendDeviceInfoQuery();
                        }
                    }
                }, [
                    E('img', { 'class': 'ns-mode-icon', 'src': m.icon, 'alt': '' }),
                    E('span', { 'class': 'ns-mode-text' }, m.title)
                ]);
                bar.appendChild(btn);
            });
            return bar;
        })();

        var filterBar = E('div', { 'class': 'ns-filter' }, [
            E('div', { 'class': 'left' }, []),
            E('div', { 'class': 'right' }, [
                customBtn,
                pauseBtn,
                refreshBtn
            ])
        ]);

        var wirelessSummaryArea = E('div', { 'class': 'ns-wireless-summary-table-wrap' });
        var tableArea = E('div', { 'class': 'ns-table' });
        var footerBar = E('div', { 'class': 'ns-footer pager-modern ad-c-pager' }, [
            E('div', { 'class': 'ns-pag-info' }, _('共 0 行')),
            E('div', { 'class': 'ns-pag-controls', id: 'pageBtns' }),
            E('div', { 'class': 'ns-pag-size' }, [
                E('span', {}, _('每页行数：')),
                E('select', { 'class': 'ns-select ad-c-select', id: 'pageSizeSel' },
                    PAGE_SIZE_OPTIONS.map(function (n) {
                        return E('option', {
                            value: String(n),
                            selected: (n === PAGE_SIZE_DEFAULT) ? 'selected' : null
                        }, String(n));
                    })
                )
            ])
        ]);

        var wifi24Icon = E('img', { 'class': 'ns-wireless-state-icon', 'src': '/luci-static/custom/img/wireless-off.svg', 'alt': '' });
        var wifi24StateText = E('span', { 'class': 'ns-wireless-head-state disabled' }, _('未启用'));
        var wifi5Icon = E('img', { 'class': 'ns-wireless-state-icon', 'src': '/luci-static/custom/img/wireless-off.svg', 'alt': '' });
        var wifi5StateText = E('span', { 'class': 'ns-wireless-head-state disabled' }, _('未启用'));
        var wifi24SsidVal = E('span', { 'class': 'v' }, '-');
        var wifi5SsidVal = E('span', { 'class': 'v' }, '-');
        var wifi24ChanVal = E('span', { 'class': 'v' }, '-');
        var wifi5ChanVal = E('span', { 'class': 'v' }, '-');
        var wifi24FdVal = E('span', { 'class': 'v' }, '-');
        var wifi5FdVal = E('span', { 'class': 'v' }, '-');

        var panelModeBody = E('div', { 'class': 'ns-mode-body ns-mode-body-panel' }, [
            E('div', { 'class': 'ns-panel-top' }, [
                E('div', { 'class': 'ns-panel-top-left' }, [
                    E('div', { 'class': 'ns-wired-grid-wrap' }, [
                        E('div', { 'class': 'ns-wired-grid-body' })
                    ]),
                    E('div', { 'class': 'ns-wired-legend' })
                ]),
                E('div', { 'class': 'ns-panel-top-right' }, [
                    E('div', { 'class': 'ns-panel-subtitle' }, _('无线状态')),
                    E('div', { 'class': 'ns-wireless-extra' }, [
                        E('div', { 'class': 'ns-wireless-col' }, [
                            E('div', { 'class': 'ns-wireless-col-row head' }, [
                                E('div', { 'class': 'ns-wireless-head-left' }, [
                                    wifi24Icon,
                                    E('span', {}, _('2.4G无线接口'))
                                ]),
                                wifi24StateText
                            ]),
                            E('div', { 'class': 'ns-wireless-col-row' }, [
                                E('span', { 'class': 'k' }, _('SSID')),
                                wifi24SsidVal
                            ]),
                            E('div', { 'class': 'ns-wireless-col-row' }, [
                                E('span', { 'class': 'k' }, _('工作信道')),
                                wifi24ChanVal
                            ]),
                            E('div', { 'class': 'ns-wireless-col-row' }, [
                                E('span', { 'class': 'k' }, _('关联FD数量')),
                                wifi24FdVal
                            ])
                        ]),
                        E('div', { 'class': 'ns-wireless-col' }, [
                            E('div', { 'class': 'ns-wireless-col-row head' }, [
                                E('div', { 'class': 'ns-wireless-head-left' }, [
                                    wifi5Icon,
                                    E('span', {}, _('5G无线接口'))
                                ]),
                                wifi5StateText
                            ]),
                            E('div', { 'class': 'ns-wireless-col-row' }, [
                                E('span', { 'class': 'k' }, _('SSID')),
                                wifi5SsidVal
                            ]),
                            E('div', { 'class': 'ns-wireless-col-row' }, [
                                E('span', { 'class': 'k' }, _('工作信道')),
                                wifi5ChanVal
                            ]),
                            E('div', { 'class': 'ns-wireless-col-row' }, [
                                E('span', { 'class': 'k' }, _('关联FD数量')),
                                wifi5FdVal
                            ])
                        ])
                    ])
                ])
            ]),
            E('div', { 'class': 'ns-panel-bottom' }, [
                E('div', { 'class': 'ns-panel-title' }, _('当前端口详情')),
                E('div', { 'class': 'ns-panel-detail-body' })
            ])
        ]);
        var modeFilterRow = E('div', { 'class': 'ns-mode-filter-row' }, [modeSwitch, filterBar]);
        var listModeBody = E('div', { 'class': 'ns-mode-body ns-mode-body-list' }, [wirelessSummaryArea, tableArea, footerBar]);

        var card = E('div', { 'class': 'ns-card ad-c-card' }, [subTabs, modeFilterRow, panelModeBody, listModeBody]);
        var root = E('div', { 'class': 'ns-wrap' }, [deviceRow, card]);
        var wiredGridBody = panelModeBody.querySelector('.ns-wired-grid-body');
        var wiredLegend = panelModeBody.querySelector('.ns-wired-legend');
        var panelDetailBody = panelModeBody.querySelector('.ns-panel-detail-body');
        var selectedWiredPort = null;
        var portSettingState = {
            wiredCount: 0,
            wirelessState: null,
            wirelessAttrs: {
                wifi24: { ssid: '-', workChan: '-', fdCount: '-' },
                wifi5: { ssid: '-', workChan: '-', fdCount: '-' }
            },
            rows: []
        };

        function applyActiveDevice(src) {
            deviceCtx.applyActiveDevice(src, deviceCardComp);
        }

        function syncActiveDeviceCard() {
            return deviceCtx.syncActiveDeviceCard(deviceCardComp);
        }

        window.addEventListener('device:info', function (ev) {
            applyActiveDevice((ev && ev.detail) || null);
        });

        function buildSingleDropdown(options, initValue, placeholderText) {
            if (!window.adComponents || typeof window.adComponents.createSingleSelect !== 'function') {
                throw new Error('adComponents.createSingleSelect is not available');
            }
            return window.adComponents.createSingleSelect({
                options: options,
                value: initValue,
                placeholder: placeholderText || _('请选择'),
                styleVars: {
                    '--adui-ss-min-width': '120px',
                    '--adui-ss-arrow-color': '#7f93b3',
                    '--adui-ss-placeholder': '#7f93b3',
                    '--adui-ss-menu-border': '#2a3b52',
                    '--adui-ss-menu-bg': '#151b24',
                    '--adui-ss-menu-text': '#dbe8ff',
                    '--adui-ss-menu-hover-bg': '#20334a'
                }
            });
        }

        function updateTabsActive() {
            subTabs.querySelectorAll('.ns-subtab').forEach(function (el) {
                var k = el.getAttribute('data-key');
                if (k === activeTab) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            });
        }
        function updateModeActive() {
            modeSwitch.querySelectorAll('.ns-mode-tab').forEach(function (el) {
                var k = el.getAttribute('data-key');
                if (k === activeMode) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            });
        }
        function updateModeView() {
            var listMode = (activeMode === 'list');
            listModeBody.style.display = listMode ? '' : 'none';
            panelModeBody.style.display = listMode ? 'none' : '';
            filterBar.style.display = '';
            if (listMode) {
                updateFilterBar();
            } else {
                var left = filterBar.querySelector('.left');
                dom.content(left, []);
                customBtn.style.display = 'none';
                pauseBtn.style.display = '';
                refreshBtn.style.display = '';
                pauseBtn.title = isIfacePaused ? _('恢复自动刷新') : _('暂停自动刷新');
                pauseBtn.classList.toggle('is-paused', isIfacePaused);
            }
        }

        function updateFilterBar() {
            filterBar.style.display = '';
            var left = filterBar.querySelector('.left');

            pauseBtn.style.display = '';
            pauseBtn.title = isIfacePaused ? _('恢复自动刷新') : _('暂停自动刷新');
            pauseBtn.classList.toggle('is-paused', isIfacePaused);

            customBtn.style.display = 'none';

            function Lbl(txt) {
                return E('span', { style: 'color:#cfe6ff;opacity:.9;' }, txt);
            }

            var inPort = E('input', {
                'class': 'ns-input ad-c-input',
                type: 'text',
                placeholder: _('请输入'),
                value: ifaceFilters.port,
                input: function () {
                    ifaceFilters.port = this.value.trim();
                }
            });

            var selStaDD = buildSingleDropdown(
                [
                    { value: 'all', label: _('全部') },
                    { value: 'up', label: toPortStatText(PORT_SETTING_ENUM.PORT_STAT.UP) },
                    { value: 'down', label: toPortStatText(PORT_SETTING_ENUM.PORT_STAT.DOWN) }
                ],
                ifaceFilters.status,
                _('请选择')
            );
            selStaDD.onChange(function (v) {
                ifaceFilters.status = v;
            });

            dom.content(left, [
                Lbl(_('端口')), inPort,
                Lbl(_('端口状态')), selStaDD.root,
                filterBtn, resetBtn
            ]);
        }

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
            add(2);
            var s = Math.max(3, cur - 1), e = Math.min(total - 2, cur + 1);
            if (s > 3) {
                add('…');
            }
            push(s, e);
            if (e < total - 2) {
                add('…');
            }
            add(total - 1);
            add(total);
            return out;
        }

        function renderPager(total, sliceLen) {
            var pager = pagers.iface;
            var totalPages = Math.max(1, Math.ceil(total / pager.pageSize));
            var cur = Math.min(pager.page, totalPages);
            if (cur !== pager.page) {
                pager.page = cur;
            }

            var wrap = footerBar.querySelector('#pageBtns');
            var btns = [];

            btns.push(E('button', {
                'class': 'pm-btn',
                disabled: (cur === 1) ? 'disabled' : null,
                type: 'button',
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
                        'class': 'pm-btn' + (v === cur ? ' active' : ''),
                        type: 'button',
                        'data-page': v,
                        click: function () {
                            pager.page = v;
                            renderCurrent();
                        }
                    }, String(v)));
                }
            });

            btns.push(E('button', {
                'class': 'pm-btn',
                disabled: (cur >= totalPages) ? 'disabled' : null,
                type: 'button',
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

        function renderTable(columns, fullRows) {
            var p = (ifaceFilters.port || '').toLowerCase();
            var s = (ifaceFilters.status || 'all').toLowerCase();
            var wantedStat = null;
            if (s === 'up') {
                wantedStat = PORT_SETTING_ENUM.PORT_STAT.UP;
            } else if (s === 'down') {
                wantedStat = PORT_SETTING_ENUM.PORT_STAT.DOWN;
            }

            var filtered = fullRows.filter(function (row) {
                var okPort = !p || String(row[0]).toLowerCase().indexOf(p) !== -1;
                var rowStat = parseU8(row[5], PORT_SETTING_ENUM.PORT_STAT.DOWN);
                var okSta = (wantedStat == null) || (rowStat === wantedStat);
                return okPort && okSta;
            });

            var pager = pagers.iface;
            var total = filtered.length;
            var pageSize = pager.pageSize;
            var totalPages = Math.max(1, Math.ceil(total / pageSize));
            if (pager.page > totalPages) {
                pager.page = totalPages;
            }
            if (pager.page < 1) {
                pager.page = 1;
            }
            var start = (pager.page - 1) * pageSize;
            var pageRows = filtered.slice(start, start + pageSize);

            var table = E('table', { 'class': 'ns-data-table ad-c-table' });
            var thead = E('thead', {}, [
                E('tr', {}, columns.map(function (c) { return E('th', {}, c); }))
            ]);
            var tbody = E('tbody');

            pageRows.forEach(function (row) {
                var tr = E('tr', {});
                columns.forEach(function (_colTitle, colIdx) {
                    var cell = row[colIdx];
                    if (colIdx === 1) {
                        var rowStat = parseU8(row[5], PORT_SETTING_ENUM.PORT_STAT.DOWN);
                        var badgeCls = (rowStat === PORT_SETTING_ENUM.PORT_STAT.UP) ? 'badge-up' : 'badge-down';
                        tr.appendChild(E('td', {}, [
                            E('span', { 'class': 'ns-badge ' + badgeCls }, toPortStatText(rowStat))
                        ]));
                    } else {
                        tr.appendChild(E('td', {}, String(cell)));
                    }
                });
                tbody.appendChild(tr);
            });

            table.appendChild(thead);
            table.appendChild(tbody);
            tableArea.innerHTML = '';
            tableArea.appendChild(table);

            renderPager(total, pageRows.length);
        }

        function renderCurrent() {
            var schema = tableSchemas.iface;
            renderTable(schema.columns, schema.data);
        }

        function renderPanelWired() {
            var data = portSettingState.rows || [];
            if (!wiredGridBody || !wiredLegend) {
                return;
            }

            if (data.length === 0) {
                dom.content(wiredGridBody, [
                    E('div', { 'class': 'ns-panel-empty' }, _('暂无端口数据'))
                ]);
                selectedWiredPort = null;
                renderPanelDetail(null);
            } else {
                var sortedData = data.slice().sort(function (a, b) {
                    return parseInt(a[0], 10) - parseInt(b[0], 10);
                });
                var selected = null;
                if (selectedWiredPort != null) {
                    selected = sortedData.find(function (r) {
                        return r && String(r[0]) === String(selectedWiredPort);
                    }) || null;
                }
                if (!selected) {
                    selected = sortedData[0];
                    selectedWiredPort = selected ? selected[0] : null;
                }

                var table = E('table', { 'class': 'ns-wired-table' });
                var tbody = E('tbody');
                var tr = E('tr');

                sortedData.forEach(function (row) {
                    tr.appendChild(buildWiredCell(row, 'up'));
                });

                tbody.appendChild(tr);
                table.appendChild(tbody);
                dom.content(wiredGridBody, [table]);
                renderPanelDetail(selected || null);
            }

            dom.content(wiredLegend, [
                E('div', { 'class': 'ns-wired-legend-item' }, [
                    E('img', { 'class': 'ns-wired-legend-icon', 'src': '/luci-static/custom/img/net-up-on.svg', 'alt': '' }),
                    E('span', {}, toPortStatText(PORT_SETTING_ENUM.PORT_STAT.UP))
                ]),
                E('div', { 'class': 'ns-wired-legend-item' }, [
                    E('img', { 'class': 'ns-wired-legend-icon', 'src': '/luci-static/custom/img/net-up-off.svg', 'alt': '' }),
                    E('span', {}, toPortStatText(PORT_SETTING_ENUM.PORT_STAT.DOWN))
                ])
            ]);
        }

        function buildWiredCell(row, numPos) {
            if (!row) {
                return E('td', { 'class': 'ns-wired-cell empty' }, '—');
            }

            var port = row[0];
            var up = (parseInt(row[5], 10) === PORT_SETTING_ENUM.PORT_STAT.UP);
            var selected = (selectedWiredPort === port);
            var iconFamily = 'up';
            var icon = '/luci-static/custom/img/net-' + iconFamily + '-' + (up ? 'on' : 'off') + '.svg';
            var cellCls = 'ns-wired-cell' + (up ? ' up' : ' down') + (selected ? ' selected' : '');
            return E('td', { 'class': cellCls }, [
                E('span', { 'class': 'ns-wired-port-no ' + (numPos === 'up' ? 'up' : 'bottom') }, String(port)),
                E('button', {
                    'type': 'button',
                    'class': 'ns-wired-port-btn',
                    'click': function () {
                        selectedWiredPort = port;
                        renderPanelWired();
                    }
                }, [
                    E('img', { 'class': 'ns-wired-port-icon', 'src': icon, 'alt': '' })
                ])
            ]);
        }

        function renderPanelDetail(row) {
            if (!panelDetailBody) {
                return;
            }
            if (!row) {
                dom.content(panelDetailBody, [
                    E('div', { 'class': 'ns-panel-empty' }, _('请选择端口查看详情'))
                ]);
                return;
            }
            var port = row[0];
            var details = [
                [_('端口'), String(port)],
                [_('端口状态'), toPortStatText(parseU8(row[5], PORT_SETTING_ENUM.PORT_STAT.DOWN))],
                [_('端口模式'), String(row[2] || '-')],
                [_('端口IP'), String(row[3] || '-')],
                [_('端口MAC'), String(row[4] || '-')]
            ];
            var table = E('table', { 'class': 'ns-port-detail-table' }, [
                E('tbody', {}, details.map(function (item) {
                    return E('tr', {}, [
                        E('td', { 'class': 'k' }, item[0]),
                        E('td', { 'class': 'v' }, item[1])
                    ]);
                }))
            ]);
            dom.content(panelDetailBody, [table]);
        }

        function renderWirelessSummaryTable(en24, en5) {
            var w24 = (portSettingState.wirelessAttrs && portSettingState.wirelessAttrs.wifi24) || {};
            var w5 = (portSettingState.wirelessAttrs && portSettingState.wirelessAttrs.wifi5) || {};
            var rows = [
                ['2.4G', en24, w24.ssid || '-', w24.workChan || '-', w24.fdCount || '-'],
                ['5G', en5, w5.ssid || '-', w5.workChan || '-', w5.fdCount || '-']
            ];
            var table = E('table', { 'class': 'ns-data-table ad-c-table ns-wireless-summary-table' }, [
                E('thead', {}, [
                    E('tr', {}, [
                        E('th', {}, _('无线频段')),
                        E('th', {}, _('状态')),
                        E('th', {}, _('SSID')),
                        E('th', {}, _('工作信道')),
                        E('th', {}, _('关联FD数量'))
                    ])
                ]),
                E('tbody', {}, rows.map(function (row) {
                    return E('tr', {}, [
                        E('td', {}, row[0]),
                        E('td', {}, [
                            E('span', { 'class': 'ns-badge ' + (row[1] ? 'badge-up' : 'badge-down') }, row[1] ? _('已启用') : _('未启用'))
                        ]),
                        E('td', {}, String(row[2])),
                        E('td', {}, String(row[3])),
                        E('td', {}, String(row[4]))
                    ]);
                }))
            ]);
            dom.content(wirelessSummaryArea, [table]);
        }

        function updateWirelessStatusUI() {
            var ws = parseInt(portSettingState.wirelessState, 10);
            var en24 = (ws === PORT_SETTING_ENUM.WIRELESS_STAT.WIFI24_ONLY || ws === PORT_SETTING_ENUM.WIRELESS_STAT.WIFI24_5_BOTH);
            var en5 = (ws === PORT_SETTING_ENUM.WIRELESS_STAT.WIFI5_ONLY || ws === PORT_SETTING_ENUM.WIRELESS_STAT.WIFI24_5_BOTH);

            wifi24Icon.src = en24 ? '/luci-static/custom/img/wireless-on.svg' : '/luci-static/custom/img/wireless-off.svg';
            wifi5Icon.src = en5 ? '/luci-static/custom/img/wireless-on.svg' : '/luci-static/custom/img/wireless-off.svg';

            wifi24StateText.textContent = en24 ? _('已启用') : _('未启用');
            wifi5StateText.textContent = en5 ? _('已启用') : _('未启用');
            wifi24StateText.className = 'ns-wireless-head-state ' + (en24 ? 'enabled' : 'disabled');
            wifi5StateText.className = 'ns-wireless-head-state ' + (en5 ? 'enabled' : 'disabled');

            var w24 = (portSettingState.wirelessAttrs && portSettingState.wirelessAttrs.wifi24) || {};
            var w5 = (portSettingState.wirelessAttrs && portSettingState.wirelessAttrs.wifi5) || {};
            wifi24SsidVal.textContent = String(w24.ssid || '-');
            wifi5SsidVal.textContent = String(w5.ssid || '-');
            wifi24ChanVal.textContent = String(w24.workChan || '-');
            wifi5ChanVal.textContent = String(w5.workChan || '-');
            wifi24FdVal.textContent = String(w24.fdCount || '-');
            wifi5FdVal.textContent = String(w5.fdCount || '-');
            renderWirelessSummaryTable(en24, en5);
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

        filterBtn.onclick = function () {
            pagers.iface.page = 1;
            renderCurrent();
        };

        resetBtn.onclick = function () {
            ifaceFilters.port = '';
            ifaceFilters.status = 'all';
            pagers.iface.page = 1;
            updateFilterBar();
            renderCurrent();
        };

        refreshBtn.onclick = function () {
            spinOnce(refreshBtn);
            Promise.all([
                sendIfaceStatusQuery({ silent: true, auditKey: 'NETWORK_INTERFACE_REFRESH' }),
                sendDeviceInfoQuery()
            ]).then(function (ret) {
                var ok = !!(ret && ret[0]);
                if (ok) {
                    toastSuccess('刷新成功');
                } else {
                    toastWarn('刷新失败');
                }
            }).catch(function () {
                toastWarn('刷新失败');
            });
        };

        pauseBtn.onclick = function () {
            isIfacePaused = !isIfacePaused;
            pauseBtn.classList.toggle('is-paused', isIfacePaused);
            pauseBtn.title = isIfacePaused ? _('恢复自动刷新') : _('暂停自动刷新');
            window.adAuditActions.record(
                isIfacePaused ? 'NETWORK_INTERFACE_PAUSE_AUTO_REFRESH' : 'NETWORK_INTERFACE_RESUME_AUTO_REFRESH',
                {},
                '成功'
            );

            try {
                toastSuccess(isIfacePaused ? '已暂停刷新' : '已恢复刷新');
            } catch (_) { }
        };

        function sendIfaceStatusQuery(opts) {
            opts = opts || {};
            var silent = !!opts.silent;
            var dev = getActiveDev();
            if (!dev || !(dev.dev_id || dev.id)) {
                console.warn('[IFACE] active device is not ready yet');
                return Promise.resolve(false);
            }
            var req = createQueryAllRequest(dev, OBJ_ID.PORT_SETTING);
            if (opts.auditKey) {
                req = attachAuditAction(req, opts.auditKey, opts.auditCtx || {});
            }

            return getEmpApi().then(function (api) {
                return api.empRequest(req);
            }).then(function (resp) {
                var r = normalizeEmp(resp);
                var arrays = Array.isArray(r.arrays) ? r.arrays : [];
                var hasData = arrays.length > 0;

                if (!r.ok && !hasData) {
                    if (!silent) {
                        toastWarn('查询端口信息失败（' + empResultCodeText(r.code) + '）');
                    }
                    return false;
                }

                if (!r.ok && hasData) {
                    console.warn('[IFACE] query code is non-zero but payload exists, continue rendering:', r.code);
                }

                parseIfaceStatus({ resp_arrays: arrays, result: r.code || 0 });
                return true;
            }).catch(function (e) {
                console.error('[IFACE] query failed:', e);
                if (!silent) {
                    toastWarn('查询端口信息失败');
                }
                return false;
            });
        }

        function sendDeviceInfoQuery() {
            var dev = getActiveDev();
            if (!dev || !(dev.dev_id || dev.id)) {
                console.warn('[WIRELESS_ATTR] active device is not ready yet');
                return Promise.resolve(false);
            }

            var insts = [
                rSingleInst(strcatURI(OBJ_ID.WIRELESS_ATTR_24G, 0, RES.WIRELESS_ATTR_24G.NETW_SSID)),
                rSingleInst(strcatURI(OBJ_ID.WIRELESS_ATTR_24G, 0, RES.WIRELESS_ATTR_24G.WORK_CHAN)),
                rSingleInst(strcatURI(OBJ_ID.WIRELESS_ATTR_24G, 0, RES.WIRELESS_ATTR_24G.RELATED_FD_COUNT)),
                rSingleInst(strcatURI(OBJ_ID.WIRELESS_ATTR_5G, 0, RES.WIRELESS_ATTR_5G.NETW_SSID)),
                rSingleInst(strcatURI(OBJ_ID.WIRELESS_ATTR_5G, 0, RES.WIRELESS_ATTR_5G.WORK_CHAN)),
                rSingleInst(strcatURI(OBJ_ID.WIRELESS_ATTR_5G, 0, RES.WIRELESS_ATTR_5G.RELATED_FD_COUNT))
            ];
            var req = createEmpRequest(dev.dev_type, dev.dev_id, insts);

            return getEmpApi().then(function (api) {
                return api.empRequest(req);
            }).then(function (resp) {
                var r = normalizeEmp(resp);
                var arrays = Array.isArray(r.arrays) ? r.arrays : [];
                var hasData = arrays.length > 0;
                if (!r.ok && !hasData) {
                    return false;
                }
                if (!r.ok && hasData) {
                    console.warn('[WIRELESS_ATTR] query code is non-zero but payload exists, continue rendering:', r.code);
                }
                parseWirelessAttrsStatus({ resp_arrays: arrays, result: r.code || 0 }, OBJ_ID.WIRELESS_ATTR_24G);
                parseWirelessAttrsStatus({ resp_arrays: arrays, result: r.code || 0 }, OBJ_ID.WIRELESS_ATTR_5G);
                return true;
            }).catch(function (e) {
                console.error('[WIRELESS_ATTR] query failed:', e);
                return false;
            });
        }

        function parseU8(v, dft) {
            var n = parseInt(v, 10);
            return isNaN(n) ? (dft || 0) : n;
        }

        function parseVisibleString(v) {
            var s = String(v == null ? '' : v);
            s = s.replace(/\0+/g, '').replace(/[^\x20-\x7E]/g, '').trim();
            return s || '-';
        }

        function decodeOpaqueBytes(rawPayload) {
            var raw = String(rawPayload == null ? '' : rawPayload).trim();
            if (!raw) {
                return [];
            }
            if (/^[0-9a-fA-F\s,:-]+$/.test(raw)) {
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
                var txt = chars.join('').trim();
                return txt || '-';
            }
            return parseVisibleString(rawPayload);
        }

        function toPortModeText(modeCode) {
            if (modeCode === PORT_SETTING_ENUM.PORT_MODE.LAN) {
                return PORT_SETTING_ENUM.PORT_MODE_TEXT.LAN;
            }
            if (modeCode === PORT_SETTING_ENUM.PORT_MODE.WAN) {
                return PORT_SETTING_ENUM.PORT_MODE_TEXT.WAN;
            }
            return '-';
        }

        function toPortStatText(statCode) {
            return (statCode === PORT_SETTING_ENUM.PORT_STAT.UP)
                ? PORT_SETTING_ENUM.PORT_STAT_TEXT.UP
                : PORT_SETTING_ENUM.PORT_STAT_TEXT.DOWN;
        }

        function parseWirelessAttrsStatus(resp, objId) {
            if (!resp || !Array.isArray(resp.resp_arrays)) {
                return;
            }

            var is5g = (objId === OBJ_ID.WIRELESS_ATTR_5G);
            var target = is5g ? portSettingState.wirelessAttrs.wifi5 : portSettingState.wirelessAttrs.wifi24;
            var resMap = is5g ? RES.WIRELESS_ATTR_5G : RES.WIRELESS_ATTR_24G;
            var ssid = '-';
            var workChan = '-';
            var fdCount = 0;

            resp.resp_arrays.forEach(function (r) {
                var parts = String(r.uri || '').split('/');
                if (parts.length < 3) {
                    return;
                }
                if (parseU8(parts[0], -1) !== objId) {
                    return;
                }
                if (parseU8(parts[1], -1) !== 0) {
                    return;
                }

                var res = parseU8(parts[2], -1);
                var payload = r.value_payload;
                switch (res) {
                    case resMap.NETW_SSID:
                        ssid = parseSsidPayload(payload);
                        break;
                    case resMap.WORK_CHAN:
                        workChan = parseVisibleString(payload);
                        break;
                    case resMap.RELATED_FD_COUNT:
                        fdCount = parseU8(payload, 0);
                        break;
                }
            });

            target.ssid = ssid || '-';
            target.workChan = workChan || '-';
            target.fdCount = String(fdCount);
            updateWirelessStatusUI();
        }

        function parseIfaceStatus(resp) {
            if (!resp || !resp.resp_arrays) {
                return;
            }

            var perInst = {};
            var maxInst = -1;
            var wiredCount = null;
            var wirelessState = null;

            resp.resp_arrays.forEach(function (r) {
                var parts = String(r.uri || '').split('/');
                if (parts.length < 3) {
                    return;
                }
                if (parseU8(parts[0], -1) !== OBJ_ID.PORT_SETTING) {
                    return;
                }

                var inst = parseU8(parts[1], -1);
                var res = parseU8(parts[2], -1);
                var payload = r.value_payload;

                if (inst >= 0) {
                    maxInst = Math.max(maxInst, inst);
                }

                if (res === RES.PORT_SETTING.WIRED_CNT && wiredCount == null) {
                    wiredCount = parseU8(payload, 0);
                    return;
                }
                if (res === RES.PORT_SETTING.WIRELESS_PORT_STAT && wirelessState == null) {
                    wirelessState = parseU8(payload, -1);
                    return;
                }
                if (inst < 0) {
                    return;
                }
                if (!perInst[inst]) {
                    perInst[inst] = {};
                }
                switch (res) {
                    case RES.PORT_SETTING.PORT_STAT:
                        perInst[inst].stat = parseU8(payload, PORT_SETTING_ENUM.PORT_STAT.DOWN);
                        break;
                    case RES.PORT_SETTING.PORT_MODE:
                        perInst[inst].mode = parseU8(payload, PORT_SETTING_ENUM.PORT_MODE.LAN);
                        break;
                    case RES.PORT_SETTING.PORT_IP:
                        perInst[inst].ip = parseVisibleString(payload);
                        break;
                    case RES.PORT_SETTING.PORT_MAC:
                        perInst[inst].mac = parseVisibleString(payload);
                        break;
                }
            });

            var count = (wiredCount != null && wiredCount > 0) ? wiredCount : (maxInst + 1);
            if (count < 0) {
                count = 0;
            }

            var newRows = [];
            for (var i = 0; i < count; i++) {
                var rec = perInst[i] || {};
                var statCode = (rec.stat != null) ? rec.stat : PORT_SETTING_ENUM.PORT_STAT.DOWN;
                var modeCode = (rec.mode != null) ? rec.mode : PORT_SETTING_ENUM.PORT_MODE.LAN;

                newRows.push([
                    i + 1,
                    toPortStatText(statCode),
                    toPortModeText(modeCode),
                    rec.ip || '-',
                    rec.mac || '-',
                    statCode,
                    modeCode
                ]);
            }

            portSettingState.wiredCount = count;
            portSettingState.wirelessState = wirelessState;
            portSettingState.rows = newRows;
            tableSchemas.iface.data = newRows;
            renderCurrent();
            renderPanelWired();
            updateWirelessStatusUI();
        }

        updateTabsActive();
        updateModeActive();
        updateModeView();
        renderCurrent();
        renderPanelWired();
        updateWirelessStatusUI();

        syncActiveDeviceCard().finally(function () {
            empApiPromise.then(function () {
                return Promise.all([sendIfaceStatusQuery(), sendDeviceInfoQuery()]);
            }).catch(function () { }).finally(function () { });
        });

        function startPolling() {
            stopPolling();
            ifacePollTimerId = setInterval(function () {
                if (isIfacePaused) {
                    return;
                }
                if (activeTab === 'iface') {
                    sendIfaceStatusQuery().catch(function () { });
                    sendDeviceInfoQuery().catch(function () { });
                }
            }, 5000);
        }

        function stopPolling() {
            if (ifacePollTimerId != null) {
                clearInterval(ifacePollTimerId);
                ifacePollTimerId = null;
            }
        }

        startPolling();

        return root;
    }
});
