'use strict';
'require view';
'require dom';
'require ui';
'require fs';

return view.extend({
    load: function () {
        return Promise.all([
            loadCssOnce('/luci-static/custom/css/host/update.css'),
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

        function attachAuditAction(req, actionKey, ctx) {
            if (window.adAuditActions && typeof window.adAuditActions.attach === 'function') {
                return window.adAuditActions.attach(req, actionKey, ctx || {});
            }
            return req;
        }

        var sqlApiPromise = L.require('emp/sql').then(function (mod) {
            return (typeof mod === 'function') ? new mod() : mod;
        });
        function getSqlApi() {
            return sqlApiPromise;
        }

        if (window.adDeviceInfo && typeof window.adDeviceInfo.refreshSelfDevInfo === 'function') {
            window.adDeviceInfo.refreshSelfDevInfo().catch(function () { });
        }

        var pollIntervalMs = 10000;
        var POLL_INTERVAL_SLOW = 10000;
        var POLL_INTERVAL_FAST = 3000;
        var macAgingCfgByDev = Object.create(null);

        function getActiveDev() {
            if (window.adDeviceInfo && typeof window.adDeviceInfo.getActiveDev === 'function') {
                return window.adDeviceInfo.getActiveDev();
            }
            return {
                dev_type: (typeof DEV_TYPE === 'object' && typeof DEV_TYPE.AD === 'number') ? DEV_TYPE.AD : 1,
                dev_id: '',
                title: '',
                ip: '',
                online: false
            };
        }

        var tabs = [
            { key: 'ad_dev', title: _('无线接入点升级') },
            { key: 'log', title: _('升级日志') }
        ];

        var pollTimerId = null;
        var activeTab = 'ad_dev';

        var PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
        var PAGE_SIZE_DEFAULT = 10;
        var pagers = {
            ad_dev: { page: 1, pageSize: PAGE_SIZE_DEFAULT },
            log: { page: 1, pageSize: PAGE_SIZE_DEFAULT }
        };

        var adDevColumns = [
            { key: 'name', title: _('升级包名称') },
            { key: 'size', title: _('升级包大小') },
            { key: 'ptype', title: _('升级包类型') },
            { key: 'old_ver', title: _('当前版本') },
            { key: 'target_ver', title: _('升级包版本') },
            { key: 'status', title: _('升级状态') },
            { key: 'result', title: _('升级结果') },
            { key: 'ops', title: _('操作') }
        ];

        var logColumns = [
            { key: 'idx', title: _('序号') },
            { key: 'name', title: _('升级包名称') },
            { key: 'size', title: _('升级包大小') },
            { key: 'dev_type', title: _('升级设备类型') },
            { key: 'ptype', title: _('升级包类型') },
            { key: 'old_fw_ver', title: _('升级前固件版本') },
            { key: 'new_fw_ver', title: _('升级后固件版本') },
            { key: 'upgrade_result', title: _('升级结果') },
            { key: 'time', title: _('升级时间') }
        ];

        var tableSchemas = {
            ad_dev: {
                columns: adDevColumns,
                data: []
            },
            log: {
                columns: logColumns,
                data: []
            }
        };

        var subTabs = (function () {
            var bar = E('div', { 'class': 'ns-subtabs' });
            tabs.forEach(function (t) {
                var btn = E('div', {
                    'class': 'ns-subtab' + (t.key === activeTab ? ' active' : ''),
                    'data-key': t.key,
                    'click': function () {
                        activeTab = t.key;
                        updateTabsActive();
                        pagers[activeTab].page = 1;
                        refreshFilterBar();
                        renderCurrent();
                        refreshActiveTabData();
                    }
                }, _(t.title));
                bar.appendChild(btn);
            });
            return bar;
        })();
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

        function clearAllPollingFlags() {
            stopPolling();
        }

        function Lbl(txt) {
            return E('span', { 'class': 'ns-label' }, txt);
        }
        var nameInput = E('input', { 'class': 'ns-input', type: 'text', placeholder: _('请输入') });
        var verInput = E('input', { 'class': 'ns-input', type: 'text', placeholder: _('请输入') });
        var statusSel = E('select', { 'class': 'ns-select' }, [
            E('option', { value: '' }, _('请选择'))
        ]);
        var filterBtn = E('button', { 'class': 'ns-btn primary' }, _('筛选'));
        var resetBtn = E('button', { 'class': 'ns-btn' }, _('重置'));
        var upgradeBtn = E('button', { 'class': 'ns-btn primary' }, _('升级'));
        upgradeBtn.classList.remove('ns-icon-btn');

        var logNameInput = E('input', { 'class': 'ns-input', type: 'text', placeholder: _('请输入') });
        var logTypeDd = buildSingleDropdown([
            { value: 'all', label: _('全部') },
            { value: '0', label: _('固件升级') },
            { value: '1', label: _('替换文件') }
        ], 'all', _('全部'));
        var logFilterBtn = E('button', { 'class': 'ns-btn primary', 'type': 'button' }, _('筛选'));
        var logResetBtn = E('button', { 'class': 'ns-btn', 'type': 'button' }, _('重置'));

        var addBtn = E('button', {
            'class': 'ns-icon-btn ns-add',
            'type': 'button',
            'title': _('添加升级包')
        });
        var refreshBtn = E('button', { 'class': 'ns-icon-btn ns-refresh', title: _('刷新') });
        var filterBar = buildFilterBar();

        function buildFilterBar() {
            var right;
            if (activeTab === 'ad_dev') {
                right = [addBtn, refreshBtn];
            } else if (activeTab === 'log') {
                right = [refreshBtn];
            }

            var leftChildren = [];

            if (activeTab === 'log') {
                leftChildren = [
                    E('div', { 'class': 'ns-inline' }, [Lbl(_('升级包名称')), logNameInput]),
                    E('div', { 'class': 'ns-inline' }, [Lbl(_('升级包类型')), logTypeDd.root]),
                    logFilterBtn,
                    logResetBtn
                ];
            }

            return E('div', { 'class': 'ns-filter' }, [
                E('div', { 'class': 'left' }, leftChildren),
                E('div', { 'class': 'right' }, right)
            ]);
        }
        function refreshFilterBar() {
            var newBar = buildFilterBar();
            filterBar.replaceWith(newBar);
            filterBar = newBar;
            bindFilterEvents();
        }

        function _pad2(n) {
            var v = parseInt(n, 10) || 0;
            return (v < 10 ? '0' : '') + String(v);
        }

        function _formatNowForLog() {
            var d = new Date();
            var yy = _pad2(d.getFullYear() % 100);
            var mm = _pad2(d.getMonth() + 1);
            var dd = _pad2(d.getDate());
            var hh = _pad2(d.getHours());
            var mi = _pad2(d.getMinutes());
            var ss = _pad2(d.getSeconds());
            return yy + '/' + mm + '/' + dd + ' ' + hh + ':' + mi + ':' + ss;
        }

        function ensureUpdateLogTable() {
            var cols = [
                { name: 'pkg_name', type: 'TEXT' },
                { name: 'pkg_size', type: 'INTEGER' },
                { name: 'dev_type', type: 'INTEGER' },
                { name: 'pkg_type', type: 'INTEGER' },
                { name: 'old_fw_ver', type: 'TEXT' },
                { name: 'new_fw_ver', type: 'TEXT' },
                { name: 'dl_path', type: 'TEXT' },
                { name: 'upgrade_result', type: 'TEXT' },
                { name: 'up_time', type: 'TEXT' }
            ];

            return getSqlApi().then(function (api) {
                return api.createTable('update_log', cols);
            }).then(function (r) {
                if (!(r && r.ok)) {
                    console.warn('[UPDATE] create update_log failed, status=', r ? r.status : -1);
                }
            }).catch(function (e) {
                console.warn('[UPDATE] create update_log error:', e);
            });
        }

        function _pkgTypeLabelByNum(n) {
            var v = parseInt(n, 10);
            if (v === 0) {
                return _('固件升级');
            } else if (v === 1) {
                return _('替换文件');
            }
            return '';
        }

        function writeUpgradeLogFromRow(row, opt) {
            var rec = row || {};
            var o = opt || {};
            var name = String(rec.name || '');
            var size = (typeof rec.size === 'number') ? rec.size : (parseInt(rec.size, 10) || 0);
            var ptype = (typeof rec.pkg_type_num === 'number') ? rec.pkg_type_num : (parseInt(rec.pkg_type_num, 10) || 0);
            var devTypeNum = (typeof rec.dev_type_num === 'number') ? rec.dev_type_num : (parseInt(rec.dev_type_num, 10) || 0);
            var oldFw = String(rec.old_ver || '');
            var newFw = String(rec.target_ver || '');
            var url = String(rec.url || '');
            var t = _formatNowForLog();
            var upRes = '';
            if (o && o.writeResult) {
                upRes = String(rec.result || '');
            }

            return ensureUpdateLogTable().then(function () {
                return getSqlApi().then(function (api) {
                    return api.insertRow('update_log', {
                        pkg_name: name,
                        pkg_size: String(size),
                        dev_type: String(devTypeNum),
                        pkg_type: String(ptype),
                        old_fw_ver: oldFw,
                        new_fw_ver: newFw,
                        dl_path: url,
                        upgrade_result: upRes,
                        up_time: t
                    });
                });
            }).then(function (r) {
                if (!(r && r.ok)) {
                    console.warn('[UPDATE] insert update_log failed, status=', r ? r.status : -1);
                }
            }).catch(function (e) {
                console.warn('[UPDATE] insert update_log error:', e);
            });
        }

        function queryUpdateLogs() {
            return ensureUpdateLogTable().then(function () {
                return getSqlApi().then(function (api) {
                    return api.queryTableOrderBy('update_log', 'up_time', true);
                });
            }).then(function (r) {
                if (!(r && r.ok)) {
                    return [];
                }

                var rows = Array.isArray(r.rows) ? r.rows : [];
                var out = rows.map(function (it) {
                    var ptypeNum = (it && it.pkg_type != null) ? parseInt(it.pkg_type, 10) : 0;
                    var devTypeNum = (it && it.dev_type != null) ? parseInt(it.dev_type, 10) : 0;
                    return {
                        name: (it && it.pkg_name != null) ? String(it.pkg_name) : '',
                        size: (it && it.pkg_size != null) ? (parseInt(it.pkg_size, 10) || 0) : 0,
                        dev_type_num: devTypeNum,
                        dev_type: _devTypeLabelByNum(devTypeNum),
                        pkg_type_num: ptypeNum,
                        ptype: _pkgTypeLabelByNum(ptypeNum),
                        old_fw_ver: (it && it.old_fw_ver != null) ? String(it.old_fw_ver) : '',
                        new_fw_ver: (it && it.new_fw_ver != null) ? String(it.new_fw_ver) : '',
                        url: (it && it.dl_path != null) ? String(it.dl_path) : '',
                        upgrade_result: (it && it.upgrade_result != null) ? String(it.upgrade_result) : '',
                        time: (it && it.up_time != null) ? String(it.up_time) : ''
                    };
                });

                return out;
            }).catch(function (e) {
                console.warn('[UPDATE] query update_log error:', e);
                return [];
            });
        }

        function backfillLatestLogResultIfEmpty(pkgName, rawResult) {
            var name = String(pkgName || '').trim();
            var res = String(rawResult || '').trim();
            if (!name || !res) {
                return Promise.resolve();
            }

            return ensureUpdateLogTable().then(function () {
                return getSqlApi().then(function (api) {
                    return api.queryTableOrderBy('update_log', 'up_time', true).then(function (qr) {
                        if (!(qr && qr.ok) || !Array.isArray(qr.rows) || qr.rows.length === 0) {
                            return;
                        }

                        var hit = null;
                        for (var i = 0; i < qr.rows.length; i++) {
                            var r = qr.rows[i] || {};
                            if (String(r.pkg_name || '') === name) {
                                hit = r;
                                break;
                            }
                        }
                        if (!hit) {
                            return;
                        }

                        var cur = String(hit.upgrade_result || '').trim();
                        if (cur) {
                            return;
                        }

                        return api.updateLatestOneWhereOrderBy(
                            'update_log',
                            'upgrade_result', res,
                            'pkg_name', name,
                            'up_time', true
                        );
                    });
                });
            }).catch(function (e) {
                console.warn('[UPDATE] backfill upgrade_result error:', e);
            });
        }
        function openFwUpgradeConfirmModal(info) {
            var opt = info || {};
            var onOk = (typeof opt.onOk === 'function') ? opt.onOk : null;
            var onCancel = (typeof opt.onCancel === 'function') ? opt.onCancel : null;

            var modal = E('div', {
                'class': 'um-modal',
                'role': 'dialog',
                'aria-label': _('升级确认')
            });
            var panel = E('div', { 'class': 'um-panel' });
            if (window.adModal && typeof window.adModal.decorate === 'function') {
                window.adModal.decorate(panel, { width: 430 });
            }
            var title = E('div', { 'class': 'um-title' }, _('升级确认'));

            var msg = E('div', { 'style': 'padding: 0 8px 8px; line-height: 1.6; color: #3d434c;' }, [
                E('div', {}, _('固件升级过程中AD将自动重启，界面无法正常使用。')),
                E('div', { 'style': 'margin-top: 6px; opacity: .9;' }, _('请确认是否继续执行升级？'))
            ]);

            function close() {
                if (modal && modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }

            var actions = E('div', { 'class': 'um-actions' });
            var btnCancel = E('button', { 'class': 'um-btn', type: 'button' }, _('取消'));
            var btnOk = E('button', { 'class': 'um-btn primary', type: 'button' }, _('确认升级'));

            btnCancel.onclick = function () {
                close();
                if (onCancel) {
                    onCancel();
                }
            };
            btnOk.onclick = function () {
                close();
                if (onOk) {
                    onOk();
                }
            };

            actions.appendChild(btnCancel);
            actions.appendChild(btnOk);
            panel.appendChild(title);
            panel.appendChild(msg);
            panel.appendChild(actions);
            modal.appendChild(panel);
            document.body.appendChild(modal);
        }

        function openSimpleConfirmModal(text) {
            var modal = E('div', {
                'class': 'um-modal',
                'role': 'dialog',
                'aria-label': _('提示')
            });
            var panel = E('div', { 'class': 'um-panel' });
            if (window.adModal && typeof window.adModal.decorate === 'function') {
                window.adModal.decorate(panel, { width: 430 });
            }
            var title = E('div', { 'class': 'um-title' }, _('提示'));

            var msg = E('div', { 'style': 'padding: 0 8px 8px; line-height: 1.6; color: #3d434c;' }, String(text || ''));

            function close() {
                if (modal && modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }

            var actions = E('div', { 'class': 'um-actions' });
            var btnOk = E('button', { 'class': 'um-btn primary', type: 'button' }, _('确认'));
            btnOk.onclick = function () {
                close();
            };

            actions.appendChild(btnOk);
            panel.appendChild(title);
            panel.appendChild(msg);
            panel.appendChild(actions);
            modal.appendChild(panel);
            document.body.appendChild(modal);
        }

        function bindFilterEvents() {
            filterBtn.onclick = function () {
                pagers[activeTab].page = 1;
                renderCurrent();
            };
            resetBtn.onclick = function () {
                nameInput.value = '';
                verInput.value = '';
                statusSel.value = '';
                pagers[activeTab].page = 1;
                renderCurrent();
            };

            logFilterBtn.onclick = function () {
                pagers[activeTab].page = 1;
                renderCurrent();
            };
            logResetBtn.onclick = function () {
                logNameInput.value = '';
                logTypeDd.set('all');
                pagers[activeTab].page = 1;
                renderCurrent();
            };

            function doUpgradeByInst(instId) {
                var dev = getActiveDev();
                instId = parseInt(instId, 10);
                if (isNaN(instId)) {
                    toastWarn(_('升级失败：实例ID无效'));
                    return;
                }

                var schema = tableSchemas[activeTab];
                var hitRow = null;
                if (schema && Array.isArray(schema.data)) {
                    hitRow = schema.data.filter(function (r) {
                        return r && r._inst === instId;
                    })[0] || null;
                }

                getEmpApi().then(function (api) {
                    var querySrvReq = createEmpRequest(dev.dev_type, dev.dev_id, [
                        rSingleInst(strcatURI(OBJ_ID.OTA_SRV, instId, RES.OTA_SRV.PKG_DST_ID)),
                        rSingleInst(strcatURI(OBJ_ID.OTA_SRV, instId, RES.OTA_SRV.DST_DEV_TYPE))
                    ]);
                    return api.empRequest(querySrvReq);
                }).then(function (queryRes) {
                    var nr = normalizeEmp(queryRes);
                    if (!nr.ok) {
                        toastWarn(_('查询目标设备信息失败') + '（' + empResultCodeText(nr.code) + '）');
                        return Promise.reject(new Error('Failed to query target device'));
                    }

                    var upgradeInsts = [
                        execInst(strcatURI(OBJ_ID.OTA_SRV, instId, RES.OTA_SRV.PKG_UPDATE_START))
                    ];
                    var upgradeReq = createEmpRequest(dev.dev_type, dev.dev_id, upgradeInsts);
                    upgradeReq = attachAuditAction(upgradeReq, 'HOST_UPDATE_START_UPGRADE');

                    return getEmpApi().then(function (api) {
                        return api.empRequest(upgradeReq);
                    });
                }).then(function (upgradeResult) {
                    var nrUpgrade = normalizeEmp(upgradeResult);
                    if (!nrUpgrade.ok) {
                        toastWarn(_('升级请求失败') + '（' + empResultCodeText(nrUpgrade.code) + '）');
                        return;
                    }

                    toastSuccess(_('升级请求已发送'));

                    ensurePolling(POLL_INTERVAL_FAST);
                    if (hitRow && hitRow.pkg_type_num === 0) {
                        writeUpgradeLogFromRow(hitRow, { writeResult: false });
                        refreshActiveTabData();
                    } else if (hitRow && hitRow.pkg_type_num === 1) {
                        refreshActiveTabData().then(function () {
                            var schema = tableSchemas[activeTab];
                            var rows = (schema && Array.isArray(schema.data)) ? schema.data : [];
                            var newRow = rows.filter(function (r) {
                                return r && r._inst === instId;
                            })[0] || null;
                            if (newRow) {
                                writeUpgradeLogFromRow(newRow, { writeResult: true });
                            }
                        });
                    } else {
                        refreshActiveTabData();
                    }
                }).catch(function (e) {
                    console.error('[UPDATE] upgrade request failed:', e);
                    toastWarn(_('升级请求发送失败'));
                });
            }

            function doDeleteByInst(instId, row, schemaKey) {
                var dev = getActiveDev();
                instId = parseInt(instId, 10);
                if (isNaN(instId)) {
                    toastWarn(_('删除失败：实例ID无效'));
                    return;
                }

                var filePath = '';
                if (row && row.uploaded_path && row.name) {
                    filePath = String(row.uploaded_path).replace(/\/$/, '') + '/' + String(row.name);
                }

                getEmpApi().then(function (api) {
                    var delReq = createDelInstRequest(dev, OBJ_ID.OTA_SRV, instId);
                    delReq = attachAuditAction(delReq, 'HOST_UPDATE_DELETE_PACKAGE');
                    return api.empRequest(delReq);
                }).then(function (res) {
                    var nr = normalizeEmp(res);
                    if (!nr.ok) {
                        toastWarn(_('删除失败') + '（' + empResultCodeText(nr.code) + '）');
                        return;
                    }

                    return deleteFileSafe(filePath).then(function () {
                        toastSuccess(_('删除成功'));
                        refreshActiveTabData();
                    });
                }).catch(function (e) {
                    console.error('[UPDATE] delete instance failed:', e);
                    toastWarn(_('删除失败'));
                });
            }

            bindFilterEvents._doUpgradeByInst = doUpgradeByInst;
            bindFilterEvents._doDeleteByInst = doDeleteByInst;

            addBtn.onclick = function (ev) {
                if (activeTab !== 'ad_dev') {
                    return;
                }
                var schema = tableSchemas && tableSchemas.ad_dev;
                var hasPkg = !!(schema && Array.isArray(schema.data) && schema.data.length > 0);
                if (hasPkg) {
                    openSimpleConfirmModal(_('请先删除已上传的升级包'));
                    return;
                }
                openAddPkgCenter(activeTab === 'ad_dev');
            };
            refreshBtn.onclick = function () {
                var self = this;
                spinOnce(self);
                if (activeTab === 'log') {
                    refreshActiveTabData().then(function () {
                        toastSuccess(_('刷新成功'));
                    }).catch(function () {
                        toastWarn(_('刷新失败'));
                    });
                    return;
                }

                ensureUpdateLogTable().then(function () {
                    return queryFullData({
                        auditKey: 'HOST_UPDATE_REFRESH',
                        auditCtx: { tabTitle: _('无线接入点升级') }
                    });
                }).then(function (rows) {
                    if (Array.isArray(rows)) {
                        tableSchemas[activeTab].data = rows;
                        renderCurrent();
                        if (activeTab === 'ad_dev') {
                            var ps = [];
                            rows.forEach(function (r) {
                                if (!r) {
                                    return;
                                }
                                if (r.pkg_type_num === 0 && String(r.result || '').trim()) {
                                    ps.push(backfillLatestLogResultIfEmpty(r.name, r.result));
                                }
                            });
                            return Promise.all(ps);
                        }
                    }
                    return;
                }).then(function () {
                    toastSuccess(_('刷新成功'));
                    adjustPollingByCliResults(lastCliResults);
                    checkAndStartPolling();
                }).catch(function () {
                    toastWarn(_('刷新失败'));
                });
            };
        }
        bindFilterEvents();

        var tableArea = E('div', { 'class': 'ns-table' });
        var footerBar = E('div', { 'class': 'ns-footer pager-modern' }, [
            E('div', { 'class': 'ns-pag-info' }, _('共 0 行')),
            E('div', { 'class': 'ns-pag-controls', id: 'pageBtns' }),
            E('div', { 'class': 'ns-pag-size' }, [
                E('span', {}, _('每页行数：')),
                E('select', { 'class': 'ns-select', id: 'pageSizeSel' },
                    PAGE_SIZE_OPTIONS.map(function (n) {
                        return E('option', { value: String(n), selected: (n === PAGE_SIZE_DEFAULT) ? 'selected' : null }, String(n));
                    })
                )
            ])
        ]);

        var card = E('div', { 'class': 'ns-card' }, [subTabs, filterBar, tableArea, footerBar]);
        var root = E('div', { 'class': 'ns-wrap' }, [card]);
        var pkgQueryToken = 0;
        var pollingActive = false;
        var deviceInstMap = Object.create(null);
        var lastCliResults = null;

        function _trimNull(s) {
            return String(s || '').replace(/\0+$/g, '');
        }

        function _devTypeLabelByNum(n) {
            var v = parseInt(n, 10);
            if (v === DEV_TYPE.AD) {
                return _('AD');
            } else if (v === DEV_TYPE.AD) {
                return _('无线接入点');
            } else if (v === DEV_TYPE.FD) {
                return _('无线接入模块');
            } else {
                return '';
            }
        }

        var otaResultMap = [
            { str: '', result: '' },
            { str: 'OTA upgrade success', result: _('升级成功') },
            { str: 'OTA download network_err', result: _('下载失败（网络错误）') },
            { str: 'OTA upgrade file download failed', result: _('下载失败（文件下载失败）') },
            { str: 'OTA upgrade file md5 verify failed', result: _('校验失败（MD5校验失败）') },
            { str: 'OTA upgrade version match failed', result: _('升级失败（版本不匹配）') },
            { str: 'OTA upgrade write part failed', result: _('升级失败（写入失败）') },
            { str: 'OTA boot failed', result: _('升级失败（启动失败）') },
            { str: 'OTA not allow rollback', result: _('升级失败（不允许回滚）') },
            { str: 'OTA upgrade no enough space', result: _('升级失败（空间不足）') },
            { str: 'OTA upgrade operate timeout', result: _('升级失败（操作超时）') },
            { str: 'OTA Invalid parameter', result: _('升级失败（参数无效）') },
            { str: 'OTA download write file failed', result: _('下载失败（写文件失败）') },
            { str: 'OTA download packet data verify CRC failed', result: _('校验失败（CRC校验失败）') },
            { str: 'OTA upgrade max retry count', result: _('升级失败（达到最大重试次数）') },
            { str: 'OTA replace file failed', result: _('升级失败（文件替换失败）') },
            { str: 'unknow error', result: _('未知错误') }
        ];

        function getOtaResultLabel(raw) {
            var s = (raw == null) ? '' : String(raw);
            s = s.trim();
            if (!s) {
                return '';
            }
            for (var i = 0; i < otaResultMap.length; i++) {
                if (otaResultMap[i].str === s) {
                    return String(otaResultMap[i].result || s);
                }
            }
            return s;
        }

        function getStatusLabel(status) {
            switch (status) {
                case 0:
                    return _('空闲');
                case 1:
                    return _('下载中');
                case 2:
                    return _('校验中');
                case 3:
                    return _('升级中');
                case 4:
                    return _('升级完成');
                default:
                    return _('未知状态');
            }
        }

        function queryFullData(opts) {
            opts = opts || {};
            var token = ++pkgQueryToken;
            var baseDev = getActiveDev();

            return new Promise(function (resolve, reject) {
                getEmpApi().then(function (api) {
                    var reqSrv = createQueryAllRequest(baseDev, OBJ_ID.OTA_SRV);
                    if (opts.auditKey) {
                        reqSrv = attachAuditAction(reqSrv, opts.auditKey, opts.auditCtx || {});
                    }
                    return api.empRequest(reqSrv);
                }).then(function (respSrv) {
                    if (token !== pkgQueryToken) {
                        return resolve([]);
                    }

                    var nrSrv = normalizeEmp(respSrv);
                    if (!nrSrv.ok) {
                        return resolve([]);
                    }

                    var byInstSrv = Object.create(null);
                    deviceInstMap = Object.create(null);

                    (nrSrv.arrays || []).forEach(function (it) {
                        var ps = String(it.uri || '').split('/');
                        if (ps.length < 3) {
                            return;
                        }
                        if (parseInt(ps[0], 10) !== OBJ_ID.OTA_SRV) {
                            return;
                        }

                        var inst = parseInt(ps[1], 10);
                        var rid = parseInt(ps[2], 10);
                        if (isNaN(inst)) {
                            return;
                        }

                        var rec = byInstSrv[inst] || (byInstSrv[inst] = { inst: inst });
                        var val = (it.value_payload == null) ? '' : String(it.value_payload);

                        if (rid === RES.OTA_SRV.PKG_NAME) {
                            rec.name = _trimNull(val);
                        } else if (rid === RES.OTA_SRV.PKG_SIZE) {
                            rec.size = parseInt(val, 10) || 0;
                        } else if (rid === RES.OTA_SRV.PKG_TYPE) {
                            rec.pkg_type_num = parseInt(val, 10);
                        } else if (rid === RES.OTA_SRV.PKG_DST_VER) {
                            rec.target_ver = _trimNull(val);
                        } else if (rid === RES.OTA_SRV.PKG_OLD_VER) {
                            rec.old_ver = _trimNull(val);
                        } else if (rid === RES.OTA_SRV.PKG_DST_PATH) {
                            rec.dst_path = _trimNull(val);
                        } else if (rid === RES.OTA_SRV.PKG_UP_PATH) {
                            rec.up_path = _trimNull(val);
                        } else if (rid === RES.OTA_SRV.PKG_DST_ID) {
                            rec.did = _trimNull(val);
                        } else if (rid === RES.OTA_SRV.DST_DEV_TYPE) {
                            rec.dst_dev_type = parseInt(val, 10);
                        }
                    });

                    Object.keys(byInstSrv).forEach(function (k) {
                        var rec = byInstSrv[k];
                        if (rec && rec.did) {
                            deviceInstMap[parseInt(k, 10)] = {
                                dev_id: rec.did,
                                dev_type: rec.dst_dev_type || DEV_TYPE.AD
                            };
                        }
                    });
                    return processSrvData(byInstSrv);
                }).then(function (rows) {
                    resolve(rows);
                }).catch(function (e) {
                    console.error('[UPDATE] query full data failed:', e);
                    resolve([]);
                });
            });
        }

        function processSrvData(byInstSrv) {
            var rows = [];
            var cliPromises = [];

            var baseDev = getActiveDev();
            var baseDevId = baseDev.dev_id || '';

            Object.keys(byInstSrv).forEach(function (k) {
                var rec = byInstSrv[k] || {};
                var instId = parseInt(k, 10);
                var deviceInfo = deviceInstMap[instId];
                if (!deviceInfo) {
                    return;
                }

                var targetDeviceId = deviceInfo.dev_id;
                var targetDeviceType = deviceInfo.dev_type || DEV_TYPE.AD;
                var shouldInclude = false;

                if (activeTab === 'ad_dev') {
                    shouldInclude = (targetDeviceId === baseDevId);
                }

                if (!shouldInclude) {
                    return;
                }

                if (activeTab === 'ad_dev' && targetDeviceType !== undefined && targetDeviceId) {
                    var cliPromise = queryOtaCli(instId, targetDeviceType, targetDeviceId);
                    cliPromises.push(cliPromise);
                }

                var pkgTypeLabel = '';
                if (rec.pkg_type_num === 0) {
                    pkgTypeLabel = _('固件升级');
                } else if (rec.pkg_type_num === 1) {
                    pkgTypeLabel = _('替换文件');
                }

                var row = {
                    _inst: instId,
                    name: rec.name || '',
                    size: rec.size || 0,
                    dev_type_num: targetDeviceType,
                    dtype: _devTypeLabelByNum(targetDeviceType),
                    ptype: pkgTypeLabel,
                    pkg_type_num: rec.pkg_type_num,
                    did: rec.did || '',
                    old_ver: '',
                    target_ver: rec.target_ver || '',
                    url: rec.dst_path || '',
                    uploaded_path: rec.up_path || '',
                    status_code: 0,
                    retry_times: 0,
                    frag_size: 0,
                    frag_seq: 0,
                    status: getStatusLabel(0),
                    result: ''
                };

                if (row.pkg_type_num === 1) {
                    if (activeTab === 'pkg') {
                        row.target_ver = '-';
                    } else if (activeTab === 'ad' || activeTab === 'ad_dev') {
                        row.old_ver = '-';
                        row.target_ver = '-';
                    }
                }

                rows.push(row);
            });

            if (cliPromises.length === 0) {
                lastCliResults = null;

                rows.sort(function (a, b) {
                    var an = String(a.name || '');
                    var bn = String(b.name || '');
                    if (an < bn) {
                        return -1;
                    }
                    if (an > bn) {
                        return 1;
                    }

                    var av = String(a.target_ver || '');
                    var bv = String(b.target_ver || '');
                    return (av < bv) ? -1 : (av > bv ? 1 : 0);
                });

                return Promise.resolve(rows);
            }

            return Promise.all(cliPromises).then(function (cliResults) {
                lastCliResults = cliResults;
                var cliDataMap = Object.create(null);
                cliResults.forEach(function (result) {
                    if (result && result.instId !== undefined) {
                        cliDataMap[result.instId] = result.cliData;
                    }
                });

                rows.forEach(function (row) {
                    var cliData = cliDataMap[row._inst] || {};
                    row.status_code = cliData.status || 0;
                    row.retry_times = cliData.retry_times || 0;
                    row.frag_size = cliData.frag_size || 0;
                    row.frag_seq = cliData.frag_seq || 0;
                    row.status = getStatusLabel(cliData.status || 0);
                    row.result = cliData.result || '';
                    row.old_ver = cliData.old_ver || '';
                    if (row.pkg_type_num === 1) {
                        row.old_ver = '-';
                        row.target_ver = '-';
                    }
                });

                rows.sort(function (a, b) {
                    var an = String(a.name || '');
                    var bn = String(b.name || '');
                    if (an < bn) {
                        return -1;
                    }
                    if (an > bn) {
                        return 1;
                    }

                    var av = String(a.target_ver || '');
                    var bv = String(b.target_ver || '');
                    return (av < bv) ? -1 : (av > bv ? 1 : 0);
                });

                return rows;
            });
        }

        function queryOtaCli(instId, targetDeviceType, targetDeviceId) {
            return getEmpApi().then(function (api) {
                var targetDevForCli = {
                    dev_type: targetDeviceType,
                    dev_id: targetDeviceId,
                    title: '',
                    ip: '',
                    online: true
                };

                var insts = [
                    rSingleInst(strcatURI(OBJ_ID.OTA_CLI, instId, RES.OTA_CLI.PKG_OLD_VER)),
                    rSingleInst(strcatURI(OBJ_ID.OTA_CLI, instId, RES.OTA_CLI.STATUS)),
                    rSingleInst(strcatURI(OBJ_ID.OTA_CLI, instId, RES.OTA_CLI.RESULT)),
                    rSingleInst(strcatURI(OBJ_ID.OTA_CLI, instId, RES.OTA_CLI.RETRY)),
                    rSingleInst(strcatURI(OBJ_ID.OTA_CLI, instId, RES.OTA_CLI.PKG_FRAG_SIZE)),
                    rSingleInst(strcatURI(OBJ_ID.OTA_CLI, instId, RES.OTA_CLI.PKG_FRAG_SEQ))
                ];
                var req = createEmpRequest(targetDeviceType, targetDeviceId, insts);
                return api.empRequest(req).then(function (respCli) {
                    var nrCli = normalizeEmp(respCli);
                    var cliData = { status: 0, result: '', old_ver: '' };

                    if (nrCli.ok && nrCli.arrays) {
                        nrCli.arrays.forEach(function (it) {
                            var ps = String(it.uri || '').split('/');
                            if (ps.length < 3) {
                                return;
                            }
                            if (parseInt(ps[0], 10) !== OBJ_ID.OTA_CLI) {
                                return;
                            }

                            var inst = parseInt(ps[1], 10);
                            var rid = parseInt(ps[2], 10);
                            if (isNaN(inst) || inst !== instId) {
                                return;
                            }

                            var val = (it.value_payload == null) ? '' : String(it.value_payload);

                            if (rid === RES.OTA_CLI.STATUS) {
                                cliData.status = parseInt(val, 10);
                            } else if (rid === RES.OTA_CLI.PKG_OLD_VER) {
                                cliData.old_ver = _trimNull(val);
                            } else if (rid === RES.OTA_CLI.RESULT) {
                                cliData.result = _trimNull(val);
                            } else if (rid === RES.OTA_CLI.RETRY) {
                                cliData.retry_times = parseInt(val, 10) || 0;
                            } else if (rid === RES.OTA_CLI.PKG_FRAG_SIZE) {
                                cliData.frag_size = parseInt(val, 10) || 0;
                            } else if (rid === RES.OTA_CLI.PKG_FRAG_SEQ) {
                                cliData.frag_seq = parseInt(val, 10) || 0;
                            }
                        });
                    }

                    return { instId: instId, cliData: cliData };
                });
            });
        }

        function shouldIncludeDevice(deviceId, deviceType, currentTab, currentDevId) {
            if (currentTab === 'ad_dev') {
                return (deviceId === currentDevId);
            }
        }

        function pollOtaCli() {
            if (!pollingActive) {
                return Promise.resolve([]);
            }

            var promises = [];
            var baseDevId = getActiveDev().dev_id;

            Object.keys(deviceInstMap).forEach(function (instIdStr) {
                var instId = parseInt(instIdStr, 10);
                var deviceInfo = deviceInstMap[instId];
                if (!deviceInfo) {
                    return;
                }

                var shouldInclude = false;

                if (activeTab === 'ad_dev') {
                    shouldInclude = (deviceInfo.dev_id === baseDevId);
                }

                if (!shouldInclude) {
                    return;
                }

                var promise = queryOtaCli(instId, deviceInfo.dev_type, deviceInfo.dev_id);
                promises.push(promise);
            });

            if (promises.length === 0) {
                return Promise.resolve([]);
            }

            return Promise.all(promises).then(function (cliResults) {
                var cliDataMap = Object.create(null);
                cliResults.forEach(function (result) {
                    if (result && result.instId !== undefined) {
                        cliDataMap[result.instId] = result.cliData;
                    }
                });

                var schema = tableSchemas[activeTab];
                if (schema && schema.data) {
                    schema.data.forEach(function (row) {
                        var cliData = cliDataMap[row._inst] || {};

                        if (cliData.status !== undefined) {
                            row.status_code = cliData.status;
                            row.status = getStatusLabel(cliData.status);
                        }
                        if (cliData.result !== undefined) {
                            row.result = cliData.result;
                        }
                        if (cliData.retry_times !== undefined) {
                            row.retry_times = cliData.retry_times;
                        }
                        if (cliData.frag_size !== undefined) {
                            row.frag_size = cliData.frag_size;
                        }
                        if (cliData.frag_seq !== undefined) {
                            row.frag_seq = cliData.frag_seq;
                        }
                    });

                    renderCurrent();
                }

                return cliResults;
            });
        }

        function queryPkgList() {
            return queryFullData();
        }
        function ensurePolling(intervalMs) {
            var want = parseInt(intervalMs, 10);
            if (isNaN(want) || want <= 0) {
                want = POLL_INTERVAL_SLOW;
            }
            if (pollTimerId && pollingActive && pollIntervalMs === want) {
                return;
            }
            startPolling(want);
        }

        function startPolling(intervalMs) {
            var want = parseInt(intervalMs, 10);
            if (isNaN(want) || want <= 0) {
                want = POLL_INTERVAL_SLOW;
            }

            stopPolling();

            pollingActive = true;
            pollIntervalMs = want;

            pollTimerId = setInterval(function () {
                if (!pollingActive) {
                    return;
                }
                if (activeTab === 'ad_dev') {
                    pollOtaCli().then(function (cliResults) {
                        adjustPollingByCliResults(cliResults);
                    }).catch(function (error) {
                        console.error('[UPDATE] 轮询查询出错:', error);
                        ensurePolling(POLL_INTERVAL_SLOW);
                    });
                }
            }, pollIntervalMs);
        }

        function stopPolling() {
            if (pollTimerId) {
                clearInterval(pollTimerId);
                pollTimerId = null;
            }
            pollingActive = false;
        }

        function adjustPollingByCliResults(cliResults) {
            var want = POLL_INTERVAL_SLOW;
            var hasFast = false;
            if (Array.isArray(cliResults) && cliResults.length > 0) {
                for (var i = 0; i < cliResults.length; i++) {
                    var r = cliResults[i];
                    var st = r && r.cliData ? r.cliData.status : undefined;
                    if (st === 1 || st === 2 || st === 3) {
                        hasFast = true;
                        break;
                    }
                }
            } else {
                hasFast = false;
            }

            want = hasFast ? POLL_INTERVAL_FAST : POLL_INTERVAL_SLOW;
            if (want !== pollIntervalMs) {
                ensurePolling(want);
            }
        }

        function checkAndStartPolling() {
            if (activeTab !== 'ad_dev') {
                stopPolling();
                return;
            }
            var baseDevId = getActiveDev().dev_id;
            var hasValidDevices = false;

            Object.keys(deviceInstMap).forEach(function (instIdStr) {
                var deviceInfo = deviceInstMap[parseInt(instIdStr, 10)];
                if (!deviceInfo) return;

                if (shouldIncludeDevice(deviceInfo.dev_id, deviceInfo.dev_type, activeTab, baseDevId)) {
                    hasValidDevices = true;
                }
            });

            if (!hasValidDevices) {
                if (!pollingActive) {
                    ensurePolling(POLL_INTERVAL_SLOW);
                }
                return;
            }
            if (!pollingActive) {
                ensurePolling(POLL_INTERVAL_SLOW);
            }
        }

        function refreshActiveTabData() {
            pagers[activeTab].page = 1;

            if (activeTab === 'log') {
                return queryUpdateLogs().then(function (rows) {
                    tableSchemas[activeTab].data = rows || [];
                    renderCurrent();
                    stopPolling();
                }).catch(function (error) {
                    console.error('[UPDATE] log load failed:', error);
                    tableSchemas[activeTab].data = [];
                    renderCurrent();
                    toastWarn(_('加载数据失败，请检查网络连接'));
                });
            }

            return queryPkgList().then(function (rows) {
                if (!rows) {
                    return;
                }
                tableSchemas[activeTab].data = rows;
                renderCurrent();
                if (activeTab === 'ad_dev') {
                    var ps = [];
                    rows.forEach(function (r) {
                        if (!r) {
                            return;
                        }
                        if (r.pkg_type_num === 0 && String(r.result || '').trim()) {
                            ps.push(backfillLatestLogResultIfEmpty(r.name, r.result));
                        }
                    });
                    return Promise.all(ps).then(function () {
                        adjustPollingByCliResults(lastCliResults);
                        checkAndStartPolling();
                    });
                }
                adjustPollingByCliResults(lastCliResults);
                checkAndStartPolling();
            }).catch(function (error) {
                console.error('[UPDATE] 数据加载失败:', error);
                toastWarn(_('加载数据失败，请检查网络连接'));
            });
        }

        function _assertFilePath(p) {
            if (!p || p === '/' || /\/$/.test(p)) {
                throw new Error('Please enter a full path including file name, e.g. /tmp/upload.bin');
            }
        }

        function _basename(p) {
            try {
                return String(p).split('/').filter(Boolean).pop() || '';
            } catch (_) {
                return '';
            }
        }

        function _formatSize(n) {
            var s = Number(n) || 0, u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0;
            while (s >= 1024 && i < u.length - 1) {
                s /= 1024;
                i++;
            }
            return (i === 0 ? s : s.toFixed(2)) + ' ' + u[i];
        }

        function deleteFileSafe(path) {
            if (!path) {
                return Promise.resolve();
            }
            return fs.remove(path).catch(function () {
                return null;
            });
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

        function buildSingleDropdown(options, initValue, placeholderText) {
            if (!window.adComponents || typeof window.adComponents.createSingleSelect !== 'function') {
                throw new Error('adComponents.createSingleSelect is not available');
            }
            return window.adComponents.createSingleSelect({
                options: options,
                value: initValue,
                placeholder: placeholderText || _('请选择')
            });
        }

        function openAddPkgCenter(onlyGw) {
            openAddPkgMetaDialog({
                onlyGw: !!onlyGw
            });
        }

        function openAddPkgMetaDialog(info) {
            info = info || {};
            var baseDir = '/tmp/upgrade/';

            var modal = E('div', {
                'class': 'um-modal',
                'role': 'dialog',
                'aria-label': _('添加升级包')
            });
            var panel = E('div', { 'class': 'um-panel' });
            if (window.adModal && typeof window.adModal.decorate === 'function') {
                window.adModal.decorate(panel, { width: 430 });
            }
            var title = E('div', { 'class': 'um-title' }, _('添加升级包'));
            var form = E('div', { 'class': 'um-form' });

            function buildFormLabel(text, required) {
                var children = [];
                if (required) {
                    children.push(E('span', { 'class': 'um-req' }, '*'));
                }
                children.push(text);
                return E('label', { 'class': 'um-label' }, children);
            }

            function close() {
                if (modal && modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            }

            var uploadPathInput = E('input', {
                'class': 'um-input um-narrow um-readonly',
                'readonly': true,
                'value': '/tmp/upgrade'
            });

            var pkgTypeDd = buildSingleDropdown([
                { value: 'fw', label: _('固件升级') },
                { value: 'file', label: _('替换文件') }
            ], '', _('请选择'));

            var devTypeOptions = [
                { value: 'ad', label: _('AD') },
                { value: 'ad', label: _('无线接入点') },
                { value: 'fd', label: _('无线接入模块') }
            ];
            var devTypeInit = '';
            if (info && info.onlyGw) {
                devTypeOptions = [
                    { value: 'ad', label: _('AD') }
                ];
                devTypeInit = 'ad';
            }

            var devTypeDd = buildSingleDropdown(
                devTypeOptions,
                devTypeInit,
                _('请选择')
            );

            var devIdDd = buildSingleDropdown([], '', _('请选择'));
            var downloadPathDd = buildSingleDropdown([
                { value: '/bin/', label: '/bin/' },
                { value: '/sbin/', label: '/sbin/' },
                { value: '/lib/', label: '/lib/' },
                { value: '/etc/config/', label: '/etc/config/' },
                { value: '/usr/bin/', label: '/usr/bin/' },
                { value: '/usr/sbin/', label: '/usr/sbin/' },
                { value: '/usr/lib/', label: '/usr/lib/' },
                { value: '/userdata/wiafa_gw/bin/', label: '/userdata/wiafa_gw/bin/' },
                { value: '/userdata/wiafa_gw/config/', label: '/userdata/wiafa_gw/config/' },
                { value: '/userdata/wiafa_gw/scripts/', label: '/userdata/wiafa_gw/scripts/' },
                { value: '/userdata/wiafa_gw/secret/', label: '/userdata/wiafa_gw/secret/' }
            ], '', _('请选择'));

            var devIdQueryToken = 0;

            function parseTargetVerFromPkgName(fileName) {
                var s = String(fileName || '');
                var m = s.match(/(?:^|[^A-Za-z0-9])[Vv](\d+\.\d+\.\d+)(?=$|[^0-9])/);
                return (m && m[1]) ? String(m[1]) : '';
            }

            function updateDownloadPathVisibility(val) {
                var v = (val != null) ? String(val) : String(pkgTypeDd.get() || '');
                var show = (v === 'file');
                if (downloadPathRow) {
                    downloadPathRow.style.display = show ? '' : 'none';
                    if (show) {
                        downloadPathRow.classList.remove('is-hidden');
                    } else {
                        downloadPathRow.classList.add('is-hidden');
                    }
                }
                if (!show) {
                    downloadPathDd.set('');
                    if (downloadPathDd && downloadPathDd.root && downloadPathDd.root.classList) {
                        downloadPathDd.root.classList.remove('um-invalid');
                    }
                }
            }

            function handleDevTypeChanged(selectedType) {
                var t = (selectedType != null) ? String(selectedType) : String(devTypeDd.get() || '');
                var token = ++devIdQueryToken;
                devIdDd.setOptions([]);
                devIdDd.set('');
                if (!t) {
                    devIdDd.setDisabled(true);
                    return;
                }
                if (t === 'ad') {
                    var cur = (typeof getActiveDev === 'function') ? getActiveDev() : { dev_type: DEV_TYPE.AD, dev_id: '' };
                    var adId = (cur && (cur.dev_id || cur.id)) ? String(cur.dev_id || cur.id) : '';

                    devIdDd.setOptions(adId ? [{ value: adId, label: adId }] : []);
                    if (adId) {
                        devIdDd.set(adId);
                        devIdDd.setDisabled(false);
                    } else {
                        devIdDd.setDisabled(true);
                    }
                    return;
                }

                devIdDd.setDisabled(true);

                var dev = (typeof getActiveDev === 'function') ? getActiveDev() : { dev_type: DEV_TYPE.AD, dev_id: '' };
                var want = (t === 'ad') ? DEV_TYPE.AD : DEV_TYPE.FD;

                getEmpApi().then(function (api) {
                    var insts = [
                        rSingleInst(strcatURI(OBJ_ID.CLD_DEV, 0, RES.CLD_DEV.DEV_ID)),
                        rSingleInst(strcatURI(OBJ_ID.CLD_DEV, 0, RES.CLD_DEV.DEV_TYPE))
                    ];
                    var req = createEmpRequest(DEV_TYPE.AD, dev.dev_id, insts);
                    return api.empRequest(req);
                }).then(function (res) {
                    if (token !== devIdQueryToken) {
                        return;
                    }

                    var nr = normalizeEmp(res);
                    if (!nr.ok) {
                        toastWarn(_('获取设备ID失败') + '（' + empResultCodeText(nr.code) + '）');
                        devIdDd.setDisabled(true);
                        return;
                    }

                    var payload = { resp_arrays: nr.arrays };
                    if (res && Array.isArray(res.result) && res.result[1] && res.result[1].resp_arrays) {
                        payload = res.result[1];
                    }

                    var byInst = Object.create(null);
                    (payload.resp_arrays || []).forEach(function (it) {
                        var ps = String(it.uri || '').split('/');
                        if (ps.length < 3) {
                            return;
                        }
                        if (parseInt(ps[0], 10) !== OBJ_ID.CLD_DEV) {
                            return;
                        }
                        var inst = parseInt(ps[1], 10);
                        var rid = parseInt(ps[2], 10);
                        if (isNaN(inst) || isNaN(rid)) {
                            return;
                        }

                        var rec = byInst[inst] || (byInst[inst] = { inst: inst });
                        var val = (it.value_payload == null) ? '' : String(it.value_payload);
                        if (rid === RES.CLD_DEV.DEV_ID) {
                            rec.dev_id = String(val || '').replace(/\0+$/g, '');
                        } else if (rid === RES.CLD_DEV.DEV_TYPE) {
                            rec.dev_type = parseInt(val, 10);
                        }
                    });

                    var seen = Object.create(null);
                    var opts = [];
                    Object.keys(byInst).forEach(function (k) {
                        var rec = byInst[k];
                        if (!rec || !rec.dev_id) {
                            return;
                        }
                        if (rec.dev_type !== want) {
                            return;
                        }
                        var id = String(rec.dev_id);
                        if (seen[id]) {
                            return;
                        }
                        seen[id] = true;
                        opts.push({ value: id, label: id });
                    });

                    devIdDd.setOptions(opts);
                    if (opts.length > 0) {
                        devIdDd.set(opts[0].value);
                        devIdDd.setDisabled(false);
                    } else {
                        toastWarn(_('未发现可用的设备ID'));
                        devIdDd.setDisabled(true);
                    }
                }).catch(function (e) {
                    if (token !== devIdQueryToken) {
                        return;
                    }
                    console.error('[UPDATE] fetch dev id failed:', e);
                    toastWarn(_('获取设备ID失败'));
                    devIdDd.setDisabled(true);
                });
            }

            devIdDd.setDisabled(true);
            if (typeof devTypeDd.onChange === 'function') {
                devTypeDd.onChange(function (val) {
                    handleDevTypeChanged(val);
                });
            }
            handleDevTypeChanged();

            if (info && info.onlyGw) {
                devTypeDd.set('ad');
                devTypeDd.setDisabled(true);
                handleDevTypeChanged('ad');
                devIdDd.setDisabled(true);
            }

            if (typeof pkgTypeDd.onChange === 'function') {
                pkgTypeDd.onChange(function (val) {
                    updateDownloadPathVisibility(val);
                });
            }

            form.appendChild(E('div', { 'class': 'um-row' }, [
                buildFormLabel(_('升级设备类型'), true),
                devTypeDd.root
            ]));

            form.appendChild(E('div', { 'class': 'um-row' }, [
                buildFormLabel(_('升级设备ID'), true),
                devIdDd.root
            ]));

            form.appendChild(E('div', { 'class': 'um-row' }, [
                buildFormLabel(_('升级包类型'), true),
                pkgTypeDd.root
            ]));

            var downloadPathRow = E('div', { 'class': 'um-row is-hidden', 'style': 'display: none;' }, [
                buildFormLabel(_('升级包替换路径'), true),
                downloadPathDd.root
            ]);
            form.appendChild(downloadPathRow);

            updateDownloadPathVisibility(pkgTypeDd.get());

            var actions = E('div', { 'class': 'um-actions' });
            var btnCancel = E('button', { 'class': 'um-btn', type: 'button' }, _('取消'));
            var btnOk = E('button', { 'class': 'um-btn primary', type: 'button' }, _('上传升级包'));

            btnCancel.onclick = function () {
                close();
            };

            btnOk.onclick = function () {
                [devTypeDd.root, devIdDd.root].forEach(function (el) {
                    if (el && el.classList) {
                        el.classList.remove('um-invalid');
                    }
                });
                [downloadPathDd.root].forEach(function (el) {
                    if (el && el.classList) {
                        el.classList.remove('um-invalid');
                    }
                });

                if (pkgTypeDd && pkgTypeDd.root && pkgTypeDd.root.classList) {
                    pkgTypeDd.root.classList.remove('um-invalid');
                }

                var pkgTypeVal = String(pkgTypeDd.get() || '');
                if (!pkgTypeVal) {
                    pkgTypeDd.root.classList.add('um-invalid');
                    toastWarn(_('请选择升级包类型'));
                    try {
                        pkgTypeDd.root.scrollIntoView({ block: 'center' });
                    } catch (_) { }
                    return;
                }

                var devTypeVal = String(devTypeDd.get() || '');
                if (!devTypeVal) {
                    devTypeDd.root.classList.add('um-invalid');
                    toastWarn(_('请选择升级设备类型'));
                    try {
                        devTypeDd.root.scrollIntoView({ block: 'center' });
                    } catch (_) { }
                    return;
                }

                var devIdVal = String(devIdDd.get() || '');
                var devIdDisabled = !!(devIdDd.root && devIdDd.root.classList && devIdDd.root.classList.contains('ns-disabled'));
                if (((!info || !info.onlyGw) && devIdDisabled) || !devIdVal) {
                    devIdDd.root.classList.add('um-invalid');
                    toastWarn(_('请选择升级设备ID'));
                    try {
                        devIdDd.root.scrollIntoView({ block: 'center' });
                    } catch (_) { }
                    return;
                }

                var dlPathVal = '';
                if (pkgTypeVal === 'file') {
                    dlPathVal = String(downloadPathDd.get() || '').trim();
                    if (!dlPathVal) {
                        downloadPathDd.root.classList.add('um-invalid');
                        toastWarn(_('请选择升级包替换路径'));
                        try {
                            downloadPathDd.root.scrollIntoView({ block: 'center' });
                        } catch (_) { }
                        return;
                    }
                } else {
                    dlPathVal = '/tmp';
                }

                function getPkgTypeNum() {
                    var v = String(pkgTypeDd.get() || '');
                    if (v === 'fw') {
                        return 0;
                    } else if (v === 'file') {
                        return 1;
                    } else {
                        return 0;
                    }
                }

                var instId = 0;
                var dev = getActiveDev();
                btnOk.disabled = true;
                var tmpName = 'upload-' + Date.now() + '.bin';
                var tpath = baseDir + tmpName;
                var finalPath = null;

                var modalMask = modal;
                if (modalMask) {
                    modalMask.style.pointerEvents = 'none';
                }
                ui.uploadFile(tpath, null, 50 * 1024 * 1024).then(function (reply) {
                    var expected = (reply && typeof reply.size === 'number') ? reply.size : null;

                    return L.resolveDefault(fs.stat(tpath), null).then(function (st) {
                        if (!st || st.type !== 'file') {
                            deleteFileSafe(tpath);
                            toastError(_('文件上传失败: 未找到上传文件'));
                            return Promise.reject(new Error('upload file missing'));
                        }

                        if (expected !== null && st.size !== expected) {
                            deleteFileSafe(tpath);
                            toastError(_('文件上传失败: 文件大小不一致'));
                            return Promise.reject(new Error('upload size mismatch'));
                        }

                        var fname = (reply && reply.name) ? _basename(reply.name) : _basename(tpath);
                        if (!fname) {
                            deleteFileSafe(tpath);
                            toastError(_('文件上传失败: 无法获取文件名'));
                            return Promise.reject(new Error('empty filename'));
                        }

                        finalPath = baseDir + fname;

                        return L.resolveDefault(fs.stat(finalPath), null).then(function (existSt) {
                            if (existSt && existSt.type === 'file') {
                                deleteFileSafe(tpath);
                                toastError(_('文件上传失败: 目标文件已存在'));
                                return Promise.reject(new Error('target exists'));
                            }

                            if (finalPath !== tpath) {
                                return fs.exec('/bin/mv', [tpath, finalPath]).then(function (mvRes) {
                                    if (!mvRes || mvRes.code !== 0) {
                                        deleteFileSafe(tpath);
                                        toastError(_('文件上传失败: 重命名失败') + '（PROCESS_EXIT_CODE_' + (mvRes ? mvRes.code : 'UNKNOWN') + '）');
                                        return Promise.reject(new Error('mv failed'));
                                    }
                                    return finalPath;
                                });
                            } else {
                                return finalPath;
                            }
                        });
                    }).then(function (fp) {
                        return L.resolveDefault(fs.stat(fp), null).then(function (st2) {
                            if (!st2 || st2.type !== 'file') {
                                deleteFileSafe(fp);
                                toastError(_('文件上传失败: 未找到重命名后的文件'));
                                return Promise.reject(new Error('renamed file missing'));
                            }
                            return { fp: fp, fname: _basename(fp), size: st2.size };
                        });
                    });
                }).then(function (fileMeta) {
                    if (pkgTypeVal === 'fw') {
                        var fname = String(fileMeta.fname || '');
                        if (!/\.bin$/i.test(fname)) {
                            deleteFileSafe(fileMeta.fp);
                            toastError(_('所选文件非法'));
                            return Promise.reject(new Error('invalid firmware suffix'));
                        }
                    }
                    var devTypeStr = String(devTypeDd.get() || '');
                    var devIdStr = String(devIdDd.get() || '');
                    var activeDev = getActiveDev();
                    var isSelf = (activeDev && activeDev.dev_id === devIdStr) ? 1 : 0;

                    var targetDevTypeNum = (devTypeStr === 'ad') ? DEV_TYPE.AD :
                        (devTypeStr === 'ad') ? DEV_TYPE.AD :
                            (devTypeStr === 'fd') ? DEV_TYPE.FD : 0;

                    var pkgTypeNum = getPkgTypeNum();
                    var dstVerStr = '';
                    if (pkgTypeVal === 'fw') {
                        dstVerStr = parseTargetVerFromPkgName(fileMeta.fname);
                        if (!dstVerStr) {
                            deleteFileSafe(fileMeta.fp);
                            toastWarn(_('目标版本获取失败'));
                            return Promise.reject(new Error('target version parse failed'));
                        }
                    }

                    return getEmpApi().then(function (api) {
                        var insts = [
                            wStrInst(strcatURI(OBJ_ID.OTA_SRV, instId, RES.OTA_SRV.PKG_DST_ID), devIdStr),
                            wStrInst(strcatURI(OBJ_ID.OTA_SRV, instId, RES.OTA_SRV.PKG_NAME), fileMeta.fname),
                            wU32Inst(strcatURI(OBJ_ID.OTA_SRV, instId, RES.OTA_SRV.PKG_SIZE), fileMeta.size),
                            wU8Inst(strcatURI(OBJ_ID.OTA_SRV, instId, RES.OTA_SRV.PKG_TYPE), pkgTypeNum),
                            wStrInst(strcatURI(OBJ_ID.OTA_SRV, instId, RES.OTA_SRV.PKG_DST_PATH), dlPathVal),
                            wU8Inst(strcatURI(OBJ_ID.OTA_SRV, instId, RES.OTA_SRV.DST_DEV_TYPE), targetDevTypeNum)
                        ];

                        if (dstVerStr) {
                            insts.push(wStrInst(strcatURI(OBJ_ID.OTA_SRV, instId, RES.OTA_SRV.PKG_DST_VER), dstVerStr));
                        }
                        insts.push(wStrInst(strcatURI(OBJ_ID.OTA_SRV, instId, RES.OTA_SRV.PKG_UP_PATH), '/tmp/upgrade'));

                        void isSelf;

                        var req = createEmpRequest(dev.dev_type, dev.dev_id, insts);
                        req = attachAuditAction(req, 'HOST_UPDATE_ADD_PACKAGE');
                        return api.empRequest(req);
                    }).then(function (res) {
                        var nr = normalizeEmp(res);
                        if (!nr.ok) {
                            toastWarn(_('添加升级包失败') + '（' + empResultCodeText(nr.code) + '）');
                            deleteFileSafe(fileMeta.fp);
                            return;
                        }

                        toastSuccess(_('添加升级包成功'));
                        close();
                        refreshActiveTabData();
                    }).catch(function (e) {
                        console.error('[UPDATE] add pkg write failed:', e);
                        toastWarn(_('添加升级包失败'));
                        deleteFileSafe(fileMeta.fp);
                    });
                }).catch(function (e) {
                    console.error('[UPDATE] upload+write flow failed:', e);
                    deleteFileSafe(finalPath || tpath);
                }).finally(function () {
                    if (modalMask) {
                        modalMask.style.pointerEvents = '';
                    }
                    btnOk.disabled = false;
                });
            };

            actions.appendChild(btnCancel);
            actions.appendChild(btnOk);

            panel.appendChild(title);
            panel.appendChild(form);
            panel.appendChild(actions);
            modal.appendChild(panel);
            document.body.appendChild(modal);
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
        function renderPager(schemaKey, total, sliceLen) {
            var pager = pagers[schemaKey];
            var totalPages = Math.max(1, Math.ceil(total / pager.pageSize));
            var cur = Math.min(pager.page, totalPages);
            if (cur !== pager.page) {
                pager.page = cur;
            }

            var wrap = footerBar.querySelector('#pageBtns');
            var btns = [];

            btns.push(E('button', {
                'class': 'pm-btn', disabled: (cur === 1) ? 'disabled' : null, type: 'button',
                click: function () {
                    if (pagers[schemaKey].page > 1) {
                        pagers[schemaKey].page--;
                        renderCurrent();
                    }
                }
            }, '‹'));

            buildPageList(cur, totalPages).forEach(function (v) {
                if (v === '…') {
                    btns.push(E('span', { 'class': 'pm-ellipsis' }, '…'));
                } else btns.push(E('button', {
                    'class': 'pm-btn' + (v === cur ? ' active' : ''), type: 'button',
                    click: function () {
                        pagers[schemaKey].page = v;
                        renderCurrent();
                    }
                }, String(v)));
            });

            btns.push(E('button', {
                'class': 'pm-btn', disabled: (cur >= totalPages) ? 'disabled' : null, type: 'button',
                click: function () {
                    if (pagers[schemaKey].page < totalPages) {
                        pagers[schemaKey].page++;
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

        function renderTable(schemaKey, columns, rows, pager) {
            var tableClass = 'ns-data-table';
            if (schemaKey === 'ad_dev') {
                tableClass += ' ns-data-table-gwdev';
            } else if (schemaKey === 'log') {
                tableClass += ' ns-data-table-log';
            }

            var table = E('table', { 'class': tableClass });
            var trh = E('tr');

            columns.forEach(function (col) {
                var th = E('th', {}, _(col.title));
                trh.appendChild(th);
            });
            var thead = E('thead', {}, [trh]);
            var tbody = E('tbody');

            table.appendChild(thead);
            table.appendChild(tbody);
            tableArea.innerHTML = '';
            tableArea.appendChild(table);

            var all = rows || [];
            var total = all.length;
            var pageSize = pager.pageSize;
            var cur = Math.min(Math.max(1, pager.page), Math.max(1, Math.ceil(total / pageSize)));
            if (cur !== pager.page) {
                pager.page = cur;
            }

            var start = (cur - 1) * pageSize;
            var end = Math.min(start + pageSize, total);
            var slice = all.slice(start, end);

            slice.forEach(function (row, i) {
                var tr = E('tr');
                columns.forEach(function (col) {
                    var td;
                    if (col.key === 'idx') {
                        td = E('td', {}, String(start + i + 1));
                    } else if (col.key === 'size') {
                        td = E('td', {}, _formatSize(row.size));
                    } else if (col.key === 'ustat') {
                        var wrap = E('div', { 'class': 'ns-ustat-wrap' });
                        var top = E('div', { 'class': 'ns-ustat-top' }, [
                            E('div', { 'class': 'ns-ustat-left' }, String(row.ustat || ''))
                        ]);

                        var retryTimes = (typeof row.retry_times === 'number') ? row.retry_times : (parseInt(row.retry_times, 10) || 0);
                        if (retryTimes !== 0) {
                            top.appendChild(E('div', { 'class': 'ns-ustat-right' }, _('（重试次数：') + String(retryTimes) + _('）')));
                        }

                        wrap.appendChild(top);

                        var statusCode = (typeof row.ustat_code === 'number') ? row.ustat_code : (parseInt(row.ustat_code, 10) || 0);
                        if (statusCode === 1) {
                            var fragSize = (typeof row.frag_size === 'number') ? row.frag_size : (parseInt(row.frag_size, 10) || 0);
                            var fragSeq = (typeof row.frag_seq === 'number') ? row.frag_seq : (parseInt(row.frag_seq, 10) || 0);
                            var pkgSize = (typeof row.pkg_size === 'number') ? row.pkg_size : (parseInt(row.pkg_size, 10) || 0);

                            var percent = 0;
                            if (pkgSize > 0 && fragSize > 0 && fragSeq > 0) {
                                percent = Math.floor((fragSize * fragSeq * 100) / pkgSize);
                            }
                            if (percent < 0) {
                                percent = 0;
                            } else if (percent > 100) {
                                percent = 100;
                            }

                            var barInner = E('div', { 'class': 'ns-ustat-bar-inner' });
                            barInner.style.width = String(percent) + '%';
                            wrap.appendChild(E('div', { 'class': 'ns-ustat-bar', title: String(percent) + '%' }, [barInner]));
                        }

                        td = E('td', {}, [wrap]);
                    } else if (col.key === 'status') {
                        var sc = (typeof row.status_code === 'number') ? row.status_code : (parseInt(row.status_code, 10));
                        var cls = 'unknown';
                        if (sc === 0) {
                            cls = 'idle';
                        } else if (sc === 1) {
                            cls = 'downloading';
                        } else if (sc === 2) {
                            cls = 'verifying';
                        } else if (sc === 3) {
                            cls = 'upgrading';
                        } else if (sc === 4) {
                            cls = 'done';
                        } else {
                            cls = 'unknown';
                        }
                        td = E('td', {}, [
                            E('span', { 'class': 'ns-status ns-status-' + cls }, String(row.status || ''))
                        ]);
                    } else if (col.key === 'result') {
                        var resultText = row.result || '';
                        if (schemaKey === 'ad_dev') {
                            var label = getOtaResultLabel(resultText);
                            if (!label) {
                                td = E('td', {}, '');
                            } else {
                                var ok = (label === _('升级成功'));
                                td = E('td', {}, [
                                    E('span', {
                                        'class': 'ns-result ' + (ok ? 'ns-result-ok' : 'ns-result-bad')
                                    }, label)
                                ]);
                            }
                        } else {
                            td = E('td', {}, resultText);
                        }
                    } else if (col.key === 'upgrade_result') {
                        var logResText = row.upgrade_result || '';
                        var logLabel = getOtaResultLabel(logResText);
                        if (!logLabel) {
                            td = E('td', {}, '');
                        } else {
                            var ok2 = (logLabel === _('升级成功'));
                            td = E('td', {}, [
                                E('span', {
                                    'class': 'ns-result ' + (ok2 ? 'ns-result-ok' : 'ns-result-bad')
                                }, logLabel)
                            ]);
                        }
                    } else if (col.key === 'ops') {
                        if (schemaKey === 'ad_dev') {
                            var del2 = E('button', { 'class': 'ns-btn danger', type: 'button', style: 'margin-left:6px;' }, _('删除'));
                            var up2 = E('button', { 'class': 'ns-btn primary', type: 'button' }, _('升级'));
                            var st2 = (typeof row.status_code === 'number') ? row.status_code : (parseInt(row.status_code, 10) || 0);
                            var isFw2 = ((typeof row.pkg_type_num === 'number') ? row.pkg_type_num : (parseInt(row.pkg_type_num, 10) || 0)) === 0;

                            del2.onclick = function () {
                                var instId = (row && row._inst != null) ? parseInt(row._inst, 10) : NaN;
                                if (isNaN(instId)) {
                                    toastWarn(_('删除失败：实例ID无效'));
                                    return;
                                }
                                del2.disabled = true;
                                try {
                                    bindFilterEvents._doDeleteByInst(instId, row, schemaKey);
                                } finally {
                                    del2.disabled = false;
                                }
                            };

                            if (st2 !== 0) {
                                up2.disabled = true;
                                up2.classList.add('ns-btn-disabled');
                            } else {
                                up2.onclick = function () {
                                    var instId = (row && row._inst != null) ? parseInt(row._inst, 10) : NaN;
                                    if (isNaN(instId)) {
                                        toastWarn(_('升级失败：实例ID无效'));
                                        return;
                                    }
                                    if (isFw2) {
                                        openFwUpgradeConfirmModal({
                                            onOk: function () {
                                                up2.disabled = true;
                                                try {
                                                    bindFilterEvents._doUpgradeByInst(instId);
                                                } finally {
                                                    up2.disabled = false;
                                                }
                                            }
                                        });
                                        return;
                                    }

                                    up2.disabled = true;
                                    try {
                                        bindFilterEvents._doUpgradeByInst(instId);
                                    } finally {
                                        up2.disabled = false;
                                    }
                                };
                            }

                            td = E('td', {}, [up2, del2]);
                        }
                    } else {
                        td = E('td', {}, (row[col.key] == null ? '' : String(row[col.key])));
                    }
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            });

            if (schemaKey === 'log') {
                renderPager(schemaKey, total, slice.length);
            } else {
                renderPager(schemaKey, total, 0);
            }
        }

        function renderCurrent() {
            var schema = tableSchemas[activeTab];
            var pager = pagers[activeTab];
            if (!schema) {
                return;
            }
            if (activeTab === 'log') {
                var all = Array.isArray(schema.data) ? schema.data : [];
                var nameLike = String(logNameInput.value || '').trim();
                var typeVal = String(logTypeDd.get() || '');

                var filtered = all.filter(function (r) {
                    if (!r) {
                        return false;
                    }
                    if (nameLike) {
                        if (String(r.name || '').indexOf(nameLike) < 0) {
                            return false;
                        }
                    }
                    if (typeVal !== 'all') {
                        if (String(r.pkg_type_num) !== typeVal) {
                            return false;
                        }
                    }
                    return true;
                });
                renderTable(activeTab, schema.columns, filtered, pager);
                return;
            }
            renderTable(activeTab, schema.columns, schema.data, pager);
        }

        window.addEventListener('beforeunload', function () {
            clearAllPollingFlags();
        });
        updateTabsActive();
        renderCurrent();
        ensureUpdateLogTable().then(function () {
            return refreshActiveTabData();
        });

        return root;
    }
});
