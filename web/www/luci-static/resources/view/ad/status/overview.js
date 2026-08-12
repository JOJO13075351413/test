'use strict';
'require view';
'require dom';
'require poll';
'require fs';
'require network';
'require rpc';

var callSystemBoard = rpc.declare({
    object: 'system',
    method: 'board'
});

var callSystemInfo = rpc.declare({
    object: 'system',
    method: 'info'
});

var callDSLMetrics = rpc.declare({
    object: 'dsl',
    method: 'metrics',
    expect: { '': {} }
});

(function ensureOverviewCSS() {
    var id = 'ad-overview-css';
    if (document.getElementById(id)) {
        return;
    }
    document.head.appendChild(E('link', {
        id: id,
        rel: 'stylesheet',
        href: '/luci-static/custom/css/status/overview.css'
    }));
})();

function memoryProgressbar(value, max, byte, reverse) {
    var vn = parseInt(value) || 0;
    var mn = parseInt(max) || 100;
    var fv = byte ? String.format('%1024.2mB', value) : value;
    var fm = byte ? String.format('%1024.2mB', max) : max;
    var pc = mn > 0 ? ((100 / mn) * vn) : 0;
    var color1, color2;

    if (!reverse) {
        if (pc <= 30) {
            color1 = '#7eb6ff';
            color2 = '#4299e1';
        } else if (pc <= 70) {
            color1 = '#4299e1';
            color2 = '#ffa726';
        } else {
            color1 = '#ffa726';
            color2 = '#ff6b6b';
        }
    } else {
        if (pc <= 30) {
            color1 = '#ff6b6b';
            color2 = '#ffa726';
        } else if (pc <= 70) {
            color1 = '#ffa726';
            color2 = '#4299e1';
        } else {
            color1 = '#4299e1';
            color2 = '#7eb6ff';
        }
    }

    var barWidth = Math.max(pc, 1);
    var title = '%s / %s (%.2f%%)'.format(fv, fm, pc);
    var text = '%s / %s (%.2f%%)'.format(fv, fm, pc);

    return E('div', { 'class': 'progressbar-container fixed-width' }, [
        E('div', {
            'class': 'cbi-progressbar',
            'title': title
        }, E('div', {
            'class': 'cbi-progressbar-inner',
            'style': 'width:%.2f%%; background: linear-gradient(90deg, %s, %s)'.format(barWidth, color1, color2)
        })),
        E('div', { 'class': 'progressbar-text' }, text)
    ]);
}

function invokeIncludesLoad(includes) {
    var tasks = [], has_load = false;

    for (var i = 0; i < includes.length; i++) {
        if (typeof (includes[i].load) == 'function') {
            tasks.push(includes[i].load().catch(L.bind(function () {
                this.failed = true;
            }, includes[i])));
            has_load = true;
        } else {
            tasks.push(null);
        }
    }

    return has_load ? Promise.all(tasks) : Promise.resolve(null);
}

