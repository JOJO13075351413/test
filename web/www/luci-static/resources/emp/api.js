'use strict';
'require rpc';
'require baseclass';

var callEmpRequest = rpc.declare({
    object: 'emp',
    method: 'request',
    params: ['dev_type', 'dev_id', 'inst_arrays'],
    expect: {}
});

var callDbExec = rpc.declare({
    object: 'luci.db',
    method: 'exec',
    params: ['sql', 'params'],
    expect: {}
});

var OPLOG_TABLE = 'ad_op_log';
var OPLOG_MAX_ROWS = 50000;
var OPLOG_BATCH_SIZE = 20;
var OPLOG_FLUSH_MS = 300;
var OPLOG_DB_TIMEOUT_MS = 1500;

var oplogReady = false;
var oplogInitPromise = null;
var oplogQueue = [];
var oplogFlushTimer = null;
var oplogFlushing = false;

function oplogCreateSql() {
    return 'CREATE TABLE IF NOT EXISTS ' + OPLOG_TABLE + ' (' +
        'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
        'ts INTEGER, user TEXT, dev_id TEXT, page_key TEXT, ip TEXT, action_key TEXT, ' +
        'result_key TEXT' +
        ')';
}

function oplogSelectSql() {
    return 'SELECT id, ts, user, dev_id, page_key, ip, action_key, ' +
        'result_key FROM ' + OPLOG_TABLE + ' LIMIT 0';
}

function toInt(v, base) {
    if (v === null || v === undefined || v === '') {
        return 0;
    }
    var n = parseInt(v, base || 10);
    return isNaN(n) ? 0 : n;
}

function prune(obj) {
    var out = {};
    for (var k in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== undefined) {
            out[k] = obj[k];
        }
    }
    return out;
}

function clipStr(v, n) {
    var s = String(v == null ? '' : v);
    var max = toInt(n, 10) || 0;
    if (max <= 0 || s.length <= max) {
        return s;
    }
    return s.slice(0, max) + '...';
}

function withTimeout(promise, ms, timeoutValue) {
    var timeoutMs = toInt(ms, 10);
    if (timeoutMs <= 0) {
        return promise;
    }
    return new Promise(function (resolve) {
        var done = false;
        var timer = setTimeout(function () {
            if (done) {
                return;
            }
            done = true;
            resolve(timeoutValue);
        }, timeoutMs);
        promise.then(function (v) {
            if (done) {
                return;
            }
            done = true;
            clearTimeout(timer);
            resolve(v);
        }).catch(function () {
            if (done) {
                return;
            }
            done = true;
            clearTimeout(timer);
            resolve(timeoutValue);
        });
    });
}

function dbExecOk(sql, params) {
    var task = callDbExec(String(sql || ''), Array.isArray(params) ? params : []).then(function (resp) {
        return !!(resp && Number(resp.status) === 0);
    }).catch(function () {
        return false;
    });
    return withTimeout(task, OPLOG_DB_TIMEOUT_MS, false);
}

function ensureOplogTable() {
    if (oplogReady) {
        return Promise.resolve(true);
    }
    if (oplogInitPromise) {
        return oplogInitPromise;
    }

    var createSql = oplogCreateSql();

    oplogInitPromise = dbExecOk(createSql, []).then(function (ok) {
        if (!ok) {
            oplogReady = false;
            return false;
        }
        return dbExecOk(oplogSelectSql(), []);
    }).then(function (ok) {
        if (ok) {
            oplogReady = true;
            return true;
        }
        return dbExecOk('DROP TABLE IF EXISTS ' + OPLOG_TABLE, []).then(function (dropOk) {
            if (!dropOk) {
                oplogReady = false;
                return false;
            }
            return dbExecOk(createSql, []);
        }).then(function (recreateOk) {
            oplogReady = !!recreateOk;
            return oplogReady;
        });
    }).finally(function () {
        oplogInitPromise = null;
    });

    return oplogInitPromise;
}

function isMutatingOptType(optType) {
    var t = toInt(optType, 10);
    return t === 1 || t === 2;
}

