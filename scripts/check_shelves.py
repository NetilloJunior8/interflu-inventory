import sqlite3
conn = sqlite3.connect("backend/interflu_inventory.db")
c = conn.cursor()
c.execute("SELECT id, code, description, zone, plant FROM shelves WHERE code LIKE '%ACE%' OR zone LIKE '%Acero%' ORDER BY code")
for r in c.fetchall():
    print(r)
conn.close()
