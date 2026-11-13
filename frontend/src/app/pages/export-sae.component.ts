import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService, InventorySessionSummary, ShelfAssignmentDto, SaeExportLogDto } from '../services/api.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-export-sae',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="export-container">
      <!-- Header -->
      <div class="export-header">
        <div>
          <span class="export-kicker">GENERACIÓN DE ARCHIVOS PARA ASPEL SAE</span>
          <h1 class="page-title">Exportación de Inventario y Partidas (PI)</h1>
          <p class="page-subtitle" *ngIf="session() as s">
            Folio: <span class="mono fw-700">{{ s.folio }}</span> &bull; Archivos directos en formato <code>CVE_ART,ALMACEN,CANTIDAD</code>
          </p>
        </div>

        <div class="header-actions">
          <select class="select session-picker" [ngModel]="selectedSessionId()" (ngModelChange)="onSessionChange($event)">
            <option *ngFor="let s of sessions()" [value]="s.id">{{ s.folio }} — {{ s.title }}</option>
          </select>
        </div>
      </div>

      <!-- Scope Selector Card -->
      <div class="scope-card">
        <div class="scope-row">
          <div class="scope-col">
            <label class="scope-label">Alcance de la Exportación</label>
            <select class="select" [(ngModel)]="selectedShelfId">
              <option [ngValue]="0">Consolidado Global (Todos los anaqueles &bull; Para Partidas de Inventario PI)</option>
              <option *ngFor="let sh of shelves()" [ngValue]="sh.shelfId">
                Por Anaquel: [{{ sh.plant || 'Planta 1' }}] {{ sh.shelfCode }} &bull; {{ sh.shelfZone }} ({{ sh.totalPieces }} pzas)
              </option>
            </select>
          </div>

          <div class="scope-badge-box">
            <span class="scope-hint-title">Estructura Existencia Física</span>
            <span class="mono scope-hint-val">ESTATUS | TIPO | CLAVE | CLAVE ESQ | EXISTENCIA FÍSICA</span>
          </div>
        </div>
      </div>

      <!-- Statistics Panel -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <span class="kpi-label">Tasa de Éxito en SAE</span>
          <span class="kpi-value text-success">{{ successRate() }}%</span>
          <span class="kpi-hint">{{ successCount() }} de {{ history().length }} exportaciones importadas</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Exportaciones Realizadas</span>
          <span class="kpi-value">{{ history().length }}</span>
          <span class="kpi-hint">Archivos Excel / CSV / TXT generados</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Partidas Procesadas</span>
          <span class="kpi-value mono text-primary-brand">{{ totalExportedRows() | number }}</span>
          <span class="kpi-hint">Registros exportados en histórico</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Incidencias Reportadas</span>
          <span class="kpi-value" [class.text-danger]="errorCount() > 0">{{ errorCount() }}</span>
          <span class="kpi-hint">{{ pendingCount() }} pendientes de confirmación en SAE</span>
        </div>
      </div>

      <!-- Export Action Cards -->
      <div class="export-cards-grid">
        <!-- Card 1: Official Excel Format (.xlsx) with Colored Headers -->
        <div class="card export-card card-featured">
          <div class="card-top">
            <div class="icon-wrap icon-excel">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="8" y1="13" x2="16" y2="13"></line>
                <line x1="8" y1="17" x2="16" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div>
              <div class="badge-featured">RECOMENDADO OFICIAL</div>
              <h3 class="export-title">Excel (.xlsx) &bull; Formato Existencia Física</h3>
              <span class="muted font-xs">Cabeceras a color (Azul, Amarillo, Cyan) y pestaña de Auditoría</span>
            </div>
          </div>
          <p class="export-desc">
            Formato oficial con columnas <strong>ESTATUS</strong>, <strong>TIPO DE ELEMENTO</strong>, <strong>CLAVE</strong>, <strong>CLAVE ESQ</strong> y <strong>EXISTENCIA FÍSICA</strong>. Incluye segunda hoja con desglose por anaquel.
          </p>
          <button class="btn btn-success btn-lg-action" (click)="download('EXCEL')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Descargar Excel Oficial (Existencia Física)
          </button>
        </div>

        <!-- Card 2: SAE CSV Format -->
        <div class="card export-card">
          <div class="card-top">
            <div class="icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0a2472" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
            </div>
            <div>
              <h3 class="export-title">Aspel SAE &bull; Formato CSV</h3>
              <span class="muted font-xs">Delimitado por comas con codificación UTF-8 BOM</span>
            </div>
          </div>
          <p class="export-desc">
            Recomendado para el módulo de <em>Inventario Físico</em> y generación masiva de <em>Partidas de Inventario (PI)</em> en Aspel SAE.
          </p>
          <button class="btn btn-primary" (click)="download('CSV')">
            Descargar SAE CSV ({{ selectedShelfId === 0 ? 'Consolidado' : 'Anaquel' }})
          </button>
        </div>

        <!-- Card 3: SAE TXT Tab Format -->
        <div class="card export-card">
          <div class="card-top">
            <div class="icon-wrap">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
            </div>
            <div>
              <h3 class="export-title">Aspel SAE &bull; Formato TXT (Tabuladores)</h3>
              <span class="muted font-xs">Estructura separada por tabulaciones</span>
            </div>
          </div>
          <p class="export-desc">
            Recomendado para el asistente directo de importación sin conflictos de configuración regional de Windows o delimitadores.
          </p>
          <button class="btn btn-accent" (click)="download('TXT')">
            Descargar SAE TXT ({{ selectedShelfId === 0 ? 'Consolidado' : 'Anaquel' }})
          </button>
        </div>
      </div>

      <!-- Export History & Verification Table -->
      <div class="card">
        <div class="history-header">
          <h3 class="section-title">Historial de Archivos Exportados y Estatus en SAE</h3>
          <span class="muted font-xs">Marca si la importación en Aspel SAE fue exitosa o presentó algún error para retroalimentar las estadísticas</span>
        </div>

        <div class="table-wrap">
          <table class="history-table">
            <thead>
              <tr>
                <th>Fecha y Hora</th>
                <th>Archivo Generado</th>
                <th>Formato</th>
                <th class="text-right">Partidas</th>
                <th>Responsable</th>
                <th>Estatus en SAE</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of history()">
                <td class="muted font-xs">{{ item.exportedAt | date:'dd/MM/yyyy HH:mm' }}</td>
                <td class="mono fw-600 font-sm">{{ item.fileName }}</td>
                <td><span class="format-pill">{{ item.format }}</span></td>
                <td class="mono fw-700 text-right">{{ item.totalRows | number }}</td>
                <td class="font-sm">{{ item.exportedBy?.fullName || 'Osiris' }}</td>
                <td>
                  <span class="badge" [ngClass]="badgeClass(item.importStatus)">
                    {{ statusLabel(item.importStatus) }}
                  </span>
                </td>
                <td>
                  <button
                    class="btn btn-sm btn-outline"
                    (click)="openStatusModal(item)"
                    title="Calificar si la importación fue exitosa o presentó error en SAE"
                  >
                    Calificar SAE
                  </button>
                </td>
              </tr>
              <tr *ngIf="history().length === 0">
                <td colspan="7" class="empty-cell">No se han registrado exportaciones para este folio todavía.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Feedback Modal -->
      <div class="modal-backdrop" *ngIf="selectedLogForFeedback" (click)="selectedLogForFeedback = null">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <h3>Calificar Resultado de Carga en Aspel SAE</h3>
          <p class="font-sm text-secondary">
            Archivo: <strong class="mono">{{ selectedLogForFeedback.fileName }}</strong>
          </p>

          <div class="form-group">
            <label class="label">Resultado de Importación en SAE</label>
            <div class="radio-row">
              <label class="radio-label">
                <input type="radio" [(ngModel)]="feedbackStatus" value="IMPORTADO_EXITO" />
                <span class="text-success font-bold">Importación Exitosa</span>
              </label>
              <label class="radio-label">
                <input type="radio" [(ngModel)]="feedbackStatus" value="IMPORTADO_CON_ERROR" />
                <span class="text-danger font-bold">Error en SAE</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label class="label">Observaciones / Folio de PIs en SAE</label>
            <textarea
              class="textarea"
              rows="3"
              [(ngModel)]="feedbackNotes"
              placeholder="Ej. Importado exitosamente en SAE; generado folio PI-0042 sin rechazos."
            ></textarea>
          </div>

          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="selectedLogForFeedback = null">Cancelar</button>
            <button class="btn btn-primary" (click)="saveFeedback()">Guardar en Historial</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .export-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .export-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
    }

    .export-kicker {
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

    .session-picker {
      height: 38px;
      padding: 0 0.75rem;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.85rem;
    }

    /* Scope Card */
    .scope-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 1rem 1.25rem;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
    }

    .scope-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1.5rem;
      flex-wrap: wrap;
    }

    .scope-col {
      flex: 1;
      min-width: 320px;
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .scope-label {
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      color: #475569;
      letter-spacing: 0.03em;
    }

    .scope-badge-box {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 0.5rem 0.85rem;
    }

    .scope-hint-title {
      font-size: 0.68rem;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
    }

    .scope-hint-val {
      font-size: 0.85rem;
      font-weight: 700;
      color: #0a2472;
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
    .text-success { color: #059669; }
    .text-danger { color: #dc2626; }

    /* Export Cards Grid */
    .export-cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      gap: 1.25rem;
    }

    .export-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 1.25rem;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .export-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px -3px rgba(15, 23, 42, 0.08);
    }

    .card-featured {
      border: 2px solid #059669;
      background: linear-gradient(180deg, #ffffff 0%, #f0fdf4 100%);
      position: relative;
    }
    .badge-featured {
      display: inline-block;
      font-size: 0.65rem;
      font-weight: 800;
      color: #059669;
      background: #dcfce7;
      border: 1px solid #bbf7d0;
      padding: 2px 8px;
      border-radius: 4px;
      margin-bottom: 4px;
      letter-spacing: 0.04em;
    }
    .icon-excel {
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
    }
    .btn-lg-action {
      font-size: 0.92rem;
      font-weight: 700;
      padding: 0.7rem 1.25rem;
    }

    .card-top {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .icon-wrap {
      width: 44px;
      height: 44px;
      background: #f1f5f9;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .export-title {
      margin: 0 0 2px 0;
      font-size: 1.05rem;
      font-weight: 700;
      color: #0f172a;
    }

    .export-desc {
      font-size: 0.85rem;
      color: #475569;
      line-height: 1.55;
      margin: 0;
    }

    /* History Table */
    .history-header {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .section-title {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 700;
      color: #0f172a;
    }

    .history-table {
      width: 100%;
      min-width: 820px;
      border-collapse: collapse;
      font-size: 0.88rem;
    }

    .history-table th {
      background: #f8fafc;
      color: #475569;
      font-size: 0.75rem;
      text-transform: uppercase;
      font-weight: 700;
      padding: 0.65rem 1rem;
      border-bottom: 1.5px solid #e2e8f0;
      text-align: left;
    }

    .history-table td {
      padding: 0.65rem 1rem;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }

    .format-pill {
      font-size: 0.72rem;
      font-weight: 700;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .badge {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.2rem 0.55rem;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .badge-success { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .badge-danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .badge-secondary { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 1rem;
    }
    .modal-box {
      background: #ffffff;
      border-radius: 12px;
      width: 100%;
      max-width: 480px;
      padding: 1.5rem;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .radio-row { display: flex; gap: 1.5rem; margin-top: 0.5rem; }
    .radio-label { display: flex; align-items: center; gap: 0.35rem; cursor: pointer; }
    .modal-footer { display: flex; justify-content: flex-end; gap: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #e2e8f0; }
  `]
})
export class ExportSaeComponent implements OnInit {
  sessions = signal<InventorySessionSummary[]>([]);
  selectedSessionId = signal<number>(0);
  shelves = signal<ShelfAssignmentDto[]>([]);
  selectedShelfId: number = 0; // 0 = Consolidado Global

  history = signal<SaeExportLogDto[]>([]);
  selectedLogForFeedback: SaeExportLogDto | null = null;
  feedbackStatus: 'IMPORTADO_EXITO' | 'IMPORTADO_CON_ERROR' = 'IMPORTADO_EXITO';
  feedbackNotes = '';

  session = computed(() => this.sessions().find(s => s.id === this.selectedSessionId()));

  successCount = computed(() => this.history().filter(h => h.importStatus === 'IMPORTADO_EXITO').length);
  errorCount = computed(() => this.history().filter(h => h.importStatus === 'IMPORTADO_CON_ERROR').length);
  pendingCount = computed(() => this.history().filter(h => h.importStatus === 'GENERADO').length);

  successRate = computed(() => {
    const totalWithFeedback = this.successCount() + this.errorCount();
    if (totalWithFeedback === 0) return 100;
    return Math.round((this.successCount() / totalWithFeedback) * 100);
  });

  totalExportedRows = computed(() => {
    return this.history().reduce((sum, h) => sum + (h.totalRows || 0), 0);
  });

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.api.getSessions().subscribe({
      next: (sessions) => {
        this.sessions.set(sessions);
        if (sessions.length > 0) {
          this.route.queryParams.subscribe(params => {
            const sid = params['sessionId'] ? Number(params['sessionId']) : sessions[0].id;
            this.selectedSessionId.set(sid);
            this.loadShelvesAndHistory(sid);
          });
        }
      },
      error: (err) => this.toast.error('Error al cargar inventarios: ' + (err.error?.message || err.message))
    });
  }

  onSessionChange(id: number) {
    this.selectedSessionId.set(Number(id));
    this.selectedShelfId = 0;
    this.loadShelvesAndHistory(Number(id));
  }

  loadShelvesAndHistory(sessionId: number) {
    this.api.getSessionShelves(sessionId).subscribe({
      next: (shs) => this.shelves.set(shs),
      error: () => {}
    });

    this.api.getExportHistory(sessionId).subscribe({
      next: (hist) => this.history.set(hist),
      error: (err) => this.toast.error('Error al cargar historial: ' + (err.error?.message || err.message))
    });
  }

  download(format: 'EXCEL' | 'CSV' | 'TXT') {
    const sid = this.selectedSessionId();
    if (sid === 0) return;

    this.api.downloadSaeExport(sid, format, 'EXISTENCIA_FISICA', this.selectedShelfId).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const targetShelf = this.shelves().find(s => s.shelfId === this.selectedShelfId);
        const scopeTag = targetShelf ? `ANAQUEL_${targetShelf.shelfCode}` : `CONSOLIDADO_GLOBAL_${this.session()?.folio || 'INV'}`;
        const ext = format === 'EXCEL' ? 'xlsx' : format.toLowerCase();
        const prefix = format === 'EXCEL' ? 'EXISTENCIA_FISICA' : 'SAE';
        a.download = `${prefix}_${scopeTag}.${ext}`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.success(`Archivo ${format === 'EXCEL' ? 'Excel (Existencia Física)' : format} generado con éxito.`);
        this.loadShelvesAndHistory(sid);
      },
      error: (err) => this.toast.error('Error al generar exportación: ' + (err.error?.message || err.message))
    });
  }

  openStatusModal(log: SaeExportLogDto) {
    this.selectedLogForFeedback = log;
    this.feedbackStatus = log.importStatus === 'IMPORTADO_CON_ERROR' ? 'IMPORTADO_CON_ERROR' : 'IMPORTADO_EXITO';
    this.feedbackNotes = log.reconciliationNotes || '';
  }

  saveFeedback() {
    if (!this.selectedLogForFeedback) return;
    this.api.updateExportStatus(this.selectedLogForFeedback.id, this.feedbackStatus, this.feedbackNotes).subscribe({
      next: () => {
        this.toast.success('Resultado en SAE registrado en el historial.');
        this.selectedLogForFeedback = null;
        this.loadShelvesAndHistory(this.selectedSessionId());
      },
      error: (err) => this.toast.error('Error al registrar estatus: ' + (err.error?.message || err.message))
    });
  }

  badgeClass(status: string): string {
    if (status === 'IMPORTADO_EXITO') return 'badge-success';
    if (status === 'IMPORTADO_CON_ERROR') return 'badge-danger';
    return 'badge-secondary';
  }

  statusLabel(status: string): string {
    if (status === 'IMPORTADO_EXITO') return 'Éxito en SAE';
    if (status === 'IMPORTADO_CON_ERROR') return 'Error en SAE';
    return 'Pendiente Carga';
  }
}
