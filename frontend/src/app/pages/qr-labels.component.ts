import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import * as QRCode from 'qrcode';
import JSZip from 'jszip';
import { ApiService, InventorySessionSummary, CountRecordDto, ShelfAssignmentDto } from '../services/api.service';
import { ToastService } from '../services/toast.service';

export interface ShelfQrItem {
  shelfId: number;
  code: string;
  zone: string;
  description: string;
  plant: string;
  totalPieces: number;
  recordCount: number;
  status: string;
  qrDataUrl: string;
}

export interface MaterialQrItem {
  id: number;
  code: string;
  description: string;
  unit: string;
  shelf: string;
  shelfZone?: string;
  plant?: string;
  pieces: number;
  countedBy?: string;
  countedAt?: string;
  qrDataUrl: string;
}

@Component({
  selector: 'app-qr-labels',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-container">
      <!-- Main Tab Switcher: Rótulos de Anaqueles vs Etiquetas de Materiales -->
      <div class="tabs-main-bar no-print">
        <button
          type="button"
          class="tab-main-btn"
          [class.active]="activeTab() === 'SHELVES'"
          (click)="activeTab.set('SHELVES')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
            <path d="M3 9h18"></path>
            <path d="M9 21V9"></path>
          </svg>
          <span>Rótulos QR de Anaqueles (171 Físicos)</span>
          <span class="tab-badge">{{ filteredShelfLabels().length }}</span>
        </button>

        <button
          type="button"
          class="tab-main-btn"
          [class.active]="activeTab() === 'MATERIALS'"
          (click)="activeTab.set('MATERIALS')"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          <span>Etiquetas QR por Refacción</span>
          <span class="tab-badge">{{ filteredMaterialLabels().length }}</span>
        </button>
      </div>

      <!-- ==================================================== -->
      <!-- TAB 1: RÓTULOS QR DE ANAQUELES (PARA PEGAR EN RACKS) -->
      <!-- ==================================================== -->
      <ng-container *ngIf="activeTab() === 'SHELVES'">
        <!-- Page Header -->
        <div class="page-header no-print">
          <div class="header-titles">
            <div class="header-badges">
              <span class="badge badge-brand">Rotulación Oficial de Anaqueles Físicos</span>
              <span class="badge badge-neutral">
                {{ filteredShelfLabels().length }} Anaqueles Mostrados
              </span>
              <span class="badge badge-success" *ngIf="session() as s">
                Folio: {{ s.folio }}
              </span>
              <span class="badge badge-info" *ngIf="shelfPlantFilter !== 'ALL'">
                Planta: {{ shelfPlantFilter }}
              </span>
            </div>
            <h1 class="page-title">Centro de Rótulos y Códigos QR por Anaquel</h1>
            <p class="page-subtitle">
              Generación de códigos QR oficiales para rotular los 171 anaqueles físicos del almacén (87 Planta Baja y 84 Planta Alta).
              Puedes descargar la pura imagen PNG con el código del anaquel (ej. <strong>PB-ACE-05.png</strong>) para pegarla directamente a los anaqueles, o descargar el paquete completo en ZIP.
            </p>
          </div>

          <div class="header-actions">
            <!-- Bulk ZIP Download Button for Shelves -->
            <button
              class="btn btn-zip"
              (click)="downloadAllShelvesAsZip()"
              [disabled]="isZipping() || filteredShelfLabels().length === 0"
              title="Descargar todos los códigos QR de anaqueles en un archivo ZIP con nombres individuales como PB-ACE-05.png"
            >
              <svg *ngIf="!isZipping()" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span *ngIf="isZipping()" class="spinner-sm"></span>
              <span>{{ isZipping() ? 'Generando ZIP...' : 'Descargar ZIP Anaqueles (' + filteredShelfLabels().length + ')' }}</span>
            </button>

            <!-- Print Batch Button -->
            <button
              class="btn btn-primary"
              (click)="printBatch()"
              [disabled]="filteredShelfLabels().length === 0"
              title="Imprimir hojas de rótulos adhesivos para anaqueles"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              <span>Imprimir Rótulos</span>
            </button>
          </div>
        </div>

        <!-- Shelf Filters Bar -->
        <div class="card no-print filter-card">
          <div class="filter-flex-container">
            <!-- 1. Session Picker -->
            <div class="filter-item">
              <label class="filter-label">Inventario Activo:</label>
              <select
                class="select select-sm session-select"
                [ngModel]="selectedSessionId()"
                (ngModelChange)="onSessionChange($event)"
              >
                <option *ngFor="let s of sessions()" [value]="s.id">
                  {{ s.folio }} — {{ s.title }}
                </option>
              </select>
            </div>

            <!-- 2. Plant Filter -->
            <div class="filter-item">
              <label class="filter-label">Nivel de Planta:</label>
              <div class="pill-group">
                <button
                  type="button"
                  class="pill-btn"
                  [class.active]="shelfPlantFilter === 'ALL'"
                  (click)="shelfPlantFilter = 'ALL'"
                >
                  Todas ({{ shelfLabels().length }})
                </button>
                <button
                  type="button"
                  class="pill-btn"
                  [class.active]="shelfPlantFilter === 'Planta Baja'"
                  (click)="shelfPlantFilter = 'Planta Baja'"
                >
                  Planta Baja ({{ countShelvesByPlant('Planta Baja') }})
                </button>
                <button
                  type="button"
                  class="pill-btn"
                  [class.active]="shelfPlantFilter === 'Planta Alta'"
                  (click)="shelfPlantFilter = 'Planta Alta'"
                >
                  Planta Alta ({{ countShelvesByPlant('Planta Alta') }})
                </button>
              </div>
            </div>

            <!-- 3. Zone / Sector Filter -->
            <div class="filter-item">
              <label class="filter-label">Zona / Sector:</label>
              <select
                class="select select-sm shelf-select"
                [(ngModel)]="shelfZoneFilter"
              >
                <option value="ALL">-- Todas las Zonas ({{ availableShelfZones().length }}) --</option>
                <option *ngFor="let z of availableShelfZones()" [value]="z">{{ z }}</option>
              </select>
            </div>

            <!-- 4. Search Box for Shelves -->
            <div class="filter-item search-grow">
              <label class="filter-label">Buscar Anaquel:</label>
              <div class="search-box">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  class="search-input"
                  [(ngModel)]="shelfSearchTerm"
                  placeholder="Buscar por código (ej. PB-ACE-05, PA-SEL) o descripción..."
                />
                <button *ngIf="shelfSearchTerm" class="clear-btn" (click)="shelfSearchTerm = ''">✕</button>
              </div>
            </div>
          </div>

          <!-- Footer inside Filter Card -->
          <div class="filter-footer-bar">
            <div class="status-summary">
              Mostrando <strong>{{ filteredShelfLabels().length }}</strong> de <strong>{{ shelfLabels().length }}</strong> anaqueles físicos.
              <span *ngIf="shelfPlantFilter !== 'ALL'" class="tag-filter-active">
                {{ shelfPlantFilter }}
                <button class="tag-close-btn" (click)="shelfPlantFilter = 'ALL'">✕</button>
              </span>
              <span *ngIf="shelfZoneFilter !== 'ALL'" class="tag-filter-active">
                Zona: {{ shelfZoneFilter }}
                <button class="tag-close-btn" (click)="shelfZoneFilter = 'ALL'">✕</button>
              </span>
            </div>
            <button
              class="btn btn-ghost btn-xs"
              *ngIf="shelfSearchTerm || shelfPlantFilter !== 'ALL' || shelfZoneFilter !== 'ALL'"
              (click)="resetShelfFilters()"
            >
              Limpiar Filtros
            </button>
          </div>
        </div>

        <!-- Loading State -->
        <div class="card loading-card" *ngIf="loadingShelves()">
          <div class="spinner"></div>
          <p>Generando códigos QR oficiales de anaqueles en alta resolución...</p>
        </div>

        <!-- Grid of Shelf QR Labels -->
        <div *ngIf="!loadingShelves()">
          <div class="labels-grid print-sheet" *ngIf="filteredShelfLabels().length > 0">
            <div class="label-card shelf-qr-card" *ngFor="let item of filteredShelfLabels()">
              <div class="label-inner">
                <!-- Label Header -->
                <div class="label-header">
                  <div class="brand-group">
                    <img src="/logo_interflu_official.png" alt="Interflu" class="label-logo" />
                    <span class="label-brand">INTERFLU INVENTORY</span>
                  </div>
                  <div class="header-tags">
                    <span class="plant-pill" [class.plant-pb]="item.plant === 'Planta Baja'" [class.plant-pa]="item.plant === 'Planta Alta'">
                      {{ item.plant === 'Planta Baja' ? 'PB' : 'PA' }}
                    </span>
                    <span class="badge badge-unit mono">{{ item.plant || 'Almacén' }}</span>
                  </div>
                </div>

                <!-- Label Body (Designed for physical rack stickers) -->
                <div class="label-body shelf-label-body">
                  <div class="qr-col shelf-qr-col">
                    <img *ngIf="item.qrDataUrl" [src]="item.qrDataUrl" [alt]="item.code" class="qr-img shelf-qr-img" />
                    <span class="qr-scan-hint no-print">Escanear para abrir cédula</span>
                  </div>
                  <div class="info-col shelf-info-col">
                    <div class="shelf-label-zone">{{ item.zone || 'Almacén General' }}</div>
                    <div class="mono shelf-card-code">{{ item.code }}</div>
                    <div class="shelf-card-desc" *ngIf="item.description">{{ item.description }}</div>
                    
                    <div class="shelf-status-row">
                      <span class="badge" [ngClass]="shelfStatusClass(item.status)">
                        {{ item.status }}
                      </span>
                      <span class="shelf-metric-pill mono" *ngIf="item.totalPieces > 0">
                        {{ item.totalPieces | number:'1.0-2' }} pzas
                      </span>
                      <span class="shelf-metric-pill mono" *ngIf="item.recordCount > 0">
                        {{ item.recordCount }} partidas
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Label Footer (Screen Only Actions) -->
                <div class="label-footer no-print">
                  <button class="btn btn-primary btn-xs" (click)="downloadSingleShelfQr(item)" title="Descargar la pura imagen PNG con el nombre del anaquel para imprimir o pegar">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>Descargar {{ item.code }}.png</span>
                  </button>

                  <a routerLink="/capture" [queryParams]="{ sessionId: selectedSessionId(), shelfId: item.shelfId }" class="btn btn-ghost btn-xs" title="Abrir cédula de conteo de este anaquel">
                    Cédula &rarr;
                  </a>

                  <button class="btn btn-ghost btn-xs" (click)="openEditShelfModal(item)" title="Cambiar nombre, código o zona de este anaquel">
                    Editar
                  </button>

                  <button
                    *ngIf="item.totalPieces > 0 || item.recordCount > 0"
                    class="btn btn-ghost btn-xs text-danger"
                    (click)="openClearShelfCountsModal(item)"
                    title="Eliminar conteos únicamente de este anaquel"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div class="empty-state card no-print" *ngIf="filteredShelfLabels().length === 0">
            <div class="empty-icon-wrap">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                <path d="M3 9h18"></path>
                <path d="M9 21V9"></path>
              </svg>
            </div>
            <h3 class="empty-title">No se encontraron anaqueles</h3>
            <p class="empty-desc">
              No hay anaqueles que coincidan con los filtros seleccionados (Planta: {{ shelfPlantFilter }}, Zona: {{ shelfZoneFilter }}, Búsqueda: "{{ shelfSearchTerm }}").
            </p>
            <button class="btn btn-secondary btn-sm" (click)="resetShelfFilters()">
              Restablecer Filtros de Anaqueles
            </button>
          </div>
        </div>
      </ng-container>

      <!-- ==================================================== -->
      <!-- TAB 2: ETIQUETAS QR POR MATERIAL (REFACCIONES)       -->
      <!-- ==================================================== -->
      <ng-container *ngIf="activeTab() === 'MATERIALS'">
        <!-- Page Header -->
        <div class="page-header no-print">
          <div class="header-titles">
            <div class="header-badges">
              <span class="badge badge-brand">Rotulación de Materiales y Refacciones</span>
              <span class="badge badge-neutral">
                {{ filteredMaterialLabels().length }} Códigos QR Listos
              </span>
              <span class="badge badge-success" *ngIf="session() as s">
                Folio: {{ s.folio }}
              </span>
              <span class="badge badge-info" *ngIf="selectedShelfFilter !== 'ALL'">
                Anaquel: {{ selectedShelfFilter }}
              </span>
            </div>
            <h1 class="page-title">Centro de Etiquetas y Códigos QR por Material</h1>
            <p class="page-subtitle">
              Generación oficial de etiquetas QR para refacciones y partidas contabilizadas en cada anaquel.
              Si un anaquel contiene 55 códigos diferentes, se generan sus 55 códigos QR para impresión o descarga masiva en ZIP.
            </p>
          </div>

          <div class="header-actions">
            <!-- Bulk ZIP Download Button -->
            <button
              class="btn btn-zip"
              (click)="downloadAllAsZip()"
              [disabled]="isZipping() || filteredMaterialLabels().length === 0"
              title="Descargar todos los códigos QR mostrados en un archivo ZIP comprimido"
            >
              <svg *ngIf="!isZipping()" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span *ngIf="isZipping()" class="spinner-sm"></span>
              <span>{{ isZipping() ? 'Generando ZIP...' : 'Descargar ZIP (' + filteredMaterialLabels().length + ')' }}</span>
            </button>

            <!-- Print Batch Button -->
            <button
              class="btn btn-primary"
              (click)="printBatch()"
              [disabled]="filteredMaterialLabels().length === 0"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              <span>Imprimir Hoja de Etiquetas</span>
            </button>
          </div>
        </div>

        <!-- Filters Bar -->
        <div class="card no-print filter-card">
          <div class="filter-flex-container">
            <!-- 1. Session Picker -->
            <div class="filter-item">
              <label class="filter-label">Inventario Activo:</label>
              <select
                class="select select-sm session-select"
                [ngModel]="selectedSessionId()"
                (ngModelChange)="onSessionChange($event)"
              >
                <option *ngFor="let s of sessions()" [value]="s.id">
                  {{ s.folio }} — {{ s.title }}
                </option>
              </select>
            </div>

            <!-- 2. Shelf Filter for Materials (Por Anaquel Contabilizado) -->
            <div class="filter-item">
              <label class="filter-label">Filtrar por Anaquel Específico:</label>
              <select
                class="select select-sm shelf-select"
                [(ngModel)]="selectedShelfFilter"
              >
                <option value="ALL">-- Todos los Anaqueles ({{ availableCountedShelves().length }} con conteos) --</option>
                <option *ngFor="let sh of availableCountedShelves()" [value]="sh.code">
                  {{ sh.code }} &bull; {{ sh.zone }} ({{ sh.count }} partidas)
                </option>
              </select>
            </div>

            <!-- 3. Plant Filter (Planta Baja / Planta Alta) -->
            <div class="filter-item" *ngIf="availableCountedShelves().length > 0">
              <label class="filter-label">Nivel de Planta:</label>
              <div class="pill-group">
                <button
                  type="button"
                  class="pill-btn"
                  [class.active]="selectedPlantFilter === 'ALL'"
                  (click)="selectedPlantFilter = 'ALL'"
                >
                  Todas
                </button>
                <button
                  type="button"
                  class="pill-btn"
                  [class.active]="selectedPlantFilter === 'Planta Baja'"
                  (click)="selectedPlantFilter = 'Planta Baja'"
                >
                  Planta Baja
                </button>
                <button
                  type="button"
                  class="pill-btn"
                  [class.active]="selectedPlantFilter === 'Planta Alta'"
                  (click)="selectedPlantFilter = 'Planta Alta'"
                >
                  Planta Alta
                </button>
              </div>
            </div>

            <!-- 4. Search Box for Materials -->
            <div class="filter-item search-grow">
              <label class="filter-label">Búsqueda de Refacción:</label>
              <div class="search-box">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="search-icon">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  class="search-input"
                  [(ngModel)]="searchTerm"
                  placeholder="Buscar por código de refacción (ej. C90N80) o descripción..."
                />
                <button *ngIf="searchTerm" class="clear-btn" (click)="searchTerm = ''">✕</button>
              </div>
            </div>
          </div>

          <!-- Footer inside Filter Card -->
          <div class="filter-footer-bar" *ngIf="rawCountRecords().length > 0">
            <div class="status-summary">
              Mostrando <strong>{{ filteredMaterialLabels().length }}</strong> etiquetas QR de refacciones listas.
              <span *ngIf="selectedShelfFilter !== 'ALL'" class="tag-filter-active">
                Anaquel: {{ selectedShelfFilter }}
                <button class="tag-close-btn" (click)="selectedShelfFilter = 'ALL'">✕</button>
              </span>
            </div>
            <button
              class="btn btn-ghost btn-xs"
              *ngIf="searchTerm || selectedShelfFilter !== 'ALL' || selectedPlantFilter !== 'ALL'"
              (click)="resetFilters()"
            >
              Limpiar Filtros
            </button>
          </div>
        </div>

        <!-- Loading State -->
        <div class="card loading-card" *ngIf="loading()">
          <div class="spinner"></div>
          <p>Generando códigos QR oficiales en alta resolución para cada refacción...</p>
        </div>

        <!-- Grid of Material QR Labels -->
        <div *ngIf="!loading()">
          <div class="labels-grid print-sheet" *ngIf="filteredMaterialLabels().length > 0">
            <div class="label-card material-card" *ngFor="let item of filteredMaterialLabels()">
              <div class="label-inner">
                <!-- Label Header -->
                <div class="label-header">
                  <div class="brand-group">
                    <img src="/logo_interflu_official.png" alt="Interflu" class="label-logo" />
                    <span class="label-brand">INTERFLU</span>
                  </div>
                  <div class="header-tags">
                    <span class="plant-pill" [class.plant-pb]="item.plant === 'Planta Baja'" [class.plant-pa]="item.plant === 'Planta Alta'">
                      {{ item.plant === 'Planta Baja' ? 'PB' : 'PA' }}
                    </span>
                    <span class="badge badge-unit mono">{{ item.unit || 'PZA' }}</span>
                  </div>
                </div>

                <!-- Label Body -->
                <div class="label-body">
                  <div class="qr-col">
                    <img *ngIf="item.qrDataUrl" [src]="item.qrDataUrl" [alt]="item.code" class="qr-img" />
                  </div>
                  <div class="info-col">
                    <div class="mono material-code" [title]="item.code">{{ item.code }}</div>
                    <div class="material-desc" [title]="item.description">{{ item.description }}</div>
                    
                    <div class="material-shelf-box">
                      <span class="shelf-tag mono">{{ item.shelf }}</span>
                      <span class="shelf-zone-sub" *ngIf="item.shelfZone">{{ item.shelfZone }}</span>
                    </div>

                    <div class="material-qty-box">
                      <span class="qty-label">CANT:</span>
                      <span class="qty-val mono">{{ item.pieces }} {{ item.unit }}</span>
                    </div>
                  </div>
                </div>

                <!-- Label Footer (Screen Only) -->
                <div class="label-footer no-print">
                  <button class="btn btn-ghost btn-xs" (click)="downloadSingleQr(item)" title="Descargar PNG">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    PNG
                  </button>
                  <button class="btn btn-ghost btn-xs" (click)="filterByThisShelf(item.shelf)" title="Aislar este anaquel">
                    Ver Anaquel
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty State (When no count records exist yet) -->
          <div class="empty-state card no-print" *ngIf="filteredMaterialLabels().length === 0">
            <div class="empty-icon-wrap">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"></rect>
                <path d="M7 7h3v3H7z"></path>
                <path d="M14 7h3v3h-3z"></path>
                <path d="M7 14h3v3H7z"></path>
                <path d="M14 14h.01"></path>
                <path d="M17 14h.01"></path>
                <path d="M14 17h.01"></path>
                <path d="M17 17h.01"></path>
              </svg>
            </div>
            <h3 class="empty-title">Sin refacciones contabilizadas todavía</h3>
            <p class="empty-desc" *ngIf="rawCountRecords().length === 0">
              Los códigos QR se generan automáticamente para cada <strong>refacción física</strong> registrada en los anaqueles.
              Conforme realices conteos en la <strong>Cédula de Conteo</strong> o importes un archivo Excel, aquí aparecerán de inmediato los códigos QR de cada partida.
            </p>
            <p class="empty-desc" *ngIf="rawCountRecords().length > 0">
              No se encontraron refacciones con el filtro seleccionado (<strong>{{ selectedShelfFilter !== 'ALL' ? 'Anaquel ' + selectedShelfFilter : searchTerm }}</strong>).
            </p>

            <div class="empty-actions" *ngIf="rawCountRecords().length === 0">
              <a routerLink="/capture" class="btn btn-primary">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                Ir a Cédula de Conteo
              </a>
              <a routerLink="/dashboard" class="btn btn-secondary">
                Importar Conteos Excel
              </a>
            </div>

            <button class="btn btn-secondary btn-sm" *ngIf="rawCountRecords().length > 0" (click)="resetFilters()">
              Restablecer Filtros
            </button>
          </div>
        </div>
      </ng-container>

      <!-- Modal: Edit Shelf Details -->
      <div class="modal-backdrop no-print" *ngIf="editingShelf" (click)="editingShelf = null">
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
      <div class="modal-backdrop no-print" *ngIf="shelfToClearCounts" (click)="shelfToClearCounts = null">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <h3 class="modal-title text-danger">Limpiar Conteos del Anaquel</h3>
          <p class="modal-desc">
            ¿Deseas eliminar todas las partidas contabilizadas en el anaquel <strong class="mono">{{ shelfToClearCounts.code }}</strong>?
          </p>
          <div class="delete-warning-box">
            <strong>Restablecimiento individual:</strong>
            <ul style="margin: 6px 0 0 16px; padding: 0;">
              <li>Se eliminarán las {{ shelfToClearCounts.recordCount }} partidas contadas ({{ shelfToClearCounts.totalPieces | number:'1.0-2' }} piezas) de este anaquel.</li>
              <li>El anaquel regresará a estado <strong>PENDIENTE</strong> con 0 piezas en el croquis y en el inventario.</li>
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
    .page-container {
      max-width: 1540px;
      margin: 0 auto;
      padding: 0 4px;
    }

    /* Tab Switcher Bar */
    .tabs-main-bar {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 8px;
    }
    .tab-main-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      border-radius: 8px;
      font-size: 13.5px;
      font-weight: 700;
      color: #475569;
      cursor: pointer;
      transition: all 0.16s ease;
    }
    .tab-main-btn:hover {
      background: #f8fafc;
      color: #0f172a;
    }
    .tab-main-btn.active {
      background: #0a2472;
      color: #ffffff;
      border-color: #0a2472;
      box-shadow: 0 4px 12px rgba(10, 36, 114, 0.2);
    }
    .tab-badge {
      background: rgba(255, 255, 255, 0.25);
      padding: 2px 7px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 800;
    }
    .tab-main-btn:not(.active) .tab-badge {
      background: #e2e8f0;
      color: #334155;
    }

    /* Page Header */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .header-badges {
      display: flex;
      gap: 6px;
      margin-bottom: 6px;
      flex-wrap: wrap;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 700;
      border-radius: 4px;
    }
    .badge-brand { background: #e0f2fe; color: #0369a1; }
    .badge-neutral { background: #f1f5f9; color: #475569; }
    .badge-success { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
    .badge-warning { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
    .badge-danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .badge-info { background: #f0f9ff; color: #0284c7; border: 1px solid #bae6fd; }

    .page-title {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
      letter-spacing: -0.02em;
    }
    .page-subtitle {
      margin: 0;
      color: #64748b;
      font-size: 13.5px;
      max-width: 860px;
      line-height: 1.45;
    }

    .header-actions {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-wrap: wrap;
    }

    .btn-zip {
      background: #0f172a;
      color: #ffffff;
      border: 1px solid #1e293b;
    }
    .btn-zip:hover:not(:disabled) {
      background: #1e293b;
      color: #ffffff;
    }
    .spinner-sm {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    /* Filter Controls Card */
    .filter-card {
      margin-bottom: 20px;
      padding: 14px 18px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
      border-radius: 10px;
    }
    .filter-flex-container {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      align-items: flex-end;
    }
    .filter-item {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .filter-label {
      font-size: 11.5px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    /* Selects */
    .session-select { width: 230px; }
    .shelf-select { width: 240px; }

    /* Pill Group */
    .pill-group {
      display: inline-flex;
      background: #f8fafc;
      padding: 3px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      gap: 2px;
    }
    .pill-btn {
      border: none;
      background: transparent;
      padding: 5px 10px;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }
    .pill-btn:hover { color: #0f172a; }
    .pill-btn.active {
      background: #0284c7;
      color: #ffffff;
      font-weight: 700;
    }

    /* Search Box */
    .search-grow {
      flex: 1;
      min-width: 240px;
    }
    .search-box {
      display: flex;
      align-items: center;
      position: relative;
    }
    .search-icon {
      position: absolute;
      left: 10px;
      color: #94a3b8;
      pointer-events: none;
    }
    .search-input {
      width: 100%;
      height: 36px;
      padding: 0 32px 0 32px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 13px;
      background: #ffffff;
      transition: border-color 0.15s ease;
    }
    .search-input:focus {
      outline: none;
      border-color: #0284c7;
      box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
    }
    .clear-btn {
      position: absolute;
      right: 8px;
      background: transparent;
      border: none;
      color: #94a3b8;
      cursor: pointer;
      font-size: 12px;
      padding: 4px;
    }

    /* Footer Bar inside Filter Card */
    .filter-footer-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid #f1f5f9;
      font-size: 12.5px;
      color: #64748b;
    }
    .status-summary {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tag-filter-active {
      background: #e0f2fe;
      color: #0369a1;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .tag-close-btn {
      background: transparent;
      border: none;
      color: #0369a1;
      cursor: pointer;
      font-size: 11px;
      padding: 0;
    }

    /* Grid layout */
    .labels-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    /* Label Card Common */
    .label-card {
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
      transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .label-card:hover {
      border-color: #0284c7;
      box-shadow: 0 6px 16px rgba(15, 23, 42, 0.1);
      transform: translateY(-2px);
    }
    .label-inner {
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* Label Header */
    .label-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #f1f5f9;
      padding-bottom: 8px;
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .label-logo {
      height: 18px;
      width: auto;
    }
    .label-brand {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: #0a2472;
    }
    .header-tags {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .plant-pill {
      font-size: 10.5px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .plant-pb { background: #dbeafe; color: #1e40af; }
    .plant-pa { background: #ede9fe; color: #6d28d9; }
    .badge-unit {
      background: #f1f5f9;
      color: #334155;
      font-size: 10.5px;
      padding: 2px 6px;
    }

    /* Shelf Specific Body Layout */
    .shelf-label-body {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .shelf-qr-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }
    .shelf-qr-img {
      width: 110px;
      height: 110px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 3px;
      background: #ffffff;
    }
    .qr-scan-hint {
      font-size: 9.5px;
      color: #94a3b8;
      text-align: center;
    }
    .shelf-info-col {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .shelf-label-zone {
      font-size: 11.5px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .shelf-card-code {
      font-size: 20px;
      font-weight: 800;
      color: #0a2472;
      letter-spacing: -0.02em;
      word-break: break-all;
    }
    .shelf-card-desc {
      font-size: 12px;
      color: #475569;
      line-height: 1.3;
    }
    .shelf-status-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
      flex-wrap: wrap;
    }
    .shelf-metric-pill {
      font-size: 11px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      color: #334155;
    }

    /* Material Label Body */
    .label-body {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .qr-col { flex-shrink: 0; }
    .qr-img {
      width: 90px;
      height: 90px;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      background: #ffffff;
      padding: 2px;
    }
    .info-col {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .material-code {
      font-size: 15px;
      font-weight: 800;
      color: #0a2472;
      word-break: break-all;
    }
    .material-desc {
      font-size: 12px;
      color: #334155;
      line-height: 1.25;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .material-shelf-box {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 2px;
    }
    .shelf-tag {
      background: #0f172a;
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .shelf-zone-sub {
      font-size: 11px;
      color: #64748b;
    }
    .material-qty-box {
      display: flex;
      align-items: baseline;
      gap: 4px;
      margin-top: 2px;
    }
    .qty-label { font-size: 10px; font-weight: 700; color: #64748b; }
    .qty-val { font-size: 13px; font-weight: 800; color: #059669; }

    /* Label Footer */
    .label-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 8px;
      border-top: 1px solid #f1f5f9;
      gap: 6px;
      flex-wrap: wrap;
    }

    /* Modals & Warning Box */
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(15, 23, 42, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(2px);
    }
    .modal-box {
      background: #ffffff;
      border-radius: 12px;
      padding: 24px;
      max-width: 520px;
      width: 90%;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
    }
    .modal-title { font-size: 18px; font-weight: 800; color: #0f172a; }
    .modal-desc { font-size: 13px; color: #64748b; margin: 4px 0 14px 0; }
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
    .modal-footer { display: flex; justify-content: flex-end; gap: 10px; }
    .modal-close-icon-btn {
      background: transparent;
      border: none;
      font-size: 16px;
      color: #94a3b8;
      cursor: pointer;
    }

    /* Empty and Loading Cards */
    .empty-state {
      text-align: center;
      padding: 40px 24px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      max-width: 720px;
      margin: 20px auto;
    }
    .empty-icon-wrap {
      width: 72px;
      height: 72px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 6px;
    }
    .empty-title { font-size: 18px; font-weight: 700; color: #0f172a; margin: 0; }
    .empty-desc { font-size: 13.5px; color: #64748b; line-height: 1.5; margin: 0; max-width: 580px; }
    .empty-actions { display: flex; gap: 10px; margin-top: 8px; flex-wrap: wrap; justify-content: center; }

    .loading-card {
      text-align: center;
      padding: 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      color: #475569;
    }
    .spinner {
      width: 28px;
      height: 28px;
      border: 3px solid #cbd5e1;
      border-top-color: #0284c7;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Print Specific Styles */
    @media print {
      .no-print { display: none !important; }
      .page-container { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
      .labels-grid {
        display: grid !important;
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 8mm !important;
        padding: 4mm !important;
      }
      .label-card {
        border: 1.5px solid #000000 !important;
        box-shadow: none !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        padding: 8px !important;
      }
      .qr-img { width: 85px !important; height: 85px !important; }
      .shelf-qr-img { width: 105px !important; height: 105px !important; }
      body { background: #ffffff !important; }
    }
  `]
})
export class QrLabelsComponent implements OnInit {
  activeTab = signal<'SHELVES' | 'MATERIALS'>('SHELVES');

  selectedSessionId = signal<number>(0);
  sessions = signal<InventorySessionSummary[]>([]);
  session = signal<InventorySessionSummary | null>(null);

  // Shelf QR Models & Filtering
  shelfLabels = signal<ShelfQrItem[]>([]);
  loadingShelves = signal(false);
  shelfPlantFilter: 'ALL' | 'Planta Baja' | 'Planta Alta' = 'ALL';
  shelfZoneFilter = 'ALL';
  shelfSearchTerm = '';

  // Material QR Models & Filtering
  rawCountRecords = signal<CountRecordDto[]>([]);
  materialLabels = signal<MaterialQrItem[]>([]);
  loading = signal(false);
  selectedShelfFilter = 'ALL';
  selectedPlantFilter: 'ALL' | 'Planta Baja' | 'Planta Alta' = 'ALL';
  searchTerm = '';

  // Common Async Flags
  isZipping = signal(false);

  // Edit Shelf Modal State
  editingShelf: { id: number; code: string; zone: string; description: string; plant: string } | null = null;
  savingShelf = signal(false);

  // Clear Single Shelf Counts Modal State
  shelfToClearCounts: ShelfQrItem | null = null;
  clearingShelfCounts = signal(false);

  // Available Zones across shelves
  availableShelfZones = computed(() => {
    const zones = new Set<string>();
    for (const sh of this.shelfLabels()) {
      if (sh.zone) zones.add(sh.zone);
    }
    return Array.from(zones).sort();
  });

  // Filtered Shelf Labels
  filteredShelfLabels = computed(() => {
    let list = this.shelfLabels();

    if (this.shelfPlantFilter !== 'ALL') {
      list = list.filter(sh => sh.plant === this.shelfPlantFilter);
    }

    if (this.shelfZoneFilter !== 'ALL') {
      list = list.filter(sh => sh.zone === this.shelfZoneFilter);
    }

    const q = this.shelfSearchTerm.trim().toUpperCase();
    if (q) {
      list = list.filter(sh =>
        sh.code.toUpperCase().includes(q) ||
        (sh.zone || '').toUpperCase().includes(q) ||
        (sh.description || '').toUpperCase().includes(q)
      );
    }

    return list;
  });

  // Available Counted Shelves for Material Tab
  availableCountedShelves = computed(() => {
    const shelfMap = new Map<string, { code: string; zone: string; plant: string; count: number }>();
    for (const r of this.rawCountRecords()) {
      const code = r.shelfCode || 'SIN_UBIC';
      const zone = r.shelfZone || 'General';
      const plant = code.startsWith('PA-') ? 'Planta Alta' : 'Planta Baja';

      if (!shelfMap.has(code)) {
        shelfMap.set(code, { code, zone, plant, count: 0 });
      }
      shelfMap.get(code)!.count++;
    }
    return Array.from(shelfMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  });

  filteredMaterialLabels = computed(() => {
    let list = this.materialLabels();

    if (this.selectedShelfFilter !== 'ALL') {
      list = list.filter(m => m.shelf === this.selectedShelfFilter);
    }

    if (this.selectedPlantFilter !== 'ALL') {
      list = list.filter(m => m.plant === this.selectedPlantFilter);
    }

    const q = this.searchTerm.trim().toUpperCase();
    if (q) {
      list = list.filter(m =>
        m.code.toUpperCase().includes(q) ||
        m.description.toUpperCase().includes(q) ||
        m.shelf.toUpperCase().includes(q)
      );
    }

    return list;
  });

  constructor(
    private api: ApiService,
    private toast: ToastService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.loadSessions();
  }

  loadSessions() {
    this.api.getSessions().subscribe({
      next: (sessions) => {
        this.sessions.set(sessions);
        const querySessionId = Number(this.route.snapshot.queryParamMap.get('sessionId'));
        const queryShelfCode = this.route.snapshot.queryParamMap.get('shelfCode');
        const savedId = Number(localStorage.getItem('interflu_active_session'));
        const activeId = querySessionId || savedId || sessions[0]?.id || 0;

        if (queryShelfCode) {
          this.selectedShelfFilter = queryShelfCode;
          this.shelfSearchTerm = queryShelfCode;
        }

        if (activeId) {
          this.onSessionChange(activeId);
        } else {
          this.loadAllShelvesWithoutSession();
        }
      },
      error: (err) => this.toast.error('Error al cargar inventarios: ' + (err.error?.message || err.message))
    });
  }

  onSessionChange(id: number) {
    const numId = Number(id);
    this.selectedSessionId.set(numId);
    localStorage.setItem('interflu_active_session', String(numId));
    const s = this.sessions().find(x => x.id === numId) || null;
    this.session.set(s);
    this.loadShelfQrs(numId);
    this.loadMaterialCounts(numId);
  }

  loadShelfQrs(sessionId: number) {
    this.loadingShelves.set(true);
    this.api.getSessionShelves(sessionId).subscribe({
      next: async (shelves) => {
        const items: ShelfQrItem[] = [];
        for (const sh of shelves) {
          // Direct scan capture URL for mobile operator
          const targetUrl = `${window.location.origin}/capture?sessionId=${sessionId}&shelfId=${sh.shelfId}`;
          let qrDataUrl = '';
          try {
            qrDataUrl = await QRCode.toDataURL(targetUrl, {
              width: 600,
              margin: 2,
              errorCorrectionLevel: 'H',
              color: { dark: '#0a2472', light: '#ffffff' }
            });
          } catch (e) {
            console.error('Error creating shelf QR for', sh.shelfCode, e);
          }

          items.push({
            shelfId: sh.shelfId,
            code: sh.shelfCode,
            zone: sh.shelfZone || 'General',
            description: sh.shelfDescription || '',
            plant: sh.plant || (sh.shelfCode.startsWith('PA-') ? 'Planta Alta' : 'Planta Baja'),
            totalPieces: sh.totalPieces || 0,
            recordCount: sh.recordCount || 0,
            status: sh.status || 'PENDIENTE',
            qrDataUrl
          });
        }
        this.shelfLabels.set(items);
        this.loadingShelves.set(false);
      },
      error: (err) => {
        this.loadingShelves.set(false);
        this.toast.error('Error al cargar anaqueles: ' + (err.error?.message || err.message));
      }
    });
  }

  loadAllShelvesWithoutSession() {
    this.loadingShelves.set(true);
    this.api.getShelves().subscribe({
      next: async (shelves) => {
        const items: ShelfQrItem[] = [];
        for (const sh of shelves) {
          const targetUrl = `${window.location.origin}/capture?shelfId=${sh.id}`;
          let qrDataUrl = '';
          try {
            qrDataUrl = await QRCode.toDataURL(targetUrl, {
              width: 600,
              margin: 2,
              errorCorrectionLevel: 'H',
              color: { dark: '#0a2472', light: '#ffffff' }
            });
          } catch (e) {}

          items.push({
            shelfId: sh.id,
            code: sh.code,
            zone: sh.zone || 'General',
            description: sh.description || '',
            plant: sh.plant || (sh.code.startsWith('PA-') ? 'Planta Alta' : 'Planta Baja'),
            totalPieces: 0,
            recordCount: 0,
            status: 'PENDIENTE',
            qrDataUrl
          });
        }
        this.shelfLabels.set(items);
        this.loadingShelves.set(false);
      },
      error: () => this.loadingShelves.set(false)
    });
  }

  loadMaterialCounts(sessionId: number) {
    if (!sessionId) {
      this.rawCountRecords.set([]);
      this.materialLabels.set([]);
      return;
    }

    this.loading.set(true);
    this.api.getCounts(sessionId).subscribe({
      next: async (counts) => {
        this.rawCountRecords.set(counts || []);

        if (!counts || counts.length === 0) {
          this.materialLabels.set([]);
          this.loading.set(false);
          return;
        }

        const map = new Map<string, {
          id: number;
          code: string;
          description: string;
          unit: string;
          shelf: string;
          shelfZone: string;
          plant: string;
          pieces: number;
          countedBy: string;
          countedAt: string;
        }>();

        for (const c of counts) {
          const key = `${c.shelfCode}|${c.capturedCode.trim().toUpperCase()}`;
          const plant = c.shelfCode.startsWith('PA-') ? 'Planta Alta' : 'Planta Baja';

          if (!map.has(key)) {
            map.set(key, {
              id: c.id,
              code: c.capturedCode.trim().toUpperCase(),
              description: c.description || c.capturedCode,
              unit: c.unit || 'PZA',
              shelf: c.shelfCode,
              shelfZone: c.shelfZone || 'General',
              plant,
              pieces: c.quantity || 0,
              countedBy: c.userName || 'Operador',
              countedAt: c.countedAt
            });
          } else {
            const existing = map.get(key)!;
            existing.pieces += (c.quantity || 0);
          }
        }

        const labelList: MaterialQrItem[] = [];
        for (const item of map.values()) {
          const qrPayload = `INTERFLU|ITEM|${item.code}|${item.pieces}|${item.unit}|${item.shelf}`;
          let qrDataUrl = '';
          try {
            qrDataUrl = await QRCode.toDataURL(qrPayload, {
              width: 160,
              margin: 1,
              color: { dark: '#0a2472', light: '#ffffff' }
            });
          } catch (e) {
            console.error('QR generation error for', item.code, e);
          }

          labelList.push({
            ...item,
            qrDataUrl
          });
        }

        this.materialLabels.set(labelList);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error fetching material counts for QR', err);
        this.materialLabels.set([]);
        this.rawCountRecords.set([]);
        this.loading.set(false);
      }
    });
  }

  // Shelf QR Download (Pure PNG named after shelf code, e.g. PB-ACE-05.png)
  downloadSingleShelfQr(item: ShelfQrItem) {
    if (!item.qrDataUrl) return;
    const a = document.createElement('a');
    a.href = item.qrDataUrl;
    a.download = `${item.code}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    this.toast.success(`Código QR descargado: ${item.code}.png`);
  }

  // Bulk ZIP Download for Shelves
  async downloadAllShelvesAsZip() {
    const items = this.filteredShelfLabels();
    if (items.length === 0) {
      this.toast.warning('No hay códigos QR de anaqueles para descargar');
      return;
    }

    this.isZipping.set(true);
    try {
      const zip = new JSZip();
      const folderName = 'Rotulos_Anaqueles_Interflu';
      const folder = zip.folder(folderName);

      for (const it of items) {
        if (!it.qrDataUrl) continue;
        const base64Data = it.qrDataUrl.replace(/^data:image\/png;base64,/, '');
        folder?.file(`${it.code}.png`, base64Data, { base64: true });
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `${folderName}_${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      this.toast.success(`Descargados ${items.length} códigos QR de anaqueles en ZIP.`);
    } catch (e: any) {
      this.toast.error('Error al generar archivo ZIP: ' + e.message);
    } finally {
      this.isZipping.set(false);
    }
  }

  // Edit Shelf Modal
  openEditShelfModal(shelf: ShelfQrItem) {
    this.editingShelf = {
      id: shelf.shelfId,
      code: shelf.code,
      zone: shelf.zone,
      description: shelf.description,
      plant: shelf.plant
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
      next: async (updated) => {
        this.savingShelf.set(false);
        this.toast.success(`Anaquel ${updated.code} actualizado`);
        
        // Re-generate QR for the updated code
        const targetUrl = `${window.location.origin}/capture?sessionId=${this.selectedSessionId()}&shelfId=${target.id}`;
        let qrDataUrl = '';
        try {
          qrDataUrl = await QRCode.toDataURL(targetUrl, {
            width: 600,
            margin: 2,
            errorCorrectionLevel: 'H',
            color: { dark: '#0a2472', light: '#ffffff' }
          });
        } catch (e) {}

        this.shelfLabels.update(list => list.map(sh => {
          if (sh.shelfId === target.id) {
            return {
              ...sh,
              code: updated.code,
              zone: updated.zone,
              description: updated.description,
              plant: updated.plant,
              qrDataUrl: qrDataUrl || sh.qrDataUrl
            };
          }
          return sh;
        }));
        this.editingShelf = null;
      },
      error: (err) => {
        this.savingShelf.set(false);
        this.toast.error(err.error?.message || 'Error al actualizar anaquel');
      }
    });
  }

  // Clear Single Shelf Counts Modal
  openClearShelfCountsModal(shelf: ShelfQrItem) {
    this.shelfToClearCounts = shelf;
  }

  executeClearShelfCounts() {
    if (!this.shelfToClearCounts) return;
    const shelf = this.shelfToClearCounts;
    this.clearingShelfCounts.set(true);
    this.api.resetShelfAssignment(this.selectedSessionId(), shelf.shelfId, true).subscribe({
      next: () => {
        this.clearingShelfCounts.set(false);
        this.toast.success(`Conteos del anaquel ${shelf.code} eliminados.`);
        this.shelfLabels.update(list => list.map(sh => {
          if (sh.shelfId === shelf.shelfId) {
            return {
              ...sh,
              totalPieces: 0,
              recordCount: 0,
              status: 'PENDIENTE'
            };
          }
          return sh;
        }));
        this.shelfToClearCounts = null;
      },
      error: (err) => {
        this.clearingShelfCounts.set(false);
        this.toast.error(err.error?.message || 'Error al limpiar conteos');
      }
    });
  }

  // Helpers
  countShelvesByPlant(plant: string): number {
    return this.shelfLabels().filter(s => s.plant === plant).length;
  }

  shelfStatusClass(status: string): string {
    if (status === 'COMPLETADO') return 'badge-success';
    if (status === 'EN_CONTEO') return 'badge-warning';
    return 'badge-neutral';
  }

  resetShelfFilters() {
    this.shelfPlantFilter = 'ALL';
    this.shelfZoneFilter = 'ALL';
    this.shelfSearchTerm = '';
  }

  resetFilters() {
    this.selectedShelfFilter = 'ALL';
    this.selectedPlantFilter = 'ALL';
    this.searchTerm = '';
  }

  filterByThisShelf(shelfCode: string) {
    this.selectedShelfFilter = shelfCode;
  }

  printBatch() {
    window.print();
  }

  downloadSingleQr(item: MaterialQrItem) {
    if (!item.qrDataUrl) return;
    const a = document.createElement('a');
    a.href = item.qrDataUrl;
    a.download = `QR_${item.shelf}_${item.code}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    this.toast.success(`Código QR de ${item.code} (${item.shelf}) descargado.`);
  }

  async downloadAllAsZip() {
    const items = this.filteredMaterialLabels();
    if (items.length === 0) {
      this.toast.warning('No hay códigos QR de materiales para descargar.');
      return;
    }

    this.isZipping.set(true);
    try {
      const zip = new JSZip();
      const shelfTag = this.selectedShelfFilter !== 'ALL' ? `_${this.selectedShelfFilter}` : '';
      const folderName = `qr_materiales${shelfTag}`;
      const folder = zip.folder(folderName);

      for (const it of items) {
        if (!it.qrDataUrl) continue;
        const base64Data = it.qrDataUrl.replace(/^data:image\/png;base64,/, '');
        const filename = `QR_${it.shelf}_${it.code}.png`;
        folder?.file(filename, base64Data, { base64: true });
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `${folderName}_${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      this.toast.success(`Lote de ${items.length} códigos QR de refacciones descargado exitosamente en ZIP.`);
    } catch (e: any) {
      this.toast.error('Ocurrió un error al generar el archivo ZIP: ' + e.message);
    } finally {
      this.isZipping.set(false);
    }
  }
}
