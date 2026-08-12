'use strict';
'require baseclass';

var CSS_HREF = '/luci-static/custom/css/security/firewall.css?v=r16';
var CSS_LINK_ID = 'ad-firewall-css';
var HIDE_STYLE_ID = 'ad-firewall-hide-style';
var addButtonObserver = null;
var HIDE_STYLE_TEXT = [
    'body[data-page^="admin-ad-security-firewall"] #view,',
    'body[data-page^="admin-ad-security-firewall"] div#maincontent {',
    '    visibility: hidden;',
    '}'
].join('\n');

function ensureFirewallCss() {
    if (document.getElementById(CSS_LINK_ID)) {
        return Promise.resolve();
    }

    return new Promise(function (resolve) {
        var link = document.createElement('link');
        link.id = CSS_LINK_ID;
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = CSS_HREF;
        link.onload = function () {
            resolve();
        };
        link.onerror = function () {
            resolve();
        };
        document.head.appendChild(link);
    });
}

function setFirewallPageHidden(hidden) {
    var styleEl = document.getElementById(HIDE_STYLE_ID);

    if (!hidden) {
        if (styleEl && styleEl.parentNode) {
            styleEl.parentNode.removeChild(styleEl);
        }
        return;
    }

    if (styleEl) {
        return;
    }

    styleEl = document.createElement('style');
    styleEl.id = HIDE_STYLE_ID;
    styleEl.type = 'text/css';
    styleEl.textContent = HIDE_STYLE_TEXT;
    document.head.appendChild(styleEl);
}

function relocateAddButtons() {
    var view = document.getElementById('view');
    var actions = view ? view.querySelector('.cbi-page-actions.control-group') : null;

    if (!view || !actions) {
        return;
    }

    var nodes = Array.prototype.slice.call(view.querySelectorAll('.cbi-section-create.cbi-tblsection-create')).filter(function (node) {
        return node.querySelector('.cbi-button-add') && !actions.contains(node);
    });

    if (!nodes.length) {
        return;
    }

    actions.querySelectorAll('.ad-firewall-add-action').forEach(function (node) {
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    });

    nodes.forEach(function (node) {
        node.classList.add('ad-firewall-add-action');
        actions.insertBefore(node, actions.firstChild);
    });
}

function prepareDescriptionNode(node) {
    var text = (node.textContent || '').trim();

    if (!text) {
        return;
    }

    node.setAttribute('data-ad-tip', text);
    node.setAttribute('aria-label', text);
    node.classList.add('ad-firewall-help-tip');
    node.addEventListener('mouseenter', function () {
        setTipWidth(node);
    });
}

function prepareModalDescriptions() {
    document.querySelectorAll('body[data-page^="admin-ad-security-firewall"] .modal.cbi-modal .cbi-value-description:not(.ad-firewall-help-tip)').forEach(prepareDescriptionNode);
}

function prepareOffloadDescriptions() {
    document.querySelectorAll('body[data-page^="admin-ad-security-firewall"] div#cbi-firewall-defaults .cbi-value-description:not(.ad-firewall-help-tip)').forEach(function (node) {
        var text = (node.textContent || '').trim();

        if (text !== _('基于软件的 路由/NAT 分载') && text !== _('需要硬件 NAT 支持。目前 mt7621 已实现')) {
            return;
        }

        prepareDescriptionNode(node);
    });
}

function setTipWidth(node) {
    var modal = node ? node.closest('.modal.cbi-modal') : null;
    var panel = modal || (node ? node.closest('.cbi-section') : null);

    if (!panel || typeof panel.getBoundingClientRect !== 'function' || typeof node.getBoundingClientRect !== 'function') {
        return;
    }

    var modalRect = panel.getBoundingClientRect();
    var nodeRect = node.getBoundingClientRect();
    var available = Math.floor(modalRect.right - nodeRect.right - 40);

    node.style.setProperty('--ad-firewall-tip-width', Math.max(180, available) + 'px');
}

function updateTipWidths() {
    document.querySelectorAll('body[data-page^="admin-ad-security-firewall"] .cbi-value-description.ad-firewall-help-tip').forEach(setTipWidth);
}

function syncDynamicLayout() {
    relocateAddButtons();
    prepareModalDescriptions();
    prepareOffloadDescriptions();
    updateTipWidths();
}

function installAddButtonRelocation() {
    if (addButtonObserver) {
        addButtonObserver.disconnect();
        addButtonObserver = null;
    }

    window.setTimeout(syncDynamicLayout, 0);

    addButtonObserver = new MutationObserver(function () {
        syncDynamicLayout();
    });

    addButtonObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function ensureSystemFeatures() {
    if (typeof L == 'undefined' || typeof L.probeSystemFeatures != 'function') {
        return Promise.resolve({});
    }

    return L.resolveDefault(L.probeSystemFeatures(), {});
}

function withPageSetup(loaderFn) {
    setFirewallPageHidden(true);

    return Promise.all([
        ensureFirewallCss(),
        ensureSystemFeatures()
    ]).then(function () {
        return loaderFn();
    }).finally(function () {
        installAddButtonRelocation();
        setFirewallPageHidden(false);
    });
}

var FirewallPage = baseclass.extend({
    ensureFirewallCss: ensureFirewallCss,
    ensureSystemFeatures: ensureSystemFeatures,
    relocateAddButtons: relocateAddButtons,
    setFirewallPageHidden: setFirewallPageHidden,
    withPageSetup: withPageSetup
});

return FirewallPage;
