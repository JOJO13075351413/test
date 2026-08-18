'use strict';

'require view';
'require dom';
'require poll';
'require request';
'require ui';
'require rpc';
'require network';
'require fs'

var callLuciRealtimeStats = rpc.declare({
    object: 'luci',
    method: 'getRealtimeStats',
    params: ['mode', 'device'],
    expect: { result: [] }
});

var callLuciConntrackList = rpc.declare({
    object: 'luci',
    method: 'getConntrackList',
    expect: { result: [] }
});

var callNetworkRrdnsLookup = rpc.declare({
    object: 'network.rrdns',
    method: 'lookup',
    params: ['addrs', 'timeout', 'limit'],
    expect: { '': {} }
});

var graphPollsBandwidth = [];
var graphPollsConnections = [];
var graphPollsLoad = [];
var pollInterval = 3;

var dns_cache = {};
var enableLookups = false;
var recheck_lookup_queue = {};

Math.log2 = Math.log2 || function (x) {
    return Math.log(x) * Math.LOG2E;
};

function loadSVG(src) {
    return request.get(src).then(function (response) {
        if (!response.ok) {
            throw new Error(response.statusText);
        }
        return E('div', {
            'style': 'width:100%;height:300px;border:1px solid #e9dfd5;background:#ffffff;box-sizing:border-box'
        }, E(response.text()));
    });
}

function rate(n, br) {
    n = (n || 0).toFixed(2);
    return [
        '%1024.2mbit/s'.format(n * 8),
        br ? E('br') : ' ',
        '(%1024.2mB/s)'.format(n)
    ];
}

function updateGraphBandwidth(ifname, svg, lines, cb) {
    var G = svg.firstElementChild;
    var viewNode = document.querySelector('#view');

    var width = viewNode.offsetWidth - 2;
    var height = 300 - 2;
    var step = 5;

    var data_wanted = Math.floor(width / step);

    var data_values = [];
    var info = {
        line_current: [],
        line_average: [],
        line_peak: []
    };

    for (var i = 0; i < lines.length; i++) {
        if (lines[i] != null) {
            data_values.push([]);
        }
    }

    for (var di = 0; di < data_values.length; di++) {
        for (var j = 0; j < data_wanted; j++) {
            data_values[di][j] = 0;
        }
    }

    for (var x = width % (step * 60); x < width; x += step * 60) {
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x);
        line.setAttribute('y1', 0);
        line.setAttribute('x2', x);
        line.setAttribute('y2', '100%');
        line.setAttribute('style', 'stroke:white;stroke-width:0.2');

        var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x + 5);
        text.setAttribute('y', 15);
        text.setAttribute('style', 'fill:#3d434c; font-size:9pt; font-family:sans-serif; text-shadow:1px 1px 1px #fff');
        text.appendChild(document.createTextNode(Math.round((width - x) / step / 60) + 'm'));

        G.appendChild(line);
        G.appendChild(text);
    }

    info.interval = pollInterval;
    info.timeframe = data_wanted / 60;

    graphPollsBandwidth.push({
        ifname: ifname,
        svg: svg,
        lines: lines,
        cb: cb,
        info: info,
        width: width,
        height: height,
        step: step,
        values: data_values,
        timestamp: 0,
        fill: 1
    });
}

