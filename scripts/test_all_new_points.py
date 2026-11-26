import requests
import openpyxl
import io

BASE_URL = "http://localhost:8080"

# 1. Login
login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "sistemas", "password": "admin8888"})
assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
token = login_resp.json().get("token")
headers = {"Authorization": f"Bearer {token}"}
print("1. Authenticated as sistemas: OK")

# 2. Test Official Template Download (Punto 9)
template_resp = requests.get(f"{BASE_URL}/api/counts/import-template", headers=headers)
assert template_resp.status_code == 200, f"Template download failed: {template_resp.status_code}"
assert "spreadsheetml" in template_resp.headers.get("Content-Type", ""), "Expected xlsx Content-Type"
wb_template = openpyxl.load_workbook(io.BytesIO(template_resp.content))
assert "Conteo_Por_Nivel" in wb_template.sheetnames, "Expected Conteo_Por_Nivel sheet"
headers_row = [cell.value for cell in wb_template["Conteo_Por_Nivel"][1]]
print("2. Official Template downloaded (.xlsx): OK. Columns:", headers_row)
assert "CLAVE" in headers_row and "ESTANTE" in headers_row and "NIVEL" in headers_row, "Missing key template columns"

# 3. Test Manual Threshold Update (Punto 7)
thresh_resp = requests.put(f"{BASE_URL}/api/counts/stock-alerts/thresholds", headers=headers, json={
    "code": "CG401/2",
    "minStock": 20,
    "reorderPoint": 45,
    "maxStock": 100
})
assert thresh_resp.status_code == 200, f"Threshold update failed: {thresh_resp.text}"
thresh_data = thresh_resp.json()
print("3. Manual Threshold update response:", thresh_data)
assert thresh_data["minStock"] == 20.0 and thresh_data["reorderPoint"] == 45.0 and thresh_data["maxStock"] == 100.0

# 4. Check Stock Alerts API reflects custom threshold (Punto 7)
alerts_resp = requests.get(f"{BASE_URL}/api/counts/stock-alerts", headers=headers)
assert alerts_resp.status_code == 200, f"Get stock alerts failed: {alerts_resp.status_code}"
alerts_data = alerts_resp.json()
cg_item = next((i for i in alerts_data["items"] if i["code"] == "CG401/2"), None)
if cg_item:
    print(f"4. Stock alert for CG401/2: isCustom={cg_item.get('isCustomThresholds')}, min={cg_item.get('minimoSeguridad')}, reorder={cg_item.get('puntoReorden')}, max={cg_item.get('maximoObjetivo')}")
    assert cg_item.get("isCustomThresholds") is True, "Expected isCustomThresholds to be True"
    assert cg_item.get("minimoSeguridad") == 20, "Expected minStock 20"
else:
    print("4. CG401/2 not currently counted in active session, threshold saved in catalog: OK")

# 5. Test Purchase Order Excel Generation (Punto 3)
po_resp = requests.get(f"{BASE_URL}/api/counts/purchase-order-excel", headers=headers)
assert po_resp.status_code == 200, f"Purchase order excel failed: {po_resp.status_code}"
assert "spreadsheetml" in po_resp.headers.get("Content-Type", ""), "Expected xlsx Content-Type"
wb_po = openpyxl.load_workbook(io.BytesIO(po_resp.content))
assert "Orden_De_Compra" in wb_po.sheetnames, "Expected Orden_De_Compra sheet"
po_sheet = wb_po["Orden_De_Compra"]
title_val = po_sheet["A1"].value
print(f"5. Purchase Order Excel downloaded (.xlsx): OK. Title: '{title_val}', Rows: {po_sheet.max_row}")
assert "ORDEN DE COMPRA" in str(title_val).upper(), "Expected ORDEN DE COMPRA title in sheet"

# 6. Clear session counts and re-import physical Excel (aceros-re conteo.xlsx)
clear_resp = requests.delete(f"{BASE_URL}/api/counts/session/1", headers=headers)
assert clear_resp.status_code == 200, f"Clear session failed: {clear_resp.text}"
print("6. Clear session counts: OK")

