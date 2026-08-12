'use strict';

(function (win) {
    if (!win) {
        return;
    }

    function queryCurrentModal() {
        return document.querySelector('#modal_overlay .modal, #modal_overlay .ui-modal');
    }

    function normalizeWidth(width) {
        if (width == null || width === '') {
            return '';
        }
        if (typeof width === 'number' && isFinite(width)) {
            return Math.max(260, Math.round(width)) + 'px';
        }
        var text = String(width).trim();
        if (!text) {
            return '';
        }
        if (/^\d+(\.\d+)?$/.test(text)) {
            return Math.max(260, Math.round(parseFloat(text))) + 'px';
        }
        return text;
    }

    function decorate(node, opts) {
        if (!node || !node.classList) {
            return false;
        }
        node.classList.add('ad-theme-modal');
        var width = normalizeWidth(opts && opts.width);
        if (width) {
            node.style.setProperty('--ad-modal-width', width);
        } else {
            node.style.removeProperty('--ad-modal-width');
        }
        return true;
    }

    function decorateCustomModal(root) {
        if (!root || !root.classList) {
            return false;
        }
        if (!root.classList.contains('ad-modal')) {
            return false;
        }
        return true;
    }

    function normalizeExistingCustomModals() {
        Array.prototype.forEach.call(document.querySelectorAll('.ad-modal'), decorateCustomModal);
    }

    function observeCustomModals() {
        if (!document.body || win.__adModalObserverReady) {
            return;
        }
        win.__adModalObserverReady = true;
        normalizeExistingCustomModals();
        if (typeof MutationObserver !== 'function') {
            return;
        }
        var observer = new MutationObserver(function (records) {
            records.forEach(function (record) {
                Array.prototype.forEach.call(record.addedNodes || [], function (node) {
                    if (!node || node.nodeType !== 1) {
                        return;
                    }
                    decorateCustomModal(node);
                    Array.prototype.forEach.call(node.querySelectorAll ? node.querySelectorAll('.ad-modal') : [], decorateCustomModal);
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function applyVariant(opts) {
        var tries = 0;
        function applyOnce() {
            var modal = queryCurrentModal();
            if (modal) {
                decorate(modal, opts || {});
                return;
            }
            tries += 1;
            if (tries < 60) {
                setTimeout(applyOnce, 16);
            }
        }
        applyOnce();
    }

    function show(uiRef, title, nodes, opts) {
        if (!uiRef || typeof uiRef.showModal !== 'function') {
            return false;
        }
        uiRef.showModal(title, nodes);
        applyVariant(opts || {});
        return true;
    }

    function close(root) {
        if (root && root.parentNode) {
            root.parentNode.removeChild(root);
        }
    }

    function showCustom(title, body, footer, opts) {
        var options = opts || {};
        var overlay = document.createElement('div');
        overlay.className = 'ad-modal';

        var panel = document.createElement('div');
        panel.className = 'ad-modal-panel' + (options.panelClass ? (' ' + options.panelClass) : '');
        var width = normalizeWidth(options.width);
        if (width) {
            panel.style.setProperty('--ad-modal-width', width);
        }

        var header = document.createElement('div');
        header.className = 'ad-modal-hd';

        var titleNode = document.createElement('div');
        titleNode.className = 'ad-modal-title';
        titleNode.textContent = String(title == null ? '' : title);

        var closeBtn = document.createElement('button');
        closeBtn.className = 'ad-modal-x';
        closeBtn.setAttribute('aria-label', options.closeLabel || '关闭');
        closeBtn.addEventListener('click', function () {
            close(overlay);
        });

        header.appendChild(titleNode);
        header.appendChild(closeBtn);

        var bodyNode = document.createElement('div');
        bodyNode.className = 'ad-modal-bd';
        if (Array.isArray(body)) {
            body.forEach(function (node) {
                bodyNode.appendChild(node);
            });
        } else if (body) {
            bodyNode.appendChild(body);
        }

        var footerNode = document.createElement('div');
        footerNode.className = 'ad-modal-ft';
        if (Array.isArray(footer)) {
            footer.forEach(function (node) {
                footerNode.appendChild(node);
            });
        } else if (footer) {
            footerNode.appendChild(footer);
        }

        panel.appendChild(header);
        panel.appendChild(bodyNode);
        if (footerNode.childNodes.length) {
            panel.appendChild(footerNode);
        }
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        decorateCustomModal(overlay);
        return {
            root: overlay,
            panel: panel,
            close: function () {
                close(overlay);
            }
        };
    }

    win.adModal = Object.assign(win.adModal || {}, {
        show: show,
        showCustom: showCustom,
        applyVariant: applyVariant,
        decorate: decorate,
        decorateCustomModal: decorateCustomModal
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observeCustomModals);
    } else {
        observeCustomModals();
    }
})(window);
