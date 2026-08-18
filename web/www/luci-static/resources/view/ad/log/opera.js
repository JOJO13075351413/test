'use strict';
'require view';
'require dom';

var LOG_TABLE = 'ad_op_log';
var DB_EXEC_TIMEOUT_MS = 2500;
var LOG_SELECT_FIELDS = 'id, ts, user, dev_id, page_key, ip, action_key, result_key';

function logCreateSql() {
    return 'CREATE TABLE IF NOT EXISTS ' + LOG_TABLE + ' (' +
        'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
        'ts INTEGER, user TEXT, dev_id TEXT, page_key TEXT, ip TEXT, action_key TEXT, ' +
        'result_key TEXT' +
        ')';
}

function logSchemaProbeSql() {
    return 'SELECT ' + LOG_SELECT_FIELDS + ' FROM ' + LOG_TABLE + ' LIMIT 0';
}

function el(tag, attrs, children) {
    return E(tag, attrs || {}, children || []);
}

function $q(root, sel) {
    return root.querySelector(sel);
}

function __(s) {
    try {
        return _(s);
    } catch (e) {
        return s;
    }
}

function toInt(v, dft) {
    var n = parseInt(v, 10);
    if (isNaN(n)) {
        return dft || 0;
    }
    return n;
}

function fmtTime(ts) {
    if (!ts) {
        return '-';
    }
    try {
        return new Date(Number(ts) * 1000).toLocaleString();
    } catch (_) {
        return '-';
    }
}

function fmtFileStamp(date) {
    var d = date || new Date();
    function pad(n) {
        return String(n).padStart(2, '0');
    }
    return String(d.getFullYear()) +
        pad(d.getMonth() + 1) +
        pad(d.getDate()) +
        pad(d.getHours()) +
        pad(d.getMinutes()) +
        pad(d.getSeconds());
}

function toastWarnMsg(message, delay) {
    if (typeof window.toastWarn === 'function') {
        window.toastWarn(message, delay);
        return;
    }
    if (typeof window.toast === 'function') {
        window.toast('warn', message, delay);
    }
}

function translateAudit(type, key) {
    if (window.adAuditActions && typeof window.adAuditActions.translate === 'function') {
        return window.adAuditActions.translate(type, key);
    }
    return String(key || '-') || '-';
}

function displayPage(key) {
    return translateAudit('page', key);
}

function displayAction(key) {
    return translateAudit('action', key);
}

function displayResult(key) {
    return translateAudit('result', key);
}

function resultClass(key) {
    var k = String(key || '').trim();
    if (k === 'success') {
        return 'clip result-ok';
    }
    if (k === 'failure') {
        return 'clip result-bad';
    }
    return 'clip';
}

function formatLogDetail(row) {
    var r = row || {};
    var detail = {
        user: r.user || '-',
        dev_id: r.dev_id || '-',
        page: displayPage(r.page_key),
        ip: r.ip || '-',
        action: displayAction(r.action_key),
        result: displayResult(r.result_key)
    };
    return JSON.stringify(detail, null, 2);
}

