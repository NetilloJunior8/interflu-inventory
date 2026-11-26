import requests

BASE_URL = "http://localhost:8080"

# 1. Login
login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "sistemas", "password": "admin8888"})
assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
token = login_resp.json().get("token")
headers = {"Authorization": f"Bearer {token}"}
print("1. Authenticated as sistemas: OK")

# 2. Reset shelf 16 (PB-ACE-01) with clearRecords=True
reset_resp = requests.post(f"{BASE_URL}/api/sessions/1/shelves/16/reset", headers=headers, json={"clearRecords": True})
assert reset_resp.status_code == 200, f"Reset shelf 16 failed: {reset_resp.text}"
print("2. Reset shelf 16 response:", reset_resp.status_code, reset_resp.json())

shelves = requests.get(f"{BASE_URL}/api/sessions/1/shelves", headers=headers).json()
s16 = next(s for s in shelves if s["shelfId"] == 16)
print(f"   Shelf 16 (PB-ACE-01): status={s16['status']}, pieces={s16.get('totalPieces')}, records={s16.get('recordCount')}")
assert s16.get('totalPieces') == 0.0 or s16.get('totalPieces') is None, "Expected 0 pieces after reset"

# 3. Clear entire session counts
clear_resp = requests.delete(f"{BASE_URL}/api/counts/session/1", headers=headers)
assert clear_resp.status_code == 200, f"Clear session failed: {clear_resp.text}"
print("3. Clear entire session counts:", clear_resp.status_code, clear_resp.json())

# Verify all shelves empty
shelves = requests.get(f"{BASE_URL}/api/sessions/1/shelves", headers=headers).json()
acero_shelves = [s for s in shelves if "ACE" in s["shelfCode"]]
non_empty = [s for s in acero_shelves if (s.get("totalPieces") or 0) > 0]
print(f"   Non-empty Acero shelves after session clear: {len(non_empty)}")
assert len(non_empty) == 0, "Expected all shelves empty"

# 4. Import the multi-sheet Excel file (aceros-re conteo.xlsx)
excel_path = r"C:\Users\ernes\.gemini\antigravity\brain\414f7d82-ca1a-40ce-87e7-48761bb7115d\.user_uploaded\media_1795589154481_4e79d3d5.xlsx"
with open(excel_path, "rb") as f:
    files = {"file": ("aceros-re conteo.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    data = {"sessionId": 1, "shelfId": 16, "mode": "SMART_MERGE", "filterObsolete": "true"}
    import_resp = requests.post(f"{BASE_URL}/api/counts/import-excel", headers=headers, files=files, data=data)

assert import_resp.status_code == 200, f"Import failed: {import_resp.text}"
res = import_resp.json()
print("4. Import Excel status: 200 OK")
print(f"   Imported records: {res['importedRecords']}, Total pieces: {res['totalPieces']}, Shelves updated: {res['shelvesUpdated']}")
assert res["totalPieces"] == 18015.0, f"Expected 18015.0 pieces, got {res['totalPieces']}"
assert res["importedRecords"] == 697, f"Expected 697 records, got {res['importedRecords']}"
assert res["shelvesUpdated"] == 16, f"Expected 16 shelves, got {res['shelvesUpdated']}"

# 5. Verify total pieces across all shelves
shelves_after = requests.get(f"{BASE_URL}/api/sessions/1/shelves", headers=headers).json()
acero_after = [s for s in shelves_after if "ACE" in s["shelfCode"]]
total_pieces_shelves = sum((s.get("totalPieces") or 0) for s in acero_after)
print(f"5. Total pieces across all Acero shelves: {total_pieces_shelves}")
assert total_pieces_shelves == 18015.0, f"Expected 18015.0 in shelves, got {total_pieces_shelves}"

# 6. Test shelf creation and deletion
create_resp = requests.post(f"{BASE_URL}/api/shelves", headers=headers, json={
    "code": "PB-TEST-99",
    "zone": "General",
    "description": "Anaquel temporal de prueba",
    "plant": "Planta Baja"
})
assert create_resp.status_code == 200, f"Create shelf failed: {create_resp.text}"
test_shelf_id = create_resp.json().get("id")
print(f"6. Created test shelf PB-TEST-99 with ID {test_shelf_id}: OK")

del_resp = requests.delete(f"{BASE_URL}/api/shelves/{test_shelf_id}", headers=headers)
assert del_resp.status_code == 200, f"Delete shelf failed: {del_resp.text}"
print(f"7. Deleted test shelf PB-TEST-99: {del_resp.json().get('message')}")

print("\n=======================================================")
print(">>> ALL TESTS AND VERIFICATIONS PASSED WITH 100% SUCCESS! <<<")
print("=======================================================")