function pollDataBandwidth() {
    poll.add(function () {
        var tasks = [];

        for (var i = 0; i < graphPollsBandwidth.length; i++) {
            var ctx = graphPollsBandwidth[i];
            tasks.push(L.resolveDefault(callLuciRealtimeStats('interface', ctx.ifname), []));
        }

        return Promise.all(tasks).then(function (datasets) {
            for (var gi = 0; gi < graphPollsBandwidth.length; gi++) {
                var ctx = graphPollsBandwidth[gi];
                var data = datasets[gi];
                var values = ctx.values;
                var lines = ctx.lines;
                var info = ctx.info;

                var data_wanted = Math.floor(ctx.width / ctx.step);
                var last_timestamp = NaN;

                for (var li = 0, di = 0; di < lines.length; di++) {
                    if (lines[di] == null) {
                        continue;
                    }

                    var multiply = (lines[di].multiply != null) ? lines[di].multiply : 1;
                    var offset = (lines[di].offset != null) ? lines[di].offset : 0;

                    for (var j = ctx.timestamp ? 0 : 1; j < data.length; j++) {
                        if (data[j][0] <= ctx.timestamp) {
                            continue;
                        }

                        if (li === 0) {
                            ctx.fill++;
                            last_timestamp = data[j][0];
                        }

                        if (lines[di].counter) {
                            if (j > 0) {
                                var time_delta = data[j][0] - data[j - 1][0];
                                if (time_delta) {
                                    info.line_current[li] = (data[j][di + 1] * multiply - data[j - 1][di + 1] * multiply) / time_delta;
                                    info.line_current[li] -= Math.min(info.line_current[li], offset);
                                    values[li].push(info.line_current[li]);
                                }
                            }
                        } else {
                            info.line_current[li] = data[j][di + 1] * multiply;
                            info.line_current[li] -= Math.min(info.line_current[li], offset);
                            values[li].push(info.line_current[li]);
                        }
                    }

                    li++;
                }

                ctx.fill = Math.min(ctx.fill, data_wanted);

                for (var vi = 0; vi < values.length; vi++) {
                    var len = values[vi].length;
                    values[vi] = values[vi].slice(len - data_wanted, len);

                    info.line_peak[vi] = NaN;
                    info.line_average[vi] = 0;

                    for (var j2 = 0; j2 < values[vi].length; j2++) {
                        info.line_peak[vi] = isNaN(info.line_peak[vi]) ? values[vi][j2] :
                            Math.max(info.line_peak[vi], values[vi][j2]);
                        info.line_average[vi] += values[vi][j2];
                    }

                    info.line_average[vi] = info.line_average[vi] / ctx.fill;
                }

                info.peak = Math.max.apply(Math, info.line_peak);

                if (!isNaN(last_timestamp)) {
                    ctx.timestamp = last_timestamp;
                }

                var size = Math.floor(Math.log2(info.peak));
                var div = Math.pow(2, size - (size % 10));
                var mult = info.peak / div;
                mult = (mult < 5) ? 2 : ((mult < 50) ? 10 : ((mult < 500) ? 100 : 1000));

                info.peak = info.peak + (mult * div) - (info.peak % (mult * div));

                var data_scale = ctx.height / info.peak;

                for (var di2 = 0, li2 = 0; di2 < lines.length; di2++) {
                    if (lines[di2] == null) {
                        continue;
                    }

                    var el = ctx.svg.firstElementChild.getElementById(lines[di2].line);
                    var pt = '0,' + ctx.height;
                    var y = 0;

                    if (!el) {
                        li2++;
                        continue;
                    }

                    for (var j3 = 0; j3 < values[li2].length; j3++) {
                        var x = j3 * ctx.step;
                        y = ctx.height - Math.floor(values[li2][j3] * data_scale);
                        y = isNaN(y) ? ctx.height : y;
                        pt += ' ' + x + ',' + y;
                    }

                    pt += ' ' + ctx.width + ',' + y + ' ' + ctx.width + ',' + ctx.height;
                    el.setAttribute('points', pt);

                    li2++;
                }

                info.label_25 = 0.25 * info.peak;
                info.label_50 = 0.50 * info.peak;
                info.label_75 = 0.75 * info.peak;

                if (typeof ctx.cb === 'function') {
                    ctx.cb(ctx.svg, info);
                }
            }
        });
    }, pollInterval);
}

function buildGraphIfaceSingleSelect(current, options) {
    var opts = Array.isArray(options) ? options.slice() : [];
    var value = (opts.indexOf(current) >= 0) ? current : (opts[0] || '');
    if (!window.adComponents || typeof window.adComponents.createSingleSelect !== 'function') {
        throw new Error('adComponents.createSingleSelect is not available');
    }
    var select = window.adComponents.createSingleSelect({
        options: opts.map(function (name) { return { value: String(name), label: String(name) }; }),
        value: value,
        placeholder: _('请选择'),
        styleVars: {
            '--adui-ss-min-width': '180px',
            '--adui-ss-bg': '#ffffff',
            '--adui-ss-border': '#e9dfd5',
            '--adui-ss-text': '#3d434c',
            '--adui-ss-placeholder': '#968a80',
            '--adui-ss-arrow-color': '#968a80',
            '--adui-ss-menu-border': '#e9dfd5',
            '--adui-ss-menu-bg': '#ffffff',
            '--adui-ss-menu-text': '#3d434c',
            '--adui-ss-menu-hover-bg': '#fff4ec',
            '--adui-ss-menu-selected-bg': '#ffe3cd'
        }
    });
    select.onChange(function () {
        try {
            select.root.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) { }
    });

    return {
        root: select.root,
        getValue: function () {
            return String(select.get() || '');
        },
        setValue: function (v) {
            var nv = String(v || '');
            select.set((opts.indexOf(nv) >= 0) ? nv : (opts[0] || ''));
        }
    };
}

