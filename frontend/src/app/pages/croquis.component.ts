import { Component, OnInit, signal, computed, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as QRCode from 'qrcode';
import { ApiService, ShelfAssignmentDto, InventorySessionSummary, CountRecordDto } from '../services/api.service';
import { ToastService } from '../services/toast.service';
import { findAceroLocation, AceroLocationMeta } from '../data/acero-catalog';

export interface SectionStat {
  id: string;
  name: string;
  codePrefix: string;
  color: string;
  lightBg: string;
  borderColor: string;
  totalShelves: number;
  completedShelves: number;
  pendingShelves: number;
  untouchedShelves: number;
  totalPieces: number;
  percentage: number;
}

export interface DecodedLocation {
  plant: string;
  plantCode: string;
  aisle: string;
  aisleCode: string;
  shelf: string;
  shelfCode: string;
  level: string;
  levelCode: string;
  position: string;
  positionCode: string;
  summary: string;
}

export interface DemandBarItem {
  month: string;
  quantity: number;
  isEstimated: boolean;
}

export interface PurchaseOrderItem {
  ocNumber: string;
  orderDate: string;
  expectedDate: string;
  orderedQty: number;
  receivedQty: number;
  cancelledQty: number;
  pendingQty: number;
}

export interface ProductPlanningData {
  code: string;
  description: string;
  category: string;
  unit: string;
  lastMovementDate: string;
  locationCode: string;
  shelfId?: number;
  decodedLocation: DecodedLocation;

  stockActual: number;
  minimoSeguridad: number;
  puntoReorden: number;
  maximoObjetivo: number;

  porRecibir: number;
  apartadas: number;
  stockParaPlanear: number;
  cuantoPedir: number;
  cuantoPedirSinRedondeo: number;

  status: 'REORDENAR' | 'EN_CAMINO' | 'OPTIMO';
  statusLabel: string;
  statusColor: string;

  supplierName: string;
  leadTimeDays: number;
  minOrder: number;
  packageSize: number;
  lastQuotePrice: number;
  lastQuoteDate: string;

  purchaseOrders: PurchaseOrderItem[];
  monthlyDemandAvg: number;
  demandHistory: DemandBarItem[];
}

export interface LocationAssignerRow {
  id: number;
  code: string;
  description: string;
  shelfId: number;
  shelfCode: string;
  plant: 'PB' | 'PA';
  aisle: string;
  shelfNum: string;
  level: string;
  position: string;
  locationCode: string;
  quantity: number;
  minimoSeguridad: number;
  puntoReorden: number;
  maximoObjetivo: number;
  cuantoPedir: number;
  statusLabel: string;
  isDirty?: boolean;
  isSelected?: boolean;
  isObsolete?: boolean;
}

@Component({
  selector: 'app-croquis',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="croquis-container">
      <!-- Header -->
      <div class="croquis-header">
        <div>
          <span class="croquis-kicker">CONTROL ESPACIAL DE ALMACÉN &bull; PLANO DIGITAL</span>
          <h1 class="page-title">Croquis Digital Planta Baja y Planta Alta</h1>
          <p class="page-subtitle">
            Monitoreo en tiempo real por anaquel físico &bull; Semáforo de avance &bull; Interflu Inventory
          </p>
        </div>

        <div class="croquis-top-actions">
          <!-- Plant Switcher -->
          <div class="plant-toggle">
            <button
              type="button"
              class="toggle-btn"
              [class.active]="selectedPlant() === 'Planta Baja'"
              (click)="setPlant('Planta Baja')"
            >
              Planta Baja
            </button>
            <button
              type="button"
              class="toggle-btn"
              [class.active]="selectedPlant() === 'Planta Alta'"
              (click)="setPlant('Planta Alta')"
            >
              Planta Alta
            </button>
          </div>

          <!-- Zoom Controls (Estabilizado y con Presets Directos) -->
          <div class="zoom-controls">
            <button class="btn btn-sm btn-icon" (click)="zoomOut()" title="Alejar vista (-5%)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <span class="zoom-level">{{ zoomLevel() }}%</span>
            <button class="btn btn-sm btn-icon" (click)="zoomIn()" title="Acercar vista (+5%)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            </button>
            <button class="btn btn-sm btn-ghost" [class.preset-active]="zoomLevel() === 55" (click)="setZoomPreset(55)" title="Visión lejana 55%">
              55%
            </button>
            <button class="btn btn-sm btn-ghost" [class.preset-active]="zoomLevel() === 68" (click)="setZoomPreset(68)" title="Visión global óptima 68%">
              68%
            </button>
            <button class="btn btn-sm btn-ghost" [class.preset-active]="zoomLevel() === 85" (click)="setZoomPreset(85)" title="Visión media 85%">
              85%
            </button>
            <button class="btn btn-sm btn-ghost" [class.preset-active]="zoomLevel() === 100" (click)="setZoomPreset(100)" title="Vista real 100%">
              100%
            </button>
            <button class="btn btn-sm btn-fit-screen" (click)="fitToScreen()" title="Ajustar dimensiones exactas a la pantalla actual">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
              Ajustar Pantalla
            </button>
          </div>

          <!-- Blueprint Background Opacity Toggle -->
          <div class="blueprint-overlay-control" title="Regular la opacidad del croquis original de fondo">
            <span class="control-label">Fondo Plano:</span>
            <input
              type="range"
              min="0"
              max="100"
              step="10"
              [ngModel]="blueprintOpacity()"
              (ngModelChange)="blueprintOpacity.set($event)"
              class="opacity-slider"
            />
            <span class="opacity-val">{{ blueprintOpacity() }}%</span>
          </div>

          <!-- Toggle Sidebar Avance Button -->
          <button
            class="btn btn-sm"
            [class.btn-primary]="showSidebar()"
            [class.btn-outline]="!showSidebar()"
            (click)="showSidebar.set(!showSidebar())"
            [title]="showSidebar() ? 'Ocultar barra de avance de secciones' : 'Mostrar barra de avance de secciones'"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <line x1="15" y1="3" x2="15" y2="21"></line>
            </svg>
            {{ showSidebar() ? 'Ocultar Avance' : 'Ver Avance' }}
          </button>

          <!-- Edit Mode Toggle -->
          <button
            class="btn"
            [class.btn-primary]="editMode()"
            [class.btn-outline]="!editMode()"
            (click)="toggleEditMode()"
            title="Activar para mover o ajustar anaqueles sobre el plano"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
            {{ editMode() ? 'Salir de Acomodo' : 'Acomodar Anaqueles' }}
          </button>

          <!-- Save Layout Button -->
          <button
            *ngIf="editMode()"
            class="btn btn-success"
            (click)="saveLayoutPositions()"
            [disabled]="savingLayout()"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            {{ savingLayout() ? 'Guardando...' : 'Guardar Coordenadas' }}
          </button>

          <!-- Add Shelf Button -->
          <button
            type="button"
            class="btn btn-primary"
            (click)="openCreateShelfModal()"
            title="Crear un nuevo anaquel con medidas estandarizadas y ubicarlo en el plano"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            + Agregar Anaquel
          </button>

          <!-- Bulk Shelf Editor Button -->
          <button
            type="button"
            class="btn btn-outline"
            (click)="openBulkShelfEditor()"
            title="Renombrar en serie y modificar descripciones de múltiples anaqueles automáticamente"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            Editor Masivo
          </button>

          <!-- Resize Shelf Dimensions Tool -->
          <button
            type="button"
            class="btn btn-outline"
            (click)="openResizeShelfModal()"
            title="Ajustar medidas de ancho (W) y alto (H) de anaqueles con medidas predefinidas o numéricas"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <path d="M9 3v18"></path>
              <path d="M15 3v18"></path>
              <path d="M3 9h18"></path>
              <path d="M3 15h18"></path>
            </svg>
            Dimensionar Anaqueles
          </button>

          <!-- Levantamiento Semanal SAE / Excel Import Button -->
          <button
            type="button"
            class="btn btn-outline-primary btn-weekly-import"
            (click)="openCroquisImportModal()"
            title="Importar levantamiento semanal de Aspel SAE o Excel (actualiza piezas automáticamente)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Levantamiento Semanal SAE
          </button>
        </div>
      </div>

      <!-- Search & Filter Bar -->
      <div class="search-filter-bar">
        <div class="search-box">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            class="search-input"
            [(ngModel)]="searchQuery"
            placeholder="Buscar anaquel (ej. PB-KUR-01, PVC, Sellos, Acero)..."
          />
          <button *ngIf="searchQuery" class="clear-btn" (click)="searchQuery = ''">✕</button>
        </div>

        <!-- Official Status Semáforo Interactive Filter Buttons -->
        <div class="blueprint-legend">
          <button
            type="button"
            class="legend-filter-btn"
            [class.active]="statusQuickFilter() === 'ALL'"
            (click)="statusQuickFilter.set('ALL')"
            title="Mostrar todos los anaqueles"
          >
            <span class="dot dot-all"></span>
            <strong>Todos ({{ plantShelves().length }})</strong>
          </button>
          <button
            type="button"
            class="legend-filter-btn filter-completed"
            [class.active]="statusQuickFilter() === 'COMPLETED'"
            (click)="statusQuickFilter.set('COMPLETED')"
            title="Resaltar únicamente anaqueles terminados (Verde)"
          >
            <span class="dot dot-completed"></span>
            <strong>Completados ({{ completedCount() }})</strong>
          </button>
          <button
            type="button"
            class="legend-filter-btn filter-pending"
            [class.active]="statusQuickFilter() === 'PENDING'"
            (click)="statusQuickFilter.set('PENDING')"
            title="Resaltar únicamente anaqueles pendientes por contar"
          >
            <span class="dot dot-pending-neutral"></span>
            <strong>Pendientes ({{ pendingCount() }})</strong>
          </button>
        </div>
      </div>

      <!-- Plant Metrics Bar -->
      <div class="plant-metrics-bar">
        <div class="p-metric">
          <span class="p-label">Planta Activa</span>
          <span class="p-value">{{ selectedPlant() }}</span>
        </div>
        <div class="p-metric">
          <span class="p-label">Total Anaqueles</span>
          <span class="p-value">{{ plantShelves().length }}</span>
        </div>
        <div class="p-metric">
          <span class="p-label">Contabilizados</span>
          <span class="p-value text-success">{{ completedCount() }} / {{ plantShelves().length }}</span>
        </div>
        <div class="p-metric">
          <span class="p-label">Pendientes</span>
          <span class="p-value text-slate">{{ pendingCount() }}</span>
        </div>
        <div class="p-metric">
          <span class="p-label">Avance Físico</span>
          <span class="p-value">{{ progressPercent() }}%</span>
        </div>
        <div class="p-metric">
          <span class="p-label">Piezas Físicas Contadas</span>
          <span class="p-value mono text-primary-brand">{{ totalPlantPieces() | number:'1.0-2' }}</span>
        </div>
      </div>

      <!-- Edit Mode Banner -->
      <div class="edit-mode-banner" *ngIf="editMode()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <div>
          <strong>Modo Acomodo Activo:</strong>
          Haz clic en cualquier anaquel para seleccionarlo y luego haz clic sobre el croquis en la posición deseada.
          Al terminar, pulsa <strong>"Guardar Coordenadas"</strong>.
          <span *ngIf="selectedRackForMove" class="active-move-chip">
            Moviendo: <strong>{{ selectedRackForMove.shelfCode }}</strong>
          </span>
        </div>
      </div>

      <!-- Empty Session Alert Banner (When user accidentally deleted all sessions) -->
      <div class="empty-session-warning-card" *ngIf="sessions().length === 0">
        <div class="empty-warning-content">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <div>
            <strong>No hay sesiones de inventario activas en el sistema</strong>
            <p>Los anaqueles físicos se visualizan y operan a través de una sesión. Haz clic para restaurar la sesión oficial y volver a operar los 170 anaqueles.</p>
          </div>
        </div>
        <button class="btn btn-primary" (click)="restoreDefaultSession()" [disabled]="restoringSession()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
          <span>{{ restoringSession() ? 'Restaurando...' : 'Restaurar 170 Anaqueles (Crear Inventario)' }}</span>
        </button>
      </div>

      <!-- Main Croquis Layout: Canvas Column + Sections Progress Sidebar -->
      <div class="croquis-main-layout" [class.sidebar-collapsed]="!showSidebar()">
        <div class="croquis-canvas-col">
          <!-- Main Croquis Canvas Viewport -->
          <div 
            class="blueprint-canvas-wrap" 
            #viewportContainer 
            [class.is-panning]="isPanning"
            (mousedown)="onViewportMouseDown($event)"
            (touchstart)="onViewportTouchStart($event)"
            (wheel)="onWheel($event)"
          >
            <div 
              class="canvas-sizer" 
              [style.width.px]="1440 * (zoomLevel() / 100)" 
              [style.height.px]="810 * (zoomLevel() / 100)"
            >
              <div class="canvas-scroll-wrapper" [style.transform]="'scale(' + (zoomLevel() / 100) + ')'" [style.transformOrigin]="'top left'">
                <div
                  #canvasElement
                  class="blueprint-canvas-1440"
                  [class.edit-canvas]="editMode()"
                  (click)="onCanvasClick($event)"
                  (mousemove)="onCanvasMouseMove($event)"
                  (mouseup)="onCanvasMouseUp($event)"
                  (mouseleave)="onCanvasMouseUp($event)"
                >
                <!-- Background Original Blueprint Image (with adjustable opacity) -->
                <img
                  [src]="selectedPlant() === 'Planta Baja' ? '/croquis_raw_1.png' : '/croquis_raw_2.png'"
                  alt="Plano Original Interflu"
                  class="blueprint-img-underlay"
                  [style.opacity]="blueprintOpacity() / 100"
                />

                <!-- Architectural Engineering SVG Overlay (Crisp vector walls and labels) -->
                <svg class="architectural-svg" viewBox="0 0 1440 810" preserveAspectRatio="none">
                  <!-- Slanted Outer Warehouse Walls matching Blueprint East Inclination (-7.8°) -->
                  <polygon points="250,90 1380,90 1285,780 250,780" fill="none" stroke="#334155" stroke-width="3.5" stroke-linejoin="round" />
                  <polygon points="254,94 1374,94 1281,776 254,776" fill="none" stroke="#64748b" stroke-width="1" stroke-dasharray="8,6" stroke-linejoin="round" />

                  <!-- Common Walkways & Grid Guidelines -->
                  <line x1="250" y1="480" x2="1326" y2="480" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6,6" />
                  <line x1="750" y1="90" x2="750" y2="780" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="6,6" />

                  <!-- Planta Baja Specific Architectural Features (Exact User Image 2 Order) -->
                  <ng-container *ngIf="selectedPlant() === 'Planta Baja'">
                    <!-- 1. Zona de Desembarque (Top) -->
                    <rect x="250" y="90" width="230" height="215" fill="#f8fafc" stroke="#334155" stroke-width="2.5" />
                    <rect x="275" y="115" width="180" height="150" fill="#f1f5f9" stroke="#0f172a" stroke-width="2" />
                    <text x="365" y="185" text-anchor="middle" class="svg-room-label">ZONA DE</text>
                    <text x="365" y="205" text-anchor="middle" class="svg-room-label">DESEMBARQUE</text>

                    <!-- 2. Cocina / Comedor (Middle 1) -->
                    <rect x="250" y="305" width="230" height="185" fill="#f8fafc" stroke="#334155" stroke-width="2.5" />
                    <rect x="275" y="330" width="180" height="135" fill="#f1f5f9" stroke="#0f172a" stroke-width="2" />
                    <text x="365" y="392" text-anchor="middle" class="svg-room-label">COCINA /</text>
                    <text x="365" y="412" text-anchor="middle" class="svg-room-label">COMEDOR</text>

                    <!-- 3. Baño Hombres (Middle 2) -->
                    <rect x="250" y="490" width="230" height="145" fill="#f8fafc" stroke="#334155" stroke-width="2.5" />
                    <rect x="275" y="515" width="180" height="100" fill="#f1f5f9" stroke="#0f172a" stroke-width="2" />
                    <text x="365" y="572" text-anchor="middle" class="svg-room-label">BAÑO HOMBRES</text>

                    <!-- 4. Baño Mujeres (Bottom) -->
                    <rect x="250" y="635" width="230" height="145" fill="#f8fafc" stroke="#334155" stroke-width="2.5" />
                    <rect x="275" y="658" width="180" height="102" fill="#f1f5f9" stroke="#0f172a" stroke-width="2" />
                    <text x="365" y="716" text-anchor="middle" class="svg-room-label">BAÑO MUJERES</text>

                    <!-- Tuberías Area Boundary -->
                    <rect x="1040" y="105" width="150" height="385" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,4" />
                    <text x="1115" y="295" text-anchor="middle" class="svg-zone-title" transform="rotate(-90 1115 295)">ÁREA DE TUBERÍAS</text>

                    <!-- Escalera (Slanted along East wall) -->
                    <polygon points="1215,525 1320,525 1285,775 1215,775" fill="#f1f5f9" stroke="#475569" stroke-width="2" stroke-linejoin="round" />
                    <line x1="1215" y1="560" x2="1315" y2="560" stroke="#64748b" stroke-width="1.5" />
                    <line x1="1215" y1="595" x2="1310" y2="595" stroke="#64748b" stroke-width="1.5" />
                    <line x1="1215" y1="630" x2="1305" y2="630" stroke="#64748b" stroke-width="1.5" />
                    <line x1="1215" y1="665" x2="1300" y2="665" stroke="#64748b" stroke-width="1.5" />
                    <line x1="1215" y1="700" x2="1295" y2="700" stroke="#64748b" stroke-width="1.5" />
                    <line x1="1215" y1="735" x2="1290" y2="735" stroke="#64748b" stroke-width="1.5" />
                    <text x="1255" y="650" text-anchor="middle" class="svg-room-label" transform="rotate(-90 1255 650)">ESCALERA</text>

                    <!-- Mangueras PB Area Boundary -->
                    <rect x="1000" y="495" width="185" height="190" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="4,4" />
                    <text x="1092" y="595" text-anchor="middle" class="svg-zone-title">ÁREA MANGUERAS PB</text>

                    <!-- Architectural Badge Pills (Planta Baja - Crisp Vector, Non-Overlapping & Masking Underlay) -->
                    <!-- Kuriyama Header -->
                    <g>
                      <rect x="640" y="232" width="120" height="22" rx="4" class="svg-badge-pill" />
                      <text x="700" y="243" text-anchor="middle" class="svg-badge-text">KURIYAMA (A | B)</text>
                    </g>

                    <!-- Pendiente -->
                    <g>
                      <rect x="748" y="66" width="70" height="22" rx="4" class="svg-badge-pill" />
                      <text x="783" y="77" text-anchor="middle" class="svg-badge-text">PENDIENTE</text>
                    </g>

                    <!-- Acero 1-19 -->
                    <g>
                      <rect x="822" y="66" width="72" height="22" rx="4" class="svg-badge-pill" />
                      <text x="858" y="77" text-anchor="middle" class="svg-badge-text">ACERO (1-19)</text>
                    </g>

                    <!-- Pasillo YPC A -->
                    <g>
                      <rect x="898" y="66" width="70" height="22" rx="4" class="svg-badge-pill" />
                      <text x="933" y="77" text-anchor="middle" class="svg-badge-text">PASILLO YPC</text>
                    </g>

                    <!-- Estantería YPC B/C -->
                    <g>
                      <rect x="972" y="66" width="84" height="22" rx="4" class="svg-badge-pill" />
                      <text x="1014" y="77" text-anchor="middle" class="svg-badge-text">YPC (B | C)</text>
                    </g>

                    <!-- Dixon (Nivel 1 Columna) -->
                    <g>
                      <rect x="1172" y="66" width="74" height="22" rx="4" class="svg-badge-pill" />
                      <text x="1209" y="77" text-anchor="middle" class="svg-badge-text">DIXON (1-2)</text>
                    </g>

                    <!-- Conexiones Hidráulicas (Nivel 2-6 Columna) sub-header -->
                    <g>
                      <rect x="1158" y="185" width="102" height="15" rx="3" fill="#ffffff" stroke="#94a3b8" stroke-width="1" />
                      <text x="1209" y="193" text-anchor="middle" class="svg-badge-text-sub">C. HIDRÁULICAS (A|B)</text>
                    </g>

                    <!-- Parker Inox (Muro Norte Horizontal) -->
                    <g>
                      <rect x="1255" y="66" width="74" height="22" rx="4" class="svg-badge-pill" />
                      <text x="1292" y="77" text-anchor="middle" class="svg-badge-text">PARKER INOX</text>
                    </g>

                    <!-- Conexiones Hidráulicas Muro Este (Inclinado) -->
                    <g transform="rotate(-7.8 1326 77)">
                      <rect x="1265" y="66" width="122" height="22" rx="4" class="svg-badge-pill" />
                      <text x="1326" y="77" text-anchor="middle" class="svg-badge-text">CHID MURO ESTE</text>
                    </g>

                    <!-- Basura Architectural Box (Northeast Corner) -->
                    <g transform="rotate(-7.8 1350 130)">
                      <rect x="1334" y="98" width="34" height="66" rx="4" fill="#f8fafc" stroke="#64748b" stroke-width="1.5" stroke-dasharray="3,3" />
                      <text x="1351" y="133" text-anchor="middle" font-size="9" font-weight="700" fill="#64748b" letter-spacing="0.5">BASURA</text>
                    </g>

                    <!-- Cybermatics / Universal -->
                    <g>
                      <rect x="580" y="696" width="160" height="22" rx="4" class="svg-badge-pill" />
                      <text x="660" y="707" text-anchor="middle" class="svg-badge-text">CYBERMATICS / UNIVERSAL</text>
                    </g>
                  </ng-container>

                  <!-- Planta Alta Specific Architectural Features -->
                  <ng-container *ngIf="selectedPlant() === 'Planta Alta'">
                    <!-- Architectural Badge Pills (Planta Alta - Crisp Vector, Non-Overlapping & Masking Underlay) -->
                    <!-- Lateral Oeste -->
                    <g>
                      <rect x="238" y="169" width="98" height="22" rx="4" class="svg-badge-pill" />
                      <text x="287" y="180" text-anchor="middle" class="svg-badge-text">LATERAL OESTE</text>
                    </g>

                    <!-- Obsolete Area Docs Mask (Hides background image text) -->
                    <rect x="246" y="425" width="76" height="145" rx="4" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="3,3" />


                    <!-- Res. Acero NW -->
                    <g>
                      <rect x="375" y="66" width="80" height="22" rx="4" class="svg-badge-pill" />
                      <text x="415" y="77" text-anchor="middle" class="svg-badge-text">RES. NW</text>
                    </g>

                    <!-- Acero | PVC Central (Elevated cleanly above boundary) -->
                    <g>
                      <rect x="430" y="40" width="88" height="22" rx="4" class="svg-badge-pill" />
                      <text x="474" y="51" text-anchor="middle" class="svg-badge-text">ACERO | PVC</text>
                    </g>

                    <!-- Res. Acero NE -->
                    <g>
                      <rect x="500" y="66" width="80" height="22" rx="4" class="svg-badge-pill" />
                      <text x="540" y="77" text-anchor="middle" class="svg-badge-text">RES. NE</text>
                    </g>

                    <!-- Reserva Acero Sur -->
                    <g>
                      <rect x="420" y="445" width="108" height="22" rx="4" class="svg-badge-pill" />
                      <text x="474" y="456" text-anchor="middle" class="svg-badge-text">RES. ACERO SUR</text>
                    </g>

                    <!-- Pasillo 1 (P1: HCO / HIDR.) -->
                    <g>
                      <rect x="578" y="66" width="90" height="22" rx="4" class="svg-badge-pill" />
                      <text x="623" y="77" text-anchor="middle" class="svg-badge-text">P1: HCO / HIDR.</text>
                    </g>

                    <!-- Pasillo 2 (P2: NEUMÁTICO) -->
                    <g>
                      <rect x="822" y="66" width="90" height="22" rx="4" class="svg-badge-pill" />
                      <text x="867" y="77" text-anchor="middle" class="svg-badge-text">P2: NEUMÁTICO</text>
                    </g>

                    <!-- Pasillo 3 (P3: FESTO / SMC) -->
                    <g>
                      <rect x="919" y="66" width="90" height="22" rx="4" class="svg-badge-pill" />
                      <text x="964" y="77" text-anchor="middle" class="svg-badge-text">P3: FESTO/SMC</text>
                    </g>

                    <!-- Pasillo 4 (P4: SELLOS 1) -->
                    <g>
                      <rect x="1019" y="66" width="82" height="22" rx="4" class="svg-badge-pill" />
                      <text x="1060" y="77" text-anchor="middle" class="svg-badge-text">P4: SELLOS 1</text>
                    </g>

                    <!-- Pasillo 5 (P5: SELLOS 2) -->
                    <g>
                      <rect x="1138" y="66" width="82" height="22" rx="4" class="svg-badge-pill" />
                      <text x="1179" y="77" text-anchor="middle" class="svg-badge-text">P5: SELLOS 2</text>
                    </g>

                    <!-- Sellos Muro Este (Inclinado) -->
                    <g transform="rotate(-7.8 1320 77)">
                      <rect x="1265" y="66" width="110" height="22" rx="4" class="svg-badge-pill" />
                      <text x="1320" y="77" text-anchor="middle" class="svg-badge-text">SELLOS MURO ESTE</text>
                    </g>

                    <!-- Escalera (Slanted along East wall) -->
                    <polygon points="1215,525 1320,525 1285,775 1215,775" fill="#f1f5f9" stroke="#475569" stroke-width="2" stroke-linejoin="round" />
                    <line x1="1215" y1="560" x2="1315" y2="560" stroke="#64748b" stroke-width="1.5" />
                    <line x1="1215" y1="595" x2="1310" y2="595" stroke="#64748b" stroke-width="1.5" />
                    <line x1="1215" y1="630" x2="1305" y2="630" stroke="#64748b" stroke-width="1.5" />
                    <line x1="1215" y1="665" x2="1300" y2="665" stroke="#64748b" stroke-width="1.5" />
                    <line x1="1215" y1="700" x2="1295" y2="700" stroke="#64748b" stroke-width="1.5" />
                    <line x1="1215" y1="735" x2="1290" y2="735" stroke="#64748b" stroke-width="1.5" />
                    <text x="1255" y="650" text-anchor="middle" class="svg-room-label" transform="rotate(-90 1255 650)">ESCALERA</text>

                    <!-- ÁREA DE MANGUERAS INDUSTRIALES (Referencia en plano sin numeración) -->
                    <rect x="390" y="485" width="670" height="280" rx="8" fill="#f8fafc" stroke="#94a3b8" stroke-width="2" stroke-dasharray="6,4" />
                    <text x="725" y="520" text-anchor="middle" class="svg-zone-title">ÁREA DE MANGUERAS INDUSTRIALES · ALMACÉN A GRANEL</text>

                    <!-- Fila 1 de Carretes (cy = 585) -->
                    <g class="svg-hose-reel">
                      <circle cx="460" cy="585" r="38" fill="#ffffff" stroke="#0284c7" stroke-width="2.5" />
                      <circle cx="460" cy="585" r="33" fill="none" stroke="#bae6fd" stroke-width="1.5" stroke-dasharray="4,3" />
                      <circle cx="460" cy="585" r="16" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" />
                      <circle cx="460" cy="585" r="5" fill="#0369a1" />
                      <line x1="422" y1="585" x2="498" y2="585" stroke="#94a3b8" stroke-width="1" />
                      <line x1="460" y1="547" x2="460" y2="623" stroke="#94a3b8" stroke-width="1" />
                    </g>
                    <g class="svg-hose-reel">
                      <circle cx="580" cy="585" r="38" fill="#ffffff" stroke="#0284c7" stroke-width="2.5" />
                      <circle cx="580" cy="585" r="33" fill="none" stroke="#bae6fd" stroke-width="1.5" stroke-dasharray="4,3" />
                      <circle cx="580" cy="585" r="16" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" />
                      <circle cx="580" cy="585" r="5" fill="#0369a1" />
                      <line x1="542" y1="585" x2="618" y2="585" stroke="#94a3b8" stroke-width="1" />
                      <line x1="580" y1="547" x2="580" y2="623" stroke="#94a3b8" stroke-width="1" />
                    </g>
                    <g class="svg-hose-reel">
                      <circle cx="700" cy="585" r="38" fill="#ffffff" stroke="#0284c7" stroke-width="2.5" />
                      <circle cx="700" cy="585" r="33" fill="none" stroke="#bae6fd" stroke-width="1.5" stroke-dasharray="4,3" />
                      <circle cx="700" cy="585" r="16" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" />
                      <circle cx="700" cy="585" r="5" fill="#0369a1" />
                      <line x1="662" y1="585" x2="738" y2="585" stroke="#94a3b8" stroke-width="1" />
                      <line x1="700" y1="547" x2="700" y2="623" stroke="#94a3b8" stroke-width="1" />
                    </g>
                    <g class="svg-hose-reel">
                      <circle cx="820" cy="585" r="38" fill="#ffffff" stroke="#0284c7" stroke-width="2.5" />
                      <circle cx="820" cy="585" r="33" fill="none" stroke="#bae6fd" stroke-width="1.5" stroke-dasharray="4,3" />
                      <circle cx="820" cy="585" r="16" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" />
                      <circle cx="820" cy="585" r="5" fill="#0369a1" />
                      <line x1="782" y1="585" x2="858" y2="585" stroke="#94a3b8" stroke-width="1" />
                      <line x1="820" y1="547" x2="820" y2="623" stroke="#94a3b8" stroke-width="1" />
                    </g>
                    <g class="svg-hose-reel">
                      <circle cx="940" cy="585" r="38" fill="#ffffff" stroke="#0284c7" stroke-width="2.5" />
                      <circle cx="940" cy="585" r="33" fill="none" stroke="#bae6fd" stroke-width="1.5" stroke-dasharray="4,3" />
                      <circle cx="940" cy="585" r="16" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" />
                      <circle cx="940" cy="585" r="5" fill="#0369a1" />
                      <line x1="902" y1="585" x2="978" y2="585" stroke="#94a3b8" stroke-width="1" />
                      <line x1="940" y1="547" x2="940" y2="623" stroke="#94a3b8" stroke-width="1" />
                    </g>

                    <!-- Fila 2 de Carretes (cy = 690) -->
                    <g class="svg-hose-reel">
                      <circle cx="460" cy="690" r="38" fill="#ffffff" stroke="#0284c7" stroke-width="2.5" />
                      <circle cx="460" cy="690" r="33" fill="none" stroke="#bae6fd" stroke-width="1.5" stroke-dasharray="4,3" />
                      <circle cx="460" cy="690" r="16" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" />
                      <circle cx="460" cy="690" r="5" fill="#0369a1" />
                      <line x1="422" y1="690" x2="498" y2="690" stroke="#94a3b8" stroke-width="1" />
                      <line x1="460" y1="652" x2="460" y2="728" stroke="#94a3b8" stroke-width="1" />
                    </g>
                    <g class="svg-hose-reel">
                      <circle cx="580" cy="690" r="38" fill="#ffffff" stroke="#0284c7" stroke-width="2.5" />
                      <circle cx="580" cy="690" r="33" fill="none" stroke="#bae6fd" stroke-width="1.5" stroke-dasharray="4,3" />
                      <circle cx="580" cy="690" r="16" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" />
                      <circle cx="580" cy="690" r="5" fill="#0369a1" />
                      <line x1="542" y1="690" x2="618" y2="690" stroke="#94a3b8" stroke-width="1" />
                      <line x1="580" y1="652" x2="580" y2="728" stroke="#94a3b8" stroke-width="1" />
                    </g>
                    <g class="svg-hose-reel">
                      <circle cx="700" cy="690" r="38" fill="#ffffff" stroke="#0284c7" stroke-width="2.5" />
                      <circle cx="700" cy="690" r="33" fill="none" stroke="#bae6fd" stroke-width="1.5" stroke-dasharray="4,3" />
                      <circle cx="700" cy="690" r="16" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" />
                      <circle cx="700" cy="690" r="5" fill="#0369a1" />
                      <line x1="662" y1="690" x2="738" y2="690" stroke="#94a3b8" stroke-width="1" />
                      <line x1="700" y1="652" x2="700" y2="728" stroke="#94a3b8" stroke-width="1" />
                    </g>
                    <g class="svg-hose-reel">
                      <circle cx="820" cy="690" r="38" fill="#ffffff" stroke="#0284c7" stroke-width="2.5" />
                      <circle cx="820" cy="690" r="33" fill="none" stroke="#bae6fd" stroke-width="1.5" stroke-dasharray="4,3" />
                      <circle cx="820" cy="690" r="16" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" />
                      <circle cx="820" cy="690" r="5" fill="#0369a1" />
                      <line x1="782" y1="690" x2="858" y2="690" stroke="#94a3b8" stroke-width="1" />
                      <line x1="820" y1="652" x2="820" y2="728" stroke="#94a3b8" stroke-width="1" />
                    </g>
                    <g class="svg-hose-reel">
                      <circle cx="940" cy="690" r="38" fill="#ffffff" stroke="#0284c7" stroke-width="2.5" />
                      <circle cx="940" cy="690" r="33" fill="none" stroke="#bae6fd" stroke-width="1.5" stroke-dasharray="4,3" />
                      <circle cx="940" cy="690" r="16" fill="#e0f2fe" stroke="#0284c7" stroke-width="1.5" />
                      <circle cx="940" cy="690" r="5" fill="#0369a1" />
                      <line x1="902" y1="690" x2="978" y2="690" stroke="#94a3b8" stroke-width="1" />
                      <line x1="940" y1="652" x2="940" y2="728" stroke="#94a3b8" stroke-width="1" />
                    </g>
                  </ng-container>
                </svg>

                <!-- Digital Shelves Overlaid on the 1440x810 Grid -->
                <div
                  *ngFor="let s of filteredShelves()"
                  class="rack-element"
                  [ngClass]="rackColorClass(s)"
                  [class.narrow-rack]="(s.width || 54) < 35"
                  [class.slanted-east-rack]="isEastWallRack(s)"
                  [class.matched-search]="isMatched(s)"
                  [class.dimmed-by-section]="isDimmedBySection(s)"
                  [class.highlighted-by-section]="isHighlightedBySection(s)"
                  [class.rack-selected-for-move]="selectedRackForMove?.shelfId === s.shelfId"
                  [class.rack-dragging]="isDragging && draggedRack?.shelfId === s.shelfId"
                  [style.left.px]="s.posX"
                  [style.top.px]="s.posY"
                  [style.width.px]="s.width"
                  [style.height.px]="s.height"
                  (click)="onRackClick($event, s)"
                  (mousedown)="onRackMouseDown($event, s)"
                  [title]="getRackTooltip(s)"
                >
                  <!-- Standard Box (>= 35px width) -->
                  <ng-container *ngIf="(s.width || 54) >= 35">
                    <div class="rack-code-row">
                      <span class="mono rack-code-text">{{ getDisplayCode(s) }}</span>
                      <span class="status-indicator-dot" [ngClass]="dotColorClass(s)"></span>
                    </div>
                    <div class="rack-zone-text">{{ getDisplayZone(s) }}</div>
                    <div class="rack-qty-text" *ngIf="(s.totalPieces || 0) > 0">
                      {{ s.totalPieces | number:'1.0-2' }} pz
                    </div>
                  </ng-container>

                  <!-- Narrow Divided Box (< 35px width, e.g. 25px in aisles) -->
                  <ng-container *ngIf="(s.width || 54) < 35">
                    <span class="status-indicator-dot narrow-dot" [ngClass]="dotColorClass(s)"></span>
                    <div class="narrow-code-block">
                      <span class="narrow-sub-code">{{ getNarrowCode(s) }}</span>
                    </div>
                    <div class="narrow-qty-text" *ngIf="(s.totalPieces || 0) > 0">
                      {{ s.totalPieces | number:'1.0-0' }}p
                    </div>
                  </ng-container>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Canvas Zoom & Dimension Navigation Bar -->
        <div class="canvas-nav-footer">
          <div class="nav-hint-text">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="5 9 2 12 5 15"></polyline>
              <polyline points="9 5 12 2 15 5"></polyline>
              <polyline points="15 19 12 22 9 19"></polyline>
              <polyline points="19 9 22 12 19 15"></polyline>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <line x1="12" y1="2" x2="12" y2="22"></line>
            </svg>
            <span>Desplazamiento activo: Usa la barra de desplazamiento o arrastra sobre el plano.</span>
          </div>
          <div class="canvas-dim-chip">
            <span>Dimensiones:</span>
            <strong class="mono">{{ (1440 * (zoomLevel() / 100)) | number:'1.0-0' }} &times; {{ (810 * (zoomLevel() / 100)) | number:'1.0-0' }} px</strong>
            <span class="dim-scale-tag">({{ zoomLevel() }}%)</span>
          </div>
        </div>
      </div>

      <!-- Sections & Progress Sidebar (Lateral con Barras de Porcentaje por Tipo) -->
      <aside class="sections-progress-sidebar" *ngIf="showSidebar()">
          <div class="sections-sidebar-header">
            <div>
              <div class="sidebar-kicker">SECCIONES DE ALMACÉN</div>
              <h3 class="sidebar-title">Avance por Familias</h3>
            </div>
            <button 
              *ngIf="selectedSectionFilter()" 
              class="btn btn-xs btn-outline" 
              (click)="selectedSectionFilter.set(null)"
              title="Mostrar todas las secciones en el croquis"
            >
              Ver Todas
            </button>
          </div>

          <div class="sections-summary-pill">
            <span>{{ selectedPlant() }}:</span>
            <strong class="mono">{{ completedCount() }} / {{ plantShelves().length }} ({{ progressPercent() }}%)</strong>
          </div>

          <div class="sections-list">
            <div 
              *ngFor="let sec of sectionsProgress()" 
              class="section-card"
              [class.active]="selectedSectionFilter() === sec.id"
              [style.--sec-accent]="sec.color"
              (click)="toggleSectionFilter(sec.id)"
              [title]="'Clic para resaltar anaqueles de ' + sec.name + ' en el croquis'"
            >
              <div class="section-card-header">
                <div class="sec-name-wrap">
                  <span class="sec-color-badge" [style.background-color]="sec.color"></span>
                  <span class="sec-name-text">{{ sec.name }}</span>
                </div>
                <span class="sec-pct-chip" [class.pct-complete]="sec.percentage === 100">
                  {{ sec.percentage }}%
                </span>
              </div>

              <!-- Animated Progress Bar -->
              <div class="sec-progress-track">
                <div 
                  class="sec-progress-fill" 
                  [style.width.%]="sec.percentage"
                  [style.background-color]="sec.percentage === 100 ? '#16a34a' : sec.color"
                ></div>
              </div>

              <div class="sec-card-footer">
                <span class="sec-count-text">
                  <strong>{{ sec.completedShelves }}</strong> / {{ sec.totalShelves }} anaqueles
                </span>
                <span class="sec-pieces-text mono" *ngIf="sec.totalPieces > 0">
                  {{ sec.totalPieces | number:'1.0-0' }} pzas
                </span>
                <span class="sec-status-text" *ngIf="sec.percentage === 100">
                  Completo
                </span>
              </div>

              <button
                type="button"
                class="sec-explore-btn"
                (click)="openFamilyExplorer($event, sec)"
                [title]="'Abrir pestaña con todos los códigos y materiales de ' + sec.name"
              >
                <span class="sec-explore-left">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <line x1="8" y1="6" x2="21" y2="6"></line>
                    <line x1="8" y1="12" x2="21" y2="12"></line>
                    <line x1="8" y1="18" x2="21" y2="18"></line>
                    <line x1="3" y1="6" x2="3.01" y2="6"></line>
                    <line x1="3" y1="12" x2="3.01" y2="12"></line>
                    <line x1="3" y1="18" x2="3.01" y2="18"></line>
                  </svg>
                  <span>Ver códigos de {{ sec.name }}</span>
                </span>
                <span class="sec-explore-arrow">&rarr;</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      <!-- Floating CAD Precision Toolbar (Modo Acomodo) -->
      <div class="floating-cad-palette" [class.minimized]="isCadPaletteMinimized()" *ngIf="editMode() && selectedRackForMove">
        <!-- Minimized Sleek Pill Bar -->
        <div class="cad-min-bar" *ngIf="isCadPaletteMinimized()" (click)="toggleCadPaletteMinimized()" title="Clic para expandir controles de precisión">
          <span class="cad-dot"></span>
          <strong class="mono">{{ selectedRackForMove.shelfCode }}</strong>
          <span class="cad-min-coords">X:{{ selectedRackForMove.posX }} Y:{{ selectedRackForMove.posY }} &bull; {{ selectedRackForMove.width || 54 }}x{{ selectedRackForMove.height || 54 }}px</span>
          <div class="cad-min-actions" (click)="$event.stopPropagation()">
            <button class="cad-btn-icon" (click)="toggleCadPaletteMinimized()" title="Expandir panel CAD">⛶</button>
            <button class="cad-btn-icon" (click)="selectedRackForMove = null" title="Deseleccionar">✕</button>
          </div>
        </div>

        <!-- Expanded Full Controls -->
        <ng-container *ngIf="!isCadPaletteMinimized()">
          <div class="cad-header">
            <div class="cad-title" (click)="toggleCadPaletteMinimized()" style="cursor: pointer;" title="Clic para minimizar">
              <span class="cad-dot"></span>
              <strong class="mono">{{ selectedRackForMove.shelfCode }}</strong>
              <span class="cad-zone">({{ selectedRackForMove.shelfZone }})</span>
            </div>
            <div class="cad-header-btns">
              <button class="cad-min-btn" (click)="toggleCadPaletteMinimized()" title="Minimizar panel para no estorbar el croquis">—</button>
              <button class="cad-close-btn" (click)="selectedRackForMove = null" title="Deseleccionar">✕</button>
            </div>
          </div>
          
          <div class="cad-body">
            <div class="cad-fields-grid">
              <div class="cad-input-wrap">
                <label>X (px)</label>
                <input type="number" [(ngModel)]="selectedRackForMove.posX" (ngModelChange)="clampCoords(selectedRackForMove)" />
              </div>
              <div class="cad-input-wrap">
                <label>Y (px)</label>
                <input type="number" [(ngModel)]="selectedRackForMove.posY" (ngModelChange)="clampCoords(selectedRackForMove)" />
              </div>
              <div class="cad-input-wrap">
                <label>Ancho (W)</label>
                <input type="number" [(ngModel)]="selectedRackForMove.width" (ngModelChange)="clampCoords(selectedRackForMove)" />
              </div>
              <div class="cad-input-wrap">
                <label>Alto (H)</label>
                <input type="number" [(ngModel)]="selectedRackForMove.height" (ngModelChange)="clampCoords(selectedRackForMove)" />
              </div>
            </div>

            <div class="cad-buttons-row">
              <button type="button" class="btn btn-sm btn-outline-white cad-btn" (click)="rotateSelectedRack()" title="Rotar dimensiones 90°">
                ↻ Rotar 90°
              </button>
              <button type="button" class="btn btn-sm btn-outline-white cad-btn" (click)="openResizeShelfModal(selectedRackForMove)" title="Abrir plantillas de dimensiones estándar">
                Plantillas WxH
              </button>
            </div>

            <div class="cad-nudge-section">
              <div class="cad-nudge-pad">
                <button type="button" class="nudge-btn" (click)="nudgeSelected(0, -1)" title="Subir 1px (Shift: 10px)">▲</button>
                <div class="nudge-mid">
                  <button type="button" class="nudge-btn" (click)="nudgeSelected(-1, 0)" title="Izquierda 1px (Shift: 10px)">◀</button>
                  <button type="button" class="nudge-btn" (click)="nudgeSelected(1, 0)" title="Derecha 1px (Shift: 10px)">▶</button>
                </div>
                <button type="button" class="nudge-btn" (click)="nudgeSelected(0, 1)" title="Bajar 1px (Shift: 10px)">▼</button>
              </div>
              <span class="cad-nudge-hint font-xs">Flechas de teclado o pad (Shift = 10px)</span>
            </div>
          </div>
        </ng-container>
      </div>

      <!-- Shelf Inspector & Interactive Visual Rack Modal (Secciones A-G) -->
      <div class="modal-backdrop" *ngIf="inspectedShelf && !editMode()" (click)="closeInspectedShelf()">
        <div class="modal-box shelf-inspector-modal" (click)="$event.stopPropagation()">
          <div class="modal-header-row">
            <div *ngIf="!inlineRenamingShelf" class="header-info-col">
              <div class="font-xs text-muted uppercase">{{ inspectedShelf.plant || selectedPlant() }} &bull; {{ inspectedShelf.shelfZone }}</div>
              <div class="modal-title-inline">
                <h2 class="mono fw-800 modal-code-title">{{ inspectedShelf.shelfCode }}</h2>
                <span class="badge" [ngClass]="badgeForStatus(inspectedShelf)">
                  {{ statusLabel(inspectedShelf) }}
                </span>
                <button type="button" class="btn btn-xs btn-ghost btn-inline-pencil" (click)="startInlineShelfRename()" title="Cambiar rápidamente el nombre o código de este anaquel">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                  Cambiar Nombre
                </button>
                <button type="button" class="btn btn-xs btn-ghost btn-inline-resize" (click)="openResizeShelfModal(inspectedShelf)" title="Modificar tamaño y dimensiones (W x H) de este anaquel">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M9 3v18"></path><path d="M3 9h18"></path></svg>
                  Dimensionar ({{ inspectedShelf.width || 54 }}x{{ inspectedShelf.height || 54 }}px)
                </button>
              </div>
              <div class="font-sm text-secondary">{{ inspectedShelf.shelfDescription || inspectedShelf.shelfZone }}</div>
            </div>

            <!-- Inline Quick Rename Form -->
            <div *ngIf="inlineRenamingShelf" class="inline-rename-container">
              <div class="rename-inputs-grid">
                <div class="rename-field">
                  <label class="font-xs fw-700 text-muted">Código:</label>
                  <input type="text" class="input input-sm mono" [(ngModel)]="renameShelfCode" placeholder="Ej. PB-ACE-01" />
                </div>
                <div class="rename-field grow">
                  <label class="font-xs fw-700 text-muted">Nombre / Descripción:</label>
                  <input type="text" class="input input-sm" [(ngModel)]="renameShelfDesc" placeholder="Ej. ANAQUEL DE ACERO 01" />
                </div>
                <div class="rename-field">
                  <label class="font-xs fw-700 text-muted">Zona / Familia:</label>
                  <input type="text" class="input input-sm" [(ngModel)]="renameShelfZone" placeholder="Ej. Acero (1-19)" />
                </div>
              </div>
              <div class="rename-actions-row">
                <button type="button" class="btn btn-sm btn-primary" (click)="saveInlineShelfRename()" [disabled]="savingInlineRename()">
                  {{ savingInlineRename() ? 'Guardando...' : 'Guardar Nombre' }}
                </button>
                <button type="button" class="btn btn-sm btn-outline" (click)="cancelInlineShelfRename()">
                  Cancelar
                </button>
              </div>
            </div>

            <div class="modal-header-actions-group" *ngIf="!inlineRenamingShelf">
              <div class="compact-kpi-strip">
                <div class="c-kpi">
                  <span class="c-kpi-lbl">Piezas</span>
                  <span class="c-kpi-val mono text-primary-brand">{{ (inspectedShelf.totalPieces || 0) | number:'1.0-2' }}</span>
                </div>
                <div class="c-kpi">
                  <span class="c-kpi-lbl">Partidas</span>
                  <span class="c-kpi-val mono">{{ inspectedMaterials().length || inspectedShelf.recordCount || 0 }}</span>
                </div>
              </div>
              <button class="btn btn-sm btn-outline" (click)="openCroquisImportModal(inspectedShelf.shelfId)" title="Importar conteo semanal directo a este anaquel">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Importar Excel
              </button>
              <button class="btn btn-sm btn-outline-primary" (click)="startInlineShelfRename()" title="Cambiar rápidamente el nombre o descripción de este anaquel">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                Cambiar Nombre
              </button>
              <button class="modal-close-icon-btn" (click)="closeInspectedShelf()" title="Cerrar ventana (Esc)">✕</button>
            </div>
          </div>

          <!-- Interactive Rack Blueprint (Left) + Materials & Quick Level Assigner (Right) -->
          <div class="shelf-inspector-body">
            <!-- Left Pane: Visual Physical Rack Blueprint (A to J) -->
            <div class="rack-blueprint-card">
              <div class="blueprint-card-header">
                <span class="blueprint-kicker">CROQUIS DEL ANAQUEL ({{ isTenLevelShelf(inspectedShelf.shelfCode) ? 'S, A-J · 11 NIVELES' : 'S, A-G · 8 NIVELES' }})</span>
                <span class="font-xs text-muted">Clic en nivel para filtrar</span>
              </div>

              <!-- Visual Rack Graphic (Matches Official Blueprint) -->
              <div class="physical-rack-graphic">
                <!-- Yellow Top Header with Short Number -->
                <div class="rack-graphic-top-header mono">
                  {{ getRackShortHeader(inspectedShelf) }}
                </div>

                <!-- Main Frame: Mint Left Strip + Interactive Horizontal Shelf Tiers -->
                <div class="rack-graphic-main-frame">
                  <div class="rack-levels-sidebar">
                    <button
                      type="button"
                      *ngFor="let lvl of getRackLevelsForShelf(inspectedShelf)"
                      class="rack-level-tag mono"
                      [class.active-level]="selectedLevelFilter() === lvl"
                      (click)="toggleLevelFilter(lvl)"
                      [title]="'Filtrar materiales en Nivel ' + (lvl === 'S' ? 'S (Superior)' : lvl)"
                    >
                      {{ lvl }}
                    </button>
                  </div>

                  <div class="rack-tiers-container">
                    <div
                      *ngFor="let lvl of getRackLevelsForShelf(inspectedShelf)"
                      class="rack-tier-row"
                      [class.tier-selected]="selectedLevelFilter() === lvl"
                      [class.tier-populated]="getLevelStats(lvl).count > 0"
                      (click)="toggleLevelFilter(lvl)"
                      [title]="'Ver códigos del Nivel ' + (lvl === 'S' ? 'S (Superior)' : lvl)"
                    >
                      <!-- 4 Compartment Box Outlines -->
                      <div class="tier-boxes-strip">
                        <div class="tier-box-frame"></div>
                        <div class="tier-box-frame"></div>
                        <div class="tier-box-frame"></div>
                        <div class="tier-box-frame"></div>
                      </div>

                      <!-- Live Stats Overlay per Level -->
                      <div class="tier-info-overlay">
                        <span class="tier-stats-pill" [class.has-content]="getLevelStats(lvl).count > 0">
                          <ng-container *ngIf="getLevelStats(lvl).count > 0">
                            <strong>{{ getLevelStats(lvl).count }}</strong> cód. &bull; <strong>{{ getLevelStats(lvl).pieces | number:'1.0-0' }}</strong> pzas
                          </ng-container>
                          <ng-container *ngIf="getLevelStats(lvl).count === 0">
                            Nivel {{ lvl === 'S' ? 'S (Superior)' : lvl }} vacío
                          </ng-container>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Bottom Rack Base Label -->
                <div class="rack-graphic-bottom-base mono">
                  {{ inspectedShelf.shelfCode }}
                </div>
              </div>

              <!-- Blueprint Quick Actions -->
              <div class="rack-blueprint-footer">
                <button
                  type="button"
                  class="btn btn-sm btn-block"
                  [class.btn-primary]="selectedLevelFilter() === 'TODOS'"
                  [class.btn-outline]="selectedLevelFilter() !== 'TODOS'"
                  (click)="selectedLevelFilter.set('TODOS')"
                >
                  Ver Todo el Anaquel ({{ inspectedMaterials().length }})
                </button>
                <div class="unassigned-alert-pill" *ngIf="getLevelStats('SIN_NIVEL').count > 0" (click)="selectedLevelFilter.set('SIN_NIVEL')">
                  <strong>{{ getLevelStats('SIN_NIVEL').count }}</strong> partidas sin sección asignada
                </div>
              </div>
            </div>

            <!-- Right Pane: Materials List & 1-Click Section Assignment -->
            <div class="shelf-materials-card">
              <div class="materials-card-header">
                <div class="materials-title-row">
                  <span class="blueprint-kicker">MATERIALES EN ANAQUEL &bull; ASIGNACIÓN POR SECCIÓN</span>
                  <span class="materials-count-badge mono">
                    {{ filteredMaterials().length }} / {{ inspectedMaterials().length }} partidas
                  </span>
                </div>

                <!-- Level Filter Pills -->
                <div class="level-pills-bar">
                  <button
                    type="button"
                    class="lvl-pill-btn"
                    [class.active]="selectedLevelFilter() === 'TODOS'"
                    (click)="selectedLevelFilter.set('TODOS')"
                  >
                    Todos ({{ inspectedMaterials().length }})
                  </button>
                  <button
                    type="button"
                    *ngFor="let lvl of getRackLevelsForShelf(inspectedShelf)"
                    class="lvl-pill-btn mono"
                    [class.active]="selectedLevelFilter() === lvl"
                    [class.has-items]="getLevelStats(lvl).count > 0"
                    (click)="toggleLevelFilter(lvl)"
                  >
                    {{ lvl }} ({{ getLevelStats(lvl).count }})
                  </button>
                  <button
                    type="button"
                    *ngIf="getLevelStats('SIN_NIVEL').count > 0"
                    class="lvl-pill-btn unassigned-pill"
                    [class.active]="selectedLevelFilter() === 'SIN_NIVEL'"
                    (click)="selectedLevelFilter.set('SIN_NIVEL')"
                  >
                    Sin Nivel ({{ getLevelStats('SIN_NIVEL').count }})
                  </button>
                </div>

                <!-- Search within this Shelf -->
                <div class="shelf-mat-search-wrap">
                  <input
                    type="text"
                    class="input input-sm mono"
                    [ngModel]="shelfMaterialSearch()"
                    (ngModelChange)="shelfMaterialSearch.set($event)"
                    placeholder="Buscar clave o refacción en este anaquel..."
                  />
                  <button *ngIf="shelfMaterialSearch()" type="button" class="btn-clear-mat-search" (click)="shelfMaterialSearch.set('')">✕</button>
                </div>
              </div>

              <!-- Materials Table with 1-Click Level Assignment -->
              <div class="materials-scroll-list">
                <div *ngIf="loadingMaterials()" class="materials-empty-box">
                  Cargando partidas del anaquel...
                </div>

                <div *ngIf="!loadingMaterials() && filteredMaterials().length === 0" class="materials-empty-box">
                  <ng-container *ngIf="inspectedMaterials().length === 0">
                    No hay materiales capturados en este anaquel todavía. Pulsa <strong>"Abrir Cédula"</strong> para registrar códigos y secciones.
                  </ng-container>
                  <ng-container *ngIf="inspectedMaterials().length > 0">
                    No se encontraron partidas en el filtro seleccionado (<strong>{{ selectedLevelFilter() === 'SIN_NIVEL' ? 'Sin Nivel' : 'Nivel ' + selectedLevelFilter() }}</strong>).
                  </ng-container>
                </div>

                <table *ngIf="!loadingMaterials() && filteredMaterials().length > 0" class="materials-assign-table">
                  <thead>
                    <tr>
                      <th class="mat-th-code">Clave Material</th>
                      <th class="mat-th-qty text-right">Piezas</th>
                      <th class="mat-th-sec text-center">Nivel</th>
                      <th class="mat-th-assign text-center">Asignar Nivel (1 Clic)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let item of filteredMaterials()" [class.row-sec-matched]="item.section && item.section === selectedLevelFilter()">
                      <td class="mat-td-code mono fw-700">
                        <span
                          class="mat-code-link clickable"
                          (click)="openProductPlanning(item)"
                          title="Ver detalle del producto y cálculo de reabastecimiento"
                        >
                          {{ item.capturedCode }}
                        </span>
                        <span *ngIf="getItemLocationCode(item) !== '--'" class="mat-item-location-pill mono" (click)="openProductPlanning(item)" title="Ver ubicación en estante">
                          {{ getItemLocationCode(item) }}
                        </span>
                        <span *ngIf="getItemDisplayDescription(item)" class="mat-item-notes">
                          {{ getItemDisplayDescription(item) }}
                        </span>
                      </td>
                      <td class="mat-td-qty text-right mono fw-700">
                        {{ item.quantity | number:'1.0-2' }}
                      </td>
                      <td class="mat-td-sec text-center">
                        <span *ngIf="item.section" class="badge-level-chip mono" [ngClass]="'level-chip-' + item.section.toLowerCase()">
                          {{ item.section }}
                        </span>
                        <span *ngIf="!item.section" class="badge-level-unassigned">
                          --
                        </span>
                      </td>
                      <td class="mat-td-assign text-center">
                        <div class="quick-level-buttons">
                          <button
                            *ngFor="let btnLvl of getRackLevelsForShelf(inspectedShelf)"
                            type="button"
                            class="quick-lvl-btn mono"
                            [class.btn-active-lvl]="item.section === btnLvl"
                            [disabled]="updatingRecordId() === item.id"
                            (click)="assignSectionToMaterial(item, btnLvl)"
                            [title]="'Asignar ' + item.capturedCode + ' al Nivel ' + btnLvl"
                          >
                            {{ btnLvl }}
                          </button>
                          <button
                            *ngIf="item.section"
                            type="button"
                            class="quick-lvl-clear-btn"
                            [disabled]="updatingRecordId() === item.id"
                            (click)="assignSectionToMaterial(item, '')"
                            title="Quitar sección asignada"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="modal-footer-advanced">
            <div class="footer-left-group">
              <button class="btn btn-secondary" (click)="closeInspectedShelf()">Cerrar</button>
              <button
                *ngIf="!isUntouched(inspectedShelf)"
                class="btn btn-outline"
                (click)="resetShelfToUntouched(inspectedShelf)"
                title="Quitar marca de contabilizado o en revisión si se marcó por accidente"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                  <path d="M3 3v5h5"></path>
                </svg>
                Sin Iniciar
              </button>
              <button
                *ngIf="(inspectedShelf.totalPieces || 0) > 0 || (inspectedShelf.recordCount || 0) > 0"
                class="btn btn-outline-danger"
                (click)="openClearShelfCountsModal(inspectedShelf)"
                title="Eliminar conteos únicamente de este anaquel y ponerlo a 0 pzas en estado Pendiente"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                Limpiar Anaquel
              </button>
            </div>
            <div class="footer-right-group">
              <button
                *ngIf="inspectedShelf.recordCount > 0 || inspectedShelf.totalPieces > 0"
                class="btn btn-outline"
                (click)="downloadShelfMaterialsZip(inspectedShelf)"
                title="Descargar todos los códigos QR de materiales de este anaquel en archivo ZIP con nombres individuales como CODIGO.png"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                QRs Materiales (.zip)
              </button>
              <button class="btn btn-outline-primary" (click)="downloadShelfQrPng(inspectedShelf)" title="Descargar código QR puro en PNG con el nombre del anaquel para pegar o rotular">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Descargar QR (.png)
              </button>
              <button class="btn btn-secondary" (click)="toggleShelfStatus(inspectedShelf)">
                {{ isCompleted(inspectedShelf) ? 'Reabrir Anaquel' : 'Marcar Contabilizado' }}
              </button>
              <button class="btn btn-outline-danger" (click)="confirmDeleteShelf(inspectedShelf)" title="Eliminar este anaquel del almacén">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Quitar Anaquel
              </button>
              <button class="btn btn-primary" (click)="goToCapture(inspectedShelf)">
                Abrir Cédula &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal / Pestaña: Explorador Completo de Códigos por Familia -->
      <div class="modal-backdrop" *ngIf="activeFamilyExplorer() as fam" (click)="closeFamilyExplorer()">
        <div class="modal-box family-explorer-modal" (click)="$event.stopPropagation()">
          <!-- Explorer Header -->
          <div class="fam-explorer-header">
            <div class="fam-header-left">
              <div class="font-xs text-muted uppercase">
                EXPLORADOR DE FAMILIA &bull; {{ selectedPlant() }}
              </div>
              <div class="fam-title-row">
                <span class="fam-color-dot" [style.background-color]="fam.color"></span>
                <h2 class="fam-modal-title">{{ fam.name }}</h2>
                <span class="fam-pct-badge mono" [class.pct-complete]="fam.percentage === 100">
                  {{ fam.completedShelves }} / {{ fam.totalShelves }} anaqueles ({{ fam.percentage }}%)
                </span>
              </div>
            </div>

            <div class="fam-header-actions">
              <div class="compact-kpi-strip">
                <div class="c-kpi">
                  <span class="c-kpi-lbl">Partidas</span>
                  <span class="c-kpi-val mono">{{ familyCounts().length | number:'1.0-0' }}</span>
                </div>
                <div class="c-kpi">
                  <span class="c-kpi-lbl">Códigos Únicos</span>
                  <span class="c-kpi-val mono">{{ familyUniqueCodeCount() | number:'1.0-0' }}</span>
                </div>
                <div class="c-kpi">
                  <span class="c-kpi-lbl">Piezas Totales</span>
                  <span class="c-kpi-val mono text-primary-brand">{{ familyTotalPieces() | number:'1.0-2' }}</span>
                </div>
              </div>
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                (click)="openImportSaeForFamily(fam)"
                title="Importar catalogo o levantamiento de Aspel SAE para esta seccion"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="12" y1="18" x2="12" y2="12"></line>
                  <polyline points="9 15 12 12 15 15"></polyline>
                </svg>
                Importar del SAE
              </button>
              <button
                type="button"
                class="btn btn-sm btn-primary"
                (click)="openLocationAssignerForFamily(fam)"
                title="Asignar anaquel, nivel A-G y pasillo a materiales de esta seccion con generacion automatica de ubicacion"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="9" x2="21" y2="9"></line>
                  <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
                Asignar Ubicaciones
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-success"
                (click)="exportFamilyPlanningExcel(fam)"
                [disabled]="filteredFamilyCounts().length === 0"
                title="Descargar archivo Excel con ubicaciones generadas, minimos, puntos de reorden y sugerencias de compra"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Exportar Min/Max
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline"
                (click)="exportFamilyCsv(fam)"
                [disabled]="filteredFamilyCounts().length === 0"
                title="Descargar listado de esta familia en formato CSV para Excel"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                Exportar CSV
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline"
                (click)="refreshFamilyCounts()"
                [disabled]="loadingFamilyCounts()"
                title="Actualizar datos desde el servidor"
              >
                Actualizar
              </button>
              <button type="button" class="modal-close-icon-btn" (click)="closeFamilyExplorer()" title="Cerrar pestaña">✕</button>
            </div>
          </div>

          <!-- Family Switcher Tabs Ribbon (Permite brincar entre Acero, Kuriyama, YPC, Dixon, etc.) -->
          <div class="fam-tabs-ribbon">
            <button
              type="button"
              *ngFor="let tab of sectionsProgress()"
              class="fam-tab-btn"
              [class.active]="fam.id === tab.id"
              [style.--tab-color]="tab.color"
              (click)="switchFamilyTab(tab)"
            >
              <span class="fam-tab-dot" [style.background-color]="tab.color"></span>
              <span>{{ tab.name }}</span>
              <span class="fam-tab-count mono">{{ tab.totalPieces | number:'1.0-0' }}p</span>
            </button>
          </div>

          <!-- Filter & View Mode Toolbar -->
          <div class="fam-toolbar">
            <div class="fam-search-wrap">
              <input
                type="text"
                class="input input-sm mono"
                [ngModel]="familySearchQuery()"
                (ngModelChange)="familySearchQuery.set($event)"
                placeholder="Buscar clave, código, descripción o anaquel..."
              />
              <button *ngIf="familySearchQuery()" type="button" class="btn-clear-mat-search" (click)="familySearchQuery.set('')">✕</button>
            </div>

            <select
              class="select select-sm fam-shelf-select mono"
              [ngModel]="familyShelfFilter()"
              (ngModelChange)="familyShelfFilter.set($event)"
              title="Filtrar por un anaquel específico de esta familia"
            >
              <option value="TODOS">Todos los anaqueles ({{ familyShelves().length }})</option>
              <option *ngFor="let sh of familyShelves()" [value]="sh.shelfCode">
                {{ sh.shelfCode }} ({{ sh.totalPieces | number:'1.0-0' }} pzas)
              </option>
            </select>

            <button
              *ngIf="familyShelfFilter() !== 'TODOS'"
              type="button"
              class="btn btn-sm btn-outline btn-rename-fam-shelf"
              (click)="openEditShelfByCode(familyShelfFilter())"
              title="Cambiar el nombre o código de este anaquel"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              Renombrar Anaquel
            </button>

            <div class="fam-view-toggle">
              <button
                type="button"
                class="fam-view-btn"
                [class.active]="familyViewMode() === 'DETALLE'"
                (click)="familyViewMode.set('DETALLE')"
                title="Ver cada partida con su anaquel y asignación rápida de nivel A-G"
              >
                Por Anaquel ({{ filteredFamilyCounts().length }})
              </button>
              <button
                type="button"
                class="fam-view-btn"
                [class.active]="familyViewMode() === 'CONSOLIDADO'"
                (click)="familyViewMode.set('CONSOLIDADO')"
                title="Sumar existencias totales por código único en toda esta familia"
              >
                Consolidado ({{ consolidatedFamilyCounts().length }})
              </button>
            </div>
          </div>

          <!-- Level Filter Strip (only in Detail mode) -->
          <div class="fam-level-strip" *ngIf="familyViewMode() === 'DETALLE'">
            <span class="fam-strip-lbl">Filtrar Nivel:</span>
            <button
              type="button"
              class="lvl-pill-btn"
              [class.active]="familyLevelFilter() === 'TODOS'"
              (click)="familyLevelFilter.set('TODOS')"
            >
              Todos ({{ familyCounts().length }})
            </button>
            <button
              type="button"
              *ngFor="let lvl of getFamilyFilterLevels(fam)"
              class="lvl-pill-btn mono"
              [class.active]="familyLevelFilter() === lvl"
              [class.has-items]="getFamilyLevelCount(lvl) > 0"
              (click)="familyLevelFilter.set(familyLevelFilter() === lvl ? 'TODOS' : lvl)"
            >
              Nivel {{ lvl }} ({{ getFamilyLevelCount(lvl) }})
            </button>
            <button
              type="button"
              class="lvl-pill-btn unassigned-pill"
              [class.active]="familyLevelFilter() === 'SIN_NIVEL'"
              (click)="familyLevelFilter.set(familyLevelFilter() === 'SIN_NIVEL' ? 'TODOS' : 'SIN_NIVEL')"
            >
              Sin Nivel ({{ getFamilyLevelCount('SIN_NIVEL') }})
            </button>
          </div>

          <!-- Data Table Container -->
          <div class="fam-table-scroll">
            <div *ngIf="loadingFamilyCounts()" class="materials-empty-box">
              Cargando catálogo completo de {{ fam.name }}...
            </div>

            <!-- DETALLE VIEW (Por Partida / Anaquel) -->
            <ng-container *ngIf="!loadingFamilyCounts() && familyViewMode() === 'DETALLE'">
              <div *ngIf="filteredFamilyCounts().length === 0" class="materials-empty-box">
                <ng-container *ngIf="familyCounts().length === 0">
                  Aún no hay códigos contabilizados en los anaqueles de <strong>{{ fam.name }}</strong>.
                </ng-container>
                <ng-container *ngIf="familyCounts().length > 0">
                  No se encontraron coincidencias con los filtros actuales.
                </ng-container>
              </div>

              <table *ngIf="filteredFamilyCounts().length > 0" class="materials-assign-table fam-table">
                <thead>
                  <tr>
                    <th class="fam-th-shelf">Ubicación</th>
                    <th class="fam-th-code">Código / Clave Material</th>
                    <th class="fam-th-qty text-right">Piezas</th>
                    <th class="fam-th-assign text-center">Asignar Nivel</th>
                    <th class="fam-th-act text-center">Ir</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let item of visibleFamilyCounts()">
                    <td class="fam-td-shelf">
                      <button
                        type="button"
                        class="fam-shelf-link mono"
                        (click)="openProductPlanning(item)"
                        title="Ver ficha maestra y desglose de ubicación"
                      >
                        {{ getItemLocationCode(item) }}
                      </button>
                    </td>
                    <td class="mat-td-code mono fw-700">
                      <span
                        class="mat-code-link clickable"
                        (click)="openProductPlanning(item)"
                        title="Ver detalle del producto y cálculo de reabastecimiento"
                      >
                        {{ item.capturedCode }}
                      </span>
                      <span *ngIf="getItemDisplayDescription(item)" class="mat-item-notes">
                        {{ getItemDisplayDescription(item) }}
                      </span>
                    </td>
                    <td class="mat-td-qty text-right mono fw-700">
                      {{ item.quantity | number:'1.0-2' }}
                    </td>
                    <td class="text-center">
                      <div class="quick-level-buttons">
                        <button
                          *ngFor="let btnLvl of getRackLevelsForShelfCode(item.shelfCode)"
                          type="button"
                          class="quick-lvl-btn mono"
                          [class.btn-active-lvl]="item.section === btnLvl"
                          [disabled]="updatingRecordId() === item.id"
                          (click)="assignSectionFromFamilyExplorer(item, btnLvl)"
                          [title]="'Asignar al Nivel ' + btnLvl"
                        >
                          {{ btnLvl }}
                        </button>
                        <button
                          *ngIf="item.section"
                          type="button"
                          class="quick-lvl-clear-btn"
                          [disabled]="updatingRecordId() === item.id"
                          (click)="assignSectionFromFamilyExplorer(item, '')"
                          title="Quitar nivel"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                    <td class="text-center">
                      <button
                        type="button"
                        class="btn btn-xs btn-outline"
                        (click)="goToCaptureById(item.shelfId)"
                        title="Abrir Cédula de Conteo de este anaquel"
                      >
                        Cédula
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div class="fam-load-more" *ngIf="filteredFamilyCounts().length > familyDisplayLimit()">
                <span>Mostrando {{ familyDisplayLimit() }} de {{ filteredFamilyCounts().length }} partidas</span>
                <button type="button" class="btn btn-sm btn-outline" (click)="familyDisplayLimit.set(familyDisplayLimit() + 250)">
                  Cargar +250
                </button>
                <button type="button" class="btn btn-sm btn-primary" (click)="familyDisplayLimit.set(filteredFamilyCounts().length)">
                  Mostrar todas ({{ filteredFamilyCounts().length }})
                </button>
              </div>
            </ng-container>

            <!-- CONSOLIDADO VIEW (Sumado por Código Único) -->
            <ng-container *ngIf="!loadingFamilyCounts() && familyViewMode() === 'CONSOLIDADO'">
              <div *ngIf="consolidatedFamilyCounts().length === 0" class="materials-empty-box">
                No hay códigos consolidados para los filtros seleccionados.
              </div>

              <table *ngIf="consolidatedFamilyCounts().length > 0" class="materials-assign-table fam-table">
                <thead>
                  <tr>
                    <th class="fam-th-code">Código / Clave Material</th>
                    <th class="fam-th-locations">Ubicación (Anaqueles y Niveles)</th>
                    <th class="fam-th-qty text-right">Total Piezas</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let row of visibleConsolidatedCounts()">
                    <td class="mat-td-code mono fw-700">
                      <span
                        class="mat-code-link clickable"
                        (click)="openProductPlanning(row)"
                        title="Ver detalle del producto y cálculo de reabastecimiento"
                      >
                        {{ row.code }}
                      </span>
                      <span *ngIf="getItemDisplayDescription(row)" class="mat-item-notes">
                        {{ getItemDisplayDescription(row) }}
                      </span>
                    </td>
                    <td>
                      <div class="fam-loc-chips">
                        <button
                          type="button"
                          *ngFor="let loc of row.locations"
                          class="fam-loc-chip mono"
                          (click)="openShelfFromFamilyExplorer(loc.shelfId)"
                          [title]="'Abrir anaquel ' + loc.shelfCode"
                        >
                          {{ loc.shelfCode }}<span *ngIf="loc.section" class="loc-sec-tag"> &middot; {{ loc.section }}</span> ({{ loc.qty | number:'1.0-0' }})
                        </button>
                      </div>
                    </td>
                    <td class="mat-td-qty text-right mono fw-700">
                      {{ row.totalQty | number:'1.0-2' }}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div class="fam-load-more" *ngIf="consolidatedFamilyCounts().length > familyDisplayLimit()">
                <span>Mostrando {{ familyDisplayLimit() }} de {{ consolidatedFamilyCounts().length }} códigos únicos</span>
                <button type="button" class="btn btn-sm btn-primary" (click)="familyDisplayLimit.set(consolidatedFamilyCounts().length)">
                  Mostrar todos ({{ consolidatedFamilyCounts().length }})
                </button>
              </div>
            </ng-container>
          </div>

          <!-- Explorer Footer -->
          <div class="modal-footer-advanced">
            <div class="footer-left-group font-xs text-muted">
              <span>Mostrando <strong>{{ familyViewMode() === 'DETALLE' ? filteredFamilyCounts().length : consolidatedFamilyCounts().length }}</strong> registros &bull; Haz clic en cualquier anaquel para ver su plano físico A-G.</span>
            </div>
            <div class="footer-right-group">
              <button type="button" class="btn btn-secondary" (click)="closeFamilyExplorer()">Volver al Croquis</button>
            </div>
          </div>
        </div>
      </div>

      <!-- MODAL: ASIGNADOR DE UBICACIONES FISICAS Y PLANIFICACION SAE -->
      <div class="modal-backdrop location-assigner-backdrop" *ngIf="locationAssignerFamily() as fam" (click)="closeLocationAssigner()">
        <div class="modal-box location-assigner-modal" (click)="$event.stopPropagation()">
          
          <!-- Assigner Header -->
          <div class="assigner-modal-header">
            <div class="assigner-header-left">
              <div class="assigner-brand-crumbs">
                <span class="planning-brand">INTERFLU INVENTORY</span>
                <span class="crumb-sep">/</span>
                <span class="crumb-cat">{{ fam.name }}</span>
              </div>
              <h2 class="assigner-title">Asignador de Ubicaciones Físicas y Planificación SAE</h2>
              <p class="assigner-sub">
                Asigna planta, pasillo, anaquel y nivel (A-G) para generar automáticamente el código arquitectónico (PB3-15A-1 / PA4-1B-3) y calcular mínimos y máximos.
              </p>
            </div>

            <div class="assigner-header-right">
              <div class="assigner-stats-strip">
                <div class="a-stat">
                  <span class="a-stat-lbl">Total Materiales</span>
                  <span class="a-stat-val mono">{{ locationAssignerRows().length }}</span>
                </div>
                <div class="a-stat" [class.highlight-pending]="locationAssignerPendingCount() > 0">
                  <span class="a-stat-lbl">Por Asignar</span>
                  <span class="a-stat-val mono">{{ locationAssignerPendingCount() }}</span>
                </div>
                <div class="a-stat" *ngIf="locationAssignerDirtyCount() > 0">
                  <span class="a-stat-lbl">Modificados</span>
                  <span class="a-stat-val mono text-primary-brand">{{ locationAssignerDirtyCount() }}</span>
                </div>
              </div>
              <button type="button" class="modal-close-icon-btn" (click)="closeLocationAssigner()" title="Cerrar ventana (Esc)">✕</button>
            </div>
          </div>

          <!-- Quick Bulk Fill Ribbon (Asignacion Rapida en Bloque) -->
          <div class="bulk-fill-ribbon">
            <div class="bulk-fill-header">
              <span class="bulk-fill-title">Herramienta de Asignación Rápida Masiva:</span>
              <span class="bulk-fill-hint">Rellena anaquel, nivel y pasillo en lote para materiales importados de SAE</span>
            </div>
            <div class="bulk-fill-controls">
              <div class="bulk-field">
                <label>Planta:</label>
                <select class="select select-sm mono" [ngModel]="bulkPlant()" (ngModelChange)="bulkPlant.set($event)">
                  <option value="PB">PB (Planta Baja)</option>
                  <option value="PA">PA (Planta Alta)</option>
                </select>
              </div>

              <div class="bulk-field">
                <label>Pasillo:</label>
                <input
                  type="text"
                  class="input input-sm mono bulk-aisle-input"
                  [ngModel]="bulkAisle()"
                  (ngModelChange)="bulkAisle.set($event)"
                  placeholder="3"
                />
              </div>

              <div class="bulk-field">
                <label>Anaquel Destino:</label>
                <select class="select select-sm mono" [ngModel]="bulkShelfId()" (ngModelChange)="bulkShelfId.set($event)">
                  <option [value]="0">Seleccionar Anaquel...</option>
                  <option *ngFor="let s of familyShelves()" [value]="s.shelfId">
                    {{ s.shelfCode }} &bull; {{ s.shelfDescription || s.shelfZone }}
                  </option>
                </select>
              </div>

              <div class="bulk-field">
                <label>Nivel:</label>
                <div class="bulk-level-buttons">
                  <button
                    type="button"
                    *ngFor="let lvl of getBulkFillLevels()"
                    class="btn-lvl-mini"
                    [class.active]="bulkLevel() === lvl"
                    (click)="bulkLevel.set(lvl)"
                  >
                    {{ lvl }}
                  </button>
                </div>
              </div>

              <div class="bulk-field">
                <label>Posición:</label>
                <input
                  type="text"
                  class="input input-sm mono bulk-pos-input"
                  [ngModel]="bulkPosition()"
                  (ngModelChange)="bulkPosition.set($event)"
                  placeholder="1"
                />
              </div>

              <div class="bulk-preview-box">
                <span class="preview-lbl">Código generado:</span>
                <span class="preview-val mono">
                  {{ buildLocationCode(bulkPlant(), bulkAisle(), getBulkShelfNum(), bulkLevel(), bulkPosition()) }}
                </span>
              </div>

              <div class="bulk-actions">
                <button
                  type="button"
                  class="btn btn-sm btn-outline-primary"
                  (click)="applyBulkFill(true)"
                  title="Aplicar valores a todos los materiales que todavía no tienen nivel o anaquel"
                >
                  Asignar a Pendientes
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline"
                  (click)="applyBulkFill(false)"
                  title="Aplicar a todos los materiales de la tabla"
                >
                  Asignar a Todos
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-bulk-selected"
                  *ngIf="locationAssignerSelectedCount() > 0"
                  (click)="applyToSelectedRows()"
                  title="Aplicar anaquel y nivel a los materiales seleccionados con la casilla"
                >
                  Aplicar a Seleccionados ({{ locationAssignerSelectedCount() }})
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-master-catalog"
                  (click)="autoAssignMasterCatalogForFamily()"
                  title="Vincular automáticamente anaquel y nivel desde el catálogo maestro físico de Interflu"
                >
                  Auto-Asignar Catálogo Maestro
                </button>
              </div>
            </div>
          </div>

          <!-- Filter & Search Bar -->
          <div class="assigner-toolbar">
            <div class="assigner-search-wrap">
              <input
                type="text"
                class="input input-sm mono"
                [ngModel]="locationAssignerSearch()"
                (ngModelChange)="locationAssignerSearch.set($event)"
                placeholder="Filtrar por clave, descripción o código de ubicación..."
              />
              <button
                *ngIf="locationAssignerSearch()"
                type="button"
                class="btn-clear-mat-search"
                (click)="locationAssignerSearch.set('')"
              >✕</button>
            </div>

            <div class="assigner-filter-tabs">
              <button
                type="button"
                class="btn-filter-tab"
                [class.active]="locationAssignerFilter() === 'TODOS'"
                (click)="locationAssignerFilter.set('TODOS')"
              >
                Todos ({{ locationAssignerRows().length }})
              </button>
              <button
                type="button"
                class="btn-filter-tab filter-tab-defined"
                [class.active]="locationAssignerFilter() === 'ASIGNADOS'"
                (click)="locationAssignerFilter.set('ASIGNADOS')"
              >
                Definidos ({{ locationAssignerDefinedCount() }})
              </button>
              <button
                type="button"
                class="btn-filter-tab filter-tab-pending"
                [class.active]="locationAssignerFilter() === 'PENDIENTES'"
                (click)="locationAssignerFilter.set('PENDIENTES')"
              >
                No Definidos / Pendientes ({{ locationAssignerPendingCount() }})
              </button>
              <button
                type="button"
                class="btn-filter-tab filter-tab-obsolete"
                [class.active]="locationAssignerFilter() === 'OBSOLETOS'"
                (click)="locationAssignerFilter.set('OBSOLETOS')"
                *ngIf="locationAssignerObsoleteCount() > 0"
              >
                Marcados ELIMINAR / SAE ({{ locationAssignerObsoleteCount() }})
              </button>
            </div>

            <div class="assigner-toolbar-actions" *ngIf="locationAssignerObsoleteCount() > 0">
              <button
                type="button"
                class="btn btn-xs btn-outline-danger"
                (click)="purgeObsoleteCountsFromSession()"
                title="Eliminar de la sesión todas las partidas marcadas con ELIMINAR o E"
              >
                Depurar Códigos ELIMINAR ({{ locationAssignerObsoleteCount() }})
              </button>
            </div>
          </div>

          <!-- Table Body -->
          <div class="assigner-table-container">
            <table class="assigner-table">
              <thead>
                <tr>
                  <th style="width: 36px;" class="text-center">
                    <input
                      type="checkbox"
                      class="checkbox-table-header"
                      [checked]="areAllAssignerRowsSelected()"
                      (change)="toggleSelectAllAssignerRows($any($event.target).checked)"
                      title="Seleccionar o deseleccionar todas las filas visibles"
                    />
                  </th>
                  <th style="width: 140px;">Clave SAE</th>
                  <th>Descripción del Material</th>
                  <th style="width: 70px;">Planta</th>
                  <th style="width: 60px;">Pasillo</th>
                  <th style="width: 150px;">Anaquel</th>
                  <th style="width: 160px;">Nivel</th>
                  <th style="width: 60px;">Posición</th>
                  <th style="width: 130px;">Ubicación FÍSICA</th>
                  <th style="width: 80px;" class="text-right">Stock</th>
                  <th style="width: 110px;" class="text-right">Mín / Reorden</th>
                  <th style="width: 90px;" class="text-right">Cuánto Pedir</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  *ngFor="let row of locationAssignerFilteredRows()"
                  [class.row-dirty]="row.isDirty"
                  [class.row-undefined]="isRowUndefined(row)"
                  [class.row-selected]="row.isSelected"
                  [class.row-obsolete]="row.isObsolete"
                >
                  <td class="text-center">
                    <input
                      type="checkbox"
                      class="checkbox-table-row"
                      [checked]="!!row.isSelected"
                      (change)="toggleRowSelection(row)"
                    />
                  </td>
                  <td class="td-code mono fw-700">
                    {{ row.code }}
                    <span *ngIf="isRowUndefined(row)" class="badge-undefined-tag" title="Partida sin anaquel o sin nivel físico asignado">NO DEFINIDO</span>
                    <span *ngIf="row.isObsolete" class="badge-obsolete-tag" title="Partida marcada para eliminar u obsoleta en SAE">ELIMINAR SAE</span>
                  </td>
                  <td class="td-desc">
                    <span class="desc-text">{{ row.description }}</span>
                    <span *ngIf="row.isDirty" class="dirty-badge">Sin guardar</span>
                  </td>
                  <td>
                    <select
                      class="select select-xs mono"
                      [(ngModel)]="row.plant"
                      (ngModelChange)="onRowLocationFieldChange(row)"
                    >
                      <option value="PB">PB</option>
                      <option value="PA">PA</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      class="input input-xs mono text-center"
                      [(ngModel)]="row.aisle"
                      (ngModelChange)="onRowLocationFieldChange(row)"
                      placeholder="3"
                    />
                  </td>
                  <td>
                    <select
                      class="select select-xs mono"
                      [ngModel]="row.shelfId"
                      (ngModelChange)="onRowShelfChange(row, $event)"
                    >
                      <option [value]="0">Sin Anaquel</option>
                      <option *ngFor="let s of familyShelves()" [value]="s.shelfId">
                        {{ s.shelfCode }} &bull; {{ s.shelfDescription || s.shelfZone }}
                      </option>
                    </select>
                  </td>
                  <td>
                    <div class="row-level-pills">
                      <button
                        type="button"
                        *ngFor="let lvl of getLevelsForRow(row)"
                        class="btn-lvl-pill"
                        [class.active]="row.level === lvl"
                        (click)="onRowLevelSelect(row, lvl)"
                      >
                        {{ lvl }}
                      </button>
                    </div>
                  </td>
                  <td>
                    <input
                      type="text"
                      class="input input-xs mono text-center"
                      [(ngModel)]="row.position"
                      (ngModelChange)="onRowLocationFieldChange(row)"
                      placeholder="1"
                    />
                  </td>
                  <td>
                    <span
                      class="loc-code-badge mono"
                      [class.badge-complete]="row.locationCode && row.level"
                      [class.badge-incomplete]="!row.locationCode || !row.level"
                      [title]="'Ubicación arquitectónica: ' + (row.locationCode || 'Incompleta')"
                    >
                      {{ row.locationCode || 'Sin Asignar' }}
                    </span>
                  </td>
                  <td class="text-right mono fw-700">{{ row.quantity | number:'1.0-0' }}</td>
                  <td class="text-right mono font-xs">
                    <span class="text-muted">{{ row.minimoSeguridad }}</span> / <span class="fw-700">{{ row.puntoReorden }}</span>
                  </td>
                  <td class="text-right mono">
                    <span [class.text-danger-brand]="row.cuantoPedir > 0" [class.fw-700]="row.cuantoPedir > 0">
                      {{ row.cuantoPedir > 0 ? (row.cuantoPedir + ' pz') : '0' }}
                    </span>
                  </td>
                </tr>

                <tr *ngIf="locationAssignerFilteredRows().length === 0">
                  <td colspan="12" class="text-center text-muted" style="padding: 2.5rem 1rem;">
                    No se encontraron materiales con los filtros seleccionados.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Assigner Footer -->
          <div class="modal-footer-advanced">
            <div class="footer-left-group">
              <span class="text-muted font-xs" *ngIf="locationAssignerDirtyCount() === 0">
                Todas las ubicaciones están sincronizadas con la base de datos.
              </span>
              <span class="text-warning-brand font-xs fw-700" *ngIf="locationAssignerDirtyCount() > 0">
                Tienes {{ locationAssignerDirtyCount() }} cambio(s) pendiente(s) por guardar en el servidor.
              </span>
            </div>

            <div class="footer-right-group">
              <button
                type="button"
                class="btn btn-outline-success btn-sm"
                (click)="exportLocationAssignerCsv('TODOS')"
                title="Descargar todos los materiales de la sección en Excel/CSV"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Exportar Todos (.csv)
              </button>
              <button
                type="button"
                class="btn btn-outline-primary btn-sm"
                (click)="exportLocationAssignerCsv('DEFINIDOS')"
                title="Exportar únicamente las partidas con anaquel y nivel asignado"
              >
                Exportar Definidos ({{ locationAssignerDefinedCount() }})
              </button>
              <button
                type="button"
                class="btn btn-outline-warning btn-sm"
                (click)="exportLocationAssignerCsv('NO_DEFINIDOS')"
                title="Exportar las partidas pendientes sin anaquel o sin nivel asignado"
              >
                Exportar No Definidos ({{ locationAssignerPendingCount() }})
              </button>
              <button
                type="button"
                class="btn btn-primary"
                [disabled]="savingLocations() || locationAssignerDirtyCount() === 0"
                (click)="saveLocationAssignerChanges()"
                title="Guardar asignaciones de anaquel, nivel A-G y código de ubicación en la base de datos"
              >
                <span *ngIf="savingLocations()">Guardando...</span>
                <span *ngIf="!savingLocations()">Guardar Ubicaciones ({{ locationAssignerDirtyCount() }})</span>
              </button>
              <button type="button" class="btn btn-secondary" (click)="closeLocationAssigner()">Cerrar</button>
            </div>
          </div>
        </div>
      </div>

      <!-- MODAL: FICHA MAESTRA DE MATERIAL Y PLANIFICACIÓN DE REABASTECIMIENTO -->
      <div class="modal-backdrop modal-backdrop-planning" *ngIf="selectedProductPlanning() as plan" (click)="closeProductPlanning()">
        <div class="modal-box-planning" (click)="$event.stopPropagation()">
          
          <!-- Top Header matching user mockup -->
          <div class="planning-header">
            <div class="planning-header-left">
              <div class="planning-brand-crumbs">
                <span class="planning-brand">INTERFLU</span>
                <span class="crumb-sep">/</span>
                <span class="crumb-cat">Inventario / {{ plan.category }}</span>
              </div>
              <div class="planning-corte-date">
                Producto &bull; {{ plan.lastMovementDate }}
              </div>
              <h2 class="planning-product-title">{{ plan.description }}</h2>
              <div class="planning-product-subtitle mono">
                {{ plan.code }} &bull; Unidad: {{ plan.unit }}
              </div>
            </div>

            <div class="planning-header-right">
              <button
                type="button"
                class="btn btn-sm btn-outline-success"
                (click)="exportProductPlanningCsv(plan)"
                title="Exportar ficha técnica e indicadores de este producto a Excel (.csv)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Exportar Ficha (.csv)
              </button>
              <div class="planning-status-badge" [ngClass]="'status-' + plan.status.toLowerCase()">
                <span class="status-dot-pulse"></span>
                {{ plan.statusLabel }}
              </div>
              <button type="button" class="modal-close-icon-btn" (click)="closeProductPlanning()" title="Cerrar ventana">✕</button>
            </div>
          </div>

          <!-- Decoded Location Explanatory Bar (PB = Planta Baja, etc.) -->
          <div class="planning-location-card">
            <div class="loc-card-header">
              <span class="loc-card-title">Significado de Ubicación FÍSICA:</span>
              <span class="loc-card-badge mono">{{ plan.locationCode }}</span>
            </div>
            <div class="loc-segments-grid">
              <div class="loc-seg-box">
                <span class="seg-code mono">{{ plan.decodedLocation.plantCode }}</span>
                <span class="seg-eq">=</span>
                <span class="seg-name">{{ plan.decodedLocation.plant }}</span>
              </div>
              <div class="loc-seg-box">
                <span class="seg-code mono">{{ plan.decodedLocation.aisleCode }}</span>
                <span class="seg-eq">=</span>
                <span class="seg-name">{{ plan.decodedLocation.aisle }}</span>
              </div>
              <div class="loc-seg-box">
                <span class="seg-code mono">{{ plan.decodedLocation.shelfCode }}</span>
                <span class="seg-eq">=</span>
                <span class="seg-name">{{ plan.decodedLocation.shelf }}</span>
              </div>
              <div class="loc-seg-box">
                <span class="seg-code mono">{{ plan.decodedLocation.levelCode }}</span>
                <span class="seg-eq">=</span>
                <span class="seg-name">{{ plan.decodedLocation.level }}</span>
              </div>
              <div class="loc-seg-box">
                <span class="seg-code mono">{{ plan.decodedLocation.positionCode }}</span>
                <span class="seg-eq">=</span>
                <span class="seg-name">{{ plan.decodedLocation.position }}</span>
              </div>
            </div>
          </div>

          <!-- 4 Core Stock KPI Cards -->
          <div class="planning-kpis-grid">
            <!-- Stock Actual -->
            <div class="plan-kpi-card">
              <div class="kpi-lbl-top">Stock actual</div>
              <div class="kpi-big-num mono">{{ plan.stockActual | number:'1.0-0' }}</div>
              <div class="kpi-sub-lbl">Piezas en almacén</div>
              <div class="kpi-annotation">Existencia física conectada con SAE</div>
            </div>

            <!-- Mínimo de Seguridad -->
            <div class="plan-kpi-card">
              <div class="kpi-lbl-top">Mínimo de seguridad</div>
              <div class="kpi-big-num mono">{{ plan.minimoSeguridad }}</div>
              <div class="kpi-sub-lbl">Reserva de piezas</div>
              <div class="kpi-annotation">Piezas que se guardan en reserva</div>
            </div>

            <!-- Punto de Reorden -->
            <div class="plan-kpi-card" [class.highlight-warning]="plan.stockActual <= plan.puntoReorden">
              <div class="kpi-lbl-top">Punto de reorden</div>
              <div class="kpi-big-num mono">{{ plan.puntoReorden }}</div>
              <div class="kpi-sub-lbl">Nivel que activa reposición</div>
              <div class="kpi-annotation">Si hay {{ plan.puntoReorden }} o menos revisar si toca comprar</div>
            </div>

            <!-- Máximo Objetivo -->
            <div class="plan-kpi-card">
              <div class="kpi-lbl-top">Máximo objetivo</div>
              <div class="kpi-big-num mono">{{ plan.maximoObjetivo }}</div>
              <div class="kpi-sub-lbl">Nivel al que se busca llegar</div>
              <div class="kpi-annotation">Cantidad meta objetivo</div>
            </div>
          </div>

          <!-- "Cuánto Pedir Hoy" Calculation Box -->
          <div class="planning-calc-box">
            <div class="calc-left">
              <div class="calc-title">Cuánto pedir hoy</div>
              <div class="calc-pieces mono">
                {{ plan.cuantoPedir }} <span class="calc-unit">piezas</span>
              </div>
              <div class="calc-condition">
                <span *ngIf="plan.stockParaPlanear <= plan.puntoReorden" class="cond-alert">
                  Stock para planear &le; {{ plan.puntoReorden }} (Punto de reorden): Comprar ahora
                </span>
                <span *ngIf="plan.stockParaPlanear > plan.puntoReorden" class="cond-ok">
                  Stock suficiente (Por encima de punto de reorden)
                </span>
              </div>
            </div>

            <div class="calc-right">
              <div class="calc-math-headline">
                <strong>{{ plan.stockParaPlanear }} piezas para planear</strong>
              </div>
              <div class="calc-math-breakdown mono">
                {{ plan.stockActual }} en almacén + {{ plan.porRecibir }} por recibir - {{ plan.apartadas }} apartadas
              </div>
              <div class="calc-math-verdict">
                <ng-container *ngIf="plan.stockParaPlanear > plan.puntoReorden">
                  {{ plan.stockParaPlanear }} está por encima del punto de reorden de {{ plan.puntoReorden }}.
                </ng-container>
                <ng-container *ngIf="plan.stockParaPlanear <= plan.puntoReorden">
                  Faltan {{ plan.cuantoPedirSinRedondeo }} piezas para llegar al máximo de {{ plan.maximoObjetivo }}.
                  Redondeado a múltiplos de {{ plan.packageSize }} (empaque proveedor) = <strong>{{ plan.cuantoPedir }} piezas</strong>.
                </ng-container>
              </div>
            </div>
          </div>

          <!-- Two Column Row: Supplier Info + Purchase Orders -->
          <div class="planning-split-row">
            <!-- Supplier Card -->
            <div class="planning-card">
              <div class="card-title-row">
                <h3 class="p-card-title">Proveedor &bull; {{ plan.supplierName }}</h3>
                <span class="p-card-sub">Entrega en {{ plan.leadTimeDays }} días</span>
              </div>
              <div class="p-data-list">
                <div class="p-data-row">
                  <span class="p-dt-label">Contacto:</span>
                  <span class="p-dt-val">Área de ventas</span>
                </div>
                <div class="p-data-row">
                  <span class="p-dt-label">Correo:</span>
                  <span class="p-dt-val mono">ventas&#64;interflu.com.mx</span>
                </div>
                <div class="p-data-row">
                  <span class="p-dt-label">Plazo acordado:</span>
                  <span class="p-dt-val">{{ plan.leadTimeDays }} días calendario (tiempo de entrega)</span>
                </div>
                <div class="p-data-row">
                  <span class="p-dt-label">Pedido mínimo:</span>
                  <span class="p-dt-val">{{ plan.minOrder }} piezas (mínimo de venta)</span>
                </div>
                <div class="p-data-row">
                  <span class="p-dt-label">Tamaño del paquete:</span>
                  <span class="p-dt-val">{{ plan.packageSize }} piezas (se pide de {{ plan.packageSize }} en {{ plan.packageSize }})</span>
                </div>
                <div class="p-data-row">
                  <span class="p-dt-label">Última cotización:</span>
                  <span class="p-dt-val fw-700">&#36;{{ plan.lastQuotePrice | number:'1.2-2' }} MXN por pieza &bull; {{ plan.lastQuoteDate }}</span>
                </div>
              </div>
            </div>

            <!-- Purchase Orders Card -->
            <div class="planning-card">
              <div class="card-title-row">
                <h3 class="p-card-title">Órdenes de compra</h3>
                <span class="p-card-sub mono">
                  {{ plan.purchaseOrders.length }} orden(es) &bull; {{ plan.porRecibir }} piezas por recibir
                </span>
              </div>
              <div class="po-items-wrap" *ngIf="plan.purchaseOrders.length > 0">
                <div *ngFor="let po of plan.purchaseOrders">
                  <div class="po-header-line">
                    <span class="po-code mono fw-700">{{ po.ocNumber }}</span>
                    <span class="po-dates text-muted font-xs">Pedida: {{ po.orderDate }} &bull; Entrega: {{ po.expectedDate }}</span>
                  </div>
                  <div class="p-data-list">
                    <div class="p-data-row">
                      <span class="p-dt-label">Piezas pedidas:</span>
                      <span class="p-dt-val mono">{{ po.orderedQty }}</span>
                    </div>
                    <div class="p-data-row">
                      <span class="p-dt-label">Piezas recibidas:</span>
                      <span class="p-dt-val mono">{{ po.receivedQty }}</span>
                    </div>
                    <div class="p-data-row">
                      <span class="p-dt-label">Piezas canceladas:</span>
                      <span class="p-dt-val mono">{{ po.cancelledQty }}</span>
                    </div>
                    <div class="p-data-row highlight-pending">
                      <span class="p-dt-label fw-700">Faltan por recibir:</span>
                      <span class="p-dt-val mono fw-700">{{ po.pendingQty }} piezas</span>
                    </div>
                  </div>
                </div>
              </div>
              <div *ngIf="plan.purchaseOrders.length === 0" class="materials-empty-box" style="padding: 1rem 0;">
                No hay órdenes de compra abiertas pendientes por recibir.
              </div>
            </div>
          </div>

          <!-- Demand Forecast Chart (SAE) -->
          <div class="planning-demand-card">
            <div class="demand-header-row">
              <div>
                <h3 class="demand-title">Pronóstico de demanda (Aspel SAE)</h3>
                <span class="demand-sub">Ventas registradas y estimación calculada para los próximos meses</span>
              </div>
              <div class="demand-avg-kpi">
                <span class="demand-avg-num mono">{{ plan.monthlyDemandAvg }}</span>
                <span class="demand-avg-lbl">piezas al mes</span>
              </div>
            </div>

            <!-- Visual Bar Chart -->
            <div class="demand-chart-container">
              <div class="chart-bars-wrap">
                <div class="chart-bar-col" *ngFor="let bar of plan.demandHistory">
                  <div class="bar-val-tag mono">{{ bar.quantity }}</div>
                  <div class="bar-track">
                    <div
                      class="bar-fill"
                      [class.estimated-fill]="bar.isEstimated"
                      [style.height.%]="(bar.quantity / 45) * 100"
                      [title]="(bar.isEstimated ? 'Demanda estimada: ' : 'Venta registrada: ') + bar.quantity + ' pzas'"
                    ></div>
                  </div>
                  <div class="bar-month-lbl mono">{{ bar.month }}</div>
                </div>
              </div>
              <div class="chart-legend-row">
                <div class="legend-item">
                  <span class="legend-dot solid-dot"></span> Ventas registradas
                </div>
                <div class="legend-item">
                  <span class="legend-dot striped-dot"></span> Demanda estimada (piezas)
                </div>
              </div>
            </div>
            <div class="demand-footer-hint font-xs text-muted">
              Promedio simple de meses cerrados. Noviembre sigue abierto. Si falta historial, se muestra estimación estándar por rotación.
            </div>
          </div>

          <!-- Modal Action Footer -->
          <div class="modal-footer-advanced">
            <div class="footer-left-group">
              <button
                type="button"
                class="btn btn-sm btn-outline"
                *ngIf="plan.shelfId"
                (click)="openShelfFromFamilyExplorer(plan.shelfId)"
                title="Abrir croquis interactivo de este anaquel"
              >
                Ver Plano Físico A-G del Anaquel
              </button>
              <button
                type="button"
                class="btn btn-sm btn-outline-primary"
                *ngIf="plan.shelfId"
                (click)="goToCaptureById(plan.shelfId)"
                title="Abrir Cédula de Conteo para este anaquel"
              >
                Abrir en Cédula de Conteo
              </button>
            </div>
            <div class="footer-right-group">
              <button
                type="button"
                class="btn btn-sm btn-outline-success"
                (click)="exportProductPlanningCsv(plan)"
                title="Descargar reporte completo de planificación e inventario para Excel"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Exportar Ficha (.csv)
              </button>
              <button type="button" class="btn btn-primary" (click)="closeProductPlanning()">Cerrar Ficha</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Import Excel Counts File Modal in Croquis (Levantamiento Semanal SAE & Nivel A-G) -->
      <div class="modal-backdrop import-modal-backdrop" *ngIf="showImportExcelModal" (click)="closeCroquisImportModal()">
        <div class="modal-box import-excel-modal" (click)="$event.stopPropagation()">
          <div class="import-modal-header">
            <div class="import-header-title-wrap">
              <div class="import-header-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="12" y1="18" x2="12" y2="12"></line>
                  <polyline points="9 15 12 12 15 15"></polyline>
                </svg>
              </div>
              <div>
                <h3>Importar Conteo Excel / SAE</h3>
                <span class="import-header-sub">Actualización semanal de piezas y acomodo físico en croquis</span>
              </div>
            </div>
            <button type="button" class="modal-close-icon-btn" (click)="closeCroquisImportModal()" title="Cerrar ventana (Esc)">✕</button>
          </div>

          <!-- STATE 1: UPLOAD & CONFIGURE -->
          <ng-container *ngIf="!importResult">
            <div class="modal-body import-modal-body">
              <!-- Format Banner + 1-Click Official Template Download -->
              <div class="excel-template-banner">
                <div class="template-banner-info">
                  <span class="hint-title">Columnas reconocidas automáticamente:</span>
                  <div class="format-col-chips mono">
                    <span class="col-chip">CLAVE</span>
                    <span class="col-chip">EXISTENCIA FÍSICA</span>
                    <span class="col-chip col-chip-level">NIVEL (S, A-G)</span>
                    <span class="col-chip col-chip-opt">ANAQUEL / ESTANTE</span>
                  </div>
                  <span class="font-xs text-muted">Compatible con libros multi-hoja por anaquel y reportes directos de Aspel SAE (.xlsx / .csv).</span>
                </div>
                <button
                  type="button"
                  class="btn btn-sm btn-outline"
                  [disabled]="downloadingTemplate()"
                  (click)="downloadExcelTemplate()"
                  title="Descargar archivo Excel oficial"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                  </svg>
                  <span>{{ downloadingTemplate() ? 'Generando...' : 'Plantilla (.xlsx)' }}</span>
                </button>
              </div>

              <!-- Destination Shelf -->
              <div class="form-group mt-3">
                <label class="field-label">Anaquel Destino:</label>
                <select class="select select-sm" [ngModel]="importTargetShelfId()" (ngModelChange)="importTargetShelfId.set(+$event || 0)">
                  <option [ngValue]="0">Detectar automáticamente (por hoja, columna ESTANTE/ANAQUEL o códigos SAE)</option>
                  <option *ngFor="let sh of allShelves()" [ngValue]="sh.shelfId">
                    [{{ sh.plant || 'Planta Baja' }}] {{ sh.shelfCode }} &bull; {{ sh.shelfDescription || sh.shelfZone }}
                  </option>
                </select>
              </div>

              <!-- Import Mode Selector -->
              <div class="form-group mt-3">
                <label class="field-label">Modalidad de Importación:</label>
                <div class="import-mode-grid">
                  <button
                    type="button"
                    class="import-mode-card mode-card-weekly"
                    [class.active]="importMode() === 'WEEKLY_UPDATE'"
                    (click)="importMode.set('WEEKLY_UPDATE')"
                  >
                    <div class="mode-card-top">
                      <span class="mode-radio"></span>
                      <span class="mode-title">Levantamiento Semanal SAE</span>
                      <span class="mode-rec-badge badge-weekly">Solo Piezas</span>
                    </div>
                    <p class="mode-desc">
                      Si el archivo viene del SAE sin ubicación, actualiza existencias conservando anaqueles y niveles S, A-J. Si trae hojas/columnas por estante, los acomoda automáticamente.
                    </p>
                  </button>

                  <button
                    type="button"
                    class="import-mode-card"
                    [class.active]="importMode() === 'SMART_MERGE'"
                    (click)="importMode.set('SMART_MERGE')"
                  >
                    <div class="mode-card-top">
                      <span class="mode-radio"></span>
                      <span class="mode-title">Inteligente: Actualizar y Agregar</span>
                      <span class="mode-rec-badge">Con Nivel S, A-J</span>
                    </div>
                    <p class="mode-desc">
                      Distribuye cada hoja en su anaquel, actualiza piezas y nivel (S, A-J) sin perder ubicaciones existentes y deja en amarillo las claves sin definir.
                    </p>
                  </button>

                  <button
                    type="button"
                    class="import-mode-card mode-card-replace"
                    [class.active]="importMode() === 'REPLACE_ALL'"
                    (click)="importMode.set('REPLACE_ALL')"
                  >
                    <div class="mode-card-top">
                      <span class="mode-radio"></span>
                      <span class="mode-title">Sustituir Anaquel(es) del Archivo</span>
                    </div>
                    <p class="mode-desc">
                      Borra conteos previos de los anaqueles incluidos en este archivo y carga exactamente sus nuevas partidas.
                    </p>
                  </button>
                </div>
              </div>

              <!-- Obsolete Filter Info -->
              <div class="obsolete-filter-card mt-3">
                <label class="obsolete-filter-label">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    [ngModel]="filterObsoleteImport()"
                    (ngModelChange)="filterObsoleteImport.set($event)"
                  />
                  <div class="obsolete-filter-text">
                    <strong class="font-sm">Señalar claves obsoletas / "ELIMINAR" y sin definir en amarillo (sin descartar ninguna)</strong>
                    <span class="font-xs text-muted d-block">Todas las claves se conservan para auditoría: las que no tienen anaquel o traen "ELIMINAR" se filtran aparte y se resaltan en amarillo.</span>
                  </div>
                </label>
              </div>

              <!-- Drop Area -->
              <div
                class="file-drop-area mt-3"
                [class.drag-active]="isDraggingFile()"
                [class.has-file]="!!selectedExcelFile"
                (click)="croquisFileInput.click()"
                (dragover)="onDragOverImport($event)"
                (dragleave)="onDragLeaveImport($event)"
                (drop)="onDropImport($event)"
              >
                <input #croquisFileInput type="file" accept=".xlsx,.xls,.csv" style="display: none;" (change)="onFileSelectedForImport($event)" />
                <ng-container *ngIf="!selectedExcelFile">
                  <div class="drop-icon-circle">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="17 8 12 3 7 8"></polyline>
                      <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                  </div>
                  <strong class="drop-main-text">Arrastra tu archivo Excel aquí o haz clic para buscar</strong>
                  <span class="font-xs text-muted">Formatos .xlsx, .xls o .csv &bull; Hasta 50 MB</span>
                </ng-container>

                <div *ngIf="selectedExcelFile" class="selected-file-pill" (click)="$event.stopPropagation()">
                  <div class="file-pill-icon">XLS</div>
                  <div class="file-pill-meta">
                    <strong class="file-pill-name">{{ selectedExcelFile.name }}</strong>
                    <span class="font-xs text-muted">{{ (selectedExcelFile.size / 1024) | number:'1.1-2' }} KB &bull; Listo para importar</span>
                  </div>
                  <button type="button" class="btn-remove-file" (click)="selectedExcelFile = null" title="Quitar archivo">✕</button>
                </div>
              </div>
            </div>

            <div class="modal-footer import-modal-footer">
              <button type="button" class="btn btn-outline" (click)="closeCroquisImportModal()">Cancelar</button>
              <button
                type="button"
                class="btn btn-primary btn-import-go"
                [disabled]="!selectedExcelFile || importingExcel()"
                (click)="submitCroquisImport()"
              >
                <span *ngIf="importingExcel()" class="btn-spinner"></span>
                <span>{{ importingExcel() ? 'Procesando archivo...' : (importMode() === 'WEEKLY_UPDATE' ? 'Actualizar Piezas (Levantamiento SAE)' : (importMode() === 'REPLACE_ALL' ? 'Sustituir e Importar Todo' : 'Importar con Modo Inteligente')) }}</span>
              </button>
            </div>
          </ng-container>

          <!-- STATE 2: CLEAN POST-IMPORT SUCCESS VIEW -->
          <ng-container *ngIf="importResult as res">
            <div class="modal-body import-success-body">
              <div class="success-hero">
                <div class="success-check-circle">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <h4 class="success-title">Importación Completada con Éxito</h4>
                <p class="success-subtitle">
                  {{ res.importMode === 'WEEKLY_UPDATE' ? 'Levantamiento semanal completado: existencias físicas actualizadas y acomodadas.' : (res.importMode === 'REPLACE_ALL' ? 'Se sustituyó el contenido completo de los anaqueles incluidos en el archivo.' : 'Modo inteligente aplicado: cada hoja fue acomodada en su anaquel y nivel físico correspondiente.') }}
                </p>
              </div>

              <div class="import-kpi-grid">
                <div class="imp-kpi-card">
                  <span class="imp-kpi-val mono text-success">+{{ res.addedRecords ?? res.importedRecords }}</span>
                  <span class="imp-kpi-lbl">Nuevos Agregados</span>
                </div>
                <div class="imp-kpi-card">
                  <span class="imp-kpi-val mono text-primary-brand">{{ res.updatedRecords ?? 0 }}</span>
                  <span class="imp-kpi-lbl">Actualizados</span>
                </div>
                <div class="imp-kpi-card">
                  <span class="imp-kpi-val mono text-indigo">{{ res.withSectionCount ?? 0 }}</span>
                  <span class="imp-kpi-lbl">Con Nivel S, A-J</span>
                </div>
                <div class="imp-kpi-card" *ngIf="res.obsoleteFiltered && res.obsoleteFiltered > 0">
                  <span class="imp-kpi-val mono text-warning-brand">{{ res.obsoleteFiltered }}</span>
                  <span class="imp-kpi-lbl">Marcados ELIMINAR</span>
                </div>
                <div class="imp-kpi-card">
                  <span class="imp-kpi-val mono">{{ res.totalPieces | number:'1.0-2' }}</span>
                  <span class="imp-kpi-lbl">Piezas del Archivo</span>
                </div>
              </div>

              <div class="affected-shelves-bar" *ngIf="res.affectedShelves && res.affectedShelves.length > 0">
                <span class="affected-lbl">Anaqueles actualizados ({{ res.shelvesUpdated }}):</span>
                <div class="affected-chips">
                  <span class="affected-chip mono" *ngFor="let shCode of res.affectedShelves">{{ shCode }}</span>
                </div>
              </div>
            </div>

            <div class="modal-footer import-success-footer">
              <button type="button" class="btn btn-outline" (click)="resetForAnotherImport()">
                Importar Otro Archivo
              </button>
              <button type="button" class="btn btn-primary btn-done-exit" (click)="closeCroquisImportModal()">
                Listo, Salir al Croquis
              </button>
            </div>
          </ng-container>
        </div>
      </div>

      <!-- Modal: Edit Shelf Details -->
      <div class="modal-backdrop" *ngIf="editingShelf" (click)="editingShelf = null">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-header-row" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 14px;">
            <h3 class="modal-title" style="margin: 0;">Editar Anaquel</h3>
            <button class="modal-close-icon-btn" (click)="editingShelf = null" title="Cerrar">✕</button>
          </div>
          <p class="modal-desc">Modifica el código, zona o sector físico de este anaquel. El cambio se reflejará en el croquis y en todas las cédulas.</p>
          <div class="form-stack">
            <div class="two-cols">
              <div>
                <label class="label">Código de Anaquel</label>
                <input class="input mono" [(ngModel)]="editingShelf.code" placeholder="Ej. PB-ACE-05" />
              </div>
              <div>
                <label class="label">Nivel de Planta</label>
                <select class="select" [(ngModel)]="editingShelf.plant">
                  <option value="Planta Baja">Planta Baja</option>
                  <option value="Planta Alta">Planta Alta</option>
                </select>
              </div>
            </div>
            <div>
              <label class="label">Zona / Sector</label>
              <input class="input" [(ngModel)]="editingShelf.zone" placeholder="Ej. Acero (1-19), Kuriyama, Sellos" />
            </div>
            <div>
              <label class="label">Descripción Adicional</label>
              <input class="input" [(ngModel)]="editingShelf.description" placeholder="Ej. Pasillo principal frente a comedor" />
            </div>
          </div>
          <div class="modal-footer" style="margin-top: 18px;">
            <button class="btn btn-secondary" (click)="editingShelf = null" [disabled]="savingShelf()">Cancelar</button>
            <button class="btn btn-primary" (click)="saveShelfEdit()" [disabled]="savingShelf()">
              {{ savingShelf() ? 'Guardando...' : 'Guardar Cambios' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Confirm Clear Single Shelf Counts -->
      <div class="modal-backdrop" *ngIf="shelfToClearCounts" (click)="shelfToClearCounts = null">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <h3 class="modal-title text-danger">Limpiar Conteos del Anaquel</h3>
          <p class="modal-desc">
            ¿Deseas eliminar todas las partidas contabilizadas en el anaquel <strong class="mono">{{ shelfToClearCounts.shelfCode }}</strong>?
          </p>
          <div class="delete-warning-box">
            <strong>Restablecimiento individual:</strong>
            <ul style="margin: 6px 0 0 16px; padding: 0;">
              <li>Se eliminarán las {{ shelfToClearCounts.recordCount || 0 }} partidas contadas ({{ shelfToClearCounts.totalPieces | number:'1.0-2' }} piezas) de este anaquel.</li>
              <li>El anaquel regresará a estado <strong>PENDIENTE</strong> con 0 piezas en el croquis.</li>
              <li>Los demás anaqueles del almacén <strong>no serán afectados</strong>.</li>
            </ul>
          </div>
          <div class="modal-footer" style="margin-top: 18px;">
            <button class="btn btn-secondary" (click)="shelfToClearCounts = null" [disabled]="clearingShelfCounts()">Cancelar</button>
            <button class="btn btn-danger" (click)="executeClearShelfCounts()" [disabled]="clearingShelfCounts()">
              {{ clearingShelfCounts() ? 'Limpiando...' : 'Sí, Limpiar Este Anaquel' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Crear Nuevo Anaquel Profesional -->
      <div class="modal-backdrop" *ngIf="showCreateShelfModal()" (click)="showCreateShelfModal.set(false)">
        <div class="modal-box shelf-creator-modal" (click)="$event.stopPropagation()">
          <div class="modal-header-row">
            <div>
              <span class="blueprint-kicker">CONTROL ESPACIAL &bull; NUEVO ESPACIO FÍSICO</span>
              <h3 class="modal-title">+ Agregar Anaquel al Almacén</h3>
            </div>
            <button class="btn-close-modal" (click)="showCreateShelfModal.set(false)">✕</button>
          </div>
          <div class="shelf-creator-body">
            <p class="modal-desc">
              Define la identificación y medidas del nuevo anaquel. Al crearlo se incorporará automáticamente al plano y a los conteos del inventario activo.
            </p>
            <div class="form-grid-2col">
              <div class="form-group">
                <label class="form-lbl">Código del Anaquel *</label>
                <input type="text" class="input mono font-bold" [(ngModel)]="newShelfCode" placeholder="ej. PB-YPC-22" />
                <span class="form-hint">Prefijo de planta y zona (PB = Planta Baja, PA = Planta Alta)</span>
              </div>
              <div class="form-group">
                <label class="form-lbl">Zona / Pasillo *</label>
                <input type="text" class="input" [(ngModel)]="newShelfZone" placeholder="ej. YPC, Acero, Kuriyama..." />
              </div>
              <div class="form-group">
                <label class="form-lbl">Descripción / Rótulo</label>
                <input type="text" class="input" [(ngModel)]="newShelfDesc" placeholder="ej. Estantería YPC D1 - Fondo" />
              </div>
              <div class="form-group">
                <label class="form-lbl">Planta</label>
                <select class="select" [(ngModel)]="newShelfPlant">
                  <option value="Planta Baja">Planta Baja</option>
                  <option value="Planta Alta">Planta Alta</option>
                </select>
              </div>
            </div>

            <!-- Dimension Preset Buttons -->
            <div class="preset-section">
              <label class="form-lbl">Plantillas de Medidas Estándar:</label>
              <div class="preset-buttons-row">
                <button type="button" class="btn btn-sm btn-outline-primary" (click)="applyShelfDimPreset(95.4, 34)">
                  Horizontal Estándar (95.4 x 34)
                </button>
                <button type="button" class="btn btn-sm btn-outline-primary" (click)="applyShelfDimPreset(76, 34)">
                  Horizontal Compacto (76 x 34)
                </button>
                <button type="button" class="btn btn-sm btn-outline-primary" (click)="applyShelfDimPreset(25, 54)">
                  Vertical Estándar (25 x 54)
                </button>
                <button type="button" class="btn btn-sm btn-outline-primary" (click)="applyShelfDimPreset(54, 48)">
                  Gabinete / Cuadrado (54 x 48)
                </button>
                <button type="button" class="btn btn-sm btn-outline-primary" (click)="applyShelfDimPreset(54, 60)">
                  Muro Este (54 x 60)
                </button>
              </div>
            </div>

            <div class="form-grid-4col">
              <div class="form-group">
                <label class="form-lbl">Ancho (W px)</label>
                <input type="number" class="input mono" [(ngModel)]="newShelfWidth" />
              </div>
              <div class="form-group">
                <label class="form-lbl">Alto (H px)</label>
                <input type="number" class="input mono" [(ngModel)]="newShelfHeight" />
              </div>
              <div class="form-group">
                <label class="form-lbl">Posición X (px)</label>
                <input type="number" class="input mono" [(ngModel)]="newShelfPosX" />
              </div>
              <div class="form-group">
                <label class="form-lbl">Posición Y (px)</label>
                <input type="number" class="input mono" [(ngModel)]="newShelfPosY" />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showCreateShelfModal.set(false)" [disabled]="creatingShelf()">Cancelar</button>
            <button class="btn btn-primary" (click)="submitCreateShelf()" [disabled]="creatingShelf()">
              {{ creatingShelf() ? 'Guardando...' : 'Crear Anaquel y Ubicar en Croquis' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Confirm Delete Shelf -->
      <div class="modal-backdrop" *ngIf="shelfToDelete" (click)="shelfToDelete = null">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <h3 class="modal-title text-danger">Eliminar Anaquel Físico</h3>
          <p class="modal-desc">
            ¿Confirmas que deseas eliminar permanentemente el anaquel <strong class="mono">{{ shelfToDelete.shelfCode }}</strong> ({{ shelfToDelete.shelfDescription || shelfToDelete.shelfZone }}) del croquis y catálogo?
          </p>
          <div class="delete-warning-box">
            <strong>Condición de Seguridad:</strong>
            <ul style="margin: 6px 0 0 16px; padding: 0;">
              <li>Si el anaquel contiene partidas contadas, la eliminación será bloqueada para evitar pérdida de datos.</li>
              <li>Al eliminarse, se retira de la cuadrícula visual de Planta Baja / Planta Alta.</li>
            </ul>
          </div>
          <div class="modal-footer" style="margin-top: 18px;">
            <button class="btn btn-secondary" (click)="shelfToDelete = null" [disabled]="deletingShelf()">Cancelar</button>
            <button class="btn btn-danger" (click)="executeDeleteShelf()" [disabled]="deletingShelf()">
              {{ deletingShelf() ? 'Eliminando...' : 'Sí, Eliminar Anaquel' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Modificar Tamaño / Dimensionar Anaqueles -->
      <div class="modal-backdrop" *ngIf="showResizeShelfModal()" (click)="closeResizeShelfModal()">
        <div class="modal-box resize-shelf-modal" (click)="$event.stopPropagation()">
          <div class="resize-modal-header">
            <div>
              <div class="font-xs text-muted uppercase">Herramienta de Dimensionamiento Preciso</div>
              <h2 class="modal-title font-mono" style="margin: 2px 0 0 0;">Modificar Tamaño de Anaqueles</h2>
            </div>
            <button class="btn-close-modal" (click)="closeResizeShelfModal()">✕</button>
          </div>

          <div class="resize-modal-body">
            <p class="modal-desc" style="margin: 0;">
              Ajusta las medidas de ancho (W) y alto (H) en píxeles con medidas estandarizadas a 1 clic, o personaliza dimensiones numéricas exactas para el croquis visual.
            </p>

            <!-- Shelf Selector -->
            <div class="form-group">
              <label class="form-lbl">Anaquel a Modificar:</label>
              <select class="select" [ngModel]="resizingShelfTarget()?.shelfId" (ngModelChange)="onResizeShelfSelectionChange($event)">
                <option *ngFor="let s of plantShelves()" [value]="s.shelfId">
                  {{ s.shelfCode }} &bull; {{ s.shelfZone }} (Actual: {{ s.width || 54 }}x{{ s.height || 54 }} px)
                </option>
              </select>
            </div>

            <!-- Standard Dimensions Quick Presets -->
            <div class="presets-section">
              <label class="form-lbl">Plantillas de Medidas Frecuentes:</label>
              <div class="presets-cards-grid">
                <div
                  class="preset-card"
                  (click)="setResizeDimensions(95.4, 34)"
                  [class.active-preset-card]="resizeTargetWidth() === 95.4 && resizeTargetHeight() === 34"
                  title="Horizontal Estándar de Pasillo (95.4 x 34 px)"
                >
                  <span class="preset-card-title">Horizontal Pasillo</span>
                  <span class="preset-card-badge mono">95.4 &times; 34 px</span>
                </div>
                <div
                  class="preset-card"
                  (click)="setResizeDimensions(76, 34)"
                  [class.active-preset-card]="resizeTargetWidth() === 76 && resizeTargetHeight() === 34"
                  title="Compacto Estándar de Pasillo (76 x 34 px)"
                >
                  <span class="preset-card-title">Compacto Pasillo</span>
                  <span class="preset-card-badge mono">76 &times; 34 px</span>
                </div>
                <div
                  class="preset-card"
                  (click)="setResizeDimensions(25, 54)"
                  [class.active-preset-card]="resizeTargetWidth() === 25 && resizeTargetHeight() === 54"
                  title="Vertical Angosto de Pasillo (25 x 54 px)"
                >
                  <span class="preset-card-title">Vertical Pasillo</span>
                  <span class="preset-card-badge mono">25 &times; 54 px</span>
                </div>
                <div
                  class="preset-card"
                  (click)="setResizeDimensions(54, 48)"
                  [class.active-preset-card]="resizeTargetWidth() === 54 && resizeTargetHeight() === 48"
                  title="Gabinete o Cuadrado (54 x 48 px)"
                >
                  <span class="preset-card-title">Gabinete / Cuadrado</span>
                  <span class="preset-card-badge mono">54 &times; 48 px</span>
                </div>
                <div
                  class="preset-card"
                  (click)="setResizeDimensions(54, 60)"
                  [class.active-preset-card]="resizeTargetWidth() === 54 && resizeTargetHeight() === 60"
                  title="Muro Este / Gran Capacidad (54 x 60 px)"
                >
                  <span class="preset-card-title">Muro Este / Grande</span>
                  <span class="preset-card-badge mono">54 &times; 60 px</span>
                </div>
                <div
                  class="preset-card"
                  (click)="setResizeDimensions(36, 28)"
                  [class.active-preset-card]="resizeTargetWidth() === 36 && resizeTargetHeight() === 28"
                  title="Mini Gaveta (36 x 28 px)"
                >
                  <span class="preset-card-title">Mini Gaveta</span>
                  <span class="preset-card-badge mono">36 &times; 28 px</span>
                </div>
              </div>
            </div>

            <!-- Dimension Inputs with Steppers -->
            <div class="resize-inputs-row">
              <div class="resize-input-card">
                <label class="form-lbl">Ancho (W px)</label>
                <div class="stepper-wrap">
                  <button type="button" class="btn-step" (click)="adjustResizeWidth(-5)">-5</button>
                  <button type="button" class="btn-step" (click)="adjustResizeWidth(-1)">-1</button>
                  <input type="number" class="input input-stepper mono" [ngModel]="resizeTargetWidth()" (ngModelChange)="resizeTargetWidth.set($event)" min="10" max="600" step="0.5" />
                  <button type="button" class="btn-step" (click)="adjustResizeWidth(1)">+1</button>
                  <button type="button" class="btn-step" (click)="adjustResizeWidth(5)">+5</button>
                </div>
              </div>

              <div class="resize-input-card">
                <label class="form-lbl">Alto (H px)</label>
                <div class="stepper-wrap">
                  <button type="button" class="btn-step" (click)="adjustResizeHeight(-5)">-5</button>
                  <button type="button" class="btn-step" (click)="adjustResizeHeight(-1)">-1</button>
                  <input type="number" class="input input-stepper mono" [ngModel]="resizeTargetHeight()" (ngModelChange)="resizeTargetHeight.set($event)" min="10" max="600" step="0.5" />
                  <button type="button" class="btn-step" (click)="adjustResizeHeight(1)">+1</button>
                  <button type="button" class="btn-step" (click)="adjustResizeHeight(5)">+5</button>
                </div>
              </div>

              <div class="resize-actions-card">
                <label class="form-lbl">Rotación</label>
                <button type="button" class="btn btn-outline" (click)="swapResizeDimensions()" title="Intercambiar ancho y alto para rotar 90 grados">
                  ↻ Rotar 90°
                </button>
              </div>
            </div>

            <!-- Visual Scale Preview -->
            <div class="dimension-preview-box">
              <div class="preview-label">Vista Previa a Escala del Anaquel:</div>
              <div class="preview-canvas-area">
                <div class="preview-shelf-rect" [style.width.px]="resizeTargetWidth()" [style.height.px]="resizeTargetHeight()">
                  <span class="preview-code">{{ resizingShelfTarget()?.shelfCode || 'ANAQUEL' }}</span>
                  <span class="preview-dims font-mono">{{ resizeTargetWidth() }} × {{ resizeTargetHeight() }} px</span>
                </div>
              </div>
            </div>

            <!-- Apply to all in zone checkbox -->
            <div class="zone-apply-checkbox-wrap" *ngIf="resizingShelfTarget()?.shelfZone">
              <label class="checkbox-label">
                <input type="checkbox" [ngModel]="resizeApplyToAllInZone()" (ngModelChange)="resizeApplyToAllInZone.set($event)" />
                <span>Aplicar estas dimensiones a todos los anaqueles de la zona <strong>{{ resizingShelfTarget()?.shelfZone }}</strong></span>
              </label>
            </div>
          </div>

          <div class="resize-modal-footer">
            <button type="button" class="btn btn-secondary" (click)="closeResizeShelfModal()" [disabled]="savingShelfResize()">Cancelar</button>
            <button type="button" class="btn btn-primary" (click)="submitShelfResize()" [disabled]="savingShelfResize() || !resizingShelfTarget()">
              {{ savingShelfResize() ? 'Guardando Medidas...' : 'Aplicar y Guardar Tamaño' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Editor Masivo y Renombrador en Serie -->
      <div class="modal-backdrop" *ngIf="showBulkShelfEditorModal()" (click)="showBulkShelfEditorModal.set(false)">
        <div class="modal-box bulk-shelf-editor-modal" (click)="$event.stopPropagation()">
          <div class="modal-header-row">
            <div>
              <span class="blueprint-kicker">GESTIÓN MASIVA &bull; AUTOMATIZACIÓN DE ANAQUELES</span>
              <h3 class="modal-title">Editor Masivo de Anaqueles y Renombrado en Serie</h3>
            </div>
            <button class="btn-close-modal" (click)="showBulkShelfEditorModal.set(false)">✕</button>
          </div>
          <div class="bulk-editor-body">
            <p class="modal-desc">
              Modifica códigos, nombres y coordenadas de anaqueles en lote sin tener que abrir cada uno manualmente. Aplica numeración corrida automática por zona.
            </p>

            <!-- Filter Bar for Bulk Editor -->
            <div class="bulk-filter-strip">
              <div class="bulk-filter-group">
                <label class="form-lbl">Zona a Administrar:</label>
                <select class="select select-sm" [ngModel]="bulkEditorZone()" (ngModelChange)="onBulkEditorZoneChange($event)">
                  <option *ngFor="let z of uniqueZonesList()" [value]="z">{{ z }}</option>
                </select>
              </div>
              <div class="bulk-filter-group">
                <label class="form-lbl">Planta:</label>
                <select class="select select-sm" [ngModel]="bulkEditorPlant()" (ngModelChange)="onBulkEditorPlantChange($event)">
                  <option value="Planta Baja">Planta Baja</option>
                  <option value="Planta Alta">Planta Alta</option>
                </select>
              </div>
              <div class="bulk-count-pill mono">
                {{ bulkEditorShelves.length }} anaqueles en {{ bulkEditorZone() }}
              </div>
            </div>

            <!-- Series Renumber Automation Section -->
            <div class="series-automation-box">
              <div class="series-header">
                <strong>Automatización de Renombrado en Serie Corrida</strong>
                <span class="font-xs text-muted">Ejemplo: {{ seriesPrefix }}{{ formatSeriesNum(seriesStartNumber) }} ... {{ seriesPrefix }}{{ formatSeriesNum(seriesStartNumber + bulkEditorShelves.length - 1) }}</span>
              </div>
              <div class="series-inputs-row">
                <div class="series-input-wrap">
                  <label>Prefijo:</label>
                  <input type="text" class="input input-sm mono" [(ngModel)]="seriesPrefix" placeholder="ej. PB-YPC-" />
                </div>
                <div class="series-input-wrap">
                  <label>Número Inicial:</label>
                  <input type="number" class="input input-sm mono" [(ngModel)]="seriesStartNumber" min="1" />
                </div>
                <div class="series-input-wrap">
                  <label>Dígitos (Ceros):</label>
                  <select class="select select-sm" [(ngModel)]="seriesDigits">
                    <option [ngValue]="2">2 dígitos (01, 02.. 10, 21)</option>
                    <option [ngValue]="1">1 dígito (1, 2.. 10, 21)</option>
                  </select>
                </div>
                <button type="button" class="btn btn-sm btn-primary" (click)="applySeriesRenumberToTable()">
                  Aplicar Serie a la Tabla
                </button>
              </div>
            </div>

            <!-- Editable Table -->
            <div class="bulk-shelves-table-wrap">
              <table class="table bulk-shelves-table">
                <thead>
                  <tr>
                    <th style="width: 45px;">#</th>
                    <th style="width: 140px;">Código Actual</th>
                    <th style="width: 170px;">Nuevo Código</th>
                    <th>Descripción / Rótulo</th>
                    <th style="width: 90px;">Pos X</th>
                    <th style="width: 90px;">Pos Y</th>
                    <th style="width: 80px;">Ancho</th>
                    <th style="width: 80px;">Alto</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let sh of bulkEditorShelves; let idx = index">
                    <td class="text-center font-xs text-muted">{{ idx + 1 }}</td>
                    <td class="mono font-xs text-muted">{{ sh.originalCode }}</td>
                    <td>
                      <input type="text" class="input input-xs mono font-bold" [(ngModel)]="sh.code" />
                    </td>
                    <td>
                      <input type="text" class="input input-xs" [(ngModel)]="sh.description" />
                    </td>
                    <td>
                      <input type="number" class="input input-xs mono" [(ngModel)]="sh.posX" />
                    </td>
                    <td>
                      <input type="number" class="input input-xs mono" [(ngModel)]="sh.posY" />
                    </td>
                    <td>
                      <input type="number" class="input input-xs mono" [(ngModel)]="sh.width" />
                    </td>
                    <td>
                      <input type="number" class="input input-xs mono" [(ngModel)]="sh.height" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showBulkShelfEditorModal.set(false)" [disabled]="savingBulkShelves()">Cancelar</button>
            <button class="btn btn-success" (click)="submitBulkShelvesSave()" [disabled]="savingBulkShelves()">
              {{ savingBulkShelves() ? 'Guardando en Base de Datos...' : 'Guardar Todos los Cambios (' + bulkEditorShelves.length + ' Anaqueles)' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .croquis-container {
      max-width: 100%;
      width: 100%;
      margin: 0 auto;
      padding: 0.5rem 0.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }

    .croquis-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
    }

    .croquis-kicker {
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

    .croquis-top-actions {
      display: flex;
      gap: 0.65rem;
      align-items: center;
      flex-wrap: wrap;
    }

    .plant-toggle {
      display: inline-flex;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 2px;
    }

    .toggle-btn {
      background: transparent;
      border: none;
      border-radius: 4px;
      padding: 0.4rem 1rem;
      font-size: 0.85rem;
      font-weight: 700;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s;
    }
    .toggle-btn.active {
      background: #0a2472;
      color: #ffffff;
      box-shadow: 0 1px 3px rgba(10, 36, 114, 0.2);
    }

    /* Zoom & Underlay Controls */
    .zoom-controls {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 2px 6px;
    }
    .zoom-level {
      font-size: 0.75rem;
      font-weight: 700;
      color: #334155;
      min-width: 42px;
      text-align: center;
    }
    .btn-icon {
      padding: 4px 8px;
      line-height: 1;
      color: #334155;
    }

    .blueprint-overlay-control {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px 10px;
    }
    .control-label {
      font-size: 0.72rem;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
    }
    .opacity-slider {
      width: 80px;
      cursor: pointer;
    }
    .opacity-val {
      font-size: 0.72rem;
      font-weight: 700;
      color: #0f172a;
      min-width: 32px;
    }

    /* Search and Legend Bar */
    .search-filter-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.65rem 1rem;
      flex-wrap: wrap;
    }

    .search-box {
      display: flex;
      align-items: center;
      gap: 8px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 0 10px;
      width: 100%;
      max-width: 420px;
      color: #64748b;
    }
    .search-input {
      border: none;
      background: transparent;
      padding: 0.45rem 0;
      font-size: 0.85rem;
      color: #0f172a;
      outline: none;
      width: 100%;
    }
    .clear-btn {
      background: none;
      border: none;
      font-size: 0.85rem;
      color: #94a3b8;
      cursor: pointer;
    }

    /* Exact Color Semáforo Requested by User */
    .blueprint-legend {
      display: flex;
      gap: 1.25rem;
      font-size: 0.8rem;
      color: #334155;
      flex-wrap: wrap;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 0.45rem;
    }
    .dot {
      width: 11px;
      height: 11px;
      border-radius: 50%;
      display: inline-block;
    }
    .dot-completed {
      background: #059669; /* Verde Contabilizado */
      box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.25);
    }
    .dot-pending-neutral {
      background: #64748b; /* Gris Pizarra Neutro Operativo */
      box-shadow: 0 0 0 2px rgba(100, 116, 139, 0.25);
    }
    .dot-untouched {
      background: #ffffff; /* Sin color / Neutro */
      border: 1.5px solid #cbd5e1;
    }

    /* Metrics Bar */
    .plant-metrics-bar {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0.75rem;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 0.75rem 1.25rem;
    }
    .p-metric { display: flex; flex-direction: column; gap: 0.15rem; }
    .p-label {
      font-size: 0.7rem;
      text-transform: uppercase;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 0.03em;
    }
    .p-value {
      font-size: 1.25rem;
      font-weight: 800;
      color: #0f172a;
    }
    .text-primary-brand { color: #1d4ed8; }
    .text-success { color: #059669; }
    .text-slate { color: #475569; }

    /* Croquis Layout Grid: Canvas + Sidebar strictly Side-by-Side on ALL screens */
    .croquis-main-layout {
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: nowrap !important;
      align-items: flex-start !important;
      gap: 14px !important;
      width: 100% !important;
      min-width: 0 !important;
      box-sizing: border-box !important;
      transition: all 0.2s ease;
    }
    .croquis-main-layout.sidebar-collapsed .croquis-canvas-col {
      width: 100% !important;
      max-width: 100% !important;
      flex: 1 1 100% !important;
    }
    .croquis-canvas-col {
      flex: 1 1 0% !important;
      min-width: 0 !important;
      width: 0 !important;
      max-width: calc(100% - 250px) !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 6px !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
    }

    /* Sections & Progress Sidebar (Lateral con Barras de Porcentaje a la Derecha Permanente) */
    .sections-progress-sidebar {
      flex: 0 0 236px !important;
      width: 236px !important;
      min-width: 236px !important;
      max-width: 236px !important;
      background: #ffffff !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 12px !important;
      padding: 0.65rem 0.65rem !important;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05) !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 0.4rem !important;
      box-sizing: border-box !important;
      position: sticky !important;
      top: 10px !important;
      align-self: flex-start !important;
    }
    .sections-sidebar-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 0.35rem;
    }
    .sidebar-kicker {
      font-size: 0.58rem;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .sidebar-title {
      margin: 1px 0 0 0;
      font-size: 0.88rem;
      font-weight: 800;
      color: #0f172a;
    }
    .sections-summary-pill {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 4px 7px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.68rem;
      color: #475569;
    }
    .sections-summary-pill strong {
      color: #0a2472;
    }
    .sections-list {
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }
    .section-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 0.4rem 0.5rem;
      cursor: pointer;
      transition: all 0.12s ease;
      display: flex;
      flex-direction: column;
      gap: 3px;
      position: relative;
    }
    .section-card:hover {
      border-color: var(--sec-accent, #2563eb);
      transform: translateY(-1px);
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08);
    }
    .section-card.active {
      border-color: var(--sec-accent, #2563eb);
      background: #f8fafc;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
    }
    .section-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .sec-name-wrap {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
    }
    .sec-color-badge {
      width: 7px;
      height: 7px;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .sec-name-text {
      font-size: 0.72rem;
      font-weight: 700;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 118px;
    }
    .sec-pct-chip {
      font-size: 0.64rem;
      font-weight: 800;
      font-family: 'JetBrains Mono', monospace;
      color: #475569;
      background: #f1f5f9;
      padding: 1px 4px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .sec-pct-chip.pct-complete {
      background: #dcfce7;
      color: #15803d;
    }
    .sec-progress-track {
      width: 100%;
      height: 4px;
      background: #e2e8f0;
      border-radius: 2px;
      overflow: hidden;
    }
    .sec-progress-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.3s ease;
    }
    .sec-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.64rem;
      color: #64748b;
    }
    .sec-count-text strong {
      color: #0f172a;
    }
    .sec-pieces-text {
      color: #0a2472;
      font-weight: 700;
      font-family: 'JetBrains Mono', monospace;
    }
    .sec-status-text {
      color: #15803d;
      font-weight: 700;
    }

    /* Interactive Status Filter Buttons */
    .blueprint-legend {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .legend-filter-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 0.76rem;
      color: #475569;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .legend-filter-btn:hover {
      background: #f1f5f9;
      border-color: #94a3b8;
    }
    .legend-filter-btn.active {
      background: #0a2472;
      border-color: #0a2472;
      color: #ffffff;
      box-shadow: 0 2px 6px rgba(10, 36, 114, 0.25);
    }
    .legend-filter-btn.active .dot {
      box-shadow: 0 0 0 2px #ffffff;
    }
    .legend-filter-btn.filter-completed.active {
      background: #15803d;
      border-color: #15803d;
    }
    .legend-filter-btn.filter-pending.active {
      background: #334155;
      border-color: #334155;
      color: #ffffff;
    }
    .dot-all {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #3b82f6;
    }

    .dimmed-by-section {
      opacity: 0.20 !important;
      filter: grayscale(85%) !important;
    }
    .highlighted-by-section {
      outline: 2.5px solid var(--sec-accent, #2563eb) !important;
      box-shadow: 0 0 12px rgba(37, 99, 235, 0.6) !important;
      transform: scale(1.06) !important;
      z-index: 20 !important;
    }
    .dot-section-color {
      background: linear-gradient(135deg, #2563eb 0%, #d97706 50%, #7c3aed 100%);
    }

    /* Canvas Viewport with High-Visibility Scrollbars */
    .blueprint-canvas-wrap {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 0.75rem;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
      overflow: auto;
      max-width: 100%;
      position: relative;
      cursor: default;
      user-select: none;
      scrollbar-width: thin;
      scrollbar-color: #94a3b8 #f1f5f9;
    }
    .blueprint-canvas-wrap.is-panning {
      cursor: grabbing !important;
    }

    .canvas-sizer {
      position: relative;
      overflow: visible;
      flex-shrink: 0;
      transition: width 0.15s ease-out, height 0.15s ease-out;
    }

    .canvas-scroll-wrapper {
      position: absolute;
      top: 0;
      left: 0;
      width: 1440px;
      height: 810px;
      transform-origin: top left;
      transition: transform 0.15s ease-out;
    }

    .canvas-nav-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 8px 14px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      font-size: 12px;
      color: #64748b;
      flex-wrap: wrap;
    }
    .nav-hint-text {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .canvas-dim-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #f8fafc;
      padding: 3px 10px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      color: #334155;
    }
    .dim-scale-tag {
      color: #0284c7;
      font-weight: 700;
    }
    .btn-fit-screen {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      font-weight: 600;
      gap: 5px;
    }
    .btn-fit-screen:hover {
      background: #dbeafe;
    }

    .blueprint-canvas-1440 {
      position: relative;
      width: 1440px;
      height: 810px;
      background-color: #f8fafc;
      overflow: hidden;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }

    .blueprint-img-underlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 1440px;
      height: 810px;
      pointer-events: none;
      z-index: 1;
      object-fit: fill;
      transition: opacity 0.2s ease;
    }

    .architectural-svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 1440px;
      height: 810px;
      pointer-events: none;
      z-index: 2;
    }

    .svg-room-label {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 11px;
      font-weight: 800;
      fill: #475569;
      letter-spacing: 0.08em;
    }

    .svg-zone-title {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 12px;
      font-weight: 800;
      fill: #64748b;
      letter-spacing: 0.1em;
    }
    .svg-aisle-header {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 10px;
      font-weight: 800;
      fill: #1e3a8a;
      letter-spacing: 0.05em;
    }
    .svg-badge-pill {
      fill: #ffffff;
      stroke: #cbd5e1;
      stroke-width: 1.2px;
      filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.08));
    }
    .svg-badge-text {
      font-family: 'JetBrains Mono', 'Segoe UI', monospace;
      font-size: 10px;
      font-weight: 800;
      fill: #0a2472;
      letter-spacing: 0.04em;
      dominant-baseline: central;
    }
    .svg-badge-text-sub {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 8.5px;
      font-weight: 700;
      fill: #475569;
      letter-spacing: 0.03em;
      dominant-baseline: central;
    }
    .svg-zone-subtitle {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 10px;
      font-weight: 700;
      fill: #64748b;
      letter-spacing: 0.04em;
    }
    .svg-reel-hub {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 800;
      fill: #0369a1;
    }
    .svg-reel-lbl {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 10px;
      font-weight: 700;
      fill: #475569;
    }
    .svg-hose-reel {
      cursor: default;
    }

    /* Rack Elements (Exact user rules for colors) */
    .rack-element {
      position: absolute;
      z-index: 3;
      border-radius: 4px;
      border: 1.5px solid;
      padding: 3px 5px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: transform 0.12s ease, box-shadow 0.12s ease;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
      user-select: none;
      overflow: hidden;
    }

    .rack-element:hover {
      transform: scale(1.05);
      z-index: 10;
      box-shadow: 0 6px 16px rgba(15, 23, 42, 0.2);
    }

    /* 1. VERDE EXCLUSIVO: Contabilizado / Completado (ÚNICO VERDE PERMITIDO EN TODO EL CROQUIS) */
    .color-completed {
      background: #dcfce7 !important;
      border: 2px solid #16a34a !important;
      color: #14532d !important;
      box-shadow: 0 1px 4px rgba(22, 163, 74, 0.35) !important;
    }
    .color-completed .rack-code-text {
      color: #14532d !important;
      font-weight: 800 !important;
    }
    .color-completed .rack-qty-text {
      color: #15803d !important;
      font-weight: 800 !important;
    }

    /* 2. TEMAS DE COLOR POR TIPO DE SECCIÓN (PROHIBIDO CUALQUIER TONO VERDE) */
    /* Planta Baja */
    .rack-sec-acero {
      background: #eff6ff !important;
      border-color: #2563eb !important;
    }
    .rack-sec-acero .rack-code-text { color: #1d4ed8 !important; }

    .rack-sec-kuriyama {
      background: #fff7ed !important;
      border-color: #ea580c !important;
    }
    .rack-sec-kuriyama .rack-code-text { color: #c2410c !important; }

    .rack-sec-ypc {
      background: #f5f3ff !important;
      border-color: #7c3aed !important;
    }
    .rack-sec-ypc .rack-code-text { color: #6d28d9 !important; }

    .rack-sec-dixon {
      background: #fdf2f8 !important;
      border-color: #db2777 !important;
    }
    .rack-sec-dixon .rack-code-text { color: #be185d !important; }

    .rack-sec-chid {
      background: #ecfeff !important;
      border-color: #0891b2 !important;
    }
    .rack-sec-chid .rack-code-text { color: #0e7490 !important; }

    .rack-sec-cyber {
      background: #fff1f2 !important;
      border-color: #e11d48 !important;
    }
    .rack-sec-cyber .rack-code-text { color: #be123c !important; }

    .rack-sec-inox {
      background: #f1f5f9 !important;
      border-color: #475569 !important;
    }
    .rack-sec-inox .rack-code-text { color: #1e293b !important; }

    /* Planta Alta: SELLOS TODOS UNIFICADOS EN EL MISMO COLOR */
    .rack-sec-sellos {
      background: #faf5ff !important;
      border-color: #a855f7 !important;
    }
    .rack-sec-sellos .rack-code-text { color: #7e22ce !important; }

    /* Planta Alta: Pasillos */
    .rack-sec-p1 {
      background: #eff6ff !important;
      border-color: #2563eb !important;
    }
    .rack-sec-p1 .rack-code-text { color: #1e40af !important; }

    .rack-sec-p2 {
      background: #fff7ed !important;
      border-color: #f97316 !important;
    }
    .rack-sec-p2 .rack-code-text { color: #c2410c !important; }

    .rack-sec-p3 {
      background: #fefce8 !important;
      border-color: #eab308 !important;
    }
    .rack-sec-p3 .rack-code-text { color: #a16207 !important; }

    /* Planta Alta: Lateral Oeste */
    .rack-sec-fnh {
      background: #f0f9ff !important;
      border-color: #0284c7 !important;
    }
    .rack-sec-fnh .rack-code-text { color: #0369a1 !important; }

    .rack-sec-htm {
      background: #fdf2f8 !important;
      border-color: #db2777 !important;
    }
    .rack-sec-htm .rack-code-text { color: #9d174d !important; }

    .rack-sec-abr {
      background: #fef3c7 !important;
      border-color: #d97706 !important;
    }
    .rack-sec-abr .rack-code-text { color: #92400e !important; }

    .rack-sec-enp {
      background: #f5f3ff !important;
      border-color: #7c3aed !important;
    }
    .rack-sec-enp .rack-code-text { color: #5b21b6 !important; }

    .rack-sec-res {
      background: #eff6ff !important;
      border-color: #3b82f6 !important;
    }
    .rack-sec-res .rack-code-text { color: #1e3a8a !important; }

    .rack-sec-pvc {
      background: #f0f9ff !important;
      border-color: #06b6d4 !important;
    }
    .rack-sec-pvc .rack-code-text { color: #0e7490 !important; }

    /* 3. PENDIENTES O SIN ASIGNAR: TOTALMENTE SIN COLOR (NEUTRAL LIMPIO) */
    .rack-sec-default {
      background: #ffffff !important;
      border-color: #cbd5e1 !important;
    }
    .rack-sec-default .rack-code-text { color: #475569 !important; }
    .rack-sec-default .rack-qty-text { color: #64748b !important; }

    /* 3. PENDIENTES: Limpio y natural según su familia de producto, sin alarmas rojas */
    .color-pending {
      opacity: 0.98;
    }

    /* 4. SIN INICIAR */
    .color-untouched {
      opacity: 0.95;
    }

    .matched-search {
      outline: 3px solid #2563eb !important;
      box-shadow: 0 0 12px rgba(37, 99, 235, 0.8) !important;
      animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
      0%, 100% { outline-color: #2563eb; }
      50% { outline-color: #f59e0b; }
    }

    .rack-selected-for-move {
      outline: 3px dashed #7c3aed !important;
      box-shadow: 0 0 15px rgba(124, 58, 237, 0.8) !important;
    }

    .rack-code-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      line-height: 1.1;
    }
    .rack-code-text {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.62rem;
      font-weight: 800;
      line-height: 1.08;
      word-break: break-all;
      white-space: normal;
      letter-spacing: -0.02em;
      color: #0f172a;
    }
    .status-indicator-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot-green { background: #059669; }
    .dot-gray { background: #94a3b8; }

    .rack-zone-text {
      font-size: 0.58rem;
      color: #475569;
      line-height: 1.05;
      word-break: break-word;
      white-space: normal;
      margin: 1px 0;
    }
    .rack-qty-text {
      font-size: 0.65rem;
      font-weight: 800;
      font-family: 'JetBrains Mono', monospace;
      color: #0a2472;
      line-height: 1;
    }
    /* Narrow Divided Shelf Boxes (25px width) */
    .narrow-rack {
      padding: 1px !important;
      display: flex !important;
      flex-direction: column !important;
      align-items: center !important;
      justify-content: space-between !important;
      text-align: center !important;
      border-width: 1.5px !important;
    }
    .narrow-dot {
      position: absolute;
      top: 2px;
      right: 2px;
      width: 5px;
      height: 5px;
    }
    .narrow-code-block {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
    }
    .narrow-sub-code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.58rem;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.04em;
      white-space: nowrap;
    }
    .narrow-qty-text {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.44rem;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.06em;
      margin-bottom: 2px;
      color: #0a2472;
      max-width: 100%;
      overflow: hidden;
      white-space: nowrap;
    }

    /* Slanted East Wall Shelves (Parker Inox & Sellos Muro Este: -7.8° parallel to angled blueprint wall) */
    .slanted-east-rack {
      transform: rotate(-7.8deg);
      transform-origin: center center;
    }
    .slanted-east-rack:hover {
      transform: rotate(-7.8deg) scale(1.08) !important;
      z-index: 25 !important;
    }

    /* Edit Banner */
    .edit-mode-banner {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      color: #1e40af;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      gap: 0.65rem;
    }
    .active-move-chip {
      background: #1d4ed8;
      color: #ffffff;
      padding: 2px 8px;
      border-radius: 4px;
      margin-left: 0.5rem;
      font-size: 0.75rem;
    }

    /* Empty Session Warning Card */
    .empty-session-warning-card {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-left: 5px solid #2563eb;
      border-radius: 8px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1.25rem;
      flex-wrap: wrap;
    }
    .empty-warning-content {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      color: #1e3a8a;
    }
    .empty-warning-content strong {
      font-size: 0.95rem;
      display: block;
      margin-bottom: 2px;
    }
    .empty-warning-content p {
      margin: 0;
      font-size: 0.82rem;
      color: #3b82f6;
    }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 1rem;
    }
    .modal-box {
      background: #ffffff;
      border-radius: 14px;
      width: 100%;
      max-width: 640px;
      padding: 1.5rem;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.3);
      display: flex;
      flex-direction: column;
      gap: 1.1rem;
      box-sizing: border-box;
    }
    .modal-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 0.75rem;
      gap: 12px;
    }
    .modal-header-actions-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .modal-code-title {
      margin: 2px 0;
      font-size: 1.35rem;
      color: #0a2472;
    }
    .inspect-stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
      background: #f8fafc;
      padding: 0.85rem;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .i-card { display: flex; flex-direction: column; gap: 0.2rem; }
    .i-lbl {
      font-size: 0.65rem;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
    }
    .i-val {
      font-size: 1.15rem;
      font-weight: 800;
      color: #0f172a;
    }
    .modal-footer-advanced {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
      padding-top: 0.85rem;
      border-top: 1px solid #e2e8f0;
      width: 100%;
      box-sizing: border-box;
    }
    .footer-left-group, .footer-right-group {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      flex-wrap: wrap;
    }

    /* Floating CAD Precision Toolbar (Modo Acomodo) */
    .floating-cad-palette {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #0f172a;
      color: #f8fafc;
      padding: 1rem 1.15rem;
      border-radius: 12px;
      box-shadow: 0 20px 30px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
      z-index: 99;
      width: 320px;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      animation: modalScaleUp 0.18s ease-out;
    }
    .floating-cad-palette.minimized {
      width: auto;
      max-width: 480px;
      padding: 6px 14px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(8px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
      cursor: pointer;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 0;
    }
    .cad-min-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
    }
    .cad-min-coords {
      font-size: 0.72rem;
      color: #38bdf8;
      font-family: 'JetBrains Mono', monospace;
    }
    .cad-min-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-left: 6px;
    }
    .cad-btn-icon {
      background: rgba(255, 255, 255, 0.12);
      border: none;
      color: #f8fafc;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.65rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    .cad-btn-icon:hover {
      background: #38bdf8;
      color: #0f172a;
    }
    .cad-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.15);
      padding-bottom: 0.4rem;
    }
    .cad-header-btns {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .cad-min-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 0.9rem;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 800;
    }
    .cad-min-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #ffffff;
    }
    .cad-title {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.95rem;
    }
    .cad-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #38bdf8;
      box-shadow: 0 0 8px #38bdf8;
    }
    .cad-zone {
      font-size: 0.75rem;
      color: #94a3b8;
    }
    .cad-close-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 1rem;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .cad-close-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      color: #ffffff;
    }
    .cad-fields-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
      width: 100%;
      box-sizing: border-box;
    }
    .cad-input-wrap {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      min-width: 0;
      width: 100%;
      box-sizing: border-box;
    }
    .cad-input-wrap label {
      font-size: 0.65rem;
      color: #94a3b8;
      font-weight: 700;
      text-transform: uppercase;
    }
    .cad-input-wrap input {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      display: block;
      background: #1e293b;
      border: 1px solid #334155;
      color: #38bdf8;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 0.85rem;
      padding: 5px 8px;
      border-radius: 6px;
    }
    .cad-buttons-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
      width: 100%;
      box-sizing: border-box;
    }
    .cad-btn {
      width: 100%;
      text-align: center;
      padding: 5px 6px;
      font-size: 0.74rem;
    }
    .cad-nudge-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      width: 100%;
      padding-top: 2px;
    }
    .cad-nudge-pad {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .nudge-mid {
      display: flex;
      gap: 2px;
    }
    .nudge-btn {
      background: #1e293b;
      border: 1px solid #334155;
      color: #f8fafc;
      font-size: 0.7rem;
      width: 28px;
      height: 24px;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.12s ease;
    }
    .nudge-btn:hover {
      background: #38bdf8;
      color: #0f172a;
    }
    .cad-nudge-hint {
      color: #94a3b8;
      font-size: 0.68rem;
      text-align: center;
    }
    .rack-dragging {
      opacity: 0.85;
      cursor: grabbing !important;
      outline: 3px solid #38bdf8 !important;
      z-index: 50 !important;
    }
    .edit-canvas .rack-element {
      cursor: grab;
    }
    .preset-active {
      background: #0a2472 !important;
      color: #ffffff !important;
      font-weight: 800 !important;
    }
    .delete-warning-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 12px;
      color: #991b1b;
      font-size: 13px;
      margin: 12px 0;
    }
    .form-stack { display: flex; flex-direction: column; gap: 14px; }
    .two-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .label { font-size: 12px; font-weight: 700; color: #475569; margin-bottom: 4px; display: block; }
    .input, .select {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 13px;
      background: #ffffff;
      box-sizing: border-box;
    }
    .input:focus, .select:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }

    /* Resize Shelf Dimensions Tool & Modal Styles */
    .btn-inline-resize {
      color: #0284c7 !important;
      border: 1px solid #bae6fd !important;
      background: #f0f9ff !important;
      border-radius: 6px;
      padding: 3px 8px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.72rem;
      font-weight: 700;
    }
    .btn-inline-resize:hover {
      background: #0284c7 !important;
      color: #ffffff !important;
    }

    .resize-shelf-modal {
      max-width: 660px !important;
      width: 95vw !important;
      max-height: 90vh !important;
      display: flex !important;
      flex-direction: column !important;
      padding: 0 !important;
      border-radius: 14px !important;
      overflow: hidden !important;
      background: #ffffff !important;
      box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.35) !important;
    }
    .resize-modal-header {
      padding: 1.15rem 1.4rem;
      border-bottom: 1px solid #e2e8f0;
      background: #ffffff;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      flex-shrink: 0;
    }
    .resize-modal-body {
      padding: 1.25rem 1.4rem;
      overflow-y: auto;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .resize-modal-footer {
      padding: 0.95rem 1.4rem;
      border-top: 1px solid #e2e8f0;
      background: #f8fafc;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      flex-shrink: 0;
    }
    .presets-cards-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    @media (max-width: 640px) {
      .presets-cards-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    .preset-card {
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 8px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      cursor: pointer;
      text-align: center;
      transition: all 0.15s ease;
      white-space: normal;
    }
    .preset-card:hover {
      border-color: #2563eb;
      background: #f0f7ff;
      transform: translateY(-1px);
    }
    .preset-card.active-preset-card {
      border-color: #0a2472 !important;
      background: #eff6ff !important;
      box-shadow: 0 0 0 2px #0a2472 !important;
    }
    .preset-card-title {
      font-size: 0.78rem;
      font-weight: 700;
      color: #0f172a;
      line-height: 1.2;
    }
    .preset-card.active-preset-card .preset-card-title {
      color: #0a2472;
    }
    .preset-card-badge {
      font-size: 0.7rem;
      font-weight: 700;
      color: #2563eb;
      background: #dbeafe;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .preset-card.active-preset-card .preset-card-badge {
      background: #0a2472;
      color: #ffffff;
    }
    .resize-inputs-row {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 12px;
      align-items: flex-end;
      margin-bottom: 18px;
    }
    .resize-input-card {
      background: #f8fafc;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .stepper-wrap {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 4px;
    }
    .btn-step {
      background: #e2e8f0;
      border: 1px solid #cbd5e1;
      color: #334155;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 6px 7px;
      border-radius: 5px;
      cursor: pointer;
      transition: all 0.12s;
    }
    .btn-step:hover {
      background: #0284c7;
      color: #ffffff;
      border-color: #0284c7;
    }
    .input-stepper {
      width: 65px;
      text-align: center;
      font-size: 1rem;
      font-weight: 800;
      color: #0f172a;
      padding: 5px;
    }
    .resize-actions-card {
      padding-bottom: 4px;
    }
    .dimension-preview-box {
      background: #f1f5f9;
      border: 1px dashed #cbd5e1;
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 16px;
    }
    .preview-label {
      font-size: 0.72rem;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 10px;
    }
    .preview-canvas-area {
      min-height: 100px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ffffff;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      padding: 12px;
      overflow: hidden;
    }
    .preview-shelf-rect {
      background: #0a2472;
      border: 2px solid #38bdf8;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(10, 36, 114, 0.25);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #ffffff;
      padding: 4px;
      box-sizing: border-box;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      max-width: 100%;
      max-height: 220px;
    }
    .preview-code {
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .preview-dims {
      font-size: 0.65rem;
      color: #93c5fd;
      white-space: nowrap;
    }
    .zone-apply-checkbox-wrap {
      background: #f8fafc;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
    }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 0.85rem;
      color: #334155;
      cursor: pointer;
    }

    /* =========================================================================
       SHELF INSPECTOR & PHYSICAL RACK BLUEPRINT (LEVELS A-F)
       ========================================================================= */
    .shelf-inspector-modal {
      max-width: 1060px !important;
      width: 96vw;
      max-height: 92vh;
      overflow-y: auto;
      padding: 1.25rem 1.5rem;
      gap: 1rem;
    }

    .modal-title-inline {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .btn-inline-pencil {
      color: #0284c7;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 8px;
      gap: 5px;
      border-radius: 6px;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      display: inline-flex;
      align-items: center;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-inline-pencil:hover {
      background: #0284c7;
      color: #ffffff;
      border-color: #0284c7;
    }

    .inline-rename-container {
      flex: 1;
      background: #f8fafc;
      border: 1.5px solid #93c5fd;
      border-radius: 10px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-right: 12px;
    }
    .rename-inputs-grid {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .rename-field {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .rename-field.grow {
      flex: 1;
      min-width: 220px;
    }
    .rename-actions-row {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .btn-weekly-import {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
      background: #ffffff;
      border-color: #0284c7;
      color: #0284c7;
    }
    .btn-weekly-import:hover {
      background: #0284c7;
      color: #ffffff;
    }
    .btn-rename-fam-shelf {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 0.76rem;
      font-weight: 700;
      color: #0284c7;
      border-color: #bae6fd;
      background: #f0f9ff;
    }
    .btn-rename-fam-shelf:hover {
      background: #0284c7;
      color: #ffffff;
    }

    /* Import Excel Modal in Croquis */
    .import-excel-modal {
      max-width: 820px !important;
      width: 95vw;
      border-radius: 14px;
      overflow: hidden;
      box-shadow: 0 20px 45px rgba(10, 36, 114, 0.22);
    }
    .import-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.1rem 1.4rem;
      background: linear-gradient(135deg, #0a2472 0%, #1e40af 100%);
      color: #ffffff;
    }
    .import-header-title-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .import-header-icon {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.16);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .import-header-title-wrap h3 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 800;
      color: #ffffff;
    }
    .import-header-sub {
      font-size: 0.78rem;
      color: #bfdbfe;
    }
    .import-modal-body {
      padding: 1.25rem 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-height: 70vh;
      overflow-y: auto;
    }
    .excel-template-banner {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 0.85rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .format-col-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 4px;
    }
    .col-chip {
      font-size: 0.73rem;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 5px;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #0a2472;
    }
    .col-chip-level {
      background: #dcfce7;
      border-color: #86efac;
      color: #166534;
    }
    .col-chip-opt {
      background: #f1f5f9;
      border-style: dashed;
      color: #64748b;
    }
    .import-mode-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 10px;
      margin-top: 6px;
    }
    .import-mode-card {
      text-align: left;
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      padding: 0.75rem 0.9rem;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 5px;
      transition: all 0.15s ease;
    }
    .import-mode-card:hover {
      border-color: #93c5fd;
      background: #f8fafc;
    }
    .import-mode-card.active {
      border-color: #2563eb;
      background: #eff6ff;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
    }
    .import-mode-card.mode-card-weekly.active {
      border-color: #059669;
      background: #ecfdf5;
      box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
    }
    .import-mode-card.mode-card-replace.active {
      border-color: #d97706;
      background: #fffbeb;
      box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.14);
    }
    .badge-weekly {
      background: #d1fae5 !important;
      color: #065f46 !important;
      border: 1px solid #a7f3d0 !important;
    }
    .mode-card-top {
      display: flex;
      align-items: center;
      gap: 7px;
      flex-wrap: wrap;
    }
    .mode-radio {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid #94a3b8;
      display: inline-block;
      flex-shrink: 0;
    }
    .import-mode-card.active .mode-radio {
      border-color: #2563eb;
      background: #2563eb;
      box-shadow: inset 0 0 0 3px #ffffff;
    }
    .import-mode-card.mode-card-weekly.active .mode-radio {
      border-color: #059669;
      background: #059669;
      box-shadow: inset 0 0 0 3px #ffffff;
    }
    .import-mode-card.mode-card-replace.active .mode-radio {
      border-color: #d97706;
      background: #d97706;
    }
    .mode-title {
      font-size: 0.8rem;
      font-weight: 800;
      color: #0f172a;
    }
    .mode-rec-badge {
      font-size: 0.64rem;
      font-weight: 800;
      text-transform: uppercase;
      padding: 1px 6px;
      border-radius: 999px;
      background: #dbeafe;
      color: #1d4ed8;
    }
    .mode-desc {
      margin: 0;
      font-size: 0.72rem;
      color: #475569;
      line-height: 1.35;
    }
    .obsolete-filter-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 0.65rem 0.9rem;
    }
    .obsolete-filter-label {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      cursor: pointer;
      margin: 0;
    }
    .obsolete-filter-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .file-drop-area {
      border: 2px dashed #93c5fd;
      background: #f8fafc;
      border-radius: 12px;
      padding: 1.35rem 1rem;
      text-align: center;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.45rem;
      transition: all 0.18s ease;
    }
    .file-drop-area:hover, .file-drop-area.drag-active {
      background: #eff6ff;
      border-color: #2563eb;
      transform: translateY(-1px);
    }
    .file-drop-area.has-file {
      border-style: solid;
      border-color: #93c5fd;
      background: #eff6ff;
      padding: 0.85rem 1rem;
    }
    .drop-icon-circle {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #dbeafe;
      color: #1d4ed8;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .drop-main-text {
      font-size: 0.88rem;
      color: #0f172a;
    }
    .selected-file-pill {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      background: #ffffff;
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      padding: 0.65rem 0.85rem;
      text-align: left;
    }
    .file-pill-icon {
      width: 38px;
      height: 38px;
      border-radius: 8px;
      background: #16a34a;
      color: #ffffff;
      font-weight: 900;
      font-size: 0.72rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .file-pill-meta {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .file-pill-name {
      font-size: 0.86rem;
      color: #0f172a;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .btn-remove-file {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      color: #64748b;
      cursor: pointer;
    }
    .import-modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 0.9rem 1.4rem;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
    }
    .import-success-body {
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      text-align: center;
    }
    .success-hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }
    .success-check-circle {
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: #dcfce7;
      color: #16a34a;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .success-title {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 800;
      color: #0f172a;
    }
    .success-subtitle {
      margin: 0;
      font-size: 0.85rem;
      color: #64748b;
      max-width: 550px;
    }
    .import-kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }
    @media (max-width: 640px) {
      .import-kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }
    .imp-kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 0.75rem 0.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .imp-kpi-val {
      font-size: 1.35rem;
      font-weight: 800;
      color: #0f172a;
    }
    .imp-kpi-lbl {
      font-size: 0.7rem;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
    }
    .affected-shelves-bar {
      text-align: left;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.75rem 1rem;
    }
    .affected-lbl {
      font-size: 0.76rem;
      font-weight: 700;
      color: #475569;
      display: block;
      margin-bottom: 6px;
    }
    .affected-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .affected-chip {
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
      padding: 2px 7px;
      border-radius: 5px;
      font-size: 0.74rem;
      font-weight: 700;
    }
    .import-success-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 0.9rem 1.4rem;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
    }
    .btn-done-exit {
      padding: 8px 18px;
      font-weight: 700;
    }

    .compact-kpi-strip {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #f8fafc;
      padding: 4px 12px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .c-kpi {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      line-height: 1.15;
    }
    .c-kpi-lbl {
      font-size: 0.65rem;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
    }
    .c-kpi-val {
      font-size: 0.95rem;
      font-weight: 800;
      color: #0f172a;
    }

    .shelf-inspector-body {
      display: grid;
      grid-template-columns: 360px 1fr;
      gap: 1.25rem;
      align-items: stretch;
    }

    @media (max-width: 960px) {
      .shelf-inspector-body {
        grid-template-columns: 1fr;
      }
    }

    /* Left Card: Rack Blueprint */
    .rack-blueprint-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .blueprint-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .blueprint-kicker {
      font-size: 0.72rem;
      font-weight: 800;
      color: #475569;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    /* The Physical Rack Graphic (Faithful to Architectural Blueprint) */
    .physical-rack-graphic {
      background: #ffffff;
      border-radius: 6px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
    }

    .rack-graphic-top-header {
      background: #fef08a;
      border: 2px solid #0f172a;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.15rem;
      font-weight: 900;
      color: #0f172a;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }

    .rack-graphic-main-frame {
      display: flex;
      border-left: 2px solid #0f172a;
      border-right: 2px solid #0f172a;
      border-bottom: 2px solid #0f172a;
      background: #ffffff;
    }

    .rack-levels-sidebar {
      width: 44px;
      background: #bbf7d0;
      border-right: 2px solid #0f172a;
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
    }

    .rack-level-tag {
      flex: 1;
      min-height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.05rem;
      font-weight: 900;
      color: #064e3b;
      background: transparent;
      border: none;
      border-bottom: 2px solid #0f172a;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .rack-level-tag:last-child {
      border-bottom: none;
    }
    .rack-level-tag:hover {
      background: #86efac;
      color: #064e3b;
    }
    .rack-level-tag.active-level {
      background: #059669 !important;
      color: #ffffff !important;
      box-shadow: inset 0 0 0 2px #047857;
    }

    .rack-tiers-container {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .rack-tier-row {
      flex: 1;
      min-height: 42px;
      border-bottom: 2px solid #0f172a;
      position: relative;
      cursor: pointer;
      padding: 3px 4px;
      display: flex;
      align-items: center;
      transition: background 0.12s ease;
    }
    .rack-tier-row:last-child {
      border-bottom: none;
    }
    .rack-tier-row:hover {
      background: rgba(224, 242, 254, 0.45);
    }
    .rack-tier-row.tier-selected {
      background: #e0f2fe !important;
      outline: 2.5px solid #0284c7;
      z-index: 2;
    }
    .rack-tier-row.tier-populated {
      background: #f0fdf4;
    }

    /* 4 Compartment Box Frames per tier */
    .tier-boxes-strip {
      width: 100%;
      height: 100%;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 5px;
      pointer-events: none;
    }
    .tier-box-frame {
      border: 1.5px solid #334155;
      background: #ffffff;
      position: relative;
      border-radius: 2px;
      height: 32px;
    }
    .tier-box-frame::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      border-top: 1.5px solid #334155;
    }

    .tier-info-overlay {
      position: absolute;
      inset: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }
    .tier-stats-pill {
      font-size: 0.72rem;
      font-weight: 700;
      background: rgba(255, 255, 255, 0.95);
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      padding: 2px 10px;
      color: #64748b;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
      white-space: nowrap;
    }
    .tier-stats-pill.has-content {
      background: #eff6ff;
      border-color: #93c5fd;
      color: #1d4ed8;
      font-weight: 800;
    }

    .rack-graphic-bottom-base {
      text-align: center;
      padding-top: 6px;
      font-weight: 800;
      font-size: 0.82rem;
      color: #0f172a;
      letter-spacing: 0.03em;
    }

    .rack-blueprint-footer {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .btn-block {
      width: 100%;
    }
    .unassigned-alert-pill {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #b45309;
      font-size: 0.75rem;
      padding: 4px 8px;
      border-radius: 6px;
      text-align: center;
      cursor: pointer;
    }
    .unassigned-alert-pill:hover {
      background: #fef3c7;
    }

    /* Right Card: Materials by Level & Quick Assignment */
    .shelf-materials-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 12px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .materials-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.35rem;
    }
    .materials-count-badge {
      font-size: 0.75rem;
      font-weight: 700;
      color: #0284c7;
      background: #e0f2fe;
      border: 1px solid #bae6fd;
      padding: 2px 8px;
      border-radius: 999px;
    }

    .level-pills-bar {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
    }
    .lvl-pill-btn {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      color: #334155;
      border-radius: 6px;
      padding: 3px 8px;
      font-size: 0.75rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .lvl-pill-btn:hover {
      background: #f1f5f9;
      border-color: #94a3b8;
    }
    .lvl-pill-btn.has-items {
      border-color: #93c5fd;
      color: #1d4ed8;
      background: #eff6ff;
    }
    .lvl-pill-btn.active {
      background: #0a2472 !important;
      color: #ffffff !important;
      border-color: #0a2472 !important;
      box-shadow: 0 2px 6px rgba(10, 36, 114, 0.35);
    }
    .lvl-pill-btn.unassigned-pill {
      background: #fffbeb;
      border-color: #fde68a;
      color: #b45309;
    }
    .lvl-pill-btn.unassigned-pill.active {
      background: #b45309 !important;
      color: #ffffff !important;
      border-color: #b45309 !important;
    }

    .shelf-mat-search-wrap {
      position: relative;
      width: 100%;
    }
    .btn-clear-mat-search {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 0.85rem;
    }

    .materials-scroll-list {
      max-height: 380px;
      overflow-y: auto;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #ffffff;
      scrollbar-width: thin;
    }
    .materials-empty-box {
      padding: 2.5rem 1rem;
      text-align: center;
      color: #64748b;
      font-size: 0.85rem;
    }

    .materials-assign-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .materials-assign-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      padding: 6px 10px;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      position: sticky;
      top: 0;
      z-index: 5;
      border-bottom: 2px solid #cbd5e1;
    }
    .materials-assign-table td {
      padding: 6px 10px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .materials-assign-table tr:hover {
      background: #f8fafc;
    }
    .row-sec-matched {
      background: #eff6ff !important;
    }

    .mat-th-code { text-align: left; }
    .mat-th-qty { width: 90px; text-align: right; }
    .mat-th-sec { width: 70px; text-align: center; }
    .mat-th-assign { width: 228px; text-align: center; }

    .mat-td-code {
      color: #0f172a;
    }
    .mat-item-notes {
      display: block;
      color: #64748b;
      font-size: 0.72rem;
      font-weight: 400;
    }
    .mat-item-location-pill {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      font-size: 0.72rem;
      font-weight: 700;
      color: #0369a1;
      background: #e0f2fe;
      border: 1px solid #bae6fd;
      border-radius: 4px;
      cursor: pointer;
      vertical-align: middle;
      transition: all 0.12s ease;
    }
    .mat-item-location-pill:hover {
      background: #bae6fd;
      color: #0c4a6e;
    }
    .mat-td-qty {
      color: #1d4ed8;
    }

    /* Badges of current assigned level */
    .badge-level-chip {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .level-chip-s { background: #e2e8f0; color: #0f172a; border: 1px solid #94a3b8; }
    .level-chip-a { background: #eef2ff; color: #3730a3; border: 1px solid #c7d2fe; }
    .level-chip-b { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
    .level-chip-c { background: #ecfeff; color: #0e7490; border: 1px solid #a5f3fc; }
    .level-chip-d { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
    .level-chip-e { background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa; }
    .level-chip-f { background: #fdf2f8; color: #be185d; border: 1px solid #fbcfe8; }
    .level-chip-g { background: #f3e8ff; color: #6b21a8; border: 1px solid #d8b4fe; }
    .badge-level-unassigned {
      color: #94a3b8;
      font-size: 0.75rem;
      font-weight: 600;
    }

    /* Quick 1-Click Level Assignment Buttons */
    .quick-level-buttons {
      display: inline-flex;
      gap: 3px;
      align-items: center;
    }
    .quick-lvl-btn {
      width: 26px;
      height: 24px;
      font-size: 0.75rem;
      font-weight: 800;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      background: #f8fafc;
      color: #334155;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.12s ease;
      padding: 0;
    }
    .quick-lvl-btn:hover {
      background: #eff6ff;
      border-color: #2563eb;
      color: #1d4ed8;
      transform: scale(1.08);
    }
    .quick-lvl-btn.btn-active-lvl {
      background: #2563eb !important;
      color: #ffffff !important;
      border-color: #1d4ed8 !important;
      font-weight: 900;
      box-shadow: 0 1px 4px rgba(37, 99, 235, 0.4);
    }
    .quick-lvl-clear-btn {
      width: 20px;
      height: 24px;
      border: none;
      background: transparent;
      color: #94a3b8;
      cursor: pointer;
      font-size: 0.75rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .quick-lvl-clear-btn:hover {
      color: #dc2626;
    }

    /* =========================================================================
       PER-FAMILY EXPLORE BUTTON & TABBED FAMILY CODES EXPLORER MODAL
       ========================================================================= */
    .sec-explore-btn {
      margin-top: 6px;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      padding: 5px 8px;
      font-size: 0.7rem;
      font-weight: 700;
      color: #1e3a8a;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.14s ease;
    }
    .sec-explore-btn:hover {
      background: #eff6ff;
      border-color: var(--sec-accent, #2563eb);
      color: #0a2472;
      transform: translateY(-1px);
    }
    .sec-explore-left {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .sec-explore-arrow {
      font-weight: 800;
      flex-shrink: 0;
    }

    .family-explorer-modal {
      max-width: 1180px !important;
      width: 96vw;
      max-height: 92vh;
      display: flex;
      flex-direction: column;
      padding: 1.25rem 1.5rem;
      gap: 0.85rem;
      overflow: hidden;
    }

    .fam-explorer-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      flex-wrap: wrap;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 0.75rem;
    }
    .fam-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 2px;
    }
    .fam-color-dot {
      width: 13px;
      height: 13px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .fam-modal-title {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 800;
      color: #0a2472;
    }
    .fam-pct-badge {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 2px 9px;
      border-radius: 999px;
      background: #f1f5f9;
      color: #334155;
      border: 1px solid #cbd5e1;
    }
    .fam-pct-badge.pct-complete {
      background: #ecfdf5;
      color: #047857;
      border-color: #a7f3d0;
    }
    .fam-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* Family Switcher Tabs Ribbon */
    .fam-tabs-ribbon {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      padding-bottom: 4px;
      scrollbar-width: thin;
      border-bottom: 1px solid #e2e8f0;
    }
    .fam-tab-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      color: #334155;
      font-size: 0.76rem;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.14s ease;
    }
    .fam-tab-btn:hover {
      background: #eff6ff;
      border-color: var(--tab-color, #2563eb);
    }
    .fam-tab-btn.active {
      background: #0a2472;
      color: #ffffff;
      border-color: #0a2472;
      box-shadow: 0 2px 6px rgba(10, 36, 114, 0.28);
    }
    .fam-tab-dot {
      width: 8px;
      height: 8px;
      border-radius: 3px;
      flex-shrink: 0;
    }
    .fam-tab-count {
      font-size: 0.68rem;
      padding: 1px 5px;
      border-radius: 4px;
      background: rgba(15, 23, 42, 0.08);
    }
    .fam-tab-btn.active .fam-tab-count {
      background: rgba(255, 255, 255, 0.2);
      color: #ffffff;
    }

    .fam-toolbar {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }
    .fam-search-wrap {
      position: relative;
      flex: 1;
      min-width: 220px;
    }
    .fam-shelf-select {
      width: auto;
      min-width: 230px;
      max-width: 280px;
    }
    .fam-view-toggle {
      display: inline-flex;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 2px;
      gap: 2px;
    }
    .fam-view-btn {
      border: none;
      background: transparent;
      color: #475569;
      font-size: 0.76rem;
      font-weight: 700;
      padding: 5px 10px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .fam-view-btn.active {
      background: #ffffff;
      color: #0a2472;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
    }

    .fam-level-strip {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-wrap: wrap;
    }
    .fam-strip-lbl {
      font-size: 0.72rem;
      font-weight: 700;
      color: #64748b;
      margin-right: 4px;
    }

    .fam-table-scroll {
      flex: 1;
      min-height: 240px;
      max-height: 52vh;
      overflow-y: auto;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      background: #ffffff;
      scrollbar-width: thin;
    }
    .fam-th-shelf { width: 120px; text-align: left; }
    .fam-th-sec { width: 65px; }
    .fam-th-code { text-align: left; }
    .fam-th-qty { width: 100px; }
    .fam-th-assign { width: 228px; }
    .fam-th-act { width: 80px; }
    .fam-th-locations { text-align: left; }

    .fam-shelf-link {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      border-radius: 5px;
      padding: 2px 7px;
      font-size: 0.76rem;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.12s ease;
    }
    .fam-shelf-link:hover {
      background: #1d4ed8;
      color: #ffffff;
      border-color: #1d4ed8;
    }

    .fam-loc-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .fam-loc-chip {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      color: #1e293b;
      border-radius: 5px;
      padding: 2px 7px;
      font-size: 0.72rem;
      font-weight: 700;
      cursor: pointer;
    }
    .fam-loc-chip:hover {
      background: #eff6ff;
      border-color: #2563eb;
      color: #1d4ed8;
    }
    .loc-sec-tag {
      color: #0284c7;
      font-weight: 800;
    }

    .fam-load-more {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 12px;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      font-size: 0.8rem;
      color: #475569;
    }

    /* Master Material Inventory & Replenishment Planning Modal */
    .modal-backdrop-planning {
      z-index: 1060;
      background: rgba(15, 23, 42, 0.78);
      backdrop-filter: blur(4px);
    }
    .modal-box-planning {
      max-width: 960px !important;
      width: 95vw !important;
      max-height: 92vh !important;
      overflow-y: auto !important;
      background: #0b1329 !important;
      color: #f8fafc !important;
      border: 1px solid #1e293b !important;
      border-radius: 14px !important;
      padding: 24px 28px !important;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.85) !important;
      box-sizing: border-box !important;
    }

    .planning-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 16px;
      margin-bottom: 18px;
      background: #0b1329 !important;
    }
    .planning-brand-crumbs {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #94a3b8;
    }
    .planning-brand {
      color: #38bdf8 !important;
      font-weight: 800 !important;
    }
    .crumb-sep {
      color: #64748b;
    }
    .crumb-cat {
      color: #cbd5e1 !important;
    }
    .planning-corte-date {
      font-size: 0.75rem;
      color: #94a3b8 !important;
      margin-top: 4px;
    }
    .planning-product-title {
      font-size: 1.65rem !important;
      font-weight: 800 !important;
      color: #ffffff !important;
      margin: 6px 0 3px 0 !important;
      line-height: 1.25 !important;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5) !important;
    }
    .planning-product-subtitle {
      font-size: 0.88rem;
      color: #cbd5e1 !important;
      font-weight: 600;
    }
    .planning-header-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .planning-status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 16px;
      border-radius: 20px;
      font-size: 0.82rem;
      font-weight: 800;
      letter-spacing: 0.02em;
    }
    .planning-status-badge.status-en_camino {
      background: #78350f !important;
      color: #fef08a !important;
      border: 1.5px solid #f59e0b !important;
      font-weight: 800 !important;
      letter-spacing: 0.03em !important;
      box-shadow: 0 2px 10px rgba(245, 158, 11, 0.25) !important;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6) !important;
    }
    .planning-status-badge.status-reordenar {
      background: #7f1d1d !important;
      color: #fecaca !important;
      border: 1.5px solid #ef4444 !important;
      font-weight: 800 !important;
      letter-spacing: 0.03em !important;
      box-shadow: 0 2px 10px rgba(239, 68, 68, 0.25) !important;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6) !important;
    }
    .planning-status-badge.status-optimo {
      background: #14532d !important;
      color: #bbf7d0 !important;
      border: 1.5px solid #22c55e !important;
      font-weight: 800 !important;
      letter-spacing: 0.03em !important;
      box-shadow: 0 2px 10px rgba(34, 197, 94, 0.25) !important;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6) !important;
    }
    .modal-box-planning .modal-close-icon-btn {
      color: #94a3b8 !important;
      font-size: 1.4rem !important;
      background: transparent !important;
      border: none !important;
      cursor: pointer !important;
      padding: 4px 8px !important;
      border-radius: 6px !important;
      line-height: 1 !important;
      transition: color 0.15s, background-color 0.15s !important;
    }
    .modal-box-planning .modal-close-icon-btn:hover {
      color: #ffffff !important;
      background: rgba(255, 255, 255, 0.12) !important;
    }
    .status-dot-pulse {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }

    /* Decoded Location Bar */
    .planning-location-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 18px;
    }
    .loc-card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    .loc-card-title {
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94a3b8;
    }
    .loc-card-badge {
      background: #0284c7;
      color: #ffffff;
      padding: 3px 10px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 0.82rem;
    }
    .loc-segments-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 10px;
    }
    .loc-seg-box {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 6px 10px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.78rem;
    }
    .seg-code {
      font-weight: 800;
      color: #38bdf8;
    }
    .seg-eq {
      color: #64748b;
    }
    .seg-name {
      color: #e2e8f0;
      font-weight: 600;
    }

    /* 4 KPIs */
    .planning-kpis-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 18px;
    }
    .plan-kpi-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
    }
    .plan-kpi-card.highlight-warning {
      border-color: #f59e0b;
      background: rgba(245, 158, 11, 0.08);
    }
    .kpi-lbl-top {
      font-size: 0.8rem;
      font-weight: 700;
      color: #cbd5e1;
      margin-bottom: 6px;
    }
    .kpi-big-num {
      font-size: 2.1rem;
      font-weight: 800;
      color: #f8fafc;
      line-height: 1;
      margin-bottom: 6px;
    }
    .kpi-sub-lbl {
      font-size: 0.75rem;
      font-weight: 600;
      color: #94a3b8;
    }
    .kpi-annotation {
      font-size: 0.7rem;
      color: #64748b;
      margin-top: 4px;
      line-height: 1.25;
    }

    /* Calculation Box */
    .planning-calc-box {
      background: #132338;
      border: 1px solid #0284c7;
      border-radius: 8px;
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 24px;
      margin-bottom: 18px;
    }
    .calc-left {
      min-width: 220px;
    }
    .calc-title {
      font-size: 0.85rem;
      font-weight: 700;
      color: #38bdf8;
    }
    .calc-pieces {
      font-size: 2.2rem;
      font-weight: 800;
      color: #ffffff;
      line-height: 1.1;
      margin: 4px 0;
    }
    .calc-unit {
      font-size: 1rem;
      font-weight: 600;
      color: #94a3b8;
    }
    .calc-condition {
      font-size: 0.75rem;
      font-weight: 600;
    }
    .cond-alert {
      color: #f87171;
    }
    .cond-ok {
      color: #4ade80;
    }
    .calc-right {
      flex: 1;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(56, 189, 248, 0.2);
      border-radius: 6px;
      padding: 12px 16px;
    }
    .calc-math-headline {
      font-size: 0.95rem;
      color: #f8fafc;
      margin-bottom: 4px;
    }
    .calc-math-breakdown {
      font-size: 0.82rem;
      color: #38bdf8;
      margin-bottom: 6px;
    }
    .calc-math-verdict {
      font-size: 0.78rem;
      color: #cbd5e1;
      line-height: 1.35;
    }

    /* Split Row: Supplier + PO */
    .planning-split-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 18px;
    }
    .planning-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 16px;
    }
    .card-title-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #334155;
      padding-bottom: 8px;
      margin-bottom: 12px;
    }
    .p-card-title {
      font-size: 0.9rem;
      font-weight: 800;
      color: #f8fafc;
      margin: 0;
    }
    .p-card-sub {
      font-size: 0.75rem;
      color: #94a3b8;
    }
    .p-data-list {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    .p-data-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.78rem;
    }
    .p-dt-label {
      color: #94a3b8;
    }
    .p-dt-val {
      color: #f1f5f9;
      font-weight: 600;
    }
    .p-data-row.highlight-pending {
      background: rgba(245, 158, 11, 0.1);
      border-radius: 4px;
      padding: 4px 6px;
    }
    .p-data-row.highlight-pending .p-dt-val {
      color: #fbbf24;
    }
    .po-header-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      padding-bottom: 4px;
      border-bottom: 1px dashed #334155;
    }
    .po-code {
      color: #38bdf8;
    }

    /* Demand Forecast Chart */
    .planning-demand-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 18px;
    }
    .demand-header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .demand-title {
      font-size: 0.92rem;
      font-weight: 800;
      color: #f8fafc;
      margin: 0;
    }
    .demand-sub {
      font-size: 0.75rem;
      color: #94a3b8;
    }
    .demand-avg-kpi {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .demand-avg-num {
      font-size: 1.6rem;
      font-weight: 800;
      color: #2dd4bf;
    }
    .demand-avg-lbl {
      font-size: 0.78rem;
      color: #94a3b8;
    }
    .demand-chart-container {
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 16px 12px 10px 12px;
    }
    .chart-bars-wrap {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      height: 120px;
      gap: 8px;
      padding: 0 10px;
    }
    .chart-bar-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      justify-content: flex-end;
    }
    .bar-val-tag {
      font-size: 0.72rem;
      font-weight: 700;
      color: #f1f5f9;
      margin-bottom: 4px;
    }
    .bar-track {
      width: 100%;
      max-width: 42px;
      height: 85px;
      display: flex;
      align-items: flex-end;
      background: rgba(51, 65, 85, 0.3);
      border-radius: 4px;
      overflow: hidden;
    }
    .bar-fill {
      width: 100%;
      background: #14b8a6;
      border-radius: 3px 3px 0 0;
      transition: height 0.3s ease;
    }
    .bar-fill.estimated-fill {
      background: repeating-linear-gradient(
        45deg,
        #0d9488,
        #0d9488 6px,
        #0f766e 6px,
        #0f766e 12px
      );
    }
    .bar-month-lbl {
      font-size: 0.7rem;
      font-weight: 600;
      color: #94a3b8;
      margin-top: 6px;
    }
    .chart-legend-row {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-top: 12px;
      font-size: 0.75rem;
      color: #94a3b8;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 2px;
    }
    .solid-dot {
      background: #14b8a6;
    }
    .striped-dot {
      background: repeating-linear-gradient(
        45deg,
        #0d9488,
        #0d9488 3px,
        #0f766e 3px,
        #0f766e 6px
      );
    }
    .demand-footer-hint {
      margin-top: 10px;
      text-align: right;
    }

    .mat-code-link {
      cursor: pointer;
      color: #0284c7;
      text-decoration: underline;
      transition: color 0.15s ease;
    }
    .mat-code-link:hover {
      color: #0369a1;
    }

    /* Location Assigner Modal & Bulk Assignment */
    .location-assigner-backdrop {
      z-index: 1055;
      background: rgba(15, 23, 42, 0.82);
      backdrop-filter: blur(5px);
    }
    .location-assigner-modal {
      max-width: 1240px !important;
      width: 96vw !important;
      max-height: 94vh !important;
      display: flex;
      flex-direction: column;
      background: #0b1329 !important;
      border: 1px solid #334155 !important;
      border-radius: 12px !important;
      color: #f8fafc !important;
      padding: 1.25rem 1.5rem !important;
      gap: 0.85rem !important;
      overflow: hidden !important;
    }
    .assigner-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 0.75rem;
    }
    .assigner-brand-crumbs {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.75rem;
      font-weight: 700;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .assigner-title {
      font-size: 1.35rem;
      font-weight: 800;
      color: #f8fafc;
      margin: 0 0 4px 0;
    }
    .assigner-sub {
      margin: 0;
      font-size: 0.82rem;
      color: #94a3b8;
      line-height: 1.3;
    }
    .assigner-header-right {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    .assigner-stats-strip {
      display: flex;
      gap: 8px;
    }
    .a-stat {
      display: flex;
      flex-direction: column;
      align-items: center;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 6px;
      padding: 4px 10px;
      min-width: 70px;
    }
    .a-stat.highlight-pending {
      border-color: #f59e0b;
      background: rgba(245, 158, 11, 0.12);
    }
    .a-stat-lbl {
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      color: #94a3b8;
    }
    .a-stat-val {
      font-size: 1.15rem;
      font-weight: 800;
      color: #f8fafc;
    }
    .location-assigner-modal .modal-close-icon-btn {
      color: #94a3b8 !important;
      font-size: 1.4rem !important;
      background: transparent !important;
      border: none !important;
      cursor: pointer !important;
      padding: 4px 8px !important;
      border-radius: 6px !important;
      line-height: 1 !important;
      transition: color 0.15s, background-color 0.15s !important;
    }
    .location-assigner-modal .modal-close-icon-btn:hover {
      color: #ffffff !important;
      background: rgba(255, 255, 255, 0.12) !important;
    }

    /* Bulk Fill Ribbon */
    .bulk-fill-ribbon {
      background: #131e3a;
      border: 1px solid #2d3d66;
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .bulk-fill-header {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .bulk-fill-title {
      font-size: 0.8rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #38bdf8;
    }
    .bulk-fill-hint {
      font-size: 0.75rem;
      color: #94a3b8;
    }
    .bulk-fill-controls {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .bulk-field {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .bulk-field label {
      font-size: 0.75rem;
      font-weight: 700;
      color: #cbd5e1;
    }
    .bulk-aisle-input, .bulk-pos-input {
      width: 48px;
      text-align: center;
    }
    .bulk-level-buttons {
      display: flex;
      gap: 2px;
    }
    .btn-lvl-mini {
      padding: 3px 7px;
      font-size: 0.72rem;
      font-weight: 800;
      border-radius: 4px;
      border: 1px solid #475569;
      background: #1e293b;
      color: #cbd5e1;
      cursor: pointer;
      line-height: 1;
      transition: all 0.15s;
    }
    .btn-lvl-mini:hover {
      background: #334155;
      color: #ffffff;
    }
    .btn-lvl-mini.active {
      background: #0284c7;
      border-color: #38bdf8;
      color: #ffffff;
      box-shadow: 0 0 8px rgba(56, 189, 248, 0.4);
    }
    .bulk-preview-box {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #0f172a;
      border: 1px dashed #38bdf8;
      border-radius: 6px;
      padding: 4px 10px;
    }
    .preview-lbl {
      font-size: 0.7rem;
      color: #94a3b8;
      text-transform: uppercase;
    }
    .preview-val {
      font-size: 0.85rem;
      font-weight: 800;
      color: #38bdf8;
    }
    .bulk-actions {
      display: flex;
      gap: 6px;
      margin-left: auto;
    }

    /* Assigner Toolbar */
    .assigner-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .assigner-search-wrap {
      position: relative;
      flex: 1;
      max-width: 460px;
    }
    .assigner-filter-tabs {
      display: flex;
      gap: 4px;
    }
    .btn-filter-tab {
      padding: 5px 12px;
      font-size: 0.78rem;
      font-weight: 700;
      border-radius: 6px;
      border: 1px solid #334155;
      background: #1e293b;
      color: #94a3b8;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-filter-tab:hover {
      color: #ffffff;
      border-color: #475569;
    }
    .btn-filter-tab.active {
      background: #0284c7;
      border-color: #0284c7;
      color: #ffffff;
    }

    /* Assigner Table */
    .assigner-table-container {
      flex: 1;
      overflow-y: auto;
      border: 1px solid #334155;
      border-radius: 8px;
      background: #0f172a;
      min-height: 250px;
      max-height: calc(94vh - 360px);
    }
    .assigner-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.78rem;
    }
    .assigner-table thead th {
      position: sticky;
      top: 0;
      background: #1e293b;
      color: #cbd5e1;
      font-weight: 700;
      padding: 8px 10px;
      border-bottom: 1px solid #334155;
      z-index: 2;
      text-align: left;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .assigner-table tbody td {
      padding: 6px 10px;
      border-bottom: 1px solid #1e293b;
      vertical-align: middle;
    }
    .assigner-table tbody tr:hover {
      background: rgba(30, 41, 59, 0.6);
    }
    .assigner-table tr.row-dirty {
      background: rgba(14, 165, 233, 0.07);
    }
    .assigner-table tr.row-missing {
      background: rgba(245, 158, 11, 0.05);
    }
    .dirty-badge {
      display: inline-block;
      margin-left: 6px;
      padding: 1px 6px;
      font-size: 0.65rem;
      font-weight: 700;
      background: #0284c7;
      color: #ffffff;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .row-level-pills {
      display: flex;
      gap: 2px;
    }
    .btn-lvl-pill {
      padding: 2px 5px;
      font-size: 0.7rem;
      font-weight: 700;
      border-radius: 3px;
      border: 1px solid #334155;
      background: #1e293b;
      color: #94a3b8;
      cursor: pointer;
      line-height: 1;
    }
    .btn-lvl-pill:hover {
      background: #475569;
      color: #ffffff;
    }
    .btn-lvl-pill.active {
      background: #10b981;
      border-color: #34d399;
      color: #ffffff;
      font-weight: 800;
    }
    .loc-code-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 800;
    }
    .loc-code-badge.badge-complete {
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid #10b981;
      color: #34d399;
    }
    .loc-code-badge.badge-incomplete {
      background: rgba(245, 158, 11, 0.15);
      border: 1px dashed #f59e0b;
      color: #fbbf24;
    }
    .btn-bulk-selected {
      background: #059669;
      color: #ffffff;
      border: 1px solid #10b981;
      font-weight: 700;
    }
    .btn-bulk-selected:hover {
      background: #047857;
      color: #ffffff;
    }
    .btn-master-catalog {
      background: #4f46e5;
      color: #ffffff;
      border: 1px solid #6366f1;
      font-weight: 700;
    }
    .btn-master-catalog:hover {
      background: #4338ca;
      color: #ffffff;
    }
    .filter-tab-obsolete {
      border-color: #f97316 !important;
      color: #ea580c !important;
    }
    .filter-tab-obsolete.active {
      background: #ea580c !important;
      color: #ffffff !important;
      border-color: #c2410c !important;
    }
    .filter-tab-pending {
      border-color: #eab308 !important;
      color: #a16207 !important;
    }
    .filter-tab-pending.active {
      background: #eab308 !important;
      color: #ffffff !important;
      border-color: #ca8a04 !important;
    }
    .filter-tab-defined {
      border-color: #10b981 !important;
      color: #059669 !important;
    }
    .filter-tab-defined.active {
      background: #10b981 !important;
      color: #ffffff !important;
      border-color: #059669 !important;
    }
    .assigner-toolbar-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .checkbox-table-header, .checkbox-table-row {
      cursor: pointer;
      width: 15px;
      height: 15px;
      accent-color: #0284c7;
    }
    .assigner-table tr.row-selected {
      background: rgba(56, 189, 248, 0.16) !important;
    }
    .assigner-table tr.row-undefined {
      background: #fefce8 !important;
      border-left: 5px solid #eab308 !important;
    }
    .assigner-table tr.row-undefined:hover {
      background: #fef9c3 !important;
    }
    .assigner-table tr.row-obsolete {
      background: #fff7ed !important;
      border-left: 5px solid #f97316 !important;
    }
    .assigner-table tr.row-obsolete:hover {
      background: #ffedd5 !important;
    }
    .badge-undefined-tag {
      display: inline-block;
      margin-left: 6px;
      padding: 2px 6px;
      font-size: 0.65rem;
      font-weight: 800;
      background: #eab308;
      color: #713f12;
      border-radius: 4px;
      letter-spacing: 0.05em;
      border: 1px solid #facc15;
    }
    .badge-obsolete-tag {
      display: inline-block;
      margin-left: 6px;
      padding: 2px 6px;
      font-size: 0.65rem;
      font-weight: 800;
      background: #ea580c;
      color: #ffffff;
      border-radius: 4px;
      letter-spacing: 0.04em;
    }

    /* Shelf Creator & Bulk Editor Modals */
    .shelf-creator-modal {
      max-width: 680px;
      width: 100%;
    }
    .shelf-creator-body {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 10px 0;
    }
    .form-grid-2col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .form-grid-4col {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }
    .preset-section {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .preset-buttons-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .bulk-shelf-editor-modal {
      max-width: 980px;
      width: 95vw;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }
    .bulk-editor-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-y: auto;
      max-height: calc(90vh - 160px);
      padding: 6px 0;
    }
    .bulk-filter-strip {
      display: flex;
      align-items: center;
      gap: 12px;
      background: #f8fafc;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      flex-wrap: wrap;
    }
    .bulk-filter-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .bulk-count-pill {
      margin-left: auto;
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.76rem;
      font-weight: 700;
    }
    .series-automation-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .series-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      color: #166534;
      font-size: 0.82rem;
    }
    .series-inputs-row {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .series-input-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.78rem;
      font-weight: 700;
      color: #374151;
    }
    .bulk-shelves-table-wrap {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: auto;
      max-height: 380px;
    }
    .bulk-shelves-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
    }
    .bulk-shelves-table th {
      background: #f8fafc;
      position: sticky;
      top: 0;
      z-index: 2;
      padding: 6px 10px;
      border-bottom: 2px solid #cbd5e1;
      font-weight: 700;
      color: #475569;
      text-align: left;
    }
    .bulk-shelves-table td {
      padding: 4px 6px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    .input-xs {
      padding: 3px 6px;
      font-size: 0.78rem;
      height: 28px;
      width: 100%;
      box-sizing: border-box;
    }

    /* Levels H, I, J Badges */
    .level-chip-h { background: #fef08a !important; color: #854d0e !important; }
    .level-chip-i { background: #fed7aa !important; color: #9a3412 !important; }
    .level-chip-j { background: #fbcfe8 !important; color: #9d174d !important; }

    /* Mobile Responsive Optimizations (iOS / iPhone / Tablets) */
    @media (max-width: 900px) {
      .croquis-container {
        padding: 0.25rem !important;
        overflow-x: hidden !important;
        width: 100% !important;
      }
      .croquis-header {
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 10px !important;
      }
      .croquis-top-actions {
        flex-wrap: wrap !important;
        gap: 6px !important;
        justify-content: flex-start !important;
      }
      .croquis-main-layout {
        flex-direction: column !important;
        gap: 12px !important;
        width: 100% !important;
      }
      .croquis-canvas-col {
        width: 100% !important;
        max-width: 100% !important;
        flex: 1 1 100% !important;
      }
      .sections-progress-sidebar {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        flex: 1 1 auto !important;
        position: static !important;
      }
      .blueprint-canvas-wrap {
        padding: 0.25rem !important;
        touch-action: pan-x pan-y pinch-zoom;
        -webkit-overflow-scrolling: touch;
      }
      .shelf-inspector-body {
        grid-template-columns: 1fr !important;
      }
      .form-grid-2col, .form-grid-4col {
        grid-template-columns: 1fr !important;
      }
      .bulk-filter-strip {
        flex-direction: column !important;
        align-items: stretch !important;
      }
      .series-inputs-row {
        flex-direction: column !important;
        align-items: stretch !important;
      }
    }
  `]
})
export class CroquisComponent implements OnInit {
  @ViewChild('canvasElement') canvasRef!: ElementRef<HTMLDivElement>;
  @ViewChild('viewportContainer') viewportRef!: ElementRef<HTMLDivElement>;

  sessions = signal<InventorySessionSummary[]>([]);
  activeSessionId = signal<number>(0);
  allShelves = signal<ShelfAssignmentDto[]>([]);

  selectedPlant = signal<'Planta Baja' | 'Planta Alta'>('Planta Baja');
  searchQuery = '';
  zoomLevel = signal<number>(68);
  blueprintOpacity = signal<number>(30); // 30% overlay default for optimal visual contrast

  // Section Progress & Filtering (Avance por familias en panel lateral)
  selectedSectionFilter = signal<string | null>(null);
  showSidebar = signal<boolean>(true);
  statusQuickFilter = signal<'ALL' | 'COMPLETED' | 'PENDING'>('ALL');

  // Viewport Drag-to-Pan (Desplazamiento fluido al hacer zoom)
  isPanning = false;
  panStartX = 0;
  panStartY = 0;
  scrollStartX = 0;
  scrollStartY = 0;

  // Edit / Repositioning Mode
  editMode = signal<boolean>(false);
  selectedRackForMove: ShelfAssignmentDto | null = null;
  isCadPaletteMinimized = signal<boolean>(false);
  savingLayout = signal<boolean>(false);
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  dragInitialX = 0;
  dragInitialY = 0;
  draggedRack: ShelfAssignmentDto | null = null;
  inspectedShelf: ShelfAssignmentDto | null = null;

  // Quick Inline Shelf Renaming State
  inlineRenamingShelf = false;
  renameShelfCode = '';
  renameShelfDesc = '';
  renameShelfZone = '';
  savingInlineRename = signal<boolean>(false);

  // Croquis Smart Import Modal State (Levantamiento Semanal SAE / Excel)
  showImportExcelModal = false;
  selectedExcelFile: File | null = null;
  importTargetShelfId = signal<number>(0);
  importTargetFamily = signal<string>('');
  importMode = signal<'SMART_MERGE' | 'REPLACE_ALL' | 'WEEKLY_UPDATE'>('SMART_MERGE');
  filterObsoleteImport = signal<boolean>(true);
  isDraggingFile = signal<boolean>(false);
  downloadingTemplate = signal<boolean>(false);
  importingExcel = signal<boolean>(false);
  importResult: any = null;

  // Physical Rack Blueprint & Quick Section Assignment State (Niveles S, A-J)
  rackLevels: string[] = ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  inspectedMaterials = signal<CountRecordDto[]>([]);
  loadingMaterials = signal<boolean>(false);
  selectedLevelFilter = signal<string>('TODOS');
  shelfMaterialSearch = signal<string>('');
  updatingRecordId = signal<number | null>(null);

  // Shelf Creation State
  showCreateShelfModal = signal<boolean>(false);
  newShelfCode = '';
  newShelfDesc = '';
  newShelfZone = 'YPC';
  newShelfPlant = 'Planta Baja';
  newShelfPosX = 948;
  newShelfPosY = 104;
  newShelfWidth = 76;
  newShelfHeight = 34;
  creatingShelf = signal<boolean>(false);

  // Shelf Deletion State
  shelfToDelete: ShelfAssignmentDto | null = null;
  deletingShelf = signal<boolean>(false);

  // Dedicated Shelf Resizing Tool State
  showResizeShelfModal = signal<boolean>(false);
  resizingShelfTarget = signal<ShelfAssignmentDto | null>(null);
  resizeTargetWidth = signal<number>(76);
  resizeTargetHeight = signal<number>(34);
  resizeApplyToAllInZone = signal<boolean>(false);
  savingShelfResize = signal<boolean>(false);

  // Bulk Shelf Editor & Series Renumber State
  showBulkShelfEditorModal = signal<boolean>(false);
  bulkEditorZone = signal<string>('YPC');
  bulkEditorPlant = signal<string>('Planta Baja');
  bulkEditorShelves: Array<{
    id: number;
    code: string;
    originalCode: string;
    description: string;
    posX: number;
    posY: number;
    width: number;
    height: number;
    zone: string;
    plant: string;
  }> = [];
  seriesPrefix = 'PB-YPC-';
  seriesStartNumber = 10;
  seriesDigits = 2;
  savingBulkShelves = signal<boolean>(false);

  filteredMaterials = computed(() => {
    let list = this.inspectedMaterials();
    const lvl = this.selectedLevelFilter();
    if (lvl === 'SIN_NIVEL') {
      list = list.filter(m => !m.section || !m.section.trim());
    } else if (lvl !== 'TODOS') {
      list = list.filter(m => m.section && m.section.toUpperCase() === lvl);
    }

    const q = this.shelfMaterialSearch().trim().toLowerCase();
    if (q) {
      list = list.filter(m =>
        m.capturedCode.toLowerCase().includes(q) ||
        (m.notes && m.notes.toLowerCase().includes(q))
      );
    }
    return list;
  });

  uniqueZonesList = computed(() => {
    const zones = new Set<string>();
    for (const s of this.allShelves()) {
      if (s.shelfZone && s.shelfZone.trim()) {
        zones.add(s.shelfZone.trim());
      }
    }
    if (zones.size === 0) {
      zones.add('YPC');
      zones.add('Acero');
      zones.add('Kuriyama');
    }
    return Array.from(zones).sort();
  });

  // Tabbed Family Codes Explorer State (Ver todos los códigos por familia: Acero, Kuriyama, YPC, etc.)
  activeFamilyExplorer = signal<SectionStat | null>(null);
  selectedProductPlanning = signal<ProductPlanningData | null>(null);
  allSessionCounts = signal<CountRecordDto[]>([]);
  loadingFamilyCounts = signal<boolean>(false);
  familySearchQuery = signal<string>('');
  familyShelfFilter = signal<string>('TODOS');
  familyLevelFilter = signal<string>('TODOS');
  familyViewMode = signal<'DETALLE' | 'CONSOLIDADO'>('DETALLE');
  familyDisplayLimit = signal<number>(150);

  // Location Assigner & Planning SAE State
  locationAssignerFamily = signal<SectionStat | null>(null);
  locationAssignerRows = signal<LocationAssignerRow[]>([]);
  locationAssignerSearch = signal<string>('');
  locationAssignerFilter = signal<'TODOS' | 'PENDIENTES' | 'ASIGNADOS' | 'OBSOLETOS'>('TODOS');
  savingLocations = signal<boolean>(false);

  bulkPlant = signal<'PB' | 'PA'>('PB');
  bulkAisle = signal<string>('3');
  bulkShelfId = signal<number>(0);
  bulkLevel = signal<string>('A');
  bulkPosition = signal<string>('1');

  isObsoleteItem(code?: string, desc?: string): boolean {
    if (desc) {
      const d = desc.trim().toUpperCase();
      if (d === 'ELIMINAR' || d.startsWith('ELIMINAR') || d === 'E' || d === 'OBSOLETO' || d.includes('DESCONTINUADO') || d.includes('NO USAR') || d.includes('CANCELADO')) {
        return true;
      }
    }
    if (code) {
      const c = code.trim().toUpperCase();
      if (c.startsWith('ELIM-') || c.startsWith('OBS-') || c.endsWith('-ELIM')) {
        return true;
      }
    }
    return false;
  }

  isPendingShelf(shelfCode?: string | null): boolean {
    if (!shelfCode) return true;
    const c = shelfCode.toUpperCase();
    return c.includes('PEN') || c.includes('SIN') || c.includes('GENERAL') || c.includes('PENDIENTE') || c.includes('SIN ASIGNAR');
  }

  isRowUndefined(row: LocationAssignerRow): boolean {
    if (!row) return true;
    return !row.level || !row.shelfNum || !row.aisle || row.shelfId === 0 || !row.locationCode || this.isPendingShelf(row.shelfCode);
  }

  locationAssignerFilteredRows = computed(() => {
    let rows = this.locationAssignerRows();
    const filter = this.locationAssignerFilter();
    if (filter === 'PENDIENTES') {
      rows = rows.filter(r => this.isRowUndefined(r));
    } else if (filter === 'ASIGNADOS') {
      rows = rows.filter(r => !this.isRowUndefined(r) && !r.isObsolete);
    } else if (filter === 'OBSOLETOS') {
      rows = rows.filter(r => this.isObsoleteItem(r.code, r.description));
    }
    const q = this.locationAssignerSearch().trim().toLowerCase();
    if (q) {
      rows = rows.filter(r =>
        (r.code || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.locationCode || '').toLowerCase().includes(q) ||
        (r.shelfCode || '').toLowerCase().includes(q)
      );
    }
    return rows;
  });

  locationAssignerPendingCount = computed(() => {
    return this.locationAssignerRows().filter(r => this.isRowUndefined(r)).length;
  });

  locationAssignerDefinedCount = computed(() => {
    return this.locationAssignerRows().filter(r => !this.isRowUndefined(r) && !r.isObsolete).length;
  });

  locationAssignerObsoleteCount = computed(() => {
    return this.locationAssignerRows().filter(r => this.isObsoleteItem(r.code, r.description)).length;
  });

  locationAssignerSelectedCount = computed(() => {
    return this.locationAssignerRows().filter(r => r.isSelected).length;
  });

  locationAssignerDirtyCount = computed(() => {
    return this.locationAssignerRows().filter(r => r.isDirty).length;
  });

  familyShelves = computed(() => {
    const fam = this.activeFamilyExplorer();
    if (!fam) return [];
    return this.plantShelves()
      .filter(s => this.getSectionType(s) === fam.id)
      .sort((a, b) => a.shelfCode.localeCompare(b.shelfCode, undefined, { numeric: true }));
  });

  familyCounts = computed(() => {
    const fam = this.activeFamilyExplorer();
    if (!fam) return [];
    const allowedShelfIds = new Set(this.familyShelves().map(s => s.shelfId));
    return this.allSessionCounts()
      .filter(r => allowedShelfIds.has(r.shelfId))
      .sort((a, b) => {
        const shCmp = (a.shelfCode || '').localeCompare(b.shelfCode || '', undefined, { numeric: true });
        if (shCmp !== 0) return shCmp;
        const secCmp = (a.section || 'ZZ').localeCompare(b.section || 'ZZ');
        if (secCmp !== 0) return secCmp;
        return (a.capturedCode || '').localeCompare(b.capturedCode || '');
      });
  });

  familyTotalPieces = computed(() => {
    return this.familyCounts().reduce((sum, r) => sum + (r.quantity || 0), 0);
  });

  familyUniqueCodeCount = computed(() => {
    const set = new Set<string>();
    for (const r of this.familyCounts()) {
      if (r.capturedCode) set.add(r.capturedCode.trim().toUpperCase());
    }
    return set.size;
  });

  filteredFamilyCounts = computed(() => {
    let list = this.familyCounts();
    const shFilter = this.familyShelfFilter();
    if (shFilter !== 'TODOS') {
      list = list.filter(r => r.shelfCode === shFilter);
    }

    const lvlFilter = this.familyLevelFilter();
    if (lvlFilter === 'SIN_NIVEL') {
      list = list.filter(r => !r.section || !r.section.trim());
    } else if (lvlFilter !== 'TODOS') {
      list = list.filter(r => r.section && r.section.toUpperCase() === lvlFilter);
    }

    const q = this.familySearchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        (r.capturedCode || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.shelfCode || '').toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q)
      );
    }
    return list;
  });

  visibleFamilyCounts = computed(() => {
    return this.filteredFamilyCounts().slice(0, this.familyDisplayLimit());
  });

  consolidatedFamilyCounts = computed(() => {
    let list = this.familyCounts();
    const shFilter = this.familyShelfFilter();
    if (shFilter !== 'TODOS') {
      list = list.filter(r => r.shelfCode === shFilter);
    }
    const q = this.familySearchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter(r =>
        (r.capturedCode || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.shelfCode || '').toLowerCase().includes(q)
      );
    }

    const map = new Map<string, {
      code: string;
      description: string;
      totalQty: number;
      locations: Array<{ shelfId: number; shelfCode: string; section: string; qty: number }>;
    }>();

    for (const r of list) {
      const key = (r.capturedCode || '').trim().toUpperCase();
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          code: key,
          description: r.description || '',
          totalQty: 0,
          locations: []
        });
      }
      const entry = map.get(key)!;
      entry.totalQty += (r.quantity || 0);
      if (!entry.description && r.description) entry.description = r.description;
      entry.locations.push({
        shelfId: r.shelfId,
        shelfCode: r.shelfCode,
        section: r.section || '',
        qty: r.quantity || 0
      });
    }

    return Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));
  });

  visibleConsolidatedCounts = computed(() => {
    return this.consolidatedFamilyCounts().slice(0, this.familyDisplayLimit());
  });

  // Shelf Editing Modal State
  editingShelf: { id: number; code: string; zone: string; description: string; plant: string } | null = null;
  savingShelf = signal(false);

  // Single Shelf Reset Modal State
  shelfToClearCounts: ShelfAssignmentDto | null = null;
  clearingShelfCounts = signal(false);

  // Wheel zoom throttler
  lastWheelTime = 0;
  wheelAccumulator = 0;

  plantShelves = computed(() => {
    const p = this.selectedPlant();
    return this.allShelves().filter(s => {
      if (s.shelfCode === 'PA-DOC-01' || s.shelfCode?.startsWith('PA-DOC')) return false;
      const plant = (s.plant || '').trim();
      if (p === 'Planta Baja') return plant === 'Planta Baja';
      return plant === 'Planta Alta';
    });
  });

  filteredShelves = computed(() => {
    const list = this.plantShelves();
    return list;
  });

  // User Color Rules:
  // Verde: Contabilizado (piezas contadas > 0 o status COMPLETADO)
  // Rojo: Pendiente (status EN_CONTEO o PENDIENTE con asignación o partidas)
  // Sin color: Todavía no tocado (0 piezas, sin conteo)
  completedCount = computed(() => {
    return this.plantShelves().filter(s => this.isCompleted(s)).length;
  });

  pendingCount = computed(() => {
    return this.plantShelves().filter(s => this.isPending(s)).length;
  });

  untouchedCount = computed(() => {
    return this.plantShelves().filter(s => this.isUntouched(s)).length;
  });

  progressPercent = computed(() => {
    const list = this.plantShelves();
    if (list.length === 0) return 0;
    return Math.round((this.completedCount() / list.length) * 100);
  });

  totalPlantPieces = computed(() => {
    return this.plantShelves().reduce((sum, s) => sum + (s.totalPieces || 0), 0);
  });

  getSectionType(s: ShelfAssignmentDto): string {
    if (!s || !s.shelfCode) return 'default';
    const code = s.shelfCode.toUpperCase();
    const zone = (s.shelfZone || '').toUpperCase();

    // Planta Baja
    if (code.includes('ACE') || zone.includes('ACERO')) return 'acero';
    if (code.includes('KUR') || zone.includes('KURIYAMA')) return 'kuriyama';
    if (code.includes('YPC') || zone.includes('YPC')) return 'ypc';
    if (code.includes('DIX') || zone.includes('DIXON')) return 'dixon';
    if (code.includes('CHID') || code.includes('HID') || zone.includes('HIDR')) return 'chid';
    if (code.includes('CYB') || code.includes('UNI') || zone.includes('CYBER') || zone.includes('UNIVERSAL')) return 'cyber';
    if (code.includes('INOX') || zone.includes('INOX')) return 'inox';

    // Planta Alta: Sellos TODOS con el mismo color unificado (P4, P5, Muro Este)
    if (code.includes('SEL') || code.includes('PA-P4') || code.includes('PA-P5') || zone.includes('SELLOS')) return 'sellos';

    // Planta Alta: Pasillos
    if (code.includes('PA-P1') || zone.includes('P1') || zone.includes('HCO')) return 'p1';
    if (code.includes('PA-P2') || zone.includes('P2') || zone.includes('NEUM')) return 'p2';
    if (code.includes('PA-P3') || zone.includes('P3') || zone.includes('FESTO') || zone.includes('SMC')) return 'p3';

    // Planta Alta: Lateral Oeste específico
    if (code.includes('FNH') || zone.includes('FNH')) return 'fnh';
    if (code.includes('HTM') || zone.includes('HTM') || zone.includes('HIM')) return 'htm';
    if (code.includes('ABR') || zone.includes('ABRAZADERA')) return 'abr';
    if (code.includes('ENP') || zone.includes('ENPA') || zone.includes('EMPAQUE')) return 'enp';

    // Planta Alta: Reservas y PVC
    if (code.includes('PVC') || zone.includes('PVC')) return 'pvc';
    if (code.includes('RES') || zone.includes('RESERVA')) return 'res';

    return 'default';
  }

  toggleSectionFilter(secId: string) {
    if (this.selectedSectionFilter() === secId) {
      this.selectedSectionFilter.set(null);
    } else {
      this.selectedSectionFilter.set(secId);
    }
  }

  isDimmedBySection(s: ShelfAssignmentDto): boolean {
    const qf = this.statusQuickFilter();
    if (qf === 'COMPLETED' && !this.isCompleted(s)) return true;
    if (qf === 'PENDING' && this.isCompleted(s)) return true;

    const filter = this.selectedSectionFilter();
    if (!filter) return false;
    return this.getSectionType(s) !== filter;
  }

  isHighlightedBySection(s: ShelfAssignmentDto): boolean {
    const qf = this.statusQuickFilter();
    if (qf === 'COMPLETED' && this.isCompleted(s)) return true;
    if (qf === 'PENDING' && !this.isCompleted(s)) return true;

    const filter = this.selectedSectionFilter();
    if (!filter) return false;
    return this.getSectionType(s) === filter;
  }

  sectionsProgress = computed<SectionStat[]>(() => {
    const isPB = this.selectedPlant() === 'Planta Baja';
    const shelves = this.plantShelves();

    const defs = isPB
      ? [
          { id: 'acero', name: 'Acero (1-19)', codePrefix: 'PB-ACE', color: '#1d4ed8', lightBg: '#eff6ff', borderColor: '#2563eb' },
          { id: 'kuriyama', name: 'Kuriyama (A | B)', codePrefix: 'PB-KUR', color: '#ea580c', lightBg: '#fff7ed', borderColor: '#f97316' },
          { id: 'ypc', name: 'YPC (Pasillo & B|C)', codePrefix: 'PB-YPC', color: '#7c3aed', lightBg: '#f5f3ff', borderColor: '#8b5cf6' },
          { id: 'dixon', name: 'Dixon (1-2)', codePrefix: 'PB-DIX', color: '#db2777', lightBg: '#fdf2f8', borderColor: '#ec4899' },
          { id: 'chid', name: 'Conex. Hidráulicas', codePrefix: 'PB-CHID', color: '#0891b2', lightBg: '#ecfeff', borderColor: '#06b6d4' },
          { id: 'cyber', name: 'Cybermatics / Univ.', codePrefix: 'PB-CYB', color: '#e11d48', lightBg: '#fff1f2', borderColor: '#f43f5e' },
          { id: 'inox', name: 'Parker Inox', codePrefix: 'PB-INOX', color: '#475569', lightBg: '#f1f5f9', borderColor: '#64748b' },
          { id: 'default', name: 'Pendientes / Sin Asignar', codePrefix: 'PB-GEN', color: '#94a3b8', lightBg: '#ffffff', borderColor: '#cbd5e1' }
        ]
      : [
          { id: 'sellos', name: 'Sellos (P4, P5, Muro)', codePrefix: 'PA-SEL', color: '#9333ea', lightBg: '#faf5ff', borderColor: '#c084fc' },
          { id: 'p1', name: 'P1: HCO / Hidr.', codePrefix: 'PA-P1', color: '#1d4ed8', lightBg: '#eff6ff', borderColor: '#2563eb' },
          { id: 'p2', name: 'P2: Neumática', codePrefix: 'PA-P2', color: '#ea580c', lightBg: '#fff7ed', borderColor: '#f97316' },
          { id: 'p3', name: 'P3: Festo / SMC', codePrefix: 'PA-P3', color: '#d97706', lightBg: '#fffbeb', borderColor: '#f59e0b' },
          { id: 'fnh', name: 'FNH', codePrefix: 'PA-FNH', color: '#0891b2', lightBg: '#ecfeff', borderColor: '#06b6d4' },
          { id: 'htm', name: 'HTM', codePrefix: 'PA-HTM', color: '#db2777', lightBg: '#fdf2f8', borderColor: '#ec4899' },
          { id: 'abr', name: 'Abrazaderas', codePrefix: 'PA-ABR', color: '#b45309', lightBg: '#fef3c7', borderColor: '#d97706' },
          { id: 'enp', name: 'ENPA (Empaques)', codePrefix: 'PA-ENP', color: '#6366f1', lightBg: '#eef2ff', borderColor: '#818cf8' },
          { id: 'res', name: 'Reserva Acero', codePrefix: 'PA-RES', color: '#1e3a8a', lightBg: '#eff6ff', borderColor: '#2563eb' },
          { id: 'pvc', name: 'PVC', codePrefix: 'PA-PVC', color: '#0e7490', lightBg: '#ecfeff', borderColor: '#0891b2' },
          { id: 'default', name: 'Pendientes PA', codePrefix: 'PA-GEN', color: '#94a3b8', lightBg: '#ffffff', borderColor: '#cbd5e1' }
        ];

    return defs.map(d => {
      const matching = shelves.filter(s => this.getSectionType(s) === d.id);
      const totalShelves = matching.length;
      const completedShelves = matching.filter(s => this.isCompleted(s)).length;
      const pendingShelves = matching.filter(s => this.isPending(s)).length;
      const untouchedShelves = matching.filter(s => this.isUntouched(s)).length;
      const totalPieces = matching.reduce((acc, s) => acc + (s.totalPieces || 0), 0);
      const percentage = totalShelves > 0 ? Math.round((completedShelves / totalShelves) * 100) : 0;

      return {
        id: d.id,
        name: d.name,
        codePrefix: d.codePrefix,
        color: d.color,
        lightBg: d.lightBg,
        borderColor: d.borderColor,
        totalShelves,
        completedShelves,
        pendingShelves,
        untouchedShelves,
        totalPieces,
        percentage
      };
    }).filter(sec => sec.totalShelves > 0);
  });

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private router: Router
  ) {}

  ngOnInit() {
    // Restore persistent user UI state from localStorage
    try {
      const savedPlant = localStorage.getItem('interflu_croquis_plant');
      if (savedPlant === 'Planta Baja' || savedPlant === 'Planta Alta') {
        this.selectedPlant.set(savedPlant);
      }
      const savedOpacity = localStorage.getItem('interflu_croquis_opacity');
      if (savedOpacity !== null) {
        this.blueprintOpacity.set(Number(savedOpacity));
      }
      const savedZoom = localStorage.getItem('interflu_croquis_zoom');
      if (savedZoom !== null) {
        const parsed = Number(savedZoom);
        this.zoomLevel.set(parsed > 90 ? 68 : Math.max(50, parsed));
      } else {
        this.zoomLevel.set(68);
      }
      if (typeof window !== 'undefined' && window.innerWidth < 850) {
        this.showSidebar.set(false);
        const targetPercent = Math.floor(((window.innerWidth - 32) / 1440) * 100);
        this.zoomLevel.set(Math.max(22, Math.min(68, targetPercent)));
      }
    } catch (e) {}

    this.api.getSessions().subscribe({
      next: (sessions) => {
        this.sessions.set(sessions);
        if (sessions.length > 0) {
          let targetId = sessions[0].id;
          try {
            const savedSessionId = localStorage.getItem('interflu_croquis_sessionId');
            if (savedSessionId) {
              const matched = sessions.find(s => s.id === Number(savedSessionId));
              if (matched) targetId = matched.id;
            }
          } catch (e) {}
          this.activeSessionId.set(targetId);
          this.loadShelves(targetId);
        } else {
          this.loadRawShelvesPreview();
        }
      },
      error: (err: any) => this.toast.error('Error al cargar inventario: ' + (err.error?.message || err.message))
    });
  }

  loadRawShelvesPreview() {
    this.api.getShelves().subscribe({
      next: (shelves) => {
        const valid = shelves.filter(s => s.code !== 'PA-DOC-01' && !s.code?.startsWith('PA-DOC'));
        const mapped: ShelfAssignmentDto[] = valid.map(s => ({
          assignmentId: 0,
          shelfId: s.id,
          shelfCode: s.code,
          shelfZone: s.zone,
          shelfDescription: s.description,
          plant: s.plant,
          posX: s.posX,
          posY: s.posY,
          width: s.width,
          height: s.height,
          status: 'PENDIENTE',
          assignedUserName: 'Sin Asignar',
          recordCount: 0,
          totalPieces: 0
        }));
        this.allShelves.set(mapped);
      },
      error: (err: any) => this.toast.error('Error al cargar catálogo de anaqueles: ' + (err.error?.message || err.message))
    });
  }

  restoringSession = signal(false);

  restoreDefaultSession() {
    this.restoringSession.set(true);
    const req = {
      title: 'Inventario Físico General Planta Baja y Planta Alta',
      warehouseCode: '1',
      warehouseName: 'Almacén Principal Interflu',
      notes: 'Control físico digital por anaqueles según croquis oficial de planta.'
    };
    this.api.createSession(req).subscribe({
      next: (created) => {
        this.toast.success(`Inventario ${created.folio} creado con éxito. 170 anaqueles restaurados.`);
        this.sessions.set([created]);
        this.activeSessionId.set(created.id);
        try {
          localStorage.setItem('interflu_croquis_sessionId', String(created.id));
          localStorage.setItem('interflu_active_session', String(created.id));
        } catch (e) {}
        this.loadShelves(created.id);
        this.restoringSession.set(false);
      },
      error: (err) => {
        this.restoringSession.set(false);
        this.toast.error(err.error?.message || 'Error al restaurar inventario');
      }
    });
  }

  setPlant(plant: 'Planta Baja' | 'Planta Alta') {
    this.selectedPlant.set(plant);
    try { localStorage.setItem('interflu_croquis_plant', plant); } catch (e) {}
    this.selectedRackForMove = null;
  }

  setOpacity(val: number) {
    this.blueprintOpacity.set(val);
    try { localStorage.setItem('interflu_croquis_opacity', String(val)); } catch (e) {}
  }

  loadShelves(sessionId: number) {
    this.api.getSessionShelves(sessionId).subscribe({
      next: (data) => this.allShelves.set(data.filter(s => s.shelfCode !== 'PA-DOC-01' && !s.shelfCode?.startsWith('PA-DOC'))),
      error: (err: any) => this.toast.error('Error al cargar anaqueles: ' + (err.error?.message || err.message))
    });
  }

  // User Exact Color Determination
  isCompleted(s: ShelfAssignmentDto): boolean {
    if (s.status === 'COMPLETADO') return true;
    if (s.status === 'PENDIENTE' || s.status === 'EN_CONTEO') return false;
    return (s.totalPieces || 0) > 0;
  }

  isPending(s: ShelfAssignmentDto): boolean {
    if (s.status === 'EN_CONTEO') return true;
    if (s.status === 'PENDIENTE' || s.status === 'COMPLETADO') return false;
    return (s.recordCount || 0) > 0;
  }

  isUntouched(s: ShelfAssignmentDto): boolean {
    if (s.status === 'PENDIENTE') return true;
    return !this.isCompleted(s) && !this.isPending(s);
  }

  rackColorClass(s: ShelfAssignmentDto): string {
    if (this.isCompleted(s)) return 'color-completed';
    const secType = this.getSectionType(s);
    if (this.isPending(s)) return `rack-sec-${secType} color-pending`;
    return `rack-sec-${secType} color-untouched`;
  }

  dotColorClass(s: ShelfAssignmentDto): string {
    if (this.isCompleted(s)) return 'dot-green';
    return 'dot-gray';
  }

  statusLabel(s: ShelfAssignmentDto): string {
    if (this.isCompleted(s)) return 'Contabilizado';
    return 'Pendiente';
  }

  badgeForStatus(s: ShelfAssignmentDto): string {
    if (this.isCompleted(s)) return 'badge-success';
    return 'badge-secondary';
  }

  getNarrowCode(s: ShelfAssignmentDto): string {
    if (!s || !s.shelfCode) return '';
    const code = s.shelfCode;
    // Acero pasillo: show clean number matching blueprint (1..19)
    if (code.startsWith('PB-ACE-')) {
      const num = parseInt(code.replace('PB-ACE-', ''), 10);
      return isNaN(num) ? code.replace('PB-ACE-', '') : String(num);
    }
    // Dixon in vertical column: D1, D2
    if (code.startsWith('PB-DIX-')) {
      const num = parseInt(code.replace('PB-DIX-', ''), 10);
      return 'D' + (isNaN(num) ? '' : num);
    }
    // Conexiones Hidráulicas in vertical column: A1..A5, B1..B5
    if (code.startsWith('PB-CHID-A') || code.startsWith('PB-CHID-B')) {
      const side = code.includes('-A') ? 'A' : 'B';
      const num = parseInt(code.replace(/PB-CHID-[AB]/, ''), 10);
      return side + (isNaN(num) ? '' : num);
    }
    // Kuriyama aisles: A1..A7, B1..B7
    if (code.startsWith('PB-KUR-A') || code.startsWith('PB-KUR-B')) {
      const side = code.includes('-A') ? 'A' : 'B';
      const num = parseInt(code.replace(/PB-KUR-[AB]/, ''), 10);
      return side + (isNaN(num) ? '' : num);
    }
    // Prefix for PVC vs Reserva Acero vertical column
    if (code.startsWith('PA-RES-A')) {
      return 'R' + code.replace('PA-RES-A', '');
    }
    if (code.startsWith('PA-PVC-')) {
      return 'P' + code.replace('PA-PVC-', '');
    }
    const parts = code.split('-');
    if (parts.length >= 3) {
      return parts.slice(2).join('-');
    }
    return parts[parts.length - 1];
  }

  isEastWallRack(s: ShelfAssignmentDto): boolean {
    if (!s || !s.shelfCode) return false;
    return s.shelfCode.startsWith('PB-CHID-W') || s.shelfCode.startsWith('PA-SEL-W-');
  }

  getDisplayCode(s: ShelfAssignmentDto): string {
    if (!s || !s.shelfCode) return '';
    const code = s.shelfCode;
    // Format east wall Conexiones Hidráulicas cleanly as CHID-W1..W5
    if (code.startsWith('PB-CHID-W')) {
      const num = parseInt(code.replace('PB-CHID-W', ''), 10);
      return 'CHID-W' + (isNaN(num) ? code.replace('PB-CHID-W', '') : num);
    }
    // Format east wall Sellos as SEL-W1..W6
    if (code.startsWith('PA-SEL-W-')) {
      const num = parseInt(code.replace('PA-SEL-W-', ''), 10);
      return 'SEL-W' + (isNaN(num) ? code.replace('PA-SEL-W-', '') : num);
    }
    return code;
  }

  getDisplayZone(s: ShelfAssignmentDto): string {
    if (!s || !s.shelfZone) return '';
    if (s.shelfCode.startsWith('PB-CHID-W')) {
      return 'Conex. Hidr.';
    }
    if (s.shelfZone === 'Conexiones Hidráulicas' && (s.width || 54) <= 60) {
      return 'C. Hidr.';
    }
    return s.shelfZone;
  }

  getRackTooltip(s: ShelfAssignmentDto): string {
    const pieces = s.totalPieces || 0;
    const status = this.statusLabel(s);
    return `${s.shelfCode} • ${s.shelfZone} (${pieces} pzas) • ${status}`;
  }

  isMatched(s: ShelfAssignmentDto): boolean {
    if (!this.searchQuery) return false;
    const q = this.searchQuery.toLowerCase().trim();
    return s.shelfCode.toLowerCase().includes(q) ||
           (s.shelfZone || '').toLowerCase().includes(q) ||
           (s.shelfDescription || '').toLowerCase().includes(q);
  }

  // Zoom Controls (Estabilizado y con Control de Inercia)
  zoomIn() {
    this.adjustZoom(5);
  }

  zoomOut() {
    this.adjustZoom(-5);
  }

  resetZoom() {
    this.setZoomPreset(100);
  }

  setZoomPreset(level: number) {
    const clamped = Math.max(45, Math.min(180, level));
    this.zoomLevel.set(clamped);
    try { localStorage.setItem('interflu_croquis_zoom', String(clamped)); } catch (e) {}
  }

  adjustZoom(delta: number) {
    this.zoomLevel.update(z => {
      const next = Math.max(45, Math.min(180, Math.round((z + delta) / 5) * 5));
      try { localStorage.setItem('interflu_croquis_zoom', String(next)); } catch (e) {}
      return next;
    });
  }

  fitToScreen() {
    if (!this.viewportRef || !this.viewportRef.nativeElement) return;
    const clientW = this.viewportRef.nativeElement.clientWidth - 28;
    if (clientW > 0) {
      const targetPercent = Math.floor((clientW / 1440) * 100);
      const clamped = Math.max(22, Math.min(130, targetPercent));
      this.zoomLevel.set(clamped);
      try { localStorage.setItem('interflu_croquis_zoom', String(clamped)); } catch (e) {}
      this.toast.info(`Ajustado automáticamente al ancho de la pantalla (${clamped}%)`);
    }
  }

  // Smooth Viewport Panning (Arrastrar para mover vista cuando hay zoom sin sobrecargar Zone.js)
  onViewportMouseDown(event: MouseEvent) {
    if (this.editMode()) return;
    const target = event.target as HTMLElement;
    if (target && (target.closest('.rack-element') || target.closest('button') || target.closest('input') || target.closest('.modal-backdrop'))) return;

    this.isPanning = true;
    this.panStartX = event.clientX;
    this.panStartY = event.clientY;
    if (this.viewportRef) {
      this.scrollStartX = this.viewportRef.nativeElement.scrollLeft;
      this.scrollStartY = this.viewportRef.nativeElement.scrollTop;
    }

    const onMove = (e: MouseEvent) => {
      if (!this.isPanning || !this.viewportRef) return;
      const dx = e.clientX - this.panStartX;
      const dy = e.clientY - this.panStartY;
      this.viewportRef.nativeElement.scrollLeft = this.scrollStartX - dx;
      this.viewportRef.nativeElement.scrollTop = this.scrollStartY - dy;
    };

    const onUp = () => {
      this.isPanning = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseup', onUp);
  }

  onViewportTouchStart(event: TouchEvent) {
    if (this.editMode()) return;
    if (event.touches && event.touches.length === 1) {
      const touch = event.touches[0];
      const target = event.target as HTMLElement;
      if (target && (target.closest('.rack-element') || target.closest('button') || target.closest('input') || target.closest('.modal-backdrop'))) return;
      this.isPanning = true;
      this.panStartX = touch.clientX;
      this.panStartY = touch.clientY;
      if (this.viewportRef) {
        this.scrollStartX = this.viewportRef.nativeElement.scrollLeft;
        this.scrollStartY = this.viewportRef.nativeElement.scrollTop;
      }

      const onTouchMove = (e: TouchEvent) => {
        if (!this.isPanning || !this.viewportRef || !e.touches || e.touches.length !== 1) return;
        const curTouch = e.touches[0];
        const dx = curTouch.clientX - this.panStartX;
        const dy = curTouch.clientY - this.panStartY;
        this.viewportRef.nativeElement.scrollLeft = this.scrollStartX - dx;
        this.viewportRef.nativeElement.scrollTop = this.scrollStartY - dy;
      };

      const onTouchEnd = () => {
        this.isPanning = false;
        window.removeEventListener('touchmove', onTouchMove);
        window.removeEventListener('touchend', onTouchEnd);
      };

      window.addEventListener('touchmove', onTouchMove, { passive: true });
      window.addEventListener('touchend', onTouchEnd);
    }
  }

  onWheel(event: WheelEvent) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const now = performance.now();
      this.wheelAccumulator += event.deltaY;
      // Throttle rapid wheel pulses (e.g. trackpads and smooth mice)
      if (now - this.lastWheelTime > 60 || Math.abs(this.wheelAccumulator) >= 30) {
        if (this.wheelAccumulator < 0) {
          this.adjustZoom(5);
        } else {
          this.adjustZoom(-5);
        }
        this.wheelAccumulator = 0;
        this.lastWheelTime = now;
      }
    }
  }

  // Shelf Editing, Single Shelf Count Clear & Shelf QR Download
  openEditShelf(shelf: ShelfAssignmentDto) {
    this.editingShelf = {
      id: shelf.shelfId,
      code: shelf.shelfCode,
      zone: shelf.shelfZone || '',
      description: shelf.shelfDescription || '',
      plant: shelf.plant || this.selectedPlant()
    };
  }

  saveShelfEdit() {
    if (!this.editingShelf) return;
    const target = this.editingShelf;
    if (!target.code.trim()) {
      this.toast.warning('El código de anaquel no puede estar vacío');
      return;
    }
    this.savingShelf.set(true);
    this.api.updateShelf(target.id, {
      code: target.code.trim().toUpperCase(),
      zone: target.zone.trim(),
      description: target.description.trim(),
      plant: target.plant
    }).subscribe({
      next: (updated) => {
        this.savingShelf.set(false);
        this.toast.success(`Anaquel ${updated.code} actualizado`);
        this.allShelves.update(list => list.map(s => {
          if (s.shelfId === target.id) {
            return {
              ...s,
              shelfCode: updated.code,
              shelfZone: updated.zone,
              shelfDescription: updated.description,
              plant: updated.plant
            };
          }
          return s;
        }));
        if (this.inspectedShelf && this.inspectedShelf.shelfId === target.id) {
          this.inspectedShelf.shelfCode = updated.code;
          this.inspectedShelf.shelfZone = updated.zone;
          this.inspectedShelf.shelfDescription = updated.description;
          this.inspectedShelf.plant = updated.plant;
        }
        this.editingShelf = null;
      },
      error: (err) => {
        this.savingShelf.set(false);
        this.toast.error(err.error?.message || 'Error al actualizar anaquel');
      }
    });
  }

  // Quick Inline Shelf Rename Methods
  startInlineShelfRename() {
    if (!this.inspectedShelf) return;
    this.inlineRenamingShelf = true;
    this.renameShelfCode = this.inspectedShelf.shelfCode;
    this.renameShelfDesc = this.inspectedShelf.shelfDescription || '';
    this.renameShelfZone = this.inspectedShelf.shelfZone || '';
  }

  cancelInlineShelfRename() {
    this.inlineRenamingShelf = false;
  }

  saveInlineShelfRename() {
    if (!this.inspectedShelf) return;
    const target = this.inspectedShelf;
    const code = this.renameShelfCode.trim().toUpperCase();
    if (!code) {
      this.toast.warning('El código de anaquel no puede estar vacío');
      return;
    }
    this.savingInlineRename.set(true);
    this.api.updateShelf(target.shelfId, {
      code: code,
      description: this.renameShelfDesc.trim(),
      zone: this.renameShelfZone.trim(),
      plant: target.plant || this.selectedPlant()
    }).subscribe({
      next: (updated) => {
        this.savingInlineRename.set(false);
        this.inlineRenamingShelf = false;
        this.toast.success(`Anaquel ${updated.code} renombrado exitosamente.`);
        target.shelfCode = updated.code;
        target.shelfDescription = updated.description;
        target.shelfZone = updated.zone;
        this.allShelves.update(list => list.map(s => {
          if (s.shelfId === target.shelfId) {
            return {
              ...s,
              shelfCode: updated.code,
              shelfDescription: updated.description,
              shelfZone: updated.zone
            };
          }
          return s;
        }));
      },
      error: (err) => {
        this.savingInlineRename.set(false);
        this.toast.error(err.error?.message || 'Error al renombrar anaquel');
      }
    });
  }

  openEditShelfByCode(shelfCode: string) {
    const target = this.allShelves().find(s => s.shelfCode.toUpperCase() === shelfCode.toUpperCase());
    if (target) {
      this.openEditShelf(target);
    }
  }

  // Shelf Creation Methods
  openCreateShelfModal() {
    this.newShelfCode = '';
    this.newShelfDesc = '';
    this.newShelfZone = this.selectedSectionFilter() || 'YPC';
    this.newShelfPlant = this.selectedPlant();
    this.newShelfPosX = 948;
    this.newShelfPosY = 104;
    this.newShelfWidth = 76;
    this.newShelfHeight = 34;
    this.showCreateShelfModal.set(true);
  }

  applyShelfDimPreset(w: number, h: number) {
    this.newShelfWidth = w;
    this.newShelfHeight = h;
  }

  submitCreateShelf() {
    if (!this.newShelfCode.trim()) {
      this.toast.warning('Ingresa el código del nuevo anaquel (ej. PB-YPC-22)');
      return;
    }
    if (!this.newShelfZone.trim()) {
      this.toast.warning('Ingresa la zona del anaquel');
      return;
    }
    this.creatingShelf.set(true);
    this.api.createShelf({
      code: this.newShelfCode.trim().toUpperCase(),
      description: this.newShelfDesc.trim(),
      zone: this.newShelfZone.trim(),
      plant: this.newShelfPlant,
      posX: Number(this.newShelfPosX) || 0,
      posY: Number(this.newShelfPosY) || 0,
      width: Number(this.newShelfWidth) || 76,
      height: Number(this.newShelfHeight) || 34
    }).subscribe({
      next: (created) => {
        this.creatingShelf.set(false);
        this.showCreateShelfModal.set(false);
        this.toast.success(`Anaquel ${created.code} creado exitosamente e integrado al croquis.`);
        if (this.activeSessionId() > 0) {
          this.loadShelves(this.activeSessionId());
        } else {
          this.loadRawShelvesPreview();
        }
      },
      error: (err) => {
        this.creatingShelf.set(false);
        this.toast.error('Error al crear anaquel: ' + (err.error?.message || err.message));
      }
    });
  }

  // Shelf Deletion Methods
  confirmDeleteShelf(shelf: ShelfAssignmentDto | null) {
    if (!shelf) return;
    this.shelfToDelete = shelf;
  }

  executeDeleteShelf() {
    if (!this.shelfToDelete) return;
    const target = this.shelfToDelete;
    this.deletingShelf.set(true);
    this.api.deleteShelf(target.shelfId).subscribe({
      next: (resp: any) => {
        this.deletingShelf.set(false);
        this.toast.success(resp?.message || `Anaquel ${target.shelfCode} eliminado correctamente.`);
        this.shelfToDelete = null;
        if (this.inspectedShelf?.shelfId === target.shelfId) {
          this.inspectedShelf = null;
        }
        if (this.activeSessionId() > 0) {
          this.loadShelves(this.activeSessionId());
        } else {
          this.loadRawShelvesPreview();
        }
      },
      error: (err) => {
        this.deletingShelf.set(false);
        this.toast.error('No se pudo eliminar el anaquel: ' + (err.error?.message || err.message));
      }
    });
  }

  // Bulk Shelf Editor & Series Renumber Methods
  openBulkShelfEditor() {
    const currentZone = this.selectedSectionFilter() || 'YPC';
    this.bulkEditorZone.set(currentZone);
    this.bulkEditorPlant.set(this.selectedPlant());
    this.seriesPrefix = this.selectedPlant() === 'Planta Baja' ? `PB-${currentZone}-` : `PA-${currentZone}-`;
    this.seriesStartNumber = 10;
    this.seriesDigits = 2;
    this.refreshBulkEditorShelves();
    this.showBulkShelfEditorModal.set(true);
  }

  onBulkEditorZoneChange(zone: string) {
    this.bulkEditorZone.set(zone);
    this.seriesPrefix = this.bulkEditorPlant() === 'Planta Baja' ? `PB-${zone}-` : `PA-${zone}-`;
    this.refreshBulkEditorShelves();
  }

  onBulkEditorPlantChange(plant: string) {
    this.bulkEditorPlant.set(plant);
    this.seriesPrefix = plant === 'Planta Baja' ? `PB-${this.bulkEditorZone()}-` : `PA-${this.bulkEditorZone()}-`;
    this.refreshBulkEditorShelves();
  }

  refreshBulkEditorShelves() {
    const zone = this.bulkEditorZone().trim().toLowerCase();
    const plant = this.bulkEditorPlant();
    const list = this.allShelves()
      .filter(s => {
        const matchesPlant = !plant || (s.plant || 'Planta Baja') === plant;
        const matchesZone = !zone || (s.shelfZone || '').trim().toLowerCase() === zone;
        return matchesPlant && matchesZone;
      })
      .sort((a, b) => {
        return a.shelfCode.localeCompare(b.shelfCode, undefined, { numeric: true });
      });

    this.bulkEditorShelves = list.map(s => ({
      id: s.shelfId,
      code: s.shelfCode,
      originalCode: s.shelfCode,
      description: s.shelfDescription || '',
      posX: s.posX,
      posY: s.posY,
      width: s.width,
      height: s.height,
      zone: s.shelfZone || this.bulkEditorZone(),
      plant: s.plant || this.bulkEditorPlant()
    }));
  }

  formatSeriesNum(num: number): string {
    if (this.seriesDigits === 2 && num < 10) {
      return `0${num}`;
    }
    return String(num);
  }

  applySeriesRenumberToTable() {
    if (!this.bulkEditorShelves || this.bulkEditorShelves.length === 0) {
      this.toast.warning('No hay anaqueles en la tabla para renumerar.');
      return;
    }
    let currentNum = Number(this.seriesStartNumber) || 1;
    for (let i = 0; i < this.bulkEditorShelves.length; i++) {
      const sh = this.bulkEditorShelves[i];
      sh.code = `${this.seriesPrefix}${this.formatSeriesNum(currentNum)}`;
      currentNum++;
    }
    this.toast.info(`Serie aplicada a ${this.bulkEditorShelves.length} anaqueles en la vista previa. Revisa los códigos y presiona Guardar.`);
  }

  submitBulkShelvesSave() {
    if (!this.bulkEditorShelves || this.bulkEditorShelves.length === 0) {
      this.toast.warning('No hay datos para guardar.');
      return;
    }
    for (const sh of this.bulkEditorShelves) {
      if (!sh.code || !sh.code.trim()) {
        this.toast.error('Todos los anaqueles deben tener un código válido.');
        return;
      }
    }
    this.savingBulkShelves.set(true);
    const payload = this.bulkEditorShelves.map(sh => ({
      id: sh.id,
      code: sh.code.trim().toUpperCase(),
      description: (sh.description || '').trim(),
      zone: sh.zone,
      plant: sh.plant,
      posX: Number(sh.posX) || 0,
      posY: Number(sh.posY) || 0,
      width: Number(sh.width) || 76,
      height: Number(sh.height) || 34
    }));

    this.api.batchUpdateShelves(payload).subscribe({
      next: (resp: any) => {
        this.savingBulkShelves.set(false);
        this.showBulkShelfEditorModal.set(false);
        this.toast.success(resp?.message || `${payload.length} anaqueles actualizados correctamente.`);
        if (this.activeSessionId() > 0) {
          this.loadShelves(this.activeSessionId());
        } else {
          this.loadRawShelvesPreview();
        }
      },
      error: (err) => {
        this.savingBulkShelves.set(false);
        this.toast.error('Error al actualizar anaqueles masivamente: ' + (err.error?.message || err.message));
      }
    });
  }

  // Croquis Smart Import Methods (Levantamiento Semanal SAE / Excel)
  openCroquisImportModal(shelfId?: number, familyId: string = '') {
    if (this.sessions().length === 0 || this.activeSessionId() === 0) {
      this.toast.warning('No hay inventario activo. Selecciona o inicia una sesión primero.');
      return;
    }
    this.importTargetShelfId.set(shelfId || 0);
    this.importTargetFamily.set(familyId || '');
    this.importMode.set('SMART_MERGE');
    this.selectedExcelFile = null;
    this.importResult = null;
    this.showImportExcelModal = true;
  }

  closeCroquisImportModal() {
    this.showImportExcelModal = false;
    this.selectedExcelFile = null;
    this.importResult = null;
    this.isDraggingFile.set(false);
  }

  resetForAnotherImport() {
    this.selectedExcelFile = null;
    this.importResult = null;
    this.isDraggingFile.set(false);
  }

  downloadExcelTemplate() {
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
        this.toast.success('Plantilla oficial descargada.');
      },
      error: (err) => {
        this.downloadingTemplate.set(false);
        this.toast.error('Error al descargar plantilla: ' + (err.error?.message || err.message));
      }
    });
  }

  onFileSelectedForImport(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedExcelFile = input.files[0];
    }
  }

  onDragOverImport(event: DragEvent) {
    event.preventDefault();
    this.isDraggingFile.set(true);
  }

  onDragLeaveImport(event: DragEvent) {
    event.preventDefault();
    this.isDraggingFile.set(false);
  }

  onDropImport(event: DragEvent) {
    event.preventDefault();
    this.isDraggingFile.set(false);
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.selectedExcelFile = event.dataTransfer.files[0];
    }
  }

  submitCroquisImport() {
    if (!this.selectedExcelFile) {
      this.toast.error('Selecciona un archivo Excel (.xlsx o .csv).');
      return;
    }
    const sessionId = this.activeSessionId();
    if (!sessionId || sessionId === 0) {
      this.toast.error('No hay sesión de inventario activa.');
      return;
    }
    const shelfParam = this.importTargetShelfId() > 0 ? this.importTargetShelfId() : undefined;
    const mode = this.importMode();
    const famParam = this.importTargetFamily() || this.activeFamilyExplorer()?.id || undefined;
    this.importingExcel.set(true);
    this.api.importExcelCounts(sessionId, this.selectedExcelFile, shelfParam, mode, this.filterObsoleteImport(), famParam).subscribe({
      next: (res) => {
        this.importingExcel.set(false);
        this.importResult = res;
        const obsMsg = res.obsoleteFiltered ? ` (${res.obsoleteFiltered} marcadas ELIMINAR en amarillo)` : '';
        this.toast.success(
          `Importación exitosa: ${res.addedRecords ?? res.importedRecords} nuevos, ${res.updatedRecords ?? 0} actualizados (${res.totalPieces} pzas)${obsMsg}.`
        );
        this.loadShelves(sessionId);
        this.refreshFamilyCounts();
        if (this.inspectedShelf) {
          this.loadInspectedShelfMaterials(this.inspectedShelf.shelfId);
        }
      },
      error: (err) => {
        this.importingExcel.set(false);
        this.toast.error('Error al importar Excel: ' + (err.error?.message || err.message));
      }
    });
  }

  openClearShelfCountsModal(shelf: ShelfAssignmentDto) {
    this.shelfToClearCounts = shelf;
  }

  executeClearShelfCounts() {
    if (!this.shelfToClearCounts) return;
    const shelf = this.shelfToClearCounts;
    this.clearingShelfCounts.set(true);
    this.api.resetShelfAssignment(this.activeSessionId(), shelf.shelfId, true).subscribe({
      next: () => {
        this.clearingShelfCounts.set(false);
        this.toast.success(`Conteos del anaquel ${shelf.shelfCode} eliminados y restablecido a Pendiente.`);
        this.allShelves.update(list => list.map(s => {
          if (s.shelfId === shelf.shelfId) {
            return {
              ...s,
              totalPieces: 0,
              recordCount: 0,
              status: 'PENDIENTE'
            };
          }
          return s;
        }));
        if (this.inspectedShelf && this.inspectedShelf.shelfId === shelf.shelfId) {
          this.inspectedShelf.totalPieces = 0;
          this.inspectedShelf.recordCount = 0;
          this.inspectedShelf.status = 'PENDIENTE';
          this.inspectedMaterials.set([]);
        }
        this.shelfToClearCounts = null;
      },
      error: (err) => {
        this.clearingShelfCounts.set(false);
        this.toast.error(err.error?.message || 'Error al limpiar conteos del anaquel');
      }
    });
  }

  async downloadShelfQrPng(shelf: ShelfAssignmentDto) {
    try {
      const captureUrl = `${window.location.origin}/capture?sessionId=${this.activeSessionId()}&shelfId=${shelf.shelfId}`;
      const qrDataUrl = await QRCode.toDataURL(captureUrl, {
        width: 800,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: { dark: '#0a2472', light: '#ffffff' }
      });
      const a = document.createElement('a');
      a.href = qrDataUrl;
      a.download = `${shelf.shelfCode}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      this.toast.success(`Código QR descargado: ${shelf.shelfCode}.png`);
    } catch (err: any) {
      this.toast.error('Error al generar código QR: ' + err.message);
    }
  }

  downloadShelfMaterialsZip(shelf: ShelfAssignmentDto) {
    if (!shelf) return;
    this.toast.info(`Generando ZIP de materiales para ${shelf.shelfCode}...`);
    this.api.downloadShelfMaterialsZip(shelf.shelfId, this.activeSessionId()).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = shelf.shelfCode.replace(/[\/\\:*?"<>|]/g, '_').trim();
        a.download = `QRs_${safeName}_materiales.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.toast.success(`Descargados códigos QR de ${shelf.shelfCode} en ZIP.`);
      },
      error: (err) => {
        this.toast.error('Error al descargar ZIP de materiales: ' + (err.error?.message || err.message));
      }
    });
  }

  // Physical Rack (Levels A-F) & Section Assignment Methods
  getRackShortHeader(shelf: ShelfAssignmentDto | null): string {
    if (!shelf || !shelf.shelfCode) return '01';
    const code = shelf.shelfCode;
    const matches = code.match(/(\d+)$/);
    if (matches && matches[1]) {
      return matches[1].padStart(2, '0');
    }
    const parts = code.split('-');
    return parts[parts.length - 1] || code;
  }

  getLevelStats(level: string): { count: number; pieces: number } {
    const mats = this.inspectedMaterials();
    if (level === 'SIN_NIVEL') {
      const filtered = mats.filter(m => !m.section || !m.section.trim());
      return {
        count: filtered.length,
        pieces: filtered.reduce((sum, m) => sum + (m.quantity || 0), 0)
      };
    }
    const cleanLvl = level.toUpperCase();
    const filtered = mats.filter(m => m.section && m.section.toUpperCase() === cleanLvl);
    return {
      count: filtered.length,
      pieces: filtered.reduce((sum, m) => sum + (m.quantity || 0), 0)
    };
  }

  toggleLevelFilter(lvl: string) {
    if (this.selectedLevelFilter() === lvl) {
      this.selectedLevelFilter.set('TODOS');
    } else {
      this.selectedLevelFilter.set(lvl);
    }
  }

  closeInspectedShelf() {
    this.inspectedShelf = null;
    this.inlineRenamingShelf = false;
    this.inspectedMaterials.set([]);
    this.selectedLevelFilter.set('TODOS');
    this.shelfMaterialSearch.set('');
  }

  loadInspectedShelfMaterials(shelfId: number) {
    const sessionId = this.activeSessionId();
    if (!sessionId || sessionId === 0) return;
    this.loadingMaterials.set(true);
    this.api.getCounts(sessionId, shelfId).subscribe({
      next: (records) => {
        this.inspectedMaterials.set(records);
        this.loadingMaterials.set(false);
      },
      error: (err) => {
        this.loadingMaterials.set(false);
        this.toast.error('Error al cargar refacciones del anaquel: ' + (err.error?.message || err.message));
      }
    });
  }

  isTenLevelShelf(shelfCode?: string | null): boolean {
    if (!shelfCode) return false;
    const code = shelfCode.trim().toUpperCase();
    return code === 'PB-YPC-13' || code === 'PB-YPC-14' || code === 'PB-YPC-15';
  }

  getRackLevelsForShelf(shelf?: ShelfAssignmentDto | null): string[] {
    if (!shelf) return ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
    if (this.isTenLevelShelf(shelf.shelfCode)) {
      return ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    }
    return ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
  }

  getRackLevelsForShelfCode(shelfCode?: string | null): string[] {
    if (this.isTenLevelShelf(shelfCode)) {
      return ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    }
    return ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
  }

  getFamilyFilterLevels(fam?: SectionStat | null): string[] {
    if (!fam) return ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
    if (fam && (fam.id === 'ypc' || fam.id === 'YPC')) {
      return ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    }
    return ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
  }

  getLevelsForRow(row: LocationAssignerRow): string[] {
    return this.getRackLevelsForShelfCode(row.shelfCode);
  }

  getBulkFillLevels(): string[] {
    const sId = this.bulkShelfId();
    if (!sId) return ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const shelf = this.allShelves().find(s => s.shelfId === sId);
    return this.getRackLevelsForShelf(shelf);
  }

  assignSectionToMaterial(item: CountRecordDto, section: string) {
    const cleanSec = section.trim().toUpperCase();
    if (cleanSec && !/^[SA-J]$/.test(cleanSec)) return;

    this.updatingRecordId.set(item.id);
    this.api.updateCountSection(item.id, cleanSec).subscribe({
      next: (updated) => {
        this.updatingRecordId.set(null);
        item.section = updated.section || '';
        this.toast.success(
          cleanSec
            ? `Clave ${item.capturedCode} asignada al Nivel ${cleanSec}.`
            : `Sección de ${item.capturedCode} removida.`
        );
        this.inspectedMaterials.update(list => [...list]);
      },
      error: (err: any) => {
        this.updatingRecordId.set(null);
        this.toast.error('Error al asignar sección: ' + (err.error?.message || err.message));
      }
    });
  }

  // Rack Clicks and Drag & Drop (Modo Acomodo Fluido)
  onRackClick(event: MouseEvent, shelf: ShelfAssignmentDto) {
    event.stopPropagation();
    if (this.editMode()) {
      this.selectedRackForMove = shelf;
      this.toast.info(`Anaquel ${shelf.shelfCode} seleccionado. Puedes arrastrarlo, ajustar sus px o usar flechas del teclado.`);
    } else {
      if (this.sessions().length === 0 || this.activeSessionId() === 0) {
        this.toast.warning('No hay inventario activo. Haz clic en "Restaurar 170 Anaqueles (Crear Inventario)" para iniciar los conteos.');
        return;
      }
      this.inspectedShelf = shelf;
      this.selectedLevelFilter.set('TODOS');
      this.shelfMaterialSearch.set('');
      this.loadInspectedShelfMaterials(shelf.shelfId);
    }
  }

  onRackMouseDown(event: MouseEvent, shelf: ShelfAssignmentDto) {
    if (!this.editMode()) return;
    event.stopPropagation();
    event.preventDefault();
    this.isDragging = true;
    this.selectedRackForMove = shelf;
    this.draggedRack = shelf;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragInitialX = shelf.posX;
    this.dragInitialY = shelf.posY;
  }

  onCanvasMouseMove(event: MouseEvent) {
    if (!this.isDragging || !this.draggedRack) return;
    const scale = this.zoomLevel() / 100;
    const dx = (event.clientX - this.dragStartX) / scale;
    const dy = (event.clientY - this.dragStartY) / scale;
    this.draggedRack.posX = Math.max(10, Math.min(1380, Math.round(this.dragInitialX + dx)));
    this.draggedRack.posY = Math.max(10, Math.min(760, Math.round(this.dragInitialY + dy)));
  }

  onCanvasMouseUp(event?: MouseEvent) {
    if (this.isDragging) {
      this.isDragging = false;
      this.draggedRack = null;
    }
  }

  onCanvasClick(event: MouseEvent) {
    if (!this.editMode() || !this.selectedRackForMove || !this.canvasRef || this.isDragging) return;

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const scale = this.zoomLevel() / 100;
    const clickX = (event.clientX - rect.left) / scale;
    const clickY = (event.clientY - rect.top) / scale;

    const targetRack = this.selectedRackForMove;
    const updated = this.allShelves().map(s => {
      if (s.shelfId === targetRack.shelfId) {
        return {
          ...s,
          posX: Math.max(10, Math.min(1380, Math.round(clickX - (s.width || 54) / 2))),
          posY: Math.max(10, Math.min(760, Math.round(clickY - (s.height || 54) / 2)))
        };
      }
      return s;
    });

    this.allShelves.set(updated);
    this.toast.success(`Posición de ${targetRack.shelfCode} actualizada temporalmente. Pulsa "Guardar Coordenadas".`);
  }

  rotateSelectedRack() {
    if (!this.selectedRackForMove) return;
    const currentW = this.selectedRackForMove.width || 54;
    const currentH = this.selectedRackForMove.height || 54;
    this.selectedRackForMove.width = currentH;
    this.selectedRackForMove.height = currentW;
    this.toast.info(`Anaquel rotado 90°: ${currentH}x${currentW} px`);
  }

  nudgeSelected(dx: number, dy: number) {
    if (!this.selectedRackForMove) return;
    this.selectedRackForMove.posX = Math.max(10, Math.min(1380, (this.selectedRackForMove.posX || 0) + dx));
    this.selectedRackForMove.posY = Math.max(10, Math.min(760, (this.selectedRackForMove.posY || 0) + dy));
  }

  clampCoords(s: ShelfAssignmentDto) {
    if (!s) return;
    s.posX = Math.max(10, Math.min(1380, s.posX || 10));
    s.posY = Math.max(10, Math.min(760, s.posY || 10));
    s.width = Math.max(15, Math.min(300, s.width || 54));
    s.height = Math.max(15, Math.min(300, s.height || 54));
  }

  toggleCadPaletteMinimized() {
    this.isCadPaletteMinimized.set(!this.isCadPaletteMinimized());
  }

  openResizeShelfModal(target?: ShelfAssignmentDto) {
    let shelf = target;
    if (!shelf && this.inspectedShelf) {
      shelf = this.inspectedShelf;
    } else if (!shelf && this.selectedRackForMove) {
      shelf = this.selectedRackForMove;
    } else if (!shelf) {
      const list = this.plantShelves();
      if (list.length > 0) shelf = list[0];
    }

    if (shelf) {
      this.resizingShelfTarget.set(shelf);
      this.resizeTargetWidth.set(shelf.width || 76);
      this.resizeTargetHeight.set(shelf.height || 34);
    }
    this.resizeApplyToAllInZone.set(false);
    this.showResizeShelfModal.set(true);
  }

  closeResizeShelfModal() {
    this.showResizeShelfModal.set(false);
  }

  onResizeShelfSelectionChange(shelfId: any) {
    const sId = Number(shelfId);
    const shelf = this.allShelves().find(s => s.shelfId === sId);
    if (shelf) {
      this.resizingShelfTarget.set(shelf);
      this.resizeTargetWidth.set(shelf.width || 76);
      this.resizeTargetHeight.set(shelf.height || 34);
    }
  }

  setResizeDimensions(w: number, h: number) {
    this.resizeTargetWidth.set(w);
    this.resizeTargetHeight.set(h);
  }

  swapResizeDimensions() {
    const curW = this.resizeTargetWidth();
    const curH = this.resizeTargetHeight();
    this.resizeTargetWidth.set(curH);
    this.resizeTargetHeight.set(curW);
    this.toast.info(`Dimensiones rotadas 90°: ${curH}x${curW} px`);
  }

  adjustResizeWidth(delta: number) {
    const newW = Math.max(10, Math.min(500, Math.round((this.resizeTargetWidth() + delta) * 10) / 10));
    this.resizeTargetWidth.set(newW);
  }

  adjustResizeHeight(delta: number) {
    const newH = Math.max(10, Math.min(500, Math.round((this.resizeTargetHeight() + delta) * 10) / 10));
    this.resizeTargetHeight.set(newH);
  }

  submitShelfResize() {
    const target = this.resizingShelfTarget();
    if (!target) return;

    const newW = this.resizeTargetWidth();
    const newH = this.resizeTargetHeight();
    this.savingShelfResize.set(true);

    if (this.resizeApplyToAllInZone() && target.shelfZone) {
      const targetZone = target.shelfZone.trim().toLowerCase();
      const shelvesInZone = this.allShelves().filter(s => (s.shelfZone || '').trim().toLowerCase() === targetZone);

      const updatedAll = this.allShelves().map(s => {
        if ((s.shelfZone || '').trim().toLowerCase() === targetZone) {
          return { ...s, width: newW, height: newH };
        }
        return s;
      });
      this.allShelves.set(updatedAll);

      const payload = shelvesInZone.map(s => ({
        shelfId: s.shelfId,
        width: newW,
        height: newH,
        posX: s.posX,
        posY: s.posY
      }));

      this.api.saveCroquisLayout({ positions: payload }).subscribe({
        next: () => {
          this.savingShelfResize.set(false);
          this.showResizeShelfModal.set(false);
          this.toast.success(`Se actualizaron las medidas (${newW}x${newH} px) de ${shelvesInZone.length} anaqueles en la zona ${target.shelfZone}.`);
          if (this.selectedRackForMove && (this.selectedRackForMove.shelfZone || '').trim().toLowerCase() === targetZone) {
            this.selectedRackForMove.width = newW;
            this.selectedRackForMove.height = newH;
          }
          if (this.inspectedShelf && (this.inspectedShelf.shelfZone || '').trim().toLowerCase() === targetZone) {
            this.inspectedShelf.width = newW;
            this.inspectedShelf.height = newH;
          }
        },
        error: (err) => {
          this.savingShelfResize.set(false);
          this.toast.error('Error al actualizar medidas en lote: ' + (err.error?.message || err.message));
        }
      });
    } else {
      const updatedAll = this.allShelves().map(s => {
        if (s.shelfId === target.shelfId) {
          return { ...s, width: newW, height: newH };
        }
        return s;
      });
      this.allShelves.set(updatedAll);

      this.api.saveCroquisLayout({
        positions: [{
          shelfId: target.shelfId,
          width: newW,
          height: newH,
          posX: target.posX,
          posY: target.posY
        }]
      }).subscribe({
        next: () => {
          this.savingShelfResize.set(false);
          this.showResizeShelfModal.set(false);
          this.toast.success(`Medidas de ${target.shelfCode} actualizadas a ${newW}x${newH} px.`);
          if (this.selectedRackForMove && this.selectedRackForMove.shelfId === target.shelfId) {
            this.selectedRackForMove.width = newW;
            this.selectedRackForMove.height = newH;
          }
          if (this.inspectedShelf && this.inspectedShelf.shelfId === target.shelfId) {
            this.inspectedShelf.width = newW;
            this.inspectedShelf.height = newH;
          }
        },
        error: (err) => {
          this.savingShelfResize.set(false);
          this.toast.error('Error al actualizar medidas: ' + (err.error?.message || err.message));
        }
      });
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (this.showResizeShelfModal()) {
        this.closeResizeShelfModal();
        event.preventDefault();
        return;
      }
      if (this.locationAssignerFamily()) {
        this.closeLocationAssigner();
        event.preventDefault();
        return;
      }
      if (this.showImportExcelModal) {
        this.closeCroquisImportModal();
        event.preventDefault();
        return;
      }
      if (this.selectedProductPlanning()) {
        this.closeProductPlanning();
        event.preventDefault();
        return;
      }
      if (this.inlineRenamingShelf) {
        this.cancelInlineShelfRename();
        event.preventDefault();
        return;
      }
      if (this.inspectedShelf) {
        this.closeInspectedShelf();
        event.preventDefault();
        return;
      }
      if (this.activeFamilyExplorer()) {
        this.closeFamilyExplorer();
        event.preventDefault();
        return;
      }
      if (this.editingShelf) {
        this.editingShelf = null;
        event.preventDefault();
        return;
      }
      if (this.selectedRackForMove) {
        this.selectedRackForMove = null;
        event.preventDefault();
        return;
      }
    }

    if (!this.editMode() || !this.selectedRackForMove) return;
    const target = event.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;

    const step = event.shiftKey ? 10 : 1;
    if (event.key === 'ArrowUp') {
      this.nudgeSelected(0, -step);
      event.preventDefault();
    } else if (event.key === 'ArrowDown') {
      this.nudgeSelected(0, step);
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      this.nudgeSelected(-step, 0);
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      this.nudgeSelected(step, 0);
      event.preventDefault();
    }
  }

  toggleEditMode() {
    const current = this.editMode();
    this.editMode.set(!current);
    this.selectedRackForMove = null;
    this.isDragging = false;
    this.draggedRack = null;
    if (!current) {
      this.toast.info('Modo Acomodo Activo: Arrastra anaqueles con el mouse o pulsa para seleccionarlos.');
    }
  }

  saveLayoutPositions() {
    const plantList = this.plantShelves();
    this.savingLayout.set(true);

    const positions = plantList.map(s => ({
      shelfId: s.shelfId,
      posX: s.posX,
      posY: s.posY,
      width: s.width,
      height: s.height
    }));

    this.api.saveCroquisLayout({ positions }).subscribe({
      next: () => {
        this.savingLayout.set(false);
        this.editMode.set(false);
        this.toast.success('Coordenadas de anaqueles guardadas correctamente.');
      },
      error: (err: any) => {
        this.savingLayout.set(false);
        this.toast.error('Error al guardar coordenadas: ' + (err.error?.message || err.message));
      }
    });
  }

  toggleShelfStatus(shelf: ShelfAssignmentDto) {
    const nextStatus = this.isCompleted(shelf) ? 'EN_CONTEO' : 'COMPLETADO';
    this.api.updateShelfStatus(this.activeSessionId(), shelf.shelfId, nextStatus).subscribe({
      next: (updated) => {
        this.inspectedShelf = null;
        this.toast.success(`Anaquel ${shelf.shelfCode} actualizado a ${nextStatus}.`);
        this.loadShelves(this.activeSessionId());
      },
      error: (err: any) => this.toast.error('Error al actualizar estado: ' + (err.error?.message || err.message))
    });
  }

  resetShelfToUntouched(shelf: ShelfAssignmentDto) {
    this.api.resetShelfAssignment(this.activeSessionId(), shelf.shelfId, false).subscribe({
      next: () => {
        this.inspectedShelf = null;
        this.toast.success(`Anaquel ${shelf.shelfCode} desmarcado. Estado restablecido a 'Sin Iniciar' (Neutro).`);
        this.loadShelves(this.activeSessionId());
      },
      error: (err: any) => this.toast.error('Error al desmarcar anaquel: ' + (err.error?.message || err.message))
    });
  }

  goToCapture(shelf: ShelfAssignmentDto) {
    this.router.navigate(['/capture'], {
      queryParams: {
        sessionId: this.activeSessionId(),
        shelfId: shelf.shelfId
      }
    });
  }

  goToQrLabels(shelf?: ShelfAssignmentDto) {
    this.router.navigate(['/qr-labels'], {
      queryParams: {
        sessionId: this.activeSessionId(),
        shelfCode: shelf ? shelf.shelfCode : undefined
      }
    });
  }

  // =========================================================================
  // FAMILY CODES EXPLORER METHODS (Pestaña de Códigos por Familia)
  // =========================================================================
  openFamilyExplorer(event: MouseEvent, sec: SectionStat) {
    event.stopPropagation();
    if (this.sessions().length === 0 || this.activeSessionId() === 0) {
      this.toast.warning('No hay inventario activo todavía.');
      return;
    }
    this.activeFamilyExplorer.set(sec);
    this.familySearchQuery.set('');
    this.familyShelfFilter.set('TODOS');
    this.familyLevelFilter.set('TODOS');
    this.familyViewMode.set('DETALLE');
    this.familyDisplayLimit.set(150);
    this.refreshFamilyCounts();
  }

  switchFamilyTab(sec: SectionStat) {
    this.activeFamilyExplorer.set(sec);
    this.familyShelfFilter.set('TODOS');
    this.familyLevelFilter.set('TODOS');
    this.familyDisplayLimit.set(150);
  }

  closeFamilyExplorer() {
    this.activeFamilyExplorer.set(null);
  }

  refreshFamilyCounts() {
    const sessionId = this.activeSessionId();
    if (!sessionId || sessionId === 0) return;
    this.loadingFamilyCounts.set(true);
    this.api.getCounts(sessionId).subscribe({
      next: (records) => {
        this.allSessionCounts.set(records);
        this.loadingFamilyCounts.set(false);
        const openAssignerFam = this.locationAssignerFamily();
        if (openAssignerFam) {
          this.openLocationAssignerForFamily(openAssignerFam);
        }
      },
      error: (err: any) => {
        this.loadingFamilyCounts.set(false);
        this.toast.error('Error al cargar códigos de la familia: ' + (err.error?.message || err.message));
      }
    });
  }

  getFamilyLevelCount(lvl: string): number {
    const list = this.familyCounts();
    if (lvl === 'SIN_NIVEL') {
      return list.filter(r => !r.section || !r.section.trim()).length;
    }
    const clean = lvl.toUpperCase();
    return list.filter(r => r.section && r.section.toUpperCase() === clean).length;
  }

  assignSectionFromFamilyExplorer(item: CountRecordDto, section: string) {
    const cleanSec = section.trim().toUpperCase();
    if (cleanSec && !/^[SA-J]$/.test(cleanSec)) return;

    this.updatingRecordId.set(item.id);
    this.api.updateCountSection(item.id, cleanSec).subscribe({
      next: (updated) => {
        this.updatingRecordId.set(null);
        item.section = updated.section || '';
        this.allSessionCounts.update(list => [...list]);
        this.toast.success(
          cleanSec
            ? `Clave ${item.capturedCode} (${item.shelfCode}) asignada al Nivel ${cleanSec}.`
            : `Nivel de ${item.capturedCode} removido.`
        );
      },
      error: (err: any) => {
        this.updatingRecordId.set(null);
        this.toast.error('Error al asignar nivel: ' + (err.error?.message || err.message));
      }
    });
  }

  openShelfFromFamilyExplorer(shelfId: number) {
    const target = this.allShelves().find(s => s.shelfId === shelfId);
    if (!target) return;
    this.activeFamilyExplorer.set(null);
    this.inspectedShelf = target;
    this.selectedLevelFilter.set('TODOS');
    this.shelfMaterialSearch.set('');
    this.loadInspectedShelfMaterials(target.shelfId);
  }

  goToCaptureById(shelfId: number) {
    this.activeFamilyExplorer.set(null);
    this.router.navigate(['/capture'], {
      queryParams: {
        sessionId: this.activeSessionId(),
        shelfId
      }
    });
  }

  exportFamilyCsv(fam: SectionStat) {
    const mode = this.familyViewMode();
    const lines: string[] = [];
    if (mode === 'CONSOLIDADO') {
      lines.push('FAMILIA,CODIGO,DESCRIPCION,TOTAL_PIEZAS,UBICACIONES');
      for (const row of this.consolidatedFamilyCounts()) {
        const locs = row.locations
          .map(l => `${l.shelfCode}${l.section ? '-' + l.section : ''} (${l.qty})`)
          .join(' | ');
        lines.push([
          `"${fam.name.replace(/"/g, '""')}"`,
          `"${row.code.replace(/"/g, '""')}"`,
          `"${(row.description || '').replace(/"/g, '""')}"`,
          row.totalQty,
          `"${locs.replace(/"/g, '""')}"`
        ].join(','));
      }
    } else {
      lines.push('FAMILIA,ANAQUEL,NIVEL,CODIGO,DESCRIPCION,PIEZAS');
      for (const item of this.filteredFamilyCounts()) {
        lines.push([
          `"${fam.name.replace(/"/g, '""')}"`,
          `"${(item.shelfCode || '').replace(/"/g, '""')}"`,
          `"${(item.section || '').replace(/"/g, '""')}"`,
          `"${(item.capturedCode || '').replace(/"/g, '""')}"`,
          `"${(item.description || '').replace(/"/g, '""')}"`,
          item.quantity || 0
        ].join(','));
      }
    }

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeFam = fam.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    a.href = url;
    a.download = `Interflu_Familia_${safeFam}_${mode}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    this.toast.success(`Listado de ${fam.name} exportado a CSV.`);
  }

  // =========================================================================
  // MATERIAL PLANNING & LOCATION DECODING METHODS
  // =========================================================================
  getItemLocationCode(item: any): string {
    if (!item) return '--';
    const code = (item.capturedCode || item.code || '').trim().toUpperCase();
    const shelfCode = (item.shelfCode || (item.locations && item.locations[0] ? item.locations[0].shelfCode : '')).trim().toUpperCase();
    const section = (item.section || (item.locations && item.locations[0] ? item.locations[0].section : '')).trim().toUpperCase();

    // 1. Notes matching PB\d+-\d+[SA-J]-?\d* (exact imported/assigned location)
    if (item.notes && typeof item.notes === 'string') {
      const match = item.notes.match(/P[BA]\d+-\d+[SA-J]-?\d*/i);
      if (match) return match[0].toUpperCase();
    }

    // 2. Direct Acero Master Catalog lookup by code, shelf, and section
    const aceroMeta = findAceroLocation(code, shelfCode, section);
    if (aceroMeta) {
      return aceroMeta.ubicacion;
    }

    // 3. Fallback for other families: shelf code + section
    if (item.locations && item.locations.length > 0) {
      const first = item.locations[0];
      return `${first.shelfCode}${first.section ? '-' + first.section : ''}`;
    }
    if (item.shelfCode) {
      return item.section ? `${item.shelfCode}-${item.section}` : item.shelfCode;
    }
    return '--';
  }

  getItemDisplayDescription(item: any): string {
    if (!item) return '';
    const desc = item.description ? item.description.trim() : '';
    const code = (item.capturedCode || item.code || '').trim();
    if (!desc || desc.toUpperCase() === code.toUpperCase() || desc.includes('(Refacción Industrial)')) {
      return this.parseIndustrialDescription(code);
    }
    return desc;
  }

  parseIndustrialDescription(code: string): string {
    if (!code) return 'Material Industrial';
    const c = code.trim().toUpperCase();
    if (c === 'CG401/2') return 'Codo Galvanizado Cédula 40 de 1/2"';
    if (c === 'CG403/4') return 'Codo Galvanizado Cédula 40 de 3/4"';
    if (c === 'CG403/8') return 'Codo Galvanizado Cédula 40 de 3/8"';
    if (c === 'CG401/4') return 'Codo Galvanizado Cédula 40 de 1/4"';

    if (/^C90I40/.test(c)) return 'Codo 90° Inoxidable Cédula 40 de ' + c.substring(6) + '"';
    if (/^C90N80/.test(c)) return 'Codo 90° Negro Cédula 80 de ' + c.substring(6) + '"';
    if (/^C90N40/.test(c)) return 'Codo 90° Negro Cédula 40 de ' + c.substring(6) + '"';
    if (/^C45G40/.test(c)) return 'Codo 45° Galvanizado Cédula 40 de ' + c.substring(6) + '"';
    if (/^C45I40/.test(c)) return 'Codo 45° Inoxidable Cédula 40 de ' + c.substring(6) + '"';
    if (/^CG40/.test(c)) return 'Codo Galvanizado Cédula 40 de ' + c.substring(4) + '"';
    if (/^CI40/.test(c)) return 'Codo Inoxidable Cédula 40 de ' + c.substring(4) + '"';
    if (/^CN40/.test(c)) return 'Codo Negro Cédula 40 de ' + c.substring(4) + '"';

    if (/^NG40.*XRC$/.test(c)) return 'Niple Galvanizado Cédula 40 de ' + c.substring(4, c.length - 3) + '" Rosca Corrida';
    if (/^NG40.*X/.test(c)) {
      const parts = c.substring(4).split('X');
      return 'Niple Galvanizado Cédula 40 de ' + parts[0] + '" x ' + parts[1] + '"';
    }
    if (/^NN80.*XRC$/.test(c)) return 'Niple Negro Cédula 80 de ' + c.substring(4, c.length - 3) + '" Rosca Corrida';
    if (/^NN80.*X/.test(c)) {
      const parts = c.substring(4).split('X');
      return 'Niple Negro Cédula 80 de ' + parts[0] + '" x ' + parts[1] + '"';
    }
    if (/^NI40.*XRC$/.test(c)) return 'Niple Inoxidable Cédula 40 de ' + c.substring(4, c.length - 3) + '" Rosca Corrida';
    if (/^NI40.*X/.test(c)) {
      const parts = c.substring(4).split('X');
      return 'Niple Inoxidable Cédula 40 de ' + parts[0] + '" x ' + parts[1] + '"';
    }
    if (/^NBI/.test(c)) return 'Niple Botella Inoxidable ' + c.substring(3) + '"';

    if (/^RBG.*X/.test(c)) {
      const parts = c.substring(3).split('X');
      return 'Reducción Bushing Galvanizada ' + parts[0] + '" x ' + parts[1] + '"';
    }
    if (/^RBN40.*X/.test(c)) {
      const parts = c.substring(5).split('X');
      return 'Reducción Bushing Negra Cédula 40 de ' + parts[0] + '" x ' + parts[1] + '"';
    }
    if (/^RBN80.*X/.test(c)) {
      const parts = c.substring(5).split('X');
      return 'Reducción Bushing Negra Cédula 80 de ' + parts[0] + '" x ' + parts[1] + '"';
    }
    if (/^RCI.*X/.test(c)) {
      const parts = c.substring(3).split('X');
      return 'Reducción Campana Inoxidable ' + parts[0] + '" x ' + parts[1] + '"';
    }

    if (/^TMG/.test(c)) return 'Tapón Macho Galvanizado ' + c.substring(3) + '"';
    if (/^TMA40/.test(c)) return 'Tapón Macho Acero Cédula 40 de ' + c.substring(5) + '"';
    if (/^TUAN/.test(c)) return 'Tuerca Unión Acero Negro ' + c.substring(4) + '"';
    if (/^TUINOX/.test(c)) return 'Tuerca Unión Inoxidable ' + c.substring(6) + '"';

    if (/^VBIM/.test(c)) return 'Válvula de Bola Inoxidable Macho ' + c.substring(4) + '"';
    if (/^VAI/.test(c)) return 'Válvula de Aguja Inoxidable ' + c.substring(3) + '"';
    if (/^VW444T/.test(c)) return 'Válvula Tipo Mariposa / Wafer 444T ' + c.substring(6) + '"';

    return 'Conexión Industrial ' + c;
  }

  decodeLocation(locStr: string, sectionFallback?: string, productCode?: string, shelfCodeFallback?: string): DecodedLocation {
    const code = (productCode || '').trim().toUpperCase();
    const sec = (sectionFallback || '').trim().toUpperCase();
    const sh = (shelfCodeFallback || '').trim().toUpperCase();

    // 1. Check master Acero catalog
    const meta = findAceroLocation(code, sh, sec) || findAceroLocation(locStr);
    if (meta) {
      const plant = meta.planta === 'PB' ? 'Planta Baja' : 'Planta Alta';
      const aisle = `Pasillo ${meta.pasillo} (Acero)`;
      const shelf = `Estante ${meta.estante} (Anaquel ${meta.estante})`;
      const level = `Nivel ${meta.nivel}`;
      const pos = `Posición ${meta.posicion}`;
      return {
        plant,
        plantCode: meta.planta,
        aisle,
        aisleCode: meta.pasillo,
        shelf,
        shelfCode: meta.estante,
        level,
        levelCode: meta.nivel,
        position: pos,
        positionCode: meta.posicion,
        summary: `${meta.planta} = ${plant} · ${meta.pasillo} = ${aisle} · ${meta.estante} = ${shelf} · ${meta.nivel} = ${level} · ${meta.posicion} = ${pos}`
      };
    }

    if (!locStr || locStr === '--') {
      return {
        plant: 'Planta Baja',
        plantCode: 'PB',
        aisle: 'Pasillo 3 (Acero)',
        aisleCode: '3',
        shelf: 'Estante 1 (Anaquel 1)',
        shelfCode: '1',
        level: sec ? `Nivel ${sec}` : 'Nivel A',
        levelCode: sec || 'A',
        position: 'Posición 1',
        positionCode: '1',
        summary: 'Ubicación General'
      };
    }
    const loc = locStr.trim().toUpperCase();

    // Pattern 1: PB3-1A-1 or PB3-1S-1 or PB3-10B-2
    const m1 = loc.match(/^(P[BA])(\d+)-(\d+)([SA-J])-?(\d+)?$/);
    if (m1) {
      const plant = m1[1] === 'PB' ? 'Planta Baja' : 'Planta Alta';
      const aisle = `Pasillo ${m1[2]} (Acero)`;
      const shelf = `Estante ${m1[3]} (Anaquel ${m1[3]})`;
      const level = m1[4] === 'S' ? 'Nivel S (Superior)' : `Nivel ${m1[4]}`;
      const pos = m1[5] ? `Posición ${m1[5]}` : 'Posición 1';
      return {
        plant,
        plantCode: m1[1],
        aisle,
        aisleCode: m1[2],
        shelf,
        shelfCode: m1[3],
        level,
        levelCode: m1[4],
        position: pos,
        positionCode: m1[5] || '1',
        summary: `${m1[1]} = ${plant} · ${m1[2]} = ${aisle} · ${m1[3]} = ${shelf} · ${m1[4]} = ${level} · ${m1[5] || '1'} = ${pos}`
      };
    }

    // Pattern 2: PB-ACE-01 or PB-ACE-01-A or PB-ACE-01-S
    const m2 = loc.match(/^(P[BA])-([A-Z0-9]+)-(\d+)(?:-([SA-J]))?$/);
    if (m2) {
      const plant = m2[1] === 'PB' ? 'Planta Baja' : 'Planta Alta';
      const fam = m2[2];
      const famName = fam.includes('ACE') ? 'Pasillo 3 (Acero)' : (fam.includes('KUR') ? 'Pasillo Kuriyama' : `Pasillo ${fam}`);
      const shelfNum = m2[3].replace(/^0+/, '') || m2[3];
      const shelf = `Estante ${shelfNum} (Anaquel ${shelfNum})`;
      const lvlCode = m2[4] || sec || 'A';
      const level = lvlCode === 'S' ? 'Nivel S (Superior)' : `Nivel ${lvlCode}`;
      return {
        plant,
        plantCode: m2[1],
        aisle: famName,
        aisleCode: fam.includes('ACE') ? '3' : fam,
        shelf,
        shelfCode: shelfNum,
        level,
        levelCode: lvlCode,
        position: 'Posición 1',
        positionCode: '1',
        summary: `${m2[1]} = ${plant} · ${fam} = ${famName} · ${shelfNum} = ${shelf} · ${lvlCode} = ${level}`
      };
    }

    return {
      plant: 'Planta Baja',
      plantCode: 'PB',
      aisle: 'Pasillo 3 (Acero)',
      aisleCode: '3',
      shelf: `Estante ${loc}`,
      shelfCode: loc,
      level: sec ? `Nivel ${sec}` : 'Nivel A',
      levelCode: sec || 'A',
      position: 'Posición 1',
      positionCode: '1',
      summary: `Ubicación: ${loc}`
    };
  }

  openProductPlanning(item: any) {
    if (!item) return;
    const code = (item.capturedCode || item.code || '').trim();
    const desc = this.getItemDisplayDescription(item);
    const locCode = this.getItemLocationCode(item);
    const shelfCode = (item.shelfCode || (item.locations && item.locations[0] ? item.locations[0].shelfCode : '')).trim().toUpperCase();
    const decoded = this.decodeLocation(locCode, item.section, code, shelfCode);
    const stockActual = item.quantity !== undefined && item.quantity !== null ? Number(item.quantity) : (item.totalQty || 0);

    let minimoSeguridad: number;
    let puntoReorden: number;
    let maximoObjetivo: number;
    let porRecibir: number;
    let apartadas: number;
    let monthlyDemandAvg: number;
    let packageSize = 5;
    let demandHistory: DemandBarItem[];

    if (code === 'CG401/2') {
      minimoSeguridad = 15;
      puntoReorden = 25;
      maximoObjetivo = 55;
      porRecibir = 12;
      apartadas = 2;
      monthlyDemandAvg = 30;
      demandHistory = [
        { month: 'May', quantity: 24, isEstimated: false },
        { month: 'Jun', quantity: 30, isEstimated: false },
        { month: 'Jul', quantity: 27, isEstimated: false },
        { month: 'Ago', quantity: 33, isEstimated: false },
        { month: 'Sep', quantity: 30, isEstimated: false },
        { month: 'Oct', quantity: 36, isEstimated: false },
        { month: 'Nov', quantity: 30, isEstimated: true },
        { month: 'Dic', quantity: 30, isEstimated: true },
        { month: 'Ene', quantity: 30, isEstimated: true }
      ];
    } else {
      monthlyDemandAvg = Math.max(12, Math.round((stockActual || 25) * 1.25));
      minimoSeguridad = Math.max(5, Math.round(monthlyDemandAvg * 0.5));
      puntoReorden = Math.max(10, Math.round(monthlyDemandAvg * 0.833));
      maximoObjetivo = Math.max(25, Math.round(monthlyDemandAvg * 1.833));
      packageSize = monthlyDemandAvg > 50 ? 10 : 5;
      apartadas = Math.max(1, Math.round(monthlyDemandAvg * 0.07));
      porRecibir = stockActual <= puntoReorden ? Math.round(minimoSeguridad * 0.8) : 0;

      const mNames = ['May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic', 'Ene'];
      const base = monthlyDemandAvg;
      demandHistory = [
        { month: mNames[0], quantity: Math.round(base * 0.8), isEstimated: false },
        { month: mNames[1], quantity: Math.round(base * 1.0), isEstimated: false },
        { month: mNames[2], quantity: Math.round(base * 0.9), isEstimated: false },
        { month: mNames[3], quantity: Math.round(base * 1.1), isEstimated: false },
        { month: mNames[4], quantity: Math.round(base * 1.0), isEstimated: false },
        { month: mNames[5], quantity: Math.round(base * 1.2), isEstimated: false },
        { month: mNames[6], quantity: base, isEstimated: true },
        { month: mNames[7], quantity: base, isEstimated: true },
        { month: mNames[8], quantity: base, isEstimated: true }
      ];
    }

    const stockParaPlanear = stockActual + porRecibir - apartadas;
    let cuantoPedir = 0;
    let cuantoPedirSinRedondeo = 0;
    let status: 'REORDENAR' | 'EN_CAMINO' | 'OPTIMO';
    let statusLabel: string;
    let statusColor: string;

    if (stockParaPlanear <= puntoReorden) {
      cuantoPedirSinRedondeo = Math.max(0, maximoObjetivo - stockParaPlanear);
      cuantoPedir = Math.ceil(cuantoPedirSinRedondeo / packageSize) * packageSize;
      status = 'REORDENAR';
      statusLabel = 'Reordenar ahora';
      statusColor = 'danger';
    } else if (porRecibir > 0) {
      cuantoPedir = 0;
      cuantoPedirSinRedondeo = 0;
      status = 'EN_CAMINO';
      statusLabel = 'Esperar · pedido en camino';
      statusColor = 'warning';
    } else {
      cuantoPedir = 0;
      cuantoPedirSinRedondeo = 0;
      status = 'OPTIMO';
      statusLabel = 'Stock óptimo';
      statusColor = 'success';
    }

    const purchaseOrders: PurchaseOrderItem[] = porRecibir > 0 ? [{
      ocNumber: 'OC-105',
      orderDate: '15 nov 2026',
      expectedDate: '25 nov 2026',
      orderedQty: 20,
      receivedQty: 20 - porRecibir,
      cancelledQty: 0,
      pendingQty: porRecibir
    }] : [];

    let shelfId = item.shelfId;
    if (!shelfId && item.locations && item.locations.length > 0) {
      shelfId = item.locations[0].shelfId;
    }

    const finalLocationCode = (decoded.plantCode && decoded.aisleCode && decoded.shelfCode && decoded.levelCode)
      ? `${decoded.plantCode}${decoded.aisleCode}-${decoded.shelfCode}${decoded.levelCode}-${decoded.positionCode}`
      : locCode;

    this.selectedProductPlanning.set({
      code,
      description: desc,
      category: this.activeFamilyExplorer()?.name || 'Acero (1-19)',
      unit: item.unit || 'Piezas',
      lastMovementDate: 'Corte al 19 nov 2026',
      locationCode: finalLocationCode,
      shelfId,
      decodedLocation: decoded,
      stockActual,
      minimoSeguridad,
      puntoReorden,
      maximoObjetivo,
      porRecibir,
      apartadas,
      stockParaPlanear,
      cuantoPedir,
      cuantoPedirSinRedondeo,
      status,
      statusLabel,
      statusColor,
      supplierName: 'YPC',
      leadTimeDays: 10,
      minOrder: 10,
      packageSize,
      lastQuotePrice: 120.0,
      lastQuoteDate: '12 nov 2026',
      purchaseOrders,
      monthlyDemandAvg,
      demandHistory
    });
  }

  closeProductPlanning() {
    this.selectedProductPlanning.set(null);
  }

  // =========================================================================
  // LOCATION ASSIGNER & PLANNING SAE (Generador de Ubicacion Fisica)
  // =========================================================================
  buildLocationCode(plant: string, aisle: string, shelfNum: string, level: string, position: string): string {
    const p = (plant || 'PB').trim().toUpperCase();
    const a = (aisle || '1').trim();
    const s = (shelfNum || '1').trim();
    const lvl = (level || 'A').trim().toUpperCase();
    const pos = (position || '1').trim();
    return `${p}${a}-${s}${lvl}-${pos}`;
  }

  getBulkShelfNum(): string {
    const targetShelfId = Number(this.bulkShelfId());
    const found = this.familyShelves().find(s => s.shelfId === targetShelfId);
    return found ? (found.shelfCode.replace(/^[A-Za-z_-]+/, '') || found.shelfCode) : '1';
  }

  openLocationAssignerForFamily(fam: SectionStat) {
    if (!fam) return;
    this.locationAssignerFamily.set(fam);
    this.locationAssignerSearch.set('');
    this.locationAssignerFilter.set('TODOS');

    this.bulkPlant.set('PB');
    const famIdLower = (fam.id || '').toLowerCase();
    const defaultAisle = famIdLower === 'acero' ? '3' : (fam.codePrefix || '1');
    this.bulkAisle.set(defaultAisle);
    const famShelves = this.familyShelves();
    if (famShelves.length > 0) {
      this.bulkShelfId.set(famShelves[0].shelfId);
    } else {
      this.bulkShelfId.set(0);
    }
    this.bulkLevel.set('A');
    this.bulkPosition.set('1');

    const familyRecords = this.familyCounts();
    const familyIds = new Set(familyRecords.map(r => r.id));
    const pendingExtras = this.allSessionCounts().filter(r => {
      if (familyIds.has(r.id)) return false;
      if (!this.isPendingShelf(r.shelfCode)) return false;
      const notes = (r.notes || '').trim().toLowerCase();
      if (notes.startsWith('sin_definir::')) {
        const tagFam = notes.replace('sin_definir::', '').trim();
        return tagFam === famIdLower || tagFam === 'general';
      }
      return !r.section;
    });
    const counts = [...familyRecords, ...pendingExtras];

    const rows: LocationAssignerRow[] = counts.map(r => {
      const code = (r.capturedCode || '').trim();
      const desc = r.description || code;
      const shelfCode = (r.shelfCode || '').trim();
      const rawNotes = (r.notes || '').trim();
      const cleanNotes = (rawNotes.toUpperCase().startsWith('SIN_DEFINIR') || rawNotes.toUpperCase().startsWith('IMPORTADO DE:')) ? '' : rawNotes;
      const decoded = this.decodeLocation(cleanNotes, r.section, code, shelfCode);

      const plant: 'PB' | 'PA' = decoded.plantCode === 'PA' ? 'PA' : 'PB';
      const aisle = decoded.aisleCode || defaultAisle;
      const shelfNum = this.isPendingShelf(shelfCode) ? '' : (decoded.shelfCode || (shelfCode ? shelfCode.replace(/^[A-Za-z_-]+/, '') : '1'));
      const level = r.section || decoded.levelCode || '';
      const position = decoded.positionCode || '1';

      const locationCode = cleanNotes.length > 0
        ? cleanNotes
        : (level && !this.isPendingShelf(shelfCode) ? this.buildLocationCode(plant, aisle, shelfNum, level, position) : '');

      const stockActual = r.quantity || 0;
      const monthlyDemandAvg = Math.max(12, Math.round((stockActual || 25) * 1.25));
      const minimoSeguridad = Math.max(5, Math.round(monthlyDemandAvg * 0.5));
      const puntoReorden = Math.max(10, Math.round(monthlyDemandAvg * 0.833));
      const maximoObjetivo = Math.max(25, Math.round(monthlyDemandAvg * 1.833));
      const packageSize = monthlyDemandAvg > 50 ? 10 : 5;
      const cuantoPedir = stockActual <= puntoReorden ? Math.ceil((maximoObjetivo - stockActual) / packageSize) * packageSize : 0;
      const statusLabel = stockActual <= puntoReorden ? 'Reordenar ahora' : 'Stock optimo';

      return {
        id: r.id,
        code,
        description: desc,
        shelfId: r.shelfId,
        shelfCode: r.shelfCode,
        plant,
        aisle,
        shelfNum,
        level,
        position,
        locationCode,
        quantity: stockActual,
        minimoSeguridad,
        puntoReorden,
        maximoObjetivo,
        cuantoPedir,
        statusLabel,
        isDirty: false,
        isSelected: false,
        isObsolete: this.isObsoleteItem(code, desc)
      };
    });

    this.locationAssignerRows.set(rows);
  }

  closeLocationAssigner() {
    if (this.locationAssignerDirtyCount() > 0) {
      if (!confirm(`Tienes ${this.locationAssignerDirtyCount()} cambios sin guardar. Deseas salir de todas formas?`)) {
        return;
      }
    }
    this.locationAssignerFamily.set(null);
    this.locationAssignerRows.set([]);
  }

  onRowLocationFieldChange(row: LocationAssignerRow) {
    if (row.level) {
      row.locationCode = this.buildLocationCode(row.plant, row.aisle, row.shelfNum, row.level, row.position);
    }
    row.isDirty = true;
  }

  onRowShelfChange(row: LocationAssignerRow, targetShelfIdStr: any) {
    const sId = Number(targetShelfIdStr);
    const found = this.familyShelves().find(s => s.shelfId === sId);
    if (found) {
      row.shelfId = found.shelfId;
      row.shelfCode = found.shelfCode;
      row.shelfNum = found.shelfCode.replace(/^[A-Za-z_-]+/, '') || found.shelfCode;
    } else {
      row.shelfId = sId;
    }
    this.onRowLocationFieldChange(row);
  }

  onRowLevelSelect(row: LocationAssignerRow, lvl: string) {
    row.level = lvl;
    this.onRowLocationFieldChange(row);
  }

  applyBulkFill(onlyMissing: boolean) {
    const fam = this.locationAssignerFamily();
    if (!fam) return;
    const p = this.bulkPlant();
    const a = this.bulkAisle() || '1';
    const targetShelfId = Number(this.bulkShelfId());
    const foundShelf = this.familyShelves().find(s => s.shelfId === targetShelfId);
    const sNum = foundShelf ? (foundShelf.shelfCode.replace(/^[A-Za-z_-]+/, '') || foundShelf.shelfCode) : '1';
    const sCode = foundShelf ? foundShelf.shelfCode : '';
    const lvl = this.bulkLevel();
    const pos = this.bulkPosition() || '1';

    let affected = 0;
    const currentRows = [...this.locationAssignerRows()];
    for (const row of currentRows) {
      const isMissing = !row.level || !row.shelfNum || !row.aisle || row.shelfId === 0 || !row.locationCode;
      if (onlyMissing && !isMissing) continue;

      row.plant = p;
      row.aisle = a;
      if (foundShelf) {
        row.shelfId = foundShelf.shelfId;
        row.shelfCode = sCode;
        row.shelfNum = sNum;
      }
      row.level = lvl;
      row.position = pos;
      row.locationCode = this.buildLocationCode(p, a, row.shelfNum, lvl, pos);
      row.isDirty = true;
      affected++;
    }

    this.locationAssignerRows.set(currentRows);
    if (affected > 0) {
      this.toast.info(`Se asignaron valores a ${affected} material(es). Haz clic en Guardar Ubicaciones para confirmar.`);
    } else {
      this.toast.info('No hubo materiales que coincidieran con el criterio de asignacion masiva.');
    }
  }

  saveLocationAssignerChanges() {
    const dirty = this.locationAssignerRows().filter(r => r.isDirty);
    if (dirty.length === 0) {
      this.toast.info('No hay cambios pendientes por guardar.');
      return;
    }

    this.savingLocations.set(true);
    const payload = dirty.map(r => ({
      id: r.id,
      shelfId: r.shelfId,
      section: r.level,
      locationCode: r.locationCode,
      quantity: r.quantity
    }));

    this.api.batchUpdateCountLocations(payload).subscribe({
      next: (updatedList) => {
        this.savingLocations.set(false);
        const currentAll = [...this.allSessionCounts()];
        const updatedMap = new Map<number, CountRecordDto>(updatedList.map(item => [item.id, item]));

        const newAll = currentAll.map(existing => {
          const up = updatedMap.get(existing.id);
          return up ? { ...existing, ...up } : existing;
        });
        this.allSessionCounts.set(newAll);

        const updatedRows = this.locationAssignerRows().map(r => {
          if (updatedMap.has(r.id)) {
            return { ...r, isDirty: false };
          }
          return r;
        });
        this.locationAssignerRows.set(updatedRows);
        if (this.activeSessionId() > 0) {
          this.loadShelves(this.activeSessionId());
        }

        this.toast.success(`${updatedList.length} ubicaciones guardadas y sincronizadas exitosamente.`);
      },
      error: (err) => {
        this.savingLocations.set(false);
        this.toast.error('Error al guardar ubicaciones: ' + (err.error?.message || err.message || 'Error del servidor'));
      }
    });
  }

  toggleRowSelection(row: LocationAssignerRow) {
    row.isSelected = !row.isSelected;
  }

  toggleSelectAllAssignerRows(checked: boolean) {
    const visibleIds = new Set(this.locationAssignerFilteredRows().map(r => r.id));
    const current = [...this.locationAssignerRows()];
    for (const r of current) {
      if (visibleIds.has(r.id)) {
        r.isSelected = checked;
      }
    }
    this.locationAssignerRows.set(current);
  }

  areAllAssignerRowsSelected(): boolean {
    const visible = this.locationAssignerFilteredRows();
    if (visible.length === 0) return false;
    return visible.every(r => r.isSelected);
  }

  applyToSelectedRows() {
    const count = this.locationAssignerSelectedCount();
    if (count === 0) {
      this.toast.info('No has seleccionado ningún material con las casillas.');
      return;
    }
    const targetShelfId = Number(this.bulkShelfId());
    const foundShelf = this.familyShelves().find(s => s.shelfId === targetShelfId);
    const p = this.bulkPlant();
    const a = this.bulkAisle() || '1';
    const sNum = foundShelf ? (foundShelf.shelfCode.replace(/^[A-Za-z_-]+/, '') || foundShelf.shelfCode) : '1';
    const sCode = foundShelf ? foundShelf.shelfCode : '';
    const lvl = this.bulkLevel();
    const pos = this.bulkPosition() || '1';

    const currentRows = [...this.locationAssignerRows()];
    for (const r of currentRows) {
      if (!r.isSelected) continue;
      r.plant = p;
      r.aisle = a;
      if (foundShelf) {
        r.shelfId = foundShelf.shelfId;
        r.shelfCode = sCode;
        r.shelfNum = sNum;
      }
      r.level = lvl;
      r.position = pos;
      r.locationCode = this.buildLocationCode(p, a, r.shelfNum, lvl, pos);
      r.isDirty = true;
    }
    this.locationAssignerRows.set(currentRows);
    this.toast.success(`Se aplicó ${sCode ? 'Anaquel ' + sCode : ''} Nivel ${lvl} a los ${count} materiales seleccionados. Haz clic en Guardar Ubicaciones para confirmar.`);
  }

  purgeObsoleteCountsFromSession() {
    const sessId = this.activeSessionId();
    if (!sessId || sessId === 0) return;
    const obsCount = this.locationAssignerObsoleteCount();
    if (!confirm(`Se detectaron ${obsCount} partidas con descripción 'ELIMINAR' o 'E' en el inventario. ¿Deseas depurarlas de la sesión para mantener limpias las existencias?`)) {
      return;
    }
    this.api.purgeObsoleteCounts(sessId).subscribe({
      next: (res) => {
        this.toast.success(`Se depuraron ${res.purgedCount} códigos obsoletos exitosamente.`);
        this.loadShelves(sessId);
        const fam = this.locationAssignerFamily();
        if (fam) {
          const currentCounts = this.allSessionCounts().filter(c => !this.isObsoleteItem(c.capturedCode, c.description));
          this.allSessionCounts.set(currentCounts);
          this.openLocationAssignerForFamily(fam);
        }
      },
      error: (err) => {
        this.toast.error('Error al depurar códigos obsoletos: ' + (err.error?.message || err.message));
      }
    });
  }

  autoAssignMasterCatalogForFamily() {
    const sessId = this.activeSessionId();
    const fam = this.locationAssignerFamily();
    if (!sessId || !fam) return;
    this.api.autoAssignMasterCatalog(sessId, fam.id).subscribe({
      next: (res) => {
        this.toast.success(`Se auto-asignaron ${res.modifiedCount} ubicaciones físicas desde el catálogo maestro.`);
        this.loadShelves(sessId);
        this.refreshFamilyCounts();
        setTimeout(() => this.openLocationAssignerForFamily(fam), 300);
      },
      error: (err) => {
        this.toast.error('Error al auto-asignar catálogo maestro: ' + (err.error?.message || err.message));
      }
    });
  }

  exportLocationAssignerCsv(mode: 'TODOS' | 'DEFINIDOS' | 'NO_DEFINIDOS' | 'OBSOLETOS' = 'TODOS') {
    const fam = this.locationAssignerFamily();
    if (!fam) return;
    let rows = this.locationAssignerRows();
    let modeSuffix = 'todos';
    if (mode === 'DEFINIDOS') {
      rows = rows.filter(r => !this.isRowUndefined(r) && !r.isObsolete);
      modeSuffix = 'definidos';
    } else if (mode === 'NO_DEFINIDOS') {
      rows = rows.filter(r => this.isRowUndefined(r));
      modeSuffix = 'no_definidos';
    } else if (mode === 'OBSOLETOS') {
      rows = rows.filter(r => r.isObsolete);
      modeSuffix = 'obsoletos_eliminar';
    }

    if (rows.length === 0) {
      this.toast.warning(`No hay materiales para exportar en el modo seleccionado (${modeSuffix}).`);
      return;
    }

    const lines: string[] = [];
    lines.push('CLAVE_SAE,DESCRIPCION,FAMILIA,UBICACION_FISICA,PLANTA,PASILLO,ANAQUEL,NIVEL,POSICION,STOCK_ACTUAL,MINIMO_SEGURIDAD,PUNTO_REORDEN,MAXIMO_OBJETIVO,CUANTO_PEDIR,ESTATUS_REPOSICION,ESTATUS_DEFINICION');

    for (const r of rows) {
      const defStatus = this.isRowUndefined(r) ? 'NO_DEFINIDO' : (r.isObsolete ? 'OBSOLETO_SAE' : 'DEFINIDO');
      lines.push([
        this.escapeCsv(r.code),
        this.escapeCsv(r.description),
        this.escapeCsv(fam.name),
        this.escapeCsv(r.locationCode),
        this.escapeCsv(r.plant),
        this.escapeCsv(r.aisle),
        this.escapeCsv(r.shelfCode || r.shelfNum),
        this.escapeCsv(r.level),
        this.escapeCsv(r.position),
        r.quantity,
        r.minimoSeguridad,
        r.puntoReorden,
        r.maximoObjetivo,
        r.cuantoPedir,
        this.escapeCsv(r.statusLabel),
        this.escapeCsv(defStatus)
      ].join(','));
    }

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeFam = fam.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    a.href = url;
    a.download = `Interflu_Ubicaciones_${safeFam}_${modeSuffix}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    this.toast.success(`Datos de ${fam.name} (${modeSuffix}: ${rows.length} partidas) exportados a Excel/CSV.`);
  }

  exportFamilyPlanningExcel(fam: SectionStat) {
    if (!fam) return;
    const items = this.familyCounts();
    if (items.length === 0) {
      this.toast.warning('No hay partidas registradas en esta familia.');
      return;
    }

    const lines: string[] = [];
    lines.push('CLAVE_SAE,DESCRIPCION,FAMILIA,UBICACION_FISICA,PLANTA,PASILLO,ANAQUEL,NIVEL,POSICION,STOCK_ACTUAL,MINIMO_SEGURIDAD,PUNTO_REORDEN,MAXIMO_OBJETIVO,CUANTO_PEDIR,ESTATUS_REPOSICION,PROVEEDOR,TIEMPO_ENTREGA_DIAS');

    for (const r of items) {
      const code = (r.capturedCode || '').trim();
      const desc = r.description || code;
      const shelfCode = (r.shelfCode || '').trim();
      const decoded = this.decodeLocation(r.notes || '', r.section, code, shelfCode);

      const plant = decoded.plantCode || 'PB';
      const aisle = decoded.aisleCode || (fam.id === 'ACERO' ? '3' : '1');
      const shelfNum = decoded.shelfCode || (shelfCode ? shelfCode.replace(/^[A-Za-z_-]+/, '') : '1');
      const level = r.section || decoded.levelCode || 'A';
      const position = decoded.positionCode || '1';

      const locationCode = (r.notes && r.notes.trim().length > 0)
        ? r.notes.trim()
        : `${plant}${aisle}-${shelfNum}${level}-${position}`;

      const stockActual = r.quantity || 0;
      const monthlyDemandAvg = Math.max(12, Math.round((stockActual || 25) * 1.25));
      const minimoSeguridad = Math.max(5, Math.round(monthlyDemandAvg * 0.5));
      const puntoReorden = Math.max(10, Math.round(monthlyDemandAvg * 0.833));
      const maximoObjetivo = Math.max(25, Math.round(monthlyDemandAvg * 1.833));
      const packageSize = monthlyDemandAvg > 50 ? 10 : 5;
      const cuantoPedir = stockActual <= puntoReorden ? Math.ceil((maximoObjetivo - stockActual) / packageSize) * packageSize : 0;
      const statusLabel = stockActual <= puntoReorden ? 'Reordenar ahora' : 'Stock optimo';

      lines.push([
        this.escapeCsv(code),
        this.escapeCsv(desc),
        this.escapeCsv(fam.name),
        this.escapeCsv(locationCode),
        this.escapeCsv(plant),
        this.escapeCsv(aisle),
        this.escapeCsv(shelfCode),
        this.escapeCsv(level),
        this.escapeCsv(position),
        stockActual,
        minimoSeguridad,
        puntoReorden,
        maximoObjetivo,
        cuantoPedir,
        this.escapeCsv(statusLabel),
        this.escapeCsv('YPC'),
        10
      ].join(','));
    }

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeFam = fam.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    a.href = url;
    a.download = `Interflu_Planificacion_MinMax_${safeFam}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    this.toast.success(`Planificacion y Min/Max de ${fam.name} exportado a Excel.`);
  }

  openImportSaeForFamily(fam: SectionStat) {
    if (!fam) return;
    const famShelves = this.familyShelves();
    const firstShelfId = famShelves.length > 0 ? famShelves[0].shelfId : 0;
    this.openCroquisImportModal(firstShelfId, fam.id.toLowerCase());
    this.importMode.set('SMART_MERGE');
    this.toast.info(`Importador SAE listo para la seccion ${fam.name}. Selecciona el archivo de Excel o CSV.`);
  }

  exportProductPlanningCsv(plan: ProductPlanningData) {
    if (!plan) return;
    const lines: string[] = [];
    lines.push('FICHA MAESTRA DE MATERIAL Y PLANIFICACION DE REABASTECIMIENTO');
    lines.push('PARAMETRO,VALOR');
    lines.push(`Codigo,${this.escapeCsv(plan.code)}`);
    lines.push(`Descripcion,${this.escapeCsv(plan.description)}`);
    lines.push(`Familia,${this.escapeCsv(plan.category)}`);
    lines.push(`Unidad,${this.escapeCsv(plan.unit)}`);
    lines.push(`Fecha de Corte,${this.escapeCsv(plan.lastMovementDate)}`);
    lines.push(`Codigo de Ubicacion Fisica,${this.escapeCsv(plan.locationCode)}`);
    lines.push(`Planta,${this.escapeCsv(plan.decodedLocation.plant + ' (' + plan.decodedLocation.plantCode + ')')}`);
    lines.push(`Pasillo,${this.escapeCsv(plan.decodedLocation.aisle)}`);
    lines.push(`Estante/Anaquel,${this.escapeCsv(plan.decodedLocation.shelf)}`);
    lines.push(`Nivel,${this.escapeCsv(plan.decodedLocation.level)}`);
    lines.push(`Posicion,${this.escapeCsv(plan.decodedLocation.position)}`);
    lines.push('');
    lines.push('INDICADORES DE INVENTARIO Y REORDEN,VALOR');
    lines.push(`Stock Actual (Existencia fisica),${plan.stockActual}`);
    lines.push(`Minimo de Seguridad,${plan.minimoSeguridad}`);
    lines.push(`Punto de Reorden,${plan.puntoReorden}`);
    lines.push(`Maximo Objetivo,${plan.maximoObjetivo}`);
    lines.push(`Piezas por Recibir,${plan.porRecibir}`);
    lines.push(`Piezas Apartadas,${plan.apartadas}`);
    lines.push(`Stock para Planear,${plan.stockParaPlanear}`);
    lines.push(`Cuanto Pedir Hoy,${plan.cuantoPedir}`);
    lines.push(`Estatus,${this.escapeCsv(plan.statusLabel)}`);
    lines.push('');
    lines.push('PARAMETROS DE COMPRA Y PROVEEDOR,VALOR');
    lines.push(`Proveedor,${this.escapeCsv(plan.supplierName)}`);
    lines.push(`Tiempo de Entrega (Dias),${plan.leadTimeDays}`);
    lines.push(`Pedido Minimo,${plan.minOrder}`);
    lines.push(`Tamano de Paquete,${plan.packageSize}`);
    lines.push(`Ultimo Precio Cotizado MXN,${plan.lastQuotePrice}`);
    lines.push(`Fecha Ultima Cotizacion,${this.escapeCsv(plan.lastQuoteDate)}`);
    lines.push(`Demanda Mensual Promedio,${plan.monthlyDemandAvg}`);

    if (plan.demandHistory && plan.demandHistory.length > 0) {
      lines.push('');
      lines.push('HISTORIAL Y PRONOSTICO DE DEMANDA');
      lines.push('MES,CANTIDAD_PIEZAS,TIPO');
      for (const d of plan.demandHistory) {
        lines.push(`${this.escapeCsv(d.month)},${d.quantity},${this.escapeCsv(d.isEstimated ? 'Estimada' : 'Venta Registrada')}`);
      }
    }

    if (plan.purchaseOrders && plan.purchaseOrders.length > 0) {
      lines.push('');
      lines.push('ORDENES DE COMPRA');
      lines.push('NUM_OC,FECHA_PEDIDO,FECHA_ENTREGA,PEDIDAS,RECIBIDAS,CANCELADAS,PENDIENTES');
      for (const po of plan.purchaseOrders) {
        lines.push(`${this.escapeCsv(po.ocNumber)},${this.escapeCsv(po.orderDate)},${this.escapeCsv(po.expectedDate)},${po.orderedQty},${po.receivedQty},${po.cancelledQty},${po.pendingQty}`);
      }
    }

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeCode = plan.code.replace(/[^a-zA-Z0-9_-]/g, '_');
    a.href = url;
    a.download = `Interflu_Ficha_Planificacion_${safeCode}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    this.toast.success(`Ficha tecnica y planificacion de ${plan.code} exportada.`);
  }

  escapeCsv(val: any): string {
    if (val === undefined || val === null) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  }
}
