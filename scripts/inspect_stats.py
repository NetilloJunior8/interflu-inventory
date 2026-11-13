import sqlite3

conn = sqlite3.connect('backend/interflu_inventory.db')
c = conn.cursor()

print("--- 'Planta 1' Shelves ---")
c.execute("SELECT id, code, zone, plant, active FROM shelves WHERE plant = 'Planta 1'")
for r in c.fetchall():
    print(r)

print("\n--- Completed Assignments in Session 1 ---")
c.execute("""
    SELECT sa.id, s.code, s.plant, s.zone, sa.status
    FROM shelf_assignments sa
    JOIN shelves s ON sa.shelf_id = s.id
    WHERE sa.session_id = 1 AND sa.status = 'COMPLETADO'
""")
rows = c.fetchall()
print(f"Total COMPLETADO in session 1: {len(rows)}")
for r in rows:
    print(r)

print("\n--- Check all sessions completed assignments ---")
c.execute("""
    SELECT sa.session_id, s.plant, s.code, sa.status
    FROM shelf_assignments sa
    JOIN shelves s ON sa.shelf_id = s.id
    WHERE sa.status = 'COMPLETADO'
""")
all_comp = c.fetchall()
print(f"Total COMPLETADO across all sessions: {len(all_comp)}")
for r in all_comp:
    print(r)

conn.close()