function createBandwidthView(svg, devs) {
    var tabsContainer = E('div', {});
    var v = E('div', {}, [
        tabsContainer
    ]);

    var firstIfname = null;
    var ifaceNames = [];

    for (var i = 0; i < devs.length; i++) {
        var ifname = devs[i].getName();
        if (!ifname) {
            continue;
        }

        var csvg = svg.cloneNode(true);

        tabsContainer.appendChild(E('div', {
            'data-tab': ifname,
            'data-tab-title': ifname
        }, [
            csvg,
            E('div', { 'class': 'right' }, E('small', { 'id': 'scale' }, '-')),
            E('br'),
            E('table', { 'class': 'table', 'style': 'width:100%;table-layout:fixed' }, [
                E('tr', { 'class': 'tr' }, [
                    E('td', { 'class': 'td right top' },
                        E('strong', { 'style': 'border-bottom:2px solid #f08a4d' }, [_('入站:')])),
                    E('td', { 'class': 'td', 'id': 'rx_bw_cur' }, rate(0, true)),
                    E('td', { 'class': 'td right top' }, E('strong', {}, [_('平均值:')])),
                    E('td', { 'class': 'td', 'id': 'rx_bw_avg' }, rate(0, true)),
                    E('td', { 'class': 'td right top' }, E('strong', {}, [_('峰值:')])),
                    E('td', { 'class': 'td', 'id': 'rx_bw_peak' }, rate(0, true))
                ]),
                E('tr', { 'class': 'tr' }, [
                    E('td', { 'class': 'td right top' },
                        E('strong', { 'style': 'border-bottom:2px solid #8be18b' }, [_('出站:')])),
                    E('td', { 'class': 'td', 'id': 'tx_bw_cur' }, rate(0, true)),
                    E('td', { 'class': 'td right top' }, E('strong', {}, [_('平均值:')])),
                    E('td', { 'class': 'td', 'id': 'tx_bw_avg' }, rate(0, true)),
                    E('td', { 'class': 'td right top' }, E('strong', {}, [_('峰值:')])),
                    E('td', { 'class': 'td', 'id': 'tx_bw_peak' }, rate(0, true))
                ])
            ])
        ]));

        if (!firstIfname) {
            firstIfname = ifname;
        }
        ifaceNames.push(ifname);

        updateGraphBandwidth(ifname, csvg, [
            { line: 'rx', counter: true },
            null,
            { line: 'tx', counter: true }
        ], function (svgNode, info) {
            var G = svgNode.firstElementChild;
            var tab = svgNode ? svgNode.parentNode : null;

            if (!tab) {
                return;
            }

            G.getElementById('label_25').firstChild.data = rate(info.label_25).join('');
            G.getElementById('label_50').firstChild.data = rate(info.label_50).join('');
            G.getElementById('label_75').firstChild.data = rate(info.label_75).join('');

            tab.querySelector('#scale').firstChild.data =
                _('(%d 分钟窗口, %d 秒刷新间隔)').format(info.timeframe, info.interval);

            dom.content(tab.querySelector('#rx_bw_cur'), rate(info.line_current[0], true));
            dom.content(tab.querySelector('#rx_bw_avg'), rate(info.line_average[0], true));
            dom.content(tab.querySelector('#rx_bw_peak'), rate(info.line_peak[0], true));

            dom.content(tab.querySelector('#tx_bw_cur'), rate(info.line_current[1], true));
            dom.content(tab.querySelector('#tx_bw_avg'), rate(info.line_average[1], true));
            dom.content(tab.querySelector('#tx_bw_peak'), rate(info.line_peak[1], true));
        });
    }

    ui.tabs.initTabGroup(tabsContainer.childNodes);

    var anchorMap = {};
    var tabmenu = v.querySelector('ul.cbi-tabmenu');

    if (tabmenu) {
        var anchors = tabmenu.querySelectorAll('a');
        for (var j = 0; j < anchors.length; j++) {
            var a = anchors[j];
            var name = (a.textContent || a.innerText || '').trim();
            if (name) {
                anchorMap[name] = a;
            }
        }
    }

    var selectWrap = E('div', { 'class': 'ns-if-select-wrap' });
    var ifaceSelect = buildGraphIfaceSingleSelect(firstIfname, ifaceNames);
    selectWrap.appendChild(ifaceSelect.root);

    function switchIfname(name) {
        var a = anchorMap[name];
        if (a) {
            a.click();
        }
    }

    ifaceSelect.root.addEventListener('change', function () {
        var current = ifaceSelect.getValue();
        switchIfname(current);
    });

    if (firstIfname) {
        ifaceSelect.setValue(firstIfname);
        switchIfname(firstIfname);
    }

    if (tabmenu && tabmenu.parentNode) {
        tabmenu.parentNode.insertBefore(selectWrap, tabmenu);
    } else {
        v.insertBefore(selectWrap, v.firstChild);
    }

    pollDataBandwidth();

    return v;
}

function updateGraphConnections(svg, lines, cb) {
    var G = svg.firstElementChild;
    var viewNode = document.querySelector('#view');

    var width = viewNode.offsetWidth - 2;
    var height = 300 - 2;
    var step = 5;

    var data_wanted = Math.floor(width / step);

    var data_values = [];
    var info = {
        line_current: [],
        line_average: [],
        line_peak: []
    };

    for (var i = 0; i < lines.length; i++) {
        if (lines[i] != null) {
            data_values.push([]);
        }
    }

    for (var di = 0; di < data_values.length; di++) {
        for (var j = 0; j < data_wanted; j++) {
            data_values[di][j] = 0;
        }
    }

    for (var x = width % (step * 60); x < width; x += step * 60) {
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x);
        line.setAttribute('y1', 0);
        line.setAttribute('x2', x);
        line.setAttribute('y2', '100%');
        line.setAttribute('style', 'stroke:white;stroke-width:0.2');

        var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x + 5);
        text.setAttribute('y', 15);
        text.setAttribute('style', 'fill:#3d434c; font-size:9pt; font-family:sans-serif; text-shadow:1px 1px 1px #fff');
        text.appendChild(document.createTextNode(Math.round((width - x) / step / 60) + 'm'));

        G.appendChild(line);
        G.appendChild(text);
    }

    info.interval = pollInterval;
    info.timeframe = data_wanted / 60;

    graphPollsConnections.push({
        svg: svg,
        lines: lines,
        cb: cb,
        info: info,
        width: width,
        height: height,
        step: step,
        values: data_values,
        timestamp: 0,
        fill: 1
    });
}

