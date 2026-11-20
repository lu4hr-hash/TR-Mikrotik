# <!-- MADE BY AI: -->
# <!-- 1. Gemini 3.8 Flash (High) -->
# <!-- 2. Claude Sonnet 4.6 (Thinking) -->
# <!-- 3. Claude Opus 4.6 Thinking -->
# <!-- 4. GPT OSS 120B (Medium) -->

import os
import uuid
import secrets
from functools import wraps
from flask import Flask, render_template, request, jsonify, session
from mikrotik_client import MikrotikRestClient

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(24))

# Cache client instances per session
CLIENTS = {}


def get_client() -> MikrotikRestClient:
    """Mengambil atau menginisialisasi instance MikrotikRestClient dari session saat ini"""
    session_id = session.get("sid")
    if not session_id or session_id not in CLIENTS:
        cfg = session.get("mikrotik")
        if cfg:
            client = MikrotikRestClient(
                host=cfg.get("host", "192.168.88.1"),
                port=cfg.get("port", 443),
                username=cfg.get("username", "admin"),
                password=cfg.get("password", ""),
                use_ssl=cfg.get("use_ssl", True),
                demo_mode=cfg.get("demo_mode", False),
            )
            if not session_id:
                session_id = str(uuid.uuid4())
                session["sid"] = session_id
            CLIENTS[session_id] = client
            return client
        return None
    return CLIENTS.get(session_id)


def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        client = get_client()
        if not client:
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Sesi belum terhubung ke MikroTik. Silakan login terlebih dahulu.",
                        "authenticated": False,
                    }
                ),
                401,
            )
        return f(client, *args, **kwargs)

    return decorated_function


# ==================== WEB PAGES ====================


@app.route("/")
def index():
    return render_template("index.html")


# ==================== AUTH / CONNECTION APIS ====================


@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.get_json() or {}
    host = data.get("host", "192.168.88.1").strip()
    port = int(data.get("port", 443))
    username = data.get("username", "admin").strip()
    password = data.get("password", "")
    use_ssl = bool(data.get("use_ssl", True))
    demo_mode = bool(data.get("demo_mode", False))

    client = MikrotikRestClient(
        host=host,
        port=port,
        username=username,
        password=password,
        use_ssl=use_ssl,
        demo_mode=demo_mode,
    )

    test = client.test_connection()
    if test.get("success"):
        sid = str(uuid.uuid4())
        session["sid"] = sid
        session["mikrotik"] = {
            "host": host,
            "port": port,
            "username": username,
            "password": password,
            "use_ssl": use_ssl,
            "demo_mode": demo_mode,
            "identity": test.get("identity", "MikroTik"),
            "board": test.get("board", "RouterBoard"),
            "version": test.get("version", "v7"),
        }
        CLIENTS[sid] = client
        return jsonify(
            {
                "success": True,
                "message": test.get("message"),
                "session": session["mikrotik"],
            }
        )
    else:
        return jsonify({"success": False, "message": test.get("message")}), 400


@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    sid = session.get("sid")
    if sid and sid in CLIENTS:
        del CLIENTS[sid]
    session.clear()
    return jsonify({"success": True, "message": "Berhasil logout dari MikroTik"})


@app.route("/api/auth/status", methods=["GET"])
def api_auth_status():
    client = get_client()
    if client:
        cfg = session.get("mikrotik", {})
        return jsonify(
            {
                "authenticated": True,
                "host": cfg.get("host"),
                "port": cfg.get("port"),
                "username": cfg.get("username"),
                "demo_mode": cfg.get("demo_mode", False),
                "identity": cfg.get("identity", "MikroTik"),
                "board": cfg.get("board", "RouterBoard"),
                "version": cfg.get("version", "v7"),
            }
        )
    return jsonify({"authenticated": False})


# ==================== DASHBOARD SUMMARY ====================


