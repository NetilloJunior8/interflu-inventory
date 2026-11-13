import sqlite3

conn = sqlite3.connect('backend/interflu_inventory.db')
c = conn.cursor()

c.execute("SELECT cr.id, s.code FROM count_records cr JOIN shelves s ON cr.shelf_id = s.id WHERE s.code IN ('PB-TUB-01', 'PB-MAN-01')")
print("Count records for TUB/MAN:", c.fetchall())

conn.close()