function updateConntrack(conn) {
    var lookup_queue = [];
    var rows = [];

    conn.sort(function (a, b) {
        return b.bytes - a.bytes;
    });

    for (var i = 0; i < conn.length; i++) {
        var c = conn[i];

        if ((c.src === '127.0.0.1' && c.dst === '127.0.0.1') ||
            (c.src === '::1' && c.dst === '::1')) {
            continue;
        }

        if (!dns_cache[c.src] && lookup_queue.indexOf(c.src) === -1) {
            lookup_queue.push(c.src);
        }

        if (!dns_cache[c.dst] && lookup_queue.indexOf(c.dst) === -1) {
            lookup_queue.push(c.dst);
        }

        var src = dns_cache[c.src] || (c.layer3 === 'ipv6' ? '[' + c.src + ']' : c.src);
        var dst = dns_cache[c.dst] || (c.layer3 === 'ipv6' ? '[' + c.dst + ']' : c.dst);

        rows.push([
            c.layer3.toUpperCase(),
            c.layer4.toUpperCase(),
            '%h'.format(c.hasOwnProperty('sport') ? (src + ':' + c.sport) : src),
            '%h'.format(c.hasOwnProperty('dport') ? (dst + ':' + c.dport) : dst),
            '%1024.2mB (%d %s)'.format(c.bytes, c.packets, _('Pkts.'))
        ]);
    }

    cbi_update_table('#connections', rows, E('em', _('No information available')));

    if (enableLookups && lookup_queue.length > 0) {
        var reduced_lookup_queue = lookup_queue;
        if (lookup_queue.length > 100) {
            reduced_lookup_queue = lookup_queue.slice(0, 100);
        }

        callNetworkRrdnsLookup(reduced_lookup_queue, 5000, 1000).then(function (replies) {
            for (var index in reduced_lookup_queue) {
                var address = reduced_lookup_queue[index];
                if (!address) {
                    continue;
                }

                if (replies[address]) {
                    dns_cache[address] = replies[address];
                    lookup_queue.splice(reduced_lookup_queue.indexOf(address), 1);
                    continue;
                }

                if (recheck_lookup_queue[address] > 2) {
                    dns_cache[address] = (address.match(/:/)) ? '[' + address + ']' : address;
                    lookup_queue.splice(index, 1);
                } else {
                    recheck_lookup_queue[address] = (recheck_lookup_queue[address] || 0) + 1;
                }
            }

            var btn = document.querySelector('.btn.toggle-lookups');
            if (btn) {
                btn.firstChild.data = enableLookups ?
                    _('禁用 DNS 查询') :
                    _('启用 DNS 查询');
                btn.classList.remove('spinning');
                btn.disabled = false;
            }
        });
    }
}

function pollDataConnections() {
    poll.add(function () {
        var tasks = [
            L.resolveDefault(callLuciConntrackList(), [])
        ];

        for (var i = 0; i < graphPollsConnections.length; i++) {
            tasks.push(L.resolveDefault(callLuciRealtimeStats('conntrack'), []));
        }

        return Promise.all(tasks).then(function (datasets) {
            updateConntrack(datasets[0]);

            for (var gi = 0; gi < graphPollsConnections.length; gi++) {
                var ctx = graphPollsConnections[gi];
                var data = datasets[gi + 1];
                var values = ctx.values;
                var lines = ctx.lines;
                var info = ctx.info;

                var data_wanted = Math.floor(ctx.width / ctx.step);
                var last_timestamp = NaN;

                for (var li = 0, di = 0; di < lines.length; di++) {
                    if (lines[di] == null) {
                        continue;
                    }

                    var multiply = (lines[di].multiply != null) ? lines[di].multiply : 1;
                    var offset = (lines[di].offset != null) ? lines[di].offset : 0;

                    for (var j = ctx.timestamp ? 0 : 1; j < data.length; j++) {
                        if (data[j][0] <= ctx.timestamp) {
                            continue;
                        }

                        if (li === 0) {
                            ctx.fill++;
                            last_timestamp = data[j][0];
                        }

                        info.line_current[li] = data[j][di + 1] * multiply;
                        info.line_current[li] -= Math.min(info.line_current[li], offset);
                        values[li].push(info.line_current[li]);
                    }

                    li++;
                }

                ctx.fill = Math.min(ctx.fill, data_wanted);

                for (var vi = 0; vi < values.length; vi++) {
                    var len = values[vi].length;
                    values[vi] = values[vi].slice(len - data_wanted, len);

                    info.line_peak[vi] = NaN;
                    info.line_average[vi] = 0;

                    for (var j2 = 0; j2 < values[vi].length; j2++) {
                        info.line_peak[vi] = isNaN(info.line_peak[vi]) ? values[vi][j2] :
                            Math.max(info.line_peak[vi], values[vi][j2]);
                        info.line_average[vi] += values[vi][j2];
                    }

                    info.line_average[vi] = info.line_average[vi] / ctx.fill;
                }

                info.peak = Math.max.apply(Math, info.line_peak);

                if (!isNaN(last_timestamp)) {
                    ctx.timestamp = last_timestamp;
                }

                var size = Math.floor(Math.log2(info.peak));
                var div = Math.pow(2, size - (size % 10));
                var mult = info.peak / div;
                mult = (mult < 5) ? 2 : ((mult < 50) ? 10 : ((mult < 500) ? 100 : 1000));

                info.peak = info.peak + (mult * div) - (info.peak % (mult * div));

                var data_scale = ctx.height / info.peak;

                for (var di2 = 0, li2 = 0; di2 < lines.length; di2++) {
                    if (lines[di2] == null) {
                        continue;
                    }

                    var el = ctx.svg.firstElementChild.getElementById(lines[di2].line);
                    var pt = '0,' + ctx.height;
                    var y = 0;

                    if (!el) {
                        li2++;
                        continue;
                    }

                    for (var j3 = 0; j3 < values[li2].length; j3++) {
                        var x = j3 * ctx.step;
                        y = ctx.height - Math.floor(values[li2][j3] * data_scale);
                        y = isNaN(y) ? ctx.height : y;
                        pt += ' ' + x + ',' + y;
                    }

                    pt += ' ' + ctx.width + ',' + y + ' ' + ctx.width + ',' + ctx.height;
                    el.setAttribute('points', pt);

                    li2++;
                }

                info.label_25 = 0.25 * info.peak;
                info.label_50 = 0.50 * info.peak;
                info.label_75 = 0.75 * info.peak;

                if (typeof ctx.cb === 'function') {
                    ctx.cb(ctx.svg, info);
                }
            }
        });
    }, pollInterval);
}