@app.route("/api/dashboard/summary", methods=["GET"])
@require_auth
def api_dashboard_summary(client: MikrotikRestClient):
    resource = client.get_resource()
    identity = client.get_identity()
    routerboard = client.get_routerboard()
    interfaces = client.get_interfaces()
    ip_addresses = client.get_ip_addresses()
    dhcp_leases = client.get_dhcp_leases()

    # Hitung pemakaian memori dan disk dalam persen
    total_mem = int(resource.get("total-memory", 1))
    free_mem = int(resource.get("free-memory", 0))
    used_mem = total_mem - free_mem
    mem_percent = round((used_mem / total_mem) * 100, 1) if total_mem else 0

    total_hdd = int(resource.get("total-hdd-space", 1))
    free_hdd = int(resource.get("free-hdd-space", 0))
    used_hdd = total_hdd - free_hdd
    hdd_percent = round((used_hdd / total_hdd) * 100, 1) if total_hdd else 0

    running_ifaces = sum(1 for i in interfaces if str(i.get("running")).lower() == "true")
    disabled_ifaces = sum(1 for i in interfaces if str(i.get("disabled")).lower() == "true")

    return jsonify(
        {
            "success": True,
            "identity": identity.get("name", "MikroTik"),
            "model": routerboard.get("model")
            or resource.get("board-name", "RouterBoard"),
            "firmware": routerboard.get("current-firmware")
            or resource.get("version", "v7"),
            "serial": routerboard.get("serial-number", "N/A"),
            "uptime": resource.get("uptime", "0s"),
            "cpu_model": resource.get("cpu", "Generic CPU"),
            "cpu_cores": resource.get("cpu-count", 1),
            "cpu_freq": resource.get("cpu-frequency", 0),
            "cpu_load": int(resource.get("cpu-load", 0)),
            "memory": {
                "total": total_mem,
                "free": free_mem,
                "used": used_mem,
                "percent": mem_percent,
            },
            "hdd": {
                "total": total_hdd,
                "free": free_hdd,
                "used": used_hdd,
                "percent": hdd_percent,
            },
            "interface_stats": {
                "total": len(interfaces),
                "running": running_ifaces,
                "disabled": disabled_ifaces,
            },
            "ip_address_count": len(ip_addresses),
            "dhcp_lease_count": len(dhcp_leases),
            "demo_mode": client.demo_mode,
        }
    )


# ==================== MONITORING APIS ====================


@app.route("/api/monitoring/traffic", methods=["GET"])
@require_auth
def api_monitoring_traffic(client: MikrotikRestClient):
    interfaces = client.get_interfaces()
    traffic_data = []

    for iface in interfaces:
        # MikroTik REST API mengembalikan rx-byte & tx-byte, atau rx-bps & tx-bps jika dipantau
        rx_bps = int(iface.get("rx-bps", 0))
        tx_bps = int(iface.get("tx-bps", 0))
        rx_byte = int(iface.get("rx-byte", 0))
        tx_byte = int(iface.get("tx-byte", 0))
        traffic_data.append(
            {
                "id": iface.get(".id"),
                "name": iface.get("name"),
                "type": iface.get("type"),
                "running": str(iface.get("running")).lower() == "true",
                "disabled": str(iface.get("disabled")).lower() == "true",
                "mac": iface.get("mac-address", "-"),
                "rx_bps": rx_bps,
                "tx_bps": tx_bps,
                "rx_bytes": rx_byte,
                "tx_bytes": tx_byte,
                "comment": iface.get("comment", ""),
            }
        )

    return jsonify({"success": True, "interfaces": traffic_data})


@app.route("/api/monitoring/resources", methods=["GET"])
@require_auth
def api_monitoring_resources(client: MikrotikRestClient):
    res = client.get_resource()
    total_mem = int(res.get("total-memory", 1))
    free_mem = int(res.get("free-memory", 0))
    used_mem = total_mem - free_mem
    mem_percent = round((used_mem / total_mem) * 100, 1) if total_mem else 0

    return jsonify(
        {
            "success": True,
            "cpu_load": int(res.get("cpu-load", 0)),
            "uptime": res.get("uptime", "0s"),
            "memory_percent": mem_percent,
            "memory_used": used_mem,
            "memory_total": total_mem,
            "free_memory": free_mem,
        }
    )


