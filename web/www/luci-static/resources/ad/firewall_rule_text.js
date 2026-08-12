'use strict';
'require uci';
'require tools.firewall as fwtool';
'require baseclass';

function getProtoEntries(sectionId, withIcmpTypes) {
    return L.toArray(uci.get('firewall', sectionId, 'proto')).filter(function (p) {
        return (p != '*' && p != 'any' && p != 'all');
    }).map(function (p) {
        var pr = fwtool.lookupProto(p);
        return {
            num: pr[0],
            name: pr[1],
            types: (withIcmpTypes && (pr[0] == 1 || pr[0] == 58)) ? L.toArray(uci.get('firewall', sectionId, 'icmp_type')) : null
        };
    });
}

function getHelperInfo(sectionId, ctHelpers) {
    var m = String(uci.get('firewall', sectionId, 'helper') || '').match(/^(!\s*)?(\S+)$/);
    if (!m) {
        return null;
    }

    var desc = null;
    if (Array.isArray(ctHelpers)) {
        desc = (ctHelpers.filter(function (ctH) {
            return ctH.name.toLowerCase() == m[2].toLowerCase();
        })[0] || {}).description;
    }

    return {
        val: m[0].toUpperCase(),
        inv: m[1],
        name: desc
    };
}

function getMarkInfo(sectionId) {
    var m = String(uci.get('firewall', sectionId, 'mark')).match(/^(!\s*)?(0x[0-9a-f]{1,8}|[0-9]{1,10})(?:\/(0x[0-9a-f]{1,8}|[0-9]{1,10}))?$/i);

    return m ? {
        val: m[0].toUpperCase().replace(/X/g, 'x'),
        inv: m[1],
        num: '0x%02X'.format(+m[2]),
        mask: m[3] ? '0x%02X'.format(+m[3]) : null
    } : null;
}

function getDscpInfo(sectionId) {
    var m = String(uci.get('firewall', sectionId, 'dscp')).match(/^(!\s*)?(?:(CS[0-7]|BE|AF[1234][123]|EF)|(0x[0-9a-f]{1,2}|[0-9]{1,2}))$/);

    return m ? {
        val: m[0],
        inv: m[1],
        name: m[2],
        num: m[3] ? '0x%02X'.format(+m[3]) : null
    } : null;
}

function getLimitInfo(sectionId) {
    var m = String(uci.get('firewall', sectionId, 'limit')).match(/^(\d+)\/([smhd])\w*$/i);

    return m ? {
        num: +m[1],
        unit: ({ s: _('秒'), m: _('分钟'), h: _('小时'), d: _('日') })[m[2]],
        burst: uci.get('firewall', sectionId, 'limit_burst')
    } : null;
}

function renderLimitText(sectionId) {
    var limit = getLimitInfo(sectionId);
    if (!limit) {
        return '';
    }

    return fwtool.fmt(_('限制匹配到 <var>%{limit.num}</var> 包每 <var>%{limit.unit}</var>%{limit.burst? 突发 <var>%{limit.burst}</var>}'), {
        limit: limit
    });
}

var FirewallRuleText = baseclass.extend({
    getProtoEntries: getProtoEntries,
    getHelperInfo: getHelperInfo,
    getMarkInfo: getMarkInfo,
    getDscpInfo: getDscpInfo,
    getLimitInfo: getLimitInfo,
    renderLimitText: renderLimitText
});

return FirewallRuleText;