function createConnectionsView(svg) {
    var v = E([], [
        svg,
        E('div', { 'class': 'right' }, E('small', { 'id': 'scale' }, '-')),
        E('br'),
        E('table', { 'class': 'table', 'style': 'width:100%;table-layout:fixed' }, [
            E('tr', { 'class': 'tr' }, [
                E('td', { 'class': 'td right top' }, E('strong', { 'style': 'border-bottom:2px solid #f08a4d' }, [_('UDP:')])),
                E('td', { 'class': 'td', 'id': 'lb_udp_cur' }, ['0']),
                E('td', { 'class': 'td right top' }, E('strong', {}, [_('平均值:')])),
                E('td', { 'class': 'td', 'id': 'lb_udp_avg' }, ['0']),
                E('td', { 'class': 'td right top' }, E('strong', {}, [_('峰值:')])),
                E('td', { 'class': 'td', 'id': 'lb_udp_peak' }, ['0'])
            ]),
            E('tr', { 'class': 'tr' }, [
                E('td', { 'class': 'td right top' }, E('strong', { 'style': 'border-bottom:2px solid #8be18b' }, [_('TCP:')])),
                E('td', { 'class': 'td', 'id': 'lb_tcp_cur' }, ['0']),
                E('td', { 'class': 'td right top' }, E('strong', {}, [_('平均值:')])),
                E('td', { 'class': 'td', 'id': 'lb_tcp_avg' }, ['0']),
                E('td', { 'class': 'td right top' }, E('strong', {}, [_('峰值:')])),
                E('td', { 'class': 'td', 'id': 'lb_tcp_peak' }, ['0'])
            ]),
            E('tr', { 'class': 'tr' }, [
                E('td', { 'class': 'td right top' }, E('strong', { 'style': 'border-bottom:2px solid #ff9b9b' }, [_('其它:')])),
                E('td', { 'class': 'td', 'id': 'lb_otr_cur' }, ['0']),
                E('td', { 'class': 'td right top' }, E('strong', {}, [_('平均值:')])),
                E('td', { 'class': 'td', 'id': 'lb_otr_avg' }, ['0']),
                E('td', { 'class': 'td right top' }, E('strong', {}, [_('峰值:')])),
                E('td', { 'class': 'td', 'id': 'lb_otr_peak' }, ['0'])
            ])
        ]),
        E('div', { 'class': 'right' }, [
            E('button', {
                'class': 'btn toggle-lookups',
                'click': function (ev) {
                    if (!enableLookups) {
                        ev.currentTarget.classList.add('spinning');
                        ev.currentTarget.disabled = true;
                        enableLookups = true;
                    } else {
                        ev.currentTarget.firstChild.data = _('启用 DNS 查询');
                        enableLookups = false;
                    }
                    this.blur();
                }
            }, [enableLookups ? _('禁用 DNS 查询') : _('启用 DNS 查询')])
        ]),
        E('br'),
        E('div', { 'class': 'cbi-section-node' }, [
            E('table', { 'class': 'table', 'id': 'connections' }, [
                E('tr', { 'class': 'tr table-titles' }, [
                    E('th', { 'class': 'th col-2 hide-xs' }, [_('网络')]),
                    E('th', { 'class': 'th col-2' }, [_('协议')]),
                    E('th', { 'class': 'th col-7' }, [_('源地址')]),
                    E('th', { 'class': 'th col-7' }, [_('目标地址')]),
                    E('th', { 'class': 'th col-4' }, [_('流量')])
                ]),
                E('tr', { 'class': 'tr placeholder' }, [
                    E('td', { 'class': 'td' }, [
                        E('em', {}, [_('Collecting data...')])
                    ])
                ])
            ])
        ])
    ]);

    updateGraphConnections(svg, [
        { line: 'udp' },
        { line: 'tcp' },
        { line: 'other' }
    ], function (svgNode, info) {
        var G = svgNode.firstElementChild;
        var tab = svgNode ? svgNode.parentNode : null;

        if (!tab) {
            return;
        }

        G.getElementById('label_25').firstChild.data = '%d'.format(info.label_25);
        G.getElementById('label_50').firstChild.data = '%d'.format(info.label_50);
        G.getElementById('label_75').firstChild.data = '%d'.format(info.label_75);

        tab.querySelector('#scale').firstChild.data =
            _('(%d 分钟窗口，%d 秒刷新间隔)').format(info.timeframe, info.interval);

        tab.querySelector('#lb_udp_cur').firstChild.data = '%d'.format(info.line_current[0]);
        tab.querySelector('#lb_udp_avg').firstChild.data = '%d'.format(info.line_average[0]);
        tab.querySelector('#lb_udp_peak').firstChild.data = '%d'.format(info.line_peak[0]);

        tab.querySelector('#lb_tcp_cur').firstChild.data = '%d'.format(info.line_current[1]);
        tab.querySelector('#lb_tcp_avg').firstChild.data = '%d'.format(info.line_average[1]);
        tab.querySelector('#lb_tcp_peak').firstChild.data = '%d'.format(info.line_peak[1]);

        tab.querySelector('#lb_otr_cur').firstChild.data = '%d'.format(info.line_current[2]);
        tab.querySelector('#lb_otr_avg').firstChild.data = '%d'.format(info.line_average[2]);
        tab.querySelector('#lb_otr_peak').firstChild.data = '%d'.format(info.line_peak[2]);
    });

    pollDataConnections();

    return v;
}