@app.route("/api/monitoring/connections", methods=["GET"])
@require_auth
def api_monitoring_connections(client: MikrotikRestClient):
    limit = int(request.args.get("limit", 40))
    conns = client.get_connections(limit=limit)
    return jsonify({"success": True, "count": len(conns), "connections": conns})


@app.route("/api/monitoring/logs", methods=["GET"])
@require_auth
def api_monitoring_logs(client: MikrotikRestClient):
    limit = int(request.args.get("limit", 50))
    logs = client.get_logs(limit=limit)
    return jsonify({"success": True, "count": len(logs), "logs": logs})


# ==================== CONFIGURATION & GENERAL FEATURES ====================

# 1. INTERFACES
@app.route("/api/interfaces", methods=["GET"])
@require_auth
def api_get_interfaces(client: MikrotikRestClient):
    ifaces = client.get_interfaces()
    return jsonify({"success": True, "interfaces": ifaces})


@app.route("/api/interfaces/<path:iface_id>/toggle", methods=["POST"])
@require_auth
def api_toggle_interface(client: MikrotikRestClient, iface_id: str):
    data = request.get_json() or {}
    disabled = bool(data.get("disabled", False))
    res = client.set_interface_state(iface_id, disabled)
    return jsonify(res)


# 2. IP ADDRESSES
@app.route("/api/ip/addresses", methods=["GET"])
@require_auth
def api_get_ip_addresses(client: MikrotikRestClient):
    addrs = client.get_ip_addresses()
    return jsonify({"success": True, "addresses": addrs})


@app.route("/api/ip/addresses", methods=["POST"])
@require_auth
def api_add_ip_address(client: MikrotikRestClient):
    data = request.get_json() or {}
    address = data.get("address", "").strip()
    interface = data.get("interface", "").strip()
    comment = data.get("comment", "").strip()

    if not address or not interface:
        return (
            jsonify({"success": False, "error": "IP Address dan Interface wajib diisi"}),
            400,
        )

    res = client.add_ip_address(address, interface, comment)
    return jsonify(res)


@app.route("/api/ip/addresses/<path:addr_id>", methods=["DELETE"])
@require_auth
def api_delete_ip_address(client: MikrotikRestClient, addr_id: str):
    res = client.delete_ip_address(addr_id)
    return jsonify(res)


@app.route("/api/ip/addresses/<path:addr_id>/update", methods=["POST"])
@require_auth
def api_update_ip_address(client: MikrotikRestClient, addr_id: str):
    data = request.get_json() or {}
    address = data.get("address", "").strip()
    interface = data.get("interface", "").strip()
    comment = data.get("comment", "").strip()
    if not address or not interface:
        return jsonify({"success": False, "error": "IP Address dan Interface wajib diisi"}), 400
    res = client.update_ip_address(addr_id, address, interface, comment)
    return jsonify(res)


# 2.5 DHCP SERVERS
@app.route("/api/ip/dhcp-servers", methods=["GET"])
@require_auth
def api_get_dhcp_servers(client: MikrotikRestClient):
    servers = client.get_dhcp_servers()
    return jsonify({"success": True, "servers": servers})


# 3. DHCP LEASES
@app.route("/api/ip/dhcp-leases", methods=["GET"])
@require_auth
def api_get_dhcp_leases(client: MikrotikRestClient):
    leases = client.get_dhcp_leases()
    return jsonify({"success": True, "leases": leases})


@app.route("/api/ip/dhcp-leases", methods=["POST"])
@require_auth
def api_add_dhcp_lease(client: MikrotikRestClient):
    data = request.get_json() or {}
    address = data.get("address", "").strip()
    mac = data.get("mac_address", "").strip()
    comment = data.get("comment", "").strip()

    if not address or not mac:
        return (
            jsonify({"success": False, "error": "IP Address dan MAC Address wajib diisi"}),
            400,
        )

    res = client.add_static_lease(address, mac, comment)
    return jsonify(res)


@app.route("/api/ip/dhcp-leases/<path:lease_id>", methods=["DELETE"])
@require_auth
def api_delete_dhcp_lease(client: MikrotikRestClient, lease_id: str):
    res = client.delete_dhcp_lease(lease_id)
    return jsonify(res)