var SystemModule = {
    title: _('系统'),
    load: function () {
        return Promise.all([
            L.resolveDefault(callSystemBoard(), {}),
            L.resolveDefault(callSystemInfo(), {}),
            fs.lines('/usr/lib/lua/luci/version.lua'),
            fs.trimmed('/proc/sys/net/netfilter/nf_conntrack_count'),
            fs.trimmed('/proc/sys/net/netfilter/nf_conntrack_max')
        ]);
    },
    render: function (data) {
        var boardinfo = data[0],
            systeminfo = data[1],
            luciversion = data[2],
            ct_count = +data[3] || 0,
            ct_max = +data[4] || 0,
            pc = ct_max > 0 ? ((100 / ct_max) * ct_count) : 0;

        var connStr = ct_max > 0 ?
            '%d / %d (%.2f%%)'.format(ct_count, ct_max, pc) :
            '0 / 0 (0.0%)';

        luciversion = luciversion.filter(function (l) {
            return l.match(/^\s*(luciname|luciversion)\s*=/);
        }).map(function (l) {
            return l.replace(/^\s*\w+\s*=\s*['"]([^'"]+)['"].*$/, '$1');
        }).join(' ');

        function extractVVersion(s) {
            var str = (s != null) ? String(s) : '';
            var m = str.match(/V\d+\.\d+\.\d+/i);
            if (m) {
                return m[0];
            }
            return '';
        }

        var releaseDesc = (L.isObject(boardinfo.release) && boardinfo.release.description) ? boardinfo.release.description : '';
        var fwVersion = extractVVersion(releaseDesc) || extractVVersion(luciversion);
        if (!fwVersion) {
            fwVersion = (releaseDesc ? (releaseDesc + ' / ') : '') + (luciversion || '');
        }

        var datestr = null;
        if (systeminfo.localtime) {
            var date = new Date(systeminfo.localtime * 1000);
            datestr = '%04d-%02d-%02d %02d:%02d:%02d'.format(
                date.getUTCFullYear(),
                date.getUTCMonth() + 1,
                date.getUTCDate(),
                date.getUTCHours(),
                date.getUTCMinutes(),
                date.getUTCSeconds()
            );
        }

        var fields = [
            _('主机名'), boardinfo.hostname,
            _('固件版本'), fwVersion,
            _('内核版本'), boardinfo.kernel,
            _('本地时间'), datestr,
            _('在线时间'), systeminfo.uptime ? '%t'.format(systeminfo.uptime) : null,
            _('负载'), Array.isArray(systeminfo.load) ? '%.2f, %.2f, %.2f'.format(
                systeminfo.load[0] / 65535.0,
                systeminfo.load[1] / 65535.0,
                systeminfo.load[2] / 65535.0
            ) : null,
            _('在线连接数'), connStr
        ];

        var table = E('table', { 'class': 'table bc-ad-overview-system-table' });
        for (var i = 0; i < fields.length; i += 2) {
            var valueCell = (fields[i + 1] != null) ? fields[i + 1] : '?';
            if (fields[i] === _('在线连接数') && valueCell !== '?') {
                table.appendChild(E('tr', { 'class': 'tr' }, [
                    E('td', { 'class': 'td left', 'width': '33%' }, [fields[i]]),
                    E('td', { 'class': 'td left' }, [valueCell])
                ]));
            } else {
                table.appendChild(E('tr', { 'class': 'tr' }, [
                    E('td', { 'class': 'td left', 'width': '33%' }, [fields[i]]),
                    E('td', { 'class': 'td left' }, [(fields[i + 1] != null) ? fields[i + 1] : '?'])
                ]));
            }
        }
        return table;
    }
};

var MemoryModule = {
    title: _('内存'),
    load: function () {
        return L.resolveDefault(callSystemInfo(), {});
    },
    render: function (systeminfo) {
        var mem = L.isObject(systeminfo.memory) ? systeminfo.memory : {},
            swap = L.isObject(systeminfo.swap) ? systeminfo.swap : {};

        var fields = [
            _('总可用量'), (mem.available) ? mem.available : (mem.total && mem.free && mem.buffered) ? mem.free + mem.buffered : null, mem.total,
            _('已使用量'), (mem.total && mem.free) ? (mem.total - mem.free) : null, mem.total,
        ];

        if (mem.buffered) {
            fields.push(_('缓冲区'), mem.buffered, mem.total);
        }
        if (mem.cached) {
            fields.push(_('缓存'), mem.cached, mem.total);
        }
        if (swap.total > 0) {
            fields.push(_('Swap free'), swap.free, swap.total);
        }

        var table = E('table', { 'class': 'table' });
        for (var i = 0; i < fields.length; i += 3) {
            var useReverseTone = (fields[i] === _('总可用量'));
            table.appendChild(E('tr', { 'class': 'tr' }, [
                E('td', { 'class': 'td left', 'width': '24%' }, [fields[i]]),
                E('td', { 'class': 'td left' }, [
                    (fields[i + 1] != null) ? memoryProgressbar(fields[i + 1], fields[i + 2], true, useReverseTone) : '?'
                ])
            ]));
        }
        return table;
    }
};