function getPageId() {
    try {
        if (typeof document !== 'undefined' && document.body) {
            var p = document.body.getAttribute('data-page');
            if (p) {
                return String(p);
            }
        }
    } catch (_) { }
    try {
        if (typeof location !== 'undefined' && location.pathname) {
            return String(location.pathname || '').replace(/^\/cgi-bin\/luci\/?/, '');
        }
    } catch (_) { }
    return '-';
}

function pageKeyFromRoute(route) {
    var key = String(route || '').trim();
    var map = {
        'admin-ad-status-overview': 'page.ad.status.overview',
        'admin-ad-status-graph': 'page.ad.status.graph',
        'admin-ad-host-detail': 'page.ad.host.detail',
        'admin-ad-host-update': 'page.ad.host.update',
        'admin-ad-access-dev-fd': 'page.ad.access.fd',
        'admin-ad-network-inf-setting': 'page.ad.network.interface',
        'admin-ad-network-wireless-config': 'page.ad.network.wireless.config',
        'admin-ad-log-operation': 'page.ad.log.operation',
        'admin-ad-log-system': 'page.ad.log.system',
        'admin-ad-log-kernal': 'page.ad.log.kernel'
    };
    return map[key] || key || '-';
}

function parseEmpResultCode(resp) {
    if (!resp) {
        return -1;
    }
    if (typeof resp.result === 'number') {
        return toInt(resp.result, 10);
    }
    if (Array.isArray(resp.result)) {
        return toInt(resp.result[0], 10);
    }
    return -1;
}

function buildAutoAuditMeta(req, instArrays) {
    var arr = Array.isArray(instArrays) ? instArrays : [];
    var mut = [];
    var hasExec = false;
    var userMeta = (req && req.__audit && typeof req.__audit === 'object') ? req.__audit : {};
    var hasExplicitAudit = !!(req && req.__audit && typeof req.__audit === 'object');
    for (var i = 0; i < arr.length; i++) {
        var it = arr[i] || {};
        if (isMutatingOptType(it.opt_type)) {
            mut.push(it);
            if (toInt(it.opt_type, 10) === 2) {
                hasExec = true;
            }
        }
    }
    if (!mut.length && !hasExplicitAudit) {
        return null;
    }

    if (userMeta && userMeta.disable === true) {
        return null;
    }
    return {
        user: userMeta.user || getCurrentUser(),
        page_key: userMeta.page_key || userMeta.page || pageKeyFromRoute(getPageId()),
        dev_id: userMeta.dev_id || userMeta.target_id || String((req && req.dev_id) || '-'),
        ip: userMeta.ip || getClientIp(),
        action_key: userMeta.action_key || userMeta.action || (hasExec ? 'emp.execute' : 'emp.modify')
    };
}

function getCurrentUser() {
    try {
        if (typeof window !== 'undefined' && window.CURRENT_USER) {
            var u = String(window.CURRENT_USER || '').trim();
            if (u) {
                return u;
            }
        }
    } catch (_) { }
    return '-';
}

function getClientIp() {
    try {
        if (typeof window !== 'undefined' && window.CURRENT_CLIENT_IP) {
            var ip = String(window.CURRENT_CLIENT_IP || '').trim();
            if (ip) {
                return ip;
            }
        }
    } catch (_) { }
    return '-';
}

function getActiveDevId() {
    try {
        if (typeof window !== 'undefined' &&
            window.adDeviceInfo &&
            typeof window.adDeviceInfo.getCurrentDevId === 'function') {
            var id = String(window.adDeviceInfo.getCurrentDevId() || '').trim();
            if (id) {
                return id;
            }
        }
    } catch (_) { }
    try {
        if (typeof window !== 'undefined' &&
            window.adDeviceInfo &&
            typeof window.adDeviceInfo.getActiveDev === 'function') {
            var dev = window.adDeviceInfo.getActiveDev() || {};
            var devId = String(dev.dev_id || dev.id || '').trim();
            if (devId) {
                return devId;
            }
        }
    } catch (_) { }
    return '-';
}