function normalizeDbRows(rows) {
    var list = Array.isArray(rows) ? rows : [];
    return list.map(function (r) {
        var it = r || {};
        return {
            id: toInt(it.id, 0),
            ts: toInt(it.ts, 0),
            user: String(it.user || ''),
            dev_id: String(it.dev_id || ''),
            page_key: String(it.page_key || ''),
            action_key: String(it.action_key || ''),
            ip: String(it.ip || ''),
            result_key: String(it.result_key || '')
        };
    });
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
    var s = Math.max(3, cur - 1);
    var e = Math.min(total - 2, cur + 1);
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

function renderLogPage(sqlApi) {
    var schemaReady = false;
    var state = {
        loading: false,
        pages: [],
        pageIndex: 0,
        expandedById: {},
        pageSize: 20,
        filters: {
            page: 'all',
            result: 'all'
        }
    };

    function buildSingleDropdown(options, initValue, placeholderText) {
        if (!window.adComponents || typeof window.adComponents.createSingleSelect !== 'function') {
            throw new Error('adComponents.createSingleSelect is not available');
        }
        return window.adComponents.createSingleSelect({
            options: options,
            value: initValue,
            placeholder: placeholderText || __('请选择'),
            styleVars: {
                '--adui-ss-min-width': '120px',
                '--adui-ss-arrow-color': '#968a80',
                '--adui-ss-placeholder': '#968a80',
                '--adui-ss-menu-border': '#e9dfd5',
                '--adui-ss-menu-bg': '#ffffff',
                '--adui-ss-menu-text': '#3d434c',
                '--adui-ss-menu-hover-bg': '#fff4ec',
                '--adui-ss-menu-selected-bg': '#ffe3cd'
            }
        });
    }

    var pageSel = buildSingleDropdown([
        { value: 'all', label: __('全部') },
        { value: 'page.ad.index', label: displayPage('page.ad.index') },
        { value: 'page.ad.access.fd', label: displayPage('page.ad.access.fd') },
        { value: 'page.ad.network.interface', label: displayPage('page.ad.network.interface') },
        { value: 'page.ad.network.wireless.config', label: displayPage('page.ad.network.wireless.config') },
        { value: 'page.ad.host.detail', label: displayPage('page.ad.host.detail') },
        { value: 'page.ad.host.update', label: displayPage('page.ad.host.update') }
    ], state.filters.page, __('请选择'));
    var resultSel = buildSingleDropdown([
        { value: 'all', label: __('全部') },
        { value: 'success', label: displayResult('success') },
        { value: 'failure', label: displayResult('failure') }
    ], state.filters.result, __('请选择'));

    var bar = el('div', { class: 'audit-bar' }, [
        el('div', { class: 'ns-filter' }, [
            el('div', { class: 'left' }, [
                el('span', { class: 'lbl' }, __('页面')),
                pageSel.root,
                el('span', { class: 'lbl' }, __('结果')),
                resultSel.root,
                el('button', {
                    id: 'btnFilter',
                    class: 'ns-btn ad-c-btn ad-c-btn--primary primary',
                    type: 'button'
                }, __('筛选')),
                el('button', {
                    id: 'btnReset',
                    class: 'ns-btn ad-c-btn',
                    type: 'button'
                }, __('重置'))
            ]),
            el('div', { class: 'right' }, [
                el('button', {
                    id: 'btnReload',
                    class: 'ns-icon-btn ad-c-icon-btn ns-refresh',
                    type: 'button',
                    title: __('刷新')
                }, [
                    el('span', { class: 'ico' })
                ]),
                el('button', {
                    id: 'btnExport',
                    class: 'ns-icon-btn ad-c-icon-btn ns-export',
                    type: 'button',
                    title: __('导出')
                }, [
                    el('span', { class: 'ico' })
                ])
            ])
        ])
    ]);

    var tableWrap = el('div', { class: 'cbi-section audit-table-wrap' }, [
        el('table', { class: 'table audit-table' }, [
            el('thead', { class: 'thead-strong' }, [
                el('tr', {}, [
                    el('th', {}, __('用户')),
                    el('th', {}, __('设备ID')),
                    el('th', {}, __('页面')),
                    el('th', {}, __('IP')),
                    el('th', {}, __('操作')),
                    el('th', {}, __('结果')),
                    el('th', {}, __('时间'))
                ])
            ]),
            el('tbody', { id: 'tbody' }, [
                el('tr', {}, [
                    el('td', { colspan: 7, class: 'nodata' }, __('日志加载中...'))
                ])
            ])
        ])
    ]);

    var pager = el('div', { class: 'cbi-section-footer' }, [
        el('div', { class: 'pager-modern' }, [
            el('div', { class: 'pm-left' }, [
                el('span', { id: 'totalInfo' }, __('尚未查询'))
            ]),
            el('div', { class: 'pm-center', id: 'pageBtns' }, []),
            el('div', { class: 'pm-right' }, [
                el('label', {}, __('每页行数：')),
                el('select', { id: 'pageSizeSel', class: 'pm-ps' }, [
                    el('option', { value: '20', selected: 'selected' }, '20'),
                    el('option', { value: '50' }, '50'),
                    el('option', { value: '100' }, '100')
                ])
            ])
        ])
    ]);

    var root = el('div', { class: 'cbi-section audit-page' }, [bar, tableWrap, pager]);

    var btnReload = $q(root, '#btnReload');
    var btnExport = $q(root, '#btnExport');
    var btnFilter = $q(root, '#btnFilter');
    var btnReset = $q(root, '#btnReset');
    var pageBtns = $q(root, '#pageBtns');
    var selectPageSize = $q(root, '#pageSizeSel');
    var totalInfo = $q(root, '#totalInfo');
    var tbody = $q(root, '#tbody');
    var reloadIcon = $q(root, '#btnReload .ico');

    function setDisabled(node, disabled) {
        if (!node) {
            return;
        }
        if (disabled) {
            node.setAttribute('disabled', 'disabled');
        } else {
            node.removeAttribute('disabled');
        }
    }

    function setDropdownDisabled(dd, disabled) {
        if (dd && typeof dd.setDisabled === 'function') {
            dd.setDisabled(!!disabled);
        }
    }

    function spinRefreshOnce() {
        if (!reloadIcon) {
            return;
        }
        reloadIcon.classList.remove('spin-once');
        void reloadIcon.offsetWidth;
        reloadIcon.classList.add('spin-once');
        setTimeout(function () {
            reloadIcon.classList.remove('spin-once');
        }, 360);
    }

    function renderPager() {
        var hasPages = state.pages.length > 0;
        var loadedPages = Math.max(1, state.pages.length);
        var lastLoaded = state.pages[loadedPages - 1] || null;
        var hasUnknownMore = !!(lastLoaded && lastLoaded.hasMore);
        var totalPages = hasPages ? (loadedPages + (hasUnknownMore ? 1 : 0)) : 1;
        var cur = Math.min(Math.max(state.pageIndex + 1, 1), totalPages);
        state.pageIndex = cur - 1;

        var canPrev = hasPages && cur > 1;
        var canNext = hasPages && (cur < totalPages);
        var btns = [];
        btns.push(el('button', {
            class: 'pm-btn pm-arrow' + ((canPrev && !state.loading) ? '' : ' disabled'),
            'data-act': 'prev',
            disabled: (canPrev && !state.loading) ? null : 'disabled',
            type: 'button'
        }, '‹'));
        buildPageList(cur, totalPages).forEach(function (v) {
            if (v === '…') {
                btns.push(el('span', { class: 'pm-ellipsis' }, '…'));
            } else {
                btns.push(el('button', {
                    class: 'pm-btn' + (v === cur ? ' active' : ''),
                    'data-page': v,
                    disabled: state.loading ? 'disabled' : null,
                    type: 'button'
                }, String(v)));
            }
        });
        btns.push(el('button', {
            class: 'pm-btn pm-arrow' + ((canNext && !state.loading) ? '' : ' disabled'),
            'data-act': 'next',
            disabled: (canNext && !state.loading) ? null : 'disabled',
            type: 'button'
        }, '›'));
        dom.content(pageBtns, btns);

        if (!hasPages) {
            totalInfo.textContent = __('共 0 项');
            return;
        }
        var loadedRows = 0;
        for (var i2 = 0; i2 < state.pages.length; i2++) {
            loadedRows += ((state.pages[i2] && state.pages[i2].rows) ? state.pages[i2].rows.length : 0);
        }
        totalInfo.textContent = __('共 ') + String(loadedRows) + (hasUnknownMore ? '+' : '') + __(' 项');
    }

    function setLoading(loading) {
        state.loading = !!loading;
        setDisabled(btnReload, state.loading);
        setDisabled(btnExport, state.loading);
        setDisabled(btnFilter, state.loading);
        setDisabled(btnReset, state.loading);
        setDisabled(selectPageSize, state.loading);
        setDropdownDisabled(pageSel, state.loading);
        setDropdownDisabled(resultSel, state.loading);
        if (reloadIcon) {
            reloadIcon.classList.toggle('is-busy', state.loading);
        }
        renderPager();
    }

    function renderRows(rows) {
        var list = Array.isArray(rows) ? rows : [];
        if (!list.length) {
            dom.content(tbody, [
                el('tr', {}, [
                    el('td', { colspan: 7, class: 'nodata' }, __('暂无数据'))
                ])
            ]);
            return;
        }
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var r = list[i] || {};
            var rowId = toInt(r.id, 0);
            var expanded = !!state.expandedById[rowId];
            var rowCls = 'row-main ' + ((i % 2 === 0) ? 'zebra-0' : 'zebra-1') + (expanded ? ' row-expanded' : '');
            out.push(el('tr', { class: rowCls, 'data-rowid': String(rowId || '') }, [
                el('td', { class: 'clip' }, [
                    el('span', { class: 'expand-mark' }, expanded ? '▾' : '▸'),
                    String(r.user || '-')
                ]),
                el('td', { class: 'clip' }, [
                    String(r.dev_id || '-')
                ]),
                el('td', { class: 'clip' }, displayPage(r.page_key)),
                el('td', { class: 'clip' }, String(r.ip || '-')),
                el('td', { class: 'clip' }, displayAction(r.action_key)),
                el('td', { class: resultClass(r.result_key) }, displayResult(r.result_key)),
                el('td', { class: 'clip' }, fmtTime(r.ts))
            ]));
            if (expanded) {
                out.push(el('tr', { class: 'row-detail', 'data-parentid': String(rowId || '') }, [
                    el('td', { colspan: 7 }, [
                        el('div', { class: 'detail' }, [
                            el('div', { class: 'detail-title' }, __('日志详情')),
                            el('pre', { class: 'detail-pre' }, formatLogDetail(r))
                        ])
                    ])
                ]));
            }
        }
        dom.content(tbody, out);
    }

    function renderCurrentPage() {
        if (!state.pages.length) {
            renderRows([]);
            renderPager();
            return;
        }
        var pg = state.pages[state.pageIndex] || { rows: [] };
        renderRows(pg.rows || []);
        renderPager();
    }

    function dbExecOnce(sql, params) {
        if (!sqlApi || typeof sqlApi.dbExec !== 'function') {
            return Promise.reject(new Error('sql api not ready'));
        }
        var task = sqlApi.dbExec(String(sql || ''), Array.isArray(params) ? params : []);
        var timeoutMs = toInt(DB_EXEC_TIMEOUT_MS, 0);
        if (timeoutMs <= 0) {
            return task;
        }
        return new Promise(function (resolve, reject) {
            var done = false;
            var timer = setTimeout(function () {
                if (done) {
                    return;
                }
                done = true;
                reject(new Error('db exec timeout'));
            }, timeoutMs);
            task.then(function (resp) {
                if (done) {
                    return;
                }
                done = true;
                clearTimeout(timer);
                resolve(resp);
            }).catch(function (e) {
                if (done) {
                    return;
                }
                done = true;
                clearTimeout(timer);
                reject(e);
            });
        });
    }

    function ensureLogTableReady() {
        if (schemaReady) {
            return Promise.resolve(true);
        }
        var createSql = logCreateSql();

        return dbExecOnce(createSql, []).then(function (resp) {
            if (!resp || Number(resp.status) !== 0) {
                throw new Error('init table failed');
            }
            return dbExecOnce(logSchemaProbeSql(), []);
        }).then(function (resp) {
            if (resp && Number(resp.status) === 0) {
                schemaReady = true;
                return true;
            }
            return dbExecOnce('DROP TABLE IF EXISTS ' + LOG_TABLE, []).then(function (dropResp) {
                if (!dropResp || Number(dropResp.status) !== 0) {
                    throw new Error('reset table failed');
                }
                return dbExecOnce(createSql, []);
            }).then(function (createResp) {
                if (!createResp || Number(createResp.status) !== 0) {
                    throw new Error('recreate table failed');
                }
                schemaReady = true;
                return true;
            });
        }).catch(function (e) {
            schemaReady = false;
            throw e;
        });
    }

    function buildSelectSql() {
        return 'SELECT ' + LOG_SELECT_FIELDS + ' FROM ' + LOG_TABLE;
    }

    function buildProbeSql() {
        return 'SELECT id FROM ' + LOG_TABLE;
    }

    function exportRowsToLog(rows) {
        var lines = [];
        (Array.isArray(rows) ? rows : []).forEach(function (r) {
            lines.push(JSON.stringify({
                user: r.user || '-',
                dev_id: r.dev_id || '-',
                page: displayPage(r.page_key),
                ip: r.ip || '-',
                action: displayAction(r.action_key),
                result: displayResult(r.result_key),
                ts: r.ts || 0,
                time: fmtTime(r.ts)
            }));
        });
        return lines.join('\n') + '\n';
    }

    function downloadText(filename, content, mimeType) {
        var blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 1000);
    }

    function exportAllRows() {
        if (state.loading || btnExport.disabled) {
            return;
        }
        var allRows = [];
        var limit = 1000;
        var exportSql = 'SELECT ' + LOG_SELECT_FIELDS + ' FROM ' + LOG_TABLE;
        function next(beforeId) {
            var sql = exportSql;
            var params = [];
            if (beforeId != null) {
                sql += ' WHERE id < ?';
                params.push(String(beforeId));
            }
            sql += ' ORDER BY id DESC LIMIT ?';
            params.push(String(limit));
            return dbExecOnce(sql, params).then(function (resp) {
                if (!resp || Number(resp.status) !== 0) {
                    throw new Error('query failed');
                }
                var rows = normalizeDbRows(resp.rows || []);
                if (!rows.length) {
                    return allRows;
                }
                allRows = allRows.concat(rows);
                if (rows.length < limit) {
                    return allRows;
                }
                var lastId = toInt(rows[rows.length - 1].id, 0);
                if (lastId <= 0) {
                    return allRows;
                }
                return next(lastId);
            });
        }

        setDisabled(btnExport, true);
        ensureLogTableReady().then(function () {
            return next(null);
        }).then(function (rows) {
            if (!rows.length) {
                toastWarnMsg(__('暂无数据'), 3000);
                return;
            }
            var stamp = fmtFileStamp(new Date());
            downloadText('AD_Operation_Log_' + stamp + '.log', exportRowsToLog(rows), 'application/x-ndjson;charset=utf-8');
        }).catch(function (e) {
            toastWarnMsg(__('导出失败：') + (e && e.message ? e.message : String(e)), 4000);
        }).finally(function () {
            setDisabled(btnExport, state.loading);
        });
    }

    function readFiltersFromUi() {
        state.filters.page = String((pageSel && pageSel.get && pageSel.get()) || 'all').trim();
        state.filters.result = String((resultSel && resultSel.get && resultSel.get()) || 'all').trim();
        state.pageSize = Math.max(1, toInt((selectPageSize && selectPageSize.value) || '20', 10) || 20);
    }

    function pageFilterKeys(key) {
        var k = String(key || '').trim();
        var groups = {
            'page.ad.network.interface': [
                'page.ad.network.interface',
                'page.ad.network.interface.info'
            ],
            'page.ad.network.wireless.config': [
                'page.ad.network.wireless.config',
                'page.ad.network.wireless.24g',
                'page.ad.network.wireless.5g',
                'page.ad.network.wireless.low_power',
                'page.ad.network.wireless.common'
            ]
        };
        return groups[k] || (k ? [k] : []);
    }

    function whereSqlAndParams() {
        var clauses = ['1=1'];
        var params = [];
        if (state.filters.page && state.filters.page !== 'all') {
            var pageKeys = pageFilterKeys(state.filters.page);
            if (pageKeys.length) {
                clauses.push('page_key IN (' + pageKeys.map(function () { return '?'; }).join(', ') + ')');
                params = params.concat(pageKeys);
            }
        }
        if (state.filters.result && state.filters.result !== 'all') {
            clauses.push('result_key = ?');
            params.push(state.filters.result);
        }
        return {
            where: clauses.join(' AND '),
            params: params
        };
    }

    function queryPage(beforeId) {
        var w = whereSqlAndParams();
        var sql = buildSelectSql() + ' WHERE ' + w.where;
        var params = w.params.slice();
        if (beforeId != null) {
            sql += ' AND id < ?';
            params.push(String(beforeId));
        }
        sql += ' ORDER BY id DESC LIMIT ?';
        params.push(String(state.pageSize));

        return dbExecOnce(sql, params).then(function (resp) {
            if (!resp || Number(resp.status) !== 0) {
                throw new Error('query failed');
            }
            var rows = normalizeDbRows(resp.rows || []);
            if (!rows.length) {
                return {
                    rows: [],
                    hasMore: false,
                    nextBeforeId: null
                };
            }
            var lastId = toInt(rows[rows.length - 1].id, 0);
            if (lastId <= 0) {
                return {
                    rows: rows,
                    hasMore: false,
                    nextBeforeId: null
                };
            }
            var probeSql = buildProbeSql() + ' WHERE ' + w.where + ' AND id < ? ORDER BY id DESC LIMIT 1';
            var probeParams = w.params.slice();
            probeParams.push(String(lastId));
            return dbExecOnce(probeSql, probeParams).then(function (probeResp) {
                var probeRows = [];
                if (probeResp && Number(probeResp.status) === 0 && Array.isArray(probeResp.rows)) {
                    probeRows = probeResp.rows;
                }
                return {
                    rows: rows,
                    hasMore: probeRows.length > 0,
                    nextBeforeId: lastId
                };
            }).catch(function () {
                return {
                    rows: rows,
                    hasMore: false,
                    nextBeforeId: lastId
                };
            });
        });
    }

    function fetchFirstPage() {
        if (state.loading) {
            return;
        }
        readFiltersFromUi();
        setLoading(true);
        ensureLogTableReady().then(function () {
            return queryPage(null);
        }).then(function (pg) {
            state.pages = [pg];
            state.pageIndex = 0;
            state.expandedById = {};
            renderCurrentPage();
        }).catch(function (e) {
            toastWarnMsg(__('加载日志失败：') + (e && e.message ? e.message : String(e)), 4000);
        }).finally(function () {
            setLoading(false);
        });
    }

    function ensurePage(idx) {
        if (idx < 0 || !state.pages.length) {
            return Promise.resolve(false);
        }
        if (idx < state.pages.length) {
            return Promise.resolve(true);
        }
        var steps = idx - state.pages.length + 1;
        var p = Promise.resolve(true);
        for (var i = 0; i < steps; i++) {
            p = p.then(function (ok) {
                if (!ok) {
                    return false;
                }
                var prev = state.pages[state.pages.length - 1];
                if (!prev || !prev.hasMore || !prev.nextBeforeId) {
                    return false;
                }
                return queryPage(prev.nextBeforeId).then(function (pg) {
                    if (!pg.rows || !pg.rows.length) {
                        prev.hasMore = false;
                        return false;
                    }
                    state.pages.push(pg);
                    return true;
                });
            });
        }
        return p;
    }

    function goToPage(targetIndex) {
        if (!state.pages.length || state.loading) {
            return;
        }
        var idx = toInt(targetIndex, 1) - 1;
        if (idx < 0) {
            idx = 0;
        }
        setLoading(true);
        ensurePage(idx).then(function (ok) {
            if (!ok) {
                return;
            }
            state.pageIndex = idx;
            renderCurrentPage();
        }).catch(function (e) {
            toastWarnMsg(__('切换分页失败：') + (e && e.message ? e.message : String(e)), 3000);
        }).finally(function () {
            setLoading(false);
        });
    }

    btnReload.addEventListener('click', function () {
        spinRefreshOnce();
        fetchFirstPage();
    });

    btnExport.addEventListener('click', function () {
        exportAllRows();
    });

    btnFilter.addEventListener('click', function () {
        fetchFirstPage();
    });

    btnReset.addEventListener('click', function () {
        if (state.loading) {
            return;
        }
        pageSel.set('all', true);
        resultSel.set('all', true);
        state.filters.page = 'all';
        state.filters.result = 'all';
        fetchFirstPage();
    });

    pageBtns.addEventListener('click', function (ev) {
        var btn = ev.target.closest('button.pm-btn');
        if (!btn) {
            return;
        }
        if (btn.dataset.page) {
            goToPage(btn.dataset.page);
            return;
        }
        if (btn.dataset.act === 'prev') {
            goToPage(state.pageIndex);
            return;
        }
        if (btn.dataset.act === 'next') {
            goToPage(state.pageIndex + 2);
        }
    });

    tbody.addEventListener('click', function (ev) {
        var tr = ev.target.closest('tr.row-main');
        if (!tr) {
            return;
        }
        var id = toInt(tr.getAttribute('data-rowid'), 0);
        if (!id) {
            return;
        }
        state.expandedById[id] = !state.expandedById[id];
        renderCurrentPage();
    });

    selectPageSize.addEventListener('change', function () {
        fetchFirstPage();
    });

    fetchFirstPage();

    return root;
}

return view.extend({
    load: function () {
        return Promise.all([
            loadCssOnce('/luci-static/custom/css/log/opera.css'),
            loadScriptOnce('/luci-static/custom/js/toast.js'),
            loadScriptOnce('/luci-static/custom/js/components.js'),
            loadScriptOnce('/luci-static/custom/js/audit_actions.js'),
            L.require('emp/sql').then(function (mod) {
                return (typeof mod === 'function') ? new mod() : mod;
            })
        ]).then(function (arr) {
            return { sqlApi: arr[4] };
        });
    },

    render: function (data) {
        return renderLogPage(data.sqlApi);
    }
});