@app.route("/api/ip/dhcp-leases/<path:lease_id>/update", methods=["POST"])
@require_auth
def api_update_dhcp_lease(client: MikrotikRestClient, lease_id: str):
    data = request.get_json() or {}
    address = data.get("address", "").strip()
    mac = data.get("mac_address", "").strip()
    comment = data.get("comment", "").strip()
    if not address or not mac:
        return jsonify({"success": False, "error": "IP Address dan MAC Address wajib diisi"}), 400
    res = client.update_dhcp_lease(lease_id, address, mac, comment)
    return jsonify(res)


# 4. IP POOLS
@app.route("/api/ip/pools", methods=["GET"])
@require_auth
def api_get_ip_pools(client: MikrotikRestClient):
    pools = client.get_ip_pools()
    return jsonify({"success": True, "pools": pools})


@app.route("/api/ip/pools", methods=["POST"])
@require_auth
def api_add_ip_pool(client: MikrotikRestClient):
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    ranges = data.get("ranges", "").strip()
    if not name or not ranges:
        return jsonify({"success": False, "error": "Nama Pool dan Range IP wajib diisi"}), 400
    res = client.add_ip_pool(name, ranges)
    return jsonify(res)


@app.route("/api/ip/pools/<path:pool_id>/update", methods=["POST"])
@require_auth
def api_update_ip_pool(client: MikrotikRestClient, pool_id: str):
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    ranges = data.get("ranges", "").strip()
    if not name or not ranges:
        return jsonify({"success": False, "error": "Nama Pool dan Range IP wajib diisi"}), 400
    res = client.update_ip_pool(pool_id, name, ranges)
    return jsonify(res)


@app.route("/api/ip/pools/<path:pool_id>", methods=["DELETE"])
@require_auth
def api_delete_ip_pool(client: MikrotikRestClient, pool_id: str):
    res = client.delete_ip_pool(pool_id)
    return jsonify(res)


# 5. DNS
@app.route("/api/ip/dns", methods=["GET"])
@require_auth
def api_get_dns(client: MikrotikRestClient):
    dns = client.get_dns()
    return jsonify({"success": True, "dns": dns})


@app.route("/api/ip/dns", methods=["POST"])
@require_auth
def api_update_dns(client: MikrotikRestClient):
    data = request.get_json() or {}
    servers = data.get("servers", "").strip()
    allow_remote = bool(data.get("allow_remote_requests", True))
    res = client.set_dns(servers, allow_remote)
    return jsonify(res)


# 6. FIREWALL FILTER & NAT
@app.route("/api/firewall/filters", methods=["GET"])
@require_auth
def api_get_firewall_filters(client: MikrotikRestClient):
    rules = client.get_firewall_filters()
    return jsonify({"success": True, "rules": rules})


@app.route("/api/firewall/filters", methods=["POST"])
@require_auth
def api_add_firewall_filter(client: MikrotikRestClient):
    data = request.get_json() or {}
    chain = data.get("chain", "input").strip()
    action = data.get("action", "accept").strip()
    protocol = data.get("protocol", "").strip()
    port = data.get("port", "").strip()
    comment = data.get("comment", "").strip()
    res = client.add_firewall_filter(chain, action, protocol, port, comment)
    return jsonify(res)


@app.route("/api/firewall/filters/<path:rule_id>", methods=["DELETE"])
@require_auth
def api_delete_firewall_filter(client: MikrotikRestClient, rule_id: str):
    res = client.delete_firewall_rule("filter", rule_id)
    return jsonify(res)


@app.route("/api/firewall/filters/<path:rule_id>/update", methods=["POST"])
@require_auth
def api_update_firewall_filter(client: MikrotikRestClient, rule_id: str):
    data = request.get_json() or {}
    chain = data.get("chain", "input").strip()
    action = data.get("action", "accept").strip()
    protocol = data.get("protocol", "").strip()
    port = data.get("port", "").strip()
    comment = data.get("comment", "").strip()
    res = client.update_firewall_filter(rule_id, chain, action, protocol, port, comment)
    return jsonify(res)


