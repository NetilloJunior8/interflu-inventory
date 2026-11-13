import urllib.request
import json
import sys

BASE_URL = "http://localhost:8080/api"

def get_auth_token():
    login_data = json.dumps({"username": "sistemas", "password": "admin8888"}).encode('utf-8')
    req = urllib.request.Request(f"{BASE_URL}/auth/login", data=login_data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get('token')
    except Exception as e:
        # Fallback to Osiris
        login_data = json.dumps({"username": "Osiris", "password": "220704"}).encode('utf-8')
        req = urllib.request.Request(f"{BASE_URL}/auth/login", data=login_data, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data.get('token')

def test_api():
    token = get_auth_token()
    assert token, "Could not acquire JWT token"
    print("Acquired JWT token successfully!")
    
    headers = {
        'Authorization': f"Bearer {token}",
        'Content-Type': 'application/json'
    }

    print("\n=== Testing /api/shelves ===")
    req = urllib.request.Request(f"{BASE_URL}/shelves", headers=headers)
    with urllib.request.urlopen(req) as resp:
        assert resp.status == 200, f"Status code {resp.status}"
        shelves = json.loads(resp.read().decode('utf-8'))
    
    total = len(shelves)
    print(f"Total shelves: {total}")
    assert total == 171, f"Expected 171 shelves, got {total}"
    
    pb = [s for s in shelves if s.get('plant') == 'Planta Baja']
    pa = [s for s in shelves if s.get('plant') == 'Planta Alta']
    other = [s for s in shelves if s.get('plant') not in ('Planta Baja', 'Planta Alta')]
    
    print(f"Planta Baja count: {len(pb)} (Expected: 87)")
    print(f"Planta Alta count: {len(pa)} (Expected: 84)")
    print(f"Other plant count: {len(other)} (Expected: 0)")
    
    assert len(pb) == 87, f"Expected 87 PB shelves, got {len(pb)}"
    assert len(pa) == 84, f"Expected 84 PA shelves, got {len(pa)}"
    assert len(other) == 0, f"Expected 0 other shelves, got {len(other)}"
    
    # Check forbidden codes
    pb_codes = {s.get('code') for s in pb}
    assert 'PB-TUB-01' not in pb_codes, "PB-TUB-01 must not be a shelf"
    assert 'PB-MAN-01' not in pb_codes, "PB-MAN-01 must not be a shelf"
    for i in range(2, 7):
        assert f"PB-INOX-0{i}" not in pb_codes, f"PB-INOX-0{i} must not exist"
    for i in range(1, 6):
        assert f"PB-CHID-W0{i}" in pb_codes, f"PB-CHID-W0{i} missing"
    assert "PB-INOX-01" in pb_codes, "PB-INOX-01 missing"
    
    print("PASS: Shelves count and codes verification passed successfully!")
    
    print("\n=== Testing /api/sessions & Assignments ===")
    req_sess = urllib.request.Request(f"{BASE_URL}/sessions", headers=headers)
    with urllib.request.urlopen(req_sess) as resp:
        assert resp.status == 200
        sessions = json.loads(resp.read().decode('utf-8'))
    
    print(f"Total sessions: {len(sessions)}")
    active_sess = next((s for s in sessions if s.get('status') == 'ACTIVO'), sessions[0])
    sess_id = active_sess.get('id')
    print(f"Active session ID: {sess_id} ({active_sess.get('name')})")
    
    req_asg = urllib.request.Request(f"{BASE_URL}/sessions/{sess_id}/shelves", headers=headers)
    with urllib.request.urlopen(req_asg) as resp:
        assert resp.status == 200
        assignments = json.loads(resp.read().decode('utf-8'))
    
    print(f"Total assignments in session {sess_id}: {len(assignments)}")
    
    pb_assignments = [a for a in assignments if a.get('plant') == 'Planta Baja']
    pa_assignments = [a for a in assignments if a.get('plant') == 'Planta Alta']
    
    pb_completed = [a for a in pb_assignments if a.get('status') == 'COMPLETADO']
    pa_completed = [a for a in pa_assignments if a.get('status') == 'COMPLETADO']
    
    pb_comp_codes = [a.get('shelfCode') for a in pb_completed]
    pa_comp_codes = [a.get('shelfCode') for a in pa_completed]
    
    print(f"PB Total Assignments: {len(pb_assignments)} (Expected: 87)")
    print(f"PA Total Assignments: {len(pa_assignments)} (Expected: 84)")
    print(f"PB Completed count: {len(pb_completed)} -> {pb_comp_codes}")
    print(f"PA Completed count: {len(pa_completed)} -> {pa_comp_codes}")
    
    assert len(pb_assignments) == 87, f"Expected 87 PB assignments, got {len(pb_assignments)}"
    assert len(pa_assignments) == 84, f"Expected 84 PA assignments, got {len(pa_assignments)}"
    assert len(pb_completed) == 2, f"Expected exactly 2 completed PB shelves, got {len(pb_completed)}: {pb_comp_codes}"
    assert 'PB-INOX-01' in pb_comp_codes and 'PB-YPC-01' in pb_comp_codes
    
    print("PASS: Session assignments and completed counts match perfectly! (2 / 87 in PB)")

    print("\n=== Testing Frontend Static Serving ===")
    req_fe = urllib.request.Request("http://localhost:8080/")
    with urllib.request.urlopen(req_fe) as resp:
        assert resp.status == 200
        html = resp.read().decode('utf-8')
        assert '<app-root>' in html or 'main-' in html
    print("PASS: Frontend served successfully via Spring Boot Tomcat!")
    print("\nALL SYSTEM VERIFICATIONS PASSED 100%!")

if __name__ == '__main__':
    test_api()
