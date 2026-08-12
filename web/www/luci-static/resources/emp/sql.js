'use strict';
'require rpc';
'require baseclass';

var callDbExec = rpc.declare({
    object: 'luci.db',
    method: 'exec',
    params: ['sql', 'params'],
    expect: {}
});

function normalizeRpcError(e) {
    var out = { code: 0, message: '' };

    if (!e) {
        return out;
    }

    if (typeof e.code === 'number') {
        out.code = e.code;
    }
    if (typeof e.message === 'string') {
        out.message = e.message;
    }

    if (e.error) {
        if (typeof e.error.code === 'number') {
            out.code = e.error.code;
        }
        if (typeof e.error.message === 'string') {
            out.message = e.error.message;
        }
    }

    if (!out.message && typeof e.toString === 'function') {
        out.message = String(e);
    }

    return out;
}

function isDbOfflineError(e) {
    var ne = normalizeRpcError(e);
    if (ne.code === -32000) {
        return true;
    }
    if (/Object not found/i.test(ne.message || '')) {
        return true;
    }
    return false;
}

function isPlainObject(o) {
    if (!o || typeof o !== 'object') {
        return false;
    }

    return Object.prototype.toString.call(o) === '[object Object]';
}

function normalizeIdentifier(name, label) {
    var s = String((name == null) ? '' : name).trim();

    if (!s) {
        throw new Error(label + ': empty');
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) {
        throw new Error(label + ': invalid: ' + s);
    }

    return s;
}

