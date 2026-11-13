import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import * as QRCode from 'qrcode';
import JSZip from 'jszip';
import { ApiService, InventorySessionSummary, CountRecordDto } from '../services/api.service';
import { ToastService } from '../services/toast.service';

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
            Generación oficial de etiquetas QR para refacciones y partidas contabilizadas en cada anaquel. Si un anaquel contiene 55 códigos diferentes, se generan sus 55 códigos QR para impresión o descarga masiva en ZIP.
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
                class="pill-btn"
                [class.active]="selectedPlantFilter === 'ALL'"
                (click)="selectedPlantFilter = 'ALL'"
              >
                Todas
              </button>
              <button
                class="pill-btn"
                [class.active]="selectedPlantFilter === 'Planta Baja'"
                (click)="selectedPlantFilter = 'Planta Baja'"
              >
                Planta Baja
              </button>
              <button
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

      <!-- ============================================== -->
      <!-- MATERIALS QR LABELS GRID (BY PARTIDA/MATERIAL)-->
      <!-- ============================================== -->
      <div *ngIf="!loading()">
        <!-- Grid of Material QR Labels -->
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
            Los códigos QR se generan automáticamente para cada <strong>refacción física</strong> registrada en los anaqueles. Conforme realices conteos en la <strong>Cédula de Conteo</strong> o importes un archivo Excel, aquí aparecerán de inmediato los códigos QR de cada partida (por ejemplo, si un anaquel tiene 55 códigos diferentes, se generarán sus 55 códigos QR listos para imprimir o descargar en ZIP).
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
    </div>
  `,
  styles: [`
    .page-container {
      max-width: 1540px;
      margin: 0 auto;
      padding: 0 4px;
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
      max-width: 820px;
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
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }

    /* Material Label Card */
    .label-card {
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      padding: 12px;
      transition: transform 0.18s ease, box-shadow 0.18s ease;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .label-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px -2px rgba(15, 23, 42, 0.12);
      border-color: #94a3b8;
    }
    .label-inner {
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: 100%;
    }

    /* Header */
    .label-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1.5px solid #e2e8f0;
      padding-bottom: 8px;
    }
    .brand-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .label-logo {
      height: 20px;
      width: auto;
      object-fit: contain;
    }
    .label-brand {
      font-size: 11.5px;
      font-weight: 900;
      color: #0a2472;
      letter-spacing: 0.05em;
    }
    .header-tags {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .plant-pill {
      font-size: 10.5px;
      font-weight: 800;
      padding: 2px 7px;
      border-radius: 4px;
      letter-spacing: 0.04em;
    }
    .plant-pb { background: #dbeafe; color: #1e40af; border: 1px solid #bfdbfe; }
    .plant-pa { background: #f3e8ff; color: #6b21a8; border: 1px solid #e9d5ff; }
    .badge-unit {
      background: #f0fdf4;
      color: #166534;
      border: 1px solid #bbf7d0;
      font-size: 10px;
      font-weight: 800;
    }

    /* Body */
    .label-body {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .qr-col {
      flex-shrink: 0;
      background: #ffffff;
      padding: 4px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .qr-img {
      width: 95px;
      height: 95px;
      display: block;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: crisp-edges;
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
      font-weight: 900;
      color: #0f172a;
      letter-spacing: -0.01em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .material-desc {
      font-size: 11.5px;
      color: #475569;
      line-height: 1.3;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .material-shelf-box {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 3px;
      flex-wrap: wrap;
    }
    .shelf-tag {
      font-size: 11px;
      font-weight: 800;
      color: #0369a1;
      background: #f0f9ff;
      border: 1px solid #bae6fd;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .shelf-zone-sub {
      font-size: 10.5px;
      color: #64748b;
      font-weight: 600;
    }

    .material-qty-box {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 12px;
      margin-top: 2px;
    }
    .qty-label {
      font-size: 10px;
      font-weight: 800;
      color: #64748b;
    }
    .qty-val {
      font-weight: 800;
      color: #059669;
    }

    /* Footer */
    .label-footer {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
      border-top: 1px solid #f1f5f9;
      padding-top: 6px;
      margin-top: auto;
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 56px 24px;
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
    .empty-title {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
    }
    .empty-desc {
      font-size: 13.5px;
      color: #64748b;
      line-height: 1.5;
      margin: 0;
      max-width: 580px;
    }
    .empty-actions {
      display: flex;
      gap: 10px;
      margin-top: 8px;
      flex-wrap: wrap;
      justify-content: center;
    }

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
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Print Specific Styles */
    @media print {
      .no-print {
        display: none !important;
      }
      .page-container {
        max-width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .labels-grid {
        display: grid !important;
        grid-template-columns: repeat(3, 1fr) !important;
        gap: 8mm !important;
        padding: 4mm !important;
      }
      .label-card {
        border: 1px solid #000000 !important;
        box-shadow: none !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        padding: 8px !important;
      }
      .qr-img {
        width: 80px !important;
        height: 80px !important;
      }
      body {
        background: #ffffff !important;
      }
    }
  `]
})
export class QrLabelsComponent implements OnInit {
  selectedSessionId = signal<number>(0);
  sessions = signal<InventorySessionSummary[]>([]);
  session = signal<InventorySessionSummary | null>(null);

  // Raw count records from backend
  rawCountRecords = signal<CountRecordDto[]>([]);
  materialLabels = signal<MaterialQrItem[]>([]);

  // Filter models
  selectedShelfFilter = 'ALL';
  selectedPlantFilter: 'ALL' | 'Planta Baja' | 'Planta Alta' = 'ALL';
  searchTerm = '';

  loading = signal(false);
  isZipping = signal(false);

  // Available counted shelves in this session with their counts
  availableCountedShelves = computed(() => {
    const shelfMap = new Map<string, { code: string; zone: string; plant: string; count: number }>();
    for (const r of this.rawCountRecords()) {
      const code = r.shelfCode || 'SIN_UBIC';
      const zone = r.shelfZone || 'General';
      // Inferred plant
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

    // 1. Shelf filter
    if (this.selectedShelfFilter !== 'ALL') {
      list = list.filter(m => m.shelf === this.selectedShelfFilter);
    }

    // 2. Plant filter
    if (this.selectedPlantFilter !== 'ALL') {
      list = list.filter(m => m.plant === this.selectedPlantFilter);
    }

    // 3. Search query
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
        }

        if (activeId) {
          this.onSessionChange(activeId);
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
    this.loadMaterialCounts(numId);
  }

  loadMaterialCounts(sessionId: number) {
    if (!sessionId) {
      this.rawCountRecords.set([]);
      this.materialLabels.set([]);
      return;
    }

    this.loading.set(true);
    // Fetch all counted records in this session
    this.api.getCounts(sessionId).subscribe({
      next: async (counts) => {
        this.rawCountRecords.set(counts || []);

        if (!counts || counts.length === 0) {
          this.materialLabels.set([]);
          this.loading.set(false);
          return;
        }

        // Group counts by (shelfCode, capturedCode) to consolidate multiple entries of same SKU on the same shelf
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

        // Generate high-resolution QR codes for each unique material on each shelf
        const labelList: MaterialQrItem[] = [];
        for (const item of map.values()) {
          // Standard industrial payload: INTERFLU|ITEM|<code>|<qty>|<unit>|<shelf>
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
    } catch (e) {
      console.error('Error generating ZIP', e);
      this.toast.error('Ocurrió un error al generar el archivo ZIP');
    } finally {
      this.isZipping.set(false);
    }
  }
}