function queueOplog(rec) {
    if (!rec || typeof rec !== 'object') {
        return;
    }
    oplogQueue.push(rec);
    if (oplogQueue.length >= OPLOG_BATCH_SIZE) {
        flushOplogQueue();
        return;
    }
    if (!oplogFlushTimer) {
        oplogFlushTimer = setTimeout(flushOplogQueue, OPLOG_FLUSH_MS);
    }
}

function recordAdAudit(meta) {
    var m = (meta && typeof meta === 'object') ? meta : {};
    queueOplog({
        ts: Math.floor(Date.now() / 1000),
        user: m.user || getCurrentUser(),
        dev_id: (m.dev_id == null || m.dev_id === '') ? getActiveDevId() : String(m.dev_id),
        page_key: m.page_key || m.page || pageKeyFromRoute(getPageId()),
        ip: m.ip || getClientIp(),
        action_key: m.action_key || m.action || '-',
        result_key: normalizeResultKey(m.result_key || m.result)
    });
}

function normalizeResultKey(result) {
    var r = String(result || '').trim();
    if (r === 'success' || r === '成功') {
        return 'success';
    }
    if (r === 'failure' || r === '失败') {
        return 'failure';
    }
    return r || '-';
}

function flushOplogQueue() {
    if (oplogFlushTimer) {
        clearTimeout(oplogFlushTimer);
        oplogFlushTimer = null;
    }
    if (oplogFlushing || !oplogQueue.length) {
        return;
    }

    var batch = oplogQueue.splice(0, OPLOG_BATCH_SIZE);
    var insertSql = 'INSERT INTO ' + OPLOG_TABLE +
        ' (ts, user, dev_id, page_key, ip, action_key, result_key)' +
        ' VALUES (?, ?, ?, ?, ?, ?, ?)';
    var trimSql = 'DELETE FROM ' + OPLOG_TABLE +
        ' WHERE id <= (SELECT MAX(id) - ? FROM ' + OPLOG_TABLE + ')';

    oplogFlushing = true;
    ensureOplogTable().then(function (ok) {
        if (!ok) {
            return false;
        }
        return batch.reduce(function (p, rec) {
            return p.then(function (canRun) {
                if (!canRun) {
                    return false;
                }
                var params = [
                    String(toInt(rec.ts, 10)),
                    String(rec.user || '-'),
                    String(rec.dev_id || '-'),
                    String(rec.page_key || '-'),
                    String(rec.ip || '-'),
                    String(rec.action_key || '-'),
                    String(rec.result_key || '-')
                ];
                return dbExecOk(insertSql, params);
            });
        }, Promise.resolve(true)).then(function (insOk) {
            if (!insOk) {
                return false;
            }
            return dbExecOk(trimSql, [String(OPLOG_MAX_ROWS)]);
        });
    }).finally(function () {
        oplogFlushing = false;
        if (oplogQueue.length > 0) {
            if (oplogQueue.length >= OPLOG_BATCH_SIZE) {
                flushOplogQueue();
            } else {
                oplogFlushTimer = setTimeout(flushOplogQueue, OPLOG_FLUSH_MS);
            }
        }
    });
}

function attachEmpAudit(req, meta) {
    if (req && meta && typeof meta === 'object') {
        req.__audit = meta;
    }
    return req;
}

function utf8ByteLen(str) {
    var byte_num = 0;
    str = String(str || '');
    for (var idx = 0; idx < str.length; idx++) {
        var c = str.charCodeAt(idx);
        if (c <= 0x7F) {
            byte_num += 1;
        } else if (c <= 0x7FF) {
            byte_num += 2;
        } else if ((c >= 0xD800) && (c <= 0xDFFF)) {
            byte_num += 4;
            if ((c >= 0xD800) && (c <= 0xDBFF) && (idx + 1 < str.length)) {
                var d = str.charCodeAt(idx + 1);
                if (d >= 0xDC00 && d <= 0xDFFF) {
                    idx++;
                }
            }
        } else {
            byte_num += 3;
        }
    }
    return byte_num;
}

function strLen(str) {
    return String((str == null) ? '' : str).length;
}

