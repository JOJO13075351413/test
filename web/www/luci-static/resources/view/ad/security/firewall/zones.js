'use strict';
'require view';
'require rpc';
'require uci';
'require form';
'require network';
'require firewall';
'require tools.firewall as fwtool';
'require tools.widgets as widgets';
'require ad.firewall_page as fwpage';

return view.extend({
    callConntrackHelpers: rpc.declare({
        object: 'luci',
        method: 'getConntrackHelpers',
        expect: { result: [] }
    }),

    load: function () {
        return fwpage.withPageSetup(L.bind(function () {
            return Promise.all([
                L.resolveDefault(this.callConntrackHelpers(), []),
                firewall.getDefaults()
            ]);
        }, this));
    },

    render: function (data) {
        if (fwtool.checkLegacySNAT()) {
            return fwtool.renderMigration();
        } else {
            return this.renderZones(data);
        }
    },

    renderZones: function (data) {
        var ctHelpers = Array.isArray(data[0]) ? data[0] : [],
            fwDefaults = data[1],
            m, s, o, inp, out;

        m = new form.Map('firewall', _('防火墙 - 区域设置'),
            _('防火墙通过在网络接口上创建区域来控制网络流量'));

        s = m.section(form.TypedSection, 'defaults', _('常规设置'));
        s.anonymous = true;
        s.addremove = false;

        o = s.option(form.Flag, 'synflood_protect', _('启用 SYN-flood 防御'));
        o.cfgvalue = function (section_id) {
            var val = uci.get('firewall', section_id, 'synflood_protect');
            return (val != null) ? val : uci.get('firewall', section_id, 'syn_flood');
        };
        o.write = function (section_id, value) {
            uci.unset('firewall', section_id, 'syn_flood');
            uci.set('firewall', section_id, 'synflood_protect', value);
        };
        o.remove = function (section_id) {
            uci.unset('firewall', section_id, 'syn_flood');
            uci.unset('firewall', section_id, 'synflood_protect');
        };

        o = s.option(form.Flag, 'drop_invalid', _('丢弃无效数据包'));

        var p = [
            s.option(form.ListValue, 'input', _('入站数据')),
            s.option(form.ListValue, 'output', _('出站数据')),
            s.option(form.ListValue, 'forward', _('转发'))
        ];

        for (var i = 0; i < p.length; i++) {
            p[i].value('REJECT', _('拒绝'));
            p[i].value('DROP', _('丢弃'));
            p[i].value('ACCEPT', _('接受'));
        }

        if (L.hasSystemFeature('offloading')) {
            s = m.section(form.TypedSection, 'defaults', _('路由/NAT 分载'),
                _('实验特性。与 QoS/SQM 不完全兼容。'));

            s.anonymous = true;
            s.addremove = false;

            o = s.option(form.Flag, 'flow_offloading',
                _('软件流量分载'),
                _('基于软件的 路由/NAT 分载'));
            o.optional = true;

            o = s.option(form.Flag, 'flow_offloading_hw',
                _('硬件流量分载'),
                _('需要硬件 NAT 支持。目前 mt7621 已实现'));
            o.optional = true;
            o.depends('flow_offloading', '1');
        }

        s = m.section(form.GridSection, 'zone', _('区域设置'));
        s.addremove = true;
        s.anonymous = true;
        s.sortable = true;

        s.handleRemove = function (section_id, ev) {
            return firewall.deleteZone(section_id).then(L.bind(function () {
                return this.super('handleRemove', [section_id, ev]);
            }, this));
        };

        s.tab('general', _('常规设置'));
        s.tab('advanced', _('高级设置'));
        s.tab('conntrack', _('连接跟踪设置'));
        s.tab('extra', _('额外 iptables 参数'));

        o = s.taboption('general', form.DummyValue, '_generalinfo');
        o.rawhtml = true;
        o.modalonly = true;
        o.cfgvalue = function (section_id) {
            var name = uci.get('firewall', section_id, 'name');
            if (name == null) {
                name = _("新区域");
            }
            return _('本节定义 %q 的通用属性。<em>入站数据</em>和<em>出站数据</em>选项用于设置此区域入站和出站流量的默认策略，<em>转发</em>选项描述该区域内不同网络之间的流量转发策略。<em>涵盖的网络</em>指定从属于这个区域的网络')
                .replace(/%s/g, name).replace(/%q/g, '"' + name + '"');
        };

        o = s.taboption('general', form.Value, 'name', _('名称'));
        o.placeholder = _('未命名区域');
        o.modalonly = true;
        o.rmempty = false;
        o.datatype = 'and(uciname,maxlength(11))';
        o.write = function (section_id, formvalue) {
            var cfgvalue = this.cfgvalue(section_id);

            if (cfgvalue == null || cfgvalue == '') {
                return uci.set('firewall', section_id, 'name', formvalue);
            } else if (cfgvalue != formvalue) {
                return firewall.renameZone(cfgvalue, formvalue);
            }
        };

        o = s.option(widgets.ZoneForwards, '_info', _('区域 ⇒ 转发'));
        o.editable = true;
        o.modalonly = false;
        o.cfgvalue = function (section_id) {
            return uci.get('firewall', section_id, 'name');
        };

        var p = [
            s.taboption('general', form.ListValue, 'input', _('入站')),
            s.taboption('general', form.ListValue, 'output', _('出站')),
            s.taboption('general', form.ListValue, 'forward', _('转发'))
        ];

        for (var i = 0; i < p.length; i++) {
            p[i].value('REJECT', _('拒绝'));
            p[i].value('DROP', _('丢弃'));
            p[i].value('ACCEPT', _('接受'));
            p[i].editable = true;
        }

        p[0].default = fwDefaults.getInput();
        p[1].default = fwDefaults.getOutput();
        p[2].default = fwDefaults.getForward();

        o = s.taboption('general', form.Flag, 'masq', _('IP 动态伪装'));
        o.editable = true;
        o.tooltip = function (section_id) {
            var masq_src = uci.get('firewall', section_id, 'masq_src')
            var masq_dest = uci.get('firewall', section_id, 'masq_dest')
            if (masq_src || masq_dest) {
                return _('已启用有限伪装');
            }

            return null;
        };

        o = s.taboption('general', form.Flag, 'mtu_fix', _('MSS 钳制'));
        o.modalonly = true;

        o = s.taboption('general', widgets.NetworkSelect, 'network', _('涵盖的网络'));
        o.modalonly = true;
        o.multiple = true;
        o.cfgvalue = function (section_id) {
            return uci.get('firewall', section_id, 'network');
        };
        o.write = function (section_id, formvalue) {
            var name = uci.get('firewall', section_id, 'name'),
                cfgvalue = this.cfgvalue(section_id),
                oldNetworks = L.toArray(cfgvalue),
                newNetworks = L.toArray(formvalue);

            oldNetworks.sort();
            newNetworks.sort();

            if (oldNetworks.join(' ') == newNetworks.join(' ')) {
                return;
            }

            var tasks = [firewall.getZone(name)];

            if (Array.isArray(formvalue))
                for (var i = 0; i < newNetworks.length; i++) {
                    var netname = newNetworks[i];
                    tasks.push(network.getNetwork(netname).then(L.bind(function (netname, net) {
                        return net || network.addNetwork(netname, { 'proto': 'none' });
                    }, this, netname)));
                }

            return Promise.all(tasks).then(function (zone_networks) {
                if (zone_networks[0]) {
                    zone_networks[0].clearNetworks();
                    for (var i = 1; i < zone_networks.length; i++) {
                        zone_networks[0].addNetwork(zone_networks[i].getName());
                    }
                }
            });
        };

        o = s.taboption('advanced', form.DummyValue, '_advancedinfo');
        o.rawhtml = true;
        o.modalonly = true;
        o.cfgvalue = function (section_id) {
            var name = uci.get('firewall', section_id, 'name');
            if (name == null) {
                name = _("新区域");
            }
            return _('以下选项控制此区域（%s）和其它区域间的转发策略。<em>目标区域</em>接收<strong>源自 %q</strong> 的转发流量。<em>源区域</em>匹配的转发流量来自<strong>目标为%q</strong> 的其它区域。转发规则的作用是<em>单向</em>的，例如：转发从 lan 到 wan 的流量并<em>不</em>意味着允许反向转发从 wan 到 lan 的流量')
                .format(name);
        };

        o = s.taboption('advanced', widgets.DeviceSelect, 'device', _('涵盖的设备'), _('此选项可对原始的、非 <em>uci</em> 托管的网络设备进行区域流量分类'));
        o.modalonly = true;
        o.noaliases = true;
        o.multiple = true;

        o = s.taboption('advanced', form.DynamicList, 'subnet', _('涵盖的子网'), _('此选项可对源或目标子网而非网络或设备进行区域流量分类'));
        o.datatype = 'neg(cidr("true"))';
        o.modalonly = true;
        o.multiple = true;

        o = s.taboption('advanced', form.ListValue, 'family', _('限制地址类型'));
        o.value('', _('IPv4 和 IPv6'));
        o.value('ipv4', _('仅 IPv4'));
        o.value('ipv6', _('仅 IPv6'));
        o.modalonly = true;

        o = s.taboption('advanced', form.DynamicList, 'masq_src', _('要限制 IP 动态伪装的源子网'));
        o.depends('family', '');
        o.depends('family', 'ipv4');
        o.datatype = 'list(neg(or(uciname,hostname,ipmask4)))';
        o.placeholder = '0.0.0.0/0';
        o.modalonly = true;

        o = s.taboption('advanced', form.DynamicList, 'masq_dest', _('要限制 IP 动态伪装的目标子网'));
        o.depends('family', '');
        o.depends('family', 'ipv4');
        o.datatype = 'list(neg(or(uciname,hostname,ipmask4)))';
        o.placeholder = '0.0.0.0/0';
        o.modalonly = true;

        o = s.taboption('conntrack', form.Flag, 'masq_allow_invalid', _('允许“无效”流量'), _('不安装额外的规则以拒绝连接跟踪状态为<em>无效</em>的转发流量。对复杂的非对称路由这可能是必需的设置。'));
        o.modalonly = true;

        o = s.taboption('conntrack', form.Flag, 'auto_helper', _('自动助手分配'), _('根据流量协议和端口自动分配 conntrack 助手'));
        o.default = o.enabled;
        o.modalonly = true;

        o = s.taboption('conntrack', form.MultiValue, 'helper', _('连接跟踪助手'), _('为区域流量明确选择允许的连接跟踪助手'));
        o.depends('auto_helper', '0');
        o.modalonly = true;
        for (var i = 0; i < ctHelpers.length; i++) {
            o.value(ctHelpers[i].name, E('<span><span class="hide-close">%s (%s)</span><span class="hide-open">%s</span></span>'.format(ctHelpers[i].description, ctHelpers[i].name.toUpperCase(), ctHelpers[i].name.toUpperCase())));
        }

        o = s.taboption('advanced', form.Flag, 'log', _('启用此区域的日志记录'));
        o.modalonly = true;

        o = s.taboption('advanced', form.Value, 'log_limit', _('限制日志信息'));
        o.depends('log', '1');
        o.placeholder = '10/minute';
        o.modalonly = true;

        if (!L.hasSystemFeature('firewall4')) {
            o = s.taboption('extra', form.DummyValue, '_extrainfo');
            o.rawhtml = true;
            o.modalonly = true;
            o.cfgvalue = function (section_id) {
                return _('通过将 iptables 参数传递给源和目标流量的分类规则，可以根据接口或子网以外的其他条件来匹配数据包。使用这些选项应格外小心，因为无效值可能会破坏防火墙规则集而对外暴露所有服务');
            };

            o = s.taboption('extra', form.Value, 'extra_src', _('额外的源参数'), _('用于对区域源流量进行分类的额外 <em>iptables</em> 参数。如：<code>-p tcp --sport 443</code> 表示仅匹配入站 HTTPS 流量'));
            o.modalonly = true;
            o.cfgvalue = function (section_id) {
                return uci.get('firewall', section_id, 'extra_src') || uci.get('firewall', section_id, 'extra');
            };
            o.write = function (section_id, value) {
                uci.unset('firewall', section_id, 'extra');
                uci.set('firewall', section_id, 'extra_src', value);
            };

            o = s.taboption('extra', form.Value, 'extra_dest', _('额外的目标参数'), _('用于对区域目标流量进行分类的额外 <em>iptables</em> 参数。如：<code>-p tcp --dport 443</code> 表示仅匹配出站 HTTPS 流量'));
            o.modalonly = true;
            o.cfgvalue = function (section_id) {
                return uci.get('firewall', section_id, 'extra_dest') || uci.get('firewall', section_id, 'extra_src') || uci.get('firewall', section_id, 'extra');
            };
            o.write = function (section_id, value) {
                uci.unset('firewall', section_id, 'extra');
                uci.set('firewall', section_id, 'extra_dest', value);
            };
        }

        o = s.taboption('general', form.DummyValue, '_forwardinfo');
        o.rawhtml = true;
        o.modalonly = true;
        o.cfgvalue = function (section_id) {
            var name = uci.get('firewall', section_id, 'name');
            if (name == null) {
                name = _("新区域");
            }
            return _('以下选项控制此区域（%s）和其它区域间的转发策略。<em>目标区域</em>接收<strong>源自 %q</strong> 的转发流量。<em>源区域</em>匹配的转发流量来自<strong>目标为 %q</strong> 的其它区域。转发规则的作用是<em>单向</em>的，例如：转发从 lan 到 wan 的流量并<em>不</em>意味着允许反向转发从 wan 到 lan 的流量')
                .format(name);
        };

        out = o = s.taboption('general', widgets.ZoneSelect, 'out', _('允许转发到<em>目标区域</em>：'));
        o.nocreate = true;
        o.multiple = true;
        o.modalonly = true;
        o.filter = function (section_id, value) {
            return (uci.get('firewall', section_id, 'name') != value);
        };
        o.cfgvalue = function (section_id) {
            var out = (this.option == 'out'),
                zone = this.lookupZone(uci.get('firewall', section_id, 'name')),
                fwds = zone ? zone.getForwardingsBy(out ? 'src' : 'dest') : [],
                value = [];

            for (var i = 0; i < fwds.length; i++) {
                value.push(out ? fwds[i].getDestination() : fwds[i].getSource());
            }

            return value;
        };
        o.write = o.remove = function (section_id, formvalue) {
            var out = (this.option == 'out'),
                zone = this.lookupZone(uci.get('firewall', section_id, 'name')),
                fwds = zone ? zone.getForwardingsBy(out ? 'src' : 'dest') : [];

            if (formvalue == null) {
                formvalue = [];
            }

            if (Array.isArray(formvalue)) {
                for (var i = 0; i < fwds.length; i++) {
                    var cmp = out ? fwds[i].getDestination() : fwds[i].getSource();
                    if (!formvalue.filter(function (d) { return d == cmp }).length) {
                        zone.deleteForwarding(fwds[i]);
                    }
                }

                for (var i = 0; i < formvalue.length; i++)
                    if (out) {
                        zone.addForwardingTo(formvalue[i]);
                    } else {
                        zone.addForwardingFrom(formvalue[i]);
                    }
            }
        };

        inp = o = s.taboption('general', widgets.ZoneSelect, 'in', _('允许来自<em>源区域</em>的转发：'));
        o.nocreate = true;
        o.multiple = true;
        o.modalonly = true;
        o.write = o.remove = out.write;
        o.filter = out.filter;
        o.cfgvalue = out.cfgvalue;

        return m.render();
    }
});
