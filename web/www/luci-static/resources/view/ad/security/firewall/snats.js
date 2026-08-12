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

function rule_proto_txt(s) {
    var proto = fwtext.getProtoEntries(s, false);
    var mark = fwtext.getMarkInfo(s);

    return fwtool.fmt(_('转发的 IPv4%{proto?, 协议 %{proto#%{next?, }<var>%{item.name}</var>}}%{mark?, 标记 <var%{mark.inv? data-tooltip=\"匹配除 %{mark.num}%{mark.mask? 带有掩码 %{mark.mask}} 以外的 fwmarks。\":%{mark.mask? data-tooltip=\"在比较前使用 %{mark.mask} 掩盖 fwmark 值。\"}}>%{mark.val}</var>}'), {
        proto: proto,
        mark: mark
    });
}

function rule_src_txt(s) {
    return fwtool.fmt(_('来自 %{src}%{src_device?, 接口 <var>%{src_device}</var>}%{src_ip?, IP %{src_ip#%{next?, }<var%{item.inv? data-tooltip=\"匹配除 %{item.val} 以外的 IP 地址。\"}>%{item.ival}</var>}}%{src_port?, 端口 %{src_port#%{next?, }<var%{item.inv? data-tooltip=\"匹配除 %{item.val} 以外的端口。\"}>%{item.ival}</var>}}'), {
        src: E('span', { 'class': 'zonebadge', 'style': fwmodel.getZoneColorStyle(null) }, [E('em', _('any zone'))]),
        src_ip: fwtool.map_invert(uci.get('firewall', s, 'src_ip'), 'toLowerCase'),
        src_port: fwtool.map_invert(uci.get('firewall', s, 'src_port'))
    });
}

function rule_dest_txt(s) {
    var z = uci.get('firewall', s, 'src');

    return fwtool.fmt(_('到 %{dest}%{dest_device?, 通过接口 <var>%{dest_device}</var>}%{dest_ip?, IP %{dest_ip#%{next?, }<var%{item.inv? data-tooltip=\"匹配除 %{item.val} 以外的 IP 地址。\"}>%{item.ival}</var>}}%{dest_port?, 端口 %{dest_port#%{next?, }<var%{item.inv? data-tooltip=\"匹配除 %{item.val} 以外的端口。\"}>%{item.ival}</var>}}'), {
        dest: E('span', { 'class': 'zonebadge', 'style': fwmodel.getZoneColorStyle(z) }, [(z == '*') ? E('em', _('any zone')) : (z ? E('strong', z) : E('em', _('this device')))]),
        dest_ip: fwtool.map_invert(uci.get('firewall', s, 'dest_ip'), 'toLowerCase'),
        dest_port: fwtool.map_invert(uci.get('firewall', s, 'dest_port')),
        dest_device: uci.get('firewall', s, 'device')
    });
}

function rule_limit_txt(s) {
    return fwtext.renderLimitText(s);
}