function normalizeType(t) {
    var s = String((t == null) ? '' : t).trim();

    if (!s) {
        throw new Error('column type: empty');
    }

    if (/[;"']/.test(s)) {
        throw new Error('column type: invalid: ' + s);
    }

    return s;
}

function normalizeDb(resp) {
    var out = {
        ok: false,
        status: -1,
        rows: []
    };

    if (!resp || !isPlainObject(resp)) {
        return out;
    }

    out.status = (resp.status != null) ? Number(resp.status) : -1;
    out.ok = (out.status === 0);

    if (Array.isArray(resp.rows)) {
        out.rows = resp.rows;
    } else {
        out.rows = [];
    }

    return out;
}

function parseCell(v) {
    if (v === '') {
        return null;
    }

    if (typeof v === 'string' && /^-?\d+$/.test(v)) {
        if (v.length <= 15) {
            var n = Number(v);
            if (!isNaN(n)) {
                return n;
            }
        }
        return v;
    }

    return v;
}

function parseRows(rows) {
    if (!Array.isArray(rows)) {
        return [];
    }

    return rows.map(function (r) {
        if (!isPlainObject(r)) {
            return r;
        }

        var out = {};
        Object.keys(r).forEach(function (k) {
            out[k] = parseCell(r[k]);
        });
        return out;
    });
}

function normalizeParamValue(v) {
    if (v === null || v === undefined) {
        return '';
    }

    return String(v);
}

function buildQueryAllSql(tableName) {
    var tn = normalizeIdentifier(tableName, 'tableName');
    return 'SELECT * FROM ' + tn;
}

function buildQueryAllSqlOrderBy(tableName, orderByCol, desc) {
    var tn = normalizeIdentifier(tableName, 'tableName');
    var cn = normalizeIdentifier(orderByCol, 'column name');
    var dir = desc ? ' DESC' : ' ASC';
    return 'SELECT * FROM ' + tn + ' ORDER BY ' + cn + dir;
}

function buildDropTableSql(tableName) {
    var tn = normalizeIdentifier(tableName, 'tableName');
    return 'DROP TABLE ' + tn;
}

function buildCreateTableSql(tableName, cols) {
    var tn = normalizeIdentifier(tableName, 'tableName');

    if (!Array.isArray(cols) || cols.length === 0) {
        throw new Error('createTable: cols must be a non-empty array');
    }

    var colDefs = [];
    var pkCols = [];

    for (var i = 0; i < cols.length; i++) {
        var c = cols[i] || {};
        var cn = normalizeIdentifier(c.name, 'column name');
        var ct = normalizeType(c.type);

        colDefs.push(cn + ' ' + ct);

        if (c.primaryKey === true) {
            pkCols.push(cn);
        }
    }

    if (pkCols.length === 1) {
        for (var j = 0; j < cols.length; j++) {
            if (cols[j] && cols[j].primaryKey === true) {
                var pkName = normalizeIdentifier(cols[j].name, 'column name');
                for (var k = 0; k < colDefs.length; k++) {
                    if (colDefs[k].indexOf(pkName + ' ') === 0) {
                        colDefs[k] = colDefs[k] + ' PRIMARY KEY';
                        break;
                    }
                }
                break;
            }
        }
    } else if (pkCols.length > 1) {
        colDefs.push('PRIMARY KEY (' + pkCols.join(', ') + ')');
    }

    return 'CREATE TABLE IF NOT EXISTS ' + tn + ' (' + colDefs.join(', ') + ')';
}

function buildInsertSql(tableName, colKeyMap) {
    var tn = normalizeIdentifier(tableName, 'tableName');

    if (!isPlainObject(colKeyMap)) {
        throw new Error('insertRow: colKeyMap must be an object');
    }

    var cols = [];
    var params = [];

    Object.keys(colKeyMap).forEach(function (k) {
        if (!Object.prototype.hasOwnProperty.call(colKeyMap, k)) {
            return;
        }

        var cn = normalizeIdentifier(k, 'column name');
        cols.push(cn);
        params.push(normalizeParamValue(colKeyMap[k]));
    });

    if (cols.length === 0) {
        throw new Error('insertRow: empty columns');
    }

    var qmarks = cols.map(function () {
        return '?';
    }).join(', ');

    return {
        sql: 'INSERT INTO ' + tn + ' (' + cols.join(', ') + ') VALUES (' + qmarks + ')',
        params: params
    };
}

function buildQueryFirstRowidWhereOrderBySql(tableName, whereCol, whereVal, orderByCol, desc) {
    var tn = normalizeIdentifier(tableName, 'tableName');
    var wc = normalizeIdentifier(whereCol, 'column name');
    var oc = normalizeIdentifier(orderByCol, 'column name');
    var dir = desc ? ' DESC' : ' ASC';

    return {
        sql: 'SELECT rowid AS __rowid__ FROM ' + tn +
            ' WHERE ' + wc + ' = ?' +
            ' ORDER BY ' + oc + dir +
            ' LIMIT 1',
        params: [normalizeParamValue(whereVal)]
    };
}

function buildUpdateOneWhereSql(tableName, setCol, setVal, whereCol, whereVal) {
    var tn = normalizeIdentifier(tableName, 'tableName');
    var sc = normalizeIdentifier(setCol, 'column name');
    var wc = normalizeIdentifier(whereCol, 'column name');

    return {
        sql: 'UPDATE ' + tn + ' SET ' + sc + ' = ? WHERE ' + wc + ' = ?',
        params: [normalizeParamValue(setVal), normalizeParamValue(whereVal)]
    };
}

function buildUpdateOneByRowidSql(tableName, setCol, setVal, rowid) {
    var tn = normalizeIdentifier(tableName, 'tableName');
    var sc = normalizeIdentifier(setCol, 'column name');

    return {
        sql: 'UPDATE ' + tn + ' SET ' + sc + ' = ? WHERE rowid = ?',
        params: [normalizeParamValue(setVal), normalizeParamValue(rowid)]
    };
}

var SqlApi = baseclass.extend({
    dbExec: function (sql, params) {
        var s = String((sql == null) ? '' : sql);

        if (!s.trim()) {
            return Promise.reject(new Error('dbExec: empty sql'));
        }

        var p = Array.isArray(params) ? params : [];
        var pp = p.map(function (v) {
            return normalizeParamValue(v);
        });

        return callDbExec(s, pp).catch(function (e) {
            var ne = normalizeRpcError(e);
            var err = new Error(ne.message || 'RPC error');
            err.code = ne.code;
            err.is_offline = isDbOfflineError(e);
            throw err;
        });
    },

    queryTable: function (tableName) {
        var sql = buildQueryAllSql(tableName);

        return this.dbExec(sql, []).then(function (resp) {
            var nr = normalizeDb(resp);
            return {
                ok: nr.ok,
                status: nr.status,
                rows: parseRows(nr.rows)
            };
        });
    },

    queryTableOrderBy: function (tableName, orderByCol, desc) {
        var sql = buildQueryAllSqlOrderBy(tableName, orderByCol, !!desc);

        return this.dbExec(sql, []).then(function (resp) {
            var nr = normalizeDb(resp);
            return {
                ok: nr.ok,
                status: nr.status,
                rows: parseRows(nr.rows)
            };
        });
    },

    createTable: function (tableName, cols) {
        var sql = buildCreateTableSql(tableName, cols);

        return this.dbExec(sql, []).then(function (resp) {
            var nr = normalizeDb(resp);
            return {
                ok: nr.ok,
                status: nr.status,
                rows: nr.rows
            };
        });
    },

    insertRow: function (tableName, colKeyMap) {
        var built = buildInsertSql(tableName, colKeyMap);

        return this.dbExec(built.sql, built.params).then(function (resp) {
            var nr = normalizeDb(resp);
            return {
                ok: nr.ok,
                status: nr.status,
                rows: nr.rows
            };
        });
    },

    updateLatestOneWhereOrderBy: function (tableName, setCol, setVal, whereCol, whereVal, orderByCol, desc) {
        var q = buildQueryFirstRowidWhereOrderBySql(
            tableName,
            whereCol,
            whereVal,
            orderByCol,
            !!desc
        );

        var self = this;

        return self.dbExec(q.sql, q.params).then(function (respSel) {
            var nrSel = normalizeDb(respSel);
            if (!nrSel.ok) {
                return {
                    ok: false,
                    status: nrSel.status,
                    updated: false
                };
            }

            var rows = parseRows(nrSel.rows);
            if (!rows || rows.length === 0 || rows[0].__rowid__ == null) {
                return {
                    ok: true,
                    status: nrSel.status,
                    updated: false
                };
            }

            var rid = rows[0].__rowid__;
            var u = buildUpdateOneByRowidSql(tableName, setCol, setVal, rid);

            return self.dbExec(u.sql, u.params).then(function (respUpd) {
                var nrUpd = normalizeDb(respUpd);
                return {
                    ok: nrUpd.ok,
                    status: nrUpd.status,
                    updated: !!nrUpd.ok
                };
            });
        });
    },

    updateOneWhere: function (tableName, setCol, setVal, whereCol, whereVal) {
        var built = buildUpdateOneWhereSql(tableName, setCol, setVal, whereCol, whereVal);

        return this.dbExec(built.sql, built.params).then(function (resp) {
            var nr = normalizeDb(resp);
            return {
                ok: nr.ok,
                status: nr.status,
                rows: nr.rows
            };
        });
    },

    delTable: function (tableName) {
        var sql = buildDropTableSql(tableName);

        return this.dbExec(sql, []).then(function (resp) {
            var nr = normalizeDb(resp);
            return {
                ok: nr.ok,
                status: nr.status,
                rows: nr.rows
            };
        });
    },

    buildQueryAllSql: function (tableName) {
        return buildQueryAllSql(tableName);
    },

    buildQueryAllSqlOrderBy: function (tableName, orderByCol, desc) {
        return buildQueryAllSqlOrderBy(tableName, orderByCol, !!desc);
    },

    buildCreateTableSql: function (tableName, cols) {
        return buildCreateTableSql(tableName, cols);
    },

    buildInsertSql: function (tableName, colKeyMap) {
        return buildInsertSql(tableName, colKeyMap);
    },

    buildQueryFirstRowidWhereOrderBySql: function (tableName, whereCol, whereVal, orderByCol, desc) {
        return buildQueryFirstRowidWhereOrderBySql(
            tableName,
            whereCol,
            whereVal,
            orderByCol,
            !!desc
        );
    },

    buildUpdateOneWhereSql: function (tableName, setCol, setVal, whereCol, whereVal) {
        return buildUpdateOneWhereSql(tableName, setCol, setVal, whereCol, whereVal);
    },

    buildUpdateOneByRowidSql: function (tableName, setCol, setVal, rowid) {
        return buildUpdateOneByRowidSql(tableName, setCol, setVal, rowid);
    },

    buildDropTableSql: function (tableName) {
        return buildDropTableSql(tableName);
    }
});

return SqlApi;