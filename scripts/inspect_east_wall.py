import sqlite3

conn = sqlite3.connect('backend/interflu_inventory.db')
c = conn.cursor()

print("--- PB-INOX shelves ---")
c.execute("SELECT id, code, zone, posx, posy, active FROM shelves WHERE code LIKE 'PB-INOX%'")
for r in c.fetchall():
    print(r)

print("\n--- PB-CHID-W shelves ---")
c.execute("SELECT id, code, zone, posx, posy, active FROM shelves WHERE code LIKE 'PB-CHID-W%'")
for r in c.fetchall():
    print(r)

print("\n--- Shelf assignments for PB-INOX ---")
c.execute("SELECT sa.id, s.code, sa.status FROM shelf_assignments sa JOIN shelves s ON sa.shelf_id = s.id WHERE s.code LIKE 'PB-INOX%'")
for r in c.fetchall():
    print(r)

print("\n--- Shelf assignments for PB-CHID-W ---")
c.execute("SELECT sa.id, s.code, sa.status FROM shelf_assignments sa JOIN shelves s ON sa.shelf_id = s.id WHERE s.code LIKE 'PB-CHID-W%'")
for r in c.fetchall():
    print(r)

conn.close()