function updateGraphLoad(svg, lines, cb) {
    var G = svg.firstElementChild;
    var viewNode = document.querySelector('#view');

    var width = viewNode.offsetWidth - 2;
    var height = 300 - 2;
    var step = 5;

    var data_wanted = Math.floor(width / step);

    var data_values = [];
    var info = {
        line_current: [],
        line_average: [],
        line_peak: []
    };

    for (var i = 0; i < lines.length; i++) {
        if (lines[i] != null) {
            data_values.push([]);
        }
    }

    for (var di = 0; di < data_values.length; di++) {
        for (var j = 0; j < data_wanted; j++) {
            data_values[di][j] = 0;
        }
    }

    for (var x = width % (step * 60); x < width; x += step * 60) {
        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x);
        line.setAttribute('y1', 0);
        line.setAttribute('x2', x);
        line.setAttribute('y2', '100%');
        line.setAttribute('style', 'stroke:white;stroke-width:0.2');

        var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x + 5);
        text.setAttribute('y', 15);
        text.setAttribute('style', 'fill:#3d434c; font-size:9pt; font-family:sans-serif; text-shadow:1px 1px 1px #fff');
        text.appendChild(document.createTextNode(Math.round((width - x) / step / 60) + 'm'));

        G.appendChild(line);
        G.appendChild(text);
    }

    info.interval = pollInterval;
    info.timeframe = data_wanted / 60;

    graphPollsLoad.push({
        svg: svg,
        lines: lines,
        cb: cb,
        info: info,
        width: width,
        height: height,
        step: step,
        values: data_values,
        timestamp: 0,
        fill: 1
    });
}

