import requests
import sys

BASE_URL = "http://localhost:8080"

def test_all():
    print("========================================")
    print("STARTING INTERFLU INVENTORY VERIFICATION")
    print("========================================")

    # 1. Login as Osiris (OPERADOR)
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "Osiris", "password": "220704"})
    assert r.status_code == 200, f"Osiris login failed: {r.text}"
    token_osiris = r.json()["token"]
    h_osiris = {"Authorization": f"Bearer {token_osiris}"}

    me_osiris = requests.get(f"{BASE_URL}/api/auth/me", headers=h_osiris).json()
    print("Osiris profile:", me_osiris)
    assert me_osiris.get("role") == "OPERADOR", f"Expected role OPERADOR but got {me_osiris.get('role')}"
    print("[PASS] Osiris has role OPERADOR")

    # Verify Osiris is BLOCKED from /api/admin/users
    r_forbidden = requests.get(f"{BASE_URL}/api/admin/users", headers=h_osiris)
    assert r_forbidden.status_code == 403, f"Expected 403 for operator on /api/admin/users, got {r_forbidden.status_code}"
    print("[PASS] Osiris receives HTTP 403 Forbidden on /api/admin/users")

    # 2. Login as Alexis (OPERADOR)
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "Alexis", "password": "888888"})
    assert r.status_code == 200, f"Alexis login failed: {r.text}"
    token_alexis = r.json()["token"]
    h_alexis = {"Authorization": f"Bearer {token_alexis}"}

    me_alexis = requests.get(f"{BASE_URL}/api/auth/me", headers=h_alexis).json()
    assert me_alexis.get("role") == "OPERADOR"
    r_alexis_forbidden = requests.get(f"{BASE_URL}/api/admin/users", headers=h_alexis)
    assert r_alexis_forbidden.status_code == 403
    print("[PASS] Alexis has role OPERADOR and is blocked with 403")

    # 3. Login as Sistemas (SISTEMAS)
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "sistemas", "password": "admin8888"})
    assert r.status_code == 200, f"Sistemas login failed: {r.text}"
    token_sistemas = r.json()["token"]
    h_sistemas = {"Authorization": f"Bearer {token_sistemas}"}

    me_sistemas = requests.get(f"{BASE_URL}/api/auth/me", headers=h_sistemas).json()
    print("Sistemas profile:", me_sistemas)
    assert me_sistemas.get("role") == "SISTEMAS", f"Expected role SISTEMAS but got {me_sistemas.get('role')}"
    print("[PASS] Sistemas has role SISTEMAS")

    # Verify Sistemas HAS access to /api/admin/users
    r_users = requests.get(f"{BASE_URL}/api/admin/users", headers=h_sistemas)
    assert r_users.status_code == 200, f"Expected 200 for sistemas on /api/admin/users, got {r_users.status_code}"
    users_list = r_users.json()
    print(f"[PASS] Sistemas can access /api/admin/users (found {len(users_list)} users)")

    # 4. Support Tickets Security Test
    # Operator creates a ticket
    r_tck = requests.post(f"{BASE_URL}/api/support/tickets", headers=h_osiris, json={
        "category": "SISTEMA",
        "priority": "ALTA",
        "subject": "Prueba de seguridad y permisos de sistemas",
        "description": "Verificando que los operadores no puedan modificar tickets de sistemas."
    })
    assert r_tck.status_code == 200, f"Create ticket failed: {r_tck.text}"
    tck_data = r_tck.json()
    tck_id = tck_data["id"]
    print(f"[PASS] Osiris created support ticket {tck_data['folio']} (ID: {tck_id})")

    # Operator tries to change status -> must be 403 Forbidden!
    r_update_fail = requests.put(f"{BASE_URL}/api/support/tickets/{tck_id}/status", headers=h_osiris, json={
        "status": "RESUELTO",
        "adminNotes": "Intento de operador no autorizado"
    })
    assert r_update_fail.status_code == 403, f"Expected 403 for operator updating ticket, got {r_update_fail.status_code}"
    print("[PASS] Osiris blocked with HTTP 403 when trying to update support ticket status")

    # Sistemas updates ticket -> must succeed with 200!
    r_update_ok = requests.put(f"{BASE_URL}/api/support/tickets/{tck_id}/status", headers=h_sistemas, json={
        "status": "RESUELTO",
        "adminNotes": "Atendido y validado por Sistemas TI con éxito."
    })
    assert r_update_ok.status_code == 200, f"Expected 200 for sistemas updating ticket, got {r_update_ok.status_code}"
    print("[PASS] Sistemas successfully resolved ticket with notes")

    # 5. Shelves and Croquis Coordinates Verification
    r_sessions = requests.get(f"{BASE_URL}/api/sessions", headers=h_sistemas)
    assert r_sessions.status_code == 200, f"Get sessions failed: {r_sessions.status_code} {r_sessions.text}"
    sessions = r_sessions.json()
    assert len(sessions) > 0, "No inventory sessions found"
    sess_id = sessions[0]["id"]

    r_shelves = requests.get(f"{BASE_URL}/api/sessions/{sess_id}/shelves", headers=h_sistemas)
    assert r_shelves.status_code == 200, f"Get shelves failed: {r_shelves.status_code}"
    shelves = r_shelves.json()
    print(f"Total session shelves loaded: {len(shelves)}")

    # Verify Acero 1..19
    acero_shelves = {s["shelfCode"]: s for s in shelves if s["shelfCode"].startswith("PB-ACE-")}
    print(f"Acero shelves count: {len(acero_shelves)} (expected 19)")
    assert len(acero_shelves) == 19, f"Expected 19 Acero shelves, got {len(acero_shelves)}"

    # Check PB-ACE-01 (Fondo horizontal)
    ace01 = acero_shelves["PB-ACE-01"]
    assert ace01["posX"] == 810.0 and ace01["posY"] == 104.0, f"PB-ACE-01 pos error: {ace01}"
    assert ace01["width"] == 95.4 and ace01["height"] == 34.0, f"PB-ACE-01 size error: {ace01}"
    print(f"[PASS] PB-ACE-01 is horizontal at back of aisle: x={ace01['posX']}, y={ace01['posY']}, w={ace01['width']}, h={ace01['height']}")

    # Check Left column: PB-ACE-02 (top) to PB-ACE-10 (bottom)
    ace02 = acero_shelves["PB-ACE-02"]
    ace10 = acero_shelves["PB-ACE-10"]
    assert ace02["posX"] == 810.0 and ace02["posY"] == 144.0, f"PB-ACE-02 error: {ace02}"
    assert ace10["posX"] == 810.0 and ace10["posY"] == 618.3, f"PB-ACE-10 error: {ace10}"
    print(f"[PASS] Left Acero column spans from PB-ACE-02 (y={ace02['posY']}) to PB-ACE-10 (y={ace10['posY']})")

    # Check Right column: PB-ACE-19 (top) down to PB-ACE-11 (bottom)
    ace19 = acero_shelves["PB-ACE-19"]
    ace11 = acero_shelves["PB-ACE-11"]
    assert ace19["posX"] == 880.4 and ace19["posY"] == 144.0, f"PB-ACE-19 error: {ace19}"
    assert ace11["posX"] == 880.4 and ace11["posY"] == 618.3, f"PB-ACE-11 error: {ace11}"
    print(f"[PASS] Right Acero column spans from PB-ACE-19 (y={ace19['posY']}) to PB-ACE-11 (y={ace11['posY']})")

    # Verify Dixon (Level 1 of vertical column next to Tuberías)
    dix_shelves = {s["shelfCode"]: s for s in shelves if s["shelfCode"].startswith("PB-DIX-")}
    assert "PB-DIX-01" in dix_shelves and "PB-DIX-02" in dix_shelves, f"Missing Dixon shelves: {dix_shelves.keys()}"
    dix1 = dix_shelves["PB-DIX-01"]
    dix2 = dix_shelves["PB-DIX-02"]
    assert dix1["posX"] == 1195.1 and dix1["posY"] == 141.8 and dix1["width"] == 25.0, f"PB-DIX-01 mismatch: {dix1}"
    assert dix2["posX"] == 1222.0 and dix2["posY"] == 141.8 and dix2["width"] == 25.0, f"PB-DIX-02 mismatch: {dix2}"
    print(f"[PASS] PB-DIX-01 & PB-DIX-02 configured at Level 1: posy={dix1['posY']}, w={dix1['width']}, h={dix1['height']}")

    # Verify Conexiones Hidráulicas (Levels 2..6 of vertical column - exactly 10 shelves)
    chid_vert = {s["shelfCode"]: s for s in shelves if s["shelfCode"].startswith("PB-CHID-A") or s["shelfCode"].startswith("PB-CHID-B")}
    print(f"Vertical CHID shelves count: {len(chid_vert)} (expected 10)")
    assert len(chid_vert) == 10, f"Expected exactly 10 vertical CHID shelves, got {len(chid_vert)}"
    assert "PB-CHID-A06" not in chid_vert and "PB-CHID-B06" not in chid_vert, "A06 or B06 should be deleted!"
    assert "PB-CHID-A01" in chid_vert and "PB-CHID-B01" in chid_vert
    assert chid_vert["PB-CHID-A01"]["posY"] == 201.4 and chid_vert["PB-CHID-B01"]["posY"] == 201.4
    assert chid_vert["PB-CHID-A05"]["posY"] == 440.1 and chid_vert["PB-CHID-B05"]["posY"] == 440.1
    print("[PASS] Vertical CHID shelves span cleanly below Dixon from Level 2 (y=201.4) to Level 6 (y=440.1)")

    # Verify Parker Inox (PB-INOX-01 ONLY - horizontal at North Wall)
    inox_shelves = {s["shelfCode"]: s for s in shelves if s["shelfCode"].startswith("PB-INOX-")}
    print(f"PB-INOX shelves count: {len(inox_shelves)} (expected exactly 1)")
    assert len(inox_shelves) == 1, f"Expected ONLY 1 PB-INOX (PB-INOX-01), but found: {list(inox_shelves.keys())}"
    assert "PB-INOX-01" in inox_shelves, f"Missing PB-INOX-01: {inox_shelves.keys()}"
    for bad_code in ["PB-INOX-02", "PB-INOX-03", "PB-INOX-04", "PB-INOX-05", "PB-INOX-06"]:
        assert bad_code not in inox_shelves, f"Shelf {bad_code} should be deleted!"
    inox1 = inox_shelves["PB-INOX-01"]
    assert inox1["posX"] == 1258.0 and inox1["posY"] == 96.0 and inox1["width"] == 68.0 and inox1["height"] == 42.0, f"PB-INOX-01 mismatch: {inox1}"
    print(f"[PASS] Only 1 Parker Inox shelf (PB-INOX-01) exists, located at north wall: x={inox1['posX']}, y={inox1['posY']}")

    # Verify Slanted East Wall PB (PB-CHID-W01..W05 - EXACTLY 5 Conexiones Hidráulicas, NOT Inox!)
    chid_w = [s for s in shelves if s["shelfCode"].startswith("PB-CHID-W")]
    chid_w.sort(key=lambda s: s["shelfCode"])
    chid_w_codes = [s["shelfCode"] for s in chid_w]
    chid_w_x = [s["posX"] for s in chid_w]
    print(f"PB-CHID-W count: {len(chid_w)} (expected exactly 5)")
    print(f"PB-CHID-W codes: {chid_w_codes}")
    print(f"PB-CHID-W posX values: {chid_w_x}")
    assert len(chid_w) == 5, f"Expected exactly 5 Conexiones Hidráulicas on slanted east wall, got {len(chid_w)}"
    assert chid_w_codes == ["PB-CHID-W01", "PB-CHID-W02", "PB-CHID-W03", "PB-CHID-W04", "PB-CHID-W05"], f"Mismatch PB-CHID-W: {chid_w_codes}"
    assert chid_w_x == [1308.0, 1299.0, 1290.0, 1281.0, 1272.0], f"PB-CHID-W posX mismatch: {chid_w_x}"
    print("[PASS] EXACTLY 5 PB-CHID-W01..W05 correctly positioned on slanted east wall for Conexiones Hidráulicas")

    # Verify Slanted East Wall PA: PA-SEL-W-01..06
    sel_w = [s for s in shelves if s["shelfCode"].startswith("PA-SEL-W-")]
    sel_w.sort(key=lambda s: s["shelfCode"])
    sel_w_x = [s["posX"] for s in sel_w]
    print(f"PA-SEL-W posX values: {sel_w_x}")
    assert sel_w_x == [1317.0, 1309.0, 1301.0, 1292.0, 1284.0, 1276.0], f"PA-SEL-W posX mismatch: {sel_w_x}"
    print("[PASS] PA-SEL-W shelves follow slanted east wall coordinates correctly")

    print("========================================")
    print("ALL VERIFICATIONS COMPLETED SUCCESSFULLY!")
    print("========================================")

if __name__ == "__main__":
    test_all()
