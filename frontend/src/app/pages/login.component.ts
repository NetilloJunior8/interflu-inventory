import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-wrapper">
      <div class="login-card">
        <div class="brand-header">
          <img src="/logo_interflu_official.png" alt="Interflu Inventory" class="logo-official" />
          <p class="system-subtitle">Sistema de Control de Inventario Físico · Refaccionaria Industrial</p>
        </div>

        <form (ngSubmit)="submitLogin()" class="login-form">
          <div class="field">
            <label class="label">Usuario</label>
            <input
              class="input"
              type="text"
              [(ngModel)]="username"
              name="username"
              placeholder="Ingresa tu usuario"
              required
              autofocus
            />
          </div>

          <div class="field">
            <label class="label">Contraseña</label>
            <div class="password-wrapper">
              <input
                class="input"
                [type]="showPassword ? 'text' : 'password'"
                [(ngModel)]="password"
                name="password"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                class="password-toggle-btn"
                (click)="showPassword = !showPassword"
                [attr.aria-label]="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                title="{{ showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña' }}"
              >
                <svg *ngIf="!showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <svg *ngIf="showPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              </button>
            </div>
          </div>

          <button class="btn btn-primary btn-lg full-w" type="submit" [disabled]="loading()">
            {{ loading() ? 'Iniciando sesión...' : 'Ingresar al Sistema' }}
          </button>
        </form>



        <!-- Add New User Trigger -->
        <div class="new-user-section">
          <button type="button" class="btn btn-ghost btn-sm" (click)="showNewUserModal = true">
            + Registrar Nuevo Usuario
          </button>
        </div>

        <div class="login-footer">
          <span>Internacional de Fluidos, S.A. de C.V. &bull; Módulo de Conteo Físico</span>
        </div>
      </div>
    </div>

    <!-- Modal: Register New User -->
    <div class="modal-backdrop" *ngIf="showNewUserModal" (click)="showNewUserModal = false">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <h3 class="modal-title">Registrar Nuevo Usuario</h3>
        <p class="modal-desc">Agrega a un nuevo compañero del equipo de almacén para capturar o revisar inventarios.</p>
        <div class="form-stack">
          <div>
            <label class="label">Nombre de Usuario (Login)</label>
            <input class="input" [(ngModel)]="newUser.username" placeholder="Ej. Roberto, Maria, Almacen1..." />
          </div>
          <div>
            <label class="label">Nombre Completo</label>
            <input class="input" [(ngModel)]="newUser.fullName" placeholder="Ej. Roberto Sánchez García" />
          </div>
          <div>
            <label class="label">Contraseña</label>
            <div class="password-wrapper">
              <input
                class="input"
                [type]="showNewUserPassword ? 'text' : 'password'"
                [(ngModel)]="newUser.password"
                placeholder="••••••••"
              />
              <button
                type="button"
                class="password-toggle-btn"
                (click)="showNewUserPassword = !showNewUserPassword"
                [attr.aria-label]="showNewUserPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                title="{{ showNewUserPassword ? 'Ocultar contraseña' : 'Mostrar contraseña' }}"
              >
                <svg *ngIf="!showNewUserPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <svg *ngIf="showNewUserPassword" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                  <line x1="1" y1="1" x2="23" y2="23"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showNewUserModal = false">Cancelar</button>
          <button class="btn btn-primary" (click)="createUser()">Guardar y Registrar</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-wrapper {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0a2472 0%, #06184a 50%, #0f172a 100%);
      padding: 20px;
    }
    .login-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: var(--radius-lg);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35);
      width: 100%;
      max-width: 440px;
      padding: 36px 32px;
    }
    .brand-header {
      text-align: center;
      margin-bottom: 28px;
    }
    .logo-official {
      max-height: 95px;
      max-width: 320px;
      width: 100%;
      object-fit: contain;
      margin-bottom: 10px;
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      filter: drop-shadow(0 4px 12px rgba(10, 36, 114, 0.12));
    }
    .logo-official:hover {
      transform: scale(1.03);
    }
    .login-card {
      animation: loginPop 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .login-card:hover {
      box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.4);
    }
    @keyframes loginPop {
      from { opacity: 0; transform: scale(0.96) translateY(12px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .system-subtitle {
      font-size: 12.5px;
      color: var(--text-muted);
      margin: 0;
    }
    .login-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .field {
      display: flex;
      flex-direction: column;
    }
    .full-w {
      width: 100%;
      margin-top: 6px;
    }

    .new-user-section {
      margin-top: 14px;
      text-align: center;
    }
    .login-footer {
      margin-top: 22px;
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
    }

    .password-wrapper {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
    }
    .password-wrapper .input {
      padding-right: 42px;
    }
    .password-toggle-btn {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      padding: 5px;
      cursor: pointer;
      color: #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.15s ease;
    }
    .password-toggle-btn:hover {
      color: var(--brand-blue);
      background: #f1f5f9;
    }

    .modal-title { margin: 0 0 6px 0; font-size: 18px; font-weight: 700; color: var(--brand-navy); }
    .modal-desc { margin: 0 0 16px 0; font-size: 13px; color: var(--text-secondary); }
    .form-stack { display: flex; flex-direction: column; gap: 14px; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
  `]
})
export class LoginComponent {
  username = '';
  password = '';
  showPassword = false;
  showNewUserPassword = false;
  loading = signal(false);

  showNewUserModal = false;
  newUser = { username: '', password: '', fullName: '' };

  constructor(
    private auth: AuthService,
    private toast: ToastService,
    private router: Router
  ) {}


  submitLogin() {
    if (!this.username) return;
    this.loading.set(true);
    this.auth.login(this.username, this.password).subscribe({
      next: (user) => {
        this.loading.set(false);
        this.toast.success(`Bienvenido a Interflu Inventory, ${user.fullName}`);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.error(err.error?.message || 'Credenciales incorrectas');
      }
    });
  }

  createUser() {
    if (!this.newUser.username.trim() || !this.newUser.password.trim()) {
      this.toast.warning('Ingresa usuario y contraseña');
      return;
    }
    this.auth.createUser(this.newUser).subscribe({
      next: () => {
        this.toast.success(`Usuario ${this.newUser.username} creado correctamente`);
        this.username = this.newUser.username;
        this.password = this.newUser.password;
        this.showNewUserModal = false;
        this.newUser = { username: '', password: '', fullName: '' };
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al crear usuario')
    });
  }
}