@app.route("/api/firewall/nats", methods=["GET"])
@require_auth
def api_get_firewall_nats(client: MikrotikRestClient):
    rules = client.get_firewall_nats()
    return jsonify({"success": True, "rules": rules})


@app.route("/api/firewall/nats", methods=["POST"])
@require_auth
def api_add_firewall_nat(client: MikrotikRestClient):
    data = request.get_json() or {}
    chain = data.get("chain", "srcnat").strip()
    action = data.get("action", "masquerade").strip()
    out_interface = data.get("out_interface", "").strip()
    to_addresses = data.get("to_addresses", "").strip()
    comment = data.get("comment", "").strip()
    res = client.add_firewall_nat(chain, action, out_interface, to_addresses, comment)
    return jsonify(res)


@app.route("/api/firewall/nats/<path:rule_id>", methods=["DELETE"])
@require_auth
def api_delete_firewall_nat(client: MikrotikRestClient, rule_id: str):
    res = client.delete_firewall_rule("nat", rule_id)
    return jsonify(res)


@app.route("/api/firewall/nats/<path:rule_id>/update", methods=["POST"])
@require_auth
def api_update_firewall_nat(client: MikrotikRestClient, rule_id: str):
    data = request.get_json() or {}
    chain = data.get("chain", "srcnat").strip()
    action = data.get("action", "masquerade").strip()
    out_interface = data.get("out_interface", "").strip()
    to_addresses = data.get("to_addresses", "").strip()
    comment = data.get("comment", "").strip()
    res = client.update_firewall_nat(rule_id, chain, action, out_interface, to_addresses, comment)
    return jsonify(res)


# 7. HOTSPOT
@app.route("/api/hotspot/active", methods=["GET"])
@require_auth
def api_get_hotspot_active(client: MikrotikRestClient):
    active = client.get_hotspot_active()
    return jsonify({"success": True, "active": active})


@app.route("/api/hotspot/users", methods=["GET"])
@require_auth
def api_get_hotspot_users(client: MikrotikRestClient):
    users = client.get_hotspot_users()
    return jsonify({"success": True, "users": users})


@app.route("/api/hotspot/users", methods=["POST"])
@require_auth
def api_add_hotspot_user(client: MikrotikRestClient):
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    password = data.get("password", "")
    profile = data.get("profile", "default").strip()
    comment = data.get("comment", "").strip()
    if not name or not password:
        return jsonify({"success": False, "error": "Username dan Password wajib diisi"}), 400
    res = client.add_hotspot_user(name, password, profile, comment)
    return jsonify(res)


@app.route("/api/hotspot/users/<path:user_id>/update", methods=["POST"])
@require_auth
def api_update_hotspot_user(client: MikrotikRestClient, user_id: str):
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    password = data.get("password", "")
    profile = data.get("profile", "default").strip()
    comment = data.get("comment", "").strip()
    if not name:
        return jsonify({"success": False, "error": "Username wajib diisi"}), 400
    res = client.update_hotspot_user(user_id, name, password, profile, comment)
    return jsonify(res)


@app.route("/api/hotspot/users/<path:user_id>", methods=["DELETE"])
@require_auth
def api_delete_hotspot_user(client: MikrotikRestClient, user_id: str):
    res = client.delete_hotspot_user(user_id)
    return jsonify(res)


# 8. SYSTEM (IDENTITY & REBOOT)
@app.route("/api/system/identity", methods=["POST"])
@require_auth
def api_set_identity(client: MikrotikRestClient):
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"success": False, "error": "Nama identity tidak boleh kosong"}), 400
    res = client.set_identity(name)
    if res.get("success") and "mikrotik" in session:
        session["mikrotik"]["identity"] = name
    return jsonify(res)


@app.route("/api/system/reboot", methods=["POST"])
@require_auth
def api_system_reboot(client: MikrotikRestClient):
    res = client.reboot()
    return jsonify(res)


if __name__ == "__main__":
    print("=" * 60)
    print("  🚀 MikroTik REST API Web Dashboard Running")
    print("  🌐 Buka browser Anda di: http://127.0.0.1:5000")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5000, debug=True)