function normalizeUri(uri) {
    var parts;

    if (Array.isArray(uri)) {
        parts = uri;
    } else if (typeof uri === 'string') {
        parts = uri.split('/');
    } else {
        parts = [uri];
    }

    var a = [];
    for (var i = 0; i < 3; i++) {
        var seg = parts[i];
        if (seg === undefined) {
            seg = 0;
        }
        var s = String(seg).trim();
        var n;
        if (s.startsWith('0x') || s.startsWith('0X')) {
            n = toInt(s, 16);
        } else {
            n = toInt(s, 10);
        }
        if (n < 0) {
            n = 0;
        }
        a.push(String(n));
    }
    return a[0] + '/' + a[1] + '/' + a[2];
}

function strcatURI(obj_id, ins_id, res_id) {
    return normalizeUri([obj_id, ins_id, res_id]);
}

function wBoolInst(uri, val) {
    var n;
    if (typeof val === 'boolean') {
        n = val ? 1 : 0;
    } else {
        n = toInt(val, 10) ? 1 : 0;
    }
    return createInstArray(uri, OPT_TYPE.WRITE, OPT_RANGE.SINGLE_RES, VALUE_TYPE.BOOLEAN, VALUE_LENGTH.BOOLEAN, String(n));
}

function wBoolAllInst(uri, val) {
    var n;
    if (typeof val === 'boolean') {
        n = val ? 1 : 0;
    } else {
        n = toInt(val, 10) ? 1 : 0;
    }
    return createInstArray(uri, OPT_TYPE.WRITE, OPT_RANGE.INS_RES, VALUE_TYPE.BOOLEAN, VALUE_LENGTH.BOOLEAN, String(n));
}

function wU8Inst(uri, val) {
    var v = String((toInt(val, 10) & 0xFF));
    return createInstArray(uri, OPT_TYPE.WRITE, OPT_RANGE.SINGLE_RES, VALUE_TYPE.U8, VALUE_LENGTH.U8, v);
}

function wU16Inst(uri, val) {
    var v = String((toInt(val, 10) & 0xFFFF));
    return createInstArray(uri, OPT_TYPE.WRITE, OPT_RANGE.SINGLE_RES, VALUE_TYPE.U16, VALUE_LENGTH.U16, v);
}

function wU32Inst(uri, val) {
    var v = String((toInt(val, 10) >>> 0));
    return createInstArray(uri, OPT_TYPE.WRITE, OPT_RANGE.SINGLE_RES, VALUE_TYPE.U32, VALUE_LENGTH.U32, v);
}

function wU64Inst(uri, val) {
    var v = String((toInt(val, 10) >>> 0));
    return createInstArray(uri, OPT_TYPE.WRITE, OPT_RANGE.SINGLE_RES, VALUE_TYPE.U64, VALUE_LENGTH.U64, v);
}

function wStrInst(uri, val) {
    var v = String((val == null) ? '' : val);
    return createInstArray(uri, OPT_TYPE.WRITE, OPT_RANGE.SINGLE_RES, VALUE_TYPE.STRING, utf8ByteLen(v), v);
}

function wByteArrayInst(uri, val) {
    if (val == null) {
        return createInstArray(uri, OPT_TYPE.WRITE, OPT_RANGE.SINGLE_RES, VALUE_TYPE.OPAQUE, 0, '');
    }

    var s = String(val).trim();

    if (s.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(s)) {
        console.warn('wByteArrayInst: invalid hex string', s);
        return createInstArray(uri, OPT_TYPE.WRITE, OPT_RANGE.SINGLE_RES, VALUE_TYPE.OPAQUE, 0, '');
    }

    var byteLen = s.length / 2;

    return createInstArray(uri, OPT_TYPE.WRITE, OPT_RANGE.SINGLE_RES, VALUE_TYPE.OPAQUE, byteLen, s);
}

function rSingleInst(uri) {
    return createInstArray(uri, OPT_TYPE.READ, OPT_RANGE.SINGLE_RES);
}

function rObjSingleInst(uri) {
    return createInstArray(uri, OPT_TYPE.READ, OPT_RANGE.OBJ_RES);
}

