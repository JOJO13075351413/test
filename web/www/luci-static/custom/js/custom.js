(function () {
    'use strict';

    (function ensureToastJS() {
        if (!window.toastSuccess) {
            var s = document.createElement('script');
            s.src = '/luci-static/custom/js/toast.js';
            s.defer = true;
            (document.head || document.documentElement).appendChild(s);
        }
    })();

    var OPEN_KEY = 'luci_menu_open_set_v1';
    var SCROLL_KEY_BASE = 'luci_menu_scroll_v1';

    function getScrollKey() {
        return SCROLL_KEY_BASE + ':ad';
    }

    function loadOpenSet() {
        try {
            return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) || '[]'));
        } catch (e) {
            return new Set();
        }
    }
    function saveOpenSet(set) {
        try {
            localStorage.setItem(OPEN_KEY, JSON.stringify(Array.from(set)));
        } catch (e) { }
    }
    function keyOfGroup(li) {
        var a = li && li.querySelector(':scope > a');
        return a ? (a.textContent || a.innerText || '').replace(/\s+/g, ' ').trim() : '';
    }
    function getGroups(menu) {
        var res = [], lis = menu ? menu.children : [];
        for (var i = 0; i < lis.length; i++) {
            var li = lis[i];
            if (!li || !li.querySelector) {
                continue;
            }
            if (li.querySelector(':scope > ul.dropdown-menu') && li.querySelector(':scope > a')) {
                res.push(li);
            }
        }
        return res;
    }
    function toggleOne(li, willOpen, openedSet) {
        if (!li) {
            return;
        }
        if (typeof willOpen === 'undefined') {
            willOpen = !li.classList.contains('open');
        }
        if (willOpen) {
            li.classList.add('open');
        } else {
            li.classList.remove('open');
        }

        var a = li.querySelector(':scope > a');
        if (a) {
            a.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        }

        var arrow = li.querySelector(':scope > a .arrow-icon');
        if (arrow) {
            arrow.src = willOpen
                ? '/luci-static/custom/img/arrow-up.svg'
                : '/luci-static/custom/img/arrow-down.svg';
        }

        var k = keyOfGroup(li);
        if (!k) {
            return;
        }
        if (willOpen) {
            openedSet.add(k);
        } else {
            openedSet.delete(k);
        }
        if (!willOpen) {
            li.__manulClosed = true;
        } else {
            delete li.__manulClosed;
        }
        saveOpenSet(openedSet);
    }

    function collapseAllDropdowns() {
        var menu = document.getElementById('topmenu');
        if (!menu) {
            return;
        }
        var dds = menu.querySelectorAll('li.dropdown');
        for (var i = 0; i < dds.length; i++) {
            var li = dds[i];
            li.classList.remove('open', 'active');
            var a = li.querySelector(':scope > a');
            if (a) {
                a.setAttribute('aria-expanded', 'false');
            }
            var arrow = li.querySelector(':scope > a .arrow-icon');
            if (arrow) {
                arrow.src = '/luci-static/custom/img/arrow-down.svg';
            }
        }
    }

    function installScrollKeeper(container) {
        if (!container) { return; }
        var key = getScrollKey();
        try {
            container.scrollTop = +localStorage.getItem(key) || 0;
        } catch (e) { }
        container.addEventListener('scroll', function () {
            try {
                localStorage.setItem(key, container.scrollTop);
            } catch (e) { }
        }, { passive: true });
        window.addEventListener('beforeunload', function () {
            try {
                localStorage.setItem(key, container.scrollTop);
            } catch (e) { }
        });
    }
    function installMenuBehavior(menu) {
        if (!menu || menu.__installed) {
            return false;
        }
        menu.__installed = true;

        var opened = loadOpenSet(), groups = getGroups(menu);

        for (var i = 0; i < groups.length; i++) {
            var li = groups[i], k = keyOfGroup(li);
            toggleOne(li, !!opened.has(k), opened);
        }

        (function ensureActiveGroupOpen() {
            function normalizePath(href) {
                try {
                    return href.replace(/^\/cgi-bin\/luci\/?/, '')
                        .replace(/[?#].*$/, '')
                        .replace(/\/+$/, '');
                } catch (e) {
                    return href || '';
                }
            }

            var cur = normalizePath(location.pathname);
            if (!cur) {
                return;
            }

            var best = null, bestLen = -1;
            var links = menu.querySelectorAll('a[href^="/cgi-bin/luci/"]');
            links.forEach(function (a) {
                var href = normalizePath(a.getAttribute('href') || '');
                if (!href) {
                    return;
                }
                if (href === cur || cur.indexOf(href) === 0) {
                    if (href.length > bestLen) {
                        best = a;
                        bestLen = href.length;
                    }
                }
            });

            if (!best) {
                return;
            }
            var parent = best.closest ? best.closest('li.dropdown') : null;
            if (parent) {
                toggleOne(parent, true, opened);
            }
        })();

        menu.addEventListener('click', function (ev) {
            var a = ev.target.closest ? ev.target.closest('#topmenu > li > a') : null;
            if (!a) {
                return;
            }
            var li = a.parentNode;
            if (!li || !li.querySelector(':scope > ul.dropdown-menu')) {
                return;
            }
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.stopImmediatePropagation) {
                ev.stopImmediatePropagation();
            }
            toggleOne(li, !li.classList.contains('open'), opened);
        }, true);

        installScrollKeeper(document.querySelector('.sidenav .scroll') || menu);
        return true;
    }
    function bootstrapMenu() {
        var menu = document.getElementById('topmenu');
        if (!menu || !menu.querySelector('li')) {
            return false;
        }
        return installMenuBehavior(menu);
    }

    function installClock() {
        if (installClock.__installed) {
            return;
        }
        installClock.__installed = true;

        var header = document.querySelector('.app-header');
        var modemenu = document.getElementById('modemenu');
        if (!header || !modemenu) {
            return;
        }

        try {
            modemenu.style.marginLeft = '12px';
        } catch (e) { }

        var clock = document.createElement('div');
        clock.id = 'header-clock';
        clock.style.display = 'flex';
        clock.style.alignItems = 'center';
        clock.style.height = '28px';
        clock.style.padding = '0 10px';
        clock.style.marginLeft = 'auto';
        clock.style.marginRight = '8px';
        clock.style.fontSize = '13px';
        clock.style.lineHeight = '1';
        clock.style.color = '#cbd5e1';
        clock.style.userSelect = 'none';
        clock.style.whiteSpace = 'nowrap';

        function pad(n) {
            return (n < 10 ? '0' : '') + n;
        }
        function fmt(now) {
            var y = now.getFullYear(),
                m = pad(now.getMonth() + 1),
                d = pad(now.getDate()),
                h = pad(now.getHours()),
                i = pad(now.getMinutes()),
                s = pad(now.getSeconds());
            return y + '-' + m + '-' + d + '  ' + h + ':' + i + ':' + s;
        }
        function tick() {
            clock.textContent = fmt(new Date());
        }
        tick();
        var t = setInterval(tick, 1000);
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                tick();
            }
        });

        window.addEventListener('beforeunload', function () {
            clearInterval(t);
        });
        header.insertBefore(clock, modemenu);
    }

    function installBreadcrumb() {
        var header = document.querySelector('.app-header');
        var modemenu = document.getElementById('modemenu');
        var clock = document.getElementById('header-clock');
        if (!header || !modemenu || !clock) {
            return;
        }

        var bc = document.getElementById('header-breadcrumb');
        if (!bc) {
            bc = document.createElement('div');
            bc.id = 'header-breadcrumb';
            bc.style.display = 'flex';
            bc.style.alignItems = 'center';
            bc.style.gap = '8px';
            bc.style.color = '#cbd5e1';
            bc.style.fontSize = '13px';
            bc.style.whiteSpace = 'nowrap';
            bc.style.overflow = 'hidden';
            bc.style.textOverflow = 'ellipsis';

            header.insertBefore(bc, clock);
        }

        function padText(txt) {
            return (txt || '').replace(/\s+/g, ' ').trim();
        }

        function currentMenu() {
            var menu = document.getElementById('topmenu');
            if (!menu) {
                return {};
            }

            function normalizedPath(href) {
                try {
                    return href.replace(/^\/cgi-bin\/luci\/?/, '')
                        .replace(/[?#].*$/, '')
                        .replace(/\/+$/, '');
                } catch (e) {
                    return href || '';
                }
            }
            var cur = normalizedPath(location.pathname);

            function pickHomeFromTop() {
                var topLinks = menu.querySelectorAll(':scope > li > a[href^="/cgi-bin/luci/"]');
                var homeA = null;
                topLinks.forEach(function (a) {
                    var href = normalizedPath(a.getAttribute('href') || '');
                    var label = (a.textContent || '').replace(/\s+/g, ' ').trim();
                    if (href === 'admin' || href === 'admin/index' || label === _('主页')) {
                        homeA = a;
                    }
                });
                if (homeA) {
                    var iconEl = homeA.querySelector('.navi-icon');
                    return {
                        parent: (homeA.textContent || _('主页')).replace(/\s+/g, ' ').trim() || _('主页'),
                        child: '',
                        icon: iconEl && iconEl.getAttribute('src')
                    };
                }
                return { parent: _('主页'), child: '', icon: null };
            }
            if (cur === 'admin' || cur === 'admin/index' || cur === '') {
                return pickHomeFromTop();
            }

            var best = null, bestLen = -1;
            var links = menu.querySelectorAll('.dropdown-menu a[href^="/cgi-bin/luci/"]');
            links.forEach(function (a) {
                var href = normalizedPath(a.getAttribute('href') || '');
                if (!href) {
                    return;
                }
                if (href === cur || cur.indexOf(href) === 0) {
                    if (href.length > bestLen) {
                        best = a; bestLen = href.length;
                    }
                }
            });

            if (best) {
                var child = padText(best.textContent);
                var parentLi = best.closest('li.dropdown');
                var parentA = parentLi && parentLi.querySelector(':scope > a');
                var parent = padText(parentA ? parentA.textContent : '');
                var iconImg = parentA && parentA.querySelector('.navi-icon');
                var iconSrc = iconImg && iconImg.getAttribute('src');
                return { parent: parent, child: child, icon: iconSrc };
            }

            var bestTop = null, bestTopLen = -1;
            var topLinks = menu.querySelectorAll(':scope > li > a[href^="/cgi-bin/luci/"]');
            topLinks.forEach(function (a) {
                var href = normalizedPath(a.getAttribute('href') || '');
                if (!href) {
                    return;
                }
                if (href === cur || cur.indexOf(href) === 0) {
                    if (href.length > bestTopLen) {
                        bestTop = a; bestTopLen = href.length;
                    }
                }
            });
            if (bestTop) {
                var iconImg2 = bestTop.querySelector('.navi-icon');
                return {
                    parent: padText(bestTop.textContent),
                    child: '',
                    icon: iconImg2 && iconImg2.getAttribute('src')
                };
            }

            return pickHomeFromTop();
        }

        (function render() {
            var { parent, child, icon } = currentMenu();
            var textValue = '';

            if (parent && child) {
                textValue = parent + ' / ' + child;
            } else if (parent) {
                textValue = parent;
            }

            var renderKey = [icon || '', textValue].join('\n');
            if (bc.__renderKey === renderKey) {
                return;
            }
            bc.__renderKey = renderKey;

            var img = bc.querySelector('.hb-icon');
            var text = bc.querySelector('.hb-text');
            if (icon) {
                if (!img) {
                    img = document.createElement('img');
                    img.className = 'hb-icon';
                    img.alt = '';
                    img.style.width = '16px';
                    img.style.height = '16px';
                    img.style.flex = '0 0 auto';
                    bc.insertBefore(img, text || null);
                }
                if (img.getAttribute('src') !== icon) {
                    img.src = icon;
                }
            } else if (img) {
                img.remove();
            }

            if (!text) {
                text = document.createElement('span');
                text.className = 'hb-text';
                text.style.overflow = 'hidden';
                text.style.textOverflow = 'ellipsis';
                text.style.whiteSpace = 'nowrap';
                bc.appendChild(text);
            }
            if (text.textContent !== textValue) {
                text.textContent = textValue;
            }
        })();
    }

    function patchModemenu() {
        var mm = document.getElementById('modemenu');
        if (!mm) {
            return;
        }

        var adminA = mm.querySelector('a[href$="/admin"]');
        if (!adminA) {
            return;
        }
        var li = adminA.closest('li');
        if (!li) {
            return;
        }

        (function ensureUserMenuCSS() {
            var id = 'user-menu-click-only-style';
            if (document.getElementById(id)) {
                return;
            }
            var st = document.createElement('style');
            st.id = id;
            st.textContent = [].join('');
            document.head.appendChild(st);
        })();

        var dropdown = document.createElement('li');
        dropdown.className = 'dropdown dropdown-manual';

        var toggle = document.createElement('a');
        toggle.href = '#';
        toggle.className = 'dropdown-toggle';

        toggle.removeAttribute('data-toggle');
        toggle.style.display = 'flex';
        toggle.style.alignItems = 'center';
        toggle.style.justifyContent = 'space-between';
        toggle.style.width = '100px';
        toggle.style.padding = '0 10px';
        toggle.style.textDecoration = 'none';

        var icon = document.createElement('img');
        icon.src = '/luci-static/custom/img/user-login.svg';
        icon.alt = 'user';
        icon.style.width = '20px';
        icon.style.height = '20px';
        icon.style.flex = '0 0 auto';
        icon.style.marginRight = '6px';
        icon.style.paddingBottom = '2px';

        var label = document.createElement('span');
        label.textContent = window.CURRENT_USER || _('用户');
        label.style.flex = '1 1 auto';
        label.style.whiteSpace = 'nowrap';
        label.style.overflow = 'hidden';
        label.style.textOverflow = 'ellipsis';
        label.style.fontSize = '16px';

        var arrow = document.createElement('img');
        arrow.src = '/luci-static/custom/img/arrow-solid-down.svg';
        arrow.alt = 'arrow';
        arrow.style.width = '16px';
        arrow.style.height = '16px';
        arrow.style.flex = '0 0 auto';
        arrow.className = 'user-arrow';

        toggle.appendChild(icon);
        toggle.appendChild(label);
        toggle.appendChild(arrow);

        var menu = document.createElement('ul');
        menu.className = 'dropdown-menu';

        var passwdLi = document.createElement('li');
        var passwdA = document.createElement('a');
        var passwdIcon = document.createElement('img');
        passwdIcon.src = '/luci-static/custom/img/passwd.svg';
        passwdIcon.alt = 'passwd';
        passwdA.href = '#';
        passwdA.appendChild(passwdIcon);
        passwdA.appendChild(document.createTextNode(_('修改密码')));
        passwdLi.appendChild(passwdA);

        passwdA.addEventListener('click', function (ev) {
            ev.preventDefault();
            setOpen(false);
            var name = (window.CURRENT_USER || '').trim() || 'root';
            rpcRootNoPassword().then(function (empty) {
                openChangePasswordModal(name, { disableOld: !!empty });
            });
        });

        var logoutLi = document.createElement('li');
        var logoutA = document.createElement('a');
        var exitIcon = document.createElement('img');
        exitIcon.src = '/luci-static/custom/img/exit-login.svg';
        exitIcon.alt = 'exit';
        logoutA.href = (window.L && L.url) ? L.url('admin/logout') : '/cgi-bin/luci/admin/logout';
        logoutA.appendChild(exitIcon);
        logoutA.appendChild(document.createTextNode(_('退出登录')));
        logoutLi.appendChild(logoutA);

        logoutA.addEventListener('click', function () {
            try {
                sessionStorage.removeItem('ad_skip_nopwd_bar_v1');
                localStorage.removeItem('ad_skip_nopwd_bar_v1');
            } catch (e) { }
        });

        menu.appendChild(passwdLi);
        menu.appendChild(logoutLi);

        dropdown.appendChild(toggle);
        dropdown.appendChild(menu);

        dropdown.classList.remove('open');

        function syncArrow(open) {
            toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
            var arr = toggle.querySelector('.user-arrow');
            if (arr) {
                arr.src = open
                    ? '/luci-static/custom/img/arrow-solid-up.svg'
                    : '/luci-static/custom/img/arrow-solid-down.svg';
            }
        }

        function setOpen(open) {
            dropdown.classList.toggle('open', !!open);
            syncArrow(!!open);
        }

        toggle.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            setOpen(!dropdown.classList.contains('open'));
        });

        toggle.setAttribute('role', 'button');
        toggle.setAttribute('tabindex', '0');
        toggle.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                setOpen(!dropdown.classList.contains('open'));
            }
        });

        menu.addEventListener('click', function (ev) {
            ev.stopPropagation();
        });
        document.addEventListener('click', function () {
            if (dropdown.classList.contains('open')) {
                setOpen(false);
            }
        });

        li.replaceWith(dropdown);
    }

    var ICON_BASE = '/luci-static/custom/img/';
    var ICON_MAP = {
        [_('主页')]: 'navi-index.svg',
        [_('系统状态')]: 'navi-status.svg',
        [_('设备状态')]: 'navi-status.svg',
        [_('本机配置')]: 'navi-host.svg',
        [_('网络配置')]: 'navi-network.svg',
        [_('高级功能')]: 'navi-advanced.svg',
        [_('日志管理')]: 'navi-logs.svg',
        [_('接入设备')]: 'navi-access.svg',
        [_('安全管理')]: 'navi-security.svg',
        'Status': 'oth-list.svg',
        'System': 'oth-list.svg',
        'Network': 'oth-list.svg',
        'VPN': 'oth-list.svg'
    };

    function addIcons() {
        var ul = document.getElementById('topmenu');
        if (!ul) {
            return;
        }

        Array.prototype.forEach.call(ul.children || [], function (li) {
            var a = li.querySelector(':scope > a');
            if (!a) {
                return;
            }
            var label = (a.textContent || '').replace(/\s+/g, ' ').trim();
            var file = ICON_MAP[label];
            if (!file) {
                return;
            }
            if (!a.querySelector('.navi-icon')) {
                var img = document.createElement('img');
                img.className = 'navi-icon';
                img.alt = '';
                img.src = ICON_BASE + file;
                a.prepend(img);
            }
        });
    }

    function addArrows() {
        var ul = document.getElementById('topmenu');
        if (!ul) {
            return;
        }

        Array.prototype.forEach.call(ul.children || [], function (li) {
            if (!li.classList.contains('dropdown')) {
                return;
            }
            var a = li.querySelector(':scope > a');
            if (!a) {
                return;
            }

            if (!a.querySelector('.arrow-icon')) {
                var img = document.createElement('img');
                img.className = 'arrow-icon';
                img.src = '/luci-static/custom/img/arrow-down.svg';
                a.appendChild(img);
            }
        });
    }

    function rpcSetPassword(username, password) {
        try {
            if (window.L && L.rpc && L.rpc.declare) {
                var call = L.rpc.declare({
                    object: 'luci',
                    method: 'setPassword',
                    params: ['username', 'password']
                });
                return call(username, password).then(function (ret) {
                    return (ret === true) || (ret && ret.result === true);
                });
            }
        } catch (e) { }
        return Promise.reject(new Error('RPC not available'));
    }
    function rpcRootNoPassword() {
        try {
            var flag = document.body && document.body.getAttribute && document.body.getAttribute('data-root-empty');
            if (flag === '1') {
                return Promise.resolve(true);
            }
            if (flag === '0') {
                return Promise.resolve(false);
            }
        } catch (e) { }

        return Promise.resolve(false);
    }

    var NOPWD_SKIP_KEY = 'ad_skip_nopwd_bar_v1';
    function shouldSkipNoPwdBar() {
        try {
            return sessionStorage.getItem(NOPWD_SKIP_KEY) === '1';
        } catch (e) {
            return false;
        }
    }

    function setSkipNoPwdBar(v) {
        try {
            sessionStorage.setItem(NOPWD_SKIP_KEY, v ? '1' : '0');
        } catch (e) { }
    }
    function showNoPasswordBar() {
        if (document.querySelector('.ad-nopwd-bar')) {
            return;
        }
        var bar = document.createElement('div');
        bar.className = 'ad-nopwd-bar';
        var msg = document.createElement('div');
        msg.className = 'msg';
        msg.innerHTML = '<strong>' + _('未设置密码') + '</strong>：' + _('当前用户未设置密码，请尽快修改以保障安全。');
        var ops = document.createElement('div');
        ops.className = 'ops';
        var btnHide = document.createElement('button');
        btnHide.className = 'ad-nopwd-btn';
        btnHide.textContent = _('不再提示');
        btnHide.addEventListener('click', function () {
            setSkipNoPwdBar(true);
            try {
                bar.remove();
            } catch (e) { }
        });
        var btnChange = document.createElement('button');
        btnChange.className = 'ad-nopwd-btn primary';
        btnChange.textContent = _('修改密码');
        btnChange.addEventListener('click', function () {
            var name = (window.CURRENT_USER || '').trim() || 'root';
            openChangePasswordModal(name, { disableOld: true });
        });
        ops.appendChild(btnHide);
        ops.appendChild(btnChange);
        bar.appendChild(msg);
        bar.appendChild(ops);
        document.body.appendChild(bar);
    }
    function rpcCheckPassword(username, password) {
        function doLogin(u, p) {
            if (!(window.L && L.rpc && L.rpc.declare)) {
                return Promise.resolve(false);
            }
            var login = L.rpc.declare({
                object: 'session',
                method: 'login',
                params: ['username', 'password']
            });
            return login(u, p).then(function (ret) {
                if (!ret) {
                    return false;
                }
                if (ret.ubus_rpc_session || ret.sid || ret.sessionid) {
                    return true;
                }

                try {
                    if (Array.isArray(ret) && ret[1] && (ret[1].ubus_rpc_session || ret[1].sid)) {
                        return true;
                    }
                    if (ret.result && Array.isArray(ret.result) && ret.result[1] &&
                        (ret.result[1].ubus_rpc_session || ret.result[1].sid)) {
                        return true;
                    }
                } catch (e) { }
                return false;
            }).catch(function () { return false; });
        }
        var u = (username || '').trim() || 'root';
        return doLogin(u, password).then(function (ok) {
            if (ok) {
                return true;
            }
            if (u === 'root') {
                return false;
            }
            return doLogin('root', password);
        }).catch(function () { return false; });
    }

    function openChangePasswordModal(username, opts) {
        opts = opts || {};
        var old = document.getElementById('cpw-mask');
        if (old) {
            old.remove();
        }

        var mask = document.createElement('div');
        mask.id = 'cpw-mask';
        mask.className = 'cpw-mask';

        var dlg = document.createElement('div');
        dlg.className = 'cpw-dialog';
        dlg.setAttribute('role', 'dialog');
        dlg.setAttribute('aria-modal', 'true');
        dlg.setAttribute('aria-label', 'Change password');

        var title = document.createElement('div');
        title.className = 'cpw-title';
        title.textContent = _('修改密码');

        var row1 = document.createElement('div');
        row1.className = 'cpw-row';
        var lab1 = document.createElement('div');
        lab1.className = 'cpw-label';
        lab1.textContent = _('当前用户');
        var val1 = document.createElement('div');
        val1.className = 'cpw-value';
        val1.textContent = username;
        row1.appendChild(lab1);
        row1.appendChild(val1);

        var row2 = document.createElement('div');
        row2.className = 'cpw-row';
        var lab2 = document.createElement('div');
        lab2.className = 'cpw-label';
        lab2.textContent = _('新密码');
        var box2 = document.createElement('div');
        box2.className = 'cpw-inputbox';
        var pw1 = document.createElement('input');
        pw1.type = 'password';
        pw1.className = 'cpw-input';
        pw1.placeholder = _('输入新密码');
        var eye1 = document.createElement('img');
        eye1.className = 'cpw-eye';
        eye1.src = '/luci-static/custom/img/eye-off.svg';
        eye1.alt = 'toggle';
        eye1.addEventListener('click', function () {
            var vis = pw1.type === 'password';
            pw1.type = vis ? 'text' : 'password';
            eye1.src = vis ? '/luci-static/custom/img/eye-on.svg'
                : '/luci-static/custom/img/eye-off.svg';
        });
        box2.appendChild(pw1);
        box2.appendChild(eye1);
        row2.appendChild(lab2);
        row2.appendChild(box2);

        var row3 = document.createElement('div');
        row3.className = 'cpw-row';
        var lab3 = document.createElement('div');
        lab3.className = 'cpw-label';
        lab3.textContent = _('确认密码');
        var box3 = document.createElement('div');
        box3.className = 'cpw-inputbox';
        var pw2 = document.createElement('input');
        pw2.type = 'password';
        pw2.className = 'cpw-input';
        pw2.placeholder = _('再次确认输入');
        var eye2 = document.createElement('img');
        eye2.className = 'cpw-eye';
        eye2.src = '/luci-static/custom/img/eye-off.svg';
        eye2.alt = 'toggle';
        eye2.addEventListener('click', function () {
            var vis = pw2.type === 'password';
            pw2.type = vis ? 'text' : 'password';
            eye2.src = vis ? '/luci-static/custom/img/eye-on.svg'
                : '/luci-static/custom/img/eye-off.svg';
        });
        box3.appendChild(pw2);
        box3.appendChild(eye2);
        row3.appendChild(lab3);
        row3.appendChild(box3);

        var actions = document.createElement('div');
        actions.className = 'cpw-actions';
        var btnCancel = document.createElement('button');
        btnCancel.className = 'cpw-btn cpw-btn-ghost';
        btnCancel.textContent = _('取消');
        var btnOK = document.createElement('button');
        btnOK.className = 'cpw-btn cpw-btn-primary';
        btnOK.textContent = _('确认');

        actions.appendChild(btnCancel);
        actions.appendChild(btnOK);

        dlg.appendChild(title);
        dlg.appendChild(row1);
        var rowOld = document.createElement('div');
        rowOld.className = 'cpw-row';
        var labOld = document.createElement('div');
        labOld.className = 'cpw-label';
        labOld.textContent = _('旧密码');
        var boxOld = document.createElement('div');
        boxOld.className = 'cpw-inputbox';
        var pwOld = document.createElement('input');
        pwOld.type = 'password';
        pwOld.className = 'cpw-input';
        pwOld.placeholder = opts.disableOld ? _('当前未设置密码（无需输入）') : _('输入旧密码');
        if (opts.disableOld) {
            pwOld.disabled = true;
            pwOld.style.opacity = '.65';
        }
        var eyeOld = document.createElement('img');
        eyeOld.className = 'cpw-eye';
        eyeOld.src = '/luci-static/custom/img/eye-off.svg';
        eyeOld.alt = 'toggle';
        eyeOld.addEventListener('click', function () {
            var vis = pwOld.type === 'password';
            pwOld.type = vis ? 'text' : 'password';
            eyeOld.src = vis ? '/luci-static/custom/img/eye-on.svg'
                : '/luci-static/custom/img/eye-off.svg';
        });
        boxOld.appendChild(pwOld);
        boxOld.appendChild(eyeOld);
        rowOld.appendChild(labOld);
        rowOld.appendChild(boxOld);
        dlg.appendChild(rowOld);

        dlg.appendChild(row2);
        var rowHint = document.createElement('div');
        rowHint.className = 'cpw-row-hint';
        var labHint = document.createElement('div');
        labHint.className = 'cpw-label';
        labHint.textContent = '';
        var boxHint = document.createElement('div');
        boxHint.className = 'cpw-inputbox';
        var hint = document.createElement('div');
        hint.className = 'cpw-hint low';
        hint.style.display = 'none';
        hint.innerHTML = _('密码强度：') + '<span class="level">' + _('低') + '</span>';
        var lenHint = document.createElement('div');
        lenHint.className = 'cpw-hint low';
        lenHint.style.display = 'none';
        lenHint.textContent = _('密码长度：过短');
        lenHint.innerHTML = _('密码长度：') + '<span class="level">' + _('过短') + '</span>';
        boxHint.appendChild(hint);
        boxHint.appendChild(lenHint);
        rowHint.appendChild(labHint);
        rowHint.appendChild(boxHint);
        dlg.appendChild(rowHint);
        dlg.appendChild(row3);

        dlg.appendChild(actions);
        mask.appendChild(dlg);
        document.body.appendChild(mask);

        function close() {
            mask.remove();
        }

        mask.addEventListener('click', function (e) {
            if (e.target === mask) {
                close();
            }
        });
        document.addEventListener('keydown', function esc(e) {
            if (e.key === 'Escape') {
                close();
                document.removeEventListener('keydown', esc);
            }
        });

        btnCancel.addEventListener('click', close);

        function strengthInfo(s) {
            s = s || '';
            var len = s.length;

            var t = 0;
            if (/[A-Z]/.test(s)) {
                t++;
            }
            if (/[a-z]/.test(s)) {
                t++;
            }
            if (/[0-9]/.test(s)) {
                t++;
            }
            if (/[^A-Za-z0-9]/.test(s)) {
                t++;
            }

            var score = t;
            if (len < 4) {
                score -= 1;
            } else if (len >= 8) {
                score += 1;
            }
            if (score < 0) {
                score = 0;
            }

            var label = _('低'), cls = 'low';
            if (score <= 1) {
                label = _('低');
                cls = 'low';
            } else if (score === 2) {
                label = _('中');
                cls = 'medium';
            } else if (score === 3) {
                label = _('高');
                cls = 'high';
            } else {
                label = _('强');
                cls = 'strong';
            }
            return {
                score: score,
                label: label,
                cls: cls,
                len: len
            };
        }
        function renderStrength(s) {
            s = s || '';
            var len = s.length;

            if (len > 0 && len < 4) {
                lenHint.style.display = '';
            } else {
                lenHint.style.display = 'none';
            }

            if (len === 0) {
                hint.style.display = 'none';
            } else {
                var info = strengthInfo(s);
                hint.className = 'cpw-hint ' + info.cls;
                hint.innerHTML = _('密码强度：') + '<span class="level">' + info.label + '</span>';
                hint.style.display = '';
            }

            if (hint.style.display === 'none' && lenHint.style.display === 'none') {
                rowHint.classList.remove('active');
            } else {
                rowHint.classList.add('active');
            }
        }
        pw1.addEventListener('input', function () {
            renderStrength(pw1.value);
        });

        function validate() {
            var a = (pw1.value || '').trim();
            var b = (pw2.value || '').trim();
            var o = (pwOld.value || '').trim();
            if (!opts.disableOld) {
                if (!o) {
                    toastWarn && toastWarn(_('旧密码不能为空'));
                    return false;
                }
            }
            if (!a) {
                toastWarn && toastWarn(_('密码不能为空'));
                return false;
            }
            if (a !== b) {
                toastWarn && toastWarn(_('两次输入的密码不一致'));
                return false;
            }
            return { oldPass: o, newPass: a };
        }

        function setBusy(b) {
            btnOK.disabled = !!b;
            btnCancel.disabled = !!b;
        }

        btnOK.addEventListener('click', function () {
            var v = validate();
            if (!v) {
                return;
            }

            var si = strengthInfo(v.newPass);
            if (si.score <= 3) {
                if (typeof toastWarn === 'function') {
                    toastWarn(_('当前密码强度过低，无法修改'));
                }
                return;
            }

            setBusy(true);

            var step = Promise.resolve(true);
            if (!opts.disableOld) {
                step = rpcCheckPassword(username, v.oldPass).then(function (okOld) {
                    if (!okOld) {
                        toastError && toastError(_('旧密码不正确'));
                        return Promise.reject(new Error('old password mismatch'));
                    }
                    return true;
                });
            }
            step.then(function () { return rpcSetPassword('root', v.newPass); }).then(function (ok) {
                if (ok) {
                    toastSuccess && toastSuccess(_('密码修改成功'));
                    close();
                    try {
                        document.body.setAttribute('data-root-empty', '0');
                        var nb = document.querySelector('.ad-nopwd-bar');
                        if (nb) nb.remove();
                    } catch (e) { }
                } else {
                    toastError && toastError(_('密码修改失败'));
                }
            }).catch(function (e) {
                if (e && e.message === 'old password mismatch') {
                } else {
                    toastError && toastError(_('RPC 异常'));
                }
            }).finally(function () {
                setBusy(false);
            });
        });

        pw2.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                btnOK.click();
            }
        });

        setTimeout(function () {
            if (!opts.disableOld) {
                pwOld.focus();
            } else {
                pw1.focus();
            }
        }, 50);
    }
    function normalizedPath(href) {
        try {
            return href.replace(/^\/cgi-bin\/luci\/?/, '')
                .replace(/[?#].*$/, '')
                .replace(/\/+$/, '');
        } catch (e) {
            return href || '';
        }
    }

    var NAV_TABLE = {
        ad: [
            'admin/ad-index',
            'admin/ad-status',
            'admin/ad-host',
            'admin/ad-access-dev',
            'admin/ad-network',
            'admin/ad-log',
            'admin/ad-security'
        ],
        fd: [
            'admin/fd-index'
        ]
    };

    function isAllowedBy(type, path) {
        var list = NAV_TABLE[type] || NAV_TABLE.ad;

        for (var i = 0; i < list.length; i++) {
            var pre = list[i];
            if (path === pre || path.indexOf(pre + '/') === 0) {
                return true;
            }
        }
        return false;
    }

    function pickFirstAllowedHref(menu, type) {
        if (!menu) {
            return null;
        }

        var DEFAULT_FIRST = {
            ad: (NAV_TABLE.ad && NAV_TABLE.ad[0]) || 'admin/ad-index',
            fd: (NAV_TABLE.fd && NAV_TABLE.fd[0]) || 'admin/fd-index'
        };
        var want = DEFAULT_FIRST[type] || DEFAULT_FIRST.ad;

        function findVisibleByPath(path) {
            var wantNorm = normalizedPath('/cgi-bin/luci/' + path);
            var links = menu.querySelectorAll('a[href^="/cgi-bin/luci/"]:not([data-hidden="1"])');
            for (var i = 0; i < links.length; i++) {
                var a = links[i];
                var href = normalizedPath(a.getAttribute('href') || '');
                if (href === wantNorm) {
                    return a;
                }
            }
            return null;
        }
        var homeA = findVisibleByPath(want);
        if (homeA) {
            return homeA.getAttribute('href');
        }

        var child = menu.querySelector('.dropdown-menu a[href^="/cgi-bin/luci/"]:not([data-hidden="1"])');
        if (child && child.getAttribute) {
            return child.getAttribute('href');
        }

        var top = menu.querySelector(':scope > li > a[href^="/cgi-bin/luci/"]:not([data-hidden="1"])');
        return top ? top.getAttribute('href') : null;
    }

    function filterMenuByDeviceType(type, opts) {
        opts = opts || {};
        var menu = document.getElementById('topmenu');
        if (!menu) {
            return;
        }

        filterMenuByDeviceType.__lastType = filterMenuByDeviceType.__lastType || null;
        var curType = type || 'ad';
        var sameType = (filterMenuByDeviceType.__lastType === curType);
        var noReset = !!opts.noReset || sameType;

        if (!noReset) {
            menu.querySelectorAll('a[href^="/cgi-bin/luci/"]').forEach(function (a) {
                a.removeAttribute('data-hidden');
                var li = a.closest('li');
                if (li) {
                    li.style.display = '';
                }
            });
            menu.querySelectorAll(':scope > li').forEach(function (li) {
                li.style.display = '';
            });
        }

        function hideLink(a) {
            a.setAttribute('data-hidden', '1');
            var li = a.closest('li');
            if (li) {
                li.style.display = 'none';
            }
        }

        var childLinks = menu.querySelectorAll('.dropdown-menu a[href^="/cgi-bin/luci/"]');
        childLinks.forEach(function (a) {
            var p = normalizedPath(a.getAttribute('href') || '');
            if (!isAllowedBy(curType, p)) {
                hideLink(a);
            }
        });

        var groups = menu.querySelectorAll(':scope > li.dropdown');
        groups.forEach(function (li) {
            var visible = li.querySelector('.dropdown-menu a[href^="/cgi-bin/luci/"]:not([data-hidden="1"])');
            if (!visible) {
                li.style.display = 'none';
            }
        });

        var topLinks = menu.querySelectorAll(':scope > li:not(.dropdown) > a[href^="/cgi-bin/luci/"]');
        topLinks.forEach(function (a) {
            var p = normalizedPath(a.getAttribute('href') || '');
            if (!isAllowedBy(curType, p)) {
                var pli = a.closest('li');
                if (pli) {
                    pli.style.display = 'none';
                }
                a.setAttribute('data-hidden', '1');
            }
        });

        if (opts.redirect) {
            var cur = normalizedPath(location.pathname);
            if (!isAllowedBy(curType, cur)) {
                var target = pickFirstAllowedHref(menu, curType);
                if (target) {
                    location.href = target;
                    return;
                }
            }
        }

        filterMenuByDeviceType.__lastType = curType;
    }

    if (!window.ADMenu) {
        window.ADMenu = {};
    }
    window.ADMenu.filterMenuByDeviceType = filterMenuByDeviceType;
    window.ADMenu.isAllowedBy = isAllowedBy;
    window.ADMenu.normalizedPath = normalizedPath;

    function highlightCurrentMenuItem() {
        var menu = document.getElementById('topmenu');
        if (!menu) {
            return;
        }

        var cur = normalizedPath(location.pathname);

        menu.querySelectorAll('.dropdown-menu a.active,[aria-current="page"], #topmenu>li>a.active').forEach(function (a) {
            a.classList.remove('active');
            a.removeAttribute('aria-current');
        });
        menu.querySelectorAll('#topmenu>li.active').forEach(function (li) {
            li.classList.remove('active');
        });

        var best = null, bestLen = -1;
        var candidates = menu.querySelectorAll('.dropdown-menu a[href^="/cgi-bin/luci/"]');
        candidates.forEach(function (a) {
            var href = normalizedPath(a.getAttribute('href') || '');
            if (!href) {
                return;
            }
            if (href === cur || cur.indexOf(href) === 0) {
                if (href.length > bestLen) {
                    best = a;
                    bestLen = href.length;
                }
            }
        });

        if (best) {
            best.classList.add('active');
            best.setAttribute('aria-current', 'page');
            var parent = best.closest('li.dropdown');
            if (parent) {
                if (!parent.__manulClosed) {
                    parent.classList.add('open', 'active');
                    var a = parent.querySelector(':scope > a');
                    if (a) {
                        a.setAttribute('aria-expanded', 'true');
                    }
                    var arrow = parent.querySelector(':scope > a .arrow-icon');
                    if (arrow) {
                        arrow.src = '/luci-static/custom/img/arrow-up.svg';
                    }
                } else {
                    parent.classList.add('active');
                }
            }
            return;
        }

        var bestTop = null, bestTopLen = -1;
        var topLinks = menu.querySelectorAll(':scope > li > a[href^="/cgi-bin/luci/"]');
        topLinks.forEach(function (a) {
            var href = normalizedPath(a.getAttribute('href') || '');
            if (!href) {
                return;
            }
            if (href === cur || cur.indexOf(href) === 0) {
                if (href.length > bestTopLen) {
                    bestTop = a;
                    bestTopLen = href.length;
                }
            }
        });
        if (bestTop) {
            bestTop.classList.add('active');
            bestTop.setAttribute('aria-current', 'page');
            var liTop = bestTop.closest('li');
            if (liTop) {
                liTop.classList.add('active');
            }
        }
    }

    function curDevType() {
        try {
            document.documentElement.setAttribute('data-ad-devtype', 'ad');
        } catch (e) {  }
        return 'ad';
    }

    function start() {
        var tries = 0;
        var timer = setInterval(function () {
            addArrows();
            var menuReady = bootstrapMenu();
            addIcons();
            patchModemenu();
            installClock();
            installBreadcrumb();

            var type = curDevType();
            filterMenuByDeviceType(type, { redirect: true, noReset: !menuReady });

            highlightCurrentMenuItem();

            if (!shouldSkipNoPwdBar()) {
                rpcRootNoPassword().then(function (empty) {
                    if (empty) {
                        showNoPasswordBar();
                    }
                });
            }
            if (menuReady || ++tries > 50) {
                clearInterval(timer);
            }
        }, 100);

        if (window.MutationObserver) {
            var mo = new MutationObserver(function () {
                var type = curDevType();
                filterMenuByDeviceType(type, { redirect: true, noReset: false });

                addArrows();
                bootstrapMenu();
                addIcons();
                installClock();
                highlightCurrentMenuItem();
                if (!shouldSkipNoPwdBar()) {
                    rpcRootNoPassword().then(function (empty) {
                        if (empty) {
                            showNoPasswordBar();
                        }
                    });
                }
            });
            mo.observe(document.documentElement, { childList: true, subtree: true });
            filterMenuByDeviceType(curDevType(), { redirect: true, noReset: false });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();

(function nsDisableEnterEverywhere() {
    if (window.__nsEnterGuardInstalled) {
        return;
    }
    window.__nsEnterGuardInstalled = true;

    var lastEnterAt = 0;
    document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
            lastEnterAt = Date.now();
            ev.preventDefault();
            ev.stopImmediatePropagation();
            return false;
        }
    }, true);

    document.addEventListener('submit', function (ev) {
        if (Date.now() - lastEnterAt < 400) {
            ev.preventDefault();
            ev.stopImmediatePropagation();
            return false;
        }
    }, true);

    document.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest('button, [role="button"], .cbi-button');
        if (btn) {
            setTimeout(function () {
                try {
                    btn.blur();
                } catch (e) { }
            }, 0);
        }
    }, true);
})();