var StorageChartModule = {
    title: _('存储'),
    load: function () {
        return L.resolveDefault(callSystemInfo(), {});
    },
    drawPieChart: function (ctx, x, y, radius, used, total, title) {
        var percentage = total > 0 ? (used / total) * 100 : 0;
        var remaining = total - used;

        ctx.clearRect(x - radius - 5, y - radius - 5, radius * 2 + 10, radius * 2 + 10);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = '#2a2e36';
        ctx.lineWidth = 1;
        ctx.stroke();

        if (used > 0) {
            var startAngle = -Math.PI / 2;
            var endAngle = startAngle + (2 * Math.PI * (used / total));

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.arc(x, y, radius, startAngle, endAngle);
            ctx.closePath();

            if (percentage <= 50) {
                ctx.fillStyle = '#48bb78';
            } else if (percentage <= 80) {
                ctx.fillStyle = '#ffa726';
            } else {
                ctx.fillStyle = '#ff6b6b';
            }

            ctx.fill();

            if (percentage > 5) {
                ctx.beginPath();
                ctx.arc(x, y, radius, startAngle, endAngle);
                ctx.lineTo(x, y);
                ctx.closePath();
                ctx.strokeStyle = '#1d2026';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }

        ctx.font = 'bold 16px sans-serif';
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(percentage.toFixed(1) + '%', x, y);

        ctx.font = '13px sans-serif';
        ctx.fillStyle = '#cfe6ff';
        ctx.fillText(title, x, y + radius + 20);

        ctx.font = '12px sans-serif';
        var usedFormatted = String.format('%1024.2mB', used);
        var totalFormatted = String.format('%1024.2mB', total);
        ctx.fillText(usedFormatted + ' / ' + totalFormatted, x, y + radius + 35);
    },
    createChart: function (canvasId, used, total, title) {
        var canvas = E('canvas', {
            'id': canvasId,
            'width': 250,
            'height': 180,
            'style': 'max-width: 100%; height: auto;'
        });

        Promise.resolve().then(function () {
            var ctx = canvas.getContext('2d');
            if (ctx) {
                var radius = Math.min(canvas.width, canvas.height) * 0.25;
                var centerX = canvas.width / 2;
                var centerY = canvas.height / 2 - 5;

                StorageChartModule.drawPieChart(ctx, centerX, centerY, radius, used, total, title);
            }
        });

        return canvas;
    },
    render: function (systeminfo) {
        var root = L.isObject(systeminfo.root) ? systeminfo.root : {};
        var tmp = L.isObject(systeminfo.tmp) ? systeminfo.tmp : {};

        if (!root.total || !tmp.total) {
            return E('div', { 'class': 'chart-container' }, [
                E('p', { 'style': 'color: #a0aec0; text-align: center;' }, _('没有可用的存储数据'))
            ]);
        }

        var container = E('div', { 'class': 'chart-container' }, [
            E('div', { 'class': 'chart-row' }, [
                E('div', { 'class': 'chart-item' }, [
                    this.createChart('rootChart', root.used * 1024, root.total * 1024, _('磁盘空间'))
                ]),
                E('div', { 'class': 'chart-item' }, [
                    this.createChart('tmpChart', tmp.used * 1024, tmp.total * 1024, _('临时空间'))
                ])
            ])
        ]);

        return container;
    }
};

var DSLModule = {
    title: _('DSL'),
    load: function () {
        if (!L.hasSystemFeature('dsl')) {
            return Promise.reject();
        }
        return L.resolveDefault(callDSLMetrics(), {});
    },
    renderDSLBox: function (dsl) {
        return E('div', { class: 'ifacebox' }, [
            E('div', { class: 'ifacebox-head center ' + (dsl.up ? 'active' : '') },
                E('strong', _('DSL Status'))),
            E('div', { class: 'ifacebox-body left' }, [
                L.itemlist(E('span'), [
                    _('Line State'), dsl.state || '-',
                    _('Line Mode'), dsl.mode || '-',
                    _('Line Uptime'), '%t'.format(dsl.uptime),
                    _('Annex'), dsl.annex || '-',
                    _('Data Rate'), '%1000.3mb/s / %1000.3mb/s'.format(dsl.downstream.data_rate, dsl.upstream.data_rate),
                    _('Max. Attainable Data Rate (ATTNDR)'), '%1000.3mb/s / %1000.3mb/s'.format(dsl.downstream.attndr, dsl.upstream.attndr),
                    _('Latency'), '%.2f ms / %.2f ms'.format(dsl.downstream.interleave_delay / 1000, dsl.upstream.interleave_delay / 1000),
                    _('Line Attenuation (LATN)'), '%.2f dB / %.2f dB'.format(dsl.downstream.latn, dsl.upstream.latn),
                    _('Signal Attenuation (SATN)'), '%.2f dB / %.2f dB'.format(dsl.downstream.satn, dsl.upstream.satn),
                    _('Noise Margin (SNR)'), '%.2f dB / %.2f dB'.format(dsl.downstream.snrm, dsl.upstream.snrm),
                    _('Aggregate Transmit Power (ACTATP)'), '%.2f dB / %.2f dB'.format(dsl.downstream.actatp, dsl.upstream.actatp),
                    _('Forward Error Correction Seconds (FECS)'), '%d / %d'.format(dsl.errors.near.fecs, dsl.errors.far.fecs),
                    _('Errored seconds (ES)'), '%d / %d'.format(dsl.errors.near.es, dsl.errors.far.es),
                    _('Severely Errored Seconds (SES)'), '%d / %d'.format(dsl.errors.near.ses, dsl.errors.far.ses),
                    _('Loss of Signal Seconds (LOSS)'), '%d / %d'.format(dsl.errors.near.loss, dsl.errors.far.loss),
                    _('Unavailable Seconds (UAS)'), '%d / %d'.format(dsl.errors.near.uas, dsl.errors.far.uas),
                    _('Header Error Code Errors (HEC)'), '%d / %d'.format(dsl.errors.near.hec, dsl.errors.far.hec),
                    _('Non Pre-emptive CRC errors (CRC_P)'), '%d / %d'.format(dsl.errors.near.crc_p, dsl.errors.far.crc_p),
                    _('Pre-emptive CRC errors (CRCP_P)'), '%d / %d'.format(dsl.errors.near.crcp_p, dsl.errors.far.crcp_p),
                    _('ATU-C System Vendor ID'), dsl.atu_c.vendor || dsl.atu_c.vendor_id,
                    _('Power Management Mode'), dsl.power_state
                ])
            ])
        ]);
    },
    render: function (dsl) {
        if (!dsl.state)
            return null;
        return E('div', { 'id': 'dsl_status_table', 'class': 'network-status-table' }, this.renderDSLBox(dsl));
    }
};

return view.extend({
    load: function () {
        this.modules = [
            SystemModule,
            StorageChartModule,
            MemoryModule,
            DSLModule
        ];

        return Promise.resolve(this.modules);
    },

    render: function (modules) {
        var rv = E([]);
        var containers = [];
        var rowContainer = E('div', { 'class': 'row-container' });
        var systemContainer = E('div');
        var systemSection = E('div', { 'class': 'cbi-section left-section', 'style': 'display:none' }, [
            E('h3', modules[0].title),
            systemContainer
        ]);

        var storageContainer = E('div');
        var storageSection = E('div', { 'class': 'cbi-section right-section', 'style': 'display:none' }, [
            E('h3', modules[1].title),
            storageContainer
        ]);

        rowContainer.appendChild(systemSection);
        rowContainer.appendChild(storageSection);
        rv.appendChild(rowContainer);

        containers[0] = systemContainer;
        containers[1] = storageContainer;

        for (var i = 2; i < modules.length; i++) {
            var title = modules[i].title;
            var container = E('div');
            var sectionClass = 'cbi-section';
            if (modules[i] === MemoryModule) {
                sectionClass += ' memory-section';
            }

            if (title && title !== '') {
                rv.appendChild(E('div', { 'class': sectionClass, 'style': 'display:none' }, [
                    E('h3', title),
                    container
                ]));
            } else {
                rv.appendChild(E('div', { 'class': sectionClass, 'style': 'display:none' }, [
                    container
                ]));
            }
            containers.push(container);
        }

        return this.startPolling(modules, containers).then(function () {
            return rv;
        });
    },

    startPolling: function (includes, containers) {
        var step = function () {
            return network.flushCache().then(function () {
                return invokeIncludesLoad(includes);
            }).then(function (results) {
                for (var i = 0; i < includes.length; i++) {
                    var content = null;

                    if (includes[i].failed) {
                        continue;
                    }

                    if (typeof (includes[i].render) == 'function') {
                        content = includes[i].render(results ? results[i] : null);
                    } else if (includes[i].content != null) {
                        content = includes[i].content;
                    }

                    if (content != null) {
                        if (containers[i] && containers[i].parentNode) {
                            containers[i].parentNode.style.display = '';
                            containers[i].parentNode.classList.add('fade-in');
                            dom.content(containers[i], content);
                        }
                    }
                }

                var ssi = document.querySelector('div.includes');
                if (ssi) {
                    ssi.style.display = '';
                    ssi.classList.add('fade-in');
                }
            });
        };

        return step().then(function () {
            poll.add(step, 5);
        });
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