function rInsAllInst(uri) {
    return createInstArray(uri, OPT_TYPE.READ, OPT_RANGE.INS_RES);
}

function rObjAllInst(uri) {
    return createInstArray(uri, OPT_TYPE.READ, OPT_RANGE.OBJ_ALL_RES);
}

function rDevAllInst(uri) {
    return createInstArray(uri, OPT_TYPE.READ, OPT_RANGE.DEV_RES);
}

function execInst(uri, value_type, value_length, value_payload) {
    return createInstArray(uri, OPT_TYPE.EXEC, OPT_RANGE.SINGLE_RES, value_type, value_length, value_payload);
}

function createInstArray(uri, opt_type, opt_range, value_type, value_length, value_payload) {
    var item = {
        uri: normalizeUri(uri),
        opt_type: toInt(opt_type),
        opt_range: (opt_range != null) ? toInt(opt_range) : undefined
    };

    var t = toInt(opt_type);
    if (t === (window.OPT_TYPE ? window.OPT_TYPE.WRITE : 1) ||
        t === (window.OPT_TYPE ? window.OPT_TYPE.EXEC : 2)) {

        item.value_type = (value_type != null) ? toInt(value_type) : undefined;
        item.value_length = (value_length != null) ? toInt(value_length) : undefined;
        item.value_payload = (value_payload != null) ? String(value_payload) : undefined;
    }

    return prune(item);
}

function createEmpRequest(dev_type, dev_id, inst_or_list) {
    var did = String(dev_id == null ? '' : dev_id).trim();
    if (!did) {
        var err = new Error('获取当前设备信息失败');
        err.code = 'NO_ACTIVE_DEVICE';
        throw err;
    }

    var arr = Array.isArray(inst_or_list) ? inst_or_list : [inst_or_list];
    return {
        dev_type: toInt(dev_type),
        dev_id: did,
        inst_arrays: arr.map(function (it) {
            return prune(it);
        })
    };
}

function normalizeEmp(resp) {
    if (!resp) {
        return { ok: false, code: -1, arrays: [] };
    }

    if (typeof resp.result === 'number') {
        return {
            ok: resp.result === 0,
            code: resp.result,
            arrays: Array.isArray(resp.resp_arrays) ? resp.resp_arrays : []
        };
    }
    if (Array.isArray(resp.result)) {
        var code = resp.result[0];
        var body = resp.result[1] || {};
        return {
            ok: code === 0,
            code: code,
            arrays: (body && Array.isArray(body.resp_arrays)) ? body.resp_arrays : []
        };
    }
    return { ok: false, code: -1, arrays: [] };
}

function empResultCodeText(code) {
    var map = {
        0: 'SUCCESS',
        1: 'ERROR_PARAM_INVALID',
        2: 'ERROR_RESOURCE_NOT_FOUND',
        3: 'ERROR_DEVICE_OFFLINE',
        4: 'ERROR_TIMEOUT',
        5: 'ERROR_ACCESS_DENIED',
        6: 'ERROR_OPERATION_FAILED',
        7: 'ERROR_EVENT_QUEUE_FULL',
        8: 'ERROR_EVENT_NOT_FOUND',
        9: 'ERROR_DEVICE_NOT_FOUND',
        '-1': 'ERROR_UNKNOWN'
    };
    var key = String(code == null ? -1 : code);
    return map[key] || ('UNKNOWN_ERROR_CODE_' + key);
}

function createQueryRequest(macro, dev) {
    var req = createEmpRequest(
        dev.dev_type,
        dev.dev_id,
        rObjAllInst(strcatURI(macro, 0, 0))
    );

    return req;
}

function createQueryAllRequest(dev, obj_id) {
    var req = createEmpRequest(
        dev.dev_type,
        dev.dev_id,
        rObjAllInst(strcatURI(obj_id, 0, 0))
    );

    return req;
}

function createDelInstRequest(dev, obj_id, inst_id) {
    var req = createEmpRequest(
        dev.dev_type,
        dev.dev_id,
        createInstArray(strcatURI(obj_id, inst_id, 0), OPT_TYPE.WRITE, OPT_RANGE.INS_RES, VALUE_TYPE.BOOLEAN, 1, false)
    );

    return req;
}

