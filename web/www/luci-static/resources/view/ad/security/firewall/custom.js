'use strict';
'require view';
'require fs';
'require ui';
'require ad.firewall_page as fwpage';

return view.extend({
    load: function () {
        return fwpage.withPageSetup(function () {
            return L.resolveDefault(fs.read('/etc/firewall.user'), '');
        });
    },

    handleSave: function (ev) {
        var value = (document.querySelector('textarea').value || '').trim().replace(/\r\n/g, '\n') + '\n';

        return fs.write('/etc/firewall.user', value).then(function (rc) {
            document.querySelector('textarea').value = value;
            ui.addNotification(null, E('p', _('内容已保存')), 'info');
            fs.exec('/etc/init.d/firewall', ['restart']);
        }).catch(function (e) {
            ui.addNotification(null, E('p', _('无法保存内容：%s').format(e.message)));
        });
    },

    render: function (fwuser) {
        return E([
            E('h2', _('防火墙 - 自定义规则')),
            E('p', {}, _('自定义规则允许您执行不属于防火墙框架的任意 iptables 命令。每次重启防火墙时，这些命令在默认的规则运行后立即执行。')),
            E('p', {}, E('textarea', { 'style': 'width:100%', 'rows': 25 }, [fwuser != null ? fwuser : '']))
        ]);
    },

    handleSaveApply: null,
    handleReset: null
});
