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
    var proto = fwtext.getProtoEntries(s, true);
    var helper = fwtext.getHelperInfo(s, ctHelpers);
    var mark = fwtext.getMarkInfo(s);

    return fwtool.fmt(_('入站 IPv4%{proto?, 协议 %{proto#%{next?, }%{item.types?<var class=\"cbi-tooltip-container\">%{item.name}<span class=\"cbi-tooltip\">具有类型 %{item.types#%{next?, }<var>%{item}</var>} 的 ICMP</span></var>:<var>%{item.name}</var>}}}%{mark?, 标记 <var%{mark.inv? data-tooltip=\"匹配除 %{mark.num}%{mark.mask? 带有掩码 %{mark.mask}} 的 fwmarks。\":%{mark.mask? data-tooltip=\"在比较前使用 %{mark.mask} 掩盖 fwmark 值。\"}}>%{mark.val}</var>}%{helper?, 助手 %{helper.inv?<var data-tooltip=\"匹配除 &quot;%{helper.name}&quot; 以外的任意助手。\">%{helper.val}</var>:<var data-tooltip=\"%{helper.name}\">%{helper.val}</var>}}'), {
        proto: proto,
        helper: helper,
        mark: mark
    });
}

function rule_src_txt(s, hosts) {
    var z = uci.get('firewall', s, 'src');

    return fwtool.fmt(_('来自 %{src}%{src_ip?, IP %{src_ip#%{next?, }<var%{item.inv? data-tooltip=\"匹配除 %{item.val} 以外的 IP 地址。\"}>%{item.ival}</var>}}%{src_port?, 端口 %{src_port#%{next?, }<var%{item.inv? data-tooltip=\"匹配除 %{item.val} 以外的端口。\"}>%{item.ival}</var>}}%{src_mac?, MAC %{src_mac#%{next?, }<var%{item.inv? data-tooltip=\"匹配除 %{item.val}%{item.hint.name? 或称为 %{item.hint.name}} 以外的 MAC 地址。\":%{item.hint.name? data-tooltip=\"%{item.hint.name}\"}}>%{item.ival}</var>}}'), {
        src: E('span', { 'class': 'zonebadge', 'style': fwmodel.getZoneColorStyle(z) }, [(z == '*') ? E('em', _('所有区域')) : (z ? E('strong', z) : E('em', _('此设备')))]),
        src_ip: fwtool.map_invert(uci.get('firewall', s, 'src_ip'), 'toLowerCase'),
        src_mac: fwtool.map_invert(uci.get('firewall', s, 'src_mac'), 'toUpperCase').map(function (v) { return Object.assign(v, { hint: hosts[v.val] }) }),
        src_port: fwtool.map_invert(uci.get('firewall', s, 'src_port'))
    });
}

function rule_dest_txt(s) {
    return fwtool.fmt(_('到 %{dest}%{dest_ip?, IP %{dest_ip#%{next?, }<var%{item.inv? data-tooltip=\"匹配除 %{item.val} 以外的 IP 地址。\"}>%{item.ival}</var>}}%{dest_port?, 端口 %{dest_port#%{next?, }<var%{item.inv? data-tooltip=\"匹配除 %{item.val} 以外的端口。\"}>%{item.ival}</var>}}'), {
        dest: E('span', { 'class': 'zonebadge', 'style': fwmodel.getZoneColorStyle(null) }, [E('em', _('此设备'))]),
        dest_ip: fwtool.map_invert(uci.get('firewall', s, 'src_dip'), 'toLowerCase'),
        dest_port: fwtool.map_invert(uci.get('firewall', s, 'src_dport'))
    });
}

function rule_limit_txt(s) {
    return fwtext.renderLimitText(s);
}

