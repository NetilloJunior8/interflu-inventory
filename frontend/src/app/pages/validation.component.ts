import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, ValidationSummaryDto, DiscrepancyItem, InventorySessionSummary } from '../services/api.service';
import { ToastService } from '../services/toast.service';
import { PatternSuggesterService } from '../services/pattern-suggester.service';

@Component({
  selector: 'app-validation',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="qc-container">
      <!-- Header -->
      <div class="qc-header">
        <div>
          <span class="qc-kicker">CONTROL DE CALIDAD FÍSICO</span>
          <h1 class="qc-title">Revisión de Conteos y Materiales Validados</h1>
          <p class="qc-subtitle" *ngIf="summary() as s">
            Folio: <span class="mono fw-700">{{ s.folio }}</span> &bull; Inspección de piezas físicas y aseguramiento de catálogo
          </p>
        </div>

        <div class="header-actions">
          <select class="select session-picker" [ngModel]="selectedSessionId()" (ngModelChange)="onSessionChange($event)">
            <option *ngFor="let s of sessions()" [value]="s.id">{{ s.folio }} — {{ s.title }}</option>
          </select>
          <button class="btn btn-primary" (click)="saveToSystemMemory()" title="Guardar todos los códigos validados en la memoria histórica del sistema">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            Guardar en Memoria del Sistema
          </button>
        </div>
      </div>

      <!-- KPI Summary Cards (NO SAE EXISTENCIA, NO DIFERENCIA) -->
      <div class="kpi-grid" *ngIf="summary() as s">
        <div class="kpi-card">
          <span class="kpi-label">Artículos Físicos Únicos</span>
          <span class="kpi-value">{{ s.uniqueProducts }}</span>
          <span class="kpi-hint">Refacciones diferentes contadas</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Total Piezas Contabilizadas</span>
          <span class="kpi-value text-primary-brand mono">{{ s.totalPieces | number:'1.0-2' }}</span>
          <span class="kpi-hint">Piezas físicas reales en bodega</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Presencia Multi-Anaquel</span>
          <span class="kpi-value text-info">{{ s.duplicatesCount }}</span>
          <span class="kpi-hint">Ubicados en más de una zona física</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Refacciones Nuevas</span>
          <span class="kpi-value text-success">{{ s.inexistentCodesCount }}</span>
          <span class="kpi-hint">Registradas físicamente en anaquel</span>
        </div>
      </div>

      <!-- Verified Materials Table -->
      <div class="card">
        <div class="table-toolbar">
          <div class="filter-tabs">
            <button class="tab-btn" [class.active]="filter() === 'ALL'" (click)="filter.set('ALL')">
              Todos los Materiales ({{ summary()?.items?.length || 0 }})
            </button>
            <button class="tab-btn text-info" [class.active]="filter() === 'MULTI'" (click)="filter.set('MULTI')">
              Multi-Anaquel ({{ summary()?.duplicatesCount || 0 }})
            </button>
            <button class="tab-btn text-success" [class.active]="filter() === 'NEW'" (click)="filter.set('NEW')">
              Nuevos en Almacén ({{ summary()?.inexistentCodesCount || 0 }})
            </button>
          </div>

          <div class="search-box">
            <input class="input mono" [(ngModel)]="searchTerm" placeholder="Buscar por código de refacción..." />
          </div>
        </div>

        <div class="table-wrap">
          <table class="qc-table">
            <thead>
              <tr>
                <th class="th-code">Código / Clave Material</th>
                <th class="th-unit">Unidad</th>
                <th class="th-shelves">Ubicación Física (Anaqueles)</th>
                <th class="th-qty text-right">Piezas Físicas</th>
                <th class="th-status">Estatus de Calidad</th>
                <th class="th-mem">Memoria del Sistema</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of filteredItems()">
                <td class="mono fw-700 text-primary">{{ item.code }}</td>
                <td>{{ item.unit }}</td>
                <td>
                  <div class="shelves-tags">
                    <span class="shelf-tag mono" *ngFor="let sh of item.shelvesList">{{ sh }}</span>
                  </div>
                </td>
                <td class="mono fw-700 text-right font-lg text-primary-brand">
                  {{ item.countedTotal | number:'1.0-2' }}
                </td>
                <td>
                  <span class="badge" [ngClass]="statusBadgeClass(item)">
                    {{ statusBadgeLabel(item) }}
                  </span>
                </td>
                <td>
                  <span class="memory-badge" [class.active]="isInMemory(item.code)">
                    {{ isInMemory(item.code) ? 'Memorizado' : 'Pendiente' }}
                  </span>
                </td>
              </tr>
              <tr *ngIf="filteredItems().length === 0">
                <td colspan="6" class="empty-cell">No se encontraron artículos que coincidan con el filtro.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .qc-container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .qc-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
    }

    .qc-kicker {
      font-size: 0.72rem;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      display: block;
      margin-bottom: 2px;
    }

    .qc-title {
      font-size: 1.5rem;
      font-weight: 800;
      color: var(--text-primary, #0f172a);
      margin: 0 0 4px 0;
    }

    .qc-subtitle {
      margin: 0;
      color: var(--text-muted, #64748b);
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

    /* Card & Toolbar */
    .card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
      overflow: hidden;
    }

    .table-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1.25rem;
      border-bottom: 1px solid #e2e8f0;
      background: #f8fafc;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .filter-tabs {
      display: flex;
      gap: 0.35rem;
    }

    .tab-btn {
      background: transparent;
      border: 1px solid transparent;
      border-radius: 6px;
      padding: 0.4rem 0.75rem;
      font-size: 0.8rem;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s;
    }
    .tab-btn:hover { background: #f1f5f9; }
    .tab-btn.active {
      background: #ffffff;
      border-color: #cbd5e1;
      color: #0f172a;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
    }

    .search-box .input {
      height: 34px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 0 0.75rem;
      font-size: 0.82rem;
      width: 240px;
    }

    /* Table with High Visibility Scrollbars */
    .table-wrap {
      overflow-x: auto;
      scrollbar-width: thin;
      scrollbar-color: #94a3b8 #f1f5f9;
      width: 100%;
    }

    .qc-table {
      width: 100%;
      min-width: 1100px;
      border-collapse: collapse;
      font-size: 0.88rem;
    }

    .qc-table th {
      background: #f8fafc;
      color: #475569;
      font-size: 0.75rem;
      text-transform: uppercase;
      font-weight: 700;
      padding: 0.65rem 1rem;
      border-bottom: 1.5px solid #e2e8f0;
      text-align: left;
    }

    .qc-table td {
      padding: 0.65rem 1rem;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }

    .qc-table tr:hover {
      background: #f8fafc;
    }

    .th-code { width: 300px; }
    .th-unit { width: 90px; }
    .th-shelves { width: 340px; }
    .th-qty { width: 160px; }
    .th-status { width: 170px; }
    .th-mem { width: 140px; }

    .shelves-tags {
      display: flex;
      gap: 0.35rem;
      flex-wrap: wrap;
    }

    .shelf-tag {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 0.15rem 0.45rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #1e293b;
    }

    .badge {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 0.2rem 0.55rem;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .badge-ok { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .badge-multi { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .badge-new { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }

    .memory-badge {
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.15rem 0.45rem;
      border-radius: 9999px;
      background: #f1f5f9;
      color: #64748b;
    }
    .memory-badge.active {
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
    }

    .empty-cell {
      text-align: center;
      padding: 2.5rem;
      color: #94a3b8;
    }
  `]
})
export class ValidationComponent implements OnInit {
  sessions = signal<InventorySessionSummary[]>([]);
  selectedSessionId = signal<number>(0);
  summary = signal<ValidationSummaryDto | null>(null);

  filter = signal<'ALL' | 'MULTI' | 'NEW'>('ALL');
  searchTerm = '';

  private memorySet = new Set<string>();

  filteredItems = computed(() => {
    const s = this.summary();
    if (!s) return [];
    let items = s.items || [];

    const f = this.filter();
    if (f === 'MULTI') {
      items = items.filter(i => i.shelfOccurrences > 1);
    } else if (f === 'NEW') {
      items = items.filter(i => !i.existsInCatalog);
    }

    if (this.searchTerm.trim()) {
      const q = this.searchTerm.trim().toUpperCase();
      items = items.filter(i => i.code.toUpperCase().includes(q));
    }

    return items;
  });

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private patternSuggester: PatternSuggesterService
  ) {}

  ngOnInit() {
    this.loadMemory();
    this.api.getSessions().subscribe({
      next: (data) => {
        this.sessions.set(data);
        if (data.length > 0) {
          this.selectedSessionId.set(data[0].id);
          this.loadSummary(data[0].id);
        }
      },
      error: (err) => this.toast.error('Error al cargar inventarios: ' + (err.error?.message || err.message))
    });
  }

  loadMemory() {
    try {
      const stored = localStorage.getItem('interflu_verified_materials_memory');
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          arr.forEach(c => this.memorySet.add(String(c).toUpperCase().trim()));
        }
      }
    } catch {}
  }

  onSessionChange(id: number) {
    this.selectedSessionId.set(Number(id));
    this.loadSummary(Number(id));
  }

  loadSummary(sessionId: number) {
    this.api.getValidationSummary(sessionId).subscribe({
      next: (data) => {
        this.summary.set(data);
      },
      error: (err) => this.toast.error('Error al cargar control de calidad: ' + (err.error?.message || err.message))
    });
  }

  saveToSystemMemory() {
    const s = this.summary();
    if (!s || !s.items || s.items.length === 0) {
      this.toast.error('No hay materiales para memorizar.');
      return;
    }

    const codes = s.items.map(i => i.code.trim().toUpperCase());
    codes.forEach(c => this.memorySet.add(c));

    try {
      localStorage.setItem('interflu_verified_materials_memory', JSON.stringify(Array.from(this.memorySet)));
    } catch {}

    this.patternSuggester.learnBulk(codes);
    this.toast.success(`${codes.length} materiales físicos guardados en la memoria histórica del sistema.`);
  }

  isInMemory(code: string): boolean {
    return this.memorySet.has(code.trim().toUpperCase());
  }

  statusBadgeClass(item: DiscrepancyItem): string {
    if (item.shelfOccurrences > 1) return 'badge-multi';
    if (!item.existsInCatalog) return 'badge-new';
    return 'badge-ok';
  }

  statusBadgeLabel(item: DiscrepancyItem): string {
    if (item.shelfOccurrences > 1) return `Multi-Anaquel (${item.shelfOccurrences})`;
    if (!item.existsInCatalog) return 'Nuevo en Almacén';
    return 'Físico Verificado';
  }
}
