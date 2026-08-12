(function (global) {
    'use strict';

    (function ensureStyle() {
        var old = document.getElementById('ns-toast-style');
        if (old && old.parentNode) {
            old.parentNode.removeChild(old);
        }
        var id = 'ns-toast-stack-style';
        var st = document.getElementById(id);
        if (!st) {
            st = document.createElement('style');
            st.id = id;
            (document.head || document.documentElement).appendChild(st);
        }
        st.textContent = `
            .ns-toast-layer {
                position: fixed;
                top: 12px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 9999;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                pointer-events: none;
            }
            .ns-toast {
                transform: translateY(-10px);
                opacity: 0;
                pointer-events: none;
                background: #fff;
                color: #121419;
                border: 1px solid #232c35;
                border-radius: 10px;
                padding: 10px 16px;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                box-shadow: 0 8px 20px rgba(0,0,0,.35);
                transition: transform .3s ease, opacity .3s ease, background .2s ease;
                font-size: 14px;
                line-height: 1.4;
                cursor: pointer;
            }
            .ns-toast.show {
                transform: translateY(0);
                opacity: 1;
                pointer-events: auto;
            }
            .ns-toast img {
                width: 15px;
                height: 15px;
                flex-shrink: 0;
            }
            .ns-toast:hover {
                background: #fff;
                box-shadow: 0 10px 24px rgba(0,0,0,.4);
            }
        `;
    })();

    function normalizeType(t) {
        var v = (t == null ? '' : String(t)).toLowerCase().trim();
        if (v === 'succes') {
            v = 'success';
        }
        if (v !== 'success' && v !== 'warn' && v !== 'error') {
            v = 'warn';
        }
        return v;
    }

    function clearToastLayer() {
        var layer = document.querySelector('.ns-toast-layer');
        if (!layer) {
            return;
        }
        var items = layer.querySelectorAll('.ns-toast');
        items.forEach(function (item) {
            if (typeof item.__toastDismiss === 'function') {
                item.__toastDismiss(true);
            } else {
                item.remove();
            }
        });
        if (!layer.children.length) {
            layer.remove();
        }
    }

    function getToastLayer() {
        var layer = document.querySelector('.ns-toast-layer');
        if (layer) {
            return layer;
        }
        layer = document.createElement('div');
        layer.className = 'ns-toast-layer';
        document.body.appendChild(layer);
        return layer;
    }

    function showToast(text, type, delay) {
        if (document.hidden) {
            return;
        }

        var t = normalizeType(type);

        var ICONS = {
            success: '/luci-static/custom/img/toast-success.svg',
            warn: '/luci-static/custom/img/toast-warn.svg',
            error: '/luci-static/custom/img/toast-error.svg'
        };
        var iconSrc = ICONS[t];

        var div = document.createElement('div');
        div.className = 'ns-toast';
        div.setAttribute('role', 'status');
        div.setAttribute('aria-live', 'polite');

        var img = document.createElement('img');
        img.src = iconSrc;
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        var span = document.createElement('span');
        span.textContent = text || '';
        div.appendChild(img);
        div.appendChild(span);

        var layer = getToastLayer();

        function dismiss(immediate) {
            if (div.__toastClosed) {
                return;
            }
            div.__toastClosed = true;
            div.classList.remove('show');
            if (immediate) {
                div.remove();
                if (layer && !layer.children.length) {
                    layer.remove();
                }
                window.removeEventListener('keydown', onKey);
                div.removeEventListener('click', onClick);
                return;
            }
            setTimeout(function () {
                div.remove();
                if (layer && !layer.children.length) {
                    layer.remove();
                }
            }, 250);
            window.removeEventListener('keydown', onKey);
            div.removeEventListener('click', onClick);
        }
        function onKey(e) {
            if (e.key === 'Escape') {
                dismiss();
            }
        }
        function onClick() {
            dismiss();
        }
        div.__toastDismiss = dismiss;

        layer.insertBefore(div, layer.firstChild);
        requestAnimationFrame(function () {
            div.classList.add('show');
        });

        window.addEventListener('keydown', onKey);
        div.addEventListener('click', onClick);

        var ttl = (typeof delay === 'number') ? delay : 2000;
        setTimeout(dismiss, ttl);
    }

    function toastWarn(text, delay) {
        showToast(text, 'warn', delay);
    }
    function toastSuccess(text, delay) {
        showToast(text, 'success', delay);
    }
    function toastError(text, delay) {
        showToast(text, 'error', delay);
    }

    function toast(type, text, delay) {
        showToast(text, type, delay);
    }

    global.showToast = global.showToast || showToast;
    global.toastWarn = global.toastWarn || toastWarn;
    global.toastSuccess = global.toastSuccess || toastSuccess;
    global.toastError = global.toastError || toastError;
    global.toast = global.toast || toast;

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            clearToastLayer();
        }
    });
})(window);
