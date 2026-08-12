'use strict';
'require view';
'require ui';
'require rpc';
'require uci';
'require form';
'require firewall as fwmodel';
'require tools.firewall as fwtool';
'require tools.widgets as widgets';
'require ad.firewall_page as fwpage';
'require ad.firewall_rule_text as fwtext';

function rule_proto_txt(s, ctHelpers) {
    var f = (uci.get('firewall', s, 'family') || '').toLowerCase().replace(/^(?:any|\*)$/, '');
    var proto = fwtext.getProtoEntries(s, true);
    var helper = fwtext.getHelperInfo(s, ctHelpers);
    var mark = fwtext.getMarkInfo(s);
    var dscp = fwtext.getDscpInfo(s);

    return fwtool.fmt(_('%{src?%{dest?转发:入站}:出站} %{ipv6?%{ipv4?<var>IPv4</var> and <var>IPv6</var>:<var>IPv6</var>}:<var>IPv4</var>}%{proto?, 协议 %{proto#%{next?, }%{item.types?<var class=\"cbi-tooltip-container\">%{item.name}<span class=\"cbi-tooltip\">具有类型 %{item.types#%{next?, }<var>%{item}</var>} 的 ICMP</span></var>:<var>%{item.name}</var>}}}%{mark?, 标记 <var%{mark.inv? data-tooltip=\"匹配除 %{mark.num}%{mark.mask? 带有掩码 %{mark.mask}} 的 fwmarks。\":%{mark.mask? data-tooltip=\"在比较前使用 %{mark.mask} 掩盖 fwmark 值。\"}}>%{mark.val}</var>}%{dscp?, DSCP %{dscp.inv?<var data-tooltip=\"匹配除 %{dscp.num?:%{dscp.name}} 以外的 DSCP 类型。\">%{dscp.val}</var>:<var>%{dscp.val}</var>}}%{helper?, 助手 %{helper.inv?<var data-tooltip=\"匹配除 &quot;%{helper.name}&quot; 以外的任意助手。\">%{helper.val}</var>:<var data-tooltip=\"%{helper.name}\">%{helper.val}</var>}}'), {
        ipv4: (!f || f == 'ipv4'),
        ipv6: (!f || f == 'ipv6'),
        src: uci.get('firewall', s, 'src'),
        dest: uci.get('firewall', s, 'dest'),
        proto: proto,
        helper: helper,
        mark: mark,
        dscp: dscp
    });
}

function rule_src_txt(s, hosts) {
    var z = uci.get('firewall', s, 'src'),
        d = (uci.get('firewall', s, 'direction') == 'in') ? uci.get('firewall', s, 'device') : null;

    return fwtool.fmt(_('来自 %{src}%{src_device?, 接口 <var>%{src_device}</var>}%{src_ip?, IP %{src_ip#%{next?, }<var%{item.inv? data-tooltip=\"匹配除 %{item.val} 以外的 IP 地址。\"}>%{item.ival}</var>}}%{src_port?, 端口 %{src_port#%{next?, }<var%{item.inv? data-tooltip=\"匹配除 %{item.val} 以外的端口。\"}>%{item.ival}</var>}}%{src_mac?, MAC %{src_mac#%{next?, }<var%{item.inv? data-tooltip=\"匹配除 %{item.val}%{item.hint.name? 或称为 %{item.hint.name}} 以外的 MAC 地址。\":%{item.hint.name? data-tooltip=\"%{item.hint.name}\"}}>%{item.ival}</var>}}'), {
        src: E('span', { 'class': 'zonebadge', 'style': fwmodel.getZoneColorStyle(z) }, [(z == '*') ? E('em', _('any zone')) : (z ? E('strong', z) : E('em', _('this device')))]),
        src_ip: fwtool.map_invert(uci.get('firewall', s, 'src_ip'), 'toLowerCase'),
        src_mac: fwtool.map_invert(uci.get('firewall', s, 'src_mac'), 'toUpperCase').map(function (v) { return Object.assign(v, { hint: hosts[v.val] }) }),
        src_port: fwtool.map_invert(uci.get('firewall', s, 'src_port')),
        src_device: d
    });
}

