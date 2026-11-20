import time
import random
import requests
import urllib3
from typing import Dict, Any, List, Optional

# Nonaktifkan warning SSL self-signed certificate khas MikroTik di lab
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


class MikrotikRestClient:
    """
    Client untuk berinteraksi dengan MikroTik RouterOS v7 via REST API.
    Mendukung koneksi langsung (HTTP/HTTPS) dan Mode Simulasi/Demo untuk pengujian lab.
    """

    def __init__(
        self,
        host: str,
        port: int = 443,
        username: str = "admin",
        password: str = "",
        use_ssl: bool = True,
        demo_mode: bool = False,
        timeout: int = 6,
    ):
        self.host = host.strip()
        self.port = int(port)
        self.username = username.strip()
        self.password = password
        self.use_ssl = use_ssl
        self.demo_mode = demo_mode
        self.timeout = timeout

        protocol = "https" if self.use_ssl else "http"
        self.base_url = f"{protocol}://{self.host}:{self.port}/rest"

        self.session = requests.Session()
        self.session.auth = (self.username, self.password)
        self.session.verify = False
        self.session.headers.update(
            {"Content-Type": "application/json", "Accept": "application/json"}
        )

        # State untuk mode demo
        if self.demo_mode:
            self._init_mock_data()

    def test_connection(self) -> Dict[str, Any]:
        """Uji konektivitas ke MikroTik REST API"""
        if self.demo_mode:
            return {
                "success": True,
                "message": "Terhubung ke MikroTik RouterOS (Mode Simulasi Demo)",
                "identity": self.mock_identity["name"],
                "version": "7.15.2 (stable)",
                "board": "RB4011iGS+5HacQ2HnD-IN",
            }

        try:
            res = self.session.get(f"{self.base_url}/system/resource", timeout=self.timeout)
            if res.status_code == 200:
                data = res.json()
                identity = self.get_identity().get("name", "MikroTik")
                return {
                    "success": True,
                    "message": "Koneksi berhasil",
                    "identity": identity,
                    "version": data.get("version", "RouterOS v7"),
                    "board": data.get("board-name", "RouterBoard"),
                }
            elif res.status_code == 401:
                return {
                    "success": False,
                    "message": "Autentikasi gagal: Username atau Password salah",
                }
            elif res.status_code == 404:
                return {
                    "success": False,
                    "message": "REST API tidak ditemukan. Pastikan RouterOS adalah versi 7.1+ dan layanan www-ssl / www aktif di /ip service.",
                }
            else:
                return {
                    "success": False,
                    "message": f"Respon router HTTP {res.status_code}: {res.text[:120]}",
                }
        except requests.exceptions.SSLError as e:
            return {
                "success": False,
                "message": f"Kesalahan SSL: Pastikan port HTTPS sesuai atau coba nonaktifkan SSL jika menggunakan HTTP biasa. ({e})",
            }
        except requests.exceptions.ConnectionError:
            return {
                "success": False,
                "message": f"Tidak dapat terhubung ke {self.host}:{self.port}. Periksa IP, Port, dan pastikan PC satu jaringan dengan router.",
            }
        except Exception as e:
            return {"success": False, "message": f"Kesalahan koneksi: {str(e)}"}

    # ==================== SYSTEM RESOURCE & OVERVIEW ====================

    def get_resource(self) -> Dict[str, Any]:
        if self.demo_mode:
            self._update_mock_resource()
            return self.mock_resource
        try:
            res = self.session.get(f"{self.base_url}/system/resource", timeout=self.timeout)
            return res.json() if res.status_code == 200 else {}
        except Exception:
            return {}

    def get_identity(self) -> Dict[str, Any]:
        if self.demo_mode:
            return self.mock_identity
        try:
            res = self.session.get(f"{self.base_url}/system/identity", timeout=self.timeout)
            return res.json() if res.status_code == 200 else {"name": "MikroTik"}
        except Exception:
            return {"name": "MikroTik"}

    def set_identity(self, name: str) -> Dict[str, Any]:
        if self.demo_mode:
            self.mock_identity["name"] = name
            return {"success": True, "name": name}
        try:
            res = self.session.patch(
                f"{self.base_url}/system/identity", json={"name": name}, timeout=self.timeout
            )
            return {"success": res.status_code in (200, 204), "data": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_routerboard(self) -> Dict[str, Any]:
        if self.demo_mode:
            return self.mock_routerboard
        try:
            res = self.session.get(f"{self.base_url}/system/routerboard", timeout=self.timeout)
            return res.json() if res.status_code == 200 else {}
        except Exception:
            return {}

    def reboot(self) -> Dict[str, Any]:
        if self.demo_mode:
            return {"success": True, "message": "Router berhasil direstart (Simulasi)"}
        try:
            res = self.session.post(f"{self.base_url}/system/reboot", timeout=self.timeout)
            return {"success": res.status_code in (200, 204), "message": "Perintah reboot terkirim"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== INTERFACES ====================

    def get_interfaces(self) -> List[Dict[str, Any]]:
        if self.demo_mode:
            self._update_mock_interface_stats()
            return self.mock_interfaces
        try:
            res = self.session.get(f"{self.base_url}/interface", timeout=self.timeout)
            return res.json() if res.status_code == 200 else []
        except Exception:
            return []

    def set_interface_state(self, interface_id: str, disabled: bool) -> Dict[str, Any]:
        val = "yes" if disabled else "no"
        if self.demo_mode:
            for iface in self.mock_interfaces:
                if iface.get(".id") == interface_id or iface.get("name") == interface_id:
                    iface["disabled"] = "true" if disabled else "false"
                    iface["running"] = "false" if disabled else "true"
                    return {"success": True, "interface": iface}
            return {"success": False, "message": "Interface tidak ditemukan"}
        try:
            res = self.session.patch(
                f"{self.base_url}/interface/{interface_id}",
                json={"disabled": val},
                timeout=self.timeout,
            )
            return {"success": res.status_code in (200, 204), "data": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== IP ADDRESSES ====================

    def get_ip_addresses(self) -> List[Dict[str, Any]]:
        if self.demo_mode:
            return self.mock_ip_addresses
        try:
            res = self.session.get(f"{self.base_url}/ip/address", timeout=self.timeout)
            return res.json() if res.status_code == 200 else []
        except Exception:
            return []

    def add_ip_address(
        self, address: str, interface: str, comment: str = ""
    ) -> Dict[str, Any]:
        payload = {"address": address, "interface": interface}
        if comment:
            payload["comment"] = comment

        if self.demo_mode:
            new_item = {
                ".id": f"*{len(self.mock_ip_addresses) + 1:x}",
                "address": address,
                "interface": interface,
                "network": address.split("/")[0],
                "disabled": "false",
                "comment": comment,
            }
            self.mock_ip_addresses.append(new_item)
            return {"success": True, "item": new_item}

        try:
            # RouterOS v7 mendukung PUT atau POST untuk add
            res = self.session.put(
                f"{self.base_url}/ip/address", json=payload, timeout=self.timeout
            )
            if res.status_code not in (200, 201):
                res = self.session.post(
                    f"{self.base_url}/ip/address", json=payload, timeout=self.timeout
                )
            return {"success": res.status_code in (200, 201, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def delete_ip_address(self, address_id: str) -> Dict[str, Any]:
        if self.demo_mode:
            self.mock_ip_addresses = [
                x for x in self.mock_ip_addresses if x.get(".id") != address_id
            ]
            return {"success": True}
        try:
            res = self.session.delete(
                f"{self.base_url}/ip/address/{address_id}", timeout=self.timeout
            )
            return {"success": res.status_code in (200, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def update_ip_address(
        self, address_id: str, address: str, interface: str, comment: str = ""
    ) -> Dict[str, Any]:
        payload = {"address": address, "interface": interface}
        if comment is not None:
            payload["comment"] = comment

        if self.demo_mode:
            for item in self.mock_ip_addresses:
                if item.get(".id") == address_id:
                    item["address"] = address
                    item["interface"] = interface
                    item["network"] = address.split("/")[0]
                    item["comment"] = comment
                    return {"success": True, "item": item}
            return {"success": False, "error": "IP tidak ditemukan"}

        try:
            res = self.session.patch(
                f"{self.base_url}/ip/address/{address_id}", json=payload, timeout=self.timeout
            )
            return {"success": res.status_code in (200, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== DHCP SERVER & LEASES ====================

    def get_dhcp_servers(self) -> List[Dict[str, Any]]:
        if self.demo_mode:
            return self.mock_dhcp_servers
        try:
            res = self.session.get(f"{self.base_url}/ip/dhcp-server", timeout=self.timeout)
            return res.json() if res.status_code == 200 else []
        except Exception:
            return []

    def get_dhcp_leases(self) -> List[Dict[str, Any]]:
        if self.demo_mode:
            return self.mock_dhcp_leases
        try:
            res = self.session.get(f"{self.base_url}/ip/dhcp-server/lease", timeout=self.timeout)
            return res.json() if res.status_code == 200 else []
        except Exception:
            return []

    def add_static_lease(
        self, address: str, mac_address: str, comment: str = ""
    ) -> Dict[str, Any]:
        payload = {"address": address, "mac-address": mac_address}
        if comment:
            payload["comment"] = comment

        if self.demo_mode:
            new_lease = {
                ".id": f"*{len(self.mock_dhcp_leases) + 1:x}",
                "address": address,
                "mac-address": mac_address,
                "host-name": "Static-Device",
                "status": "bound",
                "dynamic": "false",
                "comment": comment,
            }
            self.mock_dhcp_leases.append(new_lease)
            return {"success": True, "lease": new_lease}

        try:
            res = self.session.put(
                f"{self.base_url}/ip/dhcp-server/lease", json=payload, timeout=self.timeout
            )
            return {"success": res.status_code in (200, 201, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def delete_dhcp_lease(self, lease_id: str) -> Dict[str, Any]:
        if self.demo_mode:
            self.mock_dhcp_leases = [
                x for x in self.mock_dhcp_leases if x.get(".id") != lease_id
            ]
            return {"success": True}
        try:
            res = self.session.delete(
                f"{self.base_url}/ip/dhcp-server/lease/{lease_id}", timeout=self.timeout
            )
            return {"success": res.status_code in (200, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def update_dhcp_lease(
        self, lease_id: str, address: str, mac_address: str, comment: str = ""
    ) -> Dict[str, Any]:
        payload = {"address": address, "mac-address": mac_address}
        if comment is not None:
            payload["comment"] = comment

        if self.demo_mode:
            for item in self.mock_dhcp_leases:
                if item.get(".id") == lease_id:
                    item["address"] = address
                    item["mac-address"] = mac_address
                    item["comment"] = comment
                    return {"success": True, "lease": item}
            return {"success": False, "error": "Lease tidak ditemukan"}

        try:
            res = self.session.patch(
                f"{self.base_url}/ip/dhcp-server/lease/{lease_id}",
                json=payload,
                timeout=self.timeout,
            )
            return {"success": res.status_code in (200, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== IP POOLS ====================

    def get_ip_pools(self) -> List[Dict[str, Any]]:
        if self.demo_mode:
            return self.mock_ip_pools
        try:
            res = self.session.get(f"{self.base_url}/ip/pool", timeout=self.timeout)
            return res.json() if res.status_code == 200 else []
        except Exception:
            return []

    def add_ip_pool(self, name: str, ranges: str) -> Dict[str, Any]:
        payload = {"name": name, "ranges": ranges}
        if self.demo_mode:
            item = {".id": f"*{len(self.mock_ip_pools) + 1:x}", "name": name, "ranges": ranges}
            self.mock_ip_pools.append(item)
            return {"success": True, "pool": item}
        try:
            res = self.session.put(f"{self.base_url}/ip/pool", json=payload, timeout=self.timeout)
            return {"success": res.status_code in (200, 201, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def update_ip_pool(self, pool_id: str, name: str, ranges: str) -> Dict[str, Any]:
        payload = {"name": name, "ranges": ranges}
        if self.demo_mode:
            for item in self.mock_ip_pools:
                if item.get(".id") == pool_id:
                    item["name"] = name
                    item["ranges"] = ranges
                    return {"success": True, "pool": item}
            return {"success": False, "error": "Pool tidak ditemukan"}
        try:
            res = self.session.patch(
                f"{self.base_url}/ip/pool/{pool_id}", json=payload, timeout=self.timeout
            )
            return {"success": res.status_code in (200, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def delete_ip_pool(self, pool_id: str) -> Dict[str, Any]:
        if self.demo_mode:
            self.mock_ip_pools = [p for p in self.mock_ip_pools if p.get(".id") != pool_id]
            return {"success": True}
        try:
            res = self.session.delete(f"{self.base_url}/ip/pool/{pool_id}", timeout=self.timeout)
            return {"success": res.status_code in (200, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== DNS ====================

    def get_dns(self) -> Dict[str, Any]:
        if self.demo_mode:
            return self.mock_dns
        try:
            res = self.session.get(f"{self.base_url}/ip/dns", timeout=self.timeout)
            return res.json() if res.status_code == 200 else {}
        except Exception:
            return {}

    def set_dns(self, servers: str, allow_remote_requests: bool = True) -> Dict[str, Any]:
        payload = {
            "servers": servers,
            "allow-remote-requests": "yes" if allow_remote_requests else "no",
        }
        if self.demo_mode:
            self.mock_dns["servers"] = servers
            self.mock_dns["allow-remote-requests"] = payload["allow-remote-requests"]
            return {"success": True, "dns": self.mock_dns}
        try:
            res = self.session.patch(f"{self.base_url}/ip/dns", json=payload, timeout=self.timeout)
            return {"success": res.status_code in (200, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== FIREWALL FILTER & NAT ====================

    def get_firewall_filters(self) -> List[Dict[str, Any]]:
        if self.demo_mode:
            return self.mock_firewall_filters
        try:
            res = self.session.get(f"{self.base_url}/ip/firewall/filter", timeout=self.timeout)
            return res.json() if res.status_code == 200 else []
        except Exception:
            return []

    def get_firewall_nats(self) -> List[Dict[str, Any]]:
        if self.demo_mode:
            return self.mock_firewall_nats
        try:
            res = self.session.get(f"{self.base_url}/ip/firewall/nat", timeout=self.timeout)
            return res.json() if res.status_code == 200 else []
        except Exception:
            return []

    def add_firewall_filter(
        self, chain: str, action: str, protocol: str = "", port: str = "", comment: str = ""
    ) -> Dict[str, Any]:
        payload = {"chain": chain, "action": action}
        if protocol:
            payload["protocol"] = protocol
        if port:
            payload["dst-port"] = port
        if comment:
            payload["comment"] = comment

        if self.demo_mode:
            item = {
                ".id": f"*{len(self.mock_firewall_filters) + 1:x}",
                "chain": chain,
                "action": action,
                "protocol": protocol,
                "dst-port": port,
                "comment": comment,
                "bytes": "0",
                "packets": "0",
                "disabled": "false",
            }
            self.mock_firewall_filters.append(item)
            return {"success": True, "rule": item}

        try:
            res = self.session.put(
                f"{self.base_url}/ip/firewall/filter", json=payload, timeout=self.timeout
            )
            return {"success": res.status_code in (200, 201, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def add_firewall_nat(
        self,
        chain: str,
        action: str,
        out_interface: str = "",
        to_addresses: str = "",
        comment: str = "",
    ) -> Dict[str, Any]:
        payload = {"chain": chain, "action": action}
        if out_interface:
            payload["out-interface"] = out_interface
        if to_addresses:
            payload["to-addresses"] = to_addresses
        if comment:
            payload["comment"] = comment

        if self.demo_mode:
            item = {
                ".id": f"*{len(self.mock_firewall_nats) + 1:x}",
                "chain": chain,
                "action": action,
                "out-interface": out_interface,
                "to-addresses": to_addresses,
                "comment": comment,
                "bytes": "0",
                "packets": "0",
                "disabled": "false",
            }
            self.mock_firewall_nats.append(item)
            return {"success": True, "rule": item}

        try:
            res = self.session.put(
                f"{self.base_url}/ip/firewall/nat", json=payload, timeout=self.timeout
            )
            return {"success": res.status_code in (200, 201, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def delete_firewall_rule(self, rule_type: str, rule_id: str) -> Dict[str, Any]:
        endpoint = "filter" if rule_type == "filter" else "nat"
        if self.demo_mode:
            if rule_type == "filter":
                self.mock_firewall_filters = [
                    x for x in self.mock_firewall_filters if x.get(".id") != rule_id
                ]
            else:
                self.mock_firewall_nats = [
                    x for x in self.mock_firewall_nats if x.get(".id") != rule_id
                ]
            return {"success": True}
        try:
            res = self.session.delete(
                f"{self.base_url}/ip/firewall/{endpoint}/{rule_id}", timeout=self.timeout
            )
            return {"success": res.status_code in (200, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def update_firewall_filter(
        self, rule_id: str, chain: str, action: str, protocol: str = "", port: str = "", comment: str = ""
    ) -> Dict[str, Any]:
        payload = {"chain": chain, "action": action}
        if protocol is not None: payload["protocol"] = protocol
        if port is not None: payload["dst-port"] = port
        if comment is not None: payload["comment"] = comment

        if self.demo_mode:
            for item in self.mock_firewall_filters:
                if item.get(".id") == rule_id:
                    item["chain"] = chain
                    item["action"] = action
                    item["protocol"] = protocol
                    item["dst-port"] = port
                    item["comment"] = comment
                    return {"success": True, "rule": item}
            return {"success": False, "error": "Filter rule tidak ditemukan"}
        try:
            res = self.session.patch(
                f"{self.base_url}/ip/firewall/filter/{rule_id}", json=payload, timeout=self.timeout
            )
            return {"success": res.status_code in (200, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def update_firewall_nat(
        self, rule_id: str, chain: str, action: str, out_interface: str = "", to_addresses: str = "", comment: str = ""
    ) -> Dict[str, Any]:
        payload = {"chain": chain, "action": action}
        if out_interface is not None: payload["out-interface"] = out_interface
        if to_addresses is not None: payload["to-addresses"] = to_addresses
        if comment is not None: payload["comment"] = comment

        if self.demo_mode:
            for item in self.mock_firewall_nats:
                if item.get(".id") == rule_id:
                    item["chain"] = chain
                    item["action"] = action
                    item["out-interface"] = out_interface
                    item["to-addresses"] = to_addresses
                    item["comment"] = comment
                    return {"success": True, "rule": item}
            return {"success": False, "error": "NAT rule tidak ditemukan"}
        try:
            res = self.session.patch(
                f"{self.base_url}/ip/firewall/nat/{rule_id}", json=payload, timeout=self.timeout
            )
            return {"success": res.status_code in (200, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== CONNECTIONS & LOGS ====================

    def get_connections(self, limit: int = 40) -> List[Dict[str, Any]]:
        if self.demo_mode:
            return self._generate_mock_connections(limit)
        try:
            res = self.session.get(
                f"{self.base_url}/ip/firewall/connection", timeout=self.timeout
            )
            data = res.json() if res.status_code == 200 else []
            return data[:limit] if isinstance(data, list) else []
        except Exception:
            return []

    def get_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        if self.demo_mode:
            return self._get_mock_logs(limit)
        try:
            res = self.session.get(f"{self.base_url}/log", timeout=self.timeout)
            data = res.json() if res.status_code == 200 else []
            if isinstance(data, list):
                # Balik urutan agar log terbaru di atas
                return list(reversed(data[-limit:]))
            return []
        except Exception:
            return []

    # ==================== HOTSPOT ====================

    def get_hotspot_active(self) -> List[Dict[str, Any]]:
        if self.demo_mode:
            return self.mock_hotspot_active
        try:
            res = self.session.get(f"{self.base_url}/ip/hotspot/active", timeout=self.timeout)
            return res.json() if res.status_code == 200 else []
        except Exception:
            return []

    def get_hotspot_users(self) -> List[Dict[str, Any]]:
        if self.demo_mode:
            return self.mock_hotspot_users
        try:
            res = self.session.get(f"{self.base_url}/ip/hotspot/user", timeout=self.timeout)
            return res.json() if res.status_code == 200 else []
        except Exception:
            return []

    def add_hotspot_user(
        self, name: str, password: str, profile: str = "default", comment: str = ""
    ) -> Dict[str, Any]:
        payload = {"name": name, "password": password, "profile": profile}
        if comment:
            payload["comment"] = comment

        if self.demo_mode:
            item = {
                ".id": f"*{len(self.mock_hotspot_users) + 1:x}",
                "name": name,
                "profile": profile,
                "comment": comment,
                "bytes-in": "0",
                "bytes-out": "0",
            }
            self.mock_hotspot_users.append(item)
            return {"success": True, "user": item}

        try:
            res = self.session.put(
                f"{self.base_url}/ip/hotspot/user", json=payload, timeout=self.timeout
            )
            return {"success": res.status_code in (200, 201, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def update_hotspot_user(
        self, user_id: str, name: str, password: str = "", profile: str = "default", comment: str = ""
    ) -> Dict[str, Any]:
        payload = {"name": name, "profile": profile}
        if password:
            payload["password"] = password
        if comment is not None:
            payload["comment"] = comment

        if self.demo_mode:
            for item in self.mock_hotspot_users:
                if item.get(".id") == user_id:
                    item["name"] = name
                    item["profile"] = profile
                    item["comment"] = comment
                    return {"success": True, "user": item}
            return {"success": False, "error": "User tidak ditemukan"}

        try:
            res = self.session.patch(
                f"{self.base_url}/ip/hotspot/user/{user_id}", json=payload, timeout=self.timeout
            )
            return {"success": res.status_code in (200, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def delete_hotspot_user(self, user_id: str) -> Dict[str, Any]:
        if self.demo_mode:
            self.mock_hotspot_users = [
                u for u in self.mock_hotspot_users if u.get(".id") != user_id
            ]
            return {"success": True}
        try:
            res = self.session.delete(
                f"{self.base_url}/ip/hotspot/user/{user_id}", timeout=self.timeout
            )
            return {"success": res.status_code in (200, 204), "response": res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== MOCK DATA INITIALIZATION ====================

    def _init_mock_data(self):
        """Membuat data realistis untuk pengujian simulasi lab"""
        self.mock_identity = {"name": "Lab-MikroTik-RouterOS"}
        self.mock_routerboard = {
            "routerboard": "true",
            "model": "RB4011iGS+5HacQ2HnD-IN",
            "serial-number": "H7E09923LK4",
            "current-firmware": "7.15.2",
            "upgrade-firmware": "7.15.2",
        }
        self.mock_resource = {
            "uptime": "14d 6h 32m 11s",
            "version": "7.15.2 (stable)",
            "build-time": "2024-06-15 11:20:41",
            "free-memory": 894524416,
            "total-memory": 1073741824,
            "cpu": "ARM 4-Core",
            "cpu-count": 4,
            "cpu-frequency": 1400,
            "cpu-load": 12,
            "free-hdd-space": 498565120,
            "total-hdd-space": 536870912,
            "write-sect-since-reboot": 12040,
            "write-sect-total": 984532,
            "architecture-name": "arm",
            "board-name": "RB4011iGS+",
            "platform": "MikroTik",
        }
        self.mock_interfaces = [
            {
                ".id": "*1",
                "name": "ether1-gateway",
                "type": "ether",
                "mtu": "1500",
                "mac-address": "DC:2C:6E:11:A2:01",
                "running": "true",
                "disabled": "false",
                "comment": "Uplink ISP Fiber",
                "rx-byte": 12456789012,
                "tx-byte": 5432198765,
                "rx-packet": 12458920,
                "tx-packet": 8945201,
                "rx-bps": 14500000,
                "tx-bps": 4200000,
            },
            {
                ".id": "*2",
                "name": "ether2-lan",
                "type": "ether",
                "mtu": "1500",
                "mac-address": "DC:2C:6E:11:A2:02",
                "running": "true",
                "disabled": "false",
                "comment": "LAN Internal Office",
                "rx-byte": 4321987654,
                "tx-byte": 11456789012,
                "rx-packet": 8124500,
                "tx-packet": 11894520,
                "rx-bps": 3800000,
                "tx-bps": 12400000,
            },
            {
                ".id": "*3",
                "name": "ether3-hotspot",
                "type": "ether",
                "mtu": "1500",
                "mac-address": "DC:2C:6E:11:A2:03",
                "running": "true",
                "disabled": "false",
                "comment": "Access Point Hotspot",
                "rx-byte": 1821987654,
                "tx-byte": 4145678901,
                "rx-packet": 3124500,
                "tx-packet": 4894520,
                "rx-bps": 1200000,
                "tx-bps": 3600000,
            },
            {
                ".id": "*4",
                "name": "wlan1-guest",
                "type": "wlan",
                "mtu": "1500",
                "mac-address": "DC:2C:6E:11:A2:04",
                "running": "true",
                "disabled": "false",
                "comment": "WiFi Lab 5GHz",
                "rx-byte": 821987654,
                "tx-byte": 1945678901,
                "rx-packet": 1124500,
                "tx-packet": 2194520,
                "rx-bps": 850000,
                "tx-bps": 2100000,
            },
        ]
        self.mock_ip_addresses = [
            {
                ".id": "*1",
                "address": "192.168.1.100/24",
                "network": "192.168.1.0",
                "interface": "ether1-gateway",
                "disabled": "false",
                "comment": "WAN IP Static",
            },
            {
                ".id": "*2",
                "address": "10.10.10.1/24",
                "network": "10.10.10.0",
                "interface": "ether2-lan",
                "disabled": "false",
                "comment": "LAN Gateway",
            },
            {
                ".id": "*3",
                "address": "172.16.0.1/22",
                "network": "172.16.0.0",
                "interface": "ether3-hotspot",
                "disabled": "false",
                "comment": "Hotspot Gateway",
            },
        ]
        self.mock_dhcp_servers = [
            {
                ".id": "*1",
                "name": "dhcp-lan",
                "interface": "ether2-lan",
                "lease-time": "1d",
                "address-pool": "pool-lan",
                "disabled": "false",
            },
            {
                ".id": "*2",
                "name": "dhcp-hotspot",
                "interface": "ether3-hotspot",
                "lease-time": "1h",
                "address-pool": "pool-hotspot",
                "disabled": "false",
            },
        ]
        self.mock_dhcp_leases = [
            {
                ".id": "*1",
                "address": "10.10.10.15",
                "mac-address": "40:8D:5C:33:91:02",
                "host-name": "Laptop-Dosen",
                "server": "dhcp-lan",
                "status": "bound",
                "dynamic": "false",
                "comment": "Ruang Dosen",
            },
            {
                ".id": "*2",
                "address": "10.10.10.24",
                "mac-address": "A4:C3:F0:8A:1E:44",
                "host-name": "PC-Lab-01",
                "server": "dhcp-lan",
                "status": "bound",
                "dynamic": "true",
                "comment": "Client Lab Komputer",
            },
            {
                ".id": "*3",
                "address": "172.16.1.45",
                "mac-address": "BC:D1:1F:55:62:EE",
                "host-name": "iPhone-15-Pro",
                "server": "dhcp-hotspot",
                "status": "bound",
                "dynamic": "true",
                "comment": "User Hotspot",
            },
            {
                ".id": "*4",
                "address": "172.16.1.88",
                "mac-address": "88:28:B3:99:11:AB",
                "host-name": "Samsung-Galaxy-S24",
                "server": "dhcp-hotspot",
                "status": "bound",
                "dynamic": "true",
                "comment": "User Hotspot",
            },
        ]
        self.mock_ip_pools = [
            {".id": "*1", "name": "pool-lan", "ranges": "10.10.10.10-10.10.10.250"},
            {".id": "*2", "name": "pool-hotspot", "ranges": "172.16.1.10-172.16.3.250"},
        ]
        self.mock_dns = {
            "servers": "1.1.1.1,8.8.8.8",
            "dynamic-servers": "192.168.1.1",
            "allow-remote-requests": "yes",
            "cache-size": "2048KiB",
            "cache-used": "428KiB",
        }
        self.mock_firewall_filters = [
            {
                ".id": "*1",
                "chain": "input",
                "action": "accept",
                "protocol": "icmp",
                "comment": "Izinkan ICMP Ping",
                "bytes": "452010",
                "packets": "5420",
                "disabled": "false",
            },
            {
                ".id": "*2",
                "chain": "input",
                "action": "accept",
                "protocol": "tcp",
                "dst-port": "443,80,8291",
                "comment": "Akses Manajemen Web & Winbox",
                "bytes": "8920110",
                "packets": "45900",
                "disabled": "false",
            },
            {
                ".id": "*3",
                "chain": "forward",
                "action": "drop",
                "protocol": "tcp",
                "dst-port": "23,445",
                "comment": "Block Telnet & SMB WAN",
                "bytes": "12904",
                "packets": "184",
                "disabled": "false",
            },
        ]
        self.mock_firewall_nats = [
            {
                ".id": "*1",
                "chain": "srcnat",
                "action": "masquerade",
                "out-interface": "ether1-gateway",
                "comment": "NAT Masquerade Internet WAN",
                "bytes": "16548920100",
                "packets": "19845200",
                "disabled": "false",
            }
        ]
        self.mock_hotspot_active = [
            {
                ".id": "*1",
                "user": "mahasiswa01",
                "address": "172.16.1.45",
                "mac-address": "BC:D1:1F:55:62:EE",
                "uptime": "2h 15m",
                "bytes-in": "125489000",
                "bytes-out": "845201000",
            },
            {
                ".id": "*2",
                "user": "tamu_seminar",
                "address": "172.16.1.88",
                "mac-address": "88:28:B3:99:11:AB",
                "uptime": "48m 10s",
                "bytes-in": "45120000",
                "bytes-out": "154200000",
            },
        ]
        self.mock_hotspot_users = [
            {
                ".id": "*1",
                "name": "mahasiswa01",
                "profile": "paket-2mbps",
                "comment": "Akun TR Mahasiswa",
                "bytes-in": "245000000",
                "bytes-out": "1200000000",
            },
            {
                ".id": "*2",
                "name": "dosen_penguji",
                "profile": "unlimited",
                "comment": "Akses Prioritas",
                "bytes-in": "850000000",
                "bytes-out": "4500000000",
            },
            {
                ".id": "*3",
                "name": "tamu_seminar",
                "profile": "tamu-1hari",
                "comment": "Voucher Hotspot",
                "bytes-in": "45120000",
                "bytes-out": "154200000",
            },
        ]

    def _update_mock_resource(self):
        # Fluktuasi beban CPU realistis 8% - 35%
        self.mock_resource["cpu-load"] = random.randint(8, 38)
        # Fluktuasi memori bebas
        base_mem = 850000000
        self.mock_resource["free-memory"] = base_mem + random.randint(-40000000, 40000000)

    def _update_mock_interface_stats(self):
        for iface in self.mock_interfaces:
            if iface["disabled"] == "false":
                rx_delta = random.randint(400000, 3500000)
                tx_delta = random.randint(300000, 2800000)
                iface["rx-byte"] += rx_delta
                iface["tx-byte"] += tx_delta
                iface["rx-bps"] = rx_delta * 8
                iface["tx-bps"] = tx_delta * 8

    def _generate_mock_connections(self, limit: int) -> List[Dict[str, Any]]:
        protocols = ["tcp", "udp", "icmp"]
        states = ["established", "new", "related"]
        sample_conns = []
        for i in range(min(limit, 25)):
            proto = random.choice(protocols)
            sport = random.randint(30000, 65000)
            dport = random.choice([80, 443, 53, 8080, 22, 8291, 3306])
            sample_conns.append(
                {
                    ".id": f"*{i+1:x}",
                    "protocol": proto,
                    "src-address": f"10.10.10.{random.randint(10, 50)}:{sport}",
                    "dst-address": f"{random.randint(50, 190)}.{random.randint(1, 250)}.{random.randint(1, 250)}.{random.randint(1, 250)}:{dport}",
                    "reply-src-address": f"192.168.1.100:{sport}",
                    "reply-dst-address": f"10.10.10.{random.randint(10, 50)}:{sport}",
                    "tcp-state": random.choice(states) if proto == "tcp" else "",
                    "timeout": f"{random.randint(10, 3600)}s",
                    "orig-bytes": f"{random.randint(1200, 850000)}",
                    "orig-packets": f"{random.randint(10, 1200)}",
                }
            )
        return sample_conns

    def _get_mock_logs(self, limit: int) -> List[Dict[str, Any]]:
        messages = [
            ("system,info", "user admin logged in from 10.10.10.15 via rest"),
            ("dhcp,info", "dhcp-lan assigned 10.10.10.24 to A4:C3:F0:8A:1E:44"),
            ("firewall,info", "forward: in:ether2-lan out:ether1-gateway, proto TCP (SYN), 10.10.10.24:54122->1.1.1.1:443"),
            ("dns,packet", "query: google.com type A from 10.10.10.15"),
            ("interface,info", "ether1-gateway link up (speed 1Gbps, full duplex)"),
            ("system,info", "configuration changed by admin via web-dashboard"),
            ("hotspot,info", "mahasiswa01 (172.16.1.45): logged in"),
            ("system,warning", "high CPU usage detected: 42% on Core 2"),
            ("dhcp,info", "dhcp-hotspot assigned 172.16.1.88 to 88:28:B3:99:11:AB"),
            ("ntp,info", "time synchronized with id.pool.ntp.org"),
        ]
        logs = []
        now = time.strftime("%b/%d/%Y %H:%M:%S")
        for i, (topics, msg) in enumerate(messages[:limit]):
            logs.append(
                {
                    ".id": f"*{i+1:x}",
                    "time": now,
                    "topics": topics,
                    "message": msg,
                }
            )
        return logs
