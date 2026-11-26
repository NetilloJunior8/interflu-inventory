import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { ApiService, InventorySessionSummary } from '../services/api.service';
import { ToastService } from '../services/toast.service';

export interface StockAlertItem {
  code: string;
  description: string;
  stockActual: number;
  minimoSeguridad: number;
  puntoReorden: number;
  maximoObjetivo: number;
  cuantoPedir: number;
  isCustomThresholds?: boolean;
  customMinStock?: number;
  customReorderPoint?: number;
  customMaxStock?: number;
  status: 'CRITICO' | 'POR_REORDENAR' | 'SOBRESTOCK' | 'OPTIMO';
  statusLabel: string;
  severity: 'danger' | 'warning' | 'info' | 'success';
  zone: string;
  plant: string;
  shelfCode: string;
  shelfId?: number;
  locationCode: string;
  unit: string;
  recordCount: number;
}

export interface StockAlertsData {
  sessionId: number;
  sessionFolio: string;
  totalAlerts: number;
  totalProducts: number;
  criticalCount: number;
  reorderCount: number;
  overstockCount: number;
  optimalCount: number;
  items: StockAlertItem[];
}

@Component({
  selector: 'app-stock-alerts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  template: `
    <div class="stock-alerts-page">
      <!-- Top Bar / Breadcrumb / Actions -->
      <header class="page-header">
        <div class="header-left">
          <div class="header-tag">
            <span class="pulse-indicator" [class.has-critical]="data()?.criticalCount && (data()?.criticalCount || 0) > 0"></span>
            <span>Módulo de Control y Reabastecimiento</span>
          </div>
          <h1 class="page-title">Avisos de Stock Físico & Punto de Reorden</h1>
          <p class="page-subtitle">
            Monitoreo en tiempo real de refacciones en niveles críticos, existencias mínimas de seguridad y sugerencias de reabastecimiento para el almacén central.
          </p>
        </div>

        <div class="header-actions">
          <!-- Session Selector -->
          <div class="session-picker" *ngIf="sessions().length > 1">
            <label class="picker-label">Sesión:</label>
            <select class="select-control" [ngModel]="selectedSessionId()" (ngModelChange)="onSessionChange($event)">
              <option *ngFor="let s of sessions()" [value]="s.id">{{ s.folio }} ({{ s.status }})</option>
            </select>
          </div>

          <button class="btn-action btn-refresh" (click)="loadData()" [disabled]="isLoading()" title="Actualizar datos">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" [class.spinning]="isLoading()">
              <polyline points="23 4 23 10 17 10"></polyline>
              <polyline points="1 20 1 14 7 14"></polyline>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
            <span>Actualizar</span>
          </button>

          <!-- PLANTILLA Button (Punto 9) -->
          <button class="btn-action btn-plantilla" (click)="downloadPlantilla()" [disabled]="downloadingTemplate()" title="Descargar plantilla oficial Excel con formato para importar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="18" x2="12" y2="12"></line>
              <line x1="9" y1="15" x2="12" y2="18"></line>
              <line x1="15" y1="15" x2="12" y2="18"></line>
            </svg>
            <span>{{ downloadingTemplate() ? 'Descargando...' : 'PLANTILLA' }}</span>
          </button>

          <!-- ORDEN DE COMPRA (.xlsx) Button (Punto 3) -->
          <button class="btn-action btn-po-excel" (click)="downloadPurchaseOrderExcel()" [disabled]="isLoading() || filteredItems().length === 0 || downloadingPo()" title="Descargar reporte oficial en Excel (.xlsx) para generar Orden de Compra en SAE">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
            <span>{{ downloadingPo() ? 'Generando...' : 'Orden de Compra (.xlsx)' }}</span>
          </button>

          <button class="btn-action btn-export" (click)="exportAlertsCsv()" [disabled]="isLoading() || filteredItems().length === 0" title="Exportar a CSV">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Exportar CSV</span>
          </button>
        </div>
      </header>

      <!-- KPI Summary Cards -->
      <section class="kpi-grid">
        <div class="kpi-card kpi-danger" (click)="setStatusFilter('CRITICO')" [class.selected]="statusFilter() === 'CRITICO'">
          <div class="kpi-header">
            <span class="kpi-title">Stock Mínimo / Crítico</span>
            <div class="kpi-icon icon-danger">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
          </div>
          <div class="kpi-value">{{ data()?.criticalCount ?? 0 }}</div>
          <div class="kpi-caption">Existencia &le; Mínimo de seguridad</div>
        </div>

        <div class="kpi-card kpi-warning" (click)="setStatusFilter('POR_REORDENAR')" [class.selected]="statusFilter() === 'POR_REORDENAR'">
          <div class="kpi-header">
            <span class="kpi-title">Punto de Reorden</span>
            <div class="kpi-icon icon-warning">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
              </svg>
            </div>
          </div>
          <div class="kpi-value">{{ data()?.reorderCount ?? 0 }}</div>
          <div class="kpi-caption">Próximos a agotarse</div>
        </div>

        <div class="kpi-card kpi-info" (click)="setStatusFilter('SOBRESTOCK')" [class.selected]="statusFilter() === 'SOBRESTOCK'">
          <div class="kpi-header">
            <span class="kpi-title">Sobrestock / Excedente</span>
            <div class="kpi-icon icon-info">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                <polyline points="2 17 12 22 22 17"></polyline>
                <polyline points="2 12 12 17 22 12"></polyline>
              </svg>
            </div>
          </div>
          <div class="kpi-value">{{ data()?.overstockCount ?? 0 }}</div>
          <div class="kpi-caption">Existencia &gt; Máximo objetivo</div>
        </div>

        <div class="kpi-card kpi-success" (click)="setStatusFilter('OPTIMO')" [class.selected]="statusFilter() === 'OPTIMO'">
          <div class="kpi-header">
            <span class="kpi-title">Stock Óptimo</span>
            <div class="kpi-icon icon-success">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
          </div>
          <div class="kpi-value">{{ data()?.optimalCount ?? 0 }}</div>
          <div class="kpi-caption">Dentro del rango de operación</div>
        </div>

        <div class="kpi-card kpi-total" (click)="setStatusFilter('TODOS')" [class.selected]="statusFilter() === 'TODOS'">
          <div class="kpi-header">
            <span class="kpi-title">Total Artículos</span>
            <div class="kpi-icon icon-total">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="3" y1="9" x2="21" y2="9"></line>
                <line x1="9" y1="21" x2="9" y2="9"></line>
              </svg>
            </div>
          </div>
          <div class="kpi-value">{{ data()?.totalProducts ?? 0 }}</div>
          <div class="kpi-caption">Refacciones inventariadas</div>
        </div>
      </section>

      <!-- Filter Ribbon -->
      <section class="filter-bar">
        <div class="filter-pills">
          <button class="pill" [class.active]="statusFilter() === 'TODOS'" (click)="setStatusFilter('TODOS')">
            Todos ({{ data()?.totalProducts ?? 0 }})
          </button>
          <button class="pill pill-alert" [class.active]="statusFilter() === 'ALERTAS'" (click)="setStatusFilter('ALERTAS')">
            Solo Alertas ({{ (data()?.criticalCount ?? 0) + (data()?.reorderCount ?? 0) }})
          </button>
          <button class="pill pill-danger" [class.active]="statusFilter() === 'CRITICO'" (click)="setStatusFilter('CRITICO')">
            Crítico / Mínimo ({{ data()?.criticalCount ?? 0 }})
          </button>
          <button class="pill pill-warning" [class.active]="statusFilter() === 'POR_REORDENAR'" (click)="setStatusFilter('POR_REORDENAR')">
            Reorden ({{ data()?.reorderCount ?? 0 }})
          </button>
          <button class="pill pill-info" [class.active]="statusFilter() === 'SOBRESTOCK'" (click)="setStatusFilter('SOBRESTOCK')">
            Sobrestock ({{ data()?.overstockCount ?? 0 }})
          </button>
          <button class="pill pill-success" [class.active]="statusFilter() === 'OPTIMO'" (click)="setStatusFilter('OPTIMO')">
            Óptimo ({{ data()?.optimalCount ?? 0 }})
          </button>
        </div>

        <div class="search-and-select">
          <div class="search-box">
            <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              class="search-input"
              [(ngModel)]="searchQuery"
              placeholder="Buscar por clave SAE o descripción..."
            />
            <button class="clear-search" *ngIf="searchQuery" (click)="searchQuery = ''" title="Limpiar búsqueda">✕</button>
          </div>

          <div class="zone-selector" *ngIf="availableZones().length > 1">
            <select class="select-control zone-select" [(ngModel)]="selectedZone">
              <option value="">Todas las Familias / Zonas</option>
              <option *ngFor="let z of availableZones()" [value]="z">{{ z }}</option>
            </select>
          </div>
        </div>
      </section>

      <!-- Main Data Table -->
      <section class="table-container">
        <div class="table-meta">
          <span class="results-count">
            Mostrando <strong>{{ filteredItems().length }}</strong> de <strong>{{ data()?.totalProducts ?? 0 }}</strong> productos
          </span>
          <span class="session-tag" *ngIf="data()?.sessionFolio">
            Folio activo: <strong>{{ data()?.sessionFolio }}</strong>
          </span>
        </div>

        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th class="col-status">Estado</th>
                <th class="col-code">Clave Material</th>
                <th class="col-desc">Descripción</th>
                <th class="col-shelf">Ubicación Física</th>
                <th class="col-qty text-right">Stock Físico</th>
                <th class="col-min text-right">Mínimo</th>
                <th class="col-reorder text-right">Pto. Reorden</th>
                <th class="col-max text-right">Máximo</th>
                <th class="col-order text-right">Sugerido Pedir</th>
                <th class="col-actions text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of paginatedItems()" [ngClass]="'row-' + item.severity">
                <td class="col-status">
                  <span class="status-badge" [ngClass]="'badge-' + item.severity">
                    <span class="status-dot"></span>
                    {{ item.statusLabel }}
                  </span>
                </td>
                <td class="col-code">
                  <span class="code-pill font-mono">{{ item.code }}</span>
                </td>
                <td class="col-desc">
                  <div class="desc-text" [title]="item.description">{{ item.description }}</div>
                  <div class="desc-sub" *ngIf="item.zone">
                    <span class="zone-badge">{{ item.zone }}</span>
                    <span class="plant-badge" *ngIf="item.plant">{{ item.plant }}</span>
                  </div>
                </td>
                <td class="col-shelf">
                  <div class="shelf-pill" [title]="'Anaquel: ' + item.shelfCode">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                      <path d="M3 9h18"></path>
                    </svg>
                    <span>{{ item.shelfCode || 'Sin Asignar' }}</span>
                  </div>
                  <div class="location-detail" *ngIf="item.locationCode && item.locationCode !== item.shelfCode">
                    {{ item.locationCode }}
                  </div>
                </td>
                <td class="col-qty text-right">
                  <span class="qty-number" [ngClass]="'qty-' + item.severity">
                    {{ item.stockActual | number:'1.0-2' }}
                  </span>
                  <span class="unit-text">{{ item.unit }}</span>
                </td>
                <td class="col-min text-right font-mono">
                  <span>{{ item.minimoSeguridad }}</span>
                  <span class="custom-badge" *ngIf="item.isCustomThresholds" title="Umbral personalizado manualmente">M</span>
                </td>
                <td class="col-reorder text-right font-mono">{{ item.puntoReorden }}</td>
                <td class="col-max text-right font-mono">{{ item.maximoObjetivo }}</td>
                <td class="col-order text-right">
                  <span class="order-badge" *ngIf="item.cuantoPedir > 0">
                    +{{ item.cuantoPedir }} {{ item.unit }}
                  </span>
                  <span class="order-zero" *ngIf="item.cuantoPedir === 0">0</span>
                </td>
                <td class="col-actions text-center">
                  <div class="action-buttons-group">
                    <button class="btn-sm btn-threshold" (click)="openThresholdEditor(item)" title="Modificar avisos de stock manualmente">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                      </svg>
                    </button>
                    <button class="btn-sm btn-detail" (click)="openDetail(item)" title="Ver ficha técnica">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="16" x2="12" y2="12"></line>
                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                      </svg>
                    </button>
                    <button class="btn-sm btn-croquis" (click)="goToCroquis(item)" title="Ver en croquis PB/PA">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                        <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                        <path d="M3 9h18"></path>
                        <path d="M9 21V9"></path>
                      </svg>
                    </button>
                    <button class="btn-sm btn-capture" (click)="goToCapture(item)" title="Ir a Cédula de Conteo">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>

              <tr *ngIf="filteredItems().length === 0 && !isLoading()">
                <td colspan="10" class="empty-state">
                  <div class="empty-content">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                      <circle cx="12" cy="12" r="10"></circle>
                      <line x1="12" y1="8" x2="12" y2="12"></line>
                      <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <p class="empty-title">No se encontraron productos con los filtros seleccionados</p>
                    <p class="empty-subtitle">Intenta cambiar el estado de filtro o borrar el texto de búsqueda.</p>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Bar -->
        <div class="pagination-bar" *ngIf="filteredItems().length > pageSize">
          <div class="pagination-info">
            Página {{ currentPage() }} de {{ totalPages() }} ({{ filteredItems().length }} artículos)
          </div>
          <div class="pagination-controls">
            <button class="btn-page" [disabled]="currentPage() === 1" (click)="currentPage.set(1)">«</button>
            <button class="btn-page" [disabled]="currentPage() === 1" (click)="currentPage.set(currentPage() - 1)">‹</button>
            <span class="page-current">{{ currentPage() }}</span>
            <button class="btn-page" [disabled]="currentPage() === totalPages()" (click)="currentPage.set(currentPage() + 1)">›</button>
            <button class="btn-page" [disabled]="currentPage() === totalPages()" (click)="currentPage.set(totalPages())">»</button>
          </div>
        </div>
      </section>

      <!-- Detail Modal -->
      <div class="modal-backdrop" *ngIf="selectedDetailItem()" (click)="selectedDetailItem.set(null)">
        <div class="modal-card" (click)="$event.stopPropagation()" *ngIf="selectedDetailItem() as item">
          <div class="modal-header">
            <div class="modal-title-wrap">
              <span class="status-badge" [ngClass]="'badge-' + item.severity">
                {{ item.statusLabel }}
              </span>
              <h2 class="modal-title font-mono">{{ item.code }}</h2>
            </div>
            <button class="modal-close" (click)="selectedDetailItem.set(null)">✕</button>
          </div>

          <div class="modal-body">
            <div class="detail-description">{{ item.description }}</div>

            <div class="detail-grid">
              <div class="detail-item">
                <span class="detail-label">Existencia Actual</span>
                <span class="detail-value text-bold" [ngClass]="'qty-' + item.severity">
                  {{ item.stockActual }} {{ item.unit }}
                </span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Sugerencia Reorden</span>
                <span class="detail-value text-bold text-reorder">
                  {{ item.cuantoPedir > 0 ? '+ ' + item.cuantoPedir + ' ' + item.unit : 'Abastecimiento Cubierto' }}
                </span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Mínimo Seguridad</span>
                <span class="detail-value font-mono">
                  {{ item.minimoSeguridad }} {{ item.unit }}
                  <span class="custom-badge" *ngIf="item.isCustomThresholds">Manual</span>
                </span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Punto de Reorden</span>
                <span class="detail-value font-mono">{{ item.puntoReorden }} {{ item.unit }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Máximo Objetivo</span>
                <span class="detail-value font-mono">{{ item.maximoObjetivo }} {{ item.unit }}</span>
              </div>
              <div class="detail-item">
                <span class="detail-label">Familia / Zona</span>
                <span class="detail-value">{{ item.zone || 'Almacén Central' }} ({{ item.plant }})</span>
              </div>
              <div class="detail-item full-span">
                <span class="detail-label">Anaquel(es) Físico(s)</span>
                <span class="detail-value">{{ item.shelfCode }}</span>
              </div>
              <div class="detail-item full-span" *ngIf="item.locationCode">
                <span class="detail-label">Detalle de Ubicación / Nivel</span>
                <span class="detail-value font-mono">{{ item.locationCode }}</span>
              </div>
            </div>

            <!-- Visual Stock Gauge -->
            <div class="stock-gauge-card">
              <div class="gauge-labels">
                <span>0</span>
                <span class="gauge-marker marker-min">Mínimo: {{ item.minimoSeguridad }}</span>
                <span class="gauge-marker marker-reorder">Reorden: {{ item.puntoReorden }}</span>
                <span>Máx: {{ item.maximoObjetivo }}</span>
              </div>
              <div class="gauge-bar-track">
                <div class="gauge-bar-fill" [ngClass]="'fill-' + item.severity" [style.width.%]="calcGaugeWidth(item)"></div>
              </div>
            </div>

            <!-- Manual Stock Thresholds Editor (Punto 7) -->
            <div class="thresholds-editor-card">
              <div class="editor-header">
                <div class="editor-title">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                  </svg>
                  <span>Modificar Avisos de Stock Manualmente</span>
                </div>
                <span class="badge-custom-tag" *ngIf="item.isCustomThresholds">MODIFICADO MANUAL</span>
              </div>
              <p class="editor-help">Establece valores específicos para mínimo, reorden y máximo para este código en lugar del cálculo automático.</p>
              <div class="editor-inputs-grid">
                <div class="input-field-col">
                  <label class="input-lbl">Mínimo de Seguridad:</label>
                  <input type="number" min="0" step="1" class="num-input" [(ngModel)]="editMinStock" placeholder="Ej. 10" />
                </div>
                <div class="input-field-col">
                  <label class="input-lbl">Punto de Reorden:</label>
                  <input type="number" min="0" step="1" class="num-input" [(ngModel)]="editReorderPoint" placeholder="Ej. 25" />
                </div>
                <div class="input-field-col">
                  <label class="input-lbl">Máximo Objetivo:</label>
                  <input type="number" min="0" step="1" class="num-input" [(ngModel)]="editMaxStock" placeholder="Ej. 60" />
                </div>
              </div>
              <div class="editor-actions-row">
                <button type="button" class="btn-save-thresholds" [disabled]="savingThresholds()" (click)="saveThresholds(item)">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" *ngIf="!savingThresholds()">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                    <polyline points="7 3 7 8 15 8"></polyline>
                  </svg>
                  <span>{{ savingThresholds() ? 'Guardando...' : 'Guardar Umbrales' }}</span>
                </button>
                <button type="button" class="btn-restore-auto" *ngIf="item.isCustomThresholds" [disabled]="savingThresholds()" (click)="restoreAutoThresholds(item)">
                  ↺ Restaurar a Cálculo Automático
                </button>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-modal-action" (click)="goToCroquis(item); selectedDetailItem.set(null)">
              Ver en Croquis
            </button>
            <button class="btn-modal-action btn-modal-primary" (click)="goToCapture(item); selectedDetailItem.set(null)">
              Abrir Cédula de Conteo
            </button>
            <button class="btn-modal-close" (click)="selectedDetailItem.set(null)">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .stock-alerts-page {
      padding: 24px;
      max-width: 1600px;
      margin: 0 auto;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #0f172a;
    }

    /* Page Header */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }

    .header-tag {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #0284c7;
      background: #e0f2fe;
      padding: 4px 10px;
      border-radius: 999px;
      margin-bottom: 8px;
    }

    .pulse-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #0284c7;
    }

    .pulse-indicator.has-critical {
      background: #ef4444;
      box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
      animation: pulse-red 1.6s infinite;
    }

    @keyframes pulse-red {
      0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
      70% { transform: scale(1); box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
      100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
    }

    .page-title {
      font-size: 26px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 6px 0;
      letter-spacing: -0.02em;
    }

    .page-subtitle {
      font-size: 13px;
      color: #64748b;
      margin: 0;
      max-width: 850px;
      line-height: 1.5;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .session-picker {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #ffffff;
      padding: 6px 12px;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
    }

    .picker-label {
      font-size: 12px;
      font-weight: 600;
      color: #475569;
    }

    .select-control {
      font-size: 13px;
      font-weight: 600;
      color: #0f172a;
      background: transparent;
      border: none;
      outline: none;
      cursor: pointer;
    }

    .btn-action {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 9px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease;
    }

    .btn-refresh {
      background: #f1f5f9;
      color: #1e293b;
      border-color: #cbd5e1;
    }

    .btn-refresh:hover:not(:disabled) {
      background: #e2e8f0;
    }

    .btn-export {
      background: #0284c7;
      color: #ffffff;
    }

    .btn-export:hover:not(:disabled) {
      background: #0369a1;
      box-shadow: 0 2px 8px rgba(2, 132, 199, 0.3);
    }

    .btn-plantilla {
      background: #059669;
      color: #ffffff;
      font-weight: 700;
    }

    .btn-plantilla:hover:not(:disabled) {
      background: #047857;
      box-shadow: 0 2px 8px rgba(5, 150, 105, 0.35);
    }

    .btn-po-excel {
      background: #7c3aed;
      color: #ffffff;
      font-weight: 700;
    }

    .btn-po-excel:hover:not(:disabled) {
      background: #6d28d9;
      box-shadow: 0 2px 8px rgba(124, 58, 237, 0.35);
    }

    .btn-action:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      100% { transform: rotate(360deg); }
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .kpi-card {
      background: #ffffff;
      border-radius: 12px;
      padding: 16px 18px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
      cursor: pointer;
      transition: all 0.18s ease;
      position: relative;
      overflow: hidden;
    }

    .kpi-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
    }

    .kpi-card.selected {
      border-width: 2px;
    }

    .kpi-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
    }

    .kpi-danger::before { background: #ef4444; }
    .kpi-danger.selected { border-color: #ef4444; background: #fff5f5; }
    .kpi-warning::before { background: #f59e0b; }
    .kpi-warning.selected { border-color: #f59e0b; background: #fffbeb; }
    .kpi-info::before { background: #3b82f6; }
    .kpi-info.selected { border-color: #3b82f6; background: #eff6ff; }
    .kpi-success::before { background: #10b981; }
    .kpi-success.selected { border-color: #10b981; background: #f0fdf4; }
    .kpi-total::before { background: #64748b; }
    .kpi-total.selected { border-color: #64748b; background: #f8fafc; }

    .kpi-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .kpi-title {
      font-size: 12px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .kpi-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .icon-danger { background: #fee2e2; color: #dc2626; }
    .icon-warning { background: #fef3c7; color: #d97706; }
    .icon-info { background: #dbeafe; color: #2563eb; }
    .icon-success { background: #d1fae5; color: #059669; }
    .icon-total { background: #f1f5f9; color: #475569; }

    .kpi-value {
      font-size: 32px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.1;
      margin-bottom: 4px;
      letter-spacing: -0.03em;
    }

    .kpi-caption {
      font-size: 11px;
      color: #64748b;
    }

    /* Filter Bar */
    .filter-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 18px;
      flex-wrap: wrap;
    }

    .filter-pills {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .pill {
      background: #f1f5f9;
      color: #475569;
      border: 1px solid #e2e8f0;
      padding: 7px 13px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .pill:hover {
      background: #e2e8f0;
      color: #1e293b;
    }

    .pill.active {
      background: #0f172a;
      color: #ffffff;
      border-color: #0f172a;
    }

    .pill-alert.active {
      background: #b91c1c;
      color: #ffffff;
      border-color: #b91c1c;
    }

    .pill-danger.active {
      background: #dc2626;
      border-color: #dc2626;
    }

    .pill-warning.active {
      background: #d97706;
      border-color: #d97706;
    }

    .pill-info.active {
      background: #2563eb;
      border-color: #2563eb;
    }

    .pill-success.active {
      background: #059669;
      border-color: #059669;
    }

    .search-and-select {
      display: flex;
      gap: 10px;
      flex-grow: 1;
      max-width: 580px;
    }

    .search-box {
      position: relative;
      flex-grow: 1;
    }

    .search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: #94a3b8;
    }

    .search-input {
      width: 100%;
      padding: 8px 34px 8px 36px;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s ease;
      background: #ffffff;
      box-sizing: border-box;
    }

    .search-input:focus {
      border-color: #0284c7;
      box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
    }

    .clear-search {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 13px;
    }

    .zone-select {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 8px 12px;
      min-width: 190px;
    }

    /* Table Container */
    .table-container {
      background: #ffffff;
      border-radius: 12px;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
      overflow: hidden;
    }

    .table-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 18px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
    }

    .table-responsive {
      overflow-x: auto;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .data-table th {
      background: #0f172a;
      color: #f8fafc;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 12px 14px;
      text-align: left;
      white-space: nowrap;
    }

    .data-table td {
      padding: 11px 14px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }

    .data-table tbody tr:hover {
      background: #f8fafc;
    }

    .row-danger {
      background: #fffcfc;
    }
    .row-danger:hover {
      background: #fef2f2 !important;
    }

    .row-warning {
      background: #fffdfa;
    }
    .row-warning:hover {
      background: #fefce8 !important;
    }

    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }

    /* Badges */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .badge-danger {
      background: #fee2e2;
      color: #991b1b;
    }
    .badge-danger .status-dot { background: #dc2626; }

    .badge-warning {
      background: #fef3c7;
      color: #92400e;
    }
    .badge-warning .status-dot { background: #d97706; }

    .badge-info {
      background: #dbeafe;
      color: #1e40af;
    }
    .badge-info .status-dot { background: #2563eb; }

    .badge-success {
      background: #d1fae5;
      color: #065f46;
    }
    .badge-success .status-dot { background: #059669; }

    .code-pill {
      font-weight: 700;
      color: #0f172a;
      background: #f1f5f9;
      padding: 3px 7px;
      border-radius: 6px;
      font-size: 12px;
      border: 1px solid #e2e8f0;
      display: inline-block;
    }

    .desc-text {
      font-weight: 500;
      color: #1e293b;
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .desc-sub {
      display: flex;
      gap: 6px;
      margin-top: 3px;
    }

    .zone-badge, .plant-badge {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 4px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .zone-badge {
      background: #f1f5f9;
      color: #475569;
    }

    .plant-badge {
      background: #e0f2fe;
      color: #0369a1;
    }

    .shelf-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-weight: 700;
      font-size: 12px;
      color: #0369a1;
      background: #f0f9ff;
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid #bae6fd;
    }

    .location-detail {
      font-size: 10px;
      color: #64748b;
      margin-top: 2px;
      font-family: monospace;
    }

    .qty-number {
      font-size: 14px;
      font-weight: 800;
    }

    .qty-danger { color: #dc2626; }
    .qty-warning { color: #d97706; }
    .qty-info { color: #2563eb; }
    .qty-success { color: #059669; }

    .unit-text {
      font-size: 10px;
      color: #94a3b8;
      margin-left: 4px;
      text-transform: uppercase;
    }

    .order-badge {
      display: inline-block;
      font-size: 12px;
      font-weight: 800;
      color: #b91c1c;
      background: #fee2e2;
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid #fecaca;
    }

    .order-zero {
      color: #94a3b8;
      font-size: 12px;
    }

    /* Actions */
    .action-buttons-group {
      display: inline-flex;
      gap: 6px;
    }

    .btn-sm {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #475569;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-sm:hover {
      background: #0284c7;
      color: #ffffff;
      border-color: #0284c7;
    }

    .btn-threshold {
      color: #7c3aed;
      border-color: #ddd6fe;
      background: #f5f3ff;
    }
    .btn-threshold:hover {
      background: #7c3aed !important;
      color: #ffffff !important;
      border-color: #7c3aed !important;
    }

    .custom-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 800;
      color: #7c3aed;
      background: #ede9fe;
      border: 1px solid #c4b5fd;
      border-radius: 4px;
      padding: 0 4px;
      margin-left: 4px;
      vertical-align: middle;
    }

    /* Empty State */
    .empty-state {
      padding: 48px 24px;
      text-align: center;
    }

    .empty-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      color: #94a3b8;
    }

    .empty-title {
      font-size: 15px;
      font-weight: 700;
      color: #334155;
      margin: 0;
    }

    .empty-subtitle {
      font-size: 13px;
      color: #64748b;
      margin: 0;
    }

    /* Pagination */
    .pagination-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 18px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      font-size: 12px;
      color: #64748b;
      flex-wrap: wrap;
      gap: 12px;
    }

    .pagination-controls {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .btn-page {
      width: 30px;
      height: 30px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      font-size: 13px;
      font-weight: 600;
      color: #1e293b;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .btn-page:hover:not(:disabled) {
      background: #0284c7;
      color: #ffffff;
      border-color: #0284c7;
    }

    .btn-page:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .page-current {
      font-weight: 700;
      padding: 0 10px;
      color: #0f172a;
    }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 16px;
    }

    .modal-card {
      background: #ffffff;
      border-radius: 14px;
      width: 100%;
      max-width: 580px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.25);
      border: 1px solid #e2e8f0;
      overflow: hidden;
      animation: modal-pop 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes modal-pop {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }

    .modal-header {
      padding: 18px 22px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-title-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .modal-title {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
    }

    .modal-close {
      background: none;
      border: none;
      font-size: 18px;
      color: #64748b;
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
    }

    .modal-close:hover {
      background: #e2e8f0;
      color: #0f172a;
    }

    .modal-body {
      padding: 22px;
    }

    .detail-description {
      font-size: 15px;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 18px;
      line-height: 1.4;
    }

    .detail-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 20px;
    }

    .detail-item {
      background: #f8fafc;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .detail-item.full-span {
      grid-column: 1 / -1;
    }

    .detail-label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
      margin-bottom: 4px;
    }

    .detail-value {
      font-size: 14px;
      color: #0f172a;
    }

    .text-bold { font-weight: 800; }
    .text-reorder { color: #dc2626; }

    /* Stock Gauge */
    .stock-gauge-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
    }

    .gauge-labels {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      margin-bottom: 6px;
    }

    .marker-min { color: #dc2626; }
    .marker-reorder { color: #d97706; }

    .gauge-bar-track {
      height: 12px;
      background: #e2e8f0;
      border-radius: 999px;
      overflow: hidden;
      position: relative;
    }

    .gauge-bar-fill {
      height: 100%;
      border-radius: 999px;
      transition: width 0.3s ease;
    }

    .fill-danger { background: #ef4444; }
    .fill-warning { background: #f59e0b; }
    .fill-info { background: #3b82f6; }
    .fill-success { background: #10b981; }

    /* Manual Thresholds Editor */
    .thresholds-editor-card {
      margin-top: 14px;
      background: #faf5ff;
      border: 1px solid #e9d5ff;
      border-radius: 10px;
      padding: 14px 16px;
    }

    .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }

    .editor-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 700;
      color: #581c87;
    }

    .badge-custom-tag {
      font-size: 10px;
      font-weight: 800;
      color: #7c3aed;
      background: #ffffff;
      border: 1px solid #c4b5fd;
      border-radius: 4px;
      padding: 2px 6px;
      letter-spacing: 0.05em;
    }

    .editor-help {
      font-size: 11px;
      color: #6b21a8;
      margin: 0 0 12px 0;
      opacity: 0.85;
    }

    .editor-inputs-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 12px;
    }

    .input-field-col {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .input-lbl {
      font-size: 11px;
      font-weight: 700;
      color: #4c1d95;
    }

    .num-input {
      padding: 7px 10px;
      border-radius: 6px;
      border: 1px solid #c4b5fd;
      font-size: 13px;
      font-weight: 700;
      font-family: monospace;
      color: #0f172a;
      background: #ffffff;
      outline: none;
      transition: border-color 0.15s;
    }

    .num-input:focus {
      border-color: #7c3aed;
      box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.2);
    }

    .editor-actions-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .btn-save-thresholds {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 6px;
      background: #7c3aed;
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      border: none;
      cursor: pointer;
      transition: background 0.15s;
    }

    .btn-save-thresholds:hover:not(:disabled) {
      background: #6d28d9;
    }

    .btn-save-thresholds:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .btn-restore-auto {
      padding: 7px 12px;
      border-radius: 6px;
      background: #ffffff;
      color: #6b21a8;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid #c4b5fd;
      cursor: pointer;
      transition: all 0.15s;
    }

    .btn-restore-auto:hover:not(:disabled) {
      background: #f3e8ff;
    }

    .modal-footer {
      padding: 14px 22px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    .btn-modal-action {
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #1e293b;
    }

    .btn-modal-action:hover {
      background: #f1f5f9;
    }

    .btn-modal-primary {
      background: #0284c7;
      color: #ffffff;
      border-color: #0284c7;
    }

    .btn-modal-primary:hover {
      background: #0369a1;
    }

    .btn-modal-close {
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      background: transparent;
      color: #64748b;
    }

    .btn-modal-close:hover {
      color: #0f172a;
    }

    /* Responsive */
    @media (max-width: 900px) {
      .stock-alerts-page { padding: 16px; }
      .page-header { flex-direction: column; align-items: stretch; }
      .header-actions { justify-content: flex-start; }
      .search-and-select { max-width: 100%; flex-direction: column; }
      .zone-select { width: 100%; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }

    @media (max-width: 600px) {
      .kpi-grid { grid-template-columns: 1fr; }
      .detail-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class StockAlertsComponent implements OnInit {
  data = signal<StockAlertsData | null>(null);
  isLoading = signal<boolean>(false);
  sessions = signal<InventorySessionSummary[]>([]);
  selectedSessionId = signal<number | null>(null);

  statusFilter = signal<'TODOS' | 'ALERTAS' | 'CRITICO' | 'POR_REORDENAR' | 'SOBRESTOCK' | 'OPTIMO'>('TODOS');
  searchQuery = '';
  selectedZone = '';

  currentPage = signal<number>(1);
  pageSize = 50;

  selectedDetailItem = signal<StockAlertItem | null>(null);

  downloadingTemplate = signal<boolean>(false);
  downloadingPo = signal<boolean>(false);
  savingThresholds = signal<boolean>(false);

  editMinStock: number | null = null;
  editReorderPoint: number | null = null;
  editMaxStock: number | null = null;

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadSessions();
  }

  loadSessions() {
    this.api.getSessions().subscribe({
      next: (sess) => {
        this.sessions.set(sess || []);
        if (sess && sess.length > 0) {
          // Select first active or editable session, or the first one
          const active = sess.find(s => s.status === 'EN_CONTEO' || s.isEditable) || sess[0];
          this.selectedSessionId.set(active.id);
          this.loadData();
        } else {
          this.loadData();
        }
      },
      error: () => {
        this.loadData();
      }
    });
  }

  onSessionChange(newId: number) {
    this.selectedSessionId.set(Number(newId));
    this.loadData();
  }

  loadData() {
    this.isLoading.set(true);
    const sid = this.selectedSessionId() || undefined;
    this.api.getStockAlerts(sid).subscribe({
      next: (res: StockAlertsData) => {
        this.data.set(res);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.toast.error('Error al consultar avisos de stock: ' + (err.error?.message || err.message));
      }
    });
  }

  setStatusFilter(filter: 'TODOS' | 'ALERTAS' | 'CRITICO' | 'POR_REORDENAR' | 'SOBRESTOCK' | 'OPTIMO') {
    this.statusFilter.set(filter);
    this.currentPage.set(1);
  }

  availableZones = computed<string[]>(() => {
    const d = this.data();
    if (!d || !d.items) return [];
    const zones = new Set<string>();
    d.items.forEach(i => {
      if (i.zone && i.zone.trim()) zones.add(i.zone.trim());
    });
    return Array.from(zones).sort();
  });

  filteredItems = computed<StockAlertItem[]>(() => {
    const d = this.data();
    if (!d || !d.items) return [];

    let list = d.items;
    const filter = this.statusFilter();
    if (filter === 'ALERTAS') {
      list = list.filter(i => i.status === 'CRITICO' || i.status === 'POR_REORDENAR');
    } else if (filter !== 'TODOS') {
      list = list.filter(i => i.status === filter);
    }

    if (this.selectedZone) {
      list = list.filter(i => (i.zone || '').toLowerCase() === this.selectedZone.toLowerCase());
    }

    if (this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      list = list.filter(i =>
        (i.code && i.code.toLowerCase().includes(q)) ||
        (i.description && i.description.toLowerCase().includes(q)) ||
        (i.shelfCode && i.shelfCode.toLowerCase().includes(q)) ||
        (i.locationCode && i.locationCode.toLowerCase().includes(q))
      );
    }

    return list;
  });

  totalPages = computed<number>(() => {
    const total = this.filteredItems().length;
    return Math.max(1, Math.ceil(total / this.pageSize));
  });

  paginatedItems = computed<StockAlertItem[]>(() => {
    const list = this.filteredItems();
    const page = this.currentPage();
    const start = (page - 1) * this.pageSize;
    return list.slice(start, start + this.pageSize);
  });

  calcGaugeWidth(item: StockAlertItem): number {
    const max = item.maximoObjetivo > 0 ? item.maximoObjetivo : (item.stockActual * 1.5 || 100);
    const pct = Math.min(100, Math.max(5, (item.stockActual / max) * 100));
    return Math.round(pct);
  }

  openDetail(item: StockAlertItem) {
    this.selectedDetailItem.set(item);
    this.editMinStock = item.customMinStock != null ? item.customMinStock : item.minimoSeguridad;
    this.editReorderPoint = item.customReorderPoint != null ? item.customReorderPoint : item.puntoReorden;
    this.editMaxStock = item.customMaxStock != null ? item.customMaxStock : item.maximoObjetivo;
  }

  openThresholdEditor(item: StockAlertItem) {
    this.openDetail(item);
  }

  saveThresholds(item: StockAlertItem) {
    if (this.editMinStock != null && this.editMinStock < 0) {
      this.toast.error('El stock mínimo no puede ser negativo.');
      return;
    }
    if (this.editReorderPoint != null && this.editMinStock != null && this.editReorderPoint < this.editMinStock) {
      this.toast.warning('El punto de reorden debería ser mayor o igual al mínimo de seguridad.');
    }
    this.savingThresholds.set(true);
    this.api.updateStockThresholds(item.code, this.editMinStock, this.editReorderPoint, this.editMaxStock).subscribe({
      next: (res) => {
        this.savingThresholds.set(false);
        this.toast.success(`Umbrales actualizados correctamente para ${item.code}`);
        item.minimoSeguridad = this.editMinStock != null ? Math.round(this.editMinStock) : item.minimoSeguridad;
        item.puntoReorden = this.editReorderPoint != null ? Math.round(this.editReorderPoint) : item.puntoReorden;
        item.maximoObjetivo = this.editMaxStock != null ? Math.round(this.editMaxStock) : item.maximoObjetivo;
        item.isCustomThresholds = res.isCustomThresholds;
        item.customMinStock = res.minStock;
        item.customReorderPoint = res.reorderPoint;
        item.customMaxStock = res.maxStock;
        this.loadData();
      },
      error: (err) => {
        this.savingThresholds.set(false);
        this.toast.error('Error al guardar umbrales: ' + (err.error?.message || err.message));
      }
    });
  }

  restoreAutoThresholds(item: StockAlertItem) {
    this.savingThresholds.set(true);
    this.api.updateStockThresholds(item.code, null, null, null).subscribe({
      next: () => {
        this.savingThresholds.set(false);
        this.toast.success(`Se restauró el cálculo automático para ${item.code}`);
        this.loadData();
        this.selectedDetailItem.set(null);
      },
      error: (err) => {
        this.savingThresholds.set(false);
        this.toast.error('Error al restaurar: ' + (err.error?.message || err.message));
      }
    });
  }

  downloadPlantilla() {
    this.downloadingTemplate.set(true);
    this.api.downloadImportTemplate().subscribe({
      next: (blob) => {
        this.downloadingTemplate.set(false);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Plantilla_Interflu_Conteo_Por_Nivel.xlsx';
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.success('Plantilla oficial Excel descargada.');
      },
      error: (err) => {
        this.downloadingTemplate.set(false);
        this.toast.error('Error al descargar plantilla: ' + (err.error?.message || err.message));
      }
    });
  }

  downloadPurchaseOrderExcel() {
    this.downloadingPo.set(true);
    const sid = this.selectedSessionId() || undefined;
    this.api.downloadPurchaseOrderExcel(sid).subscribe({
      next: (blob) => {
        this.downloadingPo.set(false);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        const folio = this.data()?.sessionFolio || 'ACTUAL';
        a.href = url;
        a.download = `Orden_De_Compra_Interflu_${folio}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.success('Orden de Compra (.xlsx) descargada con éxito.');
      },
      error: (err) => {
        this.downloadingPo.set(false);
        this.toast.error('Error al generar Orden de Compra: ' + (err.error?.message || err.message));
      }
    });
  }

  goToCroquis(item: StockAlertItem) {
    if (item.shelfId) {
      this.router.navigate(['/croquis'], { queryParams: { shelfId: item.shelfId, highlightCode: item.code } });
    } else {
      this.router.navigate(['/croquis']);
    }
  }

  goToCapture(item: StockAlertItem) {
    if (item.shelfId) {
      this.router.navigate(['/capture'], { queryParams: { shelfId: item.shelfId, search: item.code } });
    } else {
      this.router.navigate(['/capture'], { queryParams: { search: item.code } });
    }
  }

  exportAlertsCsv() {
    const items = this.filteredItems();
    if (items.length === 0) {
      this.toast.warning('No hay productos para exportar con los filtros actuales.');
      return;
    }

    const headers = [
      'CLAVE',
      'DESCRIPCION',
      'STOCK_FISICO',
      'MINIMO_SEGURIDAD',
      'PUNTO_REORDEN',
      'MAXIMO_OBJETIVO',
      'SUGERIDO_PEDIR',
      'ESTADO',
      'ZONA',
      'PLANTA',
      'ANAQUEL',
      'UBICACION_NIVEL',
      'UNIDAD'
    ];

    const rows = items.map(i => [
      `"${(i.code || '').replace(/"/g, '""')}"`,
      `"${(i.description || '').replace(/"/g, '""')}"`,
      i.stockActual,
      i.minimoSeguridad,
      i.puntoReorden,
      i.maximoObjetivo,
      i.cuantoPedir,
      `"${i.statusLabel}"`,
      `"${(i.zone || '').replace(/"/g, '""')}"`,
      `"${(i.plant || '').replace(/"/g, '""')}"`,
      `"${(i.shelfCode || '').replace(/"/g, '""')}"`,
      `"${(i.locationCode || '').replace(/"/g, '""')}"`,
      `"${i.unit || 'PZA'}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const folio = this.data()?.sessionFolio || 'ACTUAL';
    link.setAttribute('href', url);
    link.setAttribute('download', `Avisos_Stock_Interflu_${folio}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.toast.success(`Se exportaron ${items.length} productos a CSV con compatibilidad Excel.`);
  }
}
