'use strict'

const DEV_TYPE = {
    PF: 0,
    GW: 1,
    AD: 2,
    FD: 3
};

const OBJ_ID = {
    CUR_DEV: 10,
    FAR_DEV: 11,
    CLD_DEV: 12,
    WIRLESS: 13,
    OTA_CLI: 14,
    OTA_SRV: 15,
    AD_LP: 16,
    LOWPOWER: 17,
    INS_OP: 18,
    WIRELESS_ATTR_24G: 20,
    WIRELESS_ATTR_5G: 21,
    PORT_SETTING: 25,
    DEV_INFO: 26,
    WIRELESS_COMMON: 29,
    TOOL: 105
};

const OPT_TYPE = {
    READ: 0,
    WRITE: 1,
    EXEC: 2
};

const OPT_RANGE = {
    SINGLE_RES: 0,
    OBJ_RES: 1,
    INS_RES: 2,
    OBJ_ALL_RES: 3,
    DEV_RES: 4
};

const VALUE_TYPE = {
    NONE: 0,
    I8: 1,
    I16: 2,
    I32: 3,
    I64: 4,
    U8: 5,
    U16: 6,
    U32: 7,
    U64: 8,
    FLOAT: 9,
    DOUBLE: 10,
    BOOLEAN: 11,
    STRING: 12,
    OPAQUE: 13
};

const VALUE_LENGTH = {
    I8: 1,
    U8: 1,
    BOOLEAN: 1,
    I16: 2,
    U16: 2,
    I32: 4,
    U32: 4,
    I64: 8,
    U64: 8
};

const RES = {
    CUR_DEV: {
        DEV_TYPE: 0,
        DEV_ID: 1,
        DEV_IP: 2,
        DEV_PORT: 3,
        CLD_NUM: 4,
        MANU: 5,
        DEV_MODE: 6,
        DEV_SEQ: 7,
        FIRMWARE_VER: 8,
        RESET: 9,
        FACTORY: 10,
        MAC: 11,
        STATUS: 16,
        RUNTIME: 17,
        HW_VER: 18,
        SW_VER: 19,
        LP_VER: 20,
        DEV_MASK: 21,
        SAVE_CONFIG: 22
    },
    CLD_DEV: {
        DEV_TYPE: 0,
        DEV_ID: 1,
        DEV_IP: 2,
        DEV_PORT: 3,
        ACTIVE: 4,
        LIFETIME: 5,
        TOPO: 6,
        RES_NUM: 7,
        RES_LIST: 8,
        MAC: 9
    },
    OTA_CLI: {
        PKG_NAME: 0,
        PKG_SIZE: 1,
        PKG_TYPE: 2,
        PKG_DST_VER: 3,
        PKG_OLD_VER: 4,
        PKG_DST_PATH: 5,
        PKG_UP_PATH: 6,
        PKG_FRAG_SIZE: 7,
        PKG_FRAG_SEQ: 8,
        STATUS: 9,
        RESULT: 10,
        RETRY: 11,
        UPDATE: 12,
        IS_SELF: 14,
        UI_USED: 15
    },
    OTA_SRV: {
        PKG_NAME: 0,
        PKG_SIZE: 1,
        PKG_TYPE: 2,
        PKG_DST_VER: 3,
        PKG_OLD_VER: 4,
        PKG_DST_PATH: 5,
        PKG_UP_PATH: 6,
        PKG_DST_ID: 7,
        PKG_UPDATE_START: 8,
        DST_DEV_TYPE: 10
    },
    AD_LP: {
        DEV_VER: 0,
        DEV_CHAN: 1,
        DEV_POWER: 2,
        SERIAL_STAT: 3
    },
    LOWPOWER: {
        DEV_ID: 1,
        VERSION: 2,
        CHANNEL: 4,
        SN_CODE: 7,
        LOW_VOL: 8,
        WIRELESS_SND_NUM: 9,
        LAST_AD_IP: 15,
        PROTO_TYPE: 17,
        PROTO_STYLE: 18,
        UPPER_IP: 19,
        LP_IP: 20,
        PORT: 21,
        MOD_ID: 22,
        IS_USED: 23
    },
    INS_OP: {
        ADD: 0,
        DEL: 1,
        INS_ID: 2,
        LP_ID: 3
    },
    WIRELESS_ATTR_24G: {
        DEV_IP: 0,
        DEV_MAC: 1,
        WIA_MAC: 2,
        DEV_STAT: 3,
        BAND: 4,
        IS_SSID_HIDDEN: 5,
        NETW_MODE: 6,
        CONN_MODE: 7,
        NETW_SSID: 8,
        WORK_FREQ: 9,
        WORK_CHAN: 10,
        BAND_WIDTH: 11,
        FRE_OFFSET: 12,
        COMM_MODE: 13,
        MAC_FILTER: 14,
        MAX_CONN_CNT: 15,
        DTIM: 16,
        UPDATE_INTV: 17,
        MAX_LEAVE_TIME: 18,
        TX_POWER: 19,
        WIAFA_FEATURE: 20,
        FD_LIST: 21,
        MULTI_RCV_ENABLED: 23,
        GATEWAY_MAC: 24,
        IS_MASTER_AD: 25,
        RETR_CNT: 26,
        RATE: 27,
        RELATED_FD_COUNT: 28
    },
    WIRELESS_ATTR_5G: {
        DEV_IP: 0,
        DEV_MAC: 1,
        WIA_MAC: 2,
        DEV_STAT: 3,
        BAND: 4,
        IS_SSID_HIDDEN: 5,
        NETW_MODE: 6,
        CONN_MODE: 7,
        NETW_SSID: 8,
        WORK_FREQ: 9,
        WORK_CHAN: 10,
        BAND_WIDTH: 11,
        FRE_OFFSET: 12,
        COMM_MODE: 13,
        MAC_FILTER: 14,
        MAX_CONN_CNT: 15,
        DTIM: 16,
        UPDATE_INTV: 17,
        MAX_LEAVE_TIME: 18,
        TX_POWER: 19,
        WIAFA_FEATURE: 20,
        FD_LIST: 21,
        MULTI_RCV_ENABLED: 23,
        GATEWAY_MAC: 24,
        IS_MASTER_AD: 25,
        RETR_CNT: 26,
        RATE: 27,
        RELATED_FD_COUNT: 28
    },
    PORT_SETTING: {
        WIRED_CNT: 0,
        PORT_STAT: 1,
        PORT_MODE: 2,
        PORT_IP: 3,
        WIRELESS_PORT_STAT: 4,
        PORT_MAC: 5
    },
    DEV_INFO: {
        ANTENNA_CNT: 0,
        WIRELESS_FUNC: 1,
        DRIVER_VER: 2,
        WORK_MODE: 3,
        AUTO_CLEAR: 4
    },
    WIRELESS_COMMON: {
        DFR_ENABLED: 0,
        HOST_LINK: 1
    },
    TOOL: {
        IP1: 0,
        RESULT1: 1,
        IP2: 2,
        RESULT2: 3,
        WARN: 4
    },
    COMMON: {
        LOG_LEVEL: 0,
        WORK_BITMAP: 1
    }
};