function rule_dest_txt(s) {
    var z = uci.get('firewall', s, 'dest'),
        d = (uci.get('firewall', s, 'direction') == 'out') ? uci.get('firewall', s, 'device') : null;

    return fwtool.fmt(_('到 %{dest}%{dest_device?, 接口 <var>%{dest_device}</var>}%{dest_ip?, IP %{dest_ip#%{next?, }<var%{item.inv? data-tooltip=\"匹配除 %{item.val} 以外的 IP 地址。\"}>%{item.ival}</var>}}%{dest_port?, 端口 %{dest_port#%{next?, }<var%{item.inv? data-tooltip=\"匹配除 %{item.val} 以外的端口。\"}>%{item.ival}</var>}}'), {
        dest: E('span', { 'class': 'zonebadge', 'style': fwmodel.getZoneColorStyle(z) }, [(z == '*') ? E('em', _('any zone')) : (z ? E('strong', z) : E('em', _('this device')))]),
        dest_ip: fwtool.map_invert(uci.get('firewall', s, 'dest_ip'), 'toLowerCase'),
        dest_port: fwtool.map_invert(uci.get('firewall', s, 'dest_port')),
        dest_device: d
    });
}

function rule_limit_txt(s) {
    return fwtext.renderLimitText(s);
}

function rule_target_txt(s, ctHelpers) {
    var t = uci.get('firewall', s, 'target'),
        h = (uci.get('firewall', s, 'set_helper') || '').toUpperCase(),
        s = {
            target: t,
            src: uci.get('firewall', s, 'src'),
            dest: uci.get('firewall', s, 'dest'),
            set_helper: h,
            set_mark: uci.get('firewall', s, 'set_mark'),
            set_xmark: uci.get('firewall', s, 'set_xmark'),
            set_dscp: uci.get('firewall', s, 'set_dscp'),
            helper_name: (ctHelpers.filter(function (ctH) { return ctH.name.toUpperCase() == h })[0] || {}).description
        };

    switch (t) {
        case 'DROP':
            return fwtool.fmt(_('<var data-tooltip="DROP">Drop</var> %{src?%{dest?forward:input}:output}'), s);

        case 'ACCEPT':
            return fwtool.fmt(_('<var data-tooltip="ACCEPT">Accept</var> %{src?%{dest?forward:input}:output}'), s);

        case 'REJECT':
            return fwtool.fmt(_('<var data-tooltip="REJECT">Reject</var> %{src?%{dest?forward:input}:output}'), s);

        case 'NOTRACK':
            return fwtool.fmt(_('<var data-tooltip="NOTRACK">Do not track</var> %{src?%{dest?forward:input}:output}'), s);

        case 'HELPER':
            return fwtool.fmt(_('<var data-tooltip="HELPER">Assign conntrack</var> helper <var%{helper_name? data-tooltip="%{helper_name}"}>%{set_helper}</var>'), s);

        case 'MARK':
            return fwtool.fmt(_('<var data-tooltip="MARK">%{set_mark?Assign:XOR}</var> firewall mark <var>%{set_mark?:%{set_xmark}}</var>'), s);

        case 'DSCP':
            return fwtool.fmt(_('<var data-tooltip="DSCP">Assign DSCP</var> classification <var>%{set_dscp}</var>'), s);

        default:
            return t;
    }
}