function rule_target_txt(s) {
    var t = uci.get('firewall', s, 'target'),
        s = {
            target: t,
            snat_ip: uci.get('firewall', s, 'snat_ip'),
            snat_port: uci.get('firewall', s, 'snat_port')
        };

    switch (t) {
        case 'SNAT':
            return fwtool.fmt(_('<var data-tooltip=\"SNAT\">静态重写</var> 到源 %{snat_ip?IP <var>%{snat_ip}</var>} %{snat_port?端口 <var>%{snat_port}</var>}'), s);

        case 'MASQUERADE':
            return fwtool.fmt(_('<var data-tooltip=\"MASQUERADE\">自动重写</var> 源 IP'));

        case 'ACCEPT':
            return fwtool.fmt(_('<var data-tooltip=\"ACCEPT\">防止重写源</var>'));

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

    callNetworkDevices: rpc.declare({
        object: 'luci-rpc',
        method: 'getNetworkDevices',
        expect: { '': {} }
    }),

    load: function () {
        return fwpage.withPageSetup(L.bind(function () {
            return Promise.all([
                L.resolveDefault(this.callHostHints(), {}),
                L.resolveDefault(this.callNetworkDevices(), {}),
                uci.load('firewall')
            ]);
        }, this));
    },

    render: function (data) {
        if (fwtool.checkLegacySNAT()) {
            return fwtool.renderMigration();
        } else {
            return this.renderNats(data);
        }
    },

    renderNats: function (data) {
        var hosts = data[0] || {},
            devs = data[1] || {},
            m, s, o;

        m = new form.Map('firewall', _('防火墙 - NAT 规则'),
            _('NAT 规则允许对源 IP 进行精细控制，以用于出站或转发流量'));

        s = m.section(form.GridSection, 'nat', _('NAT 规则'));
        s.addremove = true;
        s.anonymous = true;
        s.sortable = true;

        s.tab('general', _('常规设置'));
        s.tab('advanced', _('高级设置'));
        s.tab('timed', _('时间限制'));

        s.sectiontitle = function (section_id) {
            return uci.get('firewall', section_id, 'name') || _('未命名 NAT');
        };

        o = s.taboption('general', form.Value, 'name', _('名称'));
        o.placeholder = _('未命名 NAT');
        o.modalonly = true;

        o = s.option(form.DummyValue, '_match', _('匹配规则'));
        o.modalonly = false;
        o.textvalue = function (s) {
            return E('small', [
                rule_proto_txt(s), E('br'),
                rule_src_txt(s), E('br'),
                rule_dest_txt(s), E('br'),
                rule_limit_txt(s)
            ]);
        };

        o = s.option(form.ListValue, '_target', _('操作'));
        o.modalonly = false;
        o.textvalue = function (s) {
            return rule_target_txt(s);
        };

        o = s.option(form.Flag, 'enabled', _('启用'));
        o.modalonly = false;
        o.default = o.enabled;
        o.editable = true;

        o = s.taboption('general', fwtool.CBIProtocolSelect, 'proto', _('协议'));
        o.modalonly = true;
        o.default = 'all';

        o = s.taboption('general', widgets.ZoneSelect, 'src', _('出站区域'));
        o.modalonly = true;
        o.rmempty = false;
        o.nocreate = true;
        o.allowany = true;
        o.default = 'lan';

        o = fwtool.addIPOption(s, 'general', 'src_ip', _('源地址'),
            _('匹配来自此 IP 或范围的转发流量'), 'ipv4', hosts);
        o.rmempty = true;
        o.datatype = 'neg(ipmask4("true"))';

        o = s.taboption('general', form.Value, 'src_port', _('源端口'),
            _('匹配来自给定源端口或端口范围的转发流量'));
        o.modalonly = true;
        o.rmempty = true;
        o.datatype = 'neg(portrange)';
        o.placeholder = _('任意');
        o.depends({ proto: 'tcp', '!contains': true });
        o.depends({ proto: 'udp', '!contains': true });

        o = fwtool.addIPOption(s, 'general', 'dest_ip', _('目标地址'),
            _('匹配指向给定 IP 地址的转发流量'), 'ipv4', hosts);
        o.rmempty = true;
        o.datatype = 'neg(ipmask4("true"))';

        o = s.taboption('general', form.Value, 'dest_port', _('目标端口'),
            _('匹配指向给定目标端口或端口范围的转发流量'));
        o.modalonly = true;
        o.rmempty = true;
        o.placeholder = _('任意');
        o.datatype = 'neg(portrange)';
        o.depends({ proto: 'tcp', '!contains': true });
        o.depends({ proto: 'udp', '!contains': true });

        o = s.taboption('general', form.ListValue, 'target', _('操作'));
        o.modalonly = true;
        o.default = 'SNAT';
        o.value('SNAT', _('SNAT - 重写为特定的源 IP 或端口'));
        o.value('MASQUERADE', _('MASQUERADE - 自动重写源地址为出站接口 IP'));
        o.value('ACCEPT', _('接受 - 禁用地址重写'));

        o = fwtool.addLocalIPOption(s, 'general', 'snat_ip', _('重写 IP 地址'),
            _('将匹配的流量重写到指定的源 IP 地址'), devs);
        o.placeholder = null;
        o.depends('target', 'SNAT');
        o.validate = function (section_id, value) {
            var a = this.formvalue(section_id),
                p = this.section.formvalue(section_id, 'snat_port');

            if ((a == null || a == '') && (p == null || p == '') && value == '') {
                return _('必须指定重写 IP！');
            }

            return true;
        };

        o = s.taboption('general', form.Value, 'snat_port', _('重写端口'),
            _('将匹配的流量重写到指定的源端口或端口范围'));
        o.modalonly = true;
        o.rmempty = true;
        o.placeholder = _('不重写');
        o.datatype = 'portrange';
        o.depends({ proto: 'tcp', '!contains': true });
        o.depends({ proto: 'udp', '!contains': true });

        o = s.taboption('advanced', widgets.DeviceSelect, 'device', _('出站设备'),
            _('使用指定的出站网络设备匹配转发的流量'));
        o.noaliases = true;
        o.modalonly = true;
        o.rmempty = true;

        fwtool.addMarkOption(s, false);
        fwtool.addLimitOption(s);
        fwtool.addLimitBurstOption(s);

        if (!L.hasSystemFeature('firewall4')) {
            o = s.taboption('advanced', form.Value, 'extra', _('额外参数'),
                _('传递到 iptables 的额外参数。小心使用！'));
            o.modalonly = true;
            o.rmempty = true;
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
        for (var i = 1; i <= 31; i++) {
            o.value(i);
        }

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
