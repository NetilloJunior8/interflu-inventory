import urllib.request
import json
import sys

BASE_URL = "http://localhost:8080/api"

def get_auth_token():
    login_data = json.dumps({"username": "sistemas", "password": "admin8888"}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/auth/login", data=login_data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        return data.get('token')

def verify_system():
    print("=== 1. Authentication Check ===")
    token = get_auth_token()
    assert token, "JWT token acquisition failed"
    print("PASS: Logged in successfully with 'sistemas'!")

    headers = {
        'Authorization': f"Bearer {token}",
        'Content-Type': 'application/json'
    }

    print("\n=== 2. Shelves Count Verification ===")
    req = urllib.request.Request(f"{BASE_URL}/shelves", headers=headers)
    with urllib.request.urlopen(req) as resp:
        shelves = json.loads(resp.read().decode('utf-8'))
    
    assert len(shelves) == 171, f"Expected 171 shelves, found {len(shelves)}"
    pb = [s for s in shelves if s.get('plant') == 'Planta Baja']
    pa = [s for s in shelves if s.get('plant') == 'Planta Alta']
    assert len(pb) == 87, f"Expected 87 PB shelves, found {len(pb)}"
    assert len(pa) == 84, f"Expected 84 PA shelves, found {len(pa)}"
    print(f"PASS: 171 Physical Shelves Verified (PB: {len(pb)}, PA: {len(pa)})")

    print("\n=== 3. Clean Sessions & Zero Test Data Verification ===")
    req_sess = urllib.request.Request(f"{BASE_URL}/sessions", headers=headers)
    with urllib.request.urlopen(req_sess) as resp:
        sessions = json.loads(resp.read().decode('utf-8'))
    
    print(f"Total sessions: {len(sessions)}")
    assert len(sessions) == 1, f"Expected exactly 1 clean session, found {len(sessions)}"
    clean_session = sessions[0]
    print(f"Clean session Folio: {clean_session.get('folio')} | Status: {clean_session.get('status')}")
    assert clean_session.get('folio') == 'INV-2026-001'
    assert clean_session.get('status') == 'EN_CONTEO'

    sess_id = clean_session.get('id')
    req_asg = urllib.request.Request(f"{BASE_URL}/sessions/{sess_id}/shelves", headers=headers)
    with urllib.request.urlopen(req_asg) as resp:
        assignments = json.loads(resp.read().decode('utf-8'))
    
    assert len(assignments) == 171, f"Expected 171 assignments, found {len(assignments)}"
    completed = [a for a in assignments if a.get('status') == 'COMPLETADO']
    pending = [a for a in assignments if a.get('status') == 'PENDIENTE']
    print(f"Completed shelves in session 1: {len(completed)} (Expected: 0)")
    print(f"Pending shelves in session 1: {len(pending)} (Expected: 171)")
    assert len(completed) == 0, f"Expected 0 completed, found {len(completed)}"
    assert len(pending) == 171, f"Expected 171 pending, found {len(pending)}"
    print("PASS: Session 1 is 100% clean and ready for counting (0 / 87 PB, 0 / 84 PA)!")

    print("\n=== 4. Zero Count Records Verification ===")
    req_counts = urllib.request.Request(f"{BASE_URL}/counts?sessionId={sess_id}", headers=headers)
    with urllib.request.urlopen(req_counts) as resp:
        counts = json.loads(resp.read().decode('utf-8'))
    assert len(counts) == 0, f"Expected 0 count records, found {len(counts)}"
    print("PASS: 0 count records present (clean slate for user tests)!")

    print("\n=== 5. Support Tickets Clean State ===")
    req_tickets = urllib.request.Request(f"{BASE_URL}/support/tickets", headers=headers)
    with urllib.request.urlopen(req_tickets) as resp:
        tickets = json.loads(resp.read().decode('utf-8'))
    assert len(tickets) == 0, f"Expected 0 support tickets, found {len(tickets)}"
    print("PASS: Support tickets queue is clean (0 tickets)!")

    print("\n=== 6. Users Clean State ===")
    req_users = urllib.request.Request(f"{BASE_URL}/admin/users", headers=headers)
    with urllib.request.urlopen(req_users) as resp:
        users = json.loads(resp.read().decode('utf-8'))
    usernames = [u.get('username') for u in users]
    print(f"Active users: {usernames}")
    assert 'operador_prueba' not in usernames, "Test user 'operador_prueba' should not exist"
    assert any(u.lower() == 'osiris' for u in usernames)
    assert any(u.lower() == 'alexis' for u in usernames)
    assert any(u.lower() == 'sistemas' for u in usernames)
    print("PASS: Only real operational users are configured!")

    print("\n=== 7. Frontend Serving Verification ===")
    req_fe = urllib.request.Request("http://localhost:8080/")
    with urllib.request.urlopen(req_fe) as resp:
        assert resp.status == 200
        html = resp.read().decode('utf-8')
        assert '<app-root>' in html or 'main-' in html
    print("PASS: Frontend bundle serving at http://localhost:8080/!")

    print("\n=======================================================")
    print("ALL VERIFICATIONS COMPLETED WITH 100% SUCCESS!")
    print("SYSTEM IS FULLY PURGED, CLEAN, AND READY FOR REAL TESTS & GITHUB!")
    print("=======================================================")

if __name__ == '__main__':
    verify_system()
