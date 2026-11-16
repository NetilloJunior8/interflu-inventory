import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, InventorySessionSummary, ValidationSummaryDto } from '../services/api.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div class="page-title-box">
        <div class="page-tag">OPERACIONES Y CONCILIACIÓN FÍSICA</div>
        <h1 class="page-title">Panel de Control de Inventarios</h1>
        <p class="page-subtitle">Refaccionaria Industrial Interflu &bull; Gestión integral de existencias físicas y exportación SAE</p>
      </div>
      <div class="header-actions">
        <!-- Excel Stats Export Button -->
        <button class="btn btn-secondary" (click)="exportStatsExcel()" [disabled]="exportingStats() || !selectedSession()" title="Descargar libro Excel con estadísticas ejecutivas, avance físico y detalle de 170 anaqueles">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>{{ exportingStats() ? 'Generando Excel...' : 'Exportar Estadísticas (Excel)' }}</span>
        </button>

        <!-- Excel Counts Import Button -->
        <label class="btn btn-secondary btn-file-upload" title="Importar archivo Excel (.xlsx o .csv) con conteos ya realizados">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>Importar Conteos de Excel</span>
          <input type="file" accept=".xlsx,.xls,.csv" (change)="onImportExcelCounts($event)" hidden />
        </label>

        <button class="btn btn-primary" (click)="showNewModal = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Nuevo Inventario
        </button>
      </div>
    </div>

    <!-- KPI Grid -->
    <div class="kpi-grid">
      <div class="kpi-card card-kpi-sessions">
        <div class="kpi-top">
          <span class="kpi-label">Sesiones Activas</span>
          <span class="kpi-icon-pill">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
          </span>
        </div>
        <span class="kpi-value">{{ activeSessionsCount() }}</span>
        <span class="kpi-hint">De {{ sessions().length }} registradas en el sistema</span>
      </div>

      <div class="kpi-card card-kpi-global" *ngIf="selectedSession() as s">
        <div class="kpi-top">
          <span class="kpi-label">Avance Global (170)</span>
          <span class="kpi-pill-percent">{{ s.progressPercent }}%</span>
        </div>
        <span class="kpi-value text-brand-navy">{{ s.completedShelves }} <span class="kpi-unit">/ {{ s.totalShelves }} anaqueles</span></span>
        <div class="progress-track">
          <div class="progress-fill" [style.width.%]="s.progressPercent"></div>
        </div>
        <span class="kpi-hint">{{ s.totalShelves - s.completedShelves }} anaqueles pendientes por contar</span>
      </div>

      <div class="kpi-card card-kpi-pb" *ngIf="selectedSession() as s">
        <div class="kpi-top">
          <span class="kpi-label">Planta Baja (87 Anaqueles)</span>
          <span class="kpi-pill-percent pill-pb">{{ s.pbPercent || 0 }}%</span>
        </div>
        <span class="kpi-value text-primary-brand">{{ s.pbCompleted || 0 }} <span class="kpi-unit">/ {{ s.pbTotal || 87 }}</span></span>
        <div class="progress-track">
          <div class="progress-fill fill-pb" [style.width.%]="s.pbPercent || 0"></div>
        </div>
        <span class="kpi-hint">Conexiones, Parker, Dix, Válvulas y Tubería</span>
      </div>

      <div class="kpi-card card-kpi-pa" *ngIf="selectedSession() as s">
        <div class="kpi-top">
          <span class="kpi-label">Planta Alta (84 Anaqueles)</span>
          <span class="kpi-pill-percent pill-pa">{{ s.paPercent || 0 }}%</span>
        </div>
        <span class="kpi-value text-purple">{{ s.paCompleted || 0 }} <span class="kpi-unit">/ {{ s.paTotal || 84 }}</span></span>
        <div class="progress-track">
          <div class="progress-fill fill-pa" [style.width.%]="s.paPercent || 0"></div>
        </div>
        <span class="kpi-hint">Sellos, O-Rings, Termoplásticos y Pasillos</span>
      </div>

      <div class="kpi-card card-kpi-pieces" *ngIf="selectedSession() as s">
        <div class="kpi-top">
          <span class="kpi-label">Piezas Físicas Contadas</span>
          <span class="kpi-icon-pill">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
          </span>
        </div>
        <span class="kpi-value mono text-emerald">{{ s.totalPieces | number:'1.0-2' }}</span>
        <span class="kpi-hint">{{ s.distinctCodes }} códigos distintos &bull; {{ s.totalRecords }} capturas</span>
      </div>

      <div class="kpi-card card-kpi-val" *ngIf="validationSummary() as val">
        <div class="kpi-top">
          <span class="kpi-label">Materiales Físicos Validados</span>
          <span class="kpi-icon-pill">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
          </span>
        </div>
        <span class="kpi-value text-success">{{ val.uniqueProducts }}</span>
        <span class="kpi-hint">{{ val.inexistentCodesCount }} nuevos &bull; {{ val.duplicatesCount }} multi-anaquel</span>
      </div>
    </div>

    <!-- Active Session Hero Deck -->
    <div class="session-hero-card" *ngIf="selectedSession() as s">
      <div class="session-hero-content">
        <!-- Left: Session Information -->
        <div class="session-info-side">
          <div class="session-meta-chips">
            <span class="folio-tag mono">{{ s.folio }}</span>
            <span class="badge" [ngClass]="statusBadgeClass(s.status)">
              <span class="badge-dot"></span>
              {{ statusLabel(s.status) }}
            </span>
            <span class="warehouse-tag">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
              SAE {{ s.warehouseCode }}: {{ s.warehouseName }}
            </span>
          </div>

          <h2 class="session-hero-title">{{ s.title }}</h2>
          <p class="session-notes" *ngIf="s.notes">{{ s.notes }}</p>
          <div class="audit-alerts-box" *ngIf="s.status === 'REABIERTO' || s.status === 'CERRADO_EXITO' || s.status === 'CERRADO_NO_EXITO'">
            <p class="reopen-note" *ngIf="s.status === 'REABIERTO' && s.reopenReason">
              <strong>Reapertura por {{ s.reopenedByName }}:</strong> <em>"{{ s.reopenReason }}"</em>
            </p>
            <p class="close-note" *ngIf="(s.status === 'CERRADO_EXITO' || s.status === 'CERRADO_NO_EXITO') && s.closeNotes">
              <strong>Cierre por {{ s.closedByName }}:</strong> <em>"{{ s.closeNotes }}"</em>
            </p>
          </div>
        </div>

        <!-- Right: Structured Action Deck -->
        <div class="session-actions-side">
          <div class="actions-group-label">OPERACIÓN DEL INVENTARIO</div>
          <div class="actions-grid-primary">
            <a *ngIf="s.isEditable" routerLink="/capture" [queryParams]="{sessionId: s.id}" class="action-tile tile-primary">
              <svg class="tile-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
              <div class="tile-text">
                <span class="tile-title">Cédula de Conteo</span>
                <span class="tile-desc">Captura física por anaquel</span>
              </div>
            </a>

            <a routerLink="/croquis" [queryParams]="{sessionId: s.id}" class="action-tile tile-secondary">
              <svg class="tile-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
              <div class="tile-text">
                <span class="tile-title">Croquis PB y PA</span>
                <span class="tile-desc">Plano interactivo visual</span>
              </div>
            </a>

            <a routerLink="/validation" [queryParams]="{sessionId: s.id}" class="action-tile tile-secondary">
              <svg class="tile-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              <div class="tile-text">
                <span class="tile-title">Control de Calidad</span>
                <span class="tile-desc">Validación de catálogos</span>
              </div>
            </a>

            <a routerLink="/qr-labels" [queryParams]="{sessionId: s.id}" class="action-tile tile-secondary">
              <svg class="tile-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
              <div class="tile-text">
                <span class="tile-title">Etiquetas QR</span>
                <span class="tile-desc">Impresión de materiales</span>
              </div>
            </a>

            <a routerLink="/export" [queryParams]="{sessionId: s.id}" class="action-tile tile-secondary">
              <svg class="tile-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <div class="tile-text">
                <span class="tile-title">Exportar SAE</span>
                <span class="tile-desc">Pólizas de inventario</span>
              </div>
            </a>

            <button class="action-tile tile-secondary action-tile-btn" (click)="exportStatsExcel()" [disabled]="exportingStats()" title="Descargar libro Excel con estadísticas ejecutivas y avance de los 170 anaqueles">
              <svg class="tile-icon text-success" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
              <div class="tile-text">
                <span class="tile-title">Estadísticas Excel</span>
                <span class="tile-desc">Reporte oficial y anaqueles</span>
              </div>
            </button>
          </div>

          <!-- Administration Row -->
          <div class="actions-admin-row">
            <button *ngIf="s.isEditable" class="btn btn-success btn-sm" (click)="openCloseModal(s)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
              Finalizar Conteo
            </button>
            <button *ngIf="!s.isEditable" class="btn btn-warning btn-sm" (click)="openReopenModal(s)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>
              Reabrir Cédula
            </button>
            <button *ngIf="s.isEditable" class="btn btn-danger-subtle btn-sm" (click)="openClearCountsModal()" [disabled]="clearingCounts() || s.totalRecords === 0" title="Eliminar datos importados de este folio y reiniciar anaqueles">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Limpiar Conteos
            </button>
            <button class="btn btn-danger-subtle btn-sm" (click)="confirmDeleteSession(s)" title="Eliminar inventario y sus partidas">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Eliminar Folio
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Inventory Sessions Table -->
    <div class="card table-card">
      <div class="card-header-row">
        <div>
          <h3 class="card-title">Historial de Folios de Inventario</h3>
          <p class="muted">Selecciona cualquier inventario registrado para consultar métricas, descargar archivos o gestionar anaqueles.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Título / Sector</th>
              <th>Almacén</th>
              <th>Estado</th>
              <th>Anaqueles Contados</th>
              <th>Piezas Totales</th>
              <th>Responsable</th>
              <th style="text-align: right;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let s of sessions()" [class.selected-row]="selectedSession()?.id === s.id" (click)="selectSession(s)">
              <td class="mono fw-700">
                <span class="folio-tag-table">{{ s.folio }}</span>
              </td>
              <td class="fw-600 text-primary">{{ s.title }}</td>
              <td><span class="warehouse-badge">SAE {{ s.warehouseCode }} &bull; {{ s.warehouseName }}</span></td>
              <td><span class="badge" [ngClass]="statusBadgeClass(s.status)"><span class="badge-dot"></span>{{ statusLabel(s.status) }}</span></td>
              <td>
                <div class="table-progress-cell">
                  <span class="tabular fw-600">{{ s.completedShelves }}/{{ s.totalShelves }}</span>
                  <div class="mini-progress-track">
                    <div class="mini-progress-fill" [style.width.%]="s.progressPercent"></div>
                  </div>
                  <span class="mini-percent">{{ s.progressPercent }}%</span>
                </div>
              </td>
              <td class="mono fw-700 text-brand-navy">{{ s.totalPieces | number:'1.0-2' }}</td>
              <td><span class="user-pill-table">{{ s.createdByName || '-' }}</span></td>
              <td (click)="$event.stopPropagation()" style="text-align: right;">
                <div class="row-actions" style="justify-content: flex-end;">
                  <button class="btn btn-secondary btn-sm" (click)="selectSession(s)">
                    {{ selectedSession()?.id === s.id ? 'Activo' : 'Cargar' }}
                  </button>
                  <button *ngIf="!s.isEditable" class="btn btn-warning btn-sm" (click)="openReopenModal(s)">Reabrir</button>
                  <button class="btn btn-ghost btn-sm text-danger" (click)="confirmDeleteSession(s)" title="Eliminar sesión">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </button>
                </div>
              </td>
            </tr>
            <tr *ngIf="sessions().length === 0">
              <td colspan="8" class="empty-cell">No hay inventarios registrados en la base de datos.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal: New Inventory -->
    <div class="modal-backdrop" *ngIf="showNewModal" (click)="showNewModal = false">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <h3 class="modal-title">Crear Nuevo Inventario</h3>
        <div class="form-stack">
          <div>
            <label class="label">Nombre del Inventario</label>
            <input class="input" [(ngModel)]="newSession.title" placeholder="Ej. Inventario Anual Refaccionaria Planta 1 y 2" />
          </div>
          <div class="two-cols">
            <div>
              <label class="label">Almacén Aspel SAE</label>
              <input class="input" [(ngModel)]="newSession.warehouseCode" placeholder="1" />
            </div>
            <div>
              <label class="label">Nombre Almacén</label>
              <input class="input" [(ngModel)]="newSession.warehouseName" placeholder="Almacén Principal" />
            </div>
          </div>
          <div>
            <label class="label">Notas y Observaciones</label>
            <textarea class="textarea" rows="2" [(ngModel)]="newSession.notes" placeholder="Instrucciones del inventario físico..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showNewModal = false">Cancelar</button>
          <button class="btn btn-primary" (click)="createSession()">Crear Inventario</button>
        </div>
      </div>
    </div>

    <!-- Modal: Close Inventory (Success / Discrepancy) -->
    <div class="modal-backdrop" *ngIf="closingSession" (click)="closingSession = null">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <h3 class="modal-title">Cerrar Inventario {{ closingSession.folio }}</h3>
        <p class="modal-desc">Indica el resultado final de la conciliación del inventario físico.</p>
        <div class="form-stack">
          <label class="label">Resultado del Cierre</label>
          <div class="radio-cards">
            <button type="button" class="radio-card" [class.active-success]="closeSuccess === true" (click)="closeSuccess = true">
              <strong>Éxito</strong>
              <span>Conteo verificado y listo para SAE</span>
            </button>
            <button type="button" class="radio-card" [class.active-danger]="closeSuccess === false" (click)="closeSuccess = false">
              <strong>Con Incidencias</strong>
              <span>Diferencias pendientes de aclarar</span>
            </button>
          </div>
          <div>
            <label class="label">Notas de Cierre</label>
            <textarea class="textarea" rows="3" [(ngModel)]="closeNotes" placeholder="Detalles u observaciones del cierre..."></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="closingSession = null">Cancelar</button>
          <button class="btn" [ngClass]="closeSuccess ? 'btn-success' : 'btn-danger'" (click)="confirmClose()">
            {{ closeSuccess ? 'Cerrar con Éxito' : 'Cerrar con Incidencias' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal: Reopen Inventory -->
    <div class="modal-backdrop" *ngIf="reopeningSession" (click)="reopeningSession = null">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <h3 class="modal-title">Reabrir Inventario {{ reopeningSession.folio }}</h3>
        <p class="modal-desc">Ingresa el motivo justificado de la reapertura para que quede asentado en la bitácora de auditoría.</p>
        <div class="form-stack">
          <label class="label">Motivo de Reapertura</label>
          <textarea class="textarea" rows="3" [(ngModel)]="reopenReason" placeholder="Ej. Ajuste de conteo en anaquel P1-VAL-01 por material no desempaquetado..."></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="reopeningSession = null">Cancelar</button>
          <button class="btn btn-warning" (click)="confirmReopen()">Confirmar Reapertura</button>
        </div>
      </div>
    </div>

    <!-- Modal: Delete Inventory Confirmation -->
    <div class="modal-backdrop" *ngIf="sessionToDelete" (click)="sessionToDelete = null">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <h3 class="modal-title text-danger">Eliminar Inventario</h3>
        <p class="modal-desc">
          ¿Estás seguro de que deseas eliminar permanentemente el inventario <strong>{{ sessionToDelete.folio }} &bull; {{ sessionToDelete.title }}</strong>?
        </p>
        <div class="delete-warning-box">
          <strong>Acción irreversible:</strong> Se eliminarán todos los conteos físicos, registros de materiales y asignaciones vinculadas a esta sesión.
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="sessionToDelete = null">Cancelar</button>
          <button class="btn btn-danger" (click)="executeDeleteSession()">Eliminar Definitivamente</button>
        </div>
      </div>
    </div>

    <!-- Modal: Clear Counts Confirmation -->
    <div class="modal-backdrop" *ngIf="showClearCountsModal" (click)="showClearCountsModal = false">
      <div class="modal-box" (click)="$event.stopPropagation()">
        <h3 class="modal-title text-danger">Eliminar Conteos de la Sesión</h3>
        <p class="modal-desc" *ngIf="selectedSession() as s">
          ¿Deseas eliminar todas las partidas capturadas en el folio <strong>{{ s.folio }} &bull; {{ s.title }}</strong>?
        </p>
        <div class="delete-warning-box">
          <strong>Acción de restablecimiento:</strong>
          <ul style="margin: 6px 0 0 16px; padding: 0;">
            <li>Se eliminarán todas las {{ selectedSession()?.totalRecords || 0 }} partidas contadas ({{ selectedSession()?.totalPieces | number:'1.0-2' }} piezas).</li>
            <li>Los 170 anaqueles (87 PB y 83 PA) regresarán a estado <strong>PENDIENTE</strong> con 0 piezas.</li>
            <li>Podrás importar nuevamente tu archivo Excel completo con todas sus hojas.</li>
          </ul>
        </div>
        <div style="margin-top: 14px;">
          <label class="label" style="color: #991b1b; font-weight: 700;">Para confirmar, escribe la palabra BORRAR:</label>
          <input class="input" [(ngModel)]="clearConfirmationWord" placeholder="Escribe BORRAR aquí" style="border-color: #fca5a5;" />
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showClearCountsModal = false" [disabled]="clearingCounts()">Cancelar</button>
          <button class="btn btn-danger" (click)="executeClearCounts()" [disabled]="clearingCounts() || clearConfirmationWord.trim().toUpperCase() !== 'BORRAR'">
            {{ clearingCounts() ? 'Eliminando...' : 'Sí, Eliminar Conteos' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .page-tag {
      font-size: 11px;
      font-weight: 800;
      color: var(--brand-blue);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .page-title {
      font-size: 24px;
      font-weight: 800;
      color: var(--brand-navy);
      margin: 0 0 4px 0;
      letter-spacing: -0.02em;
    }
    .page-subtitle {
      margin: 0;
      color: var(--text-muted);
      font-size: 13.5px;
    }
    .header-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
    }
    .btn-file-upload {
      cursor: pointer;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .kpi-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-lg);
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      position: relative;
      overflow: hidden;
    }
    .kpi-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 24px -4px rgba(15, 23, 42, 0.1);
      border-color: #cbd5e1;
    }
    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: #cbd5e1;
    }
    .card-kpi-sessions::before { background: #64748b; }
    .card-kpi-global::before   { background: var(--brand-navy); }
    .card-kpi-pb::before       { background: #0284c7; }
    .card-kpi-pa::before       { background: #9333ea; }
    .card-kpi-pieces::before   { background: #059669; }
    .card-kpi-val::before      { background: #10b981; }

    .kpi-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .kpi-label {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .kpi-icon-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: #f1f5f9;
      color: #64748b;
    }
    .kpi-pill-percent {
      font-size: 11px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 999px;
      background: #eff6ff;
      color: var(--brand-blue);
    }
    .pill-pb { background: #e0f2fe; color: #0284c7; }
    .pill-pa { background: #faf5ff; color: #9333ea; }

    .kpi-value {
      font-size: 28px;
      font-weight: 800;
      color: var(--text-primary);
      line-height: 1.15;
      letter-spacing: -0.02em;
    }
    .kpi-unit {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-muted);
    }
    .kpi-hint {
      font-size: 12px;
      color: var(--text-secondary);
      line-height: 1.3;
    }
    .progress-track {
      height: 6px;
      background: #f1f5f9;
      border-radius: 99px;
      overflow: hidden;
      margin: 4px 0;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #0a2472 0%, #1d4ed8 100%);
      border-radius: 99px;
      transition: width 0.35s ease;
    }
    .fill-pb { background: linear-gradient(90deg, #0284c7 0%, #38bdf8 100%); }
    .fill-pa { background: linear-gradient(90deg, #7e22ce 0%, #c084fc 100%); }
    .text-brand-navy { color: var(--brand-navy); }
    .text-primary-brand { color: #0284c7; }
    .text-purple { color: #9333ea; }
    .text-emerald { color: #059669; }
    .text-success { color: #10b981; }

    /* Session Hero Card */
    .session-hero-card {
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: var(--radius-lg);
      padding: 24px;
      box-shadow: 0 4px 18px rgba(15, 23, 42, 0.06);
      margin-bottom: 24px;
    }
    .session-hero-content {
      display: grid;
      grid-template-columns: 1.1fr 1.4fr;
      gap: 32px;
      align-items: start;
    }
    @media (max-width: 1100px) {
      .session-hero-content {
        grid-template-columns: 1fr;
        gap: 20px;
      }
    }
    .session-info-side {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .session-meta-chips {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .folio-tag {
      font-weight: 800;
      font-size: 13px;
      color: var(--brand-navy);
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 3px 10px;
      border-radius: 6px;
    }
    .warehouse-tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 3px 10px;
      border-radius: 6px;
    }
    .session-hero-title {
      font-size: 20px;
      font-weight: 800;
      color: var(--text-primary);
      margin: 0;
      line-height: 1.25;
    }
    .session-notes {
      margin: 0;
      font-size: 13.5px;
      color: var(--text-secondary);
      line-height: 1.5;
    }
    .audit-alerts-box {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 12.5px;
    }
    .reopen-note { margin: 0; color: #b45309; }
    .close-note { margin: 0; color: #475569; }

    /* Session Action Deck */
    .session-actions-side {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .actions-group-label {
      font-size: 11px;
      font-weight: 800;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .actions-grid-primary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }
    .action-tile {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 14px;
      border-radius: 10px;
      text-decoration: none;
      transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
      border: 1px solid #e2e8f0;
      background: #ffffff;
    }
    .action-tile:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
      border-color: #cbd5e1;
    }
    .tile-primary {
      background: linear-gradient(135deg, #0a2472 0%, #1d4ed8 100%);
      color: #ffffff;
      border-color: #0a2472;
    }
    .tile-primary .tile-desc { color: #bfdbfe; }
    .tile-primary:hover {
      box-shadow: 0 8px 20px rgba(10, 36, 114, 0.3);
      border-color: #1d4ed8;
    }
    .tile-secondary {
      background: #f8fafc;
      color: var(--text-primary);
    }
    .tile-secondary:hover {
      background: #ffffff;
      border-color: var(--brand-blue);
    }
    .tile-icon {
      flex-shrink: 0;
    }
    .tile-text {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
    }
    .tile-title {
      font-size: 13px;
      font-weight: 700;
    }
    .tile-desc {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .action-tile-btn {
      font-family: inherit;
      cursor: pointer;
      text-align: left;
      border: 1px solid #e2e8f0;
    }
    .action-tile-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    .actions-admin-row {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
      padding-top: 8px;
      border-top: 1px solid #f1f5f9;
    }

    /* Table Card */
    .table-card {
      padding: 22px 24px;
    }
    .card-header-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .card-title {
      font-size: 16px;
      font-weight: 800;
      color: var(--brand-navy);
      margin: 0 0 3px 0;
    }
    .folio-tag-table {
      font-weight: 800;
      background: #f1f5f9;
      padding: 3px 8px;
      border-radius: 4px;
      color: #0f172a;
    }
    .warehouse-badge {
      font-size: 12px;
      color: var(--text-secondary);
      font-weight: 500;
    }
    .table-progress-cell {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mini-progress-track {
      width: 70px;
      height: 6px;
      background: #f1f5f9;
      border-radius: 99px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .mini-progress-fill {
      height: 100%;
      background: var(--brand-blue);
      border-radius: 99px;
    }
    .mini-percent {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-muted);
    }
    .user-pill-table {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
    }
    .selected-row td {
      background: #eff6ff !important;
    }
    .badge-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      display: inline-block;
      margin-right: 5px;
    }
    .btn-danger-subtle {
      background: #fef2f2;
      color: #dc2626;
      border: 1px solid #fecaca;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.18s;
    }
    .btn-danger-subtle:hover {
      background: #fee2e2;
      border-color: #fca5a5;
    }
    .btn-outline-danger {
      background: transparent;
      color: #dc2626;
      border: 1.5px solid #f87171;
      font-weight: 600;
      border-radius: var(--radius-md, 8px);
      padding: 8px 14px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      transition: all 0.18s ease;
    }
    .btn-outline-danger:hover:not(:disabled) {
      background: #fef2f2;
      border-color: #dc2626;
    }
    .btn-outline-danger:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .fw-700 { font-weight: 700; }
    .fw-600 { font-weight: 600; }
    .muted { color: var(--text-muted); font-size: 12.5px; margin: 0; }
    .row-actions { display: flex; gap: 6px; }
    .empty-cell { text-align: center; color: var(--text-muted); padding: 32px; font-size: 14px; }

    .modal-title { margin: 0 0 6px 0; font-size: 18px; font-weight: 700; color: var(--brand-navy); }
    .modal-desc { margin: 0 0 16px 0; font-size: 13px; color: var(--text-secondary); }
    .form-stack { display: flex; flex-direction: column; gap: 14px; }
    .two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

    .radio-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .radio-card { border: 1.5px solid var(--border-strong); background: #fff; border-radius: 8px; padding: 12px; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
    .radio-card strong { font-size: 13px; }
    .radio-card span { font-size: 11px; color: var(--text-secondary); }
    .active-success { border-color: #059669; background: #ecfdf5; }
    .active-danger { border-color: #dc2626; background: #fef2f2; }
    .delete-warning-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; color: #991b1b; font-size: 13px; margin: 12px 0; }
  `]
})
export class DashboardComponent implements OnInit {
  sessions = signal<InventorySessionSummary[]>([]);
  selectedSession = signal<InventorySessionSummary | null>(null);
  validationSummary = signal<ValidationSummaryDto | null>(null);

  activeSessionsCount = computed(() =>
    this.sessions().filter(s => s.isEditable).length
  );

  showNewModal = false;
  newSession = { title: '', warehouseCode: '1', warehouseName: 'Almacén Principal', notes: '' };

  closingSession: InventorySessionSummary | null = null;
  closeSuccess = true;
  closeNotes = '';

  reopeningSession: InventorySessionSummary | null = null;
  reopenReason = '';

  sessionToDelete: InventorySessionSummary | null = null;
  showClearCountsModal = false;
  clearConfirmationWord = '';
  clearingCounts = signal(false);

  constructor(
    private api: ApiService,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.api.getSessions().subscribe(list => {
      this.sessions.set(list);
      const savedId = Number(localStorage.getItem('interflu_active_session'));
      const found = list.find(s => s.id === savedId) || list[0] || null;
      if (found) this.selectSession(found);
    });
  }

  selectSession(s: InventorySessionSummary) {
    this.selectedSession.set(s);
    localStorage.setItem('interflu_active_session', String(s.id));
    this.api.getValidationSummary(s.id).subscribe({
      next: val => this.validationSummary.set(val),
      error: () => this.validationSummary.set(null)
    });
  }

  createSession() {
    if (!this.newSession.title.trim()) {
      this.toast.warning('Ingresa un nombre para el inventario');
      return;
    }
    this.api.createSession(this.newSession).subscribe({
      next: (created) => {
        this.showNewModal = false;
        this.newSession = { title: '', warehouseCode: '1', warehouseName: 'Almacén Principal', notes: '' };
        this.toast.success(`Inventario ${created.folio} creado`);
        localStorage.setItem('interflu_active_session', String(created.id));
        this.loadData();
      },
      error: (err) => this.toast.error(err.error?.message || 'No se pudo crear el inventario')
    });
  }

  onImportExcelCounts(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    const s = this.selectedSession();
    if (!s) {
      this.toast.warning('Selecciona primero un inventario activo');
      return;
    }
    this.api.importExcelCounts(s.id, file).subscribe({
      next: (res) => {
        this.toast.success(`Excel procesado: ${res.importedRecords} conteos cargados en ${res.shelvesUpdated} anaqueles (${res.totalPieces} pzas)`);
        this.loadData();
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al importar archivo de Excel')
    });
    input.value = '';
  }

  openClearCountsModal() {
    if (!this.selectedSession()) {
      this.toast.warning('Selecciona primero un inventario');
      return;
    }
    this.clearConfirmationWord = '';
    this.showClearCountsModal = true;
  }

  executeClearCounts() {
    const s = this.selectedSession();
    if (!s) return;
    this.clearingCounts.set(true);
    this.api.clearSessionCounts(s.id).subscribe({
      next: (res) => {
        this.clearingCounts.set(false);
        this.showClearCountsModal = false;
        this.toast.success(res.message || 'Conteos eliminados y 170 anaqueles restablecidos a Pendiente.');
        this.loadData();
      },
      error: (err) => {
        this.clearingCounts.set(false);
        this.toast.error(err.error?.message || 'Error al eliminar los conteos');
      }
    });
  }

  openCloseModal(s: InventorySessionSummary) {
    this.closingSession = s;
    this.closeSuccess = true;
    this.closeNotes = '';
  }

  confirmClose() {
    if (!this.closingSession) return;
    this.api.closeSession(this.closingSession.id, this.closeSuccess, this.closeNotes).subscribe({
      next: () => {
        this.toast.success(this.closeSuccess ? 'Inventario cerrado con ÉXITO' : 'Inventario cerrado con incidencias');
        this.closingSession = null;
        this.loadData();
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al cerrar inventario')
    });
  }

  openReopenModal(s: InventorySessionSummary) {
    this.reopeningSession = s;
    this.reopenReason = '';
  }

  confirmReopen() {
    if (!this.reopeningSession) return;
    if (this.reopenReason.trim().length < 5) {
      this.toast.warning('Ingresa un motivo de al menos 5 caracteres para la bitácora');
      return;
    }
    this.api.reopenSession(this.reopeningSession.id, this.reopenReason).subscribe({
      next: () => {
        this.toast.success('Inventario reabierto');
        this.reopeningSession = null;
        this.loadData();
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al reabrir inventario')
    });
  }

  confirmDeleteSession(s: InventorySessionSummary) {
    this.sessionToDelete = s;
  }

  executeDeleteSession() {
    if (!this.sessionToDelete) return;
    const target = this.sessionToDelete;
    this.api.deleteSession(target.id).subscribe({
      next: () => {
        this.toast.success(`Inventario ${target.folio} y sus datos relacionados fueron eliminados.`);
        this.sessionToDelete = null;
        if (this.selectedSession()?.id === target.id) {
          localStorage.removeItem('interflu_active_session');
          this.selectedSession.set(null);
        }
        this.loadData();
      },
      error: (err) => this.toast.error(err.error?.message || 'Error al eliminar inventario')
    });
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      BORRADOR: 'Borrador',
      EN_CONTEO: 'En Conteo',
      POR_VALIDAR: 'Por Validar',
      CERRADO_EXITO: 'Cerrado · Éxito',
      CERRADO_NO_EXITO: 'Cerrado · Con Incidencias',
      REABIERTO: 'Reabierto'
    };
    return map[status] || status;
  }

  statusBadgeClass(status: string): string {
    switch (status) {
      case 'CERRADO_EXITO': return 'badge-success';
      case 'CERRADO_NO_EXITO': return 'badge-danger';
      case 'REABIERTO': return 'badge-warning';
      case 'EN_CONTEO': return 'badge-info';
      default: return 'badge-neutral';
    }
  }

  exportingStats = signal(false);

  exportStatsExcel() {
    const s = this.selectedSession();
    if (!s) {
      this.toast.warning('Selecciona una sesión de inventario primero');
      return;
    }

    this.exportingStats.set(true);
    this.api.downloadDashboardStatsExcel(s.id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        a.download = `Estadisticas_Inventario_${s.folio}_${dateStr}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.exportingStats.set(false);
        this.toast.success(`Estadísticas de ${s.folio} exportadas a Excel exitosamente`);
      },
      error: (err) => {
        this.exportingStats.set(false);
        this.toast.error(err.error?.message || 'Error al exportar reporte de estadísticas en Excel');
      }
    });
  }
}
