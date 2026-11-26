import { Component, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, SupportTicketDto } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-support',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="support-page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Mesa de Ayuda · Soporte Técnico TI</h1>
          <p class="page-subtitle">Canal oficial de incidencias, solicitudes técnicas y requerimientos para el sistema Interflu Inventory</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-outline" (click)="loadTickets(true)" [disabled]="loading()" title="Recargar bitácora de tickets">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M23 4v6h-6"></path>
              <path d="M1 20v-6h6"></path>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            {{ loading() ? 'Sincronizando...' : 'Actualizar' }}
          </button>
          <button class="btn btn-primary" (click)="openNewTicketModal()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Levantar Ticket de Soporte
          </button>
        </div>
      </div>

      <!-- Quick Metrics Bar -->
      <div class="metrics-grid">
        <div class="metric-card">
          <span class="m-label">Total Tickets</span>
          <span class="m-val">{{ tickets().length }}</span>
        </div>
        <div class="metric-card">
          <span class="m-label">Pendientes</span>
          <span class="m-val text-warning">{{ countByStatus('PENDIENTE') }}</span>
        </div>
        <div class="metric-card">
          <span class="m-label">En Atención</span>
          <span class="m-val text-info">{{ countByStatus('EN_ATENCION') }}</span>
        </div>
        <div class="metric-card">
          <span class="m-label">Resueltos</span>
          <span class="m-val text-success">{{ countByStatus('RESUELTO') }}</span>
        </div>
      </div>

      <!-- Filter Tabs -->
      <div class="filter-bar">
        <div class="tabs">
          <button class="tab-btn" [class.active]="filterStatus === 'TODOS'" (click)="setFilter('TODOS')">
            Todos ({{ tickets().length }})
          </button>
          <button class="tab-btn" [class.active]="filterStatus === 'PENDIENTE'" (click)="setFilter('PENDIENTE')">
            Pendientes ({{ countByStatus('PENDIENTE') }})
          </button>
          <button class="tab-btn" [class.active]="filterStatus === 'EN_ATENCION'" (click)="setFilter('EN_ATENCION')">
            En Atención ({{ countByStatus('EN_ATENCION') }})
          </button>
          <button class="tab-btn" [class.active]="filterStatus === 'RESUELTO' || filterStatus === 'COMPLETADO'" (click)="setFilter('COMPLETADO')">
            Completados ({{ countCompleted() }})
          </button>
        </div>
      </div>

      <!-- Ticket Queue Table -->
      <div class="card table-card">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Prioridad</th>
                <th>Categoría</th>
                <th>Asunto y Descripción</th>
                <th>Solicitante</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let t of filteredTickets()">
                <td class="mono fw-700 text-primary-brand">{{ t.folio }}</td>
                <td>
                  <span class="priority-badge" [ngClass]="'prio-' + t.priority.toLowerCase()">
                    {{ t.priority }}
                  </span>
                </td>
                <td class="category-chip">{{ t.category }}</td>
                <td>
                  <div class="fw-600 text-dark">{{ t.subject }}</div>
                  <div class="ticket-desc-snippet">{{ t.description }}</div>
                  <div *ngIf="t.adminNotes" class="admin-notes-pill">
                    <strong>Respuesta TI:</strong> {{ t.adminNotes }}
                  </div>
                </td>
                <td>
                  <span class="fw-600">{{ t.authorFullName || t.authorName || t.authorUsername }}</span>
                  <span class="sub-user">({{ t.authorUsername }})</span>
                </td>
                <td>
                  <span class="status-badge" [ngClass]="t.status === 'COMPLETADO' || t.status === 'RESUELTO' ? 'status-completado' : 'status-' + t.status.toLowerCase()">
                    {{ statusLabel(t.status) }}
                  </span>
                </td>
                <td class="font-xs text-muted">{{ t.createdAt | slice:0:16 | date:'dd/MM/yyyy HH:mm' }}</td>
                <td style="white-space: nowrap;">
                  <button class="btn btn-sm btn-outline-primary" (click)="openInspectModal(t)">
                    {{ auth.isSistemas() ? 'Atender Ticket' : 'Ver Detalle' }}
                  </button>
                  <button
                    *ngIf="t.status !== 'COMPLETADO' && t.status !== 'RESUELTO'"
                    class="btn btn-sm btn-success"
                    (click)="quickCompleteTicket(t)"
                    title="Marcar inmediatamente como Completado"
                    style="margin-left: 5px; font-weight: 700;"
                  >
                    ✓ Completar
                  </button>
                </td>
              </tr>
              <tr *ngIf="filteredTickets().length === 0">
                <td colspan="8" class="text-center py-4 text-muted">
                  No hay tickets registrados en esta categoría.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- New Ticket Modal -->
      <div class="modal-backdrop" *ngIf="showNewModal" (click)="showNewModal = false">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3>Nuevo Ticket de Soporte Técnico</h3>
            <button class="btn-close" (click)="showNewModal = false">&times;</button>
          </div>
          <div class="modal-body">
            <p class="text-muted font-sm">
              Describe la situación o requerimiento. El equipo de Sistemas atenderá el ticket y registrará su solución en esta bitácora.
            </p>
            <div class="form-grid">
              <div class="form-group">
                <label class="field-label">Categoría</label>
                <select class="select-field" [(ngModel)]="newTicket.category">
                  <option value="SISTEMA">Falla en el Sistema / Error de Software</option>
                  <option value="CATALOGO">Catálogo de Materiales / SKU Faltante</option>
                  <option value="ANAQUEL">Croquis / Ubicación Física de Anaquel</option>
                  <option value="USUARIOS">Acceso / Usuarios y Contraseñas</option>
                  <option value="EXPORTACION">Exportación / Compatibilidad SAE</option>
                  <option value="HARDWARE">Dispositivo / Lector de Códigos / Red</option>
                </select>
              </div>
              <div class="form-group">
                <label class="field-label">Prioridad</label>
                <select class="select-field" [(ngModel)]="newTicket.priority">
                  <option value="BAJA">Baja</option>
                  <option value="MEDIA">Media (Normal)</option>
                  <option value="ALTA">Alta (Urgente en conteo)</option>
                  <option value="CRITICA">Crítica (Operación detenida)</option>
                </select>
              </div>
            </div>
            <div class="form-group mt-2">
              <label class="field-label">Asunto Corto</label>
              <input type="text" class="input" [(ngModel)]="newTicket.subject" placeholder="Ej. Anaquel PB-CHID-W03 no carga partidas" />
            </div>
            <div class="form-group mt-2">
              <label class="field-label">Descripción Detallada</label>
              <textarea class="textarea" rows="4" [(ngModel)]="newTicket.description" placeholder="Explica detalladamente qué ocurrió, en qué anaquel o código de producto..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" (click)="showNewModal = false">Cancelar</button>
            <button class="btn btn-primary" [disabled]="submitting" (click)="submitTicket()">
              {{ submitting ? 'Enviando...' : 'Registrar Ticket' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Inspect / Update Status Modal -->
      <div class="modal-backdrop" *ngIf="inspectingTicket" (click)="inspectingTicket = null">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <div>
              <span class="mono fw-700 text-primary-brand">{{ inspectingTicket.folio }}</span>
              <h3>Detalle del Ticket</h3>
            </div>
            <button class="btn-close" (click)="inspectingTicket = null">&times;</button>
          </div>
          <div class="modal-body">
            <div class="ticket-meta-block">
              <div><strong>Solicitante:</strong> {{ inspectingTicket.authorFullName || inspectingTicket.authorName || inspectingTicket.authorUsername }} ({{ inspectingTicket.authorUsername }})</div>
              <div><strong>Fecha de Creación:</strong> {{ inspectingTicket.createdAt | slice:0:16 | date:'dd/MM/yyyy HH:mm' }}</div>
              <div><strong>Categoría:</strong> {{ inspectingTicket.category }}</div>
              <div><strong>Prioridad:</strong> {{ inspectingTicket.priority }}</div>
            </div>

            <div class="ticket-detail-box">
              <div class="fw-700 font-md text-dark mb-1">{{ inspectingTicket.subject }}</div>
              <p class="text-secondary font-sm">{{ inspectingTicket.description }}</p>
            </div>

            <!-- Admin Controls (Sistemas Only) -->
            <div class="admin-control-box mt-3" *ngIf="auth.isSistemas()">
              <label class="field-label">Cambiar Estado:</label>
              <div class="status-options-row">
                <button
                  type="button"
                  class="btn-status-toggle status-pending"
                  [class.active]="selectedNewStatus === 'PENDIENTE'"
                  (click)="selectedNewStatus = 'PENDIENTE'"
                >
                  Pendiente
                </button>
                <button
                  type="button"
                  class="btn-status-toggle status-progress"
                  [class.active]="selectedNewStatus === 'EN_ATENCION'"
                  (click)="selectedNewStatus = 'EN_ATENCION'"
                >
                  En Atención
                </button>
                <button
                  type="button"
                  class="btn-status-toggle status-resolved"
                  [class.active]="selectedNewStatus === 'COMPLETADO' || selectedNewStatus === 'RESUELTO'"
                  (click)="selectedNewStatus = 'COMPLETADO'"
                >
                  ✓ Completado
                </button>
              </div>

              <div class="form-group mt-2">
                <label class="field-label">Notas Técnicas / Resolución de Sistemas:</label>
                <textarea
                  class="textarea"
                  rows="3"
                  [(ngModel)]="adminNotesText"
                  placeholder="Detalles de la solución aplicada o instrucciones para el operador..."
                ></textarea>
              </div>
            </div>

            <!-- Operator View of Admin Notes -->
            <div class="admin-reply-box mt-3" *ngIf="!auth.isSistemas()">
              <label class="field-label">Resolución y Notas de Sistemas:</label>
              <div *ngIf="inspectingTicket.adminNotes" class="admin-notes-content">
                {{ inspectingTicket.adminNotes }}
              </div>
              <div *ngIf="!inspectingTicket.adminNotes" class="admin-notes-empty text-muted">
                Este ticket aún está en revisión por el equipo técnico de Sistemas.
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" (click)="inspectingTicket = null">Cerrar</button>
            <button *ngIf="auth.isSistemas()" class="btn btn-primary" (click)="saveTicketStatus()">
              Guardar Estado y Notas
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .support-page {
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
    .text-warning { color: #d97706 !important; }
    .text-info { color: #0284c7 !important; }
    .text-success { color: #059669 !important; }
    .text-primary-brand { color: #0a2472; }

    .filter-bar {
      display: flex;
      gap: 1rem;
    }
    .tabs {
      display: flex;
      gap: 0.5rem;
      background: #f1f5f9;
      padding: 4px;
      border-radius: 8px;
    }
    .tab-btn {
      border: none;
      background: transparent;
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 0.82rem;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s;
    }
    .tab-btn.active {
      background: #ffffff;
      color: #0a2472;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

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
      min-width: 950px;
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
      vertical-align: top;
    }
    tr:hover td {
      background: #f8fafc;
    }
    .priority-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .prio-baja { background: #f1f5f9; color: #475569; }
    .prio-media { background: #e0f2fe; color: #0369a1; }
    .prio-alta { background: #fef3c7; color: #92400e; }
    .prio-critica { background: #fee2e2; color: #991b1b; }

    .category-chip {
      font-size: 0.75rem;
      color: #475569;
      font-weight: 600;
    }
    .ticket-desc-snippet {
      font-size: 0.8rem;
      color: #64748b;
      margin-top: 2px;
      max-width: 420px;
    }
    .admin-notes-pill {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 0.75rem;
      color: #166534;
      margin-top: 4px;
    }
    .sub-user {
      display: block;
      font-size: 0.72rem;
      color: #94a3b8;
    }

    .status-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
    }
    .status-pendiente { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
    .status-en_atencion { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .status-resuelto { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }

    /* Modals */
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
      max-width: 580px;
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
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
    }
    .field-label {
      font-size: 0.78rem;
      font-weight: 700;
      color: #475569;
      margin-bottom: 4px;
      display: block;
    }
    .select-field, .input, .textarea {
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
    .ticket-meta-block {
      background: #f8fafc;
      padding: 0.75rem;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      font-size: 0.8rem;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
    }
    .ticket-detail-box {
      background: #eff6ff;
      border: 1px solid #dbeafe;
      border-radius: 8px;
      padding: 0.85rem;
    }
    .status-options-row {
      display: flex;
      gap: 0.5rem;
    }
    .btn-status-toggle {
      flex: 1;
      padding: 0.5rem;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 700;
      border: 1.5px solid transparent;
      cursor: pointer;
      background: #f1f5f9;
      color: #475569;
    }
    .btn-status-toggle.active.status-pending {
      background: #fffbeb;
      border-color: #f59e0b;
      color: #b45309;
    }
    .btn-status-toggle.active.status-progress {
      background: #eff6ff;
      border-color: #2563eb;
      color: #1d4ed8;
    }
    .btn-status-toggle.active.status-resolved {
      background: #ecfdf5;
      border-color: #10b981;
      color: #047857;
    }
    .status-completado {
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
    }

    @media (max-width: 768px) {
      .support-page {
        padding: 0.75rem !important;
        overflow-x: hidden !important;
        width: 100% !important;
        max-width: 100vw !important;
        box-sizing: border-box !important;
      }
      .page-header {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 0.75rem !important;
      }
      .metrics-grid {
        grid-template-columns: repeat(2, 1fr) !important;
        gap: 0.5rem !important;
      }
      .filter-bar {
        overflow-x: auto !important;
        width: 100% !important;
        padding-bottom: 4px !important;
      }
      .tabs {
        width: 100% !important;
        overflow-x: auto !important;
      }
      .table-card {
        border-radius: 8px !important;
        overflow-x: hidden !important;
      }
      .table-wrap {
        width: 100% !important;
        overflow-x: auto !important;
      }
      .modal-box {
        max-width: 95vw !important;
        padding: 1rem !important;
      }
      .status-options-row {
        flex-direction: column !important;
        gap: 0.4rem !important;
      }
    }
  `]
})
export class SupportComponent implements OnInit, OnDestroy {
  tickets = signal<SupportTicketDto[]>([]);
  filterStatus = 'TODOS';
  loading = signal<boolean>(false);
  private autoRefreshTimer: any = null;

  showNewModal = false;
  submitting = false;

  newTicket = {
    category: 'SISTEMA',
    priority: 'MEDIA',
    subject: '',
    description: ''
  };

  inspectingTicket: SupportTicketDto | null = null;
  selectedNewStatus = 'PENDIENTE';
  adminNotesText = '';

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.loadTickets(false);
    if (typeof window !== 'undefined') {
      this.autoRefreshTimer = setInterval(() => {
        this.loadTickets(false);
      }, 15000);
    }
  }

  ngOnDestroy() {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
    }
  }

  loadTickets(showToast = false) {
    if (showToast) this.loading.set(true);
    this.api.getSupportTickets().subscribe({
      next: (data) => {
        this.loading.set(false);
        this.tickets.set(data);
        if (showToast) {
          this.toast.info(`Bitácora sincronizada (${data.length} tickets)`);
        }
      },
      error: () => {
        this.loading.set(false);
        if (showToast) {
          this.toast.error('No se pudieron cargar los tickets de soporte.');
        }
      }
    });
  }

  setFilter(status: string) {
    this.filterStatus = status;
  }

  filteredTickets(): SupportTicketDto[] {
    if (this.filterStatus === 'TODOS') return this.tickets();
    if (this.filterStatus === 'COMPLETADO' || this.filterStatus === 'RESUELTO') {
      return this.tickets().filter(t => t.status === 'COMPLETADO' || t.status === 'RESUELTO');
    }
    return this.tickets().filter(t => t.status === this.filterStatus);
  }

  countByStatus(st: string): number {
    return this.tickets().filter(t => t.status === st).length;
  }

  countCompleted(): number {
    return this.tickets().filter(t => t.status === 'COMPLETADO' || t.status === 'RESUELTO').length;
  }

  statusLabel(st: string): string {
    if (st === 'PENDIENTE') return 'Pendiente';
    if (st === 'EN_ATENCION') return 'En Atención';
    if (st === 'RESUELTO' || st === 'COMPLETADO') return 'Completado';
    return st;
  }

  quickCompleteTicket(t: SupportTicketDto) {
    this.api.updateSupportTicketStatus(t.id, {
      status: 'COMPLETADO',
      adminNotes: 'Marcado como completado en sistemas.'
    }).subscribe({
      next: () => {
        this.toast.success(`Ticket ${t.folio} marcado como COMPLETADO.`);
        this.loadTickets();
      },
      error: (err) => this.toast.error('Error al actualizar ticket: ' + (err.error?.message || err.message))
    });
  }

  openNewTicketModal() {
    this.newTicket = {
      category: 'SISTEMA',
      priority: 'MEDIA',
      subject: '',
      description: ''
    };
    this.showNewModal = true;
  }

  submitTicket() {
    if (!this.newTicket.subject.trim() || !this.newTicket.description.trim()) {
      this.toast.error('Ingresa el asunto y la descripción de la incidencia.');
      return;
    }
    this.submitting = true;
    this.api.createSupportTicket(this.newTicket).subscribe({
      next: (created) => {
        this.submitting = false;
        this.showNewModal = false;
        this.toast.success(`Ticket ${created.folio} registrado con éxito.`);
        this.loadTickets();
      },
      error: (err) => {
        this.submitting = false;
        this.toast.error('Error al registrar ticket: ' + (err.error?.message || err.message));
      }
    });
  }

  openInspectModal(t: SupportTicketDto) {
    this.inspectingTicket = t;
    this.selectedNewStatus = (t.status === 'RESUELTO') ? 'COMPLETADO' : t.status;
    this.adminNotesText = t.adminNotes || '';
  }

  saveTicketStatus() {
    if (!this.inspectingTicket) return;
    this.api.updateSupportTicketStatus(this.inspectingTicket.id, {
      status: this.selectedNewStatus,
      adminNotes: this.adminNotesText
    }).subscribe({
      next: () => {
        this.toast.success('Ticket actualizado correctamente.');
        this.inspectingTicket = null;
        this.loadTickets();
      },
      error: (err) => this.toast.error('Error al actualizar ticket: ' + (err.error?.message || err.message))
    });
  }
}