(function () {
    'use strict';

    document.addEventListener('click', function (ev) {
        var tab = ev.target && ev.target.closest && ev.target.closest('.modal.cbi-modal ul.cbi-tabmenu > .cbi-tab, .modal.cbi-modal ul.cbi-tabmenu > .cbi-tab-disabled');
        var link = tab && tab.querySelector && tab.querySelector('a');

        if (!tab || !link || ev.target === link || link.contains(ev.target)) {
            return;
        }

        link.click();
    }, true);
})();

(function () {
    'use strict';

    if (!/\/firewall(\/|$)/.test(location.pathname)) {
        return;
    }

    var FIREWALL_TAB_DESC = {
        '/firewall/rules': _('通信规则定义了不同区域间的数据包传输策略，例如：拒绝一些主机之间的通信、开放路由器 WAN 上的端口'),
        '/firewall/forwards': _('端口转发允许互联网上的远程计算机连接到内部网络中的特定计算机或服务'),
        '/firewall/snats': _('NAT 规则允许对源 IP 进行精细控制，以用于出站或转发流量'),
        '/firewall/zones': _('防火墙通过在网络接口上创建区域来控制网络流量'),
        '/firewall/custom': _('自定义规则允许您执行不属于防火墙框架的任意 iptables 命令。每次重启防火墙时，这些命令在默认的规则运行后立即执行')
    };

    function applyTooltip() {
        var links = document.querySelectorAll(
            'ul.tabs a, ul.cbi-tabmenu a, .cbi-tabmenu a'
        );

        if (!links || links.length === 0) {
            return;
        }

        links.forEach(function (a) {
            var href = a.getAttribute('href') || '';
            Object.keys(FIREWALL_TAB_DESC).forEach(function (key) {
                if (href.indexOf(key) !== -1) {
                    a.setAttribute('title', FIREWALL_TAB_DESC[key]);
                }
            });
        });
    }

    applyTooltip();

    function installObserver() {
        if (!window.MutationObserver) {
            return;
        }

        var root = document.body;
        if (!(root instanceof Node)) {
            return;
        }

        var mo = new MutationObserver(function () {
            applyTooltip();
        });

        mo.observe(root, {
            childList: true,
            subtree: true
        });
    }

    if (document.body instanceof Node) {
        installObserver();
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            installObserver();
        }, { once: true });
    }
})();