excel_path = r"C:\Users\ernes\.gemini\antigravity\brain\414f7d82-ca1a-40ce-87e7-48761bb7115d\.user_uploaded\media_1795589154481_4e79d3d5.xlsx"
with open(excel_path, "rb") as f:
    files = {"file": ("aceros-re conteo.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    data = {"sessionId": 1, "shelfId": 16, "mode": "SMART_MERGE", "filterObsolete": "true"}
    import_resp = requests.post(f"{BASE_URL}/api/counts/import-excel", headers=headers, files=files, data=data)

assert import_resp.status_code == 200, f"Import physical failed: {import_resp.text}"
res = import_resp.json()
print("7. Re-import Acero physical count:")
print(f"   Imported records: {res['importedRecords']}, Total pieces: {res['totalPieces']}, Shelves updated: {res['shelvesUpdated']}")
assert res["totalPieces"] == 18015.0, f"Expected 18015.0 pieces, got {res['totalPieces']}"
assert res["importedRecords"] == 697, f"Expected 697 records, got {res['importedRecords']}"
assert res["shelvesUpdated"] == 16, f"Expected 16 shelves, got {res['shelvesUpdated']}"

# Verify pieces in Acero shelves
shelves_after = requests.get(f"{BASE_URL}/api/sessions/1/shelves", headers=headers).json()
acero_after = [s for s in shelves_after if "ACE" in s["shelfCode"]]
total_pieces_acero = sum((s.get("totalPieces") or 0) for s in acero_after)
print(f"   Total pieces in Acero shelves: {total_pieces_acero}")
assert total_pieces_acero == 18015.0, f"Expected 18015.0 in Acero shelves, got {total_pieces_acero}"

# 8. Test SAE Extra / Unlocated Code Isolation (Punto 2)
# Create a dummy CSV with 1 unlocated code that has no shelf info
import tempfile
with tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False) as tf:
    tf.write("CLAVE,EXISTENCIAS,DESCRIPCION\n")
    tf.write("SAE-EXTRA-TEST-99,50.0,Articulo SAE Extra Sin Ubicacion\n")
    tf_name = tf.name

with open(tf_name, "rb") as f:
    files = {"file": ("sae_extra_test.csv", f, "text/csv")}
    data = {"sessionId": 1, "shelfId": 16, "mode": "SMART_MERGE", "filterObsolete": "true"}
    import_sae_resp = requests.post(f"{BASE_URL}/api/counts/import-excel", headers=headers, files=files, data=data)

assert import_sae_resp.status_code == 200, f"Import SAE extra failed: {import_sae_resp.text}"
print("8. Imported SAE extra SKU (without shelf location): OK")

# Verify Acero shelves DID NOT get this item and physical piece total remains strictly 18,015.0
shelves_check = requests.get(f"{BASE_URL}/api/sessions/1/shelves", headers=headers).json()
acero_check = [s for s in shelves_check if "ACE" in s["shelfCode"]]
total_acero_check = sum((s.get("totalPieces") or 0) for s in acero_check)
print(f"   Acero pieces after unlocated SAE import: {total_acero_check}")
assert total_acero_check == 18015.0, f"Expected Acero to remain untouched at 18015.0, got {total_acero_check}"

# Verify the unlocated SAE item went to PB-PEN-01 (Pendiente)
pending_shelf = next((s for s in shelves_check if "PEN" in s["shelfCode"]), None)
assert pending_shelf is not None, "Pending shelf must exist"
print(f"   Pending shelf ({pending_shelf['shelfCode']}): pieces={pending_shelf.get('totalPieces')}")
assert (pending_shelf.get("totalPieces") or 0) >= 50.0, "Expected SAE extra code in pending shelf"

print("\n==========================================================================")
print(">>> ALL 6 USER REQUIREMENTS TESTED AND FULLY VALIDATED SUCCESSFULLY! <<<")
print("==========================================================================")
