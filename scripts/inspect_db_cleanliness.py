import sqlite3

conn = sqlite3.connect('backend/interflu_inventory.db')
cursor = conn.cursor()

def dump_table(tname, limit=10):
    cursor.execute(f"PRAGMA table_info(\"{tname}\")")
    cols = [c[1] for c in cursor.fetchall()]
    print(f"\n--- {tname} (columns: {cols}) ---")
    cursor.execute(f"SELECT * FROM \"{tname}\" LIMIT {limit}")
    for row in cursor.fetchall():
        print(row)

dump_table("inventory_sessions")
dump_table("users")
dump_table("support_tickets")
dump_table("sae_export_logs")
dump_table("count_records", 5)

conn.close()
