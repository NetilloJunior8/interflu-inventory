import { Component, OnInit, signal, computed, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, of } from 'rxjs';
import { debounceTime, switchMap, distinctUntilChanged } from 'rxjs/operators';
import * as QRCode from 'qrcode';
import JSZip from 'jszip';
import {
  ApiService,
  InventorySessionSummary,
  ShelfAssignmentDto,
  ProductDto
} from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { PatternSuggesterService, SuggestionItem, SimilarCodeAlert } from '../services/pattern-suggester.service';

export interface SheetRow {
  id?: number;              // Database ID if saved
  tempId: string;           // Local unique key
  section?: string;         // Level A - G
  code: string;             // Raw entered code
  description?: string;     // Product description (manual or auto-filled)
  quantity: number | null;  // Number of pieces
  unit: string;
  inCatalog: boolean;
  notes?: string;
  isDuplicate?: boolean;
  duplicateInfo?: string;
  isNew?: boolean;
  similarAlert?: SimilarCodeAlert;
}

@Component({
  selector: 'app-capture',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="cedula-page">
      <!-- Official Interflu Header / Toolbar -->
      <div class="cedula-header-card">
        <div class="header-main">
          <div class="brand-folio">
            <img src="/logo_interflu_official.png" alt="Interflu Inventory" class="cedula-logo" />
            <div>
              <div class="system-title">INTERFLU &bull; INTERNACIONAL DE FLUIDOS S.A. DE C.V.</div>
              <h1 class="folio-title">
                Cédula de Conteo Físico &bull; <span class="mono accent">{{ currentSession()?.folio || 'SIN SESIÓN' }}</span>
                <span class="status-badge" [ngClass]="currentStatusClass()">
                  <span class="status-dot"></span>
                  {{ currentStatusLabel() }}
                </span>
              </h1>
            </div>
          </div>

          <!-- Quick Actions & Status Lifecycle -->
          <div class="header-actions">
            <button
              class="btn btn-primary"
              [disabled]="!isEditable() || saving()"
              (click)="saveEntireSheet()"
              title="Guardar todos los renglones en la base de datos"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              <span>{{ saving() ? 'Guardando...' : 'Guardar Cédula' }}</span>
              <span class="unsaved-badge" *ngIf="hasUnsavedChanges()">* Sin guardar</span>
            </button>

            <!-- Export to SAE: Shelf vs Global Consolidated -->
            <button
              class="btn btn-outline"
              (click)="exportCurrentShelf('CSV')"
              [disabled]="selectedShelfId() === 0"
              title="Descargar archivo de este anaquel para Aspel SAE"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Exportar Anaquel (SAE)
            </button>

            <button
              class="btn btn-outline"
              (click)="exportGlobalConsolidated('CSV')"
              title="Descargar archivo consolidado global de todos los anaqueles para PIs de Aspel SAE"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              Consolidado Global (PI)
            </button>

            <!-- Import Excel for counted shelves -->
            <button
              class="btn btn-outline"
              (click)="openImportExcelModal()"
              title="Importar archivo de Excel con anaqueles ya contados para marcarlos automáticamente en verde en el croquis"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              Importar Excel Contado
            </button>

            <!-- Shortcut to QR Labels -->
            <a
              routerLink="/qr-labels"
              [queryParams]="{ sessionId: selectedSessionId() }"
              class="btn btn-outline"
              title="Ver o imprimir etiquetas QR de los materiales de este inventario"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              Etiquetas QR
            </a>

            <!-- Status Lifecycle -->
            <button
              *ngIf="isEditable()"
              class="btn btn-success-light"
              (click)="markAsSuccess()"
              title="Cerrar y marcar como importación exitosa para Aspel SAE"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Marcar Éxito SAE
            </button>

            <button
              *ngIf="isEditable() && currentSession()?.status === 'EN_CONTEO'"
              class="btn btn-warning-light"
              (click)="markAsPendingReview()"
              title="Poner en revisión antes de cerrar"
            >
              En Revisión
            </button>

            <button
              *ngIf="!isEditable()"
              class="btn btn-accent"
              (click)="openReopenModal()"
              title="Reabrir cédula para continuar capturando o agregar piezas faltantes"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
              </svg>
              Reabrir Cédula
            </button>
          </div>
        </div>

        <!-- Metadata & Selector Controls -->
        <div class="selector-row">
          <div class="selector-group">
            <label class="field-label">Inventario / Folio</label>
            <div class="input-with-action">
              <select class="select-field" [ngModel]="selectedSessionId()" (ngModelChange)="onSessionChange($event)">
                <option *ngFor="let s of sessions()" [value]="s.id">
                  {{ s.folio }} &bull; {{ s.title }} [{{ s.status }}]
                </option>
              </select>
              <button class="btn btn-sm btn-ghost" (click)="openCreateSessionModal()" title="Crear nuevo folio">
                + Nuevo
              </button>
            </div>
          </div>

          <div class="selector-group">
            <label class="field-label">Anaquel / Ubicación Física</label>
            <div class="input-with-action">
              <select class="select-field" [ngModel]="selectedShelfId()" (ngModelChange)="onShelfChange($event)">
                <option [ngValue]="0">-- Selecciona anaquel para abrir cédula --</option>
                <option *ngFor="let sh of shelves()" [value]="sh.shelfId">
                  [{{ sh.plant || 'Planta 1' }}] {{ sh.shelfCode }} &bull; {{ sh.shelfZone }} ({{ sh.totalPieces }} pzas)
                </option>
              </select>
              <button *ngIf="selectedShelfId() > 0" class="btn btn-sm btn-ghost" (click)="openEditCurrentShelfModal()" title="Editar nombre o código de este anaquel">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                Editar
              </button>
              <button *ngIf="selectedShelfId() > 0" class="btn btn-sm btn-ghost" (click)="downloadCurrentShelfQrPng()" title="Descargar código QR en imagen PNG para rotular">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                QR (.png)
              </button>
            </div>
          </div>

          <div class="meta-indicators">
            <div class="indicator-item">
              <span class="ind-label">Partidas Contadas</span>
              <span class="ind-val mono">{{ validRowCount() }}</span>
            </div>
            <div class="indicator-item">
              <span class="ind-label">Piezas Físicas</span>
              <span class="ind-val mono text-primary-brand">{{ totalPieces() | number:'1.0-2' }}</span>
            </div>
            <div class="indicator-item" [class.has-duplicates]="duplicateCount() > 0">
              <span class="ind-label">Repetidos</span>
              <span class="ind-val mono" [class.text-danger]="duplicateCount() > 0">{{ duplicateCount() }}</span>
            </div>
            <div class="indicator-item">
              <span class="ind-label">Operador</span>
              <span class="ind-val text-muted">{{ auth.user()?.fullName || 'Osiris' }}</span>
            </div>
          </div>
        </div>

        <!-- Lock Warning if not editable -->
        <div class="lock-banner" *ngIf="!isEditable()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <div>
            <strong>Cédula Cerrada y Protegida ({{ currentSession()?.status }}).</strong>
            La lista de materiales está blindada contra modificaciones accidentales. Para agregar partidas o ajustar piezas, pulsa <strong>Reabrir Cédula</strong>.
          </div>
          <button class="btn btn-sm btn-outline-white" (click)="openReopenModal()">Reabrir Cédula Ahora</button>
        </div>

        <!-- Duplicate Warning Banner -->
        <div class="duplicate-banner" *ngIf="duplicateCount() > 0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <div>
            <strong>Atención: Se detectaron {{ duplicateCount() }} códigos repetidos en este anaquel.</strong>
            Se señalizan con borde ámbar y la fila correspondiente para agilizar la revisión física.
          </div>
          <button class="btn btn-sm btn-warning" (click)="consolidateDuplicates()" title="Sumar piezas de códigos duplicados y unificar renglones">
            Sumar y Consolidar Repetidos
          </button>
        </div>

        <!-- Similar Code Smart Alert Banner -->
        <div class="similar-code-banner" *ngIf="activeRowSimilarAlert() as sim">
          <div class="similar-text">
            <strong>Atención &bull; Código Similar Detectado:</strong>
            El código escrito se parece mucho a <span class="mono fw-700 font-code-chip">{{ sim.similarTo }}</span> ({{ sim.reason }}).
            <span class="sub-detail">{{ sim.detail }}</span>
          </div>
          <button class="btn btn-sm btn-outline-primary" type="button" (click)="applySimilarCode(sim.similarTo)">
            Sustituir por {{ sim.similarTo }}
          </button>
        </div>

        <!-- Quick Pattern Chips Bar (Autodidacta / Fracciones Refaccionaria) -->
        <div class="pattern-chips-bar" *ngIf="isEditable() && selectedShelfId() > 0">
          <div class="chips-header-row">
            <span class="chips-title">Atajos y Medidas Dinámicas:</span>
            <span class="chips-smart-tag" *ngIf="learnedCount() > 0">
              Autodidacta: {{ learnedCount() }} atajos aprendidos en vivo
            </span>
          </div>
          <div class="chips-list">
            <button
              *ngFor="let chip of quickChips"
              type="button"
              class="chip-btn mono"
              (click)="appendChipToActive(chip)"
            >
              {{ chip }}
            </button>
          </div>
        </div>
      </div>

      <!-- Cédula Sheet Container -->
      <div class="cedula-sheet-card" *ngIf="selectedShelfId() > 0; else noShelfSelected">
        <!-- Sheet Toolbar -->
        <div class="sheet-toolbar">
          <div class="toolbar-left">
            <!-- Undo / Reversión de última acción (Ctrl+Z) -->
            <button
              type="button"
              class="btn btn-sm btn-outline btn-undo"
              [disabled]="!canUndo() || !isEditable()"
              (click)="undoLastAction()"
              title="Deshacer última acción o modificación en la cédula (Ctrl+Z)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <polyline points="1 4 1 10 7 10"></polyline>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
              </svg>
              <span>Deshacer</span>
              <span class="undo-counter-tag" *ngIf="undoCount() > 0">({{ undoCount() }})</span>
            </button>

            <button
              class="btn btn-sm btn-outline"
              [disabled]="!isEditable()"
              (click)="addRowAtEnd()"
              title="Agregar renglón en blanco al final de la cédula"
            >
              + Agregar Renglón al Final
            </button>
            <button
              class="btn btn-sm btn-outline"
              [disabled]="!isEditable()"
              (click)="openPasteModal()"
              title="Pegar datos copiados directamente desde Excel (Ctrl+V)"
            >
              Pegar desde Excel
            </button>
            <button
              class="btn btn-sm btn-ghost"
              [disabled]="!isEditable()"
              (click)="removeEmptyRows()"
              title="Limpiar filas vacías sin código"
            >
              Limpiar Filas Vacías
            </button>
            <button
              class="btn btn-sm btn-outline"
              [disabled]="validRowCount() === 0"
              (click)="downloadCurrentShelfMaterialsZip()"
              title="Descargar todos los códigos QR de materiales de este anaquel en archivo ZIP con nombres individuales como CODIGO.png"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              Descargar QRs Materiales (.zip)
            </button>
            <button
              class="btn btn-sm btn-ghost text-danger"
              [disabled]="!isEditable() || (validRowCount() === 0 && totalPieces() === 0)"
              (click)="openClearCurrentShelfModal()"
              title="Eliminar conteos únicamente de este anaquel y ponerlo en 0 piezas"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              Limpiar Anaquel
            </button>
          </div>

          <div class="toolbar-right">
            <span class="keyboard-tip text-muted">
              Flujo Rápido: Escribe el código &rarr; pulsa <strong>Enter</strong> para piezas &rarr; pulsa <strong>Enter</strong> para la siguiente fila.
            </span>
          </div>
        </div>

        <!-- The Spreadsheet Grid Table (DESCRIPCION REMOVED TO MAXIMIZE SPEED) -->
        <div class="table-container" (paste)="onTablePaste($event)">
          <table class="cedula-table">
            <thead>
              <tr>
                <th class="th-row-num">#</th>
                <th class="th-sec" title="Nivel o Sección del Anaquel (A = Superior, B, C, D, E, F, G = Base)">Nivel (A-G)</th>
                <th class="th-code">Código / Clave Material</th>
                <th class="th-desc">Descripción</th>
                <th class="th-qty">Piezas (Físico)</th>
                <th class="th-status">Estado / Alerta</th>
                <th class="th-actions" *ngIf="isEditable()">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let row of rows(); let i = index"
                [class.row-duplicate]="row.isDuplicate"
                [class.row-saved]="row.id && !row.isNew"
                [class.row-focused]="activeRowIndex === i"
              >
                <!-- Row Number -->
                <td class="td-row-num mono">{{ i + 1 }}</td>

                <!-- Section / Level Input Cell (A - G) -->
                <td class="td-sec">
                  <div class="sec-input-wrap">
                    <input
                      #secInput
                      type="text"
                      maxlength="1"
                      class="sec-cell-input mono"
                      [class.sec-badge-a]="row.section === 'A'"
                      [class.sec-badge-b]="row.section === 'B'"
                      [class.sec-badge-c]="row.section === 'C'"
                      [class.sec-badge-d]="row.section === 'D'"
                      [class.sec-badge-e]="row.section === 'E'"
                      [class.sec-badge-f]="row.section === 'F'"
                      [class.sec-badge-g]="row.section === 'G'"
                      [(ngModel)]="row.section"
                      (focus)="onCellFocus(i, 'sec')"
                      (blur)="onCellBlur(i)"
                      (input)="onSectionInput(i, $event)"
                      (keydown)="onSectionKeyDown($event, i)"
                      [disabled]="!isEditable()"
                      placeholder="-"
                      title="Nivel de anaquel (solo letras A a G)"
                      autocomplete="off"
                    />
                  </div>
                </td>

                <!-- Code Input Cell -->
                <td class="td-code relative">
                  <div class="cell-input-wrap">
                    <input
                      #codeInput
                      type="text"
                      class="cell-input code-cell-input mono"
                      [class.input-duplicate]="row.isDuplicate"
                      [(ngModel)]="row.code"
                      (focus)="onCellFocus(i, 'code')"
                      (blur)="onCellBlur(i)"
                      (input)="onCodeInput(i, $any($event.target).value)"
                      (keydown)="onCodeKeyDown($event, i)"
                      [disabled]="!isEditable()"
                      placeholder="Clave interna de refacción"
                      autocomplete="off"
                    />
                    <button *ngIf="row.code && isEditable()" type="button" class="btn-cell-clear" (click)="clearRowCode(i)">✕</button>
                  </div>

                  <!-- Autocomplete Suggestions Dropdown -->
                  <div
                    class="autocomplete-box"
                    *ngIf="activeRowIndex === i && activeCellType === 'code' && currentSuggestions().length > 0"
                  >
                    <div
                      class="autocomplete-item"
                      *ngFor="let sugg of currentSuggestions()"
                      (mousedown)="selectSuggestion(i, sugg)"
                    >
                      <div class="sugg-header">
                        <span class="mono sugg-code">{{ sugg.code }}</span>
                        <span class="sugg-badge" [ngClass]="sugg.source">{{ sugg.source }}</span>
                      </div>
                      <div class="sugg-desc">{{ sugg.description }}</div>
                    </div>
                  </div>
                </td>

                <!-- Description Input Cell (Manual / Editable) -->
                <td class="td-desc">
                  <div class="cell-input-wrap">
                    <input
                      type="text"
                      class="cell-input desc-cell-input"
                      [(ngModel)]="row.description"
                      (focus)="onCellFocus(i, 'desc')"
                      (blur)="onCellBlur(i)"
                      [disabled]="!isEditable()"
                      placeholder="Descripción del material..."
                      autocomplete="off"
                    />
                  </div>
                </td>

                <!-- Pieces / Quantity Cell -->
                <td class="td-qty">
                  <input
                    #qtyInput
                    type="number"
                    step="any"
                    min="0"
                    class="cell-input mono text-right qty-input"
                    [(ngModel)]="row.quantity"
                    (focus)="onCellFocus(i, 'qty')"
                    (blur)="onCellBlur(i)"
                    (input)="onQuantityChange(i)"
                    (keydown)="onQtyKeyDown($event, i)"
                    [disabled]="!isEditable()"
                    placeholder="0"
                  />
                </td>

                <!-- Status / Alert Cell -->
                <td class="td-status">
                  <span *ngIf="row.isDuplicate" class="alert-pill duplicate">
                    Repetido ({{ row.duplicateInfo }})
                  </span>
                  <span *ngIf="!row.isDuplicate && row.inCatalog" class="alert-pill catalog">
                    Catálogo
                  </span>
                  <span *ngIf="!row.isDuplicate && !row.inCatalog && row.code" class="alert-pill new-code">
                    Válido
                  </span>
                  <span *ngIf="row.similarAlert && !row.isDuplicate && !row.inCatalog" class="alert-pill similar-pill" [title]="row.similarAlert.detail">
                    Similar: {{ row.similarAlert.similarTo }}
                  </span>
                </td>

                <!-- Row Actions (Insert Intermediate Row "en media celda", Delete) -->
                <td class="td-actions" *ngIf="isEditable()">
                  <div class="action-buttons">
                    <button
                      type="button"
                      class="action-btn"
                      *ngIf="row.code"
                      (click)="downloadRowMaterialQr(row.code)"
                      title="Descargar código QR de este material como {{ row.code }}.png"
                    >
                      QR (.png)
                    </button>
                    <button
                      type="button"
                      class="action-btn insert-btn"
                      (click)="insertRowBelow(i)"
                      title="Insertar fila intermedia en media celda aquí"
                    >
                      + Fila
                    </button>
                    <button
                      type="button"
                      class="action-btn delete-btn"
                      (click)="deleteRow(i)"
                      title="Eliminar este renglón"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Bottom Sheet Footer -->
        <div class="sheet-footer">
          <div class="footer-left">
            <button
              class="btn btn-outline"
              [disabled]="!isEditable()"
              (click)="addRowAtEnd()"
            >
              + Agregar Renglón al Final
            </button>
            <span class="footer-summary text-muted">
              Mostrando <strong>{{ rows().length }}</strong> renglones en anaquel <strong>{{ currentShelf()?.shelfCode }}</strong>
            </span>
          </div>

          <div class="footer-right">
            <button
              class="btn btn-primary btn-lg"
              [disabled]="!isEditable() || saving()"
              (click)="saveEntireSheet()"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px; vertical-align: -2px;">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              {{ saving() ? 'Guardando en BD...' : 'Guardar Cédula Completa' }}
            </button>
          </div>
        </div>
      </div>

      <!-- No Shelf Selected Prompt -->
      <ng-template #noShelfSelected>
        <div class="empty-prompt-card">
          <div class="prompt-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </div>
          <h3>Selecciona un Anaquel para Abrir la Cédula de Conteo</h3>
          <p class="text-muted">
            Cada folio de inventario se organiza por anaquel físico (Planta 1 o Planta 2).
            Selecciona el anaquel en el desplegable superior o pulsa uno de los accesos directos abajo para iniciar la captura de piezas.
          </p>
          <div class="quick-shelf-buttons">
            <button
              *ngFor="let s of shelves().slice(0, 8)"
              class="shelf-btn-card"
              (click)="selectedShelfId.set(s.shelfId); onShelfChange(s.shelfId)"
            >
              <span class="mono shelf-code">{{ s.shelfCode }}</span>
              <span class="shelf-zone">{{ s.shelfZone }}</span>
              <span class="shelf-cnt">{{ s.totalPieces }} pzas</span>
            </button>
          </div>
        </div>
      </ng-template>

      <!-- Paste from Excel Modal -->
      <div class="modal-overlay" *ngIf="showPasteModal">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Pegar Datos Directos desde Microsoft Excel</h3>
            <button class="btn-close" (click)="showPasteModal = false">✕</button>
          </div>
          <div class="modal-body">
            <p class="text-muted">
              Copia dos columnas en tu archivo de Excel (<strong>Columna 1: Código</strong>, <strong>Columna 2: Cantidad</strong>) y pégalas aquí:
            </p>
            <textarea
              class="textarea mono paste-area"
              rows="8"
              [(ngModel)]="pasteContent"
              placeholder="NM80 3 1/2&#9;15&#10;NMP40 2/4x1/4&#9;8&#10;VAL-ESF-1/2&#9;24"
            ></textarea>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" (click)="showPasteModal = false">Cancelar</button>
            <button class="btn btn-primary" (click)="processPastedData()">Insertar en la Cédula</button>
          </div>
        </div>
      </div>

      <!-- Create Session Modal -->
      <div class="modal-overlay" *ngIf="showCreateSessionModal">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Crear Nuevo Folio de Inventario</h3>
            <button class="btn-close" (click)="showCreateSessionModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="field-label">Título del Inventario</label>
              <input type="text" class="input" [(ngModel)]="newSessionTitle" placeholder="Inventario General Refacciones" />
            </div>
            <div class="form-group">
              <label class="field-label">Almacén</label>
              <select class="select-field" [(ngModel)]="newSessionWarehouse">
                <option value="1">1 - Almacén Principal Interflu</option>
                <option value="2">2 - Almacén Planta 2 Pesado</option>
              </select>
            </div>
            <div class="form-group">
              <label class="field-label">Notas / Observaciones</label>
              <textarea class="textarea" rows="2" [(ngModel)]="newSessionNotes" placeholder="Observaciones técnicas de la sesión..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" (click)="showCreateSessionModal = false">Cancelar</button>
            <button class="btn btn-primary" (click)="submitCreateSession()">Crear Folio</button>
          </div>
        </div>
      </div>

      <!-- Reopen Session Modal -->
      <div class="modal-overlay" *ngIf="showReopenModal">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Reabrir Cédula de Inventario</h3>
            <button class="btn-close" (click)="showReopenModal = false">✕</button>
          </div>
          <div class="modal-body">
            <p class="text-muted">
              Al reabrir esta cédula, se desbloquearán las celdas para agregar partidas omitidas o ajustar piezas. La lista completa de partidas registradas se mantendrá íntegra.
            </p>
            <div class="form-group">
              <label class="field-label">Motivo de Reapertura (Requerido)</label>
              <input type="text" class="input" [(ngModel)]="reopenReason" placeholder="Conteo complementario de anaquel o piezas no registradas" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" (click)="showReopenModal = false">Cancelar</button>
            <button class="btn btn-primary" (click)="submitReopenSession()">Reabrir y Desbloquear</button>
          </div>
        </div>
      </div>

      <!-- Import Excel Counts File Modal (Smart Nivel A-G & Fluid UX) -->
      <div class="modal-overlay import-modal-overlay" *ngIf="showImportExcelModal" (click)="closeImportExcelModal()">
        <div class="modal-card import-excel-modal" (click)="$event.stopPropagation()">
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
                <h3>Importar Excel por Anaquel y Nivel (A-G)</h3>
                <span class="import-header-sub">Acomoda automáticamente cada código en su nivel físico del croquis</span>
              </div>
            </div>
            <button type="button" class="import-close-btn" (click)="closeImportExcelModal()" title="Cerrar ventana (Esc)">✕</button>
          </div>

          <!-- STATE 1: UPLOAD & CONFIGURE -->
          <ng-container *ngIf="!importResult">
            <div class="modal-body import-modal-body">
              <!-- Format Banner + 1-Click Official Template Download -->
              <div class="excel-template-banner">
                <div class="template-banner-info">
                  <span class="hint-title">Columnas reconocidas automáticamente:</span>
                  <div class="format-col-chips mono">
                    <span class="col-chip col-chip-level">NIVEL (A-G)</span>
                    <span class="col-chip">CLAVE</span>
                    <span class="col-chip">EXISTENCIA FÍSICA</span>
                    <span class="col-chip col-chip-opt">ANAQUEL (opc.)</span>
                  </div>
                  <span class="font-xs text-muted">También compatible con exportaciones directas de Aspel SAE (.xlsx / .csv).</span>
                </div>
                <button
                  type="button"
                  class="btn btn-sm btn-template-dl"
                  [disabled]="downloadingTemplate()"
                  (click)="downloadExcelTemplate()"
                  title="Descargar archivo Excel oficial ya configurado con columna Nivel (A-G) desplegable"
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
              <div class="form-group">
                <label class="field-label">Anaquel Destino:</label>
                <select class="select-field" [ngModel]="importTargetShelfId()" (ngModelChange)="importTargetShelfId.set($event)">
                  <option [ngValue]="0">Detectar automáticamente (según columna ANAQUEL o nombre del archivo)</option>
                  <option *ngFor="let sh of shelves()" [value]="sh.shelfId">
                    [{{ sh.plant || 'Planta Baja' }}] {{ sh.shelfCode }} &bull; {{ sh.shelfZone }}
                  </option>
                </select>
              </div>

              <!-- Smart Import Mode Selector -->
              <div class="form-group">
                <label class="field-label">Comportamiento si el anaquel ya tiene registros:</label>
                <div class="import-mode-grid">
                  <button
                    type="button"
                    class="import-mode-card"
                    [class.active]="importMode() === 'SMART_MERGE'"
                    (click)="importMode.set('SMART_MERGE')"
                  >
                    <div class="mode-card-top">
                      <span class="mode-radio"></span>
                      <span class="mode-title">Inteligente: Actualizar y Agregar</span>
                      <span class="mode-rec-badge">Recomendado</span>
                    </div>
                    <p class="mode-desc">
                      Sustituye piezas y nivel (A-G) de códigos repetidos, agrega los códigos nuevos y conserva los demás sin borrar nada.
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
                      <span class="mode-title">Sustituir Todo el Anaquel</span>
                    </div>
                    <p class="mode-desc">
                      Borra los conteos previos del anaquel destino y deja exactamente lo que trae este archivo Excel.
                    </p>
                  </button>
                </div>
              </div>

              <!-- Interactive Drag & Drop File Zone -->
              <div
                class="file-drop-area"
                [class.drag-active]="isDraggingFile()"
                [class.has-file]="!!selectedExcelFile"
                (click)="fileInput.click()"
                (dragover)="onDragOverImport($event)"
                (dragleave)="onDragLeaveImport($event)"
                (drop)="onDropImport($event)"
              >
                <input #fileInput type="file" accept=".xlsx,.xls,.csv" style="display: none;" (change)="onFileSelectedForImport($event)" />
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
              <button type="button" class="btn btn-outline" (click)="closeImportExcelModal()">Cancelar</button>
              <button
                type="button"
                class="btn btn-primary btn-import-go"
                [disabled]="!selectedExcelFile || importingExcel()"
                (click)="submitImportExcel()"
              >
                <span *ngIf="importingExcel()" class="btn-spinner"></span>
                <span>{{ importingExcel() ? 'Procesando archivo...' : (importMode() === 'REPLACE_ALL' ? 'Sustituir e Importar Excel' : 'Importar con Modo Inteligente') }}</span>
              </button>
            </div>
          </ng-container>

          <!-- STATE 2: CLEAN POST-IMPORT SUCCESS VIEW (EFFORTLESS 1-CLICK EXIT) -->
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
                  {{ res.importMode === 'REPLACE_ALL' ? 'Se reemplazó el contenido completo del anaquel destino.' : 'Modo inteligente aplicado: códigos repetidos actualizados y nuevos agregados.' }}
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
                  <span class="imp-kpi-lbl">Con Nivel A-G</span>
                </div>
                <div class="imp-kpi-card">
                  <span class="imp-kpi-val mono">{{ res.totalPieces | number:'1.0-2' }}</span>
                  <span class="imp-kpi-lbl">Piezas Totales</span>
                </div>
              </div>

              <div class="affected-shelves-bar" *ngIf="res.affectedShelves && res.affectedShelves.length > 0">
                <span class="affected-lbl">Anaqueles actualizados y marcados en verde ({{ res.shelvesUpdated }}):</span>
                <div class="affected-chips">
                  <span class="affected-chip mono" *ngFor="let shCode of res.affectedShelves">{{ shCode }}</span>
                </div>
              </div>
            </div>

            <div class="modal-footer import-success-footer">
              <div class="success-footer-links">
                <button type="button" class="btn btn-sm btn-outline" (click)="resetForAnotherImport()">
                  Importar Otro Archivo
                </button>
                <a routerLink="/croquis" (click)="closeImportExcelModal()" class="btn btn-sm btn-outline-primary">
                  Ver en Croquis A-G &rarr;
                </a>
                <a routerLink="/qr-labels" [queryParams]="{sessionId: selectedSessionId()}" (click)="closeImportExcelModal()" class="btn btn-sm btn-outline">
                  Etiquetas QR
                </a>
              </div>
              <button type="button" class="btn btn-primary btn-done-exit" (click)="closeImportExcelModal()">
                Listo, Ver Cédula
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
            <button class="btn-close" (click)="editingShelf = null">✕</button>
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
            <button class="btn btn-outline" (click)="editingShelf = null" [disabled]="savingShelf()">Cancelar</button>
            <button class="btn btn-primary" (click)="saveCurrentShelfEdit()" [disabled]="savingShelf()">
              {{ savingShelf() ? 'Guardando...' : 'Guardar Cambios' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Modal: Confirm Clear Single Shelf Counts -->
      <div class="modal-backdrop" *ngIf="showClearShelfModal && currentShelf() as sh" (click)="showClearShelfModal = false">
        <div class="modal-box" (click)="$event.stopPropagation()">
          <h3 class="modal-title text-danger">Limpiar Conteos del Anaquel</h3>
          <p class="modal-desc">
            ¿Deseas eliminar todas las partidas contabilizadas en el anaquel <strong class="mono">{{ sh.shelfCode }}</strong>?
          </p>
          <div class="delete-warning-box">
            <strong>Restablecimiento individual:</strong>
            <ul style="margin: 6px 0 0 16px; padding: 0;">
              <li>Se eliminarán las {{ validRowCount() }} partidas contadas ({{ totalPieces() | number:'1.0-2' }} piezas) de este anaquel.</li>
              <li>El anaquel regresará a estado <strong>PENDIENTE</strong> con 0 piezas en el croquis y en el inventario.</li>
              <li>Los demás anaqueles del almacén <strong>no serán afectados</strong>.</li>
            </ul>
          </div>
          <div class="modal-footer" style="margin-top: 18px;">
            <button class="btn btn-outline" (click)="showClearShelfModal = false" [disabled]="clearingShelf()">Cancelar</button>
            <button class="btn btn-danger" (click)="executeClearCurrentShelf()" [disabled]="clearingShelf()">
              {{ clearingShelf() ? 'Limpiando...' : 'Sí, Limpiar Este Anaquel' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .cedula-page {
      padding: 0;
      max-width: 100%;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    /* Header Card */
    .cedula-header-card {
      background: var(--bg-surface, #ffffff);
      border: 1px solid var(--border-color, #e2e8f0);
      border-radius: var(--radius-lg, 12px);
      padding: 1.25rem 1.5rem;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .header-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .brand-folio {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .cedula-logo {
      height: 48px;
      width: auto;
      object-fit: contain;
    }

    .system-title {
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted, #64748b);
      font-weight: 700;
    }

    .folio-title {
      margin: 0;
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--brand-navy, #0a2472);
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .accent {
      color: var(--brand-blue, #1d4ed8);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .unsaved-badge {
      font-size: 0.7rem;
      color: #fef08a;
      margin-left: 0.25rem;
      font-weight: 700;
    }

    /* Status Badges */
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
    }
    .status-conteo {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }
    .status-conteo .status-dot {
      background: #2563eb;
    }
    .status-revision {
      background: #fffbeb;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .status-revision .status-dot { background: #d97706; }
    .status-exito {
      background: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
    }
    .status-exito .status-dot { background: #059669; }
    .status-reabierto {
      background: #f0fdf4;
      color: #0369a1;
      border: 1px solid #bae6fd;
    }
    .status-reabierto .status-dot { background: #0284c7; }

    /* Selector Controls */
    .selector-row {
      display: grid;
      grid-template-columns: 1.5fr 1.5fr 2fr;
      gap: 1.25rem;
      align-items: end;
      padding-top: 0.5rem;
      border-top: 1px solid var(--border-color, #e2e8f0);
    }

    @media (max-width: 900px) {
      .selector-row { grid-template-columns: 1fr; }
    }

    .selector-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .field-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-secondary, #334155);
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .input-with-action {
      display: flex;
      gap: 0.35rem;
    }

    .select-field {
      flex: 1;
      height: 38px;
      padding: 0 0.75rem;
      border: 1px solid var(--border-color, #cbd5e1);
      border-radius: var(--radius-sm, 6px);
      background: #ffffff;
      font-size: 0.85rem;
      color: var(--text-primary, #0f172a);
      outline: none;
    }
    .select-field:focus {
      border-color: var(--brand-blue, #1d4ed8);
      box-shadow: 0 0 0 2px rgba(29, 78, 216, 0.15);
    }

    .meta-indicators {
      display: flex;
      justify-content: flex-end;
      gap: 1.25rem;
      flex-wrap: wrap;
    }

    .indicator-item {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      padding: 0.25rem 0.5rem;
      border-radius: var(--radius-sm, 6px);
    }
    .indicator-item.has-duplicates {
      background: #fffbeb;
      border: 1px solid #fde68a;
    }

    .ind-label {
      font-size: 0.68rem;
      color: var(--text-muted, #64748b);
      text-transform: uppercase;
      font-weight: 600;
    }
    .ind-val {
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--text-primary, #0f172a);
    }
    .text-primary-brand { color: var(--brand-blue, #1d4ed8); }
    .text-danger { color: #dc2626; }

    /* Warning Banners */
    .lock-banner, .duplicate-banner {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border-radius: var(--radius-sm, 6px);
      font-size: 0.85rem;
    }
    .lock-banner {
      background: #1e293b;
      color: #ffffff;
    }
    .duplicate-banner {
      background: #fffbeb;
      border: 1px solid #fde68a;
      color: #92400e;
    }
    .similar-code-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.65rem 1rem;
      border-radius: var(--radius-sm, 6px);
      font-size: 0.85rem;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      color: #1e40af;
    }
    .similar-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .font-code-chip {
      background: #dbeafe;
      padding: 1px 6px;
      border-radius: 4px;
      color: #1e3a8a;
    }
    .sub-detail {
      font-size: 0.75rem;
      color: #2563eb;
    }
    .btn-outline-primary {
      background: #ffffff;
      border: 1px solid #2563eb;
      color: #1d4ed8;
      border-radius: 4px;
      padding: 0.3rem 0.75rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }
    .btn-outline-primary:hover {
      background: #eff6ff;
    }

    /* Pattern Chips Bar */
    .pattern-chips-bar {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      padding: 0.6rem 0;
      border-top: 1px dashed var(--border-color, #e2e8f0);
    }
    .chips-header-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    .chips-title {
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--text-muted, #64748b);
      white-space: nowrap;
      text-transform: uppercase;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .chips-smart-tag {
      font-size: 0.7rem;
      font-weight: 700;
      color: #0369a1;
      background: #e0f2fe;
      border: 1px solid #bae6fd;
      padding: 2px 8px;
      border-radius: 999px;
      letter-spacing: 0.02em;
    }
    .chips-list {
      display: flex;
      gap: 0.35rem;
      overflow-x: auto;
      padding-bottom: 2px;
      scrollbar-width: thin;
      flex-wrap: nowrap;
    }
    .chip-btn {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 0.25rem 0.6rem;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      color: #1e293b;
      white-space: nowrap;
      transition: all 0.15s ease;
    }
    .chip-btn:hover {
      background: #e0f2fe;
      border-color: #0284c7;
      color: #0369a1;
      transform: translateY(-1px);
    }

    /* Cédula Sheet Card */
    .cedula-sheet-card {
      background: #ffffff;
      border: 1px solid var(--border-color, #cbd5e1);
      border-radius: var(--radius-lg, 12px);
      box-shadow: 0 4px 14px -2px rgba(15, 23, 42, 0.08);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .sheet-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 1rem;
      background: #f8fafc;
      border-bottom: 1px solid var(--border-color, #cbd5e1);
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .toolbar-left {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }

    .table-container {
      overflow-x: auto;
      max-height: 620px;
      position: relative;
      scrollbar-width: thin;
      scrollbar-color: #94a3b8 #f1f5f9;
      width: 100%;
    }

    /* Cédula Table */
    .cedula-table {
      width: 100%;
      min-width: 1040px;
      border-collapse: collapse;
      font-size: 0.9rem;
      table-layout: fixed;
    }

    .cedula-table th {
      background: #f1f5f9;
      color: #334155;
      font-weight: 700;
      text-align: left;
      padding: 0.55rem 0.75rem;
      border-bottom: 2px solid #cbd5e1;
      border-right: 1px solid #e2e8f0;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .cedula-table td {
      padding: 0.25rem 0.5rem;
      border-bottom: 1px solid #e2e8f0;
      border-right: 1px solid #f1f5f9;
      vertical-align: middle;
    }

    .cedula-table tr:hover {
      background-color: #f8fafc;
    }

    .row-focused {
      background-color: #f0fdf4 !important;
    }

    .row-duplicate {
      background-color: #fefce8 !important;
    }

    .th-row-num, .td-row-num {
      width: 50px;
      text-align: center;
      background: #f8fafc;
      color: #64748b;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .th-sec, .td-sec {
      width: 94px;
      text-align: center !important;
    }

    .sec-input-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .sec-cell-input {
      width: 44px;
      height: 30px;
      text-align: center;
      text-transform: uppercase;
      font-weight: 800;
      font-size: 0.9rem;
      border: 1.5px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
      color: #334155;
      outline: none;
      transition: all 0.15s ease;
    }

    .sec-cell-input:focus {
      border-color: #2563eb;
      background: #ffffff;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.22);
      transform: scale(1.04);
    }

    .sec-cell-input.sec-badge-a { background: #eef2ff; color: #3730a3; border-color: #a5b4fc; }
    .sec-cell-input.sec-badge-b { background: #eff6ff; color: #1d4ed8; border-color: #93c5fd; }
    .sec-cell-input.sec-badge-c { background: #ecfeff; color: #0e7490; border-color: #67e8f9; }
    .sec-cell-input.sec-badge-d { background: #fffbeb; color: #b45309; border-color: #fcd34d; }
    .sec-cell-input.sec-badge-e { background: #fff7ed; color: #c2410c; border-color: #fdba74; }
    .sec-cell-input.sec-badge-f { background: #fdf2f8; color: #be185d; border-color: #f9a8d4; }
    .sec-cell-input.sec-badge-g { background: #f3e8ff; color: #6b21a8; border-color: #d8b4fe; }

    .th-code { width: 280px; }
    .th-desc { width: 340px; }
    .th-qty { width: 140px; }
    .th-status { width: 160px; }
    .th-actions { width: 120px; }

    .desc-cell-input {
      font-size: 0.88rem;
      color: #334155;
    }

    /* Inputs in Cells */
    .cell-input-wrap {
      position: relative;
      width: 100%;
    }

    .cell-input {
      width: 100%;
      height: 34px;
      border: 1px solid transparent;
      border-radius: 3px;
      padding: 0 0.6rem;
      font-size: 0.92rem;
      color: #0f172a;
      background: transparent;
      outline: none;
      transition: all 0.15s ease;
      box-sizing: border-box;
    }

    .cell-input:focus {
      background: #ffffff;
      border-color: #2563eb;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
    }

    .input-duplicate {
      border-color: #f59e0b !important;
      background: #fffbeb !important;
      font-weight: 600;
    }

    .qty-input {
      font-weight: 700;
      color: #1e3a8a;
    }

    .btn-cell-clear {
      position: absolute;
      right: 6px;
      top: 50%;
      transform: translateY(-50%);
      background: transparent;
      border: none;
      font-size: 0.8rem;
      color: #94a3b8;
      cursor: pointer;
    }

    /* Autocomplete Box */
    .autocomplete-box {
      position: absolute;
      top: 100%;
      left: 0;
      width: 360px;
      max-height: 220px;
      overflow-y: auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
      z-index: 50;
    }

    .autocomplete-item {
      padding: 0.5rem 0.75rem;
      cursor: pointer;
      border-bottom: 1px solid #f1f5f9;
      transition: background 0.1s;
    }
    .autocomplete-item:hover {
      background: #eff6ff;
    }

    .sugg-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2px;
    }
    .sugg-code {
      font-weight: 700;
      color: #1e40af;
      font-size: 0.85rem;
    }
    .sugg-badge {
      font-size: 0.65rem;
      padding: 1px 5px;
      border-radius: 3px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .sugg-badge.HISTORIAL { background: #e0f2fe; color: #0369a1; }
    .sugg-badge.PATRON { background: #fef3c7; color: #92400e; }
    .sugg-badge.CATALOGO { background: #dcfce7; color: #166534; }

    .sugg-desc {
      font-size: 0.75rem;
      color: #64748b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Alert Pills */
    .alert-pill {
      display: inline-block;
      font-size: 0.75rem;
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-weight: 600;
      white-space: nowrap;
    }
    .alert-pill.duplicate {
      background: #fffbeb;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .alert-pill.similar-pill {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }
    .alert-pill.catalog {
      background: #f0fdf4;
      color: #15803d;
      border: 1px solid #bbf7d0;
    }
    .alert-pill.new-code {
      background: #eff6ff;
      color: #1d4ed8;
      border: 1px solid #bfdbfe;
    }

    /* Action Buttons in Cell */
    .action-buttons {
      display: flex;
      gap: 0.35rem;
    }
    .action-btn {
      padding: 0.2rem 0.55rem;
      font-size: 0.75rem;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
      border: 1px solid transparent;
      transition: all 0.1s;
    }
    .insert-btn {
      background: #eff6ff;
      color: #1d4ed8;
      border-color: #bfdbfe;
    }
    .insert-btn:hover {
      background: #dbeafe;
    }
    .delete-btn {
      background: #fef2f2;
      color: #dc2626;
      border-color: #fecaca;
    }
    .delete-btn:hover {
      background: #fee2e2;
    }

    /* Sheet Footer */
    .sheet-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.85rem 1.25rem;
      background: #f8fafc;
      border-top: 1px solid #cbd5e1;
      flex-wrap: wrap;
      gap: 1rem;
    }
    .footer-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    /* Empty Prompt Card */
    .empty-prompt-card {
      background: #ffffff;
      border: 2px dashed #cbd5e1;
      border-radius: var(--radius-lg, 12px);
      padding: 3rem 2rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }
    .prompt-icon {
      color: #64748b;
    }
    .quick-shelf-buttons {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 0.75rem;
      width: 100%;
      max-width: 900px;
      margin-top: 1rem;
    }
    .shelf-btn-card {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 0.75rem 1rem;
      text-align: left;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      transition: all 0.15s ease;
    }
    .shelf-btn-card:hover {
      background: #eff6ff;
      border-color: #93c5fd;
    }
    .shelf-code {
      font-weight: 700;
      color: #0a2472;
      font-size: 0.95rem;
    }
    .shelf-zone {
      font-size: 0.75rem;
      color: #64748b;
    }
    .shelf-cnt {
      font-size: 0.75rem;
      color: #059669;
      font-weight: 600;
    }

    /* Modal Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(15, 23, 42, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 1rem;
    }
    .modal-card {
      background: #ffffff;
      border-radius: 12px;
      width: 100%;
      max-width: 540px;
      box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);
      overflow: hidden;
    }
    .modal-header {
      padding: 1rem 1.25rem;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-header h3 { margin: 0; font-size: 1.1rem; color: #0f172a; }
    .btn-close { background: none; border: none; font-size: 1.1rem; cursor: pointer; color: #64748b; }
    .modal-body { padding: 1.25rem; display: flex; flex-direction: column; gap: 1rem; }
    .modal-footer { padding: 0.85rem 1.25rem; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 0.5rem; }
    .paste-area { width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 0.5rem; font-size: 0.82rem; }
    .btn-outline-white { background: transparent; border: 1px solid #ffffff; color: #ffffff; border-radius: 4px; padding: 0.25rem 0.6rem; cursor: pointer; }
    .btn-outline-white:hover { background: rgba(255,255,255,0.15); }
    .btn-success-light { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; border-radius: 6px; padding: 0.45rem 0.85rem; font-weight: 600; cursor: pointer; }
    .btn-warning-light { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; border-radius: 6px; padding: 0.45rem 0.85rem; font-weight: 600; cursor: pointer; }
    .btn-accent { background: #0284c7; color: #ffffff; border: none; border-radius: 6px; padding: 0.45rem 0.85rem; font-weight: 600; cursor: pointer; }
    .btn-undo {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-weight: 600;
      border-color: #cbd5e1;
      color: #334155;
    }
    .btn-undo:hover:not(:disabled) {
      background: #f1f5f9;
      border-color: #94a3b8;
      color: #0f172a;
    }
    .undo-counter-tag {
      background: #fef3c7;
      color: #b45309;
      font-size: 10px;
      font-weight: 800;
      padding: 1px 5px;
      border-radius: 999px;
      border: 1px solid #fde68a;
    }
    /* Modern Fluid Import Excel Modal */
    @keyframes impFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes impSlideUp {
      from { opacity: 0; transform: translateY(14px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes impSpin {
      to { transform: rotate(360deg); }
    }

    .import-modal-overlay {
      background: rgba(15, 23, 42, 0.58);
      backdrop-filter: blur(4px);
      animation: impFadeIn 0.16s ease-out;
      z-index: 1000;
    }
    .import-excel-modal {
      max-width: 660px;
      width: 95vw;
      max-height: 92vh;
      display: flex;
      flex-direction: column;
      border-radius: 16px;
      border: 1px solid #cbd5e1;
      box-shadow: 0 24px 48px -12px rgba(15, 23, 42, 0.28);
      animation: impSlideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      overflow: hidden;
    }
    .import-modal-header {
      padding: 1.05rem 1.35rem;
      background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
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
      background: #0a2472;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 4px 10px rgba(10, 36, 114, 0.25);
    }
    .import-modal-header h3 {
      margin: 0;
      font-size: 1.08rem;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.2;
    }
    .import-header-sub {
      display: block;
      font-size: 0.76rem;
      color: #64748b;
      margin-top: 2px;
    }
    .import-close-btn {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      background: #ffffff;
      color: #475569;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: all 0.14s ease;
      flex-shrink: 0;
    }
    .import-close-btn:hover {
      background: #fee2e2;
      border-color: #fca5a5;
      color: #b91c1c;
    }
    .import-modal-body {
      padding: 1.2rem 1.35rem;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    /* Template Banner */
    .excel-template-banner {
      background: #f8fafc;
      border: 1px solid #dbeafe;
      border-radius: 10px;
      padding: 0.85rem 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .template-banner-info {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    .hint-title {
      font-size: 0.7rem;
      font-weight: 800;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .format-col-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
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
    .btn-template-dl {
      background: #ffffff;
      border: 1.5px solid #2563eb;
      color: #1d4ed8;
      font-weight: 700;
      border-radius: 8px;
      padding: 6px 12px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      transition: all 0.14s ease;
      white-space: nowrap;
    }
    .btn-template-dl:hover:not(:disabled) {
      background: #2563eb;
      color: #ffffff;
      transform: translateY(-1px);
      box-shadow: 0 4px 10px rgba(37, 99, 235, 0.25);
    }

    /* Smart Import Mode Cards */
    .import-mode-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 6px;
    }
    @media (max-width: 600px) {
      .import-mode-grid { grid-template-columns: 1fr; }
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
    .import-mode-card.mode-card-replace.active {
      border-color: #d97706;
      background: #fffbeb;
      box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.14);
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
      position: relative;
    }
    .import-mode-card.active .mode-radio {
      border-color: #2563eb;
      background: #2563eb;
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

    /* Drag & Drop Area */
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
      font-weight: 700;
    }
    .btn-remove-file:hover {
      background: #fee2e2;
      color: #dc2626;
      border-color: #fecaca;
    }
    .btn-import-go {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 0.55rem 1.25rem;
    }
    .btn-spinner {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: impSpin 0.7s linear infinite;
    }

    /* Post-Import Success View */
    .import-success-body {
      padding: 1.5rem 1.35rem 1.25rem;
      display: flex;
      flex-direction: column;
      gap: 1.15rem;
      animation: impFadeIn 0.2s ease-out;
    }
    .success-hero {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }
    .success-check-circle {
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: #dcfce7;
      color: #15803d;
      border: 2px solid #86efac;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 4px;
    }
    .success-title {
      margin: 0;
      font-size: 1.18rem;
      font-weight: 800;
      color: #0f172a;
    }
    .success-subtitle {
      margin: 0;
      font-size: 0.82rem;
      color: #475569;
    }
    .import-kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }
    @media (max-width: 600px) {
      .import-kpi-grid { grid-template-columns: repeat(2, 1fr); }
    }
    .imp-kpi-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 0.75rem 0.6rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }
    .imp-kpi-val {
      font-size: 1.25rem;
      font-weight: 800;
      color: #0f172a;
    }
    .imp-kpi-lbl {
      font-size: 0.68rem;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      text-align: center;
    }
    .text-indigo { color: #4338ca; }
    .affected-shelves-bar {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 10px;
      padding: 0.75rem 0.9rem;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .affected-lbl {
      font-size: 0.74rem;
      font-weight: 700;
      color: #166534;
    }
    .affected-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }
    .affected-chip {
      font-size: 0.74rem;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 6px;
      background: #ffffff;
      border: 1px solid #86efac;
      color: #15803d;
    }
    .import-success-footer {
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .success-footer-links {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .btn-done-exit {
      padding: 0.55rem 1.35rem;
      font-weight: 700;
    }

    /* Modal Backdrop & Shared Form Styles */
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
    .input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 13px;
      background: #ffffff;
      box-sizing: border-box;
    }
    .input:focus {
      outline: none;
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
    }
  `]
})
export class CaptureComponent implements OnInit {
  sessions = signal<InventorySessionSummary[]>([]);
  shelves = signal<ShelfAssignmentDto[]>([]);
  selectedSessionId = signal<number>(0);
  selectedShelfId = signal<number>(0);

  // Rows of the current cédula
  rows = signal<SheetRow[]>([]);
  saving = signal<boolean>(false);
  hasUnsavedChanges = signal<boolean>(false);

  // Shelf editing state
  editingShelf: { id: number; code: string; zone: string; description: string; plant: string } | null = null;
  savingShelf = signal(false);

  // Shelf clear state
  showClearShelfModal = false;
  clearingShelf = signal(false);

  // Active focus in cell
  activeRowIndex: number = -1;
  activeCellType: 'sec' | 'code' | 'desc' | 'qty' | null = null;
  currentSuggestions = signal<SuggestionItem[]>([]);

  // Search subject for catalog lookups
  private searchSubject = new Subject<{ index: number; term: string }>();

  // Modals
  showPasteModal = false;
  pasteContent = '';
  showCreateSessionModal = false;
  newSessionTitle = '';
  newSessionWarehouse = '1';
  newSessionNotes = '';
  showReopenModal = false;
  reopenReason = '';
  showImportExcelModal = false;
  selectedExcelFile: File | null = null;
  importTargetShelfId = signal<number>(0);
  importMode = signal<'SMART_MERGE' | 'REPLACE_ALL'>('SMART_MERGE');
  isDraggingFile = signal<boolean>(false);
  downloadingTemplate = signal<boolean>(false);
  importingExcel = signal<boolean>(false);
  importResult: {
    importedRecords: number;
    addedRecords?: number;
    updatedRecords?: number;
    withSectionCount?: number;
    totalPieces: number;
    shelvesUpdated: number;
    affectedShelves?: string[];
    importMode?: string;
  } | null = null;

  quickChips: string[] = [];
  learnedCount = computed(() => this.patternSuggester.getLearnedChipsCount());

  // Undo / Reversible Transactions State
  undoStack: Array<{
    rows: SheetRow[];
    description: string;
    timestamp: Date;
  }> = [];
  undoCount = signal<number>(0);
  canUndo = computed(() => this.undoCount() > 0);
  private focusSnapshot: SheetRow[] | null = null;

  // Computed properties
  currentSession = computed(() => this.sessions().find(s => s.id === this.selectedSessionId()));
  currentShelf = computed(() => this.shelves().find(sh => sh.shelfId === this.selectedShelfId()));

  isEditable = computed(() => {
    const s = this.currentSession();
    if (!s) return false;
    return s.status === 'EN_CONTEO' || s.status === 'BORRADOR' || s.status === 'REABIERTO';
  });

  validRowCount = computed(() => this.rows().filter(r => r.code && r.code.trim().length > 0).length);

  totalPieces = computed(() => {
    return this.rows().reduce((sum, r) => sum + (r.quantity || 0), 0);
  });

  duplicateCount = computed(() => {
    return this.rows().filter(r => r.isDuplicate).length;
  });

  activeRowSimilarAlert = computed(() => {
    const idx = this.activeRowIndex;
    const list = this.rows();
    if (idx >= 0 && idx < list.length) {
      return list[idx].similarAlert;
    }
    return undefined;
  });

  saveUndoSnapshot(description: string) {
    const snapshot = this.rows().map(r => ({ ...r }));
    this.undoStack.push({
      rows: snapshot,
      description,
      timestamp: new Date()
    });
    if (this.undoStack.length > 35) {
      this.undoStack.shift();
    }
    this.undoCount.set(this.undoStack.length);
  }

  undoLastAction() {
    if (this.undoStack.length === 0) return;
    const previous = this.undoStack.pop();
    this.undoCount.set(this.undoStack.length);
    if (previous) {
      this.rows.set(previous.rows.map(r => ({ ...r })));
      this.hasUnsavedChanges.set(true);
      this.recalculateDuplicates();
      this.toast.info(`Deshecho: Restaurado estado previo a "${previous.description}".`);
    }
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalShortcuts(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (this.showImportExcelModal) {
        this.closeImportExcelModal();
        return;
      }
      if (this.showPasteModal) {
        this.showPasteModal = false;
        return;
      }
      if (this.showCreateSessionModal) {
        this.showCreateSessionModal = false;
        return;
      }
      if (this.showReopenModal) {
        this.showReopenModal = false;
        return;
      }
      if (this.showClearShelfModal) {
        this.showClearShelfModal = false;
        return;
      }
      if (this.editingShelf) {
        this.editingShelf = null;
        return;
      }
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      if (this.canUndo() && this.isEditable()) {
        event.preventDefault();
        this.undoLastAction();
      }
    }
  }

  applySimilarCode(code: string) {
    if (this.activeRowIndex >= 0 && this.activeRowIndex < this.rows().length) {
      this.saveUndoSnapshot(`Corregir a código sugerido ${code}`);
      const row = this.rows()[this.activeRowIndex];
      row.code = code;
      row.similarAlert = undefined;
      this.hasUnsavedChanges.set(true);
      this.recalculateDuplicates();
      this.toast.success(`Código actualizado a ${code}`);
    }
  }

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private toast: ToastService,
    private route: ActivatedRoute,
    private patternSuggester: PatternSuggesterService
  ) {
    this.quickChips = this.patternSuggester.getQuickChips();

    // Debounced catalog search
    this.searchSubject.pipe(
      debounceTime(180),
      distinctUntilChanged((a, b) => a.term === b.term),
      switchMap(req => {
        if (!req.term || req.term.length < 2) return of({ index: req.index, products: [] as ProductDto[] });
        return this.api.searchProducts(req.term).pipe(
          switchMap(products => of({ index: req.index, products }))
        );
      })
    ).subscribe(({ index, products }) => {
      if (this.activeRowIndex === index) {
        const term = this.rows()[index]?.code || '';
        const patternItems = this.patternSuggester.suggest(term, 6);
        const catalogItems: SuggestionItem[] = products.slice(0, 6).map(p => ({
          code: p.code,
          description: p.description,
          source: 'CATALOGO'
        }));

        const merged: SuggestionItem[] = [];
        const seen = new Set<string>();
        [...catalogItems, ...patternItems].forEach(item => {
          if (!seen.has(item.code.toUpperCase())) {
            seen.add(item.code.toUpperCase());
            merged.push(item);
          }
        });

        this.currentSuggestions.set(merged);
      }
    });
  }

  ngOnInit() {
    this.loadSessions();
  }

  loadSessions() {
    this.api.getSessions().subscribe({
      next: (data) => {
        this.sessions.set(data);
        if (data.length > 0) {
          this.route.queryParams.subscribe(params => {
            const requestedSessionId = params['sessionId'] ? Number(params['sessionId']) : data[0].id;
            const requestedShelfId = params['shelfId'] ? Number(params['shelfId']) : 0;
            this.selectedSessionId.set(requestedSessionId);
            this.loadShelvesForSession(requestedSessionId, requestedShelfId);
          });
        }
      },
      error: (err) => this.toast.error('Error al cargar inventarios: ' + (err.error?.message || err.message))
    });
  }

  loadShelvesForSession(sessionId: number, targetShelfId = 0) {
    this.api.getSessionShelves(sessionId).subscribe({
      next: (shs) => {
        this.shelves.set(shs);
        if (targetShelfId > 0 && shs.some(s => s.shelfId === targetShelfId)) {
          this.selectedShelfId.set(targetShelfId);
          this.loadShelfCounts(sessionId, targetShelfId);
        } else if (shs.length > 0 && this.selectedShelfId() === 0) {
          this.selectedShelfId.set(shs[0].shelfId);
          this.loadShelfCounts(sessionId, shs[0].shelfId);
        }
      },
      error: (err) => this.toast.error('Error al cargar anaqueles: ' + (err.error?.message || err.message))
    });
  }

  onSessionChange(newSessionId: number) {
    this.selectedSessionId.set(Number(newSessionId));
    this.loadShelvesForSession(Number(newSessionId));
  }

  onShelfChange(newShelfId: number) {
    const shelfId = Number(newShelfId);
    this.selectedShelfId.set(shelfId);
    if (shelfId > 0) {
      this.loadShelfCounts(this.selectedSessionId(), shelfId);
    } else {
      this.rows.set([]);
    }
  }

  openEditCurrentShelfModal() {
    const sh = this.currentShelf();
    if (!sh) return;
    this.editingShelf = {
      id: sh.shelfId,
      code: sh.shelfCode,
      zone: sh.shelfZone || '',
      description: sh.shelfDescription || '',
      plant: sh.plant || 'Planta Baja'
    };
  }

  saveCurrentShelfEdit() {
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
        this.shelves.update(list => list.map(s => {
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
        this.editingShelf = null;
      },
      error: (err) => {
        this.savingShelf.set(false);
        this.toast.error(err.error?.message || 'Error al actualizar anaquel');
      }
    });
  }

  async downloadCurrentShelfQrPng() {
    const sh = this.currentShelf();
    if (!sh) return;
    try {
      const captureUrl = `${window.location.origin}/capture?sessionId=${this.selectedSessionId()}&shelfId=${sh.shelfId}`;
      const qrDataUrl = await QRCode.toDataURL(captureUrl, {
        width: 800,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: { dark: '#0a2472', light: '#ffffff' }
      });
      const a = document.createElement('a');
      a.href = qrDataUrl;
      a.download = `${sh.shelfCode}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      this.toast.success(`Código QR de ${sh.shelfCode} descargado como ${sh.shelfCode}.png`);
    } catch (e: any) {
      this.toast.error('Error al generar código QR: ' + e.message);
    }
  }

  sanitizeFilename(code: string): string {
    if (!code) return 'codigo';
    return code
      .replace(/[\/\\:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .trim();
  }

  async downloadRowMaterialQr(code: string) {
    if (!code) return;
    const cleanCode = code.trim().toUpperCase();
    try {
      const qrDataUrl = await QRCode.toDataURL(cleanCode, {
        width: 500,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: { dark: '#000000', light: '#ffffff' }
      });
      const safeFilename = `${this.sanitizeFilename(cleanCode)}.png`;
      const a = document.createElement('a');
      a.href = qrDataUrl;
      a.download = safeFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      this.toast.success(`Código QR descargado: ${safeFilename}`);
    } catch (e: any) {
      this.toast.error('Error al generar código QR: ' + e.message);
    }
  }

  async downloadCurrentShelfMaterialsZip() {
    const sh = this.currentShelf();
    if (!sh) return;
    const rowsWithCode = this.rows().filter(r => r.code && r.code.trim().length > 0);
    if (rowsWithCode.length === 0) {
      this.toast.warning('No hay partidas con código en esta cédula.');
      return;
    }

    const shelfCode = sh.shelfCode;
    this.toast.info(`Generando archivo ZIP de códigos para ${shelfCode}...`);

    if (sh.shelfId && this.selectedSessionId() > 0) {
      this.api.downloadShelfMaterialsZip(sh.shelfId, this.selectedSessionId()).subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `QRs_${this.sanitizeFilename(shelfCode)}_materiales.zip`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.URL.revokeObjectURL(url);
          this.toast.success(`Descargados códigos QR de ${shelfCode} en ZIP.`);
        },
        error: async () => {
          await this.generateClientSideShelfRowsZip(shelfCode, rowsWithCode);
        }
      });
    } else {
      await this.generateClientSideShelfRowsZip(shelfCode, rowsWithCode);
    }
  }

  async generateClientSideShelfRowsZip(shelfCode: string, rows: SheetRow[]) {
    try {
      const zip = new JSZip();
      const folder = zip.folder(`QRs_${this.sanitizeFilename(shelfCode)}`);

      const uniqueCodes = new Set<string>();
      for (const r of rows) {
        if (r.code && r.code.trim()) {
          uniqueCodes.add(r.code.trim().toUpperCase());
        }
      }

      for (const code of uniqueCodes) {
        const qrDataUrl = await QRCode.toDataURL(code, {
          width: 500,
          margin: 2,
          errorCorrectionLevel: 'H',
          color: { dark: '#000000', light: '#ffffff' }
        });
        const base64Data = qrDataUrl.replace(/^data:image\/png;base64,/, '');
        const filename = `${this.sanitizeFilename(code)}.png`;
        folder?.file(filename, base64Data, { base64: true });
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `QRs_${this.sanitizeFilename(shelfCode)}_materiales.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      this.toast.success(`Descargados ${uniqueCodes.size} códigos QR de ${shelfCode} en ZIP.`);
    } catch (e: any) {
      this.toast.error('Error al generar archivo ZIP: ' + e.message);
    }
  }

  openClearCurrentShelfModal() {
    if (!this.currentShelf()) return;
    this.showClearShelfModal = true;
  }

  executeClearCurrentShelf() {
    const sh = this.currentShelf();
    if (!sh) return;
    this.clearingShelf.set(true);
    this.api.resetShelfAssignment(this.selectedSessionId(), sh.shelfId, true).subscribe({
      next: () => {
        this.clearingShelf.set(false);
        this.showClearShelfModal = false;
        this.toast.success(`Conteos del anaquel ${sh.shelfCode} eliminados y restablecido a Pendiente.`);
        this.rows.set([]);
        this.hasUnsavedChanges.set(false);
        this.loadShelvesForSession(this.selectedSessionId(), sh.shelfId);
      },
      error: (err) => {
        this.clearingShelf.set(false);
        this.toast.error(err.error?.message || 'Error al limpiar conteos del anaquel');
      }
    });
  }

  loadShelfCounts(sessionId: number, shelfId: number) {
    this.api.getCounts(sessionId, shelfId).subscribe({
      next: (records) => {
        const loadedRows: SheetRow[] = records.map((r, i) => ({
          id: r.id,
          tempId: 'row_' + r.id + '_' + i,
          section: (r.section || '').toUpperCase(),
          code: r.capturedCode,
          description: r.description || '',
          quantity: r.quantity,
          unit: r.unit || 'PZA',
          inCatalog: r.existsInCatalog,
          notes: r.notes,
          isNew: false
        }));

        this.patternSuggester.learnFromMaterials(loadedRows.map(r => r.code));
        this.quickChips = this.patternSuggester.getQuickChips();

        this.undoStack = [];
        this.undoCount.set(0);
        this.focusSnapshot = null;

        if (loadedRows.length === 0) {
          loadedRows.push(this.createEmptyRow());
        }

        this.rows.set(loadedRows);
        this.recalculateDuplicates();
        this.hasUnsavedChanges.set(false);
      },
      error: (err) => this.toast.error('Error al cargar conteos: ' + (err.error?.message || err.message))
    });
  }

  createEmptyRow(defaultSection: string = ''): SheetRow {
    return {
      tempId: 'temp_' + Math.random().toString(36).substring(2, 9),
      section: defaultSection,
      code: '',
      description: '',
      quantity: null,
      unit: 'PZA',
      inCatalog: false,
      isNew: true
    };
  }

  onCellFocus(rowIndex: number, cellType: 'sec' | 'code' | 'desc' | 'qty') {
    this.activeRowIndex = rowIndex;
    this.activeCellType = cellType;
    this.focusSnapshot = this.rows().map(r => ({ ...r }));
    if (cellType === 'code') {
      const term = this.rows()[rowIndex]?.code || '';
      if (term.length > 0) {
        this.currentSuggestions.set(this.patternSuggester.suggest(term, 8));
      } else {
        this.currentSuggestions.set([]);
      }
    } else {
      this.currentSuggestions.set([]);
    }
  }

  onCellBlur(rowIndex: number) {
    if (this.focusSnapshot) {
      const oldRow = this.focusSnapshot[rowIndex];
      const curRow = this.rows()[rowIndex];
      if (oldRow && curRow && (oldRow.code !== curRow.code || oldRow.quantity !== curRow.quantity || oldRow.section !== curRow.section)) {
        this.undoStack.push({
          rows: this.focusSnapshot,
          description: `Modificar renglón ${rowIndex + 1} (${curRow.code || curRow.section || 'vacía'})`,
          timestamp: new Date()
        });
        if (this.undoStack.length > 35) this.undoStack.shift();
        this.undoCount.set(this.undoStack.length);
      }
      this.focusSnapshot = null;
    }
  }

  onSectionInput(index: number, event: Event) {
    this.hasUnsavedChanges.set(true);
    const inputEl = event.target as HTMLInputElement;
    const rawVal = inputEl?.value || '';
    const cleaned = rawVal.trim().toUpperCase();

    // Strict validation: Only letters A to G allowed
    if (/^[A-G]$/.test(cleaned)) {
      this.rows()[index].section = cleaned;
      if (inputEl) inputEl.value = cleaned;
      // Auto-advance to material code input in the same row
      setTimeout(() => {
        const codeInputs = document.querySelectorAll<HTMLInputElement>('.cell-input-wrap .cell-input');
        if (codeInputs[index]) {
          codeInputs[index].focus();
          codeInputs[index].select();
        }
      }, 50);
    } else if (cleaned.length === 0) {
      this.rows()[index].section = '';
      if (inputEl) inputEl.value = '';
    } else {
      // Reject any non A-G character
      const validChar = cleaned.split('').find(c => /^[A-G]$/.test(c)) || '';
      this.rows()[index].section = validChar;
      if (inputEl) inputEl.value = validChar;
      this.toast.warning('Nivel inválido. Solo se admiten niveles de la A a la G.');
    }
  }

  onSectionKeyDown(event: KeyboardEvent, index: number) {
    if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'ArrowRight') {
      event.preventDefault();
      const codeInputs = document.querySelectorAll<HTMLInputElement>('.cell-input-wrap .cell-input');
      if (codeInputs[index]) {
        codeInputs[index].focus();
        codeInputs[index].select();
      }
    } else if (event.key === 'ArrowDown') {
      const secInputs = document.querySelectorAll<HTMLInputElement>('.sec-cell-input');
      if (secInputs[index + 1]) {
        secInputs[index + 1].focus();
        secInputs[index + 1].select();
      }
    } else if (event.key === 'ArrowUp') {
      const secInputs = document.querySelectorAll<HTMLInputElement>('.sec-cell-input');
      if (secInputs[index - 1]) {
        secInputs[index - 1].focus();
        secInputs[index - 1].select();
      }
    }
  }

  onCodeInput(index: number, val: string) {
    this.hasUnsavedChanges.set(true);
    const row = this.rows()[index];
    row.code = val.toUpperCase();

    this.searchSubject.next({ index, term: row.code });
    this.recalculateDuplicates();
  }

  onQuantityChange(index: number) {
    this.hasUnsavedChanges.set(true);
    this.recalculateDuplicates();
  }

  selectSuggestion(index: number, sugg: SuggestionItem) {
    this.saveUndoSnapshot('Sugerencia ' + sugg.code);
    const row = this.rows()[index];
    row.code = sugg.code;
    if (sugg.description && !row.description) {
      row.description = sugg.description;
    }
    row.inCatalog = sugg.source === 'CATALOGO';
    this.patternSuggester.learn(sugg.code);
    this.currentSuggestions.set([]);
    this.hasUnsavedChanges.set(true);
    this.recalculateDuplicates();

    setTimeout(() => {
      const qtyInputs = document.querySelectorAll<HTMLInputElement>('.qty-input');
      if (qtyInputs[index]) {
        qtyInputs[index].focus();
        qtyInputs[index].select();
      }
    }, 40);
  }

  appendChipToActive(chip: string) {
    if (this.activeRowIndex < 0 || this.activeRowIndex >= this.rows().length) {
      if (this.rows().length > 0) this.activeRowIndex = 0;
      else return;
    }
    this.saveUndoSnapshot('Insertar comodín ' + chip);
    const row = this.rows()[this.activeRowIndex];
    if (!row.code) {
      row.code = chip;
    } else {
      row.code = (row.code + ' ' + chip).replace(/\s+/g, ' ');
    }
    this.hasUnsavedChanges.set(true);
    this.recalculateDuplicates();
    this.currentSuggestions.set(this.patternSuggester.suggest(row.code, 8));
  }

  onCodeKeyDown(event: KeyboardEvent, index: number) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const suggs = this.currentSuggestions();
      if (suggs.length > 0 && !this.rows()[index].code.includes(' ')) {
        this.selectSuggestion(index, suggs[0]);
        return;
      }

      const qtyInputs = document.querySelectorAll<HTMLInputElement>('.qty-input');
      if (qtyInputs[index]) {
        qtyInputs[index].focus();
        qtyInputs[index].select();
      }
    } else if (event.key === 'ArrowDown') {
      const codeInputs = document.querySelectorAll<HTMLInputElement>('.cell-input-wrap .cell-input');
      if (codeInputs[index + 1]) {
        codeInputs[index + 1].focus();
      }
    } else if (event.key === 'ArrowUp') {
      const codeInputs = document.querySelectorAll<HTMLInputElement>('.cell-input-wrap .cell-input');
      if (codeInputs[index - 1]) {
        codeInputs[index - 1].focus();
      }
    }
  }

  onQtyKeyDown(event: KeyboardEvent, index: number) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (index === this.rows().length - 1) {
        this.addRowAtEnd();
      }
      setTimeout(() => {
        const codeInputs = document.querySelectorAll<HTMLInputElement>('.cell-input-wrap .cell-input');
        if (codeInputs[index + 1]) {
          codeInputs[index + 1].focus();
        }
      }, 30);
    } else if (event.key === 'ArrowDown') {
      const qtyInputs = document.querySelectorAll<HTMLInputElement>('.qty-input');
      if (qtyInputs[index + 1]) {
        qtyInputs[index + 1].focus();
      }
    } else if (event.key === 'ArrowUp') {
      const qtyInputs = document.querySelectorAll<HTMLInputElement>('.qty-input');
      if (qtyInputs[index - 1]) {
        qtyInputs[index - 1].focus();
      }
    }
  }

  /**
   * Inserts an intermediate row ("en media celda") exactly below the specified index
   */
  insertRowBelow(index: number) {
    this.saveUndoSnapshot(`Insertar fila intermedia abajo de ${index + 1}`);
    const list = [...this.rows()];
    const currentSec = list[index]?.section || '';
    const newRow = this.createEmptyRow(currentSec);
    list.splice(index + 1, 0, newRow);
    this.rows.set(list);
    this.hasUnsavedChanges.set(true);
    this.recalculateDuplicates();

    setTimeout(() => {
      const codeInputs = document.querySelectorAll<HTMLInputElement>('.cell-input-wrap .cell-input');
      if (codeInputs[index + 1]) {
        codeInputs[index + 1].focus();
      }
    }, 40);
  }

  addRowAtEnd() {
    this.saveUndoSnapshot('Agregar fila al final');
    const list = [...this.rows()];
    const lastSec = list.length > 0 ? (list[list.length - 1].section || '') : '';
    const newRow = this.createEmptyRow(lastSec);
    list.push(newRow);
    this.rows.set(list);
    this.hasUnsavedChanges.set(true);
  }

  deleteRow(index: number) {
    const targetCode = this.rows()[index]?.code || 'vacía';
    this.saveUndoSnapshot(`Eliminar fila ${index + 1} (${targetCode})`);
    const list = [...this.rows()];
    list.splice(index, 1);
    if (list.length === 0) list.push(this.createEmptyRow());
    this.rows.set(list);
    this.hasUnsavedChanges.set(true);
    this.recalculateDuplicates();
  }

  clearRowCode(index: number) {
    this.saveUndoSnapshot(`Borrar código en fila ${index + 1}`);
    const row = this.rows()[index];
    row.code = '';
    row.quantity = null;
    this.hasUnsavedChanges.set(true);
    this.recalculateDuplicates();
  }

  removeEmptyRows() {
    this.saveUndoSnapshot('Limpiar filas vacías');
    const list = this.rows().filter(r => r.code && r.code.trim().length > 0);
    if (list.length === 0) list.push(this.createEmptyRow());
    this.rows.set(list);
    this.hasUnsavedChanges.set(true);
    this.recalculateDuplicates();
  }

  recalculateDuplicates() {
    const list = this.rows();
    const map = new Map<string, number[]>();

    list.forEach((r, idx) => {
      const clean = r.code ? r.code.trim().toUpperCase() : '';
      if (clean) {
        if (!map.has(clean)) map.set(clean, []);
        map.get(clean)!.push(idx);
      }
    });

    const allSheetCodes = list.map(r => r.code ? r.code.trim().toUpperCase() : '').filter(c => c.length >= 2);

    list.forEach((r, idx) => {
      const clean = r.code ? r.code.trim().toUpperCase() : '';
      if (clean && map.has(clean) && map.get(clean)!.length > 1) {
        r.isDuplicate = true;
        const otherIndices = map.get(clean)!.filter(i => i !== idx).map(i => `Fila ${i + 1}`);
        r.duplicateInfo = otherIndices.join(', ');
        r.similarAlert = undefined;
      } else {
        r.isDuplicate = false;
        r.duplicateInfo = undefined;

        // Check similar codes (only if not an exact duplicate and not in catalog)
        if (clean.length >= 3 && !r.inCatalog && r.isNew) {
          const otherCodes = allSheetCodes.filter((_, i) => i !== idx);
          const alerts = this.patternSuggester.detectSimilarCodes(clean, otherCodes);
          r.similarAlert = alerts.length > 0 ? alerts[0] : undefined;
        } else {
          r.similarAlert = undefined;
        }
      }
    });
  }

  consolidateDuplicates() {
    this.saveUndoSnapshot('Consolidar duplicados');
    const list = this.rows();
    const map = new Map<string, SheetRow>();

    for (const r of list) {
      const clean = r.code ? r.code.trim().toUpperCase() : '';
      if (!clean) continue;

      if (!map.has(clean)) {
        map.set(clean, { ...r, quantity: r.quantity || 0 });
      } else {
        const existing = map.get(clean)!;
        existing.quantity = (existing.quantity || 0) + (r.quantity || 0);
      }
    }

    const consolidated = Array.from(map.values());
    if (consolidated.length === 0) consolidated.push(this.createEmptyRow());
    this.rows.set(consolidated);
    this.recalculateDuplicates();
    this.hasUnsavedChanges.set(true);
    this.toast.success('Códigos duplicados sumados y consolidados.');
  }

  saveEntireSheet() {
    if (this.selectedShelfId() === 0) {
      this.toast.error('Selecciona un anaquel para guardar.');
      return;
    }

    const validRows = this.rows().filter(r => r.code && r.code.trim().length > 0);
    if (validRows.length === 0) {
      this.toast.error('No hay códigos válidos para guardar.');
      return;
    }

    this.saving.set(true);

    const payload = {
      sessionId: this.selectedSessionId(),
      shelfId: this.selectedShelfId(),
      rows: validRows.map(r => ({
        id: r.id,
        section: (r.section || '').trim().toUpperCase(),
        code: r.code.trim().toUpperCase(),
        description: (r.description || '').trim(),
        quantity: r.quantity !== null && r.quantity !== undefined ? Number(r.quantity) : 0,
        notes: r.notes
      }))
    };

    this.api.batchSaveSheet(payload).subscribe({
      next: (savedRecords) => {
        this.saving.set(false);
        this.hasUnsavedChanges.set(false);
        this.toast.success(`Cédula guardada con éxito: ${savedRecords.length} partidas registradas.`);
        const newlyLearned = this.patternSuggester.learnFromMaterials(savedRecords.map(s => s.capturedCode));
        this.quickChips = this.patternSuggester.getQuickChips();
        if (newlyLearned > 0) {
          this.toast.info(`Sistema autodidacta: ${newlyLearned} atajo(s)/medida(s) nuevas aprendidas de esta captura.`);
        }
        this.loadShelfCounts(this.selectedSessionId(), this.selectedShelfId());
      },
      error: (err) => {
        this.saving.set(false);
        this.toast.error('Error al guardar la cédula: ' + (err.error?.message || err.message));
      }
    });
  }

  onTablePaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text');
    if (text && (text.includes('\t') || text.includes('\n'))) {
      event.preventDefault();
      this.parseAndInsertPastedRows(text);
    }
  }

  openPasteModal() {
    this.pasteContent = '';
    this.showPasteModal = true;
  }

  processPastedData() {
    if (!this.pasteContent.trim()) {
      this.showPasteModal = false;
      return;
    }
    this.parseAndInsertPastedRows(this.pasteContent);
    this.showPasteModal = false;
  }

  parseAndInsertPastedRows(rawText: string) {
    this.saveUndoSnapshot('Pegar renglones');
    const lines = rawText.split(/\r?\n/).filter(l => l.trim().length > 0);
    const newItems: SheetRow[] = [];

    let secCol = -1;
    let codeCol = -1;
    let qtyCol = -1;

    for (const line of lines) {
      const parts = (line.includes('\t') ? line.split('\t') : line.split(/[,;]/))
        .map(p => p.trim());
      if (parts.length === 0 || parts.every(p => p.length === 0)) continue;

      // Header detection:
      let isHeader = false;
      for (let c = 0; c < parts.length; c++) {
        const cu = parts[c].toUpperCase();
        if (cu === 'SECCION' || cu === 'SECCIÓN' || cu === 'NIVEL' || cu === 'SEC' || cu.includes('NIVEL (A-')) {
          isHeader = true;
          secCol = c;
        }
        if ((cu.includes('CVE') || cu.includes('COD') || cu.includes('ART') || cu.includes('CLAVE')) && !cu.includes('ESQ')) {
          isHeader = true;
          codeCol = c;
        }
        if (cu.includes('CANT') || cu.includes('PIEZA') || cu.includes('QTY') || cu.includes('TOTAL') || cu.includes('FISIC') || cu.includes('FÍSIC') || cu.includes('EXISTENCIA')) {
          isHeader = true;
          qtyCol = c;
        }
      }
      if (isHeader) continue; // Skip header line!

      // If columns not determined from header, detect by structure:
      let sCol = secCol;
      let cCol = codeCol;
      let qCol = qtyCol;

      if (cCol < 0 || qCol < 0) {
        if (parts.length >= 5 && (parts[0].toUpperCase() === 'A' || parts[1].toUpperCase() === 'P')) {
          // Aspel SAE 5-column format: ESTATUS, TIPO, CLAVE, ESQ, EXISTENCIA FÍSICA
          cCol = 2;
          qCol = 4;
        } else if (parts.length === 3 && /^[A-Ga-g]$/.test(parts[0])) {
          // 3 columns: SECCION (A-G), CODIGO, CANTIDAD
          sCol = 0;
          cCol = 1;
          qCol = 2;
        } else if (parts.length >= 3) {
          cCol = 0;
          qCol = 2;
        } else if (parts.length === 2) {
          cCol = 0;
          qCol = 1;
        } else {
          cCol = 0;
          qCol = -1;
        }
      }

      if (cCol >= parts.length) continue;
      const code = parts[cCol]?.trim().toUpperCase().replace(/["']/g, '');
      if (!code) continue;

      // Filter out header words that might slip through
      if (code === 'CLAVE' || code === 'CVE' || code === 'CVE_ART' || code === 'CODIGO' || code === 'ESTATUS' || code.includes('TIPO DE ELEMENTO')) {
        continue;
      }

      let secVal = '';
      if (sCol >= 0 && sCol < parts.length && parts[sCol]) {
        const cleanedSec = parts[sCol].trim().toUpperCase();
        if (/^[A-G]$/.test(cleanedSec)) {
          secVal = cleanedSec;
        }
      }

      let qty = 1;
      if (qCol >= 0 && qCol < parts.length && parts[qCol]) {
        const parsed = parseFloat(parts[qCol].replace(/[^0-9.]/g, ''));
        if (!isNaN(parsed)) qty = parsed;
      }

      newItems.push({
        tempId: 'paste_' + Math.random().toString(36).substring(2, 9),
        section: secVal,
        code,
        quantity: qty,
        unit: 'PZA',
        inCatalog: true,
        isNew: true
      });
    }

    if (newItems.length > 0) {
      const existing = this.rows().filter(r => r.code && r.code.trim().length > 0);
      this.rows.set([...existing, ...newItems, this.createEmptyRow()]);
      this.recalculateDuplicates();
      this.hasUnsavedChanges.set(true);
      this.patternSuggester.learnBulk(newItems.map(i => i.code));
      this.toast.success(`Se insertaron ${newItems.length} renglones de Excel correctamente.`);
    }
  }

  /**
   * Export only the current selected shelf for Aspel SAE
   */
  exportCurrentShelf(format: 'CSV' | 'TXT') {
    if (this.selectedShelfId() === 0) return;
    this.api.downloadSaeExport(this.selectedSessionId(), format, 'IMPORT', this.selectedShelfId()).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SAE_ANAQUEL_${this.currentShelf()?.shelfCode || 'GENERAL'}.${format.toLowerCase()}`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.success(`Archivo de anaquel ${this.currentShelf()?.shelfCode} generado para SAE.`);
      },
      error: (err) => this.toast.error('Error al exportar anaquel: ' + (err.error?.message || err.message))
    });
  }

  /**
   * Export all shelves consolidated in one master file for Aspel SAE PIs (Partidas de Inventario)
   */
  exportGlobalConsolidated(format: 'CSV' | 'TXT') {
    if (this.selectedSessionId() === 0) return;
    this.api.downloadSaeExport(this.selectedSessionId(), format, 'IMPORT').subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SAE_CONSOLIDADO_GLOBAL_${this.currentSession()?.folio || 'INVENTARIO'}.${format.toLowerCase()}`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.toast.success(`Archivo Consolidado Global descargado (listo para Partidas de Inventario en SAE).`);
      },
      error: (err) => this.toast.error('Error al exportar consolidado: ' + (err.error?.message || err.message))
    });
  }

  markAsSuccess() {
    if (this.hasUnsavedChanges()) {
      this.toast.warning('Primero guarda la cédula antes de marcar como éxito.');
      return;
    }
    const sessionId = this.selectedSessionId();
    this.api.updateSessionStatus(sessionId, 'CERRADO_EXITO', 'Conteo finalizado y validado para importación SAE').subscribe({
      next: () => {
        this.toast.success('Cédula cerrada y protegida CON ÉXITO para Aspel SAE.');
        this.loadSessions();
      },
      error: (err) => this.toast.error('Error al marcar éxito: ' + (err.error?.message || err.message))
    });
  }

  markAsPendingReview() {
    const sessionId = this.selectedSessionId();
    this.api.updateSessionStatus(sessionId, 'POR_VALIDAR', 'En revisión técnica').subscribe({
      next: () => {
        this.toast.info('Cédula marcada PENDIENTE DE REVISIÓN.');
        this.loadSessions();
      },
      error: (err) => this.toast.error('Error: ' + (err.error?.message || err.message))
    });
  }

  openReopenModal() {
    this.reopenReason = '';
    this.showReopenModal = true;
  }

  submitReopenSession() {
    if (!this.reopenReason || this.reopenReason.trim().length < 4) {
      this.toast.error('Ingresa un motivo para reabrir la cédula.');
      return;
    }
    const sessionId = this.selectedSessionId();
    this.api.reopenSession(sessionId, this.reopenReason).subscribe({
      next: () => {
        this.showReopenModal = false;
        this.toast.success('Cédula reabierta con éxito. Lista de materiales desbloqueada.');
        this.loadSessions();
        if (this.selectedShelfId() > 0) {
          this.loadShelfCounts(sessionId, this.selectedShelfId());
        }
      },
      error: (err) => this.toast.error('Error al reabrir: ' + (err.error?.message || err.message))
    });
  }

  openCreateSessionModal() {
    this.newSessionTitle = '';
    this.newSessionWarehouse = '1';
    this.newSessionNotes = '';
    this.showCreateSessionModal = true;
  }

  submitCreateSession() {
    if (!this.newSessionTitle.trim()) {
      this.toast.error('Ingresa un título para el inventario.');
      return;
    }
    this.api.createSession({
      title: this.newSessionTitle,
      warehouseCode: this.newSessionWarehouse,
      notes: this.newSessionNotes
    }).subscribe({
      next: (created) => {
        this.showCreateSessionModal = false;
        this.toast.success(`Folio ${created.folio} creado con éxito.`);
        this.loadSessions();
      },
      error: (err) => this.toast.error('Error al crear sesión: ' + (err.error?.message || err.message))
    });
  }

  openImportExcelModal() {
    this.selectedExcelFile = null;
    this.importResult = null;
    this.isDraggingFile.set(false);
    this.importMode.set('SMART_MERGE');
    this.importTargetShelfId.set(this.selectedShelfId() > 0 ? this.selectedShelfId() : 0);
    this.showImportExcelModal = true;
  }

  closeImportExcelModal() {
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

  onFileSelectedForImport(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedExcelFile = input.files[0];
      this.importResult = null;
    }
  }

  onDragOverImport(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingFile.set(true);
  }

  onDragLeaveImport(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingFile.set(false);
  }

  onDropImport(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingFile.set(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      const f = files[0];
      const lower = f.name.toLowerCase();
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) {
        this.selectedExcelFile = f;
        this.importResult = null;
      } else {
        this.toast.warning('Formato no soportado. Usa un archivo .xlsx, .xls o .csv.');
      }
    }
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
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        this.toast.success('Plantilla oficial con columna Nivel (A-G) descargada.');
      },
      error: (err) => {
        this.downloadingTemplate.set(false);
        this.toast.error('Error al descargar plantilla: ' + (err.error?.message || err.message));
      }
    });
  }

  submitImportExcel() {
    if (!this.selectedExcelFile) {
      this.toast.error('Selecciona un archivo Excel (.xlsx o .csv).');
      return;
    }
    const sessionId = this.selectedSessionId();
    if (!sessionId || sessionId === 0) {
      this.toast.error('Selecciona o crea una sesión de inventario primero.');
      return;
    }

    const shelfParam = this.importTargetShelfId() > 0 ? this.importTargetShelfId() : undefined;
    const mode = this.importMode();
    this.importingExcel.set(true);
    this.api.importExcelCounts(sessionId, this.selectedExcelFile, shelfParam, mode).subscribe({
      next: (res) => {
        this.importingExcel.set(false);
        this.importResult = res;
        this.toast.success(
          `Importación exitosa: ${res.addedRecords ?? res.importedRecords} nuevos, ${res.updatedRecords ?? 0} actualizados (${res.totalPieces} pzas).`
        );
        this.loadShelvesForSession(sessionId, this.selectedShelfId());
        if (this.selectedShelfId() > 0) {
          this.loadShelfCounts(sessionId, this.selectedShelfId());
        }
      },
      error: (err) => {
        this.importingExcel.set(false);
        this.toast.error('Error al importar Excel: ' + (err.error?.message || err.message));
      }
    });
  }

  currentStatusClass(): string {
    const status = this.currentSession()?.status;
    if (status === 'CERRADO_EXITO') return 'status-exito';
    if (status === 'POR_VALIDAR') return 'status-revision';
    if (status === 'REABIERTO') return 'status-reabierto';
    return 'status-conteo';
  }

  currentStatusLabel(): string {
    const status = this.currentSession()?.status;
    if (status === 'CERRADO_EXITO') return 'Cerrado con Éxito SAE';
    if (status === 'POR_VALIDAR') return 'Pendiente en Revisión';
    if (status === 'REABIERTO') return 'Reabierto para Conteo';
    return 'En Conteo Físico';
  }
}
