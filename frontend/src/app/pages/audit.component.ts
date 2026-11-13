import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, AuditLogDto, InventorySessionSummary } from '../services/api.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-audit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="mov-container">
      <!-- Header -->
      <div class="mov-header">
        <div>
          <span class="mov-kicker">CONTROL INTERNO Y TRAZABILIDAD</span>
          <h1 class="page-title">Registro de Movimientos de Inventario</h1>
          <p class="page-subtitle">
            Bitácora inmutable de conteos físicos, modificaciones de partidas, aperturas, cierres y exportaciones
          </p>
        </div>

        <div class="header-actions">
          <select class="select session-picker" [ngModel]="selectedSessionId()" (ngModelChange)="onSessionChange($event)">
            <option [ngValue]="null">Todos los Folios de Inventario</option>
            <option *ngFor="let s of sessions()" [ngValue]="s.id">{{ s.folio }} — {{ s.title }}</option>
          </select>
          <button class="btn btn-secondary" (click)="loadLogs()" title="Recargar eventos">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: -2px; margin-right: 4px;">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            Actualizar
          </button>
        </div>
      </div>

      <!-- Top Movement Statistics -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-label">Movimientos Registrados</span>
          <span class="kpi-value">{{ logs().length }}</span>
          <span class="kpi-hint">Transacciones en bitácora</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Capturas Físicas</span>
          <span class="kpi-value text-primary-brand">{{ captureCount() }}</span>
          <span class="kpi-hint">Ingresos y ajustes de partidas</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Exportaciones Generadas</span>
          <span class="kpi-value text-info">{{ exportCount() }}</span>
          <span class="kpi-hint">Archivos preparados para SAE</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Aperturas y Cierres</span>
          <span class="kpi-value text-success">{{ statusChangeCount() }}</span>
          <span class="kpi-hint">Eventos de ciclo de vida</span>
        </div>
      </div>

      <!-- Movements Log Table -->
      <div class="card">
        <div class="card-header-row">
          <div class="filter-pills">
            <button class="pill-btn" [class.active]="selectedOperator === 'ALL'" (click)="selectedOperator = 'ALL'">
              Todos los Operadores
            </button>
            <button class="pill-btn" [class.active]="selectedOperator === 'Osiris'" (click)="selectedOperator = 'Osiris'">
              Osiris
            </button>
            <button class="pill-btn" [class.active]="selectedOperator === 'Alexis'" (click)="selectedOperator = 'Alexis'">
              Alexis
            </button>
          </div>

          <div class="search-wrap">
            <input class="input" [(ngModel)]="filterTerm" placeholder="Buscar por acción, folio o código..." />
          </div>
        </div>

        <div class="table-wrap">
          <table class="mov-table">
            <thead>
              <tr>
                <th class="th-time">Fecha y Hora</th>
                <th class="th-user">Operador Responsable</th>
                <th class="th-action">Acción Registrada</th>
                <th class="th-folio">Folio / Cédula</th>
                <th class="th-entity">Entidad</th>
                <th class="th-change">Variación (Ant &rarr; Nuevo)</th>
                <th class="th-details">Detalle Técnico</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let l of filteredLogs()">
                <td class="tabular muted text-nowrap font-xs">{{ l.timestamp | date:'dd/MM/yyyy HH:mm:ss' }}</td>
                <td>
                  <div class="user-block">
                    <span class="user-name">{{ l.userFullName || l.username }}</span>
                  </div>
                </td>
                <td>
                  <span class="badge" [ngClass]="actionBadgeClass(l.action)">{{ actionLabel(l.action) }}</span>
                </td>
                <td class="mono font-xs fw-600">{{ l.sessionFolio || 'General' }}</td>
                <td class="muted font-xs">{{ l.entityName }} #{{ l.entityId || '-' }}</td>
                <td class="tabular font-xs">
                  <span *ngIf="l.oldValue || l.newValue" class="change-track">
                    <span class="old-v">{{ l.oldValue || '0' }}</span> &rarr;
                    <span class="new-v">{{ l.newValue || '0' }}</span>
                  </span>
                  <span *ngIf="!l.oldValue && !l.newValue" class="muted">—</span>
                </td>
                <td class="details-cell">{{ l.details }}</td>
              </tr>
              <tr *ngIf="filteredLogs().length === 0">
                <td colspan="7" class="empty-cell">No hay registros de movimientos que coincidan con los criterios seleccionados.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .mov-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .mov-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
    }

    .mov-kicker {
      font-size: 0.72rem;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      display: block;
      margin-bottom: 2px;
    }

    .page-title {
      font-size: 1.5rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
    }

    .page-subtitle {
      margin: 0;
      color: #64748b;
      font-size: 0.85rem;
    }

    .header-actions {
      display: flex;
      gap: 0.65rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .session-picker {
      height: 38px;
      padding: 0 0.75rem;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.85rem;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }

    .kpi-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 1.15rem 1.25rem;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .kpi-label {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      letter-spacing: 0.03em;
    }

    .kpi-value {
      font-size: 1.6rem;
      font-weight: 800;
      color: #0f172a;
    }

    .kpi-hint {
      font-size: 0.75rem;
      color: #94a3b8;
    }

    .text-primary-brand { color: #1d4ed8; }
    .text-info { color: #0284c7; }
    .text-success { color: #059669; }

    /* Card */
    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
      overflow: hidden;
    }

    .card-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1.25rem;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .filter-pills {
      display: flex;
      gap: 0.35rem;
    }

    .pill-btn {
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 0.35rem 0.75rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s;
    }
    .pill-btn:hover { background: #f1f5f9; }
    .pill-btn.active {
      background: #ffffff;
      border-color: #cbd5e1;
      color: #0f172a;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    }

    .search-wrap .input {
      height: 34px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 0 0.75rem;
      font-size: 0.82rem;
      width: 250px;
    }

    /* Table with High-Visibility Scrollbar */
    .table-wrap {
      overflow-x: auto;
      scrollbar-width: thin;
      scrollbar-color: #94a3b8 #f1f5f9;
      width: 100%;
    }

    .mov-table {
      width: 100%;
      min-width: 1170px;
      border-collapse: collapse;
      font-size: 0.88rem;
    }

    .mov-table th {
      background: #f8fafc;
      color: #475569;
      font-size: 0.75rem;
      text-transform: uppercase;
      font-weight: 700;
      padding: 0.65rem 1rem;
      border-bottom: 1.5px solid #e2e8f0;
      text-align: left;
    }

    .mov-table td {
      padding: 0.65rem 1rem;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }

    .mov-table tr:hover {
      background: #f8fafc;
    }

    .th-time { width: 140px; }
    .th-user { width: 150px; }
    .th-action { width: 180px; }
    .th-folio { width: 120px; }
    .th-entity { width: 110px; }
    .th-change { width: 130px; }
    .th-details { width: 340px; }

    .user-name { font-weight: 600; font-size: 0.85rem; color: #0f172a; }

    .badge {
      display: inline-block;
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.2rem 0.55rem;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .badge-capture { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .badge-export { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .badge-status { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .badge-delete { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .badge-generic { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }

    .change-track { display: inline-flex; align-items: center; gap: 4px; }
    .old-v { color: #b91c1c; text-decoration: line-through; }
    .new-v { color: #047857; font-weight: 700; }
    .details-cell { font-size: 0.82rem; color: #334155; line-height: 1.45; }
    .empty-cell { text-align: center; color: #94a3b8; padding: 2.5rem; }
  `]
})
export class AuditComponent implements OnInit {
  sessions = signal<InventorySessionSummary[]>([]);
  selectedSessionId = signal<number | null>(null);
  logs = signal<AuditLogDto[]>([]);

  selectedOperator: 'ALL' | 'Osiris' | 'Alexis' = 'ALL';
  filterTerm = '';

  captureCount = computed(() => this.logs().filter(l => l.action.includes('CAPTURA') || l.action.includes('PLANILLA') || l.action.includes('DUPLICADO')).length);
  exportCount = computed(() => this.logs().filter(l => l.action.includes('EXPORTAR')).length);
  statusChangeCount = computed(() => this.logs().filter(l => l.action.includes('ESTADO') || l.action.includes('CERRAR') || l.action.includes('REABRIR')).length);

  filteredLogs = computed(() => {
    let list = this.logs();

    if (this.selectedOperator !== 'ALL') {
      const op = this.selectedOperator.toUpperCase();
      list = list.filter(l => (l.username && l.username.toUpperCase().includes(op)) || (l.userFullName && l.userFullName.toUpperCase().includes(op)));
    }

    if (this.filterTerm.trim()) {
      const q = this.filterTerm.trim().toUpperCase();
      list = list.filter(l =>
        l.action.toUpperCase().includes(q) ||
        (l.sessionFolio && l.sessionFolio.toUpperCase().includes(q)) ||
        (l.details && l.details.toUpperCase().includes(q))
      );
    }

    return list;
  });

  constructor(
    private api: ApiService,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.api.getSessions().subscribe({
      next: (data) => this.sessions.set(data),
      error: () => {}
    });
    this.loadLogs();
  }

  onSessionChange(id: number | null) {
    this.selectedSessionId.set(id);
    this.loadLogs();
  }

  loadLogs() {
    const sid = this.selectedSessionId() !== null ? this.selectedSessionId()! : undefined;
    this.api.getAuditLogs(sid, 200).subscribe({
      next: (data) => this.logs.set(data),
      error: (err) => this.toast.error('Error al cargar movimientos: ' + (err.error?.message || err.message))
    });
  }

  actionBadgeClass(action: string): string {
    if (action.includes('CAPTURA') || action.includes('PLANILLA') || action.includes('DUPLICADO')) return 'badge-capture';
    if (action.includes('EXPORTAR')) return 'badge-export';
    if (action.includes('ESTADO') || action.includes('CERRAR') || action.includes('REABRIR')) return 'badge-status';
    if (action.includes('ELIMINAR')) return 'badge-delete';
    return 'badge-generic';
  }

  actionLabel(action: string): string {
    if (action === 'CAPTURA_CONTEO') return 'Captura Partida';
    if (action === 'GUARDAR_PLANILLA_EXCEL') return 'Guardar Cédula';
    if (action.startsWith('EXPORTAR_SAE')) return 'Exportación SAE';
    if (action === 'CERRAR_INVENTARIO') return 'Cierre con Éxito';
    if (action === 'REABRIR_INVENTARIO') return 'Reapertura Folio';
    if (action.startsWith('CAMBIO_ESTADO')) return 'Cambio de Estatus';
    if (action === 'AJUSTE_PLANO_CROQUIS') return 'Acomodo en Croquis';
    if (action === 'ELIMINAR_CONTEO') return 'Eliminación Partida';
    return action.replace(/_/g, ' ');
  }
}
