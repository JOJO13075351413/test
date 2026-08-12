'use strict';
'require view';
'require ui';
'require rpc';

function ipToU32dec(ip) {
    if (!ip) {
        return '0';
    }
    var p = String(ip).split('.').map(function (x) {
        return +x || 0;
    });
    while (p.length < 4) {
        p.push(0);
    }
    var v = ((p[0] << 24) >>> 0) + ((p[1] << 16) >>> 0) + ((p[2] << 8) >>> 0) + (p[3] >>> 0);
    return String(v >>> 0);
}

function isOne_bit(val) {
    var s = String(val == null ? '' : val).trim();
    return s === '1' || /^0*01$/i.test(s);
}

return view.extend({
    load: function () {
        return Promise.all([
            loadCssOnce('/luci-static/custom/css/index.css'),
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

        const callSystemReboot = rpc.declare({ object: 'system', method: 'reboot' });

        function showAdModal(title, nodes, opts) {
            if (window.adModal && typeof window.adModal.show === 'function') {
                return window.adModal.show(ui, title, nodes, opts || {});
            }
            ui.showModal(title, nodes);
            return true;
        }

        function confirmReboot() {
            showAdModal(_('设备重启确认'), [
                E('div', { class: 'modal-body' }, [
                    E('p', {}, _('确定要重启该设备吗？'))
                ]),
                E('div', { class: 'right' }, [
                    E('button', {
                        class: 'btn',
                        click: ui.hideModal
                    }, _('取消')),
                    E('button', {
                        class: 'btn cbi-button-negative',
                        click: async function () {
                            try {
                                await callSystemReboot();
                                window.adAuditActions.record('INDEX_REBOOT', {}, '成功');
                                ui.hideModal();
                                toastSuccess(_('已下发重启指令'));
                            } catch (e) {
                                window.adAuditActions.record('INDEX_REBOOT', {}, '失败');
                                toastError(_('重启失败'));
                            }
                        }
                    }, _('确认'))
                ])
            ], { width: 420 });
        }

        var adNumNodeTop = E('span', { class: 'num' }, '0');
        var adDenNodeTop = E('span', { class: 'den' }, '0');
        var fdNumNodeTop = E('span', { class: 'num' }, '0');
        var fdDenNodeTop = E('span', { class: 'den' }, '0');

        var allNumNodeHead = E('span', { class: 'num' }, '0');
        var allDenNodeHead = E('span', { class: 'den' }, '0');

        var allNumNodeList = E('span', { class: 'num small' }, '0');
        var allDenNodeList = E('span', { class: 'den small' }, '0');
        var adNumNodeList = E('span', { class: 'num small' }, '0');
        var adDenNodeList = E('span', { class: 'den small' }, '0');
        var fdNumNodeList = E('span', { class: 'num small' }, '0');
        var fdDenNodeList = E('span', { class: 'den small' }, '0');
        var kpiOnlineNode = E('div', { class: 'kpi-num' }, '0');
        var kpiOfflineNode = E('div', { class: 'kpi-num' }, '0');

        var root = E('div', { class: 'index-wrap' }, [
            E('div', { class: 'index-top' }, [
                E('div', { class: 'device-card' }, [
                    E('h3', {}, _('FD 无线接入模块')),
                    E('div', { class: 'device-status' }, [
                        E('span', { class: 'dot online' }),
                        E('div', { class: 'count' }, [
                            fdNumNodeTop,
                            E('span', { class: 'sep' }, '/'),
                            fdDenNodeTop
                        ])
                    ])
                ])
            ]),

            E('div', { class: 'index-bottom' }, [
                E('div', { class: 'topology-area' }, [
                    E('img', { src: '/luci-static/custom/img/topology-bg.svg', class: 'bg' }),
                    E('img', { src: '/luci-static/custom/img/ad-topology-devices.png', class: 'fg' })
                ]),
                E('div', { class: 'detail-area' }, [
                    E('section', { class: 'detail-section' }, [
                        E('div', { class: 'section-title' }, _('设备信息')),
                        E('div', { class: 'info-head' }, [
                            E('div', { class: 'info-left' }, [
                                E('div', { class: 'badge' }, [
                                    E('img', { src: '/luci-static/custom/img/logo-ad.png', alt: 'System icon' })
                                ]),
                                E('div', { class: 'title-wrap' }, [
                                    E('div', { class: 'dev-title' }, _('无线安全接入点管理系统')),
                                    E('div', { class: 'device-status small' }, [
                                        E('span', { class: 'dot online' }),
                                        E('div', { class: 'count' }, [
                                            allNumNodeHead,
                                            E('span', { class: 'sep' }, '/'),
                                            allDenNodeHead
                                        ])
                                    ])
                                ])
                            ]),
                            E('div', { class: 'kpi-wrap' }, [
                                E('div', { class: 'kpi kpi-online' }, [
                                    kpiOnlineNode,
                                    E('div', { class: 'kpi-label' }, _('在线'))
                                ]),
                                E('div', { class: 'kpi kpi-offline' }, [
                                    kpiOfflineNode,
                                    E('div', { class: 'kpi-label' }, _('离线'))
                                ])
                            ])
                        ])
                    ]),

                    E('section', { class: 'detail-section' }, [
                        E('div', { class: 'section-title' }, _('设备详情')),
                        E('div', { class: 'list-card' }, [
                            E('div', { class: 'row' }, [
                                E('div', { class: 'row-left' }, _('设备总数')),
                                E('div', { class: 'row-right' }, [
                                    E('div', { class: 'count' }, [
                                        allNumNodeList,
                                        E('span', { class: 'sep' }, '/'),
                                        allDenNodeList
                                    ])
                                ])
                            ]),
                            E('div', { class: 'row' }, [
                                E('div', { class: 'row-left' }, _('FD无线接入模块')),
                                E('div', { class: 'row-right' }, [
                                    E('span', { class: 'dot online' }),
                                    E('div', { class: 'count' }, [
                                        fdNumNodeList,
                                        E('span', { class: 'sep' }, '/'),
                                        fdDenNodeList
                                    ])
                                ])
                            ])
                        ]),
                        E('section', { class: 'detail-section' }, [
                            E('div', { class: 'section-title' }, _('维护')),
                            E('div', { class: 'maint-card' }, [
                                E('div', { class: 'maint-grid' }, [
                                    E('button', {
                                        class: 'maint-btn',
                                        click: () => {
                                            location.href = L.url('admin/ad-host/detail');
                                        }
                                    }, [
                                        E('img', { src: '/luci-static/custom/img/navi-host.svg', class: 'maint-icon', alt: 'Info' }),
                                        E('span', { class: 'maint-text' }, _('设备详情'))
                                    ]),
                                    E('button', {
                                        class: 'maint-btn',
                                        click: confirmReboot
                                    }, [
                                        E('img', { src: '/luci-static/custom/img/power.svg', class: 'maint-icon', alt: 'Reboot' }),
                                        E('span', { class: 'maint-text' }, _('设备重启'))
                                    ])
                                ])
                            ])
                        ]),

                        E('section', { class: 'detail-section' }, [
                            E('div', { class: 'section-title' }, _('诊断工具')),
                            E('div', { class: 'diag-wrap' }, [
                                E('div', { class: 'diag-item' }, [
                                    E('button', {
                                        class: 'diag-btn',
                                        title: _('Ping包测试'),
                                        click: openPingModal
                                    }, [
                                        E('img', { src: '/luci-static/custom/img/ping.svg', class: 'diag-icon', alt: 'Ping' })
                                    ]),
                                    E('div', { class: 'diag-text' }, _('ping包测试'))
                                ])
                            ])
                        ])
                    ])
                ]),
            ])
        ]);

        function openPingModal() {
            function makeIPv4Editor4(value) {
                var ip = String(value || '').trim().split('.').slice(0, 4);
                while (ip.length < 4) {
                    ip.push('');
                }
                var root = E('div', { 'class': 'ip4-editor' });
                var octets = [];
                function focusNext(cur) {
                    var i = octets.indexOf(cur);
                    if (i >= 0 && i < 3) {
                        octets[i + 1].focus();
                        octets[i + 1].select();
                    }
                }
                function focusPrev(cur) {
                    var i = octets.indexOf(cur);
                    if (i > 0) {
                        octets[i - 1].focus();
                        octets[i - 1].select();
                    }
                }
                for (var i = 0; i < 4; i++) {
                    var inp = E('input', {
                        'class': 'ip5-octet', 'type': 'text', 'inputmode': 'numeric',
                        'maxlength': 3, 'autocomplete': 'off', 'value': ip[i]
                    });
                    inp.addEventListener('beforeinput', function (e) {
                        if (e.data && !/^\d$/.test(e.data)) {
                            e.preventDefault();
                        }
                    });
                    inp.addEventListener('input', function (e) {
                        var v = e.target.value.replace(/[^\d]/g, '');
                        if (v !== e.target.value) {
                            e.target.value = v;
                        }
                        if (v.length >= 3) {
                            var n = Math.min(255, Number(v));
                            e.target.value = String(n);
                            focusNext(e.target);
                        }
                    });
                    inp.addEventListener('keydown', function (e) {
                        if (e.key === '.' || e.key === 'Decimal') {
                            if ((e.target.value || '').trim().length > 0) {
                                focusNext(e.target);
                            }
                            e.preventDefault();
                        } else if (e.key === 'Backspace' && e.target.selectionStart === 0 && e.target.selectionEnd === 0) {
                            e.preventDefault();
                            focusPrev(e.target);
                        }
                    });
                    root.appendChild(inp);
                    octets.push(inp);
                    if (i < 3) {
                        root.appendChild(E('span', { 'class': 'ip5-dot' }, '.'));
                    }
                }
                function getValue() {
                    var vals = octets.map(function (i) {
                        return (i.value || '').trim();
                    });
                    var allEmpty = vals.every(function (v) {
                        return v === '';
                    });
                    if (allEmpty) {
                        return '';
                    }
                    var ok = vals.length === 4 && vals.every(function (v) {
                        return /^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 255;
                    });
                    return ok ? vals.join('.') : null;
                }
                function focus() {
                    octets[0].focus();
                    octets[0].select();
                }
                return { root: root, getValue: getValue, focus: focus };
            }

            var overlay = E('div', {
                class: 'ns-modal', click: (ev) => {
                    if (ev.target === overlay) {
                        close();
                    }
                }
            });
            var panel = E('div', { class: 'ns-modal-panel' });

            var hd = E('div', { class: 'ns-modal-hd' }, [
                E('div', { class: 'ns-modal-title' }, _('诊断工具')),
                E('button', { class: 'ns-modal-close', click: close }, '×')
            ]);

            var ipPingEd = makeIPv4Editor4('');

            var resultBox = E('pre', { class: 'ns-result-text', id: 'diag-result' }, '');

            function setLoading(ind, on) {
                if (!ind) {
                    return;
                }
                if (on) {
                    ind.classList.add('show');
                } else {
                    ind.classList.remove('show');
                }
            }

            function setButtonsBusy(on, active) {
                pingBtn.disabled = !!on;
                setLoading(pingIndicator, !!on && active === 'PING');
            }

            function sleep(ms) {
                return new Promise(function (resolve) {
                    setTimeout(resolve, ms);
                });
            }
            function onPingClick(e) {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                runPing();
            }
            function runPing() {
                var ip = ipPingEd.getValue();
                if (!ip || ip === null) {
                    resultBox.textContent = _('请输入有效 IPv4 地址后再执行 IPv4 Ping');
                    return;
                }

                var dev = (typeof getActiveDev === 'function') ? getActiveDev() : { dev_type: DEV_TYPE.AD, dev_id: '' };
                var writeReq = createEmpRequest(
                    dev.dev_type, dev.dev_id,
                    createInstArray(
                        OBJ_ID.TOOL + '/0/' + RES.TOOL.IP1,
                        OPT_TYPE.WRITE, OPT_RANGE.SINGLE_RES,
                        VALUE_TYPE.U32, VALUE_LENGTH.U32, ipToU32dec(ip)
                    )
                );
                writeReq = attachAuditAction(writeReq, 'INDEX_PING_TEST');
                var readReq = createEmpRequest(
                    dev.dev_type, dev.dev_id,
                    createInstArray(
                        OBJ_ID.TOOL + '/0/' + RES.TOOL.RESULT1,
                        OPT_TYPE.READ, OPT_RANGE.SINGLE_RES
                    )
                );

                setButtonsBusy(true, 'PING');
                resultBox.textContent = _('正在执行 IPv4 Ping：') + ip + '...';

                getEmpApi().then(function (api) {
                    return api.empRequest(writeReq).then(function () {
                        return sleep(5000).then(function () {
                            return api.empRequest(readReq);
                        });
                    });
                }).then(function (res) {
                    var payload = res;
                    if (res && Array.isArray(res.result) && res.result[1] && res.result[1].resp_arrays) {
                        payload = res.result[1];
                    }
                    var out = '';
                    (payload.resp_arrays || []).forEach(function (it) {
                        var ps = String(it.uri || '').split('/');
                        if (ps.length >= 3 && parseInt(ps[0], 10) === OBJ_ID.TOOL && parseInt(ps[2], 10) === RES.TOOL.RESULT1) {
                            out = (it.value_payload == null) ? '' : String(it.value_payload);
                        }
                    });
                    resultBox.textContent = out || _('（无返回内容）');
                }).catch(function (e) {
                    resultBox.textContent = _('执行 IPv4 Ping 失败：') + e;
                }).finally(function () {
                    setButtonsBusy(false, null);
                });
            }

            var pingIndicator = E('span', { class: 'op-indicator', 'aria-hidden': 'true' }, [
                E('img', { src: '/luci-static/custom/img/loading.svg', alt: 'loading' })
            ]);

            var pingBtn = E('button', { class: 'btn ns-btn ns-btn-primary', click: onPingClick }, _('开始测试'));

            var bd = E('div', { class: 'ns-modal-bd' }, [
                E('div', { class: 'ns-form-row' }, [
                    E('div', { class: 'ns-label' }, 'IPv4 Ping'),
                    E('div', { class: 'ns-field' }, [
                        ipPingEd.root,
                        pingBtn,
                        pingIndicator
                    ])
                ]),
                E('div', { class: 'ns-result' }, [
                    E('div', { class: 'ns-result-title' }, _('结果')),
                    resultBox
                ])
            ]);

            panel.appendChild(hd);
            panel.appendChild(bd);
            overlay.appendChild(panel);
            document.body.appendChild(overlay);

            function close() {
                if (overlay && overlay.parentNode) {
                    overlay.parentNode.removeChild(overlay);
                }
            }
        }

        function updateCountsUI(cnt) {
            adNumNodeTop.textContent = String(cnt.AD.on);
            adDenNodeTop.textContent = String(cnt.AD.all);
            fdNumNodeTop.textContent = String(cnt.FD.on);
            fdDenNodeTop.textContent = String(cnt.FD.all);

            allNumNodeHead.textContent = String(cnt.total.on);
            allDenNodeHead.textContent = String(cnt.total.all);

            allNumNodeList.textContent = String(cnt.total.on);
            allDenNodeList.textContent = String(cnt.total.all);
            adNumNodeList.textContent = String(cnt.AD.on);
            adDenNodeList.textContent = String(cnt.AD.all);
            fdNumNodeList.textContent = String(cnt.FD.on);
            fdDenNodeList.textContent = String(cnt.FD.all);

            kpiOnlineNode.textContent = String(cnt.total.on);
            kpiOfflineNode.textContent = String(cnt.total.all - cnt.total.on);
        }

        function aggregateChildren(arrays) {
            var byIns = Object.create(null);
            (arrays || []).forEach(function (it) {
                var ps = String(it.uri || '').split('/');
                if (ps.length < 3) {
                    return;
                }
                if (parseInt(ps[0], 10) !== OBJ_ID.CLD_DEV) {
                    return;
                }
                var ins = parseInt(ps[1], 10);
                var rid = parseInt(ps[2], 10);
                if (isNaN(ins) || isNaN(rid)) {
                    return;
                }
                var rec = byIns[ins] || (byIns[ins] = { type: null, online: null });
                var val = (it.value_payload == null) ? '' : String(it.value_payload);
                if (rid === RES.CLD_DEV.DEV_TYPE) {
                    var t = parseInt(val, 10);
                    rec.type = isFinite(t) ? t : null;
                } else if (rid === RES.CLD_DEV.ACTIVE) {
                    rec.online = isOne_bit(val) ? 1 : 0;
                }
            });
            var cnt = { AD: { on: 0, all: 0 }, FD: { on: 0, all: 0 }, total: { on: 0, all: 0 } };
            Object.keys(byIns).forEach(function (k) {
                var r = byIns[k];
                if (r.type === 2) {
                    cnt.AD.all++;
                    if (r.online === 1) {
                        cnt.AD.on++;
                    }
                } else if (r.type === 3) {
                    cnt.FD.all++;
                    if (r.online === 1) {
                        cnt.FD.on++;
                    }
                }
            });
            cnt.total.all = cnt.AD.all + cnt.FD.all;
            cnt.total.on = cnt.AD.on + cnt.FD.on;
            return cnt;
        }

        function fetchChildrenAndRender() {
            var dev = (typeof getActiveDev === 'function') ? getActiveDev() : { dev_type: DEV_TYPE.AD, dev_id: '' };
            var req = createQueryRequest(OBJ_ID.CLD_DEV, dev);
            return getEmpApi().then(function (api) {
                return api.empRequest(req);
            }).then(function (resp) {
                var nr = normalizeEmp(resp);
                if (!nr.ok) {
                    toastWarn(_('获取子设备数据失败') + '（' + empResultCodeText(nr.code) + '）');
                    return;
                }
                var cnt = aggregateChildren(nr.arrays || []);
                updateCountsUI(cnt);
            }).catch(function () {
                toastWarn(_('获取子设备数据失败'));
            });
        }

        empApiPromise.then(function () {
            return fetchChildrenAndRender();
        }).catch(function () { });

        return root;
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