function rule_target_txt(s) {
    var z = uci.get('firewall', s, 'dest');

    return fwtool.fmt(_('<var data-tooltip=\"DNAT\">转发</var> 至 %{dest}%{dest_ip? IP <var>%{dest_ip}</var>}%{dest_port? 端口 <var>%{dest_port}</var>}'), {
        dest: E('span', { 'class': 'zonebadge', 'style': 'background-color:' + fwmodel.getColorForName((z && z != '*') ? z : null) }, [(z == '*') ? E('em', _('所有区域')) : (z ? E('strong', z) : E('em', _('此设备')))]),
        dest_ip: (uci.get('firewall', s, 'dest_ip') || '').toLowerCase(),
        dest_port: uci.get('firewall', s, 'dest_port')
    });
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

    callNetworkDevices: rpc.declare({
        object: 'luci-rpc',
        method: 'getNetworkDevices',
        expect: { '': {} }
    }),

    load: function () {
        return fwpage.withPageSetup(L.bind(function () {
            return Promise.all([
                L.resolveDefault(this.callHostHints(), {}),
                L.resolveDefault(this.callConntrackHelpers(), []),
                L.resolveDefault(this.callNetworkDevices(), {}),
                uci.load('firewall')
            ]);
        }, this));
    },

    render: function (data) {
        if (fwtool.checkLegacySNAT())
            return fwtool.renderMigration();
        else
            return this.renderForwards(data);
    },

    renderForwards: function (data) {
        var hosts = data[0] || {},
            ctHelpers = Array.isArray(data[1]) ? data[1] : [],
            devs = data[2] || {},
            m, s, o;

        m = new form.Map('firewall', _('防火墙 - 端口转发'),
            _('端口转发允许互联网上的远程计算机连接到内部网络中的特定计算机或服务'));

        s = m.section(form.GridSection, 'redirect', _('端口转发'));
        s.addremove = true;
        s.anonymous = true;
        s.sortable = true;

        s.tab('general', _('常规设置'));
        s.tab('advanced', _('高级设置'));

        s.filter = function (section_id) {
            return (uci.get('firewall', section_id, 'target') != 'SNAT');
        };

        s.sectiontitle = function (section_id) {
            return uci.get('firewall', section_id, 'name') || _('未命名转发');
        };

        s.handleAdd = function (ev) {
            var config_name = this.uciconfig || this.map.config,
                section_id = uci.add(config_name, this.sectiontype);

            uci.set(config_name, section_id, 'dest', 'lan');
            uci.set(config_name, section_id, 'target', 'DNAT');

            m.addedSection = section_id;
            this.renderMoreOptionsModal(section_id);
        };

        o = s.taboption('general', form.Value, 'name', _('名称'));
        o.placeholder = _('未命名转发');
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

        o = s.option(form.ListValue, '_dest', _('操作'));
        o.modalonly = false;
        o.textvalue = function (s) {
            return E('small', [
                rule_target_txt(s)
            ]);
        };

        o = s.option(form.Flag, 'enabled', _('启用'));
        o.modalonly = false;
        o.default = o.enabled;
        o.editable = true;

        o = s.taboption('general', fwtool.CBIProtocolSelect, 'proto', _('协议'));
        o.modalonly = true;
        o.default = 'tcp udp';

        o = s.taboption('general', widgets.ZoneSelect, 'src', _('源区域'));
        o.modalonly = true;
        o.rmempty = false;
        o.nocreate = true;
        o.default = 'wan';

        o = fwtool.addMACOption(s, 'advanced', 'src_mac', _('源 MAC 地址'),
            _('仅匹配来自这些 MAC 的入站流量'), hosts);
        o.rmempty = true;
        o.datatype = 'list(neg(macaddr))';

        o = fwtool.addIPOption(s, 'advanced', 'src_ip', _('源 IP 地址'),
            _('仅匹配来自此 IP 或 IP 范围的入站流量'), 'ipv4', hosts);
        o.rmempty = true;
        o.datatype = 'neg(ipmask4("true"))';

        o = s.taboption('advanced', form.Value, 'src_port', _('源端口'),
            _('仅匹配源自客户端主机上给定源端口或源端口范围的入站流量'));
        o.modalonly = true;
        o.rmempty = true;
        o.datatype = 'neg(portrange)';
        o.placeholder = _('任意');
        o.depends({ proto: 'tcp', '!contains': true });
        o.depends({ proto: 'udp', '!contains': true });

        o = fwtool.addLocalIPOption(s, 'advanced', 'src_dip', _('外部 IP 地址'),
            _('仅匹配指定目的 IP 地址的入站流量'), devs);
        o.datatype = 'neg(ipmask4("true"))';
        o.rmempty = true;

        o = s.taboption('general', form.Value, 'src_dport', _('外部端口'),
            _('匹配指向此主机上指定目标端口或目标端口范围的入站流量'));
        o.modalonly = true;
        o.rmempty = false;
        o.datatype = 'neg(portrange)';
        o.depends({ proto: 'tcp', '!contains': true });
        o.depends({ proto: 'udp', '!contains': true });

        o = s.taboption('general', widgets.ZoneSelect, 'dest', _('内部区域'));
        o.modalonly = true;
        o.rmempty = true;
        o.nocreate = true;

        o = fwtool.addIPOption(s, 'general', 'dest_ip', _('内部 IP 地址'),
            _('重定向匹配的入站流量到指定的内部主机'), 'ipv4', hosts);
        o.rmempty = true;
        o.datatype = 'ipmask4';

        o = s.taboption('general', form.Value, 'dest_port', _('内部端口'),
            _('重定向匹配的入站流量到内部主机的端口'));
        o.modalonly = true;
        o.rmempty = true;
        o.placeholder = _('任意');
        o.datatype = 'portrange';
        o.depends({ proto: 'tcp', '!contains': true });
        o.depends({ proto: 'udp', '!contains': true });

        o = s.taboption('advanced', form.Flag, 'reflection', _('启用 NAT 环回'));
        o.modalonly = true;
        o.rmempty = true;
        o.default = o.enabled;

        o = s.taboption('advanced', form.ListValue, 'reflection_src', _('环回源 IP'), _('指定反射流量使用外部或内部 IP 地址'));
        o.modalonly = true;
        o.depends('reflection', '1');
        o.value('internal', _('使用内部 IP 地址'));
        o.value('external', _('使用外部 IP 地址'));
        o.write = function (section_id, value) {
            uci.set('firewall', section_id, 'reflection_src', (value != 'internal') ? value : null);
        };

        o = s.taboption('advanced', form.Value, 'helper', _('匹配助手'), _('使用指定的连接跟踪助手匹配流量'));
        o.modalonly = true;
        o.placeholder = _('任意');
        for (var i = 0; i < ctHelpers.length; i++)
            o.value(ctHelpers[i].name, '%s (%s)'.format(ctHelpers[i].description, ctHelpers[i].name.toUpperCase()));
        o.validate = function (section_id, value) {
            if (value == '' || value == null)
                return true;

            value = value.replace(/^!\s*/, '');

            for (var i = 0; i < ctHelpers.length; i++)
                if (value == ctHelpers[i].name)
                    return true;

            return _('未知或未安装的连接跟踪助手 \"%s\"').format(value);
        };

        fwtool.addMarkOption(s, false);
        fwtool.addLimitOption(s);
        fwtool.addLimitBurstOption(s);

        if (!L.hasSystemFeature('firewall4')) {
            o = s.taboption('advanced', form.Value, 'extra', _('额外参数'),
                _('传递到 iptables 的额外参数。小心使用！'));
            o.modalonly = true;
            o.rmempty = true;
        }

        return m.render();
    }
});
