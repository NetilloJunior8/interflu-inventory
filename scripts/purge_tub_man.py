import sqlite3

conn = sqlite3.connect('backend/interflu_inventory.db')
c = conn.cursor()

c.execute("DELETE FROM shelf_assignments WHERE shelf_id IN (SELECT id FROM shelves WHERE code IN ('PB-TUB-01', 'PB-MAN-01'))")
print(f"Deleted {c.rowcount} shelf_assignments for TUB/MAN")

c.execute("DELETE FROM shelves WHERE code IN ('PB-TUB-01', 'PB-MAN-01')")
print(f"Deleted {c.rowcount} shelves for TUB/MAN")

conn.commit()

c.execute("SELECT plant, COUNT(*) FROM shelves WHERE active = 1 GROUP BY plant")
for r in c.fetchall():
    print(r)

conn.close()
