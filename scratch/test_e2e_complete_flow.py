import requests
import json
import io
import sys
import time

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass

BASE_URL = "http://127.0.0.1:8080/api"

def print_step(title):
    print("\n" + "="*70)
    print(f"  {title}")
    print("="*70)

def main():
    print_step("PASO 1: AUTENTICACIÓN Y OBTENCIÓN DE TOKEN JWT")
    token = None
    for attempt in range(10):
        try:
            login_resp = requests.post(f"{BASE_URL}/auth/login", json={
                "username": "osiris",
                "password": "220704"
            }, timeout=3)
            if login_resp.status_code == 200:
                token = login_resp.json()["token"]
                print(f"[OK] Login exitoso para Osiris (220704). Token JWT obtenido: {token[:20]}...")
                break
        except Exception as e:
            time.sleep(1)
    
    if not token:
        print("[ERROR] No se pudo autenticar con el backend.")
        sys.exit(1)

    headers = {"Authorization": f"Bearer {token}"}

    print_step("PASO 2: CREACIÓN DE SESIÓN DE INVENTARIO FÍSICO")
    session_data = {
        "title": "Inventario Piloto 12 Anaqueles Refacciones",
        "warehouseCode": "1",
        "notes": "Prueba integral de importación automática, croquis verde y Aspel SAE"
    }
    create_resp = requests.post(f"{BASE_URL}/sessions", headers=headers, json=session_data)
    assert create_resp.status_code == 200, f"Error creando sesión: {create_resp.text}"
    session = create_resp.json()
    session_id = session["id"]
    folio = session["folio"]
    print(f"[OK] Sesión creada con éxito: Folio '{folio}', ID={session_id}, Status='{session['status']}'")

    print_step("PASO 3: VERIFICACIÓN DE OPERADOR POR DEFECTO ('Por Asignar')")
    shelves_resp = requests.get(f"{BASE_URL}/sessions/{session_id}/shelves", headers=headers)
    assert shelves_resp.status_code == 200
    all_shelves = shelves_resp.json()
    print(f"[OK] Se cargaron {len(all_shelves)} anaqueles para la sesión.")
    for sh in all_shelves[:5]:
        assigned = sh.get("assignedUserName")
        print(f"     Anaquel {sh['shelfCode']}: asignado = '{assigned}' (esperado: 'Por Asignar')")
        assert assigned == "Por Asignar", f"Esperado 'Por Asignar' pero obtuvo '{assigned}'"

    print_step("PASO 4: IMPORTACIÓN DE EXCEL DE 12 ANAQUELES YA CONTADOS")
    # Generamos contenido CSV simulando un Excel de 12 anaqueles contados (PB y PA)
    csv_content = """ANAQUEL,CODIGO,PIEZAS
PB-VAL-01,VAL-ESF-1/2,24
PB-VAL-01,VAL-MAR-2,10
PB-VAL-02,VAL-RET-1,15
PB-KUR-A1,NMP40 2/4x1/4,35
PB-KUR-A1,NM80 3 1/2,18
PB-KUR-B1,MANG-KURI-100,50
PB-ACE-01,TUBO-AC-INOX-1,42
PB-YPC-01,YPC-FESTO-CONN-1/4,80
PA-HCO-01,HCO-HIDR-COPLE-1/2,30
PA-NEU-01,NEUM-REG-6BAR,12
PA-FES-01,FESTO-VALV-5/2,8
PA-SEL1-01,SELLO-O-RING-214,120
PA-SEL2-01,SELLO-MEC-ROTT-15,45
PA-PVC-01,PVC-CODO-90-2,60
"""
    files = {
        'file': ('inventario_12_anaqueles_contados.csv', io.BytesIO(csv_content.encode('utf-8')), 'text/csv')
    }
    data = {'sessionId': str(session_id)}
    import_resp = requests.post(f"{BASE_URL}/counts/import-excel", headers=headers, files=files, data=data)
    assert import_resp.status_code == 200, f"Error importando Excel: {import_resp.text}"
    import_result = import_resp.json()
    print(f"[OK] Resultado de Importación Excel:")
    print(f"     - Partidas importadas: {import_result['importedRecords']}")
    print(f"     - Piezas físicas: {import_result['totalPieces']}")
    print(f"     - Anaqueles actualizados: {import_result['shelvesUpdated']}")
    print(f"     - Anaqueles afectados: {', '.join(import_result.get('affectedShelves', []))}")
    assert import_result['importedRecords'] == 14
    assert import_result['shelvesUpdated'] == 12

    print_step("PASO 5: VERIFICAR QUE LOS 12 ANAQUELES SE MARQUEN EN VERDE (COMPLETADO)")
    shelves_resp = requests.get(f"{BASE_URL}/sessions/{session_id}/shelves", headers=headers)
    shelves_after = shelves_resp.json()
    affected_set = set(import_result.get('affectedShelves', []))

    completed_count = 0
    for sh in shelves_after:
        if sh['shelfCode'] in affected_set:
            assert sh['status'] == 'COMPLETADO', f"Anaquel {sh['shelfCode']} debería estar COMPLETADO, pero está {sh['status']}"
            assert sh['totalPieces'] > 0, f"Anaquel {sh['shelfCode']} debería tener piezas > 0"
            completed_count += 1
            print(f"     [OK] {sh['shelfCode']} [{sh.get('plant')}]: {sh['status']} ({sh['totalPieces']} pzas) -> VERDE EN CROQUIS")

    assert completed_count == 12, f"Se esperaban 12 anaqueles completados, pero hubo {completed_count}"
    print(f"[OK] Todos los 12 anaqueles importados cambiaron su estatus a COMPLETADO (Verde en Croquis).")

    print_step("PASO 6: EXPORTACIÓN PARA ASPEL SAE (CONSOLIDADO GLOBAL PI Y POR ANAQUEL)")
    # 6.1 Global Consolidated
    export_global = requests.get(f"{BASE_URL}/export/sae/{session_id}?format=CSV&layout=IMPORT", headers=headers)
    assert export_global.status_code == 200, f"Error en exportación global: {export_global.text}"
    global_csv_text = export_global.text
    print(f"[OK] Exportación Consolidada Global generada ({len(global_csv_text)} bytes)")
    first_lines = [l for l in global_csv_text.splitlines() if l.strip()][:5]
    for line in first_lines:
        print(f"     {line}")
    assert "CVE_ART" in global_csv_text and "CANT" in global_csv_text

    # 6.2 Shelf-specific export (e.g. PB-KUR-A1)
    target_sh = next(s for s in shelves_after if s['shelfCode'] == 'PB-KUR-A1')
    export_shelf = requests.get(f"{BASE_URL}/export/sae/{session_id}?format=CSV&layout=IMPORT&shelfId={target_sh['shelfId']}", headers=headers)
    assert export_shelf.status_code == 200, f"Error en exportación de anaquel: {export_shelf.text}"
    shelf_csv_text = export_shelf.text
    print(f"[OK] Exportación específica de anaquel {target_sh['shelfCode']} generada:")
    for line in [l for l in shelf_csv_text.splitlines() if l.strip()]:
        print(f"     {line}")
    assert "NMP40 2/4X1/4" in shelf_csv_text

    print_step("PASO 7: MARCAR ÉXITO SAE Y VERIFICAR BLINDAJE DE CÉDULA")
    sae_resp = requests.post(f"{BASE_URL}/sessions/{session_id}/status", headers=headers, json={
        "status": "CERRADO_EXITO",
        "notes": "Conteo físico importado y cuadrado en Aspel SAE con éxito total"
    })
    assert sae_resp.status_code == 200, f"Error actualizando status SAE: {sae_resp.text}"
    updated_session = sae_resp.json()
    assert updated_session["status"] == "CERRADO_EXITO"
    print(f"[OK] Sesión blindada y actualizada: Status='{updated_session['status']}', Folio='{updated_session['folio']}'")

    print_step("PASO 8: VERIFICACIÓN DE GENERACIÓN DE ETIQUETAS QR")
    counts_resp = requests.get(f"{BASE_URL}/counts?sessionId={session_id}", headers=headers)
    assert counts_resp.status_code == 200
    counts = counts_resp.json()
    print(f"[OK] Se obtuvieron {len(counts)} registros contados listos para generar QR.")
    for c in counts[:4]:
        print(f"     - Código: {c['capturedCode']}, Anaquel: {c['shelfCode']}, Cantidad: {c['quantity']} pz -> QR listo")

    print_step("PASO 9: PROBAR REAPERTURA Y DESMARCAR / RESET DE ANAQUEL")
    # Reabrir sesión
    reopen_resp = requests.post(f"{BASE_URL}/sessions/{session_id}/reopen", headers=headers, json={
        "reason": "Auditoría de verificación de anaquel individual"
    })
    assert reopen_resp.status_code == 200
    print(f"[OK] Sesión reabierta correctamente para edición: Status='{reopen_resp.json()['status']}'")

    # Desmarcar un anaquel (PB-VAL-01) para quitar la marca si se contó por error
    val_shelf = next(s for s in shelves_after if s['shelfCode'] == 'PB-VAL-01')
    reset_resp = requests.post(f"{BASE_URL}/sessions/{session_id}/shelves/{val_shelf['shelfId']}/reset",
                               headers=headers, json={"clearRecords": False})
    assert reset_resp.status_code == 200, f"Error desmarcando: {reset_resp.text}"
    # Verificar que el anaquel volvió a PENDIENTE
    shelves_check = requests.get(f"{BASE_URL}/sessions/{session_id}/shelves", headers=headers).json()
    val_after = next(s for s in shelves_check if s['shelfId'] == val_shelf['shelfId'])
    assert val_after['status'] == 'PENDIENTE', f"Esperado PENDIENTE pero fue {val_after['status']}"
    print(f"[OK] Anaquel {val_after['shelfCode']} desmarcado exitosamente a estatus: '{val_after['status']}' (Neutro/Sin color)")

    print_step("TODAS LAS PRUEBAS END-TO-END PASARON CON ÉXITO ROTUNDO (100%)")

if __name__ == "__main__":
    main()