return view.extend({
    callHostHints: rpc.declare({
        object: 'luci-rpc',
        method: 'getHostHints',
        expect: { '': {} }
    }),

    callConntrackHelpers: rpc.declare({
        object: 'luci',
        method: 'getConntrackHelpers',
        expect: { result: [] }
    }),

    load: function () {
        return fwpage.withPageSetup(L.bind(function () {
            return Promise.all([
                L.resolveDefault(this.callHostHints(), {}),
                L.resolveDefault(this.callConntrackHelpers(), []),
                uci.load('firewall')
            ]);
        }, this));
    },

    render: function (data) {
        if (fwtool.checkLegacySNAT())
            return fwtool.renderMigration();
        else
            return this.renderRules(data);
    },

    renderRules: function (data) {
        var hosts = data[0] || {},
            ctHelpers = Array.isArray(data[1]) ? data[1] : [],
            m, s, o;

        m = new form.Map('firewall', _('防火墙 - 通信规则'),
            _('通信规则定义了不同区域间的数据包传输策略，例如：拒绝一些主机之间的通信、开放路由器 WAN 上的端口'));

        s = m.section(form.GridSection, 'rule', _('通信规则'));
        s.addremove = true;
        s.anonymous = true;
        s.sortable = true;

        s.tab('general', _('常规设置'));
        s.tab('advanced', _('高级设置'));
        s.tab('timed', _('时间限制'));

        s.filter = function (section_id) {
            return (uci.get('firewall', section_id, 'target') != 'SNAT');
        };

        s.sectiontitle = function (section_id) {
            return uci.get('firewall', section_id, 'name') || _('未命名规则');
        };

        s.handleAdd = function (ev) {
            var config_name = this.uciconfig || this.map.config,
                section_id = uci.add(config_name, this.sectiontype),
                opt1 = this.getOption('src'),
                opt2 = this.getOption('dest');

            opt1.default = 'wan';
            opt2.default = 'lan';

            this.addedSection = section_id;
            this.renderMoreOptionsModal(section_id);

            delete opt1.default;
            delete opt2.default;
        };

        o = s.taboption('general', form.Value, 'name', _('名称'));
        o.placeholder = _('未命名规则');
        o.modalonly = true;

        o = s.option(form.DummyValue, '_match', _('匹配规则'));
        o.modalonly = false;
        o.textvalue = function (s) {
            return E('small', [
                rule_proto_txt(s, ctHelpers), E('br'),
                rule_src_txt(s, hosts), E('br'),
                rule_dest_txt(s), E('br'),
                rule_limit_txt(s)
            ]);
        };

        o = s.option(form.ListValue, '_target', _('操作'));
        o.modalonly = false;
        o.textvalue = function (s) {
            return rule_target_txt(s, ctHelpers);
        };

        o = s.option(form.Flag, 'enabled', _('启用'));
        o.modalonly = false;
        o.default = o.enabled;
        o.editable = true;
        o.tooltip = function (section_id) {
            var weekdays = uci.get('firewall', section_id, 'weekdays');
            var monthdays = uci.get('firewall', section_id, 'monthdays');
            var start_time = uci.get('firewall', section_id, 'start_time');
            var stop_time = uci.get('firewall', section_id, 'stop_time');
            var start_date = uci.get('firewall', section_id, 'start_date');
            var stop_date = uci.get('firewall', section_id, 'stop_date');

            if (weekdays || monthdays || start_time || stop_time || start_date || stop_date)
                return _('对该规则启用了时间限制');

            return null;
        };

        o = s.taboption('advanced', form.ListValue, 'direction', _('匹配设备'));
        o.modalonly = true;
        o.value('', _('未指定'));
        o.value('in', _('入站设备'));
        o.value('out', _('出站设备'));
        o.cfgvalue = function (section_id) {
            var val = uci.get('firewall', section_id, 'direction');
            switch (val) {
                case 'in':
                case 'ingress':
                    return 'in';

                case 'out':
                case 'egress':
                    return 'out';
            }

            return null;
        };

        o = s.taboption('advanced', widgets.DeviceSelect, 'device', _('设备名'),
            _('指定是否将此流量规则绑定到特定的入站或出站网络设备'));
        o.modalonly = true;
        o.noaliases = true;
        o.rmempty = false;
        o.depends('direction', 'in');
        o.depends('direction', 'out');

        o = s.taboption('advanced', form.ListValue, 'family', _('限制地址类型'));
        o.modalonly = true;
        o.rmempty = true;
        o.value('', _('IPv4 和 IPv6'));
        o.value('ipv4', _('仅 IPv4'));
        o.value('ipv6', _('仅 IPv6'));
        o.validate = function (section_id, value) {
            fwtool.updateHostHints(this.map, section_id, 'src_ip', value, hosts);
            fwtool.updateHostHints(this.map, section_id, 'dest_ip', value, hosts);
            return true;
        };

        o = s.taboption('general', fwtool.CBIProtocolSelect, 'proto', _('协议'));
        o.modalonly = true;
        o.default = 'tcp udp';

        o = s.taboption('advanced', form.MultiValue, 'icmp_type', _('匹配 ICMP 类型'));
        o.modalonly = true;
        o.multiple = true;
        o.custom = true;
        o.cast = 'table';
        o.placeholder = _('任意');
        o.value('', 'any');
        o.value('address-mask-reply');
        o.value('address-mask-request');
        o.value('address-unreachable');
        o.value('bad-header');
        o.value('communication-prohibited');
        o.value('destination-unreachable');
        o.value('echo-reply');
        o.value('echo-request');
        o.value('fragmentation-needed');
        o.value('host-precedence-violation');
        o.value('host-prohibited');
        o.value('host-redirect');
        o.value('host-unknown');
        o.value('host-unreachable');
        o.value('ip-header-bad');
        o.value('neighbour-advertisement');
        o.value('neighbour-solicitation');
        o.value('network-prohibited');
        o.value('network-redirect');
        o.value('network-unknown');
        o.value('network-unreachable');
        o.value('no-route');
        o.value('packet-too-big');
        o.value('parameter-problem');
        o.value('port-unreachable');
        o.value('precedence-cutoff');
        o.value('protocol-unreachable');
        o.value('redirect');
        o.value('required-option-missing');
        o.value('router-advertisement');
        o.value('router-solicitation');
        o.value('source-quench');
        o.value('source-route-failed');
        o.value('time-exceeded');
        o.value('timestamp-reply');
        o.value('timestamp-request');
        o.value('TOS-host-redirect');
        o.value('TOS-host-unreachable');
        o.value('TOS-network-redirect');
        o.value('TOS-network-unreachable');
        o.value('ttl-zero-during-reassembly');
        o.value('ttl-zero-during-transit');
        o.value('unknown-header-type');
        o.value('unknown-option');
        o.depends({ proto: 'icmp', '!contains': true });
        o.depends({ proto: 'icmpv6', '!contains': true });

        o = s.taboption('general', widgets.ZoneSelect, 'src', _('源区域'));
        o.modalonly = true;
        o.nocreate = true;
        o.allowany = true;
        o.allowlocal = 'src';

        fwtool.addMACOption(s, 'advanced', 'src_mac', _('源 MAC 地址'), null, hosts);
        fwtool.addIPOption(s, 'general', 'src_ip', _('源地址'), null, '', hosts, true);

        o = s.taboption('general', form.Value, 'src_port', _('源端口'));
        o.modalonly = true;
        o.datatype = 'list(neg(portrange))';
        o.placeholder = _('任意');
        o.depends({ proto: 'tcp', '!contains': true });
        o.depends({ proto: 'udp', '!contains': true });

        o = s.taboption('general', widgets.ZoneSelect, 'dest', _('目标区域'));
        o.modalonly = true;
        o.nocreate = true;
        o.allowany = true;
        o.allowlocal = true;

        fwtool.addIPOption(s, 'general', 'dest_ip', _('目标地址'), null, '', hosts, true);

        o = s.taboption('general', form.Value, 'dest_port', _('目标端口'));
        o.modalonly = true;
        o.datatype = 'list(neg(portrange))';
        o.placeholder = _('任意');
        o.depends({ proto: 'tcp', '!contains': true });
        o.depends({ proto: 'udp', '!contains': true });

        o = s.taboption('general', form.ListValue, 'target', _('操作'));
        o.modalonly = true;
        o.default = 'ACCEPT';
        o.value('DROP', _('丢弃'));
        o.value('ACCEPT', _('接受'));
        o.value('REJECT', _('拒绝'));
        o.value('NOTRACK', _("不跟踪"));
        o.value('HELPER', _('分配连接跟踪助手'));
        o.value('MARK_SET', _('应用防火墙标记'));
        o.value('MARK_XOR', _('异或防火墙标记'));
        o.value('DSCP', _('DSCP 类别'));
        o.cfgvalue = function (section_id) {
            var t = uci.get('firewall', section_id, 'target'),
                m = uci.get('firewall', section_id, 'set_mark');

            if (t == 'MARK') {
                return m ? 'MARK_SET' : 'MARK_XOR';
            }

            return t;
        };
        o.write = function (section_id, value) {
            return this.super('write', [section_id, (value == 'MARK_SET' || value == 'MARK_XOR') ? 'MARK' : value]);
        };

        fwtool.addMarkOption(s, 1);
        fwtool.addMarkOption(s, 2);
        fwtool.addDSCPOption(s, true);

        o = s.taboption('general', form.ListValue, 'set_helper', _('跟踪助手'), _('将指定的连接跟踪助手分配给匹配的流量'));
        o.modalonly = true;
        o.placeholder = _('任意');
        o.depends('target', 'HELPER');
        for (var i = 0; i < ctHelpers.length; i++) {
            o.value(ctHelpers[i].name, '%s (%s)'.format(ctHelpers[i].description, ctHelpers[i].name.toUpperCase()));
        }

        o = s.taboption('advanced', form.Value, 'helper', _('匹配助手'), _('使用指定的连接跟踪助手匹配流量'));
        o.modalonly = true;
        o.placeholder = _('任意');
        for (var i = 0; i < ctHelpers.length; i++) {
            o.value(ctHelpers[i].name, '%s (%s)'.format(ctHelpers[i].description, ctHelpers[i].name.toUpperCase()));
        }
        o.validate = function (section_id, value) {
            if (value == '' || value == null) {
                return true;
            }

            value = value.replace(/^!\s*/, '');

            for (var i = 0; i < ctHelpers.length; i++) {
                if (value == ctHelpers[i].name) {
                    return true;
                }
            }

            return _('未知或未安装的连接跟踪助手 \"%s\"').format(value);
        };

        fwtool.addMarkOption(s, false);
        fwtool.addDSCPOption(s, false);
        fwtool.addLimitOption(s);
        fwtool.addLimitBurstOption(s);

        if (!L.hasSystemFeature('firewall4')) {
            o = s.taboption('advanced', form.Value, 'extra', _('额外参数'),
                _('传递到 iptables 的额外参数。小心使用！'));
            o.modalonly = true;
        }

        o = s.taboption('timed', form.MultiValue, 'weekdays', _('星期'));
        o.modalonly = true;
        o.multiple = true;
        o.display = 5;
        o.placeholder = _('每天');
        o.value('Sun', _('星期日'));
        o.value('Mon', _('星期一'));
        o.value('Tue', _('星期二'));
        o.value('Wed', _('星期三'));
        o.value('Thu', _('星期四'));
        o.value('Fri', _('星期五'));
        o.value('Sat', _('星期六'));
        o.write = function (section_id, value) {
            return this.super('write', [section_id, L.toArray(value).join(' ')]);
        };

        o = s.taboption('timed', form.MultiValue, 'monthdays', _('日期'));
        o.modalonly = true;
        o.multiple = true;
        o.display_size = 15;
        o.placeholder = _('每天');
        o.write = function (section_id, value) {
            return this.super('write', [section_id, L.toArray(value).join(' ')]);
        };
        for (var i = 1; i <= 31; i++)
            o.value(i);

        o = s.taboption('timed', form.Value, 'start_time', _('开始时间（hh:mm:ss）'));
        o.modalonly = true;
        o.datatype = 'timehhmmss';

        o = s.taboption('timed', form.Value, 'stop_time', _('停止时间（hh:mm:ss）'));
        o.modalonly = true;
        o.datatype = 'timehhmmss';

        o = s.taboption('timed', form.Value, 'start_date', _('开始日期（yyyy-mm-dd）'));
        o.modalonly = true;
        o.datatype = 'dateyyyymmdd';

        o = s.taboption('timed', form.Value, 'stop_date', _('停止日期（yyyy-mm-dd）'));
        o.modalonly = true;
        o.datatype = 'dateyyyymmdd';

        o = s.taboption('timed', form.Flag, 'utc_time', _('UTC 时间'));
        o.modalonly = true;
        o.default = o.disabled;

        return m.render();
    }
});
