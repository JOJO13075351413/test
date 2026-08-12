    /sbin/procd &
    /sbin/ubusd &
    service network start
    service rpcd start
    service uhttpd start
    opkg install luci-i18n-base-zh-cn

    ifconfig eth0