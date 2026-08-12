'use strict';

(function (win) {
    if (!win) {
        return;
    }

    var TABLE_NAME = 'self_dev_info';
    var cache = null;
    var pending = null;
    var errorShown = false;

    function clone(obj) {
        var out = {};
        Object.keys(obj || {}).forEach(function (k) {
            out[k] = obj[k];
        });
        return out;
    }

    function defaultDevType() {
        if (typeof win.DEV_TYPE === 'object' && typeof win.DEV_TYPE.AD === 'number') {
            return win.DEV_TYPE.AD;
        }
        return 1;
    }

    function normalizeDevType(v) {
        var n = parseInt(v, 10);
        return isNaN(n) ? defaultDevType() : n;
    }

    function normalizeInfo(raw) {
        if (!raw || typeof raw !== 'object') {
            return null;
        }

        var devId = String(raw.dev_id != null ? raw.dev_id : (raw.id != null ? raw.id : '')).trim();
        if (!devId) {
            return null;
        }

        var devName = String(raw.dev_name != null ? raw.dev_name : (raw.name != null ? raw.name : (raw.title != null ? raw.title : ''))).trim();
        var devIp = String(raw.dev_ip != null ? raw.dev_ip : (raw.ip != null ? raw.ip : '')).trim();
        var devType = parseInt(raw.dev_type, 10);

        if (!devName || !devIp || isNaN(devType)) {
            return null;
        }

        return {
            dev_id: devId,
            dev_name: devName,
            dev_ip: devIp,
            dev_type: normalizeDevType(devType)
        };
    }

    function toLegacyDevice(info) {
        var src = info || {};
        var devId = String(src.dev_id != null ? src.dev_id : (src.id != null ? src.id : '')).trim();
        if (!devId) {
            return null;
        }
        var devName = String(src.dev_name != null ? src.dev_name : (src.name != null ? src.name : (src.title != null ? src.title : ''))).trim();
        var devIp = String(src.dev_ip != null ? src.dev_ip : (src.ip != null ? src.ip : '')).trim();
        var devType = normalizeDevType(src.dev_type);
        return {
            id: devId,
            dev_id: devId,
            title: devName,
            name: devName,
            ip: devIp,
            dev_ip: devIp,
            dev_type: devType,
            online: true
        };
    }

    function writeToLocalStorage(info) {
        var legacy = toLegacyDevice(info);
        if (!legacy) {
            return;
        }
        try {
            localStorage.setItem('currentDevice', JSON.stringify(legacy));
        } catch (e) { }

        try {
            win.dispatchEvent(new CustomEvent('device:info', { detail: legacy }));
        } catch (e) { }
    }

    function pickBestRow(rows) {
        if (!Array.isArray(rows) || rows.length === 0) {
            return null;
        }

        var candidates = [];
        rows.forEach(function (r) {
            var n = normalizeInfo(r);
            if (n) {
                candidates.push({
                    row: n,
                    idx: candidates.length,
                    id: parseInt((r && r.id != null) ? r.id : 0, 10)
                });
            }
        });

        if (!candidates.length) {
            return null;
        }

        candidates.sort(function (a, b) {
            var ai = isNaN(a.id) ? -1 : a.id;
            var bi = isNaN(b.id) ? -1 : b.id;
            if (ai !== bi) {
                return bi - ai;
            }
            return a.idx - b.idx;
        });

        return candidates[0].row;
    }

    function showFetchErrorOnce() {
        if (errorShown) {
            return;
        }
        errorShown = true;
        var msg = _('获取当前设备信息失败');
        try {
            if (typeof win.toastWarn === 'function') {
                win.toastWarn(msg);
            } else if (typeof win.toast === 'function') {
                win.toast('warn', msg);
            } else {
                alert(msg);
            }
        } catch (e) { }
    }

    function resolveSqlApi(sqlApi) {
        if (sqlApi) {
            return Promise.resolve(sqlApi);
        }

        if (win.L && typeof win.L.require === 'function') {
            return win.L.require('emp/sql').then(function (mod) {
                return (typeof mod === 'function') ? new mod() : mod;
            });
        }

        return Promise.reject(new Error('L.require is unavailable'));
    }

    function refreshSelfDevInfo(sqlApi) {
        if (pending) {
            return pending;
        }

        pending = resolveSqlApi(sqlApi).then(function (api) {
            if (!api || typeof api.queryTable !== 'function') {
                throw new Error('invalid sql api');
            }
            return api.queryTable(TABLE_NAME);
        }).then(function (resp) {
            if (!resp || !resp.ok || !Array.isArray(resp.rows)) {
                throw new Error('query self_dev_info failed');
            }

            var row = pickBestRow(resp.rows);
            if (!row) {
                throw new Error('self_dev_info has no valid row');
            }

            cache = row;
            writeToLocalStorage(row);
            errorShown = false;
            return clone(cache);
        }).catch(function (e) {
            cache = null;
            showFetchErrorOnce();
            throw e;
        }).finally(function () {
            pending = null;
        });

        return pending;
    }

    function getSelfDevInfo() {
        return cache ? clone(cache) : null;
    }

    function getActiveDev() {
        var info = getSelfDevInfo();
        if (!info) {
            return {
                id: '',
                dev_id: '',
                title: '',
                name: '',
                ip: '',
                dev_ip: '',
                dev_type: defaultDevType(),
                online: false
            };
        }
        return toLegacyDevice(info);
    }

    function getCurrentDevId() {
        var d = getActiveDev();
        return d ? String(d.dev_id || d.id || '') : '';
    }

    function hasActiveDev() {
        var d = getActiveDev();
        return !!(d && (d.dev_id || d.id));
    }

    win.adDeviceInfo = {
        refreshSelfDevInfo: refreshSelfDevInfo,
        getSelfDevInfo: getSelfDevInfo,
        getActiveDev: getActiveDev,
        getCurrentDevId: getCurrentDevId,
        hasActiveDev: hasActiveDev,
        toLegacyDevice: toLegacyDevice
    };

    if (typeof win.getActiveDev !== 'function') {
        win.getActiveDev = getActiveDev;
    }
})(window);