function pollDataLoad() {
    poll.add(function () {
        var tasks = [];

        for (var i = 0; i < graphPollsLoad.length; i++) {
            tasks.push(L.resolveDefault(callLuciRealtimeStats('load'), []));
        }

        return Promise.all(tasks).then(function (datasets) {
            for (var gi = 0; gi < graphPollsLoad.length; gi++) {
                var ctx = graphPollsLoad[gi];
                var data = datasets[gi];
                var values = ctx.values;
                var lines = ctx.lines;
                var info = ctx.info;

                var data_wanted = Math.floor(ctx.width / ctx.step);
                var last_timestamp = NaN;

                for (var li = 0, di = 0; di < lines.length; di++) {
                    if (lines[di] == null) {
                        continue;
                    }

                    var multiply = (lines[di].multiply != null) ? lines[di].multiply : 1;
                    var offset = (lines[di].offset != null) ? lines[di].offset : 0;

                    for (var j = ctx.timestamp ? 0 : 1; j < data.length; j++) {
                        if (data[j][0] <= ctx.timestamp) {
                            continue;
                        }

                        if (li === 0) {
                            ctx.fill++;
                            last_timestamp = data[j][0];
                        }

                        info.line_current[li] = data[j][di + 1] * multiply;
                        info.line_current[li] -= Math.min(info.line_current[li], offset);
                        values[li].push(info.line_current[li]);
                    }

                    li++;
                }

                ctx.fill = Math.min(ctx.fill, data_wanted);

                for (var vi = 0; vi < values.length; vi++) {
                    var len = values[vi].length;
                    values[vi] = values[vi].slice(len - data_wanted, len);

                    info.line_peak[vi] = NaN;
                    info.line_average[vi] = 0;

                    for (var j2 = 0; j2 < values[vi].length; j2++) {
                        info.line_peak[vi] = isNaN(info.line_peak[vi]) ? values[vi][j2] :
                            Math.max(info.line_peak[vi], values[vi][j2]);
                        info.line_average[vi] += values[vi][j2];
                    }

                    info.line_average[vi] = info.line_average[vi] / ctx.fill;
                }

                info.peak = Math.max.apply(Math, info.line_peak);

                if (!isNaN(last_timestamp)) {
                    ctx.timestamp = last_timestamp;
                }

                var size = Math.floor(Math.log2(info.peak));
                var div = Math.pow(2, size - (size % 10));
                var mult = info.peak / div;
                mult = (mult < 5) ? 2 : ((mult < 50) ? 10 : ((mult < 500) ? 100 : 1000));

                info.peak = info.peak + (mult * div) - (info.peak % (mult * div));

                var data_scale = ctx.height / info.peak;

                for (var di2 = 0, li2 = 0; di2 < lines.length; di2++) {
                    if (lines[di2] == null) {
                        continue;
                    }

                    var el = ctx.svg.firstElementChild.getElementById(lines[di2].line);
                    var pt = '0,' + ctx.height;
                    var y = 0;

                    if (!el) {
                        li2++;
                        continue;
                    }

                    for (var j3 = 0; j3 < values[li2].length; j3++) {
                        var x = j3 * ctx.step;
                        y = ctx.height - Math.floor(values[li2][j3] * data_scale);
                        y = isNaN(y) ? ctx.height : y;
                        pt += ' ' + x + ',' + y;
                    }

                    pt += ' ' + ctx.width + ',' + y + ' ' + ctx.width + ',' + ctx.height;
                    el.setAttribute('points', pt);

                    li2++;
                }

                info.label_25 = 0.25 * info.peak;
                info.label_50 = 0.50 * info.peak;
                info.label_75 = 0.75 * info.peak;

                if (typeof ctx.cb === 'function') {
                    ctx.cb(ctx.svg, info);
                }
            }
        });
    }, pollInterval);
}

function createLoadView(svg) {
    var v = E([], [
        svg,
        E('div', { 'class': 'right' }, E('small', { 'id': 'scale' }, '-')),
        E('br'),
        E('table', { 'class': 'table', 'style': 'width:100%;table-layout:fixed' }, [
            E('tr', { 'class': 'tr' }, [
                E('td', { 'class': 'td right top' },
                    E('strong', { 'style': 'border-bottom:2px solid #f00' }, [_('1 分钟负载:')])),
                E('td', { 'class': 'td', 'id': 'lb_load01_cur' }, ['0.00']),
                E('td', { 'class': 'td right top' }, E('strong', {}, [_('平均值:')])),
                E('td', { 'class': 'td', 'id': 'lb_load01_avg' }, ['0.00']),
                E('td', { 'class': 'td right top' }, E('strong', {}, [_('峰值:')])),
                E('td', { 'class': 'td', 'id': 'lb_load01_peak' }, ['0.00'])
            ]),
            E('tr', { 'class': 'tr' }, [
                E('td', { 'class': 'td right top' },
                    E('strong', { 'style': 'border-bottom:2px solid #f60' }, [_('5 分钟负载:')])),
                E('td', { 'class': 'td', 'id': 'lb_load05_cur' }, ['0.00']),
                E('td', { 'class': 'td right top' }, E('strong', {}, [_('平均值:')])),
                E('td', { 'class': 'td', 'id': 'lb_load05_avg' }, ['0.00']),
                E('td', { 'class': 'td right top' }, E('strong', {}, [_('峰值:')])),
                E('td', { 'class': 'td', 'id': 'lb_load05_peak' }, ['0.00'])
            ]),
            E('tr', { 'class': 'tr' }, [
                E('td', { 'class': 'td right top' },
                    E('strong', { 'style': 'border-bottom:2px solid #fa0' }, [_('15 分钟负载:')])),
                E('td', { 'class': 'td', 'id': 'lb_load15_cur' }, ['0.00']),
                E('td', { 'class': 'td right top' }, E('strong', {}, [_('平均值:')])),
                E('td', { 'class': 'td', 'id': 'lb_load15_avg' }, ['0.00']),
                E('td', { 'class': 'td right top' }, E('strong', {}, [_('峰值:')])),
                E('td', { 'class': 'td', 'id': 'lb_load15_peak' }, ['0.00'])
            ])
        ])
    ]);

    updateGraphLoad(svg, [
        { line: 'load01' },
        { line: 'load05' },
        { line: 'load15' }
    ], function (svgNode, info) {
        var G = svgNode.firstElementChild;
        var tab = svgNode ? svgNode.parentNode : null;

        if (!tab) {
            return;
        }

        G.getElementById('label_25').firstChild.data = '%.2f'.format(info.label_25 / 100);
        G.getElementById('label_50').firstChild.data = '%.2f'.format(info.label_50 / 100);
        G.getElementById('label_75').firstChild.data = '%.2f'.format(info.label_75 / 100);

        tab.querySelector('#scale').firstChild.data =
            _('(%d 分钟窗口，%d 秒刷新间隔)').format(info.timeframe, info.interval);

        tab.querySelector('#lb_load01_cur').firstChild.data = '%.2f'.format(info.line_current[0] / 100);
        tab.querySelector('#lb_load01_avg').firstChild.data = '%.2f'.format(info.line_average[0] / 100);
        tab.querySelector('#lb_load01_peak').firstChild.data = '%.2f'.format(info.line_peak[0] / 100);

        tab.querySelector('#lb_load05_cur').firstChild.data = '%.2f'.format(info.line_current[1] / 100);
        tab.querySelector('#lb_load05_avg').firstChild.data = '%.2f'.format(info.line_average[1] / 100);
        tab.querySelector('#lb_load05_peak').firstChild.data = '%.2f'.format(info.line_peak[1] / 100);

        tab.querySelector('#lb_load15_cur').firstChild.data = '%.2f'.format(info.line_current[2] / 100);
        tab.querySelector('#lb_load15_avg').firstChild.data = '%.2f'.format(info.line_average[2] / 100);
        tab.querySelector('#lb_load15_peak').firstChild.data = '%.2f'.format(info.line_peak[2] / 100);
    });

    pollDataLoad();

    return v;
}