function createExecInstRequest(dev, uri) {
    var req = createEmpRequest(
        dev.dev_type,
        dev.dev_id,
        createInstArray(uri, OPT_TYPE.EXEC, OPT_RANGE.SINGLE_RES)
    );

    return req;
}

window.utf8ByteLen = window.utf8ByteLen || utf8ByteLen;

window.strcatURI = window.strcatURI || strcatURI;
window.wBoolInst = window.wBoolInst || wBoolInst;
window.wBoolAllInst = window.wBoolAllInst || wBoolAllInst;
window.wU8Inst = window.wU8Inst || wU8Inst;
window.wU16Inst = window.wU16Inst || wU16Inst;
window.wU32Inst = window.wU32Inst || wU32Inst;
window.wStrInst = window.wStrInst || wStrInst;
window.wByteArrayInst = window.wByteArrayInst || wByteArrayInst;

window.rSingleInst = window.rSingleInst || rSingleInst;
window.rObjSingleInst = window.rObjSingleInst || rObjSingleInst;
window.rInsAllInst = window.rInsAllInst || rInsAllInst;
window.rObjAllInst = window.rObjAllInst || rObjAllInst;
window.rDevAllInst = window.rDevAllInst || rDevAllInst;

window.execInst = window.execInst || execInst;

window.createInstArray = window.createInstArray || createInstArray;
window.createEmpRequest = window.createEmpRequest || createEmpRequest;

window.normalizeEmp = window.normalizeEmp || normalizeEmp;
window.empResultCodeText = window.empResultCodeText || empResultCodeText;

window.createQueryRequest = window.createQueryRequest || createQueryRequest;
window.createQueryAllRequest = window.createQueryAllRequest || createQueryAllRequest;
window.createDelInstRequest = window.createDelInstRequest || createDelInstRequest;
window.createExecInstRequest = window.createExecInstRequest || createExecInstRequest;

var EmpApi = baseclass.extend({
    empRequest: function (req) {
        if (!req || typeof req.dev_type !== 'number' || !req.dev_id || !Array.isArray(req.inst_arrays)) {
            throw new Error('empRequest: require { dev_type:number, dev_id:string, inst_arrays:Array }');
        }

        var inst = req.inst_arrays.map(function (it) {
            return prune({
                uri: normalizeUri(it && it.uri),
                opt_type: toInt(it && it.opt_type),
                opt_range: (it && it.opt_range != null) ? toInt(it.opt_range) : undefined,
                value_type: (it && it.value_type != null) ? toInt(it.value_type) : undefined,
                value_length: (it && it.value_length != null) ? toInt(it.value_length) : undefined,
                value_payload: (it && it.value_payload != null) ? String(it.value_payload) : undefined
            });
        });

        var auditMeta = buildAutoAuditMeta(req, inst);

        return callEmpRequest(req.dev_type, req.dev_id, inst).then(function (resp) {
            if (auditMeta) {
                var code = parseEmpResultCode(resp);
                queueOplog({
                    ts: Math.floor(Date.now() / 1000),
                    user: auditMeta.user,
                    page_key: auditMeta.page_key,
                    action_key: auditMeta.action_key,
                    dev_id: auditMeta.dev_id,
                    ip: auditMeta.ip,
                    result_key: code === 0 ? 'success' : 'failure'
                });
            }
            return resp;
        }).catch(function (e) {
            if (auditMeta) {
                queueOplog({
                    ts: Math.floor(Date.now() / 1000),
                    user: auditMeta.user,
                    page_key: auditMeta.page_key,
                    action_key: auditMeta.action_key,
                    dev_id: auditMeta.dev_id,
                    ip: auditMeta.ip,
                    result_key: 'failure'
                });
            }
            throw e;
        });
    }
});

window.attachEmpAudit = window.attachEmpAudit || attachEmpAudit;
window.recordAdAudit = window.recordAdAudit || recordAdAudit;

return EmpApi;
