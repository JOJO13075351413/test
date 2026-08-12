'use strict';

(function (win) {
    if (!win) {
        return;
    }

    var ACTIONS = {
        WIRELESS_CONFIG_SAVE: {
            pageKey: function (ctx) { return wirelessPageKey(ctx.sectionKey || ctx.sectionTitle); },
            actionKey: 'config.save'
        },
        WIRELESS_CONFIG_APPLY: {
            pageKey: function (ctx) { return wirelessPageKey(ctx.sectionKey || ctx.sectionTitle); },
            actionKey: 'config.apply'
        },
        WIRELESS_COMMON_SAVE: {
            pageKey: 'page.ad.network.wireless.common',
            actionKey: 'config.save'
        },
        WIRELESS_LOW_POWER_SAVE: {
            pageKey: 'page.ad.network.wireless.low_power',
            actionKey: 'config.save'
        },
        WIRELESS_LOW_POWER_REFRESH: {
            pageKey: 'page.ad.network.wireless.low_power',
            actionKey: 'manual.refresh'
        },
        ACCESS_DEV_REFRESH: {
            pageKey: 'page.ad.access.fd',
            actionKey: 'manual.refresh'
        },
        NETWORK_INTERFACE_REFRESH: {
            pageKey: 'page.ad.network.interface',
            actionKey: 'manual.refresh'
        },
        NETWORK_INTERFACE_PAUSE_AUTO_REFRESH: {
            pageKey: 'page.ad.network.interface.info',
            actionKey: 'auto_refresh.pause'
        },
        NETWORK_INTERFACE_RESUME_AUTO_REFRESH: {
            pageKey: 'page.ad.network.interface.info',
            actionKey: 'auto_refresh.resume'
        },
        HOST_DETAIL_REFRESH: {
            pageKey: 'page.ad.host.detail',
            actionKey: 'manual.refresh'
        },
        HOST_DETAIL_CONFIG_MODIFY: {
            pageKey: 'page.ad.host.detail',
            actionKey: 'config.modify'
        },
        HOST_DETAIL_CONFIG_APPLY: {
            pageKey: 'page.ad.host.detail',
            actionKey: 'config.apply'
        },
        HOST_DETAIL_REBOOT: {
            pageKey: 'page.ad.host.detail',
            actionKey: 'device.reboot'
        },
        HOST_DETAIL_FACTORY_RESET: {
            pageKey: 'page.ad.host.detail',
            actionKey: 'factory.reset'
        },
        HOST_UPDATE_REFRESH: {
            pageKey: 'page.ad.host.update',
            actionKey: 'manual.refresh'
        },
        HOST_UPDATE_ADD_PACKAGE: {
            pageKey: 'page.ad.host.update',
            actionKey: 'upgrade.package.add'
        },
        HOST_UPDATE_DELETE_PACKAGE: {
            pageKey: 'page.ad.host.update',
            actionKey: 'upgrade.package.delete'
        },
        HOST_UPDATE_START_UPGRADE: {
            pageKey: 'page.ad.host.update',
            actionKey: 'upgrade.start'
        },
        INDEX_PING_TEST: {
            pageKey: 'page.ad.index',
            actionKey: 'tool.ping'
        },
        INDEX_REBOOT: {
            pageKey: 'page.ad.index',
            actionKey: 'device.reboot'
        }
    };

    var LABELS = {
        page: {
            'page.ad.index': '主页',
            'page.ad.access.fd': '无线接入模块',
            'page.ad.network.interface': '端口配置',
            'page.ad.network.interface.info': '端口配置-端口信息',
            'page.ad.network.wireless.config': '无线网络配置',
            'page.ad.network.wireless.24g': '无线网络配置-2.4G无线网络配置',
            'page.ad.network.wireless.5g': '无线网络配置-5G无线网络配置',
            'page.ad.network.wireless.low_power': '无线网络配置-低功耗无线网络设置',
            'page.ad.network.wireless.common': '无线网络配置-通用无线网络配置',
            'page.ad.host.detail': '设备详情',
            'page.ad.host.update': '升级管理',
            'page.ad.log.operation': '操作日志',
            'page.ad.log.system': '系统日志',
            'page.ad.log.kernel': '内核日志'
        },
        action: {
            'manual.refresh': '主动刷新',
            'auto_refresh.pause': '暂停自动刷新',
            'auto_refresh.resume': '开启自动刷新',
            'config.save': '配置保存',
            'config.modify': '配置修改',
            'config.apply': '配置生效',
            'device.reboot': '设备重启',
            'factory.reset': '恢复出厂设置',
            'upgrade.package.add': '添加升级包',
            'upgrade.package.delete': '删除升级包',
            'upgrade.start': '发起升级',
            'tool.ping': 'Ping包测试',
            'emp.modify': '修改',
            'emp.execute': '执行'
        },
        result: {
            success: '成功',
            failure: '失败'
        }
    };

    function resolveValue(value, ctx) {
        if (typeof value === 'function') {
            return value(ctx || {});
        }
        return value;
    }

    function wirelessPageKey(section) {
        var s = String(section || '').trim();
        if (s === 'wireless24g' || s.indexOf('2.4G') >= 0) {
            return 'page.ad.network.wireless.24g';
        }
        if (s === 'wireless5g' || s.indexOf('5G') >= 0) {
            return 'page.ad.network.wireless.5g';
        }
        if (s === 'wirelessLowPower' || s.indexOf('低功耗') >= 0) {
            return 'page.ad.network.wireless.low_power';
        }
        if (s === 'wirelessCommon' || s.indexOf('通用') >= 0) {
            return 'page.ad.network.wireless.common';
        }
        return 'page.ad.network.wireless.config';
    }

    function translate(type, key) {
        var k = String(key || '').trim();
        var label = LABELS[type] && LABELS[type][k];
        if (!label) {
            return k || '-';
        }
        try {
            return typeof win._ === 'function' ? win._(label) : label;
        } catch (e) {
            return label;
        }
    }

    function build(key, ctx) {
        var def = ACTIONS[key];
        var c = ctx || {};
        if (!def) {
            return null;
        }
        return {
            page_key: resolveValue(def.pageKey, c) || '-',
            action_key: resolveValue(def.actionKey, c) || '-'
        };
    }

    function attach(req, key, ctx) {
        var meta = build(key, ctx);
        if (!req || !meta) {
            return req;
        }
        if (typeof win.attachEmpAudit === 'function') {
            return win.attachEmpAudit(req, meta);
        }
        req.__audit = meta;
        return req;
    }

    function record(key, ctx, result) {
        var meta = build(key, ctx);
        if (!meta || typeof win.recordAdAudit !== 'function') {
            return false;
        }
        meta.result = result || '成功';
        win.recordAdAudit(meta);
        return true;
    }

    win.adAuditActions = {
        actions: ACTIONS,
        build: build,
        attach: attach,
        record: record,
        translate: translate,
        labels: LABELS
    };
})(window);