const PORT_SETTING_ENUM = {
    PORT_STAT: {
        DOWN: 0,
        UP: 1
    },
    PORT_MODE: {
        LAN: 0,
        WAN: 1
    },
    WIRELESS_STAT: {
        WIFI24_ONLY: 0,
        WIFI5_ONLY: 1,
        WIFI24_5_BOTH: 2
    },
    PORT_MODE_TEXT: {
        LAN: 'LAN',
        WAN: 'WAN'
    },
    PORT_STAT_TEXT: {
        UP: 'LINK UP',
        DOWN: 'LINK DOWN'
    },
    WIRELESS_FUNC: {
        STD_WIAFA: 0,
        PRI_WIAFA: 1
    },
    WORK_MODE: {
        STD_WIFI: 0,
        STD_WIAFA: 1,
        PRI_WIAFA: 2
    }
};

const DB_TYPE = {
    INTEGER: 0,
    TEXT: 1,
    REAL: 2,
    BLOB: 3,
    NUMERIC: 4
};

const DB_TABLE = {
    SELF: {
        NAME: 'self_dev_info',
        COL_NUM: 5,
        COLS: {
            id: { TYPE: DB_TYPE.INTEGER, PRIMARY: true },
            dev_id: { TYPE: DB_TYPE.TEXT, PRIMARY: false },
            dev_name: { TYPE: DB_TYPE.TEXT, PRIMARY: false },
            dev_ip: { TYPE: DB_TYPE.TEXT, PRIMARY: false },
            dev_type: { TYPE: DB_TYPE.INTEGER, PRIMARY: false }
        }
    }
};

window.DEV_TYPE = DEV_TYPE;
window.OBJ_ID = OBJ_ID;
window.OPT_TYPE = OPT_TYPE;
window.OPT_RANGE = OPT_RANGE;
window.VALUE_TYPE = VALUE_TYPE;
window.VALUE_LENGTH = VALUE_LENGTH;
window.RES = RES;
window.PORT_SETTING_ENUM = PORT_SETTING_ENUM;
window.DB_TYPE = DB_TYPE;
window.DB_TABLE = DB_TABLE;
