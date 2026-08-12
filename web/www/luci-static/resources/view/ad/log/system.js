'use strict';
'require view';
'require fs';
'require ui';
'require poll';
'require dom';

(function ensureCustomCSS() {
    var id = 'syslog-dark-css';
    if (!document.getElementById(id)) {
        document.head.appendChild(E('link', {
            id: id, rel: 'stylesheet',
            href: '/luci-static/custom/css/log/system.css'
        }));
    }
})();

const REFRESH_SEC = 5;

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

async function detectLoggerPath() {
    try {
        const statSbin = await L.resolveDefault(fs.stat('/sbin/logread'), null);
        const statUsr = await L.resolveDefault(fs.stat('/usr/sbin/logread'), null);
        return statSbin ? statSbin.path : (statUsr ? statUsr.path : null);
    } catch (e) {
        return null;
    }
}

return view.extend({
    load: async function () {
        const logger = await detectLoggerPath();
        return { logger };
    },

    render: function (data) {
        const logger = data.logger;
        const state = {
            allLines: [], filtered: [],
            pageIndex: 0, pageSize: 20,
            paused: false, kw: '',
            lastFetchOk: true
        };

        const bar = el('div', { class: 'slog-bar cbi-section' }, [
            el('div', { class: 'toolbar-hsplit' }, [
                el('div', { class: 'controls-left' }, [
                    el('label', {}, __('关键词')),
                    el('input', { id: 'kw', type: 'text', placeholder: __('按行模糊匹配（不区分大小写）') }),
                    el('button', { id: 'doSearch', class: 'btn cbi-button cbi-button-action', type: 'button' }, __('筛选')),
                    el('button', { id: 'doReset', class: 'btn cbi-button cbi-button-reset', type: 'button' }, __('重置')),
                ]),
                el('div', { class: 'controls-right' }, [
                    el('button', { id: 'btnRefresh', class: 'ns-icon-btn ns-refresh', type: 'button', title: __('刷新') }, [
                        el('span', { class: 'ico' })
                    ]),
                    el('button', { id: 'btnToggle', class: 'ns-icon-btn ns-pause', type: 'button', title: __('暂停刷新') }, [
                        el('span', { class: 'ico' })
                    ]),
                    el('a', { id: 'btnExport', class: 'ns-icon-btn ns-export', href: '#', download: 'System_Log.txt', title: __('导出') }, [
                        el('span', { class: 'ico' })
                    ]),
                ]),
            ]),
        ]);

        const tableWrap = el('div', { class: 'cbi-section log-table-wrap' }, [
            el('table', { class: 'table log-table' }, [
                el('thead', {}, [el('tr', {}, [
                    el('th', { class: 'log-line-number' }, '#'),
                    el('th', {}, __('系统日志')),
                    el('th', { class: 'log-copy-cell' }, '')
                ])]),
                el('tbody', { id: 'tbody' }, [])
            ])
        ]);

        const pager = el('div', { class: 'cbi-section-footer' }, [
            el('div', { class: 'pager-modern' }, [
                el('div', { class: 'pm-left' }, [
                    el('span', { id: 'totalInfo' }, __('共 0 行')),
                ]),
                el('div', { class: 'pm-center', id: 'pageBtns' }, []),
                el('div', { class: 'pm-right' }, [
                    el('label', {}, __('每页行数：')),
                    el('select', { id: 'pagesize' }, [
                        el('option', { value: '20', selected: 'selected' }, '20'),
                        el('option', { value: '50' }, '50'),
                        el('option', { value: '100' }, '100'),
                        el('option', { value: '500' }, '500'),
                    ]),
                ]),
            ])
        ]);

        const root = el('div', { class: 'cbi-section' }, [bar, tableWrap, pager]);

        function copyText(text) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                return navigator.clipboard.writeText(text);
            }
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', 'readonly');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
        }
        function spinOnce(btn) {
            const icon = btn && btn.querySelector ? btn.querySelector('.ico') : null;
            if (!icon) {
                return;
            }
            icon.classList.remove('spin-once');
            void icon.offsetWidth;
            icon.classList.add('spin-once');
            setTimeout(() => icon.classList.remove('spin-once'), 480);
        }
        function sliceByPage(lines, index, size) {
            const start = index * size;
            return lines.slice(start, start + size);
        }
        function buildPageList(cur, total) {
            const out = [], add = v => {
                if (out[out.length - 1] !== v) {
                    out.push(v);
                }
            };
            const push = (a, b) => {
                for (let i = a; i <= b; i++) {
                    add(i);
                }
            };
            if (total <= 7) {
                push(1, total); return out;
            }
            add(1);
            add(2);
            const s = Math.max(3, cur - 1), e = Math.min(total - 2, cur + 1);
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
        function renderPager() {
            const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
            const cur = Math.min(state.pageIndex + 1, totalPages);
            state.pageIndex = cur - 1;
            const wrap = $q(root, '#pageBtns');
            const btns = [];
            btns.push(el('button', { class: 'pm-btn pm-arrow' + (cur === 1 ? ' disabled' : ''), 'data-act': 'prev', disabled: (cur === 1) ? 'disabled' : null, type: 'button' }, '‹'));
            buildPageList(cur, totalPages).forEach(v => {
                if (v === '…') {
                    btns.push(el('span', { class: 'pm-ellipsis' }, '…'));
                } else {
                    btns.push(el('button', { class: 'pm-btn' + (v === cur ? ' active' : ''), 'data-page': v, type: 'button' }, String(v)));
                }
            });
            btns.push(el('button', { class: 'pm-btn pm-arrow' + (cur >= totalPages ? ' disabled' : ''), 'data-act': 'next', disabled: (cur >= totalPages) ? 'disabled' : null, type: 'button' }, '›'));
            dom.content(wrap, btns);
            $q(root, '#totalInfo').textContent = __('共') + ' ' + state.filtered.length + ' ' + __('行');
        }
        function renderTable() {
            const tbody = $q(root, '#tbody');
            if (!state.filtered.length) {
                dom.content(tbody, [el('tr', {}, [el('td', { class: 'nodata', colspan: 3 }, __('暂无数据'))])]);
                return;
            }
            const pageLines = sliceByPage(state.filtered, state.pageIndex, state.pageSize);
            const rows = [];
            const base = state.pageIndex * state.pageSize;
            for (let i = 0; i < pageLines.length; i++) {
                const ln = (base + i + 1).toString();
                rows.push(el('tr', {}, [
                    el('td', { class: 'log-line-number' }, ln),
                    el('td', {}, [document.createTextNode(pageLines[i])]),
                    el('td', { class: 'log-copy-cell' }, [
                        el('button', {
                            class: 'log-copy-btn',
                            type: 'button',
                            title: __('复制本行日志'),
                            'data-log': pageLines[i]
                        }, [
                            el('img', { src: '/luci-static/custom/img/copy.svg', alt: '' })
                        ])
                    ])
                ]));
            }
            dom.content(tbody, rows);
        }
        function exportAll() {
            const blob = new Blob([state.filtered.slice().reverse().join('\n')], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            $q(root, '#btnExport').href = url;
        }
        function applyFilter(keepPage) {
            const kw = (state.kw || '').toLowerCase();
            if (kw) {
                state.filtered = state.allLines.filter(line => {
                    try {
                        return line.toLowerCase().includes(kw);
                    } catch (e) {
                        return false;
                    }
                });
            } else {
                state.filtered = state.allLines.slice(0);
            }
            if (!keepPage) {
                state.pageIndex = 0;
            }
            renderPager();
            renderTable();
            exportAll();
        }

        async function fetchLogs() {
            if (!logger) {
                throw new Error('logread not found');
            }
            const txt = await fs.exec_direct(logger, ['-e', '^']).catch(err => {
                throw new Error(err && err.message || 'logread failed');
            });
            const lines = (txt || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
            if (lines.length && lines[lines.length - 1] === '') {
                lines.pop();
            }
            return lines.reverse();
        }
        async function reload(full) {
            if (state.paused && !full) {
                return;
            }
            try {
                state.allLines = await fetchLogs();
                applyFilter(true);
                state.lastFetchOk = true;
            } catch (e) {
                if (state.lastFetchOk) {
                    ui.addNotification(null, E('p', {}, _('Unable to load log data: ' + e.message)));
                }
                state.lastFetchOk = false;
            }
        }

        $q(bar, '#btnRefresh').addEventListener('click', (ev) => {
            spinOnce(ev.currentTarget);
            reload(true);
        });
        $q(bar, '#btnToggle').addEventListener('click', (ev) => {
            state.paused = !state.paused;
            ev.currentTarget.classList.toggle('is-paused', state.paused);
            ev.currentTarget.title = state.paused ? __('继续刷新') : __('暂停刷新');
        });
        $q(pager, '#pagesize').addEventListener('change', () => {
            state.pageSize = parseInt($q(pager, '#pagesize').value, 10) || 20;
            applyFilter(false);
        });
        $q(root, '#pageBtns').addEventListener('click', (ev) => {
            const btn = ev.target.closest('button.pm-btn');
            if (!btn) {
                return;
            }
            ev.preventDefault();
            if (btn.dataset.page) {
                state.pageIndex = parseInt(btn.dataset.page, 10) - 1;
            } else if (btn.dataset.act === 'prev' && state.pageIndex > 0) {
                state.pageIndex--;
            } else if (btn.dataset.act === 'next') {
                state.pageIndex++;
            }
            renderPager();
            renderTable();
            exportAll();
        });
        $q(tableWrap, '.log-table').addEventListener('click', (ev) => {
            const btn = ev.target.closest('button.log-copy-btn');
            if (!btn) {
                return;
            }
            ev.preventDefault();
            copyText(btn.dataset.log || '').then(() => {
                btn.classList.add('copied');
                btn.title = __('已复制');
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.title = __('复制本行日志');
                }, 1200);
            }).catch(e => {
                ui.addNotification(null, E('p', {}, _('复制失败：') + (e && e.message || e)));
            });
        });
        $q(bar, '#doSearch').addEventListener('click', () => {
            state.kw = $q(bar, '#kw').value.trim();
            applyFilter(false);
        });
        $q(bar, '#doReset').addEventListener('click', () => {
            $q(bar, '#kw').value = '';
            state.kw = '';
            applyFilter(false);
        });
        $q(bar, '#kw').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                state.kw = $q(bar, '#kw').value.trim();
                applyFilter(false);
            }
        });

        poll.add(() => reload(false), REFRESH_SEC);
        reload(true);

        return root;
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