function loadCssOnce(href) {
    return new Promise(function (resolve, reject) {
        var id = 'ad-css-' + btoa(href).replace(/=+/g, '');
        var exist = document.getElementById(id);
        if (exist) {
            resolve();
            return;
        }

        var link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = href;

        link.onload = function () {
            resolve();
        };
        link.onerror = function () {
            reject(new Error('Failed to load css ' + href));
        };

        document.head.appendChild(link);
    });
}

return view.extend({
    load: function () {
        return Promise.all([
            loadSVG(L.resource('svg/bandwidth.svg')),
            network.getDevices(),
            L.resolveDefault(fs.list('/sys/class/net'), []),
            loadSVG(L.resource('svg/connections.svg')),
            loadSVG(L.resource('svg/load.svg')),
            loadCssOnce('/luci-static/custom/css/status/graph.css'),
            loadScriptOnce('/luci-static/custom/js/components.js')
        ]);
    },

    render: function (data) {
        var svgBandwidth = data[0];
        var devs = data[1];
        var sysIfs = data[2];
        var svgConnections = data[3];
        var svgLoad = data[4];

        var sysSet = new Set();
        if (Array.isArray(sysIfs)) {
            sysIfs.forEach(function (it) {
                if (typeof it === 'string') {
                    sysSet.add(it);
                } else if (it && typeof it.name === 'string') {
                    sysSet.add(it.name);
                }
            });
        }
        if (Array.isArray(devs) && sysSet.size > 0) {
            devs = devs.filter(function (d) {
                try {
                    var n = d && d.getName && d.getName();
                    return n && sysSet.has(n);
                } catch (e) {
                    return false;
                }
            });
        }

        var loadView = createLoadView(svgLoad);
        var bandwidthView = createBandwidthView(svgBandwidth, devs);
        var connectionsView = createConnectionsView(svgConnections);

        var tabs = [
            { key: 'load', title: _('负载') },
            { key: 'bandwidth', title: _('接口带宽') },
            { key: 'connections', title: _('在线连接') }
        ];

        var activeTab = 'load';

        var tabsBar = E('div', { 'class': 'ns-subtabs' });
        var pages = {};

        var body = E('div', { 'class': 'ns-graph-body' }, [
            pages.load = E('div', {
                'class': 'ns-graph-page',
                'data-key': 'load'
            }, [loadView]),
            pages.bandwidth = E('div', {
                'class': 'ns-graph-page',
                'data-key': 'bandwidth'
            }, [bandwidthView]),
            pages.connections = E('div', {
                'class': 'ns-graph-page',
                'data-key': 'connections'
            }, [connectionsView])
        ]);

        var tabMap = {};

        tabs.forEach(function (t) {
            var btn = E('div', {
                'class': 'ns-subtab' + (t.key === activeTab ? ' active' : ''),
                'data-key': t.key,
                'click': function () {
                    if (activeTab === t.key) {
                        return;
                    }
                    activeTab = t.key;
                    updateActiveTab();
                }
            }, _(t.title));

            tabsBar.appendChild(btn);

            tabMap[t.key] = {
                btn: btn,
                page: pages[t.key]
            };
        });

        function updateActiveTab() {
            Object.keys(tabMap).forEach(function (k) {
                var item = tabMap[k];
                if (!item) {
                    return;
                }
                if (k === activeTab) {
                    if (item.btn) {
                        item.btn.classList.add('active');
                    }
                    if (item.page) {
                        item.page.style.display = '';
                    }
                } else {
                    if (item.btn) {
                        item.btn.classList.remove('active');
                    }
                    if (item.page) {
                        item.page.style.display = 'none';
                    }
                }
            });
        }

        updateActiveTab();

        var root = E('div', { 'class': 'ns-graph-root' }, [
            tabsBar,
            body
        ]);

        return root;
    },

    handleSaveApply: null,
    handleSave: null,
    handleReset: null
});
