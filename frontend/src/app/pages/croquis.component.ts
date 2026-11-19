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
      <div class="floating-cad-palette" *ngIf="editMode() && selectedRackForMove">
        <div class="cad-header">
          <div class="cad-title">
            <span class="cad-dot"></span>
            <strong class="mono">{{ selectedRackForMove.shelfCode }}</strong>
            <span class="cad-zone">({{ selectedRackForMove.shelfZone }})</span>
          </div>
          <button class="cad-close-btn" (click)="selectedRackForMove = null" title="Deseleccionar">✕</button>
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

          <div class="cad-actions-strip">
            <button class="btn btn-sm btn-outline-white" (click)="rotateSelectedRack()" title="Rotar dimensiones 90°">
              ↻ Rotar 90°
            </button>
            <div class="cad-nudge-pad">
              <button class="nudge-btn" (click)="nudgeSelected(0, -1)" title="Subir 1px (Shift: 10px)">▲</button>
              <div class="nudge-mid">
                <button class="nudge-btn" (click)="nudgeSelected(-1, 0)" title="Izquierda 1px (Shift: 10px)">◀</button>
                <button class="nudge-btn" (click)="nudgeSelected(1, 0)" title="Derecha 1px (Shift: 10px)">▶</button>
              </div>
              <button class="nudge-btn" (click)="nudgeSelected(0, 1)" title="Bajar 1px (Shift: 10px)">▼</button>
            </div>
          </div>
          <div class="cad-footer-hint font-xs">
            Arrastra con el mouse o usa flechas (Shift = 10px).
          </div>
        </div>
      </div>

      <!-- Shelf Inspector & Interactive Visual Rack Modal (Secciones A-G) -->
      <div class="modal-backdrop" *ngIf="inspectedShelf && !editMode()" (click)="closeInspectedShelf()">
        <div class="modal-box shelf-inspector-modal" (click)="$event.stopPropagation()">
          <div class="modal-header-row">
            <div>
              <div class="font-xs text-muted uppercase">{{ inspectedShelf.plant || selectedPlant() }} &bull; {{ inspectedShelf.shelfZone }}</div>
              <div class="modal-title-inline">
                <h2 class="mono fw-800 modal-code-title">{{ inspectedShelf.shelfCode }}</h2>
                <span class="badge" [ngClass]="badgeForStatus(inspectedShelf)">
                  {{ statusLabel(inspectedShelf) }}
                </span>
              </div>
              <div class="font-sm text-secondary">{{ inspectedShelf.shelfDescription || inspectedShelf.shelfZone }}</div>
            </div>
            <div class="modal-header-actions-group">
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
              <button class="btn btn-sm btn-outline" (click)="openEditShelf(inspectedShelf)" title="Cambiar nombre, código o zona de este anaquel">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                Editar
              </button>
              <button class="modal-close-icon-btn" (click)="closeInspectedShelf()" title="Cerrar ventana">✕</button>
            </div>
          </div>

          <!-- Interactive Rack Blueprint (Left) + Materials & Quick Level Assigner (Right) -->
          <div class="shelf-inspector-body">
            <!-- Left Pane: Visual Physical Rack Blueprint (A to F) -->
            <div class="rack-blueprint-card">
              <div class="blueprint-card-header">
                <span class="blueprint-kicker">CROQUIS DEL ANAQUEL (A-G)</span>
                <span class="font-xs text-muted">Clic en nivel para filtrar</span>
              </div>

              <!-- Visual Rack Graphic (Matches Official Blueprint) -->
              <div class="physical-rack-graphic">
                <!-- Yellow Top Header with Short Number -->
                <div class="rack-graphic-top-header mono">
                  {{ getRackShortHeader(inspectedShelf) }}
                </div>

                <!-- Main Frame: Mint Left Strip (A-G) + 6 Interactive Horizontal Shelf Tiers -->
                <div class="rack-graphic-main-frame">
                  <div class="rack-levels-sidebar">
                    <button
                      type="button"
                      *ngFor="let lvl of rackLevels"
                      class="rack-level-tag mono"
                      [class.active-level]="selectedLevelFilter() === lvl"
                      (click)="toggleLevelFilter(lvl)"
                      [title]="'Filtrar materiales en Nivel ' + lvl"
                    >
                      {{ lvl }}
                    </button>
                  </div>

                  <div class="rack-tiers-container">
                    <div
                      *ngFor="let lvl of rackLevels"
                      class="rack-tier-row"
                      [class.tier-selected]="selectedLevelFilter() === lvl"
                      [class.tier-populated]="getLevelStats(lvl).count > 0"
                      (click)="toggleLevelFilter(lvl)"
                      [title]="'Ver códigos del Nivel ' + lvl"
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
                            Nivel {{ lvl }} vacío
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
                    *ngFor="let lvl of rackLevels"
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
                            *ngFor="let btnLvl of rackLevels"
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
              *ngFor="let lvl of rackLevels"
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
                    <th class="fam-th-assign text-center">Asignar Nivel (A-G)</th>
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
                          *ngFor="let btnLvl of rackLevels"
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
              <button type="button" class="btn btn-primary" (click)="closeProductPlanning()">Cerrar Ficha</button>
            </div>
          </div>

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
    .cad-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.15);
      padding-bottom: 0.4rem;
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
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
    }
    .cad-input-wrap {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .cad-input-wrap label {
      font-size: 0.65rem;
      color: #94a3b8;
      font-weight: 700;
      text-transform: uppercase;
    }
    .cad-input-wrap input {
      background: #1e293b;
      border: 1px solid #334155;
      color: #38bdf8;
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      font-size: 0.85rem;
      padding: 5px 8px;
      border-radius: 6px;
    }
    .cad-actions-strip {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.5rem;
      padding-top: 0.25rem;
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
      width: 26px;
      height: 22px;
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
    .cad-footer-hint {
      color: #94a3b8;
      font-size: 0.72rem;
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
  savingLayout = signal<boolean>(false);
  isDragging = false;
  dragStartX = 0;
  dragStartY = 0;
  dragInitialX = 0;
  dragInitialY = 0;
  draggedRack: ShelfAssignmentDto | null = null;
  inspectedShelf: ShelfAssignmentDto | null = null;

  // Physical Rack Blueprint & Quick Section Assignment State (Niveles A-G)
  rackLevels: string[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
  inspectedMaterials = signal<CountRecordDto[]>([]);
  loadingMaterials = signal<boolean>(false);
  selectedLevelFilter = signal<string>('TODOS');
  shelfMaterialSearch = signal<string>('');
  updatingRecordId = signal<number | null>(null);

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
      const clamped = Math.max(50, Math.min(130, targetPercent));
      this.zoomLevel.set(clamped);
      try { localStorage.setItem('interflu_croquis_zoom', String(clamped)); } catch (e) {}
      this.toast.info(`Ajustado automáticamente al ancho de la pantalla (${clamped}%)`);
    }
  }

  // Smooth Viewport Panning (Arrastrar para mover vista cuando hay zoom)
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
  }

  @HostListener('window:mousemove', ['$event'])
  onGlobalMouseMove(event: MouseEvent) {
    if (this.isPanning && this.viewportRef) {
      const dx = event.clientX - this.panStartX;
      const dy = event.clientY - this.panStartY;
      this.viewportRef.nativeElement.scrollLeft = this.scrollStartX - dx;
      this.viewportRef.nativeElement.scrollTop = this.scrollStartY - dy;
    }
  }

  @HostListener('window:mouseup')
  onGlobalMouseUp() {
    this.isPanning = false;
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

  assignSectionToMaterial(item: CountRecordDto, section: string) {
    const cleanSec = section.trim().toUpperCase();
    if (cleanSec && !/^[A-G]$/.test(cleanSec)) return;

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

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent) {
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
    } else if (event.key === 'Escape') {
      this.selectedRackForMove = null;
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
    if (cleanSec && !/^[A-G]$/.test(cleanSec)) return;

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

    // 1. Direct Acero Master Catalog lookup by code, shelf, and section
    const aceroMeta = findAceroLocation(code, shelfCode, section);
    if (aceroMeta) {
      return aceroMeta.ubicacion;
    }

    // 2. Notes matching PB\d+-\d+[A-G]-?\d*
    if (item.notes && typeof item.notes === 'string') {
      const match = item.notes.match(/P[BA]\d+-\d+[A-G]-?\d*/i);
      if (match) return match[0].toUpperCase();
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

    // Pattern 1: PB3-1A-1 or PB3-10B-2
    const m1 = loc.match(/^(P[BA])(\d+)-(\d+)([A-G])-?(\d+)?$/);
    if (m1) {
      const plant = m1[1] === 'PB' ? 'Planta Baja' : 'Planta Alta';
      const aisle = `Pasillo ${m1[2]} (Acero)`;
      const shelf = `Estante ${m1[3]} (Anaquel ${m1[3]})`;
      const level = `Nivel ${m1[4]}`;
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

    // Pattern 2: PB-ACE-01 or PB-ACE-01-A
    const m2 = loc.match(/^(P[BA])-([A-Z0-9]+)-(\d+)(?:-([A-G]))?$/);
    if (m2) {
      const plant = m2[1] === 'PB' ? 'Planta Baja' : 'Planta Alta';
      const fam = m2[2];
      const famName = fam.includes('ACE') ? 'Pasillo 3 (Acero)' : (fam.includes('KUR') ? 'Pasillo Kuriyama' : `Pasillo ${fam}`);
      const shelfNum = m2[3].replace(/^0+/, '') || m2[3];
      const shelf = `Estante ${shelfNum} (Anaquel ${shelfNum})`;
      const lvlCode = m2[4] || sec || 'A';
      return {
        plant,
        plantCode: m2[1],
        aisle: famName,
        aisleCode: fam.includes('ACE') ? '3' : fam,
        shelf,
        shelfCode: shelfNum,
        level: `Nivel ${lvlCode}`,
        levelCode: lvlCode,
        position: 'Posición 1',
        positionCode: '1',
        summary: `${m2[1]} = ${plant} · ${fam} = ${famName} · ${shelfNum} = ${shelf} · ${lvlCode} = Nivel ${lvlCode}`
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
}
