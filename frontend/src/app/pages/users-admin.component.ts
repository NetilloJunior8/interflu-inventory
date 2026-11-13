import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, AdminUserDto } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-users-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="users-admin-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Administración de Usuarios y Accesos TI</h1>
          <p class="page-subtitle">Gestión centralizada de operadores de inventario, contraseñas, privilegios y estado de cuentas</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-primary" (click)="openCreateUserModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <line x1="20" y1="8" x2="20" y2="14"></line>
              <line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
            Nuevo Usuario
          </button>
        </div>
      </div>

      <!-- Quick Summary Cards -->
      <div class="metrics-grid">
        <div class="metric-card">
          <span class="m-label">Usuarios Registrados</span>
          <span class="m-val">{{ users().length }}</span>
        </div>
        <div class="metric-card">
          <span class="m-label">Operadores Activos</span>
          <span class="m-val text-success">{{ activeOperatorsCount() }}</span>
        </div>
        <div class="metric-card">
          <span class="m-label">Administradores TI</span>
          <span class="m-val text-info">{{ systemsCount() }}</span>
        </div>
        <div class="metric-card">
          <span class="m-label">Cuentas Privadas / Inactivas</span>
          <span class="m-val text-warning">{{ inactiveCount() }}</span>
        </div>
      </div>

      <!-- Users Table Card -->
      <div class="card table-card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nombre Completo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Fecha Alta</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let u of users()">
                <td class="mono fw-700 text-primary-brand">{{ u.username }}</td>
                <td class="fw-600 text-dark">{{ u.fullName }}</td>
                <td>
                  <span class="role-badge" [ngClass]="u.role === 'SISTEMAS' ? 'role-sistemas' : 'role-operador'">
                    {{ u.role === 'SISTEMAS' ? 'Sistemas TI' : 'Operador' }}
                  </span>
                </td>
                <td>
                  <span class="status-pill" [class.status-active]="u.active" [class.status-inactive]="!u.active">
                    {{ u.active ? 'Activo' : 'Privado / Inactivo' }}
                  </span>
                </td>
                <td class="font-xs text-muted">{{ u.createdAt | slice:0:10 }}</td>
                <td>
                  <div class="action-buttons-group">
                    <button class="btn btn-sm btn-outline-primary" (click)="openChangePasswordModal(u)">
                      Cambiar Clave
                    </button>
                    <button
                      class="btn btn-sm"
                      [ngClass]="u.active ? 'btn-outline-warning' : 'btn-outline-success'"
                      (click)="toggleActive(u)"
                      title="Privar o permitir acceso al sistema"
                    >
                      {{ u.active ? 'Privar Acceso' : 'Habilitar' }}
                    </button>
                    <button class="btn btn-sm btn-ghost text-danger" (click)="confirmDeleteUser(u)" title="Eliminar usuario">
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Modal: Create User -->
      <div class="modal-backdrop" *ngIf="showCreateModal" (click)="showCreateModal = false">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Registrar Nuevo Usuario</h3>
            <button class="btn-close" (click)="showCreateModal = false">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="field-label">Nombre de Usuario (Login)</label>
              <input type="text" class="input mono" [(ngModel)]="newUser.username" placeholder="ej. daniel, martha" />
            </div>
            <div class="form-group mt-2">
              <label class="field-label">Nombre Completo y Cargo</label>
              <input type="text" class="input" [(ngModel)]="newUser.fullName" placeholder="ej. Daniel Pérez · Almacén PB" />
            </div>
            <div class="form-group mt-2">
              <label class="field-label">Contraseña</label>
              <div class="password-input-wrap">
                <input [type]="showNewPassword ? 'text' : 'password'" class="input" [(ngModel)]="newUser.password" placeholder="Mínimo 4 caracteres" />
                <button type="button" class="btn-toggle-eye" (click)="showNewPassword = !showNewPassword">
                  {{ showNewPassword ? 'Ocultar' : 'Ver' }}
                </button>
              </div>
            </div>
            <div class="form-group mt-2">
              <label class="field-label">Rol y Privilegios</label>
              <select class="select-field" [(ngModel)]="newUser.role">
                <option value="OPERADOR">Operador de Inventario (Conteo, Croquis y Cédulas)</option>
                <option value="SISTEMAS">Administrador de Sistemas TI (Soporte y Gestión)</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" (click)="showCreateModal = false">Cancelar</button>
            <button class="btn btn-primary" (click)="submitCreateUser()">Crear Usuario</button>
          </div>
        </div>
      </div>

      <!-- Modal: Change Password -->
      <div class="modal-backdrop" *ngIf="changingUser" (click)="changingUser = null">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Cambiar Contraseña: {{ changingUser.fullName }} ({{ changingUser.username }})</h3>
            <button class="btn-close" (click)="changingUser = null">&times;</button>
          </div>
          <div class="modal-body">
            <p class="text-muted font-sm">
              Ingresa la nueva contraseña para el usuario <strong>{{ changingUser.username }}</strong>.
            </p>
            <div class="form-group mt-2">
              <label class="field-label">Nueva Contraseña</label>
              <div class="password-input-wrap">
                <input [type]="showChangePassword ? 'text' : 'password'" class="input" [(ngModel)]="newPasswordInput" placeholder="Escribe la nueva contraseña" />
                <button type="button" class="btn-toggle-eye" (click)="showChangePassword = !showChangePassword">
                  {{ showChangePassword ? 'Ocultar' : 'Ver' }}
                </button>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" (click)="changingUser = null">Cancelar</button>
            <button class="btn btn-primary" (click)="submitChangePassword()">Actualizar Contraseña</button>
          </div>
        </div>
      </div>

      <!-- Modal: Delete User Confirmation -->
      <div class="modal-backdrop" *ngIf="userToDelete" (click)="userToDelete = null">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3 class="text-danger">Eliminar Usuario</h3>
            <button class="btn-close" (click)="userToDelete = null">&times;</button>
          </div>
          <div class="modal-body">
            <p>
              ¿Estás seguro de que deseas eliminar permanentemente al usuario <strong>{{ userToDelete.fullName }} ({{ userToDelete.username }})</strong>?
            </p>
            <div class="alert alert-danger" style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; color: #991b1b; font-size: 13px;">
              Si el usuario tiene conteos o auditoría registrada, se recomienda en su lugar <strong>Privar Acceso</strong> para preservar la integridad de la bitácora física.
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" (click)="userToDelete = null">Cancelar</button>
            <button class="btn btn-danger" (click)="submitDeleteUser()">Sí, Eliminar Usuario</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .users-admin-page {
      padding: 1.5rem 2rem;
      max-width: 1400px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .page-title {
      font-size: 1.5rem;
      font-weight: 800;
      color: #0a2472;
      margin: 0 0 0.25rem 0;
    }
    .page-subtitle {
      color: #64748b;
      font-size: 0.9rem;
      margin: 0;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
    }
    .metric-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 1rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    }
    .m-label {
      font-size: 0.75rem;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .m-val {
      font-size: 1.75rem;
      font-weight: 800;
      color: #0f172a;
    }
    .text-success { color: #059669 !important; }
    .text-info { color: #0284c7 !important; }
    .text-warning { color: #d97706 !important; }
    .text-danger { color: #dc2626 !important; }
    .text-primary-brand { color: #0a2472; }

    .table-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
    }
    .table-wrap {
      overflow-x: auto;
      scrollbar-width: thin;
      scrollbar-color: #94a3b8 #f1f5f9;
      width: 100%;
    }
    table {
      width: 100%;
      min-width: 900px;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.85rem;
    }
    th {
      background: #f8fafc;
      padding: 10px 14px;
      font-weight: 700;
      color: #475569;
      border-bottom: 1px solid #e2e8f0;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    tr:hover td {
      background: #f8fafc;
    }
    .role-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .role-operador { background: #e0f2fe; color: #0369a1; }
    .role-sistemas { background: #f3e8ff; color: #7e22ce; border: 1px solid #d8b4fe; }

    .status-pill {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
    }
    .status-active { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .status-inactive { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }

    .action-buttons-group {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .btn-outline-primary {
      background: transparent;
      border: 1px solid #2563eb;
      color: #2563eb;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-outline-primary:hover { background: #eff6ff; }
    .btn-outline-warning {
      background: transparent;
      border: 1px solid #f59e0b;
      color: #b45309;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-outline-warning:hover { background: #fffbeb; }
    .btn-outline-success {
      background: transparent;
      border: 1px solid #10b981;
      color: #047857;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-outline-success:hover { background: #ecfdf5; }

    .password-input-wrap {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .btn-toggle-eye {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 0.45rem 0.65rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
    }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.6);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }
    .modal-box {
      background: #ffffff;
      border-radius: 12px;
      width: 100%;
      max-width: 520px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
      overflow: hidden;
    }
    .modal-header {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-header h3 {
      margin: 0;
      font-size: 1.15rem;
      color: #0a2472;
    }
    .modal-body {
      padding: 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .modal-footer {
      padding: 0.75rem 1.25rem;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }
    .field-label {
      font-size: 0.78rem;
      font-weight: 700;
      color: #475569;
      margin-bottom: 4px;
      display: block;
    }
    .select-field, .input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 0.45rem 0.65rem;
      font-size: 0.85rem;
    }
    .btn-close {
      border: none;
      background: transparent;
      font-size: 1.3rem;
      cursor: pointer;
      color: #64748b;
    }
  `]
})
export class UsersAdminComponent implements OnInit {
  users = signal<AdminUserDto[]>([]);

  showCreateModal = false;
  showNewPassword = false;
  newUser = {
    username: '',
    fullName: '',
    password: '',
    role: 'OPERADOR'
  };

  changingUser: AdminUserDto | null = null;
  newPasswordInput = '';
  showChangePassword = false;

  userToDelete: AdminUserDto | null = null;

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.api.getAdminUsers().subscribe({
      next: (list) => this.users.set(list),
      error: () => this.toast.error('No se pudo cargar la lista de usuarios.')
    });
  }

  activeOperatorsCount(): number {
    return this.users().filter(u => u.active && u.role === 'OPERADOR').length;
  }

  systemsCount(): number {
    return this.users().filter(u => u.role === 'SISTEMAS').length;
  }

  inactiveCount(): number {
    return this.users().filter(u => !u.active).length;
  }

  openCreateUserModal() {
    this.newUser = {
      username: '',
      fullName: '',
      password: '',
      role: 'OPERADOR'
    };
    this.showNewPassword = false;
    this.showCreateModal = true;
  }

  submitCreateUser() {
    if (!this.newUser.username.trim() || !this.newUser.fullName.trim() || !this.newUser.password.trim()) {
      this.toast.error('Completa todos los campos obligatorios.');
      return;
    }
    this.api.createAdminUser(this.newUser).subscribe({
      next: (created) => {
        this.showCreateModal = false;
        this.toast.success(`Usuario ${created.username} registrado correctamente.`);
        this.loadUsers();
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al crear usuario')
    });
  }

  openChangePasswordModal(u: AdminUserDto) {
    this.changingUser = u;
    this.newPasswordInput = '';
    this.showChangePassword = false;
  }

  submitChangePassword() {
    if (!this.changingUser) return;
    if (!this.newPasswordInput.trim() || this.newPasswordInput.trim().length < 4) {
      this.toast.error('La contraseña debe tener al menos 4 caracteres.');
      return;
    }
    this.api.changeUserPassword(this.changingUser.id, this.newPasswordInput.trim()).subscribe({
      next: () => {
        this.toast.success(`Contraseña actualizada para ${this.changingUser?.username}.`);
        this.changingUser = null;
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al cambiar contraseña')
    });
  }

  toggleActive(u: AdminUserDto) {
    this.api.toggleUserActive(u.id).subscribe({
      next: (updated) => {
        const msg = updated.active ? `Acceso habilitado para ${updated.username}` : `Acceso privado/bloqueado para ${updated.username}`;
        this.toast.info(msg);
        this.loadUsers();
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al modificar estado')
    });
  }

  confirmDeleteUser(u: AdminUserDto) {
    this.userToDelete = u;
  }

  submitDeleteUser() {
    if (!this.userToDelete) return;
    const target = this.userToDelete;
    this.api.deleteAdminUser(target.id).subscribe({
      next: () => {
        this.toast.success(`Usuario ${target.username} eliminado.`);
        this.userToDelete = null;
        this.loadUsers();
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al eliminar usuario')
    });
  }
}
