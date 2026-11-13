import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), '..', 'backend', 'interflu_inventory.db')
print("Opening database:", db_path)

conn = sqlite3.connect(db_path)
cur = conn.cursor()

# 1. Purge count records
cur.execute("DELETE FROM count_records")
print("Deleted count_records:", cur.rowcount)

# 2. Purge audit logs, sae export logs, support tickets
cur.execute("DELETE FROM audit_logs")
cur.execute("DELETE FROM sae_export_logs")
cur.execute("DELETE FROM support_tickets")

# 3. Clean sessions - keep only session 1
cur.execute("DELETE FROM inventory_sessions WHERE id != 1")
cur.execute("UPDATE inventory_sessions SET status = 'EN_CONTEO', closed_at = NULL, close_notes = NULL WHERE id = 1")

# 4. Clean shelf assignments - keep only for session 1, reset to PENDIENTE
cur.execute("DELETE FROM shelf_assignments WHERE session_id != 1")
cur.execute("""
    UPDATE shelf_assignments 
    SET status = 'PENDIENTE', completed_at = NULL, user_id = NULL
    WHERE session_id = 1
""")

# 5. Remove any test user
cur.execute("DELETE FROM users WHERE username = 'operador_prueba'")

conn.commit()

# Verify counts
cur.execute("SELECT COUNT(*) FROM inventory_sessions")
print("Sessions count:", cur.fetchone()[0])

cur.execute("SELECT COUNT(*) FROM count_records")
print("Count records:", cur.fetchone()[0])

cur.execute("SELECT COUNT(*) FROM shelf_assignments WHERE session_id = 1 AND status = 'COMPLETADO'")
print("Completed shelf assignments:", cur.fetchone()[0])

cur.execute("SELECT COUNT(*) FROM shelf_assignments WHERE session_id = 1 AND status = 'PENDIENTE'")
print("Pending shelf assignments:", cur.fetchone()[0])

cur.execute("SELECT COUNT(*) FROM shelves")
print("Shelves count:", cur.fetchone()[0])

conn.close()
print("Database purge SUCCESSFUL and 100% CLEAN!")
