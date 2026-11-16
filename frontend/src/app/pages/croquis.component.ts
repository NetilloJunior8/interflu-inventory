import { Component, OnInit, signal, computed, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as QRCode from 'qrcode';
import { ApiService, ShelfAssignmentDto, InventorySessionSummary } from '../services/api.service';
import { ToastService } from '../services/toast.service';

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

      <!-- Shelf Inspector & Detail Modal -->
      <div class="modal-backdrop" *ngIf="inspectedShelf && !editMode()" (click)="inspectedShelf = null">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <div class="modal-header-row">
            <div>
              <div class="font-xs text-muted uppercase">{{ inspectedShelf.plant || selectedPlant() }} &bull; {{ inspectedShelf.shelfZone }}</div>
              <h2 class="mono fw-800 modal-code-title">{{ inspectedShelf.shelfCode }}</h2>
              <div class="font-sm text-secondary">{{ inspectedShelf.shelfDescription || inspectedShelf.shelfZone }}</div>
            </div>
            <div class="modal-header-actions-group">
              <span class="badge" [ngClass]="badgeForStatus(inspectedShelf)">
                {{ statusLabel(inspectedShelf) }}
              </span>
              <button class="btn btn-sm btn-outline" (click)="openEditShelf(inspectedShelf)" title="Cambiar nombre, código o zona de este anaquel">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                Editar
              </button>
              <button class="modal-close-icon-btn" (click)="inspectedShelf = null" title="Cerrar ventana">✕</button>
            </div>
          </div>

          <div class="inspect-stats-grid">
            <div class="i-card">
              <span class="i-lbl">Piezas Físicas</span>
              <span class="i-val mono text-primary-brand">{{ (inspectedShelf.totalPieces || 0) | number:'1.0-2' }}</span>
            </div>
            <div class="i-card">
              <span class="i-lbl">Partidas Contadas</span>
              <span class="i-val mono">{{ inspectedShelf.recordCount || 0 }}</span>
            </div>
            <div class="i-card">
              <span class="i-lbl">Operador Asignado</span>
              <span class="i-val font-sm">{{ inspectedShelf.assignedUserName || 'Por Asignar' }}</span>
            </div>
          </div>

          <div class="modal-actions-list">
            <div class="action-desc">
              <strong class="font-sm">Estado en el Croquis:</strong>
              <span *ngIf="isCompleted(inspectedShelf)" class="text-success font-sm">
                &bull; Contabilizado (Marcado en verde)
              </span>
              <span *ngIf="!isCompleted(inspectedShelf)" class="text-muted font-sm">
                &bull; Pendiente por contar (Estado neutral)
              </span>
            </div>
          </div>

          <div class="modal-footer-advanced">
            <div class="footer-left-group">
              <button class="btn btn-secondary" (click)="inspectedShelf = null">Cerrar</button>
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
      font-size: 0.55rem;
      font-weight: 800;
      line-height: 1;
      margin-bottom: 2px;
      color: #0a2472;
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
}
