import requests

BASE_URL = "http://localhost:8080"

# 1. Login
login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "sistemas", "password": "admin8888"})
token = login_resp.json().get("token")
headers = {"Authorization": f"Bearer {token}"}
print("1. Authenticated as sistemas: OK")

# 2. Reset a single shelf (e.g. PB-ACE-01 with shelfId=16) with clearRecords=True
reset_resp = requests.post(f"{BASE_URL}/api/sessions/1/shelves/16/reset", headers=headers, json={"clearRecords": True})
print("2. Reset shelf 16 response:", reset_resp.status_code, reset_resp.json())

# Check shelf 16 status
shelves = requests.get(f"{BASE_URL}/api/sessions/1/shelves", headers=headers).json()
s16 = next(s for s in shelves if s["shelfId"] == 16)
print(f"   Shelf 16 (PB-ACE-01): status={s16['status']}, pieces={s16.get('totalPieces')}, records={s16.get('recordCount')}")
assert s16.get('totalPieces') == 0.0 or s16.get('totalPieces') is None, "Expected 0 pieces after reset"

# 3. Now clear entire session
clear_resp = requests.delete(f"{BASE_URL}/api/counts/session/1", headers=headers)
print("3. Clear entire session counts:", clear_resp.status_code, clear_resp.json())

# Check all shelves are empty
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

print("4. Import Excel status:", import_resp.status_code)
res = import_resp.json()
print("   Import result:", res)

assert res["totalPieces"] == 18015.0, f"Expected 18015.0 pieces, got {res['totalPieces']}"
assert res["importedRecords"] == 697, f"Expected 697 records, got {res['importedRecords']}"
assert res["shelvesUpdated"] == 16, f"Expected 16 shelves, got {res['shelvesUpdated']}"

# 5. Verify all shelves in session
shelves_after = requests.get(f"{BASE_URL}/api/sessions/1/shelves", headers=headers).json()
acero_after = [s for s in shelves_after if "ACE" in s["shelfCode"]]
total_pieces_shelves = sum((s.get("totalPieces") or 0) for s in acero_after)
print(f"5. Total pieces across all Acero shelves: {total_pieces_shelves}")
assert total_pieces_shelves == 18015.0, f"Expected 18015.0 in shelves, got {total_pieces_shelves}"

print("ALL VERIFICATIONS PASSED SUCCESSFULLY!")
